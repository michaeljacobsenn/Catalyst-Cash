import { useMemo, useRef, useState, useEffect, memo } from "react";
import Confetti from "react-confetti";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import { Zap, ArrowUpRight, ArrowDownRight, Activity, TrendingUp, Download, Target, ExternalLink, RefreshCw, Plus } from "lucide-react";
import { T } from "../constants.js";

import { fmt, fmtDate, exportAudit, shareAudit, stripPaycheckParens, extractDashboardMetrics } from "../utils.js";
import { Card, Label, Badge, ProgressBar, InlineTooltip } from "../ui.jsx";
import { Mono, StatusDot, PaceBar, Md, CountUp, Section } from "../components.jsx";
import { BADGE_DEFINITIONS, TIER_COLORS, unlockBadge } from "../badges.js";
import DebtSimulator from "./DebtSimulator.jsx";
import WeeklyChallenges from "./WeeklyChallenges.jsx";
import CashFlowCalendar from "./CashFlowCalendar.jsx";
import BudgetTab from "./BudgetTab.jsx";
import { computeFireProjection } from "../fire.js";
import { haptic } from "../haptics.js";
import { shouldShowGating } from "../subscription.js";
import ProPaywall, { ProBanner } from "./ProPaywall.jsx";

import { useAudit } from '../contexts/AuditContext.jsx';
import { useSettings } from '../contexts/SettingsContext.jsx';
import { usePortfolio } from '../contexts/PortfolioContext.jsx';
import { useNavigation } from '../contexts/NavigationContext.jsx';

function summarizeTrend(data, key, formatter) {
    if (!Array.isArray(data) || data.length < 2) {
        return { direction: "flat", change: "insufficient data", start: null, end: null };
    }
    const first = data[0]?.[key];
    const last = data[data.length - 1]?.[key];
    if (!Number.isFinite(first) || !Number.isFinite(last)) {
        return { direction: "flat", change: "insufficient data", start: null, end: null };
    }
    const delta = last - first;
    const pct = first !== 0 ? (delta / Math.abs(first)) * 100 : 0;
    const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    const absPct = Math.abs(pct);
    const pctText = Number.isFinite(absPct) ? `${absPct.toFixed(1)}%` : "0.0%";
    return {
        direction,
        change: delta === 0 ? "unchanged" : `${direction} ${pctText}`,
        start: formatter(first),
        end: formatter(last)
    };
}

export default memo(function DashboardTab({ onRestore, proEnabled = false, onDemoAudit, onRefreshDashboard }) {
    const { current, history, handleManualImport } = useAudit();
    const { financialConfig, setFinancialConfig, persona } = useSettings();
    const { cards, renewals, badges, marketPrices } = usePortfolio();
    const { navTo, setSetupReturnTab } = useNavigation();
    const [showPaywall, setShowPaywall] = useState(false);

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

    // Investment snapshot computation
    const investmentSnapshot = useMemo(() => {
        const holdings = financialConfig?.holdings || {};
        const sections = [
            { key: "k401", label: "401(k)", enabled: !!financialConfig?.track401k, color: "#3B82F6" },
            { key: "roth", label: "Roth IRA", enabled: !!financialConfig?.trackRothContributions, color: "#8B5CF6" },
            { key: "brokerage", label: "Brokerage", enabled: !!financialConfig?.trackBrokerage, color: "#10B981" },
            { key: "hsa", label: "HSA", enabled: !!financialConfig?.trackHSA, color: "#06B6D4" },
            { key: "crypto", label: "Crypto", enabled: !!financialConfig?.trackCrypto, color: "#F59E0B" },
        ];
        const result = [];
        let grandTotal = 0;
        for (const s of sections) {
            const items = holdings[s.key] || [];
            if (items.length === 0 && !s.enabled) continue;
            let total = 0;
            for (const h of items) {
                const price = marketPrices?.[h.symbol]?.price ?? h.lastKnownPrice ?? 0;
                total += (parseFloat(h.shares) || 0) * price;
            }
            if (total > 0 || s.enabled) result.push({ ...s, total, count: items.length });
            grandTotal += total;
        }
        return { accounts: result, total: grandTotal };
    }, [financialConfig, marketPrices]);

    const fireProjection = useMemo(() => {
        if (current?.isTest) {
            // Mock high-earner configs to yield a good 10-15 year FIRE date for the demo
            return computeFireProjection({
                financialConfig: {
                    incomeSources: [{ amount: 150000, frequency: "yearly" }],
                    budgetCategories: [{ monthlyTarget: 4000 }],
                    fireExpectedReturnPct: 7,
                    fireInflationPct: 2.5,
                    fireSafeWithdrawalPct: 4,
                },
                renewals: [],
                cards: [],
                portfolioMarketValue: 180000, // mock starting capital
                asOfDate: current?.date || new Date().toISOString().split("T")[0]
            });
        }
        return computeFireProjection({
            financialConfig,
            renewals,
            cards,
            portfolioMarketValue: investmentSnapshot.total,
            asOfDate: current?.date || new Date().toISOString().split("T")[0]
        });
    }, [financialConfig, renewals, cards, investmentSnapshot.total, current?.date, current?.isTest]);

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
            return { date: m ? `${months[parseInt(m, 10) - 1] || m} ${(y || "").slice(2)} ` : "?", nw: a.parsed.netWorth };
        }), [history]);

    const scoreData = useMemo(() =>
        history.filter(a => !a.isTest && a.parsed?.healthScore?.score != null).slice(0, 12).reverse().map(a => {
            const [, m, d] = (a.date || "").split("-");
            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            return { date: m ? `${months[parseInt(m, 10) - 1]} ${d} ` : "?", score: a.parsed.healthScore.score, grade: a.parsed.healthScore.grade };
        }), [history]);

    const spendData = useMemo(() => {
        const realAudits = history.filter(a => !a.isTest && a.form).slice(0, 12).reverse();
        return realAudits.map((a, i) => {
            const [, m, d] = (a.date || "").split("-");
            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const checking = parseFloat(a.form?.checking) || 0;
            const prev = i > 0 ? (parseFloat(realAudits[i - 1].form?.checking) || 0) : checking;
            return { date: m ? `${months[parseInt(m, 10) - 1]} ${d} ` : "?", spent: Math.max(0, prev - checking) };
        });
    }, [history]);

    const chartA11y = useMemo(() => {
        const netWorthTrend = summarizeTrend(chartData, "nw", v => fmt(v));
        const healthTrend = summarizeTrend(scoreData, "score", v => `${Math.round(v)}`);
        const spendingTrend = summarizeTrend(spendData, "spent", v => fmt(v));

        return {
            netWorthLabel: `Net worth chart with ${chartData.length} points, trend ${netWorthTrend.change}. Start ${netWorthTrend.start ?? "N/A"}, end ${netWorthTrend.end ?? "N/A"}.`,
            netWorthHint: "This area chart shows net worth progression over recent audits. Upward movement indicates improving total assets minus debts.",
            healthLabel: `Health score chart with ${scoreData.length} points, trend ${healthTrend.change}. Start ${healthTrend.start ?? "N/A"}, end ${healthTrend.end ?? "N/A"}.`,
            healthHint: "This chart tracks the financial health score over time. Higher values indicate stronger liquidity, debt control, and savings discipline.",
            spendingLabel: `Weekly spending chart with ${spendData.length} points, trend ${spendingTrend.change}. Start ${spendingTrend.start ?? "N/A"}, end ${spendingTrend.end ?? "N/A"}.`,
            spendingHint: "This chart shows estimated weekly spending based on checking-balance changes between audits.",
        };
    }, [chartData, scoreData, spendData]);

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

    const freedomStats = useMemo(() => {
        const result = { freeDateStr: null, weeklyPaydown: null };
        const realAudits = history.filter(a => !a.isTest && a.form);
        if (realAudits.length >= 2) {
            const recent = realAudits.slice(0, 4);
            const debtValues = recent.map(a => (a.form?.debts || []).reduce((s, d) => s + (parseFloat(d.balance) || 0), 0)).reverse();
            if (debtValues.length >= 2 && debtValues[0] > 100) {
                const weeklyPaydown = (debtValues[0] - debtValues[debtValues.length - 1]) / (debtValues.length - 1);
                if (weeklyPaydown > 10) {
                    const freeDate = new Date(); freeDate.setDate(freeDate.getDate() + Math.ceil(debtValues[debtValues.length - 1] / weeklyPaydown) * 7);
                    result.freeDateStr = freeDate.toLocaleDateString("en-US", { month: "short", year: "numeric" });
                    result.weeklyPaydown = weeklyPaydown;
                }
            }
        }
        return result;
    }, [history]);

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
                result.push({ icon: "🛡️", color: T.accent.primary, title: "Tax Shield", text: `${fmt(taxSaved)} saved at ${financialConfig.taxBracketPercent}% ` });
            }

            // Net-worth momentum over last 4 audits
            const nwAudits = realAudits.filter(a => a.parsed?.netWorth != null).slice(0, 4);
            if (nwAudits.length >= 2) {
                const latestNW = nwAudits[0].parsed.netWorth;
                const oldestNW = nwAudits[nwAudits.length - 1].parsed.netWorth;
                const delta = latestNW - oldestNW;
                if (Math.abs(delta) > 50) {
                    const up = delta > 0;
                    result.push({
                        icon: up ? "💰" : "📉", color: up ? T.status.green : T.status.amber,
                        title: "Net Worth", text: `${up ? "+" : ""}${fmt(delta)} over last ${nwAudits.length} audits`
                    });
                }
            }

            // Health score factor analysis — what moved the score most
            if (realAudits.length >= 2) {
                const latest = realAudits[0];
                const prev = realAudits[1];
                const lScore = latest.parsed?.healthScore?.score;
                const pScore = prev.parsed?.healthScore?.score;
                if (lScore != null && pScore != null && Math.abs(lScore - pScore) >= 3) {
                    const lForm = latest.form || {};
                    const pForm = prev.form || {};
                    const factors = [];
                    const lChecking = parseFloat(lForm.checking) || 0;
                    const pChecking = parseFloat(pForm.checking) || 0;
                    if (Math.abs(lChecking - pChecking) > 100) factors.push({ name: "checking", delta: lChecking - pChecking });
                    const lDebt = (lForm.debts || []).reduce((s, d) => s + (parseFloat(d.balance) || 0), 0);
                    const pDebt = (pForm.debts || []).reduce((s, d) => s + (parseFloat(d.balance) || 0), 0);
                    if (Math.abs(lDebt - pDebt) > 50) factors.push({ name: "debt", delta: pDebt - lDebt }); // positive = debt reduced
                    const lSave = parseFloat(lForm.ally || lForm.savings) || 0;
                    const pSave = parseFloat(pForm.ally || pForm.savings) || 0;
                    if (Math.abs(lSave - pSave) > 50) factors.push({ name: "savings", delta: lSave - pSave });

                    if (factors.length > 0) {
                        const biggest = factors.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
                        const labels = { checking: "Cash flow", debt: "Debt paydown", savings: "Savings growth" };
                        const up = lScore > pScore;
                        result.push({
                            icon: up ? "⚡" : "🔍", color: up ? T.accent.emerald : T.status.amber,
                            title: `Score ${up ? "+" : ""}${lScore - pScore} `, text: `Driven by ${labels[biggest.name] || biggest.name} `
                        });
                    }
                }
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
            <div style={{ display: "flex", background: T.bg.elevated, padding: 4, borderRadius: T.radius.lg, marginBottom: 16, border: `1px solid ${T.border.subtle} ` }}>
                {[{ id: "command", label: "Command Center" }, { id: "budget", label: "Weekly Budget" }].map(v => (
                    <button key={v.id} className="a11y-hit-target" onClick={() => { haptic.light(); setViewMode(v.id); }} style={{
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
            ) : (
                <>
                    <div style={{ textAlign: "center", paddingTop: 14, paddingBottom: 18, animation: "fadeInUp .6s ease-out both" }}>
                        <img src="/icon-192.png" alt="Catalyst Cash" style={{
                            width: 80, height: 80, borderRadius: 20, margin: "0 auto 14px", display: "block",
                            filter: `drop-shadow(0 4px 20px ${T.accent.primary}30)`
                        }} />
                        <h1 style={{ fontSize: 20, fontWeight: 900, marginBottom: 6, fontFamily: T.font.sans }}>Catalyst Cash</h1>
                        <p style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600 }}>DEBT • SAVING • INVESTING • AUTOMATION</p>
                    </div>

                    <Card animate delay={80} variant="accent" style={{ textAlign: "center", padding: 20, marginTop: 8 }}>
                        <Zap size={22} color={T.accent.emerald} style={{ margin: "0 auto 14px", display: "block" }} />
                        <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>See the full experience</p>
                        <p style={{ fontSize: 11, color: T.text.secondary, marginBottom: 14, lineHeight: 1.5 }}>Run a demo audit with sample data — takes 2 seconds, no setup required</p>
                        <button onClick={onDemoAudit} className="hover-btn" style={{
                            padding: "14px 32px", borderRadius: T.radius.lg, border: "none",
                            background: `linear-gradient(135deg, ${T.accent.emerald},#1A8B50)`,
                            color: "#fff", fontSize: 14, fontWeight: 800,
                            cursor: "pointer", boxShadow: T.shadow.navBtn,
                            letterSpacing: "0.02em"
                        }}>Try Demo Audit ✨</button>
                    </Card>

                    <Card animate delay={160} style={{ textAlign: "center", padding: 16, marginTop: 8 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Ready with your real numbers?</p>
                        <p style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.5, marginBottom: 12 }}>Enter a weekly snapshot to power your financial command center</p>
                        <button onClick={onRunAudit} className="hover-btn" style={{
                            padding: "12px 28px", borderRadius: T.radius.md, border: `1px solid ${T.accent.primary}40`,
                            background: T.accent.primaryDim, color: T.accent.primary, fontSize: 13, fontWeight: 700, cursor: "pointer"
                        }}>Go to Input →</button>
                    </Card>

                    <Card style={{ marginTop: 8 }}>
                        <Label>{needsSetup ? "Complete Your Setup" : "Quick Links"}</Label>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                            <button onClick={onGoSettings} className="hover-btn" style={{
                                padding: "14px 16px", borderRadius: T.radius.md,
                                border: `1px solid ${T.border.default}`, borderLeft: `3px solid ${T.accent.primary}`,
                                background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontWeight: 700,
                                cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center",
                                justifyContent: "space-between"
                            }}>
                                <span>⚙️  Financial Profile & Settings</span>
                                <span style={{ fontSize: 14, color: T.text.muted }}>›</span>
                            </button>
                            {needsCards && <button onClick={onGoCards} className="hover-btn" style={{
                                padding: "14px 16px", borderRadius: T.radius.md,
                                border: `1px solid ${T.border.default}`, borderLeft: `3px solid ${T.status.blue}`,
                                background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontWeight: 700,
                                cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center",
                                justifyContent: "space-between"
                            }}>
                                <span>💳  Add Credit Cards</span>
                                <span style={{ fontSize: 14, color: T.text.muted }}>›</span>
                            </button>}
                            {needsRenewals && <button onClick={onGoRenewals} className="hover-btn" style={{
                                padding: "14px 16px", borderRadius: T.radius.md,
                                border: `1px solid ${T.border.default}`, borderLeft: `3px solid ${T.accent.emerald}`,
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
    const healthGaugeLabel = `Health score gauge showing ${score} out of 100, grade ${grade}, status ${cleanStatus}.`;
    const healthGaugeHint = "The circular gauge summarizes current financial health. A higher score indicates better overall financial stability.";

    // ── Synthetic Percentile (client-side, no real user data) ──
    // Normal CDF approximation (Abramowitz & Stegun) — μ=62, σ=16
    const percentile = (() => {
        if (score === 0) return 0;
        const z = (score - 62) / 16;
        const t = 1 / (1 + 0.2316419 * Math.abs(z));
        const d = 0.3989422804 * Math.exp(-z * z / 2);
        const phi = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
        return Math.round(z > 0 ? (1 - phi) * 100 : phi * 100);
    })();

    const quickMetrics = [
        { l: "Checking", v: dashboardMetrics.checking, c: T.text.primary, icon: "💳" },
        { l: "Vault", v: dashboardMetrics.vault, c: T.text.primary, icon: "🏦" },
        { l: "Investments", v: dashboardMetrics.investments, c: T.accent.emerald, icon: "📈" },
        { l: "Other Assets", v: dashboardMetrics.otherAssets, c: T.text.secondary, icon: "🏠" },
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
@keyframes ambientGlow { 0%, 100% { background-position: 0% 0%; } 50% { background-position: 100% 100%; } }
            .hover-lift { transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)!important; cursor: default; }
            .hover-lift:hover { transform: translateY(-3px) scale(1.02); box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.08)!important; }
            .chart-tab { padding: 5px 12px; border-radius: 20px; border: none; font-size: 10px; font-weight: 700; cursor: pointer; font-family: ${T.font.mono}; letter-spacing: 0.05em; text-transform: uppercase; transition: all .2s; white-space: normal; line-height: 1.2; }
            .chart-tab-active { background: ${T.accent.primary}; color: #fff; box-shadow: 0 2px 8px ${T.accent.primary}40; }
            .chart-tab-inactive { background: ${T.bg.elevated}; color: ${T.text.dim}; }
            .alert-pill { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 20px; white-space: nowrap; flex-shrink: 0; animation: slideInRight .4s ease-out both; }
            .alert-strip::-webkit-scrollbar { display: none; }
            .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
            .a11y-hit-target { position: relative; }
            .a11y-hit-target::after { content: ""; position: absolute; left: 50%; top: 50%; width: 44px; height: 44px; transform: translate(-50%, -50%); }
`}</style>

        {runConfetti && <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, pointerEvents: "none" }}>
            <Confetti width={windowSize.width} height={windowSize.height} recycle={false} numberOfPieces={400} gravity={0.15} />
        </div>}

        {/* Segmented View Toggle & Global Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1, display: "flex", background: T.bg.elevated, padding: 3, borderRadius: T.radius.lg, border: `1px solid ${T.border.subtle} ` }}>
                {[{ id: "command", label: "Command Center" }, { id: "budget", label: "Weekly Budget" }].map(v => (
                    <button key={v.id} className="a11y-hit-target hover-btn" onClick={() => { haptic.light(); setViewMode(v.id); }} style={{
                        flex: 1, padding: "6px 12px", border: "none", borderRadius: T.radius.md,
                        background: viewMode === v.id ? T.bg.card : "transparent",
                        color: viewMode === v.id ? T.text.primary : T.text.dim,
                        fontSize: 12, fontWeight: 700, cursor: "pointer", lineHeight: 1.3,
                        boxShadow: viewMode === v.id ? T.shadow.navBtn : "none",
                        transition: "all .2s ease"
                    }}>{v.label}</button>
                ))}
            </div>

            {/* Action buttons (Export / Share) */}
            {current && <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {[{ fn: () => exportAudit(current), icon: Download }, { fn: () => shareAudit(current), icon: ExternalLink }].map(({ fn, icon: I }, i) =>
                    <button key={i} className="a11y-hit-target hover-btn" onClick={fn} style={{
                        width: 44, height: 44, borderRadius: T.radius.md,
                        border: `1px solid ${T.border.subtle} `, background: T.bg.elevated, color: T.text.primary,
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: T.shadow.sm, flexShrink: 0
                    }}>
                        <I size={17} strokeWidth={2.2} /></button>)}
            </div>}
        </div>

        {viewMode === "budget" ? (
            <BudgetTab
                budgetCategories={financialConfig?.budgetCategories || []}
                budgetActuals={current?.form?.budgetActuals || {}}
                weeklySpendAllowance={financialConfig?.weeklySpendAllowance || 0}
                financialConfig={financialConfig}
                setFinancialConfig={setFinancialConfig}
                incomeSources={financialConfig?.incomeSources || []}
            />
        ) : (
            <>
                {/* Demo Banner */}
                {current?.isTest && <Card style={{
                    borderLeft: `3px solid ${T.status.amber} `, background: `${T.status.amberDim} `,
                    padding: "10px 14px", marginBottom: 10
                }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: T.status.amber, fontFamily: T.font.mono, letterSpacing: "0.06em" }}>DEMO DATA</div>
                            <p style={{ fontSize: 10, color: T.text.secondary, lineHeight: 1.4, margin: 0 }}>Showing sample data from a demo audit</p>
                        </div>
                        <button className="a11y-hit-target" onClick={onRefreshDashboard} style={{
                            display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: T.radius.md, border: "none",
                            background: `linear-gradient(135deg, ${T.accent.primary}, #6C60FF)`,
                            color: "#fff", fontSize: 10, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0
                        }}><RefreshCw size={11} strokeWidth={2.5} />Reset</button>
                    </div>
                </Card>}

                {/* Pro Upgrade Banner (only when gating is active) */}
                {shouldShowGating() && <ProBanner onUpgrade={() => setShowPaywall(true)} label="Upgrade to Pro" sublabel="150 audits/mo · Premium AI · Full history" />}
                {showPaywall && <ProPaywall onClose={() => setShowPaywall(false)} />}

                {/* ═══ COMMAND HEADER — Consolidated Hero ═══ */}
                <Card animate className="hover-card" style={{
                    padding: 0, marginBottom: 12, overflow: "hidden", position: "relative",
                    background: T.bg.card,
                    borderColor: `${scoreColor} 15`,
                    boxShadow: `${T.shadow.elevated}, 0 0 40px ${scoreColor}08`, zIndex: 0
                }}>
                    <div style={{
                        position: "absolute", inset: -50, zIndex: -1,
                        background: `radial-gradient(circle at 80% 0%, ${scoreColor}20, transparent 40%), radial-gradient(circle at 20% 100%, ${T.accent.primary}10, transparent 40%)`,
                        backgroundSize: "200% 200%",
                        animation: "ambientGlow 12s ease-in-out infinite alternate"
                    }} />
                    {/* Top section: Score gauge + Net Worth */}
                    <div style={{ padding: "20px 18px 14px", display: "flex", alignItems: "center", gap: 16 }}>
                        {/* Health Score Gauge (compact) */}
                        {hs.score != null && <div
                            role="img"
                            aria-label={healthGaugeLabel}
                            aria-describedby="health-score-gauge-hint"
                            style={{ position: "relative", width: 90, height: 80, flexShrink: 0 }}
                        >
                            <svg width="90" height="80" viewBox="0 0 90 80">
                                <circle cx="45" cy="45" r={radius} fill="none" stroke={`${T.border.default} `}
                                    strokeWidth="6" strokeLinecap="round"
                                    strokeDasharray={`${circumference * 0.75} ${circumference * 0.25} `}
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
                            {percentile > 0 && <div style={{
                                position: "absolute", bottom: -2, left: "50%", transform: "translateX(-50%)",
                                fontSize: 7, fontWeight: 800, color: scoreColor, fontFamily: T.font.mono,
                                background: `${scoreColor}12`, padding: "2px 7px", borderRadius: 10,
                                border: `1px solid ${scoreColor}20`, letterSpacing: "0.02em"
                            }}>Top {100 - percentile}%</div>}
                            <span id="health-score-gauge-hint" className="sr-only">{healthGaugeHint}</span>
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
                            <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
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
                            {freedomStats.freeDateStr && freedomStats.weeklyPaydown != null && <div style={{ marginTop: 8, background: `${T.status.green}15`, border: `1px solid ${T.status.green}30`, borderRadius: 4, padding: "4px 8px", display: "inline-flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 12 }}>🎯</span>
                                <p style={{ fontSize: 9, color: T.status.green, margin: 0, fontWeight: 700, fontFamily: T.font.mono }}>
                                    Projected debt-free: {freedomStats.freeDateStr} at current ${freedomStats.weeklyPaydown.toFixed(0)}/wk
                                </p>
                            </div>}
                            {summary && <p style={{ fontSize: 10, color: T.text.secondary, lineHeight: 1.4, margin: "6px 0 0", maxWidth: 240 }}>{summary}</p>}
                            {hs.narrative && <div style={{
                                marginTop: 8, padding: "8px 10px", borderLeft: `2px solid ${scoreColor}40`,
                                background: `${scoreColor}06`, borderRadius: `0 ${T.radius.sm}px ${T.radius.sm}px 0`
                            }}>
                                <p style={{ fontSize: 10, color: T.text.secondary, lineHeight: 1.5, margin: 0, fontStyle: "italic" }}>{hs.narrative}</p>
                            </div>}
                        </div>
                    </div>

                    {/* Metrics strip */}
                    {quickMetrics.length > 0 && <div style={{
                        display: "flex", borderTop: `1px solid ${T.border.subtle} `,
                        background: `${T.bg.base} 60`
                    }}>
                        {quickMetrics.map(({ l, v, c, icon }, i) => <div key={l} style={{
                            flex: 1, padding: "10px 2px", textAlign: "center", minWidth: 0, overflow: "hidden",
                            borderRight: i < quickMetrics.length - 1 ? `1px solid ${T.border.subtle}` : "none",
                            animation: `fadeInUp .4s ease-out ${i * 0.06}s both`
                        }}>
                            <div style={{ fontSize: 8, fontWeight: 800, color: T.text.dim, fontFamily: T.font.mono, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3, lineHeight: 1.2, overflowWrap: "anywhere" }}>
                                {l === "Available" ? <InlineTooltip>{l}</InlineTooltip> : l}
                            </div>
                            <div style={{ fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere", lineHeight: 1.2 }}>
                                <CountUp value={v ?? 0} size={11} weight={800} color={c} />
                            </div>
                        </div>)}
                    </div>}
                </Card>

                {/* ═══ ALERT STRIP — Compact horizontal scrollable insights ═══ */}
                {alerts.length > 0 && <div className="alert-strip" style={{
                    display: "flex", gap: 8, overflowX: "auto", paddingBottom: 12, marginBottom: 4,
                    WebkitOverflowScrolling: "touch", scrollbarWidth: "none",
                    msOverflowStyle: "none"
                }}>
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

                {/* ═══ INVESTMENT SNAPSHOT ═══ */}
                {investmentSnapshot.accounts.length > 0 && <Card animate delay={125} style={{
                    background: `linear-gradient(160deg, ${T.bg.card}, ${T.accent.emerald}06)`,
                    borderColor: `${T.accent.emerald}15`
                }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 26, height: 26, borderRadius: 7, background: `${T.accent.emerald}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <TrendingUp size={13} color={T.accent.emerald} strokeWidth={2.5} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700 }}>Investment Portfolio</span>
                        </div>
                        <div style={{ textAlign: "right" }}>
                            <Mono size={16} weight={900} color={T.accent.emerald}>{fmt(Math.round(investmentSnapshot.total))}</Mono>
                        </div>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {investmentSnapshot.accounts.map((a, idx) => (
                            <div key={a.key} style={{
                                flex: "1 1 45%", minWidth: 120, display: "flex", alignItems: "center", justifyContent: "space-between",
                                padding: "8px 10px", background: `${a.color}08`, borderRadius: T.radius.sm,
                                border: `1px solid ${a.color}18`,
                                animation: `fadeInUp .35s ease-out ${idx * 0.06}s both`
                            }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: a.color }} />
                                    <span style={{ fontSize: 10, fontWeight: 700, color: T.text.secondary }}>{a.label}</span>
                                </div>
                                <Mono size={11} weight={800} color={a.total > 0 ? a.color : T.text.muted}>{a.total > 0 ? fmt(Math.round(a.total)) : "—"}</Mono>
                            </div>
                        ))}
                    </div>
                </Card>}

                {/* ═══ FIRE PROJECTION ═══ */}
                <Card animate delay={140} style={{
                    background: `linear-gradient(160deg, ${T.bg.card}, ${T.status.blue}08)`,
                    borderColor: `${T.status.blue}20`
                }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 26, height: 26, borderRadius: 7, background: `${T.status.blue}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <Target size={13} color={T.status.blue} strokeWidth={2.5} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700 }}>FIRE Projection</span>
                        </div>
                        <Mono size={10} color={T.text.dim}>REAL RETURN {fireProjection.realReturnPct?.toFixed(2) ?? "0.00"}%</Mono>
                    </div>

                    {fireProjection.status === "ok" ? (
                        <>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                                <div style={{ padding: "8px 10px", borderRadius: T.radius.sm, background: `${T.status.green}10`, border: `1px solid ${T.status.green}20` }}>
                                    <div style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono }}>TARGET DATE</div>
                                    <div style={{ fontSize: 12, fontWeight: 800, color: T.status.green }}>{fireProjection.projectedFireDate ? fmtDate(fireProjection.projectedFireDate) : "Now"}</div>
                                </div>
                                <div style={{ padding: "8px 10px", borderRadius: T.radius.sm, background: `${T.status.blue}10`, border: `1px solid ${T.status.blue}20` }}>
                                    <div style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono }}>YEARS TO FIRE</div>
                                    <div style={{ fontSize: 12, fontWeight: 800, color: T.status.blue }}>
                                        {Number.isFinite(fireProjection.projectedYearsToFire) ? fireProjection.projectedYearsToFire.toFixed(1) : "—"}
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                                <div style={{ padding: "7px 8px", borderRadius: T.radius.sm, background: T.bg.elevated }}>
                                    <div style={{ fontSize: 8, color: T.text.dim, fontFamily: T.font.mono }}>INCOME</div>
                                    <Mono size={10} weight={700} color={T.status.green}>{fmt(fireProjection.annualIncome)}</Mono>
                                </div>
                                <div style={{ padding: "7px 8px", borderRadius: T.radius.sm, background: T.bg.elevated }}>
                                    <div style={{ fontSize: 8, color: T.text.dim, fontFamily: T.font.mono }}>EXPENSES</div>
                                    <Mono size={10} weight={700} color={T.status.red}>{fmt(fireProjection.annualExpenses)}</Mono>
                                </div>
                                <div style={{ padding: "7px 8px", borderRadius: T.radius.sm, background: T.bg.elevated }}>
                                    <div style={{ fontSize: 8, color: T.text.dim, fontFamily: T.font.mono }}>SAVINGS RATE</div>
                                    <Mono size={10} weight={700} color={(fireProjection.savingsRatePct || 0) >= 0 ? T.status.blue : T.status.red}>
                                        {fireProjection.savingsRatePct != null ? `${fireProjection.savingsRatePct.toFixed(1)}%` : "—"}
                                    </Mono>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div style={{
                            padding: "10px 12px",
                            borderRadius: T.radius.sm,
                            background: `${T.status.amber}10`,
                            border: `1px solid ${T.status.amber}25`,
                            fontSize: 11,
                            color: T.text.secondary,
                            lineHeight: 1.5
                        }}>
                            FIRE horizon is currently not solvable with the active assumptions (reason: {fireProjection.reason || "unstable-inputs"}). Increase annual savings or expected real return.
                        </div>
                    )}
                </Card>

                {/* ═══ SINKING FUNDS — Progress Rings ═══ */}
                {p?.paceData?.length > 0 && <Card animate delay={150}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                        <div style={{ width: 26, height: 26, borderRadius: 7, background: T.accent.copperDim, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Target size={13} color={T.accent.copper} strokeWidth={2.5} /></div>
                        <span style={{ fontSize: 12, fontWeight: 700 }}><InlineTooltip term="Sinking fund">Sinking Funds</InlineTooltip></span></div>
                    <span id="sinking-funds-chart-hint" className="sr-only">Each circular chart represents one sinking fund progress from zero to one hundred percent of target.</span>
                    <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
                        {p.paceData.map((d, i) => {
                            const pct = d.target > 0 ? Math.min((d.saved / d.target) * 100, 100) : 0;
                            const rc = pct >= 90 ? T.status.green : pct >= 50 ? T.status.amber : T.status.red;
                            const r = 28, circ = 2 * Math.PI * r, arc = (pct / 100) * circ;
                            return <div
                                key={i}
                                role="img"
                                aria-describedby="sinking-funds-chart-hint"
                                aria-label={`${d.name} sinking fund progress ${Math.round(pct)} percent. Saved ${fmt(d.saved)} out of ${fmt(d.target)}.`}
                                style={{ textAlign: "center", flexShrink: 0, minWidth: 80, animation: `fadeInUp .4s ease-out ${i * 0.06}s both` }}
                            >
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
                                <div style={{
                                    fontSize: 10, fontWeight: 700, color: T.text.primary, marginBottom: 2,
                                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                                    overflow: "hidden", wordBreak: "break-word", lineHeight: 1.2
                                }}>{d.name}</div>
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
                                className={`chart-tab a11y-hit-target ${chartTab === tab.id ? "chart-tab-active" : "chart-tab-inactive"}`}
                                onClick={() => setChartTab(tab.id)}
                            >{tab.label}</button>)}
                        </div>
                    </div>

                    {chartTab === "networth" && chartData.length > 1 && <div
                        key="chart-networth"
                        role="img"
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
                        key="chart-health"
                        role="img"
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

                    {
                        chartTab === "spending" && spendData.length > 1 && <div
                            key="chart-spending"
                            role="img"
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
                            </ResponsiveContainer></div>
                    }
                </Card>}

                {/* ═══ ACHIEVEMENT BADGES — Compact horizontal strip ═══ */}
                {
                    (() => {
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
                                        <div style={{ fontSize: 8, fontWeight: 700, color: tc.text, fontFamily: T.font.mono, lineHeight: 1.2, whiteSpace: "normal", overflowWrap: "anywhere" }}>{b.name}</div>
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
                    })()
                }

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
                        const W = 440, H = 600;
                        const canvas = document.createElement("canvas");
                        canvas.width = W; canvas.height = H;
                        const ctx = canvas.getContext("2d");

                        // Background gradient
                        const bg = ctx.createLinearGradient(0, 0, W, H);
                        bg.addColorStop(0, "#0B0A14"); bg.addColorStop(0.5, "#0F0D1A"); bg.addColorStop(1, "#14122A");
                        ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(0, 0, W, H, 24); ctx.fill();

                        // Ambient glow behind gauge
                        const glow = ctx.createRadialGradient(W / 2, 200, 20, W / 2, 200, 130);
                        glow.addColorStop(0, scoreColor + "20"); glow.addColorStop(1, "transparent");
                        ctx.fillStyle = glow; ctx.fillRect(0, 50, W, 300);

                        // Outer border
                        ctx.strokeStyle = `${scoreColor}25`; ctx.lineWidth = 1.5;
                        ctx.beginPath(); ctx.roundRect(1, 1, W - 2, H - 2, 24); ctx.stroke();

                        // Score ring — background track
                        ctx.beginPath(); ctx.arc(W / 2, 200, 82, Math.PI * 0.75, Math.PI * 2.25);
                        ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 7; ctx.lineCap = "round"; ctx.stroke();

                        // Score ring — filled arc
                        const endAngle = Math.PI * 0.75 + (score / 100) * Math.PI * 1.5;
                        ctx.beginPath(); ctx.arc(W / 2, 200, 82, Math.PI * 0.75, endAngle);
                        const ringGrad = ctx.createLinearGradient(W / 2 - 82, 200, W / 2 + 82, 200);
                        ringGrad.addColorStop(0, scoreColor); ringGrad.addColorStop(1, scoreColor + "CC");
                        ctx.strokeStyle = ringGrad; ctx.lineWidth = 7; ctx.lineCap = "round"; ctx.stroke();

                        // Grade letter
                        ctx.fillStyle = scoreColor; ctx.font = "bold 60px -apple-system, BlinkMacSystemFont, sans-serif";
                        ctx.textAlign = "center"; ctx.textBaseline = "middle";
                        ctx.fillText(hs.grade || "?", W / 2, 190);

                        // Score number
                        ctx.fillStyle = "#9CA3AF"; ctx.font = "700 17px -apple-system, sans-serif";
                        ctx.fillText(`${hs.score || 0}/100`, W / 2, 228);

                        // Percentile badge
                        if (percentile > 0) {
                            ctx.fillStyle = scoreColor + "18";
                            ctx.beginPath(); ctx.roundRect(W / 2 - 50, 258, 100, 22, 11); ctx.fill();
                            ctx.strokeStyle = scoreColor + "30"; ctx.lineWidth = 1;
                            ctx.beginPath(); ctx.roundRect(W / 2 - 50, 258, 100, 22, 11); ctx.stroke();
                            ctx.fillStyle = scoreColor; ctx.font = "800 10px -apple-system, sans-serif";
                            ctx.fillText(`Top ${100 - percentile}% of users`, W / 2, 271);
                        }

                        // Divider
                        ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 1;
                        ctx.beginPath(); ctx.moveTo(40, 300); ctx.lineTo(W - 40, 300); ctx.stroke();

                        // Title
                        ctx.fillStyle = "#E5E7EB"; ctx.font = "800 13px -apple-system, sans-serif";
                        ctx.fillText("WEEKLY HEALTH SCORE", W / 2, 330);

                        // Status
                        ctx.fillStyle = sc; ctx.font = "700 15px -apple-system, sans-serif";
                        ctx.fillText(cleanStatus, W / 2, 358);

                        // Streak & Date row
                        const dateText = fmtDate(current.date);
                        if (streak > 1) {
                            ctx.fillStyle = "#FF8C00"; ctx.font = "700 12px -apple-system, sans-serif";
                            ctx.fillText(`🔥 W${streak} Streak`, W / 2 - 50, 388);
                            ctx.fillStyle = "#6B7280"; ctx.font = "600 12px -apple-system, sans-serif";
                            ctx.fillText(`  ·  ${dateText}`, W / 2 + 50, 388);
                        } else {
                            ctx.fillStyle = "#6B7280"; ctx.font = "600 13px -apple-system, sans-serif";
                            ctx.fillText(dateText, W / 2, 388);
                        }

                        // Summary
                        if (hs.summary) {
                            ctx.fillStyle = "#8890A6"; ctx.font = "400 13px -apple-system, sans-serif";
                            const words = hs.summary.split(" "); let lines = []; let line = "";
                            for (const w of words) { if ((line + " " + w).length > 44) { lines.push(line); line = w; } else { line = line ? line + " " + w : w; } }
                            if (line) lines.push(line);
                            lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, W / 2, 425 + i * 20));
                        }

                        // Footer branding
                        ctx.strokeStyle = "rgba(255,255,255,0.04)"; ctx.lineWidth = 1;
                        ctx.beginPath(); ctx.moveTo(40, H - 60); ctx.lineTo(W - 40, H - 60); ctx.stroke();
                        const brandGrad = ctx.createLinearGradient(W / 2 - 80, 0, W / 2 + 80, 0);
                        brandGrad.addColorStop(0, "#7B5EA7"); brandGrad.addColorStop(1, "#2ECC71");
                        ctx.fillStyle = brandGrad; ctx.font = "800 12px -apple-system, sans-serif";
                        ctx.fillText("Catalyst Cash", W / 2, H - 32);
                        ctx.fillStyle = "rgba(255,255,255,0.2)"; ctx.font = "500 9px -apple-system, sans-serif";
                        ctx.fillText("CatalystCash.app", W / 2, H - 16);
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
    </div>;
})
