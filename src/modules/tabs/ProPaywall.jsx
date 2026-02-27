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

const FEATURES = [
    { label: "Weekly Audits", free: "3 / week", pro: "Unlimited", icon: "📊" },
    { label: "Audit History", free: "Last 4", pro: "Unlimited", icon: "📜" },
    { label: "Market Refresh", free: "60 min", pro: "15 min", icon: "📈" },
    { label: "AI Models", free: "Flash only", pro: "All models", icon: "🧠" },
    { label: "CSV Export", free: "—", pro: "✓", icon: "📤" },
    { label: "Share Card", free: "—", pro: "✓", icon: "🎴" },
    { label: "Advanced Alerts", free: "—", pro: "✓", icon: "🔔" },
];

export default function ProPaywall({ onClose }) {
    const [plan, setPlan] = useState("yearly");
    const [purchasing, setPurchasing] = useState(false);

    const handlePurchase = async () => {
        haptic.medium();
        setPurchasing(true);
        try {
            // TODO: Replace with StoreKit 2 / RevenueCat native bridge
            console.log(`[IAP] Purchase requested: ${IAP_PRODUCTS[plan]}`);
        } catch (e) {
            console.error("[IAP] Purchase failed:", e);
        } finally {
            setPurchasing(false);
        }
    };

    const handleRestore = async () => {
        haptic.light();
        // TODO: Wire to StoreKit 2 restoreCompletedTransactions
        console.log("[IAP] Restore purchases requested");
    };

    return <div style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        animation: "fadeIn 0.2s ease"
    }} onClick={onClose}>
        <div onClick={e => e.stopPropagation()} style={{
            width: "100%", maxWidth: 440, maxHeight: "88vh", overflowY: "auto",
            background: T.bg.base, borderRadius: "24px 24px 0 0",
            padding: "24px 20px env(safe-area-inset-bottom, 20px)",
            animation: "slideUp 0.3s ease"
        }}>
            {/* Handle */}
            <div style={{ width: 36, height: 4, borderRadius: 2, background: T.text.muted, margin: "0 auto 20px", opacity: 0.4 }} />

            {/* Hero */}
            <div style={{ textAlign: "center", marginBottom: 24 }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>⚡</div>
                <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px", color: T.text.primary }}>Upgrade to Pro</h2>
                <p style={{ fontSize: 13, color: T.text.dim, margin: 0, lineHeight: 1.4 }}>
                    Unlock unlimited audits, all AI models, and advanced financial tools.
                </p>
            </div>

            {/* Feature Comparison */}
            <Card style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 0 }}>
                    <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.border.subtle}`, fontWeight: 800, fontSize: 11, color: T.text.dim, fontFamily: T.font.mono }}>FEATURE</div>
                    <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.border.subtle}`, fontWeight: 800, fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, textAlign: "center" }}>FREE</div>
                    <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.border.subtle}`, fontWeight: 800, fontSize: 11, color: T.accent.primary, fontFamily: T.font.mono, textAlign: "center" }}>PRO</div>
                    {FEATURES.map((f, i) => <div key={i} style={{ display: "contents" }}>
                        <div style={{ padding: "10px 14px", borderBottom: i < FEATURES.length - 1 ? `1px solid ${T.border.subtle}` : "none", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                            <span>{f.icon}</span> {f.label}
                        </div>
                        <div style={{ padding: "10px 14px", borderBottom: i < FEATURES.length - 1 ? `1px solid ${T.border.subtle}` : "none", fontSize: 12, color: T.text.muted, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center" }}>{f.free}</div>
                        <div style={{ padding: "10px 14px", borderBottom: i < FEATURES.length - 1 ? `1px solid ${T.border.subtle}` : "none", fontSize: 12, color: T.accent.primary, fontWeight: 700, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center" }}>{f.pro}</div>
                    </div>)}
                </div>
            </Card>

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
                    </button>;
                })}
            </div>

            {/* Purchase Button */}
            <button onClick={handlePurchase} disabled={purchasing} style={{
                width: "100%", padding: "16px", borderRadius: T.radius.lg, border: "none",
                background: `linear-gradient(135deg, ${T.accent.primary}, #6C60FF)`,
                color: "white", fontSize: 16, fontWeight: 800, cursor: purchasing ? "wait" : "pointer",
                opacity: purchasing ? 0.6 : 1, marginBottom: 10,
                boxShadow: `0 4px 20px ${T.accent.primary}40`
            }}>
                {purchasing ? "Processing..." : `Subscribe — ${IAP_PRICING[plan].price}/${IAP_PRICING[plan].period}`}
            </button>

            {/* Restore + Terms */}
            <div style={{ textAlign: "center" }}>
                <button onClick={handleRestore} style={{
                    background: "none", border: "none", color: T.accent.primary,
                    fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "8px"
                }}>Restore Purchases</button>
                <p style={{ fontSize: 9, color: T.text.muted, margin: "8px 0 0", lineHeight: 1.4 }}>
                    Payment charged to your Apple ID. Subscription auto-renews unless cancelled 24h before the end of the current period.
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
