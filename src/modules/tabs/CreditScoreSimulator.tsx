// ═══════════════════════════════════════════════════════════════
// CREDIT SCORE SIMULATOR — Interactive utilization impact estimator
// Shows how balance changes affect estimated credit score via
// utilization ratio (the #1 controllable FICO factor at ~30% weight)
// ═══════════════════════════════════════════════════════════════
import { useState, useMemo } from "react";
import { T } from "../constants.js";
import { Card } from "../ui.js";
import { Mono } from "../components.js";
import { fmt } from "../utils.js";
import { Activity, TrendingUp, TrendingDown, Minus } from "../icons";
import type { Card as PortfolioCard, CatalystCashConfig } from "../../types/index.js";

interface CreditScoreSimulatorProps {
  cards?: PortfolioCard[];
  financialConfig?: CatalystCashConfig;
}

interface CardUtilizationEntry {
  name: string;
  balance: number;
  limit: number;
  utilPct: number;
}

/**
 * Estimate a utilization-based score component (0-100 scale contribution).
 * Uses FICO-documented utilization breakpoints:
 *   0-9%  = Excellent (max score contribution)
 *   10-29% = Good
 *   30-49% = Fair
 *   50-74% = Poor
 *   75%+  = Very Poor
 */
function utilizationScoreContribution(utilPct: number) {
  if (utilPct <= 0) return 100;
  if (utilPct <= 9) return 100 - (utilPct / 9) * 5; // 100 to 95
  if (utilPct <= 19) return 95 - ((utilPct - 9) / 10) * 10; // 95 to 85
  if (utilPct <= 29) return 85 - ((utilPct - 19) / 10) * 10; // 85 to 75
  if (utilPct <= 39) return 75 - ((utilPct - 29) / 10) * 15; // 75 to 60
  if (utilPct <= 49) return 60 - ((utilPct - 39) / 10) * 15; // 60 to 45
  if (utilPct <= 74) return 45 - ((utilPct - 49) / 25) * 15; // 45 to 30
  if (utilPct <= 100) return 30 - ((utilPct - 74) / 26) * 15; // 30 to 15
  return 15;
}

/**
 * Map utilization to a qualitative tier and color.
 */
function utilizationTier(utilPct: number) {
  if (utilPct <= 9) return { label: "Excellent", color: T.status.green };
  if (utilPct <= 29) return { label: "Good", color: T.status.blue };
  if (utilPct <= 49) return { label: "Fair", color: T.status.amber };
  if (utilPct <= 74) return { label: "Poor", color: T.status.red };
  return { label: "Very Poor", color: T.status.red };
}

export default function CreditScoreSimulator({ cards = [], financialConfig = {} as CatalystCashConfig }: CreditScoreSimulatorProps) {
  const [paydownAmount, setPaydownAmount] = useState("");

  const analysis = useMemo(() => {
    // Aggregate all revolving credit from card portfolio
    const activeCards = cards.filter((c) => {
      // Business cards do not report utilization to personal credit bureaus
      if (c.type === "business") return false;

      const bal = Number(c._plaidBalance ?? c.balance) || 0;
      const lim = Number(c._plaidLimit ?? c.creditLimit ?? c.limit) || 0;
      return lim > 0 || bal > 0;
    });

    if (activeCards.length === 0) return null;

    let totalBalance = 0;
    let totalLimit = 0;
    const cardBreakdown: CardUtilizationEntry[] = [];

    for (const c of activeCards) {
      const bal = Math.max(0, Number(c._plaidBalance ?? c.balance) || 0);
      const lim = Math.max(0, Number(c._plaidLimit ?? c.creditLimit ?? c.limit) || 0);
      totalBalance += bal;
      totalLimit += lim;
      if (lim > 0) {
        cardBreakdown.push({
          name: c.name || c.issuer || "Card",
          balance: bal,
          limit: lim,
          utilPct: (bal / lim) * 100,
        });
      }
    }

    if (totalLimit <= 0) return null;

    const currentUtil = (totalBalance / totalLimit) * 100;
    const paydown = Math.max(0, Math.min(parseFloat(paydownAmount) || 0, totalBalance));
    const newBalance = totalBalance - paydown;
    const newUtil = (newBalance / totalLimit) * 100;

    const currentContrib = utilizationScoreContribution(currentUtil);
    const newContrib = utilizationScoreContribution(newUtil);
    const scoreDelta = Math.round(newContrib) - Math.round(currentContrib);

    const currentTier = utilizationTier(currentUtil);
    const newTier = utilizationTier(newUtil);

    // Sort cards by utilization (highest first — most impactful to pay down)
    cardBreakdown.sort((a, b) => b.utilPct - a.utilPct);

    return {
      totalBalance,
      totalLimit,
      currentUtil,
      newUtil,
      currentContrib,
      newContrib,
      scoreDelta,
      currentTier,
      newTier,
      paydown,
      cardBreakdown: cardBreakdown.slice(0, 5),
      hasPaydown: paydown > 0,
    };
  }, [cards, paydownAmount]);

  if (!analysis) return null;

  const {
    currentUtil,
    newUtil,
    currentTier,
    newTier,
    scoreDelta,
    totalBalance,
    totalLimit,
    cardBreakdown,
    hasPaydown,
  } = analysis;

  return (
    <Card
      animate
      delay={115}
      style={{
        background: `linear-gradient(160deg, ${T.bg.card}, ${T.status.purple}06)`,
        borderColor: `${T.status.purple}15`,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: `${T.status.purple}15`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Activity size={13} color={T.status.purple} strokeWidth={2.5} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Credit Score Simulator</span>
        </div>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: currentTier.color,
            padding: "3px 8px",
            borderRadius: 10,
            background: `${currentTier.color}12`,
            border: `1px solid ${currentTier.color}25`,
          }}
        >
          {currentTier.label}
        </span>
      </div>

      {/* Current utilization bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: T.text.secondary }}>Overall Utilization</span>
          <Mono size={11} weight={800} color={currentTier.color}>
            {currentUtil.toFixed(1)}%
          </Mono>
        </div>
        <div
          style={{
            height: 6,
            borderRadius: 3,
            background: T.bg.elevated,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            style={{
              height: "100%",
              borderRadius: 3,
              width: `${Math.min(currentUtil, 100)}%`,
              background: currentTier.color,
              transition: "width 0.6s ease-out",
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono }}>
            {fmt(Math.round(totalBalance))} used
          </span>
          <span style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono }}>
            {fmt(Math.round(totalLimit))} limit
          </span>
        </div>
      </div>

      {/* What-if input */}
      <div
        style={{
          padding: "10px 12px",
          borderRadius: T.radius.sm,
          background: T.bg.elevated,
          border: `1px solid ${T.border.subtle}`,
          marginBottom: hasPaydown ? 10 : 0,
        }}
      >
        <label
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: T.text.dim,
            fontFamily: T.font.mono,
            display: "block",
            marginBottom: 6,
          }}
        >
          WHAT IF I PAY DOWN...
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: T.accent.emerald }}>$</span>
          <input
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={paydownAmount}
            onChange={e => setPaydownAmount(e.target.value)}
            style={{
              flex: 1,
              padding: "8px 10px",
              fontSize: 14,
              fontWeight: 700,
              fontFamily: T.font.mono,
              background: T.bg.card,
              border: `1px solid ${T.border.default}`,
              borderRadius: T.radius.sm,
              color: T.text.primary,
              minHeight: "unset",
            }}
          />
        </div>
      </div>

      {/* Impact preview (only when paydown entered) */}
      {hasPaydown && (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: T.radius.sm,
            background: scoreDelta > 0 ? `${T.status.green}08` : T.bg.elevated,
            border: `1px solid ${scoreDelta > 0 ? T.status.green : T.border.subtle}20`,
            animation: "fadeInUp .3s ease-out both",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: T.text.secondary }}>Projected Impact</span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {scoreDelta > 0 ? (
                <TrendingUp size={12} color={T.status.green} />
              ) : scoreDelta < 0 ? (
                <TrendingDown size={12} color={T.status.red} />
              ) : (
                <Minus size={12} color={T.text.dim} />
              )}
              <Mono
                size={11}
                weight={800}
                color={scoreDelta > 0 ? T.status.green : scoreDelta < 0 ? T.status.red : T.text.dim}
              >
                {scoreDelta > 0 ? "+" : ""}
                {scoreDelta} pts
              </Mono>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 8, color: T.text.dim, fontFamily: T.font.mono }}>CURRENT</div>
              <Mono size={13} weight={800} color={currentTier.color}>
                {currentUtil.toFixed(1)}%
              </Mono>
            </div>
            <div style={{ fontSize: 14, color: T.text.muted }}>→</div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 8, color: T.text.dim, fontFamily: T.font.mono }}>PROJECTED</div>
              <Mono size={13} weight={800} color={newTier.color}>
                {newUtil.toFixed(1)}%
              </Mono>
            </div>
          </div>
          {newTier.label !== currentTier.label && (
            <div
              style={{
                marginTop: 8,
                padding: "4px 8px",
                borderRadius: 6,
                textAlign: "center",
                background: `${T.status.green}10`,
                fontSize: 9,
                fontWeight: 700,
                color: T.status.green,
              }}
            >
              Tier upgrade: {currentTier.label} → {newTier.label}
            </div>
          )}
        </div>
      )}

      {/* Top cards by utilization */}
      {cardBreakdown.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.text.dim, fontFamily: T.font.mono, marginBottom: 6 }}>
            HIGHEST UTILIZATION CARDS
          </div>
          {cardBreakdown.map((c, i) => {
            const tier = utilizationTier(c.utilPct);
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 8px",
                  borderRadius: T.radius.sm,
                  background: i % 2 === 0 ? `${T.bg.elevated}60` : "transparent",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: T.text.secondary,
                    maxWidth: "45%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.name}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono }}>
                    {fmt(Math.round(c.balance))}/{fmt(Math.round(c.limit))}
                  </span>
                  <Mono size={10} weight={800} color={tier.color}>
                    {c.utilPct.toFixed(0)}%
                  </Mono>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 8, color: T.text.muted, lineHeight: 1.4, textAlign: "center" }}>
        Utilization impact estimate only. Actual FICO scores factor payment history, age, mix, and inquiries.
      </div>
    </Card>
  );
}
