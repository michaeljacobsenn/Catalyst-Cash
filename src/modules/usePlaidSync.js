/**
 * usePlaidSync — shared Plaid balance sync logic
 * Used by DashboardTab and CardPortfolioTab to avoid code duplication.
 */
import { useState, useCallback } from "react";
import { fetchAllBalancesAndLiabilities, applyBalanceSync, getConnections, saveConnectionLinks, fetchAllTransactions } from "./plaid.js";
import { getCurrentTier, isGatingEnforced } from "./subscription.js";
import { haptic } from "./haptics.js";

const SYNC_COOLDOWNS = { free: 60 * 60 * 1000, pro: 5 * 60 * 1000 };

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
    cards, bankAccounts, financialConfig,
    setCards, setBankAccounts, setFinancialConfig,
    successMessage = "Balances synced successfully",
    autoFetchTransactions = false,
}) {
    const [syncing, setSyncing] = useState(false);

    const sync = useCallback(async () => {
        if (syncing) return;

        // 1. Check for existing connections
        const conns = await getConnections();
        if (conns.length === 0) {
            if (window.toast) window.toast.info("No bank connections — connect via Settings → Plaid");
            return;
        }

        // 2. Enforce tier-based cooldown (skipped in soft gating mode)
        if (isGatingEnforced()) {
            const tier = await getCurrentTier();
            const cooldown = SYNC_COOLDOWNS[tier.id] || SYNC_COOLDOWNS.free;
            const lastSync = cards.find(c => c._plaidLastSync)?._plaidLastSync
                || bankAccounts.find(b => b._plaidLastSync)?._plaidLastSync;
            if (lastSync && (Date.now() - new Date(lastSync).getTime()) < cooldown) {
                const minsLeft = Math.ceil((cooldown - (Date.now() - new Date(lastSync).getTime())) / 60000);
                if (window.toast) window.toast.info(`Next sync in ${minsLeft} min${tier.id === "free" ? " (Pro: every 5 min)" : ""}`);
                return;
            }
        }

        // 3. Fetch and apply balances
        setSyncing(true);
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
                // Optionally auto-fetch transactions alongside balances
                if (autoFetchTransactions) {
                    fetchAllTransactions(30).catch(() => { });
                }
            } else {
                const firstErr = results.find(r => r._error)?._error || "No connections available";
                if (window.toast) window.toast.error(`Sync failed: ${firstErr}`);
            }
        } catch (e) {
            console.error("[PlaidSync] Failed:", e);
            if (window.toast) window.toast.error("Failed to sync balances");
        } finally {
            setSyncing(false);
        }
    }, [syncing, cards, bankAccounts, financialConfig, setCards, setBankAccounts, setFinancialConfig, successMessage, autoFetchTransactions]);

    return { syncing, sync };
}
