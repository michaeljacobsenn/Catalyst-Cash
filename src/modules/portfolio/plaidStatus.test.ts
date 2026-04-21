import { describe, expect, it } from "vitest";
import {
  formatPlaidSyncDateTimeLabel,
  getLatestPlaidSyncDate,
  getStalePlaidInstitutions,
  groupPlaidSyncIssues,
  splitPlaidInstitutionsByReconnect,
  summarizeConnectedButCached,
  summarizeReconnectRequired,
} from "./plaidStatus.js";

describe("portfolio plaid status helpers", () => {
  it("finds the most recent plaid sync across linked items", () => {
    const latest = getLatestPlaidSyncDate([
      { _plaidLastSync: "2026-04-14T10:00:00.000Z" },
      { _plaidLastSync: "2026-04-15T14:30:00.000Z" },
    ]);

    expect(latest?.toISOString()).toBe("2026-04-15T14:30:00.000Z");
  });

  it("formats a sync label for display", () => {
    expect(formatPlaidSyncDateTimeLabel(new Date("2026-04-15T14:30:00.000Z"))).toMatch(/Apr|04/);
  });

  it("groups stale institutions by connection and keeps the newest sync per connection", () => {
    const stale = getStalePlaidInstitutions(
      [
        {
          _plaidConnectionId: "item_1",
          _plaidLastSync: "2026-04-15T10:00:00.000Z",
          institution: "Chase",
        },
        {
          _plaidConnectionId: "item_1",
          _plaidLastSync: "2026-04-15T10:05:00.000Z",
          institution: "Chase",
        },
        {
          _plaidConnectionId: "item_2",
          _plaidLastSync: "2026-04-15T12:00:00.000Z",
          institution: "Ally",
        },
      ],
      60 * 60 * 1000
    );

    expect(stale).toEqual([
      {
        connectionId: "item_1",
        name: "Chase",
        lastSyncAt: new Date("2026-04-15T10:05:00.000Z").getTime(),
      },
    ]);
  });

  it("splits stale institutions by reconnect status", () => {
    const breakdown = splitPlaidInstitutionsByReconnect(
      [
        { connectionId: "item_1", name: "Chase", lastSyncAt: 1 },
        { connectionId: "item_2", name: "Ally", lastSyncAt: 2 },
      ],
      new Map([
        ["item_1", true],
        ["item_2", false],
      ])
    );

    expect(breakdown.reconnectRequired).toEqual([{ connectionId: "item_1", name: "Chase", lastSyncAt: 1 }]);
    expect(breakdown.connectedButCached).toEqual([{ connectionId: "item_2", name: "Ally", lastSyncAt: 2 }]);
  });

  it("summarizes connected cached institutions with short dates", () => {
    expect(
      summarizeConnectedButCached([
        { connectionId: "item_1", name: "Chase", lastSyncAt: new Date("2026-04-15T10:05:00.000Z").getTime() },
        { connectionId: "item_2", name: "Ally", lastSyncAt: new Date("2026-04-15T12:00:00.000Z").getTime() },
        { connectionId: "item_3", name: "Barclays", lastSyncAt: new Date("2026-04-15T13:00:00.000Z").getTime() },
      ])
    ).toMatch(/Chase .*Ally .*and others/);
  });

  it("summarizes reconnect-required institutions by name only", () => {
    expect(
      summarizeReconnectRequired([
        { connectionId: "item_1", name: "Chase", lastSyncAt: 1 },
        { connectionId: "item_2", name: "Ally", lastSyncAt: 2 },
        { connectionId: "item_3", name: "Barclays", lastSyncAt: 3 },
      ])
    ).toBe("Chase, Ally, and others");
  });

  it("groups cached sync issues even when the snapshot timestamps differ", () => {
    expect(
      groupPlaidSyncIssues([
        {
          institutionName: "Chase",
          message: "Cached balances from Apr 20 at 1:28 PM. Waiting for the next live sync.",
        },
        {
          institutionName: "Ally Bank",
          message: "Cached balances from Apr 20 at 6:29 PM. Waiting for the next live sync.",
        },
        {
          institutionName: "Barclays",
          message: "Cached balances from Apr 19 at 11:57 PM. Waiting for the next live sync.",
        },
      ])
    ).toEqual([
      {
        institutionName: "Chase, Ally Bank +1",
        institutionNames: ["Chase", "Ally Bank", "Barclays"],
        message: "Cached balances are waiting for the next live sync.",
        issueCount: 3,
        cachedSnapshots: [
          "Chase (Apr 20 at 1:28 PM)",
          "Ally Bank (Apr 20 at 6:29 PM)",
          "Barclays (Apr 19 at 11:57 PM)",
        ],
      },
    ]);
  });
});
