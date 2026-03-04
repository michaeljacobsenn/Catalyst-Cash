// ═══════════════════════════════════════════════════════════════
// BILL NEGOTIATION SUGGESTIONS — Identifies high-impact savings
// opportunities from the user's recurring expenses and debts
// ═══════════════════════════════════════════════════════════════
import { useMemo } from "react";
import { T } from "../constants.js";
import { Card } from "../ui.jsx";
import { Mono } from "../components.jsx";
import { fmt } from "../utils.js";
import { Lightbulb, Phone, ArrowRight } from "lucide-react";

/**
 * Identify negotiation opportunities from the user's financial profile.
 * Returns actionable suggestions sorted by estimated annual savings.
 */
function identifyOpportunities(cards, financialConfig) {
    const opportunities = [];

    // 1. High-APR cards eligible for balance transfer
    const highAprCards = (cards || []).filter(c => {
        const apr = parseFloat(c.apr) || 0;
        const bal = parseFloat(c.balance) || 0;
        return apr >= 20 && bal >= 500;
    });

    for (const c of highAprCards) {
        const apr = parseFloat(c.apr) || 0;
        const bal = parseFloat(c.balance) || 0;
        // Estimate savings: difference between current APR interest and a 0% BT offer for 15 months
        const annualInterest = bal * (apr / 100);
        const btFee = bal * 0.03; // typical 3% BT fee
        const savings = Math.max(0, annualInterest - btFee);
        if (savings >= 50) {
            opportunities.push({
                type: "balance_transfer",
                title: `Balance Transfer: ${c.name || c.issuer || "Card"}`,
                description: `${apr.toFixed(1)}% APR on ${fmt(Math.round(bal))} balance. Transfer to a 0% intro APR card.`,
                annualSavings: Math.round(savings),
                action: "Research 0% BT offers",
                priority: apr >= 25 ? "high" : "medium"
            });
        }
    }

    // 2. Subscription audit — flag high monthly renewals
    const renewals = financialConfig?.renewals || [];
    const highRenewals = renewals.filter(r => {
        const amount = parseFloat(r.amount) || 0;
        const freq = String(r.frequency || r.interval || "").toLowerCase();
        return amount >= 15 && (freq.includes("month") || freq === "monthly");
    });

    if (highRenewals.length >= 3) {
        const totalMonthly = highRenewals.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
        opportunities.push({
            type: "subscription_audit",
            title: "Subscription Stack Audit",
            description: `${highRenewals.length} subscriptions totaling ${fmt(Math.round(totalMonthly))}/mo. Cancel unused or negotiate annual rates.`,
            annualSavings: Math.round(totalMonthly * 12 * 0.15), // estimate 15% savings
            action: "Review subscriptions",
            priority: totalMonthly >= 100 ? "high" : "medium"
        });
    }

    // 3. Insurance premium negotiation (detect from budget categories)
    const budgetCats = financialConfig?.budgetCategories || [];
    const insuranceCats = budgetCats.filter(b => {
        const name = String(b.name || "").toLowerCase();
        return name.includes("insurance") || name.includes("premium");
    });

    for (const ins of insuranceCats) {
        const monthly = parseFloat(ins.allocated) || 0;
        if (monthly >= 50) {
            opportunities.push({
                type: "insurance_negotiation",
                title: `Negotiate: ${ins.name}`,
                description: `${fmt(Math.round(monthly))}/mo allocated. Call to bundle, raise deductible, or shop competitors.`,
                annualSavings: Math.round(monthly * 12 * 0.12), // estimate 12% savings from negotiation
                action: "Call provider",
                priority: monthly >= 150 ? "high" : "medium"
            });
        }
    }

    // 4. Debt interest rate reduction (for non-card debts)
    const nonCardDebts = financialConfig?.nonCardDebts || [];
    for (const d of nonCardDebts) {
        const apr = parseFloat(d.apr) || 0;
        const bal = parseFloat(d.balance) || 0;
        if (apr >= 8 && bal >= 2000) {
            const potentialSavings = bal * ((apr - Math.max(apr - 3, 4)) / 100); // assume 3% reduction possible
            if (potentialSavings >= 50) {
                opportunities.push({
                    type: "rate_reduction",
                    title: `Rate Reduction: ${d.name || "Debt"}`,
                    description: `${apr.toFixed(1)}% on ${fmt(Math.round(bal))}. Request hardship rate or refinance.`,
                    annualSavings: Math.round(potentialSavings),
                    action: "Call lender",
                    priority: apr >= 15 ? "high" : "medium"
                });
            }
        }
    }

    // Sort by annual savings descending
    opportunities.sort((a, b) => b.annualSavings - a.annualSavings);
    return opportunities.slice(0, 4); // top 4 suggestions
}

export default function BillNegotiationCard({ cards = [], financialConfig = {} }) {
    const opportunities = useMemo(
        () => identifyOpportunities(cards, financialConfig),
        [cards, financialConfig]
    );

    if (opportunities.length === 0) return null;

    const totalPotential = opportunities.reduce((s, o) => s + o.annualSavings, 0);
    const priorityColor = { high: T.status.red, medium: T.status.amber };

    return (
        <Card animate delay={130} style={{
            background: `linear-gradient(160deg, ${T.bg.card}, ${T.status.amber}06)`,
            borderColor: `${T.status.amber}15`
        }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                        width: 26, height: 26, borderRadius: 7,
                        background: `${T.status.amber}15`,
                        display: "flex", alignItems: "center", justifyContent: "center"
                    }}>
                        <Lightbulb size={13} color={T.status.amber} strokeWidth={2.5} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>Savings Opportunities</span>
                </div>
                <div style={{
                    padding: "3px 8px", borderRadius: 10,
                    background: `${T.status.green}12`, border: `1px solid ${T.status.green}25`
                }}>
                    <Mono size={9} weight={800} color={T.status.green}>
                        ~{fmt(totalPotential)}/yr
                    </Mono>
                </div>
            </div>

            {/* Opportunity list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {opportunities.map((opp, i) => (
                    <div key={i} style={{
                        padding: "10px 12px", borderRadius: T.radius.sm,
                        background: T.bg.elevated, border: `1px solid ${T.border.subtle}`,
                        animation: `fadeInUp .35s ease-out ${i * 0.06}s both`
                    }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                {opp.type === "balance_transfer" || opp.type === "rate_reduction"
                                    ? <Phone size={10} color={priorityColor[opp.priority] || T.text.dim} />
                                    : <ArrowRight size={10} color={priorityColor[opp.priority] || T.text.dim} />
                                }
                                <span style={{
                                    fontSize: 10, fontWeight: 700, color: T.text.primary,
                                    maxWidth: "70%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                                }}>{opp.title}</span>
                            </div>
                            <Mono size={10} weight={800} color={T.status.green}>
                                ~{fmt(opp.annualSavings)}/yr
                            </Mono>
                        </div>
                        <div style={{ fontSize: 9, color: T.text.secondary, lineHeight: 1.4, marginBottom: 4 }}>
                            {opp.description}
                        </div>
                        <div style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: "2px 6px", borderRadius: 4,
                            background: `${priorityColor[opp.priority] || T.text.dim}10`,
                            fontSize: 8, fontWeight: 700, color: priorityColor[opp.priority] || T.text.dim,
                            fontFamily: T.font.mono
                        }}>
                            {opp.priority === "high" ? "HIGH IMPACT" : "MEDIUM IMPACT"}
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ marginTop: 10, fontSize: 8, color: T.text.muted, lineHeight: 1.4, textAlign: "center" }}>
                Estimates based on industry averages. Actual savings vary by provider and eligibility.
            </div>
        </Card>
    );
}
