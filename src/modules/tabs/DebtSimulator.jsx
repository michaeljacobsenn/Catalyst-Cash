// ═══════════════════════════════════════════════════════════════
// DEBT PAYOFF SIMULATOR — Interactive "what-if" debt destroyer
// ═══════════════════════════════════════════════════════════════
import { useState, useMemo } from "react";
import { T } from "../constants.js";
import { Card, Label } from "../ui.jsx";
import { Mono } from "../components.jsx";
import { cmpString, fromCents, monthlyInterestCents, toBps, toCents } from "../moneyMath.js";

const DEFAULT_MIN_PAYMENT_CENTS = 2500;

function sortDebtsForStrategy(strategy, list) {
    const sorted = [...list];
    if (strategy === "avalanche") {
        sorted.sort((a, b) => {
            if (a.aprBps !== b.aprBps) return b.aprBps - a.aprBps;
            if (a.balanceCents !== b.balanceCents) return a.balanceCents - b.balanceCents;
            if (a.minPaymentCents !== b.minPaymentCents) return b.minPaymentCents - a.minPaymentCents;
            return cmpString(a.name, b.name);
        });
        return sorted;
    }

    // Snowball = smallest balance first, deterministic ties on APR then minimum.
    sorted.sort((a, b) => {
        if (a.balanceCents !== b.balanceCents) return a.balanceCents - b.balanceCents;
        if (a.aprBps !== b.aprBps) return b.aprBps - a.aprBps;
        if (a.minPaymentCents !== b.minPaymentCents) return b.minPaymentCents - a.minPaymentCents;
        return cmpString(a.name, b.name);
    });
    return sorted;
}

function simulatePayoff(debts, extraMonthly, strategy) {
    if (!debts?.length) return { months: 0, totalInterest: 0, timeline: [] };

    let balances = debts.map(d => ({
        name: d.name || "Card",
        balanceCents: Math.max(0, toCents(d.balance || 0)),
        aprBps: Math.max(0, toBps(d.apr || 0)),
        minPaymentCents: Math.max(0, toCents(d.minPayment || 0)) || DEFAULT_MIN_PAYMENT_CENTS,
    })).filter(d => d.balanceCents > 0);

    if (!balances.length) return { months: 0, totalInterest: 0, timeline: [] };

    let months = 0;
    let totalInterestCents = 0;
    const timeline = [];
    const maxMonths = 360; // 30 year cap

    while (balances.some(d => d.balanceCents > 0) && months < maxMonths) {
        months++;
        let extraLeftCents = Math.max(0, toCents(extraMonthly || 0));
        let monthInterestCents = 0;

        // Apply interest
        for (const d of balances) {
            if (d.balanceCents <= 0) continue;
            const interestCents = monthlyInterestCents(d.balanceCents, d.aprBps);
            d.balanceCents += interestCents;
            monthInterestCents += interestCents;
            totalInterestCents += interestCents;
        }

        // Pay minimums
        for (const d of balances) {
            if (d.balanceCents <= 0) continue;
            const paymentCents = Math.min(d.minPaymentCents, d.balanceCents);
            d.balanceCents -= paymentCents;
        }

        // Re-rank after minimums. This keeps ties and strategy transitions mathematically correct.
        const orderedDebts = sortDebtsForStrategy(strategy, balances.filter(d => d.balanceCents > 0));
        for (const d of orderedDebts) {
            if (d.balanceCents <= 0 || extraLeftCents <= 0) continue;
            const paymentCents = Math.min(extraLeftCents, d.balanceCents);
            d.balanceCents -= paymentCents;
            extraLeftCents -= paymentCents;
        }

        if (months % 3 === 0 || months <= 3 || !balances.some(d => d.balanceCents > 0)) {
            timeline.push({
                month: months,
                totalDebt: fromCents(balances.reduce((s, d) => s + Math.max(0, d.balanceCents), 0)),
                interest: fromCents(monthInterestCents)
            });
        }
    }

    return { months, totalInterest: fromCents(totalInterestCents), timeline };
}

export default function DebtSimulator({ cards = [], financialConfig }) {
    const [extraPayment, setExtraPayment] = useState(100);
    const [showSim, setShowSim] = useState(false);

    // Get debts from card portfolio + non-card debts
    const debts = useMemo(() => {
        const cardDebts = cards.filter(c => parseFloat(c.balance) > 0).map(c => ({
            name: c.nickname || c.name || c.institution || "Card",
            balance: c.balance, apr: c.apr, minPayment: c.minPayment, limit: c.limit
        }));
        const nonCardDebts = (financialConfig?.nonCardDebts || []).filter(d => parseFloat(d.balance) > 0).map(d => ({
            name: d.name || "Loan", balance: d.balance, apr: d.apr || 0, minPayment: d.minimum ?? d.minPayment ?? 0, limit: 0
        }));
        return [...cardDebts, ...nonCardDebts];
    }, [cards, financialConfig]);

    const baseline = useMemo(() => simulatePayoff(debts, 0, "avalanche"), [debts]);
    const avalanche = useMemo(() => simulatePayoff(debts, extraPayment, "avalanche"), [debts, extraPayment]);
    const snowball = useMemo(() => simulatePayoff(debts, extraPayment, "snowball"), [debts, extraPayment]);

    const totalDebt = debts.reduce((s, d) => s + (parseFloat(d.balance) || 0), 0);
    if (totalDebt < 50) return null; // Don't show if no meaningful debt

    const monthsSaved = baseline.months - avalanche.months;
    const interestSaved = baseline.totalInterest - avalanche.totalInterest;
    const bestStrategy = avalanche.totalInterest <= snowball.totalInterest ? "avalanche" : "snowball";
    const best = bestStrategy === "avalanche" ? avalanche : snowball;

    const maxDebt = Math.max(...(best.timeline.length ? best.timeline.map(t => t.totalDebt) : [totalDebt]), totalDebt);

    if (!showSim) {
        return <Card animate delay={400} style={{ cursor: "pointer" }} onClick={() => setShowSim(true)}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 18 }}>⚡</span>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>Debt Payoff Simulator</div>
                        <div style={{ fontSize: 11, color: T.text.dim }}>See how fast you can be debt-free</div>
                    </div>
                </div>
                <div style={{ fontSize: 20, color: T.text.dim }}>›</div>
            </div>
        </Card>;
    }

    return <Card animate>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18 }}>⚡</span>
                <span style={{ fontSize: 14, fontWeight: 800 }}>Debt Payoff Simulator</span>
            </div>
            <button onClick={() => setShowSim(false)} style={{
                background: "none", border: "none", color: T.text.dim, fontSize: 11, fontWeight: 700,
                cursor: "pointer", fontFamily: T.font.mono
            }}>COLLAPSE</button>
        </div>

        {/* Total Debt */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
            <Mono size={11} color={T.text.dim}>TOTAL DEBT</Mono>
            <Mono size={28} weight={800} color={T.status.red}>${totalDebt.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</Mono>
        </div>

        {/* Extra Payment Slider */}
        <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <Label>Extra Monthly Payment</Label>
                <Mono size={14} weight={800} color={T.accent.primary}>${extraPayment}/mo</Mono>
            </div>
            <input type="range" min={0} max={1000} step={25} value={extraPayment}
                onChange={e => setExtraPayment(parseInt(e.target.value))}
                style={{
                    width: "100%", height: 6, appearance: "none", WebkitAppearance: "none",
                    background: `linear-gradient(to right, ${T.accent.primary} ${extraPayment / 10}%, ${T.border.default} ${extraPayment / 10}%)`,
                    borderRadius: 3, outline: "none", cursor: "pointer"
                }} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span style={{ fontSize: 10, color: T.text.muted }}>$0</span>
                <span style={{ fontSize: 10, color: T.text.muted }}>$1,000</span>
            </div>
        </div>

        {/* Timeline Visualization */}
        {best.timeline.length > 0 && <div style={{
            height: 80, display: "flex", alignItems: "flex-end", gap: 2, marginBottom: 16,
            padding: "0 4px", borderBottom: `1px solid ${T.border.default}`
        }}>
            {best.timeline.map((t, i) => {
                const h = maxDebt > 0 ? (t.totalDebt / maxDebt) * 70 : 0;
                const isLast = i === best.timeline.length - 1;
                return <div key={i} style={{
                    flex: 1, height: Math.max(2, h), borderRadius: "3px 3px 0 0",
                    background: isLast && t.totalDebt < 1
                        ? T.status.green
                        : `linear-gradient(180deg, ${T.status.red}80, ${T.status.amber}60)`,
                    transition: "height 0.5s ease",
                    position: "relative"
                }}>
                    {(i === 0 || isLast) && <span style={{
                        position: "absolute", bottom: -16, left: "50%", transform: "translateX(-50%)",
                        fontSize: 8, color: T.text.muted, fontFamily: T.font.mono, whiteSpace: "nowrap"
                    }}>M{t.month}</span>}
                </div>;
            })}
        </div>}

        {/* Results Comparison */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            {[
                { label: "Avalanche", sub: "Highest APR first", data: avalanche, rec: bestStrategy === "avalanche" },
                { label: "Snowball", sub: "Lowest balance first", data: snowball, rec: bestStrategy === "snowball" },
            ].map(s => <div key={s.label} style={{
                padding: "12px 10px", borderRadius: T.radius.md, textAlign: "center",
                background: s.rec ? `${T.accent.primary}10` : T.bg.elevated,
                border: `1.5px solid ${s.rec ? T.accent.primary : T.border.default}`
            }}>
                {s.rec && <div style={{ fontSize: 9, fontWeight: 800, color: T.accent.primary, marginBottom: 4, fontFamily: T.font.mono }}>★ RECOMMENDED</div>}
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>{s.label}</div>
                <div style={{ fontSize: 10, color: T.text.dim, marginBottom: 6 }}>{s.sub}</div>
                <Mono size={18} weight={800} color={T.text.primary}>
                    {s.data.months < 360 ? `${Math.floor(s.data.months / 12)}y ${s.data.months % 12}m` : "30y+"}
                </Mono>
                <div style={{ fontSize: 10, color: T.status.red, fontWeight: 600, marginTop: 2 }}>
                    ${s.data.totalInterest.toLocaleString("en-US", { maximumFractionDigits: 0 })} interest
                </div>
            </div>)}
        </div>

        {/* Strategy Disclaimer */}
        <p style={{ fontSize: 9, color: T.text.muted, textAlign: "center", margin: "4px 0 12px", lineHeight: 1.4 }}>
            Avalanche minimizes total interest paid. Snowball provides psychological momentum by eliminating debts faster. Both are valid approaches.
        </p>

        {/* Impact Summary */}
        {monthsSaved > 0 && <div style={{
            padding: "12px 14px", borderRadius: T.radius.md, textAlign: "center",
            background: `${T.status.green}10`, border: `1px solid ${T.status.green}25`
        }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: T.status.green, margin: 0 }}>
                💰 Extra ${extraPayment}/mo could save you {monthsSaved} months and ${interestSaved.toLocaleString("en-US", { maximumFractionDigits: 0 })} in interest
            </p>
        </div>}
    </Card>;
}
