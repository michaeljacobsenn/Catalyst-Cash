import React, { useState, useContext, useMemo, useEffect } from "react";
import {
  Search, Sparkles, CreditCard, Coffee, ShoppingCart,
  Fuel, Plane, Train, Package, Store, Pill, AlertCircle, Info, Settings2, ChevronDown, Check, X, RefreshCw, Tv, DollarSign, Smartphone, RotateCw, Clock
} from "lucide-react";
import { PortfolioContext } from "../contexts/PortfolioContext.jsx";
import { useSettings } from "../contexts/SettingsContext.jsx";
import { getCardMultiplier, VALUATIONS } from "../rewardsCatalog.js";
import { classifyMerchant } from "../api.js";
import { haptic } from "../haptics.js";
import { InlineTooltip, FormGroup, FormRow, Skeleton } from "../ui.jsx";
import { MERCHANT_DATABASE, extractCategoryByKeywords } from "../merchantDatabase.js";
import { T } from "../constants.js";

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

// ── Persistent Search History ──
const HISTORY_KEY = "cw-search-history";
let searchHistory = [];
try { searchHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { searchHistory = []; }

function addToHistory(merchant) {
  if (!merchant || !merchant.name) return;
  searchHistory = [merchant, ...searchHistory.filter(m => m.name !== merchant.name)].slice(0, 5);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(searchHistory)); } catch { /* quota */ }
}

let cachedQuery = "";
let cachedCategory = null;
let cachedMerchant = null;

export default function CardWizardTab() {
  const { cards } = useContext(PortfolioContext);
  const { financialConfig, setFinancialConfig } = useSettings();

  const [query, setQuery] = useState(cachedQuery);
  const [isTyping, setIsTyping] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [categorizing, setCategorizing] = useState(false);
  const [resolvedCategory, setResolvedCategory] = useState(cachedCategory);
  const [resolvedMerchant, setResolvedMerchant] = useState(cachedMerchant);
  const [error, setError] = useState("");
  const [showValuations, setShowValuations] = useState(false);
  const [spendAmount, setSpendAmount] = useState("");
  const [showAllRunners, setShowAllRunners] = useState(false);
  
  // 150/100 Feature: Sign-Up Bonus Target
  const [subTargetId, setSubTargetId] = useState(() => localStorage.getItem("cw-sub-target") || null);

  // 150/100 Feature: Quarterly Cap Tracker
  const [usedCaps, setUsedCaps] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cw-used-caps") || "{}"); }
    catch { return {}; }
  });

  const handleUpdateUsedCap = (cardId, e) => {
    const val = e.target.value;
    const newCaps = { ...usedCaps, [cardId]: val === "" ? "" : parseFloat(val) };
    setUsedCaps(newCaps);
    localStorage.setItem("cw-used-caps", JSON.stringify(newCaps));
  };

  const filteredMerchants = useMemo(() => {
    if (!query.trim()) return [];
    const lower = query.toLowerCase().replace(/[^a-z0-9]/g, "");
    return MERCHANT_DATABASE.filter(m => 
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

  const activeCreditCards = useMemo(() => {
    return cards.filter(c => c.type === "credit" || !c.type);
  }, [cards]);

  const customValuations = financialConfig?.customValuations || {};

  const handleSearch = async (e) => {
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
      const merchant = { name: query, category: heuristicCategory, color: null };
      setResolvedMerchant(merchant);
      addToHistory(merchant);
      setCategorizing(false);
      setShowValuations(false);
      setShowAllRunners(false);
      haptic.success();
      return;
    }

    // 3. AI Fallback
    try {
      const category = await classifyMerchant(q);
      setResolvedCategory(category);
      const merchant = { name: query, category, color: null };
      setResolvedMerchant(merchant);
      addToHistory(merchant);
      setShowValuations(false);
      setShowAllRunners(false);
      haptic.success();
    } catch (err) {
      console.warn("AI categorization failed:", err);
      // Soft graceful degradation message instead of harsh red alert
      setError("AI is temporarily unavailable or uncertain. Please verify the category below:");
    } finally {
      setCategorizing(false);
    }
  };

  const handleSelectMerchant = (merchant) => {
    haptic.selection();
    setQuery(merchant.name);
    setError("");
    setIsTyping(false);
    setShowSuggestions(false);
    setShowValuations(false);
    setShowAllRunners(false);
    setResolvedCategory(merchant.category);
    setResolvedMerchant(merchant);
    addToHistory(merchant);
  };

  const handleQuickSelect = (categoryId) => {
    haptic.selection();
    setQuery("");
    setError("");
    setIsTyping(false);
    setShowSuggestions(false);
    setShowValuations(false);
    setShowAllRunners(false);
    setResolvedCategory(categoryId);
    setResolvedMerchant({ name: categoryId.replace("_", " "), category: categoryId, color: null });
  };

  const handleManualCategory = (categoryId) => {
    haptic.selection();
    setError("");
    setShowAllRunners(false);
    setResolvedCategory(categoryId);
    setResolvedMerchant({ name: query || categoryId.replace("_", " "), category: categoryId, color: null });
    if (query) addToHistory({ name: query, category: categoryId, color: null });
  };

  const handleToggleSubTarget = (e, cardId) => {
    e.stopPropagation();
    haptic.selection();
    if (subTargetId === cardId) {
      setSubTargetId(null);
      localStorage.removeItem("cw-sub-target");
    } else {
      setSubTargetId(cardId);
      localStorage.setItem("cw-sub-target", cardId);
    }
  };

  const updateCPP = (currency, valStr) => {
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

  const updateCPPToDefault = (currency) => {
    setFinancialConfig(prev => {
      const copy = { ...prev.customValuations };
      delete copy[currency];
      return { ...prev, customValuations: copy };
    });
  };

  const recommendations = useMemo(() => {
    if (!resolvedCategory || activeCreditCards.length === 0) return [];

    const scored = activeCreditCards.map(card => {
      const rewardInfo = getCardMultiplier(card.name, resolvedCategory, customValuations);
      const utilization = (card.balance && card.limit && card.limit > 0) ? (card.balance / card.limit) : 0;

      let finalYield = rewardInfo.effectiveYield;
      let blendedMsg = null;
      let isCappedOut = false;
      const spend = parseFloat(spendAmount) || 0;

      if (rewardInfo.cap) {
        const used = parseFloat(usedCaps[card.id]) || 0;
        const availableCap = Math.max(0, rewardInfo.cap - used);
        
        if (spend > 0 && spend > availableCap) {
          const spendAtHighRate = availableCap;
          const spendAtBaseRate = spend - availableCap;
          
          if (spendAtHighRate === 0) {
            isCappedOut = true;
            finalYield = parseFloat((rewardInfo.base * rewardInfo.cpp).toFixed(2));
            blendedMsg = `Cap exhausted. Now earning base ${rewardInfo.base}x.`;
          } else {
            const blendedReturn = (spendAtHighRate * rewardInfo.multiplier * rewardInfo.cpp / 100) + (spendAtBaseRate * rewardInfo.base * rewardInfo.cpp / 100);
            finalYield = parseFloat(((blendedReturn / spend) * 100).toFixed(2));
            blendedMsg = `Blended yield: $${spendAtHighRate} at ${rewardInfo.multiplier}x + $${spendAtBaseRate} at ${rewardInfo.base}x.`;
          }
        } else if (used >= rewardInfo.cap) {
          isCappedOut = true;
          finalYield = parseFloat((rewardInfo.base * rewardInfo.cpp).toFixed(2));
          blendedMsg = `Cap exhausted. Now earning base ${rewardInfo.base}x.`;
        }
      }

      return {
        ...card,
        currentMultiplier: isCappedOut ? rewardInfo.base : rewardInfo.multiplier,
        effectiveYield: finalYield,
        isFlexible: rewardInfo.isFlexible,
        potentialMax: rewardInfo.potentialMax,
        baseMultiplier: rewardInfo.base,
        currency: rewardInfo.currency,
        cap: rewardInfo.cap,
        usedCap: parseFloat(usedCaps[card.id]) || 0,
        blendedMsg,
        isCappedOut,
        cpp: rewardInfo.cpp,
        utilization,
        notes: rewardInfo.notes,
        rotating: rewardInfo.rotating,
        mobileWallet: rewardInfo.mobileWallet,
      };
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
  }, [resolvedCategory, activeCreditCards, customValuations, subTargetId]);

  const dollarReturn = (yield_) => {
    const amt = parseFloat(spendAmount);
    if (!amt || amt <= 0) return null;
    return ((amt * yield_) / 100).toFixed(2);
  };

  if (activeCreditCards.length === 0) {
    return (
      <div className="safe-scroll-body page-body" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <Card variant="elevated" animate delay={50} style={{ maxWidth: 400, textAlign: "center", padding: 32 }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: T.bg.surface, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <CreditCard size={32} color={T.text.muted} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: T.text.primary, marginBottom: 12 }}>Empty Wallet</h2>
          <p style={{ fontSize: 14, color: T.text.secondary, lineHeight: 1.5 }}>
            The Card Wizard needs to know what cards you have to mathematically deduce the best one. Add your credit cards in the Portfolio tab to unlock intelligent AI sorting.
          </p>
        </Card>
      </div>
    );
  }

  const getCardThemeColors = (cardName) => {
    const name = (cardName || "").toLowerCase();
    // Specific card tiers first to override generic bank matches
    if (name.includes("sapphire reserve")) return { gradient: "linear-gradient(135deg, #111827, #1e3a8a)", border: "#3b82f6", text: "#ffffff" };
    if (name.includes("sapphire")) return { gradient: "linear-gradient(135deg, #1e3a8a, #3b82f6)", border: "#93c5fd", text: "#ffffff" };
    if (name.includes("freedom")) return { gradient: "linear-gradient(135deg, #bed7ed, #7baee0)", border: "#ffffff", text: "#0f172a" };
    if (name.includes("gold")) return { gradient: "linear-gradient(135deg, #fbbf24, #d97706)", border: "#fef08a", text: "#78350f" };
    if (name.includes("platinum")) return { gradient: "linear-gradient(135deg, #cbd5e1, #94a3b8)", border: "#e2e8f0", text: "#0f172a" };
    if (name.includes("savor") || name.includes("venture")) return { gradient: "linear-gradient(135deg, #1e293b, #991b1b)", border: "#ef4444", text: "#ffffff" };
    if (name.includes("quicksilver")) return { gradient: "linear-gradient(135deg, #e2e8f0, #94a3b8)", border: "#ffffff", text: "#0f172a" };
    if (name.includes("custom cash")) return { gradient: "linear-gradient(135deg, #dbeafe, #60a5fa)", border: "#ffffff", text: "#1e3a8a" };
    if (name.includes("double cash")) return { gradient: "linear-gradient(135deg, #f8fafc, #cbd5e1)", border: "#ffffff", text: "#0f172a" };
    if (name.includes("apple")) return { gradient: "linear-gradient(135deg, #f4f4f5, #e4e4e7)", border: "#ffffff", text: "#18181b" };

    // Bank Defaults
    if (name.includes("chase")) return { gradient: "linear-gradient(135deg, #1d4ed8, #0ea5e9)", border: "#60a5fa", text: "#ffffff" };
    if (name.includes("amex") || name.includes("american express")) return { gradient: "linear-gradient(135deg, #38bdf8, #0284c7)", border: "#bae6fd", text: "#ffffff" };
    if (name.includes("citi")) return { gradient: "linear-gradient(135deg, #2563eb, #f87171)", border: "#bae6fd", text: "#ffffff" };
    if (name.includes("capital one")) return { gradient: "linear-gradient(135deg, #0f172a, #dc2626)", border: "#f87171", text: "#ffffff" };
    if (name.includes("discover")) return { gradient: "linear-gradient(135deg, #f97316, #f59e0b)", border: "#fdba74", text: "#ffffff" };
    if (name.includes("hyatt")) return { gradient: "linear-gradient(135deg, #0F2D52, #1a4070)", border: "#4a90d9", text: "#ffffff" };
    if (name.includes("hilton")) return { gradient: "linear-gradient(135deg, #003A70, #005fa3)", border: "#4a90d9", text: "#ffffff" };
    if (name.includes("marriott")) return { gradient: "linear-gradient(135deg, #111111, #B8143F)", border: "#e87090", text: "#ffffff" };
    if (name.includes("delta")) return { gradient: "linear-gradient(135deg, #003366, #E3132C)", border: "#6699cc", text: "#ffffff" };
    if (name.includes("united")) return { gradient: "linear-gradient(135deg, #005DAA, #1a7acc)", border: "#4da3e0", text: "#ffffff" };
    if (name.includes("southwest")) return { gradient: "linear-gradient(135deg, #111B54, #304878)", border: "#6080b0", text: "#ffffff" };
    if (name.includes("jetblue")) return { gradient: "linear-gradient(135deg, #003876, #0060c0)", border: "#4090e0", text: "#ffffff" };
    if (name.includes("alaska")) return { gradient: "linear-gradient(135deg, #01426A, #0070a0)", border: "#40a0d0", text: "#ffffff" };
    if (name.includes("bilt")) return { gradient: "linear-gradient(135deg, #1a1a2e, #4a4a6a)", border: "#8080a0", text: "#ffffff" };
    if (name.includes("wells fargo")) return { gradient: "linear-gradient(135deg, #D0121B, #e04040)", border: "#f08080", text: "#ffffff" };
    if (name.includes("robinhood")) return { gradient: "linear-gradient(135deg, #00C805, #00a004)", border: "#40e040", text: "#ffffff" };
    return { gradient: `linear-gradient(135deg, ${T.accent.primaryDim}, ${T.bg.surface})`, border: T.accent.primarySoft, text: "#ffffff" };
  };

  const runnersToShow = showAllRunners ? recommendations.slice(1) : recommendations.slice(1, 4);

  return (
    <div className="safe-scroll-body scroll-area" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="page-body" style={{ maxWidth: 768, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Header */}
        <div className="fade-in" style={{ textAlign: "center", marginTop: 8 }}>
          <div style={{ display: "inline-flex", padding: 12, borderRadius: 16, background: T.bg.elevated, border: `1px solid ${T.border.default}`, boxShadow: T.shadow.sm, marginBottom: 12 }}>
            <Sparkles color={T.accent.primary} size={28} />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: T.text.primary, marginBottom: 6 }}>Card Wizard</h1>
          <p style={{ fontSize: 14, color: T.text.secondary, maxWidth: 320, margin: "0 auto" }}>Where are you shopping? We'll calculate the highest mathematical yield instantaneously.</p>
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
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: m.color, marginRight: 12, flexShrink: 0 }} />
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

        {/* Global Point Valuation Settings Toggle */}
        {(!resolvedCategory || showValuations) && !categorizing && (
          <div className="fade-in">
            <button
              className="hover-btn"
              onClick={() => { haptic.selection(); setShowValuations(!showValuations); }}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 20, background: T.bg.surface, border: `1px solid ${T.border.subtle}`, margin: "0 auto", color: T.text.secondary, fontSize: 12, fontWeight: 700 }}
            >
              <Settings2 size={14} />
              {showValuations ? "Hide Point Valuations" : "Edit Point Valuations"}
              <ChevronDown size={14} style={{ transform: showValuations ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }} />
            </button>

            <div className="collapse-section" data-collapsed={!showValuations} style={{ marginTop: 16 }}>
              <FormGroup label="Cents Per Point (CPP) Overrides">
                {Object.entries(VALUATIONS).map(([currency, defaultVal], idx, arr) => {
                  const isCustom = customValuations[currency] !== undefined;
                  const currentVal = isCustom ? customValuations[currency] : defaultVal;
                  return (
                    <FormRow
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
                    </FormRow>
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
          <div className="stagger-container" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {QUICK_CATEGORIES.map((cat, idx) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  onClick={() => handleQuickSelect(cat.id)}
                  className="card-press"
                  style={{
                    aspectRatio: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    padding: 8, borderRadius: 16, background: T.bg.elevated, border: `1px solid ${T.border.default}`,
                    boxShadow: T.shadow.sm, animationDelay: `${idx * 0.05}s`
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
        {resolvedCategory && recommendations.length > 0 && !isTyping && !categorizing && (
          <div className="stagger-container" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px" }}>
               <Badge variant="purple">AI Matched</Badge>
               <h3 style={{ fontSize: 12, fontWeight: 800, color: T.text.primary, textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>
                 {resolvedCategory.replace(/_/g, " ")}
               </h3>
            </div>

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

            {/* Premium Holographic Winner Card */}
            <div style={{ position: "relative" }}>
              <div
                className="pulse-alert"
                style={{
                  position: "absolute", inset: -4,
                  background: getCardThemeColors(recommendations[0].name).gradient,
                  borderRadius: 24, opacity: 0.3, filter: "blur(16px)", pointerEvents: "none", zIndex: 0
                }}
              />

              <Card
                animate delay={50}
                style={{
                  position: "relative", zIndex: 1, padding: "24px 28px", borderRadius: 20, overflow: "hidden",
                  border: `1px solid ${getCardThemeColors(recommendations[0].name).border || 'rgba(255,255,255,0.2)'}`,
                  background: getCardThemeColors(recommendations[0].name).gradient,
                  boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
                  display: "flex", flexDirection: "column", minHeight: 240
                }}
              >
                <div className="shimmer-bg" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.1, pointerEvents: "none", background: "linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 50%, rgba(0,0,0,0.2) 100%)" }} />

                {/* Top Row: Institution + Chip */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "relative", zIndex: 10 }}>
                  <div>
                    <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: getCardThemeColors(recommendations[0].name).text, opacity: 0.9, letterSpacing: "0.02em", textShadow: "0 1px 2px rgba(0,0,0,0.1)" }}>
                      {recommendations[0].institution || "Credit Card"}
                    </h3>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, padding: "4px 10px", backdropFilter: "blur(8px)" }}>
                      <Check size={12} color="#fff" />
                      <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "#fff" }}>Optimal for {resolvedMerchant?.name ? resolvedMerchant.name : resolvedCategory.replace(/_/g, " ")}</span>
                    </div>
                  </div>
                </div>

                {/* Middle Row: Chip Logo */}
                <div style={{ marginTop: 24, marginBottom: "auto", position: "relative", zIndex: 10 }}>
                  <div style={{ width: 44, height: 32, borderRadius: 6, background: "linear-gradient(135deg, #eaddcf, #c2a382)", border: "1px solid rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "inset 0 1px 4px rgba(0,0,0,0.2)" }}>
                    <div style={{ width: 24, height: 18, border: "1px solid rgba(0,0,0,0.15)", borderRadius: 4, display: "flex", gap: 2, padding: 2 }}>
                       <div style={{ flex: 1, border: "1px solid rgba(0,0,0,0.1)", borderRadius: 2 }} />
                       <div style={{ flex: 1, border: "1px solid rgba(0,0,0,0.1)", borderRadius: 2 }} />
                    </div>
                  </div>
                </div>

                {/* Bottom Half: Card Name & Yields */}
                <div style={{ marginTop: 24, position: "relative", zIndex: 10, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.01em", margin: "0 0 6px 0", color: getCardThemeColors(recommendations[0].name).text, textShadow: "0 2px 8px rgba(0,0,0,0.15)", lineHeight: 1.1 }}>
                      {recommendations[0].name}
                    </h2>
                    <button
                      type="button"
                      className="hover-btn"
                      onClick={(e) => handleToggleSubTarget(e, recommendations[0].id)}
                      style={{
                        padding: "6px 12px", borderRadius: 8,
                        background: recommendations[0].id === subTargetId ? getCardThemeColors(recommendations[0].name).text : "rgba(0,0,0,0.15)",
                        color: recommendations[0].id === subTargetId ? getCardThemeColors(recommendations[0].name).gradient.split(", ")[1] : getCardThemeColors(recommendations[0].name).text,
                        border: recommendations[0].id === subTargetId ? "none" : `1px solid ${getCardThemeColors(recommendations[0].name).text}40`, 
                        fontSize: 11, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
                        boxShadow: recommendations[0].id === subTargetId ? T.shadow.sm : "none",
                        transition: "all 0.2s ease",
                        textShadow: "none"
                      }}
                    >
                       <Package size={12} fill={recommendations[0].id === subTargetId ? "currentColor" : "none"} />
                       {recommendations[0].id === subTargetId ? "Working on Sign-Up Bonus" : "Targeting Sign-Up Bonus?"}
                    </button>
                  </div>

                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 800, margin: "0 0 2px 0", opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.05em", color: getCardThemeColors(recommendations[0].name).text, textShadow: "0 1px 2px rgba(0,0,0,0.1)" }}>
                        {recommendations[0].id === subTargetId ? "Priority Override" : "Effective Yield"}
                      </p>
                      <div className="score-pop" style={{ fontSize: recommendations[0].id === subTargetId ? 32 : 44, fontWeight: 900, letterSpacing: "-0.04em", margin: 0, lineHeight: 1, filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.15))", color: getCardThemeColors(recommendations[0].name).text }}>
                        {recommendations[0].id === subTargetId ? "SUB TARGET" : `${recommendations[0].effectiveYield}%`}
                      </div>
                      <p style={{ fontSize: 13, fontWeight: 700, opacity: 0.9, marginTop: 6, color: getCardThemeColors(recommendations[0].name).text, textShadow: "0 1px 2px rgba(0,0,0,0.1)" }}>
                        {recommendations[0].currentMultiplier}x {resolvedCategory.replace(/_/g, " ")}{recommendations[0].cpp !== 1.0 ? ` × ${recommendations[0].cpp}cpp` : ""}
                      </p>
                      {dollarReturn(recommendations[0].effectiveYield) && recommendations[0].id !== subTargetId && (
                        <p style={{ fontSize: 15, fontWeight: 800, marginTop: 4, color: getCardThemeColors(recommendations[0].name).text, textShadow: "0 1px 2px rgba(0,0,0,0.1)" }}>
                          ${dollarReturn(recommendations[0].effectiveYield)} back
                        </p>
                      )}
                    </div>

                    {recommendations[0].utilization > 0 && recommendations.length > 1 && recommendations[0].effectiveYield === recommendations[1].effectiveYield && (
                      <div style={{ background: "rgba(0,0,0,0.2)", backdropFilter: "blur(8px)", padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", display: "flex", alignItems: "center", gap: 6, color: getCardThemeColors(recommendations[0].name).text }}>
                         <Info size={12} color={getCardThemeColors(recommendations[0].name).text} />
                         <span style={{ fontSize: 10, fontWeight: 700 }}>Low Util.</span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* Disclosures */}
              <div>
                {recommendations[0].cpp !== 1.0 && (
                  <p className="fade-in" style={{ fontSize: 12, fontWeight: 500, color: T.text.secondary, display: "flex", alignItems: "center", gap: 6, margin: "16px 0 12px 12px", animationDelay: "0.3s" }}>
                     <Info size={14} color={T.text.dim} />
                     Yield applies <span style={{ color: T.text.primary, fontWeight: 700 }}>{recommendations[0].cpp}¢</span> point valuation ({recommendations[0].currentMultiplier}x base).
                  </p>
                )}
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  {recommendations[0].blendedMsg && (
                    <div className="fade-in" style={{ padding: 12, borderRadius: 12, background: T.bg.surface, border: `1px solid ${T.status.amber}`, display: "flex", alignItems: "flex-start", gap: 10, animationDelay: "0.35s" }}>
                      <AlertCircle size={16} color={T.status.amber} style={{ marginTop: 2, flexShrink: 0 }} />
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: T.status.amber }}>{recommendations[0].blendedMsg}</p>
                    </div>
                  )}
                  {recommendations[0].cap && !recommendations[0].isCappedOut && (
                    <div className="fade-in" style={{ padding: 12, borderRadius: 12, background: T.status.blueDim, border: `1px solid rgba(107, 163, 232, 0.2)`, display: "flex", flexDirection: "column", gap: 6, animationDelay: "0.4s" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <Info size={16} color={T.status.blue} style={{ marginTop: 2, flexShrink: 0 }} />
                        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: T.status.blue }}>Spending Cap: High multiplier limited to <InlineTooltip term={"Spending Cap"}>${recommendations[0].cap.toLocaleString()}</InlineTooltip> per cycle.</p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 26 }}>
                        <span style={{ fontSize: 11, color: T.status.blue, fontWeight: 500 }}>Already spent: $</span>
                        <input
                          type="number"
                          placeholder="0"
                          value={usedCaps[recommendations[0].id] || ""}
                          onChange={(e) => handleUpdateUsedCap(recommendations[0].id, e)}
                          style={{
                            background: "rgba(255,255,255,0.5)", border: `1px solid rgba(107, 163, 232, 0.4)`,
                            borderRadius: 6, padding: "4px 8px", width: 80, fontSize: 12, color: T.text.primary, fontWeight: 600
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {recommendations[0].isFlexible && (
                    <div className="fade-in" style={{ padding: 12, borderRadius: 12, background: T.status.amberDim, border: `1px solid rgba(224, 168, 77, 0.2)`, display: "flex", alignItems: "flex-start", gap: 10, animationDelay: "0.5s" }}>
                      <AlertCircle size={16} color={T.status.amber} style={{ marginTop: 2, flexShrink: 0 }} />
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: T.status.amber }}>
                        Conditional Max: Could earn up to {recommendations[0].potentialMax || recommendations[0].currentMultiplier}x
                        ({parseFloat(((recommendations[0].potentialMax || recommendations[0].currentMultiplier) * recommendations[0].cpp).toFixed(2))}% yield)
                        if {resolvedCategory.replace(/_/g, " ")} is your top spend category.
                        Otherwise {parseFloat((recommendations[0].baseMultiplier * recommendations[0].cpp).toFixed(2))}%.
                      </p>
                    </div>
                  )}
                  {recommendations[0].rotating && (
                    <div className="fade-in" style={{ padding: 12, borderRadius: 12, background: T.status.purpleDim, border: `1px solid rgba(155, 111, 212, 0.2)`, display: "flex", alignItems: "flex-start", gap: 10, animationDelay: "0.5s" }}>
                      <RotateCw size={16} color={T.status.purple} style={{ marginTop: 2, flexShrink: 0 }} />
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: T.status.purple }}>
                        Rotating Category: This card offers {recommendations[0].rotating}% on quarterly rotating categories. Check if {resolvedCategory.replace(/_/g, " ")} qualifies this quarter.
                      </p>
                    </div>
                  )}
                  {recommendations[0].mobileWallet && (
                    <div className="fade-in" style={{ padding: 12, borderRadius: 12, background: T.status.blueDim, border: `1px solid rgba(107, 163, 232, 0.2)`, display: "flex", alignItems: "flex-start", gap: 10, animationDelay: "0.5s" }}>
                      <Smartphone size={16} color={T.status.blue} style={{ marginTop: 2, flexShrink: 0 }} />
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: T.status.blue }}>
                        Mobile Wallet Bonus: Earns {recommendations[0].mobileWallet}x on all purchases made via Apple Pay, Google Pay, or Samsung Pay.
                      </p>
                    </div>
                  )}
                  {recommendations[0].notes && (
                    <div className="fade-in" style={{ padding: 12, borderRadius: 12, background: T.bg.surface, border: `1px solid ${T.border.subtle}`, display: "flex", alignItems: "flex-start", gap: 10, animationDelay: "0.6s" }}>
                      <Info size={16} color={T.text.dim} style={{ marginTop: 2, flexShrink: 0 }} />
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: T.text.secondary }}>{recommendations[0].notes}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Runners Up */}
            {recommendations.length > 1 && (
              <div style={{ marginTop: 8 }}>
                <h3 style={{ fontSize: 12, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12, paddingLeft: 4 }}>Runner Up Options</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {runnersToShow.map((card, idx) => (
                    <Card key={card.id + idx} variant="elevated" animate delay={200 + (idx * 50)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                         {/* Rank Badge */}
                         <div style={{ width: 24, height: 24, borderRadius: 12, background: T.bg.surface, border: `1px solid ${T.border.default}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: T.text.secondary, flexShrink: 0 }}>
                           {idx + 2}
                         </div>
                         <div>
                           <p style={{ fontSize: 14, fontWeight: 700, color: T.text.primary, margin: "0 0 2px 0", lineHeight: 1 }}>{card.name}</p>
                           <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                             {card.id === subTargetId && <Badge variant="purple" style={{ fontSize: 9, padding: "2px 6px" }}>Sign-Up Bonus</Badge>}
                             <Badge variant="gray" style={{ fontSize: 9, padding: "2px 6px" }}>{card.cpp}¢ / pt</Badge>
                             <span style={{ fontSize: 11, fontWeight: 500, color: T.text.muted }}>{card.currentMultiplier}x Base</span>
                             {card.blendedMsg && <Badge variant="amber" style={{ fontSize: 9, padding: "2px 6px" }}>Blended Yield</Badge>}
                             {card.isFlexible && <Badge variant="amber" style={{ fontSize: 9, padding: "2px 6px" }}>Conditional</Badge>}
                             {card.rotating && <Badge variant="purple" style={{ fontSize: 9, padding: "2px 6px" }}>Rotating</Badge>}
                             {card.mobileWallet && <Badge variant="blue" style={{ fontSize: 9, padding: "2px 6px" }}>{card.mobileWallet}x Wallet</Badge>}
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
                    </Card>
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
                window.scrollTo({ top: 0, behavior: "smooth" });
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
