import type { AuditConsistencyInfo, AuditRecord, InvestmentsSummary, ParsedMoveItem } from "../../../types/index.js";

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

function formatMoveItemAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return `$${value.toFixed(2)}`;
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
      const amount = typeof item?.amount === "number" ? item.amount : null;
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
