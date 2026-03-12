import { ExternalLink } from "lucide-react";
import { T } from "../constants.js";
import { Card, Label } from "../ui.jsx";
import { Mono } from "../components.jsx";
import { haptic } from "../haptics.js";

const PRIVACY_URL = "https://catalystcash.app/privacy";
const Toggle = ({ value, onChange }) => (
  <button
    onClick={() => onChange(!value)}
    style={{
      width: 48,
      height: 28,
      minWidth: 48,
      minHeight: 28,
      borderRadius: 14,
      border: "none",
      padding: 0,
      margin: 0,
      WebkitAppearance: "none",
      appearance: "none",
      background: value ? T.accent.primary : T.text.muted,
      cursor: "pointer",
      position: "relative",
      flexShrink: 0,
      transition: "background .25s ease",
      boxShadow: value ? `0 0 10px ${T.accent.primaryDim}` : "none",
    }}
  >
    <div
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        background: "white",
        position: "absolute",
        top: 3,
        left: value ? 23 : 3,
        transition: "left .25s cubic-bezier(.16,1,.3,1)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
      }}
    />
  </button>
);

export default function AISection({
  activeMenu,
  aiModel,
  setAiModel,
  setAiProvider,
  useStreaming,
  setUseStreaming,
  currentProvider,
  selectedModel,
  proEnabled,
  setShowPaywall
}) {
  return (
    <Card
      style={{
        borderLeft: `3px solid ${T.accent.primary}40`,
        display: activeMenu === "ai" ? "block" : "none"
      }}
    >
      <Label>AI Provider</Label>

      {/* Backend info card */}
      <div
        style={{
          padding: "14px 16px",
          background: `${T.accent.emerald}10`,
          border: `1px solid ${T.accent.emerald}30`,
          borderRadius: T.radius.md,
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: T.accent.emerald }}>✨ Catalyst AI</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: T.accent.primary,
              fontFamily: T.font.mono,
              background: T.accent.primaryDim,
              padding: "2px 8px",
              borderRadius: 99,
            }}
          >
            ACTIVE
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: T.text.secondary, lineHeight: 1.5 }}>
          Your scrubbed prompt is routed through our secure backend proxy and is not stored as a raw financial
          payload on our servers.
        </p>
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, fontFamily: T.font.mono, color: T.text.dim }}>SSE Streaming</span>
          <span style={{ width: 3, height: 3, borderRadius: "50%", background: T.text.muted }} />
          <span style={{ fontSize: 10, fontFamily: T.font.mono, color: T.text.dim }}>Zero Config</span>
          <span style={{ width: 3, height: 3, borderRadius: "50%", background: T.text.muted }} />
          <span style={{ fontSize: 10, fontFamily: T.font.mono, color: T.text.dim }}>PII Scrubbed</span>
        </div>
      </div>

      {/* Model picker */}
      <span
        style={{
          fontSize: 11,
          color: T.text.dim,
          fontFamily: T.font.mono,
          fontWeight: 600,
          display: "block",
          marginBottom: 8,
        }}
      >
        AI MODEL
      </span>
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
        {currentProvider.models.map(m => {
          const active = aiModel === m.id;
          const isPro = m.tier === "pro";
          const locked = (isPro && !proEnabled) || m.disabled || m.comingSoon;
          return (
            <button
              key={m.id}
              onClick={() => {
                if (locked) {
                  haptic.medium();
                  setShowPaywall(true);
                } else {
                  haptic.light();
                  setAiModel(m.id);
                  setAiProvider("backend");
                }
              }}
              style={{
                padding: "10px 14px",
                borderRadius: T.radius.md,
                border: `1.5px solid ${active ? T.accent.primary : T.border.default}`,
                background: active ? T.accent.primaryDim : T.bg.elevated,
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                transition: "all .2s ease",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: active ? 700 : 600,
                      color: active ? T.accent.primary : T.text.primary,
                    }}
                  >
                    {m.name}
                  </span>
                  {m.comingSoon ? (
                    <span
                      style={{
                        fontSize: 8,
                        fontWeight: 800,
                        color: T.text.muted,
                        background: `${T.text.muted}15`,
                        border: `1px solid ${T.text.muted}30`,
                        padding: "1px 6px",
                        borderRadius: 99,
                        letterSpacing: "0.06em",
                      }}
                    >
                      SOON
                    </span>
                  ) : isPro ? (
                    <span
                      style={{
                        fontSize: 8,
                        fontWeight: 800,
                        color: "#FFD700",
                        background: "linear-gradient(135deg, #FFD70020, #FFA50020)",
                        border: "1px solid #FFD70030",
                        padding: "1px 6px",
                        borderRadius: 99,
                        letterSpacing: "0.06em",
                      }}
                    >
                      PRO
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: 8,
                        fontWeight: 800,
                        color: T.status.green,
                        background: `${T.status.green}15`,
                        border: `1px solid ${T.status.green}30`,
                        padding: "1px 6px",
                        borderRadius: 99,
                        letterSpacing: "0.06em",
                      }}
                    >
                      FREE
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 10, color: T.text.dim, marginTop: 2, display: "block" }}>
                  {m.comingSoon ? "Coming soon" : m.note}
                </span>
                {m.poweredBy && (
                  <span
                    style={{
                      fontSize: 9,
                      color: T.text.muted,
                      marginTop: 1,
                      display: "block",
                      fontFamily: T.font.mono,
                      opacity: 0.7,
                    }}
                  >
                    Powered by {m.poweredBy}
                  </span>
                )}
              </div>
              {active && (
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: T.accent.primary,
                    boxShadow: `0 0 8px ${T.accent.primary}80`,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
      
      <div style={{ paddingTop: 16 }}>
        <Label>Engine Options</Label>
        {[{ l: "Streaming", d: "See output live as it generates", v: useStreaming, fn: setUseStreaming }].map(
          ({ l, d, v, fn }) => (
            <div
              key={l}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 0",
                borderBottom: `1px solid ${T.border.subtle}`,
              }}
            >
              <div style={{ flex: 1, paddingRight: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{l}</span>
                <p style={{ fontSize: 10, color: T.text.muted, marginTop: 2 }}>{d}</p>
              </div>
              <Toggle value={v} onChange={fn} />
            </div>
          )
        )}
      </div>

      <div style={{ paddingTop: 16 }}>
        <Label>System Info</Label>
        {[
          ["Version", "v1"],
          ["Provider", currentProvider.name],
          ["Model", selectedModel.name],
          ["Tokens", "12,000"],
          ["Output", "JSON"],
          ["Stream", useStreaming ? "ON" : "OFF"],
        ].map(([label, value]) => (
          <div
            key={label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "6px 0",
              borderBottom: `1px solid ${T.border.subtle}`,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
            <Mono size={11} color={T.text.dim}>
              {value}
            </Mono>
          </div>
        ))}
        <div style={{ paddingTop: 12 }}>
          <button
            onClick={() => window.open(PRIVACY_URL, "_blank")}
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: T.radius.md,
              border: `1px solid ${T.border.default}`,
              background: T.bg.elevated,
              color: T.text.secondary,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Privacy Policy
          </button>
        </div>
      </div>
    </Card>
  );
}
