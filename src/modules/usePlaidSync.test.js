import { describe, expect, it } from "vitest";
import {
  getMostRecentPlaidSyncTime,
  hasCachedPlaidSnapshot,
  shouldRunBackgroundPlaidMaintenance,
  shouldEnforcePlaidSyncCooldown,
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

  it("enforces manual sync cooldowns only when gating is live", () => {
    expect(
      shouldEnforcePlaidSyncCooldown({
        gatingEnforced: true,
      })
    ).toBe(true);

    expect(
      shouldEnforcePlaidSyncCooldown({
        gatingEnforced: false,
      })
    ).toBe(false);
  });

  it("rate-limits silent background maintenance locally between foreground events", () => {
    const now = new Date("2026-03-26T16:00:00.000Z").getTime();
    expect(shouldRunBackgroundPlaidMaintenance(0, now)).toBe(true);
    expect(shouldRunBackgroundPlaidMaintenance(now - (5 * 60 * 1000), now)).toBe(false);
    expect(shouldRunBackgroundPlaidMaintenance(now - (16 * 60 * 1000), now)).toBe(true);
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

  it("downgrades success when one institution is still showing cached data", () => {
    expect(
      summarizeSyncOutcome({
        requestedCount: 2,
        successCount: 2,
        staleCount: 1,
        pendingCount: 0,
        forceSyncSucceeded: true,
      })
    ).toEqual({
      kind: "info",
      message: "Live balances refreshed for 1 institution. 1 institution is still showing cached data.",
    });
  });

  it("treats existing linked plaid balances as cached fallback data", () => {
    expect(
      hasCachedPlaidSnapshot(
        [
          {
            _plaidConnectionId: "item_1",
            _plaidBalance: 123.45,
          },
        ],
        [],
        ["item_1"]
      )
    ).toBe(true);

    expect(
      hasCachedPlaidSnapshot(
        [
          {
            _plaidConnectionId: "item_other",
            _plaidBalance: 123.45,
          },
        ],
        [],
        ["item_1"]
      )
    ).toBe(false);
  });

  it("reports cached fallback cleanly when live sync fails but saved plaid data exists", () => {
    expect(
      summarizeSyncOutcome({
        requestedCount: 2,
        successCount: 0,
        pendingCount: 0,
        forceSyncSucceeded: false,
        hadCachedSnapshot: true,
      })
    ).toEqual({
      kind: "info",
      message: "Live sync did not complete, but Catalyst kept showing your most recent saved bank data.",
    });
  });
});
