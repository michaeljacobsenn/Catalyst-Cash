// ═══════════════════════════════════════════════════════════════
// Catalyst Cash — Cloudflare Worker AI Proxy
// Multi-provider: Gemini (default), OpenAI, Claude
// API keys stored as Cloudflare secrets — never exposed to clients.
// ═══════════════════════════════════════════════════════════════

import {
  getBatchCategorizationPrompt,
  getLocationCategorizationPrompt,
  getSystemPrompt,
} from "./promptBuilders.js";
import { getChatSystemPrompt } from "./chatPromptBuilders.js";

const ANTHROPIC_VERSION = "2023-06-01";
const MAX_BODY_SIZE = 512_000; // 512KB max request body (system prompt alone is ~110KB)
const VALID_PROVIDERS = ["gemini", "openai", "claude", "anthropic"];
const PLAID_ENV = "production"; // "sandbox", "development", or "production"
const FREE_AUDITS_PER_WEEK = 2;
const PRO_AUDITS_PER_MONTH = 20;
const FREE_CHATS_PER_DAY = 10;
const PRO_CHATS_PER_DAY = 25;
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
  if (provider === "openai") return tier === "pro" ? "o3" : DEFAULTS.gemini;
  if (provider === "gemini") return tier === "pro" ? "gemini-2.5-pro" : "gemini-2.5-flash";
  if (provider === "anthropic" || provider === "claude") return tier === "pro" ? "claude-haiku-4-5" : DEFAULTS.gemini;
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
  const revenueCatAppUserId = getRevenueCatAppUserId(request);
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

function parseStoredJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeStoredTransactionsPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { transactions: [], total_transactions: 0 };
  }

  const transactions = Array.isArray(payload.transactions) ? payload.transactions.filter(Boolean) : [];
  return {
    ...payload,
    transactions,
    total_transactions: transactions.length,
  };
}

function comparePlaidTransactions(a, b) {
  const dateA = typeof a?.date === "string" ? a.date : "";
  const dateB = typeof b?.date === "string" ? b.date : "";
  if (dateA !== dateB) return dateB.localeCompare(dateA);
  const pendingA = a?.pending ? 1 : 0;
  const pendingB = b?.pending ? 1 : 0;
  if (pendingA !== pendingB) return pendingA - pendingB;
  const idA = a?.transaction_id || "";
  const idB = b?.transaction_id || "";
  return idA.localeCompare(idB);
}

export function mergePlaidTransactions(existingPayload, syncPayload) {
  const existing = normalizeStoredTransactionsPayload(existingPayload);
  const byId = new Map(
    existing.transactions
      .filter(transaction => transaction?.transaction_id)
      .map(transaction => [transaction.transaction_id, transaction])
  );

  for (const transaction of syncPayload?.added || []) {
    if (!transaction?.transaction_id) continue;
    byId.set(transaction.transaction_id, transaction);
  }

  for (const transaction of syncPayload?.modified || []) {
    if (!transaction?.transaction_id) continue;
    byId.set(transaction.transaction_id, transaction);
  }

  for (const transaction of syncPayload?.removed || []) {
    if (!transaction?.transaction_id) continue;
    byId.delete(transaction.transaction_id);
  }

  const transactions = [...byId.values()].sort(comparePlaidTransactions);
  return {
    transactions,
    total_transactions: transactions.length,
  };
}

async function fetchPlaidJson(plaidDomain, endpoint, env, body) {
  const plaidRes = await fetchWithTimeout(
    `${plaidDomain}${endpoint}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: env.PLAID_CLIENT_ID,
        secret: env.PLAID_SECRET,
        ...body,
      }),
    },
    PLAID_TIMEOUT_MS
  );

  if (!plaidRes.ok) {
    const errorText = await plaidRes.text().catch(() => "");
    throw new Error(`Plaid ${endpoint} failed (${plaidRes.status})${errorText ? `: ${errorText}` : ""}`);
  }

  return plaidRes.json();
}

async function getDbFirstResult(db, sql, params = []) {
  const { results } = await db.prepare(sql).bind(...params).all();
  return results?.[0] || null;
}

async function getStoredSyncRow(db, userId, itemId) {
  if (!db) return null;
  return getDbFirstResult(db, "SELECT * FROM sync_data WHERE user_id = ? AND item_id = ?", [userId, itemId]);
}

async function writeSyncRow(db, userId, itemId, updates = {}) {
  if (!db) return;

  const existing = (await getStoredSyncRow(db, userId, itemId)) || {};
  const balancesJson = updates.balancesJson ?? existing.balances_json ?? "{}";
  const liabilitiesJson = updates.liabilitiesJson ?? existing.liabilities_json ?? "{}";
  const transactionsJson = updates.transactionsJson ?? existing.transactions_json ?? "{}";

  await db.prepare(
    `INSERT INTO sync_data (user_id, item_id, balances_json, liabilities_json, transactions_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, item_id) DO UPDATE SET
       balances_json = excluded.balances_json,
       liabilities_json = excluded.liabilities_json,
       transactions_json = excluded.transactions_json,
       last_synced_at = CURRENT_TIMESTAMP`
  ).bind(userId, itemId, balancesJson, liabilitiesJson, transactionsJson).run();
}

export async function fetchAllPlaidTransactionsSync(plaidDomain, env, accessToken, initialCursor = null) {
  let cursor = initialCursor || null;
  let nextCursor = initialCursor || null;
  let hasMore = true;
  const aggregate = {
    added: [],
    modified: [],
    removed: [],
  };

  while (hasMore) {
    const response = await fetchPlaidJson(plaidDomain, "/transactions/sync", env, {
      access_token: accessToken,
      ...(cursor ? { cursor } : {}),
    });

    aggregate.added.push(...(response.added || []));
    aggregate.modified.push(...(response.modified || []));
    aggregate.removed.push(...(response.removed || []));
    nextCursor = response.next_cursor || nextCursor;
    hasMore = Boolean(response.has_more);
    cursor = nextCursor;
  }

  return {
    syncPayload: aggregate,
    nextCursor: nextCursor || initialCursor || null,
  };
}

async function syncTransactionsForItem({ db, userId, itemId, accessToken, plaidDomain, env }) {
  const itemRow = db ? await getDbFirstResult(db, "SELECT transactions_cursor FROM plaid_items WHERE item_id = ?", [itemId]) : null;
  const currentCursor = itemRow?.transactions_cursor || null;
  const existingSyncRow = db ? await getStoredSyncRow(db, userId, itemId) : null;
  const existingTransactions = normalizeStoredTransactionsPayload(parseStoredJson(existingSyncRow?.transactions_json, {}));
  const { syncPayload, nextCursor } = await fetchAllPlaidTransactionsSync(plaidDomain, env, accessToken, currentCursor);
  const mergedTransactions = mergePlaidTransactions(existingTransactions, syncPayload);

  if (db) {
    await writeSyncRow(db, userId, itemId, {
      transactionsJson: JSON.stringify(mergedTransactions),
    });
    await db.prepare(
      "UPDATE plaid_items SET transactions_cursor = ?, updated_at = CURRENT_TIMESTAMP WHERE item_id = ?"
    ).bind(nextCursor, itemId).run();
  }

  return {
    mergedTransactions,
    nextCursor,
  };
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
          gatingMode: getWorkerGatingMode(env),
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

    if (url.pathname === "/api/audit-log/outcome" && request.method === "POST") {
      if (!env.DB) {
        return new Response(JSON.stringify({ error: "DB not configured" }), {
          status: 500,
          headers: buildHeaders(cors, { "Content-Type": "application/json" }),
        });
      }

      const { auditLogId, parseSucceeded, hitDegradedFallback, confidence, driftWarning, driftDetails } = await request.json().catch(() => ({}));
      if (!auditLogId) {
        return new Response(JSON.stringify({ error: "Missing auditLogId" }), {
          status: 400,
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
              "INSERT OR REPLACE INTO plaid_items (item_id, user_id, access_token, transactions_cursor) VALUES (?, ?, ?, ?)"
            ).bind(plaidData.item_id, userId, plaidData.access_token, null).run();
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
          plaidEndpoint = "/accounts/get";
          plaidBody = {
            client_id: env.PLAID_CLIENT_ID,
            secret: env.PLAID_SECRET,
            access_token: reqBody.accessToken,
          };
        } else if (url.pathname === "/plaid/liabilities") {
          plaidEndpoint = "/liabilities/get";
          plaidBody = {
            client_id: env.PLAID_CLIENT_ID,
            secret: env.PLAID_SECRET,
            access_token: reqBody.accessToken,
          };
        } else if (url.pathname === "/plaid/disconnect") {
          let accessToken = reqBody.accessToken || "";
          const itemId = reqBody.itemId || "";

          if (!accessToken && itemId && env.DB) {
            const itemRow = await getDbFirstResult(env.DB, "SELECT user_id, access_token FROM plaid_items WHERE item_id = ?", [itemId]);
            accessToken = itemRow?.access_token || "";
            if (itemRow?.user_id) {
              await env.DB.prepare("DELETE FROM sync_data WHERE user_id = ? AND item_id = ?").bind(itemRow.user_id, itemId).run();
            }
            await env.DB.prepare("DELETE FROM plaid_items WHERE item_id = ?").bind(itemId).run();
          }

          if (!accessToken) {
            return new Response(JSON.stringify({ error: "Missing Plaid item reference" }), {
              status: 400,
              headers: buildHeaders(cors, { "Content-Type": "application/json" }),
            });
          }

          plaidEndpoint = "/item/remove";
          plaidBody = {
            client_id: env.PLAID_CLIENT_ID,
            secret: env.PLAID_SECRET,
            access_token: accessToken,
          };
        } else if (url.pathname === "/plaid/transactions") {
          const userId = reqBody.userId || "catalyst-user";
          const itemId =
            reqBody.itemId ||
            (await getDbFirstResult(env.DB, "SELECT item_id FROM plaid_items WHERE access_token = ?", [reqBody.accessToken]))?.item_id;

          if (!itemId) {
            const { syncPayload } = await fetchAllPlaidTransactionsSync(plaidDomain, env, reqBody.accessToken, null);
            return new Response(JSON.stringify(mergePlaidTransactions({ transactions: [] }, syncPayload)), {
              status: 200,
              headers: buildHeaders(cors, { "Content-Type": "application/json" }),
            });
          }

          const { mergedTransactions } = await syncTransactionsForItem({
            db: env.DB,
            userId,
            itemId,
            accessToken: reqBody.accessToken,
            plaidDomain,
            env,
          });

          return new Response(JSON.stringify(mergedTransactions), {
            status: 200,
            headers: buildHeaders(cors, { "Content-Type": "application/json" }),
          });
        } else if (url.pathname === "/plaid/webhook") {
          // ── Plaid Webhook Receiver ────────────────────────
          const webhookType = reqBody.webhook_type || "UNKNOWN";
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
              let tierId = "free";
              let lastSyncTime = 0;

              // We need to fetch the last sync time to calculate cooldown.
              const { results: syncResults } = await env.DB.prepare("SELECT last_synced_at FROM sync_data WHERE user_id = ?").bind(user_id).all();
              if (syncResults && syncResults.length > 0 && syncResults[0].last_synced_at) {
                // SQlite CURRENT_TIMESTAMP is UTC
                lastSyncTime = new Date(syncResults[0].last_synced_at + "Z").getTime();
              }

              // Heuristic tier fallback until Plaid item ownership is joined to verified entitlements.
              // In soft launch, gating remains intentionally unenforced and all users may sync.
              if (user_id === "catalyst-user" || user_id.includes("pro")) tierId = "pro";
              if (!isWorkerGatingEnforced(env)) tierId = "pro";

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
            ctx.waitUntil(performSync().catch(console.error));
          }

          return new Response(
            JSON.stringify({ received: true }),
            { status: 200, headers: buildHeaders(cors, { "Content-Type": "application/json" }) }
          );
        } else if (url.pathname === "/api/sync/force") {
          // Manually trigger a sync for a user, respecting the tier cooldown.
          if (request.method !== "POST") return new Response("{}", { status: 405 });
          const { userId } = reqBody;
          if (!env.DB) return new Response(JSON.stringify({ error: "DB not configured" }), { status: 500, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });

          let tierId = "free";
          if (userId === "catalyst-user" || (userId && userId.includes("pro"))) tierId = "pro";
          if (!isWorkerGatingEnforced(env)) tierId = "pro";

          if (isWorkerGatingEnforced(env) && tierId === "free") {
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
              // Manual sync: use free /accounts/get and rely on background product updates ($0.30/mo flat)
              const balances = await fetchPlaidJson(plaidDomain, "/accounts/get", env, {
                access_token,
              });

              await writeSyncRow(env.DB, userId || "catalyst-user", syncItemId || "default", {
                balancesJson: JSON.stringify(balances),
              });
              anySuccess = true;
            } catch (err) { console.error("[Manual Sync] Error syncing item", err); }
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
          const { userId: deepUserId } = reqBody;
          if (!env.DB) return new Response(JSON.stringify({ error: "DB not configured" }), { status: 500, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });

          let deepTierId = "free";
          if (deepUserId === "catalyst-user" || (deepUserId && deepUserId.includes("pro"))) deepTierId = "pro";

          if (isWorkerGatingEnforced(env) && deepTierId === "free") {
            return new Response(JSON.stringify({ error: "upgrade_required", message: "Deep sync is a Pro feature when live gating is enabled." }), { status: 403, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }

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
              const liabilities = await fetchPlaidJson(plaidDomain, "/liabilities/get", env, {
                access_token: dItem.access_token,
              });
              const { mergedTransactions } = await syncTransactionsForItem({
                db: env.DB,
                userId: deepUserId || "catalyst-user",
                itemId: dItem.item_id || "default",
                accessToken: dItem.access_token,
                plaidDomain,
                env,
              });

              await writeSyncRow(env.DB, deepUserId || "catalyst-user", dItem.item_id || "default", {
                liabilitiesJson: JSON.stringify(liabilities),
                transactionsJson: JSON.stringify(mergedTransactions),
              });
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

    // ─── Household Sync ──────────────────────────────────────
    if (url.pathname.startsWith("/api/household/")) {
      if (!env.DB) {
        return new Response(JSON.stringify({ error: "DB not configured" }), {
          status: 500,
          headers: buildHeaders(cors, { "Content-Type": "application/json" }),
        });
      }
      try {
        if (url.pathname === "/api/household/sync" && request.method === "POST") {
          const body = await request.json();
          const { householdId, encryptedBlob } = body;
          
          if (!householdId || !encryptedBlob) {
            return new Response(JSON.stringify({ error: "Missing householdId or encryptedBlob" }), { status: 400, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }
          
          await env.DB.prepare(
            `INSERT INTO household_sync (household_id, encrypted_blob, last_updated_at) 
             VALUES (?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(household_id) DO UPDATE SET 
             encrypted_blob=excluded.encrypted_blob, 
             last_updated_at=CURRENT_TIMESTAMP`
          ).bind(householdId, encryptedBlob).run();
          
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: buildHeaders(cors, { "Content-Type": "application/json" })
          });
        } else if (url.pathname === "/api/household/sync" && request.method === "GET") {
          const householdId = url.searchParams.get("householdId");
          if (!householdId) {
            return new Response(JSON.stringify({ error: "Missing householdId" }), { status: 400, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }
          
          const { results } = await env.DB.prepare("SELECT encrypted_blob, last_updated_at FROM household_sync WHERE household_id = ?").bind(householdId).all();
          if (!results || results.length === 0) {
            return new Response(JSON.stringify({ hasData: false }), { status: 200, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }
          
          return new Response(JSON.stringify({
            hasData: true,
            encryptedBlob: results[0].encrypted_blob,
            lastUpdatedAt: results[0].last_updated_at
          }), { status: 200, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
        }
      } catch (err) {
        return new Response(JSON.stringify({ error: "Household sync error", details: err.message }), { status: 500, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
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

    // ─── Telemetry: Client Error Reports ────────────────────
    if (url.pathname === "/api/v1/telemetry/errors" && request.method === "POST") {
      try {
        const payload = await request.json();
        // Validate shape — accept only expected fields, drop everything else
        const entry = {
          timestamp: typeof payload.timestamp === "string" ? payload.timestamp.slice(0, 30) : new Date().toISOString(),
          component: String(payload.component || "unknown").slice(0, 100),
          action: String(payload.action || "").slice(0, 200),
          message: String(payload.message || "").slice(0, 2000),
          stack: String(payload.stack || "").slice(0, 4000),
          userAgent: String(payload.userAgent || "").slice(0, 200),
        };
        // Log to Worker analytics (visible in Cloudflare dashboard Tail logs)
        console.error("[telemetry]", JSON.stringify(entry));
      } catch { /* discard malformed payloads silently */ }
      // Always 204 — never leak info back to client, never block the app
      return new Response(null, { status: 204, headers: buildHeaders(cors) });
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
    const resolvedSystemPrompt = systemPrompt || buildSystemPrompt(type || (isChat ? "chat" : "audit"), context || {}, selectedProvider);

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
      const message = err?.name === "AbortError" ? "Upstream provider timed out" : err.message || "Proxy error";
      return new Response(JSON.stringify({ error: message }), {
        status: 502,
        headers: buildHeaders(cors, { "Content-Type": "application/json", ...tierHeaders }),
      });
    }
  },
};
