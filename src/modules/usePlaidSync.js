/**
 * usePlaidSync — shared Plaid balance sync logic
 * Uses module-level state so sync status persists across tab switches.
 * Used by DashboardTab and CardPortfolioTab to avoid code duplication.
 */
  import { App as CapApp } from "@capacitor/app";
  import { Capacitor } from "@capacitor/core";
  import { useCallback,useEffect,useState } from "react";
  import { normalizeAppError } from "./appErrors.js";
  import { haptic } from "./haptics.js";
  import { log } from "./logger.js";
  import {
    PLAID_MANUAL_SYNC_COOLDOWNS,
    applyBalanceSync,
    ensureConnectionAccountsPresent,
    fetchAllBalancesAndLiabilities,
    fetchAllTransactions,
    forceBackendSync,
    getConnections,
    maintainBackendSync,
    reconcilePlaidConnectionAccess,
    saveConnectionLinks,
  } from "./plaid.js";
  import { getCurrentTier,getRawTier,isGatingEnforced } from "./subscription.js";

// ── Module-level sync state ──────────────────────────────────
// This ensures the sync spinner persists even when the user
// switches tabs (component unmount/remount). All mounted
// instances of usePlaidSync share the same underlying state.
let _isSyncing = false;
let _lastBackgroundSyncAt = 0;
const _subscribers = new Set();
const _syncStateSubscribers = new Set();
const BACKGROUND_PLAID_MAINTENANCE_MIN_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_SYNC_STATE = {
  phase: "idle",
  requestedCount: 0,
  completedCount: 0,
  activeInstitution: "",
  message: "",
  warning: null,
  issues: [],
  background: false,
  updatedAt: 0,
};
let _syncState = { ...DEFAULT_SYNC_STATE };
function _notifySubs() {
  _subscribers.forEach(fn => fn(_isSyncing));
}
function _setSyncing(v) {
  _isSyncing = v;
  _notifySubs();
}
function _notifySyncStateSubs() {
  _syncStateSubscribers.forEach(fn => fn(_syncState));
}
function _setSyncState(next) {
  _syncState = {
    ..._syncState,
    ...next,
    updatedAt: Date.now(),
  };
  _notifySyncStateSubs();
}
function _resetSyncState() {
  _syncState = { ...DEFAULT_SYNC_STATE, updatedAt: Date.now() };
  _notifySyncStateSubs();
}

export function shouldRunBackgroundPlaidMaintenance(
  lastAttemptAt = 0,
  now = Date.now(),
  minIntervalMs = BACKGROUND_PLAID_MAINTENANCE_MIN_INTERVAL_MS
) {
  if (!lastAttemptAt) return true;
  return (now - lastAttemptAt) >= minIntervalMs;
}

export function getMostRecentPlaidSyncTime(cards = [], bankAccounts = [], connectionIds = []) {
  const allowedConnectionIds = new Set(
    Array.from(connectionIds || []).map(id => String(id || "").trim()).filter(Boolean)
  );
  const getTimestamp = item => {
    const connectionId = String(item?._plaidConnectionId || "").trim();
    if (allowedConnectionIds.size > 0 && !allowedConnectionIds.has(connectionId)) {
      return null;
    }
    const raw = item?._plaidLastSync;
    if (!raw) return null;
    const timestamp = new Date(raw).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  };

  const timestamps = [...cards, ...bankAccounts]
    .map(getTimestamp)
    .filter(timestamp => Number.isFinite(timestamp));

  if (timestamps.length === 0) return null;
  return Math.max(...timestamps);
}

export function shouldFetchTransactionsForSync({
  autoFetchTransactions = false,
  effectiveTierId = "free",
  gatingEnforced = false,
} = {}) {
  return Boolean(autoFetchTransactions && (!gatingEnforced || effectiveTierId === "pro"));
}

export function shouldEnforcePlaidSyncCooldown({
  gatingEnforced = false,
} = {}) {
  return Boolean(gatingEnforced);
}

export function hasCachedPlaidSnapshot(cards = [], bankAccounts = [], connectionIds = []) {
  const allowedConnectionIds = new Set(
    Array.from(connectionIds || []).map(id => String(id || "").trim()).filter(Boolean)
  );
  const belongsToAllowedConnection = item => {
    const connectionId = String(item?._plaidConnectionId || "").trim();
    if (allowedConnectionIds.size === 0) return Boolean(connectionId);
    return Boolean(connectionId) && allowedConnectionIds.has(connectionId);
  };

  const hasCachedData = item => {
    if (!belongsToAllowedConnection(item)) return false;
    return Boolean(
      item?._plaidLastSync ||
      item?._plaidBalance != null ||
      item?._plaidAvailable != null ||
      item?._plaidLimit != null
    );
  };

  return [...cards, ...bankAccounts].some(hasCachedData);
}

export function summarizeSyncOutcome({
  requestedCount = 0,
  successCount = 0,
  pendingCount = 0,
  forceSyncSucceeded = true,
  hadCachedSnapshot = false,
  successMessage = "Balances synced successfully",
} = {}) {
  const normalizedRequestedCount = Math.max(requestedCount, successCount + pendingCount);

  if (successCount > 0 && forceSyncSucceeded) {
    if (pendingCount > 0 || successCount < normalizedRequestedCount) {
      const institutionLabel = normalizedRequestedCount === 1 ? "institution" : "institutions";
      const pendingSuffix =
        pendingCount > 0
          ? ` ${pendingCount} ${pendingCount === 1 ? "institution is" : "institutions are"} still processing.`
          : " Some institutions still need another refresh.";
      return {
        kind: "info",
        message: `Synced ${successCount} of ${normalizedRequestedCount} linked ${institutionLabel}.${pendingSuffix}`,
      };
    }
    return { kind: "success", message: successMessage };
  }

  if (successCount > 0 && !forceSyncSucceeded) {
    return {
      kind: "info",
      message: "Catalyst loaded your last cached bank data, but live sync did not complete.",
    };
  }

  if (!forceSyncSucceeded && hadCachedSnapshot) {
    return {
      kind: "info",
      message: "Live sync did not complete, but Catalyst kept showing your most recent saved bank data.",
    };
  }

  if (pendingCount > 0) {
    return {
      kind: "info",
      message: "Plaid is still processing your bank refresh. Fresh balances have not arrived yet.",
    };
  }

  return null;
}

/**
 * @param {Object} opts
 * @param {Array}  opts.cards
 * @param {Array}  opts.bankAccounts
 * @param {Object} opts.financialConfig
 * @param {Function} opts.setCards
 * @param {Function} opts.setBankAccounts
 * @param {Function} opts.setFinancialConfig
 * @param {unknown}  [opts.cardCatalog]
 * @param {string}   [opts.successMessage] — custom toast on success
 * @param {boolean}  [opts.autoFetchTransactions] — also pull transactions (Accounts tab)
 * @param {boolean}  [opts.autoMaintain] — silent background Plaid upkeep on mount/foreground
 */
export function usePlaidSync({
  cards,
  bankAccounts,
  financialConfig,
  setCards,
  setBankAccounts,
  setFinancialConfig,
  cardCatalog = null,
  successMessage = "Balances synced successfully",
  autoFetchTransactions = false,
  autoMaintain = false,
}) {
  const [syncing, setSyncing] = useState(_isSyncing);
  const [syncState, setSyncState] = useState(_syncState);

  // Subscribe to module-level sync state changes
  useEffect(() => {
    const handler = v => setSyncing(v);
    _subscribers.add(handler);
    // Re-sync on mount in case state changed while unmounted
    setSyncing(_isSyncing);
    return () => _subscribers.delete(handler);
  }, []);

  useEffect(() => {
    const handler = next => setSyncState(next);
    _syncStateSubscribers.add(handler);
    setSyncState(_syncState);
    return () => _syncStateSubscribers.delete(handler);
  }, []);

  const sync = useCallback(async (options = {}) => {
    const background = options.background === true;
    if (_isSyncing) return;

    // Offline guard — avoid cryptic network errors
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      if (!background && window.toast) window.toast.info("You're offline — connect to the internet to sync.");
      return;
    }

    // 1. Check for existing connections
    const conns = await getConnections();
    if (conns.length === 0) {
      if (!background && window.toast) window.toast.info("No bank connections — connect via Settings → Plaid");
      return;
    }
    const reconnectRequired = conns.filter(conn => conn?._needsReconnect);
    if (reconnectRequired.length === conns.length) {
      if (!background && window.toast) {
        window.toast.info("Your linked banks need to be reconnected in Settings → Bank Connections before balances can sync.");
      }
      return;
    }

    // 2. Resolve which connections are actually allowed to live-sync on this tier.
    const tier = await getCurrentTier();
    const rawTier = await getRawTier();
    const gatingEnforced = isGatingEnforced();
    const accessState = await reconcilePlaidConnectionAccess(cards, bankAccounts);
    const syncConnectionIds = accessState.syncableConnectionIds.filter(connectionId => {
      const connection = accessState.connections.find(conn => conn?.id === connectionId);
      return connection && !connection._needsReconnect;
    });

    if (accessState.cardsChanged) {
      setCards(accessState.updatedCards);
    }
    if (accessState.bankAccountsChanged) {
      setBankAccounts(accessState.updatedBankAccounts);
    }

    if (!background && gatingEnforced && rawTier.id === "free" && accessState.pausedConnectionIds.length > 0 && window.toast) {
      window.toast.info("Free keeps live sync on one linked institution. Extra bank links stay as editable manual snapshots until you upgrade.");
    }

    if (syncConnectionIds.length === 0) {
      if (!background && window.toast) {
        window.toast.info(
          reconnectRequired.length === conns.length
            ? "Your linked banks need to be reconnected in Settings → Bank Connections before balances can sync."
            : "Choose one active bank in Settings → Bank Connections or reconnect a linked institution before syncing."
        );
      }
      return;
    }

    if (background && !shouldRunBackgroundPlaidMaintenance(_lastBackgroundSyncAt)) {
      return;
    }

    const cooldown = PLAID_MANUAL_SYNC_COOLDOWNS[tier.id] || PLAID_MANUAL_SYNC_COOLDOWNS.free;
    const cooldownEnforced = shouldEnforcePlaidSyncCooldown({ gatingEnforced });
    const lastSyncAt = getMostRecentPlaidSyncTime(cards, bankAccounts, syncConnectionIds);
    if (!background && cooldownEnforced && lastSyncAt && Date.now() - lastSyncAt < cooldown) {
      const minsLeft = Math.ceil((cooldown - (Date.now() - lastSyncAt)) / 60000);
      const hoursLeft = Math.floor(minsLeft / 60);
      const daysLeft = Math.floor(hoursLeft / 24);

      let timeStr = "";
      if (daysLeft > 0) {
        timeStr = `${daysLeft} day${daysLeft > 1 ? 's' : ''} ${hoursLeft % 24}h`;
      } else if (hoursLeft > 0) {
        timeStr = `${hoursLeft}h ${minsLeft % 60}m`;
      } else {
        timeStr = `${minsLeft} min`;
      }

      if (window.toast)
        window.toast.info(`Next live sync in ${timeStr}`);
      return;
    }

    _setSyncing(true);
    _setSyncState({
      phase: "syncing",
      requestedCount: syncConnectionIds.length,
      completedCount: 0,
      activeInstitution: syncConnectionIds.length === 1 ? "your linked account" : "your linked accounts",
      message: background ? "Refreshing linked accounts…" : "Syncing linked accounts…",
      warning: null,
      issues: [],
      background,
    });
    if (background) {
      _lastBackgroundSyncAt = Date.now();
    }

    // 3. Force backend to perform a live Plaid sync
    let forceSyncSucceeded = true;
    try {
      if (background) {
        const maintainResult = await maintainBackendSync();
        forceSyncSucceeded = Boolean(maintainResult?.success);
      } else {
        forceSyncSucceeded = await forceBackendSync({
          connectionId: gatingEnforced && rawTier.id === "free" ? syncConnectionIds[0] : null,
        });
      }
    } catch (e) {
      forceSyncSucceeded = false;
      const failure = normalizeAppError(e, { context: "sync" });
      log.warn("sync", "Manual force sync preflight issue", { error: failure.rawMessage, kind: failure.kind });
    }

    // 4. Fetch and apply balances from D1 Worker cache
    try {
      let progressCompleted = 0;
      const results = await fetchAllBalancesAndLiabilities({
        connectionIds: syncConnectionIds,
        onProgress: ({ completed = 0, total = syncConnectionIds.length, institutionName = "" }) => {
          progressCompleted = completed;
          _setSyncState({
            phase: "syncing",
            requestedCount: total,
            completedCount: completed,
            activeInstitution: institutionName,
            message:
              completed >= total
                ? "Finalizing synced balances…"
                : `Syncing ${Math.min(completed + 1, total)} of ${total}: ${institutionName}`,
            warning: null,
            issues: [],
            background,
          });
        },
      });
      let allCards = [...cards];
      let allBanks = [...bankAccounts];
      let allInvests = [...(financialConfig?.plaidInvestments || [])];
      let investmentsChanged = false;
      let restoredCount = 0;
      let successCount = 0;
      let pendingCount = 0;
      const requestedCount = syncConnectionIds.length;

      for (const res of results) {
        if (!res._error && !res._pendingSync) {
          const hydratedState = ensureConnectionAccountsPresent(
            res,
            allCards,
            allBanks,
            cardCatalog,
            allInvests
          );
          restoredCount +=
            hydratedState.importedCards +
            hydratedState.importedBankAccounts +
            hydratedState.importedPlaidInvestments;
          const syncData = applyBalanceSync(
            res,
            hydratedState.updatedCards,
            hydratedState.updatedBankAccounts,
            hydratedState.updatedPlaidInvestments
          );
          allCards = syncData.updatedCards;
          allBanks = syncData.updatedBankAccounts;
          if (syncData.updatedPlaidInvestments) {
            allInvests = syncData.updatedPlaidInvestments;
            investmentsChanged = true;
          }
          await saveConnectionLinks(res);
          successCount++;
        } else if (res?._pendingSync) {
          pendingCount++;
        }
      }

      setCards(allCards);
      setBankAccounts(allBanks);
      if (investmentsChanged) setFinancialConfig({ ...financialConfig, plaidInvestments: allInvests });

      const hadCachedSnapshot = hasCachedPlaidSnapshot(cards, bankAccounts, syncConnectionIds);
      const issueResults = results.filter(result => result?._error || result?._pendingSync);
      const issues = issueResults.map(result => ({
        institutionName: result?.institutionName || "Linked institution",
        pending: Boolean(result?._pendingSync),
        message: result?._pendingSync
          ? "Fresh balances are still processing."
          : String(result?._error || "Sync did not complete."),
      }));
      const syncOutcome = summarizeSyncOutcome({
        requestedCount,
        successCount,
        pendingCount,
        forceSyncSucceeded,
        hadCachedSnapshot,
        successMessage,
      });

      if (syncOutcome) {
        if (background) {
          const shouldRefreshTransactionsInBackground = !gatingEnforced || tier.id === "pro";
          if (shouldRefreshTransactionsInBackground) {
            await fetchAllTransactions(30, {
              connectionIds: syncConnectionIds,
              categorizeWithAi: false,
            }).catch(() => {});
          }
          if (issues.length > 0) {
            const issueNames = issues.slice(0, 2).map(issue => issue.institutionName).join(", ");
            _setSyncState({
              phase: "warning",
              requestedCount,
              completedCount: progressCompleted || requestedCount,
              activeInstitution: "",
              message: `Sync finished with ${issues.length} issue${issues.length === 1 ? "" : "s"}.`,
              warning:
                issues.length === 1
                  ? `${issueNames} needs attention. Catalyst kept your last saved data where available.`
                  : `${issueNames}${issues.length > 2 ? " and others" : ""} need attention. Catalyst kept your last saved data where available.`,
              issues,
              background: true,
            });
          } else {
            _resetSyncState();
          }
        } else if (syncOutcome.kind === "success") {
          haptic.success();
          if (window.toast) window.toast.success(syncOutcome.message);
          if (restoredCount > 0 && window.toast) {
            window.toast.info(
              `Restored ${restoredCount} ${restoredCount === 1 ? "linked account" : "linked accounts"} while syncing.`
            );
          }
          if (shouldFetchTransactionsForSync({
            autoFetchTransactions,
            effectiveTierId: tier.id,
            gatingEnforced,
          })) {
            await fetchAllTransactions(30, { connectionIds: syncConnectionIds }).catch(() => {});
          }
          _resetSyncState();
        } else {
          if (window.toast) window.toast.info(syncOutcome.message);
          if (restoredCount > 0) {
            window.toast?.info?.(
              `Restored ${restoredCount} ${restoredCount === 1 ? "linked account" : "linked accounts"} while syncing.`
            );
          }
          if (issues.length > 0) {
            const issueNames = issues.slice(0, 2).map(issue => issue.institutionName).join(", ");
            _setSyncState({
              phase: "warning",
              requestedCount,
              completedCount: progressCompleted || requestedCount,
              activeInstitution: "",
              message: `Sync finished with ${issues.length} issue${issues.length === 1 ? "" : "s"}.`,
              warning:
                issues.length === 1
                  ? `${issueNames} needs attention. Catalyst kept your last saved data where available.`
                  : `${issueNames}${issues.length > 2 ? " and others" : ""} need attention. Catalyst kept your last saved data where available.`,
              issues,
              background,
            });
          } else {
            _resetSyncState();
          }
        }
      } else {
        const firstErr = results.find(r => r._error)?._error || "No connections available";
        const reconnectCount = reconnectRequired.length;
        if (!background && reconnectCount > 0 && window.toast) {
          window.toast.error(
            reconnectCount === conns.length
              ? "Sync unavailable until your Plaid connections are reconnected in Settings."
              : `Sync failed for active connections. ${reconnectCount} linked bank${reconnectCount > 1 ? "s" : ""} also need reconnection in Settings.`
          );
        } else if (!background && window.toast) {
          window.toast.error(`Sync failed: ${firstErr}`);
        }
        if (issues.length > 0) {
          const issueNames = issues.slice(0, 2).map(issue => issue.institutionName).join(", ");
          _setSyncState({
            phase: "warning",
            requestedCount,
            completedCount: progressCompleted || requestedCount,
            activeInstitution: "",
            message: "Sync did not fully complete.",
            warning:
              issues.length === 1
                ? `${issueNames} could not be refreshed.`
                : `${issueNames}${issues.length > 2 ? " and others" : ""} could not be refreshed.`,
            issues,
            background,
          });
        } else {
          _resetSyncState();
        }
      }
    } catch (e) {
      const failure = normalizeAppError(e, { context: "sync" });
      log.error("sync", "Balance sync failed", { error: failure.rawMessage, kind: failure.kind });
      if (!background && window.toast) window.toast.error(failure.userMessage);
      _setSyncState({
        phase: "warning",
        requestedCount: syncConnectionIds.length,
        completedCount: 0,
        activeInstitution: "",
        message: "Sync did not complete.",
        warning: failure.userMessage,
        issues: [],
        background,
      });
    } finally {
      _setSyncing(false);
    }
  }, [
    cards,
    bankAccounts,
    financialConfig,
    setCards,
    setBankAccounts,
    setFinancialConfig,
    successMessage,
    autoFetchTransactions,
  ]);

  useEffect(() => {
    if (!autoMaintain) return;

    let cancelled = false;
    let resumeHandle = null;

    const runBackgroundSync = () => {
      if (cancelled) return;
      void sync({ background: true });
    };

    runBackgroundSync();

    const onVisibility = () => {
      if (!document.hidden) runBackgroundSync();
    };

    document.addEventListener("visibilitychange", onVisibility);

    if (Capacitor.isNativePlatform()) {
      CapApp.addListener("resume", () => {
        setTimeout(runBackgroundSync, 1500);
      }).then(handle => {
        resumeHandle = handle;
      }).catch(() => {});
    }

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      resumeHandle?.remove?.().catch?.(() => {});
    };
  }, [autoMaintain, sync]);

  return { syncing, sync, syncState };
}
