// ═══════════════════════════════════════════════════════════════
// PRO PAYWALL — Unified upgrade sheet for Catalyst Cash
// Shows feature comparison, pricing, and IAP placeholders.
// Only visible when shouldShowGating() returns true.
// ═══════════════════════════════════════════════════════════════
import { useState } from "react";
import { T } from "../constants.js";
import { Card } from "../ui.jsx";
import { Mono } from "../components.jsx";
import { haptic } from "../haptics.js";
import { IAP_PRICING, IAP_PRODUCTS } from "../subscription.js";
import { presentPaywall, restorePurchases } from "../revenuecat.js";

// ── Feature comparison: generous Free vs premium Pro ──────────
const FEATURES = [
    { label: "AI Audits", free: "2 / week", pro: "150 / month", icon: "📊" },
    { label: "AskAI Chat", free: "15 / day", pro: "100 / day", icon: "💬" },
    { label: "AI Quality", free: "Standard", pro: "Premium", icon: "🧠" },
    { label: "Audit History", free: "Last 8", pro: "Unlimited", icon: "📜" },
    { label: "Dashboard & Charts", free: "✓ Full", pro: "✓ Full", icon: "📈" },
    { label: "Debt Simulator", free: "✓ Full", pro: "✓ Full", icon: "🎯" },
    { label: "Cash Flow Calendar", free: "✓ Full", pro: "✓ Full", icon: "📅" },
    { label: "Share Score Card", free: "Branded", pro: "Clean", icon: "🎴" },
    { label: "CSV / PDF Export", free: "—", pro: "✓", icon: "📤" },
    { label: "Advanced Insights", free: "—", pro: "✓", icon: "🔔" },
    { label: "Market Refresh", free: "60 min", pro: "15 min", icon: "⚡" },
];

// ── Coming soon features (creates anticipation) ──────────────
const COMING_SOON = [
    { label: "Net Worth Projections", icon: "🔮", desc: "See where you could be in 1, 5, 10 years" },
    { label: "Goal Tracking", icon: "🏁", desc: "Debt-free dates & savings milestones" },
    { label: "iOS Widgets", icon: "📱", desc: "Glanceable net worth on your home screen" },
];

export default function ProPaywall({ onClose }) {
    const [plan, setPlan] = useState("yearly");
    const [purchasing, setPurchasing] = useState(false);

    const handlePurchase = async () => {
        haptic.medium();
        setPurchasing(true);
        try {
            const result = await presentPaywall();
            if (result === true) {
                // Success
                if (window.toast) window.toast.success("Welcome to Catalyst Cash Pro!");
                onClose();
            } else if (result === null) {
                // Web fallback — IAP not available outside iOS
                if (window.toast) window.toast.info("In-App Purchases are only available in the iOS app.");
            }
        } catch (e) {
            console.error("[IAP] Purchase failed:", e);
        } finally {
            setPurchasing(false);
        }
    };

    const handleRestore = async () => {
        haptic.light();
        const success = await restorePurchases();
        if (success === true) {
            if (window.toast) window.toast.success("Purchases restored successfully. Welcome to Pro!");
            onClose();
        } else if (success === null) {
            if (window.toast) window.toast.info("In-App Purchases are only available in the iOS app.");
        } else {
            if (window.toast) window.toast.error("No active Pro subscription found to restore.");
        }
    };

    return <div style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        animation: "fadeIn 0.2s ease"
    }} onClick={onClose}>
        <style>{`
@keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes ctaPulse { 0%, 100% { box-shadow: 0 4px 20px ${T.accent.primary}40; } 50% { box-shadow: 0 6px 28px ${T.accent.primary}60; } }
        `}</style>
        <div onClick={e => e.stopPropagation()} className="scroll-area" style={{
            width: "100%", maxWidth: 440, maxHeight: "88vh", overflowY: "auto",
            background: T.bg.base, borderRadius: "24px 24px 0 0",
            padding: "24px 20px env(safe-area-inset-bottom, 20px)",
            animation: "slideUp 0.3s ease"
        }}>
            {/* Handle */}
            <div style={{ width: 36, height: 4, borderRadius: 2, background: T.text.muted, margin: "0 auto 20px", opacity: 0.4 }} />

            {/* Hero */}
            <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>⚡</div>
                <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px", color: T.text.primary }}>Upgrade to Pro</h2>
                <p style={{ fontSize: 13, color: T.text.dim, margin: "0 0 10px", lineHeight: 1.4 }}>
                    150 audits/month, premium AI models, and advanced financial tools.
                </p>
                {/* Social proof / positioning */}
                <div style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "5px 12px", borderRadius: 99,
                    background: `${T.accent.primary}10`, border: `1px solid ${T.accent.primary}20`,
                    fontSize: 11, fontWeight: 700, color: T.accent.primary, fontFamily: T.font.mono
                }}>
                    🛡️ Designed for financial clarity · Privacy-first
                </div>
            </div>

            {/* Feature Comparison */}
            <Card style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 0 }}>
                    <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.border.subtle}`, fontWeight: 800, fontSize: 11, color: T.text.dim, fontFamily: T.font.mono }}>FEATURE</div>
                    <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.border.subtle}`, fontWeight: 800, fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, textAlign: "center" }}>FREE</div>
                    <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.border.subtle}`, fontWeight: 800, fontSize: 11, color: T.accent.primary, fontFamily: T.font.mono, textAlign: "center" }}>PRO</div>
                    {FEATURES.map((f, i) => <div key={i} style={{ display: "contents", animation: `fadeInUp .3s ease-out ${i * 0.04}s both` }}>
                        <div style={{ padding: "10px 14px", borderBottom: i < FEATURES.length - 1 ? `1px solid ${T.border.subtle}` : "none", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 13, flexShrink: 0 }}>{f.icon}</span> {f.label}
                        </div>
                        <div style={{
                            padding: "10px 14px", borderBottom: i < FEATURES.length - 1 ? `1px solid ${T.border.subtle}` : "none",
                            fontSize: 11, color: f.free === "—" ? T.text.muted : T.text.secondary, textAlign: "center",
                            display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600
                        }}>{f.free}</div>
                        <div style={{
                            padding: "10px 14px", borderBottom: i < FEATURES.length - 1 ? `1px solid ${T.border.subtle}` : "none",
                            fontSize: 11, color: T.accent.primary, fontWeight: 700, textAlign: "center",
                            display: "flex", alignItems: "center", justifyContent: "center"
                        }}>{f.pro}</div>
                    </div>)}
                </div>
            </Card>

            {/* Coming Soon — builds anticipation for Pro value */}
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, fontFamily: T.font.mono, letterSpacing: "0.08em", marginBottom: 8 }}>COMING SOON FOR PRO</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {COMING_SOON.map((f, i) => <div key={i} style={{
                        padding: "10px 12px", borderRadius: T.radius.md,
                        background: T.bg.elevated, border: `1px dashed ${T.border.default}`,
                        opacity: 0.75,
                        animation: `fadeInUp .3s ease-out ${(FEATURES.length + i) * 0.04}s both`
                    }}>
                        <div style={{ fontSize: 16, marginBottom: 4 }}>{f.icon}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.text.primary, marginBottom: 2 }}>{f.label}</div>
                        <div style={{ fontSize: 9, color: T.text.muted, lineHeight: 1.3 }}>{f.desc}</div>
                    </div>)}
                </div>
            </div>

            {/* Plan Selector */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                {["yearly", "monthly"].map(p => {
                    const pricing = IAP_PRICING[p];
                    const active = plan === p;
                    return <button key={p} onClick={() => { setPlan(p); haptic.light(); }} style={{
                        padding: "14px 12px", borderRadius: T.radius.lg, cursor: "pointer",
                        border: `2px solid ${active ? T.accent.primary : T.border.default}`,
                        background: active ? `${T.accent.primary}10` : T.bg.elevated,
                        textAlign: "center", position: "relative"
                    }}>
                        {p === "yearly" && <div style={{
                            position: "absolute", top: -8, right: 10, fontSize: 9, fontWeight: 800,
                            background: T.accent.primary, color: T.bg.base, padding: "2px 8px",
                            borderRadius: 99, fontFamily: T.font.mono
                        }}>{pricing.savings}</div>}
                        <Mono size={16} weight={800} color={active ? T.accent.primary : T.text.primary}>{pricing.price}</Mono>
                        <div style={{ fontSize: 11, color: T.text.dim, marginTop: 2 }}>/{pricing.period}</div>
                        {pricing.perMonth && <div style={{ fontSize: 10, color: T.accent.primary, marginTop: 4, fontWeight: 700 }}>{pricing.perMonth}/mo</div>}
                        {pricing.trial && <div style={{ fontSize: 9, color: T.status.green, marginTop: 3, fontWeight: 700 }}>{pricing.trial}</div>}
                    </button>;
                })}
            </div>

            {/* Purchase Button */}
            <button onClick={handlePurchase} disabled={purchasing} className="hover-btn" style={{
                width: "100%", padding: "16px", borderRadius: T.radius.lg, border: "none",
                background: `linear-gradient(135deg, ${T.accent.primary}, #6C60FF)`,
                color: "white", fontSize: 16, fontWeight: 800, cursor: purchasing ? "wait" : "pointer",
                opacity: purchasing ? 0.6 : 1, marginBottom: 10,
                boxShadow: `0 4px 20px ${T.accent.primary}40`,
                animation: purchasing ? "none" : "ctaPulse 3s ease-in-out infinite"
            }}>
                {purchasing ? "Processing..." : plan === "yearly"
                    ? `Start Free Trial — then ${IAP_PRICING.yearly.price}/yr`
                    : `Subscribe — ${IAP_PRICING.monthly.price}/mo`}
            </button>

            {/* Restore + Terms */}
            <div style={{ textAlign: "center" }}>
                <button onClick={handleRestore} style={{
                    background: "none", border: "none", color: T.accent.primary,
                    fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "8px"
                }}>Restore Purchases</button>
                <p style={{ fontSize: 9, color: T.text.muted, margin: "8px 0 0", lineHeight: 1.4 }}>
                    Payment charged to your Apple ID. Subscription auto-renews unless cancelled 24h before the end of the current period.
                    {plan === "yearly" && " Your 7-day free trial begins immediately. You won't be charged until the trial ends."}
                </p>
            </div>
        </div>
    </div>;
}

/**
 * Compact upgrade banner for embedding in Dashboard/Settings/History.
 * Only renders when shouldShowGating() is true (controlled by parent).
 */
export function ProBanner({ onUpgrade, label, sublabel }) {
    return <button onClick={() => { haptic.light(); onUpgrade?.(); }} style={{
        width: "100%", padding: "12px 16px", borderRadius: T.radius.lg,
        border: `1px solid ${T.accent.primary}30`,
        background: `linear-gradient(135deg, ${T.accent.primary}08, ${T.accent.primary}15)`,
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 12
    }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>⚡</span>
            <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.accent.primary }}>{label || "Upgrade to Pro"}</div>
                {sublabel && <div style={{ fontSize: 11, color: T.text.dim, marginTop: 1 }}>{sublabel}</div>}
            </div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.accent.primary, fontFamily: T.font.mono }}>→</div>
    </button>;
}
