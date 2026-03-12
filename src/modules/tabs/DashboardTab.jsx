import { useRef, useState, useEffect, useCallback, memo, lazy, Suspense } from "react";
import Confetti from "react-confetti";
import {
  Zap,
  Plus,
  Share2,
  Shield,
  CloudDownload,
  RefreshCw,
  Repeat,
  Activity,
  ReceiptText,
  ExternalLink,
  MessageCircle,
  CloudUpload,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  CheckCircle,
  Briefcase,
  Settings,
  Building2,
  CalendarClock,
  ChevronRight,
} from "lucide-react";
import { T } from "../constants.js";

import { fmt, fmtDate, exportAudit, shareAudit, stripPaycheckParens, db } from "../utils.js";
import { uploadToICloud } from "../cloudSync.js";
import { Card, Label, Badge, ProgressBar, InlineTooltip, getTracking } from "../ui.jsx";
import { Mono, StatusDot, PaceBar, Md, CountUp, Section } from "../components.jsx";
import { unlockBadge } from "../badges.js";
import DebtSimulator from "./DebtSimulator.jsx";
import FIReSimulator from "./FIReSimulator.jsx";
import WeeklyChallenges from "./WeeklyChallenges.jsx";
import CashFlowCalendar from "./CashFlowCalendar.jsx";
import CreditScoreSimulator from "./CreditScoreSimulator.jsx";
import BillNegotiationCard from "./BillNegotiationCard.jsx";
import { haptic } from "../haptics.js";
import { shouldShowGating, getCurrentTier, isGatingEnforced, getGatingMode } from "../subscription.js";
import { useSecurity } from "../contexts/SecurityContext.jsx";
import ProBanner from "./ProBanner.jsx";
import ErrorBoundary from "../ErrorBoundary.jsx";
import { usePlaidSync } from "../usePlaidSync.js";
import "./DashboardTab.css";
import { useCoachmark, COACHMARKS } from "../coachmarks.js";
import Coachmark from "../Coachmark.jsx";

import { useAudit } from "../contexts/AuditContext.jsx";
import { useSettings } from "../contexts/SettingsContext.jsx";
import { usePortfolio } from "../contexts/PortfolioContext.jsx";
import { useNavigation } from "../contexts/NavigationContext.jsx";

// ── Extracted dashboard components ──
import useDashboardData from "../dashboard/useDashboardData.js";
import HealthGauge from "../dashboard/HealthGauge.jsx";
import AlertStrip from "../dashboard/AlertStrip.jsx";
import MetricsBar from "../dashboard/MetricsBar.jsx";
import { SafeToSpendCard } from "../dashboard/SafeToSpendCard.jsx";

const SYNC_COOLDOWNS = { free: 60 * 60 * 1000, pro: 5 * 60 * 1000 };
let _autoSyncDone = false; // Survives component remounts — only auto-sync once per app session
const LazyProPaywall = lazy(() => import("./ProPaywall.jsx"));


const DashboardSection = ({ children, marginTop = 12 }) => (
  <section style={{ marginTop, marginBottom: 12 }}>
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {children}
    </div>
  </section>
);

export default memo(function DashboardTab({
  onRestore,
  proEnabled = false,
  onDemoAudit,
  onRefreshDashboard,
  onViewTransactions,
  onDiscussWithCFO,
}) {
  const { current, history } = useAudit();
  const { financialConfig, setFinancialConfig, autoBackupInterval } = useSettings();
  const { cards, setCards, bankAccounts, setBankAccounts, renewals, badges } = usePortfolio();
  const { navTo, setSetupReturnTab } = useNavigation();
  const { appPasscode, privacyMode } = useSecurity();
  const [showPaywall, setShowPaywall] = useState(false);

  // ── Plaid Balance Sync (shared hook) ──
  const { syncing, sync: handleSyncBalances } = usePlaidSync({
    cards,
    bankAccounts,
    financialConfig,
    setCards,
    setBankAccounts,
    setFinancialConfig,
    successMessage: "Balances synced — run a new audit to reflect updated numbers",
  });

  // ── Intelligent Auto-sync ──
  // Triggers sync on app boot or whenever the app comes back to the foreground.
  useEffect(() => {
    const trySync = () => {
      if (document.visibilityState === "visible") {
        const hasPlaid = cards.some(c => c._plaidAccountId) || bankAccounts.some(b => b._plaidAccountId);
        if (hasPlaid) handleSyncBalances();
      }
    };

    // Run on mount (if visible)
    if (!_autoSyncDone) {
      _autoSyncDone = true;
      // trySync(); // CFO HOTFIX: Disabled to save $0.10/call on launch
    }

    // Run every time the app comes to the foreground
    // document.addEventListener("visibilitychange", trySync); // CFO HOTFIX: Disabled foreground polling
    // return () => document.removeEventListener("visibilitychange", trySync);
  }, [cards, bankAccounts, handleSyncBalances]);

  const onRunAudit = () => navTo("input");
  const onViewResult = () => navTo("results", current);
  const onGoSettings = () => {
    setSetupReturnTab("dashboard");
    navTo("settings");
  };

  const p = current?.parsed;
  const {
    dashboardMetrics,
    floor,
    investmentSnapshot,
    fireProjection,
    streak,
    noSpendStreak,
    chartData,
    scoreData,
    spendData,
    chartA11y,
    freedomStats,
    alerts,
    portfolioMetrics,
  } = useDashboardData();

  // Confetti
  const [runConfetti, setRunConfetti] = useState(false);
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const prevCurrentTs = useRef(current?.ts);

  useEffect(() => {
    const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ── Streak milestone celebration ──
  const STREAK_MILESTONES = {
    4: { emoji: "🔥", label: "1 Month Strong!" },
    8: { emoji: "💪", label: "2 Months of Consistency!" },
    12: { emoji: "🏆", label: "Quarter Master!" },
    26: { emoji: "⚡", label: "Half-Year Hero!" },
    52: { emoji: "👑", label: "Full Year. Legend." },
  };
  const streakMilestoneChecked = useRef(false);

  useEffect(() => {
    if (current?.ts !== prevCurrentTs.current) {
      prevCurrentTs.current = current?.ts;
      if (current?.parsed?.healthScore?.score >= 95 && !current?.isTest) {
        setRunConfetti(true);
        setTimeout(() => setRunConfetti(false), 8000);
      }
    }
  }, [current]);

  useEffect(() => {
    if (streakMilestoneChecked.current || !streak) return;
    streakMilestoneChecked.current = true;
    const m = STREAK_MILESTONES[streak];
    if (m) {
      (async () => {
        const key = `streak-milestone-${streak}`;
        const seen = await db.get(key);
        if (!seen) {
          await db.set(key, true);
          setRunConfetti(true);
          setTimeout(() => setRunConfetti(false), 6000);
          if (window.toast) window.toast.success(`${m.emoji} W${streak}: ${m.label}`);
        }
      })();
    }
  }, [streak]);

  // ── Backup nudge logic ──
  const [showBackupNudge, setShowBackupNudge] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  useEffect(() => {
    if (autoBackupInterval && autoBackupInterval !== "off") return; // auto-backup is on, no nudge needed
    (async () => {
      const dismissed = await db.get("backup-nudge-dismissed");
      if (dismissed && Date.now() - dismissed < 7 * 86400000) return; // dismissed within 7 days
      const lastTs = await db.get("last-backup-ts");
      if (!lastTs || Date.now() - lastTs > 7 * 86400000) {
        setShowBackupNudge(true);
      }
    })();
  }, [autoBackupInterval]);

  const handleBackupNow = async () => {
    setBackingUp(true);
    try {
      const { isSecuritySensitiveKey, sanitizePlaidForBackup } = await import("../securityKeys.js");
      const backup = { app: "Catalyst Cash", version: "2.0", exportedAt: new Date().toISOString(), data: {} };
      const keys = await db.keys();
      for (const key of keys) {
        if (isSecuritySensitiveKey(key)) continue;
        const val = await db.get(key);
        if (val !== null) backup.data[key] = val;
      }
      // Include sanitized Plaid metadata for reconnect deduplication
      const plaidConns = await db.get("plaid-connections");
      if (Array.isArray(plaidConns) && plaidConns.length > 0) {
        backup.data["plaid-connections-sanitized"] = sanitizePlaidForBackup(plaidConns);
      }
      await uploadToICloud(backup, appPasscode || null);
      await db.set("last-backup-ts", Date.now());
      setShowBackupNudge(false);
      if (window.toast) window.toast.success("✅ Backed up to iCloud");
    } catch (e) {
      if (window.toast) window.toast.error("Backup failed: " + (e.message || "Unknown error"));
    }
    setBackingUp(false);
  };

  const dismissBackupNudge = async () => {
    await db.set("backup-nudge-dismissed", Date.now());
    setShowBackupNudge(false);
  };

  // ── Welcome-back greeting ──
  const greeting = (() => {
    const hour = new Date().getHours();
    const timeGreet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    // Check days since last audit
    if (current?.date) {
      const daysSince = Math.floor((Date.now() - new Date(current.date).getTime()) / 86400000);
      if (daysSince >= 7) return `Welcome back! It's been ${daysSince} days — let's catch up.`;
    }
    if (streak > 1) return `${timeGreet}. W${streak} streak going strong 🔥`;
    return `${timeGreet}. Let's check your numbers.`;
  })();

  // ── Setup Checklist ──
  const hasCards = cards.length > 0;
  const hasRenewals = (renewals || []).length > 0;
  const steps = [
    {
      id: "profile",
      title: "Configure Profile",
      desc: "Income, zip code, and basic settings.",
      done: financialConfig?.paycheckStandard > 0 || financialConfig?.incomeSources?.length > 0,
      action: onGoSettings,
      Icon: Settings,
    },
    {
      id: "cards",
      title: "Connect Accounts",
      desc: "Securely link your banks via Plaid.",
      done: hasCards,
      action: () => { setSetupReturnTab("dashboard"); navTo("portfolio"); },
      Icon: Building2,
    },
    {
      id: "renewals",
      title: "Track Subscriptions",
      desc: "Add Netflix, Spotify, rent, etc.",
      done: hasRenewals,
      action: () => { setSetupReturnTab("dashboard"); navTo("cashflow"); },
      Icon: CalendarClock,
    }
  ];
  const completedSteps = steps.filter(s => s.done).length;
  const progressPct = (completedSteps / steps.length) * 100;

  // ── ACTIVE DASHBOARD ──
  const rawStatus = String(p?.status || "UNKNOWN").toUpperCase();
  const cleanStatus = rawStatus.includes("GREEN")
    ? "GREEN"
    : rawStatus.includes("RED")
      ? "RED"
      : rawStatus.includes("YELLOW")
        ? "YELLOW"
        : "UNKNOWN";
  const sc =
    cleanStatus === "GREEN"
      ? T.status.green
      : cleanStatus === "YELLOW"
        ? T.status.amber
        : cleanStatus === "RED"
          ? T.status.red
          : T.text.dim;
  const hs = p?.healthScore || {};
  const score = typeof hs.score === "number" ? hs.score : 0;
  const grade = hs.grade || "?";
  const summary = hs.summary || "";
  const scoreColor = score >= 80 ? T.status.green : score >= 60 ? T.status.amber : T.status.red;

  // ── Synthetic Percentile (client-side, no real user data) ──
  const percentile = (() => {
    if (score === 0) return 0;
    const z = (score - 62) / 16;
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989422804 * Math.exp((-z * z) / 2);
    const phi = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return Math.round(z > 0 ? (1 - phi) * 100 : phi * 100);
  })();

  const quickMetrics = [
    { l: "Checking", v: portfolioMetrics?.spendableCash, c: T.text.primary, icon: "💳" },
    (portfolioMetrics?.savingsCash ?? 0) > 0 ? { l: "Savings", v: portfolioMetrics.savingsCash, c: T.status.blue, icon: "🏦" } : null,
    { l: "Net Worth", v: portfolioMetrics?.netWorth, c: T.text.primary, icon: "📊" },
    (portfolioMetrics?.totalInvestments ?? 0) > 0 ? { l: "Investments", v: portfolioMetrics.totalInvestments, c: T.accent.emerald, icon: "📈" } : null,
    { l: "Pending", v: dashboardMetrics.pending, c: T.status.amber, icon: "⏳" },
    (portfolioMetrics?.ccDebt ?? 0) > 0 ? { l: "CC Debt", v: portfolioMetrics.ccDebt, c: T.status.red, icon: "💳" } : null,
    (portfolioMetrics?.totalDebtBalance ?? 0) > 0 ? { l: "Loans", v: portfolioMetrics.totalDebtBalance, c: T.status.red, icon: "🏦" } : null,
    (portfolioMetrics?.totalOtherAssets ?? 0) > 0 ? { l: "Other Assets", v: portfolioMetrics.totalOtherAssets, c: T.text.secondary, icon: "🏠" } : null,
  ].filter(Boolean);

  return (
    <div className="page-body stagger-container" aria-live="polite" style={{ paddingBottom: 0, display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <div style={{ width: "100%", maxWidth: 768, display: "flex", flexDirection: "column" }}>
      {runConfetti && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, pointerEvents: "none" }}>
          <Confetti
            width={windowSize.width}
            height={windowSize.height}
            recycle={false}
            numberOfPieces={400}
            gravity={0.15}
          />
        </div>
      )}

      {/* ═══ Header + inline greeting ═══ */}
      <div style={{ paddingTop: 16, paddingBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: getTracking(22, 900), margin: 0 }}>Dashboard</h1>
          <p style={{ fontSize: 11, color: T.text.dim, margin: "2px 0 0", fontWeight: 500, letterSpacing: "0.01em" }}>{greeting}</p>
        </div>
        {streak > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 20, background: `${T.accent.emerald}12`, border: `1px solid ${T.status.green}25`, flexShrink: 0 }}>
            <span style={{ fontSize: 12 }}>🔥</span>
            <span style={{ fontSize: 10, fontWeight: 800, color: T.status.green, fontFamily: T.font.mono }}>W{streak}</span>
          </div>
        )}
      </div>


      {/* ═══ BACKUP NUDGE ═══ */}
      {showBackupNudge && (
        <Card
          style={{
            borderLeft: `3px solid ${T.status.amber}`,
            background: `${T.status.amberDim}`,
            padding: "10px 14px",
            marginBottom: 10,
            animation: "fadeInUp .4s ease-out",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Shield size={14} color={T.status.amber} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: T.status.amber,
                fontFamily: T.font.mono,
                letterSpacing: "0.04em",
              }}
            >
              BACKUP REMINDER
            </span>
            <button
              onClick={dismissBackupNudge}
              style={{
                marginLeft: "auto",
                background: "none",
                border: "none",
                color: T.text.dim,
                cursor: "pointer",
                fontSize: 16,
                padding: 4,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
          <p style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.4, margin: "0 0 8px" }}>
            Your data hasn't been backed up recently. Protect your financial data.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleBackupNow}
              disabled={backingUp}
              className="hover-btn"
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                padding: "8px 12px",
                borderRadius: T.radius.md,
                border: "none",
                background: `linear-gradient(135deg, ${T.status.amber}, #D97706)`,
                color: "#fff",
                fontSize: 11,
                fontWeight: 800,
                cursor: "pointer",
                opacity: backingUp ? 0.6 : 1,
              }}
            >
              <CloudUpload size={13} />
              {backingUp ? "Backing up..." : "Back Up Now"}
            </button>
            <button
              onClick={() => {
                dismissBackupNudge();
                navTo("settings");
              }}
              className="hover-btn"
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                padding: "8px 12px",
                borderRadius: T.radius.md,
                border: `1px solid ${T.status.amber}40`,
                background: `${T.status.amber}10`,
                color: T.status.amber,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Enable Auto-Backup
            </button>
          </div>
        </Card>
      )}

      {/* ═══ COMMAND CENTER ═══ */}
      <>
          {/* Demo Banner */}
          {current?.isTest && (
            <Card
              style={{
                borderLeft: `3px solid ${T.status.amber} `,
                background: `${T.status.amberDim} `,
                padding: "10px 14px",
                marginBottom: 10,
              }}
            >
              <div
                data-no-swipe="true"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: T.status.amber,
                      fontFamily: T.font.mono,
                      letterSpacing: "0.06em",
                    }}
                  >
                    DEMO DATA
                  </div>
                  <p style={{ fontSize: 10, color: T.text.secondary, lineHeight: 1.4, margin: 0 }}>
                    Showing sample data from a demo audit
                  </p>
                </div>
                <button
                  className="a11y-hit-target"
                  onClick={onRefreshDashboard}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "6px 12px",
                    borderRadius: T.radius.md,
                    border: "none",
                    background: `linear-gradient(135deg, ${T.accent.primary}, #6C60FF)`,
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 800,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  <RefreshCw size={11} strokeWidth={2.5} />
                  Reset
                </button>
              </div>
            </Card>
          )}

           {/* Pro Upgrade Banner — slim strip, placed after hero so data leads */}
           {showPaywall && (
             <Suspense fallback={null}>
               <LazyProPaywall onClose={() => setShowPaywall(false)} />
             </Suspense>
           )}

           {/* ═══ HERO CARD — Net Worth + Health Score ═══ */}
           <Card
             animate
             className="hover-card a11y-hit-target"
             onClick={() => { haptic.selection(); navTo("portfolio"); }}
             style={{
               padding: "24px 20px",
               marginBottom: 12,
               background: T.bg.card,
               border: `1px solid ${T.border.subtle}`,
               cursor: "pointer",
               position: "relative",
               overflow: "hidden",
             }}
           >
             {/* Top row: label + health pill */}
             <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
               <span style={{ fontSize: 12, fontWeight: 600, color: T.text.dim, letterSpacing: "0.02em" }}>
                 Net Worth
               </span>
               {hs.score != null ? (
                 <div
                   onClick={e => { e.stopPropagation(); haptic.selection(); navTo("audit"); }}
                   style={{
                     display: "inline-flex",
                     alignItems: "center",
                     gap: 6,
                     padding: "4px 10px",
                     borderRadius: 99,
                     background: `${scoreColor}12`,
                     border: `1px solid ${scoreColor}25`,
                     cursor: "pointer",
                   }}
                 >
                   <div style={{ width: 6, height: 6, borderRadius: "50%", background: scoreColor }} />
                   <span style={{ fontSize: 11, fontWeight: 800, color: scoreColor, fontFamily: T.font.mono, letterSpacing: "0.02em" }}>
                     {grade} · {score}/100
                   </span>
                 </div>
               ) : (
                 <div
                   onClick={e => { e.stopPropagation(); haptic.selection(); navTo("audit"); }}
                   style={{
                     display: "inline-flex",
                     alignItems: "center",
                     gap: 5,
                     padding: "4px 10px",
                     borderRadius: 99,
                     background: `${T.accent.primary}12`,
                     border: `1px solid ${T.accent.primary}25`,
                     cursor: "pointer",
                   }}
                 >
                   <Zap size={10} color={T.accent.primary} strokeWidth={3} />
                   <span style={{ fontSize: 10, fontWeight: 700, color: T.accent.primary }}>Run Audit</span>
                 </div>
               )}
             </div>

             {/* Big number block mimicking Portfolio hero style */}
           <div style={{
             display: "flex", flexDirection: "column", gap: 16,
             background: `linear-gradient(180deg, ${T.bg.card} 0%, transparent 100%)`,
             border: `1px solid ${T.border.subtle}`,
             borderRadius: T.radius.lg,
             padding: "20px 16px 24px",
             boxShadow: `0 16px 48px rgba(16,185,129,0.06), 0 8px 24px rgba(138,99,210,0.1), inset 0 1px 0 rgba(255,255,255,0.05)`,
             marginBottom: 6
           }}>
             <div>
               <h1 style={{ fontSize: 13, fontWeight: 700, color: T.text.secondary, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                 Net Worth
               </h1>
               <div style={{ 
                 fontSize: 36, 
                 fontWeight: 900, 
                 color: privacyMode ? T.text.dim : T.text.primary, 
                 letterSpacing: "-0.02em",
               }}>
                 {privacyMode ? "••••••" : fmt(portfolioMetrics?.netWorth || 0)}
               </div>
             </div>
           </div>

             {/* Status tag */}
             {hs.score != null && (
               <span style={{ fontSize: 11, color: T.text.dim, fontWeight: 500 }}>
                 Status: <span style={{ color: scoreColor, fontWeight: 700 }}>{cleanStatus}</span>
                 {percentile > 0 && <span style={{ color: T.text.dim }}> · Top {100 - percentile}%</span>}
               </span>
             )}
           </Card>

           {/* ═══ QUICK METRICS ROW ═══ */}
           {(() => {
             const safeToSpend = (() => {
               const cash = portfolioMetrics?.spendableCash ?? 0;
               const ccMin = (portfolioMetrics?.ccDebt ?? 0) > 0 ? Math.max((portfolioMetrics.ccDebt) * 0.01, 25) : 0;
               return cash - ccMin - floor;
             })();
             const safeColor = safeToSpend <= 0 ? T.status.red : safeToSpend < (portfolioMetrics?.spendableCash ?? 0) * 0.2 ? T.status.amber : T.status.green;
             const metrics = [
               { label: "Safe to Spend", value: Math.max(0, safeToSpend), color: safeColor },
               { label: "Checking", value: portfolioMetrics?.spendableCash ?? 0, color: T.text.primary },
               (portfolioMetrics?.ccDebt ?? 0) > 0 ? { label: "CC Debt", value: portfolioMetrics.ccDebt, color: T.status.red } : null,
               (portfolioMetrics?.savingsCash ?? 0) > 0 ? { label: "Savings", value: portfolioMetrics.savingsCash, color: T.text.primary } : null,
             ].filter(Boolean);

             return (
               <div style={{
                 display: "grid",
                 gridTemplateColumns: `repeat(${Math.min(metrics.length, 4)}, 1fr)`,
                 gap: 8,
                 marginBottom: 12,
               }}>
                 {metrics.map(m => (
                   <div
                     key={m.label}
                     style={{
                       padding: "12px 10px",
                       background: T.bg.card,
                       border: `1px solid ${T.border.subtle}`,
                       borderRadius: T.radius.md,
                       textAlign: "center",
                     }}
                   >
                     <div style={{ fontSize: 9, fontWeight: 700, color: T.text.dim, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 4 }}>
                       {m.label}
                     </div>
                     <div style={{ fontSize: 14, fontWeight: 800, color: privacyMode ? T.text.dim : m.color, fontFamily: T.font.mono, letterSpacing: "-0.02em" }}>
                       {privacyMode ? "••••" : fmt(m.value)}
                     </div>
                   </div>
                 ))}
               </div>
             );
           })()}

           {/* ═══ ACTION ROW — Sync + Ledger ═══ */}
           <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
             {/* Sync Balances (only if Plaid linked) */}
             {!current?.isTest && (cards.some(c => c._plaidAccountId) || bankAccounts.some(b => b._plaidAccountId)) && (
               <button
                 onClick={() => { haptic.medium(); handleSyncBalances(); }}
                 disabled={syncing}
                 className="hover-btn"
                 style={{
                   flex: 1,
                   display: "flex",
                   alignItems: "center",
                   justifyContent: "center",
                   gap: 6,
                   padding: "12px",
                   borderRadius: T.radius.md,
                   border: `1px solid ${T.border.subtle}`,
                   background: T.bg.card,
                   color: T.text.primary,
                   cursor: syncing ? "wait" : "pointer",
                   transition: "all .2s",
                   opacity: syncing ? 0.7 : 1,
                   fontSize: 11,
                   fontWeight: 700,
                   fontFamily: T.font.mono,
                 }}
               >
                 <RefreshCw size={12} strokeWidth={2.5} style={{ animation: syncing ? "ringSweep 1s linear infinite" : "none" }} />
                 {syncing ? "SYNC…" : "SYNC"}
               </button>
             )}
             {/* Ledger */}
             <button
               onClick={() => {
                 haptic.light();
                 if (proEnabled || !isGatingEnforced()) {
                   onViewTransactions?.();
                 } else {
                   setShowPaywall(true);
                 }
               }}
               className="hover-btn"
               style={{
                 flex: 1,
                 display: "flex",
                 alignItems: "center",
                 justifyContent: "center",
                 gap: 6,
                 padding: "12px",
                 borderRadius: T.radius.md,
                 border: `1px solid ${T.border.subtle}`,
                 background: T.bg.card,
                 color: T.text.primary,
                 cursor: "pointer",
                 transition: "all .2s",
                 position: "relative",
                 fontSize: 11,
                 fontWeight: 700,
                 fontFamily: T.font.mono,
               }}
             >
               {!proEnabled && (
                 <div style={{ position: "absolute", top: 6, right: 6, fontSize: 7, fontWeight: 800, background: T.accent.primary, color: "#fff", padding: "1px 4px", borderRadius: 4, fontFamily: T.font.mono }}>PRO</div>
               )}
               <ReceiptText size={12} strokeWidth={2} />
               LEDGER
             </button>
           </div>

           {/* Pro upsell — compact strip for free users only */}
           {shouldShowGating() && !proEnabled && (
             <ProBanner compact onUpgrade={() => setShowPaywall(true)} label="Unlock Catalyst Pro" sublabel="50 AI chats/day · Plaid sync · Card Wizard" />
           )}

           {/* 📋 SETUP CHECKLIST — Minimalist & Premium */}
           {completedSteps < steps.length && (
             <DashboardSection marginTop={16}>
               <div
                 className="fade-in slide-up"
                 style={{
                   padding: "20px 24px",
                   borderRadius: 24,
                   background: `linear-gradient(160deg, ${T.bg.card}, transparent)`,
                   border: `1px solid ${T.accent.emerald}20`,
                   boxShadow: `0 8px 32px ${T.accent.emerald}08`,
                   position: "relative",
                   overflow: "hidden",
                 }}
               >
                 {/* Glassy ambient glow */}
                 <div style={{ position: "absolute", top: -40, right: -40, width: 120, height: 120, background: T.accent.emerald, opacity: 0.08, filter: "blur(40px)", pointerEvents: "none" }} />
                 
                 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
                   <div>
                     <h3 style={{ fontSize: 18, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em", margin: "0 0 4px" }}>
                       Welcome Checklist
                     </h3>
                     <p style={{ fontSize: 13, color: T.text.secondary, margin: 0 }}>
                       Complete your setup to unlock AI accuracy
                     </p>
                   </div>
                   <div style={{ textAlign: "right" }}>
                     <div style={{ fontSize: 11, fontWeight: 800, color: T.accent.emerald, fontFamily: T.font.mono, letterSpacing: "0.02em", marginBottom: 6 }}>
                       {Math.round(progressPct)}%
                     </div>
                     <div style={{ width: 64, height: 4, background: `${T.accent.emerald}20`, borderRadius: 2, overflow: "hidden" }}>
                       <div style={{ height: "100%", width: `${progressPct}%`, background: T.accent.emerald, transition: "width 0.8s cubic-bezier(.16,1,.3,1)" }} />
                     </div>
                   </div>
                 </div>

                 <div style={{ display: "grid", gap: 8 }}>
                   {steps.map((step, i) => (
                     <div
                       key={step.id}
                       onClick={() => { haptic.selection(); step.action(); }}
                       style={{
                         display: "flex",
                         alignItems: "center",
                         gap: 16,
                         padding: "16px",
                         borderRadius: 16,
                         cursor: "pointer",
                         background: step.done ? "transparent" : T.bg.elevated,
                         border: `1px solid ${step.done ? "transparent" : T.border.default}`,
                         transition: "all 0.3s cubic-bezier(.16,1,.3,1)",
                         opacity: step.done ? 0.6 : 1,
                       }}
                       onMouseEnter={e => {
                         if (!step.done) {
                           e.currentTarget.style.transform = "translateY(-2px)";
                           e.currentTarget.style.boxShadow = `0 6px 16px ${T.bg.base}`;
                         }
                       }}
                       onMouseLeave={e => {
                         if (!step.done) {
                           e.currentTarget.style.transform = "none";
                           e.currentTarget.style.boxShadow = "none";
                         }
                       }}
                     >
                       <div style={{
                         width: 40, height: 40, borderRadius: 20,
                         display: "flex", alignItems: "center", justifyContent: "center",
                         background: step.done ? T.accent.emerald : `${T.text.muted}10`,
                         color: step.done ? "#fff" : T.text.prominent,
                         transition: "all 0.3s",
                       }}>
                         {step.done ? <CheckCircle size={18} strokeWidth={2.5} /> : <step.Icon size={18} strokeWidth={2} />}
                       </div>
                       <div style={{ flex: 1 }}>
                         <div style={{ fontSize: 14, fontWeight: 700, color: step.done ? T.text.secondary : T.text.primary, textDecoration: step.done ? "line-through" : "none" }}>
                           {step.title}
                         </div>
                         <div style={{ fontSize: 12, color: T.text.dim, marginTop: 2 }}>{step.desc}</div>
                       </div>
                       {!step.done && <ChevronRight size={18} color={T.text.muted} />}
                     </div>
                   ))}
                 </div>
               </div>
             </DashboardSection>
           )}
          {/* ═══ ALERT STRIP ═══ */}
          <AlertStrip alerts={alerts} />



          <DashboardSection title="AI CFO & Next Steps">
          {/* ═══ EMPTY STATE — no audit yet ═══ */}
          {!p && !summary && !hs.narrative && (
             <Card
               animate
               delay={200}
               onClick={() => {
                 haptic.medium();
                 onRunAudit();
               }}
               className="hover-card"
               style={{
                 padding: 24,
                 marginBottom: 16,
                 textAlign: "center",
                 cursor: "pointer",
                 border: `1.5px solid ${T.accent.emerald}40`,
                 background: `linear-gradient(145deg, ${T.bg.card}, ${T.accent.emerald}10)`,
                 boxShadow: `0 8px 24px ${T.accent.emerald}25`,
                 position: "relative",
                 overflow: "hidden"
               }}
             >
               <div style={{ position: "absolute", top: -50, right: -50, width: 100, height: 100, background: T.accent.emerald, opacity: 0.1, filter: "blur(40px)", pointerEvents: "none" }} />
       
               <div style={{
                 width: 54, height: 54, borderRadius: 27,
                 background: `linear-gradient(135deg, ${T.accent.emerald}, #10B981)`,
                 display: "flex", alignItems: "center", justifyContent: "center",
                 margin: "0 auto 16px",
                 boxShadow: `0 4px 16px ${T.accent.emerald}60`
               }}>
                 <Zap size={24} color="#fff" strokeWidth={2.5} />
               </div>
       
               <h2 style={{ fontSize: 18, fontWeight: 800, color: T.text.primary, marginBottom: 8 }}>
                 Run Your First Audit
               </h2>
               <p style={{ fontSize: 13, color: T.text.secondary, marginBottom: 20, lineHeight: 1.4 }}>
                 It takes 2 minutes. Input your week's numbers to instantly generate your Wealth Trajectory, Budget Pace, and AI CFO advice.
               </p>
       
               <button style={{
                 width: "100%",
                 padding: "14px",
                 borderRadius: T.radius.lg,
                 border: "none",
                 background: T.accent.emerald,
                 color: "#fff",
                 fontSize: 14,
                 fontWeight: 800,
                 cursor: "pointer",
                 display: "flex", alignItems: "center", justifyContent: "center", gap: 8
               }}>
                 Begin Audit <Activity size={16} />
               </button>
             </Card>
          )}
          {/* AI Insights Action Hub */}
          {(summary || hs.narrative) && (
            <div
              className="fade-in"
              style={{
                padding: "24px 20px",
                marginBottom: 24,
                background: "transparent",
                border: `1px solid ${T.border.subtle}`,
                borderRadius: 24,
                animationDelay: "0.2s"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Zap size={16} color={scoreColor} strokeWidth={2.5} />
                <span style={{ fontSize: 14, fontWeight: 800, color: T.text.primary }}>CFO Insights</span>
              </div>
              
              {summary && (
                <p style={{ fontSize: 13, color: T.text.secondary, lineHeight: 1.5, margin: "0 0 16px" }}>
                  {summary}
                </p>
              )}
              
              {hs.narrative && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {hs.narrative
                    .split(/(?<=[.?!])\s+/)
                    .filter(Boolean)
                    .map((sentence, i) => {
                      // First sentence = positive/summary; subsequent = action/advisory
                      const isPositive = i === 0;
                      const iconColor = isPositive ? T.status.green : T.status.blue;
                      return (
                        <div key={i} style={{ display: "flex", gap: 10, alignItems: "start", background: T.bg.surface, padding: "10px 12px", borderRadius: T.radius.md, borderLeft: `2px solid ${iconColor}30` }}>
                          <div style={{ marginTop: 2, flexShrink: 0 }}>
                            {isPositive ? (
                              <CheckCircle size={13} color={T.status.green} />
                            ) : (
                              <ArrowUpRight size={13} color={T.status.blue} />
                            )}
                          </div>
                          <p style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.5, margin: 0 }}>
                            {sentence.trim()}
                          </p>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* ═══ NEXT ACTION ═══ */}
          {p?.sections?.nextAction && (
            <div style={{ padding: "24px 20px", background: "transparent", border: `1px solid ${T.border.subtle}`, borderRadius: 24, position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: `linear-gradient(135deg, ${T.accent.primary}, #6C60FF)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: `0 4px 12px ${T.accent.primary}60`,
                  }}
                >
                  <Zap size={15} color="#fff" strokeWidth={2.5} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>
                  Prioritized Next Action
                </span>
              </div>
              <div
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  position: "relative",
                }}
              >
                <Md text={stripPaycheckParens(p.sections.nextAction)} />
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: "1.5em",
                    background: `linear-gradient(transparent, ${T.bg.card})`,
                    pointerEvents: "none",
                  }}
                />
              </div>
            </div>
          )}

          {/* ═══ DISCUSS WITH CFO ═══ */}
          {p && onDiscussWithCFO && (
            <button
              className="hover-btn"
              onClick={() => {
                haptic.light();
                const status = p?.status || "unknown";
                const hsScore = p?.healthScore?.score;
                const nextAction = p?.sections?.nextAction || "";
                const prompt = `I just reviewed my latest audit (Status: ${status}${hsScore != null ? `, Health Score: ${hsScore}/100` : ""}). ${nextAction ? `My next action says: "${nextAction.slice(0, 200)}"` : ""} Walk me through what I should focus on right now and explain why.`;
                onDiscussWithCFO(prompt);
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                marginTop: 6,
                marginBottom: 8,
                padding: "15px 20px",
                borderRadius: T.radius.lg,
                background: `linear-gradient(135deg, ${T.accent.primary}CC, #8B5CF6CC, ${T.accent.primary}CC)`,
                backgroundSize: "200% 200%",
                border: `1px solid ${T.accent.primary}60`,
                color: "#fff",
                fontSize: 15,
                fontWeight: 800,
                cursor: "pointer",
                letterSpacing: "-0.01em",
                boxShadow: `0 4px 20px ${T.accent.primary}35, 0 1px 0 rgba(255,255,255,0.1) inset`,
                transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Shimmer overlay */}
              <div style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.08) 50%, transparent 60%)",
                pointerEvents: "none",
              }} />
              <MessageCircle size={17} strokeWidth={2.5} />
              Discuss with your AI CFO
            </button>
          )}

          </DashboardSection>

          {/* Audit content moved to dedicated Audit tab */}
          <p
            style={{
              fontSize: 9,
              color: T.text.muted,
              textAlign: "center",
              marginTop: 14,
              lineHeight: 1.5,
              opacity: 0.6,
            }}
          >
            AI-generated educational content only · Not professional financial advice
          </p>
        </>
      </div>
    </div>
  );
});
