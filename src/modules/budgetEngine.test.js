import { describe, expect, it } from "vitest";

import { computeBudgetStatus, computeCycleIncome, inferBucket, suggestLinesFromRenewals } from "./budgetEngine.js";

describe("computeCycleIncome", () => {
  it("falls back to paycheckStandard when no income sources are configured", () => {
    expect(computeCycleIncome({ paycheckStandard: 1850 })).toBe(1850);
  });

  it("uses explicit income sources as the per-cycle budget base", () => {
    expect(
      computeCycleIncome({
        payFrequency: "bi-weekly",
        paycheckStandard: 0,
        incomeSources: [
          { amount: 2000, frequency: "bi-weekly" },
          { amount: 500, frequency: "monthly" },
        ],
      })
    ).toBe(2227.34);
  });

  it("routes common categories into the new paycheck buckets", () => {
    expect(inferBucket("Rent")).toBe("bills");
    expect(inferBucket("Groceries")).toBe("needs");
    expect(inferBucket("Dining Out")).toBe("wants");
    expect(inferBucket("Subscriptions")).toBe("wants");
    expect(inferBucket("Emergency Fund")).toBe("savings");
  });

  it("returns totals for bills, needs, wants, and savings", () => {
    expect(
      computeBudgetStatus(
        [
          { bucket: "bills", amount: 900 },
          { bucket: "needs", amount: 250 },
          { bucket: "wants", amount: 125 },
          { bucket: "savings", amount: 300 },
        ],
        2000
      )
    ).toMatchObject({
      totalBills: 900,
      totalNeeds: 250,
      totalWants: 125,
      totalSavings: 300,
      totalAssigned: 1575,
      readyToAssign: 425,
    });
  });

  it("seeds budget lines from recurring renewals without pulling in canceled or annual fee items", () => {
    expect(
      suggestLinesFromRenewals(
        [
          { id: "rent", name: "Rent", amount: 1800, interval: 1, intervalUnit: "months" },
          { id: "netflix", name: "Netflix", amount: 15.99, interval: 1, intervalUnit: "months" },
          { id: "car-insurance", name: "Car Insurance", amount: 210, interval: 6, intervalUnit: "months" },
          { id: "fee", name: "Annual Fee", amount: 95, interval: 1, intervalUnit: "years", isAnnualFee: true },
          { id: "paused", name: "Paused", amount: 25, interval: 1, intervalUnit: "months", isCancelled: true },
        ],
        "bi-weekly"
      )
    ).toMatchObject([
      { name: "Rent", bucket: "bills", amount: 829.49, isAuto: true },
      { name: "Car Insurance", bucket: "bills", amount: 16.13, isAuto: true },
      { name: "Netflix", bucket: "wants", amount: 7.37, isAuto: true },
    ]);
  });
});
