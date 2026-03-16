const encoder = new TextEncoder();
const SESSION_VERSION = 1;
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 12;

function ensureSigningSecret(env) {
  const secret = String(env.IDENTITY_SESSION_SECRET || "").trim();
  if (!secret) {
    throw new Error("IDENTITY_SESSION_SECRET is not configured");
  }
  return secret;
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

export async function hashIdentityAlias(aliasType, aliasValue, env) {
  const secret = ensureSigningSecret(env);
  return hmacBase64Url(secret, `alias:${aliasType}:${String(aliasValue || "").trim()}`);
}

function parseSessionTtlSeconds(env) {
  const raw = Number(env.IDENTITY_SESSION_TTL_SECONDS || DEFAULT_SESSION_TTL_SECONDS);
  return Number.isFinite(raw) && raw > 60 ? Math.floor(raw) : DEFAULT_SESSION_TTL_SECONDS;
}

export async function issueIdentitySessionToken(actor, env) {
  const secret = ensureSigningSecret(env);
  const now = Math.floor(Date.now() / 1000);
  const exp = now + parseSessionTtlSeconds(env);
  const payload = {
    v: SESSION_VERSION,
    actorId: actor.actorId,
    source: actor.source || "device",
    revenueCatAppUserId: actor.revenueCatAppUserId || null,
    iat: now,
    exp,
  };
  const encodedPayload = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await hmacBase64Url(secret, `ccid.${encodedPayload}`);
  return {
    token: `ccid.${encodedPayload}.${signature}`,
    expiresAt: new Date(exp * 1000).toISOString(),
    actorId: actor.actorId,
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
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encodedPayload)));
    if (payload?.v !== SESSION_VERSION || !payload?.actorId) return null;
    const now = Math.floor(Date.now() / 1000);
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

async function selectResults(db, sql, params = []) {
  const response = await db.prepare(sql).bind(...params).all();
  return response?.results || [];
}

async function getActorByAlias(db, aliasType, aliasHash) {
  const results = await selectResults(
    db,
    `SELECT a.actor_id, a.revenuecat_app_user_id
       FROM identity_actor_aliases aliases
       JOIN identity_actors a ON a.actor_id = aliases.actor_id
      WHERE aliases.alias_type = ? AND aliases.alias_hash = ?`,
    [aliasType, aliasHash]
  );
  const actor = results[0] || null;
  return actor
    ? { actorId: actor.actor_id, revenueCatAppUserId: actor.revenuecat_app_user_id || null }
    : null;
}

async function getActorByRevenueCatUserId(db, revenueCatAppUserId) {
  if (!revenueCatAppUserId) return null;
  const results = await selectResults(
    db,
    "SELECT actor_id, revenuecat_app_user_id FROM identity_actors WHERE revenuecat_app_user_id = ?",
    [revenueCatAppUserId]
  );
  const actor = results[0] || null;
  return actor
    ? { actorId: actor.actor_id, revenueCatAppUserId: actor.revenuecat_app_user_id || null }
    : null;
}

async function createActor(db, revenueCatAppUserId = null) {
  const actorId = randomActorId();
  await db.prepare(
    `INSERT INTO identity_actors (actor_id, revenuecat_app_user_id)
     VALUES (?, ?)`
  ).bind(actorId, revenueCatAppUserId || null).run();
  return { actorId, revenueCatAppUserId: revenueCatAppUserId || null };
}

async function bindActorAlias(db, aliasType, aliasHash, actorId) {
  if (!aliasHash || !actorId) return;
  await db.prepare(
    `INSERT INTO identity_actor_aliases (alias_type, alias_hash, actor_id)
     VALUES (?, ?, ?)
     ON CONFLICT(alias_type, alias_hash) DO UPDATE SET actor_id = excluded.actor_id`
  ).bind(aliasType, aliasHash, actorId).run();
}

async function attachRevenueCatUser(db, actorId, revenueCatAppUserId) {
  if (!actorId || !revenueCatAppUserId) return;
  await db.prepare(
    `UPDATE identity_actors
        SET revenuecat_app_user_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE actor_id = ?`
  ).bind(revenueCatAppUserId, actorId).run();
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

export async function bootstrapIdentityActor(db, request, env, verifiedRevenueCatAppUserId = null) {
  if (!db) throw new Error("DB not configured");
  const deviceId = String(request.headers.get("X-Device-ID") || "").trim();
  const revenueCatAppUserId = String(verifiedRevenueCatAppUserId || "").trim();
  if (!deviceId && !revenueCatAppUserId) return null;

  const deviceAliasHash = deviceId ? await hashIdentityAlias("device", deviceId, env) : "";
  const revenueCatAliasHash = revenueCatAppUserId
    ? await hashIdentityAlias("revenuecat", revenueCatAppUserId, env)
    : "";

  const revenueCatActor =
    (revenueCatAliasHash && await getActorByAlias(db, "revenuecat", revenueCatAliasHash)) ||
    (revenueCatAppUserId && await getActorByRevenueCatUserId(db, revenueCatAppUserId)) ||
    null;
  const deviceActor = deviceAliasHash ? await getActorByAlias(db, "device", deviceAliasHash) : null;

  let actor = revenueCatActor || deviceActor;
  if (!actor) {
    actor = await createActor(db, revenueCatAppUserId || null);
  }

  if (revenueCatActor && deviceActor && revenueCatActor.actorId !== deviceActor.actorId) {
    await reassignPlaidItemRows(db, deviceActor.actorId, revenueCatActor.actorId);
    await reassignSyncRows(db, deviceActor.actorId, revenueCatActor.actorId);
    actor = revenueCatActor;
  }

  if (deviceAliasHash) {
    await bindActorAlias(db, "device", deviceAliasHash, actor.actorId);
  }
  if (revenueCatAliasHash) {
    await bindActorAlias(db, "revenuecat", revenueCatAliasHash, actor.actorId);
    await attachRevenueCatUser(db, actor.actorId, revenueCatAppUserId);
    actor.revenueCatAppUserId = revenueCatAppUserId;
  }

  await migrateLegacyPlaidOwnership(db, actor.actorId, { deviceId, revenueCatAppUserId });

  return {
    actorId: actor.actorId,
    userId: actor.actorId,
    revenueCatAppUserId: actor.revenueCatAppUserId || null,
    source: revenueCatAppUserId ? "revenuecat" : "device",
  };
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
      source: payload.source || "device",
    };
  }
  const rows = await selectResults(
    db,
    "SELECT actor_id, revenuecat_app_user_id FROM identity_actors WHERE actor_id = ?",
    [payload.actorId]
  );
  const actor = rows[0];
  if (!actor) return null;
  return {
    actorId: actor.actor_id,
    userId: actor.actor_id,
    revenueCatAppUserId: actor.revenuecat_app_user_id || payload.revenueCatAppUserId || null,
    source: payload.source || "device",
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
