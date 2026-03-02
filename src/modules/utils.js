// ═══════════════════════════════════════════════════════════════
// STORAGE — Capacitor Preferences on iOS (iCloud KV-backed),
//           localStorage fallback on web / Vite dev server
// ═══════════════════════════════════════════════════════════════
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { APP_VERSION } from './constants.js';

import { registerPlugin } from '@capacitor/core';

import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';

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
  authenticate: async (opts) => {
    if (!Capacitor.isNativePlatform()) throw new Error("Not supported on web");
    return await BiometricAuth.authenticate(opts);
  }
};
export const PdfViewer = registerPlugin('PdfViewer');

export async function nativeExport(filename, content, mimeType = "text/plain", isBase64 = false) {
  if (Capacitor.isNativePlatform()) {
    try {
      const opts = { path: filename, data: content, directory: Directory.Cache, recursive: true };
      if (!isBase64) opts.encoding = 'utf8';
      const res = await Filesystem.writeFile(opts);
      await Share.share({ title: filename, url: res.uri, files: [res.uri], dialogTitle: 'Export File' });
    } catch (e) {
      console.error("Native export failed:", e);
      if (window.toast) window.toast.error("Export failed. Please check permissions.");
      throw e;
    }
  } else {
    // web fallback
    let blob;
    if (isBase64) {
      const byteCharacters = atob(content);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      blob = new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
    } else {
      blob = new Blob([content], { type: mimeType });
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }
}

export const db = {
  async get(k) {
    try {
      const { value } = await Preferences.get({ key: k });
      return value ? JSON.parse(value) : null;
    } catch {
      try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; }
    }
  },
  async set(k, v) {
    try {
      await Preferences.set({ key: k, value: JSON.stringify(v) });
      return true;
    } catch {
      try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
    }
  },
  async del(k) {
    try {
      await Preferences.remove({ key: k });
    } catch {
      try { localStorage.removeItem(k); } catch { }
    }
  },
  async keys() {
    try {
      const { keys } = await Preferences.keys();
      return keys;
    } catch {
      try { return Object.keys(localStorage); } catch { return []; }
    }
  },
  async clear() {
    try {
      await Preferences.clear();
    } catch {
      try { localStorage.clear(); } catch { }
    }
  }
};

export const fmt = n => {
  if (n == null || isNaN(n)) return "—";
  if (window.__privacyMode) return "$••••••";
  const neg = n < 0, abs = Math.abs(n);
  const s = abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return neg ? `-$${s}` : `$${s}`;
};

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
  } catch { return String(d); }
};

// Strip parenthetical clarifiers from paycheck labels in Next Action.
export const stripPaycheckParens = (text) => {
  if (!text) return text;
  return text.split("\n").map(line => (
    line.replace(/^(Pre-Paycheck|Post-Paycheck)\s*\([^)]*\)/i, "$1")
  )).join("\n");
};



// ═══════════════════════════════════════════════════════════════
// DATE AUTO-ADVANCE — Rolling expired dates forward
// ═══════════════════════════════════════════════════════════════
export function advanceExpiredDate(dateString, intervalAmt, intervalUnit, todayStr = new Date().toISOString().split("T")[0]) {
  if (!dateString) return dateString;
  if (dateString >= todayStr) return dateString; // not expired

  const d = new Date(dateString + 'T12:00:00Z'); // force midday UTC to avoid timezone shift
  const today = new Date(todayStr + 'T12:00:00Z');

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
  let str = String(value).trim();
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

export function parseJSON(raw) {
  let j;
  try {
    // Aggressive JSON extraction: strip ALL markdown wrappers and extract only the {} block
    let cleaned = raw.replace(/```json?\s*/gi, "").replace(/```/g, "").trim();
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
    console.warn("[parseJSON] JSON.parse failed:", e.message, "— raw length:", raw?.length, "— first 200 chars:", raw?.slice(0, 200));
    return null; // Stream hasn't finished accumulating enough valid JSON
  }

  // Handle snake_case keys from Gemini (header_card → headerCard)
  if (j && !j.headerCard && j.header_card) {
    j.headerCard = j.header_card;
    if (j.health_score) j.healthScore = j.health_score;
    if (j.alerts_card) j.alertsCard = j.alerts_card;
    if (j.dashboard_card) j.dashboardCard = j.dashboard_card;
    if (j.weekly_moves) j.weeklyMoves = j.weekly_moves;
    if (j.long_range_radar) j.longRangeRadar = j.long_range_radar;
    if (j.next_action) j.nextAction = j.next_action;
    if (j.milestones) j.milestones = j.milestones; // already camelCase
    if (j.investments) j.investments = j.investments; // already camelCase
  }

  // Schema Validation (Lightweight)
  if (!j || !j.headerCard) {
    console.warn("[parseJSON] Missing headerCard. Keys found:", j ? Object.keys(j).join(", ") : "null");
    return null;
  }

  // Map to the internal structure expected by ResultsView/Dashboard
  return {
    raw,
    status: j.headerCard?.status || "UNKNOWN",
    mode: "FULL", // Implicit in the new architecture unless overridden
    netWorth: parseCurrency(j.netWorth) ?? parseCurrency(j.investments?.netWorth) ?? parseCurrency(j.investments?.balance),
    netWorthDelta: j.netWorthDelta ?? j.investments?.netWorthDelta ?? null,
    healthScore: j.healthScore || null, // { score, grade, trend, summary }
    structured: j,
    sections: {
      header: `**${new Date().toISOString().split("T")[0]}** · FULL · ${j.headerCard?.status || "UNKNOWN"}`,
      alerts: (j.alertsCard || []).map(a => `⚠️ ${a}`).join("\n"),
      dashboard: (j.dashboardCard || []).map(d => `**${d.category}:** ${d.amount} ${d.status ? `(${d.status})` : ""}`).join("\n"),
      moves: (j.weeklyMoves || []).join("\n"),
      radar: (j.radar || []).map(r => `**${r.date}** ${r.item} ${r.amount}`).join("\n"),
      longRange: (j.longRangeRadar || []).map(r => `**${r.date}** ${r.item} ${r.amount}`).join("\n"),
      forwardRadar: (j.milestones || []).join("\n"), // Re-mapped milestones to forward radar slot for now
      investments: `**Balance:** ${j.investments?.balance || "N/A"}\n**As Of:** ${j.investments?.asOf || "N/A"}\n**Gate:** ${j.investments?.gateStatus || "N/A"}`,
      nextAction: j.nextAction || "",
      autoUpdates: "Handled natively via JSON output",
      qualityScore: "Strict JSON Mode Active"
    },
    // Map moves to actionable checkboxes
    moveItems: (j.weeklyMoves || []).map(m => ({ tag: null, text: m, done: false })),
    paceData: [], // Replaced by native dashboardCard logic going forward, kept for backwards compat
    dashboardData: {
      checkingBalance: null, // Extracted from dashboardCard dynamically on demand
      savingsVaultTotal: null
    }
  };
}

export function parseAudit(raw) {
  // We ONLY parse JSON now. Fallback markdown parsing is officially deprecated.
  return parseJSON(raw);
}

export function extractDashboardMetrics(parsed) {
  const structured = parsed?.structured || {};
  const legacy = structured.dashboard || parsed?.dashboardData || {};
  const legacyChecking = parseCurrency(legacy.checkingBalance);
  const legacyVault = parseCurrency(legacy.savingsVaultTotal || legacy.allyVaultTotal);
  const legacyPending = parseCurrency(legacy.next7DaysNeed);
  const legacyAvailable = parseCurrency(legacy.checkingProjEnd);

  const cardRows = Array.isArray(structured.dashboardCard) ? structured.dashboardCard : [];
  if (!cardRows.length) {
    return {
      checking: legacyChecking,
      vault: legacyVault,
      pending: legacyPending,
      debts: null,
      available: legacyAvailable
    };
  }

  const rowValue = {};
  for (const row of cardRows) {
    const key = String(row?.category || "").trim().toLowerCase();
    if (!key) continue;
    rowValue[key] = parseCurrency(row?.amount);
  }

  return {
    checking: rowValue.checking ?? legacyChecking,
    vault: rowValue.vault ?? rowValue.savings ?? legacyVault,
    investments: rowValue.investments ?? null,
    otherAssets: rowValue['other assets'] ?? null,
    pending: rowValue.pending ?? legacyPending,
    debts: rowValue.debts ?? null,
    available: rowValue.available ?? legacyAvailable
  };
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
      <p style="white-space: pre-wrap; font-size: 14px; line-height: 1.6; color: #374151; margin: 0;">${p.raw.replace(/</g, "&lt;")}</p>
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
    const [{ jsPDF }, html2canvas] = await Promise.all([
      import("jspdf"),
      import("html2canvas").then((m) => m.default)
    ]);

    // We want the highest quality render
    const canvas = await html2canvas(container, {
      scale: window.devicePixelRatio || 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#FFFFFF"
    });

    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "letter"
    });

    // Letter dimensions in pt: 612 x 792
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);

    const pdfBase64 = pdf.output('datauristring').split(',')[1];
    await nativeExport(`CatalystCash_CPA_TearSheet_${dateStr}.pdf`, pdfBase64, "application/pdf", true);

  } catch (err) {
    if (!err.message?.toLowerCase().includes("cancel")) {
      console.error("PDF generation failed:", err);
      // Fallback
      const h = `<!DOCTYPE html><html><body>${container.innerHTML}</body></html>`;
      await nativeExport(`CatalystCash_Audit_${dateStr}.html`, h, "text/html");
    }
  } finally {
    document.body.removeChild(container);
  }
}

export async function exportAllAudits(audits) {
  if (!audits?.length) return;
  const payload = {
    app: "Catalyst Cash", version: APP_VERSION,
    exportedAt: new Date().toISOString(), count: audits.length, audits
  };
  await nativeExport(`CatalystCash_ALL_${new Date().toISOString().split("T")[0]}.json`, JSON.stringify(payload, null, 2), "application/json");
}

export async function exportSelectedAudits(audits) {
  if (!audits?.length) return;
  const payload = {
    app: "Catalyst Cash", version: APP_VERSION,
    exportedAt: new Date().toISOString(), count: audits.length, audits
  };
  await nativeExport(`CatalystCash_Selected_${audits.length}_${new Date().toISOString().split("T")[0]}.json`, JSON.stringify(payload, null, 2), "application/json");
}

export async function exportAuditCSV(audits) {
  if (!audits?.length) return;
  const rows = [["Date", "Status", "Mode", "Net Worth", "Net Worth Delta", "Checking", "Vault", "Pending", "Debts", "Available"]];
  audits.forEach(a => {
    const p = a.parsed;
    const d = extractDashboardMetrics(p);
    rows.push([a.date, p?.status || "", p?.mode || "", p?.netWorth ?? ""
      , p?.netWorthDelta || "", d.checking ?? "", d.vault ?? "", d.pending ?? "", d.debts ?? "", d.available ?? ""]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  await nativeExport(`CatalystCash_History_${new Date().toISOString().split("T")[0]}.csv`, csv, "text/csv");
}

export async function shareAudit(audit) {
  const p = audit.parsed;
  const t = `Catalyst Cash — ${audit.date} — ${p.status}\nNet Worth: ${p.netWorth != null ? fmt(p.netWorth) : "N/A"}\nMode: ${p.mode}\n${p.sections?.nextAction || ""}`;
  if (navigator.share) try { await navigator.share({ title: `Catalyst Cash — ${audit.date}`, text: t }) } catch { }
  else await navigator.clipboard?.writeText(t);
}

// ═══════════════════════════════════════════════════════════════
// HASHING UTILITY — Fast string fingerprinting for diff detection
// ═══════════════════════════════════════════════════════════════
export const cyrb53 = (str, seed = 0) => {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};
