import { Capacitor } from "@capacitor/core";
import { log } from "./logger.js";
import { getNativeSecureItem, setNativeSecureItem } from "./secureStore.js";
import {
  __setGatingModeForTests,
  getGatingMode,
  getServerRateLimit,
  isGatingEnforced,
  shouldShowGating,
  syncRemoteGatingMode,
} from "./subscription/gating.js";
import {
  getAlternateProModel,
  getPreferredModelForTier,
  getSelectableModelIds,
  IAP_PRICING,
  IAP_PRODUCTS,
  INSTITUTION_LIMITS,
  normalizeModelForTier,
  PRO_DAILY_CHAT_CAP,
  PRO_MODEL_CAPS,
  PRO_MONTHLY_AUDIT_CAP,
  TIERS,
} from "./subscription/tiers.js";
import {
  getBillingCycleKey,
  getUsageWindowKeys,
} from "./subscription/windows.js";
import { db } from "./utils.js";
import { normalizeModelId } from "./providers.js";

export {
  __setGatingModeForTests,
  getAlternateProModel,
  getBillingCycleKey,
  getGatingMode,
  getPreferredModelForTier,
  getServerRateLimit,
  getUsageWindowKeys,
  IAP_PRICING,
  IAP_PRODUCTS,
  INSTITUTION_LIMITS,
  isGatingEnforced,
  normalizeModelForTier,
  PRO_DAILY_CHAT_CAP,
  PRO_MONTHLY_AUDIT_CAP,
  shouldShowGating,
  syncRemoteGatingMode,
  TIERS,
};

const STATE_KEY = "subscription-state";
const DEVICE_ID_KEY = "device-id";
const KC_DEVICE_ID_KEY = "cc-device-id";
const KC_AUDIT_STATE_KEY = "cc-audit-state";
const isNativePlatform = Capacitor.isNativePlatform();
export const SUBSCRIPTION_STATE_CHANGED_EVENT = "catalyst:subscription-state-changed";
const SUBSCRIPTION_STATE_CACHE_TTL_MS = 2500;
const KEYCHAIN_AUDIT_STATE_CACHE_TTL_MS = 2500;

let subscriptionStateCache = null;
let subscriptionStateCacheAt = 0;
let subscriptionStatePromise = null;
let keychainAuditStateCache = null;
let keychainAuditStateCacheAt = 0;
let keychainAuditStatePromise = null;

const DEFAULT_STATE = {
  tier: "free",
  isLifetime: false,
  expiresAt: null,
  productId: null,
  purchaseDate: null,
  purchaseAnchorDay: null,
  auditsThisWeek: 0,
  weekStartDate: null,
  auditsThisMonth: 0,
  billingCycleKey: null,
  monthKey: null,
  chatMessagesToday: 0,
  chatDayKey: null,
  chatMessagesByModel: {},
  referralCode: null,
  referralBonusMonths: 0,
};

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function createSubscriptionState(raw) {
  const stored = isPlainObject(raw) ? raw : {};
  return {
    ...DEFAULT_STATE,
    ...stored,
    chatMessagesByModel: isPlainObject(stored.chatMessagesByModel) ? { ...stored.chatMessagesByModel } : {},
  };
}

function ensureChatUsageMap(state) {
  if (!isPlainObject(state.chatMessagesByModel)) {
    state.chatMessagesByModel = {};
  }
}

function cloneSubscriptionState(state) {
  return createSubscriptionState(state);
}

function isFreshCache(timestamp, ttl) {
  return Number.isFinite(timestamp) && timestamp > 0 && Date.now() - timestamp < ttl;
}

function primeSubscriptionStateCache(state) {
  subscriptionStateCache = cloneSubscriptionState(state);
  subscriptionStateCacheAt = Date.now();
}

function primeKeychainAuditStateCache(state) {
  keychainAuditStateCache = isPlainObject(state) ? { ...state } : null;
  keychainAuditStateCacheAt = Date.now();
}

function invalidateSubscriptionStateCache({ includeKeychain = false } = {}) {
  subscriptionStateCache = null;
  subscriptionStateCacheAt = 0;
  subscriptionStatePromise = null;
  if (includeKeychain) {
    keychainAuditStateCache = null;
    keychainAuditStateCacheAt = 0;
    keychainAuditStatePromise = null;
  }
}

export function __resetSubscriptionCachesForTests() {
  invalidateSubscriptionStateCache({ includeKeychain: true });
}

function applyUsageWindows(state, windows) {
  if (state.weekStartDate !== windows.weekStartDate) {
    state.auditsThisWeek = 0;
    state.weekStartDate = windows.weekStartDate;
  }

  if (state.billingCycleKey !== windows.billingCycleKey) {
    state.auditsThisMonth = 0;
    state.billingCycleKey = windows.billingCycleKey;
  }

  if (state.monthKey !== windows.monthKey) {
    if (!state.purchaseAnchorDay) {
      state.auditsThisMonth = 0;
    }
    state.monthKey = windows.monthKey;
  }

  if (state.chatDayKey !== windows.dayKey) {
    state.chatMessagesToday = 0;
    state.chatMessagesByModel = {};
    state.chatDayKey = windows.dayKey;
  }

  ensureChatUsageMap(state);
}

function mergeKeychainCounters(state, keychainState, windows) {
  if (!isPlainObject(keychainState)) return;

  if (keychainState.weekStartDate === windows.weekStartDate) {
    state.auditsThisWeek = Math.max(state.auditsThisWeek || 0, keychainState.auditsThisWeek || 0);
  }

  const sameMonthlyWindow = keychainState.billingCycleKey === windows.billingCycleKey
    || (!state.purchaseAnchorDay && keychainState.monthKey === windows.monthKey);
  if (sameMonthlyWindow) {
    state.auditsThisMonth = Math.max(state.auditsThisMonth || 0, keychainState.auditsThisMonth || 0);
  }

  if (keychainState.chatDayKey === windows.dayKey) {
    state.chatMessagesToday = Math.max(state.chatMessagesToday || 0, keychainState.chatMessagesToday || 0);
  }
}

function applySubscriptionExpiry(state, now = new Date()) {
  if (state.tier !== "pro" || !state.expiresAt || state.isLifetime) return;
  if (new Date(state.expiresAt) < now) {
    state.tier = "free";
  }
}

function buildStoredCounters(state) {
  return {
    auditsThisWeek: state.auditsThisWeek,
    weekStartDate: state.weekStartDate,
    auditsThisMonth: state.auditsThisMonth,
    billingCycleKey: state.billingCycleKey,
    monthKey: state.monthKey,
    chatMessagesToday: state.chatMessagesToday,
    chatDayKey: state.chatDayKey,
  };
}

function applySoftModeResult(result, blocked) {
  if (getGatingMode() !== "soft") return result;
  result.allowed = true;
  if (blocked) {
    result.softBlocked = true;
  }
  return result;
}

function notifySubscriptionStateChange(state) {
  if (typeof globalThis === "undefined" || typeof globalThis.dispatchEvent !== "function") return;
  if (typeof globalThis.CustomEvent !== "function") return;
  globalThis.dispatchEvent(
    new CustomEvent(SUBSCRIPTION_STATE_CHANGED_EVENT, {
      detail: {
        tier: state?.tier || "free",
        proEnabled: state?.tier === "pro",
        productId: state?.productId || null,
        expiresAt: state?.expiresAt || null,
        isLifetime: !!state?.isLifetime,
      },
    })
  );
}

async function keychainGet(key) {
  if (!isNativePlatform) return null;
  try {
    return await getNativeSecureItem(key);
  } catch {
    return null;
  }
}

async function keychainSet(key, value) {
  if (!isNativePlatform) return;
  try {
    const saved = await setNativeSecureItem(key, value);
    if (!saved) {
      void log.warn("keychain", "Native secure storage unavailable", { key });
    }
  } catch (error) {
    void log.warn("keychain", "Failed to write", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function generateUUID() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const random = (Math.random() * 16) | 0;
    return (token === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

async function getKeychainAuditState() {
  if (isFreshCache(keychainAuditStateCacheAt, KEYCHAIN_AUDIT_STATE_CACHE_TTL_MS)) {
    return keychainAuditStateCache ? { ...keychainAuditStateCache } : null;
  }

  if (keychainAuditStatePromise) {
    const pendingState = await keychainAuditStatePromise;
    return pendingState ? { ...pendingState } : null;
  }

  const loadPromise = (async () => {
    const state = await keychainGet(KC_AUDIT_STATE_KEY);
    const normalized = isPlainObject(state) ? { ...state } : null;
    primeKeychainAuditStateCache(normalized);
    return normalized;
  })();

  keychainAuditStatePromise = loadPromise;
  try {
    const state = await loadPromise;
    return state ? { ...state } : null;
  } finally {
    if (keychainAuditStatePromise === loadPromise) {
      keychainAuditStatePromise = null;
    }
  }
}

async function setKeychainAuditState(counters) {
  primeKeychainAuditStateCache(counters);
  await keychainSet(KC_AUDIT_STATE_KEY, counters);
}

async function persistUsageCounters(state) {
  await setKeychainAuditState(buildStoredCounters(state));
}

export async function getOrCreateDeviceId() {
  try {
    const keychainId = await keychainGet(KC_DEVICE_ID_KEY);
    if (keychainId) {
      await db.set(DEVICE_ID_KEY, keychainId);
      return keychainId;
    }

    const storedId = await db.get(DEVICE_ID_KEY);
    if (storedId) {
      await keychainSet(KC_DEVICE_ID_KEY, storedId);
      return storedId;
    }

    const deviceId = generateUUID();
    await db.set(DEVICE_ID_KEY, deviceId);
    await keychainSet(KC_DEVICE_ID_KEY, deviceId);
    return deviceId;
  } catch {
    return "unknown";
  }
}

export async function getSubscriptionState() {
  if (isFreshCache(subscriptionStateCacheAt, SUBSCRIPTION_STATE_CACHE_TTL_MS)) {
    return cloneSubscriptionState(subscriptionStateCache);
  }

  if (subscriptionStatePromise) {
    const pendingState = await subscriptionStatePromise;
    return cloneSubscriptionState(pendingState);
  }

  const loadPromise = (async () => {
    try {
      const raw = await db.get(STATE_KEY);
      const state = createSubscriptionState(raw);
      const windows = getUsageWindowKeys(new Date(), state.purchaseAnchorDay || null);
      const keychainState = await getKeychainAuditState();

      applyUsageWindows(state, windows);
      mergeKeychainCounters(state, keychainState, windows);
      applySubscriptionExpiry(state);

      await db.set(STATE_KEY, state);
      primeSubscriptionStateCache(state);
      return state;
    } catch {
      const fallbackState = createSubscriptionState(null);
      primeSubscriptionStateCache(fallbackState);
      return fallbackState;
    }
  })();

  subscriptionStatePromise = loadPromise;
  try {
    const state = await loadPromise;
    return cloneSubscriptionState(state);
  } finally {
    if (subscriptionStatePromise === loadPromise) {
      subscriptionStatePromise = null;
    }
  }
}

export async function getCurrentTier() {
  if (getGatingMode() !== "live") return TIERS.pro;
  const state = await getSubscriptionState();
  return TIERS[state.tier] || TIERS.free;
}

export async function getRawTier() {
  const state = await getSubscriptionState();
  return TIERS[state.tier] || TIERS.free;
}

export async function hasFeature(featureId) {
  const tier = await getCurrentTier();
  return tier.features.includes(featureId);
}

export async function isModelAvailable(modelId) {
  const tier = await getCurrentTier();
  return tier.models.includes(modelId) && getSelectableModelIds().has(modelId);
}

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

  if (state.tier === "pro" && (state.auditsThisMonth || 0) >= PRO_MONTHLY_AUDIT_CAP) {
    result.allowed = false;
    result.remaining = 0;
    result.monthlyCapReached = true;
  }

  return applySoftModeResult(result, remaining <= 0 && limit !== Infinity);
}

export async function recordAuditUsage() {
  const state = await getSubscriptionState();
  state.auditsThisWeek = (state.auditsThisWeek || 0) + 1;
  state.auditsThisMonth = (state.auditsThisMonth || 0) + 1;

  await db.set(STATE_KEY, state);
  primeSubscriptionStateCache(state);
  await persistUsageCounters(state);
}

function buildProChatQuota(state, modelId) {
  const effectiveModelId = normalizeModelId(modelId);
  const globalRemaining = Math.max(0, PRO_DAILY_CHAT_CAP - (state.chatMessagesToday || 0));
  const modelCap = PRO_MODEL_CAPS[effectiveModelId];
  const modelUsed = state.chatMessagesByModel?.[effectiveModelId] || 0;
  const modelRemaining = Math.min(globalRemaining, Math.max(0, modelCap - modelUsed));

  const alternateModelId = getAlternateProModel(effectiveModelId);
  const alternateCap = alternateModelId ? PRO_MODEL_CAPS[alternateModelId] || 0 : 0;
  const alternateUsed = alternateModelId ? state.chatMessagesByModel?.[alternateModelId] || 0 : 0;
  const alternateRemaining = Math.min(globalRemaining, Math.max(0, alternateCap - alternateUsed));
  const alternateModels = TIERS.pro.models
    .filter((candidateId) => candidateId !== effectiveModelId && PRO_MODEL_CAPS[candidateId] !== undefined)
    .map((candidateId) => {
      const candidateCap = PRO_MODEL_CAPS[candidateId] || 0;
      const candidateUsed = state.chatMessagesByModel?.[candidateId] || 0;
      return {
        modelId: candidateId,
        remaining: Math.min(globalRemaining, Math.max(0, candidateCap - candidateUsed)),
        limit: Math.min(PRO_DAILY_CHAT_CAP, candidateCap),
      };
    })
    .filter((candidate) => candidate.remaining > 0);

  const result = {
    allowed: modelRemaining > 0,
    remaining: modelRemaining,
    limit: Math.min(PRO_DAILY_CHAT_CAP, modelCap),
    used: modelUsed,
    modelId: effectiveModelId,
    alternateModel: alternateModelId || undefined,
    alternateRemaining: alternateModelId ? alternateRemaining : undefined,
    alternateModels,
  };

  if (globalRemaining <= 0) {
    result.allowed = false;
    result.dailyCapReached = true;
  }

  return applySoftModeResult(result, modelRemaining <= 0);
}

function buildStandardChatQuota(state, tier) {
  const limit = tier.chatMessagesPerDay;
  const remaining = Math.max(0, limit - state.chatMessagesToday);
  const result = {
    allowed: remaining > 0 || limit === Infinity,
    remaining: limit === Infinity ? Infinity : remaining,
    limit,
    used: state.chatMessagesToday,
  };

  if (state.tier === "pro" && state.chatMessagesToday >= PRO_DAILY_CHAT_CAP) {
    result.allowed = false;
    result.remaining = 0;
    result.dailyCapReached = true;
  }

  return applySoftModeResult(result, remaining <= 0 && limit !== Infinity);
}

export async function checkChatQuota(modelId) {
  if (getGatingMode() === "off") {
    return { allowed: true, remaining: Infinity, limit: Infinity, used: 0 };
  }

  const state = await getSubscriptionState();
  const tier = TIERS[state.tier] || TIERS.free;

  const effectiveModelId = normalizeModelId(modelId);
  if (state.tier === "pro" && effectiveModelId && PRO_MODEL_CAPS[effectiveModelId] !== undefined) {
    return buildProChatQuota(state, effectiveModelId);
  }

  return buildStandardChatQuota(state, tier);
}

export async function recordChatUsage(modelId) {
  const state = await getSubscriptionState();
  state.chatMessagesToday = (state.chatMessagesToday || 0) + 1;
  ensureChatUsageMap(state);

  if (modelId) {
    const effectiveModelId = normalizeModelId(modelId);
    state.chatMessagesByModel[effectiveModelId] = (state.chatMessagesByModel[effectiveModelId] || 0) + 1;
  }

  await db.set(STATE_KEY, state);
  primeSubscriptionStateCache(state);
  await persistUsageCounters(state);
}

export async function getMarketRefreshTTL() {
  const tier = await getCurrentTier();
  return tier.marketRefreshMs;
}

export async function getHistoryLimit() {
  const tier = await getCurrentTier();
  return tier.historyLimit;
}

function normalizeSubscriptionDate(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export async function activatePro(
  productId,
  durationDays = 30,
  {
    isLifetime = false,
    purchaseDate = null,
    expiresAt = null,
  } = {}
) {
  const state = await getSubscriptionState();
  const now = new Date();
  const wasPro = state.tier === "pro";
  const previousProductId = state.productId;
  const previousAnchorDay = state.purchaseAnchorDay;
  const previousBillingCycleKey = state.billingCycleKey;
  const resolvedPurchaseDate = normalizeSubscriptionDate(purchaseDate) || now;
  const resolvedExpiryDate = normalizeSubscriptionDate(expiresAt);
  const nextPurchaseAnchorDay = resolvedPurchaseDate.getUTCDate();
  const nextBillingCycleKey = getBillingCycleKey(nextPurchaseAnchorDay, now);
  const shouldResetMonthlyUsage =
    !wasPro
    || previousProductId !== productId
    || previousAnchorDay !== nextPurchaseAnchorDay
    || previousBillingCycleKey !== nextBillingCycleKey;

  state.tier = "pro";
  state.productId = productId;
  state.purchaseDate = resolvedPurchaseDate.toISOString();
  state.isLifetime = isLifetime;
  state.purchaseAnchorDay = nextPurchaseAnchorDay;
  state.billingCycleKey = nextBillingCycleKey;
  if (shouldResetMonthlyUsage) {
    state.auditsThisMonth = 0;
  }

  if (isLifetime) {
    state.expiresAt = null;
  } else if (resolvedExpiryDate) {
    state.expiresAt = resolvedExpiryDate.toISOString();
  } else {
    const computedExpiryDate = new Date(resolvedPurchaseDate);
    computedExpiryDate.setDate(computedExpiryDate.getDate() + durationDays);
    state.expiresAt = computedExpiryDate.toISOString();
  }

  await db.set(STATE_KEY, state);
  primeSubscriptionStateCache(state);
  notifySubscriptionStateChange(state);
  return state;
}

export async function deactivatePro() {
  const state = await getSubscriptionState();
  state.tier = "free";
  state.expiresAt = null;
  state.productId = null;
  state.isLifetime = false;
  state.purchaseDate = null;
  state.purchaseAnchorDay = null;
  state.billingCycleKey = null;
  await db.set(STATE_KEY, state);
  primeSubscriptionStateCache(state);
  notifySubscriptionStateChange(state);
}

export async function hasPaidProAccess() {
  const state = await getSubscriptionState();
  return state.tier === "pro";
}

export async function isPro() {
  if (getGatingMode() !== "live") return true;
  const state = await getSubscriptionState();
  return state.tier === "pro";
}
