import { fromBps, fromCents, toBps, toCents } from "./moneyMath.js";

const BPS_SCALE = 10000;
const DEFAULT_SWR_BPS = 400; // 4.00%
const DEFAULT_EXPECTED_RETURN_BPS = 700; // 7.00%
const DEFAULT_INFLATION_BPS = 250; // 2.50%

/**
 * Normalize a percentage config value to basis points.
 * Config stores percentages as whole numbers (e.g. 4 = 4%, 7.5 = 7.5%).
 * toBps() treats its input as "the number before the %" (24.99 → 2499 bps),
 * which is correct for APR strings but wrong if the value is already a
 * decimal fraction (0.04 meaning 4%). This helper disambiguates.
 */
function pctToBps(value, fallbackBps) {
    if (value == null || value === "") return fallbackBps;
    const n = typeof value === "string" ? parseFloat(value) : value;
    if (!Number.isFinite(n) || n === 0) return fallbackBps;
    // Values < 1 are assumed to be decimal fractions (0.04 = 4%)
    // Values >= 1 are assumed to be whole percentages (4 = 4%)
    if (Math.abs(n) < 1) return Math.round(n * BPS_SCALE);
    return Math.round(n * 100);
}

function safeNumber(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
}

function toIsoDate(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function addMonths(date, months) {
    const out = new Date(Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth() + months,
        date.getUTCDate()
    ));
    return out;
}

function annualizeIncomeSourceCents(source) {
    const amountCents = Math.max(0, toCents(source?.amount || 0));
    const frequency = String(source?.frequency || "monthly").toLowerCase();
    if (amountCents <= 0) return 0;

    if (frequency === "weekly") return amountCents * 52;
    if (frequency === "bi-weekly" || frequency === "biweekly") return amountCents * 26;
    if (frequency === "semi-monthly" || frequency === "semimonthly") return amountCents * 24;
    if (frequency === "quarterly") return amountCents * 4;
    if (frequency === "annual" || frequency === "yearly") return amountCents;
    return amountCents * 12;
}

function annualIncomeFromConfigCents(config = {}) {
    const explicitIncome = (config?.incomeSources || []).reduce((sum, src) => sum + annualizeIncomeSourceCents(src), 0);
    if (explicitIncome > 0) return explicitIncome;

    const frequency = String(config?.payFrequency || "bi-weekly").toLowerCase();
    const standardPaycheckCents = Math.max(0, toCents(config?.paycheckStandard || config?.averagePaycheck || 0));
    if (standardPaycheckCents <= 0) return 0;

    if (frequency === "weekly") return standardPaycheckCents * 52;
    if (frequency === "bi-weekly" || frequency === "biweekly") return standardPaycheckCents * 26;
    if (frequency === "semi-monthly" || frequency === "semimonthly") return standardPaycheckCents * 24;
    if (frequency === "monthly") return standardPaycheckCents * 12;
    return standardPaycheckCents * 26;
}

export function annualizeRenewalCents(item) {
    const amountCents = Math.max(0, toCents(item?.amount || 0));
    const interval = Math.max(1, Number.parseInt(item?.interval, 10) || 1);
    const unit = String(item?.intervalUnit || "months").toLowerCase();
    if (amountCents <= 0) return 0;

    // Use precise day-count annualization for all intervals.
    // 365.2425 = Gregorian average year length (accounts for leap years).
    // 52.1775 = exact weeks per year (365.2425 / 7)
    if (unit === "days") return Math.round((amountCents / interval) * 365.2425);
    if (unit === "weeks") return Math.round((amountCents / interval) * 52.1775);
    if (unit === "semi-monthly" || unit === "semimonthly") return Math.round((amountCents / interval) * 24);
    if (unit === "months") return Math.round((amountCents / interval) * 12);
    if (unit === "quarters" || unit === "quarterly") return Math.round((amountCents / interval) * 4);
    if (unit === "years" || unit === "annually") return Math.round(amountCents / interval);
    // Fallback: treat as monthly
    return Math.round((amountCents / interval) * 12);
}

function annualExpensesFromInputsCents(config = {}, renewals = [], cards = []) {
    const budgetMonthlyCents = (config?.budgetCategories || []).reduce((sum, cat) => (
        sum + Math.max(0, toCents(cat?.monthlyTarget || 0))
    ), 0);
    const annualBudgetCents = budgetMonthlyCents * 12;
    const annualAllowanceCents = Math.max(0, toCents(config?.weeklySpendAllowance || 0)) * 52;
    const annualRenewalsCents = (renewals || [])
        .filter(r => !r?.isCancelled)
        .reduce((sum, r) => sum + annualizeRenewalCents(r), 0);

    const annualCardMinimumsCents = (cards || [])
        .filter(c => toCents(c?.balance || 0) > 0)
        .reduce((sum, c) => sum + (Math.max(0, toCents(c?.minPayment || 0)) * 12), 0);

    const annualNonCardMinimumsCents = (config?.nonCardDebts || [])
        .filter(d => toCents(d?.balance || 0) > 0)
        .reduce((sum, d) => {
            const minimumCents = Math.max(0, toCents(d?.minimum ?? d?.minPayment ?? 0));
            return sum + (minimumCents * 12);
        }, 0);

    return annualBudgetCents + annualAllowanceCents + annualRenewalsCents + annualCardMinimumsCents + annualNonCardMinimumsCents;
}

function currentPortfolioFromInputsCents(config = {}, portfolioMarketValue = 0) {
    const marketValueCents = Math.max(0, toCents(portfolioMarketValue || 0));
    const manualInvestmentsCents =
        Math.max(0, toCents(config?.investmentBrokerage || 0)) +
        Math.max(0, toCents(config?.investmentRoth || 0)) +
        Math.max(0, toCents(config?.k401Balance || 0)) +
        Math.max(0, toCents(config?.hsaBalance || 0));

    // Avoid double-counting holdings + manual mirrors; use the larger of the two snapshots.
    return Math.max(marketValueCents, manualInvestmentsCents);
}

function sanitizeYears(value) {
    if (!Number.isFinite(value) || value < 0) return null;
    if (value > 150) return null;
    return value;
}

// ═══════════════════════════════════════════════════════════════
// FEDERAL TAX BRACKET MODEL
// Uses 2026 projected brackets (inflation-adjusted from 2024).
// Supports single and married_filing_jointly filing statuses.
// Returns effective (average) tax rate, NOT marginal rate.
// All calculations in integer cents for consistency.
// ═══════════════════════════════════════════════════════════════

const FEDERAL_BRACKETS_2026 = {
    single: [
        { upTo: 1162500, rate: 1000 },   // 10% on first $11,625
        { upTo: 4727500, rate: 1200 },   // 12% on $11,626–$47,275
        { upTo: 10088500, rate: 2200 },  // 22% on $47,276–$100,885
        { upTo: 19182500, rate: 2400 },  // 24% on $100,886–$191,825
        { upTo: 24370000, rate: 3200 },  // 32% on $191,826–$243,700
        { upTo: 60962500, rate: 3500 },  // 35% on $243,701–$609,625
        { upTo: Infinity, rate: 3700 },  // 37% on $609,626+
    ],
    married_filing_jointly: [
        { upTo: 2325000, rate: 1000 },   // 10% on first $23,250
        { upTo: 9455000, rate: 1200 },   // 12% on $23,251–$94,550
        { upTo: 20177000, rate: 2200 },  // 22% on $94,551–$201,770
        { upTo: 38365000, rate: 2400 },  // 24% on $201,771–$383,650
        { upTo: 48740000, rate: 3200 },  // 32% on $383,651–$487,400
        { upTo: 73112500, rate: 3500 },  // 35% on $487,401–$731,125
        { upTo: Infinity, rate: 3700 },  // 37% on $731,126+
    ]
};

// Standard deduction amounts (2026 projected)
const STANDARD_DEDUCTION_2026 = {
    single: 1537500,             // $15,375
    married_filing_jointly: 3075000,  // $30,750
};

/**
 * Estimate effective (average) federal tax rate for a given annual income.
 * @param {number} annualIncomeCents - Gross annual income in cents
 * @param {string} [filingStatus="single"] - "single" or "married_filing_jointly"
 * @returns {{ effectiveRateBps: number, totalTaxCents: number, taxableIncomeCents: number }}
 */
export function estimateEffectiveTaxRate(annualIncomeCents, filingStatus = "single") {
    if (!Number.isFinite(annualIncomeCents) || annualIncomeCents <= 0) {
        return { effectiveRateBps: 0, totalTaxCents: 0, taxableIncomeCents: 0 };
    }

    const status = String(filingStatus || "single").toLowerCase().replace(/\s+/g, "_");
    const brackets = FEDERAL_BRACKETS_2026[status] || FEDERAL_BRACKETS_2026.single;
    const deduction = STANDARD_DEDUCTION_2026[status] || STANDARD_DEDUCTION_2026.single;

    const taxableIncomeCents = Math.max(0, annualIncomeCents - deduction);
    if (taxableIncomeCents <= 0) {
        return { effectiveRateBps: 0, totalTaxCents: 0, taxableIncomeCents: 0 };
    }

    let totalTaxCents = 0;
    let prevCeiling = 0;

    for (const bracket of brackets) {
        if (taxableIncomeCents <= prevCeiling) break;

        const taxableInBracket = Math.min(taxableIncomeCents, bracket.upTo) - prevCeiling;
        if (taxableInBracket > 0) {
            // bracket.rate is in bps (1000 = 10%)
            totalTaxCents += Math.round((taxableInBracket * bracket.rate) / BPS_SCALE);
        }
        prevCeiling = bracket.upTo;
    }

    // Effective rate as bps of GROSS income (not taxable)
    const effectiveRateBps = Math.round((totalTaxCents * BPS_SCALE) / annualIncomeCents);

    return { effectiveRateBps, totalTaxCents, taxableIncomeCents };
}

function buildUnreachableProjection(base, reason) {
    return {
        ...base,
        status: "unreachable",
        reason,
        projectedYearsToFire: null,
        projectedFireDate: null
    };
}

export function computeFireProjection({
    financialConfig = {},
    renewals = [],
    cards = [],
    portfolioMarketValue = 0,
    asOfDate = new Date().toISOString().split("T")[0]
} = {}) {
    const annualIncomeGrossCents = annualIncomeFromConfigCents(financialConfig);
    const annualExpensesCents = annualExpensesFromInputsCents(financialConfig, renewals, cards);
    const currentPortfolioCents = currentPortfolioFromInputsCents(financialConfig, portfolioMarketValue);

    // Apply tax modeling — estimate effective federal tax to get post-tax income
    const filingStatus = String(financialConfig?.filingStatus || "single").toLowerCase();
    const taxResult = estimateEffectiveTaxRate(annualIncomeGrossCents, filingStatus);

    // If user provided an explicit tax bracket percentage, use that instead
    const explicitTaxPct = financialConfig?.taxBracketPercent;
    let annualTaxCents;
    let effectiveTaxRateBps;
    if (explicitTaxPct != null && Number.isFinite(Number(explicitTaxPct)) && Number(explicitTaxPct) > 0) {
        effectiveTaxRateBps = Math.round(Number(explicitTaxPct) * 100);
        annualTaxCents = Math.round((annualIncomeGrossCents * effectiveTaxRateBps) / BPS_SCALE);
    } else {
        effectiveTaxRateBps = taxResult.effectiveRateBps;
        annualTaxCents = taxResult.totalTaxCents;
    }

    const annualIncomePostTaxCents = annualIncomeGrossCents - annualTaxCents;
    const annualSavingsCents = annualIncomePostTaxCents - annualExpensesCents;

    const swrBps = pctToBps(financialConfig?.fireSafeWithdrawalPct, DEFAULT_SWR_BPS);
    const expectedReturnBps = pctToBps(financialConfig?.fireExpectedReturnPct ?? financialConfig?.arbitrageTargetAPR, DEFAULT_EXPECTED_RETURN_BPS);
    const inflationBps = pctToBps(financialConfig?.fireInflationPct, DEFAULT_INFLATION_BPS);

    const targetPortfolioCents = Math.ceil((annualExpensesCents * BPS_SCALE) / swrBps);
    const base = {
        status: "ok",
        reason: null,
        annualIncomeGross: fromCents(annualIncomeGrossCents),
        annualIncome: fromCents(annualIncomePostTaxCents),
        annualTax: fromCents(annualTaxCents),
        effectiveTaxRatePct: fromBps(effectiveTaxRateBps),
        annualExpenses: fromCents(annualExpensesCents),
        annualSavings: fromCents(annualSavingsCents),
        savingsRatePct: annualIncomePostTaxCents > 0 ? safeNumber((annualSavingsCents / annualIncomePostTaxCents) * 100, null) : null,
        currentPortfolio: fromCents(currentPortfolioCents),
        targetPortfolio: fromCents(targetPortfolioCents),
        safeWithdrawalPct: fromBps(swrBps),
        expectedReturnPct: fromBps(expectedReturnBps),
        inflationPct: fromBps(inflationBps),
        realReturnPct: null,
        projectedYearsToFire: null,
        projectedFireDate: null
    };

    if (targetPortfolioCents <= 0) {
        return {
            ...base,
            projectedYearsToFire: 0,
            projectedFireDate: asOfDate
        };
    }

    if (currentPortfolioCents >= targetPortfolioCents) {
        return {
            ...base,
            projectedYearsToFire: 0,
            projectedFireDate: asOfDate
        };
    }

    // Real return r = ((1+nominal)/(1+inflation)) - 1, represented in bps.
    const realFactorScaled = ((BPS_SCALE + expectedReturnBps) * BPS_SCALE) / (BPS_SCALE + inflationBps);
    const realReturnBps = Math.round(realFactorScaled - BPS_SCALE);
    const realReturn = realReturnBps / BPS_SCALE;
    const annualSavings = annualSavingsCents / 100;
    const currentPortfolio = currentPortfolioCents / 100;
    const targetPortfolio = targetPortfolioCents / 100;

    base.realReturnPct = fromBps(realReturnBps);

    if (annualIncomePostTaxCents <= 0 && annualSavingsCents <= 0) {
        return buildUnreachableProjection(base, "zero-income-negative-savings");
    }
    if (annualSavingsCents <= 0 && realReturnBps <= 0) {
        return buildUnreachableProjection(base, "negative-savings-and-nonpositive-real-return");
    }
    if (currentPortfolio <= 0 && annualSavings <= 0) {
        return buildUnreachableProjection(base, "no-capital-base");
    }

    let years = null;

    if (annualSavings <= 0 && realReturn > 0) {
        const growthRatio = targetPortfolio / currentPortfolio;
        if (growthRatio <= 1) years = 0;
        else years = Math.log(growthRatio) / Math.log(1 + realReturn);
    } else if (Math.abs(realReturn) < 1e-9) {
        const required = targetPortfolio - currentPortfolio;
        if (annualSavings <= 0) return buildUnreachableProjection(base, "zero-real-return-without-positive-savings");
        years = required <= 0 ? 0 : required / annualSavings;
    } else {
        // Solve: target = P(1+r)^n + C((1+r)^n - 1)/r
        const numerator = (targetPortfolio * realReturn) + annualSavings;
        const denominator = (currentPortfolio * realReturn) + annualSavings;
        if (numerator <= 0 || denominator <= 0) {
            return buildUnreachableProjection(base, "invalid-log-domain");
        }
        const ratio = numerator / denominator;
        years = Math.log(ratio) / Math.log(1 + realReturn);
    }

    years = sanitizeYears(years);
    if (years == null) {
        return buildUnreachableProjection(base, "unstable-projection");
    }

    const months = Math.max(0, Math.ceil(years * 12));
    const asOf = new Date(`${asOfDate}T00:00:00Z`);
    const fireDate = addMonths(asOf, months);

    return {
        ...base,
        projectedYearsToFire: years,
        projectedFireDate: toIsoDate(fireDate)
    };
}
