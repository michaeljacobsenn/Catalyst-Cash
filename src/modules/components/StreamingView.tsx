import type { ReactNode } from "react";

import { T } from "../constants.js";
import UiGlyph from "../UiGlyph.js";
import { Badge } from "../ui.js";

interface StreamingViewProps {
  streamText?: string;
  elapsed: number;
  isTest?: boolean;
  modelName?: string;
  onCancel?: () => void;
  title?: string;
  statusLabel?: string;
  helperText?: string;
  phase?: "bundling" | "connecting" | "analysis" | "moves" | "finalize" | "complete";
}

const PHASE_PROGRESS = {
  bundling: 12,
  connecting: 28,
  analysis: 56,
  moves: 82,
  finalize: 94,
  complete: 100,
} as const;

const STAGE_INDEX = {
  bundling: 0,
  connecting: 0,
  analysis: 1,
  moves: 2,
  finalize: 3,
  complete: 3,
} as const;

const STAGES = [
  { label: "Context", detail: "Bundling live balances and rules" },
  { label: "Analysis", detail: "Running the cash-flow and risk pass" },
  { label: "Moves", detail: "Building the briefing and actions" },
  { label: "Finalize", detail: "Packaging the finished briefing" },
];

export default function StreamingView({
  streamText,
  elapsed,
  isTest,
  modelName,
  onCancel,
  title,
  statusLabel,
  helperText,
  phase,
}: StreamingViewProps) {
  const inferredReceiving = Boolean(streamText && streamText.length > 5);
  const currentPhase =
    phase || (inferredReceiving ? "finalize" : elapsed > 40 ? "moves" : elapsed > 15 ? "analysis" : elapsed > 5 ? "connecting" : "bundling");
  const isReceiving = currentPhase === "finalize" || currentPhase === "complete";
  const progress = phase ? PHASE_PROGRESS[currentPhase] : isReceiving ? 100 : Math.min(inferProgress(elapsed), 95);
  const currentMsg = statusLabel || getPhaseMessage(currentPhase);
  const eta = getEta(currentPhase);
  const showCancel = Boolean(onCancel) && elapsed >= 5 && currentPhase !== "finalize" && currentPhase !== "complete";
  const showCancelProminent = Boolean(onCancel) && elapsed >= 20 && currentPhase !== "finalize" && currentPhase !== "complete";
  const stageIndex = STAGE_INDEX[currentPhase];

  return (
    <div
      style={{
        padding: "calc(var(--top-bar-h, 0px) + env(safe-area-inset-top, 0px) + 20px) 16px 32px",
        animation: "fadeIn .4s ease-out forwards",
        maxWidth: 400,
        margin: "0 auto",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: isReceiving ? 24 : 36, transition: "margin .4s ease" }}>
        <div
          style={{
            width: isReceiving ? 48 : 64,
            height: isReceiving ? 48 : 64,
            margin: "0 auto 20px",
            borderRadius: isReceiving ? 12 : 16,
            overflow: "hidden",
            boxShadow: `0 8px 16px ${T.accent.emerald}20`,
            transition: "all .4s cubic-bezier(.16,1,.3,1)",
            background: T.bg.card,
          }}
        >
          <img
            src="/icon-192.png"
            alt="Catalyst Cash Icon"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              animation: isReceiving ? "none" : "pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 }}>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              margin: 0,
              color: T.text.primary,
            }}
          >
            {title || "Running Audit"}
          </h2>
          {isTest && <Badge variant="amber" style={{ height: "fit-content" }}>TEST</Badge>}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            marginBottom: 24,
            opacity: 0.8,
          }}
        >
          <Mono>{elapsed}s elapsed</Mono>
          <span style={{ width: 4, height: 4, borderRadius: "50%", background: T.border.subtle, flexShrink: 0 }} />
          <Mono>{modelName || "AI Engine"}</Mono>
        </div>

        <div style={{ maxWidth: 360, margin: "0 auto", textAlign: "left" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.text.secondary }}>
              {currentMsg}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, fontFamily: T.font.mono }}>
              {Math.floor(progress)}%
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={Math.floor(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{
              height: 4,
              background: T.border.subtle,
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progress}%`,
                background: T.accent.primary,
                borderRadius: 2,
                transition: "width 0.8s cubic-bezier(.16,1,.3,1)",
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ fontSize: 11, color: T.text.dim, fontWeight: 500 }}>
              Est. {eta}
            </span>
            {(currentPhase === "finalize" || currentPhase === "complete") && (
              <span style={{ fontSize: 11, color: T.status.green, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: T.status.green, animation: "pulse 1.5s infinite" }} />
                Finalizing
              </span>
            )}
          </div>
        </div>

        {helperText && (
          <div
            style={{
              marginTop: 14,
              fontSize: 12,
              lineHeight: 1.5,
              color: T.text.secondary,
              maxWidth: 320,
              marginInline: "auto",
            }}
          >
            {helperText}
          </div>
        )}

        {showCancel && onCancel && (
          <div style={{ marginTop: 18 }}>
            <button
              onClick={onCancel}
              aria-label="Cancel audit"
              className={showCancelProminent ? "btn-secondary hover-lift" : "btn-secondary"}
              style={{
                borderColor: showCancelProminent ? T.status.amber : undefined,
                background: showCancelProminent ? `${T.status.amber}12` : undefined,
                color: showCancelProminent ? T.status.amber : undefined,
                transition: "all 0.4s ease",
              }}
            >
              {showCancelProminent ? "Taking too long? Cancel" : "Cancel"}
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gap: 12, alignItems: "stretch" }}>
        <div
          style={{
            borderRadius: 24,
            padding: "18px 18px 16px",
            background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.surface})`,
            border: `1px solid ${T.border.default}`,
            boxShadow: `0 18px 40px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.04)`,
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 999,
              background: `${T.accent.primary}12`,
              border: `1px solid ${T.accent.primary}24`,
              color: T.accent.primary,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.accent.primary, boxShadow: `0 0 0 4px ${T.accent.primary}18`, animation: "pulse 1.4s ease-in-out infinite" }} />
            Catalyst is building your briefing
          </div>

          <div
            style={{
              fontSize: 17,
              lineHeight: 1.35,
              fontWeight: 800,
              color: T.text.primary,
              letterSpacing: "-0.02em",
              marginBottom: 6,
            }}
          >
            {currentMsg}
          </div>

          <div
            style={{
              fontSize: 12.5,
              lineHeight: 1.6,
              color: T.text.secondary,
              maxWidth: 280,
              margin: "0 auto",
            }}
          >
            {helperText || "We’ll show the finished briefing once the structured audit is complete."}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          {STAGES.map((stage, index) => {
            const isActive = index === stageIndex && currentPhase !== "complete";
            const isDone = index < stageIndex || currentPhase === "complete" || (currentPhase === "finalize" && index === 3);
            const accent = isActive ? T.accent.primary : isDone ? T.status.green : T.text.dim;

            return (
              <div
                key={stage.label}
                style={{
                  borderRadius: 18,
                  padding: "12px 12px 11px",
                  background: isActive ? `${T.accent.primary}12` : `${T.bg.card}`,
                  border: `1px solid ${isActive ? `${T.accent.primary}2e` : T.border.subtle}`,
                  boxShadow: isActive ? `0 10px 26px ${T.accent.primary}18` : "none",
                  transition: "all .25s ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 5,
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: `${accent}18`,
                      color: accent,
                      fontSize: 10,
                      fontWeight: 900,
                      flexShrink: 0,
                    }}
                  >
                    {isDone ? <UiGlyph glyph="✓" size={10} color="#fff" /> : index + 1}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 800, color: isActive ? T.text.primary : T.text.secondary }}>
                    {stage.label}
                  </span>
                </div>
                <div style={{ fontSize: 11, lineHeight: 1.45, color: T.text.dim }}>
                  {stage.detail}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Mono({ children }: { children: ReactNode }) {
  return (
    <span style={{ fontSize: 12, color: T.text.dim, fontWeight: 600, fontFamily: T.font.mono }}>
      {children}
    </span>
  );
}

function inferProgress(elapsed: number) {
  if (elapsed <= 5) return (elapsed / 5) * 15;
  if (elapsed <= 15) return 15 + ((elapsed - 5) / 10) * 15;
  if (elapsed <= 40) return 30 + ((elapsed - 15) / 25) * 35;
  if (elapsed <= 75) return 65 + ((elapsed - 40) / 35) * 25;
  return 90 + Math.min((elapsed - 75) / 20, 1) * 5;
}

function getPhaseMessage(
  currentPhase: "bundling" | "connecting" | "analysis" | "moves" | "finalize" | "complete"
) {
  if (currentPhase === "complete") return "Audit complete.";
  if (currentPhase === "finalize") return "Packaging final briefing...";
  if (currentPhase === "moves") return "Generating tactical recommendations...";
  if (currentPhase === "analysis") return "Analyzing transactions & balances...";
  if (currentPhase === "connecting") return "Connecting to AI engine...";
  if (currentPhase === "bundling") return "Bundling financial profile...";
  return "Preparing audit...";
}

function getEta(currentPhase: "bundling" | "connecting" | "analysis" | "moves" | "finalize" | "complete") {
  if (currentPhase === "complete") return "Ready";
  if (currentPhase === "finalize") return "< 5s";
  if (currentPhase === "moves") return "~15-30s";
  if (currentPhase === "analysis") return "~45s";
  return "~1m 15s";
}
