import React, { useState, useEffect, useContext } from "react";
import { Navigation, MapPin, RefreshCw, AlertCircle, Sparkles, CreditCard, ChevronRight } from "lucide-react";
import { Card, Badge, InlineTooltip } from "../ui.jsx";
import { T } from "../constants.js";
import { PortfolioContext } from "../contexts/PortfolioContext.jsx";
import { getCardMultiplier } from "../rewardsCatalog.js";
import { classifyMerchant } from "../api.js";
import { haptic } from "../haptics.js";
import { useSettings } from "../contexts/SettingsContext.jsx";

export default function GeoSuggestWidget() {
  const { cards } = useContext(PortfolioContext);
  const { financialConfig } = useSettings();
  const [status, setStatus] = useState("idle"); // idle, locating, fetching, categorizing, success, error
  const [errorMsg, setErrorMsg] = useState("");
  const [locationName, setLocationName] = useState("");
  const [category, setCategory] = useState("");
  const [bestCard, setBestCard] = useState(null);

  const activeCreditCards = cards.filter(c => c.type === "credit" || !c.type);
  const customValuations = financialConfig?.customValuations || {};

  const handleLocate = () => {
    if (activeCreditCards.length === 0) {
      setErrorMsg("Add credit cards to your Portfolio first.");
      setStatus("error");
      return;
    }

    if (!navigator.geolocation) {
      setErrorMsg("Geolocation is not supported by your browser.");
      setStatus("error");
      return;
    }

    haptic.selection();
    setStatus("locating");
    setErrorMsg("");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          setStatus("fetching");
          const { latitude, longitude } = position.coords;
          
          // Free reverse geocoding via OpenStreetMap Nominatim
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`);
          if (!res.ok) throw new Error("Failed to reverse geocode");
          
          const data = await res.json();
          const placeName = 
            data.address?.amenity || 
            data.address?.shop || 
            data.address?.leisure || 
            data.address?.tourism || 
            data.address?.building || 
            data.name;

          if (!placeName) throw new Error("Could not identify a specific merchant or place nearby.");

          setLocationName(placeName);
          setStatus("categorizing");

          // Use AI to categorize the location name into one of our 12 categories
          const resolvedCategory = await classifyMerchant(placeName);
          setCategory(resolvedCategory);

          // Find best card
          let best = null;
          let bestYield = -1;

          for (const card of activeCreditCards) {
             const rewardInfo = getCardMultiplier(card.name, resolvedCategory, customValuations);
             if (rewardInfo.effectiveYield > bestYield) {
                bestYield = rewardInfo.effectiveYield;
                best = { ...card, ...rewardInfo };
             }
          }

          setBestCard(best);
          setStatus("success");
          haptic.success();

        } catch (err) {
          setErrorMsg(err.message || "Failed to locate a nearby merchant.");
          setStatus("error");
        }
      },
      (geoError) => {
        let err = "Access denied or unavailable.";
        if (geoError.code === geoError.PERMISSION_DENIED) err = "Location access denied. Please allow in settings.";
        setErrorMsg(err);
        setStatus("error");
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const getCardThemeColors = (cardName) => {
    const name = (cardName || "").toLowerCase();
    if (name.includes("sapphire reserve")) return { gradient: "linear-gradient(135deg, #111827, #1e3a8a)", text: "#ffffff" };
    if (name.includes("sapphire")) return { gradient: "linear-gradient(135deg, #1e3a8a, #3b82f6)", text: "#ffffff" };
    if (name.includes("freedom")) return { gradient: "linear-gradient(135deg, #bed7ed, #7baee0)", text: "#0f172a" };
    if (name.includes("gold")) return { gradient: "linear-gradient(135deg, #fbbf24, #d97706)", text: "#78350f" };
    if (name.includes("platinum")) return { gradient: "linear-gradient(135deg, #cbd5e1, #94a3b8)", text: "#0f172a" };
    if (name.includes("savor") || name.includes("venture")) return { gradient: "linear-gradient(135deg, #1e293b, #991b1b)", text: "#ffffff" };
    if (name.includes("quicksilver")) return { gradient: "linear-gradient(135deg, #e2e8f0, #94a3b8)", text: "#0f172a" };
    if (name.includes("custom cash") || name.includes("double cash")) return { gradient: "linear-gradient(135deg, #dbeafe, #60a5fa)", text: "#1e3a8a" };
    if (name.includes("discover")) return { gradient: "linear-gradient(135deg, #f97316, #f59e0b)", text: "#ffffff" };
    if (name.includes("apple")) return { gradient: "linear-gradient(135deg, #f4f4f5, #e4e4e7)", text: "#18181b" };
    return { gradient: `linear-gradient(135deg, ${T.accent.primaryDim}, ${T.bg.surface})`, text: "#ffffff" };
  };

  if (activeCreditCards.length === 0 && status === "idle") {
    return null; // Don't show if they have no cards to suggest from
  }

  return (
    <Card variant="glass" style={{ padding: 20, marginBottom: 16, overflow: "hidden", position: "relative" }}>
      {/* Decorative pulse for geo widget */}
      <div 
        style={{ 
          position: "absolute", top: -20, right: -20, width: 100, height: 100, 
          background: `radial-gradient(circle, ${T.accent.emerald}20 0%, transparent 70%)`,
          borderRadius: "50%", pointerEvents: "none"
        }} 
      />
      
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
         <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ padding: 6, borderRadius: 10, background: `${T.accent.emerald}15` }}>
               <Navigation size={18} color={T.accent.emerald} />
            </div>
            <div>
               <h3 style={{ fontSize: 13, fontWeight: 800, color: T.text.primary, letterSpacing: "0.02em", margin: 0 }}>Geo-Card Smart Suggest</h3>
               <p style={{ fontSize: 11, color: T.text.dim, margin: 0 }}>MaxRewards-style On-Device Locator</p>
            </div>
         </div>
         {status === "success" && (
            <button className="hover-btn" onClick={handleLocate} style={{ background: "transparent", border: "none", color: T.text.secondary, padding: 4 }}>
               <RefreshCw size={14} />
            </button>
         )}
      </div>

      {status === "idle" && (
        <div style={{ background: T.bg.elevated, borderRadius: 12, padding: 16, border: `1px solid ${T.border.subtle}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
           <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <MapPin size={24} color={T.text.muted} />
              <div>
                 <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary }}>Tap to Scan Nearby</div>
                 <div style={{ fontSize: 11, color: T.text.secondary }}>Uses on-device geolocation.</div>
              </div>
           </div>
           <button 
             onClick={handleLocate}
             className="hover-btn"
             style={{ 
               background: T.accent.primary, color: "#fff", border: "none", 
               padding: "6px 14px", borderRadius: 12, fontSize: 12, fontWeight: 700 
             }}
           >
             Locate
           </button>
        </div>
      )}

      {(status === "locating" || status === "fetching" || status === "categorizing") && (
        <div style={{ background: T.bg.elevated, borderRadius: 12, padding: 16, border: `1px solid ${T.border.subtle}`, display: "flex", alignItems: "center", gap: 12 }}>
           <div className="spin" style={{ display: "flex" }}>
              <Navigation size={20} color={T.accent.primary} />
           </div>
           <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary }}>
                 {status === "locating" && "Acquiring GPS Signal..."}
                 {status === "fetching" && "Querying OpenStreetMap..."}
                 {status === "categorizing" && "AI Categorizing Merchant..."}
              </div>
              <div style={{ fontSize: 11, color: T.text.dim }}>This runs entirely on your device and browser.</div>
           </div>
        </div>
      )}

      {status === "error" && (
        <div style={{ background: `${T.status.red}10`, borderRadius: 12, padding: 16, border: `1px solid ${T.status.red}30`, display: "flex", alignItems: "flex-start", gap: 10 }}>
           <AlertCircle size={16} color={T.status.red} style={{ marginTop: 2 }} />
           <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.status.red }}>Location Failed</div>
              <div style={{ fontSize: 12, color: T.text.secondary, marginTop: 2, marginBottom: 8 }}>{errorMsg}</div>
              <button 
                onClick={handleLocate}
                className="hover-btn"
                style={{ 
                  background: T.bg.surface, color: T.text.primary, border: `1px solid ${T.border.default}`, 
                  padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600
                }}
              >
                Try Again
              </button>
           </div>
        </div>
      )}

      {status === "success" && bestCard && (
        <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
           <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <MapPin size={14} color={T.accent.emerald} />
              <span style={{ fontSize: 13, fontWeight: 600, color: T.text.primary }}>Nearby: {locationName}</span>
              <Badge variant="green" style={{ marginLeft: "auto", fontSize: 9 }}>{category.replace(/_/g, " ")}</Badge>
           </div>

           <div 
             style={{ 
               padding: 16, 
               borderRadius: 12, 
               background: getCardThemeColors(bestCard.name).gradient, 
               color: getCardThemeColors(bestCard.name).text,
               display: "flex",
               alignItems: "center",
               justifyContent: "space-between",
               boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
               border: "1px solid rgba(255,255,255,0.1)"
             }}
           >
              <div>
                 <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
                    Best Card to Use
                 </div>
                 <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em" }}>
                    {bestCard.name}
                 </div>
                 <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                    <Sparkles size={12} />
                    Earls {bestCard.multiplier}x {bestCard.currency === "CASH" ? "Cash Back" : "Points"}
                 </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                 <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1 }}>{bestCard.effectiveYield}%</div>
                 <div style={{ fontSize: 10, opacity: 0.8, fontWeight: 700 }}>YIELD</div>
              </div>
           </div>
        </div>
      )}

    </Card>
  );
}
