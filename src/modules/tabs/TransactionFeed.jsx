// ═══════════════════════════════════════════════════════════════
// TransactionFeed — Unified Plaid Transaction Viewer
// Premium Apple-Wallet-style UI with date grouping, search,
// filtering, and CSV/JSON export.
// ═══════════════════════════════════════════════════════════════

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
    ArrowLeft, Search, X, Download, Filter, ArrowUpRight, ArrowDownLeft,
    ShoppingCart, Utensils, Car, Home, Zap, Briefcase, Heart, Plane,
    GraduationCap, Gamepad2, Wifi, CreditCard, Building2, Banknote,
    HelpCircle, Clock, FileText, FileSpreadsheet, ChevronDown, RefreshCw,
    TrendingUp, TrendingDown, AlertCircle
} from "lucide-react";
import { T } from "../constants.js";
import { Card } from "../ui.jsx";
import { nativeExport } from "../utils.js";
import { getStoredTransactions, fetchAllTransactions } from "../plaid.js";
import { haptic } from "../haptics.js";
import "./TransactionFeed.css";

// ── Category → Icon + Color Mapping ──────────────────────────
const CATEGORY_MAP = {
    "food and drink": { icon: Utensils, color: "#F59E0B", bg: "rgba(245,158,11,0.10)" },
    "shops": { icon: ShoppingCart, color: "#8B5CF6", bg: "rgba(139,92,246,0.10)" },
    "travel": { icon: Plane, color: "#3B82F6", bg: "rgba(59,130,246,0.10)" },
    "transportation": { icon: Car, color: "#6366F1", bg: "rgba(99,102,241,0.10)" },
    "transfer": { icon: ArrowUpRight, color: "#6B7280", bg: "rgba(107,114,128,0.10)" },
    "payment": { icon: CreditCard, color: "#7B5EA7", bg: "rgba(123,94,167,0.10)" },
    "recreation": { icon: Gamepad2, color: "#EC4899", bg: "rgba(236,72,153,0.10)" },
    "service": { icon: Briefcase, color: "#14B8A6", bg: "rgba(20,184,166,0.10)" },
    "community": { icon: Heart, color: "#F43F5E", bg: "rgba(244,63,94,0.10)" },
    "healthcare": { icon: Heart, color: "#EF4444", bg: "rgba(239,68,68,0.10)" },
    "rent and utilities": { icon: Home, color: "#0EA5E9", bg: "rgba(14,165,233,0.10)" },
    "general merchandise": { icon: ShoppingCart, color: "#8B5CF6", bg: "rgba(139,92,246,0.10)" },
    "general services": { icon: Briefcase, color: "#14B8A6", bg: "rgba(20,184,166,0.10)" },
    "personal care": { icon: Heart, color: "#EC4899", bg: "rgba(236,72,153,0.10)" },
    "entertainment": { icon: Gamepad2, color: "#EC4899", bg: "rgba(236,72,153,0.10)" },
    "education": { icon: GraduationCap, color: "#2563EB", bg: "rgba(37,99,235,0.10)" },
    "home improvement": { icon: Home, color: "#0EA5E9", bg: "rgba(14,165,233,0.10)" },
    "income": { icon: Banknote, color: "#2ECC71", bg: "rgba(46,204,113,0.10)" },
    "loan payments": { icon: Building2, color: "#F97316", bg: "rgba(249,115,22,0.10)" },
    "bank fees": { icon: Building2, color: "#EF4444", bg: "rgba(239,68,68,0.10)" },
    "utilities": { icon: Zap, color: "#0EA5E9", bg: "rgba(14,165,233,0.10)" },
    "subscription": { icon: Wifi, color: "#A855F7", bg: "rgba(168,85,247,0.10)" },
};

function getCategoryMeta(category) {
    if (!category) return { icon: HelpCircle, color: T.text.dim, bg: "rgba(107,114,128,0.08)" };
    const key = category.toLowerCase().trim();
    return CATEGORY_MAP[key] || { icon: HelpCircle, color: T.text.dim, bg: "rgba(107,114,128,0.08)" };
}

// ── Date formatting helpers ──────────────────────────────────
function formatDateHeader(dateStr) {
    const d = new Date(dateStr + "T12:00:00"); // Avoid timezone shift
    const today = new Date();
    const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";

    return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function formatMoney(amount, isCredit) {
    const formatted = amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
    return isCredit ? `+${formatted}` : formatted;
}

// ── CSV builder ──────────────────────────────────────────────
function buildCSV(transactions) {
    const headers = ["Date", "Description", "Amount", "Type", "Category", "Account", "Institution", "Pending"];
    const rows = transactions.map(t => [
        t.date,
        `"${(t.description || "").replace(/"/g, '""')}"`,
        t.isCredit ? t.amount : -t.amount,
        t.isCredit ? "Credit" : "Debit",
        `"${t.category || ""}"`,
        `"${t.accountName || ""}"`,
        `"${t.institution || ""}"`,
        t.pending ? "Yes" : "No",
    ].join(","));
    return [headers.join(","), ...rows].join("\n");
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function TransactionFeed({ onClose }) {
    const [transactions, setTransactions] = useState([]);
    const [fetchedAt, setFetchedAt] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [activeCategory, setActiveCategory] = useState(null);
    const [activeAccount, setActiveAccount] = useState(null);
    const [showFilters, setShowFilters] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [visibleCount, setVisibleCount] = useState(50);
    const [slideOffset, setSlideOffset] = useState(0);
    const scrollRef = useRef(null);
    const searchRef = useRef(null);
    const swipeRef = useRef(null);
    const pullRef = useRef(null);
    const [pullDistance, setPullDistance] = useState(0);
    const [isPulling, setIsPulling] = useState(false);

    // ── Swipe-from-edge-to-dismiss (iOS native feel) ──
    const handleOverlayTouchStart = useCallback((e) => {
        const x = e.touches[0].clientX;
        if (x < 40) { // Left edge only
            swipeRef.current = { x, y: e.touches[0].clientY, t: Date.now() };
        } else {
            swipeRef.current = null;
        }
    }, []);

    const handleOverlayTouchMove = useCallback((e) => {
        if (!swipeRef.current) {
            // Pull-to-refresh logic
            if (scrollRef.current && scrollRef.current.scrollTop <= 0 && !refreshing) {
                const touch = e.touches[0];
                if (!pullRef.current) {
                    pullRef.current = { y: touch.clientY };
                    setIsPulling(true);
                }
                const dy = Math.max(0, touch.clientY - pullRef.current.y);
                setPullDistance(Math.min(dy * 0.5, 80));
            }
            return;
        }
        const dx = e.touches[0].clientX - swipeRef.current.x;
        if (dx > 0) {
            setSlideOffset(dx);
            e.preventDefault();
        }
    }, [refreshing]);

    const handleOverlayTouchEnd = useCallback((e) => {
        // Pull-to-refresh release
        if (pullRef.current) {
            if (pullDistance >= 60 && !refreshing) {
                handleRefreshFromPull();
            }
            pullRef.current = null;
            setIsPulling(false);
            setPullDistance(0);
        }
        // Swipe-back release
        if (!swipeRef.current) { setSlideOffset(0); return; }
        const dx = e.changedTouches[0].clientX - swipeRef.current.x;
        const dt = Date.now() - swipeRef.current.t;
        const velocity = dx / dt;
        swipeRef.current = null;
        if (dx > 100 || velocity > 0.5) {
            setSlideOffset(window.innerWidth);
            haptic.light();
            setTimeout(() => onClose(), 200);
        } else {
            setSlideOffset(0);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pullDistance, refreshing, onClose]);

    const handleRefreshFromPull = useCallback(async () => {
        setRefreshing(true);
        haptic.light();
        try {
            const result = await fetchAllTransactions(30);
            setTransactions(result.data || []);
            setFetchedAt(result.fetchedAt);
            if (window.toast) window.toast.success(`Synced ${(result.data || []).length} transactions`);
        } catch (e) {
            console.warn("[TransactionFeed] Pull refresh failed:", e);
            if (window.toast) window.toast.error("Failed to refresh transactions");
        } finally {
            setRefreshing(false);
        }
    }, []);

    // ── Load stored transactions on mount ──
    useEffect(() => {
        (async () => {
            try {
                const stored = await getStoredTransactions();
                if (stored?.data?.length) {
                    setTransactions(stored.data);
                    setFetchedAt(stored.fetchedAt);
                }
            } catch (e) {
                console.warn("[TransactionFeed] Failed to load:", e);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    // ── Refresh from Plaid ──
    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        haptic.light();
        try {
            const result = await fetchAllTransactions(30);
            setTransactions(result.data || []);
            setFetchedAt(result.fetchedAt);
            if (window.toast) window.toast.success(`Synced ${(result.data || []).length} transactions`);
        } catch (e) {
            console.warn("[TransactionFeed] Refresh failed:", e);
            if (window.toast) window.toast.error("Failed to refresh transactions");
        } finally {
            setRefreshing(false);
        }
    }, []);

    // ── Derived: unique categories & accounts ──
    const categories = useMemo(() => {
        const set = new Set(transactions.map(t => t.category).filter(Boolean));
        return [...set].sort();
    }, [transactions]);

    const accounts = useMemo(() => {
        const set = new Set(transactions.map(t => `${t.institution} - ${t.accountName}`).filter(s => s !== " - "));
        return [...set].sort();
    }, [transactions]);

    // ── Filtered transactions ──
    const filtered = useMemo(() => {
        let list = transactions;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(t =>
                (t.description || "").toLowerCase().includes(q) ||
                (t.category || "").toLowerCase().includes(q) ||
                (t.institution || "").toLowerCase().includes(q) ||
                (t.accountName || "").toLowerCase().includes(q)
            );
        }
        if (activeCategory) {
            list = list.filter(t => (t.category || "").toLowerCase() === activeCategory.toLowerCase());
        }
        if (activeAccount) {
            list = list.filter(t => `${t.institution} - ${t.accountName}` === activeAccount);
        }
        return list;
    }, [transactions, searchQuery, activeCategory, activeAccount]);

    // ── Group by date ──
    const grouped = useMemo(() => {
        const visible = filtered.slice(0, visibleCount);
        const map = new Map();
        for (const t of visible) {
            const key = t.date;
            if (!map.has(key)) map.set(key, { date: key, total: 0, creditTotal: 0, txns: [] });
            const group = map.get(key);
            group.txns.push(t);
            if (t.isCredit) group.creditTotal += t.amount;
            else group.total += t.amount;
        }
        return [...map.values()];
    }, [filtered, visibleCount]);

    // ── Summary stats ──
    const stats = useMemo(() => {
        const totalSpent = filtered.filter(t => !t.isCredit).reduce((s, t) => s + t.amount, 0);
        const totalReceived = filtered.filter(t => t.isCredit).reduce((s, t) => s + t.amount, 0);
        return { totalSpent, totalReceived, count: filtered.length };
    }, [filtered]);

    // ── Infinite scroll ──
    const handleScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
            setVisibleCount(prev => Math.min(prev + 30, filtered.length));
        }
    }, [filtered.length]);

    // ── Export handlers ──
    const handleExportCSV = useCallback(async () => {
        haptic.medium();
        setShowExportMenu(false);
        try {
            const csv = buildCSV(filtered);
            const dateStr = new Date().toISOString().split("T")[0];
            await nativeExport(`CatalystCash_Transactions_${dateStr}.csv`, csv, "text/csv");
        } catch (e) {
            if (window.toast) window.toast.error("Export failed");
        }
    }, [filtered]);

    const handleExportJSON = useCallback(async () => {
        haptic.medium();
        setShowExportMenu(false);
        try {
            const payload = { app: "Catalyst Cash", exportedAt: new Date().toISOString(), transactions: filtered };
            const dateStr = new Date().toISOString().split("T")[0];
            await nativeExport(`CatalystCash_Transactions_${dateStr}.json`, JSON.stringify(payload, null, 2), "application/json");
        } catch (e) {
            if (window.toast) window.toast.error("Export failed");
        }
    }, [filtered]);

    const clearFilters = useCallback(() => {
        setSearchQuery("");
        setActiveCategory(null);
        setActiveAccount(null);
        setShowFilters(false);
    }, []);

    const hasFilters = searchQuery || activeCategory || activeAccount;

    // ═══════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════
    return (
        <div
            onTouchStart={handleOverlayTouchStart}
            onTouchMove={handleOverlayTouchMove}
            onTouchEnd={handleOverlayTouchEnd}
            style={{
                position: "fixed", inset: 0, zIndex: 50,
                background: T.bg.base, display: "flex", flexDirection: "column",
                fontFamily: T.font.sans,
                transform: slideOffset > 0 ? `translateX(${slideOffset}px)` : undefined,
                transition: slideOffset === 0 ? "transform 0.25s ease-out" : "none",
                willChange: slideOffset > 0 ? "transform" : undefined,
            }}>

            {/* ─── PULL-TO-REFRESH INDICATOR ─── */}
            {(isPulling || refreshing) && (
                <div style={{
                    position: "absolute", top: `calc(env(safe-area-inset-top, 0px) + 56px)`,
                    left: "50%", transform: `translate(-50%, ${Math.min(pullDistance, 60)}px)`,
                    zIndex: 25, transition: isPulling ? "none" : "transform 0.3s ease-out, opacity 0.3s",
                    opacity: pullDistance > 20 || refreshing ? 1 : pullDistance / 20,
                }}>
                    <div style={{
                        width: 32, height: 32, borderRadius: 16,
                        background: T.bg.elevated, border: `1px solid ${T.border.default}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: T.shadow.card,
                    }}>
                        <RefreshCw size={16} color={T.accent.primary} style={{
                            animation: refreshing ? "ringSweep 1s linear infinite" : `rotate(${pullDistance * 4}deg)`,
                            transition: refreshing ? "none" : "transform 0.1s ease-out",
                        }} />
                    </div>
                </div>
            )}

            {/* ─── HEADER ─── */}
            <header style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: `calc(env(safe-area-inset-top, 0px) + 8px) 16px 10px 16px`,
                background: T.bg.navGlass,
                backdropFilter: "blur(24px) saturate(1.8)", WebkitBackdropFilter: "blur(24px) saturate(1.8)",
                borderBottom: `1px solid ${T.border.subtle}`,
                flexShrink: 0, zIndex: 20,
            }}>
                <button onClick={() => { haptic.light(); onClose(); }} style={{
                    width: 40, height: 40, borderRadius: 12,
                    border: `1px solid ${T.border.default}`, background: T.bg.glass,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", color: T.text.secondary,
                    backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
                }}><ArrowLeft size={18} strokeWidth={2} /></button>

                <span style={{
                    fontSize: 13, fontWeight: 700, color: T.text.secondary,
                    fontFamily: T.font.mono, letterSpacing: "0.04em",
                }}>TRANSACTIONS</span>

                <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => { haptic.light(); setShowExportMenu(!showExportMenu); }} style={{
                        width: 40, height: 40, borderRadius: 12,
                        border: `1px solid ${T.border.default}`, background: T.bg.glass,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer", color: T.text.secondary,
                    }}><Download size={17} strokeWidth={2} /></button>
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        style={{
                            width: 40, height: 40, borderRadius: 12,
                            border: `1px solid ${T.border.default}`, background: T.bg.glass,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer", color: refreshing ? T.accent.primary : T.text.secondary,
                            transition: "color 0.2s",
                        }}
                    >
                        <RefreshCw size={17} strokeWidth={2} style={{
                            animation: refreshing ? "ringSweep 1s linear infinite" : "none",
                        }} />
                    </button>
                </div>
            </header>

            {/* ─── EXPORT DROPDOWN ─── */}
            {showExportMenu && (
                <div style={{
                    position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 56px)",
                    right: 16, zIndex: 60, minWidth: 180,
                    background: T.bg.elevated, borderRadius: T.radius.lg,
                    border: `1px solid ${T.border.default}`,
                    boxShadow: T.shadow.elevated, overflow: "hidden",
                    animation: "txnSlideDown 0.2s ease-out",
                }}>
                    <button onClick={handleExportCSV} className="txn-export-btn" style={{
                        display: "flex", alignItems: "center", gap: 10, width: "100%",
                        padding: "13px 16px", background: "transparent", border: "none",
                        color: T.text.primary, fontSize: 13, fontWeight: 600, cursor: "pointer",
                        borderBottom: `1px solid ${T.border.subtle}`, textAlign: "left",
                    }}>
                        <FileSpreadsheet size={16} color={T.status.green} />
                        Export as CSV
                    </button>
                    <button onClick={handleExportJSON} className="txn-export-btn" style={{
                        display: "flex", alignItems: "center", gap: 10, width: "100%",
                        padding: "13px 16px", background: "transparent", border: "none",
                        color: T.text.primary, fontSize: 13, fontWeight: 600, cursor: "pointer",
                        textAlign: "left",
                    }}>
                        <FileText size={16} color={T.status.blue} />
                        Export as JSON
                    </button>
                </div>
            )}

            {/* ─── SUMMARY BAR ─── */}
            {!loading && transactions.length > 0 && (
                <div style={{
                    display: "flex", gap: 8, padding: "10px 16px",
                    borderBottom: `1px solid ${T.border.subtle}`,
                    background: T.bg.card, flexShrink: 0,
                }}>
                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
                        <TrendingDown size={13} color={T.status.red} />
                        <span style={{ fontSize: 11, color: T.text.dim, fontWeight: 600 }}>Spent</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: T.text.primary, fontVariantNumeric: "tabular-nums" }}>
                            {stats.totalSpent.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                        </span>
                    </div>
                    <div style={{ width: 1, background: T.border.default }} />
                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
                        <TrendingUp size={13} color={T.status.green} />
                        <span style={{ fontSize: 11, color: T.text.dim, fontWeight: 600 }}>Received</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: T.status.green, fontVariantNumeric: "tabular-nums" }}>
                            {stats.totalReceived.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                        </span>
                    </div>
                </div>
            )}

            {/* ─── SEARCH BAR ─── */}
            {!loading && transactions.length > 0 && (
                <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 16px", borderBottom: `1px solid ${T.border.subtle}`,
                    background: T.bg.card, flexShrink: 0,
                }}>
                    <div style={{
                        flex: 1, display: "flex", alignItems: "center", gap: 8,
                        background: T.bg.surface, borderRadius: T.radius.md,
                        padding: "8px 12px", border: `1px solid ${T.border.subtle}`,
                    }}>
                        <Search size={15} color={T.text.dim} style={{ flexShrink: 0 }} />
                        <input
                            ref={searchRef}
                            className="txn-search-input"
                            type="text"
                            placeholder="Search transactions..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{ color: T.text.primary }}
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery("")} style={{
                                background: "none", border: "none", cursor: "pointer",
                                padding: 2, display: "flex", color: T.text.dim,
                            }}><X size={14} /></button>
                        )}
                    </div>
                    <button
                        onClick={() => { haptic.light(); setShowFilters(!showFilters); }}
                        style={{
                            width: 38, height: 38, borderRadius: T.radius.md,
                            border: `1px solid ${showFilters || hasFilters ? T.accent.primary + "60" : T.border.default}`,
                            background: showFilters || hasFilters ? T.accent.primaryDim : T.bg.glass,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer", color: showFilters || hasFilters ? T.accent.primary : T.text.dim,
                            transition: "all 0.2s",
                        }}
                    ><Filter size={16} strokeWidth={2} /></button>
                </div>
            )}

            {/* ─── FILTER PILLS ─── */}
            {showFilters && (
                <div style={{
                    padding: "8px 0 4px", borderBottom: `1px solid ${T.border.subtle}`,
                    background: T.bg.card, flexShrink: 0,
                    animation: "txnSlideDown 0.2s ease-out",
                }}>
                    {/* Category Row */}
                    <div style={{ padding: "0 16px 4px", display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: T.text.dim, letterSpacing: "0.06em", textTransform: "uppercase", flexShrink: 0 }}>CAT</span>
                        <div className="txn-filter-strip">
                            {hasFilters && (
                                <button onClick={clearFilters} className="txn-filter-pill" style={{
                                    background: T.status.redDim, color: T.status.red,
                                    border: `1px solid ${T.status.red}30`,
                                }}>Clear All</button>
                            )}
                            {categories.map(cat => {
                                const active = activeCategory === cat;
                                const meta = getCategoryMeta(cat);
                                return (
                                    <button key={cat} onClick={() => { haptic.light(); setActiveCategory(active ? null : cat); }}
                                        className="txn-filter-pill" style={{
                                            background: active ? meta.bg : "transparent",
                                            color: active ? meta.color : T.text.dim,
                                            border: `1px solid ${active ? meta.color + "40" : T.border.default}`,
                                        }}>
                                        {cat}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    {/* Account Row */}
                    <div style={{ padding: "0 16px 4px", display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: T.text.dim, letterSpacing: "0.06em", textTransform: "uppercase", flexShrink: 0 }}>ACCT</span>
                        <div className="txn-filter-strip">
                            {accounts.map(acct => {
                                const active = activeAccount === acct;
                                return (
                                    <button key={acct} onClick={() => { haptic.light(); setActiveAccount(active ? null : acct); }}
                                        className="txn-filter-pill" style={{
                                            background: active ? T.accent.primaryDim : "transparent",
                                            color: active ? T.accent.primary : T.text.dim,
                                            border: `1px solid ${active ? T.accent.primary + "40" : T.border.default}`,
                                        }}>
                                        {acct}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ─── TRANSACTION LIST ─── */}
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                style={{
                    flex: 1, overflowY: "auto", overscrollBehavior: "contain",
                    WebkitOverflowScrolling: "touch",
                    paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
                }}
            >
                {loading ? (
                    /* Skeleton Loader */
                    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                        {[...Array(8)].map((_, i) => (
                            <div key={i} className="txn-empty-shimmer" style={{
                                height: 56, borderRadius: T.radius.md, background: T.bg.surface,
                                animation: `txnShimmer 1.5s ease-in-out ${i * 0.1}s infinite`,
                            }} />
                        ))}
                    </div>
                ) : transactions.length === 0 ? (
                    /* Empty State */
                    <div style={{
                        display: "flex", flexDirection: "column", alignItems: "center",
                        justifyContent: "center", padding: "60px 32px", textAlign: "center",
                        gap: 16, minHeight: 400,
                    }}>
                        <div style={{
                            width: 72, height: 72, borderRadius: 20,
                            background: T.accent.primaryDim, display: "flex",
                            alignItems: "center", justifyContent: "center",
                            border: `1px solid ${T.border.subtle}`,
                        }}>
                            <CreditCard size={32} color={T.accent.primary} strokeWidth={1.5} />
                        </div>
                        <div>
                            <h3 style={{ fontSize: 18, fontWeight: 800, color: T.text.primary, marginBottom: 6 }}>
                                No Transactions Yet
                            </h3>
                            <p style={{ fontSize: 13, color: T.text.secondary, lineHeight: 1.5, maxWidth: 260 }}>
                                Connect a bank account via <strong>Plaid</strong> in Settings to see your transaction history here.
                            </p>
                        </div>
                        <button onClick={onClose} style={{
                            marginTop: 8, padding: "12px 28px", borderRadius: T.radius.lg,
                            background: T.accent.gradient, border: "none",
                            color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer",
                            boxShadow: `0 4px 16px ${T.accent.primary}40`,
                        }}>Go to Settings</button>
                    </div>
                ) : filtered.length === 0 ? (
                    /* No Results */
                    <div style={{
                        display: "flex", flexDirection: "column", alignItems: "center",
                        justifyContent: "center", padding: "60px 32px", textAlign: "center", gap: 12,
                    }}>
                        <AlertCircle size={36} color={T.text.dim} strokeWidth={1.5} />
                        <p style={{ fontSize: 14, fontWeight: 600, color: T.text.secondary }}>No matching transactions</p>
                        <button onClick={clearFilters} style={{
                            padding: "10px 20px", borderRadius: T.radius.md,
                            border: `1px solid ${T.border.default}`, background: T.bg.surface,
                            color: T.text.secondary, fontSize: 12, fontWeight: 700, cursor: "pointer",
                        }}>Clear Filters</button>
                    </div>
                ) : (
                    /* Transaction Groups */
                    <>
                        {grouped.map((group, gi) => (
                            <div key={group.date}>
                                {/* Sticky Date Header */}
                                <div className="txn-date-header" style={{
                                    display: "flex", justifyContent: "space-between", alignItems: "center",
                                    padding: "8px 16px",
                                    background: T.bg.navGlass,
                                    borderBottom: `1px solid ${T.border.subtle}`,
                                    animationDelay: `${gi * 0.03}s`,
                                }}>
                                    <span style={{
                                        fontSize: 12, fontWeight: 800, color: T.text.primary,
                                        letterSpacing: "0.01em",
                                    }}>{formatDateHeader(group.date)}</span>
                                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                        {group.creditTotal > 0 && (
                                            <span style={{ fontSize: 11, fontWeight: 700, color: T.status.green, fontVariantNumeric: "tabular-nums" }}>
                                                +{group.creditTotal.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                                            </span>
                                        )}
                                        <span style={{
                                            fontSize: 11, fontWeight: 700, color: T.text.dim,
                                            fontVariantNumeric: "tabular-nums",
                                        }}>
                                            −{group.total.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                                        </span>
                                    </div>
                                </div>

                                {/* Transaction Rows */}
                                {group.txns.map((txn, ti) => {
                                    const meta = getCategoryMeta(txn.category);
                                    const Icon = meta.icon;
                                    return (
                                        <div key={txn.id || `${group.date}-${ti}`} className="txn-row" style={{
                                            display: "flex", alignItems: "center", gap: 12,
                                            padding: "12px 16px",
                                            borderBottom: `1px solid ${T.border.subtle}`,
                                            animationDelay: `${(gi * 5 + ti) * 0.02}s`,
                                        }}>
                                            {/* Category Icon */}
                                            <div style={{
                                                width: 40, height: 40, borderRadius: 12,
                                                background: meta.bg, display: "flex",
                                                alignItems: "center", justifyContent: "center",
                                                flexShrink: 0,
                                            }}>
                                                <Icon size={18} color={meta.color} strokeWidth={2} />
                                            </div>

                                            {/* Details */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                    display: "flex", alignItems: "center", gap: 6,
                                                }}>
                                                    <span style={{
                                                        fontSize: 13, fontWeight: 700, color: T.text.primary,
                                                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                                    }}>{txn.description}</span>
                                                    {txn.pending && (
                                                        <span className="txn-pending-badge" style={{
                                                            fontSize: 9, fontWeight: 800, color: T.status.amber,
                                                            background: T.status.amberDim,
                                                            padding: "2px 6px", borderRadius: 6,
                                                            letterSpacing: "0.04em", textTransform: "uppercase",
                                                            flexShrink: 0,
                                                        }}>PENDING</span>
                                                    )}
                                                </div>
                                                <div style={{
                                                    fontSize: 11, color: T.text.dim, marginTop: 2,
                                                    display: "flex", alignItems: "center", gap: 4,
                                                }}>
                                                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                        {txn.accountName || txn.institution}
                                                    </span>
                                                    {txn.category && (
                                                        <>
                                                            <span style={{ opacity: 0.4 }}>·</span>
                                                            <span style={{
                                                                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                                                textTransform: "capitalize",
                                                            }}>{txn.category.toLowerCase()}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Amount */}
                                            <span style={{
                                                fontSize: 14, fontWeight: 800, flexShrink: 0,
                                                fontVariantNumeric: "tabular-nums",
                                                color: txn.isCredit ? T.status.green : T.text.primary,
                                            }}>
                                                {formatMoney(txn.amount, txn.isCredit)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}

                        {/* Load More */}
                        {visibleCount < filtered.length && (
                            <div style={{ padding: "16px", display: "flex", justifyContent: "center" }}>
                                <button onClick={() => setVisibleCount(v => v + 50)} style={{
                                    display: "flex", alignItems: "center", gap: 6,
                                    padding: "10px 24px", borderRadius: T.radius.lg,
                                    border: `1px solid ${T.border.default}`, background: T.bg.surface,
                                    color: T.text.secondary, fontSize: 12, fontWeight: 700,
                                    cursor: "pointer", fontFamily: T.font.mono,
                                }}>
                                    <ChevronDown size={14} />
                                    Show More ({filtered.length - visibleCount} remaining)
                                </button>
                            </div>
                        )}

                        {/* Footer */}
                        <div style={{
                            padding: "16px", textAlign: "center",
                            fontSize: 10, color: T.text.muted, fontFamily: T.font.mono,
                        }}>
                            {stats.count} transaction{stats.count !== 1 ? "s" : ""}
                            {fetchedAt && ` · Updated ${new Date(fetchedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
