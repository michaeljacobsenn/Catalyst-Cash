import { describe, expect, it } from "vitest";
import {
  clearDeletedManualHolding,
  getPreferredInvestmentBucketValue,
  markManualHoldingDeleted,
  sanitizeManualInvestmentHoldings,
} from "./investmentHoldings.js";

describe("investment holdings guards", () => {
  it("removes deleted symbols during sanitization", () => {
    const result = sanitizeManualInvestmentHoldings({
      holdings: {
        roth: [{ symbol: "VFIFX", shares: "101" }, { symbol: "VTI", shares: "5" }],
      },
      deletedHoldingSymbols: {
        roth: ["vfifx"],
      },
    });

    expect(result.holdings.roth).toEqual([{ symbol: "VTI", shares: "5" }]);
    expect(result.deletedHoldingSymbols.roth).toEqual(["VFIFX"]);
  });

  it("marks a symbol deleted and strips it from holdings", () => {
    const result = markManualHoldingDeleted(
      {
        holdings: {
          roth: [{ symbol: "VFIFX", shares: "101" }],
        },
      },
      "roth",
      "vfifx"
    );

    expect(result.holdings.roth).toEqual([]);
    expect(result.deletedHoldingSymbols.roth).toEqual(["VFIFX"]);
  });

  it("allows an explicitly re-added symbol by clearing its tombstone", () => {
    const result = clearDeletedManualHolding(
      {
        holdings: {
          roth: [{ symbol: "VFIFX", shares: "101" }],
        },
        deletedHoldingSymbols: {
          roth: ["VFIFX"],
        },
      },
      "roth",
      "vfifx"
    );

    expect(result.deletedHoldingSymbols).toEqual({});
    expect(result.holdings.roth).toEqual([{ symbol: "VFIFX", shares: "101" }]);
  });

  it("prefers linked plaid balances over manual holdings in the same bucket", () => {
    expect(getPreferredInvestmentBucketValue({ manualValue: 8200, plaidValue: 9600 })).toEqual({
      value: 9600,
      source: "plaid",
    });
  });
});
