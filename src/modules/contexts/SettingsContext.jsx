import React, { createContext, useContext, useState, useEffect, useReducer, useCallback } from 'react';
import { db } from '../utils.js';
import { applyTheme } from '../constants.js';
import { DEFAULT_PROVIDER_ID, DEFAULT_MODEL_ID, getProvider, getModel } from "../providers.js";
import { schedulePaydayReminder, cancelPaydayReminder, requestNotificationPermission } from "../notifications.js";

const SettingsContext = createContext(null);

// ═══════════════════════════════════════════════════════════════
// FINANCIAL CONFIG REDUCER — typed actions for 50+ field state
// ═══════════════════════════════════════════════════════════════
export const DEFAULT_FINANCIAL_CONFIG = {
    payday: "Friday",
    paycheckTime: "06:00",
    paycheckStandard: 0.00,
    paycheckFirstOfMonth: 0.00,
    payFrequency: "bi-weekly",
    weeklySpendAllowance: 0.00,
    emergencyFloor: 0.00,
    checkingBuffer: 0.00,
    heavyHorizonStart: 15,
    heavyHorizonEnd: 45,
    heavyHorizonThreshold: 0.00,
    greenStatusTarget: 0.00,
    emergencyReserveTarget: 0.00,
    habitName: "Coffee Pods",
    habitRestockCost: 25,
    habitCheckThreshold: 6,
    habitCriticalThreshold: 3,
    trackHabits: false,
    defaultAPR: 24.99,
    arbitrageTargetAPR: 6.00,
    fireExpectedReturnPct: 7.00,
    fireInflationPct: 2.50,
    fireSafeWithdrawalPct: 4.00,
    investmentBrokerage: 0.00,
    investmentRoth: 0.00,
    investmentsAsOfDate: "",
    trackRothContributions: false,
    rothContributedYTD: 0.00,
    rothAnnualLimit: 0.00,
    autoTrackRothYTD: true,
    track401k: false,
    k401Balance: 0.00,
    k401ContributedYTD: 0.00,
    k401AnnualLimit: 0.00,
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
    otherAssets: 0,
    otherAssetsLabel: "",
    insuranceDeductibles: [],
    bigTicketItems: []
};

function financialConfigReducer(state, action) {
    switch (action.type) {
        case 'SET_FIELD':
            return { ...state, [action.field]: action.value };
        case 'MERGE':
            return { ...state, ...action.payload };
        case 'REPLACE':
            return { ...action.payload };
        case 'RESET_YTD':
            return { ...state, rothContributedYTD: 0, k401ContributedYTD: 0 };
        default:
            return state;
    }
}

export function SettingsProvider({ children }) {
    const [apiKey, setApiKey] = useState("");
    const [aiProvider, setAiProvider] = useState(DEFAULT_PROVIDER_ID);
    const [aiModel, setAiModel] = useState(DEFAULT_MODEL_ID);
    const [persona, setPersona] = useState(null);
    const [personalRules, setPersonalRules] = useState("");
    const [autoBackupInterval, setAutoBackupInterval] = useState("weekly");
    const [notifPermission, setNotifPermission] = useState("prompt");
    const [aiConsent, setAiConsent] = useState(false);
    const [showAiConsent, setShowAiConsent] = useState(false);
    const [themeMode, setThemeModeRaw] = useState("dark"); // "system" | "light" | "dark"
    const [themeTick, forceRender] = useState(0);
    const [financialConfig, dispatchFinConfig] = useReducer(financialConfigReducer, DEFAULT_FINANCIAL_CONFIG);

    // Backward-compatible wrapper: accepts either a new state object, a function updater, or dispatch action
    const setFinancialConfig = useCallback((valueOrFn) => {
        if (typeof valueOrFn === 'function') {
            // Functional updater pattern: setFinancialConfig(prev => ({ ...prev, field: val }))
            // We bridge this by reading current state via a MERGE dispatch
            dispatchFinConfig({ type: 'REPLACE', payload: valueOrFn(financialConfig) });
        } else if (valueOrFn?.type) {
            // Direct dispatch: setFinancialConfig({ type: 'SET_FIELD', field: 'payday', value: 'Monday' })
            dispatchFinConfig(valueOrFn);
        } else {
            // Object merge: setFinancialConfig({ payday: 'Monday' })
            dispatchFinConfig({ type: 'MERGE', payload: valueOrFn });
        }
    }, [financialConfig]);

    const [isSettingsReady, setIsSettingsReady] = useState(false);

    useEffect(() => {
        const initSettings = async () => {
            // Notification permissions natively on launch
            const notifGranted = await requestNotificationPermission().catch(() => false);
            setNotifPermission(notifGranted ? "granted" : "denied");

            const [legacyKey, provId, modId, finConf, pr, consent, savedPersona, backupInterval, savedTheme] = await Promise.all([
                db.get("api-key"),
                db.get("ai-provider"),
                db.get("ai-model"),
                db.get("financial-config"),
                db.get("personal-rules"),
                db.get("ai-consent-accepted"),
                db.get("ai-persona"),
                db.get("auto-backup-interval"),
                db.get("theme-mode")
            ]);

            const validProvider = getProvider(provId || DEFAULT_PROVIDER_ID);
            const validModel = getModel(validProvider.id, modId || DEFAULT_MODEL_ID);
            setAiProvider(validProvider.id);
            setAiModel(validModel.id);

            const provConfig = validProvider;
            const provKey = provConfig.keyStorageKey ? await db.get(provConfig.keyStorageKey) : null;

            if (provKey) {
                setApiKey(provKey);
            } else if (legacyKey) {
                setApiKey(legacyKey);
                db.set("api-key-openai", legacyKey);
            }

            if (pr) setPersonalRules(pr);
            if (consent) setAiConsent(true);
            if (savedPersona) setPersona(savedPersona);
            if (backupInterval) setAutoBackupInterval(backupInterval);

            // Apply saved theme
            const resolvedTheme = savedTheme || "dark";
            setThemeModeRaw(resolvedTheme);
            const effectiveMode = resolvedTheme === "system"
                ? (window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark")
                : resolvedTheme;
            applyTheme(effectiveMode);

            if (finConf) {
                const merged = { ...DEFAULT_FINANCIAL_CONFIG, ...finConf };
                const currentYear = new Date().getFullYear();
                const lastResetYear = await db.get("ytd-reset-year");

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

                dispatchFinConfig({ type: 'REPLACE', payload: merged });
            }

            setIsSettingsReady(true);
        };

        initSettings();
    }, []);

    // Sync state to DB on change
    useEffect(() => { if (isSettingsReady) db.set("ai-provider", aiProvider); }, [aiProvider, isSettingsReady]);
    useEffect(() => { if (isSettingsReady) db.set("ai-model", aiModel); }, [aiModel, isSettingsReady]);
    useEffect(() => { if (isSettingsReady) db.set("financial-config", financialConfig); }, [financialConfig, isSettingsReady]);
    useEffect(() => { if (isSettingsReady) db.set("personal-rules", personalRules); }, [personalRules, isSettingsReady]);
    useEffect(() => { if (isSettingsReady) db.set("ai-consent-accepted", aiConsent); }, [aiConsent, isSettingsReady]);
    useEffect(() => { if (isSettingsReady) db.set("ai-persona", persona); }, [persona, isSettingsReady]);
    useEffect(() => { if (isSettingsReady) db.set("theme-mode", themeMode); }, [themeMode, isSettingsReady]);

    // Theme mode setter: apply tokens + persist + force re-render
    const setThemeMode = useCallback((mode) => {
        setThemeModeRaw(mode);
        const effective = mode === "system"
            ? (window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark")
            : mode;
        applyTheme(effective);
        forceRender(n => n + 1);
        db.set("theme-mode", mode);
    }, []);

    // Listen for system color-scheme changes when in "system" mode
    useEffect(() => {
        if (themeMode !== "system") return;
        const mq = window.matchMedia?.("(prefers-color-scheme: light)");
        if (!mq) return;
        const handler = (e) => {
            applyTheme(e.matches ? "light" : "dark");
            forceRender(n => n + 1);
        };
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, [themeMode]);

    // Payday Reminder hook mapping
    useEffect(() => {
        if (!isSettingsReady || !financialConfig.payday) return;
        if (financialConfig.paydayReminderEnabled !== false) {
            schedulePaydayReminder(financialConfig.payday, financialConfig.paycheckTime).catch(() => { });
        } else {
            cancelPaydayReminder().catch(() => { });
        }
    }, [isSettingsReady, financialConfig.paydayReminderEnabled, financialConfig.payday, financialConfig.paycheckTime]);

    const value = {
        apiKey, setApiKey,
        aiProvider, setAiProvider,
        aiModel, setAiModel,
        persona, setPersona,
        personalRules, setPersonalRules,
        autoBackupInterval, setAutoBackupInterval,
        notifPermission, setNotifPermission,
        aiConsent, setAiConsent,
        showAiConsent, setShowAiConsent,
        themeMode, setThemeMode, themeTick,
        financialConfig, setFinancialConfig,
        isSettingsReady
    };

    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    );
}

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (!context) throw new Error("useSettings must be used within a SettingsProvider");
    return context;
};
