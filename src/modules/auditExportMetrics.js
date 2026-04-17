function parseCurrency(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const text = String(value).trim();
  const isNegative = text.startsWith("-") || (text.startsWith("(") && text.endsWith(")"));
  const cleaned = text.replace(/[^0-9.]+/g, "");
  if (!cleaned) return null;

  const amount = parseFloat(cleaned);
  if (!Number.isFinite(amount)) return null;
  return isNegative ? -amount : amount;
}

export function extractDashboardMetrics(parsed) {
  const structured = parsed?.structured || {};
  const legacy = structured.dashboard || parsed?.dashboardData || {};
  const legacyChecking = parseCurrency(legacy.checkingBalance);
  const legacyVault = parseCurrency(legacy.savingsVaultTotal || legacy.allyVaultTotal);
  const legacyPending = parseCurrency(legacy.next7DaysNeed);
  const legacyAvailable = parseCurrency(legacy.checkingProjEnd);

  const cardRows = Array.isArray(parsed?.dashboardCard)
    ? parsed.dashboardCard
    : Array.isArray(structured.dashboardCard)
      ? structured.dashboardCard
      : [];

  if (!cardRows.length) {
    return {
      checking: legacyChecking,
      vault: legacyVault,
      pending: legacyPending,
      debts: null,
      available: legacyAvailable,
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
    otherAssets: rowValue["other assets"] ?? null,
    pending: rowValue.pending ?? legacyPending,
    debts: rowValue.debts ?? null,
    available: rowValue.available ?? legacyAvailable,
  };
}
