import { fetchWithTimeout } from "./http.js";

const ANTHROPIC_VERSION = "2023-06-01";

export const VALID_PROVIDERS = ["gemini", "openai", "claude", "anthropic"];

export const DEFAULTS = {
  gemini: "gemini-2.5-flash",
  openai: "gpt-4.1",
  claude: "claude-haiku-4-5",
  anthropic: "claude-haiku-4-5",
};

function buildUsage(promptTokens = 0, completionTokens = 0) {
  return {
    promptTokens: Number.isFinite(promptTokens) ? promptTokens : 0,
    completionTokens: Number.isFinite(completionTokens) ? completionTokens : 0,
  };
}

export async function callGemini(apiKey, { snapshot, systemPrompt, history, model, stream, responseFormat, timeoutMs = 240_000 }) {
  const m = model || DEFAULTS.gemini;
  const endpoint = stream
    ? `https://generativelanguage.googleapis.com/v1beta/models/${m}:streamGenerateContent?alt=sse&key=${apiKey}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;

  const genConfig = {
    maxOutputTokens: 12000,
    temperature: 0.1,
    topP: 0.95,
  };
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
    timeoutMs
  );

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    const msg = e.error?.message || e[0]?.error?.message || `HTTP ${res.status}`;
    throw new Error(`Gemini Error: ${msg}`);
  }

  if (stream) return res;

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

export async function callOpenAI(apiKey, { snapshot, systemPrompt, history, model, stream, responseFormat, timeoutMs = 240_000 }) {
  const m = model || DEFAULTS.openai;
  const isReasoning = m.startsWith("o");

  const body = {
    model: m,
    stream: stream || false,
    messages: [{ role: "system", content: systemPrompt }, ...(history || []), { role: "user", content: snapshot }],
  };

  if (isReasoning) {
    body.max_completion_tokens = 12000;
    if (stream) body.stream_options = { include_usage: true };
    if (responseFormat !== "text") {
      const jsonSuffix =
        "\n\nCRITICAL: You MUST respond with RAW JSON only. No markdown, no code fences, no prose, no explanation. Your entire response must be a single valid JSON object starting with { and ending with }.";
      body.messages[0].content += jsonSuffix;
    }
  } else {
    body.max_tokens = 12000;
    body.temperature = 0.1;
    body.top_p = 0.95;
    if (stream) body.stream_options = { include_usage: true };
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
    timeoutMs
  );

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(`OpenAI Error: ${e.error?.message || `HTTP ${res.status}`}`);
  }

  if (stream) return res;

  const data = await res.json();
  return {
    text: data.choices?.[0]?.message?.content || "",
    usage: buildUsage(data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0),
  };
}

export async function callClaude(apiKey, { snapshot, systemPrompt, history, model, stream, responseFormat: _responseFormat, timeoutMs = 240_000 }) {
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
    timeoutMs
  );

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(`Claude Error: ${e.error?.message || `HTTP ${res.status}`}`);
  }

  if (stream) return res;

  const data = await res.json();
  return {
    text: data.content?.[0]?.text || "",
    usage: buildUsage(data.usage?.input_tokens || 0, data.usage?.output_tokens || 0),
  };
}

export function getProviderHandler(provider) {
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
