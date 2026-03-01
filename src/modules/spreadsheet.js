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
    workbook.lastModifiedBy = 'Catalyst Cash';
    workbook.created = new Date();
    workbook.modified = new Date();

    const financialConfig = (await db.get("financial-config")) || {};

    // ── Helper to create a styled sheet ──
    const createStyledSheet = (name, columns) => {
        const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
        sheet.columns = columns;

        const headerRow = sheet.getRow(1);
        headerRow.font = { name: 'Inter', family: 4, size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D1117' } };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.height = 25;

        return sheet;
    };

    const styleBody = (sheet, valueColIndex) => {
        sheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                row.font = { name: 'Inter', family: 4, size: 11, color: { argb: 'FFECEFF1' } };
                row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowNumber % 2 === 0 ? 'FF161B22' : 'FF0D1117' } };
                row.alignment = { vertical: 'middle', horizontal: 'left' };

                if (valueColIndex) {
                    const valCell = row.getCell(valueColIndex);
                    valCell.font = { name: 'Inter', family: 4, size: 11, bold: true, color: { argb: 'FF00D4AA' } };
                    valCell.alignment = { horizontal: 'right' };
                }
            }
        });
    };

    // ── 1. Setup Data Sheet ──
    const setupSheet = createStyledSheet('Setup Data', [
        { header: 'Config Key (DO NOT EDIT)', key: 'key', width: 30 },
        { header: 'Description', key: 'desc', width: 50 },
        { header: 'Your Value', key: 'val', width: 20 },
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

    // ── 2. Income Sources ──
    const incomeSheet = createStyledSheet('Income Sources', [
        { header: 'ID (Leave blank for new)', key: 'id', width: 25 },
        { header: 'Source Name', key: 'name', width: 35 },
        { header: 'Amount ($)', key: 'amount', width: 15 },
        { header: 'Frequency (weekly, monthly, etc)', key: 'frequency', width: 25 },
        { header: 'Type (passive, active)', key: 'type', width: 20 },
        { header: 'Next Date (YYYY-MM-DD)', key: 'nextDate', width: 20 },
    ]);
    (financialConfig.incomeSources || []).forEach(i => incomeSheet.addRow(i));
    styleBody(incomeSheet, 3);

    // ── 3. Budget Categories ──
    const budgetSheet = createStyledSheet('Budget Categories', [
        { header: 'ID (Leave blank for new)', key: 'id', width: 25 },
        { header: 'Category Name', key: 'name', width: 35 },
        { header: 'Amount Allocated ($)', key: 'allocated', width: 20 },
        { header: 'Group Name', key: 'group', width: 25 },
    ]);
    (financialConfig.budgetCategories || []).forEach(b => budgetSheet.addRow(b));
    styleBody(budgetSheet, 3);

    // ── 4. Savings Goals ──
    const goalsSheet = createStyledSheet('Savings Goals', [
        { header: 'ID (Leave blank for new)', key: 'id', width: 25 },
        { header: 'Goal Name', key: 'name', width: 35 },
        { header: 'Target Amount ($)', key: 'target', width: 20 },
        { header: 'Currently Saved ($)', key: 'saved', width: 20 },
    ]);
    (financialConfig.savingsGoals || []).forEach(g => goalsSheet.addRow(g));
    styleBody(goalsSheet, 3);

    // ── 5. Non-Card Debts ──
    const debtsSheet = createStyledSheet('Non-Card Debts', [
        { header: 'ID (Leave blank for new)', key: 'id', width: 25 },
        { header: 'Debt Name', key: 'name', width: 35 },
        { header: 'Balance ($)', key: 'balance', width: 20 },
        { header: 'Minimum Payment ($)', key: 'minPayment', width: 20 },
        { header: 'APR (%)', key: 'apr', width: 15 },
    ]);
    (financialConfig.nonCardDebts || []).forEach(d => debtsSheet.addRow(d));
    styleBody(debtsSheet, 3);

    // ── 6. Other Assets ──
    const assetsSheet = createStyledSheet('Other Assets', [
        { header: 'ID (Leave blank for new)', key: 'id', width: 25 },
        { header: 'Asset Name', key: 'name', width: 35 },
        { header: 'Value ($)', key: 'value', width: 20 },
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
