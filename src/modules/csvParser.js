// ═══════════════════════════════════════════════════════════════
// CSV PARSER — Frictionless Data Onboarding
// ═══════════════════════════════════════════════════════════════
// Heuristically parses varied CSV formats (Mint, Rocket Money, standard banks)
// to extract dates, amounts, and descriptions.

function parseCSVLine(text) {
    const result = [];
    let cur = "", inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') {
            if (inQuotes && text[i + 1] === '"') { cur += '"'; i++; }
            else inQuotes = !inQuotes;
        } else if (c === ',' && !inQuotes) {
            result.push(cur.trim()); cur = "";
        } else {
            cur += c;
        }
    }
    result.push(cur.trim());
    return result;
}

function parseCurrency(val) {
    if (!val) return null;
    const clean = val.toString().replace(/[^0-9.-]+/g, "");
    const num = parseFloat(clean);
    return isNaN(num) ? null : num;
}

function parseDateStr(val) {
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
}

export function parseCSVTransactions(csvString) {
    if (!csvString || !csvString.trim()) return [];

    const lines = csvString.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) return [];

    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());

    // Heuristics: Find column indices
    let dateIdx = -1, amountIdx = -1, descIdx = -1, categoryIdx = -1, typeIdx = -1;

    headers.forEach((h, i) => {
        if (h.includes("date") && dateIdx === -1) dateIdx = i;
        else if ((h.includes("amount") || h === "balance" || h === "value") && amountIdx === -1) amountIdx = i;
        else if ((h.includes("description") || h.includes("name") || h.includes("merchant") || h === "payee") && descIdx === -1) descIdx = i;
        else if (h.includes("category") && categoryIdx === -1) categoryIdx = i;
        else if (h.includes("type") && typeIdx === -1) typeIdx = i; // e.g., "debit" or "credit"
    });

    // Fallback if headers aren't clear: sniff first data row
    if (dateIdx === -1 || amountIdx === -1) {
        const firstRow = parseCSVLine(lines[1]);
        firstRow.forEach((cell, i) => {
            if (dateIdx === -1 && parseDateStr(cell)) dateIdx = i;
            if (amountIdx === -1 && parseCurrency(cell) !== null) amountIdx = i;
            if (descIdx === -1 && isNaN(parseCurrency(cell)) && !parseDateStr(cell) && cell.length > 2) descIdx = i;
        });
    }

    // If we still can't find core columns, abort
    if (dateIdx === -1 || amountIdx === -1) return [];

    const transactions = [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (let i = 1; i < lines.length; i++) {
        const row = parseCSVLine(lines[i]);
        if (row.length < Math.max(dateIdx, amountIdx)) continue;

        const rawDate = row[dateIdx];
        const dateObj = parseDateStr(rawDate);
        if (!dateObj) continue;

        // Only import last 30 days
        if (dateObj < thirtyDaysAgo) continue;

        let rawAmount = row[amountIdx];
        let amt = parseCurrency(rawAmount);
        if (amt === null) continue;

        const rawType = typeIdx !== -1 ? (row[typeIdx] || "").toLowerCase() : "";

        // Normalize amounts: assume positive numbers in a 'debit' column are outflows (negative)
        if (rawType.includes("debit") && amt > 0) amt = -amt;
        // Standardize: expenses are negative, income is positive. 
        // If the CSV explicitly uses negatives for expenses, parseCurrency handles it.
        // Mint export: Amounts are raw numbers, Type is "debit/credit"
        // Apple Card export: Amounts are raw numbers. Cleared Date, Description, Category, Type, Amount (in USD)

        const desc = descIdx !== -1 ? row[descIdx] : "Unknown Item";
        const cat = categoryIdx !== -1 ? row[categoryIdx] : "Uncategorized";

        transactions.push({
            date: dateObj.toISOString().split('T')[0],
            amount: amt,
            description: desc,
            category: cat
        });
    }

    // Sort newest first
    return transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
}
