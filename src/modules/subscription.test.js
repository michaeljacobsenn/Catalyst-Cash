import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the db module ────────────────────────────────────────
// subscription.js imports { db } from "./utils.js"
// We mock it to use an in-memory store so tests run without Capacitor.
const mockStore = {};
vi.mock("./utils.js", () => ({
  db: {
    get: vi.fn(key => Promise.resolve(mockStore[key] ?? null)),
    set: vi.fn((key, val) => {
      mockStore[key] = val;
      return Promise.resolve();
    }),
  },
}));

// ── Import AFTER mocks are registered ─────────────────────────
import {
  TIERS,
  IAP_PRODUCTS,
  IAP_PRICING,
  getGatingMode,
  isGatingEnforced,
  shouldShowGating,
  getSubscriptionState,
  getCurrentTier,
  getRawTier,
  hasFeature,
  isModelAvailable,
  checkAuditQuota,
  recordAuditUsage,
  getMarketRefreshTTL,
  getHistoryLimit,
  activatePro,
  deactivatePro,
  isPro,
  getUsageWindowKeys,
} from "./subscription.js";

// ── Helper: clear mock store between tests ────────────────────
beforeEach(() => {
  Object.keys(mockStore).forEach(k => delete mockStore[k]);
});

// ═══════════════════════════════════════════════════════════════
// TIER DEFINITIONS
// ═══════════════════════════════════════════════════════════════
describe("Tier Definitions", () => {
  it("free tier has correct limits", () => {
    expect(TIERS.free.auditsPerWeek).toBe(2);
    expect(TIERS.free.marketRefreshMs).toBe(60 * 60 * 1000); // 60 min
    expect(TIERS.free.historyLimit).toBe(12);
    expect(TIERS.free.models).toEqual(["gemini-2.5-flash"]);
  });

  it("pro tier has unlimited access", () => {
    expect(TIERS.pro.auditsPerWeek).toBe(Infinity);
    expect(TIERS.pro.marketRefreshMs).toBe(5 * 60 * 1000); // 5 min
    expect(TIERS.pro.historyLimit).toBe(Infinity);
    expect(TIERS.pro.models).toContain("gemini-2.5-flash");
    expect(TIERS.pro.models).toContain("gpt-4.1");
    expect(TIERS.pro.models).toContain("o3");
    expect(TIERS.pro.models).toContain("claude-sonnet-4-6");
    expect(TIERS.pro.models).toContain("claude-opus-4-6");
    expect(TIERS.pro.models).toContain("claude-haiku-4-5");
    expect(TIERS.pro.models).toContain("gemini-2.5-pro");
  });
});

// ═══════════════════════════════════════════════════════════════
// IAP CONSTANTS
// ═══════════════════════════════════════════════════════════════
describe("IAP Constants", () => {
  it("has product IDs for monthly and yearly", () => {
    expect(IAP_PRODUCTS.monthly).toMatch(/^com\.catalystcash\.pro\./);
    expect(IAP_PRODUCTS.yearly).toMatch(/^com\.catalystcash\.pro\./);
  });

  it("has display pricing", () => {
    expect(IAP_PRICING.monthly.price).toBe("$9.99");
    expect(IAP_PRICING.yearly.price).toBe("$69.99");
    expect(IAP_PRICING.yearly.perMonth).toBe("$5.83");
    expect(IAP_PRICING.yearly.savings).toBe("4 months free");
  });
});

// ═══════════════════════════════════════════════════════════════
// GATING MODE
// ═══════════════════════════════════════════════════════════════
describe("Gating Mode", () => {
  it('default gating mode is "off"', () => {
    expect(getGatingMode()).toBe("off");
  });

  it("isGatingEnforced returns false when off", () => {
    expect(isGatingEnforced()).toBe(false);
  });

  it("shouldShowGating returns false when off", () => {
    expect(shouldShowGating()).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// OFF GATING — soft launch unlocks Pro behavior without blocking
// ═══════════════════════════════════════════════════════════════
describe('Off Gating — launch mode behaves like unlocked Pro access', () => {
  it("getCurrentTier returns Pro tier for unpaid users", async () => {
    const tier = await getCurrentTier();
    expect(tier.id).toBe("pro");
  });

  it("checkAuditQuota returns unlimited access", async () => {
    const quota = await checkAuditQuota();
    expect(quota.allowed).toBe(true);
    expect(quota.limit).toBe(Infinity);
  });

  it("getMarketRefreshTTL returns Pro cadence", async () => {
    const ttl = await getMarketRefreshTTL();
    expect(ttl).toBe(5 * 60 * 1000);
  });

  it("getHistoryLimit returns unlimited history", async () => {
    const limit = await getHistoryLimit();
    expect(limit).toBe(Infinity);
  });

  it("hasFeature returns true for Pro-only features", async () => {
    expect(await hasFeature("premium_models")).toBe(true);
    expect(await hasFeature("monthly_audit_cap")).toBe(true);
  });

  it("hasFeature returns true for free-tier features", async () => {
    expect(await hasFeature("basic_audit")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// MODEL GATING — off mode unlocks the full launch lineup
// ═══════════════════════════════════════════════════════════════
describe('Model Gating (launch mode "off")', () => {
  it("unpaid users can access the full model lineup during soft launch", async () => {
    expect(await isModelAvailable("gemini-2.5-flash")).toBe(true);
    expect(await isModelAvailable("gpt-4.1")).toBe(true);
    expect(await isModelAvailable("o3")).toBe(true);
    expect(await isModelAvailable("claude-sonnet-4-6")).toBe(true);
    expect(await isModelAvailable("claude-opus-4-6")).toBe(true);
  });

  it("pro user can access all models", async () => {
    await activatePro("com.catalystcash.pro.monthly", 30);
    expect(await isModelAvailable("gemini-2.5-flash")).toBe(true);
    expect(await isModelAvailable("gpt-4.1")).toBe(true);
    expect(await isModelAvailable("o3")).toBe(true);
    expect(await isModelAvailable("claude-sonnet-4-6")).toBe(true);
    expect(await isModelAvailable("claude-opus-4-6")).toBe(true);
    expect(await isModelAvailable("claude-haiku-4-5")).toBe(true);
    expect(await isModelAvailable("gemini-2.5-pro")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// SUBSCRIPTION STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════
describe("Subscription State", () => {
  it("defaults to free tier with no state", async () => {
    const state = await getSubscriptionState();
    expect(state.tier).toBe("free");
    expect(state.auditsThisWeek).toBe(0);
  });

  it("activatePro sets tier and expiration", async () => {
    const state = await activatePro("com.catalystcash.pro.monthly", 30);
    expect(state.tier).toBe("pro");
    expect(state.productId).toBe("com.catalystcash.pro.monthly");
    expect(state.expiresAt).toBeTruthy();
    expect(await isPro()).toBe(true);
  });

  it("deactivatePro resets to free", async () => {
    await activatePro("com.catalystcash.pro.monthly", 30);
    await deactivatePro();
    // isPro() returns true in soft gating mode regardless of tier,
    // so verify state directly
    const state = await getSubscriptionState();
    expect(state.tier).toBe("free");
    expect(state.expiresAt).toBeNull();
    expect(state.productId).toBeNull();
  });

  it("recordAuditUsage increments counter", async () => {
    await recordAuditUsage();
    await recordAuditUsage();
    const state = await getSubscriptionState();
    expect(state.auditsThisWeek).toBe(2);
  });

  it("expired pro reverts to free", async () => {
    // Set expiration in the past
    mockStore["subscription-state"] = {
      tier: "pro",
      expiresAt: new Date(Date.now() - 86400000).toISOString(), // yesterday
      auditsThisWeek: 0,
      weekStartDate: null,
    };
    const state = await getSubscriptionState();
    expect(state.tier).toBe("free");
  });

  it("uses UTC day, week, and month windows to match the backend", () => {
    const keys = getUsageWindowKeys(new Date("2026-03-01T23:30:00-05:00"));
    expect(keys.dayKey).toBe("2026-03-02");
    expect(keys.weekStartDate).toBe("2026-03-02");
    expect(keys.monthKey).toBe("2026-03");
  });

  describe("Billing Cycle Anchoring", () => {
    it("anchors to standard mid-month date", () => {
      // Anchor 15th, currently Mar 10 -> cycle started Feb 15
      const key1 = getUsageWindowKeys(new Date("2026-03-10T12:00:00Z"), 15).billingCycleKey;
      expect(key1).toBe("2026-02-15");

      // Anchor 15th, currently Mar 16 -> cycle started Mar 15
      const key2 = getUsageWindowKeys(new Date("2026-03-16T12:00:00Z"), 15).billingCycleKey;
      expect(key2).toBe("2026-03-15");
    });

    it("clamps anchor to month length (e.g. 31st in short month)", () => {
      // Anchor 31, currently Feb 10 (2026 not leap year) -> cycle started Jan 31
      const key1 = getUsageWindowKeys(new Date("2026-02-10T12:00:00Z"), 31).billingCycleKey;
      expect(key1).toBe("2026-01-31");

      // Anchor 31, currently Mar 5 -> cycle started Feb 28
      const key2 = getUsageWindowKeys(new Date("2026-03-05T12:00:00Z"), 31).billingCycleKey;
      expect(key2).toBe("2026-02-28");

      // Anchor 30, currently Mar 5 -> cycle started Feb 28
      const key3 = getUsageWindowKeys(new Date("2026-03-05T12:00:00Z"), 30).billingCycleKey;
      expect(key3).toBe("2026-02-28");
    });

    it("handles leap years correctly", () => {
      // Anchor 31, currently Mar 5 (2024 leap year) -> cycle started Feb 29
      const key1 = getUsageWindowKeys(new Date("2024-03-05T12:00:00Z"), 31).billingCycleKey;
      expect(key1).toBe("2024-02-29");
    });

    it("handles crossing year boundaries", () => {
      // Anchor 15, currently Jan 5 -> cycle started Dec 15 of prior year
      const key1 = getUsageWindowKeys(new Date("2026-01-05T12:00:00Z"), 15).billingCycleKey;
      expect(key1).toBe("2025-12-15");
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// RAW TIER (for display purposes)
// ═══════════════════════════════════════════════════════════════
describe("getRawTier", () => {
  it("returns free tier when no subscription", async () => {
    const tier = await getRawTier();
    expect(tier.id).toBe("free");
  });

  it("returns pro tier when subscribed", async () => {
    await activatePro("com.catalystcash.pro.yearly", 365);
    const tier = await getRawTier();
    expect(tier.id).toBe("pro");
  });
});
