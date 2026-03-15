import { Target } from "../icons";
import { T } from "../constants.js";
import { fmt } from "../utils.js";
import { Card } from "../ui.js";
import { InlineTooltip } from "../ui.js";

/**
 * SinkingFundsRing — SVG ring progress charts for sinking fund goals.
 * Props: paceData — array of { name, saved, target }
 */
export default function SinkingFundsRing({ paceData }) {
  if (!paceData || paceData.length === 0) return null;

  return (
    <Card animate delay={350} style={{ background: T.bg.card, border: `1px solid ${T.border.subtle}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: T.accent.copperDim,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Target size={14} color={T.accent.copper} strokeWidth={2.5} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "-0.01em" }}>
          <InlineTooltip term="Sinking fund">Sinking Funds</InlineTooltip>
        </span>
      </div>
      <span id="sinking-funds-chart-hint" className="sr-only">
        Each circular chart represents one sinking fund progress from zero to one hundred percent of target.
      </span>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
        {paceData.map((d, i) => {
          const pct = d.target > 0 ? Math.min((d.saved / d.target) * 100, 100) : 0;
          const rc = pct >= 90 ? T.status.green : pct >= 50 ? T.status.amber : T.status.red;
          const r = 28,
            circ = 2 * Math.PI * r,
            arc = (pct / 100) * circ;
          return (
            <div
              key={i}
              role="img"
              aria-describedby="sinking-funds-chart-hint"
              aria-label={`${d.name} sinking fund progress ${Math.round(pct)} percent. Saved ${fmt(d.saved)} out of ${fmt(d.target)}.`}
              style={{
                textAlign: "center",
                flexShrink: 0,
                minWidth: 80,
                animation: `fadeInUp .4s ease-out ${i * 0.06}s both`,
              }}
            >
              <div style={{ position: "relative", width: 64, height: 64, margin: "0 auto 6px" }}>
                <svg width="64" height="64" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r={r} fill="none" stroke={`${T.border.default}`} strokeWidth="5" />
                  <circle
                    cx="32"
                    cy="32"
                    r={r}
                    fill="none"
                    stroke={rc}
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={`${arc} ${circ - arc}`}
                    transform="rotate(-90,32,32)"
                    style={{ transition: "stroke-dasharray 1s ease-out" }}
                  />
                </svg>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 800, color: rc, fontFamily: T.font.mono }}>
                    {Math.round(pct)}%
                  </span>
                </div>
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: T.text.primary,
                  marginBottom: 2,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  wordBreak: "break-word",
                  lineHeight: 1.2,
                }}
              >
                {d.name}
              </div>
              <div style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono }}>
                {fmt(d.saved)}/{fmt(d.target)}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
