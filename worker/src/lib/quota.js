export const FREE_AUDITS_PER_WEEK = 2;
export const PRO_AUDITS_PER_MONTH = 20;
export const FREE_CHATS_PER_DAY = 10;
export const PRO_CHATS_PER_DAY = 25;

// Per-model daily caps for Pro chat (must sum to PRO_CHATS_PER_DAY)
export const PRO_MODEL_CAPS = {
  "o3": 4,
  "gpt-4.1": 6,
  "gemini-2.5-flash": 15,
};

/**
 * Get per-model quota window for Pro tier chat.
 * Returns null if no per-model cap applies (e.g. free tier).
 */
export function getModelQuotaWindow(tier, modelId, now = new Date()) {
  if (tier !== "pro" || !PRO_MODEL_CAPS[modelId]) return null;
  return {
    limit: PRO_MODEL_CAPS[modelId],
    periodKey: `${now.toISOString().slice(0, 10)}:${modelId}`,
    resetAt: getNextUtcBoundary("day", now),
    modelId,
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
