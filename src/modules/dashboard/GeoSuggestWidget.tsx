import React, { useState } from "react";
import { Navigation, MapPin, RefreshCw, AlertCircle, Sparkles, X } from "lucide-react";
import { Badge } from "../ui.js";
import { T } from "../constants.js";
import { usePortfolio } from "../contexts/PortfolioContext.js";
import { getCardMultiplier } from "../rewardsCatalog.js";
import { classifyMerchant } from "../api.js";
import { haptic } from "../haptics.js";
import { useSettings } from "../contexts/SettingsContext.js";
import type { Card } from "../../types/index.js";

type GeoSuggestStatus = "idle" | "locating" | "fetching" | "categorizing" | "success" | "error";

interface RewardSuggestion {
  multiplier: number;
  currency: string;
  effectiveYield: number;
}

type SuggestedCard = Card & RewardSuggestion;

export default function GeoSuggestWidget() {
  const { cards } = usePortfolio();
  const { financialConfig } = useSettings();
  const [status, setStatus] = useState<GeoSuggestStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [locationName, setLocationName] = useState("");
  const [category, setCategory] = useState("");
  const [bestCard, setBestCard] = useState<SuggestedCard | null>(null);

  const activeCreditCards = cards.filter(c => c.type === "credit" || !c.type);
  const customValuations = financialConfig?.customValuations || {};

  const handleLocate = () => {
    if (activeCreditCards.length === 0) {
      setErrorMsg("Add cards to Portfolio first.");
      setStatus("error");
      return;
    }
    if (!navigator.geolocation) {
      setErrorMsg("Geolocation not supported.");
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
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`);
          if (!res.ok) throw new Error("Geocode failed");
          const data = await res.json();
          const placeName = data.address?.amenity || data.address?.shop || data.address?.leisure || data.address?.tourism || data.address?.building || data.name;
          if (!placeName) throw new Error("No merchant found nearby.");

          setLocationName(placeName);
          setStatus("categorizing");

          const resolvedCategory = await classifyMerchant(placeName);
          setCategory(resolvedCategory);

          let best: SuggestedCard | null = null;
          let bestYield = -1;
          for (const card of activeCreditCards) {
            const rewardInfo = getCardMultiplier(card.name, resolvedCategory, customValuations);
            if (rewardInfo.effectiveYield > bestYield) {
              bestYield = rewardInfo.effectiveYield;
              best = { ...card, ...rewardInfo } as SuggestedCard;
            }
          }

          setBestCard(best);
          setStatus("success");
          haptic.success();
        } catch (err: unknown) {
          setErrorMsg(err instanceof Error ? err.message : "Location failed.");
          setStatus("error");
        }
      },
      (geoError) => {
        setErrorMsg(geoError.code === geoError.PERMISSION_DENIED ? "Location access denied." : "Location unavailable.");
        setStatus("error");
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  if (activeCreditCards.length === 0 && status === "idle") return null;

  // Compact idle state — just a pill button
  if (status === "idle") {
    return (
      <button
        onClick={handleLocate}
        className="hover-btn"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px",
          borderRadius: 20,
          background: `${T.accent.emerald}10`,
          border: `1px solid ${T.accent.emerald}25`,
          color: T.accent.emerald,
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          transition: "all .2s",
        }}
      >
        <MapPin size={13} />
        Nearby Suggest
      </button>
    );
  }

  // Loading states — compact inline
  if (status === "locating" || status === "fetching" || status === "categorizing") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px",
          borderRadius: 20,
          background: `${T.accent.emerald}10`,
          border: `1px solid ${T.accent.emerald}25`,
          color: T.accent.emerald,
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <div className="spin" style={{ display: "flex" }}>
          <Navigation size={12} />
        </div>
        {status === "locating" ? "Locating…" : status === "fetching" ? "Finding…" : "Categorizing…"}
      </div>
    );
  }

  // Error — compact with retry
  if (status === "error") {
    return (
      <button
        onClick={handleLocate}
        className="hover-btn"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px",
          borderRadius: 20,
          background: `${T.status.red}10`,
          border: `1px solid ${T.status.red}25`,
          color: T.status.red,
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        <AlertCircle size={12} />
        Retry Scan
      </button>
    );
  }

  // Success — beautiful expandable result card
  if (status === "success" && bestCard) {
    return (
      <div style={{ width: "100%", marginTop: 8 }}>
        <div
          style={{
            borderRadius: 16,
            background: T.bg.glass,
            border: `1px solid ${T.accent.emerald}20`,
            boxShadow: `0 4px 20px ${T.accent.emerald}08, 0 1px 4px rgba(0,0,0,0.12)`,
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* Subtle gradient accent line */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 2,
            background: `linear-gradient(90deg, ${T.accent.emerald}60, ${T.accent.primary}60, transparent)`,
          }} />

          <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <MapPin size={11} color={T.accent.emerald} />
                <span style={{ fontSize: 11, fontWeight: 600, color: T.text.secondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{locationName}</span>
                <Badge variant="green" style={{ fontSize: 8, flexShrink: 0 }}>{category.replace(/_/g, " ")}</Badge>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.text.primary, marginBottom: 2 }}>
                {bestCard.name}
              </div>
              <div style={{ fontSize: 11, color: T.text.secondary, display: "flex", alignItems: "center", gap: 4 }}>
                <Sparkles size={10} color={T.accent.emerald} />
                {bestCard.multiplier}x {bestCard.currency === "CASH" ? "Cash Back" : "Points"} · <span style={{ fontWeight: 800, color: T.accent.emerald }}>{bestCard.effectiveYield}%</span> yield
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button onClick={handleLocate} className="hover-btn" style={{ background: "transparent", border: "none", color: T.text.dim, padding: 4, cursor: "pointer" }}><RefreshCw size={13} /></button>
              <button onClick={() => { setStatus("idle"); setBestCard(null); }} className="hover-btn" style={{ background: "transparent", border: "none", color: T.text.dim, padding: 4, cursor: "pointer" }}><X size={13} /></button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
