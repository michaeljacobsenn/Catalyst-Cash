  import { Suspense,lazy,useCallback,useEffect,useMemo,useRef,useState } from "react";
  import AppShellHeader, { SkipToContentLink } from "./modules/appShell/AppShellHeader.js";
  import {
    AiConsentModal,
    AppFrame,
    FactoryResetMask,
    LoadingScreen,
    OfflineBanner,
    SimulatedNotificationBanner,
    TabFallback,
  } from "./modules/appShell/AppShellOverlays.js";
  import {
    useAutoICloudBackup,
    useBootServices,
    useClipboardAuditImport,
    useHeaderChrome,
    useHouseholdSync,
    useLoadReadyHaptic,
    useNotificationDeepLinks,
    usePrivacyModeMirror,
    useRecoverableAuditLifecycle,
    useRecoveryVaultSync,
    useSimulatedGeofenceNotification,
    useAppForegroundRefresh,
    useDeepLinkRouting,
  } from "./modules/appShell/useAppShellRuntime.js";
  import { refreshAppState as refreshAppStateModel,resetAppState } from "./modules/appRefreshModel.js";
  import { applyManualMoveCompletion } from "./modules/manualMoveCompletion.js";
  import { getMoveAssignmentOptions } from "./modules/moveSemantics.js";
  import { T } from "./modules/constants.js";
  import { useAudit } from "./modules/contexts/AuditContext.js";
  import type { AppTab } from "./modules/contexts/NavigationContext.js";
  import { useNavigation } from "./modules/contexts/NavigationContext.js";
  import { OverlayProvider } from "./modules/contexts/OverlayContext.js";
  import { usePortfolio } from "./modules/contexts/PortfolioContext.js";
  import { useSecurity } from "./modules/contexts/SecurityContext.js";
  import { useSettings } from "./modules/contexts/SettingsContext.js";
  import { ThemeProvider } from "./modules/contexts/ThemeContext.js";
  import { getDemoAuditPayload } from "./modules/demoAudit.js";
  import { installGlobalHandlers } from "./modules/errorReporter.js";
  import { normalizeAppError } from "./modules/appErrors.js";
  import { haptic } from "./modules/haptics.js";
  import { log } from "./modules/logger.js";
  import BottomNavBar from "./modules/navigation/BottomNavBar.js";
  import ScrollSnapContainer from "./modules/navigation/ScrollSnapContainer.js";
  import TabRenderer from "./modules/navigation/TabRenderer.js";
  import { useOnlineStatus } from "./modules/onlineStatus.js";
  import { deleteSecureItem } from "./modules/secureStore.js";
  import "./modules/tabs/DashboardTab.css"; // Global animations, skeleton loaders, utility classes
  import { useToast } from "./modules/Toast.js";
  import { GlobalStyles,useGlobalHaptics } from "./modules/ui.js";
  import { db } from "./modules/utils.js";
  import type { AuditRecord,BankAccount,Card as CardType,ParsedAudit,PlaidInvestmentAccount,Renewal } from "./types/index.js";
// Payday reminder scheduling is handled in SettingsContext
installGlobalHandlers();
const LockScreen = lazy(() => import("./modules/LockScreen.js"));
const SetupWizard = lazy(() => import("./modules/tabs/SetupWizard.js"));
const loadNotificationPrePrompt = () => import("./modules/tabs/NotificationPrePrompt.js");
const NotificationPrePrompt = lazy(loadNotificationPrePrompt);
const loadOverlayManager = () => import("./modules/overlays/OverlayManager.js");
const OverlayManager = lazy(loadOverlayManager);

type AppToastApi = Window["toast"];

interface AppFinancialConfigExtras {
  valuations?: Record<string, unknown>;
  isDemoConfig?: boolean;
  _preDemoSnapshot?: Record<string, unknown>;
}

function CatalystCashShell() {
  const toast = useToast();
  const appToast = toast as AppToastApi | undefined;
  useEffect(() => {
    if (appToast) window.toast = appToast;
  }, [appToast]);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const warmup = () => {
      void Promise.allSettled([loadOverlayManager(), loadNotificationPrePrompt()]);
    };
    const idleId =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(warmup, { timeout: 1800 })
        : window.setTimeout(warmup, 320);
    return () => {
      if (typeof idleId !== "number" && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
        return;
      }
      window.clearTimeout(idleId as number);
    };
  }, []);
  const online = useOnlineStatus();
  useGlobalHaptics(); // Auto-haptic on every button tap

  const {
    appPasscode,
    isLocked,
    privacyMode,
    setPrivacyMode,
    appleLinkedId,
    isSecurityReady,
    rehydrateSecurity,
  } = useSecurity();
  const {
    aiProvider,
    aiModel,
    persona,
    personalRules,
    setPersonalRules,
    autoBackupInterval,
    setAiConsent,
    showAiConsent,
    setShowAiConsent,
    showNotifPrePrompt,
    dismissNotifPrePrompt,
    financialConfig,
    setFinancialConfig,
    themeTick,
    isSettingsReady,
    rehydrateSettings,
  } = useSettings();
  const extendedFinancialConfig = financialConfig as typeof financialConfig & AppFinancialConfigExtras;
  const {
    cards,
    setCards,
    bankAccounts,
    setBankAccounts,
    renewals,
    setRenewals,
    cardCatalog,
    cardAnnualFees,
    isPortfolioReady,
    rehydratePortfolio,
  } = usePortfolio();
  const {
    current,
    setCurrent,
    history,
    setHistory,
    moveChecks,
    setMoveChecks,
    loading,
    streamText,
    elapsed,
    auditLoadingPhase,
    viewing,
    setViewing,
    trendContext,
    instructionHash,
    setInstructionHash,
    handleSubmit,
    handleCancelAudit,
    abortActiveAudit,
    clearAll,
    isAuditReady,
    handleManualImport,
    isTest,
    recoverableAuditDraft,
    activeAuditDraftView,
    checkRecoverableAuditDraft,
    markRecoverableAuditDraftPrompted,
    openRecoverableAuditDraft,
    dismissRecoverableAuditDraft,
    rehydrateAudit,
  } = useAudit();
  const {
    tab,
    navTo,
    syncTab,
    resultsBackTarget,
    setResultsBackTarget,
    setupReturnTab,
    setSetupReturnTab,
    onboardingComplete,
    showGuide,
    setShowGuide,
    lastCenterTab,
    overlaySourceTab,
    overlayBaseTab,
    abortActiveChatStream,
    rehydrateNavigation,
    resetNavigationState,
    SWIPE_TAB_ORDER,
  } = useNavigation();

  const topBarRef = useRef<HTMLElement | null>(null);
  const [headerHidden, setHeaderHidden] = useState(false);
  const lastScrollY = useRef(0);
  const [transactionFeedTab, setTransactionFeedTab] = useState<AppTab | null>(null);
  const [chatInitialPrompt, setChatInitialPrompt] = useState<string | null>(null);
  const renderedBaseTab: AppTab = SWIPE_TAB_ORDER.includes(tab)
    ? tab
    : overlayBaseTab && SWIPE_TAB_ORDER.includes(overlayBaseTab)
      ? overlayBaseTab
      : SWIPE_TAB_ORDER.includes(lastCenterTab.current)
        ? lastCenterTab.current
        : "dashboard";
  const showShellHeader = SWIPE_TAB_ORDER.includes(renderedBaseTab);

  const clearShellRefreshState = useCallback(() => {
    setTransactionFeedTab(null);
    setChatInitialPrompt(null);
    setHeaderHidden(false);
    lastScrollY.current = 0;
  }, []);

  const refreshAppState = useCallback(
    async (nextTab: AppTab = "dashboard") => {
      await refreshAppStateModel({
        rehydrateSettings,
        rehydrateSecurity,
        rehydratePortfolio,
        rehydrateAudit,
        rehydrateNavigation,
        resetNavigationState,
        clearUiState: clearShellRefreshState,
        nextTab,
      });
    },
    [
      clearShellRefreshState,
      rehydrateAudit,
      rehydrateNavigation,
      rehydratePortfolio,
      rehydrateSecurity,
      rehydrateSettings,
      resetNavigationState,
    ]
  );

  function mergeUniqueById<T extends { id?: string | null }>(existing: T[] = [], incoming: T[] = []): T[] {
    const ids = new Set(existing.map((item) => item.id).filter(Boolean));
    return [...existing, ...incoming.filter((item) => item.id && !ids.has(item.id))];
  }

  const handleConnectAccount = async () => {
    try {
      const {
        connectBank,
        autoMatchAccounts,
        saveConnectionLinks,
        fetchBalancesAndLiabilities,
        applyBalanceSync,
        reviewPlaidDuplicateCandidates,
      } = await import("./modules/plaid.js");

      await connectBank(
        async connection => {
          try {
            const plaidInvestments = financialConfig?.plaidInvestments || [];
            const {
              newCards,
              newBankAccounts,
              newPlaidInvestments,
              duplicateCandidates = [],
            } = autoMatchAccounts(
              connection,
              cards,
              bankAccounts,
              cardCatalog as never,
              plaidInvestments
            );
            const duplicateReview = reviewPlaidDuplicateCandidates({
              connection,
              newCards,
              newBankAccounts,
              duplicateCandidates,
              cards,
              bankAccounts,
            });
            await saveConnectionLinks(connection);

            const allCards = mergeUniqueById<CardType>(cards, duplicateReview.newCards);
            const allBanks = mergeUniqueById<BankAccount>(bankAccounts, duplicateReview.newBankAccounts);
            const allInvests = mergeUniqueById<PlaidInvestmentAccount>(
              plaidInvestments,
              newPlaidInvestments as PlaidInvestmentAccount[]
            );
            setCards(allCards);
            setBankAccounts(allBanks);
            if (newPlaidInvestments.length > 0) {
              setFinancialConfig({ type: "SET_FIELD", field: "plaidInvestments", value: allInvests });
            }

            // Optional: try to fetch balances
            try {
              const refreshed = await fetchBalancesAndLiabilities(connection.id);
              if (refreshed) {
                const syncData = applyBalanceSync(refreshed, allCards, allBanks, allInvests) as {
                  updatedCards: typeof allCards;
                  updatedBankAccounts: typeof allBanks;
                  updatedPlaidInvestments?: typeof allInvests;
                };
                setCards(syncData.updatedCards);
                setBankAccounts(syncData.updatedBankAccounts);
                if (syncData.updatedPlaidInvestments) {
                  setFinancialConfig({
                    type: "SET_FIELD",
                    field: "plaidInvestments",
                    value: syncData.updatedPlaidInvestments,
                  });
                }
                await saveConnectionLinks(refreshed);
              }
            } catch (syncErr) {
              console.warn("[Plaid] Post-link balance sync skipped:", syncErr);
            }

            window.toast?.success?.("Bank linked successfully!");
            if (duplicateReview.ambiguousCount > 0) {
              window.toast?.info?.(
                `${duplicateReview.ambiguousCount} possible duplicate account${duplicateReview.ambiguousCount === 1 ? "" : "s"} were kept separate for review in Portfolio.`
              );
            }
          } catch (err) {
            const failure = normalizeAppError(err, { context: "sync" });
            log.error("plaid", "Post-link processing failed", { error: failure.rawMessage, kind: failure.kind });
            window.toast?.info?.("Bank linked. If balances have not updated yet, try Sync again in a moment.");
          }
        },
        err => {
          if (window.toast) {
            const failure = normalizeAppError(err, { context: "sync" });
            const msg = failure.userMessage || "Failed to link bank";
            if (msg === "cancelled") return;
            window.toast.error?.(msg);
          }
        }
      );
    } catch {
      window.toast?.error?.("Plaid unavailable.");
    }
  };

  // ── Shared swipe gesture handler (used by main scroll, input pane, chat pane) ──
  const ready = isSecurityReady && isSettingsReady && isPortfolioReady && isAuditReady;

  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => {
      log.warn("boot", "Startup still waiting on readiness gates", {
        isSecurityReady,
        isSettingsReady,
        isPortfolioReady,
        isAuditReady,
        onboardingComplete,
      });
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [ready, isSecurityReady, isSettingsReady, isPortfolioReady, isAuditReady, onboardingComplete]);

  const [proEnabled, setProEnabled] = useState(false);
  useBootServices(setProEnabled);
  useAppForegroundRefresh(ready, refreshAppState);
  useDeepLinkRouting(navTo);
  useNotificationDeepLinks(navTo);

  const { simulatedNotification, dismissSimulatedNotification } = useSimulatedGeofenceNotification(
    cards,
    extendedFinancialConfig.valuations
  );
  useAutoICloudBackup({
    ready,
    appleLinkedId,
    autoBackupInterval,
    history,
    renewals,
    cards,
    financialConfig: financialConfig as unknown as Record<string, unknown>,
    personalRules,
    appPasscode,
  });
  const { handleRestoreComplete, handleHouseholdSyncConfigured } = useHouseholdSync({
    ready,
    online,
    history,
    renewals,
    cards,
    financialConfig: financialConfig as unknown as Record<string, unknown>,
    personalRules,
    refreshAppState,
    toast,
  });
  useRecoveryVaultSync({
    ready,
    online,
    history,
    renewals,
    cards,
    financialConfig: financialConfig as unknown as Record<string, unknown>,
    personalRules,
  });
  usePrivacyModeMirror(privacyMode);
  useHeaderChrome({
    tab,
    showShellHeader,
    topBarRef,
    setHeaderHidden,
    lastScrollY,
  });
  useClipboardAuditImport({ history, handleManualImport, toast });

  const toggleMove = async i => {
    haptic.light();
    if (viewing) {
      const updatedChecks = { ...(viewing.moveChecks || {}), [i]: !(viewing.moveChecks || {})[i] };
      const updatedViewing = { ...viewing, moveChecks: updatedChecks };
      setViewing(updatedViewing);
      const nh = history.map(a => (a.ts === viewing.ts ? updatedViewing : a));
      setHistory(nh);
      await db.set("audit-history", nh);
    } else {
      const moveKey = String(i);
      const isCurrentlyChecked = Boolean(moveChecks[i] || moveChecks[moveKey]);
      const alreadyApplied = Boolean(current?.appliedMoveEffects?.[moveKey]);
      const currentAssignment = current?.moveAssignments?.[moveKey] || null;
      if (isCurrentlyChecked && alreadyApplied) {
        window.toast?.info?.("This move already updated your manual balances. Edit Portfolio or Settings if you need to change it.");
        return;
      }

      let nextAppliedMoveEffects = current?.appliedMoveEffects || {};
      const nextChecked = !isCurrentlyChecked;
      if (current && nextChecked && !current.isTest) {
        const move = current.parsed?.moveItems?.[i] || null;
        const moveText = move?.text || "";
        const assignmentOptions = getMoveAssignmentOptions({
          move,
          cards,
          bankAccounts,
          financialConfig,
          manualOnly: true,
          assignment: currentAssignment,
        });
        if (assignmentOptions.targetOptions.length > 1 && !currentAssignment?.targetAccountId) {
          window.toast?.info?.("Choose where this move should land before checking it off.");
          return;
        }
        if (assignmentOptions.sourceOptions.length > 1 && !currentAssignment?.sourceAccountId) {
          window.toast?.info?.("Choose the funding source before checking this move off.");
          return;
        }
        const effect = applyManualMoveCompletion({
          moveText,
          move,
          assignment: currentAssignment,
          cards,
          bankAccounts,
          financialConfig,
        });
        if (effect.applied) {
          if (effect.updatedCards !== cards) setCards(effect.updatedCards);
          if (effect.updatedBankAccounts !== bankAccounts) setBankAccounts(effect.updatedBankAccounts);
          if (effect.updatedFinancialConfig !== financialConfig) setFinancialConfig(effect.updatedFinancialConfig);
          nextAppliedMoveEffects = { ...nextAppliedMoveEffects, [moveKey]: true };
          window.toast?.success?.(effect.summary || "Updated manual balances.");
        }
      }

      const n = { ...moveChecks, [i]: nextChecked };
      setMoveChecks(n);
      db.set("move-states", n);
      if (current) {
        const updatedCurrent = { ...current, moveChecks: n, appliedMoveEffects: nextAppliedMoveEffects };
        setCurrent(updatedCurrent);
        db.set("current-audit", updatedCurrent);
        const nh = history.map(a => (a.ts === current.ts ? updatedCurrent : a));
        setHistory(nh);
        db.set("audit-history", nh);
      }
    }
  };

  const updateMoveAssignment = async (index, patch) => {
    if (!current || current.isTest) return;
    const moveKey = String(index);
    const nextAssignments = { ...(current.moveAssignments || {}) };
    const nextValue = {
      ...(nextAssignments[moveKey] || {}),
      ...patch,
    };
    if (!nextValue.sourceAccountId) delete nextValue.sourceAccountId;
    if (!nextValue.targetAccountId) delete nextValue.targetAccountId;
    if (Object.keys(nextValue).length === 0) delete nextAssignments[moveKey];
    else nextAssignments[moveKey] = nextValue;

    const updatedCurrent = { ...current, moveAssignments: nextAssignments };
    setCurrent(updatedCurrent);
    await db.set("current-audit", updatedCurrent);
    const nextHistory = history.map(a => (a.ts === current.ts ? updatedCurrent : a));
    setHistory(nextHistory);
    await db.set("audit-history", nextHistory);
  };

  // ═══════════════════════════════════════════════════════════════
  // GUIDED FIRST AUDIT — pre-loaded sample data so users see the full value prop
  // Upgraded: lights up ALL 15+ dashboard sections with rich synthetic data
  // ═══════════════════════════════════════════════════════════════
  const handleDemoAudit = async () => {
    const payload = getDemoAuditPayload(financialConfig, history);
    if (!payload.audit.parsed) {
      toast.error("Demo parsing failed");
      return;
    }

    const { audit, nh, demoConfig, demoCards, demoRenewals } = payload;
    const safeAuditDate = audit.date ?? new Date().toISOString().split("T")[0] ?? "";
    const safeAudit = {
      ...audit,
      parsed: audit.parsed as ParsedAudit,
      date: safeAuditDate,
      form: {
        ...audit.form,
        date: audit.form?.date ?? safeAuditDate,
      },
    } as AuditRecord;
    const safeRenewals: Renewal[] = demoRenewals.map((renewal) => {
      const { nextDue, ...rest } = renewal;
      return nextDue ? { ...rest, nextDue } : rest;
    });

    // ── 6. SET ALL REACT STATE SYNCHRONOUSLY (before awaits) ───
    // This ensures the dashboard renders immediately with full data
    setCurrent(safeAudit);
    setViewing(null);
    setHistory(nh);
    setFinancialConfig(demoConfig);
    if (cards.length === 0) setCards(demoCards);
    if ((renewals || []).length === 0) setRenewals(safeRenewals);

    // ── 7. PERSIST TO DB (async, non-blocking) ─────────────────
    await db.set("current-audit", safeAudit);
    await db.set("audit-history", nh);

    // Seed demo badges
    const existingBadges = (await db.get("unlocked-badges")) || {};
    const demoBadges = {
      ...existingBadges,
      first_audit: existingBadges.first_audit || Date.now(),
      profile_complete: existingBadges.profile_complete || Date.now(),
      score_80: existingBadges.score_80 || Date.now(),
      savings_5k: existingBadges.savings_5k || Date.now(),
      savings_10k: existingBadges.savings_10k || Date.now(),
      net_worth_positive: existingBadges.net_worth_positive || Date.now(),
      investor: existingBadges.investor || Date.now(),
    };
    await db.set("unlocked-badges", demoBadges);
    if (cards.length === 0) await db.set("card-portfolio", demoCards);
    if ((renewals || []).length === 0) await db.set("renewals", demoRenewals);

    toast.success("🎓 Demo audit loaded — explore the full experience!");
    haptic.success();
  };

  const handleRefreshDashboard = async () => {
    // Remove all demo/test AND synthetic demo-history audits
    const cleanedHistory = history.filter(a => !a.isTest && !a.isDemoHistory);
    setHistory(cleanedHistory);
    await db.set("audit-history", cleanedHistory);

    // Find the most recent real (non-test) audit
    const realAudit = cleanedHistory.length > 0 ? cleanedHistory[0] : null;
    if (realAudit) {
      setCurrent(realAudit);
      setMoveChecks(realAudit.moveChecks || {});
      await db.set("current-audit", realAudit);
      await db.set("move-states", realAudit.moveChecks || {});
      toast.success("Dashboard restored to your latest real audit");
    } else {
      setCurrent(null);
      setMoveChecks({});
      await db.del("current-audit");
      await db.del("move-states");
      toast.success("Demo cleared — run your first real audit!");
    }

    // Restore pre-demo financialConfig if we overlaid one
    if (extendedFinancialConfig.isDemoConfig && extendedFinancialConfig._preDemoSnapshot) {
      const restored = { ...extendedFinancialConfig._preDemoSnapshot };
      delete restored.isDemoConfig;
      delete restored._preDemoSnapshot;
      setFinancialConfig(restored);
    }

    // Clean demo-seeded badges (remove only the ones we added that weren't already there)
    // Only remove badges that were seeded during THIS demo session (timestamp matches)
    // For simplicity, keep all badges — users may have earned some legitimately
    // Just let evaluateBadges re-check on next real audit

    // Remove demo cards/renewals if they're the demo ones
    const currentCards = cards || [];
    if (currentCards.some(c => c.id?.startsWith("demo-"))) {
      const realCards = currentCards.filter(c => !c.id?.startsWith("demo-"));
      setCards(realCards);
      await db.set("card-portfolio", realCards);
    }
    const currentRenewals = renewals || [];
    if (currentRenewals.some(r => r.id?.startsWith("demo-"))) {
      const realRenewals = currentRenewals.filter(r => !r.id?.startsWith("demo-"));
      setRenewals(realRenewals);
      await db.set("renewals", realRenewals);
    }

    haptic.medium();
  };

  const [isResetting, setIsResetting] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const factoryReset = async () => {
    haptic.warning();
    toast.success("App securely erased. Resetting...");
    setIsResetting(true); // Unmounts SettingsTab immediately

    // Wait for any trailing debounces to flush from React to the DB before wiping
    resetTimerRef.current = setTimeout(async () => {
      try {
        const { clearHouseholdCredentials } = await import("./modules/householdSecrets.js");
        await resetAppState({
          clearDb: async () => {
            await db.clear();
            await db.del("onboarding-complete");
          },
          deleteSecrets: [
            () => deleteSecureItem("app-passcode"),
            () => deleteSecureItem("apple-linked-id"),
            () => deleteSecureItem("api-key"),
            () => deleteSecureItem("api-key-openai"),
            () => clearHouseholdCredentials(),
          ],
          refresh: async () => {
            await refreshAppState("dashboard");
            setIsResetting(false);
          },
        });
      } catch (resetError) {
        const failure = normalizeAppError(resetError, { context: "security" });
        log.error("security", "Factory reset failed", { error: failure.rawMessage, kind: failure.kind });
        setIsResetting(false);
        toast.error("Catalyst couldn't complete the reset. Please try again.");
      }
    }, 800);
  };
  // Cleanup factory reset timer on unmount
  useEffect(
    () => () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    },
    []
  );


  const inputFormDb = useMemo(
    () => ({
      get: db.get,
      set: async (key, value) => {
        await db.set(key, value);
      },
      del: db.del,
      keys: db.keys,
      clear: db.clear,
    }),
    []
  );


  const display = viewing || current;
  const displayMoveChecks = viewing ? viewing.moveChecks || {} : moveChecks;

  const handleSnapPageScroll = useCallback(() => {
    // Keep the shared shell header stable on finance surfaces.
    // Velocity-based hide/show created inconsistent behavior on fast swipes.
  }, []);

  useRecoverableAuditLifecycle({
    recoverableAuditDraft,
    navTo,
    openRecoverableAuditDraft,
    setResultsBackTarget,
    toast,
    abortActiveAudit,
    abortActiveChatStream,
    checkRecoverableAuditDraft,
    markRecoverableAuditDraftPrompted,
  });
  useLoadReadyHaptic(ready);

  if (!ready) return <LoadingScreen />;

  if (!onboardingComplete)
    return (
      <>
        <GlobalStyles />
        <Suspense fallback={<TabFallback />}>
          <SetupWizard />
        </Suspense>
      </>
    );

  if (isLocked)
    return (
      <div
        style={{
          width: "100%",
          height: "100dvh",
          maxWidth: 800,
          margin: "0 auto",
          background: T.bg.base,
          fontFamily: T.font.sans,
          overflow: "hidden",
        }}
      >
        <GlobalStyles />
        <Suspense fallback={<TabFallback />}>
          <LockScreen />
        </Suspense>
      </div>
    );

  return (
    <AppFrame>
      <AiConsentModal
        open={showAiConsent}
        onCancel={() => setShowAiConsent(false)}
        onConfirm={async () => {
          setAiConsent(true);
          setShowAiConsent(false);
          await db.set("ai-consent-accepted", true);
          toast.success("Consent saved");
        }}
      />
      {showNotifPrePrompt && (
        <Suspense fallback={null}>
          <NotificationPrePrompt
            onAllow={() => void dismissNotifPrePrompt(true)}
            onSkip={() => void dismissNotifPrePrompt(false)}
          />
        </Suspense>
      )}
      <SkipToContentLink />
      {showShellHeader && (
        <AppShellHeader
          key={`shell-header-${themeTick}`}
          tab={renderedBaseTab}
          topBarRef={topBarRef}
          headerHidden={headerHidden}
          showGuide={showGuide}
          setShowGuide={setShowGuide}
          privacyMode={privacyMode}
          setPrivacyMode={setPrivacyMode}
          navTo={navTo}
        />
      )}
      {!online && <OfflineBanner />}

      <ScrollSnapContainer
        key={`snap-${themeTick}`}
        ready={ready}
        onboardingComplete={onboardingComplete}
        tab={renderedBaseTab}
        syncTab={syncTab}
        SWIPE_TAB_ORDER={SWIPE_TAB_ORDER}
        hidden={tab === "settings" || tab === "results" || tab === "history" || tab === "guide" || tab === "input"}
      >
      <TabRenderer
          key={`tabs-${themeTick}`}
          SWIPE_TAB_ORDER={SWIPE_TAB_ORDER}
          activeTab={renderedBaseTab}
          themeTick={themeTick}
          proEnabled={proEnabled}
          privacyMode={privacyMode}
          toast={toast}
          navTo={navTo}
          handleRefreshDashboard={handleRefreshDashboard}
          handleDemoAudit={handleDemoAudit}
          setTransactionFeedTab={setTransactionFeedTab}
          chatInitialPrompt={chatInitialPrompt}
          setChatInitialPrompt={setChatInitialPrompt}
          onPageScroll={handleSnapPageScroll}
        />
      </ScrollSnapContainer>

      <OverlayProvider
        tab={tab}
        showGuide={showGuide}
        setShowGuide={setShowGuide}
        transactionFeedTab={transactionFeedTab}
        setTransactionFeedTab={setTransactionFeedTab}
        proEnabled={proEnabled}
        loading={loading}
        streamText={streamText}
        elapsed={elapsed}
        auditLoadingPhase={auditLoadingPhase}
        isTest={isTest}
        aiProvider={aiProvider}
        aiModel={aiModel}
        activeAuditDraftView={activeAuditDraftView}
        resultsBackTarget={resultsBackTarget}
        setResultsBackTarget={setResultsBackTarget}
        display={display}
        displayMoveChecks={displayMoveChecks}
        trendContextLength={trendContext?.length || 0}
        setupReturnTab={setupReturnTab}
        setSetupReturnTab={setSetupReturnTab}
        lastCenterTab={lastCenterTab}
        overlaySourceTab={overlaySourceTab}
        overlayBaseTab={overlayBaseTab}
        cards={cards}
        bankAccounts={bankAccounts}
        renewals={renewals}
        cardAnnualFees={cardAnnualFees}
        current={current}
        financialConfig={financialConfig}
        personalRules={personalRules}
        setPersonalRules={setPersonalRules}
        persona={persona}
        instructionHash={instructionHash}
        setInstructionHash={setInstructionHash}
      >
        <Suspense fallback={null}>
          <OverlayManager
            handleConnectAccount={handleConnectAccount}
            handleCancelAudit={handleCancelAudit}
            dismissRecoverableAuditDraft={dismissRecoverableAuditDraft}
            navTo={navTo}
            toggleMove={toggleMove}
            updateMoveAssignment={updateMoveAssignment}
            toast={toast}
            clearAll={clearAll}
            factoryReset={factoryReset}
            onRestoreComplete={handleRestoreComplete}
            onHouseholdSyncConfigured={handleHouseholdSyncConfigured}
            handleRefreshDashboard={handleRefreshDashboard}
            handleSubmit={handleSubmit}
            handleManualImport={handleManualImport}
            setFinancialConfig={setFinancialConfig}
            inputFormDb={inputFormDb}
            themeTick={themeTick}
          />
        </Suspense>
      </OverlayProvider>

      <BottomNavBar
        key={`bottom-nav-${themeTick}`}
        tab={tab}
        navTo={navTo}
        loading={loading}
        showGuide={showGuide}
        hidden={!SWIPE_TAB_ORDER.includes(tab) || !!transactionFeedTab}
        transactionFeedTab={transactionFeedTab}
        setTransactionFeedTab={setTransactionFeedTab}
      />

      <FactoryResetMask active={isResetting} />
      <SimulatedNotificationBanner
        notification={simulatedNotification}
        onDismiss={dismissSimulatedNotification}
      />
    </AppFrame>
  );
}

export default function CatalystCash() {
  return (
    <ThemeProvider>
      <CatalystCashShell />
    </ThemeProvider>
  );
}
