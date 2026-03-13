// ═══════════════════════════════════════════════════════════════
// PRO PAYWALL — Unified upgrade sheet for Catalyst Cash
// Shows feature comparison, pricing, and IAP placeholders.
// Only visible when shouldShowGating() returns true.
// ═══════════════════════════════════════════════════════════════
import { useState, useRef, useCallback } from "react";
import type { TouchEvent } from "react";
import { createPortal } from "react-dom";
import { T } from "../constants.js";
import { Card } from "../ui.js";
import { Mono } from "../components.js";
import { haptic } from "../haptics.js";
import { IAP_PRICING, IAP_PRODUCTS } from "../subscription.js";

const loadRevenueCat = () => import("../revenuecat.js");

interface ProPaywallProps {
  onClose: () => void;
}

interface LocalToastApi {
  success?: (message: string) => void;
  error?: (message: string) => void;
  info?: (message: string) => void;
}

// ── Feature comparison: generous Free vs premium Pro ──────────
const FEATURES = [
  { label: "AI Audits", free: "2 / week", pro: "31 / month (1/day)", icon: "📊" },
  { label: "AskAI Chat", free: "10 / day", pro: "50 / day", icon: "💬" },
  { label: "AI Models", free: "Catalyst AI", pro: "Pro · Reasoning", icon: "🧠" },
  { label: "Audit History", free: "Last 12", pro: "Full archive", icon: "📜" },
  { label: "Dashboard & Charts", free: "✓ Full", pro: "✓ Full", icon: "📈" },
  { label: "Debt & Tax Simulator", free: "✓ Full", pro: "✓ Full", icon: "⚠️" },
  { label: "Cash Flow Calendar", free: "✓ Full", pro: "✓ Full", icon: "📅" },
  { label: "AI Bill Negotiation", free: "—", pro: "Drafts Scripts (0 Fee)", icon: "🗣️" },
  { label: "Bank Sync (Plaid)", free: "2 Banks Live Sync", pro: "10 Banks Live Sync", icon: "🏦" },
  { label: "Auto Background Sync", free: "—", pro: "✓", icon: "🔁" },
  { label: "Transaction Ledger", free: "—", pro: "✓ Full", icon: "📒" },
  { label: "Categories & Rules", free: "✓", pro: "✓", icon: "🏷️" },
  { label: "Multi-Currency (28)", free: "✓", pro: "✓", icon: "🌍" },
  { label: "Share Score Card", free: "Branded", pro: "Clean", icon: "🎴" },
  { label: "CSV / PDF Export", free: "—", pro: "✓", icon: "📤" },
  { label: "Advanced Insights", free: "—", pro: "✓", icon: "🔔" },
  { label: "Market Refresh", free: "60 min", pro: "5 min", icon: "⚡" },
  { label: "Encrypted Backup, CCPA", free: "✓", pro: "✓", icon: "🛡️" },
];

// ── Coming soon features (creates anticipation) ──────────────
const COMING_SOON = [
  { label: "Net Worth Projections", icon: "🔮", desc: "See where you could be in 1, 5, 10 years" },
  { label: "Goal Tracking", icon: "🏁", desc: "Debt-free dates & savings milestones" },
  { label: "iOS Widgets", icon: "📱", desc: "Glanceable net worth on your home screen" },
];

export default function ProPaywall({ onClose }: ProPaywallProps) {
  const [plan, setPlan] = useState<"yearly" | "monthly">("yearly");
  const [purchasing, setPurchasing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [closing, setClosing] = useState(false);
  const touchStart = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const appWindow = window as Window & { toast?: LocalToastApi };

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 250);
  }, [onClose]);

  const onTouchStart = useCallback((e: TouchEvent<HTMLDivElement>) => {
    // Only track if at the top of scroll
    const el = sheetRef.current;
    if (el && el.scrollTop > 5) return;
    touchStart.current = e.touches[0].clientY;
  }, []);

  const onTouchMove = useCallback((e: TouchEvent<HTMLDivElement>) => {
    if (touchStart.current === null) return;
    const delta = e.touches[0].clientY - touchStart.current;
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
      const { presentPaywall } = await loadRevenueCat();
      const result = await presentPaywall();
      if (result === true) {
        // Success
        appWindow.toast?.success?.("Welcome to Catalyst Cash Pro!");
        onClose();
      } else if (result === null) {
        // Web fallback — IAP not available outside iOS
        appWindow.toast?.info?.("In-App Purchases are only available in the iOS app.");
      }
    } catch (e) {
      console.error("[IAP] Purchase failed:", e);
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
          <div style={{ fontSize: 36, marginBottom: 8 }}>⚡</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px", color: T.text.primary }}>Upgrade to Pro</h2>
          <p style={{ fontSize: 13, color: T.text.dim, margin: "0 0 10px", lineHeight: 1.4 }}>
            31 audits/month, premium AI models, and advanced financial tools.
          </p>
          {/* Social proof / positioning */}
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
            🛡️ Designed for financial clarity · Privacy-first
          </div>
        </div>

        {/* Feature Comparison */}
        <Card style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}>
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
            {FEATURES.map((f, i) => (
              <div key={i} style={{ display: "contents", animation: `fadeInUp .3s ease-out ${i * 0.04}s both` }}>
                <div
                  style={{
                    padding: "10px 14px",
                    borderBottom: i < FEATURES.length - 1 ? `1px solid ${T.border.subtle}` : "none",
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
                    borderBottom: i < FEATURES.length - 1 ? `1px solid ${T.border.subtle}` : "none",
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
                    borderBottom: i < FEATURES.length - 1 ? `1px solid ${T.border.subtle}` : "none",
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

        {/* ── Coming Soon — premium teaser cards ── */}
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: T.text.dim,
              fontFamily: T.font.mono,
              letterSpacing: "0.1em",
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>COMING SOON FOR PRO</span>
            <div
              style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${T.border.subtle}, transparent)` }}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {COMING_SOON.map((f, i) => (
              <div
                key={i}
                style={{
                  padding: "14px 10px",
                  borderRadius: T.radius.lg,
                  background: `linear-gradient(160deg, ${T.bg.elevated}, ${T.bg.card})`,
                  border: `1px solid ${T.border.subtle}`,
                  textAlign: "center",
                  minWidth: 0,
                  animation: `fadeInUp .35s ease-out ${(FEATURES.length + i) * 0.04}s both`,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    margin: "0 auto 8px",
                    background: `${T.accent.primary}10`,
                    border: `1px solid ${T.accent.primary}15`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                  }}
                >
                  {f.icon}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: T.text.primary,
                    marginBottom: 3,
                    lineHeight: 1.3,
                  }}
                >
                  {f.label}
                </div>
                <div style={{ fontSize: 9, color: T.text.dim, lineHeight: 1.35 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Plan Selector ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          {["monthly", "yearly"].map(p => {
            const pricing = IAP_PRICING[p];
            const active = plan === p;
            const isYearly = p === "yearly";
            return (
              <button
                key={p}
                onClick={() => {
                  setPlan(p);
                  haptic.light();
                }}
                style={{
                  padding: "20px 14px 16px",
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
                    {pricing.savings}
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
                <Mono size={20} weight={800} color={active ? T.accent.primary : T.text.primary}>
                  {pricing.price}
                </Mono>
                <div style={{ fontSize: 11, color: T.text.dim, fontWeight: 500 }}>per {pricing.period}</div>
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
              Annual plan saves {IAP_PRICING.yearly.savings} — that's {IAP_PRICING.yearly.perMonth}/mo for CFO-level
              financial intelligence.
            </span>
          </div>
        )}

        {/* ── Purchase CTA ── */}
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
            marginBottom: 12,
            boxShadow: `0 4px 24px ${T.accent.primary}45, 0 2px 8px rgba(0,0,0,0.2)`,
            animation: purchasing ? "none" : "ctaPulse 3s ease-in-out infinite",
            transition: "opacity 0.2s, transform 0.15s",
            fontFamily: T.font.mono,
          }}
        >
          {purchasing
            ? "Processing..."
            : plan === "yearly"
              ? `Start Free Trial — then ${IAP_PRICING.yearly.price}/yr`
              : `Subscribe — ${IAP_PRICING.monthly.price}/mo`}
        </button>

        {/* ── Restore + Legal ── */}
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
          <p
            style={{
              fontSize: 10,
              color: T.text.muted,
              margin: "6px 16px 0",
              lineHeight: 1.5,
              letterSpacing: "0.01em",
            }}
          >
            Payment charged to your Apple ID. Subscription auto-renews unless cancelled 24h before the end of the
            current period.
            {plan === "yearly" &&
              " Your 7-day free trial begins immediately. You won't be charged until the trial ends."}
          </p>
          <div style={{ marginTop: 10, display: "flex", justifyContent: "center", gap: 16 }}>
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
      </div>
    </div>,
    document.body
  );
}
