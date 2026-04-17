  import {
  useEffect,
  useMemo,
  useRef,
  useState,
    type CSSProperties,
    type ReactNode,
  } from "react";
  import { getShortCardLabel,resolveCardLabel } from "../cards.js";
  import { T } from "../constants.js";
  import {
    ArrowLeft,
    AlertTriangle,
    Minus,
    Plus,
    Zap,
  } from "../icons";
  import UiGlyph from "../UiGlyph.js";
  import { Card as UICard,Label as UILabel } from "../ui.js";
  import { fmt } from "../utils.js";
  import { validateSnapshot } from "../validation.js";

  import type {
    AuditRecord,
    BankAccount,
    Card as PortfolioCard,
    CatalystCashConfig,
    Renewal,
  } from "../../types/index.js";
  import { useAudit } from "../contexts/AuditContext.js";
  import type { PersonaMode,SetFinancialConfig } from "../contexts/SettingsContext.js";
  import { haptic } from "../haptics.js";
  import { getPlaidAutoFill } from "../plaid/autoFill.js";
  import { isGatingEnforced } from "../subscription/gating.js";
  import {
    AuditQuotaNotice,
    InputFormErrorBanner,
    ModelChatQuotaWidget,
    PlaidTransactionsCard,
    SubmitBar,
    ValidationFeedback,
  } from "./inputForm/FeedbackSections.js";
  import { AuditDateCard } from "./inputForm/AuditDateCard";
  import { CashAccountSection } from "./inputForm/CashAccountSection";
  import { ConfigSection } from "./inputForm/ConfigSection";
  import { DebtBalancesSection } from "./inputForm/DebtBalancesSection";
  import { InvestmentBalancesSection } from "./inputForm/InvestmentBalancesSection";
  import { PendingChargesSection } from "./inputForm/PendingChargesSection";
  import {
    buildAuditSubmitFormState,
    buildCashAccountMeta,
    buildLiveDebtBalanceLookup,
    buildInvestmentAuditFields,
    filterCashAccountMeta,
    getEffectiveDebtTotal,
    getEffectiveCashAccountTotal,
    getEffectiveInvestmentFieldValue,
    splitInvestmentAuditFields,
    type InputDebt,
    type InputFormState,
    type InvestmentAuditField,
    type InvestmentOverrideState,
    type PendingCharge,
  } from "./inputForm/model.js";
  import {
    buildAddableDebtCards,
    buildCardSelectGroups,
    buildInputSnapshotMessage,
    createInitialInputFormState,
    getTypedFinancialConfig,
    hasReusableAuditSeed,
    mergeLastAuditIntoForm,
    mergePlaidAutoFillIntoForm,
  } from "./inputForm/state";
  import {
    loadAuditQuota,
    loadHoldingValues,
    loadRecentPlaidTransactions,
  } from "./inputForm/asyncData";
  import { sanitizeDollar, toNumber, type MoneyInput } from "./inputForm/utils.js";

interface HoldingValues {
  roth: number;
  k401: number;
  brokerage: number;
  crypto: number;
  hsa: number;
}

type InvestmentFieldKey = InvestmentAuditField["key"];

interface OverridePlaidState {
  checking: boolean;
  vault: boolean;
  debts: Record<string, boolean | undefined>;
  cashAccounts: Record<string, MoneyInput | undefined>;
}

interface AuditQuota {
  allowed: boolean;
  remaining: number;
  limit: number;
  used?: number;
  monthlyCap?: number;
  monthlyUsed?: number;
  softBlocked?: boolean;
}

interface PlaidTransaction {
  id?: string;
  date: string;
  pending?: boolean;
  isCredit?: boolean;
  amount: number;
  description: string;
  category?: string;
  accountName?: string;
}

interface PlaidAutoFillData {
  checking: number | null;
  vault: number | null;
  debts: InputDebt[];
}

interface InputFormConfig extends CatalystCashConfig {
  trackPaycheck?: boolean;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info?: (message: string) => void;
}

interface DbApi {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void> | void;
}

interface InputFormProps {
  onSubmit: (msg: string, formData: InputFormState & { budgetActuals: Record<string, string | number> }, isTestMode: boolean) => void | Promise<void>;
  isLoading: boolean;
  lastAudit: AuditRecord | null;
  renewals: Renewal[];
  cardAnnualFees: Renewal[];
  cards: PortfolioCard[];
  bankAccounts: BankAccount[];
  onManualImport: (resultText: string) => void | Promise<void>;
  toast: ToastApi;
  financialConfig: InputFormConfig;
  setFinancialConfig: SetFinancialConfig;
  aiProvider: string;
  personalRules: string;
  setPersonalRules: (value: string) => void;
  persona?: PersonaMode;
  instructionHash: number | string | null;
  setInstructionHash: (value: string | number | null) => void;
  db: DbApi;
  onBack: () => void;
  proEnabled?: boolean;
  aiModel?: string;
  setAiModel?: (m: string) => void;
}

interface SelectOption {
  value: string;
  label: string;
}

interface SelectGroup {
  label: string;
  options: SelectOption[];
}

interface CardComponentProps {
  children?: ReactNode;
  className?: string;
  variant?: string;
  style?: CSSProperties;
  onClick?: () => void;
  animate?: boolean;
  delay?: number;
}

interface LabelProps {
  children?: ReactNode;
  style?: CSSProperties;
}

const Card = UICard as unknown as (props: CardComponentProps) => ReactNode;
const Label = UILabel as unknown as (props: LabelProps) => ReactNode;

export default function InputForm({
  onSubmit,
  isLoading,
  lastAudit,
  renewals,
  cardAnnualFees,
  cards,
  bankAccounts,
  financialConfig,
  setFinancialConfig,
  aiProvider,
  personalRules,
  setPersonalRules,
  onBack,
  proEnabled,
  aiModel,
  setAiModel,
}: InputFormProps) {
  const { error } = useAudit();
  const initialToday = useMemo(() => new Date(), []);
  const typedFinancialConfig = getTypedFinancialConfig(financialConfig) as InputFormConfig;
  const setTypedFinancialConfig = setFinancialConfig as unknown as (
    value: InputFormConfig | ((prev: InputFormConfig) => InputFormConfig)
  ) => void;

  const plaidData = useMemo(
    () => getPlaidAutoFill(cards || [], bankAccounts || []) as PlaidAutoFillData,
    [cards, bankAccounts]
  );

  const [plaidTransactions, setPlaidTransactions] = useState<PlaidTransaction[]>([]);
  const [txnFetchedAt, setTxnFetchedAt] = useState<string | number | null>(null);
  const [showTxns, setShowTxns] = useState<boolean>(false);
  const [includeRecentSpending, setIncludeRecentSpending] = useState<boolean>(!!proEnabled);
  useEffect(() => {
    void loadRecentPlaidTransactions(setPlaidTransactions, setTxnFetchedAt);
  }, []);

  useEffect(() => {
    if (!proEnabled) {
      setIncludeRecentSpending(false);
    }
  }, [proEnabled]);

  const [form, setForm] = useState<InputFormState>(
    () =>
      createInitialInputFormState({
        today: initialToday,
        plaidData,
        config: typedFinancialConfig,
      })
  );
  const [isTestMode, setIsTestMode] = useState<boolean>(false);

  const [budgetActuals, setBudgetActuals] = useState<Record<string, string | number>>({});
  const [holdingValues, setHoldingValues] = useState<HoldingValues>({ roth: 0, k401: 0, brokerage: 0, crypto: 0, hsa: 0 });
  const [overrideInvest, setOverrideInvest] = useState<InvestmentOverrideState>({ roth: false, brokerage: false, k401: false });
  const [overridePlaid, setOverridePlaid] = useState<OverridePlaidState>({ checking: false, vault: false, debts: {}, cashAccounts: {} });
  const [deletedDebtCardIds, setDeletedDebtCardIds] = useState<Record<string, boolean>>({});
  const [deletedCashAccountIds, setDeletedCashAccountIds] = useState<Record<string, boolean>>({});
  const [deletedInvestmentKeys, setDeletedInvestmentKeys] = useState<Record<InvestmentFieldKey, boolean>>({
    roth: false,
    brokerage: false,
    k401: false,
  });
  const hydratedAuditSeedKeyRef = useRef<string | null>(null);

  const [auditQuota, setAuditQuota] = useState<AuditQuota | null>(null);
  useEffect(() => {
    void loadAuditQuota(setAuditQuota);
  }, []);

  const effectiveAuditModel = useMemo(
    () => (aiModel === "gpt-4.1" || aiModel === "o3") ? "gpt-4.1" : (aiModel || "gpt-4.1"),
    [aiModel]
  );
  type ChatQuotaState = { allowed: boolean; remaining: number; limit: number; used: number; modelId?: string; alternateModel?: string; alternateRemaining?: number; softBlocked?: boolean };
  const [chatQuota, setChatQuota] = useState<ChatQuotaState | null>(null);
  useEffect(() => {
    if (proEnabled) {
      let cancelled = false;
      void import("../subscription.js")
        .then((mod) => mod.checkChatQuota(effectiveAuditModel))
        .then((quota) => {
          if (!cancelled) setChatQuota(quota);
        })
        .catch(() => {
          if (!cancelled) setChatQuota(null);
        });
      return () => {
        cancelled = true;
      };
    }
    setChatQuota(null);
  }, [effectiveAuditModel, proEnabled]);

  useEffect(() => {
    const freshPlaid = getPlaidAutoFill(cards || [], bankAccounts || []) as PlaidAutoFillData;
    setForm((p) => mergePlaidAutoFillIntoForm(p, freshPlaid, overridePlaid, deletedDebtCardIds));
  }, [cards, bankAccounts, overridePlaid, deletedDebtCardIds]);
  const [showConfig, setShowConfig] = useState<boolean>(false);

  useEffect(() => {
    void loadHoldingValues(financialConfig, setHoldingValues);
  }, [financialConfig?.enableHoldings, financialConfig?.holdings]);

  const validation = useMemo(() => validateSnapshot(form, typedFinancialConfig), [form, typedFinancialConfig]);
  const validationErrors = validation.errors.filter(e => e.severity === "error");
  const validationWarnings = validation.errors.filter(e => e.severity === "warning");

  const activeConfig: InputFormConfig = typedFinancialConfig;
  const checkingAccountMeta = useMemo(
    () => buildCashAccountMeta(bankAccounts || [], "checking", "Checking"),
    [bankAccounts]
  );
  const visibleCheckingAccountMeta = useMemo(
    () => filterCashAccountMeta(checkingAccountMeta, "Checking", deletedCashAccountIds),
    [checkingAccountMeta, deletedCashAccountIds]
  );
  const savingsAccountMeta = useMemo(
    () => buildCashAccountMeta(bankAccounts || [], "savings", "Savings"),
    [bankAccounts]
  );
  const visibleSavingsAccountMeta = useMemo(
    () => filterCashAccountMeta(savingsAccountMeta, "Savings", deletedCashAccountIds),
    [savingsAccountMeta, deletedCashAccountIds]
  );
  const hiddenCheckingAccounts = useMemo(
    () => checkingAccountMeta.accounts.filter((account) => deletedCashAccountIds[account.id]),
    [checkingAccountMeta, deletedCashAccountIds]
  );
  const hiddenSavingsAccounts = useMemo(
    () => savingsAccountMeta.accounts.filter((account) => deletedCashAccountIds[account.id]),
    [savingsAccountMeta, deletedCashAccountIds]
  );
  const showCheckingAccount = activeConfig.trackChecking !== false;
  const showSavingsAccount = activeConfig.trackSavings !== false;
  const plaidInvestmentTotals = useMemo(() => {
    const plaidInvestments = activeConfig?.plaidInvestments || [];
    const sumBucket = (bucket: "roth" | "brokerage" | "k401" | "hsa") =>
      plaidInvestments
        .filter((account) => account?.bucket === bucket)
        .reduce((sum, account) => sum + (Number(account?._plaidBalance) || 0), 0);
    return {
      roth: sumBucket("roth"),
      brokerage: sumBucket("brokerage"),
      k401: sumBucket("k401"),
      hsa: sumBucket("hsa"),
    };
  }, [activeConfig?.plaidInvestments]);

  const investmentAutoValues = useMemo(
    () => ({
      roth:
        activeConfig.enableHoldings && (activeConfig.holdings?.roth || []).length > 0 && holdingValues.roth > 0
          ? holdingValues.roth
          : plaidInvestmentTotals.roth,
      brokerage:
        activeConfig.enableHoldings && (activeConfig.holdings?.brokerage || []).length > 0 && holdingValues.brokerage > 0
          ? holdingValues.brokerage
          : plaidInvestmentTotals.brokerage,
      k401:
        activeConfig.enableHoldings && (activeConfig.holdings?.k401 || []).length > 0 && holdingValues.k401 > 0
          ? holdingValues.k401
          : plaidInvestmentTotals.k401,
    }),
    [
      activeConfig.enableHoldings,
      activeConfig.holdings,
      holdingValues.brokerage,
      holdingValues.k401,
      holdingValues.roth,
      plaidInvestmentTotals.brokerage,
      plaidInvestmentTotals.k401,
      plaidInvestmentTotals.roth,
    ]
  );
  const investmentFields = useMemo(
    () =>
      buildInvestmentAuditFields({
        trackingConfig: activeConfig,
        autoValues: investmentAutoValues,
        form,
        overrides: overrideInvest,
      }),
    [activeConfig, form, investmentAutoValues, overrideInvest]
  );
  const { visibleFields: visibleInvestmentFields, hiddenFields: hiddenInvestmentFields } = useMemo(
    () => splitInvestmentAuditFields(investmentFields, deletedInvestmentKeys),
    [deletedInvestmentKeys, investmentFields]
  );
  const showInvestmentSection = visibleInvestmentFields.length > 0 || hiddenInvestmentFields.length > 0;
  const hasConnectedCashInputs =
    visibleCheckingAccountMeta.count > 0 ||
    hiddenCheckingAccounts.length > 0 ||
    visibleSavingsAccountMeta.count > 0 ||
    hiddenSavingsAccounts.length > 0;
  const hasPortfolioAuditInputs = hasConnectedCashInputs || showInvestmentSection || (cards || []).length > 0;

  const effectiveCheckingTotal = useMemo(
    () =>
      visibleCheckingAccountMeta.accounts.length > 0
        ? getEffectiveCashAccountTotal(visibleCheckingAccountMeta, overridePlaid.cashAccounts)
        : checkingAccountMeta.count === 0
          ? String(form.checking ?? "").trim() === ""
            ? null
            : toNumber(form.checking)
          : null,
    [checkingAccountMeta.count, form.checking, overridePlaid.cashAccounts, visibleCheckingAccountMeta]
  );
  const effectiveSavingsTotal = useMemo(
    () =>
      visibleSavingsAccountMeta.accounts.length > 0
        ? getEffectiveCashAccountTotal(visibleSavingsAccountMeta, overridePlaid.cashAccounts)
        : savingsAccountMeta.count === 0
          ? String(form.savings ?? "").trim() === ""
            ? null
            : toNumber(form.savings)
          : null,
    [form.savings, overridePlaid.cashAccounts, savingsAccountMeta.count, visibleSavingsAccountMeta]
  );
  const visibleInvestmentTotal = useMemo(
    () =>
      visibleInvestmentFields.reduce((sum, field) => sum + getEffectiveInvestmentFieldValue(field, form), 0),
    [form.brokerage, form.k401Balance, form.roth, visibleInvestmentFields]
  );
  const liveDebtBalanceByCardId = useMemo(
    () => buildLiveDebtBalanceLookup(plaidData.debts),
    [plaidData.debts]
  );
  const addableDebtCards = useMemo(() => {
    return buildAddableDebtCards(cards || [], form.debts).map((card) => {
        const cardId = String(card.cardId || "");
        const hasLiveBalance = liveDebtBalanceByCardId.has(cardId);
        const institution = card.institution ? `${card.institution}` : "";
        const detail = hasLiveBalance
          ? institution
            ? `${institution} · linked balance available`
            : "Linked balance available"
          : institution
            ? `${institution} · manual balance`
            : "Manual balance";

        return {
          cardId,
          name: card.name,
          detail,
        };
      });
  }, [cards, deletedDebtCardIds, form.debts, liveDebtBalanceByCardId]);
  const effectiveDebtTotal = useMemo(
    () => getEffectiveDebtTotal(form.debts, liveDebtBalanceByCardId, overridePlaid.debts),
    [form.debts, liveDebtBalanceByCardId, overridePlaid.debts]
  );


  const cardOptions = useMemo<SelectGroup[]>(() => buildCardSelectGroups(cards || [], getShortCardLabel), [cards]);
  const lastAuditSeedKey = useMemo(() => {
    if (!hasReusableAuditSeed(lastAudit)) return null;
    return `${String(lastAudit?.ts || lastAudit?.date || "seed")}:${lastAudit?.isTest ? "test" : "live"}`;
  }, [lastAudit]);

  useEffect(() => {
    if (!lastAuditSeedKey || hydratedAuditSeedKeyRef.current === lastAuditSeedKey) return;
    hydratedAuditSeedKeyRef.current = lastAuditSeedKey;
    setForm((p) =>
      mergeLastAuditIntoForm({
        previousForm: p,
        lastAudit,
        cards,
        bankAccounts,
        today: new Date(),
      })
    );
    const lastCashAccounts = lastAudit?.form?.cashAccounts;
    if (Array.isArray(lastCashAccounts)) {
      const restoredOverrides: Record<string, MoneyInput | undefined> = {};
      let hasCheckingOverride = false;
      let hasSavingsOverride = false;
      for (const acct of lastCashAccounts) {
        if (acct?.overridden && acct?.id) {
          restoredOverrides[acct.id] = String(acct.amount ?? "") as MoneyInput;
          const type = String(acct.accountType || "").toLowerCase();
          if (type === "checking") hasCheckingOverride = true;
          if (type === "savings") hasSavingsOverride = true;
        }
      }
      if (Object.keys(restoredOverrides).length > 0) {
        setOverridePlaid(p => ({
          ...p,
          checking: p.checking || hasCheckingOverride,
          vault: p.vault || hasSavingsOverride,
          cashAccounts: { ...p.cashAccounts, ...restoredOverrides },
        }));
      }
    }
  }, [bankAccounts, cards, lastAudit, lastAuditSeedKey]);
  function s<K extends keyof InputFormState>(key: K, value: InputFormState[K]): void {
    setForm((p) => ({ ...p, [key]: value }));
  }
  const removeDebtRow = (index: number) => {
    haptic.light();
    const removedDebt = form.debts[index];
    if (removedDebt?.cardId) {
      setDeletedDebtCardIds(p => ({ ...p, [removedDebt.cardId]: true }));
    }
    s(
      "debts",
      form.debts.filter((_, currentIndex) => currentIndex !== index)
    );
  };
  function sD<K extends keyof InputDebt>(i: number, key: K, value: InputDebt[K]): void {
    setForm((p) => ({
      ...p,
      debts: p.debts.map((d, j) => (j === i ? { ...d, [key]: value } : d)),
    }));
  }
  const selectDebtCard = (index: number, value: string) => {
    const card = (cards || []).find((entry) => entry.id === value || entry.name === value);
    const newCardId = card?.id || "";
    const newName = card ? resolveCardLabel(cards || [], card.id, card.name) : "";
    const nextBalance = newCardId && liveDebtBalanceByCardId.has(newCardId)
      ? Number(liveDebtBalanceByCardId.get(newCardId) || 0)
      : form.debts[index]?.balance || "";
    const previousCardId = form.debts[index]?.cardId || "";
    const previousCardStillVisible = form.debts.some(
      (debt, currentIndex) => currentIndex !== index && debt.cardId === previousCardId
    );

    setForm((prev) => ({
      ...prev,
      debts: prev.debts.map((debt, currentIndex) =>
        currentIndex === index ? { ...debt, cardId: newCardId, name: newName, balance: nextBalance } : debt
      ),
    }));

    if (newCardId) {
      setOverridePlaid((prev) => ({ ...prev, debts: { ...prev.debts, [newCardId]: false } }));
      setDeletedDebtCardIds((prev) => {
        if (!prev[newCardId] && (!previousCardId || previousCardStillVisible || !prev[previousCardId])) return prev;
        const next = { ...prev };
        delete next[newCardId];
        if (previousCardId && previousCardId !== newCardId && !previousCardStillVisible) {
          delete next[previousCardId];
        }
        return next;
      });
    }
  };
  const enableDebtOverride = (cardId: string) => {
    setOverridePlaid((prev) => ({ ...prev, debts: { ...prev.debts, [cardId]: true } }));
  };
  const resetDebtOverride = (index: number, cardId: string, liveBalance: number) => {
    setOverridePlaid((prev) => ({ ...prev, debts: { ...prev.debts, [cardId]: false } }));
    sD(index, "balance", liveBalance);
  };
  const setPendingCharge = (index: number, updates: Partial<PendingCharge>) => {
    setForm((prev) => ({
      ...prev,
      pendingCharges: (prev.pendingCharges || []).map((charge, currentIndex) =>
        currentIndex === index ? { ...charge, ...updates } : charge
      ),
    }));
  };
  const addPendingCharge = () => {
    haptic.medium();
    setForm((prev) => ({
      ...prev,
      pendingCharges: [
        ...(prev.pendingCharges || []),
        { amount: "", cardId: "", description: "", confirmed: false },
      ],
    }));
  };
  const selectPendingChargeCard = (index: number, cardId: string) => {
    const card = (cards || []).find((entry) => entry.id === cardId);
    setPendingCharge(index, { cardId: card?.id || "" });
  };
  const changePendingChargeAmount = (index: number, amount: MoneyInput) => {
    setPendingCharge(index, { amount, confirmed: false });
  };
  const changePendingChargeDescription = (index: number, description: string) => {
    setPendingCharge(index, { description });
  };
  const removePendingCharge = (index: number) => {
    haptic.light();
    setForm((prev) => ({
      ...prev,
      pendingCharges: (prev.pendingCharges || []).filter((_, currentIndex) => currentIndex !== index),
    }));
  };
  const togglePendingChargeConfirmed = (index: number) => {
    haptic.medium();
    setForm((prev) => ({
      ...prev,
      pendingCharges: (prev.pendingCharges || []).map((charge, currentIndex) =>
        currentIndex === index ? { ...charge, confirmed: !charge.confirmed } : charge
      ),
    }));
  };
  const filledFields = [
    activeConfig.trackChecking !== false && effectiveCheckingTotal,
    activeConfig.trackSavings !== false && effectiveSavingsTotal,
    visibleInvestmentFields.some((field) => field.key === "roth") && (form.roth || investmentAutoValues.roth),
    visibleInvestmentFields.some((field) => field.key === "brokerage") && (form.brokerage || investmentAutoValues.brokerage),
    visibleInvestmentFields.some((field) => field.key === "k401") && (form.k401Balance || activeConfig.k401Balance || investmentAutoValues.k401),
    form.debts.some(d => (d.name || d.cardId) && d.balance),
  ].filter(Boolean).length;
  const quotaExhausted = auditQuota && isGatingEnforced() && !auditQuota.allowed;
  const canSubmit = filledFields >= 1 && !isLoading && !quotaExhausted;
  const pendingChargeCount = (form.pendingCharges || []).filter(charge => toNumber(charge.amount) > 0).length;
  const activeBudgetCategoryCount = Object.values(budgetActuals || {}).filter(value => toNumber(value) > 0).length;
  const readySummary = `${filledFields} section${filledFields === 1 ? "" : "s"} ready`;
  const statusSummary =
    validationErrors.length > 0
      ? `${validationErrors.length} issue${validationErrors.length === 1 ? "" : "s"} to fix`
      : validationWarnings.length > 0
        ? `${validationWarnings.length} warning${validationWarnings.length === 1 ? "" : "s"}`
        : pendingChargeCount > 0
          ? `${pendingChargeCount} pending item${pendingChargeCount === 1 ? "" : "s"} logged`
          : "Clear to run";
  const statusTone =
    validationErrors.length > 0
      ? T.status.red
      : validationWarnings.length > 0
        ? T.status.amber
        : pendingChargeCount > 0
          ? T.text.primary
          : T.accent.emerald;
  const advancedSummary = [
    pendingChargeCount > 0 ? `${pendingChargeCount} pending` : "No pending items",
    activeBudgetCategoryCount > 0 ? `${activeBudgetCategoryCount} category overrides` : "No spending overrides",
  ].join(" • ");
  const configSummary = [
    activeConfig.incomeType ? `${activeConfig.incomeType[0]?.toUpperCase() || ""}${activeConfig.incomeType.slice(1)} income` : "Income defaults",
    form.notes?.trim() ? "Audit notes" : "No audit notes",
    personalRules?.trim() ? "Custom AI rules" : "Default AI rules",
    advancedSummary,
  ].join(" • ");
  const configuredPaycheckDisplay =
    activeConfig.incomeType === "hourly"
      ? `${Number(activeConfig.typicalHours || 0)} hrs from Income & Cash Flow`
      : activeConfig.incomeType === "variable"
        ? `${fmt(Number(activeConfig.averagePaycheck || 0))} from Income & Cash Flow`
        : `${fmt(Number(activeConfig.paycheckStandard || 0))} from Income & Cash Flow`;

  const buildMsg = (formOverride: InputFormState = form) =>
    buildInputSnapshotMessage({
      form: formOverride,
      activeConfig,
      cards,
      bankAccounts,
      renewals,
      cardAnnualFees,
      parsedTransactions: includeRecentSpending ? plaidTransactions : [],
      budgetActuals,
      holdingValues,
      financialConfig,
      aiProvider,
    });

  const removeCashAccount = (id: string, accountType: "checking" | "savings") => {
    haptic.light();
    setDeletedCashAccountIds((prev) => ({ ...prev, [id]: true }));
    setOverridePlaid((prev) => {
      const nextCashAccounts = { ...prev.cashAccounts };
      delete nextCashAccounts[id];
      const matchingAccounts = (accountType === "checking" ? checkingAccountMeta.accounts : savingsAccountMeta.accounts).filter(
        (account) => account.id !== id
      );
      const anyRemainingOverrides = matchingAccounts.some((account) => nextCashAccounts[account.id] !== undefined);
      return {
        ...prev,
        checking: accountType === "checking" ? anyRemainingOverrides : prev.checking,
        vault: accountType === "savings" ? anyRemainingOverrides : prev.vault,
        cashAccounts: nextCashAccounts,
      };
    });
  };

  const restoreCashAccount = (id: string) => {
    haptic.light();
    setDeletedCashAccountIds((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const addDebtCard = (cardId: string) => {
    if (!cardId || form.debts.some((debt) => debt.cardId === cardId)) return;
    haptic.light();
    const card = (cards || []).find(c => c.id === cardId);
    if (!card) return;
    const liveBalance = liveDebtBalanceByCardId.get(cardId);
    const name = resolveCardLabel(cards || [], card.id, card.name);
    setDeletedDebtCardIds(prev => {
      if (!prev[cardId]) return prev;
      const next = { ...prev };
      delete next[cardId];
      return next;
    });
    setOverridePlaid((prev) => ({ ...prev, debts: { ...prev.debts, [cardId]: false } }));
    setForm(p => ({
      ...p,
      debts: [...p.debts, { cardId, name, balance: liveBalance !== undefined ? liveBalance : "" as MoneyInput }],
    }));
  };
  const changeInvestmentField = (key: InvestmentFieldKey, value: MoneyInput) => {
    if (key === "roth") s("roth", value);
    else if (key === "brokerage") s("brokerage", value);
    else s("k401Balance", value);
  };
  const enableInvestmentOverride = (key: InvestmentFieldKey) => {
    setOverrideInvest((prev) => ({ ...prev, [key]: true }));
  };
  const removeInvestmentField = (key: InvestmentFieldKey) => {
    haptic.light();
    setDeletedInvestmentKeys((prev) => ({ ...prev, [key]: true }));
    setOverrideInvest((prev) => ({ ...prev, [key]: false }));
  };
  const restoreInvestmentField = (field: InvestmentAuditField) => {
    haptic.light();
    setDeletedInvestmentKeys((prev) => ({ ...prev, [field.key]: false }));
    if (Math.abs(Number(field.autoValue || 0)) <= 0.004) {
      setOverrideInvest((prev) => ({ ...prev, [field.key]: true }));
    }
  };

  return (
    <div
      className="safe-scroll-body safe-bottom page-body"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: "100%",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)",
        ["--page-bottom-clearance" as string]: "calc(env(safe-area-inset-bottom, 0px) + 168px)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 768, display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          padding: "18px 18px 16px",
          borderRadius: 24,
          background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.elevated})`,
          border: `1px solid ${T.border.subtle}`,
          boxShadow: T.shadow.card,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            paddingBottom: 2,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, minWidth: 0 }}>
            <button
              onClick={() => {
                haptic.light();
                onBack();
              }}
              aria-label="Back"
              style={{
                width: 44,
                height: 44,
                borderRadius: 16,
                border: `1px solid ${T.border.subtle}`,
                background: T.bg.elevated,
                color: T.text.primary,
                flexShrink: 0,
              }}
            >
              <ArrowLeft size={18} strokeWidth={2.4} />
            </button>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: T.text.dim,
                  fontFamily: T.font.mono,
                  letterSpacing: "0.08em",
                  marginBottom: 4,
                }}
              >
                WEEKLY AUDIT
              </div>
              <h1
                style={{
                  margin: 0,
                  fontSize: 28,
                  lineHeight: 1.05,
                  letterSpacing: "-0.03em",
                  color: T.text.primary,
                  fontWeight: 900,
                }}
              >
                Prepare Weekly Audit
              </h1>
              <p
                style={{
                  margin: "8px 0 0 0",
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: T.text.secondary,
                  maxWidth: 500,
                }}
              >
                Refresh the accounts that matter this week and give the audit the context it needs to produce a credible plan.
              </p>
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
            paddingTop: 2,
            fontSize: 12,
            lineHeight: 1.5,
            color: T.text.secondary,
          }}
        >
          <span>{readySummary}</span>
          <span style={{ color: T.text.dim }}>•</span>
          <span style={{ color: statusTone }}>{statusSummary}</span>
        </div>
      </div>
      <InputFormErrorBanner error={error} />
      {!hasPortfolioAuditInputs && (
        <Card style={{ marginBottom: 16, background: T.bg.card, border: `1px solid ${T.border.subtle}` }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                display: "grid",
                placeItems: "center",
                background: T.bg.elevated,
                color: T.text.secondary,
                flexShrink: 0,
              }}
            >
              <Zap size={16} />
            </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: T.text.dim, fontFamily: T.font.mono, letterSpacing: "0.05em", marginBottom: 5 }}>
                  FOUNDATIONAL SETUP
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: T.text.primary, marginBottom: 6 }}>
                  Add accounts in Portfolio first
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.58, color: T.text.secondary }}>
                  The weekly audit should be built from the accounts you actually track. Add your cards and bank accounts in Portfolio, then return here to review live balances and generate a real briefing.
                </div>
              </div>
            </div>
        </Card>
      )}
      <div style={{ marginBottom: 20 }}>
        <AuditDateCard value={form.date} onChange={(event) => s("date", event.target.value)} />
        {(showCheckingAccount || showSavingsAccount) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {showCheckingAccount && (
              <CashAccountSection
                meta={visibleCheckingAccountMeta}
                toneColor={T.accent.emerald}
                title={
                  visibleCheckingAccountMeta.count > 1
                    ? "Checking & Cash"
                    : visibleCheckingAccountMeta.count === 1
                      ? visibleCheckingAccountMeta.label
                      : "Checking & Cash"
                }
                accountOverrides={overridePlaid.cashAccounts}
                onOverrideAccount={(id, value) =>
                  setOverridePlaid((p) => ({
                    ...p,
                    checking: true,
                    cashAccounts: { ...p.cashAccounts, [id]: value },
                  }))
                }
                onResetAccount={(id) =>
                  setOverridePlaid((p) => {
                    const next = { ...p.cashAccounts };
                    delete next[id];
                    const anyCheckingStillOverridden = checkingAccountMeta.accounts.some(
                      (a) => a.id !== id && next[a.id] !== undefined
                    );
                    return { ...p, checking: anyCheckingStillOverridden, cashAccounts: next };
                  })
                }
                aggregateOverrideActive={overridePlaid.checking || checkingAccountMeta.count === 0}
                onEnableAggregateOverride={() => setOverridePlaid((p) => ({ ...p, checking: true }))}
                aggregateOverrideValue={form.checking}
                onAggregateChange={(e) => s("checking", sanitizeDollar(e.target.value))}
                onResetAggregate={() => {
                  setOverridePlaid((p) => ({ ...p, checking: false }));
                  s("checking", checkingAccountMeta.total ?? "");
                }}
                inputLabel="Checking balance"
                hiddenAccounts={hiddenCheckingAccounts}
                onRemoveAccount={(id) => removeCashAccount(id, "checking")}
                onRestoreAccount={restoreCashAccount}
              />
            )}
            {showSavingsAccount && (
              <CashAccountSection
                meta={visibleSavingsAccountMeta}
                toneColor="#3B82F6"
                title={
                  visibleSavingsAccountMeta.count > 1
                    ? "Savings & Vault"
                    : visibleSavingsAccountMeta.count === 1
                      ? visibleSavingsAccountMeta.label
                      : "Savings & Vault"
                }
                accountOverrides={overridePlaid.cashAccounts}
                onOverrideAccount={(id, value) =>
                  setOverridePlaid((p) => ({
                    ...p,
                    vault: true,
                    cashAccounts: { ...p.cashAccounts, [id]: value },
                  }))
                }
                onResetAccount={(id) =>
                  setOverridePlaid((p) => {
                    const next = { ...p.cashAccounts };
                    delete next[id];
                    const anySavingsStillOverridden = savingsAccountMeta.accounts.some(
                      (a) => a.id !== id && next[a.id] !== undefined
                    );
                    return { ...p, vault: anySavingsStillOverridden, cashAccounts: next };
                  })
                }
                aggregateOverrideActive={overridePlaid.vault || savingsAccountMeta.count === 0}
                onEnableAggregateOverride={() => setOverridePlaid((p) => ({ ...p, vault: true }))}
                aggregateOverrideValue={form.savings}
                onAggregateChange={(e) => s("savings", sanitizeDollar(e.target.value))}
                onResetAggregate={() => {
                  setOverridePlaid((p) => ({ ...p, vault: false }));
                  s("savings", savingsAccountMeta.total ?? "");
                }}
                inputLabel="Savings balance"
                hiddenAccounts={hiddenSavingsAccounts}
                onRemoveAccount={(id) => removeCashAccount(id, "savings")}
                onRestoreAccount={restoreCashAccount}
              />
            )}
          </div>
        )}

        {showInvestmentSection && (
          <InvestmentBalancesSection
            visibleFields={visibleInvestmentFields}
            hiddenFields={hiddenInvestmentFields}
            totalBalance={visibleInvestmentTotal}
            formValues={{
              roth: form.roth,
              brokerage: form.brokerage,
              k401Balance: form.k401Balance,
            }}
            onChangeField={changeInvestmentField}
            onEnableOverride={enableInvestmentOverride}
            onRemoveField={removeInvestmentField}
            onRestoreField={restoreInvestmentField}
          />
        )}

        <DebtBalancesSection
          debts={form.debts}
          hasAvailableCards={(cards || []).length > 0}
          addableDebtCards={addableDebtCards}
          cardOptions={cardOptions}
          liveDebtBalanceByCardId={liveDebtBalanceByCardId}
          debtOverrides={overridePlaid.debts}
          totalBalance={effectiveDebtTotal}
          onAddDebtCard={addDebtCard}
          onRemoveDebtRow={removeDebtRow}
          onSelectDebtCard={selectDebtCard}
          onEnableDebtOverride={enableDebtOverride}
          onResetDebtOverride={resetDebtOverride}
          onChangeDebtBalance={(index, value) => sD(index, "balance", value)}
        />
      </div>
      <PendingChargesSection
        pendingCharges={form.pendingCharges || []}
        cardOptions={cardOptions}
        onAddCharge={addPendingCharge}
        onSelectCard={selectPendingChargeCard}
        onChangeAmount={changePendingChargeAmount}
        onRemoveCharge={removePendingCharge}
        onChangeDescription={changePendingChargeDescription}
        onToggleConfirmed={togglePendingChargeConfirmed}
      />

      <Card style={{ marginTop: 4, marginBottom: 0, background: T.bg.card, border: `1px solid ${T.border.subtle}` }}>
        <Label>Week-specific notes</Label>
        <p style={{ fontSize: 11, color: T.text.muted, marginBottom: 10, lineHeight: 1.4 }}>
          Use this for week-specific facts the audit must respect, like bills already paid or reimbursements on the way.
        </p>
        <textarea
          aria-label="Notes for this week"
          value={form.notes || ""}
          onChange={(event) => s("notes", event.target.value)}
          placeholder="e.g. Rent already paid, $200 reimbursement coming, skip gas this paycheck."
          style={{
            width: "100%",
            minHeight: 96,
            padding: "12px",
            borderRadius: T.radius.md,
            border: `1.5px solid ${T.border.default}`,
            background: T.bg.elevated,
            color: T.text.primary,
            fontSize: 13,
            fontFamily: T.font.sans,
            resize: "vertical",
            boxSizing: "border-box",
            outline: "none",
            lineHeight: 1.5,
          }}
          className="app-input"
        />
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
        <ConfigSection
          showConfig={showConfig}
          setShowConfig={setShowConfig}
          configSummary={configSummary}
          typedFinancialConfig={typedFinancialConfig}
          setTypedFinancialConfig={setTypedFinancialConfig}
          notes={form.notes}
          setNotes={(value) => s("notes", value)}
          personalRules={personalRules}
          setPersonalRules={setPersonalRules}
          showAuditNotes={false}
        >
          {activeConfig.trackPaycheck !== false && (
              <Card style={{ marginBottom: 10, background: T.bg.card, border: `1px solid ${T.border.subtle}` }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: T.bg.card,
                      borderRadius: T.radius.md,
                      padding: "10px 12px",
                      border: `1px solid ${T.border.subtle}`,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.text.secondary, fontFamily: T.font.mono }}>
                        PLAN-AHEAD PAYCHECK
                      </div>
                      <div style={{ fontSize: 11, color: T.text.muted, marginTop: 2 }}>
                        Include upcoming paycheck not yet deposited
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        haptic.light();
                        s("autoPaycheckAdd", !form.autoPaycheckAdd);
                      }}
                      style={{
                        width: 44,
                        height: 24,
                        borderRadius: 999,
                        border: `1px solid ${form.autoPaycheckAdd ? T.accent.primary : T.border.default}`,
                        background: form.autoPaycheckAdd ? T.accent.primaryDim : T.bg.elevated,
                        position: "relative",
                        cursor: "pointer",
                      }}
                    >
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 999,
                          background: form.autoPaycheckAdd ? T.accent.primary : T.bg.card,
                          position: "absolute",
                          top: 2,
                          left: form.autoPaycheckAdd ? 22 : 2,
                          transition: "all .2s box-shadow .2s",
                          boxShadow: form.autoPaycheckAdd ? `0 0 6px ${T.accent.primary}60` : "0 1px 2px rgba(0,0,0,0.2)",
                        }}
                      />
                    </button>
                  </div>
                  <div
                    style={{
                      background: T.bg.card,
                      borderRadius: T.radius.md,
                      padding: "10px 12px",
                      border: `1px solid ${T.border.subtle}`,
                      display: "grid",
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: T.text.secondary,
                        fontFamily: T.font.mono,
                      }}
                    >
                      PAYCHECK SOURCE
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.text.primary }}>
                      {configuredPaycheckDisplay}
                    </div>
                    <div style={{ fontSize: 11, lineHeight: 1.45, color: T.text.muted }}>
                      The plan-ahead toggle uses the income amount you set above in Audit Profile, Notes &amp; AI.
                    </div>
                  </div>
                </div>
              </Card>
          )}
          {financialConfig?.enableHoldings &&
              financialConfig?.trackCrypto !== false &&
              (financialConfig?.holdings?.crypto || []).length > 0 &&
              holdingValues.crypto > 0 && (
                <Card style={{ marginBottom: 10, border: `1px solid ${T.status.amber}25` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Label style={{ marginBottom: 0 }}>Crypto Portfolio</Label>
                    <span style={{ fontSize: 14, fontWeight: 800, fontFamily: T.font.mono, color: T.status.amber }}>
                      {fmt(holdingValues.crypto)}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: T.text.muted, marginTop: 4, fontFamily: T.font.mono }}>
                    {((typedFinancialConfig.holdings?.crypto || []) as Array<{ symbol?: string }>)
                      .map((h) => (h.symbol || "").replace("-USD", ""))
                      .join(" · ")}{" "}
                    · Live
                  </div>
                </Card>
          )}
          {financialConfig?.trackHabits !== false && (
              <Card style={{ padding: "12px 12px", marginBottom: activeConfig.budgetCategories?.length > 0 ? 10 : 0 }}>
                <Label>{financialConfig?.habitName || "Habit"} Restock Count</Label>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  {[-1, 1].map((dir) => (
                    <button
                      key={dir}
                      onClick={() => {
                        haptic.light();
                        s("habitCount", Math.max(0, Math.min(30, (form.habitCount || 0) + dir)));
                      }}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: T.radius.md,
                        border: `1.5px solid ${T.border.default}`,
                        background: T.bg.elevated,
                        color: T.text.primary,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        order: dir === -1 ? 0 : 2,
                      }}
                    >
                      {dir === -1 ? <Minus size={16} /> : <Plus size={16} />}
                    </button>
                  ))}
                  <div style={{ flex: 1, textAlign: "center", order: 1 }}>
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: 26,
                        fontWeight: 800,
                        fontFamily: T.font.mono,
                        color:
                          (form.habitCount || 0) <= (financialConfig?.habitCriticalThreshold || 3)
                            ? T.status.red
                            : (form.habitCount || 0) <= (financialConfig?.habitCheckThreshold || 6)
                              ? T.status.amber
                              : T.text.primary,
                      }}
                    >
                      {form.habitCount || 0}
                    </span>
                    {(form.habitCount || 0) <= (financialConfig?.habitCheckThreshold || 6) && (
                      <div
                        style={{
                          fontSize: 11,
                          color:
                            (form.habitCount || 0) <= (financialConfig?.habitCriticalThreshold || 3)
                              ? T.status.red
                              : T.status.amber,
                          marginTop: 3,
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 3,
                        }}
                      >
                        <AlertTriangle size={10} />
                        {(form.habitCount || 0) <= (financialConfig?.habitCriticalThreshold || 3) ? "CRITICAL" : "BELOW THRESHOLD"}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
          )}
          {activeConfig.budgetCategories?.length > 0 && (
              <Card style={{ background: T.bg.card, border: `1px solid ${T.border.subtle}` }}>
                <Label>Budget Actuals</Label>
                <p style={{ fontSize: 10, color: T.text.muted, marginBottom: 10, lineHeight: 1.4 }}>
                  Enter actual spending per category this paycheck. The AI will compare vs. your targets.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {activeConfig.budgetCategories
                    .filter((c) => c.name)
                    .map((cat, i) => (
                      <div key={i}>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: T.text.dim,
                            fontFamily: T.font.mono,
                            marginBottom: 4,
                          }}
                        >
                          {cat.name.toUpperCase()}
                        </div>
                        <div style={{ position: "relative" }}>
                          <span
                            style={{
                              position: "absolute",
                              left: 8,
                              top: "50%",
                              transform: "translateY(-50%)",
                              color: T.text.dim,
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            $
                          </span>
                          <input
                            type="number"
                            inputMode="decimal"
                            pattern="[0-9]*"
                            step="0.01"
                            aria-label={`${cat.name} weekly spending`}
                            value={budgetActuals[cat.name] || ""}
                            onChange={e => setBudgetActuals((p) => ({ ...p, [cat.name]: e.target.value }))}
                            placeholder="0.00"
                            style={{
                              width: "100%",
                              boxSizing: "border-box",
                              padding: "9px 8px 9px 20px",
                              borderRadius: T.radius.md,
                              border: `1px solid ${T.border.default}`,
                              background: T.bg.elevated,
                              color: T.text.primary,
                              fontSize: 12,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              </Card>
          )}
        </ConfigSection>

        <PlaidTransactionsCard
          plaidTransactions={plaidTransactions}
          txnFetchedAt={txnFetchedAt}
          showTxns={showTxns}
          setShowTxns={setShowTxns}
          includeRecentSpending={includeRecentSpending}
          setIncludeRecentSpending={setIncludeRecentSpending}
          proEnabled={!!proEnabled}
        />
      </div>

      <ValidationFeedback validationErrors={validationErrors} validationWarnings={validationWarnings} />

      {(plaidData.checking !== null || (lastAudit?.form?.checking && form.checking === lastAudit.form.checking)) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 10,
            padding: "9px 12px",
            borderRadius: T.radius.lg,
            background: `${T.accent.primary}0D`,
            border: `1px solid ${T.accent.primary}24`,
          }}
        >
          <UiGlyph glyph={plaidData.checking !== null ? "🏦" : "💡"} size={12} color={T.accent.primary} />
          <span style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.45 }}>
            {plaidData.checking !== null
              ? "Balances pulled live from your linked bank accounts."
              : "Balances pre-filled from your last audit — update what's changed."}
          </span>
        </div>
      )}

      <ModelChatQuotaWidget
        chatQuota={chatQuota}
        setAiModel={setAiModel ?? (() => {})}
        proEnabled={!!proEnabled}
      />
      <AuditQuotaNotice auditQuota={auditQuota} />
      <SubmitBar
        canSubmit={canSubmit}
        isLoading={isLoading}
        isTestMode={isTestMode}
        setIsTestMode={setIsTestMode}
        onSubmit={() => {
          if (!canSubmit) return;
          const formWithAutoTime = buildAuditSubmitFormState({
            form,
            visibleInvestmentFields,
            effectiveCheckingTotal,
            effectiveSavingsTotal,
            checkingAccountMeta,
            savingsAccountMeta,
            visibleCheckingAccountMeta,
            visibleSavingsAccountMeta,
            cashAccountOverrides: overridePlaid.cashAccounts,
            checkingOverrideActive: overridePlaid.checking,
            savingsOverrideActive: overridePlaid.vault,
            hiddenCheckingCount: hiddenCheckingAccounts.length,
            hiddenSavingsCount: hiddenSavingsAccounts.length,
          });
          onSubmit(buildMsg(formWithAutoTime), { ...formWithAutoTime, budgetActuals }, isTestMode);
        }}
      />
      </div>
    </div>
  );
}
