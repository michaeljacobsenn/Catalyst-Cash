export const FREE_AUDITS_PER_WEEK = 2;
export const PRO_AUDITS_PER_MONTH = 20;
export const FREE_CHATS_PER_DAY = 5;
export const PRO_CHATS_PER_DAY = 30;

export const FREE_MODEL_ID = "gpt-5-nano";
export const PRO_PRIMARY_MODEL_ID = "gpt-5-mini";
export const PRO_VOLUME_MODEL_ID = "gpt-5-nano";
export const PRO_BOARDROOM_MODEL_ID = "gpt-5.1";

const MODEL_ALIASES = {
  "gemini-2.5-flash": PRO_VOLUME_MODEL_ID,
  "gpt-4.1": PRO_PRIMARY_MODEL_ID,
  "o3": PRO_BOARDROOM_MODEL_ID,
};

export function canonicalizeModelId(modelId) {
  const normalized = String(modelId || "").trim();
  return MODEL_ALIASES[normalized] || normalized;
}

// Per-model daily caps for Pro. The 30-chat global cap still applies; these
// buckets keep premium OpenAI usage bounded while preserving a volume lane.
export const PRO_MODEL_CAPS = {
  [PRO_PRIMARY_MODEL_ID]: 15,
  [PRO_VOLUME_MODEL_ID]: 15,
  [PRO_BOARDROOM_MODEL_ID]: 5,
};

// Per-model monthly caps for Pro audits (must sum to PRO_AUDITS_PER_MONTH)
export const PRO_MODEL_AUDIT_CAPS = {
  [PRO_PRIMARY_MODEL_ID]: 13,
  [PRO_VOLUME_MODEL_ID]: 5,
  [PRO_BOARDROOM_MODEL_ID]: 2,
};

/**
 * Get per-model quota window for Pro tier chat.
 * Returns null if no per-model cap applies (e.g. free tier).
 */
export function getModelQuotaWindow(tier, modelId, now = new Date()) {
  const effectiveModelId = canonicalizeModelId(modelId);
  if (tier !== "pro" || !PRO_MODEL_CAPS[effectiveModelId]) return null;
  return {
    limit: PRO_MODEL_CAPS[effectiveModelId],
    periodKey: `${now.toISOString().slice(0, 10)}:${effectiveModelId}`,
    resetAt: getNextUtcBoundary("day", now),
    modelId: effectiveModelId,
  };
}

/**
 * Get per-model quota window for Pro tier audits (monthly).
 * Returns null if no per-model cap applies.
 */
export function getAuditModelQuotaWindow(tier, modelId, now = new Date()) {
  const effectiveModelId = canonicalizeModelId(modelId);
  if (tier !== "pro" || !PRO_MODEL_AUDIT_CAPS[effectiveModelId]) return null;
  return {
    limit: PRO_MODEL_AUDIT_CAPS[effectiveModelId],
    periodKey: `${now.toISOString().slice(0, 7)}:audit:${effectiveModelId}`,
    resetAt: getNextUtcBoundary("month", now),
    modelId: effectiveModelId,
  };
}

function getNextUtcBoundary(period, now = new Date()) {
  const next = new Date(now);
  if (period === "day") {
    next.setUTCHours(24, 0, 0, 0);
    return next;
  }
  if (period === "month") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  }
  const dayNum = now.getUTCDay() || 7;
  const daysUntilNextMonday = 8 - dayNum;
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilNextMonday, 0, 0, 0, 0)
  );
}

export function getIsoWeekKey(now) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export function getQuotaWindow(tier, isChat, now = new Date()) {
  if (isChat) {
    return {
      limit: tier === "pro" ? PRO_CHATS_PER_DAY : FREE_CHATS_PER_DAY,
      periodKey: now.toISOString().slice(0, 10),
      resetAt: getNextUtcBoundary("day", now),
    };
  }

  if (tier === "pro") {
    return {
      limit: PRO_AUDITS_PER_MONTH,
      periodKey: now.toISOString().slice(0, 7),
      resetAt: getNextUtcBoundary("month", now),
    };
  }

  return {
    limit: FREE_AUDITS_PER_WEEK,
    periodKey: getIsoWeekKey(now),
    resetAt: getNextUtcBoundary("week", now),
  };
}

export function isRevenueCatEntitlementActive(subscriber, entitlementId, now = new Date()) {
  const entitlement = subscriber?.entitlements?.[entitlementId];
  if (!entitlement) return false;
  if (!entitlement.expires_date) return true;
  const expiresAt = Date.parse(entitlement.expires_date);
  return Number.isFinite(expiresAt) && expiresAt >= now.getTime();
}
