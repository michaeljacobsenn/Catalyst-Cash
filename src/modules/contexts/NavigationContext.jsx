import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { db } from '../utils.js';
import { haptic } from '../haptics.js';

const NavigationContext = createContext(null);

export function NavigationProvider({ children }) {
    const [tab, setTab] = useState("dashboard");
    const [resultsBackTarget, setResultsBackTarget] = useState(null);
    const [setupReturnTab, setSetupReturnTab] = useState(null);
    const [onboardingComplete, setOnboardingComplete] = useState(true); // true until proven otherwise
    const [showGuide, setShowGuide] = useState(false);
    const [inputMounted, setInputMounted] = useState(false);

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

    const navTo = (newTab, viewState = null) => {
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
    };

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
        resultsBackTarget, setResultsBackTarget,
        setupReturnTab, setSetupReturnTab,
        onboardingComplete, setOnboardingComplete,
        showGuide, setShowGuide,
        inputMounted, setInputMounted,
        lastCenterTab, inputBackTarget
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
