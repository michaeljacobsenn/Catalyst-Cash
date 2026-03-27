import { describe, expect, it } from "vitest";

import { computeCycleIncome } from "./budgetEngine.js";

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
});
