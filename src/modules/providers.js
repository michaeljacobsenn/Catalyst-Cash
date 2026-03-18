// ═══════════════════════════════════════════════════════════════
// AI PROVIDER REGISTRY — Catalyst Cash
// 3-model lineup, curated for margin discipline and CFO-grade output
// Backend models: Gemini 2.5 Flash | GPT-4.1 | o3
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_FREE_MODEL_ID = "gemini-2.5-flash";
export const DEFAULT_PRO_MODEL_ID = "gpt-4.1";

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
        note: "Fast, low-cost daily audit engine for the free tier and lightweight follow-up questions",
        tier: "free",
        badge: "FREE",
        provider: "gemini",
        poweredBy: "Google Gemini 2.5 Flash",
      },
      {
        id: "gpt-4.1",
        name: "Catalyst AI CFO",
        note: "Default Pro engine for CFO-grade audits, high-context planning, and premium day-to-day guidance",
        tier: "pro",
        badge: "PRO",
        provider: "openai",
        poweredBy: "OpenAI GPT-4.1",
      },
      {
        id: "o3",
        name: "Catalyst AI Boardroom",
        note: "Escalation-only reasoning for insolvency risk, tax complexity, promo APR cliffs, and edge-case tradeoffs",
        tier: "pro",
        badge: "DEEP",
        provider: "openai",
        poweredBy: "OpenAI o3",
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
 * e.g. "gemini-2.5-flash" → "gemini", "gpt-4.1" → "openai"
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
