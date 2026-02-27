import { T } from "../constants.js";
import { fmt } from "../utils.js";
import { Card, Label, ProgressBar } from "../ui.jsx";

export default function BudgetTab({ budgetCategories = [], budgetActuals = {}, weeklySpendAllowance = 0 }) {

    // Calculate totals
    const totalMonthlyBudget = budgetCategories.reduce((sum, cat) => sum + (cat.monthlyTarget || 0), 0);
    const totalWeeklyBudget = (totalMonthlyBudget / 4) + (weeklySpendAllowance || 0);

    // Extract actuals (which are inputted weekly)
    const totalWeeklyActuals = Object.values(budgetActuals).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
    const allowancePace = totalWeeklyActuals; // Placeholder for un-categorized / allowance spend if we had it separately, using total for now

    const isOverBudget = totalWeeklyActuals > totalWeeklyBudget;
    const progressPct = totalWeeklyBudget > 0 ? Math.min((totalWeeklyActuals / totalWeeklyBudget) * 100, 100) : 0;

    const ringColor = isOverBudget ? T.status.red : (progressPct > 85 ? T.status.amber : T.status.green);

    return (
        <div style={{ paddingBottom: 24 }}>
            {/* Hero Ring Chart */}
            <Card style={{ textAlign: "center", position: "relative", padding: "30px 20px" }}>
                <div style={{ position: "relative", width: 180, height: 180, margin: "0 auto 20px" }}>
                    {/* Background Ring */}
                    <svg width="180" height="180" viewBox="0 0 180 180" style={{ transform: "rotate(-90deg)" }}>
                        <circle cx="90" cy="90" r="80" fill="none" stroke={T.bg.surface} strokeWidth="12" />
                        {/* Progress Ring */}
                        <circle cx="90" cy="90" r="80" fill="none" stroke={ringColor} strokeWidth="12"
                            strokeDasharray={`${progressPct * 5.02} 502`} strokeLinecap="round"
                            style={{ transition: "stroke-dasharray 1s ease-out, stroke 0.5s ease" }} />
                    </svg>
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", marginTop: -4 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Spent This Week</div>
                        <div style={{ fontSize: 32, fontWeight: 800, color: T.text.primary, fontFamily: T.font.mono, letterSpacing: "-1px" }}>{fmt(totalWeeklyActuals)}</div>
                        <div style={{ fontSize: 13, color: isOverBudget ? T.status.red : T.text.secondary, marginTop: 4, fontWeight: 600 }}>
                            of {fmt(totalWeeklyBudget)} limit
                        </div>
                    </div>
                </div>

                {isOverBudget ? (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: T.status.redDim, color: T.status.red, padding: "6px 14px", borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
                        <span style={{ fontSize: 14 }}>⚠️</span> Over Budget by {fmt(totalWeeklyActuals - totalWeeklyBudget)}
                    </div>
                ) : (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: T.status.greenDim, color: T.status.green, padding: "6px 14px", borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
                        <span style={{ fontSize: 14 }}>📈</span> {fmt(totalWeeklyBudget - totalWeeklyActuals)} Remaining
                    </div>
                )}
            </Card>

            {/* Category Breakdown */}
            <Label style={{ marginTop: 14 }}>Top Categories (Weekly Pace)</Label>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {budgetCategories.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "30px 20px", background: T.bg.elevated, borderRadius: T.radius.lg, border: `1px solid ${T.border.default}` }}>
                        <span style={{ fontSize: 24, display: "block", marginBottom: 10 }}>📊</span>
                        <div style={{ fontSize: 14, color: T.text.secondary, lineHeight: 1.5 }}>You haven't set up any budget categories yet. Head to Settings → Config to add them.</div>
                    </div>
                ) : (
                    budgetCategories.map(cat => {
                        const weeklyCatTarget = (cat.monthlyTarget || 0) / 4;
                        const spent = parseFloat(budgetActuals[cat.name]) || 0;
                        const pct = weeklyCatTarget > 0 ? Math.min((spent / weeklyCatTarget) * 100, 100) : 0;
                        const isCatOver = spent > weeklyCatTarget;

                        return (
                            <Card key={cat.name} style={{ padding: "16px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                                    <div>
                                        <div style={{ fontSize: 15, fontWeight: 700, color: T.text.primary }}>{cat.name}</div>
                                        <div style={{ fontSize: 12, color: T.text.dim, marginTop: 4 }}>{fmt(weeklyCatTarget)} / week</div>
                                    </div>
                                    <div style={{ textAlign: "right" }}>
                                        <div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.font.mono, color: isCatOver ? T.status.red : T.text.primary }}>
                                            {fmt(spent)}
                                        </div>
                                        <div style={{ fontSize: 12, color: isCatOver ? T.status.red : T.text.secondary, marginTop: 4, fontWeight: 600 }}>
                                            {isCatOver ? 'Over Limit' : `${fmt(weeklyCatTarget - spent)} left`}
                                        </div>
                                    </div>
                                </div>

                                <ProgressBar
                                    progress={pct}
                                    color={isCatOver ? T.status.red : (pct > 80 ? T.status.amber : T.accent.primary)}
                                />
                            </Card>
                        );
                    })
                )}
            </div>

            {/* Weekly Allowance */}
            <Label style={{ marginTop: 14 }}>General Allowance Target</Label>
            <Card style={{ padding: "16px", borderLeft: `3px solid ${T.accent.emerald}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: T.text.primary }}>Weekly Spend Allowance</div>
                        <div style={{ fontSize: 12, color: T.text.dim, marginTop: 4 }}>For non-fixed / un-categorized expenses</div>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, fontFamily: T.font.mono, color: T.accent.emerald }}>{fmt(weeklySpendAllowance)}</div>
                </div>
            </Card>
        </div>
    );
}
