import { useState, useMemo, useEffect, useCallback, memo } from "react";
import { Plus, X, ChevronDown, ChevronUp, CreditCard, Edit3, Check, DollarSign, Building2, Landmark, TrendingUp, AlertTriangle, RefreshCw, Target, Wallet, ArrowLeft, Link2, CheckCircle2 } from "lucide-react";
import { T, ISSUER_COLORS } from "../constants.js";
import { getIssuerCards, getPinnedForIssuer } from "../issuerCards.js";
import { getBankNames, getBankProducts } from "../bankCatalog.js";
import { getCardLabel } from "../cards.js";
import { fmt } from "../utils.js";
import { Card, Label, Badge } from "../ui.jsx";
import { Mono, EmptyState } from "../components.jsx";
import SearchableSelect from "../SearchableSelect.jsx";
import { fetchMarketPrices, getTickerOptions } from "../marketData.js";
import { connectBank, autoMatchAccounts, fetchBalances, fetchAllBalances, applyBalanceSync, saveConnectionLinks } from "../plaid.js";

const ENABLE_PLAID = true;

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

export default memo(function CardPortfolioTab() {
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
    const [editForm, setEditForm] = useState({});
    const [activeAddForm, setActiveAddForm] = useState(null); // kept for legacy compat
    const [showAddSheet, setShowAddSheet] = useState(false);
    const [addSheetStep, setAddSheetStep] = useState(null);
    const [plaidLoading, setPlaidLoading] = useState(false);
    const [plaidResult, setPlaidResult] = useState(null);
    const [plaidError, setPlaidError] = useState(null);
    const openSheet = (step = null) => { setShowAddSheet(true); setAddSheetStep(step); setPlaidResult(null); setPlaidError(null); };
    const closeSheet = () => { setShowAddSheet(false); setAddSheetStep(null); setPlaidResult(null); setPlaidError(null); };
    const handlePlaidConnect = async () => {
        setPlaidLoading(true); setPlaidResult(null); setPlaidError(null);
        try {
            await connectBank(
                async (connection) => {
                    // Auto-match Plaid accounts to existing cards/bank accounts
                    const { newCards, newBankAccounts } = autoMatchAccounts(connection, cards, bankAccounts, cardCatalog);
                    await saveConnectionLinks(connection);

                    // Build deterministic local snapshot so we do not drop new Plaid records.
                    const allCards = mergeUniqueById(cards, newCards);
                    const allBanks = mergeUniqueById(bankAccounts, newBankAccounts);
                    setCards(allCards);
                    setBankAccounts(allBanks);

                    // Fetch live balances and apply them
                    try {
                        const refreshed = await fetchBalances(connection.id);
                        if (refreshed) {
                            const { updatedCards, updatedBankAccounts } = applyBalanceSync(refreshed, allCards, allBanks);
                            setCards(updatedCards);
                            setBankAccounts(updatedBankAccounts);
                            await saveConnectionLinks(refreshed);
                        }
                    } catch { /* balance fetch is best-effort */ }

                    setPlaidResult('success');
                    setCollapsedSections(p => ({ ...p, creditCards: false, bankAccounts: false }));
                    setTimeout(closeSheet, 2200);
                },
                (err) => { if (err?.message !== 'cancelled') { setPlaidResult('error'); setPlaidError(err?.message || 'Connection failed'); } }
            );
        } finally { setPlaidLoading(false); }
    };

    const [plaidRefreshing, setPlaidRefreshing] = useState(false);
    const handleRefreshPlaid = async () => {
        setPlaidRefreshing(true);
        try {
            const results = await fetchAllBalances();
            let allCards = [...cards];
            let allBanks = [...bankAccounts];
            for (const res of results) {
                if (!res._error) {
                    const syncData = applyBalanceSync(res, allCards, allBanks);
                    allCards = syncData.updatedCards;
                    allBanks = syncData.updatedBankAccounts;
                    await saveConnectionLinks(res);
                }
            }
            setCards(allCards);
            setBankAccounts(allBanks);
        } catch (e) { console.error(e); }
        finally { setPlaidRefreshing(false); }
    };
    const [addBankForm, setAddBankForm] = useState({ bank: "", accountType: "checking", productName: "", customName: "", apy: "", notes: "" });
    const [editingBank, setEditingBank] = useState(null);
    const [addForm, setAddForm] = useState({ institution: "", cardChoice: "", customName: "", nickname: "", limit: "", annualFee: "", annualFeeDue: "", annualFeeWaived: false, notes: "", apr: "", hasPromoApr: false, promoAprAmount: "", promoAprExp: "", statementCloseDay: "", paymentDueDay: "", minPayment: "" });
    const [editBankForm, setEditBankForm] = useState({});

    // Holdings management state
    const [newHoldingSymbol, setNewHoldingSymbol] = useState({});
    const [newHoldingShares, setNewHoldingShares] = useState({});
    const [collapsedBanks, setCollapsedBanks] = useState({});

    // Master collapsible sections (all collapsed by default for a clean, compact view)
    const [collapsedSections, setCollapsedSections] = useState({
        creditCards: true,
        bankAccounts: true,
        investments: true,
        savingsGoals: true,
        otherAssets: true,
        debts: true
    });

    // Bank form helpers (hoisted for Action Bar form)
    const bankProducts = useMemo(() => getBankProducts(addBankForm.bank), [addBankForm.bank]);
    const bankProductList = addBankForm.accountType === "checking" ? bankProducts.checking : bankProducts.savings;
    const addBankAccount = () => {
        const finalName = addBankForm.productName === "__other__" ? addBankForm.customName : addBankForm.productName;
        if (!finalName || !finalName.trim()) return;
        setBankAccounts([...bankAccounts, {
            id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `bank_${Date.now()}`,
            bank: addBankForm.bank, accountType: addBankForm.accountType,
            name: finalName.trim(),
            apy: addBankForm.apy === "" ? null : parseFloat(addBankForm.apy) || null,
            notes: addBankForm.notes,
        }]);
        setAddBankForm({ bank: "", accountType: "checking", productName: "", customName: "", apy: "", notes: "" });
        setActiveAddForm(null);
        setCollapsedSections(p => ({ ...p, bankAccounts: false }));
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
        const label = card ? (card.nickname || card.name) : "this card";
        if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
        setCards(cards.filter(c => c.id !== cardId));
    };

    const addCard = () => {
        const finalName = (addForm.cardChoice === "__other__" ? addForm.customName : addForm.cardChoice);
        if (!finalName || !finalName.trim()) return;
        setCards([...cards, {
            id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `card_${Date.now()}`,
            name: finalName.trim(), institution: addForm.institution,
            nickname: addForm.nickname || "",
            limit: addForm.limit === "" ? null : parseFloat(addForm.limit) || null,
            annualFee: addForm.annualFee === "" ? null : parseFloat(addForm.annualFee) || null,
            annualFeeDue: addForm.annualFeeDue, annualFeeWaived: addForm.annualFeeWaived,
            notes: addForm.notes, apr: addForm.apr === "" ? null : parseFloat(addForm.apr) || null,
            hasPromoApr: addForm.hasPromoApr, promoAprAmount: addForm.promoAprAmount === "" ? null : parseFloat(addForm.promoAprAmount) || null,
            promoAprExp: addForm.promoAprExp,
            statementCloseDay: addForm.statementCloseDay === "" ? null : parseInt(addForm.statementCloseDay) || null,
            paymentDueDay: addForm.paymentDueDay === "" ? null : parseInt(addForm.paymentDueDay) || null,
            minPayment: addForm.minPayment === "" ? null : parseFloat(addForm.minPayment) || null
        }]);
        setAddForm({ institution: "", cardChoice: "", customName: "", nickname: "", limit: "", annualFee: "", annualFeeDue: "", annualFeeWaived: false, notes: "", apr: "", hasPromoApr: false, promoAprAmount: "", promoAprExp: "", statementCloseDay: "", paymentDueDay: "", minPayment: "" });
        setActiveAddForm(null);
        setCollapsedSections(p => ({ ...p, creditCards: false }));
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
        { key: "crypto", label: "Crypto", enabled: true, color: T.status.amber },
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
        return total;
    }, [holdings, investPrices]);

    const nonCardDebts = financialConfig?.nonCardDebts || [];
    const totalDebtBalance = useMemo(() => nonCardDebts.reduce((s, d) => s + (d.balance || 0), 0), [nonCardDebts]);
    const [collapsedDebts, setCollapsedDebts] = useState(false);

    // ── SAVINGS GOALS ──
    const savingsGoals = financialConfig?.savingsGoals || [];
    const [editingGoals, setEditingGoals] = useState(false);
    const addGoal = () => setFinancialConfig({ ...financialConfig, savingsGoals: [...savingsGoals, { name: "", targetAmount: 0, currentAmount: 0, targetDate: "" }] });
    const updateGoal = (i, k, v) => { const arr = [...savingsGoals]; arr[i] = { ...arr[i], [k]: v }; setFinancialConfig({ ...financialConfig, savingsGoals: arr }); };
    const removeGoal = (i) => { if (!window.confirm(`Delete "${savingsGoals[i]?.name || 'this goal'}"?`)) return; setFinancialConfig({ ...financialConfig, savingsGoals: savingsGoals.filter((_, j) => j !== i) }); };

    // ── OTHER ASSETS ──
    const otherAssets = financialConfig?.otherAssets || [];
    const totalOtherAssets = otherAssets.reduce((s, a) => s + (a.value || 0), 0);
    const [editingAssets, setEditingAssets] = useState(false);
    const addAsset = () => setFinancialConfig({ ...financialConfig, otherAssets: [...otherAssets, { name: "", value: 0, liquid: false }] });
    const updateAsset = (i, k, v) => { const arr = [...otherAssets]; arr[i] = { ...arr[i], [k]: v }; setFinancialConfig({ ...financialConfig, otherAssets: arr }); };
    const removeAsset = (i) => { if (!window.confirm(`Delete "${otherAssets[i]?.name || 'this asset'}"?`)) return; setFinancialConfig({ ...financialConfig, otherAssets: otherAssets.filter((_, j) => j !== i) }); };

    const totalCash = useMemo(() => bankAccounts.reduce((s, b) => s + (b._plaidBalance != null ? b._plaidBalance : 0), 0) + savingsGoals.reduce((s, g) => s + (g.currentAmount || 0), 0), [bankAccounts, savingsGoals]);
    const netWorth = totalCash + (investTotalValue || 0) + totalOtherAssets - totalDebtBalance;

    const headerSection = <>
        <div style={{ paddingTop: 24, paddingBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
                <h1 style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.02em" }}>Wealth Overview</h1>
                <p style={{ fontSize: 13, color: T.text.dim, marginTop: 4, fontFamily: T.font.mono }}>{totalAccounts} connected entries</p>
            </div>
            {ENABLE_PLAID && (cards.some(c => c._plaidAccountId) || bankAccounts.some(b => b._plaidAccountId)) && (<button onClick={handleRefreshPlaid} disabled={plaidRefreshing} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 20,
                border: `1px solid ${T.status.blue}30`, background: `${T.status.blue}10`,
                color: T.status.blue, fontSize: 12, fontWeight: 700, cursor: plaidRefreshing ? "wait" : "pointer",
                transition: "all .2s"
            }}>
                <RefreshCw size={12} className={plaidRefreshing ? "spin" : ""} />
                {plaidRefreshing ? "Syncing..." : "Sync latest"}
            </button>
            )}
        </div>

        {/* Ultra-Premium Wealth Dashboard */}
        <Card animate style={{
            position: "relative",
            padding: 0,
            overflow: "hidden",
            background: `linear-gradient(145deg, ${T.bg.card}, ${T.bg.card} 40%, ${T.status.blue}0A)`,
            borderColor: `${T.status.blue}1A`,
            boxShadow: `${T.shadow.elevated}, 0 12px 32px ${T.status.blue}0F`
        }}>
            {/* Ambient Glow */}
            <div style={{ position: "absolute", top: -50, right: -50, width: 150, height: 150, background: T.status.blue, filter: "blur(80px)", opacity: 0.15, borderRadius: "50%", pointerEvents: "none" }} />

            <div style={{ padding: "28px 24px" }}>
                <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.15em", color: T.text.dim, marginBottom: 8, fontFamily: T.font.mono, fontWeight: 700 }}>Net Worth</p>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <Mono size={38} weight={900} color={T.status.blue}>{fmt(netWorth)}</Mono>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: `1px solid ${T.border.subtle}` }}>
                <div style={{ padding: "16px 24px", borderRight: `1px solid ${T.border.subtle}` }}>
                    <p style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono, marginBottom: 4 }}>TOTAL LIMIT</p>
                    <Mono size={16} weight={700} color={T.accent.primary}>{fmt(totalLimit)}</Mono>
                </div>
                <div style={{ padding: "16px 24px" }}>
                    <p style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono, marginBottom: 4 }}>INVESTMENTS</p>
                    <Mono size={16} weight={700} color={T.accent.emerald}>{fmt(investTotalValue || 0)}</Mono>
                </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: `1px solid ${T.border.subtle}` }}>
                <div style={{ padding: "16px 24px", borderRight: `1px solid ${T.border.subtle}` }}>
                    <p style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono, marginBottom: 4 }}>ANNUAL FEES</p>
                    <Mono size={16} weight={700} color={totalAF > 0 ? T.status.amber : T.text.primary}>{fmt(totalAF)}</Mono>
                </div>
                <div style={{ padding: "16px 24px" }}>
                    <p style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono, marginBottom: 4 }}>DEBTS</p>
                    <Mono size={16} weight={700} color={T.status.red}>{fmt(totalDebtBalance || 0)}</Mono>
                </div>
            </div>
        </Card>

        {/* Unified floating buttons — Add Account + optional Plaid */}
        <div style={{ display: "flex", gap: 12, marginTop: 16, marginBottom: 8 }}>
            <button onClick={() => openSheet()} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 48, borderRadius: 24,
                border: "1px solid transparent", boxSizing: "border-box",
                background: T.accent.gradient, color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer",
                boxShadow: `0 6px 20px ${T.accent.primary}40`, letterSpacing: "0.03em"
            }}><Plus size={16} />Add Account</button>
            {ENABLE_PLAID && <button onClick={handlePlaidConnect} disabled={plaidLoading} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 48, borderRadius: 24,
                border: "1px solid rgba(255,255,255,0.1)", boxSizing: "border-box", background: "#000000",
                color: "#FFFFFF", fontSize: 13, fontWeight: 800, cursor: plaidLoading ? "wait" : "pointer",
                boxShadow: "0 4px 14px rgba(0,0,0,0.5)", letterSpacing: "0.03em",
                opacity: plaidLoading ? 0.6 : 1, transition: "all .3s cubic-bezier(0.16, 1, 0.3, 1)"
            }}><Link2 size={15} />{plaidLoading ? "Connecting…" : "Connect with Plaid"}</button>}
        </div>

        {/* Info */}
        <Card animate delay={50} style={{ padding: "12px 16px", borderLeft: `3px solid ${T.status.green}30` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Check size={12} color={T.status.green} />
                <span style={{ fontSize: 11, fontWeight: 600, color: T.text.secondary }}>Changes here update your audit snapshot & renewals</span>
            </div>
        </Card>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24, marginBottom: 4, padding: "0 4px" }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>Categories</span>
            <button onClick={() => {
                const allCol = Object.values(collapsedSections).every(Boolean);
                setCollapsedSections({ creditCards: !allCol, bankAccounts: !allCol, investments: !allCol, debts: !allCol, savingsGoals: !allCol, otherAssets: !allCol });
            }} style={{ border: "none", background: "transparent", color: T.accent.primary, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                {Object.values(collapsedSections).every(Boolean) ? "Expand All" : "Collapse All"}
            </button>
        </div>
    </>;

    const creditCardsSection = <div>
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
                {collapsedSections.creditCards ? <ChevronDown size={16} color={T.text.muted} /> : <ChevronUp size={16} color={T.text.muted} />}
            </div>
        </div>

        {!collapsedSections.creditCards && (grouped.length === 0 ?
            <Card style={{ padding: "16px", textAlign: "center" }}><p style={{ fontSize: 11, color: T.text.muted }}>No credit cards yet — tap Add Account to get started.</p></Card> :
            grouped.map(([inst, cardsInCategory]) => {
                const colors = ic(inst);
                const isCollapsed = collapsedIssuers[inst];
                return <Card key={inst} animate variant="glass" style={{ marginBottom: 16, padding: 0, overflow: "hidden", borderLeft: `4px solid ${colors.text}` }}>
                    <div onClick={() => setCollapsedIssuers(p => ({ ...p, [inst]: !isCollapsed }))} style={{ padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", background: `${colors.text}08` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ padding: 6, borderRadius: 8, background: colors.text, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <CreditCard size={14} color={T.bg.card} />
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 800, color: colors.text, textTransform: "uppercase", letterSpacing: "0.05em" }}>{inst}</span>
                            <Badge variant="outline" style={{ fontSize: 11, color: colors.text, borderColor: `${colors.text}40` }}>{cardsInCategory.length}</Badge>
                        </div>
                        {isCollapsed ? <ChevronDown size={14} color={T.text.dim} /> : <ChevronUp size={14} color={T.text.dim} />}
                    </div>
                    {!isCollapsed && <div style={{ padding: "16px 18px" }}>
                        {cardsInCategory.map((card, i) => (
                            <div key={card.id} style={{ borderBottom: i === cardsInCategory.length - 1 ? "none" : `1px solid ${T.border.subtle}`, padding: "14px 0" }}>
                                {editingCard === card.id ?
                                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                        {/* Institution & Card Name dropdowns for product changes */}
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
                                                    placeholder="Limit" style={{ paddingLeft: 28, fontFamily: T.font.mono, fontWeight: 600 }} />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <input value={editForm.nickname} onChange={e => setEditForm(p => ({ ...p, nickname: e.target.value }))}
                                                    placeholder="Nickname (e.g. 'Daily Driver')" style={{ width: "100%", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <div style={{ flex: 0.5, position: "relative" }}>
                                                <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontFamily: T.font.mono, fontSize: 13, fontWeight: 600 }}>$</span>
                                                <input type="number" inputMode="decimal" pattern="[0-9]*" value={editForm.annualFee} onChange={e => setEditForm(p => ({ ...p, annualFee: e.target.value }))}
                                                    placeholder="Annual Fee" style={{ paddingLeft: 28, fontFamily: T.font.mono, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                                            </div>
                                            <div style={{ flex: 0.5, position: "relative" }}>
                                                <span style={{ position: "absolute", left: 10, top: "8px", color: T.text.dim, fontSize: 11, fontWeight: 700, pointerEvents: "none" }}>AF DUE</span>
                                                <input type="date" value={editForm.annualFeeDue} onChange={e => setEditForm(p => ({ ...p, annualFeeDue: e.target.value }))}
                                                    style={{ width: "100%", padding: "20px 10px 6px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, outline: "none", boxSizing: "border-box", height: "100%" }} />
                                            </div>
                                        </div>
                                        <div style={{ marginTop: -4, paddingLeft: 4 }}>
                                            <WaivedCheckbox checked={editForm.annualFeeWaived} onChange={() => setEditForm(p => ({ ...p, annualFeeWaived: !p.annualFeeWaived }))} />
                                        </div>
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <div style={{ flex: 1, position: "relative" }}>
                                                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontFamily: T.font.mono, fontSize: 12 }}>%</span>
                                                <input type="number" inputMode="decimal" pattern="[0-9]*" value={editForm.apr} onChange={e => setEditForm(p => ({ ...p, apr: e.target.value }))}
                                                    placeholder="Standard APR (%)" style={{ width: "100%", padding: "10px 24px 10px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontFamily: T.font.mono, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                                            </div>
                                        </div>
                                        <div style={{ marginTop: -4, paddingLeft: 4 }}>
                                            <PromoCheckbox checked={editForm.hasPromoApr} onChange={() => setEditForm(p => ({ ...p, hasPromoApr: !p.hasPromoApr }))} />
                                        </div>
                                        {editForm.hasPromoApr && <div style={{ display: "flex", gap: 8, marginTop: -4 }}>
                                            <div style={{ flex: 0.5, position: "relative" }}>
                                                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontFamily: T.font.mono, fontSize: 12 }}>%</span>
                                                <input type="number" inputMode="decimal" pattern="[0-9]*" value={editForm.promoAprAmount} onChange={e => setEditForm(p => ({ ...p, promoAprAmount: e.target.value }))}
                                                    placeholder="Promo APR" style={{ width: "100%", padding: "10px 24px 10px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontFamily: T.font.mono, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                                            </div>
                                            <div style={{ flex: 0.5, position: "relative" }}>
                                                <span style={{ position: "absolute", left: 10, top: "8px", color: T.text.dim, fontSize: 11, fontWeight: 700, pointerEvents: "none" }}>PROMO EXP</span>
                                                <input type="date" value={editForm.promoAprExp} onChange={e => setEditForm(p => ({ ...p, promoAprExp: e.target.value }))}
                                                    style={{ width: "100%", padding: "20px 10px 6px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, outline: "none", boxSizing: "border-box", height: "100%" }} />
                                            </div>
                                        </div>}
                                        <input value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))}
                                            placeholder="Notes" style={{ width: "100%", fontSize: 13, padding: "10px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, outline: "none", boxSizing: "border-box", marginTop: 2 }} />

                                        {/* Payment tracking */}
                                        <div style={{ paddingTop: 10, borderTop: `1px solid ${T.border.subtle}`, marginTop: 4 }}>
                                            <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 700, display: "block", marginBottom: 6 }}>PAYMENT TRACKING</span>
                                            <div style={{ display: "flex", gap: 6 }}>
                                                <div style={{ flex: 1 }}>
                                                    <span style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono, display: "block", marginBottom: 3 }}>STMT CLOSES</span>
                                                    <input type="number" inputMode="decimal" pattern="[0-9]*" min="1" max="31" value={editForm.statementCloseDay} onChange={e => setEditForm(p => ({ ...p, statementCloseDay: e.target.value }))}
                                                        placeholder="Day" style={{ width: "100%", padding: "8px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <span style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono, display: "block", marginBottom: 3 }}>PMT DUE</span>
                                                    <input type="number" inputMode="decimal" pattern="[0-9]*" min="1" max="31" value={editForm.paymentDueDay} onChange={e => setEditForm(p => ({ ...p, paymentDueDay: e.target.value }))}
                                                        placeholder="Day" style={{ width: "100%", padding: "8px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                                                </div>
                                                <div style={{ flex: 1, position: "relative" }}>
                                                    <span style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono, display: "block", marginBottom: 3 }}>MIN PMT</span>
                                                    <span style={{ position: "absolute", left: 8, bottom: 9, color: T.text.dim, fontSize: 11, fontWeight: 600 }}>$</span>
                                                    <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={editForm.minPayment} onChange={e => setEditForm(p => ({ ...p, minPayment: e.target.value }))}
                                                        placeholder="35" style={{ width: "100%", padding: "8px 8px 8px 18px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                                            <button onClick={() => saveEdit(card.id)} style={{
                                                flex: 1, padding: 12, borderRadius: T.radius.sm, border: "none",
                                                background: T.accent.primaryDim, color: T.accent.primary, fontSize: 11, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                                            }}>
                                                <Check size={14} />Save</button>
                                            <button onClick={() => setEditingCard(null)} style={{
                                                flex: 1, padding: 12, borderRadius: T.radius.sm,
                                                border: `1px solid ${T.border.default}`, background: "transparent", color: T.text.dim, fontSize: 11, cursor: "pointer", fontWeight: 600
                                            }}>Cancel</button>
                                        </div>
                                    </div> :
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: T.text.primary }}>{getCardLabel(cards, card).replace(inst + " ", "")}</span>
                                            <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                                                {card.annualFee > 0 && <Badge variant={card.annualFeeWaived ? "green" : "amber"} style={{ fontSize: 8, padding: "1px 5px" }}>
                                                    {card.annualFeeWaived ? "WAIVED" : `AF ${fmt(card.annualFee)}`}{card.annualFeeDue && !card.annualFeeWaived ? ` · ${card.annualFeeDue}` : ""}
                                                </Badge>}
                                                {card.apr > 0 && <Badge variant="outline" style={{ fontSize: 8, padding: "1px 5px", color: T.text.secondary, borderColor: T.border.default }}>
                                                    {card.apr}% APR
                                                </Badge>}
                                                {card.hasPromoApr && <Badge variant="green" style={{ fontSize: 8, padding: "1px 5px" }}>
                                                    PROMO {card.promoAprAmount}%{card.promoAprExp ? ` till ${card.promoAprExp}` : ""}
                                                </Badge>}
                                                {card.paymentDueDay && <Badge variant="outline" style={{ fontSize: 8, padding: "1px 5px", color: T.text.dim, borderColor: T.border.default }}>
                                                    Due day {card.paymentDueDay}{card.minPayment ? ` · min ${fmt(card.minPayment)}` : ""}
                                                </Badge>}
                                                {card.notes && <Mono size={10} color={T.text.dim}>{card.notes}</Mono>}
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginRight: 2 }}>
                                                {card._plaidBalance != null && (
                                                    <Mono size={14} weight={900} color={T.status.red}>{fmt(card._plaidBalance)}</Mono>
                                                )}
                                                <Mono size={card._plaidBalance != null ? 10 : 13} weight={700} color={card._plaidBalance != null ? T.text.dim : colors.text}>{card._plaidBalance != null ? "Limit " : ""}{fmt(card.limit)}</Mono>
                                            </div>
                                            <button onClick={() => startEdit(card)} style={{
                                                width: 30, height: 30, borderRadius: T.radius.sm,
                                                border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.dim,
                                                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
                                            }}>
                                                <Edit3 size={11} /></button>
                                            {editingCard !== card.id && <button onClick={() => removeCard(card.id)} style={{
                                                width: 30, height: 30, borderRadius: T.radius.sm,
                                                border: "none", background: T.status.redDim, color: T.status.red,
                                                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
                                            }}>
                                                <X size={11} /></button>}
                                        </div>
                                    </div>}
                            </div>
                        ))}
                    </div>}
                </Card>;
            })
        )}
    </div>;

    // ─── Bank Accounts Section ─────────────────────────────────────

    const removeBankAccount = (id) => {
        const acct = bankAccounts.find(a => a.id === id);
        if (!window.confirm(`Delete "${acct?.name}"? This cannot be undone.`)) return;
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

    const bankSection = <div>
        {/* Premium Section Header: Bank Accounts */}
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
            <h2 style={{ fontSize: 18, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>Bank Accounts</h2>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <Badge variant="outline" style={{ fontSize: 10, color: bankAccounts.length > 0 ? T.status.blue : T.text.muted, borderColor: bankAccounts.length > 0 ? `${T.status.blue}40` : T.border.default }}>
                    {bankAccounts.length === 0 ? "0 accounts" : bankAccounts.length}
                </Badge>
                {collapsedSections.bankAccounts ? <ChevronDown size={16} color={T.text.muted} /> : <ChevronUp size={16} color={T.text.muted} />}
            </div>
        </div>

        {!collapsedSections.bankAccounts && (
            <>
                {/* Premium Sub-header: Checking */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: T.status.blue, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: T.font.mono }}>Checking Accounts</span>
                    <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${T.status.blue}30, transparent)` }} />
                </div>

                {groupedChecking.length === 0 ?
                    <Card style={{ padding: "16px", textAlign: "center" }}><p style={{ fontSize: 11, color: T.text.muted }}>No checking accounts yet</p></Card> :
                    groupedChecking.map(([bank, accts]) => {
                        const isCollapsed = collapsedBanks[`checking-${bank}`];
                        return <Card key={`c-${bank}`} animate variant="glass" style={{ marginBottom: 12, padding: 0, overflow: "hidden", borderLeft: `4px solid ${T.status.blue}` }}>
                            <div onClick={() => setCollapsedBanks(p => ({ ...p, [`checking-${bank}`]: !isCollapsed }))} style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", background: `${T.status.blue}08` }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <div style={{ padding: 5, borderRadius: 7, background: T.status.blue, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <Building2 size={12} color={T.bg.card} />
                                    </div>
                                    <span style={{ fontSize: 12, fontWeight: 800, color: T.status.blue, textTransform: "uppercase", letterSpacing: "0.05em" }}>{bank}</span>
                                    <Badge variant="outline" style={{ fontSize: 10, color: T.status.blue, borderColor: `${T.status.blue}40` }}>{accts.length}</Badge>
                                </div>
                                {isCollapsed ? <ChevronDown size={14} color={T.text.dim} /> : <ChevronUp size={14} color={T.text.dim} />}
                            </div>
                            {!isCollapsed && <div style={{ padding: "12px 18px" }}>
                                {accts.sort((a, b) => a.name.localeCompare(b.name)).map((acct, i) => (
                                    <div key={acct.id} style={{ borderBottom: i === accts.length - 1 ? "none" : `1px solid ${T.border.subtle}`, padding: "12px 0" }}>
                                        {editingBank === acct.id ?
                                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                                <input value={editBankForm.name} onChange={e => setEditBankForm(p => ({ ...p, name: e.target.value }))} placeholder="Account name"
                                                    style={{ width: "100%", fontSize: 13, padding: "10px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, outline: "none", boxSizing: "border-box" }} />
                                                <div style={{ display: "flex", gap: 8 }}>
                                                    <div style={{ flex: 0.4, position: "relative" }}>
                                                        <input type="number" inputMode="decimal" step="0.01" value={editBankForm.apy} onChange={e => setEditBankForm(p => ({ ...p, apy: e.target.value }))} placeholder="APY"
                                                            style={{ width: "100%", padding: "10px 24px 10px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontFamily: T.font.mono, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                                                        <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 12 }}>%</span>
                                                    </div>
                                                    <input value={editBankForm.notes} onChange={e => setEditBankForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes"
                                                        style={{ flex: 1, fontSize: 13, padding: "10px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, outline: "none", boxSizing: "border-box" }} />
                                                </div>
                                                <div style={{ display: "flex", gap: 8 }}>
                                                    <button onClick={() => saveEditBank(acct.id)} style={{ flex: 1, padding: 12, borderRadius: T.radius.sm, border: "none", background: `${T.status.blue}18`, color: T.status.blue, fontSize: 11, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Check size={14} />Save</button>
                                                    <button onClick={() => setEditingBank(null)} style={{ flex: 1, padding: 12, borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: "transparent", color: T.text.dim, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Cancel</button>
                                                </div>
                                            </div> :
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <span style={{ fontSize: 12, fontWeight: 600, color: T.text.primary }}>{acct.name}</span>
                                                    <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                                                        {acct.apy > 0 && <Badge variant="outline" style={{ fontSize: 8, padding: "1px 5px", color: T.status.blue, borderColor: `${T.status.blue}40` }}>{acct.apy}% APY</Badge>}
                                                        {acct.notes && <Mono size={10} color={T.text.dim}>{acct.notes}</Mono>}
                                                    </div>
                                                </div>
                                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                                    {acct._plaidBalance != null && <Mono size={14} weight={900} color={T.status.blue}>{fmt(acct._plaidBalance)}</Mono>}
                                                    <button onClick={() => startEditBank(acct)} style={{ width: 30, height: 30, borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.dim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Edit3 size={11} /></button>
                                                    <button onClick={() => removeBankAccount(acct.id)} style={{ width: 30, height: 30, borderRadius: T.radius.sm, border: "none", background: T.status.redDim, color: T.status.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={11} /></button>
                                                </div>
                                            </div>}
                                    </div>
                                ))}
                            </div>}
                        </Card>;
                    })}

                {/* Premium Sub-header: Savings */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 24, marginBottom: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: T.accent.emerald, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: T.font.mono }}>Savings Accounts</span>
                    <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${T.accent.emerald}30, transparent)` }} />
                </div>

                {groupedSavings.length === 0 ?
                    <Card style={{ padding: "16px", textAlign: "center" }}><p style={{ fontSize: 11, color: T.text.muted }}>No savings accounts yet</p></Card> :
                    groupedSavings.map(([bank, accts]) => {
                        const isCollapsed = collapsedBanks[`savings-${bank}`];
                        return <Card key={`s-${bank}`} animate variant="glass" style={{ marginBottom: 12, padding: 0, overflow: "hidden", borderLeft: `4px solid ${T.accent.emerald}` }}>
                            <div onClick={() => setCollapsedBanks(p => ({ ...p, [`savings-${bank}`]: !isCollapsed }))} style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", background: `${T.accent.emerald}08` }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <div style={{ padding: 5, borderRadius: 7, background: T.accent.emerald, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <DollarSign size={12} color={T.bg.card} />
                                    </div>
                                    <span style={{ fontSize: 12, fontWeight: 800, color: T.accent.emerald, textTransform: "uppercase", letterSpacing: "0.05em" }}>{bank}</span>
                                    <Badge variant="outline" style={{ fontSize: 10, color: T.accent.emerald, borderColor: `${T.accent.emerald}40` }}>{accts.length}</Badge>
                                </div>
                                {isCollapsed ? <ChevronDown size={14} color={T.text.dim} /> : <ChevronUp size={14} color={T.text.dim} />}
                            </div>
                            {!isCollapsed && <div style={{ padding: "12px 18px" }}>
                                {accts.sort((a, b) => a.name.localeCompare(b.name)).map((acct, i) => (
                                    <div key={acct.id} style={{ borderBottom: i === accts.length - 1 ? "none" : `1px solid ${T.border.subtle}`, padding: "12px 0" }}>
                                        {editingBank === acct.id ?
                                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                                <input value={editBankForm.name} onChange={e => setEditBankForm(p => ({ ...p, name: e.target.value }))} placeholder="Account name"
                                                    style={{ width: "100%", fontSize: 13, padding: "10px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, outline: "none", boxSizing: "border-box" }} />
                                                <div style={{ display: "flex", gap: 8 }}>
                                                    <div style={{ flex: 0.4, position: "relative" }}>
                                                        <input type="number" inputMode="decimal" step="0.01" value={editBankForm.apy} onChange={e => setEditBankForm(p => ({ ...p, apy: e.target.value }))} placeholder="APY"
                                                            style={{ width: "100%", padding: "10px 24px 10px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontFamily: T.font.mono, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                                                        <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 12 }}>%</span>
                                                    </div>
                                                    <input value={editBankForm.notes} onChange={e => setEditBankForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes"
                                                        style={{ flex: 1, fontSize: 13, padding: "10px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, outline: "none", boxSizing: "border-box" }} />
                                                </div>
                                                <div style={{ display: "flex", gap: 8 }}>
                                                    <button onClick={() => saveEditBank(acct.id)} style={{ flex: 1, padding: 12, borderRadius: T.radius.sm, border: "none", background: `${T.accent.emerald}18`, color: T.accent.emerald, fontSize: 11, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Check size={14} />Save</button>
                                                    <button onClick={() => setEditingBank(null)} style={{ flex: 1, padding: 12, borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: "transparent", color: T.text.dim, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Cancel</button>
                                                </div>
                                            </div> :
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <span style={{ fontSize: 12, fontWeight: 600, color: T.text.primary }}>{acct.name}</span>
                                                    <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                                                        {acct.apy > 0 && <Badge variant="outline" style={{ fontSize: 8, padding: "1px 5px", color: T.accent.emerald, borderColor: `${T.accent.emerald}40` }}>{acct.apy}% APY</Badge>}
                                                        {acct.notes && <Mono size={10} color={T.text.dim}>{acct.notes}</Mono>}
                                                    </div>
                                                </div>
                                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                                    {acct._plaidBalance != null && <Mono size={14} weight={900} color={T.accent.emerald}>{fmt(acct._plaidBalance)}</Mono>}
                                                    <button onClick={() => startEditBank(acct)} style={{ width: 30, height: 30, borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.dim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Edit3 size={11} /></button>
                                                    <button onClick={() => removeBankAccount(acct.id)} style={{ width: 30, height: 30, borderRadius: T.radius.sm, border: "none", background: T.status.redDim, color: T.status.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={11} /></button>
                                                </div>
                                            </div>}
                                    </div>
                                ))}
                            </div>}
                        </Card>;
                    })}
            </>
        )}
    </div>;

    // ─── Investment Accounts Section (JSX) ─────────────────────────────────

    const investmentsSection = enabledInvestments.length > 0 ? <div style={{ marginTop: 20 }}>
        <div
            onClick={() => setCollapsedSections(p => ({ ...p, investments: !p.investments }))}
            style={{
                display: "flex", alignItems: "center", gap: 12, marginTop: 8, marginBottom: collapsedSections.investments ? 8 : 16,
                padding: "16px 20px", borderRadius: 24, cursor: "pointer", userSelect: "none",
                background: T.bg.glass, backdropFilter: "blur(30px)", WebkitBackdropFilter: "blur(30px)",
                border: `1px solid ${T.border.subtle}`, boxShadow: `0 4px 16px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255,255,255,0.05)`,
                transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                position: "sticky", top: 10, zIndex: 10
            }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: `${T.accent.emerald}1A`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 12px ${T.accent.emerald}10` }}>
                <TrendingUp size={14} color={T.accent.emerald} />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>Investments</h2>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={(e) => { e.stopPropagation(); handleRefreshPrices(); }} disabled={refreshingPrices} title="Refresh prices" style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: refreshingPrices ? T.text.muted : T.accent.emerald, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", opacity: refreshingPrices ? 0.6 : 1 }}>
                    <RefreshCw size={13} className={refreshingPrices ? "spin" : ""} />
                </button>
                <Badge variant="outline" style={{ fontSize: 10, color: investTotalValue > 0 ? T.accent.emerald : T.text.muted, borderColor: investTotalValue > 0 ? `${T.accent.emerald}40` : T.border.default }}>
                    {investTotalValue === 0 ? "0 Value" : fmt(Math.round(investTotalValue))}
                </Badge>
                {collapsedSections.investments ? <ChevronDown size={16} color={T.text.muted} /> : <ChevronUp size={16} color={T.text.muted} />}
            </div>
        </div>

        {!collapsedSections.investments && (
            <>
                {investTotalValue > 0 && <Card animate style={{
                    position: "relative", overflow: "hidden",
                    textAlign: "center", padding: "24px 16px", marginBottom: 16,
                    background: `linear-gradient(145deg, ${T.bg.card}, ${T.bg.card} 40%, ${T.accent.primary}0D)`,
                    borderColor: `${T.accent.primary}20`,
                    boxShadow: `${T.shadow.elevated}, 0 8px 32px ${T.accent.primary}15`
                }}>
                    <div style={{ position: "absolute", top: -60, left: "50%", transform: "translateX(-50%)", width: 140, height: 140, background: T.accent.primary, filter: "blur(60px)", opacity: 0.15, borderRadius: "50%", pointerEvents: "none", animation: "pulseRing 4s infinite alternate ease-in-out" }} />
                    <Mono size={10} color={T.text.dim} weight={700} style={{ letterSpacing: "0.1em" }}>TOTAL PORTFOLIO VALUE</Mono>
                    <div style={{ marginTop: 8 }}><Mono size={32} weight={900} color={T.accent.primary}>{fmt(investTotalValue)}</Mono></div>
                </Card>}

                {enabledInvestments.map(({ key, label, color }) => {
                    const items = holdings[key] || [];
                    const sectionValue = items.reduce((s, h) => s + ((investPrices[h.symbol]?.price || 0) * (h.shares || 0)), 0);
                    const percentOfTotal = investTotalValue > 0 ? (sectionValue / investTotalValue) * 100 : 0;
                    const isCollapsed = collapsedInvest[key];
                    return <Card key={key} animate variant="glass" className="hover-lift" style={{ marginBottom: 16, padding: 0, overflow: "hidden", borderLeft: `4px solid ${color}`, position: "relative" }}>
                        <div style={{ position: "absolute", top: -40, right: -40, width: 80, height: 80, background: color, filter: "blur(40px)", opacity: 0.1, borderRadius: "50%", pointerEvents: "none" }} />
                        <div onClick={() => setCollapsedInvest(p => ({ ...p, [key]: !isCollapsed }))} style={{ padding: "16px 18px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", cursor: "pointer", background: `linear-gradient(90deg, ${color}08, transparent)` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{ padding: 6, borderRadius: 8, background: color, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 12px ${color}40` }}>
                                    <TrendingUp size={14} color={T.bg.card} strokeWidth={2.5} />
                                </div>
                                <span style={{ fontSize: 13, fontWeight: 800, color, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
                                <Badge variant="outline" style={{ fontSize: 10, color, borderColor: `${color}40` }}>{items.length} holding{items.length !== 1 ? "s" : ""}</Badge>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                {sectionValue > 0 && <Mono size={15} weight={800} color={color}>{fmt(sectionValue)}</Mono>}
                                {isCollapsed ? <ChevronDown size={16} color={T.text.dim} /> : <ChevronUp size={16} color={T.text.dim} />}
                            </div>
                            {/* Dynamic progress bar underneath */}
                            {sectionValue > 0 && <div style={{ width: "100%", height: 3, background: `${T.border.default}`, borderRadius: 2, marginTop: 12, overflow: "hidden", display: "flex" }}>
                                <div style={{ width: `${percentOfTotal}%`, background: color, transition: "width 1s cubic-bezier(0.4, 0, 0.2, 1)" }} />
                            </div>}
                        </div>
                        {!isCollapsed && <div style={{ padding: "12px 18px" }}>
                            {items.length === 0 ?
                                <p style={{ fontSize: 11, color: T.text.muted, textAlign: "center", padding: "8px 0" }}>No holdings yet — add your first below.</p> :
                                items.sort((a, b) => (a.symbol || "").localeCompare(b.symbol || "")).map((h, i) => {
                                    const price = investPrices[h.symbol];
                                    return <div key={`${h.symbol}-${i}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i === items.length - 1 ? "none" : `1px solid ${T.border.subtle}` }}>
                                        <div>
                                            <span style={{ fontSize: 12, fontWeight: 700, color: T.text.primary }}>{h.symbol?.replace("-USD", "")}</span>
                                            <span style={{ fontSize: 10, color: T.text.dim, marginLeft: 6 }}>{key === "crypto" ? `${h.shares} units` : `${h.shares} shares`}</span>
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                            <div style={{ textAlign: "right" }}>
                                                {price ? <>
                                                    <Mono size={12} weight={700} color={color}>{fmt(price.price * (h.shares || 0))}</Mono>
                                                    {price.changePct != null && <span style={{ fontSize: 9, fontFamily: T.font.mono, fontWeight: 700, marginLeft: 4, color: price.changePct >= 0 ? T.status.green : T.status.red }}>
                                                        {price.changePct >= 0 ? "+" : ""}{price.changePct.toFixed(2)}%
                                                    </span>}
                                                </> : <Mono size={11} color={T.text.muted}>—</Mono>}
                                            </div>
                                            {setFinancialConfig && <button onClick={() => {
                                                if (!window.confirm(`Remove ${h.symbol?.replace("-USD", "")}?`)) return;
                                                const cur = financialConfig?.holdings || {};
                                                const updated = (cur[key] || []).filter((_, idx) => idx !== i);
                                                setFinancialConfig({ ...financialConfig, holdings: { ...cur, [key]: updated } });
                                            }} style={{ width: 24, height: 24, border: "none", background: `${T.status.red}15`, color: T.status.red, borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                <X size={12} />
                                            </button>}
                                        </div>
                                    </div>;
                                })}

                            {/* Inline Add Holding */}
                            {setFinancialConfig && <div style={{ marginTop: items.length > 0 ? 12 : 0, paddingTop: items.length > 0 ? 12 : 0, borderTop: items.length > 0 ? `1px solid ${T.border.subtle}` : "none" }}>
                                <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <SearchableSelect
                                            value={newHoldingSymbol[key] || ""}
                                            onChange={v => setNewHoldingSymbol(p => ({ ...p, [key]: v }))}
                                            placeholder={key === "crypto" ? "Search crypto…" : "Search ticker…"}
                                            options={[
                                                ...getTickerOptions(key).map(c => ({ value: c.symbol, label: `${c.symbol.replace('-USD', '')} — ${c.name}` })),
                                                { value: "__custom__", label: "Custom ticker…" }
                                            ]}
                                        />
                                    </div>
                                    <input type="number" inputMode="decimal" value={newHoldingShares[key] || ""} onChange={e => setNewHoldingShares(p => ({ ...p, [key]: e.target.value }))} placeholder={key === "crypto" ? "Amt" : "Shares"}
                                        style={{ width: 60, flexShrink: 0, padding: "0 8px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12, fontFamily: T.font.mono, outline: "none" }} />
                                    <button onClick={() => {
                                        const symbol = (newHoldingSymbol[key] || "").toUpperCase().trim();
                                        const shares = parseFloat(newHoldingShares[key] || 0);
                                        if (!symbol || !shares) return;
                                        const cur = financialConfig?.holdings || {};
                                        setFinancialConfig({ ...financialConfig, holdings: { ...cur, [key]: [...(cur[key] || []), { symbol, shares }] } });
                                        setNewHoldingSymbol(p => ({ ...p, [key]: "" }));
                                        setNewHoldingShares(p => ({ ...p, [key]: "" }));
                                    }} disabled={!newHoldingSymbol[key] || !newHoldingShares[key]} style={{
                                        padding: "0 12px", flexShrink: 0, borderRadius: T.radius.md, border: "none",
                                        background: (!newHoldingSymbol[key] || !newHoldingShares[key]) ? T.bg.elevated : `${color}20`,
                                        color: (!newHoldingSymbol[key] || !newHoldingShares[key]) ? T.text.muted : color,
                                        fontSize: 12, fontWeight: 700, cursor: (!newHoldingSymbol[key] || !newHoldingShares[key]) ? "not-allowed" : "pointer",
                                        transition: "all .2s"
                                    }}>+</button>
                                </div>
                            </div>}
                        </div>}
                    </Card>;
                })}
            </>
        )}
    </div> : null;

    // ─── Non-Card Debts Section (JSX) ──────────────────────────────────────

    const debtsSection = nonCardDebts.length > 0 ? <div style={{ marginTop: 20 }}>
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
                {totalDebtBalance > 0 && <Card animate style={{
                    textAlign: "center", padding: "18px 16px", marginBottom: 12,
                    background: `linear-gradient(160deg,${T.bg.card},${T.status.amber}06)`, borderColor: `${T.status.amber}12`
                }}>
                    <Mono size={10} color={T.text.dim}>TOTAL OUTSTANDING</Mono>
                    <br /><Mono size={26} weight={800} color={T.status.amber}>{fmt(totalDebtBalance)}</Mono>
                </Card>}

                <Card animate variant="glass" style={{ padding: 0, overflow: "hidden", borderLeft: `4px solid ${T.status.amber}` }}>
                    <div onClick={() => setCollapsedDebts(!collapsedDebts)} style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", background: `${T.status.amber}08` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ padding: 5, borderRadius: 7, background: T.status.amber, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <AlertTriangle size={12} color={T.bg.card} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 800, color: T.status.amber, textTransform: "uppercase", letterSpacing: "0.05em" }}>ACTIVE DEBTS</span>
                            <Badge variant="outline" style={{ fontSize: 10, color: T.status.amber, borderColor: `${T.status.amber}40` }}>{nonCardDebts.length}</Badge>
                        </div>
                        {collapsedDebts ? <ChevronDown size={14} color={T.text.dim} /> : <ChevronUp size={14} color={T.text.dim} />}
                    </div>
                    {!collapsedDebts && <div style={{ padding: "12px 18px" }}>
                        {nonCardDebts.sort((a, b) => (b.balance || 0) - (a.balance || 0)).map((debt, i) => (
                            <div key={debt.id || i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i === nonCardDebts.length - 1 ? "none" : `1px solid ${T.border.subtle}` }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: T.text.primary }}>{debt.name || "Unnamed Debt"}</span>
                                    <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                                        {debt.type && <Badge variant="outline" style={{ fontSize: 8, padding: "1px 5px", color: T.status.amber, borderColor: `${T.status.amber}40` }}>{debt.type.toUpperCase()}</Badge>}
                                        {debt.apr > 0 && <Badge variant="outline" style={{ fontSize: 8, padding: "1px 5px", color: T.text.secondary }}>{debt.apr}% APR</Badge>}
                                        {debt.minPayment > 0 && <Badge variant="outline" style={{ fontSize: 8, padding: "1px 5px", color: T.text.dim }}>Min {fmt(debt.minPayment)}</Badge>}
                                    </div>
                                </div>
                                <Mono size={13} weight={700} color={T.status.amber}>{fmt(debt.balance)}</Mono>
                            </div>
                        ))}
                    </div>}
                </Card>
                <p style={{ fontSize: 10, color: T.text.muted, textAlign: "center", fontFamily: T.font.mono, marginTop: 8 }}>Manage debts in Settings → Debts & Liabilities</p>
            </>
        )}
    </div> : null;

    // ═══ SAVINGS GOALS SECTION ═══
    const savingsGoalsSection = <div>
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
                {collapsedSections.savingsGoals ? <ChevronDown size={16} color={T.text.muted} /> : <ChevronUp size={16} color={T.text.muted} />}
            </div>
        </div>

        {!collapsedSections.savingsGoals && (
            <>
                {savingsGoals.length > 0 && <Card animate style={{ padding: 0, overflow: "hidden" }}>
                    {savingsGoals.map((goal, i) => {
                        const pct = goal.targetAmount > 0 ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100)) : 0;
                        const color = pct >= 100 ? T.status.green : pct >= 50 ? T.accent.primary : T.status.amber;
                        return <div key={i} style={{ padding: "14px 16px", borderBottom: i < savingsGoals.length - 1 ? `1px solid ${T.border.subtle}` : "none" }}>
                            {editingGoals ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                        <input value={goal.name || ""} onChange={e => updateGoal(i, "name", e.target.value)}
                                            placeholder="Goal name" style={{ flex: 1, padding: "8px 10px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12 }} />
                                        <button onClick={() => removeGoal(i)} style={{ width: 28, height: 28, borderRadius: T.radius.sm, border: "none", background: T.status.redDim, color: T.status.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>×</button>
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
                                        <Mono size={11} weight={700} color={color}>${(goal.currentAmount || 0).toLocaleString()} / ${(goal.targetAmount || 0).toLocaleString()}</Mono>
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
    </div>;

    // ═══ OTHER ASSETS SECTION ═══
    const otherAssetsSection = <div>
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
                        <div key={i} style={{ padding: "14px 16px", borderBottom: i < otherAssets.length - 1 ? `1px solid ${T.border.subtle}` : "none" }}>
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
                                    <button onClick={() => removeAsset(i)} style={{ width: 28, height: 28, borderRadius: T.radius.sm, border: "none", background: T.status.redDim, color: T.status.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>×</button>
                                </div>
                            ) : (
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: T.text.primary }}>{asset.name || "Unnamed"}</span>
                                        <Badge variant="outline" style={{ fontSize: 8, padding: "1px 5px", color: asset.liquid ? T.accent.emerald : T.text.dim, borderColor: asset.liquid ? `${T.accent.emerald}40` : T.border.default }}>
                                            {asset.liquid ? "LIQUID" : "ILLIQUID"}
                                        </Badge>
                                    </div>
                                    <Mono size={13} weight={700} color={T.accent.copper}>{fmt(asset.value || 0)}</Mono>
                                </div>
                            )}
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
    </div>;

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
        {creditCardsSection}
        {investmentsSection}
        {savingsGoalsSection}
        {otherAssetsSection}
        {debtsSection}

        {/* ═══ UNIFIED ADD BOTTOM SHEET ═══ */}
        {showAddSheet && (
            <>
                {/* Backdrop */}
                <div onClick={closeSheet} style={{
                    position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
                    zIndex: 500, animation: "sheetFadeIn .2s ease both"
                }} />
                {/* Sheet */}
                <div style={{
                    position: "fixed", bottom: 0, left: 0, right: 0,
                    background: T.bg.elevated, borderRadius: "24px 24px 0 0",
                    zIndex: 501, animation: "sheetSlideUp .32s cubic-bezier(0.34,1.56,0.64,1) both",
                    maxHeight: "88vh", overflowY: "auto",
                    paddingBottom: "max(20px, env(safe-area-inset-bottom))",
                    boxShadow: "0 -12px 48px rgba(0,0,0,0.3)"
                }}>
                    {/* Drag handle */}
                    <div style={{ width: 40, height: 4, borderRadius: 2, background: T.border.default, margin: "12px auto 0" }} />

                    {/* Header */}
                    <div style={{ display: "flex", alignItems: "center", padding: "16px 20px 12px", gap: 8 }}>
                        {addSheetStep && <button onClick={() => setAddSheetStep(null)} style={{ width: 32, height: 32, borderRadius: 10, border: "none", background: T.bg.card, color: T.text.secondary, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ArrowLeft size={16} /></button>}
                        <span style={{ flex: 1, fontSize: 17, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>
                            {!addSheetStep && "Add to Portfolio"}
                            {addSheetStep === "card" && "Add Credit Card"}
                            {addSheetStep === "bank" && "Add Bank Account"}
                            {addSheetStep === "invest" && "Add Investment"}
                            {addSheetStep === "goal" && "Add Savings Goal"}
                            {addSheetStep === "asset" && "Add Other Asset"}
                        </span>
                        <button onClick={closeSheet} style={{ width: 32, height: 32, borderRadius: 10, border: "none", background: T.bg.card, color: T.text.secondary, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={16} /></button>
                    </div>

                    <div style={{ padding: "0 16px 16px" }}>

                        {/* ── MENU STEP ── */}
                        {!addSheetStep && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

                                {/* Plaid hero button */}
                                {ENABLE_PLAID && (
                                    <button onClick={handlePlaidConnect} disabled={plaidLoading} style={{
                                        width: "100%", padding: "18px 20px", borderRadius: T.radius.lg, border: "none", cursor: plaidLoading ? "wait" : "pointer",
                                        background: plaidLoading ? T.bg.card : "linear-gradient(135deg, #1a7cda 0%, #12b886 100%)",
                                        position: "relative", overflow: "hidden",
                                        display: "flex", alignItems: "center", gap: 14, textAlign: "left",
                                        boxShadow: plaidLoading ? "none" : "0 8px 28px rgba(26,124,218,0.35), inset 0 1px 0 rgba(255,255,255,0.15)",
                                        transition: "all .25s"
                                    }}>
                                        {!plaidLoading && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)", backgroundSize: "200% 100%", animation: "shimmerSlide 2.4s linear infinite" }} />}
                                        <div style={{ width: 42, height: 42, borderRadius: 13, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "1px solid rgba(255,255,255,0.2)" }}>
                                            {plaidLoading ? <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2.5px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.8s linear infinite" }} /> : <Link2 size={20} color="#fff" strokeWidth={2.5} />}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 15, fontWeight: 800, color: plaidLoading ? T.text.secondary : "#fff", letterSpacing: "-0.01em" }}>
                                                {plaidLoading ? "Connecting…" : "Connect with Plaid"}
                                            </div>
                                            <div style={{ fontSize: 11, color: plaidLoading ? T.text.muted : "rgba(255,255,255,0.78)", marginTop: 2 }}>Auto-sync your bank accounts &amp; cards · 12,000+ institutions</div>
                                        </div>
                                        {!plaidLoading && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", fontWeight: 700, letterSpacing: "0.05em", flexShrink: 0 }}>SECURE →</div>}
                                    </button>
                                )}

                                {/* Plaid feedback */}
                                {plaidResult === 'success' && <div style={{ padding: "12px 16px", borderRadius: T.radius.md, background: `${T.status.green}15`, border: `1px solid ${T.status.green}30`, display: "flex", alignItems: "center", gap: 8 }}><CheckCircle2 size={16} color={T.status.green} /><span style={{ fontSize: 13, color: T.status.green, fontWeight: 600 }}>Connected! Accounts imported.</span></div>}
                                {plaidResult === 'error' && <div style={{ padding: "12px 16px", borderRadius: T.radius.md, background: `${T.status.red}10`, border: `1px solid ${T.status.red}25`, display: "flex", alignItems: "center", gap: 8 }}><AlertTriangle size={14} color={T.status.red} /><span style={{ fontSize: 12, color: T.status.red }}>{plaidError || "Connection failed"}</span></div>}

                                {/* Divider */}
                                <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "0 4px" }}><div style={{ flex: 1, height: 1, background: T.border.subtle }} /><span style={{ fontSize: 11, color: T.text.muted, fontFamily: T.font.mono, fontWeight: 700 }}>OR ADD MANUALLY</span><div style={{ flex: 1, height: 1, background: T.border.subtle }} /></div>

                                {/* Manual option grid */}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                    {[
                                        { id: "card", icon: CreditCard, label: "Credit Card", color: T.accent.primary },
                                        { id: "bank", icon: Landmark, label: "Bank Account", color: T.status.blue },
                                        { id: "invest", icon: TrendingUp, label: "Investment", color: T.accent.emerald },
                                        { id: "goal", icon: Target, label: "Savings Goal", color: T.accent.primary },
                                        { id: "asset", icon: Wallet, label: "Other Asset", color: T.accent.copper },
                                    ].map(({ id, icon: Icon, label, color }) => (
                                        <button key={id} onClick={() => setAddSheetStep(id)} style={{
                                            display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
                                            borderRadius: T.radius.lg, border: `1.5px solid ${color}25`,
                                            background: `${color}08`, cursor: "pointer", textAlign: "left", transition: "all .2s"
                                        }}>
                                            <div style={{ width: 34, height: 34, borderRadius: 10, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: `1px solid ${color}30` }}><Icon size={16} color={color} /></div>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: T.text.primary }}>{label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── CARD FORM ── */}
                        {addSheetStep === "card" && (() => {
                            const cardList = (() => {
                                const list = getIssuerCards(addForm.institution, null);
                                const pinned = getPinnedForIssuer(addForm.institution, null);
                                const pinnedSet = new Set(pinned.map(p => p.toLowerCase()));
                                return [
                                    ...list.filter(c => pinnedSet.has(c.name.toLowerCase()) && c.status !== "discontinued").map(c => ({ value: c.name, label: c.name, group: "Popular" })),
                                    ...list.filter(c => !pinnedSet.has(c.name.toLowerCase()) && c.status !== "discontinued").sort((a, b) => a.name.localeCompare(b.name)).map(c => ({ value: c.name, label: c.name, group: "All" })),
                                    { value: "__other__", label: "Other / Custom…" }
                                ];
                            })();
                            const canAdd = !!(addForm.institution && (addForm.cardChoice && addForm.cardChoice !== "__other__" ? true : addForm.customName?.trim()));
                            return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                <SearchableSelect value={addForm.institution} onChange={v => setAddForm(p => ({ ...p, institution: v, cardChoice: "", customName: "" }))} placeholder="Issuer / Bank" options={INSTITUTIONS.map(i => ({ value: i, label: i }))} />
                                {addForm.institution && <SearchableSelect value={addForm.cardChoice} onChange={v => setAddForm(p => ({ ...p, cardChoice: v }))} placeholder="Select Card" options={cardList} />}
                                {addForm.cardChoice === "__other__" && <input value={addForm.customName} onChange={e => setAddForm(p => ({ ...p, customName: e.target.value }))} placeholder="Card name" style={{ padding: "11px 14px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontSize: 13 }} />}
                                <div style={{ display: "flex", gap: 8 }}>
                                    <div style={{ flex: 1, position: "relative" }}><span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 700 }}>$</span><input type="number" inputMode="decimal" value={addForm.limit} onChange={e => setAddForm(p => ({ ...p, limit: e.target.value }))} placeholder="Limit" style={{ width: "100%", paddingLeft: 26, padding: "11px 11px 11px 26px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontSize: 13, boxSizing: "border-box" }} /></div>
                                    <div style={{ flex: 1, position: "relative" }}><span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 700 }}>$</span><input type="number" inputMode="decimal" value={addForm.annualFee} onChange={e => setAddForm(p => ({ ...p, annualFee: e.target.value }))} placeholder="Annual Fee" style={{ width: "100%", padding: "11px 11px 11px 26px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontSize: 13, boxSizing: "border-box" }} /></div>
                                </div>
                                <input value={addForm.nickname} onChange={e => setAddForm(p => ({ ...p, nickname: e.target.value }))} placeholder="Nickname (optional)" style={{ padding: "11px 14px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontSize: 13 }} />
                                <button onClick={() => { if (!canAdd) return; addCard(); closeSheet(); setAddForm({ institution: "", cardChoice: "", customName: "", nickname: "", limit: "", annualFee: "", annualFeeDue: "", annualFeeWaived: false, notes: "", apr: "", hasPromoApr: false, promoAprAmount: "", promoAprExp: "", statementCloseDay: "", paymentDueDay: "", minPayment: "" }); }} disabled={!canAdd} style={{ padding: "14px", borderRadius: T.radius.md, border: "none", background: canAdd ? T.accent.gradient : T.bg.card, color: canAdd ? "#fff" : T.text.muted, fontSize: 14, fontWeight: 800, cursor: canAdd ? "pointer" : "not-allowed", transition: "all .2s" }}>Add Card</button>
                            </div>;
                        })()}

                        {/* ── BANK FORM ── */}
                        {addSheetStep === "bank" && (() => {
                            const bProds = getBankProducts(addBankForm.bank);
                            const bList = addBankForm.accountType === "checking" ? bProds.checking : bProds.savings;
                            const canAdd = !!(addBankForm.bank && (addBankForm.productName === "__other__" ? addBankForm.customName?.trim() : addBankForm.productName?.trim()));
                            return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                <SearchableSelect value={addBankForm.bank} onChange={v => setAddBankForm(p => ({ ...p, bank: v, productName: "", customName: "" }))} placeholder="Bank / Institution" options={getBankNames().map(n => ({ value: n, label: n }))} />
                                <div style={{ display: "flex", gap: 0, borderRadius: T.radius.md, overflow: "hidden", border: `1px solid ${T.border.default}` }}>
                                    {["checking", "savings"].map(t => (<button key={t} onClick={() => setAddBankForm(p => ({ ...p, accountType: t, productName: "", customName: "" }))} style={{ flex: 1, padding: "11px", border: "none", background: addBankForm.accountType === t ? T.status.blue : T.bg.card, color: addBankForm.accountType === t ? "#fff" : T.text.secondary, fontSize: 13, fontWeight: 700, cursor: "pointer", textTransform: "capitalize" }}>{t}</button>))}
                                </div>
                                {addBankForm.bank && bList.length > 0 && <SearchableSelect value={addBankForm.productName} onChange={v => setAddBankForm(p => ({ ...p, productName: v }))} placeholder="Select Account Product" options={[...bList.map(n => ({ value: n, label: n })), { value: "__other__", label: "Other…" }]} />}
                                {(!addBankForm.bank || bList.length === 0 || addBankForm.productName === "__other__") && <input value={addBankForm.customName} onChange={e => setAddBankForm(p => ({ ...p, customName: e.target.value }))} placeholder="Account name" style={{ padding: "11px 14px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontSize: 13 }} />}
                                <div style={{ position: "relative" }}><input type="number" inputMode="decimal" step="0.01" value={addBankForm.apy} onChange={e => setAddBankForm(p => ({ ...p, apy: e.target.value }))} placeholder="APY (optional)" style={{ width: "100%", padding: "11px 36px 11px 14px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontSize: 13, boxSizing: "border-box" }} /><span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13 }}>%</span></div>
                                <button onClick={() => { if (!canAdd) return; addBankAccount(); closeSheet(); }} disabled={!canAdd} style={{ padding: "14px", borderRadius: T.radius.md, border: "none", background: canAdd ? `linear-gradient(135deg, ${T.status.blue}, #1a56db)` : T.bg.card, color: canAdd ? "#fff" : T.text.muted, fontSize: 14, fontWeight: 800, cursor: canAdd ? "pointer" : "not-allowed", transition: "all .2s" }}>Add Account</button>
                            </div>;
                        })()}

                        {/* ── INVESTMENT FORM ── */}
                        {addSheetStep === "invest" && (() => {
                            const [iKey, setIKey] = useState("brokerage");
                            const opts = [
                                { key: "roth", label: "Roth IRA", color: T.accent.primary },
                                { key: "k401", label: "401(k)", color: T.status.blue },
                                { key: "brokerage", label: "Brokerage", color: T.accent.emerald },
                                { key: "hsa", label: "HSA", color: "#06B6D4" },
                                { key: "crypto", label: "Crypto", color: T.status.amber },
                            ];
                            const [sym, setSym] = useState("");
                            const [shr, setShr] = useState("");
                            const canAdd = !!(sym?.trim() && parseFloat(shr || 0) > 0);
                            return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{opts.map(o => <button key={o.key} onClick={() => setIKey(o.key)} style={{ padding: "7px 14px", borderRadius: 99, border: `1.5px solid ${iKey === o.key ? o.color : T.border.default}`, background: iKey === o.key ? `${o.color}18` : "transparent", color: iKey === o.key ? o.color : T.text.secondary, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{o.label}</button>)}</div>
                                <SearchableSelect value={sym} onChange={setSym} placeholder={iKey === "crypto" ? "Search crypto…" : "Search ticker…"} options={[...getTickerOptions(iKey).map(c => ({ value: c.symbol, label: `${c.symbol.replace("-USD", "")} — ${c.name}` })), { value: "__custom__", label: "Custom ticker…" }]} />
                                {sym === "__custom__" && <input placeholder="Enter ticker symbol" onChange={e => setSym(e.target.value.toUpperCase())} style={{ padding: "11px 14px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontSize: 13 }} />}
                                <input type="number" inputMode="decimal" value={shr} onChange={e => setShr(e.target.value)} placeholder={iKey === "crypto" ? "Amount" : "Shares"} style={{ padding: "11px 14px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontSize: 13 }} />
                                <button onClick={() => { if (!canAdd) return; const finalSym = sym.toUpperCase().replace("-USD", "") + (iKey === "crypto" ? "-USD" : ""); const cur = financialConfig?.holdings || {}; setFinancialConfig({ ...financialConfig, holdings: { ...cur, [iKey]: [...(cur[iKey] || []), { symbol: finalSym, shares: parseFloat(shr) }] } }); setCollapsedSections(p => ({ ...p, investments: false })); closeSheet(); }} disabled={!canAdd} style={{ padding: "14px", borderRadius: T.radius.md, border: "none", background: canAdd ? `linear-gradient(135deg, ${T.accent.emerald}, #0ca678)` : T.bg.card, color: canAdd ? "#fff" : T.text.muted, fontSize: 14, fontWeight: 800, cursor: canAdd ? "pointer" : "not-allowed", transition: "all .2s" }}>Add Holding</button>
                            </div>;
                        })()}

                        {/* ── SAVINGS GOAL FORM ── */}
                        {addSheetStep === "goal" && (() => {
                            const [gf, setGf] = useState({ name: "", targetAmount: "", currentAmount: "", targetDate: "" });
                            const canAdd = !!gf.name.trim();
                            return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                <input value={gf.name} onChange={e => setGf(p => ({ ...p, name: e.target.value }))} placeholder="Goal name (e.g. Emergency Fund)" style={{ padding: "11px 14px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontSize: 13 }} />
                                <div style={{ display: "flex", gap: 8 }}>
                                    <div style={{ flex: 1, position: "relative" }}><span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontWeight: 700 }}>$</span><input type="number" inputMode="decimal" value={gf.targetAmount} onChange={e => setGf(p => ({ ...p, targetAmount: e.target.value }))} placeholder="Target" style={{ width: "100%", padding: "11px 11px 11px 26px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontSize: 13, boxSizing: "border-box" }} /></div>
                                    <div style={{ flex: 1, position: "relative" }}><span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontWeight: 700 }}>$</span><input type="number" inputMode="decimal" value={gf.currentAmount} onChange={e => setGf(p => ({ ...p, currentAmount: e.target.value }))} placeholder="Current" style={{ width: "100%", padding: "11px 11px 11px 26px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontSize: 13, boxSizing: "border-box" }} /></div>
                                </div>
                                <input type="date" value={gf.targetDate} onChange={e => setGf(p => ({ ...p, targetDate: e.target.value }))} style={{ padding: "11px 14px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontSize: 13 }} />
                                <button onClick={() => { if (!canAdd) return; setFinancialConfig({ ...financialConfig, savingsGoals: [...(financialConfig?.savingsGoals || []), { name: gf.name.trim(), targetAmount: parseFloat(gf.targetAmount) || 0, currentAmount: parseFloat(gf.currentAmount) || 0, targetDate: gf.targetDate }] }); setCollapsedSections(p => ({ ...p, savingsGoals: false })); closeSheet(); }} disabled={!canAdd} style={{ padding: "14px", borderRadius: T.radius.md, border: "none", background: canAdd ? T.accent.gradient : T.bg.card, color: canAdd ? "#fff" : T.text.muted, fontSize: 14, fontWeight: 800, cursor: canAdd ? "pointer" : "not-allowed", transition: "all .2s" }}>Add Goal</button>
                            </div>;
                        })()}

                        {/* ── OTHER ASSET FORM ── */}
                        {addSheetStep === "asset" && (() => {
                            const [af, setAf] = useState({ name: "", value: "", liquid: false });
                            const canAdd = !!af.name.trim();
                            return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                <input value={af.name} onChange={e => setAf(p => ({ ...p, name: e.target.value }))} placeholder="Asset name (e.g. Vehicle, Property)" style={{ padding: "11px 14px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontSize: 13 }} />
                                <div style={{ position: "relative" }}><span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontWeight: 700 }}>$</span><input type="number" inputMode="decimal" value={af.value} onChange={e => setAf(p => ({ ...p, value: e.target.value }))} placeholder="Estimated value" style={{ width: "100%", padding: "11px 11px 11px 26px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontSize: 13, boxSizing: "border-box" }} /></div>
                                <button onClick={() => setAf(p => ({ ...p, liquid: !p.liquid }))} style={{ padding: "12px 16px", borderRadius: T.radius.md, border: `1.5px solid ${af.liquid ? T.accent.emerald : T.border.default}`, background: af.liquid ? `${T.accent.emerald}12` : "transparent", color: af.liquid ? T.accent.emerald : T.text.secondary, fontSize: 13, fontWeight: 700, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8 }}>{af.liquid ? "💧" : "🔒"} {af.liquid ? "Liquid (can access quickly)" : "Illiquid (locked up / long-term)"}</button>
                                <button onClick={() => { if (!canAdd) return; setFinancialConfig({ ...financialConfig, otherAssets: [...(financialConfig?.otherAssets || []), { name: af.name.trim(), value: parseFloat(af.value) || 0, liquid: af.liquid }] }); setCollapsedSections(p => ({ ...p, otherAssets: false })); closeSheet(); }} disabled={!canAdd} style={{ padding: "14px", borderRadius: T.radius.md, border: "none", background: canAdd ? `linear-gradient(135deg, ${T.accent.copper}, #e67e22)` : T.bg.card, color: canAdd ? "#fff" : T.text.muted, fontSize: 14, fontWeight: 800, cursor: canAdd ? "pointer" : "not-allowed", transition: "all .2s" }}>Add Asset</button>
                            </div>;
                        })()}

                    </div>
                </div>
            </>
        )}
    </div>;
})
