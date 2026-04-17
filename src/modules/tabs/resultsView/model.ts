import type {
  AuditConsistencyInfo,
  AuditFlag,
  AuditRecord,
  InvestmentsSummary,
  ParsedMoveItem,
  WeeklyMoveCardItem,
} from "../../../types/index.js";

import { parseCurrency } from "../../utils/formatting.js";

export interface ActionPreviewRow {
  label: string;
  amount: string;
  date: string;
  detail: string;
  route: string;
}

export interface AllocationLedgerEntry {
  label: string;
  value: string;
}

export interface FreedomJourneyMetric {
  key: string;
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral";
}

export interface TacticalPlaybookData {
  items: ParsedMoveItem[];
  fallbackSource: "structured-weekly-moves" | "legacy-weekly-moves" | "section-moves" | null;
}

export interface AuditHandlingNotes {
  content: string;
  badgeLabel: string | null;
  accentColor: string | null;
}

function formatMoveItemAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return `$${value.toFixed(2)}`;
  const parsed = parseCurrency(value);
  if (parsed != null) return `$${parsed.toFixed(2)}`;
  const text = String(value || "").trim();
  if (!text) return "";
  return text.startsWith("$") ? text : `$${text}`;
}

function extractDueDate(text: string | null | undefined) {
  const match = String(text || "").match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return match?.[1] || "";
}

export function buildActionPreviewRows(moveItems: ParsedMoveItem[] = []): ActionPreviewRow[] {
  return moveItems
    .filter((item) => {
      const amount = parseCurrency(item?.amount);
      return Number.isFinite(amount) && Math.abs(amount || 0) > 0;
    })
    .slice(0, 4)
    .map((item) => ({
      label: String(item?.targetLabel || item?.title || item?.text || "Action").trim(),
      amount: formatMoveItemAmount(item?.amount),
      date: extractDueDate(String(item?.detail || item?.text || "")),
      detail: String(item?.detail || item?.text || "").trim(),
      route: String(item?.fundingLabel || item?.routeLabel || "").trim(),
    }));
}

function normalizeMoveLine(text: string | null | undefined) {
  return String(text || "")
    .replace(/^\s*(?:[-*•]\s+|\d+\.\s+|\[\s*\]\s+)/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeExistingMoveItems(moveItems: ParsedMoveItem[] = []) {
  return moveItems
    .map((item) => {
      const amount = parseCurrency(item?.amount);
      return {
        ...item,
        done: Boolean(item?.done),
        text: normalizeMoveLine(item?.text || item?.detail || item?.title || ""),
        title: normalizeMoveLine(item?.title || item?.targetLabel || item?.text || ""),
        detail: normalizeMoveLine(item?.detail || ""),
        ...(amount != null ? { amount } : {}),
      };
    })
    .filter((item) => item.text || item.title);
}

function buildFallbackMoveFromStructured(item: WeeklyMoveCardItem): ParsedMoveItem | null {
  const title = normalizeMoveLine(item?.title || item?.detail || "");
  const detail = normalizeMoveLine(item?.detail || item?.title || "");
  const text = normalizeMoveLine(detail || title);
  if (!text) return null;
  const amount = parseCurrency(item?.amount);
  return {
    done: false,
    text,
    title: title || text,
    detail: detail && detail !== title ? detail : "",
    ...(amount != null ? { amount } : {}),
    tag: item?.priority ? String(item.priority).toUpperCase() : null,
    semanticKind: null,
    targetLabel: null,
    sourceLabel: null,
    routeLabel: null,
    fundingLabel: null,
    targetKey: null,
    contributionKey: null,
    transactional: false,
  };
}

function buildFallbackMoveFromText(text: string): ParsedMoveItem | null {
  const cleaned = normalizeMoveLine(text);
  if (!cleaned) return null;
  const amount = parseCurrency(cleaned);
  return {
    done: false,
    text: cleaned,
    title: cleaned,
    detail: "",
    ...(amount != null ? { amount } : {}),
    tag: null,
    semanticKind: null,
    targetLabel: null,
    sourceLabel: null,
    routeLabel: null,
    fundingLabel: null,
    targetKey: null,
    contributionKey: null,
    transactional: false,
  };
}

function dedupeMoveItems(moveItems: ParsedMoveItem[]) {
  const seen = new Set<string>();
  return moveItems.filter((item) => {
    const key = `${String(item?.title || "").toLowerCase()}|${String(item?.detail || item?.text || "").toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildTacticalPlaybookData({
  moveItems = [],
  structuredWeeklyMoves = [],
  weeklyMoves = [],
  sectionMoves = "",
}: {
  moveItems?: ParsedMoveItem[];
  structuredWeeklyMoves?: WeeklyMoveCardItem[];
  weeklyMoves?: string[];
  sectionMoves?: string | null | undefined;
}): TacticalPlaybookData {
  const explicitItems = dedupeMoveItems(normalizeExistingMoveItems(moveItems));
  if (explicitItems.length > 0) {
    return { items: explicitItems, fallbackSource: null };
  }

  const structuredItems = dedupeMoveItems(
    (structuredWeeklyMoves || []).map(buildFallbackMoveFromStructured).filter((item): item is ParsedMoveItem => Boolean(item))
  );
  if (structuredItems.length > 0) {
    return { items: structuredItems, fallbackSource: "structured-weekly-moves" };
  }

  const legacyItems = dedupeMoveItems(
    (weeklyMoves || []).map(buildFallbackMoveFromText).filter((item): item is ParsedMoveItem => Boolean(item))
  );
  if (legacyItems.length > 0) {
    return { items: legacyItems, fallbackSource: "legacy-weekly-moves" };
  }

  const sectionItems = dedupeMoveItems(
    String(sectionMoves || "")
      .split(/\n+/)
      .map(buildFallbackMoveFromText)
      .filter((item): item is ParsedMoveItem => Boolean(item))
  );
  if (sectionItems.length > 0) {
    return { items: sectionItems, fallbackSource: "section-moves" };
  }

  return { items: [], fallbackSource: null };
}

export function cleanAllocationLead(detail: string | null | undefined) {
  const text = String(detail || "");
  if (!text) return "";
  const withoutFiller = text.replace(/[^.]*only dollars left after those allocations can go to debt payoff or savings\.?/i, "");
  const withoutRows = withoutFiller
    .replace(/([^,.;]+?)\s*\(\$[\d,]+(?:\.\d{2})?\s+by\s+\d{4}-\d{2}-\d{2}\)/g, "")
    .replace(/\s+,/g, ",");
  const cleaned = withoutRows
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*\./g, ".")
    .replace(/^[^a-z0-9$]+/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[,:;]\s*$/, "")
    .trim();
  return /[a-z0-9]/i.test(cleaned) ? cleaned : "";
}

export function buildAllocationLedger(consistency: AuditConsistencyInfo | null | undefined): AllocationLedgerEntry[] {
  const safeConsistency = consistency || {};
  const rows: AllocationLedgerEntry[] = [];
  if (Number.isFinite(Number(safeConsistency.currentLiquidCash))) {
    rows.push({ label: "Liquid now", value: formatMoveItemAmount(Number(safeConsistency.currentLiquidCash)) });
  }
  if (Number.isFinite(Number(safeConsistency.protectedAllocatedNow)) && Number(safeConsistency.protectedAllocatedNow) > 0) {
    rows.push({ label: "Protected now", value: formatMoveItemAmount(Number(safeConsistency.protectedAllocatedNow)) });
  }
  if (Number.isFinite(Number(safeConsistency.optionalAllocatedNow)) && Number(safeConsistency.optionalAllocatedNow) > 0) {
    rows.push({ label: "Optional deploy", value: formatMoveItemAmount(Number(safeConsistency.optionalAllocatedNow)) });
  }
  const parkedCash =
    (Number.isFinite(Number(safeConsistency.remainingCheckingPool)) ? Number(safeConsistency.remainingCheckingPool) : 0) +
    (Number.isFinite(Number(safeConsistency.remainingVaultPool)) ? Number(safeConsistency.remainingVaultPool) : 0);
  if (parkedCash > 0) {
    rows.push({ label: "Still parked", value: formatMoveItemAmount(parkedCash) });
  }
  if (Number.isFinite(Number(safeConsistency.protectedGapNow)) && Number(safeConsistency.protectedGapNow) > 0) {
    rows.push({ label: "Protected gap", value: formatMoveItemAmount(Number(safeConsistency.protectedGapNow)) });
  }
  return rows.slice(0, 5);
}

export function buildResultsInvestmentsSummary(
  audit: AuditRecord | null,
  parsedInvestments: InvestmentsSummary | undefined
) {
  const submittedInvestmentSnapshot = audit?.form?.investmentSnapshot || {};
  const explicitInvestmentValues = {
    roth: parseCurrency(submittedInvestmentSnapshot?.roth ?? audit?.form?.roth),
    brokerage: parseCurrency(submittedInvestmentSnapshot?.brokerage ?? audit?.form?.brokerage),
    k401: parseCurrency(submittedInvestmentSnapshot?.k401Balance ?? audit?.form?.k401Balance),
  };
  const submittedInvestmentKeyList = Array.isArray(audit?.form?.includedInvestmentKeys)
    ? audit.form.includedInvestmentKeys.map((key) => String(key || ""))
    : [];
  const visibleInvestmentKeys = new Set(
    submittedInvestmentKeyList.length > 0
      ? submittedInvestmentKeyList
      : Object.entries(explicitInvestmentValues)
          .filter(([, value]) => value != null && Math.abs(value) > 0)
          .map(([key]) => key)
  );
  const hasSubmittedInvestmentSnapshot =
    submittedInvestmentKeyList.length > 0 || Object.values(explicitInvestmentValues).some((value) => value != null);
  const visibleInvestmentTotal =
    (visibleInvestmentKeys.has("roth") ? explicitInvestmentValues.roth || 0 : 0) +
    (visibleInvestmentKeys.has("brokerage") ? explicitInvestmentValues.brokerage || 0 : 0) +
    (visibleInvestmentKeys.has("k401") ? explicitInvestmentValues.k401 || 0 : 0);
  const parsedInvestmentBalance = parseCurrency(parsedInvestments?.balance) || 0;

  const investmentsSummary =
    parsedInvestments && hasSubmittedInvestmentSnapshot
      ? {
          ...parsedInvestments,
          balance: `$${visibleInvestmentTotal.toFixed(2)}`,
          asOf: audit?.form?.date || parsedInvestments?.asOf || "N/A",
          netWorth:
            visibleInvestmentTotal > 0 && Math.abs(parsedInvestmentBalance - visibleInvestmentTotal) > 1
              ? undefined
              : parsedInvestments?.netWorth,
        }
      : parsedInvestments || null;

  const showInvestmentNetWorthAnchor =
    Boolean(investmentsSummary?.netWorth) &&
    !/^-?\$?0(?:\.00)?$/i.test(String(investmentsSummary?.netWorth || "").replace(/\s+/g, ""));

  return {
    investmentsSummary,
    showInvestmentNetWorthAnchor,
  };
}

export function buildAnalysisNotes(
  isDegraded: boolean,
  sections: { qualityScore?: string; autoUpdates?: string } | null | undefined,
  degradedReason: string | null | undefined
) {
  if (!isDegraded) return "";
  return [sections?.qualityScore, sections?.autoUpdates, degradedReason]
    .filter((entry): entry is string => Boolean(entry && entry.trim()))
    .join("\n\n");
}

function pushUniqueNote(target: string[], value: string | null | undefined) {
  const cleaned = normalizeMoveLine(String(value || "").replace(/\.$/, "").trim());
  if (!cleaned) return;
  if (target.some((entry) => entry.toLowerCase() === cleaned.toLowerCase())) return;
  target.push(cleaned);
}

export function buildAuditHandlingNotes({
  isDegraded,
  sections,
  degradedReason,
  auditFlags = [],
  consistency,
}: {
  isDegraded: boolean;
  sections?: { qualityScore?: string; autoUpdates?: string } | null;
  degradedReason?: string | null | undefined;
  auditFlags?: AuditFlag[] | null | undefined;
  consistency?: AuditConsistencyInfo | null | undefined;
}): AuditHandlingNotes {
  const notes: string[] = [];
  const flagCodes = new Set((auditFlags || []).map((flag) => String(flag?.code || "")));
  const meaningfulQualityScore = String(sections?.qualityScore || "").trim();
  const meaningfulAutoUpdates = String(sections?.autoUpdates || "").trim();

  if (isDegraded) {
    pushUniqueNote(notes, degradedReason || "Full AI narrative was unavailable, so Catalyst rendered the native fallback audit.");
    if (meaningfulQualityScore && !/strict json mode active/i.test(meaningfulQualityScore)) {
      pushUniqueNote(notes, meaningfulQualityScore);
    }
    if (meaningfulAutoUpdates && !/handled natively via json output/i.test(meaningfulAutoUpdates)) {
      pushUniqueNote(notes, meaningfulAutoUpdates);
    }
  }

  if (consistency?.scoreAnchoredToNative || flagCodes.has("health-score-reanchored-to-native")) {
    pushUniqueNote(notes, "Health score was re-anchored to Catalyst's native math before rendering.");
  }
  if (consistency?.statusCorrected || flagCodes.has("status-corrected-to-native-risk")) {
    pushUniqueNote(notes, "Overall audit status was corrected to match deterministic risk signals.");
  }
  if (consistency?.dashboardRepaired || flagCodes.has("dashboard-repaired-to-native-anchors")) {
    pushUniqueNote(notes, "Dashboard totals were rebuilt from native cash and debt anchors because the model output drifted.");
  }
  if (
    consistency?.deterministicPlanReanchored ||
    consistency?.weeklyMovesBackfilled ||
    consistency?.nextActionBackfilled ||
    flagCodes.has("weekly-moves-reanchored-to-allocation-plan") ||
    flagCodes.has("next-action-reanchored-to-allocation-plan")
  ) {
    pushUniqueNote(notes, "The weekly move plan was normalized against Catalyst's deterministic allocation engine before display.");
  }
  if (
    consistency?.investmentSummaryRepaired ||
    consistency?.investmentGateRepaired ||
    flagCodes.has("investments-summary-repaired") ||
    flagCodes.has("investment-gate-repaired")
  ) {
    pushUniqueNote(notes, "Investment totals or gate status were corrected to the balances included in this audit.");
  }

  for (const flag of (auditFlags || []).filter((entry) => entry && entry.severity !== "low").slice(0, 2)) {
    pushUniqueNote(notes, flag.message);
  }

  if (notes.length === 0) {
    return { content: "", badgeLabel: null, accentColor: null };
  }

  return {
    content: notes.map((note) => `- ${note}.`).join("\n"),
    badgeLabel: isDegraded ? "Fallback" : "Normalized",
    accentColor: isDegraded ? "amber" : "teal",
  };
}

function getTotalDebtValue(audit: AuditRecord) {
  return (audit.form?.debts || []).reduce((sum, debt) => sum + (parseFloat(String(debt.balance)) || 0), 0);
}

export function buildFreedomJourneyMetrics(history: AuditRecord[] = []): FreedomJourneyMetric[] {
  const realAudits = history.filter((item) => !item.isTest && item.form);
  if (realAudits.length < 2) return [];

  const latest = realAudits[0];
  const previous = realAudits[1];
  if (!latest || !previous) return [];

  const metrics: FreedomJourneyMetric[] = [];
  const debtValues = realAudits
    .slice(0, 4)
    .map(getTotalDebtValue)
    .reverse();
  const firstDebtValue = debtValues[0];
  const lastDebtValue = debtValues[debtValues.length - 1];
  if (debtValues.length >= 2 && firstDebtValue !== undefined && lastDebtValue !== undefined && firstDebtValue > 100) {
    const weeklyPaydown = (firstDebtValue - lastDebtValue) / (debtValues.length - 1);
    if (weeklyPaydown > 10) {
      const freeDate = new Date();
      freeDate.setDate(freeDate.getDate() + Math.ceil(lastDebtValue / weeklyPaydown) * 7);
      metrics.push({
        key: "debt-free",
        label: "Projected Debt-Free",
        value: freeDate.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
        tone: "positive",
      });
    }
  }

  const latestNetWorth = latest.parsed?.netWorth;
  const previousNetWorth = previous.parsed?.netWorth;
  if (latestNetWorth != null && previousNetWorth != null) {
    const delta = latestNetWorth - previousNetWorth;
    const up = delta >= 0;
    metrics.push({
      key: "net-worth",
      label: "Net Worth vs Last Audit",
      value: `${up ? "+" : "-"}$${Math.abs(delta).toLocaleString()}`,
      tone: up ? "positive" : "negative",
    });
  }

  const latestScore = latest.parsed?.healthScore?.score;
  const previousScore = previous.parsed?.healthScore?.score;
  if (latestScore != null && previousScore != null && Math.abs(latestScore - previousScore) >= 2) {
    const factors: Array<{ name: string; delta: number }> = [];
    const latestChecking = parseFloat(String(latest.form.checking)) || 0;
    const previousChecking = parseFloat(String(previous.form.checking)) || 0;
    if (Math.abs(latestChecking - previousChecking) > 100) {
      factors.push({ name: "Cash Flow", delta: latestChecking - previousChecking });
    }
    const latestDebt = getTotalDebtValue(latest);
    const previousDebt = getTotalDebtValue(previous);
    if (Math.abs(latestDebt - previousDebt) > 50) {
      factors.push({ name: "Debt Paydown", delta: previousDebt - latestDebt });
    }
    const latestSavings = parseFloat(String(latest.form.ally || latest.form.savings)) || 0;
    const previousSavings = parseFloat(String(previous.form.ally || previous.form.savings)) || 0;
    if (Math.abs(latestSavings - previousSavings) > 50) {
      factors.push({ name: "Savings Growth", delta: latestSavings - previousSavings });
    }

    if (factors.length > 0) {
      const biggest = [...factors].sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))[0];
      const diff = latestScore - previousScore;
      if (biggest) {
        metrics.push({
          key: "score-driver",
          label: `Score Movement (${diff > 0 ? "+" : ""}${diff})`,
          value: `Driven by ${biggest.name}`,
          tone: diff > 0 ? "positive" : "negative",
        });
      }
    }
  }

  return metrics;
}
