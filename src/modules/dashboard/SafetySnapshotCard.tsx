import type { CSSProperties, ReactNode } from "react";

import { T } from "../constants.js";
import { Card as UICard } from "../ui.js";

interface SafetySnapshotCardProps {
  safetyColor: string;
  safetyLabel: string;
  safetyIcon: ReactNode;
  headline: string;
  summary: string;
  safeToSpend: number;
  protectedNeed: number;
  runwayWeeks?: number | null;
  pendingCharges: number;
  upcomingBills30d: number;
  primaryRiskLabel: string;
  grade: string;
  score: number;
  scoreColor: string;
  isSmallPhone: boolean;
  isCompactWidth: boolean;
  privacyMode: boolean;
  visible: boolean;
}

const Card = UICard as unknown as (props: { children?: ReactNode; animate?: boolean; style?: CSSProperties }) => ReactNode;

export default function SafetySnapshotCard({
  safetyColor,
  safetyLabel,
  safetyIcon,
  headline,
  summary,
  safeToSpend,
  protectedNeed,
  runwayWeeks,
  pendingCharges,
  upcomingBills30d,
  primaryRiskLabel,
  grade,
  score,
  scoreColor,
  isSmallPhone,
  isCompactWidth,
  privacyMode,
  visible,
}: SafetySnapshotCardProps) {
  if (!visible) return null;

  return (
    <Card
      animate
      style={{
        padding: isSmallPhone ? "18px 16px" : "20px 18px",
        marginBottom: 12,
        background: T.bg.card,
        border: `1px solid ${T.border.subtle}`,
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
            background: T.bg.elevated,
            border: `1px solid ${T.border.subtle}`,
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
            background: T.bg.elevated,
            border: `1px solid ${T.border.subtle}`,
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
            {headline}
          </div>
          <p style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.45, margin: 0 }}>
            {summary}
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
              {privacyMode ? "••••••" : safeToSpend.toLocaleString("en-US", { style: "currency", currency: "USD" })}
            </div>
            <div style={{ fontSize: 10, color: T.text.dim, marginTop: 4, lineHeight: 1.35 }}>
              Protected need: {privacyMode ? "••••" : protectedNeed.toLocaleString("en-US", { style: "currency", currency: "USD" })}
            </div>
          </div>

          <MetricTile
            label="RUNWAY"
            value={runwayWeeks != null ? `${runwayWeeks.toFixed(1)}w` : "Set budget"}
            isCompactWidth={isCompactWidth}
          />
          <MetricTile
            label="PENDING"
            value={privacyMode ? "••••" : pendingCharges.toLocaleString("en-US", { style: "currency", currency: "USD" })}
            isCompactWidth={isCompactWidth}
          />
          <MetricTile
            label="30-DAY BILLS"
            value={privacyMode ? "••••" : upcomingBills30d.toLocaleString("en-US", { style: "currency", currency: "USD" })}
            isCompactWidth={isCompactWidth}
          />
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
        </div>
      </div>
    </Card>
  );
}

function MetricTile({
  label,
  value,
  isCompactWidth,
}: {
  label: string;
  value: string;
  isCompactWidth: boolean;
}) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: T.radius.md,
        background: `${T.bg.card}`,
        border: `1px solid ${T.border.subtle}`,
        minWidth: 0,
        gridColumn: isCompactWidth ? "span 2" : "auto",
      }}
    >
      <div style={{ fontSize: 9, fontWeight: 800, color: T.text.dim, letterSpacing: "0.05em", fontFamily: T.font.mono, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, color: T.text.primary, overflowWrap: "anywhere" }}>
        {value}
      </div>
    </div>
  );
}
