import type { ChangeEvent, ComponentType } from "react";
import { useRef } from "react";
import { T } from "../constants.js";
import { useNavigation } from "../contexts/NavigationContext.js";
import { usePortfolio } from "../contexts/PortfolioContext.js";
import { useSettings } from "../contexts/SettingsContext.js";
import { deriveEmptyDashboardSetupState } from "./emptyDashboardModel.js";
import { haptic } from "../haptics.js";
import { Activity, Building2, CalendarClock, Settings, Zap } from "../icons";
import UiGlyph from "../UiGlyph.js";
import { Card, Label } from "../ui.js";

interface EmptyDashboardProps {
  investmentSnapshot?: unknown;
  onRestore?: (file?: File) => void;
  onDemoAudit: () => void;
}

interface ChecklistStep {
  id: string;
  title: string;
  desc: string;
  done: boolean;
  action: () => void;
  Icon: ComponentType<{ size?: number; color?: string }>;
}

export default function EmptyDashboard({ onRestore, onDemoAudit }: EmptyDashboardProps) {
  const { financialConfig } = useSettings();
  const { cards, bankAccounts, renewals } = usePortfolio();
  const { navTo, setSetupReturnTab } = useNavigation();
  const restoreInputRef = useRef<HTMLInputElement | null>(null);

  const onRunAudit = () => navTo("input");
  const onGoSettings = () => {
    setSetupReturnTab("dashboard");
    navTo("settings");
  };
  const onGoCards = () => {
    setSetupReturnTab("dashboard");
    navTo("portfolio");
  };
  const onGoRenewals = () => {
    setSetupReturnTab("dashboard");
    navTo("cashflow");
  };

  const {
    hasProfile,
    hasConnectedAccounts,
    hasRenewals,
    connectedAccountCount,
    connectedInputCount,
    completedSteps,
    progressPct,
  } = deriveEmptyDashboardSetupState({
    cards,
    bankAccounts,
    renewals,
    plaidInvestments: financialConfig?.plaidInvestments,
    financialConfig,
  });

  // Onboarding Checklist
  const steps: ChecklistStep[] = [
    {
      id: "profile",
      title: "Configure Profile",
      desc: "Income basics, region, and weekly spending.",
      done: hasProfile,
      action: onGoSettings,
      Icon: Settings,
    },
    {
      id: "cards",
      title: "Connect Accounts",
      desc: "Securely link banks, cards, and investment accounts.",
      done: hasConnectedAccounts,
      action: onGoCards,
      Icon: Building2,
    },
    {
      id: "renewals",
      title: "Track Subscriptions",
      desc: "Add Netflix, Spotify, rent, etc.",
      done: hasRenewals,
      action: onGoRenewals,
      Icon: CalendarClock,
    }
  ];

  const isSmallPhone = typeof window !== "undefined" ? window.innerWidth <= 390 : false;
  const nextRecommendedStep = steps.find((step) => !step.done) || null;
  const setupComplete = completedSteps === steps.length;
  const heroLabel = setupComplete ? "Ready to refresh your audit" : "Ready for your first audit";
  const heroTitle = setupComplete
    ? "Your dashboard has context. Refresh the audit."
    : "Run one audit and unlock the dashboard.";
  const heroBody = setupComplete
    ? "You already connected the inputs that matter. Refresh your audit to generate a health score, next action, and cash guidance from your real setup."
    : "Start with one audit. You can add bank sync, subscriptions, and extra detail afterward without losing momentum.";
  const primaryCtaLabel = setupComplete ? "Refresh audit" : "Begin first audit";

  return (
    <main aria-label="Empty dashboard" style={{ width: "100%" }}>
      <Card
        animate
        delay={200}
        onClick={() => {
          haptic.medium();
          onRunAudit();
        }}
        className="hover-card"
        style={{
          padding: isSmallPhone ? 18 : 22,
          marginBottom: 14,
          cursor: "pointer",
          border: `1px solid ${T.border.subtle}`,
          background: T.bg.card,
          boxShadow: T.shadow.card,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 14,
            marginBottom: 16,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 12px",
                borderRadius: 999,
                background: T.bg.elevated,
                border: `1px solid ${T.border.subtle}`,
                color: T.accent.emerald,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              {heroLabel}
            </div>
            <h1 style={{ fontSize: "clamp(22px, 6.6vw, 26px)", fontWeight: 900, marginBottom: 8, fontFamily: T.font.sans, color: T.text.primary, letterSpacing: "-0.03em", lineHeight: 1.02 }}>
              {heroTitle}
            </h1>
            <p style={{ fontSize: 13, color: T.text.secondary, margin: 0, lineHeight: 1.55, maxWidth: 420 }}>
              {heroBody}
            </p>
          </div>
          <div style={{
            width: 52, height: 52, borderRadius: 18,
            background: T.bg.elevated,
            border: `1px solid ${T.border.default}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            marginTop: 4,
          }}>
            <Zap size={22} color={T.accent.emerald} strokeWidth={2.4} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: setupComplete ? "repeat(3, minmax(0, 1fr))" : "repeat(2, minmax(0, 1fr))", gap: 8, marginBottom: 16 }}>
          <div style={{ padding: "12px 12px", borderRadius: T.radius.md, background: `${T.bg.base}70`, border: `1px solid ${T.border.subtle}` }}>
            <div style={{ fontSize: 10, color: T.text.dim, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Time</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text.primary }}>~2 min</div>
          </div>
          <div style={{ padding: "12px 12px", borderRadius: T.radius.md, background: `${T.bg.base}70`, border: `1px solid ${T.border.subtle}` }}>
            <div style={{ fontSize: 10, color: T.text.dim, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Setup</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text.primary }}>{completedSteps}/{steps.length}</div>
          </div>
          {setupComplete && (
            <div style={{ padding: "12px 12px", borderRadius: T.radius.md, background: `${T.bg.base}70`, border: `1px solid ${T.border.subtle}` }}>
              <div style={{ fontSize: 10, color: T.text.dim, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Inputs</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: T.text.primary }}>{connectedInputCount}</div>
            </div>
          )}
        </div>

        {nextRecommendedStep && !setupComplete && (
          <div
            style={{
              marginBottom: 14,
              padding: "10px 12px",
              borderRadius: T.radius.md,
              background: `${T.bg.base}70`,
              border: `1px solid ${T.border.subtle}`,
              textAlign: "left",
            }}
          >
            <div style={{ fontSize: 10, color: T.text.dim, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
              Recommended next setup
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary }}>{nextRecommendedStep.title}</div>
            <div style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.45, marginTop: 3 }}>{nextRecommendedStep.desc}</div>
          </div>
        )}

        <button
          aria-label={primaryCtaLabel}
          style={{
            width: "100%",
            minHeight: 48,
            padding: "14px",
            borderRadius: T.radius.lg,
            border: `1px solid ${T.accent.emerald}30`,
            background: `${T.accent.emerald}12`,
            color: T.accent.emerald,
            fontSize: 14,
            fontWeight: 800,
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8
          }}
        >
          {primaryCtaLabel} <Activity size={16} />
        </button>
      </Card>

      <Card animate delay={250} style={{ marginBottom: 14, padding: isSmallPhone ? "14px" : "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
          <div>
            <Label style={{ margin: 0, textTransform: "none", fontSize: 14 }}>
              {setupComplete ? "Connected inputs" : "Suggested setup"}
            </Label>
            <div style={{ fontSize: 11, color: T.text.dim, marginTop: 2 }}>
              {setupComplete ? "You already added the core context that sharpens your weekly briefing." : "Finish the core context that improves your weekly briefing quality"}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono }}>
              {completedSteps}/{steps.length}
            </div>
            <div style={{ width: 72, height: 6, background: T.border.default, borderRadius: 3, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${progressPct}%`,
                  background: T.accent.emerald,
                  transition: "width 0.4s cubic-bezier(.16,1,.3,1)",
                }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {steps.map(step => (
            <button
              key={step.id}
              onClick={() => {
                haptic.light();
                step.action();
              }}
              className="wiz-tap"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                minHeight: 60,
                padding: "12px 14px",
                borderRadius: T.radius.md,
                background: step.done ? `${T.accent.emerald}0A` : T.bg.elevated,
                border: `1px solid ${step.done ? `${T.accent.emerald}20` : T.border.subtle}`,
                cursor: "pointer",
                transition: "all 0.2s",
                textAlign: "left",
              }}
              aria-label={`${step.title}. ${step.done ? "Completed" : "Open setup"}. ${step.desc}`}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: step.done ? T.accent.emerald : `${T.text.muted}15`,
                  color: step.done ? "#fff" : T.text.muted,
                  flexShrink: 0,
                }}
              >
                {step.done ? <UiGlyph glyph="✓" size={14} color="#fff" /> : <step.Icon size={16} color={T.text.muted} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: step.done ? T.accent.emerald : T.text.primary,
                  }}
                >
                  {step.title}
                </div>
                <div style={{ fontSize: 11, color: T.text.dim, lineHeight: 1.4 }}>{step.desc}</div>
              </div>
                {!step.done && <div style={{ fontSize: 14, color: T.accent.primary, minWidth: 12, textAlign: "right" }}>›</div>}
            </button>
          ))}
        </div>
      </Card>

      <Card animate delay={300} style={{ marginBottom: 14, padding: "16px", background: `linear-gradient(135deg, ${T.bg.elevated}, ${T.accent.primary}05)`, border: `1px solid ${T.accent.primary}20` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary }}>Just exploring?</div>
            <div style={{ fontSize: 11, color: T.text.dim, marginTop: 2 }}>Load example data first and look around.</div>
          </div>
          <button
            onClick={() => {
              haptic.light();
              onDemoAudit();
            }}
            className="hover-btn"
            style={{
              padding: "8px 16px",
              borderRadius: T.radius.md,
              border: `1px solid ${T.accent.primary}`,
              background: T.accent.primaryDim,
              color: T.accent.primary,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              Try Demo
              <UiGlyph glyph="✨" size={12} color={T.accent.primary} />
            </span>
          </button>
        </div>
      </Card>

      {(hasConnectedAccounts || hasRenewals) && (
        <Card animate delay={400} style={{ marginBottom: 14, padding: "14px 16px" }}>
          <Label>Connected data</Label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ padding: "12px", background: T.bg.elevated, borderRadius: T.radius.md, border: `1px solid ${T.border.subtle}` }}>
              <div style={{ fontSize: 10, color: T.text.dim, fontWeight: 700 }}>ACCOUNTS</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.text.primary }}>{connectedAccountCount}</div>
            </div>
            <div style={{ padding: "12px", background: T.bg.elevated, borderRadius: T.radius.md, border: `1px solid ${T.border.subtle}` }}>
              <div style={{ fontSize: 10, color: T.text.dim, fontWeight: 700 }}>RENEWALS</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.text.primary }}>{(renewals || []).length}</div>
            </div>
          </div>
        </Card>
      )}

      <div style={{ paddingTop: 10, textAlign: "center" }}>
        <input
          ref={restoreInputRef}
          type="file"
          accept="*/*"
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            onRestore?.(f);
          }}
          style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
        />
        {onRestore && (
          <button
            onClick={() => {
              haptic.light();
              restoreInputRef.current?.click();
            }}
            className="wiz-tap"
            style={{
              background: "none",
              border: "none",
              color: T.text.dim,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              minHeight: 44,
              padding: "10px 16px",
              textDecoration: "underline",
            }}
          >
            Restore from a local backup
          </button>
        )}
      </div>
    </main>
  );
}
