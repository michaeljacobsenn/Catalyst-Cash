// ═══════════════════════════════════════════════════════════════
// SUBSCRIPTION & PRO STATE — Catalyst Cash
//
// Manages Pro subscription status, audit quotas, and feature gating.
// Currently uses local storage. When RevenueCat or StoreKit is
// integrated, this module becomes the bridge to the native IAP API.
//
// ─── AI MODEL COST MATRIX (per audit, ~3K tokens in / ~2K out) ──
//   gemini-2.5-flash  $0.30/$2.50/M  ≈ $0.006/audit  → Free default
//   gpt-4o-mini       $0.15/$0.60/M  ≈ $0.002/audit  → Free
//   gemini-2.5-pro    $1.25/$10.0/M  ≈ $0.024/audit  → Pro
//   o4-mini           $1.10/$4.40/M  ≈ $0.012/audit  → Pro
//   claude-haiku-4-5  Coming soon (not in active Pro model list yet)
//
//   Free: 2 audits/wk on Flash  → ~$0.05/user/month
//   Pro worst case: 60 audits/mo on Gemini Pro → $1.44/user/month
//   Pro @ $6.99/mo (after Apple 15%): $5.94 net → $4.50+ profit/user
// ═══════════════════════════════════════════════════════════════

import { db } from "./utils.js";
import { Capacitor } from "@capacitor/core";
import { SecureStoragePlugin } from "capacitor-secure-storage-plugin";
import { APP_VERSION } from "./constants.js";
import { AI_PROVIDERS, isModelSelectable } from "./providers.js";

// ── Gating Mode ─────────────────────────────────────────────
// Controls whether subscription limits are enforced.
//   "off"  → Everyone gets Pro-level access (development / beta)
//   "soft" → Show limits in UI (banners, counters) but don't block
//   "live" → Full enforcement (activate for App Store release)
//
// SECURITY: This hardcoded default can be overridden by the remote
// config from fetchGatingConfig(). When we go live, the backend
// returns gatingMode:"live" and ALL app versions enforce it —
// even old builds that have "soft" hardcoded here.
// ────────────────────────────────────────────────────────────
const GATING_MODE_DEFAULT = "soft";
let _effectiveGatingMode = GATING_MODE_DEFAULT;

/**
 * Get the current gating mode (may be overridden by remote config).
 * Consumers can check this to decide whether to show/enforce limits.
 */
export function getGatingMode() {
    return _effectiveGatingMode;
}

/**
 * Returns true if gating is actively enforcing limits.
 * "off" = no enforcement, "soft" = show but don't block, "live" = enforce.
 */
export function isGatingEnforced() {
    return _effectiveGatingMode === "live";
}

/**
 * Returns true if gating UI should be shown (soft or live mode).
 */
export function shouldShowGating() {
    return _effectiveGatingMode === "soft" || _effectiveGatingMode === "live";
}

/**
 * Compare semver strings. Returns -1, 0, or 1.
 */
function compareVersions(a, b) {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
        const diff = (pa[i] || 0) - (pb[i] || 0);
        if (diff !== 0) return diff > 0 ? 1 : -1;
    }
    return 0;
}

/**
 * Sync gating mode from remote config.
 * Call on app boot. If the backend says "live" or a newer minVersion,
 * the client respects it — even if the hardcoded default is "soft".
 * This is the anti-downgrade mechanism: old app versions with "soft"
 * hardcoded will still get overridden to "live" when we flip the switch.
 */
export async function syncRemoteGatingMode() {
    try {
        const { fetchGatingConfig } = await import("./api.js");
        const config = await fetchGatingConfig();
        if (!config) return;

        // Remote gating mode always wins if it's more restrictive
        const modes = ["off", "soft", "live"];
        const localIdx = modes.indexOf(_effectiveGatingMode);
        const remoteIdx = modes.indexOf(config.gatingMode);
        if (remoteIdx > localIdx) {
            _effectiveGatingMode = config.gatingMode;
        }

        // Check minimum version — if below, force live mode
        if (config.minVersion && compareVersions(APP_VERSION, config.minVersion) < 0) {
            _effectiveGatingMode = "live";
            console.warn(`[Gating] App version ${APP_VERSION} below minimum ${config.minVersion} — forcing live mode`);
        }
    } catch (e) {
        // Fail silently — keep hardcoded default
        console.warn("[Gating] Remote config sync failed:", e?.message);
    }
}

// ── Tier Definitions ──────────────────────────────────────────
//
// PHILOSOPHY: Free = complete app, Pro = luxury upgrade.
// Free users must love the app enough to leave 5-star reviews.
// Pro users get deeper analysis, longer history, and power tools.
//
// The free tier IS our marketing budget — every happy free user
// is a potential 5-star review and word-of-mouth referral.
//
// ABUSE PREVENTION:
//   - Device fingerprint (UUID stored in Keychain) persists across
//     app reinstalls to prevent free-tier resets.
//   - Pro has a generous monthly cap (150) to prevent API cost abuse.
//   - Backend rate-limiting via X-Device-ID header provides server-side
//     protection even if client storage is tampered with.
//
// ── AI TOOL LIMIT PHILOSOPHY ────────────────────────────────────
//   Audits: Heavy (~3K tokens in, ~2K out, structured JSON). Weekly cap.
//   AskAI:  Light (~300 tokens in, ~500 out, natural language). Daily cap.
//
//   Free AskAI must be generous enough to hook users — the "aha"
//   moment happens in chat, not audits. 15/day = 1 message every
//   ~hour during waking hours. Pro upgrades feel like removing a
//   ceiling, not getting unlocked from a cage.
// ──────────────────────────────────────────────────────────────
export const PRO_MONTHLY_AUDIT_CAP = 60;  // ~2/day, $1.20/mo max API cost at $0.02/audit
export const PRO_DAILY_CHAT_CAP = 50;     // ~2/hr, prevents abuse while feeling generous

export const TIERS = {
    free: {
        id: "free",
        name: "Free",
        auditsPerWeek: 2,                    // Covers weekly audit + 1 re-run
        chatMessagesPerDay: 10,              // ~1/hr waking hours, hooks users
        marketRefreshMs: 60 * 60 * 1000,     // 60 minutes
        historyLimit: 12,                     // ~3 months of trends (quarterly)
        models: ["gemini-2.5-flash", "gpt-4o-mini"],  // Standard AI — low cost, fast
        features: [
            "basic_audit",          // Core AI audit
            "health_score",         // Financial health scoring
            "weekly_moves",         // Action items from audit
            "history",              // Audit history (limited to 8)
            "demo",                 // Demo / test audit
            "dashboard_charts",     // Full trend charts (Net Worth, Health, Spending)
            "debt_simulator",       // Full debt payoff simulator
            "cash_flow_calendar",   // Full cash flow calendar
            "budget_tracking",      // Full budget tracking
            "card_portfolio",       // Full card/bank management
            "renewals",             // Full renewals tracking
            "weekly_challenges",    // Gamification / badges
            "share_card_branded",   // Share score card (with Catalyst Cash branding)
            "basic_alerts",         // Standard alerts (floor, promo sprint)
            "ask_ai",               // AskAI chat (daily limited)
        ],
        badge: null,
    },
    pro: {
        id: "pro",
        name: "Pro",
        auditsPerWeek: Infinity,             // No weekly cap (monthly cap of 150 applies)
        chatMessagesPerDay: Infinity,        // No daily cap enforced at tier level (PRO_DAILY_CHAT_CAP = 100 applies)
        marketRefreshMs: 5 * 60 * 1000,      // 5 minutes
        historyLimit: Infinity,               // All history
        models: [
            "gemini-2.5-flash",               // Standard AI (free)
            "gpt-4o-mini",                    // Standard AI (free)
            "gemini-2.5-pro",                 // Premium AI — deep reasoning
            "o4-mini",                        // Premium AI — latest OpenAI reasoning
        ],
        features: [
            // ── Everything in Free ──
            "basic_audit", "health_score", "weekly_moves", "history", "demo",
            "dashboard_charts", "debt_simulator", "cash_flow_calendar",
            "budget_tracking", "card_portfolio", "renewals",
            "weekly_challenges", "share_card_branded", "basic_alerts",

            // ── Pro Exclusives ──
            "unlimited_audits",        // No weekly cap (60/mo monthly safety cap)
            "premium_models",          // Access to Pro/Sonnet/o3
            "unlimited_history",       // Full audit archive
            "share_card_clean",        // Share without branding
            "export_csv",              // CSV / XLSX export
            "export_pdf",              // PDF report export
            "advanced_alerts",         // Score change drivers, trend warnings
            "priority_refresh",        // 15-min market data
            "unlimited_chat",          // 50/day AskAI messages (vs 10/day free)

            // ── Future Pro Features (roadmap) ──
            // "ai_followup_chat",     // Ask follow-up questions after audit
            // "net_worth_projections",// Monte Carlo simulation (1yr/5yr/10yr)
            // "goal_tracking",        // Debt-free target, savings milestones
            // "custom_categories",    // User-defined budget categories beyond defaults
            // "multi_currency",       // International users
            // "family_sharing",       // Shared household finances
            // "tax_summary",          // Year-end tax-relevant transaction summary
            // "plaid_auto_sync",      // Auto-sync Plaid balances daily
            // "widget_kit",           // iOS home screen widgets
            // "apple_watch",          // Wrist glanceable net worth
        ],
        badge: "⚡ Pro",
    },
};

// ── IAP Product IDs (Apple App Store) ─────────────────────────
export const IAP_PRODUCTS = {
    monthly: "com.catalystcash.pro.monthly.v2",   // $6.99/mo
    yearly: "com.catalystcash.pro.yearly.v2",     // $49.99/yr ($4.17/mo)
};

// ── IAP Display Pricing (for UI — no StoreKit dependency) ─────
//
// PRICING RATIONALE:
//   $6.99/mo  → Competitive vs Copilot ($10.99), Monarch ($9.99)
//   $49.99/yr → $4.17/mo effective, 40% savings anchors yearly
//   Apple takes 15% (Small Business Program) → $5.94 net/mo
//   AI costs for Pro user: ~$0.42/mo → $5.52 profit/user/mo
//
//   Yearly: $49.99 × 0.85 = $42.49 net, minus ~$5.04 AI = $37.45/yr profit
// ──────────────────────────────────────────────────────────────
export const IAP_PRICING = {
    monthly: {
        price: "$6.99",
        period: "month",
        note: "Billed monthly",
    },
    yearly: {
        price: "$49.99",
        period: "year",
        perMonth: "$4.17",
        savings: "Save 40%",
        trial: "7-day free trial",
    },
};

// ── State Management ──────────────────────────────────────────
const STATE_KEY = "subscription-state";

const DEFAULT_STATE = {
    tier: "free",
    expiresAt: null,        // ISO string, null = never (for free)
    productId: null,        // Last purchased product ID
    purchaseDate: null,     // ISO string
    auditsThisWeek: 0,      // Reset every Monday
    weekStartDate: null,    // UTC ISO string of current week's Monday
    auditsThisMonth: 0,     // Reset on 1st of each month (Pro cap)
    monthKey: null,         // UTC month key, e.g. "2026-03"
    chatMessagesToday: 0,   // Reset daily at midnight
    chatDayKey: null,       // UTC day key, e.g. "2026-03-01"
};

/**
 * Get a UTC ISO day key (YYYY-MM-DD).
 */
function getUtcDayKey(now = new Date()) {
    return now.toISOString().slice(0, 10);
}

/**
 * Get the current week's Monday using UTC boundaries.
 */
function getCurrentWeekMonday(now = new Date()) {
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayNum = monday.getUTCDay() || 7;
    monday.setUTCDate(monday.getUTCDate() + 1 - dayNum);
    return monday.toISOString().slice(0, 10);
}

/**
 * Get current month key for monthly cap tracking (e.g. "2026-03").
 */
function getCurrentMonthKey(now = new Date()) {
    return now.toISOString().slice(0, 7);
}

/**
 * Get current day key for daily chat tracking (e.g. "2026-03-01").
 */
function getCurrentDayKey(now = new Date()) {
    return getUtcDayKey(now);
}

export function getUsageWindowKeys(now = new Date()) {
    return {
        weekStartDate: getCurrentWeekMonday(now),
        monthKey: getCurrentMonthKey(now),
        dayKey: getCurrentDayKey(now),
    };
}

// ── Keychain Helpers (Anti-Abuse) ─────────────────────────────
// iOS Keychain survives app uninstall/reinstall, unlike UserDefaults.
// We store the device ID and audit usage counters here so a user
// cannot reset free-tier limits by deleting and reinstalling.
//
// On web / non-native, falls back gracefully to Preferences.
// ──────────────────────────────────────────────────────────────
const DEVICE_ID_KEY = "device-id";
const KC_DEVICE_ID_KEY = "cc-device-id";
const KC_AUDIT_STATE_KEY = "cc-audit-state";
const isNativePlatform = Capacitor.isNativePlatform();

async function keychainGet(key) {
    if (!isNativePlatform) return null;
    try {
        const result = await SecureStoragePlugin.get({ key });
        return result?.value ? JSON.parse(result.value) : null;
    } catch {
        return null; // Key doesn't exist yet
    }
}

async function keychainSet(key, value) {
    if (!isNativePlatform) return;
    try {
        await SecureStoragePlugin.set({ key, value: JSON.stringify(value) });
    } catch (e) {
        console.warn("[Keychain] Failed to write:", key, e?.message);
    }
}

function generateUUID() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
}

/**
 * Get or create a persistent device ID for anti-abuse tracking.
 * Uses iOS Keychain (survives reinstall) with Preferences fallback.
 * On first native boot after update, migrates existing Preferences ID to Keychain.
 */
export async function getOrCreateDeviceId() {
    try {
        // 1. Try Keychain first (survives reinstall)
        let kcId = await keychainGet(KC_DEVICE_ID_KEY);
        if (kcId) {
            // Ensure Preferences also has it (for non-Keychain reads)
            await db.set(DEVICE_ID_KEY, kcId);
            return kcId;
        }

        // 2. Migrate existing Preferences ID → Keychain (seamless upgrade)
        let prefId = await db.get(DEVICE_ID_KEY);
        if (prefId) {
            await keychainSet(KC_DEVICE_ID_KEY, prefId);
            return prefId;
        }

        // 3. First install — generate new ID and store in both
        const newId = generateUUID();
        await db.set(DEVICE_ID_KEY, newId);
        await keychainSet(KC_DEVICE_ID_KEY, newId);
        return newId;
    } catch {
        return "unknown";
    }
}

/**
 * Read audit usage counters from Keychain.
 * Returns { auditsThisWeek, weekStartDate, auditsThisMonth, monthKey } or null.
 */
async function getKeychainAuditState() {
    return await keychainGet(KC_AUDIT_STATE_KEY);
}

/**
 * Write audit usage counters to Keychain.
 */
async function setKeychainAuditState(counters) {
    await keychainSet(KC_AUDIT_STATE_KEY, counters);
}

/**
 * Load subscription state from local storage.
 */
export async function getSubscriptionState() {
    try {
        const raw = await db.get(STATE_KEY);
        const state = raw ? { ...DEFAULT_STATE, ...raw } : { ...DEFAULT_STATE };

        // ── Merge Keychain audit counters (anti-reinstall) ──────
        // If Keychain has higher counters for the same period,
        // it means the user reinstalled — use Keychain values.
        const kcState = await getKeychainAuditState();

        // Auto-reset weekly audit counter if a new week started
        const currentMonday = getCurrentWeekMonday();
        if (state.weekStartDate !== currentMonday) {
            state.auditsThisWeek = 0;
            state.weekStartDate = currentMonday;
        }
        // Keychain weekly merge: if same week, take the higher count
        if (kcState && kcState.weekStartDate === currentMonday) {
            state.auditsThisWeek = Math.max(state.auditsThisWeek, kcState.auditsThisWeek || 0);
        }

        // Auto-reset monthly audit counter on new month
        const currentMonth = getCurrentMonthKey();
        if (state.monthKey !== currentMonth) {
            state.auditsThisMonth = 0;
            state.monthKey = currentMonth;
        }
        // Keychain monthly merge: if same month, take the higher count
        if (kcState && kcState.monthKey === currentMonth) {
            state.auditsThisMonth = Math.max(state.auditsThisMonth, kcState.auditsThisMonth || 0);
        }

        // Auto-reset daily chat counter on new day
        const currentDay = getCurrentDayKey();
        if (state.chatDayKey !== currentDay) {
            state.chatMessagesToday = 0;
            state.chatDayKey = currentDay;
        }
        // Keychain daily merge: if same day, take the higher count
        if (kcState && kcState.chatDayKey === currentDay) {
            state.chatMessagesToday = Math.max(state.chatMessagesToday, kcState.chatMessagesToday || 0);
        }

        // Check if Pro expired
        if (state.tier === "pro" && state.expiresAt) {
            if (new Date(state.expiresAt) < new Date()) {
                state.tier = "free";
            }
        }

        await db.set(STATE_KEY, state);
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
    if (_effectiveGatingMode === "off") return TIERS.pro;
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
 * Uses getCurrentTier() so models are unlocked in "off" and "soft" modes,
 * and properly gated in "live" mode.
 */
export async function isModelAvailable(modelId) {
    const tier = await getCurrentTier();
    const activeModels = new Set(
        AI_PROVIDERS.flatMap(provider => provider.models.filter(isModelSelectable).map(model => model.id))
    );
    return tier.models.includes(modelId) && activeModels.has(modelId);
}

/**
 * Check if the user can run another audit this week.
 * Returns { allowed, remaining, limit, used }.
 * When GATING_MODE is "off", always returns unlimited.
 */
export async function checkAuditQuota() {
    if (_effectiveGatingMode === "off") {
        return { allowed: true, remaining: Infinity, limit: Infinity, used: 0, monthlyUsed: 0, monthlyCap: Infinity };
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
        monthlyUsed: state.auditsThisMonth || 0,
        monthlyCap: state.tier === "pro" ? PRO_MONTHLY_AUDIT_CAP : Infinity,
    };

    // Pro monthly cap check
    if (state.tier === "pro" && (state.auditsThisMonth || 0) >= PRO_MONTHLY_AUDIT_CAP) {
        result.allowed = false;
        result.remaining = 0;
        result.monthlyCapReached = true;
    }

    // In "soft" mode, show limits but don't block
    if (_effectiveGatingMode === "soft") {
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
    state.auditsThisMonth = (state.auditsThisMonth || 0) + 1;
    await db.set(STATE_KEY, state);

    // Persist counters to Keychain (survives reinstall)
    await setKeychainAuditState({
        auditsThisWeek: state.auditsThisWeek,
        weekStartDate: state.weekStartDate,
        auditsThisMonth: state.auditsThisMonth,
        monthKey: state.monthKey,
        chatMessagesToday: state.chatMessagesToday,
        chatDayKey: state.chatDayKey,
    });
}

/**
 * Check if the user can send another AskAI chat message today.
 * Returns { allowed, remaining, limit, used }.
 * When GATING_MODE is "off", always returns unlimited.
 */
export async function checkChatQuota() {
    if (_effectiveGatingMode === "off") {
        return { allowed: true, remaining: Infinity, limit: Infinity, used: 0 };
    }

    const state = await getSubscriptionState();
    const tier = TIERS[state.tier] || TIERS.free;
    const limit = tier.chatMessagesPerDay;
    const remaining = Math.max(0, limit - state.chatMessagesToday);

    const result = {
        allowed: remaining > 0 || limit === Infinity,
        remaining: limit === Infinity ? Infinity : remaining,
        limit,
        used: state.chatMessagesToday,
    };

    // Pro daily cap check (anti-abuse)
    if (state.tier === "pro" && state.chatMessagesToday >= PRO_DAILY_CHAT_CAP) {
        result.allowed = false;
        result.remaining = 0;
        result.dailyCapReached = true;
    }

    // In "soft" mode, show limits but don't block
    if (_effectiveGatingMode === "soft") {
        result.allowed = true;
        result.softBlocked = remaining <= 0 && limit !== Infinity;
    }

    return result;
}

/**
 * Increment the daily chat message counter.
 * Call this AFTER a successful AskAI response completes.
 * Always records usage regardless of gating mode (for analytics).
 */
export async function recordChatUsage() {
    const state = await getSubscriptionState();
    state.chatMessagesToday = (state.chatMessagesToday || 0) + 1;
    await db.set(STATE_KEY, state);

    // Persist to Keychain
    await setKeychainAuditState({
        auditsThisWeek: state.auditsThisWeek,
        weekStartDate: state.weekStartDate,
        auditsThisMonth: state.auditsThisMonth,
        monthKey: state.monthKey,
        chatMessagesToday: state.chatMessagesToday,
        chatDayKey: state.chatDayKey,
    });
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
