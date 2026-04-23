import type {
  AuditFormData,
  AuditFormDebt,
  BankAccount,
  InvestmentHoldings,
  PlaidInvestmentAccount,
} from "../../../types/index.js";
import { getManualHoldingSourceId, getManualInvestmentSourceId, getPlaidInvestmentSourceId } from "../../investmentHoldings.js";
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

export interface InvestmentAuditSource {
  id: string;
  bucket: "roth" | "brokerage" | "k401";
  label: string;
  detail: string;
  accent: string;
  amount: number;
  sourceType: "manual-balance" | "manual-holdings" | "plaid-account";
  editable: boolean;
  formKey?: "roth" | "brokerage" | "k401Balance";
}

export interface InvestmentTrackingConfig {
  trackRoth?: boolean;
  trackRothContributions?: boolean;
  trackBrokerage?: boolean;
  track401k?: boolean;
  overrideRothValue?: boolean;
  overrideBrokerageValue?: boolean;
  override401kValue?: boolean;
}

export interface InvestmentAutoValues {
  roth: number;
  brokerage: number;
  k401: number;
}

export type InvestmentHoldingBreakdowns = Record<string, number>;

export type InvestmentOverrideState = Record<InvestmentAuditField["key"], boolean>;

const INVESTMENT_BUCKET_META = {
  roth: { label: "Roth IRA", accent: "#8B5CF6", formKey: "roth" },
  brokerage: { label: "Brokerage", accent: "#10B981", formKey: "brokerage" },
  k401: { label: "401(k)", accent: "#3B82F6", formKey: "k401Balance" },
} as const;

function getPlaidInvestmentAmount(account: Partial<PlaidInvestmentAccount> | null | undefined) {
  return Number(account?._plaidBalance ?? (account as { balance?: unknown } | null | undefined)?.balance ?? 0) || 0;
}

function isLikelySameInvestmentTotal(manualValue: number, concreteValue: number) {
  if (manualValue <= 0.004 || concreteValue <= 0.004) return false;
  const tolerance = Math.max(2, Math.abs(concreteValue) * 0.0025);
  return Math.abs(manualValue - concreteValue) <= tolerance;
}

function allowsManualInvestmentBalance(
  trackingConfig: InvestmentTrackingConfig,
  bucket: InvestmentAuditSource["bucket"]
) {
  if (bucket === "roth") return Boolean(trackingConfig.overrideRothValue);
  if (bucket === "brokerage") return Boolean(trackingConfig.overrideBrokerageValue);
  return Boolean(trackingConfig.override401kValue);
}

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

export function buildInvestmentAuditSources({
  trackingConfig,
  holdingBreakdowns = {},
  form,
  holdings = {},
  plaidInvestments = [],
}: {
  trackingConfig: InvestmentTrackingConfig & {
    enableHoldings?: boolean;
    holdings?: InvestmentHoldings;
    plaidInvestments?: PlaidInvestmentAccount[];
  };
  holdingBreakdowns?: InvestmentHoldingBreakdowns;
  form: Pick<InputFormState, "roth" | "brokerage" | "k401Balance">;
  holdings?: InvestmentHoldings;
  plaidInvestments?: PlaidInvestmentAccount[];
}): InvestmentAuditSource[] {
  const sources: InvestmentAuditSource[] = [];

  (["roth", "brokerage", "k401"] as const).forEach((bucket) => {
    const meta = INVESTMENT_BUCKET_META[bucket];
    const enabled =
      bucket === "roth"
        ? Boolean(trackingConfig.trackRoth || trackingConfig.trackRothContributions)
        : bucket === "brokerage"
          ? Boolean(trackingConfig.trackBrokerage)
          : Boolean(trackingConfig.track401k);
    if (!enabled) return;

    const manualInputValue = toNumber(form[meta.formKey]);
    const bucketHoldings = Array.isArray(holdings?.[bucket]) ? holdings[bucket] : [];
    const concreteHoldingTotal = trackingConfig.enableHoldings
      ? bucketHoldings.reduce((sum, holding) => {
          const sourceId = getManualHoldingSourceId(bucket, holding);
          return sum + (sourceId ? Number(holdingBreakdowns[sourceId] || 0) : 0);
        }, 0)
      : 0;
    const bucketPlaidAccounts = plaidInvestments.filter(
      (account) => account?.bucket === bucket && getPlaidInvestmentAmount(account) > 0.004
    );
    const concretePlaidTotal = bucketPlaidAccounts.reduce(
      (sum, account) => sum + getPlaidInvestmentAmount(account),
      0
    );
    const concreteBucketTotal = concreteHoldingTotal + concretePlaidTotal;
    const manualDuplicatesConcrete = isLikelySameInvestmentTotal(manualInputValue, concreteBucketTotal);
    const hasConcreteBucketSources = concreteBucketTotal > 0.004;
    const shouldIncludeManualBalance =
      manualInputValue > 0.004 &&
      !manualDuplicatesConcrete &&
      (!hasConcreteBucketSources || allowsManualInvestmentBalance(trackingConfig, bucket));

    if (shouldIncludeManualBalance) {
      sources.push({
        id: `manual-balance:${bucket}`,
        bucket,
        label: meta.label,
        detail: "Manual balance",
        accent: meta.accent,
        amount: manualInputValue,
        sourceType: "manual-balance",
        editable: true,
        formKey: meta.formKey,
      });
    }

    if (trackingConfig.enableHoldings && bucketHoldings.length > 0) {
      bucketHoldings.forEach((holding) => {
        const sourceId = getManualHoldingSourceId(bucket, holding);
        const amount = Number(holdingBreakdowns[sourceId] || 0);
        if (!sourceId || amount <= 0) return;
        const shares = Number(holding?.shares ?? 0) || 0;
        sources.push({
          id: sourceId,
          bucket,
          label: String(holding?.symbol || meta.label).trim().toUpperCase(),
          detail: `Manual holding${shares > 0 ? ` · ${shares} sh` : ""}`,
          accent: meta.accent,
          amount,
          sourceType: "manual-holdings",
          editable: false,
        });
      });
    }

    bucketPlaidAccounts.forEach((account) => {
        const institution = String(account?.institution || "").trim();
        const name = String(account?.name || meta.label).trim();
        sources.push({
          id: getPlaidInvestmentSourceId(account),
          bucket,
          label: name,
          detail: institution ? `${institution} · linked account` : "Linked account",
          accent: meta.accent,
          amount: getPlaidInvestmentAmount(account),
          sourceType: "plaid-account",
          editable: false,
        });
      });
  });

  return sources;
}

export function splitInvestmentAuditSources(
  sources: InvestmentAuditSource[] = [],
  deletedSourceIds: Record<string, boolean> = {}
) {
  const visibleSources = sources.filter((source) => {
    if (deletedSourceIds[source.id]) return false;
    if (source.sourceType === "manual-holdings" && deletedSourceIds[getManualInvestmentSourceId(source.bucket)]) return false;
    if (source.editable) return Math.abs(Number(source.amount || 0)) > 0.004;
    return Math.abs(Number(source.amount || 0)) > 0.004;
  });

  return {
    visibleSources,
    hiddenSources: sources.filter((source) => !visibleSources.includes(source)),
  };
}

export function getEffectiveInvestmentSourceValue(
  source: InvestmentAuditSource,
  form: InputFormState
): number {
  if (!source.editable || !source.formKey) return Number(source.amount || 0);
  return toNumber(form[source.formKey]);
}

export function buildResolvedInvestmentSnapshotFromSources({
  visibleInvestmentSources,
  form,
}: {
  visibleInvestmentSources: InvestmentAuditSource[];
  form: InputFormState;
}) {
  return visibleInvestmentSources.reduce(
    (snapshot, source) => {
      const value = getEffectiveInvestmentSourceValue(source, form);
      if (value <= 0) return snapshot;
      if (source.bucket === "roth") snapshot.roth += value;
      if (source.bucket === "brokerage") snapshot.brokerage += value;
      if (source.bucket === "k401") snapshot.k401Balance += value;
      return snapshot;
    },
    { roth: 0, brokerage: 0, k401Balance: 0 }
  );
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
  visibleInvestmentSources,
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
  visibleInvestmentSources: InvestmentAuditSource[];
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
  const resolvedInvestmentSnapshot = buildResolvedInvestmentSnapshotFromSources({
    visibleInvestmentSources,
    form,
  });
  const visibleInvestmentKeys = [
    resolvedInvestmentSnapshot.roth > 0 ? "roth" : null,
    resolvedInvestmentSnapshot.brokerage > 0 ? "brokerage" : null,
    resolvedInvestmentSnapshot.k401Balance > 0 ? "k401" : null,
  ].filter((value): value is "roth" | "brokerage" | "k401" => Boolean(value));
  const sanitizedInvestments = {
    roth: resolvedInvestmentSnapshot.roth > 0 ? Number(resolvedInvestmentSnapshot.roth.toFixed(2)) : "",
    brokerage: resolvedInvestmentSnapshot.brokerage > 0 ? Number(resolvedInvestmentSnapshot.brokerage.toFixed(2)) : "",
    k401Balance: resolvedInvestmentSnapshot.k401Balance > 0 ? Number(resolvedInvestmentSnapshot.k401Balance.toFixed(2)) : "",
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
    investmentSnapshot: sanitizedInvestments,
    investments: visibleInvestmentSources
      .map((source) => {
        const amount = getEffectiveInvestmentSourceValue(source, form);
        if (amount <= 0) return null;
        return {
          id: source.id,
          name: source.label,
          amount: Number(amount.toFixed(2)),
          bucket: source.bucket,
          type: source.sourceType,
          sourceType: source.sourceType,
        };
      })
      .filter((investment): investment is NonNullable<typeof investment> => investment !== null),
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
