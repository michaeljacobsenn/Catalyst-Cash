// ═══════════════════════════════════════════════════════════════
// AI PROVIDER REGISTRY — Catalyst Cash
// OpenAI-only lineup, curated for launch reliability and margin discipline.
// ═══════════════════════════════════════════════════════════════

import {
  FREE_MODEL_ID,
  PRO_BOARDROOM_MODEL_ID,
  PRO_PRIMARY_MODEL_ID,
  PRO_VOLUME_MODEL_ID,
} from "./planCatalog.js";

export const DEFAULT_FREE_MODEL_ID = FREE_MODEL_ID;
export const DEFAULT_PRO_MODEL_ID = PRO_PRIMARY_MODEL_ID;

const MODEL_ALIASES = {
  "gemini-2.5-flash": PRO_VOLUME_MODEL_ID,
  "gpt-4.1": PRO_PRIMARY_MODEL_ID,
  "o3": PRO_BOARDROOM_MODEL_ID,
};

export const AI_PROVIDERS = [
  {
    id: "backend",
    name: "Catalyst AI",
    company: "Catalyst Cash",
    badge: "DEFAULT",
    models: [
      {
        id: PRO_VOLUME_MODEL_ID,
        name: "Catalyst AI",
        note: "Fast daily engine for free-tier guidance, categorization, and lightweight follow-up questions",
        tier: "free",
        badge: "FREE",
        provider: "openai",
        poweredBy: "OpenAI GPT-5 nano",
      },
      {
        id: PRO_PRIMARY_MODEL_ID,
        name: "Catalyst AI CFO",
        note: "Default Pro engine for CFO-grade audits, high-context planning, and premium day-to-day guidance",
        tier: "pro",
        badge: "PRO",
        provider: "openai",
        poweredBy: "OpenAI GPT-5 mini",
      },
      {
        id: PRO_BOARDROOM_MODEL_ID,
        name: "Catalyst AI Boardroom",
        note: "Escalation-only reasoning for insolvency risk, tax complexity, promo APR cliffs, and edge-case tradeoffs",
        tier: "pro",
        badge: "DEEP",
        provider: "openai",
        poweredBy: "OpenAI GPT-5.1",
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
  const canonicalModelId = normalizeModelId(modelId);
  return (
    provider.models.find(m => m.id === canonicalModelId && isModelSelectable(m)) ||
    provider.models.find(isModelSelectable) ||
    provider.models[0]
  );
}

export function getDefaultModelIdForTier(tierId) {
  return tierId === "pro" ? DEFAULT_PRO_MODEL_ID : DEFAULT_FREE_MODEL_ID;
}

/**
 * For backend provider, resolve which Worker provider to route to.
 * e.g. "gpt-5-nano" → "openai", legacy Gemini/GPT-4.1 IDs are aliased.
 */
export function getBackendProvider(modelId) {
  const backend = getProvider("backend");
  const model = backend.models.find(m => m.id === normalizeModelId(modelId));
  return model?.provider || "openai";
}

export function getModelDisplayName(modelId) {
  const backend = getProvider("backend");
  const model = backend.models.find(m => m.id === normalizeModelId(modelId));
  return model?.name || String(modelId || "Catalyst AI");
}

export function normalizeModelId(modelId) {
  const normalized = String(modelId || "").trim();
  return MODEL_ALIASES[normalized] || normalized;
}

export function getOperationalFallbackModels(modelId) {
  const normalized = normalizeModelId(modelId);
  if (normalized === PRO_VOLUME_MODEL_ID) return [PRO_PRIMARY_MODEL_ID];
  if (normalized === PRO_PRIMARY_MODEL_ID) return [PRO_VOLUME_MODEL_ID];
  if (normalized === PRO_BOARDROOM_MODEL_ID) return [PRO_PRIMARY_MODEL_ID, PRO_VOLUME_MODEL_ID];
  return [];
}

/**
 * Check if a model requires Pro subscription
 */
export function isProModel(modelId) {
  const backend = getProvider("backend");
  const model = backend.models.find(m => m.id === normalizeModelId(modelId));
  return model?.tier === "pro";
}
