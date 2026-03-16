const PLAID_TIMEOUT_MS = 15_000;

function parseStoredJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeStoredTransactionsPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { transactions: [], total_transactions: 0 };
  }

  const transactions = Array.isArray(payload.transactions) ? payload.transactions.filter(Boolean) : [];
  return {
    ...payload,
    transactions,
    total_transactions: transactions.length,
  };
}

function comparePlaidTransactions(a, b) {
  const dateA = typeof a?.date === "string" ? a.date : "";
  const dateB = typeof b?.date === "string" ? b.date : "";
  if (dateA !== dateB) return dateB.localeCompare(dateA);
  const pendingA = a?.pending ? 1 : 0;
  const pendingB = b?.pending ? 1 : 0;
  if (pendingA !== pendingB) return pendingA - pendingB;
  const idA = a?.transaction_id || "";
  const idB = b?.transaction_id || "";
  return idA.localeCompare(idB);
}

function createTimeoutFetch(timeoutMs) {
  return async (input, init = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };
}

export function mergePlaidTransactions(existingPayload, syncPayload) {
  const existing = normalizeStoredTransactionsPayload(existingPayload);
  const byId = new Map(
    existing.transactions
      .filter((transaction) => transaction?.transaction_id)
      .map((transaction) => [transaction.transaction_id, transaction])
  );

  for (const transaction of syncPayload?.added || []) {
    if (!transaction?.transaction_id) continue;
    byId.set(transaction.transaction_id, transaction);
  }

  for (const transaction of syncPayload?.modified || []) {
    if (!transaction?.transaction_id) continue;
    byId.set(transaction.transaction_id, transaction);
  }

  for (const transaction of syncPayload?.removed || []) {
    if (!transaction?.transaction_id) continue;
    byId.delete(transaction.transaction_id);
  }

  const transactions = [...byId.values()].sort(comparePlaidTransactions);
  return {
    transactions,
    total_transactions: transactions.length,
  };
}

export async function fetchPlaidJson(plaidDomain, endpoint, env, body, fetchWithTimeout = createTimeoutFetch(PLAID_TIMEOUT_MS)) {
  const plaidRes = await fetchWithTimeout(`${plaidDomain}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.PLAID_CLIENT_ID,
      secret: env.PLAID_SECRET,
      ...body,
    }),
  });

  if (!plaidRes.ok) {
    const errorText = await plaidRes.text().catch(() => "");
    throw new Error(`Plaid ${endpoint} failed (${plaidRes.status})${errorText ? `: ${errorText}` : ""}`);
  }

  return plaidRes.json();
}

export async function getDbFirstResult(db, sql, params = []) {
  const { results } = await db.prepare(sql).bind(...params).all();
  return results?.[0] || null;
}

export async function getStoredSyncRow(db, userId, itemId) {
  if (!db) return null;
  return getDbFirstResult(db, "SELECT * FROM sync_data WHERE user_id = ? AND item_id = ?", [userId, itemId]);
}

export async function writeSyncRow(db, userId, itemId, updates = {}) {
  if (!db) return;

  const existing = (await getStoredSyncRow(db, userId, itemId)) || {};
  const balancesJson = updates.balancesJson ?? existing.balances_json ?? "{}";
  const liabilitiesJson = updates.liabilitiesJson ?? existing.liabilities_json ?? "{}";
  const transactionsJson = updates.transactionsJson ?? existing.transactions_json ?? "{}";

  await db.prepare(
    `INSERT INTO sync_data (user_id, item_id, balances_json, liabilities_json, transactions_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, item_id) DO UPDATE SET
       balances_json = excluded.balances_json,
       liabilities_json = excluded.liabilities_json,
       transactions_json = excluded.transactions_json,
       last_synced_at = CURRENT_TIMESTAMP`
  ).bind(userId, itemId, balancesJson, liabilitiesJson, transactionsJson).run();
}

export async function fetchAllPlaidTransactionsSync(
  plaidDomain,
  env,
  accessToken,
  initialCursor = null,
  fetchWithTimeout = createTimeoutFetch(PLAID_TIMEOUT_MS)
) {
  let cursor = initialCursor || null;
  let nextCursor = initialCursor || null;
  let hasMore = true;
  const aggregate = {
    added: [],
    modified: [],
    removed: [],
  };

  while (hasMore) {
    const response = await fetchPlaidJson(
      plaidDomain,
      "/transactions/sync",
      env,
      {
        access_token: accessToken,
        ...(cursor ? { cursor } : {}),
      },
      fetchWithTimeout
    );

    aggregate.added.push(...(response.added || []));
    aggregate.modified.push(...(response.modified || []));
    aggregate.removed.push(...(response.removed || []));
    nextCursor = response.next_cursor || nextCursor;
    hasMore = Boolean(response.has_more);
    cursor = nextCursor;
  }

  return {
    syncPayload: aggregate,
    nextCursor: nextCursor || initialCursor || null,
  };
}

export async function syncTransactionsForItem({
  db,
  userId,
  itemId,
  accessToken,
  plaidDomain,
  env,
  fetchWithTimeout = createTimeoutFetch(PLAID_TIMEOUT_MS),
}) {
  const itemRow = db ? await getDbFirstResult(db, "SELECT transactions_cursor FROM plaid_items WHERE item_id = ?", [itemId]) : null;
  const currentCursor = itemRow?.transactions_cursor || null;
  const existingSyncRow = db ? await getStoredSyncRow(db, userId, itemId) : null;
  const existingTransactions = normalizeStoredTransactionsPayload(parseStoredJson(existingSyncRow?.transactions_json, {}));
  const { syncPayload, nextCursor } = await fetchAllPlaidTransactionsSync(
    plaidDomain,
    env,
    accessToken,
    currentCursor,
    fetchWithTimeout
  );
  const mergedTransactions = mergePlaidTransactions(existingTransactions, syncPayload);

  if (db) {
    await writeSyncRow(db, userId, itemId, {
      transactionsJson: JSON.stringify(mergedTransactions),
    });
    await db.prepare(
      "UPDATE plaid_items SET transactions_cursor = ?, updated_at = CURRENT_TIMESTAMP WHERE item_id = ?"
    ).bind(nextCursor, itemId).run();
  }

  return {
    mergedTransactions,
    nextCursor,
  };
}
