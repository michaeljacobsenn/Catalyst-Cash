import { Capacitor } from "@capacitor/core";
import { APP_VERSION } from "./constants.js";
import { fetchWithRetry } from "./fetchWithRetry.js";
import { log } from "./logger.js";
import { getBackendUrl } from "./api.js";
import { getRevenueCatAppUserId } from "./revenuecat.js";
import { deleteSecureItem, getSecureItem, setSecureItem } from "./secureStore.js";
import { getOrCreateDeviceId } from "./subscription.js";

const SESSION_KEY = "identity-session";
const EXPIRY_SKEW_MS = 60 * 1000;

let inMemorySession = null;
let inflightSessionPromise = null;

function isSessionFresh(session) {
  if (!session?.token || !session?.expiresAt) return false;
  const expiresAt = Date.parse(session.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt - Date.now() > EXPIRY_SKEW_MS;
}

async function loadStoredSession() {
  if (isSessionFresh(inMemorySession)) return inMemorySession;
  if (Capacitor.getPlatform() === "web") return null;
  const stored = await getSecureItem(SESSION_KEY).catch(() => null);
  if (isSessionFresh(stored)) {
    inMemorySession = stored;
    return stored;
  }
  return null;
}

async function persistSession(session) {
  inMemorySession = session;
  if (Capacitor.getPlatform() === "web") {
    return;
  }
  const saved = await setSecureItem(SESSION_KEY, session).catch(() => false);
  if (!saved) {
    log.warn("identity-session", "Session persisted in memory only");
  }
}

export async function clearIdentitySession() {
  inMemorySession = null;
  if (Capacitor.getPlatform() === "web") {
    return;
  }
  await deleteSecureItem(SESSION_KEY).catch(() => false);
}

async function fetchIdentitySession() {
  const deviceId = await getOrCreateDeviceId().catch(() => "unknown");
  const headers = {
    "Content-Type": "application/json",
    "X-Device-ID": deviceId || "unknown",
    "X-App-Version": APP_VERSION,
  };

  const revenueCatAppUserId = await getRevenueCatAppUserId().catch(() => null);
  if (revenueCatAppUserId) {
    headers["X-RC-App-User-ID"] = revenueCatAppUserId;
  }

  const response = await fetchWithRetry(`${getBackendUrl()}/auth/session`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Identity session failed: HTTP ${response.status}`);
  }

  const session = await response.json();
  if (!session?.token || !session?.expiresAt) {
    throw new Error("Identity session response was incomplete");
  }
  await persistSession(session);
  return session;
}

export async function getIdentitySession(forceRefresh = false) {
  if (!forceRefresh) {
    const stored = await loadStoredSession();
    if (stored) return stored;
  }

  if (inflightSessionPromise) {
    return inflightSessionPromise;
  }

  inflightSessionPromise = fetchIdentitySession()
    .finally(() => {
      inflightSessionPromise = null;
    });

  return inflightSessionPromise;
}

export async function buildIdentityHeaders(extra = {}) {
  const session = await getIdentitySession();
  return {
    Authorization: `Bearer ${session.token}`,
    "X-App-Version": APP_VERSION,
    ...extra,
  };
}
