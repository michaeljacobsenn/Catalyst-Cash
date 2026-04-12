import { useCallback, useEffect, useState } from "react";
import { Building2, ChevronRight, Cpu, Database, Info, Lock, Monitor, Share2, Target } from "../icons";
import { buildPromoLine } from "../planCatalog.js";
import { T } from "../constants.js";
import { ListRow, ListSection, NoticeBanner } from "../ui.js";
import ProBanner from "../tabs/ProBanner.js";
import { haptic } from "../haptics.js";

const loadReferral = () => import("../referral.js");

function ReferralCard() {
  const [code, setCode] = useState<string | null>(null);
  const [stats, setStats] = useState({ totalReferred: 0, pendingReferred: 0, bonusMonthsEarned: 0 });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    loadReferral().then(async (mod) => {
      if (!active) return;

      // Auto-redeem pending referral from deep link (if any)
      const pendingCode = await mod.getPendingReferral();
      if (pendingCode) {
        const result = await mod.redeemReferralCode(pendingCode);
        if (result.ok) {
          window.toast?.success?.(result.message || "Referral saved! Your bonus will activate when your friend subscribes.");
        } else if (result.error) {
          window.toast?.error?.(result.error);
        }
      }

      const stats = await mod.getReferralStats();
      setCode(stats.code);
      setStats({
        totalReferred: stats.totalReferred,
        pendingReferred: stats.pendingReferred || 0,
        bonusMonthsEarned: stats.bonusMonthsEarned,
      });
      // Sync from server in background for fresh counts
      mod.syncReferralStats().then((serverStats) => {
        if (!active || !serverStats) return;
        setStats({
          totalReferred: serverStats.totalReferred,
          pendingReferred: serverStats.pendingReferred || 0,
          bonusMonthsEarned: serverStats.bonusMonthsEarned,
        });
      }).catch(() => {});
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const handleShare = useCallback(async () => {
    haptic.medium();
    try {
      const mod = await loadReferral();
      await mod.shareReferralLink();
    } catch { /* share not supported on this platform */ }
  }, []);

  const handleCopy = useCallback(async () => {
    if (!code) return;
    haptic.light();
    try {
      await navigator.clipboard.writeText(`https://catalystcash.app/ref/${code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard not available */ }
  }, [code]);

  const hasActivity = stats.totalReferred > 0 || stats.pendingReferred > 0;

  return (
    <div>
      <span
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: T.text.secondary,
          marginLeft: 16,
          marginBottom: 8,
          display: "block",
          letterSpacing: "0.03em",
          textTransform: "uppercase",
        }}
      >
        Refer a Friend
      </span>
      <div
        style={{
          background: `linear-gradient(145deg, ${T.bg.card}, ${T.bg.surface})`,
          borderRadius: T.radius.xl,
          border: `1px solid ${T.border.subtle}`,
          padding: "16px 16px 14px",
          boxShadow: "0 6px 18px rgba(0,0,0,0.10)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${T.accent.primary}20, ${T.accent.emerald}20)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            🎁
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.text.primary }}>
              Give a month, get a month
            </div>
            <div style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.4, marginTop: 2 }}>
              Share your code — you both earn a free month of Pro
            </div>
          </div>
        </div>

        {/* Referral code display */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <button
            onClick={handleCopy}
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: T.radius.md,
              border: `1px dashed ${T.accent.primary}40`,
              background: `${T.accent.primary}08`,
              color: T.accent.primary,
              fontSize: 16,
              fontWeight: 800,
              fontFamily: T.font.mono,
              letterSpacing: "0.1em",
              textAlign: "center",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            {copied ? "Copied! ✓" : code || "···"}
          </button>
          <button
            onClick={handleShare}
            className="hover-btn"
            style={{
              width: 44,
              height: 44,
              borderRadius: T.radius.md,
              border: "none",
              background: `linear-gradient(135deg, ${T.accent.primary}, #6C60FF)`,
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 4px 12px ${T.accent.primary}40`,
              flexShrink: 0,
            }}
          >
            <Share2 size={18} />
          </button>
        </div>

        {/* Stats */}
        {hasActivity && (
          <div
            style={{
              display: "flex",
              gap: 12,
              padding: "8px 12px",
              background: `${T.status.green}0A`,
              borderRadius: T.radius.md,
              border: `1px solid ${T.status.green}15`,
            }}
          >
            <div style={{ textAlign: "center", flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.status.green, fontFamily: T.font.mono }}>
                {stats.totalReferred}
              </div>
              <div style={{ fontSize: 9, color: T.text.muted, fontWeight: 700, textTransform: "uppercase" }}>
                Confirmed
              </div>
            </div>
            {stats.pendingReferred > 0 && (
              <>
                <div style={{ width: 1, background: `${T.status.green}15` }} />
                <div style={{ textAlign: "center", flex: 1 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: T.status.amber, fontFamily: T.font.mono }}>
                    {stats.pendingReferred}
                  </div>
                  <div style={{ fontSize: 9, color: T.text.muted, fontWeight: 700, textTransform: "uppercase" }}>
                    Pending
                  </div>
                </div>
              </>
            )}
            <div style={{ width: 1, background: `${T.status.green}15` }} />
            <div style={{ textAlign: "center", flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.status.green, fontFamily: T.font.mono }}>
                {stats.bonusMonthsEarned}
              </div>
              <div style={{ fontSize: 9, color: T.text.muted, fontWeight: 700, textTransform: "uppercase" }}>
                Bonus mo.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type SettingsMenu = "finance" | "profile" | "ai" | "backup" | "dev" | "security" | "plaid" | null;
type SetupStep = {
  label: string;
  done: boolean;
  nav?: "input" | "portfolio";
  menu?: Exclude<SettingsMenu, null>;
};

interface RootSettingsSectionProps {
  enablePlaid: boolean;
  proEnabled: boolean;
  shouldShowGating: boolean;
  activeMenu: SettingsMenu;
  onSelectMenu: (menu: Exclude<SettingsMenu, null>) => void;
  onGuide: () => void;
  onManageSubscription: () => void;
  onUpgrade: () => void;
  financialConfig: Record<string, any>;
  cards: Array<any>;
  renewals: Array<any>;
  navTo: (tab: "input" | "portfolio") => void;
  setupDismissed: boolean;
  setSetupDismissed: (value: boolean) => void;
  rawTierId: "free" | "pro";
}

interface DeveloperToolsSectionProps {
  visible: boolean;
  onLoadFullProfileQaSeed: () => Promise<void> | void;
  onOpenQaAudit: () => void;
}

export function RootSettingsSection({
  enablePlaid,
  proEnabled,
  shouldShowGating,
  onSelectMenu,
  onGuide,
  onManageSubscription,
  onUpgrade,
  financialConfig,
  cards,
  renewals,
  navTo,
  setupDismissed,
  setSetupDismissed,
}: RootSettingsSectionProps) {
  const rootGroups = [
    {
      heading: "Preferences",
      items: [
        { id: "finance", label: "Financial Profile", icon: Target, color: T.accent.emerald, desc: "Income, region, housing, demographics" },
        { id: "profile", label: "Appearance", icon: Monitor, color: T.accent.primary, desc: "Theme mode, light, dark, or auto" },
        { id: "ai", label: "Assistant Persona", icon: Cpu, color: T.status.blue, desc: "Model routing & behavior" },
      ],
    },
    {
      heading: "Data & Security",
      items: [
        ...(enablePlaid ? [{ id: "plaid", label: "Bank Connections", icon: Building2, color: T.status.purple || "#8a2be2", desc: "Manage synced accounts" }] : []),
        { id: "backup", label: "Backup & Sync", icon: Database, color: T.status.green, desc: "Backup data, restore, export history" },
        { id: "security", label: "App Security", icon: Lock, color: T.status.red, desc: "Passcodes, Face ID" },
        { id: "guide", label: "Help & Guide", icon: Info, color: T.text.secondary, desc: "Learn how Catalyst works" },
      ],
    },
  ] as const;

  const installTs = parseInt(localStorage.getItem("app-install-ts") || "0", 10);
  if (!installTs) localStorage.setItem("app-install-ts", String(Date.now()));
  const daysSinceInstall = installTs ? (Date.now() - installTs) / 86400000 : 0;
  const fc = financialConfig || {};
  const steps: SetupStep[] = [
    { label: "Connect your income", done: !!(fc.paycheckStandard || fc.hourlyRateNet || fc.averagePaycheck), nav: "input" },
    { label: "Set weekly spending limit", done: !!fc.weeklySpendAllowance, nav: "input" },
    { label: "Set a minimum cash floor", done: !!fc.emergencyFloor, nav: "input" },
    { label: "Track your credit cards", done: (cards || []).length > 0, nav: "portfolio" },
    { label: "Add recurring bills", done: (renewals || []).length > 0, nav: "portfolio" },
  ];
  const done = steps.filter((step) => step.done).length;
  const total = steps.length;
  const pct = Math.round((done / total) * 100);
  const showSetupProgress = pct !== 100 && daysSinceInstall < 30 && !setupDismissed;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 28, marginTop: 8 }}>
      {rootGroups.map((group) => (
        <div key={group.heading}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: T.text.secondary,
              marginLeft: 16,
              marginBottom: 8,
              display: "block",
              letterSpacing: "0.03em",
              textTransform: "uppercase",
            }}
          >
            {group.heading}
          </span>
          <ListSection>
            {group.items.map((item, index) => (
              <ListRow
                key={item.id}
                onClick={() => {
                  if (item.id === "guide") {
                    onGuide();
                    return;
                  }
                  onSelectMenu(item.id as Exclude<SettingsMenu, null>);
                }}
                icon={
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      background: `${item.color}18`,
                      border: `1px solid ${item.color}20`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
                    }}
                  >
                    <item.icon size={17} color={item.color} />
                  </div>
                }
                title={item.label}
                description={item.desc}
                action={<ChevronRight className="chevron-icon" size={18} color={T.text.muted} />}
                isLast={index === group.items.length - 1}
              />
            ))}
          </ListSection>
        </div>
      ))}

      {shouldShowGating && (
        <div>
          <span
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: T.text.secondary,
              marginLeft: 16,
              marginBottom: 8,
              display: "block",
              letterSpacing: "0.03em",
              textTransform: "uppercase",
            }}
          >
            Subscription
          </span>
          {proEnabled ? (
            <button
              className="hover-btn settings-row"
              onClick={onManageSubscription}
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: T.radius.xl,
                border: `1px solid ${T.accent.primary}40`,
                background: `${T.accent.primary}10`,
                color: T.accent.primary,
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                boxShadow: `0 4px 12px ${T.accent.primary}10`,
              }}
            >
              <span>Manage Pro Subscription</span>
              <ChevronRight className="chevron-icon" size={18} color={T.accent.primary} />
            </button>
          ) : (
            <ProBanner onUpgrade={onUpgrade} label="Upgrade to Pro" sublabel={buildPromoLine(["audits", "models", "plaid"])} />
          )}
        </div>
      )}

      {/* ── Refer a Friend ── */}
      <ReferralCard />

      {showSetupProgress && (
        <div style={{ marginBottom: 4 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: T.text.secondary,
              marginLeft: 16,
              marginBottom: 8,
              display: "block",
              letterSpacing: "0.03em",
              textTransform: "uppercase",
            }}
          >
            Setup Progress
          </span>
          <div
            style={{
              background: `linear-gradient(145deg, ${T.bg.card}, ${T.bg.surface})`,
              borderRadius: T.radius.xl,
              border: `1px solid ${T.border.subtle}`,
              padding: "15px 16px",
              boxShadow: "0 6px 18px rgba(0,0,0,0.10)",
              backdropFilter: "blur(12px)",
              position: "relative",
            }}
          >
            <button
              onClick={() => {
                localStorage.setItem("setup-progress-dismissed", "1");
                setSetupDismissed(true);
              }}
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                width: 24,
                height: 24,
                borderRadius: "50%",
                border: `1px solid ${T.border.subtle}`,
                background: T.bg.surface,
                color: T.text.muted,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: pct === 100 ? `${T.status.green}1A` : `${T.accent.primary}1A`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: `1px solid ${pct === 100 ? T.status.green : T.accent.primary}40`,
                  }}
                >
                  <span style={{ fontSize: 14 }}>{pct === 100 ? "🚀" : "🎯"}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: pct === 100 ? T.status.green : T.text.primary }}>
                    {pct === 100 ? "You're all set!" : "Let's finish up"}
                  </span>
                  <span style={{ fontSize: 11, color: T.text.muted, fontWeight: 500 }}>
                    Complete the essentials first, then refine later
                  </span>
                </div>
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, color: pct === 100 ? T.status.green : T.accent.primary, fontFamily: T.font.mono }}>
                {pct}%
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: T.bg.elevated, marginBottom: 16, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  borderRadius: 3,
                  background: pct === 100 ? T.status.green : `linear-gradient(90deg, ${T.accent.primary}, ${T.accent.emerald})`,
                  width: `${pct}%`,
                  transition: "width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
                }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {steps.map((step, index) => (
                <div
                  key={index}
                  className="hover-lift"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "9px 12px",
                    background: step.done ? `${T.bg.surface}80` : T.bg.elevated,
                    borderRadius: T.radius.md,
                    border: `1px solid ${step.done ? T.border.subtle : T.border.default}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        background: step.done ? T.status.green : T.bg.surface,
                        border: `1px solid ${step.done ? T.status.green : T.border.subtle}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {step.done && <span style={{ color: "#fff", fontSize: 10, fontWeight: 800 }}>✓</span>}
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: step.done ? 500 : 700,
                        color: step.done ? T.text.dim : T.text.primary,
                        textDecoration: step.done ? "line-through" : "none",
                      }}
                    >
                      {step.label}
                    </span>
                  </div>
                  {!step.done && step.nav && (
                    <button
                      onClick={() => {
                        const nextTab = step.nav;
                        if (!nextTab) return;
                        navTo(nextTab);
                        if (step.menu) onSelectMenu(step.menu);
                      }}
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: T.accent.primary,
                        background: `${T.accent.primary}1A`,
                        border: "none",
                        cursor: "pointer",
                        padding: "6px 12px",
                        borderRadius: 999,
                      }}
                    >
                      Set up →
                    </button>
                  )}
                </div>
              ))}
            </div>
            {pct < 100 && (
              <NoticeBanner
                tone="info"
                compact
                style={{ marginTop: 12 }}
                title="Finish The Foundation"
                message="The app already looks polished, but the strongest UX comes from complete data. Income, spending floor, bills, and cards make the dashboard materially sharper."
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function DeveloperToolsSection({
  visible,
  onLoadFullProfileQaSeed,
  onOpenQaAudit,
}: DeveloperToolsSectionProps) {
  if (!visible) return null;
  return (
    <div
      style={{
        borderLeft: `3px solid ${T.text.dim}40`,
        background: T.bg.card,
        borderRadius: T.radius.xl,
        padding: 18,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 800, color: T.text.secondary, marginBottom: 12 }}>Internal QA</div>
      <p style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.6, marginBottom: 16 }}>
        These controls are only for internal testing. They seed a realistic profile, open the weekly audit flow with that seeded data, and preview local-notification alerts without needing to wait for real-world triggers.
      </p>
      <button
        onClick={() => void onLoadFullProfileQaSeed()}
        className="hover-btn"
        style={{
          width: "100%",
          padding: "14px",
          borderRadius: T.radius.md,
          border: `1px solid ${T.accent.primary}35`,
          background: `${T.accent.primary}12`,
          color: T.text.primary,
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          marginBottom: 12,
        }}
      >
        Load Full-Profile QA Seed
      </button>
      <button
        onClick={onOpenQaAudit}
        className="hover-btn"
        style={{
          width: "100%",
          padding: "14px",
          borderRadius: T.radius.md,
          border: `1px solid ${T.border.default}`,
          background: T.bg.elevated,
          color: T.text.primary,
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          marginBottom: 12,
        }}
      >
        Open Weekly Audit
      </button>
      {["Whole Foods", "Shell Gas"].map((store) => (
        <button
          key={store}
          onClick={() => {
            window.dispatchEvent(new CustomEvent("simulate-geo-fence", { detail: { store } }));
          }}
          className="hover-btn"
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: T.radius.md,
            border: `1px solid ${T.border.default}`,
            background: T.bg.elevated,
            color: T.text.primary,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            marginBottom: store === "Whole Foods" ? 12 : 0,
          }}
        >
          Preview Local Alert: {store}
        </button>
      ))}
    </div>
  );
}
