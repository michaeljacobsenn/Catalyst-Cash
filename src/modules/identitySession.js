import { Capacitor } from "@capacitor/core";
import { APP_VERSION } from "./constants.js";
import { fetchWithRetry } from "./fetchWithRetry.js";
import { log } from "./logger.js";
import { getBackendUrl } from "./api.js";
import { getRevenueCatAppUserId } from "./revenuecat.js";
import {
  deleteSecureItem,
  getSecretStorageStatus,
  getSecureItem,
  setSecureItem,
} from "./secureStore.js";
import { db } from "./utils.js";

const SESSION_KEY = "identity-session";
const DEVICE_KEYPAIR_KEY = "identity-device-keypair-v1";
const EXPIRY_SKEW_MS = 60 * 1000;

let inMemorySession = null;
let inflightSessionPromise = null;
let inflightKeypairPromise = null;
let legacyBootstrapAliasRejected = false;
const IDENTITY_REVENUECAT_TIMEOUT_MS = 250;

function toBase64Url(bytes) {
  const base64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(bytes).toString("base64")
      : btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function publicKeyFingerprintFromJwk(publicKeyJwk) {
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    publicKeyJwk,
    { name: "Ed25519" },
    true,
    ["verify"]
  );
  const raw = await crypto.subtle.exportKey("raw", publicKey);
  const digest = await crypto.subtle.digest("SHA-256", raw);
  return toBase64Url(new Uint8Array(digest));
}

function normalizePublicJwk(jwk) {
  return {
    kty: jwk?.kty,
    crv: jwk?.crv,
    x: jwk?.x,
  };
}

async function generateDeviceKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"]
  );
  const [privateKeyJwk, publicKeyJwk] = await Promise.all([
    crypto.subtle.exportKey("jwk", keyPair.privateKey),
    crypto.subtle.exportKey("jwk", keyPair.publicKey),
  ]);
  const normalizedPublicJwk = normalizePublicJwk(publicKeyJwk);
  return {
    privateKeyJwk,
    publicKeyJwk: normalizedPublicJwk,
    keyFingerprint: await publicKeyFingerprintFromJwk(normalizedPublicJwk),
    createdAt: new Date().toISOString(),
  };
}

async function signChallengePayload(privateKeyJwk, payload) {
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    privateKeyJwk,
    { name: "Ed25519" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("Ed25519", privateKey, new TextEncoder().encode(payload));
  return toBase64Url(new Uint8Array(signature));
}

function isSessionFresh(session) {
  if (!session?.token || !session?.expiresAt) return false;
  const expiresAt = Date.parse(session.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt - Date.now() > EXPIRY_SKEW_MS;
}

async function ensureNativeProtectedIdentitySupport() {
  const status = await getSecretStorageStatus();
  if (!status?.canPersistSecrets) {
    throw new Error(
      status?.message ||
        "Protected finance features require the native iPhone app with secure device storage."
    );
  }
}

async function loadStoredSession() {
  if (isSessionFresh(inMemorySession)) return inMemorySession;
  const status = await getSecretStorageStatus().catch(() => null);
  if (!status?.canPersistSecrets) {
    return null;
  }
  const stored = await getSecureItem(SESSION_KEY).catch(() => null);
  if (isSessionFresh(stored)) {
    inMemorySession = stored;
    return stored;
  }
  return null;
}

async function persistSession(session) {
  inMemorySession = session;
  const saved = await setSecureItem(SESSION_KEY, session).catch(() => false);
  if (!saved) {
    throw new Error("Identity session could not be persisted securely");
  }
}

async function loadStoredKeyPair() {
  const keyPair = await getSecureItem(DEVICE_KEYPAIR_KEY).catch(() => null);
  if (!keyPair?.privateKeyJwk || !keyPair?.publicKeyJwk) return null;
  return {
    ...keyPair,
    publicKeyJwk: normalizePublicJwk(keyPair.publicKeyJwk),
    keyFingerprint:
      keyPair.keyFingerprint || await publicKeyFingerprintFromJwk(normalizePublicJwk(keyPair.publicKeyJwk)),
  };
}

async function persistKeyPair(keyPair) {
  const saved = await setSecureItem(DEVICE_KEYPAIR_KEY, keyPair).catch(() => false);
  if (!saved) {
    throw new Error("Device identity key could not be persisted securely");
  }
}

async function getOrCreateDeviceKeyPair() {
  if (inflightKeypairPromise) {
    return inflightKeypairPromise;
  }

  inflightKeypairPromise = (async () => {
    const existing = await loadStoredKeyPair();
    if (existing) {
      return existing;
    }
    const generated = await generateDeviceKeyPair();
    await persistKeyPair(generated);
    return generated;
  })().finally(() => {
    inflightKeypairPromise = null;
  });

  return inflightKeypairPromise;
}

export async function clearIdentitySession() {
  inMemorySession = null;
  await deleteSecureItem(SESSION_KEY).catch(() => false);
}

export async function clearDeviceIdentityKeyPair() {
  await clearIdentitySession().catch(() => false);
  await deleteSecureItem(DEVICE_KEYPAIR_KEY).catch(() => false);
}

async function buildBootstrapHeaders() {
  const headers = {
    "Content-Type": "application/json",
    "X-App-Version": APP_VERSION,
  };
  const revenueCatAppUserId = await Promise.race([
    getRevenueCatAppUserId().catch(() => null),
    new Promise(resolve => setTimeout(() => resolve(null), IDENTITY_REVENUECAT_TIMEOUT_MS)),
  ]);
  if (revenueCatAppUserId) {
    headers["X-RC-App-User-ID"] = revenueCatAppUserId;
  }
  return headers;
}

async function getStoredLegacyDeviceId() {
  try {
    const deviceId = await db.get("device-id");
    return typeof deviceId === "string" ? deviceId : "";
  } catch {
    return "";
  }
}

async function requestIdentityChallenge(keyPair, legacyDeviceId) {
  const response = await fetchWithRetry(`${getBackendUrl()}/auth/challenge`, {
    method: "POST",
    headers: await buildBootstrapHeaders(),
    body: JSON.stringify({
      intent: "bootstrap",
      publicKeyJwk: keyPair.publicKeyJwk,
      legacyDeviceId,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `Identity challenge failed: HTTP ${response.status}`);
  }
  if (!payload?.challengeId || !payload?.nonce || !payload?.signingPayload) {
    throw new Error("Identity challenge response was incomplete");
  }
  return payload;
}

async function exchangeChallengeForSession(keyPair, challenge, legacyDeviceId) {
  const signature = await signChallengePayload(keyPair.privateKeyJwk, challenge.signingPayload);
  const response = await fetchWithRetry(`${getBackendUrl()}/auth/session`, {
    method: "POST",
    headers: await buildBootstrapHeaders(),
    body: JSON.stringify({
      challengeId: challenge.challengeId,
      nonce: challenge.nonce,
      publicKeyJwk: keyPair.publicKeyJwk,
      signature,
      legacyDeviceId,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `Identity session failed: HTTP ${response.status}`);
  }
  if (!payload?.token || !payload?.expiresAt) {
    throw new Error("Identity session response was incomplete");
  }
  return payload;
}

async function fetchIdentitySession() {
  await ensureNativeProtectedIdentitySupport();
  const [keyPair, storedLegacyDeviceId] = await Promise.all([
    getOrCreateDeviceKeyPair(),
    getStoredLegacyDeviceId(),
  ]);

  const bootstrapWithLegacyAlias = async legacyDeviceId => {
    const challenge = await requestIdentityChallenge(keyPair, legacyDeviceId);
    const session = await exchangeChallengeForSession(keyPair, challenge, legacyDeviceId);
    await persistSession(session);
    return session;
  };

  const legacyDeviceId = legacyBootstrapAliasRejected ? "" : storedLegacyDeviceId;
  try {
    return await bootstrapWithLegacyAlias(legacyDeviceId);
  } catch (error) {
    const message = String(error?.message || "");
    if (legacyDeviceId && message.includes("identity_proof_required")) {
      legacyBootstrapAliasRejected = true;
      log.warn("identity-session", "Legacy device alias rejected during bootstrap; retrying without alias");
      return bootstrapWithLegacyAlias("");
    }
    throw error;
  }
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
    .catch((error) => {
      log.warn("identity-session", "Identity bootstrap failed", {
        message: error?.message || String(error),
        platform: Capacitor.getPlatform(),
      });
      throw error;
    })
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

export async function rotateDeviceIdentityKey() {
  await ensureNativeProtectedIdentitySupport();
  const currentSession = await getIdentitySession();
  const currentKeyPair = await getOrCreateDeviceKeyPair();
  const nextKeyPair = await generateDeviceKeyPair();

  const challengeResponse = await fetchWithRetry(`${getBackendUrl()}/auth/challenge`, {
    method: "POST",
    headers: {
      ...(await buildBootstrapHeaders()),
      Authorization: `Bearer ${currentSession.token}`,
    },
    body: JSON.stringify({
      intent: "rotate",
      publicKeyJwk: currentKeyPair.publicKeyJwk,
      nextPublicKeyJwk: nextKeyPair.publicKeyJwk,
    }),
  });

  const challenge = await challengeResponse.json().catch(() => ({}));
  if (!challengeResponse.ok) {
    throw new Error(challenge?.error || `Identity rotation challenge failed: HTTP ${challengeResponse.status}`);
  }

  const [currentSignature, nextSignature] = await Promise.all([
    signChallengePayload(currentKeyPair.privateKeyJwk, challenge.signingPayload),
    signChallengePayload(nextKeyPair.privateKeyJwk, challenge.signingPayload),
  ]);

  const sessionResponse = await fetchWithRetry(`${getBackendUrl()}/auth/session`, {
    method: "POST",
    headers: {
      ...(await buildBootstrapHeaders()),
      Authorization: `Bearer ${currentSession.token}`,
    },
    body: JSON.stringify({
      intent: "rotate",
      challengeId: challenge.challengeId,
      nonce: challenge.nonce,
      currentSignature,
      nextPublicKeyJwk: nextKeyPair.publicKeyJwk,
      nextSignature,
    }),
  });

  const session = await sessionResponse.json().catch(() => ({}));
  if (!sessionResponse.ok) {
    throw new Error(session?.error || `Identity rotation failed: HTTP ${sessionResponse.status}`);
  }

  await persistKeyPair(nextKeyPair);
  await persistSession(session);
  return session;
}
