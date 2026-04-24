import { verifyAppleIdentityToken } from "../lib/appleIdentity.js";

// ── Recovery Vault rate limiting ────────────────────────────────
const VAULT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const VAULT_MAX_REQUESTS_PER_IP = 10;
const VAULT_MAX_FAILED_AUTH_PER_ID = 5;
const vaultIpCounts = new Map(); // ip → { count, resetAt }
const vaultFailedAuthCounts = new Map(); // recoveryId → { count, resetAt }
const trustedVaultEncoder = new TextEncoder();
const trustedVaultDecoder = new TextDecoder();

function toBase64Url(bytes) {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const base64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(buffer).toString("base64")
      : btoa(String.fromCharCode(...buffer));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(padded, "base64"));
  }
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function importTrustedVaultBaseKey(env) {
  const secret = String(env.IDENTITY_SESSION_SECRET || "").trim();
  if (!secret) {
    throw new Error("IDENTITY_SESSION_SECRET is not configured");
  }
  return crypto.subtle.importKey(
    "raw",
    trustedVaultEncoder.encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
}

async function deriveTrustedVaultKey(env, actorId) {
  const baseKey = await importTrustedVaultBaseKey(env);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: trustedVaultEncoder.encode(`recovery-vault-trusted:${String(actorId || "").trim()}`),
      iterations: 210000,
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptTrustedRecoveryKey(env, actorId, recoveryKey) {
  const key = await deriveTrustedVaultKey(env, actorId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    trustedVaultEncoder.encode(String(recoveryKey || "").trim())
  );
  return JSON.stringify({
    v: 1,
    iv: toBase64Url(iv),
    ct: toBase64Url(new Uint8Array(ciphertext)),
  });
}

async function decryptTrustedRecoveryKey(env, actorId, envelopeValue) {
  const envelope =
    typeof envelopeValue === "string"
      ? JSON.parse(envelopeValue)
      : envelopeValue;
  if (!envelope?.iv || !envelope?.ct) {
    throw new Error("Trusted Recovery Vault continuity payload is invalid.");
  }
  const key = await deriveTrustedVaultKey(env, actorId);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(envelope.iv) },
    key,
    fromBase64Url(envelope.ct)
  );
  return trustedVaultDecoder.decode(plaintext).trim().toUpperCase();
}

function checkVaultRateLimit(key, store, maxCount) {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + VAULT_RATE_LIMIT_WINDOW_MS });
    return true;
  }
  entry.count += 1;
  if (entry.count > maxCount) return false;
  return true;
}

function recordVaultFailedAuth(recoveryId) {
  const now = Date.now();
  const entry = vaultFailedAuthCounts.get(recoveryId);
  if (!entry || now > entry.resetAt) {
    vaultFailedAuthCounts.set(recoveryId, { count: 1, resetAt: now + VAULT_RATE_LIMIT_WINDOW_MS });
    return;
  }
  entry.count += 1;
}

function isVaultAuthBlocked(recoveryId) {
  const now = Date.now();
  const entry = vaultFailedAuthCounts.get(recoveryId);
  if (!entry || now > entry.resetAt) return false;
  return entry.count >= VAULT_MAX_FAILED_AUTH_PER_ID;
}

// Periodic GC for stale entries (runs at most once per 60s)
let lastVaultGc = 0;
function gcVaultRateLimits() {
  const now = Date.now();
  if (now - lastVaultGc < 60_000) return;
  lastVaultGc = now;
  for (const [key, entry] of vaultIpCounts) {
    if (now > entry.resetAt) vaultIpCounts.delete(key);
  }
  for (const [key, entry] of vaultFailedAuthCounts) {
    if (now > entry.resetAt) vaultFailedAuthCounts.delete(key);
  }
}

export async function handleSystemRoute({
  request,
  url,
  env,
  cors,
  buildHeaders,
  DEFAULTS,
  getWorkerGatingMode,
  resolveAuthenticatedActor,
  resolveVerifiedRevenueCatAppUserId,
  createIdentityChallenge,
  completeIdentityChallenge,
  rotateIdentityDeviceKey,
  updateAuditLogRow,
  loadPlaidRoiSummary,
  loadTelemetrySummary,
  workerLog,
}) {
  const jsonHeaders = buildHeaders(cors, { "Content-Type": "application/json" });

  if (url.pathname === "/health") {
    return new Response(
      JSON.stringify({
        status: "ok",
        version: "1.1",
        providers: ["openai"],
        defaultProvider: "openai",
        defaultModel: DEFAULTS.openai,
        plaid: Boolean(env.PLAID_CLIENT_ID && env.PLAID_SECRET),
      }),
      {
        status: 200,
        headers: jsonHeaders,
      }
    );
  }

  if (url.pathname === "/config" && request.method === "GET") {
    return new Response(
      JSON.stringify({
        gatingMode: getWorkerGatingMode(env),
        minVersion: env.MIN_VERSION || "2.0.0",
        entitlementVerification: Boolean(env.REVENUECAT_SECRET_KEY),
        platformPolicy: {
          web: {
            secureSecretPersistence: false,
            appLock: false,
            biometricUnlock: false,
            appleSignIn: false,
            cloudBackup: false,
            householdSync: false,
            protectedFinanceIdentity: false,
            plaidSync: false,
            note:
              "Web is intentionally limited for security-sensitive features. Device-proof identity, Plaid sync, Apple-backed backup, and shared-household credentials require the native iPhone app.",
          },
        },
        rotatingCategories: {
          "Chase Freedom Flex": ["gas", "transit"],
          "Discover it Cash Back": ["groceries", "drugstores", "online_shopping"],
        },
      }),
      {
        status: 200,
        headers: buildHeaders(cors, { "Content-Type": "application/json", "Cache-Control": "max-age=300" }),
      }
    );
  }

  if (url.pathname === "/api/recovery-vault/linked") {
    if (!env.DB) {
      return new Response(JSON.stringify({ error: "DB not configured" }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    const authenticatedActor = await resolveAuthenticatedActor(request, env.DB, env);
    if (!authenticatedActor?.actorId) {
      return new Response(JSON.stringify({
        error: "identity_session_required",
        message: "A protected identity session is required for linked Recovery Vault restore.",
      }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    try {
      if (request.method === "GET") {
        const { results } = await env.DB.prepare(
          `SELECT links.recovery_id
             FROM recovery_vault_links links
             JOIN recovery_vault vault ON vault.recovery_id = links.recovery_id
            WHERE links.actor_id = ?`
        ).bind(authenticatedActor.actorId).all();
        return new Response(JSON.stringify({
          recoveryId: String(results?.[0]?.recovery_id || "").trim().toUpperCase() || null,
        }), {
          status: 200,
          headers: jsonHeaders,
        });
      }

      if (request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const recoveryId = String(body?.recoveryId || "").trim().toUpperCase();
        if (!recoveryId) {
          return new Response(JSON.stringify({
            error: "invalid_request",
            message: "Recovery Vault ID is required.",
          }), {
            status: 400,
            headers: jsonHeaders,
          });
        }

        const { results } = await env.DB.prepare(
          `SELECT recovery_id
             FROM recovery_vault
            WHERE recovery_id = ?`
        ).bind(recoveryId).all();
        if (!results?.[0]?.recovery_id) {
          return new Response(JSON.stringify({
            error: "recovery_vault_not_found",
            message: "That Recovery Vault ID does not exist yet.",
          }), {
            status: 404,
            headers: jsonHeaders,
          });
        }

        await env.DB.prepare(
          `INSERT INTO recovery_vault_links (
             actor_id,
             recovery_id,
             linked_at,
             updated_at
           ) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT(actor_id) DO UPDATE SET
             recovery_id = excluded.recovery_id,
             updated_at = CURRENT_TIMESTAMP`
        ).bind(authenticatedActor.actorId, recoveryId).run();

        return new Response(JSON.stringify({ success: true, recoveryId }), {
          status: 200,
          headers: jsonHeaders,
        });
      }

      if (request.method === "DELETE") {
        await env.DB.prepare(
          "DELETE FROM recovery_vault_links WHERE actor_id = ?"
        ).bind(authenticatedActor.actorId).run();

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: jsonHeaders,
        });
      }
    } catch (error) {
      return new Response(JSON.stringify({
        error: "recovery_vault_link_error",
        message: String(error?.message || "Recovery Vault link failed."),
      }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    return new Response(JSON.stringify({
      error: "method_not_allowed",
      message: "Unsupported Recovery Vault link method.",
    }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  if (url.pathname === "/api/recovery-vault/continuity") {
    if (!env.DB) {
      return new Response(JSON.stringify({ error: "DB not configured" }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    const authenticatedActor = await resolveAuthenticatedActor(request, env.DB, env);
    if (!authenticatedActor?.actorId) {
      return new Response(JSON.stringify({
        error: "identity_session_required",
        message: "A protected identity session is required for Recovery Vault continuity.",
      }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    try {
      if (request.method === "GET") {
        const { results } = await env.DB.prepare(
          `SELECT continuity.recovery_id, continuity.encrypted_recovery_key
             FROM recovery_vault_continuity continuity
             JOIN recovery_vault vault ON vault.recovery_id = continuity.recovery_id
            WHERE continuity.actor_id = ?`
        ).bind(authenticatedActor.actorId).all();
        const row = results?.[0] || null;
        return new Response(JSON.stringify({
          recoveryId: String(row?.recovery_id || "").trim().toUpperCase() || null,
          hasEscrow: Boolean(row?.encrypted_recovery_key),
          encryptedRecoveryKey: row?.encrypted_recovery_key || null,
        }), {
          status: 200,
          headers: jsonHeaders,
        });
      }

      if (request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const recoveryId = String(body?.recoveryId || "").trim().toUpperCase();
        const encryptedRecoveryKey = body?.encryptedRecoveryKey;
        if (!recoveryId || !encryptedRecoveryKey) {
          return new Response(JSON.stringify({
            error: "invalid_request",
            message: "Recovery Vault continuity requires a recovery ID and encrypted recovery key.",
          }), {
            status: 400,
            headers: jsonHeaders,
          });
        }

        const { results } = await env.DB.prepare(
          `SELECT recovery_id
             FROM recovery_vault
            WHERE recovery_id = ?`
        ).bind(recoveryId).all();
        if (!results?.[0]?.recovery_id) {
          return new Response(JSON.stringify({
            error: "recovery_vault_not_found",
            message: "That Recovery Vault ID does not exist yet.",
          }), {
            status: 404,
            headers: jsonHeaders,
          });
        }

        await env.DB.prepare(
          `INSERT INTO recovery_vault_continuity (
             actor_id,
             recovery_id,
             encrypted_recovery_key,
             linked_at,
             updated_at
           ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT(actor_id) DO UPDATE SET
             recovery_id = excluded.recovery_id,
             encrypted_recovery_key = excluded.encrypted_recovery_key,
             updated_at = CURRENT_TIMESTAMP`
        ).bind(authenticatedActor.actorId, recoveryId, JSON.stringify(encryptedRecoveryKey)).run();

        return new Response(JSON.stringify({ success: true, recoveryId, hasEscrow: true }), {
          status: 200,
          headers: jsonHeaders,
        });
      }

      if (request.method === "DELETE") {
        await env.DB.prepare(
          "DELETE FROM recovery_vault_continuity WHERE actor_id = ?"
        ).bind(authenticatedActor.actorId).run();

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: jsonHeaders,
        });
      }
    } catch (error) {
      return new Response(JSON.stringify({
        error: "recovery_vault_continuity_error",
        message: String(error?.message || "Recovery Vault continuity failed."),
      }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    return new Response(JSON.stringify({
      error: "method_not_allowed",
      message: "Unsupported Recovery Vault continuity method.",
    }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  if (url.pathname === "/api/recovery-vault/continuity/trusted") {
    if (!env.DB) {
      return new Response(JSON.stringify({ error: "DB not configured" }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    const authenticatedActor = await resolveAuthenticatedActor(request, env.DB, env);
    if (!authenticatedActor?.actorId) {
      return new Response(JSON.stringify({
        error: "identity_session_required",
        message: "A protected identity session is required for seamless Recovery Vault restore.",
      }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    try {
      if (request.method === "GET") {
        const { results } = await env.DB.prepare(
          `SELECT continuity.recovery_id, continuity.encrypted_recovery_key
             FROM recovery_vault_trusted_continuity continuity
             JOIN recovery_vault vault ON vault.recovery_id = continuity.recovery_id
            WHERE continuity.actor_id = ?`
        ).bind(authenticatedActor.actorId).all();
        const row = results?.[0] || null;
        const trustedRecoveryKey = row?.encrypted_recovery_key
          ? await decryptTrustedRecoveryKey(env, authenticatedActor.actorId, row.encrypted_recovery_key)
          : null;
        return new Response(JSON.stringify({
          recoveryId: String(row?.recovery_id || "").trim().toUpperCase() || null,
          hasTrustedEscrow: Boolean(trustedRecoveryKey),
          trustedRecoveryKey,
        }), {
          status: 200,
          headers: jsonHeaders,
        });
      }

      if (request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const recoveryId = String(body?.recoveryId || "").trim().toUpperCase();
        const recoveryKey = String(body?.recoveryKey || "").trim().toUpperCase();
        if (!recoveryId || !recoveryKey) {
          return new Response(JSON.stringify({
            error: "invalid_request",
            message: "Seamless Recovery Vault restore requires a recovery ID and recovery key.",
          }), {
            status: 400,
            headers: jsonHeaders,
          });
        }

        const { results } = await env.DB.prepare(
          `SELECT recovery_id
             FROM recovery_vault
            WHERE recovery_id = ?`
        ).bind(recoveryId).all();
        if (!results?.[0]?.recovery_id) {
          return new Response(JSON.stringify({
            error: "recovery_vault_not_found",
            message: "That Recovery Vault ID does not exist yet.",
          }), {
            status: 404,
            headers: jsonHeaders,
          });
        }

        const encryptedRecoveryKey = await encryptTrustedRecoveryKey(env, authenticatedActor.actorId, recoveryKey);
        await env.DB.prepare(
          `INSERT INTO recovery_vault_trusted_continuity (
             actor_id,
             recovery_id,
             encrypted_recovery_key,
             linked_at,
             updated_at
           ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT(actor_id) DO UPDATE SET
             recovery_id = excluded.recovery_id,
             encrypted_recovery_key = excluded.encrypted_recovery_key,
             updated_at = CURRENT_TIMESTAMP`
        ).bind(authenticatedActor.actorId, recoveryId, encryptedRecoveryKey).run();

        return new Response(JSON.stringify({ success: true, recoveryId, hasTrustedEscrow: true }), {
          status: 200,
          headers: jsonHeaders,
        });
      }

      if (request.method === "DELETE") {
        await env.DB.prepare(
          "DELETE FROM recovery_vault_trusted_continuity WHERE actor_id = ?"
        ).bind(authenticatedActor.actorId).run();

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: jsonHeaders,
        });
      }
    } catch (error) {
      return new Response(JSON.stringify({
        error: "recovery_vault_trusted_continuity_error",
        message: String(error?.message || "Seamless Recovery Vault restore failed."),
      }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    return new Response(JSON.stringify({
      error: "method_not_allowed",
      message: "Unsupported seamless Recovery Vault continuity method.",
    }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  if (url.pathname === "/api/recovery-vault" && request.method === "POST") {
    gcVaultRateLimits();

    // Per-IP rate limiting
    const clientIp = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
    if (!checkVaultRateLimit(clientIp, vaultIpCounts, VAULT_MAX_REQUESTS_PER_IP)) {
      workerLog(env, "warn", "recovery-vault", "IP rate limit exceeded", { ip: clientIp.slice(0, 20) });
      return new Response(JSON.stringify({
        error: "rate_limited",
        message: "Too many Recovery Vault requests. Please try again later.",
      }), {
        status: 429,
        headers: buildHeaders(cors, { "Content-Type": "application/json", "Retry-After": "900" }),
      });
    }
    if (!env.DB) {
      return new Response(JSON.stringify({ error: "DB not configured" }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    try {
      const body = await request.json().catch(() => ({}));
      const action = String(body?.action || "").trim();
      const recoveryId = String(body?.recoveryId || "").trim().toUpperCase();
      const authToken = String(body?.authToken || "").trim();

      if (!action || !recoveryId || !authToken) {
        return new Response(JSON.stringify({
          error: "invalid_request",
          message: "Recovery Vault credentials are missing.",
        }), {
          status: 400,
          headers: jsonHeaders,
        });
      }

      // Per-recovery-ID failed auth blocking
      if (isVaultAuthBlocked(recoveryId)) {
        workerLog(env, "warn", "recovery-vault", "Auth blocked for recovery ID due to repeated failures");
        return new Response(JSON.stringify({
          error: "rate_limited",
          message: "Too many failed authentication attempts. Please try again later.",
        }), {
          status: 429,
          headers: buildHeaders(cors, { "Content-Type": "application/json", "Retry-After": "900" }),
        });
      }

      const authTokenHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(authToken));
      const authTokenHashHex = Array.from(new Uint8Array(authTokenHash))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");

      const { results } = await env.DB.prepare(
        `SELECT recovery_id, encrypted_blob, auth_token_hash, backup_kind, exported_at, last_updated_at
           FROM recovery_vault
          WHERE recovery_id = ?`
      ).bind(recoveryId).all();
      const existing = results?.[0] || null;

      if (action === "fetch") {
        if (!existing || existing.auth_token_hash !== authTokenHashHex) {
          recordVaultFailedAuth(recoveryId);
          return new Response(JSON.stringify({ hasData: false }), {
            status: 404,
            headers: jsonHeaders,
          });
        }
        return new Response(JSON.stringify({
          hasData: true,
          encryptedBlob: existing.encrypted_blob,
          backupKind: existing.backup_kind || "encrypted-vault",
          exportedAt: existing.exported_at || null,
          lastUpdatedAt: existing.last_updated_at || null,
        }), {
          status: 200,
          headers: jsonHeaders,
        });
      }

      if (action === "push") {
        const encryptedBlob = body?.encryptedBlob;
        const backupKind = String(body?.backupKind || "encrypted-vault").trim();
        const exportedAt = String(body?.exportedAt || "").trim() || new Date().toISOString();
        if (!encryptedBlob) {
          return new Response(JSON.stringify({
            error: "invalid_request",
            message: "Encrypted Recovery Vault payload is required.",
          }), {
            status: 400,
            headers: jsonHeaders,
          });
        }
        if (existing?.auth_token_hash && existing.auth_token_hash !== authTokenHashHex) {
          recordVaultFailedAuth(recoveryId);
          return new Response(JSON.stringify({
            error: "unauthorized_recovery_access",
            message: "That Recovery Vault ID is already secured by a different key.",
          }), {
            status: 403,
            headers: jsonHeaders,
          });
        }
        await env.DB.prepare(
          `INSERT INTO recovery_vault (
             recovery_id,
             encrypted_blob,
             auth_token_hash,
             backup_kind,
             exported_at,
             last_updated_at
           ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(recovery_id) DO UPDATE SET
             encrypted_blob = excluded.encrypted_blob,
             auth_token_hash = excluded.auth_token_hash,
             backup_kind = excluded.backup_kind,
             exported_at = excluded.exported_at,
             last_updated_at = CURRENT_TIMESTAMP`
        ).bind(recoveryId, JSON.stringify(encryptedBlob), authTokenHashHex, backupKind, exportedAt).run();
        return new Response(JSON.stringify({ success: true, backupKind, exportedAt }), {
          status: 200,
          headers: jsonHeaders,
        });
      }

      if (action === "delete") {
        if (!existing || existing.auth_token_hash !== authTokenHashHex) {
          recordVaultFailedAuth(recoveryId);
          return new Response(JSON.stringify({
            error: "unauthorized_recovery_access",
            message: "Recovery Vault credentials did not match.",
          }), {
            status: 403,
            headers: jsonHeaders,
          });
        }
        await env.DB.prepare("DELETE FROM recovery_vault WHERE recovery_id = ?").bind(recoveryId).run();
        await env.DB.prepare("DELETE FROM recovery_vault_trusted_continuity WHERE recovery_id = ?").bind(recoveryId).run().catch(() => {});
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: jsonHeaders,
        });
      }

      return new Response(JSON.stringify({
        error: "invalid_action",
        message: "Unsupported Recovery Vault action.",
      }), {
        status: 400,
        headers: jsonHeaders,
      });
    } catch (error) {
      return new Response(JSON.stringify({
        error: "recovery_vault_error",
        message: String(error?.message || "Recovery Vault failed."),
      }), {
        status: 500,
        headers: jsonHeaders,
      });
    }
  }

  if (url.pathname === "/auth/challenge" && request.method === "POST") {
    if (!env.DB) {
      return new Response(JSON.stringify({ error: "DB not configured" }), {
        status: 500,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    }

    try {
      const body = await request.json().catch(() => ({}));
      const verifiedRevenueCatAppUserId = await resolveVerifiedRevenueCatAppUserId(request, env);
      const authenticatedActor =
        body?.intent === "rotate"
          ? await resolveAuthenticatedActor(request, env.DB, env)
          : null;
      if (body?.intent === "rotate" && !authenticatedActor) {
        return new Response(JSON.stringify({ error: "identity_session_required" }), {
          status: 401,
          headers: buildHeaders(cors, { "Content-Type": "application/json" }),
        });
      }

      const challenge = await createIdentityChallenge(env.DB, env, {
        publicKeyJwk: body?.publicKeyJwk,
        verifiedRevenueCatAppUserId,
        legacyDeviceId: body?.legacyDeviceId,
        intent: body?.intent,
        actor: authenticatedActor,
        nextPublicKeyJwk: body?.nextPublicKeyJwk,
      });
      return new Response(JSON.stringify(challenge), {
        status: 200,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    } catch (error) {
      const message = String(error?.message || "");
      const status =
        message === "identity_rotation_requires_authenticated_actor" ||
        message === "identity_session_required"
          ? 401
          : message.includes("identity_public_key") || message.includes("identity_rotation_next_key_missing")
            ? 400
            : 500;
      workerLog(env, status >= 500 ? "error" : "warn", "identity-session", "Failed to create identity challenge", {
        error,
        status,
      });
      return new Response(JSON.stringify({ error: message || "identity_challenge_failed" }), {
        status,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    }
  }

  if (url.pathname === "/auth/session" && request.method === "POST") {
    if (!env.DB) {
      return new Response(JSON.stringify({ error: "DB not configured" }), {
        status: 500,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    }

    try {
      const body = await request.json().catch(() => ({}));
      const verifiedRevenueCatAppUserId = await resolveVerifiedRevenueCatAppUserId(request, env);
      const verifiedAppleIdentity = body?.appleIdentityToken
        ? await verifyAppleIdentityToken(body.appleIdentityToken, env)
        : null;
      let session;
      if (body?.intent === "rotate") {
        const authenticatedActor = await resolveAuthenticatedActor(request, env.DB, env);
        if (!authenticatedActor) {
          return new Response(JSON.stringify({ error: "identity_session_required" }), {
            status: 401,
            headers: buildHeaders(cors, { "Content-Type": "application/json" }),
          });
        }
        session = await rotateIdentityDeviceKey(env.DB, env, {
          challengeId: body?.challengeId,
          nonce: body?.nonce,
          currentSignature: body?.currentSignature,
          nextPublicKeyJwk: body?.nextPublicKeyJwk,
          nextSignature: body?.nextSignature,
        });
      } else {
        session = await completeIdentityChallenge(env.DB, env, {
          challengeId: body?.challengeId,
          nonce: body?.nonce,
          publicKeyJwk: body?.publicKeyJwk,
          signature: body?.signature,
          legacyDeviceId: body?.legacyDeviceId,
          verifiedRevenueCatAppUserId,
          verifiedAppleUserId: verifiedAppleIdentity?.appleUserId || "",
        });
      }

      return new Response(JSON.stringify(session), {
        status: 200,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    } catch (error) {
      const message = String(error?.message || "");
      const status =
        message === "identity_proof_required"
          ? 409
          : message.includes("identity_challenge") ||
              message.includes("identity_key_") ||
              message.includes("identity_signature") ||
              message.includes("apple_identity_")
            ? 401
            : 500;
      workerLog(env, status >= 500 ? "error" : "warn", "identity-session", "Failed to issue identity session", {
        error,
        status,
      });
      return new Response(JSON.stringify({ error: message || "identity_session_failed" }), {
        status,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    }
  }

  if (url.pathname === "/api/admin/audit-log" && request.method === "GET") {
    const authHeader = request.headers.get("Authorization") || "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!env.ADMIN_TOKEN || bearerToken !== env.ADMIN_TOKEN) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    }

    if (!env.DB) {
      return new Response(JSON.stringify({ error: "DB not configured" }), {
        status: 500,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    }

    const { results } = await env.DB.prepare(
      `SELECT id, created_at, provider, model, user_id, prompt_tokens, completion_tokens,
              parse_succeeded, hit_degraded_fallback, response_preview, confidence, drift_warning, drift_details
         FROM audit_log
        ORDER BY created_at DESC
        LIMIT 50`
    ).bind().all();

    return new Response(JSON.stringify({ rows: results || [] }), {
      status: 200,
      headers: buildHeaders(cors, { "Content-Type": "application/json" }),
    });
  }

  if (url.pathname === "/api/admin/plaid-roi" && request.method === "GET") {
    const authHeader = request.headers.get("Authorization") || "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!env.ADMIN_TOKEN || bearerToken !== env.ADMIN_TOKEN) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    }

    if (!env.DB) {
      return new Response(JSON.stringify({ error: "DB not configured" }), {
        status: 500,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    }

    const days = Number(url.searchParams.get("days") || 30);
    const summary = await loadPlaidRoiSummary(env.DB, env, { days });

    return new Response(
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        ...summary,
      }),
      {
        status: 200,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      }
    );
  }

  if (url.pathname === "/api/admin/telemetry-summary" && request.method === "GET") {
    const authHeader = request.headers.get("Authorization") || "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!env.ADMIN_TOKEN || bearerToken !== env.ADMIN_TOKEN) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    }

    if (!env.DB) {
      return new Response(JSON.stringify({ error: "DB not configured" }), {
        status: 500,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    }

    const days = Number(url.searchParams.get("days") || 14);
    const summary = await loadTelemetrySummary(env.DB, { days });

    return new Response(
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        ...summary,
      }),
      {
        status: 200,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      }
    );
  }

  if (url.pathname === "/api/audit-log/outcome" && request.method === "POST") {
    if (!env.DB) {
      return new Response(JSON.stringify({ error: "DB not configured" }), {
        status: 500,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    }

    const { auditLogId, parseSucceeded, hitDegradedFallback, confidence, driftWarning, driftDetails } =
      await request.json().catch(() => ({}));
    if (!auditLogId) {
      return new Response(JSON.stringify({ error: "Missing auditLogId" }), {
        status: 400,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    }

    const callerIds = [
      (request.headers.get("X-RC-App-User-ID") || "").trim(),
      (request.headers.get("X-Device-ID") || "").trim(),
    ].filter(Boolean);
    if (callerIds.length === 0) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    }

    const existingResult = await env.DB.prepare("SELECT user_id FROM audit_log WHERE id = ?").bind(auditLogId).all();
    const existing = Array.isArray(existingResult?.results) ? existingResult.results[0] : null;
    if (!existing?.user_id) {
      return new Response(JSON.stringify({ error: "Audit log not found" }), {
        status: 404,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    }
    if (!callerIds.includes(String(existing.user_id))) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    }

    await updateAuditLogRow(env.DB, auditLogId, {
      parseSucceeded: Boolean(parseSucceeded),
      hitDegradedFallback: Boolean(hitDegradedFallback),
      confidence: typeof confidence === "string" ? confidence : "medium",
      driftWarning: Boolean(driftWarning),
      driftDetails: Array.isArray(driftDetails) ? driftDetails : [],
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: buildHeaders(cors, { "Content-Type": "application/json" }),
    });
  }

  return null;
}
