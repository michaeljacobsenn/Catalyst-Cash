import { getSystemPrompt } from "./prompts.js";
import { getBackendProvider } from "./providers.js";
import { log } from "./logger.js";

// ═══════════════════════════════════════════════════════════════
// AI API MODULE — Catalyst Cash
// Supports two modes:
//   1. Backend (default) — routes through Cloudflare Worker proxy
//   2. BYOK (developer mode) — direct-to-provider with user's API key
// ═══════════════════════════════════════════════════════════════

const BACKEND_URL = "https://api.catalystcash.app";

// ═══════════════════════════════════════════════════════════════
// BACKEND MODE — Cloudflare Worker Proxy
// ═══════════════════════════════════════════════════════════════
// Extract text from any provider's SSE chunk
function extractSSEText(parsed) {
  // Claude: content_block_delta
  if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
    return parsed.delta.text || "";
  }
  // OpenAI: choices[0].delta.content
  if (parsed.choices?.[0]?.delta?.content) {
    return parsed.choices[0].delta.content;
  }
  // Gemini: candidates[0].content.parts[0].text
  if (parsed.candidates?.[0]?.content?.parts?.[0]?.text) {
    return parsed.candidates[0].content.parts[0].text;
  }
  return "";
}

async function* streamBackend(snapshot, model, sysText, history, deviceId, backendProvider) {
  const res = await fetch(`${BACKEND_URL}/audit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Device-ID": deviceId || "unknown",
    },
    body: JSON.stringify({
      snapshot,
      systemPrompt: sysText,
      history: history || [],
      model,
      stream: true,
      provider: backendProvider || "gemini",
    }),
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    if (res.status === 429) {
      log.warn("audit", "Rate limit reached", { status: 429 });
      throw new Error("Daily audit limit reached (10/day). Try again tomorrow!");
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
      } catch { }
    }
  }
}

async function callBackend(snapshot, model, sysText, history, deviceId, backendProvider) {
  const res = await fetch(`${BACKEND_URL}/audit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Device-ID": deviceId || "unknown",
    },
    body: JSON.stringify({
      snapshot,
      systemPrompt: sysText,
      history: history || [],
      model,
      stream: false,
      provider: backendProvider || "gemini",
    }),
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    if (res.status === 429) {
      throw new Error("Daily audit limit reached (10/day). Try again tomorrow!");
    }
    throw new Error(e.error || `Backend error: HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.result || "";
}

// ═══════════════════════════════════════════════════════════════
// OPENAI / ChatGPT (BYOK Developer Mode)
// ═══════════════════════════════════════════════════════════════
function buildBodyOpenAI(snapshot, stream, model, sysText, history = []) {
  const m = model || "o1";
  const isReasoning = m.startsWith("o");
  const body = {
    model: m,
    stream: stream || false,
    messages: [
      { role: "system", content: sysText },
      ...(history || []),
      { role: "user", content: snapshot }
    ]
  };

  if (isReasoning) {
    body.max_completion_tokens = 12000;
  } else {
    body.max_tokens = 12000;
    body.temperature = 0.1;
    body.top_p = 0.95;
    body.response_format = { type: "json_object" };
  }

  return JSON.stringify(body);
}

async function* streamOpenAI(apiKey, snapshot, model, sysText, history, baseUrl = "https://api.openai.com/v1/chat/completions") {
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: buildBodyOpenAI(snapshot, true, model, sysText, history)
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${res.status}`); }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true }); const lines = buf.split("\n"); buf = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue; const d = line.slice(6).trim();
      if (d === "[DONE]") return; try {
        const e = JSON.parse(d);
        const text = e.choices?.[0]?.delta?.content;
        if (text) yield text;
      } catch { }
    }
  }
}

async function callOpenAI(apiKey, snapshot, model, sysText, history, baseUrl = "https://api.openai.com/v1/chat/completions") {
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: buildBodyOpenAI(snapshot, false, model, sysText, history)
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${res.status}`); }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ═══════════════════════════════════════════════════════════════
// GOOGLE / GEMINI (BYOK Developer Mode)
// ═══════════════════════════════════════════════════════════════
function buildBodyGemini(snapshot, sysText, history = []) {
  return JSON.stringify({
    contents: [
      ...(history || []),
      { parts: [{ text: snapshot }], role: "user" }
    ],
    systemInstruction: { parts: [{ text: sysText }] },
    generationConfig: {
      maxOutputTokens: 12000,
      temperature: 0.1,
      topP: 0.95,
      responseMimeType: "application/json"
    }
  });
}

async function* streamGemini(apiKey, snapshot, model, sysText, history) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-2.5-flash"}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: buildBodyGemini(snapshot, sysText, history)
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    const msg = e.error?.message || e[0]?.error?.message || `HTTP ${res.status}`;
    if (res.status === 429 || msg.toLowerCase().includes("retry in")) {
      throw new Error(`Gemini Rate Limit Exceeded: ${msg}. Please wait a moment and try again.`);
    }
    if (msg.toLowerCase().includes("exhausted") || msg.toLowerCase().includes("quota")) {
      throw new Error(`Gemini Quota Exceeded: ${msg}. If limit is 0, Google's Free Tier is restricted in your region (UK/EU). Try a VPN or OpenAI.`);
    }
    throw new Error(`Gemini Error: ${msg}`);
  }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const d = line.slice(6).trim();
      if (!d || d === "[DONE]") continue;
      try {
        const parsed = JSON.parse(d);
        const text = parsed.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
        if (text) yield text;
      } catch { }
    }
  }
}

async function callGemini(apiKey, snapshot, model, sysText, history) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-2.5-flash"}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: buildBodyGemini(snapshot, sysText, history)
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    const msg = e.error?.message || e[0]?.error?.message || `HTTP ${res.status}`;
    if (res.status === 429 || msg.toLowerCase().includes("retry in")) {
      throw new Error(`Gemini Rate Limit Exceeded: ${msg}. Please wait a moment and try again.`);
    }
    if (msg.toLowerCase().includes("exhausted") || msg.toLowerCase().includes("quota")) {
      throw new Error(`Gemini Quota Exceeded: ${msg}. If limit is 0, Google's Free Tier is restricted in your region (UK/EU). Try a VPN or OpenAI.`);
    }
    throw new Error(`Gemini Error: ${msg}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
}

// ═══════════════════════════════════════════════════════════════
// ANTHROPIC / CLAUDE (BYOK Developer Mode)
// ═══════════════════════════════════════════════════════════════
function buildHeadersClaude(apiKey) {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true"
  };
}

function buildBodyClaude(snapshot, stream, model, sysText, history = []) {
  return JSON.stringify({
    model: model || "claude-4-5-sonnet-20250929",
    max_tokens: 12000,
    temperature: 1,
    stream: stream || false,
    system: sysText,
    messages: [
      ...(history || []),
      { role: "user", content: snapshot }
    ]
  });
}

async function* streamClaude(apiKey, snapshot, model, sysText, history) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: buildHeadersClaude(apiKey),
    body: buildBodyClaude(snapshot, true, model, sysText, history)
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${res.status}`); }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const d = line.slice(6).trim();
      if (!d || d === "[DONE]") continue;
      try {
        const parsed = JSON.parse(d);
        if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
          if (parsed.delta.text) yield parsed.delta.text;
        }
      } catch { }
    }
  }
}

async function callClaude(apiKey, snapshot, model, sysText, history) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: buildHeadersClaude(apiKey),
    body: buildBodyClaude(snapshot, false, model, sysText, history)
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${res.status}`); }
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API — provider-aware router
// Supports "backend" mode (no API key needed) + BYOK fallback
// ═══════════════════════════════════════════════════════════════
export async function* streamAudit(apiKey, snapshot, providerId = "backend", model, sysText, history = [], deviceId) {
  log.info("audit", "Audit started", { provider: providerId, model, streaming: true });
  switch (providerId) {
    case "backend": yield* streamBackend(snapshot, model, sysText, history, deviceId, getBackendProvider(model)); break;
    case "openai": yield* streamOpenAI(apiKey, snapshot, model, sysText, history); break;
    case "gemini": yield* streamGemini(apiKey, snapshot, model, sysText, history); break;
    case "claude": yield* streamClaude(apiKey, snapshot, model, sysText, history); break;
    default: yield* streamBackend(snapshot, model, sysText, history, deviceId, getBackendProvider(model)); break;
  }
}

export async function callAudit(apiKey, snapshot, providerId = "backend", model, sysText, history = [], deviceId) {
  log.info("audit", "Audit started", { provider: providerId, model, streaming: false });
  switch (providerId) {
    case "backend": return callBackend(snapshot, model, sysText, history, deviceId, getBackendProvider(model));
    case "openai": return callOpenAI(apiKey, snapshot, model, sysText, history);
    case "gemini": return callGemini(apiKey, snapshot, model, sysText, history);
    case "claude": return callClaude(apiKey, snapshot, model, sysText, history);
    default: return callBackend(snapshot, model, sysText, history, deviceId, getBackendProvider(model));
  }
}
