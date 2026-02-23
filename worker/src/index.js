// ═══════════════════════════════════════════════════════════════
// Catalyst Cash — Cloudflare Worker AI Proxy
// Multi-provider: Gemini (default), OpenAI, Claude
// API keys stored as Cloudflare secrets — never exposed to clients.
// ═══════════════════════════════════════════════════════════════

const ANTHROPIC_VERSION = "2023-06-01";
const MAX_AUDITS_PER_DAY = 10;
const MAX_BODY_SIZE = 100_000; // 100KB max request body
const VALID_PROVIDERS = ["gemini", "openai", "claude"];

// Model defaults per provider
const DEFAULTS = {
    gemini: "gemini-2.5-flash",
    openai: "o3-mini",
    claude: "claude-sonnet-4-20250514",
};

// ─── CORS ────────────────────────────────────────────────────
function corsHeaders(origin, env) {
    const allowed = (env.ALLOWED_ORIGIN || "https://catalystcash.app").split(",").map(s => s.trim());
    const isAllowed = allowed.includes(origin) || origin?.startsWith("http://localhost");
    return {
        "Access-Control-Allow-Origin": isAllowed ? origin : allowed[0],
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Device-ID",
        "Access-Control-Max-Age": "86400",
    };
}

// ─── Rate Limiting (per-device, using Cache API) ─────────────
async function checkRateLimit(deviceId) {
    const cache = caches.default;
    const key = `https://rate-limit.internal/${deviceId}`;
    const cached = await cache.match(key);

    let count = 0;
    if (cached) {
        count = parseInt(await cached.text(), 10) || 0;
    }

    if (count >= MAX_AUDITS_PER_DAY) {
        return { allowed: false, remaining: 0 };
    }

    const newCount = count + 1;
    const res = new Response(String(newCount), {
        headers: { "Cache-Control": `max-age=${24 * 60 * 60}` },
    });
    await cache.put(key, res);

    return { allowed: true, remaining: MAX_AUDITS_PER_DAY - newCount };
}

// ─── Gemini Provider ─────────────────────────────────────────
async function callGemini(apiKey, { snapshot, systemPrompt, history, model, stream }) {
    const m = model || DEFAULTS.gemini;
    const endpoint = stream
        ? `https://generativelanguage.googleapis.com/v1beta/models/${m}:streamGenerateContent?alt=sse&key=${apiKey}`
        : `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;

    const body = {
        contents: [
            ...(history || []).map(h => ({
                role: h.role === "assistant" ? "model" : "user",
                parts: [{ text: h.content }],
            })),
            { parts: [{ text: snapshot }], role: "user" },
        ],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
            maxOutputTokens: 12000,
            temperature: 0.1,
            topP: 0.95,
            responseMimeType: "application/json",
        },
    };

    const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

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
async function callOpenAI(apiKey, { snapshot, systemPrompt, history, model, stream }) {
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
        body.response_format = { type: "json_object" };
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
    });

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
async function callClaude(apiKey, { snapshot, systemPrompt, history, model, stream }) {
    const body = {
        model: model || DEFAULTS.claude,
        max_tokens: 12000,
        temperature: 1,
        stream: stream !== false,
        system: systemPrompt,
        messages: [
            ...(history || []),
            { role: "user", content: snapshot },
        ],
    };

    const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
    });

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
            return new Response(null, { status: 204, headers: cors });
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
            }), {
                status: 200,
                headers: { ...cors, "Content-Type": "application/json" },
            });
        }

        // ─── Market Data Proxy (GET /market?symbols=VTI,VOO) ─────
        if (url.pathname === "/market" && request.method === "GET") {
            const symbols = (url.searchParams.get("symbols") || "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
            if (symbols.length === 0 || symbols.length > 20) {
                return new Response(JSON.stringify({ error: "Provide 1-20 comma-separated symbols" }), {
                    status: 400, headers: { ...cors, "Content-Type": "application/json" },
                });
            }

            // Check CF Cache first
            const cacheKey = `https://market-data.internal/${symbols.sort().join(",")}`;
            const cache = caches.default;
            const cached = await cache.match(cacheKey);
            if (cached) {
                const body = await cached.text();
                return new Response(body, {
                    status: 200, headers: { ...cors, "Content-Type": "application/json", "X-Cache": "HIT" },
                });
            }

            try {
                const yfUrl = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${symbols.join(",")}&range=1d&interval=1d`;
                const yfRes = await fetch(yfUrl, {
                    headers: { "User-Agent": "CatalystCash/1.0", "Accept": "application/json" },
                });
                if (!yfRes.ok) throw new Error(`Yahoo Finance returned ${yfRes.status}`);
                const yfData = await yfRes.json();

                const result = {};
                for (const sym of symbols) {
                    const spark = yfData?.spark?.result?.find(r => r.symbol === sym);
                    if (spark?.response?.[0]?.meta) {
                        const meta = spark.response[0].meta;
                        result[sym] = {
                            price: meta.regularMarketPrice ?? meta.previousClose ?? null,
                            previousClose: meta.previousClose ?? null,
                            change: meta.regularMarketPrice && meta.previousClose
                                ? +(meta.regularMarketPrice - meta.previousClose).toFixed(2) : null,
                            changePct: meta.regularMarketPrice && meta.previousClose
                                ? +(((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100).toFixed(2) : null,
                            name: meta.shortName || meta.symbol || sym,
                            currency: meta.currency || "USD",
                        };
                    }
                }

                const json = JSON.stringify({ data: result, fetchedAt: Date.now() });
                // Cache for 15 minutes
                const cacheRes = new Response(json, { headers: { "Cache-Control": "max-age=900" } });
                await cache.put(cacheKey, cacheRes);

                return new Response(json, {
                    status: 200, headers: { ...cors, "Content-Type": "application/json", "X-Cache": "MISS" },
                });
            } catch (err) {
                return new Response(JSON.stringify({ error: err.message || "Market data unavailable" }), {
                    status: 502, headers: { ...cors, "Content-Type": "application/json" },
                });
            }
        }

        // Only accept POST for /audit
        if (request.method !== "POST") {
            return new Response(JSON.stringify({ error: "Method not allowed" }), {
                status: 405,
                headers: { ...cors, "Content-Type": "application/json" },
            });
        }

        if (url.pathname !== "/audit") {
            return new Response(JSON.stringify({ error: "Not found" }), {
                status: 404,
                headers: { ...cors, "Content-Type": "application/json" },
            });
        }

        // ─── Rate Limit Check ─────────────────────────────────
        const deviceId = request.headers.get("X-Device-ID") ||
            request.headers.get("CF-Connecting-IP") || "unknown";

        const rateResult = await checkRateLimit(deviceId);
        if (!rateResult.allowed) {
            return new Response(JSON.stringify({
                error: "Rate limit exceeded. Maximum 10 audits per day.",
                retryAfter: 86400,
            }), {
                status: 429,
                headers: {
                    ...cors,
                    "Content-Type": "application/json",
                    "X-RateLimit-Remaining": "0",
                    "Retry-After": "86400",
                },
            });
        }

        // ─── Parse Request Body ───────────────────────────────
        let body;
        try {
            const rawBody = await request.text();
            if (rawBody.length > MAX_BODY_SIZE) {
                return new Response(JSON.stringify({ error: "Request body too large (max 100KB)" }), {
                    status: 413,
                    headers: { ...cors, "Content-Type": "application/json" },
                });
            }
            body = JSON.parse(rawBody);
        } catch {
            return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
                status: 400,
                headers: { ...cors, "Content-Type": "application/json" },
            });
        }

        const { snapshot, systemPrompt, history, model, stream, provider } = body;

        if (!snapshot || !systemPrompt) {
            return new Response(JSON.stringify({ error: "Missing required fields: snapshot, systemPrompt" }), {
                status: 400,
                headers: { ...cors, "Content-Type": "application/json" },
            });
        }

        // ─── Resolve Provider ─────────────────────────────────
        const selectedProvider = provider || "gemini";
        if (!VALID_PROVIDERS.includes(selectedProvider)) {
            return new Response(JSON.stringify({ error: "Invalid provider" }), {
                status: 400,
                headers: { ...cors, "Content-Type": "application/json" },
            });
        }
        const { handler, keyName } = getProviderHandler(selectedProvider);

        const apiKey = env[keyName];
        if (!apiKey) {
            return new Response(JSON.stringify({
                error: `Backend API key not configured for ${selectedProvider}`,
            }), {
                status: 503,
                headers: { ...cors, "Content-Type": "application/json" },
            });
        }

        // ─── Execute Provider Call ─────────────────────────────
        try {
            const shouldStream = stream !== false;

            const result = await handler(apiKey, {
                snapshot,
                systemPrompt,
                history,
                model,
                stream: shouldStream,
            });

            // Streaming: pipe raw response through
            if (shouldStream && result instanceof Response) {
                return new Response(result.body, {
                    status: 200,
                    headers: {
                        ...cors,
                        "Content-Type": "text/event-stream",
                        "Cache-Control": "no-cache",
                        "X-RateLimit-Remaining": String(rateResult.remaining),
                    },
                });
            }

            // Non-streaming: wrap text in JSON
            return new Response(JSON.stringify({ result }), {
                status: 200,
                headers: {
                    ...cors,
                    "Content-Type": "application/json",
                    "X-RateLimit-Remaining": String(rateResult.remaining),
                },
            });

        } catch (err) {
            return new Response(JSON.stringify({ error: err.message || "Proxy error" }), {
                status: 502,
                headers: { ...cors, "Content-Type": "application/json" },
            });
        }
    },
};
