// ═══════════════════════════════════════════════════════════════
// MARKET DATA SERVICE — Catalyst Cash
// Fetches real-time stock/fund/crypto prices via our Worker proxy.
// Used for auto-tracking Roth IRA, 401k, Brokerage, and Crypto holdings.
// ═══════════════════════════════════════════════════════════════

import { db } from "./utils.js";

const CACHE_KEY = "market-data-cache";
const CACHE_TS_KEY = "market-data-ts";
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

/** Popular index funds / ETFs / mutual funds for quick-add */
export const POPULAR_FUNDS = [
    // ── Vanguard ETFs ──
    { symbol: "VTI", name: "Vanguard Total Stock Market ETF" },
    { symbol: "VOO", name: "Vanguard S&P 500 ETF" },
    { symbol: "VXUS", name: "Vanguard Total International Stock ETF" },
    { symbol: "BND", name: "Vanguard Total Bond Market ETF" },
    { symbol: "VNQ", name: "Vanguard Real Estate ETF" },
    { symbol: "VIG", name: "Vanguard Dividend Appreciation ETF" },
    { symbol: "VGT", name: "Vanguard Information Technology ETF" },
    { symbol: "VYM", name: "Vanguard High Dividend Yield ETF" },
    { symbol: "VUG", name: "Vanguard Growth ETF" },
    { symbol: "VTV", name: "Vanguard Value ETF" },
    { symbol: "VB", name: "Vanguard Small-Cap ETF" },
    { symbol: "VO", name: "Vanguard Mid-Cap ETF" },
    { symbol: "BNDX", name: "Vanguard Total International Bond ETF" },
    { symbol: "VWO", name: "Vanguard FTSE Emerging Markets ETF" },
    { symbol: "VEA", name: "Vanguard FTSE Developed Markets ETF" },
    { symbol: "VCIT", name: "Vanguard Intermediate-Term Corp Bond ETF" },
    { symbol: "VCSH", name: "Vanguard Short-Term Corp Bond ETF" },
    { symbol: "VTIP", name: "Vanguard Short-Term Inflation-Protected ETF" },
    { symbol: "VHT", name: "Vanguard Health Care ETF" },
    { symbol: "VDC", name: "Vanguard Consumer Staples ETF" },
    { symbol: "VDE", name: "Vanguard Energy ETF" },
    { symbol: "VFH", name: "Vanguard Financials ETF" },
    { symbol: "VPU", name: "Vanguard Utilities ETF" },
    { symbol: "MGK", name: "Vanguard Mega Cap Growth ETF" },
    // ── Vanguard Mutual Funds (Admiral Shares) ──
    { symbol: "VTSAX", name: "Vanguard Total Stock Market Index Admiral" },
    { symbol: "VFIAX", name: "Vanguard 500 Index Admiral" },
    { symbol: "VBTLX", name: "Vanguard Total Bond Market Index Admiral" },
    { symbol: "VTIAX", name: "Vanguard Total Intl Stock Index Admiral" },
    { symbol: "VWENX", name: "Vanguard Wellington Admiral" },
    { symbol: "VWELX", name: "Vanguard Wellington Investor" },
    { symbol: "VWINX", name: "Vanguard Wellesley Income Investor" },
    { symbol: "VGHCX", name: "Vanguard Health Care Fund Investor" },
    { symbol: "VGSLX", name: "Vanguard Real Estate Index Admiral" },
    { symbol: "VEXAX", name: "Vanguard Extended Market Index Admiral" },
    { symbol: "VMFXX", name: "Vanguard Federal Money Market" },
    // ── Vanguard Target-Date Funds ──
    { symbol: "VTINX", name: "Vanguard Target Retirement Income" },
    { symbol: "VTWNX", name: "Vanguard Target Retirement 2020" },
    { symbol: "VTTVX", name: "Vanguard Target Retirement 2025" },
    { symbol: "VTHRX", name: "Vanguard Target Retirement 2030" },
    { symbol: "VTTHX", name: "Vanguard Target Retirement 2035" },
    { symbol: "VFORX", name: "Vanguard Target Retirement 2040" },
    { symbol: "VTIVX", name: "Vanguard Target Retirement 2045" },
    { symbol: "VFIFX", name: "Vanguard Target Retirement 2050" },
    { symbol: "VFFVX", name: "Vanguard Target Retirement 2055" },
    { symbol: "VTTSX", name: "Vanguard Target Retirement 2060" },
    { symbol: "VLXVX", name: "Vanguard Target Retirement 2065" },
    { symbol: "VSEVX", name: "Vanguard Target Retirement 2070" },
    // ── Fidelity Funds ──
    { symbol: "FXAIX", name: "Fidelity 500 Index Fund" },
    { symbol: "FSKAX", name: "Fidelity Total Market Index Fund" },
    { symbol: "FTIHX", name: "Fidelity Total Intl Index Fund" },
    { symbol: "FXNAX", name: "Fidelity US Bond Index Fund" },
    { symbol: "FSSNX", name: "Fidelity Small Cap Index Fund" },
    { symbol: "FSPSX", name: "Fidelity Intl Index Fund" },
    { symbol: "FSMDX", name: "Fidelity Mid Cap Index Fund" },
    { symbol: "FZROX", name: "Fidelity ZERO Total Market Index" },
    { symbol: "FNILX", name: "Fidelity ZERO Large Cap Index" },
    { symbol: "FZILX", name: "Fidelity ZERO Intl Index" },
    { symbol: "FBALX", name: "Fidelity Balanced Fund" },
    { symbol: "FCNTX", name: "Fidelity Contrafund" },
    { symbol: "FXAIX", name: "Fidelity 500 Index" },
    // ── Fidelity Target-Date (Freedom / Freedom Index) ──
    { symbol: "FIKFX", name: "Fidelity Freedom Index 2030" },
    { symbol: "FBIFX", name: "Fidelity Freedom Index 2035" },
    { symbol: "FBIFX", name: "Fidelity Freedom Index 2040" },
    { symbol: "FIOFX", name: "Fidelity Freedom Index 2045" },
    { symbol: "FFNOX", name: "Fidelity Freedom 2050 Fund" },
    { symbol: "FDEWX", name: "Fidelity Freedom 2055 Fund" },
    { symbol: "FDKLX", name: "Fidelity Freedom 2060 Fund" },
    { symbol: "FDKVX", name: "Fidelity Freedom 2065 Fund" },
    // ── Schwab Funds ──
    { symbol: "SWPPX", name: "Schwab S&P 500 Index Fund" },
    { symbol: "SWTSX", name: "Schwab Total Stock Market Index" },
    { symbol: "SWISX", name: "Schwab Intl Index Fund" },
    { symbol: "SWAGX", name: "Schwab US Aggregate Bond Index" },
    { symbol: "SCHB", name: "Schwab US Broad Market ETF" },
    { symbol: "SCHD", name: "Schwab US Dividend Equity ETF" },
    { symbol: "SCHX", name: "Schwab US Large-Cap ETF" },
    { symbol: "SCHF", name: "Schwab Intl Equity ETF" },
    { symbol: "SCHG", name: "Schwab US Large-Cap Growth ETF" },
    { symbol: "SCHV", name: "Schwab US Large-Cap Value ETF" },
    { symbol: "SCHE", name: "Schwab Emerging Markets ETF" },
    // ── iShares ETFs ──
    { symbol: "IVV", name: "iShares Core S&P 500 ETF" },
    { symbol: "AGG", name: "iShares Core US Aggregate Bond ETF" },
    { symbol: "IEFA", name: "iShares Core MSCI EAFE ETF" },
    { symbol: "IEMG", name: "iShares Core MSCI Emerging Markets ETF" },
    { symbol: "IJR", name: "iShares Core S&P Small-Cap ETF" },
    { symbol: "IJH", name: "iShares Core S&P Mid-Cap ETF" },
    { symbol: "IWM", name: "iShares Russell 2000 ETF" },
    { symbol: "IWF", name: "iShares Russell 1000 Growth ETF" },
    { symbol: "IWD", name: "iShares Russell 1000 Value ETF" },
    { symbol: "HYG", name: "iShares iBoxx High Yield Corp Bond ETF" },
    { symbol: "LQD", name: "iShares iBoxx Investment Grade Corp Bond ETF" },
    { symbol: "TIP", name: "iShares TIPS Bond ETF" },
    { symbol: "EFA", name: "iShares MSCI EAFE ETF" },
    { symbol: "EEM", name: "iShares MSCI Emerging Markets ETF" },
    { symbol: "QUAL", name: "iShares MSCI USA Quality Factor ETF" },
    // ── SPDR ETFs ──
    { symbol: "SPY", name: "SPDR S&P 500 ETF Trust" },
    { symbol: "GLD", name: "SPDR Gold Shares" },
    { symbol: "XLK", name: "Technology Select Sector SPDR" },
    { symbol: "XLF", name: "Financial Select Sector SPDR" },
    { symbol: "XLE", name: "Energy Select Sector SPDR" },
    { symbol: "XLV", name: "Health Care Select Sector SPDR" },
    { symbol: "XLI", name: "Industrial Select Sector SPDR" },
    { symbol: "XLC", name: "Communication Services Select Sector SPDR" },
    { symbol: "XLY", name: "Consumer Discretionary Select Sector SPDR" },
    { symbol: "XLP", name: "Consumer Staples Select Sector SPDR" },
    { symbol: "XLU", name: "Utilities Select Sector SPDR" },
    { symbol: "XLRE", name: "Real Estate Select Sector SPDR" },
    { symbol: "XLB", name: "Materials Select Sector SPDR" },
    // ── Other Popular ETFs ──
    { symbol: "QQQ", name: "Invesco QQQ Trust (Nasdaq-100)" },
    { symbol: "QQQM", name: "Invesco NASDAQ 100 ETF" },
    { symbol: "ARKK", name: "ARK Innovation ETF" },
    { symbol: "ARKW", name: "ARK Next Gen Internet ETF" },
    { symbol: "ARKG", name: "ARK Genomic Revolution ETF" },
    { symbol: "DIA", name: "SPDR Dow Jones Industrial Average ETF" },
    { symbol: "RSP", name: "Invesco S&P 500 Equal Weight ETF" },
    { symbol: "JEPI", name: "JPMorgan Equity Premium Income ETF" },
    { symbol: "JEPQ", name: "JPMorgan Nasdaq Equity Premium Income ETF" },
    { symbol: "SPLG", name: "SPDR Portfolio S&P 500 ETF" },
    { symbol: "VT", name: "Vanguard Total World Stock ETF" },
    { symbol: "ITOT", name: "iShares Core S&P Total US Stock Market ETF" },
    // ── T. Rowe Price Target-Date ──
    { symbol: "TRRCX", name: "T. Rowe Price Retirement 2030" },
    { symbol: "TRRDX", name: "T. Rowe Price Retirement 2035" },
    { symbol: "TRRBX", name: "T. Rowe Price Retirement 2040" },
    { symbol: "TRRJX", name: "T. Rowe Price Retirement 2045" },
    { symbol: "TRRMX", name: "T. Rowe Price Retirement 2050" },
    { symbol: "TRRNX", name: "T. Rowe Price Retirement 2055" },
    { symbol: "TRROX", name: "T. Rowe Price Retirement 2060" },
    // ── Individual Stocks (Mega Cap) ──
    { symbol: "AAPL", name: "Apple Inc." },
    { symbol: "MSFT", name: "Microsoft Corp." },
    { symbol: "GOOGL", name: "Alphabet Inc. (Google)" },
    { symbol: "AMZN", name: "Amazon.com Inc." },
    { symbol: "NVDA", name: "NVIDIA Corp." },
    { symbol: "META", name: "Meta Platforms (Facebook)" },
    { symbol: "TSLA", name: "Tesla Inc." },
    { symbol: "BRK-B", name: "Berkshire Hathaway Class B" },
    { symbol: "JPM", name: "JPMorgan Chase & Co." },
    { symbol: "V", name: "Visa Inc." },
    { symbol: "JNJ", name: "Johnson & Johnson" },
    { symbol: "WMT", name: "Walmart Inc." },
    { symbol: "PG", name: "Procter & Gamble Co." },
    { symbol: "MA", name: "Mastercard Inc." },
    { symbol: "UNH", name: "UnitedHealth Group" },
    { symbol: "HD", name: "Home Depot Inc." },
    { symbol: "DIS", name: "Walt Disney Co." },
    { symbol: "COST", name: "Costco Wholesale Corp." },
    { symbol: "NFLX", name: "Netflix Inc." },
    { symbol: "AMD", name: "Advanced Micro Devices" },
    { symbol: "CRM", name: "Salesforce Inc." },
    { symbol: "AVGO", name: "Broadcom Inc." },
    { symbol: "PLTR", name: "Palantir Technologies" },
    { symbol: "COIN", name: "Coinbase Global" },
];

/** Popular cryptocurrency assets for quick-add (Yahoo Finance format) */
export const POPULAR_CRYPTO = [
    // ── Top 15 by Market Cap ──
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
    // ── DeFi Blue Chips ──
    { symbol: "UNI-USD", name: "Uniswap" },
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
    // ── Layer 2 / Scaling ──
    { symbol: "ARB-USD", name: "Arbitrum" },
    { symbol: "OP-USD", name: "Optimism" },
    { symbol: "IMX-USD", name: "Immutable X" },
    { symbol: "STRK-USD", name: "Starknet" },
    { symbol: "MANTA-USD", name: "Manta Network" },
    { symbol: "METIS-USD", name: "Metis" },
    { symbol: "BLAST-USD", name: "Blast" },
    // ── Infrastructure / L1 ──
    { symbol: "ATOM-USD", name: "Cosmos" },
    { symbol: "NEAR-USD", name: "NEAR Protocol" },
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
    // ── AI / DePIN ──
    { symbol: "RENDER-USD", name: "Render" },
    { symbol: "FET-USD", name: "Fetch.ai" },
    { symbol: "GRT-USD", name: "The Graph" },
    { symbol: "INJ-USD", name: "Injective" },
    { symbol: "TAO-USD", name: "Bittensor" },
    { symbol: "RNDR-USD", name: "Render Token" },
    { symbol: "OCEAN-USD", name: "Ocean Protocol" },
    { symbol: "AGIX-USD", name: "SingularityNET" },
    { symbol: "AKT-USD", name: "Akash Network" },
    { symbol: "AR-USD", name: "Arweave" },
    { symbol: "HNT-USD", name: "Helium" },
    // ── Gaming / Metaverse ──
    { symbol: "AXS-USD", name: "Axie Infinity" },
    { symbol: "SAND-USD", name: "The Sandbox" },
    { symbol: "MANA-USD", name: "Decentraland" },
    { symbol: "GALA-USD", name: "Gala" },
    { symbol: "ILV-USD", name: "Illuvium" },
    { symbol: "BEAM-USD", name: "Beam" },
    { symbol: "PRIME-USD", name: "Echelon Prime" },
    // ── RWA / Tokenized Assets ──
    { symbol: "ONDO-USD", name: "Ondo Finance" },
    { symbol: "CFG-USD", name: "Centrifuge" },
    // ── Privacy ──
    { symbol: "XMR-USD", name: "Monero" },
    { symbol: "ZEC-USD", name: "Zcash" },
    // ── Legacy Alts ──
    { symbol: "ETC-USD", name: "Ethereum Classic" },
    { symbol: "XLM-USD", name: "Stellar" },
    { symbol: "BCH-USD", name: "Bitcoin Cash" },
    { symbol: "EOS-USD", name: "EOS" },
    { symbol: "XTZ-USD", name: "Tezos" },
    { symbol: "NEO-USD", name: "NEO" },
    { symbol: "IOTA-USD", name: "IOTA" },
    { symbol: "ZIL-USD", name: "Zilliqa" },
    // ── Memecoins ──
    { symbol: "PEPE-USD", name: "Pepe" },
    { symbol: "FLOKI-USD", name: "Floki" },
    { symbol: "BONK-USD", name: "Bonk" },
    { symbol: "WIF-USD", name: "dogwifhat" },
    { symbol: "TURBO-USD", name: "Turbo" },
    { symbol: "BRETT-USD", name: "Brett" },
    // ── Stablecoins (for tracking) ──
    { symbol: "USDC-USD", name: "USD Coin" },
    { symbol: "USDT-USD", name: "Tether" },
    { symbol: "DAI-USD", name: "Dai" },
];

function getWorkerUrl() {
    const proxy = import.meta.env.VITE_PROXY_URL;
    return proxy ? `${proxy.replace(/\/$/, "")}/market` : "";
}

/**
 * Fetch live prices for an array of ticker symbols.
 * Returns { [SYMBOL]: { price, change, changePct, name } }
 */
export async function fetchMarketPrices(symbols, forceRefresh = false) {
    if (!symbols || symbols.length === 0) return {};

    // Check local cache first (skip if forceRefresh)
    if (!forceRefresh) {
        try {
            const cachedTs = await db.get(CACHE_TS_KEY);
            if (cachedTs && (Date.now() - cachedTs) < CACHE_TTL) {
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
                                        db.set(CACHE_TS_KEY, Date.now());
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
        console.warn("[MarketData] no worker URL configured — VITE_PROXY_URL is empty");
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
            const fallbackResults = await Promise.allSettled(
                missing.map(async (sym) => {
                    try {
                        const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
                        const yRes = await fetch(yUrl, { headers: { "User-Agent": "CatalystCash/1.5" } });
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
            for (const result of fallbackResults) {
                if (result.status === "fulfilled" && result.value) {
                    data[result.value.symbol] = result.value;
                    console.warn(`[MarketData] Yahoo fallback got ${result.value.symbol}: $${result.value.price}`);
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
