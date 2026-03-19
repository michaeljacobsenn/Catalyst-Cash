  import { useCallback,useEffect,useRef,useState } from "react";
  import type {
    BankAccount,
    Card,
    CatalystCashConfig,
    HousingType,
    IncomeType,
    PaycheckDepositAccount,
    PayFrequency,
    Renewal,
  } from "../../types/index.js";
  import { T } from "../constants.js";
  import { useNavigation } from "../contexts/NavigationContext.js";
  import { usePortfolio } from "../contexts/PortfolioContext.js";
  import { useSecurity } from "../contexts/SecurityContext.js";
  import { useSettings,type ThemeMode } from "../contexts/SettingsContext.js";
  import { setActiveCurrencyCode } from "../currency.js";
  import { AI_PROVIDERS } from "../providers.js";
  import { getSecretStorageStatus,setSecureItem } from "../secureStore.js";
  import { getPreferredModelForTier,getRawTier,normalizeModelForTier,shouldShowGating } from "../subscription.js";
  import { useToast } from "../Toast.js";
  import { db } from "../utils.js";
  import { PageWelcome } from "./setupWizard/PageWelcome.js";
  import PageImport from "./setupWizard/PageImport.js";
  import { PageProfile } from "./setupWizard/PageProfile.js";
  import { PagePass1 } from "./setupWizard/PagePass1.js";
  import { PagePass2 } from "./setupWizard/PagePass2.js";
  import { PagePass3 } from "./setupWizard/PagePass3.js";
  import { PageDone } from "./setupWizard/PageDone.js";

interface ToastApi {
  success?: (message: string) => void;
  error?: (message: string) => void;
}

interface SecurityContextValue {
  setRequireAuth?: ((value: boolean) => void) | undefined;
  setAppPasscode?: ((value: string) => void) | undefined;
  setUseFaceId?: ((value: boolean) => void) | undefined;
  setIsLocked?: ((value: boolean) => void) | undefined;
  setLockTimeout?: ((value: number) => void) | undefined;
  setAppleLinkedId?: ((value: string | null) => void) | undefined;
  appleLinkedId?: string | null;
  secretStorageStatus?: {
    mode: "native-secure" | "native-unavailable" | "web-limited";
  };
}

interface NavigationContextValue {
  setOnboardingComplete: (value: boolean) => void;
  navTo?: ((tab: "dashboard") => void) | undefined;
}

interface ProviderModel {
  id: string;
  defaultModel: string;
  keyStorageKey?: string | null;
}

const typedProviders = AI_PROVIDERS as ProviderModel[];

type WizardPageId = "welcome" | "import" | "profile" | "pass1" | "pass2" | "pass3" | "done";

interface WizardPageMeta {
  id: WizardPageId;
  emoji: string;
  title: string;
  subtitle: string;
  effort?: string;
  optional?: boolean;
}

export interface SetupWizardIncomeState {
  payFrequency: PayFrequency;
  payday: CatalystCashConfig["payday"];
  incomeType: IncomeType;
  hourlyRateNet: string;
  typicalHours: string;
  averagePaycheck: string;
  paycheckStandard: string;
  paycheckFirstOfMonth: string;
  isContractor: boolean;
  taxBracketPercent: string;
  paycheckDepositAccount: PaycheckDepositAccount;
  currencyCode: string;
  stateCode: string;
  birthYear: string;
  housingType: HousingType;
  monthlyRent: string;
  mortgagePayment: string;
}

export interface SetupWizardSpendingState {
  weeklySpendAllowance: string;
  emergencyFloor: string;
  checkingBuffer: string;
  greenStatusTarget: string;
  emergencyReserveTarget: string;
  defaultAPR: string;
  trackRothContributions: boolean;
  rothAnnualLimit: string;
  track401k: boolean;
  k401AnnualLimit: string;
  k401EmployerMatchPct: string;
  k401EmployerMatchLimit: string;
  trackHSA: boolean;
  trackCrypto: boolean;
}

export interface SetupWizardAiState {
  aiProvider: string;
  aiModel: string;
  apiKey: string;
}

export interface SetupWizardSecurityState {
  pinEnabled: boolean;
  pin: string;
  lockTimeout: number;
  useFaceId: boolean;
  autoBackupInterval?: "off" | "daily" | "weekly" | "monthly";
}

export type SetupWizardCombinedData = SetupWizardIncomeState & SetupWizardSpendingState;
export type SetupWizardUpdate<T extends object> = <K extends keyof T>(key: K, value: T[K]) => void;

const PAGES: WizardPageMeta[] = [
  { id: "welcome", emoji: "👋", title: "Welcome", subtitle: "A quick setup for cleaner audits and calmer money decisions.", effort: "30 sec" },
  { id: "import", emoji: "📥", title: "Import Data", subtitle: "Restore a backup first if you already have one.", effort: "Optional", optional: true },
  { id: "profile", emoji: "🧑‍💻", title: "Your Profile", subtitle: "Region and household context that shape your plan.", effort: "1 min" },
  { id: "pass1", emoji: "⚡️", title: "Cash Flow", subtitle: "Pay rhythm and weekly spending guardrails.", effort: "Required" },
  { id: "pass2", emoji: "🎯", title: "Safety Targets", subtitle: "Reserve targets and tax context for safer recommendations.", effort: "Optional", optional: true },
  { id: "pass3", emoji: "⚙️", title: "Connections & Security", subtitle: "Link accounts, choose your setup, and lock the app down.", effort: "Optional", optional: true },
  { id: "done", emoji: "🎉", title: "All Set!", subtitle: "" },
];
const TOTAL = PAGES.length;

function ProgressBar({ step }: { step: number }) {
  return (
    <div style={{ display: "flex", gap: 5, marginBottom: 10 }} aria-hidden="true">
      {PAGES.map((_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: i === step ? 5 : 4,
            borderRadius: 999,
            background: i < step ? T.accent.primary : i === step ? T.accent.primarySoft : T.bg.surface,
            transition: "background .35s",
          }}
        />
      ))}
    </div>
  );
}

function StepHeader({ step }: { step: number }) {
  const page = PAGES[step];
  if (!page || step === TOTAL - 1) return null;
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>{page.emoji}</span>
          <div>
            <div style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono }}>
              Step {step + 1} of {TOTAL}
            </div>
            {page.optional && <div style={{ fontSize: 11, color: T.text.dim, marginTop: 2 }}>Optional now. Easy to refine later.</div>}
          </div>
        </div>
        {page.effort && (
          <div
            style={{
              flexShrink: 0,
              padding: "6px 10px",
              borderRadius: 999,
              background: page.optional ? T.accent.primaryDim : `${T.accent.emerald}12`,
              border: `1px solid ${page.optional ? T.accent.primarySoft : `${T.accent.emerald}26`}`,
              color: page.optional ? T.accent.primary : T.accent.emerald,
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontFamily: T.font.mono,
            }}
          >
            {page.effort}
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 900, color: T.text.primary, lineHeight: 1.1, letterSpacing: "-0.03em" }}>{page.title}</div>
        {page.subtitle && <div style={{ fontSize: 13, color: T.text.dim, lineHeight: 1.55, maxWidth: 360 }}>{page.subtitle}</div>}
      </div>
    </div>
  );
}

export default function SetupWizard() {
  const { setAppleLinkedId, appleLinkedId, setRequireAuth, setAppPasscode, setUseFaceId, setIsLocked, setLockTimeout } =
    useSecurity() as SecurityContextValue;
  const { setOnboardingComplete, navTo } = useNavigation() as NavigationContextValue;
  const { themeMode, setThemeMode, setFinancialConfig } = useSettings();
  const [userIsPro, setUserIsPro] = useState<boolean>(false);
  const toast = useToast() as ToastApi;

  const {
    isPortfolioReady,
    setCards: setContextCards,
    setBankAccounts: setContextBankAccounts,
    setRenewals: setContextRenewals,
  } = usePortfolio();

  const [step, setStep] = useState<number>(0);
  const [saving, setSaving] = useState<boolean>(false);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const prefersReducedMotion =
    typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const [income, setIncome] = useState<SetupWizardIncomeState>({
    payFrequency: "bi-weekly",
    payday: "Friday",
    incomeType: "salary",
    hourlyRateNet: "",
    typicalHours: "",
    averagePaycheck: "",
    paycheckStandard: "",
    paycheckFirstOfMonth: "",
    isContractor: false,
    taxBracketPercent: "",
    paycheckDepositAccount: "checking",
    currencyCode: "USD",
    stateCode: "",
    birthYear: "",
    housingType: "",
    monthlyRent: "",
    mortgagePayment: "",
  });
  const [spending, setSpending] = useState<SetupWizardSpendingState>({
    weeklySpendAllowance: "",
    emergencyFloor: "",
    checkingBuffer: "",
    greenStatusTarget: "",
    emergencyReserveTarget: "",
    defaultAPR: "24.99",
    trackRothContributions: false,
    rothAnnualLimit: "",
    track401k: false,
    k401AnnualLimit: "",
    k401EmployerMatchPct: "",
    k401EmployerMatchLimit: "",
    trackHSA: false,
    trackCrypto: false,
  });
  const [ai, setAi] = useState<SetupWizardAiState>({
    aiProvider: "backend",
    aiModel: getPreferredModelForTier("free"),
    apiKey: "",
  });
  const [security, setSecurity] = useState<SetupWizardSecurityState>({
    pinEnabled: false,
    pin: "",
    lockTimeout: 0,
    useFaceId: false,
  });
  const hasPremiumAiAccess = userIsPro || !shouldShowGating();

  const hydrateWizardFromStorage = useCallback(
    async (options: { syncContexts?: boolean } = {}): Promise<void> => {
      const [
        config,
        prov,
        mod,
        storedBankAccounts,
        storedCards,
        storedRenewals,
        storedBackupInterval,
      ] = await Promise.all([
        db.get("financial-config"),
        db.get("ai-provider"),
        db.get("ai-model"),
        db.get("bank-accounts"),
        db.get("card-portfolio"),
        db.get("renewals"),
        db.get("auto-backup-interval"),
      ]);

      const typedConfig = (config || null) as CatalystCashConfig | null;
      const nextBankAccounts = Array.isArray(storedBankAccounts) ? (storedBankAccounts as BankAccount[]) : [];
      const nextCards = Array.isArray(storedCards) ? (storedCards as Card[]) : [];
      const nextRenewals = Array.isArray(storedRenewals) ? (storedRenewals as Renewal[]) : [];

      if (typedConfig) {
        setIncome((prev) => ({
          ...prev,
          payFrequency: typedConfig.payFrequency ?? prev.payFrequency,
          payday: typedConfig.payday ?? prev.payday,
          incomeType: typedConfig.incomeType ?? prev.incomeType,
          hourlyRateNet: String(typedConfig.hourlyRateNet ?? prev.hourlyRateNet),
          typicalHours: String(typedConfig.typicalHours ?? prev.typicalHours),
          averagePaycheck: String(typedConfig.averagePaycheck ?? prev.averagePaycheck),
          paycheckStandard: String(typedConfig.paycheckStandard ?? prev.paycheckStandard),
          paycheckFirstOfMonth: String(typedConfig.paycheckFirstOfMonth ?? prev.paycheckFirstOfMonth),
          isContractor: typedConfig.isContractor ?? prev.isContractor,
          taxBracketPercent: String(typedConfig.taxBracketPercent ?? prev.taxBracketPercent),
          paycheckDepositAccount: typedConfig.paycheckDepositAccount ?? prev.paycheckDepositAccount,
          currencyCode: typedConfig.currencyCode ?? prev.currencyCode,
          stateCode: typedConfig.stateCode ?? prev.stateCode,
          birthYear: typedConfig.birthYear != null ? String(typedConfig.birthYear) : prev.birthYear,
          housingType: typedConfig.housingType ?? prev.housingType,
          monthlyRent: String(typedConfig.monthlyRent ?? prev.monthlyRent),
          mortgagePayment: String(typedConfig.mortgagePayment ?? prev.mortgagePayment),
        }));
        setSpending((prev) => ({
          ...prev,
          weeklySpendAllowance: String(typedConfig.weeklySpendAllowance ?? prev.weeklySpendAllowance),
          emergencyFloor: String(typedConfig.emergencyFloor ?? prev.emergencyFloor),
          checkingBuffer: String(typedConfig.checkingBuffer ?? prev.checkingBuffer),
          greenStatusTarget: String(typedConfig.greenStatusTarget ?? prev.greenStatusTarget),
          emergencyReserveTarget: String(typedConfig.emergencyReserveTarget ?? prev.emergencyReserveTarget),
          defaultAPR: String(typedConfig.defaultAPR ?? prev.defaultAPR),
          trackRothContributions: typedConfig.trackRothContributions ?? prev.trackRothContributions,
          rothAnnualLimit: String(typedConfig.rothAnnualLimit ?? prev.rothAnnualLimit),
          track401k: typedConfig.track401k ?? prev.track401k,
          k401AnnualLimit: String(typedConfig.k401AnnualLimit ?? prev.k401AnnualLimit),
          k401EmployerMatchPct: String(typedConfig.k401EmployerMatchPct ?? prev.k401EmployerMatchPct),
          k401EmployerMatchLimit: String(typedConfig.k401EmployerMatchLimit ?? prev.k401EmployerMatchLimit),
          trackHSA: typedConfig.trackHSA ?? prev.trackHSA,
          trackCrypto: typedConfig.trackCrypto ?? prev.trackCrypto,
        }));
        if (options.syncContexts) {
          setFinancialConfig(typedConfig);
        }
      }

      setBankAccounts(nextBankAccounts);
      setCards(nextCards);
      setRenewals(nextRenewals);
      if (typeof storedBackupInterval === "string") {
        setSecurity((prev) => ({
          ...prev,
          autoBackupInterval: storedBackupInterval as NonNullable<SetupWizardSecurityState["autoBackupInterval"]>,
        }));
      }

      if (options.syncContexts) {
        setContextBankAccounts(nextBankAccounts);
        setContextCards(nextCards);
        setContextRenewals(nextRenewals);
      }

      const tierId = userIsPro ? "pro" : "free";
      setAi((prev) => ({
        ...prev,
        aiProvider: (prov as string | null) ?? prev.aiProvider,
        aiModel: normalizeModelForTier(tierId, (mod as string | null) ?? prev.aiModel, (prov as string | null) ?? prev.aiProvider),
      }));
    },
    [setContextBankAccounts, setContextCards, setContextRenewals, setFinancialConfig, userIsPro]
  );

  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [step]);

  useEffect(() => {
    void getRawTier()
      .then(tier => setUserIsPro(tier.id === "pro"))
      .catch(() => setUserIsPro(false));
  }, []);

  useEffect(() => {
    if (!isPortfolioReady) return;
    void hydrateWizardFromStorage();
  }, [hydrateWizardFromStorage, isPortfolioReady]);

  const updateIncome: SetupWizardUpdate<SetupWizardIncomeState> = (key, value) =>
    setIncome((prev) => ({ ...prev, [key]: value }));
  const updateSpending: SetupWizardUpdate<SetupWizardSpendingState> = (key, value) =>
    setSpending((prev) => ({ ...prev, [key]: value }));
  const updateAi: SetupWizardUpdate<SetupWizardAiState> = (key, value) =>
    setAi((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "aiProvider") {
        next.aiModel = normalizeModelForTier(userIsPro ? "pro" : "free", null, String(value || "backend"));
      }
      return next;
    });
  const updateSecurity: SetupWizardUpdate<SetupWizardSecurityState> = (key, value) =>
    setSecurity((prev) => ({ ...prev, [key]: value }));

  const next = (): void => setStep((current) => Math.min(current + 1, TOTAL - 1));
  const back = (): void => setStep((current) => Math.max(current - 1, 0));
  const skip = (): void => next();

  const skipToDashboard = async (): Promise<void> => {
    setSaving(true);
    try {
      await db.set("ai-provider", ai.aiProvider);
      await db.set("ai-model", ai.aiModel);
      await db.set("onboarding-complete", true);
      setOnboardingComplete(true);
      setIsLocked?.(false);
      navTo?.("dashboard");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "unknown error";
      toast.error?.("Save failed: " + message);
    }
    setSaving(false);
  };

  const saveAndFinish = async (): Promise<void> => {
    setSaving(true);
    try {
      const existing = ((await db.get("financial-config")) || {}) as Partial<CatalystCashConfig> & Record<string, unknown>;
      const payload: Partial<CatalystCashConfig> = {
        payFrequency: income.payFrequency,
        payday: income.payday,
        incomeType: income.incomeType || "salary",
        hourlyRateNet: parseFloat(income.hourlyRateNet) || Number(existing.hourlyRateNet) || 0,
        typicalHours: parseFloat(income.typicalHours) || Number(existing.typicalHours) || 0,
        averagePaycheck: parseFloat(income.averagePaycheck) || Number(existing.averagePaycheck) || 0,
        paycheckStandard: parseFloat(income.paycheckStandard) || Number(existing.paycheckStandard) || 0,
        paycheckFirstOfMonth: parseFloat(income.paycheckFirstOfMonth) || Number(existing.paycheckFirstOfMonth) || 0,
        paycheckDepositAccount: income.paycheckDepositAccount || existing.paycheckDepositAccount || "checking",
        isContractor: income.isContractor,
        taxBracketPercent: parseFloat(income.taxBracketPercent) || Number(existing.taxBracketPercent) || 0,
        currencyCode: income.currencyCode || existing.currencyCode || "USD",
        stateCode: income.stateCode || existing.stateCode || "",
        birthYear: income.birthYear ? Number(income.birthYear) : (existing.birthYear ?? null),
        housingType: income.housingType || existing.housingType || "",
        monthlyRent: parseFloat(income.monthlyRent) || Number(existing.monthlyRent) || 0,
        mortgagePayment: parseFloat(income.mortgagePayment) || Number(existing.mortgagePayment) || 0,
        weeklySpendAllowance: parseFloat(spending.weeklySpendAllowance) || Number(existing.weeklySpendAllowance) || 0,
        emergencyFloor: parseFloat(spending.emergencyFloor) || Number(existing.emergencyFloor) || 0,
        checkingBuffer: parseFloat(spending.checkingBuffer) || Number(existing.checkingBuffer) || 0,
        greenStatusTarget: parseFloat(spending.greenStatusTarget) || Number(existing.greenStatusTarget) || 0,
        emergencyReserveTarget: parseFloat(spending.emergencyReserveTarget) || Number(existing.emergencyReserveTarget) || 0,
        defaultAPR: parseFloat(spending.defaultAPR) || Number(existing.defaultAPR) || 24.99,
        trackRothContributions: spending.trackRothContributions,
        rothAnnualLimit: parseFloat(spending.rothAnnualLimit) || Number(existing.rothAnnualLimit) || 0,
        track401k: spending.track401k,
        k401AnnualLimit: parseFloat(spending.k401AnnualLimit) || Number(existing.k401AnnualLimit) || 0,
        k401EmployerMatchPct: parseFloat(spending.k401EmployerMatchPct) || Number(existing.k401EmployerMatchPct) || 0,
        k401EmployerMatchLimit: parseFloat(spending.k401EmployerMatchLimit) || Number(existing.k401EmployerMatchLimit) || 0,
        trackHSA: spending.trackHSA,
        trackCrypto: spending.trackCrypto !== false,
      };
      const merged = { ...existing, ...payload, _fromSetupWizard: true };
      await db.set("financial-config", merged);
      setActiveCurrencyCode(merged.currencyCode || "USD");

      if (bankAccounts.length > 0) {
        setContextBankAccounts(bankAccounts);
        await db.set("bank-accounts", bankAccounts);
      }
      if (cards.length > 0) {
        setContextCards(cards);
        await db.set("card-portfolio", cards);
      }
      if (renewals.length > 0) {
        setContextRenewals(renewals);
        await db.set("renewals", renewals);
      }

      await db.set("ai-provider", ai.aiProvider);
      await db.set("ai-model", ai.aiModel);
      if (ai.apiKey.trim()) {
        const provider = typedProviders.find((item) => item.id === ai.aiProvider);
        if (provider?.keyStorageKey) {
          const saved = await setSecureItem(provider.keyStorageKey, ai.apiKey.trim());
          if (!saved) {
            toast.error?.("Secure storage is unavailable. API key was not saved.");
          }
        }
      }

      if (security.pinEnabled && security.pin.length >= 4) {
        const storageStatus = await getSecretStorageStatus();
        const savedPasscode = await setSecureItem("app-passcode", security.pin);
        if (savedPasscode) {
          await db.set("require-auth", true);
          if (security.useFaceId) await db.set("use-face-id", true);
          setAppPasscode?.(security.pin);
          setRequireAuth?.(true);
          setUseFaceId?.(Boolean(security.useFaceId));
        } else if (storageStatus.mode === "native-unavailable") {
          await Promise.all([db.set("require-auth", false), db.set("use-face-id", false)]);
          toast.error?.("Secure storage is unavailable. App Lock was not enabled on this device.");
        } else if (storageStatus.mode === "web-limited") {
          await Promise.all([db.set("require-auth", false), db.set("use-face-id", false)]);
          toast.error?.("App Lock is available in the native iPhone app only. Setup continued without a PIN.");
        }
      }
      await db.set("lock-timeout", security.lockTimeout);
      setLockTimeout?.(security.lockTimeout);
      if (security.autoBackupInterval) {
        await db.set("auto-backup-interval", security.autoBackupInterval);
      }
      await db.set("onboarding-complete", true);
      setOnboardingComplete(true);
      setIsLocked?.(false);
      next();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "unknown error";
      toast.error?.("Save failed: " + message);
    }
    setSaving(false);
  };

  const handleSecurityNext = (): void => {
    void saveAndFinish();
  };

  const handleSecuritySkip = async (): Promise<void> => {
    setSaving(true);
    try {
      await db.set("lock-timeout", security.lockTimeout);
      setLockTimeout?.(security.lockTimeout);
      await db.set("onboarding-complete", true);
      setOnboardingComplete(true);
      setIsLocked?.(false);
      next();
    } catch {
      // ignore
    }
    setSaving(false);
  };

  const handleFinish = (): void => {
    void db.set("onboarding-complete", true);
    setOnboardingComplete(true);
    setIsLocked?.(false);
    navTo?.("dashboard");
  };

  const pageId = PAGES[step]?.id;
  if (!pageId) return null;

  const combinedData: SetupWizardCombinedData = { ...income, ...spending };
  const handleCombinedChange = <K extends keyof SetupWizardCombinedData>(key: K, value: SetupWizardCombinedData[K]): void => {
    if (key in income) {
      updateIncome(key as keyof SetupWizardIncomeState, value as SetupWizardIncomeState[keyof SetupWizardIncomeState]);
    } else {
      updateSpending(key as keyof SetupWizardSpendingState, value as SetupWizardSpendingState[keyof SetupWizardSpendingState]);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: T.bg.base,
        display: "flex",
        flexDirection: "column",
        fontFamily: T.font.sans,
        overflow: "hidden",
        transition: "opacity 0.3s ease-in-out",
        opacity: 1,
      }}
    >
      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: "auto", padding: "calc(env(safe-area-inset-top, 24px) + 12px) 20px 48px" }}
      >
        <style>{`
          @keyframes slideFadeIn {
            from { opacity: 0; transform: translateY(20px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          .wiz-input { transition: border-color 0.2s ease, box-shadow 0.2s ease; }
          .wiz-input:focus { border-color: ${T.accent.primary} !important; box-shadow: 0 0 0 3px ${T.accent.primary}30 !important; }
          .wiz-btn:focus-visible,
          .wiz-switch:focus-visible,
          .wiz-tap:focus-visible {
            outline: none;
            box-shadow: 0 0 0 3px ${T.accent.primary}30 !important;
          }
          @media (prefers-reduced-motion: reduce) {
            .wiz-page-enter {
              animation: none !important;
            }
          }
        `}</style>
        <div style={{ maxWidth: 420, margin: "0 auto" }}>
          <div
            style={{
              marginBottom: 18,
              padding: "12px 14px",
              borderRadius: T.radius.lg,
              background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.elevated})`,
              border: `1px solid ${T.border.subtle}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: T.text.secondary, fontSize: 11, fontWeight: 700 }}>
                <span style={{ color: T.accent.emerald }}>●</span>
                About 2 minutes
              </div>
              <div style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono }}>
                Clear setup. Better first audit.
              </div>
            </div>
            <ProgressBar step={step} />
          </div>
          <StepHeader step={step} />
          <div
            key={pageId}
            className="wiz-page-enter"
            style={{ animation: prefersReducedMotion ? "none" : "slideFadeIn 0.26s cubic-bezier(0.2, 0.8, 0.2, 1) forwards" }}
          >
            {pageId === "welcome" && <PageWelcome onNext={next} />}
            {pageId === "import" && (
              <PageImport
                onNext={next}
                toast={toast}
                onComplete={skipToDashboard}
                onImported={() => hydrateWizardFromStorage({ syncContexts: true })}
                appleLinkedId={appleLinkedId ?? null}
                setAppleLinkedId={setAppleLinkedId}
                security={security}
                updateSecurity={updateSecurity}
              />
            )}
            {pageId === "profile" && <PageProfile data={combinedData} onChange={handleCombinedChange} onNext={next} onBack={back} />}
            {pageId === "pass1" && <PagePass1 data={combinedData} onChange={handleCombinedChange} onNext={next} onBack={back} onSkip={skip} />}
            {pageId === "pass2" && <PagePass2 data={combinedData} onChange={handleCombinedChange} onNext={next} onBack={back} onSkip={skip} />}
            {pageId === "pass3" && (
              <PagePass3
                ai={ai}
                security={security}
                spending={spending}
                updateAi={updateAi}
                updateSecurity={updateSecurity}
                updateSpending={updateSpending}
                themeMode={themeMode as ThemeMode}
                setThemeMode={setThemeMode}
                onNext={handleSecurityNext}
                onBack={back}
                onSkip={handleSecuritySkip}
                saving={saving}
                isPro={hasPremiumAiAccess}
              />
            )}
            {pageId === "done" && <PageDone onFinish={handleFinish} />}
          </div>
        </div>
      </div>
      <div style={{ height: "env(safe-area-inset-bottom, 16px)", flexShrink: 0 }} />
    </div>
  );
}
