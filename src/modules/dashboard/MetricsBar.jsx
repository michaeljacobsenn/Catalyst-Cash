import { T } from "../constants.js";
import { CountUp } from "../components.jsx";
import { InlineTooltip } from "../ui.jsx";

/**
 * MetricsBar — Horizontal split metrics display inside the command header card.
 * Props: quickMetrics — array of { l, v, c, icon }
 */
export default function MetricsBar({ quickMetrics }) {
    if (!quickMetrics || quickMetrics.length === 0) return null;

    return (
        <div style={{
            display: "flex", borderTop: `1px solid ${T.border.subtle} `,
            background: `${T.bg.base} 60`
        }}>
            {quickMetrics.map(({ l, v, c, icon }, i) => <div key={l} style={{
                flex: 1, padding: "16px 4px", textAlign: "center", minWidth: 0, overflow: "hidden",
                borderRight: i < quickMetrics.length - 1 ? `1px solid ${T.border.subtle}` : "none",
                animation: `fadeInUp .4s ease-out ${i * 0.06}s both`
            }}>
                <div style={{ fontSize: 8, fontWeight: 800, color: T.text.secondary, fontFamily: T.font.mono, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3, lineHeight: 1.2, overflowWrap: "anywhere" }}>
                    {l === "Available" ? <InlineTooltip>{l}</InlineTooltip> : l}
                </div>
                <div style={{ fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere", lineHeight: 1.2 }}>
                    <CountUp value={v ?? 0} size={11} weight={800} color={c} />
                </div>
            </div>)}
        </div>
    );
}
