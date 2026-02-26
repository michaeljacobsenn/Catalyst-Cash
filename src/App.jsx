import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import {
  History, Plus, RefreshCw, X, Eye, EyeOff,
  AlertTriangle, Loader2, CreditCard, Settings, Info, Home, Zap, Trash2, ClipboardPaste, LayoutDashboard
} from "lucide-react";
import { T, DEFAULT_CARD_PORTFOLIO, RENEWAL_CATEGORIES } from "./modules/constants.js";
import { DEFAULT_PROVIDER_ID, DEFAULT_MODEL_ID, getProvider, getModel } from "./modules/providers.js";
import { db, parseAudit, exportAllAudits, exportSelectedAudits, exportAuditCSV, advanceExpiredDate, cyrb53 } from "./modules/utils.js";
import { ensureCardIds, getCardLabel } from "./modules/cards.js";
import { loadCardCatalog } from "./modules/issuerCards.js";
import { GlobalStyles, Card, ErrorBoundary } from "./modules/ui.jsx";
import { StreamingView } from "./modules/components.jsx";
import { streamAudit, callAudit } from "./modules/api.js";
import { getSystemPrompt } from "./modules/prompts.js";
import { generateStrategy } from "./modules/engine.js";
import { buildScrubber } from "./modules/scrubber.js";
import { haptic } from "./modules/haptics.js";
import { schedulePaydayReminder, cancelPaydayReminder, requestNotificationPermission, scheduleWeeklyAuditNudge, scheduleBillReminders } from "./modules/notifications.js";
import { ToastProvider, useToast } from "./modules/Toast.jsx";
import DashboardTab from "./modules/tabs/DashboardTab.jsx";
import InputForm from "./modules/tabs/InputForm.jsx";
import ResultsView from "./modules/tabs/ResultsView.jsx";
import HistoryTab from "./modules/tabs/HistoryTab.jsx";
import SettingsTab from "./modules/tabs/SettingsTab.jsx";
import CardPortfolioTab from "./modules/tabs/CardPortfolioTab.jsx";
import RenewalsTab from "./modules/tabs/RenewalsTab.jsx";
import GuideModal from "./modules/tabs/GuideModal.jsx";
import LockScreen from "./modules/LockScreen.jsx";
import SetupWizard from "./modules/tabs/SetupWizard.jsx";
import { uploadToICloud } from "./modules/cloudSync.js";
import { isSecuritySensitiveKey } from "./modules/securityKeys.js";
import { evaluateBadges, unlockBadge, BADGE_DEFINITIONS } from "./modules/badges.js";

// Security-sensitive keys that must NEVER leave the device
const SECURITY_KEYS = new Set([
  "app-passcode", "require-auth", "use-face-id", "lock-timeout",
  "api-key", "api-key-openai", "api-key-gemini", "api-key-claude",   // API keys never leave the device
  "apple-linked-id"             // OAuth tokens never leave the device
]);

function flattenSeedRenewals() {
  const items = [];
  RENEWAL_CATEGORIES.forEach(cat => {
    cat.items.forEach(item => items.push({ ...item, category: cat.id }));
  });
  return items;
}

function useOnline() {
  const [o, setO] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  useEffect(() => {
    const on = () => setO(true), off = () => setO(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off) };
  }, []); return o;
}

// ═══════════════════════════════════════════════════════════════
// DATA MIGRATION — ensure historical audits have moveChecks
// ═══════════════════════════════════════════════════════════════
function migrateHistory(hist) {
  if (!hist?.length) return hist;
  let migrated = false;
  const result = hist.map(a => {
    if (!a.moveChecks) { migrated = true; return { ...a, moveChecks: {} }; }
    return a;
  });
  if (migrated) db.set("audit-history", result);
  return result;
}

// ═══════════════════════════════════════════════════════════════
// APP ROOT — wraps with ToastProvider
// ═══════════════════════════════════════════════════════════════
export default function AppRoot() {
  return <ToastProvider><CatalystCash /></ToastProvider>;
}

function CatalystCash() {
  const toast = useToast();
  const [tab, setTab] = useState("dashboard");

  // ═══════════════════════════════════════════════════════════════
  // PLUGIN INITIALIZATION
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    // Initialization now handled natively or at a lower level
  }, []);
  const [apiKey, setApiKey] = useState("");
  const [aiProvider, setAiProvider] = useState(DEFAULT_PROVIDER_ID);
  const [aiModel, setAiModel] = useState(DEFAULT_MODEL_ID);
  const [financialConfig, setFinancialConfig] = useState({
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
    k401EmployerMatchPct: 0,      // employer matches X% of your contributions
    k401EmployerMatchLimit: 0,    // up to X% of your salary (match ceiling)
    k401VestingPct: 100,           // how much of matched funds are yours today
    k401StockPct: 90,              // equity allocation %
    paydayReminderEnabled: true,    // weekly push 12h before payday
    trackBrokerage: false,
    trackRoth: false,
    brokerageStockPct: 90,
    rothStockPct: 90,
    // Budget categories
    budgetCategories: [],
    // Savings goals
    savingsGoals: [],
    // Non-card debts
    nonCardDebts: [],
    // Income sources
    incomeSources: [],
    // Credit tracking
    creditScore: null,
    creditScoreDate: "",
    creditUtilization: null,
    // Tax
    taxWithholdingRate: 0,
    quarterlyTaxEstimate: 0,
    isContractor: false,
    // Asset classes
    homeEquity: 0,
    vehicleValue: 0,
    otherAssets: 0,
    otherAssetsLabel: "",
    // Insurance deductibles
    insuranceDeductibles: [],
    // Big-ticket items
    bigTicketItems: []
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [moveChecks, setMoveChecks] = useState({});
  const [viewing, setViewing] = useState(null);
  const [ready, setReady] = useState(false);
  const [useStreaming, setUseStreaming] = useState(true);
  const [renewals, setRenewals] = useState([]);
  const [streamText, setStreamText] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [cards, setCards] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [cardCatalog, setCardCatalog] = useState(null);
  const [cardCatalogUpdatedAt, setCardCatalogUpdatedAt] = useState(null);
  const [showGuide, setShowGuide] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [instructionHash, setInstructionHash] = useState(null);
  const [personalRules, setPersonalRules] = useState("");
  const [aiConsent, setAiConsent] = useState(false);
  const [showAiConsent, setShowAiConsent] = useState(false);
  const [proEnabled, setProEnabled] = useState(import.meta?.env?.VITE_PRO_ENABLED === "true");
  const [resultsBackTarget, setResultsBackTarget] = useState(null);
  const [setupReturnTab, setSetupReturnTab] = useState(null);
  const inputBackTarget = useRef("dashboard");
  const [onboardingComplete, setOnboardingComplete] = useState(true); // true until proven otherwise
  const [persona, setPersona] = useState(null); // "coach" | "friend" | "nerd" | null
  const [trendContext, setTrendContext] = useState([]);
  const [badges, setBadges] = useState({});

  const [requireAuth, setRequireAuth] = useState(false);
  const [appPasscode, setAppPasscode] = useState("");
  const [useFaceId, setUseFaceId] = useState(false);
  const [isLocked, setIsLocked] = useState(true); // start locked; corrected to false in init if auth not required
  const [privacyMode, setPrivacyMode] = useState(false);
  const [lockTimeout, setLockTimeout] = useState(0);
  const [appleLinkedId, setAppleLinkedId] = useState(null);
  const lastBackgrounded = useRef(null);
  const swipeStart = useRef(null);

  useEffect(() => {
    window.toast = toast;
  }, []);

  useEffect(() => {
    // We use visibilitychange instead of Capacitor's appStateChange 
    // because appStateChange (isActive: false) fires when any native dialog 
    // (like Face ID or a Share sheet) opens over the app. 
    // visibilitychange only fires when the user truly backgrounds the app.
    const handleVisibilityChange = async () => {
      if (document.hidden) {
        lastBackgrounded.current = Date.now();
      } else {
        const ra = await db.get("require-auth");
        if (ra && lastBackgrounded.current) {
          const timeoutRaw = await db.get("lock-timeout");
          const timeout = Number.isFinite(Number(timeoutRaw)) ? Number(timeoutRaw) : 0;
          const elapsed = (Date.now() - lastBackgrounded.current) / 1000;

          // -1 means "never relock" (supported by Setup Wizard)
          if (timeout >= 0 && elapsed >= timeout) {
            setIsLocked(true);
          }
        }
        lastBackgrounded.current = null;
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => { document.removeEventListener("visibilitychange", handleVisibilityChange); };
  }, []);
  const scrollRef = useRef(null); const timerRef = useRef(null); const online = useOnline();
  const [inputMounted, setInputMounted] = useState(false);
  const lastCenterTab = useRef("dashboard");
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const longPressTimer = useRef(null);
  const bottomNavRef = useRef(null);
  const topBarRef = useRef(null);
  const [notifPermission, setNotifPermission] = useState("prompt"); // "granted" | "denied" | "prompt"

  // ═══════════════════════════════════════════════════════════════
  // NATIVE SWIPE-TO-GO-BACK (History API Integration)
  // ═══════════════════════════════════════════════════════════════
  const navTo = (newTab, viewState = null) => {
    setTab(newTab);
    setViewing(viewState);
    if (newTab !== "results") setResultsBackTarget(null);
    if (newTab === "input") setInputMounted(true);
    if (newTab === "dashboard" || newTab === "input") lastCenterTab.current = newTab;
    if (newTab === "input") inputBackTarget.current = "dashboard";
    window.history.pushState({ tab: newTab, viewingTs: viewState?.ts }, "", "");
    haptic.light();
  };

  useEffect(() => {
    // Initial history state
    window.history.replaceState({ tab: "dashboard", viewingTs: null }, "", "");

    const onPopState = (e) => {
      const st = e.state;
      if (st) {
        if (st.tab) setTab(st.tab);
        if (st.viewingTs === null) setViewing(null);
        else {
          // If returning to a viewing state, find it in history
          setHistory(prev => {
            const audit = prev.find(a => a.ts === st.viewingTs);
            if (audit) setViewing(audit);
            return prev;
          });
        }
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    (async () => {
      // Request notification permission on first launch (iOS prompt)
      const notifGranted = await requestNotificationPermission().catch(() => false);
      setNotifPermission(notifGranted ? "granted" : "denied");
      try {
        // Phase 1: Load critical data for UI rendering
        const [legacyKey, cur, sm, rn, cp, provId, modId, prefAi, finConf, instHash, ra, pin, uf, lt, renewalsSeedVersion, pr, consent, appLinked, obComplete, savedPersona, savedTrend, ba] = await Promise.all([
          db.get("api-key"),
          db.get("current-audit"), db.get("use-streaming"),
          db.get("renewals"), db.get("card-portfolio"),
          db.get("ai-provider"), db.get("ai-model"), db.get("preferred-ai-app"),
          db.get("financial-config"), db.get("instruction-hash"),
          db.get("require-auth"), db.get("app-passcode"), db.get("use-face-id"),
          db.get("lock-timeout"), db.get("renewals-seed-version"),
          db.get("personal-rules"), db.get("ai-consent-accepted"),
          db.get("apple-linked-id"),
          db.get("onboarding-complete"),
          db.get("ai-persona"), db.get("trend-context"),
          db.get("bank-accounts")
        ]);

        const resolvedProvider = provId || DEFAULT_PROVIDER_ID;
        const resolvedModel = modId || DEFAULT_MODEL_ID;
        setAiProvider(resolvedProvider);
        setAiModel(resolvedModel);

        const provConfig = getProvider(resolvedProvider);
        const provKey = await db.get(provConfig.keyStorageKey);
        if (provKey) setApiKey(provKey);
        else if (legacyKey) { setApiKey(legacyKey); db.set("api-key-openai", legacyKey); }

        if (cur) setCurrent(cur);
        if (sm !== null) setUseStreaming(sm);

        const seedVersion = renewalsSeedVersion || null;
        let activeRenewals = rn ?? null;
        if (activeRenewals === null) {
          // Fresh install: start empty (matches factory reset)
          activeRenewals = [];
          db.set("renewals-seed-version", "public-v1");
        } else if (activeRenewals.length === 0) {
          // Explicitly empty list (e.g., factory reset) — don't reseed
          db.set("renewals-seed-version", "public-v1");
        } else if (seedVersion !== "public-v1") {
          // Public v1 does not auto-seed personal renewals
          db.set("renewals-seed-version", "public-v1");
        }

        if (ra) { setRequireAuth(true); setIsLocked(true); }
        else { setIsLocked(false); } // unlock for users without auth enabled
        if (pin) setAppPasscode(pin);
        if (uf) setUseFaceId(true);
        if (lt !== null) setLockTimeout(lt);
        if (pr) setPersonalRules(pr);
        if (consent) setAiConsent(true);
        if (appLinked) setAppleLinkedId(appLinked);
        if (savedPersona) setPersona(savedPersona);
        if (savedTrend) setTrendContext(savedTrend);
        const loadedBadges = await db.get("unlocked-badges");
        if (loadedBadges) setBadges(loadedBadges);

        // Onboarding gate: existing users (who already have config data AND are not from a partial Setup Wizard run) skip the wizard
        // We ensure that users creating a profile for the first time must complete the wizard.
        if (obComplete || (finConf && !finConf._fromSetupWizard && Object.keys(finConf).length > 5)) {
          setOnboardingComplete(true);
          if (!obComplete) db.set("onboarding-complete", true); // backfill for legacy users
        } else {
          setOnboardingComplete(false);
        }

        // Auto-advance expired renewal dates
        let renewalsChanged = false;
        activeRenewals = activeRenewals.map(r => {
          if (!r.nextDue || r.intervalUnit === "one-time") return r;
          const newDate = advanceExpiredDate(r.nextDue, r.interval || 1, r.intervalUnit || "months");
          if (newDate !== r.nextDue) { renewalsChanged = true; return { ...r, nextDue: newDate }; }
          return r;
        });
        if (renewalsChanged) db.set("renewals", activeRenewals);
        setRenewals(activeRenewals);
        scheduleBillReminders(activeRenewals).catch(() => { });

        let activeCards = cp || [];
        let cardsChanged = false;
        activeCards = activeCards.map(c => {
          if (!c.annualFeeDue) return c;
          const newDate = advanceExpiredDate(c.annualFeeDue, 1, "years");
          if (newDate !== c.annualFeeDue) { cardsChanged = true; return { ...c, annualFeeDue: newDate }; }
          return c;
        });
        const { cards: normalizedCards, changed: idChanged } = ensureCardIds(activeCards);
        if (idChanged) { cardsChanged = true; activeCards = normalizedCards; }
        if (cardsChanged) db.set("card-portfolio", activeCards);
        setCards(activeCards);
        if (ba) setBankAccounts(ba);
        if (finConf) {
          let merged = { ...financialConfig, ...finConf };
          // YTD auto-reset: if the calendar year has changed, reset Roth/401k YTD counters
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
          // Auto-configure payday reminder based on permission result
          if (merged.paydayReminderEnabled === undefined || merged.paydayReminderEnabled === null) {
            // First install: enable if permission was granted
            merged.paydayReminderEnabled = notifGranted;
          } else if (!notifGranted) {
            // Permission denied: always force off
            merged.paydayReminderEnabled = false;
          }
          setFinancialConfig(merged);
        }

        const catalog = await loadCardCatalog();
        if (catalog?.catalog) setCardCatalog(catalog.catalog);
        if (catalog?.updatedAt) setCardCatalogUpdatedAt(catalog.updatedAt);
      } catch (e) {
        console.error('Init error:', e);
        setRenewals([]);
        setCards([]);
      }

      // Generate stable device ID for backend rate limiting (once per install)
      if (!await db.get("device-id")) {
        await db.set("device-id", crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      }

      // Show UI before loading heavy history data
      setTimeout(() => setReady(true), 150);

      // Schedule payday reminder if enabled
      if (finConf?.paydayReminderEnabled) {
        schedulePaydayReminder(finConf.payday, finConf.paycheckTime).catch(() => { });
      }

      // Schedule weekly audit nudge and bill reminders
      scheduleWeeklyAuditNudge().catch(() => { });

      // Phase 2: Lazy-load audit history in background (can be large)
      try {
        const [hist, moves] = await Promise.all([
          db.get("audit-history"), db.get("move-states")
        ]);
        if (hist) setHistory(migrateHistory(hist));
        if (moves) setMoveChecks(moves);
      } catch (e) {
        console.error('History load error:', e);
      }
    })();
  }, []);

  useEffect(() => { if (ready && onboardingComplete) db.set("use-streaming", useStreaming) }, [useStreaming, ready, onboardingComplete]);
  useEffect(() => { if (ready && onboardingComplete) db.set("renewals", renewals) }, [renewals, ready, onboardingComplete]);
  useEffect(() => { if (ready && onboardingComplete) db.set("card-portfolio", cards) }, [cards, ready, onboardingComplete]);
  useEffect(() => { if (ready && onboardingComplete) db.set("bank-accounts", bankAccounts) }, [bankAccounts, ready, onboardingComplete]);
  useEffect(() => { if (ready && onboardingComplete) db.set("ai-provider", aiProvider) }, [aiProvider, ready, onboardingComplete]);
  useEffect(() => { if (ready && onboardingComplete) db.set("ai-model", aiModel) }, [aiModel, ready, onboardingComplete]);
  useEffect(() => { if (ready && onboardingComplete) db.set("financial-config", financialConfig) }, [financialConfig, ready, onboardingComplete]);
  useEffect(() => { if (ready && onboardingComplete) db.set("personal-rules", personalRules) }, [personalRules, ready, onboardingComplete]);

  // ═══════════════════════════════════════════════════════════════

  // Re-schedule (or cancel) payday reminder whenever relevant config changes
  useEffect(() => {
    if (!ready || !financialConfig.payday) return;
    if (financialConfig.paydayReminderEnabled !== false) {
      schedulePaydayReminder(financialConfig.payday, financialConfig.paycheckTime).catch(() => { });
    } else {
      cancelPaydayReminder().catch(() => { });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, financialConfig.paydayReminderEnabled, financialConfig.payday, financialConfig.paycheckTime]);

  // ═══════════════════════════════════════════════════════════════
  // ICLOUD AUTO-SYNC (via Filesystem / Documents directory)
  // iOS syncs the Documents dir to iCloud when user enables the app
  // under iOS Settings → Apple ID → iCloud → Apps Using iCloud.
  // ═══════════════════════════════════════════════════════════════
  const iCloudSyncTimer = useRef(null);
  useEffect(() => {
    if (!ready || !appleLinkedId) return;

    if (iCloudSyncTimer.current) clearTimeout(iCloudSyncTimer.current);

    iCloudSyncTimer.current = setTimeout(async () => {
      try {
        const backup = { app: "Catalyst Cash", version: "1.3.1-BETA", exportedAt: new Date().toISOString(), data: {} };
        const keys = await db.keys();
        for (const key of keys) {
          if (isSecuritySensitiveKey(key)) continue; // Never sync security credentials
          const val = await db.get(key);
          if (val !== null) backup.data[key] = val;
        }
        if (!("personal-rules" in backup.data)) {
          backup.data["personal-rules"] = personalRules ?? "";
        }
        await uploadToICloud(backup, appPasscode || null);
      } catch (e) {
        console.error("iCloud auto-sync error:", e);
      }
    }, 5000); // 5 second debounce

    return () => clearTimeout(iCloudSyncTimer.current);
  }, [ready, history, renewals, cards, financialConfig, personalRules, appleLinkedId]);

  useEffect(() => {
    if (!ready || !cards.length) return;
    let changed = false;
    const next = (renewals || []).map(r => {
      if (r.chargedToId || !r.chargedTo) return r;
      const match = cards.find(c =>
        c.name === r.chargedTo ||
        getCardLabel(cards, c) === r.chargedTo ||
        r.chargedTo.endsWith(c.name)
      );
      if (!match) return r;
      changed = true;
      return { ...r, chargedToId: match.id, chargedTo: getCardLabel(cards, match) };
    });
    if (changed) setRenewals(next);
  }, [cards, ready]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0, behavior: "auto" }) }, [tab]);

  useEffect(() => {
    if (!bottomNavRef.current) return;
    const update = () => {
      const h = bottomNavRef.current.getBoundingClientRect().height || 0;
      document.documentElement.style.setProperty("--bottom-nav-h", `${Math.ceil(h)}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(bottomNavRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!topBarRef.current) return;
    const update = () => {
      const h = topBarRef.current.getBoundingClientRect().height || 0;
      document.documentElement.style.setProperty("--top-bar-h", `${Math.ceil(h)}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(topBarRef.current);
    return () => ro.disconnect();
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // CLIPBOARD AUTO-DETECT — check clipboard on app resume
  // ═══════════════════════════════════════════════════════════════
  const lastClipRef = useRef("");
  useEffect(() => {
    const checkClipboard = async () => {
      if (document.hidden) return;
      try {
        const text = await navigator.clipboard.readText();
        if (!text || text === lastClipRef.current || text.length < 50) return;
        // Heuristic: looks like an audit response if it has markdown headers + dollar amounts
        const hasHeaders = /##\s*(ALERT|DASHBOARD|MOVES|RADAR|NEXT ACTION)/i.test(text);
        const hasDollars = /\$[\d,]+\.\d{2}/.test(text);
        const hasStatus = /\b(GREEN|YELLOW|RED)\b/.test(text);
        if (hasHeaders && hasDollars) {
          lastClipRef.current = text;
          toast.clipboard("Audit detected in clipboard", {
            duration: 8000,
            action: {
              label: "Import",
              fn: () => { handleManualImport(text); haptic.success(); }
            }
          });
        }
      } catch { } // clipboard permission denied — silent fail
    };
    const onVis = () => { if (!document.hidden) setTimeout(checkClipboard, 500); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [history]);

  const cardAnnualFees = useMemo(() => {
    return cards
      .filter(c => c.annualFee && c.annualFee > 0)
      .map(c => {
        const isWaived = !!c.annualFeeWaived;
        // For waived cards: push the next due date +1 year so user sees when the fee will hit
        let nextDue = c.annualFeeDue || "";
        if (isWaived && nextDue) {
          const d = new Date(nextDue + "T00:00:00");
          d.setFullYear(d.getFullYear() + 1);
          nextDue = d.toISOString().split("T")[0];
        }
        return {
          name: `${getCardLabel(cards, c)} Annual Fee`,
          amount: isWaived ? 0 : c.annualFee,
          interval: 1, intervalUnit: "years",
          cadence: "annual",
          nextDue,
          cardName: c.name,
          cardLabel: getCardLabel(cards, c),
          linkedCardId: c.id,
          isCardAF: true,
          isWaived,
          category: "af",
          section: "L"
        };
      });
  }, [cards]);

  const [isTest, setIsTest] = useState(false);
  const applyContributionAutoUpdate = (parsed, rawText) => {
    if (!parsed) return;
    let rothDelta = 0;
    let k401Delta = 0;

    const extractAmount = (txt) => {
      const m = txt.match(/\$([\d,]+(?:\.\d{2})?)/);
      return m ? parseFloat(m[1].replace(/,/g, "")) : 0;
    };

    const scanMoves = (moves = []) => {
      moves.forEach(m => {
        const text = (m.text || m.description || m).toString();
        if (/roth/i.test(text)) rothDelta = Math.max(rothDelta, extractAmount(text));
        if (/401k|401 k/i.test(text)) k401Delta = Math.max(k401Delta, extractAmount(text));
      });
    };

    if (parsed.structured?.moves?.length) {
      scanMoves(parsed.structured.moves);
    } else if (parsed.moveItems?.length) {
      scanMoves(parsed.moveItems);
    } else if (parsed.sections?.moves) {
      scanMoves(parsed.sections.moves.split("\n"));
    } else if (rawText) {
      scanMoves(rawText.split("\n"));
    }

    if (!financialConfig?.trackRothContributions && !financialConfig?.track401k) return;

    setFinancialConfig(prev => {
      const next = { ...prev };
      if (prev.trackRothContributions && prev.autoTrackRothYTD !== false && rothDelta > 0) {
        next.rothContributedYTD = Math.max(0, (prev.rothContributedYTD || 0) + rothDelta);
        if (prev.rothAnnualLimit) next.rothContributedYTD = Math.min(next.rothContributedYTD, prev.rothAnnualLimit);
      }
      if (prev.track401k && prev.autoTrack401kYTD !== false && k401Delta > 0) {
        next.k401ContributedYTD = Math.max(0, (prev.k401ContributedYTD || 0) + k401Delta);
        if (prev.k401AnnualLimit) next.k401ContributedYTD = Math.min(next.k401ContributedYTD, prev.k401AnnualLimit);
      }
      return next;
    });
  };

  const handleSubmit = async (msg, formData, testMode = false, manualResultText = null) => {
    const trimmedApiKey = typeof apiKey === "string" ? apiKey.trim() : "";
    const prov = getProvider(aiProvider);
    const isBackendMode = prov.isBackend;
    if (!manualResultText && !isBackendMode && !trimmedApiKey) { toast.error("Set your API key in Settings first."); navTo("settings"); return; }
    if (!manualResultText && !aiConsent) { setShowAiConsent(true); return; }
    if (!manualResultText && !online) { toast.error("You're offline."); return; }
    setIsTest(testMode);
    setLoading(true); setError(null); navTo("results"); setStreamText(""); setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    try {
      let raw = "";
      if (manualResultText) {
        raw = manualResultText;
        setStreamText(raw);
      } else {
        const useStream = useStreaming && prov.supportsStreaming;
        const promptRenewals = [...(renewals || []), ...(cardAnnualFees || [])];

        // Native Engine Run: Calculate floors, targets, and debt override natively before prompt generation
        const computedStrategy = generateStrategy(financialConfig, {
          checkingBalance: parseFloat(formData.checking || 0),
          allyVaultTotal: parseFloat(formData.ally || 0),
          cards: cards || [],
          renewals: promptRenewals,
          snapshotDate: formData.date
        });

        // Initialize PII Scrubber
        const scrubber = buildScrubber(cards, promptRenewals, financialConfig, formData);

        // Scrub the system prompt
        const rawLivePrompt = getSystemPrompt(aiProvider || "gemini", financialConfig, cards, promptRenewals, personalRules || "", trendContext, persona, computedStrategy);
        const livePrompt = scrubber.scrub(rawLivePrompt);
        const liveHash = cyrb53(livePrompt).toString();
        const histKey = `api-history-${aiProvider || "gemini"}`;
        const hashKey = `api-history-hash-${aiProvider || "gemini"}`;
        const lastHash = await db.get(hashKey);
        let history = (await db.get(histKey)) || [];
        if (lastHash !== liveHash) {
          history = [];
          await db.set(hashKey, liveHash);
          setInstructionHash(liveHash);
          db.set("instruction-hash", liveHash);
        }

        // Trim history to last 6 messages to control token growth
        if (history.length > 6) history = history.slice(-6);

        // Scrub history
        const historyForProvider = (aiProvider === "gemini")
          ? history.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: scrubber.scrub(m.content) }] }))
          : history.map(m => ({ ...m, content: scrubber.scrub(m.content) })); // openai & claude

        // Scrub user message
        const scrubbedMsg = scrubber.scrub(msg);

        // Execute API Call — deviceId for backend rate limiting
        const deviceId = (await db.get("device-id")) || "unknown";
        if (useStream) {
          for await (const chunk of streamAudit(trimmedApiKey, scrubbedMsg, aiProvider, aiModel, livePrompt, historyForProvider, deviceId)) {
            raw += chunk;
            setStreamText(scrubber.unscrub(raw)); // Unscrub on the fly for viewing
          }
        } else {
          raw = await callAudit(trimmedApiKey, scrubbedMsg, aiProvider, aiModel, livePrompt, historyForProvider, deviceId);
        }

        // Unscrub the final raw text before parsing and saving
        raw = scrubber.unscrub(raw);

        // Save real names to local device history
        const newHistory = [...history, { role: "user", content: msg }, { role: "assistant", content: raw }];
        await db.set(histKey, newHistory.slice(-8));
      }
      const parsed = parseAudit(raw);
      if (!parsed) throw new Error("Model output was not valid audit JSON. Please retry.");
      const audit = { date: formData.date, ts: new Date().toISOString(), form: formData, parsed, isTest: testMode, moveChecks: {} };

      if (testMode) {
        // Save test audits to history (flagged as isTest) but don't set as current
        setViewing(audit);
        const nh = [audit, ...history].slice(0, 52); setHistory(nh);
        await db.set("audit-history", nh);
      } else {
        applyContributionAutoUpdate(parsed, raw);
        setCurrent(audit); setMoveChecks({}); setViewing(null);
        const nh = [audit, ...history].slice(0, 52); setHistory(nh);

        // Extract compact trend metrics for AI context injection
        const getISOWeekNum = (d) => { const dt = new Date(d); dt.setHours(0, 0, 0, 0); dt.setDate(dt.getDate() + 3 - (dt.getDay() + 6) % 7); const w1 = new Date(dt.getFullYear(), 0, 4); return 1 + Math.round(((dt - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7); };
        const trendEntry = {
          week: getISOWeekNum(formData.date),
          date: formData.date,
          checking: formData.checking || "0",
          vault: formData.ally || "0",
          totalDebt: formData.debts?.reduce((s, d) => s + (parseFloat(d.balance) || 0), 0).toFixed(0) || "0",
          score: parsed.healthScore?.score || null,
          status: parsed.status || "UNKNOWN"
        };
        const updatedTrend = [...trendContext, trendEntry].slice(-8);
        setTrendContext(updatedTrend);
        db.set("trend-context", updatedTrend);
        await Promise.all([db.set("current-audit", audit), db.set("move-states", {}), db.set("audit-history", nh)]);
      }
      haptic.success();
      toast.success(testMode ? "Test audit complete — saved to history" : "Audit imported successfully");

      // Evaluate badges after audit
      if (!testMode) {
        try {
          // Compute actual streak from audit history
          const getISOWeek = (ds) => { const dt = new Date(ds); dt.setDate(dt.getDate() + 3 - (dt.getDay() + 6) % 7); const w1 = new Date(dt.getFullYear(), 0, 4); return `${dt.getFullYear()}-W${String(1 + Math.round(((dt - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7)).padStart(2, '0')}`; };
          const realForStreak = nh.filter(a => !a.isTest && a.date);
          const weeks = [...new Set(realForStreak.map(a => getISOWeek(a.date)))].sort().reverse();
          let computedStreak = 0;
          if (weeks.length) {
            const curWeek = getISOWeek(new Date().toISOString().split("T")[0]);
            let checkW = weeks[0] === curWeek ? curWeek : weeks[0];
            for (const w of weeks) { if (w === checkW) { computedStreak++; const d = new Date(checkW.slice(0, 4), 0, 1); d.setDate(d.getDate() + (parseInt(checkW.slice(6)) - 2) * 7); checkW = getISOWeek(d.toISOString().split("T")[0]); } else break; }
          }
          const { unlocked, newlyUnlocked } = await evaluateBadges({ history: nh, streak: computedStreak, financialConfig, persona, current: audit });
          setBadges(unlocked);
          if (newlyUnlocked.length > 0) {
            const names = newlyUnlocked.map(id => BADGE_DEFINITIONS.find(b => b.id === id)?.name).filter(Boolean);
            if (names.length) toast.success(`🏆 Badge unlocked: ${names.join(", ")}!`);
          }
        } catch (e) { console.error("Badge eval failed:", e); }

        // Update iOS Home Screen widget data
        try {
          const { updateWidgetData } = await import("./modules/widgetBridge.js");
          await updateWidgetData({
            healthScore: parsed?.healthScore?.score ?? null,
            healthLabel: parsed?.status || "",
            netWorth: null, // computed from dashboard
            weeklyMoves: Object.values(moveChecks).filter(Boolean).length,
            weeklyMovesTotal: parsed?.moveItems?.length || 0,
            streak: computedStreak,
            lastAuditDate: audit.date,
          });
        } catch { /* widget bridge not critical */ }
      }

      // Confetti is handled by DashboardTab's react-confetti (score >= 95)
    } catch (e) {
      const msg = e.message || "Unknown error";
      // Distinguish background suspension from real API failures
      const isBackgroundAbort = msg.includes("aborted") || msg.includes("Failed to fetch") || msg.includes("network") || msg.includes("Load failed");
      if (isBackgroundAbort && document.hidden) {
        // App was backgrounded — don't show error, wait for resume
        setError("The audit was interrupted because the app went to the background. Please return to the Input tab and try again.");
        toast.error("Audit interrupted — app was backgrounded. Tap to retry.");
      } else {
        setError(msg);
        toast.error(msg || "Audit failed");
      }
      navTo("input"); haptic.error();
    }
    finally { setLoading(false); setStreamText(""); clearInterval(timerRef.current); }
  };

  const toggleMove = async i => {
    haptic.light();
    if (viewing) {
      const updatedChecks = { ...(viewing.moveChecks || {}), [i]: !(viewing.moveChecks || {})[i] };
      const updatedViewing = { ...viewing, moveChecks: updatedChecks };
      setViewing(updatedViewing);
      const nh = history.map(a => a.ts === viewing.ts ? updatedViewing : a);
      setHistory(nh);
      await db.set("audit-history", nh);
    } else {
      const n = { ...moveChecks, [i]: !moveChecks[i] };
      setMoveChecks(n);
      db.set("move-states", n);
      if (current) {
        const updatedCurrent = { ...current, moveChecks: n };
        setCurrent(updatedCurrent);
        db.set("current-audit", updatedCurrent);
        const nh = history.map(a => a.ts === current.ts ? updatedCurrent : a);
        setHistory(nh);
        db.set("audit-history", nh);
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // GUIDED FIRST AUDIT — pre-loaded sample data so users see the full value prop
  // ═══════════════════════════════════════════════════════════════
  const handleDemoAudit = () => {
    const demoJSON = {
      headerCard: { status: "YELLOW", details: ["Demo audit with sample data", "Your real audit will use your actual finances"] },
      healthScore: { score: 72, grade: "C+", trend: "flat", summary: "Solid foundation but credit card debt and tight margins are holding back growth." },
      alertsCard: ["⚠️ Credit card balance is 42% of limit — aim for under 30%", "🔔 Car insurance due in 12 days ($187)"],
      dashboardCard: [
        { category: "Checking", amount: "$2,340.00", status: "Above floor" },
        { category: "Vault", amount: "$4,120.00", status: "On track" },
        { category: "Pending", amount: "$847.00", status: "3 bills due" },
        { category: "Debts", amount: "$6,890.00", status: "2 cards" },
        { category: "Available", amount: "$1,493.00", status: "After obligations" }
      ],
      weeklyMoves: [
        "💳 Pay Chase Sapphire minimum ($45) — due in 3 days",
        "🏦 Transfer $200 to Emergency Fund vault",
        "📊 Review Discover balance for 0% promo deadline (ends Apr 15)",
        "💰 Set aside $187 for car insurance (due Feb 28)"
      ],
      radar: [
        { item: "Car Insurance", amount: "$187.00", date: new Date(Date.now() + 12 * 86400000).toISOString().split("T")[0] },
        { item: "Chase Sapphire Min", amount: "$45.00", date: new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0] }
      ],
      longRangeRadar: [
        { item: "Discover Promo Ends", amount: "$3,200.00", date: "2026-04-15" },
        { item: "Roth IRA Contribution", amount: "$500.00", date: "2026-03-15" }
      ],
      milestones: ["Emergency fund hits $5K target by April", "Chase Sapphire payoff by Q3 at current pace"],
      investments: { balance: "$12,450.00", asOf: new Date().toISOString().split("T")[0], gateStatus: "Closed — debt APR exceeds market returns" },
      nextAction: "Pay the Chase minimum today, then move $200 into the Emergency Fund vault. Review Discover promo deadline this weekend."
    };
    const raw = JSON.stringify(demoJSON);
    const parsed = parseAudit(raw);
    if (!parsed) { toast.error("Demo parsing failed"); return; }
    const audit = {
      ts: Date.now(), date: new Date().toISOString().split("T")[0],
      raw, parsed, isTest: true, moveChecks: {},
      form: {
        date: new Date().toISOString().split("T")[0], checking: "2340", ally: "4120", debts: [
          { name: "Chase Sapphire", balance: "3690", limit: "8000", apr: "24.99", minPayment: "45", nextDue: "" },
          { name: "Discover It", balance: "3200", limit: "6000", apr: "0", minPayment: "35", nextDue: "" }
        ]
      }
    };
    setCurrent(audit); setViewing(null);
    const nh = [audit, ...history].slice(0, 52);
    setHistory(nh);
    db.set("current-audit", audit); db.set("audit-history", nh);
    toast.success("🎓 Demo audit loaded — explore the full experience!");
    haptic.success();
  };

  const handleRefreshDashboard = async () => {
    // Find the most recent real (non-test) audit
    const realAudit = history.find(a => !a.isTest);
    if (realAudit) {
      setCurrent(realAudit);
      setMoveChecks(realAudit.moveChecks || {});
      await db.set("current-audit", realAudit);
      await db.set("move-states", realAudit.moveChecks || {});
      toast.success("Dashboard restored to your latest real audit");
    } else {
      setCurrent(null);
      setMoveChecks({});
      await db.del("current-audit");
      await db.del("move-states");
      toast.success("Demo cleared — run your first real audit!");
    }
    haptic.medium();
  };

  const clearAll = async () => {
    setHistory([]); setCurrent(null); setMoveChecks({});
    await Promise.all([db.set("audit-history", []), db.del("current-audit"), db.del("move-states")]);
    haptic.warning();
  };

  const factoryReset = async () => {
    haptic.warning();
    toast.success("App securely erased. Restarting...");
    setIsResetting(true); // Unmounts SettingsTab immediately

    // Wait for any trailing debounces to flush from React to the DB before wiping
    setTimeout(async () => {
      await db.clear();
      await db.set("renewals", []);
      await db.set("renewals-seed-version", "v2");
      await db.set("card-portfolio", []);
      await db.set("bank-accounts", []);
      await db.set("personal-rules", "");
      await db.del("app-passcode");
      await db.del("onboarding-complete"); // Guarantee Setup Wizard on reload

      window.location.reload();
    }, 800);
  };

  const deleteHistoryItem = async (auditToDelete) => {
    const isMatch = (a, b) => (a.ts && b.ts) ? a.ts === b.ts : (a.date === b.date && a.parsed?.netWorth === b.parsed?.netWorth);
    const nh = history.filter(a => !isMatch(a, auditToDelete));
    setHistory(nh);
    await db.set("audit-history", nh);
    if (current && isMatch(current, auditToDelete)) {
      const newCurrent = nh.length > 0 ? nh[0] : null;
      setCurrent(newCurrent);
      if (newCurrent) {
        setMoveChecks(newCurrent.moveChecks || {});
        await Promise.all([db.set("current-audit", newCurrent), db.set("move-states", newCurrent.moveChecks || {})]);
      } else {
        setMoveChecks({});
        await Promise.all([db.del("current-audit"), db.del("move-states")]);
      }
    }
    if (viewing && isMatch(viewing, auditToDelete)) setViewing(null);
    haptic.success();
    toast.success("Audit deleted");
  };

  const handleManualImport = async (resultText) => {
    if (!resultText) return;
    setResultsBackTarget("history");
    setLoading(true); setError(null); navTo("results"); setStreamText(resultText);
    try {
      const parsed = parseAudit(resultText);
      if (!parsed) throw new Error("Imported text is not valid Catalyst Cash audit JSON.");
      applyContributionAutoUpdate(parsed, resultText);
      const today = new Date().toISOString().split("T")[0];
      const audit = { date: today, ts: new Date().toISOString(), form: { date: today }, parsed, isTest: false, moveChecks: {} };
      setCurrent(audit); setMoveChecks({}); setViewing(null);
      const nh = [audit, ...history].slice(0, 52); setHistory(nh);
      await Promise.all([db.set("current-audit", audit), db.set("move-states", {}), db.set("audit-history", nh)]);
      haptic.success();
      toast.success("Audit imported successfully");
    } catch (e) {
      setError(e.message || "Failed to parse response");
      haptic.error();
      toast.error(e.message || "Failed to parse audit response");
    }
    finally { setLoading(false); setStreamText(""); }
  };

  const importBackupFile = async (file) => {
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onload = async (e) => {
        try {
          const backup = JSON.parse(e.target.result);
          if (!backup.data || (backup.app !== "Catalyst Cash" && backup.app !== "FinAudit Pro")) {
            reject(new Error("Invalid Catalyst Cash backup file")); return;
          }
          let count = 0;
          for (const [key, val] of Object.entries(backup.data)) {
            if (isSecuritySensitiveKey(key)) continue; // Never import security credentials
            await db.set(key, val); count++;
          }
          resolve({ count, exportedAt: backup.exportedAt });
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  };

  const handleRestoreFromHome = async (file) => {
    if (!file) return;
    try {
      const { count, exportedAt } = await importBackupFile(file);
      const dateStr = exportedAt ? new Date(exportedAt).toLocaleDateString() : "unknown date";
      toast.success(`Restored ${count} items from backup dated ${dateStr}.`);
      // Short delay to ensure toasts clear and state settles before reload
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      toast.error(e.message || "Import failed");
    }
  };

  const display = viewing || current;
  const displayMoveChecks = viewing ? (viewing.moveChecks || {}) : moveChecks;

  const centerActive = tab === "dashboard" || tab === "input";
  const actionGoesHome = tab === "input" || (!centerActive && lastCenterTab.current === "input");

  const navItems = [
    { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { id: "history", icon: History, label: "History" },
    { id: "action", icon: actionGoesHome ? Plus : Home, label: actionGoesHome ? "Action" : "Home", isCenter: true },
    { id: "renewals", icon: RefreshCw, label: "Expenses" },
    { id: "cards", icon: CreditCard, label: "Cards" },
  ];

  // Native iOS swipe-back is handled via WKWebView allowsBackForwardNavigationGestures
  // (set in capacitor.config.ts). The popstate listener (above) handles the navigation.

  if (!ready) return <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100dvh", background: T.bg.base }}>
    <GlobalStyles />
    <div style={{
      position: "relative", width: 90, height: 90, marginBottom: 28,
      animation: "pulseShadow 2s infinite cubic-bezier(0.4, 0, 0.2, 1)"
    }}>
      <div style={{ position: "absolute", inset: -6, borderRadius: 26, background: `conic-gradient(from 0deg, transparent, ${T.accent.primary}40, transparent)`, animation: "spin 2s linear infinite" }} />
      <img src="/icon-512.png" style={{ position: "relative", width: "100%", height: "100%", borderRadius: 20, zIndex: 2, background: T.bg.base, boxShadow: `0 8px 32px rgba(0,0,0,0.4)` }} />
    </div>
    <h1 style={{ fontSize: 26, fontWeight: 900, color: T.text.primary, letterSpacing: "-0.04em", marginBottom: 8 }}>Catalyst Cash</h1>
    <p style={{ fontSize: 11, color: T.accent.primary, fontFamily: T.font.mono, letterSpacing: "2px", fontWeight: 700 }}>INITIALIZING CORE ENGINE</p>
  </div>;

  if (!onboardingComplete) return (
    <>
      <GlobalStyles />
      <SetupWizard toast={toast} onComplete={() => setOnboardingComplete(true)} />
    </>
  );

  return <div
    style={{
      position: "absolute", inset: 0, maxWidth: 800, margin: "0 auto",
      background: T.bg.base, display: "flex", flexDirection: "column",
      fontFamily: T.font.sans, overflow: "hidden"
    }}>
    {(() => { window.__privacyMode = privacyMode; return null; })()}
    <GlobalStyles />
    {showAiConsent && (
      <div style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.75)", backdropFilter: "blur(24px) saturate(1.8)", WebkitBackdropFilter: "blur(24px) saturate(1.8)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20
      }}>
        <div style={{
          width: "100%", maxWidth: 360, background: T.bg.card, borderRadius: T.radius.xl,
          border: `1px solid ${T.border.subtle}`, padding: 24, boxShadow: `0 24px 48px rgba(0,0,0,0.6), 0 0 0 1px ${T.border.subtle}`
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10, color: T.text.primary }}>AI Data Consent</div>
          <p style={{ fontSize: 13, color: T.text.secondary, lineHeight: 1.6, marginBottom: 20 }}>
            When you run an audit, the financial data you enter is sent to your selected AI provider
            using your API key. We do not sell AI access or store your data
            on our servers. By continuing, you agree to this data transfer.
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={() => setShowAiConsent(false)} style={{
              flex: 1, padding: 14, borderRadius: T.radius.lg, border: `1px solid ${T.border.default}`,
              background: "transparent", color: T.text.secondary, fontWeight: 700, cursor: "pointer", fontSize: 14
            }}>Cancel</button>
            <button onClick={async () => {
              setAiConsent(true); setShowAiConsent(false);
              await db.set("ai-consent-accepted", true);
              toast.success("Consent saved");
            }} style={{
              flex: 1, padding: 14, borderRadius: T.radius.lg, border: "none",
              background: `linear-gradient(135deg, ${T.accent.primary}, #6C60FF)`, color: "white", fontWeight: 800, cursor: "pointer", fontSize: 14,
              boxShadow: `0 4px 12px ${T.accent.primary}40`
            }}>I Agree</button>
          </div>
        </div>
      </div>
    )}

    {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}
    {isLocked && <LockScreen onUnlock={() => setIsLocked(false)} appPasscode={appPasscode} useFaceId={useFaceId} appleLinkedId={appleLinkedId} />}
    {/* ═══════ HEADER BAR ═══════ */}
    <div ref={topBarRef} style={{
      position: "relative",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: `calc(env(safe-area-inset-top, 0px) + 4px) 16px 8px 16px`,
      background: "rgba(6, 9, 14, 0.65)", flexShrink: 0, zIndex: 10,
      backdropFilter: "blur(24px) saturate(1.8)", WebkitBackdropFilter: "blur(24px) saturate(1.8)",
      borderBottom: `1px solid ${T.border.subtle}`
    }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setShowGuide(!showGuide)} style={{
          width: 36, height: 36, borderRadius: 10, border: `1px solid ${showGuide ? T.border.focus : T.border.default}`,
          background: showGuide ? T.bg.surface : T.bg.glass, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          color: showGuide ? T.accent.primary : T.text.dim, transition: "color .2s, border-color .2s",
          visibility: (tab === "history" || tab === "settings") ? "hidden" : "visible"
        }}><Info size={16} strokeWidth={1.8} /></button>
        <button onClick={() => setPrivacyMode(p => !p)} style={{
          width: 36, height: 36, borderRadius: 10, border: `1px solid ${privacyMode ? T.border.focus : T.border.default}`,
          background: privacyMode ? T.bg.surface : T.bg.glass, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          color: privacyMode ? T.accent.primary : T.text.dim, transition: "color .2s, border-color .2s",
          visibility: (tab === "history" || tab === "settings" || tab === "input") ? "hidden" : "visible"
        }} aria-label={privacyMode ? "Disable Privacy Mode" : "Enable Privacy Mode"}>{privacyMode ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}</button>
      </div>
      <span style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", fontSize: 13, fontWeight: 700, color: T.text.secondary, fontFamily: T.font.mono, letterSpacing: "0.04em", textAlign: "center", whiteSpace: "nowrap" }}>
        {tab === "dashboard" ? "HOME" : tab === "history" ? "HISTORY" : tab === "renewals" ? "EXPENSES" : tab === "cards" ? "CARDS" : tab === "input" ? "INPUT" : tab === "results" ? "RESULTS" : tab === "settings" ? "CONFIG" : ""}
      </span>
      <button onClick={() => tab === "settings" ? navTo(lastCenterTab.current) : navTo("settings")} style={{
        width: 36, height: 36, borderRadius: 10, border: `1px solid ${tab === "settings" ? T.border.focus : T.border.default}`,
        background: tab === "settings" ? T.bg.surface : T.bg.glass, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
        color: tab === "settings" ? T.accent.primary : T.text.dim, transition: "color .2s, border-color .2s",
        visibility: tab === "settings" ? "hidden" : "visible"
      }} aria-label="Open Settings"><Settings size={16} strokeWidth={1.8} /></button>
    </div>

    <div ref={scrollRef} className="scroll-area safe-scroll-body"
      onTouchStart={e => { swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={e => {
        if (!swipeStart.current) return;
        const dx = e.changedTouches[0].clientX - swipeStart.current.x;
        const dy = Math.abs(e.changedTouches[0].clientY - swipeStart.current.y);
        if (dx > 60 && swipeStart.current.x < 80 && dy < 100) {
          const renderTab = tab === "settings" ? lastCenterTab.current : tab;
          if (renderTab === "results" && (viewing || resultsBackTarget === "history")) {
            setResultsBackTarget(null); navTo("history"); haptic.light();
          }
        }
        swipeStart.current = null;
      }}
      style={{
        flex: 1, overflowY: (tab === "settings" || tab === "input") ? "hidden" : "auto", position: "relative",
        display: tab === "input" ? "none" : undefined
      }}>
      {error && <Card style={{ borderColor: `${T.status.red}20`, background: T.status.redDim, margin: "8px 20px", borderLeft: `3px solid ${T.status.red}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <AlertTriangle size={14} color={T.status.red} strokeWidth={2.5} />
            <span style={{ fontSize: 12, fontWeight: 700, color: T.status.red }}>Error</span></div>
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: T.text.dim, cursor: "pointer", padding: 4 }}>
            <X size={14} /></button></div>
        <p style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.5 }}>{error}</p></Card>}

      {/* ═══════ LAZY TAB RENDERING — only mount active tab ═══════ */}
      {(() => {
        const renderTab = tab === "settings" ? lastCenterTab.current : tab;
        return (
          <div key={`${renderTab}-${privacyMode}`} className="tab-transition">
            {renderTab === "dashboard" && <ErrorBoundary><DashboardTab current={current} history={history}
              onRunAudit={() => navTo("input")} onViewResult={() => navTo("results", current)}
              onManualImport={handleManualImport} financialConfig={financialConfig}
              onGoSettings={() => { setSetupReturnTab("dashboard"); navTo("settings"); }}
              onGoCards={() => { setSetupReturnTab("dashboard"); navTo("cards"); }}
              onGoRenewals={() => { setSetupReturnTab("dashboard"); navTo("renewals"); }}
              onRestore={handleRestoreFromHome} proEnabled={proEnabled}
              onRefreshDashboard={handleRefreshDashboard}
              persona={persona} badges={badges} onDemoAudit={handleDemoAudit} cards={cards} renewals={renewals} /></ErrorBoundary>}
            {renderTab === "results" && (loading ? <StreamingView streamText={streamText} elapsed={elapsed} isTest={isTest} modelName={getModel(aiProvider, aiModel).name} /> :
              !display ? (() => { setTimeout(() => navTo("dashboard"), 0); return null; })() :
                <>
                  {(viewing || resultsBackTarget === "history") && <div style={{ padding: "8px 20px" }}>
                    <button onClick={() => { setResultsBackTarget(null); navTo("history"); }} style={{
                      display: "flex", alignItems: "center", gap: 5,
                      background: T.bg.card, border: `1px solid ${T.border.default}`, borderRadius: T.radius.md,
                      padding: "8px 14px", color: T.text.secondary, fontSize: 11, fontWeight: 600, cursor: "pointer"
                    }}>← Back</button></div>}
                  <ErrorBoundary><ResultsView audit={display} moveChecks={displayMoveChecks} onToggleMove={toggleMove} financialConfig={financialConfig} streak={trendContext?.length || 0} /></ErrorBoundary></>)}
            {renderTab === "history" && <ErrorBoundary><HistoryTab audits={[...history].reverse()} onSelect={a => navTo("results", a)}
              onExportAll={exportAllAudits} onExportSelected={exportSelectedAudits} onExportCSV={exportAuditCSV}
              onDelete={deleteHistoryItem} onManualImport={handleManualImport} toast={toast} /></ErrorBoundary>}
            {renderTab === "renewals" && <ErrorBoundary><RenewalsTab renewals={renewals} setRenewals={setRenewals} cardAnnualFees={cardAnnualFees} cards={cards} /></ErrorBoundary>}
            {renderTab === "cards" && <ErrorBoundary><CardPortfolioTab cards={cards} setCards={setCards} cardCatalog={cardCatalog} bankAccounts={bankAccounts} setBankAccounts={setBankAccounts} /></ErrorBoundary>}
          </div>
        );
      })()}
    </div>

    {/* ═══════ OVERLAY PANELS — rendered OUTSIDE main scroll but INSIDE flex flow ═══════ */}
    {inputMounted && <div className="slide-pane" style={{
      display: tab === "input" ? "flex" : "none",
      flexDirection: "column",
      flex: 1, minHeight: 0,
      zIndex: 15, background: T.bg.base,
      width: "100%", boxSizing: "border-box",
      overflowY: "auto", overscrollBehavior: "contain",
      WebkitOverflowScrolling: "touch",
      paddingBottom: 24, // Clear the 14px Action button protrusion 
    }}>
      <InputForm onSubmit={handleSubmit} isLoading={loading} lastAudit={current}
        renewals={renewals} cardAnnualFees={cardAnnualFees} cards={cards}
        onManualImport={handleManualImport} toast={toast} financialConfig={financialConfig} aiProvider={aiProvider} personalRules={personalRules}
        persona={persona}
        instructionHash={instructionHash} setInstructionHash={setInstructionHash} db={db} proEnabled={proEnabled}
        onBack={() => navTo("dashboard")} />
    </div>}
    {tab === "settings" && <SettingsTab
      apiKey={apiKey} setApiKey={setApiKey}
      aiProvider={aiProvider} setAiProvider={setAiProvider}
      aiModel={aiModel} setAiModel={setAiModel}
      onClear={clearAll} onFactoryReset={factoryReset} useStreaming={useStreaming} setUseStreaming={setUseStreaming}
      financialConfig={financialConfig} setFinancialConfig={setFinancialConfig}
      personalRules={personalRules} setPersonalRules={setPersonalRules}
      requireAuth={requireAuth} setRequireAuth={setRequireAuth}
      appPasscode={appPasscode} setAppPasscode={setAppPasscode}
      useFaceId={useFaceId} setUseFaceId={setUseFaceId}
      lockTimeout={lockTimeout} setLockTimeout={setLockTimeout}

      appleLinkedId={appleLinkedId} setAppleLinkedId={setAppleLinkedId}
      notifPermission={notifPermission}
      persona={persona} setPersona={setPersona}
      proEnabled={proEnabled}
      onShowGuide={() => setShowGuide(true)}
      onBack={() => {
        if (setupReturnTab) {
          navTo(setupReturnTab);
          setSetupReturnTab(null);
        } else {
          navTo(lastCenterTab.current);
        }
        haptic.light();
      }} onRestoreComplete={() => window.location.reload()} />}

    {/* ═══════ BOTTOM NAV ═══════ */}
    <div ref={bottomNavRef} style={{
      background: T.bg.navGlass,
      backdropFilter: "blur(24px) saturate(1.6)",
      WebkitBackdropFilter: "blur(24px) saturate(1.6)",
      borderTop: `1px solid ${T.border.default}`,
      flexShrink: 0, position: "relative",
    }}>
      {/* QUICK ACTIONS MENU */}
      {showQuickMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99, background: 'transparent' }} onClick={() => setShowQuickMenu(false)} onTouchStart={() => setShowQuickMenu(false)} />
          <div style={{
            position: 'absolute', bottom: 85, left: '50%', transform: 'translateX(-50%)',
            background: T.bg.glass, backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
            border: `1px solid ${T.border.focus}`, borderRadius: T.radius.lg, padding: 8,
            display: 'flex', flexDirection: 'column', gap: 4, zIndex: 100,
            boxShadow: T.shadow.elevated, width: 220, animation: 'slideUpMenu .2s ease'
          }}>
            <button onClick={() => { setShowQuickMenu(false); navTo("input"); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'transparent', border: 'none', color: T.text.primary, fontSize: 14, fontWeight: 600, cursor: 'pointer', borderRadius: T.radius.sm }}>
              <Plus size={18} color={T.accent.emerald} /> Start New Audit
            </button>
            <button onClick={async () => { setShowQuickMenu(false); try { const txt = await navigator.clipboard.readText(); handleManualImport(txt); } catch (e) { toast.error("Could not read clipboard"); } }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'transparent', border: 'none', color: T.text.primary, fontSize: 14, fontWeight: 600, cursor: 'pointer', borderRadius: T.radius.sm }}>
              <ClipboardPaste size={18} color={T.status.blue} /> Paste Payload
            </button>
            <div style={{ height: 1, background: T.border.default, margin: '4px 0' }} />
            <button onClick={() => { setShowQuickMenu(false); navTo("settings"); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'transparent', border: 'none', color: T.text.primary, fontSize: 14, fontWeight: 600, cursor: 'pointer', borderRadius: T.radius.sm }}>
              <Settings size={18} color={T.text.dim} /> App Configuration
            </button>
          </div>
        </>
      )}

      <div style={{
        position: "absolute", top: -1, left: "10%", right: "10%", height: 1,
        background: `linear-gradient(90deg,transparent,${T.accent.primary}25,${T.accent.emerald}20,transparent)`
      }} />

      <div style={{
        display: "flex", justifyContent: "space-around", alignItems: "flex-end",
        paddingTop: 6, paddingBottom: "calc(env(safe-area-inset-bottom, 10px) + 4px)"
      }}>
        {navItems.map((n) => {
          const Icon = n.icon; const isCenter = n.isCenter;
          const active = isCenter ? centerActive : tab === n.id;

          const handlePressStart = (e) => {
            if (e.type === "mousedown" && e.button !== 0) return;
            longPressTimer.current = setTimeout(() => {
              haptic.warning();
              setShowQuickMenu(true);
              longPressTimer.current = null;
            }, 350);
          };

          const handlePressEnd = (e) => {
            if (e.type === "mouseup" && e.button !== 0) return;
            if (longPressTimer.current) {
              clearTimeout(longPressTimer.current);
              longPressTimer.current = null;
              if (tab === "dashboard") navTo("input");
              else if (tab === "input") navTo("dashboard");
              else navTo(lastCenterTab.current);
            }
          };

          return <button key={n.id}
            onMouseDown={isCenter ? handlePressStart : undefined}
            onMouseUp={isCenter ? handlePressEnd : undefined}
            onMouseLeave={isCenter ? () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); } : undefined}
            onTouchStart={isCenter ? handlePressStart : undefined}
            onTouchEnd={isCenter ? handlePressEnd : undefined}
            onClick={!isCenter ? () => { if (tab !== n.id) navTo(n.id); } : undefined}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              background: "none", border: "none", cursor: "pointer",
              color: active ? T.accent.primary : T.text.muted,
              padding: "4px 8px", minWidth: 52, minHeight: 48,
              transition: "color .2s ease", position: "relative",
              userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none"
            }}>
            {active && !isCenter && <div style={{
              position: "absolute", top: -6, width: 20, height: 2.5,
              background: `linear-gradient(90deg,${T.accent.primary}80,${T.accent.primary})`, borderRadius: 2
            }} />}
            {isCenter ?
              <div style={{
                width: 52, height: 52, borderRadius: 17, marginTop: -14,
                background: active ? T.accent.gradient : T.bg.elevated,
                border: `2px solid ${active ? "transparent" : T.border.default}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: active ? T.shadow.navBtn : T.shadow.card,
                transition: "all .25s ease",
                animation: active ? "glowPulse 2.5s ease-in-out infinite" : "none"
              }}>
                <Icon size={24} strokeWidth={active ? 2.5 : 1.5} color={active ? "#fff" : T.text.muted} />
              </div> :
              <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />}
            <span style={{
              fontSize: 11, fontWeight: active ? 700 : 500, fontFamily: T.font.mono,
              marginTop: isCenter ? 2 : 0, letterSpacing: "0.02em"
            }}>{n.label}</span>
          </button>;
        })}
      </div>
    </div>

    {/* Factory Reset Mask */}
    {isResetting && (
      <div style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: T.bg.base,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        animation: "fadeIn 0.3s ease-out forwards"
      }}>
        <div className="spin" style={{
          width: 40, height: 40, borderRadius: 20,
          border: `3px solid ${T.border.default}`, borderTopColor: T.accent.primary
        }} />
        <p style={{ marginTop: 24, fontSize: 13, color: T.text.secondary, fontWeight: 600, fontFamily: T.font.mono, letterSpacing: "0.05em" }}>
          SECURELY ERASING...
        </p>
      </div>
    )}
  </div>;
}
