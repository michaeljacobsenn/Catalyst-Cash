import type { AuditFormData, AuditFormDebt, BankAccount } from "../../../types/index.js";
import { toNumber, type MoneyInput } from "./utils.js";

export interface InputDebt extends AuditFormDebt {
  cardId: string;
  name: string;
  balance: MoneyInput;
}

export interface PendingCharge {
  amount: MoneyInput | "";
  cardId: string;
  description: string;
  confirmed: boolean;
}

export interface InputFormState extends AuditFormData {
  time: string;
  checking: MoneyInput | "";
  savings: MoneyInput | "";
  roth: MoneyInput | "";
  brokerage: MoneyInput | "";
  k401Balance: MoneyInput | "";
  pendingCharges: PendingCharge[];
  habitCount: number;
  debts: InputDebt[];
  notes: string;
  autoPaycheckAdd: boolean;
  paycheckAddOverride: string;
}

export interface CashAccountMeta {
  count: number;
  label: string;
  total: number | null;
  accounts: Array<{
    id: string;
    bank: string;
    name: string;
    accountType: "checking" | "savings";
    amount: number;
    displayLabel: string;
  }>;
}

export interface InvestmentAuditField {
  key: "roth" | "brokerage" | "k401";
  label: string;
  enabled: boolean;
  accent: string;
  autoValue: number;
  formValue: MoneyInput | "";
  override: boolean;
}

export interface InvestmentTrackingConfig {
  trackRoth?: boolean;
  trackRothContributions?: boolean;
  trackBrokerage?: boolean;
  track401k?: boolean;
}

export interface InvestmentAutoValues {
  roth: number;
  brokerage: number;
  k401: number;
}

export type InvestmentOverrideState = Record<InvestmentAuditField["key"], boolean>;

export function buildCashAccountMeta(
  accounts: BankAccount[] = [],
  accountType: "checking" | "savings",
  fallbackLabel: string
): CashAccountMeta {
  const matches = (accounts || []).filter(
    (account) => String(account?.accountType || "").trim().toLowerCase() === accountType
  );
  if (matches.length === 0) {
    return {
      count: 0,
      label: fallbackLabel,
      total: null,
      accounts: [],
    };
  }

  const label =
    matches.length === 1
      ? String(matches[0]?.name || fallbackLabel)
      : `${fallbackLabel} (${matches.length})`;

  const total = matches.reduce(
    (sum, account) => sum + Number(account?._plaidAvailable ?? account?._plaidBalance ?? account?.balance ?? 0),
    0
  );

  return {
    count: matches.length,
    label,
    total,
    accounts: matches.map((account) => {
      const amount = Number(account?._plaidAvailable ?? account?._plaidBalance ?? account?.balance ?? 0) || 0;
      const bank = String(account?.bank || "").trim();
      const name = String(account?.name || fallbackLabel).trim();
      const displayLabel =
        bank && name && !name.toLowerCase().includes(bank.toLowerCase())
          ? `${bank} · ${name}`
          : name || bank || fallbackLabel;
      return {
        id: String(account?.id || account?._plaidAccountId || `${accountType}-${displayLabel}`),
        bank,
        name,
        accountType,
        amount,
        displayLabel,
      };
    }),
  };
}

export function buildAuditCashAccountSnapshot(
  checkingAccountMeta: CashAccountMeta,
  savingsAccountMeta: CashAccountMeta
) {
  return [...checkingAccountMeta.accounts, ...savingsAccountMeta.accounts].map((account) => ({
    id: account.id,
    bank: account.bank,
    name: account.name,
    accountType: account.accountType,
    amount: Number(account.amount || 0).toFixed(2),
    source: "live",
  }));
}

export function filterCashAccountMeta(
  meta: CashAccountMeta,
  fallbackLabel: string,
  deletedAccountIds: Record<string, boolean>
): CashAccountMeta {
  const visibleAccounts = meta.accounts.filter((account) => !deletedAccountIds[account.id]);
  const total =
    visibleAccounts.length > 0
      ? visibleAccounts.reduce((sum, account) => sum + Number(account.amount || 0), 0)
      : null;
  const label =
    visibleAccounts.length === 1
      ? visibleAccounts[0]?.name || fallbackLabel
      : visibleAccounts.length > 1
        ? `${fallbackLabel} (${visibleAccounts.length})`
        : fallbackLabel;

  return {
    count: visibleAccounts.length,
    label,
    total,
    accounts: visibleAccounts,
  };
}

export function getEffectiveCashAccountTotal(
  meta: CashAccountMeta,
  accountOverrides: Record<string, MoneyInput | undefined>
): number | null {
  if (meta.accounts.length === 0) return meta.total;
  return meta.accounts.reduce((sum, account) => {
    const override = accountOverrides[account.id];
    return sum + (override !== undefined ? toNumber(override) : Number(account.amount || 0));
  }, 0);
}

export function buildLiveDebtBalanceLookup(debts: InputDebt[] = []): Map<string, number> {
  const lookup = new Map<string, number>();
  for (const debt of debts) {
    const cardId = String(debt?.cardId || "").trim();
    if (!cardId) continue;
    lookup.set(cardId, toNumber(debt.balance));
  }
  return lookup;
}

export function getEffectiveDebtTotal(
  debts: InputDebt[] = [],
  liveDebtBalanceByCardId: Map<string, number> = new Map(),
  debtOverrides: Record<string, boolean | undefined> = {}
): number {
  return debts.reduce((sum, debt) => {
    const cardId = String(debt?.cardId || "").trim();
    if (cardId && debtOverrides[cardId] !== true && liveDebtBalanceByCardId.has(cardId)) {
      return sum + Number(liveDebtBalanceByCardId.get(cardId) || 0);
    }
    return sum + toNumber(debt.balance);
  }, 0);
}

export function buildInvestmentAuditFields({
  trackingConfig,
  autoValues,
  form,
  overrides,
}: {
  trackingConfig: InvestmentTrackingConfig;
  autoValues: InvestmentAutoValues;
  form: Pick<InputFormState, "roth" | "brokerage" | "k401Balance">;
  overrides: InvestmentOverrideState;
}): InvestmentAuditField[] {
  return [
    {
      key: "roth",
      label: "Roth IRA",
      enabled: Boolean(trackingConfig.trackRoth || trackingConfig.trackRothContributions),
      accent: "#8B5CF6",
      autoValue: autoValues.roth,
      formValue: form.roth,
      override: Boolean(overrides.roth),
    },
    {
      key: "brokerage",
      label: "Brokerage",
      enabled: Boolean(trackingConfig.trackBrokerage),
      accent: "#10B981",
      autoValue: autoValues.brokerage,
      formValue: form.brokerage,
      override: Boolean(overrides.brokerage),
    },
    {
      key: "k401",
      label: "401(k)",
      enabled: Boolean(trackingConfig.track401k),
      accent: "#3B82F6",
      autoValue: autoValues.k401,
      formValue: form.k401Balance,
      override: Boolean(overrides.k401),
    },
  ];
}

export function splitInvestmentAuditFields(
  fields: InvestmentAuditField[] = [],
  deletedKeys: Partial<Record<InvestmentAuditField["key"], boolean>> = {}
) {
  const visibleFields = fields.filter((field) => {
    if (!field.enabled) return false;
    if (deletedKeys[field.key]) return false;
    if (field.override) return true;
    if (Math.abs(Number(field.autoValue || 0)) > 0.004) return true;
    return Math.abs(toNumber(field.formValue)) > 0.004;
  });
  return {
    visibleFields,
    hiddenFields: fields.filter((field) => field.enabled && !visibleFields.includes(field)),
  };
}

function getInvestmentFieldInputValue(field: InvestmentAuditField, form: InputFormState): number {
  return toNumber(field.key === "k401" ? form.k401Balance : field.key === "brokerage" ? form.brokerage : form.roth);
}

export function getEffectiveInvestmentFieldValue(field: InvestmentAuditField, form: InputFormState): number {
  const explicitValue = getInvestmentFieldInputValue(field, form);
  const autoValue = Number(field.autoValue || 0);
  if (field.override || Math.abs(autoValue) <= 0.004) return explicitValue;
  return autoValue;
}

export function buildResolvedInvestmentSnapshot({
  visibleInvestmentFields,
  form,
}: {
  visibleInvestmentFields: InvestmentAuditField[];
  form: InputFormState;
}) {
  const snapshot: Record<string, number> = {};
  for (const field of visibleInvestmentFields) {
    const resolvedValue = getEffectiveInvestmentFieldValue(field, form);
    if (resolvedValue > 0) snapshot[field.key] = Number(resolvedValue.toFixed(2));
  }
  return {
    roth: snapshot.roth ?? "",
    brokerage: snapshot.brokerage ?? "",
    k401Balance: snapshot.k401 ?? "",
  };
}

export function getCurrentAuditTime(): string {
  return (new Date().toTimeString().split(" ")[0] ?? "00:00:00").slice(0, 5);
}

export function buildAuditSubmitFormState({
  form,
  visibleInvestmentFields,
  effectiveCheckingTotal,
  effectiveSavingsTotal,
  checkingAccountMeta,
  savingsAccountMeta,
  visibleCheckingAccountMeta,
  visibleSavingsAccountMeta,
  cashAccountOverrides,
  checkingOverrideActive,
  savingsOverrideActive,
  hiddenCheckingCount,
  hiddenSavingsCount,
  currentTime = getCurrentAuditTime(),
}: {
  form: InputFormState;
  visibleInvestmentFields: InvestmentAuditField[];
  effectiveCheckingTotal: number | null;
  effectiveSavingsTotal: number | null;
  checkingAccountMeta: CashAccountMeta;
  savingsAccountMeta: CashAccountMeta;
  visibleCheckingAccountMeta: CashAccountMeta;
  visibleSavingsAccountMeta: CashAccountMeta;
  cashAccountOverrides: Record<string, MoneyInput | undefined>;
  checkingOverrideActive: boolean;
  savingsOverrideActive: boolean;
  hiddenCheckingCount: number;
  hiddenSavingsCount: number;
  currentTime?: string;
}) {
  const visibleInvestmentKeys = visibleInvestmentFields.map((field) => field.key);
  const resolvedInvestmentSnapshot = buildResolvedInvestmentSnapshot({
    visibleInvestmentFields,
    form,
  });
  const sanitizedInvestments = {
    roth: visibleInvestmentKeys.includes("roth") ? resolvedInvestmentSnapshot.roth : "",
    brokerage: visibleInvestmentKeys.includes("brokerage") ? resolvedInvestmentSnapshot.brokerage : "",
    k401Balance: visibleInvestmentKeys.includes("k401") ? resolvedInvestmentSnapshot.k401Balance : "",
  };
  const cashAccounts = buildAuditCashAccountSnapshot(visibleCheckingAccountMeta, visibleSavingsAccountMeta);
  const anyCheckingOverridden = visibleCheckingAccountMeta.accounts.some(
    (account) => cashAccountOverrides[account.id] !== undefined
  );
  const anySavingsOverridden = visibleSavingsAccountMeta.accounts.some(
    (account) => cashAccountOverrides[account.id] !== undefined
  );

  return {
    ...form,
    checking: (effectiveCheckingTotal ?? "") as MoneyInput | "",
    savings: (effectiveSavingsTotal ?? "") as MoneyInput | "",
    ...sanitizedInvestments,
    includedInvestmentKeys: visibleInvestmentKeys,
    investmentSnapshot: resolvedInvestmentSnapshot,
    cashAccounts: cashAccounts.map((account) => {
      const override = cashAccountOverrides[account.id];
      return override !== undefined
        ? { ...account, amount: toNumber(override).toFixed(2), overridden: true }
        : account;
    }),
    cashSummary: {
      checkingTotalUsed: effectiveCheckingTotal ?? "",
      savingsTotalUsed: effectiveSavingsTotal ?? "",
      linkedCheckingTotal: checkingAccountMeta.total ?? "",
      linkedSavingsTotal: savingsAccountMeta.total ?? "",
      checkingOverride: checkingOverrideActive || anyCheckingOverridden || hiddenCheckingCount > 0,
      savingsOverride: savingsOverrideActive || anySavingsOverridden || hiddenSavingsCount > 0,
    },
    paycheckAddOverride: "",
    time: currentTime,
  };
}
