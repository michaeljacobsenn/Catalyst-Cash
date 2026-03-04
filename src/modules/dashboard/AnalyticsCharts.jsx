import { useState } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import { T } from "../constants.js";
import { fmt } from "../utils.js";
import { Card, Label } from "../ui.jsx";
import { haptic } from "../haptics.js";
import ErrorBoundary from "../ErrorBoundary.jsx";

/**
 * AnalyticsCharts — Tabbed Recharts section with Net Worth, Health, and Spending charts.
 * Self-contained with its own useState for active tab.
 */
export default function AnalyticsCharts({ chartData, scoreData, spendData, chartA11y }) {
    const [chartTab, setChartTab] = useState("networth");

    if ((chartData?.length || 0) <= 1 && (scoreData?.length || 0) <= 1 && (spendData?.length || 0) <= 1) return null;

    return (
        <ErrorBoundary name="Analytics Charts">
            <Card animate delay={200} style={{ background: T.bg.card, border: `1px solid ${T.border.subtle}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <Label style={{ margin: 0 }}>Analytics</Label>
                    <div role="tablist" aria-label="Analytics chart type" style={{ display: "flex", gap: 6, background: T.bg.elevated, padding: 4, borderRadius: 20, border: `1px solid ${T.border.subtle}` }}>
                        {[
                            { id: "networth", label: "Net Worth", show: chartData.length > 1 },
                            { id: "health", label: "Health", show: scoreData.length > 1 },
                            { id: "spending", label: "Spending", show: spendData.length > 1 },
                        ].filter(t => t.show).map(tab => <button key={tab.id}
                            role="tab"
                            aria-selected={chartTab === tab.id}
                            className={`chart-tab a11y-hit-target ${chartTab === tab.id ? "chart-tab-active" : "chart-tab-inactive"}`}
                            onClick={() => { haptic.selection(); setChartTab(tab.id); }}
                        >{tab.label}</button>)}
                    </div>
                </div>

                {chartTab === "networth" && chartData.length > 1 && <div
                    key="chart-networth" role="img"
                    aria-label={chartA11y.netWorthLabel}
                    aria-describedby="networth-chart-hint"
                    style={{ animation: "fadeInUp .3s ease-out both" }}
                >
                    <span id="networth-chart-hint" className="sr-only">{chartA11y.netWorthHint}</span>
                    <ResponsiveContainer width="100%" height={160} aria-hidden="true">
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                            <defs>
                                <linearGradient id="nwG" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={T.accent.primary} stopOpacity={0.3} />
                                    <stop offset="100%" stopColor={T.accent.primary} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: T.text.dim, fontFamily: T.font.mono }} axisLine={false} tickLine={false} />
                            <YAxis hide domain={["dataMin-200", "dataMax+200"]} />
                            <Tooltip contentStyle={{ background: T.bg.elevated, border: `1px solid ${T.border.default}`, borderRadius: T.radius.md, fontSize: 11, fontFamily: T.font.mono, boxShadow: T.shadow.elevated }}
                                formatter={v => [fmt(v), "Net Worth"]} />
                            <Area type="monotone" dataKey="nw" stroke={T.accent.primary} strokeWidth={2.5} fill="url(#nwG)" baseValue="dataMin"
                                dot={{ fill: T.accent.primary, r: 3, strokeWidth: 0 }}
                                activeDot={{ r: 5, fill: T.accent.primary, stroke: "#fff", strokeWidth: 2 }} />
                        </AreaChart>
                    </ResponsiveContainer></div>}

                {chartTab === "health" && scoreData.length > 1 && <div
                    key="chart-health" role="img"
                    aria-label={chartA11y.healthLabel}
                    aria-describedby="health-chart-hint"
                    style={{ animation: "fadeInUp .3s ease-out both" }}
                >
                    <span id="health-chart-hint" className="sr-only">{chartA11y.healthHint}</span>
                    <ResponsiveContainer width="100%" height={160} aria-hidden="true">
                        <AreaChart data={scoreData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                            <defs>
                                <linearGradient id="hsG" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={T.status.green} stopOpacity={0.3} />
                                    <stop offset="100%" stopColor={T.status.green} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: T.text.dim, fontFamily: T.font.mono }} axisLine={false} tickLine={false} />
                            <YAxis hide domain={[0, 100]} />
                            <Tooltip contentStyle={{ background: T.bg.elevated, border: `1px solid ${T.border.default}`, borderRadius: T.radius.md, fontSize: 11, fontFamily: T.font.mono, boxShadow: T.shadow.elevated }}
                                formatter={(v, n, props) => [`${v} /100 (${props.payload.grade})`, "Health Score"]} />
                            <Area type="monotone" dataKey="score" stroke={T.status.green} strokeWidth={2.5} fill="url(#hsG)"
                                dot={{ fill: T.status.green, r: 3, strokeWidth: 0 }}
                                activeDot={{ r: 5, fill: T.status.green, stroke: "#fff", strokeWidth: 2 }} />
                        </AreaChart>
                    </ResponsiveContainer></div>}

                {chartTab === "spending" && spendData.length > 1 && <div
                    key="chart-spending" role="img"
                    aria-label={chartA11y.spendingLabel}
                    aria-describedby="spending-chart-hint"
                    style={{ animation: "fadeInUp .3s ease-out both" }}
                >
                    <span id="spending-chart-hint" className="sr-only">{chartA11y.spendingHint}</span>
                    <ResponsiveContainer width="100%" height={160} aria-hidden="true">
                        <AreaChart data={spendData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                            <defs>
                                <linearGradient id="spG" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={T.status.amber} stopOpacity={0.3} />
                                    <stop offset="100%" stopColor={T.status.amber} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: T.text.dim, fontFamily: T.font.mono }} axisLine={false} tickLine={false} />
                            <YAxis hide domain={[0, "auto"]} />
                            <Tooltip contentStyle={{ background: T.bg.elevated, border: `1px solid ${T.border.default}`, borderRadius: T.radius.md, fontSize: 11, fontFamily: T.font.mono, boxShadow: T.shadow.elevated }}
                                formatter={v => [fmt(v), "Weekly Spend"]} />
                            <Area type="monotone" dataKey="spent" stroke={T.status.amber} strokeWidth={2.5} fill="url(#spG)"
                                dot={{ fill: T.status.amber, r: 3, strokeWidth: 0 }}
                                activeDot={{ r: 5, fill: T.status.amber, stroke: "#fff", strokeWidth: 2 }} />
                        </AreaChart>
                    </ResponsiveContainer></div>}
            </Card>
        </ErrorBoundary>
    );
}
