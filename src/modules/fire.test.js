import { describe, it, expect } from "vitest";
import { computeFireProjection } from "./fire.js";

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
                fireSafeWithdrawalPct: 4
            },
            renewals: [{ name: "Subscriptions", amount: 60, interval: 1, intervalUnit: "months" }],
            cards: [{ name: "Card", balance: 0, minPayment: 0, apr: 0 }],
            portfolioMarketValue: 180000
        });

        expect(projection.status).toBe("ok");
        expect(Number.isFinite(projection.projectedYearsToFire)).toBe(true);
        expect(typeof projection.projectedFireDate).toBe("string");
    });
});
