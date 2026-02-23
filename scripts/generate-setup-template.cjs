// scripts/generate-setup-template.cjs
// Run: node scripts/generate-setup-template.cjs
// Generates: public/FinAuditPro-Setup-Template.xlsx

const ExcelJS = require("exceljs");
const path = require("path");

const OUT = path.join(__dirname, "../public/FinAuditPro-Setup-Template.xlsx");

// ─── Brand palette ────────────────────────────────────────────────────────────
const BRAND = {
  violet:     "FF7B5EA7",
  violetDark: "FF3D1B6B",
  emerald:    "FF1A9B5A",
  bgDark:     "FF07090F",
  bgCard:     "FF0D0F18",
  bgElevated: "FF141622",
  textPrim:   "FFE4E6F0",
  textSec:    "FF8890A6",
  textDim:    "FF4A5068",
  white:      "FFFFFFFF",
  amber:      "FFE0A84D",
  red:        "FFE85C6A",
  green:      "FF2ECC71",
  headerBg:   "FF1A1D2A",
};

// ─── Section definitions ──────────────────────────────────────────────────────
const SECTIONS = [
  {
    title: "💰 Income & Paycheck",
    color: BRAND.emerald,
    fields: [
      { key: "payFrequency",         label: "Pay Frequency",                    unit: "",   hint: "How often you receive a paycheck",                          dropdown: ["weekly","bi-weekly","semi-monthly","monthly"] },
      { key: "payday",               label: "Payday",                           unit: "",   hint: "Which day of the week you get paid",                        dropdown: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"] },
      { key: "paycheckStandard",     label: "Standard Paycheck",                unit: "$",  hint: "Typical take-home pay per paycheck after taxes",            dropdown: null },
      { key: "paycheckFirstOfMonth", label: "First-of-Month Paycheck",          unit: "$",  hint: "Leave blank if same as standard (e.g. benefits deducted)",  dropdown: null },
      { key: "isContractor",         label: "Self-Employed / Contractor",       unit: "",   hint: "Enables quarterly tax estimate tracking",                   dropdown: ["true","false"] },
    ],
  },
  {
    title: "💳 Spending & Guardrails",
    color: BRAND.violet,
    fields: [
      { key: "weeklySpendAllowance",   label: "Weekly Spend Allowance",         unit: "$",  hint: "Target max spending per week (excluding bills)",            dropdown: null },
      { key: "emergencyFloor",         label: "Emergency Floor",                unit: "$",  hint: "Minimum checking balance you never want to go below",       dropdown: null },
      { key: "checkingBuffer",         label: "Checking Buffer",                unit: "$",  hint: "Comfortable buffer above your emergency floor",             dropdown: null },
      { key: "greenStatusTarget",      label: "Green Status Target",            unit: "$",  hint: "Checking balance that means you are in great shape",        dropdown: null },
      { key: "emergencyReserveTarget", label: "Emergency Reserve Target",       unit: "$",  hint: "Savings goal for your emergency fund",                      dropdown: null },
      { key: "defaultAPR",             label: "Default APR",                    unit: "%",  hint: "Used to estimate interest on unpaid card balances",         dropdown: null },
      { key: "arbitrageTargetAPR",     label: "Arbitrage Target APR",           unit: "%",  hint: "Target APR for balance transfer / arbitrage",               dropdown: null },
    ],
  },
  {
    title: "📊 Horizon & Alerts",
    color: BRAND.amber,
    fields: [
      { key: "heavyHorizonStart",     label: "Heavy Horizon Start",             unit: "days", hint: "Days before payday where spending is scrutinized more",  dropdown: null },
      { key: "heavyHorizonEnd",       label: "Heavy Horizon End",               unit: "days", hint: "End of heavy horizon window",                            dropdown: null },
      { key: "heavyHorizonThreshold", label: "Heavy Horizon Threshold",         unit: "$",    hint: "Checking balance that triggers heavy horizon mode",       dropdown: null },
    ],
  },
  {
    title: "🚬 Vape Tracking (Optional)",
    color: BRAND.textDim,
    fields: [
      { key: "trackVapes",           label: "Track Vape Usage",                 unit: "",   hint: "Enable vape usage tracking",                               dropdown: ["true","false"] },
      { key: "vapeCheckThreshold",   label: "Vape Check Threshold",             unit: "",   hint: "Number of vapes remaining that triggers a warning",        dropdown: null },
      { key: "vapeCriticalThreshold",label: "Vape Critical Threshold",          unit: "",   hint: "Number of vapes remaining that triggers critical alert",    dropdown: null },
      { key: "vapeUsageRate",        label: "Vape Usage Rate (per day)",        unit: "",   hint: "Average vapes consumed per day",                           dropdown: null },
    ],
  },
  {
    title: "📈 Investments — Roth IRA",
    color: BRAND.emerald,
    fields: [
      { key: "trackRoth",            label: "Track Roth IRA",                   unit: "",   hint: "Enable Roth IRA tracking",                                 dropdown: ["true","false"] },
      { key: "investmentRoth",       label: "Roth IRA Balance",                 unit: "$",  hint: "Current Roth IRA account balance",                         dropdown: null },
      { key: "rothAnnualLimit",      label: "Roth Annual Contribution Limit",   unit: "$",  hint: "IRS limit for the year (e.g. 7000)",                       dropdown: null },
      { key: "rothContributedYTD",   label: "Roth Contributed YTD",             unit: "$",  hint: "How much you have contributed so far this year",           dropdown: null },
      { key: "rothStockPct",         label: "Roth Stock Allocation",            unit: "%",  hint: "Equity allocation percentage (e.g. 90)",                   dropdown: null },
    ],
  },
  {
    title: "📈 Investments — 401(k)",
    color: BRAND.violet,
    fields: [
      { key: "track401k",              label: "Track 401(k)",                   unit: "",   hint: "Enable 401k tracking",                                     dropdown: ["true","false"] },
      { key: "k401Balance",            label: "401(k) Balance",                 unit: "$",  hint: "Current 401k account balance",                             dropdown: null },
      { key: "k401AnnualLimit",        label: "401(k) Annual Contribution Limit",unit: "$", hint: "IRS limit for the year (e.g. 23000)",                      dropdown: null },
      { key: "k401ContributedYTD",     label: "401(k) Contributed YTD",         unit: "$",  hint: "How much you have contributed so far this year",           dropdown: null },
      { key: "k401EmployerMatchPct",   label: "Employer Match",                 unit: "%",  hint: "Employer matches X% of your contributions (e.g. 50)",      dropdown: null },
      { key: "k401EmployerMatchLimit", label: "Employer Match Ceiling",         unit: "%",  hint: "Up to X% of your salary (e.g. 6)",                         dropdown: null },
      { key: "k401VestingPct",         label: "Vesting",                        unit: "%",  hint: "How much of matched funds are yours today (e.g. 100)",      dropdown: null },
      { key: "k401StockPct",           label: "401(k) Stock Allocation",        unit: "%",  hint: "Equity allocation percentage (e.g. 90)",                   dropdown: null },
    ],
  },
  {
    title: "📈 Investments — Brokerage",
    color: BRAND.emerald,
    fields: [
      { key: "trackBrokerage",       label: "Track Brokerage",                  unit: "",   hint: "Enable taxable brokerage tracking",                        dropdown: ["true","false"] },
      { key: "investmentBrokerage",  label: "Brokerage Balance",                unit: "$",  hint: "Current taxable brokerage account balance",                dropdown: null },
      { key: "brokerageStockPct",    label: "Brokerage Stock Allocation",       unit: "%",  hint: "Equity allocation percentage (e.g. 90)",                   dropdown: null },
    ],
  },
  {
    title: "💳 Credit",
    color: BRAND.amber,
    fields: [
      { key: "creditScore",          label: "Credit Score",                     unit: "",   hint: "Your current FICO score (e.g. 750)",                        dropdown: null },
      { key: "creditScoreDate",      label: "Credit Score Date",                unit: "",   hint: "Date of last check — format: YYYY-MM-DD",                  dropdown: null },
      { key: "creditUtilization",    label: "Credit Utilization",               unit: "%",  hint: "Current overall credit utilization percentage",             dropdown: null },
    ],
  },
  {
    title: "🧾 Tax",
    color: BRAND.red,
    fields: [
      { key: "taxWithholdingRate",   label: "Tax Withholding Rate",             unit: "%",  hint: "Effective tax withholding rate (e.g. 22)",                  dropdown: null },
      { key: "quarterlyTaxEstimate", label: "Quarterly Tax Estimate",           unit: "$",  hint: "Estimated quarterly tax payment if self-employed",          dropdown: null },
    ],
  },
  {
    title: "🏠 Assets",
    color: BRAND.textSec,
    fields: [
      { key: "homeEquity",           label: "Home Equity",                      unit: "$",  hint: "Estimated home equity value",                               dropdown: null },
      { key: "vehicleValue",         label: "Vehicle Value",                    unit: "$",  hint: "Estimated vehicle value",                                   dropdown: null },
      { key: "otherAssets",          label: "Other Assets",                     unit: "$",  hint: "Value of other significant assets",                         dropdown: null },
      { key: "otherAssetsLabel",     label: "Other Assets Label",               unit: "",   hint: "Description of other assets (e.g. Rental Property)",        dropdown: null },
    ],
  },
];

async function generate() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FinAudit Pro";
  wb.created = new Date();

  // ─── Sheet 1: Instructions ────────────────────────────────────────────────
  const instr = wb.addWorksheet("📋 Instructions", {
    properties: { tabColor: { argb: BRAND.violet } },
  });

  instr.getColumn("A").width = 80;

  const instrLines = [
    ["FinAudit Pro — Setup Template", "title"],
    ["", null],
    ["HOW TO USE THIS TEMPLATE", "heading"],
    ["", null],
    ["1. Go to the '📝 Setup Data' sheet (tab at the bottom).", "body"],
    ["2. Find the field you want to fill in the 'Field' column.", "body"],
    ["3. Enter your value in the 'Your Value' column (column C).", "body"],
    ["4. Fields with a dropdown arrow have pre-set options — click the cell to see them.", "body"],
    ["5. Leave any field blank if it doesn't apply to you.", "body"],
    ["6. Save the file, then import it in the FinAudit Pro app during setup.", "body"],
    ["", null],
    ["TIPS", "heading"],
    ["", null],
    ["• Dollar amounts: enter numbers only (e.g. 2400, not $2,400)", "body"],
    ["• Percentages: enter numbers only (e.g. 24.99, not 24.99%)", "body"],
    ["• Dates: use YYYY-MM-DD format (e.g. 2025-01-15)", "body"],
    ["• True/False fields: use the dropdown — select 'true' or 'false'", "body"],
    ["• You do NOT need to fill in every field — only what applies to you", "body"],
    ["", null],
    ["SECURITY NOTE", "heading"],
    ["", null],
    ["• This file does NOT contain your API keys or PIN — those are set in-app only.", "body"],
    ["• This file only contains your financial profile settings.", "body"],
    ["• You can safely share this file with a financial advisor.", "body"],
  ];

  instrLines.forEach(([text, type], i) => {
    const row = instr.getRow(i + 1);
    const cell = row.getCell(1);
    cell.value = text;
    if (type === "title") {
      cell.font = { name: "Calibri", size: 20, bold: true, color: { argb: BRAND.violet } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.bgCard } };
      row.height = 36;
    } else if (type === "heading") {
      cell.font = { name: "Calibri", size: 12, bold: true, color: { argb: BRAND.emerald } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.bgElevated } };
      row.height = 22;
    } else if (type === "body") {
      cell.font = { name: "Calibri", size: 11, color: { argb: BRAND.textSec } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.bgCard } };
      row.height = 18;
    } else {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.bgCard } };
      row.height = 8;
    }
    cell.alignment = { vertical: "middle", wrapText: false };
  });

  // ─── Sheet 2: Setup Data ──────────────────────────────────────────────────
  const ws = wb.addWorksheet("📝 Setup Data", {
    properties: { tabColor: { argb: BRAND.emerald } },
    views: [{ state: "frozen", ySplit: 2 }],
  });

  // Column widths
  ws.getColumn("A").width = 30;  // Field key (hidden from user but needed for import)
  ws.getColumn("B").width = 36;  // Field label
  ws.getColumn("C").width = 28;  // Your value
  ws.getColumn("D").width = 6;   // Unit
  ws.getColumn("E").width = 58;  // Hint / description

  // Row 1: Title banner
  ws.mergeCells("A1:E1");
  const titleCell = ws.getCell("A1");
  titleCell.value = "FinAudit Pro — Setup Template   |   Fill in column C, then import in the app";
  titleCell.font = { name: "Calibri", size: 13, bold: true, color: { argb: BRAND.white } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.violetDark } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 30;

  // Row 2: Column headers
  const headerRow = ws.getRow(2);
  const headers = ["field_key", "Field", "Your Value ✏️", "Unit", "Description / Notes"];
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: BRAND.textPrim } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.headerBg } };
    cell.alignment = { vertical: "middle", horizontal: i === 2 ? "center" : "left" };
    cell.border = { bottom: { style: "medium", color: { argb: BRAND.violet } } };
  });
  headerRow.height = 22;

  // Hide column A (field_key) — needed for import but not user-facing
  ws.getColumn("A").hidden = true;

  let currentRow = 3;

  for (const section of SECTIONS) {
    // Section header row
    ws.mergeCells(`A${currentRow}:E${currentRow}`);
    const secCell = ws.getCell(`A${currentRow}`);
    secCell.value = section.title;
    secCell.font = { name: "Calibri", size: 11, bold: true, color: { argb: BRAND.white } };
    secCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: section.color } };
    secCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    ws.getRow(currentRow).height = 22;
    currentRow++;

    for (const field of section.fields) {
      const row = ws.getRow(currentRow);
      row.height = 20;

      // A: field_key (hidden)
      const keyCell = row.getCell(1);
      keyCell.value = field.key;
      keyCell.font = { name: "Courier New", size: 9, color: { argb: BRAND.textDim } };
      keyCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.bgCard } };

      // B: label
      const labelCell = row.getCell(2);
      labelCell.value = field.label;
      labelCell.font = { name: "Calibri", size: 11, color: { argb: BRAND.textPrim } };
      labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.bgCard } };
      labelCell.alignment = { vertical: "middle" };

      // C: value input cell — highlighted
      const valCell = row.getCell(3);
      valCell.value = "";
      valCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E2235" } };
      valCell.border = {
        top:    { style: "thin", color: { argb: "FF2A2D40" } },
        bottom: { style: "thin", color: { argb: "FF2A2D40" } },
        left:   { style: "thin", color: { argb: "FF2A2D40" } },
        right:  { style: "thin", color: { argb: "FF2A2D40" } },
      };
      valCell.font = { name: "Calibri", size: 11, bold: true, color: { argb: BRAND.white } };
      valCell.alignment = { vertical: "middle", horizontal: "center" };

      // Add dropdown validation if applicable
      if (field.dropdown) {
        valCell.dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`"${field.dropdown.join(",")}"`],
          showErrorMessage: true,
          errorTitle: "Invalid option",
          error: `Please select one of: ${field.dropdown.join(", ")}`,
        };
      }

      // D: unit
      const unitCell = row.getCell(4);
      unitCell.value = field.unit;
      unitCell.font = { name: "Calibri", size: 10, color: { argb: BRAND.textDim } };
      unitCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.bgCard } };
      unitCell.alignment = { vertical: "middle", horizontal: "center" };

      // E: hint
      const hintCell = row.getCell(5);
      hintCell.value = field.hint;
      hintCell.font = { name: "Calibri", size: 10, italic: true, color: { argb: BRAND.textSec } };
      hintCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.bgCard } };
      hintCell.alignment = { vertical: "middle", wrapText: false };

      // Subtle alternating row tint
      if (currentRow % 2 === 0) {
        [keyCell, labelCell, unitCell, hintCell].forEach(c => {
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F1120" } };
        });
      }

      currentRow++;
    }

    // Spacer row between sections
    const spacer = ws.getRow(currentRow);
    spacer.height = 6;
    for (let c = 1; c <= 5; c++) {
      spacer.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.bgDark } };
    }
    currentRow++;
  }

  // Protect value column from accidental format changes (allow editing values)
  ws.protect("", { selectLockedCells: true, selectUnlockedCells: true });

  await wb.xlsx.writeFile(OUT);
  console.log(`✅ Generated: ${OUT}`);
  console.log(`   ${currentRow - 3} rows written across ${SECTIONS.length} sections`);
}

generate().catch(e => { console.error("❌ Failed:", e); process.exit(1); });
