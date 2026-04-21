import { describe, expect, it, vi } from "vitest";
import {
  buildPlaidRefreshCadenceCopy,
  getPlaidManualSyncRetryAfterMs,
  getMostRecentPlaidSyncTime,
  getPlaidRefreshWindowConfig,
  hasCachedPlaidSnapshot,
  parsePlaidSyncTimestamp,
  refreshTransactionsAfterSync,
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

  it("treats SQL-style Plaid sync timestamps as UTC before formatting locally", () => {
    expect(parsePlaidSyncTimestamp("2026-04-12 15:00:00")).toBe(new Date("2026-04-12T15:00:00.000Z").getTime());
  });

  it("describes the live plaid refresh cadence by dataset for pro sync", () => {
    expect(
      getPlaidRefreshWindowConfig({
        effectiveTierId: "pro",
        gatingEnforced: true,
      })
    ).toEqual({
      balances: 24 * 60 * 60 * 1000,
      transactions: 3 * 24 * 60 * 60 * 1000,
      liabilities: 7 * 24 * 60 * 60 * 1000,
    });

    expect(
      buildPlaidRefreshCadenceCopy({
        effectiveTierId: "pro",
        gatingEnforced: true,
      })
    ).toBe(
      "Balance refreshes reopen every 24 hours. Transactions typically refresh every 72 hours, and liabilities refresh every 7 days."
    );
  });

  it("omits refresh cadence copy when gating is not enforcing plaid windows", () => {
    expect(
      getPlaidRefreshWindowConfig({
        effectiveTierId: "pro",
        gatingEnforced: false,
      })
    ).toBeNull();

    expect(
      buildPlaidRefreshCadenceCopy({
        effectiveTierId: "pro",
        gatingEnforced: false,
      })
    ).toBe("");
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

  it("reopens pro manual sync on the next shared daily reset instead of 24 hours after the last sync", () => {
    const now = new Date("2026-04-19T18:00:00.000Z").getTime();
    const lastSyncAt = new Date("2026-04-19T08:30:00.000Z").getTime();

    expect(
      getPlaidManualSyncRetryAfterMs(lastSyncAt, 24 * 60 * 60 * 1000, now)
    ).toBe(new Date("2026-04-20T00:00:00.000Z").getTime() - now);
  });

  it("reopens free manual sync on the next shared weekly reset", () => {
    const now = new Date("2026-04-22T18:00:00.000Z").getTime();
    const lastSyncAt = new Date("2026-04-21T08:30:00.000Z").getTime();

    expect(
      getPlaidManualSyncRetryAfterMs(lastSyncAt, 7 * 24 * 60 * 60 * 1000, now)
    ).toBe(new Date("2026-04-27T00:00:00.000Z").getTime() - now);
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
      message: "Live balances refreshed for 1 institution. 1 institution is still connected but showing older cached balances.",
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

  it("refreshes transactions with the sync connection scope and disabled AI categorization when requested", async () => {
    const fetchTransactions = vi.fn(async () => ({ ok: true }));

    const result = await refreshTransactionsAfterSync({
      connectionIds: ["conn-1", "conn-2"],
      background: true,
      categorizeWithAi: false,
      fetchTransactions,
    });

    expect(result).toEqual({ ok: true, warning: null });
    expect(fetchTransactions).toHaveBeenCalledWith(30, {
      connectionIds: ["conn-1", "conn-2"],
      categorizeWithAi: false,
    });
  });

  it("surfaces transaction refresh failures as degraded but non-fatal", async () => {
    const fetchTransactions = vi.fn(async () => {
      throw new Error("network unavailable");
    });

    const result = await refreshTransactionsAfterSync({
      connectionIds: ["conn-1"],
      background: false,
      fetchTransactions,
    });

    expect(result).toEqual({
      ok: false,
      warning: "Balances refreshed, but transaction history could not be updated right now. Recent spending may look older until the next refresh.",
    });
  });
});
