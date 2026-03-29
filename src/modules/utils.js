// ═══════════════════════════════════════════════════════════════
// STORAGE — Capacitor Preferences on iOS (iCloud KV-backed),
//           localStorage fallback on web / Vite dev server
// ═══════════════════════════════════════════════════════════════
  import { Capacitor,registerPlugin } from "@capacitor/core";
  import { Preferences } from "@capacitor/preferences";
  import { buildDashboardSafetyModel } from "./dashboard/safetyModel.js";
  import { log } from "./logger.js";
  import { clamp, getGradeLetter } from "./mathHelpers.js";
  import { normalizeMoveItems } from "./moveSemantics.js";

const NativeFaceId = registerPlugin("FaceId");

export const FaceId = {
  isAvailable: async () => {
    try {
      if (!Capacitor.isNativePlatform()) return { isAvailable: false };
      return await NativeFaceId.isAvailable();
    } catch (e) {
      void log.warn("biometry", "Biometry check failed", { error: e });
      return { isAvailable: false };
    }
  },
  authenticate: async opts => {
    if (!Capacitor.isNativePlatform()) throw new Error("Not supported on web");
    return await NativeFaceId.authenticate(opts);
  },
};
export const PdfViewer = registerPlugin("PdfViewer");

const PREFS_TIMEOUT_MS = 2000;

function withPrefsTimeout(promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Preferences bridge timed out")), PREFS_TIMEOUT_MS)),
  ]);
}

export const db = {
  async get(k) {
    try {
      const { value } = await withPrefsTimeout(Preferences.get({ key: k }));
      return value ? JSON.parse(value) : null;
    } catch {
      try {
        const r = localStorage.getItem(k);
        return r ? JSON.parse(r) : null;
      } catch {
        return null;
      }
    }
  },
  async set(k, v) {
    try {
      await withPrefsTimeout(Preferences.set({ key: k, value: JSON.stringify(v) }));
      return true;
    } catch {
      try {
        localStorage.setItem(k, JSON.stringify(v));
        return true;
      } catch {
        return false;
      }
    }
  },
  async del(k) {
    try {
      await withPrefsTimeout(Preferences.remove({ key: k }));
    } catch {
      try {
        localStorage.removeItem(k);
      } catch {
        // Local cleanup is best-effort only.
      }
    }
  },
  async keys() {
    try {
      const { keys } = await withPrefsTimeout(Preferences.keys());
      return keys;
    } catch {
      try {
        return Object.keys(localStorage);
      } catch {
        return [];
      }
    }
  },
  async clear() {
    try {
      await withPrefsTimeout(Preferences.clear());
    } catch {
      try {
        localStorage.clear();
      } catch {
        // Local cleanup is best-effort only.
      }
    }
  },
};

  import { formatCurrency } from "./currency.js";

export const fmt = n => formatCurrency(n);

export const fmtDate = d => {
  if (!d) return "—";
  try {
    const parts = String(d).split(/[T\s]/)[0].split("-");
    if (parts.length !== 3) {
      // Fallback or attempt to parse directly if not YYYY-MM-DD
      const parsed = new Date(d);
      if (isNaN(parsed.getTime())) return String(d);
      return parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    }
    const [y, m, day] = parts.map(Number);
    const date = new Date(y, m - 1, day);
    if (isNaN(date.getTime())) return String(d);
    return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  } catch {
    return String(d);
  }
};

// Strip parenthetical clarifiers from paycheck labels in Next Action.
export const stripPaycheckParens = text => {
  if (!text) return text;
  return text
    .split("\n")
    .map(line => line.replace(/^(Pre-Paycheck|Post-Paycheck)\s*\([^)]*\)/i, "$1"))
    .join("\n");
};

// ═══════════════════════════════════════════════════════════════
// DATE AUTO-ADVANCE — Rolling expired dates forward
// ═══════════════════════════════════════════════════════════════
export function advanceExpiredDate(
  dateString,
  intervalAmt,
  intervalUnit,
  todayStr = new Date().toISOString().split("T")[0]
) {
  if (!dateString) return dateString;
  if (dateString >= todayStr) return dateString; // not expired

  const d = new Date(dateString + "T12:00:00Z"); // force midday UTC to avoid timezone shift
  const today = new Date(todayStr + "T12:00:00Z");

  if (isNaN(d.getTime())) return dateString;

  const amt = Number(intervalAmt) || 1;

  if (intervalUnit === "days") {
    // Math: how many full day-intervals until d >= today?
    const daysDiff = Math.ceil((today - d) / (1000 * 60 * 60 * 24));
    const intervals = Math.ceil(daysDiff / amt);
    d.setUTCDate(d.getUTCDate() + intervals * amt);
  } else if (intervalUnit === "weeks") {
    const daysDiff = Math.ceil((today - d) / (1000 * 60 * 60 * 24));
    const intervals = Math.ceil(daysDiff / (amt * 7));
    d.setUTCDate(d.getUTCDate() + intervals * amt * 7);
  } else if (intervalUnit === "years" || intervalUnit === "yearly" || intervalUnit === "annual") {
    // O(1): calculate how many year-intervals are needed
    const yearDiff = today.getUTCFullYear() - d.getUTCFullYear();
    const intervals = Math.max(1, Math.ceil(yearDiff / amt));
    d.setUTCFullYear(d.getUTCFullYear() + intervals * amt);
    // If still behind (edge case: same year but earlier month/day), advance one more
    if (d < today) {
      d.setUTCFullYear(d.getUTCFullYear() + amt);
    }
  } else {
    // Default to months — tricky because months have variable lengths
    // Count how many month-intervals are needed
    const yearDiff = today.getUTCFullYear() - d.getUTCFullYear();
    const monthDiff = yearDiff * 12 + (today.getUTCMonth() - d.getUTCMonth());
    const intervals = Math.max(1, Math.ceil(monthDiff / amt));
    const originalDay = d.getUTCDate();
    d.setUTCMonth(d.getUTCMonth() + intervals * amt);
    // JS Date quirk: Jan 31 + 1 month = Mar 2 or 3 — rollback to end of target month.
    if (d.getUTCDate() < originalDay) {
      d.setUTCDate(0);
    }
    // If still behind today (edge case: monthDiff is 0 but date < today), advance one more
    if (d < today) {
      const origDay2 = d.getUTCDate();
      d.setUTCMonth(d.getUTCMonth() + amt);
      if (d.getUTCDate() < origDay2) d.setUTCDate(0);
    }
  }

  return d.toISOString().split("T")[0];
}

// ═══════════════════════════════════════════════════════════════
// PARSER — Strict JSON Translation
// ═══════════════════════════════════════════════════════════════
export function parseCurrency(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const str = String(value).trim();
  // Handle Banker's / Accounting negative notation: ($1,234.56) -> -1234.56
  const isNegative = str.startsWith("-") || (str.startsWith("(") && str.endsWith(")"));
  const cleanStr = str.replace(/[^0-9.]+/g, "");
  if (!cleanStr) return null;
  let n = parseFloat(cleanStr);
  if (isNegative) n = -n;
  // Banker's Rounding (Round half to even for financial precision) is not strictly needed here
  // since it's just parsing input, but we enforce strict float handling.
  return Number.isFinite(n) ? n : null;
}

const CANONICAL_DASHBOARD_CATEGORIES = new Map([
  ["checking", "Checking"],
  ["vault", "Vault"],
  ["pending", "Pending"],
  ["debts", "Debts"],
  ["available", "Available"],
]);

function formatRiskFlag(flag) {
  return String(flag || "")
    .split("-")
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function extractDollarAmountTotal(lines) {
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

function normalizeTrend(value) {
  return value === "up" || value === "down" || value === "flat" ? value : "flat";
}

function normalizeHealthScore(rawHealthScore) {
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

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function normalizeHeaderCard(value) {
  if (!value || typeof value !== "object") {
    return { status: "UNKNOWN", title: "", subtitle: "", confidence: null, details: [], headline: "" };
  }

  const details = Array.isArray(value.details)
    ? value.details.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
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

function normalizeAlertEntries(value) {
  if (!Array.isArray(value)) return { lines: [], items: [] };

  const items = value
    .map((entry) => {
      if (typeof entry === "string") {
        const text = entry.trim();
        return text ? { level: "warn", title: text, detail: text } : null;
      }
      if (!entry || typeof entry !== "object") return null;
      const title = typeof entry.title === "string" ? entry.title.trim() : "";
      const detail = typeof entry.detail === "string" ? entry.detail.trim() : title;
      const level = typeof entry.level === "string" ? entry.level.trim().toLowerCase() : "warn";
      if (!title && !detail) return null;
      return {
        level: level || "warn",
        title: title || detail,
        detail: detail || title,
      };
    })
    .filter(Boolean);

  return {
    items,
    lines: items.map((item) => {
      const prefix = item.level === "critical" ? "❗" : item.level === "info" ? "ℹ️" : "⚠️";
      return `${prefix} ${item.title}${item.detail && item.detail !== item.title ? ` — ${item.detail}` : ""}`;
    }),
  };
}

function normalizeWeeklyMoveEntries(value) {
  if (!Array.isArray(value)) return { weeklyMoves: [], moveItems: [], moveCards: [] };

  const moveCards = value
    .map((item) => {
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
          : null;
      }
      if (!item || typeof item !== "object") return null;
      const title = typeof item.title === "string" ? item.title.trim() : "";
      const detail = typeof item.detail === "string" ? item.detail.trim() : "";
      const text = detail || title || (typeof item.text === "string" ? item.text.trim() : "");
      if (!text) return null;
      return {
        title: title || text,
        detail: detail || text,
        amount: typeof item.amount === "string" ? item.amount : item.amount == null ? null : fmt(parseCurrency(item.amount) || 0),
        priority: typeof item.priority === "string" ? item.priority.trim().toLowerCase() : null,
        tag: typeof item.priority === "string" ? item.priority.trim().toUpperCase() : typeof item.tag === "string" ? item.tag.trim().toUpperCase() : null,
        semanticKind: typeof item.semanticKind === "string" ? item.semanticKind.trim() : null,
        targetLabel: typeof item.targetLabel === "string" ? item.targetLabel.trim() : null,
        sourceLabel: typeof item.sourceLabel === "string" ? item.sourceLabel.trim() : null,
        targetKey: typeof item.targetKey === "string" ? item.targetKey.trim() : null,
        contributionKey: typeof item.contributionKey === "string" ? item.contributionKey.trim() : null,
        transactional: typeof item.transactional === "boolean" ? item.transactional : undefined,
      };
    })
    .filter(Boolean);

  const moveItems = moveCards.map((item) => ({
    text: item.detail || item.title,
    tag: item.tag,
    amount: parseCurrency(item.amount),
    semanticKind: item.semanticKind,
    targetLabel: item.targetLabel,
    sourceLabel: item.sourceLabel,
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

function normalizeRadar(radarValue, longRangeRadarValue) {
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

function normalizeNextAction(value) {
  if (typeof value === "string") {
    const detail = value.trim();
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
    title: typeof value.title === "string" ? value.title.trim() : "Next Action",
    detail:
      typeof value.detail === "string"
        ? value.detail.trim()
        : typeof value.summary === "string"
          ? value.summary.trim()
          : "",
    amount:
      typeof value.amount === "string"
        ? value.amount.trim()
        : value.amount != null && parseCurrency(value.amount) != null
          ? fmt(parseCurrency(value.amount))
          : null,
  };
}

const DASHBOARD_ROW_ORDER = ["Checking", "Vault", "Pending", "Debts", "Available"];

function normalizeDashboardCard(value) {
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
    const rawCategory = typeof row?.category === "string"
      ? row.category.trim()
      : typeof row?.label === "string"
        ? row.label.trim()
        : "";
    if (!rawCategory) continue;
    const category = CANONICAL_DASHBOARD_CATEGORIES.get(rawCategory.toLowerCase());
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
    rows: DASHBOARD_ROW_ORDER.map(category => byCategory.get(category) || { category, amount: "$0.00", status: "" }),
    nonCanonicalCategories: uniqueNonCanonical,
  };
}

function defaultDashboardStatus(category, amount) {
  const safeAmount = Number(amount) || 0;
  if (category === "Checking") return safeAmount > 0 ? "Tracked" : "At risk";
  if (category === "Vault") return safeAmount > 0 ? "Tracked" : "Empty";
  if (category === "Pending") return safeAmount > 0 ? "Watch" : "Clear";
  if (category === "Debts") return safeAmount > 0 ? "Tracked" : "Clear";
  if (category === "Available") return safeAmount > 0 ? "Deploy" : "Protected";
  return "";
}

function buildDashboardRowsFromAnchors(anchors = {}, existingRows = []) {
  const statusByCategory = new Map(
    (Array.isArray(existingRows) ? existingRows : [])
      .filter((row) => row?.category)
      .map((row) => [row.category, typeof row.status === "string" ? row.status : ""])
  );

  return DASHBOARD_ROW_ORDER.map((category) => {
    const key = category.toLowerCase();
    const amount = Number.isFinite(Number(anchors?.[key])) ? Number(anchors[key]) : 0;
    return {
      category,
      amount: fmt(amount),
      status: statusByCategory.get(category) || defaultDashboardStatus(category, amount),
    };
  });
}

function shouldRepairDashboardRows(rows = [], anchors = {}) {
  const meaningfulAnchors = Object.entries(anchors).filter(([, value]) => Number.isFinite(Number(value)));
  if (meaningfulAnchors.length === 0) return false;

  let mismatches = 0;
  let positiveAnchors = 0;
  let zeroLikeRows = 0;

  for (const [key, rawExpected] of meaningfulAnchors) {
    const expected = Number(rawExpected);
    if (expected > 0) positiveAnchors += 1;
    const category = CANONICAL_DASHBOARD_CATEGORIES.get(String(key).toLowerCase()) || key.charAt(0).toUpperCase() + key.slice(1);
    const row = (rows || []).find((entry) => entry?.category === category);
    const actual = parseCurrency(row?.amount);
    if (actual == null || Math.abs(actual - expected) > 1) mismatches += 1;
    if ((actual == null || Math.abs(actual) < 0.01) && expected > 0) zeroLikeRows += 1;
  }

  return mismatches >= 2 || (positiveAnchors > 0 && zeroLikeRows === positiveAnchors);
}

function normalizeInvestmentAnchors(anchors = {}) {
  const balance = Number.isFinite(Number(anchors?.balance)) ? fmt(Number(anchors.balance)) : null;
  const netWorth = Number.isFinite(Number(anchors?.netWorth)) ? fmt(Number(anchors.netWorth)) : undefined;
  const asOf = typeof anchors?.asOf === "string" && anchors.asOf.trim() ? anchors.asOf.trim() : "N/A";
  const gateStatus = typeof anchors?.gateStatus === "string" && anchors.gateStatus.trim() ? anchors.gateStatus.trim() : "Tracked";
  if (!balance) return null;
  return { balance, asOf, gateStatus, netWorth };
}

function normalizeInvestmentsSummary(value) {
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

function normalizeNegotiationTargets(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => item && typeof item === "object")
    .map(item => ({
      target: typeof item.target === "string" ? item.target.trim() : "",
      strategy: typeof item.strategy === "string" ? item.strategy.trim() : "",
      estimatedAnnualSavings: Number.isFinite(Number(item.estimatedAnnualSavings))
        ? Number(item.estimatedAnnualSavings)
        : 0,
    }))
    .filter(item => item.target && item.strategy);
}

function normalizeSpendingAnalysis(value) {
  if (!value || typeof value !== "object") return null;
  return {
    totalSpent: typeof value.totalSpent === "string" ? value.totalSpent : "N/A",
    dailyAverage: typeof value.dailyAverage === "string" ? value.dailyAverage : "N/A",
    vsAllowance: typeof value.vsAllowance === "string" ? value.vsAllowance : "N/A",
    topCategories: Array.isArray(value.topCategories)
      ? value.topCategories
          .filter(item => item && typeof item === "object")
          .map(item => ({
            category: typeof item.category === "string" ? item.category : "Other",
            amount: typeof item.amount === "string" ? item.amount : "$0.00",
            pctOfTotal: typeof item.pctOfTotal === "string" ? item.pctOfTotal : "0%",
          }))
      : [],
    alerts: normalizeStringArray(value.alerts),
    debtImpact: typeof value.debtImpact === "string" ? value.debtImpact : "",
  };
}

function normalizeAuditStatus(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized.includes("GREEN")) return "GREEN";
  if (normalized.includes("YELLOW")) return "YELLOW";
  if (normalized.includes("RED")) return "RED";
  return "UNKNOWN";
}

export function parseJSON(raw) {
  let j;
  try {
    // Aggressive JSON extraction: strip ALL markdown wrappers and extract only the {} block
    const cleaned = raw
      .replace(/```json?\s*/gi, "")
      .replace(/```/g, "")
      .trim();
    const startIdx = cleaned.indexOf("{");
    const endIdx = cleaned.lastIndexOf("}");
    if (startIdx >= 0 && endIdx > startIdx) {
      j = JSON.parse(cleaned.slice(startIdx, endIdx + 1));
    } else {
      // Try array-wrapped JSON: [{...}]
      const arrStart = cleaned.indexOf("[");
      const arrEnd = cleaned.lastIndexOf("]");
      if (arrStart >= 0 && arrEnd > arrStart) {
        const arr = JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
        j = Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
      } else {
        j = JSON.parse(cleaned);
      }
    }
  } catch (e) {
    // NOTE: never log raw response content — it may contain financial PII
    void log.warn("parseJSON", "JSON.parse failed", { error: e.message, rawLength: raw?.length });
    return null; // Stream hasn't finished accumulating enough valid JSON
  }

  // Normalize ALL snake_case keys to camelCase recursively (top level)
  if (j && typeof j === "object") {
    const camelCase = s => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    for (const key of Object.keys(j)) {
      const cc = camelCase(key);
      if (cc !== key && !(cc in j)) {
        j[cc] = j[key];
      }
    }
  }

  // Fallback: try common alternative key names for headerCard
  if (j && !j.headerCard) {
    j.headerCard = j.header || j.auditHeader || j.statusHeader || j.summary_header || j.summaryHeader || null;
  }

  // Schema Validation (Lightweight)
  if (!j || !j.headerCard) {
    void log.warn("parseJSON", "Missing headerCard", { keys: j ? Object.keys(j).join(", ") : "null" });
    return null;
  }

  // Map to the internal structure expected by ResultsView/Dashboard
  const normalizedWeeklyMoves = normalizeWeeklyMoveEntries(j.weeklyMoves);
  const weeklyMoves = normalizedWeeklyMoves.weeklyMoves;
  const normalizedHeaderCard = normalizeHeaderCard(j.headerCard);
  const normalizedNextAction = normalizeNextAction(j.nextAction);
  const normalizedAlerts = normalizeAlertEntries(j.alertsCard || j.alerts);
  const alertsCard = normalizedAlerts.lines;
  const { rows: dashboardCard, nonCanonicalCategories } = normalizeDashboardCard(j.dashboardCard);
  const investments = normalizeInvestmentsSummary(j.investments);
  const spendingAnalysis = normalizeSpendingAnalysis(j.spendingAnalysis);
  const negotiationTargets = normalizeNegotiationTargets(j.negotiationTargets);
  const normalizedHealthScore = normalizeHealthScore(j.healthScore);
  const normalizedRadar = normalizeRadar(j.radar, j.longRangeRadar);
  const assumptions = normalizeStringArray(j.assumptions);
  const auditFlags = [];
  if (normalizedHealthScore.gradeCorrected && normalizedHealthScore.value) {
    auditFlags.push({
      code: "health-score-grade-corrected",
      severity: "low",
      message: `Health score grade corrected to ${normalizedHealthScore.value.grade} from ${normalizedHealthScore.originalGrade}.`,
      meta: {
        score: normalizedHealthScore.value.score,
        originalGrade: normalizedHealthScore.originalGrade,
      },
    });
  }
  const normalizedStatus = normalizeAuditStatus(
    normalizedHeaderCard.status === "UNKNOWN"
      ? j.status || normalizedHeaderCard.headline || normalizedHeaderCard.title
      : normalizedHeaderCard.status
  );
  const structuredWeeklyMoves = normalizedWeeklyMoves.moveCards.map((item) => ({
    title: item.title || item.detail,
    detail: item.detail || item.title,
    amount: item.amount ?? null,
    priority: item.priority || "optional",
  }));
  const structuredMoveItems = normalizeMoveItems(
    Array.isArray(j.moveItems) && j.moveItems.length > 0 ? j.moveItems : normalizedWeeklyMoves.moveItems,
    weeklyMoves
  );
  const structured = {
    ...j,
    headerCard: normalizedHeaderCard,
    alertsCard: normalizedAlerts.items,
    dashboardCard,
    weeklyMoves: structuredWeeklyMoves,
    moveItems: structuredMoveItems,
    radar: normalizedRadar,
    longRangeRadar: normalizedRadar.longRange,
    investments,
    nextAction: normalizedNextAction,
    spendingAnalysis,
    negotiationTargets,
    assumptions,
    riskFlags: normalizeStringArray(j.riskFlags),
  };
  return {
    raw,
    status: normalizedStatus,
    mode: "FULL", // Implicit in the new architecture unless overridden
    liquidNetWorth: parseCurrency(j.liquidNetWorth),
    netWorth:
      parseCurrency(j.netWorth) ?? parseCurrency(j.investments?.netWorth) ?? parseCurrency(j.investments?.balance),
    netWorthDelta: j.netWorthDelta ?? j.investments?.netWorthDelta ?? null,
    healthScore: normalizedHealthScore.value, // { score, grade, trend, summary }
    alertsCard,
    dashboardCard,
    weeklyMoves,
    investments,
    spendingAnalysis,
    structured,
    sections: {
      header: `**${new Date().toISOString().split("T")[0]}** · FULL · ${normalizedStatus}`,
      alerts: alertsCard.join("\n"),
      dashboard: dashboardCard
        .map(d => `**${d.category}:** ${d.amount} ${d.status ? `(${d.status})` : ""}`)
        .join("\n"),
      moves: weeklyMoves.join("\n"),
      radar: normalizedRadar.next90Days.map(r => `**${r.date || "Upcoming"}** ${r.item} ${r.amount}`).join("\n"),
      longRange: normalizedRadar.longRange.map(r => `**${r.date || "Later"}** ${r.item} ${r.amount}`).join("\n"),
      forwardRadar: assumptions.join("\n"),
      investments: `**Balance:** ${investments?.balance || "N/A"}\n**As Of:** ${investments?.asOf || "N/A"}\n**Gate:** ${investments?.gateStatus || "N/A"}${investments?.netWorth ? `\n**Net Worth:** ${investments.netWorth}` : ""}`,
      nextAction: [normalizedNextAction.title, normalizedNextAction.detail, normalizedNextAction.amount].filter(Boolean).join("\n"),
      autoUpdates: "Handled natively via JSON output",
      qualityScore: "Strict JSON Mode Active",
    },
    // Map moves to actionable checkboxes
    moveItems: structuredMoveItems,
    paceData: Array.isArray(j.paceData) ? j.paceData : [], // Extracted from JSON if present, kept for backwards compat
    negotiationTargets,
    dashboardData: {
      checkingBalance: null, // Extracted from dashboardCard dynamically on demand
      savingsVaultTotal: null,
    },
    auditFlags,
    consistency: {
      gradeCorrected: normalizedHealthScore.gradeCorrected,
      originalGrade: normalizedHealthScore.originalGrade,
      nonCanonicalDashboardCategories: nonCanonicalCategories,
    },
    degraded: null,
  };
}

export function parseAudit(raw) {
  // We ONLY parse JSON now. Fallback markdown parsing is officially deprecated.
  return parseJSON(raw);
}

function extractAuditSafetyLevel(parsed) {
  const degradedLevel = parsed?.degraded?.safetyState?.level;
  if (degradedLevel === "stable" || degradedLevel === "caution" || degradedLevel === "urgent") {
    return degradedLevel;
  }

  const normalizedStatus = String(parsed?.status || "").toUpperCase();
  if (normalizedStatus === "RED") return "urgent";
  if (normalizedStatus === "YELLOW") return "caution";
  return "stable";
}

function extractAuditRiskCategories(parsed) {
  const rawRiskFlags = Array.isArray(parsed?.degraded?.riskFlags)
    ? parsed.degraded.riskFlags
    : Array.isArray(parsed?.structured?.riskFlags)
      ? parsed.structured.riskFlags
      : [];

  return rawRiskFlags
    .map(flag => String(flag || "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

export function detectAuditDrift(previousParsed, nextParsed) {
  if (!previousParsed || !nextParsed) {
    return {
      driftDetected: false,
      reasons: [],
      scoreDelta: 0,
      safetyFlip: false,
      riskCategoriesChangedCompletely: false,
    };
  }

  const previousScore = Number(previousParsed?.healthScore?.score);
  const nextScore = Number(nextParsed?.healthScore?.score);
  const scoreDelta =
    Number.isFinite(previousScore) && Number.isFinite(nextScore) ? Math.abs(nextScore - previousScore) : 0;

  const previousSafety = extractAuditSafetyLevel(previousParsed);
  const nextSafety = extractAuditSafetyLevel(nextParsed);
  const safetyFlip = previousSafety !== nextSafety;

  const previousRiskCategories = extractAuditRiskCategories(previousParsed);
  const nextRiskCategories = extractAuditRiskCategories(nextParsed);
  const overlap = previousRiskCategories.filter(flag => nextRiskCategories.includes(flag));
  const riskCategoriesChangedCompletely =
    previousRiskCategories.length > 0 && nextRiskCategories.length > 0 && overlap.length === 0;

  const reasons = [];
  if (scoreDelta > 8) reasons.push(`health-score-drift:${scoreDelta}`);
  if (safetyFlip) reasons.push(`safety-state-flip:${previousSafety}->${nextSafety}`);
  if (riskCategoriesChangedCompletely) {
    reasons.push(`risk-categories-shift:${previousRiskCategories.join(",") || "none"}->${nextRiskCategories.join(",") || "none"}`);
  }

  return {
    driftDetected: reasons.length > 0,
    reasons,
    scoreDelta,
    safetyFlip,
    riskCategoriesChangedCompletely,
    previousSafety,
    nextSafety,
    previousRiskCategories,
    nextRiskCategories,
  };
}

function inferAuditStatusFromSignals(score, riskFlags = []) {
  const numericScore = Number(score);
  const normalizedRiskFlags = Array.isArray(riskFlags) ? riskFlags.filter(Boolean) : [];
  const severeFlags = new Set([
    "floor-breach-risk",
    "transfer-needed",
    "toxic-apr",
    "high-utilization",
    "critical-promo-expiry",
  ]);

  if (
    (Number.isFinite(numericScore) && numericScore < 70) ||
    normalizedRiskFlags.some(flag => severeFlags.has(String(flag)))
  ) {
    return "RED";
  }
  if ((Number.isFinite(numericScore) && numericScore < 80) || normalizedRiskFlags.length > 0) {
    return "YELLOW";
  }
  return "GREEN";
}

/**
 * @param {import("../types/index.js").ParsedAudit | null} parsed
 * @param {{
 *   operationalSurplus?: number | null;
 *   nativeScore?: number | null;
 *   nativeRiskFlags?: string[] | null;
 *   dashboardAnchors?: Record<string, number | null | undefined>;
 *   investmentAnchors?: { balance?: number | null; asOf?: string | null; gateStatus?: string | null; netWorth?: number | null } | null;
 * }} [options]
 * @returns {import("../types/index.js").ParsedAudit | null}
 */
export function validateParsedAuditConsistency(parsed, options = {}) {
  if (!parsed) return null;

  const {
    operationalSurplus = null,
    nativeScore = null,
    nativeRiskFlags = null,
    dashboardAnchors = null,
    investmentAnchors = null,
  } = options;

  const auditFlags = Array.isArray(parsed.auditFlags) ? [...parsed.auditFlags] : [];
  const consistency = { ...(parsed.consistency || {}) };
  const normalizedNativeRiskFlags = Array.isArray(nativeRiskFlags)
    ? nativeRiskFlags.filter(flag => typeof flag === "string" && flag.trim())
    : [];

  if (normalizedNativeRiskFlags.length > 0) {
    consistency.nativeRiskFlags = normalizedNativeRiskFlags;
  }

  if (Array.isArray(consistency.nonCanonicalDashboardCategories) && consistency.nonCanonicalDashboardCategories.length > 0) {
    void log.warn(
      "audit", "Non-canonical dashboard categories detected",
      { categories: consistency.nonCanonicalDashboardCategories.join(", ") }
    );
  }

  if (dashboardAnchors && shouldRepairDashboardRows(parsed.dashboardCard, dashboardAnchors)) {
    parsed.dashboardCard = buildDashboardRowsFromAnchors(dashboardAnchors, parsed.dashboardCard);
    if (parsed.structured && typeof parsed.structured === "object") {
      parsed.structured.dashboardCard = parsed.dashboardCard.map((row) => ({
        category: row.category,
        amount: row.amount,
        status: row.status,
      }));
    }
    if (parsed.sections && typeof parsed.sections.dashboard === "string") {
      parsed.sections = {
        ...parsed.sections,
        dashboard: parsed.dashboardCard
          .map((row) => `**${row.category}:** ${row.amount} ${row.status ? `(${row.status})` : ""}`)
          .join("\n"),
      };
    }
    consistency.dashboardRepaired = true;
    auditFlags.push({
      code: "dashboard-repaired-to-native-anchors",
      severity: "medium",
      message: "Dashboard summary was rebuilt from native cash and debt anchors because the model output was materially inconsistent.",
    });
  }

  const normalizedInvestmentAnchors = normalizeInvestmentAnchors(investmentAnchors || {});
  const existingInvestmentMissing =
    !parsed.investments ||
    (!parsed.investments.balance || parsed.investments.balance === "N/A");
  if (normalizedInvestmentAnchors && existingInvestmentMissing) {
    parsed.investments = {
      ...parsed.investments,
      ...normalizedInvestmentAnchors,
      cryptoValue: parsed.investments?.cryptoValue ?? null,
    };
    if (parsed.structured && typeof parsed.structured === "object") {
      parsed.structured.investments = parsed.investments;
    }
    if (parsed.sections && typeof parsed.sections.investments === "string") {
      parsed.sections = {
        ...parsed.sections,
        investments: `**Balance:** ${parsed.investments.balance}\n**As Of:** ${parsed.investments.asOf}\n**Gate:** ${parsed.investments.gateStatus}`,
      };
    }
    consistency.investmentSummaryRepaired = true;
    auditFlags.push({
      code: "investments-summary-repaired",
      severity: "low",
      message: "Investments summary was backfilled from tracked balances because the model omitted it.",
    });
  }

  if (parsed.healthScore) {
    const expectedGrade = getGradeLetter(parsed.healthScore.score);
    if (parsed.healthScore.grade !== expectedGrade) {
      parsed.healthScore = {
        ...parsed.healthScore,
        grade: expectedGrade,
      };
      consistency.gradeCorrected = true;
      auditFlags.push({
        code: "health-score-grade-corrected",
        severity: "low",
        message: `Health score grade corrected to ${expectedGrade}.`,
        meta: { score: parsed.healthScore.score },
      });
    }
  }

  if (parsed.healthScore && nativeScore != null && Number.isFinite(Number(nativeScore))) {
    const expectedNativeScore = clamp(Math.round(Number(nativeScore)), 0, 100);
    const scoreDelta = parsed.healthScore.score - expectedNativeScore;
    consistency.nativeScoreAnchor = expectedNativeScore;
    consistency.nativeScoreDelta = scoreDelta;

    if (Math.abs(scoreDelta) > 8) {
      const originalScore = parsed.healthScore.score;
      const correctedGrade = getGradeLetter(expectedNativeScore);
      parsed.healthScore = {
        ...parsed.healthScore,
        score: expectedNativeScore,
        grade: correctedGrade,
      };
      consistency.scoreAnchoredToNative = true;
      void log.warn(
        "audit", `Health score deviated materially from native anchor (${scoreDelta > 0 ? "+" : ""}${scoreDelta}). Re-anchoring to ${expectedNativeScore}.`
      );
      auditFlags.push({
        code: "health-score-reanchored-to-native",
        severity: "medium",
        message: `Health score was re-anchored to the native score of ${expectedNativeScore}/100 to keep the audit aligned with deterministic engine signals.`,
        meta: { nativeScore: expectedNativeScore, originalScore, scoreDelta },
      });
    }
  }

  const derivedStatus = inferAuditStatusFromSignals(parsed.healthScore?.score, normalizedNativeRiskFlags);
  if (parsed.status !== derivedStatus && (consistency.scoreAnchoredToNative || normalizedNativeRiskFlags.length > 0)) {
    parsed.status = derivedStatus;
    if (parsed.structured?.headerCard && typeof parsed.structured.headerCard === "object") {
      parsed.structured.headerCard = {
        ...parsed.structured.headerCard,
        status: derivedStatus,
      };
    }
    if (parsed.sections && typeof parsed.sections.header === "string") {
      const prefix = parsed.sections.header.split("·").slice(0, -1).join("·").trim();
      parsed.sections = {
        ...parsed.sections,
        header: prefix ? `${prefix} · ${derivedStatus}` : `**${new Date().toISOString().split("T")[0]}** · FULL · ${derivedStatus}`,
      };
    }
    consistency.statusCorrected = true;
    auditFlags.push({
      code: "status-corrected-to-native-risk",
      severity: "medium",
      message: `Audit status was corrected to ${derivedStatus} to stay aligned with deterministic risk signals.`,
      meta: { nativeRiskFlags: normalizedNativeRiskFlags },
    });
  }

  if (Number.isFinite(Number(operationalSurplus))) {
    const expectedOperationalSurplus = Math.max(0, Number(operationalSurplus));
    const weeklyMoveDollarTotal = extractDollarAmountTotal(parsed.weeklyMoves);
    consistency.weeklyMoveDollarTotal = weeklyMoveDollarTotal;
    consistency.expectedOperationalSurplus = expectedOperationalSurplus;

    if (expectedOperationalSurplus - weeklyMoveDollarTotal > 50) {
      const shortfall = Number((expectedOperationalSurplus - weeklyMoveDollarTotal).toFixed(2));
      void log.warn(
        "audit", `Weekly moves under-allocate operational surplus by $${shortfall.toFixed(2)}.`
      );
      auditFlags.push({
        code: "weekly-moves-underallocated",
        severity: "low",
        message: `Weekly moves only allocate $${weeklyMoveDollarTotal.toFixed(2)} of the $${expectedOperationalSurplus.toFixed(2)} operational surplus.`,
        meta: { shortfall, weeklyMoveDollarTotal, expectedOperationalSurplus },
      });
    }
  }

  return {
    ...parsed,
    auditFlags,
    consistency,
  };
}

/**
 * @param {{
 *   raw?: string;
 *   reason?: string;
 *   retryAttempted?: boolean;
 *   computedStrategy?: Record<string, unknown>;
 *   financialConfig?: import("../types/index.js").CatalystCashConfig | null;
 *   formData?: import("../types/index.js").AuditFormData;
 *   renewals?: import("../types/index.js").Renewal[];
 *   cards?: import("../types/index.js").Card[];
 * }} [options]
 * @returns {import("../types/index.js").ParsedAudit}
 */
export function buildDegradedParsedAudit({
  raw = "",
  reason = "Full AI narrative unavailable.",
  retryAttempted = false,
  computedStrategy = {},
  financialConfig = {},
  formData = {},
  renewals = [],
  cards = [],
} = {}) {
  const nativeScore = computedStrategy?.auditSignals?.nativeScore?.score ?? 0;
  const nativeGrade = computedStrategy?.auditSignals?.nativeScore?.grade ?? getGradeLetter(nativeScore);
  const riskFlags = Array.isArray(computedStrategy?.auditSignals?.riskFlags)
    ? computedStrategy.auditSignals.riskFlags.filter(Boolean)
    : [];
  const checking = Number(formData?.checking || 0) || 0;
  const savings = Number(formData?.savings || formData?.ally || 0) || 0;
  const pendingCharges = Array.isArray(formData?.pendingCharges)
    ? formData.pendingCharges.reduce((sum, charge) => sum + (parseCurrency(charge?.amount) || 0), 0)
    : 0;
  const floor = Number(financialConfig?.weeklySpendAllowance || 0) + Number(financialConfig?.emergencyFloor || 0);
  const operationalSurplus = Math.max(0, Number(computedStrategy?.operationalSurplus || 0));

  const provisionalStatus =
    nativeScore < 70 || riskFlags.includes("floor-breach-risk") || riskFlags.includes("transfer-needed")
      ? "RED"
      : nativeScore < 80 || riskFlags.length > 0
        ? "YELLOW"
        : "GREEN";

  const safetySnapshot = buildDashboardSafetyModel({
    spendableCash: checking,
    pendingCharges,
    savingsCash: savings,
    floor,
    weeklySpendAllowance: Number(financialConfig?.weeklySpendAllowance || 0),
    renewals,
    cards,
    healthScore: nativeScore,
    auditStatus: provisionalStatus,
    todayStr: formData?.date,
  });

  const status =
    safetySnapshot.level === "urgent"
      ? "RED"
      : safetySnapshot.level === "caution"
        ? "YELLOW"
        : "GREEN";

  const weeklyMoves = [];
  if ((computedStrategy?.requiredTransfer || 0) > 0) {
    weeklyMoves.push(
      {
        title: "Protect checking floor",
        detail: `Transfer $${Number(computedStrategy.requiredTransfer).toFixed(2)} from savings to checking to protect your floor.`,
        amount: Number(computedStrategy.requiredTransfer).toFixed(2),
        priority: "required",
        semanticKind: "bank-checking-increase",
        targetLabel: "Checking",
        sourceLabel: "Savings",
        transactional: true,
      }
    );
  }
  if (computedStrategy?.debtStrategy?.target && (computedStrategy?.debtStrategy?.amount || 0) > 0) {
    weeklyMoves.push(
      {
        title: "Pay priority debt",
        detail: `Route $${Number(computedStrategy.debtStrategy.amount).toFixed(2)} to ${computedStrategy.debtStrategy.target} this week.`,
        amount: Number(computedStrategy.debtStrategy.amount).toFixed(2),
        priority: "required",
        semanticKind: "debt-payment",
        targetLabel: computedStrategy.debtStrategy.target,
        transactional: true,
      }
    );
  }
  if (weeklyMoves.length === 0) {
    if (riskFlags.length > 0) {
      weeklyMoves.push({
        title: "Protect against the top risk",
        detail: `Prioritize ${formatRiskFlag(riskFlags[0]).toLowerCase()} before optional spending this week.`,
        priority: "required",
        semanticKind: "spending-hold",
        transactional: false,
      });
    } else {
      weeklyMoves.push({
        title: "Preserve cash buffer",
        detail: "Hold spending to preserve your cash buffer this week.",
        priority: "optional",
        semanticKind: "spending-hold",
        transactional: false,
      });
    }
  }

  const normalizedFallbackMoves = normalizeWeeklyMoveEntries(weeklyMoves);
  const fallbackMoveTexts = normalizedFallbackMoves.weeklyMoves;

  const alertsCard = [
    "Full AI narrative unavailable — showing deterministic engine output only.",
    ...riskFlags.slice(0, 3).map(flag => `Risk flag: ${formatRiskFlag(flag)}`),
  ];
  const structuredAlerts = alertsCard.map((detail, index) => ({
    level: index === 0 ? "warn" : "critical",
    title: index === 0 ? "Deterministic fallback active" : `Risk flag ${index}`,
    detail,
  }));

  const dashboardCard = [
    { category: "Checking", amount: fmt(checking), status: safetySnapshot.level === "urgent" ? "At risk" : "Tracked" },
    { category: "Vault", amount: fmt(savings), status: savings > 0 ? "Tracked" : "Empty" },
    { category: "Pending", amount: fmt(pendingCharges), status: pendingCharges > 0 ? "Watch" : "Clear" },
    { category: "Debts", amount: fmt(computedStrategy?.auditSignals?.debt?.total || 0), status: riskFlags.includes("toxic-apr") ? "Urgent" : "Tracked" },
    { category: "Available", amount: fmt(operationalSurplus), status: operationalSurplus > 0 ? "Deploy" : "Protected" },
  ];

  const nextAction = fallbackMoveTexts[0] || safetySnapshot.summary;
  const dateLabel = formData?.date || new Date().toISOString().split("T")[0];
  const riskSummary = riskFlags.length > 0 ? riskFlags.slice(0, 3).map(formatRiskFlag).join(", ") : "No acute risk flags";

  return {
    raw,
    status,
    mode: "DEGRADED",
    liquidNetWorth: checking + savings,
    netWorth: checking + savings - Number(computedStrategy?.auditSignals?.debt?.total || 0),
    netWorthDelta: null,
    healthScore: {
      score: nativeScore,
      grade: nativeGrade,
      trend: "flat",
      summary: safetySnapshot.summary,
      narrative: safetySnapshot.headline,
    },
    alertsCard,
    dashboardCard,
    weeklyMoves: fallbackMoveTexts,
    spendingAnalysis: null,
    structured: {
      headerCard: {
        title: "Deterministic fallback active",
        subtitle: safetySnapshot.headline,
        status,
        confidence: "low",
        headline: "Deterministic fallback active",
        details: [safetySnapshot.headline, riskSummary],
      },
      healthScore: {
        score: nativeScore,
        grade: nativeGrade,
        trend: "flat",
        summary: safetySnapshot.summary,
        narrative: safetySnapshot.headline,
      },
      dashboardCard,
      weeklyMoves,
      moveItems: normalizedFallbackMoves.moveItems,
      alertsCard: structuredAlerts,
      radar: {
        next90Days: [],
        longRange: [],
      },
      longRangeRadar: [],
      milestones: [],
      negotiationTargets: [],
      nextAction: {
        title: "Next Action",
        detail: nextAction,
        amount: null,
      },
      assumptions: [reason],
      riskFlags,
    },
    sections: {
      header: `**${dateLabel}** · DEGRADED · ${status}`,
      alerts: alertsCard.map(item => `⚠️ ${item}`).join("\n"),
      dashboard: dashboardCard.map(row => `**${row.category}:** ${row.amount} (${row.status})`).join("\n"),
      moves: fallbackMoveTexts.join("\n"),
      radar: "",
      longRange: "",
      forwardRadar: riskSummary,
      investments: "Native fallback active",
      nextAction,
      autoUpdates: "Deterministic fallback active",
      qualityScore: "Full AI narrative unavailable",
    },
    moveItems: normalizeMoveItems(normalizedFallbackMoves.moveItems, fallbackMoveTexts),
    paceData: [],
    negotiationTargets: [],
    dashboardData: {
      checkingBalance: checking,
      savingsVaultTotal: savings,
    },
    auditFlags: [
      {
        code: "degraded-audit-state",
        severity: "medium",
        message: reason,
        meta: { retryAttempted, riskFlags },
      },
    ],
    consistency: {
      weeklyMoveDollarTotal: extractDollarAmountTotal(fallbackMoveTexts),
      expectedOperationalSurplus: operationalSurplus,
      nonCanonicalDashboardCategories: [],
    },
    degraded: {
      isDegraded: true,
      narrativeAvailable: false,
      reason,
      retryAttempted,
      riskFlags,
      safetyState: {
        level: safetySnapshot.level,
        headline: safetySnapshot.headline,
        summary: safetySnapshot.summary,
      },
    },
  };
}

export function extractDashboardMetrics(parsed) {
  const structured = parsed?.structured || {};
  const legacy = structured.dashboard || parsed?.dashboardData || {};
  const legacyChecking = parseCurrency(legacy.checkingBalance);
  const legacyVault = parseCurrency(legacy.savingsVaultTotal || legacy.allyVaultTotal);
  const legacyPending = parseCurrency(legacy.next7DaysNeed);
  const legacyAvailable = parseCurrency(legacy.checkingProjEnd);

  const cardRows = Array.isArray(parsed?.dashboardCard)
    ? parsed.dashboardCard
    : Array.isArray(structured.dashboardCard)
      ? structured.dashboardCard
      : [];
  if (!cardRows.length) {
    return {
      checking: legacyChecking,
      vault: legacyVault,
      pending: legacyPending,
      debts: null,
      available: legacyAvailable,
    };
  }

  const rowValue = {};
  for (const row of cardRows) {
    const key = String(row?.category || "")
      .trim()
      .toLowerCase();
    if (!key) continue;
    rowValue[key] = parseCurrency(row?.amount);
  }

  return {
    checking: rowValue.checking ?? legacyChecking,
    vault: rowValue.vault ?? rowValue.savings ?? legacyVault,
    investments: rowValue.investments ?? null,
    otherAssets: rowValue["other assets"] ?? null,
    pending: rowValue.pending ?? legacyPending,
    debts: rowValue.debts ?? null,
    available: rowValue.available ?? legacyAvailable,
  };
}

export async function shareAudit(audit) {
  const p = audit.parsed;
  const t = `Catalyst Cash — ${audit.date} — ${p.status}\nNet Worth: ${p.netWorth != null ? fmt(p.netWorth) : "N/A"}\nMode: ${p.mode}\n${p.sections?.nextAction || ""}`;
  if (navigator.share)
    try {
      await navigator.share({ title: `Catalyst Cash — ${audit.date}`, text: t });
    } catch {
      // User cancellation is expected; clipboard fallback handles share unavailability.
    }
  else await navigator.clipboard?.writeText(t);
}

// ═══════════════════════════════════════════════════════════════
// HASHING UTILITY — Fast string fingerprinting for diff detection
// ═══════════════════════════════════════════════════════════════
export const cyrb53 = (str, seed = 0) => {
  let h1 = 0xdeadbeef ^ seed,
    h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};
