import {
  AI_PROVIDERS,
  DEFAULT_FREE_MODEL_ID,
  DEFAULT_PRO_MODEL_ID,
  getDefaultModelIdForTier,
  getModel,
  isModelSelectable,
} from "../providers.js";
import {
  FREE_AUDIT_LIMIT,
  FREE_CHAT_LIMIT,
  FREE_HISTORY_LIMIT,
  FREE_MARKET_REFRESH_MS,
  IAP_PRICING,
  IAP_PRODUCTS,
  INSTITUTION_LIMITS,
  PRO_DAILY_CHAT_CAP,
  PRO_BOARDROOM_MODEL_ID,
  PRO_MARKET_REFRESH_MS,
  PRO_PRIMARY_MODEL_ID,
  PRO_MONTHLY_AUDIT_CAP,
  PRO_MODEL_CAPS,
  PRO_VOLUME_MODEL_ID,
  TIER_MODEL_IDS,
} from "../planCatalog.js";
import { isGatingEnforced } from "./gating.js";

export const TIERS = {
  free: {
    id: "free",
    name: "Free",
    auditsPerWeek: FREE_AUDIT_LIMIT,
    chatMessagesPerDay: FREE_CHAT_LIMIT,
    marketRefreshMs: FREE_MARKET_REFRESH_MS,
    historyLimit: FREE_HISTORY_LIMIT,
    models: TIER_MODEL_IDS.free,
    features: [
      "basic_audit",
      "health_score",
      "weekly_moves",
      "history",
      "demo",
      "dashboard_charts",
      "debt_simulator",
      "cash_flow_calendar",
      "budget_tracking",
      "card_portfolio",
      "renewals",
      "weekly_challenges",
      "share_card_branded",
      "basic_alerts",
      "ask_ai",
    ],
    badge: null,
  },
  pro: {
    id: "pro",
    name: "Pro",
    auditsPerWeek: Infinity,
    chatMessagesPerDay: Infinity,
    marketRefreshMs: PRO_MARKET_REFRESH_MS,
    historyLimit: Infinity,
    models: TIER_MODEL_IDS.pro,
    features: [
      "basic_audit",
      "health_score",
      "weekly_moves",
      "history",
      "demo",
      "dashboard_charts",
      "debt_simulator",
      "cash_flow_calendar",
      "budget_tracking",
      "card_portfolio",
      "renewals",
      "weekly_challenges",
      "share_card_branded",
      "basic_alerts",
      "monthly_audit_cap",
      "premium_models",
      "unlimited_history",
      "share_card_clean",
      "export_csv",
      "export_pdf",
      "advanced_alerts",
      "priority_refresh",
      "daily_pro_chat_cap",
      "card_wizard",
      "bill_negotiation",
    ],
    badge: "PRO",
  },
};

export { IAP_PRICING, IAP_PRODUCTS, INSTITUTION_LIMITS, PRO_DAILY_CHAT_CAP, PRO_MODEL_CAPS, PRO_MONTHLY_AUDIT_CAP };

export function getAlternateProModel(modelId) {
  if (modelId === PRO_PRIMARY_MODEL_ID) return PRO_VOLUME_MODEL_ID;
  if (modelId === PRO_VOLUME_MODEL_ID) return PRO_PRIMARY_MODEL_ID;
  if (modelId === PRO_BOARDROOM_MODEL_ID) return PRO_PRIMARY_MODEL_ID;
  return null;
}

export function getPreferredModelForTier(tierId = "free") {
  return getDefaultModelIdForTier(tierId);
}

export function normalizeModelForTier(tierId = "free", modelId, providerId = "backend") {
  const effectiveTierId = isGatingEnforced() ? tierId : "pro";
  if (effectiveTierId !== "pro") return DEFAULT_FREE_MODEL_ID;

  const candidateId = modelId || DEFAULT_PRO_MODEL_ID;
  const resolved = getModel(providerId, candidateId);
  if (!resolved || !isModelSelectable(resolved) || !TIERS.pro.models.includes(resolved.id)) {
    return DEFAULT_PRO_MODEL_ID;
  }
  return resolved.id;
}

export function getSelectableModelIds() {
  return new Set(
    AI_PROVIDERS.flatMap((provider) => provider.models.filter(isModelSelectable).map((model) => model.id))
  );
}
