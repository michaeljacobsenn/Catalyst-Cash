// ═══════════════════════════════════════════════════════════════
// MARKET DATA SERVICE — Catalyst Cash
// Fetches real-time stock/fund/crypto prices via our Worker proxy.
// Used for auto-tracking Roth IRA, 401k, Brokerage, and Crypto holdings.
// ═══════════════════════════════════════════════════════════════

import { db } from "./utils.js";
import { getMarketRefreshTTL } from "./subscription.js";

const CACHE_KEY = "market-data-cache";
const CACHE_TS_KEY = "market-data-ts";
const DEFAULT_CACHE_TTL = 15 * 60 * 1000; // 15 min fallback (sync contexts)

/**
 * Get the effective cache TTL based on subscription tier.
 * Falls back to DEFAULT_CACHE_TTL if the async call fails.
 */
async function getCacheTTL() {
    try {
        return await getMarketRefreshTTL();
    } catch {
        return DEFAULT_CACHE_TTL;
    }
}

// ═══════════════════════════════════════════════════════════════
// TICKER CATALOGS — curated quick-add lists by asset class
// These are static arrays used only for the quick-add picker UI.
// No API calls happen until a ticker is added to a user's holdings.
// ═══════════════════════════════════════════════════════════════

/** Individual stocks — organized by sector (S&P 500 top components + popular names) */
export const POPULAR_STOCKS = [
    // ── Technology ──
    { symbol: "AAPL", name: "Apple" },
    { symbol: "MSFT", name: "Microsoft" },
    { symbol: "GOOGL", name: "Alphabet (Google)" },
    { symbol: "AMZN", name: "Amazon" },
    { symbol: "NVDA", name: "NVIDIA" },
    { symbol: "META", name: "Meta Platforms" },
    { symbol: "TSLA", name: "Tesla" },
    { symbol: "AVGO", name: "Broadcom" },
    { symbol: "AMD", name: "Advanced Micro Devices" },
    { symbol: "CRM", name: "Salesforce" },
    { symbol: "ADBE", name: "Adobe" },
    { symbol: "ORCL", name: "Oracle" },
    { symbol: "CSCO", name: "Cisco Systems" },
    { symbol: "INTC", name: "Intel" },
    { symbol: "IBM", name: "IBM" },
    { symbol: "QCOM", name: "Qualcomm" },
    { symbol: "TXN", name: "Texas Instruments" },
    { symbol: "INTU", name: "Intuit" },
    { symbol: "NOW", name: "ServiceNow" },
    { symbol: "AMAT", name: "Applied Materials" },
    { symbol: "MU", name: "Micron Technology" },
    { symbol: "LRCX", name: "Lam Research" },
    { symbol: "KLAC", name: "KLA Corp" },
    { symbol: "PANW", name: "Palo Alto Networks" },
    { symbol: "SNPS", name: "Synopsys" },
    { symbol: "CDNS", name: "Cadence Design" },
    { symbol: "PLTR", name: "Palantir Technologies" },
    { symbol: "SHOP", name: "Shopify" },
    { symbol: "SQ", name: "Block (Square)" },
    { symbol: "SNOW", name: "Snowflake" },
    { symbol: "NET", name: "Cloudflare" },
    { symbol: "CRWD", name: "CrowdStrike" },
    { symbol: "DDOG", name: "Datadog" },
    { symbol: "ZS", name: "Zscaler" },
    { symbol: "FTNT", name: "Fortinet" },
    { symbol: "UBER", name: "Uber Technologies" },
    { symbol: "COIN", name: "Coinbase Global" },
    { symbol: "MRVL", name: "Marvell Technology" },
    { symbol: "ON", name: "ON Semiconductor" },
    { symbol: "SMCI", name: "Super Micro Computer" },
    { symbol: "ARM", name: "Arm Holdings" },
    { symbol: "DELL", name: "Dell Technologies" },
    { symbol: "HPE", name: "Hewlett Packard Enterprise" },
    { symbol: "HPQ", name: "HP Inc." },
    { symbol: "MSTR", name: "MicroStrategy" },
    { symbol: "U", name: "Unity Software" },
    { symbol: "RBLX", name: "Roblox" },
    { symbol: "TWLO", name: "Twilio" },
    { symbol: "TEAM", name: "Atlassian" },
    { symbol: "WDAY", name: "Workday" },
    { symbol: "VEEV", name: "Veeva Systems" },
    { symbol: "TTD", name: "The Trade Desk" },
    { symbol: "HUBS", name: "HubSpot" },
    { symbol: "MDB", name: "MongoDB" },
    { symbol: "OKTA", name: "Okta" },
    { symbol: "DOCN", name: "DigitalOcean" },
    { symbol: "PATH", name: "UiPath" },
    { symbol: "CFLT", name: "Confluent" },
    { symbol: "IOT", name: "Samsara" },
    // ── Healthcare / Biotech ──
    { symbol: "UNH", name: "UnitedHealth Group" },
    { symbol: "JNJ", name: "Johnson & Johnson" },
    { symbol: "LLY", name: "Eli Lilly" },
    { symbol: "ABBV", name: "AbbVie" },
    { symbol: "MRK", name: "Merck" },
    { symbol: "PFE", name: "Pfizer" },
    { symbol: "TMO", name: "Thermo Fisher Scientific" },
    { symbol: "ABT", name: "Abbott Laboratories" },
    { symbol: "DHR", name: "Danaher" },
    { symbol: "BMY", name: "Bristol-Myers Squibb" },
    { symbol: "AMGN", name: "Amgen" },
    { symbol: "GILD", name: "Gilead Sciences" },
    { symbol: "ISRG", name: "Intuitive Surgical" },
    { symbol: "VRTX", name: "Vertex Pharma" },
    { symbol: "REGN", name: "Regeneron Pharma" },
    { symbol: "SYK", name: "Stryker" },
    { symbol: "MDT", name: "Medtronic" },
    { symbol: "ZTS", name: "Zoetis" },
    { symbol: "BSX", name: "Boston Scientific" },
    { symbol: "EW", name: "Edwards Lifesciences" },
    { symbol: "CI", name: "Cigna Group" },
    { symbol: "HCA", name: "HCA Healthcare" },
    { symbol: "CVS", name: "CVS Health" },
    { symbol: "HUM", name: "Humana" },
    { symbol: "MRNA", name: "Moderna" },
    { symbol: "BIIB", name: "Biogen" },
    { symbol: "ILMN", name: "Illumina" },
    { symbol: "DXCM", name: "DexCom" },
    { symbol: "A", name: "Agilent Technologies" },
    { symbol: "IQV", name: "IQVIA Holdings" },
    { symbol: "IDXX", name: "IDEXX Laboratories" },
    // ── Financials ──
    { symbol: "BRK-B", name: "Berkshire Hathaway B" },
    { symbol: "JPM", name: "JPMorgan Chase" },
    { symbol: "V", name: "Visa" },
    { symbol: "MA", name: "Mastercard" },
    { symbol: "BAC", name: "Bank of America" },
    { symbol: "WFC", name: "Wells Fargo" },
    { symbol: "GS", name: "Goldman Sachs" },
    { symbol: "MS", name: "Morgan Stanley" },
    { symbol: "SPGI", name: "S&P Global" },
    { symbol: "BLK", name: "BlackRock" },
    { symbol: "AXP", name: "American Express" },
    { symbol: "C", name: "Citigroup" },
    { symbol: "SCHW", name: "Charles Schwab" },
    { symbol: "CME", name: "CME Group" },
    { symbol: "ICE", name: "Intercontinental Exchange" },
    { symbol: "CB", name: "Chubb" },
    { symbol: "MMC", name: "Marsh McLennan" },
    { symbol: "PGR", name: "Progressive" },
    { symbol: "AON", name: "Aon" },
    { symbol: "MCO", name: "Moody's" },
    { symbol: "USB", name: "US Bancorp" },
    { symbol: "PNC", name: "PNC Financial" },
    { symbol: "TFC", name: "Truist Financial" },
    { symbol: "AIG", name: "AIG" },
    { symbol: "MET", name: "MetLife" },
    { symbol: "PRU", name: "Prudential Financial" },
    { symbol: "AFL", name: "Aflac" },
    { symbol: "PYPL", name: "PayPal Holdings" },
    { symbol: "FIS", name: "Fidelity National Info" },
    { symbol: "FISV", name: "Fiserv" },
    { symbol: "COF", name: "Capital One Financial" },
    { symbol: "DFS", name: "Discover Financial" },
    { symbol: "SYF", name: "Synchrony Financial" },
    { symbol: "SOFI", name: "SoFi Technologies" },
    { symbol: "HOOD", name: "Robinhood" },
    // ── Consumer Discretionary ──
    { symbol: "HD", name: "Home Depot" },
    { symbol: "NKE", name: "Nike" },
    { symbol: "MCD", name: "McDonald's" },
    { symbol: "SBUX", name: "Starbucks" },
    { symbol: "LOW", name: "Lowe's" },
    { symbol: "TJX", name: "TJX Companies" },
    { symbol: "BKNG", name: "Booking Holdings" },
    { symbol: "ABNB", name: "Airbnb" },
    { symbol: "MAR", name: "Marriott International" },
    { symbol: "HLT", name: "Hilton Worldwide" },
    { symbol: "RCL", name: "Royal Caribbean" },
    { symbol: "CMG", name: "Chipotle" },
    { symbol: "YUM", name: "Yum! Brands" },
    { symbol: "DPZ", name: "Domino's Pizza" },
    { symbol: "ROST", name: "Ross Stores" },
    { symbol: "DHI", name: "D.R. Horton" },
    { symbol: "LEN", name: "Lennar" },
    { symbol: "GM", name: "General Motors" },
    { symbol: "F", name: "Ford Motor" },
    { symbol: "RIVN", name: "Rivian" },
    { symbol: "LCID", name: "Lucid Group" },
    { symbol: "LULU", name: "Lululemon" },
    { symbol: "DECK", name: "Deckers Outdoor" },
    { symbol: "ETSY", name: "Etsy" },
    { symbol: "EBAY", name: "eBay" },
    { symbol: "CHWY", name: "Chewy" },
    { symbol: "DKS", name: "Dick's Sporting Goods" },
    // ── Consumer Staples ──
    { symbol: "PG", name: "Procter & Gamble" },
    { symbol: "KO", name: "Coca-Cola" },
    { symbol: "PEP", name: "PepsiCo" },
    { symbol: "COST", name: "Costco" },
    { symbol: "WMT", name: "Walmart" },
    { symbol: "PM", name: "Philip Morris Intl" },
    { symbol: "MO", name: "Altria Group" },
    { symbol: "CL", name: "Colgate-Palmolive" },
    { symbol: "MDLZ", name: "Mondelez" },
    { symbol: "GIS", name: "General Mills" },
    { symbol: "K", name: "Kellanova" },
    { symbol: "KHC", name: "Kraft Heinz" },
    { symbol: "HSY", name: "Hershey" },
    { symbol: "STZ", name: "Constellation Brands" },
    { symbol: "SJM", name: "J.M. Smucker" },
    { symbol: "CAG", name: "ConAgra Brands" },
    { symbol: "KR", name: "Kroger" },
    { symbol: "TGT", name: "Target" },
    { symbol: "DG", name: "Dollar General" },
    { symbol: "DLTR", name: "Dollar Tree" },
    // ── Communication Services ──
    { symbol: "NFLX", name: "Netflix" },
    { symbol: "DIS", name: "Walt Disney" },
    { symbol: "CMCSA", name: "Comcast" },
    { symbol: "T", name: "AT&T" },
    { symbol: "VZ", name: "Verizon" },
    { symbol: "TMUS", name: "T-Mobile US" },
    { symbol: "CHTR", name: "Charter Communications" },
    { symbol: "EA", name: "Electronic Arts" },
    { symbol: "TTWO", name: "Take-Two Interactive" },
    { symbol: "WBD", name: "Warner Bros. Discovery" },
    { symbol: "PARA", name: "Paramount Global" },
    { symbol: "SPOT", name: "Spotify" },
    { symbol: "SNAP", name: "Snap" },
    { symbol: "PINS", name: "Pinterest" },
    { symbol: "RDDT", name: "Reddit" },
    // ── Industrials ──
    { symbol: "CAT", name: "Caterpillar" },
    { symbol: "DE", name: "Deere & Company" },
    { symbol: "UNP", name: "Union Pacific" },
    { symbol: "RTX", name: "RTX (Raytheon)" },
    { symbol: "HON", name: "Honeywell" },
    { symbol: "BA", name: "Boeing" },
    { symbol: "LMT", name: "Lockheed Martin" },
    { symbol: "GE", name: "GE Aerospace" },
    { symbol: "GD", name: "General Dynamics" },
    { symbol: "NOC", name: "Northrop Grumman" },
    { symbol: "MMM", name: "3M" },
    { symbol: "EMR", name: "Emerson Electric" },
    { symbol: "ITW", name: "Illinois Tool Works" },
    { symbol: "ETN", name: "Eaton" },
    { symbol: "WM", name: "Waste Management" },
    { symbol: "RSG", name: "Republic Services" },
    { symbol: "CSX", name: "CSX" },
    { symbol: "NSC", name: "Norfolk Southern" },
    { symbol: "FDX", name: "FedEx" },
    { symbol: "UPS", name: "UPS" },
    { symbol: "DAL", name: "Delta Air Lines" },
    { symbol: "UAL", name: "United Airlines" },
    { symbol: "LUV", name: "Southwest Airlines" },
    { symbol: "GEV", name: "GE Vernova" },
    // ── Energy ──
    { symbol: "XOM", name: "Exxon Mobil" },
    { symbol: "CVX", name: "Chevron" },
    { symbol: "COP", name: "ConocoPhillips" },
    { symbol: "EOG", name: "EOG Resources" },
    { symbol: "SLB", name: "Schlumberger" },
    { symbol: "MPC", name: "Marathon Petroleum" },
    { symbol: "PSX", name: "Phillips 66" },
    { symbol: "VLO", name: "Valero Energy" },
    { symbol: "PXD", name: "Pioneer Natural Resources" },
    { symbol: "OXY", name: "Occidental Petroleum" },
    { symbol: "DVN", name: "Devon Energy" },
    { symbol: "HAL", name: "Halliburton" },
    { symbol: "KMI", name: "Kinder Morgan" },
    { symbol: "WMB", name: "Williams Companies" },
    { symbol: "OKE", name: "ONEOK" },
    { symbol: "FANG", name: "Diamondback Energy" },
    // ── Utilities ──
    { symbol: "NEE", name: "NextEra Energy" },
    { symbol: "DUK", name: "Duke Energy" },
    { symbol: "SO", name: "Southern Company" },
    { symbol: "D", name: "Dominion Energy" },
    { symbol: "AEP", name: "American Electric Power" },
    { symbol: "SRE", name: "Sempra" },
    { symbol: "EXC", name: "Exelon" },
    { symbol: "XEL", name: "Xcel Energy" },
    { symbol: "WEC", name: "WEC Energy" },
    { symbol: "ED", name: "Consolidated Edison" },
    { symbol: "ES", name: "Eversource Energy" },
    { symbol: "CEG", name: "Constellation Energy" },
    { symbol: "VST", name: "Vistra" },
    // ── Real Estate (REITs) ──
    { symbol: "AMT", name: "American Tower" },
    { symbol: "PLD", name: "Prologis" },
    { symbol: "CCI", name: "Crown Castle" },
    { symbol: "EQIX", name: "Equinix" },
    { symbol: "PSA", name: "Public Storage" },
    { symbol: "SPG", name: "Simon Property Group" },
    { symbol: "O", name: "Realty Income" },
    { symbol: "WELL", name: "Welltower" },
    { symbol: "DLR", name: "Digital Realty" },
    { symbol: "AVB", name: "AvalonBay Communities" },
    // ── Materials ──
    { symbol: "LIN", name: "Linde" },
    { symbol: "APD", name: "Air Products" },
    { symbol: "SHW", name: "Sherwin-Williams" },
    { symbol: "FCX", name: "Freeport-McMoRan" },
    { symbol: "NEM", name: "Newmont" },
    { symbol: "NUE", name: "Nucor" },
    { symbol: "DOW", name: "Dow Inc." },
    { symbol: "DD", name: "DuPont" },
    { symbol: "ECL", name: "Ecolab" },
    { symbol: "CTVA", name: "Corteva Agriscience" },
];

/** ETFs, index funds, mutual funds, and target-date funds */
export const POPULAR_FUNDS = [
    // ── Vanguard ETFs ──
    { symbol: "VTI", name: "Vanguard Total Stock Market ETF" },
    { symbol: "VOO", name: "Vanguard S&P 500 ETF" },
    { symbol: "VXUS", name: "Vanguard Total Intl Stock ETF" },
    { symbol: "BND", name: "Vanguard Total Bond Market ETF" },
    { symbol: "VNQ", name: "Vanguard Real Estate ETF" },
    { symbol: "VIG", name: "Vanguard Dividend Appreciation ETF" },
    { symbol: "VGT", name: "Vanguard Info Technology ETF" },
    { symbol: "VYM", name: "Vanguard High Dividend Yield ETF" },
    { symbol: "VUG", name: "Vanguard Growth ETF" },
    { symbol: "VTV", name: "Vanguard Value ETF" },
    { symbol: "VB", name: "Vanguard Small-Cap ETF" },
    { symbol: "VO", name: "Vanguard Mid-Cap ETF" },
    { symbol: "BNDX", name: "Vanguard Total Intl Bond ETF" },
    { symbol: "VWO", name: "Vanguard Emerging Markets ETF" },
    { symbol: "VEA", name: "Vanguard Developed Markets ETF" },
    { symbol: "VT", name: "Vanguard Total World Stock ETF" },
    { symbol: "VCIT", name: "Vanguard Intermediate Corp Bond ETF" },
    { symbol: "VCSH", name: "Vanguard Short Corp Bond ETF" },
    { symbol: "MGK", name: "Vanguard Mega Cap Growth ETF" },
    // ── Vanguard Admiral Mutual Funds ──
    { symbol: "VTSAX", name: "Vanguard Total Stock Market Admiral" },
    { symbol: "VFIAX", name: "Vanguard 500 Index Admiral" },
    { symbol: "VBTLX", name: "Vanguard Total Bond Admiral" },
    { symbol: "VTIAX", name: "Vanguard Total Intl Stock Admiral" },
    { symbol: "VWENX", name: "Vanguard Wellington Admiral" },
    { symbol: "VWINX", name: "Vanguard Wellesley Income" },
    { symbol: "VGSLX", name: "Vanguard Real Estate Admiral" },
    { symbol: "VEXAX", name: "Vanguard Extended Market Admiral" },
    { symbol: "VMFXX", name: "Vanguard Federal Money Market" },
    // ── Vanguard Target-Date ──
    { symbol: "VTINX", name: "Vanguard Target Retirement Income" },
    { symbol: "VTWNX", name: "Vanguard Target 2020" },
    { symbol: "VTTVX", name: "Vanguard Target 2025" },
    { symbol: "VTHRX", name: "Vanguard Target 2030" },
    { symbol: "VTTHX", name: "Vanguard Target 2035" },
    { symbol: "VFORX", name: "Vanguard Target 2040" },
    { symbol: "VTIVX", name: "Vanguard Target 2045" },
    { symbol: "VFIFX", name: "Vanguard Target 2050" },
    { symbol: "VFFVX", name: "Vanguard Target 2055" },
    { symbol: "VTTSX", name: "Vanguard Target 2060" },
    { symbol: "VLXVX", name: "Vanguard Target 2065" },
    { symbol: "VSEVX", name: "Vanguard Target 2070" },
    // ── Fidelity Funds ──
    { symbol: "FXAIX", name: "Fidelity 500 Index" },
    { symbol: "FSKAX", name: "Fidelity Total Market Index" },
    { symbol: "FTIHX", name: "Fidelity Total Intl Index" },
    { symbol: "FXNAX", name: "Fidelity US Bond Index" },
    { symbol: "FSSNX", name: "Fidelity Small Cap Index" },
    { symbol: "FSPSX", name: "Fidelity Intl Index" },
    { symbol: "FSMDX", name: "Fidelity Mid Cap Index" },
    { symbol: "FZROX", name: "Fidelity ZERO Total Market" },
    { symbol: "FNILX", name: "Fidelity ZERO Large Cap" },
    { symbol: "FZILX", name: "Fidelity ZERO Intl" },
    { symbol: "FBALX", name: "Fidelity Balanced" },
    { symbol: "FCNTX", name: "Fidelity Contrafund" },
    // ── Fidelity Target-Date ──
    { symbol: "FIKFX", name: "Fidelity Freedom Index 2030" },
    { symbol: "FBIFX", name: "Fidelity Freedom Index 2035" },
    { symbol: "FIOFX", name: "Fidelity Freedom Index 2045" },
    { symbol: "FFNOX", name: "Fidelity Freedom 2050" },
    { symbol: "FDEWX", name: "Fidelity Freedom 2055" },
    { symbol: "FDKLX", name: "Fidelity Freedom 2060" },
    { symbol: "FDKVX", name: "Fidelity Freedom 2065" },
    // ── Schwab ──
    { symbol: "SWPPX", name: "Schwab S&P 500 Index" },
    { symbol: "SWTSX", name: "Schwab Total Stock Market" },
    { symbol: "SWISX", name: "Schwab Intl Index" },
    { symbol: "SWAGX", name: "Schwab US Aggregate Bond" },
    { symbol: "SCHB", name: "Schwab US Broad Market ETF" },
    { symbol: "SCHD", name: "Schwab US Dividend Equity ETF" },
    { symbol: "SCHX", name: "Schwab US Large-Cap ETF" },
    { symbol: "SCHF", name: "Schwab Intl Equity ETF" },
    { symbol: "SCHG", name: "Schwab US Large-Cap Growth ETF" },
    // ── iShares ETFs ──
    { symbol: "IVV", name: "iShares Core S&P 500 ETF" },
    { symbol: "AGG", name: "iShares Core US Agg Bond ETF" },
    { symbol: "IEFA", name: "iShares Core MSCI EAFE ETF" },
    { symbol: "IEMG", name: "iShares Core Emerging Markets ETF" },
    { symbol: "IJR", name: "iShares Core S&P Small-Cap ETF" },
    { symbol: "IJH", name: "iShares Core S&P Mid-Cap ETF" },
    { symbol: "IWM", name: "iShares Russell 2000 ETF" },
    { symbol: "IWF", name: "iShares Russell 1000 Growth ETF" },
    { symbol: "IWD", name: "iShares Russell 1000 Value ETF" },
    { symbol: "HYG", name: "iShares High Yield Corp Bond ETF" },
    { symbol: "LQD", name: "iShares Investment Grade Corp Bond ETF" },
    { symbol: "TIP", name: "iShares TIPS Bond ETF" },
    { symbol: "EFA", name: "iShares MSCI EAFE ETF" },
    { symbol: "EEM", name: "iShares MSCI Emerging Markets ETF" },
    { symbol: "QUAL", name: "iShares MSCI USA Quality Factor ETF" },
    { symbol: "ITOT", name: "iShares Core S&P Total US Stock ETF" },
    // ── SPDR Sector ETFs ──
    { symbol: "SPY", name: "SPDR S&P 500 ETF Trust" },
    { symbol: "GLD", name: "SPDR Gold Shares" },
    { symbol: "XLK", name: "Technology Select Sector SPDR" },
    { symbol: "XLF", name: "Financial Select Sector SPDR" },
    { symbol: "XLE", name: "Energy Select Sector SPDR" },
    { symbol: "XLV", name: "Health Care Select Sector SPDR" },
    { symbol: "XLI", name: "Industrial Select Sector SPDR" },
    { symbol: "XLC", name: "Communication Services SPDR" },
    { symbol: "XLY", name: "Consumer Discretionary SPDR" },
    { symbol: "XLP", name: "Consumer Staples SPDR" },
    { symbol: "XLU", name: "Utilities SPDR" },
    { symbol: "XLRE", name: "Real Estate SPDR" },
    { symbol: "XLB", name: "Materials SPDR" },
    // ── Other Popular ETFs ──
    { symbol: "QQQ", name: "Invesco QQQ (Nasdaq-100)" },
    { symbol: "QQQM", name: "Invesco NASDAQ 100 ETF" },
    { symbol: "ARKK", name: "ARK Innovation ETF" },
    { symbol: "ARKW", name: "ARK Next Gen Internet ETF" },
    { symbol: "ARKG", name: "ARK Genomic Revolution ETF" },
    { symbol: "DIA", name: "SPDR Dow Jones Industrial ETF" },
    { symbol: "RSP", name: "Invesco S&P 500 Equal Weight ETF" },
    { symbol: "JEPI", name: "JPMorgan Equity Premium Income ETF" },
    { symbol: "JEPQ", name: "JPMorgan Nasdaq Premium Income ETF" },
    { symbol: "SPLG", name: "SPDR Portfolio S&P 500 ETF" },
    // ── T. Rowe Price Target-Date ──
    { symbol: "TRRCX", name: "T. Rowe Price Retirement 2030" },
    { symbol: "TRRDX", name: "T. Rowe Price Retirement 2035" },
    { symbol: "TRRBX", name: "T. Rowe Price Retirement 2040" },
    { symbol: "TRRJX", name: "T. Rowe Price Retirement 2045" },
    { symbol: "TRRMX", name: "T. Rowe Price Retirement 2050" },
    { symbol: "TRRNX", name: "T. Rowe Price Retirement 2055" },
    { symbol: "TRROX", name: "T. Rowe Price Retirement 2060" },
];

/** Cryptocurrency assets — Yahoo Finance format */
export const POPULAR_CRYPTO = [
    // ── Top 20 by Market Cap ──
    { symbol: "BTC-USD", name: "Bitcoin" },
    { symbol: "ETH-USD", name: "Ethereum" },
    { symbol: "SOL-USD", name: "Solana" },
    { symbol: "BNB-USD", name: "BNB" },
    { symbol: "XRP-USD", name: "XRP" },
    { symbol: "ADA-USD", name: "Cardano" },
    { symbol: "DOGE-USD", name: "Dogecoin" },
    { symbol: "AVAX-USD", name: "Avalanche" },
    { symbol: "TRX-USD", name: "TRON" },
    { symbol: "TON11419-USD", name: "Toncoin" },
    { symbol: "DOT-USD", name: "Polkadot" },
    { symbol: "MATIC-USD", name: "Polygon" },
    { symbol: "LINK-USD", name: "Chainlink" },
    { symbol: "SHIB-USD", name: "Shiba Inu" },
    { symbol: "LTC-USD", name: "Litecoin" },
    { symbol: "BCH-USD", name: "Bitcoin Cash" },
    { symbol: "XLM-USD", name: "Stellar" },
    { symbol: "ATOM-USD", name: "Cosmos" },
    { symbol: "NEAR-USD", name: "NEAR Protocol" },
    { symbol: "UNI-USD", name: "Uniswap" },
    // ── DeFi ──
    { symbol: "AAVE-USD", name: "Aave" },
    { symbol: "MKR-USD", name: "Maker" },
    { symbol: "CRV-USD", name: "Curve DAO" },
    { symbol: "SNX-USD", name: "Synthetix" },
    { symbol: "COMP-USD", name: "Compound" },
    { symbol: "SUSHI-USD", name: "SushiSwap" },
    { symbol: "LDO-USD", name: "Lido DAO" },
    { symbol: "PENDLE-USD", name: "Pendle" },
    { symbol: "1INCH-USD", name: "1inch Network" },
    { symbol: "DYDX-USD", name: "dYdX" },
    { symbol: "GMX-USD", name: "GMX" },
    { symbol: "JUP-USD", name: "Jupiter" },
    { symbol: "RAY-USD", name: "Raydium" },
    { symbol: "ORCA-USD", name: "Orca" },
    { symbol: "CAKE-USD", name: "PancakeSwap" },
    { symbol: "RUNE-USD", name: "THORChain" },
    { symbol: "CKB-USD", name: "Nervos Network" },
    // ── Layer 2 / Scaling ──
    { symbol: "ARB-USD", name: "Arbitrum" },
    { symbol: "OP-USD", name: "Optimism" },
    { symbol: "IMX-USD", name: "Immutable X" },
    { symbol: "STRK-USD", name: "Starknet" },
    { symbol: "MANTA-USD", name: "Manta Network" },
    { symbol: "METIS-USD", name: "Metis" },
    { symbol: "BLAST-USD", name: "Blast" },
    { symbol: "ZK-USD", name: "ZKSync" },
    // ── Infrastructure / L1 ──
    { symbol: "APT-USD", name: "Aptos" },
    { symbol: "SUI-USD", name: "Sui" },
    { symbol: "SEI-USD", name: "Sei" },
    { symbol: "FIL-USD", name: "Filecoin" },
    { symbol: "ICP-USD", name: "Internet Computer" },
    { symbol: "HBAR-USD", name: "Hedera" },
    { symbol: "ALGO-USD", name: "Algorand" },
    { symbol: "VET-USD", name: "VeChain" },
    { symbol: "THETA-USD", name: "Theta Network" },
    { symbol: "KAS-USD", name: "Kaspa" },
    { symbol: "EGLD-USD", name: "MultiversX" },
    { symbol: "FTM-USD", name: "Fantom" },
    { symbol: "FLOW-USD", name: "Flow" },
    { symbol: "MINA-USD", name: "Mina Protocol" },
    { symbol: "CELO-USD", name: "Celo" },
    { symbol: "ROSE-USD", name: "Oasis Network" },
    { symbol: "ONE-USD", name: "Harmony" },
    { symbol: "KAVA-USD", name: "Kava" },
    { symbol: "INJ-USD", name: "Injective" },
    // ── AI / DePIN ──
    { symbol: "RENDER-USD", name: "Render" },
    { symbol: "FET-USD", name: "Fetch.ai" },
    { symbol: "GRT-USD", name: "The Graph" },
    { symbol: "TAO-USD", name: "Bittensor" },
    { symbol: "OCEAN-USD", name: "Ocean Protocol" },
    { symbol: "AGIX-USD", name: "SingularityNET" },
    { symbol: "AKT-USD", name: "Akash Network" },
    { symbol: "AR-USD", name: "Arweave" },
    { symbol: "HNT-USD", name: "Helium" },
    { symbol: "RNDR-USD", name: "Render Token" },
    { symbol: "WLD-USD", name: "Worldcoin" },
    { symbol: "AIOZ-USD", name: "AIOZ Network" },
    // ── Gaming / Metaverse ──
    { symbol: "AXS-USD", name: "Axie Infinity" },
    { symbol: "SAND-USD", name: "The Sandbox" },
    { symbol: "MANA-USD", name: "Decentraland" },
    { symbol: "GALA-USD", name: "Gala" },
    { symbol: "ILV-USD", name: "Illuvium" },
    { symbol: "BEAM-USD", name: "Beam" },
    { symbol: "PRIME-USD", name: "Echelon Prime" },
    { symbol: "ENJ-USD", name: "Enjin Coin" },
    { symbol: "SUPER-USD", name: "SuperVerse" },
    // ── RWA / Tokenized Assets ──
    { symbol: "ONDO-USD", name: "Ondo Finance" },
    { symbol: "CFG-USD", name: "Centrifuge" },
    { symbol: "POLYX-USD", name: "Polymesh" },
    // ── Privacy ──
    { symbol: "XMR-USD", name: "Monero" },
    { symbol: "ZEC-USD", name: "Zcash" },
    { symbol: "SCRT-USD", name: "Secret" },
    // ── Legacy Alts ──
    { symbol: "ETC-USD", name: "Ethereum Classic" },
    { symbol: "EOS-USD", name: "EOS" },
    { symbol: "XTZ-USD", name: "Tezos" },
    { symbol: "NEO-USD", name: "NEO" },
    { symbol: "IOTA-USD", name: "IOTA" },
    { symbol: "ZIL-USD", name: "Zilliqa" },
    { symbol: "QTUM-USD", name: "Qtum" },
    { symbol: "WAVES-USD", name: "Waves" },
    // ── Memecoins ──
    { symbol: "PEPE-USD", name: "Pepe" },
    { symbol: "FLOKI-USD", name: "Floki" },
    { symbol: "BONK-USD", name: "Bonk" },
    { symbol: "WIF-USD", name: "dogwifhat" },
    { symbol: "TURBO-USD", name: "Turbo" },
    { symbol: "BRETT-USD", name: "Brett" },
    { symbol: "BABYDOGE-USD", name: "Baby Doge Coin" },
    { symbol: "NEIRO-USD", name: "Neiro" },
    // ── Stablecoins (for tracking) ──
    { symbol: "USDC-USD", name: "USD Coin" },
    { symbol: "USDT-USD", name: "Tether" },
    { symbol: "DAI-USD", name: "Dai" },
];

/**
 * Context-aware ticker options for the quick-add picker.
 * Returns the optimal list order based on account type:
 *  - brokerage → stocks first, then funds (individual stock picking)
 *  - roth / k401 → funds first, then stocks (typically fund-based accounts)
 *  - crypto → crypto only
 */
export function getTickerOptions(accountKey) {
    if (accountKey === "crypto") return POPULAR_CRYPTO;
    if (accountKey === "brokerage") return [...POPULAR_STOCKS, ...POPULAR_FUNDS];
    // Roth / 401k — funds first (most common), then stocks
    return [...POPULAR_FUNDS, ...POPULAR_STOCKS];
}
function getWorkerUrl() {
    const proxy = import.meta.env.VITE_PROXY_URL;
    return proxy ? `${proxy.replace(/\/$/, "")}/market` : "";
}

/**
 * Fetch live prices for an array of ticker symbols.
 * Returns { [SYMBOL]: { price, change, changePct, name } }
 */
const _inflightRequests = new Map();
export async function fetchMarketPrices(symbols, forceRefresh = false) {
    if (!symbols || symbols.length === 0) return {};

    // Deduplicate concurrent requests for the same symbols
    if (!forceRefresh) {
        const dedupeKey = [...symbols].sort().join(",");
        if (_inflightRequests.has(dedupeKey)) return _inflightRequests.get(dedupeKey);
        const promise = _fetchMarketPricesImpl(symbols, forceRefresh);
        _inflightRequests.set(dedupeKey, promise);
        promise.finally(() => _inflightRequests.delete(dedupeKey));
        return promise;
    }
    return _fetchMarketPricesImpl(symbols, forceRefresh);
}

async function _fetchMarketPricesImpl(symbols, forceRefresh) {

    // Check local cache first (skip if forceRefresh)
    if (!forceRefresh) {
        try {
            const cachedTs = await db.get(CACHE_TS_KEY);
            const ttl = await getCacheTTL();
            if (cachedTs && (Date.now() - cachedTs) < ttl) {
                const cached = await db.get(CACHE_KEY);
                if (cached && typeof cached === "object") {
                    const filtered = {};
                    const missing = [];
                    for (const sym of symbols) {
                        if (cached[sym] && cached[sym].price) filtered[sym] = cached[sym];
                        else missing.push(sym);
                    }
                    // If all symbols are cached, return immediately
                    if (missing.length === 0) {
                        console.warn("[MarketData] serving from cache:", Object.keys(filtered).join(", "));
                        return filtered;
                    }
                    // If most are cached, fetch only the missing ones and merge
                    if (Object.keys(filtered).length > 0 && missing.length < symbols.length) {
                        console.warn(`[MarketData] partial cache hit (${Object.keys(filtered).length}/${symbols.length}), fetching missing: ${missing.join(", ")}`);
                        // fetch missing in background, return cached immediately + merge later
                        const url = getWorkerUrl();
                        if (url) {
                            fetch(`${url}?symbols=${missing.join(",")}`, { method: "GET", headers: { "Accept": "application/json" } })
                                .then(r => r.ok ? r.json() : null)
                                .then(json => {
                                    if (json?.data) {
                                        const merged = { ...cached, ...json.data };
                                        db.set(CACHE_KEY, merged);
                                        db.set(CACHE_TS_KEY, Date.now()); // ← update timestamp so merged result is treated as fresh
                                    }
                                }).catch(() => { });
                        }
                        return filtered;
                    }
                }
            }
        } catch (cacheErr) {
            console.warn("[MarketData] cache read error:", cacheErr.message);
        }
    }

    const url = getWorkerUrl();
    if (!url) {
        console.warn("[MarketData] no worker URL configured — falling back to stale cache");
        try {
            const cached = await db.get(CACHE_KEY);
            if (cached && typeof cached === "object") {
                const filtered = {};
                for (const sym of symbols) {
                    if (cached[sym]) filtered[sym] = cached[sym];
                }
                if (Object.keys(filtered).length > 0) return filtered;
            }
        } catch (_) { /* ignore */ }
        return {};
    }

    console.warn(`[MarketData] fetching: ${url}?symbols=${symbols.join(",")}`);

    try {
        const res = await fetch(`${url}?symbols=${symbols.join(",")}`, {
            method: "GET",
            headers: { "Accept": "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const data = json.data || {};

        console.warn(`[MarketData] received ${Object.keys(data).length} prices`);

        // Identify symbols the worker didn't return (e.g., mutual funds like VFIFX)
        const missing = symbols.filter(s => !data[s] || !data[s].price);
        if (missing.length > 0) {
            console.warn(`[MarketData] worker missing ${missing.length} symbols, trying Yahoo fallback: ${missing.join(", ")}`);
            // Rate-limited sequential fetch — 300ms delay between requests to avoid Yahoo 429s
            const YAHOO_DELAY_MS = 300;
            const YAHOO_BATCH_SIZE = 5;
            for (let i = 0; i < missing.length; i += YAHOO_BATCH_SIZE) {
                const batch = missing.slice(i, i + YAHOO_BATCH_SIZE);
                const batchResults = await Promise.allSettled(
                    batch.map(async (sym) => {
                        try {
                            const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
                            const yRes = await fetch(yUrl, { headers: { "User-Agent": "CatalystCash/1.5" } });
                            if (yRes.status === 429) { console.warn(`[MarketData] Yahoo rate limited on ${sym}`); return null; }
                            if (!yRes.ok) return null;
                            const yJson = await yRes.json();
                            const meta = yJson?.chart?.result?.[0]?.meta;
                            if (meta?.regularMarketPrice) {
                                return {
                                    symbol: sym,
                                    price: meta.regularMarketPrice,
                                    previousClose: meta.chartPreviousClose || meta.previousClose || 0,
                                    change: +(meta.regularMarketPrice - (meta.chartPreviousClose || meta.previousClose || 0)).toFixed(2),
                                    changePct: meta.chartPreviousClose ? +(((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100).toFixed(2) : 0,
                                    name: meta.shortName || meta.symbol || sym,
                                    currency: meta.currency || "USD"
                                };
                            }
                            return null;
                        } catch { return null; }
                    })
                );
                for (let j = 0; j < batchResults.length; j++) {
                    const result = batchResults[j];
                    const sym = batch[j];
                    if (result.status === "fulfilled" && result.value) {
                        data[sym] = result.value;
                        console.warn(`[MarketData] Yahoo fallback got ${sym}: $${result.value.price}`);
                    } else {
                        console.warn(`[MarketData] Yahoo failed for ${sym}, attempting to use last known cached price.`);
                        try {
                            const cached = await db.get(CACHE_KEY);
                            if (cached && cached[sym]) {
                                data[sym] = cached[sym];
                                console.warn(`[MarketData] Recovered cached price for ${sym}: $${cached[sym].price}`);
                            }
                        } catch (e) { }
                    }
                }
                // Delay between batches to respect rate limits
                if (i + YAHOO_BATCH_SIZE < missing.length) {
                    await new Promise(r => setTimeout(r, YAHOO_DELAY_MS));
                }
            }
        }

        // Merge into cache
        if (Object.keys(data).length > 0) {
            const existing = (await db.get(CACHE_KEY)) || {};
            const merged = { ...existing, ...data };
            await db.set(CACHE_KEY, merged);
            await db.set(CACHE_TS_KEY, Date.now());
        }

        return data;
    } catch (err) {
        console.warn("[MarketData] fetch failed:", err.message);
        // Fall back to stale cache
        try {
            const cached = await db.get(CACHE_KEY);
            if (cached) {
                const filtered = {};
                for (const sym of symbols) {
                    if (cached[sym]) filtered[sym] = cached[sym];
                }
                return filtered;
            }
        } catch (_) { /* ignore */ }
        return {};
    }
}

/**
 * Calculate total portfolio value from holdings + prices.
 * holdings = [{ symbol: "VTI", shares: 10 }, ...]
 * prices = { VTI: { price: 245.32 }, ... }
 */
export function calcPortfolioValue(holdings, prices) {
    let total = 0;
    const breakdown = [];
    for (const h of holdings) {
        const p = prices[h.symbol];
        const value = p?.price ? +(p.price * h.shares).toFixed(2) : null;
        breakdown.push({
            symbol: h.symbol, shares: h.shares,
            price: p?.price ?? null, value,
            name: p?.name ?? h.symbol,
            change: p?.change ?? null, changePct: p?.changePct ?? null,
        });
        if (value) total += value;
    }
    return { total: +total.toFixed(2), breakdown };
}
