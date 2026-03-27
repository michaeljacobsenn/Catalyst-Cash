import { db } from "./utils.js";

const TXN_LINK_OVERRIDE_KEY = "txn-link-overrides-v1";

export async function loadTransactionLinkOverrides() {
  const stored = await db.get(TXN_LINK_OVERRIDE_KEY);
  return stored && typeof stored === "object" ? stored : {};
}

export async function saveTransactionLinkOverride(transactionId, override) {
  if (!transactionId) return {};
  const existing = await loadTransactionLinkOverrides();
  if (!override || (!override.linkedCardId && !override.linkedBankAccountId)) {
    const next = { ...existing };
    delete next[transactionId];
    await db.set(TXN_LINK_OVERRIDE_KEY, next);
    return next;
  }
  const next = {
    ...existing,
    [transactionId]: {
      linkedCardId: override?.linkedCardId || null,
      linkedBankAccountId: override?.linkedBankAccountId || null,
      updatedAt: new Date().toISOString(),
    },
  };
  await db.set(TXN_LINK_OVERRIDE_KEY, next);
  return next;
}
