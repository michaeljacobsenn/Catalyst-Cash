const HOLDING_BUCKETS = ["roth", "k401", "brokerage", "crypto", "hsa"];

function createHoldingId(bucket, symbol) {
  const normalizedBucket = String(bucket || "").trim() || "holding";
  const normalizedSymbol = normalizeSymbol(symbol) || "position";
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `holding:${normalizedBucket}:${normalizedSymbol}:${crypto.randomUUID()}`;
  }
  return `holding:${normalizedBucket}:${normalizedSymbol}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

function normalizeHoldingId(value) {
  return String(value || "").trim();
}

function normalizeHolding(bucket, holding) {
  if (typeof holding === "string") {
    const symbol = normalizeSymbol(holding);
    if (!symbol) return null;
    return {
      id: createHoldingId(bucket, symbol),
      symbol,
      shares: 0,
    };
  }
  if (!holding || typeof holding !== "object") return null;
  const symbol = normalizeSymbol(holding?.symbol);
  if (!symbol) return null;
  return {
    ...holding,
    id: normalizeHoldingId(holding?.id) || createHoldingId(bucket, symbol),
    symbol,
  };
}

function normalizeHoldings(value) {
  const normalized = {};
  for (const bucket of HOLDING_BUCKETS) {
    const items = Array.isArray(value?.[bucket]) ? value[bucket] : [];
    const nextItems = items.map((holding) => normalizeHolding(bucket, holding)).filter(Boolean);
    if (nextItems.length > 0) normalized[bucket] = nextItems;
  }
  return normalized;
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

function normalizeDeletedHoldingIds(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(normalizeHoldingId).filter(Boolean))];
}

function normalizeExcludedInvestmentSourceIds(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((entry) => String(entry || "").trim()).filter(Boolean))];
}

export function getManualInvestmentSourceId(bucket) {
  return `manual-holdings:${String(bucket || "").trim()}`;
}

export function getManualHoldingSourceId(bucket, holding) {
  const normalizedBucket = String(bucket || "").trim();
  const normalizedId = normalizeHoldingId(holding?.id);
  if (!normalizedBucket || !normalizedId) return "";
  return `manual-holding:${normalizedBucket}:${normalizedId}`;
}

export function getPlaidInvestmentSourceId(accountOrId) {
  if (typeof accountOrId === "string") {
    return `plaid:${String(accountOrId || "").trim()}`;
  }
  const fallback = accountOrId?.name || accountOrId?.bucket || "investment";
  return `plaid:${String(accountOrId?.id || fallback).trim()}`;
}

export function sanitizeManualInvestmentHoldings(config = {}) {
  const holdings = normalizeHoldings(config?.holdings);
  const deletedHoldingSymbols = normalizeDeletedHoldingSymbols(config?.deletedHoldingSymbols);
  const deletedHoldingIds = normalizeDeletedHoldingIds(config?.deletedHoldingIds);
  const excludedInvestmentSourceIds = normalizeExcludedInvestmentSourceIds(config?.excludedInvestmentSourceIds);
  let changed = false;
  const nextHoldings = { ...holdings };
  for (const bucket of HOLDING_BUCKETS) {
    const removedSymbols = deletedHoldingSymbols[bucket];
    const removedIdsSet = new Set(deletedHoldingIds);
    const removedSymbolsSet = new Set(removedSymbols || []);
    if (
      removedIdsSet.size === 0 &&
      removedSymbolsSet.size === 0
    ) continue;
    if (!Array.isArray(nextHoldings[bucket]) || nextHoldings[bucket].length === 0) continue;
    const filtered = nextHoldings[bucket].filter((holding) => {
      const holdingId = normalizeHoldingId(holding?.id);
      const symbol = normalizeSymbol(holding?.symbol);
      if (holdingId && removedIdsSet.has(holdingId)) return false;
      if (symbol && removedSymbolsSet.has(symbol)) return false;
      return true;
    });
    if (filtered.length !== nextHoldings[bucket].length) {
      nextHoldings[bucket] = filtered;
      changed = true;
    }
  }

  const rawHoldings = config?.holdings && typeof config.holdings === "object" ? config.holdings : {};
  const normalizedHoldingsChanged = JSON.stringify(rawHoldings) !== JSON.stringify(holdings);
  return {
    ...config,
    holdings: changed ? nextHoldings : normalizedHoldingsChanged ? holdings : rawHoldings,
    deletedHoldingSymbols,
    deletedHoldingIds,
    excludedInvestmentSourceIds,
  };
}

export function markManualHoldingDeleted(config = {}, bucket, holdingOrSymbol) {
  const normalizedSymbol = normalizeSymbol(
    typeof holdingOrSymbol === "string" ? holdingOrSymbol : holdingOrSymbol?.symbol
  );
  const normalizedHoldingId = normalizeHoldingId(
    typeof holdingOrSymbol === "string" ? "" : holdingOrSymbol?.id
  );
  if (!bucket || (!normalizedSymbol && !normalizedHoldingId)) return sanitizeManualInvestmentHoldings(config);
  const deletedHoldingSymbols = normalizeDeletedHoldingSymbols(config?.deletedHoldingSymbols);
  const deletedHoldingIds = normalizeDeletedHoldingIds(config?.deletedHoldingIds);
  return sanitizeManualInvestmentHoldings({
    ...config,
    deletedHoldingSymbols: {
      ...deletedHoldingSymbols,
      [bucket]: normalizedSymbol
        ? [...new Set([...(deletedHoldingSymbols[bucket] || []), normalizedSymbol])]
        : deletedHoldingSymbols[bucket] || [],
    },
    deletedHoldingIds: normalizedHoldingId ? [...new Set([...deletedHoldingIds, normalizedHoldingId])] : deletedHoldingIds,
  });
}

export function clearDeletedManualHolding(config = {}, bucket, holdingOrSymbol) {
  const normalizedSymbol = normalizeSymbol(
    typeof holdingOrSymbol === "string" ? holdingOrSymbol : holdingOrSymbol?.symbol
  );
  const normalizedHoldingId = normalizeHoldingId(
    typeof holdingOrSymbol === "string" ? "" : holdingOrSymbol?.id
  );
  if (!bucket || (!normalizedSymbol && !normalizedHoldingId)) return sanitizeManualInvestmentHoldings(config);
  const deletedHoldingSymbols = normalizeDeletedHoldingSymbols(config?.deletedHoldingSymbols);
  const nextDeletedHoldingSymbols = { ...deletedHoldingSymbols };
  if (normalizedSymbol && deletedHoldingSymbols[bucket]?.length) {
    const filteredBucket = deletedHoldingSymbols[bucket].filter((entry) => entry !== normalizedSymbol);
    if (filteredBucket.length > 0) {
      nextDeletedHoldingSymbols[bucket] = filteredBucket;
    } else {
      delete nextDeletedHoldingSymbols[bucket];
    }
  }
  const nextDeletedHoldingIds = normalizeDeletedHoldingIds(config?.deletedHoldingIds).filter((entry) => entry !== normalizedHoldingId);

  return sanitizeManualInvestmentHoldings({
    ...config,
    deletedHoldingSymbols: nextDeletedHoldingSymbols,
    deletedHoldingIds: nextDeletedHoldingIds,
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

export function isManualHoldingExcluded(excludedSourceIds = [], bucket, holding) {
  return (
    isInvestmentSourceExcluded(excludedSourceIds, getManualInvestmentSourceId(bucket))
    || isInvestmentSourceExcluded(excludedSourceIds, getManualHoldingSourceId(bucket, holding))
  );
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
