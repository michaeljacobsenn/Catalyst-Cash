import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the db module ────────────────────────────────────────
// subscription.js imports { db } from "./utils.js"
// We mock it to use an in-memory store so tests run without Capacitor.
const mockStore = {};
vi.mock('./utils.js', () => ({
    db: {
        get: vi.fn((key) => Promise.resolve(mockStore[key] ?? null)),
        set: vi.fn((key, val) => { mockStore[key] = val; return Promise.resolve(); }),
    }
}));

// ── Import AFTER mocks are registered ─────────────────────────
import {
    TIERS, IAP_PRODUCTS, IAP_PRICING,
    getGatingMode, isGatingEnforced, shouldShowGating,
    getSubscriptionState, getCurrentTier, getRawTier,
    hasFeature, isModelAvailable,
    checkAuditQuota, recordAuditUsage,
    getMarketRefreshTTL, getHistoryLimit,
    activatePro, deactivatePro, isPro,
} from './subscription.js';

// ── Helper: clear mock store between tests ────────────────────
beforeEach(() => {
    Object.keys(mockStore).forEach(k => delete mockStore[k]);
});

// ═══════════════════════════════════════════════════════════════
// TIER DEFINITIONS
// ═══════════════════════════════════════════════════════════════
describe('Tier Definitions', () => {
    it('free tier has correct limits', () => {
        expect(TIERS.free.auditsPerWeek).toBe(2);
        expect(TIERS.free.marketRefreshMs).toBe(60 * 60 * 1000); // 60 min
        expect(TIERS.free.historyLimit).toBe(8);
        expect(TIERS.free.models).toEqual(['gemini-2.5-flash', 'gpt-4o-mini']);
    });

    it('pro tier has unlimited access', () => {
        expect(TIERS.pro.auditsPerWeek).toBe(Infinity);
        expect(TIERS.pro.marketRefreshMs).toBe(15 * 60 * 1000); // 15 min
        expect(TIERS.pro.historyLimit).toBe(Infinity);
        expect(TIERS.pro.models).toContain('gemini-2.5-flash');
        expect(TIERS.pro.models).toContain('gemini-2.5-pro');
        expect(TIERS.pro.models).toContain('o3-mini');
        expect(TIERS.pro.models).toContain('o3-mini');
        // claude-sonnet-4-6 is Coming Soon — not in active models list
    });
});

// ═══════════════════════════════════════════════════════════════
// IAP CONSTANTS
// ═══════════════════════════════════════════════════════════════
describe('IAP Constants', () => {
    it('has product IDs for monthly and yearly', () => {
        expect(IAP_PRODUCTS.monthly).toMatch(/^com\.catalystcash\.pro\./);
        expect(IAP_PRODUCTS.yearly).toMatch(/^com\.catalystcash\.pro\./);
    });

    it('has display pricing', () => {
        expect(IAP_PRICING.monthly.price).toBe('$6.99');
        expect(IAP_PRICING.yearly.price).toBe('$49.99');
        expect(IAP_PRICING.yearly.savings).toBeTruthy();
    });
});

// ═══════════════════════════════════════════════════════════════
// GATING MODE (currently "soft" for beta)
// ═══════════════════════════════════════════════════════════════
describe('Gating Mode', () => {
    it('default gating mode is "soft"', () => {
        expect(getGatingMode()).toBe('soft');
    });

    it('isGatingEnforced returns false when soft', () => {
        expect(isGatingEnforced()).toBe(false);
    });

    it('shouldShowGating returns true when soft', () => {
        expect(shouldShowGating()).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════
// SOFT GATING — Free-tier limits shown (not enforced)
// Users see banners/limits but are not hard-blocked
// ═══════════════════════════════════════════════════════════════
describe('Soft Gating — Free-tier limits with banners', () => {
    it('getCurrentTier returns Free tier for unpaid users', async () => {
        const tier = await getCurrentTier();
        expect(tier.id).toBe('free');
    });

    it('checkAuditQuota returns free-tier limits', async () => {
        const quota = await checkAuditQuota();
        expect(quota.allowed).toBe(true);
        expect(quota.limit).toBe(TIERS.free.auditsPerWeek);
    });

    it('getMarketRefreshTTL returns free-tier 60 min', async () => {
        const ttl = await getMarketRefreshTTL();
        expect(ttl).toBe(60 * 60 * 1000);
    });

    it('getHistoryLimit returns free-tier limit', async () => {
        const limit = await getHistoryLimit();
        expect(limit).toBe(TIERS.free.historyLimit);
    });

    it('hasFeature returns false for pro-only features', async () => {
        expect(await hasFeature('premium_models')).toBe(false);
        expect(await hasFeature('unlimited_audits')).toBe(false);
    });

    it('hasFeature returns true for free-tier features', async () => {
        expect(await hasFeature('basic_audit')).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════
// MODEL GATING — uses raw tier (unaffected by GATING_MODE)
// Free users should NOT have access to pro models even when
// GATING_MODE is "off"
// ═══════════════════════════════════════════════════════════════
describe('Model Gating (raw tier, not affected by GATING_MODE)', () => {
    it('free user can access gemini-2.5-flash', async () => {
        // No subscription state = free tier
        expect(await isModelAvailable('gemini-2.5-flash')).toBe(true);
    });

    it('free user cannot access pro models', async () => {
        expect(await isModelAvailable('gemini-2.5-pro')).toBe(false);
        expect(await isModelAvailable('o3-mini')).toBe(false);
        expect(await isModelAvailable('o3-mini')).toBe(false);
        // claude-sonnet-4-6 is Coming Soon — removed from tier models
    });

    it('pro user can access all models', async () => {
        await activatePro('com.catalystcash.pro.monthly', 30);
        expect(await isModelAvailable('gemini-2.5-flash')).toBe(true);
        expect(await isModelAvailable('gemini-2.5-pro')).toBe(true);
        expect(await isModelAvailable('o3-mini')).toBe(true);
        expect(await isModelAvailable('o3-mini')).toBe(true);
        // claude-sonnet-4-6 is Coming Soon — not yet available
    });
});

// ═══════════════════════════════════════════════════════════════
// SUBSCRIPTION STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════
describe('Subscription State', () => {
    it('defaults to free tier with no state', async () => {
        const state = await getSubscriptionState();
        expect(state.tier).toBe('free');
        expect(state.auditsThisWeek).toBe(0);
    });

    it('activatePro sets tier and expiration', async () => {
        const state = await activatePro('com.catalystcash.pro.monthly', 30);
        expect(state.tier).toBe('pro');
        expect(state.productId).toBe('com.catalystcash.pro.monthly');
        expect(state.expiresAt).toBeTruthy();
        expect(await isPro()).toBe(true);
    });

    it('deactivatePro resets to free', async () => {
        await activatePro('com.catalystcash.pro.monthly', 30);
        await deactivatePro();
        expect(await isPro()).toBe(false);
        const state = await getSubscriptionState();
        expect(state.tier).toBe('free');
    });

    it('recordAuditUsage increments counter', async () => {
        await recordAuditUsage();
        await recordAuditUsage();
        const state = await getSubscriptionState();
        expect(state.auditsThisWeek).toBe(2);
    });

    it('expired pro reverts to free', async () => {
        // Set expiration in the past
        mockStore['subscription-state'] = {
            tier: 'pro',
            expiresAt: new Date(Date.now() - 86400000).toISOString(), // yesterday
            auditsThisWeek: 0,
            weekStartDate: null,
        };
        const state = await getSubscriptionState();
        expect(state.tier).toBe('free');
    });
});

// ═══════════════════════════════════════════════════════════════
// RAW TIER (for display purposes)
// ═══════════════════════════════════════════════════════════════
describe('getRawTier', () => {
    it('returns free tier when no subscription', async () => {
        const tier = await getRawTier();
        expect(tier.id).toBe('free');
    });

    it('returns pro tier when subscribed', async () => {
        await activatePro('com.catalystcash.pro.yearly', 365);
        const tier = await getRawTier();
        expect(tier.id).toBe('pro');
    });
});
