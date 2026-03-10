// ═══════════════════════════════════════════════════════════════
// AI PROVIDER REGISTRY — Catalyst Cash
// 3 models, branded: Catalyst AI (Free) | Catalyst AI Pro | Catalyst AI Reasoning
// Backend models: Gemini 2.5 Flash | Gemini 2.5 Pro | OpenAI o4-mini
// ═══════════════════════════════════════════════════════════════

export const AI_PROVIDERS = [
  {
    id: "backend",
    name: "Catalyst AI",
    company: "Catalyst Cash",
    badge: "✨ Default",
    models: [
      {
        id: "gpt-4o-mini",
        name: "Catalyst AI",
        note: "Fast, intelligent analysis — included free",
        tier: "free",
        provider: "openai",
        poweredBy: "OpenAI GPT-4o-mini",
      },
      {
        id: "gpt-4o",
        name: "Catalyst AI Chat",
        note: "Fluid, conversational financial intelligence",
        tier: "pro",
        provider: "openai",
        poweredBy: "OpenAI GPT-4o",
      },
      {
        id: "o3-mini",
        name: "Catalyst AI Reasoning",
        note: "Chain-of-thought reasoning engine for flawless logic",
        tier: "pro",
        provider: "openai",
        poweredBy: "OpenAI o3-mini",
      },
    ],
    defaultModel: "o3-mini",
    supportsStreaming: true,
    note: "No API key required. Powered by our secure backend.",
    isBackend: true,
  },
];

export const DEFAULT_PROVIDER_ID = "backend";
export const DEFAULT_MODEL_ID = "o3-mini";

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

/**
 * For backend provider, resolve which Worker provider to route to.
 * e.g. "gemini-2.5-flash" → "gemini", "o4-mini" → "openai"
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
