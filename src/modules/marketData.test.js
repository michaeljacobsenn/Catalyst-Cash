import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const marketMocks = vi.hoisted(() => {
  const store = new Map();
  return {
    store,
    db: {
      get: vi.fn(async (key) => (store.has(key) ? store.get(key) : null)),
      set: vi.fn(async (key, value) => {
        store.set(key, value);
      }),
    },
    getBackendUrl: vi.fn(() => "https://api.example.com"),
    getMarketRefreshTTL: vi.fn(async () => 15 * 60 * 1000),
    log: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
  };
});

vi.mock("./utils.js", () => ({
  db: marketMocks.db,
}));

vi.mock("./backendUrl.js", () => ({
  getBackendUrl: marketMocks.getBackendUrl,
}));

vi.mock("./subscription.js", () => ({
  getMarketRefreshTTL: marketMocks.getMarketRefreshTTL,
}));

vi.mock("./logger.js", () => ({
  log: marketMocks.log,
}));

import {
  calcPortfolioValue,
  fetchMarketPrices,
  getManualMarketRefreshStatus,
} from "./marketData.js";

function resetStore() {
  marketMocks.store.clear();
}

describe("marketData", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("serves complete fresh cache without hitting the network", async () => {
    marketMocks.store.set("market-data-ts", Date.now());
    marketMocks.store.set("market-data-cache", {
      VTI: { price: 300.12, name: "Vanguard Total Stock Market ETF" },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchMarketPrices(["VTI"])).resolves.toEqual({
      VTI: { price: 300.12, name: "Vanguard Total Stock Market ETF" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns cached symbols immediately and backfills missing quotes in the background", async () => {
    marketMocks.store.set("market-data-ts", Date.now());
    marketMocks.store.set("market-data-cache", {
      VTI: { price: 290, name: "VTI" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: {
            BTC: { price: 62000, name: "Bitcoin", change: 1200, changePct: 1.97 },
          },
        }),
      }))
    );

    await expect(fetchMarketPrices(["VTI", "BTC"])).resolves.toEqual({
      VTI: { price: 290, name: "VTI" },
    });

    await vi.waitFor(() => {
      expect(marketMocks.store.get("market-data-cache")).toEqual({
        VTI: { price: 290, name: "VTI" },
        BTC: { price: 62000, name: "Bitcoin", change: 1200, changePct: 1.97 },
      });
    });
    await vi.waitFor(() => {
      expect(marketMocks.store.get("market-data-launch-refresh-success-ts")).toEqual(expect.any(Number));
    });
  });

  it("falls back to cached prices when live refresh fails", async () => {
    marketMocks.store.set("market-data-cache", {
      VXUS: { price: 64.55, name: "VXUS" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
      }))
    );

    await expect(fetchMarketPrices(["VXUS"], true)).resolves.toEqual({
      VXUS: { price: 64.55, name: "VXUS" },
    });
    expect(marketMocks.log.warn).toHaveBeenCalledWith(
      "market-data",
      "Live market refresh failed",
      expect.objectContaining({
        symbols: ["VXUS"],
        error: "HTTP 503",
      })
    );
  });

  it("reports manual refresh cooldown windows from stored timestamps", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-16T14:00:00Z"));
    marketMocks.store.set(
      "market-data-manual-refresh-success-ts",
      new Date("2026-04-16T13:30:00Z").getTime()
    );

    await expect(getManualMarketRefreshStatus()).resolves.toEqual({
      allowed: false,
      lastSuccessfulAt: new Date("2026-04-16T13:30:00Z").getTime(),
      nextAllowedAt: new Date("2026-04-16T14:30:00Z").getTime(),
      remainingMs: 30 * 60 * 1000,
    });
  });

  it("calculates portfolio totals from either shares or units", () => {
    expect(
      calcPortfolioValue(
        [
          { symbol: "VTI", shares: "2.5" },
          { symbol: "BTC-USD", units: 0.1 },
        ],
        {
          VTI: { price: 300, name: "VTI" },
          "BTC-USD": { price: 80000, name: "Bitcoin" },
        }
      )
    ).toEqual({
      total: 8750,
      breakdown: [
        {
          symbol: "VTI",
          shares: 2.5,
          price: 300,
          value: 750,
          name: "VTI",
          change: null,
          changePct: null,
        },
        {
          symbol: "BTC-USD",
          shares: 0.1,
          price: 80000,
          value: 8000,
          name: "Bitcoin",
          change: null,
          changePct: null,
        },
      ],
    });
  });
});
