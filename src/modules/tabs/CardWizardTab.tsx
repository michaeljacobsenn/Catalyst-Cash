  import React,{ lazy,Suspense,useEffect,useMemo,useRef,useState } from "react";
  import type { CatalystCashConfig,Card as PortfolioCard } from "../../types/index.js";
  import { classifyMerchant } from "../api.js";
  import { T } from "../constants.js";
  import { log } from "../logger.js";
  import { usePortfolio } from "../contexts/PortfolioContext.js";
  import { useSettings } from "../contexts/SettingsContext.js";
  import GeoSuggestWidget from "../dashboard/GeoSuggestWidget.js";
  import { haptic } from "../haptics.js";
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
    Train,
    Tv,
    X,
    Zap
  } from "../icons";
  import { extractCategoryByKeywords,MERCHANT_DATABASE } from "../merchantDatabase.js";
  import { getCardMultiplier,VALUATIONS } from "../rewardsCatalog.js";
  import { Badge,Card,FormGroup,FormRow,InlineTooltip,Skeleton } from "../ui.js";
  import { db } from "../utils.js";

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
}

type UsedCaps = Record<string, number | "">;

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

export default function CardWizardTab({ proEnabled = false }: CardWizardTabProps) {
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
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 150/100 Feature: Sign-Up Bonus Target — persisted via db (consistent with app data layer)
  const [subTargetId, setSubTargetId] = useState<string | null>(null);
  useEffect(() => {
    db.get("cw-sub-target").then(val => { if (typeof val === "string") setSubTargetId(val); });
  }, []);

  // 150/100 Feature: Quarterly Cap Tracker — persisted via db (consistent with app data layer)
  const [usedCaps, setUsedCaps] = useState<UsedCaps>({});
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

  const customValuations = (financialConfig?.customValuations || {}) as CatalystCashConfig["customValuations"];

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
      // Soft graceful degradation message instead of harsh red alert
      setError("AI is temporarily unavailable or uncertain. Please verify the category below:");
    } finally {
      setCategorizing(false);
    }
  };

  const handleSelectMerchant = (merchant: MerchantOption) => {
    haptic.selection();
    setQuery(merchant.name);
    setError("");
    setIsTyping(false);
    setShowSuggestions(false);
    setShowValuations(false);
    setShowAllRunners(false);
    setResolvedCategory(merchant.category);
    setResolvedMerchant(merchant);
    setMatchSource("instant");
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

    const scored = activeCreditCards.map(card => {
      // Per-card issuer category: some merchants code differently depending on which bank issues the card
      const issuerCategory = getIssuerCategoryOverride(merchantName, card.institution);
      const effectiveCategory = issuerCategory || resolvedCategory;
      const rewardInfo = getCardMultiplier(card.name, effectiveCategory, customValuations) as RewardInfo;
      // Business cards don't report utilization to personal bureaus; treat as 0% for tie-breakers to protect personal scores
      const balance = Number(card.balance) || 0;
      const limit = Number(card.limit) || 0;
      const utilization = card.type !== "business" && limit > 0 ? balance / limit : 0;

      let finalYield = rewardInfo.effectiveYield;
      let blendedMsg: string | null = null;
      let isCappedOut = false;
      const spend = parseFloat(spendAmount) || 0;

      if (rewardInfo.cap) {
        const used = parseFloat(String(usedCaps[card.id] ?? 0)) || 0;
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
        usedCap: parseFloat(String(usedCaps[card.id] ?? 0)) || 0,
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
  }, [resolvedCategory, resolvedMerchant, activeCreditCards, customValuations, subTargetId, spendAmount, usedCaps]);

  const dollarReturn = (yield_: number) => {
    const amt = parseFloat(spendAmount);
    if (!amt || amt <= 0) return null;
    return ((amt * yield_) / 100).toFixed(2);
  };

  if (activeCreditCards.length === 0) {
    return (
      <div className="safe-scroll-body page-body" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", width: "100%", flex: 1 }}>
        <div className="fade-in" style={{ maxWidth: 400, textAlign: "center", padding: 32, margin: "0 auto", borderRadius: 24, border: `1px solid ${T.border.default}`, background: "transparent" }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: T.bg.elevated, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <CreditCard size={32} color={T.text.muted} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: T.text.primary, marginBottom: 12 }}>Empty Wallet</h2>
          <p style={{ fontSize: 14, color: T.text.secondary, lineHeight: 1.5 }}>
            The Card Wizard needs to know what cards you have to mathematically deduce the best one. Add your credit cards in the Portfolio tab to unlock intelligent AI sorting.
          </p>
        </div>
      </div>
    );
  }


  const runnersToShow = showAllRunners ? recommendations.slice(1) : recommendations.slice(1, 4);
  const winner = recommendations[0];
  const runnerUp = recommendations[1];

  return (
    <div ref={scrollRef} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", flex: 1 }}>
      <div className="page-body" style={{ maxWidth: 768, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Pro Banner Removed - Teaser is now in the results section */}
        {showPaywall && (
          <Suspense fallback={null}>
            <LazyProPaywall onClose={() => setShowPaywall(false)} />
          </Suspense>
        )}

        {/* Header */}
        <div className="fade-in" style={{ textAlign: "center", marginTop: 8 }}>
          <div style={{ display: "inline-flex", padding: 12, borderRadius: 16, background: T.bg.elevated, border: `1px solid ${T.border.default}`, boxShadow: T.shadow.sm, marginBottom: 12 }}>
            <Sparkles color={T.accent.primary} size={28} />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: T.text.primary, marginBottom: 6 }}>Card Wizard</h1>
          <p style={{ fontSize: 14, color: T.text.secondary, maxWidth: 320, margin: "0 auto" }}>Enter a merchant to find your best card for maximum rewards.</p>
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
            placeholder="e.g. Amazon, Uber, Starbucks..."
            style={{
              width: "100%",
              padding: "14px 140px 14px 44px",
              background: T.bg.elevated,
              border: `1.5px solid ${T.border.default}`,
              borderRadius: 16,
              color: T.text.primary,
              fontSize: 16,
              fontWeight: 500,
              boxShadow: T.shadow.card,
              minHeight: 52
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
                height: 36,
                padding: "0 14px",
                background: T.accent.primary,
                color: "#fff",
                fontWeight: 700,
                borderRadius: 10,
                border: "none",
                fontSize: 13,
                opacity: (!query.trim() || categorizing) ? 0.5 : 1,
              }}
            >
              {categorizing ? <div className="spin"><div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%" }} /></div> : "Find Best Card"}
            </button>
          )}

          {/* Auto-Suggest Dropdown */}
          {showSuggestions && query.trim() && filteredMerchants.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 8, background: T.bg.elevated, borderRadius: 16, border: `1px solid ${T.border.subtle}`, boxShadow: T.shadow.elevated, overflow: "hidden", display: "flex", flexDirection: "column" }}>
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
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: m.color || T.border.subtle, marginRight: 12, flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: T.text.primary }}>{m.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Search History Dropdown */}
          {showSuggestions && !query.trim() && searchHistory.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 8, background: T.bg.elevated, borderRadius: 16, border: `1px solid ${T.border.subtle}`, boxShadow: T.shadow.elevated, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, padding: "8px 16px 4px", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>Recent</p>
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
                  <span style={{ fontSize: 14, fontWeight: 600, color: T.text.primary }}>{m.name}</span>
                </button>
              ))}
            </div>
          )}
        </form>

        {/* Nearby Suggest + Point Valuations */}
        {(!resolvedCategory || showValuations) && !categorizing && (
          <div className="fade-in">
            <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 8 }}>
              <GeoSuggestWidget />
              <button
                className="hover-btn"
                onClick={() => { haptic.selection(); setShowValuations(!showValuations); }}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 20, background: T.bg.surface, border: `1px solid ${T.border.subtle}`, color: T.text.secondary, fontSize: 12, fontWeight: 700 }}
              >
                <Settings2 size={14} />
                {showValuations ? "Hide Point Valuations" : "Edit Point Valuations"}
                <ChevronDown size={14} style={{ transform: showValuations ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }} />
              </button>
            </div>

            <div className="collapse-section" data-collapsed={!showValuations} style={{ marginTop: 16 }}>
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
                          <button
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
              {/* Reset All */}
              {Object.keys(customValuations).length > 0 && (
                <button
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
          <div style={{ maxWidth: 500, margin: "0 auto", width: "100%" }}>
            <div className="stagger-container" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {QUICK_CATEGORIES.map((cat, idx) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  onClick={() => handleQuickSelect(cat.id)}
                  className="card-press"
                  style={{
                    height: 96, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    padding: 8, borderRadius: 16, background: "transparent", border: `1px solid ${T.border.subtle}`,
                    animationDelay: `${idx * 0.05}s`
                  }}
                >
                  <div style={{ padding: 10, borderRadius: 12, background: cat.bg, marginBottom: 8, pointerEvents: "none" }}>
                    <Icon size={20} color={cat.color} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.text.secondary }}>{cat.label}</span>
                </button>
              );
            })}
            </div>
          </div>
        )}

        {/* Error + Manual Category Selector */}
        {error && (
          <div className="slide-up" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ padding: 14, borderRadius: 12, background: T.bg.surface, border: `1px solid ${T.border.default}`, display: "flex", alignItems: "flex-start", gap: 12, boxShadow: T.shadow.sm }}>
              <Info size={18} color={T.text.dim} style={{ flexShrink: 0, marginTop: 2 }} />
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: T.text.secondary }}>{error}</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {QUICK_CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    onClick={() => handleManualCategory(cat.id)}
                    className="card-press"
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      padding: 10, borderRadius: 12, background: T.bg.elevated, border: `1px solid ${T.border.default}`,
                      boxShadow: T.shadow.sm, gap: 4
                    }}
                  >
                    <Icon size={16} color={cat.color} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: T.text.secondary }}>{cat.label}</span>
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

            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px" }}>
               <Badge variant="purple">{matchSource === "ai" ? "AI Matched" : matchSource === "keyword" ? "Keyword Match" : matchSource === "category" ? "Category" : "Instant Match"}</Badge>
               <h3 style={{ fontSize: 12, fontWeight: 800, color: T.text.primary, textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>
                 {resolvedCategory.replace(/_/g, " ")}
               </h3>
            </div>

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
            <div className="fade-in" style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px" }}>
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
                  color: T.text.primary, fontSize: 14, minHeight: 40,
                }}
              />
              {spendAmount && (
                <button className="hover-btn" onClick={() => setSpendAmount("")}
                  style={{ background: "transparent", border: "none", color: T.text.dim, padding: 4 }}>
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Minimalist Winner Card */}
            <div style={{ position: "relative" }}>
              <Card
                className="slide-up"
                style={{
                  position: "relative", zIndex: 1, padding: "20px 24px", borderRadius: 24, overflow: "hidden",
                  border: `1px solid ${T.border.default}`,
                  background: T.bg.card,
                  display: "flex", flexDirection: "column", gap: 16
                }}
              >
                {/* Top Row: Institution + Chip */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: T.text.secondary, letterSpacing: "0.02em" }}>
                    {winner.institution || "Credit Card"}
                  </h3>
                  <Badge variant="teal" style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>
                    <Check size={10} style={{ marginRight: 4 }} />
                    Optimal Choice
                  </Badge>
                </div>

                {/* Middle: Card Name & Yields */}
                <div style={{ padding: "8px 0" }}>
                  <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 4px 0", color: T.text.primary, lineHeight: 1.2 }}>
                    {winner.name}
                  </h2>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, color: T.text.secondary }}>
                    <Sparkles size={14} color={T.accent.emerald} />
                    <span>{formatRewardRate(winner.multiplier, winner.currency)}</span>
                  </div>
                </div>

                {/* Bottom: Yield Badge */}
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
                        transition: "all 0.2s ease"
                      }}
                    >
                      <Package size={12} fill={winner.id === subTargetId ? "currentColor" : "none"} />
                      {winner.id === subTargetId ? "Working on Sign-Up Bonus" : "Targeting Sign-Up Bonus?"}
                    </button>
                  </div>

                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, margin: "0 0 4px 0", color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {winner.id === subTargetId ? "Priority Override" : "Effective Yield"}
                      </p>
                      <div className="score-pop" style={{ fontSize: winner.id === subTargetId ? 32 : 44, fontWeight: 900, letterSpacing: "-0.04em", margin: 0, lineHeight: 1, filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.08))", color: winner.id === subTargetId ? T.accent.primary : T.status.green }}>
                        {winner.id === subTargetId ? "SUB TARGET" : `${winner.effectiveYield}%`}
                      </div>
                      <p style={{ fontSize: 13, fontWeight: 600, marginTop: 8, color: T.text.secondary }}>
                        {formatRewardRate(winner.currentMultiplier, winner.currency)} on {(winner.effectiveCategory || resolvedCategory).replace(/_/g, " ")}
                        {winner.cpp !== 1.0 ? ` (${formatRewardNumber(winner.currentMultiplier * winner.cpp)}% effective yield)` : ""}
                        {winner.issuerCategory && winner.issuerCategory !== resolvedCategory && (
                          <span style={{ fontSize: 10, color: T.text.dim, fontWeight: 500 }}> (coded as {winner.issuerCategory.replace(/_/g, " ")} at {winner.institution})</span>
                        )}
                      </p>
                      {dollarReturn(winner.effectiveYield) && winner.id !== subTargetId && (
                        <p style={{ fontSize: 15, fontWeight: 800, marginTop: 4, color: T.text.primary }}>
                          ${dollarReturn(winner.effectiveYield)} back
                        </p>
                      )}
                    </div>

                    {winner.utilization > 0 && runnerUp && winner.effectiveYield === runnerUp.effectiveYield && (
                      <div style={{ background: T.bg.surface, padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.border.subtle}`, display: "flex", alignItems: "center", gap: 6, color: T.text.secondary }}>
                         <Info size={12} color={T.text.dim} />
                         <span style={{ fontSize: 10, fontWeight: 700 }}>Low Util.</span>
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
                     Yield applies <span style={{ color: T.text.primary, fontWeight: 700 }}>{winner.cpp}¢</span> point valuation ({formatRewardRate(winner.currentMultiplier, winner.currency)} current rate).
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
                        Conditional Max: Could earn up to {formatRewardRate(winner.potentialMax || winner.currentMultiplier, winner.currency)}
                        ({parseFloat(((winner.potentialMax || winner.currentMultiplier) * winner.cpp).toFixed(2))}% yield)
                        if {resolvedCategory.replace(/_/g, " ")} is your top spend category.
                        Otherwise {parseFloat((winner.baseMultiplier * winner.cpp).toFixed(2))}%.
                      </p>
                    </div>
                  )}
                  {winner.rotating && (
                    <div className="fade-in" style={{ padding: 12, borderRadius: 12, background: T.status.purpleDim, border: `1px solid rgba(155, 111, 212, 0.2)`, display: "flex", alignItems: "flex-start", gap: 10, animationDelay: "0.5s" }}>
                      <RotateCw size={16} color={T.status.purple} style={{ marginTop: 2, flexShrink: 0 }} />
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: T.status.purple }}>
                        Rotating Category: This card offers {formatRewardRate(winner.rotating, winner.currency)} on quarterly rotating categories. Check if {resolvedCategory.replace(/_/g, " ")} qualifies this quarter.
                      </p>
                    </div>
                  )}
                  {winner.mobileWallet && (
                    <div className="fade-in" style={{ padding: 12, borderRadius: 12, background: T.status.blueDim, border: `1px solid rgba(107, 163, 232, 0.2)`, display: "flex", alignItems: "flex-start", gap: 10, animationDelay: "0.5s" }}>
                      <Smartphone size={16} color={T.status.blue} style={{ marginTop: 2, flexShrink: 0 }} />
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: T.status.blue }}>
                        Mobile Wallet Bonus: Earns {formatRewardRate(winner.mobileWallet, winner.currency)} on wallet purchases made via Apple Pay, Google Pay, or Samsung Pay.
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
                  const catLabels = { dining: "Dining", groceries: "Groceries", gas: "Gas", travel: "Travel", transit: "Transit", online_shopping: "Online", streaming: "Streaming", wholesale_clubs: "Wholesale", drugstores: "Pharmacy", "catch-all": "Everything Else" };
                  const profile = allCats.map(cat => {
                    const info = getCardMultiplier(winner.name, cat, customValuations);
                    return { cat, label: catLabels[cat] || cat, multiplier: info.multiplier, currency: info.currency, yield: info.effectiveYield, active: cat === (winner.effectiveCategory || resolvedCategory) };
                  });
                  return (
                    <div className="fade-in" style={{ marginTop: 16, animationDelay: "0.5s" }}>
                      <p style={{ fontSize: 11, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, paddingLeft: 4 }}>Full Earning Profile</p>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4 }}>
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
                <h3 style={{ fontSize: 12, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16, paddingLeft: 4 }}>Runner Up Options</h3>
                
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
                     <button
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
                <h3 style={{ fontSize: 12, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12, paddingLeft: 4 }}>Runner Up Options</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {runnersToShow.map((card, idx) => (
                    <div key={card.id + idx} className="fade-in" style={{ 
                        display: "flex", alignItems: "center", justifyContent: "space-between", 
                        padding: "16px 16px",
                        borderBottom: idx === runnersToShow.length - 1 ? "none" : `1px solid ${T.border.subtle}`,
                        animationDelay: `${idx * 0.05}s`
                      }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                         {/* Rank Badge */}
                         <div style={{ width: 24, height: 24, borderRadius: 12, background: "transparent", border: `1px solid ${T.border.subtle}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: T.text.secondary, flexShrink: 0 }}>
                           {idx + 2}
                         </div>
                         <div>
                           <p style={{ fontSize: 14, fontWeight: 700, color: T.text.primary, margin: "0 0 2px 0", lineHeight: 1 }}>{card.name}</p>
                           <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                             {card.id === subTargetId && <Badge variant="purple" style={{ fontSize: 9, padding: "2px 6px" }}>Sign-Up Bonus</Badge>}
                             {card.currency !== "CASH" && card.cpp !== 1.0 && (
                               <Badge variant="gray" style={{ fontSize: 9, padding: "2px 6px" }}>{card.cpp}¢ / pt</Badge>
                             )}
                             <span style={{ fontSize: 11, fontWeight: 500, color: T.text.muted }}>{formatRewardRate(card.currentMultiplier, card.currency)} on {(card.effectiveCategory || resolvedCategory).replace(/_/g, " ")}</span>
                             {card.issuerCategory && card.issuerCategory !== resolvedCategory && (
                               <Badge variant="amber" style={{ fontSize: 9, padding: "2px 6px" }}>Coded as {card.issuerCategory.replace(/_/g, " ")}</Badge>
                             )}
                             {card.blendedMsg && <Badge variant="amber" style={{ fontSize: 9, padding: "2px 6px" }}>Blended Yield</Badge>}
                             {card.isFlexible && <Badge variant="amber" style={{ fontSize: 9, padding: "2px 6px" }}>Conditional</Badge>}
                             {card.rotating && <Badge variant="purple" style={{ fontSize: 9, padding: "2px 6px" }}>Rotating</Badge>}
                             {card.mobileWallet && <Badge variant="blue" style={{ fontSize: 9, padding: "2px 6px" }}>{formatRewardRateShort(card.mobileWallet, card.currency)} Wallet</Badge>}
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
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", position: "relative" }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: card.id === subTargetId ? T.status.purple : T.text.primary, letterSpacing: "-0.02em" }}>
                           {card.id === subTargetId ? "SUB Targeted" : `${card.effectiveYield}%`}
                        </div>
                        {dollarReturn(card.effectiveYield) && card.id !== subTargetId && (
                          <span style={{ fontSize: 11, color: T.text.muted, fontWeight: 600 }}>
                            ${dollarReturn(card.effectiveYield)} back
                          </span>
                        )}
                        <button
                          className="hover-btn"
                          onClick={(e) => handleToggleSubTarget(e, card.id)}
                          style={{
                            background: "transparent", border: "none", color: card.id === subTargetId ? T.text.dim : T.accent.primary,
                            fontSize: 10, fontWeight: 700, marginTop: 4, cursor: "pointer", textDecoration: "underline"
                          }}
                        >
                          {card.id === subTargetId ? "Remove SUB target" : "Set as SUB target"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Show All Toggle */}
                {recommendations.length > 4 && (
                  <button
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
                    {showAllRunners ? "Show fewer" : `Show all ${recommendations.length - 1} cards`}
                  </button>
                )}
              </div>
            )}

            {/* Start Over */}
            <button
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
