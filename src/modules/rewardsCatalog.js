/**
 * Catalyst Cash - Advanced Rewards Catalog (100/100 Implementation)
 *
 * An ultra-precise taxonomy of base multipliers, point valuations, and spending caps
 * for popular credit cards. Used by the Card Wizard AI to calculate the highest mathematical yield.
 *
 * Categories: dining, groceries, gas, travel, transit, online_shopping, wholesale_clubs, streaming, drugstores, catch-all
 */

// Point Valuations (Cents Per Point/Mile)
// Used to normalize 3x points vs 3% cash back.
export let VALUATIONS = {
  CHASE_UR: 1.5,         // Sapphire Reserve / transfer partners
  AMEX_MR: 1.5,          // Standard transfer partner valuation
  CAPITAL_ONE: 1.4,
  CITI_TYP: 1.3,
  BILT: 1.5,
  CASH: 1.0,
  // Airline & Hotel Currencies
  DELTA_SKYMILES: 1.2,
  UNITED_MILES: 1.3,
  AA_AADVANTAGE: 1.4,
  SOUTHWEST_RR: 1.4,
  HILTON_HONORS: 0.5,
  MARRIOTT_BONVOY: 0.7,
  HYATT_POINTS: 1.7,
  IHG_POINTS: 0.5,
  JETBLUE_POINTS: 1.3,
  ALASKA_MILES: 1.8,
  AEROPLAN: 1.5,
  AVIOS: 1.5,
  WYNDHAM: 1.1,
  // Other Bank Currencies
  WELLS_FARGO: 1.0,
  DISCOVER: 1.0,
  BOFA_POINTS: 1.0,
};

export let REWARDS_CATALOG = {

  // ════════════════════════════════════════════════════════════
  // CHASE
  // ════════════════════════════════════════════════════════════
  "Chase Sapphire Reserve": {
    currency: "CHASE_UR",
    dining: 3, travel: 3, "catch-all": 1
  },
  "Chase Sapphire Preferred": {
    currency: "CHASE_UR",
    dining: 3, travel: 2, online_shopping: 3, streaming: 3, "catch-all": 1
  },
  "Chase Freedom Unlimited": {
    currency: "CHASE_UR",
    dining: 3, drugstores: 3, travel: 5, "catch-all": 1.5
  },
  "Chase Freedom Flex": {
    currency: "CHASE_UR",
    dining: 3, drugstores: 3, travel: 5, "catch-all": 1,
    rotating: 5,
    caps: { rotating: 1500 },
    notes: "5% rotating quarterly categories (up to $1,500/quarter, activation required). 3x dining/drugstores, 5x travel via Chase portal."
  },
  "Chase Freedom Rise": {
    currency: "CHASE_UR",
    "catch-all": 1.5
  },
  "Slate": {
    currency: "CASH", "catch-all": 1,
    notes: "0% intro APR card. No rewards program."
  },
  "Prime Visa": {
    currency: "CASH",
    online_shopping: 5, dining: 2, gas: 2, drugstores: 2, transit: 2, "catch-all": 1,
    notes: "5% at Amazon.com and Whole Foods with Prime membership. 2% dining/gas/drugstores/transit."
  },
  "Amazon Visa": {
    currency: "CASH",
    online_shopping: 3, dining: 2, gas: 2, drugstores: 2, "catch-all": 1,
    notes: "3% at Amazon.com and Whole Foods (without Prime). 2% dining/gas/drugstores."
  },
  "DoorDash Rewards Mastercard": {
    currency: "CASH",
    dining: 4, groceries: 2, "catch-all": 1,
    notes: "4% on DoorDash and Caviar orders. 3% on non-DoorDash dining. 2% groceries."
  },
  "Instacart Mastercard": {
    currency: "CASH",
    groceries: 5, "catch-all": 2,
    notes: "5% on Instacart purchases. 2% everywhere else."
  },
  // Southwest
  "Southwest Rapid Rewards Plus": {
    currency: "SOUTHWEST_RR", travel: 2, "catch-all": 1,
    notes: "2x on Southwest and Rapid Rewards hotel/car partners."
  },
  "Southwest Rapid Rewards Priority": {
    currency: "SOUTHWEST_RR", travel: 2, "catch-all": 1
  },
  "Southwest Rapid Rewards Premier": {
    currency: "SOUTHWEST_RR", travel: 2, "catch-all": 1
  },
  // United
  "United Explorer": {
    currency: "UNITED_MILES", travel: 2, dining: 2, "catch-all": 1,
    notes: "2x on United, dining, and hotel stays booked directly."
  },
  "United Quest": {
    currency: "UNITED_MILES", travel: 3, dining: 3, "catch-all": 1
  },
  "United Gateway": {
    currency: "UNITED_MILES", travel: 2, dining: 2, "catch-all": 1
  },
  "United Club Infinite": {
    currency: "UNITED_MILES", travel: 4, dining: 2, "catch-all": 1
  },
  // Marriott (Chase)
  "Marriott Bonvoy Boundless": {
    currency: "MARRIOTT_BONVOY",
    travel: 6, groceries: 3, gas: 3, dining: 3, "catch-all": 2,
    notes: "6x at Marriott properties. 3x groceries/gas/dining. 2x all else."
  },
  "Marriott Bonvoy Bountiful": {
    currency: "MARRIOTT_BONVOY",
    travel: 6, dining: 3, gas: 3, groceries: 3, "catch-all": 2
  },
  "Marriott Bonvoy Bold": {
    currency: "MARRIOTT_BONVOY", travel: 3, "catch-all": 1
  },
  // IHG
  "IHG One Rewards Premier": {
    currency: "IHG_POINTS",
    travel: 5, dining: 3, gas: 3, "catch-all": 1,
    notes: "Up to 26x at IHG hotels. 5x travel. 3x dining/gas."
  },
  "IHG One Rewards Traveler": {
    currency: "IHG_POINTS", travel: 3, dining: 2, gas: 2, "catch-all": 1
  },
  // Hyatt
  "World of Hyatt": {
    currency: "HYATT_POINTS",
    travel: 4, dining: 2, transit: 2, "catch-all": 1,
    notes: "4x at Hyatt. 2x dining/transit/gym. 1x all else."
  },
  // Other Chase co-brands
  "Aeroplan": {
    currency: "AEROPLAN", travel: 3, dining: 2, "catch-all": 1,
    notes: "3x on Air Canada and Star Alliance flights. 2x dining."
  },
  "British Airways Visa Signature": {
    currency: "AVIOS", travel: 3, "catch-all": 1
  },
  "Aer Lingus Visa Signature": {
    currency: "AVIOS", travel: 3, "catch-all": 1
  },
  "Iberia Visa Signature": {
    currency: "AVIOS", travel: 3, "catch-all": 1
  },
  "Disney Inspire Visa": {
    currency: "CASH", travel: 2, dining: 2, groceries: 2, "catch-all": 1,
    notes: "2% on Disney, dining, groceries. 1% all else."
  },
  "Disney Premier Visa": {
    currency: "CASH", travel: 2, dining: 2, groceries: 2, "catch-all": 1
  },
  "Disney Visa": {
    currency: "CASH", "catch-all": 1
  },
  // Chase Business
  "Sapphire Reserve for Business": {
    currency: "CHASE_UR", dining: 3, travel: 3, "catch-all": 1
  },
  "Ink Business Preferred": {
    currency: "CHASE_UR", travel: 3, "catch-all": 1,
    notes: "3x on travel, shipping, internet/cable/phone, social media advertising (first $150k/yr combined)."
  },
  "Ink Business Unlimited": {
    currency: "CHASE_UR", "catch-all": 1.5
  },
  "Ink Business Cash": {
    currency: "CHASE_UR",
    gas: 2, dining: 2, "catch-all": 1,
    notes: "5x on office supply stores, internet/cable/phone services (first $25k/yr combined). 2x gas/dining."
  },
  "Ink Business Premier": {
    currency: "CASH", travel: 2, "catch-all": 2,
    notes: "2.5% on purchases $5k+. 2% on all other purchases."
  },
  "Southwest Rapid Rewards Performance Business": {
    currency: "SOUTHWEST_RR", travel: 3, "catch-all": 1
  },
  "Southwest Rapid Rewards Premier Business": {
    currency: "SOUTHWEST_RR", travel: 2, "catch-all": 1
  },
  "United Business": {
    currency: "UNITED_MILES", travel: 2, dining: 2, gas: 2, transit: 2, "catch-all": 1
  },
  "United Club Business": {
    currency: "UNITED_MILES", travel: 2, "catch-all": 1
  },
  "IHG One Rewards Premier Business": {
    currency: "IHG_POINTS", travel: 5, dining: 3, gas: 3, "catch-all": 1
  },
  "World of Hyatt Business": {
    currency: "HYATT_POINTS", travel: 4, dining: 2, transit: 2, "catch-all": 1
  },

  // ════════════════════════════════════════════════════════════
  // AMERICAN EXPRESS
  // ════════════════════════════════════════════════════════════
  "American Express Gold Credit Card": {
    currency: "AMEX_MR",
    dining: 4, groceries: 4, travel: 3, "catch-all": 1,
    caps: { groceries: 25000 }
  },
  "The Platinum Card from American Express": {
    currency: "AMEX_MR",
    travel: 5, "catch-all": 1
  },
  "American Express Green Card": {
    currency: "AMEX_MR",
    travel: 3, transit: 3, "catch-all": 1
  },
  "American Express Blue Cash Preferred Card": {
    currency: "CASH",
    groceries: 6, streaming: 6, transit: 3, gas: 3, "catch-all": 1,
    caps: { groceries: 6000 }
  },
  "American Express Blue Cash Everyday Card": {
    currency: "CASH",
    groceries: 3, online_shopping: 3, gas: 3, "catch-all": 1,
    caps: { groceries: 6000, online_shopping: 6000, gas: 6000 }
  },
  "Cash Magnet Card": {
    currency: "CASH", "catch-all": 1.5
  },
  // Delta SkyMiles
  "Delta SkyMiles Reserve American Express Card": {
    currency: "DELTA_SKYMILES", travel: 3, "catch-all": 1,
    notes: "3x on Delta purchases. 1x all else."
  },
  "Delta SkyMiles Platinum American Express Card": {
    currency: "DELTA_SKYMILES", travel: 3, dining: 2, "catch-all": 1
  },
  "Delta SkyMiles Gold American Express Card": {
    currency: "DELTA_SKYMILES", travel: 2, dining: 2, groceries: 2, "catch-all": 1
  },
  "Delta SkyMiles Blue American Express Card": {
    currency: "DELTA_SKYMILES", travel: 2, dining: 2, "catch-all": 1
  },
  // Hilton
  "Hilton Honors American Express Card": {
    currency: "HILTON_HONORS",
    travel: 5, dining: 5, groceries: 5, gas: 5, "catch-all": 3,
    notes: "7x at Hilton. 5x dining/groceries/gas. 3x all else."
  },
  "Hilton Honors American Express Surpass Card": {
    currency: "HILTON_HONORS",
    travel: 6, dining: 6, groceries: 6, gas: 6, "catch-all": 3,
    notes: "12x at Hilton. 6x dining/groceries/gas/transit. 3x all else."
  },
  "Hilton Honors American Express Aspire Card": {
    currency: "HILTON_HONORS",
    travel: 7, dining: 7, "catch-all": 3,
    notes: "14x at Hilton. 7x flights/dining. 3x all else."
  },
  // Marriott (Amex)
  "Marriott Bonvoy Brilliant American Express Card": {
    currency: "MARRIOTT_BONVOY",
    travel: 6, dining: 3, groceries: 3, "catch-all": 2,
    notes: "6x at Marriott. 3x flights/dining/groceries. 2x all else."
  },
  "Marriott Bonvoy Bevy American Express Card": {
    currency: "MARRIOTT_BONVOY",
    travel: 6, dining: 4, "catch-all": 2
  },
  "Marriott Bonvoy American Express Card": {
    currency: "MARRIOTT_BONVOY", travel: 4, dining: 2, "catch-all": 1
  },
  // Amex Business
  "The Business Platinum Card from American Express": {
    currency: "AMEX_MR", travel: 5, "catch-all": 1,
    notes: "5x on flights booked directly or via Amex Travel. 1.5x on purchases $5k+."
  },
  "American Express Business Gold Card": {
    currency: "AMEX_MR",
    "catch-all": 1,
    "highest-spend": 4,
    notes: "4x on top 2 spending categories from a predefined list (up to $150k/yr combined)."
  },
  "American Express Business Green Rewards Card": {
    currency: "AMEX_MR", travel: 2, transit: 2, "catch-all": 1
  },
  "The Plum Card": {
    currency: "CASH", "catch-all": 1,
    notes: "1.5% early-pay discount on eligible purchases. No points-based rewards."
  },
  "American Express Blue Business Plus Card": {
    currency: "AMEX_MR", "catch-all": 2,
    caps: { "catch-all": 50000 },
    notes: "2x on first $50k/yr in purchases, then 1x."
  },
  "American Express Blue Business Cash Card": {
    currency: "CASH", "catch-all": 2,
    caps: { "catch-all": 50000 },
    notes: "2% on first $50k/yr in purchases, then 1%."
  },
  "Amazon Business Prime Card": {
    currency: "CASH", online_shopping: 5, dining: 2, gas: 2, "catch-all": 1,
    notes: "5% at Amazon Business and Whole Foods with Prime. 2% dining/gas."
  },
  "Amazon Business Card": {
    currency: "CASH", online_shopping: 3, "catch-all": 1
  },
  "Delta SkyMiles Reserve Business American Express Card": {
    currency: "DELTA_SKYMILES", travel: 3, "catch-all": 1
  },
  "Delta SkyMiles Platinum Business American Express Card": {
    currency: "DELTA_SKYMILES", travel: 3, dining: 2, "catch-all": 1
  },
  "Delta SkyMiles Gold Business American Express Card": {
    currency: "DELTA_SKYMILES", travel: 2, dining: 2, "catch-all": 1
  },
  "Hilton Honors American Express Business Card": {
    currency: "HILTON_HONORS",
    travel: 6, dining: 6, gas: 6, "catch-all": 3
  },
  "Marriott Bonvoy Business American Express Card": {
    currency: "MARRIOTT_BONVOY", travel: 6, dining: 4, gas: 4, "catch-all": 2
  },
  "Lowe's Business Rewards Card": {
    currency: "CASH", "catch-all": 2,
    notes: "2% on Lowe's purchases."
  },
  "Lowe's Business Credit Card": {
    currency: "CASH", "catch-all": 1,
    notes: "5% off eligible Lowe's purchases (discount, not points)."
  },

  // ════════════════════════════════════════════════════════════
  // CAPITAL ONE
  // ════════════════════════════════════════════════════════════
  "Savor Cash Rewards": {
    currency: "CASH",
    dining: 4, groceries: 3, streaming: 4, "catch-all": 1
  },
  "SavorOne Cash Rewards": {
    currency: "CASH",
    dining: 3, groceries: 3, streaming: 3, "catch-all": 1
  },
  "Venture Rewards": { currency: "CAPITAL_ONE", "catch-all": 2 },
  "Venture X Rewards": { currency: "CAPITAL_ONE", travel: 5, "catch-all": 2 },
  "Quicksilver Cash Rewards": { currency: "CASH", "catch-all": 1.5 },
  "QuicksilverOne Cash Rewards": { currency: "CASH", "catch-all": 1.5 },
  "VentureOne Rewards": { currency: "CAPITAL_ONE", "catch-all": 1.25 },
  "Platinum Mastercard": {
    currency: "CASH", "catch-all": 1,
    notes: "Secured/basic card. No rewards program."
  },
  // Capital One Business
  "Spark Cash Plus": { currency: "CASH", "catch-all": 2 },
  "Spark Cash Select": { currency: "CASH", "catch-all": 1.5 },
  "Spark Miles for Business": { currency: "CAPITAL_ONE", "catch-all": 2 },
  "Spark Miles Select": { currency: "CAPITAL_ONE", "catch-all": 1.5 },
  "Venture X Business": { currency: "CAPITAL_ONE", travel: 5, "catch-all": 2 },

  // ════════════════════════════════════════════════════════════
  // CITI
  // ════════════════════════════════════════════════════════════
  "Citi Double Cash Credit Card": { currency: "CITI_TYP", "catch-all": 2 },
  "Citi Custom Cash Card": {
    currency: "CITI_TYP",
    "catch-all": 1,
    "highest-spend": 5,
    caps: { "highest-spend": 500 }
  },
  "Citi Strata Premier Card": {
    currency: "CITI_TYP",
    dining: 3, groceries: 3, gas: 3, travel: 3, "catch-all": 1
  },
  "Citi Strata Card": { currency: "CITI_TYP", "catch-all": 1 },
  "Citi Strata Elite Card": {
    currency: "CITI_TYP",
    dining: 3, groceries: 3, gas: 3, travel: 3, "catch-all": 1,
    notes: "Top-tier Citi card with enhanced travel benefits."
  },
  "Costco Anywhere Visa Card by Citi": {
    currency: "CASH",
    gas: 4, dining: 3, travel: 3, wholesale_clubs: 2, "catch-all": 1,
    caps: { gas: 7000 },
    notes: "4% gas (first $7k/yr). 3% dining/travel. 2% Costco/wholesale. 1% all else."
  },
  "Costco Anywhere Visa Business Card by Citi": {
    currency: "CASH",
    gas: 4, dining: 3, travel: 3, wholesale_clubs: 2, "catch-all": 1,
    caps: { gas: 7000 }
  },
  "Citi / AAdvantage Platinum Select World Elite Mastercard": {
    currency: "AA_AADVANTAGE", travel: 2, dining: 2, gas: 2, "catch-all": 1
  },
  "American Airlines AAdvantage MileUp Card": {
    currency: "AA_AADVANTAGE", travel: 2, groceries: 2, "catch-all": 1
  },
  "Citi / AAdvantage Executive World Elite Mastercard": {
    currency: "AA_AADVANTAGE", travel: 4, "catch-all": 1
  },
  "Citi / AAdvantage Globe Mastercard": {
    currency: "AA_AADVANTAGE", travel: 3, "catch-all": 1
  },
  "Citi / AAdvantage Business World Elite Mastercard": {
    currency: "AA_AADVANTAGE", travel: 2, dining: 2, gas: 2, "catch-all": 1
  },
  "Citi Diamond Preferred Card": {
    currency: "CASH", "catch-all": 1,
    notes: "0% intro APR card. No rewards program."
  },
  "Citi Simplicity Card": {
    currency: "CASH", "catch-all": 1,
    notes: "0% intro APR card. No rewards program."
  },
  "Citi Secured Mastercard": {
    currency: "CASH", "catch-all": 1,
    notes: "Secured card. No rewards program."
  },
  // Citi co-brand/store cards (minimal rewards)
  "AT&T Points Plus Card From Citi": { currency: "CITI_TYP", "catch-all": 1 },
  "Bloomingdale's Credit Cards": { currency: "CASH", "catch-all": 1 },
  "Exxon Mobil Smart Card+ Credit Card": { currency: "CASH", gas: 3, "catch-all": 1 },
  "L.L.Bean Mastercard": { currency: "CASH", "catch-all": 1 },
  "My Best Buy Credit Cards": {
    currency: "CASH", "catch-all": 1,
    notes: "5% back on Best Buy purchases with card. 1% all else."
  },
  "Macy's Credit Cards": { currency: "CASH", "catch-all": 1 },
  "Pro Xtra Credit Card": { currency: "CASH", "catch-all": 1 },
  "The Home Depot Consumer Credit Card": { currency: "CASH", "catch-all": 1 },
  "TSC Store Card": { currency: "CASH", "catch-all": 1 },
  "TSC Visa Card": { currency: "CASH", "catch-all": 1 },
  "Wayfair's Credit Cards": {
    currency: "CASH", online_shopping: 5, "catch-all": 1,
    notes: "5% back on Wayfair purchases. 1% all else."
  },

  // ════════════════════════════════════════════════════════════
  // DISCOVER
  // ════════════════════════════════════════════════════════════
  "Discover it Cash Back": {
    currency: "CASH", "catch-all": 1,
    rotating: 5,
    caps: { rotating: 1500 },
    notes: "5% rotating quarterly categories (up to $1,500/quarter, activation required). 1% all else. First-year cashback match doubles all rewards."
  },
  "Discover it Student Cash Back": {
    currency: "CASH", "catch-all": 1,
    rotating: 5,
    caps: { rotating: 1500 },
    notes: "Same as Discover it Cash Back. 5% rotating quarterly categories."
  },
  "Discover it Student Chrome": {
    currency: "CASH", gas: 2, dining: 2, "catch-all": 1
  },
  "Discover it Secured": {
    currency: "CASH", gas: 2, dining: 2, "catch-all": 1,
    notes: "Secured card with cashback."
  },
  "Discover it Miles": {
    currency: "CASH", "catch-all": 1.5,
    notes: "1.5x miles on all purchases. First-year miles match."
  },
  "Discover it Chrome": {
    currency: "CASH", gas: 2, dining: 2, "catch-all": 1
  },
  "Discover NHL Credit Card": {
    currency: "CASH", "catch-all": 1,
    rotating: 5,
    caps: { rotating: 1500 }
  },

  // ════════════════════════════════════════════════════════════
  // BANK OF AMERICA
  // ════════════════════════════════════════════════════════════
  "Bank of America Customized Cash Rewards credit card": {
    currency: "CASH",
    groceries: 2, wholesale_clubs: 2, "catch-all": 1,
    "highest-spend": 3,
    caps: { "highest-spend": 2500 },
    notes: "3% on one chosen category (gas, online, dining, travel, drug stores, home improvement). 2% groceries/wholesale. 1% all else. $2,500/quarter combined cap on 3%+2%."
  },
  "Bank of America Unlimited Cash Rewards credit card": {
    currency: "CASH", "catch-all": 1.5
  },
  "Bank of America Travel Rewards credit card": {
    currency: "BOFA_POINTS", "catch-all": 1.5,
    notes: "1.5x on all purchases. Points worth 1cpp toward travel."
  },
  "Bank of America Premium Rewards credit card": {
    currency: "BOFA_POINTS", travel: 2, dining: 2, "catch-all": 1.5
  },
  "Bank of America Premium Rewards Elite credit card": {
    currency: "BOFA_POINTS", travel: 2, dining: 2, "catch-all": 1.5,
    notes: "Up to 2x with Preferred Rewards tier. Base is 2x travel/dining, 1.5x all else."
  },
  "Alaska Airlines Visa Signature credit card": {
    currency: "ALASKA_MILES", travel: 3, "catch-all": 1,
    notes: "3x on Alaska Airlines. 1x all else."
  },
  "Free Spirit Travel More World Elite Mastercard": {
    currency: "CASH", travel: 3, "catch-all": 1
  },
  // BofA Business
  "Business Advantage Customized Cash Rewards Mastercard": {
    currency: "CASH", "highest-spend": 3, "catch-all": 1,
    caps: { "highest-spend": 50000 },
    notes: "3% on chosen category. 2% dining. 1% all else."
  },
  "Business Advantage Unlimited Cash Rewards Mastercard": {
    currency: "CASH", "catch-all": 1.5
  },
  "Business Advantage Travel Rewards World Mastercard": {
    currency: "BOFA_POINTS", "catch-all": 1.5
  },
  "Alaska Airlines Visa Business card": {
    currency: "ALASKA_MILES", travel: 3, "catch-all": 1
  },

  // ════════════════════════════════════════════════════════════
  // BARCLAYS
  // ════════════════════════════════════════════════════════════
  "JetBlue Plus Card": {
    currency: "JETBLUE_POINTS",
    travel: 6, dining: 2, gas: 2, groceries: 2, "catch-all": 1,
    notes: "6x on JetBlue. 2x dining/gas/groceries. 1x all."
  },
  "JetBlue Card": {
    currency: "JETBLUE_POINTS", travel: 3, dining: 2, groceries: 2, "catch-all": 1
  },
  "JetBlue Business Card": {
    currency: "JETBLUE_POINTS", travel: 6, dining: 2, gas: 2, "catch-all": 1
  },
  "AAdvantage Aviator Red World Elite Mastercard": {
    currency: "AA_AADVANTAGE", travel: 2, "catch-all": 1
  },
  "AAdvantage Aviator Silver World Elite Mastercard": {
    currency: "AA_AADVANTAGE", travel: 2, "catch-all": 1
  },
  "AAdvantage Aviator Business Mastercard": {
    currency: "AA_AADVANTAGE", travel: 2, "catch-all": 1
  },
  "Wyndham Rewards Earner Card": {
    currency: "WYNDHAM", travel: 3, gas: 2, groceries: 2, "catch-all": 1
  },
  "Wyndham Rewards Earner Plus Card": {
    currency: "WYNDHAM", travel: 6, gas: 2, groceries: 2, "catch-all": 1
  },
  "Wyndham Rewards Earner Business Card": {
    currency: "WYNDHAM", travel: 8, "catch-all": 1
  },
  "Choice Privileges Select Mastercard": {
    currency: "CASH", travel: 3, "catch-all": 1
  },
  "Choice Privileges Mastercard": {
    currency: "CASH", travel: 2, "catch-all": 1
  },
  "Hawaiian Airlines World Elite Mastercard": {
    currency: "CASH", travel: 3, dining: 2, gas: 2, "catch-all": 1
  },
  "Hawaiian Airlines Business Mastercard": {
    currency: "CASH", travel: 3, "catch-all": 1
  },
  "Frontier Airlines World Mastercard": {
    currency: "CASH", travel: 3, "catch-all": 1
  },
  "Carnival World Mastercard": { currency: "CASH", travel: 2, "catch-all": 1 },
  "Holland America Line Rewards Visa Card": { currency: "CASH", travel: 2, "catch-all": 1 },
  "Princess Cruises Rewards Visa Card": { currency: "CASH", travel: 2, "catch-all": 1 },

  // ════════════════════════════════════════════════════════════
  // WELLS FARGO & BILT
  // ════════════════════════════════════════════════════════════
  "Wells Fargo Active Cash Card": { currency: "CASH", "catch-all": 2 },
  "Wells Fargo Autograph Card": {
    currency: "CASH",
    dining: 3, travel: 3, gas: 3, transit: 3, streaming: 3, "catch-all": 1
  },
  "Wells Fargo Autograph Journey Card": {
    currency: "CASH",
    travel: 5, dining: 3, gas: 3, transit: 3, streaming: 3, "catch-all": 1,
    notes: "5x on airlines and hotels booked through Wells Fargo Travel. 3x dining/gas/transit/streaming."
  },
  "Wells Fargo Reflect Card": {
    currency: "CASH", "catch-all": 1,
    notes: "0% intro APR card. No rewards program."
  },
  "Bilt World Elite Mastercard": {
    currency: "BILT",
    dining: 3, travel: 2, "catch-all": 1
  },
  // Wells Fargo Business
  "Signify Business Cash Card by Wells Fargo": {
    currency: "CASH", "catch-all": 2
  },

  // ════════════════════════════════════════════════════════════
  // US BANK
  // ════════════════════════════════════════════════════════════
  "U.S. Bank Altitude Go Visa Signature Card": {
    currency: "CASH",
    dining: 4, groceries: 2, gas: 2, streaming: 2, "catch-all": 1
  },
  "U.S. Bank Altitude Reserve Visa Infinite Card": {
    currency: "CASH",
    travel: 3, "catch-all": 1,
    mobileWallet: 3,
    notes: "3x on travel and all mobile wallet transactions (Apple Pay, Google Pay, Samsung Pay). 1x all else."
  },
  "U.S. Bank Altitude Connect Visa Signature Card": {
    currency: "CASH",
    travel: 4, gas: 4, dining: 2, streaming: 2, "catch-all": 1
  },
  "U.S. Bank Cash+ Visa Signature Card": {
    currency: "CASH",
    "catch-all": 1,
    "highest-spend": 5,
    caps: { "highest-spend": 2000 },
    notes: "5% on two chosen categories (up to $2k/quarter combined). 2% on one chosen category. 1% all else."
  },
  "U.S. Bank Shopper Cash Rewards Visa Signature Card": {
    currency: "CASH", online_shopping: 3, gas: 2, dining: 2, "catch-all": 1,
    notes: "Up to 6% on first chosen store. 3% on eligible online/in-app purchases. 2% gas/dining."
  },
  "Kroger Rewards World Elite Mastercard": {
    currency: "CASH", groceries: 3, gas: 2, "catch-all": 1,
    notes: "5% on Kroger family fuel points. 3% groceries at Kroger. 2% gas."
  },
  "Ralphs Rewards World Elite Mastercard": {
    currency: "CASH", groceries: 3, gas: 2, "catch-all": 1
  },
  // US Bank Business
  "U.S. Bank Business Altitude Power World Elite Mastercard": {
    currency: "CASH", "catch-all": 2
  },
  "U.S. Bank Business Altitude Connect World Elite Mastercard": {
    currency: "CASH", travel: 4, gas: 4, dining: 2, "catch-all": 1
  },
  "U.S. Bank Business Leverage Visa Signature Card": {
    currency: "CASH", "catch-all": 1.5
  },
  "U.S. Bank Triple Cash Rewards Visa Business Card": {
    currency: "CASH", gas: 3, dining: 3, transit: 3, "catch-all": 1
  },

  // ════════════════════════════════════════════════════════════
  // SYNCHRONY
  // ════════════════════════════════════════════════════════════
  "Verizon Visa Card": {
    currency: "CASH", groceries: 4, gas: 4, dining: 3, "catch-all": 1,
    notes: "4% groceries/gas. 3% dining. 2% Verizon. 1% all else."
  },
  "Sam's Club Mastercard": {
    currency: "CASH", gas: 5, dining: 3, wholesale_clubs: 1, "catch-all": 1,
    caps: { gas: 6000 },
    notes: "5% gas (first $6k/yr). 3% dining. 1% Sam's Club and all else."
  },
  "Sam's Club Business Mastercard": {
    currency: "CASH", gas: 5, dining: 3, wholesale_clubs: 1, "catch-all": 1,
    caps: { gas: 6000 }
  },
  "PayPal Cashback Mastercard": {
    currency: "CASH", "catch-all": 2,
    notes: "3% on PayPal purchases. 2% everywhere else."
  },
  "Venmo Credit Card": {
    currency: "CASH", "catch-all": 1,
    "highest-spend": 3,
    notes: "3% on top spend category (auto-detected). 2% next category. 1% all else."
  },
  "Walgreens Mastercard": {
    currency: "CASH", drugstores: 3, "catch-all": 1,
    notes: "10% Walgreens Rewards on eligible purchases. 3% drugstores. 1% all else."
  },
  "Rakuten Cash Back Visa": {
    currency: "CASH", "catch-all": 1,
    notes: "Earns Rakuten Cash Back on purchases. Standard 1% base."
  },
  "Amazon Store Card": {
    currency: "CASH", online_shopping: 5, "catch-all": 1,
    notes: "5% on Amazon.com with Prime. 0% financing options."
  },
  "Lowe's Advantage Card": {
    currency: "CASH", "catch-all": 1,
    notes: "5% off eligible Lowe's purchases (discount, not points)."
  },

  // ════════════════════════════════════════════════════════════
  // TD BANK
  // ════════════════════════════════════════════════════════════
  "TD Double Up Credit Card": { currency: "CASH", "catch-all": 2 },
  "TD Clear Credit Card": {
    currency: "CASH", "catch-all": 1,
    notes: "No rewards. Low APR card."
  },
  "TD Cash Credit Card": {
    currency: "CASH", dining: 3, groceries: 2, "catch-all": 1
  },
  "Target Circle Credit Card": {
    currency: "CASH", wholesale_clubs: 5, "catch-all": 1,
    notes: "5% off Target purchases (discount). 1% all else."
  },
  "TD Business Solutions Credit Card": { currency: "CASH", "catch-all": 1 },

  // ════════════════════════════════════════════════════════════
  // FNBO
  // ════════════════════════════════════════════════════════════
  "FNBO Evergreen Rewards Visa Card": { currency: "CASH", "catch-all": 2 },
  "FNBO Getaway Rewards Visa Card": { currency: "CASH", travel: 3, "catch-all": 1 },
  "Evergreen by FNBO Business Credit Card": { currency: "CASH", "catch-all": 2 },

  // ════════════════════════════════════════════════════════════
  // GOLDMAN SACHS
  // ════════════════════════════════════════════════════════════
  "Apple Card": { currency: "CASH", "catch-all": 2,
    notes: "3% at select merchants via Apple Pay. 2% via Apple Pay everywhere. 1% with physical card."
  },
  "My GM Rewards Card": {
    currency: "CASH", "catch-all": 1,
    notes: "Earns GM Rewards points redeemable toward GM vehicles."
  },

  // ════════════════════════════════════════════════════════════
  // HSBC
  // ════════════════════════════════════════════════════════════
  "HSBC Elite Credit Card": { currency: "CASH", travel: 3, "catch-all": 1 },
  "HSBC Premier Credit Card": { currency: "CASH", travel: 3, "catch-all": 1 },

  // ════════════════════════════════════════════════════════════
  // NAVY FEDERAL
  // ════════════════════════════════════════════════════════════
  "cashRewards Credit Card": { currency: "CASH", "catch-all": 1.5 },
  "Platinum Credit Card": { currency: "CASH", "catch-all": 1, notes: "Low APR. No rewards." },
  "GO REWARDS Credit Card": { currency: "CASH", dining: 3, "catch-all": 1 },
  "More Rewards American Express Card": { currency: "CASH", groceries: 3, gas: 2, "catch-all": 1 },
  "Visa Signature Flagship Rewards Credit Card": { currency: "CASH", travel: 3, "catch-all": 1 },
  "nRewards Secured Credit Card": { currency: "CASH", "catch-all": 1 },

  // ════════════════════════════════════════════════════════════
  // PENFED
  // ════════════════════════════════════════════════════════════
  "PenFed Power Cash Rewards Visa Signature": { currency: "CASH", "catch-all": 2 },
  "PenFed Platinum Rewards Visa Signature": { currency: "CASH", gas: 5, groceries: 3, "catch-all": 1 },
  "PenFed Gold Visa Card": { currency: "CASH", "catch-all": 1, notes: "Low APR. No rewards." },

  // ════════════════════════════════════════════════════════════
  // USAA
  // ════════════════════════════════════════════════════════════
  "USAA Cashback Rewards Plus American Express": { currency: "CASH", "catch-all": 1.5 },
  "USAA Rate Advantage Visa Platinum": { currency: "CASH", "catch-all": 1, notes: "Low APR. No rewards." },
  "USAA Rewards Visa Signature": { currency: "CASH", "catch-all": 1 },

  // ════════════════════════════════════════════════════════════
  // CITIZENS, ELAN, FIFTH THIRD, PNC, TRUIST
  // ════════════════════════════════════════════════════════════
  "Citizens Cash Back Plus World Mastercard": { currency: "CASH", "catch-all": 1.8 },
  "Citizens Clear Value Mastercard": { currency: "CASH", "catch-all": 1, notes: "Low APR card." },
  "Citizens Bank Platinum Card": { currency: "CASH", "catch-all": 1 },
  "Citizens Everyday Business Credit Card": { currency: "CASH", "catch-all": 1.5 },
  "Max Cash Preferred Card": { currency: "CASH", "highest-spend": 5, "catch-all": 1, caps: { "highest-spend": 2000 }, notes: "5% on two chosen categories (up to $2k/quarter). 1% all else." },
  "Everyday Rewards+ Card": { currency: "CASH", "catch-all": 2 },
  "Travel Rewards+ Card": { currency: "CASH", travel: 3, "catch-all": 1 },
  "1.67% Cash/Back Visa": { currency: "CASH", "catch-all": 1.67 },
  "Truly Simple Visa": { currency: "CASH", "catch-all": 1, notes: "Low APR card." },
  "Stand By Me Visa": { currency: "CASH", "catch-all": 1 },
  "PNC Cash Rewards Visa": { currency: "CASH", gas: 4, dining: 3, groceries: 2, "catch-all": 1 },
  "PNC Core Visa": { currency: "CASH", "catch-all": 1, notes: "No rewards." },
  "PNC points Visa": { currency: "CASH", "catch-all": 1 },
  "PNC Cash Rewards Visa Signature Business": { currency: "CASH", gas: 4, dining: 3, "catch-all": 1 },
  "PNC points Visa Business": { currency: "CASH", "catch-all": 1 },
  "Truist Enjoy Cash": { currency: "CASH", "catch-all": 1.5 },
  "Truist Enjoy Travel": { currency: "CASH", travel: 3, "catch-all": 1 },
  "Truist Enjoy Beyond": { currency: "CASH", dining: 3, travel: 3, "catch-all": 1 },
  "Truist Future": { currency: "CASH", "catch-all": 1.5 },
  "Truist Business Cash Rewards": { currency: "CASH", "catch-all": 1.5 },
  "Business Rewards Visa": { currency: "CASH", "catch-all": 1 },

  // ════════════════════════════════════════════════════════════
  // OTHER / FINTECH
  // ════════════════════════════════════════════════════════════
  "Fidelity Rewards Visa Signature Card": { currency: "CASH", "catch-all": 2 },
  "Robinhood Gold Card": { currency: "CASH", "catch-all": 3 },
  "X1 Card": { currency: "CASH", "catch-all": 2, notes: "2x-4x on purchases depending on referrals and tier." },
  "Sofi Credit Card": { currency: "CASH", "catch-all": 2, notes: "2% on all purchases when redeemed into SoFi Money or Invest accounts." },
  "BlockFi Rewards Visa Signature Card": { currency: "CASH", "catch-all": 1.5, notes: "1.5% back in crypto. Card discontinued but existing holders may still use it." },
  "Gemini Credit Card": { currency: "CASH", dining: 3, groceries: 2, "catch-all": 1, notes: "Rewards paid in crypto." },
  "Nexo Card": { currency: "CASH", "catch-all": 2, notes: "Up to 2% in crypto rewards." },
  "Crypto.com Visa Card": { currency: "CASH", "catch-all": 1, notes: "Up to 5% in CRO based on staking tier." },
  "Coinbase Card": { currency: "CASH", "catch-all": 1, notes: "Debit card with crypto rewards." },
  "Petal 1 Visa Credit Card": { currency: "CASH", "catch-all": 1, notes: "No rewards initially. Cashback unlocks with on-time payments." },
  "Petal 2 Visa Credit Card": { currency: "CASH", "catch-all": 1, notes: "1% to 1.5% back with on-time payments." },
  "Tomo Credit Card": { currency: "CASH", "catch-all": 1 },
  "Deserve EDU Mastercard": { currency: "CASH", "catch-all": 1 },
  "Chime Credit Builder Visa Secured Credit Card": { currency: "CASH", "catch-all": 1, notes: "Credit-building card. No rewards." },
  "Varo Believe Secured Credit Card": { currency: "CASH", "catch-all": 1, notes: "Credit-building card. No rewards." },
  "Cred.ai Guaranty Card": { currency: "CASH", "catch-all": 1 },
  // Business Fintech
  "Brex Card": { currency: "CASH", travel: 4, dining: 3, online_shopping: 2, "catch-all": 1, notes: "Corporate card. Multipliers vary by Brex plan." },
  "Ramp Card": { currency: "CASH", "catch-all": 1.5, notes: "Corporate card with 1.5% back." },
  "Divvy Corporate Card": { currency: "CASH", "catch-all": 1, notes: "Corporate expense card. Rewards depend on payment schedule." },
};

/**
 * Returns the expected multiplier and TRUE monetary yield for a card and category.
 * @param {string} cardName The name of the card.
 * @param {string} category The predicted purchase category.
 * @param {object} customValuations Optional user overrides for cents-per-point.
 */
export function getCardMultiplier(cardName, category, customValuations = {}) {
  const name = String(cardName || "").trim();

  const resolveMultiplier = (cardRules, cat, catalogKey) => {
    let isFlexible = false;
    let potentialMax = null;
    let base = cardRules["catch-all"] || 1;
    let multiplier = cardRules[cat];
    let currency = cardRules.currency || "CASH";
    let cap = null;

    // Check OTA Config for active rotating categories
    if (cardRules.rotating && catalogKey) {
      try {
        const otaData = localStorage.getItem("ota_rotating_categories");
        if (otaData) {
          const parsedOta = JSON.parse(otaData);
          const activeCategories = parsedOta[catalogKey];
          if (Array.isArray(activeCategories) && activeCategories.includes(cat)) {
            multiplier = cardRules.rotating;
            if (cardRules.caps && cardRules.caps.rotating) {
              cap = cardRules.caps.rotating;
            }
          }
        }
      } catch (e) {
        // Ignore parse error
      }
    }

    if (cardRules["highest-spend"]) {
      isFlexible = true;
      potentialMax = cardRules["highest-spend"];
      // FIX: Use catch-all base for sorting — the max is conditional on being
      // the user's SINGLE highest spend category, which we cannot verify client-side.
      if (!multiplier) multiplier = base;
      if (cardRules.caps && cardRules.caps["highest-spend"]) {
        cap = cardRules.caps["highest-spend"];
      }
    } else {
      if (!multiplier) multiplier = base;
      if (cardRules.caps && cardRules.caps[cat]) {
        cap = cardRules.caps[cat];
      }
    }

    // Calculate effective yield based on point valuation
    const activeCPP = customValuations[currency] !== undefined ? customValuations[currency] : (VALUATIONS[currency] || 1.0);
    const effectiveYield = parseFloat((multiplier * activeCPP).toFixed(2));

    return {
      multiplier,
      effectiveYield,
      isFlexible,
      potentialMax,
      base,
      currency,
      cap,
      cpp: activeCPP,
      notes: cardRules.notes || null,
      rotating: cardRules.rotating || null,
      mobileWallet: cardRules.mobileWallet || null,
    };
  };

  // Attempt exact match
  if (REWARDS_CATALOG[name]) {
    return resolveMultiplier(REWARDS_CATALOG[name], category, name);
  }

  // Try partial match
  const lowerName = name.toLowerCase();
  const catalogKeys = Object.keys(REWARDS_CATALOG);
  const match = catalogKeys.find(k => k.toLowerCase().includes(lowerName) || lowerName.includes(k.toLowerCase()));

  if (match) {
    return resolveMultiplier(REWARDS_CATALOG[match], category, match);
  }

  // Flat-rate fallback heuristics — flat cards earn their rate on ALL categories
  if (lowerName.includes("double") || lowerName.includes("active cash") || lowerName.includes("fidelity") || lowerName.includes("apple")) {
    return { multiplier: 2, effectiveYield: 2.0, isFlexible: false, potentialMax: null, base: 2, currency: "CASH", cap: null, cpp: 1.0, notes: null, rotating: null, mobileWallet: null };
  }
  if (lowerName.includes("quicksilver") || lowerName.includes("unlimited") || lowerName.includes("freedom") || lowerName.includes("everyday")) {
    return { multiplier: 1.5, effectiveYield: 1.5, isFlexible: false, potentialMax: null, base: 1.5, currency: "CASH", cap: null, cpp: 1.0, notes: null, rotating: null, mobileWallet: null };
  }

  // Global floor is 1%
  return { multiplier: 1, effectiveYield: 1.0, isFlexible: false, potentialMax: null, base: 1, currency: "CASH", cap: null, cpp: 1.0, notes: null, rotating: null, mobileWallet: null };
}

/**
 * Headless utility to determine the optimal card from a portfolio for a given category.
 * Used by the Transaction Feed to calculate "Missed Opportunities" and show "Best Card" taglets.
 * @param {Array} cards The user's active credit card portfolio.
 * @param {string} category The predicted purchase category.
 * @param {object} customValuations Optional user overrides for cents-per-point.
 * @param {object} usedCaps Optional object mapping cardId to used cap amounts.
 * @param {number} spendAmount Optional spend amount to account for caps.
 */
export function getOptimalCard(cards, category, customValuations = {}, usedCaps = {}, spendAmount = 0) {
  if (!cards || cards.length === 0 || !category) return null;

  const scored = cards.map(card => {
    const rewardInfo = getCardMultiplier(card.name, category, customValuations);
    let finalYield = rewardInfo.effectiveYield;

    if (rewardInfo.cap) {
      const used = parseFloat(usedCaps[card.id]) || 0;
      const availableCap = Math.max(0, rewardInfo.cap - used);
      
      if (spendAmount > 0 && spendAmount > availableCap) {
        const spendAtHighRate = availableCap;
        const spendAtBaseRate = spendAmount - availableCap;
        
        if (spendAtHighRate === 0) {
          finalYield = parseFloat((rewardInfo.base * rewardInfo.cpp).toFixed(2));
        } else {
          const blendedReturn = (spendAtHighRate * rewardInfo.multiplier * rewardInfo.cpp / 100) + (spendAtBaseRate * rewardInfo.base * rewardInfo.cpp / 100);
          finalYield = parseFloat(((blendedReturn / spendAmount) * 100).toFixed(2));
        }
      } else if (used >= rewardInfo.cap) {
        finalYield = parseFloat((rewardInfo.base * rewardInfo.cpp).toFixed(2));
      }
    }

    return {
      ...card,
      effectiveYield: finalYield,
      cpp: rewardInfo.cpp,
      multiplier: rewardInfo.multiplier
    };
  });

  // Sort by highest effective yield
  scored.sort((a, b) => b.effectiveYield - a.effectiveYield);
  
  return scored[0];
}

/**
 * Updates local constants using an Over-The-Air JSON payload.
 */
export function injectOTACatalog(newCatalog, newValuations) {
  if (newCatalog) REWARDS_CATALOG = { ...REWARDS_CATALOG, ...newCatalog };
  if (newValuations) VALUATIONS = { ...VALUATIONS, ...newValuations };
}
