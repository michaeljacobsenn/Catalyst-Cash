// ═══════════════════════════════════════════════════════════════
// APP VERSION — single source of truth
// ═══════════════════════════════════════════════════════════════
export const APP_VERSION = "2.0.0";

// ═══════════════════════════════════════════════════════════════
// DESIGN TOKENS — Catalyst Cash Brand Palette
// Icon: deep violet (#3D1B6B) → emerald green (#1A6B40)
// ═══════════════════════════════════════════════════════════════

const DARK_TOKENS = {
  bg: {
    base: "#07090F",
    card: "#0D0F18",
    elevated: "#141622",
    surface: "#1A1D2A",
    hover: "#20243200",
    glass: "rgba(13,15,24,0.75)",
    navGlass: "rgba(7,9,15,0.88)",
  },
  border: {
    subtle: "rgba(160,140,220,0.06)",
    default: "rgba(160,140,220,0.09)",
    focus: "rgba(110,75,180,0.60)",
    glow: "rgba(110,75,180,0.16)",
  },
  text: {
    primary: "#E4E6F0",
    secondary: "#8890A6",
    dim: "#6B7280",
    muted: "#2E3248",
  },
  accent: {
    primary: "#7B5EA7",
    primaryDim: "rgba(123,94,167,0.12)",
    primaryGlow: "rgba(123,94,167,0.24)",
    primarySoft: "rgba(123,94,167,0.18)",
    emerald: "#2ECC71",
    emeraldDim: "rgba(46,204,113,0.10)",
    emeraldSoft: "rgba(46,204,113,0.18)",
    copper: "#2ECC71",
    copperDim: "rgba(46,204,113,0.10)",
    gradient: "linear-gradient(135deg,#7B5EA7,#1A9B5A)",
    gradientNav: "linear-gradient(135deg,#6B4E97,#1A8B50)",
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
    sm: "0 1px 2px rgba(0,0,0,0.25)",
    card: "0 1px 3px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.25)",
    elevated: "0 4px 12px rgba(0,0,0,0.45), 0 1px 4px rgba(0,0,0,0.3)",
    glow: "0 0 20px rgba(123,94,167,0.18), 0 0 6px rgba(123,94,167,0.12)",
    navBtn: "0 4px 20px rgba(123,94,167,0.35), 0 2px 8px rgba(0,0,0,0.5), 0 0 30px rgba(46,204,113,0.12)",
  },
};

const LIGHT_TOKENS = {
  bg: {
    base: "#F6F6F9", // Cool tinted paper-white
    card: "#FFFFFF",
    elevated: "#FFFFFF", // rely on shadow for elevation
    surface: "#F0EFFF", // Very faint violet tint for active surfaces
    hover: "rgba(110,75,180,0.04)",
    glass: "rgba(255,255,255,0.85)",
    navGlass: "rgba(246,246,249,0.92)",
  },
  border: {
    subtle: "rgba(90,70,130,0.06)",
    default: "rgba(90,70,130,0.12)",
    focus: "rgba(121,72,214,0.50)",
    glow: "rgba(121,72,214,0.12)",
  },
  text: {
    primary: "#14121A", // Rich slate, replacing harsh black
    secondary: "#5C586B",
    dim: "#8A8498",
    muted: "#ACA7B8",
  },
  accent: {
    primary: "#7948D6", // Highly saturated violet for maximum pop
    primaryDim: "rgba(121,72,214,0.08)",
    primaryGlow: "rgba(121,72,214,0.16)",
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
    card: "0 4px 12px rgba(90,70,130,0.04), 0 1px 3px rgba(90,70,130,0.03)", // Diffused, tinted elevation
    elevated: "0 8px 24px rgba(90,70,130,0.06), 0 2px 6px rgba(90,70,130,0.04)",
    glow: "0 0 20px rgba(121,72,214,0.15), 0 0 6px rgba(121,72,214,0.08)",
    navBtn: "0 4px 16px rgba(121,72,214,0.15), 0 2px 6px rgba(90,70,130,0.06)",
  },
};

// Shared tokens (don't change between themes)
const SHARED_TOKENS = {
  radius: { sm: 8, md: 12, lg: 16, xl: 24 },
  font: {
    mono: "'JetBrains Mono',ui-monospace,monospace",
    sans: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif",
  },
};

// Deep clone so we don't accidentally mutate the master templates
export const T = JSON.parse(JSON.stringify({ ...DARK_TOKENS, ...SHARED_TOKENS }));

/**
 * Apply a theme by mutating T in-place.
 * Every component importing T will see updated values on next render.
 * @param {"dark"|"light"} mode
 */
export function applyTheme(mode) {
  const tokens = mode === "light" ? LIGHT_TOKENS : DARK_TOKENS;
  const safeTokens = JSON.parse(JSON.stringify(tokens));

  Object.assign(T.bg, safeTokens.bg);
  Object.assign(T.border, safeTokens.border);
  Object.assign(T.text, safeTokens.text);
  Object.assign(T.accent, safeTokens.accent);
  Object.assign(T.status, safeTokens.status);
  Object.assign(T.shadow, safeTokens.shadow);
  T._mode = mode; // track current mode

  // Keep native/webview surfaces in sync even if a memoized view skips a render.
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.setProperty("--cc-bg-base", tokens.bg.base);
    document.documentElement.style.colorScheme = mode;
    if (document.body) document.body.style.background = tokens.bg.base;
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute("content", mode === "light" ? tokens.bg.base : "#04060A");
    }
  }
}

// Issuer brand colors
export const ISSUER_COLORS = {
  "Amex": { bg: "rgba(0,111,191,0.10)", border: "rgba(0,111,191,0.20)", text: "#4DA3E8", accent: "#006FBF" },
  "Bank of America": { bg: "rgba(220,30,50,0.10)", border: "rgba(220,30,50,0.20)", text: "#E85060", accent: "#DC1E32" },
  "Barclays": { bg: "rgba(0,175,215,0.10)", border: "rgba(0,175,215,0.20)", text: "#3CC0E0", accent: "#00AFD7" },
  "Capital One": { bg: "rgba(213,0,50,0.10)", border: "rgba(213,0,50,0.20)", text: "#F05060", accent: "#D50032" },
  "Chase": { bg: "rgba(60,80,180,0.10)", border: "rgba(60,80,180,0.20)", text: "#7080D0", accent: "#3C50B4" },
  "Citi": { bg: "rgba(0,82,155,0.10)", border: "rgba(0,82,155,0.20)", text: "#4D8EC4", accent: "#00529B" },
  "Discover": { bg: "rgba(255,96,0,0.10)", border: "rgba(255,96,0,0.20)", text: "#FF8040", accent: "#FF6000" },
  "FNBO": { bg: "rgba(0,100,60,0.10)", border: "rgba(0,100,60,0.20)", text: "#4DAF80", accent: "#00643C" },
  "Goldman Sachs": { bg: "rgba(110,130,160,0.10)", border: "rgba(110,130,160,0.20)", text: "#8AA0C0", accent: "#6E82A0" },
  "HSBC": { bg: "rgba(219,0,17,0.10)", border: "rgba(219,0,17,0.20)", text: "#E85050", accent: "#DB0011" },
  "Navy Federal": { bg: "rgba(0,52,120,0.10)", border: "rgba(0,52,120,0.20)", text: "#4D78B0", accent: "#003478" },
  "PenFed": { bg: "rgba(0,60,110,0.10)", border: "rgba(0,60,110,0.20)", text: "#4D80B0", accent: "#003C6E" },
  "Synchrony": { bg: "rgba(0,140,120,0.10)", border: "rgba(0,140,120,0.20)", text: "#40B0A0", accent: "#008C78" },
  "TD Bank": { bg: "rgba(52,168,83,0.10)", border: "rgba(52,168,83,0.20)", text: "#50C070", accent: "#34A853" },
  "US Bank": { bg: "rgba(200,25,30,0.10)", border: "rgba(200,25,30,0.20)", text: "#E05050", accent: "#C8191E" },
  "USAA": { bg: "rgba(0,47,108,0.10)", border: "rgba(0,47,108,0.20)", text: "#4D70A0", accent: "#002F6C" },
  "Wells Fargo": { bg: "rgba(208,18,27,0.10)", border: "rgba(208,18,27,0.20)", text: "#E05050", accent: "#D0121B" },
};

// ═══════════════════════════════════════════════════════════════
// DEFAULT CARD PORTFOLIO — Public v1 ships empty (fresh install)
// ═══════════════════════════════════════════════════════════════
export const DEFAULT_CARD_PORTFOLIO = [];

// CARD_PORTFOLIO alias for backward compatibility (InputForm dropdown)
export const CARD_PORTFOLIO = DEFAULT_CARD_PORTFOLIO;

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
