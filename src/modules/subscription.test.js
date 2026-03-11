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
    expect(TIERS.free.models).toEqual(["gpt-4o-mini"]);
  });

  it("pro tier has unlimited access", () => {
    expect(TIERS.pro.auditsPerWeek).toBe(Infinity);
    expect(TIERS.pro.marketRefreshMs).toBe(5 * 60 * 1000); // 5 min
    expect(TIERS.pro.historyLimit).toBe(Infinity);
    expect(TIERS.pro.models).toContain("gpt-4o-mini");
    expect(TIERS.pro.models).toContain("gpt-4o");
    expect(TIERS.pro.models).toContain("o3-mini");
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
    expect(IAP_PRICING.yearly.price).toBe("$89.99");
    expect(IAP_PRICING.yearly.savings).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════
// GATING MODE
// ═══════════════════════════════════════════════════════════════
describe("Gating Mode", () => {
  it('default gating mode is "soft"', () => {
    expect(getGatingMode()).toBe("soft");
  });

  it("isGatingEnforced returns false when soft", () => {
    expect(isGatingEnforced()).toBe(false);
  });

  it("shouldShowGating returns true when soft", () => {
    expect(shouldShowGating()).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// SOFT GATING — Free-tier limits shown (not enforced)
// Users see banners/limits but are not hard-blocked
// ═══════════════════════════════════════════════════════════════
describe("Soft Gating — Free-tier limits with banners", () => {
  it("getCurrentTier returns Free tier for unpaid users", async () => {
    const tier = await getCurrentTier();
    expect(tier.id).toBe("free");
  });

  it("checkAuditQuota returns free-tier limits", async () => {
    const quota = await checkAuditQuota();
    expect(quota.allowed).toBe(true);
    expect(quota.limit).toBe(TIERS.free.auditsPerWeek);
  });

  it("getMarketRefreshTTL returns free-tier 60 min", async () => {
    const ttl = await getMarketRefreshTTL();
    expect(ttl).toBe(60 * 60 * 1000);
  });

  it("getHistoryLimit returns free-tier limit", async () => {
    const limit = await getHistoryLimit();
    expect(limit).toBe(TIERS.free.historyLimit);
  });

  it("hasFeature returns false for pro-only features", async () => {
    expect(await hasFeature("premium_models")).toBe(false);
    expect(await hasFeature("31_audits_per_month")).toBe(false);
  });

  it("hasFeature returns true for free-tier features", async () => {
    expect(await hasFeature("basic_audit")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// MODEL GATING — uses raw tier (unaffected by GATING_MODE)
// Free users should NOT have access to pro models even when
// GATING_MODE is "off"
// ═══════════════════════════════════════════════════════════════
describe("Model Gating (raw tier, not affected by GATING_MODE)", () => {
  it("free user can access gpt-4o-mini", async () => {
    // No subscription state = free tier
    expect(await isModelAvailable("gpt-4o-mini")).toBe(true);
  });

  it("free user cannot access pro models", async () => {
    expect(await isModelAvailable("gpt-4o")).toBe(false);
    expect(await isModelAvailable("o3-mini")).toBe(false);
  });

  it("pro user can access all models", async () => {
    await activatePro("com.catalystcash.pro.monthly", 30);
    expect(await isModelAvailable("gpt-4o-mini")).toBe(true);
    expect(await isModelAvailable("gpt-4o")).toBe(true);
    expect(await isModelAvailable("o3-mini")).toBe(true);
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
