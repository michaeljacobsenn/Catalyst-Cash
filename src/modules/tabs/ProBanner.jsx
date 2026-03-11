import { T } from "../constants.js";
import { haptic } from "../haptics.js";

const SHIMMER_CSS = `
@keyframes pro-shimmer {
  0% { transform: translateX(-100%) skewX(-15deg); }
  100% { transform: translateX(200%) skewX(-15deg); }
}
`;

export default function ProBanner({ onUpgrade, label, sublabel }) {
  return (
    <>
      <style>{SHIMMER_CSS}</style>
      <button
        role="banner"
        aria-label={label ? `Upgrade to Pro: ${label}` : "Upgrade to Pro"}
        data-no-swipe="true"
        className="hover-btn"
        onClick={() => {
          haptic.light();
          onUpgrade?.();
        }}
        style={{
          width: "100%",
          padding: "16px 18px",
          borderRadius: T.radius.xl,
          border: `1px solid ${T.accent.primary}40`,
          background: `linear-gradient(135deg, ${T.accent.primary}10, ${T.accent.primary}25)`,
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
          boxShadow: `0 4px 16px ${T.accent.primary}15`,
          position: "relative",
          overflow: "hidden"
        }}
      >
        {/* Shimmer overlay */}
        <div style={{
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)`,
          animation: "pro-shimmer 4s infinite",
          pointerEvents: "none",
        }} />
        
        <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative", zIndex: 1 }}>
          <div style={{ 
            fontSize: 22, 
            background: `linear-gradient(135deg, ${T.accent.primary}, ${T.accent.primaryHover})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.2))"
          }}>⚡</div>
        <div style={{ textAlign: "left", position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text.primary }}>{label || "Upgrade to Pro"}</div>
          {sublabel && <div style={{ fontSize: 12, color: T.accent.primary, marginTop: 2, fontWeight: 500, opacity: 0.9 }}>{sublabel}</div>}
        </div>
      </div>
      <div style={{ 
        fontSize: 14, 
        fontWeight: 800, 
        color: T.accent.primary, 
        fontFamily: T.font.mono,
        background: `${T.accent.primary}20`,
        padding: "4px 8px",
        borderRadius: 8,
        position: "relative",
        zIndex: 1
      }}>→</div>
    </button>
    </>
  );
}
