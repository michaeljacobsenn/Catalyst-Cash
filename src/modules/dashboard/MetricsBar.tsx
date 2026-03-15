  import { Mono } from "../components.js";
  import { T } from "../constants.js";
  import { InlineTooltip } from "../ui.js";

  import { getActiveCurrencyCode,getCurrency } from "../currency.js";

/**
 * Compact formatter: $1,234 → $1.2K, $12,345 → $12.3K, $123,456 → $123K
 * Values under $10K stay as full integers: $8,450
 */
function fmtCompact(v) {
  if (v == null) return "—";
  const code = getActiveCurrencyCode();
  const prefix = getCurrency(code).symbol;
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${prefix}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 100_000) return `${sign}${prefix}${Math.round(abs / 1000)}K`;
  if (abs >= 10_000) return `${sign}${prefix}${(abs / 1000).toFixed(1)}K`;
  if (abs >= 1_000) return `${sign}${prefix}${Math.round(abs).toLocaleString()}`;
  return `${sign}${prefix}${abs.toFixed(0)}`;
}

/**
 * MetricsBar — Horizontal scrollable pill strip inside the command header card.
 * Props: quickMetrics — array of { l, v, c, icon }
 */
export default function MetricsBar({ quickMetrics, privacyMode }) {
  if (!quickMetrics || quickMetrics.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        borderTop: `1px solid ${T.border.subtle}`,
        background: `${T.bg.base}60`,
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
      <style>{`.metrics-strip::-webkit-scrollbar { display: none; }`}</style>
      <div
        className="metrics-strip"
        style={{
          display: "flex",
          minWidth: "100%",
        }}
      >
        {quickMetrics.map(({ l, v, c }, i) => (
          <div
            key={l}
            style={{
              flex: "0 0 auto",
              minWidth: `${100 / Math.min(quickMetrics.length, 4)}%`,
              padding: "10px 6px",
              textAlign: "center",
              borderRight: i < quickMetrics.length - 1 ? `1px solid ${T.border.subtle}` : "none",
              animation: `fadeInUp .4s ease-out ${i * 0.06}s both`,
            }}
          >
            <div
              style={{
                fontSize: 8,
                fontWeight: 800,
                color: T.text.secondary,
                fontFamily: T.font.mono,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: 3,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {l === "Available" ? <InlineTooltip>{l}</InlineTooltip> : l}
            </div>
            <Mono size={12} weight={800} color={c} style={{ whiteSpace: "nowrap" }}>
              {privacyMode ? (
                <span style={{ letterSpacing: "2px" }}>$• • •</span>
              ) : (
                fmtCompact(v)
              )}
            </Mono>
          </div>
        ))}
      </div>
    </div>
  );
}
