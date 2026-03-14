import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { db } from "../utils.js";
import type { AuditRecord } from "../../types/index.js";

export type AppTab =
  | "dashboard"
  | "cashflow"
  | "audit"
  | "portfolio"
  | "chat"
  | "settings"
  | "results"
  | "history"
  | "guide"
  | "input";

interface NavViewStateRecord {
  ts?: string | number | null;
  [key: string]: unknown;
}

export type NavViewState = AuditRecord | NavViewStateRecord;

interface NavigationContextValue {
  tab: AppTab;
  setTab: Dispatch<SetStateAction<AppTab>>;
  navTo: (newTab: AppTab, viewState?: NavViewState | null) => void;
  syncTab: (newTab: AppTab) => void;
  swipeToTab: (direction: "left" | "right") => void;
  swipeAnimClass: string;
  setSwipeAnimClass: Dispatch<SetStateAction<string>>;
  resultsBackTarget: AppTab | null;
  setResultsBackTarget: Dispatch<SetStateAction<AppTab | null>>;
  setupReturnTab: AppTab | null;
  setSetupReturnTab: Dispatch<SetStateAction<AppTab | null>>;
  onboardingComplete: boolean;
  setOnboardingComplete: Dispatch<SetStateAction<boolean>>;
  showGuide: boolean;
  setShowGuide: Dispatch<SetStateAction<boolean>>;
  inputMounted: boolean;
  setInputMounted: Dispatch<SetStateAction<boolean>>;
  lastCenterTab: React.MutableRefObject<AppTab>;
  inputBackTarget: React.MutableRefObject<AppTab>;
  registerChatStreamAbort: (handler: (() => void) | null) => void;
  abortActiveChatStream: () => void;
  SWIPE_TAB_ORDER: readonly AppTab[];
}

interface NavigationProviderProps {
  children?: ReactNode;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

// ── Swipeable tab order ──
// Mirrors the bottom nav bar order exactly: Dashboard | Cashflow | Audit | Portfolio | Ask AI
const SWIPE_TAB_ORDER: readonly AppTab[] = ["dashboard", "cashflow", "audit", "portfolio", "chat"];

export function NavigationProvider({ children }: NavigationProviderProps) {
  const [tab, setTab] = useState<AppTab>("dashboard");
  const [resultsBackTarget, setResultsBackTarget] = useState<AppTab | null>(null);
  const [setupReturnTab, setSetupReturnTab] = useState<AppTab | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState(true); // true until proven otherwise
  const [showGuide, setShowGuide] = useState(false);
  const [inputMounted, setInputMounted] = useState(false);

  // We keep swipeAnimClass around for overlays that still use vertical/modal JS slides
  const [swipeAnimClass, setSwipeAnimClass] = useState("tab-transition");

  const lastCenterTab = useRef<AppTab>("dashboard");
  const inputBackTarget = useRef<AppTab>("audit");
  const chatStreamAbortRef = useRef<(() => void) | null>(null);

  // Onboarding initialization
  useEffect(() => {
    const initOnboarding = async () => {
      const obComplete = await db.get("onboarding-complete");
      const history = await db.get("audit-history");

      const hasHistory = Array.isArray(history) && history.length > 0 && !history[0]?.isDemoHistory;

      if (obComplete || hasHistory) {
        setOnboardingComplete(true);
        if (!obComplete) db.set("onboarding-complete", true);
      } else {
        setOnboardingComplete(false);
      }
    };
    initOnboarding();
  }, []);

  const registerChatStreamAbort = useCallback((handler: (() => void) | null) => {
    chatStreamAbortRef.current = handler;
  }, []);

  const abortActiveChatStream = useCallback(() => {
    chatStreamAbortRef.current?.();
  }, []);

  const navTo = useCallback((newTab: AppTab, viewState: NavViewState | null = null) => {
    const prevTab = tab;
    // 1) Set state internally so UI bottom bar highlights instantly
    setTab(newTab);

    // 2) If it's a primary swipeable tab, instruct the DOM to physically scroll there
    if (SWIPE_TAB_ORDER.includes(newTab)) {
      const doScroll = () =>
        window.dispatchEvent(new CustomEvent("app-scroll-to-tab", { detail: newTab }));

      // When leaving an overlay the snap-container transitions from display:none → flex.
      // We must wait for React to re-render so container.clientWidth > 0 before scrolling.
      const OVERLAY_TABS = ["settings", "results", "history", "guide", "input"];
      if (OVERLAY_TABS.includes(prevTab)) {
        requestAnimationFrame(() => requestAnimationFrame(doScroll));
      } else {
        doScroll();
      }
    }

    if (viewState !== undefined && viewState !== null) {
        window.dispatchEvent(new CustomEvent<NavViewState>("app-nav-viewing", { detail: viewState }));
    }

    if (newTab !== "results") setResultsBackTarget(null);
    if (newTab === "input") setInputMounted(true);
    if (newTab === "dashboard" || newTab === "input") lastCenterTab.current = newTab;
    if (newTab === "input") inputBackTarget.current = "dashboard";

    window.history.pushState({ tab: newTab, viewingTs: viewState?.ts }, "", "");
  }, [tab]);

  // SyncTab is purely for the IntersectionObserver to tell the state:
  // "Hey, the user physically scrolled here, light up this icon"
  const syncTab = useCallback((newTab: AppTab) => {
    setTab(prev => {
      if (prev === newTab) return prev;
      if (newTab === "input") setInputMounted(true);
      if (newTab === "dashboard" || newTab === "input") lastCenterTab.current = newTab;
      window.history.pushState({ tab: newTab, viewingTs: null }, "", "");
      return newTab;
    });
  }, []);

  // Backwards compatibility for components that might still call swipeToTab (replace with standard navTo later)
  const swipeToTab = useCallback((direction: "left" | "right") => {
    setTab(prev => {
      const effectiveTab = prev === "settings" ? lastCenterTab.current : prev;
      const idx = SWIPE_TAB_ORDER.indexOf(effectiveTab);
      if (idx === -1) return prev;
      let nextIdx = direction === "left" ? idx + 1 : idx - 1;
      if (nextIdx < 0 || nextIdx >= SWIPE_TAB_ORDER.length) return prev;
      const nextTab = SWIPE_TAB_ORDER[nextIdx] as AppTab;

      window.dispatchEvent(new CustomEvent("app-scroll-to-tab", { detail: nextTab }));
      if (nextTab === "input") setInputMounted(true);
      if (nextTab === "dashboard" || nextTab === "input") lastCenterTab.current = nextTab;
      window.history.pushState({ tab: nextTab, viewingTs: null }, "", "");
      return nextTab;
    });
  }, []);

  useEffect(() => {
    if (swipeAnimClass !== "tab-transition") {
      const timer = setTimeout(() => setSwipeAnimClass("tab-transition"), 350);
      return () => clearTimeout(timer);
    }
  }, [swipeAnimClass]);

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    window.history.replaceState({ tab: "dashboard", viewingTs: null }, "", "");

    const onPopState = (e: PopStateEvent) => {
      const st = e.state;
      if (st) {
        if (st.tab) setTab(st.tab as AppTab);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const value: NavigationContextValue = {
    tab,
    setTab,
    navTo,
    syncTab,
    swipeToTab,
    swipeAnimClass,
    setSwipeAnimClass,
    resultsBackTarget,
    setResultsBackTarget,
    setupReturnTab,
    setSetupReturnTab,
    onboardingComplete,
    setOnboardingComplete,
    showGuide,
    setShowGuide,
    inputMounted,
    setInputMounted,
    lastCenterTab,
    inputBackTarget,
    registerChatStreamAbort,
    abortActiveChatStream,
    SWIPE_TAB_ORDER,
  };

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) throw new Error("useNavigation must be used within a NavigationProvider");
  return context;
};
