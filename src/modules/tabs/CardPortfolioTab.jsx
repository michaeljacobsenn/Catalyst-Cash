import { useState, useMemo, useEffect, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import AddAccountSheet from "./AddAccountSheet.jsx";
import { Plus, X, ChevronDown, ChevronUp, CreditCard, Edit3, Check, DollarSign, Building2, Landmark, TrendingUp, AlertTriangle, RefreshCw, Target, Wallet, ArrowLeft, Link2, CheckCircle2, Trash2, ReceiptText } from "lucide-react";
import { T, ISSUER_COLORS } from "../constants.js";
import { getIssuerCards, getPinnedForIssuer } from "../issuerCards.js";
import { getBankNames, getBankProducts } from "../bankCatalog.js";
import { getCardLabel } from "../cards.js";
import { fmt } from "../utils.js";
import { Card, Label, Badge } from "../ui.jsx";
import { Mono, EmptyState } from "../components.jsx";
import SearchableSelect from "../SearchableSelect.jsx";
import { fetchMarketPrices, getTickerOptions } from "../marketData.js";
import { connectBank, autoMatchAccounts, fetchBalancesAndLiabilities, fetchAllBalancesAndLiabilities, fetchAllTransactions, applyBalanceSync, saveConnectionLinks, purgeBrokenConnections, getConnections, getStoredTransactions } from "../plaid.js";
import { haptic } from "../haptics.js";
import { getCurrentTier, isGatingEnforced } from "../subscription.js";
import { usePlaidSync } from "../usePlaidSync.js";

const ENABLE_PLAID = true;
const REFRESH_COOLDOWNS = { free: 60 * 60 * 1000, pro: 5 * 60 * 1000 };

// One-time cleanup flag — runs once per app session
let _purgeDone = false;

function mergeUniqueById(existing = [], incoming = []) {
    if (!incoming.length) return existing;
    const map = new Map(existing.map(item => [item.id, item]));
    for (const item of incoming) {
        if (!map.has(item.id)) map.set(item.id, item);
    }
    return Array.from(map.values());
}

const INSTITUTIONS = [
    "Amex", "Bank of America", "Barclays", "Capital One", "Chase", "Citi",
    "Discover", "FNBO", "Goldman Sachs", "HSBC", "Navy Federal", "PenFed",
    "Synchrony", "TD Bank", "US Bank", "USAA", "Wells Fargo", "Other"
];

import { usePortfolio } from '../contexts/PortfolioContext.jsx';
import { useSettings } from '../contexts/SettingsContext.jsx';
import { useAudit } from '../contexts/AuditContext.jsx';

export default memo(function CardPortfolioTab({ onViewTransactions, proEnabled = false }) {
    const { current } = useAudit();
    const portfolioContext = usePortfolio();
    const cards = current?.isTest ? (current.demoPortfolio?.cards || []) : portfolioContext.cards;
    const setCards = current?.isTest ? () => { } : portfolioContext.setCards;
    const bankAccounts = current?.isTest ? (current.demoPortfolio?.bankAccounts || []) : portfolioContext.bankAccounts;
    const setBankAccounts = current?.isTest ? () => { } : portfolioContext.setBankAccounts;
    const { cardCatalog, marketPrices, setMarketPrices } = portfolioContext;
    const { financialConfig = {}, setFinancialConfig } = useSettings();
    const [collapsedIssuers, setCollapsedIssuers] = useState({});
    const [editingCard, setEditingCard] = useState(null);
    const [editStep, setEditStep] = useState(0);
    const [editForm, setEditForm] = useState({});
    const [activeAddForm, setActiveAddForm] = useState(null); // kept for legacy compat
    const [showAddSheet, setShowAddSheet] = useState(false);
    const [addSheetStep, setAddSheetStep] = useState(null);
    const [plaidLoading, setPlaidLoading] = useState(false);
    const [plaidResult, setPlaidResult] = useState(null);
    const [plaidError, setPlaidError] = useState(null);
    const openSheet = (step = null) => { setShowAddSheet(true); setAddSheetStep(step); setPlaidResult(null); setPlaidError(null); };
    const closeSheet = () => { setShowAddSheet(false); setAddSheetStep(null); setPlaidResult(null); setPlaidError(null); };

    // Purge broken connections (missing access token due to previous bug) on first mount
    useEffect(() => {
        if (_purgeDone) return;
        _purgeDone = true;
        purgeBrokenConnections().then(count => {
            if (count > 0 && window.toast) {
                window.toast.info(`Removed ${count} broken connection(s) — please reconnect via Plaid`);
            }
        }).catch(() => { });
    }, []);
    const handlePlaidConnect = async () => {
        setPlaidLoading(true); setPlaidResult(null); setPlaidError(null);
        try {
            await connectBank(
                async (connection) => {
                    const plaidInvestments = financialConfig.plaidInvestments || [];
                    const { newCards, newBankAccounts, newPlaidInvestments } = autoMatchAccounts(connection, cards, bankAccounts, cardCatalog, plaidInvestments);
                    await saveConnectionLinks(connection);

                    // Build deterministic local snapshot so we do not drop new Plaid records.
                    const allCards = mergeUniqueById(cards, newCards);
                    const allBanks = mergeUniqueById(bankAccounts, newBankAccounts);
                    const allInvests = mergeUniqueById(plaidInvestments, newPlaidInvestments);
                    setCards(allCards);
                    setBankAccounts(allBanks);
                    if (newPlaidInvestments.length > 0) {
                        setFinancialConfig({ type: 'SET_FIELD', field: 'plaidInvestments', value: allInvests });
                    }

                    // Fetch live balances and apply them
                    try {
                        const refreshed = await fetchBalancesAndLiabilities(connection.id);
                        if (refreshed) {
                            const { updatedCards, updatedBankAccounts, updatedPlaidInvestments } = applyBalanceSync(refreshed, allCards, allBanks, allInvests);
                            setCards(updatedCards);
                            setBankAccounts(updatedBankAccounts);
                            if (updatedPlaidInvestments) {
                                setFinancialConfig({ type: 'SET_FIELD', field: 'plaidInvestments', value: updatedPlaidInvestments });
                            }
                            await saveConnectionLinks(refreshed);
                        }
                    } catch (balErr) {
                        console.error('[Plaid] Balance fetch after connect failed:', balErr?.message || balErr);
                        if (window.toast) window.toast.info('Connected! Tap Sync to fetch balances.');
                    }

                    setPlaidResult('success');
                    setCollapsedSections(p => ({ ...p, creditCards: false, bankAccounts: false }));

                    // Count what was imported for the review alert
                    const importedCount = newCards.length + newBankAccounts.length + newPlaidInvestments.length;

                    setTimeout(() => {
                        closeSheet();
                        // Native iOS alert prompting user to review imported accounts
                        if (importedCount > 0) {
                            setTimeout(() => {
                                window.alert(
                                    `${importedCount} account${importedCount !== 1 ? "s" : ""} imported!\n\n` +
                                    "Plaid may assign generic names like \"Credit Card\" instead of the actual product name.\n\n" +
                                    "Please tap the ✏️ edit button on each imported account to verify and update:\n" +
                                    "• Card name (e.g. Sapphire Preferred)\n" +
                                    "• APR\n" +
                                    "• Annual fee & due date\n" +
                                    "• Statement close & payment due days"
                                );
                            }, 400);
                        }
                    }, 2200);
                },
                (err) => {
                    if (err?.message !== 'cancelled') {
                        setPlaidResult('error');
                        const msg = err?.message || 'Connection failed';
                        setPlaidError(msg);
                        if (window.toast) window.toast.error(msg);
                    }
                }
            );
        } finally { setPlaidLoading(false); }
    };

    // Plaid balance sync via shared hook
    const { syncing: plaidRefreshing, sync: handleRefreshPlaid } = usePlaidSync({
        cards, bankAccounts, financialConfig,
        setCards, setBankAccounts, setFinancialConfig,
        successMessage: "Synced balances successfully",
        autoFetchTransactions: true,
    });
    const [editingBank, setEditingBank] = useState(null);
    const [editBankForm, setEditBankForm] = useState({});

    // Holdings management state
    const [newHoldingSymbol, setNewHoldingSymbol] = useState({});
    const [newHoldingShares, setNewHoldingShares] = useState({});
    const [collapsedBanks, setCollapsedBanks] = useState({});

    // Master collapsible sections (all collapsed by default for a clean, compact view)
    const [collapsedSections, setCollapsedSections] = useState({
        creditCards: true,
        bankAccounts: true,
        savingsAccounts: true,
        investments: true,
        savingsGoals: true,
        otherAssets: true,
        debts: true
    });


    const removeBank = (bankId) => {
        const b = bankAccounts.find(x => x.id === bankId);
        if (!b) return;
        if (b._plaidAccountId) { alert("This account is synced via Plaid. Please disconnect it from Settings instead."); return; }
        setBankAccounts(bankAccounts.filter(x => x.id !== bankId));
    };

    const grouped = useMemo(() => {
        const g = {};
        cards.forEach(c => { (g[c.institution] = g[c.institution] || []).push(c); });
        return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
    }, [cards]);

    const totalLimit = useMemo(() => cards.reduce((s, c) => s + (c.limit || 0), 0), [cards]);
    const totalAF = useMemo(() => cards.reduce((s, c) => s + ((c.annualFee || 0) * (c.annualFeeWaived ? 0 : 1)), 0), [cards]);

    const startEdit = (card) => {
        setEditingCard(card.id);
        setEditStep(0);
        setEditForm({
            institution: card.institution || "", name: card.name || "",
            limit: String(card.limit || ""), annualFee: String(card.annualFee || ""),
            annualFeeDue: card.annualFeeDue || "", annualFeeWaived: !!card.annualFeeWaived,
            notes: card.notes || "", apr: String(card.apr || ""), nickname: card.nickname || "",
            hasPromoApr: !!card.hasPromoApr, promoAprAmount: String(card.promoAprAmount || ""),
            promoAprExp: card.promoAprExp || "",
            statementCloseDay: String(card.statementCloseDay || ""),
            paymentDueDay: String(card.paymentDueDay || ""),
            minPayment: String(card.minPayment || "")
        });
    };
    const saveEdit = (cardId) => {
        setCards(cards.map(c => c.id === cardId ? {
            ...c,
            institution: editForm.institution || c.institution,
            name: (editForm.name || "").trim() || c.name,
            limit: editForm.limit === "" ? null : parseFloat(editForm.limit) || null,
            annualFee: editForm.annualFee === "" ? null : parseFloat(editForm.annualFee) || null,
            annualFeeDue: editForm.annualFeeDue, annualFeeWaived: editForm.annualFeeWaived,
            notes: editForm.notes, apr: editForm.apr === "" ? null : parseFloat(editForm.apr) || null,
            nickname: editForm.nickname || "",
            hasPromoApr: editForm.hasPromoApr, promoAprAmount: editForm.promoAprAmount === "" ? null : parseFloat(editForm.promoAprAmount) || null,
            promoAprExp: editForm.promoAprExp,
            statementCloseDay: editForm.statementCloseDay === "" ? null : parseInt(editForm.statementCloseDay) || null,
            paymentDueDay: editForm.paymentDueDay === "" ? null : parseInt(editForm.paymentDueDay) || null,
            minPayment: editForm.minPayment === "" ? null : parseFloat(editForm.minPayment) || null
        } : c));
        setEditingCard(null);
    };
    const removeCard = (cardId) => {
        const card = cards.find(c => c.id === cardId);
        if (card?._plaidAccountId) { alert("This card is synced via Plaid. Please disconnect it from Settings instead."); return; }
        setCards(cards.filter(c => c.id !== cardId));
    };

    const ic = (inst) => ISSUER_COLORS[inst] || { bg: "rgba(110,118,129,0.08)", border: "rgba(110,118,129,0.15)", text: T.text.secondary, accent: T.text.dim };

    const WaivedCheckbox = ({ checked, onChange }) => (
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "10px 0" }}>
            <div style={{
                width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                border: checked ? "none" : `2px solid ${T.text.dim}`,
                background: checked ? T.accent.primary : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s"
            }} onClick={onChange}>
                {checked && <Check size={12} color={T.bg.base} strokeWidth={3} />}
            </div>
            <span style={{ fontSize: 12, color: T.text.secondary }}>Waived? <span style={{ fontSize: 10, color: T.text.dim }}>(first year free)</span></span>
        </label>
    );

    const PromoCheckbox = ({ checked, onChange }) => (
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "10px 0" }}>
            <div style={{
                width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                border: checked ? "none" : `2px solid ${T.text.dim}`,
                background: checked ? T.accent.emerald : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s"
            }} onClick={onChange}>
                {checked && <Check size={12} color={T.bg.base} strokeWidth={3} />}
            </div>
            <span style={{ fontSize: 12, color: T.text.secondary }}>Active Promo APR?</span>
        </label>
    );

    const totalAccounts = cards.length + bankAccounts.length;
    const checkingCount = bankAccounts.filter(a => a.accountType === "checking").length;
    const savingsCount = bankAccounts.filter(a => a.accountType === "savings").length;

    // ─── Early computations for Wealth Dashboard ─────────────────────
    const holdings = financialConfig?.holdings || { roth: [], k401: [], brokerage: [], crypto: [], hsa: [] };
    const investmentSections = [
        { key: "roth", label: "Roth IRA", enabled: !!financialConfig?.trackRothContributions, color: T.accent.primary },
        { key: "k401", label: "401(k)", enabled: !!financialConfig?.track401k, color: T.status.blue },
        { key: "brokerage", label: "Brokerage", enabled: !!financialConfig?.trackBrokerage, color: T.accent.emerald },
        { key: "hsa", label: "HSA", enabled: !!financialConfig?.trackHSA, color: "#06B6D4" },
        { key: "crypto", label: "Crypto", enabled: financialConfig?.trackCrypto !== false && holdings.crypto?.length > 0, color: T.status.amber },
    ];
    const enabledInvestments = investmentSections.filter(s => s.enabled || (holdings[s.key] || []).length > 0);
    const allHoldingSymbols = useMemo(() => {
        const syms = new Set();
        Object.values(holdings).flat().forEach(h => { if (h?.symbol) syms.add(h.symbol); });
        return [...syms];
    }, [holdings]);

    const [investPrices, setInvestPrices] = useState(marketPrices || {});
    const [collapsedInvest, setCollapsedInvest] = useState({});
    const [refreshingPrices, setRefreshingPrices] = useState(false);
    const [lastRefresh, setLastRefresh] = useState(null);

    // Merge in app-level prices when they arrive
    useEffect(() => {
        if (marketPrices && Object.keys(marketPrices).length > 0) {
            setInvestPrices(prev => ({ ...prev, ...marketPrices }));
        }
    }, [marketPrices]);

    // Fetch fresh prices on mount or when symbols change
    useEffect(() => {
        if (allHoldingSymbols.length > 0) {
            fetchMarketPrices(allHoldingSymbols).then(p => {
                if (p && Object.keys(p).length > 0) {
                    setInvestPrices(prev => ({ ...prev, ...p }));
                    if (setMarketPrices) setMarketPrices(prev => ({ ...prev, ...p }));
                    setLastRefresh(Date.now());
                }
            });
        }
    }, [allHoldingSymbols.join()]);

    // Manual refresh handler
    const handleRefreshPrices = useCallback(async () => {
        if (refreshingPrices || allHoldingSymbols.length === 0) return;
        setRefreshingPrices(true);
        try {
            const p = await fetchMarketPrices(allHoldingSymbols, true);
            if (p && Object.keys(p).length > 0) {
                setInvestPrices(prev => ({ ...prev, ...p }));
                if (setMarketPrices) setMarketPrices(prev => ({ ...prev, ...p }));
                setLastRefresh(Date.now());
            }
        } catch { /* network error, silently fail */ }
        setRefreshingPrices(false);
    }, [refreshingPrices, allHoldingSymbols, setMarketPrices]);

    const investTotalValue = useMemo(() => {
        let total = 0;
        Object.values(holdings).flat().forEach(h => {
            const p = investPrices[h?.symbol];
            if (p?.price) total += p.price * (h.shares || 0);
        });
        (financialConfig?.plaidInvestments || []).forEach(pi => {
            if (pi._plaidBalance) total += pi._plaidBalance;
        });
        return total;
    }, [holdings, investPrices, financialConfig?.plaidInvestments]);

    const nonCardDebts = financialConfig?.nonCardDebts || [];
    const totalDebtBalance = useMemo(() => nonCardDebts.reduce((s, d) => s + (d.balance || 0), 0), [nonCardDebts]);
    const [editingDebt, setEditingDebt] = useState(null);
    const [editDebtForm, setEditDebtForm] = useState({});

    const startEditDebt = (debt, i) => { setEditingDebt(i); setEditDebtForm({ name: debt.name || "", type: debt.type || "personal", balance: String(debt.balance || ""), apr: String(debt.apr || ""), minPayment: String(debt.minPayment || "") }); };
    const saveEditDebt = (i) => { const arr = [...nonCardDebts]; arr[i] = { ...arr[i], name: editDebtForm.name, type: editDebtForm.type, balance: parseFloat(editDebtForm.balance) || 0, apr: parseFloat(editDebtForm.apr) || 0, minPayment: parseFloat(editDebtForm.minPayment) || 0 }; setFinancialConfig({ ...financialConfig, nonCardDebts: arr }); setEditingDebt(null); };
    const removeDebt = (i) => { setFinancialConfig({ ...financialConfig, nonCardDebts: nonCardDebts.filter((_, j) => j !== i) }); };

    // ── SAVINGS GOALS ──
    const savingsGoals = financialConfig?.savingsGoals || [];
    const [editingGoals, setEditingGoals] = useState(false);
    const addGoal = () => setFinancialConfig({ ...financialConfig, savingsGoals: [...savingsGoals, { name: "", targetAmount: 0, currentAmount: 0, targetDate: "" }] });
    const updateGoal = (i, k, v) => { const arr = [...savingsGoals]; arr[i] = { ...arr[i], [k]: v }; setFinancialConfig({ ...financialConfig, savingsGoals: arr }); };
    const removeGoal = (i) => { setFinancialConfig({ ...financialConfig, savingsGoals: savingsGoals.filter((_, j) => j !== i) }); };

    // ── OTHER ASSETS ──
    const otherAssets = financialConfig?.otherAssets || [];
    const totalOtherAssets = otherAssets.reduce((s, a) => s + (a.value || 0), 0);
    const [editingAssets, setEditingAssets] = useState(false);
    const addAsset = () => setFinancialConfig({ ...financialConfig, otherAssets: [...otherAssets, { name: "", value: 0, liquid: false }] });
    const updateAsset = (i, k, v) => { const arr = [...otherAssets]; arr[i] = { ...arr[i], [k]: v }; setFinancialConfig({ ...financialConfig, otherAssets: arr }); };
    const removeAsset = (i) => { setFinancialConfig({ ...financialConfig, otherAssets: otherAssets.filter((_, j) => j !== i) }); };

    const totalCash = useMemo(() => bankAccounts.reduce((s, b) => s + (b._plaidBalance != null ? b._plaidBalance : 0), 0) + savingsGoals.reduce((s, g) => s + (g.currentAmount || 0), 0), [bankAccounts, savingsGoals]);
    const netWorth = totalCash + (investTotalValue || 0) + totalOtherAssets - totalDebtBalance;

    const headerSection = <>
        <div style={{ paddingTop: 20, paddingBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.02em" }}>Accounts</h1>
                    <Badge variant="outline" style={{ fontSize: 10, padding: "2px 7px", color: T.text.secondary, borderColor: T.border.default, fontFamily: T.font.mono }}>{totalAccounts}</Badge>
                </div>
                {ENABLE_PLAID && (cards.some(c => c._plaidAccountId) || bankAccounts.some(b => b._plaidAccountId)) && (<div style={{ display: "flex", gap: 6 }}>
                    {onViewTransactions && <button onClick={() => { haptic.light(); if (proEnabled) { onViewTransactions(); } else { toast?.("Ledger requires Catalyst Cash Pro", "info"); } }} className="hover-btn" style={{
                        display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 16,
                        border: `1px solid ${T.accent.emerald}25`, background: `${T.accent.emerald}08`,
                        color: T.accent.emerald, fontSize: 10, fontWeight: 700, cursor: "pointer",
                        transition: "all .2s", position: "relative"
                    }}>
                        <ReceiptText size={10} />
                        Ledger
                        {!proEnabled && <div style={{ position: "absolute", top: -4, right: -4, fontSize: 7, fontWeight: 800, background: T.accent.primary, color: "#fff", padding: "1px 4px", borderRadius: 4, fontFamily: T.font.mono }}>PRO</div>}
                    </button>}
                    <button onClick={handleRefreshPlaid} disabled={plaidRefreshing} className="hover-btn" style={{
                        display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 16,
                        border: `1px solid ${T.status.blue}25`, background: `${T.status.blue}08`,
                        color: T.status.blue, fontSize: 10, fontWeight: 700, cursor: plaidRefreshing ? "wait" : "pointer",
                        transition: "all .2s"
                    }}>
                        <RefreshCw size={10} className={plaidRefreshing ? "spin" : ""} />
                        {plaidRefreshing ? "Syncing…" : "Sync"}
                    </button>
                </div>)}
            </div>

            {/* Inline badges */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {cards.length > 0 && <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 99, background: `${T.accent.primary}10`, border: `1px solid ${T.accent.primary}18` }}>
                    <CreditCard size={9} color={T.accent.primary} />
                    <Mono size={9} weight={700} color={T.accent.primary}>{cards.length} Card{cards.length !== 1 ? "s" : ""}</Mono>
                </div>}
                {checkingCount > 0 && <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 99, background: `${T.status.blue}10`, border: `1px solid ${T.status.blue}18` }}>
                    <Landmark size={9} color={T.status.blue} />
                    <Mono size={9} weight={700} color={T.status.blue}>{checkingCount} Checking</Mono>
                </div>}
                {savingsCount > 0 && <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 99, background: `${T.accent.emerald}10`, border: `1px solid ${T.accent.emerald}18` }}>
                    <Landmark size={9} color={T.accent.emerald} />
                    <Mono size={9} weight={700} color={T.accent.emerald}>{savingsCount} Saving{savingsCount !== 1 ? "s" : ""}</Mono>
                </div>}
                {enabledInvestments.length > 0 && <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 99, background: `${T.accent.emerald}10`, border: `1px solid ${T.accent.emerald}18` }}>
                    <TrendingUp size={9} color={T.accent.emerald} />
                    <Mono size={9} weight={700} color={T.accent.emerald}>{enabledInvestments.length} Inv.</Mono>
                </div>}
                {nonCardDebts.length > 0 && <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 99, background: `${T.status.amber}10`, border: `1px solid ${T.status.amber}18` }}>
                    <AlertTriangle size={9} color={T.status.amber} />
                    <Mono size={9} weight={700} color={T.status.amber}>{nonCardDebts.length} Debt{nonCardDebts.length !== 1 ? "s" : ""}</Mono>
                </div>}
                {savingsGoals.length > 0 && <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 99, background: `${T.accent.primary}10`, border: `1px solid ${T.accent.primary}18` }}>
                    <Target size={9} color={T.accent.primary} />
                    <Mono size={9} weight={700} color={T.accent.primary}>{savingsGoals.length} Goal{savingsGoals.length !== 1 ? "s" : ""}</Mono>
                </div>}
            </div>
        </div>

        {/* Compact action buttons */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button onClick={() => openSheet()} className="hover-btn" style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 36, borderRadius: 18,
                border: "none", boxSizing: "border-box",
                background: T.accent.primary, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer",
                boxShadow: `inset 0 1px 1px rgba(255,255,255,0.15), 0 3px 10px ${T.accent.primary}25`
            }}><Plus size={13} />Add Account</button>
            {ENABLE_PLAID && <button onClick={(e) => { haptic.medium(); handlePlaidConnect(e); }} disabled={plaidLoading} className="hover-btn" style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 36, borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.08)", boxSizing: "border-box", background: "#000000",
                color: "#FFFFFF", fontSize: 12, fontWeight: 800, cursor: plaidLoading ? "wait" : "pointer",
                boxShadow: "0 3px 10px rgba(0,0,0,0.4)",
                opacity: plaidLoading ? 0.6 : 1, transition: "all .3s cubic-bezier(0.16, 1, 0.3, 1)"
            }}><Link2 size={12} />{plaidLoading ? "Connecting…" : "Connect with Plaid"}</button>}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 16, marginBottom: 4, padding: "0 4px" }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: T.text.secondary, textTransform: "uppercase", letterSpacing: "0.06em", lineHeight: "44px" }}>Categories</span>
            <button onClick={() => {
                const allCol = Object.values(collapsedSections).every(Boolean);
                setCollapsedSections({ creditCards: !allCol, bankAccounts: !allCol, savingsAccounts: !allCol, investments: !allCol, debts: !allCol, savingsGoals: !allCol, otherAssets: !allCol });
                // Also collapse/expand subcategories (issuers, banks, investment buckets)
                if (!allCol) {
                    // Collapsing: set all known subcategory keys to true
                    const issuerKeys = {};
                    grouped.forEach(([inst]) => { issuerKeys[inst] = true; });
                    setCollapsedIssuers(issuerKeys);
                    const bankKeys = {};
                    (bankAccounts || []).forEach(b => { if (b.name) bankKeys[b.name] = true; if (b.id) bankKeys[b.id] = true; });
                    setCollapsedBanks(bankKeys);
                    const investKeys = {};
                    ["roth", "brokerage", "k401", "hsa", "crypto"].forEach(k => { investKeys[k] = true; });
                    setCollapsedInvest(investKeys);
                } else {
                    // Expanding: clear all subcategory states
                    setCollapsedIssuers({});
                    setCollapsedBanks({});
                    setCollapsedInvest({});
                }
            }} style={{ border: "none", background: "transparent", color: T.accent.primary, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                {Object.values(collapsedSections).every(Boolean) ? "Expand All" : "Collapse All"}
            </button>
        </div>
    </>;

    const creditCardsSection = cards.length > 0 ? <div>
        <div
            onClick={() => setCollapsedSections(p => ({ ...p, creditCards: !p.creditCards }))}
            style={{
                display: "flex", alignItems: "center", gap: 12, marginTop: 8, marginBottom: collapsedSections.creditCards ? 8 : 16,
                padding: "16px 20px", borderRadius: 24, cursor: "pointer", userSelect: "none",
                background: T.bg.glass, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
                border: `1px solid ${T.border.subtle}`, boxShadow: `0 4px 16px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255,255,255,0.05)`,
                transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
            }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: `${T.accent.primary}1A`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 12px ${T.accent.primary}10` }}>
                <CreditCard size={14} color={T.accent.primary} />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>Credit Cards</h2>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <Badge variant="outline" style={{ fontSize: 10, color: cards.length > 0 ? T.accent.primary : T.text.muted, borderColor: cards.length > 0 ? `${T.accent.primary}40` : T.border.default }}>
                    {cards.length === 0 ? "0 cards" : cards.length}
                </Badge>
                <ChevronDown size={16} color={T.text.muted} className="chevron-animated" data-open={String(!collapsedSections.creditCards)} />
            </div>
        </div>

        {!collapsedSections.creditCards && (grouped.length === 0 ?
            <Card style={{ padding: "16px", textAlign: "center" }}><p style={{ fontSize: 11, color: T.text.muted }}>No credit cards yet — tap Add Account to get started.</p></Card> :
            grouped.map(([inst, cardsInCategory]) => {
                const colors = ic(inst);
                const isCollapsed = collapsedIssuers[inst];
                return <Card key={inst} animate variant="glass" className="hover-card" style={{ marginBottom: 16, padding: 0, overflow: "hidden", borderLeft: `4px solid ${colors.text}` }}>
                    <div onClick={() => setCollapsedIssuers(p => ({ ...p, [inst]: !isCollapsed }))} style={{ padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", background: `${colors.text}08` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ padding: 6, borderRadius: 8, background: colors.text, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <CreditCard size={14} color={T.bg.card} />
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 800, color: colors.text, textTransform: "uppercase", letterSpacing: "0.05em" }}>{inst}</span>
                            <Badge variant="outline" style={{ fontSize: 11, color: colors.text, borderColor: `${colors.text}40` }}>{cardsInCategory.length}</Badge>
                        </div>
                        <ChevronDown size={14} color={T.text.dim} className="chevron-animated" data-open={String(!isCollapsed)} />
                    </div>
                    <div className="collapse-section" data-collapsed={String(isCollapsed)}><div style={{ padding: 0 }}>
                        {cardsInCategory.map((card, i) => (
                            <div key={card.id} style={{ borderBottom: i === cardsInCategory.length - 1 ? "none" : `1px solid ${T.border.subtle}` }}>
                                <div style={{ padding: "10px 16px" }}>
                                    {editingCard === card.id ?
                                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                            {/* ── iOS Segmented Control ── */}
                                            {(() => {
                                                const tabs = [
                                                    { label: "Card", filled: !!(editForm.institution || editForm.name || editForm.limit) },
                                                    { label: "Rates", filled: !!(editForm.annualFee || editForm.apr) },
                                                    { label: "Billing", filled: !!(editForm.paymentDueDay || editForm.statementCloseDay || editForm.minPayment) }
                                                ];
                                                return (
                                                    <div style={{ display: "flex", borderRadius: T.radius.md, background: `${T.bg.elevated}`, border: `1px solid ${T.border.default}`, padding: 2, position: "relative" }}>
                                                        {/* Sliding pill */}
                                                        <div style={{
                                                            position: "absolute", top: 2, left: `calc(${editStep * 33.33}% + 2px)`,
                                                            width: "calc(33.33% - 4px)", height: "calc(100% - 4px)",
                                                            borderRadius: T.radius.sm, background: T.accent.primaryDim,
                                                            transition: "left 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                                                            zIndex: 0
                                                        }} />
                                                        {tabs.map((tab, idx) => (
                                                            <button key={idx} onClick={() => { haptic.selection(); setEditStep(idx); }} style={{
                                                                flex: 1, padding: "7px 0", border: "none", background: "transparent",
                                                                color: editStep === idx ? T.accent.primary : T.text.dim,
                                                                fontSize: 10, fontWeight: editStep === idx ? 800 : 600, cursor: "pointer",
                                                                fontFamily: T.font.mono, position: "relative", zIndex: 1,
                                                                transition: "color 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 4
                                                            }}>
                                                                {tab.filled && editStep !== idx && <CheckCircle2 size={9} style={{ opacity: 0.6 }} />}
                                                                {tab.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                );
                                            })()}

                                            {/* ── Page 0: Card Identity ── */}
                                            {editStep === 0 && <>
                                                <span style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 700, letterSpacing: 0.5 }}>CARD DETAILS</span>
                                                <div style={{ display: "flex", gap: 8 }}>
                                                    <SearchableSelect
                                                        value={editForm.institution}
                                                        onChange={v => setEditForm(p => ({ ...p, institution: v }))}
                                                        placeholder="Issuer"
                                                        options={INSTITUTIONS.map(i => ({ value: i, label: i }))}
                                                    />
                                                    <SearchableSelect
                                                        value={editForm.name}
                                                        onChange={v => setEditForm(p => ({ ...p, name: v }))}
                                                        placeholder="Select Card"
                                                        options={(() => {
                                                            const list = getIssuerCards(editForm.institution, cardCatalog);
                                                            const pinned = getPinnedForIssuer(editForm.institution, cardCatalog);
                                                            const pinnedSet = new Set(pinned.map(p => p.toLowerCase()));
                                                            const pinnedItems = list.filter(c => pinnedSet.has(c.name.toLowerCase()) && c.status !== "discontinued");
                                                            const restActive = list.filter(c => !pinnedSet.has(c.name.toLowerCase()) && c.status !== "discontinued")
                                                                .sort((a, b) => a.name.localeCompare(b.name));
                                                            return [
                                                                ...pinnedItems.map(c => ({ value: c.name, label: c.name, group: "Popular" })),
                                                                ...restActive.map(c => ({ value: c.name, label: c.name, group: "All Cards" }))
                                                            ];
                                                        })()}
                                                    />
                                                </div>
                                                <div style={{ display: "flex", gap: 8 }}>
                                                    <div style={{ flex: 1, position: "relative" }}>
                                                        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontFamily: T.font.mono, fontSize: 14, fontWeight: 600 }}>$</span>
                                                        <input type="number" inputMode="decimal" pattern="[0-9]*" value={editForm.limit} onChange={e => setEditForm(p => ({ ...p, limit: e.target.value }))}
                                                            placeholder="Limit" aria-label="Credit limit" style={{ paddingLeft: 28, fontFamily: T.font.mono, fontWeight: 600 }} />
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <input value={editForm.nickname} onChange={e => setEditForm(p => ({ ...p, nickname: e.target.value }))}
                                                            placeholder="Nickname (e.g. 'Daily Driver')" aria-label="Card nickname" style={{ width: "100%", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                                                    </div>
                                                </div>
                                                {card._plaidAccountId &&
                                                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.subtle}`, background: T.bg.elevated }}>
                                                        <span style={{ fontSize: 11, color: T.text.dim }}>⚡ Synced via Plaid</span>
                                                    </div>
                                                }
                                            </>}

                                            {/* ── Page 1: Fees & Rates ── */}
                                            {editStep === 1 && <>
                                                <span style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 700, letterSpacing: 0.5 }}>FEES & INTEREST</span>
                                                <div style={{ display: "flex", gap: 8 }}>
                                                    <div style={{ flex: 0.5, position: "relative" }}>
                                                        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontFamily: T.font.mono, fontSize: 13, fontWeight: 600 }}>$</span>
                                                        <input type="number" inputMode="decimal" pattern="[0-9]*" value={editForm.annualFee} onChange={e => setEditForm(p => ({ ...p, annualFee: e.target.value }))}
                                                            placeholder="Annual Fee" aria-label="Annual fee" style={{ paddingLeft: 28, fontFamily: T.font.mono, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                                                    </div>
                                                    <div style={{ flex: 0.5, position: "relative" }}>
                                                        <span style={{ position: "absolute", left: 10, top: "8px", color: T.text.dim, fontSize: 11, fontWeight: 700, pointerEvents: "none" }}>AF DUE</span>
                                                        <input type="date" value={editForm.annualFeeDue} onChange={e => setEditForm(p => ({ ...p, annualFeeDue: e.target.value }))}
                                                            aria-label="Annual fee due date" style={{ width: "100%", padding: "20px 10px 6px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, outline: "none", boxSizing: "border-box", height: "100%" }} />
                                                    </div>
                                                </div>
                                                <div style={{ marginTop: -4, paddingLeft: 4 }}>
                                                    <WaivedCheckbox checked={editForm.annualFeeWaived} onChange={() => setEditForm(p => ({ ...p, annualFeeWaived: !p.annualFeeWaived }))} />
                                                </div>
                                                <div style={{ display: "flex", gap: 8 }}>
                                                    <div style={{ flex: 1, position: "relative" }}>
                                                        <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontFamily: T.font.mono, fontSize: 12 }}>%</span>
                                                        <input type="number" inputMode="decimal" pattern="[0-9]*" value={editForm.apr} onChange={e => setEditForm(p => ({ ...p, apr: e.target.value }))}
                                                            placeholder="Standard APR (%)" aria-label="Standard APR percentage" style={{ width: "100%", padding: "10px 24px 10px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontFamily: T.font.mono, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                                                    </div>
                                                </div>
                                                <div style={{ marginTop: -4, paddingLeft: 4 }}>
                                                    <PromoCheckbox checked={editForm.hasPromoApr} onChange={() => setEditForm(p => ({ ...p, hasPromoApr: !p.hasPromoApr }))} />
                                                </div>
                                                {editForm.hasPromoApr && <div style={{ display: "flex", gap: 8, marginTop: -4 }}>
                                                    <div style={{ flex: 0.5, position: "relative" }}>
                                                        <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontFamily: T.font.mono, fontSize: 12 }}>%</span>
                                                        <input type="number" inputMode="decimal" pattern="[0-9]*" value={editForm.promoAprAmount} onChange={e => setEditForm(p => ({ ...p, promoAprAmount: e.target.value }))}
                                                            placeholder="Promo APR" aria-label="Promo APR percentage" style={{ width: "100%", padding: "10px 24px 10px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontFamily: T.font.mono, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                                                    </div>
                                                    <div style={{ flex: 0.5, position: "relative" }}>
                                                        <span style={{ position: "absolute", left: 10, top: "8px", color: T.text.dim, fontSize: 11, fontWeight: 700, pointerEvents: "none" }}>PROMO EXP</span>
                                                        <input type="date" value={editForm.promoAprExp} onChange={e => setEditForm(p => ({ ...p, promoAprExp: e.target.value }))}
                                                            aria-label="Promo APR expiration date" style={{ width: "100%", padding: "20px 10px 6px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, outline: "none", boxSizing: "border-box", height: "100%" }} />
                                                    </div>
                                                </div>}
                                            </>}

                                            {/* ── Page 2: Payment & Notes ── */}
                                            {editStep === 2 && <>
                                                <span style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 700, letterSpacing: 0.5 }}>BILLING & NOTES</span>
                                                <div style={{ display: "flex", gap: 6 }}>
                                                    <div style={{ flex: 1 }}>
                                                        <span style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono, display: "block", marginBottom: 2 }}>STMT CLOSES</span>
                                                        <input type="number" inputMode="decimal" pattern="[0-9]*" min="1" max="31" value={editForm.statementCloseDay} onChange={e => setEditForm(p => ({ ...p, statementCloseDay: e.target.value }))}
                                                            placeholder="Day" aria-label="Statement close day" style={{ width: "100%", padding: "8px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <span style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono, display: "block", marginBottom: 2 }}>PMT DUE</span>
                                                        <input type="number" inputMode="decimal" pattern="[0-9]*" min="1" max="31" value={editForm.paymentDueDay} onChange={e => setEditForm(p => ({ ...p, paymentDueDay: e.target.value }))}
                                                            placeholder="Day" aria-label="Payment due day" style={{ width: "100%", padding: "8px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                                                    </div>
                                                    <div style={{ flex: 1, position: "relative" }}>
                                                        <span style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono, display: "block", marginBottom: 2 }}>MIN PMT</span>
                                                        <span style={{ position: "absolute", left: 8, bottom: 9, color: T.text.dim, fontSize: 11, fontWeight: 600 }}>$</span>
                                                        <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={editForm.minPayment} onChange={e => setEditForm(p => ({ ...p, minPayment: e.target.value }))}
                                                            placeholder="35" aria-label="Minimum payment" style={{ width: "100%", padding: "8px 8px 8px 18px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                                                    </div>
                                                </div>
                                                <input value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))}
                                                    placeholder="Notes" aria-label="Card notes" style={{ width: "100%", fontSize: 13, padding: "8px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, outline: "none", boxSizing: "border-box" }} />
                                            </>}

                                            {/* ── Actions — always visible ── */}
                                            <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                                                {editStep > 0 && (
                                                    <button onClick={() => { haptic.selection(); setEditStep(s => s - 1); }} aria-label="Previous page" style={{
                                                        flex: 0.6, padding: 10, borderRadius: T.radius.sm,
                                                        border: `1px solid ${T.border.default}`, background: "transparent", color: T.text.dim, fontSize: 11, cursor: "pointer", fontWeight: 600
                                                    }}>← Back</button>
                                                )}
                                                <button onClick={() => saveEdit(card.id)} style={{
                                                    flex: 1, padding: 10, borderRadius: T.radius.sm, border: "none",
                                                    background: T.accent.primaryDim, color: T.accent.primary, fontSize: 11, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                                                }}>
                                                    <Check size={12} />Save</button>
                                                {editStep < 2 && (
                                                    <button onClick={() => { haptic.selection(); setEditStep(s => s + 1); }} aria-label="Next page" style={{
                                                        flex: 0.6, padding: 10, borderRadius: T.radius.sm,
                                                        border: `1px solid ${T.border.default}`, background: "transparent", color: T.text.primary, fontSize: 11, fontWeight: 700, cursor: "pointer"
                                                    }}>Next →</button>
                                                )}
                                                <button onClick={() => setEditingCard(null)} style={{
                                                    flex: 0.5, padding: 10, borderRadius: T.radius.sm,
                                                    border: `1px solid ${T.border.default}`, background: "transparent", color: T.text.dim, fontSize: 11, cursor: "pointer", fontWeight: 600
                                                }}>Cancel</button>
                                            </div>
                                            {/* Delete — subtle destructive link */}
                                            <div style={{ textAlign: "center", paddingTop: 2 }}>
                                                <button onClick={() => { if (window.confirm(`Delete "${card.nickname || card.name}"?`)) removeCard(card.id); }} style={{
                                                    background: "none", border: "none", color: T.status.red, fontSize: 10, cursor: "pointer", fontWeight: 600, opacity: 0.6, padding: "2px 8px"
                                                }}>Delete card</button>
                                            </div>
                                        </div> :
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <span style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, lineHeight: 1.3, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getCardLabel(cards, card).replace(inst + " ", "")}</span>
                                                <Mono size={10} color={T.text.dim} style={{ display: "block", marginTop: 3, lineHeight: 1.4 }}>
                                                    {[card.annualFee > 0 && (card.annualFeeWaived ? "AF waived" : `AF ${fmt(card.annualFee)}${card.annualFeeDue ? ` · ${card.annualFeeDue}` : ""}`),
                                                    card.apr > 0 && `${card.apr}% APR`,
                                                    card.hasPromoApr && `Promo ${card.promoAprAmount}%${card.promoAprExp ? ` till ${card.promoAprExp}` : ""}`,
                                                    card.paymentDueDay && `Due day ${card.paymentDueDay}${card.minPayment ? ` · min ${fmt(card.minPayment)}` : ""}`,
                                                    card._plaidAccountId && `⚡ ···${(card.notes || "").match(/···(\d+)/)?.[1] || "Plaid"}`
                                                    ].filter(Boolean).join("  ·  ")}
                                                </Mono>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                                                    {card._plaidBalance != null && (
                                                        <Mono size={14} weight={900} color={T.status.red}>{fmt(card._plaidBalance)}</Mono>
                                                    )}
                                                    <Mono size={card._plaidBalance != null ? 10 : 13} weight={700} color={card._plaidBalance != null ? T.text.dim : colors.text}>{card._plaidBalance != null ? "Limit " : ""}{fmt(card.limit)}</Mono>
                                                </div>
                                                <button onClick={() => startEdit(card)} style={{
                                                    width: 32, height: 32, borderRadius: T.radius.md,
                                                    border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.dim,
                                                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
                                                }}>
                                                    <Edit3 size={11} /></button>
                                            </div>
                                        </div>}
                                </div>
                            </div>
                        ))}
                    </div></div>
                </Card>;
            })
        )}
    </div> : null;

    // ─── Bank Accounts Section ─────────────────────────────────────

    const removeBankAccount = (id) => {
        setBankAccounts(bankAccounts.filter(a => a.id !== id));
    };

    const startEditBank = (acct) => {
        setEditingBank(acct.id);
        setEditBankForm({ bank: acct.bank, accountType: acct.accountType, name: acct.name, apy: String(acct.apy || ""), notes: acct.notes || "" });
    };

    const saveEditBank = (id) => {
        setBankAccounts(bankAccounts.map(a => a.id === id ? {
            ...a, bank: editBankForm.bank || a.bank, accountType: editBankForm.accountType || a.accountType,
            name: (editBankForm.name || "").trim() || a.name,
            apy: editBankForm.apy === "" ? null : parseFloat(editBankForm.apy) || null,
            notes: editBankForm.notes,
        } : a));
        setEditingBank(null);
    };

    // Split bank accounts by type for separate sections
    const checkingAccounts = useMemo(() => bankAccounts.filter(a => a.accountType === "checking"), [bankAccounts]);
    const savingsAccounts = useMemo(() => bankAccounts.filter(a => a.accountType === "savings"), [bankAccounts]);

    const groupedChecking = useMemo(() => {
        const g = {};
        checkingAccounts.forEach(a => { (g[a.bank] = g[a.bank] || []).push(a); });
        return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
    }, [checkingAccounts]);

    const groupedSavings = useMemo(() => {
        const g = {};
        savingsAccounts.forEach(a => { (g[a.bank] = g[a.bank] || []).push(a); });
        return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
    }, [savingsAccounts]);

    const bankSection = checkingAccounts.length > 0 ? <div>
        {/* Premium Section Header: Checking Accounts */}
        <div
            onClick={() => setCollapsedSections(p => ({ ...p, bankAccounts: !p.bankAccounts }))}
            style={{
                display: "flex", alignItems: "center", gap: 12, marginTop: 8, marginBottom: collapsedSections.bankAccounts ? 8 : 16,
                padding: "16px 20px", borderRadius: 24, cursor: "pointer", userSelect: "none",
                background: T.bg.glass, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
                border: `1px solid ${T.border.subtle}`, boxShadow: `0 4px 16px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255,255,255,0.05)`,
                transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
            }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: `${T.status.blue}1A`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 12px ${T.status.blue}10` }}>
                <Landmark size={14} color={T.status.blue} />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>Checking Accounts</h2>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <Badge variant="outline" style={{ fontSize: 10, color: checkingAccounts.length > 0 ? T.status.blue : T.text.muted, borderColor: checkingAccounts.length > 0 ? `${T.status.blue}40` : T.border.default }}>
                    {checkingAccounts.length}
                </Badge>
                <ChevronDown size={16} color={T.text.muted} className="chevron-animated" data-open={String(!collapsedSections.bankAccounts)} />
            </div>
        </div>

        {!collapsedSections.bankAccounts && (
            <>
                {groupedChecking.length === 0 ?
                    <Card style={{ padding: "16px", textAlign: "center" }}><p style={{ fontSize: 11, color: T.text.muted }}>No checking accounts yet</p></Card> :
                    groupedChecking.map(([bank, accts]) => {
                        const isCollapsed = collapsedBanks[`checking-${bank}`];
                        return <Card key={`c-${bank}`} animate variant="glass" className="hover-card" style={{ marginBottom: 12, padding: 0, overflow: "hidden", borderLeft: `4px solid ${T.status.blue}` }}>
                            <div onClick={() => setCollapsedBanks(p => ({ ...p, [`checking-${bank}`]: !isCollapsed }))} style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", background: `${T.status.blue}08` }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <div style={{ padding: 5, borderRadius: 7, background: T.status.blue, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <Building2 size={12} color={T.bg.card} />
                                    </div>
                                    <span style={{ fontSize: 12, fontWeight: 800, color: T.status.blue, textTransform: "uppercase", letterSpacing: "0.05em" }}>{bank}</span>
                                    <Badge variant="outline" style={{ fontSize: 10, color: T.status.blue, borderColor: `${T.status.blue}40` }}>{accts.length}</Badge>
                                </div>
                                <ChevronDown size={14} color={T.text.dim} className="chevron-animated" data-open={String(!isCollapsed)} />
                            </div>
                            <div className="collapse-section" data-collapsed={String(isCollapsed)}><div style={{ padding: 0 }}>
                                {accts.sort((a, b) => a.name.localeCompare(b.name)).map((acct, i) => (
                                    <div key={acct.id} style={{ borderBottom: i === accts.length - 1 ? "none" : `1px solid ${T.border.subtle}` }}>
                                        <div style={{ padding: "10px 16px" }}>
                                            {editingBank === acct.id ?
                                                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                                    <input value={editBankForm.name} onChange={e => setEditBankForm(p => ({ ...p, name: e.target.value }))} placeholder="Account name" aria-label="Account name"
                                                        style={{ width: "100%", fontSize: 13, padding: "10px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, outline: "none", boxSizing: "border-box" }} />
                                                    <div style={{ display: "flex", gap: 8 }}>
                                                        <div style={{ flex: 0.4, position: "relative" }}>
                                                            <input type="number" inputMode="decimal" step="0.01" value={editBankForm.apy} onChange={e => setEditBankForm(p => ({ ...p, apy: e.target.value }))} placeholder="APY" aria-label="APY percentage"
                                                                style={{ width: "100%", padding: "10px 24px 10px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontFamily: T.font.mono, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                                                            <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 12 }}>%</span>
                                                        </div>
                                                        <input value={editBankForm.notes} onChange={e => setEditBankForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes" aria-label="Account notes"
                                                            style={{ flex: 1, fontSize: 13, padding: "10px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, outline: "none", boxSizing: "border-box" }} />
                                                    </div>
                                                    <div style={{ display: "flex", gap: 8 }}>
                                                        <button onClick={() => saveEditBank(acct.id)} style={{ flex: 1, padding: 12, borderRadius: T.radius.sm, border: "none", background: `${T.status.blue}18`, color: T.status.blue, fontSize: 11, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Check size={14} />Save</button>
                                                        <button onClick={() => { if (window.confirm(`Delete "${acct.name}"?`)) removeBankAccount(acct.id); }} style={{ flex: 1, padding: 12, borderRadius: T.radius.sm, border: "none", background: T.status.redDim, color: T.status.red, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>Delete</button>
                                                        <button onClick={() => setEditingBank(null)} style={{ flex: 1, padding: 12, borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: "transparent", color: T.text.dim, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Cancel</button>
                                                    </div>
                                                </div> :
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <span style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, display: "block" }}>{acct.name}</span>
                                                        {(acct.apy > 0 || acct._plaidAccountId || (acct.notes && !acct._plaidAccountId)) && <Mono size={10} color={T.text.dim} style={{ display: "block", marginTop: 3 }}>
                                                            {[acct.apy > 0 && `${acct.apy}% APY`,
                                                            acct._plaidAccountId && `⚡ Plaid`
                                                            ].filter(Boolean).join("  ·  ") || (acct.notes && !acct._plaidAccountId ? acct.notes : "")}
                                                        </Mono>}
                                                    </div>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                                        <Mono size={14} weight={900} color={acct._plaidBalance != null ? T.status.blue : T.text.muted}>{acct._plaidBalance != null ? fmt(acct._plaidBalance) : "\u2014"}</Mono>
                                                        <button onClick={() => startEditBank(acct)} style={{ width: 32, height: 32, borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.dim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Edit3 size={11} /></button>
                                                    </div>
                                                </div>}
                                        </div>
                                    </div>
                                ))}
                            </div></div>
                        </Card>;
                    })}
            </>
        )}
    </div> : null;

    const savingsSection = savingsAccounts.length > 0 ? <div>
        {/* Premium Section Header: Savings Accounts */}
        <div
            onClick={() => setCollapsedSections(p => ({ ...p, savingsAccounts: !p.savingsAccounts }))}
            style={{
                display: "flex", alignItems: "center", gap: 12, marginTop: 8, marginBottom: collapsedSections.savingsAccounts ? 8 : 16,
                padding: "16px 20px", borderRadius: 24, cursor: "pointer", userSelect: "none",
                background: T.bg.glass, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
                border: `1px solid ${T.border.subtle}`, boxShadow: `0 4px 16px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255,255,255,0.05)`,
                transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
            }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: `${T.accent.emerald}1A`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 12px ${T.accent.emerald}10` }}>
                <DollarSign size={14} color={T.accent.emerald} />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>Savings Accounts</h2>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <Badge variant="outline" style={{ fontSize: 10, color: savingsAccounts.length > 0 ? T.accent.emerald : T.text.muted, borderColor: savingsAccounts.length > 0 ? `${T.accent.emerald}40` : T.border.default }}>
                    {savingsAccounts.length}
                </Badge>
                <ChevronDown size={16} color={T.text.muted} className="chevron-animated" data-open={String(!collapsedSections.savingsAccounts)} />
            </div>
        </div>

        {!collapsedSections.savingsAccounts && (
            <>
                {groupedSavings.map(([bank, accts]) => {
                    const isCollapsed = collapsedBanks[`savings-${bank}`];
                    return <Card key={`s-${bank}`} animate variant="glass" className="hover-card" style={{ marginBottom: 12, padding: 0, overflow: "hidden", borderLeft: `4px solid ${T.accent.emerald}` }}>
                        <div onClick={() => setCollapsedBanks(p => ({ ...p, [`savings-${bank}`]: !isCollapsed }))} style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", background: `${T.accent.emerald}08` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{ padding: 5, borderRadius: 7, background: T.accent.emerald, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <DollarSign size={12} color={T.bg.card} />
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 800, color: T.accent.emerald, textTransform: "uppercase", letterSpacing: "0.05em" }}>{bank}</span>
                                <Badge variant="outline" style={{ fontSize: 10, color: T.accent.emerald, borderColor: `${T.accent.emerald}40` }}>{accts.length}</Badge>
                            </div>
                            <ChevronDown size={14} color={T.text.dim} className="chevron-animated" data-open={String(!isCollapsed)} />
                        </div>
                        <div className="collapse-section" data-collapsed={String(isCollapsed)}><div style={{ padding: 0 }}>
                            {accts.sort((a, b) => a.name.localeCompare(b.name)).map((acct, i) => (
                                <div key={acct.id} style={{ borderBottom: i === accts.length - 1 ? "none" : `1px solid ${T.border.subtle}` }}>
                                    <div style={{ padding: "10px 16px" }}>
                                        {editingBank === acct.id ?
                                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                                <input value={editBankForm.name} onChange={e => setEditBankForm(p => ({ ...p, name: e.target.value }))} placeholder="Account name" aria-label="Account name"
                                                    style={{ width: "100%", fontSize: 13, padding: "10px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, outline: "none", boxSizing: "border-box" }} />
                                                <div style={{ display: "flex", gap: 8 }}>
                                                    <div style={{ flex: 0.4, position: "relative" }}>
                                                        <input type="number" inputMode="decimal" step="0.01" value={editBankForm.apy} onChange={e => setEditBankForm(p => ({ ...p, apy: e.target.value }))} placeholder="APY" aria-label="APY percentage"
                                                            style={{ width: "100%", padding: "10px 24px 10px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontFamily: T.font.mono, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                                                        <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 12 }}>%</span>
                                                    </div>
                                                    <input value={editBankForm.notes} onChange={e => setEditBankForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes" aria-label="Account notes"
                                                        style={{ flex: 1, fontSize: 13, padding: "10px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, outline: "none", boxSizing: "border-box" }} />
                                                </div>
                                                <div style={{ display: "flex", gap: 8 }}>
                                                    <button onClick={() => saveEditBank(acct.id)} style={{ flex: 1, padding: 12, borderRadius: T.radius.sm, border: "none", background: `${T.accent.emerald}18`, color: T.accent.emerald, fontSize: 11, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Check size={14} />Save</button>
                                                    <button onClick={() => { if (window.confirm(`Delete "${acct.name}"?`)) removeBankAccount(acct.id); }} style={{ flex: 1, padding: 12, borderRadius: T.radius.sm, border: "none", background: T.status.redDim, color: T.status.red, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>Delete</button>
                                                    <button onClick={() => setEditingBank(null)} style={{ flex: 1, padding: 12, borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: "transparent", color: T.text.dim, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Cancel</button>
                                                </div>
                                            </div> :
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <span style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, display: "block" }}>{acct.name}</span>
                                                    {(acct.apy > 0 || acct._plaidAccountId || (acct.notes && !acct._plaidAccountId)) && <Mono size={10} color={T.text.dim} style={{ display: "block", marginTop: 3 }}>
                                                        {[acct.apy > 0 && `${acct.apy}% APY`,
                                                        acct._plaidAccountId && `⚡ Plaid`
                                                        ].filter(Boolean).join("  ·  ") || (acct.notes && !acct._plaidAccountId ? acct.notes : "")}
                                                    </Mono>}
                                                </div>
                                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                                    <Mono size={14} weight={900} color={acct._plaidBalance != null ? T.accent.emerald : T.text.muted}>{acct._plaidBalance != null ? fmt(acct._plaidBalance) : "\u2014"}</Mono>
                                                    <button onClick={() => startEditBank(acct)} style={{ width: 32, height: 32, borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.dim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Edit3 size={11} /></button>
                                                </div>
                                            </div>}
                                    </div>
                                </div>
                            ))}
                        </div></div>
                    </Card>;
                })}
            </>
        )}
    </div> : null;

    // ─── Investment Accounts Section (JSX) ─────────────────────────────────

    const investmentsSection = enabledInvestments.length > 0 ? <div style={{ marginTop: 16 }}>
        <div
            onClick={() => setCollapsedSections(p => ({ ...p, investments: !p.investments }))}
            style={{
                display: "flex", alignItems: "center", gap: 10, marginTop: 4, marginBottom: collapsedSections.investments ? 6 : 10,
                padding: "12px 16px", borderRadius: 20, cursor: "pointer", userSelect: "none",
                background: T.bg.glass, backdropFilter: "blur(30px)", WebkitBackdropFilter: "blur(30px)",
                border: `1px solid ${T.border.subtle}`, boxShadow: `0 2px 10px rgba(0,0,0,0.12)`,
                transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                position: "sticky", top: 10, zIndex: 10
            }}>
            <div style={{ width: 24, height: 24, borderRadius: 7, background: `${T.accent.emerald}1A`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <TrendingUp size={12} color={T.accent.emerald} />
            </div>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>Investments</h2>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                <button onClick={(e) => { e.stopPropagation(); handleRefreshPrices(); }} disabled={refreshingPrices} title="Refresh prices" className="hover-btn" style={{ background: "transparent", border: "none", color: refreshingPrices ? T.text.muted : T.accent.emerald, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 4, opacity: refreshingPrices ? 0.5 : 0.8, transition: "opacity 0.2s" }}>
                    <RefreshCw size={13} strokeWidth={2.5} className={refreshingPrices ? "spin" : ""} />
                </button>
                {investTotalValue > 0 && <Badge variant="outline" style={{ fontSize: 9, color: T.accent.emerald, borderColor: `${T.accent.emerald}40` }}>
                    {fmt(Math.round(investTotalValue))}
                </Badge>}
                {collapsedSections.investments ? <ChevronDown size={14} color={T.text.muted} /> : <ChevronUp size={14} color={T.text.muted} />}
            </div>
        </div>

        {!collapsedSections.investments && (
            <>
                {enabledInvestments.map(({ key, label, color }) => {
                    const items = holdings[key] || [];
                    const plaidItems = (financialConfig?.plaidInvestments || []).filter(pi => pi.bucket === key);

                    const manualValue = items.reduce((s, h) => s + ((investPrices[h.symbol]?.price || 0) * (h.shares || 0)), 0);
                    const plaidValue = plaidItems.reduce((s, pi) => s + (pi._plaidBalance || 0), 0);
                    const sectionValue = manualValue + plaidValue;

                    const percentOfTotal = investTotalValue > 0 ? (sectionValue / investTotalValue) * 100 : 0;
                    const totalCount = items.length + plaidItems.length;
                    const isCollapsed = collapsedInvest[key];
                    return <Card key={key} animate variant="glass" className="hover-lift" style={{ marginBottom: 6, padding: 0, overflow: "hidden", borderLeft: `3px solid ${color}`, position: "relative" }}>
                        <div onClick={() => setCollapsedInvest(p => ({ ...p, [key]: !isCollapsed }))} style={{ padding: "10px 12px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", cursor: "pointer", background: `linear-gradient(90deg, ${color}06, transparent)` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 11, fontWeight: 800, color, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
                                <Badge variant="outline" style={{ fontSize: 8, color, borderColor: `${color}40`, padding: "1px 5px" }}>{totalCount}</Badge>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                {sectionValue > 0 && <Mono size={12} weight={800} color={color}>{fmt(sectionValue)}</Mono>}
                                {isCollapsed ? <ChevronDown size={14} color={T.text.dim} className="chevron-animated" data-open="false" /> : <ChevronDown size={14} color={T.text.dim} className="chevron-animated" data-open="true" />}
                            </div>
                            {enabledInvestments.length > 1 && sectionValue > 0 && <div style={{ width: "100%", height: 2, background: `${T.border.default}`, borderRadius: 2, marginTop: 6, overflow: "hidden", display: "flex" }}>
                                <div style={{ width: `${percentOfTotal}%`, background: color, transition: "width 1s cubic-bezier(0.4, 0, 0.2, 1)" }} />
                            </div>}
                        </div>
                        <div className="collapse-section" data-collapsed={String(isCollapsed)}><div style={{ padding: "6px 12px" }}>
                            {totalCount === 0 ?
                                <p style={{ fontSize: 11, color: T.text.muted, textAlign: "center", padding: "6px 0" }}>No holdings yet.</p> :
                                <>
                                    {plaidItems.map((pi, i) => (
                                        <div key={pi.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${T.border.subtle}` }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <div style={{ padding: 4, borderRadius: 5, background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                    <TrendingUp size={10} color={color} />
                                                </div>
                                                <div style={{ display: "flex", flexDirection: "column" }}>
                                                    <span style={{ fontSize: 11, fontWeight: 700, color: T.text.primary }}>{pi.name}</span>
                                                    <span style={{ fontSize: 9, color: T.text.dim }}>{pi.institution}</span>
                                                </div>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                <Mono size={11} weight={800} color={color}>{fmt(pi._plaidBalance)}</Mono>
                                                <div style={{ width: 5, height: 5, borderRadius: "50%", background: T.status.green, boxShadow: `0 0 4px ${T.status.green}` }} title="Synced with Plaid" />
                                            </div>
                                        </div>
                                    ))}
                                    {items.sort((a, b) => (a.symbol || "").localeCompare(b.symbol || "")).map((h, i) => {
                                        const price = investPrices[h.symbol];
                                        return <div key={`${h.symbol}-${i}`} style={{ borderBottom: i === items.length - 1 ? "none" : `1px solid ${T.border.subtle}` }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 4px" }}>
                                                <div>
                                                    <span style={{ fontSize: 11, fontWeight: 700, color: T.text.primary }}>{h.symbol?.replace("-USD", "")}</span>
                                                    <span style={{ fontSize: 9, color: T.text.dim, marginLeft: 5 }}>{key === "crypto" ? `${h.shares} units` : `${h.shares} sh`}</span>
                                                </div>
                                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                    <div style={{ textAlign: "right" }}>
                                                        {price ? <>
                                                            <Mono size={11} weight={700} color={color}>{fmt(price.price * (h.shares || 0))}</Mono>
                                                            {price.changePct != null && <span style={{ fontSize: 8, fontFamily: T.font.mono, fontWeight: 700, marginLeft: 3, color: price.changePct >= 0 ? T.status.green : T.status.red }}>
                                                                {price.changePct >= 0 ? "+" : ""}{price.changePct.toFixed(1)}%
                                                            </span>}
                                                        </> : <Mono size={10} color={T.text.muted}>—</Mono>}
                                                    </div>
                                                    {setFinancialConfig && <button onClick={() => {
                                                        if (window.confirm(`Delete ${h.symbol}?`)) {
                                                            const cur = financialConfig?.holdings || {};
                                                            const updated = (cur[key] || []).filter((_, idx) => idx !== i);
                                                            setFinancialConfig({ ...financialConfig, holdings: { ...cur, [key]: updated } });
                                                        }
                                                    }} style={{ width: 24, height: 24, borderRadius: T.radius.md, border: "none", background: "transparent", color: T.text.dim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                        <Trash2 size={11} />
                                                    </button>}
                                                </div>
                                            </div>
                                        </div>;
                                    })}
                                </>}
                        </div></div>
                    </Card>;
                })}
            </>
        )}
    </div> : null;

    // ─── Transactions Section (JSX) ─────────────────────────────────────────

    const [plaidTxns, setPlaidTxns] = useState([]);
    useEffect(() => {
        getStoredTransactions().then(stored => {
            if (stored?.transactions) setPlaidTxns(stored.transactions.slice(0, 15));
        }).catch(() => { });
    }, []);

    const transactionsSection = plaidTxns.length > 0 ? <div style={{ marginTop: 16 }}>
        <div
            onClick={() => setCollapsedSections(p => ({ ...p, transactions: !p.transactions }))}
            style={{
                display: "flex", alignItems: "center", gap: 10, marginTop: 4, marginBottom: collapsedSections.transactions ? 6 : 10,
                padding: "12px 16px", borderRadius: 20, cursor: "pointer", userSelect: "none",
                background: T.bg.glass, backdropFilter: "blur(30px)", WebkitBackdropFilter: "blur(30px)",
                border: `1px solid ${T.border.subtle}`, boxShadow: `0 2px 10px rgba(0,0,0,0.12)`,
                transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
            }}>
            <div style={{ width: 24, height: 24, borderRadius: 7, background: `${T.status.blue}1A`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <DollarSign size={12} color={T.status.blue} />
            </div>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>Recent Transactions</h2>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                <Badge variant="outline" style={{ fontSize: 9, color: T.text.secondary, borderColor: T.border.default, padding: "1px 6px" }}>{plaidTxns.length}</Badge>
                {collapsedSections.transactions !== false ? <ChevronDown size={14} color={T.text.muted} /> : <ChevronUp size={14} color={T.text.muted} />}
            </div>
        </div>

        {collapsedSections.transactions === false && (
            <Card animate variant="glass" style={{ padding: 0, overflow: "hidden" }}>
                {plaidTxns.map((txn, i) => {
                    const isPositive = txn.amount < 0;
                    return <div key={i} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "8px 14px", borderBottom: i < plaidTxns.length - 1 ? `1px solid ${T.border.subtle}` : "none"
                    }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: T.text.primary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {txn.description || txn.name || "Unknown"}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                                <span style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono }}>{txn.date}</span>
                                {txn.category && <span style={{ fontSize: 8, color: T.text.dim, padding: "1px 5px", borderRadius: 4, background: `${T.border.default}40` }}>{txn.category}</span>}
                            </div>
                        </div>
                        <Mono size={11} weight={800} color={isPositive ? T.status.green : T.text.primary}>
                            {isPositive ? "+" : "-"}${Math.abs(txn.amount).toFixed(2)}
                        </Mono>
                    </div>;
                })}
            </Card>
        )}
    </div> : null;

    // ─── Non-Card Debts Section (JSX) ──────────────────────────────────────

    const debtsSection = nonCardDebts.length > 0 ? <div>
        {/* Premium Section Header: Debts */}
        <div
            onClick={() => setCollapsedSections(p => ({ ...p, debts: !p.debts }))}
            style={{
                display: "flex", alignItems: "center", gap: 12, marginTop: 8, marginBottom: collapsedSections.debts ? 8 : 16,
                padding: "16px 20px", borderRadius: 24, cursor: "pointer", userSelect: "none",
                background: T.bg.glass, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
                border: `1px solid ${T.border.subtle}`, boxShadow: `0 4px 16px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255,255,255,0.05)`,
                transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
            }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: `${T.status.amber}1A`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 12px ${T.status.amber}10` }}>
                <AlertTriangle size={14} color={T.status.amber} />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>Debts & Loans</h2>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <Badge variant="outline" style={{ fontSize: 10, color: totalDebtBalance > 0 ? T.status.amber : T.text.muted, borderColor: totalDebtBalance > 0 ? `${T.status.amber}40` : T.border.default }}>
                    {totalDebtBalance === 0 ? "0 Balance" : fmt(Math.round(totalDebtBalance))}
                </Badge>
                {collapsedSections.debts ? <ChevronDown size={16} color={T.text.muted} /> : <ChevronUp size={16} color={T.text.muted} />}
            </div>
        </div>

        {!collapsedSections.debts && (
            <>
                {nonCardDebts.length > 0 && <Card animate variant="glass" className="hover-card" style={{ padding: 0, overflow: "hidden", marginBottom: 12, borderLeft: `4px solid ${T.status.amber}` }}>
                    {nonCardDebts.sort((a, b) => (b.balance || 0) - (a.balance || 0)).map((debt, i) => (
                        <div key={debt.id || i} style={{ borderBottom: i === nonCardDebts.length - 1 ? "none" : `1px solid ${T.border.subtle}` }}>
                            <div style={{ padding: "12px 18px" }}>
                                {editingDebt === i ? (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <input value={editDebtForm.name} onChange={e => setEditDebtForm(p => ({ ...p, name: e.target.value }))} placeholder="Debt name" aria-label="Debt name"
                                                style={{ flex: 1, padding: "10px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                                            <select value={editDebtForm.type} onChange={e => setEditDebtForm(p => ({ ...p, type: e.target.value }))} aria-label="Debt type"
                                                style={{ padding: "10px 8px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12, outline: "none" }}>
                                                <option value="auto">Auto</option><option value="student">Student</option><option value="mortgage">Mortgage</option><option value="personal">Personal</option><option value="medical">Medical</option>
                                            </select>
                                        </div>
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <div style={{ flex: 1, position: "relative" }}>
                                                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 12, fontWeight: 600 }}>$</span>
                                                <input type="number" inputMode="decimal" value={editDebtForm.balance} onChange={e => setEditDebtForm(p => ({ ...p, balance: e.target.value }))} placeholder="Balance"
                                                    style={{ width: "100%", padding: "10px 10px 10px 22px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontFamily: T.font.mono, fontSize: 13, boxSizing: "border-box", outline: "none" }} />
                                            </div>
                                            <div style={{ flex: 0.7, position: "relative" }}>
                                                <input type="number" inputMode="decimal" value={editDebtForm.apr} onChange={e => setEditDebtForm(p => ({ ...p, apr: e.target.value }))} placeholder="APR"
                                                    style={{ width: "100%", padding: "10px 24px 10px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontFamily: T.font.mono, fontSize: 13, boxSizing: "border-box", outline: "none" }} />
                                                <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 12 }}>%</span>
                                            </div>
                                            <div style={{ flex: 1, position: "relative" }}>
                                                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 11, fontWeight: 600 }}>$</span>
                                                <input type="number" inputMode="decimal" value={editDebtForm.minPayment} onChange={e => setEditDebtForm(p => ({ ...p, minPayment: e.target.value }))} placeholder="Min Pmt"
                                                    style={{ width: "100%", padding: "10px 10px 10px 22px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontFamily: T.font.mono, fontSize: 13, boxSizing: "border-box", outline: "none" }} />
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <button onClick={() => saveEditDebt(i)} style={{ flex: 1, padding: 12, borderRadius: T.radius.sm, border: "none", background: `${T.status.amber}18`, color: T.status.amber, fontSize: 11, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Check size={14} />Save</button>
                                            <button onClick={() => { if (window.confirm(`Delete "${editDebtForm.name}"?`)) removeDebt(i); }} style={{ flex: 1, padding: 12, borderRadius: T.radius.sm, border: "none", background: T.status.redDim, color: T.status.red, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>Delete</button>
                                            <button onClick={() => setEditingDebt(null)} style={{ flex: 1, padding: 12, borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: "transparent", color: T.text.dim, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Cancel</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: T.text.primary }}>{debt.name || "Unnamed Debt"}</span>
                                            <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                                                {debt.type && <Badge variant="outline" style={{ fontSize: 8, padding: "1px 5px", color: T.status.amber, borderColor: `${T.status.amber}40` }}>{debt.type.toUpperCase()}</Badge>}
                                                {debt.apr > 0 && <Badge variant="outline" style={{ fontSize: 8, padding: "1px 5px", color: T.text.secondary }}>{debt.apr}% APR</Badge>}
                                                {debt.minPayment > 0 && <Badge variant="outline" style={{ fontSize: 8, padding: "1px 5px", color: T.text.dim }}>Min {fmt(debt.minPayment)}</Badge>}
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                            <Mono size={13} weight={700} color={T.status.amber}>{fmt(debt.balance)}</Mono>
                                            <button onClick={() => startEditDebt(debt, i)} style={{ width: 36, height: 36, borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.dim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Edit3 size={11} /></button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </Card>}

                <button onClick={() => openSheet('debt')} className="hover-btn" style={{
                    width: "100%", padding: "12px", borderRadius: T.radius.lg, marginTop: 12,
                    border: `1px dashed ${T.status.amber}60`,
                    background: `${T.status.amber}05`, color: T.status.amber,
                    fontSize: 12, fontWeight: 800, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                }}><Plus size={14} /> Add Debt</button>
            </>
        )}
    </div> : null;

    // ═══ SAVINGS GOALS SECTION ═══
    const savingsGoalsSection = savingsGoals.length > 0 ? <div>
        <div onClick={() => setCollapsedSections(s => ({ ...s, savingsGoals: !s.savingsGoals }))} className="hover-lift" style={{
            display: "flex", alignItems: "center", gap: 12, marginTop: 8, marginBottom: collapsedSections.savingsGoals ? 8 : 16,
            padding: "16px 20px", borderRadius: 24, cursor: "pointer", userSelect: "none",
            background: T.bg.glass, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
            border: `1px solid ${T.border.subtle}`, boxShadow: `0 4px 16px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255,255,255,0.05)`,
            transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
        }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(135deg, ${T.accent.primary}20, ${T.accent.emerald}10)`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 12px ${T.accent.primary}15`, border: `1px solid ${T.accent.primary}30` }}>
                <Target size={16} color={T.accent.primary} />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>Savings Goals</h2>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <Badge variant="outline" style={{ fontSize: 10, color: T.accent.primary, borderColor: `${T.accent.primary}40` }}>
                    {savingsGoals.length} goal{savingsGoals.length !== 1 ? "s" : ""}
                </Badge>
                <ChevronDown size={16} color={T.text.muted} className="chevron-animated" data-open={String(!collapsedSections.savingsGoals)} />
            </div>
        </div>

        {!collapsedSections.savingsGoals && (
            <>
                {savingsGoals.length > 0 && <Card animate style={{ padding: 0, overflow: "hidden" }}>
                    {savingsGoals.map((goal, i) => {
                        const pct = goal.targetAmount > 0 ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100)) : 0;
                        const color = pct >= 100 ? T.status.green : pct >= 50 ? T.accent.primary : T.status.amber;
                        return <div key={i} style={{ borderBottom: i < savingsGoals.length - 1 ? `1px solid ${T.border.subtle}` : "none" }}>
                            <div style={{ padding: "14px 16px" }}>
                                {editingGoals ? (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                            <input value={goal.name || ""} onChange={e => updateGoal(i, "name", e.target.value)}
                                                placeholder="Goal name" style={{ flex: 1, padding: "8px 10px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12 }} />
                                        </div>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                                            <div style={{ position: "relative" }}>
                                                <span style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 10, fontWeight: 600 }}>$</span>
                                                <input type="number" inputMode="decimal" value={goal.targetAmount || ""} onChange={e => updateGoal(i, "targetAmount", parseFloat(e.target.value) || 0)}
                                                    placeholder="Target" style={{ width: "100%", padding: "6px 6px 6px 16px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontSize: 10 }} />
                                            </div>
                                            <div style={{ position: "relative" }}>
                                                <span style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 10, fontWeight: 600 }}>$</span>
                                                <input type="number" inputMode="decimal" value={goal.currentAmount || ""} onChange={e => updateGoal(i, "currentAmount", parseFloat(e.target.value) || 0)}
                                                    placeholder="Current" style={{ width: "100%", padding: "6px 6px 6px 16px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontSize: 10 }} />
                                            </div>
                                            <input type="date" value={goal.targetDate || ""} onChange={e => updateGoal(i, "targetDate", e.target.value)}
                                                style={{ width: "100%", padding: "6px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontSize: 10 }} />
                                        </div>
                                        <div style={{ fontSize: 8, color: T.text.muted, display: "flex", gap: 16 }}>
                                            <span>Target $</span><span>Current $</span><span>Target Date</span>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: T.text.primary }}>{goal.name || "Unnamed"}</span>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <Mono size={11} weight={700} color={color}>${(goal.currentAmount || 0).toLocaleString()} / ${(goal.targetAmount || 0).toLocaleString()}</Mono>
                                                {editingGoals && <button onClick={() => { if (window.confirm(`Delete "${goal.name}"?`)) removeGoal(i); }} style={{ width: 28, height: 28, borderRadius: T.radius.md, border: "none", background: "transparent", color: T.status.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", marginLeft: 4 }}><Trash2 size={13} /></button>}
                                            </div>
                                        </div>
                                        {goal.targetAmount > 0 && <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                            <div style={{ flex: 1, height: 6, borderRadius: 3, background: T.bg.surface, overflow: "hidden", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.15)" }}>
                                                <div style={{ height: "100%", borderRadius: 3, background: pct === 100 ? T.status.green : `linear-gradient(90deg, ${color}, ${T.accent.primary})`, width: `${pct}%`, transition: "width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)" }} />
                                            </div>
                                            <Mono size={10} weight={700} color={color}>{pct}%</Mono>
                                        </div>}
                                        {goal.targetDate && <span style={{ fontSize: 9, color: T.text.muted, fontFamily: T.font.mono, marginTop: 4, display: "block" }}>Target: {goal.targetDate}</span>}
                                    </>
                                )}
                            </div>
                        </div>;
                    })}
                </Card>}

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button onClick={() => setEditingGoals(!editingGoals)} className="hover-lift" style={{
                        flex: 1, padding: "10px", borderRadius: T.radius.lg,
                        border: `1px solid ${editingGoals ? T.accent.primary : T.border.default}`,
                        background: editingGoals ? `${T.accent.primary}1A` : T.bg.surface,
                        color: editingGoals ? T.accent.primary : T.text.secondary,
                        fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font.sans
                    }}>{editingGoals ? "✓ Done" : "✏️ Edit"}</button>
                    <button onClick={() => openSheet('goal')} className="hover-lift" style={{
                        flex: 1, padding: "10px", borderRadius: T.radius.lg,
                        border: `1px dashed ${T.accent.primary}60`,
                        background: `${T.accent.primary}05`, color: T.accent.primary,
                        fontSize: 12, fontWeight: 800, cursor: "pointer"
                    }}>+ New Goal</button>
                </div>
            </>
        )}
    </div> : null;

    // ═══ OTHER ASSETS SECTION ═══
    const otherAssetsSection = otherAssets.length > 0 ? <div>
        <div onClick={() => setCollapsedSections(s => ({ ...s, otherAssets: !s.otherAssets }))} className="hover-lift" style={{
            display: "flex", alignItems: "center", gap: 12, marginTop: 8, marginBottom: collapsedSections.otherAssets ? 8 : 16,
            padding: "16px 20px", borderRadius: 24, cursor: "pointer", userSelect: "none",
            background: T.bg.glass, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
            border: `1px solid ${T.border.subtle}`, boxShadow: `0 4px 16px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255,255,255,0.05)`,
            transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
        }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(135deg, ${T.accent.copper}20, #FFE5B410)`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 12px ${T.accent.copper}15`, border: `1px solid ${T.accent.copper}30` }}>
                <Wallet size={16} color={T.accent.copper} />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>Other Assets</h2>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <Badge variant="outline" style={{ fontSize: 10, color: T.accent.copper, borderColor: `${T.accent.copper}40` }}>
                    {totalOtherAssets > 0 ? fmt(totalOtherAssets) : "None"}
                </Badge>
                {collapsedSections.otherAssets ? <ChevronDown size={16} color={T.text.muted} /> : <ChevronUp size={16} color={T.text.muted} />}
            </div>
        </div>

        {!collapsedSections.otherAssets && (
            <>
                {otherAssets.length > 0 && <Card animate style={{ padding: 0, overflow: "hidden" }}>
                    {otherAssets.map((asset, i) => (
                        <div key={i} style={{ borderBottom: i < otherAssets.length - 1 ? `1px solid ${T.border.subtle}` : "none" }}>
                            <div style={{ padding: "14px 16px" }}>
                                {editingAssets ? (
                                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                        <input value={asset.name || ""} onChange={e => updateAsset(i, "name", e.target.value)}
                                            placeholder="e.g. Vehicle, Property" style={{ flex: 1, padding: "8px 10px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12 }} />
                                        <div style={{ position: "relative", width: 100, flexShrink: 0 }}>
                                            <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 11, fontWeight: 600 }}>$</span>
                                            <input type="number" inputMode="decimal" value={asset.value || ""} onChange={e => updateAsset(i, "value", parseFloat(e.target.value) || 0)}
                                                placeholder="Value" style={{ width: "100%", padding: "8px 8px 8px 20px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 11 }} />
                                        </div>
                                        <button onClick={() => updateAsset(i, "liquid", !asset.liquid)} title={asset.liquid ? "Liquid" : "Illiquid"} style={{
                                            width: 32, height: 32, borderRadius: T.radius.sm, border: `1px solid ${asset.liquid ? T.accent.emerald : T.border.default}`,
                                            background: asset.liquid ? `${T.accent.emerald}15` : T.bg.elevated,
                                            color: asset.liquid ? T.accent.emerald : T.text.muted, cursor: "pointer",
                                            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0
                                        }}>{asset.liquid ? "💧" : "🔒"}</button>
                                    </div>
                                ) : (
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: T.text.primary }}>{asset.name || "Unnamed"}</span>
                                            <Badge variant="outline" style={{ fontSize: 8, padding: "1px 5px", color: asset.liquid ? T.accent.emerald : T.text.dim, borderColor: asset.liquid ? `${T.accent.emerald}40` : T.border.default }}>
                                                {asset.liquid ? "LIQUID" : "ILLIQUID"}
                                            </Badge>
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <Mono size={13} weight={700} color={T.accent.copper}>{fmt(asset.value || 0)}</Mono>
                                            {editingAssets && <button onClick={() => { if (window.confirm(`Delete "${asset.name}"?`)) removeAsset(i); }} style={{ width: 28, height: 28, borderRadius: T.radius.md, border: "none", background: "transparent", color: T.status.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", marginLeft: 4 }}><Trash2 size={13} /></button>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </Card>}

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button onClick={() => setEditingAssets(!editingAssets)} className="hover-lift" style={{
                        flex: 1, padding: "10px", borderRadius: T.radius.lg,
                        border: `1px solid ${editingAssets ? T.accent.copper : T.border.default}`,
                        background: editingAssets ? `${T.accent.copper}1A` : T.bg.surface,
                        color: editingAssets ? T.accent.copper : T.text.secondary,
                        fontSize: 12, fontWeight: 700, cursor: "pointer"
                    }}>{editingAssets ? "✓ Done" : "✏️ Edit"}</button>
                    <button onClick={() => openSheet('asset')} className="hover-lift" style={{
                        flex: 1, padding: "10px", borderRadius: T.radius.lg,
                        border: `1px dashed ${T.accent.copper}60`,
                        background: `${T.accent.copper}05`, color: T.accent.copper,
                        fontSize: 12, fontWeight: 800, cursor: "pointer"
                    }}>+ New Asset</button>
                </div>
            </>
        )}
    </div > : null;

    return <div className="page-body" style={{ paddingBottom: 0, display: "flex", flexDirection: "column", gap: 0 }}>
        <style>{`
            @keyframes spin { 100% { transform: rotate(360deg); } }
            .spin { animation: spin 1s linear infinite; }
            @keyframes pulseRing {
                0% { opacity: 0.1; transform: translateX(-50%) scale(1); }
                100% { opacity: 0.25; transform: translateX(-50%) scale(1.1); }
            }
            @keyframes sheetSlideUp {
                from { transform: translateY(100%); opacity: 0; }
                to   { transform: translateY(0);    opacity: 1; }
            }
            @keyframes sheetFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes shimmerSlide {
                0%   { background-position: -200% center; }
                100% { background-position: 200% center; }
            }
            .hover-lift { transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) !important; cursor: pointer; }
            .hover-lift:hover { transform: translateY(-3px) scale(1.01); box-shadow: 0 12px 32px rgba(0,0,0,0.3) !important; z-index: 5; }
        `}</style>
        {headerSection}
        {bankSection}
        {savingsSection}
        {creditCardsSection}
        {investmentsSection}
        {transactionsSection}
        {savingsGoalsSection}
        {otherAssetsSection}
        {debtsSection}

        {/* ═══ UNIFIED ADD BOTTOM SHEET ═══ */}
        <AddAccountSheet
            show={showAddSheet}
            step={addSheetStep}
            onClose={closeSheet}
            onSetStep={setAddSheetStep}
            onAddCard={(data) => {
                haptic.success();
                setCards([...cards, {
                    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `card_${Date.now()}`,
                    ...data, annualFeeDue: "", annualFeeWaived: false, notes: "", apr: null,
                    hasPromoApr: false, promoAprAmount: null, promoAprExp: "",
                    statementCloseDay: null, paymentDueDay: null, minPayment: null
                }]);
                setCollapsedSections(p => ({ ...p, creditCards: false }));
            }}
            onAddBank={(data) => {
                haptic.success();
                setBankAccounts([...bankAccounts, {
                    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `bank_${Date.now()}`,
                    ...data
                }]);
                setCollapsedSections(p => ({ ...p, bankAccounts: false }));
            }}
            onAddInvestment={(key, symbol, shares) => {
                const cur = financialConfig?.holdings || {};
                setFinancialConfig({ ...financialConfig, holdings: { ...cur, [key]: [...(cur[key] || []), { symbol, shares }] } });
                setCollapsedSections(p => ({ ...p, investments: false }));
            }}
            onAddGoal={(goal) => {
                setFinancialConfig({ ...financialConfig, savingsGoals: [...(financialConfig?.savingsGoals || []), goal] });
                setCollapsedSections(p => ({ ...p, savingsGoals: false }));
            }}
            onAddDebt={(debt) => {
                setFinancialConfig({ ...financialConfig, nonCardDebts: [...(financialConfig?.nonCardDebts || []), { id: "debt_" + Date.now(), ...debt }] });
                setCollapsedSections(p => ({ ...p, debts: false }));
            }}
            onAddAsset={(asset) => {
                setFinancialConfig({ ...financialConfig, otherAssets: [...(financialConfig?.otherAssets || []), asset] });
                setCollapsedSections(p => ({ ...p, otherAssets: false }));
            }}
            onPlaidConnect={(e) => { haptic.medium(); handlePlaidConnect(e); }}
            plaidLoading={plaidLoading}
            plaidResult={plaidResult}
            plaidError={plaidError}
            cardCatalog={cardCatalog}
        />
    </div>;
})
