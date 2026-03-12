// ═══════════════════════════════════════════════════════════════
// SUBSCRIPTION & PRO STATE — Catalyst Cash
//
// Manages Pro subscription status, audit quotas, and feature gating.
// Currently uses local storage. When RevenueCat or StoreKit is
// integrated, this module becomes the bridge to the native IAP API.
//
// ─── AI MODEL COST MATRIX (per audit, ~3K tokens in / ~2K out) ──
//   gemini-2.5-flash  $0.30/$2.50/M  ≈ $0.006/audit  → Free (Catalyst AI)
//   gemini-2.5-pro    $1.25/$10.0/M  ≈ $0.024/audit  → Pro  (Catalyst AI Pro)
//   o4-mini           $1.10/$4.40/M  ≈ $0.012/audit  → Pro  (Catalyst AI Reasoning)
//
//   Free: 2 audits/wk on Flash  → ~$0.05/user/month
//   Pro worst case: 31 audits/mo on o3-mini → ~$0.74/user/month
//   Pro @ $9.99/mo (after Apple 30%): $6.99 net → ~$5.79+ profit/user
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
 * Last known rate-limit state from the worker (source of truth).
 * Updated on every successful API response via X-RateLimit-Remaining.
 */
const _lastServerRateLimit = { audit: null, chat: null };
export function getServerRateLimit() {
  return _lastServerRateLimit;
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
    const { fetchGatingConfig, onRateLimitUpdate } = await import("./api.js");

    // Register rate-limit sync callback (runs on every API response)
    onRateLimitUpdate(({ remaining, limit, isChat }) => {
      const key = isChat ? "chat" : "audit";
      _lastServerRateLimit[key] = { remaining, limit, ts: Date.now() };
    });

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
//   - Pro has a monthly cap (31 ≈ 1/day) to control API cost.
//   - Backend rate-limiting via X-Device-ID header provides server-side
//     protection even if client storage is tampered with.
//
// ── AI TOOL LIMIT PHILOSOPHY ────────────────────────────────────
//   Audits: Heavy (~3K tokens in, ~2K out, structured JSON). Weekly cap.
//   AskAI:  Light (~300 tokens in, ~500 out, natural language). Daily cap.
//
//   Free AskAI: 10/day — enough to experience the value proposition.
//   Pro AskAI: 50/day — generous but bounded to prevent abuse.
//   These limits match the Cloudflare Worker enforcement exactly.
//
// ── BILLING CYCLE ANCHORING ─────────────────────────────────────
//   Pro monthly audit counter resets on the purchase anniversary day.
//   e.g. purchased Jan 15 → cycle runs 15th→15th each month.
//   For months shorter than the anchor day (e.g. anchor=31, Feb),
//   the last day of the month is used. All dates are UTC.
// ──────────────────────────────────────────────────────────────
export const PRO_MONTHLY_AUDIT_CAP = 31; // 1/day, $0.74/mo max API cost at $0.024/audit
export const PRO_DAILY_CHAT_CAP = 50; // ~3/hr, prevents abuse while feeling generous

export const TIERS = {
  free: {
    id: "free",
    name: "Free",
    auditsPerWeek: 2, // Weekly audit + 1 re-run (matches worker enforcement)
    chatMessagesPerDay: 10, // Enough to experience value (matches worker enforcement)
    marketRefreshMs: 60 * 60 * 1000, // 60 minutes
    historyLimit: 12, // ~3 months of trends (quarterly)
    models: ["gpt-4o-mini"], // Catalyst AI — fast, free
    features: [
      "basic_audit", // Core AI audit
      "health_score", // Financial health scoring
      "weekly_moves", // Action items from audit
      "history", // Audit history (limited to 8)
      "demo", // Demo / test audit
      "dashboard_charts", // Full trend charts (Net Worth, Health, Spending)
      "debt_simulator", // Full debt payoff simulator
      "cash_flow_calendar", // Full cash flow calendar
      "budget_tracking", // Full budget tracking
      "card_portfolio", // Full card/bank management
      "renewals", // Full renewals tracking
      "weekly_challenges", // Gamification / badges
      "share_card_branded", // Share score card (with Catalyst Cash branding)
      "basic_alerts", // Standard alerts (floor, promo sprint)
      "ask_ai", // AskAI chat (daily limited)
    ],
    badge: null,
  },
  pro: {
    id: "pro",
    name: "Pro",
    auditsPerWeek: Infinity, // No weekly cap (monthly cap of 31 applies)
    chatMessagesPerDay: Infinity, // No daily cap enforced at tier level (PRO_DAILY_CHAT_CAP = 50 applies)
    marketRefreshMs: 5 * 60 * 1000, // 5 minutes
    historyLimit: Infinity, // All history
    models: [
      "gpt-4o-mini", // Catalyst AI (free)
      "gpt-4o", // Catalyst AI Chat
      "o3-mini", // Catalyst AI Reasoning
    ],
    features: [
      // ── Everything in Free ──
      "basic_audit",
      "health_score",
      "weekly_moves",
      "history",
      "demo",
      "dashboard_charts",
      "debt_simulator",
      "cash_flow_calendar",
      "budget_tracking",
      "card_portfolio",
      "renewals",
      "weekly_challenges",
      "share_card_branded",
      "basic_alerts",

      // ── Pro Exclusives ──
      "31_audits_per_month", // 31/mo monthly cap (1/day)
      "premium_models", // Access to o3-mini / GPT-4o
      "unlimited_history", // Full audit archive
      "share_card_clean", // Share without branding
      "export_csv", // CSV / XLSX export
      "export_pdf", // PDF report export
      "advanced_alerts", // Score change drivers, trend warnings
      "priority_refresh", // 15-min market data
      "daily_50_chat", // 50/day AskAI messages (vs 10/day free)
      "card_wizard", // Card Wizard feature
      "bill_negotiation", // AI Bill Negotiation scripts

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
  monthly: "com.catalystcash.pro.monthly.v2", // $9.99/mo
  yearly: "com.catalystcash.pro.yearly.v2", // $89.99/yr ($7.50/mo)
};

// ── IAP Display Pricing (for UI — no StoreKit dependency) ─────
//
// PRICING RATIONALE (Frozen Account Pivot):
//   $9.99/mo → "Under $10" premium at exact psychological threshold
//   $89.99/yr → $7.50/mo effective, 25% savings anchors yearly
//   Apple takes 30% → $6.99 net/mo (monthly), $5.25 net/mo (yearly)
//   Free COGS is strictly bounded as 1-time snapshot. Pro max COGS is ~$4.80/mo.
// ──────────────────────────────────────────────────────────────
export const IAP_PRICING = {
  monthly: { price: "$9.99", period: "month", savings: false },
  yearly: { price: "$89.99", period: "year", savings: "SAVE 25%", perMonth: "$7.50", original: "$119.88", trial: "7-day free trial" },
};

// ── Institution Limits (Plaid bank connections per tier) ───────
export const INSTITUTION_LIMITS = {
  free: 2, // Checking + 1 credit card — enough to demo value
  pro: 10, // Power users with multiple banks, credit cards, and investment accounts
};

// ── State Management ──────────────────────────────────────────
const STATE_KEY = "subscription-state";

const DEFAULT_STATE = {
  tier: "free",
  expiresAt: null, // ISO string, null = never (for free)
  productId: null, // Last purchased product ID
  purchaseDate: null, // ISO string
  purchaseAnchorDay: null, // Day-of-month when Pro was purchased (1-31)
  auditsThisWeek: 0, // Reset every Monday
  weekStartDate: null, // UTC ISO string of current week's Monday
  auditsThisMonth: 0, // Reset on billing cycle boundary (Pro cap)
  billingCycleKey: null, // Billing cycle start date, e.g. "2026-03-15"
  monthKey: null, // UTC calendar month key, e.g. "2026-03" (fallback)
  chatMessagesToday: 0, // Reset daily at midnight
  chatDayKey: null, // UTC day key, e.g. "2026-03-01"
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
 * Used as fallback when no purchase anchor day is set.
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

/**
 * Get the current billing cycle key, anchored to the purchase anniversary day.
 *
 * Example: purchased on Jan 15 (anchorDay=15)
 *   - Jan 15 → Feb 14 = cycle key "2026-01-15"
 *   - Feb 15 → Mar 14 = cycle key "2026-02-15"
 *
 * Edge cases:
 *   - anchorDay=31, February → cycle starts on Feb 28 (or 29 in leap year)
 *   - anchorDay=30, February → same treatment
 *   - Months with 30 days and anchor=31 → cycle starts on the 30th
 *
 * @param {number} anchorDay - Day of month (1-31) when subscription was purchased
 * @param {Date} now - Current date (UTC)
 * @returns {string} Billing cycle start date key, e.g. "2026-03-15"
 */
export function getBillingCycleKey(anchorDay, now = new Date()) {
  if (!anchorDay || anchorDay < 1 || anchorDay > 31) {
    // Fallback to calendar month if no valid anchor
    return getCurrentMonthKey(now);
  }

  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-indexed
  const day = now.getUTCDate();

  // Clamp anchor day to the number of days in the current month
  const daysInCurrentMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const effectiveAnchor = Math.min(anchorDay, daysInCurrentMonth);

  let cycleStartYear, cycleStartMonth;

  if (day >= effectiveAnchor) {
    // We're on or past the anchor day → cycle started THIS month
    cycleStartYear = year;
    cycleStartMonth = month;
  } else {
    // We're before the anchor day → cycle started LAST month
    if (month === 0) {
      cycleStartYear = year - 1;
      cycleStartMonth = 11; // December
    } else {
      cycleStartYear = year;
      cycleStartMonth = month - 1;
    }
  }

  // Clamp to the actual days in the cycle start month
  const daysInStartMonth = new Date(Date.UTC(cycleStartYear, cycleStartMonth + 1, 0)).getUTCDate();
  const cycleDay = Math.min(anchorDay, daysInStartMonth);

  const mm = String(cycleStartMonth + 1).padStart(2, "0");
  const dd = String(cycleDay).padStart(2, "0");
  return `${cycleStartYear}-${mm}-${dd}`;
}

export function getUsageWindowKeys(now = new Date(), anchorDay = null) {
  return {
    weekStartDate: getCurrentWeekMonday(now),
    billingCycleKey: anchorDay ? getBillingCycleKey(anchorDay, now) : getCurrentMonthKey(now),
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
    const kcId = await keychainGet(KC_DEVICE_ID_KEY);
    if (kcId) {
      // Ensure Preferences also has it (for non-Keychain reads)
      await db.set(DEVICE_ID_KEY, kcId);
      return kcId;
    }

    // 2. Migrate existing Preferences ID → Keychain (seamless upgrade)
    const prefId = await db.get(DEVICE_ID_KEY);
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

    // Auto-reset monthly audit counter on new billing cycle (or calendar month for free users)
    const currentBillingCycle = state.purchaseAnchorDay
      ? getBillingCycleKey(state.purchaseAnchorDay)
      : getCurrentMonthKey();

    // Reset if we crossed into a new cycle
    if (state.billingCycleKey !== currentBillingCycle) {
      state.auditsThisMonth = 0;
      state.billingCycleKey = currentBillingCycle;
    }

    // Fallback: also update the legacy/fallback calendar month key
    const currentMonth = getCurrentMonthKey();
    if (state.monthKey !== currentMonth) {
      if (!state.purchaseAnchorDay) state.auditsThisMonth = 0;
      state.monthKey = currentMonth;
    }

    // Keychain monthly merge: if same cycle/month, take the higher count
    if (kcState && (kcState.billingCycleKey === currentBillingCycle || (!state.purchaseAnchorDay && kcState.monthKey === currentMonth))) {
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
  if (getGatingMode() === "off") {
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
  if (getGatingMode() === "soft") {
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
    billingCycleKey: state.billingCycleKey,
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
  if (getGatingMode() === "off") {
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
  if (getGatingMode() === "soft") {
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
    billingCycleKey: state.billingCycleKey,
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
  const now = new Date();
  state.tier = "pro";
  state.productId = productId;
  state.purchaseDate = now.toISOString();

  // Determine the anchor day (1-31) in UTC to lock in the billing cycle
  state.purchaseAnchorDay = now.getUTCDate();
  state.billingCycleKey = getBillingCycleKey(state.purchaseAnchorDay, now);

  const expires = new Date(now);
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
  // We keep purchaseAnchorDay and billingCycleKey untouched so
  // if they resubscribe later in the same month, we have history.
  // When they resubscribe, activatePro() will reset the anchor.
  await db.set(STATE_KEY, state);
}

/**
 * Check if the user is currently Pro.
 * In "soft" or "off" gating modes, always returns true so the
 * worker receives X-Subscription-Tier: "pro" and applies pro limits.
 * In "live" mode, checks the actual RevenueCat subscription.
 */
export async function isPro() {
  if (getGatingMode() === "off") return true;
  const state = await getSubscriptionState();
  return state.tier === "pro";
}
