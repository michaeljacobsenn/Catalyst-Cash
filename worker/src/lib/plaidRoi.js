const DEFAULT_PLAID_PRICING = Object.freeze({
  balanceCall: 0.10,
  transactionsRefreshCall: 0.12,
  transactionsAccountMonth: 0.30,
  recurringTransactionsAccountMonth: 0.15,
  liabilitiesAccountMonth: 0.20,
});

function toIsoDayKey(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function readRate(env, key, fallback) {
  const parsed = Number(env?.[key]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function roundCurrency(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function parseStoredJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function classifyPlaidAccount(account = {}) {
  const type = String(account?.type || "").toLowerCase();
  if (type === "credit" || type === "depository") {
    return {
      transactionPriced: true,
      recurringPriced: true,
      liabilityPriced: type === "credit",
    };
  }
  if (type === "loan") {
    return {
      transactionPriced: false,
      recurringPriced: false,
      liabilityPriced: true,
    };
  }
  return {
    transactionPriced: false,
    recurringPriced: false,
    liabilityPriced: false,
  };
}

export function getPlaidPricing(env = {}) {
  return {
    balanceCall: readRate(env, "PLAID_PRICE_BALANCE_CALL", DEFAULT_PLAID_PRICING.balanceCall),
    transactionsRefreshCall: readRate(env, "PLAID_PRICE_TRANSACTIONS_REFRESH_CALL", DEFAULT_PLAID_PRICING.transactionsRefreshCall),
    transactionsAccountMonth: readRate(env, "PLAID_PRICE_TRANSACTIONS_ACCOUNT_MONTH", DEFAULT_PLAID_PRICING.transactionsAccountMonth),
    recurringTransactionsAccountMonth: readRate(env, "PLAID_PRICE_RECURRING_ACCOUNT_MONTH", DEFAULT_PLAID_PRICING.recurringTransactionsAccountMonth),
    liabilitiesAccountMonth: readRate(env, "PLAID_PRICE_LIABILITIES_ACCOUNT_MONTH", DEFAULT_PLAID_PRICING.liabilitiesAccountMonth),
  };
}

export async function recordPlaidUsageDaily(
  db,
  {
    userId,
    itemId,
    source,
    balancesRefreshed = false,
    transactionsRefreshed = false,
    liabilitiesRefreshed = false,
    at = new Date(),
  } = {}
) {
  if (!db || !userId || !itemId || !source) return;
  const balanceCalls = balancesRefreshed ? 1 : 0;
  const transactionRefreshCalls = transactionsRefreshed ? 1 : 0;
  const liabilityCalls = liabilitiesRefreshed ? 1 : 0;
  if (!balanceCalls && !transactionRefreshCalls && !liabilityCalls) return;

  await db.prepare(
    `INSERT INTO plaid_usage_daily (
       day_key,
       user_id,
       item_id,
       source,
       balance_calls,
       transaction_refresh_calls,
       liability_calls
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(day_key, user_id, item_id, source) DO UPDATE SET
       balance_calls = plaid_usage_daily.balance_calls + excluded.balance_calls,
       transaction_refresh_calls = plaid_usage_daily.transaction_refresh_calls + excluded.transaction_refresh_calls,
       liability_calls = plaid_usage_daily.liability_calls + excluded.liability_calls,
       updated_at = CURRENT_TIMESTAMP`
  ).bind(
    toIsoDayKey(at),
    userId,
    itemId,
    source,
    balanceCalls,
    transactionRefreshCalls,
    liabilityCalls
  ).run();
}

export function summarizePlaidRoi({
  pricing = DEFAULT_PLAID_PRICING,
  usageRows = [],
  syncRows = [],
  plaidItems = [],
  days = 30,
} = {}) {
  const activeItems = (plaidItems || []).filter((item) => item?.user_id && item?.item_id);
  const userInstitutionCounts = new Map();
  for (const item of activeItems) {
    userInstitutionCounts.set(
      item.user_id,
      (userInstitutionCounts.get(item.user_id) || 0) + 1
    );
  }

  const activeItemIds = new Set(activeItems.map((item) => `${item.user_id}::${item.item_id}`));
  const accountMix = {
    totalAccounts: 0,
    transactionPricedAccounts: 0,
    recurringPricedAccounts: 0,
    liabilityPricedAccounts: 0,
  };

  for (const row of syncRows || []) {
    const itemKey = `${row?.user_id || ""}::${row?.item_id || ""}`;
    if (!activeItemIds.has(itemKey)) continue;
    const parsed = parseStoredJson(row?.balances_json, {});
    const accounts = Array.isArray(parsed?.accounts) ? parsed.accounts : [];
    for (const account of accounts) {
      accountMix.totalAccounts += 1;
      const classified = classifyPlaidAccount(account);
      if (classified.transactionPriced) accountMix.transactionPricedAccounts += 1;
      if (classified.recurringPriced) accountMix.recurringPricedAccounts += 1;
      if (classified.liabilityPriced) accountMix.liabilityPricedAccounts += 1;
    }
  }

  const usageTotals = {
    balanceCalls: 0,
    transactionRefreshCalls: 0,
    liabilityCalls: 0,
  };
  const sourceTotals = new Map();
  for (const row of usageRows || []) {
    usageTotals.balanceCalls += Number(row?.balance_calls || 0);
    usageTotals.transactionRefreshCalls += Number(row?.transaction_refresh_calls || 0);
    usageTotals.liabilityCalls += Number(row?.liability_calls || 0);
    const source = String(row?.source || "unknown");
    const current = sourceTotals.get(source) || {
      balanceCalls: 0,
      transactionRefreshCalls: 0,
      liabilityCalls: 0,
    };
    current.balanceCalls += Number(row?.balance_calls || 0);
    current.transactionRefreshCalls += Number(row?.transaction_refresh_calls || 0);
    current.liabilityCalls += Number(row?.liability_calls || 0);
    sourceTotals.set(source, current);
  }

  const linkedUsers = userInstitutionCounts.size;
  const linkedInstitutions = activeItems.length;
  const avgInstitutionsPerLinkedUser = linkedUsers > 0 ? linkedInstitutions / linkedUsers : 0;

  const variableCost = {
    balanceCalls: roundCurrency(usageTotals.balanceCalls * pricing.balanceCall),
    transactionRefreshCalls: roundCurrency(usageTotals.transactionRefreshCalls * pricing.transactionsRefreshCall),
    liabilityCalls: 0,
  };
  const variableCostTotal = roundCurrency(
    variableCost.balanceCalls + variableCost.transactionRefreshCalls + variableCost.liabilityCalls
  );

  const subscriptionCost = {
    transactionsAccounts: roundCurrency(accountMix.transactionPricedAccounts * pricing.transactionsAccountMonth),
    recurringTransactionsAccounts: roundCurrency(accountMix.recurringPricedAccounts * pricing.recurringTransactionsAccountMonth),
    liabilitiesAccounts: roundCurrency(accountMix.liabilityPricedAccounts * pricing.liabilitiesAccountMonth),
  };
  const subscriptionCostTotal = roundCurrency(
    subscriptionCost.transactionsAccounts +
      subscriptionCost.recurringTransactionsAccounts +
      subscriptionCost.liabilitiesAccounts
  );

  const projected30DayTotal = roundCurrency(variableCostTotal + subscriptionCostTotal);
  const projected30DayCostPerLinkedUser = roundCurrency(
    linkedUsers > 0 ? projected30DayTotal / linkedUsers : 0
  );
  const projected30DayCostPerInstitution = roundCurrency(
    linkedInstitutions > 0 ? projected30DayTotal / linkedInstitutions : 0
  );

  return {
    days,
    linkedUsers,
    linkedInstitutions,
    avgInstitutionsPerLinkedUser: Number(avgInstitutionsPerLinkedUser.toFixed(2)),
    accountMix,
    usageWindow: {
      balanceCalls: usageTotals.balanceCalls,
      transactionRefreshCalls: usageTotals.transactionRefreshCalls,
      liabilityCalls: usageTotals.liabilityCalls,
      sources: [...sourceTotals.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([source, totals]) => ({ source, ...totals })),
    },
    costEstimate: {
      variable30Day: {
        ...variableCost,
        total: variableCostTotal,
      },
      subscription30DayRunRate: {
        ...subscriptionCost,
        total: subscriptionCostTotal,
      },
      projected30DayTotal,
      projected30DayCostPerLinkedUser,
      projected30DayCostPerInstitution,
    },
  };
}

export async function loadPlaidRoiSummary(db, env, { days = 30 } = {}) {
  if (!db) {
    return summarizePlaidRoi({
      pricing: getPlaidPricing(env),
      usageRows: [],
      syncRows: [],
      plaidItems: [],
      days,
    });
  }

  const safeDays = Math.max(1, Math.min(90, Number(days) || 30));
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (safeDays - 1));
  const sinceDayKey = toIsoDayKey(since);

  const [{ results: usageRows }, { results: syncRows }, { results: plaidItems }] = await Promise.all([
    db.prepare(
      `SELECT day_key, user_id, item_id, source, balance_calls, transaction_refresh_calls, liability_calls
         FROM plaid_usage_daily
        WHERE day_key >= ?
        ORDER BY day_key DESC, user_id ASC, item_id ASC, source ASC`
    ).bind(sinceDayKey).all(),
    db.prepare(
      `SELECT user_id, item_id, balances_json
         FROM sync_data`
    ).bind().all(),
    db.prepare("SELECT user_id, item_id FROM plaid_items").bind().all(),
  ]);

  return summarizePlaidRoi({
    pricing: getPlaidPricing(env),
    usageRows: usageRows || [],
    syncRows: syncRows || [],
    plaidItems: plaidItems || [],
    days: safeDays,
  });
}
