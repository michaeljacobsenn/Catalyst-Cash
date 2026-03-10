import { useState, useMemo } from "react";
import { T } from "../constants.js";
import { Card, Label, Badge } from "../ui.jsx";
import { Mono } from "../components.jsx";
import { haptic } from "../haptics.js";
import { X } from "lucide-react";

// Reusing FIRE math logic from FIReSimulator for consistency
function calculateFIRE(netWorth, income, expenses, withdrawalRatePct, expectedReturnPct) {
    const targetFIRE = expenses / (withdrawalRatePct / 100);
    const annualSavings = income - expenses;
    const r = expectedReturnPct / 100;

    if (annualSavings <= 0 && netWorth * r <= expenses) {
        return { target: targetFIRE, years: null, timeline: [], error: "Negative savings rate and insufficient nest egg." };
    }
    if (netWorth >= targetFIRE) {
        return { target: targetFIRE, years: 0, timeline: [{ year: 0, nw: netWorth }] };
    }

    let currentNW = netWorth;
    let years = 0;
    const timeline = [];
    const maxYears = 60;

    timeline.push({ year: 0, nw: currentNW });

    while (currentNW < targetFIRE && years < maxYears) {
        years++;
        currentNW = (currentNW * (1 + r)) + annualSavings;
        timeline.push({ year: years, nw: currentNW });
    }

    const renderTimeline = timeline.filter((t, i) => {
        if (i === 0 || i === timeline.length - 1) return true;
        if (years <= 10) return true;
        if (years <= 20) return i % 2 === 0;
        if (years <= 40) return i % 4 === 0;
        return i % 5 === 0;
    });

    return { target: targetFIRE, years: currentNW >= targetFIRE ? years : null, timeline: renderTimeline };
}

export default function ScenarioSandbox({ currentNetWorth = 0, currentAnnualIncome = 0, currentAnnualExpenses = 0, onClose }) {
    const [incomeOffset, setIncomeOffset] = useState(0); // +/- Monthly
    const [expenseOffset, setExpenseOffset] = useState(0); // +/- Monthly
    const [withdrawalRate, setWithdrawalRate] = useState(4.0);
    const [marketReturn, setMarketReturn] = useState(7.0);

    const baseNW = Math.max(0, currentNetWorth);
    const baseIncome = Math.max(0, currentAnnualIncome);
    const baseExpenses = Math.max(1, currentAnnualExpenses);

    const projectedIncome = baseIncome + (incomeOffset * 12);
    // Floor expenses at $1 to prevent divide by zero errors in the FIRE target calculation
    const projectedExpenses = Math.max(1, baseExpenses + (expenseOffset * 12));

    const baselineResult = useMemo(() => calculateFIRE(baseNW, baseIncome, baseExpenses, withdrawalRate, marketReturn), [baseNW, baseIncome, baseExpenses, withdrawalRate, marketReturn]);
    const scenarioResult = useMemo(() => calculateFIRE(baseNW, projectedIncome, projectedExpenses, withdrawalRate, marketReturn), [baseNW, projectedIncome, projectedExpenses, withdrawalRate, marketReturn]);

    // Calculate time saved/lost
    const yearsSaved = (baselineResult.years !== null && scenarioResult.years !== null) ? baselineResult.years - scenarioResult.years : null;

    return (
        <div style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.8)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            animation: "fadeIn .2s ease-out"
        }}>
            <Card style={{ width: "100%", maxWidth: 600, maxHeight: "90vh", overflowY: "auto", position: "relative", border: `1px solid ${T.accent.emerald}40` }}>
                <button
                    onClick={() => { haptic.light(); onClose(); }}
                    style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", color: T.text.dim, cursor: "pointer", padding: 4 }}
                >
                    <X size={20} />
                </button>

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                    <span style={{ fontSize: 24 }}>🧭</span>
                    <div>
                        <div style={{ fontSize: 18, fontWeight: 800 }}>"What If?" Sandbox</div>
                        <div style={{ fontSize: 12, color: T.text.secondary }}>Simulate major life changes safely</div>
                    </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
                    <div style={{ background: `${T.bg.elevated}80`, padding: 16, borderRadius: T.radius.md, border: `1px solid ${T.border.default}` }}>
                        <div style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono, letterSpacing: "0.05em", marginBottom: 4 }}>BASELINE (REALITY)</div>
                        <Mono size={24} weight={800} color={T.text.primary}>
                            {baselineResult.years !== null ? `${baselineResult.years} yrs` : "N/A"}
                        </Mono>
                        <div style={{ fontSize: 11, color: T.text.secondary, marginTop: 4 }}>To reach ${(baselineResult.target / 1000).toFixed(0)}k</div>
                    </div>

                    <div style={{ background: `${T.accent.emerald}15`, padding: 16, borderRadius: T.radius.md, border: `1px solid ${T.accent.emerald}30` }}>
                        <div style={{ fontSize: 10, color: T.status.green, fontFamily: T.font.mono, letterSpacing: "0.05em", marginBottom: 4, fontWeight: 700 }}>NEW SCENARIO</div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                            <Mono size={24} weight={800} color={T.accent.emerald}>
                                {scenarioResult.years !== null ? `${scenarioResult.years} yrs` : "N/A"}
                            </Mono>
                            {yearsSaved !== null && yearsSaved !== 0 && (
                                <span style={{ fontSize: 12, fontWeight: 700, color: yearsSaved > 0 ? T.status.green : T.status.red }}>
                                    {yearsSaved > 0 ? `-${yearsSaved} yrs` : `+${Math.abs(yearsSaved)} yrs`}
                                </span>
                            )}
                        </div>
                        <div style={{ fontSize: 11, color: T.text.secondary, marginTop: 4 }}>To reach ${(scenarioResult.target / 1000).toFixed(0)}k</div>
                    </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                            <Label>Monthly Income Change</Label>
                            <Mono size={13} weight={800} color={incomeOffset >= 0 ? T.status.green : T.status.red}>
                                {incomeOffset > 0 ? "+" : ""}${incomeOffset.toLocaleString()}
                            </Mono>
                        </div>
                        <input
                            type="range" min={-5000} max={10000} step={100} value={incomeOffset}
                            onChange={e => setIncomeOffset(parseInt(e.target.value))}
                            onPointerUp={() => haptic.selection()}
                            style={{ width: "100%", height: 6, appearance: "none", background: `linear-gradient(to right, ${T.status.green} ${((incomeOffset + 5000) / 15000) * 100}%, ${T.border.default} ${((incomeOffset + 5000) / 15000) * 100}%)`, borderRadius: 3, outline: "none" }}
                        />
                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                            {[-1000, 500, 1000, 2500].map(v => (
                                <button key={v} onClick={() => { setIncomeOffset(p => p + v); haptic.light(); }} style={{ flex: 1, padding: "4px 0", fontSize: 10, background: T.bg.elevated, border: `1px solid ${T.border.subtle}`, borderRadius: 4, color: T.text.secondary, cursor: "pointer", fontWeight: 700 }}>
                                    {v > 0 ? '+' : ''}{v}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                            <Label>Monthly Expense Change</Label>
                            <Mono size={13} weight={800} color={expenseOffset <= 0 ? T.status.green : T.status.red}>
                                {expenseOffset > 0 ? "+" : ""}${expenseOffset.toLocaleString()}
                            </Mono>
                        </div>
                        <input
                            type="range" min={-5000} max={10000} step={100} value={expenseOffset}
                            onChange={e => setExpenseOffset(parseInt(e.target.value))}
                            onPointerUp={() => haptic.selection()}
                            style={{ width: "100%", height: 6, appearance: "none", background: `linear-gradient(to right, ${T.status.red} ${((expenseOffset + 5000) / 15000) * 100}%, ${T.border.default} ${((expenseOffset + 5000) / 15000) * 100}%)`, borderRadius: 3, outline: "none" }}
                        />
                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                            {[-500, -250, 500, 1500].map(v => (
                                <button key={v} onClick={() => { setExpenseOffset(p => p + v); haptic.light(); }} style={{ flex: 1, padding: "4px 0", fontSize: 10, background: T.bg.elevated, border: `1px solid ${T.border.subtle}`, borderRadius: 4, color: T.text.secondary, cursor: "pointer", fontWeight: 700 }}>
                                    {v > 0 ? '+' : ''}{v}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
}
