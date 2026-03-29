import { extractDashboardMetrics, fmt } from "./utils.js";

function normalizeExportValue(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map((entry) => normalizeExportValue(entry)).filter(Boolean).join(" | ");
  if (typeof value === "object") {
    if (typeof value.title === "string" || typeof value.detail === "string") {
      return [value.title, value.detail, value.amount].filter(Boolean).join(" — ");
    }
    if (typeof value.level === "string") {
      return `[${String(value.level).toUpperCase()}] ${[value.title, value.detail].filter(Boolean).join(": ")}`;
    }
    if (typeof value.status === "string") {
      return [value.title, value.subtitle, value.status].filter(Boolean).join(" — ");
    }
    if (typeof value.item === "string") {
      return [value.date, value.item, value.amount].filter(Boolean).join(" — ");
    }
    return JSON.stringify(value);
  }
  return String(value);
}

function normalizeList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map((entry) => normalizeExportValue(entry)).filter(Boolean);
  const normalized = normalizeExportValue(value);
  return normalized ? [normalized] : [];
}

function htmlEscape(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildAuditHtmlDocument(audit, dateStr) {
  const parsed = audit?.parsed || {};
  const metrics = extractDashboardMetrics(parsed);
  const safeDateStr = htmlEscape(dateStr);
  const statusColor = parsed.status === "GREEN" ? "#059669" : parsed.status === "YELLOW" ? "#D97706" : "#DC2626";
  const bgStatus = parsed.status === "GREEN" ? "#ECFDF5" : parsed.status === "YELLOW" ? "#FFFBEB" : "#FEF2F2";

  const header = `
    <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #E5E7EB; padding-bottom: 20px; margin-bottom: 30px;">
      <div>
        <h1 style="font-size: 28px; font-weight: 800; color: #111827; margin: 0 0 4px 0;">Catalyst Cash — Financial Audit</h1>
        <p style="font-size: 14px; color: #6B7280; font-weight: 500; margin: 0;">PREPARED FOR CPA / ADVISORY REVIEW</p>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 14px; color: #374151; font-weight: 600;">DATE EXECUTED</div>
        <div style="font-size: 14px; color: #6B7280;">${safeDateStr}</div>
      </div>
    </div>
  `;

  const hero = `
    <div style="display: flex; gap: 20px; margin-bottom: 30px;">
      <div style="flex: 1; padding: 20px; background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px;">
        <div style="font-size: 12px; font-weight: 700; color: #6B7280; text-transform: uppercase; margin-bottom: 8px;">Net Worth Estimate</div>
        <div style="font-size: 32px; font-weight: 800; color: #111827;">${parsed.netWorth != null ? fmt(parsed.netWorth) : "—"}</div>
      </div>
      <div style="flex: 1; padding: 20px; background-color: ${bgStatus}; border: 1px solid ${statusColor}30; border-radius: 8px;">
        <div style="font-size: 12px; font-weight: 700; color: ${statusColor}; text-transform: uppercase; margin-bottom: 8px;">Audit Status</div>
        <div style="font-size: 24px; font-weight: 800; color: ${statusColor};">${htmlEscape(parsed.status || "—")}</div>
      </div>
      <div style="flex: 1; padding: 20px; background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px;">
        <div style="font-size: 12px; font-weight: 700; color: #6B7280; text-transform: uppercase; margin-bottom: 8px;">Audit Engine</div>
        <div style="font-size: 20px; font-weight: 800; color: #111827;">${htmlEscape(parsed.mode || "Standard")} Mode</div>
      </div>
    </div>
  `;

  const metricRows = [
    ["Checking", metrics.checking != null ? fmt(metrics.checking) : "—"],
    ["Vault", metrics.vault != null ? fmt(metrics.vault) : "—"],
    ["Pending", metrics.pending != null ? fmt(metrics.pending) : "—"],
    ["Debts", metrics.debts != null ? fmt(metrics.debts) : "—"],
    ["Available", metrics.available != null ? fmt(metrics.available) : "—"],
    ["Health Score", parsed?.healthScore?.score != null ? String(parsed.healthScore.score) : "—"],
  ]
    .map(([label, value]) => `<tr><td style="padding: 8px 10px; border-bottom: 1px solid #E5E7EB; color: #6B7280;">${htmlEscape(label)}</td><td style="padding: 8px 10px; border-bottom: 1px solid #E5E7EB; color: #111827; font-weight: 600;">${htmlEscape(value)}</td></tr>`)
    .join("");

  const listSections = [
    ["Alerts", normalizeList(parsed?.alertsCard)],
    ["Weekly Moves", normalizeList(parsed?.weeklyMoves)],
    ["Risk Flags", normalizeList(parsed?.structured?.riskFlags || parsed?.degraded?.riskFlags)],
    ["Action Items", normalizeList((parsed?.moveItems || []).map((item) => item?.text || ""))],
  ]
    .filter(([, items]) => items.length > 0)
    .map(
      ([title, items]) => `
        <div style="margin-top: 24px;">
          <h3 style="font-size: 15px; font-weight: 700; color: #111827; margin: 0 0 10px 0;">${htmlEscape(title)}</h3>
          <ul style="margin: 0; padding-left: 20px; color: #374151; line-height: 1.6;">
            ${items.map((item) => `<li>${htmlEscape(item)}</li>`).join("")}
          </ul>
        </div>
      `
    )
    .join("");

  const content = `
    <h2 style="font-size: 18px; font-weight: 700; color: #111827; border-bottom: 1px solid #E5E7EB; padding-bottom: 8px; margin-bottom: 16px;">Executive AI Summary</h2>
    <div style="background-color: #F9FAFB; padding: 20px; border-radius: 8px; border: 1px solid #E5E7EB; margin-bottom: 30px;">
      <p style="white-space: pre-wrap; font-size: 14px; line-height: 1.6; color: #374151; margin: 0;">${htmlEscape(
        [
          parsed?.healthScore?.summary,
          normalizeExportValue(parsed?.structured?.nextAction || parsed?.sections?.nextAction),
          ...normalizeList(parsed?.alertsCard).slice(0, 2),
        ].filter(Boolean).join(" ")
      )}</p>
    </div>
    <h2 style="font-size: 18px; font-weight: 700; color: #111827; border-bottom: 1px solid #E5E7EB; padding-bottom: 8px; margin-bottom: 16px;">Financial Snapshot</h2>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <tbody>${metricRows}</tbody>
    </table>
    ${listSections}
  `;

  const footer = `
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #E5E7EB; text-align: center; font-size: 12px; color: #9CA3AF;">
      Generated securely on-device by Catalyst Cash CatalystCash.app
    </div>
  `;

  return `<!DOCTYPE html><html><body style="width:800px;padding:40px;background:#FFFFFF;color:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${header}${hero}${content}${footer}</body></html>`;
}
