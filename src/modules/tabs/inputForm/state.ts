import { buildSnapshotMessage } from "../../buildSnapshotMessage.js";
import { DEFAULT_FINANCIAL_CONFIG } from "../../contexts/SettingsContext.js";
import { calcPortfolioValue, fetchMarketPrices } from "../../marketData.js";
import { getPlaidAutoFill, getStoredTransactions } from "../../plaid.js";
import { checkAuditQuota } from "../../subscription.js";
import { toMoneyInput } from "./utils.js";

export function createInitialInputFormState({ today, plaidData, config }) {
  return {
    date: today.toISOString().split("T")[0] ?? today.toISOString().slice(0, 10),
    time: (today.toTimeString().split(" ")[0] ?? "00:00:00").slice(0, 5),
    checking: plaidData.checking !== null ? plaidData.checking : "",
    savings: plaidData.vault !== null ? plaidData.vault : "",
    roth: config?.investmentRoth || "",
    brokerage: config?.investmentBrokerage || "",
    k401Balance: config?.k401Balance || "",
    pendingCharges: [],
    habitCount: 10,
    debts: plaidData.debts?.length > 0 ? plaidData.debts : [{ cardId: "", name: "", balance: "" }],
    notes: "",
    autoPaycheckAdd: false,
    paycheckAddOverride: "",
  };
}

export function buildCardSelectGroups(cards, getShortCardLabel) {
  const groupedCards = (cards || []).reduce((groups: Record<string, any[]>, card: any) => {
    (groups[card.institution] = groups[card.institution] || []).push(card);
    return groups;
  }, {});
  return Object.entries(groupedCards).map(([inst, instCards]) => ({
    label: inst,
    options: (instCards as any[]).map((card: any) => ({
      value: card.id || card.name,
      label: getShortCardLabel(cards || [], card).replace(`${inst} `, ""),
    })),
  }));
}

export function mergePlaidAutoFillIntoForm(previousForm: any, freshPlaid: any, overridePlaid: any) {
  const updates: Record<string, unknown> = {};
  if (freshPlaid.checking !== null && !overridePlaid.checking) updates.checking = freshPlaid.checking;
  if (freshPlaid.vault !== null && !overridePlaid.vault) updates.savings = freshPlaid.vault;
  if (freshPlaid.debts?.length > 0) {
    const newDebts = (previousForm.debts || []).map(d => {
      if (!d.cardId) return d;
      if (overridePlaid.debts[d.cardId]) return d;
      const pd = freshPlaid.debts.find(fd => fd.cardId === d.cardId);
      return pd ? { ...d, balance: pd.balance } : d;
    });
    const existingIds = new Set(newDebts.map(d => d.cardId).filter(Boolean));
    const additions = freshPlaid.debts.filter(pd => pd.cardId && !existingIds.has(pd.cardId));
    if (additions.length > 0 || newDebts.some((d, i) => d !== (previousForm.debts || [])[i])) {
      updates.debts = [...newDebts, ...additions];
    }
  }
  return Object.keys(updates).length === 0 ? previousForm : { ...previousForm, ...updates };
}

export function hasReusableAuditSeed(lastAudit: any) {
  const form = lastAudit?.form;
  if (!form || lastAudit?.isTest) return false;
  const debts = Array.isArray(form.debts) ? form.debts : [];
  return Boolean(
    form.checking ||
      form.checkingBalance ||
      form.savings ||
      form.ally ||
      form.roth ||
      form.brokerage ||
      form.k401Balance ||
      form.notes ||
      debts.some((debt: any) => debt?.name || debt?.cardId || debt?.balance)
  );
}

export function mergeLastAuditIntoForm({ previousForm, lastAudit, cards, bankAccounts, today }: any) {
  if (!hasReusableAuditSeed(lastAudit)) return previousForm;
  const prevDebts = Array.isArray(lastAudit.form.debts) ? lastAudit.form.debts : [];
  const debtWithBalance = prevDebts
    .filter(d => d?.name && parseFloat(String(d?.balance || "0")) > 0)
    .map(d => {
      if (d.cardId) return d;
      const match = (cards || []).find(c => c.name === d.name);
      return match ? { ...d, cardId: match.id } : d;
    });
  const plaidNow = getPlaidAutoFill(cards || [], bankAccounts || []) as any;
  const priorForm = lastAudit.form || {};
  return {
    ...previousForm,
    ...lastAudit.form,
    debts: plaidNow.debts?.length > 0 ? plaidNow.debts : debtWithBalance.length ? debtWithBalance : [{ cardId: "", name: "", balance: "" }],
    date: today.toISOString().split("T")[0] ?? today.toISOString().slice(0, 10),
    time: (today.toTimeString().split(" ")[0] ?? "00:00:00").slice(0, 5),
    checking: plaidNow.checking !== null ? plaidNow.checking : toMoneyInput(lastAudit?.form?.checking),
    savings: plaidNow.vault !== null ? plaidNow.vault : toMoneyInput(lastAudit?.form?.savings ?? lastAudit?.form?.ally),
    pendingCharges: [],
    roth: toMoneyInput(priorForm.roth ?? previousForm.roth),
    brokerage: toMoneyInput(priorForm.brokerage ?? previousForm.brokerage),
    k401Balance: toMoneyInput(priorForm.k401Balance ?? previousForm.k401Balance),
    autoPaycheckAdd: typeof priorForm.autoPaycheckAdd === "boolean" ? priorForm.autoPaycheckAdd : false,
    paycheckAddOverride: typeof priorForm.paycheckAddOverride === "string" ? priorForm.paycheckAddOverride : "",
  };
}

export async function loadRecentPlaidTransactions(setPlaidTransactions, setTxnFetchedAt) {
  try {
    const typedStored = getStoredTransactions();
    if (typedStored?.data?.length) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      const cutoffStr = cutoff.toISOString().split("T")[0] ?? cutoff.toISOString().slice(0, 10);
      const recent = typedStored.data.filter(transaction => transaction.date >= cutoffStr && !transaction.pending && !transaction.isCredit);
      setPlaidTransactions(recent);
      setTxnFetchedAt(typedStored.fetchedAt ?? null);
    }
  } catch {
    // ignore transaction cache read failures
  }
}

export async function loadAuditQuota(setAuditQuota) {
  const quota = await checkAuditQuota();
  setAuditQuota(quota ?? null);
}

export async function loadHoldingValues(financialConfig, setHoldingValues) {
  if (!financialConfig?.enableHoldings) return;
  const holdings = financialConfig?.holdings || {};
  const allSymbols = [...new Set([...(holdings.roth || []), ...(holdings.k401 || []), ...(holdings.brokerage || []), ...(holdings.crypto || []), ...(holdings.hsa || [])].map(h => h.symbol))];
  if (allSymbols.length === 0) return;
  try {
    const prices = await fetchMarketPrices(allSymbols);
    const calc = (key: string) => calcPortfolioValue(holdings[key] || [], prices).total;
    setHoldingValues({
      roth: calc("roth"),
      k401: calc("k401"),
      brokerage: calc("brokerage"),
      crypto: calc("crypto"),
      hsa: calc("hsa"),
    });
  } catch {
    // Ignore transient market-data failures in form hydration.
  }
}

export function getTypedFinancialConfig(financialConfig) {
  return financialConfig ?? DEFAULT_FINANCIAL_CONFIG;
}

export function buildInputSnapshotMessage(args) {
  return buildSnapshotMessage(args);
}
