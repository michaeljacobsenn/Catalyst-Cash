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

function annualizeRenewalCents(item) {
    const amountCents = Math.max(0, toCents(item?.amount || 0));
    const interval = Math.max(1, Number.parseInt(item?.interval, 10) || 1);
    const unit = String(item?.intervalUnit || "months").toLowerCase();
    if (amountCents <= 0) return 0;

    if (unit === "days") return Math.round((amountCents / interval) * 365.2425);
    if (unit === "weeks") return Math.round((amountCents / interval) * 52);
    if (unit === "months") return Math.round((amountCents / interval) * 12);
    if (unit === "years") return Math.round(amountCents / interval);
    return 0;
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
    const annualIncomeCents = annualIncomeFromConfigCents(financialConfig);
    const annualExpensesCents = annualExpensesFromInputsCents(financialConfig, renewals, cards);
    const annualSavingsCents = annualIncomeCents - annualExpensesCents;
    const currentPortfolioCents = currentPortfolioFromInputsCents(financialConfig, portfolioMarketValue);

    const swrBps = pctToBps(financialConfig?.fireSafeWithdrawalPct, DEFAULT_SWR_BPS);
    const expectedReturnBps = pctToBps(financialConfig?.fireExpectedReturnPct ?? financialConfig?.arbitrageTargetAPR, DEFAULT_EXPECTED_RETURN_BPS);
    const inflationBps = pctToBps(financialConfig?.fireInflationPct, DEFAULT_INFLATION_BPS);

    const targetPortfolioCents = Math.ceil((annualExpensesCents * BPS_SCALE) / swrBps);
    const base = {
        status: "ok",
        reason: null,
        annualIncome: fromCents(annualIncomeCents),
        annualExpenses: fromCents(annualExpensesCents),
        annualSavings: fromCents(annualSavingsCents),
        savingsRatePct: annualIncomeCents > 0 ? safeNumber((annualSavingsCents / annualIncomeCents) * 100, null) : null,
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

    if (annualIncomeCents <= 0 && annualSavingsCents <= 0) {
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
