// ═══════════════════════════════════════════════════════════════
// AI PROVIDER REGISTRY — Catalyst Cash
// Default: Backend proxy (Gemini 2.5 Flash — free for all users)
// Pro: Premium models via backend (Gemini 2.5 Pro, OpenAI o4-mini; Claude coming soon)
// ═══════════════════════════════════════════════════════════════

export const AI_PROVIDERS = [
    {
        id: "backend",
        name: "Catalyst AI",
        company: "Catalyst Cash",
        badge: "✨ Default",
        models: [
            { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", note: "Fast reasoning — included free", tier: "free", provider: "gemini" },
            { id: "gpt-4o-mini", name: "GPT-4o mini", note: "OpenAI quality — included free", tier: "free", provider: "openai" },
            { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", note: "Advanced deep reasoning", tier: "pro", provider: "gemini" },
            { id: "o4-mini", name: "OpenAI o4-mini", note: "Latest OpenAI reasoning engine", tier: "pro", provider: "openai" },
            { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", note: "Anthropic's fast & affordable model", tier: "pro", provider: "claude", comingSoon: true, disabled: true },
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
 * e.g. "gemini-2.5-flash" → "gemini", "o4-mini" → "openai", "claude-haiku-..." → "claude"
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
