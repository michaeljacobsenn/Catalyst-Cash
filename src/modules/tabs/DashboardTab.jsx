import { useMemo, useRef, useState, useEffect, memo } from "react";
import Confetti from "react-confetti";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Shield, Zap, Target, Activity, Download, ExternalLink, ArrowUpRight, ArrowDownRight, Plus, RefreshCw } from "lucide-react";
import { T } from "../constants.js";
import { fmt, fmtDate, exportAudit, shareAudit, stripPaycheckParens, extractDashboardMetrics } from "../utils.js";
import { Card, Label, Badge } from "../ui.jsx";
import { Mono, StatusDot, PaceBar, Md, CountUp } from "../components.jsx";
import { BADGE_DEFINITIONS, TIER_COLORS, unlockBadge } from "../badges.js";
import DebtSimulator from "./DebtSimulator.jsx";
import WeeklyChallenges from "./WeeklyChallenges.jsx";
import CashFlowCalendar from "./CashFlowCalendar.jsx";
import BudgetTab from "./BudgetTab.jsx";
import { haptic } from "../haptics.js";

import { useAudit } from '../contexts/AuditContext.jsx';
import { useSettings } from '../contexts/SettingsContext.jsx';
import { usePortfolio } from '../contexts/PortfolioContext.jsx';
import { useNavigation } from '../contexts/NavigationContext.jsx';

export default memo(function DashboardTab({ onRestore, proEnabled = false, onDemoAudit, onRefreshDashboard }) {
    const { current, history, handleManualImport } = useAudit();
    const { financialConfig, persona } = useSettings();
    const { cards, renewals, badges } = usePortfolio();
    const { navTo, setSetupReturnTab } = useNavigation();

    const onRunAudit = () => navTo("input");
    const onViewResult = () => navTo("results", current);
    const onGoSettings = () => { setSetupReturnTab("dashboard"); navTo("settings"); };
    const onGoCards = () => { setSetupReturnTab("dashboard"); navTo("cards"); };
    const onGoRenewals = () => { setSetupReturnTab("dashboard"); navTo("renewals"); };

    const p = current?.parsed;
    const dashboardMetrics = extractDashboardMetrics(p);
    const restoreInputRef = useRef(null);
    const floor =
        (Number.isFinite(financialConfig?.weeklySpendAllowance) ? financialConfig.weeklySpendAllowance : 0) +
        (Number.isFinite(financialConfig?.emergencyFloor) ? financialConfig.emergencyFloor : 0);

    // Main Segmented View Toggle
    const [viewMode, setViewMode] = useState("command"); // 'command' | 'budget'

    // Active analytics tab
    const [chartTab, setChartTab] = useState("networth");

    // Streak counter
    const streak = useMemo(() => {
        const realAudits = history.filter(a => !a.isTest);
        if (!realAudits.length) return 0;
        const getISOWeek = (d) => {
            const dt = new Date(d); dt.setHours(0, 0, 0, 0);
            dt.setDate(dt.getDate() + 3 - (dt.getDay() + 6) % 7);
            const w1 = new Date(dt.getFullYear(), 0, 4);
            return `${dt.getFullYear()}-W${String(1 + Math.round(((dt - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7)).padStart(2, '0')}`;
        };
        const weeks = [...new Set(realAudits.map(a => a.date ? getISOWeek(a.date) : null).filter(Boolean))].sort().reverse();
        if (!weeks.length) return 0;
        const currentWeek = getISOWeek(new Date().toISOString().split("T")[0]);
        let count = 0;
        const startWeek = weeks[0] === currentWeek ? currentWeek : weeks[0];
        let checkDate = new Date(startWeek.slice(0, 4), 0, 1);
        const weekNum = parseInt(startWeek.slice(6), 10);
        checkDate.setDate(checkDate.getDate() + (weekNum - 1) * 7);
        for (let i = 0; i < weeks.length && i < 52; i++) {
            const expected = getISOWeek(checkDate.toISOString().split("T")[0]);
            if (weeks.includes(expected)) { count++; checkDate.setDate(checkDate.getDate() - 7); }
            else break;
        }
        return count;
    }, [history]);

    // Chart data
    const chartData = useMemo(() =>
        history.filter(a => a.parsed?.netWorth != null).slice(0, 12).reverse().map(a => {
            const [y, m] = (a.date || "").split("-");
            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            return { date: m ? `${months[parseInt(m, 10) - 1] || m} ${(y || "").slice(2)}` : "?", nw: a.parsed.netWorth };
        }), [history]);

    const scoreData = useMemo(() =>
        history.filter(a => !a.isTest && a.parsed?.healthScore?.score != null).slice(0, 12).reverse().map(a => {
            const [, m, d] = (a.date || "").split("-");
            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            return { date: m ? `${months[parseInt(m, 10) - 1]} ${d}` : "?", score: a.parsed.healthScore.score, grade: a.parsed.healthScore.grade };
        }), [history]);

    const spendData = useMemo(() => {
        const realAudits = history.filter(a => !a.isTest && a.form).slice(0, 12).reverse();
        return realAudits.map((a, i) => {
            const [, m, d] = (a.date || "").split("-");
            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const checking = parseFloat(a.form?.checking) || 0;
            const prev = i > 0 ? (parseFloat(realAudits[i - 1].form?.checking) || 0) : checking;
            return { date: m ? `${months[parseInt(m, 10) - 1]} ${d}` : "?", spent: Math.max(0, prev - checking) };
        });
    }, [history]);

    // Confetti
    const [runConfetti, setRunConfetti] = useState(false);
    const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
    const prevCurrentTs = useRef(current?.ts);

    useEffect(() => {
        const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (current?.ts !== prevCurrentTs.current) {
            prevCurrentTs.current = current?.ts;
            if (current?.parsed?.healthScore?.score >= 95 && !current?.isTest) {
                setRunConfetti(true);
                setTimeout(() => setRunConfetti(false), 8000);
            }
        }
    }, [current]);

    // Predictive alerts
    const alerts = useMemo(() => {
        const result = [];
        const realAudits = history.filter(a => !a.isTest && a.form);
        if (realAudits.length >= 2) {
            const recent = realAudits.slice(0, 4);
            const checkingValues = recent.map(a => parseFloat(a.form?.checking) || 0).reverse();
            if (checkingValues.length >= 2) {
                const weeklyDelta = (checkingValues[checkingValues.length - 1] - checkingValues[0]) / (checkingValues.length - 1);
                if (weeklyDelta < -50) {
                    const currentChecking = checkingValues[checkingValues.length - 1];
                    const weeksToFloor = Math.ceil((currentChecking - floor) / Math.abs(weeklyDelta));
                    if (weeksToFloor > 0 && weeksToFloor <= 6) {
                        const breachDate = new Date();
                        breachDate.setDate(breachDate.getDate() + weeksToFloor * 7);
                        result.push({ icon: "🚨", color: T.status.red, title: "Floor Breach Risk", text: `$${Math.abs(weeklyDelta).toFixed(0)}/wk burn → floor by ${breachDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, pulse: true });
                    }
                }
            }
            const debtValues = recent.map(a => (a.form?.debts || []).reduce((s, d) => s + (parseFloat(d.balance) || 0), 0)).reverse();
            if (debtValues.length >= 2 && debtValues[0] > 100) {
                const weeklyPaydown = (debtValues[0] - debtValues[debtValues.length - 1]) / (debtValues.length - 1);
                if (weeklyPaydown > 10) {
                    const freeDate = new Date(); freeDate.setDate(freeDate.getDate() + Math.ceil(debtValues[debtValues.length - 1] / weeklyPaydown) * 7);
                    result.push({ icon: "🎯", color: T.status.green, title: "Debt-Free", text: `At $${weeklyPaydown.toFixed(0)}/wk → ${freeDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })}` });
                }
            }
            const scores = recent.filter(a => a.parsed?.healthScore?.score != null).map(a => a.parsed.healthScore.score).reverse();
            if (scores.length >= 3) {
                const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
                const latest = scores[scores.length - 1];
                if (latest < avg - 5) result.push({ icon: "📉", color: T.status.amber, title: "Score Drop", text: `${latest} — below ${Math.round(avg)} avg` });
                else if (latest > avg + 5 && latest >= 70) result.push({ icon: "📈", color: T.status.green, title: "Score Rising", text: `${latest} — ${Math.round(latest - avg)}pts above avg` });
            }
            if (financialConfig?.track401k && financialConfig?.k401ContributedYTD > 0 && financialConfig?.taxBracketPercent > 0) {
                const taxSaved = financialConfig.k401ContributedYTD * (financialConfig.taxBracketPercent / 100);
                result.push({ icon: "🛡️", color: T.accent.primary, title: "Tax Shield", text: `${fmt(taxSaved)} saved at ${financialConfig.taxBracketPercent}%` });
            }
        }
        return result;
    }, [history, floor, financialConfig]);

    // ── EMPTY STATE ──
    if (!current) {
        const needsCards = cards.length === 0;
        const needsRenewals = (renewals || []).length === 0;
        const needsSetup = needsCards || needsRenewals;

        return <div className="page-body" style={{ paddingBottom: 20, display: "flex", flexDirection: "column", minHeight: "100%" }}>

            {/* View Toggle (Always Visible as requested) */}
            <div style={{ display: "flex", background: T.bg.elevated, padding: 4, borderRadius: T.radius.lg, marginBottom: 16, border: `1px solid ${T.border.subtle}` }}>
                {[{ id: "command", label: "Command Center" }, { id: "budget", label: "Weekly Budget" }].map(v => (
                    <button key={v.id} onClick={() => { haptic.light(); setViewMode(v.id); }} style={{
                        flex: 1, padding: "8px 12px", border: "none", borderRadius: T.radius.md,
                        background: viewMode === v.id ? T.bg.card : "transparent",
                        color: viewMode === v.id ? T.text.primary : T.text.dim,
                        fontSize: 12, fontWeight: 700, cursor: "pointer",
                        boxShadow: viewMode === v.id ? T.shadow.navBtn : "none",
                        transition: "all .2s ease"
                    }}>{v.label}</button>
                ))}
            </div>

            {viewMode === "budget" ? (
                <BudgetTab
                    budgetCategories={financialConfig?.budgetCategories || []}
                    budgetActuals={{}} // Empty in pre-audit state
                    weeklySpendAllowance={financialConfig?.weeklySpendAllowance || 0}
                />
            ) : (
                <>
                    <div style={{ textAlign: "center", paddingTop: 14, paddingBottom: 18 }}>
                        <img src="/icon-192.png" alt="Catalyst Cash" style={{
                            width: 80, height: 80, borderRadius: 20, margin: "0 auto 14px", display: "block",
                            filter: `drop-shadow(0 4px 20px ${T.accent.primary}30)`
                        }} />
                        <h1 style={{ fontSize: 20, fontWeight: 900, marginBottom: 6, fontFamily: T.font.sans }}>Catalyst Cash</h1>
                        <p style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600 }}>DEBT • SAVING • INVESTING • AUTOMATION</p>
                    </div>

                    <Card variant="accent" style={{ textAlign: "center", padding: 20, marginTop: 8 }}>
                        <Zap size={22} color={T.accent.emerald} style={{ margin: "0 auto 14px", display: "block" }} />
                        <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>See the full experience</p>
                        <p style={{ fontSize: 11, color: T.text.secondary, marginBottom: 14, lineHeight: 1.5 }}>Run a demo audit with sample data — takes 2 seconds, no setup required</p>
                        <button onClick={onDemoAudit} style={{
                            padding: "12px 28px", borderRadius: T.radius.lg, border: "none",
                            background: `linear-gradient(135deg,${T.accent.emerald},#1A8B50)`,
                            color: "#fff", fontSize: 13, fontWeight: 800,
                            cursor: "pointer", boxShadow: T.shadow.navBtn,
                        }}>Try Demo Audit ✨</button>
                    </Card>

                    <Card style={{ textAlign: "center", padding: 16, marginTop: 8 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Ready with your real numbers?</p>
                        <p style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.5, marginBottom: 12 }}>Enter a weekly snapshot to power your financial command center</p>
                        <button onClick={onRunAudit} style={{
                            padding: "10px 24px", borderRadius: T.radius.md, border: `1px solid ${T.accent.primary}40`,
                            background: T.accent.primaryDim, color: T.accent.primary, fontSize: 12, fontWeight: 700, cursor: "pointer"
                        }}>Go to Input →</button>
                    </Card>

                    <Card style={{ marginTop: 8 }}>
                        <Label>{needsSetup ? "Complete Your Setup" : "Quick Links"}</Label>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
                            <button onClick={onGoSettings} style={{
                                padding: "12px 14px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`,
                                background: T.bg.elevated, color: T.text.primary, fontSize: 12, fontWeight: 700,
                                cursor: "pointer", textAlign: "left"
                            }}>Financial Profile & Settings</button>
                            {needsCards && <button onClick={onGoCards} style={{
                                padding: "12px 14px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`,
                                background: T.bg.elevated, color: T.text.primary, fontSize: 12, fontWeight: 700,
                                cursor: "pointer", textAlign: "left"
                            }}>Add Credit Cards</button>}
                            {needsRenewals && <button onClick={onGoRenewals} style={{
                                padding: "12px 14px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`,
                                background: T.bg.elevated, color: T.text.primary, fontSize: 12, fontWeight: 700,
                                cursor: "pointer", textAlign: "left"
                            }}>Add Renewals & Bills</button>}
                        </div>
                    </Card>

                    {(cards.length > 0 || (renewals || []).length > 0 || financialConfig?.enableHoldings) && (
                        <Card style={{ marginTop: 8 }}>
                            <Label>Live Summary</Label>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                {cards.length > 0 && (
                                    <div style={{ padding: "10px 12px", background: T.bg.elevated, borderRadius: T.radius.md, border: `1px solid ${T.border.subtle}` }}>
                                        <div style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 700 }}>CARDS</div>
                                        <div style={{ fontSize: 18, fontWeight: 800, color: T.text.primary }}>{cards.length}</div>
                                        <div style={{ fontSize: 10, color: T.text.muted }}>{fmt(cards.reduce((s, c) => s + (c.limit || 0), 0))} total limit</div>
                                    </div>
                                )}
                                {(renewals || []).length > 0 && (
                                    <div style={{ padding: "10px 12px", background: T.bg.elevated, borderRadius: T.radius.md, border: `1px solid ${T.border.subtle}` }}>
                                        <div style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 700 }}>BILLS/SUBS</div>
                                        <div style={{ fontSize: 18, fontWeight: 800, color: T.text.primary }}>{renewals.length}</div>
                                        <div style={{ fontSize: 10, color: T.text.muted }}>{fmt(renewals.reduce((s, r) => {
                                            const amt = r.amount || 0;
                                            const int = r.interval || 1;
                                            const unit = r.intervalUnit || "months";
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

    // ── ACTIVE DASHBOARD ──
    const rawStatus = String(p?.status || "UNKNOWN").toUpperCase();
    const cleanStatus = rawStatus.includes("GREEN") ? "GREEN" : rawStatus.includes("RED") ? "RED" : rawStatus.includes("YELLOW") ? "YELLOW" : "UNKNOWN";
    const sc = cleanStatus === "GREEN" ? T.status.green : cleanStatus === "YELLOW" ? T.status.amber : cleanStatus === "RED" ? T.status.red : T.text.dim;
    const hs = p?.healthScore || {};
    const score = typeof hs.score === "number" ? hs.score : 0;
    const grade = hs.grade || "?";
    const trend = hs.trend || "flat";
    const summary = hs.summary || "";
    const scoreColor = score >= 80 ? T.status.green : score >= 60 ? T.status.amber : T.status.red;
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const arcLength = (score / 100) * circumference * 0.75;

    const quickMetrics = [
        { l: "Checking", v: dashboardMetrics.checking, c: T.text.primary, icon: "💳" },
        { l: "Vault", v: dashboardMetrics.vault, c: T.text.primary, icon: "🏦" },
        { l: "Pending", v: dashboardMetrics.pending, c: T.status.amber, icon: "⏳" },
        { l: "Debts", v: dashboardMetrics.debts, c: T.status.red, icon: "📊" },
        { l: "Available", v: dashboardMetrics.available, c: (dashboardMetrics.available ?? 0) >= floor ? T.status.green : T.status.red, icon: "✅" }
    ].filter(({ v }) => v != null);



    return <div className="page-body" style={{ paddingBottom: 0 }}>
        <style>{`
            @keyframes pulseRing { 0% { stroke-width: 6; opacity: 0.1; } 100% { stroke-width: 12; opacity: 0.3; } }
            @keyframes pulseBorder { 0% { box-shadow: 0 0 10px ${T.accent.primary}10; } 100% { box-shadow: 0 0 30px ${T.accent.primary}40; } }
            @keyframes alertPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
            @keyframes slideInRight { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
            @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
            .hover-lift { transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) !important; cursor: default; }
            .hover-lift:hover { transform: translateY(-3px) scale(1.02); box-shadow: 0 12px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08) !important; }
            .chart-tab { padding: 5px 12px; border-radius: 20px; border: none; font-size: 10px; font-weight: 700; cursor: pointer; font-family: ${T.font.mono}; letter-spacing: 0.05em; text-transform: uppercase; transition: all .2s; }
            .chart-tab-active { background: ${T.accent.primary}; color: #fff; box-shadow: 0 2px 8px ${T.accent.primary}40; }
            .chart-tab-inactive { background: ${T.bg.elevated}; color: ${T.text.dim}; }
            .alert-pill { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 20px; white-space: nowrap; flex-shrink: 0; animation: slideInRight .4s ease-out both; }
        `}</style>

        {runConfetti && <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, pointerEvents: "none" }}>
            <Confetti width={windowSize.width} height={windowSize.height} recycle={false} numberOfPieces={400} gravity={0.15} />
        </div>}

        {/* Segmented View Toggle & Global Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1, display: "flex", background: T.bg.elevated, padding: 3, borderRadius: T.radius.lg, border: `1px solid ${T.border.subtle}` }}>
                {[{ id: "command", label: "Command Center" }, { id: "budget", label: "Weekly Budget" }].map(v => (
                    <button key={v.id} onClick={() => { haptic.light(); setViewMode(v.id); }} style={{
                        flex: 1, padding: "6px 12px", border: "none", borderRadius: T.radius.md,
                        background: viewMode === v.id ? T.bg.card : "transparent",
                        color: viewMode === v.id ? T.text.primary : T.text.dim,
                        fontSize: 12, fontWeight: 700, cursor: "pointer",
                        boxShadow: viewMode === v.id ? T.shadow.navBtn : "none",
                        transition: "all .2s ease"
                    }}>{v.label}</button>
                ))}
            </div>

            {/* Action buttons (Export / Share) */}
            {current && <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {[{ fn: () => exportAudit(current), icon: Download }, { fn: () => shareAudit(current), icon: ExternalLink }].map(({ fn, icon: I }, i) =>
                    <button key={i} onClick={fn} style={{
                        width: 36, height: 36, borderRadius: T.radius.md,
                        border: `1px solid ${T.border.subtle}`, background: T.bg.elevated, color: T.text.primary,
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: T.shadow.sm, flexShrink: 0
                    }}>
                        <I size={15} strokeWidth={2.2} /></button>)}
            </div>}
        </div>

        {viewMode === "budget" ? (
            <BudgetTab
                budgetCategories={financialConfig?.budgetCategories || []}
                budgetActuals={current?.form?.budgetActuals || {}}
                weeklySpendAllowance={financialConfig?.weeklySpendAllowance || 0}
            />
        ) : (
            <>
                {/* Demo Banner */}
                {current?.isTest && <Card style={{
                    borderLeft: `3px solid ${T.status.amber}`, background: `${T.status.amberDim}`,
                    padding: "10px 14px", marginBottom: 10
                }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: T.status.amber, fontFamily: T.font.mono, letterSpacing: "0.06em" }}>DEMO DATA</div>
                            <p style={{ fontSize: 10, color: T.text.secondary, lineHeight: 1.4, margin: 0 }}>Showing sample data from a demo audit</p>
                        </div>
                        <button onClick={onRefreshDashboard} style={{
                            display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: T.radius.md, border: "none",
                            background: `linear-gradient(135deg, ${T.accent.primary}, #6C60FF)`,
                            color: "#fff", fontSize: 10, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0
                        }}><RefreshCw size={11} strokeWidth={2.5} />Reset</button>
                    </div>
                </Card>}

                {/* ═══ COMMAND HEADER — Consolidated Hero ═══ */}
                <Card animate style={{
                    padding: 0, marginBottom: 12, overflow: "hidden",
                    background: `linear-gradient(160deg, ${T.bg.card}, ${scoreColor}06)`,
                    borderColor: `${scoreColor}15`,
                    boxShadow: `${T.shadow.elevated}, 0 0 40px ${scoreColor}08`
                }}>
                    {/* Top section: Score gauge + Net Worth */}
                    <div style={{ padding: "20px 18px 14px", display: "flex", alignItems: "center", gap: 16 }}>
                        {/* Health Score Gauge (compact) */}
                        {hs.score != null && <div style={{ position: "relative", width: 90, height: 80, flexShrink: 0 }}>
                            <svg width="90" height="80" viewBox="0 0 90 80">
                                <circle cx="45" cy="45" r={radius} fill="none" stroke={`${T.border.default}`}
                                    strokeWidth="6" strokeLinecap="round"
                                    strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
                                    transform="rotate(135,45,45)" />
                                <circle cx="45" cy="45" r={radius} fill="none" stroke={scoreColor}
                                    strokeWidth="6" strokeLinecap="round"
                                    strokeDasharray={`${arcLength} ${circumference - arcLength}`}
                                    transform="rotate(135,45,45)"
                                    style={{ transition: "stroke-dasharray 1.2s ease-out, stroke 0.8s ease" }} />
                                <circle cx="45" cy="45" r={radius} fill="none" stroke={scoreColor}
                                    strokeWidth="10" strokeLinecap="round" opacity="0.12"
                                    strokeDasharray={`${arcLength} ${circumference - arcLength}`}
                                    transform="rotate(135,45,45)"
                                    style={{ animation: "pulseRing 3s infinite alternate cubic-bezier(0.4, 0, 0.2, 1)" }} />
                            </svg>
                            <div style={{ position: "absolute", top: "46%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
                                <div style={{ fontSize: 24, fontWeight: 900, color: scoreColor, fontFamily: T.font.sans, lineHeight: 1 }}>{grade}</div>
                                <div style={{ fontSize: 9, fontWeight: 700, color: T.text.dim, fontFamily: T.font.mono, marginTop: 1 }}>{score}/100</div>
                            </div>
                        </div>}

                        {/* Net Worth + Status */}
                        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                                <StatusDot status={cleanStatus} size="sm" />
                                <Mono size={9} color={T.text.dim}>{fmtDate(current.date)}</Mono>
                                {streak > 1 && <div style={{
                                    display: "inline-flex", alignItems: "center", gap: 3,
                                    padding: "1px 6px", borderRadius: 12,
                                    background: `linear-gradient(135deg, #FF6B3518, #FF8C0018)`,
                                    border: `1px solid #FF6B3525`
                                }}>
                                    <span style={{ fontSize: 10 }}>🔥</span>
                                    <span style={{ fontSize: 8, fontWeight: 800, color: "#FF8C00", fontFamily: T.font.mono }}>W{streak}</span>
                                </div>}
                            </div>
                            <p style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: T.text.dim, marginBottom: 4, fontFamily: T.font.mono, fontWeight: 700 }}>Net Worth</p>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                <CountUp
                                    value={p?.netWorth ?? 0}
                                    size={28}
                                    weight={900}
                                    color={p?.netWorth != null && p.netWorth >= 0 ? T.accent.primary : T.status.red}
                                />
                            </div>
                            {p?.netWorthDelta && <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 3 }}>
                                {String(p.netWorthDelta).includes("+") ? <ArrowUpRight size={12} color={T.status.green} /> :
                                    <ArrowDownRight size={12} color={T.status.red} />}
                                <Mono size={10} color={String(p.netWorthDelta).includes("+") ? T.status.green : T.status.red}>{p.netWorthDelta}</Mono>
                            </div>}
                            {summary && <p style={{ fontSize: 10, color: T.text.secondary, lineHeight: 1.4, margin: "6px 0 0", maxWidth: 240 }}>{summary}</p>}
                        </div>
                    </div>

                    {/* Metrics strip */}
                    {quickMetrics.length > 0 && <div style={{
                        display: "flex", borderTop: `1px solid ${T.border.subtle}`,
                        background: `${T.bg.base}60`
                    }}>
                        {quickMetrics.map(({ l, v, c, icon }, i) => <div key={l} style={{
                            flex: 1, padding: "10px 4px", textAlign: "center",
                            borderRight: i < quickMetrics.length - 1 ? `1px solid ${T.border.subtle}` : "none",
                            animation: `fadeInUp .4s ease-out ${i * 0.06}s both`
                        }}>
                            <div style={{ fontSize: 8, fontWeight: 800, color: T.text.dim, fontFamily: T.font.mono, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>{l}</div>
                            <CountUp value={v ?? 0} size={13} weight={800} color={c} />
                        </div>)}
                    </div>}
                </Card>

                {/* ═══ ALERT STRIP — Compact horizontal scrollable insights ═══ */}
                {alerts.length > 0 && <div style={{
                    display: "flex", gap: 8, overflowX: "auto", paddingBottom: 12, marginBottom: 4,
                    WebkitOverflowScrolling: "touch", scrollbarWidth: "none",
                    msOverflowStyle: "none"
                }}>
                    <style>{`.alert-strip::-webkit-scrollbar { display: none; }`}</style>
                    {alerts.map((a, i) => <div key={i} className="alert-pill" style={{
                        background: `${a.color}10`, border: `1px solid ${a.color}25`,
                        animationDelay: `${i * 0.08}s`,
                        animation: a.pulse ? `slideInRight .4s ease-out ${i * 0.08}s both, alertPulse 2s ease-in-out infinite` : `slideInRight .4s ease-out ${i * 0.08}s both`
                    }}>
                        <span style={{ fontSize: 13, flexShrink: 0 }}>{a.icon}</span>
                        <div>
                            <div style={{ fontSize: 9, fontWeight: 800, color: a.color, fontFamily: T.font.mono, letterSpacing: "0.03em" }}>{a.title}</div>
                            <div style={{ fontSize: 10, color: T.text.secondary, marginTop: 1 }}>{a.text}</div>
                        </div>
                    </div>)}
                </div>}

                {/* ═══ NEXT ACTION — Priority CTA ═══ */}
                {p?.sections?.nextAction && <Card animate delay={100} variant="accent" style={{
                    animation: "pulseBorder 4s infinite alternate",
                    border: `1.5px solid ${T.accent.primary}50`
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <div style={{ width: 26, height: 26, borderRadius: 7, background: T.accent.primaryDim, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Zap size={13} color={T.accent.primary} strokeWidth={2.5} /></div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: T.accent.primary }}>Next Action</span></div>
                    <Md text={stripPaycheckParens(p.sections.nextAction)} />
                </Card>}

                {/* ═══ CASH FLOW CALENDAR ═══ */}
                {dashboardMetrics.checking != null && <CashFlowCalendar
                    config={financialConfig} cards={cards} renewals={renewals}
                    checkingBalance={dashboardMetrics.checking || 0}
                    snapshotDate={current?.date}
                />}

                {/* ═══ SINKING FUNDS — Progress Rings ═══ */}
                {p?.paceData?.length > 0 && <Card animate delay={150}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                        <div style={{ width: 26, height: 26, borderRadius: 7, background: T.accent.copperDim, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Target size={13} color={T.accent.copper} strokeWidth={2.5} /></div>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>Sinking Funds</span></div>
                    <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
                        {p.paceData.map((d, i) => {
                            const pct = d.target > 0 ? Math.min((d.saved / d.target) * 100, 100) : 0;
                            const rc = pct >= 90 ? T.status.green : pct >= 50 ? T.status.amber : T.status.red;
                            const r = 28, circ = 2 * Math.PI * r, arc = (pct / 100) * circ;
                            return <div key={i} style={{ textAlign: "center", flexShrink: 0, minWidth: 80, animation: `fadeInUp .4s ease-out ${i * 0.06}s both` }}>
                                <div style={{ position: "relative", width: 64, height: 64, margin: "0 auto 6px" }}>
                                    <svg width="64" height="64" viewBox="0 0 64 64">
                                        <circle cx="32" cy="32" r={r} fill="none" stroke={`${T.border.default}`} strokeWidth="5" />
                                        <circle cx="32" cy="32" r={r} fill="none" stroke={rc} strokeWidth="5" strokeLinecap="round"
                                            strokeDasharray={`${arc} ${circ - arc}`} transform="rotate(-90,32,32)"
                                            style={{ transition: "stroke-dasharray 1s ease-out" }} />
                                    </svg>
                                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <span style={{ fontSize: 11, fontWeight: 800, color: rc, fontFamily: T.font.mono }}>{Math.round(pct)}%</span>
                                    </div>
                                </div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: T.text.primary, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                                <div style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono }}>{fmt(d.saved)}/{fmt(d.target)}</div>
                            </div>;
                        })}
                    </div>
                </Card>}

                {/* ═══ WEEKLY CHALLENGES ═══ */}
                <WeeklyChallenges />

                {/* ═══ DEBT PAYOFF SIMULATOR ═══ */}
                <DebtSimulator cards={cards} financialConfig={financialConfig} />

                {/* ═══ TABBED ANALYTICS ═══ */}
                {(chartData.length > 1 || scoreData.length > 1 || spendData.length > 1) && <Card animate delay={200}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                        <Label style={{ margin: 0 }}>Analytics</Label>
                        <div style={{ display: "flex", gap: 4 }}>
                            {[
                                { id: "networth", label: "Net Worth", show: chartData.length > 1 },
                                { id: "health", label: "Health", show: scoreData.length > 1 },
                                { id: "spending", label: "Spending", show: spendData.length > 1 },
                            ].filter(t => t.show).map(tab => <button key={tab.id}
                                className={`chart-tab ${chartTab === tab.id ? "chart-tab-active" : "chart-tab-inactive"}`}
                                onClick={() => setChartTab(tab.id)}
                            >{tab.label}</button>)}
                        </div>
                    </div>

                    {chartTab === "networth" && chartData.length > 1 && <ResponsiveContainer width="100%" height={160}>
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
                    </ResponsiveContainer>}

                    {chartTab === "health" && scoreData.length > 1 && <ResponsiveContainer width="100%" height={160}>
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
                                formatter={(v, n, props) => [`${v}/100 (${props.payload.grade})`, "Health Score"]} />
                            <Area type="monotone" dataKey="score" stroke={T.status.green} strokeWidth={2.5} fill="url(#hsG)"
                                dot={{ fill: T.status.green, r: 3, strokeWidth: 0 }}
                                activeDot={{ r: 5, fill: T.status.green, stroke: "#fff", strokeWidth: 2 }} />
                        </AreaChart>
                    </ResponsiveContainer>}

                    {chartTab === "spending" && spendData.length > 1 && <ResponsiveContainer width="100%" height={160}>
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
                    </ResponsiveContainer>}
                </Card>}

                {/* ═══ ACHIEVEMENT BADGES — Compact horizontal strip ═══ */}
                {(() => {
                    const unlockedIds = Object.keys(badges);
                    const unlockedBadges = BADGE_DEFINITIONS.filter(b => unlockedIds.includes(b.id));
                    const lockedCount = BADGE_DEFINITIONS.length - unlockedBadges.length;
                    return <Card animate delay={250}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 14 }}>🏆</span>
                                <span style={{ fontSize: 12, fontWeight: 700 }}>Achievements</span>
                            </div>
                            <span style={{ fontSize: 9, fontWeight: 700, color: T.text.dim, fontFamily: T.font.mono }}>
                                {unlockedIds.length}/{BADGE_DEFINITIONS.length}
                            </span>
                        </div>
                        <div style={{
                            display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4,
                            WebkitOverflowScrolling: "touch", scrollbarWidth: "none"
                        }}>
                            {unlockedBadges.length > 0 ? unlockedBadges.map((b, i) => {
                                const tc = TIER_COLORS[b.tier] || TIER_COLORS.bronze;
                                return <div key={b.id} title={`${b.name}: ${b.desc}`} style={{
                                    padding: "8px 10px", borderRadius: T.radius.md, textAlign: "center",
                                    background: tc.bg, border: `1px solid ${tc.border}`,
                                    flexShrink: 0, minWidth: 64,
                                    animation: `fadeInUp .3s ease-out ${i * 0.05}s both`
                                }}>
                                    <div style={{ fontSize: 20, marginBottom: 2 }}>{b.emoji}</div>
                                    <div style={{ fontSize: 8, fontWeight: 700, color: tc.text, fontFamily: T.font.mono, lineHeight: 1.2, whiteSpace: "nowrap" }}>{b.name}</div>
                                </div>;
                            }) : (
                                <div style={{ padding: "10px 14px", fontSize: 11, color: T.text.muted, textAlign: "center", width: "100%" }}>
                                    Complete audits to unlock badges
                                </div>
                            )}
                            {lockedCount > 0 && unlockedBadges.length > 0 && <div style={{
                                padding: "8px 10px", borderRadius: T.radius.md, textAlign: "center",
                                background: `${T.bg.elevated}60`, border: `1px solid ${T.border.default}`,
                                flexShrink: 0, minWidth: 64, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center"
                            }}>
                                <div style={{ fontSize: 16, marginBottom: 2, opacity: 0.4 }}>🔒</div>
                                <div style={{ fontSize: 8, fontWeight: 700, color: T.text.muted, fontFamily: T.font.mono }}>+{lockedCount}</div>
                            </div>}
                        </div>
                    </Card>;
                })()}

                {/* ═══ BOTTOM CTAs — Streamlined ═══ */}
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <button onClick={onViewResult} style={{
                        flex: 1, padding: "12px 14px", borderRadius: T.radius.lg,
                        border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.secondary,
                        fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        boxShadow: T.shadow.card
                    }}>
                        <Activity size={14} />Full Results</button>

                    {p?.healthScore && <button onClick={async () => {
                        const canvas = document.createElement("canvas");
                        canvas.width = 400; canvas.height = 520;
                        const ctx = canvas.getContext("2d");
                        const bg = ctx.createLinearGradient(0, 0, 400, 520);
                        bg.addColorStop(0, "#0F0D1A"); bg.addColorStop(1, "#1A1730");
                        ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(0, 0, 400, 520, 20); ctx.fill();
                        ctx.strokeStyle = "rgba(130,120,255,0.2)"; ctx.lineWidth = 1.5;
                        ctx.beginPath(); ctx.roundRect(0, 0, 400, 520, 20); ctx.stroke();
                        ctx.beginPath(); ctx.arc(200, 180, 80, 0, Math.PI * 2);
                        const glow = ctx.createRadialGradient(200, 180, 40, 200, 180, 90);
                        glow.addColorStop(0, scoreColor + "30"); glow.addColorStop(1, "transparent");
                        ctx.fillStyle = glow; ctx.fill();
                        ctx.beginPath(); ctx.arc(200, 180, 72, 0, Math.PI * 2);
                        ctx.strokeStyle = scoreColor; ctx.lineWidth = 5; ctx.stroke();
                        ctx.fillStyle = scoreColor; ctx.font = "bold 56px -apple-system, BlinkMacSystemFont, sans-serif";
                        ctx.textAlign = "center"; ctx.textBaseline = "middle";
                        ctx.fillText(hs.grade || "?", 200, 170);
                        ctx.fillStyle = "#9CA3AF"; ctx.font = "600 16px -apple-system, sans-serif";
                        ctx.fillText(`${hs.score || 0}/100`, 200, 210);
                        ctx.fillStyle = "#E5E7EB"; ctx.font = "800 12px -apple-system, sans-serif";
                        ctx.fillText("WEEKLY HEALTH SCORE", 200, 290);
                        ctx.fillStyle = sc; ctx.font = "700 14px -apple-system, sans-serif";
                        ctx.fillText(cleanStatus, 200, 320);
                        ctx.fillStyle = "#6B7280"; ctx.font = "600 13px -apple-system, sans-serif";
                        ctx.fillText(fmtDate(current.date), 200, 350);
                        if (hs.summary) {
                            ctx.fillStyle = "#9CA3AF"; ctx.font = "400 13px -apple-system, sans-serif";
                            const words = hs.summary.split(" "); let lines = []; let line = "";
                            for (const w of words) { if ((line + " " + w).length > 40) { lines.push(line); line = w; } else { line = line ? line + " " + w : w; } }
                            if (line) lines.push(line);
                            lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, 200, 385 + i * 20));
                        }
                        ctx.fillStyle = "rgba(130,120,255,0.3)"; ctx.font = "700 11px -apple-system, sans-serif";
                        ctx.fillText("Powered by Catalyst Cash", 200, 490);
                        canvas.toBlob(async (blob) => {
                            try {
                                const file = new File([blob], "health-score.png", { type: "image/png" });
                                if (navigator.share && navigator.canShare?.({ files: [file] })) {
                                    await navigator.share({ files: [file], title: "My Weekly Health Score" });
                                } else {
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement("a"); a.href = url; a.download = "health-score.png";
                                    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
                                }
                            } catch (e) { if (e.name !== "AbortError") console.error("Share failed:", e); }
                        }, "image/png");
                        unlockBadge("shared_score").catch(() => { });
                    }} style={{
                        flex: 1, padding: "12px 14px", borderRadius: T.radius.lg,
                        border: `1px solid ${T.accent.primary}25`, background: `${T.accent.primary}08`, color: T.accent.primary,
                        fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                    }}>
                        <ExternalLink size={14} />Share Score</button>}
                </div>

                {/* Primary CTA */}
                <button onClick={onRunAudit} style={{
                    width: "100%", padding: "16px", borderRadius: T.radius.lg,
                    border: "none", background: `linear-gradient(135deg, ${T.accent.emerald}, #10B981)`, color: "#fff",
                    fontSize: 15, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    boxShadow: `0 8px 24px ${T.accent.emerald}40`
                }}>
                    <Plus size={18} strokeWidth={2.5} />Input Weekly Data</button>

                <p style={{ fontSize: 9, color: T.text.muted, textAlign: "center", marginTop: 14, lineHeight: 1.5, opacity: 0.6 }}>
                    AI-generated educational content only · Not professional financial advice
                </p>
            </>
        )}
    </div >;
})
