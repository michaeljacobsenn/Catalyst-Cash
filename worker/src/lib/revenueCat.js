import { getRequestedTier, getRevenueCatAppUserId, isTestingBypassRequested } from "./requestIdentity.js";
import { getActorRevenueCatUserId } from "./identitySession.js";
import { isRevenueCatEntitlementActive } from "./quota.js";
import { fetchWithTimeout } from "./http.js";

export function getConfiguredEntitlementId(env) {
  return env.REVENUECAT_ENTITLEMENT_ID || "Catalyst Cash Pro";
}

export async function fetchRevenueCatSubscriber(appUserId, env, options = {}) {
  const timeoutMs = options.timeoutMs || 8_000;
  const cacheTtlSeconds = options.cacheTtlSeconds || 300;
  if (!env.REVENUECAT_SECRET_KEY || !appUserId) return null;

  const cacheKey = `https://revenuecat.internal/${encodeURIComponent(appUserId)}`;
  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached.json();
  }

  const response = await fetchWithTimeout(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${env.REVENUECAT_SECRET_KEY}`,
      },
    },
    timeoutMs
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`RevenueCat verification failed (${response.status})`);
  }

  const payload = await response.json();
  if (cache) {
    await cache.put(
      cacheKey,
      new Response(JSON.stringify(payload), {
        headers: { "Cache-Control": `max-age=${cacheTtlSeconds}` },
      })
    );
  }
  return payload;
}

export async function resolveVerifiedRevenueCatAppUserId(request, env, options = {}) {
  const revenueCatAppUserId = getRevenueCatAppUserId(request);
  if (!revenueCatAppUserId || !env.REVENUECAT_SECRET_KEY) return null;
  try {
    const payload = await fetchRevenueCatSubscriber(revenueCatAppUserId, env, options);
    return payload?.subscriber ? revenueCatAppUserId : null;
  } catch {
    return null;
  }
}

export async function resolveEffectiveTier(request, env, actor = null, options = {}) {
  if (isTestingBypassRequested(request)) {
    return {
      tier: getRequestedTier(request),
      verified: true,
      source: "testing",
    };
  }
  const revenueCatAppUserId = actor?.revenueCatAppUserId || getRevenueCatAppUserId(request);
  if (!env.REVENUECAT_SECRET_KEY || !revenueCatAppUserId) {
    return { tier: "free", verified: false, source: "unverified" };
  }

  try {
    const payload = await fetchRevenueCatSubscriber(revenueCatAppUserId, env, options);
    const isPro = isRevenueCatEntitlementActive(payload?.subscriber, getConfiguredEntitlementId(env));
    return {
      tier: isPro ? "pro" : "free",
      verified: true,
      source: "revenuecat",
    };
  } catch (error) {
    return {
      tier: "free",
      verified: false,
      source: "verification_failed",
      verificationError: error?.message || "verification_failed",
    };
  }
}

export async function resolveStoredUserTier(userId, env, options = {}) {
  if (!(options.isWorkerGatingEnforced?.(env))) return "pro";
  if (!userId) return "free";

  const revenueCatAppUserId =
    userId.startsWith("rc:") ? userId.slice(3) : await getActorRevenueCatUserId(env.DB, userId);
  if (!revenueCatAppUserId) return "free";

  try {
    const payload = await fetchRevenueCatSubscriber(revenueCatAppUserId, env, options);
    return isRevenueCatEntitlementActive(payload?.subscriber, getConfiguredEntitlementId(env)) ? "pro" : "free";
  } catch {
    return "free";
  }
}
