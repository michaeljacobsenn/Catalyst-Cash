import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AuditRecord, Card as CardType, Renewal } from "../../types/index.js";
import { normalizeAppError } from "../appErrors.js";
import { APP_VERSION } from "../constants.js";
import { haptic } from "../haptics.js";
import { log } from "../logger.js";
import { extractCategoryByKeywords } from "../merchantDatabase.js";
import { syncOTAData } from "../ota.js";
import { initRevenueCat } from "../revenuecat.js";
import { getOptimalCard } from "../rewardsCatalog.js";
import { isSecuritySensitiveKey, sanitizePlaidForBackup } from "../securityKeys.js";
import { getGatingMode, isPro, syncRemoteGatingMode } from "../subscription.js";
import type { ToastApi } from "../Toast.js";
import { db } from "../utils.js";
import { uploadToICloud } from "../cloudSync.js";

type AppTab = "dashboard" | "cashflow" | "audit" | "portfolio" | "chat" | "settings" | "history" | "results" | "input";

interface SimulatedNotification {
  title: string;
  body: string;
  store: string;
}

const uploadToICloudTyped = uploadToICloud as (payload: unknown, passphrase?: string | null) => Promise<boolean>;

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
    syncRemoteGatingMode();
    syncOTAData();
  }, []);

  useEffect(() => {
    initRevenueCat().then(() => {
      const mode = getGatingMode();
      if (mode === "off" || mode === "soft") {
        setProEnabled(true);
        return;
      }
      isPro()
        .then(setProEnabled)
        .catch(() => setProEnabled(false));
    });
  }, [setProEnabled]);
}

export function useSimulatedGeofenceNotification(
  cards: CardType[],
  valuations: Record<string, unknown> | undefined
) {
  const [simulatedNotification, setSimulatedNotification] = useState<SimulatedNotification | null>(null);

  useEffect(() => {
    const handleSimulate = (event: Event) => {
      const detail = (event as CustomEvent<{ store?: string }>).detail;
      const store = detail?.store || "Store";
      const categoryStr = extractCategoryByKeywords(store) || "other";
      const optimal = getOptimalCard(cards || [], categoryStr, valuations || {});

      let recommendation = "Open Catalyst to see your best card.";
      if (optimal && optimal.yield) {
        recommendation = `Use your ${optimal.cardName} here for ${parseFloat((optimal.yield * 100).toFixed(1))}% back!`;
      }

      setSimulatedNotification({
        title: `${store} Nearby`,
        body: recommendation,
        store,
      });
      setTimeout(() => setSimulatedNotification(null), 6000);
    };

    window.addEventListener("simulate-geo-fence", handleSimulate);
    return () => window.removeEventListener("simulate-geo-fence", handleSimulate);
  }, [cards, valuations]);

  return {
    simulatedNotification,
    dismissSimulatedNotification: () => setSimulatedNotification(null),
  };
}

interface AutoBackupParams {
  ready: boolean;
  appleLinkedId: string | null | undefined;
  autoBackupInterval: string;
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
        const lastBackupStr = await db.get("last-backup-ts");
        const lastBackup = lastBackupStr ? Number(lastBackupStr) : 0;
        const now = Date.now();
        const hrs24 = 24 * 60 * 60 * 1000;
        let requiredDeltaMs = 0;

        if (autoBackupInterval === "daily") requiredDeltaMs = hrs24;
        else if (autoBackupInterval === "weekly") requiredDeltaMs = hrs24 * 7;
        else if (autoBackupInterval === "monthly") requiredDeltaMs = hrs24 * 30;

        if (now - lastBackup < requiredDeltaMs) return;

        const backup: { app: string; version: string; exportedAt: string; data: Record<string, unknown> } = {
          app: "Catalyst Cash",
          version: APP_VERSION,
          exportedAt: new Date().toISOString(),
          data: {},
        };
        const keys = await db.keys();
        for (const key of keys) {
          if (typeof key !== "string") continue;
          if (key && isSecuritySensitiveKey(key)) continue;
          const val = await db.get(key);
          if (val !== null) backup.data[key] = val;
        }
        if (!("personal-rules" in backup.data)) {
          backup.data["personal-rules"] = personalRules ?? "";
        }

        const plaidConns = await db.get("plaid-connections");
        if (Array.isArray(plaidConns) && plaidConns.length > 0) {
          backup.data["plaid-connections-sanitized"] = sanitizePlaidForBackup(plaidConns);
        }

        const success = await uploadToICloudTyped(backup, appPasscode || null);
        if (success) {
          await db.set("last-backup-ts", now);
        }
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

export { getHouseholdSyncDelayMs, type SimulatedNotification };
