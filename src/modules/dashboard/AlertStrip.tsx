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
      }}
    >
      {alerts.map((a, i) => (
        <div
          key={i}
          className="alert-pill"
          style={{
            background: T.bg.glass,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: `1px solid ${T.border.subtle}`,
            boxShadow: `0 2px 6px ${a.color}08`,
            animationDelay: `${i * 0.08}s`,
            animation: a.pulse
              ? `slideInRight .4s ease-out ${i * 0.08}s both, alertPulse 2s ease-in-out infinite`
              : `slideInRight .4s ease-out ${i * 0.08}s both`,
            display: "flex",
            alignItems: "center",
            padding: "8px 12px",
            borderRadius: T.radius.lg,
            minWidth: "max-content",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 13, flexShrink: 0 }}>{a.icon}</span>
          <div>
            <div
              style={{ fontSize: 9, fontWeight: 700, color: T.text.secondary, fontFamily: T.font.mono, letterSpacing: "0.04em", textTransform: "uppercase" }}
            >
              {a.title}
            </div>
            <div style={{ fontSize: 10, color: T.text.primary, marginTop: 1, fontWeight: 500 }}>{a.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
