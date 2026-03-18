// ═══════════════════════════════════════════════════════════════
// TransactionFeed — Unified Plaid Transaction Viewer
// Premium Apple-Wallet-style UI with date grouping, search,
// filtering, and CSV/JSON export.
// ═══════════════════════════════════════════════════════════════

  import { useCallback,useEffect,useMemo,useRef,useState } from "react";
  import type { CustomValuations,Card as PortfolioCard } from "../../types/index.js";
  import { EmptyState } from "../components.js";
  import { T } from "../constants.js";
  import { usePortfolio } from "../contexts/PortfolioContext.js";
  import { useSettings } from "../contexts/SettingsContext.js";
  import { haptic } from "../haptics.js";
  import {
    AlertCircle,
    ArrowDownLeft,
    ArrowLeft,
    ArrowUpRight,
    Baby,
    Banknote,
    Briefcase,
    Building2,
    Car,
    ChevronDown,
    CreditCard,
    Download,
    Dumbbell,
    FileSpreadsheet,
    FileText,
    Filter,
    Gamepad2,
    Gift,
    GraduationCap,
    Heart,
    HelpCircle,
    Home,
    Landmark,
    Lock,
    PiggyBank,
    Plane,
    RefreshCw,
    Search,
    ShoppingCart,
    Sparkles,
    Stethoscope,
    TrendingDown,
    TrendingUp,
    Utensils,
    Wifi,
    Wrench,
    X,
    Zap
  } from "../icons";
  import { fetchAllTransactions,getConnections,getStoredTransactions } from "../plaid.js";
  import { log } from "../logger.js";
  import { Card } from "../ui.js";
  import { nativeExport } from "../utils.js";
  import "./TransactionFeed.css";
  import { buildCSV, buildRewardComparison, formatDateHeader, formatMoney, formatRewardRate, getCategoryMeta, isTransactionInSameMonth, normalizeTransactionResult } from "./transactionFeed/helpers";
  import { useTransactionFeedGestures } from "./transactionFeed/useTransactionFeedGestures";

interface ToastApi {
  success?: (message: string) => void;
  error?: (message: string) => void;
  info?: (message: string) => void;
}

interface TransactionFeedProps {
  onClose: () => void;
  proEnabled?: boolean;
  onConnectPlaid?: () => void;
}

interface TransactionRewardComparison {
  usedDisplayName: string;
  actualYield: number;
  optimalYield: number;
  actualRewardValue: number;
  optimalRewardValue: number;
  incrementalRewardValue: number;
  usedCardMatched: boolean;
}

interface TransactionRecord {
  id?: string;
  date: string;
  amount: number;
  description?: string;
  name?: string;
  category?: string;
  pending?: boolean;
  institution?: string;
  accountName?: string;
  isCredit?: boolean;
  optimalCard?: { name?: string; effectiveYield?: number } | null;
  usedOptimal?: boolean;
  rewardComparison?: TransactionRewardComparison | null;
}

interface LegacyTransactionResult {
  transactions?: TransactionRecord[];
  data?: TransactionRecord[];
  fetchedAt: string;
}

interface PlaidConnection {
  id: string;
  institutionName?: string;
  institutionId?: string;
  lastSync?: string;
  accounts?: unknown[];
  _needsReconnect?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function TransactionFeed({ onClose, proEnabled = false, onConnectPlaid }: TransactionFeedProps) {
  const { cards } = usePortfolio();
  const { financialConfig } = useSettings();
  const appWindow = window as Window & { toast?: ToastApi };
  const categoryIconMap = {
    AlertCircle,
    ArrowDownLeft,
    ArrowUpRight,
    Baby,
    Banknote,
    Briefcase,
    Building2,
    Car,
    CreditCard,
    Dumbbell,
    Gamepad2,
    Gift,
    GraduationCap,
    Heart,
    HelpCircle,
    Home,
    Landmark,
    PiggyBank,
    Plane,
    ShoppingCart,
    Stethoscope,
    Utensils,
    Wifi,
    Wrench,
    Zap,
  };
  
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [plaidConnections, setPlaidConnections] = useState<PlaidConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeAccount, setActiveAccount] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // ── Load stored transactions on mount ──
  useEffect(() => {
    (async () => {
      try {
        const [storedTransactions, connections] = await Promise.all([
          getStoredTransactions(),
          getConnections(),
        ]);
        const stored = normalizeTransactionResult(storedTransactions as LegacyTransactionResult | null);
        if (stored?.data?.length) {
          setTransactions(stored.data);
          setFetchedAt(stored.fetchedAt);
        }
        setPlaidConnections((connections || []) as PlaidConnection[]);
      } catch (e) {
        log.warn("transactions", "Failed to load transaction feed cache", {
          error: e instanceof Error ? e.message : "unknown",
        });
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
      const result = normalizeTransactionResult(
        (await fetchAllTransactions(
          proEnabled ? 30 : 14,
          proEnabled ? undefined : { maxTransactions: 5, categorizeWithAi: false }
        )) as LegacyTransactionResult
      );
      const connections = (await getConnections()) as PlaidConnection[];
      setTransactions(result.data);
      setFetchedAt(result.fetchedAt);
      setPlaidConnections(connections || []);
      appWindow.toast?.success?.(
        proEnabled
          ? `Synced ${result.data.length} transactions`
          : `Updated your free ledger preview (${result.data.length} transactions)`
      );
    } catch (e) {
      log.warn("transactions", "Transaction feed refresh failed", {
        error: e instanceof Error ? e.message : "unknown",
      });
      appWindow.toast?.error?.("Failed to refresh transactions");
    } finally {
      setRefreshing(false);
    }
  }, [appWindow, proEnabled]);

  const {
    slideOffset,
    pullDistance,
    isPulling,
    handleOverlayTouchStart,
    handleOverlayTouchMove,
    handleOverlayTouchEnd,
  } = useTransactionFeedGestures({
    refreshing,
    onClose,
    onRefresh: handleRefresh,
  });

  const hasPlaidConnections = plaidConnections.length > 0;
  const needsReconnectOnly = hasPlaidConnections && plaidConnections.every(connection => connection._needsReconnect);
  const emptyStateTitle = needsReconnectOnly
    ? "Reconnect Required"
    : hasPlaidConnections
      ? "No Synced Transactions Yet"
      : "No Transactions Yet";
  const emptyStateMessage = needsReconnectOnly
    ? "Your linked bank connections need to be reconnected in Settings before Catalyst can sync transactions again."
    : hasPlaidConnections
      ? "Your accounts are already linked. Sync the ledger to pull recent Plaid transactions, or connect another bank."
      : "Connect a bank account via Plaid in Settings to see your transaction history here.";

  // ── Derived: unique categories & accounts ──
  const categories = useMemo(() => {
    const set = new Set<string>(transactions.map(t => t.category).filter((v): v is string => Boolean(v)));
    return [...set].sort();
  }, [transactions]);

  const accounts = useMemo(() => {
    const set = new Set<string>(transactions.map(t => `${t.institution || ""} - ${t.accountName || ""}`).filter(s => s !== " - "));
    return [...set].sort();
  }, [transactions]);

  // ── Filtered transactions ──
  const filtered = useMemo(() => {
    let list = transactions;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        t =>
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
    const allowedList = proEnabled ? filtered : filtered.slice(0, 5);
    const visible = allowedList.slice(0, visibleCount);
    const map = new Map<string, { date: string; total: number; creditTotal: number; txns: TransactionRecord[] }>();
    for (const t of visible) {
      const key = t.date;
      if (!map.has(key)) map.set(key, { date: key, total: 0, creditTotal: 0, txns: [] });
      const group = map.get(key);
      if (!group) continue;
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

  // ── Spending breakdown by category ──
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of filtered) {
      if (t.isCredit) continue; // Only count spending
      const cat = (t.category || "Other").toLowerCase().trim();
      map.set(cat, (map.get(cat) || 0) + t.amount);
    }
    const total = [...map.values()].reduce((s, v) => s + v, 0);
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([cat, amount]) => ({
        category: cat,
        amount,
        pct: total > 0 ? (amount / total) * 100 : 0,
        meta: getCategoryMeta(cat, categoryIconMap),
      }));
  }, [categoryIconMap, filtered]);

  // ── Missed Opportunity Radar ──
  const missedOpportunities = useMemo(() => {
    if (!cards || cards.length === 0 || filtered.length === 0) return { totalMissedValue: 0, optimalTxns: 0, badTxns: 0 };
    
    let totalMissedValue = 0;
    let optimalTxns = 0;
    let badTxns = 0;

    for (const txn of filtered) {
      delete txn.optimalCard;
      delete txn.usedOptimal;
      delete txn.rewardComparison;
    }
    
    // Only analyze current-month debit transactions with recognizable categories.
    const analyzableTxns = filtered.filter(
      t => !t.isCredit && t.category && t.amount > 0 && isTransactionInSameMonth(t.date)
    );
    
    for (const txn of analyzableTxns) {
      const comparison = buildRewardComparison(
        txn,
        cards as PortfolioCard[],
        financialConfig?.customValuations as CustomValuations | undefined
      );
      if (!comparison) continue;

      txn.optimalCard = comparison.bestCard;
      txn.rewardComparison = {
        usedDisplayName: comparison.usedDisplayName,
        actualYield: comparison.actualYield,
        optimalYield: comparison.optimalYield,
        actualRewardValue: comparison.actualRewardValue,
        optimalRewardValue: comparison.optimalRewardValue,
        incrementalRewardValue: comparison.incrementalRewardValue,
        usedCardMatched: comparison.usedCardMatched,
      };

      if (!comparison.usedOptimal) {
        totalMissedValue += comparison.incrementalRewardValue;
        badTxns++;
      } else {
        optimalTxns++;
        txn.usedOptimal = true;
      }
    }
    
    return {
      totalMissedValue,
      optimalTxns,
      badTxns,
      totalTxns: analyzableTxns.length
    };
  }, [filtered, cards, financialConfig]);

  // ── Infinite scroll ──
  const handleScroll = useCallback(() => {
    if (!proEnabled) return;
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
      setVisibleCount(prev => Math.min(prev + 30, filtered.length));
    }
  }, [filtered.length, proEnabled]);

  // ── Export handlers ──
  const handleExportCSV = useCallback(async () => {
    haptic.medium();
    setShowExportMenu(false);
    try {
      const csv = buildCSV(filtered);
      const dateStr = new Date().toISOString().split("T")[0];
      await nativeExport(`CatalystCash_Transactions_${dateStr}.csv`, csv, "text/csv");
    } catch {
      appWindow.toast?.error?.("Export failed");
    }
  }, [filtered, appWindow]);

  const handleExportJSON = useCallback(async () => {
    haptic.medium();
    setShowExportMenu(false);
    try {
      const payload = { app: "Catalyst Cash", exportedAt: new Date().toISOString(), transactions: filtered };
      const dateStr = new Date().toISOString().split("T")[0];
      await nativeExport(
        `CatalystCash_Transactions_${dateStr}.json`,
        JSON.stringify(payload, null, 2),
        "application/json"
      );
    } catch {
      appWindow.toast?.error?.("Export failed");
    }
  }, [filtered, appWindow]);

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
      onTouchMove={e => handleOverlayTouchMove(e, scrollRef)}
      onTouchEnd={handleOverlayTouchEnd}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: T.bg.base,
        display: "flex",
        flexDirection: "column",
        fontFamily: T.font.sans,
        transform: slideOffset > 0 ? `translateX(${slideOffset}px)` : undefined,
        transition: slideOffset === 0 ? "transform 0.25s ease-out" : "none",
        willChange: slideOffset > 0 ? "transform" : undefined,
      }}
    >
      {/* ─── PULL-TO-REFRESH INDICATOR ─── */}
      {(isPulling || refreshing) && (
        <div
          style={{
            position: "absolute",
            top: `calc(env(safe-area-inset-top, 0px) + 56px)`,
            left: "50%",
            transform: `translate(-50%, ${Math.min(pullDistance, 60)}px)`,
            zIndex: 25,
            transition: isPulling ? "none" : "transform 0.3s ease-out, opacity 0.3s",
            opacity: pullDistance > 20 || refreshing ? 1 : pullDistance / 20,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              background: T.bg.elevated,
              border: `1px solid ${T.border.default}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: T.shadow.card,
            }}
          >
            <RefreshCw
              size={16}
              color={T.accent.primary}
              style={{
                animation: refreshing ? "spin 0.9s linear infinite" : "none",
                transform: refreshing ? undefined : `rotate(${pullDistance * 4}deg)`,
                transition: refreshing ? "none" : "transform 0.1s ease-out",
              }}
            />
          </div>
        </div>
      )}

      {/* ─── HEADER ─── */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `calc(env(safe-area-inset-top, 0px) + 8px) 16px 10px 16px`,
          background: T.bg.navGlass,
          backdropFilter: "blur(24px) saturate(1.8)",
          WebkitBackdropFilter: "blur(24px) saturate(1.8)",
          borderBottom: `1px solid ${T.border.subtle}`,
          flexShrink: 0,
          zIndex: 20,
        }}
      >
        <button
          onClick={() => {
            haptic.light();
            onClose();
          }}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            border: `1px solid ${T.border.default}`,
            background: T.bg.glass,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: T.text.secondary,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          <ArrowLeft size={18} strokeWidth={2} />
        </button>

        <span
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 13,
            fontWeight: 700,
            color: T.text.secondary,
            fontFamily: T.font.mono,
            letterSpacing: "0.04em",
          }}
        >
          TRANSACTIONS
        </span>

        <div style={{ display: "flex", gap: 6 }}>
          {proEnabled && (
            <button
              onClick={() => {
                haptic.light();
                setShowExportMenu(!showExportMenu);
              }}
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                border: `1px solid ${T.border.default}`,
                background: T.bg.glass,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: T.text.secondary,
              }}
            >
              <Download size={17} strokeWidth={2} />
            </button>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              border: `1px solid ${T.border.default}`,
              background: T.bg.glass,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: refreshing ? T.accent.primary : T.text.secondary,
              transition: "color 0.2s",
            }}
          >
            <RefreshCw
              size={17}
              strokeWidth={2}
              style={{
                animation: refreshing ? "spin 0.9s linear infinite" : "none",
              }}
            />
          </button>
        </div>
      </header>

      {/* ─── EXPORT DROPDOWN ─── */}
      {proEnabled && showExportMenu && (
        <div
          style={{
            position: "absolute",
            top: "calc(env(safe-area-inset-top, 0px) + 56px)",
            right: 16,
            zIndex: 60,
            minWidth: 180,
            background: T.bg.elevated,
            borderRadius: T.radius.lg,
            border: `1px solid ${T.border.default}`,
            boxShadow: T.shadow.elevated,
            overflow: "hidden",
            animation: "txnSlideDown 0.2s ease-out",
          }}
        >
          <button
            onClick={handleExportCSV}
            className="txn-export-btn"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              padding: "13px 16px",
              background: "transparent",
              border: "none",
              color: T.text.primary,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              borderBottom: `1px solid ${T.border.subtle}`,
              textAlign: "left",
            }}
          >
            <FileSpreadsheet size={16} color={T.status.green} />
            Export as CSV
          </button>
          <button
            onClick={handleExportJSON}
            className="txn-export-btn"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              padding: "13px 16px",
              background: "transparent",
              border: "none",
              color: T.text.primary,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <FileText size={16} color={T.status.blue} />
            Export as JSON
          </button>
        </div>
      )}

      {/* ─── TRANSACTION LIST ─── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
        }}
      >
        {/* ─── SUMMARY BAR ─── */}
        {!loading && transactions.length > 0 && proEnabled && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              padding: "10px 16px 8px",
              borderBottom: `1px solid ${T.border.subtle}`,
              background: T.bg.card,
            }}
          >
            <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderRadius: T.radius.md, background: T.bg.elevated }}>
              <TrendingDown size={13} color={T.status.red} />
              <span style={{ fontSize: 11, color: T.text.dim, fontWeight: 600 }}>Spent</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: T.text.primary, fontVariantNumeric: "tabular-nums" }}>
                {stats.totalSpent.toLocaleString("en-US", { style: "currency", currency: "USD" })}
              </span>
            </div>
            <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderRadius: T.radius.md, background: T.bg.elevated }}>
              <TrendingUp size={13} color={T.status.green} />
              <span style={{ fontSize: 11, color: T.text.dim, fontWeight: 600 }}>Received</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: T.status.green, fontVariantNumeric: "tabular-nums" }}>
                {stats.totalReceived.toLocaleString("en-US", { style: "currency", currency: "USD" })}
              </span>
            </div>
          </div>
        )}

        {/* ─── MISSED OPPORTUNITY RADAR ─── */}
        {!loading && proEnabled && missedOpportunities.totalMissedValue > 0 && (
          <div 
            className="txn-missed-opp-banner"
            style={{
              margin: "10px 16px",
              background: `linear-gradient(135deg, ${T.status.redDim}, ${T.bg.card})`,
              border: `1px solid ${T.status.red}26`,
              borderRadius: T.radius.lg,
              padding: 14,
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              boxShadow: "none",
              animation: "txnSlideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <div 
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                background: `${T.status.red}18`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Zap size={15} color={T.status.red} strokeWidth={2.5} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h4 style={{ 
                fontSize: 13, 
                fontWeight: 800, 
                color: T.status.red, 
                margin: "0 0 4px 0",
                letterSpacing: "0.02em",
                textTransform: "uppercase",
              }}>
                Missed Opportunity
              </h4>
              <p style={{ 
                fontSize: 12, 
                color: T.text.secondary, 
                lineHeight: 1.45,
                margin: 0 
              }}>
                You lost <strong style={{ color: T.text.primary, fontVariantNumeric: "tabular-nums" }}>{missedOpportunities.totalMissedValue.toLocaleString("en-US", { style: "currency", currency: "USD" })}</strong> in value this month by using the wrong card on {missedOpportunities.badTxns} past transactions. Look for the <span style={{ color: T.accent.primary, fontWeight: 700 }}>Best Card</span> badges below.
              </p>
            </div>
          </div>
        )}

        {/* ─── SPENDING BREAKDOWN ─── */}
        {!loading && proEnabled && transactions.length > 0 && categoryBreakdown.length > 0 && (
          <div
            style={{
              borderBottom: `1px solid ${T.border.subtle}`,
              background: T.bg.card,
            }}
          >
            <button
              onClick={() => {
                haptic.light();
                setShowBreakdown(!showBreakdown);
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                minHeight: 44,
                padding: "10px 16px",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: T.text.secondary,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.04em",
                fontFamily: T.font.mono,
              }}
            >
              <span>SPENDING BREAKDOWN</span>
              <ChevronDown
                size={14}
                style={{
                  transform: showBreakdown ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease",
                }}
              />
            </button>
            {showBreakdown && (
              <div
                style={{
                  padding: "0 16px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  animation: "txnSlideDown 0.2s ease-out",
                }}
              >
                {categoryBreakdown.map(({ category, amount, pct, meta }) => {
                  const Icon = meta.icon;
                  return (
                    <div key={category} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          background: meta.bg,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Icon size={14} color={meta.color} strokeWidth={2} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                            marginBottom: 3,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: T.text.primary,
                              textTransform: "capitalize",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {category}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: T.text.dim,
                              fontVariantNumeric: "tabular-nums",
                              flexShrink: 0,
                              marginLeft: 8,
                            }}
                          >
                            {amount.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                            <span style={{ opacity: 0.5, marginLeft: 4 }}>{pct.toFixed(0)}%</span>
                          </span>
                        </div>
                        <div
                          style={{
                            height: 4,
                            borderRadius: 2,
                            background: T.bg.surface,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${pct}%`,
                              height: "100%",
                              borderRadius: 2,
                              background: meta.color,
                              transition: "width 0.5s ease-out",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── SEARCH BAR ─── */}
        {!loading && transactions.length > 0 && proEnabled && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 16px",
              borderBottom: `1px solid ${T.border.subtle}`,
              background: T.bg.card,
            }}
          >
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: T.bg.surface,
                borderRadius: T.radius.md,
                padding: "8px 12px",
                border: `1px solid ${T.border.subtle}`,
              }}
            >
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
                <button
                  onClick={() => setSearchQuery("")}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 2,
                    display: "flex",
                    color: T.text.dim,
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              onClick={() => {
                haptic.light();
                setShowFilters(!showFilters);
              }}
              aria-label={showFilters ? "Hide transaction filters" : "Show transaction filters"}
              style={{
                width: 42,
                height: 42,
                borderRadius: T.radius.md,
                border: `1px solid ${showFilters || hasFilters ? T.accent.primary + "60" : T.border.default}`,
                background: showFilters || hasFilters ? T.accent.primaryDim : T.bg.glass,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: showFilters || hasFilters ? T.accent.primary : T.text.dim,
                transition: "all 0.2s",
              }}
            >
              <Filter size={16} strokeWidth={2} />
            </button>
          </div>
        )}

        {/* ─── FILTER PILLS ─── */}
        {proEnabled && showFilters && (
          <div
            style={{
              padding: "8px 0 4px",
              borderBottom: `1px solid ${T.border.subtle}`,
              background: T.bg.card,
              animation: "txnSlideDown 0.2s ease-out",
            }}
          >
            {/* Category Row */}
            <div style={{ padding: "0 16px 4px", display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: T.text.dim,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  flexShrink: 0,
                }}
              >
                CAT
              </span>
              <div className="txn-filter-strip">
                {hasFilters && (
                  <button
                    onClick={clearFilters}
                    className="txn-filter-pill"
                    style={{
                      background: T.status.redDim,
                      color: T.status.red,
                      border: `1px solid ${T.status.red}30`,
                    }}
                  >
                    Clear All
                  </button>
                )}
                {categories.map(cat => {
                  const active = activeCategory === cat;
                  const meta = getCategoryMeta(cat, categoryIconMap);
                  return (
                    <button
                      key={cat}
                      onClick={() => {
                        haptic.light();
                        setActiveCategory(active ? null : cat);
                      }}
                      className="txn-filter-pill"
                      style={{
                        background: active ? meta.bg : "transparent",
                        color: active ? meta.color : T.text.dim,
                        border: `1px solid ${active ? meta.color + "40" : T.border.default}`,
                      }}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Account Row */}
            <div style={{ padding: "0 16px 4px", display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: T.text.dim,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  flexShrink: 0,
                }}
              >
                ACCT
              </span>
              <div className="txn-filter-strip">
                {accounts.map(acct => {
                  const active = activeAccount === acct;
                  return (
                    <button
                      key={acct}
                      onClick={() => {
                        haptic.light();
                        setActiveAccount(active ? null : acct);
                      }}
                      className="txn-filter-pill"
                      style={{
                        background: active ? T.accent.primaryDim : "transparent",
                        color: active ? T.accent.primary : T.text.dim,
                        border: `1px solid ${active ? T.accent.primary + "40" : T.border.default}`,
                      }}
                    >
                      {acct}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {loading ? (
          /* Skeleton Loader */
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="txn-empty-shimmer"
                style={{
                  height: 56,
                  borderRadius: T.radius.md,
                  background: T.bg.surface,
                  animation: `txnShimmer 1.5s ease-in-out ${i * 0.1}s infinite`,
                }}
              />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          /* Empty State */
          <div style={{ minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <EmptyState
              icon={CreditCard}
              title={emptyStateTitle}
              message={emptyStateMessage}
              action={
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10 }}>
                  {hasPlaidConnections && !needsReconnectOnly && (
                    <button
                      onClick={handleRefresh}
                      disabled={refreshing}
                      className="hover-lift btn-secondary"
                      style={{
                        padding: "12px 20px",
                        borderRadius: T.radius.md,
                        fontSize: 13,
                        fontWeight: 800,
                        opacity: refreshing ? 0.7 : 1,
                      }}
                    >
                      {refreshing ? "Syncing..." : "Sync Transactions"}
                    </button>
                  )}
                  {onConnectPlaid && (
                    <button
                      onClick={async () => {
                        haptic.light();
                        await onConnectPlaid();
                        const connections = (await getConnections()) as PlaidConnection[];
                        setPlaidConnections(connections || []);
                        if ((connections || []).length > 0) {
                          void handleRefresh();
                        }
                      }}
                      className="hover-lift btn-secondary"
                      style={{
                        padding: "12px 20px",
                        borderRadius: T.radius.md,
                        fontSize: 13,
                        fontWeight: 800,
                      }}
                    >
                      {hasPlaidConnections ? "Connect Another Bank" : "Connect with Plaid"}
                    </button>
                  )}
                </div>
              }
            />
          </div>
        ) : filtered.length === 0 ? (
          /* No Results */
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "60px 32px",
              textAlign: "center",
              gap: 12,
            }}
          >
            <AlertCircle size={36} color={T.text.dim} strokeWidth={1.5} />
            <p style={{ fontSize: 14, fontWeight: 600, color: T.text.secondary }}>No matching transactions</p>
            <button
              onClick={clearFilters}
              style={{
                padding: "10px 20px",
                borderRadius: T.radius.md,
                border: `1px solid ${T.border.default}`,
                background: T.bg.surface,
                color: T.text.secondary,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Clear Filters
            </button>
          </div>
        ) : (
          /* Transaction Groups */
          <>
            {grouped.map((group, gi) => (
              <div key={group.date}>
                {/* Sticky Date Header */}
                <div
                  className="txn-date-header"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 16px",
                    background: T.bg.navGlass,
                    borderBottom: `1px solid ${T.border.subtle}`,
                    animationDelay: `${gi * 0.03}s`,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: T.text.primary,
                      letterSpacing: "0.01em",
                    }}
                  >
                    {formatDateHeader(group.date)}
                  </span>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    {group.creditTotal > 0 && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: T.status.green,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        +{group.creditTotal.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: T.text.dim,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      −{group.total.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                    </span>
                  </div>
                </div>

                {/* Transaction Rows */}
                {group.txns.map((txn, ti) => {
                  const meta = getCategoryMeta(txn.category, categoryIconMap);
                  const Icon = meta.icon;
                  return (
                    <div
                      key={txn.id || `${group.date}-${ti}`}
                      className="txn-row"
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 12,
                        padding: "12px 16px",
                        borderBottom: `1px solid ${T.border.subtle}`,
                        animationDelay: `${(gi * 5 + ti) * 0.02}s`,
                      }}
                    >
                      {/* Category Icon */}
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 12,
                          background: meta.bg,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Icon size={18} color={meta.color} strokeWidth={2} />
                      </div>

                      {/* Details */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: T.text.primary,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {txn.description}
                          </span>
                          {txn.pending && (
                            <span
                              className="txn-pending-badge"
                              style={{
                                fontSize: 9,
                                fontWeight: 800,
                                color: T.status.amber,
                                background: T.status.amberDim,
                                padding: "2px 6px",
                                borderRadius: 6,
                                letterSpacing: "0.04em",
                                textTransform: "uppercase",
                                flexShrink: 0,
                              }}
                            >
                              PENDING
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: T.text.dim,
                            marginTop: 2,
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {txn.accountName || txn.institution}
                          </span>
                          {txn.category && (
                            <>
                              <span style={{ opacity: 0.4 }}>·</span>
                              <span
                                style={{
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  textTransform: "capitalize",
                                }}
                              >
                                {txn.category.toLowerCase()}
                              </span>
                            </>
                          )}
                        </div>
                        {/* ─── BEST CARD TAGLET ─── */}
                        {txn.optimalCard && txn.rewardComparison && !txn.isCredit && (
                          <div style={{ marginTop: 4, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                            <span style={{
                              fontSize: 9,
                              fontWeight: 800,
                              color: txn.usedOptimal ? T.status.green : T.accent.primary,
                              background: txn.usedOptimal ? T.status.greenDim : T.accent.primaryDim,
                              border: `1px solid ${txn.usedOptimal ? T.status.green : T.accent.primary}30`,
                              padding: "2px 6px",
                              borderRadius: 4,
                              letterSpacing: "0.02em",
                              textTransform: "uppercase",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 3,
                              maxWidth: "100%"
                            }}>
                              <Sparkles size={10} />
                              {txn.usedOptimal ? "Used Best Card" : "Should've Used"}:{" "}
                              {(() => {
                                const optimalCardName = txn.optimalCard.name || "Best Card";
                                return optimalCardName.length > 18 ? `${optimalCardName.substring(0, 15)}...` : optimalCardName;
                              })()}
                              {!txn.usedOptimal &&
                                ` (+${txn.rewardComparison.incrementalRewardValue.toLocaleString("en-US", { style: "currency", currency: "USD" })})`}
                            </span>
                            <span
                              style={{
                                fontSize: 10,
                                color: T.text.dim,
                                lineHeight: 1.35,
                                display: "block",
                                maxWidth: "100%",
                              }}
                            >
                              {txn.rewardComparison.usedCardMatched ? "Earned" : "Estimated earned"}{" "}
                              <span style={{ color: T.text.secondary, fontWeight: 700 }}>
                                {txn.rewardComparison.actualRewardValue.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                              </span>{" "}
                              with {txn.rewardComparison.usedDisplayName}
                              {!txn.rewardComparison.usedCardMatched && " (baseline estimate)"}
                              {!txn.usedOptimal && (
                                <>
                                  {" "}• Best would be{" "}
                                  <span style={{ color: T.accent.primary, fontWeight: 700 }}>
                                    {txn.rewardComparison.optimalRewardValue.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                                  </span>{" "}
                                  at {formatRewardRate(txn.rewardComparison.optimalYield)}
                                </>
                              )}
                              {txn.usedOptimal && <> • {formatRewardRate(txn.rewardComparison.actualYield)}</>}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Amount */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0, minWidth: 84 }}>
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 800,
                            fontVariantNumeric: "tabular-nums",
                            color: txn.isCredit ? T.status.green : T.text.primary,
                          }}
                        >
                          {formatMoney(txn.amount, !!txn.isCredit)}
                        </span>
                        {txn.date && (
                          <span style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono }}>
                            {new Date(txn.date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Pro Teaser Banner */}
            {!proEnabled && transactions.length > 0 && (
              <div style={{ padding: "8px 16px 24px" }}>
                <Card
                  style={{
                    background: `linear-gradient(135deg, ${T.accent.primaryDim}, ${T.bg.surface})`,
                    border: `1px solid ${T.accent.primary}40`,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    textAlign: "center",
                    padding: 24,
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      background: T.accent.primary,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: `0 8px 16px ${T.accent.primary}40`,
                    }}
                  >
                    <Lock size={24} color="#FFF" />
                  </div>
                  <div>
                    <h4 style={{ fontSize: 16, fontWeight: 800, color: T.text.primary, margin: "0 0 6px 0" }}>
                      Unlock Full Ledger
                    </h4>
                    <p style={{ fontSize: 13, color: T.text.secondary, margin: 0, lineHeight: 1.5 }}>
                      Free includes a live 5-transaction preview for one linked institution. Upgrade to Pro to unlock search,
                      filters, export, and your full multi-account ledger.
                    </p>
                  </div>
                </Card>
              </div>
            )}

            {/* Load More */}
            {proEnabled && visibleCount < filtered.length && (
              <div style={{ padding: "16px", display: "flex", justifyContent: "center" }}>
                <button
                  onClick={() => setVisibleCount(v => v + 50)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "10px 24px",
                    borderRadius: T.radius.lg,
                    border: `1px solid ${T.border.default}`,
                    background: T.bg.surface,
                    color: T.text.secondary,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: T.font.mono,
                  }}
                >
                  <ChevronDown size={14} />
                  Show More ({filtered.length - visibleCount} remaining)
                </button>
              </div>
            )}

            {/* Footer */}
            <div
              style={{
                padding: "16px",
                textAlign: "center",
                fontSize: 10,
                color: T.text.muted,
                fontFamily: T.font.mono,
              }}
            >
              {stats.count} transaction{stats.count !== 1 ? "s" : ""}
              {fetchedAt &&
                ` · Updated ${new Date(fetchedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
