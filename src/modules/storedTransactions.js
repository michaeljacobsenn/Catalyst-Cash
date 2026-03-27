import { getStoredTransactions } from "./plaid.js";
import { loadTransactionLinkOverrides } from "./transactionLinkOverrides.js";

export function normalizeStoredTransactions(result) {
  return {
    data: result?.data || result?.transactions || [],
    fetchedAt: result?.fetchedAt || "",
  };
}

export function applyStoredTransactionOverrides(records = [], overrides = {}) {
  return (records || []).map((record) => {
    const override = record?.id ? overrides[record.id] : null;
    if (!override) return record;
    return {
      ...record,
      linkedCardId: override.linkedCardId ?? null,
      linkedBankAccountId: override.linkedBankAccountId ?? null,
    };
  });
}

export async function getHydratedStoredTransactions() {
  const [stored, overrides] = await Promise.all([
    getStoredTransactions(),
    loadTransactionLinkOverrides(),
  ]);
  const normalized = normalizeStoredTransactions(stored);
  return {
    ...normalized,
    overrides,
    data: applyStoredTransactionOverrides(normalized.data, overrides),
  };
}
