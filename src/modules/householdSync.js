import { normalizeAppError } from "./appErrors.js";
import { getBackendUrl } from "./backendUrl.js";
import { decrypt, encrypt } from "./crypto.js";
import { buildIdentityHeaders } from "./identitySession.js";
import { log } from "./logger.js";
import { isSecuritySensitiveKey, sanitizePlaidForBackup } from "./securityKeys.js";
import { db } from "./utils.js";

const WORKER_URL = () => `${getBackendUrl()}/api/household/sync`;
const HOUSEHOLD_SYNC_VERSION_KEY = "household-sync-version";
const HOUSEHOLD_LAST_SYNC_TS_KEY = "household-last-sync-ts";
const HOUSEHOLD_SYNC_EXCLUDED_KEYS = new Set([
  "household-id",
  "household-passcode",
  "household-id-protected",
  "household-passcode-protected",
  HOUSEHOLD_SYNC_VERSION_KEY,
  HOUSEHOLD_LAST_SYNC_TS_KEY,
]);

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex) {
  if (typeof hex !== "string" || hex.length === 0 || hex.length % 2 !== 0) return new Uint8Array();
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

async function sha256Hex(value) {
  const encoded = new TextEncoder().encode(String(value || ""));
  return toHex(await crypto.subtle.digest("SHA-256", encoded));
}

function serializeSignedEnvelope({ householdId, encryptedBlob, version, requestId }) {
  return JSON.stringify({
    householdId,
    version,
    requestId,
    encryptedBlob,
  });
}

async function deriveHouseholdAuthToken(householdId, passcode) {
  return sha256Hex(`household-auth-v1:${String(householdId || "").trim()}:${String(passcode || "").trim()}`);
}

async function buildIntegrityTag(authToken, envelope) {
  const keyBytes = fromHex(authToken);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(serializeSignedEnvelope(envelope))
  );
  return toHex(signature);
}

async function getNextHouseholdVersion() {
  const currentVersion = Number((await db.get(HOUSEHOLD_SYNC_VERSION_KEY)) || 0);
  return Number.isFinite(currentVersion) ? currentVersion + 1 : 1;
}

function buildSyncPayload() {
  return { data: {}, timestamp: Date.now() };
}

async function collectSyncPayload() {
  const payload = buildSyncPayload();
  const keys = await db.keys();

  for (const key of keys) {
    if (isSecuritySensitiveKey(key) || HOUSEHOLD_SYNC_EXCLUDED_KEYS.has(key)) continue;
    const val = await db.get(key);
    if (val !== null) payload.data[key] = val;
  }

  const plaidConns = await db.get("plaid-connections");
  if (Array.isArray(plaidConns) && plaidConns.length > 0) {
    payload.data["plaid-connections-sanitized"] = sanitizePlaidForBackup(plaidConns);
  }

  return payload;
}

async function postHouseholdRequest(body) {
  const response = await fetch(WORKER_URL(), {
    method: "POST",
    headers: await buildIdentityHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  }).catch(() => null);

  if (!response) {
    return {
      ok: false,
      status: 0,
      error: "network_error",
      message: "Household sync is unavailable right now.",
    };
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: payload?.error || "sync_failed",
      message: payload?.message || "Household sync failed.",
      details: payload || null,
    };
  }

  return {
    ok: true,
    status: response.status,
    data: payload || {},
  };
}

export async function pushHouseholdSync(householdId, passcode) {
  const normalizedId = String(householdId || "").trim();
  const normalizedPasscode = String(passcode || "").trim();
  if (!normalizedId || !normalizedPasscode) {
    return { ok: false, error: "missing_credentials", message: "Household sync credentials are missing." };
  }

  try {
    const version = await getNextHouseholdVersion();
    const payload = await collectSyncPayload();
    payload.version = version;

    const encryptedBlob = await encrypt(JSON.stringify(payload), normalizedPasscode);
    const requestId = crypto.randomUUID();
    const authToken = await deriveHouseholdAuthToken(normalizedId, normalizedPasscode);
    const integrityTag = await buildIntegrityTag(authToken, {
      householdId: normalizedId,
      encryptedBlob,
      version,
      requestId,
    });

    const result = await postHouseholdRequest({
      action: "push",
      householdId: normalizedId,
      authToken,
      encryptedBlob,
      integrityTag,
      version,
      requestId,
    });

    if (!result.ok) {
      if (result.error === "stale_version" && Number.isFinite(result.details?.currentVersion)) {
        await db.set(HOUSEHOLD_SYNC_VERSION_KEY, Number(result.details.currentVersion));
      }
      return result;
    }

    await Promise.all([
      db.set(HOUSEHOLD_LAST_SYNC_TS_KEY, payload.timestamp),
      db.set(HOUSEHOLD_SYNC_VERSION_KEY, version),
    ]);

    return {
      ok: true,
      version,
      timestamp: payload.timestamp,
    };
  } catch (err) {
    const failure = normalizeAppError(err, { context: "sync" });
    log.error("household-sync", "pushHouseholdSync failed", { error: failure.rawMessage, kind: failure.kind });
    return {
      ok: false,
      error: "sync_failed",
      message: failure.userMessage || "Household sync failed.",
    };
  }
}

export async function pullHouseholdSync(householdId, passcode) {
  const normalizedId = String(householdId || "").trim();
  const normalizedPasscode = String(passcode || "").trim();
  if (!normalizedId || !normalizedPasscode) {
    return { ok: false, error: "missing_credentials", message: "Household sync credentials are missing." };
  }

  try {
    const authToken = await deriveHouseholdAuthToken(normalizedId, normalizedPasscode);
    const result = await postHouseholdRequest({
      action: "fetch",
      householdId: normalizedId,
      authToken,
    });

    if (!result.ok) return result;
    if (!result.data?.hasData || !result.data?.encryptedBlob) {
      return { ok: true, hasData: false };
    }

    const version = Number(result.data.version || 0);
    const integrityTag = await buildIntegrityTag(authToken, {
      householdId: normalizedId,
      encryptedBlob: result.data.encryptedBlob,
      version,
      requestId: result.data.requestId || "",
    });

    if (integrityTag !== result.data.integrityTag) {
      return {
        ok: false,
        error: "integrity_check_failed",
        message: "Household data failed integrity verification.",
      };
    }

    const decryptedStr = await decrypt(result.data.encryptedBlob, normalizedPasscode);
    return {
      ok: true,
      hasData: true,
      payload: JSON.parse(decryptedStr),
      version,
      lastUpdatedAt: result.data.lastUpdatedAt || null,
    };
  } catch (err) {
    const failure = normalizeAppError(err, { context: "sync" });
    log.error("household-sync", "pullHouseholdSync failed", { error: failure.rawMessage, kind: failure.kind });
    return {
      ok: false,
      error: "sync_failed",
      message: failure.userMessage || "Household sync failed.",
    };
  }
}

export async function mergeHouseholdState(remotePayload, remoteVersion = 0) {
  if (!remotePayload || !remotePayload.data) return false;

  const remoteData = remotePayload.data;
  const remoteTs = remotePayload.timestamp || 0;

  const [localTsStr, localVersionStr] = await Promise.all([
    db.get(HOUSEHOLD_LAST_SYNC_TS_KEY),
    db.get(HOUSEHOLD_SYNC_VERSION_KEY),
  ]);
  const localTs = localTsStr ? Number(localTsStr) : 0;
  const localVersion = localVersionStr ? Number(localVersionStr) : 0;

  if (remoteVersion && localVersion && remoteVersion < localVersion) return false;
  if (remoteTs <= localTs && (!remoteVersion || remoteVersion <= localVersion)) {
    return false;
  }

  for (const [key, remoteVal] of Object.entries(remoteData)) {
    await db.set(key, remoteVal);
  }

  await Promise.all([
    db.set(HOUSEHOLD_LAST_SYNC_TS_KEY, remoteTs),
    db.set(HOUSEHOLD_SYNC_VERSION_KEY, remoteVersion || localVersion),
  ]);
  return true;
}
