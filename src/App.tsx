  import { App as CapApp } from "@capacitor/app";
  import { Capacitor } from "@capacitor/core";
  import type { FocusEvent as ReactFocusEvent } from "react";
  import { Suspense,lazy,useCallback,useEffect,useMemo,useRef,useState } from "react";
  import { uploadToICloud } from "./modules/cloudSync.js";
  import { APP_VERSION,T } from "./modules/constants.js";
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
  import { haptic } from "./modules/haptics.js";
  import {
    Eye,
    EyeOff,
    Info,
    MapPin,
    Settings,
  } from "./modules/icons";
  import { extractCategoryByKeywords } from "./modules/merchantDatabase.js";
  import BottomNavBar from "./modules/navigation/BottomNavBar.js";
  import ScrollSnapContainer from "./modules/navigation/ScrollSnapContainer.js";
  import TabRenderer from "./modules/navigation/TabRenderer.js";
  import { syncOTAData } from "./modules/ota.js";
  import OverlayManager from "./modules/overlays/OverlayManager.js";
  import { initRevenueCat } from "./modules/revenuecat.js";
  import { getOptimalCard } from "./modules/rewardsCatalog.js";
  import { deleteSecureItem } from "./modules/secureStore.js";
  import { isSecuritySensitiveKey,sanitizePlaidForBackup } from "./modules/securityKeys.js";
  import { getGatingMode,isPro,syncRemoteGatingMode } from "./modules/subscription.js";
  import "./modules/tabs/DashboardTab.css"; // Global animations, skeleton loaders, utility classes
  import { useToast } from "./modules/Toast.js";
  import { GlobalStyles,getTracking,useGlobalHaptics } from "./modules/ui.js";
  import { db } from "./modules/utils.js";
  import type { AuditRecord,BankAccount,Card as CardType,ParsedAudit,PlaidInvestmentAccount,Renewal } from "./types/index.js";
// Payday reminder scheduling is handled in SettingsContext
installGlobalHandlers();
const LockScreen = lazy(() => import("./modules/LockScreen.js"));
const SetupWizard = lazy(() => import("./modules/tabs/SetupWizard.js"));

type AppToastApi = Window["toast"];
const uploadToICloudTyped = uploadToICloud as (payload: unknown, passphrase?: string | null) => Promise<boolean>;

interface AppFinancialConfigExtras {
  valuations?: Record<string, unknown>;
  isDemoConfig?: boolean;
  _preDemoSnapshot?: Record<string, unknown>;
}

interface SimulatedNotification {
  title: string;
  body: string;
  store: string;
}


function useOnline() {
  const [o, setO] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  useEffect(() => {
    const on = () => setO(true),
      off = () => setO(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return o;
}

// Suspense fallback for lazy-loaded tabs — iOS-style skeleton loader
const TabFallback = () => (
  <div className="skeleton-loader" style={{ padding: "20px 16px" }}>
    <div className="skeleton-block" style={{ height: 48, borderRadius: 14 }} />
    <div className="skeleton-block" style={{ height: 120, borderRadius: 16 }} />
    <div style={{ display: "flex", gap: 10 }}>
      <div className="skeleton-block" style={{ height: 80, flex: 1, borderRadius: 14 }} />
      <div className="skeleton-block" style={{ height: 80, flex: 1, borderRadius: 14 }} />
    </div>
    <div className="skeleton-block" style={{ height: 64, borderRadius: 14 }} />
  </div>
);

function CatalystCashShell() {
  const toast = useToast();
  const appToast = toast as AppToastApi | undefined;
  useEffect(() => {
    if (appToast) window.toast = appToast;
  }, [appToast]);
  const online = useOnline();
  useGlobalHaptics(); // Auto-haptic on every button tap

  // Sync remote gating config on boot (anti-downgrade protection) and start OTA Data routines
  useEffect(() => {
    syncRemoteGatingMode();
    syncOTAData();
  }, []);

  const {
    appPasscode,
    isLocked,
    privacyMode,
    setPrivacyMode,
    appleLinkedId,
    isSecurityReady,
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
    financialConfig,
    setFinancialConfig,
    isSettingsReady,
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
    openRecoverableAuditDraft,
    dismissRecoverableAuditDraft,
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
    abortActiveChatStream,
    SWIPE_TAB_ORDER,
  } = useNavigation();

  const topBarRef = useRef<HTMLElement | null>(null);
  const [headerHidden, setHeaderHidden] = useState(false);
  const lastScrollY = useRef(0);
  const headerToggleCooldown = useRef(0);
  const [transactionFeedTab, setTransactionFeedTab] = useState<AppTab | null>(null);
  const [chatInitialPrompt, setChatInitialPrompt] = useState<string | null>(null);
  const lastPromptedAuditDraftRef = useRef<string | null>(null);
  const abortActiveAuditRef = useRef(abortActiveAudit);
  const abortActiveChatStreamRef = useRef(abortActiveChatStream);
  const checkRecoverableAuditDraftRef = useRef(checkRecoverableAuditDraft);
  const surfaceRecoverableAuditPromptRef = useRef<(draft?: typeof recoverableAuditDraft) => void>(() => {});
  const showShellHeader = tab !== "settings" && tab !== "history" && tab !== "results" && tab !== "input";

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
      } = await import("./modules/plaid.js");

      await connectBank(
        async connection => {
          try {
            const plaidInvestments = financialConfig?.plaidInvestments || [];
            const { newCards, newBankAccounts, newPlaidInvestments } = autoMatchAccounts(
              connection,
              cards,
              bankAccounts,
              cardCatalog as never,
              plaidInvestments
            );
            await saveConnectionLinks(connection);

            const allCards = mergeUniqueById<CardType>(cards, newCards);
            const allBanks = mergeUniqueById<BankAccount>(bankAccounts, newBankAccounts);
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
            } catch {
              void 0;
            }

            window.toast?.success?.("Bank linked successfully!");
          } catch (err) {
            console.error("Link err", err);
          }
        },
        err => {
          if (window.toast) {
            const msg = err?.message || "Failed to link bank";
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

  // Pro subscription state — resolved async on mount
  const [proEnabled, setProEnabled] = useState(true);
  useEffect(() => {
    initRevenueCat().then(() => {
      const mode = getGatingMode();
      // "off" = no gating at all, "soft" = show Pro UI but don't block features
      if (mode === "off" || mode === "soft") {
        setProEnabled(true);
        return;
      }
      isPro()
        .then(setProEnabled)
        .catch(() => setProEnabled(false));
    });
  }, []);

  // ── GEO-FENCING SIMULATOR ──
  const [simulatedNotification, setSimulatedNotification] = useState<SimulatedNotification | null>(null);

  useEffect(() => {
    const handleSimulate = (e: Event) => {
      const detail = (e as CustomEvent<{ store?: string }>).detail;
      const store = detail?.store || "Store";
      const categoryStr = extractCategoryByKeywords(store) || "other";
      const optimal = getOptimalCard(cards || [], categoryStr, extendedFinancialConfig.valuations || {});

      let recText = `Open Catalyst to see your best card.`;
      if (optimal && optimal.yield) {
        recText = `Use your ${optimal.cardName} here for ${parseFloat((optimal.yield * 100).toFixed(1))}% back!`;
      }

      setSimulatedNotification({
        title: store + " Nearby",
        body: recText,
        store,
      });
      setTimeout(() => setSimulatedNotification(null), 6000);
    };
    window.addEventListener("simulate-geo-fence", handleSimulate);
    return () => window.removeEventListener("simulate-geo-fence", handleSimulate);
  }, [cards, financialConfig]);

  // ═══════════════════════════════════════════════════════════════

  // Payday reminder scheduling is handled in SettingsContext — no duplicate here

  // ═══════════════════════════════════════════════════════════════
  // iCLOUD AUTO-BACKUP — Syncs all user data to iCloud ubiquity
  // container via native ICloudSyncPlugin. Survives app deletion
  // and restores on new devices with the same Apple ID.
  // ═══════════════════════════════════════════════════════════════
  const iCloudSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!ready || !appleLinkedId) return;
    if (autoBackupInterval === "off") return;

    if (iCloudSyncTimer.current) clearTimeout(iCloudSyncTimer.current);

    iCloudSyncTimer.current = setTimeout(async () => {
      try {
        // Enforce backup schedule
        const lastBackupStr = await db.get("last-backup-ts");
        const lastBackup = lastBackupStr ? Number(lastBackupStr) : 0;
        const now = Date.now();
        const hrs24 = 24 * 60 * 60 * 1000;
        let requiredDeltaMs = 0;

        if (autoBackupInterval === "daily") requiredDeltaMs = hrs24;
        else if (autoBackupInterval === "weekly") requiredDeltaMs = hrs24 * 7;
        else if (autoBackupInterval === "monthly") requiredDeltaMs = hrs24 * 30;

        if (now - lastBackup < requiredDeltaMs) {
          return; // Throttled — schedule not yet met
        }

        const backup = { app: "Catalyst Cash", version: APP_VERSION, exportedAt: new Date().toISOString(), data: {} };
        const keys = await db.keys();
        for (const key of keys) {
          if (isSecuritySensitiveKey(key)) continue; // Never sync security credentials
          const val = await db.get(key);
          if (val !== null) backup.data[key] = val;
        }
        if (!("personal-rules" in backup.data)) {
          backup.data["personal-rules"] = personalRules ?? "";
        }

        // Include sanitized Plaid metadata (no access tokens) for reconnect deduplication
        const plaidConns = await db.get("plaid-connections");
        if (Array.isArray(plaidConns) && plaidConns.length > 0) {
          backup.data["plaid-connections-sanitized"] = sanitizePlaidForBackup(plaidConns);
        }

        const success = await uploadToICloudTyped(backup, appPasscode || null);
        if (success) {
          await db.set("last-backup-ts", now);
          // Settings UI polls this key on mount or relies on local state update which is handled there.
          // We just need it perfectly accurately persisted to the DB on success.
          // success — silent
        }
      } catch (e) {
        console.error("iCloud auto-sync error:", e);
      }
    }, 15000); // 15 second debounce — avoid writing on every keystroke

    return () => {
      if (iCloudSyncTimer.current) clearTimeout(iCloudSyncTimer.current);
    };
  }, [ready, history, renewals, cards, financialConfig, personalRules, appleLinkedId, autoBackupInterval]);

  // ═══════════════════════════════════════════════════════════════
  // HOUSEHOLD CLOUD SYNC — Syncs to Cloudflare D1
  // ═══════════════════════════════════════════════════════════════
  const householdSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!ready || autoBackupInterval === "off") return;

    if (householdSyncTimer.current) clearTimeout(householdSyncTimer.current);

    householdSyncTimer.current = setTimeout(async () => {
      try {
        const { getHouseholdCredentials, migrateHouseholdCredentials } = await import("./modules/householdSecrets.js");
        await migrateHouseholdCredentials();
        const { householdId, passcode } = await getHouseholdCredentials();
        if (!householdId || !passcode) return;

        const { pushHouseholdSync } = await import("./modules/householdSync.js");
        await pushHouseholdSync(householdId, passcode);
      } catch (e) {
        console.error("Household auto-sync error:", e);
      }
    }, 16000); // 16s debounce (offset slightly from iCloud)

    return () => {
      if (householdSyncTimer.current) clearTimeout(householdSyncTimer.current);
    };
  }, [ready, history, renewals, cards, financialConfig, personalRules, autoBackupInterval]);

  useEffect(() => {
    // Attempt pull on load
    const doPull = async () => {
      if (!ready || !online) return;
      try {
        const { getHouseholdCredentials, migrateHouseholdCredentials } = await import("./modules/householdSecrets.js");
        await migrateHouseholdCredentials();
        const { householdId, passcode } = await getHouseholdCredentials();
        if (!householdId || !passcode) return;

        const { pullHouseholdSync, mergeHouseholdState } = await import("./modules/householdSync.js");
        const result = await pullHouseholdSync(householdId, passcode);
        if (result.ok && result.hasData && result.payload) {
          const merged = await mergeHouseholdState(result.payload, result.version);
          if (merged) {
            // New data merged — refresh below
            toast.success("Household data synced. Refreshing...");
            setTimeout(() => window.location.reload(), 1500);
          }
        }
      } catch {
        void 0;
      }
    }
    doPull();
  }, [ready, online]);

  // Sync privacy mode to global for components that read it outside React
  useEffect(() => {
    (window as Window & { __privacyMode?: boolean }).__privacyMode = privacyMode;
  }, [privacyMode]);

  useEffect(() => {
    setHeaderHidden(false);
    lastScrollY.current = 0;
  }, [tab]);

  useEffect(() => {
    if (!showShellHeader) {
      document.documentElement.style.setProperty("--top-bar-h", "0px");
      return;
    }
    if (!topBarRef.current) return;
    const update = () => {
      if (!topBarRef.current) return;
      const h = topBarRef.current.getBoundingClientRect().height || 0;
      document.documentElement.style.setProperty("--top-bar-h", `${Math.ceil(h)}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(topBarRef.current);
    return () => ro.disconnect();
  }, [showShellHeader]);

  // ═══════════════════════════════════════════════════════════════
  // CLIPBOARD AUTO-DETECT — check clipboard on app resume
  // ═══════════════════════════════════════════════════════════════
  const lastClipRef = useRef("");
  useEffect(() => {
    const checkClipboard = async () => {
      if (document.hidden) return;
      try {
        const text = await navigator.clipboard.readText();
        if (!text || text === lastClipRef.current || text.length < 50) return;
        // Heuristic: looks like an audit response if it has markdown headers + dollar amounts
        const hasHeaders = /##\s*(ALERT|DASHBOARD|MOVES|RADAR|NEXT ACTION)/i.test(text);
        const hasDollars = /\$[\d,]+\.\d{2}/.test(text);
        if (hasHeaders && hasDollars) {
          lastClipRef.current = text;
          toast.clipboard("Audit detected in clipboard", {
            duration: 8000,
            action: {
              label: "Import",
              fn: () => {
                handleManualImport(text);
                haptic.success();
              },
            },
          });
        }
      } catch {
        return;
      } // clipboard permission denied — silent fail
    };
    const onVis = () => {
      if (!document.hidden) setTimeout(checkClipboard, 500);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [history]);

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
      const n = { ...moveChecks, [i]: !moveChecks[i] };
      setMoveChecks(n);
      db.set("move-states", n);
      if (current) {
        const updatedCurrent = { ...current, moveChecks: n };
        setCurrent(updatedCurrent);
        db.set("current-audit", updatedCurrent);
        const nh = history.map(a => (a.ts === current.ts ? updatedCurrent : a));
        setHistory(nh);
        db.set("audit-history", nh);
      }
    }
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
    toast.success("App securely erased. Restarting...");
    setIsResetting(true); // Unmounts SettingsTab immediately

    // Wait for any trailing debounces to flush from React to the DB before wiping
    resetTimerRef.current = setTimeout(async () => {
      await db.clear();
      await db.set("renewals", []);
      await db.set("renewals-seed-version", "v2");
      await db.set("card-portfolio", []);
      await db.set("bank-accounts", []);
      await db.set("personal-rules", "");
      await deleteSecureItem("app-passcode");
      await deleteSecureItem("apple-linked-id");
      await deleteSecureItem("api-key");
      await deleteSecureItem("api-key-openai");
      await db.del("onboarding-complete"); // Guarantee Setup Wizard on reload

      window.location.reload();
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

  const handleSnapPageScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const scrollTop = el.scrollTop;
    const delta = scrollTop - (lastScrollY.current || 0);
    lastScrollY.current = scrollTop;

    if (scrollTop <= 0 || scrollTop + el.clientHeight >= el.scrollHeight - 1) return;

    const now = Date.now();
    if (now - headerToggleCooldown.current < 300) return;

    if (scrollTop < 60) {
      if (headerHidden) {
        headerToggleCooldown.current = now;
        setHeaderHidden(false);
      }
    } else if (delta > 25) {
      if (!headerHidden) {
        headerToggleCooldown.current = now;
        setHeaderHidden(true);
      }
    } else if (delta < -25) {
      if (headerHidden) {
        headerToggleCooldown.current = now;
        setHeaderHidden(false);
      }
    }
  }, [headerHidden]);

  const surfaceRecoverableAuditPrompt = useCallback((draft = recoverableAuditDraft) => {
    if (!draft?.sessionTs || !draft?.raw?.trim()) return;
    lastPromptedAuditDraftRef.current = draft.sessionTs;
    toast.warning("Previous audit was interrupted. Recover the partial draft or rerun the audit.", {
      duration: 9000,
      action: {
        label: "Recover",
        fn: () => {
          openRecoverableAuditDraft();
          setResultsBackTarget("audit");
          navTo("results");
        },
      },
    });
  }, [navTo, openRecoverableAuditDraft, recoverableAuditDraft, setResultsBackTarget, toast]);

  useEffect(() => {
    if (!recoverableAuditDraft?.sessionTs) return;
    if (lastPromptedAuditDraftRef.current === recoverableAuditDraft.sessionTs) return;
    surfaceRecoverableAuditPrompt(recoverableAuditDraft);
  }, [recoverableAuditDraft, surfaceRecoverableAuditPrompt]);

  useEffect(() => {
    abortActiveAuditRef.current = abortActiveAudit;
  }, [abortActiveAudit]);

  useEffect(() => {
    abortActiveChatStreamRef.current = abortActiveChatStream;
  }, [abortActiveChatStream]);

  useEffect(() => {
    checkRecoverableAuditDraftRef.current = checkRecoverableAuditDraft;
  }, [checkRecoverableAuditDraft]);

  useEffect(() => {
    surfaceRecoverableAuditPromptRef.current = surfaceRecoverableAuditPrompt;
  }, [surfaceRecoverableAuditPrompt]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let pauseHandle: { remove: () => Promise<void> } | null = null;
    let resumeHandle: { remove: () => Promise<void> } | null = null;

    const register = async () => {
      pauseHandle = await CapApp.addListener("pause", async () => {
        abortActiveAuditRef.current("background-pause");
        abortActiveChatStreamRef.current();
      });

      resumeHandle = await CapApp.addListener("resume", async () => {
        const draft = await checkRecoverableAuditDraftRef.current();
        if (draft?.sessionTs) {
          surfaceRecoverableAuditPromptRef.current(draft);
        }
      });
    };

    register().catch(() => {});

    return () => {
      pauseHandle?.remove().catch(() => {});
      resumeHandle?.remove().catch(() => {});
    };
  }, []);


  // Native iOS swipe-back is handled via WKWebView allowsBackForwardNavigationGestures
  // (set in capacitor.config.ts). The popstate listener (above) handles the navigation.

  // Native splash auto-hides instantly (launchShowDuration: 0) — no manual dismiss needed

  // ── Haptic on load-complete (premium feel) ──
  const loadReadyRef = useRef(false);
  useEffect(() => {
    if (ready && !loadReadyRef.current) {
      loadReadyRef.current = true;
      haptic.light();
    }
  }, [ready]);

  if (!ready)
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100dvh",
          background: T.bg.base,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <GlobalStyles />
        <style>{`
@keyframes loadFloat1 { 0%, 100% { transform: translate(0, 0) scale(1); } 33% { transform: translate(30px, -20px) scale(1.1); } 66% { transform: translate(-20px, 10px) scale(0.95); } }
@keyframes loadFloat2 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(-35px, -25px) scale(1.15); } }
@keyframes loadFloat3 { 0%, 100% { transform: translate(0, 0) scale(0.9); } 40% { transform: translate(25px, 15px) scale(1.05); } 80% { transform: translate(-15px, -10px) scale(1); } }
@keyframes ringSweep { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@keyframes iconBloom { 0% { transform: scale(0.7); opacity: 0; filter: blur(8px); } 100% { transform: scale(1); opacity: 1; filter: blur(0); } }
@keyframes iconPulse { 0%, 100% { box-shadow: 0 12px 48px rgba(0,0,0,0.4), 0 0 30px ${T.accent.primary}15; } 50% { box-shadow: 0 16px 56px rgba(0,0,0,0.5), 0 0 60px ${T.accent.primary}30, 0 0 100px ${T.accent.emerald}10; } }
@keyframes glowPulse { 0%, 100% { opacity: 0.15; transform: scale(1); } 50% { opacity: 0.35; transform: scale(1.08); } }
@keyframes particleDrift1 { 0% { transform: translate(0, 0); opacity: 0; } 10% { opacity: 0.6; } 90% { opacity: 0.6; } 100% { transform: translate(40px, -80px); opacity: 0; } }
@keyframes particleDrift2 { 0% { transform: translate(0, 0); opacity: 0; } 15% { opacity: 0.5; } 85% { opacity: 0.5; } 100% { transform: translate(-50px, -70px); opacity: 0; } }
@keyframes particleDrift3 { 0% { transform: translate(0, 0); opacity: 0; } 20% { opacity: 0.4; } 80% { opacity: 0.4; } 100% { transform: translate(30px, -90px); opacity: 0; } }
@keyframes particleDrift4 { 0% { transform: translate(0, 0); opacity: 0; } 10% { opacity: 0.5; } 90% { opacity: 0.3; } 100% { transform: translate(-35px, -60px); opacity: 0; } }
@keyframes loadBarFill { 0% { width: 0%; } 20% { width: 25%; } 50% { width: 55%; } 80% { width: 80%; } 100% { width: 95%; } }
@keyframes textReveal { 0% { opacity: 0; transform: translateY(16px); filter: blur(6px); } 100% { opacity: 1; transform: translateY(0); filter: blur(0); } }
@keyframes subtitlePulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
    `}</style>

        {/* Ambient gradient blobs — slow floating motion */}
        <div
          style={{
            position: "absolute",
            top: "12%",
            left: "5%",
            width: 240,
            height: 240,
            background: `radial-gradient(circle, ${T.accent.primary}20, transparent 70%)`,
            filter: "blur(60px)",
            borderRadius: "50%",
            pointerEvents: "none",
            animation: "loadFloat1 8s ease-in-out infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "15%",
            right: "5%",
            width: 200,
            height: 200,
            background: `radial-gradient(circle, ${T.accent.emerald}18, transparent 70%)`,
            filter: "blur(50px)",
            borderRadius: "50%",
            pointerEvents: "none",
            animation: "loadFloat2 10s ease-in-out infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "55%",
            width: 180,
            height: 180,
            background: `radial-gradient(circle, #6C60FF12, transparent 70%)`,
            filter: "blur(55px)",
            borderRadius: "50%",
            pointerEvents: "none",
            animation: "loadFloat3 12s ease-in-out infinite",
          }}
        />

        {/* Icon + Glow Ring */}
        <div
          style={{
            position: "relative",
            width: 120,
            height: 120,
            marginBottom: 36,
            animation: "iconBloom .8s cubic-bezier(0.16,1,0.3,1) both",
          }}
        >
          {/* Pulsing glow behind icon */}
          <div
            style={{
              position: "absolute",
              inset: -20,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${T.accent.primary}30, ${T.accent.emerald}10, transparent 70%)`,
              animation: "glowPulse 3s ease-in-out .6s infinite",
              pointerEvents: "none",
            }}
          />

          {/* Sweeping ring — conic gradient arc */}
          <div
            style={{
              position: "absolute",
              inset: -8,
              borderRadius: "50%",
              animation: "ringSweep 2.5s linear .4s infinite",
              opacity: 0,
              animationFillMode: "forwards",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                background: `conic-gradient(from 0deg, transparent 0%, ${T.accent.primary}60 15%, ${T.accent.emerald}50 30%, transparent 45%)`,
                mask: "radial-gradient(farthest-side, transparent calc(100% - 2.5px), #fff calc(100% - 2px))",
                WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 2.5px), #fff calc(100% - 2px))",
              }}
            />
          </div>

          {/* Static subtle ring track */}
          <div
            style={{
              position: "absolute",
              inset: -8,
              borderRadius: "50%",
              border: `1px solid ${T.border.subtle}`,
              pointerEvents: "none",
              animation: "textReveal .5s ease-out .3s both",
            }}
          />

          {/* Floating particles */}
          <div
            style={{
              position: "absolute",
              left: "15%",
              bottom: "10%",
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: T.accent.primary,
              animation: "particleDrift1 3s ease-out .8s infinite",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: "10%",
              bottom: "20%",
              width: 3,
              height: 3,
              borderRadius: "50%",
              background: T.accent.emerald,
              animation: "particleDrift2 3.5s ease-out 1.2s infinite",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "45%",
              bottom: "5%",
              width: 3,
              height: 3,
              borderRadius: "50%",
              background: "#6C60FF",
              animation: "particleDrift3 4s ease-out 1.5s infinite",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: "30%",
              bottom: "15%",
              width: 2,
              height: 2,
              borderRadius: "50%",
              background: T.accent.primary,
              animation: "particleDrift4 3.2s ease-out 2s infinite",
            }}
          />

          {/* App icon — blooms in, then pulses */}
          <img
            src="/icon-512.png"
            alt=""
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              borderRadius: 28,
              zIndex: 2,
              background: T.bg.base,
              animation: "iconPulse 3s ease-in-out .8s infinite",
            }}
          />
        </div>

        {/* App name — staggered reveal with gradient */}
        <h1
          style={{
            fontSize: 30,
            fontWeight: 900,
            letterSpacing: getTracking(30, "bold"),
            marginBottom: 6,
            animation: "textReveal .6s ease-out .4s both",
          }}
        >
          <span
            style={{
              background: `linear-gradient(135deg, ${T.text.primary}, ${T.accent.primary}90)`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Catalyst Cash
          </span>
        </h1>

        {/* Tagline — warm, human */}
        <p
          style={{
            fontSize: 10,
            color: T.text.dim,
            fontFamily: T.font.mono,
            letterSpacing: "2px",
            fontWeight: 600,
            textTransform: "uppercase",
            marginBottom: 36,
            animation: "textReveal .6s ease-out .6s both",
          }}
        >
          <span style={{ animation: "subtitlePulse 2.5s ease-in-out infinite" }}>Preparing your dashboard</span>
        </p>

        {/* Progress bar — smooth fill */}
        <div
          style={{
            width: 160,
            height: 3,
            borderRadius: 3,
            background: T.border.default,
            overflow: "hidden",
            animation: "textReveal .6s ease-out .8s both",
            position: "relative",
          }}
        >
          <div
            style={{
              height: "100%",
              borderRadius: 3,
              background: T.accent.gradient,
              animation: "loadBarFill 3s ease-out forwards",
              boxShadow: `0 0 8px ${T.accent.primary}40`,
            }}
          />
        </div>

        {/* Version */}
        <p
          style={{
            fontSize: 9,
            color: T.text.muted,
            fontFamily: T.font.mono,
            marginTop: 20,
            animation: "textReveal .6s ease-out 1s both",
            opacity: 0.4,
          }}
        >
          v{APP_VERSION}
        </p>
      </div>
    );

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
    <div
      style={{
        width: "100%",
        height: "100dvh",
        maxWidth: 800,
        margin: "0 auto",
        background: T.bg.base,
        display: "flex",
        flexDirection: "column",
        fontFamily: T.font.sans,
        overflow: "hidden",
      }}
    >
      <GlobalStyles />
      {/* Privacy mode sync — moved to useEffect in CatalystCash body */}
      {showAiConsent && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(24px) saturate(1.8)",
            WebkitBackdropFilter: "blur(24px) saturate(1.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 360,
              background: T.bg.card,
              borderRadius: T.radius.xl,
              border: `1px solid ${T.border.subtle}`,
              padding: 24,
              boxShadow: `0 24px 48px rgba(0,0,0,0.6), 0 0 0 1px ${T.border.subtle}`,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10, color: T.text.primary }}>
              AI Data Consent
            </div>
            <p style={{ fontSize: 13, color: T.text.secondary, lineHeight: 1.6, marginBottom: 20 }}>
              When you run an audit, the financial data you enter is sent to your selected AI provider using your API
              key. We do not sell AI access or store your data on our servers. By continuing, you agree to this data
              transfer.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => setShowAiConsent(false)}
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: T.radius.lg,
                  border: `1px solid ${T.border.default}`,
                  background: "transparent",
                  color: T.text.secondary,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setAiConsent(true);
                  setShowAiConsent(false);
                  await db.set("ai-consent-accepted", true);
                  toast.success("Consent saved");
                }}
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: T.radius.lg,
                  border: "none",
                  background: `linear-gradient(135deg, ${T.accent.primary}, #6C60FF)`,
                  color: "white",
                  fontWeight: 800,
                  cursor: "pointer",
                  fontSize: 14,
                  boxShadow: `0 4px 12px ${T.accent.primary}40`,
                }}
              >
                I Agree
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Skip-to-content link for a11y */}
      <a
        href="#main-content"
        style={{
          position: "absolute",
          top: -60,
          left: 16,
          zIndex: 100,
          background: T.accent.primary,
          color: "#fff",
          padding: "8px 16px",
          borderRadius: T.radius.md,
          fontWeight: 700,
          fontSize: 13,
          transition: "top .2s ease",
        }}
        onFocus={(e: ReactFocusEvent<HTMLAnchorElement>) => (e.currentTarget.style.top = "8px")}
        onBlur={(e: ReactFocusEvent<HTMLAnchorElement>) => (e.currentTarget.style.top = "-60px")}
      >
        Skip to content
      </a>
      {/* ═══════ HEADER BAR ═══════ */}
      {showShellHeader && (
        <header
          role="banner"
          ref={topBarRef}
          style={{
            position: "relative",
            top: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: `calc(env(safe-area-inset-top, 0px) + 4px) 16px 8px 16px`,
            background: T.bg.navGlass,
            flexShrink: 0,
            zIndex: 10,
            backdropFilter: "blur(24px) saturate(1.8)",
            WebkitBackdropFilter: "blur(24px) saturate(1.8)",
            borderBottom: `1px solid ${T.border.subtle}`,
            transform: headerHidden ? "translateY(-100%)" : "translateY(0)",
            transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            willChange: "transform",
          }}
        >
          <div style={{
            position: "absolute", bottom: -1, left: 0, right: 0, height: 1,
            background: `linear-gradient(90deg, transparent, ${T.accent.emerald}40, ${T.accent.primary}60, transparent)`
          }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setShowGuide(!showGuide)}
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                border: `1px solid ${showGuide ? T.border.focus : T.border.default}`,
                background: showGuide ? T.bg.surface : T.bg.glass,
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: showGuide ? T.accent.primary : T.text.dim,
                transition: "color .2s, border-color .2s",
                visibility: tab === "chat" ? "hidden" : "visible",
              }}
            >
              <Info size={18} strokeWidth={1.8} />
            </button>
            <button
              onClick={() => setPrivacyMode(p => !p)}
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                border: `1px solid ${privacyMode ? T.border.focus : T.border.default}`,
                background: privacyMode ? T.bg.surface : T.bg.glass,
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: privacyMode ? T.accent.primary : T.text.dim,
                transition: "color .2s, border-color .2s",
                visibility: tab === "chat" ? "hidden" : "visible",
              }}
              aria-label={privacyMode ? "Disable Privacy Mode" : "Enable Privacy Mode"}
            >
              {privacyMode ? <EyeOff size={18} strokeWidth={1.8} /> : <Eye size={18} strokeWidth={1.8} />}
            </button>
          </div>

          <div
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              textAlign: "center",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: T.text.primary,
                letterSpacing: getTracking(16, "bold"),
              }}
            >
              {tab === "dashboard" ? "Command Center" :
                tab === "audit" ? "Audit" :
                  tab === "chat" ? "Catalyst AI" :
                    tab === "cashflow" ? "Cashflow" :
                      tab === "portfolio" ? "Portfolio" : ""}
            </div>
          </div>

          <button
            onClick={() => navTo("settings")}
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              border: `1px solid ${T.border.default}`,
              background: T.bg.glass,
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: T.text.dim,
              transition: "color .2s, border-color .2s",
            }}
            aria-label="Open Settings"
          >
            <Settings size={18} strokeWidth={1.8} />
          </button>
        </header>
      )}

      {/* ═══════ OFFLINE BANNER ═══════ */}
      {!online && (
        <div
          style={{
            background: T.status.amberDim,
            borderBottom: `1px solid ${T.status.amber}30`,
            padding: "6px 16px",
            textAlign: "center",
            fontSize: 11,
            color: T.status.amber,
            fontWeight: 600,
            fontFamily: T.font.mono,
            flexShrink: 0,
          }}
        >
          ⚡ NO INTERNET — Audits unavailable
        </div>
      )}

      <ScrollSnapContainer
        ready={ready}
        onboardingComplete={onboardingComplete}
        tab={tab}
        syncTab={syncTab}
        SWIPE_TAB_ORDER={SWIPE_TAB_ORDER}
        hidden={tab === "settings" || tab === "results" || tab === "history" || tab === "guide" || tab === "input"}
      >
        <TabRenderer
          SWIPE_TAB_ORDER={SWIPE_TAB_ORDER}
          proEnabled={proEnabled}
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
        <OverlayManager
          handleConnectAccount={handleConnectAccount}
          handleCancelAudit={handleCancelAudit}
          dismissRecoverableAuditDraft={dismissRecoverableAuditDraft}
          navTo={navTo}
          toggleMove={toggleMove}
          toast={toast}
          clearAll={clearAll}
          factoryReset={factoryReset}
          handleRefreshDashboard={handleRefreshDashboard}
          handleSubmit={handleSubmit}
          handleManualImport={handleManualImport}
          setFinancialConfig={setFinancialConfig}
          inputFormDb={inputFormDb}
        />
      </OverlayProvider>

      <BottomNavBar
        tab={tab}
        navTo={navTo}
        loading={loading}
        showGuide={showGuide}
        transactionFeedTab={transactionFeedTab}
        setTransactionFeedTab={setTransactionFeedTab}
      />

      {/* Factory Reset Mask */}
      {isResetting && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: T.bg.base,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            animation: "fadeIn 0.3s ease-out forwards",
          }}
        >
          <div
            className="spin"
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              border: `3px solid ${T.border.default}`,
              borderTopColor: T.accent.primary,
            }}
          />
          <p
            style={{
              marginTop: 24,
              fontSize: 13,
              color: T.text.secondary,
              fontWeight: 600,
              fontFamily: T.font.mono,
              letterSpacing: "0.05em",
            }}
          >
            SECURELY ERASING...
          </p>
        </div>
      )}

      {/* SIMULATED PUSH NOTIFICATION */}
      {simulatedNotification && (
        <div
          style={{
            position: "fixed",
            top: 16,
            left: 16,
            right: 16,
            zIndex: 9999,
            background: `linear-gradient(135deg, ${T.bg.card}, ${T.bg.surface})`,
            borderRadius: T.radius.xl,
            padding: 16,
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            boxShadow: `0 12px 32px rgba(0,0,0,0.8), 0 0 0 1px ${T.border.default}`,
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            animation: "slideDownNotif 0.4s cubic-bezier(0.16,1,0.3,1)",
            cursor: "pointer",
          }}
          onClick={() => setSimulatedNotification(null)}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: T.accent.primaryDim,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <MapPin size={22} color={T.accent.primary} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>
                {simulatedNotification.title}
              </span>
              <span style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono }}>NOW</span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: T.text.secondary, lineHeight: 1.4 }}>
              {simulatedNotification.body}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CatalystCash() {
  return (
    <ThemeProvider>
      <CatalystCashShell />
    </ThemeProvider>
  );
}
