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
  createIdentityChallenge,
  completeIdentityChallenge,
  rotateIdentityDeviceKey,
  resolveAuthenticatedActor,
} from "./lib/identitySession.js";
import { getQuotaWindow, getModelQuotaWindow, getAuditModelQuotaWindow } from "./lib/quota.js";
import { buildHeaders, corsHeaders, fetchWithTimeout } from "./lib/http.js";
import {
  DEFAULTS,
  VALID_PROVIDERS,
  getProviderHandler,
} from "./lib/providerClients.js";
import {
  resolveEffectiveTier,
  resolveStoredUserTier,
  resolveVerifiedRevenueCatAppUserId,
} from "./lib/revenueCat.js";
import {
  fetchPlaidJson,
  getDbFirstResult,
  getStoredSyncRow,
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
  createIdentityChallenge,
  completeIdentityChallenge,
  rotateIdentityDeviceKey,
  resolveAuthenticatedActor as resolvePlaidActor,
} from "./lib/identitySession.js";
export { issueIdentitySessionToken } from "./lib/identitySession.js";
export { verifyIdentitySessionToken } from "./lib/identitySession.js";
export { getIsoWeekKey, getQuotaWindow, getModelQuotaWindow, getAuditModelQuotaWindow, isRevenueCatEntitlementActive } from "./lib/quota.js";
export { mergePlaidTransactions } from "./lib/plaidSync.js";
export { resolveEffectiveTier } from "./lib/revenueCat.js";

const MAX_BODY_SIZE = 512_000; // 512KB max request body (rich audit prompt is now ~60KB before snapshot/history)
const PLAID_ENV = "production"; // "sandbox", "development", or "production"
const PLAID_TIMEOUT_MS = 15_000;
const MARKET_TIMEOUT_MS = 10_000;
const PLAID_INSTITUTION_LIMITS = {
  free: 1,
  pro: 6,
};
const PLAID_LINK_TOKEN_COOLDOWN_MS = 15_000;
const PLAID_EXCHANGE_COOLDOWN_MS = 30_000;
const PLAID_DIRECT_FETCH_COOLDOWNS = {
  free: 7 * 24 * 60 * 60 * 1000,
  pro: 24 * 60 * 60 * 1000,
};
const MODEL_ALLOWLIST = {
  free: new Set(["gemini-2.5-flash"]),
  pro: new Set([
    "gemini-2.5-flash",
    "gpt-4.1",
    "o3",
  ]),
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

function parseStoredJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getLatestTimestampMillis(rows = [], allowedItemIds = null) {
  const allowed = allowedItemIds instanceof Set ? allowedItemIds : null;
  let latest = 0;
  for (const row of rows || []) {
    if (allowed && !allowed.has(row?.item_id)) continue;
    if (String(row?.item_id || "").startsWith("_plaid_meta:")) continue;
    if (row?.item_id === "deep_sync_meta") continue;
    if (!row?.last_synced_at) continue;
    const timestamp = new Date(`${row.last_synced_at}Z`).getTime();
    if (Number.isFinite(timestamp) && timestamp > latest) latest = timestamp;
  }
  return latest;
}

function getPlaidActionMetaItemId(action, scope = "global") {
  return `_plaid_meta:${action}:${scope}`;
}

async function getPlaidActionTimestamp(db, userId, action, scope = "global") {
  if (!db) return 0;
  const row = await getStoredSyncRow(db, userId, getPlaidActionMetaItemId(action, scope));
  if (!row?.last_synced_at) return 0;
  const timestamp = new Date(`${row.last_synced_at}Z`).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

async function markPlaidAction(db, userId, action, scope = "global") {
  if (!db) return;
  await writeSyncRow(db, userId, getPlaidActionMetaItemId(action, scope), {
    balancesJson: "{}",
    liabilitiesJson: "{}",
    transactionsJson: "{}",
  });
}

async function buildPlaidCooldownResponse({
  db,
  userId,
  action,
  scope = "global",
  cooldownMs,
  message,
  cors,
  extra = {},
}) {
  const lastActionAt = await getPlaidActionTimestamp(db, userId, action, scope);
  if (!lastActionAt || (Date.now() - lastActionAt) >= cooldownMs) return null;
  const retryAfterMs = Math.max(0, cooldownMs - (Date.now() - lastActionAt));
  return new Response(
    JSON.stringify({
      error: "cooldown",
      message,
      retryAfterMs,
      ...extra,
    }),
    {
      status: 429,
      headers: buildHeaders(cors, { "Content-Type": "application/json" }),
    }
  );
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
      context.chatInputRisk || null,
      context.budgetContext || null
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
    context.memoryBlock || "",
    context
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
  return env.GATING_MODE || "soft";
}

function isWorkerGatingEnforced(env) {
  return getWorkerGatingMode(env) === "live";
}

function isPlaidCostTierEnforced(env) {
  return isWorkerGatingEnforced(env);
}

function getPlaidCostTierId(tierResolution, env) {
  return isPlaidCostTierEnforced(env) ? tierResolution.tier : "pro";
}

function getPlaidCooldownMs(env, cooldowns, tierId) {
  if (!isPlaidCostTierEnforced(env)) return 0;
  return cooldowns[tierId] || cooldowns.free;
}

function getDefaultModelForTier(provider, tier) {
  if (provider === "openai") return tier === "pro" ? "gpt-4.1" : DEFAULTS.gemini;
  if (provider === "gemini") return "gemini-2.5-flash";
  if (provider === "anthropic" || provider === "claude") return tier === "pro" ? "claude-haiku-4-5" : DEFAULTS.gemini;
  return DEFAULTS[provider] || DEFAULTS.gemini;
}

function isModelAllowedForTier(model, tier) {
  return MODEL_ALLOWLIST[tier]?.has(model);
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

/**
 * Scrubs PII patterns from AI response text before logging to D1.
 * Covers: account/routing numbers, SSN-shaped strings, all dollar-amount
 * variants (with or without cents, with or without commas, negative), and
 * bare 2-decimal floats that could be a specific balance.
 * Truncates to 600 chars after scrubbing.
 * This backs the privacy policy claim that the logged excerpt
 * "never contains account numbers or balances."
 */
function trimResponsePreview(text) {
  let s = String(text || "");
  // Account / routing numbers: 8-17 consecutive digits
  s = s.replace(/\b\d{8,17}\b/g, "[redacted]");
  // SSN-shaped: 3-2-4 with dashes or spaces
  s = s.replace(/\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g, "[redacted]");
  // Dollar sign followed by any digit string (with optional commas/decimals)
  // e.g. $150, $3,200, $3,200.00, -$150
  s = s.replace(/-?\$[\d,]+(?:\.\d+)?\b/g, "$[amount]");
  // Bare comma-formatted numbers e.g. 3,200.00 or 3,200
  s = s.replace(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g, "[amount]");
  // Bare 2-decimal floats that look like dollar amounts e.g. 3200.00, 150.00
  // Must be ≥ 3 digits before decimal to avoid clobbering "1.50 hours" style text
  s = s.replace(/\b\d{3,}\.\d{2}\b/g, "[amount]");
  return s.slice(0, 600);
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
      resolveAuthenticatedActor,
      resolveVerifiedRevenueCatAppUserId,
      createIdentityChallenge,
      completeIdentityChallenge,
      rotateIdentityDeviceKey,
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
          const linkTokenCooldownResponse = await buildPlaidCooldownResponse({
            db: env.DB,
            userId: plaidActor.userId,
            action: "link-token",
            cooldownMs: PLAID_LINK_TOKEN_COOLDOWN_MS,
            message: "Please wait a moment before starting another Plaid connection flow.",
            cors,
          });
          if (linkTokenCooldownResponse) return linkTokenCooldownResponse;

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
          await markPlaidAction(env.DB, plaidActor.userId, "link-token");
          return new Response(JSON.stringify({ link_token: plaidData.link_token }), {
            status: 200,
            headers: buildHeaders(cors, { "Content-Type": "application/json" }),
          });
        } else if (url.pathname === "/plaid/exchange") {
          const tierResolution = await resolveEffectiveTier(request, env, plaidActor);
          const tierId = getPlaidCostTierId(tierResolution, env);
          const replaceItemId = String(reqBody.replaceItemId || "").trim();
          const exchangeCooldownResponse = await buildPlaidCooldownResponse({
            db: env.DB,
            userId: plaidActor.userId,
            action: "exchange",
            scope: replaceItemId || "global",
            cooldownMs: PLAID_EXCHANGE_COOLDOWN_MS,
            message: "Please wait a moment before trying to connect or reconnect this bank again.",
            cors,
          });
          if (exchangeCooldownResponse) return exchangeCooldownResponse;

          const { results: existingItems } = await env.DB.prepare(
            "SELECT access_token, item_id FROM plaid_items WHERE user_id = ?"
          ).bind(plaidActor.userId).all();
          const replacementItem = replaceItemId
            ? await getDbFirstResult(
                env.DB,
                "SELECT user_id, access_token FROM plaid_items WHERE item_id = ? AND user_id = ?",
                [replaceItemId, plaidActor.userId]
              )
            : null;
          const existingCount = Math.max(0, (existingItems?.length || 0) - (replacementItem ? 1 : 0));
          const institutionLimit = PLAID_INSTITUTION_LIMITS[tierId] || PLAID_INSTITUTION_LIMITS.free;

          if (existingCount >= institutionLimit) {
            return new Response(
              JSON.stringify({
                error: "institution_limit",
                message: `Your ${tierId === "pro" ? "Pro" : "Free"} plan allows up to ${institutionLimit} Plaid institution${institutionLimit === 1 ? "" : "s"}.`,
              }),
              {
                status: 403,
                headers: buildHeaders(cors, { "Content-Type": "application/json" }),
              }
            );
          }

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
            if (replacementItem?.access_token) {
              try {
                await fetchPlaidJson(plaidDomain, "/item/remove", env, {
                  access_token: replacementItem.access_token,
                });
              } catch (removeErr) {
                workerLog(env, "warn", "plaid-proxy", "Failed to revoke replaced Plaid item", {
                  error: removeErr,
                  replaceItemId,
                });
              }
            }
            if (replaceItemId && replaceItemId !== plaidData.item_id) {
              await env.DB.prepare("DELETE FROM sync_data WHERE user_id = ? AND item_id = ?").bind(plaidActor.userId, replaceItemId).run();
              await env.DB.prepare("DELETE FROM plaid_items WHERE item_id = ? AND user_id = ?").bind(replaceItemId, plaidActor.userId).run();
            }
            await env.DB.prepare(
              "INSERT OR REPLACE INTO plaid_items (item_id, user_id, access_token, transactions_cursor) VALUES (?, ?, ?, ?)"
            ).bind(plaidData.item_id, plaidActor.userId, plaidData.access_token, null).run();
          }
          await markPlaidAction(env.DB, plaidActor.userId, "exchange", replaceItemId || "global");

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
          const tierResolution = await resolveEffectiveTier(request, env, plaidActor);
          const tierId = getPlaidCostTierId(tierResolution, env);
          let accessToken = reqBody.accessToken || "";
          let itemId = String(reqBody.itemId || "").trim();
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
              "SELECT access_token FROM plaid_items WHERE item_id = ? AND user_id = ?",
              [itemId, plaidActor.userId]
            );
            accessToken = itemRow?.access_token || "";
          }
          if (!accessToken) {
            return new Response(JSON.stringify({ error: "Plaid item not found for actor" }), {
              status: 404,
              headers: buildHeaders(cors, { "Content-Type": "application/json" }),
            });
          }
          if (!itemId && env.DB) {
            itemId = (
              await getDbFirstResult(
                env.DB,
                "SELECT item_id FROM plaid_items WHERE access_token = ? AND user_id = ?",
                [accessToken, plaidActor.userId]
              )
            )?.item_id || "";
          }
          const cachedBalancesRow = itemId ? await getStoredSyncRow(env.DB, plaidActor.userId, itemId) : null;
          const cachedBalancesPayload = parseStoredJson(cachedBalancesRow?.balances_json, {});
          const directFetchCooldownMs = getPlaidCooldownMs(env, PLAID_DIRECT_FETCH_COOLDOWNS, tierId);
          const directBalancesTimestamp = cachedBalancesRow?.last_synced_at
            ? new Date(`${cachedBalancesRow.last_synced_at}Z`).getTime()
            : 0;
          if (cachedBalancesPayload?.accounts?.length && directBalancesTimestamp > 0 && (Date.now() - directBalancesTimestamp) < directFetchCooldownMs) {
            return new Response(JSON.stringify(cachedBalancesPayload), {
              status: 200,
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
          if (itemId) {
            await writeSyncRow(env.DB, plaidActor.userId, itemId, {
              balancesJson: JSON.stringify(plaidData),
            });
          }
          return new Response(JSON.stringify(plaidData), {
            status: 200,
            headers: buildHeaders(cors, { "Content-Type": "application/json" }),
          });
        } else if (url.pathname === "/plaid/liabilities") {
          const tierResolution = await resolveEffectiveTier(request, env, plaidActor);
          const tierId = getPlaidCostTierId(tierResolution, env);
          let accessToken = reqBody.accessToken || "";
          let itemId = String(reqBody.itemId || "").trim();
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
              "SELECT access_token FROM plaid_items WHERE item_id = ? AND user_id = ?",
              [itemId, plaidActor.userId]
            );
            accessToken = itemRow?.access_token || "";
          }
          if (!accessToken) {
            return new Response(JSON.stringify({ error: "Plaid item not found for actor" }), {
              status: 404,
              headers: buildHeaders(cors, { "Content-Type": "application/json" }),
            });
          }
          if (!itemId && env.DB) {
            itemId = (
              await getDbFirstResult(
                env.DB,
                "SELECT item_id FROM plaid_items WHERE access_token = ? AND user_id = ?",
                [accessToken, plaidActor.userId]
              )
            )?.item_id || "";
          }
          const cachedLiabilitiesRow = itemId ? await getStoredSyncRow(env.DB, plaidActor.userId, itemId) : null;
          const cachedLiabilitiesPayload = parseStoredJson(cachedLiabilitiesRow?.liabilities_json, {});
          const directFetchCooldownMs = getPlaidCooldownMs(env, PLAID_DIRECT_FETCH_COOLDOWNS, tierId);
          const directLiabilitiesTimestamp = cachedLiabilitiesRow?.last_synced_at
            ? new Date(`${cachedLiabilitiesRow.last_synced_at}Z`).getTime()
            : 0;
          if (cachedLiabilitiesPayload?.liabilities && directLiabilitiesTimestamp > 0 && (Date.now() - directLiabilitiesTimestamp) < directFetchCooldownMs) {
            return new Response(JSON.stringify(cachedLiabilitiesPayload), {
              status: 200,
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
          if (itemId) {
            await writeSyncRow(env.DB, plaidActor.userId, itemId, {
              liabilitiesJson: JSON.stringify(plaidData),
            });
          }
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
          const tierResolution = await resolveEffectiveTier(request, env, plaidActor);
          const tierId = getPlaidCostTierId(tierResolution, env);
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
          const cachedTransactionsRow = await getStoredSyncRow(env.DB, plaidActor.userId, itemId);
          const cachedTransactionsPayload = parseStoredJson(cachedTransactionsRow?.transactions_json, {});
          const directFetchCooldownMs = getPlaidCooldownMs(env, PLAID_DIRECT_FETCH_COOLDOWNS, tierId);
          const directTransactionsTimestamp = cachedTransactionsRow?.last_synced_at
            ? new Date(`${cachedTransactionsRow.last_synced_at}Z`).getTime()
            : 0;
          if (Array.isArray(cachedTransactionsPayload?.transactions) && cachedTransactionsPayload.transactions.length > 0) {
            if (tierId === "free") {
              return new Response(JSON.stringify(cachedTransactionsPayload), {
                status: 200,
                headers: buildHeaders(cors, { "Content-Type": "application/json" }),
              });
            }
            if (directTransactionsTimestamp > 0 && (Date.now() - directTransactionsTimestamp) < directFetchCooldownMs) {
              return new Response(JSON.stringify(cachedTransactionsPayload), {
                status: 200,
                headers: buildHeaders(cors, { "Content-Type": "application/json" }),
              });
            }
          }
          if (tierId === "free") {
            return new Response(JSON.stringify({
              error: "upgrade_required",
              message: "Use the cached ledger on Free, or upgrade for additional live Plaid transaction refreshes.",
            }), {
              status: 403,
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
              const tierId = await resolveStoredUserTier(user_id, env, {
                isWorkerGatingEnforced: isPlaidCostTierEnforced,
              });
              if (tierId === "free") {
                // Free users: manual sync only — ignore webhook
                return; // Completely ignore webhooks for free users
              }

              // Item-level cooldown (48h per institution for Pro)
              const ITEM_COOLDOWN = isPlaidCostTierEnforced(env) ? 48 * 60 * 60 * 1000 : 0; // 48 hours
              const { results: itemSyncResults } = await env.DB.prepare("SELECT last_synced_at FROM sync_data WHERE user_id = ? AND item_id = ?").bind(user_id, itemId).all();
              let itemLastSync = 0;
              if (itemSyncResults && itemSyncResults.length > 0 && itemSyncResults[0].last_synced_at) {
                itemLastSync = new Date(itemSyncResults[0].last_synced_at + "Z").getTime();
              }
              const now = Date.now();
              if (ITEM_COOLDOWN > 0 && itemLastSync > 0 && (now - itemLastSync) < ITEM_COOLDOWN) {
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
          const requestBody = reqBody && typeof reqBody === "object" ? reqBody : {};
          const tierResolution = await resolveEffectiveTier(request, env, plaidActor);
          const tierId = getPlaidCostTierId(tierResolution, env);

          const { results: syncResults } = await env.DB.prepare("SELECT * FROM sync_data WHERE user_id = ?").bind(plaidActor.userId).all();
          let lastSyncTime = 0;

          const COOLDOWNS = {
            free: 7 * 24 * 60 * 60 * 1000,
            pro: 24 * 60 * 60 * 1000,
          };
          const cooldownMs = getPlaidCooldownMs(env, COOLDOWNS, tierId);

          const { results: itemResults } = await env.DB.prepare("SELECT access_token, item_id FROM plaid_items WHERE user_id = ?").bind(plaidActor.userId).all();
          if (!itemResults || itemResults.length === 0) {
            return new Response(JSON.stringify({ error: "No plaid items found" }), { status: 404, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }

          let targetItems = itemResults;
          let limitedToItemId = null;
          const requestedItemId = String(requestBody?.connectionId || "").trim();
          const matchedRequestedItem = requestedItemId
            ? itemResults.find(item => String(item.item_id || "") === requestedItemId)
            : null;

          if (matchedRequestedItem) {
            targetItems = [matchedRequestedItem];
            limitedToItemId = matchedRequestedItem.item_id || "default";
          }

          if (tierId === "free") {
            const selectedItem = matchedRequestedItem || itemResults[0];
            if (!selectedItem) {
              return new Response(JSON.stringify({ error: "No plaid items found" }), { status: 404, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
            }
            targetItems = [selectedItem];
            limitedToItemId = selectedItem.item_id || "default";
          }
          const targetedItemIds = new Set(targetItems.map(item => item.item_id || "default"));
          lastSyncTime = getLatestTimestampMillis(syncResults || [], targetedItemIds);

          const now = Date.now();
          if (cooldownMs > 0 && lastSyncTime > 0 && (now - lastSyncTime) < cooldownMs) {
            return new Response(JSON.stringify({ error: "cooldown", message: "Cooldown active", cooldownMs, tier: tierId, limitedToItemId }), { status: 429, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }

          let anySuccess = false;
          for (const item of targetItems) {
            const { access_token, item_id: syncItemId } = item;
            try {
              // Manual sync should complete before we return so the client can read fresh data immediately.
              const balances = await fetchPlaidJson(plaidDomain, "/accounts/get", env, {
                access_token,
              });

              await writeSyncRow(env.DB, plaidActor.userId, syncItemId || "default", {
                balancesJson: JSON.stringify(balances),
              });
              anySuccess = true;

              try {
                const { mergedTransactions } = await syncTransactionsForItem({
                  db: env.DB,
                  userId: plaidActor.userId,
                  itemId: syncItemId || "default",
                  accessToken: access_token,
                  plaidDomain,
                  env,
                });

                await writeSyncRow(env.DB, plaidActor.userId, syncItemId || "default", {
                  balancesJson: JSON.stringify(balances),
                  transactionsJson: JSON.stringify(mergedTransactions),
                });
              } catch (transactionErr) {
                workerLog(env, "warn", "plaid-sync", "Manual sync transactions failed; balances were still cached", {
                  error: transactionErr,
                  itemId: syncItemId || "default",
                });
              }
            } catch (err) {
              workerLog(env, "warn", "plaid-sync", "Manual sync item failed", {
                error: err,
                itemId: syncItemId || "default",
              });
            }
          }

          if (anySuccess) {
            return new Response(JSON.stringify({
              success: true,
              syncedItemIds: targetItems.map(item => item.item_id || "default"),
              limitedToItemId,
            }), { status: 200, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          } else {
            return new Response(JSON.stringify({ error: "Failed to sync items" }), { status: 500, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }
        } else if (url.pathname === "/api/sync/deep") {
          // On-demand deep sync: fetch transactions + liabilities.
          // Deep sync is intentionally paid-only under live gating because Plaid usage is the primary marginal cost.
          if (request.method !== "POST") return new Response("{}", { status: 405 });
          if (!env.DB) return new Response(JSON.stringify({ error: "DB not configured" }), { status: 500, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          const tierResolution = await resolveEffectiveTier(request, env, plaidActor);
          const deepTierId = getPlaidCostTierId(tierResolution, env);

          if (deepTierId === "free") {
            return new Response(JSON.stringify({ error: "upgrade_required", message: "Deep sync is a Pro feature." }), { status: 403, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }

          const { results: deepSyncResults } = await env.DB.prepare("SELECT last_synced_at FROM sync_data WHERE user_id = ? AND item_id = 'deep_sync_meta'").bind(plaidActor.userId).all();
          let lastDeepSync = 0;
          if (deepSyncResults && deepSyncResults.length > 0 && deepSyncResults[0].last_synced_at) {
            lastDeepSync = new Date(deepSyncResults[0].last_synced_at + "Z").getTime();
          }
          const DEEP_COOLDOWN = isPlaidCostTierEnforced(env) ? 7 * 24 * 60 * 60 * 1000 : 0;
          if (DEEP_COOLDOWN > 0 && lastDeepSync > 0 && (Date.now() - lastDeepSync) < DEEP_COOLDOWN) {
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

          const aggregatePayload = (rows, key) => {
            const aggregated = {};
            for (const row of rows) {
              try {
                const parsed = JSON.parse(row?.[key] || "{}");
                if (!parsed || typeof parsed !== "object") continue;

                if (Array.isArray(parsed.accounts)) {
                  aggregated.accounts = [...(aggregated.accounts || []), ...parsed.accounts];
                }

                if (Array.isArray(parsed.transactions)) {
                  aggregated.transactions = [...(aggregated.transactions || []), ...parsed.transactions];
                  aggregated.total_transactions =
                    Number(aggregated.total_transactions || 0) + Number(parsed.total_transactions || parsed.transactions.length || 0);
                }

                const liabilities = parsed.liabilities;
                if (liabilities && typeof liabilities === "object") {
                  aggregated.liabilities = aggregated.liabilities || {};
                  for (const [liabilityKey, liabilityValue] of Object.entries(liabilities)) {
                    if (Array.isArray(liabilityValue)) {
                      aggregated.liabilities[liabilityKey] = [
                        ...(aggregated.liabilities[liabilityKey] || []),
                        ...liabilityValue,
                      ];
                    } else {
                      aggregated.liabilities[liabilityKey] = liabilityValue;
                    }
                  }
                }
              } catch {
                // Ignore malformed cached payloads for individual items.
              }
            }
            return aggregated;
          };

          const latestSyncedAt = [...results]
            .map(result => result?.last_synced_at)
            .filter(Boolean)
            .sort()
            .at(-1) || null;

          return new Response(JSON.stringify({
            hasData: true,
            last_synced_at: latestSyncedAt,
            balances: aggregatePayload(results, "balances_json"),
            liabilities: aggregatePayload(results, "liabilities_json"),
            transactions: aggregatePayload(results, "transactions_json"),
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
      resolveAuthenticatedActor,
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

    // ─── Per-Model Rate Limit (Pro only) ──────────────────
    const modelQuota = isChat ? getModelQuotaWindow(subscriptionTier, body.model || "") : null;
    if (modelQuota) {
      const modelLimitName = `${subscriptionTier}-${deviceId}-chat-${modelQuota.modelId}`;
      const modelId = env.RATE_LIMITER?.idFromName(modelLimitName);
      if (modelId) {
        const modelStub = env.RATE_LIMITER.get(modelId);
        const modelRes = await modelStub.fetch(`http://internal/?periodKey=${encodeURIComponent(modelQuota.periodKey)}&commit=false`);
        const { count: modelCount } = await modelRes.json();
        if (modelCount >= modelQuota.limit) {
          const modelRetryAfter = Math.max(1, Math.ceil((modelQuota.resetAt.getTime() - Date.now()) / 1000));
          return new Response(
            JSON.stringify({
              error: `Daily ${modelQuota.modelId} limit reached (${modelQuota.limit}/day). Try a different AI model.`,
              modelCapReached: modelQuota.modelId,
              retryAfter: modelRetryAfter,
            }),
            {
              status: 429,
              headers: buildHeaders(cors, {
                "Content-Type": "application/json",
                "Retry-After": String(modelRetryAfter),
                ...tierHeaders,
              }),
            }
          );
        }
      }
    }

    // ─── Per-Model Audit Rate Limit (Pro only) ───────────────
    const auditModelQuota = !isChat ? getAuditModelQuotaWindow(subscriptionTier, body.model || "") : null;
    if (auditModelQuota && env.RATE_LIMITER) {
      const auditModelLimitName = `${subscriptionTier}-${deviceId}-audit-${auditModelQuota.modelId}`;
      const amId = env.RATE_LIMITER.idFromName(auditModelLimitName);
      const amStub = env.RATE_LIMITER.get(amId);
      const amRes = await amStub.fetch(`http://internal/?periodKey=${encodeURIComponent(auditModelQuota.periodKey)}&commit=false`);
      const { count: auditModelCount } = await amRes.json();
      if (auditModelCount >= auditModelQuota.limit) {
        const amRetryAfter = Math.max(1, Math.ceil((auditModelQuota.resetAt.getTime() - Date.now()) / 1000));
        return new Response(
          JSON.stringify({
            error: `Monthly ${auditModelQuota.modelId} audit limit reached (${auditModelQuota.limit}/mo). Switch AI model or wait until next month.`,
            auditModelCapReached: auditModelQuota.modelId,
            retryAfter: amRetryAfter,
          }),
          {
            status: 429,
            headers: buildHeaders(cors, {
              "Content-Type": "application/json",
              "Retry-After": String(amRetryAfter),
              ...tierHeaders,
            }),
          }
        );
      }
    }

    const { snapshot, systemPrompt, context, type, history, model, stream, provider, responseFormat } = body;
    const resolvedType = type || (isChat ? "chat" : "audit");

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
    // o3 is a Pro reasoning model — remap chat requests to gpt-4.1 to keep costs bounded.
    // Audit (one-shot) requests are allowed to use o3 directly when explicitly set.
    if (resolvedModel === "o3" && isChat) {
      resolvedModel = "gpt-4.1";
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

      // Commit per-model rate limit (Pro only — chat model)
      if (modelQuota && env.RATE_LIMITER) {
        const modelLimitName = `${subscriptionTier}-${deviceId}-chat-${modelQuota.modelId}`;
        const mId = env.RATE_LIMITER.idFromName(modelLimitName);
        const mStub = env.RATE_LIMITER.get(mId);
        await mStub.fetch(`http://internal/?periodKey=${encodeURIComponent(modelQuota.periodKey)}&commit=true`);
      }

      // Commit per-model audit quota (Pro only — audit model, monthly)
      if (auditModelQuota && env.RATE_LIMITER) {
        const auditModelLimitName = `${subscriptionTier}-${deviceId}-audit-${auditModelQuota.modelId}`;
        const amId = env.RATE_LIMITER.idFromName(auditModelLimitName);
        const amStub = env.RATE_LIMITER.get(amId);
        await amStub.fetch(`http://internal/?periodKey=${encodeURIComponent(auditModelQuota.periodKey)}&commit=true`);
      }

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
