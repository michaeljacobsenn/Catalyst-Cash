import { useState, useMemo, useEffect, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { Plus, X, ChevronDown, ChevronUp, CreditCard, Edit3, Check, DollarSign, Building2, Landmark, TrendingUp, AlertTriangle, RefreshCw, Target, Wallet, ArrowLeft, Link2, CheckCircle2, Trash2 } from "lucide-react";
import { T, ISSUER_COLORS } from "../constants.js";
import { getIssuerCards, getPinnedForIssuer } from "../issuerCards.js";
import { getBankNames, getBankProducts } from "../bankCatalog.js";
import { getCardLabel } from "../cards.js";
import { fmt } from "../utils.js";
import { Card, Label, Badge } from "../ui.jsx";
import { Mono, EmptyState } from "../components.jsx";
import SearchableSelect from "../SearchableSelect.jsx";
import { fetchMarketPrices, getTickerOptions } from "../marketData.js";
import { connectBank, autoMatchAccounts, fetchBalancesAndLiabilities, fetchAllBalancesAndLiabilities, applyBalanceSync, saveConnectionLinks, purgeBrokenConnections, getConnections } from "../plaid.js";
import { haptic } from "../haptics.js";
import { getCurrentTier, isGatingEnforced } from "../subscription.js";

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

    const [plaidRefreshing, setPlaidRefreshing] = useState(false);
    const handleRefreshPlaid = async () => {
        if (plaidRefreshing) return; // Guard against double-tap

        // Check if there are any Plaid connections to sync
        const conns = await getConnections();
        if (conns.length === 0) {
            if (window.toast) window.toast.info("No bank connections — tap 'Connect with Plaid' to add one");
            return;
        }

        // Tiered cooldown: Free = 60min, Pro = 5min
        // Skip cooldown in soft gating mode (beta — don't block)
        if (isGatingEnforced()) {
            const tier = await getCurrentTier();
            const cooldown = REFRESH_COOLDOWNS[tier.id] || REFRESH_COOLDOWNS.free;
            const lastSync = cards.find(c => c._plaidLastSync)?._plaidLastSync
                || bankAccounts.find(b => b._plaidLastSync)?._plaidLastSync;
            if (lastSync && (Date.now() - new Date(lastSync).getTime()) < cooldown) {
                const minsLeft = Math.ceil((cooldown - (Date.now() - new Date(lastSync).getTime())) / 60000);
                if (window.toast) window.toast.info(`Next sync available in ${minsLeft} min${tier.id === "free" ? " (Pro: every 5 min)" : ""}`);
                return;
            }
        }
        setPlaidRefreshing(true);
        try {
            const results = await fetchAllBalancesAndLiabilities();
            console.warn(`[Plaid] handleRefreshPlaid: ${results.length} results, errors: ${results.filter(r => r._error).map(r => r._error).join(', ') || 'none'}`);
            let allCards = [...cards];
            let allBanks = [...bankAccounts];
            let allInvests = [...(financialConfig.plaidInvestments || [])];
            let investmentsChanged = false;
            let successCount = 0;
            for (let i = 0; i < results.length; i++) {
                const res = results[i];
                if (!res._error) {
                    const syncData = applyBalanceSync(res, allCards, allBanks, allInvests);
                    console.warn(`[Plaid] applyBalanceSync for ${res.institutionName}: ${syncData.balanceSummary.length} accounts updated`, syncData.balanceSummary);
                    allCards = syncData.updatedCards;
                    allBanks = syncData.updatedBankAccounts;
                    if (syncData.updatedPlaidInvestments) {
                        allInvests = syncData.updatedPlaidInvestments;
                        investmentsChanged = true;
                    }
                    await saveConnectionLinks(res);
                    successCount++;
                }
            }
            setCards(allCards);
            setBankAccounts(allBanks);
            if (investmentsChanged) setFinancialConfig({ ...financialConfig, plaidInvestments: allInvests });
            if (successCount > 0) {
                haptic.success();
                if (window.toast) window.toast.success(`Synced ${successCount} bank${successCount !== 1 ? 's' : ''} successfully`);
            } else {
                const firstErr = results.find(r => r._error)?._error || "No connections available";
                console.warn(`[Plaid] ALL connections failed: ${firstErr}`);
                if (window.toast) window.toast.error(`Sync failed: ${firstErr}`);
            }
        } catch (e) { console.error(e); if (window.toast) window.toast.error("Failed to sync balances. Try again."); }
        finally { setPlaidRefreshing(false); }
    };
    const [addBankForm, setAddBankForm] = useState({ bank: "", accountType: "checking", productName: "", customName: "", apy: "", notes: "" });
    const [editingBank, setEditingBank] = useState(null);
    const [addForm, setAddForm] = useState({ institution: "", cardChoice: "", customName: "", nickname: "", limit: "", annualFee: "", annualFeeDue: "", annualFeeWaived: false, notes: "", apr: "", hasPromoApr: false, promoAprAmount: "", promoAprExp: "", statementCloseDay: "", paymentDueDay: "", minPayment: "" });
    const [editBankForm, setEditBankForm] = useState({});

    // ── Hoisted states for internal bottom-sheet forms ──
    const [addInvestFormKey, setAddInvestFormKey] = useState("brokerage");
    const [addInvestFormSym, setAddInvestFormSym] = useState("");
    const [addInvestFormShr, setAddInvestFormShr] = useState("");
    const [addGoalForm, setAddGoalForm] = useState({ name: "", targetAmount: "", currentAmount: "", targetDate: "" });
    const [addAssetForm, setAddAssetForm] = useState({ name: "", value: "", liquid: false });

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

    // Bank form helpers (hoisted for Action Bar form)
    const bankProducts = useMemo(() => getBankProducts(addBankForm.bank), [addBankForm.bank]);
    const bankProductList = addBankForm.accountType === "checking" ? bankProducts.checking : bankProducts.savings;
    const addBankAccount = () => {
        haptic.success();
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

    const addCard = () => {
        haptic.success();
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
    const [addDebtForm, setAddDebtForm] = useState({ name: "", type: "personal", balance: "", apr: "", minPayment: "" });
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
        <div style={{ paddingTop: 24, paddingBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <h1 style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.02em" }}>Accounts</h1>
                    <Badge variant="outline" style={{ fontSize: 11, padding: "2px 8px", color: T.text.secondary, borderColor: T.border.default, fontFamily: T.font.mono, letterSpacing: "0.02em" }}>{totalAccounts} Total</Badge>
                </div>
                <p style={{ fontSize: 13, color: T.text.secondary, marginTop: 4, fontFamily: T.font.mono }}>Manage your financial accounts</p>
            </div>
            {ENABLE_PLAID && (cards.some(c => c._plaidAccountId) || bankAccounts.some(b => b._plaidAccountId)) && (<button onClick={handleRefreshPlaid} disabled={plaidRefreshing} className="hover-btn" style={{
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

        {/* Account Summary Badges */}
        <Card animate className="hover-card" style={{ padding: "16px 20px", marginTop: 4 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                {cards.length > 0 && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 99, background: `${T.accent.primary}10`, border: `1px solid ${T.accent.primary}20` }}>
                    <CreditCard size={12} color={T.accent.primary} />
                    <Mono size={11} weight={700} color={T.accent.primary}>{cards.length} Card{cards.length !== 1 ? "s" : ""}</Mono>
                </div>}
                {bankAccounts.length > 0 && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 99, background: `${T.status.blue}10`, border: `1px solid ${T.status.blue}20` }}>
                    <Landmark size={12} color={T.status.blue} />
                    <Mono size={11} weight={700} color={T.status.blue}>{bankAccounts.length} Bank{bankAccounts.length !== 1 ? "s" : ""}</Mono>
                </div>}
                {enabledInvestments.length > 0 && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 99, background: `${T.accent.emerald}10`, border: `1px solid ${T.accent.emerald}20` }}>
                    <TrendingUp size={12} color={T.accent.emerald} />
                    <Mono size={11} weight={700} color={T.accent.emerald}>{enabledInvestments.length} Investment{enabledInvestments.length !== 1 ? "s" : ""}</Mono>
                </div>}
                {nonCardDebts.length > 0 && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 99, background: `${T.status.amber}10`, border: `1px solid ${T.status.amber}20` }}>
                    <AlertTriangle size={12} color={T.status.amber} />
                    <Mono size={11} weight={700} color={T.status.amber}>{nonCardDebts.length} Debt{nonCardDebts.length !== 1 ? "s" : ""}</Mono>
                </div>}
                {savingsGoals.length > 0 && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 99, background: `${T.accent.primary}10`, border: `1px solid ${T.accent.primary}20` }}>
                    <Target size={12} color={T.accent.primary} />
                    <Mono size={11} weight={700} color={T.accent.primary}>{savingsGoals.length} Goal{savingsGoals.length !== 1 ? "s" : ""}</Mono>
                </div>}
            </div>
        </Card>

        {/* Unified floating buttons — Add Account + optional Plaid */}
        <div style={{ display: "flex", gap: 16, marginTop: 24, marginBottom: 16 }}>
            <button onClick={() => openSheet()} className="hover-btn" style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 48, borderRadius: 24,
                border: "1px solid transparent", boxSizing: "border-box",
                background: T.accent.primary, color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer",
                boxShadow: `inset 0 1px 1px rgba(255,255,255,0.15), 0 4px 12px ${T.accent.primary}30`, letterSpacing: "0.03em"
            }}><Plus size={16} />Add Account</button>
            {ENABLE_PLAID && <button onClick={(e) => { haptic.medium(); handlePlaidConnect(e); }} disabled={plaidLoading} className="hover-btn" style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 48, borderRadius: 24,
                border: "1px solid rgba(255,255,255,0.1)", boxSizing: "border-box", background: "#000000",
                color: "#FFFFFF", fontSize: 13, fontWeight: 800, cursor: plaidLoading ? "wait" : "pointer",
                boxShadow: "0 4px 14px rgba(0,0,0,0.5)", letterSpacing: "0.03em",
                opacity: plaidLoading ? 0.6 : 1, transition: "all .3s cubic-bezier(0.16, 1, 0.3, 1)"
            }}><Link2 size={15} />{plaidLoading ? "Connecting…" : "Connect with Plaid"}</button>}
        </div>

        {/* Info */}
        <Card animate delay={50} style={{ padding: "16px", borderLeft: `3px solid ${T.status.green}30` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Check size={12} color={T.status.green} />
                <span style={{ fontSize: 11, fontWeight: 600, color: T.text.secondary }}>Changes here update your audit snapshot & renewals</span>
            </div>
        </Card>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 24, marginBottom: 4, padding: "0 4px" }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: T.text.secondary, textTransform: "uppercase", letterSpacing: "0.06em", lineHeight: "44px" }}>Categories</span>
            <button onClick={() => {
                const allCol = Object.values(collapsedSections).every(Boolean);
                setCollapsedSections({ creditCards: !allCol, bankAccounts: !allCol, savingsAccounts: !allCol, investments: !allCol, debts: !allCol, savingsGoals: !allCol, otherAssets: !allCol });
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
                                <div style={{ padding: "14px 18px" }}>
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
                                                        placeholder="Limit" aria-label="Credit limit" style={{ paddingLeft: 28, fontFamily: T.font.mono, fontWeight: 600 }} />
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <input value={editForm.nickname} onChange={e => setEditForm(p => ({ ...p, nickname: e.target.value }))}
                                                        placeholder="Nickname (e.g. 'Daily Driver')" aria-label="Card nickname" style={{ width: "100%", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                                                </div>
                                            </div>
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
                                            <input value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))}
                                                placeholder="Notes" aria-label="Card notes" style={{ width: "100%", fontSize: 13, padding: "10px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, outline: "none", boxSizing: "border-box", marginTop: 2 }} />

                                            {/* Payment tracking */}
                                            <div style={{ paddingTop: 10, borderTop: `1px solid ${T.border.subtle}`, marginTop: 4 }}>
                                                <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 700, display: "block", marginBottom: 6 }}>PAYMENT TRACKING</span>
                                                <div style={{ display: "flex", gap: 6 }}>
                                                    <div style={{ flex: 1 }}>
                                                        <span style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono, display: "block", marginBottom: 3 }}>STMT CLOSES</span>
                                                        <input type="number" inputMode="decimal" pattern="[0-9]*" min="1" max="31" value={editForm.statementCloseDay} onChange={e => setEditForm(p => ({ ...p, statementCloseDay: e.target.value }))}
                                                            placeholder="Day" aria-label="Statement close day" style={{ width: "100%", padding: "8px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <span style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono, display: "block", marginBottom: 3 }}>PMT DUE</span>
                                                        <input type="number" inputMode="decimal" pattern="[0-9]*" min="1" max="31" value={editForm.paymentDueDay} onChange={e => setEditForm(p => ({ ...p, paymentDueDay: e.target.value }))}
                                                            placeholder="Day" aria-label="Payment due day" style={{ width: "100%", padding: "8px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                                                    </div>
                                                    <div style={{ flex: 1, position: "relative" }}>
                                                        <span style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono, display: "block", marginBottom: 3 }}>MIN PMT</span>
                                                        <span style={{ position: "absolute", left: 8, bottom: 9, color: T.text.dim, fontSize: 11, fontWeight: 600 }}>$</span>
                                                        <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={editForm.minPayment} onChange={e => setEditForm(p => ({ ...p, minPayment: e.target.value }))}
                                                            placeholder="35" aria-label="Minimum payment" style={{ width: "100%", padding: "8px 8px 8px 18px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                                                    </div>
                                                </div>
                                            </div>

                                            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                                                <button onClick={() => saveEdit(card.id)} style={{
                                                    flex: 1, padding: 12, borderRadius: T.radius.sm, border: "none",
                                                    background: T.accent.primaryDim, color: T.accent.primary, fontSize: 11, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                                                }}>
                                                    <Check size={14} />Save</button>
                                                <button onClick={() => { if (window.confirm(`Delete "${card.nickname || card.name}"?`)) removeCard(card.id); }} style={{
                                                    flex: 1, padding: 12, borderRadius: T.radius.sm, border: "none", background: T.status.redDim, color: T.status.red, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                                                }}>Delete</button>
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
                                                    width: 36, height: 36, borderRadius: T.radius.md,
                                                    border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.dim,
                                                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
                                                }}>
                                                    <Edit3 size={11} /></button>
                                                <button onClick={() => { if (window.confirm(`Delete "${card.nickname || card.name}"?`)) removeCard(card.id); }} style={{
                                                    width: 36, height: 36, borderRadius: T.radius.md,
                                                    border: `1px solid ${T.status.red}30`, background: `${T.status.red}10`, color: T.status.red,
                                                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                                                    transition: "all 0.2s"
                                                }}>
                                                    <X size={13} /></button>
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
                                        <div style={{ padding: "12px 18px" }}>
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
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <span style={{ fontSize: 12, fontWeight: 600, color: T.text.primary }}>{acct.name}</span>
                                                        <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                                                            {acct.apy > 0 && <Badge variant="outline" style={{ fontSize: 8, padding: "1px 5px", color: T.status.blue, borderColor: `${T.status.blue}40` }}>{acct.apy}% APY</Badge>}
                                                            {acct.notes && <Mono size={10} color={T.text.dim}>{acct.notes}</Mono>}
                                                        </div>
                                                    </div>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                                        <Mono size={14} weight={900} color={acct._plaidBalance != null ? T.status.blue : T.text.muted}>{acct._plaidBalance != null ? fmt(acct._plaidBalance) : "\u2014"}</Mono>
                                                        <button onClick={() => startEditBank(acct)} style={{ width: 36, height: 36, borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.dim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Edit3 size={13} /></button>
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
                                    <div style={{ padding: "12px 18px" }}>
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
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <span style={{ fontSize: 12, fontWeight: 600, color: T.text.primary }}>{acct.name}</span>
                                                    <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                                                        {acct.apy > 0 && <Badge variant="outline" style={{ fontSize: 8, padding: "1px 5px", color: T.accent.emerald, borderColor: `${T.accent.emerald}40` }}>{acct.apy}% APY</Badge>}
                                                        {acct.notes && <Mono size={10} color={T.text.dim}>{acct.notes}</Mono>}
                                                    </div>
                                                </div>
                                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                                    <Mono size={14} weight={900} color={acct._plaidBalance != null ? T.accent.emerald : T.text.muted}>{acct._plaidBalance != null ? fmt(acct._plaidBalance) : "\u2014"}</Mono>
                                                    <button onClick={() => startEditBank(acct)} style={{ width: 36, height: 36, borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.dim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Edit3 size={13} /></button>
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
                <button onClick={(e) => { e.stopPropagation(); handleRefreshPrices(); }} disabled={refreshingPrices} title="Refresh prices" style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: refreshingPrices ? T.text.muted : T.accent.emerald, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", opacity: refreshingPrices ? 0.6 : 1 }}>
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
                    const plaidItems = (financialConfig?.plaidInvestments || []).filter(pi => pi.bucket === key);

                    const manualValue = items.reduce((s, h) => s + ((investPrices[h.symbol]?.price || 0) * (h.shares || 0)), 0);
                    const plaidValue = plaidItems.reduce((s, pi) => s + (pi._plaidBalance || 0), 0);
                    const sectionValue = manualValue + plaidValue;

                    const percentOfTotal = investTotalValue > 0 ? (sectionValue / investTotalValue) * 100 : 0;
                    const totalCount = items.length + plaidItems.length;
                    const isCollapsed = collapsedInvest[key];
                    return <Card key={key} animate variant="glass" className="hover-lift" style={{ marginBottom: 16, padding: 0, overflow: "hidden", borderLeft: `4px solid ${color}`, position: "relative" }}>
                        <div style={{ position: "absolute", top: -40, right: -40, width: 80, height: 80, background: color, filter: "blur(40px)", opacity: 0.1, borderRadius: "50%", pointerEvents: "none" }} />
                        <div onClick={() => setCollapsedInvest(p => ({ ...p, [key]: !isCollapsed }))} style={{ padding: "16px 18px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", cursor: "pointer", background: `linear-gradient(90deg, ${color}08, transparent)` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{ padding: 6, borderRadius: 8, background: color, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 12px ${color}40` }}>
                                    <TrendingUp size={14} color={T.bg.card} strokeWidth={2.5} />
                                </div>
                                <span style={{ fontSize: 13, fontWeight: 800, color, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
                                <Badge variant="outline" style={{ fontSize: 10, color, borderColor: `${color}40` }}>{totalCount} holding{totalCount !== 1 ? "s" : ""}</Badge>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                {sectionValue > 0 && <Mono size={15} weight={800} color={color}>{fmt(sectionValue)}</Mono>}
                                {isCollapsed ? <ChevronDown size={16} color={T.text.dim} className="chevron-animated" data-open="false" /> : <ChevronDown size={16} color={T.text.dim} className="chevron-animated" data-open="true" />}
                            </div>
                            {/* Dynamic progress bar underneath */}
                            {sectionValue > 0 && <div style={{ width: "100%", height: 3, background: `${T.border.default}`, borderRadius: 2, marginTop: 12, overflow: "hidden", display: "flex" }}>
                                <div style={{ width: `${percentOfTotal}%`, background: color, transition: "width 1s cubic-bezier(0.4, 0, 0.2, 1)" }} />
                            </div>}
                        </div>
                        <div className="collapse-section" data-collapsed={String(isCollapsed)}><div style={{ padding: "12px 18px" }}>
                            {totalCount === 0 ?
                                <p style={{ fontSize: 11, color: T.text.muted, textAlign: "center", padding: "8px 0" }}>No holdings yet — add your first below.</p> :
                                <>
                                    {plaidItems.map((pi, i) => (
                                        <div key={pi.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.border.subtle}` }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                <div style={{ padding: 6, borderRadius: 6, background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${color}30` }}>
                                                    <TrendingUp size={12} color={color} />
                                                </div>
                                                <div style={{ display: "flex", flexDirection: "column" }}>
                                                    <span style={{ fontSize: 12, fontWeight: 700, color: T.text.primary }}>{pi.name}</span>
                                                    <span style={{ fontSize: 10, color: T.text.dim }}>{pi.institution}</span>
                                                </div>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <Mono size={13} weight={800} color={color}>{fmt(pi._plaidBalance)}</Mono>
                                                <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.status.green, boxShadow: `0 0 6px ${T.status.green}`, marginRight: 4 }} title="Synced with Plaid" />
                                            </div>
                                        </div>
                                    ))}
                                    {items.sort((a, b) => (a.symbol || "").localeCompare(b.symbol || "")).map((h, i) => {
                                        const price = investPrices[h.symbol];
                                        return <div key={`${h.symbol}-${i}`} style={{ borderBottom: i === items.length - 1 ? "none" : `1px solid ${T.border.subtle}` }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px" }}>
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
                                                        if (window.confirm(`Delete ${h.symbol}?`)) {
                                                            const cur = financialConfig?.holdings || {};
                                                            const updated = (cur[key] || []).filter((_, idx) => idx !== i);
                                                            setFinancialConfig({ ...financialConfig, holdings: { ...cur, [key]: updated } });
                                                        }
                                                    }} style={{ width: 28, height: 28, borderRadius: T.radius.md, border: "none", background: "transparent", color: T.text.dim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", marginLeft: 4 }}>
                                                        <Trash2 size={13} />
                                                    </button>}
                                                </div>
                                            </div>
                                        </div>;
                                    })}

                                    {/* Inline Add Holding mapped to bottom sheet */}
                                    {setFinancialConfig && <div style={{ marginTop: items.length > 0 ? 12 : 0, paddingTop: items.length > 0 ? 12 : 0, borderTop: items.length > 0 ? `1px solid ${T.border.subtle}` : "none" }}>
                                        <button onClick={() => openSheet('invest')} className="hover-lift" style={{
                                            width: "100%", padding: 12, borderRadius: T.radius.sm,
                                            border: `1px dashed ${color}60`, background: `${color}05`,
                                            color: color, fontSize: 12, fontWeight: 800, cursor: "pointer",
                                            display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                                        }}>
                                            <Plus size={14} /> Add to {label}
                                        </button>
                                    </div>}
                                </>}
                        </div></div>
                    </Card>;
                })}
            </>
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
        {savingsGoalsSection}
        {otherAssetsSection}
        {debtsSection}

        {/* ═══ UNIFIED ADD BOTTOM SHEET ═══ */}
        {showAddSheet && createPortal(
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
                                    <button onClick={(e) => { haptic.medium(); handlePlaidConnect(e); }} disabled={plaidLoading} style={{
                                        width: "100%", padding: "14px", borderRadius: T.radius.md, border: "none", cursor: plaidLoading ? "wait" : "pointer",
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
                                        { id: "debt", icon: AlertTriangle, label: "Debt & Loan", color: T.status.amber },
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
                                {addForm.cardChoice === "__other__" && <input value={addForm.customName} onChange={e => setAddForm(p => ({ ...p, customName: e.target.value }))} placeholder="Card name" className="app-input" style={{ padding: "12px 14px", borderRadius: T.radius.md, border: `1.5px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, outline: "none", transition: "all 0.2s" }} onFocus={e => { e.target.style.borderColor = T.accent.primary; e.target.style.boxShadow = `0 0 0 3px ${T.accent.primary}30`; }} onBlur={e => { e.target.style.borderColor = T.border.default; e.target.style.boxShadow = "none"; }} />}
                                <div style={{ display: "flex", gap: 8 }}>
                                    <div style={{ flex: 1, position: "relative" }}><span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.accent.primary, fontSize: 14, fontWeight: 700 }}>$</span><input type="number" inputMode="decimal" value={addForm.limit} onChange={e => setAddForm(p => ({ ...p, limit: e.target.value }))} placeholder="Limit" className="app-input" style={{ width: "100%", padding: "12px 14px 12px 28px", borderRadius: T.radius.md, border: `1.5px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, boxSizing: "border-box", outline: "none", transition: "all 0.2s" }} onFocus={e => { e.target.style.borderColor = T.accent.primary; e.target.style.boxShadow = `0 0 0 3px ${T.accent.primary}30`; }} onBlur={e => { e.target.style.borderColor = T.border.default; e.target.style.boxShadow = "none"; }} /></div>
                                    <div style={{ flex: 1, position: "relative" }}><span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.accent.primary, fontSize: 14, fontWeight: 700 }}>$</span><input type="number" inputMode="decimal" value={addForm.annualFee} onChange={e => setAddForm(p => ({ ...p, annualFee: e.target.value }))} placeholder="Annual Fee" className="app-input" style={{ width: "100%", padding: "12px 14px 12px 28px", borderRadius: T.radius.md, border: `1.5px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, boxSizing: "border-box", outline: "none", transition: "all 0.2s" }} onFocus={e => { e.target.style.borderColor = T.accent.primary; e.target.style.boxShadow = `0 0 0 3px ${T.accent.primary}30`; }} onBlur={e => { e.target.style.borderColor = T.border.default; e.target.style.boxShadow = "none"; }} /></div>
                                </div>
                                <input value={addForm.nickname} onChange={e => setAddForm(p => ({ ...p, nickname: e.target.value }))} placeholder="Nickname (optional)" className="app-input" style={{ padding: "12px 14px", borderRadius: T.radius.md, border: `1.5px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, outline: "none", transition: "all 0.2s" }} onFocus={e => { e.target.style.borderColor = T.accent.primary; e.target.style.boxShadow = `0 0 0 3px ${T.accent.primary}30`; }} onBlur={e => { e.target.style.borderColor = T.border.default; e.target.style.boxShadow = "none"; }} />
                                <button className="hover-btn" onClick={() => { if (!canAdd) return; addCard(); closeSheet(); setAddForm({ institution: "", cardChoice: "", customName: "", nickname: "", limit: "", annualFee: "", annualFeeDue: "", annualFeeWaived: false, notes: "", apr: "", hasPromoApr: false, promoAprAmount: "", promoAprExp: "", statementCloseDay: "", paymentDueDay: "", minPayment: "" }); }} disabled={!canAdd} style={{ padding: "14px", borderRadius: T.radius.md, border: "none", background: canAdd ? T.accent.gradient : T.bg.card, color: canAdd ? "#fff" : T.text.muted, fontSize: 14, fontWeight: 800, cursor: canAdd ? "pointer" : "not-allowed", transition: "all .2s" }}>Add Card</button>
                            </div>;
                        })()}

                        {/* ── BANK FORM ── */}
                        {addSheetStep === "bank" && (() => {
                            const bProds = getBankProducts(addBankForm.bank);
                            const bList = addBankForm.accountType === "checking" ? bProds.checking : bProds.savings;
                            const canAdd = !!(addBankForm.bank && (addBankForm.productName === "__other__" ? addBankForm.customName?.trim() : addBankForm.productName?.trim()));
                            return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                <SearchableSelect value={addBankForm.bank} onChange={v => setAddBankForm(p => ({ ...p, bank: v, productName: "", customName: "" }))} placeholder="Bank / Institution" options={getBankNames().map(n => ({ value: n, label: n }))} />
                                <div style={{ display: "flex", background: T.bg.card, borderRadius: T.radius.sm, padding: 3, marginBottom: 16 }}>
                                    {["checking", "savings"].map(t => (<button key={t} onClick={() => { haptic.selection(); setAddBankForm(p => ({ ...p, accountType: t, productName: "", customName: "" })); }} style={{ flex: 1, padding: "11px", border: "none", background: addBankForm.accountType === t ? T.status.blue : T.bg.card, color: addBankForm.accountType === t ? "#fff" : T.text.secondary, fontSize: 13, fontWeight: 700, cursor: "pointer", textTransform: "capitalize" }}>{t}</button>))}
                                </div>
                                {addBankForm.bank && bList.length > 0 && <SearchableSelect value={addBankForm.productName} onChange={v => setAddBankForm(p => ({ ...p, productName: v }))} placeholder="Select Account Product" options={[...bList.map(n => ({ value: n, label: n })), { value: "__other__", label: "Other…" }]} />}
                                {(!addBankForm.bank || bList.length === 0 || addBankForm.productName === "__other__") && <input value={addBankForm.customName} onChange={e => setAddBankForm(p => ({ ...p, customName: e.target.value }))} placeholder="Account name" className="app-input" style={{ padding: "12px 14px", borderRadius: T.radius.md, border: `1.5px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, outline: "none", transition: "all 0.2s" }} onFocus={e => { e.target.style.borderColor = T.status.blue; e.target.style.boxShadow = `0 0 0 3px ${T.status.blue}30`; }} onBlur={e => { e.target.style.borderColor = T.border.default; e.target.style.boxShadow = "none"; }} />}
                                <div style={{ position: "relative" }}><input type="number" inputMode="decimal" step="0.01" value={addBankForm.apy} onChange={e => setAddBankForm(p => ({ ...p, apy: e.target.value }))} placeholder="APY (optional)" className="app-input" style={{ width: "100%", padding: "12px 36px 12px 14px", borderRadius: T.radius.md, border: `1.5px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, boxSizing: "border-box", outline: "none", transition: "all 0.2s" }} onFocus={e => { e.target.style.borderColor = T.status.blue; e.target.style.boxShadow = `0 0 0 3px ${T.status.blue}30`; }} onBlur={e => { e.target.style.borderColor = T.border.default; e.target.style.boxShadow = "none"; }} /><span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: T.status.blue, fontSize: 13, fontWeight: 700 }}>%</span></div>
                                <button className="hover-btn" onClick={() => { if (!canAdd) return; addBankAccount(); closeSheet(); }} disabled={!canAdd} style={{ padding: "14px", borderRadius: T.radius.md, border: "none", background: canAdd ? `linear-gradient(135deg, ${T.status.blue}, #1a56db)` : T.bg.card, color: canAdd ? "#fff" : T.text.muted, fontSize: 14, fontWeight: 800, cursor: canAdd ? "pointer" : "not-allowed", transition: "all .2s" }}>Add Account</button>
                            </div>;
                        })()}

                        {/* ── INVESTMENT FORM ── */}
                        {addSheetStep === "invest" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                    {[
                                        { key: "roth", label: "Roth IRA", color: T.accent.primary },
                                        { key: "k401", label: "401(k)", color: T.status.blue },
                                        { key: "brokerage", label: "Brokerage", color: T.accent.emerald },
                                        { key: "hsa", label: "HSA", color: "#06B6D4" },
                                        { key: "crypto", label: "Crypto", color: T.status.amber },
                                    ].map(o => (
                                        <button key={o.key} onClick={() => setAddInvestFormKey(o.key)} style={{ padding: "7px 14px", borderRadius: 99, border: `1.5px solid ${addInvestFormKey === o.key ? o.color : T.border.default}`, background: addInvestFormKey === o.key ? `${o.color}18` : "transparent", color: addInvestFormKey === o.key ? o.color : T.text.secondary, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{o.label}</button>
                                    ))}
                                </div>
                                <SearchableSelect value={addInvestFormSym} onChange={setAddInvestFormSym} placeholder={addInvestFormKey === "crypto" ? "Search crypto…" : "Search ticker…"} options={[...getTickerOptions(addInvestFormKey).map(c => ({ value: c.symbol, label: `${c.symbol.replace("-USD", "")} — ${c.name}` })), { value: "__custom__", label: "Custom ticker…" }]} />
                                {addInvestFormSym === "__custom__" && <input placeholder="Enter ticker symbol" onChange={e => setAddInvestFormSym(e.target.value.toUpperCase())} className="app-input" style={{ padding: "12px 14px", borderRadius: T.radius.md, border: `1.5px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, outline: "none", transition: "all 0.2s" }} onFocus={e => { e.target.style.borderColor = T.accent.emerald; e.target.style.boxShadow = `0 0 0 3px ${T.accent.emerald}30`; }} onBlur={e => { e.target.style.borderColor = T.border.default; e.target.style.boxShadow = "none"; }} />}
                                <input type="number" inputMode="decimal" value={addInvestFormShr} onChange={e => setAddInvestFormShr(e.target.value)} placeholder={addInvestFormKey === "crypto" ? "Amount" : "Shares"} className="app-input" style={{ padding: "12px 14px", borderRadius: T.radius.md, border: `1.5px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, outline: "none", transition: "all 0.2s" }} onFocus={e => { e.target.style.borderColor = T.accent.emerald; e.target.style.boxShadow = `0 0 0 3px ${T.accent.emerald}30`; }} onBlur={e => { e.target.style.borderColor = T.border.default; e.target.style.boxShadow = "none"; }} />
                                <button className="hover-btn" onClick={() => {
                                    const canAdd = !!(addInvestFormSym?.trim() && parseFloat(addInvestFormShr || 0) > 0);
                                    if (!canAdd) return;
                                    haptic.success();
                                    const finalSym = addInvestFormSym.toUpperCase().replace("-USD", "") + (addInvestFormKey === "crypto" ? "-USD" : "");
                                    const cur = financialConfig?.holdings || {};
                                    setFinancialConfig({ ...financialConfig, holdings: { ...cur, [addInvestFormKey]: [...(cur[addInvestFormKey] || []), { symbol: finalSym, shares: parseFloat(addInvestFormShr) }] } });
                                    setCollapsedSections(p => ({ ...p, investments: false }));
                                    setAddInvestFormKey("brokerage"); setAddInvestFormSym(""); setAddInvestFormShr("");
                                    closeSheet();
                                }} disabled={!(!!(addInvestFormSym?.trim() && parseFloat(addInvestFormShr || 0) > 0))} style={{ padding: "14px", borderRadius: T.radius.md, border: "none", background: !!(addInvestFormSym?.trim() && parseFloat(addInvestFormShr || 0) > 0) ? `linear-gradient(135deg, ${T.accent.emerald}, #0ca678)` : T.bg.card, color: !!(addInvestFormSym?.trim() && parseFloat(addInvestFormShr || 0) > 0) ? "#fff" : T.text.muted, fontSize: 14, fontWeight: 800, cursor: !!(addInvestFormSym?.trim() && parseFloat(addInvestFormShr || 0) > 0) ? "pointer" : "not-allowed", transition: "all .2s" }}>Add Holding</button>
                            </div>
                        )}

                        {/* ── SAVINGS GOAL FORM ── */}
                        {addSheetStep === "goal" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                <input value={addGoalForm.name} onChange={e => setAddGoalForm(p => ({ ...p, name: e.target.value }))} placeholder="Goal name (e.g. Emergency Fund)" className="app-input" style={{ padding: "12px 14px", borderRadius: T.radius.md, border: `1.5px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, outline: "none", transition: "all 0.2s" }} onFocus={e => { e.target.style.borderColor = T.accent.primary; e.target.style.boxShadow = `0 0 0 3px ${T.accent.primary}30`; }} onBlur={e => { e.target.style.borderColor = T.border.default; e.target.style.boxShadow = "none"; }} />
                                <div style={{ display: "flex", gap: 8 }}>
                                    <div style={{ flex: 1, position: "relative" }}><span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.accent.primary, fontSize: 14, fontWeight: 700 }}>$</span><input type="number" inputMode="decimal" value={addGoalForm.targetAmount} onChange={e => setAddGoalForm(p => ({ ...p, targetAmount: e.target.value }))} placeholder="Target" className="app-input" style={{ width: "100%", padding: "12px 14px 12px 28px", borderRadius: T.radius.md, border: `1.5px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, boxSizing: "border-box", outline: "none", transition: "all 0.2s" }} onFocus={e => { e.target.style.borderColor = T.accent.primary; e.target.style.boxShadow = `0 0 0 3px ${T.accent.primary}30`; }} onBlur={e => { e.target.style.borderColor = T.border.default; e.target.style.boxShadow = "none"; }} /></div>
                                    <div style={{ flex: 1, position: "relative" }}><span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.accent.primary, fontSize: 14, fontWeight: 700 }}>$</span><input type="number" inputMode="decimal" value={addGoalForm.currentAmount} onChange={e => setAddGoalForm(p => ({ ...p, currentAmount: e.target.value }))} placeholder="Current" className="app-input" style={{ width: "100%", padding: "12px 14px 12px 28px", borderRadius: T.radius.md, border: `1.5px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, boxSizing: "border-box", outline: "none", transition: "all 0.2s" }} onFocus={e => { e.target.style.borderColor = T.accent.primary; e.target.style.boxShadow = `0 0 0 3px ${T.accent.primary}30`; }} onBlur={e => { e.target.style.borderColor = T.border.default; e.target.style.boxShadow = "none"; }} /></div>
                                </div>
                                <input type="date" value={addGoalForm.targetDate} onChange={e => setAddGoalForm(p => ({ ...p, targetDate: e.target.value }))} className="app-input" style={{ padding: "12px 14px", borderRadius: T.radius.md, border: `1.5px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, outline: "none", transition: "all 0.2s", fontFamily: T.font.sans, fontWeight: 700 }} onFocus={e => { e.target.style.borderColor = T.accent.primary; e.target.style.boxShadow = `0 0 0 3px ${T.accent.primary}30`; }} onBlur={e => { e.target.style.borderColor = T.border.default; e.target.style.boxShadow = "none"; }} />
                                <button className="hover-btn" onClick={() => {
                                    if (!addGoalForm.name.trim()) return;
                                    haptic.success();
                                    setFinancialConfig({ ...financialConfig, savingsGoals: [...(financialConfig?.savingsGoals || []), { name: addGoalForm.name.trim(), targetAmount: parseFloat(addGoalForm.targetAmount) || 0, currentAmount: parseFloat(addGoalForm.currentAmount) || 0, targetDate: addGoalForm.targetDate }] });
                                    setCollapsedSections(p => ({ ...p, savingsGoals: false }));
                                    setAddGoalForm({ name: "", targetAmount: "", currentAmount: "", targetDate: "" });
                                    closeSheet();
                                }} disabled={!addGoalForm.name.trim()} style={{ padding: "14px", borderRadius: T.radius.md, border: "none", background: !!addGoalForm.name.trim() ? T.accent.gradient : T.bg.card, color: !!addGoalForm.name.trim() ? "#fff" : T.text.muted, fontSize: 14, fontWeight: 800, cursor: !!addGoalForm.name.trim() ? "pointer" : "not-allowed", transition: "all .2s" }}>Add Goal</button>
                            </div>
                        )}

                        {/* ── DEBT FORM ── */}
                        {addSheetStep === "debt" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                <input value={addDebtForm.name} onChange={e => setAddDebtForm(p => ({ ...p, name: e.target.value }))} placeholder="Debt name (e.g. Auto Loan)" className="app-input" style={{ padding: "12px 14px", borderRadius: T.radius.md, border: `1.5px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, outline: "none", transition: "all 0.2s" }} onFocus={e => { e.target.style.borderColor = T.status.amber; e.target.style.boxShadow = `0 0 0 3px ${T.status.amber}30`; }} onBlur={e => { e.target.style.borderColor = T.border.default; e.target.style.boxShadow = "none"; }} />
                                <div style={{ display: "flex", gap: 8 }}>
                                    {[
                                        { key: "auto", label: "Auto" },
                                        { key: "student", label: "Student" },
                                        { key: "mortgage", label: "Mortgage" },
                                        { key: "personal", label: "Personal" },
                                        { key: "medical", label: "Medical" }
                                    ].map(t => (
                                        <button key={t.key} onClick={() => setAddDebtForm(p => ({ ...p, type: t.key }))} style={{ flex: 1, padding: "8px 0", borderRadius: T.radius.sm, border: `1px solid ${addDebtForm.type === t.key ? T.status.amber : T.border.default}`, background: addDebtForm.type === t.key ? `${T.status.amber}18` : T.bg.elevated, color: addDebtForm.type === t.key ? T.status.amber : T.text.secondary, fontSize: 11, fontWeight: 700, cursor: "pointer", boxSizing: "border-box" }}>{t.label}</button>
                                    ))}
                                </div>
                                <div style={{ position: "relative" }}><span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.status.amber, fontSize: 14, fontWeight: 700 }}>$</span><input type="number" inputMode="decimal" value={addDebtForm.balance} onChange={e => setAddDebtForm(p => ({ ...p, balance: e.target.value }))} placeholder="Current Balance" className="app-input" style={{ width: "100%", padding: "12px 14px 12px 28px", borderRadius: T.radius.md, border: `1.5px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, boxSizing: "border-box", outline: "none", transition: "all 0.2s" }} onFocus={e => { e.target.style.borderColor = T.status.amber; e.target.style.boxShadow = `0 0 0 3px ${T.status.amber}30`; }} onBlur={e => { e.target.style.borderColor = T.border.default; e.target.style.boxShadow = "none"; }} /></div>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <div style={{ flex: 1, position: "relative" }}><input type="number" inputMode="decimal" value={addDebtForm.apr} onChange={e => setAddDebtForm(p => ({ ...p, apr: e.target.value }))} placeholder="Interest APR" className="app-input" style={{ width: "100%", padding: "12px 28px 12px 14px", borderRadius: T.radius.md, border: `1.5px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, boxSizing: "border-box", outline: "none", transition: "all 0.2s" }} onFocus={e => { e.target.style.borderColor = T.status.amber; e.target.style.boxShadow = `0 0 0 3px ${T.status.amber}30`; }} onBlur={e => { e.target.style.borderColor = T.border.default; e.target.style.boxShadow = "none"; }} /><span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: T.text.secondary, fontSize: 13, fontWeight: 700 }}>%</span></div>
                                    <div style={{ flex: 1, position: "relative" }}><span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.text.secondary, fontSize: 12, fontWeight: 700 }}>Min $</span><input type="number" inputMode="decimal" value={addDebtForm.minPayment} onChange={e => setAddDebtForm(p => ({ ...p, minPayment: e.target.value }))} placeholder="0.00" className="app-input" style={{ width: "100%", padding: "12px 14px 12px 48px", borderRadius: T.radius.md, border: `1.5px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, boxSizing: "border-box", outline: "none", transition: "all 0.2s" }} onFocus={e => { e.target.style.borderColor = T.status.amber; e.target.style.boxShadow = `0 0 0 3px ${T.status.amber}30`; }} onBlur={e => { e.target.style.borderColor = T.border.default; e.target.style.boxShadow = "none"; }} /></div>
                                </div>
                                <button className="hover-btn" onClick={() => {
                                    if (!addDebtForm.name.trim()) return;
                                    haptic.success();
                                    setFinancialConfig({ ...financialConfig, nonCardDebts: [...(financialConfig?.nonCardDebts || []), { id: "debt_" + Date.now(), name: addDebtForm.name.trim(), type: addDebtForm.type, balance: parseFloat(addDebtForm.balance) || 0, apr: parseFloat(addDebtForm.apr) || 0, minPayment: parseFloat(addDebtForm.minPayment) || 0 }] });
                                    setCollapsedSections(p => ({ ...p, debts: false }));
                                    setAddDebtForm({ name: "", type: "personal", balance: "", apr: "", minPayment: "" });
                                    closeSheet();
                                }} disabled={!addDebtForm.name.trim()} style={{ padding: "14px", borderRadius: T.radius.md, border: "none", background: !!addDebtForm.name.trim() ? `linear-gradient(135deg, ${T.status.amber}, #d35400)` : T.bg.card, color: !!addDebtForm.name.trim() ? "#fff" : T.text.muted, fontSize: 14, fontWeight: 800, cursor: !!addDebtForm.name.trim() ? "pointer" : "not-allowed", transition: "all .2s" }}>Add Debt</button>
                            </div>
                        )}

                        {/* ── OTHER ASSET FORM ── */}
                        {addSheetStep === "asset" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                <input value={addAssetForm.name} onChange={e => setAddAssetForm(p => ({ ...p, name: e.target.value }))} placeholder="Asset name (e.g. Vehicle, Property)" className="app-input" style={{ padding: "12px 14px", borderRadius: T.radius.md, border: `1.5px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, outline: "none", transition: "all 0.2s" }} onFocus={e => { e.target.style.borderColor = T.accent.copper; e.target.style.boxShadow = `0 0 0 3px ${T.accent.copper}30`; }} onBlur={e => { e.target.style.borderColor = T.border.default; e.target.style.boxShadow = "none"; }} />
                                <div style={{ position: "relative" }}><span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.accent.copper, fontSize: 14, fontWeight: 700 }}>$</span><input type="number" inputMode="decimal" value={addAssetForm.value} onChange={e => setAddAssetForm(p => ({ ...p, value: e.target.value }))} placeholder="Estimated value" className="app-input" style={{ width: "100%", padding: "12px 14px 12px 28px", borderRadius: T.radius.md, border: `1.5px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, boxSizing: "border-box", outline: "none", transition: "all 0.2s" }} onFocus={e => { e.target.style.borderColor = T.accent.copper; e.target.style.boxShadow = `0 0 0 3px ${T.accent.copper}30`; }} onBlur={e => { e.target.style.borderColor = T.border.default; e.target.style.boxShadow = "none"; }} /></div>
                                <button onClick={() => setAddAssetForm(p => ({ ...p, liquid: !p.liquid }))} style={{ padding: "12px 16px", borderRadius: T.radius.md, border: `1.5px solid ${addAssetForm.liquid ? T.accent.emerald : T.border.default}`, background: addAssetForm.liquid ? `${T.accent.emerald}12` : "transparent", color: addAssetForm.liquid ? T.accent.emerald : T.text.secondary, fontSize: 13, fontWeight: 700, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8 }}>{addAssetForm.liquid ? "💧" : "🔒"} {addAssetForm.liquid ? "Liquid (can access quickly)" : "Illiquid (locked up / long-term)"}</button>
                                <button className="hover-btn" onClick={() => {
                                    if (!addAssetForm.name.trim()) return;
                                    haptic.success();
                                    setFinancialConfig({ ...financialConfig, otherAssets: [...(financialConfig?.otherAssets || []), { name: addAssetForm.name.trim(), value: parseFloat(addAssetForm.value) || 0, liquid: addAssetForm.liquid }] });
                                    setCollapsedSections(p => ({ ...p, otherAssets: false }));
                                    setAddAssetForm({ name: "", value: "", liquid: false });
                                    closeSheet();
                                }} disabled={!addAssetForm.name.trim()} style={{ padding: "14px", borderRadius: T.radius.md, border: "none", background: !!addAssetForm.name.trim() ? `linear-gradient(135deg, ${T.accent.copper}, #e67e22)` : T.bg.card, color: !!addAssetForm.name.trim() ? "#fff" : T.text.muted, fontSize: 14, fontWeight: 800, cursor: !!addAssetForm.name.trim() ? "pointer" : "not-allowed", transition: "all .2s" }}>Add Asset</button>
                            </div>
                        )}

                    </div>
                </div>
            </>
            , document.body)}
    </div>;
})
