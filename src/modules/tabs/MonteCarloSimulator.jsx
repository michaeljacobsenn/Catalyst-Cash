import { useState, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { TrendingUp, Clock, Info } from "lucide-react";
import { T } from "../constants.js";
import { Card, Label } from "../ui.jsx";

export default function MonteCarloSimulator({ audit, config }) {
    const [yearsAhead, setYearsAhead] = useState(10);
    const [expectedReturn, setExpectedReturn] = useState(0.08); // 8% default

    if (!config.track401k && !config.trackRoth && !config.trackBrokerage) return null;

    // Extract bases
    const form = audit?.form || {};
    const rothBase = parseFloat(form.roth || 0);
    const k401Base = parseFloat(form.k401Balance || config.k401Balance || 0);
    const brokBase = parseFloat(form.brokerage || 0);

    if (rothBase === 0 && k401Base === 0 && brokBase === 0) return null;

    // Extract annual contributions
    const rothContAnnual = config.trackRothContributions ? (config.rothAnnualLimit || 7000) : 0; // simplistic assumption for visual demo
    const k401ContAnnual = config.track401k ? (config.k401AnnualLimit || 23000) : 0;

    const chartData = useMemo(() => {
        const data = [];
        const currentYear = new Date().getFullYear();

        let rBal = rothBase;
        let kBal = k401Base;
        let bBal = brokBase;

        const volatility = 0.04; // 4% random noise for the "Monte Carlo" feel

        data.push({
            year: currentYear,
            roth: Math.round(rBal),
            k401: Math.round(kBal),
            brokerage: Math.round(bBal),
            total: Math.round(rBal + kBal + bBal)
        });

        for (let i = 1; i <= 35; i++) {
            // Apply growth + random noise
            const returnMultiplier = 1 + expectedReturn + ((Math.random() * volatility * 2) - volatility);

            rBal = (rBal + rothContAnnual) * returnMultiplier;
            kBal = (kBal + k401ContAnnual) * returnMultiplier;
            bBal = (bBal) * returnMultiplier; // assuming no auto-add to brokerage for now

            data.push({
                year: currentYear + i,
                roth: Math.round(Math.max(0, rBal)),
                k401: Math.round(Math.max(0, kBal)),
                brokerage: Math.round(Math.max(0, bBal)),
                total: Math.round(Math.max(0, rBal + kBal + bBal))
            });
        }
        return data;
    }, [rothBase, k401Base, brokBase, rothContAnnual, k401ContAnnual, expectedReturn]);

    const projectedData = chartData.slice(0, yearsAhead + 1);
    const targetYearData = projectedData[projectedData.length - 1] || chartData[0];

    return (
        <Card animate delay={320}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: `${T.status.purple}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Clock size={14} color={T.status.purple} strokeWidth={2.5} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Investment Time Machine</span>
            </div>

            <div style={{ fontSize: 11, color: T.text.secondary, marginBottom: 16 }}>
                Slide the timeline to see projected compounding growth based on your current portfolios and assumed max annual contributions.
            </div>

            {/* Total Highlight */}
            <div style={{ padding: "16px", background: `linear-gradient(135deg, ${T.status.purple}10, ${T.status.purple}00)`, border: `1px solid ${T.status.purple}20`, borderRadius: T.radius.md, marginBottom: 16, textAlign: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.status.purple, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                    Projected Total in {yearsAhead} Years
                </div>
                <div style={{ fontSize: 32, fontWeight: 900, color: T.text.primary, fontFamily: T.font.mono, letterSpacing: "-0.02em" }}>
                    ${(targetYearData.total).toLocaleString()}
                </div>
            </div>

            {/* Simulator Controls */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
                <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: T.text.primary }}>Timeline: {yearsAhead} Years</span>
                        <span style={{ fontSize: 11, color: T.text.dim }}>Year {chartData[0].year + yearsAhead}</span>
                    </div>
                    <input type="range" min="1" max="35" value={yearsAhead} onChange={e => setYearsAhead(parseInt(e.target.value))}
                        style={{ width: "100%", accentColor: T.status.purple }} />
                </div>
                <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: T.text.primary }}>Expected Return</span>
                        <span style={{ fontSize: 11, color: T.text.dim }}>{(expectedReturn * 100).toFixed(1)}%</span>
                    </div>
                    <input type="range" min="0.02" max="0.15" step="0.01" value={expectedReturn} onChange={e => setExpectedReturn(parseFloat(e.target.value))}
                        style={{ width: "100%", accentColor: T.text.dim }} />
                </div>
            </div>

            {/* Chart */}
            <Label>Projection Curve</Label>
            <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={projectedData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="mcG" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={T.status.purple} stopOpacity={0.4} />
                            <stop offset="100%" stopColor={T.status.purple} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <XAxis dataKey="year" tick={{ fontSize: 10, fill: T.text.dim, fontFamily: T.font.mono }} axisLine={false} tickLine={false} />
                    <YAxis hide domain={[0, 'auto']} />
                    <Tooltip contentStyle={{ background: T.bg.elevated, border: `1px solid ${T.border.default}`, borderRadius: T.radius.md, fontSize: 11, fontFamily: T.font.mono, boxShadow: T.shadow.elevated }}
                        formatter={(v, n) => [`$${v.toLocaleString()}`, n === 'total' ? 'Total Portfolio' : n]}
                        labelFormatter={l => `Year ${l}`} />
                    <Area type="monotone" dataKey="total" stroke={T.status.purple} strokeWidth={2} fill="url(#mcG)"
                        dot={{ fill: T.status.purple, r: 2, strokeWidth: 0 }} />
                </AreaChart>
            </ResponsiveContainer>

            {/* Breakdown Legands */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 16 }}>
                {config.track401k && <div style={{ background: T.bg.card, border: `1px solid ${T.border.default}`, borderRadius: T.radius.sm, padding: "8px" }}>
                    <div style={{ fontSize: 10, color: T.text.dim, marginBottom: 2 }}>401k</div>
                    <div style={{ fontSize: 12, fontWeight: 700, fontFamily: T.font.mono }}>
                        ${(targetYearData.k401).toLocaleString()}
                    </div>
                </div>}
                {config.trackRoth && <div style={{ background: T.bg.card, border: `1px solid ${T.border.default}`, borderRadius: T.radius.sm, padding: "8px" }}>
                    <div style={{ fontSize: 10, color: T.text.dim, marginBottom: 2 }}>Roth IRA</div>
                    <div style={{ fontSize: 12, fontWeight: 700, fontFamily: T.font.mono }}>
                        ${(targetYearData.roth).toLocaleString()}
                    </div>
                </div>}
                {config.trackBrokerage && <div style={{ background: T.bg.card, border: `1px solid ${T.border.default}`, borderRadius: T.radius.sm, padding: "8px" }}>
                    <div style={{ fontSize: 10, color: T.text.dim, marginBottom: 2 }}>Brokerage</div>
                    <div style={{ fontSize: 12, fontWeight: 700, fontFamily: T.font.mono }}>
                        ${(targetYearData.brokerage).toLocaleString()}
                    </div>
                </div>}
            </div>
        </Card>
    );
}
