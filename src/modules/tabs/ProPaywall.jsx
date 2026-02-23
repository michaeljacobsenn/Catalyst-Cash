import { useState, useCallback } from "react";
import { T } from "../constants.js";
import { TIERS, IAP_PRODUCTS } from "../subscription.js";
import { Crown, Zap, BarChart3, Calendar, Share2, Sparkles, ChevronRight, X, Check } from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// PRO PAYWALL — Premium upgrade prompt
// Surfaces when users try to access Pro features or hit free limits.
// ═══════════════════════════════════════════════════════════════

const PRO_FEATURES = [
    { icon: Sparkles, label: "Premium AI Models", desc: "Gemini 2.5 Pro, OpenAI o3-mini & Claude Sonnet 4 for elite financial reasoning" },
    { icon: Zap, label: "Unlimited Audits", desc: "No weekly limit — audit as often as you need" },
    { icon: BarChart3, label: "Monte Carlo Simulator", desc: "Project your debt-free date with probability analysis" },
    { icon: Calendar, label: "Cash Flow Calendar", desc: "35-day horizon with bill & income forecasting" },
    { icon: Share2, label: "Shareable Score Cards", desc: "Branded cards to share your financial progress" },
];

export default function ProPaywall({ onClose, onPurchase, reason }) {
    const [selectedPlan, setSelectedPlan] = useState("yearly");
    const [isPurchasing, setIsPurchasing] = useState(false);

    const handlePurchase = useCallback(async () => {
        setIsPurchasing(true);
        try {
            const productId = selectedPlan === "yearly" ? IAP_PRODUCTS.yearly : IAP_PRODUCTS.monthly;
            await onPurchase?.(productId);
        } catch (err) {
            console.error("[ProPaywall] purchase failed:", err);
        } finally {
            setIsPurchasing(false);
        }
    }, [selectedPlan, onPurchase]);

    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.85)", backdropFilter: "blur(20px)",
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", padding: "24px 20px",
            animation: "fadeIn 0.3s ease",
        }}>
            {/* Close button */}
            <button onClick={onClose} style={{
                position: "absolute", top: 16, right: 16,
                background: "rgba(255,255,255,0.08)", border: "none",
                borderRadius: "50%", width: 36, height: 36,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
            }}>
                <X size={18} color={T.text.dim} />
            </button>

            {/* Container */}
            <div style={{
                maxWidth: 380, width: "100%",
                display: "flex", flexDirection: "column", alignItems: "center",
            }}>
                {/* Header */}
                <div style={{
                    width: 56, height: 56, borderRadius: 16,
                    background: `linear-gradient(135deg, ${T.accent.primary}, ${T.accent.emerald})`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginBottom: 16, boxShadow: `0 4px 24px ${T.accent.primary}40`,
                }}>
                    <Crown size={28} color="#fff" />
                </div>

                <h2 style={{
                    fontSize: 24, fontWeight: 900, color: T.text.primary,
                    textAlign: "center", marginBottom: 4,
                }}>Unlock Catalyst Pro</h2>

                {reason && (
                    <p style={{
                        fontSize: 12, color: T.accent.primary, fontWeight: 600,
                        textAlign: "center", marginBottom: 12,
                        background: T.accent.primaryDim, padding: "6px 14px",
                        borderRadius: 99,
                    }}>{reason}</p>
                )}

                <p style={{
                    fontSize: 13, color: T.text.secondary, textAlign: "center",
                    lineHeight: 1.6, marginBottom: 20, maxWidth: 300,
                }}>
                    Unlock the full power of AI-driven financial analysis with premium models and unlimited access.
                </p>

                {/* Features */}
                <div style={{
                    width: "100%", marginBottom: 20,
                    background: T.bg.elevated, borderRadius: T.radius.lg,
                    border: `1px solid ${T.border.default}`,
                    overflow: "hidden",
                }}>
                    {PRO_FEATURES.map((f, i) => (
                        <div key={i} style={{
                            display: "flex", alignItems: "center", gap: 12,
                            padding: "12px 14px",
                            borderBottom: i < PRO_FEATURES.length - 1 ? `1px solid ${T.border.subtle}` : "none",
                        }}>
                            <div style={{
                                width: 32, height: 32, borderRadius: 8,
                                background: `${T.accent.primary}12`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                flexShrink: 0,
                            }}>
                                <f.icon size={16} color={T.accent.primary} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 12, fontWeight: 700, color: T.text.primary, margin: 0 }}>{f.label}</p>
                                <p style={{ fontSize: 10, color: T.text.dim, margin: 0, lineHeight: 1.4 }}>{f.desc}</p>
                            </div>
                            <Check size={14} color={T.accent.emerald} />
                        </div>
                    ))}
                </div>

                {/* Plan Selector */}
                <div style={{
                    display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
                    width: "100%", marginBottom: 16,
                }}>
                    <button onClick={() => setSelectedPlan("yearly")} style={{
                        padding: "14px 12px", borderRadius: T.radius.md,
                        border: selectedPlan === "yearly"
                            ? `2px solid ${T.accent.primary}`
                            : `1px solid ${T.border.default}`,
                        background: selectedPlan === "yearly" ? T.accent.primaryDim : T.bg.elevated,
                        cursor: "pointer", textAlign: "center", position: "relative",
                    }}>
                        {selectedPlan === "yearly" && (
                            <span style={{
                                position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)",
                                background: T.accent.emerald, color: "#fff",
                                fontSize: 9, fontWeight: 800, padding: "2px 8px",
                                borderRadius: 99, letterSpacing: "0.03em",
                            }}>BEST VALUE</span>
                        )}
                        <p style={{ fontSize: 18, fontWeight: 900, color: T.text.primary, margin: 0 }}>$39.99</p>
                        <p style={{ fontSize: 10, color: T.text.dim, margin: "2px 0 0", fontWeight: 600 }}>per year</p>
                        <p style={{ fontSize: 10, color: T.accent.emerald, margin: "2px 0 0", fontWeight: 700 }}>$3.33/mo — Save 33%</p>
                    </button>

                    <button onClick={() => setSelectedPlan("monthly")} style={{
                        padding: "14px 12px", borderRadius: T.radius.md,
                        border: selectedPlan === "monthly"
                            ? `2px solid ${T.accent.primary}`
                            : `1px solid ${T.border.default}`,
                        background: selectedPlan === "monthly" ? T.accent.primaryDim : T.bg.elevated,
                        cursor: "pointer", textAlign: "center",
                    }}>
                        <p style={{ fontSize: 18, fontWeight: 900, color: T.text.primary, margin: 0 }}>$4.99</p>
                        <p style={{ fontSize: 10, color: T.text.dim, margin: "2px 0 0", fontWeight: 600 }}>per month</p>
                        <p style={{ fontSize: 10, color: T.text.secondary, margin: "2px 0 0", fontWeight: 600 }}>Flexible</p>
                    </button>
                </div>

                {/* Purchase Button */}
                <button onClick={handlePurchase} disabled={isPurchasing} style={{
                    width: "100%", padding: "14px 0", borderRadius: T.radius.lg,
                    border: "none",
                    background: `linear-gradient(135deg, ${T.accent.primary}, ${T.accent.emerald})`,
                    color: "#fff", fontSize: 15, fontWeight: 800,
                    cursor: isPurchasing ? "wait" : "pointer",
                    opacity: isPurchasing ? 0.7 : 1,
                    boxShadow: `0 4px 20px ${T.accent.primary}40`,
                    transition: "all 0.2s",
                }}>
                    {isPurchasing ? "Processing..." : `Start ${selectedPlan === "yearly" ? "Annual" : "Monthly"} Pro`}
                </button>

                {/* Legal */}
                <p style={{
                    fontSize: 9, color: T.text.muted, textAlign: "center",
                    lineHeight: 1.5, marginTop: 12, maxWidth: 300,
                }}>
                    Payment charged to your Apple ID. Subscription auto-renews unless cancelled 24h before the period ends.
                    By subscribing you agree to our Terms of Service and Privacy Policy.
                </p>

                {/* Restore */}
                <button onClick={() => { alert("Restore Purchases will be available once subscriptions are live."); }} style={{
                    background: "none", border: "none", color: T.text.dim,
                    fontSize: 11, fontWeight: 600, cursor: "pointer",
                    textDecoration: "underline", marginTop: 8, padding: 4,
                }}>Restore Purchases</button>
            </div>
        </div>
    );
}

/**
 * Inline Pro badge shown next to gated features.
 */
export function ProBadge({ style }) {
    return (
        <span style={{
            fontSize: 9, fontWeight: 800, color: T.accent.primary,
            background: T.accent.primaryDim, padding: "2px 6px",
            borderRadius: 99, letterSpacing: "0.04em",
            display: "inline-flex", alignItems: "center", gap: 3,
            ...style,
        }}>
            <Crown size={9} /> PRO
        </span>
    );
}
