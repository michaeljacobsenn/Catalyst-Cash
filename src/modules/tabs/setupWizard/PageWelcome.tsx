import { useState } from "react";
import { T } from "../../constants.js";
import { WizBtn } from "./primitives.js";

export function PageWelcome({ onNext }: { onNext: () => void }) {
  const [accepted, setAccepted] = useState(false);
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          position: "relative",
          width: 88,
          height: 88,
          margin: "0 auto 18px",
          borderRadius: 22,
          overflow: "visible",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: -6,
            borderRadius: 28,
            background: `conic-gradient(from 180deg, ${T.accent.primary}40, ${T.accent.emerald}40, ${T.accent.primary}40)`,
            filter: "blur(16px)",
            opacity: 0.7,
          }}
        />
        <img
          src="./icon-512.png"
          alt="Catalyst Cash"
          style={{
            width: 88,
            height: 88,
            borderRadius: 22,
            position: "relative",
            boxShadow: `0 8px 32px ${T.accent.primary}30`,
          }}
        />
      </div>

      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 12px",
          borderRadius: 999,
          background: `${T.accent.emerald}10`,
          border: `1px solid ${T.accent.emerald}20`,
          color: T.accent.emerald,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          marginBottom: 14,
        }}
      >
        Built for weekly money clarity
      </div>

      <h2
        style={{
          fontSize: 28,
          fontWeight: 900,
          color: T.text.primary,
          margin: "0 0 10px",
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
        }}
      >
        Get set up once.
        <br />
        Let the app think every week.
      </h2>

      <p
        style={{
          fontSize: 14,
          color: T.text.secondary,
          lineHeight: 1.65,
          marginBottom: 22,
          maxWidth: 312,
          margin: "0 auto 22px",
        }}
      >
        We’ll ask for just enough to model your paycheck timing, spending runway, and safety targets. You can skip
        the optional parts and fill them in later.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 10,
          marginBottom: 22,
          textAlign: "left",
        }}
      >
        {[
          ["1", "Tell us your basics", "Pay frequency, spending, and your safety floor."],
          ["2", "Choose your setup", "Optionally link banks, enable security, and pick preferences."],
          ["3", "Land on a clean home base", "Run your first audit when you’re ready."],
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
                width: 32,
                height: 32,
                borderRadius: 16,
                flexShrink: 0,
                background: `${T.accent.primary}14`,
                border: `1px solid ${T.accent.primary}24`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 900,
                fontFamily: T.font.mono,
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

      <div
        style={{
          marginBottom: 20,
          textAlign: "left",
          padding: "16px",
          background: `linear-gradient(160deg, ${T.accent.primary}06, ${T.accent.emerald}06)`,
          borderRadius: T.radius.lg,
          border: `1px solid ${T.accent.primary}15`,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: T.text.secondary,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 12,
          }}
        >
          What stays private
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary }}>Stored on your device by default</div>
          <div style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.55 }}>
            Core financial data stays local. AI requests go through the Catalyst proxy only when needed, and optional
            backups use your personal cloud account.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 2 }}>
            {["On-device by default", "Optional bank sync", "Optional backup"].map(item => (
              <div
                key={item}
                style={{
                  padding: "7px 10px",
                  borderRadius: 999,
                  background: T.bg.elevated,
                  border: `1px solid ${T.border.subtle}`,
                  fontSize: 11,
                  color: T.text.secondary,
                  fontWeight: 700,
                }}
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          background: T.bg.elevated,
          border: `1px solid ${T.border.default}`,
          borderRadius: T.radius.lg,
          padding: "14px 16px",
          marginBottom: 20,
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div
            onClick={() => setAccepted(!accepted)}
            role="checkbox"
            aria-checked={accepted}
            aria-label="Accept legal disclaimer"
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              flexShrink: 0,
              marginTop: 1,
              cursor: "pointer",
              background: accepted ? T.accent.primary : "transparent",
              border: `2px solid ${accepted ? T.accent.primary : T.border.default}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s ease",
            }}
          >
            {accepted && <span style={{ color: "#fff", fontSize: 13, fontWeight: 800, lineHeight: 1 }}>✓</span>}
          </div>
          <p style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.6, margin: 0 }}>
            I understand that this app provides{" "}
            <strong style={{ color: T.text.primary }}>AI-generated educational content only</strong> and is{" "}
            <strong style={{ color: T.status.amber }}>
              not a substitute for professional financial, tax, legal, or investment advice
            </strong>
            . I will consult a licensed professional before making financial decisions.
          </p>
        </div>
      </div>

      <div style={{ fontSize: 11, color: T.text.dim, marginBottom: 12 }}>You can change any of this later in Settings.</div>

      <WizBtn onClick={onNext} disabled={!accepted} style={{ width: "100%", fontSize: 15 }}>
        Start Setup →
      </WizBtn>
    </div>
  );
}
