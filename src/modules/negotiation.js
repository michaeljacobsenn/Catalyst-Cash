// src/modules/negotiation.js

/**
 * A curated list of merchants known to have retention departments and be open to negotiation.
 * These are mapped against user bills (case-insensitive substring match).
 */
export const NEGOTIABLE_MERCHANTS = [
  // ISPs & Cable (Highest success rate)
  {
    merchant: "Comcast",
    aliases: ["Xfinity", "Comcast"],
    type: "ISP",
    tactic: "Mention a competitor's fiber offering. Ask for the 'retention department' immediately. Target a new-customer promotional rate.",
  },
  {
    merchant: "AT&T",
    aliases: ["AT&T", "ATT Internet", "U-verse", "ATT Fiber"],
    type: "ISP",
    tactic: "Mention Google Fiber or regional fiber competitors. Ask for retention. Focus on loyal customer discounts.",
  },
  {
    merchant: "Spectrum",
    aliases: ["Spectrum", "Charter Communications", "Time Warner Cable"],
    type: "ISP",
    tactic: "Threaten cancellation to switch to T-Mobile/Verizon 5G Home Internet. Ask what promotions are available to prevent switching.",
  },
  {
    merchant: "Cox",
    aliases: ["Cox Communications", "Cox Internet"],
    type: "ISP",
    tactic: "Request the loyalty department. Research a local competitor's rate and ask Cox to match it.",
  },
  {
    merchant: "Optimum",
    aliases: ["Optimum", "Altice", "Suddenlink"],
    type: "ISP",
    tactic: "Threaten cancellation to get to retention. Request their current introductory price.",
  },
  {
    merchant: "Verizon Fios",
    aliases: ["Verizon Fios", "Fios Internet"],
    type: "ISP",
    tactic: "Check if you are off-contract. Ask about 'Mix & Match' pricing or current customer loyalty credits.",
  },
  {
    merchant: "DirecTV",
    aliases: ["DirecTV", "Direct TV"],
    type: "Cable",
    tactic: "Say 'Cancel Service' at the voice prompt to reach retention. Ask for a 12-month promotional discount and free premium channels.",
  },
  {
    merchant: "Dish Network",
    aliases: ["Dish Network", "Dish"],
    type: "Cable",
    tactic: "State you are moving to streaming (YouTube TV/Hulu Live). They usually offer heavy discounts to prevent cord-cutting.",
  },

  // Cellular (High success rate for loyalty credits)
  {
    merchant: "Verizon Wireless",
    aliases: ["Verizon", "Verizon Wireless", "VZW"],
    type: "Cellular",
    tactic: "Ask for the loyalty department. Mention T-Mobile's buyout offers. Ask if there are any unadvertised loyalty discounts for your account.",
  },
  {
    merchant: "T-Mobile",
    aliases: ["T-Mobile", "Tmo", "Sprint"],
    type: "Cellular",
    tactic: "Ask for customer retention. Mention you are considering porting out to an MVNO like Mint Mobile or Visible.",
  },

  // Satellite Radio (Near 100% success rate)
  {
    merchant: "Sirius XM",
    aliases: ["Sirius XM", "SiriusXM", "Sirius Radio"],
    type: "Subscription",
    tactic: "Do NOT accept the first offer. Threaten to cancel because it's too expensive. Demand the $5/month for 12 months promo, plus ask them to waive the royalty fees.",
  },

  // News / Magazines (High success rate)
  {
    merchant: "Wall Street Journal",
    aliases: ["WSJ", "Wall Street Journal", "The Wall Street Journal"],
    type: "Subscription",
    tactic: "Go to the online cancellation flow, or call and say it's too expensive. Ask for the $4/mo or $12/year digital retention offer.",
  },
  {
    merchant: "New York Times",
    aliases: ["New York Times", "NYT", "NY Times", "The New York Times"],
    type: "Subscription",
    tactic: "Start the online chat to cancel. State the price is too high. They almost always offer a $4/mo or $1/week retention rate for 12 months.",
  },
  {
    merchant: "Washington Post",
    aliases: ["Washington Post", "WaPo", "The Washington Post"],
    type: "Subscription",
    tactic: "Go to cancel online or call. Ask for the lowest retention rate, typically $29-$40/year.",
  },

  // Security Systems
  {
    merchant: "ADT",
    aliases: ["ADT", "ADT Security"],
    type: "Security",
    tactic: "Call and request the cancellation department. State you are switching to SimpliSafe or Ring because the monthly monitoring is too high. Ask them to lower it to match DIY systems (around $15-$20/mo).",
  },
];

/**
 * Checks if a given item name matches a known negotiable merchant.
 * @param {string} itemName 
 * @returns {Object|null} The merchant object if negotiable, or null.
 */
export function getNegotiableMerchant(itemName) {
  if (!itemName) return null;
  const normalized = itemName.toLowerCase().trim();
  
  for (const merchant of NEGOTIABLE_MERCHANTS) {
    for (const alias of merchant.aliases) {
      if (normalized.includes(alias.toLowerCase())) {
        return merchant;
      }
    }
  }
  return null;
}
