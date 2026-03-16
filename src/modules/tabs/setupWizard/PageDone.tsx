import { T } from "../../constants.js";
import { WizBtn } from "./primitives.js";

export function PageDone({ onFinish }: { onFinish: () => void }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 68, marginBottom: 6 }}>🎉</div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: T.text.primary, marginBottom: 6, letterSpacing: "-0.5px" }}>
        You're All Set
      </h2>
      <p
        style={{
          fontSize: 14,
          color: T.text.secondary,
          lineHeight: 1.7,
          marginBottom: 24,
          maxWidth: 300,
          margin: "0 auto 24px",
        }}
      >
        Your profile is live. Here's what you can do next:
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28, textAlign: "left" }}>
        {[
          ["⚡", "Run your first audit", "This is the fastest way to generate useful guidance from your setup."],
          ["🏦", "Link banks later if you want", "Manual entry works fine. Live sync is just a convenience layer."],
          ["⚙️", "Refine anything in Settings", "Targets, security, retirement tracking, and themes stay editable."],
        ].map(([icon, title, sub]) => (
          <div
            key={title}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: `linear-gradient(135deg, ${T.bg.elevated}, ${T.bg.base})`,
              borderRadius: T.radius.lg,
              padding: "12px 14px",
              border: `1px solid ${T.border.subtle}`,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04)`,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                flexShrink: 0,
                background: `${T.accent.primary}10`,
                border: `1px solid ${T.accent.primary}20`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 17,
              }}
            >
              {icon}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, lineHeight: 1.2 }}>{title}</div>
              <div style={{ fontSize: 11, color: T.text.dim, marginTop: 1, lineHeight: 1.3 }}>{sub}</div>
            </div>
          </div>
        ))}
      </div>
      <WizBtn onClick={onFinish} style={{ width: "100%", fontSize: 16 }}>
        🚀 Go to Dashboard
      </WizBtn>
    </div>
  );
}
