// ═══════════════════════════════════════════════════════════════
// SUBSCRIPTION & PRO STATE — Catalyst Cash
//
// Manages Pro subscription status, audit quotas, and feature gating.
// Currently uses local storage. When RevenueCat or StoreKit is
// integrated, this module becomes the bridge to the native IAP API.
// ═══════════════════════════════════════════════════════════════

import { db } from "./utils.js";

// ── Gating Mode ───────────────────────────────────────────────
// Controls whether subscription limits are enforced.
//   "off"  → Everyone gets Pro-level access (development / beta)
//   "soft" → Show limits in UI (banners, counters) but don't block
//   "live" → Full enforcement (activate for App Store release)
// ──────────────────────────────────────────────────────────────
const GATING_MODE = "off";

/**
 * Get the current gating mode.
 * Consumers can check this to decide whether to show/enforce limits.
 */
export function getGatingMode() {
    return GATING_MODE;
}

/**
 * Returns true if gating is actively enforcing limits.
 * "off" = no enforcement, "soft" = show but don't block, "live" = enforce.
 */
export function isGatingEnforced() {
    return GATING_MODE === "live";
}

/**
 * Returns true if gating UI should be shown (soft or live mode).
 */
export function shouldShowGating() {
    return GATING_MODE === "soft" || GATING_MODE === "live";
}

// ── Tier Definitions ──────────────────────────────────────────
export const TIERS = {
    free: {
        id: "free",
        name: "Free",
        auditsPerWeek: 3,
        marketRefreshMs: 60 * 60 * 1000,    // 60 minutes
        historyLimit: 4,                     // Last 4 audits visible
        models: ["gemini-2.5-flash"],
        features: ["basic_audit", "health_score", "weekly_moves", "history", "demo"],
        badge: null,
    },
    pro: {
        id: "pro",
        name: "Pro",
        auditsPerWeek: Infinity,
        marketRefreshMs: 15 * 60 * 1000,    // 15 minutes
        historyLimit: Infinity,              // Unlimited history
        models: ["gemini-2.5-flash", "gemini-2.5-pro", "o3-mini", "claude-sonnet-4-20250514"],
        features: [
            "basic_audit", "health_score", "weekly_moves", "history", "demo",
            "premium_models", "unlimited_audits", "share_card", "monte_carlo",
            "cash_flow_calendar", "advanced_notifications", "export_csv",
            "priority_support",
        ],
        badge: "⚡ Pro",
    },
};

// ── IAP Product IDs (Apple App Store) ─────────────────────────
export const IAP_PRODUCTS = {
    monthly: "com.catalystcash.pro.monthly",   // $4.99/mo
    yearly: "com.catalystcash.pro.yearly",     // $39.99/yr ($3.33/mo)
};

// ── IAP Display Pricing (for UI — no StoreKit dependency) ─────
export const IAP_PRICING = {
    monthly: { price: "$4.99", period: "month", note: "Billed monthly" },
    yearly: { price: "$39.99", period: "year", perMonth: "$3.33", savings: "Save 33%" },
};

// ── State Management ──────────────────────────────────────────
const STATE_KEY = "subscription-state";

const DEFAULT_STATE = {
    tier: "free",
    expiresAt: null,        // ISO string, null = never (for free)
    productId: null,        // Last purchased product ID
    purchaseDate: null,     // ISO string
    auditsThisWeek: 0,      // Reset every Monday
    weekStartDate: null,    // ISO string of current week's Monday
};

/**
 * Get the current week's Monday (ISO date string).
 */
function getCurrentWeekMonday() {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    return monday.toISOString().split("T")[0];
}

/**
 * Load subscription state from local storage.
 */
export async function getSubscriptionState() {
    try {
        const raw = await db.get(STATE_KEY);
        const state = raw ? { ...DEFAULT_STATE, ...raw } : { ...DEFAULT_STATE };

        // Auto-reset weekly audit counter if a new week started
        const currentMonday = getCurrentWeekMonday();
        if (state.weekStartDate !== currentMonday) {
            state.auditsThisWeek = 0;
            state.weekStartDate = currentMonday;
            await db.set(STATE_KEY, state);
        }

        // Check if Pro expired
        if (state.tier === "pro" && state.expiresAt) {
            if (new Date(state.expiresAt) < new Date()) {
                state.tier = "free";
                await db.set(STATE_KEY, state);
            }
        }

        return state;
    } catch {
        return { ...DEFAULT_STATE };
    }
}

/**
 * Get the effective tier config.
 * When GATING_MODE is "off", always returns Pro tier.
 */
export async function getCurrentTier() {
    if (GATING_MODE === "off") return TIERS.pro;
    const state = await getSubscriptionState();
    return TIERS[state.tier] || TIERS.free;
}

/**
 * Get the raw tier (ignoring gating mode) for display purposes.
 * Use this when you need to show the user's actual subscription status.
 */
export async function getRawTier() {
    const state = await getSubscriptionState();
    return TIERS[state.tier] || TIERS.free;
}

/**
 * Check if a specific feature is available on the current tier.
 */
export async function hasFeature(featureId) {
    const tier = await getCurrentTier();
    return tier.features.includes(featureId);
}

/**
 * Check if a model is available on the current tier.
 * NOTE: Model gating always uses the RAW tier (respects actual sub status),
 * NOT the effective tier. This keeps pro models locked even when GATING_MODE is "off".
 */
export async function isModelAvailable(modelId) {
    const tier = await getRawTier();
    return tier.models.includes(modelId);
}

/**
 * Check if the user can run another audit this week.
 * Returns { allowed, remaining, limit, used }.
 * When GATING_MODE is "off", always returns unlimited.
 */
export async function checkAuditQuota() {
    if (GATING_MODE === "off") {
        return { allowed: true, remaining: Infinity, limit: Infinity, used: 0 };
    }

    const state = await getSubscriptionState();
    const tier = TIERS[state.tier] || TIERS.free;
    const limit = tier.auditsPerWeek;
    const remaining = Math.max(0, limit - state.auditsThisWeek);

    const result = {
        allowed: remaining > 0 || limit === Infinity,
        remaining: limit === Infinity ? Infinity : remaining,
        limit,
        used: state.auditsThisWeek,
    };

    // In "soft" mode, show limits but don't block
    if (GATING_MODE === "soft") {
        result.allowed = true;
        result.softBlocked = remaining <= 0 && limit !== Infinity;
    }

    return result;
}

/**
 * Increment the weekly audit counter.
 * Call this AFTER a successful audit completes.
 * Always records usage regardless of gating mode (for analytics).
 */
export async function recordAuditUsage() {
    const state = await getSubscriptionState();
    state.auditsThisWeek = (state.auditsThisWeek || 0) + 1;
    await db.set(STATE_KEY, state);
}

/**
 * Get the market data cache TTL based on current tier.
 * Returns milliseconds.
 * When GATING_MODE is "off", returns Pro-level refresh rate.
 */
export async function getMarketRefreshTTL() {
    const tier = await getCurrentTier();
    return tier.marketRefreshMs;
}

/**
 * Get the history display limit based on current tier.
 * Returns number of audits to show (Infinity = all).
 * When GATING_MODE is "off", returns Infinity.
 */
export async function getHistoryLimit() {
    const tier = await getCurrentTier();
    return tier.historyLimit;
}

/**
 * Activate Pro subscription (called after successful IAP).
 */
export async function activatePro(productId, durationDays = 30) {
    const state = await getSubscriptionState();
    state.tier = "pro";
    state.productId = productId;
    state.purchaseDate = new Date().toISOString();
    const expires = new Date();
    expires.setDate(expires.getDate() + durationDays);
    state.expiresAt = expires.toISOString();
    await db.set(STATE_KEY, state);
    return state;
}

/**
 * Deactivate Pro (manual or after failed renewal).
 */
export async function deactivatePro() {
    const state = await getSubscriptionState();
    state.tier = "free";
    state.expiresAt = null;
    state.productId = null;
    await db.set(STATE_KEY, state);
}

/**
 * Check if the user is currently Pro.
 * NOTE: This checks the RAW subscription status, not the gating mode.
 * Use this for IAP status checks and model gating.
 */
export async function isPro() {
    const state = await getSubscriptionState();
    return state.tier === "pro";
}
