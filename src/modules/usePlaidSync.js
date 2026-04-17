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
  import { readOnlineStatus } from "./onlineStatus.js";
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
export const PLAID_STALE_SYNC_THRESHOLD_MS = 10 * 60 * 1000;
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

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const PLAID_REFRESH_WINDOWS = {
  free: {
    balances: 7 * DAY_MS,
    transactions: 7 * DAY_MS,
    liabilities: 30 * DAY_MS,
  },
  pro: {
    balances: DAY_MS,
    transactions: 3 * DAY_MS,
    liabilities: 7 * DAY_MS,
  },
};

export function parsePlaidSyncTimestamp(value) {
  if (!value) return 0;
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }
  const raw = String(value).trim();
  if (!raw) return 0;

  // Plaid freshness coming from D1 often looks like `YYYY-MM-DD HH:MM:SS`
  // with no timezone. That value is UTC and must be interpreted as such
  // before formatting on the device.
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)
    ? raw
    : `${raw.replace(" ", "T")}Z`;

  const timestamp = new Date(normalized).getTime();
  if (Number.isFinite(timestamp)) return timestamp;

  const fallbackTimestamp = new Date(raw).getTime();
  return Number.isFinite(fallbackTimestamp) ? fallbackTimestamp : 0;
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
    const timestamp = parsePlaidSyncTimestamp(raw);
    return Number.isFinite(timestamp) ? timestamp : null;
  };

  const timestamps = [...cards, ...bankAccounts]
    .map(getTimestamp)
    .filter(timestamp => Number.isFinite(timestamp));

  if (timestamps.length === 0) return null;
  return Math.max(...timestamps);
}

function getPerConnectionPlaidSyncTimes(cards = [], bankAccounts = [], connectionIds = []) {
  const ids = Array.from(connectionIds || []).map(id => String(id || "").trim()).filter(Boolean);
  return new Map(ids.map((id) => [id, getMostRecentPlaidSyncTime(cards, bankAccounts, [id]) || 0]));
}

function toTimestamp(value) {
  return parsePlaidSyncTimestamp(value);
}

function formatSyncAgeLabel(value) {
  const timestamp = toTimestamp(value);
  if (!timestamp) return "the last cached sync";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return "the last cached sync";
  }
}

export function formatPlaidSyncDateShort(value) {
  const timestamp = toTimestamp(value);
  if (!timestamp) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    const date = new Date(timestamp);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${month}/${day}`;
  }
}

function formatWindowDuration(ms) {
  if (!ms || ms <= 0) return "real time";
  if (ms === DAY_MS) return "24 hours";
  if (ms === 3 * DAY_MS) return "72 hours";
  if (ms === 7 * DAY_MS) return "7 days";
  if (ms === 30 * DAY_MS) return "30 days";
  const days = ms / DAY_MS;
  if (Number.isInteger(days) && days > 0) return `${days} day${days === 1 ? "" : "s"}`;
  const hours = ms / HOUR_MS;
  if (Number.isInteger(hours) && hours > 0) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${Math.max(1, Math.round(ms / 60000))} minutes`;
}

function formatCompactDuration(ms) {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${totalMinutes % 60}m`;
  return `${totalMinutes}m`;
}

export function getPlaidRefreshWindowConfig({
  effectiveTierId = "free",
  gatingEnforced = false,
} = {}) {
  if (!gatingEnforced) return null;
  return PLAID_REFRESH_WINDOWS[effectiveTierId] || PLAID_REFRESH_WINDOWS.free;
}

export function buildPlaidRefreshCadenceCopy({
  effectiveTierId = "free",
  gatingEnforced = false,
} = {}) {
  const config = getPlaidRefreshWindowConfig({ effectiveTierId, gatingEnforced });
  if (!config) return "";
  return `Balance refreshes reopen every ${formatWindowDuration(config.balances)}. Transactions typically refresh every ${formatWindowDuration(config.transactions)}, and liabilities refresh every ${formatWindowDuration(config.liabilities)}.`;
}

function isSeverelyStaleSync(value, now = Date.now()) {
  const timestamp = toTimestamp(value);
  if (!timestamp) return false;
  return (now - timestamp) >= (24 * 60 * 60 * 1000);
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
  staleCount = 0,
  forceSyncSucceeded = true,
  hadCachedSnapshot = false,
  successMessage = "Balances synced successfully",
} = {}) {
  const normalizedRequestedCount = Math.max(requestedCount, successCount + pendingCount);
  const freshSuccessCount = Math.max(0, successCount - staleCount);

  if (freshSuccessCount > 0 && staleCount > 0) {
    return {
      kind: "info",
      message:
        staleCount === 1
          ? `Live balances refreshed for ${freshSuccessCount} institution. 1 institution is still connected but showing older cached balances.`
          : `Live balances refreshed for ${freshSuccessCount} institutions. ${staleCount} institutions are still connected but showing older cached balances.`,
    };
  }

  if (staleCount > 0 && freshSuccessCount === 0) {
    const institutionLabel = staleCount === 1 ? "institution is" : "institutions are";
    return {
      kind: "info",
      message: `Catalyst is showing older cached balances. ${staleCount} connected ${institutionLabel} did not return fresh data.`,
    };
  }

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

function appendSyncWarningDetail(base, extra) {
  const primary = String(base || "").trim();
  const detail = String(extra || "").trim();
  if (!primary) return detail || null;
  if (!detail) return primary;
  return `${primary} ${detail}`;
}

function buildIssueWarningMessage(allIssues = []) {
  if (allIssues.length === 0) return null;
  const issueNames = allIssues.slice(0, 2).map((issue) => issue.institutionName).join(", ");
  return allIssues.length === 1
    ? `${issueNames} needs attention. ${allIssues[0].message}`
    : `${issueNames}${allIssues.length > 2 ? " and others" : ""} need attention. Some connected institutions are still showing cached balances because Plaid returned older saved data or fresh balances have not landed yet.`;
}

export async function refreshTransactionsAfterSync({
  connectionIds = [],
  background = false,
  categorizeWithAi = true,
  fetchTransactions = fetchAllTransactions,
} = {}) {
  try {
    await fetchTransactions(30, {
      connectionIds,
      ...(categorizeWithAi === false ? { categorizeWithAi: false } : {}),
    });
    return { ok: true, warning: null };
  } catch (error) {
    const failure = normalizeAppError(error, { context: "sync" });
    log.warn("sync", "Transaction refresh after balance sync failed", {
      error: failure.rawMessage,
      kind: failure.kind,
      background,
      connectionCount: Array.isArray(connectionIds) ? connectionIds.length : 0,
    });
    return {
      ok: false,
      warning: background
        ? "Balances refreshed, but transaction history is still catching up. Recent spending may look older until the next refresh."
        : "Balances refreshed, but transaction history could not be updated right now. Recent spending may look older until the next refresh.",
    };
  }
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
    if (!readOnlineStatus()) {
      if (!background && window.toast) window.toast.info("You're offline — connect to the internet to sync.");
      return;
    }

    // 1. Check for existing connections
    const conns = await getConnections();
    const connectionNameById = new Map(
      (conns || [])
        .map((connection) => [String(connection?.id || "").trim(), String(connection?.institutionName || connection?.name || "Linked institution").trim()])
        .filter(([connectionId]) => connectionId)
    );
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
    const refreshWindowConfig = getPlaidRefreshWindowConfig({
      effectiveTierId: tier.id,
      gatingEnforced,
    });
    const refreshCadenceCopy = buildPlaidRefreshCadenceCopy({
      effectiveTierId: tier.id,
      gatingEnforced,
    });
    const lastSyncAt = getMostRecentPlaidSyncTime(cards, bankAccounts, syncConnectionIds);
    const preSyncTimestamps = getPerConnectionPlaidSyncTimes(cards, bankAccounts, syncConnectionIds);
    if (!background && cooldownEnforced && lastSyncAt && Date.now() - lastSyncAt < cooldown) {
      const remainingMs = cooldown - (Date.now() - lastSyncAt);
      const timeStr = formatCompactDuration(remainingMs);

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
    let forceSyncResult = {
      success: true,
      throttled: false,
      status: 200,
      message: "",
      reconnectRequired: false,
      failedItems: [],
    };
    try {
      if (background) {
        const maintainResult = await maintainBackendSync();
        forceSyncSucceeded = Boolean(maintainResult?.success);
      } else {
        forceSyncResult = await forceBackendSync({
          connectionId: gatingEnforced && rawTier.id === "free" ? syncConnectionIds[0] : null,
        });
        forceSyncSucceeded = Boolean(forceSyncResult?.success);
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
      const forceFailureIssues = (Array.isArray(forceSyncResult?.failedItems) ? forceSyncResult.failedItems : []).map((item) => {
            const connectionId = String(item?.itemId || "").trim();
            const mappedName = connectionNameById.get(connectionId);
            const fallbackName =
              mappedName ||
              String(item?.institutionName || item?.name || item?.itemId || "Linked institution").trim();
            return {
              institutionName: fallbackName,
              pending: false,
              message: item?.reconnectRequired
                ? `${item?.message || "Reconnect required."} Reconnect this institution in Settings → Bank Connections.`
                : String(item?.message || forceSyncResult?.message || "Live sync failed before fresh balances were returned."),
            };
          });

      for (const res of results) {
        if (!res._error && !res._pendingSync) {
          const hydratedState = ensureConnectionAccountsPresent(
            res,
            allCards,
            allBanks,
            cardCatalog,
            allInvests,
            { allowLikelyDuplicates: false }
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
      if (investmentsChanged) {
        setFinancialConfig({
          type: "SET_FIELD",
          field: "plaidInvestments",
          value: allInvests,
        });
      }

      const hadCachedSnapshot = hasCachedPlaidSnapshot(cards, bankAccounts, syncConnectionIds);
      const issueResults = results.filter(result => result?._error || result?._pendingSync);
      const issues = issueResults.map(result => ({
        institutionName: result?.institutionName || "Linked institution",
        pending: Boolean(result?._pendingSync),
        message: result?._pendingSync
          ? "Fresh balances are still processing."
          : String(result?._error || "Sync did not complete."),
      }));
      const staleIssues = results
        .filter(result => result && !result._error && !result._pendingSync)
        .map((result) => {
          const connectionId = String(result?.id || "").trim();
          if (!connectionId || !syncConnectionIds.includes(connectionId)) return null;
          const before = preSyncTimestamps.get(connectionId) || 0;
          const after = Math.max(toTimestamp(result?.lastSync), toTimestamp(result?.lastLiabilitySync));
          if (after <= 0) return null;
          if (forceSyncSucceeded && after > before) return null;
          const latestCachedLabel = formatSyncAgeLabel(result?.lastSync || result?.lastLiabilitySync);
          const severeStale = isSeverelyStaleSync(result?.lastSync || result?.lastLiabilitySync);
          const reconnectRequired = Boolean(forceSyncResult?.reconnectRequired);
          const cooldownHold = Boolean(forceSyncResult?.throttled);

          let cooldownStr = "";
          const balanceRefreshWindowMs = refreshWindowConfig?.balances || 0;
          if (balanceRefreshWindowMs > 0 && after > 0) {
            const remainingRefreshMs = balanceRefreshWindowMs - (Date.now() - after);
            if (remainingRefreshMs > 0) {
              cooldownStr = ` Next balance refresh available in ${formatCompactDuration(remainingRefreshMs)}.`;
            }
          }
          const cadenceSuffix = refreshCadenceCopy ? ` ${refreshCadenceCopy}` : "";

          return {
            institutionName: result?.institutionName || "Linked institution",
            pending: false,
            message: reconnectRequired
              ? `Reconnect is required in Settings → Bank Connections. Showing cached balances from ${latestCachedLabel} until Plaid can resume syncing.`
              : !forceSyncSucceeded
                ? `${cooldownHold ? "Manual balance refresh is still on cooldown" : "Plaid did not return fresh balances"}, so Catalyst is showing cached balances from ${latestCachedLabel}.${severeStale ? " This cache is now too old to trust for live decisions." : ""}${cooldownStr}${cadenceSuffix}`
                : `Plaid returned older cached balances from ${latestCachedLabel}. Reconnect is not currently required.${cooldownStr}${cadenceSuffix}`,
          };
        })
        .filter(Boolean);
      const allIssues = [...forceFailureIssues, ...issues, ...staleIssues].filter((issue, index, list) => {
        const key = `${issue?.institutionName || ""}::${issue?.message || ""}`;
        return list.findIndex((entry) => `${entry?.institutionName || ""}::${entry?.message || ""}` === key) === index;
      });
      const syncOutcome = summarizeSyncOutcome({
        requestedCount,
        successCount,
        pendingCount,
        staleCount: staleIssues.length,
        forceSyncSucceeded,
        hadCachedSnapshot,
        successMessage,
      });

      if (syncOutcome) {
        if (background) {
          const shouldRefreshTransactionsInBackground = !gatingEnforced || tier.id === "pro";
          let transactionRefresh = { ok: true, warning: null };
          if (shouldRefreshTransactionsInBackground) {
            transactionRefresh = await refreshTransactionsAfterSync({
              connectionIds: syncConnectionIds,
              background: true,
              categorizeWithAi: false,
            });
          }
          const issueWarning = buildIssueWarningMessage(allIssues);
          const warningMessage = appendSyncWarningDetail(issueWarning, transactionRefresh.warning);
          if (allIssues.length > 0 || !transactionRefresh.ok) {
            _setSyncState({
              phase: "warning",
              requestedCount,
              completedCount: progressCompleted || requestedCount,
              activeInstitution: "",
              message: `Sync finished with ${allIssues.length > 0 ? allIssues.length : 1} issue${(allIssues.length > 0 ? allIssues.length : 1) === 1 ? "" : "s"}.`,
              warning: warningMessage,
              issues: allIssues,
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
            const transactionRefresh = await refreshTransactionsAfterSync({
              connectionIds: syncConnectionIds,
              background: false,
            });
            if (!transactionRefresh.ok && window.toast) {
              window.toast.info(transactionRefresh.warning);
            }
          }
          _resetSyncState();
        } else {
          if (window.toast) window.toast.info(forceSyncSucceeded ? syncOutcome.message : (forceSyncResult?.message || syncOutcome.message));
          if (restoredCount > 0) {
            window.toast?.info?.(
              `Restored ${restoredCount} ${restoredCount === 1 ? "linked account" : "linked accounts"} while syncing.`
            );
          }
          if (allIssues.length > 0) {
            _setSyncState({
              phase: "warning",
              requestedCount,
              completedCount: progressCompleted || requestedCount,
              activeInstitution: "",
              message: `Sync finished with ${allIssues.length} issue${allIssues.length === 1 ? "" : "s"}.`,
              warning: buildIssueWarningMessage(allIssues),
              issues: allIssues,
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
        if (allIssues.length > 0) {
          const issueNames = allIssues.slice(0, 2).map(issue => issue.institutionName).join(", ");
          _setSyncState({
            phase: "warning",
            requestedCount,
            completedCount: progressCompleted || requestedCount,
            activeInstitution: "",
            message: "Sync did not fully complete.",
            warning:
              allIssues.length === 1
                ? `${issueNames} could not be refreshed. ${allIssues[0].message}`
                : `${issueNames}${allIssues.length > 2 ? " and others" : ""} could not be refreshed.`,
            issues: allIssues,
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
