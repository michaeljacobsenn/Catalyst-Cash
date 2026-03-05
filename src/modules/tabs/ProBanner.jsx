import { T } from "../constants.js";
import { haptic } from "../haptics.js";

export default function ProBanner({ onUpgrade, label, sublabel }) {
    return <button data-no-swipe="true" className="hover-btn" onClick={() => { haptic.light(); onUpgrade?.(); }} style={{
        width: "100%", padding: "12px 16px", borderRadius: T.radius.lg,
        border: `1px solid ${T.accent.primaryDim}`,
        background: `linear-gradient(135deg, ${T.accent.primary}08, ${T.accent.primary}15)`,
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 12
    }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>⚡</span>
            <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.accent.primary }}>{label || "Upgrade to Pro"}</div>
                {sublabel && <div style={{ fontSize: 11, color: T.text.dim, marginTop: 1 }}>{sublabel}</div>}
            </div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.accent.primary, fontFamily: T.font.mono }}>→</div>
    </button>;
}
