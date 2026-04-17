import type { CSSProperties, ReactNode } from "react";

import { T } from "../constants.js";
import { ReceiptText, RefreshCw, Zap } from "../icons";
import { buildPromoLine } from "../planCatalog.js";
import { isGatingEnforced } from "../subscription.js";
import { Card as UICard } from "../ui.js";
import ProBanner from "../tabs/ProBanner.js";
import { fmt } from "../utils.js";

interface FireProjection {
  savingsRatePct?: number | null;
  status?: string | null;
}

interface SyncState {
  phase?: string;
  message?: string;
  warning?: string | null;
  completedCount?: number;
  requestedCount?: number;
  activeInstitution?: string | null;
}

interface SafetySnapshotSummary {
  level: string;
  safeToSpend: number;
  protectedNeed: number;
}

interface DashboardOverviewProps {
  grade: string;
  score: number;
  scoreColor: string;
  cleanStatus: string;
  percentile: number;
  isSmallPhone: boolean;
  isCompactWidth: boolean;
  privacyMode: boolean;
  netWorth: number;
  spendableCash: number;
  ccDebt: number;
  safetySnapshot: SafetySnapshotSummary;
  fireProjection?: FireProjection | null;
  canSync: boolean;
  syncing: boolean;
  syncState: SyncState;
  proEnabled: boolean;
  onOpenPortfolio: () => void;
  onOpenAudit: () => void;
  onSync: () => void;
  onViewTransactions: () => void;
  onUpgrade: () => void;
}

interface CompactMetric {
  label: string;
  value: number;
  color: string;
}

const Card = UICard as unknown as (props: {
  children?: ReactNode;
  animate?: boolean;
  className?: string;
  onClick?: () => void;
  style?: CSSProperties;
}) => ReactNode;

export default function DashboardOverview({
  grade,
  score,
  scoreColor,
  cleanStatus,
  percentile,
  isSmallPhone,
  isCompactWidth,
  privacyMode,
  netWorth,
  spendableCash,
  ccDebt,
  safetySnapshot,
  fireProjection,
  canSync,
  syncing,
  syncState,
  proEnabled,
  onOpenPortfolio,
  onOpenAudit,
  onSync,
  onViewTransactions,
  onUpgrade,
}: DashboardOverviewProps) {
  const safeColor =
    safetySnapshot.level === "urgent"
      ? T.status.red
      : safetySnapshot.level === "caution"
        ? T.status.amber
        : T.status.green;

  const metrics: CompactMetric[] = [
    { label: "Safe to Spend", value: Math.max(0, safetySnapshot.safeToSpend), color: safeColor },
    { label: "Protected Need", value: safetySnapshot.protectedNeed, color: T.text.primary },
    { label: "Checking", value: spendableCash, color: T.text.primary },
    ccDebt > 0 ? { label: "CC Debt", value: ccDebt, color: T.status.red } : null,
  ].filter((metric): metric is CompactMetric => metric !== null);

  const showSavingsRate = fireProjection?.savingsRatePct != null && fireProjection.status === "ok";
  const showFreeBanner = shouldShowFreeBanner(proEnabled);

  return (
    <>
      <Card
        animate
        className="hover-card a11y-hit-target"
        onClick={onOpenPortfolio}
        style={{
          padding: isSmallPhone ? "18px 16px" : "22px 20px",
          marginBottom: 14,
          background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.elevated})`,
          border: `1px solid ${T.border.default}`,
          cursor: "pointer",
          position: "relative",
          overflow: "visible",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, letterSpacing: "0.10em", fontFamily: T.font.mono, textTransform: "uppercase" }}>
            Weekly Snapshot
          </span>
          <button
            onClick={(event) => {
              event.stopPropagation();
              onOpenAudit();
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: score > 0 ? 6 : 5,
              padding: "6px 10px",
              borderRadius: 99,
              background: score > 0 ? `${scoreColor}10` : `${T.bg.surface}`,
              border: `1px solid ${score > 0 ? `${scoreColor}20` : T.border.default}`,
              cursor: "pointer",
            }}
          >
            {score > 0 ? (
              <>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: scoreColor }} />
                <span style={{ fontSize: 11, fontWeight: 800, color: scoreColor, fontFamily: T.font.mono, letterSpacing: "0.02em" }}>
                  {grade} · {score}/100
                </span>
              </>
            ) : (
              <>
                <Zap size={10} color={T.accent.primary} strokeWidth={3} />
                <span style={{ fontSize: 10, fontWeight: 700, color: T.accent.primary }}>Refresh Briefing</span>
              </>
            )}
          </button>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            background: `linear-gradient(180deg, ${T.bg.elevated} 0%, ${T.bg.card} 100%)`,
            border: `1px solid ${T.border.default}`,
            borderRadius: T.radius.lg,
            padding: isSmallPhone ? "16px 14px 18px" : "20px 18px 22px",
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04)`,
            marginBottom: 8,
          }}
        >
          <div>
            <h2 style={{ fontSize: 11, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, fontFamily: T.font.mono }}>
              Net Worth
            </h2>
            <div
              style={{
                fontSize: isCompactWidth ? "clamp(28px, 8.2vw, 34px)" : "clamp(30px, 9vw, 36px)",
                fontWeight: 850,
                color: privacyMode ? T.text.dim : T.text.primary,
                letterSpacing: "-0.04em",
                overflowWrap: "anywhere",
                lineHeight: 1.02,
              }}
            >
              {privacyMode ? "••••••" : fmt(netWorth)}
            </div>
          </div>
        </div>

        {score > 0 && (
          <span style={{ fontSize: 11, color: T.text.secondary, fontWeight: 500 }}>
            Status: <span style={{ color: scoreColor, fontWeight: 700 }}>{cleanStatus}</span>
            {percentile > 0 && <span style={{ color: T.text.dim }}> · Top {100 - percentile}%</span>}
          </span>
        )}
      </Card>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isCompactWidth
            ? "repeat(2, minmax(0, 1fr))"
            : `repeat(${Math.min(metrics.length, 4)}, minmax(0, 1fr))`,
          gap: 8,
          marginBottom: 12,
        }}
      >
        {metrics.map((metric, index) => (
          <div
            key={metric.label}
            style={{
              padding: "13px 11px 12px",
              background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.elevated})`,
              border: `1px solid ${T.border.default}`,
              borderRadius: T.radius.lg,
              textAlign: "center",
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.03)`,
              gridColumn: isCompactWidth && metrics.length % 2 === 1 && index === metrics.length - 1 ? "1 / -1" : "auto",
            }}
          >
            <div style={{ fontSize: 9, fontWeight: 800, color: T.text.dim, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 5, fontFamily: T.font.mono }}>
              {metric.label}
            </div>
            <div style={{ fontSize: 14, fontWeight: 850, color: privacyMode ? T.text.dim : metric.color, fontFamily: T.font.mono, letterSpacing: "-0.02em" }}>
              {privacyMode ? "••••" : fmt(metric.value)}
            </div>
          </div>
        ))}
      </div>

      {showSavingsRate && (
        <SavingsRateCard pct={fireProjection?.savingsRatePct as number} />
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {canSync && (
          <button
            onClick={onSync}
            disabled={syncing}
            className="hover-btn"
            style={actionButtonStyle(syncing ? "wait" : "pointer")}
          >
            <RefreshCw size={12} strokeWidth={2.5} style={{ animation: syncing ? "ringSweep 1s linear infinite" : "none" }} />
            {syncing ? "SYNC…" : "SYNC"}
          </button>
        )}
        <button
          onClick={onViewTransactions}
          className="hover-btn"
          style={{ ...actionButtonStyle("pointer"), flex: "1 1 160px", position: "relative" }}
        >
          {!proEnabled && (
            <div style={{ position: "absolute", top: 6, right: 6, fontSize: 7, fontWeight: 800, background: T.accent.primary, color: "#fff", padding: "1px 4px", borderRadius: 4, fontFamily: T.font.mono }}>
              PRO
            </div>
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
                ? `linear-gradient(180deg, ${T.bg.elevated}, ${T.bg.card})`
                : `linear-gradient(180deg, ${T.bg.elevated}, ${T.bg.card})`,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.03)`,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: T.text.primary }}>
              {syncState.phase === "warning" ? "Bank sync needs attention" : syncState.message}
            </div>
            {syncState.phase === "syncing" && (
              <div style={{ fontSize: 11, fontWeight: 700, color: T.text.secondary, fontFamily: T.font.mono }}>
                {(syncState.completedCount || 0)}/{Math.max(syncState.requestedCount || 0, 1)}
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
                    width: `${Math.round(((syncState.completedCount || 0) / Math.max(syncState.requestedCount || 0, 1)) * 100)}%`,
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

      {showFreeBanner && (
        <ProBanner
          compact
          onUpgrade={onUpgrade}
          label="Unlock Catalyst Cash Pro"
          sublabel={buildPromoLine(["chats", "plaid", "ledger"])}
        />
      )}
    </>
  );
}

function SavingsRateCard({ pct }: { pct: number }) {
  const clampedPct = Math.max(0, Math.min(100, pct));
  const rateColor =
    pct >= 20 ? T.status.green : pct >= 10 ? T.status.blue : pct >= 0 ? T.status.amber : T.status.red;
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
        border: `1px solid ${T.border.default}`,
        marginBottom: 12,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04)`,
      }}
    >
      <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0 }}>
        <svg width="52" height="52" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="26" cy="26" r="22" fill="none" stroke={`${T.border.subtle}`} strokeWidth="4" />
          <circle
            cx="26"
            cy="26"
            r="22"
            fill="none"
            stroke={rateColor}
            strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset .6s ease" }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 900,
            color: rateColor,
            fontFamily: T.font.mono,
          }}
        >
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
                : "Spending exceeds income. Prioritize cash flow repair."}
        </div>
      </div>
    </div>
  );
}

function actionButtonStyle(cursor: "pointer" | "wait"): CSSProperties {
  return {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "12px 14px",
    borderRadius: T.radius.lg,
    border: `1px solid ${T.border.default}`,
    background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.elevated})`,
    color: T.text.primary,
    cursor,
    transition: "all .2s",
    opacity: cursor === "wait" ? 0.7 : 1,
    fontSize: 11,
    fontWeight: 700,
    fontFamily: T.font.mono,
    letterSpacing: "0.06em",
  };
}

function shouldShowFreeBanner(proEnabled: boolean) {
  return isGatingEnforced() && !proEnabled;
}
