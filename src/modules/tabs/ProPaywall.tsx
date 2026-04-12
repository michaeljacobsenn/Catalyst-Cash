// ═══════════════════════════════════════════════════════════════
// PRO PAYWALL — Unified upgrade sheet for Catalyst Cash
// Shows feature comparison, pricing, and purchase entry points.
// Only visible when shouldShowGating() returns true.
// ═══════════════════════════════════════════════════════════════
  import type { TouchEvent } from "react";
  import { useCallback,useRef,useState } from "react";
  import { createPortal } from "react-dom";
  import { Mono } from "../components.js";
  import { T } from "../constants.js";
import { PAYWALL_FEATURES, PRICING_FACTS } from "../guides/guideData.js";
import { haptic } from "../haptics.js";
import { IAP_PRICING } from "../subscription.js";
import { log } from "../logger.js";
import { Card } from "../ui.js";

const loadRevenueCat = () => import("../revenuecat.js");

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
    icon: "📊",
  },
  {
    title: "Cleaner daily operations",
    detail: "More linked institutions, full ledger search, and less manual cleanup across cards, cash, and renewals.",
    icon: "🏦",
  },
  {
    title: "Faster answers when it matters",
    detail: "More AskAI capacity plus CFO and Boardroom reasoning when the choice is expensive, urgent, or unclear.",
    icon: "🧠",
  },
];

const SOCIAL_PROOF = [
  { quote: "I found $340/yr in subscriptions I forgot about. Pro paid for itself in the first week.", name: "Sarah K.", detail: "Pro member since 2025" },
  { quote: "The CFO model caught a promo APR cliff I would have missed. Saved me $1,200 in interest.", name: "Marcus T.", detail: "Pro member since 2025" },
  { quote: "Finally, an app that actually tells me what to do with my money each week instead of just showing charts.", name: "Jamie L.", detail: "Pro member since 2026" },
];

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
@keyframes ctaPulse { 0%, 100% { box-shadow: 0 4px 20px ${T.accent.primary}40; } 50% { box-shadow: 0 6px 28px ${T.accent.primary}60; } }
@keyframes planGlow { 0%, 100% { box-shadow: 0 0 0 0 ${T.accent.primary}00, 0 0 12px ${T.accent.primary}20; } 50% { box-shadow: 0 0 0 3px ${T.accent.primary}18, 0 0 18px ${T.accent.primary}30; } }
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
        <button
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
              background: `linear-gradient(135deg, ${T.accent.primary}22, #6C60FF22)`,
              border: `1px solid ${T.accent.primary}26`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              boxShadow: `0 16px 36px ${T.accent.primary}18`,
            }}
          >
            ⚡
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
          <h2 style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.03em", margin: "0 0 8px", color: T.text.primary }}>
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
            🛡️ Privacy-first · Apple billing · cancel anytime
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
                background: `linear-gradient(160deg, ${T.bg.elevated}, ${T.bg.card})`,
                border: `1px solid ${T.border.subtle}`,
                animation: `fadeInUp .28s ease-out ${index * 0.04}s both`,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
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
                    fontSize: 16,
                    flexShrink: 0,
                  }}
                >
                  {pillar.icon}
                </div>
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

        {/* ── Social Proof ── */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "12px 14px",
            background: `linear-gradient(160deg, ${T.bg.card}, ${T.accent.primary}08)`,
            border: `1px solid ${T.border.subtle}`,
            borderRadius: T.radius.md,
            marginBottom: 14,
            animation: "fadeInUp .32s ease-out",
          }}
        >
          <div style={{ fontSize: 20, flexShrink: 0, lineHeight: 1 }}>⭐</div>
          {(() => {
            const proof = SOCIAL_PROOF[Math.floor(Date.now() / 86400000) % SOCIAL_PROOF.length] ?? SOCIAL_PROOF[0];
            return (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11.5, color: T.text.primary, fontWeight: 600, lineHeight: 1.5, fontStyle: "italic" }}>
                  &ldquo;{proof.quote}&rdquo;
                </div>
                <div style={{ fontSize: 10, color: T.text.dim, marginTop: 4, fontWeight: 700, fontFamily: T.font.mono }}>
                  {proof.name} &middot; {proof.detail}
                </div>
              </div>
            );
          })()}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
          {(["monthly", "yearly", "lifetime"] as const).map(p => {
            const pricing = IAP_PRICING[p];
            const active = plan === p;
            const isYearly = p === "yearly";
            const isLifetime = p === "lifetime";
            return (
              <button
                key={p}
                onClick={() => {
                  setPlan(p);
                  haptic.light();
                }}
                style={{
                  padding: "18px 10px 14px",
                  borderRadius: T.radius.lg,
                  cursor: "pointer",
                  border: `2px solid ${active ? T.accent.primary : T.border.default}`,
                  background: active
                    ? `linear-gradient(160deg, ${T.accent.primary}12, ${T.accent.primary}06)`
                    : T.bg.elevated,
                  textAlign: "center",
                  position: "relative",
                  overflow: "visible",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                  animation: active ? "planGlow 2.5s ease-in-out infinite" : "none",
                  transition: "all 0.25s ease",
                }}
              >
                {/* Savings badge for yearly */}
                {isYearly && (
                  <div
                    style={{
                      position: "absolute",
                      top: -9,
                      left: "50%",
                      transform: "translateX(-50%)",
                      fontSize: 9,
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                      background: `linear-gradient(135deg, ${T.accent.primary}, ${T.status.green})`,
                      color: "#fff",
                      padding: "3px 10px",
                      borderRadius: 99,
                      fontFamily: T.font.mono,
                      boxShadow: `0 2px 8px ${T.accent.primary}40`,
                      zIndex: 2,
                    }}
                  >
                    Most popular · {pricing.savings}
                  </div>
                )}
                {/* Best value badge for lifetime */}
                {isLifetime && (
                  <div
                    style={{
                      position: "absolute",
                      top: -9,
                      left: "50%",
                      transform: "translateX(-50%)",
                      fontSize: 9,
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                      background: `linear-gradient(135deg, #E8A838, #D4873A)`,
                      color: "#fff",
                      padding: "3px 10px",
                      borderRadius: 99,
                      fontFamily: T.font.mono,
                      boxShadow: `0 2px 8px rgba(232, 168, 56, 0.4)`,
                      zIndex: 2,
                    }}
                  >
                    Best value · Own forever
                  </div>
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
                      boxShadow: `0 0 8px ${T.status.green}50`,
                    }}
                  >
                    <span style={{ fontSize: 10, color: "#fff", fontWeight: 800, lineHeight: 1 }}>✓</span>
                  </div>
                )}
                <Mono size={18} weight={800} color={active ? T.accent.primary : T.text.primary}>
                  {pricing.price}
                </Mono>
                <div style={{ fontSize: 10, color: T.text.dim, fontWeight: 500 }}>
                  {isLifetime ? "one-time" : `per ${pricing.period}`}
                </div>
                {pricing.perMonth && (
                  <div
                    style={{
                      fontSize: 10,
                      color: active ? T.accent.primary : T.text.secondary,
                      marginTop: 4,
                      fontWeight: 700,
                      fontFamily: T.font.mono,
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
                      background: `${T.status.green}10`,
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
            <span style={{ fontSize: 14, flexShrink: 0 }}>💡</span>
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
            <span style={{ fontSize: 14, flexShrink: 0 }}>👑</span>
            <span style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.45 }}>
              One purchase, lifetime access. Pays for itself in under 2.5 years — then it&apos;s free forever. Every future feature included.
            </span>
          </div>
        )}

        <Card
          style={{
            marginBottom: 16,
            padding: "16px 16px 14px",
            background: `linear-gradient(160deg, ${T.bg.card}, ${T.accent.primary}0C)`,
            border: `1px solid ${T.accent.primary}16`,
            boxShadow: `0 18px 36px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.04)`,
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

          <button
            onClick={handlePurchase}
            disabled={purchasing}
            className="hover-btn"
            style={{
              width: "100%",
              padding: "16px 20px",
              borderRadius: T.radius.lg,
              border: "none",
              background: `linear-gradient(135deg, ${T.accent.primary}, #6C60FF, ${T.accent.primary})`,
              backgroundSize: "200% 100%",
              color: "#fff",
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: "0.02em",
              cursor: purchasing ? "wait" : "pointer",
              opacity: purchasing ? 0.6 : 1,
              marginBottom: 10,
              boxShadow: `0 4px 24px ${T.accent.primary}45, 0 2px 8px rgba(0,0,0,0.2)`,
              animation: purchasing ? "none" : "ctaPulse 3s ease-in-out infinite",
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
            <button
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
                  <span style={{ fontSize: 13, flexShrink: 0 }}>{f.icon}</span> {f.label}
                </div>
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
          <button
            onClick={() => window.open("https://catalystcash.app/terms", "_blank")}
            style={{ background: "none", border: "none", color: T.text.muted, fontSize: 10, textDecoration: "underline", cursor: "pointer" }}
          >
            Terms of Service
          </button>
          <button
            onClick={() => window.open("https://catalystcash.app/privacy", "_blank")}
            style={{ background: "none", border: "none", color: T.text.muted, fontSize: 10, textDecoration: "underline", cursor: "pointer" }}
          >
            Privacy Policy
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
