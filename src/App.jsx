import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import {
  History, Plus, RefreshCw, X, Eye, EyeOff,
  AlertTriangle, Loader2, CreditCard, Settings, Info, Home, Zap, Trash2, ClipboardPaste, LayoutDashboard, ReceiptText, Clock, MessageCircle
} from "lucide-react";
import { T, DEFAULT_CARD_PORTFOLIO, RENEWAL_CATEGORIES, APP_VERSION } from "./modules/constants.js";
import { DEFAULT_PROVIDER_ID, DEFAULT_MODEL_ID, getProvider, getModel } from "./modules/providers.js";
import { db, parseAudit, exportAllAudits, exportSelectedAudits, exportAuditCSV, advanceExpiredDate, cyrb53 } from "./modules/utils.js";
import { ensureCardIds, getCardLabel } from "./modules/cards.js";
import { loadCardCatalog } from "./modules/issuerCards.js";
import { GlobalStyles, Card, ErrorBoundary } from "./modules/ui.jsx";
import { StreamingView } from "./modules/components.jsx";
import { streamAudit, callAudit } from "./modules/api.js";
import { getSystemPrompt } from "./modules/prompts.js";
import { generateStrategy } from "./modules/engine.js";
import { POPULAR_STOCKS } from "./modules/marketData.js";
import { buildScrubber } from "./modules/scrubber.js";
import { haptic } from "./modules/haptics.js";
import { schedulePaydayReminder, cancelPaydayReminder, requestNotificationPermission, scheduleWeeklyAuditNudge, scheduleBillReminders } from "./modules/notifications.js";
import { ToastProvider, useToast } from "./modules/Toast.jsx";
import DashboardTab from "./modules/tabs/DashboardTab.jsx";
import InputForm from "./modules/tabs/InputForm.jsx";
import ResultsView from "./modules/tabs/ResultsView.jsx";
import HistoryTab from "./modules/tabs/HistoryTab.jsx";
import AIChatTab from "./modules/tabs/AIChatTab.jsx";
import SettingsTab from "./modules/tabs/SettingsTab.jsx";
import CardPortfolioTab from "./modules/tabs/CardPortfolioTab.jsx";
import RenewalsTab from "./modules/tabs/RenewalsTab.jsx";
import GuideModal from "./modules/tabs/GuideModal.jsx";
import LockScreen from "./modules/LockScreen.jsx";
import SetupWizard from "./modules/tabs/SetupWizard.jsx";
import { SecurityProvider, useSecurity } from "./modules/contexts/SecurityContext.jsx";
import { SettingsProvider, useSettings } from "./modules/contexts/SettingsContext.jsx";
import { PortfolioProvider, usePortfolio } from "./modules/contexts/PortfolioContext.jsx";
import { NavigationProvider, useNavigation } from "./modules/contexts/NavigationContext.jsx";
import { AuditProvider, useAudit } from "./modules/contexts/AuditContext.jsx";
import { uploadToICloud } from "./modules/cloudSync.js";
import { isPro, getGatingMode } from "./modules/subscription.js";
import { initRevenueCat } from "./modules/revenuecat.js";
import { isSecuritySensitiveKey } from "./modules/securityKeys.js";
import { evaluateBadges, unlockBadge, BADGE_DEFINITIONS } from "./modules/badges.js";

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
// APP ROOT — wraps with ToastProvider
// ═══════════════════════════════════════════════════════════════
export default function AppRoot() {
  return (
    <ToastProvider>
      <SettingsProvider>
        <SecurityProvider>
          <PortfolioProvider>
            <NavigationProvider>
              <AuditProvider>
                <CatalystCash />
              </AuditProvider>
            </NavigationProvider>
          </PortfolioProvider>
        </SecurityProvider>
      </SettingsProvider>
    </ToastProvider>
  );
}

function CatalystCash() {
  const toast = useToast();
  useEffect(() => { window.toast = toast; }, [toast]);
  const online = useOnline();

  const { requireAuth, setRequireAuth, appPasscode, setAppPasscode, useFaceId, setUseFaceId, isLocked, setIsLocked, privacyMode, setPrivacyMode, lockTimeout, setLockTimeout, appleLinkedId, setAppleLinkedId, isSecurityReady } = useSecurity();
  const { apiKey, setApiKey, aiProvider, setAiProvider, aiModel, setAiModel, persona, setPersona, personalRules, setPersonalRules, autoBackupInterval, setAutoBackupInterval, notifPermission, aiConsent, setAiConsent, showAiConsent, setShowAiConsent, financialConfig, setFinancialConfig, isSettingsReady } = useSettings();
  const { cards, setCards, bankAccounts, setBankAccounts, renewals, setRenewals, cardCatalog, badges, cardAnnualFees, isPortfolioReady } = usePortfolio();
  const { current, setCurrent, history, setHistory, moveChecks, setMoveChecks, loading, error, setError, useStreaming, setUseStreaming, streamText, elapsed, viewing, setViewing, trendContext, instructionHash, setInstructionHash, handleSubmit, handleCancelAudit, clearAll, deleteHistoryItem, isAuditReady, handleManualImport, isTest } = useAudit();
  const { tab, setTab, navTo, swipeToTab, swipeAnimClass, resultsBackTarget, setResultsBackTarget, setupReturnTab, setSetupReturnTab, onboardingComplete, setOnboardingComplete, showGuide, setShowGuide, inputMounted, lastCenterTab, inputBackTarget, SWIPE_TAB_ORDER } = useNavigation();

  const scrollRef = useRef(null);
  const bottomNavRef = useRef(null);
  const topBarRef = useRef(null);
  const swipeStart = useRef(null);
  const longPressTimer = useRef(null);
  const touchStartTime = useRef(0);

  const ready = isSecurityReady && isSettingsReady && isPortfolioReady && isAuditReady;

  // Pro subscription state — resolved async on mount
  const [proEnabled, setProEnabled] = useState(true);
  useEffect(() => {
    initRevenueCat().then(() => {
      if (getGatingMode() === "off") { setProEnabled(true); return; }
      isPro().then(setProEnabled).catch(() => setProEnabled(false));
    });
  }, []);

  const [showQuickMenu, setShowQuickMenu] = useState(false);

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
        const backup = { app: "Catalyst Cash", version: APP_VERSION, exportedAt: new Date().toISOString(), data: {} };
        const keys = await db.keys();
        for (const key of keys) {
          if (isSecuritySensitiveKey(key)) continue; // Never sync security credentials
          const val = await db.get(key);
          if (val !== null) backup.data[key] = val;
        }
        if (!("personal-rules" in backup.data)) {
          backup.data["personal-rules"] = personalRules ?? "";
        }
        await uploadToICloud(backup, null); // Auto-sync unencrypted (iCloud is per-user scoped); manual exports still use passphrase
      } catch (e) {
        console.error("iCloud auto-sync error:", e);
      }
    }, 15000); // 15 second debounce — avoid writing on every keystroke

    return () => clearTimeout(iCloudSyncTimer.current);
  }, [ready, history, renewals, cards, financialConfig, personalRules, appleLinkedId]);


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
      headerCard: { status: "GREEN", details: ["Demo audit with sample data", "Your real audit will use your actual finances"] },
      healthScore: { score: 88, grade: "A-", trend: "up", summary: "Excellent financial momentum. Strong savings buffers and aggressive debt paydown are compounding your wealth rapidly." },
      alertsCard: ["✅ Car insurance completely covered by Vault", "💰 Roth IRA maxed out for the year", "⚠️ Chase Sapphire utilization at 28% — aim for under 15%"],
      dashboardCard: [
        { category: "Checking", amount: "$8,450.00", status: "Above floor" },
        { category: "Vault", amount: "$22,200.00", status: "Fully funded" },
        { category: "Investments", amount: "$45,000.00", status: "Growing" },
        { category: "Other Assets", amount: "$101,000.00", status: "Home Equity" },
        { category: "Debts", amount: "$3,690.00", status: "1 card carrying balance" }
      ],
      netWorth: 172960.00,
      weeklyMoves: [
        "💳 Pay Chase Sapphire $500 aggressive principal payment",
        "📈 Transfer $1,000 to Vanguard Brokerage",
        "📊 Review Q3 savings goals progress",
        "💰 Rebalance Crypto portfolio"
      ],
      radar: [
        { item: "Electric Bill", amount: "$145.00", date: new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0] },
        { item: "Property Tax", amount: "$1,100.00", date: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0] }
      ],
      longRangeRadar: [
        { item: "Home Maintenance Fund", amount: "$5,000.00", date: "2026-06-01" },
        { item: "Family Vacation", amount: "$3,500.00", date: "2026-08-15" }
      ],
      milestones: ["Emergency fund fully stocked at 6 months", "Net Worth crossed $150K milestone last month"],
      investments: { balance: "$45,000.00", asOf: new Date().toISOString().split("T")[0], gateStatus: "Open — accelerating contributions" },
      nextAction: "Execute the $500 Chase Sapphire payment to crush high-interest debt, then funnel your excess $1,000 into Vanguard to maximize your wealth snowball."
    };
    const raw = JSON.stringify(demoJSON);
    const parsed = parseAudit(raw);
    if (!parsed) { toast.error("Demo parsing failed"); return; }
    const demoPortfolio = {
      bankAccounts: [
        { id: "demo-chk-1", bank: "Chase", name: "Chase Total Checking", accountType: "checking", mask: "7890", balance: 8450, type: "depository", subtype: "checking", date: new Date().toISOString() },
        { id: "demo-sav-1", bank: "Ally", name: "Ally High Yield Savings", accountType: "savings", mask: "1234", balance: 22200, type: "depository", subtype: "savings", date: new Date().toISOString() }
      ],
      cards: [
        { id: "demo-card-1", institution: "Chase", name: "Chase Sapphire Preferred", mask: "4321", balance: 3690, limit: 15000, apr: 24.99, lastPaymentDate: new Date().toISOString(), network: "visa" },
        { id: "demo-card-2", institution: "Amex", name: "Amex Gold", mask: "9876", balance: 0, limit: null, apr: 0, lastPaymentDate: new Date().toISOString(), network: "amex" }
      ],
      renewals: [
        { id: "demo-ren-1", name: "Netflix", amount: 15.49, interval: 1, intervalUnit: "months", nextDue: new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0], category: "subs" },
        { id: "demo-ren-2", name: "Car Insurance", amount: 145.00, interval: 1, intervalUnit: "months", nextDue: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0], category: "insurance" }
      ]
    };

    const audit = {
      ts: new Date().toISOString(), date: new Date().toISOString().split("T")[0],
      raw, parsed, isTest: true, moveChecks: {}, demoPortfolio,
      form: {
        date: new Date().toISOString().split("T")[0], checking: "8450", ally: "15200", debts: [
          { name: "Chase Sapphire", balance: "3690", limit: "15000", apr: "24.99", minPayment: "45", nextDue: "" }
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
    // Remove all demo/test audits from history
    const cleanedHistory = history.filter(a => !a.isTest);
    setHistory(cleanedHistory);
    await db.set("audit-history", cleanedHistory);

    // Find the most recent real (non-test) audit
    const realAudit = cleanedHistory.length > 0 ? cleanedHistory[0] : null;
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



  const [isResetting, setIsResetting] = useState(false);
  const resetTimerRef = useRef(null);
  const factoryReset = async () => {
    haptic.warning();
    toast.success("App securely erased. Restarting...");
    setIsResetting(true); // Unmounts SettingsTab immediately

    // Wait for any trailing debounces to flush from React to the DB before wiping
    resetTimerRef.current = setTimeout(async () => {
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
  // Cleanup factory reset timer on unmount
  useEffect(() => () => { if (resetTimerRef.current) clearTimeout(resetTimerRef.current); }, []);


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

  const navItems = [
    { id: "input", label: "Audit", icon: Plus, isCenter: false },
    { id: "chat", label: "Ask AI", icon: MessageCircle, isCenter: false },
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, isCenter: true },
    { id: "renewals", label: "Expenses", icon: ReceiptText, isCenter: false },
    { id: "cards", label: "Accounts", icon: CreditCard, isCenter: false }
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
      <SetupWizard />
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
    {isLocked && <LockScreen />}
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
          visibility: (tab === "history" || tab === "settings" || tab === "chat") ? "hidden" : "visible"
        }}><Info size={16} strokeWidth={1.8} /></button>
        <button onClick={() => setPrivacyMode(p => !p)} style={{
          width: 36, height: 36, borderRadius: 10, border: `1px solid ${privacyMode ? T.border.focus : T.border.default}`,
          background: privacyMode ? T.bg.surface : T.bg.glass, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          color: privacyMode ? T.accent.primary : T.text.dim, transition: "color .2s, border-color .2s",
          visibility: (tab === "history" || tab === "settings" || tab === "input" || tab === "chat") ? "hidden" : "visible"
        }} aria-label={privacyMode ? "Disable Privacy Mode" : "Enable Privacy Mode"}>{privacyMode ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}</button>
      </div>
      <span style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", fontSize: 13, fontWeight: 700, color: T.text.secondary, fontFamily: T.font.mono, letterSpacing: "0.04em", textAlign: "center", whiteSpace: "nowrap" }}>
        {tab === "dashboard" ? "HOME" : tab === "history" ? "HISTORY" : tab === "chat" ? "ASK AI" : tab === "renewals" ? "EXPENSES" : tab === "cards" ? "ACCOUNTS" : tab === "input" ? "INPUT" : tab === "results" ? "RESULTS" : tab === "settings" ? "CONFIG" : ""}
      </span>
      <button onClick={() => tab === "settings" ? navTo(lastCenterTab.current) : navTo("settings")} style={{
        width: 36, height: 36, borderRadius: 10, border: `1px solid ${tab === "settings" ? T.border.focus : T.border.default}`,
        background: tab === "settings" ? T.bg.surface : T.bg.glass, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
        color: tab === "settings" ? T.accent.primary : T.text.dim, transition: "color .2s, border-color .2s",
        visibility: tab === "settings" ? "hidden" : "visible"
      }} aria-label="Open Settings"><Settings size={16} strokeWidth={1.8} /></button>
    </div>

    {/* ═══════ OFFLINE BANNER ═══════ */}
    {!online && (
      <div style={{
        background: `${T.status.amber}15`, borderBottom: `1px solid ${T.status.amber}30`,
        padding: "6px 16px", textAlign: "center",
        fontSize: 11, color: T.status.amber, fontWeight: 600, fontFamily: T.font.mono,
        flexShrink: 0
      }}>
        ⚡ NO INTERNET — Audits unavailable
      </div>
    )}

    <div ref={scrollRef} className="scroll-area safe-scroll-body"
      onTouchMove={() => { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); }}
      onTouchStart={e => {
        swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
      }}
      onTouchEnd={e => {
        if (!swipeStart.current) return;
        if (loading) { swipeStart.current = null; return; } // block swipe during audit
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        const dx = endX - swipeStart.current.x;
        const dy = endY - swipeStart.current.y;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        const elapsed = Date.now() - swipeStart.current.t;
        const velocity = elapsed > 0 ? absDx / elapsed : 0; // px/ms

        // ── Native iOS swipe navigation ──
        // Must be primarily horizontal (2:1 ratio), exceed minimum distance, and reasonable speed
        const isHorizontal = absDx > absDy * 1.5;
        const meetsDistance = absDx > 50;
        const meetsVelocity = velocity > 0.3; // iOS-like flick sensitivity (0.3 px/ms)

        if (isHorizontal && meetsDistance && meetsVelocity) {
          const renderTab = tab === "settings" ? lastCenterTab.current : tab;

          // Special case: edge-swipe-back for Results → History
          if (renderTab === "results" && dx > 0 && (viewing || resultsBackTarget === "history")) {
            setResultsBackTarget(null); navTo("history"); haptic.light();
          }
          // Full-width swipe between tabs in SWIPE_TAB_ORDER
          else if (SWIPE_TAB_ORDER.includes(renderTab)) {
            if (dx < 0) swipeToTab("left");  // finger went left → next tab
            else swipeToTab("right");          // finger went right → prev tab
          }
        }
        swipeStart.current = null;
      }}
      style={{
        flex: 1, overflowY: (tab === "settings" || tab === "input" || tab === "chat") ? "hidden" : "auto", position: "relative",
        display: (tab === "input" || tab === "chat") ? "none" : undefined
      }}>
      {error && <Card style={{ borderColor: `${T.status.red}20`, background: T.status.redDim, margin: "8px 20px", borderLeft: `3px solid ${T.status.red}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <AlertTriangle size={14} color={T.status.red} strokeWidth={2.5} />
            <span style={{ fontSize: 12, fontWeight: 700, color: T.status.red }}>Error</span></div>
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: T.text.dim, cursor: "pointer", padding: 4 }}>
            <X size={14} /></button></div>
        <p style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.5 }}>{error}</p>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={() => { setError(null); navTo("input"); }} style={{
            flex: 1, padding: "10px 14px", borderRadius: T.radius.md,
            border: `1px solid ${T.accent.primary}40`, background: T.accent.primaryDim,
            color: T.accent.primary, fontSize: 12, fontWeight: 700, cursor: "pointer",
            fontFamily: T.font.mono
          }}>GO TO INPUT</button>
          <button onClick={() => setError(null)} style={{
            padding: "10px 14px", borderRadius: T.radius.md,
            border: `1px solid ${T.border.default}`, background: "transparent",
            color: T.text.secondary, fontSize: 12, fontWeight: 600, cursor: "pointer"
          }}>DISMISS</button>
        </div></Card>}

      {/* ═══════ LAZY TAB RENDERING — only mount active tab ═══════ */}
      {(() => {
        const renderTab = tab === "settings" ? lastCenterTab.current : tab;
        return (
          <div key={`${renderTab}-${privacyMode}`} className={swipeAnimClass}>
            {renderTab === "dashboard" && <ErrorBoundary><DashboardTab
              onRestore={handleRestoreFromHome} proEnabled={proEnabled}
              onRefreshDashboard={handleRefreshDashboard}
              onDemoAudit={handleDemoAudit} /></ErrorBoundary>}
            {renderTab === "results" && (loading ? <StreamingView streamText={streamText} elapsed={elapsed} isTest={isTest} modelName={getModel(aiProvider, aiModel).name} /> :
              !display ? (() => { setTimeout(() => navTo("dashboard"), 0); return null; })() :
                <>
                  {(viewing || resultsBackTarget === "history") && <div style={{ padding: "8px 20px" }}>
                    <button onClick={() => { setResultsBackTarget(null); navTo("history"); }} style={{
                      display: "flex", alignItems: "center", gap: 5,
                      background: T.bg.card, border: `1px solid ${T.border.default}`, borderRadius: T.radius.md,
                      padding: "8px 14px", color: T.text.secondary, fontSize: 11, fontWeight: 600, cursor: "pointer"
                    }}>← Back</button></div>}
                  <ErrorBoundary><ResultsView audit={display} moveChecks={displayMoveChecks} onToggleMove={toggleMove} streak={trendContext?.length || 0} /></ErrorBoundary></>)}
            {renderTab === "history" && <ErrorBoundary><HistoryTab toast={toast} /></ErrorBoundary>}
            {renderTab === "renewals" && <ErrorBoundary><RenewalsTab /></ErrorBoundary>}
            {renderTab === "cards" && <ErrorBoundary><CardPortfolioTab /></ErrorBoundary>}
          </div>
        );
      })()}
    </div>

    {/* ═══════ OVERLAY PANELS — rendered OUTSIDE main scroll but INSIDE flex flow ═══════ */}
    {inputMounted && <div className="slide-pane"
      onTouchMove={() => { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); }}
      onTouchStart={e => {
        swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
      }}
      onTouchEnd={e => {
        if (!swipeStart.current) return;
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        const dx = endX - swipeStart.current.x;
        const dy = endY - swipeStart.current.y;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        const elapsed = Date.now() - swipeStart.current.t;
        const velocity = elapsed > 0 ? absDx / elapsed : 0;
        const isHorizontal = absDx > absDy * 1.5;
        const meetsDistance = absDx > 50;
        const meetsVelocity = velocity > 0.3;
        if (isHorizontal && meetsDistance && meetsVelocity) {
          if (dx < 0) swipeToTab("left");
          else swipeToTab("right");
        }
        swipeStart.current = null;
      }} style={{
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
        renewals={renewals} cardAnnualFees={cardAnnualFees} cards={cards} bankAccounts={bankAccounts}
        onManualImport={handleManualImport} toast={toast} financialConfig={financialConfig} aiProvider={aiProvider} personalRules={personalRules}
        persona={persona}
        instructionHash={instructionHash} setInstructionHash={setInstructionHash} db={db} proEnabled={proEnabled}
        onBack={() => navTo("dashboard")} />
    </div>}
    {tab === "chat" && <div
      onTouchStart={e => {
        swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
      }}
      onTouchEnd={e => {
        if (!swipeStart.current) return;
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        const dx = endX - swipeStart.current.x;
        const dy = endY - swipeStart.current.y;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        const elapsed = Date.now() - swipeStart.current.t;
        const velocity = elapsed > 0 ? absDx / elapsed : 0;
        if (absDx > absDy * 1.5 && absDx > 50 && velocity > 0.3) {
          if (dx < 0) swipeToTab("left");
          else swipeToTab("right");
        }
        swipeStart.current = null;
      }}
      style={{
        display: "flex", flex: 1, minHeight: 0,
        zIndex: 15, background: T.bg.base,
        width: "100%", boxSizing: "border-box"
      }}>
      <AIChatTab proEnabled={proEnabled} />
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
      // Lock nav while audit runs
      pointerEvents: loading ? "none" : "auto",
      opacity: loading ? 0.45 : 1,
      transition: "opacity .3s ease",
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
            <button onClick={() => { setShowQuickMenu(false); navTo("history"); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'transparent', border: 'none', color: T.text.primary, fontSize: 14, fontWeight: 600, cursor: 'pointer', borderRadius: T.radius.sm }}>
              <Clock size={18} color={T.accent.primary} /> Audit History
            </button>

            <div style={{ height: 1, background: T.border.default, margin: '4px 0' }} />
            <button onClick={() => { setShowQuickMenu(false); navTo("settings"); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'transparent', border: 'none', color: T.text.primary, fontSize: 14, fontWeight: 600, cursor: 'pointer', borderRadius: T.radius.sm }}>
              <Settings size={18} color={T.text.dim} /> App Configuration
            </button>
          </div>
        </>
      )}

      {/* Audit-running indicator strip */}
      {loading && <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent, ${T.accent.primary}, ${T.accent.emerald}, transparent)`,
        animation: "shimmer 1.8s ease-in-out infinite",
        backgroundSize: "200% 100%"
      }} />}

      <div style={{
        position: "absolute", top: -1, left: "10%", right: "10%", height: 1,
        background: loading ? "none" : `linear-gradient(90deg,transparent,${T.accent.primary}25,${T.accent.emerald}20,transparent)`
      }} />

      <div style={{
        position: "relative",
        display: "flex", justifyContent: "space-evenly", alignItems: "flex-end",
        paddingTop: 6, paddingBottom: "calc(env(safe-area-inset-bottom, 10px) + 4px)"
      }}>
        {/* Sliding Active Indicator */}
        {navItems.findIndex(n => n.id === tab) !== -1 && (
          <div style={{
            position: "absolute", top: 0,
            width: 20, height: 3,
            background: `linear-gradient(90deg,${T.accent.primary}80,${T.accent.primary})`, borderRadius: 2,
            left: `calc(${navItems.findIndex(n => n.id === tab) * 20}% + 10% - 10px)`,
            transition: "left 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease",
            opacity: tab === "dashboard" ? 0 : 1,
            pointerEvents: "none"
          }} />
        )}
        {navItems.map((n) => {
          const Icon = n.icon; const isCenter = n.isCenter;
          const active = tab === n.id;

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
              if (tab !== n.id) navTo(n.id);
            }
          };

          return <button key={n.id}
            onMouseDown={isCenter ? handlePressStart : undefined}
            onMouseUp={isCenter ? handlePressEnd : undefined}
            onMouseLeave={isCenter ? () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); } : undefined}
            onTouchStart={isCenter ? handlePressStart : undefined}
            onTouchEnd={isCenter ? handlePressEnd : undefined}
            aria-label={n.label}
            onClick={!isCenter ? () => { if (tab !== n.id) { haptic.light(); navTo(n.id); } } : undefined}
            style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "flex-end", gap: 2,
              background: "none", border: "none", cursor: "pointer",
              color: active ? T.accent.primary : T.text.muted,
              padding: "4px 0", minHeight: 48,
              transition: "color .3s ease", position: "relative",
              userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none"
            }}>
            {isCenter ?
              <div style={{
                width: 48, height: 48, borderRadius: 16, marginTop: -12,
                background: active ? T.accent.gradient : T.bg.elevated,
                border: `2px solid ${active ? "transparent" : T.border.default}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: active ? T.shadow.navBtn : T.shadow.card,
                transition: "all .3s cubic-bezier(0.16, 1, 0.3, 1)",
                animation: active ? "glowPulse 2.5s ease-in-out infinite" : "none",
                transform: active ? "scale(1.05)" : "scale(1)"
              }}>
                <Icon size={22} strokeWidth={active ? 2.5 : 1.5} color={active ? "#fff" : T.text.muted} />
              </div> :
              <div style={{
                transition: "transform .3s cubic-bezier(0.16, 1, 0.3, 1)",
                transform: active ? "translateY(-2px)" : "translateY(0px)"
              }}>
                <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />
              </div>
            }
            <span style={{
              fontSize: 10, fontWeight: active ? 700 : 500, fontFamily: T.font.mono,
              marginTop: isCenter ? 2 : 0, letterSpacing: "0.02em",
              transition: "color .3s ease"
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
