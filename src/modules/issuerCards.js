import { db } from "./utils.js";

const CACHE_KEY = "issuer-cards-cache";
const CACHE_TS_KEY = "issuer-cards-updated";
const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;

export const DEFAULT_CATALOG = {
  lastUpdated: "2026-02-22",
  issuers: {
    "Amex": {
      personal: [
        "The Platinum Card from American Express",
        "American Express Gold Credit Card",
        "American Express Green Card",
        "American Express Blue Cash Everyday Card",
        "American Express Blue Cash Preferred Card",
        "Cash Magnet Card",
        "Delta SkyMiles Reserve American Express Card",
        "Delta SkyMiles Platinum American Express Card",
        "Delta SkyMiles Gold American Express Card",
        "Delta SkyMiles Blue American Express Card",
        "Hilton Honors American Express Card",
        "Hilton Honors American Express Surpass Card",
        "Hilton Honors American Express Aspire Card",
        "Marriott Bonvoy Brilliant American Express Card",
        "Marriott Bonvoy Bevy American Express Card",
        "Marriott Bonvoy American Express Card"
      ],
      business: [
        "The Business Platinum Card from American Express",
        "American Express Business Gold Card",
        "American Express Business Green Rewards Card",
        "The Plum Card",
        "American Express Blue Business Plus Card",
        "American Express Blue Business Cash Card",
        "Amazon Business Prime Card",
        "Amazon Business Card",
        "Delta SkyMiles Reserve Business American Express Card",
        "Delta SkyMiles Platinum Business American Express Card",
        "Delta SkyMiles Gold Business American Express Card",
        "Hilton Honors American Express Business Card",
        "Marriott Bonvoy Business American Express Card",
        "Lowe's Business Rewards Card",
        "Lowe's Business Credit Card"
      ]
    },
    "Chase": {
      personal: [
        "Chase Sapphire Reserve",
        "Chase Sapphire Preferred",
        "Chase Freedom Unlimited",
        "Chase Freedom Flex",
        "Chase Freedom Rise",
        "Slate",
        "Southwest Rapid Rewards Plus",
        "Southwest Rapid Rewards Priority",
        "Southwest Rapid Rewards Premier",
        "United Explorer",
        "United Quest",
        "United Gateway",
        "United Club Infinite",
        "Marriott Bonvoy Boundless",
        "Marriott Bonvoy Bountiful",
        "Marriott Bonvoy Bold",
        "IHG One Rewards Premier",
        "IHG One Rewards Traveler",
        "Disney Inspire Visa",
        "Disney Premier Visa",
        "Disney Visa",
        "World of Hyatt",
        "Aeroplan",
        "British Airways Visa Signature",
        "Aer Lingus Visa Signature",
        "Iberia Visa Signature",
        "Prime Visa",
        "Amazon Visa",
        "DoorDash Rewards Mastercard",
        "Instacart Mastercard"
      ],
      business: [
        "Sapphire Reserve for Business",
        "Ink Business Unlimited",
        "Ink Business Preferred",
        "Ink Business Cash",
        "Ink Business Premier",
        "Southwest Rapid Rewards Performance Business",
        "Southwest Rapid Rewards Premier Business",
        "United Business",
        "United Club Business",
        "IHG One Rewards Premier Business",
        "World of Hyatt Business"
      ]
    },
    "Discover": {
      personal: [
        "Discover it Cash Back",
        "Discover it Student Cash Back",
        "Discover it Student Chrome",
        "Discover it Secured",
        "Discover it Miles",
        "Discover it Chrome",
        "Discover NHL Credit Card"
      ],
      business: []
    },
    "Bank of America": {
      personal: [
        "Bank of America Customized Cash Rewards credit card",
        "Bank of America Unlimited Cash Rewards credit card",
        "Bank of America Travel Rewards credit card",
        "Bank of America Premium Rewards credit card",
        "Bank of America Premium Rewards Elite credit card",
        "Alaska Airlines Visa Signature credit card",
        "Free Spirit Travel More World Elite Mastercard"
      ],
      business: [
        "Business Advantage Customized Cash Rewards Mastercard",
        "Business Advantage Unlimited Cash Rewards Mastercard",
        "Business Advantage Travel Rewards World Mastercard",
        "Alaska Airlines Visa Business card"
      ]
    },
    "Barclays": {
      personal: [
        "JetBlue Plus Card",
        "JetBlue Card",
        "AAdvantage Aviator Red World Elite Mastercard",
        "AAdvantage Aviator Silver World Elite Mastercard",
        "Wyndham Rewards Earner Card",
        "Wyndham Rewards Earner Plus Card",
        "Choice Privileges Select Mastercard",
        "Choice Privileges Mastercard",
        "Hawaiian Airlines World Elite Mastercard",
        "Frontier Airlines World Mastercard",
        "Carnival World Mastercard",
        "Holland America Line Rewards Visa Card",
        "Princess Cruises Rewards Visa Card"
      ],
      business: [
        "JetBlue Business Card",
        "AAdvantage Aviator Business Mastercard",
        "Wyndham Rewards Earner Business Card",
        "Hawaiian Airlines Business Mastercard"
      ]
    },
    "Capital One": {
      personal: [
        "Quicksilver Cash Rewards",
        "QuicksilverOne Cash Rewards",
        "SavorOne Cash Rewards",
        "Savor Cash Rewards",
        "Venture Rewards",
        "Venture X Rewards",
        "VentureOne Rewards",
        "Platinum Mastercard"
      ],
      business: [
        "Spark Cash Plus",
        "Spark Cash Select",
        "Spark Miles for Business",
        "Spark Miles Select",
        "Venture X Business"
      ]
    },
    "Citi": {
      personal: [
        "Citi Custom Cash Card",
        "Citi / AAdvantage Platinum Select World Elite Mastercard",
        "American Airlines AAdvantage MileUp Card",
        "Citi / AAdvantage Executive World Elite Mastercard",
        "Citi / AAdvantage Globe Mastercard",
        "Citi Diamond Preferred Card",
        "Citi Double Cash Credit Card",
        "Costco Anywhere Visa Card by Citi",
        "Citi Simplicity Card",
        "Citi Strata Card",
        "Citi Strata Premier Card",
        "Citi Strata Elite Card",
        "Citi Secured Mastercard",
        "AT&T Points Plus Card From Citi",
        "Bloomingdale's Credit Cards",
        "Exxon Mobil Smart Card+ Credit Card",
        "L.L.Bean Mastercard",
        "My Best Buy Credit Cards",
        "Macy's Credit Cards",
        "Pro Xtra Credit Card",
        "The Home Depot Consumer Credit Card",
        "TSC Store Card",
        "TSC Visa Card",
        "Wayfair's Credit Cards"
      ],
      business: [
        "Citi / AAdvantage Business World Elite Mastercard",
        "Costco Anywhere Visa Business Card by Citi"
      ]
    },
    "FNBO": {
      personal: ["FNBO Evergreen Rewards Visa Card", "FNBO Getaway Rewards Visa Card"],
      business: ["Evergreen by FNBO Business Credit Card"]
    },
    "Goldman Sachs": {
      personal: ["Apple Card", "My GM Rewards Card"],
      business: []
    },
    "HSBC": {
      personal: ["HSBC Elite Credit Card", "HSBC Premier Credit Card"],
      business: []
    },
    "Navy Federal": {
      personal: [
        "cashRewards Credit Card",
        "Platinum Credit Card",
        "GO REWARDS Credit Card",
        "More Rewards American Express Card",
        "Visa Signature Flagship Rewards Credit Card",
        "nRewards Secured Credit Card"
      ],
      business: []
    },
    "PenFed": {
      personal: ["PenFed Power Cash Rewards Visa Signature", "PenFed Platinum Rewards Visa Signature", "PenFed Gold Visa Card"],
      business: []
    },
    "Synchrony": {
      personal: [
        "Verizon Visa Card",
        "Sam's Club Mastercard",
        "PayPal Cashback Mastercard",
        "Venmo Credit Card",
        "Walgreens Mastercard",
        "Rakuten Cash Back Visa",
        "Amazon Store Card",
        "Lowe's Advantage Card"
      ],
      business: ["Sam's Club Business Mastercard"]
    },
    "TD Bank": {
      personal: ["TD Double Up Credit Card", "TD Clear Credit Card", "TD Cash Credit Card", "Target Circle Credit Card"],
      business: ["TD Business Solutions Credit Card"]
    },
    "US Bank": {
      personal: [
        "U.S. Bank Altitude Reserve Visa Infinite Card",
        "U.S. Bank Altitude Go Visa Signature Card",
        "U.S. Bank Altitude Connect Visa Signature Card",
        "U.S. Bank Cash+ Visa Signature Card",
        "U.S. Bank Shopper Cash Rewards Visa Signature Card",
        "Kroger Rewards World Elite Mastercard",
        "Ralphs Rewards World Elite Mastercard"
      ],
      business: [
        "U.S. Bank Business Altitude Power World Elite Mastercard",
        "U.S. Bank Business Altitude Connect World Elite Mastercard",
        "U.S. Bank Business Leverage Visa Signature Card",
        "U.S. Bank Triple Cash Rewards Visa Business Card"
      ]
    },
    "USAA": {
      personal: ["USAA Cashback Rewards Plus American Express", "USAA Rate Advantage Visa Platinum", "USAA Rewards Visa Signature"],
      business: []
    },
    "Wells Fargo": {
      personal: [
        "Wells Fargo Active Cash Card",
        "Wells Fargo Autograph Card",
        "Wells Fargo Autograph Journey Card",
        "Wells Fargo Reflect Card",
        "Bilt World Elite Mastercard",
        "Choice Privileges Mastercard",
        "Choice Privileges Select Mastercard"
      ],
      business: [
        "Signify Business Cash Card by Wells Fargo"
      ]
    },
    "Citizens Bank": {
      personal: ["Citizens Cash Back Plus World Mastercard", "Citizens Clear Value Mastercard", "Citizens Bank Platinum Card"],
      business: ["Citizens Everyday Business Credit Card"]
    },
    "Elan Financial": {
      personal: ["Max Cash Preferred Card", "Everyday Rewards+ Card", "Platinum Card", "Travel Rewards+ Card"],
      business: ["Max Cash Preferred Business Card"]
    },
    "Fifth Third Bank": {
      personal: ["1.67% Cash/Back Visa", "Truly Simple Visa", "Stand By Me Visa", "Secured Card"],
      business: ["Business Rewards Visa"]
    },
    "PNC Bank": {
      personal: ["PNC Cash Rewards Visa", "PNC Core Visa", "PNC points Visa"],
      business: ["PNC Cash Rewards Visa Signature Business", "PNC points Visa Business"]
    },
    "Truist": {
      personal: ["Truist Enjoy Cash", "Truist Enjoy Travel", "Truist Enjoy Beyond", "Truist Future"],
      business: ["Truist Business Cash Rewards"]
    },
    "Other": {
      personal: [
        "Fidelity Rewards Visa Signature Card",
        "Robinhood Gold Card",
        "X1 Card",
        "Sofi Credit Card",
        "BlockFi Rewards Visa Signature Card",
        "Gemini Credit Card",
        "Nexo Card",
        "Crypto.com Visa Card",
        "Coinbase Card",
        "Petal 1 Visa Credit Card",
        "Petal 2 Visa Credit Card",
        "Tomo Credit Card",
        "Deserve EDU Mastercard",
        "Chime Credit Builder Visa Secured Credit Card",
        "Varo Believe Secured Credit Card",
        "Cred.ai Guaranty Card"
      ],
      business: [
        "Brex Card",
        "Ramp Card",
        "Divvy Corporate Card"
      ]
    }
  }
};

const defaultPopular = {
  "Amex": ["American Express Gold Credit Card", "The Platinum Card from American Express", "American Express Blue Cash Preferred Card"],
  "Chase": ["Chase Sapphire Preferred", "Chase Freedom Unlimited", "Chase Freedom Flex"],
  "Capital One": ["Venture Rewards", "SavorOne Cash Rewards", "Quicksilver Cash Rewards"],
  "Citi": ["Citi Custom Cash Card", "Citi Strata Premier Card", "Citi Double Cash Credit Card"],
  "Discover": ["Discover it Cash Back", "Discover it Miles", "Discover it Chrome"]
};

const remoteUrl = () => {
  const v = import.meta?.env?.VITE_CARDS_URL;
  if (v) return v;
  const proxy = import.meta?.env?.VITE_PROXY_URL;
  return proxy ? `${proxy.replace(/\/$/, "")}/cards` : "";
};

function mergeCatalog(localCatalog, remoteCatalog) {
  if (!remoteCatalog?.issuers) return localCatalog;
  const merged = { ...remoteCatalog, issuers: { ...remoteCatalog.issuers } };
  const localIssuers = localCatalog?.issuers || {};
  Object.keys(localIssuers).forEach((issuer) => {
    const local = localIssuers[issuer] || { personal: [], business: [], discontinued: [] };
    const remote = merged.issuers[issuer] || { personal: [], business: [], discontinued: [] };
    const key = (t, name) => `${t}:${name}`.toLowerCase();
    const remoteSet = new Set([
      ...(remote.personal || []).map(n => key("personal", n)),
      ...(remote.business || []).map(n => key("business", n))
    ]);
    const keepPersonal = (local.personal || []).filter(n => !remoteSet.has(key("personal", n)));
    const keepBusiness = (local.business || []).filter(n => !remoteSet.has(key("business", n)));
    merged.issuers[issuer] = {
      personal: [...(remote.personal || []), ...keepPersonal],
      business: [...(remote.business || []), ...keepBusiness],
      discontinued: Array.from(new Set([...(remote.discontinued || []), ...(local.discontinued || [])]))
    };
  });
  return merged;
}

export async function loadCardCatalog() {
  const cached = await db.get(CACHE_KEY);
  const cachedAt = await db.get(CACHE_TS_KEY);
  let catalog = cached || DEFAULT_CATALOG;
  let updatedAt = cachedAt || null;

  const shouldRefresh = !cachedAt || (Date.now() - cachedAt) > THIRTY_DAYS_MS;
  const url = remoteUrl();
  if (url && shouldRefresh) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const remote = await res.json();
        catalog = mergeCatalog(catalog, remote);
        updatedAt = Date.now();
        await db.set(CACHE_KEY, catalog);
        await db.set(CACHE_TS_KEY, updatedAt);
      }
    } catch {
      // Silent fail, use cache
    }
  }
  return { catalog, updatedAt };
}

export function getIssuerCards(issuer, catalog) {
  const source = catalog?.issuers || DEFAULT_CATALOG.issuers;
  const entry = source[issuer];
  if (!entry) return [];
  const disc = new Set((entry.discontinued || []).map(n => n.toLowerCase()));

  const rawCards = [
    ...(entry.personal || []).map(n => ({ name: n, type: "personal", status: disc.has(n.toLowerCase()) ? "discontinued" : "active" })),
    ...(entry.business || []).map(n => ({ name: n, type: "business", status: disc.has(n.toLowerCase()) ? "discontinued" : "active" }))
  ];

  // Guarantee absolute deduplication (case-insensitive)
  const uniqueCards = [];
  const seen = new Set();
  for (const c of rawCards) {
    const key = c.name.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueCards.push(c);
    }
  }
  return uniqueCards;
}

export function getPinnedForIssuer(issuer, catalog) {
  const pinned = (catalog?.popular && catalog.popular[issuer]) || defaultPopular[issuer] || [];
  return pinned;
}
