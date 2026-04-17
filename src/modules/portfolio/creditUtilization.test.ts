import { describe, expect, it } from "vitest";

import { computeCreditUtilizationSummary } from "./creditUtilization.js";

describe("computeCreditUtilizationSummary", () => {
  it("ignores charge cards and clamps negative balances", () => {
    const summary = computeCreditUtilizationSummary([
      { cardType: "credit", balance: -50, limit: 1000 },
      { cardType: "credit", _plaidBalance: 250, _plaidLimit: 5000 },
      { cardType: "charge", balance: 900, limit: 0 },
    ] as never[]);

    expect(summary).toMatchObject({
      totalCreditBalance: 250,
      totalCreditLimit: 6000,
      creditUtilization: 250 / 6000 * 100,
      gaugeUtilization: 250 / 6000 * 100,
    });
  });

  it("caps the gauge at 100 percent when balances exceed limits", () => {
    const summary = computeCreditUtilizationSummary([
      { cardType: "credit", balance: 1800, limit: 1000 },
    ] as never[]);

    expect(summary.creditUtilization).toBe(180);
    expect(summary.gaugeUtilization).toBe(100);
  });
});
