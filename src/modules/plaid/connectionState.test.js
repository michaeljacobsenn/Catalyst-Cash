import { describe, expect, it } from "vitest";

import { resolvePlaidConnectionAccessState } from "./connectionState.js";

describe("resolvePlaidConnectionAccessState", () => {
  it("keeps the user-selected free connection active when it remains valid", () => {
    const connections = [
      { id: "conn_1", institutionName: "Alpha Bank", lastSync: "2026-04-10T12:00:00.000Z" },
      { id: "conn_2", institutionName: "Beta Bank", lastSync: "2026-04-09T12:00:00.000Z" },
    ];

    const state = resolvePlaidConnectionAccessState(connections, {
      gatingEnforced: true,
      tier: "free",
      limit: 1,
      preferredId: "conn_2",
    });

    expect(state.activeFreeConnectionId).toBe("conn_2");
    expect(state.pausedConnectionIds).toEqual(["conn_1"]);
    expect(state.syncableConnectionIds).toEqual(["conn_2"]);
    expect(state.connectionsChanged).toBe(true);
  });

  it("falls back to the best eligible connection when no preferred connection is stored", () => {
    const connections = [
      { id: "conn_old", institutionName: "Zeta Bank", lastSync: "2026-04-01T12:00:00.000Z" },
      { id: "conn_best", institutionName: "Alpha Bank", lastSync: "2026-04-15T12:00:00.000Z" },
      { id: "conn_reconnect", institutionName: "Beta Bank", lastSync: "2026-04-16T12:00:00.000Z", _needsReconnect: true },
    ];

    const state = resolvePlaidConnectionAccessState(connections, {
      gatingEnforced: true,
      tier: "free",
      limit: 1,
      preferredId: null,
    });

    expect(state.activeFreeConnectionId).toBe("conn_best");
    expect(state.syncableConnectionIds).toEqual(["conn_best"]);
    expect(state.pausedConnectionIds).toEqual(["conn_old", "conn_reconnect"]);
  });

  it("does not pause connections when free-tier gating is not active", () => {
    const connections = [
      { id: "conn_1", institutionName: "Alpha Bank", lastSync: "2026-04-15T12:00:00.000Z" },
      { id: "conn_2", institutionName: "Beta Bank", lastSync: "2026-04-14T12:00:00.000Z" },
    ];

    const state = resolvePlaidConnectionAccessState(connections, {
      gatingEnforced: false,
      tier: "free",
      limit: 1,
      preferredId: "conn_2",
    });

    expect(state.activeFreeConnectionId).toBe(null);
    expect(state.syncableConnectionIds).toEqual(["conn_1", "conn_2"]);
    expect(state.pausedConnectionIds).toEqual([]);
    expect(state.connectionsChanged).toBe(false);
  });
});
