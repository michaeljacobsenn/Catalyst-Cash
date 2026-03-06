import { useState, memo } from "react";
import { TrendingUp, AlertTriangle, Clock, ChevronDown, ChevronUp, Activity, RefreshCw, CheckSquare, Target, Zap, CheckCircle, Share2 } from "lucide-react";
import { T } from "../constants.js";
import { fmtDate, stripPaycheckParens, exportAudit } from "../utils.js";
import { Card, Badge, InlineTooltip } from "../ui.jsx";
import { Mono, Section, MoveRow, Md } from "../components.jsx";
import { haptic } from "../haptics.js";

import { useSettings } from '../contexts/SettingsContext.jsx';
import { useAudit } from '../contexts/AuditContext.jsx';
import { usePortfolio } from '../contexts/PortfolioContext.jsx';
import { useNavigation } from '../contexts/NavigationContext.jsx';
import { createPortal } from "react-dom";

export default memo(function ResultsView({ audit, moveChecks, onToggleMove, streak = 0 }) {
    const { financialConfig } = useSettings();
    const { history } = useAudit();
    const { bankAccounts, setBankAccounts, cards, setCards, renewals, setRenewals, badges, setBadges } = usePortfolio();
    const { navTo } = useNavigation();

    const [showRaw, setShowRaw] = useState(false);
    const [showAutoUpdateModal, setShowAutoUpdateModal] = useState(false);
    const [showExitPrompt, setShowExitPrompt] = useState(false);
    if (!audit) return <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        height: "60vh", padding: 32, textAlign: "center"
    }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: T.text.dim }}>No results yet</p></div>;
    const p = audit.parsed || {};
    const sections = p.sections || {};
    const form = audit.form || {};

    const handleApplyMoves = () => {
        haptic.medium();
        const moves = p.moveItems || [];
        const chk = parseFloat(form.checking || bankAccounts.find(a => /chk|check/i.test(a.name) || /chk|check/i.test(a.type))?.balance || 0);
        let chkDelta = 0;
        const debtsImpact = {}; // card/debt name -> amount reduction

        moves.forEach((m, i) => {
            if (moveChecks[i]) {
                const amt = parseFloat(m.amount) || 0;
                chkDelta -= amt;

                // Extremely naive matching for demo: if the move text contains the card name
                cards.forEach(c => {
                    const label = (c.name || "Card").toLowerCase();
                    if (m.desc && m.desc.toLowerCase().includes(label) && amt > 0) {
                        debtsImpact[c.id] = (debtsImpact[c.id] || 0) + amt;
                    }
                });

                // Match against custom debts
                const nonCardDebts = form.debts || [];
                nonCardDebts.forEach(d => {
                    const label = (d.name || "").toLowerCase();
                    if (label && m.desc && m.desc.toLowerCase().includes(label) && amt > 0) {
                        debtsImpact[d.id] = (debtsImpact[d.id] || 0) + amt;
                    }
                });
            }
        });

        // Apply changes
        let updatedBankAccounts = [...bankAccounts];
        const mainChkIndex = updatedBankAccounts.findIndex(a => /chk|check/i.test(a.name) || /chk|check/i.test(a.type));
        if (mainChkIndex >= 0) {
            updatedBankAccounts[mainChkIndex].balance = Math.max(0, (parseFloat(updatedBankAccounts[mainChkIndex].balance) || 0) + chkDelta);
        } else if (updatedBankAccounts.length > 0) {
            updatedBankAccounts[0].balance = Math.max(0, (parseFloat(updatedBankAccounts[0].balance) || 0) + chkDelta);
        }
        setBankAccounts(updatedBankAccounts);

        // Update card balances
        let updatedCards = cards.map(c => {
            if (debtsImpact[c.id]) {
                const bal = parseFloat(c.balance) || 0;
                return { ...c, balance: Math.max(0, bal - debtsImpact[c.id]) };
            }
            return c;
        });
        setCards(updatedCards);

        if (window.toast) window.toast.success("Balances updated based on selected moves!");
        setShowAutoUpdateModal(false);
        navTo("dashboard");
    };

    const handleExitResults = () => {
        const hasMoves = p.moveItems?.length > 0;
        if (hasMoves) {
            haptic.selection();
            setShowExitPrompt(true);
        } else {
            navTo("dashboard");
        }
    };

    return <div className="page-body" style={{ paddingBottom: 0 }}>
        <div style={{ padding: "14px 0 12px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
                <button onClick={handleExitResults} style={{
                    display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", marginBottom: 10,
                    background: T.bg.elevated, border: `1px solid ${T.border.default}`, borderRadius: 99,
                    color: T.accent.primary, fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all .2s ease"
                }}>← Back</button>
                <h1 style={{ fontSize: 22, fontWeight: 800 }}>Full Results</h1>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <Mono size={11} color={T.text.dim}>{fmtDate(audit.date)}</Mono>
                </div>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                {audit.isTest && <Badge variant="amber">TEST · NOT SAVED</Badge>}
                <button onClick={() => exportAudit(audit)} title="Export Audit" style={{
                    width: 36, height: 36, borderRadius: T.radius.md,
                    border: `1px solid ${T.border.default}`, background: T.bg.elevated,
                    color: T.text.secondary, cursor: "pointer", display: "flex",
                    alignItems: "center", justifyContent: "center", transition: "all .2s"
                }}><Share2 size={15} strokeWidth={2.5} /></button>
            </div>
        </div>

        {/* Completion Progress Ring */}
        {p?.moveItems?.length > 0 && (() => {
            const done = Object.values(moveChecks).filter(Boolean).length;
            const total = p.moveItems.length;
            const pct = Math.round((done / total) * 100);
            const pctColor = pct >= 100 ? T.status.green : pct >= 80 ? T.status.green : pct >= 40 ? T.status.amber : T.text.dim;
            const allDone = pct >= 100;
            const circumference = 2 * Math.PI * 16; // r=16
            const strokeOffset = circumference - (circumference * pct / 100);
            return <div style={{
                display: "flex", alignItems: "center", gap: 14, padding: "12px 16px",
                background: allDone ? `${T.status.green}12` : `${pctColor}08`,
                border: `1px solid ${allDone ? T.status.green : pctColor}20`,
                borderRadius: T.radius.lg, marginBottom: 10,
                animation: allDone ? "glowPulse 2s ease-in-out infinite" : "fadeInUp .4s ease-out both",
                position: "relative", overflow: "hidden"
            }}>
                {/* Celebration sparkles when all done */}
                {allDone && <>
                    <span style={{ position: "absolute", top: 4, right: 14, fontSize: 16, animation: "floatUp 2s ease-out infinite", opacity: 0.8 }}>✨</span>
                    <span style={{ position: "absolute", top: 8, right: 42, fontSize: 12, animation: "floatUp 2.4s ease-out 0.3s infinite", opacity: 0.6 }}>🎉</span>
                    <span style={{ position: "absolute", bottom: 4, right: 28, fontSize: 14, animation: "floatUp 2.8s ease-out 0.6s infinite", opacity: 0.7 }}>⭐</span>
                </>}
                {/* SVG Progress Ring */}
                <svg width="44" height="44" viewBox="0 0 40 40" style={{ flexShrink: 0, transform: "rotate(-90deg)" }}>
                    <circle cx="20" cy="20" r="16" fill="none" stroke={T.border.default} strokeWidth="3.5" />
                    <circle cx="20" cy="20" r="16" fill="none" stroke={pctColor} strokeWidth="3.5"
                        strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeOffset}
                        style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.4s ease" }} />
                </svg>
                <div style={{ position: "absolute", left: 16, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 900, color: pctColor, fontFamily: T.font.mono }}>{pct}%</span>
                </div>
                <div style={{ marginLeft: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary }}>{done}/{total} Moves Complete</div>
                    <div style={{ fontSize: 10, color: allDone ? T.status.green : T.text.dim, fontWeight: allDone ? 700 : 400 }}>
                        {allDone ? "All moves executed! Financial momentum secured 🔥" : `${total - done} remaining — keep crushing it`}
                    </div>
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
                if (realAudits.length < 2) return <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "12px 0" }}>
                    <div style={{ fontSize: 28 }}>🌱</div>
                    <p style={{ fontSize: 12, color: T.text.dim, textAlign: "center", lineHeight: 1.5 }}>Complete <strong style={{ color: T.text.secondary }}>2+ weekly audits</strong> to unlock your Freedom Journey — tracking momentum, projected debt-free dates, and net worth trajectory.</p>
                </div>;

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

        {/* ── AUTO UPDATE ACTIONS CTA ── */}
        {p.moveItems?.length > 0 && Object.values(moveChecks).filter(Boolean).length > 0 && (
            <button onClick={() => { haptic.selection(); setShowAutoUpdateModal(true); }} className="hover-btn" style={{
                width: "100%", padding: "16px", borderRadius: T.radius.lg, border: "none",
                background: `linear-gradient(135deg, ${T.accent.emerald}, #20b2aa)`,
                color: T.bg.base, fontSize: 15, fontWeight: 800, cursor: "pointer",
                marginTop: 20, marginBottom: 8, boxShadow: `0 4px 16px ${T.accent.emerald}40`
            }}>
                Review & Apply {Object.values(moveChecks).filter(Boolean).length} Moves
            </button>
        )}

        {/* ── AUTO UPDATE MODAL ── */}
        {showAutoUpdateModal && createPortal(
            <div style={{
                position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,0.7)",
                backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
                display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
                animation: "fadeIn 0.2s ease"
            }} onClick={() => setShowAutoUpdateModal(false)}>
                <div onClick={e => e.stopPropagation()} style={{
                    width: "100%", maxWidth: 360, background: T.bg.card, borderRadius: 24,
                    padding: 24, border: `1px solid ${T.border.default}`, boxShadow: T.shadow.elevated,
                    animation: "scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
                }}>
                    <div style={{ fontSize: 32, textAlign: "center", marginBottom: 12 }}>🔄</div>
                    <h2 style={{ fontSize: 20, fontWeight: 800, textAlign: "center", margin: "0 0 8px", color: T.text.primary }}>Auto-Update Balances?</h2>
                    <p style={{ fontSize: 13, color: T.text.secondary, textAlign: "center", lineHeight: 1.4, margin: "0 0 20px" }}>
                        Applying the {Object.values(moveChecks).filter(Boolean).length} selected moves will seamlessly deduct the funds from your primary Checking account and apply them to the identified Debt targets across Catalyst Cash.
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <button onClick={handleApplyMoves} className="hover-btn" style={{
                            padding: "14px", borderRadius: T.radius.lg, border: "none", background: T.accent.emerald,
                            color: "white", fontSize: 14, fontWeight: 800, cursor: "pointer"
                        }}>Yes, Apply & Update Portfolio</button>
                        <button onClick={() => setShowAutoUpdateModal(false)} className="hover-btn" style={{
                            padding: "14px", borderRadius: T.radius.lg, border: `1px solid ${T.border.default}`,
                            background: "transparent", color: T.text.secondary, fontSize: 14, fontWeight: 700, cursor: "pointer"
                        }}>Cancel & Return to Results</button>
                    </div>
                </div>
            </div>, document.body
        )}

        {/* ── EXIT PROMPT MODAL ── */}
        {showExitPrompt && createPortal(
            <div style={{
                position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,0.7)",
                backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
                display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
                animation: "fadeIn 0.2s ease"
            }} onClick={() => { setShowExitPrompt(false); navTo("dashboard"); }}>
                <div onClick={e => e.stopPropagation()} style={{
                    width: "100%", maxWidth: 360, background: T.bg.card, borderRadius: 24,
                    padding: 24, border: `1px solid ${T.border.default}`, boxShadow: T.shadow.elevated,
                    animation: "scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
                }}>
                    <div style={{ fontSize: 32, textAlign: "center", marginBottom: 12 }}>💰</div>
                    <h2 style={{ fontSize: 18, fontWeight: 800, textAlign: "center", margin: "0 0 8px", color: T.text.primary }}>Update Balances?</h2>
                    <p style={{ fontSize: 13, color: T.text.secondary, textAlign: "center", lineHeight: 1.4, margin: "0 0 20px" }}>
                        Your audit suggested {p.moveItems?.length || 0} financial moves. Would you like to auto-update your account balances based on these recommendations before leaving?
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <button onClick={() => { setShowExitPrompt(false); setShowAutoUpdateModal(true); }} className="hover-btn" style={{
                            padding: "14px", borderRadius: T.radius.lg, border: "none", background: T.accent.emerald,
                            color: "white", fontSize: 14, fontWeight: 800, cursor: "pointer"
                        }}>Yes, Review & Update</button>
                        <button onClick={() => { setShowExitPrompt(false); navTo("dashboard"); }} className="hover-btn" style={{
                            padding: "14px", borderRadius: T.radius.lg, border: `1px solid ${T.border.default}`,
                            background: "transparent", color: T.text.secondary, fontSize: 14, fontWeight: 700, cursor: "pointer"
                        }}>Skip & Return to Dashboard</button>
                    </div>
                </div>
            </div>, document.body
        )}
    </div>;
})
