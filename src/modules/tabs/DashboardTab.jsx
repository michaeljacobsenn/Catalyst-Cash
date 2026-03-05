import { useRef, useState, useEffect, useCallback, memo } from "react";
import Confetti from "react-confetti";
import {
    Zap, Plus, Target, Share2, Shield, CloudDownload, RefreshCw, Repeat,
    Activity, ReceiptText, ExternalLink, MessageCircle, CloudUpload,
    ArrowUpRight, ArrowDownRight, Download, TrendingUp
} from "lucide-react";
import { T } from "../constants.js";

import { fmt, fmtDate, exportAudit, shareAudit, stripPaycheckParens, db } from "../utils.js";
import { uploadToICloud } from "../cloudSync.js";
import { Card, Label, Badge, ProgressBar, InlineTooltip } from "../ui.jsx";
import { Mono, StatusDot, PaceBar, Md, CountUp, Section } from "../components.jsx";
import { unlockBadge } from "../badges.js";
import DebtSimulator from "./DebtSimulator.jsx";
import WeeklyChallenges from "./WeeklyChallenges.jsx";
import CashFlowCalendar from "./CashFlowCalendar.jsx";
import BudgetTab from "./BudgetTab.jsx";
import CreditScoreSimulator from "./CreditScoreSimulator.jsx";
import BillNegotiationCard from "./BillNegotiationCard.jsx";
import { haptic } from "../haptics.js";
import { shouldShowGating, getCurrentTier, isGatingEnforced } from "../subscription.js";
import ProPaywall, { ProBanner } from "./ProPaywall.jsx";
import ErrorBoundary from "../ErrorBoundary.jsx";
import { fetchAllBalancesAndLiabilities, applyBalanceSync, getConnections, saveConnectionLinks } from "../plaid.js";
import "./DashboardTab.css";
import { useCoachmark, COACHMARKS } from "../coachmarks.js";
import Coachmark from "../Coachmark.jsx";

import { useAudit } from '../contexts/AuditContext.jsx';
import { useSettings } from '../contexts/SettingsContext.jsx';
import { usePortfolio } from '../contexts/PortfolioContext.jsx';
import { useNavigation } from '../contexts/NavigationContext.jsx';

// ── Extracted dashboard components ──
import useDashboardData from '../dashboard/useDashboardData.js';
import HealthGauge from '../dashboard/HealthGauge.jsx';
import AlertStrip from '../dashboard/AlertStrip.jsx';
import MetricsBar from '../dashboard/MetricsBar.jsx';
import FireCard from '../dashboard/FireCard.jsx';
import SinkingFundsRing from '../dashboard/SinkingFundsRing.jsx';
import AnalyticsCharts from '../dashboard/AnalyticsCharts.jsx';
import BadgeStrip from '../dashboard/BadgeStrip.jsx';
import DebtFreedomCard from '../dashboard/DebtFreedomCard.jsx';
import EmptyDashboard from '../dashboard/EmptyDashboard.jsx';

const SYNC_COOLDOWNS = { free: 60 * 60 * 1000, pro: 5 * 60 * 1000 };

export default memo(function DashboardTab({ onRestore, proEnabled = false, onDemoAudit, onRefreshDashboard, onViewTransactions, onDiscussWithCFO }) {
    const { current, history } = useAudit();
    const { financialConfig, setFinancialConfig, autoBackupInterval } = useSettings();
    const { cards, setCards, bankAccounts, setBankAccounts, renewals, badges } = usePortfolio();
    const { navTo, setSetupReturnTab } = useNavigation();
    const [showPaywall, setShowPaywall] = useState(false);
    const [syncing, setSyncing] = useState(false);

    // ── Plaid Balance Sync (same logic as Accounts tab) ──
    const handleSyncBalances = useCallback(async () => {
        if (syncing) return;
        const conns = await getConnections();
        if (conns.length === 0) {
            if (window.toast) window.toast.info("No bank connections — connect via Settings → Plaid");
            return;
        }
        if (isGatingEnforced()) {
            const tier = await getCurrentTier();
            const cooldown = SYNC_COOLDOWNS[tier.id] || SYNC_COOLDOWNS.free;
            const lastSync = cards.find(c => c._plaidLastSync)?._plaidLastSync
                || bankAccounts.find(b => b._plaidLastSync)?._plaidLastSync;
            if (lastSync && (Date.now() - new Date(lastSync).getTime()) < cooldown) {
                const minsLeft = Math.ceil((cooldown - (Date.now() - new Date(lastSync).getTime())) / 60000);
                if (window.toast) window.toast.info(`Next sync in ${minsLeft} min`);
                return;
            }
        }
        setSyncing(true);
        try {
            const results = await fetchAllBalancesAndLiabilities();
            let allCards = [...cards];
            let allBanks = [...bankAccounts];
            let allInvests = [...(financialConfig.plaidInvestments || [])];
            let investmentsChanged = false;
            let successCount = 0;
            for (const res of results) {
                if (!res._error) {
                    const syncData = applyBalanceSync(res, allCards, allBanks, allInvests);
                    allCards = syncData.updatedCards;
                    allBanks = syncData.updatedBankAccounts;
                    if (syncData.updatedPlaidInvestments) { allInvests = syncData.updatedPlaidInvestments; investmentsChanged = true; }
                    await saveConnectionLinks(res);
                    successCount++;
                }
            }
            setCards(allCards);
            setBankAccounts(allBanks);
            if (investmentsChanged) setFinancialConfig({ ...financialConfig, plaidInvestments: allInvests });
            if (successCount > 0) {
                haptic.success();
                if (window.toast) window.toast.success("Balances synced — run a new audit to reflect updated numbers");
            } else {
                if (window.toast) window.toast.error("Sync failed — check your connection");
            }
        } catch (e) {
            console.error("[Dashboard] Sync failed:", e);
            if (window.toast) window.toast.error("Failed to sync balances");
        } finally { setSyncing(false); }
    }, [syncing, cards, bankAccounts, financialConfig, setCards, setBankAccounts, setFinancialConfig]);

    const onRunAudit = () => navTo("input");
    const onViewResult = () => navTo("results", current);
    const onGoSettings = () => { setSetupReturnTab("dashboard"); navTo("settings"); };

    const p = current?.parsed;
    const {
        dashboardMetrics, floor, investmentSnapshot, fireProjection,
        streak, chartData, scoreData, spendData, chartA11y,
        freedomStats, alerts
    } = useDashboardData();

    // Main Segmented View Toggle
    const [viewMode, setViewMode] = useState("command"); // 'command' | 'budget' | 'results'

    // Confetti
    const [runConfetti, setRunConfetti] = useState(false);
    const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
    const prevCurrentTs = useRef(current?.ts);

    useEffect(() => {
        const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // ── Streak milestone celebration ──
    const STREAK_MILESTONES = {
        4: { emoji: "🔥", label: "1 Month Strong!" },
        8: { emoji: "💪", label: "2 Months of Consistency!" },
        12: { emoji: "🏆", label: "Quarter Master!" },
        26: { emoji: "⚡", label: "Half-Year Hero!" },
        52: { emoji: "👑", label: "Full Year. Legend." },
    };
    const streakMilestoneChecked = useRef(false);

    useEffect(() => {
        if (current?.ts !== prevCurrentTs.current) {
            prevCurrentTs.current = current?.ts;
            if (current?.parsed?.healthScore?.score >= 95 && !current?.isTest) {
                setRunConfetti(true);
                setTimeout(() => setRunConfetti(false), 8000);
            }
        }
    }, [current]);

    useEffect(() => {
        if (streakMilestoneChecked.current || !streak) return;
        streakMilestoneChecked.current = true;
        const m = STREAK_MILESTONES[streak];
        if (m) {
            (async () => {
                const key = `streak-milestone-${streak}`;
                const seen = await db.get(key);
                if (!seen) {
                    await db.set(key, true);
                    setRunConfetti(true);
                    setTimeout(() => setRunConfetti(false), 6000);
                    if (window.toast) window.toast.success(`${m.emoji} W${streak}: ${m.label}`);
                }
            })();
        }
    }, [streak]);

    // ── Backup nudge logic ──
    const [showBackupNudge, setShowBackupNudge] = useState(false);
    const [backingUp, setBackingUp] = useState(false);
    useEffect(() => {
        if (autoBackupInterval && autoBackupInterval !== "off") return; // auto-backup is on, no nudge needed
        (async () => {
            const dismissed = await db.get("backup-nudge-dismissed");
            if (dismissed && Date.now() - dismissed < 7 * 86400000) return; // dismissed within 7 days
            const lastTs = await db.get("last-backup-ts");
            if (!lastTs || Date.now() - lastTs > 7 * 86400000) {
                setShowBackupNudge(true);
            }
        })();
    }, [autoBackupInterval]);

    const handleBackupNow = async () => {
        setBackingUp(true);
        try {
            const backup = { app: "Catalyst Cash", version: "2.0", exportedAt: new Date().toISOString(), data: {} };
            const keys = await db.keys();
            for (const key of keys) {
                const val = await db.get(key);
                if (val !== null) backup.data[key] = val;
            }
            await uploadToICloud(backup, null);
            await db.set("last-backup-ts", Date.now());
            setShowBackupNudge(false);
            if (window.toast) window.toast.success("✅ Backed up to iCloud");
        } catch (e) {
            if (window.toast) window.toast.error("Backup failed: " + (e.message || "Unknown error"));
        }
        setBackingUp(false);
    };

    const dismissBackupNudge = async () => {
        await db.set("backup-nudge-dismissed", Date.now());
        setShowBackupNudge(false);
    };

    // ── Welcome-back greeting ──
    const greeting = (() => {
        const hour = new Date().getHours();
        const timeGreet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
        // Check days since last audit
        if (current?.date) {
            const daysSince = Math.floor((Date.now() - new Date(current.date).getTime()) / 86400000);
            if (daysSince >= 7) return `Welcome back! It's been ${daysSince} days — let's catch up.`;
        }
        if (streak > 1) return `${timeGreet}. W${streak} streak going strong 🔥`;
        return `${timeGreet}. Let's check your numbers.`;
    })();

    // ── EMPTY STATE ──
    if (!current) {
        return <EmptyDashboard
            investmentSnapshot={investmentSnapshot}
            viewMode={viewMode} setViewMode={setViewMode}
            onRestore={onRestore} onDemoAudit={onDemoAudit}
        />;
    }

    // ── ACTIVE DASHBOARD ──
    const rawStatus = String(p?.status || "UNKNOWN").toUpperCase();
    const cleanStatus = rawStatus.includes("GREEN") ? "GREEN" : rawStatus.includes("RED") ? "RED" : rawStatus.includes("YELLOW") ? "YELLOW" : "UNKNOWN";
    const sc = cleanStatus === "GREEN" ? T.status.green : cleanStatus === "YELLOW" ? T.status.amber : cleanStatus === "RED" ? T.status.red : T.text.dim;
    const hs = p?.healthScore || {};
    const score = typeof hs.score === "number" ? hs.score : 0;
    const grade = hs.grade || "?";
    const summary = hs.summary || "";
    const scoreColor = score >= 80 ? T.status.green : score >= 60 ? T.status.amber : T.status.red;

    // ── Synthetic Percentile (client-side, no real user data) ──
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

    return <div className="page-body" aria-live="polite" style={{ paddingBottom: 0 }}>

        {runConfetti && <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, pointerEvents: "none" }}>
            <Confetti width={windowSize.width} height={windowSize.height} recycle={false} numberOfPieces={400} gravity={0.15} />
        </div>}

        {/* Welcome-back Greeting */}
        <div style={{
            padding: "8px 14px", marginBottom: 10, borderRadius: T.radius.md,
            background: `linear-gradient(135deg, ${T.accent.primary}06, ${T.accent.emerald}06)`,
            border: `1px solid ${T.border.subtle}`,
        }}>
            <span style={{ fontSize: 12, color: T.text.secondary, fontWeight: 600 }}>{greeting}</span>
        </div>

        {/* ═══ BACKUP NUDGE ═══ */}
        {showBackupNudge && <Card style={{
            borderLeft: `3px solid ${T.status.amber}`, background: `${T.status.amberDim}`,
            padding: "10px 14px", marginBottom: 10, animation: "fadeInUp .4s ease-out"
        }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Shield size={14} color={T.status.amber} />
                <span style={{ fontSize: 11, fontWeight: 800, color: T.status.amber, fontFamily: T.font.mono, letterSpacing: "0.04em" }}>BACKUP REMINDER</span>
                <button onClick={dismissBackupNudge} style={{ marginLeft: "auto", background: "none", border: "none", color: T.text.dim, cursor: "pointer", fontSize: 16, padding: 4, lineHeight: 1 }}>×</button>
            </div>
            <p style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.4, margin: "0 0 8px" }}>Your data hasn't been backed up recently. Protect your financial data.</p>
            <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleBackupNow} disabled={backingUp} className="hover-btn" style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                    padding: "8px 12px", borderRadius: T.radius.md, border: "none",
                    background: `linear-gradient(135deg, ${T.status.amber}, #D97706)`,
                    color: "#fff", fontSize: 11, fontWeight: 800, cursor: "pointer", opacity: backingUp ? 0.6 : 1
                }}><CloudUpload size={13} />{backingUp ? "Backing up..." : "Back Up Now"}</button>
                <button onClick={() => { dismissBackupNudge(); navTo("settings"); }} className="hover-btn" style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                    padding: "8px 12px", borderRadius: T.radius.md,
                    border: `1px solid ${T.status.amber}40`, background: `${T.status.amber}10`,
                    color: T.status.amber, fontSize: 11, fontWeight: 700, cursor: "pointer"
                }}>Enable Auto-Backup</button>
            </div>
        </Card>}

        {/* Segmented View Toggle & Global Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1, display: "flex", background: T.bg.elevated, padding: 3, borderRadius: T.radius.lg, border: `1px solid ${T.border.subtle} ` }}>
                {[{ id: "command", label: "Command Center" }, { id: "budget", label: "Weekly Budget" }, { id: "results", label: "Results" }].map(v => (
                    <button key={v.id} className="a11y-hit-target hover-btn" onClick={() => { haptic.selection(); setViewMode(v.id); }} style={{
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
        ) : viewMode === "results" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {current ? (
                    <>
                        <Card animate variant="glass" className="hover-card" style={{
                            padding: 0, overflow: "hidden",
                            border: `1px solid ${scoreColor}25`
                        }}>
                            <div style={{ padding: "20px", display: "flex", alignItems: "center", gap: 16 }}>
                                <div style={{ position: "relative", width: 56, height: 56, flexShrink: 0 }}>
                                    <svg viewBox="0 0 120 120" width={56} height={56}>
                                        <circle cx="60" cy="60" r="48" fill="none" stroke={`${T.border.default}`} strokeWidth="6" />
                                        <circle cx="60" cy="60" r="48" fill="none" stroke={scoreColor} strokeWidth="6"
                                            strokeDasharray={`${2 * Math.PI * 48}`}
                                            strokeDashoffset={`${2 * Math.PI * 48 * (1 - (score || 0) / 100)}`}
                                            strokeLinecap="round" transform="rotate(-90 60 60)"
                                            style={{ transition: "stroke-dashoffset 1s ease" }} />
                                        <text x="60" y="60" textAnchor="middle" dominantBaseline="central"
                                            style={{ fontSize: 24, fontWeight: 900, fill: scoreColor, fontFamily: T.font.mono }}>
                                            {score || "\u2014"}
                                        </text>
                                    </svg>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 16, fontWeight: 800, color: T.text.primary, marginBottom: 4 }}>Latest Audit</div>
                                    <div style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono }}>{current.date ? fmtDate(current.date) : "Today"}</div>
                                    {rawStatus && <Badge variant={rawStatus.includes("GREEN") ? "green" : rawStatus.includes("RED") ? "red" : "amber"} style={{ marginTop: 6, fontSize: 9 }}>{rawStatus}</Badge>}
                                </div>
                            </div>
                            <div style={{ display: "flex", borderTop: `1px solid ${T.border.subtle}` }}>
                                <button onClick={onViewResult} className="hover-btn" style={{
                                    flex: 1, padding: "14px", border: "none", borderRight: `1px solid ${T.border.subtle}`,
                                    background: "transparent", color: T.accent.primary, fontSize: 13, fontWeight: 700,
                                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                                }}><Target size={14} /> View Full Results</button>
                                <button onClick={onRunAudit} className="hover-btn" style={{
                                    flex: 1, padding: "14px", border: "none",
                                    background: "transparent", color: T.accent.emerald, fontSize: 13, fontWeight: 700,
                                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                                }}><Zap size={14} /> New Audit</button>
                            </div>
                        </Card>

                        {p?.sections?.dashboard && <Card animate delay={50}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                                <Activity size={14} color={T.text.secondary} />
                                <span style={{ fontSize: 12, fontWeight: 700, color: T.text.secondary }}>Dashboard Summary</span>
                            </div>
                            <div style={{
                                display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
                                overflow: "hidden", textOverflow: "ellipsis", position: "relative"
                            }}>
                                <Md text={typeof p.sections.dashboard === "string" ? p.sections.dashboard.slice(0, 500) : ""} />
                                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "1.5em", background: `linear-gradient(transparent, ${T.bg.card})`, pointerEvents: "none" }} />
                            </div>
                        </Card>}
                    </>
                ) : (
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
                )}

                <button onClick={() => { haptic.light(); navTo("history"); }} className="hover-btn" style={{
                    width: "100%", padding: "16px", borderRadius: T.radius.lg,
                    border: `1px solid ${T.border.subtle}`, background: T.bg.elevated,
                    color: T.text.primary, fontSize: 14, fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8
                }}><Activity size={16} /> View Audit History</button>
            </div>
        ) : (
            <>
                {/* Demo Banner */}
                {current?.isTest && <Card style={{
                    borderLeft: `3px solid ${T.status.amber} `, background: `${T.status.amberDim} `,
                    padding: "10px 14px", marginBottom: 10
                }}>
                    <div data-no-swipe="true" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
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

                {/* Pro Upgrade Banner */}
                {shouldShowGating() && <ProBanner onUpgrade={() => setShowPaywall(true)} label="Upgrade to Pro" sublabel="60 audits/mo · Premium AI · Full history" />}
                {showPaywall && <ProPaywall onClose={() => setShowPaywall(false)} />}

                {/* ═══ COMMAND HEADER — Consolidated Hero ═══ */}
                <Card animate className="hover-card" style={{
                    padding: 0, marginBottom: 16, overflow: "hidden", position: "relative",
                    background: T.bg.card,
                    backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
                    border: `1px solid ${scoreColor}25`,
                    boxShadow: `0 12px 40px -12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 40px ${scoreColor}15`, zIndex: 0
                }}>
                    <div style={{
                        position: "absolute", inset: -50, zIndex: -1,
                        background: `radial-gradient(circle at 80% 0%, ${scoreColor}25, transparent 45%), radial-gradient(circle at 20% 100%, ${T.accent.primary}15, transparent 40%)`,
                        backgroundSize: "200% 200%",
                        animation: "ambientGlow 12s ease-in-out infinite alternate"
                    }} />
                    {/* Top section: Score gauge + Net Worth */}
                    <div style={{ padding: "20px 18px 14px", display: "flex", alignItems: "center", gap: 16 }}>
                        {hs.score != null && <HealthGauge score={score} grade={grade} scoreColor={scoreColor} percentile={percentile} />}

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
                            <p style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: T.text.secondary, marginBottom: 4, fontFamily: T.font.mono, fontWeight: 700 }}>Net Worth</p>
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
                    <MetricsBar quickMetrics={quickMetrics} />
                </Card>

                {/* ═══ SYNC BALANCES BAR ═══ */}
                {!current?.isTest && (cards.some(c => c._plaidAccountId) || bankAccounts.some(b => b._plaidAccountId)) && (
                    <button onClick={() => { haptic.medium(); handleSyncBalances(); }} disabled={syncing} className="hover-btn" style={{
                        width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        padding: "10px 16px", borderRadius: T.radius.md, marginBottom: 10,
                        border: `1px solid ${T.status.blue}20`, background: `linear-gradient(135deg, ${T.bg.elevated}, ${T.status.blue}08)`,
                        color: T.status.blue, cursor: syncing ? "wait" : "pointer", transition: "all .2s",
                        opacity: syncing ? 0.7 : 1
                    }}>
                        <RefreshCw size={14} strokeWidth={2.5} style={{ animation: syncing ? "ringSweep 1s linear infinite" : "none" }} />
                        <span style={{ fontSize: 11, fontWeight: 800, fontFamily: T.font.mono, letterSpacing: "0.02em" }}>
                            {syncing ? "SYNCING…" : "SYNC BALANCES"}
                        </span>
                        {(() => {
                            const lastSync = cards.find(c => c._plaidLastSync)?._plaidLastSync
                                || bankAccounts.find(b => b._plaidLastSync)?._plaidLastSync;
                            if (!lastSync) return null;
                            const ago = Math.round((Date.now() - new Date(lastSync).getTime()) / 60000);
                            return <span style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono }}>
                                {ago < 1 ? "just now" : ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`}
                            </span>;
                        })()}
                    </button>
                )}

                {/* ═══ AUDIT ACTION HUB ═══ */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                    <button onClick={() => { haptic.medium(); onRunAudit(); }} className="hover-btn" style={{
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
                        padding: "14px 6px", borderRadius: T.radius.md, border: `1px solid ${T.accent.primary}30`,
                        background: `linear-gradient(145deg, ${T.bg.elevated}, ${T.accent.primary}0A)`,
                        color: T.text.primary, cursor: "pointer", transition: "all .2s", boxShadow: `0 4px 12px ${T.accent.primary}10`
                    }}>
                        <div style={{ width: 32, height: 32, borderRadius: 16, background: `${T.accent.primary}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Plus size={16} color={T.accent.primary} strokeWidth={3} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 800, fontFamily: T.font.mono, letterSpacing: "0.02em" }}>NEW AUDIT</span>
                    </button>
                    <button onClick={() => { haptic.light(); onViewResult(); }} className="hover-btn" style={{
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
                        padding: "14px 6px", borderRadius: T.radius.md, border: `1px solid ${T.border.subtle}`,
                        background: T.bg.elevated, color: T.text.primary, cursor: "pointer", transition: "all .2s"
                    }}>
                        <div style={{ width: 32, height: 32, borderRadius: 16, background: `${T.text.dim}10`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Target size={16} color={T.text.secondary} strokeWidth={2.5} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 800, fontFamily: T.font.mono, letterSpacing: "0.02em" }}>RESULTS</span>
                    </button>
                    <button onClick={() => { haptic.light(); navTo("history"); }} className="hover-btn" style={{
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
                        padding: "14px 6px", borderRadius: T.radius.md, border: `1px solid ${T.border.subtle}`,
                        background: T.bg.elevated, color: T.text.primary, cursor: "pointer", transition: "all .2s"
                    }}>
                        <div style={{ width: 32, height: 32, borderRadius: 16, background: `${T.text.dim}10`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Activity size={16} color={T.text.secondary} strokeWidth={2.5} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 800, fontFamily: T.font.mono, letterSpacing: "0.02em" }}>HISTORY</span>
                    </button>
                    <button onClick={() => { haptic.light(); if (proEnabled) { onViewTransactions?.(); } else { setShowPaywall(true); } }} className="hover-btn" style={{
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
                        padding: "14px 6px", borderRadius: T.radius.md, border: `1px solid ${T.border.subtle}`,
                        background: T.bg.elevated, color: T.text.primary, cursor: "pointer", transition: "all .2s",
                        position: "relative"
                    }}>
                        {!proEnabled && <div style={{ position: "absolute", top: 6, right: 6, fontSize: 8, fontWeight: 800, background: T.accent.primary, color: "#fff", padding: "1px 5px", borderRadius: 6, fontFamily: T.font.mono }}>PRO</div>}
                        <div style={{ width: 32, height: 32, borderRadius: 16, background: `${T.accent.emerald}12`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <ReceiptText size={16} color={T.accent.emerald} strokeWidth={2.5} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 800, fontFamily: T.font.mono, letterSpacing: "0.02em" }}>LEDGER</span>
                    </button>
                </div>

                {/* ═══ ALERT STRIP ═══ */}
                <AlertStrip alerts={alerts} />

                {/* ═══ DEBT FREEDOM COUNTDOWN ═══ */}
                <DebtFreedomCard cards={cards} freedomStats={freedomStats} />

                {/* ═══ NEXT ACTION ═══ */}
                {p?.sections?.nextAction && <Card animate delay={100} variant="glass" style={{
                    animation: "pulseBorder 4s infinite alternate",
                    border: `1.5px solid ${T.accent.primary}50`,
                    background: `linear-gradient(135deg, ${T.bg.card}, ${T.accent.primary}0D)`
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: `linear-gradient(135deg, ${T.accent.primary}, #6C60FF)`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 12px ${T.accent.primary}60` }}>
                            <Zap size={15} color="#fff" strokeWidth={2.5} /></div>
                        <span style={{ fontSize: 13, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>Prioritized Next Action</span></div>
                    <div style={{
                        display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical",
                        overflow: "hidden", textOverflow: "ellipsis", position: "relative"
                    }}>
                        <Md text={stripPaycheckParens(p.sections.nextAction)} />
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "1.5em", background: `linear-gradient(transparent, ${T.bg.card})`, pointerEvents: "none" }} />
                    </div>
                </Card>}

                {/* ═══ DISCUSS WITH CFO ═══ */}
                {p && onDiscussWithCFO && <button
                    className="hover-btn"
                    onClick={() => {
                        haptic.light();
                        const status = p?.status || "unknown";
                        const hsScore = p?.healthScore?.score;
                        const nextAction = p?.sections?.nextAction || "";
                        const prompt = `I just reviewed my latest audit (Status: ${status}${hsScore != null ? `, Health Score: ${hsScore}/100` : ""}). ${nextAction ? `My next action says: "${nextAction.slice(0, 200)}"` : ""} Walk me through what I should focus on right now and explain why.`;
                        onDiscussWithCFO(prompt);
                    }}
                    style={{
                        width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        padding: "13px 20px", borderRadius: T.radius.lg,
                        border: `1px solid ${T.accent.primary}30`,
                        background: `linear-gradient(135deg, ${T.accent.primaryDim}, ${T.accent.primary}08)`,
                        color: T.accent.primary, fontSize: 13, fontWeight: 700,
                        cursor: "pointer", transition: "all .25s cubic-bezier(.16,1,.3,1)",
                        marginTop: 4, marginBottom: 8,
                        boxShadow: `0 2px 12px ${T.accent.primary}15`
                    }}
                >
                    <MessageCircle size={15} strokeWidth={2.5} />
                    Discuss with CFO
                </button>}

                {/* ═══ CREDIT SCORE SIMULATOR ═══ */}
                <ErrorBoundary name="Credit Score Simulator">
                    <CreditScoreSimulator cards={cards} financialConfig={financialConfig} />
                </ErrorBoundary>

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
                <FireCard fireProjection={fireProjection} />

                {/* ═══ BILL NEGOTIATION ═══ */}
                <ErrorBoundary name="Bill Negotiation">
                    <BillNegotiationCard cards={cards} financialConfig={financialConfig} />
                </ErrorBoundary>

                {/* ═══ SINKING FUNDS ═══ */}
                <SinkingFundsRing paceData={p?.paceData} />

                {/* ═══ WEEKLY CHALLENGES ═══ */}
                <WeeklyChallenges />

                {/* ═══ DEBT PAYOFF SIMULATOR ═══ */}
                <ErrorBoundary name="Debt Simulator">
                    <DebtSimulator cards={cards} financialConfig={financialConfig} />
                </ErrorBoundary>

                {/* ═══ ANALYTICS ═══ */}
                <AnalyticsCharts chartData={chartData} scoreData={scoreData} spendData={spendData} chartA11y={chartA11y} />

                {/* ═══ ACHIEVEMENTS ═══ */}
                <BadgeStrip badges={badges} />

                {/* ═══ BOTTOM CTAs ═══ */}
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
                        const bg = ctx.createLinearGradient(0, 0, W, H);
                        bg.addColorStop(0, "#0B0A14"); bg.addColorStop(0.5, "#0F0D1A"); bg.addColorStop(1, "#14122A");
                        ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(0, 0, W, H, 24); ctx.fill();
                        const glow = ctx.createRadialGradient(W / 2, 200, 20, W / 2, 200, 130);
                        glow.addColorStop(0, scoreColor + "20"); glow.addColorStop(1, "transparent");
                        ctx.fillStyle = glow; ctx.fillRect(0, 50, W, 300);
                        ctx.strokeStyle = `${scoreColor}25`; ctx.lineWidth = 1.5;
                        ctx.beginPath(); ctx.roundRect(1, 1, W - 2, H - 2, 24); ctx.stroke();
                        ctx.beginPath(); ctx.arc(W / 2, 200, 82, Math.PI * 0.75, Math.PI * 2.25);
                        ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 7; ctx.lineCap = "round"; ctx.stroke();
                        const endAngle = Math.PI * 0.75 + (score / 100) * Math.PI * 1.5;
                        ctx.beginPath(); ctx.arc(W / 2, 200, 82, Math.PI * 0.75, endAngle);
                        const ringGrad = ctx.createLinearGradient(W / 2 - 82, 200, W / 2 + 82, 200);
                        ringGrad.addColorStop(0, scoreColor); ringGrad.addColorStop(1, scoreColor + "CC");
                        ctx.strokeStyle = ringGrad; ctx.lineWidth = 7; ctx.lineCap = "round"; ctx.stroke();
                        ctx.fillStyle = scoreColor; ctx.font = "bold 60px -apple-system, BlinkMacSystemFont, sans-serif";
                        ctx.textAlign = "center"; ctx.textBaseline = "middle";
                        ctx.fillText(hs.grade || "?", W / 2, 190);
                        ctx.fillStyle = "#9CA3AF"; ctx.font = "700 17px -apple-system, sans-serif";
                        ctx.fillText(`${hs.score || 0}/100`, W / 2, 228);
                        if (percentile > 0) {
                            ctx.fillStyle = scoreColor + "18";
                            ctx.beginPath(); ctx.roundRect(W / 2 - 50, 258, 100, 22, 11); ctx.fill();
                            ctx.strokeStyle = scoreColor + "30"; ctx.lineWidth = 1;
                            ctx.beginPath(); ctx.roundRect(W / 2 - 50, 258, 100, 22, 11); ctx.stroke();
                            ctx.fillStyle = scoreColor; ctx.font = "800 10px -apple-system, sans-serif";
                            ctx.fillText(`Top ${100 - percentile}% of users`, W / 2, 271);
                        }
                        ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 1;
                        ctx.beginPath(); ctx.moveTo(40, 300); ctx.lineTo(W - 40, 300); ctx.stroke();
                        ctx.fillStyle = "#E5E7EB"; ctx.font = "800 13px -apple-system, sans-serif";
                        ctx.fillText("WEEKLY HEALTH SCORE", W / 2, 330);
                        ctx.fillStyle = sc; ctx.font = "700 15px -apple-system, sans-serif";
                        ctx.fillText(cleanStatus, W / 2, 358);
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
                        if (hs.summary) {
                            ctx.fillStyle = "#8890A6"; ctx.font = "400 13px -apple-system, sans-serif";
                            const words = hs.summary.split(" "); let lines = []; let line = "";
                            for (const w of words) { if ((line + " " + w).length > 44) { lines.push(line); line = w; } else { line = line ? line + " " + w : w; } }
                            if (line) lines.push(line);
                            lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, W / 2, 425 + i * 20));
                        }
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
