import { lazy, memo, Suspense, useCallback, useState, type CSSProperties, type ReactNode } from "react";

import { performCloudBackup } from "../backup.js";
import AlertStrip from "../dashboard/AlertStrip.js";
import DashboardOverview from "../dashboard/DashboardOverview.js";
import { DashboardTopChrome } from "../dashboard/DashboardTopChrome.js";
import EmptyDashboard from "../dashboard/EmptyDashboard.js";
import InsightsBoardCard from "../dashboard/InsightsBoardCard.js";
import {
  buildDashboardNextAction,
  computeScorePercentile,
  normalizeDashboardStatus,
  splitDashboardSentences,
} from "../dashboard/model.js";
import SafetySnapshotCard from "../dashboard/SafetySnapshotCard.js";
import SetupChecklistCard, { type DashboardSetupStep } from "../dashboard/SetupChecklistCard.js";
import { useDashboardChrome } from "../dashboard/useDashboardChrome.js";
import useDashboardData from "../dashboard/useDashboardData.js";
import { T } from "../constants.js";
import { useAudit } from "../contexts/AuditContext.js";
import { useNavigation } from "../contexts/NavigationContext.js";
import { usePortfolio } from "../contexts/PortfolioContext.js";
import { useSecurity } from "../contexts/SecurityContext.js";
import { useSettings } from "../contexts/SettingsContext.js";
import { haptic } from "../haptics.js";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  RefreshCw,
  Settings,
  Shield,
} from "../icons";
import { isGatingEnforced } from "../subscription.js";
import { Card as UICard } from "../ui.js";
import { usePlaidSync } from "../usePlaidSync.js";
import "./DashboardTab.css";

import type { CatalystCashConfig, HealthScore } from "../../types/index.js";

const LazyProPaywall = lazy(() => import("./ProPaywall.js"));
const LazyConfetti = lazy(() => import("react-confetti"));

interface DashboardSectionProps {
  children: ReactNode;
  marginTop?: number;
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
  const steps: DashboardSetupStep[] = [
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
  const cleanStatus = normalizeDashboardStatus(p?.status);
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
    safetySnapshot.primaryRisk === "floor-gap" ? "Floor coverage needs attention"
    : safetySnapshot.primaryRisk === "pending" ? "Pending charges are driving the pressure"
    : safetySnapshot.primaryRisk === "bills" ? "Upcoming bills are driving the pressure"
    : safetySnapshot.primaryRisk === "card-minimums" ? "Card minimums are driving the pressure"
    : safetySnapshot.primaryRisk === "score" ? "Overall audit health needs attention"
    : "No major near-term issue detected";
  const nextActionBrief = buildDashboardNextAction(p?.sections?.nextAction);
  const insightSentences = splitDashboardSentences(hs?.narrative)
    .filter((sentence) => !summary || sentence.toLowerCase() !== summary.toLowerCase())
    .slice(0, 2);

  // ── Synthetic Percentile (client-side, no real user data) ──
  const percentile = computeScorePercentile(score);
  const canSyncPlaid = !current?.isTest && (cards.some((card) => card._plaidAccountId) || bankAccounts.some((account) => account._plaidAccountId));
  const showInsightsBoard = Boolean(summary || insightSentences.length > 0 || nextActionBrief);

  const handleDemoAuditClick = useCallback(() => {
    if (!onDemoAudit) return;
    haptic.light();
    onDemoAudit();
  }, [onDemoAudit]);

  const handleOpenPortfolio = useCallback(() => {
    haptic.selection();
    navTo("portfolio");
  }, [navTo]);

  const handleOpenAudit = useCallback(() => {
    haptic.selection();
    navTo("audit");
  }, [navTo]);

  const handleViewTransactionsClick = useCallback(() => {
    haptic.light();
    if (proEnabled || !isGatingEnforced()) {
      onViewTransactions?.();
    } else {
      setShowPaywall(true);
    }
  }, [onViewTransactions, proEnabled]);

  const handleDiscussWithCFO = useCallback(() => {
    if (!p || !onDiscussWithCFO) return;
    haptic.light();
    const status = p.status || "unknown";
    const hsScore = p.healthScore?.score;
    const nextAction = p.sections?.nextAction || "";
    const prompt = `I just reviewed my latest audit (Status: ${status}${hsScore != null ? `, Health Score: ${hsScore}/100` : ""}). ${nextAction ? `My next action says: "${nextAction.slice(0, 200)}"` : ""} Walk me through what I should focus on right now and explain why.`;
    onDiscussWithCFO(prompt);
  }, [onDiscussWithCFO, p]);

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
                border: `1px solid ${T.status.amber}24`,
                background: T.bg.card,
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
                    {current?.demoScenarioName || "Demo scenario"} active. Demo mode clears on full app relaunch.
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {typeof onDemoAudit === "function" && (
                    <button type="button"
                      className="a11y-hit-target"
                      onClick={handleDemoAuditClick}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        padding: "6px 12px",
                        borderRadius: T.radius.md,
                        border: `1px solid ${T.border.default}`,
                        background: T.bg.elevated,
                        color: T.text.primary,
                        fontSize: 10,
                        fontWeight: 800,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <RefreshCw size={11} strokeWidth={2.5} />
                      Load next demo
                    </button>
                  )}
                  <button type="button"
                    className="a11y-hit-target"
                    onClick={onRefreshDashboard}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "6px 12px",
                      borderRadius: T.radius.md,
                      border: `1px solid ${T.border.default}`,
                      background: T.bg.elevated,
                      color: T.text.primary,
                      fontSize: 10,
                      fontWeight: 800,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <RefreshCw size={11} strokeWidth={2.5} />
                    Reset
                  </button>
                </div>
              </div>
            </Card>
          )}

           {/* Pro Upgrade Banner — slim strip, placed after hero so data leads */}
           {showPaywall && (
             <Suspense fallback={null}>
               <LazyProPaywall onClose={() => setShowPaywall(false)} source="dashboard" />
             </Suspense>
           )}

           <SafetySnapshotCard
             visible={Boolean(p)}
             safetyColor={safetyColor}
             safetyLabel={safetyLabel}
             safetyIcon={safetyIcon}
             headline={safetySnapshot.headline}
             summary={safetySnapshot.summary}
             safeToSpend={Math.max(0, safetySnapshot.safeToSpend)}
             protectedNeed={safetySnapshot.protectedNeed}
             runwayWeeks={safetySnapshot.runwayWeeks}
             pendingCharges={safetySnapshot.pendingCharges}
             upcomingBills30d={safetySnapshot.upcomingBills30d}
             primaryRiskLabel={primaryRiskLabel}
             grade={grade}
             score={score}
             scoreColor={scoreColor}
             isSmallPhone={isSmallPhone}
             isCompactWidth={isCompactWidth}
             privacyMode={privacyMode}
           />

           <DashboardOverview
             grade={grade}
             score={score}
             scoreColor={scoreColor}
             cleanStatus={cleanStatus}
             percentile={percentile}
             isSmallPhone={isSmallPhone}
             isCompactWidth={isCompactWidth}
             privacyMode={privacyMode}
             netWorth={portfolioMetrics?.netWorth || 0}
             spendableCash={portfolioMetrics?.spendableCash ?? 0}
             ccDebt={portfolioMetrics?.ccDebt ?? 0}
             safetySnapshot={safetySnapshot}
             fireProjection={fireProjection}
             canSync={canSyncPlaid}
             syncing={syncing}
             syncState={syncState}
             proEnabled={proEnabled}
             onOpenPortfolio={handleOpenPortfolio}
             onOpenAudit={handleOpenAudit}
             onSync={() => {
               haptic.medium();
               handleSyncBalances();
             }}
             onViewTransactions={handleViewTransactionsClick}
             onUpgrade={() => setShowPaywall(true)}
           />

           {/* 📋 SETUP CHECKLIST — Minimalist & Premium */}
           {completedSteps < steps.length && (
             <DashboardSection marginTop={16}>
               <SetupChecklistCard
                 steps={steps}
                 completedSteps={completedSteps}
                 progressPct={progressPct}
                 isSmallPhone={isSmallPhone}
               />
             </DashboardSection>
           )}
          {/* ═══ ALERT STRIP ═══ */}
          <AlertStrip alerts={alerts} />



          <DashboardSection>
          <InsightsBoardCard
            visible={showInsightsBoard}
            summary={summary}
            fallbackSummary={safetySnapshot.summary}
            insightSentences={insightSentences}
            nextActionBrief={nextActionBrief}
            nextActionExpanded={nextActionExpanded}
            safetyColor={safetyColor}
            safetyLabel={safetyLabel}
            safetyIcon={safetyIcon}
            safetyHeadline={safetySnapshot.headline}
            primaryRiskLabel={primaryRiskLabel}
            isSmallPhone={isSmallPhone}
            onToggleNextAction={() => {
              haptic.light();
              setNextActionExpanded((expanded) => !expanded);
            }}
            {...(p && onDiscussWithCFO ? { onDiscussWithCFO: handleDiscussWithCFO } : {})}
          />

          </DashboardSection>

          {/* Audit content moved to dedicated Audit tab */}
          <p
            style={{
              fontSize: 9,
              color: T.text.muted,
              textAlign: "center",
              marginTop: 14,
              lineHeight: 1.5,
              opacity: 0.75,
            }}
          >
            AI-generated educational content only · Not professional financial advice
          </p>
        </>
      </div>
    </div>
  );
});
