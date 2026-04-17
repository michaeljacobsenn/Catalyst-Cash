import { normalizeAppError } from "./appErrors.js";
import { buildBackupPayload, restoreBackupPayload } from "./backup.js";
import { getBackendUrl } from "./backendUrl.js";
import { decrypt, encrypt } from "./crypto.js";
import { trackSupportEvent } from "./funnelAnalytics.js";
import { buildIdentityHeaders, getIdentitySession } from "./identitySession.js";
import { log } from "./logger.js";
import { deleteSecureItem, getSecretStorageStatus, getSecureItem, setSecureItem } from "./secureStore.js";
import { db } from "./utils.js";

const RECOVERY_VAULT_URL = () => `${getBackendUrl()}/api/recovery-vault`;
const RECOVERY_VAULT_LINKED_URL = () => `${getBackendUrl()}/api/recovery-vault/linked`;
const RECOVERY_VAULT_CONTINUITY_URL = () => `${getBackendUrl()}/api/recovery-vault/continuity`;
const RECOVERY_VAULT_TRUSTED_CONTINUITY_URL = () => `${getBackendUrl()}/api/recovery-vault/continuity/trusted`;
const RECOVERY_VAULT_ID_KEY = "recovery-vault-id";
const RECOVERY_VAULT_LAST_SYNC_TS_KEY = "recovery-vault-last-sync-ts";
const RECOVERY_VAULT_LAST_EXPORTED_AT_KEY = "recovery-vault-last-exported-at";
const RECOVERY_VAULT_LAST_ERROR_KEY = "recovery-vault-last-error";
const RECOVERY_VAULT_SECRET_KEY = "recovery-vault-secret";
const RECOVERY_VAULT_CONTINUITY_PASSPHRASE_KEY = "recovery-vault-continuity-passphrase";
const RECOVERY_VAULT_TRUSTED_CONTINUITY_ENABLED_KEY = "recovery-vault-trusted-continuity-enabled";
const RECOVERY_VAULT_KIND = "encrypted-vault";
const RECOVERY_VAULT_ID_PATTERN = /CC-[A-Z2-9-]{6,}/i;
const RECOVERY_VAULT_KEY_PATTERN = /[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3,}/i;

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function toSegmentedCode(bytes, segmentLength = 4) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const chars = [];
  for (const byte of bytes) {
    chars.push(alphabet[byte % alphabet.length]);
  }
  return chars
    .join("")
    .match(new RegExp(`.{1,${segmentLength}}`, "g"))
    ?.join("-") || "";
}

async function deriveRecoveryAuthToken(recoveryId, recoveryKey) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(recoveryKey || "").trim()),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new TextEncoder().encode(`recovery-vault:${String(recoveryId || "").trim()}`),
      iterations: 200000,
    },
    material,
    256
  );
  return toHex(bits);
}

function normalizeRecoveryId(recoveryId) {
  return String(recoveryId || "").trim().toUpperCase();
}

function normalizeRecoveryKey(recoveryKey) {
  return String(recoveryKey || "").trim().toUpperCase();
}

async function postRecoveryVault(body) {
  const response = await fetch(RECOVERY_VAULT_URL(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);

  if (!response) {
    throw new Error("Recovery Vault is unavailable right now.");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || "Recovery Vault request failed.");
  }
  return payload || {};
}

async function requestLinkedRecoveryVault({ method = "GET", recoveryId } = {}) {
  const headers = await buildIdentityHeaders(
    method === "GET" ? {} : { "Content-Type": "application/json" }
  );
  const response = await fetch(RECOVERY_VAULT_LINKED_URL(), {
    method,
    headers,
    ...(method === "POST" ? { body: JSON.stringify({ recoveryId }) } : {}),
  }).catch(() => null);

  if (!response) {
    throw new Error("Recovery Vault link is unavailable right now.");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || "Recovery Vault link request failed.");
  }
  return payload || {};
}

async function requestRecoveryVaultContinuity({ method = "GET", recoveryId, encryptedRecoveryKey } = {}) {
  const headers = await buildIdentityHeaders(
    method === "GET" ? {} : { "Content-Type": "application/json" }
  );
  const response = await fetch(RECOVERY_VAULT_CONTINUITY_URL(), {
    method,
    headers,
    ...(method === "POST" ? { body: JSON.stringify({ recoveryId, encryptedRecoveryKey }) } : {}),
  }).catch(() => null);

  if (!response) {
    throw new Error("Recovery Vault continuity is unavailable right now.");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || "Recovery Vault continuity request failed.");
  }
  return payload || {};
}

async function requestTrustedRecoveryVaultContinuity({ method = "GET", recoveryId, recoveryKey } = {}) {
  const headers = await buildIdentityHeaders(
    method === "GET" ? {} : { "Content-Type": "application/json" }
  );
  const response = await fetch(RECOVERY_VAULT_TRUSTED_CONTINUITY_URL(), {
    method,
    headers,
    ...(method === "POST" ? { body: JSON.stringify({ recoveryId, recoveryKey }) } : {}),
  }).catch(() => null);

  if (!response) {
    throw new Error("Seamless Recovery Vault restore is unavailable right now.");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || "Seamless Recovery Vault restore request failed.");
  }
  return payload || {};
}

export function generateRecoveryVaultId() {
  return `CC-${toSegmentedCode(crypto.getRandomValues(new Uint8Array(10)), 5)}`;
}

export function generateRecoveryVaultKey() {
  return toSegmentedCode(crypto.getRandomValues(new Uint8Array(20)), 4);
}

export async function getRecoveryVaultState() {
  const [recoveryId, lastSyncedAt, lastExportedAt, lastError] = await Promise.all([
    db.get(RECOVERY_VAULT_ID_KEY),
    db.get(RECOVERY_VAULT_LAST_SYNC_TS_KEY),
    db.get(RECOVERY_VAULT_LAST_EXPORTED_AT_KEY),
    db.get(RECOVERY_VAULT_LAST_ERROR_KEY),
  ]);
  return {
    recoveryId: typeof recoveryId === "string" ? recoveryId : "",
    lastSyncedAt: Number(lastSyncedAt) || null,
    lastExportedAt: typeof lastExportedAt === "string" ? lastExportedAt : null,
    lastError: typeof lastError === "string" ? lastError : null,
  };
}

export async function getStoredRecoveryVaultSecret() {
  return getSecureItem(RECOVERY_VAULT_SECRET_KEY).catch(() => null);
}

async function getStoredRecoveryVaultContinuityPassphrase() {
  return getSecureItem(RECOVERY_VAULT_CONTINUITY_PASSPHRASE_KEY).catch(() => null);
}

export async function getRecoveryVaultCredentials() {
  const [{ recoveryId }, recoveryKey] = await Promise.all([
    getRecoveryVaultState(),
    getStoredRecoveryVaultSecret(),
  ]);
  return {
    recoveryId: normalizeRecoveryId(recoveryId),
    recoveryKey: normalizeRecoveryKey(recoveryKey),
  };
}

export function formatRecoveryVaultKit({ recoveryId, recoveryKey } = {}) {
  const normalizedId = normalizeRecoveryId(recoveryId);
  const normalizedKey = normalizeRecoveryKey(recoveryKey);
  if (!normalizedId || !normalizedKey) return "";
  return [`Catalyst Cash Recovery Kit`, `Recovery Vault ID: ${normalizedId}`, `Recovery Key: ${normalizedKey}`].join("\n");
}

export function parseRecoveryVaultKit(input) {
  const source = String(input || "").trim().toUpperCase();
  if (!source) return null;

  const recoveryIdMatch = source.match(RECOVERY_VAULT_ID_PATTERN);
  const recoveryKeyMatch = source.match(RECOVERY_VAULT_KEY_PATTERN);
  const recoveryId = normalizeRecoveryId(recoveryIdMatch?.[0]);
  const recoveryKey = normalizeRecoveryKey(recoveryKeyMatch?.[0]);

  if (!recoveryId && !recoveryKey) return null;
  return {
    recoveryId,
    recoveryKey,
  };
}

export async function createRecoveryVaultCredentials() {
  const storageStatus = await getSecretStorageStatus().catch(() => null);
  if (!storageStatus?.canPersistSecrets) {
    throw new Error(storageStatus?.message || "Recovery Vault setup requires native secure storage.");
  }

  const recoveryId = generateRecoveryVaultId();
  const recoveryKey = generateRecoveryVaultKey();
  const saved = await setSecureItem(RECOVERY_VAULT_SECRET_KEY, recoveryKey).catch(() => false);
  if (!saved) {
    throw new Error("Recovery Vault key could not be saved securely.");
  }
  await Promise.all([
    db.set(RECOVERY_VAULT_ID_KEY, recoveryId),
    db.del?.(RECOVERY_VAULT_LAST_ERROR_KEY) || db.set(RECOVERY_VAULT_LAST_ERROR_KEY, null),
  ]);
  return { recoveryId, recoveryKey };
}

export async function clearRecoveryVaultCredentials() {
  await Promise.all([
    deleteSecureItem(RECOVERY_VAULT_SECRET_KEY).catch(() => false),
    deleteSecureItem(RECOVERY_VAULT_CONTINUITY_PASSPHRASE_KEY).catch(() => false),
    db.del?.(RECOVERY_VAULT_ID_KEY) || db.set(RECOVERY_VAULT_ID_KEY, null),
    db.del?.(RECOVERY_VAULT_LAST_SYNC_TS_KEY) || db.set(RECOVERY_VAULT_LAST_SYNC_TS_KEY, null),
    db.del?.(RECOVERY_VAULT_LAST_EXPORTED_AT_KEY) || db.set(RECOVERY_VAULT_LAST_EXPORTED_AT_KEY, null),
    db.del?.(RECOVERY_VAULT_LAST_ERROR_KEY) || db.set(RECOVERY_VAULT_LAST_ERROR_KEY, null),
    db.del?.(RECOVERY_VAULT_TRUSTED_CONTINUITY_ENABLED_KEY) || db.set(RECOVERY_VAULT_TRUSTED_CONTINUITY_ENABLED_KEY, null),
  ]);
}

async function getConfiguredRecoveryVaultCredentials() {
  const [state, secret] = await Promise.all([getRecoveryVaultState(), getStoredRecoveryVaultSecret()]);
  return {
    recoveryId: state.recoveryId,
    recoveryKey: typeof secret === "string" ? secret : "",
  };
}

function normalizeContinuityPassphrase(passphrase) {
  return String(passphrase || "").trim();
}

function validateContinuityPassphrase(passphrase) {
  const normalized = normalizeContinuityPassphrase(passphrase);
  if (normalized.length < 10) {
    throw new Error("Use at least 10 characters for the account sync passphrase.");
  }
  return normalized;
}

async function buildRecoveryVaultContinuityEnvelope(passphrase, recoveryKey) {
  const session = await getIdentitySession();
  const actorId = String(session?.actorId || "").trim();
  if (!actorId) {
    throw new Error("Protected identity is required for account-backed sync.");
  }
  return encrypt(normalizeRecoveryKey(recoveryKey), `${actorId}:${validateContinuityPassphrase(passphrase)}`);
}

async function decryptRecoveryVaultContinuityEnvelope(passphrase, encryptedRecoveryKey) {
  const session = await getIdentitySession();
  const actorId = String(session?.actorId || "").trim();
  if (!actorId) {
    throw new Error("Protected identity is required for account-backed restore.");
  }
  const plaintext = await decrypt(encryptedRecoveryKey, `${actorId}:${validateContinuityPassphrase(passphrase)}`);
  return normalizeRecoveryKey(plaintext);
}

async function syncRecoveryVaultContinuityEscrow(passphrase, recoveryId, recoveryKey) {
  const normalizedId = normalizeRecoveryId(recoveryId);
  const normalizedKey = normalizeRecoveryKey(recoveryKey);
  if (!normalizedId || !normalizedKey) {
    throw new Error("Recovery Vault credentials are missing.");
  }
  const encryptedRecoveryKey = await buildRecoveryVaultContinuityEnvelope(passphrase, normalizedKey);
  const payload = await requestRecoveryVaultContinuity({
    method: "POST",
    recoveryId: normalizedId,
    encryptedRecoveryKey,
  });
  return {
    recoveryId: normalizeRecoveryId(payload?.recoveryId || normalizedId),
    hasEscrow: Boolean(payload?.hasEscrow ?? true),
  };
}

/**
 * @param {{
 *   recoveryId?: string;
 *   recoveryKey?: string;
 *   personalRules?: string;
 * }} [options]
 */
export async function pushRecoveryVault({
  recoveryId,
  recoveryKey,
  personalRules = "",
} = {}) {
  const normalizedId = normalizeRecoveryId(recoveryId);
  const normalizedKey = normalizeRecoveryKey(recoveryKey);
  if (!normalizedId || !normalizedKey) {
    throw new Error("Recovery Vault credentials are missing.");
  }

  const backup = await buildBackupPayload({ personalRules });
  const exportedAt = backup.exportedAt || new Date().toISOString();
  const encryptedBlob = await encrypt(JSON.stringify(backup), normalizedKey);
  const authToken = await deriveRecoveryAuthToken(normalizedId, normalizedKey);
  const payload = await postRecoveryVault({
    action: "push",
    recoveryId: normalizedId,
    authToken,
    encryptedBlob,
    exportedAt,
    backupKind: RECOVERY_VAULT_KIND,
  });

  const now = Date.now();
  await Promise.all([
    db.set(RECOVERY_VAULT_ID_KEY, normalizedId),
    db.set(RECOVERY_VAULT_LAST_SYNC_TS_KEY, now),
    db.set(RECOVERY_VAULT_LAST_EXPORTED_AT_KEY, exportedAt),
    db.del?.(RECOVERY_VAULT_LAST_ERROR_KEY) || db.set(RECOVERY_VAULT_LAST_ERROR_KEY, null),
  ]);
  void linkRecoveryVaultToIdentity(normalizedId).catch((error) => {
    log.warn("recovery-vault", "Recovery Vault identity link failed", {
      error: error?.message || String(error),
    });
  });
  void getStoredRecoveryVaultContinuityPassphrase()
    .then((continuityPassphrase) => {
      if (!continuityPassphrase) return null;
      return syncRecoveryVaultContinuityEscrow(continuityPassphrase, normalizedId, normalizedKey);
    })
    .catch((error) => {
      log.warn("recovery-vault", "Recovery Vault continuity sync failed", {
        error: error?.message || String(error),
      });
    });
  void db.get(RECOVERY_VAULT_TRUSTED_CONTINUITY_ENABLED_KEY)
    .then((trustedContinuityEnabled) => {
      if (!trustedContinuityEnabled) return null;
      return syncTrustedRecoveryVaultContinuity(normalizedId, normalizedKey);
    })
    .catch((error) => {
      log.warn("recovery-vault", "Trusted Recovery Vault continuity sync failed", {
        error: error?.message || String(error),
      });
    });
  return {
    ok: true,
    syncedAt: now,
    exportedAt,
    backupKind: payload?.backupKind || RECOVERY_VAULT_KIND,
  };
}

export async function syncConfiguredRecoveryVault(personalRules = "") {
  const { recoveryId, recoveryKey } = await getConfiguredRecoveryVaultCredentials();
  return pushRecoveryVault({ recoveryId, recoveryKey, personalRules });
}

export async function fetchRecoveryVaultBackup(recoveryId, recoveryKey) {
  const normalizedId = normalizeRecoveryId(recoveryId);
  const normalizedKey = normalizeRecoveryKey(recoveryKey);
  if (!normalizedId || !normalizedKey) {
    throw new Error("Recovery Vault ID and key are required.");
  }

  const authToken = await deriveRecoveryAuthToken(normalizedId, normalizedKey);
  const payload = await postRecoveryVault({
    action: "fetch",
    recoveryId: normalizedId,
    authToken,
  });
  if (!payload?.hasData || !payload?.encryptedBlob) {
    throw new Error("No Recovery Vault backup was found for those credentials.");
  }

  const encryptedBlob =
    typeof payload.encryptedBlob === "string"
      ? JSON.parse(payload.encryptedBlob)
      : payload.encryptedBlob;
  const plaintext = await decrypt(encryptedBlob, normalizedKey);
  return JSON.parse(plaintext);
}

export async function restoreRecoveryVaultBackup(recoveryId, recoveryKey) {
  const backup = await fetchRecoveryVaultBackup(recoveryId, recoveryKey);
  return restoreBackupPayload(backup);
}

export async function deleteRecoveryVault(recoveryId, recoveryKey) {
  const normalizedId = normalizeRecoveryId(recoveryId);
  const normalizedKey = normalizeRecoveryKey(recoveryKey);
  if (!normalizedId || !normalizedKey) {
    throw new Error("Recovery Vault credentials are missing.");
  }
  const authToken = await deriveRecoveryAuthToken(normalizedId, normalizedKey);
  await postRecoveryVault({
    action: "delete",
    recoveryId: normalizedId,
    authToken,
  });
  void unlinkRecoveryVaultFromIdentity().catch((error) => {
    log.warn("recovery-vault", "Recovery Vault identity unlink failed", {
      error: error?.message || String(error),
    });
  });
  void clearRecoveryVaultContinuityPassphrase().catch((error) => {
    log.warn("recovery-vault", "Recovery Vault continuity unlink failed", {
      error: error?.message || String(error),
    });
  });
  void clearTrustedRecoveryVaultContinuity().catch((error) => {
    log.warn("recovery-vault", "Trusted Recovery Vault continuity unlink failed", {
      error: error?.message || String(error),
    });
  });
}

export async function rotateRecoveryVaultCredentials(personalRules = "") {
  const current = await getConfiguredRecoveryVaultCredentials();
  if (current.recoveryId && current.recoveryKey) {
    await deleteRecoveryVault(current.recoveryId, current.recoveryKey).catch(() => {});
  }
  const next = await createRecoveryVaultCredentials();
  await pushRecoveryVault({ ...next, personalRules });
  return next;
}

export async function rememberRecoveryVaultRestore(recoveryId) {
  await db.set(RECOVERY_VAULT_ID_KEY, normalizeRecoveryId(recoveryId));
}

export async function linkRecoveryVaultToIdentity(recoveryId) {
  const normalizedId = normalizeRecoveryId(recoveryId);
  if (!normalizedId) {
    throw new Error("Recovery Vault ID is required.");
  }
  const payload = await requestLinkedRecoveryVault({
    method: "POST",
    recoveryId: normalizedId,
  });
  return normalizeRecoveryId(payload?.recoveryId || normalizedId);
}

export async function getLinkedRecoveryVaultId() {
  const payload = await requestLinkedRecoveryVault({ method: "GET" });
  return normalizeRecoveryId(payload?.recoveryId);
}

export async function unlinkRecoveryVaultFromIdentity() {
  await requestLinkedRecoveryVault({ method: "DELETE" });
}

export async function getRecoveryVaultContinuityState() {
  const [payload, trustedPayload, storedPassphrase] = await Promise.all([
    requestRecoveryVaultContinuity({ method: "GET" }).catch(() => ({})),
    requestTrustedRecoveryVaultContinuity({ method: "GET" }).catch(() => ({})),
    getStoredRecoveryVaultContinuityPassphrase(),
  ]);
  return {
    recoveryId: normalizeRecoveryId(payload?.recoveryId),
    hasEscrow: Boolean(payload?.hasEscrow),
    hasStoredPassphrase: Boolean(storedPassphrase),
    trustedRecoveryId: normalizeRecoveryId(trustedPayload?.recoveryId),
    hasTrustedEscrow: Boolean(trustedPayload?.hasTrustedEscrow),
  };
}

export async function enableRecoveryVaultContinuity(passphrase, recoveryId, recoveryKey) {
  const normalizedPassphrase = validateContinuityPassphrase(passphrase);
  const continuity = await syncRecoveryVaultContinuityEscrow(normalizedPassphrase, recoveryId, recoveryKey);
  const saved = await setSecureItem(RECOVERY_VAULT_CONTINUITY_PASSPHRASE_KEY, normalizedPassphrase).catch(() => false);
  if (!saved) {
    throw new Error("Account sync passphrase could not be saved securely on this device.");
  }
  return continuity;
}

export async function clearRecoveryVaultContinuityPassphrase() {
  await Promise.all([
    deleteSecureItem(RECOVERY_VAULT_CONTINUITY_PASSPHRASE_KEY).catch(() => false),
    requestRecoveryVaultContinuity({ method: "DELETE" }).catch(() => ({})),
  ]);
}

async function syncTrustedRecoveryVaultContinuity(recoveryId, recoveryKey) {
  const normalizedId = normalizeRecoveryId(recoveryId);
  const normalizedKey = normalizeRecoveryKey(recoveryKey);
  if (!normalizedId || !normalizedKey) {
    throw new Error("Recovery Vault credentials are missing.");
  }
  const payload = await requestTrustedRecoveryVaultContinuity({
    method: "POST",
    recoveryId: normalizedId,
    recoveryKey: normalizedKey,
  });
  await db.set(RECOVERY_VAULT_TRUSTED_CONTINUITY_ENABLED_KEY, true);
  return {
    recoveryId: normalizeRecoveryId(payload?.recoveryId || normalizedId),
    hasTrustedEscrow: Boolean(payload?.hasTrustedEscrow ?? true),
  };
}

export async function enableTrustedRecoveryVaultContinuity(recoveryId, recoveryKey) {
  return syncTrustedRecoveryVaultContinuity(recoveryId, recoveryKey);
}

export async function clearTrustedRecoveryVaultContinuity() {
  await Promise.all([
    requestTrustedRecoveryVaultContinuity({ method: "DELETE" }).catch(() => ({})),
    db.del?.(RECOVERY_VAULT_TRUSTED_CONTINUITY_ENABLED_KEY) || db.set(RECOVERY_VAULT_TRUSTED_CONTINUITY_ENABLED_KEY, null),
  ]);
}

export async function restoreRecoveryVaultFromContinuity(passphrase) {
  const normalizedPassphrase = validateContinuityPassphrase(passphrase);
  const continuity = await requestRecoveryVaultContinuity({ method: "GET" });
  const recoveryId = normalizeRecoveryId(continuity?.recoveryId);
  const encryptedRecoveryKey = continuity?.encryptedRecoveryKey;
  if (!recoveryId || !encryptedRecoveryKey) {
    throw new Error("No account-backed Recovery Vault sync was found for this identity.");
  }

  const parsedEnvelope =
    typeof encryptedRecoveryKey === "string"
      ? JSON.parse(encryptedRecoveryKey)
      : encryptedRecoveryKey;
  const recoveryKey = await decryptRecoveryVaultContinuityEnvelope(normalizedPassphrase, parsedEnvelope);
  return {
    recoveryId,
    recoveryKey,
    backup: await fetchRecoveryVaultBackup(recoveryId, recoveryKey),
  };
}

export async function restoreRecoveryVaultFromTrustedContinuity() {
  const trustedContinuity = await requestTrustedRecoveryVaultContinuity({ method: "GET" });
  const recoveryId = normalizeRecoveryId(trustedContinuity?.recoveryId);
  const recoveryKey = normalizeRecoveryKey(trustedContinuity?.trustedRecoveryKey);
  if (!recoveryId || !recoveryKey) {
    throw new Error("No seamless Recovery Vault restore was found for this identity.");
  }
  return {
    recoveryId,
    recoveryKey,
    backup: await fetchRecoveryVaultBackup(recoveryId, recoveryKey),
  };
}

export async function recordRecoveryVaultFailure(error, options = {}) {
  const eventName = options?.eventName || "vault_sync_failed";
  const context = options?.context || {};
  const failure = normalizeAppError(error, { context: "restore" });
  await db.set(RECOVERY_VAULT_LAST_ERROR_KEY, failure.userMessage || failure.rawMessage || "Recovery Vault failed.");
  void trackSupportEvent(eventName, {
    kind: failure.kind,
    ...context,
  });
  log.warn("recovery-vault", "Recovery Vault request failed", {
    error: failure.rawMessage,
    kind: failure.kind,
  });
  return failure;
}
