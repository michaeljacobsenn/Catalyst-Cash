import * as ExcelJS from 'exceljs';
import { encrypt, decrypt } from './crypto.js';
import { db, nativeExport } from './utils.js';

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

export async function generateBackupSpreadsheet(passphrase = null) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Catalyst Cash';
    workbook.lastModifiedBy = 'Catalyst Cash Terminal';
    workbook.created = new Date();
    workbook.modified = new Date();

    const financialConfig = (await db.get("financial-config")) || {};

    // ── 0. Formatting Helpers ──
    const colors = {
        headerBg: 'FF0F172A',     // Slate 900
        headerText: 'FFFFFFFF',   // White
        rowEvenBg: 'FF111827',    // Gray 900
        rowOddBg: 'FF030712',     // Gray 950
        text: 'FFE2E8F0',         // Slate 200
        valueText: 'FF10B981',    // Emerald 500
        dimText: 'FF64748B'       // Slate 500
    };

    const createStyledSheet = (name, columns) => {
        const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
        sheet.columns = columns;

        const headerRow = sheet.getRow(1);
        headerRow.font = { name: 'Inter', family: 4, size: 12, bold: true, color: { argb: colors.headerText } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.headerBg } };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.height = 30;

        // Add subtle borders to header
        headerRow.eachCell((cell) => {
            cell.border = {
                bottom: { style: 'medium', color: { argb: 'FF334155' } } // Slate 700
            };
        });

        return sheet;
    };

    const styleBody = (sheet, valueColIndices = []) => {
        const valueColsArray = Array.isArray(valueColIndices) ? valueColIndices : [valueColIndices];

        sheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                row.font = { name: 'Inter', family: 4, size: 11, color: { argb: colors.text } };
                row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowNumber % 2 === 0 ? colors.rowEvenBg : colors.rowOddBg } };
                row.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
                row.height = 25;

                // Subtle border between rows
                row.eachCell((cell) => {
                    cell.border = {
                        bottom: { style: 'thin', color: { argb: 'FF1E293B' } } // Slate 800
                    };
                });

                valueColsArray.forEach(colIdx => {
                    if (colIdx) {
                        const valCell = row.getCell(colIdx);
                        if (valCell.value !== null && valCell.value !== '') {
                            const isBooleanStr = typeof valCell.value === 'string' && (valCell.value === 'true' || valCell.value === 'false');
                            const isNumeric = !isBooleanStr && (typeof valCell.value === 'number' || (typeof valCell.value === 'string' && valCell.value.trim() !== '' && !isNaN(Number(valCell.value))));

                            valCell.font = { name: 'Inter', family: 4, size: 11, bold: true, color: { argb: colors.valueText } };

                            if (isNumeric) {
                                valCell.alignment = { horizontal: 'right', vertical: 'middle' };
                                // Ensure it's treated as a number in Excel for summing
                                valCell.value = parseFloat(valCell.value);
                                valCell.numFmt = '"$"#,##0.00';
                            } else {
                                valCell.alignment = { horizontal: 'center', vertical: 'middle' };
                            }
                        }
                    }
                });
            }
        });
    };

    // ── 1. README / Guide Sheet ──
    const guideSheet = workbook.addWorksheet('README Guide');
    guideSheet.getColumn(1).width = 8;
    guideSheet.getColumn(2).width = 100;

    // Header
    const gHeader = guideSheet.getRow(2);
    gHeader.getCell(2).value = "CATALYST TERMINAL // DATA MATRIX PROTOCOL";
    gHeader.getCell(2).font = { name: 'JetBrains Mono', family: 4, size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    gHeader.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    gHeader.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
    gHeader.height = 40;

    const instructions = [
        "",
        "WELCOME TO YOUR ENCRYPTED FINANCIAL LEDGER.",
        "",
        "This spreadsheet represents the raw structure of your Catalyst Cash V2 database.",
        "You may modify these values directly in Excel, then restore this file back into the application.",
        "",
        "⚠️ CRITICAL RULES FOR EDITING:",
        "1. DO NOT modify the ID columns. They are used to sync and merge records.",
        "2. To ADD a new record (e.g. a new Income Source), create a new row and LEAVE THE ID BLANK. The terminal will generate a secure ID on import.",
        "3. Ensure all dollar amounts are numeric. The terminal will automatically format them.",
        "4. Do not rename the sheet tabs. The terminal looks for these exact names to parse the data structure.",
        "",
        "💡 TUTORIAL: BULK EDITING",
        "- Need to adjust all your budget categories for inflation? Write an Excel formula, paste as values to override the target column.",
        "- Need to import a large list of standard debts? Just paste them into the Non-Card Debts sheet (leave IDs blank).",
        "",
        "When finished, save as .xlsx and use the 'Restore from Spreadsheet' function in the Catalyst Settings tab."
    ];

    let rowIdx = 4;
    instructions.forEach(text => {
        const r = guideSheet.getRow(rowIdx++);
        r.getCell(2).value = text;
        const isHeader = text.includes("⚠️") || text.includes("💡") || text.includes("WELCOME");
        r.getCell(2).font = { name: 'Inter', family: 4, size: 12, bold: isHeader, color: { argb: isHeader ? 'FF10B981' : 'FFE2E8F0' } };
        r.height = 25;
        r.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
    });

    // Dark background for whole guide sheet
    guideSheet.eachRow((row) => {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF05050A' } };
    });


    // ── 2. Setup Data Sheet ──
    const setupSheet = createStyledSheet('Setup Data', [
        { header: 'Config Key (DO NOT EDIT)', key: 'key', width: 35 },
        { header: 'Description', key: 'desc', width: 55 },
        { header: 'Your Value', key: 'val', width: 25 },
    ]);

    const setupRows = [
        { key: 'payFrequency', desc: 'weekly, bi-weekly, semi-monthly, monthly', val: financialConfig.payFrequency || 'weekly' },
        { key: 'payday', desc: 'Monday to Sunday', val: financialConfig.payday || 'Friday' },
        { key: 'incomeType', desc: 'salary, hourly, variable', val: financialConfig.incomeType || 'salary' },
        { key: 'paycheckStandard', desc: 'Standard Paycheck amount ($)', val: financialConfig.paycheckStandard || '' },
        { key: 'paycheckFirstOfMonth', desc: 'First of month paycheck ($)', val: financialConfig.paycheckFirstOfMonth || '' },
        { key: 'hourlyRateNet', desc: 'Net Hourly Rate (if hourly) ($)', val: financialConfig.hourlyRateNet || '' },
        { key: 'typicalHours', desc: 'Typical Hours per Paycheck (if hourly)', val: financialConfig.typicalHours || '' },
        { key: 'averagePaycheck', desc: 'Average Paycheck (if variable) ($)', val: financialConfig.averagePaycheck || '' },
        { key: 'taxBracketPercent', desc: 'Marginal Tax Bracket (%)', val: financialConfig.taxBracketPercent || '' },
        { key: 'isContractor', desc: 'Are you a contractor? (true/false)', val: financialConfig.isContractor ? 'true' : 'false' },
        { key: 'weeklySpendAllowance', desc: 'Weekly Spend Allowance max ($)', val: financialConfig.weeklySpendAllowance || '' },
        { key: 'emergencyFloor', desc: 'Checking Floor limit ($)', val: financialConfig.emergencyFloor || '' },
        { key: 'greenStatusTarget', desc: 'Green Status Target ($)', val: financialConfig.greenStatusTarget || '' },
        { key: 'emergencyReserveTarget', desc: 'Emergency Reserve Target ($)', val: financialConfig.emergencyReserveTarget || '' },
        { key: 'defaultAPR', desc: 'Default APR (%)', val: financialConfig.defaultAPR || 24.99 },
        { key: 'trackRothContributions', desc: 'Track Roth IRA? (true/false)', val: financialConfig.trackRothContributions ? 'true' : 'false' },
        { key: 'rothAnnualLimit', desc: 'Roth Annual Limit ($)', val: financialConfig.rothAnnualLimit || 7000 },
        { key: 'track401k', desc: 'Track 401k? (true/false)', val: financialConfig.track401k ? 'true' : 'false' },
        { key: 'k401AnnualLimit', desc: '401k Annual Limit ($)', val: financialConfig.k401AnnualLimit || 23000 },
        { key: 'k401EmployerMatchPct', desc: 'Employer Match %', val: financialConfig.k401EmployerMatchPct || '' },
        { key: 'k401EmployerMatchLimit', desc: 'Match Ceiling % of salary', val: financialConfig.k401EmployerMatchLimit || '' },
    ];
    setupRows.forEach(r => setupSheet.addRow(r));
    styleBody(setupSheet, 3);

    // Setup percent formats
    setupSheet.eachRow((row, rowNum) => {
        if (rowNum > 1) {
            const keyCol = row.getCell(1).value;
            const valCell = row.getCell(3);
            if (valCell.value !== null && valCell.value !== '' && (keyCol.includes('Percent') || keyCol.includes('APR') || keyCol.includes('Pct') || keyCol.includes('Ceiling'))) {
                valCell.numFmt = '0.00"%"';
                valCell.font = { name: 'Inter', family: 4, size: 11, bold: true, color: { argb: 'FF3B82F6' } }; // Blue for percentages
            }
        }
    });

    // ── 3. Income Sources ──
    const incomeSheet = createStyledSheet('Income Sources', [
        { header: 'ID (Leave blank for new)', key: 'id', width: 35 },
        { header: 'Source Name', key: 'name', width: 40 },
        { header: 'Amount ($)', key: 'amount', width: 25 },
        { header: 'Frequency (weekly, monthly, etc)', key: 'frequency', width: 35 },
        { header: 'Type (passive, active)', key: 'type', width: 25 },
        { header: 'Next Date (YYYY-MM-DD)', key: 'nextDate', width: 25 },
    ]);
    (financialConfig.incomeSources || []).forEach(i => incomeSheet.addRow(i));
    styleBody(incomeSheet, 3);

    // ── 4. Budget Categories ──
    const budgetSheet = createStyledSheet('Budget Categories', [
        { header: 'ID (Leave blank for new)', key: 'id', width: 35 },
        { header: 'Category Name', key: 'name', width: 40 },
        { header: 'Amount Allocated ($)', key: 'allocated', width: 25 },
        { header: 'Group Name', key: 'group', width: 30 },
    ]);
    (financialConfig.budgetCategories || []).forEach(b => budgetSheet.addRow(b));
    styleBody(budgetSheet, 3);

    // ── 5. Savings Goals ──
    const goalsSheet = createStyledSheet('Savings Goals', [
        { header: 'ID (Leave blank for new)', key: 'id', width: 35 },
        { header: 'Goal Name', key: 'name', width: 40 },
        { header: 'Target Amount ($)', key: 'target', width: 25 },
        { header: 'Currently Saved ($)', key: 'saved', width: 25 },
    ]);
    (financialConfig.savingsGoals || []).forEach(g => goalsSheet.addRow(g));
    styleBody(goalsSheet, [3, 4]);

    // ── 6. Non-Card Debts ──
    const debtsSheet = createStyledSheet('Non-Card Debts', [
        { header: 'ID (Leave blank for new)', key: 'id', width: 35 },
        { header: 'Debt Name', key: 'name', width: 40 },
        { header: 'Balance ($)', key: 'balance', width: 25 },
        { header: 'Minimum Payment ($)', key: 'minPayment', width: 25 },
        { header: 'APR (%)', key: 'apr', width: 20 },
    ]);
    (financialConfig.nonCardDebts || []).forEach(d => debtsSheet.addRow(d));
    styleBody(debtsSheet, [3, 4]);
    debtsSheet.eachRow((row, rowNum) => {
        if (rowNum > 1) {
            const aprCell = row.getCell(5);
            if (aprCell.value !== null && aprCell.value !== '') {
                aprCell.numFmt = '0.00"%"';
                aprCell.font = { name: 'Inter', family: 4, size: 11, bold: true, color: { argb: 'FF3B82F6' } };
            }
        }
    });

    // ── 7. Other Assets ──
    const assetsSheet = createStyledSheet('Other Assets', [
        { header: 'ID (Leave blank for new)', key: 'id', width: 35 },
        { header: 'Asset Name', key: 'name', width: 40 },
        { header: 'Value ($)', key: 'value', width: 25 },
    ]);
    (financialConfig.otherAssets || []).forEach(a => assetsSheet.addRow(a));
    styleBody(assetsSheet, 3);

    const buffer = await workbook.xlsx.writeBuffer();
    const dateStr = new Date().toISOString().split("T")[0];
    const base64data = arrayBufferToBase64(buffer);

    if (passphrase) {
        const payload = JSON.stringify({ app: "Catalyst Cash", type: 'spreadsheet-backup', base64: base64data });
        const envelope = await encrypt(payload, passphrase);
        await nativeExport(`CatalystCash_Sheet_${dateStr}.enc`, JSON.stringify(envelope), "application/octet-stream", false);
    } else {
        await nativeExport(`CatalystCash_Sheet_${dateStr}.xlsx`, base64data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", true);
    }
}
