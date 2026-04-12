  import {
  useEffect,
  useMemo,
  useRef,
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

interface CashAccountMeta {
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

interface InvestmentAuditField {
  key: "roth" | "brokerage" | "k401";
  label: string;
  enabled: boolean;
  accent: string;
  autoValue: number;
  formValue: MoneyInput | "";
  override: boolean;
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

let overrideInputIdCounter = 0;

function formatAuditDateDisplay(value: string): string {
  if (!value) return "Select date";
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getCurrentAuditTime(): string {
  return (new Date().toTimeString().split(" ")[0] ?? "00:00:00").slice(0, 5);
}

function buildCashAccountMeta(accounts: BankAccount[] = [], accountType: "checking" | "savings", fallbackLabel: string): CashAccountMeta {
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

function buildAuditCashAccountSnapshot(
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

function buildResolvedInvestmentSnapshot({
  visibleInvestmentFields,
  form,
}: {
  visibleInvestmentFields: InvestmentAuditField[];
  form: InputFormState;
}) {
  const snapshot: Record<string, number> = {};
  for (const field of visibleInvestmentFields) {
    const explicitValue = toNumber(
      field.key === "k401" ? form.k401Balance : field.key === "brokerage" ? form.brokerage : form.roth
    );
    const resolvedValue = explicitValue > 0 ? explicitValue : Number(field.autoValue || 0);
    if (resolvedValue > 0) snapshot[field.key] = Number(resolvedValue.toFixed(2));
  }
  return {
    roth: snapshot.roth ?? "",
    brokerage: snapshot.brokerage ?? "",
    k401Balance: snapshot.k401 ?? "",
  };
}

function CashAccountSection({
  meta,
  toneColor,
  title,
  accountOverrides,
  onOverrideAccount,
  onResetAccount,
  aggregateOverrideActive,
  onEnableAggregateOverride,
  aggregateOverrideValue,
  onAggregateChange,
  onResetAggregate,
  inputLabel,
}: {
  meta: CashAccountMeta;
  toneColor: string;
  title: string;
  accountOverrides: Record<string, MoneyInput | undefined>;
  onOverrideAccount: (id: string, value: MoneyInput) => void;
  onResetAccount: (id: string) => void;
  aggregateOverrideActive: boolean;
  onEnableAggregateOverride: () => void;
  aggregateOverrideValue: MoneyInput | "";
  onAggregateChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onResetAggregate: () => void;
  inputLabel: string;
}) {
  const hasAccounts = meta.accounts.length > 0;
  const hasMultipleAccounts = meta.accounts.length > 1;

  // Compute effective total: for each account, use override if present, otherwise live value
  const effectiveTotal = hasAccounts
    ? meta.accounts.reduce((sum, account) => {
        const override = accountOverrides[account.id];
        return sum + (override !== undefined ? toNumber(override) : account.amount);
      }, 0)
    : meta.total;
  const anyAccountOverridden = hasAccounts && meta.accounts.some((a) => accountOverrides[a.id] !== undefined);

  return (
    <Card
      className="hover-card"
      variant="glass"
      style={{ marginBottom: 8, position: "relative", overflow: "hidden" }}
    >
      <div
        style={{
          position: "absolute",
          right: -18,
          top: -18,
          width: 60,
          height: 60,
          background: toneColor,
          filter: "blur(40px)",
          opacity: 0.07,
          borderRadius: "50%",
          pointerEvents: "none",
        }}
      />
      {/* Header: title + total */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: hasAccounts ? 10 : 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div
            style={{
              width: 4,
              height: 24,
              borderRadius: 2,
              background: toneColor,
              flexShrink: 0,
            }}
          />
          <div style={{ minWidth: 0 }}>
            <Label style={{ fontWeight: 800, marginBottom: 0, fontSize: 11, lineHeight: 1.15 }}>{title}</Label>
            {hasMultipleAccounts && (
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: T.text.dim,
                  fontFamily: T.font.mono,
                  letterSpacing: "0.04em",
                  marginTop: 1,
                }}
              >
                {meta.count} ACCOUNTS
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {anyAccountOverridden && (
            <span
              style={{
                fontSize: 8,
                fontWeight: 800,
                fontFamily: T.font.mono,
                letterSpacing: "0.06em",
                color: toneColor,
                padding: "2px 6px",
                borderRadius: 4,
                background: `${toneColor}15`,
                border: `1px solid ${toneColor}30`,
              }}
            >
              OVERRIDE
            </span>
          )}
          <Mono size={14} weight={800} color={anyAccountOverridden ? toneColor : T.text.primary}>
            {fmt(effectiveTotal ?? 0)}
          </Mono>
        </div>
      </div>

      {/* Per-account rows */}
      {hasAccounts ? (
        <div style={{ display: "grid", gap: 6 }}>
          {meta.accounts.map((account) => {
            const overrideValue = accountOverrides[account.id];
            const isOverridden = overrideValue !== undefined;

            return (
              <div
                key={account.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: T.radius.md,
                  background: isOverridden ? `${toneColor}08` : `${T.bg.elevated}C0`,
                  border: `1px solid ${isOverridden ? `${toneColor}35` : T.border.subtle}`,
                  transition: "all 0.2s ease",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: T.text.primary,
                      lineHeight: 1.25,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {account.displayLabel}
                  </div>
                  <div style={{ fontSize: 9.5, color: T.text.dim, marginTop: 1 }}>
                    {isOverridden ? "Manual override" : "Live balance"}
                  </div>
                </div>

                {isOverridden ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, maxWidth: 180 }}>
                    <InlineOverrideMoneyInput
                      label={`${account.displayLabel} override`}
                      value={overrideValue}
                      onChange={(e) => onOverrideAccount(account.id, sanitizeDollar(e.target.value))}
                      placeholder={fmt(account.amount)}
                      onReset={() => onResetAccount(account.id)}
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => onOverrideAccount(account.id, "" as MoneyInput)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: 80,
                      height: 32,
                      background: `${toneColor}0C`,
                      border: `1px solid ${toneColor}30`,
                      borderRadius: T.radius.md,
                      cursor: "pointer",
                      padding: "0 10px",
                      flexShrink: 0,
                      transition: "all 0.2s ease",
                    }}
                  >
                    <Mono size={12} weight={800} color={toneColor}>
                      {fmt(account.amount)}
                    </Mono>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        // Fallback for no linked accounts — aggregate total override
        effectiveTotal !== null && !aggregateOverrideActive ? (
          <button
            onClick={onEnableAggregateOverride}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 38,
              background: `${toneColor}10`,
              border: `1px solid ${toneColor}40`,
              borderRadius: T.radius.md,
              cursor: "pointer",
            }}
          >
            <Mono size={13} weight={800} color={toneColor}>
              {fmt(effectiveTotal)}
            </Mono>
          </button>
        ) : (
          <InlineOverrideMoneyInput
            label={inputLabel}
            value={aggregateOverrideValue}
            onChange={onAggregateChange}
            placeholder={effectiveTotal !== null ? `${fmt(effectiveTotal)}` : "0.00"}
            onReset={onResetAggregate}
          />
        )
      )}
    </Card>
  );
}

function AuditPickerField({
  type,
  ariaLabel,
  value,
  onChange,
  displayValue,
}: {
  type: "date" | "time";
  ariaLabel: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  displayValue: string;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        minHeight: 44,
        borderRadius: T.radius.md,
        background: T.bg.elevated,
        border: `1.5px solid ${focused ? T.accent.primary : T.border.default}`,
        boxSizing: "border-box",
        boxShadow: focused ? `0 0 0 3px ${T.accent.primary}24` : "none",
        transition: "border-color 0.2s ease, box-shadow 0.2s ease",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          minHeight: 44,
          padding: "10px 12px",
          color: T.text.primary,
          fontSize: 13,
          fontFamily: T.font.sans,
          fontWeight: 700,
          letterSpacing: "-0.01em",
          boxSizing: "border-box",
        }}
      >
        {displayValue}
      </div>
      <input
        type={type}
        aria-label={ariaLabel}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0,
          cursor: "pointer",
          WebkitAppearance: "none",
          appearance: "none",
        }}
      />
    </div>
  );
}

function InlineOverrideMoneyInput({
  value,
  onChange,
  placeholder = "0.00",
  label = "Amount",
  onReset,
  tone = "primary",
}: DollarInputProps & { onReset: () => void; tone?: "primary" | "danger" }) {
  const [id] = useState(() => `override-di-${++overrideInputIdCounter}`);
  const [focused, setFocused] = useState(false);
  const toneColor = tone === "danger" ? T.status.red : T.accent.primary;
  const toneBackground = tone === "danger" ? T.status.redDim : `${T.accent.primary}10`;
  const toneBorder = tone === "danger" ? `${T.status.red}70` : `${T.accent.primary}70`;
  const toneResetBackground = tone === "danger" ? "rgba(255, 107, 129, 0.12)" : `${T.accent.primary}18`;
  const toneResetBorder = tone === "danger" ? `${T.status.red}40` : `${T.accent.primary}40`;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 30px",
        gap: 6,
        alignItems: "center",
        minWidth: 0,
      }}
    >
      <label
        htmlFor={id}
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </label>
      <div style={{ position: "relative", minWidth: 0 }}>
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            color: toneColor,
            fontFamily: T.font.mono,
            fontSize: 13,
            fontWeight: 800,
            transition: "color 0.2s ease",
            zIndex: 1,
          }}
        >
          $
        </span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          pattern="[0-9.]*"
          value={value}
          placeholder={placeholder}
          onChange={onChange}
          onFocus={e => {
            setFocused(true);
            setTimeout(() => e.target.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
          }}
          onBlur={() => setFocused(false)}
          aria-label={label}
          className="app-input"
          style={{
            width: "100%",
            minWidth: 0,
            height: 38,
            padding: "11px 12px 11px 26px",
            borderRadius: T.radius.md,
            background: toneBackground,
            border: `1.5px solid ${focused ? toneColor : toneBorder}`,
            color: T.text.primary,
            fontSize: 16,
            outline: "none",
            boxSizing: "border-box",
            transition: "all 0.2s",
            fontFamily: T.font.mono,
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            boxShadow: focused ? `0 0 0 3px ${toneColor}22` : "none",
          }}
        />
      </div>
      <button
        type="button"
        onMouseDown={event => event.preventDefault()}
        onClick={onReset}
        aria-label={`Reset ${label} to live value`}
        style={{
          width: 30,
          height: 30,
          borderRadius: 999,
          border: `1px solid ${toneResetBorder}`,
          background: toneResetBackground,
          color: toneColor,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 900,
          lineHeight: 1,
          boxShadow: `0 2px 10px ${toneColor}12`,
          flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  );
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
      }) as InputFormState
  );
  const [isTestMode, setIsTestMode] = useState<boolean>(false);

  const [budgetActuals, setBudgetActuals] = useState<Record<string, string | number>>({});
  const [holdingValues, setHoldingValues] = useState<HoldingValues>({ roth: 0, k401: 0, brokerage: 0, crypto: 0, hsa: 0 });
  const [overrideInvest, setOverrideInvest] = useState<OverrideInvestState>({ roth: false, brokerage: false, k401: false });
  const [overridePlaid, setOverridePlaid] = useState<OverridePlaidState>({ checking: false, vault: false, debts: {}, cashAccounts: {} });
  const [deletedDebtCardIds, setDeletedDebtCardIds] = useState<Record<string, boolean>>({});
  const hydratedAuditSeedKeyRef = useRef<string | null>(null);

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
    setForm(p => mergePlaidAutoFillIntoForm(p, freshPlaid, overridePlaid, deletedDebtCardIds) as InputFormState);
  }, [cards, bankAccounts, overridePlaid, deletedDebtCardIds]);
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
  const checkingAccountMeta = useMemo(
    () => buildCashAccountMeta(bankAccounts || [], "checking", "Checking"),
    [bankAccounts]
  );
  const savingsAccountMeta = useMemo(
    () => buildCashAccountMeta(bankAccounts || [], "savings", "Savings"),
    [bankAccounts]
  );
  const showCheckingAccount = activeConfig.trackChecking !== false && checkingAccountMeta.count > 0;
  const showSavingsAccount = activeConfig.trackSavings !== false && savingsAccountMeta.count > 0;
  const hasPortfolioAuditInputs = showCheckingAccount || showSavingsAccount || (cards || []).length > 0;
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
  const investmentFields = useMemo<InvestmentAuditField[]>(
    () => [
      {
        key: "roth",
        label: "Roth IRA",
        enabled: Boolean(activeConfig.trackRoth || activeConfig.trackRothContributions),
        accent: "#8B5CF6",
        autoValue: investmentAutoValues.roth,
        formValue: form.roth,
        override: overrideInvest.roth,
      },
      {
        key: "brokerage",
        label: "Brokerage",
        enabled: Boolean(activeConfig.trackBrokerage),
        accent: "#10B981",
        autoValue: investmentAutoValues.brokerage,
        formValue: form.brokerage,
        override: overrideInvest.brokerage,
      },
      {
        key: "k401",
        label: "401(k)",
        enabled: Boolean(activeConfig.track401k),
        accent: "#3B82F6",
        autoValue: investmentAutoValues.k401,
        formValue: form.k401Balance,
        override: overrideInvest.k401,
      },
    ],
    [
      activeConfig.track401k,
      activeConfig.trackBrokerage,
      activeConfig.trackRoth,
      activeConfig.trackRothContributions,
      form.brokerage,
      form.k401Balance,
      form.roth,
      investmentAutoValues.brokerage,
      investmentAutoValues.k401,
      investmentAutoValues.roth,
      overrideInvest.brokerage,
      overrideInvest.k401,
      overrideInvest.roth,
    ]
  );
  const visibleInvestmentFields = investmentFields.filter((field) => {
    if (!field.enabled) return false;
    if (field.override) return true;
    if (Math.abs(Number(field.autoValue || 0)) > 0.004) return true;
    return Math.abs(toNumber(field.formValue)) > 0.004;
  });
  const hiddenInvestmentFields = investmentFields.filter((field) => field.enabled && !visibleInvestmentFields.includes(field));
  const showInvestmentSection = visibleInvestmentFields.length > 0 || hiddenInvestmentFields.length > 0;


  // Compute exact strategy using current form inputs

  const cardOptions = useMemo<SelectGroup[]>(() => {
    return buildCardSelectGroups(cards || [], getShortCardLabel) as SelectGroup[];
  }, [cards]);
  const lastAuditSeedKey = useMemo(() => {
    if (!hasReusableAuditSeed(lastAudit)) return null;
    return `${String(lastAudit?.ts || lastAudit?.date || "seed")}:${lastAudit?.isTest ? "test" : "live"}`;
  }, [lastAudit]);

  useEffect(() => {
    if (!lastAuditSeedKey || hydratedAuditSeedKeyRef.current === lastAuditSeedKey) return;
    hydratedAuditSeedKeyRef.current = lastAuditSeedKey;
    setForm(p =>
      mergeLastAuditIntoForm({
        previousForm: p,
        lastAudit,
        cards,
        bankAccounts,
        today: new Date(),
      }) as InputFormState
    );
    // Restore per-account cash overrides from the last audit so they survive Plaid refresh
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
  const addD = () => {
    haptic.medium();
    s("debts", [...form.debts, { cardId: "", name: "", balance: "" }]);
  };
  const rmD = (i: number) => {
    haptic.light();
    const removedDebt = form.debts[i];
    if (removedDebt?.cardId) {
      setDeletedDebtCardIds(p => ({ ...p, [removedDebt.cardId]: true }));
    }
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
    (activeConfig.trackRoth || activeConfig.trackRothContributions) && (form.roth || investmentAutoValues.roth),
    activeConfig.trackBrokerage && (form.brokerage || investmentAutoValues.brokerage),
    activeConfig.track401k && (form.k401Balance || activeConfig.k401Balance || investmentAutoValues.k401),
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

  const investmentBalancesSection =
    showInvestmentSection ? (
      <Card variant="glass" style={{ marginBottom: 8, position: "relative", overflow: "hidden" }}>
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
          {visibleInvestmentFields.length === 0 && (
            <div
              style={{
                padding: "14px 14px 12px",
                borderRadius: T.radius.lg,
                background: T.bg.elevated,
                border: `1px solid ${T.border.subtle}`,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 800, color: T.text.primary, marginBottom: 4 }}>
                No investment balances included yet
              </div>
              <div style={{ fontSize: 11.5, color: T.text.secondary, lineHeight: 1.5 }}>
                Add only the investment buckets you want the briefing to consider. Hidden empty categories stay out of the way.
              </div>
            </div>
          )}
          {visibleInvestmentFields.map((field) => {
            const hasAutoValue = Math.abs(Number(field.autoValue || 0)) > 0.004;
            const showManualInput = !hasAutoValue || field.override;
            const overrideActionLabel = hasAutoValue
              ? field.override
                ? "CANCEL"
                : "OVERRIDE"
              : field.override
                ? "HIDE"
                : "";

            return (
              <div
                key={field.key}
                style={{
                  padding: "10px 12px",
                  background: T.bg.elevated,
                  borderRadius: T.radius.md,
                  border: `1px solid ${T.border.subtle}`,
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.03)`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    marginBottom: showManualInput ? 8 : 0,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                    <div style={{ width: 6, height: 6, borderRadius: 3, background: field.accent, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.text.primary, minWidth: 0 }}>{field.label}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {hasAutoValue && !field.override && (
                      <Mono size={13} weight={800} color={T.accent.emerald}>
                        {fmt(field.autoValue)}
                      </Mono>
                    )}
                    {overrideActionLabel ? (
                      <button
                        onClick={() =>
                          setOverrideInvest((prev) => ({
                            ...prev,
                            [field.key]: !prev[field.key],
                          }))
                        }
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          fontFamily: T.font.mono,
                          padding: "3px 8px",
                          borderRadius: T.radius.sm,
                          border: `1px solid ${field.override ? `${field.accent}50` : T.border.default}`,
                          background: field.override ? `${field.accent}16` : "transparent",
                          color: field.override ? field.accent : T.text.dim,
                          cursor: "pointer",
                        }}
                      >
                        {overrideActionLabel}
                      </button>
                    ) : null}
                  </div>
                </div>
                {showManualInput &&
                  (field.key === "roth" ? (
                    <DI
                      value={form.roth}
                      onChange={e => s("roth", sanitizeDollar(e.target.value))}
                      placeholder={hasAutoValue ? `Auto: ${fmt(field.autoValue)}` : "Enter value"}
                    />
                  ) : field.key === "brokerage" ? (
                    <DI
                      value={form.brokerage}
                      onChange={e => s("brokerage", sanitizeDollar(e.target.value))}
                      placeholder={hasAutoValue ? `Auto: ${fmt(field.autoValue)}` : "Enter value"}
                    />
                  ) : (
                    <DI
                      value={form.k401Balance || ""}
                      onChange={e => s("k401Balance", sanitizeDollar(e.target.value))}
                      placeholder={hasAutoValue ? `Auto: ${fmt(field.autoValue)}` : "Enter value"}
                    />
                  ))}
              </div>
            );
          })}
          {hiddenInvestmentFields.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
                paddingTop: visibleInvestmentFields.length > 0 ? 2 : 0,
              }}
            >
              <span style={{ fontSize: 11, color: T.text.dim, fontWeight: 700 }}>
                Add category
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {hiddenInvestmentFields.map((field) => (
                  <button
                    key={field.key}
                    type="button"
                    onClick={() =>
                      setOverrideInvest((prev) => ({
                        ...prev,
                        [field.key]: true,
                      }))
                    }
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      minHeight: 32,
                      padding: "0 12px",
                      borderRadius: 999,
                      border: `1px solid ${field.accent}35`,
                      background: `${field.accent}12`,
                      color: field.accent,
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    <Plus size={11} strokeWidth={2.6} />
                    {field.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>
    ) : null;

  return (
    <div
      className="safe-scroll-body safe-bottom page-body stagger-container"
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
      {!hasPortfolioAuditInputs && (
        <Card variant="glass" style={{ marginBottom: 16, position: "relative", overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              right: -18,
              top: -18,
              width: 72,
              height: 72,
              background: T.accent.primary,
              filter: "blur(42px)",
              opacity: 0.08,
              borderRadius: "50%",
              pointerEvents: "none",
            }}
          />
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 12,
                display: "grid",
                placeItems: "center",
                background: `${T.accent.primary}18`,
                color: T.accent.primary,
                flexShrink: 0,
              }}
            >
              <Zap size={16} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.text.primary, marginBottom: 6 }}>
                Add accounts in Portfolio first
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5, color: T.text.secondary }}>
                The audit should be built from the accounts you actually track. Add your bank accounts and cards in
                Portfolio, then come back here to review live balances and generate a real briefing.
              </div>
            </div>
          </div>
        </Card>
      )}
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
          <Label style={{ fontWeight: 800 }}>Date</Label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
            <AuditPickerField
              type="date"
              ariaLabel="Audit date"
              value={form.date}
              onChange={e => s("date", e.target.value)}
              displayValue={formatAuditDateDisplay(form.date)}
            />
          </div>
        </Card>
        {(showCheckingAccount || showSavingsAccount) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {showCheckingAccount && (
              <CashAccountSection
                meta={checkingAccountMeta}
                toneColor={T.accent.emerald}
                title={checkingAccountMeta.count > 1 ? "Checking & Cash" : checkingAccountMeta.label}
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
                aggregateOverrideActive={overridePlaid.checking}
                onEnableAggregateOverride={() => setOverridePlaid((p) => ({ ...p, checking: true }))}
                aggregateOverrideValue={form.checking}
                onAggregateChange={(e) => s("checking", sanitizeDollar(e.target.value))}
                onResetAggregate={() => {
                  setOverridePlaid((p) => ({ ...p, checking: false }));
                  s("checking", checkingAccountMeta.total ?? "");
                }}
                inputLabel="Checking balance"
              />
            )}
            {showSavingsAccount && (
              <CashAccountSection
                meta={savingsAccountMeta}
                toneColor="#3B82F6"
                title={savingsAccountMeta.count > 1 ? "Savings & Vault" : savingsAccountMeta.label}
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
                aggregateOverrideActive={overridePlaid.vault}
                onEnableAggregateOverride={() => setOverridePlaid((p) => ({ ...p, vault: true }))}
                aggregateOverrideValue={form.savings}
                onAggregateChange={(e) => s("savings", sanitizeDollar(e.target.value))}
                onResetAggregate={() => {
                  setOverridePlaid((p) => ({ ...p, vault: false }));
                  s("savings", savingsAccountMeta.total ?? "");
                }}
                inputLabel="Savings balance"
              />
            )}
          </div>
        )}

        {investmentBalancesSection}

        <Card
          className="hover-card"
          variant="glass"
          style={{ marginBottom: 8, position: "relative", overflow: "hidden" }}
        >
          <div
            style={{
              position: "absolute",
              right: -18,
              top: -18,
              width: 60,
              height: 60,
              background: T.status.red,
              filter: "blur(40px)",
              opacity: 0.07,
              borderRadius: "50%",
              pointerEvents: "none",
            }}
          />
          {/* Header: accent bar + title + count + total + ADD */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: form.debts.length > 0 ? 10 : 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <div
                style={{
                  width: 4,
                  height: 24,
                  borderRadius: 2,
                  background: T.status.red,
                  flexShrink: 0,
                }}
              />
              <div style={{ minWidth: 0 }}>
                <Label style={{ fontWeight: 800, marginBottom: 0, fontSize: 11, lineHeight: 1.15 }}>Credit Card Balances</Label>
                {form.debts.length > 1 && (
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: T.text.dim,
                      fontFamily: T.font.mono,
                      letterSpacing: "0.04em",
                      marginTop: 1,
                    }}
                  >
                    {form.debts.length} CARDS
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {form.debts.length > 0 && (
                <Mono size={14} weight={800} color={T.text.primary}>
                  {fmt(form.debts.reduce((sum, d) => {
                    const plaidDebt = d.cardId ? plaidData.debts?.find(pd => pd.cardId === d.cardId) : null;
                    const isOverridden = !!(d.cardId && overridePlaid.debts[d.cardId]);
                    if (plaidDebt && plaidDebt.balance !== null && !isOverridden) return sum + (plaidDebt.balance as number);
                    return sum + toNumber(d.balance);
                  }, 0))}
                </Mono>
              )}
              <button
                className="hover-btn"
                onClick={addD}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 10px",
                  borderRadius: T.radius.sm,
                  border: `1px solid ${T.status.red}40`,
                  background: `${T.status.red}15`,
                  color: T.status.red,
                  fontSize: 9,
                  fontWeight: 800,
                  cursor: "pointer",
                  fontFamily: T.font.mono,
                  transition: "all .2s ease",
                  flexShrink: 0,
                }}
              >
                <Plus size={10} strokeWidth={3} /> ADD
              </button>
            </div>
          </div>
          {form.debts.length === 0 && (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: T.radius.md,
                background: T.bg.elevated,
                border: `1px solid ${T.border.subtle}`,
                color: T.text.secondary,
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              {(cards || []).length === 0
                ? "No credit cards added yet. Add cards in Portfolio, then include only the debt balances you want considered in this briefing."
                : "No debt balances included yet. Tap ADD to include only the card balances you want considered in this briefing."}
            </div>
          )}
          {/* Per-card rows */}
          {form.debts.length > 0 && (
            <div style={{ display: "grid", gap: 6 }}>
              {form.debts.map((d, i) => {
                const plaidDebt = d.cardId ? plaidData.debts?.find(pd => pd.cardId === d.cardId) : null;
                const hasPlaid = plaidDebt && plaidDebt.balance !== null;
                const isOverridden = !!(d.cardId && overridePlaid.debts[d.cardId]);
                const displayName = d.name || (d.cardId ? d.cardId : `Card ${i + 1}`);

                return (
                  <div
                    key={i}
                    className="slide-up"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      borderRadius: T.radius.md,
                      background: isOverridden ? `${T.status.red}08` : `${T.bg.elevated}C0`,
                      border: `1px solid ${isOverridden ? `${T.status.red}35` : T.border.subtle}`,
                      transition: "all 0.2s ease",
                      animationDelay: `${i * 0.06}s`,
                    }}
                  >
                    {/* Card name + subtitle */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {d.cardId ? (
                        <>
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: T.text.primary,
                              lineHeight: 1.25,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {displayName}
                          </div>
                          <div style={{ fontSize: 9.5, color: T.text.dim, marginTop: 1 }}>
                            {isOverridden ? "Manual override" : hasPlaid ? "Live balance" : "Manual entry"}
                          </div>
                        </>
                      ) : (
                        <CustomSelect
                          ariaLabel={`Debt card ${i + 1}`}
                          value={d.cardId || d.name || ""}
                          onChange={val => {
                            const card = (cards || []).find(c => c.id === val || c.name === val);
                            const newCardId = card?.id || "";
                            const newName = card ? resolveCardLabel(cards || [], card.id, card.name) : "";
                            const previousCardId = d.cardId || "";

                            setForm(p => ({
                              ...p,
                              debts: p.debts.map((debt, j) =>
                                j === i ? { ...debt, cardId: newCardId, name: newName } : debt
                              ),
                            }));
                            if (newCardId) {
                              setDeletedDebtCardIds(p => {
                                if (!p[newCardId] && !p[previousCardId]) return p;
                                const next = { ...p };
                                delete next[newCardId];
                                if (previousCardId && previousCardId !== newCardId && !form.debts.some((debt, j) => j !== i && debt.cardId === previousCardId)) {
                                  delete next[previousCardId];
                                }
                                return next;
                              });
                            }
                          }}
                          placeholder="Select card..."
                          options={cardOptions}
                        />
                      )}
                    </div>

                    {/* Balance bubble / override */}
                    <div style={{ flexShrink: 0, maxWidth: 180 }}>
                      {hasPlaid && !isOverridden ? (
                        <button
                          onClick={() => {
                            setOverridePlaid(p => ({ ...p, debts: { ...p.debts, [d.cardId]: true } }));
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: 80,
                            height: 32,
                            background: `${T.status.red}0C`,
                            border: `1px solid ${T.status.red}30`,
                            borderRadius: T.radius.md,
                            cursor: "pointer",
                            padding: "0 10px",
                            transition: "all 0.2s ease",
                          }}
                        >
                          <Mono size={12} weight={800} color={T.status.red}>
                            {fmt(plaidDebt.balance)}
                          </Mono>
                        </button>
                      ) : isOverridden && hasPlaid ? (
                        <InlineOverrideMoneyInput
                          label={`Debt balance ${i + 1}`}
                          value={d.balance}
                          onChange={e => sD(i, "balance", sanitizeDollar(e.target.value))}
                          placeholder={`${fmt(plaidDebt.balance)}`}
                          tone="danger"
                          onReset={() => {
                            setOverridePlaid(p => ({ ...p, debts: { ...p.debts, [d.cardId]: false } }));
                            sD(i, "balance", plaidDebt.balance);
                          }}
                        />
                      ) : (
                        <DI
                          value={d.balance}
                          onChange={e => sD(i, "balance", sanitizeDollar(e.target.value))}
                          placeholder={hasPlaid ? `${fmt(plaidDebt.balance)}` : "0.00"}
                        />
                      )}
                    </div>

                    {/* Delete button */}
                    {form.debts.length > 1 && (
                      <button
                        onClick={() => rmD(i)}
                        style={{
                          width: 32,
                          height: 32,
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
                );
              })}
            </div>
          )}
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

      {/* ── Notes + Briefing Context ── */}
      <Card variant="glass" style={{ position: "relative", overflow: "hidden", marginBottom: 2 }}>
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
          Tell the AI anything it needs to know — e.g. "I already paid rent", "expecting a reimbursement", "skip gas budget this paycheck".
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

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
        <ConfigSection
          showConfig={showConfig}
          setShowConfig={setShowConfig}
          configSummary={configSummary}
          typedFinancialConfig={typedFinancialConfig}
          setTypedFinancialConfig={setTypedFinancialConfig}
          personalRules={personalRules}
          setPersonalRules={setPersonalRules}
        />

        <PlaidTransactionsCard
          plaidTransactions={plaidTransactions}
          txnFetchedAt={txnFetchedAt}
          showTxns={showTxns}
          setShowTxns={setShowTxns}
          includeRecentSpending={includeRecentSpending}
          setIncludeRecentSpending={setIncludeRecentSpending}
          proEnabled={!!proEnabled}
        />

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
            padding: "15px 18px",
            borderRadius: T.radius.lg,
            border: `1px solid ${showAdvanced ? `${T.accent.primary}42` : T.border.subtle}`,
            background: showAdvanced ? `${T.accent.primary}0F` : T.bg.card,
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            color: showAdvanced ? T.text.primary : T.text.secondary,
            cursor: "pointer",
            transition: "all 0.24s ease",
            boxShadow: showAdvanced ? `0 6px 20px ${T.accent.primary}12, inset 0 1px 0 ${T.accent.primary}12` : T.shadow.soft,
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

        {showAdvanced && (
          <div style={{ animation: "fadeInUp 0.32s ease-out both", marginTop: -2 }}>
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
                      The plan-ahead toggle uses the income amount you set above in Financial Profile &amp; AI Rules.
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
                        {(form.habitCount || 0) <= (financialConfig?.habitCriticalThreshold || 3) ? "CRITICAL" : "BELOW THRESHOLD"}
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
          </div>
        )}
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
          <span style={{ fontSize: 12 }}>{plaidData.checking !== null ? "🏦" : "💡"}</span>
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
          const cashAccounts = buildAuditCashAccountSnapshot(checkingAccountMeta, savingsAccountMeta);
          // Compute effective totals from per-account overrides
          const effectiveCheckingTotal = checkingAccountMeta.accounts.length > 0
            ? checkingAccountMeta.accounts.reduce((sum, a) => {
                const ov = overridePlaid.cashAccounts[a.id];
                return sum + (ov !== undefined ? toNumber(ov) : a.amount);
              }, 0)
            : toNumber(form.checking);
          const effectiveSavingsTotal = savingsAccountMeta.accounts.length > 0
            ? savingsAccountMeta.accounts.reduce((sum, a) => {
                const ov = overridePlaid.cashAccounts[a.id];
                return sum + (ov !== undefined ? toNumber(ov) : a.amount);
              }, 0)
            : toNumber(form.savings);
          const anyCheckingOverridden = checkingAccountMeta.accounts.some((a) => overridePlaid.cashAccounts[a.id] !== undefined);
          const anySavingsOverridden = savingsAccountMeta.accounts.some((a) => overridePlaid.cashAccounts[a.id] !== undefined);
          const formWithAutoTime = {
            ...form,
            checking: effectiveCheckingTotal as unknown as MoneyInput,
            savings: effectiveSavingsTotal as unknown as MoneyInput,
            ...sanitizedInvestments,
            includedInvestmentKeys: visibleInvestmentKeys,
            investmentSnapshot: resolvedInvestmentSnapshot,
            cashAccounts: cashAccounts.map((a) => {
              const ov = overridePlaid.cashAccounts[a.id];
              return ov !== undefined ? { ...a, amount: toNumber(ov).toFixed(2), overridden: true } : a;
            }),
            cashSummary: {
              checkingTotalUsed: effectiveCheckingTotal,
              savingsTotalUsed: effectiveSavingsTotal,
              linkedCheckingTotal: checkingAccountMeta.total ?? "",
              linkedSavingsTotal: savingsAccountMeta.total ?? "",
              checkingOverride: overridePlaid.checking || anyCheckingOverridden,
              savingsOverride: overridePlaid.vault || anySavingsOverridden,
            },
            paycheckAddOverride: "",
            time: getCurrentAuditTime(),
          };
          onSubmit(buildMsg(formWithAutoTime), { ...formWithAutoTime, budgetActuals }, isTestMode);
        }}
      />
      </div>
    </div>
  );
}
