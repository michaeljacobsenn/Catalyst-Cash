import type { CSSProperties, ReactNode } from "react";

import { T } from "../constants.js";
import { AlertTriangle, ArrowUpRight, CheckCircle, MessageCircle, Zap } from "../icons";
import { Card as UICard } from "../ui.js";
import type { DashboardNextAction } from "./model";

interface InsightsBoardCardProps {
  visible: boolean;
  summary: string;
  fallbackSummary: string;
  insightSentences: string[];
  nextActionBrief: DashboardNextAction | null;
  nextActionExpanded: boolean;
  safetyColor: string;
  safetyLabel: string;
  safetyIcon: ReactNode;
  safetyHeadline: string;
  primaryRiskLabel: string;
  isSmallPhone: boolean;
  onToggleNextAction: () => void;
  onDiscussWithCFO?: () => void;
}

const Card = UICard as unknown as (props: { children?: ReactNode; animate?: boolean; style?: CSSProperties }) => ReactNode;

export default function InsightsBoardCard({
  visible,
  summary,
  fallbackSummary,
  insightSentences,
  nextActionBrief,
  nextActionExpanded,
  safetyColor,
  safetyLabel,
  safetyIcon,
  safetyHeadline,
  primaryRiskLabel,
  isSmallPhone,
  onToggleNextAction,
  onDiscussWithCFO,
}: InsightsBoardCardProps) {
  if (!visible) return null;

  return (
    <Card
      animate
      style={{
        padding: isSmallPhone ? "18px 16px" : "20px 18px",
        marginBottom: 12,
        background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.elevated})`,
        border: `1px solid ${T.border.default}`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), ${T.shadow.card}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 9,
              background: `${T.accent.primary}14`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: `1px solid ${T.accent.primary}24`,
            }}
          >
            <Zap size={15} color={T.accent.primary} strokeWidth={2.5} />
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
            background: `${safetyColor}10`,
            border: `1px solid ${safetyColor}20`,
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
            background: `${T.bg.elevated}`,
            border: `1px solid ${T.border.default}`,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, fontFamily: T.font.mono, letterSpacing: "0.05em", marginBottom: 6 }}>
            WHAT MATTERS NOW
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, lineHeight: 1.45, marginBottom: 8 }}>
            {summary || fallbackSummary}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Pill toneColor={safetyColor}>{safetyHeadline}</Pill>
            <Pill icon={<AlertTriangle size={12} color={safetyColor} strokeWidth={2.2} />}>
              {primaryRiskLabel}
            </Pill>
          </div>
        </div>

        {insightSentences.length > 0 && (
          <div style={{ display: "grid", gap: 8 }}>
            {insightSentences.map((sentence, index) => (
              <div
                key={index}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  background: `${T.bg.surface}`,
                  padding: isSmallPhone ? "10px 11px" : "11px 12px",
                  borderRadius: T.radius.md,
                  border: `1px solid ${T.border.default}`,
                }}
              >
                <div style={{ marginTop: 2, flexShrink: 0 }}>
                  {index === 0 ? (
                    <CheckCircle size={13} color={T.status.green} />
                  ) : (
                    <ArrowUpRight size={13} color={T.status.blue} />
                  )}
                </div>
                <p style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.5, margin: 0, overflowWrap: "anywhere" }}>
                  {sentence}
                </p>
              </div>
            ))}
          </div>
        )}

        {nextActionBrief && (
          <div
            style={{
              padding: isSmallPhone ? "14px 12px" : "15px 14px",
              borderRadius: T.radius.lg,
              background: `linear-gradient(180deg, ${T.bg.elevated}, ${T.bg.card})`,
              border: `1px solid ${T.border.default}`,
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
                    background: `${T.accent.primary}10`,
                    border: `1px solid ${T.accent.primary}20`,
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
                  <button type="button"
                    onClick={onToggleNextAction}
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

        {onDiscussWithCFO && (
          <button type="button"
            className="hover-btn"
            onClick={onDiscussWithCFO}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              marginTop: 2,
              padding: "14px 18px",
              borderRadius: T.radius.lg,
              background: `${T.accent.primary}12`,
              border: `1px solid ${T.accent.primary}28`,
              color: T.accent.primary,
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
              letterSpacing: "-0.01em",
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04)`,
            }}
          >
            <MessageCircle size={16} strokeWidth={2.4} />
            Discuss with your AI CFO
          </button>
        )}
      </div>
    </Card>
  );
}

function Pill({
  children,
  icon,
  toneColor = T.text.secondary,
}: {
  children: ReactNode;
  icon?: ReactNode;
  toneColor?: string;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 9px",
        borderRadius: 999,
        background: `${T.bg.card}`,
        border: `1px solid ${T.border.default}`,
        fontSize: 10.5,
        fontWeight: 700,
        color: T.text.secondary,
      }}
    >
      {icon || <div style={{ width: 6, height: 6, borderRadius: "50%", background: toneColor }} />}
      {children}
    </div>
  );
}
