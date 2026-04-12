  import { lazy,memo,Suspense,useCallback,useEffect,useState,type CSSProperties,type ReactNode } from "react";
  import { T } from "../constants.js";
  import {
    AlertTriangle,
    ArrowUpRight,
    Building2,
    CalendarClock,
    CheckCircle,
    ChevronRight,
    MessageCircle,
    ReceiptText,
    RefreshCw,
    Settings,
    Shield,
    Zap,
  } from "../icons";

  import { performCloudBackup } from "../backup.js";
  import { useSecurity } from "../contexts/SecurityContext.js";
  import { haptic } from "../haptics.js";
  import { isGatingEnforced,shouldShowGating } from "../subscription.js";
  import { buildPromoLine } from "../planCatalog.js";
  import { Card as UICard } from "../ui.js";
  import { usePlaidSync } from "../usePlaidSync.js";
  import { fmt,stripPaycheckParens } from "../utils.js";
  import "./DashboardTab.css";
  import ProBanner from "./ProBanner.js";
  import EmptyDashboard from "../dashboard/EmptyDashboard.js";
  import { DashboardTopChrome } from "../dashboard/DashboardTopChrome.js";
  import { useDashboardChrome } from "../dashboard/useDashboardChrome.js";

  import type { CatalystCashConfig,HealthScore } from "../../types/index.js";
  import { useAudit } from "../contexts/AuditContext.js";
  import { useNavigation } from "../contexts/NavigationContext.js";
  import { usePortfolio } from "../contexts/PortfolioContext.js";
  import { useSettings } from "../contexts/SettingsContext.js";

// ── Extracted dashboard components ──
  import AlertStrip from "../dashboard/AlertStrip.js";
  import useDashboardData from "../dashboard/useDashboardData.js";

let _autoSyncDone = false; // Survives component remounts — only auto-sync once per app session
const LazyProPaywall = lazy(() => import("./ProPaywall.js"));
const LazyConfetti = lazy(() => import("react-confetti"));

interface DashboardSectionProps {
  children: ReactNode;
  marginTop?: number;
  title?: ReactNode;
}

interface DashboardTabProps {
  onRestore?: () => void;
  proEnabled?: boolean;
  themeTick?: number;
  onDemoAudit?: () => void;
  onRefreshDashboard?: () => void;
  onViewTransactions?: () => void;
  onDiscussWithCFO?: (prompt: string) => void;
}

interface SetupStep {
  id: string;
  title: string;
  desc: string;
  done: boolean;
  action: () => void;
  Icon: typeof Settings;
}


interface CompactMetric {
  label: string;
  value: number;
  color: string;
}

interface DashboardCardProps {
  children?: ReactNode;
  style?: CSSProperties;
  animate?: boolean;
  delay?: number;
  onClick?: () => void;
  variant?: string;
  className?: string;
}

const Card = UICard as unknown as (props: DashboardCardProps) => ReactNode;

const DashboardSection = ({ children, marginTop = 12 }: DashboardSectionProps) => (
  <section style={{ marginTop, marginBottom: 12 }}>
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {children}
    </div>
  </section>
);

const splitDashboardSentences = (text: string | null | undefined): string[] =>
  String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.?!])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

const buildDashboardNextAction = (text: string | null | undefined) => {
  const clean = stripPaycheckParens(String(text || "")).replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const sentences = splitDashboardSentences(clean);
  const headline = sentences[0] || clean;
  const detail = sentences.slice(1).join(" ");
  const amountMatch = (headline.match(/\$[\d,]+(?:\.\d{1,2})?/) || detail.match(/\$[\d,]+(?:\.\d{1,2})?/))?.[0] || null;
  const label =
    /^route\b/i.test(headline) ? "Route now"
      : /^protect\b/i.test(headline) ? "Protect cash"
        : /^pause\b/i.test(headline) ? "Pause move"
          : "Next move";
  return { clean, headline, detail, amountMatch, label };
};

export default memo(function DashboardTab({
  proEnabled = false,
  themeTick: _themeTick = 0,
  onDemoAudit,
  onRefreshDashboard,
  onViewTransactions,
  onDiscussWithCFO,
  onRestore,
}: DashboardTabProps) {
  void _themeTick;
  const { current } = useAudit();
  const { financialConfig, setFinancialConfig, autoBackupInterval, personalRules } = useSettings();
  const { cards, setCards, bankAccounts, setBankAccounts, renewals, cardCatalog } = usePortfolio();
  const { navTo, setSetupReturnTab } = useNavigation();
  const { appPasscode, privacyMode } = useSecurity();
  const [showPaywall, setShowPaywall] = useState(false);
  const [nextActionExpanded, setNextActionExpanded] = useState(false);
  const typedFinancialConfig = financialConfig as CatalystCashConfig;

  // ── Plaid Balance Sync (shared hook) ──
  const { syncing, sync: handleSyncBalances, syncState } = usePlaidSync({
    cards,
    bankAccounts,
    financialConfig: typedFinancialConfig,
    setCards,
    setBankAccounts,
    setFinancialConfig,
    cardCatalog,
    successMessage: "Balances synced — run a new audit to reflect updated numbers",
    autoMaintain: true,
  });

  // ── Intelligent Auto-sync ──
  // Triggers sync on app boot or whenever the app comes back to the foreground.
  useEffect(() => {

    // Run on mount (if visible)
    if (!_autoSyncDone) {
      _autoSyncDone = true;
      // trySync(); // CFO HOTFIX: Disabled to save $0.10/call on launch
    }

    // Run every time the app comes to the foreground
    // document.addEventListener("visibilitychange", trySync); // CFO HOTFIX: Disabled foreground polling
    // return () => document.removeEventListener("visibilitychange", trySync);
  }, [cards, bankAccounts, handleSyncBalances]);

  const onGoSettings = () => {
    setSetupReturnTab("dashboard");
    navTo("settings");
  };

  const p = current?.parsed;
  const {
    streak,
    alerts,
    safetySnapshot,
    portfolioMetrics,
    fireProjection,
  } = useDashboardData();
  const handleNativeBackup = useCallback(
    async (passcode: string | null) => {
      const { uploadToICloud } = await import("../cloudSync.js");
      const result = await performCloudBackup({
        upload: uploadToICloud,
        passphrase: passcode,
        personalRules,
        force: true,
      });
      if (!result.success) {
        throw new Error(result.reason || "Automatic iCloud backup is available in the native iPhone app only.");
      }
    },
    [personalRules]
  );
  const {
    greeting,
    runConfetti,
    windowSize,
    showBackupNudge,
    backingUp,
    handleBackupNow,
    dismissBackupNudge,
  } = useDashboardChrome({
    current,
    streak,
    autoBackupInterval,
    appPasscode,
    onNativeBackup: handleNativeBackup,
  });

  // ── Setup Checklist ──
  const hasCards = cards.length > 0;
  const hasRenewals = (renewals || []).length > 0;
  const steps: SetupStep[] = [
    {
      id: "profile",
      title: "Configure Profile",
      desc: "Income, zip code, and basic settings.",
      done: typedFinancialConfig?.paycheckStandard > 0 || typedFinancialConfig?.incomeSources?.length > 0,
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
  const hs: HealthScore | null = p?.healthScore ?? null;
  const score = typeof hs?.score === "number" ? hs.score : 0;
  const grade = hs?.grade || "?";
  const summary = hs?.summary || "";
  const isSmallPhone = typeof window !== "undefined" ? window.innerWidth <= 390 : false;
  const isCompactWidth = typeof window !== "undefined" ? window.innerWidth <= 430 : false;
  const hasAuditInsights = Boolean(summary || hs?.narrative || p?.sections?.nextAction);
  const showEmptyDashboard = !p && !hasAuditInsights;
  const scoreColor = score >= 80 ? T.status.green : score >= 60 ? T.status.amber : T.status.red;
  const safetyColor =
    safetySnapshot.level === "urgent"
      ? T.status.red
      : safetySnapshot.level === "caution"
        ? T.status.amber
        : T.status.green;
  const safetyLabel =
    safetySnapshot.level === "urgent" ? "URGENT"
    : safetySnapshot.level === "caution" ? "CAUTION"
    : "SAFE";
  const safetyIcon =
    safetySnapshot.level === "urgent" ? <AlertTriangle size={14} color={safetyColor} strokeWidth={2.5} />
    : <Shield size={14} color={safetyColor} strokeWidth={2.5} />;
  const primaryRiskLabel =
    safetySnapshot.primaryRisk === "floor-gap" ? "Floor coverage is the issue"
    : safetySnapshot.primaryRisk === "pending" ? "Pending charges are the issue"
    : safetySnapshot.primaryRisk === "bills" ? "Upcoming bills are the issue"
    : safetySnapshot.primaryRisk === "card-minimums" ? "Card minimums are the issue"
    : safetySnapshot.primaryRisk === "score" ? "Overall audit health is the issue"
    : "No major near-term issue detected";
  const nextActionBrief = buildDashboardNextAction(p?.sections?.nextAction);
  const insightSentences = splitDashboardSentences(hs?.narrative)
    .filter((sentence) => !summary || sentence.toLowerCase() !== summary.toLowerCase())
    .slice(0, 2);

  // ── Synthetic Percentile (client-side, no real user data) ──
  const percentile = (() => {
    if (score === 0) return 0;
    const z = (score - 62) / 16;
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989422804 * Math.exp((-z * z) / 2);
    const phi = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return Math.round(z > 0 ? (1 - phi) * 100 : phi * 100);
  })();

  if (showEmptyDashboard) {
    return (
      <div className="page-body" aria-live="polite" style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
        <div style={{ width: "100%", maxWidth: 768, display: "flex", flexDirection: "column" }}>
          <DashboardTopChrome
            greeting={greeting}
            streak={streak}
            runConfetti={runConfetti}
            windowSize={windowSize}
            LazyConfetti={LazyConfetti}
            showBackupNudge={showBackupNudge}
            backingUp={backingUp}
            onBackupNow={() => {
              void handleBackupNow();
            }}
            onDismissBackupNudge={() => {
              void dismissBackupNudge();
            }}
            onEnableAutoBackup={() => {
              void dismissBackupNudge();
              navTo("settings");
            }}
          />

          {typeof onDemoAudit === "function" && (
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
              <button
                onClick={() => {
                  haptic.light();
                  onDemoAudit();
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: `1px solid ${T.border.default}`,
                  background: "transparent",
                  color: T.text.secondary,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Zap size={12} strokeWidth={2.2} />
                {current?.isTest ? "Reload Demo Data" : "Load Demo Data"}
              </button>
            </div>
          )}

          <EmptyDashboard {...(onRestore ? { onRestore } : {})} onDemoAudit={onDemoAudit || (() => undefined)} />
        </div>
      </div>
    );
  }


  return (
    <div className="page-body" aria-live="polite" style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <div style={{ width: "100%", maxWidth: 768, display: "flex", flexDirection: "column" }}>
      <DashboardTopChrome
        greeting={greeting}
        streak={streak}
        runConfetti={runConfetti}
        windowSize={windowSize}
        LazyConfetti={LazyConfetti}
        showBackupNudge={showBackupNudge}
        backingUp={backingUp}
        onBackupNow={() => {
          void handleBackupNow();
        }}
        onDismissBackupNudge={() => {
          void dismissBackupNudge();
        }}
        onEnableAutoBackup={() => {
          void dismissBackupNudge();
          navTo("settings");
        }}
      />

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
               <LazyProPaywall onClose={() => setShowPaywall(false)} source="dashboard" />
             </Suspense>
           )}

           {/* ═══ SAFETY SNAPSHOT — top priority, native and deterministic ═══ */}
           {p && (
             <Card
               animate
             style={{
                 padding: isSmallPhone ? "18px 16px" : "20px 18px",
                 marginBottom: 12,
                 background: `linear-gradient(180deg, ${safetyColor}10 0%, ${T.bg.card} 55%)`,
                 border: `1px solid ${safetyColor}28`,
                 boxShadow: `0 12px 32px ${safetyColor}12`,
                 overflow: "visible",
               }}
             >
               <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
                 <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                   <div
                     style={{
                       width: 28,
                       height: 28,
                       borderRadius: 10,
                       background: `${safetyColor}14`,
                       border: `1px solid ${safetyColor}22`,
                       display: "flex",
                       alignItems: "center",
                       justifyContent: "center",
                       flexShrink: 0,
                     }}
                   >
                     {safetyIcon}
                   </div>
                   <div>
                     <div style={{ fontSize: 10, fontWeight: 800, color: safetyColor, fontFamily: T.font.mono, letterSpacing: "0.05em" }}>
                       THIS WEEK
                     </div>
                     <div style={{ fontSize: "clamp(16px, 4.5vw, 18px)", fontWeight: 900, color: T.text.primary, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
                       Am I safe right now?
                     </div>
                   </div>
                 </div>
                 <div
                   style={{
                     padding: "5px 10px",
                     borderRadius: 999,
                     background: `${safetyColor}14`,
                     border: `1px solid ${safetyColor}22`,
                     color: safetyColor,
                     fontSize: 10,
                     fontWeight: 800,
                     fontFamily: T.font.mono,
                     letterSpacing: "0.04em",
                     flexShrink: 0,
                   }}
                 >
                   {safetyLabel}
                 </div>
               </div>

                 <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                 <div style={{ minWidth: 0 }}>
                   <div style={{ fontSize: isCompactWidth ? "clamp(18px, 5.7vw, 20px)" : "clamp(19px, 5.5vw, 22px)", fontWeight: 900, color: safetyColor, letterSpacing: "-0.03em", lineHeight: 1.08, marginBottom: 4, overflowWrap: "anywhere" }}>
                     {safetySnapshot.headline}
                   </div>
                   <p style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.45, margin: 0 }}>
                     {safetySnapshot.summary}
                   </p>
                 </div>
                   <div style={{ display: "grid", gridTemplateColumns: isCompactWidth ? "repeat(6, minmax(0, 1fr))" : "1.35fr repeat(3, minmax(0, 1fr))", gap: 8 }}>
                     <div
                       style={{
                         padding: isSmallPhone ? "11px 12px" : "12px 14px",
                         borderRadius: T.radius.lg,
                         background: `${T.bg.elevated}`,
                         border: `1px solid ${T.border.subtle}`,
                         gridColumn: isCompactWidth ? "1 / -1" : "auto",
                       }}
                     >
                       <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, letterSpacing: "0.05em", fontFamily: T.font.mono, marginBottom: 6 }}>
                         SAFE TO SPEND
                       </div>
                       <div style={{ fontSize: isSmallPhone ? 22 : 24, fontWeight: 900, color: privacyMode ? T.text.dim : safetyColor, letterSpacing: "-0.04em", fontFamily: T.font.mono, lineHeight: 1.05 }}>
                         {privacyMode ? "••••••" : fmt(Math.max(0, safetySnapshot.safeToSpend))}
                       </div>
                       <div style={{ fontSize: 10, color: T.text.dim, marginTop: 4, lineHeight: 1.35 }}>
                         Protected need: {privacyMode ? "••••" : fmt(safetySnapshot.protectedNeed)}
                       </div>
                     </div>
                     <div style={{ padding: "10px 12px", borderRadius: T.radius.md, background: `${T.bg.card}`, border: `1px solid ${T.border.subtle}`, minWidth: 0, gridColumn: isCompactWidth ? "span 2" : "auto" }}>
                       <div style={{ fontSize: 9, fontWeight: 800, color: T.text.dim, letterSpacing: "0.05em", fontFamily: T.font.mono, marginBottom: 4 }}>
                         RUNWAY
                       </div>
                       <div style={{ fontSize: 13, fontWeight: 800, color: T.text.primary, overflowWrap: "anywhere" }}>
                         {safetySnapshot.runwayWeeks != null ? `${safetySnapshot.runwayWeeks.toFixed(1)}w` : "Set budget"}
                       </div>
                     </div>
                     <div style={{ padding: "10px 12px", borderRadius: T.radius.md, background: `${T.bg.card}`, border: `1px solid ${T.border.subtle}`, minWidth: 0, gridColumn: isCompactWidth ? "span 2" : "auto" }}>
                       <div style={{ fontSize: 9, fontWeight: 800, color: T.text.dim, letterSpacing: "0.05em", fontFamily: T.font.mono, marginBottom: 4 }}>
                         PENDING
                       </div>
                       <div style={{ fontSize: 13, fontWeight: 800, color: privacyMode ? T.text.dim : T.text.primary, overflowWrap: "anywhere" }}>
                         {privacyMode ? "••••" : fmt(safetySnapshot.pendingCharges)}
                       </div>
                     </div>
                     <div style={{ padding: "10px 12px", borderRadius: T.radius.md, background: `${T.bg.card}`, border: `1px solid ${T.border.subtle}`, minWidth: 0, gridColumn: isCompactWidth ? "span 2" : "auto" }}>
                       <div style={{ fontSize: 9, fontWeight: 800, color: T.text.dim, letterSpacing: "0.05em", fontFamily: T.font.mono, marginBottom: 4 }}>
                         30-DAY BILLS
                       </div>
                       <div style={{ fontSize: 13, fontWeight: 800, color: privacyMode ? T.text.dim : T.text.primary, overflowWrap: "anywhere" }}>
                         {privacyMode ? "••••" : fmt(safetySnapshot.upcomingBills30d)}
                       </div>
                     </div>
                   </div>

                   <div
                     style={{
                       display: "flex",
                       alignItems: "center",
                       justifyContent: "space-between",
                       gap: 10,
                       padding: "11px 12px",
                       borderRadius: T.radius.lg,
                       background: `${T.bg.surface}`,
                       border: `1px solid ${T.border.subtle}`,
                       flexWrap: "wrap",
                     }}
                   >
                     <div style={{ minWidth: 0, flex: 1 }}>
                       <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, fontFamily: T.font.mono, letterSpacing: "0.05em", marginBottom: 4 }}>
                         PRIMARY RISK
                       </div>
                       <div style={{ fontSize: 12, fontWeight: 800, color: T.text.primary, lineHeight: 1.35, overflowWrap: "anywhere" }}>
                         {primaryRiskLabel}
                       </div>
                     </div>
                     {hs?.score != null && (
                       <div
                         style={{
                           display: "inline-flex",
                           alignItems: "center",
                           gap: 6,
                           padding: "6px 10px",
                           borderRadius: 999,
                           background: `${scoreColor}12`,
                           border: `1px solid ${scoreColor}25`,
                           flexShrink: 0,
                         }}
                       >
                         <div style={{ width: 6, height: 6, borderRadius: "50%", background: scoreColor }} />
                         <span style={{ fontSize: 11, fontWeight: 800, color: scoreColor, fontFamily: T.font.mono, letterSpacing: "0.02em" }}>
                           {grade} · {score}/100
                         </span>
                       </div>
                     )}
                   </div>
                 </div>
             </Card>
           )}

           {/* ═══ HERO CARD — Balance Sheet + Score ═══ */}
           <Card
             animate
             className="hover-card a11y-hit-target"
             onClick={() => { haptic.selection(); navTo("portfolio"); }}
             style={{
               padding: isSmallPhone ? "18px 16px" : "22px 18px",
               marginBottom: 12,
               background: T.bg.card,
               border: `1px solid ${T.border.subtle}`,
               cursor: "pointer",
               position: "relative",
               overflow: "visible",
             }}
           >
             {/* Top row: label + health pill */}
             <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
               <span style={{ fontSize: 12, fontWeight: 600, color: T.text.dim, letterSpacing: "0.02em" }}>
                 Balance Sheet
               </span>
               {hs?.score != null ? (
                 <div
                   onClick={(e) => { e.stopPropagation(); haptic.selection(); navTo("audit"); }}
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
                   onClick={(e) => { e.stopPropagation(); haptic.selection(); navTo("audit"); }}
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
                   <span style={{ fontSize: 10, fontWeight: 700, color: T.accent.primary }}>Refresh Briefing</span>
                 </div>
               )}
             </div>

             {/* Big number block mimicking Portfolio hero style */}
           <div style={{
             display: "flex", flexDirection: "column", gap: 12,
             background: `linear-gradient(180deg, ${T.bg.card} 0%, transparent 100%)`,
             border: `1px solid ${T.border.subtle}`,
             borderRadius: T.radius.lg,
             padding: isSmallPhone ? "16px 14px 18px" : "18px 16px 20px",
             boxShadow: `0 16px 48px rgba(16,185,129,0.06), 0 8px 24px rgba(138,99,210,0.1), inset 0 1px 0 rgba(255,255,255,0.05)`,
             marginBottom: 6
           }}>
             <div>
               <h2 style={{ fontSize: 13, fontWeight: 700, color: T.text.secondary, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                 Net Worth
               </h2>
               <div style={{ 
                 fontSize: isCompactWidth ? "clamp(28px, 8.2vw, 34px)" : "clamp(30px, 9vw, 36px)", 
                 fontWeight: 900, 
                 color: privacyMode ? T.text.dim : T.text.primary, 
                 letterSpacing: "-0.02em",
                 textShadow: privacyMode ? "none" : `0 0 15px ${T.text.primary}80, 0 2px 10px ${T.text.primary}20`,
                 overflowWrap: "anywhere",
                 lineHeight: 1.02,
               }}>
                 {privacyMode ? "••••••" : fmt(portfolioMetrics?.netWorth || 0)}
               </div>
             </div>
           </div>

             {/* Status tag */}
             {hs?.score != null && (
               <span style={{ fontSize: 11, color: T.text.dim, fontWeight: 500 }}>
                 Status: <span style={{ color: scoreColor, fontWeight: 700 }}>{cleanStatus}</span>
                 {percentile > 0 && <span style={{ color: T.text.dim }}> · Top {100 - percentile}%</span>}
               </span>
             )}
           </Card>

           {/* ═══ QUICK METRICS ROW ═══ */}
           {(() => {
             const safeToSpend = Math.max(0, safetySnapshot.safeToSpend);
             const safeColor = safetySnapshot.level === "urgent" ? T.status.red : safetySnapshot.level === "caution" ? T.status.amber : T.status.green;
             const metrics: CompactMetric[] = [
               { label: "Safe to Spend", value: Math.max(0, safeToSpend), color: safeColor },
               { label: "Protected Need", value: safetySnapshot.protectedNeed, color: T.text.primary },
               { label: "Checking", value: portfolioMetrics?.spendableCash ?? 0, color: T.text.primary },
               (portfolioMetrics?.ccDebt ?? 0) > 0 ? { label: "CC Debt", value: portfolioMetrics.ccDebt, color: T.status.red } : null,
             ].filter((metric): metric is CompactMetric => metric !== null);

             return (
               <div style={{
                 display: "grid",
                 gridTemplateColumns: isCompactWidth
                   ? "repeat(2, minmax(0, 1fr))"
                   : `repeat(${Math.min(metrics.length, 4)}, minmax(0, 1fr))`,
                 gap: 8,
                 marginBottom: 12,
               }}>
               {metrics.map((m, index) => (
                   <div
                     key={m.label}
                     style={{
                       padding: "13px 11px 12px",
                       background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.elevated})`,
                       border: `1px solid ${T.border.subtle}`,
                       borderRadius: T.radius.lg,
                       textAlign: "center",
                       boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04)`,
                       gridColumn: isCompactWidth && metrics.length % 2 === 1 && index === metrics.length - 1 ? "1 / -1" : "auto",
                     }}
                   >
                     <div style={{ fontSize: 9, fontWeight: 800, color: T.text.dim, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 5, fontFamily: T.font.mono }}>
                       {m.label}
                     </div>
                     <div style={{ fontSize: 14, fontWeight: 850, color: privacyMode ? T.text.dim : m.color, fontFamily: T.font.mono, letterSpacing: "-0.02em" }}>
                       {privacyMode ? "••••" : fmt(m.value)}
                     </div>
                   </div>
                 ))}
               </div>
             );
           })()}

           {/* ═══ SAVINGS RATE WIDGET ═══ */}
           {fireProjection?.savingsRatePct != null && fireProjection.status === "ok" && (
             (() => {
               const pct = fireProjection.savingsRatePct as number;
               const clampedPct = Math.max(0, Math.min(100, pct));
               const rateColor = pct >= 20 ? T.status.green : pct >= 10 ? T.status.blue : pct >= 0 ? T.status.amber : T.status.red;
               const circumference = 2 * Math.PI * 22;
               const strokeDashoffset = circumference - (clampedPct / 100) * circumference;
               const rateLabel = pct >= 20 ? "Excellent" : pct >= 10 ? "Good" : pct >= 0 ? "Low" : "Negative";
               return (
                 <div
                   style={{
                     display: "flex",
                     alignItems: "center",
                     gap: 14,
                     padding: "14px 16px",
                     borderRadius: T.radius.lg,
                     background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.elevated})`,
                     border: `1px solid ${T.border.subtle}`,
                     marginBottom: 12,
                     boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04)`,
                   }}
                 >
                   <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0 }}>
                     <svg width="52" height="52" style={{ transform: "rotate(-90deg)" }}>
                       <circle cx="26" cy="26" r="22" fill="none" stroke={`${T.border.subtle}`} strokeWidth="4" />
                       <circle
                         cx="26" cy="26" r="22" fill="none"
                         stroke={rateColor} strokeWidth="4"
                         strokeDasharray={circumference}
                         strokeDashoffset={strokeDashoffset}
                         strokeLinecap="round"
                         style={{ transition: "stroke-dashoffset .6s ease" }}
                       />
                     </svg>
                     <div style={{
                       position: "absolute", inset: 0,
                       display: "flex", alignItems: "center", justifyContent: "center",
                       fontSize: 12, fontWeight: 900, color: rateColor, fontFamily: T.font.mono,
                     }}>
                       {pct.toFixed(0)}%
                     </div>
                   </div>
                   <div style={{ minWidth: 0, flex: 1 }}>
                     <div style={{ fontSize: 9, fontWeight: 800, color: T.text.dim, letterSpacing: "0.05em", textTransform: "uppercase", fontFamily: T.font.mono, marginBottom: 3 }}>
                       SAVINGS RATE
                     </div>
                     <div style={{ fontSize: 13, fontWeight: 800, color: T.text.primary, lineHeight: 1.3 }}>
                       {rateLabel}
                     </div>
                     <div style={{ fontSize: 10, color: T.text.secondary, lineHeight: 1.35, marginTop: 2 }}>
                       {pct >= 20
                         ? "You're saving more than most — keep it up."
                         : pct >= 10
                           ? "Solid ground. Push toward 20% for faster FIRE progress."
                           : pct >= 0
                             ? "Low savings rate. Look for expenses to cut or income to increase."
                             : "Spending exceeds income. Prioritize cash flow repair."
                       }
                     </div>
                   </div>
                 </div>
               );
             })()
           )}

           {/* ═══ ACTION ROW — Sync + Ledger ═══ */}
           <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
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
                   padding: "12px 14px",
                   borderRadius: T.radius.lg,
                   border: `1px solid ${T.border.subtle}`,
                   background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.elevated})`,
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
                   flex: "1 1 160px",
                   display: "flex",
                   alignItems: "center",
                   justifyContent: "center",
                   gap: 6,
                   padding: "12px 14px",
                   borderRadius: T.radius.lg,
                   border: `1px solid ${T.border.subtle}`,
                   background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.elevated})`,
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

           {(syncState.phase === "syncing" || syncState.phase === "warning") && (
             <div
               style={{
                 marginBottom: 12,
                 padding: "12px 14px",
                 borderRadius: T.radius.md,
               border: `1px solid ${syncState.phase === "warning" ? `${T.status.amber}35` : `${T.status.blue}28`}`,
               background:
                 syncState.phase === "warning"
                   ? `linear-gradient(180deg, ${T.status.amber}12, ${T.bg.card})`
                   : `linear-gradient(180deg, ${T.status.blue}10, ${T.bg.card})`,
               boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04)`,
              }}
            >
               <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 8 }}>
                 <div style={{ fontSize: 12, fontWeight: 800, color: T.text.primary }}>
                   {syncState.phase === "warning" ? "Bank sync needs attention" : syncState.message}
                 </div>
                 {syncState.phase === "syncing" && (
                   <div style={{ fontSize: 11, fontWeight: 700, color: T.text.secondary, fontFamily: T.font.mono }}>
                     {syncState.completedCount}/{Math.max(syncState.requestedCount, 1)}
                   </div>
                 )}
               </div>
               {syncState.phase === "syncing" ? (
                 <>
                   <div
                     style={{
                       height: 6,
                       borderRadius: 999,
                       background: T.bg.elevated,
                       overflow: "hidden",
                       border: `1px solid ${T.border.subtle}`,
                       marginBottom: 8,
                     }}
                   >
                     <div
                       style={{
                         width: `${Math.round((syncState.completedCount / Math.max(syncState.requestedCount, 1)) * 100)}%`,
                         height: "100%",
                         background: `linear-gradient(90deg, ${T.status.blue}, ${T.accent.primary})`,
                         transition: "width .25s ease",
                       }}
                     />
                   </div>
                   <div style={{ fontSize: 11, color: T.text.secondary }}>
                     {syncState.activeInstitution ? `Refreshing ${syncState.activeInstitution}...` : "Refreshing linked accounts..."}
                   </div>
                 </>
               ) : (
                 <div style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.5 }}>
                   {syncState.warning}
                 </div>
               )}
             </div>
           )}

           {/* Pro upsell — compact strip for free users only */}
           {shouldShowGating() && !proEnabled && (
             <ProBanner
               compact
               onUpgrade={() => setShowPaywall(true)}
               label="Unlock Catalyst Cash Pro"
               sublabel={buildPromoLine(["chats", "plaid", "ledger"])}
             />
           )}

           {/* 📋 SETUP CHECKLIST — Minimalist & Premium */}
           {completedSteps < steps.length && (
             <DashboardSection marginTop={16}>
               <div
                 className="fade-in slide-up"
                style={{
                   padding: isSmallPhone ? "18px 18px" : "20px 24px",
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
                 
                 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
                   <div>
                     <h3 style={{ fontSize: "clamp(17px, 4.8vw, 18px)", fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em", margin: "0 0 4px" }}>
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
                   {steps.map((step) => (
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
                       onMouseEnter={(e) => {
                         if (!step.done) {
                           e.currentTarget.style.transform = "translateY(-2px)";
                           e.currentTarget.style.boxShadow = `0 6px 16px ${T.bg.base}`;
                         }
                       }}
                       onMouseLeave={(e) => {
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
          {typeof onDemoAudit === "function" && (
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
              <button
                onClick={() => {
                  haptic.light();
                  onDemoAudit();
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: `1px solid ${T.border.default}`,
                  background: "transparent",
                  color: T.text.secondary,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Zap size={12} strokeWidth={2.2} />
                {current?.isTest ? "Reload Demo Data" : "Load Demo Data"}
              </button>
            </div>
          )}
          {(summary || insightSentences.length > 0 || nextActionBrief) && (
            <Card
              animate
              style={{
                padding: isSmallPhone ? "18px 16px" : "20px 18px",
                marginBottom: 10,
                background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.surface})`,
                border: `1px solid ${T.border.subtle}`,
                boxShadow: `0 18px 42px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.04)`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 9,
                      background: `linear-gradient(135deg, ${T.accent.primary}, #6C60FF)`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: `0 8px 18px ${T.accent.primary}35`,
                    }}
                  >
                    <Zap size={15} color="#fff" strokeWidth={2.5} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, fontFamily: T.font.mono, letterSpacing: "0.05em", marginBottom: 2 }}>
                      CFO INSIGHTS
                    </div>
                    <h2 id="dashboard-cfo-insights" style={{ fontSize: "clamp(14px, 4vw, 15px)", fontWeight: 800, color: T.text.primary, margin: 0 }}>
                      Briefing Board
                    </h2>
                  </div>
                </div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: `${safetyColor}12`,
                    border: `1px solid ${safetyColor}25`,
                    color: safetyColor,
                    fontSize: 11,
                    fontWeight: 800,
                    fontFamily: T.font.mono,
                    letterSpacing: "0.02em",
                  }}
                >
                  {safetyIcon}
                  {safetyLabel}
                </div>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <div
                  style={{
                    padding: isSmallPhone ? "12px 12px 11px" : "13px 13px 12px",
                    borderRadius: T.radius.lg,
                    background: `${T.bg.surface}`,
                    border: `1px solid ${T.border.subtle}`,
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, fontFamily: T.font.mono, letterSpacing: "0.05em", marginBottom: 6 }}>
                    WHAT MATTERS NOW
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, lineHeight: 1.45, marginBottom: 8 }}>
                    {summary || safetySnapshot.summary}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 9px",
                        borderRadius: 999,
                        background: `${T.bg.elevated}`,
                        border: `1px solid ${T.border.subtle}`,
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: T.text.secondary,
                      }}
                    >
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: safetyColor }} />
                      {safetySnapshot.headline}
                    </div>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 9px",
                        borderRadius: 999,
                        background: `${T.bg.elevated}`,
                        border: `1px solid ${T.border.subtle}`,
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: T.text.secondary,
                      }}
                    >
                      <AlertTriangle size={12} color={scoreColor} strokeWidth={2.2} />
                      {primaryRiskLabel}
                    </div>
                  </div>
                </div>

                {insightSentences.length > 0 && (
                  <div style={{ display: "grid", gap: 8 }}>
                    {insightSentences.map((sentence, i) => {
                      return (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            gap: 10,
                            alignItems: "flex-start",
                            background: `${T.bg.surface}`,
                            padding: isSmallPhone ? "10px 11px" : "11px 12px",
                            borderRadius: T.radius.md,
                            border: `1px solid ${T.border.subtle}`,
                          }}
                        >
                          <div style={{ marginTop: 2, flexShrink: 0 }}>
                            {i === 0 ? (
                              <CheckCircle size={13} color={T.status.green} />
                            ) : (
                              <ArrowUpRight size={13} color={T.status.blue} />
                            )}
                          </div>
                          <p style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.5, margin: 0, overflowWrap: "anywhere" }}>
                            {sentence}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {nextActionBrief && (
                  <div
                    style={{
                      padding: isSmallPhone ? "14px 12px" : "15px 14px",
                      borderRadius: T.radius.lg,
                      background: `linear-gradient(180deg, ${T.accent.primary}0F, ${T.bg.surface})`,
                      border: `1px solid ${T.accent.primary}18`,
                      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04)`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, fontFamily: T.font.mono, letterSpacing: "0.05em", marginBottom: 4 }}>
                          PRIORITIZED NEXT ACTION
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: T.accent.primary }}>
                          {nextActionBrief.label}
                        </div>
                      </div>
                      {nextActionBrief.amountMatch && (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "6px 10px",
                            borderRadius: 999,
                            background: `${T.accent.primary}14`,
                            border: `1px solid ${T.accent.primary}22`,
                            color: T.accent.primary,
                            fontSize: 12,
                            fontWeight: 800,
                            fontFamily: T.font.mono,
                            flexShrink: 0,
                          }}
                        >
                          {nextActionBrief.amountMatch}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 850, color: T.text.primary, lineHeight: 1.28, letterSpacing: "-0.02em", marginBottom: nextActionBrief.detail ? 8 : 0 }}>
                      {nextActionBrief.headline}
                    </div>
                    {nextActionBrief.detail && (
                      <>
                        <div
                          style={{
                            fontSize: 12.5,
                            color: T.text.secondary,
                            lineHeight: 1.55,
                            ...(nextActionExpanded
                              ? {}
                              : {
                                  display: "-webkit-box",
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: "vertical",
                                  overflow: "hidden",
                                }),
                          }}
                        >
                          {nextActionBrief.detail}
                        </div>
                        {nextActionBrief.detail.length > 110 && (
                          <button
                            onClick={() => {
                              haptic.light();
                              setNextActionExpanded((expanded) => !expanded);
                            }}
                            style={{
                              marginTop: 8,
                              background: "none",
                              border: "none",
                              color: T.accent.primary,
                              fontSize: 11.5,
                              fontWeight: 700,
                              cursor: "pointer",
                              padding: "0",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              fontFamily: T.font.mono,
                              letterSpacing: "0.02em",
                            }}
                          >
                            {nextActionExpanded ? "Show less ↑" : "Show more ↓"}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}

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
                      marginTop: 2,
                      padding: "14px 18px",
                      borderRadius: T.radius.lg,
                      background: `linear-gradient(135deg, ${T.accent.primary}CC, #8B5CF6CC, ${T.accent.primary}CC)`,
                      border: `1px solid ${T.accent.primary}55`,
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 800,
                      cursor: "pointer",
                      letterSpacing: "-0.01em",
                      boxShadow: `0 4px 18px ${T.accent.primary}30, inset 0 1px 0 rgba(255,255,255,0.08)`,
                    }}
                  >
                    <MessageCircle size={16} strokeWidth={2.4} />
                    Discuss with your AI CFO
                  </button>
                )}
              </div>
            </Card>
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
