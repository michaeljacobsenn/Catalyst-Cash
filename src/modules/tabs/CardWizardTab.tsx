  import React,{ lazy,Suspense,useEffect,useMemo,useRef,useState } from "react";
  import type { CatalystCashConfig,Card as PortfolioCard } from "../../types/index.js";
  import { classifyMerchant } from "../api.js";
  import { getShortCardLabel } from "../cards.js";
  import { T } from "../constants.js";
  import { log } from "../logger.js";
  import { inferMerchantIdentity } from "../merchantIdentity.js";
  import { usePortfolio } from "../contexts/PortfolioContext.js";
  import { useSettings } from "../contexts/SettingsContext.js";
  import GeoSuggestWidget from "../dashboard/GeoSuggestWidget.js";
  import { haptic } from "../haptics.js";
  import RewardCardVisual from "../RewardCardVisual.js";
  import {
    AlertCircle,
    Check,
    ChevronDown,
    Clock,
    Coffee,
    CreditCard,
    DollarSign,
    Fuel,
    Info,
    Lock,
    Package,
    Pill,
    Plane,
    RefreshCw,
    RotateCw,
    Search,
    Settings2,
    ShoppingCart,
    Smartphone,
    Sparkles,
    Store,
    Target,
    Train,
    TrendingUp,
    Tv,
    X,
    Zap
  } from "../icons";
  import { extractCategoryByKeywords,MERCHANT_DATABASE } from "../merchantDatabase.js";
  import { getCardMultiplier,VALUATIONS } from "../rewardsCatalog.js";
  import { REWARDS_RUNTIME_UPDATED_EVENT } from "../rewardsRuntime.js";
  import { getHydratedStoredTransactions } from "../storedTransactions.js";
  import { Badge,Card,FormGroup,FormRow,InlineTooltip,Skeleton } from "../ui.js";
  import { db } from "../utils.js";
  import { estimateRewardCapUsage, getCategoryLabel, shouldHighlightRewardMiss } from "./transactionFeed/helpers";
  import { analyzeTransactionRewards } from "./transactionFeed/derived";

const LazyProPaywall = lazy(() => import("./ProPaywall.js"));

// ── Controversial Merchants (coded differently across card issuers) ──
// These are merchants where the same transaction can be categorized under
// different spend categories depending on which card/issuer processes it.
const CONTROVERSIAL_MERCHANTS = {
  // Gas station convenience hybrids — gas at Chase/Citi, often "other" at Capital One/Amex
  "7-eleven":     { issuers: "Chase/Citi → Gas · Capital One → Other", tip: "7-Eleven codes as gas at most issuers but falls into catch-all at Capital One.", overrides: { "chase": "gas", "citi": "gas", "capital one": "catch-all", "amex": "catch-all" } },
  "wawa":         { issuers: "Chase/Citi → Gas · Amex → Other", tip: "Wawa codes as a gas/convenience purchase; category varies by issuer.", overrides: { "chase": "gas", "citi": "gas", "amex": "catch-all" } },
  "sheetz":       { issuers: "Chase → Gas · Capital One → Other", tip: "Sheetz is typically gas but some issuers treat it as general retail.", overrides: { "chase": "gas", "capital one": "catch-all" } },
  "casey's":      { issuers: "Chase → Gas · Others → Varies", tip: "Casey's General Store is often coded as gas but varies by issuer.", overrides: { "chase": "gas" } },
  "quiktrip":     { issuers: "Chase → Gas · Capital One → Other", tip: "QuikTrip typically codes as gas but varies across issuers.", overrides: { "chase": "gas", "capital one": "catch-all" } },
  "buc-ee's":     { issuers: "Chase → Gas · Others → Varies", tip: "Buc-ee's is a large gas/convenience chain; category varies by issuer.", overrides: { "chase": "gas" } },
  "speedway":     { issuers: "Chase → Gas · Others → Varies", tip: "Speedway codes as gas at most issuers but may vary.", overrides: { "chase": "gas" } },
  "circle k":     { issuers: "Chase → Gas · Capital One → Other", tip: "Circle K is often coded as gas but can fall into other categories.", overrides: { "chase": "gas", "capital one": "catch-all" } },
  "racetrac":     { issuers: "Various → Gas or Other", tip: "RaceTrac is a gas/convenience hybrid; coding varies by issuer.", overrides: {} },
  // Superstores — wholesale/superstore (no grocery bonus) at most, but some edge cases
  "walmart":      { issuers: "Most → Wholesale/Other · Amex Gold → Check Notes", tip: "Walmart is excluded from grocery bonuses at most issuers and counts as wholesale/other.", overrides: {} },
  "target":       { issuers: "Most → Wholesale/Other", tip: "Target is excluded from grocery bonuses at most issuers — it codes as wholesale or general retail.", overrides: {} },
  "meijer":       { issuers: "Some → Groceries · Others → Wholesale", tip: "Meijer is coded as groceries at some issuers but wholesale/other at others.", overrides: { "chase": "groceries", "citi": "groceries" } },
  // Online ambiguity
  "paypal":       { issuers: "Citi/Chase → Online Shopping · Amex/Capital One → Catch-all", tip: "PayPal transactions may or may not trigger online shopping bonuses depending on issuer.", overrides: { "citi": "online_shopping", "chase": "online_shopping", "amex": "catch-all", "capital one": "catch-all" } },
  "venmo":        { issuers: "Most → Catch-all", tip: "Venmo purchases vary widely; many issuers treat them as catch-all.", overrides: {} },
  // Travel ambiguity
  "airbnb":       { issuers: "Chase/Amex → Travel · Capital One → Catch-all", tip: "Airbnb codes as travel at premium cards but catch-all at others.", overrides: { "chase": "travel", "amex": "travel", "capital one": "catch-all" } },
  "vrbo":         { issuers: "Chase → Travel · Others → Catch-all", tip: "VRBO may or may not trigger travel bonuses depending on your card issuer.", overrides: { "chase": "travel", "amex": "travel" } },
  // Warehouse gas — same issuer can split gas vs membership
  "costco gas":   { issuers: "Citi Costco → Gas · Others → Varies", tip: "Costco gas stations at most issuers code as gas, but the Costco membership fee does not.", overrides: { "citi": "gas" } },
  "sam's club":   { issuers: "Most → Wholesale · Walmart Visa → Special rate", tip: "Sam's Club often codes as wholesale clubs, not grocery.", overrides: {} },
};

function getControversialWarning(merchantName) {
  if (!merchantName) return null;
  const lower = merchantName.toLowerCase().trim();
  // Exact match
  if (CONTROVERSIAL_MERCHANTS[lower]) return CONTROVERSIAL_MERCHANTS[lower];
  // Partial match
  const key = Object.keys(CONTROVERSIAL_MERCHANTS).find(k => lower.includes(k) || k.includes(lower));
  return key ? CONTROVERSIAL_MERCHANTS[key] : null;
}

// Returns the category this specific issuer actually uses for a merchant, or null if no override known.
// e.g. getIssuerCategoryOverride("7-Eleven", "Capital One") → "catch-all"
//      getIssuerCategoryOverride("7-Eleven", "Chase") → "gas"
function getIssuerCategoryOverride(merchantName, institution) {
  if (!merchantName || !institution) return null;
  const entry = getControversialWarning(merchantName);
  if (!entry?.overrides || Object.keys(entry.overrides).length === 0) return null;
  const instLower = institution.toLowerCase();
  const matchKey = Object.keys(entry.overrides).find(k => instLower.includes(k) || k.includes(instLower));
  return matchKey ? entry.overrides[matchKey] : null;
}

const QUICK_CATEGORIES = [
  { id: "dining", label: "Dining", icon: Coffee, color: T.status.amber, bg: T.status.amberDim },
  { id: "groceries", label: "Groceries", icon: ShoppingCart, color: T.status.green, bg: T.status.greenDim },
  { id: "gas", label: "Gas", icon: Fuel, color: T.status.red, bg: T.status.redDim },
  { id: "travel", label: "Travel", icon: Plane, color: T.status.blue, bg: T.status.blueDim },
  { id: "transit", label: "Transit", icon: Train, color: T.accent.primary, bg: T.accent.primaryDim },
  { id: "online_shopping", label: "Online", icon: Package, color: T.status.purple, bg: T.status.purpleDim },
  { id: "streaming", label: "Streaming", icon: Tv, color: T.status.blue, bg: T.status.blueDim },
  { id: "wholesale_clubs", label: "Wholesale", icon: Store, color: T.accent.copper, bg: T.accent.copperDim },
  { id: "drugstores", label: "Pharmacy", icon: Pill, color: T.status.green, bg: T.status.greenDim },
];

const REWARD_CATEGORY_LABELS: Record<string, string> = {
  dining: "Dining",
  groceries: "Groceries",
  gas: "Gas",
  travel: "Travel",
  transit: "Transit",
  online_shopping: "Online shopping",
  streaming: "Streaming",
  wholesale_clubs: "Wholesale clubs",
  drugstores: "Pharmacy",
  "catch-all": "Everywhere else",
};

// ── Persistent Search History — stored via db for proper data-layer consistency ──
// Module-level cache so history persists across tab navigation without re-fetching.
const HISTORY_KEY = "cw-search-history";
interface MerchantOption {
  id?: string | number;
  name: string;
  category: string;
  color?: string | null;
}

interface RewardInfo {
  multiplier: number;
  effectiveYield: number;
  isFlexible: boolean;
  potentialMax: number | null;
  base: number;
  currency: string;
  cap: number | null;
  capPeriod?: string | null;
  cpp: number;
  notes: string | null;
  rotating: number | null;
  mobileWallet: number | null;
}

type Recommendation = Omit<PortfolioCard, "notes"> & {
  multiplier: number;
  currentMultiplier: number;
  effectiveYield: number;
  isFlexible: boolean;
  potentialMax: number | null;
  baseMultiplier: number;
  currency: string;
  cap: number | null;
  usedCap: number;
  blendedMsg: string | null;
  isCappedOut: boolean;
  cpp: number;
  utilization: number;
  notes?: string;
  rotating: number | null;
  mobileWallet: number | null;
  issuerCategory: string | null;
  effectiveCategory: string;
};

interface RewardSnapshotSummary {
  analyzedCount: number;
  totalMissedValue: number;
  badTxns: number;
  optimalTxns: number;
  topMissedTransaction: {
    merchant: string;
    bestCard: string;
    delta: number;
    category: string;
  } | null;
  topMissedCategories: Array<{
    category: string;
    delta: number;
    bestCard: string;
  }>;
  topMissedTransactions: Array<{
    merchant: string;
    bestCard: string;
    delta: number;
    category: string;
    amount: number;
    usedPayment: string;
  }>;
}

interface RewardCategoryLeader {
  categoryId: string;
  label: string;
  icon: typeof QUICK_CATEGORIES[number]["icon"];
  color: string;
  bg: string;
  winner: PortfolioCard | null;
  effectiveYield: number;
  rateLabel: string;
}

const TypedFormRow = FormRow as unknown as React.ComponentType<{
  label?: React.ReactNode;
  isLast?: boolean;
  children?: React.ReactNode;
}>;

let searchHistory: MerchantOption[] = [];
// Async load on module init — brief empty state on first render is acceptable
db.get(HISTORY_KEY).then(val => { if (Array.isArray(val)) searchHistory = val as MerchantOption[]; }).catch(() => {});

function addToHistory(merchant: MerchantOption) {
  if (!merchant || !merchant.name) return;
  searchHistory = [merchant, ...searchHistory.filter(m => m.name !== merchant.name)].slice(0, 5);
  db.set(HISTORY_KEY, searchHistory);
}

let cachedQuery = "";
let cachedCategory: string | null = null;
let cachedMerchant: MerchantOption | null = null;

interface CardWizardTabProps {
  proEnabled?: boolean;
  embedded?: boolean;
  privacyMode?: boolean;
}

type UsedCaps = Record<string, number | "">;
type StatementCycleSpendMap = Record<string, Record<string, number>>;

function formatRewardNumber(value: number) {
  const normalized = Number.isFinite(value) ? Number.parseFloat(value.toFixed(2)) : 0;
  return Number.isInteger(normalized) ? String(normalized) : normalized.toString();
}

function formatRewardRate(multiplier: number, currency: string) {
  return currency === "CASH"
    ? `${formatRewardNumber(multiplier)}% cash back`
    : `${formatRewardNumber(multiplier)}x points`;
}

function formatRewardRateShort(multiplier: number, currency: string) {
  return currency === "CASH" ? `${formatRewardNumber(multiplier)}%` : `${formatRewardNumber(multiplier)}x`;
}

function formatCompactCurrency(value: number | null | undefined) {
  const numeric = Number(value) || 0;
  if (Math.abs(numeric) >= 1000) {
    const short = Math.abs(numeric) >= 10000 ? (numeric / 1000).toFixed(0) : (numeric / 1000).toFixed(1);
    return `$${short}k`;
  }
  return numeric.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatRewardCategoryLabel(value: string | null | undefined) {
  const key = String(value || "").trim();
  if (!key) return "Everyday spending";
  return REWARD_CATEGORY_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTightCardLabel(value: string | null | undefined) {
  const cleaned = String(value || "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\b(?:card|rewards|signature|cash rewards)\b/gi, "")
    .replace(/\bBlue Cash Everyday\b/i, "Blue Cash")
    .replace(/\bFreedom Unlimited\b/i, "Freedom")
    .replace(/\bSavorOne\b/i, "Savor")
    .replace(/\bVenture X\b/i, "Venture X")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").filter(Boolean);
  return words.length > 3 ? words.slice(0, 3).join(" ") : cleaned;
}

function toTitleCaseLabel(value: string) {
  const lowerCaseWords = new Set(["and", "of", "for", "the", "to", "at", "on", "in"]);
  return value
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((token) => {
      if (lowerCaseWords.has(token)) return token;
      if (token.length <= 3 && /^[a-z]+$/.test(token) && token !== "pay") return token.toUpperCase();
      return token.charAt(0).toUpperCase() + token.slice(1);
    })
    .join(" ");
}

function formatMerchantSurfaceLabel(value: string | null | undefined, categoryId?: string | null) {
  const raw = String(value || "")
    .replace(/[*_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return categoryId ? `${formatRewardCategoryLabel(categoryId)} purchase` : "Purchase";

  const cleaned = raw
    .replace(/\b(?:debit|purchase|checkcard|pending|withdrawal|recurring|payment|online|visa|mastercard|pos)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const display = toTitleCaseLabel(cleaned || raw);
  const tokens = display.split(" ").filter(Boolean);
  const looksLikeInternalCode =
    /\b(?:IRS|DMV|DTF|PIT|ACH|NYS)\b/i.test(raw) ||
    (tokens.length >= 3 && tokens.every((token) => token.length <= 4));

  if (looksLikeInternalCode && categoryId) {
    return `${formatRewardCategoryLabel(categoryId)} purchase`;
  }
  return display;
}

function formatMatchSourceLabel(value: string) {
  if (value === "ai") return "AI match";
  if (value === "keyword") return "Suggested category";
  if (value === "category") return "Manual category";
  if (value === "nearby") return "Nearby pick";
  return "Saved merchant";
}

function readRewardsRuntimeStatus() {
  if (typeof window === "undefined") {
    return {
      catalogVersion: null,
      syncedAt: null,
      statusLabel: "Built-in rules",
      detailLabel: "Using Catalyst's on-device reward rules.",
    };
  }

  const catalogVersion = localStorage.getItem("ota_catalog_version");
  const syncedAt = localStorage.getItem("ota_catalog_synced_at");
  const syncedLabel = syncedAt
    ? new Date(syncedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;

  return {
    catalogVersion,
    syncedAt,
    statusLabel: catalogVersion
      ? "Live rules"
      : syncedLabel
        ? "Updated rules"
        : "Built-in rules",
    detailLabel: catalogVersion
      ? `Catalog ${catalogVersion}${syncedLabel ? ` · ${syncedLabel}` : ""}`
      : syncedLabel
        ? `Last refreshed ${syncedLabel}`
        : "Using Catalyst's on-device reward rules.",
  };
}

export default function CardWizardTab({ proEnabled = false, embedded = false }: CardWizardTabProps) {
  const { cards } = usePortfolio();
  const { financialConfig, setFinancialConfig } = useSettings();

  const [showPaywall, setShowPaywall] = useState(false);

  const [query, setQuery] = useState(cachedQuery);
  const [isTyping, setIsTyping] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [categorizing, setCategorizing] = useState(false);
  const [resolvedCategory, setResolvedCategory] = useState<string | null>(cachedCategory);
  const [resolvedMerchant, setResolvedMerchant] = useState<MerchantOption | null>(cachedMerchant);
  const [matchSource, setMatchSource] = useState(""); // "instant" | "keyword" | "ai"
  const [error, setError] = useState("");
  const [showValuations, setShowValuations] = useState(false);
  const [spendAmount, setSpendAmount] = useState("");
  const [showAllRunners, setShowAllRunners] = useState(false);
  const [selectedInsight, setSelectedInsight] = useState<"missed" | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === "undefined" ? 390 : window.innerWidth,
    height: typeof window === "undefined" ? 844 : window.innerHeight,
  }));
  const [runtimeStatus, setRuntimeStatus] = useState(readRewardsRuntimeStatus);
  const [rewardSnapshot, setRewardSnapshot] = useState<RewardSnapshotSummary>({
    analyzedCount: 0,
    totalMissedValue: 0,
    badTxns: 0,
    optimalTxns: 0,
    topMissedTransaction: null,
    topMissedCategories: [],
    topMissedTransactions: [],
  });

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const syncViewport = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    syncViewport();
    window.addEventListener("resize", syncViewport);
    window.addEventListener("orientationchange", syncViewport);
    return () => {
      window.removeEventListener("resize", syncViewport);
      window.removeEventListener("orientationchange", syncViewport);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const syncRuntime = () => setRuntimeStatus(readRewardsRuntimeStatus());
    syncRuntime();
    window.addEventListener(REWARDS_RUNTIME_UPDATED_EVENT, syncRuntime as EventListener);
    return () => window.removeEventListener(REWARDS_RUNTIME_UPDATED_EVENT, syncRuntime as EventListener);
  }, []);

  // 150/100 Feature: Sign-Up Bonus Target — persisted via db (consistent with app data layer)
  const [subTargetId, setSubTargetId] = useState<string | null>(null);
  useEffect(() => {
    db.get("cw-sub-target").then(val => { if (typeof val === "string") setSubTargetId(val); });
  }, []);

  // 150/100 Feature: Quarterly Cap Tracker — persisted via db (consistent with app data layer)
  const [usedCaps, setUsedCaps] = useState<UsedCaps>({});
  const [statementCycleSpend, setStatementCycleSpend] = useState<StatementCycleSpendMap>({});
  useEffect(() => {
    db.get("cw-used-caps").then(val => { if (val && typeof val === "object") setUsedCaps(val as UsedCaps); });
  }, []);

  const handleUpdateUsedCap = (cardId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const newCaps: UsedCaps = { ...usedCaps, [cardId]: val === "" ? "" : parseFloat(val) };
    setUsedCaps(newCaps);
    db.set("cw-used-caps", newCaps);
  };

  const filteredMerchants = useMemo(() => {
    if (!query.trim()) return [];
    const lower = query.toLowerCase().replace(/[^a-z0-9]/g, "");
    return (MERCHANT_DATABASE as MerchantOption[]).filter(m => 
      m.name.toLowerCase().replace(/[^a-z0-9]/g, "").includes(lower) || 
      m.category.includes(lower)
    ).slice(0, 5);
  }, [query]);

  useEffect(() => {
    cachedQuery = query;
  }, [query]);

  useEffect(() => {
    cachedCategory = resolvedCategory;
    cachedMerchant = resolvedMerchant;
  }, [resolvedCategory, resolvedMerchant]);

  const activeCreditCards = useMemo<PortfolioCard[]>(() => {
    return cards.filter(c => c.type === "credit" || !c.type);
  }, [cards]);

  const compactEmbedded = embedded && viewport.height <= 820;
  const denseEmbedded = embedded && viewport.height <= 760;
  const pageGap = denseEmbedded ? 12 : compactEmbedded ? 16 : embedded ? 18 : 24;
  const headerTitleSize = denseEmbedded ? 22 : compactEmbedded ? 24 : 30;
  const headerCopySize = denseEmbedded ? 12 : 13.5;
  const searchHeight = denseEmbedded ? 48 : compactEmbedded ? 50 : 52;
  const searchButtonLabel = denseEmbedded ? "See" : compactEmbedded ? "See best card" : "See best card";
  const valuationButtonLabel = denseEmbedded ? "Point values" : "Point values";
  const categoryTileHeight = denseEmbedded ? 92 : compactEmbedded ? 98 : 108;

  useEffect(() => {
    (async () => {
      const stored = await getHydratedStoredTransactions();
      const spendMap = estimateRewardCapUsage(
        activeCreditCards,
        stored.data as unknown as Parameters<typeof estimateRewardCapUsage>[1]
      );
      setStatementCycleSpend(spendMap);
    })().catch(() => {
      setStatementCycleSpend({});
    });
  }, [activeCreditCards]);

  const customValuations = (financialConfig?.customValuations || {}) as CatalystCashConfig["customValuations"];
  const isNarrowPhone = viewport.width <= 430;
  const isTablet = viewport.width >= 768;
  const isLargeTablet = viewport.width >= 1100;
  const quickGridColumns = isLargeTablet ? "repeat(4, minmax(0, 1fr))" : isTablet ? "repeat(3, minmax(0, 1fr))" : "repeat(2, minmax(0, 1fr))";
  const walletGridColumns = isTablet ? "repeat(3, minmax(0, 1fr))" : "repeat(2, minmax(0, 1fr))";
  const earningsProfileColumns = isNarrowPhone ? "repeat(2, minmax(0, 1fr))" : "repeat(5, minmax(0, 1fr))";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await getHydratedStoredTransactions();
      const analysis = analyzeTransactionRewards(
        stored.data as never[],
        activeCreditCards,
        customValuations
      );

      const topMissedTransaction = (analysis.transactions as Array<{
        merchantName?: string | null;
        description?: string;
        name?: string;
        category?: string | null;
        optimalCard?: { name?: string } | null;
        amount?: number;
        rewardComparison?: { incrementalRewardValue?: number } | null;
      }>)
        .filter((transaction) => shouldHighlightRewardMiss(transaction.rewardComparison))
        .map((transaction) => ({
          merchant: String(transaction.merchantName || transaction.description || transaction.name || "Recent merchant").trim(),
          bestCard: String(transaction.optimalCard?.name || "Better card").trim(),
          delta: Number(transaction.rewardComparison?.incrementalRewardValue || 0),
          category: getCategoryLabel(transaction.category, transaction.description),
        }))
        .sort((left, right) => right.delta - left.delta)[0] || null;

      const topMissedTransactions = (analysis.transactions as Array<{
        merchantName?: string | null;
        description?: string;
        name?: string;
        category?: string | null;
        amount?: number;
        optimalCard?: { name?: string } | null;
        rewardComparison?: {
          incrementalRewardValue?: number;
          usedDisplayName?: string;
        } | null;
      }>)
        .filter((transaction) => shouldHighlightRewardMiss(transaction.rewardComparison))
        .map((transaction) => ({
          merchant: String(transaction.merchantName || transaction.description || transaction.name || "Recent purchase").trim(),
          bestCard: String(transaction.optimalCard?.name || "Better card").trim(),
          delta: Number(transaction.rewardComparison?.incrementalRewardValue || 0),
          category: getCategoryLabel(transaction.category, transaction.description),
          amount: Number(transaction.amount || 0),
          usedPayment: String(transaction.rewardComparison?.usedDisplayName || "Current payment method").trim(),
        }))
        .sort((left, right) => right.delta - left.delta)
        .slice(0, 6);

      const categoryMissMap = new Map<string, { delta: number; bestCard: string }>();
      (analysis.transactions as Array<{
        category?: string | null;
        description?: string;
        optimalCard?: { name?: string } | null;
        rewardComparison?: { incrementalRewardValue?: number } | null;
      }>).forEach((transaction) => {
        if (!shouldHighlightRewardMiss(transaction.rewardComparison)) return;
        const label = getCategoryLabel(transaction.category, transaction.description);
        const current = categoryMissMap.get(label) || { delta: 0, bestCard: String(transaction.optimalCard?.name || "Better card").trim() };
        current.delta += Number(transaction.rewardComparison?.incrementalRewardValue || 0);
        if (!current.bestCard) current.bestCard = String(transaction.optimalCard?.name || "Better card").trim();
        categoryMissMap.set(label, current);
      });

      if (cancelled) return;
      setRewardSnapshot({
        analyzedCount: analysis.summary.totalTxns,
        totalMissedValue: analysis.summary.totalMissedValue,
        badTxns: analysis.summary.badTxns,
        optimalTxns: analysis.summary.optimalTxns,
        topMissedTransaction,
        topMissedCategories: [...categoryMissMap.entries()]
          .map(([category, value]) => ({ category, delta: value.delta, bestCard: value.bestCard }))
          .sort((left, right) => right.delta - left.delta)
          .slice(0, 3),
        topMissedTransactions,
      });
    })().catch(() => {
      if (!cancelled) {
        setRewardSnapshot({
          analyzedCount: 0,
          totalMissedValue: 0,
          badTxns: 0,
          optimalTxns: 0,
          topMissedTransaction: null,
          topMissedCategories: [],
          topMissedTransactions: [],
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeCreditCards, customValuations]);

  const categoryLeaders = useMemo<RewardCategoryLeader[]>(() => {
    return QUICK_CATEGORIES.slice(0, 6)
      .flatMap((category) => {
        const sorted = activeCreditCards
          .map((card) => {
            const rewardInfo = getCardMultiplier(card.name, category.id, customValuations) as RewardInfo;
            return {
              card,
              effectiveYield: rewardInfo.effectiveYield,
              rateLabel: formatRewardRateShort(rewardInfo.multiplier, rewardInfo.currency),
            };
          })
          .sort((left, right) => right.effectiveYield - left.effectiveYield);
        const leader = sorted[0];
        if (!leader) return [];
        return [{
          categoryId: category.id,
          label: category.label,
          icon: category.icon,
          color: category.color,
          bg: category.bg,
          winner: leader.card,
          effectiveYield: leader.effectiveYield,
          rateLabel: leader.rateLabel,
        }];
      });
  }, [activeCreditCards, customValuations]);

  const handleSearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    haptic.selection();
    setError("");
    setCategorizing(true);
    setResolvedCategory(null);
    setResolvedMerchant(null);
    setIsTyping(false);
    setShowSuggestions(false);

    // 1. Robust Offline Match Check
    const normalizedQ = q.toLowerCase().replace(/[^a-z0-9]/g, "");
    const offlineMatch = MERCHANT_DATABASE.find(m => m.name.toLowerCase().replace(/[^a-z0-9]/g, "") === normalizedQ);
    
    if (offlineMatch) {
      setResolvedCategory(offlineMatch.category);
      setResolvedMerchant({ ...offlineMatch, name: offlineMatch.name }); // Keep original capitalization
      setMatchSource("instant");
      addToHistory(offlineMatch);
      setCategorizing(false);
      setShowValuations(false);
      setShowAllRunners(false);
      haptic.success();
      return;
    }

    // 2. Ultra-Fast Keyword Heuristic Match
    const heuristicCategory = extractCategoryByKeywords(q);
    if (heuristicCategory) {
      setResolvedCategory(heuristicCategory);
      const merchant: MerchantOption = { name: query, category: heuristicCategory, color: null };
      setResolvedMerchant(merchant);
      setMatchSource("keyword");
      addToHistory(merchant);
      setCategorizing(false);
      setShowValuations(false);
      setShowAllRunners(false);
      haptic.success();
      return;
    }

    // 3. AI Fallback
    try {
      const category = await classifyMerchant(q) as string;
      setResolvedCategory(category);
      const merchant: MerchantOption = { name: query, category, color: null };
      setResolvedMerchant(merchant);
      setMatchSource("ai");
      addToHistory(merchant);
      setShowValuations(false);
      setShowAllRunners(false);
      haptic.success();
    } catch (err) {
      void log.warn("card-wizard", "AI categorization failed", { error: err });
      setError("We could not place that merchant with confidence. Pick the closest category below.");
    } finally {
      setCategorizing(false);
    }
  };

  const handleSelectMerchant = (merchant: MerchantOption, source = "instant") => {
    haptic.selection();
    setQuery(merchant.name);
    setError("");
    setIsTyping(false);
    setShowSuggestions(false);
    setShowValuations(false);
    setShowAllRunners(false);
    setResolvedCategory(merchant.category);
    setResolvedMerchant(merchant);
    setMatchSource(source);
    addToHistory(merchant);
  };

  const handleQuickSelect = (categoryId: string) => {
    haptic.selection();
    setQuery("");
    setError("");
    setIsTyping(false);
    setShowSuggestions(false);
    setShowValuations(false);
    setShowAllRunners(false);
    setMatchSource("category");
    setResolvedCategory(categoryId);
    setResolvedMerchant({ name: categoryId.replace("_", " "), category: categoryId, color: null });
  };

  const handleManualCategory = (categoryId: string) => {
    haptic.selection();
    setError("");
    setShowAllRunners(false);
    setResolvedCategory(categoryId);
    setResolvedMerchant({ name: query || categoryId.replace("_", " "), category: categoryId, color: null });
    if (query) addToHistory({ name: query, category: categoryId, color: null });
  };

  const handleToggleSubTarget = (e: React.MouseEvent<HTMLElement>, cardId: string) => {
    e.stopPropagation();
    haptic.selection();
    if (subTargetId === cardId) {
      setSubTargetId(null);
      db.del("cw-sub-target");
    } else {
      setSubTargetId(cardId);
      db.set("cw-sub-target", cardId);
    }
  };

  const updateCPP = (currency: string, valStr: string) => {
    const val = parseFloat(valStr);
    if (!isNaN(val) && val >= 0.1 && val <= 5.0) {
      setFinancialConfig(prev => ({
        ...prev,
        customValuations: {
          ...prev.customValuations,
          [currency]: val
        }
      }));
    }
  };

  const updateCPPToDefault = (currency: string) => {
    setFinancialConfig(prev => {
      const copy = { ...prev.customValuations };
      delete copy[currency];
      return { ...prev, customValuations: copy };
    });
  };

  const recommendations = useMemo<Recommendation[]>(() => {
    if (!resolvedCategory || activeCreditCards.length === 0) return [];

    const merchantName = resolvedMerchant?.name;
    const merchantIdentity = inferMerchantIdentity({
      merchantName: merchantName || "",
      category: resolvedCategory,
    });

    const scored = activeCreditCards.map(card => {
      // Per-card issuer category: some merchants code differently depending on which bank issues the card
      const issuerCategory = getIssuerCategoryOverride(merchantName, card.institution);
      const effectiveCategory = issuerCategory || resolvedCategory;
      const rewardInfo = getCardMultiplier(card.name, effectiveCategory, customValuations, {
        merchantIdentity: {
          ...merchantIdentity,
          rewardCategory: merchantIdentity.rewardCategory || effectiveCategory,
        },
      }) as RewardInfo;
      // Business cards don't report utilization to personal bureaus; treat as 0% for tie-breakers to protect personal scores
      const balance = Number(card.balance) || 0;
      const limit = Number(card.limit) || 0;
      const utilization = card.type !== "business" && limit > 0 ? balance / limit : 0;

      let finalYield = rewardInfo.effectiveYield;
      let blendedMsg: string | null = null;
      let isCappedOut = false;
      const spend = parseFloat(spendAmount) || 0;
      const autoTrackedCap = statementCycleSpend[String(card.id)]?.[effectiveCategory] || 0;
      const usedCapValue = usedCaps[card.id] === "" || usedCaps[card.id] == null
        ? autoTrackedCap
        : parseFloat(String(usedCaps[card.id] ?? 0)) || 0;

      if (rewardInfo.cap) {
        const used = usedCapValue;
        const availableCap = Math.max(0, rewardInfo.cap - used);
        
        if (spend > 0 && spend > availableCap) {
          const spendAtHighRate = availableCap;
          const spendAtBaseRate = spend - availableCap;
          
          if (spendAtHighRate === 0) {
            isCappedOut = true;
            finalYield = parseFloat((rewardInfo.base * rewardInfo.cpp).toFixed(2));
            blendedMsg = `Cap exhausted. Now earning base ${formatRewardRate(rewardInfo.base, rewardInfo.currency)}.`;
          } else {
            const blendedReturn = (spendAtHighRate * rewardInfo.multiplier * rewardInfo.cpp / 100) + (spendAtBaseRate * rewardInfo.base * rewardInfo.cpp / 100);
            finalYield = parseFloat(((blendedReturn / spend) * 100).toFixed(2));
            blendedMsg = `Blended rate: $${spendAtHighRate} at ${formatRewardRate(rewardInfo.multiplier, rewardInfo.currency)} + $${spendAtBaseRate} at ${formatRewardRate(rewardInfo.base, rewardInfo.currency)}.`;
          }
        } else if (used >= rewardInfo.cap) {
          isCappedOut = true;
          finalYield = parseFloat((rewardInfo.base * rewardInfo.cpp).toFixed(2));
          blendedMsg = `Cap exhausted. Now earning base ${formatRewardRate(rewardInfo.base, rewardInfo.currency)}.`;
        }
      }

      const recommendation: Recommendation = {
        ...card,
        multiplier: rewardInfo.multiplier,
        currentMultiplier: isCappedOut ? rewardInfo.base : rewardInfo.multiplier,
        effectiveYield: finalYield,
        isFlexible: rewardInfo.isFlexible,
        potentialMax: rewardInfo.potentialMax,
        baseMultiplier: rewardInfo.base,
        currency: rewardInfo.currency,
        cap: rewardInfo.cap,
        usedCap: usedCapValue,
        blendedMsg,
        isCappedOut,
        cpp: rewardInfo.cpp,
        utilization,
        rotating: rewardInfo.rotating,
        mobileWallet: rewardInfo.mobileWallet,
        // Issuer-specific category scoring
        issuerCategory: issuerCategory || null,
        effectiveCategory,
      };
      return rewardInfo.notes ? { ...recommendation, notes: rewardInfo.notes } : recommendation;
    });

    scored.sort((a, b) => {
      // Sign-Up Bonus override always wins
      if (a.id === subTargetId) return -1;
      if (b.id === subTargetId) return 1;

      if (b.effectiveYield !== a.effectiveYield) {
        return b.effectiveYield - a.effectiveYield;
      }
      return a.utilization - b.utilization;
    });

    return scored;
  }, [resolvedCategory, resolvedMerchant, activeCreditCards, customValuations, subTargetId, spendAmount, statementCycleSpend, usedCaps]);

  const dollarReturn = (yield_: number) => {
    const amt = parseFloat(spendAmount);
    if (!amt || amt <= 0) return null;
    return ((amt * yield_) / 100).toFixed(2);
  };
  const spendPresets = useMemo(() => {
    const presetsByCategory: Record<string, number[]> = {
      dining: [25, 75, 150, 250],
      groceries: [60, 120, 180, 250],
      gas: [35, 60, 90, 125],
      travel: [150, 350, 750, 1500],
      transit: [10, 25, 60, 120],
      online_shopping: [40, 120, 250, 500],
      streaming: [15, 25, 50, 100],
      wholesale_clubs: [80, 160, 250, 400],
      drugstores: [15, 35, 75, 120],
      "catch-all": [25, 75, 200, 500],
    };
    return presetsByCategory[resolvedCategory || ""] || [25, 75, 150, 300];
  }, [resolvedCategory]);

  if (activeCreditCards.length === 0) {
    return (
      <div className="safe-scroll-body page-body" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", width: "100%", flex: 1 }}>
        <div className="fade-in" style={{ maxWidth: 400, textAlign: "center", padding: 32, margin: "0 auto", borderRadius: 24, border: `1px solid ${T.border.default}`, background: "transparent" }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: T.bg.elevated, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <CreditCard size={32} color={T.text.muted} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: T.text.primary, marginBottom: 12 }}>Empty Wallet</h2>
          <p style={{ fontSize: 14, color: T.text.secondary, lineHeight: 1.5 }}>
            Add your cards in Portfolio to see which one earns the most for each purchase.
          </p>
        </div>
      </div>
    );
  }


  const runnersToShow = showAllRunners ? recommendations.slice(1) : recommendations.slice(1, 4);
  const winner = recommendations[0];
  const runnerUp = recommendations[1];
  const winnerLabel = winner ? formatTightCardLabel(getShortCardLabel(activeCreditCards, winner) || winner.name) : "";
  const runnerUpLabel = runnerUp ? formatTightCardLabel(getShortCardLabel(activeCreditCards, runnerUp) || runnerUp.name) : "";
  const recentMerchantChips = searchHistory.slice(0, 4);
  const spendAmountValue = parseFloat(spendAmount) || 0;
  const winnerEdge = winner && runnerUp ? Math.max(0, winner.effectiveYield - runnerUp.effectiveYield) : 0;
  const winnerReturn = winner && spendAmountValue > 0 ? ((spendAmountValue * winner.effectiveYield) / 100).toFixed(2) : null;
  const runnerUpReturn = runnerUp && spendAmountValue > 0 ? ((spendAmountValue * runnerUp.effectiveYield) / 100).toFixed(2) : null;
  const rewardGap = winnerReturn && runnerUpReturn ? (Number(winnerReturn) - Number(runnerUpReturn)).toFixed(2) : null;
  const resolvedCategoryLabel = formatRewardCategoryLabel(resolvedCategory);
  const resolvedMerchantLabel = formatMerchantSurfaceLabel(resolvedMerchant?.name, resolvedCategory);
  const hasSearchContext = Boolean(query.trim() || resolvedCategory || categorizing);
  const compactRewardsHeader = hasSearchContext;
  const activePageGap = compactRewardsHeader ? Math.max(12, pageGap - 8) : pageGap;
  const activeSearchHeight = compactRewardsHeader ? (denseEmbedded ? 46 : compactEmbedded ? 48 : 50) : searchHeight;
  const topMissedPurchaseLabel = rewardSnapshot.topMissedTransaction
    ? formatMerchantSurfaceLabel(rewardSnapshot.topMissedTransaction.merchant, rewardSnapshot.topMissedTransaction.category)
    : null;
  const topMissedCategoryLabel = rewardSnapshot.topMissedTransaction
    ? formatRewardCategoryLabel(rewardSnapshot.topMissedTransaction.category)
    : null;
  const showRecentMerchantRow = !resolvedCategory && !query.trim() && recentMerchantChips.length > 1;
  const maxContentWidth = isTablet ? 980 : 768;
  const activeCardsLabel = `${activeCreditCards.length} active ${activeCreditCards.length === 1 ? "card" : "cards"}`;
  const compactRewardsOverview = viewport.width <= 390;
  const rewardsOverviewColumns = compactRewardsOverview ? "1fr" : "repeat(2, minmax(0, 1fr))";
  const missedCategoryColumns = viewport.width <= 390 ? "1fr" : isTablet ? "repeat(3, minmax(0, 1fr))" : "repeat(2, minmax(0, 1fr))";
  const hasMissedRewardInsight = rewardSnapshot.topMissedTransactions.length > 0;
  const topMissedUsedPaymentLabel = rewardSnapshot.topMissedTransactions[0]?.usedPayment;
  const missedInsightButtonLabel = selectedInsight === "missed" ? "Hide missed rewards" : "Review missed rewards";
  const topMissedCardSummary = rewardSnapshot.topMissedTransaction
    ? topMissedUsedPaymentLabel
      ? `Use ${rewardSnapshot.topMissedTransaction.bestCard} instead of ${topMissedUsedPaymentLabel}.`
      : `Use ${rewardSnapshot.topMissedTransaction.bestCard} for purchases like this.`
    : "Your recent purchases are already routing to the right card.";
  const rewardOverviewMetrics = [
    {
      label: "Missed rewards",
      value: rewardSnapshot.totalMissedValue > 0 ? formatCompactCurrency(rewardSnapshot.totalMissedValue) : "$0",
      detail: rewardSnapshot.badTxns > 0 ? `${rewardSnapshot.badTxns} purchases missed a better card` : "No meaningful misses found",
      icon: TrendingUp,
      tone: rewardSnapshot.totalMissedValue > 0 ? T.status.amber : T.status.green,
      action: hasMissedRewardInsight ? "missed" : null,
    },
    {
      label: "Purchases scored",
      value: `${rewardSnapshot.analyzedCount}`,
      detail: rewardSnapshot.optimalTxns > 0 ? `${rewardSnapshot.optimalTxns} matched your best card` : "Link recent card activity to score more purchases",
      icon: Target,
      tone: T.text.primary,
      action: null,
    },
  ];

  return (
    <div ref={scrollRef} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", flex: 1 }}>
      <div className="page-body" style={{ maxWidth: maxContentWidth, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: activePageGap }}>

        {/* Pro Banner Removed - Teaser is now in the results section */}
        {showPaywall && (
          <Suspense fallback={null}>
            <LazyProPaywall onClose={() => setShowPaywall(false)} source="cardwizard" />
          </Suspense>
        )}

        {/* Header */}
        <div className="fade-in" style={{ marginTop: embedded ? 0 : compactRewardsHeader ? 2 : 8, display: "grid", gap: compactRewardsHeader ? 6 : 12 }}>
          {compactRewardsHeader ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, display: "grid", gap: 2 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Rewards
                </div>
                <div style={{ fontSize: denseEmbedded ? 16 : 18, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.03em", lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: isNarrowPhone ? 220 : 420 }}>
                  {resolvedCategory && !isTyping ? `Best card for ${resolvedMerchantLabel}` : "Search rewards"}
                </div>
              </div>
              <Badge
                variant="outline"
                style={{
                  color: runtimeStatus.catalogVersion ? T.status.green : T.accent.primary,
                  borderColor: runtimeStatus.catalogVersion ? `${T.status.green}30` : `${T.accent.primary}30`,
                  background: runtimeStatus.catalogVersion ? `${T.status.green}10` : `${T.accent.primary}10`,
                }}
              >
                {runtimeStatus.statusLabel}
              </Badge>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: isNarrowPhone ? "wrap" : "nowrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
                  Rewards
                </div>
                <h1 style={{ fontSize: headerTitleSize, fontWeight: 900, color: T.text.primary, marginBottom: denseEmbedded ? 4 : 6, letterSpacing: "-0.04em", lineHeight: 1.02 }}>
                  Choose the right card
                </h1>
                <p style={{ fontSize: headerCopySize, color: T.text.secondary, maxWidth: 470, lineHeight: 1.55, margin: 0 }}>
                  Search a merchant or tap a category to see the best card in your wallet, then compare the return before you pay.
                </p>
              </div>
              <div style={{ display: "grid", gap: 6, justifyItems: isNarrowPhone ? "start" : "end" }}>
                <Badge
                  variant="outline"
                  style={{
                    color: runtimeStatus.catalogVersion ? T.status.green : T.accent.primary,
                    borderColor: runtimeStatus.catalogVersion ? `${T.status.green}30` : `${T.accent.primary}30`,
                    background: runtimeStatus.catalogVersion ? `${T.status.green}10` : `${T.accent.primary}10`,
                  }}
                >
                  {runtimeStatus.statusLabel}
                </Badge>
                <div style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.45, textAlign: isNarrowPhone ? "left" : "right" }}>
                  {runtimeStatus.detailLabel}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="scale-in" style={{ position: "relative", zIndex: 20 }}>
          <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", left: 16, pointerEvents: "none", display: "flex", alignItems: "center" }}>
            <Search color={T.text.muted} size={20} />
          </div>
          <input
            type="text"
            value={query}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsTyping(true);
              setResolvedCategory(null);
              setResolvedMerchant(null);
              setShowSuggestions(true);
              setError("");
            }}
            placeholder="Amazon, Uber, Starbucks"
            style={{
              width: "100%",
              padding: denseEmbedded ? "12px 92px 12px 42px" : compactEmbedded ? "13px 110px 13px 44px" : "14px 140px 14px 44px",
              background: T.bg.elevated,
              border: `1.5px solid ${T.border.default}`,
              borderRadius: 16,
              color: T.text.primary,
              fontSize: compactEmbedded ? 15 : 16,
              fontWeight: 500,
              boxShadow: T.shadow.card,
              minHeight: activeSearchHeight
            }}
          />
          {resolvedCategory && !isTyping ? (
            <button
              type="button"
              onClick={() => {
                haptic.selection();
                setQuery("");
                setResolvedCategory(null);
                setResolvedMerchant(null);
              }}
              className="hover-btn"
              style={{
                position: "absolute",
                top: "50%", 
                transform: "translateY(-50%)",
                right: 8,
                height: 36,
                width: 36,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: T.bg.surface,
                color: T.text.secondary,
                borderRadius: 10,
                border: `1px solid ${T.border.subtle}`,
              }}
            >
              <X size={16} />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!query.trim() || categorizing}
              className="hover-btn"
              style={{
                position: "absolute",
                top: "50%",
                transform: "translateY(-50%)",
                right: 8,
                height: denseEmbedded ? 34 : 36,
                padding: denseEmbedded ? "0 12px" : "0 14px",
                background: T.accent.primary,
                color: "#fff",
                fontWeight: 700,
                borderRadius: 10,
                border: "none",
                fontSize: 12,
                opacity: (!query.trim() || categorizing) ? 0.5 : 1,
              }}
            >
              {categorizing ? <div className="spin"><div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%" }} /></div> : searchButtonLabel}
            </button>
          )}

          {/* Auto-Suggest Dropdown */}
          {showSuggestions && query.trim() && filteredMerchants.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 8, background: `linear-gradient(180deg, ${T.bg.elevated}, ${T.bg.card})`, borderRadius: 18, border: `1px solid ${T.border.subtle}`, boxShadow: "0 20px 44px rgba(0,0,0,0.28)", overflow: "hidden", display: "flex", flexDirection: "column", animation: "slideUp .2s cubic-bezier(0.34,1.56,0.64,1) both" }}>
              <div style={{ padding: "8px 14px 4px", fontSize: 9, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: T.font.mono }}>
                Best matches
              </div>
              {filteredMerchants.map((m, idx) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleSelectMerchant(m)}
                  className="hover-btn"
                  style={{
                    display: "flex", alignItems: "center", width: "100%", padding: "12px 16px", background: "transparent", border: "none",
                    borderBottom: idx < filteredMerchants.length - 1 ? `1px solid ${T.border.subtle}` : "none", cursor: "pointer", textAlign: "left"
                  }}
                >
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: m.color || T.border.subtle, marginRight: 12, flexShrink: 0, boxShadow: `0 0 0 3px ${(m.color || T.border.subtle)}20` }} />
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: T.text.primary, display: "block" }}>{m.name}</span>
                    <span style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono, textTransform: "uppercase", letterSpacing: "0.04em" }}>{formatRewardCategoryLabel(m.category)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Search History Dropdown */}
          {showSuggestions && !query.trim() && searchHistory.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 8, background: `linear-gradient(180deg, ${T.bg.elevated}, ${T.bg.card})`, borderRadius: 18, border: `1px solid ${T.border.subtle}`, boxShadow: "0 20px 44px rgba(0,0,0,0.28)", overflow: "hidden", display: "flex", flexDirection: "column", animation: "slideUp .2s cubic-bezier(0.34,1.56,0.64,1) both" }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, padding: "10px 16px 4px", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>Recent</p>
              {searchHistory.map((m, idx) => (
                <button
                  key={m.name + idx}
                  type="button"
                  onClick={() => handleSelectMerchant(m)}
                  className="hover-btn"
                  style={{
                    display: "flex", alignItems: "center", width: "100%", padding: "10px 16px", background: "transparent", border: "none",
                    borderBottom: idx < searchHistory.length - 1 ? `1px solid ${T.border.subtle}` : "none", cursor: "pointer", textAlign: "left"
                  }}
                >
                  <Clock size={14} color={T.text.dim} style={{ marginRight: 12, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: T.text.primary, display: "block" }}>{m.name}</span>
                    <span style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono, textTransform: "uppercase", letterSpacing: "0.04em" }}>{formatRewardCategoryLabel(m.category)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </form>

        {(!resolvedCategory || showValuations) && !categorizing && (
          <div className="fade-in" style={{ display: "flex", justifyContent: "flex-start", flexWrap: "wrap", gap: 8 }}>
            <GeoSuggestWidget
              onMerchantSelect={(merchant) => handleSelectMerchant(merchant, "nearby")}
            />
            <button type="button"
              className="hover-btn"
              onClick={() => { haptic.selection(); setShowValuations(!showValuations); }}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: denseEmbedded ? "7px 10px" : "8px 12px", borderRadius: 20, background: `linear-gradient(180deg, ${T.bg.surface}, ${T.bg.card})`, border: `1px solid ${T.border.subtle}`, color: T.text.secondary, fontSize: 12, fontWeight: 700, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" }}
            >
              <Settings2 size={14} />
              {showValuations ? "Hide point values" : valuationButtonLabel}
              <ChevronDown size={14} style={{ transform: showValuations ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }} />
            </button>
          </div>
        )}

        {showRecentMerchantRow && (
          <div className="fade-in" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: -4 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Recent
            </span>
            {recentMerchantChips.map((merchant) => (
              <button
                key={`${merchant.name}-${merchant.category}`}
                type="button"
                onClick={() => handleSelectMerchant(merchant)}
                style={{
                  minHeight: 32,
                  padding: "0 12px",
                  borderRadius: 999,
                  border: `1px solid ${T.border.subtle}`,
                  background: T.bg.surface,
                  color: T.text.secondary,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {merchant.name}
              </button>
            ))}
          </div>
        )}

        {!resolvedCategory && !showValuations && !categorizing && !error && (
          <Card
            variant="glass"
            className="fade-in"
            style={{
              padding: isNarrowPhone ? "16px 14px" : "18px 18px",
              borderRadius: 24,
              display: "grid",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: isNarrowPhone ? "wrap" : "nowrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                  Rewards snapshot
                </div>
                <div style={{ fontSize: isNarrowPhone ? 17 : 18, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.02em", marginBottom: 4, lineHeight: 1.15 }}>
                  See where you are leaving rewards behind
                </div>
                <div style={{ fontSize: 12.5, color: T.text.secondary, lineHeight: 1.55, maxWidth: 520 }}>
                  Search a merchant for an exact answer, or review the places where another card would have returned more this month.
                </div>
              </div>
              <Badge variant="outline" style={{ color: T.accent.primary, borderColor: `${T.accent.primary}35`, background: `${T.accent.primary}10` }}>
                {activeCardsLabel}
              </Badge>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: rewardsOverviewColumns, gap: 10 }}>
              {rewardOverviewMetrics.map((metric) => {
                const Icon = metric.icon;
                const isSelected = metric.action === "missed" && selectedInsight === "missed";
                return (
                  <button
                    key={metric.label}
                    type="button"
                    onClick={() => {
                      if (!metric.action) return;
                      haptic.selection();
                      setSelectedInsight(selectedInsight === "missed" ? null : "missed");
                    }}
                    style={{
                      padding: compactRewardsOverview ? "12px 12px 11px" : "14px 14px 13px",
                      borderRadius: 18,
                      border: `1px solid ${isSelected ? `${metric.tone}40` : T.border.subtle}`,
                      background: isSelected ? `${metric.tone}10` : T.bg.surface,
                      minWidth: 0,
                      textAlign: "left",
                      cursor: metric.action ? "pointer" : "default",
                      display: "grid",
                      gap: 10,
                      alignItems: "stretch",
                      justifyItems: "stretch",
                      justifyContent: "stretch",
                      minHeight: compactRewardsOverview ? 132 : 144,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 10, background: `${metric.tone}12`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Icon size={14} color={metric.tone} />
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          {metric.label}
                        </div>
                      </div>
                      {metric.action && (
                        <div style={{ fontSize: 10, fontWeight: 800, color: metric.tone, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                          {isSelected ? "Showing" : "Review"}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: compactRewardsOverview ? 24 : 28, fontWeight: 900, color: metric.tone, letterSpacing: "-0.04em", lineHeight: 1 }}>
                      {metric.value}
                    </div>
                    <div style={{ fontSize: 11.5, color: T.text.secondary, lineHeight: 1.42, maxWidth: compactRewardsOverview ? "100%" : 220 }}>
                      {metric.detail}
                    </div>
                  </button>
                );
              })}
            </div>

            <div
              style={{
                padding: compactRewardsOverview ? "14px 14px 12px" : "16px 16px 14px",
                borderRadius: 20,
                border: `1px solid ${selectedInsight === "missed" ? `${T.accent.primary}35` : T.border.subtle}`,
                background: selectedInsight === "missed"
                  ? `linear-gradient(180deg, ${T.accent.primary}12, ${T.bg.surface})`
                  : `linear-gradient(180deg, ${T.bg.surface}, ${T.bg.card})`,
                display: "grid",
                gap: compactRewardsOverview ? 12 : 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: compactRewardsOverview ? "wrap" : "nowrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                    Largest missed reward
                  </div>
                </div>
                <div style={{ display: "grid", gap: 8, justifyItems: compactRewardsOverview ? "start" : "end" }}>
                  <div style={{ fontSize: compactRewardsOverview ? 24 : 28, fontWeight: 900, color: rewardSnapshot.topMissedTransaction ? T.accent.primary : T.status.green, letterSpacing: "-0.04em", lineHeight: 1 }}>
                    {rewardSnapshot.topMissedTransaction ? formatCompactCurrency(rewardSnapshot.topMissedTransaction.delta) : "Clear"}
                  </div>
                  {hasMissedRewardInsight && (
                    <button
                      type="button"
                      onClick={() => {
                        haptic.selection();
                        setSelectedInsight(selectedInsight === "missed" ? null : "missed");
                      }}
                      style={{
                        minHeight: 34,
                        padding: "0 14px",
                        borderRadius: 999,
                        border: `1px solid ${selectedInsight === "missed" ? `${T.accent.primary}35` : T.border.subtle}`,
                        background: selectedInsight === "missed" ? `${T.accent.primary}12` : T.bg.surface,
                        color: selectedInsight === "missed" ? T.accent.primary : T.text.secondary,
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {missedInsightButtonLabel}
                    </button>
                  )}
                </div>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: T.text.primary, lineHeight: 1.2 }}>
                  {topMissedPurchaseLabel ?? "Your recent purchases are landing on the right card"}
                </div>
                <div style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.5 }}>
                  {topMissedCardSummary}
                </div>
              </div>

              {rewardSnapshot.topMissedTransaction && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Badge
                    variant="outline"
                    style={{
                      color: T.accent.primary,
                      borderColor: `${T.accent.primary}35`,
                      background: `${T.accent.primary}12`,
                    }}
                  >
                    {topMissedCategoryLabel}
                  </Badge>
                  <span style={{ fontSize: 11.5, color: T.text.secondary }}>
                    Best card: <span style={{ color: T.text.primary, fontWeight: 700 }}>{rewardSnapshot.topMissedTransaction.bestCard}</span>
                  </span>
                </div>
              )}
            </div>

            {rewardSnapshot.topMissedCategories.length > 0 && (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Top missed categories
                </div>
                <div style={{ display: "grid", gridTemplateColumns: missedCategoryColumns, gap: 8 }}>
                {rewardSnapshot.topMissedCategories.map((category) => (
                  <div
                    key={category.category}
                    style={{
                      minHeight: 88,
                      padding: "12px 12px 11px",
                      borderRadius: 16,
                      border: `1px solid ${T.border.subtle}`,
                      background: T.bg.surface,
                      display: "grid",
                      alignContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 800, color: T.text.primary, lineHeight: 1.25 }}>
                      {category.category}
                    </div>
                    <div style={{ display: "grid", gap: 3 }}>
                      <div style={{ fontSize: 16, fontWeight: 900, color: T.status.amber, letterSpacing: "-0.03em", lineHeight: 1 }}>
                        {formatCompactCurrency(category.delta)}
                      </div>
                      <div style={{ fontSize: 10.5, color: T.text.secondary, lineHeight: 1.4 }}>
                        Use {category.bestCard}
                      </div>
                    </div>
                  </div>
                ))}
                </div>
              </div>
            )}

            {selectedInsight === "missed" && rewardSnapshot.topMissedTransactions.length > 0 && (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Missed reward details
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      haptic.selection();
                      setSelectedInsight(null);
                    }}
                    style={{ border: "none", background: "transparent", color: T.text.dim, fontSize: 10, fontWeight: 700, cursor: "pointer" }}
                  >
                    Hide
                  </button>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {rewardSnapshot.topMissedTransactions.map((transaction, index) => (
                    <div
                      key={`${transaction.merchant}-${transaction.delta}-${index}`}
                      style={{
                        padding: "12px",
                        borderRadius: 16,
                        border: `1px solid ${T.border.subtle}`,
                        background: T.bg.surface,
                        display: "grid",
                        gap: 6,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: T.text.primary, lineHeight: 1.25 }}>
                            {formatMerchantSurfaceLabel(transaction.merchant, transaction.category)}
                          </div>
                          <div style={{ fontSize: 10.5, color: T.text.dim, marginTop: 4 }}>
                            {transaction.category}
                          </div>
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: T.status.amber, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>
                          {formatCompactCurrency(transaction.delta)}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.45 }}>
                        Use <span style={{ color: T.text.primary, fontWeight: 700 }}>{transaction.bestCard}</span> instead of {transaction.usedPayment}.
                        {transaction.amount > 0 ? ` Purchase size: ${formatCompactCurrency(transaction.amount)}.` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}

        {showValuations && !categorizing && (
          <div className="fade-in">
            <div className="collapse-section" data-collapsed={!showValuations}>
              <FormGroup label="Cents Per Point (CPP) Overrides">
                {Object.entries(VALUATIONS).map(([currency, defaultVal], idx, arr) => {
                  const isCustom = customValuations[currency] !== undefined;
                  const currentVal = isCustom ? customValuations[currency] : defaultVal;
                  return (
                      <TypedFormRow
                        key={currency}
                        label={currency.replace(/_/g, " ")}
                        isLast={idx === arr.length - 1}
                      >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 10, color: T.text.dim, whiteSpace: "nowrap" }}>
                          Mkt: {defaultVal}
                        </span>
                        {isCustom && (
                          <button type="button"
                            className="hover-btn"
                            onClick={() => updateCPPToDefault(currency)}
                            style={{ background: "transparent", border: "none", color: T.text.dim, fontSize: 11, cursor: "pointer", textDecoration: "underline" }}
                          >
                            Reset
                          </button>
                        )}
                        <div style={{ position: "relative", width: 70 }}>
                          <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            max="5.0"
                            value={currentVal}
                            onChange={(e) => updateCPP(currency, e.target.value)}
                            style={{ width: "100%", padding: "6px 8px 6px 14px", fontSize: 14, minHeight: 36, textAlign: "right" }}
                          />
                          <span style={{ position: "absolute", left: 8, top: 10, fontSize: 12, color: T.text.dim }}>¢</span>
                        </div>
                      </div>
                      </TypedFormRow>
                  );
                })}
              </FormGroup>
              {Object.keys(customValuations).length > 0 && (
                <button type="button"
                  className="hover-btn"
                  onClick={() => {
                    haptic.selection();
                    setFinancialConfig(prev => ({ ...prev, customValuations: {} }));
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, margin: "8px auto 0",
                    padding: "6px 12px", borderRadius: 8, background: "transparent",
                    border: `1px solid ${T.border.subtle}`, color: T.status.red,
                    fontSize: 11, fontWeight: 700,
                  }}
                >
                  <RefreshCw size={12} /> Reset All to Defaults
                </button>
              )}
            </div>
          </div>
        )}

        {/* Quick Select Bento Grid */}
        {!resolvedCategory && !isTyping && !showValuations && !error && (
          <Card variant="glass" style={{ padding: isNarrowPhone ? "16px 14px" : "18px", borderRadius: 24, display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gap: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>
                Quick picks
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.02em" }}>
                Best card by everyday category
              </div>
              <div style={{ fontSize: 12.5, color: T.text.secondary, lineHeight: 1.55, maxWidth: 560 }}>
                Tap a category to jump straight into the current winner for that type of purchase.
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: quickGridColumns, gap: 10 }}>
              {categoryLeaders.map((leader) => {
                const Icon = leader.icon;
                return (
                  <button
                    key={leader.categoryId}
                    type="button"
                    onClick={() => handleQuickSelect(leader.categoryId)}
                    className="hover-btn"
                    style={{
                      minHeight: categoryTileHeight,
                      padding: "14px 14px 13px",
                      borderRadius: 20,
                      border: `1px solid ${T.border.subtle}`,
                      background: T.bg.surface,
                      textAlign: "left",
                      display: "grid",
                      gap: 10,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 12, background: leader.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon size={18} color={leader.color} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 800, color: leader.color }}>{leader.rateLabel}</span>
                    </div>
                    <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.02em" }}>{leader.label}</div>
                      <div style={{ fontSize: 11.5, color: T.text.secondary, lineHeight: 1.45 }}>
                        {leader.winner?.name || "No winner yet"}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: T.text.dim, fontWeight: 700 }}>
                      {leader.effectiveYield.toFixed(1)}% effective value
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        )}

        {/* Error + Manual Category Selector */}
        {error && (
          <div className="slide-up" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ padding: 14, borderRadius: 12, background: T.bg.surface, border: `1px solid ${T.border.default}`, display: "flex", alignItems: "flex-start", gap: 12, boxShadow: T.shadow.sm }}>
              <Info size={18} color={T.text.dim} style={{ flexShrink: 0, marginTop: 2 }} />
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: T.text.secondary }}>{error}</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: quickGridColumns, gap: 8 }}>
              {QUICK_CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                return (
                  <button type="button"
                    key={cat.id}
                    onClick={() => handleManualCategory(cat.id)}
                    className="card-press"
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      padding: denseEmbedded ? 8 : 10, borderRadius: 12, background: T.bg.elevated, border: `1px solid ${T.border.default}`,
                      boxShadow: T.shadow.sm, gap: 4
                    }}
                  >
                    <Icon size={denseEmbedded ? 15 : 16} color={cat.color} />
                    <span style={{ fontSize: denseEmbedded ? 9.5 : 10, fontWeight: 700, color: T.text.secondary }}>{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Skeleton State */}
        {categorizing && (
          <div className="slide-up" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
             <Skeleton height={200} borderRadius={24} />
             <Skeleton height={80} borderRadius={16} />
          </div>
        )}

        {/* ═══ RESULTS ═══ */}
        {resolvedCategory && recommendations.length > 0 && winner && !isTyping && !categorizing && (
          <div className="stagger-container" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            <Card variant="glass" style={{ padding: isNarrowPhone ? "16px 14px" : "18px", borderRadius: 24, display: "grid", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                    Best match
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
                    {resolvedMerchantLabel || "Selected category"}
                  </div>
                  <div style={{ fontSize: 12.5, color: T.text.secondary, lineHeight: 1.55, marginTop: 6 }}>
                    Catalyst matched this purchase to <span style={{ color: T.text.primary, fontWeight: 700 }}>{resolvedCategoryLabel}</span> and ranked your wallet by expected return.
                  </div>
                </div>
                <Badge variant="purple">{formatMatchSourceLabel(matchSource)}</Badge>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: walletGridColumns, gap: 10 }}>
                <div style={{ padding: "12px 12px 11px", borderRadius: 18, border: `1px solid ${T.border.subtle}`, background: T.bg.surface }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.06em" }}>Best card</div>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "center", marginTop: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 900, color: T.text.primary, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
                        {winnerLabel || winner.name}
                      </div>
                      <div style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.45, marginTop: 6 }}>
                        {formatRewardRate(winner.currentMultiplier, winner.currency)}
                      </div>
                    </div>
                    <div style={{ width: 94, flexShrink: 0 }}>
                      <RewardCardVisual
                        card={{ ...winner, name: winnerLabel || winner.name }}
                        size="mini"
                        subtitle={winner.institution || "Best pick"}
                        highlight={formatRewardRateShort(winner.currentMultiplier, winner.currency)}
                      />
                    </div>
                  </div>
                </div>
                <div style={{ padding: "12px 12px 11px", borderRadius: 18, border: `1px solid ${T.border.subtle}`, background: T.bg.surface }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.06em" }}>Lead over backup</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: winnerEdge > 0 ? T.status.green : T.text.primary, marginTop: 6, letterSpacing: "-0.02em" }}>
                    {runnerUp ? `${winnerEdge.toFixed(1)}%` : "Only option"}
                  </div>
                  <div style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.45, marginTop: 6 }}>
                    {runnerUp ? rewardGap ? `About $${rewardGap} more than ${runnerUpLabel || runnerUp.name} on this purchase.` : `${runnerUpLabel || runnerUp.name} is next in line.` : "No second card in this wallet."}
                  </div>
                </div>
                <div style={{ padding: "12px 12px 11px", borderRadius: 18, border: `1px solid ${T.border.subtle}`, background: T.bg.surface, gridColumn: isTablet ? "auto" : "1 / -1" }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.06em" }}>Estimated return</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: winnerReturn ? T.accent.primary : T.text.primary, marginTop: 6, letterSpacing: "-0.02em" }}>
                    {winnerReturn ? `$${winnerReturn}` : "Add spend amount"}
                  </div>
                  <div style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.45, marginTop: 6 }}>
                    {winnerReturn ? `On a ${formatCompactCurrency(spendAmountValue)} purchase.` : "Add an amount to see dollar estimates instead of just earn rates."}
                  </div>
                </div>
              </div>
            </Card>

            {/* Controversial Merchant Warning */}
            {(() => {
              const warning = getControversialWarning(resolvedMerchant?.name);
              if (!warning) return null;
              return (
                <div className="fade-in" style={{ padding: "10px 14px", borderRadius: 12, background: `${T.status.amber}12`, border: `1px solid ${T.status.amber}35`, display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <AlertCircle size={15} color={T.status.amber} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <p style={{ margin: "0 0 3px 0", fontSize: 12, fontWeight: 800, color: T.status.amber }}>Issuer Coding Varies</p>
                    <p style={{ margin: 0, fontSize: 11, color: T.text.secondary, lineHeight: 1.45 }}>{warning.tip}</p>
                    <p style={{ margin: "4px 0 0 0", fontSize: 10, fontWeight: 700, color: T.text.dim, fontFamily: T.font.mono }}>{warning.issuers}</p>
                  </div>
                </div>
              );
            })()}

            {/* Spend Amount Input */}
            <Card variant="glass" className="fade-in" style={{ padding: isNarrowPhone ? "14px" : "16px", borderRadius: 22, display: "grid", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                    Purchase size
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.02em" }}>
                    See the return before you tap to pay
                  </div>
                  <div style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.5, marginTop: 6, maxWidth: 520 }}>
                    Amount is optional, but it unlocks dollar estimates and shows how much the winning card beats your backup on this exact purchase.
                  </div>
                </div>
                {rewardGap ? (
                  <Badge variant="outline" style={{ color: T.status.green, borderColor: `${T.status.green}35`, background: `${T.status.green}12` }}>
                    +${rewardGap} vs backup
                  </Badge>
                ) : null}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isNarrowPhone ? "1fr" : "minmax(0, 1fr) auto", gap: 10, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px" }}>
                  <DollarSign size={16} color={T.text.dim} />
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="Spend amount (optional)"
                    value={spendAmount}
                    onChange={(e) => setSpendAmount(e.target.value)}
                    style={{
                      flex: 1, padding: "10px 12px", background: T.bg.surface,
                      border: `1px solid ${T.border.default}`, borderRadius: 12,
                      color: T.text.primary, fontSize: 14, minHeight: 42,
                    }}
                  />
                  {spendAmount && (
                    <button type="button" className="hover-btn" onClick={() => setSpendAmount("")}
                      style={{ background: "transparent", border: "none", color: T.text.dim, padding: 4 }}>
                      <X size={14} />
                    </button>
                  )}
                </div>
                {winnerReturn ? (
                  <div style={{ padding: "11px 12px", borderRadius: 14, border: `1px solid ${T.border.subtle}`, background: T.bg.surface, minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Best card earns
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 900, color: T.accent.primary, marginTop: 5, letterSpacing: "-0.02em" }}>
                      ${winnerReturn}
                    </div>
                    <div style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.45, marginTop: 4 }}>
                      {runnerUpReturn ? `${runnerUpLabel || runnerUp?.name} earns $${runnerUpReturn}.` : "No backup card to compare."}
                    </div>
                  </div>
                ) : null}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {spendPresets.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => {
                      haptic.selection();
                      setSpendAmount(String(amount));
                    }}
                    style={{
                      minHeight: 34,
                      padding: "0 12px",
                      borderRadius: 999,
                      border: `1px solid ${spendAmountValue === amount ? `${T.accent.primary}40` : T.border.subtle}`,
                      background: spendAmountValue === amount ? `${T.accent.primary}14` : T.bg.surface,
                      color: spendAmountValue === amount ? T.accent.primary : T.text.secondary,
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    {formatCompactCurrency(amount)}
                  </button>
                ))}
              </div>
            </Card>

            {/* Minimalist Winner Card */}
            <div style={{ position: "relative" }}>
              <Card
                className="slide-up"
                style={{
                  position: "relative", zIndex: 1, padding: isNarrowPhone ? "18px 16px" : "20px 24px", borderRadius: 24, overflow: "hidden",
                  border: `1px solid ${T.border.default}`,
                  background: T.bg.card,
                  display: "flex", flexDirection: "column", gap: 16
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isTablet ? "minmax(0, 1fr) 214px" : "1fr",
                    gap: 16,
                    alignItems: "stretch",
                  }}
                >
                  <div style={{ display: "grid", gap: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: isNarrowPhone ? "wrap" : "nowrap" }}>
                      <div>
                        <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: T.text.secondary, letterSpacing: "0.02em" }}>
                          {winner.institution || "Credit Card"}
                        </h3>
                        <p style={{ margin: "6px 0 0", fontSize: 11, color: T.text.dim, lineHeight: 1.45 }}>
                          Best choice for {resolvedMerchantLabel}.
                        </p>
                      </div>
                      <Badge variant="teal" style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>
                        <Check size={10} style={{ marginRight: 4 }} />
                        Best pick
                      </Badge>
                    </div>

                    <div style={{ padding: "2px 0 0" }}>
                      <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 4px 0", color: T.text.primary, lineHeight: 1.2 }}>
                        {winner.name}
                      </h2>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, color: T.text.secondary }}>
                        <Sparkles size={14} color={T.accent.emerald} />
                        <span>{formatRewardRate(winner.multiplier, winner.currency)}</span>
                      </div>
                    </div>
                  </div>

                  <RewardCardVisual
                    card={winner}
                    size={isTablet ? "hero" : "compact"}
                    subtitle={formatRewardCategoryLabel(winner.effectiveCategory || resolvedCategory)}
                    highlight={winnerReturn ? `$${winnerReturn}` : formatRewardRateShort(winner.currentMultiplier, winner.currency)}
                    style={{ minHeight: isTablet ? 122 : 94 }}
                  />
                </div>

                <div>
                  <button
                    type="button"
                    className="hover-btn"
                      onClick={(e) => handleToggleSubTarget(e, winner.id)}
                      style={{
                        padding: "6px 12px", borderRadius: 8,
                        background: winner.id === subTargetId ? T.accent.primary : T.bg.elevated,
                        color: winner.id === subTargetId ? "#fff" : T.text.secondary,
                        border: winner.id === subTargetId ? "none" : `1px solid ${T.border.default}`, 
                        fontSize: 11, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
                        boxShadow: winner.id === subTargetId ? T.shadow.sm : "none",
                        transition: "transform 0.2s ease, opacity 0.2s ease, background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease"
                      }}
                    >
                      <Package size={12} fill={winner.id === subTargetId ? "currentColor" : "none"} />
                      {winner.id === subTargetId ? "Bonus focus enabled" : "Set bonus focus"}
                    </button>
                </div>

                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: isNarrowPhone ? "wrap" : "nowrap" }}>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, margin: "0 0 4px 0", color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {winner.id === subTargetId ? "Bonus focus" : "Expected value"}
                    </p>
                    <div className="score-pop" style={{ fontSize: winner.id === subTargetId ? 32 : 44, fontWeight: 900, letterSpacing: "-0.04em", margin: 0, lineHeight: 1, filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.08))", color: winner.id === subTargetId ? T.accent.primary : T.status.green }}>
                      {winner.id === subTargetId ? "Bonus focus" : `${winner.effectiveYield}%`}
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 600, marginTop: 8, color: T.text.secondary }}>
                      {formatRewardRate(winner.currentMultiplier, winner.currency)} on {formatRewardCategoryLabel(winner.effectiveCategory || resolvedCategory)}
                      {winner.cpp !== 1.0 ? ` (${formatRewardNumber(winner.currentMultiplier * winner.cpp)}% value)` : ""}
                      {winner.issuerCategory && winner.issuerCategory !== resolvedCategory && (
                        <span style={{ fontSize: 10, color: T.text.dim, fontWeight: 500 }}> (coded as {formatRewardCategoryLabel(winner.issuerCategory)} at {winner.institution})</span>
                      )}
                    </p>
                    {dollarReturn(winner.effectiveYield) && winner.id !== subTargetId && (
                      <p style={{ fontSize: 15, fontWeight: 800, marginTop: 4, color: T.text.primary }}>
                        About ${dollarReturn(winner.effectiveYield)} back
                      </p>
                    )}
                  </div>

                  {winner.utilization > 0 && runnerUp && winner.effectiveYield === runnerUp.effectiveYield && (
                    <div style={{ background: T.bg.surface, padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.border.subtle}`, display: "flex", alignItems: "center", gap: 6, color: T.text.secondary }}>
                       <Info size={12} color={T.text.dim} />
                       <span style={{ fontSize: 10, fontWeight: 700 }}>Lower balance impact</span>
                    </div>
                  )}
                </div>
              </Card>
            </div>

              {/* Disclosures */}
              <div>
                {winner.cpp !== 1.0 && (
                  <p className="fade-in" style={{ fontSize: 12, fontWeight: 500, color: T.text.secondary, display: "flex", alignItems: "center", gap: 6, margin: "16px 0 12px 12px", animationDelay: "0.3s" }}>
                     <Info size={14} color={T.text.dim} />
                     Value assumes <span style={{ color: T.text.primary, fontWeight: 700 }}>{winner.cpp}¢</span> per point ({formatRewardRate(winner.currentMultiplier, winner.currency)} current earn rate).
                  </p>
                )}
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  {winner.blendedMsg && (
                    <div className="fade-in" style={{ padding: 12, borderRadius: 12, background: T.bg.surface, border: `1px solid ${T.status.amber}`, display: "flex", alignItems: "flex-start", gap: 10, animationDelay: "0.35s" }}>
                      <AlertCircle size={16} color={T.status.amber} style={{ marginTop: 2, flexShrink: 0 }} />
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: T.status.amber }}>{winner.blendedMsg}</p>
                    </div>
                  )}
                  {winner.cap && !winner.isCappedOut && (
                    <div className="fade-in" style={{ padding: 12, borderRadius: 12, background: T.status.blueDim, border: `1px solid rgba(107, 163, 232, 0.2)`, display: "flex", flexDirection: "column", gap: 6, animationDelay: "0.4s" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <Info size={16} color={T.status.blue} style={{ marginTop: 2, flexShrink: 0 }} />
                        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: T.status.blue }}>Spending Cap: High multiplier limited to <InlineTooltip term={"Spending Cap"}>${winner.cap.toLocaleString()}</InlineTooltip> per cycle.</p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 26 }}>
                        <span style={{ fontSize: 11, color: T.status.blue, fontWeight: 500 }}>Already spent: $</span>
                        <input
                          type="number"
                          placeholder="0"
                          value={usedCaps[winner.id] || ""}
                          onChange={(e) => handleUpdateUsedCap(winner.id, e)}
                          style={{
                            background: "rgba(255,255,255,0.5)", border: `1px solid rgba(107, 163, 232, 0.4)`,
                            borderRadius: 6, padding: "4px 8px", width: 80, fontSize: 12, color: T.text.primary, fontWeight: 600
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {winner.isFlexible && (
                    <div className="fade-in" style={{ padding: 12, borderRadius: 12, background: T.status.amberDim, border: `1px solid rgba(224, 168, 77, 0.2)`, display: "flex", alignItems: "flex-start", gap: 10, animationDelay: "0.5s" }}>
                      <AlertCircle size={16} color={T.status.amber} style={{ marginTop: 2, flexShrink: 0 }} />
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: T.status.amber }}>
                        Conditional bonus: this card can reach {formatRewardRate(winner.potentialMax || winner.currentMultiplier, winner.currency)}
                        ({parseFloat(((winner.potentialMax || winner.currentMultiplier) * winner.cpp).toFixed(2))}% value)
                        if {resolvedCategoryLabel.toLowerCase()} is your top spend category. Otherwise it falls back to {parseFloat((winner.baseMultiplier * winner.cpp).toFixed(2))}%.
                      </p>
                    </div>
                  )}
                  {winner.rotating && (
                    <div className="fade-in" style={{ padding: 12, borderRadius: 12, background: T.status.purpleDim, border: `1px solid rgba(155, 111, 212, 0.2)`, display: "flex", alignItems: "flex-start", gap: 10, animationDelay: "0.5s" }}>
                      <RotateCw size={16} color={T.status.purple} style={{ marginTop: 2, flexShrink: 0 }} />
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: T.status.purple }}>
                        Rotating bonus: this card offers {formatRewardRate(winner.rotating, winner.currency)} on quarterly bonus categories. Confirm that {resolvedCategoryLabel.toLowerCase()} qualifies this quarter.
                      </p>
                    </div>
                  )}
                  {winner.mobileWallet && (
                    <div className="fade-in" style={{ padding: 12, borderRadius: 12, background: T.status.blueDim, border: `1px solid rgba(107, 163, 232, 0.2)`, display: "flex", alignItems: "flex-start", gap: 10, animationDelay: "0.5s" }}>
                      <Smartphone size={16} color={T.status.blue} style={{ marginTop: 2, flexShrink: 0 }} />
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: T.status.blue }}>
                        Mobile wallet bonus: earns {formatRewardRate(winner.mobileWallet, winner.currency)} when you pay with Apple Pay, Google Pay, or Samsung Pay.
                      </p>
                    </div>
                  )}
                  {winner.notes && (
                    <div className="fade-in" style={{ padding: 12, borderRadius: 12, background: T.bg.surface, border: `1px solid ${T.border.subtle}`, display: "flex", alignItems: "flex-start", gap: 10, animationDelay: "0.6s" }}>
                      <Info size={16} color={T.text.dim} style={{ marginTop: 2, flexShrink: 0 }} />
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: T.text.secondary }}>{winner.notes}</p>
                    </div>
                  )}
                </div>

                {/* ── Full Earning Profile ── */}
                {(() => {
                  const allCats = ["dining", "groceries", "gas", "travel", "transit", "online_shopping", "streaming", "wholesale_clubs", "drugstores", "catch-all"];
                  const profile = allCats.map(cat => {
                    const info = getCardMultiplier(winner.name, cat, customValuations);
                    return { cat, label: formatRewardCategoryLabel(cat), multiplier: info.multiplier, currency: info.currency, yield: info.effectiveYield, active: cat === (winner.effectiveCategory || resolvedCategory) };
                  });
                  return (
                    <div className="fade-in" style={{ marginTop: 16, animationDelay: "0.5s" }}>
                      <p style={{ fontSize: 11, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, paddingLeft: 4 }}>Rewards by category</p>
                      <div style={{ display: "grid", gridTemplateColumns: earningsProfileColumns, gap: 4 }}>
                        {profile.map(p => (
                          <div key={p.cat} style={{
                            padding: "6px 4px", borderRadius: 8, textAlign: "center",
                            background: p.active ? `${T.accent.primary}20` : T.bg.surface,
                            border: `1px solid ${p.active ? T.accent.primary : T.border.subtle}`,
                          }}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: p.active ? T.accent.primary : T.text.primary }}>{formatRewardRateShort(p.multiplier, p.currency)}</div>
                            <div style={{ fontSize: 8, fontWeight: 700, color: p.active ? T.accent.primary : T.text.dim, textTransform: "uppercase", letterSpacing: "0.02em", marginTop: 2 }}>{p.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

            {/* Runners Up Teaser (Free) */}
            {!proEnabled && recommendations.length > 1 && (
              <div style={{ marginTop: 24, position: "relative" }}>
                <h3 style={{ fontSize: 12, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16, paddingLeft: 4 }}>Other strong options</h3>
                
                {/* Blurred mock up */}
                <div style={{ opacity: 0.25, filter: "blur(6px)", pointerEvents: "none", userSelect: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                  {[1, 2].map(i => (
                    <div key={i} style={{ height: 86, borderBottom: `1px solid ${T.border.subtle}` }} />
                  ))}
                </div>
                
                {/* Centered CTA */}
                <div style={{ position: "absolute", top: 40, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
                  <div style={{ padding: 24, textAlign: "center", width: "100%", maxWidth: 320, background: T.bg.elevated, border: `1px solid ${T.accent.primary}40`, borderRadius: 24 }}>
                     <div style={{ width: 48, height: 48, borderRadius: 24, background: T.accent.primary, margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                       <Lock size={24} color="#FFF" />
                     </div>
                     <h4 style={{ fontSize: 18, fontWeight: 800, color: T.text.primary, margin: "0 0 8px 0", letterSpacing: "-0.02em" }}>Unlock All Rankers</h4>
                     <p style={{ fontSize: 13, color: T.text.secondary, margin: "0 auto 20px", lineHeight: 1.5 }}>Upgrade to Catalyst Cash Pro to see every card in your wallet modeled to this purchase.</p>
                     <button type="button"
                       onClick={() => { haptic.medium(); setShowPaywall(true); }}
                       className="hover-lift"
                       style={{ background: T.accent.primary, color: "#fff", border: "none", padding: "14px 24px", borderRadius: 16, fontSize: 14, fontWeight: 800, cursor: "pointer", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                     >
                       <Zap size={16} fill="#fff" />
                       View Pro Plans
                     </button>
                  </div>
                </div>
              </div>
            )}

            {/* Runners Up (Pro) */}
            {proEnabled && recommendations.length > 1 && (
              <div style={{ marginTop: 8 }}>
                <h3 style={{ fontSize: 12, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12, paddingLeft: 4 }}>Other strong options</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 0, borderRadius: 20, overflow: "hidden", border: `1px solid ${T.border.subtle}`, background: T.bg.card }}>
                  {runnersToShow.map((card, idx) => (
                    <div key={card.id + idx} className="fade-in" style={{ 
                        display: "grid", gridTemplateColumns: isNarrowPhone ? "1fr" : "minmax(0, 1fr) auto", alignItems: "center", gap: 12,
                        padding: "16px 16px",
                        borderBottom: idx === runnersToShow.length - 1 ? "none" : `1px solid ${T.border.subtle}`,
                        animationDelay: `${idx * 0.05}s`
                      }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, minWidth: 0 }}>
                         {/* Rank Badge */}
                         <div style={{ width: 24, height: 24, borderRadius: 12, background: "transparent", border: `1px solid ${T.border.subtle}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: T.text.secondary, flexShrink: 0 }}>
                           {idx + 2}
                         </div>
                         <div style={{ width: 72, flexShrink: 0 }}>
                           <RewardCardVisual
                             card={card}
                             size="mini"
                             subtitle={card.institution || "Backup"}
                             highlight={formatRewardRateShort(card.currentMultiplier, card.currency)}
                           />
                         </div>
                         <div style={{ minWidth: 0 }}>
                           <p style={{ fontSize: 14, fontWeight: 700, color: T.text.primary, margin: "0 0 2px 0", lineHeight: 1 }}>{card.name}</p>
                           <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                             {card.id === subTargetId && <Badge variant="purple" style={{ fontSize: 9, padding: "2px 6px" }}>Bonus focus</Badge>}
                             {card.currency !== "CASH" && card.cpp !== 1.0 && (
                               <Badge variant="gray" style={{ fontSize: 9, padding: "2px 6px" }}>{card.cpp}¢ / pt</Badge>
                             )}
                             <span style={{ fontSize: 11, fontWeight: 500, color: T.text.muted }}>{formatRewardRate(card.currentMultiplier, card.currency)} on {formatRewardCategoryLabel(card.effectiveCategory || resolvedCategory)}</span>
                             {card.issuerCategory && card.issuerCategory !== resolvedCategory && (
                               <Badge variant="amber" style={{ fontSize: 9, padding: "2px 6px" }}>Coded as {formatRewardCategoryLabel(card.issuerCategory)}</Badge>
                             )}
                             {card.blendedMsg && <Badge variant="amber" style={{ fontSize: 9, padding: "2px 6px" }}>Blended rate</Badge>}
                             {card.isFlexible && <Badge variant="amber" style={{ fontSize: 9, padding: "2px 6px" }}>Conditional</Badge>}
                             {card.rotating && <Badge variant="purple" style={{ fontSize: 9, padding: "2px 6px" }}>Rotating</Badge>}
                             {card.mobileWallet && <Badge variant="blue" style={{ fontSize: 9, padding: "2px 6px" }}>{formatRewardRateShort(card.mobileWallet, card.currency)} wallet</Badge>}
                           </div>
                           {card.cap && (
                              <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, background: T.bg.surface, padding: "4px 8px", borderRadius: 6, border: `1px solid ${T.border.subtle}`, width: "fit-content" }}>
                                <span style={{ fontSize: 10, color: T.text.dim }}>Used Cap: $</span>
                                <input
                                  type="number"
                                  placeholder="0"
                                  value={usedCaps[card.id] || ""}
                                  onChange={(e) => handleUpdateUsedCap(card.id, e)}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ background: "transparent", border: "none", borderBottom: `1px solid ${T.border.subtle}`, width: 50, fontSize: 11, color: T.text.primary, padding: 0 }}
                                />
                                <span style={{ fontSize: 10, color: T.text.dim }}>/ ${card.cap}</span>
                              </div>
                           )}
                         </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: isNarrowPhone ? "flex-start" : "flex-end", position: "relative" }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: card.id === subTargetId ? T.status.purple : T.text.primary, letterSpacing: "-0.02em" }}>
                           {card.id === subTargetId ? "Bonus focus" : `${card.effectiveYield}%`}
                        </div>
                        {winner && card.id !== subTargetId && (
                          <span style={{ fontSize: 11, color: T.text.dim, fontWeight: 600 }}>
                            {winner.effectiveYield > card.effectiveYield ? `${(winner.effectiveYield - card.effectiveYield).toFixed(1)}% behind winner` : "Matches winner"}
                          </span>
                        )}
                        {dollarReturn(card.effectiveYield) && card.id !== subTargetId && (
                          <span style={{ fontSize: 11, color: T.text.muted, fontWeight: 600 }}>
                            ${dollarReturn(card.effectiveYield)} back
                          </span>
                        )}
                        <button type="button"
                          className="hover-btn"
                          onClick={(e) => handleToggleSubTarget(e, card.id)}
                          style={{
                            background: "transparent", border: "none", color: card.id === subTargetId ? T.text.dim : T.accent.primary,
                            fontSize: 10, fontWeight: 700, marginTop: 4, cursor: "pointer", textDecoration: "underline"
                          }}
                        >
                          {card.id === subTargetId ? "Clear bonus focus" : "Set bonus focus"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Show All Toggle */}
                {recommendations.length > 4 && (
                  <button type="button"
                    className="hover-btn fade-in"
                    onClick={() => { haptic.selection(); setShowAllRunners(!showAllRunners); }}
                    style={{
                      width: "100%", padding: 12, marginTop: 8, borderRadius: 12,
                      background: "transparent", border: `1px solid ${T.border.subtle}`,
                      color: T.text.secondary, fontSize: 13, fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    }}
                  >
                    <ChevronDown size={14} style={{ transform: showAllRunners ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }} />
                    {showAllRunners ? "Show fewer" : `Show all ${recommendations.length - 1} options`}
                  </button>
                )}
              </div>
            )}

            {/* Start Over */}
            <button type="button"
              className="hover-btn fade-in"
              onClick={() => {
                haptic.selection();
                setQuery("");
                setResolvedCategory(null);
                setResolvedMerchant(null);
                setSpendAmount("");
                setShowAllRunners(false);
                scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
              }}
              style={{
                width: "100%", padding: 16, marginTop: 16, borderRadius: 16,
                background: T.bg.elevated, border: `1px solid ${T.border.default}`,
                color: T.text.primary, fontSize: 16, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: T.shadow.sm, animationDelay: "0.6s"
              }}
            >
              <RefreshCw size={18} color={T.text.secondary} />
              Start New Search
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
