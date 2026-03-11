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
const PRO_AUDITS_PER_MONTH = 31;
const FREE_CHATS_PER_DAY = 10;
const PRO_CHATS_PER_DAY = 50;
const PROVIDER_TIMEOUT_MS = 240_000; // 4 min for all models (client has a cancel button)
const PLAID_TIMEOUT_MS = 15_000;
const MARKET_TIMEOUT_MS = 10_000;
const REVENUECAT_TIMEOUT_MS = 8_000;
const REVENUECAT_CACHE_TTL_SECONDS = 300;
const SECURITY_HEADERS = {
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
};
const MODEL_ALLOWLIST = {
  free: new Set(["gemini-2.5-flash", "gpt-4o-mini"]),
  pro: new Set([
    "gemini-2.5-flash",
    "gpt-4o-mini",
    "gemini-2.5-pro",
    "gpt-4o",
    "o3-mini",
    "claude-sonnet-4-20250514",
    "claude-haiku-4-5",
  ]),
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
  const isAllowed =
    allowed.includes(origin) || origin?.startsWith("http://localhost") || origin === "capacitor://localhost";
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : allowed[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Device-ID, X-App-Version, X-Subscription-Tier, X-RC-App-User-ID",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
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
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
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
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilNextMonday, 0, 0, 0, 0)
  );
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
  if (provider === "openai") return tier === "pro" ? "o3-mini" : "gpt-4o-mini";
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
        Accept: "application/json",
        Authorization: `Bearer ${env.REVENUECAT_SECRET_KEY}`,
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
  await cache.put(
    cacheKey,
    new Response(JSON.stringify(payload), {
      headers: { "Cache-Control": `max-age=${REVENUECAT_CACHE_TTL_SECONDS}` },
    })
  );
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

  const res = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    PROVIDER_TIMEOUT_MS
  );

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
    messages: [{ role: "system", content: systemPrompt }, ...(history || []), { role: "user", content: snapshot }],
  };

  if (isReasoning) {
    body.max_completion_tokens = 12000;
    // Reasoning models don't support response_format — inject explicit JSON instruction
    if (responseFormat !== "text") {
      const jsonSuffix =
        "\n\nCRITICAL: You MUST respond with RAW JSON only. No markdown, no code fences, no prose, no explanation. Your entire response must be a single valid JSON object starting with { and ending with }.";
      body.messages[0].content += jsonSuffix;
    }
  } else {
    body.max_tokens = 12000;
    body.temperature = 0.1;
    body.top_p = 0.95;
    // Only force JSON output for audits — chat needs natural language
    if (responseFormat !== "text") {
      body.response_format = { type: "json_object" };
    }
  }

  const res = await fetchWithTimeout(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    },
    PROVIDER_TIMEOUT_MS
  );

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
    messages: [...(history || []), { role: "user", content: snapshot }],
  };

  const res = await fetchWithTimeout(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    },
    PROVIDER_TIMEOUT_MS
  );

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
    case "gemini":
      return { handler: callGemini, keyName: "GOOGLE_API_KEY" };
    case "openai":
      return { handler: callOpenAI, keyName: "OPENAI_API_KEY" };
    case "claude":
      return { handler: callClaude, keyName: "ANTHROPIC_API_KEY" };
    default:
      return { handler: callGemini, keyName: "GOOGLE_API_KEY" };
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
      return new Response(
        JSON.stringify({
          status: "ok",
          version: "1.1",
          providers: ["gemini", "openai", "claude"],
          defaultProvider: "gemini",
          defaultModel: DEFAULTS.gemini,
          plaid: Boolean(env.PLAID_CLIENT_ID && env.PLAID_SECRET),
        }),
        {
          status: 200,
          headers: buildHeaders(cors, { "Content-Type": "application/json" }),
        }
      );
    }

    if (url.pathname === "/config" && request.method === "GET") {
      return new Response(
        JSON.stringify({
          gatingMode: env.GATING_MODE || "live",
          minVersion: env.MIN_VERSION || "2.0.0",
          entitlementVerification: Boolean(env.REVENUECAT_SECRET_KEY),
          rotatingCategories: {
            "Chase Freedom Flex": ["gas", "transit"], // Example active quarter
            "Discover it Cash Back": ["groceries", "drugstores", "online_shopping"] // Example active quarter
          }
        }),
        {
          status: 200,
          headers: buildHeaders(cors, { "Content-Type": "application/json", "Cache-Control": "max-age=300" }),
        }
      );
    }

    // ─── Plaid Endpoints ─────────────────────────────────────
    if (url.pathname.startsWith("/plaid/")) {
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405,
          headers: buildHeaders(cors, { "Content-Type": "application/json" }),
        });
      }

      if (!env.PLAID_CLIENT_ID || !env.PLAID_SECRET) {
        return new Response(JSON.stringify({ error: "Plaid credentials not configured on backend" }), {
          status: 503,
          headers: buildHeaders(cors, { "Content-Type": "application/json" }),
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
            public_token: reqBody.publicToken,
          };

          const plaidRes = await fetchWithTimeout(`${plaidDomain}${plaidEndpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(plaidBody),
          }, PLAID_TIMEOUT_MS);

          if (!plaidRes.ok) throw new Error("Plaid exchange failed");
          const plaidData = await plaidRes.json();

          // Store Access Token + Item ID mapping in D1
          const userId = reqBody.userId || "catalyst-user";
          if (env.DB) {
            await env.DB.prepare(
              "INSERT OR REPLACE INTO plaid_items (item_id, user_id, access_token) VALUES (?, ?, ?)"
            ).bind(plaidData.item_id, userId, plaidData.access_token).run();
          }

          return new Response(JSON.stringify(plaidData), {
            status: 200,
            headers: buildHeaders(cors, { "Content-Type": "application/json" }),
          });
        } else if (url.pathname === "/plaid/balances") {
          plaidEndpoint = "/accounts/balance/get";
          plaidBody = {
            client_id: env.PLAID_CLIENT_ID,
            secret: env.PLAID_SECRET,
            access_token: reqBody.accessToken,
            options: {
              min_last_updated_datetime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            },
          };
        } else if (url.pathname === "/plaid/liabilities") {
          plaidEndpoint = "/liabilities/get";
          plaidBody = {
            client_id: env.PLAID_CLIENT_ID,
            secret: env.PLAID_SECRET,
            access_token: reqBody.accessToken,
          };
        } else if (url.pathname === "/plaid/disconnect") {
          plaidEndpoint = "/item/remove";
          plaidBody = {
            client_id: env.PLAID_CLIENT_ID,
            secret: env.PLAID_SECRET,
            access_token: reqBody.accessToken,
          };
        } else if (url.pathname === "/plaid/transactions") {
          plaidEndpoint = "/transactions/get";
          plaidBody = {
            client_id: env.PLAID_CLIENT_ID,
            secret: env.PLAID_SECRET,
            access_token: reqBody.accessToken,
            start_date: reqBody.startDate,
            end_date: reqBody.endDate,
            options: { count: 500, offset: 0 },
          };
        } else if (url.pathname === "/plaid/webhook") {
          // ── Plaid Webhook Receiver ────────────────────────
          const webhookType = reqBody.webhook_type || "UNKNOWN";
          const webhookCode = reqBody.webhook_code || "UNKNOWN";
          const itemId = reqBody.item_id || "";

          console.log(`[Plaid Webhook] ${webhookType}.${webhookCode} for item ${itemId}`);

          // Trigger async sync logic using waitUntil
          if (env.DB && (webhookCode === "SYNC_UPDATES_AVAILABLE" || webhookCode === "DEFAULT_UPDATE" || webhookCode === "INITIAL_UPDATE")) {
            // Define async sync task without blocking response
            const performSync = async () => {
              const { results: itemResults } = await env.DB.prepare("SELECT user_id, access_token FROM plaid_items WHERE item_id = ?").bind(itemId).all();
              if (!itemResults || itemResults.length === 0) return;

              const { user_id, access_token } = itemResults[0];

              // --- Tier Rate Limiting ---
              let tierId = "free";
              let lastSyncTime = 0;

              // We need to fetch the last sync time to calculate cooldown.
              const { results: syncResults } = await env.DB.prepare("SELECT last_synced_at FROM sync_data WHERE user_id = ?").bind(user_id).all();
              if (syncResults && syncResults.length > 0 && syncResults[0].last_synced_at) {
                // SQlite CURRENT_TIMESTAMP is UTC
                lastSyncTime = new Date(syncResults[0].last_synced_at + "Z").getTime();
              }

              // Let's check if the user is a pro user. In a real app we'd fetch this from RevenueCat API
              // or a users table. For now, since user_id is hardcoded natively, we'll allow all.
              // We'll enforce the 24h / 12h logic here conceptually where possible.
              // Assuming all dev users are "pro" for testing if their ID is catalyst-user
              if (user_id === "catalyst-user" || user_id.includes("pro")) tierId = "pro";

              if (tierId === "free") {
                console.log(`[Plaid Webhook] Aborting sync for Free user ${user_id} (Manual Sync Only)`);
                return; // Completely ignore webhooks for free users
              }

              // Item-level cooldown (48h per institution for Pro)
              const ITEM_COOLDOWN = 48 * 60 * 60 * 1000; // 48 hours
              const { results: itemSyncResults } = await env.DB.prepare("SELECT last_synced_at FROM sync_data WHERE user_id = ? AND item_id = ?").bind(user_id, itemId).all();
              let itemLastSync = 0;
              if (itemSyncResults && itemSyncResults.length > 0 && itemSyncResults[0].last_synced_at) {
                itemLastSync = new Date(itemSyncResults[0].last_synced_at + "Z").getTime();
              }
              const now = Date.now();
              if (itemLastSync > 0 && (now - itemLastSync) < ITEM_COOLDOWN) {
                console.log(`[Plaid Webhook] Skipping item ${itemId} for ${user_id}. Last sync was less than 48h ago.`);
                return;
              }
              // --------------------------

              // Background sync: BALANCE ONLY ($0.10 per call, not $0.30)
              const balRes = await fetch(`${plaidDomain}/accounts/balance/get`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ client_id: env.PLAID_CLIENT_ID, secret: env.PLAID_SECRET, access_token })
              });
              const balances = await balRes.json();

              // Save to D1 (item-level)
              await env.DB.prepare(
                `INSERT INTO sync_data (user_id, item_id, balances_json) 
                   VALUES (?, ?, ?)
                   ON CONFLICT(user_id, item_id) DO UPDATE SET 
                   balances_json=excluded.balances_json, 
                   last_synced_at=CURRENT_TIMESTAMP`
              ).bind(user_id, itemId, JSON.stringify(balances)).run();
              console.log(`[Plaid Webhook] Background balance sync complete for item ${itemId}, user ${user_id}`);
            };

            // Handled via ExecutionContext waitUntil in real environments (mocked directly via await here)
            // In CF Workers you would explicitly call ctx.waitUntil() but we'll queue a promised floating block
            new Promise(r => setTimeout(r, 0)).then(() => performSync().catch(console.error));
          }

          return new Response(
            JSON.stringify({ received: true }),
            { status: 200, headers: buildHeaders(cors, { "Content-Type": "application/json" }) }
          );
        } else if (url.pathname === "/api/sync/force") {
          // Manually trigger a sync for a user, respecting the tier cooldown.
          if (request.method !== "POST") return new Response("{}", { status: 405 });
          const { userId } = await request.json();
          if (!env.DB) return new Response(JSON.stringify({ error: "DB not configured" }), { status: 500, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });

          let tierId = "free";
          if (userId === "catalyst-user" || (userId && userId.includes("pro"))) tierId = "pro";

          if (tierId === "free") {
            return new Response(JSON.stringify({ error: "upgrade_required", message: "Live Syncing is a Pro feature." }), { status: 403, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }

          const { results: syncResults } = await env.DB.prepare("SELECT last_synced_at FROM sync_data WHERE user_id = ?").bind(userId || "catalyst-user").all();
          let lastSyncTime = 0;
          if (syncResults && syncResults.length > 0 && syncResults[0].last_synced_at) {
            lastSyncTime = new Date(syncResults[0].last_synced_at + "Z").getTime();
          }

          const COOLDOWNS = {
            free: 7 * 24 * 60 * 60 * 1000,
            pro: 24 * 60 * 60 * 1000,
          };
          const cooldownMs = COOLDOWNS[tierId] || COOLDOWNS.free;
          const now = Date.now();
          if (lastSyncTime > 0 && (now - lastSyncTime) < cooldownMs) {
            return new Response(JSON.stringify({ error: "cooldown", message: "Cooldown active", cooldownMs, tier: tierId }), { status: 429, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }

          const { results: itemResults } = await env.DB.prepare("SELECT access_token, item_id FROM plaid_items WHERE user_id = ?").bind(userId || "catalyst-user").all();
          if (!itemResults || itemResults.length === 0) {
            return new Response(JSON.stringify({ error: "No plaid items found" }), { status: 404, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }

          let anySuccess = false;
          for (const item of itemResults) {
            const { access_token, item_id: syncItemId } = item;
            try {
              // Balance-only for manual sync ($0.10 per institution, not $0.30)
              const balRes = await fetch(`${plaidDomain}/accounts/balance/get`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: env.PLAID_CLIENT_ID, secret: env.PLAID_SECRET, access_token }) });
              const balances = await balRes.json();

              await env.DB.prepare(
                `INSERT INTO sync_data (user_id, item_id, balances_json) 
                   VALUES (?, ?, ?)
                   ON CONFLICT(user_id, item_id) DO UPDATE SET 
                   balances_json=excluded.balances_json, 
                   last_synced_at=CURRENT_TIMESTAMP`
              ).bind(userId || "catalyst-user", syncItemId || "default", JSON.stringify(balances)).run();
              anySuccess = true;
            } catch (err) { console.error("[Manual Sync] Error syncing item", err); }
          }

          if (anySuccess) {
            return new Response(JSON.stringify({ success: true }), { status: 200, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          } else {
            return new Response(JSON.stringify({ error: "Failed to sync items" }), { status: 500, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }
        } else if (url.pathname === "/api/sync/deep") {
          // On-demand deep sync: fetch transactions + liabilities (Pro only, 7-day cooldown)
          if (request.method !== "POST") return new Response("{}", { status: 405 });
          const { userId: deepUserId } = await request.json();
          if (!env.DB) return new Response(JSON.stringify({ error: "DB not configured" }), { status: 500, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });

          const { results: deepSyncResults } = await env.DB.prepare("SELECT last_synced_at FROM sync_data WHERE user_id = ? AND item_id = 'deep_sync_meta'").bind(deepUserId || "catalyst-user").all();
          let lastDeepSync = 0;
          if (deepSyncResults && deepSyncResults.length > 0 && deepSyncResults[0].last_synced_at) {
            lastDeepSync = new Date(deepSyncResults[0].last_synced_at + "Z").getTime();
          }
          const DEEP_COOLDOWN = 7 * 24 * 60 * 60 * 1000;
          if (lastDeepSync > 0 && (Date.now() - lastDeepSync) < DEEP_COOLDOWN) {
            return new Response(JSON.stringify({ error: "cooldown", message: "Deep sync on cooldown (7 days)" }), { status: 429, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }

          const { results: deepItems } = await env.DB.prepare("SELECT access_token, item_id FROM plaid_items WHERE user_id = ?").bind(deepUserId || "catalyst-user").all();
          if (!deepItems || deepItems.length === 0) {
            return new Response(JSON.stringify({ error: "No plaid items" }), { status: 404, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }

          for (const dItem of deepItems) {
            try {
              const liabRes = await fetch(`${plaidDomain}/liabilities/get`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: env.PLAID_CLIENT_ID, secret: env.PLAID_SECRET, access_token: dItem.access_token }) });
              const liabilities = await liabRes.json();

              const dStart = new Date(); dStart.setDate(dStart.getDate() - 30);
              const dEnd = new Date();
              const txRes = await fetch(`${plaidDomain}/transactions/get`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: env.PLAID_CLIENT_ID, secret: env.PLAID_SECRET, access_token: dItem.access_token, start_date: dStart.toISOString().split("T")[0], end_date: dEnd.toISOString().split("T")[0] }) });
              const transactions = await txRes.json();

              await env.DB.prepare(
                `UPDATE sync_data SET liabilities_json = ?, transactions_json = ? WHERE user_id = ? AND item_id = ?`
              ).bind(JSON.stringify(liabilities), JSON.stringify(transactions), deepUserId || "catalyst-user", dItem.item_id || "default").run();
            } catch (err) { console.error("[Deep Sync] Error", err); }
          }

          await env.DB.prepare(
            `INSERT INTO sync_data (user_id, item_id, balances_json) VALUES (?, 'deep_sync_meta', '{}')
             ON CONFLICT(user_id, item_id) DO UPDATE SET last_synced_at=CURRENT_TIMESTAMP`
          ).bind(deepUserId || "catalyst-user").run();

          return new Response(JSON.stringify({ success: true }), { status: 200, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
        } else if (url.pathname === "/api/sync/status") {
          // Frontend requests latest data from D1, entirely bypassing Plaid
          if (request.method !== "POST") return new Response("{}", { status: 405 });
          const { userId } = await request.json();

          if (!env.DB) return new Response(JSON.stringify({ error: "DB not configured" }), { status: 500, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });

          const { results } = await env.DB.prepare("SELECT * FROM sync_data WHERE user_id = ?").bind(userId || "catalyst-user").all();
          if (!results || results.length === 0) {
            return new Response(JSON.stringify({ hasData: false }), { status: 200, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }

          return new Response(JSON.stringify({
            hasData: true,
            last_synced_at: results[0].last_synced_at,
            balances: JSON.parse(results[0].balances_json || "{}"),
            liabilities: JSON.parse(results[0].liabilities_json || "{}"),
            transactions: JSON.parse(results[0].transactions_json || "{}")
          }), { status: 200, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
        } else {
          return new Response(JSON.stringify({ error: "Unknown Plaid endpoint" }), {
            status: 404,
            headers: buildHeaders(cors, { "Content-Type": "application/json" }),
          });
        }
      } catch (err) {
        return new Response(JSON.stringify({ error: "Plaid proxy error", details: err.message }), {
          status: 500,
          headers: buildHeaders(cors, { "Content-Type": "application/json" }),
        });
      }
    }

    // ─── Market Data Proxy (GET /market?symbols=VTI,VOO) ─────
    if (url.pathname === "/market" && request.method === "GET") {
      const symbols = (url.searchParams.get("symbols") || "")
        .split(",")
        .map(s => s.trim().toUpperCase())
        .filter(Boolean);
      if (symbols.length === 0 || symbols.length > 20) {
        return new Response(JSON.stringify({ error: "Provide 1-20 comma-separated symbols" }), {
          status: 400,
          headers: buildHeaders(cors, { "Content-Type": "application/json" }),
        });
      }

      // Check CF Cache first
      const cacheKey = `https://market-data.internal/${symbols.sort().join(",")}`;
      const cache = caches.default;
      const cached = await cache.match(cacheKey);
      if (cached) {
        const body = await cached.text();
        return new Response(body, {
          status: 200,
          headers: buildHeaders(cors, { "Content-Type": "application/json", "X-Cache": "HIT" }),
        });
      }

      try {
        // Primary: Yahoo Finance v8 spark API
        const yfUrl = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${symbols.join(",")}&range=1d&interval=1d`;
        const yfRes = await fetchWithTimeout(
          yfUrl,
          {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; CatalystCash/1.0)", Accept: "application/json" },
          },
          MARKET_TIMEOUT_MS
        );
        if (!yfRes.ok) throw new Error(`Yahoo Finance returned ${yfRes.status}`);
        const yfData = await yfRes.json();

        const result = {};
        for (const sym of symbols) {
          // Handle both response formats:
          // Format A (new): { VTI: { close: [340.89], chartPreviousClose: 341.83, symbol: "VTI" } }
          // Format B (old): { spark: { result: [{ symbol: "VTI", response: [{ meta: {...} }] }] } }
          let price = null,
            prevClose = null,
            name = sym;

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
              change: price && prevClose ? +(price - prevClose).toFixed(2) : null,
              changePct: price && prevClose ? +(((price - prevClose) / prevClose) * 100).toFixed(2) : null,
              name,
              currency: "USD",
            };
          }
        }

        // If primary returned nothing, try fallback v6 quote API
        if (Object.keys(result).length === 0) {
          const fbUrl = `https://query2.finance.yahoo.com/v6/finance/quote?symbols=${symbols.join(",")}`;
          const fbRes = await fetchWithTimeout(
            fbUrl,
            {
              headers: { "User-Agent": "Mozilla/5.0 (compatible; CatalystCash/1.0)", Accept: "application/json" },
            },
            MARKET_TIMEOUT_MS
          );
          if (fbRes.ok) {
            const fbData = await fbRes.json();
            for (const q of fbData?.quoteResponse?.result || []) {
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
          status: 200,
          headers: buildHeaders(cors, { "Content-Type": "application/json", "X-Cache": "MISS" }),
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message || "Market data unavailable" }), {
          status: 502,
          headers: buildHeaders(cors, { "Content-Type": "application/json" }),
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
    const deviceId = request.headers.get("X-Device-ID") || request.headers.get("CF-Connecting-IP") || "unknown";

    const rateResult = await peekRateLimit(deviceId, subscriptionTier, isChat);
    if (!rateResult.allowed) {
      const limitName = isChat ? "chats" : "audits";
      return new Response(
        JSON.stringify({
          error: `Rate limit exceeded. Maximum ${rateResult.limit} ${limitName} for your current plan window.`,
          retryAfter: rateResult.retryAfter,
        }),
        {
          status: 429,
          headers: buildHeaders(cors, {
            "Content-Type": "application/json",
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Limit": String(rateResult.limit),
            "Retry-After": String(rateResult.retryAfter),
            ...tierHeaders,
          }),
        }
      );
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
      return new Response(
        JSON.stringify({
          error:
            subscriptionTier === "free"
              ? `Model ${resolvedModel} requires Catalyst Cash Pro.`
              : `Model ${resolvedModel} is not currently available.`,
        }),
        {
          status: 403,
          headers: buildHeaders(cors, {
            "Content-Type": "application/json",
            "X-RateLimit-Remaining": String(rateResult.remaining),
            "X-RateLimit-Limit": String(rateResult.limit),
            ...tierHeaders,
          }),
        }
      );
    }
    const { handler, keyName } = getProviderHandler(selectedProvider);

    const apiKey = env[keyName];
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: `Backend API key not configured for ${selectedProvider}`,
        }),
        {
          status: 503,
          headers: buildHeaders(cors, { "Content-Type": "application/json", ...tierHeaders }),
        }
      );
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
      const message = err?.name === "AbortError" ? "Upstream provider timed out" : err.message || "Proxy error";
      return new Response(JSON.stringify({ error: message }), {
        status: 502,
        headers: buildHeaders(cors, { "Content-Type": "application/json", ...tierHeaders }),
      });
    }
  },
};
