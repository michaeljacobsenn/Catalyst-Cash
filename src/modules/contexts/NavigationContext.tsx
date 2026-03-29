  import type { Dispatch,ReactNode,SetStateAction } from "react";
  import React,{ createContext,useCallback,useContext,useEffect,useRef,useState } from "react";
  import type { AuditRecord } from "../../types/index.js";
  import { db } from "../utils.js";

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
  navState: NavViewStateRecord | null;
  clearNavState: () => void;
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
  rehydrateNavigation: () => Promise<void>;
  resetNavigationState: (nextTab?: AppTab) => void;
  showGuide: boolean;
  setShowGuide: Dispatch<SetStateAction<boolean>>;
  inputMounted: boolean;
  setInputMounted: Dispatch<SetStateAction<boolean>>;
  lastCenterTab: React.MutableRefObject<AppTab>;
  inputBackTarget: React.MutableRefObject<AppTab>;
  overlaySourceTab: AppTab | null;
  overlayBaseTab: AppTab | null;
  registerChatStreamAbort: (handler: (() => void) | null) => void;
  abortActiveChatStream: () => void;
  SWIPE_TAB_ORDER: readonly AppTab[];
}

interface NavigationProviderProps {
  children?: ReactNode;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);
const OVERLAY_TABS: readonly AppTab[] = ["settings", "results", "history", "input"];

// ── Swipeable tab order ──
// Mirrors the bottom nav bar order exactly: Dashboard | Cashflow | Audit | Portfolio | Ask AI
const SWIPE_TAB_ORDER: readonly AppTab[] = ["dashboard", "cashflow", "audit", "portfolio", "chat"];

export function NavigationProvider({ children }: NavigationProviderProps) {
  const [tab, setTab] = useState<AppTab>("dashboard");
  const [navState, setNavState] = useState<NavViewStateRecord | null>(null);
  const [resultsBackTarget, setResultsBackTarget] = useState<AppTab | null>(null);
  const [setupReturnTab, setSetupReturnTab] = useState<AppTab | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState(true); // true until proven otherwise
  const [showGuide, setShowGuide] = useState(false);
  const [inputMounted, setInputMounted] = useState(false);
  const [overlaySourceTab, setOverlaySourceTab] = useState<AppTab | null>(null);
  const [overlayBaseTab, setOverlayBaseTab] = useState<AppTab | null>(null);

  // We keep swipeAnimClass around for overlays that still use vertical/modal JS slides
  const [swipeAnimClass, setSwipeAnimClass] = useState("tab-transition");

  const lastCenterTab = useRef<AppTab>("dashboard");
  const inputBackTarget = useRef<AppTab>("audit");
  const chatStreamAbortRef = useRef<(() => void) | null>(null);
  const resultsBackTargetRef = useRef<AppTab | null>(null);
  const overlayBaseTabRef = useRef<AppTab | null>(null);
  const tabRef = useRef<AppTab>("dashboard");

  const rehydrateNavigation = useCallback(async () => {
    const obComplete = await db.get("onboarding-complete");
    const history = await db.get("audit-history");

    const hasHistory = Array.isArray(history) && history.length > 0 && !history[0]?.isDemoHistory;

    if (obComplete || hasHistory) {
      setOnboardingComplete(true);
      if (!obComplete) db.set("onboarding-complete", true);
    } else {
      setOnboardingComplete(false);
    }
  }, []);

  const resetNavigationState = useCallback((nextTab: AppTab = "dashboard") => {
    setTab(nextTab);
    setNavState(null);
    setResultsBackTarget(null);
    setSetupReturnTab(null);
    setShowGuide(false);
    setInputMounted(false);
    setOverlaySourceTab(null);
    setOverlayBaseTab(null);
    lastCenterTab.current = nextTab === "dashboard" || nextTab === "input" ? nextTab : "dashboard";
    inputBackTarget.current = "dashboard";
    window.history.replaceState({ tab: nextTab, viewingTs: null }, "", "");
  }, []);

  // Onboarding initialization
  useEffect(() => {
    void rehydrateNavigation();
  }, [rehydrateNavigation]);

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    resultsBackTargetRef.current = resultsBackTarget;
  }, [resultsBackTarget]);

  useEffect(() => {
    overlayBaseTabRef.current = overlayBaseTab;
  }, [overlayBaseTab]);

  const registerChatStreamAbort = useCallback((handler: (() => void) | null) => {
    chatStreamAbortRef.current = handler;
  }, []);

  const abortActiveChatStream = useCallback(() => {
    chatStreamAbortRef.current?.();
  }, []);

  const clearNavState = useCallback(() => {
    setNavState(null);
  }, []);

  const navTo = useCallback((newTab: AppTab, viewState: NavViewState | null = null) => {
    const prevTab = tabRef.current;
    // 1) Set state internally so UI bottom bar highlights instantly
    setTab(newTab);

    // 2) If it's a primary swipeable tab, instruct the DOM to physically scroll there
    if (SWIPE_TAB_ORDER.includes(newTab)) {
      const doScroll = () =>
        window.dispatchEvent(new CustomEvent("app-scroll-to-tab", { detail: newTab }));

      // When leaving an overlay the snap-container transitions from display:none → flex.
      // We must wait for React to re-render so container.clientWidth > 0 before scrolling.
      if (OVERLAY_TABS.includes(prevTab)) {
        requestAnimationFrame(() => requestAnimationFrame(doScroll));
      } else {
        doScroll();
      }
    }

    if (viewState !== undefined && viewState !== null) {
        window.dispatchEvent(new CustomEvent<NavViewState>("app-nav-viewing", { detail: viewState }));
    }

    const isAuxiliaryNavState =
      !!viewState &&
      typeof viewState === "object" &&
      !("parsed" in viewState) &&
      !("form" in viewState);
    setNavState(isAuxiliaryNavState ? (viewState as NavViewStateRecord) : null);

    if (OVERLAY_TABS.includes(newTab)) {
      const resolvedSource =
        newTab === "results" && resultsBackTargetRef.current
          ? resultsBackTargetRef.current
          : prevTab;
      setOverlaySourceTab(resolvedSource);
      setOverlayBaseTab(
        SWIPE_TAB_ORDER.includes(resolvedSource)
          ? resolvedSource
          : overlayBaseTabRef.current ?? lastCenterTab.current
      );
    } else {
      setOverlaySourceTab(null);
      setOverlayBaseTab(null);
    }

    if (newTab !== "results") setResultsBackTarget(null);
    if (newTab === "input") setInputMounted(true);
    if (newTab === "dashboard" || newTab === "input") lastCenterTab.current = newTab;
    if (newTab === "input") inputBackTarget.current = "dashboard";

    window.history.pushState({ tab: newTab, viewingTs: viewState?.ts }, "", "");
  }, []);

  // SyncTab is purely for the IntersectionObserver to tell the state:
  // "Hey, the user physically scrolled here, light up this icon"
  const syncTab = useCallback((newTab: AppTab) => {
    setTab(prev => {
      if (prev === newTab) return prev;
      if (newTab === "input") setInputMounted(true);
      if (newTab === "dashboard" || newTab === "input") lastCenterTab.current = newTab;
      setOverlaySourceTab(null);
      setOverlayBaseTab(null);
      setNavState(null);
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
        if (st.tab) {
          const nextTab = st.tab as AppTab;
          setTab(nextTab);
          setNavState(null);
          if (!OVERLAY_TABS.includes(nextTab)) {
            setOverlaySourceTab(null);
            setOverlayBaseTab(null);
          }
        }
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const value: NavigationContextValue = {
    tab,
    setTab,
    navTo,
    navState,
    clearNavState,
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
    rehydrateNavigation,
    resetNavigationState,
    showGuide,
    setShowGuide,
    inputMounted,
    setInputMounted,
    lastCenterTab,
    inputBackTarget,
    overlaySourceTab,
    overlayBaseTab,
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
