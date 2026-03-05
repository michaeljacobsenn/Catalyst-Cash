import { describe, it, expect } from "vitest";
import { computeFireProjection, estimateEffectiveTaxRate, annualizeRenewalCents } from "./fire.js";
import { toCents } from "./moneyMath.js";

describe("estimateEffectiveTaxRate", () => {
    it("returns 0 for income at or below standard deduction", () => {
        const result = estimateEffectiveTaxRate(toCents(15000), "single"); // $15,000 < $15,375 deduction
        expect(result.effectiveRateBps).toBe(0);
        expect(result.totalTaxCents).toBe(0);
    });

    it("computes correct tax for $50K single filer", () => {
        // $50,000 gross. Deduction = $15,375 → taxable = $34,625
        // 10% on first $11,625 = $1,162.50
        // 12% on $11,626–$34,625 = $23,000 × 0.12 = $2,760
        // Total tax ≈ $3,922.50
        const result = estimateEffectiveTaxRate(toCents(50000), "single");
        expect(result.totalTaxCents).toBeGreaterThan(toCents(3800));
        expect(result.totalTaxCents).toBeLessThan(toCents(4100));
        // Effective rate should be ~7.8% (much lower than marginal 12%)
        expect(result.effectiveRateBps).toBeGreaterThan(700);
        expect(result.effectiveRateBps).toBeLessThan(900);
    });

    it("computes correct tax for $100K single filer", () => {
        // $100,000 gross → taxable = $84,625
        // Should be in the 22% bracket but effective rate much lower
        const result = estimateEffectiveTaxRate(toCents(100000), "single");
        expect(result.effectiveRateBps).toBeGreaterThan(1300);
        expect(result.effectiveRateBps).toBeLessThan(1700);
    });

    it("married filing jointly has lower effective rate than single at same income", () => {
        const income = toCents(120000);
        const single = estimateEffectiveTaxRate(income, "single");
        const mfj = estimateEffectiveTaxRate(income, "married_filing_jointly");
        expect(mfj.effectiveRateBps).toBeLessThan(single.effectiveRateBps);
        expect(mfj.totalTaxCents).toBeLessThan(single.totalTaxCents);
    });

    it("returns 0 for zero or negative income", () => {
        expect(estimateEffectiveTaxRate(0).effectiveRateBps).toBe(0);
        expect(estimateEffectiveTaxRate(-5000).effectiveRateBps).toBe(0);
    });

    it("handles high income in 37% bracket", () => {
        const result = estimateEffectiveTaxRate(toCents(800000), "single");
        // Effective rate should be somewhere around 28-33% (blended)
        expect(result.effectiveRateBps).toBeGreaterThan(2500);
        expect(result.effectiveRateBps).toBeLessThan(3500);
    });
});

describe("annualizeRenewalCents — improved intervals", () => {
    it("handles quarterly interval correctly", () => {
        const annual = annualizeRenewalCents({ amount: 100, interval: 1, intervalUnit: "quarterly" });
        expect(annual).toBe(toCents(400));
    });

    it("handles semi-monthly interval", () => {
        const annual = annualizeRenewalCents({ amount: 50, interval: 1, intervalUnit: "semi-monthly" });
        expect(annual).toBe(toCents(1200));
    });

    it("uses 52.1775 weeks/year for weekly intervals", () => {
        const annual = annualizeRenewalCents({ amount: 100, interval: 1, intervalUnit: "weeks" });
        // $100/week × 52.1775 = $5,217.75
        expect(annual).toBe(Math.round(toCents(100) * 52.1775));
    });

    it("handles every-2-weeks interval", () => {
        const annual = annualizeRenewalCents({ amount: 200, interval: 2, intervalUnit: "weeks" });
        // $200 every 2 weeks = $100/week × 52.1775 = $5,217.75
        expect(annual).toBe(Math.round((toCents(200) / 2) * 52.1775));
    });

    it("falls back to monthly for unknown units", () => {
        const annual = annualizeRenewalCents({ amount: 100, interval: 1, intervalUnit: "fortnights" });
        expect(annual).toBe(toCents(1200));
    });
});

describe("FIRE projection math safety", () => {
    it("returns unreachable (not NaN/Infinity) for negative savings + non-positive real return", () => {
        const projection = computeFireProjection({
            financialConfig: {
                payFrequency: "bi-weekly",
                paycheckStandard: 1000,
                weeklySpendAllowance: 1200,
                budgetCategories: [{ name: "Core", monthlyTarget: 2500 }],
                fireExpectedReturnPct: 4,
                fireInflationPct: 7,
                fireSafeWithdrawalPct: 4
            },
            renewals: [],
            cards: []
        });

        expect(projection.status).toBe("unreachable");
        expect(projection.projectedYearsToFire).toBeNull();
        expect(projection.projectedFireDate).toBeNull();
        expect(Number.isFinite(projection.realReturnPct)).toBe(true);
    });

    it("handles inflation > return with zero income gracefully", () => {
        const projection = computeFireProjection({
            financialConfig: {
                payFrequency: "monthly",
                paycheckStandard: 0,
                weeklySpendAllowance: 300,
                budgetCategories: [{ name: "Core", monthlyTarget: 1800 }],
                fireExpectedReturnPct: 3,
                fireInflationPct: 8
            },
            renewals: [],
            cards: [],
            portfolioMarketValue: 100000
        });

        expect(projection.status).toBe("unreachable");
        expect(projection.projectedYearsToFire).toBeNull();
    });

    it("returns finite horizon for healthy savings profile", () => {
        const projection = computeFireProjection({
            financialConfig: {
                incomeSources: [{ name: "Salary", amount: 9000, frequency: "monthly" }],
                weeklySpendAllowance: 200,
                budgetCategories: [{ name: "Core", monthlyTarget: 2600 }],
                fireExpectedReturnPct: 7,
                fireInflationPct: 2.5,
                fireSafeWithdrawalPct: 4,
                taxBracketPercent: 0 // Disable tax for backward compatibility
            },
            renewals: [{ name: "Subscriptions", amount: 60, interval: 1, intervalUnit: "months" }],
            cards: [{ name: "Card", balance: 0, minPayment: 0, apr: 0 }],
            portfolioMarketValue: 180000
        });

        expect(projection.status).toBe("ok");
        expect(Number.isFinite(projection.projectedYearsToFire)).toBe(true);
        expect(typeof projection.projectedFireDate).toBe("string");
    });

    it("includes tax information in projection output", () => {
        const projection = computeFireProjection({
            financialConfig: {
                incomeSources: [{ name: "Salary", amount: 7500, frequency: "monthly" }],
                budgetCategories: [{ name: "Core", monthlyTarget: 3000 }],
                fireExpectedReturnPct: 7,
                fireInflationPct: 2.5,
                fireSafeWithdrawalPct: 4
            },
            renewals: [],
            cards: []
        });

        expect(projection.annualIncomeGross).toBeGreaterThan(0);
        expect(projection.annualTax).toBeGreaterThan(0);
        expect(projection.effectiveTaxRatePct).toBeGreaterThan(0);
        // Post-tax income should be less than gross
        expect(projection.annualIncome).toBeLessThan(projection.annualIncomeGross);
    });

    it("treats imported allocated budget categories as monthly expenses", () => {
        const projection = computeFireProjection({
            financialConfig: {
                incomeSources: [{ name: "Salary", amount: 6000, frequency: "monthly" }],
                budgetCategories: [{ name: "Core", allocated: 2500 }],
                fireExpectedReturnPct: 7,
                fireInflationPct: 2.5,
                fireSafeWithdrawalPct: 4,
                taxBracketPercent: 0
            },
            renewals: [],
            cards: []
        });

        expect(projection.annualExpenses).toBe(30000);
        expect(projection.targetPortfolio).toBe(750000);
    });

    it("explicit taxBracketPercent overrides bracket model", () => {
        const withBrackets = computeFireProjection({
            financialConfig: {
                incomeSources: [{ name: "Salary", amount: 7500, frequency: "monthly" }],
                budgetCategories: [{ name: "Core", monthlyTarget: 2000 }],
                fireSafeWithdrawalPct: 4
            },
            renewals: [],
            cards: []
        });

        const withExplicit = computeFireProjection({
            financialConfig: {
                incomeSources: [{ name: "Salary", amount: 7500, frequency: "monthly" }],
                budgetCategories: [{ name: "Core", monthlyTarget: 2000 }],
                fireSafeWithdrawalPct: 4,
                taxBracketPercent: 30 // Much higher than actual bracket
            },
            renewals: [],
            cards: []
        });

        // Higher tax rate = less savings = longer to FIRE
        expect(withExplicit.effectiveTaxRatePct).toBe(30);
        expect(withExplicit.annualTax).toBeGreaterThan(withBrackets.annualTax);
        if (withBrackets.projectedYearsToFire != null && withExplicit.projectedYearsToFire != null) {
            expect(withExplicit.projectedYearsToFire).toBeGreaterThan(withBrackets.projectedYearsToFire);
        }
    });
});
