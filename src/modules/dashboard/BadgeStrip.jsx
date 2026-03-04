import { T } from "../constants.js";
import { BADGE_DEFINITIONS, TIER_COLORS } from "../badges.js";
import { Card } from "../ui.jsx";

/**
 * BadgeStrip — Compact horizontal strip of achievement badges.
 * Props: badges — object of unlocked badge IDs
 */
export default function BadgeStrip({ badges }) {
    const unlockedIds = Object.keys(badges || {});
    const unlockedBadges = BADGE_DEFINITIONS.filter(b => unlockedIds.includes(b.id));
    const lockedCount = BADGE_DEFINITIONS.length - unlockedBadges.length;

    return (
        <Card animate delay={250}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14 }}>🏆</span>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>Achievements</span>
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, color: T.text.dim, fontFamily: T.font.mono }}>
                    {unlockedIds.length}/{BADGE_DEFINITIONS.length}
                </span>
            </div>
            <div style={{
                display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4,
                WebkitOverflowScrolling: "touch", scrollbarWidth: "none"
            }}>
                {unlockedBadges.length > 0 ? unlockedBadges.map((b, i) => {
                    const tc = TIER_COLORS[b.tier] || TIER_COLORS.bronze;
                    return <div key={b.id} title={`${b.name}: ${b.desc}`} style={{
                        padding: "8px 10px", borderRadius: T.radius.md, textAlign: "center",
                        background: tc.bg, border: `1px solid ${tc.border}`,
                        flexShrink: 0, minWidth: 64,
                        animation: `fadeInUp .3s ease-out ${i * 0.05}s both`
                    }}>
                        <div style={{ fontSize: 20, marginBottom: 2 }}>{b.emoji}</div>
                        <div style={{ fontSize: 8, fontWeight: 700, color: tc.text, fontFamily: T.font.mono, lineHeight: 1.2, whiteSpace: "normal", overflowWrap: "anywhere" }}>{b.name}</div>
                    </div>;
                }) : (
                    <div style={{ padding: "10px 14px", fontSize: 11, color: T.text.muted, textAlign: "center", width: "100%" }}>
                        Complete audits to unlock badges
                    </div>
                )}
                {lockedCount > 0 && unlockedBadges.length > 0 && <div style={{
                    padding: "8px 10px", borderRadius: T.radius.md, textAlign: "center",
                    background: `${T.bg.elevated}60`, border: `1px solid ${T.border.subtle}`,
                    flexShrink: 0, minWidth: 64, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center"
                }}>
                    <div style={{ fontSize: 16, marginBottom: 2, opacity: 0.4 }}>🔒</div>
                    <div style={{ fontSize: 8, fontWeight: 700, color: T.text.muted, fontFamily: T.font.mono }}>+{lockedCount}</div>
                </div>}
            </div>
        </Card>
    );
}
