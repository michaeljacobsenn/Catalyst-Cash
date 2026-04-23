import { fetchWithTimeout } from "./http.js";
import { getAuditJsonSchema } from "../prompts/auditOutputContract.js";

const ANTHROPIC_VERSION = "2023-06-01";

export const VALID_PROVIDERS = ["gemini", "openai", "claude", "anthropic"];

export const DEFAULTS = {
  gemini: "gemini-2.5-flash",
  openai: "gpt-5-mini",
  claude: "claude-haiku-4-5",
  anthropic: "claude-haiku-4-5",
};

function isReasoningModel(model = "") {
  const normalized = String(model || "");
  return normalized.startsWith("o") || normalized.startsWith("gpt-5");
}

function resolveOutputBudget(provider, model, responseFormat) {
  const structured = responseFormat !== "text";
  const reasoning = isReasoningModel(model);

  if (structured) {
    if (provider === "openai") return reasoning ? 3400 : 3000;
    if (provider === "gemini") return 2800;
    return 3000;
  }

  if (provider === "openai") return reasoning ? 1400 : 1100;
  if (provider === "gemini") return 1000;
  return 1200;
}

function buildUsage(promptTokens = 0, completionTokens = 0) {
  return {
    promptTokens: Number.isFinite(promptTokens) ? promptTokens : 0,
    completionTokens: Number.isFinite(completionTokens) ? completionTokens : 0,
  };
}

function extractHistoryText(entry) {
  if (!entry) return "";
  if (typeof entry.content === "string") return entry.content;
  if (Array.isArray(entry.parts)) {
    return entry.parts
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function normalizeOpenAIHistory(history = []) {
  return history
    .map((entry) => {
      const role = entry?.role === "assistant" || entry?.role === "model" ? "assistant" : "user";
      const content = extractHistoryText(entry);
      return content ? { role, content } : null;
    })
    .filter(Boolean);
}

export async function callGemini(apiKey, { snapshot, systemPrompt, history, model, stream, responseFormat, timeoutMs = 240_000 }) {
  const m = model || DEFAULTS.gemini;
  const endpoint = stream
    ? `https://generativelanguage.googleapis.com/v1beta/models/${m}:streamGenerateContent?alt=sse&key=${apiKey}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;

  const genConfig = {
    maxOutputTokens: resolveOutputBudget("gemini", m, responseFormat),
    temperature: 0.1,
    topP: 0.95,
  };
  if (responseFormat !== "text") {
    genConfig.responseMimeType = "application/json";
    genConfig.responseJsonSchema = getAuditJsonSchema();
  }

  const body = {
    contents: [
      ...(history || []).map(h => ({
        role: h.role === "assistant" || h.role === "model" ? "model" : "user",
        parts: [{ text: extractHistoryText(h) }],
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
  const isReasoning = isReasoningModel(m);
  const maxOutputTokens = resolveOutputBudget("openai", m, responseFormat);

  const body = {
    model: m,
    stream: stream || false,
    messages: [{ role: "system", content: systemPrompt }, ...normalizeOpenAIHistory(history), { role: "user", content: snapshot }],
  };

  if (isReasoning) {
    body.max_completion_tokens = maxOutputTokens;
    if (stream) body.stream_options = { include_usage: true };
  } else {
    body.max_tokens = maxOutputTokens;
    body.temperature = 0.1;
    body.top_p = 0.95;
    if (stream) body.stream_options = { include_usage: true };
  }

  if (responseFormat !== "text") {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: "catalyst_audit",
        strict: true,
        schema: getAuditJsonSchema(),
      },
    };
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

export async function routeOpenAIChatAction(
  apiKey,
  { snapshot, history = [], model, timeoutMs = 20_000 }
) {
  const requestedModel = model || DEFAULTS.openai;
  const routingModel = requestedModel.startsWith("o") ? DEFAULTS.openai : requestedModel;
  const isReasoning = isReasoningModel(routingModel);
  const body = {
    model: routingModel,
    stream: false,
    messages: [
      {
        role: "system",
        content: `You are a finance action router for Catalyst Cash.
Select exactly one finance action packet for the user's latest question.
Base the choice on the question itself, not on general financial education.
If the question mixes multiple themes, choose the primary action that should lead the answer and include the rest as secondary lanes.
Prefer debt_paydown over card_selection when liquidity is tight or the user is clearly asking about payoff, APR, balances, or utilization.
Return only the required tool call.`,
      },
      ...normalizeOpenAIHistory(history).slice(-6),
      { role: "user", content: snapshot },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "select_finance_action",
          description: "Select the finance action packet that should govern the answer.",
          parameters: {
            type: "object",
            additionalProperties: false,
            properties: {
              primaryLane: {
                type: "string",
                enum: [
                  "cash_deployment",
                  "debt_paydown",
                  "card_selection",
                  "recurring_review",
                  "investment_contribution",
                  "planning_gap",
                ],
              },
              secondaryLanes: {
                type: "array",
                items: {
                  type: "string",
                  enum: [
                    "cash_deployment",
                    "debt_paydown",
                    "card_selection",
                    "recurring_review",
                    "investment_contribution",
                    "planning_gap",
                  ],
                },
              },
              urgency: {
                type: "string",
                enum: ["normal", "medium", "high"],
              },
              rationale: { type: "string" },
            },
            required: ["primaryLane", "secondaryLanes", "urgency", "rationale"],
          },
        },
      },
    ],
    tool_choice: {
      type: "function",
      function: {
        name: "select_finance_action",
      },
    },
  };
  if (isReasoning) {
    body.max_completion_tokens = 300;
  } else {
    body.temperature = 0;
    body.max_tokens = 300;
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
    throw new Error(`OpenAI Router Error: ${e.error?.message || `HTTP ${res.status}`}`);
  }

  const data = await res.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  const rawArgs = toolCall?.function?.arguments;
  if (!rawArgs) return null;

  try {
    return JSON.parse(rawArgs);
  } catch {
    return null;
  }
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
      return { handler: callGemini, keyName: "GOOGLE_API_KEY", keyNames: ["GOOGLE_API_KEY", "GEMINI_API_KEY"] };
    case "openai":
      return { handler: callOpenAI, keyName: "OPENAI_API_KEY", keyNames: ["OPENAI_API_KEY"] };
    case "claude":
    case "anthropic":
      return { handler: callClaude, keyName: "ANTHROPIC_API_KEY", keyNames: ["ANTHROPIC_API_KEY"] };
    default:
      return { handler: callGemini, keyName: "GOOGLE_API_KEY", keyNames: ["GOOGLE_API_KEY", "GEMINI_API_KEY"] };
  }
}
