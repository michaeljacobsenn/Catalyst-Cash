import type { ComponentType } from "react";

import { T } from "../constants.js";
import { CheckCircle, ChevronRight } from "../icons";
import { haptic } from "../haptics.js";

export interface DashboardSetupStep {
  id: string;
  title: string;
  desc: string;
  done: boolean;
  action: () => void;
  Icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}

interface SetupChecklistCardProps {
  steps: DashboardSetupStep[];
  completedSteps: number;
  progressPct: number;
  isSmallPhone: boolean;
}

export default function SetupChecklistCard({
  steps,
  completedSteps,
  progressPct,
  isSmallPhone,
}: SetupChecklistCardProps) {
  if (completedSteps >= steps.length) return null;

  return (
    <div
      className="fade-in slide-up"
      style={{
        padding: isSmallPhone ? "18px 18px" : "20px 24px",
        borderRadius: 24,
        background: T.bg.card,
        border: `1px solid ${T.border.subtle}`,
        boxShadow: T.shadow.card,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <h3 style={{ fontSize: "clamp(17px, 4.8vw, 18px)", fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em", margin: "0 0 4px" }}>
            Welcome Checklist
          </h3>
          <p style={{ fontSize: 13, color: T.text.secondary, margin: 0 }}>
            Finish the basics so the audit starts from a cleaner record
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: T.accent.emerald, fontFamily: T.font.mono, letterSpacing: "0.02em", marginBottom: 6 }}>
            {Math.round(progressPct)}%
          </div>
          <div style={{ width: 64, height: 4, background: `${T.accent.emerald}20`, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progressPct}%`, background: T.accent.emerald, transition: "width 0.8s cubic-bezier(.16,1,.3,1)" }} />
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {steps.map((step) => (
          <div
            key={step.id}
            onClick={() => {
              haptic.selection();
              step.action();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "16px",
              borderRadius: 16,
              cursor: "pointer",
              background: step.done ? T.bg.card : T.bg.elevated,
              border: `1px solid ${step.done ? T.border.subtle : T.border.default}`,
              transition: "border-color 0.24s ease, background 0.24s ease, opacity 0.24s ease",
              opacity: step.done ? 0.72 : 1,
            }}
            onMouseEnter={(event) => {
              if (!step.done) {
                event.currentTarget.style.borderColor = T.border.focus;
              }
            }}
            onMouseLeave={(event) => {
              if (!step.done) {
                event.currentTarget.style.borderColor = T.border.default;
              }
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: step.done ? T.accent.emerald : `${T.text.muted}10`,
                color: step.done ? "#fff" : T.text.prominent,
                transition: "transform 0.3s, opacity 0.3s, background-color 0.3s, border-color 0.3s, color 0.3s, box-shadow 0.3s",
              }}
            >
              {step.done ? <CheckCircle size={18} strokeWidth={2.5} /> : <step.Icon size={18} strokeWidth={2} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: step.done ? T.text.secondary : T.text.primary, textDecoration: step.done ? "line-through" : "none" }}>
                {step.title}
              </div>
              <div style={{ fontSize: 12, color: T.text.dim, marginTop: 2 }}>{step.desc}</div>
            </div>
            {!step.done && <ChevronRight size={18} color={T.text.muted} />}
          </div>
        ))}
      </div>
    </div>
  );
}
