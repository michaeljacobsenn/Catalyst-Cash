export const FREE_AUDIT_LIMIT = 2;
export const FREE_CHAT_LIMIT = 5;
export const FREE_HISTORY_LIMIT = 12;
export const FREE_MARKET_REFRESH_MS = 60 * 60 * 1000;

export const PRO_MONTHLY_AUDIT_CAP = 20;
export const PRO_DAILY_CHAT_CAP = 30;

export const FREE_MODEL_ID = "gpt-5-nano";
export const PRO_PRIMARY_MODEL_ID = "gpt-5-mini";
export const PRO_VOLUME_MODEL_ID = "gpt-5-nano";
export const PRO_BOARDROOM_MODEL_ID = "gpt-5.1";

// Per-model daily caps for Pro. The 30-chat global cap still applies; these
// buckets keep premium OpenAI usage bounded while preserving a volume lane.
export const PRO_MODEL_CAPS = {
  [PRO_PRIMARY_MODEL_ID]: 15,
  [PRO_VOLUME_MODEL_ID]: 15,
  [PRO_BOARDROOM_MODEL_ID]: 5,
};
export const PRO_MARKET_REFRESH_MS = 5 * 60 * 1000;

export const INSTITUTION_LIMITS = {
  free: 1,
  pro: 8,
};

export const TIER_MODEL_IDS = {
  free: [FREE_MODEL_ID],
  pro: [PRO_PRIMARY_MODEL_ID, PRO_VOLUME_MODEL_ID, PRO_BOARDROOM_MODEL_ID],
};

export const IAP_PRODUCTS = {
  monthly: "com.catalystcash.pro.monthly.v2",
  yearly: "com.catalystcash.pro.yearly.v2",
  lifetime: "com.catalystcash.pro.lifetime.v2",
};

export const IAP_PRICING = {
  monthly: { price: "$12.99", period: "month", savings: false },
  yearly: {
    price: "$109.99",
    period: "year",
    savings: "save $46/yr vs monthly",
    perMonth: "$9.17",
    original: "$155.88",
    trial: "7-day free trial",
  },
  lifetime: {
    price: "$199.99",
    period: "lifetime",
    savings: "Never pay again",
    perMonth: null,
    original: null,
    trial: null,
  },
};

export const PLAN_DISPLAY = {
  free: {
    audits: `${FREE_AUDIT_LIMIT} audits / week`,
    chats: `${FREE_CHAT_LIMIT} AskAI / day`,
    models: "OpenAI-powered Catalyst AI",
    plaid: `${INSTITUTION_LIMITS.free} Plaid institution`,
    history: `Last ${FREE_HISTORY_LIMIT} audits`,
  },
  pro: {
    audits: `${PRO_MONTHLY_AUDIT_CAP} audits / month`,
    chats: `${PRO_DAILY_CHAT_CAP} AskAI / day`,
    models: "Catalyst AI CFO + Boardroom",
    plaid: `Up to ${INSTITUTION_LIMITS.pro} Plaid institutions`,
    history: "Full audit archive",
  },
};

export const PROMO_FACTS = {
  audits: PLAN_DISPLAY.pro.audits,
  chats: PLAN_DISPLAY.pro.chats,
  history: "full archive",
  plaid: PLAN_DISPLAY.pro.plaid,
  ledger: "full ledger",
  rewards: "full card ranking",
  models: "premium AI models",
  renewals: "auto-detect + AI scripts",
};

export const PRO_BANNER_BENEFITS = [
  { emoji: "📊", text: `${PRO_MONTHLY_AUDIT_CAP} audits/mo` },
  { emoji: "💬", text: `${PRO_DAILY_CHAT_CAP} AskAI/day` },
  { emoji: "📈", text: "Full archive" },
  { emoji: "🏦", text: `${INSTITUTION_LIMITS.pro} Plaid institutions` },
];

export function buildPromoLine(keys = []) {
  return keys
    .map(key => PROMO_FACTS[key])
    .filter(Boolean)
    .join(" · ");
}
