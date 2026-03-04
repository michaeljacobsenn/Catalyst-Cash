import { useRef } from "react";
import { Zap, Activity } from "lucide-react";
import { T } from "../constants.js";
import { fmt } from "../utils.js";
import { Card, Label } from "../ui.jsx";
import { Mono } from "../components.jsx";
import BudgetTab from "../tabs/BudgetTab.jsx";
import CashFlowCalendar from "../tabs/CashFlowCalendar.jsx";
import { haptic } from "../haptics.js";
import { useSettings } from "../contexts/SettingsContext.jsx";
import { usePortfolio } from "../contexts/PortfolioContext.jsx";
import { useNavigation } from "../contexts/NavigationContext.jsx";

/**
 * EmptyDashboard — Rendered when no audit exists. Includes view toggle,
 * setup prompts, live summary, investment snapshot, and restore button.
 */
export default function EmptyDashboard({
    investmentSnapshot, viewMode, setViewMode,
    onRestore, onDemoAudit
}) {
    const { financialConfig, setFinancialConfig } = useSettings();
    const { cards, renewals } = usePortfolio();
    const { navTo, setSetupReturnTab } = useNavigation();
    const restoreInputRef = useRef(null);

    const onRunAudit = () => navTo("input");
    const onGoSettings = () => { setSetupReturnTab("dashboard"); navTo("settings"); };
    const onGoCards = () => { setSetupReturnTab("dashboard"); navTo("cards"); };
    const onGoRenewals = () => { setSetupReturnTab("dashboard"); navTo("renewals"); };

    const needsCards = cards.length === 0;
    const needsRenewals = (renewals || []).length === 0;
    const needsSetup = needsCards || needsRenewals;

    return <div className="page-body" style={{ paddingBottom: 20, display: "flex", flexDirection: "column", minHeight: "100%" }}>

        {/* View Toggle (Always Visible as requested) */}
        <div style={{ display: "flex", background: T.bg.elevated, padding: 4, borderRadius: T.radius.lg, marginBottom: 16, border: `1px solid ${T.border.subtle} ` }}>
            {[{ id: "command", label: "Command Center" }, { id: "budget", label: "Weekly Budget" }, { id: "results", label: "Results" }].map(v => (
                <button key={v.id} className="a11y-hit-target" onClick={() => { haptic.selection(); setViewMode(v.id); }} style={{
                    flex: 1, padding: "8px 12px", border: "none", borderRadius: T.radius.md,
                    background: viewMode === v.id ? T.bg.card : "transparent",
                    color: viewMode === v.id ? T.text.primary : T.text.dim,
                    fontSize: 12, fontWeight: 700, cursor: "pointer", lineHeight: 1.3,
                    boxShadow: viewMode === v.id ? T.shadow.navBtn : "none",
                    transition: "all .2s ease"
                }}>{v.label}</button>
            ))}
        </div>

        {viewMode === "budget" ? (
            <BudgetTab
                budgetCategories={financialConfig?.budgetCategories || []}
                budgetActuals={{}}
                weeklySpendAllowance={financialConfig?.weeklySpendAllowance || 0}
                financialConfig={financialConfig}
                setFinancialConfig={setFinancialConfig}
                incomeSources={financialConfig?.incomeSources || []}
            />
        ) : viewMode === "results" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Card animate style={{ textAlign: "center", padding: 32 }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
                    <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>No Audit Results Yet</p>
                    <p style={{ fontSize: 12, color: T.text.secondary, marginBottom: 16 }}>Run your first audit to see results here</p>
                    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                        <button onClick={onRunAudit} className="hover-btn" style={{
                            padding: "12px 20px", borderRadius: T.radius.md, border: "none",
                            background: T.accent.gradient, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer"
                        }}>Start Audit</button>
                        <button onClick={onDemoAudit} className="hover-btn" style={{
                            padding: "12px 20px", borderRadius: T.radius.md, border: `1px solid ${T.accent.emerald}40`,
                            background: `${T.accent.emerald}10`, color: T.accent.emerald, fontSize: 13, fontWeight: 700, cursor: "pointer"
                        }}>Try Demo ✨</button>
                    </div>
                </Card>
                <button onClick={() => { haptic.light(); navTo("history"); }} className="hover-btn" style={{
                    width: "100%", padding: "16px", borderRadius: T.radius.lg,
                    border: `1px solid ${T.border.subtle}`, background: T.bg.elevated,
                    color: T.text.primary, fontSize: 14, fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8
                }}><Activity size={16} /> View Audit History</button>
            </div>
        ) : (
            <>
                <div style={{ textAlign: "center", paddingTop: 14, paddingBottom: 18, animation: "fadeInUp .6s ease-out both" }}>
                    <img src="/icon-192.png" alt="Catalyst Cash" style={{
                        width: 80, height: 80, borderRadius: 20, margin: "0 auto 14px", display: "block",
                        filter: `drop-shadow(0 4px 20px ${T.accent.primary}30)`
                    }} />
                    <h1 style={{ fontSize: 20, fontWeight: 900, marginBottom: 6, fontFamily: T.font.sans }}>Catalyst Cash</h1>
                    <p style={{ fontSize: 11, color: T.text.secondary, fontFamily: T.font.mono, fontWeight: 600, letterSpacing: "0.05em" }}>DEBT • SAVING • INVESTING • AUTOMATION</p>
                </div>

                {/* Guided First Audit Checklist */}
                <Card animate delay={80} variant="glass" style={{
                    padding: "20px 18px", marginTop: 12,
                    border: `1px solid ${T.accent.emerald}30`, position: "relative", overflow: "hidden"
                }}>
                    <div style={{ position: "absolute", top: -50, left: -50, right: -50, height: 100, background: `radial-gradient(ellipse at top, ${T.accent.emerald}20, transparent 60%)`, pointerEvents: "none" }} />
                    <div style={{ fontSize: 11, fontWeight: 800, color: T.text.secondary, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14, position: "relative" }}>
                        🚀 Your First Audit
                    </div>
                    {[
                        { done: true, label: "Setup complete", sub: "Profile configured" },
                        { done: false, label: "Run your first audit", sub: "2 min — enter this week's numbers", action: true },
                        { done: false, label: "Review your results", sub: "Health score, strategy & next action" },
                    ].map((step, i) => (
                        <div key={i} style={{
                            display: "flex", alignItems: "flex-start", gap: 12,
                            marginBottom: i < 2 ? 12 : 0, position: "relative",
                        }}>
                            <div style={{
                                width: 24, height: 24, borderRadius: 12, flexShrink: 0,
                                background: step.done ? T.accent.emerald : T.bg.elevated,
                                border: `2px solid ${step.done ? T.accent.emerald : T.border.default}`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                transition: "all 0.3s",
                            }}>
                                {step.done && <span style={{ color: "#fff", fontSize: 12, fontWeight: 800 }}>✓</span>}
                                {!step.done && <span style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, fontFamily: T.font.mono }}>{i + 1}</span>}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: step.done ? T.text.dim : T.text.primary, textDecoration: step.done ? "line-through" : "none" }}>{step.label}</div>
                                <div style={{ fontSize: 11, color: T.text.dim, lineHeight: 1.3 }}>{step.sub}</div>
                                {step.action && (
                                    <button onClick={onRunAudit} className="hover-btn" style={{
                                        marginTop: 8, padding: "10px 20px", borderRadius: T.radius.md, border: "none",
                                        background: T.accent.emerald, color: "#fff", fontSize: 13, fontWeight: 800,
                                        cursor: "pointer", boxShadow: `0 4px 12px ${T.accent.emerald}40`,
                                        display: "inline-flex", alignItems: "center", gap: 6,
                                    }}>
                                        <Zap size={14} strokeWidth={2.5} /> Start First Audit
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </Card>

                <Card animate delay={160} style={{ textAlign: "center", padding: 16, marginTop: 8 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Just exploring?</p>
                    <p style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.5, marginBottom: 12 }}>Try a demo audit with sample data — no setup needed</p>
                    <button onClick={onDemoAudit} className="hover-btn" style={{
                        padding: "12px 28px", borderRadius: T.radius.md, border: `1px solid ${T.accent.primary}40`,
                        background: T.accent.primaryDim, color: T.accent.primary, fontSize: 13, fontWeight: 700, cursor: "pointer"
                    }}>Try Demo Audit ✨</button>
                </Card>

                <Card style={{ marginTop: 8 }}>
                    <Label>{needsSetup ? "Complete Your Setup" : "Quick Links"}</Label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                        <button onClick={onGoSettings} className="hover-btn" style={{
                            padding: "14px 16px", borderRadius: T.radius.md,
                            border: `1px solid ${T.border.subtle}`, borderLeft: `3px solid ${T.accent.primary}`,
                            background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontWeight: 700,
                            cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center",
                            justifyContent: "space-between"
                        }}>
                            <span>⚙️  Adjust Your Settings</span>
                            <span style={{ fontSize: 14, color: T.text.muted }}>›</span>
                        </button>
                        {needsCards && <button onClick={onGoCards} className="hover-btn" style={{
                            padding: "14px 16px", borderRadius: T.radius.md,
                            border: `1px solid ${T.border.subtle}`, borderLeft: `3px solid ${T.status.blue}`,
                            background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontWeight: 700,
                            cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center",
                            justifyContent: "space-between"
                        }}>
                            <span>💳  Add Credit Cards</span>
                            <span style={{ fontSize: 14, color: T.text.muted }}>›</span>
                        </button>}
                        {needsRenewals && <button onClick={onGoRenewals} className="hover-btn" style={{
                            padding: "14px 16px", borderRadius: T.radius.md,
                            border: `1px solid ${T.border.subtle}`, borderLeft: `3px solid ${T.accent.emerald}`,
                            background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontWeight: 700,
                            cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center",
                            justifyContent: "space-between"
                        }}>
                            <span>📋  Add Renewals & Bills</span>
                            <span style={{ fontSize: 14, color: T.text.muted }}>›</span>
                        </button>}
                    </div>
                </Card>

                {(cards.length > 0 || (renewals || []).length > 0 || financialConfig?.enableHoldings) && (
                    <Card style={{ marginTop: 8 }}>
                        <Label>Live Summary</Label>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            {cards.length > 0 && (
                                <div style={{ padding: "10px 12px", background: T.bg.elevated, borderRadius: T.radius.md, border: `1px solid ${T.border.subtle} ` }}>
                                    <div style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 700 }}>CARDS</div>
                                    <div style={{ fontSize: 18, fontWeight: 800, color: T.text.primary }}>{cards.length}</div>
                                    <div style={{ fontSize: 10, color: T.text.muted }}>{fmt(cards.reduce((s, c) => s + (c.limit || 0), 0))} total limit</div>
                                </div>
                            )}
                            {(renewals || []).length > 0 && (
                                <div style={{ padding: "10px 12px", background: T.bg.elevated, borderRadius: T.radius.md, border: `1px solid ${T.border.subtle} ` }}>
                                    <div style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 700 }}>BILLS/SUBS</div>
                                    <div style={{ fontSize: 18, fontWeight: 800, color: T.text.primary }}>{renewals.length}</div>
                                    <div style={{ fontSize: 10, color: T.text.muted }}>{fmt(renewals.reduce((s, r) => {
                                        const amt = r.amount || 0;
                                        const int = r.interval || 1;
                                        const unit = r.intervalUnit || "months";
                                        if (unit === "days") return s + (amt / int) * 30.44;
                                        if (unit === "weeks") return s + (amt / int) * 4.33;
                                        if (unit === "months") return s + amt / int;
                                        if (unit === "years") return s + amt / (int * 12);
                                        if (unit === "one-time") return s;
                                        return s + amt;
                                    }, 0))}/mo est.</div>
                                </div>
                            )}
                        </div>
                    </Card>
                )}

                {/* Investment Snapshot (pre-audit) */}
                {investmentSnapshot.accounts.length > 0 && (
                    <Card style={{ marginTop: 8 }}>
                        <Label>Investment Portfolio</Label>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {investmentSnapshot.accounts.map(a => (
                                <div key={a.key} style={{
                                    display: "flex", alignItems: "center", justifyContent: "space-between",
                                    padding: "10px 12px", background: T.bg.elevated, borderRadius: T.radius.md,
                                    border: `1px solid ${T.border.subtle}`
                                }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <div style={{ width: 6, height: 6, borderRadius: 3, background: a.color, flexShrink: 0 }} />
                                        <span style={{ fontSize: 12, fontWeight: 700, color: T.text.primary }}>{a.label}</span>
                                        {a.count > 0 && <span style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono }}>{a.count} holding{a.count !== 1 ? "s" : ""}</span>}
                                    </div>
                                    <Mono size={13} weight={800} color={a.total > 0 ? a.color : T.text.muted}>{a.total > 0 ? fmt(Math.round(a.total)) : "—"}</Mono>
                                </div>
                            ))}
                            {investmentSnapshot.accounts.length > 1 && (
                                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderTop: `1px solid ${T.border.subtle}` }}>
                                    <span style={{ fontSize: 11, fontWeight: 800, color: T.text.secondary, fontFamily: T.font.mono, letterSpacing: "0.04em" }}>TOTAL PORTFOLIO</span>
                                    <Mono size={14} weight={900} color={T.accent.emerald}>{fmt(Math.round(investmentSnapshot.total))}</Mono>
                                </div>
                            )}
                        </div>
                    </Card>
                )}

                {financialConfig?.lastCheckingBalance != null && (
                    <CashFlowCalendar config={financialConfig} cards={cards} renewals={renewals} checkingBalance={financialConfig.lastCheckingBalance} />
                )}

                <div style={{ marginTop: "auto", paddingTop: 24, textAlign: "center" }}>
                    <input ref={restoreInputRef} type="file" accept=".json" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; onRestore?.(f); }}
                        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }} />
                    <button onClick={() => restoreInputRef.current?.click()} style={{
                        background: "none", border: "none", color: T.text.dim, fontSize: 11, fontWeight: 600,
                        textDecoration: "underline", cursor: "pointer", padding: "8px 16px"
                    }}>Restore from Backup</button>
                </div>
            </>
        )}
    </div>;
}
