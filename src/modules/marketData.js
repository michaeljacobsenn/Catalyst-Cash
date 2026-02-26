// ═══════════════════════════════════════════════════════════════
// MARKET DATA SERVICE — Catalyst Cash
// Fetches real-time stock/fund/crypto prices via our Worker proxy.
// Used for auto-tracking Roth IRA, 401k, Brokerage, and Crypto holdings.
// ═══════════════════════════════════════════════════════════════

import { db } from "./utils.js";

const CACHE_KEY = "market-data-cache";
const CACHE_TS_KEY = "market-data-ts";
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

/** Popular index funds / ETFs for quick-add */
export const POPULAR_FUNDS = [
    { symbol: "VTI", name: "Vanguard Total Stock Market ETF" },
    { symbol: "VOO", name: "Vanguard S&P 500 ETF" },
    { symbol: "VXUS", name: "Vanguard Total International Stock ETF" },
    { symbol: "BND", name: "Vanguard Total Bond Market ETF" },
    { symbol: "VTSAX", name: "Vanguard Total Stock Market Index Fund" },
    { symbol: "VFIAX", name: "Vanguard 500 Index Fund" },
    { symbol: "VBTLX", name: "Vanguard Total Bond Market Index Fund" },
    { symbol: "VTIAX", name: "Vanguard Total International Stock Index" },
    { symbol: "SPY", name: "SPDR S&P 500 ETF Trust" },
    { symbol: "QQQ", name: "Invesco QQQ Trust (Nasdaq-100)" },
    { symbol: "IVV", name: "iShares Core S&P 500 ETF" },
    { symbol: "AGG", name: "iShares Core US Aggregate Bond ETF" },
    { symbol: "VNQ", name: "Vanguard Real Estate ETF" },
    { symbol: "SCHD", name: "Schwab US Dividend Equity ETF" },
    { symbol: "VIG", name: "Vanguard Dividend Appreciation ETF" },
    { symbol: "VGT", name: "Vanguard Information Technology ETF" },
    { symbol: "FXAIX", name: "Fidelity 500 Index Fund" },
    { symbol: "FSKAX", name: "Fidelity Total Market Index Fund" },
    { symbol: "SWPPX", name: "Schwab S&P 500 Index Fund" },
    { symbol: "SWTSX", name: "Schwab Total Stock Market Index" },
    // Target-date funds
    { symbol: "VFFVX", name: "Vanguard Target Retirement 2055" },
    { symbol: "VTTSX", name: "Vanguard Target Retirement 2060" },
    { symbol: "VLXVX", name: "Vanguard Target Retirement 2065" },
    { symbol: "VFIFX", name: "Vanguard Target Retirement 2050" },
    { symbol: "VFORX", name: "Vanguard Target Retirement 2040" },
    { symbol: "VTHRX", name: "Vanguard Target Retirement 2030" },
    { symbol: "FDEWX", name: "Fidelity Freedom 2055 Fund" },
    { symbol: "FDKLX", name: "Fidelity Freedom 2060 Fund" },
    { symbol: "FFNOX", name: "Fidelity Freedom 2050 Fund" },
];

/** Popular cryptocurrency assets for quick-add (Yahoo Finance format) */
export const POPULAR_CRYPTO = [
    // Top 10
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
    // DeFi Blue Chips
    { symbol: "LINK-USD", name: "Chainlink" },
    { symbol: "UNI-USD", name: "Uniswap" },
    { symbol: "AAVE-USD", name: "Aave" },
    { symbol: "MKR-USD", name: "Maker" },
    { symbol: "CRV-USD", name: "Curve DAO" },
    { symbol: "SNX-USD", name: "Synthetix" },
    { symbol: "COMP-USD", name: "Compound" },
    { symbol: "SUSHI-USD", name: "SushiSwap" },
    { symbol: "LDO-USD", name: "Lido DAO" },
    { symbol: "PENDLE-USD", name: "Pendle" },
    // Layer 2 / Scaling
    { symbol: "MATIC-USD", name: "Polygon" },
    { symbol: "ARB-USD", name: "Arbitrum" },
    { symbol: "OP-USD", name: "Optimism" },
    { symbol: "IMX-USD", name: "Immutable X" },
    { symbol: "STRK-USD", name: "Starknet" },
    // Infrastructure
    { symbol: "DOT-USD", name: "Polkadot" },
    { symbol: "ATOM-USD", name: "Cosmos" },
    { symbol: "NEAR-USD", name: "NEAR Protocol" },
    { symbol: "APT-USD", name: "Aptos" },
    { symbol: "SUI-USD", name: "Sui" },
    { symbol: "SEI-USD", name: "Sei" },
    { symbol: "FIL-USD", name: "Filecoin" },
    { symbol: "RENDER-USD", name: "Render" },
    { symbol: "INJ-USD", name: "Injective" },
    { symbol: "FET-USD", name: "Fetch.ai" },
    { symbol: "GRT-USD", name: "The Graph" },
    { symbol: "ALGO-USD", name: "Algorand" },
    { symbol: "HBAR-USD", name: "Hedera" },
    { symbol: "VET-USD", name: "VeChain" },
    { symbol: "ICP-USD", name: "Internet Computer" },
    { symbol: "THETA-USD", name: "Theta Network" },
    { symbol: "KAS-USD", name: "Kaspa" },
    // Legacy Alts
    { symbol: "LTC-USD", name: "Litecoin" },
    { symbol: "ETC-USD", name: "Ethereum Classic" },
    { symbol: "XLM-USD", name: "Stellar" },
    { symbol: "BCH-USD", name: "Bitcoin Cash" },
    // Memecoins
    { symbol: "SHIB-USD", name: "Shiba Inu" },
    { symbol: "PEPE-USD", name: "Pepe" },
    { symbol: "FLOKI-USD", name: "Floki" },
    { symbol: "BONK-USD", name: "Bonk" },
    { symbol: "WIF-USD", name: "dogwifhat" },
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
                    for (const sym of symbols) {
                        if (cached[sym] && cached[sym].price) filtered[sym] = cached[sym];
                    }
                    // Only use cache if it has ALL requested symbols with valid prices
                    if (Object.keys(filtered).length === symbols.length) {
                        console.warn("[MarketData] serving from cache:", Object.keys(filtered).join(", "));
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
