  import type { Card as PortfolioCard } from "../../types/index.js";
  import { Mono } from "../components.js";
  import { T } from "../constants.js";
  import { Target } from "../icons";
  import UiGlyph from "../UiGlyph.js";
  import { Card } from "../ui.js";
  import { fmt } from "../utils.js";

interface DebtFreedomStats {
  freeDateStr?: string;
  weeklyPaydown?: number;
}

interface DebtFreedomCardProps {
  cards?: PortfolioCard[];
  freedomStats?: DebtFreedomStats | null;
}

export default function DebtFreedomCard({ cards = [], freedomStats }: DebtFreedomCardProps) {
  const totalDebt = cards.reduce((s, c) => s + (Number(c?.balance) || 0), 0);
  if (totalDebt < 100) return null; // No meaningful debt

  const { freeDateStr, weeklyPaydown = 0 } = freedomStats || {};
  const hasProjection = Boolean(freeDateStr) && weeklyPaydown > 0;

  // Estimate progress: (highest recorded debt - current) / highest recorded debt
  // We approximate highest as current + (weeklyPaydown * weeks passed)
  // For a simple UI we just show the countdown without needing history
  const weeksToFree = weeklyPaydown > 0 ? Math.ceil(totalDebt / weeklyPaydown) : null;
  const monthsToFree = weeksToFree ? Math.round(weeksToFree / 4.33) : null;
  const yearlyPaydown = weeklyPaydown ? weeklyPaydown * 52 : 0;
  const interestSaved = yearlyPaydown > 0 ? Math.round(yearlyPaydown * 0.22) : 0; // ~22% avg APR estimate

  // Motivational message
  const getMessage = () => {
    if (!hasProjection) return "Keep paying down debt consistently. Run audits weekly to unlock your countdown.";
    if ((monthsToFree ?? 0) <= 3) return "You're in the final stretch. Stay locked in.";
    if ((monthsToFree ?? 0) <= 6) return "Incredible momentum. Half a year away from freedom.";
    if ((monthsToFree ?? 0) <= 12) return "Under a year out. Every dollar counts.";
    return "The math is on your side. Stay consistent.";
  };

  return (
    <Card
      animate
      delay={175}
      style={{
        padding: "20px 18px",
        background: T.bg.card,
        border: `1px solid ${T.border.subtle}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: T.radius.sm,
            background: T.status.amberDim,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Target size={14} color={T.status.amber} />
        </div>
        <div>
          <Mono size={10} weight={800} color={T.text.dim} style={{ letterSpacing: "0.1em" }}>
            DEBT FREEDOM COUNTDOWN
          </Mono>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: T.text.dim,
              fontFamily: T.font.mono,
              marginBottom: 4,
              letterSpacing: "0.08em",
            }}
          >
            TOTAL DEBT
          </div>
          <Mono size={26} weight={800} color={T.text.primary}>
            {fmt(totalDebt)}
          </Mono>
        </div>
        {hasProjection && (
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: T.status.amber,
                fontFamily: T.font.mono,
                marginBottom: 4,
                letterSpacing: "0.08em",
              }}
            >
              DEBT-FREE BY
            </div>
            <Mono size={20} weight={800} color={T.status.amber}>
              {freeDateStr}
            </Mono>
          </div>
        )}
      </div>

      {hasProjection && weeksToFree && (
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              width: "100%",
              height: 6,
              borderRadius: 3,
              background: `${T.status.amber}15`,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                borderRadius: 3,
                background: `linear-gradient(90deg, ${T.status.amber}, #F59E0B)`,
                // Show at least 8% so the bar is visible, max 92% (never "done" while debt > 0)
                width: `${Math.min(92, Math.max(8, 100 - (weeksToFree / (weeksToFree + 12)) * 100))}%`,
                transition: "width 1.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
              }}
            />
          </div>
        </div>
      )}

      {hasProjection && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <div
            style={{
              padding: "6px 10px",
              borderRadius: T.radius.sm,
              background: T.bg.elevated,
              border: `1px solid ${T.border.subtle}`,
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <UiGlyph glyph="📉" size={11} color={T.text.secondary} />
            <Mono size={10} weight={700} color={T.text.secondary}>
              {fmt(weeklyPaydown)}/wk paydown
            </Mono>
          </div>
          {monthsToFree && (
            <div
              style={{
                padding: "6px 10px",
                borderRadius: T.radius.sm,
                background: T.bg.elevated,
                border: `1px solid ${T.border.subtle}`,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <UiGlyph glyph="⏳" size={11} color={T.text.secondary} />
              <Mono size={10} weight={700} color={T.text.secondary}>
                {monthsToFree} {monthsToFree === 1 ? "month" : "months"} to go
              </Mono>
            </div>
          )}
          {interestSaved > 100 && (
            <div
              style={{
                padding: "6px 10px",
                borderRadius: T.radius.sm,
                background: T.status.greenDim,
                border: `1px solid ${T.status.green}20`,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <UiGlyph glyph="💰" size={11} color={T.status.green} />
              <Mono size={10} weight={700} color={T.status.green}>
                ~{fmt(interestSaved)}/yr interest avoided
              </Mono>
            </div>
          )}
        </div>
      )}

      <p
        style={{
          fontSize: 11,
          color: T.text.dim,
          margin: 0,
          lineHeight: 1.5,
          fontStyle: "italic",
        }}
      >
        {getMessage()}
      </p>
    </Card>
  );
}
