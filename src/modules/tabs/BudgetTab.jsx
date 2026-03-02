import { useState } from "react";
import { Plus, Pencil, Check, Trash2, DollarSign, Briefcase, Target, Activity, TrendingDown, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import { T } from "../constants.js";
import { fmt } from "../utils.js";
import { Card, Label, ProgressBar } from "../ui.jsx";
import { haptic } from "../haptics.js";

export default function BudgetTab({ budgetCategories = [], budgetActuals = {}, weeklySpendAllowance = 0, financialConfig, setFinancialConfig, incomeSources = [] }) {

    const [editingBudget, setEditingBudget] = useState(false);
    const [editingIncome, setEditingIncome] = useState(false);

    // Calculate totals (CFO Standardized Annualized Math)
    const totalMonthlyBudget = budgetCategories.reduce((sum, cat) => sum + (cat.monthlyTarget || 0), 0);
    const now = new Date();
    const weeksInMonth = 52.14 / 12; // Standard 4.345 weeks/mo for consistent burn rate
    const totalWeeklyBudget = (totalMonthlyBudget / weeksInMonth) + (weeklySpendAllowance || 0);
    const totalWeeklyActuals = Object.values(budgetActuals).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
    const isOverBudget = totalWeeklyActuals > totalWeeklyBudget;
    const progressPct = totalWeeklyBudget > 0 ? Math.min((totalWeeklyActuals / totalWeeklyBudget) * 100, 100) : 0;
    const ringColor = isOverBudget ? T.status.red : (progressPct > 85 ? T.status.amber : T.status.green);

    // Pacing logic: Monday = 1, Sunday = 7
    const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
    const expectedPacePct = (dayOfWeek / 7) * 100;
    const isRunningHot = !isOverBudget && progressPct > expectedPacePct + 5;
    const isUnderPace = !isOverBudget && progressPct < expectedPacePct - 5;

    // Income totals
    const totalMonthlyIncome = incomeSources.reduce((sum, s) => {
        const amt = s.amount || 0;
        if (s.frequency === "weekly") return sum + amt * weeksInMonth;
        if (s.frequency === "bi-weekly") return sum + amt * 2.17;
        return sum + amt;
    }, 0);

    // Budget management helpers
    const addCategory = () => {
        haptic.light();
        setEditingBudget(true);
        setFinancialConfig({ ...financialConfig, budgetCategories: [...budgetCategories, { name: "", monthlyTarget: 0 }] });
    };
    const updateCategory = (i, k, v) => {
        const arr = [...budgetCategories]; arr[i] = { ...arr[i], [k]: v };
        setFinancialConfig({ ...financialConfig, budgetCategories: arr });
    };
    const removeCategory = (i) => {
        haptic.medium();
        setFinancialConfig({ ...financialConfig, budgetCategories: budgetCategories.filter((_, j) => j !== i) });
    };

    // Income management helpers
    const addIncome = () => {
        haptic.light();
        setEditingIncome(true);
        setFinancialConfig({ ...financialConfig, incomeSources: [...incomeSources, { name: "", amount: 0, frequency: "monthly", type: "other" }] });
    };
    const updateIncome = (i, k, v) => {
        const arr = [...incomeSources]; arr[i] = { ...arr[i], [k]: v };
        setFinancialConfig({ ...financialConfig, incomeSources: arr });
    };
    const removeIncome = (i) => {
        haptic.medium();
        setFinancialConfig({ ...financialConfig, incomeSources: incomeSources.filter((_, j) => j !== i) });
    };

    const inputStyle = { padding: "8px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 11, boxSizing: "border-box" };
    const dollarInputStyle = { ...inputStyle, paddingLeft: 20, width: "100%" };
    const rmBtnStyle = { width: 30, height: 30, borderRadius: T.radius.sm, border: "none", background: T.status.redDim, color: T.status.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };

    return (
        <div style={{ paddingBottom: 24 }}>
            {/* ═══ Hero Ring Chart (CFO Enhanced) ═══ */}
            <Card animate variant="glass" style={{ textAlign: "center", position: "relative", padding: "40px 20px 32px", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: -40, left: "50%", transform: "translateX(-50%)", width: 240, height: 240, background: ringColor, filter: "blur(90px)", opacity: 0.15, borderRadius: "50%", pointerEvents: "none", transition: "background 1s ease" }} />

                <div style={{ position: "relative", width: 200, height: 200, margin: "0 auto 24px" }}>
                    {/* SVG Filters for Glow */}
                    <svg width="200" height="200" viewBox="0 0 200 200" style={{ transform: "rotate(-90deg)", position: "absolute", inset: 0 }}>
                        <defs>
                            <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                                <feGaussianBlur stdDeviation="6" result="blur" />
                                <feComposite in="SourceGraphic" in2="blur" operator="over" />
                            </filter>
                        </defs>
                        <circle cx="100" cy="100" r="86" fill="none" stroke={`${T.bg.surface}80`} strokeWidth="16" />
                        <circle cx="100" cy="100" r="86" fill="none" stroke={ringColor} strokeWidth="16"
                            strokeDasharray={`${progressPct * 5.4} 540`} strokeLinecap="round" filter="url(#neonGlow)"
                            style={{ transition: "stroke-dasharray 1s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.5s ease" }} />
                    </svg>

                    {/* Inner Content */}
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", marginTop: -2 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Weekly Spend</div>
                        <div style={{ fontSize: 38, fontWeight: 800, color: T.text.primary, fontFamily: T.font.mono, letterSpacing: "-1.5px", fontVariantNumeric: "tabular-nums" }}>{fmt(totalWeeklyActuals)}</div>
                        <div style={{ fontSize: 12, color: T.text.secondary, marginTop: 6, fontWeight: 600, background: `${T.bg.surface}80`, padding: "4px 10px", borderRadius: 99, border: `1px solid ${T.border.subtle}` }}>
                            Limit: {fmt(totalWeeklyBudget)}
                        </div>
                    </div>
                </div>

                {/* Status Pills */}
                {isOverBudget ? (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: T.status.redDim, color: T.status.red, border: `1px solid ${T.status.red}40`, padding: "8px 16px", borderRadius: 99, fontSize: 13, fontWeight: 700, boxShadow: `0 4px 12px ${T.status.red}20` }}>
                        <AlertTriangle size={16} strokeWidth={2.5} /> Over Budget by {fmt(totalWeeklyActuals - totalWeeklyBudget)}
                    </div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: T.status.greenDim, color: T.status.green, border: `1px solid ${T.status.green}40`, padding: "8px 16px", borderRadius: 99, fontSize: 13, fontWeight: 800, letterSpacing: "-0.02em", boxShadow: `0 4px 12px ${T.status.green}20` }}>
                            <CheckCircle2 size={16} strokeWidth={2.5} /> {fmt(totalWeeklyBudget - totalWeeklyActuals)} Remaining
                        </div>
                        {/* Pacing Indicator */}
                        {isRunningHot && <div style={{ fontSize: 11, color: T.status.amber, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}><TrendingUp size={12} /> Running hotter than daily pace</div>}
                        {isUnderPace && <div style={{ fontSize: 11, color: T.status.blue, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}><TrendingDown size={12} /> Spending slower than daily pace</div>}
                        {!isRunningHot && !isUnderPace && totalWeeklyBudget > 0 && <div style={{ fontSize: 11, color: T.text.dim, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}><Activity size={12} /> Spending is perfectly on pace</div>}
                    </div>
                )}
            </Card>

            {/* ═══ Category Breakdown ═══ */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, marginBottom: 8 }}>
                <Label style={{ margin: 0 }}>Budget Categories</Label>
                {budgetCategories.length > 0 && <button onClick={() => setEditingBudget(!editingBudget)} style={{
                    padding: "4px 10px", borderRadius: T.radius.sm, border: `1px solid ${editingBudget ? T.accent.primary : T.border.default}`,
                    background: editingBudget ? T.accent.primaryDim : "transparent", color: editingBudget ? T.accent.primary : T.text.dim,
                    fontSize: 10, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4
                }}>
                    {editingBudget ? <><Check size={10} /> Done</> : <><Pencil size={10} /> Edit</>}
                </button>}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {budgetCategories.length === 0 && !editingBudget ? (
                    <div className="shimmer-bg" style={{ textAlign: "center", padding: "40px 20px", borderRadius: T.radius.lg, border: `1px dashed ${T.border.subtle}`, background: T.bg.elevated, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
                        <div style={{ width: 48, height: 48, borderRadius: "50%", background: T.accent.gradient, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 8px 24px ${T.accent.emerald}40` }}>
                            <Target size={24} color="#FFF" strokeWidth={2} />
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: T.text.primary, marginBottom: 6 }}>Initialize Lean Budget</div>
                        <div style={{ fontSize: 13, color: T.text.secondary, lineHeight: 1.5, marginBottom: 20, maxWidth: 280, margin: "0 auto 20px" }}>Set exact monthly spending targets. The V2 agent will auto-convert them into strict weekly limits for precision tracking, regardless of the month's length.</div>
                        <button onClick={addCategory} className="hover-btn" style={{
                            padding: "12px 24px", borderRadius: T.radius.md, border: "none",
                            background: T.accent.gradient, color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer",
                            boxShadow: `0 4px 16px ${T.accent.emerald}40`, letterSpacing: "0.02em"
                        }}>
                            <Plus size={14} style={{ marginRight: 6, verticalAlign: -2 }} /> Build First Target
                        </button>
                    </div>
                ) : editingBudget ? (
                    <Card animate variant="elevated" style={{ padding: 16 }}>
                        {budgetCategories.map((cat, i) => (
                            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
                                <input value={cat.name || ""} onChange={e => updateCategory(i, "name", e.target.value)}
                                    placeholder="Category name" style={{ ...inputStyle, flex: 1 }} />
                                <div style={{ position: "relative", flex: 0.5 }}>
                                    <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 11, fontWeight: 600 }}>$</span>
                                    <input type="number" inputMode="decimal" value={cat.monthlyTarget || ""} onChange={e => updateCategory(i, "monthlyTarget", parseFloat(e.target.value) || 0)}
                                        placeholder="/mo" style={dollarInputStyle} />
                                </div>
                                <button onClick={() => removeCategory(i)} style={rmBtnStyle}><Trash2 size={12} /></button>
                            </div>
                        ))}
                        <button onClick={addCategory} style={{
                            padding: "8px 14px", borderRadius: T.radius.md, border: `1px dashed ${T.border.default}`,
                            background: "transparent", color: T.accent.primary, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: T.font.mono, width: "100%"
                        }}>+ ADD CATEGORY</button>
                    </Card>
                ) : (
                    budgetCategories.map((cat, i) => {
                        const weeklyCatTarget = (cat.monthlyTarget || 0) / weeksInMonth;
                        const spent = parseFloat(budgetActuals[cat.name]) || 0;
                        const pct = weeklyCatTarget > 0 ? Math.min((spent / weeklyCatTarget) * 100, 100) : 0;
                        const isCatOver = spent > weeklyCatTarget;

                        return (
                            <Card key={cat.name} animate delay={Math.min(i * 50, 300)} variant="glass" className="hover-card" style={{ padding: "16px", position: "relative", overflow: "hidden" }}>
                                <div style={{ position: "absolute", right: -30, top: -30, width: 80, height: 80, background: isCatOver ? T.status.red : (pct > 80 ? T.status.amber : T.accent.primary), filter: "blur(40px)", opacity: 0.1, borderRadius: "50%", pointerEvents: "none" }} />
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
                                            {isCatOver ? "Over Limit" : `${fmt(weeklyCatTarget - spent)} left`}
                                        </div>
                                    </div>
                                </div>
                                <ProgressBar progress={pct} color={isCatOver ? T.status.red : (pct > 80 ? T.status.amber : T.accent.primary)} />
                            </Card>
                        );
                    })
                )}
            </div>

            {/* ═══ Weekly Allowance ═══ */}
            <Label style={{ marginTop: 14 }}>General Allowance Target</Label>
            <Card animate variant="glass" className="hover-card" style={{ padding: "16px", position: "relative", overflow: "hidden", borderLeft: `3px solid ${T.accent.emerald}` }}>
                <div style={{ position: "absolute", right: -20, bottom: -20, width: 100, height: 100, background: T.accent.emerald, filter: "blur(50px)", opacity: 0.12, borderRadius: "50%", pointerEvents: "none" }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: T.text.primary }}>Weekly Spend Allowance</div>
                        <div style={{ fontSize: 12, color: T.text.dim, marginTop: 4 }}>For non-fixed / un-categorized expenses</div>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, fontFamily: T.font.mono, color: T.accent.emerald }}>{fmt(weeklySpendAllowance)}</div>
                </div>
            </Card>

            {/* ═══ Income Sources ═══ */}
            {financialConfig && setFinancialConfig && <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20, marginBottom: 8 }}>
                    <Label style={{ margin: 0 }}>Income Sources</Label>
                    {incomeSources.length > 0 && <button onClick={() => setEditingIncome(!editingIncome)} style={{
                        padding: "4px 10px", borderRadius: T.radius.sm, border: `1px solid ${editingIncome ? T.accent.primary : T.border.default}`,
                        background: editingIncome ? T.accent.primaryDim : "transparent", color: editingIncome ? T.accent.primary : T.text.dim,
                        fontSize: 10, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4
                    }}>
                        {editingIncome ? <><Check size={10} /> Done</> : <><Pencil size={10} /> Edit</>}
                    </button>}
                </div>

                {incomeSources.length === 0 && !editingIncome ? (
                    <div className="shimmer-bg" style={{ textAlign: "center", padding: "24px 20px", borderRadius: T.radius.lg, border: `1px dashed ${T.border.subtle}`, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
                        <Briefcase size={24} color={T.text.dim} style={{ marginBottom: 8 }} />
                        <div style={{ fontSize: 13, color: T.text.secondary, lineHeight: 1.5, marginBottom: 12 }}>Track freelance, side-gig, or other income beyond your primary paycheck.</div>
                        <button onClick={addIncome} style={{
                            padding: "8px 20px", borderRadius: T.radius.md, border: "none",
                            background: T.accent.gradient, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer"
                        }}>
                            <Plus size={12} style={{ marginRight: 4, verticalAlign: -2 }} /> Add Income Source
                        </button>
                    </div>
                ) : editingIncome ? (
                    <Card animate variant="elevated" style={{ padding: 16 }}>
                        {incomeSources.map((src, i) => (
                            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
                                <input value={src.name || ""} onChange={e => updateIncome(i, "name", e.target.value)}
                                    placeholder="Source name" style={{ ...inputStyle, flex: 1 }} />
                                <div style={{ position: "relative", flex: 0.6 }}>
                                    <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 11, fontWeight: 600 }}>$</span>
                                    <input type="number" inputMode="decimal" value={src.amount || ""} onChange={e => updateIncome(i, "amount", parseFloat(e.target.value) || 0)}
                                        placeholder="Amount" style={dollarInputStyle} />
                                </div>
                                <select value={src.frequency || "monthly"} onChange={e => updateIncome(i, "frequency", e.target.value)}
                                    style={{ ...inputStyle, flex: 0.5, fontSize: 10 }}>
                                    {["weekly", "bi-weekly", "monthly", "irregular"].map(f => <option key={f} value={f}>{f}</option>)}
                                </select>
                                <button onClick={() => removeIncome(i)} style={rmBtnStyle}><Trash2 size={12} /></button>
                            </div>
                        ))}
                        <button onClick={addIncome} style={{
                            padding: "8px 14px", borderRadius: T.radius.md, border: `1px dashed ${T.border.default}`,
                            background: "transparent", color: T.accent.primary, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: T.font.mono, width: "100%"
                        }}>+ ADD SOURCE</button>
                    </Card>
                ) : (
                    <Card animate variant="glass" style={{ padding: 0, overflow: "hidden" }}>
                        {incomeSources.map((src, i) => (
                            <div key={i} style={{ padding: "12px 16px", borderBottom: i < incomeSources.length - 1 ? `1px solid ${T.border.subtle}` : "none", display: "flex", justifyContent: "space-between", alignItems: "center", animation: `fadeInUp .3s ease-out ${i * 0.05}s both` }}>
                                <div>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text.primary }}>{src.name || "Unnamed"}</div>
                                    <div style={{ fontSize: 10, color: T.text.muted, fontFamily: T.font.mono, textTransform: "uppercase", marginTop: 2 }}>{src.frequency || "monthly"}</div>
                                </div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: T.status.green, fontFamily: T.font.mono }}>
                                    +{fmt(src.amount || 0)}
                                </div>
                            </div>
                        ))}
                        {totalMonthlyIncome > 0 && (
                            <div style={{ padding: "10px 16px", background: T.bg.elevated, borderTop: `1px solid ${T.border.subtle}`, display: "flex", justifyContent: "space-between" }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: T.text.dim }}>TOTAL (Monthly)</span>
                                <span style={{ fontSize: 13, fontWeight: 800, color: T.status.green, fontFamily: T.font.mono }}>{fmt(totalMonthlyIncome)}</span>
                            </div>
                        )}
                    </Card>
                )}
            </>}
        </div>
    );
}
