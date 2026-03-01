// ═══════════════════════════════════════════════════════════════
// PLAID INTEGRATION — Catalyst Cash
//
// Complete scaffolding for Plaid Link bank connection.
// When activated, this module:
//   1. Opens Plaid Link to connect the user's bank
//   2. Exchanges the public token for an access token via our Worker
//   3. Fetches balances and auto-maps them to existing cards/accounts
//   4. Stores the connection state locally (encrypted)
//
// ACTIVATION CHECKLIST (for the developer):
//   □ Create a Plaid account at https://dashboard.plaid.com
//   □ Get your client_id and secret for Sandbox → Development → Production
//   □ Add PLAID_CLIENT_ID and PLAID_SECRET to Cloudflare Worker secrets
//   □ Deploy the Worker Plaid endpoints (see worker-plaid-routes.md)
//   □ Uncomment the Plaid section in SettingsTab.jsx
//
// PRIVACY: Access tokens are stored locally on-device only.
//          Balances are fetched on-demand and never cached on any server.
// ═══════════════════════════════════════════════════════════════

import { db } from "./utils.js";
import { getIssuerCards } from "./issuerCards.js";

const PLAID_STORAGE_KEY = "plaid-connections";
const API_BASE = "https://api.catalystcash.app";

// ─── Connection State Management ──────────────────────────────

/**
 * Get all stored Plaid connections.
 * Each connection: { id, institutionName, institutionId, accessToken, accounts[], lastSync }
 */
export async function getConnections() {
    return (await db.get(PLAID_STORAGE_KEY)) || [];
}

/**
 * Save connections array.
 */
async function saveConnections(conns) {
    await db.set(PLAID_STORAGE_KEY, conns);
}

/**
 * Remove a connection by id.
 */
export async function removeConnection(connectionId) {
    const conns = await getConnections();
    const conn = conns.find(c => c.id === connectionId);

    // Revoke access token on the server side
    if (conn?.accessToken) {
        try {
            await fetch(`${API_BASE}/plaid/disconnect`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accessToken: conn.accessToken }),
            });
        } catch { /* best-effort cleanup */ }
    }

    await saveConnections(conns.filter(c => c.id !== connectionId));
}

// ─── Plaid Link Flow ──────────────────────────────────────────

/**
 * Step 1: Get a Link token from our backend.
 * The backend calls Plaid's /link/token/create endpoint.
 */
export async function createLinkToken() {
    const res = await fetch(`${API_BASE}/plaid/link-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error(`Link token failed: ${res.status}`);
    const data = await res.json();
    return data.link_token;
}

/**
 * Step 2: Open the Plaid Link UI.
 * This loads the Plaid Link SDK dynamically (only when needed).
 * Returns the public_token and metadata from the Link session.
 */
export async function openPlaidLink() {
    // Dynamically load Plaid Link SDK if not already loaded
    if (!window.Plaid) {
        await new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
            script.onload = resolve;
            script.onerror = () => reject(new Error("Failed to load Plaid Link SDK"));
            document.head.appendChild(script);
        });
    }

    const linkToken = await createLinkToken();

    return new Promise((resolve, reject) => {
        const handler = window.Plaid.create({
            token: linkToken,
            onSuccess: (publicToken, metadata) => {
                resolve({ publicToken, metadata });
            },
            onExit: (err, metadata) => {
                if (err) reject(new Error(err.display_message || err.error_message || "Plaid Link exited"));
                else reject(new Error("cancelled"));
            },
            onEvent: (/* eventName, metadata */) => {
                // Could log analytics here
            },
        });
        handler.open();
    });
}

/**
 * Step 3: Exchange public_token for access_token via our backend.
 * The backend calls Plaid's /item/public_token/exchange.
 */
export async function exchangeToken(publicToken) {
    const res = await fetch(`${API_BASE}/plaid/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicToken }),
    });
    if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
    return await res.json(); // { accessToken, itemId }
}

/**
 * Full Link flow: open Link → exchange token → store connection.
 * Returns the new connection object.
 */
export async function connectBank(onSuccess, onError) {
    try {
        const { publicToken, metadata } = await openPlaidLink();
        const { accessToken, itemId } = await exchangeToken(publicToken);

        const connection = {
            id: itemId,
            institutionName: metadata.institution?.name || "Unknown Bank",
            institutionId: metadata.institution?.institution_id || null,
            accessToken,
            accounts: (metadata.accounts || []).map(a => ({
                plaidAccountId: a.id,
                name: a.name,
                officialName: a.official_name || a.name,
                type: a.type,         // "depository" | "credit" | "loan" | "investment"
                subtype: a.subtype,   // "checking" | "savings" | "credit card" | etc.
                mask: a.mask,         // last 4 digits
                linkedCardId: null,   // Will be auto-matched
                linkedBankAccountId: null,
                balance: null,
            })),
            lastSync: null,
        };

        const conns = await getConnections();
        // Replace existing connection for same item, or append
        const idx = conns.findIndex(c => c.id === itemId);
        if (idx >= 0) conns[idx] = connection;
        else conns.push(connection);
        await saveConnections(conns);

        if (onSuccess) onSuccess(connection);
        return connection;
    } catch (err) {
        if (onError) onError(err);
        else throw err;
    }
}

// ─── Balance Fetching ─────────────────────────────────────────

/**
 * Fetch fresh balances for a connection from Plaid.
 * Our backend calls Plaid's /accounts/balance/get.
 */
export async function fetchBalances(connectionId) {
    const conns = await getConnections();
    const conn = conns.find(c => c.id === connectionId);
    if (!conn) throw new Error("Connection not found");

    const res = await fetch(`${API_BASE}/plaid/balances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: conn.accessToken }),
    });
    if (!res.ok) throw new Error(`Balance fetch failed: ${res.status}`);
    const { accounts } = await res.json();

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
        }
    }
    conn.lastSync = new Date().toISOString();
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

// ─── Auto-Matching Engine ─────────────────────────────────────

/**
 * INSTITUTION NAME NORMALIZATION
 * Maps Plaid's institution names to the app's INSTITUTIONS list.
 */
const INSTITUTION_ALIASES = {
    "american express": "Amex",
    "amex": "Amex",
    "bank of america": "Bank of America",
    "barclays": "Barclays",
    "capital one": "Capital One",
    "chase": "Chase",
    "jpmorgan chase": "Chase",
    "citibank": "Citi",
    "citi": "Citi",
    "discover": "Discover",
    "fnbo": "FNBO",
    "first national bank of omaha": "FNBO",
    "goldman sachs": "Goldman Sachs",
    "marcus by goldman sachs": "Goldman Sachs",
    "hsbc": "HSBC",
    "navy federal": "Navy Federal",
    "navy federal credit union": "Navy Federal",
    "penfed": "PenFed",
    "pentagon federal credit union": "PenFed",
    "synchrony": "Synchrony",
    "synchrony bank": "Synchrony",
    "td bank": "TD Bank",
    "us bank": "US Bank",
    "usaa": "USAA",
    "wells fargo": "Wells Fargo",
    "ally": "Ally",
    "ally bank": "Ally",
};

function normalizeInstitution(plaidName) {
    if (!plaidName) return null;
    const lower = plaidName.toLowerCase().trim();
    return INSTITUTION_ALIASES[lower] || plaidName;
}

function normText(v) {
    return String(v || "").toLowerCase().trim();
}

function normDigits(v) {
    return String(v || "").replace(/\D/g, "");
}

function extractLast4(card) {
    if (!card) return null;
    const direct = [card.last4, card.mask]
        .map(normDigits)
        .find(v => v.length >= 4);
    if (direct) return direct.slice(-4);

    const notesMatch = String(card.notes || "").match(/···\s?(\d{4})/);
    if (notesMatch) return notesMatch[1];
    return null;
}

function sameInstitution(a, b) {
    return normText(a) === normText(b);
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
    const getTokens = (str) => str.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
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
        } else if (matchCount > bestScore && matchCount >= (plaidTokens.length / 2)) {
            bestScore = matchCount;
            bestMatch = catName;
        }
    }

    return bestMatch || plaidName;
}

export function autoMatchAccounts(connection, cards = [], bankAccounts = [], cardCatalog = null) {
    const matched = [];
    const unmatched = [];
    const newCards = [];
    const newBankAccounts = [];

    const normalizedInst = normalizeInstitution(connection.institutionName);

    for (const acct of connection.accounts) {
        let linkedId = null;
        let linkedType = null; // "card" | "bank"

        if (acct.type === "credit") {
            const acctLast4 = normDigits(acct.mask).slice(-4) || null;
            const acctName = normText(acct.officialName || acct.name);

            // Try to match to existing card
            const matchByPlaidId = cards.find(c => c._plaidAccountId === acct.plaidAccountId);
            const matchByMask = !matchByPlaidId && acctLast4
                ? cards.find(c =>
                    sameInstitution(c.institution, normalizedInst) &&
                    extractLast4(c) === acctLast4
                )
                : null;

            const matchByName = !matchByPlaidId && !matchByMask && acctName
                ? cards.find(c =>
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
                const catCards = cardCatalog && normalizedInst ? getIssuerCards(normalizedInst, cardCatalog).map(c => c.name) : [];
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
                };
                newCards.push(newCard);
                linkedId = newCard.id;
                linkedType = "card";
                acct.linkedCardId = newCard.id;
            }
        } else if (acct.type === "depository") {
            // Try to match to existing bank account
            const matchByPlaidId = bankAccounts.find(b => b._plaidAccountId === acct.plaidAccountId);
            const matchByName = !matchByPlaidId ? bankAccounts.find(b =>
                sameInstitution(b.bank, normalizedInst) &&
                (
                    normText(b.name).includes(normText(acct.name)) ||
                    normText(acct.officialName).includes(normText(b.name)) ||
                    (acct.subtype === b.accountType)
                )
            ) : null;

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
                };
                newBankAccounts.push(newBank);
                linkedId = newBank.id;
                linkedType = "bank";
                acct.linkedBankAccountId = newBank.id;
            }
        }

        if (linkedId) {
            matched.push({ plaidAccount: acct, linkedId, linkedType });
        } else {
            unmatched.push(acct);
        }
    }

    return { matched, unmatched, newCards, newBankAccounts };
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
        connection.accounts.map(a => [a.plaidAccountId, {
            linkedCardId: a.linkedCardId,
            linkedBankAccountId: a.linkedBankAccountId
        }])
    );

    conns[idx].accounts = (conns[idx].accounts || []).map(acct => {
        const patch = linkByAccountId.get(acct.plaidAccountId);
        if (!patch) return acct;
        return {
            ...acct,
            linkedCardId: patch.linkedCardId ?? acct.linkedCardId ?? null,
            linkedBankAccountId: patch.linkedBankAccountId ?? acct.linkedBankAccountId ?? null,
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
export function applyBalanceSync(connection, cards = [], bankAccounts = []) {
    const updatedCards = [...cards];
    const updatedBankAccounts = [...bankAccounts];
    const balanceSummary = [];

    for (const acct of connection.accounts) {
        if (!acct.balance) continue;

        // Self-healing fallback: recover link via plaid account id.
        const fallbackCard = !acct.linkedCardId
            ? updatedCards.find(c => c._plaidAccountId === acct.plaidAccountId)
            : null;
        if (!acct.linkedCardId && fallbackCard) acct.linkedCardId = fallbackCard.id;

        if (acct.linkedCardId) {
            const idx = updatedCards.findIndex(c => c.id === acct.linkedCardId);
            if (idx >= 0) {
                const oldBal = updatedCards[idx]._plaidBalance;
                updatedCards[idx] = {
                    ...updatedCards[idx],
                    _plaidBalance: acct.balance.current,
                    _plaidAvailable: acct.balance.available,
                    _plaidLimit: acct.balance.limit,
                    _plaidLastSync: connection.lastSync,
                    _plaidAccountId: acct.plaidAccountId,
                    _plaidConnectionId: connection.id,
                    // Credit limit should only be filled when missing.
                    limit: updatedCards[idx].limit ?? acct.balance.limit ?? null,
                };
                balanceSummary.push({
                    name: updatedCards[idx].nickname || updatedCards[idx].name,
                    type: "credit",
                    balance: acct.balance.current,
                    previous: oldBal,
                });
            }
        }

        const fallbackBank = !acct.linkedBankAccountId
            ? updatedBankAccounts.find(b => b._plaidAccountId === acct.plaidAccountId)
            : null;
        if (!acct.linkedBankAccountId && fallbackBank) acct.linkedBankAccountId = fallbackBank.id;

        if (acct.linkedBankAccountId) {
            const idx = updatedBankAccounts.findIndex(b => b.id === acct.linkedBankAccountId);
            if (idx >= 0) {
                const oldBal = updatedBankAccounts[idx]._plaidBalance;
                updatedBankAccounts[idx] = {
                    ...updatedBankAccounts[idx],
                    _plaidBalance: acct.balance.current,
                    _plaidAvailable: acct.balance.available,
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
    }

    return { updatedCards, updatedBankAccounts, balanceSummary };
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
    const checkingAccounts = bankAccounts.filter(b =>
        b.accountType === "checking" && b._plaidBalance != null
    );
    const checking = checkingAccounts.reduce(
        (sum, b) => sum + (b._plaidAvailable ?? b._plaidBalance ?? 0), 0
    );

    // Sum savings/vault accounts
    const savingsAccounts = bankAccounts.filter(b =>
        b.accountType === "savings" && b._plaidBalance != null
    );
    const vault = savingsAccounts.reduce(
        (sum, b) => sum + (b._plaidAvailable ?? b._plaidBalance ?? 0), 0
    );

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
        lastSync: bankAccounts.find(b => b._plaidLastSync)?._plaidLastSync
            || cards.find(c => c._plaidLastSync)?._plaidLastSync
            || null,
    };
}
