import { encrypt } from "./crypto.js";
import { createWorkbookBuffer } from "./excelWorkbook.js";
import { db, nativeExport } from "./utils.js";

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function asBoolString(value) {
  return value ? "true" : "false";
}

function withHeader(header, items) {
  return [header, ...items];
}

export async function generateBackupSpreadsheet(passphrase = null) {
  const financialConfig = (await db.get("financial-config")) || {};
  const sheets = [];

  sheets.push({
    name: "README Guide",
    rows: [
      ["CATALYST TERMINAL // DATA MATRIX PROTOCOL"],
      [""],
      ["WELCOME TO YOUR ENCRYPTED FINANCIAL LEDGER."],
      [""],
      ["This spreadsheet represents the raw structure of your Catalyst Cash database."],
      ["You may modify these values directly, then restore this file back into the application."],
      [""],
      ["CRITICAL RULES FOR EDITING:"],
      ["1. Do not modify ID columns for existing rows."],
      ["2. To add a new record, create a new row and leave the ID blank."],
      ["3. Ensure dollar amounts remain numeric where possible."],
      ["4. Do not rename the sheet tabs."],
      [""],
      ["BULK EDITING TIPS:"],
      ["- Paste a list of debts or income sources into the matching sheet."],
      ["- Use formulas in Excel/Numbers, then paste values if you want to lock results."],
      [""],
      ["When finished, save as .xlsx and use Restore from Spreadsheet in Catalyst Cash."],
    ],
    widths: [110],
  });

  sheets.push({
    name: "Setup Data",
    rows: withHeader(
      ["Config Key (DO NOT EDIT)", "Description", "Your Value"],
      [
        ["payFrequency", "weekly, bi-weekly, semi-monthly, monthly", financialConfig.payFrequency || "weekly"],
        ["payday", "Monday to Sunday", financialConfig.payday || "Friday"],
        ["incomeType", "salary, hourly, variable", financialConfig.incomeType || "salary"],
        ["paycheckStandard", "Standard Paycheck amount ($)", financialConfig.paycheckStandard || ""],
        ["paycheckFirstOfMonth", "First of month paycheck ($)", financialConfig.paycheckFirstOfMonth || ""],
        ["hourlyRateNet", "Net Hourly Rate (if hourly) ($)", financialConfig.hourlyRateNet || ""],
        ["typicalHours", "Typical Hours per Paycheck (if hourly)", financialConfig.typicalHours || ""],
        ["averagePaycheck", "Average Paycheck (if variable) ($)", financialConfig.averagePaycheck || ""],
        ["taxBracketPercent", "Marginal Tax Bracket (%)", financialConfig.taxBracketPercent || ""],
        ["isContractor", "Are you a contractor? (true/false)", asBoolString(financialConfig.isContractor)],
        ["weeklySpendAllowance", "Weekly Spend Allowance max ($)", financialConfig.weeklySpendAllowance || ""],
        ["emergencyFloor", "Checking Floor limit ($)", financialConfig.emergencyFloor || ""],
        ["greenStatusTarget", "Green Status Target ($)", financialConfig.greenStatusTarget || ""],
        ["emergencyReserveTarget", "Emergency Reserve Target ($)", financialConfig.emergencyReserveTarget || ""],
        ["defaultAPR", "Default APR (%)", financialConfig.defaultAPR || 24.99],
        [
          "trackRothContributions",
          "Track Roth IRA? (true/false)",
          asBoolString(financialConfig.trackRothContributions),
        ],
        ["rothAnnualLimit", "Roth Annual Limit ($)", financialConfig.rothAnnualLimit || 7000],
        ["track401k", "Track 401k? (true/false)", asBoolString(financialConfig.track401k)],
        ["k401AnnualLimit", "401k Annual Limit ($)", financialConfig.k401AnnualLimit || 23000],
        ["k401EmployerMatchPct", "Employer Match %", financialConfig.k401EmployerMatchPct || ""],
        ["k401EmployerMatchLimit", "Match Ceiling % of salary", financialConfig.k401EmployerMatchLimit || ""],
        // ─── Newly added fields ───────────────────────────
        ["birthYear", "Birth Year (e.g. 1990)", financialConfig.birthYear || ""],
        ["stateCode", "State Code (e.g. NY, CA)", financialConfig.stateCode || ""],
        ["currencyCode", "Currency Code (e.g. USD, EUR)", financialConfig.currencyCode || "USD"],
        ["housingType", "Housing: rent, own, or blank", financialConfig.housingType || ""],
        ["monthlyRent", "Monthly Rent ($)", financialConfig.monthlyRent || ""],
        ["mortgagePayment", "Monthly Mortgage P+I+Escrow ($)", financialConfig.mortgagePayment || ""],
        ["homeEquity", "Home Equity Value ($)", financialConfig.homeEquity || ""],
        ["vehicleValue", "Vehicle Value ($)", financialConfig.vehicleValue || ""],
        ["otherAssetsLabel", "Other Assets Description", financialConfig.otherAssetsLabel || ""],
        ["trackHSA", "Track HSA? (true/false)", asBoolString(financialConfig.trackHSA)],
        ["hsaAnnualLimit", "HSA Annual Limit ($)", financialConfig.hsaAnnualLimit || 4300],
        ["creditScore", "Credit Score (300-850)", financialConfig.creditScore || ""],
      ]
    ),
    widths: [34, 48, 24],
  });

  sheets.push({
    name: "Income Sources",
    rows: withHeader(
      ["ID (Leave blank for new)", "Source Name", "Amount ($)", "Frequency", "Type", "Next Date (YYYY-MM-DD)"],
      (financialConfig.incomeSources || []).map(item => [
        item.id || "",
        item.name || "",
        item.amount || "",
        item.frequency || "",
        item.type || "",
        item.nextDate || "",
      ])
    ),
    widths: [30, 28, 18, 18, 18, 22],
  });

  sheets.push({
    name: "Budget Categories",
    rows: withHeader(
      ["ID (Leave blank for new)", "Category Name", "Amount Allocated ($)", "Group Name"],
      (financialConfig.budgetCategories || []).map(item => [
        item.id || "",
        item.name || "",
        item.allocated || "",
        item.group || "",
      ])
    ),
    widths: [30, 28, 20, 20],
  });

  sheets.push({
    name: "Savings Goals",
    rows: withHeader(
      ["ID (Leave blank for new)", "Goal Name", "Target Amount ($)", "Currently Saved ($)"],
      (financialConfig.savingsGoals || []).map(item => [
        item.id || "",
        item.name || "",
        item.target || "",
        item.saved || "",
      ])
    ),
    widths: [30, 28, 20, 20],
  });

  sheets.push({
    name: "Non-Card Debts",
    rows: withHeader(
      ["ID (Leave blank for new)", "Debt Name", "Balance ($)", "Minimum Payment ($)", "APR (%)"],
      (financialConfig.nonCardDebts || []).map(item => [
        item.id || "",
        item.name || "",
        item.balance || "",
        item.minPayment || "",
        item.apr || "",
      ])
    ),
    widths: [30, 28, 18, 20, 14],
  });

  sheets.push({
    name: "Other Assets",
    rows: withHeader(
      ["ID (Leave blank for new)", "Asset Name", "Value ($)"],
      (financialConfig.otherAssets || []).map(item => [item.id || "", item.name || "", item.value || ""])
    ),
    widths: [30, 28, 18],
  });

  const buffer = await createWorkbookBuffer({
    title: "Catalyst Cash Spreadsheet Backup",
    sheets,
  });
  const dateStr = new Date().toISOString().split("T")[0];
  const base64data = arrayBufferToBase64(buffer);

  if (passphrase) {
    const payload = JSON.stringify({ app: "Catalyst Cash", type: "spreadsheet-backup", base64: base64data });
    const envelope = await encrypt(payload, passphrase);
    await nativeExport(
      `CatalystCash_Sheet_${dateStr}.enc`,
      JSON.stringify(envelope),
      "application/octet-stream",
      false
    );
    return;
  }

  await nativeExport(
    `CatalystCash_Sheet_${dateStr}.xlsx`,
    base64data,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    true
  );
}
