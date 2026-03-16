// ═══════════════════════════════════════════════════════════════
// Catalyst Cash — Cloudflare Worker AI Proxy
// Multi-provider: Gemini (default), OpenAI, Claude
// API keys stored as Cloudflare secrets — never exposed to clients.
// ═══════════════════════════════════════════════════════════════

import {
  estimatePromptTokens,
  getBatchCategorizationPrompt,
  getLocationCategorizationPrompt,
  getSystemPrompt,
} from "./promptBuilders.js";
import { getChatSystemPrompt } from "./chatPromptBuilders.js";
import {
  buildHouseholdIntegrityTag,
  sha256Hex,
  verifyHouseholdIntegrity,
} from "./lib/householdSecurity.js";
import { getRevenueCatAppUserId } from "./lib/requestIdentity.js";
import {
  bootstrapIdentityActor,
  getActorRevenueCatUserId,
  issueIdentitySessionToken,
  resolveAuthenticatedActor,
} from "./lib/identitySession.js";
import {
  getQuotaWindow,
  isRevenueCatEntitlementActive,
} from "./lib/quota.js";
import {
  fetchPlaidJson,
  getDbFirstResult,
  syncTransactionsForItem,
  writeSyncRow,
} from "./lib/plaidSync.js";
import { getSafeClientError, redactForWorkerLogs, workerLog } from "./lib/observability.js";
import { handleHouseholdRoute } from "./routes/householdRoutes.js";
import { handleMarketRoute } from "./routes/marketRoutes.js";
import { handleSystemRoute } from "./routes/systemRoutes.js";
import { handleTelemetryRoute } from "./routes/telemetryRoutes.js";

export { buildHouseholdIntegrityTag, sha256Hex } from "./lib/householdSecurity.js";
export {
  bootstrapIdentityActor,
  issueIdentitySessionToken,
  resolveAuthenticatedActor as resolvePlaidActor,
} from "./lib/identitySession.js";
export { verifyIdentitySessionToken } from "./lib/identitySession.js";
export { getIsoWeekKey, getQuotaWindow, isRevenueCatEntitlementActive } from "./lib/quota.js";
export { mergePlaidTransactions } from "./lib/plaidSync.js";

const ANTHROPIC_VERSION = "2023-06-01";
const MAX_BODY_SIZE = 512_000; // 512KB max request body (rich audit prompt is now ~60KB before snapshot/history)
const VALID_PROVIDERS = ["gemini", "openai", "claude", "anthropic"];
const PLAID_ENV = "production"; // "sandbox", "development", or "production"
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
const LOOPBACK_ORIGIN_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;
const MODEL_ALLOWLIST = {
  free: new Set(["gemini-2.5-flash"]),
  pro: new Set([
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gpt-4.1",
    "o3",
    "claude-sonnet-4-6",
    "claude-opus-4-6",
    "claude-haiku-4-5",
  ]),
};

// Model defaults per provider
const DEFAULTS = {
  gemini: "gemini-2.5-flash",
  openai: "gpt-4.1",
  claude: "claude-haiku-4-5",
  anthropic: "claude-haiku-4-5",
};

function buildPersonaProfile(persona) {
  if (persona === "coach") {
    return {
      name: "Coach Catalyst",
      style:
        "You are a tough-love financial coach. Be direct, no-nonsense, and strict about discipline. Don't sugarcoat bad habits. Push the user to be better.",
    };
  }
  if (persona === "friend") {
    return {
      name: "Catalyst AI",
      style:
        "You are a highly supportive, empathetic financial best friend. Be warm, encouraging, and celebrate small wins. Reassure the user when they slip up.",
    };
  }
  if (persona === "nerd") {
    return {
      name: "Catalyst AI",
      style:
        "You are an absolute data nerd. Focus heavily on stats, percentages, compounding math, and optimization strategies. Explain the math clearly.",
    };
  }
  return null;
}

function buildCriticalRetryPrompt(context = {}) {
  const computedStrategy = context.computedStrategy || null;
  const formData = context.formData || {};
  const nativeScore = computedStrategy?.auditSignals?.nativeScore?.score ?? "N/A";
  const nativeGrade = computedStrategy?.auditSignals?.nativeScore?.grade ?? "N/A";
  const operationalSurplus = Number(computedStrategy?.operationalSurplus || 0).toFixed(2);
  const riskFlags = Array.isArray(computedStrategy?.auditSignals?.riskFlags)
    ? computedStrategy.auditSignals.riskFlags.join(", ")
    : "none";

  return `Return STRICT JSON ONLY. No markdown, no prose.

Required top-level keys only:
- headerCard
- healthScore
- weeklyMoves
- riskFlags

Constraints:
- headerCard.status must be GREEN, YELLOW, or RED.
- healthScore.score must be a number from 0-100.
- healthScore.grade must match the score exactly.
- weeklyMoves must be 1-3 concrete actions. If operational surplus is positive, at least one weekly move must assign dollars.
- riskFlags must be an array of short kebab-case strings.

Native anchors:
- Native score anchor: ${nativeScore}/100 (${nativeGrade})
- Operational surplus anchor: $${operationalSurplus}
- Native risk flags: ${riskFlags}
- Snapshot date: ${formData.date || "unknown"}

Return this exact JSON shape:
{
  "headerCard": { "status": "YELLOW", "details": ["short summary"] },
  "healthScore": { "score": 72, "grade": "C-", "trend": "flat", "summary": "one sentence" },
  "weeklyMoves": ["Route $150 to the highest-priority target."],
  "riskFlags": ["example-flag"]
}`;
}

function buildNegotiationPrompt(context = {}) {
  const merchant = context.merchant || "the provider";
  const amount = context.amount || 0;
  const tactic = context.tactic || "ask for a retention or loyalty discount";
  return `You are a practical consumer advocate who writes calm, high-probability retention and billing negotiation scripts.

The user wants to negotiate their $${amount}/month bill with ${merchant}.
The proven winning tactic for ${merchant} is: "${tactic}"

Generate a concise phone/chat script in markdown with these exact sections:

## 📞 Before You Call
- The exact phone number or chat URL (if widely known) for ${merchant}.
- A likely menu path to reach billing, loyalty, or retention if widely known. If not known, say so plainly.
- Have a competitor's current rate ready as your anchor when relevant. If a realistic competitor is unclear, say to reference a lower market rate instead of inventing one.

## 🗣️ Opening Line
Give them a natural opening line for the first 15 seconds. It should usually establish: (1) loyalty or tenure if helpful, (2) price pressure or a competing offer if relevant, and (3) that they are considering cancellation unless the price improves.

## 💰 The Ask
State a realistic target price or discount range to ask for. Use the competitor rate as anchor when known. Example: "I'd like to stay, but I need my bill closer to $X/month to justify keeping the service."

## 🛡️ If They Say No
Provide 3 escalation responses:
1. A firmness response ("I understand, but I'll need to proceed with cancellation then.")
2. A supervisor request ("Can you connect me to someone authorized to offer loyalty pricing?")
3. A callback play ("I'll call back tomorrow — please note my cancellation request on my account.")

## ⚡ Pro Tips
- Best times to call (Tue-Thu morning = shorter hold, better offers).
- If the first offer is weak, counter once with a specific lower target.
- If offered a "temporary" discount, ask for the duration in writing/confirmation number.

RULES: Be practical, confident, and accurate. Give usable words to say, but do not fabricate phone trees, market pricing, or company policies. Do NOT discuss budgeting, tracking, or financial planning — ONLY the negotiation script. Format with clear headers and bold key phrases.`;
}

function buildSystemPrompt(type, context = {}, resolvedProvider = "gemini") {
  const variant = context?.variant || "default";

  if (variant === "location-categorization") {
    return getLocationCategorizationPrompt();
  }
  if (variant === "batch-categorization") {
    return getBatchCategorizationPrompt();
  }
  if (type === "audit" && variant === "critical-retry") {
    return buildCriticalRetryPrompt(context);
  }
  if (type === "chat" && variant === "negotiation-script") {
    return buildNegotiationPrompt(context);
  }
  if (type === "chat") {
    return getChatSystemPrompt(
      context.current || null,
      context.financialConfig || {},
      context.cards || [],
      context.renewals || [],
      context.history || [],
      buildPersonaProfile(context.persona),
      context.personalRules || "",
      context.computedStrategy || null,
      context.trendContext || null,
      context.providerId || resolvedProvider,
      context.memoryBlock || "",
      context.decisionRecommendations || [],
      context.chatInputRisk || null
    );
  }
  return getSystemPrompt(
    context.providerId || resolvedProvider,
    context.financialConfig || {},
    context.cards || [],
    context.renewals || [],
    context.personalRules || "",
    context.trendContext || null,
    context.persona || null,
    context.computedStrategy || null,
    context.chatContext || null,
    context.memoryBlock || ""
  );
}

function logPromptProfile(env, type, provider, prompt) {
  const chars = String(prompt || "").length;
  const estimatedTokens = estimatePromptTokens(prompt);
  workerLog(
    env,
    "debug",
    "prompt-profile",
    `type=${type || "audit"} provider=${provider || "gemini"} chars=${chars} est_tokens=${estimatedTokens}`
  );
}

function getWorkerGatingMode(env) {
  return env.GATING_MODE || "off";
}

function isWorkerGatingEnforced(env) {
  return getWorkerGatingMode(env) === "live";
}

// ─── CORS ────────────────────────────────────────────────────
function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGIN || "https://catalystcash.app").split(",").map(s => s.trim());
  const isAllowed =
    allowed.includes(origin) || LOOPBACK_ORIGIN_RE.test(String(origin || "")) || origin === "capacitor://localhost";
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : allowed[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Device-ID, X-App-Version, X-Subscription-Tier, X-RC-App-User-ID",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function buildHeaders(cors, extra = {}) {
  return { ...cors, ...SECURITY_HEADERS, ...extra };
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

function getDefaultModelForTier(provider, tier) {
  if (provider === "openai") return tier === "pro" ? "o3" : DEFAULTS.gemini;
  if (provider === "gemini") return tier === "pro" ? "gemini-2.5-pro" : "gemini-2.5-flash";
  if (provider === "anthropic" || provider === "claude") return tier === "pro" ? "claude-haiku-4-5" : DEFAULTS.gemini;
  return DEFAULTS[provider] || DEFAULTS.gemini;
}

function isModelAllowedForTier(model, tier) {
  return MODEL_ALLOWLIST[tier]?.has(model);
}

async function fetchRevenueCatSubscriber(appUserId, env) {
  if (!env.REVENUECAT_SECRET_KEY || !appUserId) return null;

  const cacheKey = `https://revenuecat.internal/${encodeURIComponent(appUserId)}`;
  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached.json();
    }
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
  if (cache) {
    await cache.put(
      cacheKey,
      new Response(JSON.stringify(payload), {
        headers: { "Cache-Control": `max-age=${REVENUECAT_CACHE_TTL_SECONDS}` },
      })
    );
  }
  return payload;
}

async function resolveVerifiedRevenueCatAppUserId(request, env) {
  const revenueCatAppUserId = getRevenueCatAppUserId(request);
  if (!revenueCatAppUserId || !env.REVENUECAT_SECRET_KEY) return null;
  try {
    const payload = await fetchRevenueCatSubscriber(revenueCatAppUserId, env);
    return payload?.subscriber ? revenueCatAppUserId : null;
  } catch {
    return null;
  }
}

export async function resolveEffectiveTier(request, env, actor = null) {
  const revenueCatAppUserId = actor?.revenueCatAppUserId || getRevenueCatAppUserId(request);
  if (!env.REVENUECAT_SECRET_KEY || !revenueCatAppUserId) {
    return { tier: "free", verified: false, source: "unverified" };
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
      tier: "free",
      verified: false,
      source: "verification_failed",
      verificationError: error?.message || "verification_failed",
    };
  }
}

async function resolveStoredUserTier(userId, env) {
  if (!isWorkerGatingEnforced(env)) return "pro";
  if (!userId) return "free";

  const revenueCatAppUserId =
    userId.startsWith("rc:") ? userId.slice(3) : await getActorRevenueCatUserId(env.DB, userId);
  if (!revenueCatAppUserId) return "free";

  try {
    const payload = await fetchRevenueCatSubscriber(revenueCatAppUserId, env);
    return isRevenueCatEntitlementActive(payload?.subscriber, getConfiguredEntitlementId(env)) ? "pro" : "free";
  } catch {
    return "free";
  }
}

// ─── Rate Limiting (per-device, using Durable Objects) ─────────────
export class RateLimiter {
  constructor(state) {
    this.state = state;
    this.sql = state.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS counts (
        period_key TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0
      )
    `);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const periodKey = url.searchParams.get("periodKey") || "";
    const commit = url.searchParams.get("commit") === "true";

    if (commit) {
      this.sql.exec(
        `INSERT INTO counts (period_key, count) VALUES (?, 1)
         ON CONFLICT(period_key) DO UPDATE SET count = count + 1`,
        periodKey
      );
    }

    const row = this.sql.exec("SELECT count FROM counts WHERE period_key = ?", periodKey).one();
    const count = row ? row.count : 0;

    // GC stale period keys to prevent unbounded growth
    const rows = [...this.sql.exec("SELECT period_key FROM counts ORDER BY period_key DESC")];
    if (rows.length > 2) {
      for (const r of rows.slice(2)) {
        this.sql.exec("DELETE FROM counts WHERE period_key = ?", r.period_key);
      }
    }

    return new Response(JSON.stringify({ count }), {
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function peekRateLimit(deviceId, tier, isChat, env) {
  const { limit, periodKey, resetAt } = getQuotaWindow(tier, isChat);
  const type = isChat ? "chat" : "audit";
  const limitName = `${tier}-${deviceId}-${type}`;

  const retryAfter = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));

  if (!env.RATE_LIMITER) {
    // Fallback if DO is not bound
    return { allowed: true, remaining: limit, limit, retryAfter, count: 0, key: limitName, periodKey };
  }

  const id = env.RATE_LIMITER.idFromName(limitName);
  const stub = env.RATE_LIMITER.get(id);

  const res = await stub.fetch(`http://internal/?periodKey=${encodeURIComponent(periodKey)}&commit=false`);
  const { count } = await res.json();

  if (count >= limit) {
    return { allowed: false, remaining: 0, limit, retryAfter, count, key: limitName, periodKey };
  }

  return {
    allowed: true,
    remaining: limit - count,
    limit,
    retryAfter,
    count,
    key: limitName,
    periodKey,
  };
}

export async function commitRateLimit(rateResult, env) {
  if (!env.RATE_LIMITER) {
    const newCount = rateResult.count + 1;
    return { ...rateResult, count: newCount, remaining: Math.max(0, rateResult.limit - newCount) };
  }

  const id = env.RATE_LIMITER.idFromName(rateResult.key);
  const stub = env.RATE_LIMITER.get(id);

  const res = await stub.fetch(`http://internal/?periodKey=${encodeURIComponent(rateResult.periodKey)}&commit=true`);
  const { count } = await res.json();

  return {
    ...rateResult,
    count,
    remaining: Math.max(0, rateResult.limit - count),
  };
}

function generateAuditLogId() {
  return crypto.randomUUID();
}

function trimResponsePreview(text) {
  return String(text || "").slice(0, 600);
}

function buildUsage(promptTokens = 0, completionTokens = 0) {
  return {
    promptTokens: Number.isFinite(promptTokens) ? promptTokens : 0,
    completionTokens: Number.isFinite(completionTokens) ? completionTokens : 0,
  };
}

function extractSSEText(parsed) {
  if (parsed?.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
    return parsed.delta.text || "";
  }
  if (parsed?.choices?.[0]?.delta?.content) {
    return parsed.choices[0].delta.content;
  }
  if (parsed?.candidates?.[0]?.content?.parts?.[0]?.text) {
    return parsed.candidates[0].content.parts[0].text;
  }
  return "";
}

function mergeUsage(provider, parsed, usage) {
  if (!parsed || !usage) return usage;

  if (provider === "openai" && parsed.usage) {
    return buildUsage(parsed.usage.prompt_tokens || 0, parsed.usage.completion_tokens || 0);
  }

  if (provider === "anthropic" || provider === "claude") {
    const inputTokens = parsed.message?.usage?.input_tokens ?? parsed.usage?.input_tokens ?? usage.promptTokens;
    const outputTokens = parsed.usage?.output_tokens ?? parsed.message?.usage?.output_tokens ?? usage.completionTokens;
    return buildUsage(inputTokens, outputTokens);
  }

  if (provider === "gemini" && parsed.usageMetadata) {
    const promptTokens = parsed.usageMetadata.promptTokenCount || usage.promptTokens;
    const completionTokens =
      parsed.usageMetadata.candidatesTokenCount ??
      Math.max(0, (parsed.usageMetadata.totalTokenCount || 0) - (parsed.usageMetadata.promptTokenCount || 0));
    return buildUsage(promptTokens, completionTokens);
  }

  return usage;
}

async function insertAuditLogRow(db, row) {
  if (!db) return;

  await db.prepare(
    `INSERT INTO audit_log (
      id, provider, model, user_id, prompt_tokens, completion_tokens,
      parse_succeeded, hit_degraded_fallback, response_preview, confidence, drift_warning, drift_details
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    row.id,
    row.provider,
    row.model,
    row.userId,
    row.promptTokens || 0,
    row.completionTokens || 0,
    row.parseSucceeded ? 1 : 0,
    row.hitDegradedFallback ? 1 : 0,
    trimResponsePreview(row.responsePreview),
    row.confidence || "medium",
    row.driftWarning ? 1 : 0,
    JSON.stringify(Array.isArray(row.driftDetails) ? row.driftDetails : [])
  ).run();
}

async function updateAuditLogRow(db, logId, updates = {}) {
  if (!db || !logId) return;

  const existing = await getDbFirstResult(db, "SELECT * FROM audit_log WHERE id = ?", [logId]);
  if (!existing) return;

  const promptTokens =
    updates.promptTokens == null ? Number(existing.prompt_tokens || 0) : Number(updates.promptTokens || 0);
  const completionTokens =
    updates.completionTokens == null ? Number(existing.completion_tokens || 0) : Number(updates.completionTokens || 0);
  const parseSucceeded =
    updates.parseSucceeded == null ? Number(existing.parse_succeeded || 0) : updates.parseSucceeded ? 1 : 0;
  const hitDegradedFallback =
    updates.hitDegradedFallback == null
      ? Number(existing.hit_degraded_fallback || 0)
      : updates.hitDegradedFallback
        ? 1
        : 0;
  const responsePreview =
    updates.responsePreview == null ? existing.response_preview || "" : trimResponsePreview(updates.responsePreview);
  const confidence = typeof updates.confidence === "string" ? updates.confidence : existing.confidence || "medium";
  const driftWarning =
    updates.driftWarning == null ? Number(existing.drift_warning || 0) : updates.driftWarning ? 1 : 0;
  const driftDetails =
    updates.driftDetails == null
      ? existing.drift_details || "[]"
      : JSON.stringify(Array.isArray(updates.driftDetails) ? updates.driftDetails : []);

  await db.prepare(
    `UPDATE audit_log
        SET prompt_tokens = ?,
            completion_tokens = ?,
            parse_succeeded = ?,
            hit_degraded_fallback = ?,
            response_preview = ?,
            confidence = ?,
            drift_warning = ?,
            drift_details = ?
      WHERE id = ?`
  ).bind(
    promptTokens,
    completionTokens,
    parseSucceeded,
    hitDegradedFallback,
    responsePreview,
    confidence,
    driftWarning,
    driftDetails,
    logId
  ).run();
}

async function captureStreamAuditLog(db, logId, provider, response) {
  if (!db || !logId || !response) return;

  const rawBody = await response.text().catch(() => "");
  let preview = "";
  let usage = buildUsage();

  for (const line of rawBody.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice(6).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const parsed = JSON.parse(payload);
      usage = mergeUsage(provider, parsed, usage);
      if (preview.length < 600) {
        preview += extractSSEText(parsed);
      }
    } catch {
      // Ignore malformed stream chunks for logging.
    }
  }

  await updateAuditLogRow(db, logId, {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    responsePreview: preview,
  });
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
  return {
    text: data.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "",
    usage: buildUsage(
      data.usageMetadata?.promptTokenCount || 0,
      data.usageMetadata?.candidatesTokenCount ??
        Math.max(0, (data.usageMetadata?.totalTokenCount || 0) - (data.usageMetadata?.promptTokenCount || 0))
    ),
  };
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
    if (stream) {
      body.stream_options = { include_usage: true };
    }
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
    if (stream) {
      body.stream_options = { include_usage: true };
    }
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
  return {
    text: data.choices?.[0]?.message?.content || "",
    usage: buildUsage(data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
  };
}

// ─── Claude Provider ─────────────────────────────────────────
async function callClaude(apiKey, { snapshot, systemPrompt, history, model, stream, responseFormat: _responseFormat }) {
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
  return {
    text: data.content?.[0]?.text || "",
    usage: buildUsage(data.usage?.input_tokens || 0, data.usage?.output_tokens || 0),
  };
}

// ─── Provider Router ─────────────────────────────────────────
function getProviderHandler(provider) {
  switch (provider) {
    case "gemini":
      return { handler: callGemini, keyName: "GOOGLE_API_KEY" };
    case "openai":
      return { handler: callOpenAI, keyName: "OPENAI_API_KEY" };
    case "claude":
    case "anthropic":
      return { handler: callClaude, keyName: "ANTHROPIC_API_KEY" };
    default:
      return { handler: callGemini, keyName: "GOOGLE_API_KEY" };
  }
}

// ─── Main Handler ────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);

    // Handle preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: buildHeaders(cors) });
    }

    const url = new URL(request.url);
    const systemResponse = await handleSystemRoute({
      request,
      url,
      env,
      cors,
      buildHeaders,
      DEFAULTS,
      getWorkerGatingMode,
      resolveVerifiedRevenueCatAppUserId,
      bootstrapIdentityActor,
      issueIdentitySessionToken,
      updateAuditLogRow,
      workerLog,
    });
    if (systemResponse) return systemResponse;

    // ─── Plaid Endpoints ─────────────────────────────────────
    if (url.pathname.startsWith("/plaid/") || url.pathname.startsWith("/api/sync/")) {
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

      const plaidActor = url.pathname === "/plaid/webhook" ? null : await resolveAuthenticatedActor(request, env.DB, env);
      if (url.pathname !== "/plaid/webhook" && !plaidActor) {
        return new Response(JSON.stringify({ error: "Invalid or missing identity session" }), {
          status: 401,
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
            user: { client_user_id: plaidActor.userId },
            products: ["transactions"],
            optional_products: ["liabilities", "investments"],
            webhook: webhookUrl,
          };
          const plaidData = await fetchPlaidJson(plaidDomain, plaidEndpoint, env, plaidBody);
          return new Response(JSON.stringify({ link_token: plaidData.link_token }), {
            status: 200,
            headers: buildHeaders(cors, { "Content-Type": "application/json" }),
          });
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
          if (env.DB) {
            await env.DB.prepare(
              "INSERT OR REPLACE INTO plaid_items (item_id, user_id, access_token, transactions_cursor) VALUES (?, ?, ?, ?)"
            ).bind(plaidData.item_id, plaidActor.userId, plaidData.access_token, null).run();
          }

          return new Response(
            JSON.stringify({
              item_id: plaidData.item_id,
            }),
            {
            status: 200,
            headers: buildHeaders(cors, { "Content-Type": "application/json" }),
            }
          );
        } else if (url.pathname === "/plaid/balances") {
          let accessToken = reqBody.accessToken || "";
          if (accessToken && env.DB) {
            const ownedToken = await getDbFirstResult(
              env.DB,
              "SELECT access_token FROM plaid_items WHERE access_token = ? AND user_id = ?",
              [accessToken, plaidActor.userId]
            );
            accessToken = ownedToken?.access_token || "";
          }
          if (!accessToken && reqBody.itemId && env.DB) {
            const itemRow = await getDbFirstResult(
              env.DB,
              "SELECT access_token FROM plaid_items WHERE item_id = ? AND user_id = ?",
              [reqBody.itemId, plaidActor.userId]
            );
            accessToken = itemRow?.access_token || "";
          }
          if (!accessToken) {
            return new Response(JSON.stringify({ error: "Plaid item not found for actor" }), {
              status: 404,
              headers: buildHeaders(cors, { "Content-Type": "application/json" }),
            });
          }
          plaidEndpoint = "/accounts/get";
          plaidBody = {
            client_id: env.PLAID_CLIENT_ID,
            secret: env.PLAID_SECRET,
            access_token: accessToken,
          };
          const plaidData = await fetchPlaidJson(plaidDomain, plaidEndpoint, env, plaidBody);
          return new Response(JSON.stringify(plaidData), {
            status: 200,
            headers: buildHeaders(cors, { "Content-Type": "application/json" }),
          });
        } else if (url.pathname === "/plaid/liabilities") {
          let accessToken = reqBody.accessToken || "";
          if (accessToken && env.DB) {
            const ownedToken = await getDbFirstResult(
              env.DB,
              "SELECT access_token FROM plaid_items WHERE access_token = ? AND user_id = ?",
              [accessToken, plaidActor.userId]
            );
            accessToken = ownedToken?.access_token || "";
          }
          if (!accessToken && reqBody.itemId && env.DB) {
            const itemRow = await getDbFirstResult(
              env.DB,
              "SELECT access_token FROM plaid_items WHERE item_id = ? AND user_id = ?",
              [reqBody.itemId, plaidActor.userId]
            );
            accessToken = itemRow?.access_token || "";
          }
          if (!accessToken) {
            return new Response(JSON.stringify({ error: "Plaid item not found for actor" }), {
              status: 404,
              headers: buildHeaders(cors, { "Content-Type": "application/json" }),
            });
          }
          plaidEndpoint = "/liabilities/get";
          plaidBody = {
            client_id: env.PLAID_CLIENT_ID,
            secret: env.PLAID_SECRET,
            access_token: accessToken,
          };
          const plaidData = await fetchPlaidJson(plaidDomain, plaidEndpoint, env, plaidBody);
          return new Response(JSON.stringify(plaidData), {
            status: 200,
            headers: buildHeaders(cors, { "Content-Type": "application/json" }),
          });
        } else if (url.pathname === "/plaid/disconnect") {
          let accessToken = reqBody.accessToken || "";
          const itemId = reqBody.itemId || "";

          if (accessToken && env.DB) {
            const ownedToken = await getDbFirstResult(
              env.DB,
              "SELECT access_token FROM plaid_items WHERE access_token = ? AND user_id = ?",
              [accessToken, plaidActor.userId]
            );
            accessToken = ownedToken?.access_token || "";
          }

          if (!accessToken && itemId && env.DB) {
            const itemRow = await getDbFirstResult(
              env.DB,
              "SELECT user_id, access_token FROM plaid_items WHERE item_id = ? AND user_id = ?",
              [itemId, plaidActor.userId]
            );
            accessToken = itemRow?.access_token || "";
            if (itemRow?.user_id) {
              await env.DB.prepare("DELETE FROM sync_data WHERE user_id = ? AND item_id = ?").bind(itemRow.user_id, itemId).run();
            }
            if (itemRow?.user_id) {
              await env.DB.prepare("DELETE FROM plaid_items WHERE item_id = ? AND user_id = ?").bind(itemId, plaidActor.userId).run();
            }
          }

          if (!accessToken) {
            return new Response(JSON.stringify({ error: "Plaid item not found for actor" }), {
              status: 404,
              headers: buildHeaders(cors, { "Content-Type": "application/json" }),
            });
          }

          plaidEndpoint = "/item/remove";
          plaidBody = {
            client_id: env.PLAID_CLIENT_ID,
            secret: env.PLAID_SECRET,
            access_token: accessToken,
          };
          await fetchPlaidJson(plaidDomain, plaidEndpoint, env, plaidBody);
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: buildHeaders(cors, { "Content-Type": "application/json" }),
          });
        } else if (url.pathname === "/plaid/transactions") {
          const itemId =
            reqBody.itemId ||
            (
              await getDbFirstResult(
                env.DB,
                "SELECT item_id FROM plaid_items WHERE access_token = ? AND user_id = ?",
                [reqBody.accessToken, plaidActor.userId]
              )
            )?.item_id;

          if (!itemId) {
            return new Response(JSON.stringify({ error: "Plaid item not found for actor" }), {
              status: 404,
              headers: buildHeaders(cors, { "Content-Type": "application/json" }),
            });
          }

          const itemRow = await getDbFirstResult(
            env.DB,
            "SELECT access_token FROM plaid_items WHERE item_id = ? AND user_id = ?",
            [itemId, plaidActor.userId]
          );
          if (!itemRow?.access_token) {
            return new Response(JSON.stringify({ error: "Plaid item not found for actor" }), {
              status: 404,
              headers: buildHeaders(cors, { "Content-Type": "application/json" }),
            });
          }

          const { mergedTransactions } = await syncTransactionsForItem({
            db: env.DB,
            userId: plaidActor.userId,
            itemId,
            accessToken: itemRow.access_token,
            plaidDomain,
            env,
          });

          return new Response(JSON.stringify(mergedTransactions), {
            status: 200,
            headers: buildHeaders(cors, { "Content-Type": "application/json" }),
          });
        } else if (url.pathname === "/plaid/webhook") {
          // ── Plaid Webhook Receiver ────────────────────────
          const webhookCode = reqBody.webhook_code || "UNKNOWN";
          const itemId = reqBody.item_id || "";

          // Webhook received — process below

          // Trigger async sync logic using waitUntil
          if (env.DB && (webhookCode === "SYNC_UPDATES_AVAILABLE" || webhookCode === "DEFAULT_UPDATE" || webhookCode === "INITIAL_UPDATE")) {
            // Define async sync task without blocking response
            const performSync = async () => {
              const { results: itemResults } = await env.DB.prepare("SELECT user_id, access_token FROM plaid_items WHERE item_id = ?").bind(itemId).all();
              if (!itemResults || itemResults.length === 0) return;

              const { user_id, access_token } = itemResults[0];

              // --- Tier Rate Limiting ---
              let tierId = await resolveStoredUserTier(user_id, env);
              if (isWorkerGatingEnforced(env) && tierId === "free") {
                // Free users: manual sync only — ignore webhook
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
                // Item cooldown not elapsed — skip
                return;
              }
              // --------------------------

              // Background sync: Use free /accounts/get since webhook means data is fresh
              const balances = await fetchPlaidJson(plaidDomain, "/accounts/get", env, {
                access_token: access_token,
              });
              const { mergedTransactions } = await syncTransactionsForItem({
                db: env.DB,
                userId: user_id,
                itemId,
                accessToken: access_token,
                plaidDomain,
                env,
              });

              await writeSyncRow(env.DB, user_id, itemId, {
                balancesJson: JSON.stringify(balances),
                transactionsJson: JSON.stringify(mergedTransactions),
              });
              // Balance sync persisted to D1
            };

            // Use ctx.waitUntil to keep the worker alive for the async sync
            ctx.waitUntil(
              performSync().catch((error) => {
                workerLog(env, "error", "plaid-webhook", "Background sync failed", { error, itemId });
              })
            );
          }

          return new Response(
            JSON.stringify({ received: true }),
            { status: 200, headers: buildHeaders(cors, { "Content-Type": "application/json" }) }
          );
        } else if (url.pathname === "/api/sync/force") {
          // Manually trigger a sync for a user, respecting the tier cooldown.
          if (request.method !== "POST") return new Response("{}", { status: 405 });
          if (!env.DB) return new Response(JSON.stringify({ error: "DB not configured" }), { status: 500, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          const tierResolution = await resolveEffectiveTier(request, env, plaidActor);
          const tierId = !isWorkerGatingEnforced(env) ? "pro" : tierResolution.tier;

          if (isWorkerGatingEnforced(env) && tierId === "free") {
            return new Response(JSON.stringify({ error: "upgrade_required", message: "Live Syncing is a Pro feature." }), { status: 403, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }

          const { results: syncResults } = await env.DB.prepare("SELECT last_synced_at FROM sync_data WHERE user_id = ?").bind(plaidActor.userId).all();
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

          const { results: itemResults } = await env.DB.prepare("SELECT access_token, item_id FROM plaid_items WHERE user_id = ?").bind(plaidActor.userId).all();
          if (!itemResults || itemResults.length === 0) {
            return new Response(JSON.stringify({ error: "No plaid items found" }), { status: 404, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }

          let anySuccess = false;
          for (const item of itemResults) {
            const { access_token, item_id: syncItemId } = item;
            try {
              // Manual sync: use free /accounts/get and rely on background product updates ($0.30/mo flat)
              const balances = await fetchPlaidJson(plaidDomain, "/accounts/get", env, {
                access_token,
              });

              await writeSyncRow(env.DB, plaidActor.userId, syncItemId || "default", {
                balancesJson: JSON.stringify(balances),
              });
              anySuccess = true;
            } catch (err) {
              workerLog(env, "warn", "plaid-sync", "Manual sync item failed", {
                error: err,
                itemId: syncItemId || "default",
              });
            }
          }

          if (anySuccess) {
            return new Response(JSON.stringify({ success: true }), { status: 200, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          } else {
            return new Response(JSON.stringify({ error: "Failed to sync items" }), { status: 500, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }
        } else if (url.pathname === "/api/sync/deep") {
          // On-demand deep sync: fetch transactions + liabilities.
          // In soft launch, this remains available to all users. In live gating, free users are blocked.
          if (request.method !== "POST") return new Response("{}", { status: 405 });
          if (!env.DB) return new Response(JSON.stringify({ error: "DB not configured" }), { status: 500, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          const tierResolution = await resolveEffectiveTier(request, env, plaidActor);
          const deepTierId = !isWorkerGatingEnforced(env) ? "pro" : tierResolution.tier;

          if (isWorkerGatingEnforced(env) && deepTierId === "free") {
            return new Response(JSON.stringify({ error: "upgrade_required", message: "Deep sync is a Pro feature when live gating is enabled." }), { status: 403, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }

          const { results: deepSyncResults } = await env.DB.prepare("SELECT last_synced_at FROM sync_data WHERE user_id = ? AND item_id = 'deep_sync_meta'").bind(plaidActor.userId).all();
          let lastDeepSync = 0;
          if (deepSyncResults && deepSyncResults.length > 0 && deepSyncResults[0].last_synced_at) {
            lastDeepSync = new Date(deepSyncResults[0].last_synced_at + "Z").getTime();
          }
          const DEEP_COOLDOWN = 7 * 24 * 60 * 60 * 1000;
          if (lastDeepSync > 0 && (Date.now() - lastDeepSync) < DEEP_COOLDOWN) {
            return new Response(JSON.stringify({ error: "cooldown", message: "Deep sync on cooldown (7 days)" }), { status: 429, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }

          const { results: deepItems } = await env.DB.prepare("SELECT access_token, item_id FROM plaid_items WHERE user_id = ?").bind(plaidActor.userId).all();
          if (!deepItems || deepItems.length === 0) {
            return new Response(JSON.stringify({ error: "No plaid items" }), { status: 404, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }

          for (const dItem of deepItems) {
            try {
              const liabilities = await fetchPlaidJson(plaidDomain, "/liabilities/get", env, {
                access_token: dItem.access_token,
              });
              const { mergedTransactions } = await syncTransactionsForItem({
                db: env.DB,
                userId: plaidActor.userId,
                itemId: dItem.item_id || "default",
                accessToken: dItem.access_token,
                plaidDomain,
                env,
              });

              await writeSyncRow(env.DB, plaidActor.userId, dItem.item_id || "default", {
                liabilitiesJson: JSON.stringify(liabilities),
                transactionsJson: JSON.stringify(mergedTransactions),
              });
            } catch (err) {
              workerLog(env, "warn", "plaid-sync", "Deep sync item failed", {
                error: err,
                itemId: dItem.item_id || "default",
              });
            }
          }

          await env.DB.prepare(
            `INSERT INTO sync_data (user_id, item_id, balances_json) VALUES (?, 'deep_sync_meta', '{}')
             ON CONFLICT(user_id, item_id) DO UPDATE SET last_synced_at=CURRENT_TIMESTAMP`
          ).bind(plaidActor.userId).run();

          return new Response(JSON.stringify({ success: true }), { status: 200, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
        } else if (url.pathname === "/api/sync/status") {
          // Frontend requests latest data from D1, entirely bypassing Plaid
          if (request.method !== "POST") return new Response("{}", { status: 405 });
          if (!env.DB) return new Response(JSON.stringify({ error: "DB not configured" }), { status: 500, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });

          const { results } = await env.DB.prepare("SELECT * FROM sync_data WHERE user_id = ?").bind(plaidActor.userId).all();
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
        workerLog(env, "error", "plaid-proxy", "Plaid proxy error", { error: err, path: url.pathname });
        return new Response(JSON.stringify({ error: "Plaid proxy error", message: "Catalyst couldn't complete the Plaid request right now." }), {
          status: 500,
          headers: buildHeaders(cors, { "Content-Type": "application/json" }),
        });
      }
    }

    const householdResponse = await handleHouseholdRoute({
      request,
      url,
      env,
      cors,
      buildHeaders,
      sha256Hex,
      buildHouseholdIntegrityTag,
      verifyHouseholdIntegrity,
    });
    if (householdResponse) return householdResponse;

    const marketResponse = await handleMarketRoute({
      request,
      url,
      cors,
      buildHeaders,
      fetchWithTimeout,
      MARKET_TIMEOUT_MS,
    });
    if (marketResponse) return marketResponse;

    // Only accept POST for /audit
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    }

    const telemetryResponse = await handleTelemetryRoute({
      request,
      url,
      env,
      cors,
      buildHeaders,
      redactForWorkerLogs,
      workerLog,
    });
    if (telemetryResponse) return telemetryResponse;

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

    const rateResult = await peekRateLimit(deviceId, subscriptionTier, isChat, env);
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

    const { snapshot, systemPrompt, context, type, history, model, stream, provider, responseFormat } = body;

    if (!snapshot || (!systemPrompt && !context)) {
      return new Response(JSON.stringify({ error: "Missing required fields: snapshot, context" }), {
        status: 400,
        headers: buildHeaders(cors, { "Content-Type": "application/json", ...tierHeaders }),
      });
    }

    // ─── Resolve Provider ─────────────────────────────────
    const requestedProvider = provider || "gemini";
    if (!VALID_PROVIDERS.includes(requestedProvider)) {
      return new Response(JSON.stringify({ error: "Invalid provider" }), {
        status: 400,
        headers: buildHeaders(cors, { "Content-Type": "application/json", ...tierHeaders }),
      });
    }
    let selectedProvider = requestedProvider;
    let resolvedModel = model || getDefaultModelForTier(selectedProvider, subscriptionTier);
    if (subscriptionTier !== "pro") {
      selectedProvider = "gemini";
      resolvedModel = "gemini-2.5-flash";
    }
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
    const resolvedType = type || (isChat ? "chat" : "audit");
    const resolvedSystemPrompt = systemPrompt || buildSystemPrompt(resolvedType, context || {}, selectedProvider);
    logPromptProfile(env, resolvedType, selectedProvider, resolvedSystemPrompt);

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
      const auditLogId = generateAuditLogId();
      const auditUserId = getRevenueCatAppUserId(request) || deviceId;

      const result = await handler(apiKey, {
        snapshot,
        systemPrompt: resolvedSystemPrompt,
        history,
        model: resolvedModel,
        stream: shouldStream,
        responseFormat: responseFormat || "json",
      });
      const committedRateResult = await commitRateLimit(rateResult, env);

      // Streaming: pipe raw response through
      if (shouldStream && result instanceof Response) {
        await insertAuditLogRow(env.DB, {
          id: auditLogId,
          provider: selectedProvider,
          model: resolvedModel,
          userId: auditUserId,
          promptTokens: 0,
          completionTokens: 0,
          parseSucceeded: false,
          hitDegradedFallback: false,
          responsePreview: "",
          confidence: "medium",
          driftWarning: false,
          driftDetails: [],
        });
        ctx.waitUntil(captureStreamAuditLog(env.DB, auditLogId, selectedProvider, result.clone()));

        return new Response(result.body, {
          status: 200,
          headers: buildHeaders(cors, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "X-Audit-Log-ID": auditLogId,
            "X-RateLimit-Remaining": String(committedRateResult.remaining),
            "X-RateLimit-Limit": String(committedRateResult.limit),
            ...tierHeaders,
          }),
        });
      }

      const resultText = typeof result === "string" ? result : result?.text || "";
      const usage = typeof result === "string" ? buildUsage() : buildUsage(result?.usage?.promptTokens, result?.usage?.completionTokens);
      await insertAuditLogRow(env.DB, {
        id: auditLogId,
        provider: selectedProvider,
        model: resolvedModel,
        userId: auditUserId,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        parseSucceeded: false,
        hitDegradedFallback: false,
        responsePreview: resultText,
        confidence: "medium",
        driftWarning: false,
        driftDetails: [],
      });

      // Non-streaming: wrap text in JSON
      return new Response(JSON.stringify({ result: resultText }), {
        status: 200,
        headers: buildHeaders(cors, {
          "Content-Type": "application/json",
          "X-Audit-Log-ID": auditLogId,
          "X-RateLimit-Remaining": String(committedRateResult.remaining),
          "X-RateLimit-Limit": String(committedRateResult.limit),
          ...tierHeaders,
        }),
      });
    } catch (err) {
      workerLog(env, "error", "ai-proxy", "Provider call failed", {
        error: err,
        provider: selectedProvider,
        type: resolvedType,
      });
      const message = err?.name === "AbortError"
        ? "Upstream provider timed out"
        : getSafeClientError(err, "Catalyst AI is temporarily unavailable. Please try again.");
      return new Response(JSON.stringify({ error: message }), {
        status: 502,
        headers: buildHeaders(cors, { "Content-Type": "application/json", ...tierHeaders }),
      });
    }
  },
};
