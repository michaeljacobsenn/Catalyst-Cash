import { clamp, getGradeLetter } from "../mathHelpers.js";
import {
  CANONICAL_DASHBOARD_CATEGORIES,
  sanitizeVisibleAuditCopy,
  SUPPLEMENTAL_DASHBOARD_CATEGORIES,
} from "./auditText.js";
import { fmt, parseCurrency } from "./formatting.js";

export function extractDollarAmountTotal(lines) {
  if (!Array.isArray(lines)) return 0;
  return lines.reduce((sum, line) => {
    if (typeof line !== "string") return sum;
    const matches = line.match(/\$[\d,]+(?:\.\d{1,2})?/g) || [];
    return (
      sum +
      matches.reduce((lineSum, match) => {
        const amount = parseCurrency(match);
        return lineSum + (amount != null ? Math.max(0, amount) : 0);
      }, 0)
    );
  }, 0);
}

export function extractOperationalAllocationTotal(moveItems) {
  if (!Array.isArray(moveItems)) return 0;
  return moveItems.reduce((sum, item) => {
    if (!item || typeof item !== "object") return sum;
    const amount = Number(item.amount);
    if (!Number.isFinite(amount) || amount <= 0) return sum;
    if (item.transactional === true) return sum + amount;
    return sum;
  }, 0);
}

function normalizeTrend(value) {
  return value === "up" || value === "down" || value === "flat" ? value : "flat";
}

export function normalizeHealthScore(rawHealthScore) {
  if (!rawHealthScore || typeof rawHealthScore !== "object") {
    return { value: null, gradeCorrected: false, originalGrade: null };
  }
  const numericScore = Number(rawHealthScore.score);
  if (!Number.isFinite(numericScore)) {
    return { value: null, gradeCorrected: false, originalGrade: null };
  }
  const score = clamp(Math.round(numericScore), 0, 100);
  const originalGrade = typeof rawHealthScore.grade === "string" ? rawHealthScore.grade.trim() : null;
  const normalizedGrade = getGradeLetter(score);
  return {
    value: {
      ...rawHealthScore,
      score,
      grade: normalizedGrade,
      trend: normalizeTrend(rawHealthScore.trend),
      summary: typeof rawHealthScore.summary === "string" ? rawHealthScore.summary.trim() : "",
    },
    gradeCorrected: !!originalGrade && originalGrade !== normalizedGrade,
    originalGrade,
  };
}

export function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export function normalizeHeaderCard(value) {
  if (!value || typeof value !== "object") {
    return { status: "UNKNOWN", title: "", subtitle: "", confidence: null, details: [], headline: "" };
  }

  const details = Array.isArray(value.details)
    ? value
        .details
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];

  return {
    status: normalizeAuditStatus(value.status || value.headline || value.title),
    title: typeof value.title === "string" ? value.title.trim() : "",
    subtitle: typeof value.subtitle === "string" ? value.subtitle.trim() : "",
    confidence:
      value.confidence === "high" || value.confidence === "medium" || value.confidence === "low"
        ? value.confidence
        : null,
    details,
    headline: typeof value.headline === "string" ? value.headline.trim() : "",
  };
}

export function normalizeAlertEntries(value) {
  if (!Array.isArray(value)) return { lines: [], items: [] };

  const items = value
    .map((entry) => {
      if (typeof entry === "string") {
        const text = entry.trim();
        return text ? { level: "warn", title: text, detail: text } : null;
      }
      if (!entry || typeof entry !== "object") return null;
      const title = typeof entry.title === "string" ? entry.title.trim() : "";
      const detail = typeof entry.detail === "string" ? sanitizeVisibleAuditCopy(entry.detail) : title;
      const level = typeof entry.level === "string" ? entry.level.trim().toLowerCase() : "warn";
      if (!title && !detail) return null;
      return {
        level: level || "warn",
        title: sanitizeVisibleAuditCopy(title || detail),
        detail: sanitizeVisibleAuditCopy(detail || title),
      };
    })
    .filter(Boolean);

  return {
    items,
    lines: items.map((item) => {
      const prefix = item.level === "critical" ? "Critical:" : item.level === "info" ? "Info:" : "Alert:";
      return `${prefix} ${item.title}${item.detail && item.detail !== item.title ? ` — ${item.detail}` : ""}`;
    }),
  };
}

export function sanitizeAllocationLabel(value) {
  return String(value || "")
    .replace(/^["'`,.\s]+|["'`,.\s]+$/g, "")
    .replace(/^hold extra debt paydown and reserve cash for\s+/i, "")
    .replace(/^allocate (?:the )?(?:full )?\$?[\d,]+(?:\.\d{2})?\s+(?:of )?(?:deployable|protected)\s+cash\s+(?:in order:|to)\s*/i, "")
    .replace(/^(?:protect|reserve|set aside|withhold|keep|hold)\s+(?:extra\s+)?(?:cash\s+)?(?:for\s+)?/i, "")
    .replace(/\s+(?:by|due)\s+\d{4}-\d{2}-\d{2}\.?$/i, "")
    .replace(/\s*\(\$[\d,]+(?:\.\d{2})?\s+(?:by|due)\s+\d{4}-\d{2}-\d{2}\)\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,;:\-–—\s]+|[,;:\-–—\s]+$/g, "")
    .trim() || "Upcoming obligation";
}

export function inferReserveAccountLabel(label) {
  const normalized = String(label || "").toLowerCase();
  if (/\btax\b|\bescrow\b|\btrip\b|\binsurance\b|\bgifts?\b|\bholiday\b/.test(normalized)) return "Vault";
  return "Checking";
}

export function buildReserveRouteLabel(sourceLabel) {
  if (sourceLabel === "Vault") return "Checking → Vault";
  if (sourceLabel) return `Keep in ${sourceLabel}`;
  return "";
}

export function buildReserveInstruction({ sourceLabel, targetLabel, amount, due }) {
  const label = sanitizeAllocationLabel(targetLabel);
  const normalizedAmount = typeof amount === "string" ? amount : fmt(parseCurrency(amount) || 0);
  if (sourceLabel === "Vault") {
    return `Transfer ${normalizedAmount} from Checking to Vault for ${label}. Leave it reserved there until ${due}.`;
  }
  if (sourceLabel === "Checking") {
    return `Keep ${normalizedAmount} in Checking for ${label}. It is reserved for ${due}.`;
  }
  return `Keep ${normalizedAmount} in ${sourceLabel || "cash"} for ${label}. It is reserved for ${due}.`;
}

export function normalizeWeeklyMoveEntries(value) {
  if (!Array.isArray(value)) return { weeklyMoves: [], moveItems: [], moveCards: [] };

  const extractCompoundAllocationRows = (text) => {
    const source = String(text || "");
    if (!source) return [];
    const pattern = /([^,.;]+?)\s*\(\$([\d,]+(?:\.\d{2})?)\s+by\s+(\d{4}-\d{2}-\d{2})\)/g;
    const rows = [];
    let match;
    while ((match = pattern.exec(source)) !== null) {
      rows.push({
        label: match[1].replace(/\s+/g, " ").trim().replace(/^[-–—]\s*/, ""),
        amount: `$${match[2]}`,
        date: match[3],
      });
    }
    return rows;
  };

  const moveCards = value
    .flatMap((item) => {
      if (typeof item === "string") {
        const text = item.trim();
        return text
          ? {
              title: text,
              detail: text,
              amount: null,
              priority: null,
              tag: null,
              semanticKind: null,
              targetLabel: null,
              sourceLabel: null,
              targetKey: null,
              contributionKey: null,
              transactional: undefined,
            }
          : [];
      }
      if (!item || typeof item !== "object") return [];
      const title = typeof item.title === "string" ? item.title.trim() : "";
      const detail = typeof item.detail === "string" ? item.detail.trim() : "";
      const text = detail || title || (typeof item.text === "string" ? item.text.trim() : "");
      if (!text) return [];
      const normalizedItem = {
        title: sanitizeVisibleAuditCopy(title || text),
        detail: sanitizeVisibleAuditCopy(detail || text),
        amount:
          typeof item.amount === "string"
            ? item.amount
            : item.amount == null
              ? null
              : fmt(parseCurrency(item.amount) || 0),
        priority: typeof item.priority === "string" ? item.priority.trim().toLowerCase() : null,
        tag:
          typeof item.priority === "string"
            ? item.priority.trim().toUpperCase()
            : typeof item.tag === "string"
              ? item.tag.trim().toUpperCase()
              : null,
        semanticKind: typeof item.semanticKind === "string" ? item.semanticKind.trim() : null,
        targetLabel: typeof item.targetLabel === "string" ? sanitizeVisibleAuditCopy(item.targetLabel) : null,
        sourceLabel: typeof item.sourceLabel === "string" ? sanitizeVisibleAuditCopy(item.sourceLabel) : null,
        routeLabel: typeof item.routeLabel === "string" ? sanitizeVisibleAuditCopy(item.routeLabel) : null,
        fundingLabel: typeof item.fundingLabel === "string" ? sanitizeVisibleAuditCopy(item.fundingLabel) : null,
        targetKey: typeof item.targetKey === "string" ? item.targetKey.trim() : null,
        contributionKey: typeof item.contributionKey === "string" ? item.contributionKey.trim() : null,
        transactional: typeof item.transactional === "boolean" ? item.transactional : undefined,
      };
      const allocationRows = extractCompoundAllocationRows(normalizedItem.detail);
      if (allocationRows.length >= 2) {
        return allocationRows.map((row) => {
          const targetLabel = sanitizeAllocationLabel(row.label);
          const sourceLabel = inferReserveAccountLabel(targetLabel);
          return {
            ...normalizedItem,
            title: targetLabel,
            detail: buildReserveInstruction({
              sourceLabel,
              targetLabel,
              amount: row.amount,
              due: row.date,
            }),
            amount: row.amount,
            semanticKind: normalizedItem.semanticKind || "spending-hold",
            targetLabel,
            sourceLabel,
            routeLabel: buildReserveRouteLabel(sourceLabel),
            fundingLabel: null,
            transactional: false,
          };
        });
      }
      return normalizedItem;
    })
    .filter(Boolean);

  const moveItems = moveCards.map((item) => ({
    text: item.detail || item.title,
    title: item.title || null,
    detail: item.detail || null,
    tag: item.tag,
    amount: parseCurrency(item.amount),
    semanticKind: item.semanticKind,
    targetLabel: item.targetLabel,
    sourceLabel: item.sourceLabel,
    routeLabel: item.routeLabel,
    fundingLabel: item.fundingLabel,
    targetKey: item.targetKey,
    contributionKey: item.contributionKey,
    transactional: item.transactional,
  }));

  return {
    weeklyMoves: moveCards.map((item) => item.detail || item.title),
    moveItems,
    moveCards,
  };
}

function normalizeRadarItems(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") {
        const text = entry.trim();
        return text ? { item: text, amount: "$0.00", date: "" } : null;
      }
      if (!entry || typeof entry !== "object") return null;
      const item = typeof entry.item === "string" ? entry.item.trim() : "";
      if (!item) return null;
      return {
        item,
        amount:
          typeof entry.amount === "string"
            ? entry.amount.trim()
            : entry.amount != null && parseCurrency(entry.amount) != null
              ? fmt(parseCurrency(entry.amount))
              : "$0.00",
        date: typeof entry.date === "string" ? entry.date.trim() : "",
      };
    })
    .filter(Boolean);
}

export function normalizeRadar(radarValue, longRangeRadarValue) {
  if (radarValue && typeof radarValue === "object" && !Array.isArray(radarValue)) {
    return {
      next90Days: normalizeRadarItems(radarValue.next90Days || radarValue.shortRange || []),
      longRange: normalizeRadarItems(radarValue.longRange || radarValue.longRangeRadar || longRangeRadarValue || []),
    };
  }

  return {
    next90Days: normalizeRadarItems(radarValue || []),
    longRange: normalizeRadarItems(longRangeRadarValue || []),
  };
}

export function normalizeNextAction(value) {
  if (typeof value === "string") {
    const detail = sanitizeVisibleAuditCopy(value);
    return {
      title: detail ? "Next Action" : "",
      detail,
      amount: null,
    };
  }

  if (!value || typeof value !== "object") {
    return {
      title: "",
      detail: "",
      amount: null,
    };
  }

  return {
    title: typeof value.title === "string" ? sanitizeVisibleAuditCopy(value.title) : "Next Action",
    detail:
      typeof value.detail === "string"
        ? sanitizeVisibleAuditCopy(value.detail)
        : typeof value.summary === "string"
          ? sanitizeVisibleAuditCopy(value.summary)
          : "",
    amount:
      typeof value.amount === "string"
        ? value.amount.trim()
        : value.amount != null && parseCurrency(value.amount) != null
          ? fmt(parseCurrency(value.amount))
          : null,
  };
}

export const DASHBOARD_ROW_ORDER = ["Checking", "Vault", "Pending", "Debts", "Available"];

export function normalizeDashboardCard(value) {
  const rows = Array.isArray(value) ? value : [];
  const byCategory = new Map();
  const nonCanonicalCategories = [];
  const toneToStatus = {
    good: "Healthy",
    neutral: "Tracked",
    warn: "Watch",
    bad: "Urgent",
  };
  for (const row of rows) {
    const rawCategory =
      typeof row?.category === "string"
        ? row.category.trim()
        : typeof row?.label === "string"
          ? row.label.trim()
          : "";
    if (!rawCategory) continue;
    const normalizedCategory = rawCategory.toLowerCase();
    if (SUPPLEMENTAL_DASHBOARD_CATEGORIES.has(normalizedCategory)) continue;
    const category = CANONICAL_DASHBOARD_CATEGORIES.get(normalizedCategory);
    if (!category) {
      nonCanonicalCategories.push(rawCategory);
      continue;
    }
    if (byCategory.has(category)) continue;
    const amount =
      typeof row?.amount === "string"
        ? row.amount
        : typeof row?.value === "string"
          ? row.value
          : "$0.00";
    const status =
      typeof row?.status === "string"
        ? row.status
        : typeof row?.note === "string"
          ? row.note
          : typeof row?.tone === "string"
            ? toneToStatus[String(row.tone).trim().toLowerCase()] || String(row.tone)
            : "";
    byCategory.set(category, {
      category,
      amount,
      status,
    });
  }
  const uniqueNonCanonical = [...new Set(nonCanonicalCategories)];
  if (uniqueNonCanonical.length > 0) {
    console.warn("[audit] Non-canonical dashboard categories detected:", uniqueNonCanonical.join(", "));
  }
  return {
    rows: DASHBOARD_ROW_ORDER.map(
      (category) => byCategory.get(category) || { category, amount: "$0.00", status: "" }
    ),
    nonCanonicalCategories: uniqueNonCanonical,
  };
}

export function defaultDashboardStatus(category, amount) {
  const safeAmount = Number(amount) || 0;
  if (category === "Checking") return safeAmount > 0 ? "Tracked" : "At risk";
  if (category === "Vault") return safeAmount > 0 ? "Tracked" : "Empty";
  if (category === "Pending") return safeAmount > 0 ? "Watch" : "Clear";
  if (category === "Debts") return safeAmount > 0 ? "Tracked" : "Clear";
  if (category === "Available") return safeAmount > 0 ? "Deploy" : "Protected";
  return "";
}

export function normalizeInvestmentsSummary(value) {
  if (!value || typeof value !== "object") return undefined;
  return {
    balance: typeof value.balance === "string" ? value.balance : "N/A",
    asOf: typeof value.asOf === "string" ? value.asOf : "N/A",
    gateStatus: typeof value.gateStatus === "string" ? value.gateStatus : "N/A",
    cryptoValue:
      typeof value.cryptoValue === "string" || value.cryptoValue === null ? value.cryptoValue : null,
    netWorth: typeof value.netWorth === "string" ? value.netWorth : undefined,
  };
}

export function normalizeNegotiationTargets(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      target: typeof item.target === "string" ? item.target.trim() : "",
      strategy: typeof item.strategy === "string" ? item.strategy.trim() : "",
      estimatedAnnualSavings: Number.isFinite(Number(item.estimatedAnnualSavings))
        ? Number(item.estimatedAnnualSavings)
        : 0,
    }))
    .filter((item) => item.target && item.strategy);
}

export function normalizeSpendingAnalysis(value) {
  if (!value || typeof value !== "object") return null;
  return {
    totalSpent: typeof value.totalSpent === "string" ? value.totalSpent : "N/A",
    dailyAverage: typeof value.dailyAverage === "string" ? value.dailyAverage : "N/A",
    vsAllowance: typeof value.vsAllowance === "string" ? value.vsAllowance : "N/A",
    topCategories: Array.isArray(value.topCategories)
      ? value.topCategories
          .filter((item) => item && typeof item === "object")
          .map((item) => ({
            category: typeof item.category === "string" ? item.category : "Other",
            amount: typeof item.amount === "string" ? item.amount : "$0.00",
            pctOfTotal: typeof item.pctOfTotal === "string" ? item.pctOfTotal : "0%",
          }))
      : [],
    alerts: normalizeStringArray(value.alerts),
    debtImpact: typeof value.debtImpact === "string" ? value.debtImpact : "",
  };
}

export function normalizeAuditStatus(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized.includes("GREEN")) return "GREEN";
  if (normalized.includes("YELLOW")) return "YELLOW";
  if (normalized.includes("RED")) return "RED";
  return "UNKNOWN";
}
