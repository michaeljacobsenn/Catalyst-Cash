import { useMemo, useRef, useState, useEffect } from "react";
import Confetti from "react-confetti";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Shield, Zap, Target, Activity, Download, ExternalLink, ArrowUpRight, ArrowDownRight, Plus, RefreshCw } from "lucide-react";
import { T } from "../constants.js";
import { fmt, fmtDate, exportAudit, shareAudit, stripPaycheckParens, extractDashboardMetrics } from "../utils.js";
import { Card, Label, Badge } from "../ui.jsx";
import { Mono, StatusDot, PaceBar, Md } from "../components.jsx";
import { BADGE_DEFINITIONS, TIER_COLORS, unlockBadge } from "../badges.js";
import DebtSimulator from "./DebtSimulator.jsx";
import WeeklyChallenges from "./WeeklyChallenges.jsx";
import CashFlowCalendar from "./CashFlowCalendar.jsx";

export default function DashboardTab({ current, history, onRunAudit, onViewResult, onManualImport, financialConfig, onGoSettings, onGoCards, onGoRenewals, onRestore, proEnabled = false, persona, badges = {}, onDemoAudit, onRefreshDashboard, cards = [], renewals = [] }) {
    const p = current?.parsed;
    const dashboardMetrics = extractDashboardMetrics(p);
    const restoreInputRef = useRef(null);
    const floor =
        (Number.isFinite(financialConfig?.weeklySpendAllowance) ? financialConfig.weeklySpendAllowance : 0) +
        (Number.isFinite(financialConfig?.emergencyFloor) ? financialConfig.emergencyFloor : 0);

    // Easy Win: Streak Counter — count consecutive complete weeks with audits
    // MUST BE DEFINED BEFORE ANY EARLY RETURNS TO OBEY RULES OF HOOKS
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
        // Walk backward from current/most-recent week
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

    const chartData = useMemo(() =>
        history.filter(a => a.parsed?.netWorth != null).slice(0, 12).reverse().map(a => {
            const [y, m] = (a.date || "").split("-");
            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            return { date: m ? `${months[parseInt(m, 10) - 1] || m} ${(y || "").slice(2)}` : "?", nw: a.parsed.netWorth };
        }), [history]);

    // Gamification & Confetti on Perfect/Near-Perfect Audits
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

    if (!current) {
        const needsCards = cards.length === 0;
        const needsRenewals = (renewals || []).length === 0;
        const needsSetup = needsCards || needsRenewals; // Financial Config is accessed via settings, don't mandate it here if cards/renewals are done

        return <div className="page-body" style={{ paddingBottom: 20, display: "flex", flexDirection: "column", minHeight: "100%" }}>
            <div style={{ textAlign: "center", paddingTop: 14, paddingBottom: 18 }}>
                <div style={{
                    width: 64, height: 64, borderRadius: 18, margin: "0 auto 14px",
                    background: `linear-gradient(135deg,${T.accent.primaryDim},${T.bg.card})`,
                    border: `1px solid ${T.accent.primarySoft}`, display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: T.shadow.glow, overflow: "hidden"
                }}>
                    <img src="/icon-192.png" alt="Catalyst Cash" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
                <h1 style={{ fontSize: 20, fontWeight: 900, marginBottom: 6, fontFamily: T.font.sans }}>Catalyst Cash</h1>
                <p style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600 }}>DEBT • SAVING • INVESTING • AUTOMATION</p>
            </div>

            {/* Primary Action — Demo first so users see the value immediately */}
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

            {/* Secondary — Go to real audit */}
            <Card style={{ textAlign: "center", padding: 16, marginTop: 8 }}>
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Ready with your real numbers?</p>
                <p style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.5, marginBottom: 12 }}>Enter a weekly snapshot to power your financial command center</p>
                <button onClick={onRunAudit} style={{
                    padding: "10px 24px", borderRadius: T.radius.md, border: `1px solid ${T.accent.primary}40`,
                    background: T.accent.primaryDim, color: T.accent.primary, fontSize: 12, fontWeight: 700, cursor: "pointer"
                }}>Go to Input →</button>
            </Card>

            {/* Quick Links — always visible, label reflects setup state */}
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

            {/* Subtle Restore Button at bottom */}
            <div style={{ marginTop: "auto", paddingTop: 24, textAlign: "center" }}>
                <input ref={restoreInputRef} type="file" accept=".json" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; onRestore?.(f); }}
                    style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }} />
                <button onClick={() => restoreInputRef.current?.click()} style={{
                    background: "none", border: "none", color: T.text.dim, fontSize: 11, fontWeight: 600,
                    textDecoration: "underline", cursor: "pointer", padding: "8px 16px"
                }}>Restore from Backup</button>
            </div>
        </div>;
    }

    const sc = p?.status === "GREEN" ? T.status.green : p?.status === "YELLOW" ? T.status.amber : p?.status === "RED" ? T.status.red : T.text.dim;
    const quickMetrics = [
        { l: "Checking", v: dashboardMetrics.checking, c: T.text.primary },
        { l: "Vault", v: dashboardMetrics.vault, c: T.text.primary },
        { l: "Pending", v: dashboardMetrics.pending, c: T.status.amber },
        { l: "Debts", v: dashboardMetrics.debts, c: T.status.red },
        { l: "Available", v: dashboardMetrics.available, c: (dashboardMetrics.available ?? 0) >= floor ? T.status.green : T.status.red }
    ].filter(({ v }) => v != null);

    return <div className="page-body" style={{ paddingBottom: 0 }}>
        {runConfetti && <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, pointerEvents: "none" }}>
            <Confetti width={windowSize.width} height={windowSize.height} recycle={false} numberOfPieces={400} gravity={0.15} />
        </div>}

        {/* Demo Banner */}
        {current?.isTest && <Card style={{
            borderLeft: `3px solid ${T.status.amber}`,
            background: `${T.status.amberDim}`,
            padding: "12px 14px", marginBottom: 10
        }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: T.status.amber, fontFamily: T.font.mono, letterSpacing: "0.06em", marginBottom: 3 }}>DEMO DATA</div>
                    <p style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.4, margin: 0 }}>This dashboard is showing sample data from a demo audit.</p>
                </div>
                <button onClick={onRefreshDashboard} className="hover-btn" style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "8px 14px", borderRadius: T.radius.md, border: "none",
                    background: `linear-gradient(135deg, ${T.accent.primary}, #6C60FF)`,
                    color: "#fff", fontSize: 11, fontWeight: 800, cursor: "pointer",
                    whiteSpace: "nowrap", flexShrink: 0,
                    boxShadow: `0 2px 8px ${T.accent.primary}40`
                }}>
                    <RefreshCw size={13} strokeWidth={2.5} />Reset
                </button>
            </div>
        </Card>}

        {/* Status Bar */}
        <div style={{ paddingTop: 14, paddingBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
                <p style={{ fontSize: 10, fontFamily: T.font.mono, color: T.text.dim, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>Last Audit</p>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <StatusDot status={p?.status || "UNKNOWN"} size="md" />
                    <Mono size={11} color={T.text.dim}>{fmtDate(current.date)}</Mono>
                    {streak > 1 && <div style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "2px 8px", borderRadius: 20,
                        background: `linear-gradient(135deg, #FF6B3520, #FF8C0020)`,
                        border: `1px solid #FF6B3530`,
                        animation: "fadeIn .5s ease-out"
                    }}>
                        <span style={{ fontSize: 12 }}>🔥</span>
                        <span style={{ fontSize: 10, fontWeight: 800, color: "#FF8C00", fontFamily: T.font.mono }}>Week {streak}</span>
                    </div>}
                </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
                {[{ fn: () => exportAudit(current), icon: Download }, { fn: () => shareAudit(current), icon: ExternalLink }].map(({ fn, icon: I }, i) =>
                    <button key={i} onClick={fn} style={{
                        width: 36, height: 36, borderRadius: T.radius.sm,
                        border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.dim,
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
                    }}>
                        <I size={14} /></button>)}
            </div>
        </div>

        {/* Health Score Hero Card */}
        {p?.healthScore && (() => {
            const hs = p.healthScore;
            const score = typeof hs.score === "number" ? hs.score : 0;
            const grade = hs.grade || "?";
            const trend = hs.trend || "flat";
            const summary = hs.summary || "";
            const scoreColor = score >= 80 ? T.status.green : score >= 60 ? T.status.amber : T.status.red;
            const radius = 54;
            const circumference = 2 * Math.PI * radius;
            const arcLength = (score / 100) * circumference * 0.75; // 270° arc
            return <Card animate style={{
                padding: "24px 20px", textAlign: "center", marginBottom: 10,
                background: `linear-gradient(160deg, ${T.bg.card}, ${scoreColor}08)`,
                borderColor: `${scoreColor}20`,
                boxShadow: `${T.shadow.elevated}, 0 0 40px ${scoreColor}10`
            }}>
                <div style={{ position: "relative", width: 140, height: 120, margin: "0 auto 12px" }}>
                    <svg width="140" height="120" viewBox="0 0 140 120">
                        {/* Background arc */}
                        <circle cx="70" cy="70" r={radius} fill="none" stroke={`${T.border.default}`}
                            strokeWidth="8" strokeLinecap="round"
                            strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
                            transform="rotate(135,70,70)" />
                        {/* Score arc */}
                        <circle cx="70" cy="70" r={radius} fill="none" stroke={scoreColor}
                            strokeWidth="8" strokeLinecap="round"
                            strokeDasharray={`${arcLength} ${circumference - arcLength}`}
                            transform="rotate(135,70,70)"
                            style={{ transition: "stroke-dasharray 1.2s ease-out, stroke 0.8s ease" }} />
                        {/* Glow */}
                        <circle cx="70" cy="70" r={radius} fill="none" stroke={scoreColor}
                            strokeWidth="12" strokeLinecap="round" opacity="0.15"
                            strokeDasharray={`${arcLength} ${circumference - arcLength}`}
                            transform="rotate(135,70,70)"
                            style={{ transition: "stroke-dasharray 1.2s ease-out" }} />
                    </svg>
                    <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", marginTop: -4 }}>
                        <div style={{
                            fontSize: 36, fontWeight: 900, color: scoreColor, fontFamily: T.font.sans,
                            lineHeight: 1, letterSpacing: "-0.02em"
                        }}>{grade}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: T.text.dim, fontFamily: T.font.mono, marginTop: 2 }}>{score}/100</div>
                    </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: T.font.mono }}>HEALTH SCORE</span>
                    {trend === "up" && <ArrowUpRight size={14} color={T.status.green} />}
                    {trend === "down" && <ArrowDownRight size={14} color={T.status.red} />}
                    {trend === "flat" && <span style={{ fontSize: 10, color: T.text.muted }}>→</span>}
                </div>
                {summary && <p style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.5, margin: 0, maxWidth: 280, marginLeft: "auto", marginRight: "auto" }}>{summary}</p>}
            </Card>;
        })()}

        {/* Net Worth Hero */}
        <Card animate style={{
            textAlign: "center", padding: "28px 20px",
            background: `linear-gradient(160deg,${T.bg.card},${sc}06)`, borderColor: `${sc}15`,
            boxShadow: `${T.shadow.elevated}, 0 0 30px ${sc}08`
        }}>
            <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.15em", color: T.text.dim, marginBottom: 8, fontFamily: T.font.mono, fontWeight: 700 }}>Net Worth</p>
            <Mono size={38} weight={800} color={p?.netWorth != null && p.netWorth >= 0 ? T.accent.primary : T.status.red}>
                {p?.netWorth != null ? fmt(p.netWorth) : "—"}</Mono>
            {p?.netWorthDelta && <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                {String(p.netWorthDelta).includes("+") ? <ArrowUpRight size={14} color={T.status.green} /> :
                    <ArrowDownRight size={14} color={T.status.red} />}
                <Mono size={12} color={String(p.netWorthDelta).includes("+") ? T.status.green : T.status.red}>{p.netWorthDelta}</Mono>
            </div>}
        </Card>

        {/* Quick Metrics */}
        {quickMetrics.length > 0 && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            {quickMetrics.map(({ l, v, c }) => <Card key={l} style={{ padding: "14px 16px", marginBottom: 0 }}>
                <Label style={{ marginBottom: 5 }}>{l}</Label>
                <Mono size={18} weight={700} color={c}>{v != null ? fmt(v) : "—"}</Mono>
            </Card>)}
        </div>}

        {/* Next Action — Highest priority actionable item */}
        {
            p?.sections?.nextAction && <Card animate delay={100} variant="accent">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: T.accent.primaryDim, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Zap size={14} color={T.accent.primary} strokeWidth={2.5} /></div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.accent.primary }}>Next Action</span></div>
                <Md text={stripPaycheckParens(p.sections.nextAction)} />
            </Card>
        }

        {/* Predictive Alerts */}
        {(() => {
            const alerts = [];
            const realAudits = history.filter(a => !a.isTest && a.form);
            if (realAudits.length >= 2) {
                // Floor breach projection
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
                            alerts.push({
                                icon: "🚨", color: T.status.red,
                                title: "Floor Breach Risk",
                                text: `At current burn rate ($${Math.abs(weeklyDelta).toFixed(0)}/wk), checking hits your emergency floor by ${breachDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`
                            });
                        }
                    }
                }
                // Debt freedom projection
                const debtValues = recent.map(a => {
                    const debts = a.form?.debts || [];
                    return debts.reduce((s, d) => s + (parseFloat(d.balance) || 0), 0);
                }).reverse();
                if (debtValues.length >= 2 && debtValues[0] > 100) {
                    const weeklyPaydown = (debtValues[0] - debtValues[debtValues.length - 1]) / (debtValues.length - 1);
                    if (weeklyPaydown > 10) {
                        const currentDebt = debtValues[debtValues.length - 1];
                        const weeksToFree = Math.ceil(currentDebt / weeklyPaydown);
                        const freeDate = new Date();
                        freeDate.setDate(freeDate.getDate() + weeksToFree * 7);
                        alerts.push({
                            icon: "🎯", color: T.status.green,
                            title: "Debt Freedom Projection",
                            text: `At your current paydown pace ($${weeklyPaydown.toFixed(0)}/wk), you'll be debt-free by ${freeDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}.`
                        });
                    }
                }
                // Health score trend alert
                const scores = recent.filter(a => a.parsed?.healthScore?.score != null).map(a => a.parsed.healthScore.score).reverse();
                if (scores.length >= 3) {
                    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
                    const latest = scores[scores.length - 1];
                    if (latest < avg - 5) {
                        alerts.push({ icon: "📉", color: T.status.amber, title: "Score Declining", text: `Your health score dropped to ${latest} — below your ${scores.length}-week average of ${Math.round(avg)}.` });
                    } else if (latest > avg + 5 && latest >= 70) {
                        alerts.push({ icon: "📈", color: T.status.green, title: "Score Improving", text: `Health score hit ${latest} — ${Math.round(latest - avg)} points above your recent average. Keep it up!` });
                    }
                }
                // Tax Optimization projection (401k tax shield)
                if (financialConfig?.track401k && financialConfig?.k401ContributedYTD > 0 && financialConfig?.taxBracketPercent > 0) {
                    const taxSaved = financialConfig.k401ContributedYTD * (financialConfig.taxBracketPercent / 100);
                    alerts.push({
                        icon: "🛡️", color: T.accent.primary, title: "Tax Optimization",
                        text: `Your $${fmt(financialConfig.k401ContributedYTD)} in YTD 401k contributions has shielded approximately $${fmt(taxSaved)} from taxes at your ${financialConfig.taxBracketPercent}% bracket.`
                    });
                }
            }
            return alerts.length > 0 && <Card animate delay={150}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: `${T.status.amber}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Shield size={14} color={T.status.amber} strokeWidth={2.5} /></div>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Predictive Insights</span></div>
                {alerts.map((a, i) => <div key={i} style={{
                    display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px",
                    background: `${a.color}08`, border: `1px solid ${a.color}20`, borderRadius: T.radius.md,
                    marginBottom: i < alerts.length - 1 ? 8 : 0
                }}>
                    <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{a.icon}</span>
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: a.color, marginBottom: 2 }}>{a.title}</div>
                        <p style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.5, margin: 0 }}>{a.text}</p>
                    </div>
                </div>)}
            </Card>;
        })()}

        {/* Cash Flow Timeline Forecast */}
        {dashboardMetrics.checking != null && <CashFlowCalendar
            config={financialConfig}
            cards={cards}
            renewals={renewals}
            checkingBalance={dashboardMetrics.checking || 0}
            snapshotDate={current?.date}
        />}

        {/* Pace Bars — Progress tracking */}
        {p?.paceData?.length > 0 && <Card animate delay={200}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: T.accent.copperDim, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Target size={14} color={T.accent.copper} strokeWidth={2.5} /></div>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Sinking Funds</span></div>
            {p.paceData.map((d, i) => <PaceBar key={i} {...d} />)}
        </Card>}

        {/* Weekly Micro-Challenges */}
        <WeeklyChallenges />

        {/* Debt Payoff Simulator */}
        <DebtSimulator cards={cards} financialConfig={financialConfig} />

        {/* Chart — Analytical */}
        {chartData.length > 1 && <Card animate delay={250}>
            <Label>Net Worth Trend</Label>
            <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={chartData} margin={{ top: 30, right: 10, left: 10, bottom: 0 }}>
                    <defs>
                        <linearGradient id="nwG" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={T.accent.primary} stopOpacity={0.25} />
                            <stop offset="100%" stopColor={T.accent.primary} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: T.text.dim, fontFamily: T.font.mono }} axisLine={false} tickLine={false} />
                    <YAxis hide domain={["dataMin-200", "dataMax+200"]} />
                    <Tooltip contentStyle={{ background: T.bg.elevated, border: `1px solid ${T.border.default}`, borderRadius: T.radius.md, fontSize: 11, fontFamily: T.font.mono, boxShadow: T.shadow.elevated }}
                        formatter={v => [fmt(v), "Net Worth"]} />
                    <Area type="monotone" dataKey="nw" stroke={T.accent.primary} strokeWidth={2} fill="url(#nwG)" baseValue="dataMin"
                        dot={{ fill: T.accent.primary, r: 3, strokeWidth: 0 }} />
                </AreaChart>
            </ResponsiveContainer>
        </Card>}

        {/* Health Score Progress Chart — Analytical */}
        {(() => {
            const scoreData = history.filter(a => !a.isTest && a.parsed?.healthScore?.score != null)
                .slice(0, 12).reverse().map(a => {
                    const [y, m, d] = (a.date || "").split("-");
                    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                    return { date: m ? `${months[parseInt(m, 10) - 1]} ${d}` : "?", score: a.parsed.healthScore.score, grade: a.parsed.healthScore.grade };
                });
            return scoreData.length > 1 && <Card animate delay={300}>
                <Label>Health Score Progress</Label>
                <ResponsiveContainer width="100%" height={120}>
                    <AreaChart data={scoreData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                        <defs>
                            <linearGradient id="hsG" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={T.status.green} stopOpacity={0.25} />
                                <stop offset="100%" stopColor={T.status.green} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: T.text.dim, fontFamily: T.font.mono }} axisLine={false} tickLine={false} />
                        <YAxis hide domain={[0, 100]} />
                        <Tooltip contentStyle={{ background: T.bg.elevated, border: `1px solid ${T.border.default}`, borderRadius: T.radius.md, fontSize: 11, fontFamily: T.font.mono, boxShadow: T.shadow.elevated }}
                            formatter={(v, n, props) => [`${v}/100 (${props.payload.grade})`, "Health Score"]} />
                        <Area type="monotone" dataKey="score" stroke={T.status.green} strokeWidth={2} fill="url(#hsG)"
                            dot={{ fill: T.status.green, r: 3, strokeWidth: 0 }} />
                    </AreaChart>
                </ResponsiveContainer>
            </Card>;
        })()}

        {/* Achievement Badges Gallery */}
        {(() => {
            const unlockedCount = Object.keys(badges).length;
            return <Card animate delay={350}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 16 }}>🏆</span>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>Achievements</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: T.text.dim, fontFamily: T.font.mono }}>
                        {unlockedCount}/{BADGE_DEFINITIONS.length}
                    </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                    {BADGE_DEFINITIONS.map(b => {
                        const unlocked = !!badges[b.id];
                        const tc = TIER_COLORS[b.tier] || TIER_COLORS.bronze;
                        return <div key={b.id} title={unlocked ? `${b.name}: ${b.desc}` : "Locked"} style={{
                            padding: "8px 4px", borderRadius: T.radius.sm, textAlign: "center",
                            background: unlocked ? tc.bg : `${T.bg.elevated}60`,
                            border: `1px solid ${unlocked ? tc.border : T.border.default}`,
                            opacity: unlocked ? 1 : 0.35, transition: "all 0.3s ease",
                            cursor: "default"
                        }}>
                            <div style={{ fontSize: 20, marginBottom: 2 }}>{unlocked ? b.emoji : "🔒"}</div>
                            <div style={{
                                fontSize: 8, fontWeight: 700, color: unlocked ? tc.text : T.text.muted,
                                fontFamily: T.font.mono, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis",
                                whiteSpace: "nowrap"
                            }}>{b.name}</div>
                        </div>;
                    })}
                </div>
            </Card>;
        })()}

        {/* View Full Results */}
        <button onClick={onViewResult} style={{
            width: "100%", padding: "14px 16px", borderRadius: T.radius.lg,
            border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.secondary,
            fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            boxShadow: T.shadow.card
        }}>
            <Activity size={15} />View Full Results</button>

        {/* Share My Score */}
        {p?.healthScore && <button onClick={async () => {
            const hs = p.healthScore;
            const canvas = document.createElement("canvas");
            canvas.width = 400; canvas.height = 520;
            const ctx = canvas.getContext("2d");

            // Background gradient
            const bg = ctx.createLinearGradient(0, 0, 400, 520);
            bg.addColorStop(0, "#0F0D1A"); bg.addColorStop(1, "#1A1730");
            ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(0, 0, 400, 520, 20); ctx.fill();

            // Border
            ctx.strokeStyle = "rgba(130,120,255,0.2)"; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.roundRect(0, 0, 400, 520, 20); ctx.stroke();

            // Grade circle
            const scoreColor = (hs.score || 0) >= 80 ? "#10B981" : (hs.score || 0) >= 60 ? "#F59E0B" : "#EF4444";
            ctx.beginPath(); ctx.arc(200, 180, 80, 0, Math.PI * 2);
            const glow = ctx.createRadialGradient(200, 180, 40, 200, 180, 90);
            glow.addColorStop(0, scoreColor + "30"); glow.addColorStop(1, "transparent");
            ctx.fillStyle = glow; ctx.fill();
            ctx.beginPath(); ctx.arc(200, 180, 72, 0, Math.PI * 2);
            ctx.strokeStyle = scoreColor; ctx.lineWidth = 5; ctx.stroke();

            // Grade
            ctx.fillStyle = scoreColor; ctx.font = "bold 56px -apple-system, BlinkMacSystemFont, sans-serif";
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(hs.grade || "?", 200, 170);
            ctx.fillStyle = "#9CA3AF"; ctx.font = "600 16px -apple-system, sans-serif";
            ctx.fillText(`${hs.score || 0}/100`, 200, 210);

            // Title
            ctx.fillStyle = "#E5E7EB"; ctx.font = "800 12px -apple-system, sans-serif";
            ctx.letterSpacing = "4px";
            ctx.fillText("WEEKLY HEALTH SCORE", 200, 290);

            // Status
            ctx.fillStyle = sc; ctx.font = "700 14px -apple-system, sans-serif";
            ctx.fillText(p?.status || "", 200, 320);

            // Date
            ctx.fillStyle = "#6B7280"; ctx.font = "600 13px -apple-system, sans-serif";
            ctx.fillText(fmtDate(current.date), 200, 350);

            // Summary
            if (hs.summary) {
                ctx.fillStyle = "#9CA3AF"; ctx.font = "400 13px -apple-system, sans-serif";
                const words = hs.summary.split(" "); let lines = []; let line = "";
                for (const w of words) { if ((line + " " + w).length > 40) { lines.push(line); line = w; } else { line = line ? line + " " + w : w; } }
                if (line) lines.push(line);
                lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, 200, 385 + i * 20));
            }

            // Watermark
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
            // Unlock badge for sharing
            unlockBadge("shared_score").catch(() => { });
        }} style={{
            width: "100%", padding: "14px 16px", borderRadius: T.radius.lg, marginTop: 8,
            border: `1px solid ${T.accent.primary}30`, background: `${T.accent.primary}08`, color: T.accent.primary,
            fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            transition: "all 0.2s"
        }}>
            <ExternalLink size={15} />Share My Score
        </button>}

        {/* Next Audit Input */}
        <button onClick={onRunAudit} style={{
            width: "100%", padding: "16px", borderRadius: T.radius.lg, marginTop: 16,
            border: "none", background: `linear-gradient(135deg, ${T.accent.emerald}, #10B981)`, color: "#fff",
            fontSize: 15, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            boxShadow: `0 8px 24px ${T.accent.emerald}40`
        }}>
            <Plus size={18} strokeWidth={2.5} />Input Weekly Data</button>

        {/* Subtle legal disclaimer */}
        <p style={{ fontSize: 9, color: T.text.muted, textAlign: "center", marginTop: 14, lineHeight: 1.5, opacity: 0.6 }}>
            AI-generated educational content only · Not professional financial advice
        </p>
    </div >;
}
