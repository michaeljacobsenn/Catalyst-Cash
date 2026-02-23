// ═══════════════════════════════════════════════════════════════
// SUBSCRIPTION & PRO STATE — Catalyst Cash
//
// Manages Pro subscription status, audit quotas, and feature gating.
// Currently uses local storage. When RevenueCat or StoreKit is
// integrated, this module becomes the bridge to the native IAP API.
// ═══════════════════════════════════════════════════════════════

import { db } from "../App.jsx";

// ── Tier Definitions ──────────────────────────────────────────
export const TIERS = {
    free: {
        id: "free",
        name: "Free",
        auditsPerWeek: 4,
        models: ["gemini-2.5-flash"],
        features: ["basic_audit", "health_score", "weekly_moves", "history", "demo"],
        badge: null,
    },
    pro: {
        id: "pro",
        name: "Pro",
        auditsPerWeek: Infinity,
        models: ["gemini-2.5-flash", "gemini-2.5-pro", "o3-mini"],
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
    const monday = new Date(d.setDate(diff));
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
 * Get the current tier config.
 */
export async function getCurrentTier() {
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
 */
export async function isModelAvailable(modelId) {
    const tier = await getCurrentTier();
    return tier.models.includes(modelId);
}

/**
 * Check if the user can run another audit this week.
 * Returns { allowed, remaining, limit }.
 */
export async function checkAuditQuota() {
    const state = await getSubscriptionState();
    const tier = TIERS[state.tier] || TIERS.free;
    const limit = tier.auditsPerWeek;
    const remaining = Math.max(0, limit - state.auditsThisWeek);
    return {
        allowed: remaining > 0 || limit === Infinity,
        remaining: limit === Infinity ? Infinity : remaining,
        limit,
        used: state.auditsThisWeek,
    };
}

/**
 * Increment the weekly audit counter.
 * Call this AFTER a successful audit completes.
 */
export async function recordAuditUsage() {
    const state = await getSubscriptionState();
    state.auditsThisWeek = (state.auditsThisWeek || 0) + 1;
    await db.set(STATE_KEY, state);
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
 */
export async function isPro() {
    const state = await getSubscriptionState();
    return state.tier === "pro";
}
