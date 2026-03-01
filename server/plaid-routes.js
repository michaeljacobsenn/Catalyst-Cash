// ═══════════════════════════════════════════════════════════════
// PLAID PROXY — Catalyst Cash Backend
//
// 4 endpoints consumed by src/modules/plaid.js:
//   POST /plaid/link-token   → Creates a Link token for the client
//   POST /plaid/exchange     → Exchanges public_token → access_token
//   POST /plaid/balances     → Fetches live balances for a connection
//   POST /plaid/disconnect   → Revokes an access token
//
// Env vars (required):
//   PLAID_CLIENT_ID   — from https://dashboard.plaid.com
//   PLAID_SECRET      — sandbox / development / production secret
//   PLAID_ENV         — "sandbox" | "development" | "production"
//
// Security:
//   - All routes share the server's requireAuth middleware
//   - Rate limited to 10 req/min per IP on sensitive endpoints
//   - Access tokens are NOT logged or cached server-side
//   - Plaid SDK handles request signing automatically
// ═══════════════════════════════════════════════════════════════

import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from "plaid";
import rateLimit from "express-rate-limit";

// ── Plaid SDK Setup ──────────────────────────────────────────

const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID || "";
const PLAID_SECRET = process.env.PLAID_SECRET || "";
const PLAID_ENV = process.env.PLAID_ENV || "sandbox";

const plaidConfig = new Configuration({
    basePath: PlaidEnvironments[PLAID_ENV] || PlaidEnvironments.sandbox,
    baseOptions: {
        headers: {
            "PLAID-CLIENT-ID": PLAID_CLIENT_ID,
            "PLAID-SECRET": PLAID_SECRET,
            "Plaid-Version": "2020-09-14",
        },
    },
});

const plaid = new PlaidApi(plaidConfig);

// ── Rate Limiter (10 req/min per IP for Plaid endpoints) ─────

const plaidLimiter = rateLimit({
    windowMs: 60_000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many Plaid requests. Try again in a minute." },
});

// ── Helpers ──────────────────────────────────────────────────

function isConfigured() {
    return PLAID_CLIENT_ID && PLAID_SECRET;
}

// ── Route Registration ───────────────────────────────────────

export function registerPlaidRoutes(app, requireAuth) {
    // Guard: check that Plaid secrets are configured
    const requirePlaid = (_req, res, next) => {
        if (!isConfigured()) return res.status(503).json({ error: "Plaid not configured — set PLAID_CLIENT_ID and PLAID_SECRET" });
        return next();
    };

    // ── 1. Create Link Token ─────────────────────────────────
    // Client calls this to get a token for opening Plaid Link UI.
    app.post("/plaid/link-token", requireAuth, plaidLimiter, requirePlaid, async (_req, res) => {
        try {
            const response = await plaid.linkTokenCreate({
                user: { client_user_id: "catalyst-cash-user" },
                client_name: "Catalyst Cash",
                products: [Products.Transactions],
                country_codes: [CountryCode.Us],
                language: "en",
            });
            return res.json({ link_token: response.data.link_token });
        } catch (e) {
            const msg = e.response?.data?.error_message || e.message || "Link token creation failed";
            return res.status(e.response?.status || 500).json({ error: msg });
        }
    });

    // ── 2. Exchange Token ────────────────────────────────────
    // Client sends public_token from Plaid Link → we exchange for access_token.
    // Access token is returned to the client for on-device storage.
    app.post("/plaid/exchange", requireAuth, plaidLimiter, requirePlaid, async (req, res) => {
        const { publicToken } = req.body || {};
        if (!publicToken) return res.status(400).json({ error: "publicToken required" });

        try {
            const response = await plaid.itemPublicTokenExchange({
                public_token: publicToken,
            });
            return res.json({
                accessToken: response.data.access_token,
                itemId: response.data.item_id,
            });
        } catch (e) {
            const msg = e.response?.data?.error_message || e.message || "Token exchange failed";
            return res.status(e.response?.status || 500).json({ error: msg });
        }
    });

    // ── 3. Fetch Balances ────────────────────────────────────
    // Client sends accessToken → we fetch fresh balances from Plaid.
    app.post("/plaid/balances", requireAuth, plaidLimiter, requirePlaid, async (req, res) => {
        const { accessToken } = req.body || {};
        if (!accessToken) return res.status(400).json({ error: "accessToken required" });

        try {
            const response = await plaid.accountsBalanceGet({
                access_token: accessToken,
            });
            return res.json({ accounts: response.data.accounts });
        } catch (e) {
            const msg = e.response?.data?.error_message || e.message || "Balance fetch failed";
            return res.status(e.response?.status || 500).json({ error: msg });
        }
    });

    // ── 4. Disconnect ────────────────────────────────────────
    // Client sends accessToken → we revoke it with Plaid.
    app.post("/plaid/disconnect", requireAuth, plaidLimiter, requirePlaid, async (req, res) => {
        const { accessToken } = req.body || {};
        if (!accessToken) return res.status(400).json({ error: "accessToken required" });

        try {
            await plaid.itemRemove({ access_token: accessToken });
            return res.json({ ok: true });
        } catch (e) {
            // Best-effort: even if revocation fails, client should still clean up locally
            const msg = e.response?.data?.error_message || e.message || "Disconnect failed";
            return res.status(e.response?.status || 500).json({ error: msg });
        }
    });
}
