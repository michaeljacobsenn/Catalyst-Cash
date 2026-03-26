  import {
    useEffect,
    useMemo,
    useState,
    type ChangeEvent,
    type CSSProperties,
    type ReactNode,
  } from "react";
  import { getShortCardLabel,resolveCardLabel } from "../cards.js";
  import { CustomSelect as UICustomSelect,DI as UIDI,Mono as UIMono } from "../components.js";
  import { T } from "../constants.js";
  import {
    ArrowLeft,
    AlertTriangle,
    CheckCircle,
    Minus,
    Plus,
    Trash2,
    Zap,
  } from "../icons";
  import { Badge,Card as UICard,Label as UILabel } from "../ui.js";
  import { fmt } from "../utils.js";
  import { validateSnapshot } from "../validation.js";

  import type {
    AuditFormData,
    AuditFormDebt,
    AuditRecord,
    BankAccount,
    Card as PortfolioCard,
    CatalystCashConfig,
    Renewal,
  } from "../../types/index.js";
  import { useAudit } from "../contexts/AuditContext.js";
  import type { PersonaMode,SetFinancialConfig } from "../contexts/SettingsContext.js";
  import { haptic } from "../haptics.js";
  import { getPlaidAutoFill } from "../plaid.js";
  import { isGatingEnforced } from "../subscription.js";
  import { checkChatQuota } from "../subscription.js";
  import {
    AuditQuotaNotice,
    InputFormErrorBanner,
    ModelChatQuotaWidget,
    PlaidTransactionsCard,
    SubmitBar,
    ValidationFeedback,
  } from "./inputForm/FeedbackSections.js";
  import { ConfigSection } from "./inputForm/ConfigSection";
  import {
    buildCardSelectGroups,
    buildInputSnapshotMessage,
    createInitialInputFormState,
    getTypedFinancialConfig,
    hasReusableAuditSeed,
    loadAuditQuota,
    loadHoldingValues,
    loadRecentPlaidTransactions,
    mergeLastAuditIntoForm,
    mergePlaidAutoFillIntoForm,
  } from "./inputForm/state";
  import { sanitizeDollar, toNumber, type MoneyInput } from "./inputForm/utils.js";

interface InputDebt extends AuditFormDebt {
  cardId: string;
  name: string;
  balance: MoneyInput;
}

interface PendingCharge {
  amount: MoneyInput | "";
  cardId: string;
  description: string;
  confirmed: boolean;
}

interface InputFormState extends AuditFormData {
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

interface HoldingValues {
  roth: number;
  k401: number;
  brokerage: number;
  crypto: number;
  hsa: number;
}

interface OverrideInvestState {
  roth: boolean;
  brokerage: boolean;
  k401: boolean;
}

interface OverridePlaidState {
  checking: boolean;
  vault: boolean;
  debts: Record<string, boolean | undefined>;
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
  monthlySalary?: number;
  hourlyRate?: number;
  assumedHours?: number;
  typicalPaycheck?: number;
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

interface MonoProps {
  children?: ReactNode;
  color?: string;
  size?: number;
  weight?: number;
  style?: CSSProperties;
}

interface DollarInputProps {
  value: MoneyInput | "";
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  label?: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectGroup[];
  placeholder?: string;
  ariaLabel?: string;
  icon?: ReactNode;
}


const Card = UICard as unknown as (props: CardComponentProps) => ReactNode;
const Label = UILabel as unknown as (props: LabelProps) => ReactNode;
const Mono = UIMono as unknown as (props: MonoProps) => ReactNode;
const DI = UIDI as unknown as (props: DollarInputProps) => ReactNode;
const CustomSelect = UICustomSelect as unknown as (props: CustomSelectProps) => ReactNode;

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

  // Auto-fill from Plaid if available
  const plaidData = getPlaidAutoFill(cards || [], bankAccounts || []) as PlaidAutoFillData;

  // Load Plaid transactions from local storage
  const [plaidTransactions, setPlaidTransactions] = useState<PlaidTransaction[]>([]);
  const [txnFetchedAt, setTxnFetchedAt] = useState<string | number | null>(null);
  const [showTxns, setShowTxns] = useState<boolean>(false);
  useEffect(() => {
    void loadRecentPlaidTransactions(setPlaidTransactions, setTxnFetchedAt);
  }, []);

  const [form, setForm] = useState<InputFormState>(
    () =>
      createInitialInputFormState({
        today: initialToday,
        plaidData,
        config: typedFinancialConfig,
      }) as InputFormState
  );
  const [isTestMode, setIsTestMode] = useState<boolean>(false);

  const [budgetActuals, setBudgetActuals] = useState<Record<string, string | number>>({});
  const [holdingValues, setHoldingValues] = useState<HoldingValues>({ roth: 0, k401: 0, brokerage: 0, crypto: 0, hsa: 0 });
  const [overrideInvest, setOverrideInvest] = useState<OverrideInvestState>({ roth: false, brokerage: false, k401: false });
  const [overridePlaid, setOverridePlaid] = useState<OverridePlaidState>({ checking: false, vault: false, debts: {} });

  const [auditQuota, setAuditQuota] = useState<AuditQuota | null>(null);
  useEffect(() => {
    void loadAuditQuota(setAuditQuota);
  }, []);

  // Fetch per-model AskAI chat quota for Pro users
  const effectiveAuditModel = useMemo(
    () => (aiModel === "gpt-4.1" || aiModel === "o3") ? "gpt-4.1" : (aiModel || "gpt-4.1"),
    [aiModel]
  );
  type ChatQuotaState = { allowed: boolean; remaining: number; limit: number; used: number; modelId?: string; alternateModel?: string; alternateRemaining?: number; softBlocked?: boolean };
  const [chatQuota, setChatQuota] = useState<ChatQuotaState | null>(null);
  useEffect(() => {
    if (proEnabled) {
      checkChatQuota(effectiveAuditModel).then(setChatQuota);
    }
  }, [effectiveAuditModel, proEnabled]);

  // Re-sync Plaid balances when cards or bankAccounts update (e.g. after Plaid sync finishes)
  useEffect(() => {
    const freshPlaid = getPlaidAutoFill(cards || [], bankAccounts || []) as PlaidAutoFillData;
    setForm(p => mergePlaidAutoFillIntoForm(p, freshPlaid, overridePlaid) as InputFormState);
  }, [cards, bankAccounts, overridePlaid]);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [showConfig, setShowConfig] = useState<boolean>(false);

  // Auto-calculate portfolio values from cached market prices
  useEffect(() => {
    void loadHoldingValues(financialConfig, setHoldingValues);
  }, [financialConfig?.enableHoldings, financialConfig?.holdings]);

  // Structured validation via validation.js
  const validation = useMemo(() => validateSnapshot(form, typedFinancialConfig), [form, typedFinancialConfig]);
  const validationErrors = validation.errors.filter(e => e.severity === "error");
  const validationWarnings = validation.errors.filter(e => e.severity === "warning");

  // Identify if the generated system prompt has drifted from the last downloaded version
  const activeConfig: InputFormConfig = typedFinancialConfig;


  // Compute exact strategy using current form inputs

  const cardOptions = useMemo<SelectGroup[]>(() => {
    return buildCardSelectGroups(cards || [], getShortCardLabel) as SelectGroup[];
  }, [cards]);

  useEffect(() => {
    if (hasReusableAuditSeed(lastAudit)) {
      setForm(p =>
        mergeLastAuditIntoForm({
          previousForm: p,
          lastAudit,
          cards,
          bankAccounts,
          today: new Date(),
        }) as InputFormState
      );
    }
  }, [lastAudit, cards, bankAccounts]);
  function s<K extends keyof InputFormState>(key: K, value: InputFormState[K]): void {
    setForm((p) => ({ ...p, [key]: value }));
  }
  const addD = () => {
    haptic.medium();
    s("debts", [...form.debts, { cardId: "", name: "", balance: "" }]);
  };
  const rmD = (i: number) => {
    haptic.light();
    s(
      "debts",
      form.debts.filter((_, j) => j !== i)
    );
  };
  function sD<K extends keyof InputDebt>(i: number, key: K, value: InputDebt[K]): void {
    setForm((p) => ({
      ...p,
      debts: p.debts.map((d, j) => (j === i ? { ...d, [key]: value } : d)),
    }));
  }
  // Count how many balance fields are filled to determine if we have enough data
  const filledFields = [
    activeConfig.trackChecking !== false && form.checking,
    activeConfig.trackSavings !== false && form.savings,
    activeConfig.trackRoth && form.roth,
    activeConfig.trackBrokerage && form.brokerage,
    activeConfig.track401k && (form.k401Balance || activeConfig.k401Balance),
    form.debts.some(d => (d.name || d.cardId) && d.balance),
  ].filter(Boolean).length;
  const quotaExhausted = auditQuota && isGatingEnforced() && !auditQuota.allowed;
  const canSubmit = filledFields >= 1 && !isLoading && !quotaExhausted;
  const pendingChargeCount = (form.pendingCharges || []).filter(charge => toNumber(charge.amount) > 0).length;
  const activeBudgetCategoryCount = Object.values(budgetActuals || {}).filter(value => toNumber(value) > 0).length;
  const advancedSummary = [
    pendingChargeCount > 0 ? `${pendingChargeCount} pending` : "No pending items",
    activeBudgetCategoryCount > 0 ? `${activeBudgetCategoryCount} category overrides` : "No spending overrides",
  ].join(" • ");
  const configSummary = [
    activeConfig.incomeType ? `${activeConfig.incomeType[0]?.toUpperCase() || ""}${activeConfig.incomeType.slice(1)} income` : "Income defaults",
    activeConfig.currencyCode || "USD",
    personalRules?.trim() ? "Custom AI rules" : "Default AI rules",
  ].join(" • ");

  const buildMsg = () =>
    buildInputSnapshotMessage({
      form,
      activeConfig,
      cards,
      renewals,
      cardAnnualFees,
      parsedTransactions: plaidTransactions,
      budgetActuals,
      holdingValues,
      financialConfig,
      aiProvider,
    });

  return (
    <div
      className="safe-scroll-body safe-bottom page-body stagger-container"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: "100%",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)",
        ["--page-bottom-clearance" as string]: "calc(env(safe-area-inset-bottom, 0px) + 120px)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 768, display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          paddingBottom: 4,
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
              width: 46,
              height: 46,
              borderRadius: 16,
              border: `1px solid ${T.border.default}`,
              background: T.bg.glass,
              color: T.text.primary,
              boxShadow: T.shadow.soft,
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
                color: T.accent.primary,
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
              Run Catalyst Audit
            </h1>
            <p
              style={{
                margin: "6px 0 0 0",
                fontSize: 13,
                lineHeight: 1.45,
                color: T.text.secondary,
                maxWidth: 460,
              }}
            >
              Update this week&apos;s balances, pending charges, and context before the AI reviews your cash position.
            </p>
          </div>
        </div>
      </div>
      <InputFormErrorBanner error={error} />
      {/* ── SNAPSHOT ITEMS ── */}
      <div style={{ marginBottom: 20 }}>
        <Card
          className="hover-card"
          variant="glass"
          style={{ marginBottom: 8, position: "relative", overflow: "hidden" }}
        >
          <div
            style={{
              position: "absolute",
              right: -20,
              top: -20,
              width: 60,
              height: 60,
              background: T.accent.primary,
              filter: "blur(40px)",
              opacity: 0.06,
              borderRadius: "50%",
              pointerEvents: "none",
            }}
          />
          <Label style={{ fontWeight: 800 }}>Date & Time</Label>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.9fr", gap: 8 }}>
            <input
              type="date"
              aria-label="Audit date"
              value={form.date}
              onChange={e => s("date", e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: T.radius.md,
                background: T.bg.elevated,
                border: `1.5px solid ${T.border.default}`,
                color: T.text.primary,
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
                transition: "all 0.2s",
                fontFamily: T.font.sans,
                fontWeight: 700,
              }}
              onFocus={e => {
                e.target.style.borderColor = T.accent.primary;
                e.target.style.boxShadow = `0 0 0 3px ${T.accent.primary}30`;
              }}
              onBlur={e => {
                e.target.style.borderColor = T.border.default;
                e.target.style.boxShadow = "none";
              }}
            />
            <input
              type="time"
              aria-label="Audit time"
              value={form.time}
              onChange={e => s("time", e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: T.radius.md,
                background: T.bg.elevated,
                border: `1.5px solid ${T.border.default}`,
                color: T.text.primary,
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
                transition: "all 0.2s",
                fontFamily: T.font.sans,
                fontWeight: 700,
              }}
              onFocus={e => {
                e.target.style.borderColor = T.accent.primary;
                e.target.style.boxShadow = `0 0 0 3px ${T.accent.primary}30`;
              }}
              onBlur={e => {
                e.target.style.borderColor = T.border.default;
                e.target.style.boxShadow = "none";
              }}
            />
          </div>
        </Card>
        {(activeConfig.trackChecking !== false || activeConfig.trackSavings !== false) && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                activeConfig.trackChecking !== false && activeConfig.trackSavings !== false ? "1fr 1fr" : "1fr",
              gap: 8,
            }}
          >
            {activeConfig.trackChecking !== false &&
              (() => {
                const hasPlaid = plaidData.checking !== null;
                return (
                  <Card
                    className="hover-card"
                    variant="glass"
                    style={{ marginBottom: 8, position: "relative", overflow: "hidden" }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        right: -15,
                        top: -15,
                        width: 50,
                        height: 50,
                        background: T.accent.emerald,
                        filter: "blur(35px)",
                        opacity: 0.07,
                        borderRadius: "50%",
                        pointerEvents: "none",
                      }}
                    />
                    <Label style={{ fontWeight: 800, marginBottom: 4, fontSize: 10 }}>Checking</Label>
                    {hasPlaid && !overridePlaid.checking ? (
                      <button
                        onClick={() => setOverridePlaid(p => ({ ...p, checking: true }))}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          height: 36,
                          background: `${T.accent.emerald}10`,
                          border: `1px solid ${T.accent.emerald}40`,
                          borderRadius: T.radius.md,
                          cursor: "pointer",
                        }}
                      >
                        <Mono size={13} weight={800} color={T.accent.emerald}>
                          {fmt(plaidData.checking)}
                        </Mono>
                      </button>
                    ) : (
                      <div style={{ position: "relative" }}>
                        <DI
                          label="Checking balance"
                          value={form.checking}
                          onChange={e => s("checking", sanitizeDollar(e.target.value))}
                          placeholder={hasPlaid ? `${fmt(plaidData.checking)}` : "0.00"}
                        />
                        {hasPlaid && (
                          <button
                            onClick={() => setOverridePlaid(p => ({ ...p, checking: false }))}
                            style={{
                              position: "absolute",
                              right: -2,
                              top: -8,
                              width: 16,
                              height: 16,
                              borderRadius: 8,
                              border: "none",
                              background: T.accent.primary,
                              color: "#fff",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 9,
                              fontWeight: 900,
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })()}
            {activeConfig.trackSavings !== false &&
              (() => {
                const hasPlaid = plaidData.vault !== null;
                return (
                  <Card
                    className="hover-card"
                    variant="glass"
                    style={{ marginBottom: 8, position: "relative", overflow: "hidden" }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        right: -15,
                        top: -15,
                        width: 50,
                        height: 50,
                        background: "#3B82F6",
                        filter: "blur(35px)",
                        opacity: 0.07,
                        borderRadius: "50%",
                        pointerEvents: "none",
                      }}
                    />
                    <Label style={{ fontWeight: 800, marginBottom: 4, fontSize: 10 }}>Savings</Label>
                    {hasPlaid && !overridePlaid.vault ? (
                      <button
                        onClick={() => setOverridePlaid(p => ({ ...p, vault: true }))}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          height: 36,
                          background: `${T.accent.emerald}10`,
                          border: `1px solid ${T.accent.emerald}40`,
                          borderRadius: T.radius.md,
                          cursor: "pointer",
                        }}
                      >
                        <Mono size={13} weight={800} color={T.accent.emerald}>
                          {fmt(plaidData.vault)}
                        </Mono>
                      </button>
                    ) : (
                      <div style={{ position: "relative" }}>
                        <DI
                          label="Savings balance"
                          value={form.savings}
                          onChange={e => s("savings", sanitizeDollar(e.target.value))}
                          placeholder={hasPlaid ? `${fmt(plaidData.vault)}` : "0.00"}
                        />
                        {hasPlaid && (
                          <button
                            onClick={() => setOverridePlaid(p => ({ ...p, vault: false }))}
                            style={{
                              position: "absolute",
                              right: -2,
                              top: -8,
                              width: 16,
                              height: 16,
                              borderRadius: 8,
                              border: "none",
                              background: T.accent.primary,
                              color: "#fff",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 9,
                              fontWeight: 900,
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })()}
          </div>
        )}

        <Card
          className="hover-card"
          variant="glass"
          style={{ marginBottom: 8, position: "relative", overflow: "hidden" }}
        >
          <div
            style={{
              position: "absolute",
              left: -20,
              bottom: -20,
              width: 70,
              height: 70,
              background: T.accent.primary,
              filter: "blur(45px)",
              opacity: 0.06,
              borderRadius: "50%",
              pointerEvents: "none",
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Label style={{ fontWeight: 800, marginBottom: 0 }}>Credit Card Balances</Label>
            <button
              className="hover-btn"
              onClick={addD}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: T.radius.sm,
                border: `1px solid ${T.accent.primary}40`,
                background: `${T.accent.primary}15`,
                color: T.accent.primary,
                fontSize: 11,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: T.font.mono,
                transition: "all .2s ease",
                boxShadow: `0 2px 10px ${T.accent.primary}20`,
              }}
            >
              <Plus size={13} strokeWidth={3} /> ADD
            </button>
          </div>
          {form.debts.map((d, i) => {
            const plaidDebt = d.cardId ? plaidData.debts?.find(pd => pd.cardId === d.cardId) : null;
            const hasPlaid = plaidDebt && plaidDebt.balance !== null;
            const isOverridden = !!(d.cardId && overridePlaid.debts[d.cardId]);

            return (
              <div 
                key={i} 
                className="slide-up"
                style={{ marginBottom: 6, animationDelay: `${i * 0.06}s` }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      form.debts.length > 1
                        ? "minmax(0, 1fr) minmax(132px, 0.58fr) 44px"
                        : "minmax(0, 1fr) minmax(132px, 0.58fr)",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <CustomSelect
                    ariaLabel={`Debt card ${i + 1}`}
                    value={d.cardId || d.name || ""}
                    onChange={val => {
                      const card = (cards || []).find(c => c.id === val || c.name === val);
                      const newCardId = card?.id || "";
                      const newName = card ? resolveCardLabel(cards || [], card.id, card.name) : "";

                      setForm(p => ({
                        ...p,
                        debts: p.debts.map((debt, j) =>
                          j === i ? { ...debt, cardId: newCardId, name: newName } : debt
                        ),
                      }));
                    }}
                    placeholder="Card..."
                    options={cardOptions}
                  />
                  <div style={{ minWidth: 0 }}>
                    {hasPlaid && !isOverridden ? (
                      <button
                        onClick={() => {
                          setOverridePlaid(p => ({ ...p, debts: { ...p.debts, [d.cardId]: true } }));
                        }}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 4,
                          height: 38,
                          background: `${T.accent.emerald}10`,
                          border: `1px solid ${T.accent.emerald}40`,
                          borderRadius: T.radius.md,
                          padding: "0 12px",
                          cursor: "pointer",
                        }}
                      >
                        <Mono size={12} weight={800} color={T.accent.emerald}>
                          {fmt(plaidDebt.balance)}
                        </Mono>
                      </button>
                    ) : (
                      <div style={{ position: "relative" }}>
                        <DI
                          value={d.balance}
                          onChange={e => sD(i, "balance", sanitizeDollar(e.target.value))}
                          placeholder={hasPlaid ? `${fmt(plaidDebt.balance)}` : "0.00"}
                        />
                        {hasPlaid && isOverridden && (
                          <button
                            onClick={() => {
                              setOverridePlaid(p => ({ ...p, debts: { ...p.debts, [d.cardId]: false } }));
                              sD(i, "balance", plaidDebt.balance);
                            }}
                            style={{
                              position: "absolute",
                              right: -2,
                              top: -8,
                              width: 16,
                              height: 16,
                              borderRadius: 8,
                              border: "none",
                              background: T.accent.primary,
                              color: "#fff",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 9,
                              fontWeight: 900,
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {form.debts.length > 1 && (
                    <button
                      onClick={() => rmD(i)}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: T.radius.sm,
                        border: "none",
                        background: T.status.redDim,
                        color: T.status.red,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      {/* ── Pending Charges ── */}
      {(form.pendingCharges || []).length === 0 ? (
        <button
          onClick={() => {
            haptic.medium();
            s("pendingCharges", [{ amount: "", cardId: "", description: "", confirmed: false }]);
          }}
          className="hover-btn"
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "16px 18px",
            borderRadius: T.radius.lg,
            border: `1px solid ${T.border.default}`,
            background: T.bg.glass,
            color: T.text.primary,
            fontSize: 14,
            fontWeight: 800,
            cursor: "pointer",
            marginBottom: 10,
            transition: "all .2s ease",
            boxShadow: T.shadow.soft,
          }}
        >
          <Plus size={16} color={T.accent.primary} strokeWidth={2.8} /> Add Pending Charge
        </button>
      ) : (
        <Card variant="glass" style={{ padding: "12px 14px", position: "relative", overflow: "hidden", marginBottom: 10 }}>
          <div
            style={{
              position: "absolute",
              right: -20,
              bottom: -20,
              width: 60,
              height: 60,
              background: T.status.amber,
              filter: "blur(40px)",
              opacity: 0.06,
              borderRadius: "50%",
              pointerEvents: "none",
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Label style={{ marginBottom: 0, fontWeight: 800 }}>Pending Charges</Label>
            <button
              onClick={() => {
                haptic.medium();
                s("pendingCharges", [
                  ...(form.pendingCharges || []),
                  { amount: "", cardId: "", description: "", confirmed: false },
                ]);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                borderRadius: T.radius.sm,
                border: `1px solid ${T.status.amber}40`,
                background: `${T.status.amber}0A`,
                color: T.status.amber,
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: T.font.mono,
              }}
            >
              <Plus size={11} />
              ADD
            </button>
          </div>
          {(form.pendingCharges || []).map((charge, ci) => (
            <div
              key={ci}
              className="slide-up"
              style={{
                marginBottom: 6,
                background: T.bg.elevated,
                borderRadius: T.radius.md,
                padding: "8px 10px",
                border: `1px solid ${charge.confirmed ? T.status.green + "40" : T.border.default}`,
                transition: "border-color .2s",
                animationDelay: `${ci * 0.06}s`
              }}
            >
              {/* Row 1: card picker + amount + remove */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) minmax(124px, 0.56fr) 44px",
                  gap: 8,
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <CustomSelect
                  ariaLabel={`Pending charge card ${ci + 1}`}
                  value={charge.cardId || ""}
                  onChange={val => {
                    const card = (cards || []).find(c => c.id === val);
                    setForm(p => ({
                      ...p,
                      pendingCharges: p.pendingCharges.map((ch, j) =>
                        j === ci ? { ...ch, cardId: card?.id || "", description: ch.description } : ch
                      ),
                    }));
                  }}
                  placeholder="Card..."
                    options={cardOptions}
                />
                <div style={{ minWidth: 0 }}>
                  <DI
                    value={charge.amount}
                    onChange={e =>
                      setForm(p => ({
                        ...p,
                        pendingCharges: p.pendingCharges.map((ch, j) =>
                          j === ci ? { ...ch, amount: sanitizeDollar(e.target.value), confirmed: false } : ch
                        ),
                      }))
                    }
                  />
                </div>
                {/* ALWAYS show trash button so user can delete the last pending charge and return to compact state */}
                <button
                  onClick={() => {
                    haptic.light();
                    setForm(p => ({
                      ...p,
                      pendingCharges: (p.pendingCharges || []).filter((_, j) => j !== ci)
                    }));
                  }}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: T.radius.sm,
                    border: "none",
                    background: T.status.redDim,
                    color: T.status.red,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
              {/* Row 2: description + confirm */}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="text"
                  aria-label={`Pending charge description ${ci + 1}`}
                  value={charge.description || ""}
                  onChange={e =>
                    setForm(p => ({
                      ...p,
                      pendingCharges: p.pendingCharges.map((ch, j) =>
                        j === ci ? { ...ch, description: e.target.value } : ch
                      ),
                    }))
                  }
                  placeholder="Description..."
                  style={{
                    flex: 1,
                    boxSizing: "border-box",
                    padding: "7px 10px",
                    borderRadius: T.radius.md,
                    border: `1px solid ${T.border.default}`,
                    background: T.bg.card,
                    color: T.text.primary,
                    fontSize: 11,
                  }}
                />
                <button
                  onClick={() => {
                    setForm(p => ({
                      ...p,
                      pendingCharges: p.pendingCharges.map((ch, j) =>
                        j === ci ? { ...ch, confirmed: !ch.confirmed } : ch
                      ),
                    }));
                    haptic.medium();
                  }}
                  style={{
                    padding: "7px 12px",
                    borderRadius: T.radius.md,
                    cursor: "pointer",
                    fontSize: 10,
                    fontWeight: 800,
                    fontFamily: T.font.mono,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                    border: charge.confirmed ? `1px solid ${T.status.green}30` : `1px solid ${T.status.amber}40`,
                    background: charge.confirmed ? T.status.greenDim : T.status.amberDim,
                    color: charge.confirmed ? T.status.green : T.status.amber,
                  }}
                >
                  {charge.confirmed ? (
                    <>
                      <CheckCircle size={11} />
                      OK
                    </>
                  ) : (
                    <>
                      <AlertTriangle size={11} />
                      CONFIRM
                    </>
                  )}
                </button>
              </div>
            </div>
          ))
          }
          {
            (form.pendingCharges || []).filter(c => toNumber(c.amount) > 0).length > 1 && (
              <div
                style={{ fontSize: 10, fontFamily: T.font.mono, color: T.text.secondary, textAlign: "right", marginTop: 2 }}
              >
                TOTAL: ${(form.pendingCharges || []).reduce((s, c) => s + toNumber(c.amount), 0).toFixed(2)}
              </div>
            )
          }
        </Card >
      )}

      {/* ── Notes for this Week (always visible — critical for AI context) ── */}
      <Card variant="glass" style={{ position: "relative", overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            left: -15,
            top: -15,
            width: 50,
            height: 50,
            background: T.accent.emerald,
            filter: "blur(35px)",
            opacity: 0.06,
            borderRadius: "50%",
            pointerEvents: "none",
          }}
        />
        <Label style={{ fontWeight: 800, marginBottom: 6 }}>Notes for this Paycheck</Label>
        <p style={{ fontSize: 10, color: T.text.muted, marginBottom: 8, lineHeight: 1.4 }}>
          Tell the AI anything it needs to know — e.g. "I already paid rent", "expecting a reimbursement", "skip gas
          budget this paycheck".
        </p>
        <textarea
          aria-label="Notes for this week"
          value={form.notes}
          onChange={e => s("notes", e.target.value)}
          placeholder="e.g. Already paid credit card statement, expecting $200 reimbursement, skip gym budget..."
          style={{
            width: "100%",
            minHeight: 70,
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
          onFocus={e => {
            e.target.style.borderColor = T.accent.primary;
            e.target.style.boxShadow = `0 0 0 3px ${T.accent.primary}30`;
          }}
          onBlur={e => {
            e.target.style.borderColor = T.border.default;
            e.target.style.boxShadow = "none";
          }}
        />
      </Card>

      {/* ── ADVANCED DETAILS TOGGLE ── */}
      <div style={{ marginTop: 8, marginBottom: 8, borderTop: `1px solid ${T.border.subtle}`, paddingTop: 10 }}>
        <button
          onClick={() => {
            haptic.medium();
            setShowAdvanced(!showAdvanced);
          }}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderRadius: T.radius.lg,
            border: `1px solid ${showAdvanced ? T.accent.primary + "50" : T.border.subtle}`,
            background: showAdvanced ? `${T.accent.primary}0D` : T.bg.glass,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            color: showAdvanced ? T.text.primary : T.text.secondary,
            cursor: "pointer",
            transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
            boxShadow: showAdvanced ? `0 4px 16px ${T.accent.primary}1A, inset 0 1px 0 ${T.accent.primary}15` : "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 10,
                background: showAdvanced ? `linear-gradient(135deg, ${T.accent.primary}, #6C60FF)` : T.bg.card,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: showAdvanced ? `0 2px 12px ${T.accent.primary}50` : "none",
                transition: "all .3s",
              }}
            >
              <Zap size={14} color={showAdvanced ? "#fff" : T.text.muted} strokeWidth={2.5} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-0.01em", color: T.text.primary }}>
                Advanced Details
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: 11,
                  fontWeight: 500,
                  color: showAdvanced ? T.text.secondary : T.text.dim,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {advancedSummary}
              </div>
            </div>
          </div>
          <div
            style={{
              transform: `rotate(${showAdvanced ? 180 : 0}deg)`,
              transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
              display: "flex",
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </button>
      </div>

      {/* ── ADVANCED PAYLOAD ── */}
      {
        showAdvanced && (
          <div style={{ animation: "fadeInUp 0.4s ease-out both" }}>
            {/* ── Paycheck Plan-Ahead (moved inside Advanced) ── */}
            {activeConfig.trackPaycheck !== false && (
              <Card style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: T.bg.elevated,
                      borderRadius: T.radius.md,
                      padding: "10px 12px",
                      border: `1px solid ${T.border.default}`,
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
                      background: T.bg.elevated,
                      borderRadius: T.radius.md,
                      padding: "10px 12px",
                      border: `1px solid ${T.border.default}`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: T.text.secondary,
                        fontFamily: T.font.mono,
                        marginBottom: 8,
                      }}
                    >
                      {activeConfig.incomeType === "hourly"
                        ? "HOURS WORKED"
                        : activeConfig.incomeType === "variable"
                          ? "PAYCHECK AMOUNT"
                          : "PAYCHECK OVERRIDE"}
                    </div>
                    <input
                      type="number"
                      inputMode="decimal"
                      pattern="[0-9]*"
                      step={activeConfig.incomeType === "hourly" ? "0.5" : "0.01"}
                      aria-label={
                        activeConfig.incomeType === "hourly"
                          ? "Hours worked"
                          : activeConfig.incomeType === "variable"
                            ? "Paycheck amount"
                            : "Paycheck override"
                      }
                      value={form.paycheckAddOverride}
                      onChange={e => s("paycheckAddOverride", e.target.value)}
                      placeholder={`Use config ${activeConfig.incomeType === "hourly" ? "hrs" : "$"}`}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: T.radius.md,
                        border: `1px solid ${T.border.default}`,
                        background: T.bg.card,
                        color: T.text.primary,
                        fontSize: 14,
                      }}
                    />
                  </div>
                </div>
              </Card>
            )}
            {/* Investment auto-tracking section */}
            {(activeConfig.trackRoth || activeConfig.trackBrokerage || activeConfig.track401k) && (
              <Card variant="glass" style={{ marginBottom: 10, position: "relative", overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <Label style={{ marginBottom: 0, fontWeight: 800 }}>Investment Balances</Label>
                  {financialConfig?.enableHoldings && (
                    <Badge
                      variant="outline"
                      style={{ fontSize: 9, color: T.accent.emerald, borderColor: `${T.accent.emerald}40` }}
                    >
                      AUTO-TRACKED
                    </Badge>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {activeConfig.trackRoth &&
                    (() => {
                      const hasAutoValue =
                        financialConfig?.enableHoldings &&
                        (financialConfig?.holdings?.roth || []).length > 0 &&
                        holdingValues.roth > 0;
                      return (
                        <div
                          style={{
                            padding: "10px 12px",
                            background: T.bg.elevated,
                            borderRadius: T.radius.md,
                            border: `1px solid ${T.border.subtle}`,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              marginBottom: overrideInvest.roth ? 8 : 0,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{ width: 6, height: 6, borderRadius: 3, background: "#8B5CF6" }} />
                              <span style={{ fontSize: 12, fontWeight: 700, color: T.text.primary }}>Roth IRA</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              {hasAutoValue && !overrideInvest.roth && (
                                <Mono size={13} weight={800} color={T.accent.emerald}>
                                  {fmt(holdingValues.roth)}
                                </Mono>
                              )}
                              {hasAutoValue && (
                                <button
                                  onClick={() => setOverrideInvest(p => ({ ...p, roth: !p.roth }))}
                                  style={{
                                    fontSize: 9,
                                    fontWeight: 700,
                                    fontFamily: T.font.mono,
                                    padding: "3px 8px",
                                    borderRadius: T.radius.sm,
                                    border: `1px solid ${overrideInvest.roth ? T.accent.primary : T.border.default}`,
                                    background: overrideInvest.roth ? `${T.accent.primary}15` : "transparent",
                                    color: overrideInvest.roth ? T.accent.primary : T.text.dim,
                                    cursor: "pointer",
                                  }}
                                >
                                  {overrideInvest.roth ? "CANCEL" : "OVERRIDE"}
                                </button>
                              )}
                            </div>
                          </div>
                          {(!hasAutoValue || overrideInvest.roth) && (
                            <DI
                              value={form.roth}
                              onChange={e => s("roth", sanitizeDollar(e.target.value))}
                              placeholder={hasAutoValue ? `Auto: ${fmt(holdingValues.roth)}` : "Enter value"}
                            />
                          )}
                        </div>
                      );
                    })()}
                  {activeConfig.trackBrokerage &&
                    (() => {
                      const hasAutoValue =
                        financialConfig?.enableHoldings &&
                        (financialConfig?.holdings?.brokerage || []).length > 0 &&
                        holdingValues.brokerage > 0;
                      return (
                        <div
                          style={{
                            padding: "10px 12px",
                            background: T.bg.elevated,
                            borderRadius: T.radius.md,
                            border: `1px solid ${T.border.subtle}`,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              marginBottom: overrideInvest.brokerage ? 8 : 0,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{ width: 6, height: 6, borderRadius: 3, background: "#10B981" }} />
                              <span style={{ fontSize: 12, fontWeight: 700, color: T.text.primary }}>Brokerage</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              {hasAutoValue && !overrideInvest.brokerage && (
                                <Mono size={13} weight={800} color={T.accent.emerald}>
                                  {fmt(holdingValues.brokerage)}
                                </Mono>
                              )}
                              {hasAutoValue && (
                                <button
                                  onClick={() => setOverrideInvest(p => ({ ...p, brokerage: !p.brokerage }))}
                                  style={{
                                    fontSize: 9,
                                    fontWeight: 700,
                                    fontFamily: T.font.mono,
                                    padding: "3px 8px",
                                    borderRadius: T.radius.sm,
                                    border: `1px solid ${overrideInvest.brokerage ? T.accent.primary : T.border.default}`,
                                    background: overrideInvest.brokerage ? `${T.accent.primary}15` : "transparent",
                                    color: overrideInvest.brokerage ? T.accent.primary : T.text.dim,
                                    cursor: "pointer",
                                  }}
                                >
                                  {overrideInvest.brokerage ? "CANCEL" : "OVERRIDE"}
                                </button>
                              )}
                            </div>
                          </div>
                          {(!hasAutoValue || overrideInvest.brokerage) && (
                            <DI
                              value={form.brokerage}
                              onChange={e => s("brokerage", sanitizeDollar(e.target.value))}
                              placeholder={hasAutoValue ? `Auto: ${fmt(holdingValues.brokerage)}` : "Enter value"}
                            />
                          )}
                        </div>
                      );
                    })()}
                  {activeConfig.track401k &&
                    (() => {
                      const hasAutoValue =
                        financialConfig?.enableHoldings &&
                        (financialConfig?.holdings?.k401 || []).length > 0 &&
                        holdingValues.k401 > 0;
                      return (
                        <div
                          style={{
                            padding: "10px 12px",
                            background: T.bg.elevated,
                            borderRadius: T.radius.md,
                            border: `1px solid ${T.border.subtle}`,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              marginBottom: overrideInvest.k401 ? 8 : 0,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{ width: 6, height: 6, borderRadius: 3, background: "#3B82F6" }} />
                              <span style={{ fontSize: 12, fontWeight: 700, color: T.text.primary }}>401(k)</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              {hasAutoValue && !overrideInvest.k401 && (
                                <Mono size={13} weight={800} color={T.accent.emerald}>
                                  {fmt(holdingValues.k401)}
                                </Mono>
                              )}
                              {hasAutoValue && (
                                <button
                                  onClick={() => setOverrideInvest(p => ({ ...p, k401: !p.k401 }))}
                                  style={{
                                    fontSize: 9,
                                    fontWeight: 700,
                                    fontFamily: T.font.mono,
                                    padding: "3px 8px",
                                    borderRadius: T.radius.sm,
                                    border: `1px solid ${overrideInvest.k401 ? T.accent.primary : T.border.default}`,
                                    background: overrideInvest.k401 ? `${T.accent.primary}15` : "transparent",
                                    color: overrideInvest.k401 ? T.accent.primary : T.text.dim,
                                    cursor: "pointer",
                                  }}
                                >
                                  {overrideInvest.k401 ? "CANCEL" : "OVERRIDE"}
                                </button>
                              )}
                            </div>
                          </div>
                          {(!hasAutoValue || overrideInvest.k401) && (
                            <DI
                              value={form.k401Balance || ""}
                              onChange={e => s("k401Balance", sanitizeDollar(e.target.value))}
                              placeholder={hasAutoValue ? `Auto: ${fmt(holdingValues.k401)}` : "Enter value"}
                            />
                          )}
                        </div>
                      );
                    })()}
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
                    {((typedFinancialConfig.holdings?.crypto || []) as Array<{ symbol?: string }>).map((h) => (h.symbol || "").replace("-USD", "")).join(" · ")} ·
                    Live
                  </div>
                </Card>
              )}
            {financialConfig?.trackHabits !== false && (
              <Card style={{ padding: "12px 12px" }}>
                <Label>{financialConfig?.habitName || "Habit"} Restock Count</Label>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  {[-1, 1].map(dir => (
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
                    <Mono
                      size={26}
                      weight={800}
                      color={
                        (form.habitCount || 0) <= (financialConfig?.habitCriticalThreshold || 3)
                          ? T.status.red
                          : (form.habitCount || 0) <= (financialConfig?.habitCheckThreshold || 6)
                            ? T.status.amber
                            : T.text.primary
                      }
                    >
                      {form.habitCount || 0}
                    </Mono>
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
                        {(form.habitCount || 0) <= (financialConfig?.habitCriticalThreshold || 3)
                          ? "CRITICAL"
                          : "BELOW THRESHOLD"}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )}
            {activeConfig.budgetCategories?.length > 0 && (
              <Card>
                <Label>Budget Actuals</Label>
                <p style={{ fontSize: 10, color: T.text.muted, marginBottom: 10, lineHeight: 1.4 }}>
                  Enter actual spending per category this paycheck. The AI will compare vs. your targets.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {activeConfig.budgetCategories
                    .filter(c => c.name)
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
                            onChange={e => setBudgetActuals(p => ({ ...p, [cat.name]: e.target.value }))}
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

            {/* Notes moved to always-visible section above */}
          </div>
        )
      }

      <ConfigSection
        showConfig={showConfig}
        setShowConfig={setShowConfig}
        configSummary={configSummary}
        typedFinancialConfig={typedFinancialConfig}
        setTypedFinancialConfig={setTypedFinancialConfig}
        personalRules={personalRules}
        setPersonalRules={setPersonalRules}
      />

      {/* ── Plaid Transactions Card ── */}
      <PlaidTransactionsCard
        plaidTransactions={plaidTransactions}
        txnFetchedAt={txnFetchedAt}
        showTxns={showTxns}
        setShowTxns={setShowTxns}
      />

      <ValidationFeedback validationErrors={validationErrors} validationWarnings={validationWarnings} />

      {/* Easy Win 1: Pre-fill indicator */}
      {
        (plaidData.checking !== null || (lastAudit?.form?.checking && form.checking === lastAudit.form.checking)) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 10,
              padding: "8px 12px",
              borderRadius: T.radius.md,
              background: `${T.accent.primary}10`,
              border: `1px solid ${T.accent.primary}20`,
            }}
          >
            <span style={{ fontSize: 12 }}>{plaidData.checking !== null ? "🏦" : "💡"}</span>
            <span style={{ fontSize: 11, color: T.text.secondary }}>
              {plaidData.checking !== null
                ? "Balances pulled live from your linked bank accounts."
                : "Balances pre-filled from your last audit — update what's changed."}
            </span>
          </div>
        )
      }

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
        onSubmit={() => canSubmit && onSubmit(buildMsg(), { ...form, budgetActuals }, isTestMode)}
      />
      </div>
    </div >
  );
}
