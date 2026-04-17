import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  Stethoscope,
  TrendingDown,
  TrendingUp,
  Utensils,
  Wifi,
  Wrench,
  X,
  Zap,
} from "../icons";
import { log } from "../logger.js";
import { fetchAllTransactions, getConnections } from "../plaid.js";
import {
  applyStoredTransactionOverrides,
  getHydratedStoredTransactions,
  normalizeStoredTransactions,
} from "../storedTransactions.js";
import { saveTransactionLinkOverride } from "../transactionLinkOverrides.js";
import { Card } from "../ui.js";
import "./TransactionFeed.css";
import {
  analyzeTransactionRewards,
  buildCategoryBreakdown,
  buildTransactionAccounts,
  buildTransactionCategories,
  buildTransactionStats,
  filterTransactions,
  groupTransactionsByDate,
} from "./transactionFeed/derived";
import {
  buildCSV,
  formatDateHeader,
  getCategoryLabel,
  getCategoryMeta,
} from "./transactionFeed/helpers";
import { TransactionRow } from "./transactionFeed/TransactionRow";
import type {
  IconComponent,
  LegacyTransactionResult,
  PlaidConnection,
  TransactionLinkOverrideMap,
  TransactionRecord,
} from "./transactionFeed/types";
import { useTransactionFeedGestures } from "./transactionFeed/useTransactionFeedGestures";

const LazyProPaywall = lazy(() => import("./ProPaywall.js"));

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

const CATEGORY_ICON_MAP: Record<string, IconComponent> = {
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
export default function TransactionFeed({ onClose, proEnabled = false, onConnectPlaid }: TransactionFeedProps) {
  const [showPaywall, setShowPaywall] = useState(false);
  const { cards } = usePortfolio();
  const { financialConfig } = useSettings();
  const appWindow = window as Window & { toast?: ToastApi };
  const categoryIconMap = CATEGORY_ICON_MAP;
  
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
  const [reviewingTransactionId, setReviewingTransactionId] = useState<string | null>(null);
  const [transactionLinkOverrides, setTransactionLinkOverrides] = useState<TransactionLinkOverrideMap>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const activeCreditCards = useMemo(() => cards.filter(card => card.type === "credit" || !card.type), [cards]);

  // ── Load stored transactions on mount ──
  useEffect(() => {
    (async () => {
      try {
        const [stored, connections] = await Promise.all([
          getHydratedStoredTransactions(),
          getConnections(),
        ]);
        if (stored?.data?.length) {
          setTransactions(stored.data as TransactionRecord[]);
          setFetchedAt(stored.fetchedAt);
        }
        setTransactionLinkOverrides((stored?.overrides || {}) as TransactionLinkOverrideMap);
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
      const result = normalizeStoredTransactions(
        (await fetchAllTransactions(
          proEnabled ? 30 : 14,
          proEnabled ? undefined : { maxTransactions: 5, categorizeWithAi: false }
        )) as LegacyTransactionResult
      );
      const connections = (await getConnections()) as PlaidConnection[];
      setTransactions(applyStoredTransactionOverrides(result.data as TransactionRecord[], transactionLinkOverrides));
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
  }, [appWindow, proEnabled, transactionLinkOverrides]);

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
  const isFreeLedgerPreview = !proEnabled;
  const emptyStateTitle = needsReconnectOnly
    ? "Reconnect Required"
    : hasPlaidConnections
      ? (isFreeLedgerPreview ? "No Ledger Preview Yet" : "No Synced Transactions Yet")
      : (isFreeLedgerPreview ? "Unlock Your Ledger Preview" : "No Transactions Yet");
  const emptyStateMessage = needsReconnectOnly
    ? "Your linked bank connections need to be reconnected in Settings before Catalyst can sync transactions again."
    : hasPlaidConnections
      ? (
        isFreeLedgerPreview
          ? "Your account is already linked. Sync now to load your live 5-transaction ledger preview from Plaid."
          : "Your accounts are already linked. Sync the ledger to pull recent Plaid transactions, or connect another bank."
      )
      : (
        isFreeLedgerPreview
          ? "Connect one Plaid account to see your live ledger preview here. Free includes a 5-transaction preview for one linked institution."
          : "Connect a bank account via Plaid in Settings to see your transaction history here."
      );

  const categories = useMemo(() => buildTransactionCategories(transactions), [transactions]);
  const accounts = useMemo(() => buildTransactionAccounts(transactions), [transactions]);
  const filtered = useMemo(
    () =>
      filterTransactions(transactions, {
        searchQuery,
        activeCategory,
        activeAccount,
      }),
    [transactions, searchQuery, activeCategory, activeAccount]
  );
  const rewardAnalysis = useMemo(
    () => analyzeTransactionRewards(filtered, cards, financialConfig?.customValuations),
    [filtered, cards, financialConfig?.customValuations]
  );
  const displayTransactions = rewardAnalysis.transactions;
  const grouped = useMemo(
    () => groupTransactionsByDate(displayTransactions, { proEnabled, visibleCount }),
    [displayTransactions, proEnabled, visibleCount]
  );
  const stats = useMemo(() => buildTransactionStats(displayTransactions), [displayTransactions]);
  const categoryBreakdown = useMemo(
    () => buildCategoryBreakdown(displayTransactions, categoryIconMap),
    [categoryIconMap, displayTransactions]
  );
  const missedOpportunities = rewardAnalysis.summary;

  const handleOverrideTransactionLink = useCallback(async (txn: TransactionRecord, override: { linkedCardId?: string | null; linkedBankAccountId?: string | null }) => {
    if (!txn.id) return;
    const nextOverrides = await saveTransactionLinkOverride(txn.id, override);
    setTransactionLinkOverrides(nextOverrides as TransactionLinkOverrideMap);
    setTransactions(prev => applyStoredTransactionOverrides(prev, nextOverrides as TransactionLinkOverrideMap));
    setReviewingTransactionId(null);
    appWindow.toast?.success?.("Transaction payment method updated");
  }, [appWindow]);

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
      const { nativeExport } = await import("../nativeExport.js");
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
      const { nativeExport } = await import("../nativeExport.js");
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
          background: T.bg.base,
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
            border: `1px solid ${T.border.subtle}`,
            background: T.bg.elevated,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: T.text.secondary,
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
                border: `1px solid ${T.border.subtle}`,
                background: T.bg.elevated,
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
              border: `1px solid ${T.border.subtle}`,
              background: T.bg.elevated,
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
            background: T.bg.card,
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
              background: T.bg.base,
            }}
          >
            <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 6, padding: "10px 12px", borderRadius: T.radius.md, background: T.bg.card, border: `1px solid ${T.border.subtle}` }}>
              <TrendingDown size={13} color={T.status.red} />
              <span style={{ fontSize: 11, color: T.text.dim, fontWeight: 600 }}>Spent</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: T.text.primary, fontVariantNumeric: "tabular-nums" }}>
                {stats.totalSpent.toLocaleString("en-US", { style: "currency", currency: "USD" })}
              </span>
            </div>
            <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 6, padding: "10px 12px", borderRadius: T.radius.md, background: T.bg.card, border: `1px solid ${T.border.subtle}` }}>
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
              background: T.bg.card,
              border: `1px solid ${T.status.red}18`,
              borderRadius: T.radius.lg,
              padding: 14,
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
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
                color: T.text.primary, 
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
                About <strong style={{ color: T.text.primary, fontVariantNumeric: "tabular-nums" }}>{missedOpportunities.totalMissedValue.toLocaleString("en-US", { style: "currency", currency: "USD" })}</strong> in value was left on the table this month across {missedOpportunities.badTxns} transactions. The review rows below call out the better card when Catalyst can identify one.
              </p>
            </div>
          </div>
        )}

        {/* ─── SPENDING BREAKDOWN ─── */}
        {!loading && proEnabled && transactions.length > 0 && categoryBreakdown.length > 0 && (
          <div
            style={{
              borderBottom: `1px solid ${T.border.subtle}`,
              background: T.bg.base,
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
                color: T.text.dim,
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
                        {meta.icon && <meta.icon size={14} color={meta.color} strokeWidth={2} />}
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
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {getCategoryLabel(category)}
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
              background: T.bg.base,
            }}
          >
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: T.bg.card,
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
                border: `1px solid ${showFilters || hasFilters ? T.accent.primary + "45" : T.border.subtle}`,
                background: showFilters || hasFilters ? T.accent.primaryDim : T.bg.elevated,
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
              background: T.bg.base,
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
                    background: `${T.status.red}12`,
                      color: T.status.red,
                      border: `1px solid ${T.status.red}22`,
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
                        background: active ? meta.bg : T.bg.card,
                        color: active ? meta.color : T.text.dim,
                        border: `1px solid ${active ? meta.color + "35" : T.border.subtle}`,
                      }}
                    >
                      {getCategoryLabel(cat)}
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
                        background: active ? T.accent.primaryDim : T.bg.card,
                        color: active ? T.accent.primary : T.text.dim,
                        border: `1px solid ${active ? T.accent.primary + "35" : T.border.subtle}`,
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
                      {hasPlaidConnections ? "Connect Another Bank" : (isFreeLedgerPreview ? "Connect Plaid for Preview" : "Connect with Plaid")}
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
                  return (
                    <TransactionRow
                      key={txn.id || `${group.date}-${ti}`}
                      txn={txn}
                      animationDelay={`${(gi * 5 + ti) * 0.02}s`}
                      categoryIconMap={categoryIconMap}
                      activeCreditCards={activeCreditCards}
                      isReviewing={reviewingTransactionId === txn.id}
                      onToggleReview={() => setReviewingTransactionId(reviewingTransactionId === txn.id ? null : txn.id || null)}
                      onOverrideLink={handleOverrideTransactionLink}
                    />
                  );
                })}
              </div>
            ))}

            {/* Pro Teaser Banner */}
            {!proEnabled && transactions.length > 0 && (
              <div style={{ padding: "8px 16px 24px" }}>
                <Card
                  style={{
                    background: `linear-gradient(135deg, ${T.bg.card}, ${T.accent.primary}0F)`,
                    border: `1px solid ${T.border.subtle}`,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                    textAlign: "left",
                    padding: 18,
                    gap: 14,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 14,
                        background: `${T.accent.primary}18`,
                        border: `1px solid ${T.accent.primary}20`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Lock size={20} color={T.accent.primary} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 900, color: T.accent.primary, fontFamily: T.font.mono, letterSpacing: "0.08em", marginBottom: 3 }}>
                        PRO LEDGER
                      </div>
                      <h4 style={{ fontSize: 16, fontWeight: 800, color: T.text.primary, margin: 0 }}>
                      Unlock Full Ledger
                      </h4>
                    </div>
                  </div>
                  <div>
                    <p style={{ fontSize: 13, color: T.text.secondary, margin: 0, lineHeight: 1.55 }}>
                      Free includes a live 5-transaction preview for one linked institution. Upgrade to Pro for full
                      multi-account search, deeper filtering, export, and the complete ledger.
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 11, color: T.text.dim, lineHeight: 1.45 }}>
                      Better for cleanup, audits, and recurring-spend analysis.
                    </div>
                    <button
                      onClick={() => { haptic.medium(); setShowPaywall(true); }}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 12,
                        border: `1px solid ${T.accent.primary}2a`,
                        background: `${T.accent.primary}14`,
                        color: T.accent.primary,
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      See Pro
                    </button>
                  </div>
                </Card>
              </div>
            )}

            {showPaywall && (
              <Suspense fallback={null}>
                <LazyProPaywall onClose={() => setShowPaywall(false)} source="ledger" />
              </Suspense>
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
