  import { createContext,useContext,useEffect,useLayoutEffect,useMemo,useState,type ReactNode } from "react";
  import { DARK_TOKENS,LIGHT_TOKENS,SHARED_TOKENS,T,cloneThemeTokens } from "../constants.js";
  import { useSettings } from "./SettingsContext.js";

type ThemeMode = "dark" | "light" | "system";
type EffectiveThemeMode = "dark" | "light";
type ThemeTokens = typeof T;

interface ThemeContextValue {
  theme: ThemeTokens;
  themeMode: ThemeMode;
  effectiveMode: EffectiveThemeMode;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemPrefersLight(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.matchMedia?.("(prefers-color-scheme: light)").matches);
}

function resolveEffectiveMode(mode: ThemeMode, systemPrefersLight = getSystemPrefersLight()): EffectiveThemeMode {
  if (mode !== "system") return mode;
  return systemPrefersLight ? "light" : "dark";
}

function syncThemeTokens(mode: EffectiveThemeMode): ThemeTokens {
  const source = mode === "light" ? LIGHT_TOKENS : DARK_TOKENS;
  const safeTokens = JSON.parse(JSON.stringify(source));

  Object.assign(T.bg, safeTokens.bg);
  Object.assign(T.border, safeTokens.border);
  Object.assign(T.text, safeTokens.text);
  Object.assign(T.accent, safeTokens.accent);
  Object.assign(T.status, safeTokens.status);
  Object.assign(T.shadow, safeTokens.shadow);
  Object.assign(T.radius, SHARED_TOKENS.radius);
  Object.assign(T.font, SHARED_TOKENS.font);
  T._mode = mode;

  return T;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { themeMode, themeTick } = useSettings();
  const [systemPrefersLight, setSystemPrefersLight] = useState<boolean>(() => getSystemPrefersLight());
  const effectiveMode = resolveEffectiveMode(themeMode, systemPrefersLight);
  const theme = useMemo<ThemeTokens>(() => {
    syncThemeTokens(effectiveMode);
    return cloneThemeTokens(effectiveMode);
  }, [effectiveMode]);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!mediaQuery) return;
    const handler = (event: MediaQueryListEvent): void => setSystemPrefersLight(event.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.theme = effectiveMode;
    document.documentElement.style.setProperty("--cc-bg-base", theme.bg.base);
    document.documentElement.style.colorScheme = effectiveMode;
    if (document.body) document.body.style.background = theme.bg.base;
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute("content", theme.bg.base);
    }
  }, [effectiveMode, theme, themeTick]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      themeMode,
      effectiveMode,
    }),
    [theme, themeMode, effectiveMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeTokens {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context.theme;
}
