  import { createContext,useContext,useEffect,useMemo,useState,type ReactNode } from "react";
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

function resolveEffectiveMode(mode: ThemeMode): EffectiveThemeMode {
  if (mode !== "system") return mode;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function syncThemeShim(mode: EffectiveThemeMode): ThemeTokens {
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

  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.setProperty("--cc-bg-base", safeTokens.bg.base);
    document.documentElement.style.colorScheme = mode;
    if (document.body) document.body.style.background = safeTokens.bg.base;
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute("content", safeTokens.bg.base);
    }
  }

  return T;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { themeMode } = useSettings();
  const [effectiveMode, setEffectiveMode] = useState<EffectiveThemeMode>(() => resolveEffectiveMode(themeMode));
  const [theme, setTheme] = useState<ThemeTokens>(() => cloneThemeTokens(resolveEffectiveMode(themeMode)));

  useEffect(() => {
    const nextMode = resolveEffectiveMode(themeMode);
    setEffectiveMode(nextMode);
    setTheme(cloneThemeTokens(nextMode));
    syncThemeShim(nextMode);
  }, [themeMode]);

  useEffect(() => {
    if (themeMode !== "system") return;
    const mediaQuery = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!mediaQuery) return;
    const handler = (event: MediaQueryListEvent): void => {
      const nextMode: EffectiveThemeMode = event.matches ? "light" : "dark";
      setEffectiveMode(nextMode);
      setTheme(cloneThemeTokens(nextMode));
      syncThemeShim(nextMode);
    };
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [themeMode]);

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

