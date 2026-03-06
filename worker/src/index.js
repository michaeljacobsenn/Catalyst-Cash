// ═══════════════════════════════════════════════════════════════
// Catalyst Cash — Cloudflare Worker AI Proxy
// Multi-provider: Gemini (default), OpenAI, Claude
// API keys stored as Cloudflare secrets — never exposed to clients.
// ═══════════════════════════════════════════════════════════════

const ANTHROPIC_VERSION = "2023-06-01";
const MAX_BODY_SIZE = 512_000; // 512KB max request body (system prompt alone is ~110KB)
const VALID_PROVIDERS = ["gemini", "openai", "claude"];
const PLAID_ENV = "production"; // "sandbox", "development", or "production"
const FREE_AUDITS_PER_WEEK = 2;
const PRO_AUDITS_PER_MONTH = 60;
const FREE_CHATS_PER_DAY = 10;
const PRO_CHATS_PER_DAY = 50;
const PROVIDER_TIMEOUT_MS = 45_000;
const REASONING_TIMEOUT_MS = 180_000; // 3 min — reasoning models (o4-mini) need time to think
const PLAID_TIMEOUT_MS = 15_000;
const MARKET_TIMEOUT_MS = 10_000;
const REVENUECAT_TIMEOUT_MS = 8_000;
const REVENUECAT_CACHE_TTL_SECONDS = 300;
const SECURITY_HEADERS = {
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
};
const MODEL_ALLOWLIST = {
    free: new Set(["gemini-2.5-flash", "gpt-4o-mini"]),
    pro: new Set(["gemini-2.5-flash", "gpt-4o-mini", "gemini-2.5-pro", "o4-mini", "claude-sonnet-4-20250514", "claude-haiku-4-5"]),
};

// Model defaults per provider
const DEFAULTS = {
    gemini: "gemini-2.5-flash",
    openai: "gpt-4o-mini",
    claude: "claude-sonnet-4-20250514",
};

// ─── CORS ────────────────────────────────────────────────────
function corsHeaders(origin, env) {
    const allowed = (env.ALLOWED_ORIGIN || "https://catalystcash.app").split(",").map(s => s.trim());
    const isAllowed = allowed.includes(origin) || origin?.startsWith("http://localhost") || origin === "capacitor://localhost";
    return {
        "Access-Control-Allow-Origin": isAllowed ? origin : allowed[0],
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Device-ID, X-App-Version, X-Subscription-Tier, X-RC-App-User-ID",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin",
    };
}

function buildHeaders(cors, extra = {}) {
    return { ...cors, ...SECURITY_HEADERS, ...extra };
}

function getRequestedTier(request) {
    return request.headers.get("X-Subscription-Tier") === "pro" ? "pro" : "free";
}

function getRevenueCatAppUserId(request) {
    const value = request.headers.get("X-RC-App-User-ID");
    return value ? value.trim() : "";
}

function getConfiguredEntitlementId(env) {
    return env.REVENUECAT_ENTITLEMENT_ID || "Catalyst Cash Pro";
}

async function fetchWithTimeout(input, init = {}, timeoutMs = PROVIDER_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(input, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

export function getIsoWeekKey(now) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function getNextUtcBoundary(period, now = new Date()) {
    const next = new Date(now);
    if (period === "day") {
        next.setUTCHours(24, 0, 0, 0);
        return next;
    }
    if (period === "month") {
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
    }
    const dayNum = now.getUTCDay() || 7;
    const daysUntilNextMonday = 8 - dayNum;
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilNextMonday, 0, 0, 0, 0));
}

export function getQuotaWindow(tier, isChat, now = new Date()) {
    if (isChat) {
        return {
            limit: tier === "pro" ? PRO_CHATS_PER_DAY : FREE_CHATS_PER_DAY,
            periodKey: now.toISOString().slice(0, 10),
            resetAt: getNextUtcBoundary("day", now),
        };
    }

    if (tier === "pro") {
        return {
            limit: PRO_AUDITS_PER_MONTH,
            periodKey: now.toISOString().slice(0, 7),
            resetAt: getNextUtcBoundary("month", now),
        };
    }

    return {
        limit: FREE_AUDITS_PER_WEEK,
        periodKey: getIsoWeekKey(now),
        resetAt: getNextUtcBoundary("week", now),
    };
}

function getDefaultModelForTier(provider, tier) {
    if (provider === "openai") return tier === "pro" ? "o4-mini" : "gpt-4o-mini";
    if (provider === "gemini") return tier === "pro" ? "gemini-2.5-pro" : "gemini-2.5-flash";
    return DEFAULTS[provider] || DEFAULTS.gemini;
}

function isModelAllowedForTier(model, tier) {
    return MODEL_ALLOWLIST[tier]?.has(model);
}

export function isRevenueCatEntitlementActive(subscriber, entitlementId, now = new Date()) {
    const entitlement = subscriber?.entitlements?.[entitlementId];
    if (!entitlement) return false;
    if (!entitlement.expires_date) return true;
    const expiresAt = Date.parse(entitlement.expires_date);
    return Number.isFinite(expiresAt) && expiresAt >= now.getTime();
}

async function fetchRevenueCatSubscriber(appUserId, env) {
    if (!env.REVENUECAT_SECRET_KEY || !appUserId) return null;

    const cacheKey = `https://revenuecat.internal/${encodeURIComponent(appUserId)}`;
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) {
        return cached.json();
    }

    const response = await fetchWithTimeout(
        `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
        {
            headers: {
                "Accept": "application/json",
                "Authorization": `Bearer ${env.REVENUECAT_SECRET_KEY}`,
            },
        },
        REVENUECAT_TIMEOUT_MS
    );

    if (response.status === 404) {
        return null;
    }
    if (!response.ok) {
        throw new Error(`RevenueCat verification failed (${response.status})`);
    }

    const payload = await response.json();
    await cache.put(cacheKey, new Response(JSON.stringify(payload), {
        headers: { "Cache-Control": `max-age=${REVENUECAT_CACHE_TTL_SECONDS}` },
    }));
    return payload;
}

export async function resolveEffectiveTier(request, env) {
    const requestedTier = getRequestedTier(request);
    const revenueCatAppUserId = getRevenueCatAppUserId(request);
    if (!env.REVENUECAT_SECRET_KEY || !revenueCatAppUserId) {
        return { tier: requestedTier, verified: false, source: "client" };
    }

    try {
        const payload = await fetchRevenueCatSubscriber(revenueCatAppUserId, env);
        const isPro = isRevenueCatEntitlementActive(payload?.subscriber, getConfiguredEntitlementId(env));
        return {
            tier: isPro ? "pro" : "free",
            verified: true,
            source: "revenuecat",
        };
    } catch (error) {
        return {
            tier: requestedTier,
            verified: false,
            source: "fallback",
            verificationError: error?.message || "verification_failed",
        };
    }
}

function getRateLimitCacheKey(deviceId, tier, isChat, periodKey) {
    const type = isChat ? "chat" : "audit";
    return `https://rate-limit.internal/${tier}/${deviceId}/${type}/${periodKey}`;
}

// ─── Rate Limiting (per-device, using Cache API) ─────────────
export async function peekRateLimit(deviceId, tier, isChat) {
    const cache = caches.default;
    const { limit, periodKey, resetAt } = getQuotaWindow(tier, isChat);
    const key = getRateLimitCacheKey(deviceId, tier, isChat, periodKey);
    const cached = await cache.match(key);

    let count = 0;
    if (cached) {
        count = parseInt(await cached.text(), 10) || 0;
    }

    const retryAfter = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
    if (count >= limit) {
        return { allowed: false, remaining: 0, limit, retryAfter, count, key };
    }

    return {
        allowed: true,
        remaining: limit - count,
        limit,
        retryAfter,
        count,
        key,
    };
}

export async function commitRateLimit(rateResult) {
    const newCount = rateResult.count + 1;
    const res = new Response(String(newCount), {
        headers: { "Cache-Control": `max-age=${rateResult.retryAfter}` },
    });
    await caches.default.put(rateResult.key, res);

    return {
        ...rateResult,
        count: newCount,
        remaining: Math.max(0, rateResult.limit - newCount),
    };
}

// ─── Gemini Provider ─────────────────────────────────────────
async function callGemini(apiKey, { snapshot, systemPrompt, history, model, stream, responseFormat }) {
    const m = model || DEFAULTS.gemini;
    const endpoint = stream
        ? `https://generativelanguage.googleapis.com/v1beta/models/${m}:streamGenerateContent?alt=sse&key=${apiKey}`
        : `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;

    const genConfig = {
        maxOutputTokens: 12000,
        temperature: 0.1,
        topP: 0.95,
    };
    // Only force JSON output for audits — chat needs natural language
    if (responseFormat !== "text") {
        genConfig.responseMimeType = "application/json";
    }

    const body = {
        contents: [
            ...(history || []).map(h => ({
                role: h.role === "assistant" ? "model" : "user",
                parts: [{ text: h.content }],
            })),
            { parts: [{ text: snapshot }], role: "user" },
        ],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: genConfig,
    };

    const res = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    }, PROVIDER_TIMEOUT_MS);

    if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        const msg = e.error?.message || e[0]?.error?.message || `HTTP ${res.status}`;
        throw new Error(`Gemini Error: ${msg}`);
    }

    if (stream) {
        return res; // Return raw SSE stream
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
}

// ─── OpenAI Provider ─────────────────────────────────────────
async function callOpenAI(apiKey, { snapshot, systemPrompt, history, model, stream, responseFormat }) {
    const m = model || DEFAULTS.openai;
    const isReasoning = m.startsWith("o");

    const body = {
        model: m,
        stream: stream || false,
        messages: [
            { role: "system", content: systemPrompt },
            ...(history || []),
            { role: "user", content: snapshot },
        ],
    };

    if (isReasoning) {
        body.max_completion_tokens = 12000;
    } else {
        body.max_tokens = 12000;
        body.temperature = 0.1;
        body.top_p = 0.95;
        // Only force JSON output for audits — chat needs natural language
        if (responseFormat !== "text") {
            body.response_format = { type: "json_object" };
        }
    }

    const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
    }, isReasoning ? REASONING_TIMEOUT_MS : PROVIDER_TIMEOUT_MS);

    if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(`OpenAI Error: ${e.error?.message || `HTTP ${res.status}`}`);
    }

    if (stream) {
        return res; // Return raw SSE stream
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
}

// ─── Claude Provider ─────────────────────────────────────────
async function callClaude(apiKey, { snapshot, systemPrompt, history, model, stream, responseFormat }) {
    const body = {
        model: model || DEFAULTS.claude,
        max_tokens: 12000,
        temperature: 0.1,
        stream: stream || false,
        system: systemPrompt,
        messages: [
            ...(history || []),
            { role: "user", content: snapshot },
        ],
    };

    const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
    }, PROVIDER_TIMEOUT_MS);

    if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(`Claude Error: ${e.error?.message || `HTTP ${res.status}`}`);
    }

    if (stream) {
        return res; // Return raw SSE stream
    }

    const data = await res.json();
    return data.content?.[0]?.text || "";
}

// ─── Provider Router ─────────────────────────────────────────
function getProviderHandler(provider) {
    switch (provider) {
        case "gemini": return { handler: callGemini, keyName: "GOOGLE_API_KEY" };
        case "openai": return { handler: callOpenAI, keyName: "OPENAI_API_KEY" };
        case "claude": return { handler: callClaude, keyName: "ANTHROPIC_API_KEY" };
        default: return { handler: callGemini, keyName: "GOOGLE_API_KEY" };
    }
}

// ─── Main Handler ────────────────────────────────────────────
export default {
    async fetch(request, env) {
        const origin = request.headers.get("Origin") || "";
        const cors = corsHeaders(origin, env);

        // Handle preflight
        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: buildHeaders(cors) });
        }

        // Health check (GET or POST)
        const url = new URL(request.url);
        if (url.pathname === "/health") {
            return new Response(JSON.stringify({
                status: "ok",
                version: "1.1",
                providers: ["gemini", "openai", "claude"],
                defaultProvider: "gemini",
                defaultModel: DEFAULTS.gemini,
                plaid: Boolean(env.PLAID_CLIENT_ID && env.PLAID_SECRET)
            }), {
                status: 200,
                headers: buildHeaders(cors, { "Content-Type": "application/json" }),
            });
        }

        if (url.pathname === "/config" && request.method === "GET") {
            return new Response(JSON.stringify({
                gatingMode: env.GATING_MODE || "live",
                minVersion: env.MIN_VERSION || "2.0.0",
                entitlementVerification: Boolean(env.REVENUECAT_SECRET_KEY),
            }), {
                status: 200,
                headers: buildHeaders(cors, { "Content-Type": "application/json", "Cache-Control": "max-age=300" }),
            });
        }

        // ─── Plaid Endpoints ─────────────────────────────────────
        if (url.pathname.startsWith("/plaid/")) {
            if (request.method !== "POST") {
                return new Response(JSON.stringify({ error: "Method not allowed" }), {
                    status: 405, headers: buildHeaders(cors, { "Content-Type": "application/json" })
                });
            }

            if (!env.PLAID_CLIENT_ID || !env.PLAID_SECRET) {
                return new Response(JSON.stringify({ error: "Plaid credentials not configured on backend" }), {
                    status: 503, headers: buildHeaders(cors, { "Content-Type": "application/json" })
                });
            }

            const plaidDomain = `https://${PLAID_ENV}.plaid.com`;
            let plaidEndpoint = "";
            let plaidBody = {};

            try {
                const reqBody = await request.json();

                if (url.pathname === "/plaid/link-token") {
                    plaidEndpoint = "/link/token/create";
                    const webhookUrl = env.PLAID_WEBHOOK_URL || `${url.origin}/plaid/webhook`;
                    plaidBody = {
                        client_id: env.PLAID_CLIENT_ID,
                        secret: env.PLAID_SECRET,
                        client_name: "Catalyst Cash",
                        country_codes: ["US"],
                        language: "en",
                        user: { client_user_id: reqBody.userId || "catalyst-user" },
                        products: ["transactions"],
                        optional_products: ["liabilities", "investments"],
                        webhook: webhookUrl,
                    };
                } else if (url.pathname === "/plaid/exchange") {
                    plaidEndpoint = "/item/public_token/exchange";
                    plaidBody = {
                        client_id: env.PLAID_CLIENT_ID,
                        secret: env.PLAID_SECRET,
                        public_token: reqBody.publicToken
                    };
                } else if (url.pathname === "/plaid/balances") {
                    plaidEndpoint = "/accounts/balance/get";
                    plaidBody = {
                        client_id: env.PLAID_CLIENT_ID,
                        secret: env.PLAID_SECRET,
                        access_token: reqBody.accessToken,
                        options: {
                            min_last_updated_datetime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
                        }
                    };
                } else if (url.pathname === "/plaid/liabilities") {
                    plaidEndpoint = "/liabilities/get";
                    plaidBody = {
                        client_id: env.PLAID_CLIENT_ID,
                        secret: env.PLAID_SECRET,
                        access_token: reqBody.accessToken
                    };
                } else if (url.pathname === "/plaid/disconnect") {
                    plaidEndpoint = "/item/remove";
                    plaidBody = {
                        client_id: env.PLAID_CLIENT_ID,
                        secret: env.PLAID_SECRET,
                        access_token: reqBody.accessToken
                    };
                } else if (url.pathname === "/plaid/transactions") {
                    plaidEndpoint = "/transactions/get";
                    plaidBody = {
                        client_id: env.PLAID_CLIENT_ID,
                        secret: env.PLAID_SECRET,
                        access_token: reqBody.accessToken,
                        start_date: reqBody.startDate,
                        end_date: reqBody.endDate,
                        options: { count: 500, offset: 0 }
                    };
                } else if (url.pathname === "/plaid/webhook") {
                    // ── Plaid Webhook Receiver ────────────────────────
                    // Plaid sends POST requests here when transactions update,
                    // items need attention, or holdings change. Since the app is
                    // client-driven (data lives on-device), we simply acknowledge
                    // receipt. The next manual sync picks up fresh data.
                    const webhookType = reqBody.webhook_type || "UNKNOWN";
                    const webhookCode = reqBody.webhook_code || "UNKNOWN";
                    const itemId = reqBody.item_id || "";

                    console.log(`[Plaid Webhook] ${webhookType}.${webhookCode} for item ${itemId}`);

                    // Log notable events for observability
                    if (webhookType === "ITEM" && webhookCode === "ERROR") {
                        console.warn(`[Plaid Webhook] ITEM ERROR for ${itemId}:`, JSON.stringify(reqBody.error || {}));
                    }
                    if (webhookType === "ITEM" && webhookCode === "PENDING_EXPIRATION") {
                        console.warn(`[Plaid Webhook] Item ${itemId} credentials expiring — user should re-authenticate`);
                    }

                    return new Response(JSON.stringify({
                        received: true,
                        webhook_type: webhookType,
                        webhook_code: webhookCode,
                    }), {
                        status: 200,
                        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
                    });
                } else {
                    return new Response(JSON.stringify({ error: "Unknown Plaid endpoint" }), {
                        status: 404, headers: buildHeaders(cors, { "Content-Type": "application/json" })
                    });
                }

                const plaidRes = await fetchWithTimeout(`${plaidDomain}${plaidEndpoint}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(plaidBody)
                }, PLAID_TIMEOUT_MS);

                const plaidData = await plaidRes.json();
                return new Response(JSON.stringify(plaidData), {
                    status: plaidRes.status,
                    headers: buildHeaders(cors, { "Content-Type": "application/json" })
                });

            } catch (err) {
                return new Response(JSON.stringify({ error: "Plaid proxy error", details: err.message }), {
                    status: 500, headers: buildHeaders(cors, { "Content-Type": "application/json" })
                });
            }
        }

        // ─── Market Data Proxy (GET /market?symbols=VTI,VOO) ─────
        if (url.pathname === "/market" && request.method === "GET") {
            const symbols = (url.searchParams.get("symbols") || "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
            if (symbols.length === 0 || symbols.length > 20) {
                return new Response(JSON.stringify({ error: "Provide 1-20 comma-separated symbols" }), {
                    status: 400, headers: buildHeaders(cors, { "Content-Type": "application/json" }),
                });
            }

            // Check CF Cache first
            const cacheKey = `https://market-data.internal/${symbols.sort().join(",")}`;
            const cache = caches.default;
            const cached = await cache.match(cacheKey);
            if (cached) {
                const body = await cached.text();
                return new Response(body, {
                    status: 200, headers: buildHeaders(cors, { "Content-Type": "application/json", "X-Cache": "HIT" }),
                });
            }

            try {
                // Primary: Yahoo Finance v8 spark API
                const yfUrl = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${symbols.join(",")}&range=1d&interval=1d`;
                const yfRes = await fetchWithTimeout(yfUrl, {
                    headers: { "User-Agent": "Mozilla/5.0 (compatible; CatalystCash/1.0)", "Accept": "application/json" },
                }, MARKET_TIMEOUT_MS);
                if (!yfRes.ok) throw new Error(`Yahoo Finance returned ${yfRes.status}`);
                const yfData = await yfRes.json();

                const result = {};
                for (const sym of symbols) {
                    // Handle both response formats:
                    // Format A (new): { VTI: { close: [340.89], chartPreviousClose: 341.83, symbol: "VTI" } }
                    // Format B (old): { spark: { result: [{ symbol: "VTI", response: [{ meta: {...} }] }] } }
                    let price = null, prevClose = null, name = sym;

                    // Try Format A first (direct symbol keys)
                    if (yfData[sym]) {
                        const d = yfData[sym];
                        const closes = d.close || [];
                        price = closes[closes.length - 1] || null;
                        prevClose = d.chartPreviousClose || d.previousClose || null;
                        name = d.symbol || sym;
                    }
                    // Try Format B (spark.result)
                    else if (yfData?.spark?.result) {
                        const spark = yfData.spark.result.find(r => r.symbol === sym);
                        if (spark?.response?.[0]?.meta) {
                            const meta = spark.response[0].meta;
                            price = meta.regularMarketPrice ?? meta.previousClose ?? null;
                            prevClose = meta.previousClose ?? null;
                            name = meta.shortName || meta.symbol || sym;
                        }
                    }

                    if (price != null) {
                        result[sym] = {
                            price,
                            previousClose: prevClose,
                            change: price && prevClose ? +((price - prevClose).toFixed(2)) : null,
                            changePct: price && prevClose ? +((((price - prevClose) / prevClose) * 100).toFixed(2)) : null,
                            name,
                            currency: "USD",
                        };
                    }
                }

                // If primary returned nothing, try fallback v6 quote API
                if (Object.keys(result).length === 0) {
                    const fbUrl = `https://query2.finance.yahoo.com/v6/finance/quote?symbols=${symbols.join(",")}`;
                    const fbRes = await fetchWithTimeout(fbUrl, {
                        headers: { "User-Agent": "Mozilla/5.0 (compatible; CatalystCash/1.0)", "Accept": "application/json" },
                    }, MARKET_TIMEOUT_MS);
                    if (fbRes.ok) {
                        const fbData = await fbRes.json();
                        for (const q of (fbData?.quoteResponse?.result || [])) {
                            result[q.symbol] = {
                                price: q.regularMarketPrice ?? null,
                                previousClose: q.regularMarketPreviousClose ?? null,
                                change: q.regularMarketChange != null ? +q.regularMarketChange.toFixed(2) : null,
                                changePct: q.regularMarketChangePercent != null ? +q.regularMarketChangePercent.toFixed(2) : null,
                                name: q.shortName || q.longName || q.symbol,
                                currency: q.currency || "USD",
                            };
                        }
                    }
                }

                const json = JSON.stringify({ data: result, fetchedAt: Date.now() });
                // Cache for 15 minutes
                const cacheRes = new Response(json, { headers: { "Cache-Control": "max-age=900" } });
                await cache.put(cacheKey, cacheRes);

                return new Response(json, {
                    status: 200, headers: buildHeaders(cors, { "Content-Type": "application/json", "X-Cache": "MISS" }),
                });
            } catch (err) {
                return new Response(JSON.stringify({ error: err.message || "Market data unavailable" }), {
                    status: 502, headers: buildHeaders(cors, { "Content-Type": "application/json" }),
                });
            }
        }

        // Only accept POST for /audit
        if (request.method !== "POST") {
            return new Response(JSON.stringify({ error: "Method not allowed" }), {
                status: 405,
                headers: buildHeaders(cors, { "Content-Type": "application/json" }),
            });
        }

        if (url.pathname !== "/audit") {
            return new Response(JSON.stringify({ error: "Not found" }), {
                status: 404,
                headers: buildHeaders(cors, { "Content-Type": "application/json" }),
            });
        }

        // ─── Parse Request Body ───────────────────────────────
        let body;
        try {
            const rawBody = await request.text();
            if (rawBody.length > MAX_BODY_SIZE) {
                return new Response(JSON.stringify({ error: "Request body too large (max 512KB)" }), {
                    status: 413,
                    headers: buildHeaders(cors, { "Content-Type": "application/json" }),
                });
            }
            body = JSON.parse(rawBody);
        } catch {
            return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
                status: 400,
                headers: buildHeaders(cors, { "Content-Type": "application/json" }),
            });
        }

        const isChat = body.responseFormat === "text";
        const tierResolution = await resolveEffectiveTier(request, env);
        const subscriptionTier = tierResolution.tier;
        const tierHeaders = {
            "X-Entitlement-Verified": String(tierResolution.verified),
            "X-Subscription-Source": tierResolution.source,
        };

        // ─── Rate Limit Check ─────────────────────────────────
        const deviceId = request.headers.get("X-Device-ID") ||
            request.headers.get("CF-Connecting-IP") || "unknown";

        const rateResult = await peekRateLimit(deviceId, subscriptionTier, isChat);
        if (!rateResult.allowed) {
            const limitName = isChat ? "chats" : "audits";
            return new Response(JSON.stringify({
                error: `Rate limit exceeded. Maximum ${rateResult.limit} ${limitName} for your current plan window.`,
                retryAfter: rateResult.retryAfter,
            }), {
                status: 429,
                headers: buildHeaders(cors, {
                    "Content-Type": "application/json",
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Limit": String(rateResult.limit),
                    "Retry-After": String(rateResult.retryAfter),
                    ...tierHeaders,
                }),
            });
        }

        const { snapshot, systemPrompt, history, model, stream, provider, responseFormat } = body;

        if (!snapshot || !systemPrompt) {
            return new Response(JSON.stringify({ error: "Missing required fields: snapshot, systemPrompt" }), {
                status: 400,
                headers: buildHeaders(cors, { "Content-Type": "application/json", ...tierHeaders }),
            });
        }

        // ─── Resolve Provider ─────────────────────────────────
        const selectedProvider = provider || "gemini";
        if (!VALID_PROVIDERS.includes(selectedProvider)) {
            return new Response(JSON.stringify({ error: "Invalid provider" }), {
                status: 400,
                headers: buildHeaders(cors, { "Content-Type": "application/json", ...tierHeaders }),
            });
        }
        const resolvedModel = model || getDefaultModelForTier(selectedProvider, subscriptionTier);
        if (!isModelAllowedForTier(resolvedModel, subscriptionTier)) {
            return new Response(JSON.stringify({
                error: subscriptionTier === "free"
                    ? `Model ${resolvedModel} requires Catalyst Cash Pro.`
                    : `Model ${resolvedModel} is not currently available.`,
            }), {
                status: 403,
                headers: buildHeaders(cors, {
                    "Content-Type": "application/json",
                    "X-RateLimit-Remaining": String(rateResult.remaining),
                    "X-RateLimit-Limit": String(rateResult.limit),
                    ...tierHeaders,
                }),
            });
        }
        const { handler, keyName } = getProviderHandler(selectedProvider);

        const apiKey = env[keyName];
        if (!apiKey) {
            return new Response(JSON.stringify({
                error: `Backend API key not configured for ${selectedProvider}`,
            }), {
                status: 503,
                headers: buildHeaders(cors, { "Content-Type": "application/json", ...tierHeaders }),
            });
        }

        // ─── Execute Provider Call ─────────────────────────────
        try {
            const shouldStream = stream !== false;

            const result = await handler(apiKey, {
                snapshot,
                systemPrompt,
                history,
                model: resolvedModel,
                stream: shouldStream,
                responseFormat: responseFormat || "json",
            });
            const committedRateResult = await commitRateLimit(rateResult);

            // Streaming: pipe raw response through
            if (shouldStream && result instanceof Response) {
                return new Response(result.body, {
                    status: 200,
                    headers: buildHeaders(cors, {
                        "Content-Type": "text/event-stream",
                        "Cache-Control": "no-cache",
                        "X-RateLimit-Remaining": String(committedRateResult.remaining),
                        "X-RateLimit-Limit": String(committedRateResult.limit),
                        ...tierHeaders,
                    }),
                });
            }

            // Non-streaming: wrap text in JSON
            return new Response(JSON.stringify({ result }), {
                status: 200,
                headers: buildHeaders(cors, {
                    "Content-Type": "application/json",
                    "X-RateLimit-Remaining": String(committedRateResult.remaining),
                    "X-RateLimit-Limit": String(committedRateResult.limit),
                    ...tierHeaders,
                }),
            });

        } catch (err) {
            const message = err?.name === "AbortError"
                ? "Upstream provider timed out"
                : (err.message || "Proxy error");
            return new Response(JSON.stringify({ error: message }), {
                status: 502,
                headers: buildHeaders(cors, { "Content-Type": "application/json", ...tierHeaders }),
            });
        }
    },
};
