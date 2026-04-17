import { T } from "../constants.js";
import { haptic } from "../haptics.js";
import UiGlyph from "../UiGlyph.js";

interface NotificationPrePromptProps {
  onAllow: () => void;
  onSkip: () => void;
}

/**
 * Pre-prompt modal shown before the iOS native notification permission dialog.
 * Explains why Catalyst Cash needs notifications to increase opt-in rates.
 */
export default function NotificationPrePrompt({ onAllow, onSkip }: NotificationPrePromptProps) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px) saturate(180%)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div style={{
        width: "100%", maxWidth: 480,
        background: T.bg.card,
        borderRadius: "28px 28px 0 0",
        padding: "32px 28px 48px",
        display: "flex", flexDirection: "column", gap: 20,
        boxShadow: "0 -20px 60px rgba(0,0,0,0.4)",
      }}>
        {/* Icon */}
        <div style={{
          width: 64, height: 64, borderRadius: 18,
          background: `linear-gradient(135deg, ${T.accent.primary}30, ${T.accent.primary}12)`,
          border: `1px solid ${T.accent.primary}40`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <UiGlyph glyph="🔔" size={28} color={T.accent.primary} />
        </div>

        {/* Headline */}
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: T.text.primary, letterSpacing: "-0.03em", marginBottom: 8, lineHeight: 1.2 }}>
            Stay on top of your money
          </div>
          <div style={{ fontSize: 14, color: T.text.secondary, lineHeight: 1.6 }}>
            Catalyst Cash uses notifications to remind you when your paycheck lands, so you can audit right away — before money drifts.
          </div>
        </div>

        {/* Benefits list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            ["💰", "Payday reminders — timed to your actual paycheck"],
            ["📍", "Smart alerts when you're near a preferred store"],
            ["🔔", "Budget overrun warnings before it's too late"],
          ].map(([icon, text]) => (
            <div key={text} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <UiGlyph glyph={icon} size={18} color={T.accent.primary} />
              <span style={{ fontSize: 13, fontWeight: 600, color: T.text.secondary, lineHeight: 1.5 }}>{text}</span>
            </div>
          ))}
        </div>

        {/* CTA buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
          <button
            onClick={() => { haptic.success(); onAllow(); }}
            style={{
              width: "100%", padding: "16px 0",
              borderRadius: 16, border: "none",
              background: `linear-gradient(135deg, ${T.accent.primary}, #6C60FF)`,
              color: "white", fontSize: 16, fontWeight: 800,
              cursor: "pointer", letterSpacing: "-0.01em",
            }}
          >
            Enable Notifications
          </button>
          <button
            onClick={() => { haptic.light(); onSkip(); }}
            style={{
              width: "100%", padding: "14px 0",
              borderRadius: 16, border: `1px solid ${T.border.default}`,
              background: "transparent", color: T.text.secondary,
              fontSize: 14, fontWeight: 700, cursor: "pointer",
            }}
          >
            Not Now
          </button>
        </div>
      </div>
    </div>
  );
}
