// ═══════════════════════════════════════════════════════════════
// TransactionFeed — Unified Plaid Transaction Viewer
// Premium Apple-Wallet-style UI with date grouping, search,
// filtering, and CSV/JSON export.
// ═══════════════════════════════════════════════════════════════

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { TouchEvent } from "react";
import {
  ArrowLeft,
  Search,
  X,
  Download,
  Filter,
  ArrowUpRight,
  ArrowDownLeft,
  ShoppingCart,
  Utensils,
  Car,
  Home,
  Zap,
  Briefcase,
  Heart,
  Plane,
  GraduationCap,
  Gamepad2,
  Wifi,
  CreditCard,
  Building2,
  Banknote,
  HelpCircle,
  Clock,
  FileText,
  FileSpreadsheet,
  ChevronDown,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Landmark,
  Stethoscope,
  Wrench,
  PiggyBank,
  Gift,
  Baby,
  Dumbbell,
  Sparkles,
  Lock,
} from "../icons";
import { T } from "../constants.js";
import { Card } from "../ui.js";
import { EmptyState } from "../components.js";
import { nativeExport } from "../utils.js";
import { getStoredTransactions, fetchAllTransactions, getConnections } from "../plaid.js";
import { usePortfolio } from "../contexts/PortfolioContext.js";
import { useSettings } from "../contexts/SettingsContext.js";
import { getOptimalCard } from "../rewardsCatalog.js";
import { haptic } from "../haptics.js";
import "./TransactionFeed.css";
import type { Card as PortfolioCard, CustomValuations } from "../../types/index.js";

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
}

interface TransactionResult {
  data: TransactionRecord[];
  fetchedAt: string;
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

interface SwipeState {
  x: number;
  y: number;
  t: number;
}

interface PullState {
  y: number;
  hapticFired: boolean;
}

// ── Category → Icon + Color Mapping (full Plaid v2 coverage) ──
const CATEGORY_MAP = {
  // Food & Drink
  "food and drink": { icon: Utensils, color: "#F59E0B", bg: "rgba(245,158,11,0.10)" },
  groceries: { icon: ShoppingCart, color: "#F59E0B", bg: "rgba(245,158,11,0.10)" },
  restaurants: { icon: Utensils, color: "#F59E0B", bg: "rgba(245,158,11,0.10)" },
  // Shopping
  shops: { icon: ShoppingCart, color: "#8B5CF6", bg: "rgba(139,92,246,0.10)" },
  "general merchandise": { icon: ShoppingCart, color: "#8B5CF6", bg: "rgba(139,92,246,0.10)" },
  // Travel & Transportation
  travel: { icon: Plane, color: "#3B82F6", bg: "rgba(59,130,246,0.10)" },
  transportation: { icon: Car, color: "#6366F1", bg: "rgba(99,102,241,0.10)" },
  automotive: { icon: Car, color: "#6366F1", bg: "rgba(99,102,241,0.10)" },
  // Transfers & Payments
  transfer: { icon: ArrowUpRight, color: "#6B7280", bg: "rgba(107,114,128,0.10)" },
  "transfer in": { icon: ArrowDownLeft, color: "#2ECC71", bg: "rgba(46,204,113,0.10)" },
  "transfer out": { icon: ArrowUpRight, color: "#6B7280", bg: "rgba(107,114,128,0.10)" },
  payment: { icon: CreditCard, color: "#7B5EA7", bg: "rgba(123,94,167,0.10)" },
  "loan payments": { icon: Building2, color: "#F97316", bg: "rgba(249,115,22,0.10)" },
  // Housing & Utilities
  "rent and utilities": { icon: Home, color: "#0EA5E9", bg: "rgba(14,165,233,0.10)" },
  utilities: { icon: Zap, color: "#0EA5E9", bg: "rgba(14,165,233,0.10)" },
  "home improvement": { icon: Wrench, color: "#0EA5E9", bg: "rgba(14,165,233,0.10)" },
  // Services
  service: { icon: Briefcase, color: "#14B8A6", bg: "rgba(20,184,166,0.10)" },
  "general services": { icon: Briefcase, color: "#14B8A6", bg: "rgba(20,184,166,0.10)" },
  subscription: { icon: Wifi, color: "#A855F7", bg: "rgba(168,85,247,0.10)" },
  // Health & Personal
  healthcare: { icon: Stethoscope, color: "#EF4444", bg: "rgba(239,68,68,0.10)" },
  medical: { icon: Stethoscope, color: "#EF4444", bg: "rgba(239,68,68,0.10)" },
  "personal care": { icon: Heart, color: "#EC4899", bg: "rgba(236,72,153,0.10)" },
  fitness: { icon: Dumbbell, color: "#10B981", bg: "rgba(16,185,129,0.10)" },
  // Entertainment & Recreation
  recreation: { icon: Gamepad2, color: "#EC4899", bg: "rgba(236,72,153,0.10)" },
  entertainment: { icon: Gamepad2, color: "#EC4899", bg: "rgba(236,72,153,0.10)" },
  // Education
  education: { icon: GraduationCap, color: "#2563EB", bg: "rgba(37,99,235,0.10)" },
  // Community & Giving
  community: { icon: Heart, color: "#F43F5E", bg: "rgba(244,63,94,0.10)" },
  "gifts and donations": { icon: Gift, color: "#F43F5E", bg: "rgba(244,63,94,0.10)" },
  "government and non profit": { icon: Landmark, color: "#3B82F6", bg: "rgba(59,130,246,0.10)" },
  // Income & Banking
  income: { icon: Banknote, color: "#2ECC71", bg: "rgba(46,204,113,0.10)" },
  "bank fees": { icon: Building2, color: "#EF4444", bg: "rgba(239,68,68,0.10)" },
  interest: { icon: PiggyBank, color: "#2ECC71", bg: "rgba(46,204,113,0.10)" },
  // Children
  childcare: { icon: Baby, color: "#F59E0B", bg: "rgba(245,158,11,0.10)" },
};

function getCategoryMeta(category: string | null | undefined) {
  if (!category) return { icon: HelpCircle, color: T.text.dim, bg: "rgba(107,114,128,0.08)" };
  const key = category.toLowerCase().trim();
  return CATEGORY_MAP[key] || { icon: HelpCircle, color: T.text.dim, bg: "rgba(107,114,128,0.08)" };
}

// ── Date formatting helpers ──────────────────────────────────
function formatDateHeader(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00"); // Avoid timezone shift
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";

  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function formatMoney(amount: number, isCredit: boolean) {
  const formatted = amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
  return isCredit ? `+${formatted}` : formatted;
}

// ── CSV builder ──────────────────────────────────────────────
function buildCSV(transactions: TransactionRecord[]) {
  const headers = ["Date", "Description", "Amount", "Type", "Category", "Account", "Institution", "Pending"];
  const rows = transactions.map(t =>
    [
      t.date,
      `"${(t.description || "").replace(/"/g, '""')}"`,
      t.isCredit ? t.amount : -t.amount,
      t.isCredit ? "Credit" : "Debit",
      `"${t.category || ""}"`,
      `"${t.accountName || ""}"`,
      `"${t.institution || ""}"`,
      t.pending ? "Yes" : "No",
    ].join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

function normalizeTransactionResult(result: LegacyTransactionResult | null | undefined): TransactionResult {
  return {
    data: result?.data || result?.transactions || [],
    fetchedAt: result?.fetchedAt || "",
  };
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function TransactionFeed({ onClose, proEnabled = false, onConnectPlaid }: TransactionFeedProps) {
  const { cards } = usePortfolio();
  const { financialConfig } = useSettings();
  const appWindow = window as Window & { toast?: ToastApi };
  
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
  const [slideOffset, setSlideOffset] = useState(0);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const swipeRef = useRef<SwipeState | null>(null);
  const pullRef = useRef<PullState | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);

  // ── Swipe-from-edge-to-dismiss (iOS native feel) ──
  const handleOverlayTouchStart = useCallback((e: TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    const x = touch.clientX;
    if (x < 40) {
      // Left edge only
      swipeRef.current = { x, y: touch.clientY, t: Date.now() };
    } else {
      swipeRef.current = null;
    }
  }, []);

  const handleOverlayTouchMove = useCallback(
    (e: TouchEvent<HTMLDivElement>) => {
      if (!swipeRef.current) {
        // Pull-to-refresh logic (tolerance for momentum scroll artifacts)
        if (scrollRef.current && scrollRef.current.scrollTop <= 2 && !refreshing) {
          const touch = e.touches[0];
          if (!touch) return;
          if (!pullRef.current) {
            pullRef.current = { y: touch.clientY, hapticFired: false };
            setIsPulling(true);
          }
          const dy = Math.max(0, touch.clientY - pullRef.current.y);
          const distance = Math.min(dy * 0.5, 80);
          setPullDistance(distance);
          // Haptic bump when crossing the refresh threshold
          if (distance >= 60 && !pullRef.current.hapticFired) {
            pullRef.current.hapticFired = true;
            haptic.light();
          }
        }
        return;
      }
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - swipeRef.current.x;
      if (dx > 0) {
        setSlideOffset(dx);
        e.preventDefault();
      }
    },
    [refreshing]
  );

  const handleOverlayTouchEnd = useCallback(
    (e: TouchEvent<HTMLDivElement>) => {
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
      if (!swipeRef.current) {
        setSlideOffset(0);
        return;
      }
      const touch = e.changedTouches[0];
      if (!touch) {
        setSlideOffset(0);
        return;
      }
      const dx = touch.clientX - swipeRef.current.x;
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
    },
    [pullDistance, refreshing, onClose]
  );

  const handleRefreshFromPull = useCallback(async () => {
    setRefreshing(true);
    haptic.light();
    try {
      const result = normalizeTransactionResult((await fetchAllTransactions(30)) as LegacyTransactionResult);
      const connections = (await getConnections()) as PlaidConnection[];
      setTransactions(result.data);
      setFetchedAt(result.fetchedAt);
      setPlaidConnections(connections || []);
      appWindow.toast?.success?.(`Synced ${result.data.length} transactions`);
    } catch (e) {
      console.warn("[TransactionFeed] Pull refresh failed:", e);
      appWindow.toast?.error?.("Failed to refresh transactions");
    } finally {
      setRefreshing(false);
    }
  }, [appWindow]);

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
      const result = normalizeTransactionResult((await fetchAllTransactions(30)) as LegacyTransactionResult);
      const connections = (await getConnections()) as PlaidConnection[];
      setTransactions(result.data);
      setFetchedAt(result.fetchedAt);
      setPlaidConnections(connections || []);
      appWindow.toast?.success?.(`Synced ${result.data.length} transactions`);
    } catch (e) {
      console.warn("[TransactionFeed] Refresh failed:", e);
      appWindow.toast?.error?.("Failed to refresh transactions");
    } finally {
      setRefreshing(false);
    }
  }, [appWindow]);

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
        meta: getCategoryMeta(cat),
      }));
  }, [filtered]);

  // ── Missed Opportunity Radar ──
  const missedOpportunities = useMemo(() => {
    if (!cards || cards.length === 0 || filtered.length === 0) return { totalMissedValue: 0, optimalTxns: 0, badTxns: 0 };
    
    let totalMissedValue = 0;
    let optimalTxns = 0;
    let badTxns = 0;
    
    // Only analyze debit transactions with recognizable categories
    const analyzableTxns = filtered.filter(t => !t.isCredit && t.category && t.amount > 0);
    
    for (const txn of analyzableTxns) {
      const bestCard = getOptimalCard(cards as PortfolioCard[], txn.category || "catch-all", financialConfig?.customValuations as CustomValuations | undefined);
      if (!bestCard) continue;
      
      const optimalYield = bestCard.effectiveYield;
      
      // Attempt to figure out what card was actually used
      // Since Plaid gives us the account name, we can try matching it to our portfolio
      const usedCard = (cards as PortfolioCard[]).find(c => 
        (txn.accountName && c.name.toLowerCase().includes(txn.accountName.toLowerCase())) || 
        (txn.institution && c.name.toLowerCase().includes(txn.institution.toLowerCase()))
      );
      
      let actualYield = 1.0; // Assume 1% baseline if we can't identify the card
      if (usedCard) {
        // If we know the card they used, calculate its true yield for this category
        const usedCardData = getOptimalCard([usedCard], txn.category || "catch-all", financialConfig?.customValuations as CustomValuations | undefined);
        if (usedCardData) {
          actualYield = usedCardData.effectiveYield;
        }
      }
      
      // Calculate delta
      if (optimalYield > actualYield) {
        const yieldDiff = optimalYield - actualYield;
        const dollarImpact = (txn.amount * yieldDiff) / 100;
        totalMissedValue += dollarImpact;
        badTxns++;
        
        // Attach optimal card data to the transaction for rendering the taglet later
        txn.optimalCard = bestCard;
      } else {
        optimalTxns++;
        txn.optimalCard = bestCard;
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
    } catch (e) {
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
    } catch (e) {
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
      onTouchMove={handleOverlayTouchMove}
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
                animation: refreshing ? "ringSweep 1s linear infinite" : `rotate(${pullDistance * 4}deg)`,
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
                animation: refreshing ? "ringSweep 1s linear infinite" : "none",
              }}
            />
          </button>
        </div>
      </header>

      {/* ─── EXPORT DROPDOWN ─── */}
      {showExportMenu && (
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

      {/* ─── SUMMARY BAR ─── */}
      {!loading && transactions.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "10px 16px",
            borderBottom: `1px solid ${T.border.subtle}`,
            background: T.bg.card,
            flexShrink: 0,
          }}
        >
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

      {/* ─── MISSED OPPORTUNITY RADAR ─── */}
      {!loading && missedOpportunities.totalMissedValue > 0 && (
        <div 
          className="txn-missed-opp-banner"
          style={{
            margin: "12px 16px",
            background: `linear-gradient(135deg, ${T.status.redDim}, ${T.bg.surface})`,
            border: `1px solid ${T.status.red}40`,
            borderRadius: T.radius.lg,
            padding: 16,
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            boxShadow: T.shadow.sm,
            animation: "txnSlideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <div 
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              background: T.status.red,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: `0 4px 12px ${T.status.red}40`
            }}
          >
            <Zap size={16} color="#FFF" strokeWidth={2.5} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4 style={{ 
              fontSize: 14, 
              fontWeight: 800, 
              color: T.status.red, 
              margin: "0 0 4px 0",
              letterSpacing: "-0.01em"
            }}>
              Missed Opportunity Radar
            </h4>
            <p style={{ 
              fontSize: 12, 
              color: T.text.secondary, 
              lineHeight: 1.4,
              margin: 0 
            }}>
              You lost <strong style={{ color: T.text.primary, fontVariantNumeric: "tabular-nums" }}>{missedOpportunities.totalMissedValue.toLocaleString("en-US", { style: "currency", currency: "USD" })}</strong> in value this month by using the wrong card on {missedOpportunities.badTxns} past transactions. Look for the <span style={{ color: T.accent.primary, fontWeight: 700 }}>Best Card</span> badges below.
            </p>
          </div>
        </div>
      )}

      {/* ─── SPENDING BREAKDOWN ─── */}
      {!loading && transactions.length > 0 && categoryBreakdown.length > 0 && (
        <div
          style={{
            borderBottom: `1px solid ${T.border.subtle}`,
            background: T.bg.card,
            flexShrink: 0,
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
      {!loading && transactions.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            borderBottom: `1px solid ${T.border.subtle}`,
            background: T.bg.card,
            flexShrink: 0,
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
            style={{
              width: 38,
              height: 38,
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
      {showFilters && (
        <div
          style={{
            padding: "8px 0 4px",
            borderBottom: `1px solid ${T.border.subtle}`,
            background: T.bg.card,
            flexShrink: 0,
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
                const meta = getCategoryMeta(cat);
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
                  const meta = getCategoryMeta(txn.category);
                  const Icon = meta.icon;
                  return (
                    <div
                      key={txn.id || `${group.date}-${ti}`}
                      className="txn-row"
                      style={{
                        display: "flex",
                        alignItems: "center",
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
                        {txn.optimalCard && !txn.isCredit && (
                          <div style={{ marginTop: 4, display: "flex", alignItems: "center" }}>
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
                              gap: 3
                            }}>
                              <Sparkles size={10} />
                              {txn.usedOptimal ? "Used Best Card: " : "Should've Used: "} 
                              {(() => {
                                const optimalCardName = txn.optimalCard.name || "Best Card";
                                return optimalCardName.length > 18 ? `${optimalCardName.substring(0, 15)}...` : optimalCardName;
                              })()} ({txn.optimalCard.effectiveYield}x)
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Amount */}
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          flexShrink: 0,
                          fontVariantNumeric: "tabular-nums",
                          color: txn.isCredit ? T.status.green : T.text.primary,
                        }}
                      >
                        {formatMoney(txn.amount, !!txn.isCredit)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Pro Teaser Banner */}
            {!proEnabled && filtered.length > 5 && (
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
                      You have {filtered.length - 5} more transactions hidden. Upgrade to Pro to search, filter, and export your entire financial history.
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
