// ═══════════════════════════════════════════════════════════════
// PRO PAYWALL — Unified upgrade sheet for Catalyst Cash
// Shows feature comparison, pricing, and purchase entry points.
// Only visible when shouldShowGating() returns true.
// ═══════════════════════════════════════════════════════════════
  import type { TouchEvent } from "react";
  import { useCallback,useEffect,useRef,useState } from "react";
  import { createPortal } from "react-dom";
  import { T } from "../constants.js";
import {
  Activity,
  Calendar,
  Check,
  Cpu,
  CreditCard,
  Database,
  DollarSign,
  Download,
  Landmark,
  MessageCircle,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  TrendingUp,
  Wallet,
} from "../icons.js";
import { PAYWALL_FEATURES, PRICING_FACTS } from "../guides/guideData.js";
import { haptic } from "../haptics.js";
import { IAP_PRICING } from "../subscription.js";
import { log } from "../logger.js";
import { Card } from "../ui.js";

const loadRevenueCat = () => import("../revenuecat.js");
import { trackFunnel } from "../funnelAnalytics.js";

interface ProPaywallProps {
  onClose: () => void;
  source?: string;
}

interface LocalToastApi {
  success?: (message: string) => void;
  error?: (message: string) => void;
  info?: (message: string) => void;
}

const VALUE_PILLARS = [
  {
    title: "Deeper weekly decisions",
    detail: "More audits, stronger models, and the history needed to see whether your moves are actually working.",
    icon: Activity,
  },
  {
    title: "Cleaner daily operations",
    detail: "More linked institutions, full ledger search, and less manual cleanup across cards, cash, and renewals.",
    icon: Landmark,
  },
  {
    title: "Faster answers when it matters",
    detail: "More AskAI capacity plus CFO and Boardroom reasoning when the choice is expensive, urgent, or unclear.",
    icon: Cpu,
  },
];

const VALUE_FACTS = [
  "Private local-first planning record",
  "Apple billing with restore support",
  "Upgrade only if the extra depth changes your weekly workflow",
];

const PAYWALL_FEATURE_ICON_MAP = {
  "AI Audits": Activity,
  "AskAI Chat": MessageCircle,
  "AI Models": Cpu,
  "Audit History": Database,
  "Dashboard & Charts": TrendingUp,
  "Debt / Budget / FIRE": Sparkles,
  "Plaid Connections": Landmark,
  "Transaction Ledger": Search,
  "Rewards Ranking": CreditCard,
  "Renewals AI Assist": RefreshCw,
  "Cash Flow Heatmap": Calendar,
  "Exports & Sharing": Download,
  "Security & Backup": Shield,
} as const;

const PAYWALL_CONTEXT = {
  default: {
    eyebrow: "CATALYST CASH PRO",
    title: "Run the full Catalyst operating system",
    body:
      "Pro is the clean upgrade for heavier users: more audits, more AskAI, more linked institutions, and the archive needed to make better money decisions over time.",
    highlight: "Best for people who rely on Catalyst every week, not just occasionally.",
  },
  askai: {
    eyebrow: "ASKAI PRO",
    title: "Get deeper AI when the question is expensive",
    body:
      "Pro raises your AskAI capacity and unlocks CFO-level reasoning for harder tradeoffs across cash, debt, renewals, and timing.",
    highlight: "Best if AskAI is becoming part of your real money workflow.",
  },
  audit: {
    eyebrow: "WEEKLY BRIEFING PRO",
    title: "Run more briefings with a deeper model stack",
    body:
      "Pro is built for people who rerun the briefing around paydays, large moves, and changing obligations instead of waiting a full week.",
    highlight: "Best if you want your weekly system of record to stay current.",
  },
  history: {
    eyebrow: "ARCHIVE PRO",
    title: "Keep the full financial archive",
    body:
      "Pro keeps the complete briefing history so you can validate whether changes are actually improving cash safety, debt pressure, and trend direction.",
    highlight: "Best if you want proof that your decisions are working over time.",
  },
  ledger: {
    eyebrow: "LEDGER PRO",
    title: "Turn transactions into a real operating tool",
    body:
      "Pro unlocks the full ledger: search, filter, export, and cleanup so the details behind the briefing are actually usable.",
    highlight: "Best if raw transaction detail changes your decisions.",
  },
  renewals: {
    eyebrow: "RENEWALS PRO",
    title: "Clean up recurring spending faster",
    body:
      "Pro adds stronger renewals tooling, exports, and AI negotiation help so recurring waste is easier to spot and easier to act on.",
    highlight: "Best if subscriptions and repeat charges are a meaningful leak.",
  },
  budget: {
    eyebrow: "BUDGET PRO",
    title: "Run a smarter paycheck budget",
    body:
      "Pro layers AI-seeded budgeting, overspend detection, and better archive depth on top of the paycheck workflow.",
    highlight: "Best if you want your budget and briefing to reinforce each other.",
  },
  settings: {
    eyebrow: "PRO PLAN",
    title: "Upgrade only if the extra depth will matter",
    body:
      "Pro is for people who want broader Plaid coverage, deeper AI, and a cleaner long-term record of how their money system is changing.",
    highlight: "Best if Catalyst is already earning a place in your weekly routine.",
  },
  cardwizard: {
    eyebrow: "CARD WIZARD PRO",
    title: "Unlock the full card strategy layer",
    body:
      "Pro gives you the premium decision support for choosing, comparing, and justifying the right cards across spending and retention scenarios.",
    highlight: "Best if card strategy is part of your actual optimization loop.",
  },
} as const;

export default function ProPaywall({ onClose, source = "default" }: ProPaywallProps) {
  const [plan, setPlan] = useState<"yearly" | "monthly" | "lifetime">("yearly");
  const [purchasing, setPurchasing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [closing, setClosing] = useState(false);
  const touchStart = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const appWindow = window as Window & { toast?: LocalToastApi };
  const context = PAYWALL_CONTEXT[source as keyof typeof PAYWALL_CONTEXT] || PAYWALL_CONTEXT.default;

  useEffect(() => {
    void trackFunnel("paywall_viewed");
  }, []);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 250);
  }, [onClose]);

  const onTouchStart = useCallback((e: TouchEvent<HTMLDivElement>) => {
    // Only track if at the top of scroll
    const el = sheetRef.current;
    if (el && el.scrollTop > 5) return;
    const touch = e.touches[0];
    if (!touch) return;
    touchStart.current = touch.clientY;
  }, []);

  const onTouchMove = useCallback((e: TouchEvent<HTMLDivElement>) => {
    if (touchStart.current === null) return;
    const touch = e.touches[0];
    if (!touch) return;
    const delta = touch.clientY - touchStart.current;
    if (delta > 0) {
      setDragY(delta);
      e.preventDefault();
    } else {
      setDragY(0);
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (dragY > 120) {
      handleClose();
    } else {
      setDragY(0);
    }
    touchStart.current = null;
  }, [dragY, handleClose]);

  const handlePurchase = async () => {
    haptic.medium();
    setPurchasing(true);
    try {
      const { purchaseProPlan } = await loadRevenueCat();
      const result = await purchaseProPlan(plan);
      if (result === true) {
        appWindow.toast?.success?.("Welcome to Catalyst Cash Pro!");
        if (plan === "yearly") {
          void trackFunnel("trial_started");
        } else {
          void trackFunnel("converted");
        }
        void trackFunnel("pro_unlocked");
        onClose();
      } else if (result === null) {
        appWindow.toast?.info?.("In-App Purchases are only available in the iOS app.");
      }
    } catch (e) {
      void log.error("subscription", "Pro purchase failed", e);
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    haptic.light();
    const { restorePurchases } = await loadRevenueCat();
    const success = await restorePurchases();
    if (success === true) {
      appWindow.toast?.success?.("Purchases restored successfully. Welcome to Pro!");
      void trackFunnel("pro_unlocked");
      handleClose();
    } else if (success === null) {
      appWindow.toast?.info?.("In-App Purchases are only available in the iOS app.");
    } else {
      appWindow.toast?.error?.("No active Pro subscription found to restore.");
    }
  };

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        animation: closing ? "fadeOut 0.25s ease forwards" : "fadeIn 0.2s ease",
        overscrollBehavior: "none",
      }}
      onClick={handleClose}
    >
      <style>{`
@keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fadeOut { to { opacity: 0; } }
@keyframes slideDown { to { transform: translateY(100%); } }
        `}</style>
      <div
        ref={sheetRef}
        onClick={e => e.stopPropagation()}
        className="scroll-area"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          width: "100%",
          maxWidth: 440,
          maxHeight: "92vh",
          overflowY: "auto",
          pointerEvents: "auto",
          background: T.bg.base,
          borderRadius: "24px 24px 0 0",
          padding: "24px 20px calc(env(safe-area-inset-bottom, 24px) + 28px)",
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragY > 0 ? "none" : "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          animation: closing
            ? "slideDown 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards"
            : "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          opacity: dragY > 0 ? Math.max(0.5, 1 - dragY / 400) : 1,
        }}
      >
        {/* Handle */}
        <div
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: T.text.muted,
            margin: "0 auto 20px",
            opacity: 0.4,
          }}
        />

        {/* Close X button */}
        <button type="button"
          onClick={handleClose}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            width: 32,
            height: 32,
            borderRadius: 16,
            background: T.bg.elevated,
            border: `1px solid ${T.border.subtle}`,
            color: T.text.secondary,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2,
            fontSize: 18,
            lineHeight: 1,
            fontWeight: 300,
          }}
          aria-label="Close"
        >
          &times;
        </button>

        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div
            style={{
              width: 56,
              height: 56,
              margin: "0 auto 12px",
              borderRadius: 18,
              background: `${T.accent.primary}14`,
              border: `1px solid ${T.accent.primary}20`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Sparkles size={24} color={T.accent.primary} />
          </div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 900,
              color: T.accent.primary,
              letterSpacing: "0.12em",
              fontFamily: T.font.mono,
              marginBottom: 8,
            }}
          >
            {context.eyebrow}
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 850, letterSpacing: "-0.04em", margin: "0 0 8px", color: T.text.primary }}>
            {context.title}
          </h2>
          <p style={{ fontSize: 13, color: T.text.dim, margin: "0 0 12px", lineHeight: 1.55, maxWidth: 340, marginInline: "auto" }}>
            {context.body}
          </p>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 12px",
              borderRadius: 99,
              background: `${T.accent.primary}10`,
              border: `1px solid ${T.accent.primary}20`,
              fontSize: 11,
              fontWeight: 700,
              color: T.accent.primary,
              fontFamily: T.font.mono,
            }}
          >
            <Shield size={13} color={T.accent.primary} />
            Private by default · Apple billing · restore support
          </div>
          <div
            style={{
              marginTop: 10,
              fontSize: 11,
              color: T.text.secondary,
              lineHeight: 1.45,
              maxWidth: 330,
              marginInline: "auto",
            }}
          >
            {context.highlight}
          </div>
        </div>

        <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
          {VALUE_PILLARS.map((pillar, index) => (
            <Card
              key={pillar.title}
              style={{
                padding: "14px 14px 13px",
                background: T.bg.card,
                border: `1px solid ${T.border.subtle}`,
                animation: `fadeInUp .28s ease-out ${index * 0.04}s both`,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                {(() => {
                  const Icon = pillar.icon;
                  return (
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 12,
                    background: `${T.accent.primary}12`,
                    border: `1px solid ${T.accent.primary}18`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon size={16} color={T.accent.primary} />
                </div>
                  );
                })()}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: T.text.primary, marginBottom: 4 }}>
                    {pillar.title}
                  </div>
                  <div style={{ fontSize: 11.5, lineHeight: 1.5, color: T.text.secondary }}>
                    {pillar.detail}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gap: 8,
            padding: "12px 14px",
            background: T.bg.card,
            border: `1px solid ${T.border.subtle}`,
            borderRadius: T.radius.md,
            marginBottom: 14,
            animation: "fadeInUp .32s ease-out",
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: T.font.mono }}>
            What stays true
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {VALUE_FACTS.map((fact) => (
              <div key={fact} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: T.text.secondary, lineHeight: 1.45 }}>
                <div style={{ width: 5, height: 5, borderRadius: 999, background: T.accent.primary, flexShrink: 0 }} />
                <span>{fact}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 14, alignItems: "stretch" }}>
          {(["monthly", "yearly", "lifetime"] as const).map(p => {
            const pricing = IAP_PRICING[p];
            const active = plan === p;
            const isYearly = p === "yearly";
            const isLifetime = p === "lifetime";
            const planBadge = isYearly
              ? `Most popular · ${pricing.savings}`
              : isLifetime
                ? "Best value · Own forever"
                : null;
            return (
              <button type="button"
                key={p}
                onClick={() => {
                  setPlan(p);
                  haptic.light();
                }}
                style={{
                  padding: "12px 10px 14px",
                  borderRadius: T.radius.lg,
                  cursor: "pointer",
                  border: `2px solid ${active ? T.accent.primary : T.border.default}`,
                  background: active
                    ? `${T.accent.primary}10`
                    : T.bg.card,
                  textAlign: "center",
                  position: "relative",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  gap: 4,
                  minHeight: 128,
                  transition: "transform 0.25s ease, opacity 0.25s ease, background-color 0.25s ease, border-color 0.25s ease, color 0.25s ease, box-shadow 0.25s ease",
                }}
              >
                {planBadge ? (
                  <div
                    style={{
                      width: "100%",
                      minHeight: 28,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 8,
                      fontWeight: 800,
                      lineHeight: 1.15,
                      textAlign: "center",
                      padding: "4px 6px",
                      background: isLifetime ? `${T.status.amber}16` : `${T.accent.primary}14`,
                      color: isLifetime ? T.status.amber : T.accent.primary,
                      borderRadius: 10,
                      fontFamily: T.font.mono,
                      marginBottom: 8,
                    }}
                  >
                    {planBadge}
                  </div>
                ) : (
                  <div
                    style={{
                      height: 36,
                      width: "100%",
                      marginBottom: 8,
                    }}
                  />
                )}
                {/* Active indicator dot */}
                {active && (
                  <div
                    style={{
                      position: "absolute",
                      top: 10,
                      right: 10,
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: T.status.green,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Check size={10} color="#fff" />
                  </div>
                )}
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: active ? T.accent.primary : T.text.primary,
                    fontFamily: T.font.mono,
                    lineHeight: 1.05,
                    letterSpacing: "-0.03em",
                  }}
                >
                  {pricing.price}
                </div>
                <div style={{ fontSize: 9, color: T.text.dim, fontWeight: 600, lineHeight: 1.2 }}>
                  {isLifetime ? "one-time" : `per ${pricing.period}`}
                </div>
                {pricing.perMonth && (
                  <div
                    style={{
                      fontSize: 9,
                      color: active ? T.accent.primary : T.text.secondary,
                      marginTop: 4,
                      fontWeight: 700,
                      fontFamily: T.font.mono,
                      lineHeight: 1.15,
                    }}
                  >
                    ({pricing.perMonth}/mo)
                  </div>
                )}
                {pricing.trial && (
                  <div
                    style={{
                      fontSize: 9,
                      color: T.status.green,
                      marginTop: 4,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 99,
                      background: `${T.status.green}12`,
                    }}
                  >
                    {pricing.trial}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Value Note — yearly only */}
        {plan === "yearly" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              background: `${T.accent.emerald}08`,
              border: `1px solid ${T.accent.emerald}18`,
              borderRadius: T.radius.md,
              marginBottom: 14,
              animation: "fadeInUp .3s ease-out",
            }}
          >
            <DollarSign size={14} color={T.accent.emerald} />
            <span style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.45 }}>
              Annual plan includes {PRICING_FACTS.yearlySavings} and works out to {PRICING_FACTS.yearlyPerMonth} for professional-grade
              financial intelligence.
            </span>
          </div>
        )}

        {/* Value Note — lifetime only */}
        {plan === "lifetime" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              background: `rgba(232, 168, 56, 0.06)`,
              border: `1px solid rgba(232, 168, 56, 0.12)`,
              borderRadius: T.radius.md,
              marginBottom: 14,
              animation: "fadeInUp .3s ease-out",
            }}
          >
            <Shield size={14} color="#E8A838" />
            <span style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.45 }}>
              One purchase, lifetime access. Pays for itself in under 16 months — then it&apos;s free forever. Every future feature included. Capped at 50 users.
            </span>
          </div>
        )}

        <Card
          style={{
            marginBottom: 16,
            padding: "16px 16px 14px",
            background: T.bg.card,
            border: `1px solid ${T.border.subtle}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: T.text.dim, fontWeight: 700, fontFamily: T.font.mono, letterSpacing: "0.05em" }}>
                SELECTED PLAN
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.text.primary, marginTop: 2 }}>
                {plan === "yearly" ? `${IAP_PRICING.yearly.price}/yr` : plan === "lifetime" ? `${IAP_PRICING.lifetime.price}` : `${IAP_PRICING.monthly.price}/mo`}
              </div>
            </div>
            <div style={{ fontSize: 11, color: T.text.secondary, textAlign: "right", lineHeight: 1.45, maxWidth: 180 }}>
              {plan === "yearly"
                ? `${PRICING_FACTS.trial} • ${PRICING_FACTS.yearlySavings}`
                : plan === "lifetime"
                  ? "Pay once • Never pay again"
                  : "Lower upfront cost • cancel anytime"}
            </div>
          </div>

          <button type="button"
            onClick={handlePurchase}
            disabled={purchasing}
            className="hover-btn"
            style={{
              width: "100%",
              padding: "16px 20px",
              borderRadius: T.radius.lg,
              border: `1px solid ${T.accent.primary}24`,
              background: `${T.accent.primary}14`,
              color: T.accent.primary,
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: "0.02em",
              cursor: purchasing ? "wait" : "pointer",
              opacity: purchasing ? 0.6 : 1,
              marginBottom: 10,
              transition: "opacity 0.2s, transform 0.15s",
              fontFamily: T.font.mono,
            }}
          >
            {purchasing
              ? `Starting ${plan === "lifetime" ? "lifetime" : plan === "yearly" ? "yearly" : "monthly"} plan...`
              : plan === "yearly"
                ? `Start Free Trial — then ${IAP_PRICING.yearly.price}/yr`
                : plan === "lifetime"
                  ? `Unlock Lifetime Pro — ${IAP_PRICING.lifetime.price}`
                  : `Start Monthly — ${IAP_PRICING.monthly.price}/mo`}
          </button>

          <div style={{ textAlign: "center", paddingBottom: 4 }}>
            <button type="button"
              onClick={handleRestore}
              style={{
                background: "none",
                border: "none",
                color: T.accent.primary,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                padding: "10px 16px",
                borderRadius: T.radius.md,
                transition: "opacity 0.2s",
                minHeight: 44,
              }}
            >
              Restore Purchases
            </button>
          </div>
          <p
            style={{
              fontSize: 10,
              color: T.text.muted,
              margin: "8px 8px 0",
              lineHeight: 1.5,
              letterSpacing: "0.01em",
              textAlign: "center",
            }}
          >
            Payment is charged to your Apple ID.
            {plan === "lifetime"
              ? " This is a one-time, non-recurring purchase. You will never be charged again."
              : " Subscription auto-renews unless cancelled at least 24 hours before the end of the current period."}
            {plan === "yearly" &&
              " Your 7-day free trial begins immediately, and you will not be charged until the trial ends."}
          </p>
        </Card>

        {/* Feature Comparison */}
        <Card style={{ marginBottom: 12, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 0 }}>
            <div
              style={{
                padding: "12px 14px",
                borderBottom: `1px solid ${T.border.subtle}`,
                fontWeight: 800,
                fontSize: 11,
                color: T.text.dim,
                fontFamily: T.font.mono,
              }}
            >
              FEATURE
            </div>
            <div
              style={{
                padding: "12px 14px",
                borderBottom: `1px solid ${T.border.subtle}`,
                fontWeight: 800,
                fontSize: 11,
                color: T.text.dim,
                fontFamily: T.font.mono,
                textAlign: "center",
                minWidth: 45,
              }}
            >
              FREE
            </div>
            <div
              style={{
                padding: "12px 14px",
                borderBottom: `1px solid ${T.border.subtle}`,
                fontWeight: 800,
                fontSize: 11,
                color: T.accent.primary,
                fontFamily: T.font.mono,
                textAlign: "center",
                minWidth: 45,
              }}
            >
              PRO
            </div>
            {PAYWALL_FEATURES.map((f, i) => (
              <div key={i} style={{ display: "contents", animation: `fadeInUp .3s ease-out ${i * 0.04}s both` }}>
                {(() => {
                  const Icon = PAYWALL_FEATURE_ICON_MAP[f.label as keyof typeof PAYWALL_FEATURE_ICON_MAP] || Wallet;
                  return (
                <div
                  style={{
                    padding: "10px 14px",
                    borderBottom: i < PAYWALL_FEATURES.length - 1 ? `1px solid ${T.border.subtle}` : "none",
                    fontSize: 12,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Icon size={13} color={T.text.dim} />
                  {f.label}
                </div>
                  );
                })()}
                <div
                  style={{
                    padding: "10px 14px",
                    borderBottom: i < PAYWALL_FEATURES.length - 1 ? `1px solid ${T.border.subtle}` : "none",
                    fontSize: 11,
                    color: f.free === "—" ? T.text.muted : T.text.secondary,
                    textAlign: "center",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 600,
                  }}
                >
                  {f.free}
                </div>
                <div
                  style={{
                    padding: "10px 14px",
                    borderBottom: i < PAYWALL_FEATURES.length - 1 ? `1px solid ${T.border.subtle}` : "none",
                    fontSize: 11,
                    color: T.accent.primary,
                    fontWeight: 700,
                    textAlign: "center",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {f.pro}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div style={{ marginTop: 4, display: "flex", justifyContent: "center", gap: 16, paddingBottom: 6 }}>
          <a
            href="https://catalystcash.app/terms"
            target="_blank"
            rel="noreferrer"
            style={{ color: T.text.muted, fontSize: 10, textDecoration: "underline", cursor: "pointer" }}
          >
            Terms of Service
          </a>
          <a
            href="https://catalystcash.app/privacy"
            target="_blank"
            rel="noreferrer"
            style={{ color: T.text.muted, fontSize: 10, textDecoration: "underline", cursor: "pointer" }}
          >
            Privacy Policy
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
}
