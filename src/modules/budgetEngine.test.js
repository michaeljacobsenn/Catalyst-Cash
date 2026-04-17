import { describe, expect, it } from "vitest";

import { computeBudgetStatus, computeCycleIncome, inferBucket } from "./budgetEngine.js";

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
});
