const HOLDING_BUCKETS = ["roth", "k401", "brokerage", "crypto", "hsa"];

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

function normalizeDeletedHoldingSymbols(value) {
  const normalized = {};
  for (const bucket of HOLDING_BUCKETS) {
    const symbols = Array.isArray(value?.[bucket]) ? value[bucket] : [];
    const deduped = [...new Set(symbols.map(normalizeSymbol).filter(Boolean))];
    if (deduped.length > 0) normalized[bucket] = deduped;
  }
  return normalized;
}

function normalizeExcludedInvestmentSourceIds(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((entry) => String(entry || "").trim()).filter(Boolean))];
}

export function getManualInvestmentSourceId(bucket) {
  return `manual-holdings:${String(bucket || "").trim()}`;
}

export function getPlaidInvestmentSourceId(accountOrId) {
  if (typeof accountOrId === "string") {
    return `plaid:${String(accountOrId || "").trim()}`;
  }
  const fallback = accountOrId?.name || accountOrId?.bucket || "investment";
  return `plaid:${String(accountOrId?.id || fallback).trim()}`;
}

export function sanitizeManualInvestmentHoldings(config = {}) {
  const holdings = config?.holdings && typeof config.holdings === "object" ? config.holdings : {};
  const deletedHoldingSymbols = normalizeDeletedHoldingSymbols(config?.deletedHoldingSymbols);
  const excludedInvestmentSourceIds = normalizeExcludedInvestmentSourceIds(config?.excludedInvestmentSourceIds);
  if (Object.keys(deletedHoldingSymbols).length === 0) {
    if (
      excludedInvestmentSourceIds.length === (Array.isArray(config?.excludedInvestmentSourceIds) ? config.excludedInvestmentSourceIds.length : 0)
      && excludedInvestmentSourceIds.every((entry, index) => entry === config?.excludedInvestmentSourceIds?.[index])
    ) {
      return config;
    }
    return {
      ...config,
      excludedInvestmentSourceIds,
    };
  }

  let changed = false;
  const nextHoldings = { ...holdings };
  for (const bucket of HOLDING_BUCKETS) {
    const removedSymbols = deletedHoldingSymbols[bucket];
    if (!removedSymbols?.length || !Array.isArray(nextHoldings[bucket]) || nextHoldings[bucket].length === 0) continue;
    const removedSet = new Set(removedSymbols);
    const filtered = nextHoldings[bucket].filter((holding) => !removedSet.has(normalizeSymbol(holding?.symbol)));
    if (filtered.length !== nextHoldings[bucket].length) {
      nextHoldings[bucket] = filtered;
      changed = true;
    }
  }

  if (!changed) {
    return {
      ...config,
      deletedHoldingSymbols,
      excludedInvestmentSourceIds,
    };
  }

  return {
    ...config,
    holdings: nextHoldings,
    deletedHoldingSymbols,
    excludedInvestmentSourceIds,
  };
}

export function markManualHoldingDeleted(config = {}, bucket, symbol) {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (!bucket || !normalizedSymbol) return sanitizeManualInvestmentHoldings(config);
  const deletedHoldingSymbols = normalizeDeletedHoldingSymbols(config?.deletedHoldingSymbols);
  return sanitizeManualInvestmentHoldings({
    ...config,
    deletedHoldingSymbols: {
      ...deletedHoldingSymbols,
      [bucket]: [...new Set([...(deletedHoldingSymbols[bucket] || []), normalizedSymbol])],
    },
  });
}

export function clearDeletedManualHolding(config = {}, bucket, symbol) {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (!bucket || !normalizedSymbol) return sanitizeManualInvestmentHoldings(config);
  const deletedHoldingSymbols = normalizeDeletedHoldingSymbols(config?.deletedHoldingSymbols);
  if (!deletedHoldingSymbols[bucket]?.length) {
    return sanitizeManualInvestmentHoldings(config);
  }

  const nextDeletedHoldingSymbols = { ...deletedHoldingSymbols };
  const filteredBucket = deletedHoldingSymbols[bucket].filter((entry) => entry !== normalizedSymbol);
  if (filteredBucket.length > 0) {
    nextDeletedHoldingSymbols[bucket] = filteredBucket;
  } else {
    delete nextDeletedHoldingSymbols[bucket];
  }

  return sanitizeManualInvestmentHoldings({
    ...config,
    deletedHoldingSymbols: nextDeletedHoldingSymbols,
  });
}

export function setInvestmentSourceExcluded(config = {}, sourceId, excluded = true) {
  const normalizedSourceId = String(sourceId || "").trim();
  if (!normalizedSourceId) return sanitizeManualInvestmentHoldings(config);
  const excludedInvestmentSourceIds = normalizeExcludedInvestmentSourceIds(config?.excludedInvestmentSourceIds);
  const nextExcludedInvestmentSourceIds = excluded
    ? [...new Set([...excludedInvestmentSourceIds, normalizedSourceId])]
    : excludedInvestmentSourceIds.filter((entry) => entry !== normalizedSourceId);

  return sanitizeManualInvestmentHoldings({
    ...config,
    excludedInvestmentSourceIds: nextExcludedInvestmentSourceIds,
  });
}

export function isInvestmentSourceExcluded(excludedSourceIds = [], sourceId) {
  const normalizedSourceId = String(sourceId || "").trim();
  if (!normalizedSourceId) return false;
  return normalizeExcludedInvestmentSourceIds(excludedSourceIds).includes(normalizedSourceId);
}

export function getPreferredInvestmentBucketValue({ manualValue = 0, plaidValue = 0 } = {}) {
  const normalizedManual = Number.isFinite(Number(manualValue)) ? Number(manualValue) : 0;
  const normalizedPlaid = Number.isFinite(Number(plaidValue)) ? Number(plaidValue) : 0;

  if (normalizedPlaid > 0) {
    return { value: normalizedPlaid, source: "plaid" };
  }
  if (normalizedManual > 0) {
    return { value: normalizedManual, source: "manual" };
  }
  return { value: 0, source: normalizedPlaid !== 0 ? "plaid" : "manual" };
}
