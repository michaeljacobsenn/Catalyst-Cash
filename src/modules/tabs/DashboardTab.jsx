import { useRef, useState, useEffect, useCallback, memo, lazy, Suspense } from "react";
import Confetti from "react-confetti";
import {
  Zap,
  Plus,
  Target,
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
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Briefcase,
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
import { shouldShowGating, getCurrentTier, isGatingEnforced } from "../subscription.js";
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
import FireCard from "../dashboard/FireCard.jsx";
import SinkingFundsRing from "../dashboard/SinkingFundsRing.jsx";
import AnalyticsCharts from "../dashboard/AnalyticsCharts.jsx";
import BadgeStrip from "../dashboard/BadgeStrip.jsx";
import DebtFreedomCard from "../dashboard/DebtFreedomCard.jsx";
import EmptyDashboard from "../dashboard/EmptyDashboard.jsx";
import { SafeToSpendCard } from "../dashboard/SafeToSpendCard.jsx";
import GeoSuggestWidget from "../dashboard/GeoSuggestWidget.jsx";

const SYNC_COOLDOWNS = { free: 60 * 60 * 1000, pro: 5 * 60 * 1000 };
let _autoSyncDone = false; // Survives component remounts — only auto-sync once per app session
const LazyProPaywall = lazy(() => import("./ProPaywall.jsx"));


const DashboardSection = ({ title, children, marginTop = 24 }) => (
  <section style={{ marginTop, marginBottom: 16 }}>
    <h2
      style={{
        fontSize: 12,
        fontWeight: 800,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        color: T.text.dim,
        marginBottom: 10,
        marginLeft: 4,
        fontFamily: T.font.sans,
      }}
    >
      {title}
    </h2>
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

  // ── EMPTY STATE ──
  if (!current) {
    return (
      <EmptyDashboard
        investmentSnapshot={investmentSnapshot}
        onRestore={onRestore}
        onDemoAudit={onDemoAudit}
      />
    );
  }

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

      {/* ═══ Header ═══ */}
      <div style={{ paddingTop: 20, paddingBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: getTracking(24, 900), margin: 0 }}>Dashboard</h1>
        </div>
      </div>

      {/* Welcome-back Greeting */}
      <div
        style={{
          padding: "8px 14px",
          marginBottom: 10,
          borderRadius: T.radius.md,
          background: `linear-gradient(135deg, ${T.accent.primary}06, ${T.accent.emerald}06)`,
          border: `1px solid ${T.border.subtle}`,
        }}
      >
        <span style={{ fontSize: 12, color: T.text.secondary, fontWeight: 600 }}>{greeting}</span>
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

      {/* ═══ GEO SUGGEST WIDGET ═══ */}
      <GeoSuggestWidget />

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

          {/* Pro Upgrade Banner */}
          {shouldShowGating() && (
            <ProBanner
              onUpgrade={() => setShowPaywall(true)}
              label="Upgrade to Pro"
              sublabel="50 audits/mo · Premium AI · Full history"
            />
          )}
          {showPaywall && (
            <Suspense fallback={null}>
              <LazyProPaywall onClose={() => setShowPaywall(false)} />
            </Suspense>
          )}

          {/* ═══ ALERT STRIP ═══ */}
          <AlertStrip alerts={alerts} />

          {/* ═══ COMMAND HEADER — Bento Grid ═══ */}
          {/* Top Row: Health Score (Left) & Available Cash (Right) */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            
            {/* Health Score Square */}
            <Card
              animate
              delay={50}
              className="hover-card a11y-hit-target"
              onClick={() => {
                haptic.selection();
                onViewResult();
              }}
              style={{
                padding: "20px 16px",
                position: "relative",
                background: T.bg.card,
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: `1px solid ${scoreColor}25`,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 24px -8px ${scoreColor}15`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                overflow: "hidden",
                minHeight: 160,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: `radial-gradient(circle at center, ${scoreColor}15 0%, transparent 70%)`,
                  opacity: 0.5,
                  zIndex: 0,
                }}
              />
              <div style={{ position: "relative", zIndex: 1, transform: "scale(0.9)" }}>
                {hs.score != null ? (
                  <HealthGauge score={score} grade={grade} scoreColor={scoreColor} percentile={percentile} />
                ) : (
                  <div style={{ width: 80, height: 80, borderRadius: "50%", background: `${T.border.default}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Activity color={T.text.dim} />
                  </div>
                )}
              </div>
              <div style={{ marginTop: -10, textAlign: "center", zIndex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: T.text.primary }}>Health Score</div>
                <div style={{ fontSize: 11, color: scoreColor, fontWeight: 600, marginTop: 2 }}>{cleanStatus}</div>
              </div>
            </Card>

            {/* Checking Balance Square */}
            <Card
              animate
              delay={100}
              className="hover-card"
              style={{
                padding: "20px 16px",
                position: "relative",
                background: T.bg.card,
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: `1px solid ${T.border.subtle}`,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06)`,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                minHeight: 160,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: (portfolioMetrics?.spendableCash ?? 0) >= floor ? `${T.status.green}20` : `${T.status.amber}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <TrendingUp size={12} color={(portfolioMetrics?.spendableCash ?? 0) >= floor ? T.status.green : T.status.amber} strokeWidth={3} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text.primary }}>Checking</span>
              </div>

              <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
                <span style={{ fontSize: 24, fontWeight: 900, color: privacyMode ? T.text.dim : T.text.primary, letterSpacing: "-0.02em" }}>
                  {privacyMode ? "••••" : fmt(portfolioMetrics?.spendableCash)}
                </span>
              </div>

              {floor > 0 && (
                <div style={{ fontSize: 11, color: T.text.secondary, marginTop: 4 }}>
                  Floor: <span style={{ fontFamily: T.font.mono, color: privacyMode ? T.text.dim : T.text.primary }}>{privacyMode ? "•••" : fmt(floor)}</span>
                </div>
              )}

              <div style={{ marginTop: "auto", paddingTop: 12 }}>
                <div style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 8px",
                  background: (portfolioMetrics?.spendableCash ?? 0) >= floor ? `${T.status.green}15` : `${T.status.amber}15`,
                  borderRadius: T.radius.sm,
                  border: `1px solid ${(portfolioMetrics?.spendableCash ?? 0) >= floor ? T.status.green : T.status.amber}30`
                }}>
                  {(portfolioMetrics?.spendableCash ?? 0) >= floor ? (
                    <CheckCircle size={10} color={T.status.green} />
                  ) : (
                    <AlertTriangle size={10} color={T.status.amber} />
                  )}
                  <span style={{ fontSize: 10, fontWeight: 700, color: (portfolioMetrics?.spendableCash ?? 0) >= floor ? T.status.green : T.status.amber }}>
                    {(portfolioMetrics?.spendableCash ?? 0) >= floor ? "Above floor" : "Below floor"}
                  </span>
                </div>
              </div>
            </Card>
          </div>

          {/* ═══ ULTIMATE ROADMAP: SAFE TO SPEND ═══ */}
          <div style={{ marginBottom: 12 }}>
            <SafeToSpendCard
              theme={T.theme}
              spendableCash={portfolioMetrics?.spendableCash ?? 0}
              ccDebt={portfolioMetrics?.ccDebt ?? 0}
            />
          </div>

          {/* ═══ SYNC BALANCES BAR ═══ */}
          {!current?.isTest && (cards.some(c => c._plaidAccountId) || bankAccounts.some(b => b._plaidAccountId)) && (
            <button
              onClick={() => {
                haptic.medium();
                handleSyncBalances();
              }}
              disabled={syncing}
              className="hover-btn"
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "10px 16px",
                borderRadius: T.radius.md,
                marginBottom: 10,
                border: `1px solid ${T.status.blue}20`,
                background: `linear-gradient(135deg, ${T.bg.elevated}, ${T.status.blue}08)`,
                color: T.status.blue,
                cursor: syncing ? "wait" : "pointer",
                transition: "all .2s",
                opacity: syncing ? 0.7 : 1,
                overflow: "hidden",
              }}
            >
              <RefreshCw
                size={14}
                strokeWidth={2.5}
                style={{ flexShrink: 0, animation: syncing ? "ringSweep 1s linear infinite" : "none" }}
              />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  fontFamily: T.font.mono,
                  letterSpacing: "0.02em",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {syncing ? "SYNCING…" : "SYNC BALANCES"}
              </span>
              {(() => {
                const lastSync =
                  cards.find(c => c._plaidLastSync)?._plaidLastSync ||
                  bankAccounts.find(b => b._plaidLastSync)?._plaidLastSync;
                if (!lastSync) return null;
                const ago = Math.round((Date.now() - new Date(lastSync).getTime()) / 60000);
                return (
                  <span
                    style={{
                      fontSize: 9,
                      color: T.text.dim,
                      fontFamily: T.font.mono,
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    {ago < 1 ? "just now" : ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`}
                  </span>
                );
              })()}
            </button>
          )}

          {/* ═══ AUDIT ACTION HUB ═══ */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
            <button
              onClick={() => {
                haptic.medium();
                onRunAudit();
              }}
              className="hover-btn"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "14px 6px",
                borderRadius: T.radius.md,
                border: `1px solid ${T.accent.primary}30`,
                background: `linear-gradient(145deg, ${T.bg.elevated}, ${T.accent.primary}0A)`,
                color: T.text.primary,
                cursor: "pointer",
                transition: "all .2s",
                boxShadow: `0 4px 12px ${T.accent.primary}10`,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  background: `${T.accent.primary}15`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Plus size={16} color={T.accent.primary} strokeWidth={3} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 800, fontFamily: T.font.mono, letterSpacing: "0.02em" }}>
                NEW AUDIT
              </span>
            </button>
            <button
              onClick={() => {
                haptic.light();
                onViewResult();
              }}
              className="hover-btn"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "14px 6px",
                borderRadius: T.radius.md,
                border: `1px solid ${T.border.subtle}`,
                background: T.bg.elevated,
                color: T.text.primary,
                cursor: "pointer",
                transition: "all .2s",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  background: `${T.text.dim}10`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Target size={16} color={T.text.secondary} strokeWidth={2.5} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 800, fontFamily: T.font.mono, letterSpacing: "0.02em" }}>
                RESULTS
              </span>
            </button>
            <button
              onClick={() => {
                haptic.light();
                navTo("history");
              }}
              className="hover-btn"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "14px 6px",
                borderRadius: T.radius.md,
                border: `1px solid ${T.border.subtle}`,
                background: T.bg.elevated,
                color: T.text.primary,
                cursor: "pointer",
                transition: "all .2s",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  background: `${T.text.dim}10`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Activity size={16} color={T.text.secondary} strokeWidth={2.5} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 800, fontFamily: T.font.mono, letterSpacing: "0.02em" }}>
                HISTORY
              </span>
            </button>
            <button
              onClick={() => {
                haptic.light();
                if (proEnabled) {
                  onViewTransactions?.();
                } else {
                  setShowPaywall(true);
                }
              }}
              className="hover-btn"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "14px 6px",
                borderRadius: T.radius.md,
                border: `1px solid ${T.border.subtle}`,
                background: T.bg.elevated,
                color: T.text.primary,
                cursor: "pointer",
                transition: "all .2s",
                position: "relative",
              }}
            >
              {!proEnabled && (
                <div
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    fontSize: 8,
                    fontWeight: 800,
                    background: T.accent.primary,
                    color: "#fff",
                    padding: "1px 5px",
                    borderRadius: 6,
                    fontFamily: T.font.mono,
                  }}
                >
                  PRO
                </div>
              )}
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  background: `${T.accent.emerald}12`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ReceiptText size={16} color={T.accent.emerald} strokeWidth={2.5} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 800, fontFamily: T.font.mono, letterSpacing: "0.02em" }}>
                LEDGER
              </span>
            </button>
          </div>


          <DashboardSection title="AI CFO & Next Steps">
          {/* AI Insights Action Hub */}
          {(summary || hs.narrative) && (
            <Card
              animate
              delay={200}
              style={{
                padding: "20px 20px",
                marginBottom: 24,
                background: `linear-gradient(145deg, ${T.bg.card}, ${scoreColor}05)`,
                border: `1px solid ${scoreColor}20`,
                borderLeft: `3px solid ${scoreColor}`,
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
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {hs.narrative
                    .split(/(?<=[.?!])\s+/)
                    .filter(Boolean)
                    .map((sentence, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, alignItems: "start", background: T.bg.surface, padding: "10px 12px", borderRadius: T.radius.md }}>
                        <div style={{ marginTop: 2, flexShrink: 0 }}>
                          {score >= 80 ? (
                            <CheckCircle size={14} color={T.status.green} />
                          ) : (
                            <AlertTriangle size={14} color={scoreColor} />
                          )}
                        </div>
                        <p style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.5, margin: 0 }}>
                          {sentence.trim()}
                        </p>
                      </div>
                    ))}
                </div>
              )}
            </Card>
          )}

          {/* ═══ NEXT ACTION ═══ */}
          {p?.sections?.nextAction && (
            <div>
              <Card
                variant="glass"
                style={{
                  animation: "pulseBorder 4s infinite alternate",
                  border: `1.5px solid ${T.accent.primary}50`,
                  background: `linear-gradient(135deg, ${T.bg.card}, ${T.accent.primary}0D)`,
                  marginTop: 4,
                }}
              >
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
              </Card>
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
                gap: 8,
                padding: "13px 20px",
                borderRadius: T.radius.lg,
                border: `1px solid ${T.accent.primary}30`,
                background: `linear-gradient(135deg, ${T.accent.primaryDim}, ${T.accent.primary}08)`,
                color: T.accent.primary,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                transition: "all .25s cubic-bezier(.16,1,.3,1)",
                marginTop: 4,
                marginBottom: 8,
                boxShadow: `0 2px 12px ${T.accent.primary}15`,
              }}
            >
              <MessageCircle size={15} strokeWidth={2.5} />
              Discuss with CFO
            </button>
          )}

          </DashboardSection>

          <DashboardSection title="Tactical & Current">
          {/* ═══ GLANCEABLE BUDGET PACE ═══ */}
          {(() => {
            const budgetActuals = current?.form?.budgetActuals || {};
            const budgetCategories = financialConfig?.budgetCategories || [];
            const weeklySpendAllowance = financialConfig?.weeklySpendAllowance || 0;
            const totalMonthlyBudget = budgetCategories.reduce((sum, cat) => sum + (cat.monthlyTarget || 0), 0);
            const weeksInMonth = 52.14 / 12;
            const totalWeeklyBudget = totalMonthlyBudget / weeksInMonth + weeklySpendAllowance;

            if (totalWeeklyBudget === 0) return null; // Only show if they set up a budget

            const totalWeeklyActuals = Object.values(budgetActuals).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
            const isOver = totalWeeklyActuals > totalWeeklyBudget;
            const pct = Math.min((totalWeeklyActuals / totalWeeklyBudget) * 100, 100);
            const color = isOver ? T.status.red : pct > 85 ? T.status.amber : T.status.green;

            const dayOfWeek = new Date().getDay() === 0 ? 7 : new Date().getDay();
            const expectedPace = (dayOfWeek / 7) * 100;

            return (
              <Card
                animate
                delay={100}
                className="hover-card"
                style={{
                  padding: "12px 16px",
                  marginBottom: 16,
                  background: T.bg.card,
                  borderLeft: `3px solid ${color}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Target size={14} color={color} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.text.primary }}>Weekly Spending Pace</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, fontFamily: T.font.mono, color: isOver ? T.status.red : T.text.primary }}>
                    {fmt(Math.max(0, totalWeeklyBudget - totalWeeklyActuals))} <span style={{ fontSize: 10, color: T.text.dim, fontWeight: 500, fontFamily: T.font.sans }}>/ {fmt(totalWeeklyBudget)} left</span>
                  </div>
                </div>
                <div style={{ position: "relative", paddingTop: "14px", paddingBottom: "4px" }}>
                  <ProgressBar progress={pct} color={color} style={{ height: 6 }} />
                  {/* Today Marker */}
                  <div
                    style={{
                      position: "absolute", left: `${expectedPace}%`, top: 10, bottom: 2, width: 2,
                      background: T.text.primary, borderRadius: 2, zIndex: 2, boxShadow: "0 0 6px rgba(255,255,255,0.7)"
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: `${expectedPace}%`,
                      top: -1,
                      fontSize: 8,
                      fontWeight: 800,
                      color: T.text.secondary,
                      fontFamily: T.font.mono,
                      transform: "translateX(-50%)"
                    }}
                  >
                    TODAY
                  </div>
                </div>
              </Card>
            );
          })()}

          {/* ═══ PAYDAY ROUTINE GENERATOR (Free Zero-Cost Value Add) ═══ */}
          {(() => {
            if (!financialConfig?.incomeSources?.length || !financialConfig?.budgetCategories?.length) return null;

            const primaryIncome = financialConfig.incomeSources[0]; // Assume first is primary
            const weeklyAllowance = financialConfig.weeklySpendAllowance || 0;
            const fixedMonthly = financialConfig.budgetCategories.reduce((s, c) => s + (c.monthlyTarget || 0), 0);

            // Generate deterministic checklist based on frequency
            let freqMult = 1;
            let title = "Monthly Payday Routine";
            if (primaryIncome.frequency === "bi-weekly") { freqMult = 2; title = "Bi-Weekly Payday Routine"; }
            if (primaryIncome.frequency === "weekly") { freqMult = 4; title = "Weekly Payday Routine"; }

            const incomePerPeriod = primaryIncome.amount;
            const fixedPerPeriod = fixedMonthly / freqMult;
            const allowancePerPeriod = (weeklyAllowance * 4.33) / freqMult;
            const savingsPerPeriod = incomePerPeriod - fixedPerPeriod - allowancePerPeriod;

            // Only show if the math makes sense for a routine
            if (savingsPerPeriod <= 0 || incomePerPeriod <= 0) return null;

            return (
              <Card
                animate
                delay={150}
                variant="elevated"
                style={{
                  marginBottom: 16,
                  padding: "16px",
                  border: `1px solid ${T.accent.emerald}30`,
                  background: `linear-gradient(135deg, ${T.bg.card}, ${T.accent.emerald}0A)`
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: T.accent.emerald, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Briefcase size={14} color="#fff" strokeWidth={2.5} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: T.text.primary }}>{title}</div>
                    <div style={{ fontSize: 11, color: T.text.dim }}>Automated flow for your {fmt(incomePerPeriod)} paycheck</div>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: T.bg.surface, padding: "10px 12px", borderRadius: T.radius.md }}>
                    <div style={{ width: 20, height: 20, borderRadius: 10, background: `${T.status.blue}20`, color: T.status.blue, fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>1</div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: T.text.primary }}>Leave {fmt(fixedPerPeriod)} in Checking</div>
                      <div style={{ fontSize: 10, color: T.text.dim, marginTop: 2 }}>This covers your prorated fixed bills & renewals until next payday.</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: T.bg.surface, padding: "10px 12px", borderRadius: T.radius.md }}>
                    <div style={{ width: 20, height: 20, borderRadius: 10, background: `${T.accent.purple}20`, color: T.accent.purple, fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>2</div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: T.text.primary }}>Keep {fmt(allowancePerPeriod)} for Flex Spend</div>
                      <div style={{ fontSize: 10, color: T.text.dim, marginTop: 2 }}>Your guilt-free discretionary allowance for the next period.</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: T.bg.surface, padding: "10px 12px", borderRadius: T.radius.md, borderLeft: `2px solid ${T.status.green}` }}>
                    <div style={{ width: 20, height: 20, borderRadius: 10, background: `${T.status.green}20`, color: T.status.green, fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>3</div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: T.text.primary }}>Sweep {fmt(savingsPerPeriod)} into Vault/Investing</div>
                      <div style={{ fontSize: 10, color: T.text.dim, marginTop: 2 }}>Zero-out the rest immediately. Don't leave this in checking where it can trigger lifestyle creep.</div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })()}

          {/* ═══ SPENDING PACE ALERT (Pro Tier Power Feature 1) ═══ */}
          {(() => {
            if (!history || history.length < 2) return null;

            // Look at spending pace Data over last 30 vs previous 30.
            // Simplified heuristic for zero-cost operation: Compare reported weekly actuals.
            const currentActuals = current?.form?.budgetActuals || {};
            const prevActuals = (history && history[1]?.form?.budgetActuals) || {};

            let currentDiscretionary = 0;
            let prevDiscretionary = 0;

            // Only sum up non-essential categories
            const budgetCategories = financialConfig?.budgetCategories || [];
            budgetCategories.forEach(cat => {
              if (cat.name.toLowerCase().includes("dining") || cat.name.toLowerCase().includes("entertainment") || cat.name.toLowerCase().includes("shopping")) {
                currentDiscretionary += (parseFloat(currentActuals[cat.id]) || 0);
                prevDiscretionary += (parseFloat(prevActuals[cat.id]) || 0);
              }
            });

            // Add unassigned allowance spend
            const currentAllowance = parseFloat(currentActuals.allowance) || 0;
            const prevAllowance = parseFloat(prevActuals.allowance) || 0;
            currentDiscretionary += currentAllowance;
            prevDiscretionary += prevAllowance;

            // No real data — don't show fake numbers
            if (currentDiscretionary === 0 && prevDiscretionary === 0) return null;

            const diff = currentDiscretionary - prevDiscretionary;
            const creepPct = prevDiscretionary > 0 ? (diff / prevDiscretionary) * 100 : 0;

            // Only show if there's significant creep (>10% increase week over week) OR if Pro is enabled (to show the feature exists)
            const hasCreep = creepPct > 10;

            if (!hasCreep && !proEnabled) return null; // Hide from free users if they don't have creep. If they do, tease them.
            if (!hasCreep && proEnabled) {
              // Pro user with no creep: Show success state
              return (
                <Card variant="elevated" style={{ marginBottom: 16, padding: "16px", border: `1px solid ${T.status.green}30`, background: `linear-gradient(135deg, ${T.bg.card}, ${T.status.green}0A)` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 16, background: `${T.status.green}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Shield size={16} color={T.status.green} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: T.text.primary }}>Spending Stable</div>
                      <div style={{ fontSize: 11, color: T.text.dim }}>Your discretionary cash flow is consistent with last week.</div>
                    </div>
                  </div>
                </Card>
              );
            }

            return (
              <Card
                animate
                delay={150}
                variant="elevated"
                style={{
                  marginBottom: 16,
                  padding: "16px",
                  border: `1px solid ${T.status.amber}40`,
                  background: `linear-gradient(135deg, ${T.bg.card}, ${T.status.amber}0A)`,
                  position: "relative",
                  overflow: "hidden"
                }}
              >
                {!proEnabled && (
                  <div style={{ position: "absolute", top: 12, right: 12 }}>
                    <Badge variant="primary">PRO</Badge>
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${T.status.amber}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Activity size={18} color={T.status.amber} strokeWidth={2.5} />
                  </div>
                  <div style={{ flex: 1, filter: !proEnabled ? "blur(3px)" : "none", pointerEvents: !proEnabled ? "none" : "auto", transition: "filter 0.3s" }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: T.text.primary, marginBottom: 2 }}>Spending Pace Alert</div>
                    <div style={{ fontSize: 11, color: T.text.secondary, marginBottom: 12 }}>
                      Your discretionary spending increased by <strong style={{ color: T.status.amber }}>{creepPct.toFixed(0)}%</strong> vs last week.
                    </div>

                    <div style={{ background: T.bg.surface, borderRadius: T.radius.md, padding: "12px", border: `1px solid ${T.border.default}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 12 }}>
                        <span style={{ color: T.text.dim }}>Previous Period:</span>
                        <span style={{ fontWeight: 700, fontFamily: T.font.mono }}>{fmt(prevDiscretionary)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                        <span style={{ color: T.text.primary, fontWeight: 600 }}>Current Period:</span>
                        <span style={{ fontWeight: 800, fontFamily: T.font.mono, color: T.status.amber }}>{fmt(currentDiscretionary)}</span>
                      </div>
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${T.border.subtle}`, fontSize: 11, color: T.text.secondary, lineHeight: 1.4 }}>
                        <strong style={{ color: T.text.primary }}>Recommendation:</strong> At this +{fmt(diff)} pace, your annual flexible spending will rise by {fmt(diff * 52)}. Consider holding off on non-essentials to stay aligned with your goals.
                      </div>
                    </div>
                  </div>
                </div>

                {!proEnabled && (
                  <div style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 10,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(11, 10, 20, 0.4)",
                    backdropFilter: "blur(2px)"
                  }}>
                    <div style={{ textAlign: "center", padding: "0 20px" }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: T.text.primary, marginBottom: 8 }}>Track Spending Trends</div>
                      <div style={{ fontSize: 11, color: T.text.secondary, marginBottom: 14 }}>Upgrade to Pro to detect creeping expenses before they impact your targets.</div>
                      <button
                        onClick={() => setShowPaywall(true)}
                        style={{
                          padding: "8px 16px",
                          borderRadius: 20,
                          background: T.accent.primary,
                          color: "#fff",
                          border: "none",
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: "pointer",
                          boxShadow: `0 4px 12px ${T.accent.primary}40`
                        }}
                      >
                        Unlock Pro
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })()}

          {/* ═══ CASH FLOW CALENDAR ═══ */}
          {(portfolioMetrics?.spendableCash != null) && (
            <CashFlowCalendar
              config={financialConfig}
              cards={cards}
              renewals={renewals}
              checkingBalance={portfolioMetrics.spendableCash ?? 0}
              snapshotDate={current?.date}
            />
          )}

          </DashboardSection>

          <DashboardSection title="Wealth & Strategy">
          {/* ═══ WIDE ROW: NET WORTH TREND ═══ */}
          <Card
            animate
            delay={150}
            style={{
              padding: "20px 20px",
              marginBottom: 12,
              background: T.bg.card,
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: `1px solid ${T.border.subtle}`,
              position: "relative",
              overflow: "hidden"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: T.text.secondary, margin: "0 0 4px", fontFamily: T.font.mono, fontWeight: 800 }}>
                  Net Worth
                </p>
                <CountUp
                  value={p?.netWorth ?? 0}
                  size={32}
                  weight={900}
                  color={p?.netWorth != null && p.netWorth >= 0 ? T.text.primary : T.status.red}
                />
                
                {p?.netWorthDelta && (
                  <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 4 }}>
                    {String(p.netWorthDelta).includes("+") ? (
                      <ArrowUpRight size={14} color={T.status.green} strokeWidth={3} />
                    ) : (
                      <ArrowDownRight size={14} color={T.status.red} strokeWidth={3} />
                    )}
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: T.font.mono, color: String(p.netWorthDelta).includes("+") ? T.status.green : T.status.red }}>
                      {p.netWorthDelta}
                    </span>
                  </div>
                )}
              </div>
              
              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                <StatusDot status={cleanStatus} size="sm" />
                <Mono size={10} color={T.text.dim}>{fmtDate(current.date)}</Mono>
                {streak > 1 && (
                  <div title="Weekly Audit Streak" style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 12, background: `${T.accent.emerald}15`, border: `1px solid ${T.status.green}25` }}>
                    <span style={{ fontSize: 10 }}>📅</span>
                    <span style={{ fontSize: 9, fontWeight: 800, color: T.status.green, fontFamily: T.font.mono }}>W{streak}</span>
                  </div>
                )}
              </div>
            </div>
            
            <div style={{ marginTop: 16 }}>
              <MetricsBar quickMetrics={quickMetrics} privacyMode={privacyMode} />
            </div>
          </Card>

          {/* ═══ INVESTMENT SNAPSHOT ═══ */}
          {investmentSnapshot.accounts.length > 0 && (
            <Card
              animate
              delay={250}
              style={{
                background: `linear-gradient(160deg, ${T.bg.card}, ${T.accent.emerald}06)`,
                borderColor: `${T.accent.emerald}15`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 7,
                      background: `${T.accent.emerald}15`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <TrendingUp size={13} color={T.accent.emerald} strokeWidth={2.5} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>Investment Portfolio</span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <Mono size={16} weight={900} color={T.accent.emerald}>
                    {fmt(Math.round(investmentSnapshot.total))}
                  </Mono>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {investmentSnapshot.accounts.map((a, idx) => (
                  <div
                    key={a.key}
                    style={{
                      flex: "1 1 45%",
                      minWidth: 120,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 10px",
                      background: `${a.color}08`,
                      borderRadius: T.radius.sm,
                      border: `1px solid ${a.color}18`,
                      animation: `fadeInUp .35s ease-out ${idx * 0.06}s both`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: a.color }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: T.text.secondary }}>{a.label}</span>
                    </div>
                    <Mono size={11} weight={800} color={a.total > 0 ? a.color : T.text.muted}>
                      {a.total > 0 ? fmt(Math.round(a.total)) : "—"}
                    </Mono>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ═══ DEBT FREEDOM COUNTDOWN ═══ */}
          <DebtFreedomCard cards={cards} freedomStats={freedomStats} />

          {/* ═══ SINKING FUNDS ═══ */}
          <SinkingFundsRing paceData={p?.paceData} />

          {/* ═══ FIRE PROJECTION ═══ */}
          <FireCard fireProjection={fireProjection} />

          </DashboardSection>

          <DashboardSection title="Simulators & Tools">
          {/* ═══ CREDIT SCORE SIMULATOR ═══ */}
          <ErrorBoundary name="Credit Score Simulator">
            <CreditScoreSimulator cards={cards} financialConfig={financialConfig} />
          </ErrorBoundary>

          {/* ═══ DEBT PAYOFF SIMULATOR ═══ */}
          <ErrorBoundary name="Debt Simulator">
            <DebtSimulator cards={cards} financialConfig={financialConfig} />
          </ErrorBoundary>

          {/* ═══ FIRE SIMULATOR ═══ */}
          <ErrorBoundary name="FIRE Simulator">
            <FIReSimulator
              currentNetWorth={dashboardMetrics.total || 0}
              annualIncome={fireProjection?.annualIncome || 0}
              annualExpenses={fireProjection?.annualExpenses || 0}
            />
          </ErrorBoundary>

          {/* ═══ BILL NEGOTIATION ═══ */}
          <ErrorBoundary name="Bill Negotiation">
            <BillNegotiationCard
              cards={cards}
              financialConfig={financialConfig}
              negotiationTargets={p?.negotiationTargets || []}
            />
          </ErrorBoundary>

          </DashboardSection>

          <DashboardSection title="Analytics & Achievements">
          {/* ═══ ANALYTICS ═══ */}
          <AnalyticsCharts chartData={chartData} scoreData={scoreData} spendData={spendData} chartA11y={chartA11y} />

          {/* ═══ WEEKLY CHALLENGES ═══ */}
          <WeeklyChallenges />

          {/* ═══ ACHIEVEMENTS ═══ */}
          <BadgeStrip badges={badges} />

          </DashboardSection>

          {/* ═══ BOTTOM CTAs ═══ */}
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button
              onClick={onViewResult}
              style={{
                flex: 1,
                padding: "12px 14px",
                borderRadius: T.radius.lg,
                border: `1px solid ${T.border.default}`,
                background: T.bg.card,
                color: T.text.secondary,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                boxShadow: T.shadow.card,
              }}
            >
              <Activity size={14} />
              Latest Result
            </button>

            {p?.healthScore && (
              <button
                onClick={async () => {
                  const W = 440,
                    H = 600;
                  const canvas = document.createElement("canvas");
                  canvas.width = W;
                  canvas.height = H;
                  const ctx = canvas.getContext("2d");
                  const bg = ctx.createLinearGradient(0, 0, W, H);
                  bg.addColorStop(0, "#0B0A14");
                  bg.addColorStop(0.5, "#0F0D1A");
                  bg.addColorStop(1, "#14122A");
                  ctx.fillStyle = bg;
                  ctx.beginPath();
                  ctx.roundRect(0, 0, W, H, 24);
                  ctx.fill();
                  const glow = ctx.createRadialGradient(W / 2, 200, 20, W / 2, 200, 130);
                  glow.addColorStop(0, scoreColor + "20");
                  glow.addColorStop(1, "transparent");
                  ctx.fillStyle = glow;
                  ctx.fillRect(0, 50, W, 300);
                  ctx.strokeStyle = `${scoreColor}25`;
                  ctx.lineWidth = 1.5;
                  ctx.beginPath();
                  ctx.roundRect(1, 1, W - 2, H - 2, 24);
                  ctx.stroke();
                  ctx.beginPath();
                  ctx.arc(W / 2, 200, 82, Math.PI * 0.75, Math.PI * 2.25);
                  ctx.strokeStyle = "rgba(255,255,255,0.06)";
                  ctx.lineWidth = 7;
                  ctx.lineCap = "round";
                  ctx.stroke();
                  const endAngle = Math.PI * 0.75 + (score / 100) * Math.PI * 1.5;
                  ctx.beginPath();
                  ctx.arc(W / 2, 200, 82, Math.PI * 0.75, endAngle);
                  const ringGrad = ctx.createLinearGradient(W / 2 - 82, 200, W / 2 + 82, 200);
                  ringGrad.addColorStop(0, scoreColor);
                  ringGrad.addColorStop(1, scoreColor + "CC");
                  ctx.strokeStyle = ringGrad;
                  ctx.lineWidth = 7;
                  ctx.lineCap = "round";
                  ctx.stroke();
                  ctx.fillStyle = scoreColor;
                  ctx.font = "bold 60px -apple-system, BlinkMacSystemFont, sans-serif";
                  ctx.textAlign = "center";
                  ctx.textBaseline = "middle";
                  ctx.fillText(hs.grade || "?", W / 2, 190);
                  ctx.fillStyle = "#9CA3AF";
                  ctx.font = "700 17px -apple-system, sans-serif";
                  ctx.fillText(`${hs.score || 0}/100`, W / 2, 228);
                  if (percentile > 0) {
                    ctx.fillStyle = scoreColor + "18";
                    ctx.beginPath();
                    ctx.roundRect(W / 2 - 50, 258, 100, 22, 11);
                    ctx.fill();
                    ctx.strokeStyle = scoreColor + "30";
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.roundRect(W / 2 - 50, 258, 100, 22, 11);
                    ctx.stroke();
                    ctx.fillStyle = scoreColor;
                    ctx.font = "800 10px -apple-system, sans-serif";
                    ctx.fillText(`Top ${100 - percentile}% of users`, W / 2, 271);
                  }
                  ctx.strokeStyle = "rgba(255,255,255,0.06)";
                  ctx.lineWidth = 1;
                  ctx.beginPath();
                  ctx.moveTo(40, 300);
                  ctx.lineTo(W - 40, 300);
                  ctx.stroke();
                  ctx.fillStyle = "#E5E7EB";
                  ctx.font = "800 13px -apple-system, sans-serif";
                  ctx.fillText("WEEKLY HEALTH SCORE", W / 2, 330);
                  ctx.fillStyle = sc;
                  ctx.font = "700 15px -apple-system, sans-serif";
                  ctx.fillText(cleanStatus, W / 2, 358);
                  const dateText = fmtDate(current.date);
                  if (streak > 1) {
                    ctx.fillStyle = "#FF8C00";
                    ctx.font = "700 12px -apple-system, sans-serif";
                    ctx.fillText(`🔥 W${streak} Streak`, W / 2 - 50, 388);
                    ctx.fillStyle = "#6B7280";
                    ctx.font = "600 12px -apple-system, sans-serif";
                    ctx.fillText(`  ·  ${dateText}`, W / 2 + 50, 388);
                  } else {
                    ctx.fillStyle = "#6B7280";
                    ctx.font = "600 13px -apple-system, sans-serif";
                    ctx.fillText(dateText, W / 2, 388);
                  }
                  if (hs.summary) {
                    ctx.fillStyle = "#8890A6";
                    ctx.font = "400 13px -apple-system, sans-serif";
                    const words = hs.summary.split(" ");
                    const lines = [];
                    let line = "";
                    for (const w of words) {
                      if ((line + " " + w).length > 44) {
                        lines.push(line);
                        line = w;
                      } else {
                        line = line ? line + " " + w : w;
                      }
                    }
                    if (line) lines.push(line);
                    lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, W / 2, 425 + i * 20));
                  }
                  ctx.strokeStyle = "rgba(255,255,255,0.04)";
                  ctx.lineWidth = 1;
                  ctx.beginPath();
                  ctx.moveTo(40, H - 60);
                  ctx.lineTo(W - 40, H - 60);
                  ctx.stroke();
                  const brandGrad = ctx.createLinearGradient(W / 2 - 80, 0, W / 2 + 80, 0);
                  brandGrad.addColorStop(0, "#7B5EA7");
                  brandGrad.addColorStop(1, "#2ECC71");
                  ctx.fillStyle = brandGrad;
                  ctx.font = "800 12px -apple-system, sans-serif";
                  ctx.fillText("Catalyst Cash", W / 2, H - 32);
                  ctx.fillStyle = "rgba(255,255,255,0.2)";
                  ctx.font = "500 9px -apple-system, sans-serif";
                  ctx.fillText("CatalystCash.app", W / 2, H - 16);
                  canvas.toBlob(async blob => {
                    try {
                      const file = new File([blob], "health-score.png", { type: "image/png" });
                      if (navigator.share && navigator.canShare?.({ files: [file] })) {
                        await navigator.share({ files: [file], title: "My Weekly Health Score" });
                      } else {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "health-score.png";
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }
                    } catch (e) {
                      if (e.name !== "AbortError") console.error("Share failed:", e);
                    }
                  }, "image/png");
                  unlockBadge("shared_score").catch(() => { });
                }}
                style={{
                  flex: 1,
                  padding: "12px 14px",
                  borderRadius: T.radius.lg,
                  border: `1px solid ${T.accent.primary}25`,
                  background: `${T.accent.primary}08`,
                  color: T.accent.primary,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <ExternalLink size={14} />
                Share Score
              </button>
            )}
          </div>

          {/* Primary CTA */}
          <button
            onClick={onRunAudit}
            style={{
              width: "100%",
              padding: "16px",
              borderRadius: T.radius.lg,
              border: "none",
              background: `linear-gradient(135deg, ${T.accent.emerald}, #10B981)`,
              color: "#fff",
              fontSize: 15,
              fontWeight: 800,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow: `0 8px 24px ${T.accent.emerald}40`,
            }}
          >
            <Plus size={18} strokeWidth={2.5} />
            Input Weekly Data
          </button>

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
