import React from "react";
import type { Card } from "../types/index.js";
import { ISSUER_COLORS, T } from "./constants.js";
import { CreditCard } from "./icons";

type RewardCardVisualSize = "mini" | "compact" | "hero";

interface RewardCardVisualProps {
  card: Pick<Card, "institution" | "name" | "last4" | "mask">;
  size?: RewardCardVisualSize;
  subtitle?: string | null;
  highlight?: string | null;
  style?: React.CSSProperties;
}

interface CardTheme {
  gradient: string;
  border: string;
  text: string;
  secondaryText: string;
  badgeBg: string;
  badgeText: string;
  accent: string;
  shadow: string;
}

function hexToRgba(hex: string, alpha: number) {
  const raw = String(hex || "").trim();
  if (!raw) return `rgba(109, 142, 217, ${alpha})`;
  if (raw.startsWith("rgba(")) {
    return raw.replace(/rgba\(([^)]+),[^)]+\)/, (_match, rgb) => `rgba(${rgb}, ${alpha})`);
  }
  if (raw.startsWith("rgb(")) {
    return raw.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
  }
  const normalized = raw.replace("#", "");
  if (normalized.length !== 6) return `rgba(109, 142, 217, ${alpha})`;
  const value = Number.parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function resolveIssuerPalette(institution: string) {
  const raw = String(institution || "").trim();
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  const exactKey = Object.keys(ISSUER_COLORS).find((key) => key.toLowerCase() === normalized);
  if (exactKey) return ISSUER_COLORS[exactKey as keyof typeof ISSUER_COLORS];
  if (normalized === "amex" || normalized.includes("american express")) {
    return ISSUER_COLORS["American Express"];
  }
  if (normalized.includes("capital one")) return ISSUER_COLORS["Capital One"];
  if (normalized.includes("wells")) return ISSUER_COLORS["Wells Fargo"];
  if (normalized.includes("us bank")) return ISSUER_COLORS["US Bank"];
  if (normalized.includes("td")) return ISSUER_COLORS["TD Bank"];
  return null;
}

function getIssuerLabel(institution: string) {
  const normalized = String(institution || "").trim().toLowerCase();
  if (!normalized) return "Catalyst";
  if (normalized === "american express" || normalized === "amex") return "Amex";
  if (normalized === "capital one") return "Capital One";
  if (normalized === "bank of america") return "BofA";
  if (normalized === "wells fargo") return "Wells";
  if (normalized === "us bank") return "US Bank";
  return institution;
}

function getSurfaceTheme(card: Pick<Card, "institution" | "name">): CardTheme {
  const label = `${card.institution || ""} ${card.name || ""}`.toLowerCase();

  if (label.includes("apple")) {
    return {
      gradient: "linear-gradient(135deg, #F7FAFD 0%, #DCE5EE 52%, #B5C1CD 100%)",
      border: "rgba(255,255,255,0.72)",
      text: "#162130",
      secondaryText: "rgba(22, 33, 48, 0.72)",
      badgeBg: "rgba(255,255,255,0.52)",
      badgeText: "#2A3647",
      accent: "#2F435C",
      shadow: "0 18px 38px rgba(7,11,18,0.18)",
    };
  }

  if (/\bgold\b/.test(label)) {
    return {
      gradient: "linear-gradient(135deg, #5B3C10 0%, #B17A22 46%, #F2D071 100%)",
      border: "rgba(255, 223, 143, 0.5)",
      text: "#FFF7DE",
      secondaryText: "rgba(255, 247, 222, 0.76)",
      badgeBg: "rgba(255,255,255,0.14)",
      badgeText: "#FFF1C4",
      accent: "#F2D071",
      shadow: "0 18px 38px rgba(145, 103, 24, 0.28)",
    };
  }

  if (/\bplatinum\b/.test(label)) {
    return {
      gradient: "linear-gradient(135deg, #50606D 0%, #8B9BAA 54%, #D8E3EC 100%)",
      border: "rgba(224, 233, 241, 0.48)",
      text: "#F6FBFF",
      secondaryText: "rgba(246, 251, 255, 0.76)",
      badgeBg: "rgba(255,255,255,0.14)",
      badgeText: "#F4FAFF",
      accent: "#D8E3EC",
      shadow: "0 18px 38px rgba(93, 112, 129, 0.28)",
    };
  }

  if (label.includes("reserve") || label.includes("sapphire")) {
    return {
      gradient: "linear-gradient(135deg, #111827 0%, #1E3A6A 50%, #6D8ED9 100%)",
      border: "rgba(132, 164, 236, 0.4)",
      text: "#F5F8FF",
      secondaryText: "rgba(230, 238, 255, 0.74)",
      badgeBg: "rgba(255,255,255,0.12)",
      badgeText: "#DDE7FF",
      accent: "#8CB0FF",
      shadow: "0 18px 38px rgba(38, 66, 122, 0.32)",
    };
  }

  if (label.includes("venture") || label.includes("savor") || label.includes("quicksilver")) {
    return {
      gradient: "linear-gradient(135deg, #111827 0%, #23344C 52%, #8C2334 100%)",
      border: "rgba(232, 114, 132, 0.3)",
      text: "#F7F9FD",
      secondaryText: "rgba(227, 234, 244, 0.72)",
      badgeBg: "rgba(255,255,255,0.11)",
      badgeText: "#E7EDF7",
      accent: "#E87284",
      shadow: "0 18px 38px rgba(86, 26, 39, 0.28)",
    };
  }

  if (label.includes("discover")) {
    return {
      gradient: "linear-gradient(135deg, #65290B 0%, #E56A17 48%, #F8B44A 100%)",
      border: "rgba(255, 182, 97, 0.38)",
      text: "#FFF7EF",
      secondaryText: "rgba(255, 247, 239, 0.76)",
      badgeBg: "rgba(255,255,255,0.11)",
      badgeText: "#FFF0E0",
      accent: "#FFC47A",
      shadow: "0 18px 38px rgba(140, 66, 18, 0.28)",
    };
  }

  const issuerPalette = resolveIssuerPalette(card.institution || "");
  const accent = issuerPalette?.accent || T.accent.primary;

  return {
    gradient: `radial-gradient(circle at top right, ${hexToRgba(accent, 0.4)} 0%, transparent 34%), linear-gradient(135deg, ${T.bg.surface} 0%, ${T.bg.card} 56%, ${hexToRgba(accent, 0.62)} 120%)`,
    border: hexToRgba(accent, 0.38),
    text: T.text.primary,
    secondaryText: T.text.secondary,
    badgeBg: hexToRgba(accent, 0.16),
    badgeText: issuerPalette?.text || T.text.primary,
    accent,
    shadow: `0 18px 38px ${hexToRgba(accent, 0.2)}`,
  };
}

function getFooterLabel(card: Pick<Card, "last4" | "mask">, highlight?: string | null) {
  if (highlight) return highlight;
  const digits = String(card.last4 || card.mask || "").replace(/\D/g, "").slice(-4);
  return digits ? `•••• ${digits}` : "Catalyst";
}

export default function RewardCardVisual({
  card,
  size = "compact",
  subtitle,
  highlight,
  style,
}: RewardCardVisualProps) {
  const theme = getSurfaceTheme(card);

  const sizeConfig = {
    mini: {
      height: 64,
      padding: 10,
      titleSize: 11,
      subtitleSize: 9,
      badgeSize: 8,
      footerSize: 8.5,
      radius: 16,
    },
    compact: {
      height: 90,
      padding: 12,
      titleSize: 13.5,
      subtitleSize: 10,
      badgeSize: 8.5,
      footerSize: 9.5,
      radius: 18,
    },
    hero: {
      height: 122,
      padding: 16,
      titleSize: 18,
      subtitleSize: 11,
      badgeSize: 9,
      footerSize: 10.5,
      radius: 20,
    },
  }[size];

  return (
    <div
      style={{
        position: "relative",
        height: sizeConfig.height,
        width: "100%",
        minWidth: 0,
        padding: sizeConfig.padding,
        borderRadius: sizeConfig.radius,
        border: `1px solid ${theme.border}`,
        background: theme.gradient,
        boxShadow: theme.shadow,
        overflow: "hidden",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(125deg, rgba(255,255,255,0.16), transparent 30%, transparent 64%, rgba(255,255,255,0.08))",
          opacity: 0.75,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: size === "hero" ? 112 : 76,
          height: size === "hero" ? 112 : 76,
          right: size === "hero" ? -18 : -10,
          bottom: size === "hero" ? -28 : -18,
          borderRadius: "50%",
          background: hexToRgba(theme.accent, 0.22),
          filter: "blur(4px)",
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative", zIndex: 1, display: "grid", height: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 20,
              padding: "0 8px",
              borderRadius: 999,
              background: theme.badgeBg,
              color: theme.badgeText,
              fontSize: sizeConfig.badgeSize,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontFamily: T.font.mono,
              whiteSpace: "nowrap",
            }}
          >
            {getIssuerLabel(card.institution || "")}
          </span>
          <div
            style={{
              width: size === "mini" ? 22 : 26,
              height: size === "mini" ? 22 : 26,
              borderRadius: size === "mini" ? 8 : 10,
              background: "rgba(255,255,255,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: theme.text,
              flexShrink: 0,
            }}
          >
            <CreditCard size={size === "mini" ? 12 : 14} />
          </div>
        </div>

        <div
          style={{
            alignSelf: "center",
            fontSize: sizeConfig.titleSize,
            fontWeight: 900,
            color: theme.text,
            letterSpacing: "-0.03em",
            lineHeight: 1.08,
            textWrap: "balance",
            maxWidth: size === "hero" ? "74%" : "78%",
          }}
        >
          {card.name}
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
          <div
            style={{
              fontSize: sizeConfig.subtitleSize,
              color: theme.secondaryText,
              fontWeight: 700,
              letterSpacing: "0.02em",
              minWidth: 0,
            }}
          >
            {subtitle || "Recommended now"}
          </div>
          <div
            style={{
              fontSize: sizeConfig.footerSize,
              color: theme.text,
              fontWeight: 800,
              letterSpacing: "0.08em",
              fontFamily: T.font.mono,
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            {getFooterLabel(card, highlight)}
          </div>
        </div>
      </div>
    </div>
  );
}
