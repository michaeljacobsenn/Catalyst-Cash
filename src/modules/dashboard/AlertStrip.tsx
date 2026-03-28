  import { T } from "../constants.js";

/**
 * AlertStrip — Horizontal scrolling alert pill strip for predictive insights.
 * Props: alerts — array of { icon, color, title, text, pulse? }
 */
export default function AlertStrip({ alerts }) {
  if (!alerts || alerts.length === 0) return null;

  return (
    <div
      className="alert-strip"
      data-swipe-nav-blocker="true"
      role="status"
      aria-live="polite"
      aria-label="Financial alerts"
      style={{
        display: "flex",
        gap: 8,
        overflowX: "auto",
        paddingBottom: 16,
        marginBottom: 8,
        WebkitOverflowScrolling: "touch",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
        touchAction: "pan-x",
        overscrollBehaviorX: "contain",
      }}
    >
      {alerts.map((a, i) => (
        <div
          key={i}
          className="alert-pill"
          style={{
            background: `linear-gradient(180deg, ${T.bg.glass}, ${T.bg.card})`,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: `1px solid ${T.border.subtle}`,
            boxShadow: `0 10px 22px rgba(0,0,0,0.10), 0 0 0 1px ${a.color}12`,
            animationDelay: `${i * 0.08}s`,
            animation: a.pulse
              ? `slideInRight .4s ease-out ${i * 0.08}s both, alertPulse 2s ease-in-out infinite`
              : `slideInRight .4s ease-out ${i * 0.08}s both`,
            display: "flex",
            alignItems: "center",
            padding: "9px 13px",
            borderRadius: 18,
            minWidth: "max-content",
            gap: 8,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background: `linear-gradient(90deg, ${a.color}00, ${a.color}, ${a.color}00)`,
              opacity: 0.7,
            }}
          />
          <span style={{ fontSize: 13, flexShrink: 0 }}>{a.icon}</span>
          <div>
            <div
              style={{ fontSize: 9, fontWeight: 800, color: a.color, fontFamily: T.font.mono, letterSpacing: "0.05em", textTransform: "uppercase" }}
            >
              {a.title}
            </div>
            <div style={{ fontSize: 10, color: T.text.primary, marginTop: 2, fontWeight: 550 }}>{a.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
