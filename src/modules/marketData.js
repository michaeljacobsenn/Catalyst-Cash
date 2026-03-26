// ═══════════════════════════════════════════════════════════════
// MARKET DATA SERVICE — Catalyst Cash
// Fetches real-time stock/fund/crypto prices via our Worker proxy.
// Used for auto-tracking Roth IRA, 401k, Brokerage, and Crypto holdings.
// ═══════════════════════════════════════════════════════════════

import { getBackendUrl } from "./api.js";
import { log } from "./logger.js";
import { getMarketRefreshTTL } from "./subscription.js";
import { db } from "./utils.js";

const CACHE_KEY = "market-data-cache";
const CACHE_TS_KEY = "market-data-ts";
const LAUNCH_REFRESH_SUCCESS_KEY = "market-data-launch-refresh-success-ts";
const MANUAL_REFRESH_SUCCESS_KEY = "market-data-manual-refresh-success-ts";
const DEFAULT_CACHE_TTL = 15 * 60 * 1000; // 15 min fallback (sync contexts)
const MANUAL_REFRESH_WINDOW_MS = 60 * 60 * 1000;

function parseStoredTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function getStoredRefreshTs(key) {
  try {
    return parseStoredTimestamp(await db.get(key));
  } catch {
    return null;
  }
}

async function setStoredRefreshTs(key, ts) {
  try {
    await db.set(key, ts);
  } catch {
    /* ignore */
  }
}

async function getCachedPrices(symbols) {
  try {
    const cached = await db.get(CACHE_KEY);
    if (cached && typeof cached === "object") {
      const filtered = {};
      for (const sym of symbols) {
        if (cached[sym]) filtered[sym] = cached[sym];
      }
      return filtered;
    }
  } catch {
    /* ignore */
  }
  return {};
}

export async function getManualMarketRefreshStatus() {
  const lastSuccessfulAt = await getStoredRefreshTs(MANUAL_REFRESH_SUCCESS_KEY);
  if (!lastSuccessfulAt) {
    return {
      allowed: true,
      lastSuccessfulAt: null,
      nextAllowedAt: null,
      remainingMs: 0,
    };
  }

  const remainingMs = Math.max(0, MANUAL_REFRESH_WINDOW_MS - (Date.now() - lastSuccessfulAt));
  return {
    allowed: remainingMs === 0,
    lastSuccessfulAt,
    nextAllowedAt: remainingMs === 0 ? null : lastSuccessfulAt + MANUAL_REFRESH_WINDOW_MS,
    remainingMs,
  };
}

async function shouldThrottleRefresh(reason) {
  const key = reason === "manual" ? MANUAL_REFRESH_SUCCESS_KEY : LAUNCH_REFRESH_SUCCESS_KEY;
  const lastSuccessfulAt = await getStoredRefreshTs(key);
  if (!lastSuccessfulAt) return false;
  return Date.now() - lastSuccessfulAt < MANUAL_REFRESH_WINDOW_MS;
}

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

function getWorkerUrl() {
  return `${getBackendUrl().replace(/\/$/, "")}/market`;
}

/**
 * Fetch live prices for an array of ticker symbols.
 * Returns { [SYMBOL]: { price, change, changePct, name } }
 */
const _inflightRequests = new Map();
export async function fetchMarketPrices(symbols, forceRefresh = false, options = {}) {
  if (!symbols || symbols.length === 0) return {};

  const refreshReason = options.reason === "manual" || forceRefresh ? "manual" : "launch";
  if (await shouldThrottleRefresh(refreshReason)) {
    void log.warn("market-data", `${refreshReason} refresh throttled; serving cache only`);
    return getCachedPrices(symbols);
  }

  // Deduplicate concurrent requests for the same symbols
  if (!forceRefresh) {
    const dedupeKey = [...symbols].sort().join(",");
    if (_inflightRequests.has(dedupeKey)) return _inflightRequests.get(dedupeKey);
    const promise = _fetchMarketPricesImpl(symbols, forceRefresh).then(async ({ data, source }) => {
      if (source === "network" || source === "partial-cache-network") {
        await setStoredRefreshTs(LAUNCH_REFRESH_SUCCESS_KEY, Date.now());
      }
      return data;
    });
    _inflightRequests.set(dedupeKey, promise);
    promise.finally(() => _inflightRequests.delete(dedupeKey));
    return promise;
  }
  const result = await _fetchMarketPricesImpl(symbols, forceRefresh);
  if (result.source === "network") {
    await setStoredRefreshTs(MANUAL_REFRESH_SUCCESS_KEY, Date.now());
  }
  return result.data;
}

async function _fetchMarketPricesImpl(symbols, forceRefresh) {
  // Check local cache first (skip if forceRefresh)
  if (!forceRefresh) {
    try {
      const cachedTs = await db.get(CACHE_TS_KEY);
      const ttl = await getCacheTTL();
      if (cachedTs && Date.now() - cachedTs < ttl) {
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
            void log.warn("market-data", "serving from cache:", Object.keys(filtered).join(", "));
            return { data: filtered, source: "cache" };
          }
          // If most are cached, fetch only the missing ones and merge
          if (Object.keys(filtered).length > 0 && missing.length < symbols.length) {
            void log.warn("market-data", 
              `partial cache hit (${Object.keys(filtered).length}/${symbols.length}), fetching missing: ${missing.join(", ")}`
            );
            // fetch missing in background, return cached immediately + merge later
            const url = getWorkerUrl();
            if (url) {
              fetch(`${url}?symbols=${missing.join(",")}`, { method: "GET", headers: { Accept: "application/json" } })
                .then(r => (r.ok ? r.json() : null))
                .then(json => {
                  if (json?.data) {
                    const merged = { ...cached, ...json.data };
                    db.set(CACHE_KEY, merged);
                    db.set(CACHE_TS_KEY, Date.now()); // ← update timestamp so merged result is treated as fresh
                  }
                })
                .catch(() => {});
            }
            return { data: filtered, source: "partial-cache-network" };
          }
        }
      }
    } catch (cacheErr) {
      void log.warn("market-data", "cache read error:", cacheErr.message);
    }
  }

  const url = getWorkerUrl();
  if (!url) {
    void log.warn("market-data", "no worker URL configured — falling back to stale cache");
    const filtered = await getCachedPrices(symbols);
    return { data: filtered, source: Object.keys(filtered).length > 0 ? "fallback-cache" : "empty" };
  }

  void log.warn("market-data", `fetching: ${url}?symbols=${symbols.join(",")}`);

  try {
    const res = await fetch(`${url}?symbols=${symbols.join(",")}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const data = json.data || {};

    void log.warn("market-data", `received ${Object.keys(data).length} prices`);

    // Identify symbols the worker didn't return (e.g., mutual funds like VFIFX)
    const missing = symbols.filter(s => !data[s] || !data[s].price);
    if (missing.length > 0) {
      void log.warn("market-data", 
        `worker missing ${missing.length} symbols, trying Yahoo fallback: ${missing.join(", ")}`
      );
      // Rate-limited sequential fetch — 300ms delay between requests to avoid Yahoo 429s
      const YAHOO_DELAY_MS = 300;
      const YAHOO_BATCH_SIZE = 5;
      for (let i = 0; i < missing.length; i += YAHOO_BATCH_SIZE) {
        const batch = missing.slice(i, i + YAHOO_BATCH_SIZE);
        const batchResults = await Promise.allSettled(
          batch.map(async sym => {
            try {
              // corsproxy.io is generally faster and more reliable than allorigins
              const yUrl = `https://corsproxy.io/?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`)}`;
              const yRes = await fetch(yUrl);
              if (yRes.status === 429) {
                void log.warn("market-data", `Yahoo rate limited on ${sym}`);
                return null;
              }
              if (!yRes.ok) return null;
              const yJson = await yRes.json();
              const meta = yJson?.chart?.result?.[0]?.meta;
              if (meta?.regularMarketPrice) {
                return {
                  symbol: sym,
                  price: meta.regularMarketPrice,
                  previousClose: meta.chartPreviousClose || meta.previousClose || 0,
                  change: +(meta.regularMarketPrice - (meta.chartPreviousClose || meta.previousClose || 0)).toFixed(2),
                  changePct: meta.chartPreviousClose
                    ? +(((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100).toFixed(
                        2
                      )
                    : 0,
                  name: meta.shortName || meta.symbol || sym,
                  currency: meta.currency || "USD",
                };
              }
              return null;
            } catch {
              return null;
            }
          })
        );
        for (let j = 0; j < batchResults.length; j++) {
          const result = batchResults[j];
          const sym = batch[j];
          if (result.status === "fulfilled" && result.value) {
            data[sym] = result.value;
            void log.warn("market-data", `Yahoo fallback got ${sym}: $${result.value.price}`);
          } else {
            void log.warn("market-data", `Yahoo failed for ${sym}, attempting to use last known cached price.`);
            try {
              const cached = await db.get(CACHE_KEY);
              if (cached && cached[sym]) {
                data[sym] = cached[sym];
                void log.warn("market-data", `Recovered cached price for ${sym}: $${cached[sym].price}`);
              }
            } catch {
              // Cache recovery is best-effort only.
            }
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

    return { data, source: "network" };
  } catch (err) {
    void log.warn("market-data", "fetch failed:", err.message);
    // Fall back to stale cache
    const filtered = await getCachedPrices(symbols);
    return { data: filtered, source: Object.keys(filtered).length > 0 ? "fallback-cache" : "empty" };
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
      symbol: h.symbol,
      shares: h.shares,
      price: p?.price ?? null,
      value,
      name: p?.name ?? h.symbol,
      change: p?.change ?? null,
      changePct: p?.changePct ?? null,
    });
    if (value) total += value;
  }
  return { total: +total.toFixed(2), breakdown };
}
