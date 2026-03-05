import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AlertCircle, AlertTriangle, Zap, ChevronDown, ChevronUp, Loader2, BookOpen, Trash2, Plus, Minus, CheckCircle, RefreshCw, TrendingUp, X } from "lucide-react";
import { T } from "../constants.js";
import { validateSnapshot } from "../validation.js";
import { Card, Label, Badge } from "../ui.jsx";
import { Mono, DI } from "../components.jsx";
import { getSystemPrompt } from "../prompts.js";
import { generateStrategy, mergeSnapshotDebts } from "../engine.js";
import { resolveCardLabel, getShortCardLabel } from "../cards.js";
import { nativeExport, cyrb53, fmt } from "../utils.js";
import { fetchMarketPrices, calcPortfolioValue } from "../marketData.js";

import { getPlaidAutoFill, getStoredTransactions } from "../plaid.js";
import { haptic } from "../haptics.js";
import { buildSnapshotMessage } from "../buildSnapshotMessage.js";


// Sanitize dollar input: strip non-numeric chars except decimal point
const sanitizeDollar = v => v.replace(/[^0-9.]/g, "").replace(/\.(?=.*\.)/g, "");

export default function InputForm({ onSubmit, isLoading, lastAudit, renewals, cardAnnualFees, cards, bankAccounts, onManualImport, toast, financialConfig, setFinancialConfig, aiProvider, personalRules, setPersonalRules, persona = null, instructionHash, setInstructionHash, db, onBack, proEnabled = false }) {
    const today = new Date();

    // Auto-fill from Plaid if available
    const plaidData = getPlaidAutoFill(cards || [], bankAccounts || []);

    // Load Plaid transactions from local storage
    const [plaidTransactions, setPlaidTransactions] = useState([]);
    const [txnFetchedAt, setTxnFetchedAt] = useState(null);
    const [showTxns, setShowTxns] = useState(false);
    useEffect(() => {
        getStoredTransactions().then(stored => {
            if (stored?.data?.length) {
                // For weekly audit: only show last 7 days of non-pending transactions
                const cutoff = new Date();
                cutoff.setDate(cutoff.getDate() - 7);
                const cutoffStr = cutoff.toISOString().split('T')[0];
                const recent = stored.data.filter(t => t.date >= cutoffStr && !t.pending && !t.isCredit);
                setPlaidTransactions(recent);
                setTxnFetchedAt(stored.fetchedAt);
            }
        }).catch(() => { });
    }, []);

    const [form, setForm] = useState({
        date: today.toISOString().split("T")[0], time: today.toTimeString().split(" ")[0].slice(0, 5),
        checking: plaidData.checking !== null ? plaidData.checking : "",
        savings: plaidData.vault !== null ? plaidData.vault : "",
        roth: financialConfig?.investmentRoth || "",
        brokerage: financialConfig?.investmentBrokerage || "",
        k401Balance: financialConfig?.k401Balance || "",
        pendingCharges: [{ amount: "", cardId: "", description: "", confirmed: false }],
        habitCount: 10,
        debts: plaidData.debts?.length > 0 ? plaidData.debts : [{ cardId: "", name: "", balance: "" }],
        notes: "",
        autoPaycheckAdd: false, paycheckAddOverride: ""
    });
    const [isTestMode, setIsTestMode] = useState(false);

    const [budgetActuals, setBudgetActuals] = useState({});
    const [holdingValues, setHoldingValues] = useState({ roth: 0, k401: 0, brokerage: 0, crypto: 0, hsa: 0 });
    const [overrideInvest, setOverrideInvest] = useState({ roth: false, brokerage: false, k401: false });
    const [overridePlaid, setOverridePlaid] = useState({ checking: false, vault: false, debts: {} });
    // Re-sync Plaid balances when cards or bankAccounts update (e.g. after Plaid sync finishes)
    useEffect(() => {
        const freshPlaid = getPlaidAutoFill(cards || [], bankAccounts || []);
        setForm(p => {
            const updates = {};
            // Only update checking/savings if user hasn't overridden
            if (freshPlaid.checking !== null && !overridePlaid.checking) updates.checking = freshPlaid.checking;
            if (freshPlaid.vault !== null && !overridePlaid.vault) updates.savings = freshPlaid.vault;
            // Update debt balances for cards that have Plaid data and aren't overridden
            if (freshPlaid.debts?.length > 0) {
                const newDebts = (p.debts || []).map(d => {
                    if (!d.cardId) return d;
                    if (overridePlaid.debts[d.cardId]) return d;
                    const pd = freshPlaid.debts.find(fd => fd.cardId === d.cardId);
                    return pd ? { ...d, balance: pd.balance } : d;
                });
                // Add any new Plaid debts that aren't already in the form
                const existingIds = new Set(newDebts.map(d => d.cardId).filter(Boolean));
                const additions = freshPlaid.debts.filter(pd => pd.cardId && !existingIds.has(pd.cardId));
                if (additions.length > 0 || newDebts.some((d, i) => d !== (p.debts || [])[i])) {
                    updates.debts = [...newDebts, ...additions];
                }
            }
            if (Object.keys(updates).length === 0) return p;
            return { ...p, ...updates };
        });
    }, [cards, bankAccounts]);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [showConfig, setShowConfig] = useState(false);

    // Auto-calculate portfolio values from cached market prices
    useEffect(() => {
        if (!financialConfig?.enableHoldings) return;
        const holdings = financialConfig?.holdings || {};
        const allSymbols = [...new Set([...(holdings.roth || []), ...(holdings.k401 || []), ...(holdings.brokerage || []), ...(holdings.crypto || []), ...(holdings.hsa || [])].map(h => h.symbol))];
        if (allSymbols.length === 0) return;
        fetchMarketPrices(allSymbols).then(prices => {
            const calc = (key) => {
                const { total } = calcPortfolioValue(holdings[key] || [], prices);
                return total;
            };
            setHoldingValues({ roth: calc("roth"), k401: calc("k401"), brokerage: calc("brokerage"), crypto: calc("crypto"), hsa: calc("hsa") });
        }).catch(() => { });
    }, [financialConfig?.enableHoldings, financialConfig?.holdings]);

    // Structured validation via validation.js
    const validation = useMemo(() => validateSnapshot(form, financialConfig), [form, financialConfig]);
    const validationErrors = validation.errors.filter(e => e.severity === 'error');
    const validationWarnings = validation.errors.filter(e => e.severity === 'warning');

    // Identify if the generated system prompt has drifted from the last downloaded version
    const activeConfig = financialConfig || {
        payday: "Friday", paycheckStandard: 0.00, paycheckFirstOfMonth: 0.00,
        weeklySpendAllowance: 0.00, emergencyFloor: 0.00, checkingBuffer: 0.00,
        heavyHorizonStart: 15, heavyHorizonEnd: 45, heavyHorizonThreshold: 0.00,
        greenStatusTarget: 0.00, emergencyReserveTarget: 0.00, habitName: "Coffee Pods", habitRestockCost: 25, habitCheckThreshold: 6,
        habitCriticalThreshold: 3, trackHabits: false, defaultAPR: 24.99,
        fireExpectedReturnPct: 7, fireInflationPct: 2.5, fireSafeWithdrawalPct: 4,
        investmentBrokerage: 0, investmentRoth: 0, investmentsAsOfDate: "",
        trackRoth: false, rothContributedYTD: 0, rothAnnualLimit: 0,
        autoTrackRothYTD: true,
        track401k: false, k401Balance: 0, k401ContributedYTD: 0, k401AnnualLimit: 0,
        autoTrack401kYTD: true,
        trackBrokerage: true,
        brokerageStockPct: 90,
        rothStockPct: 90,
        budgetCategories: [], savingsGoals: [], nonCardDebts: [], incomeSources: [],
        creditScore: null, creditScoreDate: "", creditUtilization: null,
        taxWithholdingRate: 0, quarterlyTaxEstimate: 0, isContractor: false,
        homeEquity: 0, vehicleValue: 0, otherAssets: 0, otherAssetsLabel: "",
        insuranceDeductibles: [], bigTicketItems: []
    };
    const promptRenewals = [...(renewals || []), ...(cardAnnualFees || [])];

    const strategyCards = useMemo(() => (
        mergeSnapshotDebts(cards || [], form.debts || [], activeConfig?.defaultAPR || 0)
    ), [cards, form.debts, activeConfig?.defaultAPR]);

    // Compute exact strategy using current form inputs
    const computedStrategy = generateStrategy(activeConfig, {
        checkingBalance: parseFloat(form.checking || 0),
        savingsTotal: parseFloat(form.savings || 0),
        cards: strategyCards,
        renewals: promptRenewals,
        snapshotDate: form.date
    });

    const currentPayload = getSystemPrompt(aiProvider || "gemini", activeConfig, cards || [], promptRenewals, personalRules || "", null, persona, computedStrategy);
    const liveHash = cyrb53(currentPayload);
    const instructionsOutOfSync = instructionHash !== liveHash;

    useEffect(() => {
        if (lastAudit?.form && !lastAudit.isTest) {
            const prevDebts = Array.isArray(lastAudit.form.debts) ? lastAudit.form.debts : [];
            const debtWithBalance = prevDebts
                .filter(d => d?.name && parseFloat(d?.balance || "0") > 0)
                .map(d => {
                    if (d.cardId) return d;
                    const match = (cards || []).find(c => c.name === d.name);
                    return match ? { ...d, cardId: match.id } : d;
                });
            const plaidNow = getPlaidAutoFill(cards || [], bankAccounts || []);
            setForm(p => ({
                ...p,
                ...lastAudit.form,
                debts: plaidNow.debts?.length > 0 ? plaidNow.debts : (debtWithBalance.length ? debtWithBalance : [{ cardId: "", name: "", balance: "" }]),
                date: today.toISOString().split("T")[0],
                time: today.toTimeString().split(" ")[0].slice(0, 5),
                // Prefer live Plaid balance > last audit > empty
                checking: plaidNow.checking !== null ? plaidNow.checking : (lastAudit?.form?.checking || ""),
                savings: plaidNow.vault !== null ? plaidNow.vault : (lastAudit?.form?.savings || lastAudit?.form?.ally || ""),
                pendingCharges: [{ amount: "", cardId: "", description: "", confirmed: false }],
                roth: lastAudit.form.roth !== undefined ? lastAudit.form.roth : (p.roth || ""),
                brokerage: lastAudit.form.brokerage !== undefined ? lastAudit.form.brokerage : (p.brokerage || ""),
                autoPaycheckAdd: lastAudit.form.autoPaycheckAdd !== undefined ? lastAudit.form.autoPaycheckAdd : false,
                paycheckAddOverride: lastAudit.form.paycheckAddOverride !== undefined ? lastAudit.form.paycheckAddOverride : ""
            }));
        }
    }, [lastAudit, cards, bankAccounts]);
    const s = (k, v) => setForm(p => ({ ...p, [k]: v }));
    const addD = () => {
        haptic.medium();
        s("debts", [...form.debts, { cardId: "", name: "", balance: "" }]);
    };
    const rmD = i => {
        haptic.light();
        s("debts", form.debts.filter((_, j) => j !== i));
    };
    const sD = (i, k, v) => setForm(p => ({
        ...p,
        debts: p.debts.map((d, j) => j === i ? { ...d, [k]: v } : d)
    }));
    // Count how many balance fields are filled to determine if we have enough data
    const filledFields = [
        (activeConfig.trackChecking !== false) && form.checking,
        (activeConfig.trackSavings !== false) && form.savings,
        activeConfig.trackRoth && form.roth,
        activeConfig.trackBrokerage && form.brokerage,
        activeConfig.track401k && (form.k401Balance || activeConfig.k401Balance),
        form.debts.some(d => (d.name || d.cardId) && d.balance)
    ].filter(Boolean).length;
    const canSubmit = filledFields >= 1 && !isLoading;

    const buildMsg = () => buildSnapshotMessage({
        form, activeConfig, cards, renewals, cardAnnualFees,
        parsedTransactions: plaidTransactions, budgetActuals, holdingValues,
        financialConfig, aiProvider
    });



    return <div className="page-body" style={{
        display: "flex", flexDirection: "column", minHeight: "100%",
        flexShrink: 0,
    }}>
        {/* ── HERO SECTION ── */}
        <div style={{ position: "relative", padding: "16px 0 12px", display: "flex", alignItems: "center", gap: 12 }}>
            {/* Ambient glow behind title */}
            <div style={{ position: "absolute", left: 40, top: 0, width: 120, height: 60, background: T.accent.primary, filter: "blur(60px)", opacity: 0.12, borderRadius: "50%", pointerEvents: "none" }} />
            {onBack && <button onClick={onBack} style={{
                width: 38, height: 38, borderRadius: 12, border: `1px solid ${T.border.subtle}`,
                background: T.bg.glass, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
                color: T.text.secondary, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                transition: "all .2s ease"
            }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            </button>}
            <div>
                <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.03em", background: `linear-gradient(135deg, ${T.text.primary}, ${T.accent.primary}90)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Weekly Snapshot</h1>
            </div>
        </div>

        {/* ── SNAPSHOT ITEMS ── */}
        <div style={{ marginBottom: 20 }}>
            <Card className="hover-card" variant="glass" style={{ marginBottom: 8, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", right: -20, top: -20, width: 60, height: 60, background: T.accent.primary, filter: "blur(40px)", opacity: 0.06, borderRadius: "50%", pointerEvents: "none" }} />
                <Label style={{ fontWeight: 800 }}>Date & Time</Label>
                <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.9fr", gap: 8 }}>
                    <input type="date" aria-label="Audit date" value={form.date} onChange={e => s("date", e.target.value)}
                        style={{ width: "100%", padding: "10px 12px", borderRadius: T.radius.md, background: T.bg.elevated, border: `1.5px solid ${T.border.default}`, color: T.text.primary, fontSize: 13, outline: "none", boxSizing: "border-box", transition: "all 0.2s", fontFamily: T.font.sans, fontWeight: 700 }}
                        onFocus={e => { e.target.style.borderColor = T.accent.primary; e.target.style.boxShadow = `0 0 0 3px ${T.accent.primary}30`; }}
                        onBlur={e => { e.target.style.borderColor = T.border.default; e.target.style.boxShadow = "none"; }}
                    />
                    <input type="time" aria-label="Audit time" value={form.time} onChange={e => s("time", e.target.value)}
                        style={{ width: "100%", padding: "10px 12px", borderRadius: T.radius.md, background: T.bg.elevated, border: `1.5px solid ${T.border.default}`, color: T.text.primary, fontSize: 13, outline: "none", boxSizing: "border-box", transition: "all 0.2s", fontFamily: T.font.sans, fontWeight: 700 }}
                        onFocus={e => { e.target.style.borderColor = T.accent.primary; e.target.style.boxShadow = `0 0 0 3px ${T.accent.primary}30`; }}
                        onBlur={e => { e.target.style.borderColor = T.border.default; e.target.style.boxShadow = "none"; }}
                    />
                </div>
            </Card>
            {(activeConfig.trackChecking !== false || activeConfig.trackSavings !== false) && <div style={{ display: "grid", gridTemplateColumns: (activeConfig.trackChecking !== false && activeConfig.trackSavings !== false) ? "1fr 1fr" : "1fr", gap: 8 }}>
                {activeConfig.trackChecking !== false && (() => {
                    const hasPlaid = plaidData.checking !== null;
                    return <Card className="hover-card" variant="glass" style={{ marginBottom: 8, position: "relative", overflow: "hidden" }}>
                        <div style={{ position: "absolute", right: -15, top: -15, width: 50, height: 50, background: T.accent.emerald, filter: "blur(35px)", opacity: 0.07, borderRadius: "50%", pointerEvents: "none" }} />
                        <Label style={{ fontWeight: 800, marginBottom: 4, fontSize: 10 }}>Checking</Label>
                        {hasPlaid && !overridePlaid.checking ? (
                            <button onClick={() => setOverridePlaid(p => ({ ...p, checking: true }))} style={{
                                width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                                height: 36, background: `${T.accent.emerald}10`, border: `1px solid ${T.accent.emerald}40`,
                                borderRadius: T.radius.md, cursor: "pointer"
                            }}>
                                <Mono size={13} weight={800} color={T.accent.emerald}>{fmt(plaidData.checking)}</Mono>
                            </button>
                        ) : (
                            <div style={{ position: "relative" }}>
                                <DI label="Checking balance" value={form.checking} onChange={e => s("checking", sanitizeDollar(e.target.value))} placeholder={hasPlaid ? `${fmt(plaidData.checking)}` : "0.00"} />
                                {hasPlaid && <button onClick={() => setOverridePlaid(p => ({ ...p, checking: false }))} style={{
                                    position: "absolute", right: -2, top: -8, width: 16, height: 16, borderRadius: 8,
                                    border: "none", background: T.accent.primary, color: "#fff", cursor: "pointer",
                                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900
                                }}>✕</button>}
                            </div>
                        )}
                    </Card>;
                })()}
                {activeConfig.trackSavings !== false && (() => {
                    const hasPlaid = plaidData.vault !== null;
                    return <Card className="hover-card" variant="glass" style={{ marginBottom: 8, position: "relative", overflow: "hidden" }}>
                        <div style={{ position: "absolute", right: -15, top: -15, width: 50, height: 50, background: "#3B82F6", filter: "blur(35px)", opacity: 0.07, borderRadius: "50%", pointerEvents: "none" }} />
                        <Label style={{ fontWeight: 800, marginBottom: 4, fontSize: 10 }}>Savings</Label>
                        {hasPlaid && !overridePlaid.vault ? (
                            <button onClick={() => setOverridePlaid(p => ({ ...p, vault: true }))} style={{
                                width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                                height: 36, background: `${T.accent.emerald}10`, border: `1px solid ${T.accent.emerald}40`,
                                borderRadius: T.radius.md, cursor: "pointer"
                            }}>
                                <Mono size={13} weight={800} color={T.accent.emerald}>{fmt(plaidData.vault)}</Mono>
                            </button>
                        ) : (
                            <div style={{ position: "relative" }}>
                                <DI label="Savings balance" value={form.savings} onChange={e => s("savings", sanitizeDollar(e.target.value))} placeholder={hasPlaid ? `${fmt(plaidData.vault)}` : "0.00"} />
                                {hasPlaid && <button onClick={() => setOverridePlaid(p => ({ ...p, vault: false }))} style={{
                                    position: "absolute", right: -2, top: -8, width: 16, height: 16, borderRadius: 8,
                                    border: "none", background: T.accent.primary, color: "#fff", cursor: "pointer",
                                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900
                                }}>✕</button>}
                            </div>
                        )}
                    </Card>;
                })()}
            </div>}

            <Card className="hover-card" variant="glass" style={{ marginBottom: 8, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", left: -20, bottom: -20, width: 70, height: 70, background: T.accent.primary, filter: "blur(45px)", opacity: 0.06, borderRadius: "50%", pointerEvents: "none" }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <Label style={{ fontWeight: 800, marginBottom: 0 }}>Credit Card Balances</Label>
                    <button className="hover-btn" onClick={addD} style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: T.radius.sm,
                        border: `1px solid ${T.accent.primary}40`, background: `${T.accent.primary}15`,
                        color: T.accent.primary, fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: T.font.mono,
                        transition: "all .2s ease", boxShadow: `0 2px 10px ${T.accent.primary}20`
                    }}>
                        <Plus size={13} strokeWidth={3} /> ADD</button></div>
                {form.debts.map((d, i) => {
                    const plaidDebt = d.cardId ? plaidData.debts?.find(pd => pd.cardId === d.cardId) : null;
                    const hasPlaid = plaidDebt && plaidDebt.balance !== null;
                    const isOverridden = !!(d.cardId && overridePlaid.debts[d.cardId]);

                    return (<div key={i} style={{ marginBottom: 6 }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <select aria-label={`Debt card ${i + 1}`} value={d.cardId || d.name || ""} onChange={e => {
                                const val = e.target.value;
                                const card = (cards || []).find(c => c.id === val || c.name === val);
                                const newCardId = card?.id || "";
                                const newName = card ? resolveCardLabel(cards || [], card.id, card.name) : "";

                                setForm(p => ({
                                    ...p,
                                    debts: p.debts.map((debt, j) => j === i ? { ...debt, cardId: newCardId, name: newName } : debt)
                                }));
                                haptic.light();
                            }}
                                style={{
                                    flex: 1, fontSize: 12, padding: "10px 10px", background: T.bg.elevated, color: !(d.cardId || d.name) ? T.text.muted : T.text.primary,
                                    border: `1.5px solid ${T.border.default}`, borderRadius: T.radius.md, fontFamily: T.font.sans,
                                    WebkitAppearance: "none", appearance: "none", textOverflow: "ellipsis", whiteSpace: "nowrap", overflow: "hidden", minWidth: 0,
                                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23484F58' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                                    backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center"
                                }}>
                                <option value="">Card...</option>
                                {Object.entries((cards || []).reduce((g, c) => { (g[c.institution] = g[c.institution] || []).push(c); return g; }, {}))
                                    .map(([inst, instCards]) => <optgroup key={inst} label={inst}>{instCards.map(c =>
                                        <option key={c.id || c.name} value={c.id || c.name}>{getShortCardLabel(cards || [], c).replace(inst + " ", "")}</option>)}</optgroup>)}
                            </select>
                            <div style={{ flex: "0 0 90px" }}>
                                {hasPlaid && !isOverridden ? (
                                    <button onClick={() => {
                                        setOverridePlaid(p => ({ ...p, debts: { ...p.debts, [d.cardId]: true } }));
                                    }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, height: 38, background: `${T.accent.emerald}10`, border: `1px solid ${T.accent.emerald}40`, borderRadius: T.radius.md, padding: "0 8px", cursor: "pointer" }}>
                                        <Mono size={12} weight={800} color={T.accent.emerald}>{fmt(plaidDebt.balance)}</Mono>
                                    </button>
                                ) : (
                                    <div style={{ position: "relative" }}>
                                        <DI value={d.balance} onChange={e => sD(i, "balance", sanitizeDollar(e.target.value))} placeholder={hasPlaid ? `${fmt(plaidDebt.balance)}` : "0.00"} />
                                        {hasPlaid && isOverridden && <button onClick={() => {
                                            setOverridePlaid(p => ({ ...p, debts: { ...p.debts, [d.cardId]: false } }));
                                            sD(i, "balance", plaidDebt.balance);
                                        }} style={{
                                            position: "absolute", right: -2, top: -8, width: 16, height: 16, borderRadius: 8,
                                            border: "none", background: T.accent.primary, color: "#fff", cursor: "pointer",
                                            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900
                                        }}>✕</button>}
                                    </div>
                                )}
                            </div>
                            {form.debts.length > 1 && <button onClick={() => rmD(i)} style={{
                                width: 32, height: 32, borderRadius: T.radius.sm,
                                border: "none", background: T.status.redDim, color: T.status.red, cursor: "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                            }}><Trash2 size={11} /></button>}
                        </div>
                    </div>);
                })}
            </Card>
        </div>


        {/* ── Pending Charges ── */}
        <Card variant="glass" style={{ padding: "14px 16px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", right: -20, bottom: -20, width: 60, height: 60, background: T.status.amber, filter: "blur(40px)", opacity: 0.06, borderRadius: "50%", pointerEvents: "none" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Label style={{ marginBottom: 0, fontWeight: 800 }}>Pending Charges</Label>
                <button onClick={() => {
                    haptic.medium();
                    s("pendingCharges", [...(form.pendingCharges || []), { amount: "", cardId: "", description: "", confirmed: false }]);
                }} style={{
                    display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: T.radius.sm,
                    border: `1px solid ${T.status.amber}40`, background: `${T.status.amber}0A`, color: T.status.amber,
                    fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: T.font.mono
                }}><Plus size={11} />ADD</button>
            </div>
            {(form.pendingCharges || []).map((charge, ci) => (
                <div key={ci} style={{ marginBottom: 12, background: T.bg.elevated, borderRadius: T.radius.md, padding: "12px", border: `1px solid ${charge.confirmed ? T.status.green + "40" : T.border.default}`, transition: "border-color .2s" }}>
                    {/* Row 1: card picker + amount + remove */}
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                        <select
                            aria-label={`Pending charge card ${ci + 1}`}
                            value={charge.cardId || ""}
                            onChange={e => {
                                const val = e.target.value;
                                const card = (cards || []).find(c => c.id === val);
                                setForm(p => ({
                                    ...p,
                                    pendingCharges: p.pendingCharges.map((ch, j) => j === ci ? { ...ch, cardId: card?.id || "", description: ch.description } : ch)
                                }));
                                haptic.light();
                            }}
                            style={{
                                flex: 1, fontSize: 12, padding: "10px 10px", background: T.bg.card, color: !charge.cardId ? T.text.muted : T.text.primary,
                                border: `1.5px solid ${T.border.default}`, borderRadius: T.radius.md, fontFamily: T.font.sans,
                                WebkitAppearance: "none", appearance: "none", textOverflow: "ellipsis", minWidth: 0,
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23484F58' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                                backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center"
                            }}
                        >
                            <option value="">Card (optional)</option>
                            {Object.entries((cards || []).reduce((g, c) => { (g[c.institution] = g[c.institution] || []).push(c); return g; }, {}))
                                .map(([inst, instCards]) => <optgroup key={inst} label={inst}>{instCards.map(c =>
                                    <option key={c.id} value={c.id}>{(getShortCardLabel(cards || [], c) || "").replace((inst || "") + " ", "")}</option>)}</optgroup>)}
                        </select>
                        <div style={{ flex: "0 0 100px" }}><DI value={charge.amount} onChange={e => setForm(p => ({ ...p, pendingCharges: p.pendingCharges.map((ch, j) => j === ci ? { ...ch, amount: sanitizeDollar(e.target.value), confirmed: false } : ch) }))} /></div>
                        {(form.pendingCharges || []).length > 1 && <button onClick={() => { if (window.confirm("Delete this pending charge?")) { haptic.light(); s("pendingCharges", (form.pendingCharges || []).filter((_, j) => j !== ci)); } }} style={{ width: 38, height: 38, borderRadius: T.radius.sm, border: "none", background: T.status.redDim, color: T.status.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Trash2 size={13} /></button>}
                    </div>
                    {/* Row 2: description */}
                    <input
                        type="text"
                        aria-label={`Pending charge description ${ci + 1}`}
                        value={charge.description || ""}
                        onChange={e => setForm(p => ({ ...p, pendingCharges: p.pendingCharges.map((ch, j) => j === ci ? { ...ch, description: e.target.value } : ch) }))}
                        placeholder="Description (optional)"
                        style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontSize: 12, marginBottom: 8 }}
                    />
                    {/* Row 3: confirm toggle */}
                    <button onClick={() => { setForm(p => ({ ...p, pendingCharges: p.pendingCharges.map((ch, j) => j === ci ? { ...ch, confirmed: !ch.confirmed } : ch) })); haptic.medium(); }} style={{
                        width: "100%", padding: "10px 14px", borderRadius: T.radius.md, cursor: "pointer", fontSize: 11, fontWeight: 800,
                        fontFamily: T.font.mono, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        border: charge.confirmed ? `1.5px solid ${T.status.green}30` : `1.5px solid ${T.status.amber}40`,
                        background: charge.confirmed ? T.status.greenDim : T.status.amberDim,
                        color: charge.confirmed ? T.status.green : T.status.amber,
                    }}>
                        {charge.confirmed
                            ? <><CheckCircle size={13} />CONFIRMED ${charge.amount || "0.00"}</>
                            : <><AlertTriangle size={13} />TAP TO CONFIRM</>}
                    </button>
                </div>
            ))}
            {(form.pendingCharges || []).filter(c => parseFloat(c.amount) > 0).length > 1 && (
                <div style={{ fontSize: 11, fontFamily: T.font.mono, color: T.text.secondary, textAlign: "right", marginTop: -4, paddingRight: 2 }}>
                    TOTAL: ${(form.pendingCharges || []).reduce((s, c) => s + (parseFloat(c.amount) || 0), 0).toFixed(2)}
                </div>
            )}
            <p style={{ fontSize: 11, color: T.text.muted, marginTop: 10, lineHeight: 1.5, textAlign: "center" }}>
                Confirm each charge before submitting.</p>
        </Card>

        {/* ── Paycheck Plan-Ahead ── */}
        {activeConfig.trackPaycheck !== false && <Card>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: T.bg.elevated, borderRadius: T.radius.md, padding: "10px 12px", border: `1px solid ${T.border.default}` }}>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.text.secondary, fontFamily: T.font.mono }}>PLAN-AHEAD PAYCHECK</div>
                        <div style={{ fontSize: 11, color: T.text.muted, marginTop: 2 }}>Include upcoming paycheck not yet deposited</div>
                    </div>
                    <button onClick={() => { haptic.light(); s("autoPaycheckAdd", !form.autoPaycheckAdd); }} style={{
                        width: 44, height: 24, borderRadius: 999,
                        border: `1px solid ${form.autoPaycheckAdd ? T.accent.primary : T.border.default}`,
                        background: form.autoPaycheckAdd ? T.accent.primaryDim : T.bg.elevated,
                        position: "relative", cursor: "pointer"
                    }}>
                        <div style={{
                            width: 18, height: 18, borderRadius: 999,
                            background: form.autoPaycheckAdd ? T.accent.primary : T.bg.card,
                            position: "absolute", top: 2, left: form.autoPaycheckAdd ? 22 : 2,
                            transition: "all .2s box-shadow .2s",
                            boxShadow: form.autoPaycheckAdd ? `0 0 6px ${T.accent.primary}60` : "0 1px 2px rgba(0,0,0,0.2)"
                        }} />
                    </button>
                </div>
                <div style={{ background: T.bg.elevated, borderRadius: T.radius.md, padding: "10px 12px", border: `1px solid ${T.border.default}` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.text.secondary, fontFamily: T.font.mono, marginBottom: 8 }}>
                        {activeConfig.incomeType === "hourly" ? "HOURS WORKED" : activeConfig.incomeType === "variable" ? "PAYCHECK AMOUNT" : "PAYCHECK OVERRIDE"}
                    </div>
                    <input type="number" inputMode="decimal" pattern="[0-9]*" step={activeConfig.incomeType === "hourly" ? "0.5" : "0.01"}
                        aria-label={activeConfig.incomeType === "hourly" ? "Hours worked" : activeConfig.incomeType === "variable" ? "Paycheck amount" : "Paycheck override"}
                        value={form.paycheckAddOverride} onChange={e => s("paycheckAddOverride", e.target.value)}
                        placeholder={`Use config ${activeConfig.incomeType === "hourly" ? "hrs" : "$"}`}
                        style={{ width: "100%", padding: "10px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontSize: 14 }} />
                </div>
            </div>
        </Card>}

        {/* ── ADVANCED DETAILS TOGGLE ── */}
        <div style={{ marginTop: 8, marginBottom: 8, borderTop: `1px solid ${T.border.subtle}`, paddingTop: 10 }}>
            <button onClick={() => { haptic.medium(); setShowAdvanced(!showAdvanced); }} style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "16px 20px", borderRadius: T.radius.lg, border: `1px solid ${showAdvanced ? T.accent.primary + '50' : T.border.subtle}`,
                background: showAdvanced ? `${T.accent.primary}0D` : T.bg.glass,
                backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
                color: showAdvanced ? T.text.primary : T.text.secondary,
                cursor: "pointer", transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
                boxShadow: showAdvanced ? `0 4px 16px ${T.accent.primary}1A, inset 0 1px 0 ${T.accent.primary}15` : "none"
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 10, background: showAdvanced ? `linear-gradient(135deg, ${T.accent.primary}, #6C60FF)` : T.bg.card, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: showAdvanced ? `0 2px 12px ${T.accent.primary}50` : "none", transition: "all .3s" }}>
                        <Zap size={14} color={showAdvanced ? "#fff" : T.text.muted} strokeWidth={2.5} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-0.01em" }}>Advanced Details</span>
                </div>
                <div style={{ transform: `rotate(${showAdvanced ? 180 : 0}deg)`, transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)", display: "flex" }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                </div>
            </button>
        </div>

        {/* ── ADVANCED PAYLOAD ── */}
        {showAdvanced && (
            <div style={{ animation: "fadeInUp 0.4s ease-out both" }}>
                {/* Investment auto-tracking section */}
                {(activeConfig.trackRoth || activeConfig.trackBrokerage || activeConfig.track401k) && (
                    <Card variant="glass" style={{ marginBottom: 10, position: "relative", overflow: "hidden" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                            <Label style={{ marginBottom: 0, fontWeight: 800 }}>Investment Balances</Label>
                            {financialConfig?.enableHoldings && (
                                <Badge variant="outline" style={{ fontSize: 9, color: T.accent.emerald, borderColor: `${T.accent.emerald}40` }}>AUTO-TRACKED</Badge>
                            )}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {activeConfig.trackRoth && (() => {
                                const hasAutoValue = financialConfig?.enableHoldings && (financialConfig?.holdings?.roth || []).length > 0 && holdingValues.roth > 0;
                                return <div style={{ padding: "10px 12px", background: T.bg.elevated, borderRadius: T.radius.md, border: `1px solid ${T.border.subtle}` }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: overrideInvest.roth ? 8 : 0 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                            <div style={{ width: 6, height: 6, borderRadius: 3, background: "#8B5CF6" }} />
                                            <span style={{ fontSize: 12, fontWeight: 700, color: T.text.primary }}>Roth IRA</span>
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            {hasAutoValue && !overrideInvest.roth && <Mono size={13} weight={800} color={T.accent.emerald}>{fmt(holdingValues.roth)}</Mono>}
                                            {hasAutoValue && <button onClick={() => setOverrideInvest(p => ({ ...p, roth: !p.roth }))} style={{
                                                fontSize: 9, fontWeight: 700, fontFamily: T.font.mono, padding: "3px 8px", borderRadius: T.radius.sm,
                                                border: `1px solid ${overrideInvest.roth ? T.accent.primary : T.border.default}`,
                                                background: overrideInvest.roth ? `${T.accent.primary}15` : "transparent",
                                                color: overrideInvest.roth ? T.accent.primary : T.text.dim, cursor: "pointer"
                                            }}>{overrideInvest.roth ? "CANCEL" : "OVERRIDE"}</button>}
                                        </div>
                                    </div>
                                    {(!hasAutoValue || overrideInvest.roth) && <DI value={form.roth} onChange={e => s("roth", sanitizeDollar(e.target.value))} placeholder={hasAutoValue ? `Auto: ${fmt(holdingValues.roth)}` : "Enter value"} />}
                                </div>;
                            })()}
                            {activeConfig.trackBrokerage && (() => {
                                const hasAutoValue = financialConfig?.enableHoldings && (financialConfig?.holdings?.brokerage || []).length > 0 && holdingValues.brokerage > 0;
                                return <div style={{ padding: "10px 12px", background: T.bg.elevated, borderRadius: T.radius.md, border: `1px solid ${T.border.subtle}` }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: overrideInvest.brokerage ? 8 : 0 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                            <div style={{ width: 6, height: 6, borderRadius: 3, background: "#10B981" }} />
                                            <span style={{ fontSize: 12, fontWeight: 700, color: T.text.primary }}>Brokerage</span>
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            {hasAutoValue && !overrideInvest.brokerage && <Mono size={13} weight={800} color={T.accent.emerald}>{fmt(holdingValues.brokerage)}</Mono>}
                                            {hasAutoValue && <button onClick={() => setOverrideInvest(p => ({ ...p, brokerage: !p.brokerage }))} style={{
                                                fontSize: 9, fontWeight: 700, fontFamily: T.font.mono, padding: "3px 8px", borderRadius: T.radius.sm,
                                                border: `1px solid ${overrideInvest.brokerage ? T.accent.primary : T.border.default}`,
                                                background: overrideInvest.brokerage ? `${T.accent.primary}15` : "transparent",
                                                color: overrideInvest.brokerage ? T.accent.primary : T.text.dim, cursor: "pointer"
                                            }}>{overrideInvest.brokerage ? "CANCEL" : "OVERRIDE"}</button>}
                                        </div>
                                    </div>
                                    {(!hasAutoValue || overrideInvest.brokerage) && <DI value={form.brokerage} onChange={e => s("brokerage", sanitizeDollar(e.target.value))} placeholder={hasAutoValue ? `Auto: ${fmt(holdingValues.brokerage)}` : "Enter value"} />}
                                </div>;
                            })()}
                            {activeConfig.track401k && (() => {
                                const hasAutoValue = financialConfig?.enableHoldings && (financialConfig?.holdings?.k401 || []).length > 0 && holdingValues.k401 > 0;
                                return <div style={{ padding: "10px 12px", background: T.bg.elevated, borderRadius: T.radius.md, border: `1px solid ${T.border.subtle}` }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: overrideInvest.k401 ? 8 : 0 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                            <div style={{ width: 6, height: 6, borderRadius: 3, background: "#3B82F6" }} />
                                            <span style={{ fontSize: 12, fontWeight: 700, color: T.text.primary }}>401(k)</span>
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            {hasAutoValue && !overrideInvest.k401 && <Mono size={13} weight={800} color={T.accent.emerald}>{fmt(holdingValues.k401)}</Mono>}
                                            {hasAutoValue && <button onClick={() => setOverrideInvest(p => ({ ...p, k401: !p.k401 }))} style={{
                                                fontSize: 9, fontWeight: 700, fontFamily: T.font.mono, padding: "3px 8px", borderRadius: T.radius.sm,
                                                border: `1px solid ${overrideInvest.k401 ? T.accent.primary : T.border.default}`,
                                                background: overrideInvest.k401 ? `${T.accent.primary}15` : "transparent",
                                                color: overrideInvest.k401 ? T.accent.primary : T.text.dim, cursor: "pointer"
                                            }}>{overrideInvest.k401 ? "CANCEL" : "OVERRIDE"}</button>}
                                        </div>
                                    </div>
                                    {(!hasAutoValue || overrideInvest.k401) && <DI value={form.k401Balance || ""} onChange={e => s("k401Balance", sanitizeDollar(e.target.value))} placeholder={hasAutoValue ? `Auto: ${fmt(holdingValues.k401)}` : "Enter value"} />}
                                </div>;
                            })()}
                        </div>
                    </Card>
                )}
                {financialConfig?.enableHoldings && financialConfig?.trackCrypto !== false && (financialConfig?.holdings?.crypto || []).length > 0 && holdingValues.crypto > 0 && (
                    <Card style={{ marginBottom: 10, border: `1px solid ${T.status.amber}25` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <Label style={{ marginBottom: 0 }}>Crypto Portfolio</Label>
                            <span style={{ fontSize: 14, fontWeight: 800, fontFamily: T.font.mono, color: T.status.amber }}>{fmt(holdingValues.crypto)}</span>
                        </div>
                        <div style={{ fontSize: 10, color: T.text.muted, marginTop: 4, fontFamily: T.font.mono }}>
                            {(financialConfig.holdings.crypto || []).map(h => (h.symbol || "").replace("-USD", "")).join(" · ")} · Live
                        </div>
                    </Card>
                )}
                {financialConfig?.trackHabits !== false && (
                    <Card style={{ padding: "12px 12px" }}><Label>{financialConfig?.habitName || "Habit"} Restock Count</Label>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            {[-1, 1].map(dir => (<button key={dir} onClick={() => {
                                haptic.light();
                                s("habitCount", Math.max(0, Math.min(30, (form.habitCount || 0) + dir)));
                            }} style={{
                                width: 40, height: 40, borderRadius: T.radius.md, border: `1.5px solid ${T.border.default}`,
                                background: T.bg.elevated, color: T.text.primary, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", order: dir === -1 ? 0 : 2
                            }}>
                                {dir === -1 ? <Minus size={16} /> : <Plus size={16} />}</button>))}
                            <div style={{ flex: 1, textAlign: "center", order: 1 }}>
                                <Mono size={26} weight={800} color={(form.habitCount || 0) <= (financialConfig?.habitCriticalThreshold || 3) ? T.status.red : (form.habitCount || 0) <= (financialConfig?.habitCheckThreshold || 6) ? T.status.amber : T.text.primary}>{form.habitCount || 0}</Mono>
                                {(form.habitCount || 0) <= (financialConfig?.habitCheckThreshold || 6) && <div style={{ fontSize: 11, color: (form.habitCount || 0) <= (financialConfig?.habitCriticalThreshold || 3) ? T.status.red : T.status.amber, marginTop: 3, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
                                    <AlertTriangle size={10} />{(form.habitCount || 0) <= (financialConfig?.habitCriticalThreshold || 3) ? "CRITICAL" : "BELOW THRESHOLD"}</div>}</div></div></Card>
                )}
                {activeConfig.budgetCategories?.length > 0 && (
                    <Card>
                        <Label>Weekly Budget Actuals</Label>
                        <p style={{ fontSize: 10, color: T.text.muted, marginBottom: 10, lineHeight: 1.4 }}>
                            Enter actual spending per category this week. The AI will compare vs. your monthly targets.
                        </p>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            {activeConfig.budgetCategories.filter(c => c.name).map((cat, i) => (
                                <div key={i}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: T.text.dim, fontFamily: T.font.mono, marginBottom: 4 }}>
                                        {cat.name.toUpperCase()}
                                    </div>
                                    <div style={{ position: "relative" }}>
                                        <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 12, fontWeight: 600 }}>$</span>
                                        <input
                                            type="number" inputMode="decimal" pattern="[0-9]*" step="0.01"
                                            aria-label={`${cat.name} weekly spending`}
                                            value={budgetActuals[cat.name] || ""}
                                            onChange={e => setBudgetActuals(p => ({ ...p, [cat.name]: e.target.value }))}
                                            placeholder="0.00"
                                            style={{ width: "100%", boxSizing: "border-box", padding: "9px 8px 9px 20px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12 }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                )}


                <Card variant="glass"><Label>Notes for this week</Label><textarea aria-label="Notes for this week" value={form.notes} onChange={e => s("notes", e.target.value)} placeholder="Examples: reimbursements, changes, or 'none'" /></Card>
            </div>
        )}

        {/* ── FINANCIAL PROFILE & RULES ── */}
        <div style={{ marginTop: 8, marginBottom: 16, borderTop: `1px solid ${T.border.subtle}`, paddingTop: 10 }}>
            <button onClick={() => { haptic.medium(); setShowConfig(!showConfig); }} style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "16px 20px", borderRadius: T.radius.lg, border: `1px solid ${showConfig ? T.accent.primary + '50' : T.border.subtle}`,
                background: showConfig ? `${T.accent.primary}0D` : T.bg.glass,
                backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
                color: showConfig ? T.text.primary : T.text.secondary,
                cursor: "pointer", transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
                boxShadow: showConfig ? `0 4px 16px ${T.accent.primary}1A, inset 0 1px 0 ${T.accent.primary}15` : "none"
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 10, background: showConfig ? `linear-gradient(135deg, ${T.accent.primary}, #6C60FF)` : T.bg.card, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: showConfig ? `0 2px 12px ${T.accent.primary}50` : "none", transition: "all .3s" }}>
                        <Zap size={14} color={showConfig ? "#fff" : T.text.muted} strokeWidth={2.5} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-0.01em" }}>Financial Profile & AI Rules</span>
                </div>
                <div style={{ transform: `rotate(${showConfig ? 180 : 0}deg)`, transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)", display: "flex" }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                </div>
            </button>

            {showConfig && (
                <div style={{ animation: "fadeInUp 0.4s ease-out both", marginTop: 12 }}>
                    <Card style={{ marginBottom: 12 }}>
                        <Label>Income & Cash Flow</Label>
                        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                            {["salary", "hourly", "variable"].map(type => (
                                <button key={type} onClick={() => { haptic.light(); setFinancialConfig({ ...financialConfig, incomeType: type }); }} style={{
                                    flex: 1, padding: "10px 0", borderRadius: T.radius.sm,
                                    border: `1px solid ${financialConfig?.incomeType === type ? T.accent.primary : T.border.default}`,
                                    background: financialConfig?.incomeType === type ? `${T.accent.primary}15` : T.bg.elevated,
                                    color: financialConfig?.incomeType === type ? T.accent.primary : T.text.secondary,
                                    fontSize: 12, fontWeight: 700, cursor: "pointer", textTransform: "capitalize", transition: "all .2s"
                                }}>{type}</button>
                            ))}
                        </div>

                        {financialConfig?.incomeType === "salary" && (
                            <div style={{ position: "relative" }}>
                                <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 14, fontWeight: 600 }}>$</span>
                                <input type="number" inputMode="decimal" aria-label="Monthly take-home salary" value={financialConfig?.monthlySalary || ""} onChange={e => setFinancialConfig && setFinancialConfig({ ...financialConfig, monthlySalary: parseFloat(e.target.value) || 0 })} placeholder="Monthly Take-Home Salary" className="app-input" style={{ width: "100%", padding: "12px 14px 12px 28px", borderRadius: T.radius.md, border: `1.5px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 14, boxSizing: "border-box", outline: "none" }} />
                            </div>
                        )}

                        {financialConfig?.incomeType === "hourly" && (
                            <div style={{ display: "flex", gap: 10 }}>
                                <div style={{ flex: 1, position: "relative" }}>
                                    <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 14, fontWeight: 600 }}>$</span>
                                    <input type="number" inputMode="decimal" aria-label="Hourly rate" value={financialConfig?.hourlyRate || ""} onChange={e => setFinancialConfig && setFinancialConfig({ ...financialConfig, hourlyRate: parseFloat(e.target.value) || 0 })} placeholder="Hourly Rate" className="app-input" style={{ width: "100%", padding: "12px 14px 12px 28px", borderRadius: T.radius.md, border: `1.5px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 14, boxSizing: "border-box", outline: "none" }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <input type="number" inputMode="decimal" aria-label="Hours per week" value={financialConfig?.assumedHours || ""} onChange={e => setFinancialConfig && setFinancialConfig({ ...financialConfig, assumedHours: parseFloat(e.target.value) || 0 })} placeholder="Hrs/Week" className="app-input" style={{ width: "100%", padding: "12px 14px", borderRadius: T.radius.md, border: `1.5px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 14, boxSizing: "border-box", outline: "none" }} />
                                </div>
                            </div>
                        )}

                        {financialConfig?.incomeType === "variable" && (
                            <div style={{ position: "relative" }}>
                                <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 14, fontWeight: 600 }}>$</span>
                                <input type="number" inputMode="decimal" aria-label="Typical paycheck amount" value={financialConfig?.typicalPaycheck || ""} onChange={e => setFinancialConfig && setFinancialConfig({ ...financialConfig, typicalPaycheck: parseFloat(e.target.value) || 0 })} placeholder="Typical Paycheck" className="app-input" style={{ width: "100%", padding: "12px 14px 12px 28px", borderRadius: T.radius.md, border: `1.5px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 14, boxSizing: "border-box", outline: "none" }} />
                            </div>
                        )}
                    </Card>

                    <Card style={{ marginBottom: 12 }}>
                        <Label>Custom AI Rules & Persona</Label>
                        <p style={{ fontSize: 11, color: T.text.muted, marginBottom: 10, lineHeight: 1.4 }}>
                            Define strict rules or change how the AI speaks to you.
                        </p>
                        <textarea aria-label="Custom AI rules and persona" value={personalRules || ""} onChange={e => setPersonalRules && setPersonalRules(e.target.value)} placeholder="e.g. Always remind me to save 20%. Be aggressive about my debt." style={{ width: "100%", height: 80, padding: "12px", borderRadius: T.radius.md, border: `1.5px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontFamily: T.font.sans, resize: "none", boxSizing: "border-box", outline: "none" }} className="app-input" />
                    </Card>
                </div>
            )}
        </div>

        {/* ── Plaid Transactions Card ── */}
        {plaidTransactions.length > 0 && (
            <Card style={{ marginBottom: 12, overflow: "hidden" }}>
                <button onClick={() => setShowTxns(!showTxns)} style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: 0, border: "none", background: "none", cursor: "pointer", color: T.text.primary, gap: 8
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <TrendingUp size={15} color={T.accent.primary} />
                        <span style={{ fontSize: 13, fontWeight: 700 }}>Recent Spending</span>
                        <Badge style={{ background: T.accent.primary + "20", color: T.accent.primary, fontSize: 10, fontWeight: 800 }}>
                            {plaidTransactions.length} txns
                        </Badge>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: T.status.red, fontFamily: T.font.mono }}>
                            -${plaidTransactions.reduce((s, t) => s + t.amount, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        {showTxns ? <ChevronUp size={14} color={T.text.muted} /> : <ChevronDown size={14} color={T.text.muted} />}
                    </div>
                </button>
                {txnFetchedAt && (
                    <p style={{ fontSize: 10, color: T.text.dim, marginTop: 4, marginBottom: showTxns ? 8 : 0 }}>
                        Synced {new Date(txnFetchedAt).toLocaleDateString()} · Last 7 days · Auto-included in audit
                    </p>
                )}
                {showTxns && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 280, overflowY: "auto" }}>
                        {plaidTransactions.map((t, i) => (
                            <div key={t.id || i} style={{
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                padding: "6px 0", borderTop: i > 0 ? `1px solid ${T.border.subtle}` : "none"
                            }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: T.text.primary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {t.description}
                                    </div>
                                    <div style={{ fontSize: 10, color: T.text.dim, marginTop: 1 }}>
                                        {t.date} · {t.category || "Uncategorized"}{t.accountName ? ` · ${t.accountName}` : ""}
                                    </div>
                                </div>
                                <Mono style={{ fontSize: 12, fontWeight: 700, color: T.status.red, flexShrink: 0, marginLeft: 8 }}>
                                    -${t.amount.toFixed(2)}
                                </Mono>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        )}

        {/* Validation Feedback — errors + warnings */}
        {(validationErrors.length > 0 || validationWarnings.length > 0) && (
            <div style={{ marginBottom: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                {validationErrors.map((e, i) => (
                    <div key={`err-${i}`} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "10px 12px", borderRadius: T.radius.md,
                        background: T.status.redDim, border: `1px solid ${T.status.red}30`,
                        animation: "fadeIn .3s ease-out"
                    }}>
                        <AlertCircle size={14} color={T.status.red} style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: T.status.red, fontWeight: 600, lineHeight: 1.4 }}>{e.message}</span>
                    </div>
                ))}
                {validationWarnings.map((w, i) => (
                    <div key={`warn-${i}`} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "10px 12px", borderRadius: T.radius.md,
                        background: T.status.amberDim, border: `1px solid ${T.status.amber}30`,
                        animation: "fadeIn .3s ease-out"
                    }}>
                        <AlertCircle size={14} color={T.status.amber} style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: T.status.amber, fontWeight: 600, lineHeight: 1.4 }}>{w.message}</span>
                    </div>
                ))}
            </div>
        )}

        {/* Easy Win 1: Pre-fill indicator */}
        {lastAudit?.form?.checking && form.checking === lastAudit.form.checking && (
            <div style={{
                display: "flex", alignItems: "center", gap: 6, marginBottom: 10,
                padding: "8px 12px", borderRadius: T.radius.md,
                background: `${T.accent.primary}10`, border: `1px solid ${T.accent.primary}20`
            }}>
                <span style={{ fontSize: 12 }}>💡</span>
                <span style={{ fontSize: 11, color: T.text.secondary }}>Balances pre-filled from your last audit — update what's changed.</span>
            </div>
        )}

        <div style={{ display: "flex", gap: 10, position: "relative" }}>
            {/* Ambient glow behind Run Audit button */}
            {canSubmit && <div style={{ position: "absolute", left: "20%", bottom: -8, width: "60%", height: 30, background: isTestMode ? T.status.amber : T.accent.primary, filter: "blur(24px)", opacity: 0.25, borderRadius: "50%", pointerEvents: "none", animation: "pulse 3s ease-in-out infinite" }} />}
            <button onClick={() => canSubmit && onSubmit(buildMsg(), { ...form, budgetActuals }, isTestMode)} disabled={!canSubmit} style={{
                flex: 1, padding: "16px 20px", borderRadius: T.radius.lg, border: "none",
                background: canSubmit ? (isTestMode ? `linear-gradient(135deg,${T.status.amber},#d97706)` : `linear-gradient(135deg,${T.accent.primary},#6C60FF)`) : T.text.muted,
                color: canSubmit ? "#fff" : T.text.dim, fontSize: 15, fontWeight: 800, cursor: canSubmit ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 56,
                boxShadow: canSubmit ? `0 8px 24px ${isTestMode ? T.status.amber : T.accent.primary}40` : "none",
                transition: "all 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
                transform: canSubmit ? "scale(1)" : "scale(0.98)"
            }}>
                {isLoading ? <><Loader2 size={18} style={{ animation: "spin .8s linear infinite" }} />Running...</> :
                    <><Zap size={17} strokeWidth={2.5} />{isTestMode ? "Run Test Audit" : "Run Audit"}</>}
            </button>
            <button onClick={() => canSubmit && setIsTestMode(!isTestMode)} disabled={!canSubmit} title="Toggle test mode — audit not saved" style={{
                width: 56, borderRadius: T.radius.lg, border: `1.5px ${isTestMode ? "solid" : "dashed"} ${canSubmit ? T.status.amber : T.border.default}`,
                background: isTestMode ? T.status.amberDim : "transparent", color: canSubmit ? T.status.amber : T.text.dim,
                fontSize: 11, fontWeight: 800, cursor: canSubmit ? "pointer" : "not-allowed",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
                fontFamily: T.font.mono, minHeight: 56,
                transition: "all 0.25s ease-out"
            }}>
                <Zap size={13} strokeWidth={2.5} />{isTestMode ? "TESTING" : "TEST"}</button>
        </div>

    </div >;
}
