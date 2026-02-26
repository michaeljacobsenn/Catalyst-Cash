// ═══════════════════════════════════════════════════════════════
// STORAGE — Capacitor Preferences on iOS (iCloud KV-backed),
//           localStorage fallback on web / Vite dev server
// ═══════════════════════════════════════════════════════════════
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

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
      const opts = { path: filename, data: content, directory: Directory.Documents, recursive: true };
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
    const [y, m, day] = d.split("-").map(Number);
    const date = new Date(y, m - 1, day);
    return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  } catch { return d; }
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

  // Protect against infinite loops by hardcapping iterations
  let loops = 0;
  while (d < today && loops < 1000) {
    loops++;
    let originalDay = d.getUTCDate();

    if (intervalUnit === "days") {
      d.setUTCDate(d.getUTCDate() + intervalAmt);
    } else if (intervalUnit === "weeks") {
      d.setUTCDate(d.getUTCDate() + (intervalAmt * 7));
    } else if (intervalUnit === "years" || intervalUnit === "yearly" || intervalUnit === "annual") {
      d.setUTCFullYear(d.getUTCFullYear() + intervalAmt);
    } else {
      // Default to months
      d.setUTCMonth(d.getUTCMonth() + intervalAmt);
      // JS Date quirk: Jan 31 + 1 month = Mar 2 or 3. 
      // Rollback to end of target month if day overflowed (e.g., set to Feb 28).
      if (d.getUTCDate() < originalDay) {
        d.setUTCDate(0);
      }
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
  const n = parseFloat(String(value).replace(/[^0-9.-]+/g, ""));
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
    netWorth: parseCurrency(j.investments?.netWorth) ?? parseCurrency(j.investments?.balance),
    netWorthDelta: j.investments?.netWorthDelta || null,
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
      allyVaultTotal: null
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
  const legacyVault = parseCurrency(legacy.allyVaultTotal);
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
    pending: rowValue.pending ?? legacyPending,
    debts: rowValue.debts ?? null,
    available: rowValue.available ?? legacyAvailable
  };
}

export async function exportAudit(audit) {
  const p = audit.parsed;
  const h = `<!DOCTYPE html><html><head><meta charset=utf-8><title>Catalyst Cash ${audit.date}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#060910;color:#E6EDF3;padding:20px;max-width:600px;margin:0 auto}
.c{background:#0D1117;border:1px solid rgba(240,246,252,.06);border-radius:14px;padding:18px;margin-bottom:12px}
.m{font-family:monospace;font-weight:600}h2{font-size:14px;color:#8B949E;margin:12px 0 6px}
pre{white-space:pre-wrap;font-size:11px;line-height:1.6;color:#8B949E}</style></head><body>
<div class=c><span class=m style="color:${p.status === "GREEN" ? "#3FB950" : p.status === "YELLOW" ? "#D29922" : "#F85149"}">${p.status}</span>
<span class=m style="color:#484F58;margin-left:8px">v1 · ${audit.date}</span>
<h1 style="font-size:20px;margin-top:8px">${p.mode} Mode Audit</h1></div>
<div class=c style="text-align:center"><div class=m style="font-size:32px;color:#00D4AA">${p.netWorth != null ? fmt(p.netWorth) : "—"}</div>
<div style="font-size:11px;color:#484F58;margin-top:4px">NET WORTH</div></div>
<div class=c><h2>Full Output</h2><pre>${p.raw.replace(/</g, "&lt;")}</pre></div>
<div style="text-align:center;color:#30363D;font-size:11px;padding:20px">Catalyst Cash · ${new Date().toISOString().split("T")[0]}</div></body></html>`;
  await nativeExport(`CatalystCash_Audit_${audit.date}.html`, h, "text/html");
}

export async function exportAllAudits(audits) {
  if (!audits?.length) return;
  const payload = {
    app: "Catalyst Cash", version: "1.5-BETA",
    exportedAt: new Date().toISOString(), count: audits.length, audits
  };
  await nativeExport(`CatalystCash_ALL_${new Date().toISOString().split("T")[0]}.json`, JSON.stringify(payload, null, 2), "application/json");
}

export async function exportSelectedAudits(audits) {
  if (!audits?.length) return;
  const payload = {
    app: "Catalyst Cash", version: "1.5-BETA",
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
