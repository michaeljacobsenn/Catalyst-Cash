/**
 * usePlaidSync — shared Plaid balance sync logic
 * Uses module-level state so sync status persists across tab switches.
 * Used by DashboardTab and CardPortfolioTab to avoid code duplication.
 */
  import { useCallback,useEffect,useState } from "react";
  import { haptic } from "./haptics.js";
  import {
    applyBalanceSync,
    fetchAllBalancesAndLiabilities,
    fetchAllTransactions,
    forceBackendSync,
    getConnections,
    saveConnectionLinks,
  } from "./plaid.js";
  import { getCurrentTier,isGatingEnforced } from "./subscription.js";

const SYNC_COOLDOWNS = {
  pro: 24 * 60 * 60 * 1000,
};

// ── Module-level sync state ──────────────────────────────────
// This ensures the sync spinner persists even when the user
// switches tabs (component unmount/remount). All mounted
// instances of usePlaidSync share the same underlying state.
let _isSyncing = false;
const _subscribers = new Set();
function _notifySubs() {
  _subscribers.forEach(fn => fn(_isSyncing));
}
function _setSyncing(v) {
  _isSyncing = v;
  _notifySubs();
}

/**
 * @param {Object} opts
 * @param {Array}  opts.cards
 * @param {Array}  opts.bankAccounts
 * @param {Object} opts.financialConfig
 * @param {Function} opts.setCards
 * @param {Function} opts.setBankAccounts
 * @param {Function} opts.setFinancialConfig
 * @param {string}   [opts.successMessage] — custom toast on success
 * @param {boolean}  [opts.autoFetchTransactions] — also pull transactions (Accounts tab)
 */
export function usePlaidSync({
  cards,
  bankAccounts,
  financialConfig,
  setCards,
  setBankAccounts,
  setFinancialConfig,
  successMessage = "Balances synced successfully",
  autoFetchTransactions = false,
}) {
  const [syncing, setSyncing] = useState(_isSyncing);

  // Subscribe to module-level sync state changes
  useEffect(() => {
    const handler = v => setSyncing(v);
    _subscribers.add(handler);
    // Re-sync on mount in case state changed while unmounted
    setSyncing(_isSyncing);
    return () => _subscribers.delete(handler);
  }, []);

  const sync = useCallback(async () => {
    if (_isSyncing) return;

    // 1. Check for existing connections
    const conns = await getConnections();
    if (conns.length === 0) {
      if (window.toast) window.toast.info("No bank connections — connect via Settings → Plaid");
      return;
    }
    const reconnectRequired = conns.filter(conn => conn?._needsReconnect);
    if (reconnectRequired.length === conns.length) {
      if (window.toast) {
        window.toast.info("Your linked banks need to be reconnected in Settings → Bank Connections before balances can sync.");
      }
      return;
    }

    // 2. Respect launch gating mode before blocking by tier
    const tier = await getCurrentTier();
    const gatingEnforced = isGatingEnforced();

    if (gatingEnforced && tier.id === "free") {
      if (window.toast) window.toast.info("Free accounts are frozen. Upgrade to Pro for Live Syncing.");
      window.dispatchEvent(new CustomEvent("open-pro-paywall"));
      return;
    }

    const cooldown = SYNC_COOLDOWNS.pro;
    const lastSync =
      cards.find(c => c._plaidLastSync)?._plaidLastSync || bankAccounts.find(b => b._plaidLastSync)?._plaidLastSync;
    if (lastSync && Date.now() - new Date(lastSync).getTime() < cooldown) {
      const minsLeft = Math.ceil((cooldown - (Date.now() - new Date(lastSync).getTime())) / 60000);
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

    // 3. Force backend to perform a live Plaid sync
    try {
      await forceBackendSync();
    } catch (e) {
      console.warn("[PlaidSync] Manual force sync encountered an issue:", e);
    }

    // 4. Fetch and apply balances from D1 Worker cache
    try {
      const results = await fetchAllBalancesAndLiabilities();
      let allCards = [...cards];
      let allBanks = [...bankAccounts];
      let allInvests = [...(financialConfig?.plaidInvestments || [])];
      let investmentsChanged = false;
      let successCount = 0;

      for (const res of results) {
        if (!res._error) {
          const syncData = applyBalanceSync(res, allCards, allBanks, allInvests);
          allCards = syncData.updatedCards;
          allBanks = syncData.updatedBankAccounts;
          if (syncData.updatedPlaidInvestments) {
            allInvests = syncData.updatedPlaidInvestments;
            investmentsChanged = true;
          }
          await saveConnectionLinks(res);
          successCount++;
        }
      }

      setCards(allCards);
      setBankAccounts(allBanks);
      if (investmentsChanged) setFinancialConfig({ ...financialConfig, plaidInvestments: allInvests });

      if (successCount > 0) {
        haptic.success();
        if (window.toast) window.toast.success(successMessage);
        // ONLY fetch transactions if autoFetchTransactions is requested AND user is on Pro tier
        if (autoFetchTransactions && (tier.id === "pro" || !gatingEnforced)) {
          await fetchAllTransactions(30).catch(() => { });
        }
      } else {
        const firstErr = results.find(r => r._error)?._error || "No connections available";
        const reconnectCount = reconnectRequired.length;
        if (reconnectCount > 0 && window.toast) {
          window.toast.error(
            reconnectCount === conns.length
              ? "Sync unavailable until your Plaid connections are reconnected in Settings."
              : `Sync failed for active connections. ${reconnectCount} linked bank${reconnectCount > 1 ? "s" : ""} also need reconnection in Settings.`
          );
        } else if (window.toast) {
          window.toast.error(`Sync failed: ${firstErr}`);
        }
      }
    } catch (e) {
      console.error("[PlaidSync] Failed:", e);
      if (window.toast) window.toast.error("Failed to sync balances");
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

  return { syncing, sync };
}
