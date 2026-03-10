// ═══════════════════════════════════════════════════════════════
// MERCHANT DATABASE - Instant Offline Auto-Suggest
// ═══════════════════════════════════════════════════════════════
// Popular merchants with their exact reward categories and brand
// colors for beautiful native UI rendering. ~200+ entries.

export let MERCHANT_DATABASE = [
  // ── Dining & Fast Food ──
  { id: "mcdonalds", name: "McDonald's", category: "dining", color: "#E31837" },
  { id: "starbucks", name: "Starbucks", category: "dining", color: "#00704A" },
  { id: "chipotle", name: "Chipotle", category: "dining", color: "#451400" },
  { id: "chick_fil_a", name: "Chick-fil-A", category: "dining", color: "#E51636" },
  { id: "wendys", name: "Wendy's", category: "dining", color: "#E20030" },
  { id: "burger_king", name: "Burger King", category: "dining", color: "#DA291C" },
  { id: "taco_bell", name: "Taco Bell", category: "dining", color: "#702082" },
  { id: "subway", name: "Subway", category: "dining", color: "#008C15" },
  { id: "dominos", name: "Domino's Pizza", category: "dining", color: "#006491" },
  { id: "pizza_hut", name: "Pizza Hut", category: "dining", color: "#EE3124" },
  { id: "panera", name: "Panera Bread", category: "dining", color: "#4B713D" },
  { id: "panda_express", name: "Panda Express", category: "dining", color: "#D31145" },
  { id: "dunkin", name: "Dunkin'", category: "dining", color: "#FF671F" },
  { id: "olive_garden", name: "Olive Garden", category: "dining", color: "#2B4726" },
  { id: "applebees", name: "Applebee's", category: "dining", color: "#C8102E" },
  { id: "texas_roadhouse", name: "Texas Roadhouse", category: "dining", color: "#E03A3E" },
  { id: "buffalo_wild_wings", name: "Buffalo Wild Wings", category: "dining", color: "#FFC20E" },
  { id: "outback", name: "Outback Steakhouse", category: "dining", color: "#BA0C2F" },
  { id: "doordash", name: "DoorDash", category: "dining", color: "#FF3008" },
  { id: "uber_eats", name: "Uber Eats", category: "dining", color: "#06C167" },
  { id: "grubhub", name: "Grubhub", category: "dining", color: "#F06428" },
  { id: "five_guys", name: "Five Guys", category: "dining", color: "#C8102E" },
  { id: "in_n_out", name: "In-N-Out Burger", category: "dining", color: "#DA291C" },
  { id: "shake_shack", name: "Shake Shack", category: "dining", color: "#2D2926" },
  { id: "ihop", name: "IHOP", category: "dining", color: "#005DAA" },
  { id: "dennys", name: "Denny's", category: "dining", color: "#FFC72C" },
  { id: "waffle_house", name: "Waffle House", category: "dining", color: "#FDB913" },
  { id: "wingstop", name: "Wingstop", category: "dining", color: "#007A33" },
  { id: "raising_canes", name: "Raising Cane's", category: "dining", color: "#E51636" },
  { id: "popeyes", name: "Popeyes", category: "dining", color: "#F47B20" },
  { id: "kfc", name: "KFC", category: "dining", color: "#F40027" },
  { id: "sonic", name: "Sonic Drive-In", category: "dining", color: "#003F87" },
  { id: "jack_in_the_box", name: "Jack in the Box", category: "dining", color: "#E31837" },
  { id: "arbys", name: "Arby's", category: "dining", color: "#D22630" },
  { id: "papa_johns", name: "Papa Johns", category: "dining", color: "#006341" },
  { id: "little_caesars", name: "Little Caesars", category: "dining", color: "#EA6A22" },
  { id: "cracker_barrel", name: "Cracker Barrel", category: "dining", color: "#86652B" },
  { id: "red_lobster", name: "Red Lobster", category: "dining", color: "#B51A25" },
  { id: "cheesecake_factory", name: "The Cheesecake Factory", category: "dining", color: "#8B6914" },
  { id: "chilis", name: "Chili's", category: "dining", color: "#006341" },
  { id: "tgi_fridays", name: "TGI Friday's", category: "dining", color: "#C8102E" },
  { id: "sweetgreen", name: "Sweetgreen", category: "dining", color: "#2D5E1E" },
  { id: "cava", name: "CAVA", category: "dining", color: "#2C5234" },
  { id: "noodles_co", name: "Noodles & Company", category: "dining", color: "#C8102E" },

  // ── Groceries ──
  { id: "walmart_grocery", name: "Walmart Grocery", category: "groceries", color: "#0071CE" },
  { id: "target_grocery", name: "Target Grocery", category: "groceries", color: "#E31837" },
  { id: "kroger", name: "Kroger", category: "groceries", color: "#005CAB" },
  { id: "publix", name: "Publix", category: "groceries", color: "#3B7321" },
  { id: "safeway", name: "Safeway", category: "groceries", color: "#E31837" },
  { id: "albertsons", name: "Albertsons", category: "groceries", color: "#00478F" },
  { id: "whole_foods", name: "Whole Foods Market", category: "groceries", color: "#00674B" },
  { id: "trader_joes", name: "Trader Joe's", category: "groceries", color: "#CE2029" },
  { id: "aldi", name: "ALDI", category: "groceries", color: "#003E69" },
  { id: "heb", name: "H-E-B", category: "groceries", color: "#E2231A" },
  { id: "meijer", name: "Meijer", category: "groceries", color: "#003A70" },
  { id: "wegmans", name: "Wegmans", category: "groceries", color: "#AE132A" },
  { id: "instacart", name: "Instacart", category: "groceries", color: "#0B8C3A" },
  { id: "food_lion", name: "Food Lion", category: "groceries", color: "#E21837" },
  { id: "giant_eagle", name: "Giant Eagle", category: "groceries", color: "#C8102E" },
  { id: "sprouts", name: "Sprouts Farmers Market", category: "groceries", color: "#6AAE4C" },
  { id: "stop_shop", name: "Stop & Shop", category: "groceries", color: "#E11A2C" },
  { id: "winco", name: "WinCo Foods", category: "groceries", color: "#003572" },
  { id: "harris_teeter", name: "Harris Teeter", category: "groceries", color: "#D22630" },
  { id: "piggly_wiggly", name: "Piggly Wiggly", category: "groceries", color: "#E31837" },
  { id: "food4less", name: "Food 4 Less", category: "groceries", color: "#C8102E" },
  { id: "giant_food", name: "Giant Food", category: "groceries", color: "#592C82" },
  { id: "shoprite", name: "ShopRite", category: "groceries", color: "#C8102E" },

  // ── Wholesale Clubs ──
  { id: "costco", name: "Costco", category: "wholesale_clubs", color: "#E31837" },
  { id: "sams_club", name: "Sam's Club", category: "wholesale_clubs", color: "#0067A0" },
  { id: "bjs_wholesale", name: "BJ's Wholesale Club", category: "wholesale_clubs", color: "#E31837" },
  { id: "target", name: "Target", category: "wholesale_clubs", color: "#E31837" },
  { id: "walmart_supercenter", name: "Walmart Supercenter", category: "wholesale_clubs", color: "#0071CE" },

  // ── Online Retailers ──
  { id: "amazon", name: "Amazon", category: "online_shopping", color: "#FF9900" },
  { id: "ebay", name: "eBay", category: "online_shopping", color: "#E53238" },
  { id: "etsy", name: "Etsy", category: "online_shopping", color: "#F1641E" },
  { id: "wayfair", name: "Wayfair", category: "online_shopping", color: "#30195C" },
  { id: "overstock", name: "Overstock", category: "online_shopping", color: "#C7202C" },
  { id: "newegg", name: "Newegg", category: "online_shopping", color: "#ECA313" },
  { id: "zappos", name: "Zappos", category: "online_shopping", color: "#003953" },
  { id: "shein", name: "SHEIN", category: "online_shopping", color: "#000000" },
  { id: "temu", name: "Temu", category: "online_shopping", color: "#FF6600" },
  { id: "asos", name: "ASOS", category: "online_shopping", color: "#000000" },
  { id: "walmart_com", name: "Walmart.com", category: "online_shopping", color: "#0071CE" },
  { id: "stockx", name: "StockX", category: "online_shopping", color: "#006340" },
  { id: "poshmark", name: "Poshmark", category: "online_shopping", color: "#C8102E" },
  { id: "thredup", name: "ThredUp", category: "online_shopping", color: "#006341" },
  { id: "mercari", name: "Mercari", category: "online_shopping", color: "#4DC3FF" },

  // ── General Retail (catch-all) — Physical stores don't code as online shopping ──
  { id: "apple_store", name: "Apple Store", category: "catch-all", color: "#000000" },
  { id: "best_buy", name: "Best Buy", category: "catch-all", color: "#0046BE" },
  { id: "home_depot", name: "The Home Depot", category: "catch-all", color: "#F96302" },
  { id: "lowes", name: "Lowe's", category: "catch-all", color: "#004990" },
  { id: "ikea", name: "IKEA", category: "catch-all", color: "#0051BA" },
  { id: "sephora", name: "Sephora", category: "catch-all", color: "#000000" },
  { id: "ulta", name: "Ulta Beauty", category: "catch-all", color: "#F47D30" },
  { id: "macys", name: "Macy's", category: "catch-all", color: "#E21A2C" },
  { id: "nordstrom", name: "Nordstrom", category: "catch-all", color: "#000000" },
  { id: "nike", name: "Nike", category: "catch-all", color: "#111111" },
  { id: "adidas", name: "adidas", category: "catch-all", color: "#000000" },
  { id: "lululemon", name: "lululemon", category: "catch-all", color: "#D22030" },
  { id: "chewy", name: "Chewy", category: "online_shopping", color: "#1C4CBF" },
  { id: "petsmart", name: "PetSmart", category: "catch-all", color: "#C8102E" },
  { id: "petco", name: "Petco", category: "catch-all", color: "#0079C2" },
  { id: "zara", name: "Zara", category: "catch-all", color: "#000000" },
  { id: "hm", name: "H&M", category: "catch-all", color: "#E50010" },
  { id: "uniqlo", name: "Uniqlo", category: "catch-all", color: "#FF0000" },
  { id: "under_armour", name: "Under Armour", category: "catch-all", color: "#1D1D1D" },
  { id: "new_balance", name: "New Balance", category: "catch-all", color: "#CF0A2C" },
  { id: "crate_barrel", name: "Crate & Barrel", category: "catch-all", color: "#000000" },
  { id: "pottery_barn", name: "Pottery Barn", category: "catch-all", color: "#000000" },
  { id: "williams_sonoma", name: "Williams-Sonoma", category: "catch-all", color: "#000000" },
  { id: "rh", name: "Restoration Hardware", category: "catch-all", color: "#000000" },
  { id: "gamestop", name: "GameStop", category: "catch-all", color: "#E31837" },
  { id: "foot_locker", name: "Foot Locker", category: "catch-all", color: "#E31837" },
  { id: "finish_line", name: "Finish Line", category: "catch-all", color: "#0033A0" },
  { id: "champs", name: "Champs Sports", category: "catch-all", color: "#C8102E" },
  { id: "dicks", name: "DICK'S Sporting Goods", category: "catch-all", color: "#006400" },
  { id: "rei", name: "REI", category: "catch-all", color: "#000000" },
  { id: "hollister", name: "Hollister", category: "catch-all", color: "#000000" },
  { id: "abercrombie", name: "Abercrombie & Fitch", category: "catch-all", color: "#000000" },
  { id: "american_eagle", name: "American Eagle", category: "catch-all", color: "#000000" },
  { id: "urban_outfitters", name: "Urban Outfitters", category: "catch-all", color: "#000000" },
  { id: "anthropologie", name: "Anthropologie", category: "catch-all", color: "#000000" },
  { id: "old_navy", name: "Old Navy", category: "catch-all", color: "#000080" },
  { id: "gap", name: "Gap", category: "catch-all", color: "#000066" },
  { id: "banana_republic", name: "Banana Republic", category: "catch-all", color: "#000000" },
  { id: "jcrew", name: "J.Crew", category: "catch-all", color: "#000000" },
  { id: "express", name: "Express", category: "catch-all", color: "#000000" },
  { id: "forever_21", name: "Forever 21", category: "catch-all", color: "#000000" },
  { id: "tj_maxx", name: "T.J. Maxx", category: "catch-all", color: "#D22630" },
  { id: "marshalls", name: "Marshalls", category: "catch-all", color: "#005CAB" },
  { id: "burlington", name: "Burlington", category: "catch-all", color: "#E31837" },
  { id: "ross", name: "Ross Dress for Less", category: "catch-all", color: "#005CAB" },
  { id: "jcpenney", name: "JCPenney", category: "catch-all", color: "#E31837" },
  { id: "kohl", name: "Kohl's", category: "catch-all", color: "#000000" },
  { id: "dillard", name: "Dillard's", category: "catch-all", color: "#000000" },
  { id: "bloomingdales", name: "Bloomingdale's", category: "catch-all", color: "#000000" },
  { id: "saks", name: "Saks Fifth Avenue", category: "catch-all", color: "#000000" },
  { id: "neiman_marcus", name: "Neiman Marcus", category: "catch-all", color: "#000000" },
  { id: "michaels", name: "Michaels", category: "catch-all", color: "#E31837" },
  { id: "joann", name: "JOANN", category: "catch-all", color: "#005CAB" },

  // ── Gas Stations ──
  { id: "shell", name: "Shell", category: "gas", color: "#FBCE07" },
  { id: "exxon", name: "Exxon", category: "gas", color: "#C8102E" },
  { id: "chevron", name: "Chevron", category: "gas", color: "#00549A" },
  { id: "bp", name: "BP", category: "gas", color: "#009900" },
  { id: "speedway", name: "Speedway", category: "gas", color: "#E31837" },
  { id: "wawa", name: "Wawa", category: "gas", color: "#C8102E" },
  { id: "qt", name: "QuikTrip", category: "gas", color: "#E31837" },
  { id: "sheetz", name: "Sheetz", category: "gas", color: "#DA291C" },
  { id: "circle_k", name: "Circle K", category: "gas", color: "#D71920" },
  { id: "marathon", name: "Marathon", category: "gas", color: "#005CAB" },
  { id: "sunoco", name: "Sunoco", category: "gas", color: "#FED100" },
  { id: "seven_eleven", name: "7-Eleven", category: "gas", color: "#F7941D" },
  { id: "racetrac", name: "RaceTrac", category: "gas", color: "#FCAF17" },
  { id: "caseys", name: "Casey's", category: "gas", color: "#E31837" },
  { id: "murphy_usa", name: "Murphy USA", category: "gas", color: "#00529B" },
  { id: "costco_gas", name: "Costco Gas", category: "gas", color: "#E31837" },
  { id: "bucees", name: "Buc-ee's", category: "gas", color: "#FFC72C" },
  { id: "pilot", name: "Pilot Flying J", category: "gas", color: "#D00000" },
  { id: "loves", name: "Love's Travel Stops", category: "gas", color: "#FFC20E" },

  // ── Travel (Airlines, Hotels, Car Rentals) ──
  { id: "delta", name: "Delta Air Lines", category: "travel", color: "#E3132C" },
  { id: "american_airlines", name: "American Airlines", category: "travel", color: "#1782D2" },
  { id: "united", name: "United Airlines", category: "travel", color: "#005DAA" },
  { id: "southwest", name: "Southwest Airlines", category: "travel", color: "#111B54" },
  { id: "jetblue", name: "JetBlue", category: "travel", color: "#003876" },
  { id: "alaska_airlines", name: "Alaska Airlines", category: "travel", color: "#01426A" },
  { id: "spirit", name: "Spirit Airlines", category: "travel", color: "#FFD200" },
  { id: "frontier", name: "Frontier Airlines", category: "travel", color: "#006341" },
  { id: "hawaiian", name: "Hawaiian Airlines", category: "travel", color: "#4A1E6D" },
  { id: "allegiant", name: "Allegiant Air", category: "travel", color: "#F7941D" },
  { id: "marriott", name: "Marriott", category: "travel", color: "#B8143F" },
  { id: "hilton", name: "Hilton", category: "travel", color: "#003A70" },
  { id: "hyatt", name: "Hyatt", category: "travel", color: "#0F2D52" },
  { id: "ihg", name: "IHG", category: "travel", color: "#D96932" },
  { id: "wyndham", name: "Wyndham", category: "travel", color: "#00A4D6" },
  { id: "best_western", name: "Best Western", category: "travel", color: "#00529B" },
  { id: "airbnb", name: "Airbnb", category: "travel", color: "#FF5A5F" },
  { id: "expedia", name: "Expedia", category: "travel", color: "#FDB813" },
  { id: "booking_com", name: "Booking.com", category: "travel", color: "#003580" },
  { id: "priceline", name: "Priceline", category: "travel", color: "#0068EF" },
  { id: "kayak", name: "KAYAK", category: "travel", color: "#FF690F" },
  { id: "turo", name: "Turo", category: "travel", color: "#593CFB" },
  { id: "enterprise", name: "Enterprise", category: "travel", color: "#006C5B" },
  { id: "hertz", name: "Hertz", category: "travel", color: "#FFD700" },
  { id: "avis", name: "Avis", category: "travel", color: "#D50032" },
  { id: "national", name: "National Car Rental", category: "travel", color: "#006400" },

  // ── Transit & Rideshare ──
  { id: "uber", name: "Uber", category: "transit", color: "#000000" },
  { id: "lyft", name: "Lyft", category: "transit", color: "#FF00BF" },
  { id: "amtrak", name: "Amtrak", category: "transit", color: "#004D79" },
  { id: "mta", name: "MTA (Subway & Bus)", category: "transit", color: "#0039A6" },
  { id: "nj_transit", name: "NJ Transit", category: "transit", color: "#F18A00" },
  { id: "bart", name: "BART", category: "transit", color: "#0099CC" },
  { id: "lime", name: "Lime", category: "transit", color: "#00FF00" },
  { id: "bird", name: "Bird", category: "transit", color: "#000000" },
  { id: "caltrain", name: "Caltrain", category: "transit", color: "#E31837" },
  { id: "wmata", name: "WMATA (DC Metro)", category: "transit", color: "#D4901E" },
  { id: "cta", name: "CTA (Chicago L)", category: "transit", color: "#00A1DE" },
  { id: "mbta", name: "MBTA", category: "transit", color: "#003DA5" },
  { id: "spin", name: "Spin", category: "transit", color: "#F97316" },
  { id: "zipcar", name: "Zipcar", category: "transit", color: "#006400" },

  // ── Streaming & Subscriptions ──
  { id: "netflix", name: "Netflix", category: "streaming", color: "#E50914" },
  { id: "spotify", name: "Spotify", category: "streaming", color: "#1DB954" },
  { id: "hulu", name: "Hulu", category: "streaming", color: "#1CE783" },
  { id: "disney_plus", name: "Disney+", category: "streaming", color: "#113CCF" },
  { id: "hbo_max", name: "Max (HBO)", category: "streaming", color: "#5400D5" },
  { id: "apple_tv", name: "Apple TV+", category: "streaming", color: "#000000" },
  { id: "youtube_tv", name: "YouTube TV", category: "streaming", color: "#FF0000" },
  { id: "peacock", name: "Peacock", category: "streaming", color: "#0E0E0E" },
  { id: "paramount_plus", name: "Paramount+", category: "streaming", color: "#0064FF" },
  { id: "amazon_prime", name: "Amazon Prime", category: "streaming", color: "#00A8E1" },

  // ── Drugstores & Pharmacies ──
  { id: "cvs", name: "CVS Pharmacy", category: "drugstores", color: "#CC0000" },
  { id: "walgreens", name: "Walgreens", category: "drugstores", color: "#E31837" },
  { id: "rite_aid", name: "Rite Aid", category: "drugstores", color: "#0033A0" },
  { id: "duane_reade", name: "Duane Reade", category: "drugstores", color: "#E31837" },
];

/**
 * Overwrites the local constants using an Over-The-Air JSON payload.
 */
export function injectOTAMerchants(newMerchants) {
  if (Array.isArray(newMerchants) && newMerchants.length > 0) {
    MERCHANT_DATABASE = newMerchants;
  }
}

/**
 * Heuristic keyword matcher for ultra-fast offline categorization.
 * Runs before the AI fallback to handle local merchants instantly.
 */
export function extractCategoryByKeywords(query) {
  if (!query) return null;
  const q = query.toLowerCase();

  const rules = [
    { cat: "dining", words: ["pizza", "burger", "grill", "cafe", "coffee", "restaurant", "pub", "tavern", "bistro", "diner", "steak", "sushi", "taco", "deli", "bakery", "bbq", "house", "kitchen", "bar", "lounge"] },
    { cat: "groceries", words: ["market", "grocery", "foods", "supermarket", "farm"] },
    { cat: "gas", words: ["gas", "auto", "tire", "oil", "service station", "car wash"] },
    { cat: "travel", words: ["airline", "motel", "inn", "hotel", "resort", "bed & breakfast"] },
    { cat: "transit", words: ["mta", "transit", "authority", "metro", "parking", "garage", "towing"] },
    { cat: "drugstores", words: ["pharmacy", "drugstore", "rx", "apothecary"] }
  ];

  for (const rule of rules) {
    for (const word of rule.words) {
      // Must be a whole word match (e.g., 'bar' matches 'Joe\'s Bar' but not 'Barclays')
      const regex = new RegExp(`\\b${word}\\b`, 'i');
      if (regex.test(q)) {
        return rule.cat;
      }
    }
  }

  return null;
}
