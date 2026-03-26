import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AuditRecord, Card as CardType, Renewal } from "../../types/index.js";
import { normalizeAppError } from "../appErrors.js";
import { haptic } from "../haptics.js";
import { log } from "../logger.js";
import { getGatingMode, isPro, syncRemoteGatingMode } from "../subscription.js";
import type { ToastApi } from "../Toast.js";
type AppTab = "dashboard" | "cashflow" | "audit" | "portfolio" | "chat" | "settings" | "history" | "results" | "input";

interface SimulatedNotification {
  title: string;
  body: string;
  store: string;
}

function getHouseholdSyncDelayMs() {
  const override =
    (typeof globalThis !== "undefined" && globalThis.__E2E_HOUSEHOLD_SYNC_DELAY__) ||
    (typeof window !== "undefined" && window.__E2E_HOUSEHOLD_SYNC_DELAY__);
  if (typeof override === "number" && Number.isFinite(override) && override >= 0) {
    return override;
  }
  return 16000;
}

export function useBootServices(setProEnabled: (value: boolean) => void) {
  useEffect(() => {
    void import("../ota.js")
      .then(({ syncOTAData }) => syncOTAData())
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      await syncRemoteGatingMode();
      const { initRevenueCat } = await import("../revenuecat.js");
      await initRevenueCat();

      const mode = getGatingMode();
      if (cancelled) return;

      if (mode === "off" || mode === "soft") {
        setProEnabled(true);
        return;
      }

      isPro()
        .then(value => {
          if (!cancelled) setProEnabled(value);
        })
        .catch(() => {
          if (!cancelled) setProEnabled(false);
        });
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, [setProEnabled]);
}

export function useSimulatedGeofenceNotification(
  cards: CardType[],
  valuations: Record<string, unknown> | undefined
) {
  const [simulatedNotification, setSimulatedNotification] = useState<SimulatedNotification | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleSimulate = (event: Event) => {
      const detail = (event as CustomEvent<{ store?: string }>).detail;
      const store = detail?.store || "Store";
      void (async () => {
        const [{ extractCategoryByKeywords }, { getOptimalCard }, { triggerStoreArrivalNotification }] =
          await Promise.all([
            import("../merchantDatabase.js"),
            import("../rewardsCatalog.js"),
            import("../notifications.js"),
          ]);
        const categoryStr = extractCategoryByKeywords(store) || "other";
        const optimal = getOptimalCard(cards || [], categoryStr, valuations || {});

        let recommendation = "Open Catalyst to see your best card.";
        if (optimal && optimal.yield) {
          recommendation = `Use your ${optimal.cardName} here for ${parseFloat((optimal.yield * 100).toFixed(1))}% back!`;
        }

        // QA simulation bypasses cooldown with forceReset so previews always fire
        const shownNatively = await triggerStoreArrivalNotification(store, recommendation, { forceReset: true });
        if (shownNatively) {
          if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
          setSimulatedNotification(null);
          return;
        }

        setSimulatedNotification({
          title: `${store} Nearby`,
          body: recommendation,
          store,
        });
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = setTimeout(() => setSimulatedNotification(null), 6000);
      })();
    };

    window.addEventListener("simulate-geo-fence", handleSimulate);
    return () => {
      window.removeEventListener("simulate-geo-fence", handleSimulate);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [cards, valuations]);

  return {
    simulatedNotification,
    dismissSimulatedNotification: () => setSimulatedNotification(null),
  };
}

interface AutoBackupParams {
  ready: boolean;
  appleLinkedId: string | null | undefined;
  autoBackupInterval: "off" | "daily" | "weekly" | "monthly";
  history: AuditRecord[];
  renewals: Renewal[];
  cards: CardType[];
  financialConfig: Record<string, unknown> | null | undefined;
  personalRules: string;
  appPasscode: string | null | undefined;
}

export function useAutoICloudBackup({
  ready,
  appleLinkedId,
  autoBackupInterval,
  history,
  renewals,
  cards,
  financialConfig,
  personalRules,
  appPasscode,
}: AutoBackupParams) {
  const iCloudSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ready || !appleLinkedId) return;
    if (autoBackupInterval === "off") return;

    if (iCloudSyncTimer.current) clearTimeout(iCloudSyncTimer.current);

    iCloudSyncTimer.current = setTimeout(async () => {
      try {
        const [{ performCloudBackup }, { uploadToICloud }] = await Promise.all([
          import("../backup.js"),
          import("../cloudSync.js"),
        ]);
        await performCloudBackup({
          upload: uploadToICloud,
          passphrase: appPasscode || null,
          personalRules,
          interval: autoBackupInterval,
        });
      } catch (error) {
        const failure = normalizeAppError(error, { context: "restore" });
        log.warn("icloud", "Auto-backup failed", { error: failure.rawMessage, kind: failure.kind });
      }
    }, 15000);

    return () => {
      if (iCloudSyncTimer.current) clearTimeout(iCloudSyncTimer.current);
    };
  }, [ready, appleLinkedId, autoBackupInterval, history, renewals, cards, financialConfig, personalRules, appPasscode]);
}

interface HouseholdSyncParams {
  ready: boolean;
  online: boolean;
  autoBackupInterval: string;
  history: AuditRecord[];
  renewals: Renewal[];
  cards: CardType[];
  financialConfig: Record<string, unknown> | null | undefined;
  personalRules: string;
  refreshAppState: (nextTab?: AppTab) => Promise<void>;
  toast: ToastApi;
}

export function useHouseholdSync({
  ready,
  online,
  autoBackupInterval,
  history,
  renewals,
  cards,
  financialConfig,
  personalRules,
  refreshAppState,
  toast,
}: HouseholdSyncParams) {
  const householdSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncHouseholdState = useCallback(async (): Promise<boolean> => {
    const { getHouseholdCredentials, migrateHouseholdCredentials } = await import("../householdSecrets.js");
    await migrateHouseholdCredentials();
    const { householdId, passcode } = await getHouseholdCredentials();
    if (!householdId || !passcode) return false;

    const { pullHouseholdSync, mergeHouseholdState } = await import("../householdSync.js");
    const result = await pullHouseholdSync(householdId, passcode);
    if (!result.ok || !result.hasData || !result.payload) return false;

    const merged = await mergeHouseholdState(result.payload, result.version);
    if (!merged) return false;

    await refreshAppState("dashboard");
    return true;
  }, [refreshAppState]);

  useEffect(() => {
    if (!ready || autoBackupInterval === "off") return;

    if (householdSyncTimer.current) clearTimeout(householdSyncTimer.current);
    householdSyncTimer.current = setTimeout(async () => {
      try {
        const { getHouseholdCredentials, migrateHouseholdCredentials } = await import("../householdSecrets.js");
        await migrateHouseholdCredentials();
        const { householdId, passcode } = await getHouseholdCredentials();
        if (!householdId || !passcode) return;

        const { pushHouseholdSync } = await import("../householdSync.js");
        await pushHouseholdSync(householdId, passcode);
      } catch (error) {
        const failure = normalizeAppError(error, { context: "sync" });
        log.warn("household-sync", "Household auto-sync failed", { error: failure.rawMessage, kind: failure.kind });
      }
    }, getHouseholdSyncDelayMs());

    return () => {
      if (householdSyncTimer.current) clearTimeout(householdSyncTimer.current);
    };
  }, [ready, history, renewals, cards, financialConfig, personalRules, autoBackupInterval]);

  useEffect(() => {
    const doPull = async () => {
      if (!ready || !online) return;
      try {
        const merged = await syncHouseholdState();
        if (merged) toast.success("Household data synced.");
      } catch {
        // ignore startup pull failures
      }
    };
    void doPull();
  }, [online, ready, syncHouseholdState, toast]);

  const handleRestoreComplete = useCallback(async () => {
    await refreshAppState("dashboard");
  }, [refreshAppState]);

  const handleHouseholdSyncConfigured = useCallback(async () => {
    const merged = await syncHouseholdState().catch(() => false);
    if (merged) {
      toast.success("Household data synced.");
    } else {
      await refreshAppState("dashboard");
    }
  }, [refreshAppState, syncHouseholdState, toast]);

  return {
    handleRestoreComplete,
    handleHouseholdSyncConfigured,
  };
}

export function usePrivacyModeMirror(privacyMode: boolean) {
  useEffect(() => {
    (window as Window & { __privacyMode?: boolean }).__privacyMode = privacyMode;
  }, [privacyMode]);
}

interface HeaderChromeParams {
  tab: string;
  showShellHeader: boolean;
  topBarRef: React.RefObject<HTMLElement | null>;
  setHeaderHidden: (value: boolean) => void;
  lastScrollY: React.MutableRefObject<number>;
}

export function useHeaderChrome({
  tab,
  showShellHeader,
  topBarRef,
  setHeaderHidden,
  lastScrollY,
}: HeaderChromeParams) {
  useEffect(() => {
    setHeaderHidden(false);
    lastScrollY.current = 0;
  }, [tab, setHeaderHidden, lastScrollY]);

  useEffect(() => {
    if (!showShellHeader) {
      document.documentElement.style.setProperty("--top-bar-h", "0px");
      return;
    }
    if (!topBarRef.current) return;

    const update = () => {
      if (!topBarRef.current) return;
      const height = topBarRef.current.getBoundingClientRect().height || 0;
      document.documentElement.style.setProperty("--top-bar-h", `${Math.ceil(height)}px`);
    };

    update();
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(topBarRef.current);
    return () => resizeObserver.disconnect();
  }, [showShellHeader, topBarRef]);
}

interface ClipboardAuditParams {
  history: AuditRecord[];
  handleManualImport: (text: string) => void | Promise<void>;
  toast: ToastApi;
}

export function useClipboardAuditImport({ history, handleManualImport, toast }: ClipboardAuditParams) {
  const lastClipRef = useRef("");

  useEffect(() => {
    const checkClipboard = async () => {
      if (document.hidden) return;
      try {
        const text = await navigator.clipboard.readText();
        if (!text || text === lastClipRef.current || text.length < 50) return;
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
      }
    };

    const onVisibility = () => {
      if (!document.hidden) setTimeout(checkClipboard, 500);
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [history, handleManualImport, toast]);
}

interface RecoverableAuditLifecycleParams {
  recoverableAuditDraft: { sessionTs?: string | null; raw?: string | null } | null | undefined;
  navTo: (tab: AppTab) => void;
  openRecoverableAuditDraft: () => void;
  setResultsBackTarget: (tab: AppTab) => void;
  toast: ToastApi;
  abortActiveAudit: (reason?: string) => void;
  abortActiveChatStream: () => void;
  checkRecoverableAuditDraft: () => Promise<{ sessionTs?: string | null; raw?: string | null } | null | undefined>;
}

export function useRecoverableAuditLifecycle({
  recoverableAuditDraft,
  navTo,
  openRecoverableAuditDraft,
  setResultsBackTarget,
  toast,
  abortActiveAudit,
  abortActiveChatStream,
  checkRecoverableAuditDraft,
}: RecoverableAuditLifecycleParams) {
  const lastPromptedAuditDraftRef = useRef<string | null>(null);
  const abortActiveAuditRef = useRef(abortActiveAudit);
  const abortActiveChatStreamRef = useRef(abortActiveChatStream);
  const checkRecoverableAuditDraftRef = useRef(checkRecoverableAuditDraft);
  const surfaceRecoverableAuditPromptRef =
    useRef<(draft?: typeof recoverableAuditDraft) => void>(() => {});

  const surfaceRecoverableAuditPrompt = useCallback(
    (draft = recoverableAuditDraft) => {
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
    },
    [navTo, openRecoverableAuditDraft, recoverableAuditDraft, setResultsBackTarget, toast]
  );

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
}

export function useLoadReadyHaptic(ready: boolean) {
  const loadReadyRef = useRef(false);
  useEffect(() => {
    if (ready && !loadReadyRef.current) {
      loadReadyRef.current = true;
      haptic.light();
    }
  }, [ready]);
}

/**
 * Refresh app state when returning from background.
 * Waits 1.5s after resume to avoid firing during momentary interruptions
 * (e.g. biometric prompt, system dialogs).
 */
export function useAppForegroundRefresh(
  ready: boolean,
  refreshAppState: () => Promise<void>
) {
  const refreshRef = useRef(refreshAppState);
  useEffect(() => { refreshRef.current = refreshAppState; }, [refreshAppState]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !ready) return;

    let resumeHandle: { remove: () => Promise<void> } | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const register = async () => {
      resumeHandle = await CapApp.addListener("resume", () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          refreshRef.current().catch(() => {});
        }, 1500);
      });
    };

    register().catch(() => {});

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      resumeHandle?.remove().catch(() => {});
    };
  }, [ready]);
}

/**
 * Routes deep links / Universal Links to the correct tab.
 * Handles catalystcash.app URLs and custom scheme com.jacobsen.portfoliopro://
 *
 * URL pattern → tab:
 *   /audit         → input (start audit)
 *   /history       → history
 *   /settings      → settings
 *   /cards         → portfolio
 *   / (default)    → dashboard
 */
export function useDeepLinkRouting(navTo: (tab: AppTab) => void) {
  const navToRef = useRef(navTo);
  useEffect(() => { navToRef.current = navTo; }, [navTo]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let handle: { remove: () => Promise<void> } | null = null;

    const register = async () => {
      handle = await CapApp.addListener("appUrlOpen", (event: { url: string }) => {
        try {
          const url = new URL(event.url);
          const path = url.pathname.replace(/^\//, "").toLowerCase();
          const TAB_MAP: Record<string, AppTab> = {
            audit: "input",
            history: "history",
            settings: "settings",
            cards: "portfolio",
            portfolio: "portfolio",
            chat: "chat",
          };
          navToRef.current(TAB_MAP[path] ?? "dashboard");
          void log.info("deeplink", "Routed deep link", { url: event.url, path });
        } catch {
          navToRef.current("dashboard");
        }
      });
    };

    register().catch(() => {});
    return () => { handle?.remove().catch(() => {}); };
  }, []);
}

export { getHouseholdSyncDelayMs, type SimulatedNotification };
