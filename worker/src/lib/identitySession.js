const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SESSION_VERSION = 2;
const CHALLENGE_VERSION = 1;
const DEFAULT_SESSION_TTL_SECONDS = 60 * 30;
const DEFAULT_CHALLENGE_TTL_SECONDS = 60 * 5;
const IDENTITY_AUDIENCE = "catalystcash-identity-v2";

function ensureSigningSecret(env) {
  const secret = String(env.IDENTITY_SESSION_SECRET || "").trim();
  if (!secret) {
    throw new Error("IDENTITY_SESSION_SECRET is not configured");
  }
  return secret;
}

function nowEpochSeconds() {
  return Math.floor(Date.now() / 1000);
}

function toBase64Url(bytes) {
  const base64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(bytes).toString("base64")
      : btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary =
    typeof Buffer !== "undefined"
      ? Buffer.from(padded, "base64").toString("binary")
      : atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function importSigningKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function hmacBase64Url(secret, message) {
  const key = await importSigningKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return toBase64Url(new Uint8Array(signature));
}

function canonicalizePublicJwk(jwk) {
  if (!jwk || typeof jwk !== "object") {
    throw new Error("identity_public_key_missing");
  }
  const canonical = {
    kty: jwk.kty,
    crv: jwk.crv,
    x: jwk.x,
  };
  if (canonical.kty !== "OKP" || canonical.crv !== "Ed25519" || !canonical.x) {
    throw new Error("identity_public_key_invalid");
  }
  return canonical;
}

async function importPublicKeyJwk(jwk) {
  return crypto.subtle.importKey(
    "jwk",
    canonicalizePublicJwk(jwk),
    { name: "Ed25519" },
    true,
    ["verify"]
  );
}

async function publicKeyFingerprintFromJwk(jwk) {
  const publicKey = await importPublicKeyJwk(jwk);
  const rawKey = await crypto.subtle.exportKey("raw", publicKey);
  const digest = await crypto.subtle.digest("SHA-256", rawKey);
  return toBase64Url(new Uint8Array(digest));
}

function buildChallengeMessage({
  challengeId,
  nonce,
  intent,
  keyFingerprint,
  nextKeyFingerprint = "",
}) {
  return JSON.stringify({
    v: CHALLENGE_VERSION,
    aud: IDENTITY_AUDIENCE,
    challengeId,
    nonce,
    intent,
    keyFingerprint,
    nextKeyFingerprint,
  });
}

async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(String(value || "")));
  return toBase64Url(new Uint8Array(digest));
}

export async function hashIdentityAlias(aliasType, aliasValue, env) {
  const secret = ensureSigningSecret(env);
  return hmacBase64Url(secret, `alias:${aliasType}:${String(aliasValue || "").trim()}`);
}

function parseSessionTtlSeconds(env) {
  const raw = Number(env.IDENTITY_SESSION_TTL_SECONDS || DEFAULT_SESSION_TTL_SECONDS);
  return Number.isFinite(raw) && raw > 60 ? Math.floor(raw) : DEFAULT_SESSION_TTL_SECONDS;
}

function parseChallengeTtlSeconds(env) {
  const raw = Number(env.IDENTITY_CHALLENGE_TTL_SECONDS || DEFAULT_CHALLENGE_TTL_SECONDS);
  return Number.isFinite(raw) && raw >= 60 ? Math.floor(raw) : DEFAULT_CHALLENGE_TTL_SECONDS;
}

export async function issueIdentitySessionToken(actor, keyFingerprint, env) {
  const secret = ensureSigningSecret(env);
  const now = nowEpochSeconds();
  const exp = now + parseSessionTtlSeconds(env);
  const payload = {
    v: SESSION_VERSION,
    actorId: actor.actorId,
    source: actor.source || "device-key",
    revenueCatAppUserId: actor.revenueCatAppUserId || null,
    keyFingerprint: keyFingerprint || actor.activeDeviceKeyFingerprint || null,
    sessionVersion: Number(actor.sessionVersion || 1),
    iat: now,
    exp,
  };
  const encodedPayload = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await hmacBase64Url(secret, `ccid.${encodedPayload}`);
  return {
    token: `ccid.${encodedPayload}.${signature}`,
    expiresAt: new Date(exp * 1000).toISOString(),
    actorId: actor.actorId,
    keyFingerprint: payload.keyFingerprint,
  };
}

export async function verifyIdentitySessionToken(token, env) {
  if (!token || typeof token !== "string") return null;
  const secret = ensureSigningSecret(env);
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "ccid") return null;
  const [prefix, encodedPayload, signature] = parts;
  const expected = await hmacBase64Url(secret, `${prefix}.${encodedPayload}`);
  if (expected !== signature) return null;

  try {
    const payload = JSON.parse(decoder.decode(fromBase64Url(encodedPayload)));
    if (payload?.v !== SESSION_VERSION || !payload?.actorId || !payload?.keyFingerprint) return null;
    if (!Number.isFinite(Number(payload.sessionVersion || 0))) return null;
    const now = nowEpochSeconds();
    if (Number(payload.exp || 0) <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

export function readBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function randomActorId() {
  return `actor_${crypto.randomUUID().replace(/-/g, "")}`;
}

function randomChallengeId() {
  return `ich_${crypto.randomUUID().replace(/-/g, "")}`;
}

function randomNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toBase64Url(bytes);
}

async function selectResults(db, sql, params = []) {
  const response = await db.prepare(sql).bind(...params).all();
  return response?.results || [];
}

async function getActorByAlias(db, aliasType, aliasHash) {
  const results = await selectResults(
    db,
    `SELECT a.actor_id, a.revenuecat_app_user_id, a.session_version, a.active_device_key_fingerprint
       FROM identity_actor_aliases aliases
       JOIN identity_actors a ON a.actor_id = aliases.actor_id
      WHERE aliases.alias_type = ? AND aliases.alias_hash = ?`,
    [aliasType, aliasHash]
  );
  const actor = results[0] || null;
  return actor ? normalizeActorRow(actor) : null;
}

async function getActorAliasRows(db, actorId) {
  if (!actorId) return [];
  return selectResults(
    db,
    `SELECT alias_type, alias_hash
       FROM identity_actor_aliases
      WHERE actor_id = ?`,
    [actorId]
  );
}

async function getActorByRevenueCatUserId(db, revenueCatAppUserId) {
  if (!revenueCatAppUserId) return null;
  const results = await selectResults(
    db,
    "SELECT actor_id, revenuecat_app_user_id, session_version, active_device_key_fingerprint FROM identity_actors WHERE revenuecat_app_user_id = ?",
    [revenueCatAppUserId]
  );
  const actor = results[0] || null;
  return actor ? normalizeActorRow(actor) : null;
}

async function getActorById(db, actorId) {
  if (!actorId) return null;
  const results = await selectResults(
    db,
    "SELECT actor_id, revenuecat_app_user_id, session_version, active_device_key_fingerprint FROM identity_actors WHERE actor_id = ?",
    [actorId]
  );
  const actor = results[0] || null;
  return actor ? normalizeActorRow(actor) : null;
}

async function getDeviceKeyBinding(db, keyFingerprint) {
  if (!keyFingerprint) return null;
  const results = await selectResults(
    db,
    `SELECT key_fingerprint, actor_id, public_key_jwk, status, replaced_by_key_fingerprint
       FROM identity_device_keys
      WHERE key_fingerprint = ?`,
    [keyFingerprint]
  );
  return results[0] || null;
}

async function getChallengeRow(db, challengeId) {
  if (!challengeId) return null;
  const results = await selectResults(
    db,
    `SELECT challenge_id, nonce_hash, public_key_fingerprint, public_key_jwk,
            verified_revenuecat_app_user_id, legacy_device_alias_hash, intent,
            actor_id, current_key_fingerprint, next_key_fingerprint, next_public_key_jwk,
            expires_at, used_at
       FROM identity_bootstrap_challenges
      WHERE challenge_id = ?`,
    [challengeId]
  );
  return results[0] || null;
}

async function createActor(db, revenueCatAppUserId = null) {
  const actorId = randomActorId();
  await db.prepare(
    `INSERT INTO identity_actors (actor_id, revenuecat_app_user_id, session_version, active_device_key_fingerprint)
     VALUES (?, ?, 1, NULL)`
  ).bind(actorId, revenueCatAppUserId || null).run();
  return {
    actorId,
    revenueCatAppUserId: revenueCatAppUserId || null,
    sessionVersion: 1,
    activeDeviceKeyFingerprint: null,
  };
}

function normalizeActorRow(actor) {
  return {
    actorId: actor.actor_id,
    revenueCatAppUserId: actor.revenuecat_app_user_id || null,
    sessionVersion: Number(actor.session_version || 1),
    activeDeviceKeyFingerprint: actor.active_device_key_fingerprint || null,
  };
}

async function bindActorAlias(db, aliasType, aliasHash, actorId) {
  if (!aliasHash || !actorId) return;
  await db.prepare(
    `INSERT INTO identity_actor_aliases (alias_type, alias_hash, actor_id)
     VALUES (?, ?, ?)
     ON CONFLICT(alias_type, alias_hash) DO UPDATE SET actor_id = excluded.actor_id`
  ).bind(aliasType, aliasHash, actorId).run();
}

export async function bindIdentityAliasValue(db, env, actorId, aliasType, aliasValue) {
  if (!db || !actorId || !aliasType || !aliasValue) return;
  const aliasHash = await hashIdentityAlias(aliasType, aliasValue, env);
  await bindActorAlias(db, aliasType, aliasHash, actorId);
}

export async function resolveActorByIdentityAlias(db, env, aliasType, aliasValue) {
  if (!db || !aliasType || !aliasValue) return null;
  const aliasHash = await hashIdentityAlias(aliasType, aliasValue, env);
  return getActorByAlias(db, aliasType, aliasHash);
}

async function attachRevenueCatUser(db, actorId, revenueCatAppUserId) {
  if (!actorId || !revenueCatAppUserId) return;
  await db.prepare(
    `UPDATE identity_actors
        SET revenuecat_app_user_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE actor_id = ?`
  ).bind(revenueCatAppUserId, actorId).run();
}

async function storeDeviceKey(db, actorId, keyFingerprint, publicKeyJwk) {
  await db.prepare(
    `INSERT INTO identity_device_keys (key_fingerprint, actor_id, public_key_jwk, status)
     VALUES (?, ?, ?, 'active')
     ON CONFLICT(key_fingerprint) DO UPDATE SET
       actor_id = excluded.actor_id,
       public_key_jwk = excluded.public_key_jwk,
       status = 'active',
       updated_at = CURRENT_TIMESTAMP,
       revoked_at = NULL,
       replaced_by_key_fingerprint = NULL`
  ).bind(keyFingerprint, actorId, JSON.stringify(canonicalizePublicJwk(publicKeyJwk))).run();
  await db.prepare(
    `UPDATE identity_actors
        SET active_device_key_fingerprint = ?, updated_at = CURRENT_TIMESTAMP
      WHERE actor_id = ?`
  ).bind(keyFingerprint, actorId).run();
}

async function revokeDeviceKey(db, actorId, currentKeyFingerprint, nextKeyFingerprint = null) {
  if (!currentKeyFingerprint) return;
  await db.prepare(
    `UPDATE identity_device_keys
        SET status = 'revoked',
            revoked_at = CURRENT_TIMESTAMP,
            replaced_by_key_fingerprint = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE key_fingerprint = ? AND actor_id = ?`
  ).bind(nextKeyFingerprint || null, currentKeyFingerprint, actorId).run();
}

async function bumpActorSessionVersion(db, actorId, nextKeyFingerprint) {
  await db.prepare(
    `UPDATE identity_actors
        SET session_version = COALESCE(session_version, 1) + 1,
            active_device_key_fingerprint = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE actor_id = ?`
  ).bind(nextKeyFingerprint || null, actorId).run();
}

async function markChallengeUsed(db, challengeId) {
  await db.prepare(
    "UPDATE identity_bootstrap_challenges SET used_at = ? WHERE challenge_id = ?"
  ).bind(nowEpochSeconds(), challengeId).run();
}

async function reassignPlaidItemRows(db, fromUserId, toUserId) {
  if (!fromUserId || !toUserId || fromUserId === toUserId) return false;
  const sourceRows = await selectResults(
    db,
    "SELECT access_token, item_id FROM plaid_items WHERE user_id = ?",
    [fromUserId]
  );
  if (sourceRows.length === 0) return false;
  const targetRows = await selectResults(
    db,
    "SELECT access_token, item_id FROM plaid_items WHERE user_id = ?",
    [toUserId]
  );
  const targetItemIds = new Set(targetRows.map(row => row.item_id));
  let moved = false;
  for (const row of sourceRows) {
    if (targetItemIds.has(row.item_id)) continue;
    await db.prepare(
      "UPDATE plaid_items SET user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE item_id = ? AND user_id = ?"
    ).bind(toUserId, row.item_id, fromUserId).run();
    moved = true;
  }
  return moved;
}

async function reassignSyncRows(db, fromUserId, toUserId) {
  if (!fromUserId || !toUserId || fromUserId === toUserId) return false;
  const sourceRows = await selectResults(db, "SELECT * FROM sync_data WHERE user_id = ?", [fromUserId]);
  if (sourceRows.length === 0) return false;
  const targetRows = await selectResults(db, "SELECT * FROM sync_data WHERE user_id = ?", [toUserId]);
  const targetItemIds = new Set(targetRows.map(row => row.item_id || "__default__"));
  let moved = false;
  for (const row of sourceRows) {
    const itemId = row.item_id || "__default__";
    if (targetItemIds.has(itemId)) continue;
    await db.prepare(
      "UPDATE sync_data SET user_id = ? WHERE user_id = ? AND item_id = ?"
    ).bind(toUserId, fromUserId, row.item_id || null).run();
    moved = true;
  }
  return moved;
}

async function reassignActorAliases(db, fromActorId, toActorId) {
  if (!fromActorId || !toActorId || fromActorId === toActorId) return false;
  const aliases = await getActorAliasRows(db, fromActorId);
  if (aliases.length === 0) return false;
  for (const alias of aliases) {
    await db.prepare(
      `INSERT INTO identity_actor_aliases (alias_type, alias_hash, actor_id)
       VALUES (?, ?, ?)
       ON CONFLICT(alias_type, alias_hash) DO UPDATE SET actor_id = excluded.actor_id`
    ).bind(alias.alias_type, alias.alias_hash, toActorId).run();
  }
  return true;
}

async function reassignRecoveryVaultActorTable(db, tableName, fromActorId, toActorId) {
  if (!fromActorId || !toActorId || fromActorId === toActorId) return false;
  const sourceRows = await selectResults(
    db,
    `SELECT actor_id FROM ${tableName} WHERE actor_id = ?`,
    [fromActorId]
  );
  if (sourceRows.length === 0) return false;
  const targetRows = await selectResults(
    db,
    `SELECT actor_id FROM ${tableName} WHERE actor_id = ?`,
    [toActorId]
  );
  if (targetRows.length > 0) {
    await db.prepare(`DELETE FROM ${tableName} WHERE actor_id = ?`).bind(fromActorId).run();
    return false;
  }
  await db.prepare(`UPDATE ${tableName} SET actor_id = ? WHERE actor_id = ?`).bind(toActorId, fromActorId).run();
  return true;
}

async function reassignRecoveryVaultActorRows(db, fromActorId, toActorId) {
  const outcomes = await Promise.all([
    reassignRecoveryVaultActorTable(db, "recovery_vault_links", fromActorId, toActorId),
    reassignRecoveryVaultActorTable(db, "recovery_vault_continuity", fromActorId, toActorId),
    reassignRecoveryVaultActorTable(db, "recovery_vault_trusted_continuity", fromActorId, toActorId),
  ]);
  return outcomes.some(Boolean);
}

async function mergeActorData(db, sourceActor, targetActorId, keyFingerprint, options = {}) {
  if (!sourceActor?.actorId || !targetActorId || sourceActor.actorId === targetActorId) return false;
  if (
    !options.allowKeyMismatch &&
    sourceActor.activeDeviceKeyFingerprint &&
    sourceActor.activeDeviceKeyFingerprint !== keyFingerprint
  ) {
    throw new Error("identity_proof_required");
  }
  const [movedPlaid, movedSync, movedAliases, movedVaultRows] = await Promise.all([
    reassignPlaidItemRows(db, sourceActor.actorId, targetActorId),
    reassignSyncRows(db, sourceActor.actorId, targetActorId),
    reassignActorAliases(db, sourceActor.actorId, targetActorId),
    reassignRecoveryVaultActorRows(db, sourceActor.actorId, targetActorId),
  ]);
  return movedPlaid || movedSync || movedAliases || movedVaultRows;
}

export async function migrateLegacyPlaidOwnership(db, actorId, { deviceId = "", revenueCatAppUserId = "" } = {}) {
  if (!db || !actorId) return false;
  let migrated = false;
  const legacyUserIds = [
    "catalyst-user",
    deviceId ? `device:${deviceId}` : "",
    revenueCatAppUserId ? `rc:${revenueCatAppUserId}` : "",
  ].filter(Boolean);

  for (const legacyUserId of legacyUserIds) {
    const movedPlaid = await reassignPlaidItemRows(db, legacyUserId, actorId);
    const movedSync = await reassignSyncRows(db, legacyUserId, actorId);
    migrated = movedPlaid || movedSync || migrated;
  }
  return migrated;
}

async function verifyEd25519Signature(publicKeyJwk, message, signatureBase64Url) {
  const verifyKey = await importPublicKeyJwk(publicKeyJwk);
  const signature = fromBase64Url(signatureBase64Url);
  return crypto.subtle.verify("Ed25519", verifyKey, signature, encoder.encode(message));
}

function buildChallengeResponsePayload({
  challengeId,
  nonce,
  intent,
  keyFingerprint,
  nextKeyFingerprint = "",
  expiresAt,
}) {
  return {
    challengeId,
    nonce,
    intent,
    keyFingerprint,
    nextKeyFingerprint,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    signingPayload: buildChallengeMessage({
      challengeId,
      nonce,
      intent,
      keyFingerprint,
      nextKeyFingerprint,
    }),
  };
}

export async function createIdentityChallenge(db, env, {
  publicKeyJwk,
  verifiedRevenueCatAppUserId = "",
  legacyDeviceId = "",
  intent = "bootstrap",
  actor = null,
  nextPublicKeyJwk = null,
} = {}) {
  if (!db) throw new Error("DB not configured");
  const normalizedIntent = intent === "rotate" ? "rotate" : "bootstrap";
  const canonicalPublicKey = canonicalizePublicJwk(publicKeyJwk);
  const keyFingerprint = await publicKeyFingerprintFromJwk(canonicalPublicKey);
  const challengeId = randomChallengeId();
  const nonce = randomNonce();
  const expiresAt = nowEpochSeconds() + parseChallengeTtlSeconds(env);
  const nonceHash = await sha256Base64Url(nonce);
  const legacyAliasHash =
    legacyDeviceId ? await hashIdentityAlias("device", legacyDeviceId, env) : "";

  let nextKeyFingerprint = "";
  let nextPublicKeyJson = null;
  let actorId = actor?.actorId || null;
  let currentKeyFingerprint = actor?.activeDeviceKeyFingerprint || null;

  if (normalizedIntent === "rotate") {
    if (!actorId || !currentKeyFingerprint) {
      throw new Error("identity_rotation_requires_authenticated_actor");
    }
    if (!nextPublicKeyJwk) {
      throw new Error("identity_rotation_next_key_missing");
    }
    nextKeyFingerprint = await publicKeyFingerprintFromJwk(nextPublicKeyJwk);
    nextPublicKeyJson = JSON.stringify(canonicalizePublicJwk(nextPublicKeyJwk));
  }

  await db.prepare(
    `INSERT INTO identity_bootstrap_challenges (
       challenge_id,
       nonce_hash,
       public_key_fingerprint,
       public_key_jwk,
       verified_revenuecat_app_user_id,
       legacy_device_alias_hash,
       intent,
       actor_id,
       current_key_fingerprint,
       next_key_fingerprint,
       next_public_key_jwk,
       expires_at,
       used_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
  ).bind(
    challengeId,
    nonceHash,
    keyFingerprint,
    JSON.stringify(canonicalPublicKey),
    verifiedRevenueCatAppUserId || null,
    legacyAliasHash || null,
    normalizedIntent,
    actorId,
    currentKeyFingerprint,
    nextKeyFingerprint || null,
    nextPublicKeyJson,
    expiresAt
  ).run();

  return buildChallengeResponsePayload({
    challengeId,
    nonce,
    intent: normalizedIntent,
    keyFingerprint,
    nextKeyFingerprint,
    expiresAt,
  });
}

async function claimActorForVerifiedKey(db, env, {
  keyFingerprint,
  publicKeyJwk,
  verifiedRevenueCatAppUserId = "",
  verifiedAppleUserId = "",
  legacyDeviceId = "",
} = {}) {
  const existingKey = await getDeviceKeyBinding(db, keyFingerprint);
  const legacyAliasHash =
    legacyDeviceId ? await hashIdentityAlias("device", legacyDeviceId, env) : "";
  const appleAliasHash =
    verifiedAppleUserId ? await hashIdentityAlias("apple", verifiedAppleUserId, env) : "";
  const existingDeviceActor = existingKey?.status === "active"
    ? await getActorById(db, existingKey.actor_id)
    : null;
  const revenueCatActor = verifiedRevenueCatAppUserId
    ? await getActorByRevenueCatUserId(db, verifiedRevenueCatAppUserId)
    : null;
  const appleActor = appleAliasHash ? await getActorByAlias(db, "apple", appleAliasHash) : null;
  const legacyActor = legacyAliasHash ? await getActorByAlias(db, "device", legacyAliasHash) : null;

  let actor = existingDeviceActor;
  if (!actor) {
    if (revenueCatActor) {
      if (
        revenueCatActor.activeDeviceKeyFingerprint &&
        revenueCatActor.activeDeviceKeyFingerprint !== keyFingerprint
      ) {
        throw new Error("identity_proof_required");
      }
      actor = revenueCatActor;
    } else if (appleActor) {
      actor = appleActor;
    } else if (legacyActor) {
      if (legacyActor.activeDeviceKeyFingerprint && legacyActor.activeDeviceKeyFingerprint !== keyFingerprint) {
        throw new Error("identity_proof_required");
      }
      actor = legacyActor;
    } else {
      actor = await createActor(db, verifiedRevenueCatAppUserId || null);
    }
  } else if (revenueCatActor && revenueCatActor.actorId !== actor.actorId) {
    await mergeActorData(db, revenueCatActor, actor.actorId, keyFingerprint);
  }

  if (appleActor && appleActor.actorId !== actor.actorId) {
    await mergeActorData(db, appleActor, actor.actorId, keyFingerprint, { allowKeyMismatch: true });
  }

  if (legacyActor && legacyActor.actorId !== actor.actorId) {
    await mergeActorData(db, legacyActor, actor.actorId, keyFingerprint);
  }

  await storeDeviceKey(db, actor.actorId, keyFingerprint, publicKeyJwk);
  if (legacyAliasHash) {
    await bindActorAlias(db, "device", legacyAliasHash, actor.actorId);
  }
  if (verifiedRevenueCatAppUserId) {
    const revenueCatAliasHash = await hashIdentityAlias("revenuecat", verifiedRevenueCatAppUserId, env);
    await bindActorAlias(db, "revenuecat", revenueCatAliasHash, actor.actorId);
    await attachRevenueCatUser(db, actor.actorId, verifiedRevenueCatAppUserId);
  }
  if (appleAliasHash) {
    await bindActorAlias(db, "apple", appleAliasHash, actor.actorId);
  }

  await migrateLegacyPlaidOwnership(db, actor.actorId, {
    deviceId: legacyDeviceId,
    revenueCatAppUserId: verifiedRevenueCatAppUserId,
  });

  const refreshedActor = await getActorById(db, actor.actorId);
  return {
    actorId: refreshedActor?.actorId || actor.actorId,
    userId: refreshedActor?.actorId || actor.actorId,
    revenueCatAppUserId: verifiedRevenueCatAppUserId || refreshedActor?.revenueCatAppUserId || null,
    source: [
      "device-key",
      verifiedRevenueCatAppUserId ? "revenuecat" : null,
      verifiedAppleUserId ? "apple" : null,
    ]
      .filter(Boolean)
      .join("+"),
    sessionVersion: refreshedActor?.sessionVersion || actor.sessionVersion || 1,
    activeDeviceKeyFingerprint:
      refreshedActor?.activeDeviceKeyFingerprint || keyFingerprint,
  };
}

async function loadChallengeAndNonce(db, challengeId, providedNonce, publicKeyJwk) {
  const challenge = await getChallengeRow(db, challengeId);
  if (!challenge) {
    throw new Error("identity_challenge_not_found");
  }
  if (challenge.used_at) {
    throw new Error("identity_challenge_replayed");
  }
  if (Number(challenge.expires_at || 0) <= nowEpochSeconds()) {
    throw new Error("identity_challenge_expired");
  }
  const nonceHash = await sha256Base64Url(providedNonce);
  if (nonceHash !== challenge.nonce_hash) {
    throw new Error("identity_challenge_nonce_mismatch");
  }
  const keyFingerprint = await publicKeyFingerprintFromJwk(publicKeyJwk);
  if (keyFingerprint !== challenge.public_key_fingerprint) {
    throw new Error("identity_key_mismatch");
  }
  return { challenge, keyFingerprint };
}

export async function completeIdentityChallenge(db, env, {
  challengeId,
  nonce,
  publicKeyJwk,
  signature,
  legacyDeviceId = "",
  verifiedRevenueCatAppUserId = "",
  verifiedAppleUserId = "",
} = {}) {
  const canonicalPublicKey = canonicalizePublicJwk(publicKeyJwk);
  const { challenge, keyFingerprint } = await loadChallengeAndNonce(db, challengeId, nonce, canonicalPublicKey);
  if (challenge.intent !== "bootstrap") {
    throw new Error("identity_challenge_intent_invalid");
  }
  const signingPayload = buildChallengeMessage({
    challengeId: challenge.challenge_id,
    nonce,
    intent: "bootstrap",
    keyFingerprint,
  });
  const verified = await verifyEd25519Signature(canonicalPublicKey, signingPayload, signature);
  if (!verified) {
    throw new Error("identity_signature_invalid");
  }

  const actor = await claimActorForVerifiedKey(db, env, {
    keyFingerprint,
    publicKeyJwk: canonicalPublicKey,
    verifiedRevenueCatAppUserId: verifiedRevenueCatAppUserId || challenge.verified_revenuecat_app_user_id || "",
    verifiedAppleUserId,
    legacyDeviceId,
  });
  await markChallengeUsed(db, challenge.challenge_id);
  return issueIdentitySessionToken(actor, keyFingerprint, env);
}

export async function rotateIdentityDeviceKey(db, env, {
  challengeId,
  nonce,
  currentSignature,
  nextPublicKeyJwk,
  nextSignature,
} = {}) {
  const challenge = await getChallengeRow(db, challengeId);
  if (!challenge) {
    throw new Error("identity_challenge_not_found");
  }
  if (challenge.used_at) {
    throw new Error("identity_challenge_replayed");
  }
  if (Number(challenge.expires_at || 0) <= nowEpochSeconds()) {
    throw new Error("identity_challenge_expired");
  }
  if (challenge.intent !== "rotate") {
    throw new Error("identity_challenge_intent_invalid");
  }
  const nonceHash = await sha256Base64Url(nonce);
  if (nonceHash !== challenge.nonce_hash) {
    throw new Error("identity_challenge_nonce_mismatch");
  }

  const actor = await getActorById(db, challenge.actor_id);
  if (!actor || actor.activeDeviceKeyFingerprint !== challenge.current_key_fingerprint) {
    throw new Error("identity_rotation_actor_mismatch");
  }

  const currentKeyBinding = await getDeviceKeyBinding(db, challenge.current_key_fingerprint);
  if (!currentKeyBinding || currentKeyBinding.status !== "active") {
    throw new Error("identity_rotation_current_key_missing");
  }

  const nextCanonicalKey = canonicalizePublicJwk(nextPublicKeyJwk);
  const nextKeyFingerprint = await publicKeyFingerprintFromJwk(nextCanonicalKey);
  if (nextKeyFingerprint !== challenge.next_key_fingerprint) {
    throw new Error("identity_rotation_next_key_mismatch");
  }

  const currentSigningPayload = buildChallengeMessage({
    challengeId: challenge.challenge_id,
    nonce,
    intent: "rotate",
    keyFingerprint: challenge.current_key_fingerprint,
    nextKeyFingerprint,
  });
  const nextSigningPayload = currentSigningPayload;
  const currentPublicKeyJwk = JSON.parse(currentKeyBinding.public_key_jwk || "{}");
  const currentVerified = await verifyEd25519Signature(currentPublicKeyJwk, currentSigningPayload, currentSignature);
  const nextVerified = await verifyEd25519Signature(nextCanonicalKey, nextSigningPayload, nextSignature);
  if (!currentVerified || !nextVerified) {
    throw new Error("identity_rotation_signature_invalid");
  }

  await storeDeviceKey(db, actor.actorId, nextKeyFingerprint, nextCanonicalKey);
  await revokeDeviceKey(db, actor.actorId, challenge.current_key_fingerprint, nextKeyFingerprint);
  await bumpActorSessionVersion(db, actor.actorId, nextKeyFingerprint);
  await markChallengeUsed(db, challenge.challenge_id);

  const refreshed = await getActorById(db, actor.actorId);
  return issueIdentitySessionToken(
    {
      actorId: refreshed.actorId,
      userId: refreshed.actorId,
      revenueCatAppUserId: refreshed.revenueCatAppUserId || null,
      source: "device-key-rotation",
      sessionVersion: refreshed.sessionVersion,
      activeDeviceKeyFingerprint: refreshed.activeDeviceKeyFingerprint,
    },
    nextKeyFingerprint,
    env
  );
}

export async function resolveAuthenticatedActor(request, db, env) {
  const token = readBearerToken(request);
  if (!token) return null;
  const payload = await verifyIdentitySessionToken(token, env);
  if (!payload?.actorId) return null;
  if (!db) {
    return {
      actorId: payload.actorId,
      userId: payload.actorId,
      revenueCatAppUserId: payload.revenueCatAppUserId || null,
      source: payload.source || "device-key",
      sessionVersion: Number(payload.sessionVersion || 1),
      activeDeviceKeyFingerprint: payload.keyFingerprint || null,
    };
  }
  const actor = await getActorById(db, payload.actorId);
  if (!actor) return null;
  if (Number(actor.sessionVersion || 1) !== Number(payload.sessionVersion || 0)) return null;
  if (!actor.activeDeviceKeyFingerprint || actor.activeDeviceKeyFingerprint !== payload.keyFingerprint) return null;

  const keyBinding = await getDeviceKeyBinding(db, payload.keyFingerprint);
  if (!keyBinding || keyBinding.status !== "active" || keyBinding.actor_id !== actor.actorId) {
    return null;
  }

  return {
    actorId: actor.actorId,
    userId: actor.actorId,
    revenueCatAppUserId: actor.revenueCatAppUserId || payload.revenueCatAppUserId || null,
    source: payload.source || "device-key",
    sessionVersion: actor.sessionVersion,
    activeDeviceKeyFingerprint: actor.activeDeviceKeyFingerprint,
  };
}

export async function getActorRevenueCatUserId(db, actorId) {
  if (!db || !actorId) return null;
  const rows = await selectResults(
    db,
    "SELECT revenuecat_app_user_id FROM identity_actors WHERE actor_id = ?",
    [actorId]
  );
  return rows[0]?.revenuecat_app_user_id || null;
}
