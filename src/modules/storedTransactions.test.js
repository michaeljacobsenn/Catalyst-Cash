import { describe, expect, it } from "vitest";

import { applyStoredTransactionOverrides, normalizeStoredTransactions } from "./storedTransactions.js";

describe("storedTransactions", () => {
  it("normalizes legacy transaction payloads", () => {
    expect(normalizeStoredTransactions({ transactions: [{ id: "1" }], fetchedAt: "now" })).toEqual({
      data: [{ id: "1" }],
      fetchedAt: "now",
    });

    expect(normalizeStoredTransactions({ data: [{ id: "2" }] })).toEqual({
      data: [{ id: "2" }],
      fetchedAt: "",
    });
  });

  it("applies persisted manual link overrides to cached transactions", () => {
    expect(
      applyStoredTransactionOverrides(
        [{ id: "txn_1", linkedCardId: "card_old", linkedBankAccountId: null, amount: 25 }],
        { txn_1: { linkedCardId: "card_new", linkedBankAccountId: null } }
      )
    ).toEqual([
      { id: "txn_1", linkedCardId: "card_new", linkedBankAccountId: null, amount: 25 },
    ]);
  });
});
