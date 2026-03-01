import { useState, memo } from "react";
import { TrendingUp, AlertTriangle, Clock, ChevronDown, ChevronUp, Activity, RefreshCw, CheckSquare, Target, Zap } from "lucide-react";
import { T } from "../constants.js";
import { fmtDate, stripPaycheckParens } from "../utils.js";
import { Card, Badge, InlineTooltip } from "../ui.jsx";
import { Mono, Section, MoveRow, Md } from "../components.jsx";

import { useSettings } from '../contexts/SettingsContext.jsx';
import { useAudit } from '../contexts/AuditContext.jsx';

export default memo(function ResultsView({ audit, moveChecks, onToggleMove, streak = 0 }) {
    const { financialConfig } = useSettings();
    const { history } = useAudit();
    const [showRaw, setShowRaw] = useState(false);
    if (!audit) return <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        height: "60vh", padding: 32, textAlign: "center"
    }}>
        <Activity size={28} color={T.text.muted} style={{ marginBottom: 14, opacity: .4 }} />
        <p style={{ fontSize: 14, fontWeight: 600, color: T.text.dim }}>No results yet</p></div>;
    const p = audit.parsed || {};
    const sections = p.sections || {};
    return <div className="page-body" style={{ paddingBottom: 0 }}>
        <div style={{ padding: "14px 0 12px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div><h1 style={{ fontSize: 22, fontWeight: 800 }}>Full Results</h1>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <Mono size={11} color={T.text.dim}>{fmtDate(audit.date)}</Mono>
                </div>
            </div>
            {audit.isTest && <Badge variant="amber" style={{ marginTop: 4 }}>TEST · NOT SAVED</Badge>}
        </div>

        {/* Completion Percentage */}
        {p?.moveItems?.length > 0 && (() => {
            const done = Object.values(moveChecks).filter(Boolean).length;
            const total = p.moveItems.length;
            const pct = Math.round((done / total) * 100);
            const pctColor = pct >= 80 ? T.status.green : pct >= 40 ? T.status.amber : T.text.dim;
            return <div style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                background: `${pctColor}10`, border: `1px solid ${pctColor}25`,
                borderRadius: T.radius.md, marginBottom: 8, animation: "fadeInUp .4s ease-out both"
            }}>
                <div style={{
                    width: 36, height: 36, borderRadius: "50%", position: "relative",
                    background: `conic-gradient(${pctColor} ${pct * 3.6}deg, ${T.border.default} ${pct * 3.6}deg)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: T.bg.card, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontSize: 10, fontWeight: 900, color: pctColor, fontFamily: T.font.mono }}>{pct}%</span>
                    </div>
                </div>
                <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.text.primary }}>{done}/{total} Moves Complete</div>
                    <div style={{ fontSize: 10, color: T.text.dim }}>{pct >= 100 ? "All done! 🎉" : "Keep going — check off your weekly moves"}</div>
                </div>
            </div>;
        })()}

        {sections.alerts && !/^\s*(no\s*alerts|omit|none|\[\])\s*$/i.test(sections.alerts) && sections.alerts.length > 5 && (
            <Card animate style={{ borderColor: `${T.status.amber}18`, background: T.status.amberDim, borderLeft: `3px solid ${T.status.amber}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: `${T.status.amber}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <AlertTriangle size={14} color={T.status.amber} strokeWidth={2.5} /></div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.status.amber }}>Alerts</span></div>
                <Md text={sections.alerts} /></Card>)}
        {sections.nextAction && <Card animate delay={75} variant="accent">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: T.accent.primaryDim, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Zap size={14} color={T.accent.primary} strokeWidth={2.5} /></div>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.accent.primary }}>Next Action</span></div>
            <Md text={stripPaycheckParens(sections.nextAction)} /></Card>}
        <Section title="Dashboard" icon={Activity} content={sections.dashboard} accentColor={T.accent.primary} delay={50} badge={<Badge variant="teal">CORE</Badge>} />
        {p.moveItems?.length > 0 && <Card animate delay={100}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: T.accent.primaryDim, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <CheckSquare size={14} color={T.accent.primary} strokeWidth={2.5} /></div>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Weekly Moves</span></div>
                <Mono size={10} color={T.text.dim}>{Object.values(moveChecks).filter(Boolean).length}/{p.moveItems.length}</Mono></div>
            {p.moveItems.map((m, i) => <MoveRow key={i} item={m} index={i} checked={moveChecks[i] || false} onToggle={() => onToggleMove(i)} />)}
        </Card>}
        <Section title="Radar — 90 Days" icon={Target} content={sections.radar} accentColor={T.status.amber} delay={150} />
        <Section title="Long-Range Radar" icon={Clock} content={sections.longRange} accentColor={T.text.secondary} defaultOpen={false} delay={200} />
        <Section title="Forward Radar" icon={TrendingUp} content={sections.forwardRadar} accentColor={T.status.blue} defaultOpen={false} delay={250} />
        <Section title="Investments & Roth" icon={TrendingUp} content={sections.investments} accentColor={T.accent.primary} delay={300} />

        {/* ── FREEDOM JOURNEY SUMMARY ── */}
        <Card animate delay={350} style={{
            background: `linear-gradient(135deg, ${T.status.green}0A, ${T.status.blue}0A)`,
            borderColor: `${T.status.green}20`
        }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: `${T.status.green}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Target size={14} color={T.status.green} strokeWidth={2.5} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: T.text.primary }}>Freedom Journey</span>
            </div>

            {(() => {
                const realAudits = history.filter(a => !a.isTest && a.form);
                if (realAudits.length < 2) return <p style={{ fontSize: 11, color: T.text.dim }}>Complete more audits to see your momentum and projections.</p>;

                const latest = realAudits[0];
                const prev = realAudits[1];
                const parts = [];

                // 1. Debt-free estimate
                const debtValues = realAudits.slice(0, 4).map(a => (a.form?.debts || []).reduce((s, d) => s + (parseFloat(d.balance) || 0), 0)).reverse();
                if (debtValues.length >= 2 && debtValues[0] > 100) {
                    const weeklyPaydown = (debtValues[0] - debtValues[debtValues.length - 1]) / (debtValues.length - 1);
                    if (weeklyPaydown > 10) {
                        const freeDate = new Date(); freeDate.setDate(freeDate.getDate() + Math.ceil(debtValues[debtValues.length - 1] / weeklyPaydown) * 7);
                        parts.push(<div key="df" style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ color: T.text.secondary, fontSize: 11 }}>Projected Debt-Free:</span>
                            <span style={{ color: T.status.green, fontSize: 11, fontWeight: 700 }}>{freeDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
                        </div>);
                    }
                }

                // 2. Net Worth Delta (vs last audit)
                const lNW = latest.parsed?.netWorth;
                const pNW = prev.parsed?.netWorth;
                if (lNW != null && pNW != null) {
                    const delta = lNW - pNW;
                    const up = delta >= 0;
                    parts.push(<div key="nw" style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ color: T.text.secondary, fontSize: 11 }}>Net Worth vs Last Audit:</span>
                        <span style={{ color: up ? T.status.green : T.status.red, fontSize: 11, fontWeight: 700 }}>{up ? "+" : "-"}${Math.abs(delta).toLocaleString()}</span>
                    </div>);
                }

                // 3. Score Factor
                const lScore = latest.parsed?.healthScore?.score;
                const pScore = prev.parsed?.healthScore?.score;
                if (lScore != null && pScore != null && Math.abs(lScore - pScore) >= 2) {
                    const lForm = latest.form || {};
                    const pForm = prev.form || {};
                    const factors = [];
                    const lChecking = parseFloat(lForm.checking) || 0;
                    const pChecking = parseFloat(pForm.checking) || 0;
                    if (Math.abs(lChecking - pChecking) > 100) factors.push({ name: "Cash Flow", delta: lChecking - pChecking });
                    const lDebt = (lForm.debts || []).reduce((s, d) => s + (parseFloat(d.balance) || 0), 0);
                    const pDebt = (pForm.debts || []).reduce((s, d) => s + (parseFloat(d.balance) || 0), 0);
                    if (Math.abs(lDebt - pDebt) > 50) factors.push({ name: "Debt Paydown", delta: pDebt - lDebt });
                    const lSave = parseFloat(lForm.ally || lForm.savings) || 0;
                    const pSave = parseFloat(pForm.ally || pForm.savings) || 0;
                    if (Math.abs(lSave - pSave) > 50) factors.push({ name: "Savings Growth", delta: lSave - pSave });

                    if (factors.length > 0) {
                        const biggest = factors.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
                        const diff = lScore - pScore;
                        parts.push(<div key="sf" style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ color: T.text.secondary, fontSize: 11 }}>Score Movement ({diff > 0 ? "+" : ""}{diff}):</span>
                            <span style={{ color: diff > 0 ? T.accent.emerald : T.status.amber, fontSize: 11, fontWeight: 700 }}>Driven by {biggest.name}</span>
                        </div>);
                    }
                }

                return parts.length > 0 ? parts : <p style={{ fontSize: 11, color: T.text.dim }}>Not enough varied data to compute momentum yet.</p>;
            })()}
        </Card>

        {/* ── HOW THE MATH WORKS ── */}
        <Card animate delay={380} style={{ background: T.bg.elevated }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: `${T.status.blue}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Activity size={14} color={T.status.blue} strokeWidth={2.5} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: T.text.primary }}>How the Math Works</span>
            </div>
            <div style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.5, display: "flex", flexDirection: "column", gap: 8 }}>
                <p><strong>1. <InlineTooltip>Floor</InlineTooltip> Protection:</strong> We subtract your global floor and buffers from your checking balance to find your <em><InlineTooltip term="Available">Available Capital</InlineTooltip></em>.</p>
                <p><strong>2. Time-Critical Bills:</strong> We scan radar for bills due before your next payday and reserve those funds immediately.</p>
                <p><strong>3. Minimums & Transfers:</strong> Minimum debt payments and active savings goals (vaults/<InlineTooltip term="Sinking fund">sinking funds</InlineTooltip>) are funded next.</p>
                <p><strong>4. Debt Target Selection:</strong> If you have <em>Surplus Capital</em> left over, we analyze ALL your card APRs and balances to find the mathematically perfect target (highest APR avalanche, or lowest balance snowball if configured).</p>
                <p><strong>5. Surplus Allocation:</strong> We apply the surplus to the selected target debt to accelerate payoff, dynamically calculating the updated timeline. If configured, we can optimize for a <em><InlineTooltip>Promo sprint</InlineTooltip></em>.</p>
            </div>
        </Card>

        {sections.qualityScore && <Section title="Quality Score" icon={CheckCircle} content={sections.qualityScore} accentColor={T.status.green} defaultOpen={false} delay={400} />}
        {sections.autoUpdates && <Section title="Auto-Updates" icon={RefreshCw} content={sections.autoUpdates} accentColor={T.text.dim} defaultOpen={false} delay={450} />}
        <Card style={{ background: T.bg.elevated }}>
            <div onClick={() => setShowRaw(!showRaw)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowRaw(!showRaw); } }}
                role="button" tabIndex={0} aria-expanded={showRaw} aria-label="Toggle raw output"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", minHeight: 36 }}>
                <span style={{ fontSize: 11, color: T.text.dim, fontWeight: 600 }}>Raw Output</span>
                {showRaw ? <ChevronUp size={13} color={T.text.dim} /> : <ChevronDown size={13} color={T.text.dim} />}</div>
            {showRaw && <pre style={{
                fontSize: 10, lineHeight: 1.6, color: T.text.secondary, whiteSpace: "pre-wrap", wordBreak: "break-word",
                marginTop: 10, maxHeight: 500, overflow: "auto", fontFamily: T.font.mono, padding: 12, background: T.bg.card, borderRadius: T.radius.md
            }}>{p.raw}</pre>}
        </Card>

        {/* Legal Disclaimer — always visible */}
        <div style={{
            marginTop: 12, padding: "14px 16px", borderRadius: T.radius.md,
            background: `${T.bg.elevated}80`, border: `1px solid ${T.border.subtle}`,
            display: "flex", alignItems: "flex-start", gap: 10
        }}>
            <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>⚖️</span>
            <p style={{ fontSize: 10, color: T.text.muted, lineHeight: 1.6, margin: 0 }}>
                <strong style={{ color: T.text.dim }}>Disclaimer:</strong> This analysis is generated by AI for educational and informational purposes only.
                It is <strong>not</strong> professional financial, tax, legal, or investment advice. Always consult a licensed financial advisor
                before making financial decisions. The app developer assumes no liability for actions taken based on this output.
            </p>
        </div>
    </div>;
})
