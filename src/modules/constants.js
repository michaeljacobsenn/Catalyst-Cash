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
    base: "#05080F",
    card: "#0B111A",
    elevated: "#121A27",
    surface: "#182131",
    hover: "rgba(139,107,214,0.10)",
    glass: "rgba(8,12,20,0.78)",
    navGlass: "rgba(7,10,18,0.90)",
  },
  border: {
    subtle: "rgba(164,148,214,0.08)",
    default: "rgba(164,148,214,0.14)",
    focus: "rgba(139,107,214,0.42)",
    glow: "rgba(139,107,214,0.12)",
  },
  text: {
    primary: "#E4E6F0",
    secondary: "#97A0B5",
    dim: "#737C92",
    muted: "#4B5368",
  },
  accent: {
    primary: "#8B6BD6",
    primaryDim: "rgba(139,107,214,0.14)",
    primaryGlow: "rgba(139,107,214,0.18)",
    primarySoft: "rgba(139,107,214,0.22)",
    emerald: "#39D07E",
    emeraldDim: "rgba(57,208,126,0.12)",
    emeraldSoft: "rgba(57,208,126,0.20)",
    copper: "#39D07E",
    copperDim: "rgba(57,208,126,0.12)",
    gradient: "linear-gradient(135deg,#8B6BD6 0%, #39D07E 100%)",
    gradientNav: "linear-gradient(145deg,rgba(139,107,214,0.96),rgba(57,208,126,0.92))",
  },
  status: {
    green: "#2ECC71",
    greenDim: "rgba(46,204,113,0.08)",
    amber: "#E0A84D",
    amberDim: "rgba(224,168,77,0.08)",
    red: "#E85C6A",
    redDim: "rgba(232,92,106,0.08)",
    blue: "#6BA3E8",
    blueDim: "rgba(107,163,232,0.08)",
    purple: "#9B6FD4",
    purpleDim: "rgba(155,111,212,0.08)",
  },
  shadow: {
    sm: "0 1px 2px rgba(0,0,0,0.4)",
    card: "0 12px 28px rgba(0,0,0,0.24), 0 2px 8px rgba(0,0,0,0.18)",
    elevated: "0 18px 42px rgba(0,0,0,0.34), 0 6px 18px rgba(0,0,0,0.20)",
    glow: "0 0 36px rgba(139,107,214,0.12), 0 0 16px rgba(139,107,214,0.08)",
    navBtn: "0 10px 28px rgba(139,107,214,0.22), 0 2px 10px rgba(0,0,0,0.45), 0 0 26px rgba(57,208,126,0.10)",
  },
};

export const LIGHT_TOKENS = {
  bg: {
    base: "#F5F5FA",
    card: "#FFFFFF",
    elevated: "#FFFFFF",
    surface: "#F3F1FF",
    hover: "rgba(121,72,214,0.05)",
    glass: "rgba(255,255,255,0.88)",
    navGlass: "rgba(245,245,250,0.94)",
  },
  border: {
    subtle: "rgba(90,70,130,0.06)",
    default: "rgba(90,70,130,0.11)",
    focus: "rgba(121,72,214,0.28)",
    glow: "rgba(121,72,214,0.08)",
  },
  text: {
    primary: "#15131C",
    secondary: "#5D596E",
    dim: "#868094",
    muted: "#ACA7B8",
  },
  accent: {
    primary: "#7948D6", // Highly saturated violet for maximum pop
    primaryDim: "rgba(121,72,214,0.08)",
    primaryGlow: "rgba(121,72,214,0.10)",
    primarySoft: "rgba(121,72,214,0.12)",
    emerald: "#0E9E56", // Darker, richer emerald for light backgrounds
    emeraldDim: "rgba(14,158,86,0.08)",
    emeraldSoft: "rgba(14,158,86,0.12)",
    copper: "#0E9E56",
    copperDim: "rgba(14,158,86,0.08)",
    gradient: "linear-gradient(135deg,#7948D6,#0E9E56)",
    gradientNav: "linear-gradient(135deg,#6D3DC5,#0C8A4B)",
  },
  status: {
    green: "#0E9E56",
    greenDim: "rgba(14,158,86,0.06)",
    amber: "#C88616",
    amberDim: "rgba(200,134,22,0.06)",
    red: "#D93648",
    redDim: "rgba(217,54,72,0.06)",
    blue: "#3878D0",
    blueDim: "rgba(56,120,208,0.06)",
    purple: "#7948D6",
    purpleDim: "rgba(121,72,214,0.06)",
  },
  shadow: {
    sm: "0 1px 2px rgba(90,70,130,0.04)",
    card: "0 10px 28px rgba(90,70,130,0.04), 0 2px 6px rgba(90,70,130,0.03)",
    elevated: "0 18px 48px rgba(90,70,130,0.07), 0 6px 16px rgba(90,70,130,0.05)",
    glow: "0 0 32px rgba(121,72,214,0.08), 0 0 12px rgba(121,72,214,0.05)",
    navBtn: "0 4px 16px rgba(121,72,214,0.10), 0 2px 6px rgba(90,70,130,0.04)",
  },
};

// Shared tokens (don't change between themes)
export const SHARED_TOKENS = {
  radius: { sm: 10, md: 14, lg: 18, xl: 28 },
  font: {
    mono: "ui-monospace, 'SF Mono', 'JetBrains Mono', monospace",
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Inter', sans-serif",
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
  "American Express": { bg: "rgba(0,111,191,0.10)", border: "rgba(0,111,191,0.20)", text: "#4DA3E8", accent: "#006FBF" },
  "Bank of America": { bg: "rgba(220,30,50,0.10)", border: "rgba(220,30,50,0.20)", text: "#E85060", accent: "#DC1E32" },
  Barclays: { bg: "rgba(0,175,215,0.10)", border: "rgba(0,175,215,0.20)", text: "#3CC0E0", accent: "#00AFD7" },
  "Capital One": { bg: "rgba(213,0,50,0.10)", border: "rgba(213,0,50,0.20)", text: "#F05060", accent: "#D50032" },
  Chase: { bg: "rgba(60,80,180,0.10)", border: "rgba(60,80,180,0.20)", text: "#7080D0", accent: "#3C50B4" },
  Citi: { bg: "rgba(0,82,155,0.10)", border: "rgba(0,82,155,0.20)", text: "#4D8EC4", accent: "#00529B" },
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
