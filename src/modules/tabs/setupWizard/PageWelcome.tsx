import { useState } from "react";
import { T } from "../../constants.js";
import { Check } from "../../icons.js";
import { WizBtn } from "./primitives.js";

export function PageWelcome({ onNext, onStartFast }: { onNext: () => void; onStartFast: () => void }) {
  const [accepted, setAccepted] = useState(false);
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          position: "relative",
          width: 72,
          height: 72,
          margin: "0 auto 14px",
          borderRadius: 18,
          overflow: "visible",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: -4,
            borderRadius: 22,
            background: `conic-gradient(from 180deg, ${T.accent.primary}40, ${T.accent.emerald}40, ${T.accent.primary}40)`,
            filter: "blur(14px)",
            opacity: 0.65,
          }}
        />
        <img
          src="./icon-512.png"
          alt="Catalyst Cash"
          style={{
            width: 72,
            height: 72,
            borderRadius: 18,
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
          marginBottom: 12,
        }}
      >
        Built for weekly money clarity
      </div>

      <h2
        style={{
          fontSize: 26,
          fontWeight: 900,
          color: T.text.primary,
          margin: "0 0 8px",
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
          fontSize: 13,
          color: T.text.secondary,
          lineHeight: 1.55,
          maxWidth: 300,
          margin: "0 auto 16px",
        }}
      >
        We’ll get your first audit ready in a few short steps. Optional setup can wait until later.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 10,
          marginBottom: 16,
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
              borderRadius: T.radius.md,
              padding: "10px 12px",
              border: `1px solid ${T.border.subtle}`,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04)`,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                flexShrink: 0,
                background: `${T.accent.primary}14`,
                border: `1px solid ${T.accent.primary}24`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 900,
                fontFamily: T.font.mono,
              }}
            >
              {icon}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, lineHeight: 1.2 }}>{title}</div>
              <div style={{ fontSize: 10, color: T.text.dim, marginTop: 1, lineHeight: 1.3 }}>{sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginBottom: 16,
          textAlign: "left",
          padding: "13px 14px",
          background: `linear-gradient(160deg, ${T.accent.primary}05, ${T.accent.emerald}05)`,
          borderRadius: T.radius.md,
          border: `1px solid ${T.accent.primary}15`,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: T.text.secondary,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 8,
          }}
        >
          What stays private
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary }}>On-device by default</div>
          <div style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.5 }}>
            Core financial data stays local. Bank sync and backups stay optional.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 1 }}>
            {["On-device by default", "Optional bank sync", "Optional backup"].map(item => (
              <div
                key={item}
                style={{
                  padding: "6px 9px",
                  borderRadius: 999,
                  background: T.bg.elevated,
                  border: `1px solid ${T.border.subtle}`,
                  fontSize: 10,
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
          borderRadius: T.radius.md,
          padding: "12px 14px",
          marginBottom: 16,
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
              width: 20,
              height: 20,
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
            {accepted && <Check size={13} color="#fff" strokeWidth={3} />}
          </div>
          <p style={{ fontSize: 10, color: T.text.secondary, lineHeight: 1.55, margin: 0 }}>
            I understand that this app provides{" "}
            <strong style={{ color: T.text.primary }}>AI-generated educational content only</strong> and is{" "}
            <strong style={{ color: T.status.amber }}>
              not a substitute for professional financial, tax, legal, or investment advice
            </strong>
            . I will consult a licensed professional before making financial decisions.
          </p>
        </div>
      </div>

      <div style={{ fontSize: 10, color: T.text.dim, marginBottom: 10 }}>You can change any of this later in Settings.</div>

      <div style={{ display: "grid", gap: 10 }}>
        <WizBtn onClick={onStartFast} disabled={!accepted} style={{ width: "100%", fontSize: 15 }}>
          Quick Start →
        </WizBtn>
        <WizBtn onClick={onNext} disabled={!accepted} variant="ghost" style={{ width: "100%", fontSize: 14 }}>
          Full Setup →
        </WizBtn>
      </div>
    </div>
  );
}
