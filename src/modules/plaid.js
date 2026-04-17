// Plaid link, sync, and cached connection state.

import { batchCategorizeTransactions } from "./api.js";
import { getBackendUrl } from "./backendUrl.js";
import { fetchWithRetry } from "./fetchWithRetry.js";
import { buildIdentityHeaders, clearIdentitySession } from "./identitySession.js";
import { getIssuerCards } from "./issuerCards.js";
import { log } from "./logger.js";
import { inferMerchantIdentity } from "./merchantIdentity.js";
import { categorizeBatch, learn } from "./merchantMap.js";
import {
  findLikelyBankDuplicates,
  findLikelyCardDuplicates,
  reviewPlaidDuplicateCandidates,
} from "./plaidDuplicateResolution.js";
import { trackSupportEvent } from "./funnelAnalytics.js";
import { recordFirstBankConnectionValue } from "./valueMoments.js";
import {
  FREE_PLAID_CONNECTION_SWITCH_COOLDOWN_MS,
  getConnections,
  getPreferredFreeConnectionId,
  getPreferredFreeConnectionSwitchCooldownRemaining,
  PLAID_MANUAL_SYNC_COOLDOWNS,
  resolvePlaidConnectionAccessState,
  saveConnections,
  setPreferredFreeConnectionId,
  shouldEnforcePreferredFreeConnectionSwitchCooldown,
} from "./plaid/connectionState.js";
import {
  disconnectConnectionPortfolioRecords,
  getConnectionPlaidAccountIds,
  materializeManualFallbackForConnections,
} from "./plaid/connectionPortfolio.js";
import { getPlaidAutoFill } from "./plaid/autoFill.js";
import { getSubscriptionState, INSTITUTION_LIMITS, isGatingEnforced } from "./subscription.js";
import { db } from "./utils.js";

export {
  FREE_PLAID_CONNECTION_SWITCH_COOLDOWN_MS,
  disconnectConnectionPortfolioRecords,
  getConnections,
  getConnectionPlaidAccountIds,
  reviewPlaidDuplicateCandidates,
  getPlaidAutoFill,
  getPreferredFreeConnectionId,
  getPreferredFreeConnectionSwitchCooldownRemaining,
  materializeManualFallbackForConnections,
  PLAID_MANUAL_SYNC_COOLDOWNS,
  setPreferredFreeConnectionId,
  shouldEnforcePreferredFreeConnectionSwitchCooldown,
};

const PLAID_CREDIT_LIMIT_CACHE_KEY = "plaid-credit-limit-cache";
const API_BASE = getBackendUrl();
const LINK_TOKEN_TIMEOUT_MS = 20_000;
const EXCHANGE_TIMEOUT_MS = 20_000;
const SYNC_FORCE_TIMEOUT_MS = 120_000;
const SYNC_STATUS_TIMEOUT_MS = 30_000;
const PLAID_LINK_UI_TIMEOUT_MS = 600_000; // 10 minutes
let activePlaidLinkPromise = null;

function createAbortTimeout(ms, label = "Plaid request") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`${label} timed out`)), ms);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer),
  };
}

function withPlaidTimeout(promiseFactory, ms, label) {
  let timer = null;
  return Promise.race([
    Promise.resolve().then(promiseFactory),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function buildPlaidBackendHeaders(extra = {}) {
  return buildIdentityHeaders({
    "Content-Type": "application/json",
    ...extra,
  });
}

async function fetchPlaidBackend(url, init = {}, options = {}) {
  const requestTimeoutMs = options.timeoutMs || LINK_TOKEN_TIMEOUT_MS;
  const authBootstrapTimeoutMs = options.authBootstrapTimeoutMs || LINK_TOKEN_TIMEOUT_MS;
  const timeout = createAbortTimeout(requestTimeoutMs, "Plaid backend request");
  try {
    const headers = await withPlaidTimeout(
      () => buildPlaidBackendHeaders(init.headers || {}),
      authBootstrapTimeoutMs,
      "Plaid auth bootstrap"
    );
    let response = await fetchWithRetry(url, {
      ...init,
      headers,
      signal: init.signal || timeout.signal,
    });

    if (response.status === 401) {
      await clearIdentitySession().catch(() => false);
      const retryHeaders = await withPlaidTimeout(
        () => buildPlaidBackendHeaders(init.headers || {}),
        authBootstrapTimeoutMs,
        "Plaid auth bootstrap"
      );
      response = await fetchWithRetry(url, {
        ...init,
        headers: retryHeaders,
        signal: init.signal || timeout.signal,
      });
    }

    return response;
  } finally {
    timeout.cancel();
  }
}

export async function reconcilePlaidConnectionAccess(cards = [], bankAccounts = []) {
  const connections = await getConnections();
  const subscriptionState = await getSubscriptionState();
  const gatingEnforced = isGatingEnforced();
  const limit = gatingEnforced ? (INSTITUTION_LIMITS[subscriptionState?.tier] || INSTITUTION_LIMITS.free) : Infinity;
  const preferredId = await getPreferredFreeConnectionId();
  const {
    activeFreeConnectionId,
    connectionsChanged,
    nextConnections,
    pausedConnectionIds,
    syncableConnectionIds,
    syncableConnections,
  } = resolvePlaidConnectionAccessState(connections, {
    gatingEnforced,
    tier: subscriptionState?.tier || "free",
    limit,
    preferredId,
  });

  if (connectionsChanged) {
    await saveConnections(nextConnections);
  }

  if (activeFreeConnectionId !== preferredId) {
    await setPreferredFreeConnectionId(activeFreeConnectionId, { force: true });
  }

  const fallbackState =
    pausedConnectionIds.length > 0
      ? materializeManualFallbackForConnections(cards, bankAccounts, pausedConnectionIds, {
          keepLinkMetadata: true,
        })
      : { updatedCards: cards, updatedBankAccounts: bankAccounts, changed: false };

  return {
    connections: nextConnections,
    syncableConnections,
    syncableConnectionIds,
    pausedConnectionIds,
    activeFreeConnectionId,
    updatedCards: fallbackState.updatedCards,
    updatedBankAccounts: fallbackState.updatedBankAccounts,
    cardsChanged: fallbackState.changed,
    bankAccountsChanged: fallbackState.changed,
  };
}

function toFiniteMoney(value) {
  if (value == null || value === "") return null;
  const num = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(num) ? num : null;
}

export async function purgeStoredTransactionsForConnection(connection) {
  const plaidAccountIds = getConnectionPlaidAccountIds(connection);
  if (plaidAccountIds.size === 0) return 0;

  const stored = await db.get(TRANSACTIONS_STORAGE_KEY);
  const transactions = Array.isArray(stored?.data) ? stored.data : [];
  if (!transactions.length) return 0;

  const filtered = transactions.filter((transaction) => {
    const accountId = String(transaction?.accountId || "").trim();
    return !accountId || !plaidAccountIds.has(accountId);
  });

  const removed = transactions.length - filtered.length;
  if (removed > 0) {
    await db.set(TRANSACTIONS_STORAGE_KEY, {
      data: filtered,
      fetchedAt: stored?.fetchedAt || new Date().toISOString(),
    });
  }

  return removed;
}

/**
 * Remove a connection by id.
 */
export async function removeConnection(connectionId) {
  const conns = await getConnections();
  const conn = conns.find(c => c.id === connectionId);

  // Revoke the item on the server side using the worker-stored access token.
  if (conn?.id) {
    try {
      await fetchPlaidBackend(`${API_BASE}/plaid/disconnect`, {
        method: "POST",
        body: JSON.stringify({ itemId: conn.id }),
      });
    } catch {
      /* best-effort cleanup */
    }
  }

  await saveConnections(conns.filter(c => c.id !== connectionId));
  const preferredId = await getPreferredFreeConnectionId();
  if (preferredId && preferredId === connectionId) {
    await setPreferredFreeConnectionId(null, { force: true });
  }
}

/**
 * Purge connections that are missing an item ID.
 * Metadata-only rows remain valid after the token-storage migration.
 * Should be called once on app startup.
 */
export async function purgeBrokenConnections() {
  const conns = await getConnections();
  const broken = conns.filter(c => !c.id);
  if (broken.length > 0) {
    void log.warn("plaid", 
      `Purging ${broken.length} broken connection(s): ${broken.map(c => c.institutionName).join(", ")}`
    );
    await saveConnections(conns.filter(c => !broken.includes(c)));
  }
  return broken.length;
}

// ─── Plaid Link Flow ──────────────────────────────────────────

/**
 * Step 1: Get a Link token from our backend.
 * The backend calls Plaid's /link/token/create endpoint.
 */
export async function createLinkToken() {
  const timeout = createAbortTimeout(LINK_TOKEN_TIMEOUT_MS, "Plaid link token");
  try {
    const res = await fetchPlaidBackend(`${API_BASE}/plaid/link-token`, {
      method: "POST",
      body: JSON.stringify({}),
      signal: timeout.signal,
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      void log.error("plaid", `link-token response ${res.status}`, { body: errBody.substring(0, 500) });
      // Try to extract Plaid's specific error message
      let detail = `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(errBody);
        detail = parsed.error_message || parsed.error || detail;
      } catch {
        /* not JSON */
      }
      throw new Error(`Link token failed: ${detail}`);
    }
    const data = await res.json();
    return data.link_token;
  } catch (err) {
    void log.error("plaid", "fetch backend link-token network error", { error: err?.message || err });
    throw err;
  } finally {
    timeout.cancel();
  }
}

/**
 * Step 2: Open the Plaid Link UI.
 * This loads the Plaid Link SDK dynamically (only when needed).
 * Returns the public_token and metadata from the Link session.
 */
export async function openPlaidLink(options = {}) {
  if (activePlaidLinkPromise) {
    void log.warn("plaid", "Reusing active Link flow");
    return activePlaidLinkPromise;
  }

  activePlaidLinkPromise = withPlaidTimeout(async () => {
    const { skipLimit = false } = options;

    const conns = await getConnections();

    if (!skipLimit) {
      let subState = null;
      try {
        subState = await getSubscriptionState();
      } catch (err) {
        void log.warn("plaid", "Subscription state unavailable:", err?.message || err);
      }
      const tierId = subState?.tier || "free";
      const limit = INSTITUTION_LIMITS[tierId] || INSTITUTION_LIMITS.free;

      if (isGatingEnforced() && conns.length >= limit) {
        throw new Error(`Institution limit reached. Your ${tierId === "pro" ? "Pro" : "Free"} plan allows up to ${limit} bank connections.`);
      }
    }

    // Dynamically load Plaid Link SDK if not already loaded
    if (!window.Plaid) {
      void log.warn("plaid", "Loading Plaid Link SDK from CDN...");
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
        
        const timer = setTimeout(() => {
          reject(new Error("Plaid Link SDK failed to load within 10 seconds. Please disable content blockers or adblockers and try again."));
        }, 10000);

        script.onload = () => {
          clearTimeout(timer);
          void log.warn("plaid", "SDK script loaded");
          resolve();
        };
        script.onerror = e => {
          clearTimeout(timer);
          void log.error("plaid", "SDK script FAILED to load", { error: e });
          reject(new Error("Failed to load Plaid Link SDK — check network connectivity"));
        };
        document.head.appendChild(script);
      });
    }
    if (!window.Plaid) {
      throw new Error("Plaid Link SDK loaded but window.Plaid is undefined");
    }

    void log.warn("plaid", "Creating link token...");
    let linkToken;
    try {
      linkToken = await createLinkToken();
      void log.warn("plaid", "Link token obtained:", linkToken ? "OK" : "EMPTY");
    } catch (e) {
      void log.error("plaid", "createLinkToken failed", { error: e?.message || e });
      throw e;
    }

    return new Promise((resolve, reject) => {
      void log.warn("plaid", "Creating Plaid.create handler...");
      let settled = false;
      let timeoutId = null;
      const finish = (fn) => {
        if (settled) return;
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        fn();
      };
      const handler = window.Plaid.create({
        token: linkToken,
        onSuccess: (publicToken, metadata) => {
          finish(() => resolve({ publicToken, metadata }));
        },
        onExit: (err, _metadata) => {
          if (err) {
            finish(() => reject(new Error(err.display_message || err.error_message || "Plaid Link exited")));
          } else {
            finish(() => reject(new Error("cancelled")));
          }
        },
        onEvent: (/* eventName, metadata */) => {
          // Could log analytics here
        },
      });
      timeoutId = setTimeout(() => {
        try {
          handler.exit?.({ force: true });
        } catch {
          /* best-effort close */
        }
        finish(() => reject(new Error("Plaid Link timed out. Please try again.")));
      }, PLAID_LINK_UI_TIMEOUT_MS);
      try {
        handler.open();
        void log.warn("plaid", "handler.open() called");
      } catch (err) {
        finish(() => reject(new Error(err?.message || "Plaid Link failed to open")));
      }
    });
  }, PLAID_LINK_UI_TIMEOUT_MS + 10000, "Plaid Link flow").finally(() => {
    activePlaidLinkPromise = null;
  });

  return activePlaidLinkPromise;
}

/**
 * Step 3: Exchange public_token for a worker-side Plaid item record.
 * The backend calls Plaid's /item/public_token/exchange.
 */
export async function exchangeToken(publicToken, options = {}) {
  const timeout = createAbortTimeout(EXCHANGE_TIMEOUT_MS, "Plaid exchange");
  try {
    const body = { publicToken };
    if (options.replaceItemId) body.replaceItemId = options.replaceItemId;
    const res = await fetchPlaidBackend(`${API_BASE}/plaid/exchange`, {
      method: "POST",
      body: JSON.stringify(body),
      signal: timeout.signal,
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      let detail = `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(errBody);
        detail = parsed.message || parsed.error || detail;
      } catch {
        /* ignore non-JSON body */
      }
      throw new Error(`Token exchange failed: ${detail}`);
    }
    const data = await res.json();
    return { itemId: data.item_id };
  } finally {
    timeout.cancel();
  }
}

/**
 * Full Link flow: open Link → exchange token → store connection.
 * Returns the new connection object.
 */
async function persistConnection(connection, itemId) {
  const normalized = {
    id: itemId,
    institutionName: connection.institutionName,
    institutionId: connection.institutionId,
    institutionLogo: connection.institutionLogo || null,
    accounts: connection.accounts || [],
    lastSync: null,
    _needsReconnect: false,
  };

  const conns = await getConnections();
  let idx = conns.findIndex(c => c.id === itemId);
  if (idx < 0 && normalized.institutionId) {
    idx = conns.findIndex(c => c.institutionId === normalized.institutionId);
  }
  if (idx >= 0) {
    const oldAccounts = conns[idx].accounts || [];
    for (const newAcct of normalized.accounts) {
      const oldMatch = oldAccounts.find(oa => oa.mask === newAcct.mask && oa.type === newAcct.type);
      if (oldMatch) {
        newAcct.linkedCardId = oldMatch.linkedCardId || null;
        newAcct.linkedBankAccountId = oldMatch.linkedBankAccountId || null;
        newAcct.linkedInvestmentId = oldMatch.linkedInvestmentId || null;
      }
    }
    conns[idx] = normalized;
  } else {
    conns.push(normalized);
  }
  await saveConnections(conns);
  return normalized;
}

async function runLinkFlow({ onSuccess, onError, skipLimit = false, replaceItemId = null } = {}) {
  try {
    const { publicToken, metadata } = await openPlaidLink({ skipLimit });
    const { itemId } = await exchangeToken(publicToken, {
      replaceItemId,
    });

    const connection = await persistConnection({
      institutionName: metadata.institution?.name || "Unknown Bank",
      institutionId: metadata.institution?.institution_id || null,
      institutionLogo: metadata.institution?.logo || null,
      accounts: (metadata.accounts || []).map(a => ({
        plaidAccountId: a.id,
        name: a.name,
        officialName: a.official_name || a.name,
        type: a.type, // "depository" | "credit" | "loan" | "investment"
        subtype: a.subtype, // "checking" | "savings" | "credit card" | etc.
        mask: a.mask, // last 4 digits
        linkedCardId: null, // Will be auto-matched
        linkedBankAccountId: null,
        balance: null,
      })),
    }, itemId);

    if (onSuccess) await onSuccess(connection);
    return connection;
  } catch (err) {
    if (onError) onError(err);
    else throw err;
  }
}

export async function connectBank(onSuccess, onError) {
  return runLinkFlow({
    onSuccess: async (connection) => {
      void recordFirstBankConnectionValue();
      if (onSuccess) await onSuccess(connection);
    },
    onError,
  });
}

export async function reconnectBank(connection, onSuccess, onError) {
  return runLinkFlow({
    skipLimit: true,
    replaceItemId: connection?.id || null,
    onSuccess: async nextConnection => {
      const conns = await getConnections();
      const merged = conns.map(conn =>
        conn.id === nextConnection.id ||
        conn.id === connection?.id ||
        (conn.institutionId && nextConnection.institutionId && conn.institutionId === nextConnection.institutionId)
          ? { ...nextConnection, _needsReconnect: false }
          : conn
      );
      await saveConnections(merged);
      if (onSuccess) await onSuccess(nextConnection);
    },
    onError: (err) => {
      void trackSupportEvent("plaid_reconnect_failed", { error: err?.message || "unknown" });
      if (onError) onError(err);
      else throw err;
    },
  });
}

// ─── Balance Fetching ─────────────────────────────────────────

/**
 * Force the backend to fetch fresh data from Plaid immediately
 * Used by Manual Sync. Respects backend tier cooldowns.
 */
export async function forceBackendSync(options = {}) {
  const body = {};
  if (options.connectionId) body.connectionId = options.connectionId;
  const res = await fetchPlaidBackend(`${API_BASE}/api/sync/force`, {
    method: "POST",
    body: JSON.stringify(body),
  }, {
    timeoutMs: SYNC_FORCE_TIMEOUT_MS,
    authBootstrapTimeoutMs: LINK_TOKEN_TIMEOUT_MS,
  });
  let payload = null;
  try {
    payload = await res.clone().json();
  } catch {
    payload = null;
  }
  const reconnectRequired =
    payload?.error === "reconnect_required" ||
    (Array.isArray(payload?.reconnectRequiredItemIds) && payload.reconnectRequiredItemIds.length > 0) ||
    (Array.isArray(payload?.failedItems) && payload.failedItems.some(item => item?.reconnectRequired));

  if (!res.ok) {
    if (res.status === 429) {
      void log.warn("plaid", `Force sync throttled by backend cooldown. Using cached D1 data.`);
      return {
        success: false,
        throttled: true,
        status: res.status,
        message: payload?.message || "Manual sync is on cooldown.",
        reconnectRequired: false,
        failedItems: [],
      };
    }
    const message = payload?.message || `Force sync failed: HTTP ${res.status}`;
    void log.error("plaid", `Force sync failed: HTTP ${res.status}`, {
      reconnectRequired,
      message,
      failedItems: payload?.failedItems || [],
    });
    return {
      success: false,
      throttled: false,
      status: res.status,
      message,
      reconnectRequired,
      failedItems: payload?.failedItems || [],
    };
  }
  return {
    success: true,
    throttled: false,
    status: res.status,
    message: payload?.message || "Live sync completed.",
    reconnectRequired,
    failedItems: payload?.failedItems || [],
  };
}

export async function maintainBackendSync() {
  const res = await fetchPlaidBackend(`${API_BASE}/api/sync/maintain`, {
    method: "POST",
    body: JSON.stringify({}),
  }, {
    timeoutMs: SYNC_FORCE_TIMEOUT_MS,
    authBootstrapTimeoutMs: LINK_TOKEN_TIMEOUT_MS,
  });

  if (!res.ok) {
    if (res.status === 429) return { success: false, throttled: true };
    void log.warn("plaid", `Maintenance sync failed: HTTP ${res.status}`);
    return { success: false };
  }

  try {
    return await res.json();
  } catch {
    return { success: true };
  }
}

async function fetchCachedSyncStatus() {
  const res = await fetchPlaidBackend(`${API_BASE}/api/sync/status`, {
    method: "POST",
    body: JSON.stringify({}),
  }, {
    timeoutMs: SYNC_STATUS_TIMEOUT_MS,
    authBootstrapTimeoutMs: LINK_TOKEN_TIMEOUT_MS,
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    void log.warn("plaid", `sync status FAILED: HTTP ${res.status} — ${errBody.substring(0, 200)}`);
    throw new Error(`Sync status failed: ${res.status}`);
  }

  return res.json();
}

function getPlaidCreditLimitCacheKey(institutionName, mask) {
  const normalizedInstitution = normText(normalizeInstitution(institutionName) || institutionName);
  const last4 = normDigits(mask).slice(-4);
  if (!normalizedInstitution || !last4) return null;
  return `${normalizedInstitution}::${last4}`;
}

export function normalizePlaidBalanceSnapshot(balance = null, fallback = null, options = {}) {
  const deriveLimit = options.deriveLimit === true;
  const current = toFiniteMoney(balance?.current ?? fallback?.current);
  const available = toFiniteMoney(balance?.available ?? fallback?.available);
  const explicitLimit = toFiniteMoney(balance?.limit ?? (deriveLimit ? fallback?.limit : null));
  const derivedLimit =
    explicitLimit != null
      ? explicitLimit
      : deriveLimit && current != null && available != null
        ? Math.max(0, current + available)
        : null;

  return {
    available,
    current,
    limit: derivedLimit,
    currency: balance?.iso_currency_code || fallback?.currency || "USD",
  };
}

export function hydrateConnectionWithCachedCreditLimits(connection, cache = {}) {
  if (!connection || !Array.isArray(connection.accounts)) return connection;
  for (const acct of connection.accounts) {
    if (acct?.type !== "credit") continue;
    const key = getPlaidCreditLimitCacheKey(connection.institutionName, acct.mask);
    if (!key) continue;
    const cachedLimit = toFiniteMoney(cache[key]);
    if (cachedLimit == null || cachedLimit <= 0) continue;
    acct.balance = normalizePlaidBalanceSnapshot(acct.balance, { limit: cachedLimit }, { deriveLimit: true });
  }
  return connection;
}

export function collectConnectionCreditLimits(connection, existingCache = {}) {
  const nextCache = { ...(existingCache || {}) };
  if (!connection || !Array.isArray(connection.accounts)) return nextCache;
  for (const acct of connection.accounts) {
    if (acct?.type !== "credit") continue;
    const key = getPlaidCreditLimitCacheKey(connection.institutionName, acct.mask);
    const limit = toFiniteMoney(acct?.balance?.limit);
    if (!key || limit == null || limit <= 0) continue;
    nextCache[key] = limit;
  }
  return nextCache;
}

async function reconcileConnectionCreditLimitCache(connection) {
  const currentCache = ((await db.get(PLAID_CREDIT_LIMIT_CACHE_KEY)) || {});
  hydrateConnectionWithCachedCreditLimits(connection, currentCache);
  const nextCache = collectConnectionCreditLimits(connection, currentCache);
  if (JSON.stringify(nextCache) !== JSON.stringify(currentCache)) {
    await db.set(PLAID_CREDIT_LIMIT_CACHE_KEY, nextCache);
  }
}

function persistCreditLimitCacheEntry(institutionName, mask, limit) {
  const key = getPlaidCreditLimitCacheKey(institutionName, mask);
  const normalizedLimit = toFiniteMoney(limit);
  if (!key || normalizedLimit == null || normalizedLimit <= 0) return;
  void db.get(PLAID_CREDIT_LIMIT_CACHE_KEY)
    .then((cache) => {
      const currentCache = cache && typeof cache === "object" ? cache : {};
      if (currentCache[key] === normalizedLimit) return null;
      return db.set(PLAID_CREDIT_LIMIT_CACHE_KEY, {
        ...currentCache,
        [key]: normalizedLimit,
      });
    })
    .catch(() => {});
}

/**
 * Fetch fresh balances for a connection from Plaid.
 * Our backend calls Plaid's /accounts/balance/get.
 */
export async function fetchBalances(connectionId, retryCount = 0) {
  const conns = await getConnections();
  const conn = conns.find(c => c.id === connectionId);
  if (!conn) throw new Error(`Connection ${connectionId} not found`);

  const data = await fetchCachedSyncStatus();
  if (!data.hasData) {
    if (retryCount < 20) {
      const backoffMs = Math.min(2000 * Math.pow(2, Math.floor(retryCount / 3)), 8000);
      void log.warn("plaid", `No pre-fetched sync data available for connection ${connectionId} yet. Retrying in ${backoffMs}ms (attempt ${retryCount + 1}/20)...`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
      return fetchBalances(connectionId, retryCount + 1);
    }
    void log.warn("plaid", `No pre-fetched sync data available for connection ${connectionId} yet. Waiting for Webhook.`);
    return { ...conn, _pendingSync: true, _syncStatus: "pending" };
  }

  const { accounts } = data.balances || { accounts: [] };

  // Update stored balances
  for (const acct of conn.accounts) {
    const fresh = accounts.find(a => a.account_id === acct.plaidAccountId);
    if (fresh) {
      acct.balance = normalizePlaidBalanceSnapshot(fresh.balances, acct.balance, {
        deriveLimit: acct.type === "credit",
      });
      void log.warn("plaid", 
        `  → ${acct.name}: bal=${acct.balance?.current}, limit=${acct.balance?.limit}, avail=${acct.balance?.available}`
      );
    }
  }
  await reconcileConnectionCreditLimitCache(conn);
  const balanceFreshness = data.sync_freshness?.[connectionId]?.balances || null;
  conn.lastSync = balanceFreshness || conn.lastSync || data.last_synced_at || new Date().toISOString();
  await saveConnections(conns);

  return conn;
}

/**
 * Fetch balances for ALL connections.
 */
export async function fetchAllBalances() {
  const conns = await getConnections();
  const results = [];
  for (const conn of conns) {
    try {
      results.push(await fetchBalances(conn.id));
    } catch (e) {
      results.push({ ...conn, _error: e.message });
    }
  }
  return results;
}

// ─── Liabilities Fetching (Credit Card Metadata) ─────────────

/**
 * Fetch credit card liabilities for a connection from Plaid.
 * Returns enriched metadata: APR, statement close date, payment due date,
 * minimum payment, last payment amount/date.
 *
 * Plaid's /liabilities/get response shape for credit cards:
 *   liabilities.credit[]: { account_id, aprs[], last_payment_amount,
 *     last_payment_date, last_statement_balance, last_statement_issue_date,
 *     minimum_payment_amount, next_payment_due_date }
 */
export async function fetchLiabilities(connectionId, retryCount = 0) {
  const conns = await getConnections();
  const conn = conns.find(c => c.id === connectionId);
  if (!conn) throw new Error("Connection not found");

  const res = await fetchPlaidBackend(`${API_BASE}/api/sync/status`, {
    method: "POST",
    body: JSON.stringify({}),
  }, {
    timeoutMs: SYNC_STATUS_TIMEOUT_MS,
    authBootstrapTimeoutMs: LINK_TOKEN_TIMEOUT_MS,
  });
  if (!res.ok) throw new Error(`Liabilities fetch failed: ${res.status}`);
  const data = await res.json();
  if (!data.hasData) {
    if (retryCount < 20) {
      const backoffMs = Math.min(2000 * Math.pow(2, Math.floor(retryCount / 3)), 8000);
      void log.warn("plaid", `No liability sync data for ${connectionId} yet. Retrying in ${backoffMs}ms (attempt ${retryCount + 1}/20)...`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
      return fetchLiabilities(connectionId, retryCount + 1);
    }
    return { ...conn, _pendingSync: true, _syncStatus: "pending" };
  }

  // Plaid returns { liabilities: { credit: [...] }, accounts: [...] } inside data.liabilities
  const creditLiabilities = data.liabilities?.liabilities?.credit || [];
  const liabilityAccounts = data.liabilities?.accounts || [];

  // Store liabilities data on matching connection accounts
  for (const acct of conn.accounts) {
    if (acct.type !== "credit") continue;
    const liabilityAccount = liabilityAccounts.find(a => a.account_id === acct.plaidAccountId);
    if (liabilityAccount?.balances) {
      acct.balance = normalizePlaidBalanceSnapshot(liabilityAccount.balances, acct.balance, { deriveLimit: true });
      void log.warn("plaid",
        `  → liability account ${acct.name}: bal=${acct.balance?.current}, limit=${acct.balance?.limit}, avail=${acct.balance?.available}`
      );
    }
    const liability = creditLiabilities.find(l => l.account_id === acct.plaidAccountId);
    if (liability) {
      acct.liability = {
        // APR: Plaid returns an array of APR breakdowns (purchase, balance_transfer, cash_advance)
        aprs: (liability.aprs || []).map(a => ({
          type: a.apr_type, // "purchase_apr" | "balance_transfer_apr" | "cash_advance_apr"
          percentage: a.apr_percentage,
          balanceSubject: a.balance_subject_to_apr,
        })),
        purchaseApr: (liability.aprs || []).find(a => a.apr_type === "purchase_apr")?.apr_percentage ?? null,
        lastPaymentAmount: liability.last_payment_amount,
        lastPaymentDate: liability.last_payment_date,
        lastStatementBalance: liability.last_statement_balance,
        lastStatementDate: liability.last_statement_issue_date,
        minimumPayment: liability.minimum_payment_amount,
        nextPaymentDueDate: liability.next_payment_due_date,
      };
    }
  }
  await reconcileConnectionCreditLimitCache(conn);

  const liabilityFreshness = data.sync_freshness?.[connectionId]?.liabilities || null;
  conn.lastLiabilitySync = liabilityFreshness || conn.lastLiabilitySync || data.last_synced_at || new Date().toISOString();
  await saveConnections(conns);
  return conn;
}

/**
 * Fetch balances AND liabilities for a connection in parallel.
 * This is the preferred method — one call gets everything.
 */
export async function fetchBalancesAndLiabilities(connectionId) {
  // Run sequentially to avoid concurrent read→modify→save race condition.
  // Both functions read connections, modify, and saveConnections();
  // running them in parallel causes the last writer to overwrite the other's changes.
  const balanceResult = await fetchBalances(connectionId);
  let pendingSync = Boolean(balanceResult?._pendingSync);
  try {
    const liabilityResult = await fetchLiabilities(connectionId);
    pendingSync = pendingSync || Boolean(liabilityResult?._pendingSync);
  } catch (e) {
    void log.warn("plaid", `liabilities skipped for ${connectionId}: ${e.message}`);
  }
  const conns = await getConnections();
  const fresh = conns.find(c => c.id === connectionId);
  return pendingSync ? { ...fresh, _pendingSync: true, _syncStatus: "pending" } : fresh;
}

/**
 * Fetch balances + liabilities for ALL connections in parallel.
 */
export async function fetchAllBalancesAndLiabilities(options = {}) {
  const allowedConnectionIds = new Set(
    Array.from(options.connectionIds || []).map(id => String(id || "").trim()).filter(Boolean)
  );
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
  let conns = await getConnections();
  if (allowedConnectionIds.size > 0) {
    conns = conns.filter(conn => allowedConnectionIds.has(String(conn?.id || "").trim()));
  }

  // Deduplicate: if multiple connections share the same institutionId, keep only the latest
  const seen = new Map();
  for (const conn of conns) {
    const key = conn.institutionId || conn.id;
    if (!seen.has(key)) {
      seen.set(key, conn);
    } else {
      // Keep the later metadata row when duplicate institutions appear.
      const prev = seen.get(key);
      if (conns.indexOf(conn) > conns.indexOf(prev)) {
        seen.set(key, conn);
      }
    }
  }
  if (seen.size < conns.length) {
    const removed = conns.length - seen.size;
    conns = Array.from(seen.values());
    await saveConnections(conns);
    void log.warn("plaid", `Deduped connections: removed ${removed} duplicate(s), ${conns.length} remaining`);
  }

  const results = [];
  for (let i = 0; i < conns.length; i++) {
    const conn = conns[i];
    onProgress?.({
      phase: "syncing",
      current: i + 1,
      completed: i,
      total: conns.length,
      institutionName: conn.institutionName || "Bank",
    });
    try {
      const result = await fetchBalancesAndLiabilities(conn.id);
      results.push(result);
      onProgress?.({
        phase: "syncing",
        current: i + 1,
        completed: i + 1,
        total: conns.length,
        institutionName: conn.institutionName || "Bank",
        result,
      });
    } catch (e) {
      void log.warn("plaid", `sync failed for ${conn.institutionName}: ${e.message}`);
      const result = { ...conn, _error: e.message };
      results.push(result);
      onProgress?.({
        phase: "syncing",
        current: i + 1,
        completed: i + 1,
        total: conns.length,
        institutionName: conn.institutionName || "Bank",
        result,
      });
    }
  }
  return results;
}

// ─── Transaction Fetching ─────────────────────────────────────

const TRANSACTIONS_STORAGE_KEY = "plaid-transactions";
const PLAID_AI_CATEGORIZATION_COOLDOWN_KEY = "plaid-ai-categorization-cooldown-until";
const PLAID_AI_CATEGORIZATION_FAILURE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const PLAID_AI_CATEGORIZATION_MAX_BATCH = 40;

/**
 * Format a Date as YYYY-MM-DD for Plaid API.
 */
/**
 * Fetch transactions for a single connection from Plaid.
 * @param {string} connectionId
 * @param {number} [_days=30] - Reserved for future per-call transaction windows
 * @returns {Array} Normalized transaction array
 */
export function mapTransactionsFromSyncStatus(connection, data) {
  const conn = connection;
  if (!conn) return [];
  if (!data.hasData) return [];

  const raw = filterTransactionsForConnection(data.transactions?.transactions || [], conn);

  // Normalize Plaid transaction format → app format
  return raw.map(t => {
    const linkedAccount = conn.accounts.find(a => a.plaidAccountId === t.account_id) || {};
    // Plaid v2 returns FOOD_AND_DRINK (upper snake_case) → "food and drink"
    const rawCat = t.personal_finance_category?.primary || t.category?.[0] || "";
    const rawSub = t.personal_finance_category?.detailed || t.category?.[1] || "";
    const merchantName = t.merchant_name || null;
    const merchantMcc = t.merchant_category_code || t.mcc || null;
    const merchantId = t.merchant_entity_id || t.counterparties?.[0]?.entity_id || null;
    const merchantWebsite = t.website || t.counterparties?.[0]?.website || null;
    const merchantIdentity = inferMerchantIdentity({
      merchantId,
      merchantName,
      description: t.name || merchantName || "Unknown",
      category: rawCat.replace(/_/g, " ").toLowerCase().trim(),
      subcategory: rawSub.replace(/_/g, " ").toLowerCase().trim(),
      mcc: merchantMcc,
      website: merchantWebsite,
    });
    return {
      id: t.transaction_id,
      date: t.date,
      amount: Math.abs(t.amount), // Plaid: positive = debit, negative = credit
      isCredit: t.amount < 0, // Refunds, deposits
      description: merchantName || t.name || "Unknown",
      name: t.name || merchantName || "Unknown",
      merchantName,
      merchantId,
      merchantMcc: merchantIdentity.merchantMcc,
      merchantKey: merchantIdentity.merchantKey,
      merchantBrand: merchantIdentity.merchantBrand,
      merchantConfidence: merchantIdentity.confidence,
      merchantWebsite,
      category: rawCat.replace(/_/g, " ").toLowerCase().trim(),
      subcategory: rawSub.replace(/_/g, " ").toLowerCase().trim(),
      institution: conn.institutionName,
      accountId: t.account_id,
      accountName: linkedAccount.name || "",
      accountType: linkedAccount.subtype || "",
      linkedCardId: linkedAccount.linkedCardId || null,
      linkedBankAccountId: linkedAccount.linkedBankAccountId || null,
      pending: t.pending || false,
    };
  });
}

export async function fetchTransactions(connectionId, _days = 30, options = {}) {
  const conns = await getConnections();
  const conn = conns.find(c => c.id === connectionId);
  if (!conn) throw new Error(`Connection ${connectionId} not found`);

  try {
    const data = options.cachedStatusData || await fetchCachedSyncStatus();
    return mapTransactionsFromSyncStatus(conn, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void log.warn("plaid", `fetchTransactions FAILED for ${conn.institutionName}: ${message}`);
    throw error instanceof Error ? error : new Error(message);
  }
}

export function filterTransactionsForConnection(transactions = [], connection = null) {
  if (!Array.isArray(transactions) || transactions.length === 0) return [];
  const accountIds = new Set(
    (connection?.accounts || [])
      .map(account => account?.plaidAccountId)
      .filter(Boolean)
  );
  if (accountIds.size === 0) return transactions.filter(Boolean);
  return transactions.filter(transaction => accountIds.has(transaction?.account_id));
}

/**
 * Fetch transactions for ALL connections and store locally.
 * Includes On-Device AI Categorization Engine pipeline.
 * @param {number} [days=30] - How many days back
 * @param {{ maxTransactions?: number, categorizeWithAi?: boolean }} [options]
 * @returns {{ transactions: Array, fetchedAt: string }}
 */
export async function fetchAllTransactions(days = 30, options = {}) {
  const maxTransactions = Number.isFinite(options.maxTransactions) ? Math.max(0, Number(options.maxTransactions)) : Infinity;
  const categorizeWithAi = options.categorizeWithAi !== false;
  const allowedConnectionIds = new Set(
    Array.from(options.connectionIds || []).map(id => String(id || "").trim()).filter(Boolean)
  );
  const conns = (await getConnections()).filter(conn =>
    allowedConnectionIds.size === 0 || allowedConnectionIds.has(String(conn?.id || "").trim())
  );
  let all = [];
  const cachedStatusData = await fetchCachedSyncStatus();

  for (const conn of conns) {
    try {
      const txns = await fetchTransactions(conn.id, days, { cachedStatusData });
      all = all.concat(txns);
      void log.warn("plaid", `Fetched ${txns.length} transactions from ${conn.institutionName}`);
    } catch (e) {
      void log.warn("plaid", `Transaction fetch skipped for ${conn.institutionName}: ${e.message}`);
    }
  }

  // Sort newest first, deduplicate by transaction ID
  const seen = new Set();
  all = all
    .filter(t => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  if (Number.isFinite(maxTransactions)) {
    all = all.slice(0, maxTransactions);
  }

  // --- AI CATEGORIZATION PIPELINE ---
  
  // 1. First pass: On-Device fast mapping via merchantMap.js baseline/user history
  const localMapResult = await categorizeBatch(all.map(t => ({ description: t.description })));
  
  const uncategorizedItems = new Map(); // desc -> list of transaction objects
  
  for (let t of all) {
    const desc = t.description;
    const localMatch = localMapResult.get(desc);
    if (localMatch) {
      t.category = localMatch.category; // overwrite raw Plaid category
    } else {
      // It's unknown. Collect it for the AI fallback.
      if (!uncategorizedItems.has(desc)) {
        uncategorizedItems.set(desc, []);
      }
      uncategorizedItems.get(desc).push(t);
    }
  }

  // 2. Second pass: AI Fallback for unknowns
  const uniqueUnknowns = Array.from(uncategorizedItems.keys());
  if (categorizeWithAi && uniqueUnknowns.length > 0) {
    const storage = typeof localStorage !== "undefined" ? localStorage : null;
    const cooldownUntil = Number(storage?.getItem(PLAID_AI_CATEGORIZATION_COOLDOWN_KEY) || 0);
    if (cooldownUntil > Date.now()) {
      void log.warn("plaid", "AI categorization cooldown active; skipping retry for uncategorized merchants.");
    } else {
      const batchedUnknowns = uniqueUnknowns.slice(0, PLAID_AI_CATEGORIZATION_MAX_BATCH);
      void log.warn("plaid", `Sending ${batchedUnknowns.length} unknown merchants to AI Categorization Engine...`);
      const aiCategoryMap = await batchCategorizeTransactions(batchedUnknowns);
      if (!aiCategoryMap || Object.keys(aiCategoryMap).length === 0) {
        storage?.setItem(
          PLAID_AI_CATEGORIZATION_COOLDOWN_KEY,
          String(Date.now() + PLAID_AI_CATEGORIZATION_FAILURE_COOLDOWN_MS)
        );
      } else {
        storage?.removeItem(PLAID_AI_CATEGORIZATION_COOLDOWN_KEY);
      }

      // 3. Apply AI results and learn them so we never hit the AI again for these
      for (const [desc, category] of Object.entries(aiCategoryMap)) {
        if (!category) continue;

        // Update the transaction objects in memory
        const txnsToUpdate = uncategorizedItems.get(desc) || [];
        for (const t of txnsToUpdate) {
          t.category = category;
        }

        // Learn it locally (saves to IndexedDB)
        await learn(desc, category);
      }
    }
  }
  
  // ----------------------------------

  const stored = { data: all, fetchedAt: new Date().toISOString() };
  await db.set(TRANSACTIONS_STORAGE_KEY, stored);
  return stored;
}

/**
 * Get locally stored transactions (no network call).
 * @returns {{ data: Array, fetchedAt: string } | null}
 */
export async function getStoredTransactions() {
  return await db.get(TRANSACTIONS_STORAGE_KEY);
}

// ─── Auto-Matching Engine ─────────────────────────────────────

/**
 * INSTITUTION NAME NORMALIZATION
 * Maps Plaid's institution names to the app's INSTITUTIONS list.
 */
const INSTITUTION_ALIASES = {
  "american express": "American Express",
  "american express card": "American Express",
  amex: "American Express",
  "bank of america": "Bank of America",
  barclays: "Barclays",
  "barclays bank": "Barclays",
  "barclays - cards": "Barclays",
  "barclays card": "Barclays",
  "barclays cards": "Barclays",
  "barclays us": "Barclays",
  "barclays bank delaware": "Barclays",
  "capital one": "Capital One",
  chase: "Chase",
  "jpmorgan chase": "Chase",
  "chase bank": "Chase",
  citibank: "Citi",
  citi: "Citi",
  "citi cards": "Citi",
  "citibank online": "Citi",
  "citibank na": "Citi",
  "citicards": "Citi",
  "citi retail services": "Citi",
  discover: "Discover",
  "discover bank": "Discover",
  "discover financial": "Discover",
  fnbo: "FNBO",
  "first national bank of omaha": "FNBO",
  "goldman sachs": "Goldman Sachs",
  "marcus by goldman sachs": "Goldman Sachs",
  "goldman sachs bank usa": "Goldman Sachs",
  hsbc: "HSBC",
  "hsbc bank": "HSBC",
  "navy federal": "Navy Federal",
  "navy federal credit union": "Navy Federal",
  penfed: "PenFed",
  "pentagon federal credit union": "PenFed",
  "penfed credit union": "PenFed",
  synchrony: "Synchrony",
  "synchrony bank": "Synchrony",
  "synchrony financial": "Synchrony",
  "td bank": "TD Bank",
  "td bank na": "TD Bank",
  "us bank": "US Bank",
  "u.s. bank": "US Bank",
  "us bank na": "US Bank",
  usaa: "USAA",
  "usaa savings bank": "USAA",
  "usaa federal savings bank": "USAA",
  "wells fargo": "Wells Fargo",
  "wells fargo bank": "Wells Fargo",
  ally: "Ally",
  "ally bank": "Ally",
  "ally financial": "Ally",
};

function normalizeInstitution(plaidName) {
  if (!plaidName) return null;
  const lower = plaidName.toLowerCase().trim();

  // Exact match
  if (INSTITUTION_ALIASES[lower]) return INSTITUTION_ALIASES[lower];

  // Fuzzy fallback: strip common Plaid suffixes and try again
  const stripped = lower
    .replace(/\s*-\s*(cards?|online|banking|credit|na|bank)$/i, "")
    .replace(/\s+(credit union|bank|na|financial|card services?|savings bank|online)$/i, "")
    .trim();
  if (stripped !== lower && INSTITUTION_ALIASES[stripped]) return INSTITUTION_ALIASES[stripped];

  // Last resort: check if any alias key is a prefix of the Plaid name
  for (const [alias, canonical] of Object.entries(INSTITUTION_ALIASES)) {
    if (lower.startsWith(alias + " ") || lower.startsWith(alias + "-")) return canonical;
  }

  return plaidName;
}

function normText(v) {
  return String(v || "")
    .toLowerCase()
    .trim();
}

function normDigits(v) {
  return String(v || "").replace(/\D/g, "");
}

function extractLast4(card) {
  if (!card) return null;
  const direct = [card.last4, card.mask].map(normDigits).find(v => v.length >= 4);
  if (direct) return direct.slice(-4);

  const notesMatch = String(card.notes || "").match(/···\s?(\d{4})/);
  if (notesMatch) return notesMatch[1];
  return null;
}

function sameInstitution(a, b) {
  // Normalize both sides through the alias table so
  // "Amex" matches "American Express", "Chase Bank" matches "Chase", etc.
  const normA = normalizeInstitution(a) || a;
  const normB = normalizeInstitution(b) || b;
  return normText(normA) === normText(normB);
}

/**
 * Auto-match Plaid accounts to existing cards and bank accounts.
 *
 * Matching strategy (in priority order):
 *   1. Exact mask (last 4) + institution match → high confidence
 *   2. Institution + account name substring match → medium confidence
 *   3. Unmatched accounts are flagged for manual linking
 *
 * @param {Object} connection - Plaid connection with accounts
 * @param {Array} cards - Current card-portfolio array
 * @param {Array} bankAccounts - Current bank-accounts array
 * @returns {Object} { matched, unmatched, newCards, newBankAccounts }
 */
export function fuzzyMatchCardName(plaidName, catalogNames) {
  if (!plaidName || !catalogNames || !catalogNames.length) return plaidName;

  // exact match
  const exact = catalogNames.find(c => c.toLowerCase() === plaidName.toLowerCase());
  if (exact) return exact;

  // Tokenize based on alphanumeric chars
  const getTokens = str =>
    str
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter(Boolean);
  const plaidTokens = getTokens(plaidName);

  let bestMatch = null;
  let bestScore = 0;

  for (const catName of catalogNames) {
    const catTokens = getTokens(catName);
    let matchCount = 0;

    for (const pt of plaidTokens) {
      if (catTokens.includes(pt)) {
        matchCount++;
      }
    }

    // Bonus for subset matching (if plaid tokens are fully contained)
    if (matchCount === plaidTokens.length && matchCount > bestScore) {
      bestScore = matchCount + 10;
      bestMatch = catName;
    } else if (matchCount > bestScore && matchCount >= plaidTokens.length / 2) {
      bestScore = matchCount;
      bestMatch = catName;
    }
  }

  return bestMatch || plaidName;
}

export function autoMatchAccounts(
  connection,
  cards = [],
  bankAccounts = [],
  cardCatalog = null,
  plaidInvestments = [],
  options = {}
) {
  const allowLikelyDuplicates = options?.allowLikelyDuplicates !== false;
  const matched = [];
  const unmatched = [];
  const newCards = [];
  const newBankAccounts = [];
  const newPlaidInvestments = [];
  /** @type {Array<{ kind: "card" | "bank", plaidAccountId: string, importedId: string, importedLabel: string, institution: string, existingIds: string[] }>} */
  const duplicateCandidates = [];

  const normalizedInst = normalizeInstitution(connection.institutionName);

  for (const acct of connection.accounts) {
    let linkedId = null;
    let linkedType = null; // "card" | "bank"

    if (acct.type === "credit") {
      const acctLast4 = normDigits(acct.mask).slice(-4) || null;
      const acctName = normText(acct.officialName || acct.name);
      const plaidBalance = normalizePlaidBalanceSnapshot(acct.balance, null, { deriveLimit: true });

      // Try to match to existing card
      const matchByPlaidId = cards.find(c => c._plaidAccountId === acct.plaidAccountId);
      const matchByMask =
        !matchByPlaidId && acctLast4
          ? cards.find(
              c => !c?._plaidAccountId && sameInstitution(c.institution, normalizedInst) && extractLast4(c) === acctLast4
            )
          : null;

      const duplicateMatches =
        !matchByPlaidId && !matchByMask && acctName
          ? findLikelyCardDuplicates(
              cards.filter((card) => !card?._plaidAccountId),
              {
              institution: normalizedInst,
              name: acct.officialName || acct.name,
              last4: acctLast4,
              }
            )
          : [];

      const cardMatch = matchByPlaidId || matchByMask;
      if (cardMatch) {
        linkedId = cardMatch.id;
        linkedType = "card";
        acct.linkedCardId = cardMatch.id;
      } else if (duplicateMatches.length > 0 && !allowLikelyDuplicates) {
        // In background hydration paths, avoid silently materializing likely duplicates.
      } else {
        // Prepare a new card record for user to review
        const catCards =
          cardCatalog && normalizedInst ? getIssuerCards(normalizedInst, cardCatalog).map(c => c.name) : [];
        const bestName = fuzzyMatchCardName(acct.officialName || acct.name, catCards);

        const newCard = {
          id: `plaid_${acct.plaidAccountId}`,
          name: bestName,
          institution: normalizedInst || "Other",
          nickname: "",
          limit: plaidBalance.limit,
          mask: acct.mask || null,
          last4: acctLast4,
          annualFee: null,
          annualFeeDue: "",
          annualFeeWaived: false,
          notes: `Auto-imported from Plaid (···${acct.mask || "?"})`,
          apr: null,
          hasPromoApr: false,
          promoAprAmount: null,
          promoAprExp: "",
          statementCloseDay: null,
          paymentDueDay: null,
          minPayment: null,
          _plaidAccountId: acct.plaidAccountId,
          _plaidConnectionId: connection.id,
          _plaidBalance: plaidBalance.current,
          _plaidAvailable: plaidBalance.available,
          _plaidLimit: plaidBalance.limit,
        };
        newCards.push(newCard);
        linkedId = newCard.id;
        linkedType = "card";
        acct.linkedCardId = newCard.id;
        if (duplicateMatches.length > 0) {
          duplicateCandidates.push({
            kind: /** @type {"card"} */ ("card"),
            plaidAccountId: acct.plaidAccountId,
            importedId: newCard.id,
            importedLabel: bestName,
            institution: normalizedInst || "Other",
            existingIds: duplicateMatches.map((match) => match.card?.id).filter(Boolean),
          });
        }
      }
    } else if (acct.type === "depository") {
      // Try to match to existing bank account
      const matchByPlaidId = bankAccounts.find(b => b._plaidAccountId === acct.plaidAccountId);
      const duplicateMatches = !matchByPlaidId
        ? findLikelyBankDuplicates(bankAccounts.filter((account) => !account?._plaidAccountId), {
            bank: normalizedInst,
            accountType: acct.subtype === "savings" ? "savings" : "checking",
            name: acct.officialName || acct.name,
          })
        : [];

      const bankMatch = matchByPlaidId;
      if (bankMatch) {
        linkedId = bankMatch.id;
        linkedType = "bank";
        acct.linkedBankAccountId = bankMatch.id;
      } else if (duplicateMatches.length > 0 && !allowLikelyDuplicates) {
        // In background hydration paths, avoid silently materializing likely duplicates.
      } else {
        // Prepare a new bank account record
        const newBank = {
          id: `plaid_${acct.plaidAccountId}`,
          bank: normalizedInst || "Other",
          accountType: acct.subtype === "savings" ? "savings" : "checking",
          name: acct.officialName || acct.name,
          apy: null,
          notes: `Auto-imported from Plaid (···${acct.mask || "?"})`,
          _plaidAccountId: acct.plaidAccountId,
          _plaidConnectionId: connection.id,
          _plaidBalance: acct.balance?.current ?? null,
          _plaidAvailable: acct.balance?.available ?? null,
        };
        newBankAccounts.push(newBank);
        linkedId = newBank.id;
        linkedType = "bank";
        acct.linkedBankAccountId = newBank.id;
        if (duplicateMatches.length > 0) {
          duplicateCandidates.push({
            kind: /** @type {"bank"} */ ("bank"),
            plaidAccountId: acct.plaidAccountId,
            importedId: newBank.id,
            importedLabel: newBank.name,
            institution: normalizedInst || "Other",
            existingIds: duplicateMatches.map((match) => match.account?.id).filter(Boolean),
          });
        }
      }
    } else if (acct.type === "investment") {
      // Try to match to existing plaid investment
      const matchByPlaidId = plaidInvestments.find(i => i._plaidAccountId === acct.plaidAccountId);
      if (matchByPlaidId) {
        linkedId = matchByPlaidId.id;
        linkedType = "investment";
        acct.linkedInvestmentId = matchByPlaidId.id;
      } else {
        // Heuristic bucket classification
        const n = normText(acct.officialName || acct.name);
        let bucket = "brokerage";
        if (n.includes("roth") || n.includes("ira") || n.includes("rollover")) bucket = "roth";
        else if (n.includes("401k") || n.includes("401(k)")) bucket = "k401";
        else if (n.includes("hsa") || n.includes("health savings")) bucket = "hsa";
        else if (n.includes("crypto") || n.includes("bitcoin") || n.includes("coinbase")) bucket = "crypto";

        const newInv = {
          id: `plaid_${acct.plaidAccountId}`,
          institution: normalizedInst || "Other",
          name: acct.officialName || acct.name,
          bucket, // roth, k401, brokerage, hsa, crypto
          _plaidBalance: acct.balance?.current || 0,
          _plaidAccountId: acct.plaidAccountId,
          _plaidConnectionId: connection.id,
        };
        newPlaidInvestments.push(newInv);
        linkedId = newInv.id;
        linkedType = "investment";
        acct.linkedInvestmentId = newInv.id;
      }
    }

    if (linkedId) {
      matched.push({ plaidAccount: acct, linkedId, linkedType });
    } else {
      unmatched.push(acct);
    }
  }

  return { matched, unmatched, newCards, newBankAccounts, newPlaidInvestments, duplicateCandidates };
}

function mergeUniqueById(existing = [], incoming = []) {
  if (!Array.isArray(incoming) || incoming.length === 0) return [...existing];
  const map = new Map((existing || []).map(item => [item?.id, item]));
  for (const item of incoming) {
    if (item?.id && !map.has(item.id)) map.set(item.id, item);
  }
  return Array.from(map.values());
}

export function ensureConnectionAccountsPresent(
  connection,
  cards = [],
  bankAccounts = [],
  cardCatalog = null,
  plaidInvestments = [],
  options = {}
) {
  const { newCards, newBankAccounts, newPlaidInvestments, duplicateCandidates = [] } = autoMatchAccounts(
    connection,
    cards,
    bankAccounts,
    cardCatalog,
    plaidInvestments,
    options
  );

  return {
    updatedCards: mergeUniqueById(cards, newCards),
    updatedBankAccounts: mergeUniqueById(bankAccounts, newBankAccounts),
    updatedPlaidInvestments: mergeUniqueById(plaidInvestments, newPlaidInvestments),
    importedCards: newCards.length,
    importedBankAccounts: newBankAccounts.length,
    importedPlaidInvestments: newPlaidInvestments.length,
    duplicateCandidates,
  };
}

/**
 * Persist in-memory account link IDs back to storage.
 * Without this, refresh fetches a stale connection with null links.
 */
export async function saveConnectionLinks(connection) {
  if (!connection?.id || !Array.isArray(connection.accounts)) return;

  const conns = await getConnections();
  const idx = conns.findIndex(c => c.id === connection.id);
  if (idx < 0) return;

  const linkByAccountId = new Map(
    connection.accounts.map(a => [
      a.plaidAccountId,
      {
        linkedCardId: a.linkedCardId,
        linkedBankAccountId: a.linkedBankAccountId,
        linkedInvestmentId: a.linkedInvestmentId,
      },
    ])
  );

  conns[idx].accounts = (conns[idx].accounts || []).map(acct => {
    const patch = linkByAccountId.get(acct.plaidAccountId);
    if (!patch) return acct;
    return {
      ...acct,
      linkedCardId: patch.linkedCardId ?? acct.linkedCardId ?? null,
      linkedBankAccountId: patch.linkedBankAccountId ?? acct.linkedBankAccountId ?? null,
      linkedInvestmentId: patch.linkedInvestmentId ?? acct.linkedInvestmentId ?? null,
    };
  });

  await saveConnections(conns);
}

/**
 * @param {{
 *   connectionId: string,
 *   plaidAccountId: string,
 *   linkedCardId?: string | null,
 *   linkedBankAccountId?: string | null,
 * }} params
 */
export async function reassignStoredPlaidLink({
  connectionId,
  plaidAccountId,
  linkedCardId = null,
  linkedBankAccountId = null,
}) {
  const normalizedConnectionId = String(connectionId || "").trim();
  const normalizedPlaidAccountId = String(plaidAccountId || "").trim();
  if (!normalizedConnectionId || !normalizedPlaidAccountId) return false;

  const conns = await getConnections();
  const idx = conns.findIndex((connection) => String(connection?.id || "").trim() === normalizedConnectionId);
  if (idx < 0) return false;

  let changed = false;
  conns[idx].accounts = (conns[idx].accounts || []).map((account) => {
    if (String(account?.plaidAccountId || "").trim() !== normalizedPlaidAccountId) return account;
    changed = true;
    return {
      ...account,
      linkedCardId,
      linkedBankAccountId,
    };
  });

  if (!changed) return false;
  await saveConnections(conns);
  return true;
}

/**
 * Apply balance sync results to cards and bank accounts.
 * Updates the balance field on matched records.
 *
 * @param {Object} connection - Refreshed connection with updated balances
 * @param {Array} cards - Current card-portfolio
 * @param {Array} bankAccounts - Current bank-accounts
 * @returns {{ updatedCards, updatedBankAccounts, balanceSummary }}
 */
export function applyBalanceSync(connection, cards = [], bankAccounts = [], plaidInvestments = []) {
  const updatedCards = [...cards];
  const updatedBankAccounts = [...bankAccounts];
  const updatedPlaidInvestments = [...plaidInvestments];
  const balanceSummary = [];

  for (const acct of connection.accounts) {
    if (!acct.balance && !acct.liability) continue;

    // Self-healing fallback: recover link via plaid account id, then by institution + last4 mask.
    let fallbackCard = !acct.linkedCardId ? updatedCards.find(c => c._plaidAccountId === acct.plaidAccountId) : null;
    // Last-resort: match by institution + last4 when plaid IDs have changed (e.g. after reconnect)
    if (!acct.linkedCardId && !fallbackCard && acct.type === "credit") {
      const inst = normalizeInstitution(connection.institutionName);
      const acctLast4 = normDigits(acct.mask).slice(-4) || null;
      if (inst && acctLast4) {
        fallbackCard = updatedCards.find(c => sameInstitution(c.institution, inst) && extractLast4(c) === acctLast4);
        if (fallbackCard) {
          void log.warn("plaid", 
            `applyBalanceSync: matched card "${fallbackCard.nickname || fallbackCard.name}" by institution+last4 (${inst} ···${acctLast4})`
          );
          // Repair the stale plaid account id for future syncs
          fallbackCard._plaidAccountId = acct.plaidAccountId;
          fallbackCard._plaidConnectionId = connection.id;
        }
      }
    }
    if (!acct.linkedCardId && fallbackCard) acct.linkedCardId = fallbackCard.id;

    if (acct.linkedCardId) {
      const idx = updatedCards.findIndex(c => c.id === acct.linkedCardId);
      if (idx >= 0) {
        const oldBal = updatedCards[idx]._plaidBalance;
        const card = updatedCards[idx];
        const liab = acct.liability || {};
        const plaidBalance = normalizePlaidBalanceSnapshot(acct.balance, {
          current: card._plaidBalance ?? card.balance,
          available: card._plaidAvailable,
          limit: card._plaidLimit ?? card.limit ?? card.creditLimit,
        }, { deriveLimit: true });

        // Extract payment due day from Plaid's next_payment_due_date (ISO string → day-of-month)
        const plaidDueDay = liab.nextPaymentDueDate ? new Date(liab.nextPaymentDueDate).getUTCDate() : null;

        // Extract statement close day from Plaid's last_statement_issue_date
        // Statement typically closes ~21 days before payment due date
        const plaidStmtDay = liab.lastStatementDate ? new Date(liab.lastStatementDate).getUTCDate() : null;

        updatedCards[idx] = {
          ...card,
          // ── Balance data (always overwrite with latest) ──
          _plaidBalance: plaidBalance.current ?? card._plaidBalance,
          _plaidAvailable: plaidBalance.available ?? card._plaidAvailable,
          _plaidLimit: plaidBalance.limit ?? card._plaidLimit,
          _plaidLastSync: connection.lastSync || connection.lastLiabilitySync,
          _plaidAccountId: acct.plaidAccountId,
          _plaidConnectionId: connection.id,
          _plaidManualFallback: false,
          // ── Liability metadata (store raw for reference) ──
          _plaidLiability: liab,
          // ── Plaid-wins: authoritative data overwrites local when Plaid provides it ──
          limit: plaidBalance.limit ?? card.limit ?? null,
          apr: liab.purchaseApr != null ? liab.purchaseApr : (card.apr ?? null),
          statementCloseDay: plaidStmtDay != null ? plaidStmtDay : (card.statementCloseDay ?? null),
          paymentDueDay: plaidDueDay != null ? plaidDueDay : (card.paymentDueDay ?? null),
          minPayment: liab.minimumPayment != null ? liab.minimumPayment : (card.minPayment ?? null),
        };
        persistCreditLimitCacheEntry(connection.institutionName, acct.mask, updatedCards[idx].limit);
        void log.warn("plaid", 
          `synced card "${updatedCards[idx].nickname || updatedCards[idx].name}": bal=${plaidBalance.current}, limit=${updatedCards[idx].limit}`
        );
        balanceSummary.push({
          name: updatedCards[idx].nickname || updatedCards[idx].name,
          type: "credit",
          balance: plaidBalance.current,
          previous: oldBal,
        });
      }
    }

    let fallbackBank = !acct.linkedBankAccountId
      ? updatedBankAccounts.find(b => b._plaidAccountId === acct.plaidAccountId)
      : null;
    // Last-resort: match by institution + name/subtype when plaid IDs have changed
    if (!acct.linkedBankAccountId && !fallbackBank && acct.type === "depository") {
      const inst = normalizeInstitution(connection.institutionName);
      const acctLast4 = normDigits(acct.mask).slice(-4) || null;
      if (inst) {
        fallbackBank = updatedBankAccounts.find(
          b =>
            sameInstitution(b.bank, inst) &&
            // Match by mask/last4 in notes (e.g. "Auto-imported from Plaid (···8744)")
            ((acctLast4 && String(b.notes || "").includes(`···${acctLast4}`)) ||
              // Match by subtype (checking/savings) + institution when only 1 of that type at that bank
              (acct.subtype === b.accountType &&
                updatedBankAccounts.filter(bb => sameInstitution(bb.bank, inst) && bb.accountType === acct.subtype)
                  .length === 1))
        );
        if (fallbackBank) {
          void log.warn("plaid", 
            `applyBalanceSync: matched bank "${fallbackBank.name}" by institution+mask/subtype (${inst})`
          );
          fallbackBank._plaidAccountId = acct.plaidAccountId;
          fallbackBank._plaidConnectionId = connection.id;
        }
      }
    }
    if (!acct.linkedBankAccountId && fallbackBank) acct.linkedBankAccountId = fallbackBank.id;

    if (acct.linkedBankAccountId) {
      const idx = updatedBankAccounts.findIndex(b => b.id === acct.linkedBankAccountId);
      if (idx >= 0) {
        const oldBal = updatedBankAccounts[idx]._plaidBalance;
        updatedBankAccounts[idx] = {
          ...updatedBankAccounts[idx],
          _plaidBalance: acct.balance?.current ?? updatedBankAccounts[idx]._plaidBalance,
          _plaidAvailable: acct.balance?.available ?? updatedBankAccounts[idx]._plaidAvailable,
          _plaidLastSync: connection.lastSync,
          _plaidAccountId: acct.plaidAccountId,
          _plaidConnectionId: connection.id,
          _plaidManualFallback: false,
        };
        balanceSummary.push({
          name: updatedBankAccounts[idx].name,
          type: acct.subtype || "depository",
          balance: acct.balance.available ?? acct.balance.current,
          previous: oldBal,
        });
      }
    }

    const fallbackInv = !acct.linkedInvestmentId
      ? updatedPlaidInvestments.find(i => i._plaidAccountId === acct.plaidAccountId)
      : null;
    if (!acct.linkedInvestmentId && fallbackInv) acct.linkedInvestmentId = fallbackInv.id;

    if (acct.linkedInvestmentId) {
      const idx = updatedPlaidInvestments.findIndex(i => i.id === acct.linkedInvestmentId);
      if (idx >= 0) {
        const oldBal = updatedPlaidInvestments[idx]._plaidBalance;
        updatedPlaidInvestments[idx] = {
          ...updatedPlaidInvestments[idx],
          _plaidBalance: acct.balance.current,
          _plaidLastSync: connection.lastSync,
          _plaidAccountId: acct.plaidAccountId,
          _plaidConnectionId: connection.id,
        };
        balanceSummary.push({
          name: updatedPlaidInvestments[idx].name,
          type: "investment",
          balance: acct.balance.current,
          previous: oldBal,
        });
      }
    }
  }

  return { updatedCards, updatedBankAccounts, updatedPlaidInvestments, balanceSummary };
}

// ─── InputForm Auto-Fill Engine ───────────────────────────────

/**
 * Generate auto-fill suggestions for the weekly InputForm
 * based on the latest Plaid balance data.
 *
 * @param {Array} cards - Card portfolio with _plaidBalance fields
 * @param {Array} bankAccounts - Bank accounts with _plaidBalance fields
 * @returns {{ checking, vault, debts[] }}
 */
