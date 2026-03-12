import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useReducer,
  useCallback,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { db } from "../utils.js";
import { applyTheme } from "../constants.js";
import { DEFAULT_PROVIDER_ID, DEFAULT_MODEL_ID, getProvider, getModel } from "../providers.js";
import { schedulePaydayReminder, cancelPaydayReminder, getNotificationPermission } from "../notifications.js";
import { migrateToSecureItem } from "../secureStore.js";
import { setActiveCurrencyCode } from "../currency.js";
import type { CatalystCashConfig } from "../../types/index.js";

interface ProviderConfig {
  id: string;
  keyStorageKey?: string | null;
}

interface ModelConfig {
  id: string;
}

export type PersonaMode = "coach" | "friend" | "nerd" | null;
export type BackupInterval = "off" | "daily" | "weekly" | "monthly";
export type NotificationPermissionState = "granted" | "denied" | "prompt";
export type ThemeMode = "system" | "light" | "dark";

interface SettingsProviderProps {
  children: ReactNode;
}

type SetFieldAction = {
  [K in keyof CatalystCashConfig]: {
    type: "SET_FIELD";
    field: K;
    value: CatalystCashConfig[K];
  };
}[keyof CatalystCashConfig];

interface MergeFinancialConfigAction {
  type: "MERGE";
  payload: Partial<CatalystCashConfig>;
}

interface ReplaceFinancialConfigAction {
  type: "REPLACE";
  payload: CatalystCashConfig;
}

interface FunctionalUpdateFinancialConfigAction {
  type: "FUNCTIONAL_UPDATE";
  updater: (state: CatalystCashConfig) => CatalystCashConfig;
}

interface ResetYtdFinancialConfigAction {
  type: "RESET_YTD";
}

export type FinancialConfigAction =
  | SetFieldAction
  | MergeFinancialConfigAction
  | ReplaceFinancialConfigAction
  | FunctionalUpdateFinancialConfigAction
  | ResetYtdFinancialConfigAction;

export type SetFinancialConfigArg =
  | FinancialConfigAction
  | Partial<CatalystCashConfig>
  | ((prev: CatalystCashConfig) => CatalystCashConfig);

export type SetFinancialConfig = (valueOrFn: SetFinancialConfigArg) => void;

export interface SettingsContextValue {
  apiKey: string;
  setApiKey: Dispatch<SetStateAction<string>>;
  aiProvider: string;
  setAiProvider: Dispatch<SetStateAction<string>>;
  aiModel: string;
  setAiModel: Dispatch<SetStateAction<string>>;
  persona: PersonaMode;
  setPersona: Dispatch<SetStateAction<PersonaMode>>;
  personalRules: string;
  setPersonalRules: Dispatch<SetStateAction<string>>;
  autoBackupInterval: BackupInterval;
  setAutoBackupInterval: Dispatch<SetStateAction<BackupInterval>>;
  notifPermission: NotificationPermissionState;
  setNotifPermission: Dispatch<SetStateAction<NotificationPermissionState>>;
  aiConsent: boolean;
  setAiConsent: Dispatch<SetStateAction<boolean>>;
  showAiConsent: boolean;
  setShowAiConsent: Dispatch<SetStateAction<boolean>>;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  themeTick: number;
  financialConfig: CatalystCashConfig;
  setFinancialConfig: SetFinancialConfig;
  isSettingsReady: boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export const DEFAULT_FINANCIAL_CONFIG: CatalystCashConfig = {
  payday: "Friday",
  paycheckTime: "06:00",
  paycheckStandard: 0.0,
  paycheckFirstOfMonth: 0.0,
  payFrequency: "bi-weekly",
  weeklySpendAllowance: 0.0,
  emergencyFloor: 0.0,
  checkingBuffer: 0.0,
  heavyHorizonStart: 15,
  heavyHorizonEnd: 45,
  heavyHorizonThreshold: 0.0,
  greenStatusTarget: 0.0,
  emergencyReserveTarget: 0.0,
  habitName: "Coffee Pods",
  habitRestockCost: 25,
  habitCheckThreshold: 6,
  habitCriticalThreshold: 3,
  trackHabits: false,
  defaultAPR: 24.99,
  arbitrageTargetAPR: 6.0,
  fireExpectedReturnPct: 7.0,
  fireInflationPct: 2.5,
  fireSafeWithdrawalPct: 4.0,
  investmentBrokerage: 0.0,
  investmentRoth: 0.0,
  investmentsAsOfDate: "",
  trackRothContributions: false,
  rothContributedYTD: 0.0,
  rothAnnualLimit: 0.0,
  autoTrackRothYTD: true,
  track401k: false,
  k401Balance: 0.0,
  k401ContributedYTD: 0.0,
  k401AnnualLimit: 0.0,
  autoTrack401kYTD: true,
  k401EmployerMatchPct: 0,
  k401EmployerMatchLimit: 0,
  k401VestingPct: 100,
  k401StockPct: 90,
  overrideBrokerageValue: false,
  overrideRothValue: false,
  override401kValue: false,
  trackHSA: false,
  hsaBalance: 0,
  hsaContributedYTD: 0,
  hsaAnnualLimit: 4300,
  overrideHSAValue: false,
  paydayReminderEnabled: true,
  trackBrokerage: false,
  trackRoth: false,
  brokerageStockPct: 90,
  rothStockPct: 90,
  budgetCategories: [],
  savingsGoals: [],
  nonCardDebts: [],
  incomeSources: [],
  creditScore: null,
  creditScoreDate: "",
  creditUtilization: null,
  taxWithholdingRate: 0,
  quarterlyTaxEstimate: 0,
  isContractor: false,
  homeEquity: 0,
  vehicleValue: 0,
  otherAssets: [],
  otherAssetsLabel: "",
  insuranceDeductibles: [],
  bigTicketItems: [],
  plaidInvestments: [],
  currencyCode: "USD",
  stateCode: "",
  birthYear: null,
  housingType: "",
  monthlyRent: 0,
  mortgagePayment: 0,
  customValuations: {},
};

function financialConfigReducer(state: CatalystCashConfig, action: FinancialConfigAction): CatalystCashConfig {
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };
    case "MERGE":
      return { ...state, ...action.payload };
    case "REPLACE":
      return { ...action.payload };
    case "FUNCTIONAL_UPDATE":
      return action.updater(state);
    case "RESET_YTD":
      return { ...state, rothContributedYTD: 0, k401ContributedYTD: 0 };
    default:
      return state;
  }
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const [apiKey, setApiKey] = useState<string>("");
  const [aiProvider, setAiProvider] = useState<string>(DEFAULT_PROVIDER_ID);
  const [aiModel, setAiModel] = useState<string>(DEFAULT_MODEL_ID);
  const [persona, setPersona] = useState<PersonaMode>(null);
  const [personalRules, setPersonalRules] = useState<string>("");
  const [autoBackupInterval, setAutoBackupInterval] = useState<BackupInterval>("weekly");
  const [notifPermission, setNotifPermission] = useState<NotificationPermissionState>("prompt");
  const [aiConsent, setAiConsent] = useState<boolean>(false);
  const [showAiConsent, setShowAiConsent] = useState<boolean>(false);
  const [themeMode, setThemeModeRaw] = useState<ThemeMode>("dark");
  const [themeTick, forceRender] = useState<number>(0);
  const [financialConfig, dispatchFinConfig] = useReducer(financialConfigReducer, DEFAULT_FINANCIAL_CONFIG);

  const setFinancialConfig = useCallback<SetFinancialConfig>((valueOrFn) => {
    if (typeof valueOrFn === "function") {
      dispatchFinConfig({ type: "FUNCTIONAL_UPDATE", updater: valueOrFn });
    } else if (valueOrFn && typeof valueOrFn === "object" && "type" in valueOrFn) {
      dispatchFinConfig(valueOrFn as FinancialConfigAction);
    } else {
      dispatchFinConfig({ type: "MERGE", payload: valueOrFn });
    }
  }, []);

  const [isSettingsReady, setIsSettingsReady] = useState<boolean>(false);

  useEffect(() => {
    const initSettings = async (): Promise<void> => {
      try {
        const notifPromise: Promise<boolean> = getNotificationPermission()
          .then((status: NotificationPermissionState) => status === "granted")
          .catch(() => false);

        const [
          legacyKey,
          provId,
          modId,
          finConf,
          personalRulesValue,
          consent,
          savedPersona,
          backupInterval,
          savedTheme,
          notifGranted,
        ] = (await Promise.all([
          db.get("api-key"),
          db.get("ai-provider"),
          db.get("ai-model"),
          db.get("financial-config"),
          db.get("personal-rules"),
          db.get("ai-consent-accepted"),
          db.get("ai-persona"),
          db.get("auto-backup-interval"),
          db.get("theme-mode"),
          notifPromise,
        ])) as [
          string | null,
          string | null,
          string | null,
          Partial<CatalystCashConfig> | null,
          string | null,
          boolean | null,
          PersonaMode,
          BackupInterval | null,
          ThemeMode | null,
          boolean,
        ];

        setNotifPermission(notifGranted ? "granted" : "denied");

        const validProvider = getProvider(provId || DEFAULT_PROVIDER_ID) as ProviderConfig;
        const validModel = getModel(validProvider.id, modId || DEFAULT_MODEL_ID) as ModelConfig;
        setAiProvider(validProvider.id);
        setAiModel(validModel.id);

        const provKey = validProvider.keyStorageKey
          ? ((await migrateToSecureItem(validProvider.keyStorageKey, legacyKey, () => db.del("api-key"))) as string | null)
          : null;

        if (provKey) {
          setApiKey(provKey);
        } else if (legacyKey) {
          setApiKey(legacyKey);
          await migrateToSecureItem("api-key-openai", legacyKey, () => db.del("api-key"));
        }

        if (personalRulesValue) setPersonalRules(personalRulesValue);
        if (consent) setAiConsent(true);
        if (savedPersona) setPersona(savedPersona);
        if (backupInterval) setAutoBackupInterval(backupInterval);

        const resolvedTheme: ThemeMode = savedTheme || "dark";
        setThemeModeRaw(resolvedTheme);
        const effectiveMode: Exclude<ThemeMode, "system"> =
          resolvedTheme === "system"
            ? (window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark")
            : resolvedTheme;
        applyTheme(effectiveMode);

        if (finConf) {
          const merged: CatalystCashConfig = { ...DEFAULT_FINANCIAL_CONFIG, ...finConf };
          const currentYear = new Date().getFullYear();
          const lastResetYear = (await db.get("ytd-reset-year")) as number | null;

          if (lastResetYear && lastResetYear < currentYear) {
            merged.rothContributedYTD = 0;
            merged.k401ContributedYTD = 0;
            db.set("ytd-reset-year", currentYear);
            db.set("financial-config", merged);
          } else if (!lastResetYear) {
            db.set("ytd-reset-year", currentYear);
          }

          if (merged.paydayReminderEnabled === undefined || merged.paydayReminderEnabled === null) {
            merged.paydayReminderEnabled = notifGranted;
          } else if (!notifGranted) {
            merged.paydayReminderEnabled = false;
          }

          dispatchFinConfig({ type: "REPLACE", payload: merged });
          setActiveCurrencyCode(merged.currencyCode || "USD");
        }
      } catch (error: unknown) {
        console.error("Settings init error:", error);
      } finally {
        setIsSettingsReady(true);
      }
    };

    void initSettings();
  }, []);

  useEffect(() => {
    if (isSettingsReady) db.set("ai-provider", aiProvider);
  }, [aiProvider, isSettingsReady]);

  useEffect(() => {
    if (isSettingsReady) db.set("ai-model", aiModel);
  }, [aiModel, isSettingsReady]);

  useEffect(() => {
    if (isSettingsReady) {
      db.set("financial-config", financialConfig);
      setActiveCurrencyCode(financialConfig.currencyCode || "USD");
    }
  }, [financialConfig, isSettingsReady]);

  useEffect(() => {
    if (isSettingsReady) db.set("personal-rules", personalRules);
  }, [personalRules, isSettingsReady]);

  useEffect(() => {
    if (isSettingsReady) db.set("ai-consent-accepted", aiConsent);
  }, [aiConsent, isSettingsReady]);

  useEffect(() => {
    if (isSettingsReady) db.set("ai-persona", persona);
  }, [persona, isSettingsReady]);

  useEffect(() => {
    if (isSettingsReady) db.set("theme-mode", themeMode);
  }, [themeMode, isSettingsReady]);

  const setThemeMode = useCallback((mode: ThemeMode): void => {
    setThemeModeRaw(mode);
    const effective: Exclude<ThemeMode, "system"> =
      mode === "system"
        ? (window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark")
        : mode;
    applyTheme(effective);
    forceRender((count: number) => count + 1);
    db.set("theme-mode", mode);
  }, []);

  useEffect(() => {
    if (themeMode !== "system") return;
    const mediaQuery = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!mediaQuery) return;
    const handler = (event: MediaQueryListEvent): void => {
      applyTheme(event.matches ? "light" : "dark");
      forceRender((count: number) => count + 1);
    };
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [themeMode]);

  useEffect(() => {
    if (!isSettingsReady || !financialConfig.payday) return;
    if (financialConfig.paydayReminderEnabled !== false) {
      schedulePaydayReminder(financialConfig.payday, financialConfig.paycheckTime).catch(() => {});
    } else {
      cancelPaydayReminder().catch(() => {});
    }
  }, [isSettingsReady, financialConfig.paydayReminderEnabled, financialConfig.payday, financialConfig.paycheckTime]);

  const value: SettingsContextValue = {
    apiKey,
    setApiKey,
    aiProvider,
    setAiProvider,
    aiModel,
    setAiModel,
    persona,
    setPersona,
    personalRules,
    setPersonalRules,
    autoBackupInterval,
    setAutoBackupInterval,
    notifPermission,
    setNotifPermission,
    aiConsent,
    setAiConsent,
    showAiConsent,
    setShowAiConsent,
    themeMode,
    setThemeMode,
    themeTick,
    financialConfig,
    setFinancialConfig,
    isSettingsReady,
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = (): SettingsContextValue => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used within a SettingsProvider");
  return context;
};
