  import { T } from "../constants.js";
  import { buildPromoLine,PRO_BANNER_BENEFITS } from "../planCatalog.js";
  import { haptic } from "../haptics.js";

/* ─── Animations ─────────────────────────────────────────────── */
const SHIMMER_CSS = `
@keyframes pro-shimmer {
  0%   { transform: translateX(-120%) skewX(-15deg); }
  100% { transform: translateX(220%)  skewX(-15deg); }
}
@keyframes pro-border-spin {
  0%   { background-position: 0%   50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0%   50%; }
}
@keyframes pro-glow-pulse {
  0%, 100% { opacity: 0.35; }
  50%       { opacity: 0.65; }
}
@keyframes pro-badge-pop {
  0%   { transform: scale(0.8); opacity: 0; }
  60%  { transform: scale(1.08); }
  100% { transform: scale(1);   opacity: 1; }
}
`;

export default function ProBanner({ onUpgrade, label, sublabel, compact = false }) {
  const handleClick = () => {
    haptic.medium();
    onUpgrade?.();
  };

  /* ── Compact pill mode (used in Settings list) ── */
  if (compact) {
    return (
      <>
        <style>{SHIMMER_CSS}</style>
        <button
          role="banner"
          aria-label="Upgrade to Pro"
          data-no-swipe="true"
          onClick={handleClick}
          style={{
            width: "100%",
            padding: "14px 18px",
            borderRadius: T.radius.xl,
            border: `1px solid ${T.accent.primary}50`,
            background: `linear-gradient(135deg, ${T.accent.primary}12, ${T.accent.primary}28)`,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "relative",
            overflow: "hidden",
            marginBottom: 12,
          }}
        >
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)`, animation: "pro-shimmer 3.5s infinite", pointerEvents: "none" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative", zIndex: 1 }}>
            <div style={{ fontSize: 20, lineHeight: 1 }}>⚡</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.text.primary }}>{label || "Upgrade to Pro"}</div>
              {sublabel && <div style={{ fontSize: 11, color: T.accent.primary, marginTop: 1, fontWeight: 600 }}>{sublabel}</div>}
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.accent.primary, fontFamily: T.font.mono, background: `${T.accent.primary}20`, padding: "4px 10px", borderRadius: 8, position: "relative", zIndex: 1 }}>PRO →</div>
        </button>
      </>
    );
  }

  /* ── Full premium card (dashboard & root settings) ── */
  return (
    <>
      <style>{SHIMMER_CSS}</style>

      {/* Animated gradient border wrapper */}
      <div
        style={{
          padding: 1.5,
          borderRadius: T.radius.xl,
          background: `linear-gradient(135deg, #7b5ea7, #5b8dee, #7b5ea7, #a855f7)`,
          backgroundSize: "300% 300%",
          animation: "pro-border-spin 5s ease infinite",
          marginBottom: 4,
          position: "relative",
        }}
      >
        {/* Ambient glow behind the card */}
        <div style={{
          position: "absolute",
          inset: -8,
          background: `radial-gradient(ellipse at 50% 60%, ${T.accent.primary}45, transparent 70%)`,
          filter: "blur(18px)",
          animation: "pro-glow-pulse 3s ease-in-out infinite",
          zIndex: 0,
          pointerEvents: "none",
          borderRadius: "inherit",
        }} />

        <button
          role="banner"
          aria-label="Upgrade to Catalyst Cash Pro"
          data-no-swipe="true"
          onClick={handleClick}
          style={{
            width: "100%",
            padding: "20px 20px 18px",
            borderRadius: "calc(" + T.radius.xl + " - 1px)",
            border: "none",
            background: `linear-gradient(160deg, #120f22, #1a1535, #120f22)`,
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            position: "relative",
            overflow: "hidden",
            textAlign: "left",
            zIndex: 1,
          }}
        >
          {/* Shimmer sweep */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)",
            animation: "pro-shimmer 3s ease-in-out infinite",
            pointerEvents: "none",
          }} />

          {/* PRO badge */}
          <div style={{
            position: "absolute", top: 14, right: 14,
            background: `linear-gradient(135deg, ${T.accent.primary}, #a855f7)`,
            color: "#fff",
            fontSize: 9,
            fontWeight: 900,
            letterSpacing: "0.12em",
            padding: "3px 8px",
            borderRadius: 20,
            fontFamily: T.font.mono,
            boxShadow: `0 2px 10px ${T.accent.primary}60`,
            animation: "pro-badge-pop 0.4s cubic-bezier(.34,1.56,.64,1) both",
          }}>✦ PRO</div>

          {/* Header row */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 42, height: 42,
              borderRadius: 12,
              background: `linear-gradient(135deg, ${T.accent.primary}30, #a855f730)`,
              border: `1px solid ${T.accent.primary}40`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, flexShrink: 0,
            }}>⚡</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#fff", letterSpacing: "-0.02em" }}>
                {label || "Unlock Catalyst Cash Pro"}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2, fontWeight: 500 }}>
                {sublabel || buildPromoLine(["audits", "chats", "history"])}
              </div>
            </div>
          </div>

          {/* Benefit pills */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {PRO_BANNER_BENEFITS.map(b => (
              <div
                key={b.text}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "5px 10px",
                  borderRadius: 20,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.80)",
                }}
              >
                <span style={{ fontSize: 12 }}>{b.emoji}</span>
                {b.text}
              </div>
            ))}
          </div>

          {/* CTA button */}
          <div style={{
            width: "100%",
            padding: "13px 0",
            borderRadius: T.radius.lg,
            background: `linear-gradient(135deg, ${T.accent.primary}, #a855f7)`,
            boxShadow: `0 6px 24px ${T.accent.primary}55`,
            color: "#fff",
            fontSize: 14,
            fontWeight: 900,
            textAlign: "center",
            letterSpacing: "0.01em",
            position: "relative",
            overflow: "hidden",
          }}>
            {/* Inner shimmer on CTA */}
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)",
              animation: "pro-shimmer 2.5s ease-in-out 0.8s infinite",
              pointerEvents: "none",
            }} />
            Upgrade to Pro →
          </div>

          {/* Social proof */}
          <div style={{ textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: -6 }}>
            Trusted by thousands for smarter financial decisions
          </div>
        </button>
      </div>
    </>
  );
}
