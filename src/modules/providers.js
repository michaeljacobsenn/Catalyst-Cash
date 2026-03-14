// ═══════════════════════════════════════════════════════════════
// AI PROVIDER REGISTRY — Catalyst Cash
// 7 models, branded for clear free vs pro routing
// Backend models: Gemini 2.5 Flash | Claude Haiku 4.5 | GPT-4.1 | o3 | Claude Sonnet 4.6 | Claude Opus 4.6 | Gemini 2.5 Pro
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_FREE_MODEL_ID = "gemini-2.5-flash";
export const DEFAULT_PRO_MODEL_ID = "claude-haiku-4-5";

export const AI_PROVIDERS = [
  {
    id: "backend",
    name: "Catalyst AI",
    company: "Catalyst Cash",
    badge: "✨ Default",
    models: [
      {
        id: "gemini-2.5-flash",
        name: "Catalyst AI",
        note: "Fastest everyday audit engine with the best free-tier value",
        tier: "free",
        badge: "FREE",
        provider: "gemini",
        poweredBy: "Google Gemini 2.5 Flash",
      },
      {
        id: "claude-haiku-4-5",
        name: "Catalyst AI Haiku",
        note: "Fast Claude responses when you want concise financial guidance",
        tier: "pro",
        badge: "PRO",
        provider: "anthropic",
        poweredBy: "Anthropic Claude Haiku 4.5",
      },
      {
        id: "gpt-4.1",
        name: "Catalyst AI Precision",
        note: "Balanced reasoning and conversational quality for deep audits",
        tier: "pro",
        badge: "PRO",
        provider: "openai",
        poweredBy: "OpenAI GPT-4.1",
      },
      {
        id: "o3",
        name: "Catalyst AI Reasoning",
        note: "Highest-rigor OpenAI reasoning for thorny edge cases",
        tier: "pro",
        badge: "PRO",
        provider: "openai",
        poweredBy: "OpenAI o3",
      },
      {
        id: "claude-sonnet-4-6",
        name: "Catalyst AI Sonnet",
        note: "Strong long-form planning with calm, polished explanations",
        tier: "pro",
        badge: "PRO",
        provider: "anthropic",
        poweredBy: "Anthropic Claude Sonnet 4.6",
      },
      {
        id: "claude-opus-4-6",
        name: "Catalyst AI Opus",
        note: "Premium deep-thinking mode for the most complex financial tradeoffs",
        tier: "pro",
        badge: "PREMIUM",
        provider: "anthropic",
        poweredBy: "Anthropic Claude Opus 4.6",
      },
      {
        id: "gemini-2.5-pro",
        name: "Catalyst AI Vision",
        note: "Broader synthesis and planning depth for multi-factor money decisions",
        tier: "pro",
        badge: "PRO",
        provider: "gemini",
        poweredBy: "Google Gemini 2.5 Pro",
      },
    ],
    defaultModel: DEFAULT_PRO_MODEL_ID,
    supportsStreaming: true,
    note: "No API key required. Powered by our secure backend.",
    isBackend: true,
  },
];

export const DEFAULT_PROVIDER_ID = "backend";
export const DEFAULT_MODEL_ID = DEFAULT_FREE_MODEL_ID;

export function getProvider(id) {
  return AI_PROVIDERS.find(p => p.id === id) || AI_PROVIDERS[0];
}

export function isModelSelectable(model) {
  return Boolean(model) && !model.disabled && !model.comingSoon;
}

export function getModel(providerId, modelId) {
  const provider = getProvider(providerId);
  return (
    provider.models.find(m => m.id === modelId && isModelSelectable(m)) ||
    provider.models.find(isModelSelectable) ||
    provider.models[0]
  );
}

export function getDefaultModelIdForTier(tierId) {
  return tierId === "pro" ? DEFAULT_PRO_MODEL_ID : DEFAULT_FREE_MODEL_ID;
}

/**
 * For backend provider, resolve which Worker provider to route to.
 * e.g. "gemini-2.5-flash" → "gemini", "claude-sonnet-4-6" → "anthropic"
 */
export function getBackendProvider(modelId) {
  const backend = getProvider("backend");
  const model = backend.models.find(m => m.id === modelId);
  return model?.provider || "gemini";
}

/**
 * Check if a model requires Pro subscription
 */
export function isProModel(modelId) {
  const backend = getProvider("backend");
  const model = backend.models.find(m => m.id === modelId);
  return model?.tier === "pro";
}
