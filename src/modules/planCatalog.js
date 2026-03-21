export const FREE_AUDIT_LIMIT = 2;
export const FREE_CHAT_LIMIT = 10;
export const FREE_HISTORY_LIMIT = 12;
export const FREE_MARKET_REFRESH_MS = 60 * 60 * 1000;

export const PRO_MONTHLY_AUDIT_CAP = 20;
export const PRO_DAILY_CHAT_CAP = 25;

// Per-model daily caps for Pro (must sum to PRO_DAILY_CHAT_CAP)
export const PRO_MODEL_CAPS = {
  "o3": 4,
  "gpt-4.1": 6,
  "gemini-2.5-flash": 15,
};
export const PRO_MARKET_REFRESH_MS = 5 * 60 * 1000;

export const INSTITUTION_LIMITS = {
  free: 1,
  pro: 6,
};

export const TIER_MODEL_IDS = {
  free: ["gemini-2.5-flash"],
  pro: ["gpt-4.1", "gemini-2.5-flash", "o3"],
};

export const IAP_PRODUCTS = {
  monthly: "com.catalystcash.pro.monthly.v2",
  yearly: "com.catalystcash.pro.yearly.v2",
};

export const IAP_PRICING = {
  monthly: { price: "$9.99", period: "month", savings: false },
  yearly: {
    price: "$89.99",
    period: "year",
    savings: "3 months free",
    perMonth: "$7.50",
    original: "$119.88",
    trial: "7-day free trial",
  },
};

export const PLAN_DISPLAY = {
  free: {
    audits: `${FREE_AUDIT_LIMIT} audits / week`,
    chats: `${FREE_CHAT_LIMIT} AskAI / day`,
    models: "Catalyst AI",
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
