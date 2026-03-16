  import type { ChangeEvent,ComponentType } from "react";
  import { useRef } from "react";
  import { T } from "../constants.js";
  import { useNavigation } from "../contexts/NavigationContext.js";
  import { usePortfolio } from "../contexts/PortfolioContext.js";
  import { useSettings } from "../contexts/SettingsContext.js";
  import { haptic } from "../haptics.js";
  import { Activity,Building2,CalendarClock,Settings,Zap } from "../icons";
  import { Card,Label } from "../ui.js";

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

/**
 * EmptyDashboard — Rendered when no audit exists. 
 * A guided onboarding experience to get users connecting banks and running their first audit.
 */
export default function EmptyDashboard({ onRestore, onDemoAudit }: EmptyDashboardProps) {
  const { financialConfig } = useSettings();
  const { cards, renewals } = usePortfolio();
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

  const hasCards = cards.length > 0;
  const hasRenewals = (renewals || []).length > 0;
  const hasProfile =
    Boolean(financialConfig?.paycheckStandard) ||
    Boolean(financialConfig?.averagePaycheck) ||
    Boolean(financialConfig?.hourlyRateNet) ||
    Boolean(financialConfig?.weeklySpendAllowance);

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
      desc: "Securely link your banks via Plaid.",
      done: hasCards,
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

  const completedSteps = steps.filter(s => s.done).length;
  const progressPct = (completedSteps / steps.length) * 100;
  const isSmallPhone = typeof window !== "undefined" ? window.innerWidth <= 390 : false;

  return (
    <main aria-label="Empty dashboard" style={{ width: "100%" }}>
      <section style={{ textAlign: "center", paddingTop: 16, paddingBottom: 12, animation: "fadeInUp .6s ease-out both" }}>
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
          Ready for your first audit
        </div>
        <img
          src="/icon-192.png"
          alt="Catalyst Cash"
          style={{
            width: 68,
            height: 68,
            borderRadius: 18,
            margin: "0 auto 14px",
            display: "block",
            filter: `drop-shadow(0 8px 16px ${T.accent.emerald}30) drop-shadow(0 2px 4px ${T.accent.primary}40)`,
          }}
        />
        <h1 style={{ fontSize: "clamp(23px, 7vw, 26px)", fontWeight: 900, marginBottom: 8, fontFamily: T.font.sans, color: T.text.primary, letterSpacing: "-0.03em", lineHeight: 1.05 }}>
          Your dashboard is ready.
          <br />
          Now give it context.
        </h1>
        <p style={{ fontSize: 13, color: T.text.secondary, width: "92%", margin: "0 auto", lineHeight: 1.55, maxWidth: 320, overflowWrap: "anywhere" }}>
          Start with one audit. You can add bank sync, subscriptions, and extra detail afterward without losing momentum.
        </p>
      </section>

      <Card
        animate
        delay={200}
        onClick={() => {
          haptic.medium();
          onRunAudit();
        }}
        className="hover-card"
        style={{
          padding: isSmallPhone ? 20 : 24,
          marginBottom: 14,
          textAlign: "center",
          cursor: "pointer",
          border: `1.5px solid ${T.accent.emerald}40`,
          background: `linear-gradient(145deg, ${T.bg.card}, ${T.accent.emerald}10)`,
          boxShadow: `0 8px 24px ${T.accent.emerald}25`,
          position: "relative",
          overflow: "hidden"
        }}
      >
        <div style={{ position: "absolute", top: -50, right: -50, width: 100, height: 100, background: T.accent.emerald, opacity: 0.1, filter: "blur(40px)", pointerEvents: "none" }} />

        <div style={{
          width: 54, height: 54, borderRadius: 27,
          background: `linear-gradient(135deg, ${T.accent.emerald}, #10B981)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 16px",
          boxShadow: `0 4px 16px ${T.accent.emerald}60`
        }}>
          <Zap size={24} color="#fff" strokeWidth={2.5} />
        </div>

        <h2 style={{ fontSize: 18, fontWeight: 800, color: T.text.primary, marginBottom: 8 }}>
          Run your first audit
        </h2>
        <p style={{ fontSize: 13, color: T.text.secondary, marginBottom: 20, lineHeight: 1.4 }}>
          It takes about 2 minutes. Enter this week’s numbers and get a clear health score, next move, and cash-flow guidance.
        </p>

        <button style={{
          width: "100%",
          padding: "14px",
          borderRadius: T.radius.lg,
          border: "none",
          background: T.accent.emerald,
          color: "#fff",
          fontSize: 14,
          fontWeight: 800,
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8
        }}>
          Begin audit <Activity size={16} />
        </button>
      </Card>

      <Card animate delay={250} style={{ marginBottom: 14, padding: isSmallPhone ? "14px" : "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
          <div>
            <Label style={{ margin: 0, textTransform: "none", fontSize: 14 }}>Suggested setup</Label>
            <div style={{ fontSize: 11, color: T.text.dim, marginTop: 2 }}>
              {completedSteps} of {steps.length} completed
            </div>
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
                minHeight: 56,
                padding: "12px 14px",
                borderRadius: T.radius.md,
                background: step.done ? `${T.accent.emerald}0A` : T.bg.elevated,
                border: `1px solid ${step.done ? `${T.accent.emerald}20` : T.border.subtle}`,
                cursor: "pointer",
                transition: "all 0.2s",
                textAlign: "left",
              }}
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
                {step.done ? "✓" : <step.Icon size={16} color={T.text.muted} />}
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
              {!step.done && <div style={{ fontSize: 14, color: T.accent.primary }}>›</div>}
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
            Try Demo ✨
          </button>
        </div>
      </Card>

      {(hasCards || hasRenewals) && (
        <Card animate delay={400} style={{ marginBottom: 14 }}>
          <Label>Connected data</Label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ padding: "12px", background: T.bg.elevated, borderRadius: T.radius.md, border: `1px solid ${T.border.subtle}` }}>
              <div style={{ fontSize: 10, color: T.text.dim, fontWeight: 700 }}>ACCOUNTS</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.text.primary }}>{cards.length}</div>
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
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              padding: "8px 16px",
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
