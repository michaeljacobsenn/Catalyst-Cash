import { getBackendUrl } from "./backendUrl.js";
import { log } from "./logger.js";
import { getMarketRefreshTTL } from "./subscription.js";
import { db } from "./utils.js";

const CACHE_KEY = "market-data-cache";
const CACHE_TS_KEY = "market-data-ts";
const REFRESH_SUCCESS_KEYS = {
  launch: "market-data-launch-refresh-success-ts",
  manual: "market-data-manual-refresh-success-ts",
};
const DEFAULT_CACHE_TTL = 15 * 60 * 1000;
const MANUAL_REFRESH_WINDOW_MS = 60 * 60 * 1000;
const YAHOO_DELAY_MS = 300;
const YAHOO_BATCH_SIZE = 5;

const inflightRequests = new Map();

function parseStoredTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeSymbols(symbols = []) {
  return [...new Set((symbols || []).map((symbol) => String(symbol || "").trim()).filter(Boolean))];
}

function getRefreshSuccessKey(reason = "launch") {
  return reason === "manual" ? REFRESH_SUCCESS_KEYS.manual : REFRESH_SUCCESS_KEYS.launch;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildMarketUrl(symbols) {
  return `${getBackendUrl().replace(/\/$/, "")}/market?symbols=${symbols.join(",")}`;
}

async function safeDbGet(key, fallback = null) {
  try {
    const value = await db.get(key);
    return value ?? fallback;
  } catch (error) {
    void log.debug("market-data", "DB read failed", { key, error });
    return fallback;
  }
}

async function safeDbSet(key, value) {
  try {
    await db.set(key, value);
    return true;
  } catch (error) {
    void log.debug("market-data", "DB write failed", { key, error });
    return false;
  }
}

async function getCacheSnapshot() {
  const cached = await safeDbGet(CACHE_KEY, {});
  return cached && typeof cached === "object" ? cached : {};
}

function filterCachedPrices(cache, symbols) {
  const filtered = {};
  for (const symbol of symbols) {
    if (cache?.[symbol]) filtered[symbol] = cache[symbol];
  }
  return filtered;
}

function findMissingSymbols(symbols, prices) {
  return symbols.filter((symbol) => {
    const price = Number(prices?.[symbol]?.price);
    return !Number.isFinite(price) || price <= 0;
  });
}

async function getStoredRefreshTs(key) {
  return parseStoredTimestamp(await safeDbGet(key));
}

async function setStoredRefreshTs(key, timestamp) {
  await safeDbSet(key, timestamp);
}

async function markRefreshSuccess(reason, timestamp = Date.now()) {
  await setStoredRefreshTs(getRefreshSuccessKey(reason), timestamp);
}

async function getCachedPrices(symbols) {
  const cache = await getCacheSnapshot();
  return filterCachedPrices(cache, symbols);
}

async function writeCachedPrices(prices, timestamp = Date.now()) {
  const keys = Object.keys(prices || {});
  if (keys.length === 0) return false;

  const existing = await getCacheSnapshot();
  const merged = { ...existing, ...prices };
  const [savedCache, savedTimestamp] = await Promise.all([
    safeDbSet(CACHE_KEY, merged),
    safeDbSet(CACHE_TS_KEY, timestamp),
  ]);
  return savedCache && savedTimestamp;
}

async function getCacheTTL() {
  try {
    return await getMarketRefreshTTL();
  } catch {
    return DEFAULT_CACHE_TTL;
  }
}

async function readFreshCachedPrices(symbols) {
  const cachedTs = await getStoredRefreshTs(CACHE_TS_KEY);
  if (!cachedTs) return null;

  const ttl = await getCacheTTL();
  if (Date.now() - cachedTs >= ttl) return null;

  const cache = await getCacheSnapshot();
  const filtered = filterCachedPrices(cache, symbols);
  return {
    cache,
    filtered,
    missing: findMissingSymbols(symbols, filtered),
  };
}

async function shouldThrottleRefresh(reason) {
  const lastSuccessfulAt = await getStoredRefreshTs(getRefreshSuccessKey(reason));
  if (!lastSuccessfulAt) return false;
  return Date.now() - lastSuccessfulAt < MANUAL_REFRESH_WINDOW_MS;
}

async function fetchWorkerPrices(symbols) {
  const response = await fetch(buildMarketUrl(symbols), {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const json = await response.json();
  return json?.data && typeof json.data === "object" ? json.data : {};
}

async function fetchYahooPrice(symbol) {
  try {
    const url = `https://corsproxy.io/?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`)}`;
    const response = await fetch(url);
    if (response.status === 429) {
      void log.debug("market-data", "Yahoo fallback rate limited", { symbol });
      return null;
    }
    if (!response.ok) return null;

    const json = await response.json();
    const meta = json?.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice);
    const previousClose = Number(meta?.chartPreviousClose ?? meta?.previousClose ?? 0);
    if (!Number.isFinite(price) || price <= 0) return null;

    return {
      price,
      previousClose,
      change: +(price - previousClose).toFixed(2),
      changePct: previousClose > 0 ? +(((price - previousClose) / previousClose) * 100).toFixed(2) : 0,
      name: meta?.shortName || meta?.symbol || symbol,
      currency: meta?.currency || "USD",
    };
  } catch (error) {
    void log.debug("market-data", "Yahoo fallback failed", { symbol, error });
    return null;
  }
}

async function fillMissingSymbolsFromYahoo(symbols, cache = {}) {
  const recovered = {};

  for (let index = 0; index < symbols.length; index += YAHOO_BATCH_SIZE) {
    const batch = symbols.slice(index, index + YAHOO_BATCH_SIZE);
    const results = await Promise.all(batch.map((symbol) => fetchYahooPrice(symbol)));

    batch.forEach((symbol, resultIndex) => {
      const result = results[resultIndex];
      if (result) {
        recovered[symbol] = result;
        return;
      }
      if (cache?.[symbol]) {
        recovered[symbol] = cache[symbol];
      }
    });

    if (index + YAHOO_BATCH_SIZE < symbols.length) {
      await delay(YAHOO_DELAY_MS);
    }
  }

  return recovered;
}

async function fetchLivePriceSet(symbols, cache = null) {
  const cacheSnapshot = cache || (await getCacheSnapshot());
  const workerData = await fetchWorkerPrices(symbols);
  const missing = findMissingSymbols(symbols, workerData);

  if (missing.length === 0) {
    return workerData;
  }

  const yahooData = await fillMissingSymbolsFromYahoo(missing, cacheSnapshot);
  return { ...workerData, ...yahooData };
}

async function backfillMissingSymbols(symbols, reason, cache = null) {
  if (!symbols.length) return false;

  try {
    const data = await fetchLivePriceSet(symbols, cache);
    if (Object.keys(data).length === 0) return false;

    await writeCachedPrices(data);
    await markRefreshSuccess(reason);
    return true;
  } catch (error) {
    void log.warn("market-data", "Background refresh failed", {
      symbols,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function fetchMarketPriceSet(symbols, { forceRefresh = false, refreshReason = "launch" } = {}) {
  if (!forceRefresh) {
    const freshCache = await readFreshCachedPrices(symbols);
    if (freshCache) {
      if (freshCache.missing.length === 0) {
        return freshCache.filtered;
      }
      if (Object.keys(freshCache.filtered).length > 0) {
        void backfillMissingSymbols(freshCache.missing, refreshReason, freshCache.cache);
        return freshCache.filtered;
      }
    }
  }

  try {
    const data = await fetchLivePriceSet(symbols);
    if (Object.keys(data).length > 0) {
      await writeCachedPrices(data);
      await markRefreshSuccess(refreshReason);
      return data;
    }
  } catch (error) {
    void log.warn("market-data", "Live market refresh failed", {
      symbols,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return getCachedPrices(symbols);
}

export async function getManualMarketRefreshStatus() {
  const lastSuccessfulAt = await getStoredRefreshTs(REFRESH_SUCCESS_KEYS.manual);
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

export async function fetchMarketPrices(symbols, forceRefresh = false, options = {}) {
  const normalizedSymbols = normalizeSymbols(symbols);
  if (normalizedSymbols.length === 0) return {};

  const refreshReason = options.reason === "manual" || forceRefresh ? "manual" : "launch";
  if (await shouldThrottleRefresh(refreshReason)) {
    void log.info("market-data", "Refresh throttled; serving cache", { reason: refreshReason });
    return getCachedPrices(normalizedSymbols);
  }

  if (!forceRefresh) {
    const dedupeKey = [...normalizedSymbols].sort().join(",");
    const inflight = inflightRequests.get(dedupeKey);
    if (inflight) return inflight;

    const request = fetchMarketPriceSet(normalizedSymbols, { forceRefresh, refreshReason });
    inflightRequests.set(dedupeKey, request);
    request.finally(() => inflightRequests.delete(dedupeKey));
    return request;
  }

  return fetchMarketPriceSet(normalizedSymbols, { forceRefresh, refreshReason });
}

export function calcPortfolioValue(holdings = [], prices = {}) {
  let total = 0;
  const breakdown = [];

  for (const holding of holdings) {
    const symbol = String(holding?.symbol || "").trim();
    const quantity = Number(holding?.shares ?? holding?.units ?? 0) || 0;
    const price = Number(prices?.[symbol]?.price);
    const value = Number.isFinite(price) && quantity > 0 ? +(price * quantity).toFixed(2) : null;

    breakdown.push({
      symbol,
      shares: quantity,
      price: Number.isFinite(price) ? price : null,
      value,
      name: prices?.[symbol]?.name ?? symbol,
      change: prices?.[symbol]?.change ?? null,
      changePct: prices?.[symbol]?.changePct ?? null,
    });

    if (value != null) {
      total += value;
    }
  }

  return { total: +total.toFixed(2), breakdown };
}
