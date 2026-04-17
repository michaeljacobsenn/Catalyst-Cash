import { APP_VERSION } from "./constants.js";
import { log } from "./logger.js";
import { extractDashboardMetrics } from "./auditExportMetrics.js";
import { nativeExport } from "./nativeExport.js";

function normalizeList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map((entry) => normalizeExportValue(entry)).filter(Boolean);
  const normalized = normalizeExportValue(value);
  return normalized ? [normalized] : [];
}

function summarizeAuditObject(value) {
  if (!value || typeof value !== "object") return "";
  if (typeof value.title === "string" || typeof value.detail === "string") {
    const parts = [value.title, value.detail, value.amount].filter(Boolean);
    return parts.join(" — ");
  }
  if (typeof value.level === "string" && (typeof value.title === "string" || typeof value.detail === "string")) {
    return `[${String(value.level).toUpperCase()}] ${[value.title, value.detail].filter(Boolean).join(": ")}`;
  }
  if (typeof value.status === "string" && (typeof value.title === "string" || typeof value.subtitle === "string")) {
    return [value.title, value.subtitle, value.status].filter(Boolean).join(" — ");
  }
  if (typeof value.item === "string") {
    return [value.date, value.item, value.amount].filter(Boolean).join(" — ");
  }
  return JSON.stringify(value);
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function buildCsvContent(rows) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function normalizeExportValue(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map((entry) => normalizeExportValue(entry)).filter(Boolean).join(" | ");
  if (typeof value === "object") return summarizeAuditObject(value);
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
  pushAuditExportRow(rows, "Narrative", "Headline", normalizeExportValue(parsed?.structured?.headerCard || ""));
  pushAuditExportRow(rows, "Narrative", "Next Action", normalizeExportValue(parsed?.structured?.nextAction || parsed?.sections?.nextAction || ""));
  pushAuditExportRow(rows, "Narrative", "Alerts", parsed?.alertsCard || []);
  pushAuditExportRow(rows, "Narrative", "Weekly Moves", parsed?.weeklyMoves || []);
  pushAuditExportRow(rows, "Narrative", "Risk Flags", parsed?.structured?.riskFlags || parsed?.degraded?.riskFlags || []);
  pushAuditExportRow(
    rows,
    "Narrative",
    "Executive Summary",
    [
      parsed?.healthScore?.summary,
      normalizeExportValue(parsed?.structured?.nextAction || parsed?.sections?.nextAction),
      ...normalizeList(parsed?.alertsCard).slice(0, 2),
    ].filter(Boolean).join(" ")
  );

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

function isUserCancelledShare(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("cancel") || message.includes("user interaction");
}

export async function exportAudit(audit) {
  const dateStr = audit?.date || new Date().toISOString().split("T")[0];

  try {
    const { buildAuditPdfBase64 } = await import("./auditPdfExport.js");
    const pdfBase64 = await buildAuditPdfBase64(audit, dateStr);
    return await nativeExport(`CatalystCash_CPA_TearSheet_${dateStr}.pdf`, pdfBase64, "application/pdf", true);
  } catch (error) {
    const isCancel = isUserCancelledShare(error);
    if (!isCancel) {
      void log.error("export", "PDF generation or Share sheet failed", { error });
      const { buildAuditHtmlDocument } = await import("./auditHtmlDocument.js");
      const fallbackHtml = buildAuditHtmlDocument(audit, dateStr);
      return await nativeExport(`CatalystCash_Audit_${dateStr}.html`, fallbackHtml, "text/html");
    }
    return { completed: false, source: "native" };
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
  audits.forEach((audit) => {
    const parsed = audit.parsed;
    const metrics = extractDashboardMetrics(parsed);
    rows.push([
      audit.date,
      parsed?.status || "",
      parsed?.mode || "",
      parsed?.netWorth ?? "",
      parsed?.netWorthDelta || "",
      metrics.checking ?? "",
      metrics.vault ?? "",
      metrics.pending ?? "",
      metrics.debts ?? "",
      metrics.available ?? "",
    ]);
  });
  const csv = buildCsvContent(rows);
  return await nativeExport(`CatalystCash_History_${new Date().toISOString().split("T")[0]}.csv`, csv, "text/csv");
}
