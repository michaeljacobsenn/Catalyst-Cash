  import { APP_VERSION } from "./constants.js";
  import { getBackendUrl } from "./backendUrl.js";
  import { fetchWithRetry } from "./fetchWithRetry.js";
  import { log } from "./logger.js";
  import { getBackendProvider } from "./providers.js";
  import { getRevenueCatAppUserId } from "./revenuecat.js";
  import { getOrCreateDeviceId,isGatingEnforced,isPro } from "./subscription.js";
  import { db } from "./utils.js";

export { getBackendUrl } from "./backendUrl.js";

let _rateLimitCallback = null;
let _lastAuditLogId = null;
export function onRateLimitUpdate(cb) {
  _rateLimitCallback = cb;
}

export function consumeLastAuditLogId() {
  const logId = _lastAuditLogId;
  _lastAuditLogId = null;
  return logId;
}

function emitRateLimit(res, isChat) {
  if (!_rateLimitCallback) return;
  const remaining = res.headers.get("X-RateLimit-Remaining");
  const limit = res.headers.get("X-RateLimit-Limit");
  if (remaining != null) {
    _rateLimitCallback({
      remaining: parseInt(remaining, 10),
      limit: limit ? parseInt(limit, 10) : null,
      isChat,
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// BACKEND MODE — Cloudflare Worker Proxy
// ═══════════════════════════════════════════════════════════════

/**
 * Extract text from any provider's SSE chunk.
 * The worker may forward chunks from Claude, OpenAI, or Gemini.
 */
function extractSSEText(parsed) {
  if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
    return parsed.delta.text || "";
  }
  if (parsed.choices?.[0]?.delta?.content) {
    return parsed.choices[0].delta.content;
  }
  if (parsed.candidates?.[0]?.content?.parts?.[0]?.text) {
    return parsed.candidates[0].content.parts[0].text;
  }
  return "";
}

async function buildBackendHeaders(deviceId) {
  const tier = (await isPro()) ? "pro" : "free";
  const headers = {
    "Content-Type": "application/json",
    "X-Device-ID": deviceId || "unknown",
    "X-App-Version": APP_VERSION,
    "X-Subscription-Tier": tier,
  };
  const revenueCatAppUserId = await getRevenueCatAppUserId().catch(() => null);
  if (revenueCatAppUserId) {
    headers["X-RC-App-User-ID"] = revenueCatAppUserId;
  }
  if (!isGatingEnforced()) {
    headers["X-Catalyst-Testing"] = "1";
  }
  return headers;
}

function resolveProvider(model, fallbackProvider) {
  const normalizedModel = String(model || "").toLowerCase();
  const normalizedFallback = String(fallbackProvider || "").toLowerCase();

  if (normalizedModel.includes("claude")) {
    return "anthropic";
  }
  if (
    normalizedModel.includes("gpt") ||
    normalizedModel.includes("o3") ||
    normalizedModel.includes("o1") ||
    normalizedModel.includes("o4")
  ) {
    return "openai";
  }
  return normalizedFallback || "gemini";
}

async function* streamBackend(snapshot, model, context, history, deviceId, backendProvider, signal, responseFormat, requestType = "audit") {
  const resolvedProvider = resolveProvider(model, backendProvider);

  const res = await fetch(`${getBackendUrl()}/audit`, {
    method: "POST",
    headers: await buildBackendHeaders(deviceId),
    body: JSON.stringify({
      type: requestType,
      context,
      snapshot,
      history: history || [],
      model,
      stream: true,
      provider: resolvedProvider,
      responseFormat: responseFormat || "json",
    }),
    signal,
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    if (res.status === 429) {
      log.warn("audit", "Rate limit reached", { status: 429, modelCapReached: e.modelCapReached || null, auditModelCapReached: e.auditModelCapReached || null });
      emitRateLimit(res, responseFormat === "text");
      if (e.modelCapReached) {
        const err = new Error(e.error || `Daily ${e.modelCapReached} limit reached. Try a different AI model.`);
        err.modelCapReached = e.modelCapReached;
        throw err;
      }
      if (e.auditModelCapReached) {
        const err = new Error(e.error || `Monthly ${e.auditModelCapReached} audit limit reached. Switch AI model.`);
        err.auditModelCapReached = e.auditModelCapReached;
        throw err;
      }
      const retryAfter = res.headers.get("Retry-After");
      const msg = retryAfter
        ? `Audit limit reached. Try again in ${retryAfter} seconds.`
        : e.error || "Daily audit limit reached. Try again later!";
      throw new Error(msg);
    }
    log.error("audit", "Backend error", { status: res.status });
    throw new Error(e.error || `Backend error: HTTP ${res.status}`);
  }

  _lastAuditLogId = res.headers.get("X-Audit-Log-ID") || null;
  emitRateLimit(res, responseFormat === "text");

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const d = line.slice(6).trim();
        if (!d || d === "[DONE]") continue;
        try {
          const parsed = JSON.parse(d);
          const text = extractSSEText(parsed);
          if (text) yield text;
        } catch {
          // Don't log chunk content — may contain partial financial data
          log.warn("api", "Backend SSE parse error — skipping malformed chunk");
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

async function callBackend(
  snapshot,
  model,
  context,
  history,
  deviceId,
  backendProvider,
  responseFormat,
  requestType = "audit",
  signal,
  retryOptions = {}
) {
  const resolvedProvider = resolveProvider(model, backendProvider);
  const requestInit = {
    method: "POST",
    headers: await buildBackendHeaders(deviceId),
    body: JSON.stringify({
      type: requestType,
      context,
      snapshot,
      history: history || [],
      model,
      stream: false,
      provider: resolvedProvider,
      responseFormat: responseFormat || "json",
    }),
    signal,
  };
  const res = retryOptions?.maxRetries === 0
    ? await fetch(`${getBackendUrl()}/audit`, requestInit)
    : await fetchWithRetry(`${getBackendUrl()}/audit`, requestInit, retryOptions);

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    if (res.status === 429) {
      emitRateLimit(res, responseFormat === "text");
      const retryAfter = res.headers.get("Retry-After");
      const msg = retryAfter
        ? `Audit limit reached. Try again in ${retryAfter} seconds.`
        : e.error || "Daily audit limit reached. Try again later!";
      throw new Error(msg);
    }
    throw new Error(e.error || `Backend error: HTTP ${res.status}`);
  }

  _lastAuditLogId = res.headers.get("X-Audit-Log-ID") || null;
  emitRateLimit(res, responseFormat === "text");
  const data = await res.json();
  return data.result || "";
}

export async function reportAuditLogOutcome(auditLogId, parseSucceeded, hitDegradedFallback, metadata = {}) {
  if (!auditLogId) return;
  const deviceId = await getOrCreateDeviceId().catch(() => "unknown");

  await fetchWithRetry(`${getBackendUrl()}/api/audit-log/outcome`, {
    method: "POST",
    headers: await buildBackendHeaders(deviceId),
    body: JSON.stringify({
      auditLogId,
      parseSucceeded: Boolean(parseSucceeded),
      hitDegradedFallback: Boolean(hitDegradedFallback),
      driftWarning: Boolean(metadata?.driftWarning),
      driftDetails: Array.isArray(metadata?.driftDetails) ? metadata.driftDetails : [],
      confidence: typeof metadata?.confidence === "string" ? metadata.confidence : "medium",
    }),
  }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API — Backend-only router
// ═══════════════════════════════════════════════════════════════

/** Stream an audit or chat response through the backend proxy. */
export async function* streamAudit(
  apiKey,
  snapshot,
  _providerId = "backend",
  model,
  context,
  history = [],
  deviceId,
  signal,
  isChat = false
) {
  const responseFormat = isChat ? "text" : "json";
  log.info("audit", "Audit started", { provider: "backend", model, streaming: true, isChat });
  yield* streamBackend(
    snapshot,
    model,
    context,
    history,
    deviceId,
    getBackendProvider(model),
    signal,
    responseFormat,
    isChat ? "chat" : "audit"
  );
}

/** Call the backend proxy for a non-streaming audit or chat response. */
export async function callAudit(
  apiKey,
  snapshot,
  _providerId = "backend",
  model,
  context,
  history = [],
  deviceId,
  isChat = false,
  signal
) {
  const responseFormat = isChat ? "text" : "json";
  log.info("audit", "Audit started", { provider: "backend", model, streaming: false, isChat });
  return callBackend(
    snapshot,
    model,
    context,
    history,
    deviceId,
    getBackendProvider(model),
    responseFormat,
    isChat ? "chat" : "audit",
    signal,
    { maxRetries: 0 }
  );
}

/**
 * Rapidly classify a merchant into a rewards category using gemini-2.5-flash.
 * This uses the standard /audit backend but passes a targeted categorization prompt.
 */
export async function classifyMerchant(merchantName) {
  try {
    const deviceId = await getOrCreateDeviceId();
    
    // We intentionally force Gemini Flash to keep costs near-zero for rapid classification.
    const rawJSON = await callBackend(
      merchantName, // "snapshot" becomes the user query
      "gemini-2.5-flash",
      { variant: "location-categorization" },
      [], // no history needed
      deviceId,
      "gemini",
      "json",
      "chat"
    );
    
    // Attempt to parse out the category, falling back to catch-all
    let parsed = null;
    if (typeof rawJSON === "string") {
      try {
        const cleaned = rawJSON.replace(/```json/g, "").replace(/```/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        // Don't log rawJSON — could contain unexpected content from AI response
        log.warn("wizard", "Failed to parse JSON string from classification response");
      }
    } else {
      parsed = rawJSON;
    }
    
    if (parsed && typeof parsed.category === "string") {
      const c = parsed.category.toLowerCase().trim();
      if (["dining", "groceries", "gas", "travel", "transit", "online_shopping", "wholesale_clubs", "streaming", "drugstores", "catch-all"].includes(c)) {
        return c;
      }
    }
    return "catch-all";
  } catch (error) {
    log.error("wizard", "Classification failed", { error: error.message });
    throw error; // Let UI handle with error state + manual category selector
  }
}

/**
 * Batch classify multiple unknown merchant strings at once using gemini-2.5-flash.
 * @param {Array<string>} merchantNames - Array of raw merchant string descriptions.
 * @returns {Record<string, string>} Mapping of merchantName -> Category
 */
export async function batchCategorizeTransactions(merchantNames) {
  if (!merchantNames || merchantNames.length === 0) return {};
  try {
    const deviceId = await getOrCreateDeviceId();
    
    // We intentionally force Gemini Flash to keep costs near-zero for rapid classification.
    const rawJSON = await callBackend(
      JSON.stringify(merchantNames), // User query is the array of strings
      "gemini-2.5-flash",
      { variant: "batch-categorization" },
      [], // no history needed
      deviceId,
      "gemini",
      "json",
      "chat"
    );
    
    let parsed = null;
    if (typeof rawJSON === "string") {
      try {
        const cleaned = rawJSON.replace(/```json/g, "").replace(/```/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        log.warn("categorization", "Failed to parse JSON string from batch categorization response");
        return {};
      }
    } else {
      parsed = rawJSON;
    }
    
    return parsed || {};
  } catch (error) {
    log.error("categorization", "Batch classification failed", { error: error.message });
    return {}; // Graceful degrade — everything stays 'Other'
  }
}

// ═══════════════════════════════════════════════════════════════
// REMOTE GATING CONFIG — Anti-downgrade protection
// Fetches server-side gating mode + minimum app version.
// When we flip to "live", ALL app versions get the memo instantly.
// Old versions below minVersion are force-blocked server-side.
// ═══════════════════════════════════════════════════════════════
let _cachedConfig = null;
let _configFetchedAt = 0;
const CONFIG_TTL = 15 * 60 * 1000; // 15 minutes

/**
 * Fetch remote gating config from backend.
 * Returns { gatingMode, minVersion } or null if unreachable.
 * Caches for 15 minutes to avoid hammering.
 */
export async function fetchGatingConfig(options = {}) {
  const forceRefresh = options?.forceRefresh === true;
  if (!forceRefresh && _cachedConfig && Date.now() - _configFetchedAt < CONFIG_TTL) {
    return _cachedConfig;
  }
  try {
    const res = await fetch(`${getBackendUrl()}/config`, {
      method: "GET",
      headers: {
        "X-App-Version": APP_VERSION,
      },
    });
    if (!res.ok) return _cachedConfig;
    const data = await res.json();
    _cachedConfig = {
      gatingMode: data.gatingMode || "soft",
      minVersion: data.minVersion || "1.0.0",
    };
    if (data.rotatingCategories) {
      db.set("ota_rotating_categories", data.rotatingCategories);
    }
    _configFetchedAt = Date.now();
    log.info("config", "Remote gating config fetched", _cachedConfig);
    return _cachedConfig;
  } catch {
    return _cachedConfig; // Return stale cache on network error
  }
}

/**
 * Generic JSON helper for worker-backed endpoints that still need Catalyst
 * headers, RevenueCat identity forwarding, and retry behavior.
 */
export async function fetchJson(path, options = {}) {
  const deviceId = await getOrCreateDeviceId().catch(() => null);
  const url = path.startsWith("http") ? path : `${getBackendUrl()}${path}`;
  const isFormData = options?.body instanceof FormData;

  const response = await fetchWithRetry(url, {
    ...options,
    headers: {
      ...(await buildBackendHeaders(deviceId || "unknown")),
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(options?.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Backend error: HTTP ${response.status}`);
  }
  return data;
}
