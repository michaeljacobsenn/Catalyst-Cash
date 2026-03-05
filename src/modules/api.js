import { getSystemPrompt } from "./prompts.js";
import { getBackendProvider } from "./providers.js";
import { log } from "./logger.js";
import { fetchWithRetry } from "./fetchWithRetry.js";
import { APP_VERSION } from "./constants.js";
import { isPro } from "./subscription.js";
import { getRevenueCatAppUserId } from "./revenuecat.js";

// ═══════════════════════════════════════════════════════════════
// AI API MODULE — Catalyst Cash
// Routes all AI requests through the Cloudflare Worker proxy.
// ═══════════════════════════════════════════════════════════════

const BACKEND_URL = "https://api.catalystcash.app";

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
  return headers;
}

async function* streamBackend(snapshot, model, sysText, history, deviceId, backendProvider, signal, responseFormat) {
  const res = await fetch(`${BACKEND_URL}/audit`, {
    method: "POST",
    headers: await buildBackendHeaders(deviceId),
    body: JSON.stringify({
      snapshot,
      systemPrompt: sysText,
      history: history || [],
      model,
      stream: true,
      provider: backendProvider || "gemini",
      responseFormat: responseFormat || "json",
    }),
    signal,
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    if (res.status === 429) {
      log.warn("audit", "Rate limit reached", { status: 429 });
      const retryAfter = res.headers.get("Retry-After");
      const msg = retryAfter
        ? `Audit limit reached. Try again in ${retryAfter} seconds.`
        : (e.error || "Daily audit limit reached. Try again later!");
      throw new Error(msg);
    }
    log.error("audit", "Backend error", { status: res.status });
    throw new Error(e.error || `Backend error: HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";

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
      } catch (e) { log.warn("api", "Backend SSE parse error", { chunk: d.slice(0, 40) }); }
    }
  }
}

async function callBackend(snapshot, model, sysText, history, deviceId, backendProvider, responseFormat) {
  const res = await fetchWithRetry(`${BACKEND_URL}/audit`, {
    method: "POST",
    headers: await buildBackendHeaders(deviceId),
    body: JSON.stringify({
      snapshot,
      systemPrompt: sysText,
      history: history || [],
      model,
      stream: false,
      provider: backendProvider || "gemini",
      responseFormat: responseFormat || "json",
    }),
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After");
      const msg = retryAfter
        ? `Audit limit reached. Try again in ${retryAfter} seconds.`
        : (e.error || "Daily audit limit reached. Try again later!");
      throw new Error(msg);
    }
    throw new Error(e.error || `Backend error: HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.result || "";
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API — Backend-only router
// ═══════════════════════════════════════════════════════════════

/** Stream an audit or chat response through the backend proxy. */
export async function* streamAudit(apiKey, snapshot, providerId = "backend", model, sysText, history = [], deviceId, signal, isChat = false) {
  const responseFormat = isChat ? "text" : "json";
  log.info("audit", "Audit started", { provider: "backend", model, streaming: true, isChat });
  yield* streamBackend(snapshot, model, sysText, history, deviceId, getBackendProvider(model), signal, responseFormat);
}

/** Call the backend proxy for a non-streaming audit or chat response. */
export async function callAudit(apiKey, snapshot, providerId = "backend", model, sysText, history = [], deviceId, isChat = false) {
  const responseFormat = isChat ? "text" : "json";
  log.info("audit", "Audit started", { provider: "backend", model, streaming: false, isChat });
  return callBackend(snapshot, model, sysText, history, deviceId, getBackendProvider(model), responseFormat);
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
export async function fetchGatingConfig() {
  if (_cachedConfig && Date.now() - _configFetchedAt < CONFIG_TTL) {
    return _cachedConfig;
  }
  try {
    const res = await fetch(`${BACKEND_URL}/config`, {
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
    _configFetchedAt = Date.now();
    log.info("config", "Remote gating config fetched", _cachedConfig);
    return _cachedConfig;
  } catch {
    return _cachedConfig; // Return stale cache on network error
  }
}
