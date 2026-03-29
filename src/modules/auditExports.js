import { APP_VERSION } from "./constants.js";
import { log } from "./logger.js";
import { SimplePdfDocument } from "./simplePdf.js";
import { extractDashboardMetrics, fmt } from "./utils.js";
import { nativeExport } from "./nativeExport.js";

const PDF_PAGE = {
  width: 612,
  height: 792,
  marginX: 48,
  marginY: 48,
};

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

function formatPdfScalar(value, { money = false } = {}) {
  if (value == null || value === "") return "—";
  if (money && typeof value === "number") return fmt(value);
  if (Array.isArray(value)) return value.map((entry) => normalizeExportValue(entry)).filter(Boolean).join(" | ") || "—";
  if (typeof value === "object") return summarizeAuditObject(value) || "—";
  return String(value);
}

function sanitizePdfLine(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildAuditPdfBase64(audit, dateStr) {
  const parsed = audit?.parsed || {};
  const metrics = extractDashboardMetrics(parsed);
  const pdf = new SimplePdfDocument({
    width: PDF_PAGE.width,
    height: PDF_PAGE.height,
    metadata: {
      title: `Catalyst Cash Financial Audit ${dateStr}`,
      author: "Catalyst Cash",
      subject: "Financial audit tear sheet",
      creator: `Catalyst Cash ${APP_VERSION}`,
      keywords: "finance, audit, portfolio, catalyst cash",
    },
  });

  const pageWidth = pdf.width;
  const pageHeight = pdf.height;
  const contentWidth = pageWidth - PDF_PAGE.marginX * 2;
  let cursorY = PDF_PAGE.marginY;

  const ensureSpace = (heightNeeded = 20) => {
    if (cursorY + heightNeeded <= pageHeight - PDF_PAGE.marginY) return;
    pdf.addPage();
    cursorY = PDF_PAGE.marginY;
  };

  const addWrappedText = (text, options = {}) => {
    const {
      x = PDF_PAGE.marginX,
      style = "normal",
      size = 11,
      color = [55, 65, 81],
      maxWidth = contentWidth,
      lineHeight = size * 1.4,
      gapAfter = 10,
    } = options;
    const cleanText = sanitizePdfLine(text);
    if (!cleanText) return;

    const lines = pdf.splitTextToSize(cleanText, maxWidth, {
      font: style,
      size,
    });
    ensureSpace(lines.length * lineHeight + gapAfter);
    pdf.drawText(lines, x, cursorY, {
      font: style,
      size,
      color,
      lineHeight,
    });
    cursorY += lines.length * lineHeight + gapAfter;
  };

  const addSectionHeading = (title) => {
    ensureSpace(28);
    pdf.drawLine(PDF_PAGE.marginX, cursorY, pageWidth - PDF_PAGE.marginX, cursorY, {
      color: [229, 231, 235],
    });
    cursorY += 16;
    addWrappedText(title, {
      size: 15,
      style: "bold",
      color: [17, 24, 39],
      gapAfter: 8,
    });
  };

  const addBulletList = (title, items) => {
    if (!items.length) return;
    addSectionHeading(title);
    for (const item of items) {
      addWrappedText(`• ${item}`, {
        size: 11,
        color: [55, 65, 81],
        gapAfter: 6,
      });
    }
    cursorY += 6;
  };

  const drawMetricCard = ({ x, y, width, height, label, value, fillColor = [249, 250, 251], borderColor = [229, 231, 235], labelColor = [107, 114, 128], valueColor = [17, 24, 39], valueSize = 20 }) => {
    pdf.drawRoundedRect(x, y, width, height, 10, {
      fillColor,
      borderColor,
    });
    pdf.drawText(String(label).toUpperCase(), x + 14, y + 18, {
      font: "bold",
      size: 9,
      color: labelColor,
    });
    const lines = pdf.splitTextToSize(sanitizePdfLine(value), width - 28, {
      font: "bold",
      size: valueSize,
    });
    pdf.drawText(lines, x + 14, y + 42, {
      font: "bold",
      size: valueSize,
      color: valueColor,
      lineHeight: valueSize * 1.2,
    });
  };

  addWrappedText("Catalyst Cash — Financial Audit", {
    size: 24,
    style: "bold",
    color: [17, 24, 39],
    gapAfter: 4,
  });
  addWrappedText("Prepared for CPA / advisory review", {
    size: 10,
    style: "bold",
    color: [107, 114, 128],
    gapAfter: 8,
  });
  addWrappedText(`Date executed: ${dateStr}`, {
    size: 10,
    color: [107, 114, 128],
    gapAfter: 20,
  });

  ensureSpace(120);
  const cardGap = 14;
  const cardWidth = (contentWidth - cardGap * 2) / 3;
  const cardHeight = 90;
  const statusColor =
    parsed.status === "GREEN" ? [5, 150, 105] : parsed.status === "YELLOW" ? [217, 119, 6] : [220, 38, 38];
  const statusFill =
    parsed.status === "GREEN" ? [236, 253, 245] : parsed.status === "YELLOW" ? [255, 251, 235] : [254, 242, 242];
  const cardY = cursorY;

  drawMetricCard({
    x: PDF_PAGE.marginX,
    y: cardY,
    width: cardWidth,
    height: cardHeight,
    label: "Net Worth Estimate",
    value: formatPdfScalar(parsed.netWorth, { money: true }),
  });
  drawMetricCard({
    x: PDF_PAGE.marginX + cardWidth + cardGap,
    y: cardY,
    width: cardWidth,
    height: cardHeight,
    label: "Audit Status",
    value: formatPdfScalar(parsed.status),
    fillColor: statusFill,
    borderColor: statusColor,
    labelColor: statusColor,
    valueColor: statusColor,
  });
  drawMetricCard({
    x: PDF_PAGE.marginX + (cardWidth + cardGap) * 2,
    y: cardY,
    width: cardWidth,
    height: cardHeight,
    label: "Audit Engine",
    value: `${formatPdfScalar(parsed.mode || "Standard")} Mode`,
  });
  cursorY += cardHeight + 26;

  addSectionHeading("Executive AI Summary");
  addWrappedText(
    [
      parsed?.healthScore?.summary,
      normalizeExportValue(parsed?.structured?.nextAction || parsed?.sections?.nextAction),
      ...normalizeList(parsed?.alertsCard).slice(0, 2),
    ].filter(Boolean).join(" "),
    {
      size: 11,
      color: [55, 65, 81],
      lineHeight: 16,
      gapAfter: 14,
    }
  );

  addSectionHeading("Financial Snapshot");
  const snapshotRows = [
    ["Checking", formatPdfScalar(metrics.checking, { money: true })],
    ["Vault", formatPdfScalar(metrics.vault, { money: true })],
    ["Pending", formatPdfScalar(metrics.pending, { money: true })],
    ["Debts", formatPdfScalar(metrics.debts, { money: true })],
    ["Available", formatPdfScalar(metrics.available, { money: true })],
    ["Health Score", formatPdfScalar(parsed?.healthScore?.score)],
    ["Health Grade", formatPdfScalar(parsed?.healthScore?.grade)],
    ["Model", formatPdfScalar(audit?.model)],
  ];

  for (const [label, value] of snapshotRows) {
    addWrappedText(`${label}: ${value}`, {
      size: 11,
      color: [55, 65, 81],
      gapAfter: 6,
    });
  }
  cursorY += 4;

  const dashboardRows = (parsed?.dashboardCard || []).map((row, index) => {
    const category = sanitizePdfLine(row?.category || `Card ${index + 1}`);
    const amount = sanitizePdfLine(row?.amount || "—");
    const status = sanitizePdfLine(row?.status || "—");
    return `${category}: ${amount} (${status})`;
  });
  addBulletList("Dashboard Cards", dashboardRows);
  addBulletList("Alerts", normalizeList(parsed?.alertsCard));
  addBulletList("Weekly Moves", normalizeList(parsed?.weeklyMoves));
  addBulletList("Risk Flags", normalizeList(parsed?.structured?.riskFlags || parsed?.degraded?.riskFlags));
  addBulletList("Action Items", normalizeList((parsed?.moveItems || []).map((item) => item?.text || "")));

  ensureSpace(24);
  pdf.drawLine(PDF_PAGE.marginX, cursorY, pageWidth - PDF_PAGE.marginX, cursorY, {
    color: [229, 231, 235],
  });
  cursorY += 16;
  addWrappedText("Generated securely on-device by Catalyst Cash — CatalystCash.app", {
    size: 9,
    color: [156, 163, 175],
    gapAfter: 0,
  });

  return pdf.toBase64();
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
