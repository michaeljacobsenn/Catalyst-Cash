import { describe, expect, it } from "vitest";
import {
  getMostRecentPlaidSyncTime,
  shouldFetchTransactionsForSync,
  summarizeSyncOutcome,
} from "./usePlaidSync.js";

describe("usePlaidSync helpers", () => {
  it("calculates cooldowns from the active plaid connections only", () => {
    const cards = [
      { _plaidConnectionId: "item_active", _plaidLastSync: "2026-03-17T12:00:00.000Z" },
      { _plaidConnectionId: "item_paused", _plaidLastSync: "2026-03-18T12:00:00.000Z" },
    ];
    const bankAccounts = [{ _plaidConnectionId: "item_active", _plaidLastSync: "2026-03-17T18:00:00.000Z" }];

    const lastSyncAt = getMostRecentPlaidSyncTime(cards, bankAccounts, ["item_active"]);
    expect(lastSyncAt).toBe(new Date("2026-03-17T18:00:00.000Z").getTime());
  });

  it("fetches transactions only when the current effective tier can actually use them", () => {
    expect(
      shouldFetchTransactionsForSync({
        autoFetchTransactions: true,
        effectiveTierId: "free",
        gatingEnforced: true,
      })
    ).toBe(false);

    expect(
      shouldFetchTransactionsForSync({
        autoFetchTransactions: true,
        effectiveTierId: "pro",
        gatingEnforced: true,
      })
    ).toBe(true);

    expect(
      shouldFetchTransactionsForSync({
        autoFetchTransactions: true,
        effectiveTierId: "free",
        gatingEnforced: false,
      })
    ).toBe(true);
  });

  it("reports partial syncs as informational instead of claiming full success", () => {
    expect(
      summarizeSyncOutcome({
        requestedCount: 3,
        successCount: 2,
        pendingCount: 1,
        forceSyncSucceeded: true,
      })
    ).toEqual({
      kind: "info",
      message: "Synced 2 of 3 linked institutions. 1 institution is still processing.",
    });
  });

  it("keeps full success messaging only for fully completed live syncs", () => {
    expect(
      summarizeSyncOutcome({
        requestedCount: 2,
        successCount: 2,
        pendingCount: 0,
        forceSyncSucceeded: true,
        successMessage: "Balances synced successfully",
      })
    ).toEqual({
      kind: "success",
      message: "Balances synced successfully",
    });
  });
});
