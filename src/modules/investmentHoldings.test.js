import { describe, expect, it } from "vitest";
import {
  clearDeletedManualHolding,
  getManualHoldingSourceId,
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

    expect(result.holdings.roth).toEqual([expect.objectContaining({ symbol: "VTI", shares: "5" })]);
    expect(result.deletedHoldingSymbols.roth).toEqual(["VFIFX"]);
  });

  it("marks a holding deleted by id and strips it from holdings", () => {
    const result = markManualHoldingDeleted(
      {
        holdings: {
          roth: [{ id: "holding_vfifx", symbol: "VFIFX", shares: "101" }],
        },
      },
      "roth",
      { id: "holding_vfifx", symbol: "vfifx" }
    );

    expect(result.holdings.roth).toEqual([]);
    expect(result.deletedHoldingSymbols.roth).toEqual(["VFIFX"]);
    expect(result.deletedHoldingIds).toEqual(["holding_vfifx"]);
  });

  it("allows an explicitly re-added symbol by clearing its tombstone", () => {
    const result = clearDeletedManualHolding(
      {
        holdings: {
          roth: [{ id: "holding_vfifx_new", symbol: "VFIFX", shares: "101" }],
        },
        deletedHoldingSymbols: {
          roth: ["VFIFX"],
        },
        deletedHoldingIds: ["holding_vfifx_old"],
      },
      "roth",
      { id: "holding_vfifx_new", symbol: "vfifx" }
    );

    expect(result.deletedHoldingSymbols).toEqual({});
    expect(result.deletedHoldingIds).toEqual(["holding_vfifx_old"]);
    expect(result.holdings.roth).toEqual([expect.objectContaining({ symbol: "VFIFX", shares: "101" })]);
  });

  it("builds per-holding source ids from stable holding ids", () => {
    expect(getManualHoldingSourceId("roth", { id: "holding_vti" })).toBe("manual-holding:roth:holding_vti");
  });

  it("prefers linked plaid balances over manual holdings in the same bucket", () => {
    expect(getPreferredInvestmentBucketValue({ manualValue: 8200, plaidValue: 9600 })).toEqual({
      value: 9600,
      source: "plaid",
    });
  });
});
