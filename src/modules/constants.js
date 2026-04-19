// ═══════════════════════════════════════════════════════════════
// APP VERSION — single source of truth
// ═══════════════════════════════════════════════════════════════
export const APP_VERSION = "2.0.0";

// ═══════════════════════════════════════════════════════════════
// DESIGN TOKENS — Catalyst Cash Brand Palette
// Icon: deep violet (#3D1B6B) → emerald green (#1A6B40)
// ═══════════════════════════════════════════════════════════════

export const DARK_TOKENS = {
  bg: {
    base: "#070B12",
    card: "#0F1621",
    elevated: "#141D2A",
    surface: "#192434",
    hover: "rgba(120, 138, 170, 0.08)",
    glass: "rgba(10, 15, 24, 0.88)",
    navGlass: "rgba(8, 13, 21, 0.94)",
  },
  border: {
    subtle: "rgba(148, 163, 184, 0.10)",
    default: "rgba(148, 163, 184, 0.16)",
    focus: "rgba(109, 142, 217, 0.34)",
    glow: "rgba(109, 142, 217, 0.10)",
  },
  text: {
    primary: "#EDF2F8",
    secondary: "#A8B3C7",
    dim: "#7E8BA3",
    muted: "#5B667D",
    prominent: "#D9E2F1",
  },
  accent: {
    primary: "#6D8ED9",
    primaryDim: "rgba(109, 142, 217, 0.14)",
    primaryGlow: "rgba(109, 142, 217, 0.14)",
    primarySoft: "rgba(109, 142, 217, 0.22)",
    emerald: "#4FBC8C",
    emeraldDim: "rgba(79, 188, 140, 0.12)",
    emeraldSoft: "rgba(79, 188, 140, 0.18)",
    copper: "#D4A15F",
    copperDim: "rgba(212, 161, 95, 0.12)",
    gradient: "linear-gradient(135deg,#6D8ED9 0%, #4FBC8C 100%)",
    gradientNav: "linear-gradient(145deg,rgba(109,142,217,0.94),rgba(79,188,140,0.90))",
  },
  status: {
    green: "#4FBC8C",
    greenDim: "rgba(79, 188, 140, 0.10)",
    amber: "#D4A15F",
    amberDim: "rgba(212, 161, 95, 0.10)",
    red: "#DE6B72",
    redDim: "rgba(222, 107, 114, 0.10)",
    blue: "#6D8ED9",
    blueDim: "rgba(109, 142, 217, 0.10)",
    purple: "#8B7BE0",
    purpleDim: "rgba(139, 123, 224, 0.10)",
  },
  shadow: {
    sm: "0 1px 2px rgba(0,0,0,0.24)",
    card: "0 10px 28px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.12)",
    elevated: "0 16px 40px rgba(0,0,0,0.28), 0 6px 18px rgba(0,0,0,0.14)",
    glow: "0 0 24px rgba(109,142,217,0.10)",
    navBtn: "0 10px 26px rgba(0,0,0,0.24), 0 2px 10px rgba(0,0,0,0.18)",
  },
};

export const LIGHT_TOKENS = {
  bg: {
    base: "#F6F8FC",
    card: "#FFFFFF",
    elevated: "#F9FBFE",
    surface: "#F1F5FB",
    hover: "rgba(94,121,201,0.05)",
    glass: "rgba(255,255,255,0.82)",
    navGlass: "rgba(247,249,252,0.90)",
  },
  border: {
    subtle: "rgba(108, 124, 154, 0.10)",
    default: "rgba(108, 124, 154, 0.17)",
    focus: "rgba(94,121,201,0.24)",
    glow: "rgba(109, 142, 217, 0.08)",
  },
  text: {
    primary: "#161C26",
    secondary: "#556275",
    dim: "#778398",
    muted: "#9CA7B8",
    prominent: "#223043",
  },
  accent: {
    primary: "#5E79C9",
    primaryDim: "rgba(94,121,201,0.10)",
    primaryGlow: "rgba(94,121,201,0.10)",
    primarySoft: "rgba(94,121,201,0.14)",
    emerald: "#29956A",
    emeraldDim: "rgba(41,149,106,0.08)",
    emeraldSoft: "rgba(41,149,106,0.12)",
    copper: "#B67E3B",
    copperDim: "rgba(182,126,59,0.10)",
    gradient: "linear-gradient(135deg,#5E79C9,#29956A)",
    gradientNav: "linear-gradient(135deg,#5670BE,#278861)",
  },
  status: {
    green: "#29956A",
    greenDim: "rgba(41,149,106,0.08)",
    amber: "#B67E3B",
    amberDim: "rgba(182,126,59,0.08)",
    red: "#CC5764",
    redDim: "rgba(204,87,100,0.08)",
    blue: "#5E79C9",
    blueDim: "rgba(94,121,201,0.08)",
    purple: "#7B69D8",
    purpleDim: "rgba(123,105,216,0.08)",
  },
  shadow: {
    sm: "0 1px 2px rgba(15,23,42,0.05)",
    card: "0 14px 34px rgba(148,163,184,0.18), 0 3px 10px rgba(15,23,42,0.05)",
    elevated: "0 22px 52px rgba(148,163,184,0.20), 0 8px 18px rgba(15,23,42,0.06)",
    glow: "0 0 24px rgba(94,121,201,0.08)",
    navBtn: "0 12px 28px rgba(148,163,184,0.18), 0 3px 8px rgba(15,23,42,0.05)",
  },
};

// Shared tokens (don't change between themes)
export const SHARED_TOKENS = {
  radius: { sm: 12, md: 16, lg: 20, xl: 28 },
  font: {
    mono: "ui-monospace, 'SF Mono', 'JetBrains Mono', monospace",
    // Explicit emoji fallbacks prevent iOS WebView from substituting missing-glyph boxes
    // when onboarding/paywall copy uses emoji as lightweight visual markers.
    sans:
      "-apple-system, BlinkMacSystemFont, system-ui, 'SF Pro Display', 'SF Pro Text', 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', 'Inter', sans-serif",
  },
};

export function cloneThemeTokens(mode = "dark") {
  const tokens = mode === "light" ? LIGHT_TOKENS : DARK_TOKENS;
  return JSON.parse(JSON.stringify({ ...tokens, ...SHARED_TOKENS }));
}

// Mutable compatibility shim for legacy imports. ThemeProvider keeps it in sync.
export const T = cloneThemeTokens("dark");

export const INSTITUTIONS = [
  "American Express",
  "Bank of America",
  "Barclays",
  "Capital One",
  "Chase",
  "Citi",
  "Discover",
  "FNBO",
  "Goldman Sachs",
  "HSBC",
  "Navy Federal",
  "PenFed",
  "Synchrony",
  "TD Bank",
  "US Bank",
  "USAA",
  "Wells Fargo",
  "Other",
];

// Issuer brand colors
export const ISSUER_COLORS = {
  Ally: { bg: "rgba(140,96,255,0.12)", border: "rgba(140,96,255,0.28)", text: "#B59AFF", accent: "#8C60FF" },
  "American Express": { bg: "rgba(0,111,191,0.10)", border: "rgba(0,111,191,0.20)", text: "#4DA3E8", accent: "#006FBF" },
  "Bank of America": { bg: "rgba(220,30,50,0.10)", border: "rgba(220,30,50,0.20)", text: "#E85060", accent: "#DC1E32" },
  Barclays: { bg: "rgba(0,175,215,0.10)", border: "rgba(0,175,215,0.20)", text: "#3CC0E0", accent: "#00AFD7" },
  "Capital One": { bg: "rgba(213,0,50,0.10)", border: "rgba(213,0,50,0.20)", text: "#F05060", accent: "#D50032" },
  Chase: { bg: "rgba(60,80,180,0.10)", border: "rgba(60,80,180,0.20)", text: "#7080D0", accent: "#3C50B4" },
  Citi: { bg: "rgba(42,184,255,0.14)", border: "rgba(42,184,255,0.30)", text: "#7EDCFF", accent: "#2AB8FF" },
  Discover: { bg: "rgba(255,96,0,0.10)", border: "rgba(255,96,0,0.20)", text: "#FF8040", accent: "#FF6000" },
  FNBO: { bg: "rgba(0,100,60,0.10)", border: "rgba(0,100,60,0.20)", text: "#4DAF80", accent: "#00643C" },
  "Goldman Sachs": {
    bg: "rgba(110,130,160,0.10)",
    border: "rgba(110,130,160,0.20)",
    text: "#8AA0C0",
    accent: "#6E82A0",
  },
  HSBC: { bg: "rgba(219,0,17,0.10)", border: "rgba(219,0,17,0.20)", text: "#E85050", accent: "#DB0011" },
  "Navy Federal": { bg: "rgba(0,52,120,0.10)", border: "rgba(0,52,120,0.20)", text: "#4D78B0", accent: "#003478" },
  PenFed: { bg: "rgba(0,60,110,0.10)", border: "rgba(0,60,110,0.20)", text: "#4D80B0", accent: "#003C6E" },
  Synchrony: { bg: "rgba(0,140,120,0.10)", border: "rgba(0,140,120,0.20)", text: "#40B0A0", accent: "#008C78" },
  "TD Bank": { bg: "rgba(52,168,83,0.10)", border: "rgba(52,168,83,0.20)", text: "#50C070", accent: "#34A853" },
  "US Bank": { bg: "rgba(200,25,30,0.10)", border: "rgba(200,25,30,0.20)", text: "#E05050", accent: "#C8191E" },
  USAA: { bg: "rgba(0,47,108,0.10)", border: "rgba(0,47,108,0.20)", text: "#4D70A0", accent: "#002F6C" },
  "Wells Fargo": { bg: "rgba(208,18,27,0.10)", border: "rgba(208,18,27,0.20)", text: "#E05050", accent: "#D0121B" },
};

// ═══════════════════════════════════════════════════════════════
// DEFAULT CARD PORTFOLIO — Public v1 ships empty (fresh install)
// ═══════════════════════════════════════════════════════════════
export const DEFAULT_CARD_PORTFOLIO = [];

// ═══════════════════════════════════════════════════════════════
// DEFAULT RENEWALS — Public v1 ships empty (fresh install)
// ═══════════════════════════════════════════════════════════════
export const RENEWAL_CATEGORIES = [];

// Helper: format interval for display
export function formatInterval(interval, unit) {
  if (!interval || !unit) return "—";
  if (unit === "one-time") return "one-time";
  if (interval === 1) {
    if (unit === "weeks") return "weekly";
    if (unit === "months") return "monthly";
    if (unit === "years") return "annual";
  }
  return `every ${interval} ${unit}`;
}
