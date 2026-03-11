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

  // Car Insurance (Often negotiable via re-quoting)
  {
    merchant: "GEICO",
    aliases: ["GEICO", "Geico"],
    type: "Insurance",
    tactic: "Call and ask for a policy review. Mention you got a lower quote from Progressive or USAA. Ask about multi-policy, safe driver, and low-mileage discounts.",
  },
  {
    merchant: "State Farm",
    aliases: ["State Farm", "StateFarm"],
    type: "Insurance",
    tactic: "Ask your agent to re-quote your policy with higher deductibles. Mention a competitive quote from GEICO or Progressive and ask them to match it.",
  },
  {
    merchant: "Progressive",
    aliases: ["Progressive"],
    type: "Insurance",
    tactic: "Call and request a rate review. Ask about Snapshot/usage-based discounts and bundling with renters/homeowners insurance.",
  },

  // Gyms (High success rate — afraid of churn)
  {
    merchant: "Planet Fitness",
    aliases: ["Planet Fitness", "PF"],
    type: "Gym",
    tactic: "Visit in person (required by many locations). State you want to cancel or downgrade your Classic membership. They often offer 1-3 months free to retain you.",
  },
  {
    merchant: "LA Fitness",
    aliases: ["LA Fitness", "Esporta"],
    type: "Gym",
    tactic: "Call corporate (not your local gym). Tell them you want to cancel because of price. Ask for a reduced rate or month-to-month conversion.",
  },

  // Streaming (Retention offers are common)
  {
    merchant: "Hulu",
    aliases: ["Hulu"],
    type: "Streaming",
    tactic: "Start the online cancellation flow. On the 'Are you sure?' screen, Hulu frequently offers a discounted rate or free month. Always complete the flow to see the retention offer.",
  },
  {
    merchant: "YouTube TV",
    aliases: ["YouTube TV", "YTTV"],
    type: "Streaming",
    tactic: "Pause your membership for up to 6 months. YouTube TV often sends a re-activation discount via email after 2-3 weeks of being paused.",
  },
  {
    merchant: "Sling TV",
    aliases: ["Sling TV", "Sling"],
    type: "Streaming",
    tactic: "Cancel online. Sling frequently emails a 'come back' offer within 7 days with a significant monthly discount for 2-3 months.",
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
