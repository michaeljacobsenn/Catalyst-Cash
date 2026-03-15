export const CURRENCIES = [
  { code: "USD", symbol: "$", locale: "en-US", decimals: 2 },
  { code: "EUR", symbol: "€", locale: "de-DE", decimals: 2 },
  { code: "GBP", symbol: "£", locale: "en-GB", decimals: 2 },
  { code: "CAD", symbol: "C$", locale: "en-CA", decimals: 2 },
  { code: "AUD", symbol: "A$", locale: "en-AU", decimals: 2 },
  { code: "JPY", symbol: "¥", locale: "ja-JP", decimals: 0 },
  { code: "CHF", symbol: "CHF", locale: "de-CH", decimals: 2 },
  { code: "CNY", symbol: "¥", locale: "zh-CN", decimals: 2 },
  { code: "INR", symbol: "₹", locale: "en-IN", decimals: 2 },
];

const currencyMap = Object.fromEntries(CURRENCIES.map(currency => [currency.code, currency]));

export function getCurrency(code) {
  return currencyMap[code] || currencyMap.USD;
}

export function formatCurrency(amount, options = {}) {
  if (amount == null || Number.isNaN(Number(amount))) return "—";
  const currency = getCurrency(options.code);
  const value = Number(amount);
  const abs = Math.abs(value);
  const decimals = currency.decimals ?? 2;
  const formatted = abs.toLocaleString(currency.locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${value < 0 ? "-" : ""}${currency.symbol}${formatted}`;
}

export const fmt = amount => formatCurrency(amount);

export function extractDashboardMetrics(parsed) {
  const rows = Array.isArray(parsed?.dashboardCard) ? parsed.dashboardCard : [];
  const result = {
    checking: null,
    vault: null,
    pending: null,
    debts: null,
    available: null,
  };

  for (const row of rows) {
    const category = String(row?.category || "").toLowerCase();
    const amount = parseCurrency(row?.amount);
    if (amount == null) continue;
    if (category.includes("checking")) result.checking = amount;
    else if (category.includes("vault") || category.includes("savings")) result.vault = amount;
    else if (category.includes("pending")) result.pending = amount;
    else if (category.includes("debt")) result.debts = amount;
    else if (category.includes("available")) result.available = amount;
  }

  return result;
}

function parseCurrency(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = parseFloat(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function runRetirementForecast({
  currentAge,
  retirementAge,
  currentNetWorth = 0,
  monthlyContribution = 0,
  expectedAnnualReturn = 0.07,
  inflationRate = 0.025,
  annualRetirementSpend = 60000,
}) {
  const yearsToRetirement = Math.max(0, retirementAge - currentAge);
  const totalMonths = yearsToRetirement * 12;
  const realReturnRate = (1 + expectedAnnualReturn) / (1 + inflationRate) - 1;
  const monthlyRealReturn = Math.pow(1 + realReturnRate, 1 / 12) - 1;

  let projectedBalance = currentNetWorth;
  const trajectory = [];

  for (let month = 1; month <= totalMonths; month += 1) {
    projectedBalance = projectedBalance * (1 + monthlyRealReturn) + monthlyContribution;
    if (month % 12 === 0) {
      trajectory.push({
        age: currentAge + month / 12,
        balance: projectedBalance,
      });
    }
  }

  const yearsInRetirement = 30;
  const swrRequired = annualRetirementSpend / (projectedBalance || 1);
  const isSafe = swrRequired <= 0.04;
  let retirementBalance = projectedBalance;
  let yearsSurvived = 0;
  const monthlySpend = annualRetirementSpend / 12;

  for (let month = 1; month <= yearsInRetirement * 12; month += 1) {
    retirementBalance = retirementBalance * (1 + monthlyRealReturn) - monthlySpend;
    if (retirementBalance < 0) break;
    if (month % 12 === 0) yearsSurvived += 1;
  }

  const successProbability = yearsSurvived >= 30 ? 99 : Math.round((yearsSurvived / 30) * 100);

  return {
    projectedAtRetirement: Math.round(projectedBalance),
    safeWithdrawalAmount: Math.round(projectedBalance * 0.04),
    targetAnnualSpend: annualRetirementSpend,
    isSufficient: isSafe,
    successProbability,
    yearsSurvived,
    trajectory,
    promptContext: `
<RETIREMENT_FORECAST>
User is currently ${currentAge}, planning to retire at ${retirementAge}.
Current investable net worth: $${currentNetWorth}.
Monthly contribution: $${monthlyContribution}.
Projected nest egg at age ${retirementAge} (inflation-adjusted): $${Math.round(projectedBalance).toLocaleString()}.
They want to spend $${annualRetirementSpend.toLocaleString()}/yr. 
At a 4% safe withdrawal rate, their nest egg supports $${Math.round(projectedBalance * 0.04).toLocaleString()}/yr.
Monte Carlo Score: ${successProbability}% probability of funds lasting 30 years.
${successProbability < 80 ? "WARNING: User is off-track for retirement. Aggressively recommend increasing savings or delaying retirement." : "STATUS: User is on-track for retirement."}
</RETIREMENT_FORECAST>
    `.trim(),
  };
}
