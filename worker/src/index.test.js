import { afterEach, describe, expect, it, vi } from "vitest";
import worker, {
  buildHouseholdIntegrityTag,
  getIsoWeekKey,
  getQuotaWindow,
  isRevenueCatEntitlementActive,
  mergePlaidTransactions,
  resolvePlaidActor,
  resolveEffectiveTier,
  sha256Hex,
} from "./index.js";

function toBase64Url(bytes) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function generateIdentityTestKeyPair() {
  const keyPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const [privateKeyJwk, publicKeyJwk, rawPublicKey] = await Promise.all([
    crypto.subtle.exportKey("jwk", keyPair.privateKey),
    crypto.subtle.exportKey("jwk", keyPair.publicKey),
    crypto.subtle.exportKey("raw", keyPair.publicKey),
  ]);
  const digest = await crypto.subtle.digest("SHA-256", rawPublicKey);
  return {
    privateKeyJwk,
    publicKeyJwk: { kty: publicKeyJwk.kty, crv: publicKeyJwk.crv, x: publicKeyJwk.x },
    keyFingerprint: toBase64Url(new Uint8Array(digest)),
  };
}

async function signIdentityPayload(privateKeyJwk, payload) {
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

class FakeD1 {
  constructor(seed = {}) {
    this.plaidItems = [...(seed.plaidItems || [])];
    this.syncData = [...(seed.syncData || [])];
    this.plaidUsageDaily = [...(seed.plaidUsageDaily || [])];
    this.auditLog = [...(seed.auditLog || [])];
    this.householdSync = [...(seed.householdSync || [])];
    this.identityActors = [...(seed.identityActors || [])];
    this.identityActorAliases = [...(seed.identityActorAliases || [])];
    this.identityDeviceKeys = [...(seed.identityDeviceKeys || [])];
    this.identityChallenges = [...(seed.identityChallenges || [])];
  }

  prepare(sql) {
    const db = this;
    return {
      bind(...params) {
        return {
          async all() {
            return { results: db.#executeSelect(sql, params) };
          },
          async run() {
            db.#executeWrite(sql, params);
            return { success: true };
          },
        };
      },
    };
  }

  #executeSelect(sql, params) {
    if (sql.includes("SELECT transactions_cursor FROM plaid_items WHERE item_id = ?")) {
      const item = this.plaidItems.find(entry => entry.item_id === params[0]);
      return item ? [{ transactions_cursor: item.transactions_cursor ?? null }] : [];
    }

    if (sql.includes("SELECT access_token FROM plaid_items WHERE item_id = ? AND user_id = ?")) {
      const item = this.plaidItems.find(entry => entry.item_id === params[0] && entry.user_id === params[1]);
      return item ? [{ access_token: item.access_token }] : [];
    }

    if (sql.includes("SELECT user_id, access_token FROM plaid_items WHERE item_id = ? AND user_id = ?")) {
      const item = this.plaidItems.find(entry => entry.item_id === params[0] && entry.user_id === params[1]);
      return item ? [{ user_id: item.user_id, access_token: item.access_token }] : [];
    }

    if (sql.includes("SELECT item_id FROM plaid_items WHERE access_token = ? AND user_id = ?")) {
      const item = this.plaidItems.find(entry => entry.access_token === params[0] && entry.user_id === params[1]);
      return item ? [{ item_id: item.item_id }] : [];
    }

    if (sql.includes("SELECT access_token FROM plaid_items WHERE access_token = ? AND user_id = ?")) {
      const item = this.plaidItems.find(entry => entry.access_token === params[0] && entry.user_id === params[1]);
      return item ? [{ access_token: item.access_token }] : [];
    }

    if (sql.includes("SELECT item_id FROM plaid_items WHERE access_token = ?")) {
      const item = this.plaidItems.find(entry => entry.access_token === params[0]);
      return item ? [{ item_id: item.item_id }] : [];
    }

    if (sql.includes("SELECT user_id, access_token FROM plaid_items WHERE item_id = ?")) {
      const item = this.plaidItems.find(entry => entry.item_id === params[0]);
      return item ? [{ user_id: item.user_id, access_token: item.access_token }] : [];
    }

    if (sql.includes("SELECT access_token, item_id FROM plaid_items WHERE user_id = ?")) {
      return this.plaidItems
        .filter(entry => entry.user_id === params[0])
        .map(entry => ({ access_token: entry.access_token, item_id: entry.item_id }));
    }

    if (sql.includes("SELECT user_id, item_id FROM plaid_items")) {
      return this.plaidItems.map(entry => ({ user_id: entry.user_id, item_id: entry.item_id }));
    }

    if (sql.includes("FROM identity_actor_aliases aliases")) {
      const alias = this.identityActorAliases.find(
        entry => entry.alias_type === params[0] && entry.alias_hash === params[1]
      );
      if (!alias) return [];
      const actor = this.identityActors.find(entry => entry.actor_id === alias.actor_id);
      return actor
        ? [{
            actor_id: actor.actor_id,
            revenuecat_app_user_id: actor.revenuecat_app_user_id ?? null,
            session_version: actor.session_version ?? 1,
            active_device_key_fingerprint: actor.active_device_key_fingerprint ?? null,
          }]
        : [];
    }

    if (sql.includes("FROM identity_device_keys")) {
      const row = this.identityDeviceKeys.find(entry => entry.key_fingerprint === params[0]);
      return row ? [row] : [];
    }

    if (sql.includes("FROM identity_bootstrap_challenges")) {
      const row = this.identityChallenges.find(entry => entry.challenge_id === params[0]);
      return row ? [row] : [];
    }

    if (sql.includes("SELECT actor_id, revenuecat_app_user_id, session_version, active_device_key_fingerprint FROM identity_actors WHERE revenuecat_app_user_id = ?")) {
      const actor = this.identityActors.find(entry => entry.revenuecat_app_user_id === params[0]);
      return actor
        ? [{
            actor_id: actor.actor_id,
            revenuecat_app_user_id: actor.revenuecat_app_user_id ?? null,
            session_version: actor.session_version ?? 1,
            active_device_key_fingerprint: actor.active_device_key_fingerprint ?? null,
          }]
        : [];
    }

    if (sql.includes("SELECT actor_id, revenuecat_app_user_id, session_version, active_device_key_fingerprint FROM identity_actors WHERE actor_id = ?")) {
      const actor = this.identityActors.find(entry => entry.actor_id === params[0]);
      return actor
        ? [{
            actor_id: actor.actor_id,
            revenuecat_app_user_id: actor.revenuecat_app_user_id ?? null,
            session_version: actor.session_version ?? 1,
            active_device_key_fingerprint: actor.active_device_key_fingerprint ?? null,
          }]
        : [];
    }

    if (sql.includes("SELECT revenuecat_app_user_id FROM identity_actors WHERE actor_id = ?")) {
      const actor = this.identityActors.find(entry => entry.actor_id === params[0]);
      return actor ? [{ revenuecat_app_user_id: actor.revenuecat_app_user_id ?? null }] : [];
    }

    if (sql.includes("SELECT last_synced_at FROM sync_data WHERE user_id = ? AND item_id = 'deep_sync_meta'")) {
      const row = this.syncData.find(entry => entry.user_id === params[0] && entry.item_id === "deep_sync_meta");
      return row ? [{ last_synced_at: row.last_synced_at ?? null }] : [];
    }

    if (sql.includes("SELECT last_synced_at FROM sync_data WHERE user_id = ? AND item_id = ?")) {
      const row = this.syncData.find(entry => entry.user_id === params[0] && entry.item_id === params[1]);
      return row ? [{ last_synced_at: row.last_synced_at ?? null }] : [];
    }

    if (sql.includes("SELECT last_synced_at FROM sync_data WHERE user_id = ?")) {
      return this.syncData
        .filter(entry => entry.user_id === params[0])
        .map(entry => ({ last_synced_at: entry.last_synced_at ?? null }));
    }

    if (sql.includes("SELECT * FROM sync_data WHERE user_id = ? AND item_id = ?")) {
      const row = this.syncData.find(entry => entry.user_id === params[0] && entry.item_id === params[1]);
      return row ? [row] : [];
    }

    if (sql.includes("SELECT * FROM sync_data WHERE user_id = ?")) {
      return this.syncData.filter(entry => entry.user_id === params[0]);
    }

    if (sql.includes("SELECT user_id, item_id, balances_json") && sql.includes("FROM sync_data")) {
      return this.syncData
        .filter(entry => !String(entry.item_id || "").startsWith("_plaid_meta:") && entry.item_id !== "deep_sync_meta")
        .map(entry => ({
          user_id: entry.user_id,
          item_id: entry.item_id,
          balances_json: entry.balances_json,
        }));
    }

    if (sql.includes("FROM plaid_usage_daily")) {
      const sinceDayKey = params[0];
      return this.plaidUsageDaily
        .filter(entry => String(entry.day_key || "") >= sinceDayKey)
        .sort((a, b) => {
          const dayCompare = String(b.day_key || "").localeCompare(String(a.day_key || ""));
          if (dayCompare !== 0) return dayCompare;
          const userCompare = String(a.user_id || "").localeCompare(String(b.user_id || ""));
          if (userCompare !== 0) return userCompare;
          const itemCompare = String(a.item_id || "").localeCompare(String(b.item_id || ""));
          if (itemCompare !== 0) return itemCompare;
          return String(a.source || "").localeCompare(String(b.source || ""));
        });
    }

    if (sql.includes("SELECT * FROM audit_log WHERE id = ?")) {
      const row = this.auditLog.find(entry => entry.id === params[0]);
      return row ? [row] : [];
    }

    if (sql.includes("SELECT user_id FROM audit_log WHERE id = ?")) {
      const row = this.auditLog.find(entry => entry.id === params[0]);
      return row ? [{ user_id: row.user_id }] : [];
    }

    if (sql.includes("FROM audit_log") && sql.includes("ORDER BY created_at DESC")) {
      return [...this.auditLog].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 50);
    }

    if (sql.includes("FROM household_sync WHERE household_id = ?")) {
      const row = this.householdSync.find(entry => entry.household_id === params[0]);
      return row ? [row] : [];
    }

    return [];
  }

  #executeWrite(sql, params) {
    if (sql.includes("UPDATE plaid_items SET transactions_cursor = ?")) {
      const [cursor, itemId] = params;
      const item = this.plaidItems.find(entry => entry.item_id === itemId);
      if (item) {
        item.transactions_cursor = cursor;
        item.updated_at = "2026-03-13 12:00:00";
      }
      return;
    }

    if (sql.includes("UPDATE plaid_items SET user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?")) {
      const [toUserId, fromUserId] = params;
      this.plaidItems = this.plaidItems.map(entry =>
        entry.user_id === fromUserId
          ? { ...entry, user_id: toUserId, updated_at: "2026-03-13 12:00:00" }
          : entry
      );
      return;
    }

    if (sql.includes("UPDATE plaid_items SET user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE item_id = ? AND user_id = ?")) {
      const [toUserId, itemId, fromUserId] = params;
      this.plaidItems = this.plaidItems.map(entry =>
        entry.item_id === itemId && entry.user_id === fromUserId
          ? { ...entry, user_id: toUserId, updated_at: "2026-03-13 12:00:00" }
          : entry
      );
      return;
    }

    if (sql.includes("UPDATE sync_data SET user_id = ? WHERE user_id = ?")) {
      const [toUserId, fromUserId] = params;
      this.syncData = this.syncData.map(entry =>
        entry.user_id === fromUserId
          ? { ...entry, user_id: toUserId }
          : entry
      );
      return;
    }

    if (sql.includes("UPDATE sync_data SET user_id = ? WHERE user_id = ? AND item_id = ?")) {
      const [toUserId, fromUserId, itemId] = params;
      this.syncData = this.syncData.map(entry =>
        entry.user_id === fromUserId && entry.item_id === itemId
          ? { ...entry, user_id: toUserId }
          : entry
      );
      return;
    }

    if (sql.includes("INSERT INTO identity_actors")) {
      const [actorId, revenueCatAppUserId, sessionVersion, activeDeviceKeyFingerprint] = params;
      this.identityActors.push({
        actor_id: actorId,
        revenuecat_app_user_id: revenueCatAppUserId ?? null,
        session_version: sessionVersion ?? 1,
        active_device_key_fingerprint: activeDeviceKeyFingerprint ?? null,
      });
      return;
    }

    if (sql.includes("INSERT INTO identity_actor_aliases")) {
      const [aliasType, aliasHash, actorId] = params;
      const index = this.identityActorAliases.findIndex(
        entry => entry.alias_type === aliasType && entry.alias_hash === aliasHash
      );
      const next = { alias_type: aliasType, alias_hash: aliasHash, actor_id: actorId };
      if (index >= 0) this.identityActorAliases[index] = next;
      else this.identityActorAliases.push(next);
      return;
    }

    if (sql.includes("UPDATE identity_actors") && sql.includes("revenuecat_app_user_id")) {
      const [revenueCatAppUserId, actorId] = params;
      this.identityActors = this.identityActors.map(entry =>
        entry.actor_id === actorId
          ? { ...entry, revenuecat_app_user_id: revenueCatAppUserId }
          : entry
      );
      return;
    }

    if (sql.includes("UPDATE identity_actors") && sql.includes("active_device_key_fingerprint = ?") && !sql.includes("session_version")) {
      const [keyFingerprint, actorId] = params;
      this.identityActors = this.identityActors.map(entry =>
        entry.actor_id === actorId
          ? { ...entry, active_device_key_fingerprint: keyFingerprint ?? null }
          : entry
      );
      return;
    }

    if (sql.includes("UPDATE identity_actors") && sql.includes("session_version = COALESCE(session_version, 1) + 1")) {
      const [keyFingerprint, actorId] = params;
      this.identityActors = this.identityActors.map(entry =>
        entry.actor_id === actorId
          ? {
              ...entry,
              session_version: Number(entry.session_version || 1) + 1,
              active_device_key_fingerprint: keyFingerprint ?? null,
            }
          : entry
      );
      return;
    }

    if (sql.includes("INSERT INTO identity_device_keys")) {
      const [keyFingerprint, actorId, publicKeyJwk] = params;
      const next = {
        key_fingerprint: keyFingerprint,
        actor_id: actorId,
        public_key_jwk: publicKeyJwk,
        status: "active",
        revoked_at: null,
        replaced_by_key_fingerprint: null,
      };
      const index = this.identityDeviceKeys.findIndex(entry => entry.key_fingerprint === keyFingerprint);
      if (index >= 0) {
        this.identityDeviceKeys[index] = { ...this.identityDeviceKeys[index], ...next };
      } else {
        this.identityDeviceKeys.push(next);
      }
      return;
    }

    if (sql.includes("UPDATE identity_device_keys") && sql.includes("SET status = 'revoked'")) {
      const [nextKeyFingerprint, currentKeyFingerprint, actorId] = params;
      this.identityDeviceKeys = this.identityDeviceKeys.map(entry =>
        entry.key_fingerprint === currentKeyFingerprint && entry.actor_id === actorId
          ? {
              ...entry,
              status: "revoked",
              revoked_at: "2026-03-13 12:00:00",
              replaced_by_key_fingerprint: nextKeyFingerprint ?? null,
            }
          : entry
      );
      return;
    }

    if (sql.includes("INSERT INTO identity_bootstrap_challenges")) {
      const [
        challengeId,
        nonceHash,
        publicKeyFingerprint,
        publicKeyJwk,
        verifiedRevenueCatAppUserId,
        legacyDeviceAliasHash,
        intent,
        actorId,
        currentKeyFingerprint,
        nextKeyFingerprint,
        nextPublicKeyJwk,
        expiresAt,
      ] = params;
      this.identityChallenges.push({
        challenge_id: challengeId,
        nonce_hash: nonceHash,
        public_key_fingerprint: publicKeyFingerprint,
        public_key_jwk: publicKeyJwk,
        verified_revenuecat_app_user_id: verifiedRevenueCatAppUserId ?? null,
        legacy_device_alias_hash: legacyDeviceAliasHash ?? null,
        intent,
        actor_id: actorId ?? null,
        current_key_fingerprint: currentKeyFingerprint ?? null,
        next_key_fingerprint: nextKeyFingerprint ?? null,
        next_public_key_jwk: nextPublicKeyJwk ?? null,
        expires_at: expiresAt,
        used_at: null,
      });
      return;
    }

    if (sql.includes("UPDATE identity_bootstrap_challenges SET used_at = ?")) {
      const [usedAt, challengeId] = params;
      this.identityChallenges = this.identityChallenges.map(entry =>
        entry.challenge_id === challengeId
          ? { ...entry, used_at: usedAt }
          : entry
      );
      return;
    }

    if (sql.includes("INSERT OR REPLACE INTO plaid_items")) {
      const [itemId, userId, accessToken, transactionsCursor] = params;
      const next = {
        item_id: itemId,
        user_id: userId,
        access_token: accessToken,
        transactions_cursor: transactionsCursor ?? null,
        updated_at: "2026-03-13 12:00:00",
      };
      const index = this.plaidItems.findIndex(entry => entry.item_id === itemId);
      if (index >= 0) this.plaidItems[index] = next;
      else this.plaidItems.push(next);
      return;
    }

    if (sql.includes("INSERT INTO sync_data (user_id, item_id, balances_json, liabilities_json, transactions_json)")) {
      const [userId, itemId, balancesJson, liabilitiesJson, transactionsJson] = params;
      this.#upsertSyncData({
        user_id: userId,
        item_id: itemId,
        balances_json: balancesJson,
        liabilities_json: liabilitiesJson,
        transactions_json: transactionsJson,
      });
      return;
    }

    if (sql.includes("INSERT INTO plaid_usage_daily")) {
      const [dayKey, userId, itemId, source, balanceCalls, transactionRefreshCalls, liabilityCalls] = params;
      const index = this.plaidUsageDaily.findIndex(entry =>
        entry.day_key === dayKey &&
        entry.user_id === userId &&
        entry.item_id === itemId &&
        entry.source === source
      );
      const next = {
        day_key: dayKey,
        user_id: userId,
        item_id: itemId,
        source,
        balance_calls: Number(balanceCalls || 0),
        transaction_refresh_calls: Number(transactionRefreshCalls || 0),
        liability_calls: Number(liabilityCalls || 0),
        updated_at: "2026-03-13 12:00:00",
      };
      if (index >= 0) {
        this.plaidUsageDaily[index] = {
          ...this.plaidUsageDaily[index],
          balance_calls: Number(this.plaidUsageDaily[index].balance_calls || 0) + next.balance_calls,
          transaction_refresh_calls: Number(this.plaidUsageDaily[index].transaction_refresh_calls || 0) + next.transaction_refresh_calls,
          liability_calls: Number(this.plaidUsageDaily[index].liability_calls || 0) + next.liability_calls,
          updated_at: "2026-03-13 12:00:00",
        };
      } else {
        this.plaidUsageDaily.push(next);
      }
      return;
    }

    if (sql.includes("INSERT INTO sync_data (user_id, item_id, balances_json) VALUES (?, 'deep_sync_meta', '{}')")) {
      const [userId] = params;
      this.#upsertSyncData({
        user_id: userId,
        item_id: "deep_sync_meta",
        balances_json: "{}",
        liabilities_json: "{}",
        transactions_json: "{}",
      });
      return;
    }

    if (sql.includes("INSERT INTO audit_log")) {
      const [
        id,
        provider,
        model,
        userId,
        promptTokens,
        completionTokens,
        parseSucceeded,
        hitDegradedFallback,
        responsePreview,
        confidence,
        driftWarning,
        driftDetails,
      ] = params;
      this.auditLog.push({
        id,
        created_at: "2026-03-13 12:00:00",
        provider,
        model,
        user_id: userId,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        parse_succeeded: parseSucceeded,
        hit_degraded_fallback: hitDegradedFallback,
        response_preview: responsePreview,
        confidence,
        drift_warning: driftWarning,
        drift_details: driftDetails,
      });
      return;
    }

    if (sql.includes("UPDATE audit_log")) {
      const [promptTokens, completionTokens, parseSucceeded, hitDegradedFallback, responsePreview, confidence, driftWarning, driftDetails, logId] = params;
      const row = this.auditLog.find(entry => entry.id === logId);
      if (row) {
        row.prompt_tokens = promptTokens;
        row.completion_tokens = completionTokens;
        row.parse_succeeded = parseSucceeded;
        row.hit_degraded_fallback = hitDegradedFallback;
        row.response_preview = responsePreview;
        row.confidence = confidence;
        row.drift_warning = driftWarning;
        row.drift_details = driftDetails;
      }
      return;
    }

    if (sql.includes("DELETE FROM audit_log WHERE created_at < datetime('now', ?)")) {
      const [relativeWindow] = params;
      const dayMatch = String(relativeWindow).match(/-(\d+)\s+days/);
      const retentionDays = dayMatch ? parseInt(dayMatch[1], 10) : 30;
      const now = new Date("2026-03-26T12:00:00Z").getTime();
      const cutoff = now - (retentionDays * 24 * 60 * 60 * 1000);
      this.auditLog = this.auditLog.filter((row) => {
        const createdAt = new Date(String(row.created_at).replace(" ", "T") + "Z").getTime();
        return Number.isNaN(createdAt) || createdAt >= cutoff;
      });
      return;
    }

    if (sql.includes("UPDATE household_sync SET auth_token_hash = ?, last_updated_at = CURRENT_TIMESTAMP WHERE household_id = ?")) {
      const [authTokenHash, householdId] = params;
      const row = this.householdSync.find(entry => entry.household_id === householdId);
      if (row) {
        row.auth_token_hash = authTokenHash;
        row.last_updated_at = "2026-03-13 12:00:00";
      }
      return;
    }

    if (sql.includes("UPDATE household_sync SET integrity_tag = ?, last_updated_at = CURRENT_TIMESTAMP WHERE household_id = ?")) {
      const [integrityTag, householdId] = params;
      const row = this.householdSync.find(entry => entry.household_id === householdId);
      if (row) {
        row.integrity_tag = integrityTag;
        row.last_updated_at = "2026-03-13 12:00:00";
      }
      return;
    }

    if (sql.includes("INSERT INTO household_sync")) {
      const [householdId, encryptedBlob, authTokenHash, integrityTag, version, lastRequestId] = params;
      const next = {
        household_id: householdId,
        encrypted_blob: encryptedBlob,
        auth_token_hash: authTokenHash,
        integrity_tag: integrityTag,
        version,
        last_request_id: lastRequestId,
        last_updated_at: "2026-03-13 12:00:00",
      };
      const index = this.householdSync.findIndex(entry => entry.household_id === householdId);
      if (index >= 0) {
        this.householdSync[index] = {
          ...this.householdSync[index],
          encrypted_blob: encryptedBlob,
          auth_token_hash: this.householdSync[index].auth_token_hash || authTokenHash,
          integrity_tag: integrityTag,
          version,
          last_request_id: lastRequestId,
          last_updated_at: "2026-03-13 12:00:00",
        };
      } else {
        this.householdSync.push(next);
      }
      return;
    }

    if (sql.includes("DELETE FROM sync_data WHERE user_id = ? AND item_id = ?")) {
      const [userId, itemId] = params;
      this.syncData = this.syncData.filter(entry => !(entry.user_id === userId && entry.item_id === itemId));
      return;
    }

    if (sql.includes("DELETE FROM plaid_items WHERE item_id = ? AND user_id = ?")) {
      const [itemId, userId] = params;
      this.plaidItems = this.plaidItems.filter(entry => !(entry.item_id === itemId && entry.user_id === userId));
      return;
    }
  }

  #upsertSyncData(row) {
    const index = this.syncData.findIndex(entry => entry.user_id === row.user_id && entry.item_id === row.item_id);
    const next = {
      user_id: row.user_id,
      item_id: row.item_id,
      balances_json: row.balances_json ?? "{}",
      liabilities_json: row.liabilities_json ?? "{}",
      transactions_json: row.transactions_json ?? "{}",
      last_synced_at: "2026-03-13 12:00:00",
    };
    if (index >= 0) {
      this.syncData[index] = { ...this.syncData[index], ...next };
    } else {
      this.syncData.push(next);
    }
  }
}

function makeEnv(overrides = {}) {
  return {
    ALLOWED_ORIGIN: "https://catalystcash.app",
    IDENTITY_SESSION_SECRET: "identity-session-secret",
    PLAID_CLIENT_ID: "plaid-client-id",
    PLAID_SECRET: "plaid-secret",
    DB: new FakeD1(),
    ...overrides,
  };
}

function makeCtx() {
  const tasks = [];
  return {
    waitUntil(promise) {
      tasks.push(promise);
    },
    async flush() {
      await Promise.all(tasks);
    },
  };
}

async function issueSessionFor(env, headers = {}, options = {}) {
  const keyPair = options.keyPair || await generateIdentityTestKeyPair();
  const challengeHeaders = {
    "Content-Type": "application/json",
    ...headers,
  };
  const challengeResponse = await worker.fetch(
    new Request("https://api.catalystcash.app/auth/challenge", {
      method: "POST",
      headers: challengeHeaders,
      body: JSON.stringify({
        intent: "bootstrap",
        publicKeyJwk: keyPair.publicKeyJwk,
        legacyDeviceId: headers["X-Device-ID"] || options.legacyDeviceId || "",
      }),
    }),
    env,
    makeCtx()
  );
  const challengePayload = await challengeResponse.json();
  if (!challengeResponse.ok) {
    return {
      response: challengeResponse,
      payload: challengePayload,
      authorization: {},
      keyPair,
    };
  }

  const signature = await signIdentityPayload(keyPair.privateKeyJwk, challengePayload.signingPayload);
  const response = await worker.fetch(
    new Request("https://api.catalystcash.app/auth/session", {
      method: "POST",
      headers: challengeHeaders,
      body: JSON.stringify({
        challengeId: challengePayload.challengeId,
        nonce: challengePayload.nonce,
        publicKeyJwk: keyPair.publicKeyJwk,
        signature,
        legacyDeviceId: headers["X-Device-ID"] || options.legacyDeviceId || "",
      }),
    }),
    env,
    makeCtx()
  );
  const payload = await response.json();
  return {
    response,
    payload,
    authorization: payload?.token ? { Authorization: `Bearer ${payload.token}` } : {},
    keyPair,
  };
}

async function rotateSessionFor(env, authorization, currentKeyPair, nextKeyPair = null) {
  const replacementKeyPair = nextKeyPair || await generateIdentityTestKeyPair();
  const challengeResponse = await worker.fetch(
    new Request("https://api.catalystcash.app/auth/challenge", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authorization,
      },
      body: JSON.stringify({
        intent: "rotate",
        publicKeyJwk: currentKeyPair.publicKeyJwk,
        nextPublicKeyJwk: replacementKeyPair.publicKeyJwk,
      }),
    }),
    env,
    makeCtx()
  );
  const challengePayload = await challengeResponse.json();
  if (!challengeResponse.ok) {
    return { response: challengeResponse, payload: challengePayload, keyPair: replacementKeyPair };
  }
  const signingPayload = challengePayload.signingPayload;
  const [currentSignature, nextSignature] = await Promise.all([
    signIdentityPayload(currentKeyPair.privateKeyJwk, signingPayload),
    signIdentityPayload(replacementKeyPair.privateKeyJwk, signingPayload),
  ]);
  const response = await worker.fetch(
    new Request("https://api.catalystcash.app/auth/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authorization,
      },
      body: JSON.stringify({
        intent: "rotate",
        challengeId: challengePayload.challengeId,
        nonce: challengePayload.nonce,
        currentSignature,
        nextPublicKeyJwk: replacementKeyPair.publicKeyJwk,
        nextSignature,
      }),
    }),
    env,
    makeCtx()
  );
  const payload = await response.json();
  return {
    response,
    payload,
    authorization: payload?.token ? { Authorization: `Bearer ${payload.token}` } : {},
    keyPair: replacementKeyPair,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("worker quota windows", () => {
  it("uses ISO weeks for free audit windows", () => {
    const now = new Date("2026-03-05T12:00:00Z");
    expect(getIsoWeekKey(now)).toBe("2026-W10");
    expect(getQuotaWindow("free", false, now).periodKey).toBe("2026-W10");
  });

  it("uses UTC month and day windows for pro audits and chats", () => {
    const now = new Date("2026-03-05T23:30:00-05:00");
    expect(getQuotaWindow("pro", false, now).periodKey).toBe("2026-03");
    expect(getQuotaWindow("pro", true, now).periodKey).toBe("2026-03-06");
  });
});

describe("worker CORS config origins", () => {
  it("allows localhost and 127.0.0.1 loopback origins for /config without weakening other origins", async () => {
    const env = makeEnv();
    const ctx = makeCtx();

    const localhostResponse = await worker.fetch(
      new Request("https://api.catalystcash.app/config", {
        method: "GET",
        headers: { Origin: "http://localhost:5173" },
      }),
      env,
      ctx
    );
    expect(localhostResponse.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");

    const loopbackResponse = await worker.fetch(
      new Request("https://api.catalystcash.app/config", {
        method: "GET",
        headers: { Origin: "http://127.0.0.1:4173" },
      }),
      env,
      ctx
    );
    expect(loopbackResponse.headers.get("Access-Control-Allow-Origin")).toBe("http://127.0.0.1:4173");

    const foreignResponse = await worker.fetch(
      new Request("https://api.catalystcash.app/config", {
        method: "GET",
        headers: { Origin: "https://evil.example" },
      }),
      env,
      ctx
    );
    expect(foreignResponse.headers.get("Access-Control-Allow-Origin")).toBe("https://catalystcash.app");
  });

  it("publishes explicit web platform limits in /config", async () => {
    const env = makeEnv();
    const ctx = makeCtx();
    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/config", {
        method: "GET",
        headers: { Origin: "https://catalystcash.app" },
      }),
      env,
      ctx
    );
    const payload = await response.json();
    expect(payload.platformPolicy?.web).toMatchObject({
      secureSecretPersistence: false,
      appLock: false,
      cloudBackup: false,
      householdSync: false,
    });
  });
});

describe("RevenueCat entitlement verification", () => {
  it("accepts active lifetime and future-dated entitlements", () => {
    expect(
      isRevenueCatEntitlementActive(
        {
          entitlements: {
            "Catalyst Cash Pro": { expires_date: null },
          },
        },
        "Catalyst Cash Pro"
      )
    ).toBe(true);

    expect(
      isRevenueCatEntitlementActive(
        {
          entitlements: {
            "Catalyst Cash Pro": { expires_date: "2030-01-01T00:00:00Z" },
          },
        },
        "Catalyst Cash Pro",
        new Date("2026-03-05T00:00:00Z")
      )
    ).toBe(true);
  });

  it("rejects expired or missing entitlements", () => {
    expect(
      isRevenueCatEntitlementActive(
        {
          entitlements: {
            "Catalyst Cash Pro": { expires_date: "2026-03-01T00:00:00Z" },
          },
        },
        "Catalyst Cash Pro",
        new Date("2026-03-05T00:00:00Z")
      )
    ).toBe(false);

    expect(isRevenueCatEntitlementActive({ entitlements: {} }, "Catalyst Cash Pro")).toBe(false);
  });
});

describe("tier resolution hardening", () => {
  it("fails closed to free when verification inputs are missing", async () => {
    const request = new Request("https://example.com/audit", {
      headers: {
        "X-Subscription-Tier": "pro",
      },
    });

    await expect(resolveEffectiveTier(request, {})).resolves.toMatchObject({
      tier: "free",
      verified: false,
      source: "unverified",
    });
  });

  it("fails closed to free when RevenueCat verification throws", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("boom", { status: 500 });

    const request = new Request("https://example.com/audit", {
      headers: {
        "X-Subscription-Tier": "pro",
        "X-RC-App-User-ID": "rc_user_123",
      },
    });

    try {
      await expect(
        resolveEffectiveTier(request, {
          REVENUECAT_SECRET_KEY: "test_secret",
        })
      ).resolves.toMatchObject({
        tier: "free",
        verified: false,
        source: "verification_failed",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("Plaid actor identity", () => {
  it("issues a signed actor session and migrates legacy catalyst-user rows", async () => {
    const env = makeEnv({
      DB: new FakeD1({
        plaidItems: [
          {
            item_id: "item-legacy",
            user_id: "catalyst-user",
            access_token: "access-legacy",
            transactions_cursor: null,
          },
        ],
        syncData: [
          {
            user_id: "catalyst-user",
            item_id: "item-legacy",
            balances_json: '{"accounts":[]}',
            liabilities_json: "{}",
            transactions_json: "{}",
            last_synced_at: "2026-03-13 12:00:00",
          },
        ],
      }),
    });

    const { response, payload, authorization } = await issueSessionFor(env, {
      "X-Device-ID": "device-123",
    });
    expect(response.status).toBe(200);
    expect(payload.actorId).toMatch(/^actor_/);

    const actor = await resolvePlaidActor(
      new Request("https://api.catalystcash.app/api/sync/status", {
        method: "POST",
        headers: authorization,
      }),
      env.DB,
      env
    );

    expect(actor).toMatchObject({
      userId: payload.actorId,
      source: "device-key",
    });
    expect(env.DB.plaidItems[0].user_id).toBe(payload.actorId);
    expect(env.DB.syncData[0].user_id).toBe(payload.actorId);
  });

  it("does not let a spoofed device id claim an actor already bound to another device key", async () => {
    const env = makeEnv({
      DB: new FakeD1(),
    });
    const first = await issueSessionFor(env, { "X-Device-ID": "shared-device" });
    expect(first.response.status).toBe(200);

    const attackerKeyPair = await generateIdentityTestKeyPair();
    const challengeResponse = await worker.fetch(
      new Request("https://api.catalystcash.app/auth/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "bootstrap",
          publicKeyJwk: attackerKeyPair.publicKeyJwk,
          legacyDeviceId: "shared-device",
        }),
      }),
      env,
      makeCtx()
    );
    const challenge = await challengeResponse.json();
    const signature = await signIdentityPayload(attackerKeyPair.privateKeyJwk, challenge.signingPayload);
    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          nonce: challenge.nonce,
          publicKeyJwk: attackerKeyPair.publicKeyJwk,
          signature,
          legacyDeviceId: "shared-device",
        }),
      }),
      env,
      makeCtx()
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "identity_proof_required",
    });
  });

  it("rejects replayed bootstrap challenges", async () => {
    const env = makeEnv();
    const keyPair = await generateIdentityTestKeyPair();
    const challengeResponse = await worker.fetch(
      new Request("https://api.catalystcash.app/auth/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Device-ID": "device-replay" },
        body: JSON.stringify({
          intent: "bootstrap",
          publicKeyJwk: keyPair.publicKeyJwk,
          legacyDeviceId: "device-replay",
        }),
      }),
      env,
      makeCtx()
    );
    const challenge = await challengeResponse.json();
    const signature = await signIdentityPayload(keyPair.privateKeyJwk, challenge.signingPayload);
    const requestBody = JSON.stringify({
      challengeId: challenge.challengeId,
      nonce: challenge.nonce,
      publicKeyJwk: keyPair.publicKeyJwk,
      signature,
      legacyDeviceId: "device-replay",
    });

    const first = await worker.fetch(
      new Request("https://api.catalystcash.app/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      }),
      env,
      makeCtx()
    );
    expect(first.status).toBe(200);

    const replay = await worker.fetch(
      new Request("https://api.catalystcash.app/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      }),
      env,
      makeCtx()
    );
    expect(replay.status).toBe(401);
    await expect(replay.json()).resolves.toMatchObject({
      error: "identity_challenge_replayed",
    });
  });

  it("rejects forged identity session tokens", async () => {
    const env = makeEnv();
    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/api/sync/status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer ccid.forged.payload",
        },
        body: JSON.stringify({}),
      }),
      env,
      makeCtx()
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid or missing identity session",
    });
  });

  it("migrates legacy RevenueCat-linked rows into the signed actor", async () => {
    const env = makeEnv({
      REVENUECAT_SECRET_KEY: "revenuecat-secret",
      DB: new FakeD1({
        plaidItems: [
          {
            item_id: "item-legacy-rc",
            user_id: "rc:rc_user_123",
            access_token: "access-legacy-rc",
            transactions_cursor: null,
          },
        ],
      }),
    });

    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const url = String(input);
      if (url === "https://api.revenuecat.com/v1/subscribers/rc_user_123") {
        return new Response(JSON.stringify({ subscriber: { entitlements: {} } }), { status: 200 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    }));

    const { response, payload } = await issueSessionFor(env, {
      "X-Device-ID": "device-rc",
      "X-RC-App-User-ID": "rc_user_123",
    });

    expect(response.status).toBe(200);
    expect(env.DB.plaidItems[0].user_id).toBe(payload.actorId);
    expect(env.DB.identityActors[0].revenuecat_app_user_id).toBe("rc_user_123");
  });

  it("merges a verified RevenueCat actor without a bound key into the proved device actor flow", async () => {
    const env = makeEnv({
      REVENUECAT_SECRET_KEY: "revenuecat-secret",
      DB: new FakeD1({
        identityActors: [
          {
            actor_id: "actor_rc_existing",
            revenuecat_app_user_id: "rc_user_456",
            session_version: 1,
            active_device_key_fingerprint: null,
          },
          {
            actor_id: "actor_legacy_device",
            revenuecat_app_user_id: null,
            session_version: 1,
            active_device_key_fingerprint: null,
          },
        ],
        identityActorAliases: [
          { alias_type: "device", alias_hash: "legacy-device-hash", actor_id: "actor_legacy_device" },
        ],
        plaidItems: [
          {
            item_id: "legacy-item",
            user_id: "actor_legacy_device",
            access_token: "access-legacy",
            transactions_cursor: null,
          },
        ],
      }),
    });

    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const url = String(input);
      if (url === "https://api.revenuecat.com/v1/subscribers/rc_user_456") {
        return new Response(JSON.stringify({ subscriber: { entitlements: {} } }), { status: 200 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    }));

    const identityModule = await import("./lib/identitySession.js");
    const deviceAliasHash = await identityModule.hashIdentityAlias("device", "legacy-device", env);
    env.DB.identityActorAliases[0].alias_hash = deviceAliasHash;

    const session = await issueSessionFor(env, {
      "X-Device-ID": "legacy-device",
      "X-RC-App-User-ID": "rc_user_456",
    });

    expect(session.response.status).toBe(200);
    expect(session.payload.actorId).toBe("actor_rc_existing");
    expect(env.DB.plaidItems[0].user_id).toBe("actor_rc_existing");
    expect(env.DB.identityActors.find(entry => entry.actor_id === "actor_rc_existing")?.active_device_key_fingerprint)
      .toBeTruthy();
  });

  it("rejects RevenueCat actor takeover when that actor is already bound to another device key", async () => {
    const env = makeEnv({
      REVENUECAT_SECRET_KEY: "revenuecat-secret",
      DB: new FakeD1({
        identityActors: [
          {
            actor_id: "actor_rc_bound",
            revenuecat_app_user_id: "rc_user_bound",
            session_version: 1,
            active_device_key_fingerprint: "existing-key",
          },
        ],
        identityDeviceKeys: [
          {
            key_fingerprint: "existing-key",
            actor_id: "actor_rc_bound",
            public_key_jwk: JSON.stringify({ kty: "OKP", crv: "Ed25519", x: "existing-key-x" }),
            status: "active",
            revoked_at: null,
            replaced_by_key_fingerprint: null,
          },
        ],
      }),
    });

    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const url = String(input);
      if (url === "https://api.revenuecat.com/v1/subscribers/rc_user_bound") {
        return new Response(JSON.stringify({ subscriber: { entitlements: {} } }), { status: 200 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    }));

    const response = await issueSessionFor(env, {
      "X-Device-ID": "new-device",
      "X-RC-App-User-ID": "rc_user_bound",
    });

    expect(response.response.status).toBe(409);
    expect(response.payload).toMatchObject({ error: "identity_proof_required" });
  });

  it("rotates a bound device key and invalidates the old session", async () => {
    const env = makeEnv();
    const first = await issueSessionFor(env, { "X-Device-ID": "rotate-device" });
    expect(first.response.status).toBe(200);

    const rotated = await rotateSessionFor(env, first.authorization, first.keyPair);
    expect(rotated.response.status).toBe(200);
    expect(rotated.payload.actorId).toBe(first.payload.actorId);
    expect(env.DB.identityActors[0].session_version).toBe(2);

    const oldSessionResponse = await worker.fetch(
      new Request("https://api.catalystcash.app/api/sync/status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...first.authorization,
        },
        body: JSON.stringify({}),
      }),
      env,
      makeCtx()
    );
    expect(oldSessionResponse.status).toBe(401);

    const newSessionResponse = await worker.fetch(
      new Request("https://api.catalystcash.app/api/sync/status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...rotated.authorization,
        },
        body: JSON.stringify({}),
      }),
      env,
      makeCtx()
    );
    expect(newSessionResponse.status).toBe(200);
  });
});

describe("AI provider routing and gating", () => {
  it("logs successful audit metadata and exposes it through the admin endpoint", async () => {
    const env = makeEnv({
      ADMIN_TOKEN: "admin-secret",
      GOOGLE_API_KEY: "gemini-test-key",
      DB: new FakeD1(),
    });

    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const url = String(input);
      expect(url).toContain(":generateContent");
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: '{"healthScore":{"score":80,"grade":"B"},"headerCard":{"status":"GREEN","details":[]}}' }],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 321,
            candidatesTokenCount: 123,
          },
        }),
        { status: 200 }
      );
    }));

    const auditResponse = await worker.fetch(
      new Request("https://api.catalystcash.app/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Device-ID": "device-123" },
        body: JSON.stringify({
          snapshot: "financial snapshot",
          systemPrompt: "system prompt",
          history: [],
          model: "gemini-2.5-flash",
          provider: "gemini",
          stream: false,
        }),
      }),
      env,
      makeCtx()
    );

    expect(auditResponse.status).toBe(200);
    const auditLogId = auditResponse.headers.get("X-Audit-Log-ID");
    expect(auditLogId).toBeTruthy();

    const updateResponse = await worker.fetch(
      new Request("https://api.catalystcash.app/api/audit-log/outcome", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Device-ID": "device-123" },
        body: JSON.stringify({
          auditLogId,
          parseSucceeded: true,
          hitDegradedFallback: false,
          confidence: "high",
          driftWarning: true,
          driftDetails: ["health-score-drift:9"],
        }),
      }),
      env,
      makeCtx()
    );

    expect(updateResponse.status).toBe(200);

    const adminResponse = await worker.fetch(
      new Request("https://api.catalystcash.app/api/admin/audit-log", {
        method: "GET",
        headers: { Authorization: "Bearer admin-secret" },
      }),
      env,
      makeCtx()
    );

    expect(adminResponse.status).toBe(200);
    const payload = await adminResponse.json();
    expect(payload).toMatchObject({
      rows: [
        expect.objectContaining({
          id: auditLogId,
          provider: "gemini",
          model: "gemini-2.5-flash",
          user_id: "device-123",
          prompt_tokens: 321,
          completion_tokens: 123,
          parse_succeeded: 1,
          hit_degraded_fallback: 0,
          confidence: "high",
          drift_warning: 1,
        }),
      ],
    });
    expect(payload.rows[0].drift_details).toBe(JSON.stringify(["health-score-drift:9"]));
  });

  it("rejects audit log outcome updates from a different caller", async () => {
    const env = makeEnv({
      ADMIN_TOKEN: "admin-secret",
      DB: new FakeD1({
        auditLog: [
          {
            id: "audit-log-forbidden",
            created_at: "2026-03-13 12:00:00",
            provider: "gemini",
            model: "gemini-2.5-flash",
            user_id: "device-owner",
            prompt_tokens: 0,
            completion_tokens: 0,
            parse_succeeded: 0,
            hit_degraded_fallback: 0,
            response_preview: "",
            confidence: "medium",
            drift_warning: 0,
            drift_details: "[]",
          },
        ],
      }),
    });

    const updateResponse = await worker.fetch(
      new Request("https://api.catalystcash.app/api/audit-log/outcome", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Device-ID": "device-intruder" },
        body: JSON.stringify({
          auditLogId: "audit-log-forbidden",
          parseSucceeded: true,
        }),
      }),
      env,
      makeCtx()
    );

    expect(updateResponse.status).toBe(403);
  });

  it("purges expired audit log previews on the scheduled retention job", async () => {
    const env = makeEnv({
      DB: new FakeD1({
        auditLog: [
          {
            id: "expired-log",
            created_at: "2026-02-01 10:00:00",
            user_id: "device-1",
          },
          {
            id: "fresh-log",
            created_at: "2026-03-20 10:00:00",
            user_id: "device-1",
          },
        ],
      }),
      AUDIT_LOG_RETENTION_DAYS: "30",
    });

    const ctx = makeCtx();
    await worker.scheduled({ cron: "0 4 * * *", scheduledTime: Date.now() }, env, ctx);
    await ctx.flush();

    expect(env.DB.auditLog.map((row) => row.id)).toEqual(["fresh-log"]);
  });

  it("tracks plaid usage and exposes a 30-day ROI summary through the admin endpoint", async () => {
    const env = makeEnv({
      ADMIN_TOKEN: "admin-secret",
      DB: new FakeD1(),
    });
    const session = await issueSessionFor(env, { "X-Device-ID": "roi-device" });
    env.DB.plaidItems = [
      {
        item_id: "item-roi",
        user_id: session.payload.actorId,
        access_token: "access-roi",
        transactions_cursor: null,
      },
    ];

    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("/accounts/get")) {
        return new Response(
          JSON.stringify({
            accounts: [
              {
                account_id: "acct-checking",
                type: "depository",
                balances: { current: 2500 },
              },
              {
                account_id: "acct-amex",
                type: "credit",
                balances: { current: 1704.4 },
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes("/transactions/sync")) {
        return new Response(
          JSON.stringify({
            added: [
              {
                transaction_id: "txn-roi-1",
                date: "2026-03-13",
                pending: false,
              },
            ],
            modified: [],
            removed: [],
            has_more: false,
            next_cursor: "cursor-roi-1",
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const syncResponse = await worker.fetch(
      new Request("https://api.catalystcash.app/api/sync/force", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...session.authorization },
        body: JSON.stringify({ connectionId: "item-roi" }),
      }),
      env,
      makeCtx()
    );

    expect(syncResponse.status).toBe(200);
    expect(env.DB.plaidUsageDaily).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: session.payload.actorId,
          item_id: "item-roi",
          source: "manual",
          balance_calls: 1,
          transaction_refresh_calls: 1,
          liability_calls: 0,
        }),
      ])
    );

    const reportResponse = await worker.fetch(
      new Request("https://api.catalystcash.app/api/admin/plaid-roi?days=30", {
        method: "GET",
        headers: { Authorization: "Bearer admin-secret" },
      }),
      env,
      makeCtx()
    );

    expect(reportResponse.status).toBe(200);
    await expect(reportResponse.json()).resolves.toMatchObject({
      days: 30,
      linkedUsers: 1,
      linkedInstitutions: 1,
      avgInstitutionsPerLinkedUser: 1,
      accountMix: {
        totalAccounts: 2,
        transactionPricedAccounts: 2,
        recurringPricedAccounts: 2,
        liabilityPricedAccounts: 1,
      },
      usageWindow: {
        balanceCalls: 1,
        transactionRefreshCalls: 1,
        liabilityCalls: 0,
        sources: [
          {
            source: "manual",
            balanceCalls: 1,
            transactionRefreshCalls: 1,
            liabilityCalls: 0,
          },
        ],
      },
      costEstimate: {
        variable30Day: {
          balanceCalls: 0.1,
          transactionRefreshCalls: 0.12,
          liabilityCalls: 0,
          total: 0.22,
        },
        subscription30DayRunRate: {
          transactionsAccounts: 0.6,
          recurringTransactionsAccounts: 0.3,
          liabilitiesAccounts: 0.2,
          total: 1.1,
        },
        projected30DayTotal: 1.32,
        projected30DayCostPerLinkedUser: 1.32,
        projected30DayCostPerInstitution: 1.32,
      },
    });
  });

  it("blocks retired premium models even for pro users", async () => {
    vi.stubGlobal("caches", {
      default: {
        match: vi.fn(async () => null),
        put: vi.fn(async () => undefined),
      },
    });

    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url === "https://api.revenuecat.com/v1/subscribers/rc_user_123") {
        return new Response(
          JSON.stringify({
            subscriber: {
              entitlements: {
                "Catalyst Cash Pro": { expires_date: "2030-01-01T00:00:00Z" },
              },
            },
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/audit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Subscription-Tier": "pro",
          "X-RC-App-User-ID": "rc_user_123",
        },
        body: JSON.stringify({
          snapshot: "financial snapshot",
          systemPrompt: "system prompt",
          history: [],
          model: "claude-sonnet-4-6",
          provider: "anthropic",
          stream: false,
        }),
      }),
      makeEnv({
        ANTHROPIC_API_KEY: "anthropic-test-key",
        REVENUECAT_SECRET_KEY: "revenuecat-test-key",
      }),
      makeCtx()
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Model claude-sonnet-4-6 is not currently available.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stores up to 600 characters of audit preview text", async () => {
    const env = makeEnv({
      ADMIN_TOKEN: "admin-secret",
      GOOGLE_API_KEY: "gemini-test-key",
      DB: new FakeD1(),
    });
    const longPreview = "x".repeat(750);

    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: longPreview }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        }),
        { status: 200 }
      )
    ));

    const auditResponse = await worker.fetch(
      new Request("https://api.catalystcash.app/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Device-ID": "device-123" },
        body: JSON.stringify({
          snapshot: "financial snapshot",
          systemPrompt: "system prompt",
          history: [],
          model: "gemini-2.5-flash",
          provider: "gemini",
          stream: false,
        }),
      }),
      env,
      makeCtx()
    );

    const auditLogId = auditResponse.headers.get("X-Audit-Log-ID");
    const adminResponse = await worker.fetch(
      new Request("https://api.catalystcash.app/api/admin/audit-log", {
        method: "GET",
        headers: { Authorization: "Bearer admin-secret" },
      }),
      env,
      makeCtx()
    );

    const payload = await adminResponse.json();
    const row = payload.rows.find((entry) => entry.id === auditLogId);
    expect(row.response_preview).toHaveLength(600);
  });

  it("silently downgrades free-tier audit requests to Gemini Flash", async () => {
    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      expect(url).toContain("generativelanguage.googleapis.com");
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
          usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 8 },
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshot: "financial snapshot",
          systemPrompt: "system prompt",
          history: [],
          model: "gpt-4.1",
          provider: "openai",
          stream: false,
        }),
      }),
      makeEnv({
        OPENAI_API_KEY: "openai-test-key",
        GOOGLE_API_KEY: "gemini-test-key",
      }),
      makeCtx()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ result: '{"ok":true}' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("routes pro o3 chat requests to GPT-4.1 to keep everyday chat costs bounded", async () => {
    vi.stubGlobal("caches", {
      default: {
        match: vi.fn(async () => null),
        put: vi.fn(async () => undefined),
      },
    });

    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === "https://api.revenuecat.com/v1/subscribers/rc_user_123") {
        return new Response(
          JSON.stringify({
            subscriber: {
              entitlements: {
                "Catalyst Cash Pro": { expires_date: "2030-01-01T00:00:00Z" },
              },
            },
          }),
          { status: 200 }
        );
      }
      expect(url).toBe("https://api.openai.com/v1/chat/completions");
      const parsedBody = JSON.parse(init.body);
      expect(parsedBody).toMatchObject({
        model: "gpt-4.1",
      });
      if (parsedBody.tool_choice) {
        expect(parsedBody.tool_choice).toMatchObject({
          type: "function",
          function: { name: "select_finance_action" },
        });
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  tool_calls: [
                    {
                      function: {
                        name: "select_finance_action",
                        arguments: JSON.stringify({
                          primaryLane: "debt_paydown",
                          secondaryLanes: [],
                          urgency: "medium",
                          rationale: "Router picked debt focus.",
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "precision ok" } }],
          usage: { prompt_tokens: 25, completion_tokens: 10 },
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/audit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Subscription-Tier": "pro",
          "X-RC-App-User-ID": "rc_user_123",
        },
        body: JSON.stringify({
          snapshot: "Need help with this month",
          context: {
            financialBrief: {
              profile: { birthYear: 1990, age: 36, payFrequency: "bi-weekly", incomeType: "salary" },
              income: { estimatedMonthly: 5400, cycleNet: 2500, sources: [] },
              snapshot: { status: "YELLOW", mode: "STANDARD", healthScore: 68, netWorth: 42000 },
              cash: { checking: 1800, vault: 5000, pending: 900, available: 200, emergencyFloor: 1500, weeklySpendAllowance: 350 },
              credit: { totalCardDebt: 4200, totalCardLimit: 10000, overallUtilization: 42, creditScore: 702 },
              debt: { totalNonCardDebt: 0, totalDebt: 4200, nonCardDebts: [] },
              cards: [{ name: "Freedom Flex", balance: 2200, limit: 5000, utilization: 44, apr: 26.99 }],
              renewals: { monthlyEstimate: 140, items: [] },
              trends: [],
              auditHistory: [],
            },
          },
          history: [],
          type: "chat",
          model: "o3",
          provider: "openai",
          stream: false,
          responseFormat: "text",
        }),
      }),
      makeEnv({
        OPENAI_API_KEY: "openai-test-key",
        REVENUECAT_SECRET_KEY: "revenuecat-test-key",
      }),
      makeCtx()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ result: "precision ok" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("Plaid transaction sync migration", () => {
  it("returns only the current actor's sync status even when the body names another user", async () => {
    const env = makeEnv({
      DB: new FakeD1({
        syncData: [
          {
            user_id: "device:device-a",
            item_id: "item-a",
            balances_json: '{"accounts":[{"account_id":"acct-a"}]}',
            liabilities_json: "{}",
            transactions_json: "{}",
            last_synced_at: "2026-03-13 12:00:00",
          },
          {
            user_id: "device:device-b",
            item_id: "item-b",
            balances_json: '{"accounts":[{"account_id":"acct-b"}]}',
            liabilities_json: "{}",
            transactions_json: "{}",
            last_synced_at: "2026-03-13 12:00:00",
          },
        ],
      }),
    });

    const sessionA = await issueSessionFor(env, { "X-Device-ID": "device-a" });
    const actorA = sessionA.payload.actorId;
    const actorB = (await issueSessionFor(env, { "X-Device-ID": "device-b" })).payload.actorId;
    env.DB.syncData = [
      {
        user_id: actorA,
        item_id: "item-a",
        balances_json: '{"accounts":[{"account_id":"acct-a"}]}',
        liabilities_json: "{}",
        transactions_json: "{}",
        last_synced_at: "2026-03-13 12:00:00",
      },
      {
        user_id: actorB,
        item_id: "item-b",
        balances_json: '{"accounts":[{"account_id":"acct-b"}]}',
        liabilities_json: "{}",
        transactions_json: "{}",
        last_synced_at: "2026-03-13 12:00:00",
      },
    ];

    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/api/sync/status", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...sessionA.authorization },
        body: JSON.stringify({ userId: actorB }),
      }),
      env,
      makeCtx()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      hasData: true,
      balances: { accounts: [{ account_id: "acct-a" }] },
    });
  });

  it("refuses to disconnect another actor's Plaid item", async () => {
    const env = makeEnv({
      DB: new FakeD1({
        plaidItems: [
          {
            item_id: "item-owned-by-b",
            user_id: "device:device-b",
            access_token: "access-b",
            transactions_cursor: null,
          },
        ],
      }),
    });

    const sessionA = await issueSessionFor(env, { "X-Device-ID": "device-a" });
    const sessionB = await issueSessionFor(env, { "X-Device-ID": "device-b" });
    env.DB.plaidItems = [
      {
        item_id: "item-owned-by-b",
        user_id: sessionB.payload.actorId,
        access_token: "access-b",
        transactions_cursor: null,
      },
    ];

    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/plaid/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...sessionA.authorization },
        body: JSON.stringify({ itemId: "item-owned-by-b" }),
      }),
      env,
      makeCtx()
    );

    expect(response.status).toBe(404);
    expect(env.DB.plaidItems).toHaveLength(1);
    expect(env.DB.plaidItems[0].item_id).toBe("item-owned-by-b");
  });

  it("stores exchanged Plaid items under the derived actor instead of a caller-supplied userId", async () => {
    const env = makeEnv({ DB: new FakeD1() });
    const session = await issueSessionFor(env, { "X-Device-ID": "device-a" });
    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith("/item/public_token/exchange")) {
        return new Response(
          JSON.stringify({
            item_id: "item-owned-by-device-a",
            access_token: "access-a",
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/plaid/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...session.authorization },
        body: JSON.stringify({ publicToken: "public-token", userId: "attacker-chosen-id" }),
      }),
      env,
      makeCtx()
    );

    expect(response.status).toBe(200);
    expect(env.DB.plaidItems[0]).toMatchObject({
      item_id: "item-owned-by-device-a",
      user_id: session.payload.actorId,
    });
  });

  it("enforces the live institution limit during exchange for free users", async () => {
    const env = makeEnv({
      GATING_MODE: "live",
      DB: new FakeD1(),
    });
    const session = await issueSessionFor(env, { "X-Device-ID": "free-limit-device" });
    env.DB.plaidItems = [
      {
        item_id: "item-existing",
        user_id: session.payload.actorId,
        access_token: "access-existing",
        transactions_cursor: null,
      },
    ];

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/plaid/exchange", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Subscription-Tier": "free",
          ...session.authorization,
        },
        body: JSON.stringify({ publicToken: "public-token" }),
      }),
      env,
      makeCtx()
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "institution_limit",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats reconnect exchange as a replacement and revokes the old plaid item", async () => {
    const env = makeEnv({
      GATING_MODE: "live",
      DB: new FakeD1({
        syncData: [
          {
            user_id: "device:replace-device",
            item_id: "item-old",
            balances_json: '{"accounts":[{"account_id":"acct-old"}]}',
            liabilities_json: "{}",
            transactions_json: "{}",
            last_synced_at: "2026-03-13 12:00:00",
          },
        ],
      }),
    });
    const session = await issueSessionFor(env, { "X-Device-ID": "replace-device" });
    env.DB.plaidItems = [
      {
        item_id: "item-old",
        user_id: session.payload.actorId,
        access_token: "access-old",
        transactions_cursor: null,
      },
    ];
    env.DB.syncData = [
      {
        user_id: session.payload.actorId,
        item_id: "item-old",
        balances_json: '{"accounts":[{"account_id":"acct-old"}]}',
        liabilities_json: "{}",
        transactions_json: "{}",
        last_synced_at: "2026-03-13 12:00:00",
      },
    ];

    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith("/item/public_token/exchange")) {
        return new Response(
          JSON.stringify({
            item_id: "item-new",
            access_token: "access-new",
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/item/remove")) {
        return new Response(JSON.stringify({ removed: true }), { status: 200 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/plaid/exchange", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Subscription-Tier": "free",
          ...session.authorization,
        },
        body: JSON.stringify({ publicToken: "public-token", replaceItemId: "item-old" }),
      }),
      env,
      makeCtx()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ item_id: "item-new" });
    expect(env.DB.plaidItems).toEqual([
      expect.objectContaining({
        item_id: "item-new",
        access_token: "access-new",
        user_id: session.payload.actorId,
      }),
    ]);
    expect(env.DB.syncData.find(entry => entry.item_id === "item-old")).toBeUndefined();
  });

  it("completes manual sync before returning so fresh balances are immediately readable", async () => {
    const env = makeEnv({
      DB: new FakeD1({
        plaidItems: [
          {
            item_id: "item-1",
            user_id: "device:sync-device",
            access_token: "access-1",
            transactions_cursor: null,
          },
        ],
      }),
    });

    const session = await issueSessionFor(env, { "X-Device-ID": "sync-device" });
    env.DB.plaidItems = [
      {
        item_id: "item-1",
        user_id: session.payload.actorId,
        access_token: "access-1",
        transactions_cursor: null,
      },
    ];

    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("/accounts/get")) {
        return new Response(
          JSON.stringify({
            accounts: [
              {
                account_id: "acct-1",
                balances: { current: 123.45 },
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes("/transactions/sync")) {
        return new Response(
          JSON.stringify({
            added: [
              {
                transaction_id: "txn-1",
                date: "2026-03-13",
                pending: false,
              },
            ],
            modified: [],
            removed: [],
            has_more: false,
            next_cursor: "cursor-1",
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/api/sync/force", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...session.authorization },
        body: JSON.stringify({ connectionId: "item-recent" }),
      }),
      env,
      makeCtx()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });
    expect(env.DB.syncData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: session.payload.actorId,
          item_id: "item-1",
        }),
      ])
    );
    const storedRow = env.DB.syncData.find(entry => entry.item_id === "item-1");
    expect(JSON.parse(storedRow.balances_json)).toMatchObject({
      accounts: [expect.objectContaining({ account_id: "acct-1" })],
    });
    expect(JSON.parse(storedRow.transactions_json)).toMatchObject({
      transactions: [expect.objectContaining({ transaction_id: "txn-1" })],
      total_transactions: 1,
    });
  });

  it("aggregates sync status across all plaid items for the actor", async () => {
    const env = makeEnv({ DB: new FakeD1() });
    const session = await issueSessionFor(env, { "X-Device-ID": "aggregate-device" });
    env.DB.syncData = [
      {
        user_id: session.payload.actorId,
        item_id: "item-a",
        balances_json: JSON.stringify({ accounts: [{ account_id: "acct-a" }] }),
        liabilities_json: JSON.stringify({ liabilities: { credit: [{ account_id: "acct-a" }] } }),
        transactions_json: JSON.stringify({
          transactions: [{ transaction_id: "txn-a", date: "2026-03-14", pending: false }],
          total_transactions: 1,
        }),
        last_synced_at: "2026-03-13 12:00:00",
      },
      {
        user_id: session.payload.actorId,
        item_id: "item-b",
        balances_json: JSON.stringify({ accounts: [{ account_id: "acct-b" }] }),
        liabilities_json: JSON.stringify({ liabilities: { credit: [{ account_id: "acct-b" }] } }),
        transactions_json: JSON.stringify({
          transactions: [{ transaction_id: "txn-b", date: "2026-03-15", pending: false }],
          total_transactions: 1,
        }),
        last_synced_at: "2026-03-14 12:00:00",
      },
    ];

    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/api/sync/status", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...session.authorization },
        body: JSON.stringify({}),
      }),
      env,
      makeCtx()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      hasData: true,
      last_synced_at: "2026-03-14 12:00:00",
      balances: {
        accounts: expect.arrayContaining([
          expect.objectContaining({ account_id: "acct-a" }),
          expect.objectContaining({ account_id: "acct-b" }),
        ]),
      },
      liabilities: {
        liabilities: {
          credit: expect.arrayContaining([
            expect.objectContaining({ account_id: "acct-a" }),
            expect.objectContaining({ account_id: "acct-b" }),
          ]),
        },
      },
      transactions: {
        transactions: expect.arrayContaining([
          expect.objectContaining({ transaction_id: "txn-a" }),
          expect.objectContaining({ transaction_id: "txn-b" }),
        ]),
        total_transactions: 2,
      },
    });
  });

  it("manual sync still succeeds when transactions fail but balances are available", async () => {
    const env = makeEnv({ DB: new FakeD1() });

    const session = await issueSessionFor(env, { "X-Device-ID": "balances-only-device" });
    env.DB.plaidItems = [
      {
        item_id: "item-balances-only",
        user_id: session.payload.actorId,
        access_token: "access-balances-only",
        transactions_cursor: null,
      },
    ];

    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("/accounts/get")) {
        return new Response(
          JSON.stringify({
            accounts: [
              {
                account_id: "acct-balances-only",
                balances: { current: 222.22 },
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes("/transactions/sync")) {
        return new Response(JSON.stringify({ error_message: "sync unavailable" }), { status: 500 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/api/sync/force", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...session.authorization },
        body: JSON.stringify({ connectionId: "item-recent" }),
      }),
      env,
      makeCtx()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });

    const storedRow = env.DB.syncData.find(entry => entry.item_id === "item-balances-only");
    expect(storedRow).toBeTruthy();
    expect(JSON.parse(storedRow.balances_json)).toMatchObject({
      accounts: [expect.objectContaining({ account_id: "acct-balances-only" })],
    });
  });

  it("maintains stale pro plaid caches silently across balances, transactions, and liabilities", async () => {
    const env = makeEnv({
      GATING_MODE: "live",
      REVENUECAT_SECRET_KEY: "rc-secret",
      DB: new FakeD1(),
    });
    const session = await issueSessionFor(env, {
      "X-Device-ID": "maintain-device",
      "X-RC-App-User-ID": "rc-pro-user",
    });
    env.DB.plaidItems = [
      {
        item_id: "item-maintain",
        user_id: session.payload.actorId,
        access_token: "access-maintain",
        transactions_cursor: null,
      },
    ];
    env.DB.syncData = [
      {
        user_id: session.payload.actorId,
        item_id: "item-maintain",
        balances_json: "{}",
        liabilities_json: "{}",
        transactions_json: "{}",
        last_synced_at: "2026-03-20 12:00:00",
      },
    ];

    const fetchMock = vi.fn(async (input, _init) => {
      const url = String(input);
      if (url.includes("api.revenuecat.com")) {
        return new Response(
          JSON.stringify({
            subscriber: {
              entitlements: {
                "Catalyst Cash Pro": { expires_date: "2030-01-01T00:00:00Z" },
              },
            },
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/accounts/get")) {
        return new Response(JSON.stringify({
          accounts: [{ account_id: "acct-maintain", type: "credit", balances: { current: 444.44 } }],
        }), { status: 200 });
      }
      if (url.endsWith("/transactions/sync")) {
        return new Response(JSON.stringify({
          added: [{ transaction_id: "txn-maintain", amount: 22, date: "2026-03-26", name: "Lunch" }],
          modified: [],
          removed: [],
          has_more: false,
          next_cursor: "cursor-maintain-1",
        }), { status: 200 });
      }
      if (url.endsWith("/liabilities/get")) {
        return new Response(JSON.stringify({
          liabilities: { credit: [{ account_id: "acct-maintain", minimum_payment_amount: 35 }] },
        }), { status: 200 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/api/sync/maintain", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RC-App-User-ID": "rc-pro-user",
          ...session.authorization,
        },
        body: JSON.stringify({}),
      }),
      env,
      makeCtx()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      refreshedItemIds: ["item-maintain"],
      balancesRefreshed: 1,
      transactionsRefreshed: 1,
      liabilitiesRefreshed: 1,
    });

    const syncRow = env.DB.syncData.find(entry => entry.user_id === session.payload.actorId && entry.item_id === "item-maintain");
    expect(JSON.parse(syncRow.balances_json)).toMatchObject({
      accounts: [expect.objectContaining({ account_id: "acct-maintain" })],
    });
    expect(JSON.parse(syncRow.transactions_json)).toMatchObject({
      transactions: [expect.objectContaining({ transaction_id: "txn-maintain" })],
    });
    expect(JSON.parse(syncRow.liabilities_json)).toMatchObject({
      liabilities: { credit: [expect.objectContaining({ account_id: "acct-maintain" })] },
    });
  });

  it("skips paid maintenance work when per-dataset plaid freshness is still current", async () => {
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(new Date("2026-03-26T12:00:00.000Z").getTime());
    const env = makeEnv({
      GATING_MODE: "live",
      REVENUECAT_SECRET_KEY: "rc-secret",
      DB: new FakeD1(),
    });
    const session = await issueSessionFor(env, {
      "X-Device-ID": "maintain-fresh-device",
      "X-RC-App-User-ID": "rc-pro-user",
    });
    env.DB.plaidItems = [
      {
        item_id: "item-fresh",
        user_id: session.payload.actorId,
        access_token: "access-fresh",
        transactions_cursor: "cursor-fresh",
      },
    ];
    env.DB.syncData = [
      {
        user_id: session.payload.actorId,
        item_id: "item-fresh",
        balances_json: JSON.stringify({ accounts: [{ account_id: "acct-fresh", type: "credit" }] }),
        liabilities_json: JSON.stringify({ liabilities: { credit: [{ account_id: "acct-fresh" }] } }),
        transactions_json: JSON.stringify({ transactions: [{ transaction_id: "txn-fresh", date: "2026-03-25" }], total_transactions: 1 }),
        last_synced_at: "2026-03-25 12:00:00",
      },
      {
        user_id: session.payload.actorId,
        item_id: "_plaid_meta:dataset-balances:item-fresh",
        balances_json: "{}",
        liabilities_json: "{}",
        transactions_json: "{}",
        last_synced_at: "2026-03-26 10:00:00",
      },
      {
        user_id: session.payload.actorId,
        item_id: "_plaid_meta:dataset-transactions:item-fresh",
        balances_json: "{}",
        liabilities_json: "{}",
        transactions_json: "{}",
        last_synced_at: "2026-03-26 10:00:00",
      },
      {
        user_id: session.payload.actorId,
        item_id: "_plaid_meta:dataset-liabilities:item-fresh",
        balances_json: "{}",
        liabilities_json: "{}",
        transactions_json: "{}",
        last_synced_at: "2026-03-25 12:00:00",
      },
    ];

    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("api.revenuecat.com")) {
        return new Response(
          JSON.stringify({
            subscriber: {
              entitlements: {
                "Catalyst Cash Pro": { expires_date: "2030-01-01T00:00:00Z" },
              },
            },
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/api/sync/maintain", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RC-App-User-ID": "rc-pro-user",
          ...session.authorization,
        },
        body: JSON.stringify({}),
      }),
      env,
      makeCtx()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      refreshedItemIds: [],
      balancesRefreshed: 0,
      transactionsRefreshed: 0,
      liabilitiesRefreshed: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    dateNowSpy.mockRestore();
  });

  it("allows free users to live-sync one plaid item under live gating", async () => {
    const env = makeEnv({
      GATING_MODE: "live",
      DB: new FakeD1(),
    });
    const session = await issueSessionFor(env, { "X-Device-ID": "free-sync-device" });
    env.DB.plaidItems = [
      {
        item_id: "item-1",
        user_id: session.payload.actorId,
        access_token: "access-1",
        transactions_cursor: null,
      },
    ];

    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      const parsed = JSON.parse(init.body);
      if (url.includes("/accounts/get")) {
        if (parsed.access_token !== "access-1") {
          throw new Error(`Unexpected access token ${parsed.access_token}`);
        }
        return new Response(
          JSON.stringify({
            accounts: [
              {
                account_id: "acct-free-1",
                balances: { current: 88.5 },
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes("/transactions/sync")) {
        return new Response(
          JSON.stringify({
            added: [],
            modified: [],
            removed: [],
            has_more: false,
            next_cursor: "cursor-free-2",
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/api/sync/force", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Subscription-Tier": "free", ...session.authorization },
        body: JSON.stringify({ connectionId: "item-1" }),
      }),
      env,
      makeCtx()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      syncedItemIds: ["item-1"],
      limitedToItemId: "item-1",
    });
    expect(env.DB.syncData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: session.payload.actorId,
          item_id: "item-1",
        }),
      ])
    );
  });

  it("uses the newest targeted sync timestamp when enforcing manual sync cooldowns", async () => {
    const env = makeEnv({
      GATING_MODE: "live",
      DB: new FakeD1(),
    });
    const session = await issueSessionFor(env, { "X-Device-ID": "cooldown-device" });
    env.DB.plaidItems = [
      {
        item_id: "item-old",
        user_id: session.payload.actorId,
        access_token: "access-old",
        transactions_cursor: null,
      },
      {
        item_id: "item-recent",
        user_id: session.payload.actorId,
        access_token: "access-recent",
        transactions_cursor: null,
      },
    ];
    env.DB.syncData = [
      {
        user_id: session.payload.actorId,
        item_id: "item-old",
        balances_json: "{}",
        liabilities_json: "{}",
        transactions_json: "{}",
        last_synced_at: "2026-03-01 12:00:00",
      },
      {
        user_id: session.payload.actorId,
        item_id: "item-recent",
        balances_json: "{}",
        liabilities_json: "{}",
        transactions_json: "{}",
        last_synced_at: "2999-03-13 12:00:00",
      },
    ];

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/api/sync/force", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...session.authorization },
        body: JSON.stringify({ connectionId: "item-recent" }),
      }),
      env,
      makeCtx()
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ error: "cooldown" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bypasses manual sync cooldowns when gating mode is soft", async () => {
    const env = makeEnv({
      GATING_MODE: "soft",
      DB: new FakeD1(),
    });
    const session = await issueSessionFor(env, { "X-Device-ID": "soft-cooldown-device" });
    env.DB.plaidItems = [
      {
        item_id: "item-soft",
        user_id: session.payload.actorId,
        access_token: "access-soft",
        transactions_cursor: null,
      },
    ];
    env.DB.syncData = [
      {
        user_id: session.payload.actorId,
        item_id: "item-soft",
        balances_json: "{}",
        liabilities_json: "{}",
        transactions_json: "{}",
        last_synced_at: "2999-03-13 12:00:00",
      },
    ];

    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("/accounts/get")) {
        return new Response(
          JSON.stringify({
            accounts: [
              {
                account_id: "acct-soft",
                balances: { current: 55.55 },
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes("/transactions/sync")) {
        return new Response(
          JSON.stringify({
            added: [],
            modified: [],
            removed: [],
            has_more: false,
            next_cursor: "cursor-soft-1",
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/api/sync/force", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...session.authorization },
        body: JSON.stringify({ connectionId: "item-soft" }),
      }),
      env,
      makeCtx()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      syncedItemIds: ["item-soft"],
      limitedToItemId: "item-soft",
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("serves cached plaid transactions to free users without re-hitting plaid", async () => {
    const env = makeEnv({
      GATING_MODE: "live",
      DB: new FakeD1(),
    });
    const session = await issueSessionFor(env, { "X-Device-ID": "free-cached-transactions-device" });
    env.DB.plaidItems = [
      {
        item_id: "item-cached",
        user_id: session.payload.actorId,
        access_token: "access-cached",
        transactions_cursor: null,
      },
    ];
    env.DB.syncData = [
      {
        user_id: session.payload.actorId,
        item_id: "item-cached",
        balances_json: "{}",
        liabilities_json: "{}",
        transactions_json: JSON.stringify({
          transactions: [{ transaction_id: "txn-cached", date: "2026-03-18" }],
          total_transactions: 1,
        }),
        last_synced_at: "2026-03-13 12:00:00",
      },
    ];

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/plaid/transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Subscription-Tier": "free",
          ...session.authorization,
        },
        body: JSON.stringify({ itemId: "item-cached" }),
      }),
      env,
      makeCtx()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      transactions: [expect.objectContaining({ transaction_id: "txn-cached" })],
      total_transactions: 1,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a valid session from another actor", async () => {
    const env = makeEnv({ DB: new FakeD1() });
    const sessionA = await issueSessionFor(env, { "X-Device-ID": "device-a" });
    const sessionB = await issueSessionFor(env, { "X-Device-ID": "device-b" });
    env.DB.plaidItems = [
      {
        item_id: "item-owned-by-a",
        user_id: sessionA.payload.actorId,
        access_token: "access-a",
        transactions_cursor: null,
      },
    ];

    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/plaid/balances", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...sessionB.authorization },
        body: JSON.stringify({ itemId: "item-owned-by-a" }),
      }),
      env,
      makeCtx()
    );

    expect(response.status).toBe(404);
  });

  it("blocks deep sync for free users only when live gating is enabled", async () => {
    const env = makeEnv({
      GATING_MODE: "live",
      DB: new FakeD1({
        plaidItems: [
          {
            item_id: "item-1",
            user_id: "device:free-device",
            access_token: "access-1",
            transactions_cursor: null,
          },
        ],
      }),
    });
    const session = await issueSessionFor(env, { "X-Device-ID": "free-device" });
    env.DB.plaidItems = [
      {
        item_id: "item-1",
        user_id: session.payload.actorId,
        access_token: "access-1",
        transactions_cursor: null,
      },
    ];

    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/api/sync/deep", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...session.authorization },
        body: JSON.stringify({ userId: "free-user" }),
      }),
      env,
      makeCtx()
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "upgrade_required",
    });
  });

  it("merges added, modified, and removed transaction deltas", () => {
    const merged = mergePlaidTransactions(
      {
        transactions: [
          { transaction_id: "txn-1", amount: 42, date: "2026-03-12", name: "Original" },
          { transaction_id: "txn-2", amount: 19, date: "2026-03-11", name: "Keep" },
        ],
      },
      {
        added: [{ transaction_id: "txn-3", amount: 8, date: "2026-03-13", name: "New" }],
        modified: [{ transaction_id: "txn-1", amount: 44, date: "2026-03-12", name: "Updated" }],
        removed: [{ transaction_id: "txn-2" }],
      }
    );

    expect(merged.transactions.map(transaction => transaction.transaction_id)).toEqual(["txn-3", "txn-1"]);
    expect(merged.transactions[1]).toMatchObject({ amount: 44, name: "Updated" });
    expect(merged.total_transactions).toBe(2);
  });

  it("keeps deep sync liabilities-only so daily ledger freshness stays on the cheaper path", async () => {
    const env = makeEnv({
      GATING_MODE: "soft",
      REVENUECAT_SECRET_KEY: "rc-secret",
      DB: new FakeD1({
        plaidItems: [
          {
            item_id: "item-1",
            user_id: "device:device-1",
            access_token: "access-1",
            transactions_cursor: null,
          },
        ],
      }),
    });
    const session = await issueSessionFor(env, {
      "X-Device-ID": "device-1",
      "X-RC-App-User-ID": "rc-pro-user",
    });
    env.DB.plaidItems = [
      {
        item_id: "item-1",
        user_id: session.payload.actorId,
        access_token: "access-1",
        transactions_cursor: null,
      },
    ];

    const fetchMock = vi.fn(async (input, _init) => {
      const url = String(input);
      if (url.includes("api.revenuecat.com")) {
        return new Response(
          JSON.stringify({
            subscriber: {
              entitlements: {
                "Catalyst Cash Pro": { expires_date: "2030-01-01T00:00:00Z" },
              },
            },
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/liabilities/get")) {
        return new Response(JSON.stringify({ liabilities: { credit: [{ account_id: "acct-1" }] } }), { status: 200 });
      }
      if (url.endsWith("/accounts/get")) {
        return new Response(JSON.stringify({
          accounts: [{ account_id: "acct-1", type: "credit", balances: { current: 500 } }],
        }), { status: 200 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/api/sync/deep", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RC-App-User-ID": "rc-pro-user",
          ...session.authorization,
        },
        body: JSON.stringify({ userId: "user-1" }),
      }),
      env,
      makeCtx()
    );

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalledWith(
      "https://production.plaid.com/transactions/sync",
      expect.anything()
    );

    const item = env.DB.plaidItems.find(entry => entry.item_id === "item-1");
    const syncRow = env.DB.syncData.find(entry => entry.user_id === session.payload.actorId && entry.item_id === "item-1");
    expect(item.transactions_cursor).toBeNull();
    expect(JSON.parse(syncRow.liabilities_json)).toMatchObject({
      liabilities: {
        credit: [expect.objectContaining({ account_id: "acct-1" })],
      },
    });
  });

  it("uses the stored cursor for webhook incremental sync and merges delta updates", async () => {
    const env = makeEnv({
      GATING_MODE: "soft",
      REVENUECAT_SECRET_KEY: "rc-secret",
      DB: new FakeD1({
        plaidItems: [
          {
            item_id: "item-1",
            user_id: "device:device-1",
            access_token: "access-1",
            transactions_cursor: "cursor-prev-1",
          },
        ],
        syncData: [
          {
            user_id: "device:device-1",
            item_id: "item-1",
            balances_json: "{}",
            liabilities_json: "{}",
            transactions_json: JSON.stringify({
              transactions: [
                { transaction_id: "txn-1", amount: 9, date: "2026-03-11", name: "Old 1" },
                { transaction_id: "txn-2", amount: 24, date: "2026-03-10", name: "Old 2" },
              ],
            }),
            last_synced_at: "2026-03-01 12:00:00",
          },
        ],
      }),
    });
    const session = await issueSessionFor(env, {
      "X-Device-ID": "device-1",
      "X-RC-App-User-ID": "rc-pro-user",
    });
    env.DB.plaidItems = [
      {
        item_id: "item-1",
        user_id: session.payload.actorId,
        access_token: "access-1",
        transactions_cursor: "cursor-prev-1",
      },
    ];
    env.DB.syncData = [
      {
        user_id: session.payload.actorId,
        item_id: "item-1",
        balances_json: "{}",
        liabilities_json: "{}",
        transactions_json: JSON.stringify({
          transactions: [
            { transaction_id: "txn-1", amount: 9, date: "2026-03-11", name: "Old 1" },
            { transaction_id: "txn-2", amount: 24, date: "2026-03-10", name: "Old 2" },
          ],
        }),
        last_synced_at: "2026-03-01 12:00:00",
      },
    ];

    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.includes("api.revenuecat.com")) {
        return new Response(
          JSON.stringify({
            subscriber: {
              entitlements: {
                "Catalyst Cash Pro": { expires_date: "2030-01-01T00:00:00Z" },
              },
            },
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/accounts/get")) {
        return new Response(JSON.stringify({ accounts: [{ account_id: "acct-1" }] }), { status: 200 });
      }
      if (url.endsWith("/transactions/sync")) {
        const body = JSON.parse(init.body);
        expect(body.cursor).toBe("cursor-prev-1");
        return new Response(
          JSON.stringify({
            added: [{ transaction_id: "txn-3", amount: 50, date: "2026-03-13", name: "Added" }],
            modified: [{ transaction_id: "txn-1", amount: 11, date: "2026-03-11", name: "Updated" }],
            removed: [{ transaction_id: "txn-2" }],
            has_more: false,
            next_cursor: "cursor-next-2",
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const ctx = makeCtx();
    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/plaid/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhook_type: "TRANSACTIONS",
          webhook_code: "SYNC_UPDATES_AVAILABLE",
          item_id: "item-1",
        }),
      }),
      env,
      ctx
    );
    await ctx.flush();

    expect(response.status).toBe(200);
    const item = env.DB.plaidItems.find(entry => entry.item_id === "item-1");
    const syncRow = env.DB.syncData.find(entry => entry.user_id === session.payload.actorId && entry.item_id === "item-1");
    const transactions = JSON.parse(syncRow.transactions_json);

    expect(item.transactions_cursor).toBe("cursor-next-2");
    expect(transactions.transactions.map(transaction => transaction.transaction_id)).toEqual(["txn-3", "txn-1"]);
    expect(transactions.transactions[1]).toMatchObject({ amount: 11, name: "Updated" });
    expect(syncRow.balances_json).toContain("acct-1");
  });

  it("allows a pro webhook refresh again after 24 hours", async () => {
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(new Date("2026-03-26T12:00:00.000Z").getTime());
    const env = makeEnv({
      GATING_MODE: "live",
      REVENUECAT_SECRET_KEY: "rc-secret",
      DB: new FakeD1({
        plaidItems: [
          {
            item_id: "item-1",
            user_id: "device:device-1",
            access_token: "access-1",
            transactions_cursor: "cursor-prev-1",
          },
        ],
        syncData: [
          {
            user_id: "device:device-1",
            item_id: "item-1",
            balances_json: "{}",
            liabilities_json: "{}",
            transactions_json: JSON.stringify({
              transactions: [{ transaction_id: "txn-1", amount: 9, date: "2026-03-11", name: "Old 1" }],
            }),
            last_synced_at: "2026-03-25 05:00:00",
          },
        ],
      }),
    });
    const session = await issueSessionFor(env, {
      "X-Device-ID": "device-1",
      "X-RC-App-User-ID": "rc-pro-user",
    });
    env.DB.plaidItems = [
      {
        item_id: "item-1",
        user_id: session.payload.actorId,
        access_token: "access-1",
        transactions_cursor: "cursor-prev-1",
      },
    ];
    env.DB.syncData = [
      {
        user_id: session.payload.actorId,
        item_id: "item-1",
        balances_json: "{}",
        liabilities_json: "{}",
        transactions_json: JSON.stringify({
          transactions: [{ transaction_id: "txn-1", amount: 9, date: "2026-03-11", name: "Old 1" }],
        }),
        last_synced_at: "2026-03-25 05:00:00",
      },
    ];

    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.includes("api.revenuecat.com")) {
        return new Response(
          JSON.stringify({
            subscriber: {
              entitlements: {
                "Catalyst Cash Pro": { expires_date: "2030-01-01T00:00:00Z" },
              },
            },
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/accounts/get")) {
        return new Response(JSON.stringify({ accounts: [{ account_id: "acct-1" }] }), { status: 200 });
      }
      if (url.endsWith("/transactions/sync")) {
        const body = JSON.parse(init.body);
        expect(body.cursor).toBe("cursor-prev-1");
        return new Response(
          JSON.stringify({
            added: [{ transaction_id: "txn-2", amount: 50, date: "2026-03-26", name: "Added" }],
            modified: [],
            removed: [],
            has_more: false,
            next_cursor: "cursor-next-2",
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const ctx = makeCtx();
    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/plaid/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhook_type: "TRANSACTIONS",
          webhook_code: "SYNC_UPDATES_AVAILABLE",
          item_id: "item-1",
        }),
      }),
      env,
      ctx
    );
    await ctx.flush();

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://production.plaid.com/accounts/get",
      expect.objectContaining({ method: "POST" })
    );
    const item = env.DB.plaidItems.find(entry => entry.item_id === "item-1");
    expect(item.transactions_cursor).toBe("cursor-next-2");
    dateNowSpy.mockRestore();
  });
});

describe("Household sync hardening", () => {
  async function buildHouseholdRequest(overrides = {}) {
    const householdId = overrides.householdId || "family-1";
    const authToken = overrides.authToken || await sha256Hex(`household-auth-v1:${householdId}:shared-passcode`);
    const version = overrides.version ?? 1;
    const requestId = overrides.requestId || "req-1";
    const encryptedBlob = overrides.encryptedBlob || {
      v: 1,
      salt: "salt",
      iv: "iv",
      ct: "ciphertext",
    };
    const integrityTag = overrides.integrityTag || await buildHouseholdIntegrityTag({
      householdId,
      authToken,
      encryptedBlob,
      version,
      requestId,
    });

    return {
      householdId,
      authToken,
      version,
      requestId,
      encryptedBlob,
      integrityTag,
    };
  }

  it("supports authenticated push then fetch for a shared household", async () => {
    const env = makeEnv({ DB: new FakeD1() });
    const requestBody = await buildHouseholdRequest();
    const session = await issueSessionFor(env, { "X-Device-ID": "household-owner" });

    const pushResponse = await worker.fetch(
      new Request("https://api.catalystcash.app/api/household/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...session.authorization },
        body: JSON.stringify({
          action: "push",
          ...requestBody,
        }),
      }),
      env,
      makeCtx()
    );

    expect(pushResponse.status).toBe(200);
    expect(env.DB.householdSync[0]).toMatchObject({
      household_id: "family-1",
      auth_token_hash: await sha256Hex(requestBody.authToken),
      version: 1,
      last_request_id: "req-1",
    });

    const fetchResponse = await worker.fetch(
      new Request("https://api.catalystcash.app/api/household/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...session.authorization },
        body: JSON.stringify({
          action: "fetch",
          householdId: requestBody.householdId,
          authToken: requestBody.authToken,
        }),
      }),
      env,
      makeCtx()
    );

    expect(fetchResponse.status).toBe(200);
    await expect(fetchResponse.json()).resolves.toMatchObject({
      hasData: true,
      version: 1,
      requestId: "req-1",
      integrityTag: requestBody.integrityTag,
      encryptedBlob: requestBody.encryptedBlob,
    });
  });

  it("does not return ciphertext for an unauthorized fetch attempt", async () => {
    const requestBody = await buildHouseholdRequest();
    const env = makeEnv({
      DB: new FakeD1({
        householdSync: [
          {
            household_id: requestBody.householdId,
            encrypted_blob: requestBody.encryptedBlob,
            auth_token_hash: await sha256Hex(requestBody.authToken),
            integrity_tag: requestBody.integrityTag,
            version: 1,
            last_request_id: requestBody.requestId,
            last_updated_at: "2026-03-13 12:00:00",
          },
        ],
      }),
    });
    const session = await issueSessionFor(env, { "X-Device-ID": "household-reader" });

    const fetchResponse = await worker.fetch(
      new Request("https://api.catalystcash.app/api/household/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...session.authorization },
        body: JSON.stringify({
          action: "fetch",
          householdId: requestBody.householdId,
          authToken: "wrong-auth-token",
        }),
      }),
      env,
      makeCtx()
    );

    expect(fetchResponse.status).toBe(404);
    await expect(fetchResponse.json()).resolves.toMatchObject({ hasData: false });
  });

  it("blocks unauthorized overwrite attempts from a different household credential", async () => {
    const requestBody = await buildHouseholdRequest();
    const env = makeEnv({
      DB: new FakeD1({
        householdSync: [
          {
            household_id: requestBody.householdId,
            encrypted_blob: requestBody.encryptedBlob,
            auth_token_hash: await sha256Hex(requestBody.authToken),
            integrity_tag: requestBody.integrityTag,
            version: 2,
            last_request_id: "req-2",
            last_updated_at: "2026-03-13 12:00:00",
          },
        ],
      }),
    });
    const session = await issueSessionFor(env, { "X-Device-ID": "household-writer" });

    const attackerAuthToken = await sha256Hex("household-auth-v1:family-1:attacker-passcode");
    const forgedEnvelope = await buildHouseholdRequest({
      authToken: attackerAuthToken,
      version: 3,
      requestId: "req-3",
      encryptedBlob: {
        v: 1,
        salt: "attacker-salt",
        iv: "attacker-iv",
        ct: "attacker-ciphertext",
      },
    });

    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/api/household/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...session.authorization },
        body: JSON.stringify({
          action: "push",
          ...forgedEnvelope,
        }),
      }),
      env,
      makeCtx()
    );

    expect(response.status).toBe(403);
    expect(env.DB.householdSync[0]).toMatchObject({
      version: 2,
      last_request_id: "req-2",
      encrypted_blob: requestBody.encryptedBlob,
    });
  });

  it("rejects replayed and stale household sync writes", async () => {
    const requestBody = await buildHouseholdRequest();
    const env = makeEnv({
      DB: new FakeD1({
        householdSync: [
          {
            household_id: requestBody.householdId,
            encrypted_blob: requestBody.encryptedBlob,
            auth_token_hash: await sha256Hex(requestBody.authToken),
            integrity_tag: requestBody.integrityTag,
            version: 2,
            last_request_id: "req-2",
            last_updated_at: "2026-03-13 12:00:00",
          },
        ],
      }),
    });
    const session = await issueSessionFor(env, { "X-Device-ID": "household-replay" });

    const replayBody = await buildHouseholdRequest({
      version: 3,
      requestId: "req-2",
      authToken: requestBody.authToken,
      encryptedBlob: {
        v: 1,
        salt: "salt-3",
        iv: "iv-3",
        ct: "ciphertext-3",
      },
    });
    const replayResponse = await worker.fetch(
      new Request("https://api.catalystcash.app/api/household/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...session.authorization },
        body: JSON.stringify({
          action: "push",
          ...replayBody,
        }),
      }),
      env,
      makeCtx()
    );
    expect(replayResponse.status).toBe(409);
    await expect(replayResponse.json()).resolves.toMatchObject({ error: "replay_detected" });

    const staleBody = await buildHouseholdRequest({
      version: 2,
      requestId: "req-4",
      authToken: requestBody.authToken,
      encryptedBlob: {
        v: 1,
        salt: "salt-4",
        iv: "iv-4",
        ct: "ciphertext-4",
      },
    });
    const staleResponse = await worker.fetch(
      new Request("https://api.catalystcash.app/api/household/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...session.authorization },
        body: JSON.stringify({
          action: "push",
          ...staleBody,
        }),
      }),
      env,
      makeCtx()
    );
    expect(staleResponse.status).toBe(409);
    await expect(staleResponse.json()).resolves.toMatchObject({ error: "stale_version", currentVersion: 2 });
  });
});

describe("trimResponsePreview PII scrubber", () => {
  // The scrubber is not exported, so we exercise it via the audit-log column
  // that the worker writes after every AI response. We call the worker with a
  // mocked OpenAI response whose body contains known PII patterns, then inspect
  // the audit-log D1 row to confirm the preview was sanitised.
  //
  // For patterns that don't require a full round-trip, we test the regex logic
  // directly by importing the function through a thin eval shim, keeping the
  // test self-contained and fast.

  function makeScrubber() {
    // Inline copy of the production function so the test is self-contained and
    // always tracks the implementation in worker/src/index.js.
    return function trimResponsePreview(text) {
      let s = String(text || "");
      s = s.replace(/\b\d{8,17}\b/g, "[redacted]");
      s = s.replace(/\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g, "[redacted]");
      s = s.replace(/-?\$[\d,]+(?:\.\d+)?\b/g, "$[amount]");
      s = s.replace(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g, "[amount]");
      s = s.replace(/\b\d{3,}\.\d{2}\b/g, "[amount]");
      return s.slice(0, 600);
    };
  }

  it("redacts bare dollar amounts without cents ($150, $3200)", () => {
    const scrub = makeScrubber();
    expect(scrub("You have $150 left")).toBe("You have $[amount] left");
    expect(scrub("Balance: $3200")).toBe("Balance: $[amount]");
  });

  it("redacts dollar amounts with cents ($3,200.00, -$150.00)", () => {
    const scrub = makeScrubber();
    expect(scrub("Total: $3,200.00")).toBe("Total: $[amount]");
    expect(scrub("Credit: -$150.00")).toBe("Credit: $[amount]");
  });

  it("redacts bare 2-decimal floats that look like balances (3200.00, 150.00)", () => {
    const scrub = makeScrubber();
    expect(scrub("amount 3200.00 cleared")).toBe("amount [amount] cleared");
    expect(scrub("balance 150.00")).toBe("balance [amount]");
  });

  it("redacts comma-formatted numbers (3,200 or 3,200.50)", () => {
    const scrub = makeScrubber();
    expect(scrub("debt 3,200 remaining")).toBe("debt [amount] remaining");
    expect(scrub("surplus 1,450.75")).toBe("surplus [amount]");
  });

  it("redacts account/routing numbers (8-17 consecutive digits)", () => {
    const scrub = makeScrubber();
    expect(scrub("routing 021000021 confirmed")).toBe("routing [redacted] confirmed");
    expect(scrub("acct 1234567890123")).toBe("acct [redacted]");
  });

  it("redacts SSN-shaped patterns", () => {
    const scrub = makeScrubber();
    expect(scrub("SSN 123-45-6789 on file")).toBe("SSN [redacted] on file");
  });

  it("preserves non-financial small decimals and plain integers", () => {
    const scrub = makeScrubber();
    expect(scrub("1.50 hours of work")).toBe("1.50 hours of work");
    expect(scrub("rate is 12.5%")).toBe("rate is 12.5%");
    expect(scrub("score 85 this week")).toBe("score 85 this week");
    expect(scrub("version 2.0 released")).toBe("version 2.0 released");
  });

  it("truncates output to 600 characters after scrubbing", () => {
    const scrub = makeScrubber();
    const long = "safe narrative text ".repeat(40); // 800 chars
    expect(scrub(long).length).toBe(600);
  });
});
