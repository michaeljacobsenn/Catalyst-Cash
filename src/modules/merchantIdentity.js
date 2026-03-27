const BRAND_ALIASES = {
  doordash: ["doordash", "dashpass", "caviar"],
  instacart: ["instacart"],
  united: ["united", "united airlines"],
  delta: ["delta", "delta air lines", "delta airlines"],
  southwest: ["southwest", "southwest airlines"],
  marriott: [
    "marriott",
    "jw marriott",
    "courtyard",
    "residence inn",
    "fairfield inn",
    "springhill suites",
    "towneplace suites",
    "ritz carlton",
    "ritz-carlton",
    "sheraton",
    "westin",
    "st regis",
    "st. regis",
    "aloft",
    "le meridien",
    "autograph collection",
    "moxy",
    "w hotels",
  ],
  hilton: [
    "hilton",
    "hampton",
    "doubletree",
    "embassy suites",
    "homewood suites",
    "home2 suites",
    "tru by hilton",
    "curio",
    "conrad",
    "waldorf",
    "canopy",
    "tempo by hilton",
    "spark by hilton",
    "tapestry",
  ],
  hyatt: [
    "hyatt",
    "grand hyatt",
    "park hyatt",
    "hyatt place",
    "hyatt house",
    "caption by hyatt",
    "andaz",
    "alila",
    "thompson",
  ],
  amazon: ["amazon", "amazon marketplace", "amzn"],
  wholefoods: ["whole foods", "wholefds"],
  walmart: ["walmart", "wal-mart"],
  target: ["target"],
  costco: ["costco", "costco gas"],
  samsclub: ["sam s club", "sam's club"],
  paypal: ["paypal"],
  airbnb: ["airbnb"],
  vrbo: ["vrbo"],
  chase_travel: ["chase travel", "chase travel portal"],
  capital_one_travel: ["capital one travel", "cap one travel"],
  amex_travel: ["amex travel", "american express travel"],
  citi_travel: ["citi travel"],
  expedia: ["expedia"],
  booking: ["booking.com", "booking com", "booking"],
  hotelsdotcom: ["hotels.com", "hotels com"],
  travelocity: ["travelocity"],
  orbitz: ["orbitz"],
  priceline: ["priceline"],
  kayak: ["kayak"],
  netflix: ["netflix"],
  spotify: ["spotify"],
  hulu: ["hulu"],
  disneyplus: ["disney plus", "disney+"],
  cvs: ["cvs", "cvs pharmacy"],
  walgreens: ["walgreens"],
};

const REWARD_CATEGORY_KEYWORDS = {
  dining: ["restaurant", "dining", "coffee", "cafe", "eatery", "bar", "grill"],
  groceries: ["grocery", "market", "supermarket", "foods"],
  gas: ["fuel", "gas", "gasoline"],
  travel: ["travel", "airline", "flight", "hotel", "lodging", "resort", "rental car", "vacation"],
  transit: ["transit", "uber", "lyft", "metro", "train", "parking", "toll", "taxi"],
  online_shopping: ["online", "ecommerce", "marketplace", "retail", "shopping"],
  wholesale_clubs: ["wholesale", "club"],
  streaming: ["streaming", "subscription", "video", "music"],
  drugstores: ["pharmacy", "drugstore", "drug store"],
};

const TRAVEL_PORTAL_PATTERNS = [
  "expedia",
  "booking",
  "hotels.com",
  "travelocity",
  "orbitz",
  "priceline",
  "kayak",
  "travel portal",
];

const AIRLINE_BRANDS = new Set(["united", "delta", "southwest"]);
const HOTEL_BRANDS = new Set(["marriott", "hilton", "hyatt"]);

const MCC_CATEGORY_MAP = new Map([
  [5411, "groceries"],
  [5422, "groceries"],
  [5441, "groceries"],
  [5451, "groceries"],
  [5462, "groceries"],
  [5499, "groceries"],
  [5541, "gas"],
  [5542, "gas"],
  [5812, "dining"],
  [5814, "dining"],
  [5912, "drugstores"],
  [4111, "transit"],
  [4121, "transit"],
  [4131, "transit"],
  [4784, "transit"],
  [4789, "transit"],
  [4722, "travel"],
  [7011, "travel"],
  [3351, "travel"],
  [3352, "travel"],
  [3353, "travel"],
  [3354, "travel"],
  [3355, "travel"],
  [3357, "travel"],
  [3366, "travel"],
  [3387, "travel"],
  [3390, "travel"],
  [3405, "travel"],
  [3409, "travel"],
  [3412, "travel"],
  [7512, "travel"],
  [5300, "wholesale_clubs"],
  [5301, "wholesale_clubs"],
  [5968, "online_shopping"],
  [5969, "online_shopping"],
  [4899, "streaming"],
]);

function parseMcc(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric);
}

export function normalizeMerchantString(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function includesAny(normalized, values) {
  return values.some((value) => normalized.includes(value));
}

function inferCategoryFromMcc(mcc) {
  if (mcc == null) return null;
  if (MCC_CATEGORY_MAP.has(mcc)) return MCC_CATEGORY_MAP.get(mcc);
  if (mcc >= 3000 && mcc <= 3299) return "travel";
  if (mcc >= 3300 && mcc <= 3499) return "travel";
  if (mcc >= 3500 && mcc <= 3999) return "travel";
  if (mcc === 4511) return "travel";
  return null;
}

function inferBrand(normalizedName) {
  let bestBrand = null;
  let bestLength = 0;
  for (const [brand, aliases] of Object.entries(BRAND_ALIASES)) {
    for (const alias of aliases) {
      if (normalizedName.includes(alias) && alias.length > bestLength) {
        bestBrand = brand;
        bestLength = alias.length;
      }
    }
  }
  return bestBrand;
}

function inferTravelPortalBrand(normalized) {
  if (!normalized) return null;
  if (includesAny(normalized, BRAND_ALIASES.chase_travel)) return "chase_travel";
  if (includesAny(normalized, BRAND_ALIASES.capital_one_travel)) return "capital_one_travel";
  if (includesAny(normalized, BRAND_ALIASES.amex_travel)) return "amex_travel";
  if (includesAny(normalized, BRAND_ALIASES.citi_travel)) return "citi_travel";
  if (includesAny(normalized, BRAND_ALIASES.expedia)) return "expedia";
  if (includesAny(normalized, BRAND_ALIASES.booking)) return "booking";
  if (includesAny(normalized, BRAND_ALIASES.hotelsdotcom)) return "hotelsdotcom";
  if (includesAny(normalized, BRAND_ALIASES.travelocity)) return "travelocity";
  if (includesAny(normalized, BRAND_ALIASES.orbitz)) return "orbitz";
  if (includesAny(normalized, BRAND_ALIASES.priceline)) return "priceline";
  if (includesAny(normalized, BRAND_ALIASES.kayak)) return "kayak";
  return null;
}

function inferCategoryFromKeywords(normalized) {
  for (const [category, keywords] of Object.entries(REWARD_CATEGORY_KEYWORDS)) {
    if (includesAny(normalized, keywords)) return category;
  }
  return null;
}

export function inferMerchantIdentity(input = {}) {
  const merchantName = input.merchantName || input.name || input.description || "";
  const fallbackCategory = normalizeMerchantString(input.category || input.subcategory || "");
  const normalizedName = normalizeMerchantString(merchantName);
  const normalizedWebsite = normalizeMerchantString(input.website || input.merchantWebsite || "");
  const normalizedBookingChannel = normalizeMerchantString(input.bookingChannel || input.portal || "");
  const mcc = parseMcc(input.mcc || input.merchantMcc || input.merchantCategoryCode);
  const brand = inferBrand(`${normalizedName} ${normalizedWebsite}`.trim());
  const mccCategory = inferCategoryFromMcc(mcc);
  const keywordCategory = inferCategoryFromKeywords(`${normalizedName} ${normalizedWebsite} ${fallbackCategory}`.trim());
  const travelPortalBrand =
    inferTravelPortalBrand(`${normalizedBookingChannel} ${normalizedWebsite} ${normalizedName}`.trim()) ||
    null;
  const isTravelPortal =
    Boolean(travelPortalBrand) ||
    includesAny(normalizedName, TRAVEL_PORTAL_PATTERNS) ||
    includesAny(normalizedWebsite, TRAVEL_PORTAL_PATTERNS) ||
    includesAny(normalizedBookingChannel, TRAVEL_PORTAL_PATTERNS);

  let merchantType = null;
  if (brand && AIRLINE_BRANDS.has(brand)) merchantType = "airline";
  else if (brand && HOTEL_BRANDS.has(brand)) merchantType = "hotel";
  else if (mcc === 7011) merchantType = "hotel";
  else if (mcc === 4511 || (mcc != null && mcc >= 3000 && mcc <= 3299)) merchantType = "airline";
  else if ((mcc != null && mcc >= 3351 && mcc <= 3441) || mcc === 7512) merchantType = "rental_car";
  else if (fallbackCategory === "travel" && keywordCategory === "travel") merchantType = "travel";

  let rewardCategory = mccCategory || null;
  if (!rewardCategory && brand === "doordash") rewardCategory = "dining";
  if (!rewardCategory && brand === "instacart") rewardCategory = "groceries";
  if (!rewardCategory && ["netflix", "spotify", "hulu", "disneyplus"].includes(brand || "")) rewardCategory = "streaming";
  if (!rewardCategory && ["cvs", "walgreens"].includes(brand || "")) rewardCategory = "drugstores";
  if (!rewardCategory && ["costco", "samsclub"].includes(brand || "")) rewardCategory = "wholesale_clubs";
  if (!rewardCategory && ["amazon"].includes(brand || "")) rewardCategory = "online_shopping";
  if (!rewardCategory && keywordCategory) rewardCategory = keywordCategory;
  if (!rewardCategory && fallbackCategory) rewardCategory = fallbackCategory;

  const merchantKey =
    String(input.merchantId || "").trim() ||
    (brand ? `brand:${brand}` : "") ||
    normalizedName ||
    "";

  let confidence = "low";
  if (String(input.merchantId || "").trim() || mcc != null) confidence = "high";
  else if (brand || keywordCategory || fallbackCategory) confidence = "medium";

  return {
    merchantId: String(input.merchantId || "").trim() || null,
    merchantName: String(merchantName || "").trim() || null,
    normalizedName,
    merchantKey: merchantKey || null,
    merchantBrand: brand,
    merchantType,
    merchantMcc: mcc,
    rewardCategory: rewardCategory || null,
    isTravelPortal,
    travelPortalBrand,
    isDirectTravelMerchant: Boolean(merchantType === "airline" || merchantType === "hotel") && !isTravelPortal,
    confidence,
  };
}
