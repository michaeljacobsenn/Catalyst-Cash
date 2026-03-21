// ═══════════════════════════════════════════════════════════════
// STORAGE — Capacitor Preferences on iOS (iCloud KV-backed),
//           localStorage fallback on web / Vite dev server
// ═══════════════════════════════════════════════════════════════
  import { Capacitor } from "@capacitor/core";
  import { Directory,Filesystem } from "@capacitor/filesystem";
  import { Preferences } from "@capacitor/preferences";
  import { Share } from "@capacitor/share";
  import { APP_VERSION } from "./constants.js";
  import { buildDashboardSafetyModel } from "./dashboard/safetyModel.js";
  import { clamp, getGradeLetter } from "./mathHelpers.js";

  import { registerPlugin } from "@capacitor/core";

  import { BiometricAuth } from "@aparajita/capacitor-biometric-auth";

export const FaceId = {
  isAvailable: async () => {
    try {
      if (!Capacitor.isNativePlatform()) return { isAvailable: false };
      return await BiometricAuth.checkBiometry();
    } catch (e) {
      console.warn("Biometry check failed:", e);
      return { isAvailable: false };
    }
  },
  authenticate: async opts => {
    if (!Capacitor.isNativePlatform()) throw new Error("Not supported on web");
    return await BiometricAuth.authenticate(opts);
  },
};
export const PdfViewer = registerPlugin("PdfViewer");
export const ExportFile = registerPlugin("ExportFile");

const _exportLocks = {};
const EXPORT_ERROR_MESSAGES = {
  nativeUnavailable: "Export is unavailable in this build. Rebuild the iPhone app and try again.",
};

function isUnimplementedPluginError(error) {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || error || "").toLowerCase();
  return code === "UNIMPLEMENTED" || message.includes("unimplemented") || message.includes("not implemented");
}

function decodeBase64ToBlob(base64, mimeType) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
}

function createExportBlob(content, mimeType, isBase64) {
  if (isBase64) return decodeBase64ToBlob(content, mimeType);
  return new Blob([content], { type: mimeType });
}

async function triggerBrowserDownload(filename, content, mimeType, isBase64 = false) {
  const blob = createExportBlob(content, mimeType, isBase64);
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return { completed: true, source: "browser" };
}

async function writeNativeExportFile(filename, content, isBase64 = false) {
  const exportPath = `exports/${Date.now()}-${filename}`;
  const options = {
    path: exportPath,
    data: content,
    directory: Directory.Cache,
    recursive: true,
  };
  if (!isBase64) options.encoding = "utf8";
  const result = await Filesystem.writeFile(options);
  return {
    path: exportPath,
    uri: result?.uri || null,
  };
}

async function cleanupNativeExportFile(path) {
  if (!path) return;
  try {
    await Filesystem.deleteFile({
      path,
      directory: Directory.Cache,
    });
  } catch {
    // Best-effort cleanup only.
  }
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function buildCsvContent(rows) {
  return rows.map(row => row.map(csvEscape).join(",")).join("\n");
}

function normalizeExportValue(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.filter(Boolean).join(" | ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function pushAuditExportRow(rows, section, field, value) {
  const normalized = normalizeExportValue(value);
  if (!normalized) return;
  rows.push([section, field, normalized]);
}

function buildSingleAuditCsv(audit) {
  const parsed = audit?.parsed || {};
  const metrics = extractDashboardMetrics(parsed);
  const rows = [["Section", "Field", "Value"]];

  pushAuditExportRow(rows, "Audit", "Executed On", audit?.date || "");
  pushAuditExportRow(rows, "Audit", "Timestamp", audit?.ts || "");
  pushAuditExportRow(rows, "Audit", "Status", parsed?.status || "");
  pushAuditExportRow(rows, "Audit", "Mode", parsed?.mode || "");
  pushAuditExportRow(rows, "Audit", "Model", audit?.model || "");
  pushAuditExportRow(rows, "Audit", "Net Worth", parsed?.netWorth ?? "");
  pushAuditExportRow(rows, "Audit", "Net Worth Delta", parsed?.netWorthDelta ?? "");
  pushAuditExportRow(rows, "Audit", "Health Score", parsed?.healthScore?.score ?? "");
  pushAuditExportRow(rows, "Audit", "Health Grade", parsed?.healthScore?.grade ?? "");
  pushAuditExportRow(rows, "Cash", "Checking", metrics.checking ?? "");
  pushAuditExportRow(rows, "Cash", "Vault", metrics.vault ?? "");
  pushAuditExportRow(rows, "Cash", "Pending", metrics.pending ?? "");
  pushAuditExportRow(rows, "Cash", "Debts", metrics.debts ?? "");
  pushAuditExportRow(rows, "Cash", "Available", metrics.available ?? "");
  pushAuditExportRow(rows, "Narrative", "Headline", parsed?.structured?.headerCard?.headline ?? "");
  pushAuditExportRow(rows, "Narrative", "Next Action", parsed?.nextAction || parsed?.sections?.nextAction || "");
  pushAuditExportRow(rows, "Narrative", "Alerts", parsed?.alertsCard || []);
  pushAuditExportRow(rows, "Narrative", "Weekly Moves", parsed?.weeklyMoves || []);
  pushAuditExportRow(rows, "Narrative", "Risk Flags", parsed?.structured?.riskFlags || parsed?.degraded?.riskFlags || []);
  pushAuditExportRow(rows, "Narrative", "Executive Summary", parsed?.raw || "");

  (parsed?.dashboardCard || []).forEach((row, index) => {
    pushAuditExportRow(rows, "Dashboard", `Card ${index + 1} Category`, row?.category || "");
    pushAuditExportRow(rows, "Dashboard", `Card ${index + 1} Amount`, row?.amount || "");
    pushAuditExportRow(rows, "Dashboard", `Card ${index + 1} Status`, row?.status || "");
  });

  (parsed?.moveItems || []).forEach((move, index) => {
    pushAuditExportRow(rows, "Moves", `Move ${index + 1}`, move?.text || "");
  });

  return buildCsvContent(rows);
}

export async function nativeExport(filename, content, mimeType = "text/plain", isBase64 = false) {
  if (_exportLocks[filename] && Date.now() - _exportLocks[filename] < 1500) return;
  _exportLocks[filename] = Date.now();

  if (Capacitor.isNativePlatform()) {
    let preparedFile = null;
    try {
      preparedFile = await writeNativeExportFile(filename, content, isBase64);
      if (!preparedFile?.uri) {
        throw new Error("Native export file could not be created.");
      }
      await Share.share({
        title: filename,
        text: filename,
        dialogTitle: "Export File",
        files: [preparedFile.uri],
      });
      return { completed: true, source: "capacitor", path: preparedFile.uri };
    } catch (e) {
      const isCancel = isUserCancelledShare(e);
      if (isCancel) {
        return { completed: false, source: "native" };
      }
      console.error("Native export failed:", e);
      try {
        const pluginResult = await ExportFile.share({ filename, data: content, mimeType, isBase64 });
        if (pluginResult?.completed === false) {
          return { completed: false, source: "native" };
        }
        return pluginResult ?? { completed: true, source: "native-plugin" };
      } catch (fallbackError) {
        console.error("Capacitor export fallback failed:", fallbackError);
        const isFallbackCancel = isUserCancelledShare(fallbackError);
        if (isFallbackCancel) {
          return { completed: false, source: "native" };
        }
        const nativeUnavailable = isUnimplementedPluginError(e) || isUnimplementedPluginError(fallbackError);
        if (nativeUnavailable && Capacitor.getPlatform() === "ios") {
          const error = new Error(EXPORT_ERROR_MESSAGES.nativeUnavailable);
          if (window.toast?.error) window.toast.error(error.message);
          throw error;
        }
        if (nativeUnavailable) {
          if (window.toast?.info) window.toast.info(EXPORT_ERROR_MESSAGES.nativeUnavailable);
          return await triggerBrowserDownload(filename, content, mimeType, isBase64);
        }
        if (window.toast?.error) window.toast.error("Export failed. Please check permissions.");
        throw fallbackError;
      }
    } finally {
      if (preparedFile?.path) {
        setTimeout(() => {
          void cleanupNativeExportFile(preparedFile.path);
        }, 60_000);
      }
    }
  }
  return await triggerBrowserDownload(filename, content, mimeType, isBase64);
}

function isUserCancelledShare(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("cancel") || message.includes("user interaction");
}

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
    } catch (e) {
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

const DASHBOARD_ROW_ORDER = ["Checking", "Vault", "Pending", "Debts", "Available"];

function normalizeDashboardCard(value) {
  const rows = Array.isArray(value) ? value : [];
  const byCategory = new Map();
  const nonCanonicalCategories = [];
  for (const row of rows) {
    const rawCategory = typeof row?.category === "string" ? row.category.trim() : "";
    if (!rawCategory) continue;
    const category = CANONICAL_DASHBOARD_CATEGORIES.get(rawCategory.toLowerCase());
    if (!category) {
      nonCanonicalCategories.push(rawCategory);
      continue;
    }
    if (byCategory.has(category)) continue;
    byCategory.set(category, {
      category,
      amount: typeof row?.amount === "string" ? row.amount : "$0.00",
      status: typeof row?.status === "string" ? row.status : "",
    });
  }
  return {
    rows: DASHBOARD_ROW_ORDER.map(category => byCategory.get(category) || { category, amount: "$0.00", status: "" }),
    nonCanonicalCategories: [...new Set(nonCanonicalCategories)],
  };
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
    console.warn("[parseJSON] JSON.parse failed:", e.message, "— raw length:", raw?.length);
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
    console.warn("[parseJSON] Missing headerCard. Keys found:", j ? Object.keys(j).join(", ") : "null");
    return null;
  }

  // Map to the internal structure expected by ResultsView/Dashboard
  const weeklyMoves = normalizeStringArray(j.weeklyMoves);
  const alertsCard = normalizeStringArray(j.alertsCard);
  const { rows: dashboardCard, nonCanonicalCategories } = normalizeDashboardCard(j.dashboardCard);
  const investments = normalizeInvestmentsSummary(j.investments);
  const spendingAnalysis = normalizeSpendingAnalysis(j.spendingAnalysis);
  const negotiationTargets = normalizeNegotiationTargets(j.negotiationTargets);
  const normalizedHealthScore = normalizeHealthScore(j.healthScore);
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
  return {
    raw,
    status: j.headerCard?.status || j.status || j.headerCard?.headline || "UNKNOWN",
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
    structured: j,
    sections: {
      header: `**${new Date().toISOString().split("T")[0]}** · FULL · ${j.headerCard?.status || "UNKNOWN"}`,
      alerts: alertsCard
        .map(
          a =>
            `⚠️ ${String(a)
              .replace(/^(?:!|\s|\u26A0|\uFE0F|\u2757|\u203C)+/u, "")
              .trim()}`
        )
        .join("\n"),
      dashboard: dashboardCard
        .map(d => `**${d.category}:** ${d.amount} ${d.status ? `(${d.status})` : ""}`)
        .join("\n"),
      moves: weeklyMoves.join("\n"),
      radar: (j.radar || []).map(r => `**${r.date}** ${r.item} ${r.amount}`).join("\n"),
      longRange: (j.longRangeRadar || []).map(r => `**${r.date}** ${r.item} ${r.amount}`).join("\n"),
      forwardRadar: (j.milestones || []).join("\n"), // Re-mapped milestones to forward radar slot for now
      investments: `**Balance:** ${investments?.balance || "N/A"}\n**As Of:** ${investments?.asOf || "N/A"}\n**Gate:** ${investments?.gateStatus || "N/A"}`,
      nextAction: j.nextAction || "",
      autoUpdates: "Handled natively via JSON output",
      qualityScore: "Strict JSON Mode Active",
    },
    // Map moves to actionable checkboxes
    moveItems: weeklyMoves.map(m => ({ tag: null, text: m, done: false })),
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
 * }} [options]
 * @returns {import("../types/index.js").ParsedAudit | null}
 */
export function validateParsedAuditConsistency(parsed, options = {}) {
  if (!parsed) return null;

  const {
    operationalSurplus = null,
    nativeScore = null,
    nativeRiskFlags = null,
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
    console.warn(
      "[audit] Non-canonical dashboard categories detected:",
      consistency.nonCanonicalDashboardCategories.join(", ")
    );
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
      console.warn(
        `[audit] Health score deviated materially from native anchor (${scoreDelta > 0 ? "+" : ""}${scoreDelta}). Re-anchoring to ${expectedNativeScore}.`
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
      console.warn(
        `[audit] Weekly moves under-allocate operational surplus by $${shortfall.toFixed(2)}.`,
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
      `Transfer $${Number(computedStrategy.requiredTransfer).toFixed(2)} from savings to checking to protect your floor.`
    );
  }
  if (computedStrategy?.debtStrategy?.target && (computedStrategy?.debtStrategy?.amount || 0) > 0) {
    weeklyMoves.push(
      `Route $${Number(computedStrategy.debtStrategy.amount).toFixed(2)} to ${computedStrategy.debtStrategy.target} this week.`
    );
  }
  if (weeklyMoves.length === 0) {
    if (riskFlags.length > 0) {
      weeklyMoves.push(`Prioritize ${formatRiskFlag(riskFlags[0]).toLowerCase()} before optional spending this week.`);
    } else {
      weeklyMoves.push("Hold spending to preserve your cash buffer this week.");
    }
  }

  const alertsCard = [
    "Full AI narrative unavailable — showing deterministic engine output only.",
    ...riskFlags.slice(0, 3).map(flag => `Risk flag: ${formatRiskFlag(flag)}`),
  ];

  const dashboardCard = [
    { category: "Checking", amount: fmt(checking), status: safetySnapshot.level === "urgent" ? "At risk" : "Tracked" },
    { category: "Vault", amount: fmt(savings), status: savings > 0 ? "Tracked" : "Empty" },
    { category: "Pending", amount: fmt(pendingCharges), status: pendingCharges > 0 ? "Watch" : "Clear" },
    { category: "Debts", amount: fmt(computedStrategy?.auditSignals?.debt?.total || 0), status: riskFlags.includes("toxic-apr") ? "Urgent" : "Tracked" },
    { category: "Available", amount: fmt(operationalSurplus), status: operationalSurplus > 0 ? "Deploy" : "Protected" },
  ];

  const nextAction = weeklyMoves[0] || safetySnapshot.summary;
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
    weeklyMoves,
    spendingAnalysis: null,
    structured: {
      headerCard: {
        status,
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
      alertsCard,
      longRangeRadar: [],
      milestones: [],
      negotiationTargets: [],
      nextAction,
      riskFlags,
    },
    sections: {
      header: `**${dateLabel}** · DEGRADED · ${status}`,
      alerts: alertsCard.map(item => `⚠️ ${item}`).join("\n"),
      dashboard: dashboardCard.map(row => `**${row.category}:** ${row.amount} (${row.status})`).join("\n"),
      moves: weeklyMoves.join("\n"),
      radar: "",
      longRange: "",
      forwardRadar: riskSummary,
      investments: "Native fallback active",
      nextAction,
      autoUpdates: "Deterministic fallback active",
      qualityScore: "Full AI narrative unavailable",
    },
    moveItems: weeklyMoves.map(text => ({ tag: null, text, done: false })),
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
      weeklyMoveDollarTotal: extractDollarAmountTotal(weeklyMoves),
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

// Safely escape all HTML special characters to prevent XSS injection
// via user-controlled content rendered into innerHTML (PDF export).
function htmlEscape(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function exportAudit(audit) {
  const p = audit.parsed;
  const dateStr = audit.date || new Date().toISOString().split("T")[0];

  // Create an off-screen container for the tear-sheet
  const container = document.createElement("div");
  container.style.width = "800px";
  container.style.padding = "40px";
  container.style.backgroundColor = "#FFFFFF";
  container.style.color = "#111827";
  container.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "0";

  // Brand Header
  const header = `
    <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #E5E7EB; padding-bottom: 20px; margin-bottom: 30px;">
      <div>
        <h1 style="font-size: 28px; font-weight: 800; color: #111827; margin: 0 0 4px 0;">Catalyst Cash — Financial Audit</h1>
        <p style="font-size: 14px; color: #6B7280; font-weight: 500; margin: 0;">PREPARED FOR CPA / ADVISORY REVIEW</p>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 14px; color: #374151; font-weight: 600;">DATE EXECUTED</div>
        <div style="font-size: 14px; color: #6B7280;">${dateStr}</div>
      </div>
    </div>
  `;

  // Hero Metrics & Health
  const statusColor = p.status === "GREEN" ? "#059669" : p.status === "YELLOW" ? "#D97706" : "#DC2626";
  const bgStatus = p.status === "GREEN" ? "#ECFDF5" : p.status === "YELLOW" ? "#FFFBEB" : "#FEF2F2";

  const hero = `
    <div style="display: flex; gap: 20px; margin-bottom: 30px;">
      <div style="flex: 1; padding: 20px; background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px;">
        <div style="font-size: 12px; font-weight: 700; color: #6B7280; text-transform: uppercase; margin-bottom: 8px;">Net Worth Estimate</div>
        <div style="font-size: 32px; font-weight: 800; color: #111827;">${p.netWorth != null ? fmt(p.netWorth) : "—"}</div>
      </div>
      <div style="flex: 1; padding: 20px; background-color: ${bgStatus}; border: 1px solid ${statusColor}30; border-radius: 8px;">
        <div style="font-size: 12px; font-weight: 700; color: ${statusColor}; text-transform: uppercase; margin-bottom: 8px;">Audit Status</div>
        <div style="font-size: 24px; font-weight: 800; color: ${statusColor};">${p.status}</div>
      </div>
      <div style="flex: 1; padding: 20px; background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px;">
        <div style="font-size: 12px; font-weight: 700; color: #6B7280; text-transform: uppercase; margin-bottom: 8px;">Audit Engine</div>
        <div style="font-size: 20px; font-weight: 800; color: #111827;">${p.mode || "Standard"} Mode</div>
      </div>
    </div>
  `;

  // Raw / structured content
  const content = `
    <h2 style="font-size: 18px; font-weight: 700; color: #111827; border-bottom: 1px solid #E5E7EB; padding-bottom: 8px; margin-bottom: 16px;">Executive AI Summary</h2>
    <div style="background-color: #F9FAFB; padding: 20px; border-radius: 8px; border: 1px solid #E5E7EB; margin-bottom: 30px;">
      <p style="white-space: pre-wrap; font-size: 14px; line-height: 1.6; color: #374151; margin: 0;">${htmlEscape(p.raw)}</p>
    </div>
  `;

  const footer = `
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #E5E7EB; text-align: center; font-size: 12px; color: #9CA3AF;">
      Generated securely on-device by Catalyst Cash CatalystCash.app
    </div>
  `;

  container.innerHTML = header + hero + content + footer;
  document.body.appendChild(container);

  try {
    // Dynamically import to keep bundle size small if users don't export often
    const [{ jsPDF }, html2canvas] = await Promise.all([import("jspdf"), import("html2canvas").then(m => m.default)]);

    // We want the highest quality render
    const canvas = await html2canvas(container, {
      scale: window.devicePixelRatio || 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#FFFFFF",
    });

    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "letter",
    });

    // Letter dimensions in pt: 612 x 792
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);

    const pdfBase64 = pdf.output("datauristring").split(",")[1];
    return await nativeExport(`CatalystCash_CPA_TearSheet_${dateStr}.pdf`, pdfBase64, "application/pdf", true);
  } catch (err) {
    const isCancel = isUserCancelledShare(err);
    if (!isCancel) {
      console.error("PDF generation or Share sheet failed:", err);
      // Fallback
      const h = `<!DOCTYPE html><html><body>${container.innerHTML}</body></html>`;
      return await nativeExport(`CatalystCash_Audit_${dateStr}.html`, h, "text/html");
    }
    return { completed: false, source: "native" };
  } finally {
    document.body.removeChild(container);
  }
}

export async function exportAuditJson(audit) {
  if (!audit) return;
  const payload = {
    app: "Catalyst Cash",
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    type: "single-audit",
    audit,
  };
  return await nativeExport(
    `CatalystCash_Audit_${audit.date || new Date().toISOString().split("T")[0]}.json`,
    JSON.stringify(payload, null, 2),
    "application/json"
  );
}

export async function exportAuditCsv(audit) {
  if (!audit) return;
  const csv = buildSingleAuditCsv(audit);
  return await nativeExport(
    `CatalystCash_Audit_${audit.date || new Date().toISOString().split("T")[0]}.csv`,
    csv,
    "text/csv"
  );
}

export async function exportAllAudits(audits) {
  if (!audits?.length) return;
  const payload = {
    app: "Catalyst Cash",
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    count: audits.length,
    audits,
  };
  return await nativeExport(
    `CatalystCash_ALL_${new Date().toISOString().split("T")[0]}.json`,
    JSON.stringify(payload, null, 2),
    "application/json"
  );
}

export async function exportSelectedAudits(audits) {
  if (!audits?.length) return;
  const payload = {
    app: "Catalyst Cash",
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    count: audits.length,
    audits,
  };
  return await nativeExport(
    `CatalystCash_Selected_${audits.length}_${new Date().toISOString().split("T")[0]}.json`,
    JSON.stringify(payload, null, 2),
    "application/json"
  );
}

export async function exportAuditCSV(audits) {
  if (!audits?.length) return;
  const rows = [
    ["Date", "Status", "Mode", "Net Worth", "Net Worth Delta", "Checking", "Vault", "Pending", "Debts", "Available"],
  ];
  audits.forEach(a => {
    const p = a.parsed;
    const d = extractDashboardMetrics(p);
    rows.push([
      a.date,
      p?.status || "",
      p?.mode || "",
      p?.netWorth ?? "",
      p?.netWorthDelta || "",
      d.checking ?? "",
      d.vault ?? "",
      d.pending ?? "",
      d.debts ?? "",
      d.available ?? "",
    ]);
  });
  const csv = buildCsvContent(rows);
  return await nativeExport(`CatalystCash_History_${new Date().toISOString().split("T")[0]}.csv`, csv, "text/csv");
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
