import { useState } from "react";
import type { Card } from "../../types/index.js";
import { T } from "../constants.js";
import { usePortfolio } from "../contexts/PortfolioContext.js";
import { useSettings } from "../contexts/SettingsContext.js";
import { haptic } from "../haptics.js";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  MapPin,
  Navigation,
  RefreshCw,
  Sparkles,
  Store,
  X,
} from "../icons";
import { inferMerchantIdentity } from "../merchantIdentity.js";
import {
  fetchNearbyMerchantCandidates,
  formatNearbyDistance,
  type NearbyMerchantCandidate,
} from "../nearbyMerchants.js";
import RewardCardVisual from "../RewardCardVisual.js";
import { getOptimalCard } from "../rewardsCatalog.js";
import { Badge, Card as SurfaceCard } from "../ui.js";

type GeoSuggestStatus = "idle" | "locating" | "fetching" | "choosing" | "success" | "error";

interface RewardSuggestion {
  multiplier: number;
  currency: string;
  effectiveYield: number;
  rewardNotes?: string | null;
}

type SuggestedCard = Card & RewardSuggestion;
type NearbyChoice = NearbyMerchantCandidate & { bestCard: SuggestedCard | null };

interface GeoSuggestWidgetProps {
  onMerchantSelect?: (merchant: { name: string; category: string; color?: string | null }) => void;
}

function formatRewardLabel(card: SuggestedCard | null) {
  if (!card) return "See best card";
  const multiplier = Number(card.multiplier || 0);
  if (card.currency === "CASH") return `${multiplier}% cash back`;
  return `${multiplier}x points`;
}

function formatRewardChipLabel(card: SuggestedCard | null) {
  if (!card) return "Compare";
  const multiplier = Number(card.multiplier || 0);
  if (card.currency === "CASH") return `${multiplier}%`;
  return `${multiplier}x`;
}

function formatCategoryLabel(category: string) {
  return String(category || "catch-all")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function GeoSuggestWidget({ onMerchantSelect }: GeoSuggestWidgetProps) {
  const { cards } = usePortfolio();
  const { financialConfig } = useSettings();
  const [status, setStatus] = useState<GeoSuggestStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [locationName, setLocationName] = useState("");
  const [category, setCategory] = useState("");
  const [bestCard, setBestCard] = useState<SuggestedCard | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<NearbyChoice | null>(null);
  const [choices, setChoices] = useState<NearbyChoice[]>([]);

  const activeCreditCards = cards.filter((card) => card.type === "credit" || !card.type);
  const customValuations = financialConfig?.customValuations || {};

  const getBestCardForCandidate = (candidate: NearbyMerchantCandidate) => {
    const merchantIdentity = inferMerchantIdentity({
      merchantName: candidate.name,
      category: candidate.category,
    });
    return getOptimalCard(activeCreditCards, merchantIdentity.rewardCategory || candidate.category, customValuations, {
      merchantIdentity,
      capMode: "conservative",
    }) as SuggestedCard | null;
  };

  const resetState = () => {
    setStatus("idle");
    setErrorMsg("");
    setLocationName("");
    setCategory("");
    setBestCard(null);
    setSelectedChoice(null);
    setChoices([]);
  };

  const commitSelection = (choice: NearbyChoice) => {
    setSelectedChoice(choice);
    setLocationName(choice.areaLabel || choice.name);
    setCategory(choice.category);
    setBestCard(choice.bestCard);
    setStatus("success");
    haptic.success();
    onMerchantSelect?.({
      name: choice.name,
      category: choice.category,
      color: choice.color || null,
    });
  };

  const handleLocate = () => {
    if (activeCreditCards.length === 0) {
      setErrorMsg("Add cards in Portfolio first.");
      setStatus("error");
      return;
    }
    if (!navigator.geolocation) {
      setErrorMsg("Location services are unavailable on this device.");
      setStatus("error");
      return;
    }

    haptic.selection();
    setStatus("locating");
    setErrorMsg("");
    setChoices([]);
    setSelectedChoice(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          setStatus("fetching");
          const { latitude, longitude } = position.coords;
          const lookup = await fetchNearbyMerchantCandidates({
            latitude,
            longitude,
            accuracyMeters: position.coords.accuracy ?? null,
            limit: 5,
          });
          const resolvedChoices = lookup.candidates.map((candidate) => ({
            ...candidate,
            bestCard: getBestCardForCandidate(candidate),
          }));

          if (resolvedChoices.length === 0) {
            throw new Error("No nearby merchants were recognized.");
          }

          setLocationName(lookup.areaLabel || "Nearby");
          setChoices(resolvedChoices);

          const firstChoice = resolvedChoices[0];
          if (resolvedChoices.length === 1 && firstChoice) {
            commitSelection(firstChoice);
            return;
          }

          setStatus("choosing");
          haptic.success();
        } catch (error: unknown) {
          setErrorMsg(error instanceof Error ? error.message : "Nearby suggestions are unavailable.");
          setStatus("error");
        }
      },
      (geoError) => {
        setErrorMsg(
          geoError.code === geoError.PERMISSION_DENIED
            ? "Location access was denied."
            : "We could not determine your location."
        );
        setStatus("error");
      },
      { timeout: 12000, enableHighAccuracy: true, maximumAge: 60000 }
    );
  };

  if (activeCreditCards.length === 0 && status === "idle") return null;

  if (status === "idle") {
    return (
      <button
        type="button"
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
          transition: "transform .2s, opacity .2s, background-color .2s, border-color .2s, color .2s, box-shadow .2s",
        }}
      >
        <MapPin size={13} />
        Nearby
      </button>
    );
  }

  if (status === "locating" || status === "fetching") {
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
        {status === "locating" ? "Locating…" : "Finding nearby…"}
      </div>
    );
  }

  if (status === "error") {
    return (
      <button
        type="button"
        onClick={handleLocate}
        title={errorMsg || "Retry nearby suggestions"}
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
        Retry nearby
      </button>
    );
  }

  if (status === "choosing") {
    return (
      <SurfaceCard
        variant="glass"
        style={{
          width: "100%",
          padding: "14px 14px 12px",
          borderRadius: 22,
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
              Nearby places
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.02em" }}>
              Choose the place you are at
            </div>
            <div style={{ fontSize: 11.5, color: T.text.secondary, lineHeight: 1.45, marginTop: 6 }}>
              {locationName ? `We found multiple merchants near ${locationName}.` : "We found multiple nearby merchants."} This is especially useful in malls, plazas, and food halls.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              aria-label="Refresh nearby places"
              title="Refresh nearby places"
              onClick={handleLocate}
              className="hover-btn"
              style={{ background: "transparent", border: "none", color: T.text.dim, padding: 4, cursor: "pointer" }}
            >
              <RefreshCw size={13} />
            </button>
            <button
              type="button"
              aria-label="Dismiss nearby places"
              title="Dismiss nearby places"
              onClick={resetState}
              className="hover-btn"
              style={{ background: "transparent", border: "none", color: T.text.dim, padding: 4, cursor: "pointer" }}
            >
              <X size={13} />
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {choices.map((choice, index) => (
            <button
              key={choice.id}
              type="button"
              onClick={() => commitSelection(choice)}
              className="hover-btn"
              style={{
                width: "100%",
                padding: "12px 12px",
                borderRadius: 18,
                border: `1px solid ${choice.color ? `${choice.color}28` : T.border.subtle}`,
                background: T.bg.surface,
                textAlign: "left",
                display: "grid",
                gap: 8,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 12,
                      background: choice.color ? `${choice.color}18` : T.accent.primaryDim,
                      color: choice.color || T.accent.primary,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Store size={16} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: T.text.primary, lineHeight: 1.2 }}>
                      {choice.name}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                      <Badge
                        variant="outline"
                        style={{
                          color: choice.color || T.accent.primary,
                          borderColor: choice.color ? `${choice.color}40` : `${T.accent.primary}35`,
                          background: choice.color ? `${choice.color}12` : `${T.accent.primary}10`,
                        }}
                      >
                        {formatCategoryLabel(choice.category)}
                      </Badge>
                      {index === 0 ? <Badge variant="green">Top match</Badge> : null}
                      <span style={{ fontSize: 10.5, color: T.text.dim }}>
                        {formatNearbyDistance(choice.distanceMeters)}
                        {choice.descriptor ? ` · ${choice.descriptor}` : ""}
                      </span>
                    </div>
                  </div>
                </div>
                <ChevronRight size={16} color={T.text.dim} style={{ flexShrink: 0 }} />
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <Sparkles size={12} color={T.accent.emerald} />
                  <span style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.45 }}>
                    {choice.bestCard ? `Use ${choice.bestCard.name}` : "Open rewards ranking"}
                  </span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 800, color: T.accent.emerald, whiteSpace: "nowrap" }}>
                  {formatRewardChipLabel(choice.bestCard)}
                </span>
              </div>
            </button>
          ))}
        </div>
      </SurfaceCard>
    );
  }

  if (status === "success" && selectedChoice && onMerchantSelect) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 12px",
            borderRadius: 999,
            background: `${T.accent.emerald}10`,
            border: `1px solid ${T.accent.emerald}25`,
            color: T.accent.emerald,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          <CheckCircle2 size={12} />
          Nearby: {selectedChoice.name}
        </div>
        <button
          type="button"
          onClick={() => setStatus("choosing")}
          className="hover-btn"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 12px",
            borderRadius: 999,
            background: T.bg.surface,
            border: `1px solid ${T.border.subtle}`,
            color: T.text.secondary,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Change
        </button>
      </div>
    );
  }

  if (status === "success" && bestCard && selectedChoice) {
    return (
      <SurfaceCard
        variant="glass"
        style={{
          width: "100%",
          padding: "14px",
          borderRadius: 22,
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <MapPin size={11} color={T.accent.emerald} />
              <span style={{ fontSize: 11, fontWeight: 700, color: T.text.secondary }}>
                {selectedChoice.name}
              </span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.02em" }}>
              Use {bestCard.name}
            </div>
            <div style={{ fontSize: 11.5, color: T.text.secondary, lineHeight: 1.45, marginTop: 6 }}>
              Best return nearby for {formatCategoryLabel(category)} at {formatRewardLabel(bestCard)}.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              aria-label="Refresh nearby result"
              title="Refresh nearby result"
              onClick={handleLocate}
              className="hover-btn"
              style={{ background: "transparent", border: "none", color: T.text.dim, padding: 4, cursor: "pointer" }}
            >
              <RefreshCw size={13} />
            </button>
            <button
              type="button"
              aria-label="Dismiss nearby result"
              title="Dismiss nearby result"
              onClick={resetState}
              className="hover-btn"
              style={{ background: "transparent", border: "none", color: T.text.dim, padding: 4, cursor: "pointer" }}
            >
              <X size={13} />
            </button>
          </div>
        </div>

        <div style={{ width: 220, maxWidth: "100%" }}>
          <RewardCardVisual
            card={bestCard}
            size="compact"
            subtitle={formatCategoryLabel(category)}
            highlight={formatRewardLabel(bestCard)}
          />
        </div>
      </SurfaceCard>
    );
  }

  return null;
}
