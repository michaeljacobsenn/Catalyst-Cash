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
            { id: "gemini-2.5-flash", name: "Catalyst AI", note: "Fast, intelligent analysis — included free", tier: "free", provider: "gemini", poweredBy: "Gemini 2.5 Flash" },
            { id: "gemini-2.5-pro", name: "Catalyst AI Pro", note: "Advanced deep reasoning for complex financial analysis", tier: "pro", provider: "gemini", poweredBy: "Gemini 2.5 Pro" },
            { id: "o4-mini", name: "Catalyst AI Reasoning", note: "Chain-of-thought reasoning engine for precision math", tier: "pro", provider: "openai", poweredBy: "OpenAI o4-mini" },
        ],
        defaultModel: "gemini-2.5-flash",
        supportsStreaming: true,
        note: "No API key required. Powered by our secure backend.",
        isBackend: true,
    },
];

export const DEFAULT_PROVIDER_ID = "backend";
export const DEFAULT_MODEL_ID = "gemini-2.5-flash";

export function getProvider(id) {
    return AI_PROVIDERS.find(p => p.id === id) || AI_PROVIDERS[0];
}

export function isModelSelectable(model) {
    return Boolean(model) && !model.disabled && !model.comingSoon;
}

export function getModel(providerId, modelId) {
    const provider = getProvider(providerId);
    return provider.models.find(m => m.id === modelId && isModelSelectable(m))
        || provider.models.find(isModelSelectable)
        || provider.models[0];
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
