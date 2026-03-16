// ═══════════════════════════════════════════════════════════════
// PLAID INTEGRATION — Catalyst Cash
//
// Complete scaffolding for Plaid Link bank connection.
// When activated, this module:
//   1. Opens Plaid Link to connect the user's bank
//   2. Exchanges the public token for a Worker-side item/token record
//   3. Fetches balances and auto-maps them to existing cards/accounts
//   4. Stores non-sensitive connection metadata locally
//
// ACTIVATION CHECKLIST (for the developer):
//   □ Create a Plaid account at https://dashboard.plaid.com
//   □ Get your client_id and secret for Sandbox → Development → Production
//   □ Add PLAID_CLIENT_ID and PLAID_SECRET to Cloudflare Worker secrets
//   □ Deploy the Worker Plaid endpoints (see worker-plaid-routes.md)
//   □ Uncomment the Plaid section in SettingsTab.jsx
//
// PRIVACY: Plaid access tokens are stored only in the Cloudflare Worker D1 database.
//          The client stores non-sensitive metadata only: item ID, institution details,
//          account masks, linkage state, and last-sync timestamps.
// ═══════════════════════════════════════════════════════════════

  import { getBackendUrl } from "./api.js";
  import { batchCategorizeTransactions } from "./api.js";
  import { fetchWithRetry } from "./fetchWithRetry.js";
  import { buildIdentityHeaders,clearIdentitySession } from "./identitySession.js";
  import { getIssuerCards } from "./issuerCards.js";
  import { categorizeBatch,learn } from "./merchantMap.js";
  import { getSubscriptionState,INSTITUTION_LIMITS,isGatingEnforced } from "./subscription.js";
  import { db } from "./utils.js";

const PLAID_STORAGE_KEY = "plaid-connections";
const API_BASE = getBackendUrl();

async function buildPlaidBackendHeaders(extra = {}) {
  return buildIdentityHeaders({
    "Content-Type": "application/json",
    ...extra,
  });
}

async function fetchPlaidBackend(url, init = {}) {
  let response = await fetchWithRetry(url, {
    ...init,
    headers: await buildPlaidBackendHeaders(init.headers || {}),
  });

  if (response.status === 401) {
    await clearIdentitySession().catch(() => false);
    response = await fetchWithRetry(url, {
      ...init,
      headers: await buildPlaidBackendHeaders(init.headers || {}),
    });
  }

  return response;
}

// ─── Connection State Management ──────────────────────────────

/**
 * Get all stored Plaid connections.
 * Each connection: { id, institutionName, institutionId, accounts[], lastSync }
 * @returns {Promise<any[]>}
 */
export async function getConnections() {
  const stored = (await db.get(PLAID_STORAGE_KEY)) || [];
  if (!Array.isArray(stored) || stored.length === 0) return [];

  const sanitized = stored.map(sanitizeConnectionForStorage);
  if (stored.some(connection => connection && "accessToken" in connection)) {
    console.warn("[Plaid] Removed legacy access tokens from local connection storage.");
    await db.set(PLAID_STORAGE_KEY, sanitized);
  }
  return sanitized;
}

/**
 * Save connections array.
 * @param {any[]} conns
 */
async function saveConnections(conns) {
  await db.set(PLAID_STORAGE_KEY, (conns || []).map(sanitizeConnectionForStorage));
}

/**
 * Remove any legacy token field before persisting metadata locally.
 * @param {any} connection
 * @returns {any}
 */
function sanitizeConnectionForStorage(connection = {}) {
  const { accessToken: _accessToken, ...rest } = connection;
  return {
    ...rest,
    accounts: (connection.accounts || []).map(account => ({ ...account })),
  };
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
    console.warn(
      `[Plaid] Purging ${broken.length} broken connection(s): ${broken.map(c => c.institutionName).join(", ")}`
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
  const res = await fetchPlaidBackend(`${API_BASE}/plaid/link-token`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.error(`[Plaid] link-token response ${res.status}:`, errBody.substring(0, 500));
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
}

/**
 * Step 2: Open the Plaid Link UI.
 * This loads the Plaid Link SDK dynamically (only when needed).
 * Returns the public_token and metadata from the Link session.
 */
export async function openPlaidLink(options = {}) {
  console.warn("[Plaid] openPlaidLink() called");
  const { skipLimit = false } = options;

  // Enforce Institution Limits before opening Link
  const conns = await getConnections();
  const subState = await getSubscriptionState();
  const limit = INSTITUTION_LIMITS[subState.tier] || INSTITUTION_LIMITS.free;

  if (!skipLimit && isGatingEnforced() && conns.length >= limit) {
    throw new Error(`Institution limit reached. Your ${subState.tier === "pro" ? "Pro" : "Free"} plan allows up to ${limit} bank connections.`);
  }

  // Dynamically load Plaid Link SDK if not already loaded
  if (!window.Plaid) {
    console.warn("[Plaid] Loading Plaid Link SDK from CDN...");
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
      script.onload = () => {
        console.warn("[Plaid] SDK script loaded");
        resolve();
      };
      script.onerror = e => {
        console.error("[Plaid] SDK script FAILED to load:", e);
        reject(new Error("Failed to load Plaid Link SDK — check network connectivity"));
      };
      document.head.appendChild(script);
    });
  }
  if (!window.Plaid) {
    throw new Error("Plaid Link SDK loaded but window.Plaid is undefined");
  }

  console.warn("[Plaid] Creating link token...");
  let linkToken;
  try {
    linkToken = await createLinkToken();
    console.warn("[Plaid] Link token obtained:", linkToken ? "OK" : "EMPTY");
  } catch (e) {
    console.error("[Plaid] createLinkToken failed:", e);
    throw e;
  }

  return new Promise((resolve, reject) => {
    console.warn("[Plaid] Creating Plaid.create handler...");
    const handler = window.Plaid.create({
      token: linkToken,
      onSuccess: (publicToken, metadata) => {
        resolve({ publicToken, metadata });
      },
      onExit: (err, _metadata) => {
        if (err) reject(new Error(err.display_message || err.error_message || "Plaid Link exited"));
        else reject(new Error("cancelled"));
      },
      onEvent: (/* eventName, metadata */) => {
        // Could log analytics here
      },
    });
    handler.open();
    console.warn("[Plaid] handler.open() called");
  });
}

/**
 * Step 3: Exchange public_token for a worker-side Plaid item record.
 * The backend calls Plaid's /item/public_token/exchange.
 */
export async function exchangeToken(publicToken) {
  const res = await fetchPlaidBackend(`${API_BASE}/plaid/exchange`, {
    method: "POST",
    body: JSON.stringify({ publicToken }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  const data = await res.json();
  return { itemId: data.item_id };
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

async function runLinkFlow({ onSuccess, onError, skipLimit = false } = {}) {
  try {
    const { publicToken, metadata } = await openPlaidLink({ skipLimit });
    const { itemId } = await exchangeToken(publicToken);

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
  return runLinkFlow({ onSuccess, onError });
}

export async function reconnectBank(connection, onSuccess, onError) {
  return runLinkFlow({
    skipLimit: true,
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
    onError,
  });
}

// ─── Balance Fetching ─────────────────────────────────────────

/**
 * Force the backend to fetch fresh data from Plaid immediately
 * Used by Manual Sync. Respects backend tier cooldowns.
 */
export async function forceBackendSync() {
  const res = await fetchPlaidBackend(`${API_BASE}/api/sync/force`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    if (res.status === 429) {
      console.warn(`[Plaid] Force sync throttled by backend cooldown. Using cached D1 data.`);
      return false;
    }
    console.error(`[Plaid] Force sync failed: HTTP ${res.status}`);
    return false;
  }
  return true;
}

/**
 * Fetch fresh balances for a connection from Plaid.
 * Our backend calls Plaid's /accounts/balance/get.
 */
export async function fetchBalances(connectionId) {
  const conns = await getConnections();
  const conn = conns.find(c => c.id === connectionId);
  if (!conn) throw new Error(`Connection ${connectionId} not found`);

  const res = await fetchPlaidBackend(`${API_BASE}/api/sync/status`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.warn(`[Plaid] sync status FAILED: HTTP ${res.status} — ${errBody.substring(0, 200)}`);
    throw new Error(`Sync status failed: ${res.status}`);
  }
  const data = await res.json();
  if (!data.hasData) {
    console.warn(`[Plaid] No pre-fetched sync data available for connection ${connectionId} yet. Waiting for Webhook.`);
    return conn; // Return unchanged
  }

  const { accounts } = data.balances || { accounts: [] };

  // Update stored balances
  for (const acct of conn.accounts) {
    const fresh = accounts.find(a => a.account_id === acct.plaidAccountId);
    if (fresh) {
      acct.balance = {
        available: fresh.balances?.available,
        current: fresh.balances?.current,
        limit: fresh.balances?.limit,
        currency: fresh.balances?.iso_currency_code || "USD",
      };
      console.warn(
        `[Plaid]   → ${acct.name}: bal=${fresh.balances?.current}, limit=${fresh.balances?.limit}, avail=${fresh.balances?.available}`
      );
    }
  }
  conn.lastSync = data.last_synced_at || new Date().toISOString();
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
export async function fetchLiabilities(connectionId) {
  const conns = await getConnections();
  const conn = conns.find(c => c.id === connectionId);
  if (!conn) throw new Error("Connection not found");

  const res = await fetchPlaidBackend(`${API_BASE}/api/sync/status`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Liabilities fetch failed: ${res.status}`);
  const data = await res.json();
  if (!data.hasData) return conn;

  // Plaid returns { liabilities: { credit: [...] }, accounts: [...] } inside data.liabilities
  const creditLiabilities = data.liabilities?.liabilities?.credit || [];

  // Store liabilities data on matching connection accounts
  for (const acct of conn.accounts) {
    if (acct.type !== "credit") continue;
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

  conn.lastLiabilitySync = data.last_synced_at || new Date().toISOString();
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
  await fetchBalances(connectionId);
  try {
    await fetchLiabilities(connectionId);
  } catch (e) {
    console.warn(`[Plaid] liabilities skipped for ${connectionId}: ${e.message}`);
  }
  const conns = await getConnections();
  return conns.find(c => c.id === connectionId);
}

/**
 * Fetch balances + liabilities for ALL connections in parallel.
 */
export async function fetchAllBalancesAndLiabilities() {
  let conns = await getConnections();

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
    console.warn(`[Plaid] Deduped connections: removed ${removed} duplicate(s), ${conns.length} remaining`);
  }

  const results = [];
  for (let i = 0; i < conns.length; i++) {
    const conn = conns[i];
    if (window.toast)
      window.toast.info(`Syncing ${i + 1}/${conns.length}: ${conn.institutionName || "Bank"}…`, { duration: 2000 });
    try {
      results.push(await fetchBalancesAndLiabilities(conn.id));
    } catch (e) {
      console.warn(`[Plaid] sync failed for ${conn.institutionName}: ${e.message}`);
      results.push({ ...conn, _error: e.message });
    }
  }
  return results;
}

// ─── Transaction Fetching ─────────────────────────────────────

const TRANSACTIONS_STORAGE_KEY = "plaid-transactions";

/**
 * Format a Date as YYYY-MM-DD for Plaid API.
 */
/**
 * Fetch transactions for a single connection from Plaid.
 * @param {string} connectionId
 * @param {number} [_days=30] - Reserved for future per-call transaction windows
 * @returns {Array} Normalized transaction array
 */
export async function fetchTransactions(connectionId, _days = 30) {
  const conns = await getConnections();
  const conn = conns.find(c => c.id === connectionId);
  if (!conn) throw new Error(`Connection ${connectionId} not found`);

  const res = await fetchPlaidBackend(`${API_BASE}/api/sync/status`, {
    method: "POST",
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.warn(
      `[Plaid] fetchTransactions FAILED for ${conn.institutionName}: HTTP ${res.status} — ${errBody.substring(0, 200)}`
    );
    throw new Error(`Transaction fetch failed: ${res.status}`);
  }

  const data = await res.json();
  if (!data.hasData) return [];

  const raw = data.transactions?.transactions || [];

  // Normalize Plaid transaction format → app format
  return raw.map(t => {
    // Plaid v2 returns FOOD_AND_DRINK (upper snake_case) → "food and drink"
    const rawCat = t.personal_finance_category?.primary || t.category?.[0] || "";
    const rawSub = t.personal_finance_category?.detailed || t.category?.[1] || "";
    return {
      id: t.transaction_id,
      date: t.date,
      amount: Math.abs(t.amount), // Plaid: positive = debit, negative = credit
      isCredit: t.amount < 0, // Refunds, deposits
      description: t.merchant_name || t.name || "Unknown",
      category: rawCat.replace(/_/g, " ").toLowerCase().trim(),
      subcategory: rawSub.replace(/_/g, " ").toLowerCase().trim(),
      institution: conn.institutionName,
      accountName: (conn.accounts.find(a => a.plaidAccountId === t.account_id) || {}).name || "",
      accountType: (conn.accounts.find(a => a.plaidAccountId === t.account_id) || {}).subtype || "",
      pending: t.pending || false,
    };
  });
}

/**
 * Fetch transactions for ALL connections and store locally.
 * Includes On-Device AI Categorization Engine pipeline.
 * @param {number} [days=30] - How many days back
 * @returns {{ transactions: Array, fetchedAt: string }}
 */
export async function fetchAllTransactions(days = 30) {
  const conns = await getConnections();
  let all = [];

  for (const conn of conns) {
    try {
      const txns = await fetchTransactions(conn.id, days);
      all = all.concat(txns);
      console.warn(`[Plaid] Fetched ${txns.length} transactions from ${conn.institutionName}`);
    } catch (e) {
      console.warn(`[Plaid] Transaction fetch skipped for ${conn.institutionName}: ${e.message}`);
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
  if (uniqueUnknowns.length > 0) {
    console.warn(`[Plaid] Sending ${uniqueUnknowns.length} unknown merchants to AI Categorization Engine...`);
    const aiCategoryMap = await batchCategorizeTransactions(uniqueUnknowns);
    
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
  plaidInvestments = []
) {
  const matched = [];
  const unmatched = [];
  const newCards = [];
  const newBankAccounts = [];
  const newPlaidInvestments = [];

  const normalizedInst = normalizeInstitution(connection.institutionName);

  for (const acct of connection.accounts) {
    let linkedId = null;
    let linkedType = null; // "card" | "bank"

    if (acct.type === "credit") {
      const acctLast4 = normDigits(acct.mask).slice(-4) || null;
      const acctName = normText(acct.officialName || acct.name);

      // Try to match to existing card
      const matchByPlaidId = cards.find(c => c._plaidAccountId === acct.plaidAccountId);
      const matchByMask =
        !matchByPlaidId && acctLast4
          ? cards.find(c => sameInstitution(c.institution, normalizedInst) && extractLast4(c) === acctLast4)
          : null;

      const matchByName =
        !matchByPlaidId && !matchByMask && acctName
          ? cards.find(
            c =>
              sameInstitution(c.institution, normalizedInst) &&
              (() => {
                const cardName = normText(c.nickname || c.name);
                if (!cardName || cardName.length < 4 || acctName.length < 4) return false;
                return cardName.includes(acctName) || acctName.includes(cardName);
              })()
          )
          : null;

      const cardMatch = matchByPlaidId || matchByMask || matchByName;
      if (cardMatch) {
        linkedId = cardMatch.id;
        linkedType = "card";
        acct.linkedCardId = cardMatch.id;
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
          limit: acct.balance?.limit || null,
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
          _plaidBalance: acct.balance?.current ?? null,
          _plaidAvailable: acct.balance?.available ?? null,
        };
        newCards.push(newCard);
        linkedId = newCard.id;
        linkedType = "card";
        acct.linkedCardId = newCard.id;
      }
    } else if (acct.type === "depository") {
      // Try to match to existing bank account
      const matchByPlaidId = bankAccounts.find(b => b._plaidAccountId === acct.plaidAccountId);
      const matchByName = !matchByPlaidId
        ? bankAccounts.find(
          b =>
            sameInstitution(b.bank, normalizedInst) &&
            (normText(b.name).includes(normText(acct.name)) ||
              normText(acct.officialName).includes(normText(b.name)) ||
              acct.subtype === b.accountType)
        )
        : null;

      const bankMatch = matchByPlaidId || matchByName;
      if (bankMatch) {
        linkedId = bankMatch.id;
        linkedType = "bank";
        acct.linkedBankAccountId = bankMatch.id;
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

  return { matched, unmatched, newCards, newBankAccounts, newPlaidInvestments };
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
          console.warn(
            `[Plaid] applyBalanceSync: matched card "${fallbackCard.nickname || fallbackCard.name}" by institution+last4 (${inst} ···${acctLast4})`
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

        // Extract payment due day from Plaid's next_payment_due_date (ISO string → day-of-month)
        const plaidDueDay = liab.nextPaymentDueDate ? new Date(liab.nextPaymentDueDate).getUTCDate() : null;

        // Extract statement close day from Plaid's last_statement_issue_date
        // Statement typically closes ~21 days before payment due date
        const plaidStmtDay = liab.lastStatementDate ? new Date(liab.lastStatementDate).getUTCDate() : null;

        updatedCards[idx] = {
          ...card,
          // ── Balance data (always overwrite with latest) ──
          _plaidBalance: acct.balance?.current ?? card._plaidBalance,
          _plaidAvailable: acct.balance?.available ?? card._plaidAvailable,
          _plaidLimit: acct.balance?.limit ?? card._plaidLimit,
          _plaidLastSync: connection.lastSync || connection.lastLiabilitySync,
          _plaidAccountId: acct.plaidAccountId,
          _plaidConnectionId: connection.id,
          // ── Liability metadata (store raw for reference) ──
          _plaidLiability: liab,
          // ── Plaid-wins: authoritative data overwrites local when Plaid provides it ──
          limit: acct.balance?.limit ?? card.limit ?? null,
          apr: liab.purchaseApr != null ? liab.purchaseApr : (card.apr ?? null),
          statementCloseDay: plaidStmtDay != null ? plaidStmtDay : (card.statementCloseDay ?? null),
          paymentDueDay: plaidDueDay != null ? plaidDueDay : (card.paymentDueDay ?? null),
          minPayment: liab.minimumPayment != null ? liab.minimumPayment : (card.minPayment ?? null),
        };
        console.warn(
          `[Plaid] synced card "${updatedCards[idx].nickname || updatedCards[idx].name}": bal=${acct.balance?.current}, limit=${updatedCards[idx].limit}`
        );
        balanceSummary.push({
          name: updatedCards[idx].nickname || updatedCards[idx].name,
          type: "credit",
          balance: acct.balance.current,
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
          console.warn(
            `[Plaid] applyBalanceSync: matched bank "${fallbackBank.name}" by institution+mask/subtype (${inst})`
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
export function getPlaidAutoFill(cards = [], bankAccounts = []) {
  // Sum checking accounts
  const checkingAccounts = bankAccounts.filter(b => b.accountType === "checking" && b._plaidBalance != null);
  const checking = checkingAccounts.reduce((sum, b) => sum + (b._plaidAvailable ?? b._plaidBalance ?? 0), 0);

  // Sum savings/vault accounts
  const savingsAccounts = bankAccounts.filter(b => b.accountType === "savings" && b._plaidBalance != null);
  const vault = savingsAccounts.reduce((sum, b) => sum + (b._plaidAvailable ?? b._plaidBalance ?? 0), 0);

  // Credit card balances (debts)
  const debts = cards
    .filter(c => c._plaidBalance != null && c._plaidBalance > 0)
    .map(c => ({
      cardId: c.id,
      name: c.nickname || c.name,
      institution: c.institution,
      balance: c._plaidBalance,
      limit: c._plaidLimit || c.limit,
    }));

  return {
    checking: checking || null,
    vault: vault || null,
    debts,
    lastSync:
      bankAccounts.find(b => b._plaidLastSync)?._plaidLastSync ||
      cards.find(c => c._plaidLastSync)?._plaidLastSync ||
      null,
  };
}
