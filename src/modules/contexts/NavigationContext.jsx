import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../utils.js';
import { haptic } from '../haptics.js';

const NavigationContext = createContext(null);

// ── Swipeable tab order ──
// Mirrors the bottom nav bar order exactly: Audit | Ask AI | Dashboard | Expenses | Accounts
const SWIPE_TAB_ORDER = ["input", "chat", "dashboard", "renewals", "cards"];

export function NavigationProvider({ children }) {
    const [tab, setTab] = useState("dashboard");
    const [resultsBackTarget, setResultsBackTarget] = useState(null);
    const [setupReturnTab, setSetupReturnTab] = useState(null);
    const [onboardingComplete, setOnboardingComplete] = useState(true); // true until proven otherwise
    const [showGuide, setShowGuide] = useState(false);
    const [inputMounted, setInputMounted] = useState(false);

    // ── Swipe animation direction: "left" | "right" | null ──
    const [swipeAnimClass, setSwipeAnimClass] = useState("tab-transition");

    const lastCenterTab = useRef("dashboard");
    const inputBackTarget = useRef("dashboard");

    // Onboarding initialization
    useEffect(() => {
        const initOnboarding = async () => {
            const obComplete = await db.get("onboarding-complete");
            const finConf = await db.get("financial-config");

            if (obComplete || (finConf && !finConf._fromSetupWizard && Object.keys(finConf).length > 5)) {
                setOnboardingComplete(true);
                if (!obComplete) db.set("onboarding-complete", true);
            } else {
                setOnboardingComplete(false);
            }
        };
        initOnboarding();
    }, []);

    const navTo = useCallback((newTab, viewState = null) => {
        setTab(newTab);

        // Emit a custom event so AuditContext can pick up the viewState if needed
        if (viewState !== undefined) {
            window.dispatchEvent(new CustomEvent('app-nav-viewing', { detail: viewState }));
        }

        if (newTab !== "results") setResultsBackTarget(null);
        if (newTab === "input") setInputMounted(true);
        if (newTab === "dashboard" || newTab === "input") lastCenterTab.current = newTab;
        if (newTab === "input") inputBackTarget.current = "dashboard";

        window.history.pushState({ tab: newTab, viewingTs: viewState?.ts }, "", "");
        haptic.light();
    }, []);

    // ── Swipe navigation: move to adjacent tab in SWIPE_TAB_ORDER ──
    const swipeToTab = useCallback((direction) => {
        // direction: "left" = finger moved left → go RIGHT in tab order
        //            "right" = finger moved right → go LEFT in tab order
        setTab(prev => {
            const effectiveTab = prev === "settings" ? lastCenterTab.current : prev;
            const idx = SWIPE_TAB_ORDER.indexOf(effectiveTab);
            if (idx === -1) return prev; // current tab not swipeable (results, settings)

            let nextIdx;
            if (direction === "left") {
                nextIdx = idx + 1;
                if (nextIdx >= SWIPE_TAB_ORDER.length) return prev; // already at rightmost
            } else {
                nextIdx = idx - 1;
                if (nextIdx < 0) return prev; // already at leftmost
            }

            const nextTab = SWIPE_TAB_ORDER[nextIdx];

            // Set directional animation class BEFORE the tab changes
            setSwipeAnimClass(direction === "left" ? "tab-slide-right" : "tab-slide-left");

            // Update refs & state for input tab
            if (nextTab === "input") setInputMounted(true);
            if (nextTab === "dashboard" || nextTab === "input") lastCenterTab.current = nextTab;

            // Push browser history
            window.history.pushState({ tab: nextTab, viewingTs: null }, "", "");
            haptic.light();

            return nextTab;
        });
    }, []);

    // Reset animation class after animation completes so next non-swipe navigation uses default
    useEffect(() => {
        if (swipeAnimClass !== "tab-transition") {
            const timer = setTimeout(() => setSwipeAnimClass("tab-transition"), 350);
            return () => clearTimeout(timer);
        }
    }, [swipeAnimClass]);

    useEffect(() => {
        window.history.replaceState({ tab: "dashboard", viewingTs: null }, "", "");

        const onPopState = (e) => {
            const st = e.state;
            if (st) {
                if (st.tab) setTab(st.tab);
            }
        };
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, []);

    const value = {
        tab, setTab,
        navTo,
        swipeToTab,
        swipeAnimClass, setSwipeAnimClass,
        resultsBackTarget, setResultsBackTarget,
        setupReturnTab, setSetupReturnTab,
        onboardingComplete, setOnboardingComplete,
        showGuide, setShowGuide,
        inputMounted, setInputMounted,
        lastCenterTab, inputBackTarget,
        SWIPE_TAB_ORDER
    };

    return (
        <NavigationContext.Provider value={value}>
            {children}
        </NavigationContext.Provider>
    );
}

export const useNavigation = () => {
    const context = useContext(NavigationContext);
    if (!context) throw new Error("useNavigation must be used within a NavigationProvider");
    return context;
};
