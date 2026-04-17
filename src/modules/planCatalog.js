export const FREE_AUDIT_LIMIT = 2;
export const FREE_CHAT_LIMIT = 5;
export const FREE_HISTORY_LIMIT = 12;
export const FREE_MARKET_REFRESH_MS = 60 * 60 * 1000;

export const PRO_MONTHLY_AUDIT_CAP = 20;
export const PRO_DAILY_CHAT_CAP = 30;

// Per-model daily caps for Pro. GPT-4.1 and Gemini Flash share the 30-chat global budget
// freely with no per-model wall between them. o3 (Boardroom) is sub-capped at 5/day —
// those 5 count toward the 30 total, leaving up to 25 for GPT-4.1 + Gemini combined.
export const PRO_MODEL_CAPS = {
  "o3": 5,
};
export const PRO_MARKET_REFRESH_MS = 5 * 60 * 1000;

export const INSTITUTION_LIMITS = {
  free: 1,
  pro: 8,
};

export const TIER_MODEL_IDS = {
  free: ["gemini-2.5-flash"],
  pro: ["gpt-4.1", "gemini-2.5-flash", "o3"],
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
