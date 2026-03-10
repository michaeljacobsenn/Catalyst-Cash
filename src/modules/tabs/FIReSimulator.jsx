import { useState, useMemo } from "react";
import { T } from "../constants.js";
import { Card, Label, Badge } from "../ui.jsx";
import { Mono } from "../components.jsx";
import { haptic } from "../haptics.js";
import { Sparkles } from "lucide-react";
import ScenarioSandbox from "../dashboard/ScenarioSandbox.jsx";

// Standard formula: Target FIRE = Annual Expenses / Withdrawal Rate
function calculateFIRE(netWorth, income, expenses, withdrawalRatePct, expectedReturnPct) {
    const targetFIRE = expenses / (withdrawalRatePct / 100);
    const annualSavings = income - expenses;
    const r = expectedReturnPct / 100;

    // Edge cases
    if (annualSavings <= 0 && netWorth * r <= expenses) {
        return { target: targetFIRE, years: null, timeline: [], error: "Negative savings rate and insufficient nest egg." };
    }
    if (netWorth >= targetFIRE) {
        return { target: targetFIRE, years: 0, timeline: [{ year: 0, nw: netWorth }] };
    }

    let currentNW = netWorth;
    let years = 0;
    const timeline = [];
    const maxYears = 60; // Hard cap

    // Record initial state
    timeline.push({ year: 0, nw: currentNW });

    while (currentNW < targetFIRE && years < maxYears) {
        years++;
        // Compound return + add savings at end of year
        currentNW = (currentNW * (1 + r)) + annualSavings;

        // Sample every 1 year, or 5 years if the timeline is very long, to keep UI clean
        timeline.push({
            year: years,
            nw: currentNW
        });
    }

    // Filter timeline for rendering (keep ~10 points max)
    const renderTimeline = timeline.filter((t, i) => {
        if (i === 0 || i === timeline.length - 1) return true;
        if (years <= 10) return true;
        if (years <= 20) return i % 2 === 0;
        if (years <= 40) return i % 4 === 0;
        return i % 5 === 0;
    });

    return {
        target: targetFIRE,
        years: currentNW >= targetFIRE ? years : null,
        timeline: renderTimeline,
        finalNW: currentNW
    };
}

export default function FIReSimulator({ currentNetWorth = 0, annualIncome = 0, annualExpenses = 0 }) {
    const [showSim, setShowSim] = useState(false);
    const [withdrawalRate, setWithdrawalRate] = useState(4.0); // 4% rule
    const [marketReturn, setMarketReturn] = useState(7.0); // 7% real return
    const [extraSavings, setExtraSavings] = useState(0);
    const [hoveredYear, setHoveredYear] = useState(null);
    const [showSandbox, setShowSandbox] = useState(false);

    // Use props as base, but allow tweaking
    const nw = Math.max(0, currentNetWorth);
    const income = Math.max(0, annualIncome);
    const baseExpenses = Math.max(1, annualExpenses); // Prevent div by 0

    const effectiveSavings = (income - baseExpenses) + (extraSavings * 12);
    const effectiveExpenses = baseExpenses - (extraSavings * 12); // If they save more, they spend less!

    const result = useMemo(() => {
        return calculateFIRE(nw, income, effectiveExpenses, withdrawalRate, marketReturn);
    }, [nw, income, effectiveExpenses, withdrawalRate, marketReturn]);

    const savingsRate = income > 0 ? (effectiveSavings / income) * 100 : 0;

    if (!showSim) {
        return (
            <Card animate delay={400} style={{ cursor: "pointer", marginBottom: 16 }} onClick={() => setShowSim(true)}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 18 }}>🏖️</span>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>FIRE Simulator</div>
                            <div style={{ fontSize: 11, color: T.text.dim }}>Project your Financial Independence date</div>
                        </div>
                    </div>
                    <div style={{ fontSize: 20, color: T.text.dim }}>›</div>
                </div>
            </Card>
        );
    }

    return (
        <Card animate style={{ marginBottom: 16, borderTop: `4px solid ${T.accent.emerald}`, position: "relative" }}>
            {showSandbox && (
                <ScenarioSandbox
                    currentNetWorth={nw}
                    currentAnnualIncome={income}
                    currentAnnualExpenses={effectiveExpenses}
                    onClose={() => setShowSandbox(false)}
                />
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 18 }}>🏖️</span>
                    <span style={{ fontSize: 14, fontWeight: 800 }}>FIRE Simulator</span>
                    <Badge variant="success" size="sm">FREE TOOL</Badge>
                </div>
                <button
                    onClick={() => setShowSim(false)}
                    style={{
                        background: "none",
                        border: "none",
                        color: T.text.dim,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontFamily: T.font.mono,
                    }}
                >
                    COLLAPSE
                </button>
            </div>

            {/* Target & Timeline */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                <div style={{ textAlign: "center", background: `${T.accent.emerald}10`, padding: "12px", borderRadius: T.radius.md, border: `1px solid ${T.accent.emerald}20` }}>
                    <Mono size={10} color={T.accent.emerald} style={{ letterSpacing: "0.05em" }}>TARGET FIRE NUMBER</Mono>
                    <div style={{ fontSize: 24, fontWeight: 800, color: T.text.primary, marginTop: 4 }}>
                        ${(result.target).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </div>
                    <div style={{ fontSize: 10, color: T.text.secondary, marginTop: 2 }}>{withdrawalRate}% withdrawal rate</div>
                </div>
                <div style={{ textAlign: "center", background: `${T.status.blue}10`, padding: "12px", borderRadius: T.radius.md, border: `1px solid ${T.status.blue}20` }}>
                    <Mono size={10} color={T.status.blue} style={{ letterSpacing: "0.05em" }}>YEARS TO FREEDOM</Mono>
                    <div style={{ fontSize: 24, fontWeight: 800, color: T.text.primary, marginTop: 4 }}>
                        {result.years !== null ? result.years : "30+"}
                    </div>
                    <div style={{ fontSize: 10, color: T.text.secondary, marginTop: 2 }}>
                        {result.years !== null ? `Age ${(new Date().getFullYear()) + result.years - 1995 /* Rough estimate */}` : "Needs adjustments"}
                    </div>
                </div>
            </div>

            {/* Launch Sandbox Button */}
            <div style={{ marginBottom: 16 }}>
                <button
                    onClick={() => { haptic.selection(); setShowSandbox(true); }}
                    className="hover-btn"
                    style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        padding: "10px",
                        borderRadius: T.radius.md,
                        background: `linear-gradient(135deg, ${T.accent.emerald}10, ${T.accent.primary}10)`,
                        border: `1px solid ${T.accent.emerald}40`,
                        color: T.accent.emerald,
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: "pointer",
                    }}
                >
                    <Sparkles size={14} />
                    Launch "What-If" Sandbox
                </button>
            </div>

            {/* Inputs */}
            <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 12 }}>

                {/* Extra Savings Slider */}
                <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <Label>Cut expenses & Save more</Label>
                        <Mono size={13} weight={800} color={T.accent.primary}>+${extraSavings}/mo</Mono>
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={5000}
                        step={100}
                        value={extraSavings}
                        onChange={e => setExtraSavings(parseFloat(e.target.value))}
                        onPointerUp={() => haptic.light()}
                        style={{
                            width: "100%", height: 6, appearance: "none", background: `linear-gradient(to right, ${T.accent.primary} ${(extraSavings / 5000) * 100}%, ${T.border.default} ${(extraSavings / 5000) * 100}%)`, borderRadius: 3, outline: "none"
                        }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                        <span style={{ fontSize: 10, color: T.text.muted }}>Current: {savingsRate.toFixed(1)}% SR</span>
                    </div>
                </div>

                {/* Compound Return Slider */}
                <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <Label>Expected Real Return (Inflation Adj.)</Label>
                        <Mono size={13} weight={800} color={T.status.blue}>{marketReturn.toFixed(1)}%</Mono>
                    </div>
                    <input
                        type="range"
                        min={1}
                        max={12}
                        step={0.5}
                        value={marketReturn}
                        onChange={e => setMarketReturn(parseFloat(e.target.value))}
                        onPointerUp={() => haptic.light()}
                        style={{
                            width: "100%", height: 6, appearance: "none", background: `linear-gradient(to right, ${T.status.blue} ${(marketReturn / 12) * 100}%, ${T.border.default} ${(marketReturn / 12) * 100}%)`, borderRadius: 3, outline: "none"
                        }}
                    />
                </div>

                {/* Withdrawal Rate Rule */}
                <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <Label>Safe Withdrawal Rate (SWR)</Label>
                        <Mono size={13} weight={800} color={T.status.amber}>{withdrawalRate.toFixed(1)}%</Mono>
                    </div>
                    <input
                        type="range"
                        min={2}
                        max={7}
                        step={0.1}
                        value={withdrawalRate}
                        onChange={e => setWithdrawalRate(parseFloat(e.target.value))}
                        onPointerUp={() => haptic.light()}
                        style={{
                            width: "100%", height: 6, appearance: "none", background: `linear-gradient(to right, ${T.status.amber} ${((withdrawalRate - 2) / 5) * 100}%, ${T.border.default} ${((withdrawalRate - 2) / 5) * 100}%)`, borderRadius: 3, outline: "none"
                        }}
                    />
                </div>

            </div>

            {/* Visualization */}
            {result.timeline.length > 1 && (
                <div style={{ background: T.bg.elevated, padding: "16px", borderRadius: T.radius.lg, border: `1px solid ${T.border.default}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.text.dim, marginBottom: 12, letterSpacing: "0.05em" }}>WEALTH GROWTH TRAJECTORY</div>

                    <div style={{ height: 100, display: "flex", alignItems: "flex-end", gap: 2, position: "relative" }}>

                        {/* Target Line Generator */}
                        <div style={{
                            position: "absolute",
                            top: "10%",
                            left: 0,
                            right: 0,
                            borderTop: `1px dashed ${T.status.green}80`,
                            zIndex: 0
                        }}>
                            <span style={{ position: "absolute", top: -14, right: 0, fontSize: 9, color: T.status.green, fontFamily: T.font.mono }}>
                                Goal: ${(result.target / 1000).toFixed(0)}k
                            </span>
                        </div>

                        {result.timeline.map((pt, i) => {
                            // Calculate height relative to target (cap at 110%)
                            const maxDisplay = result.target * 1.1;
                            const hPct = Math.min((pt.nw / maxDisplay) * 100, 100);

                            const isFirst = i === 0;
                            const isLast = i === result.timeline.length - 1;

                            return (
                                <div
                                    key={i}
                                    onPointerEnter={() => { setHoveredYear(pt.year); haptic.selection(); }}
                                    onPointerLeave={() => setHoveredYear(null)}
                                    style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", zIndex: 1, position: "relative" }}
                                >
                                    {hoveredYear === pt.year && (
                                        <div style={{
                                            position: "absolute",
                                            bottom: "100%",
                                            marginBottom: 6,
                                            background: T.bg.elevated,
                                            border: `1px solid ${T.border.default}`,
                                            padding: "4px 8px",
                                            borderRadius: 4,
                                            fontSize: 10,
                                            fontWeight: 700,
                                            color: T.text.primary,
                                            whiteSpace: "nowrap",
                                            boxShadow: T.shadow.elevated,
                                            zIndex: 10,
                                        }}>
                                            ${(pt.nw / 1000).toLocaleString("en-US", { maximumFractionDigits: 0 })}k
                                        </div>
                                    )}
                                    <div style={{
                                        width: "100%",
                                        height: `${hPct}%`,
                                        background: isLast && pt.nw >= result.target
                                            ? `linear-gradient(180deg, ${T.status.green}, ${T.status.green}40)`
                                            : hoveredYear === pt.year
                                                ? `linear-gradient(180deg, ${T.accent.emerald}, ${T.accent.emerald}60)`
                                                : `linear-gradient(180deg, ${T.accent.emerald}90, ${T.accent.emerald}30)`,
                                        borderRadius: "4px 4px 0 0",
                                        transition: "height 0.3s ease, background 0.2s"
                                    }} />
                                    {/* Show year labels for context */}
                                    {(isFirst || isLast || hoveredYear === pt.year) && (
                                        <div style={{
                                            fontSize: 9,
                                            color: hoveredYear === pt.year ? T.accent.emerald : T.text.muted,
                                            fontFamily: T.font.mono,
                                            marginTop: 4,
                                            whiteSpace: "nowrap",
                                            fontWeight: hoveredYear === pt.year ? 800 : 400
                                        }}>
                                            Y{pt.year}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {result.error && (
                <div style={{ padding: "10px", background: `${T.status.red}10`, color: T.status.red, fontSize: 11, borderRadius: T.radius.md, marginTop: 12, textAlign: "center" }}>
                    {result.error}
                </div>
            )}

        </Card>
    );
}
