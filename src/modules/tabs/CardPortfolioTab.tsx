import { Suspense,lazy,memo,useCallback,useEffect,useMemo,useRef,useState } from "react";
import type { BankAccount,CatalystCashConfig,PlaidInvestmentAccount,Card as PortfolioCard,Renewal } from "../../types/index.js";
import { T } from "../constants.js";
import { haptic } from "../haptics.js";
import { clearDeletedManualHolding } from "../investmentHoldings.js";
import { log } from "../logger.js";
import {
  buildPortfolioDuplicateReviewGroups,
  findLikelyBankDuplicates,
  findLikelyCardDuplicates,
  reviewPlaidDuplicateCandidates,
  setDuplicateGroupAcknowledged,
} from "../plaidDuplicateResolution.js";
import {
  AlertTriangle,
  CheckCircle,
  Link2,
  Loader2,
  Plus,
  ReceiptText,
  RefreshCw,
} from "../icons";
import {
  applyBalanceSync,
  autoMatchAccounts,
  connectBank,
  fetchBalancesAndLiabilities,
  getConnections,
  purgeBrokenConnections,
  reassignStoredPlaidLink,
  saveConnectionLinks,
} from "../plaid.js";
import BankAccountsSection from "../portfolio/BankAccountsSection.js";
import CreditCardsSection from "../portfolio/CreditCardsSection.js";
import CreditUtilizationWidget from "../portfolio/CreditUtilizationWidget.js";
import {
  formatPlaidSyncDateTimeLabel,
  getLatestPlaidSyncDate,
  getStalePlaidInstitutions,
  splitPlaidInstitutionsByReconnect,
  summarizeConnectedButCached,
  summarizeReconnectRequired,
} from "../portfolio/plaidStatus.js";
import { formatPlaidSyncDateShort,usePlaidSync } from "../usePlaidSync.js";
import { fmt } from "../utils.js";
const InvestmentsSection = lazy(() => import("../portfolio/InvestmentsSection.js"));
const OtherAssetsSection = lazy(() => import("../portfolio/OtherAssetsSection.js"));
const TransactionsSection = lazy(() => import("../portfolio/TransactionsSection.js"));
const AddAccountSheet = lazy(() => import("./AddAccountSheet.js"));

const ENABLE_PLAID = true;

// One-time cleanup flag — runs once per app session
let _purgeDone = false;

function mergeUniqueById<T extends { id?: string | null }>(existing: T[] = [], incoming: T[] = []) {
  if (!incoming.length) return existing;
  const map = new Map(existing.map(item => [item.id, item]));
  for (const item of incoming) {
    if (item.id && !map.has(item.id)) map.set(item.id, item);
  }
  return Array.from(map.values());
}

function reviewManualCardDuplicate(cards: PortfolioCard[], draft: { institution: string; name: string; nickname?: string }) {
  const matches = findLikelyCardDuplicates(cards, draft);
  if (matches.length !== 1) return null;
  const existing = matches[0]?.card;
  if (!existing?.id) return null;
  const replace = window.confirm(
    `This looks similar to your existing card "${existing.nickname || existing.name}".\n\nPress OK to update that card instead of adding a duplicate.\nPress Cancel to keep both.`
  );
  return replace ? existing.id : null;
}

function reviewManualBankDuplicate(bankAccounts: BankAccount[], draft: { bank: string; accountType: string; name: string }) {
  const matches = findLikelyBankDuplicates(bankAccounts, draft);
  if (matches.length !== 1) return null;
  const existing = matches[0]?.account;
  if (!existing?.id) return null;
  const replace = window.confirm(
    `This looks similar to your existing account "${existing.name}".\n\nPress OK to update that account instead of adding a duplicate.\nPress Cancel to keep both.`
  );
  return replace ? existing.id : null;
}

function remapRenewalPaymentIds(
  renewals: Renewal[] = [],
  kind: "card" | "bank",
  fromId: string,
  toId: string,
): Renewal[] {
  return renewals.map((renewal) => {
    if (kind === "card") {
      const linkedCardId = String(renewal?.linkedCardId || "").trim();
      const chargedToId = String(renewal?.chargedToId || "").trim();
      const chargedToType = String(renewal?.chargedToType || "").trim().toLowerCase();
      if (linkedCardId !== fromId && !(chargedToType === "card" && chargedToId === fromId)) return renewal;
      const nextRenewal: Renewal = { ...renewal };
      if (linkedCardId === fromId) nextRenewal.linkedCardId = toId;
      if (chargedToType === "card" && chargedToId === fromId) nextRenewal.chargedToId = toId;
      return nextRenewal;
    }

    const chargedToId = String(renewal?.chargedToId || "").trim();
    const chargedToType = String(renewal?.chargedToType || "").trim().toLowerCase();
    if (!(chargedToType === "bank" && chargedToId === fromId)) return renewal;
    return {
      ...renewal,
      chargedToId: toId,
    };
  });
}

import { useAudit } from "../contexts/AuditContext.js";
import { PortfolioContext,usePortfolio } from "../contexts/PortfolioContext.js";
import { useSettings } from "../contexts/SettingsContext.js";
import useDashboardData from "../dashboard/useDashboardData.js";
import type { PortfolioCollapsedSections } from "../portfolio/types.js";

type AddSheetStep = "goal" | "asset" | "debt" | null;
type PlaidConnectResult = "success" | "error" | null;

interface CardPortfolioTabProps {
  onViewTransactions?: (() => void) | null;
  proEnabled?: boolean;
  embedded?: boolean;
  privacyMode?: boolean;
  themeTick?: number;
}

interface PlaidConnectionLike {
  id?: string;
  _needsReconnect?: boolean;
}

export default memo(function CardPortfolioTab({ onViewTransactions, proEnabled = false, embedded = false, privacyMode: _privacyModeTick = false, themeTick: _themeTick = 0 }: CardPortfolioTabProps) {
  void _privacyModeTick;
  void _themeTick;
  const { current } = useAudit();
  const portfolioContext = usePortfolio();
  const isTest = current?.isTest;

  const cards: PortfolioCard[] = isTest ? current.demoPortfolio?.cards || [] : portfolioContext.cards;
  const setCards = isTest ? () => { } : portfolioContext.setCards;
  const bankAccounts: BankAccount[] = isTest ? current.demoPortfolio?.bankAccounts || [] : portfolioContext.bankAccounts;
  const setBankAccounts = isTest ? () => { } : portfolioContext.setBankAccounts;
  const renewals = isTest ? current.demoPortfolio?.renewals || [] : portfolioContext.renewals;
  const setRenewals = isTest ? () => { } : portfolioContext.setRenewals;

  const { cardCatalog } = portfolioContext;
  const { financialConfig = {} as CatalystCashConfig, setFinancialConfig } = useSettings();
  const [plaidReconnectStatus, setPlaidReconnectStatus] = useState<Map<string, boolean>>(new Map());
  const linkedPlaidItems = useMemo(() => [...cards, ...bankAccounts], [cards, bankAccounts]);

  // Bring in unified master metrics globally calculated
  const { portfolioMetrics, movePlan } = useDashboardData();
  const lastPlaidSyncAt = useMemo(() => getLatestPlaidSyncDate(linkedPlaidItems), [linkedPlaidItems]);
  const lastPlaidSyncLabel = useMemo(() => formatPlaidSyncDateTimeLabel(lastPlaidSyncAt), [lastPlaidSyncAt]);
  const lastPlaidSyncDateShort = useMemo(
    () => formatPlaidSyncDateShort(lastPlaidSyncAt),
    [lastPlaidSyncAt]
  );
  const stalePlaidInstitutions = useMemo(() => getStalePlaidInstitutions(linkedPlaidItems), [linkedPlaidItems]);
  const stalePlaidBreakdown = useMemo(
    () => splitPlaidInstitutionsByReconnect(stalePlaidInstitutions, plaidReconnectStatus),
    [stalePlaidInstitutions, plaidReconnectStatus]
  );
  const staleConnectedSummary = useMemo(() => {
    return summarizeConnectedButCached(stalePlaidBreakdown.connectedButCached);
  }, [stalePlaidBreakdown]);
  const reconnectRequiredSummary = useMemo(() => {
    return summarizeReconnectRequired(stalePlaidBreakdown.reconnectRequired);
  }, [stalePlaidBreakdown]);
  const duplicateReviewGroups = useMemo(
    () =>
      buildPortfolioDuplicateReviewGroups({
        cards,
        bankAccounts,
        acknowledgedKeys: financialConfig?.acknowledgedDuplicateKeys || [],
      }),
    [cards, bankAccounts, financialConfig?.acknowledgedDuplicateKeys]
  );

  useEffect(() => {
    let cancelled = false;
    void getConnections()
      .then((connections = []) => {
        if (cancelled) return;
        const next = new Map();
        for (const connection of connections as Array<PlaidConnectionLike | undefined>) {
          const connectionId = String(connection?.id || "").trim();
          if (!connectionId) continue;
          next.set(connectionId, Boolean(connection?._needsReconnect));
        }
        setPlaidReconnectStatus(next);
      })
      .catch(() => {
        if (!cancelled) setPlaidReconnectStatus(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [linkedPlaidItems]);

  const demoOverrideContext = useMemo(() => {
    if (!isTest) return portfolioContext;
    return {
      ...portfolioContext,
      cards, setCards,
      bankAccounts, setBankAccounts,
      renewals, setRenewals,
    };
  }, [isTest, portfolioContext, cards, bankAccounts, renewals]);

  useState<AddSheetStep>(null); // kept for legacy compat
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [addSheetStep, setAddSheetStep] = useState<AddSheetStep>(null);
  const [plaidLoading, setPlaidLoading] = useState(false);
  const [plaidResult, setPlaidResult] = useState<PlaidConnectResult>(null);
  const [plaidError, setPlaidError] = useState<string | null>(null);
  const openSheet = (step: AddSheetStep = null) => {
    setShowAddSheet(true);
    setAddSheetStep(step);
    setPlaidResult(null);
    setPlaidError(null);
  };
  const closeSheet = () => {
    setShowAddSheet(false);
    setAddSheetStep(null);
    setPlaidResult(null);
    setPlaidError(null);
  };

  // Purge broken connections (missing access token due to previous bug) on first mount
  useEffect(() => {
    if (_purgeDone) return;
    _purgeDone = true;
    purgeBrokenConnections()
      .then(count => {
        if (count > 0) {
          window.toast?.info?.(`Removed ${count} broken connection(s) — please reconnect via Plaid`);
        }
      })
      .catch(() => { });
  }, []);
  const handlePlaidConnect = async () => {
    setPlaidLoading(true);
    setPlaidResult(null);
    setPlaidError(null);
    try {
      await connectBank(
        async connection => {
          const plaidInvestments = financialConfig.plaidInvestments || [];
          const {
            newCards,
            newBankAccounts,
            newPlaidInvestments,
            duplicateCandidates = [],
          } = autoMatchAccounts(
            connection,
            cards,
            bankAccounts,
            cardCatalog as null | undefined,
            plaidInvestments
          ) as {
            newCards: PortfolioCard[];
            newBankAccounts: BankAccount[];
            newPlaidInvestments: PlaidInvestmentAccount[];
            duplicateCandidates: Array<{
              kind: "card" | "bank";
              plaidAccountId: string;
              importedId: string;
              importedLabel: string;
              institution: string;
              existingIds: string[];
            }>;
          };
          const duplicateReview = reviewPlaidDuplicateCandidates({
            connection,
            newCards,
            newBankAccounts,
            duplicateCandidates,
            cards,
            bankAccounts,
          });
          await saveConnectionLinks(connection);

          // Build deterministic local snapshot so we do not drop new Plaid records.
          const allCards = mergeUniqueById<PortfolioCard>(cards, duplicateReview.newCards);
          const allBanks = mergeUniqueById<BankAccount>(bankAccounts, duplicateReview.newBankAccounts);
          const allInvests = mergeUniqueById<PlaidInvestmentAccount>(plaidInvestments, newPlaidInvestments);
          setCards(allCards);
          setBankAccounts(allBanks);
          if (newPlaidInvestments.length > 0) {
            setFinancialConfig({ type: "SET_FIELD", field: "plaidInvestments", value: allInvests });
          }

          // Fetch live balances and apply them
          try {
            const refreshed = await fetchBalancesAndLiabilities(connection.id);
            if (refreshed) {
              const { updatedCards, updatedBankAccounts, updatedPlaidInvestments } = applyBalanceSync(
                refreshed,
                allCards,
                allBanks,
                allInvests
              ) as { updatedCards: PortfolioCard[]; updatedBankAccounts: BankAccount[]; updatedPlaidInvestments?: PlaidInvestmentAccount[] };
              setCards(updatedCards);
              setBankAccounts(updatedBankAccounts);
              if (updatedPlaidInvestments) {
                setFinancialConfig({ type: "SET_FIELD", field: "plaidInvestments", value: updatedPlaidInvestments });
              }
              await saveConnectionLinks(refreshed);
            }
          } catch (balErr) {
            const message = balErr instanceof Error ? balErr.message : String(balErr);
            void log.error("plaid", "Balance fetch after connect failed", { error: message });
            window.toast?.info?.("Connected! Tap Sync to fetch balances.");
          }

          setPlaidResult("success");
          setCollapsedSections(p => ({ ...p, creditCards: false, bankAccounts: false }));

          // Count what was imported for the review alert
          const importedCount = duplicateReview.newCards.length + duplicateReview.newBankAccounts.length + newPlaidInvestments.length;
          const ambiguousDuplicateCount = duplicateReview.ambiguousCount;

          setTimeout(() => {
            closeSheet();
            // Native iOS alert prompting user to review imported accounts
            if (importedCount > 0) {
              setTimeout(() => {
                window.alert(
                  `${importedCount} account${importedCount !== 1 ? "s" : ""} imported!\n\n` +
                  'Plaid may assign generic names like "Credit Card" instead of the actual product name.\n\n' +
                  "Please tap the Edit button on each imported account to verify and update:\n" +
                  "• Card name (e.g. Sapphire Preferred)\n" +
                  "• APR\n" +
                  "• Annual fee & due date\n" +
                  "• Statement close & payment due days"
                );
              }, 400);
            }
            if (ambiguousDuplicateCount > 0) {
              setTimeout(() => {
                window.alert(
                  `${ambiguousDuplicateCount} imported account${ambiguousDuplicateCount !== 1 ? "s may" : " may"} overlap existing records, but the match was ambiguous.\n\nCatalyst kept them separate so nothing was merged automatically. Review them in Portfolio and keep or remove the duplicates you want.`
                );
              }, importedCount > 0 ? 850 : 400);
            }
          }, 2200);
        },
        err => {
          if (err?.message !== "cancelled") {
            setPlaidResult("error");
            const msg = err?.message || "Connection failed";
            setPlaidError(msg);
            window.toast?.error?.(msg);
          }
        }
      );
    } finally {
      setPlaidLoading(false);
    }
  };

  // Plaid balance sync via shared hook
  const { syncing: plaidRefreshing, sync: handleRefreshPlaid, syncState } = usePlaidSync({
    cards,
    bankAccounts,
    financialConfig,
    setCards,
    setBankAccounts,
    setFinancialConfig,
    cardCatalog,
    successMessage: "Synced balances successfully",
    autoFetchTransactions: true,
    autoMaintain: true,
  });
  // Master collapsible sections (all collapsed by default for a clean, compact view)
  const [collapsedSections, setCollapsedSections] = useState<PortfolioCollapsedSections>({
    creditCards: true,
    bankAccounts: true,
    savingsAccounts: true,
    investments: true,
    savingsGoals: true,
    otherAssets: true,
    debts: true,
    transactions: true,
  });  // ── Pull-to-refresh ──────────────────────────────────────────
  const pullStartYRef = useRef<number | null>(null);
  const [pullProgress, setPullProgress] = useState(0); // 0–1
  const [pullTriggered, setPullTriggered] = useState(false);
  const PULL_THRESHOLD = 64;
  const hapticFiredRef = useRef(false);

  const isAtScrollTop = useCallback((el: HTMLDivElement) => {
    // Works universally: checks both the element and window scroll position
    return el.scrollTop <= 0 && window.scrollY <= 0;
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const el = e.currentTarget as HTMLDivElement;
    if (isAtScrollTop(el)) {
      pullStartYRef.current = e.touches[0]?.clientY ?? null;
      hapticFiredRef.current = false;
    }
  }, [isAtScrollTop]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (pullStartYRef.current === null) return;
    const touch = e.touches[0];
    if (!touch) return;
    const delta = touch.clientY - pullStartYRef.current;
    if (delta <= 0) { setPullProgress(0); return; }
    const progress = Math.min(delta / PULL_THRESHOLD, 1);
    setPullProgress(progress);
    // Fire haptic exactly once when crossing the threshold
    if (progress >= 1 && !hapticFiredRef.current) {
      hapticFiredRef.current = true;
      haptic.impact?.() ?? haptic.medium?.();
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (pullProgress >= 1 && !plaidRefreshing) {
      setPullTriggered(true);
      void handleRefreshPlaid().finally(() => setPullTriggered(false));
    }
    pullStartYRef.current = null;
    setPullProgress(0);
    hapticFiredRef.current = false;
  }, [pullProgress, plaidRefreshing, handleRefreshPlaid]);

  const dismissDuplicateGroup = useCallback((groupKey: string) => {
    setFinancialConfig((prev: CatalystCashConfig) =>
      setDuplicateGroupAcknowledged(prev, groupKey, true) as CatalystCashConfig
    );
  }, [setFinancialConfig]);

  const mergeDuplicateGroup = useCallback(async (group: {
    key: string;
    kind: "card" | "bank";
    preferredKeepId?: string;
    preferredRemoveId?: string;
    left: PortfolioCard | BankAccount;
    right: PortfolioCard | BankAccount;
  }) => {
    const keepId = String(group?.preferredKeepId || "").trim();
    const removeId = String(group?.preferredRemoveId || "").trim();
    if (!keepId || !removeId) return;

    if (group.kind === "card") {
      const keepCard = cards.find((card) => card.id === keepId);
      const removeCard = cards.find((card) => card.id === removeId);
      if (!keepCard || !removeCard || !removeCard._plaidAccountId || !removeCard._plaidConnectionId) return;

      const mergedCard: PortfolioCard = {
        ...removeCard,
        ...keepCard,
        id: keepCard.id,
        institution: keepCard.institution || removeCard.institution,
        name: keepCard.name || removeCard.name,
        nickname: keepCard.nickname || removeCard.nickname || "",
        notes: keepCard.notes || removeCard.notes || "",
        last4: keepCard.last4 || removeCard.last4 || removeCard.mask || null,
        mask: keepCard.mask || removeCard.mask || null,
        limit: keepCard.limit ?? removeCard.limit ?? removeCard._plaidLimit ?? null,
        _plaidAccountId: removeCard._plaidAccountId,
        _plaidConnectionId: removeCard._plaidConnectionId,
        _plaidBalance: removeCard._plaidBalance ?? null,
        _plaidAvailable: removeCard._plaidAvailable ?? null,
        _plaidLimit: removeCard._plaidLimit ?? null,
        ...(typeof removeCard._plaidManualFallback === "boolean"
          ? { _plaidManualFallback: removeCard._plaidManualFallback }
          : {}),
      };

      const reassigned = await reassignStoredPlaidLink({
        connectionId: removeCard._plaidConnectionId,
        plaidAccountId: removeCard._plaidAccountId,
        linkedCardId: keepId,
      }).catch(() => false);
      if (!reassigned) {
        window.toast?.error?.("Could not safely merge that duplicate card right now. Try again after reconnecting Plaid.");
        return;
      }

      setCards(cards.filter((card) => card.id !== removeId).map((card) => (card.id === keepId ? mergedCard : card)));
      setRenewals(remapRenewalPaymentIds(renewals, "card", removeId, keepId));
      setFinancialConfig((prev: CatalystCashConfig) =>
        setDuplicateGroupAcknowledged(prev, group.key, true) as CatalystCashConfig
      );
      window.toast?.success?.(`Merged duplicate card into "${mergedCard.nickname || mergedCard.name}".`);
      return;
    }

    const keepBank = bankAccounts.find((account) => account.id === keepId);
    const removeBank = bankAccounts.find((account) => account.id === removeId);
    if (!keepBank || !removeBank || !removeBank._plaidAccountId || !removeBank._plaidConnectionId) return;

    const mergedBank: BankAccount = {
      ...removeBank,
      ...keepBank,
      id: keepBank.id,
      bank: keepBank.bank || removeBank.bank,
      name: keepBank.name || removeBank.name,
      notes: keepBank.notes || removeBank.notes || "",
      _plaidAccountId: removeBank._plaidAccountId,
      _plaidConnectionId: removeBank._plaidConnectionId,
      _plaidBalance: removeBank._plaidBalance ?? null,
      _plaidAvailable: removeBank._plaidAvailable ?? null,
      ...(typeof removeBank._plaidManualFallback === "boolean"
        ? { _plaidManualFallback: removeBank._plaidManualFallback }
        : {}),
    };

    const reassigned = await reassignStoredPlaidLink({
      connectionId: removeBank._plaidConnectionId,
      plaidAccountId: removeBank._plaidAccountId,
      linkedBankAccountId: keepId,
    }).catch(() => false);
    if (!reassigned) {
      window.toast?.error?.("Could not safely merge that duplicate account right now. Try again after reconnecting Plaid.");
      return;
    }

    setBankAccounts(bankAccounts.filter((account) => account.id !== removeId).map((account) => (account.id === keepId ? mergedBank : account)));
    setRenewals(remapRenewalPaymentIds(renewals, "bank", removeId, keepId));
    setFinancialConfig((prev: CatalystCashConfig) =>
      setDuplicateGroupAcknowledged(prev, group.key, true) as CatalystCashConfig
    );
    window.toast?.success?.(`Merged duplicate account into "${mergedBank.name}".`);
  }, [bankAccounts, cards, renewals, setBankAccounts, setCards, setFinancialConfig, setRenewals]);




  // ─── Early computations for Wealth Dashboard ─────────────────────
  // ── Unified Master Metrics (Vault Header Display) ──
  const netWorth = portfolioMetrics?.netWorth || 0;
  const totalCash = portfolioMetrics?.liquidCash || 0;
  const totalDebtBalance = (portfolioMetrics?.totalDebtBalance || 0) + (portfolioMetrics?.ccDebt || 0);
  const investTotalValue = portfolioMetrics?.totalInvestments || 0;
  const totalOtherAssets = portfolioMetrics?.totalOtherAssets || 0;
  const breakdownValueStyle = {
    fontSize: embedded ? 15 : 16,
    fontWeight: 800,
    fontFamily: T.font.mono,
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "-0.02em",
    whiteSpace: "nowrap" as const,
    display: "block",
    lineHeight: 1.05,
  };

  // ── CREDIT UTILIZATION WIDGET (Moved to separate module) ──

  const headerSection = (
    <>
      {/* ─── Premium Wealth Dashboard Hero ─── */}
      <div style={{
        display: "flex", flexDirection: "column", gap: embedded ? 10 : 12,
        background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.elevated})`,
        border: `1px solid ${T.border.default}`,
        borderRadius: T.radius.lg,
        padding: embedded ? "12px 12px 14px" : "16px 14px 18px",
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04)`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: T.font.mono, marginBottom: 6 }}>
              Portfolio Snapshot
            </h1>
            <div style={{ fontSize: embedded ? 28 : 32, fontWeight: 850, color: T.text.primary, letterSpacing: "-0.04em", lineHeight: 1.02 }}>
              {fmt(netWorth)}
            </div>
          </div>
          
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => openSheet()}
              className="hover-btn card-press"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: 18,
                background: T.bg.elevated,
                color: T.accent.primary,
                border: `1px solid ${T.border.subtle}`,
                cursor: "pointer",
                transition: "all .2s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
              title="Add Account"
            >
              <Plus size={16} strokeWidth={2.5} color={T.accent.primary} />
            </button>
            {ENABLE_PLAID && (
              <button
                onClick={() => { haptic.medium(); void handlePlaidConnect(); }}
                disabled={plaidLoading}
                className="hover-btn card-press"
                style={{
                  display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: 18,
                background: T.bg.elevated,
                border: `1px solid ${T.border.subtle}`,
                color: T.text.primary,
                cursor: plaidLoading ? "wait" : "pointer",
                opacity: plaidLoading ? 0.6 : 1,
                  transition: "all .2s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
                title="Plaid Sync"
              >
                {plaidLoading ? <Loader2 size={16} className="spin" color={T.text.primary} /> : <Link2 size={16} strokeWidth={2.5} color={T.text.primary} />}
              </button>
            )}
          </div>
        </div>

        {/* Wealth Breakdown */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: embedded ? 5 : 6 }}>
          <div style={{ background: T.bg.card, border: `1px solid ${T.border.subtle}`, borderRadius: T.radius.md, padding: embedded ? "8px 6px" : "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: T.text.dim, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 3 }}>Liquid Cash</div>
            <span style={{ ...breakdownValueStyle, color: T.accent.emerald }}>{fmt(totalCash)}</span>
          </div>
          <div style={{ background: T.bg.card, border: `1px solid ${T.border.subtle}`, borderRadius: T.radius.md, padding: embedded ? "8px 6px" : "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: T.text.dim, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 3 }}>Investments</div>
            <span style={{ ...breakdownValueStyle, color: T.status.blue }}>{fmt(investTotalValue + totalOtherAssets)}</span>
          </div>
          <div style={{ background: T.bg.card, border: `1px solid ${T.border.subtle}`, borderRadius: T.radius.md, padding: embedded ? "8px 6px" : "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: T.text.dim, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 3 }}>Liabilities</div>
            <span style={{ ...breakdownValueStyle, color: T.status.red }}>{fmt(Math.abs(totalDebtBalance))}</span>
          </div>
        </div>
      </div>

      {/* ─── Top Level Credit Health ─── */}
      <CreditUtilizationWidget />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: embedded ? 10 : 12,
          marginBottom: 8,
          padding: "0 4px",
        }}
      >
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {onViewTransactions && (
            <button
              onClick={() => { haptic.light(); onViewTransactions(); }}
              className="hover-btn"
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 16, border: `1px solid ${T.border.subtle}`, background: T.bg.elevated, color: T.text.primary, fontSize: 10, fontWeight: 700, cursor: "pointer", transition: "all .2s", position: "relative" }}
            >
              <ReceiptText size={10} /> Ledger
              {!proEnabled && <div style={{ position: "absolute", top: -4, right: -4, fontSize: 7, fontWeight: 800, background: T.accent.primary, color: "#fff", padding: "1px 4px", borderRadius: 4, fontFamily: T.font.mono }}>PRO</div>}
            </button>
          )}
          {ENABLE_PLAID && (cards.some(c => c._plaidAccountId) || bankAccounts.some(b => b._plaidAccountId)) && (
            <button
              onClick={handleRefreshPlaid}
              disabled={plaidRefreshing}
              className="hover-btn"
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 16, border: `1px solid ${T.border.subtle}`, background: T.bg.elevated, color: T.text.primary, fontSize: 10, fontWeight: 700, cursor: plaidRefreshing ? "wait" : "pointer", transition: "all .2s" }}
            >
              <RefreshCw
                size={10}
                style={plaidRefreshing ? { animation: "spin .8s linear infinite", transformOrigin: "center" } : undefined}
              />
              {plaidRefreshing ? "Refreshing..." : "Refresh Balances"}
            </button>
          )}
        </div>

        <button
          onClick={toggleAllSections}
          className="hover-btn"
          style={{ border: "none", background: "transparent", color: T.text.dim, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: T.font.mono, letterSpacing: "0.04em" }}
        >
          {Object.values(collapsedSections).every(Boolean) ? "Expand All" : "Collapse All"}
        </button>
      </div>

      {(syncState.phase === "syncing" || syncState.phase === "warning") && (
        (() => {
          const visibleIssues = Array.isArray(syncState.issues)
            ? syncState.issues.slice(0, 4) as Array<{ institutionName?: string; message?: string }>
            : [];
          return (
        <div
          style={{
            marginTop: 6,
            marginBottom: 10,
            padding: "12px 14px",
            borderRadius: T.radius.md,
            border: `1px solid ${syncState.phase === "warning" ? `${T.status.amber}35` : `${T.status.blue}28`}`,
            background:
              syncState.phase === "warning"
                ? T.bg.card
                : T.bg.card,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            {syncState.phase === "warning" ? (
              <AlertTriangle size={14} color={T.status.amber} />
            ) : (
              <RefreshCw size={14} color={T.status.blue} style={{ animation: "spin .9s linear infinite", transformOrigin: "center" }} />
            )}
            <div style={{ fontSize: 12, fontWeight: 800, color: T.text.primary }}>
              {syncState.phase === "warning" ? "Bank sync needs attention" : syncState.message}
            </div>
            {syncState.phase === "syncing" && (
              <div style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: T.text.secondary, fontFamily: T.font.mono }}>
                {syncState.completedCount}/{Math.max(syncState.requestedCount, 1)}
              </div>
            )}
          </div>
          {syncState.phase === "syncing" ? (
            <>
              <div
                style={{
                  height: 6,
                  borderRadius: 999,
                  background: T.bg.elevated,
                  overflow: "hidden",
                  border: `1px solid ${T.border.subtle}`,
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    width: `${Math.round((syncState.completedCount / Math.max(syncState.requestedCount, 1)) * 100)}%`,
                    height: "100%",
                    background: `linear-gradient(90deg, ${T.status.blue}, ${T.accent.primary})`,
                    transition: "width .25s ease",
                  }}
                />
              </div>
              <div style={{ fontSize: 11, color: T.text.secondary }}>
                {syncState.activeInstitution ? `Refreshing ${syncState.activeInstitution}...` : "Refreshing linked accounts..."}
              </div>
            </>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.5 }}>
                {syncState.warning}
              </div>
              {visibleIssues.length > 0 && (
                <div style={{ display: "grid", gap: 6 }}>
                  {visibleIssues.map((issue, index) => (
                    <div
                      key={`${issue?.institutionName || "issue"}-${index}`}
                      style={{
                        padding: "8px 10px",
                        borderRadius: T.radius.sm,
                        background: `${T.bg.elevated}D0`,
                        border: `1px solid ${T.border.subtle}`,
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.text.primary }}>
                        {issue?.institutionName || "Linked institution"}
                      </div>
                      <div style={{ marginTop: 2, fontSize: 10.5, color: T.text.secondary, lineHeight: 1.45 }}>
                        {issue?.message || "Needs attention."}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
          );
        })()
      )}

      {lastPlaidSyncLabel && syncState.phase === "idle" && (
        <div
          style={{
            marginTop: 4,
            marginBottom: 10,
            padding: "10px 12px",
            borderRadius: T.radius.md,
            border: `1px solid ${T.border.subtle}`,
            background: T.bg.card,
            fontSize: 11,
            color: T.text.secondary,
            lineHeight: 1.55,
          }}
        >
          Plaid-linked balances are shown from the last verified sync. Latest Plaid refresh: <span style={{ color: T.text.primary, fontWeight: 700 }}>{lastPlaidSyncDateShort || lastPlaidSyncLabel}</span>.
          {staleConnectedSummary ? (
            <div style={{ marginTop: 6, color: T.status.amber }}>
              Some institutions are still showing cached balances because Plaid returned older saved data or fresh balances have not landed yet: <span style={{ color: T.text.primary, fontWeight: 700 }}>{staleConnectedSummary}</span>.
              <span style={{ color: T.text.secondary }}> Reconnect is not currently required for these institutions.</span>
            </div>
          ) : null}
          {reconnectRequiredSummary ? (
            <div style={{ marginTop: 6, color: T.status.red }}>
              Reconnect required before live balances can resume: <span style={{ color: T.text.primary, fontWeight: 700 }}>{reconnectRequiredSummary}</span>.
            </div>
          ) : null}
        </div>
      )}

      {duplicateReviewGroups.length > 0 && (
        <div
          style={{
            marginTop: 4,
            padding: "12px 14px",
            borderRadius: T.radius.lg,
            border: `1px solid ${T.status.amber}24`,
            background: T.bg.card,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 8,
                background: `${T.status.amber}18`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Link2 size={13} color={T.status.amber} strokeWidth={2.5} />
            </div>
            <div style={{ fontSize: 12, fontWeight: 800, color: T.text.primary }}>
              Review possible duplicate accounts
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.text.dim }}>
              {duplicateReviewGroups.length} to review
            </div>
          </div>
          <div style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.5 }}>
            Catalyst kept these overlaps separate so nothing was merged automatically. If one is your original manual record and the other is the later Plaid-linked version, you can merge them safely here.
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {duplicateReviewGroups.slice(0, 4).map((group) => {
              const leftLabel = group.kind === "card"
                ? ((group.left as PortfolioCard).nickname || (group.left as PortfolioCard).name)
                : (group.left as BankAccount).name;
              const rightLabel = group.kind === "card"
                ? ((group.right as PortfolioCard).nickname || (group.right as PortfolioCard).name)
                : (group.right as BankAccount).name;
              const leftMeta = group.kind === "card"
                ? `${(group.left as PortfolioCard).institution}${(group.left as PortfolioCard)._plaidAccountId ? " · linked" : " · manual"}`
                : `${(group.left as BankAccount).bank}${(group.left as BankAccount)._plaidAccountId ? " · linked" : " · manual"}`;
              const rightMeta = group.kind === "card"
                ? `${(group.right as PortfolioCard).institution}${(group.right as PortfolioCard)._plaidAccountId ? " · linked" : " · manual"}`
                : `${(group.right as BankAccount).bank}${(group.right as BankAccount)._plaidAccountId ? " · linked" : " · manual"}`;

              return (
                <div
                  key={group.key}
                  style={{
                    padding: "10px 12px",
                    borderRadius: T.radius.md,
                    border: `1px solid ${T.border.subtle}`,
                    background: T.bg.elevated,
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.text.primary }}>
                      {group.kind === "card" ? "Card overlap" : "Account overlap"}
                    </div>
                    <div style={{ fontSize: 10, color: T.status.amber, fontWeight: 700 }}>
                      {group.reason}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.text.primary }}>{leftLabel}</div>
                      <div style={{ fontSize: 10, color: T.text.dim }}>{leftMeta}</div>
                    </div>
                    <div style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono }}>vs</div>
                    <div style={{ minWidth: 0, textAlign: "right" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.text.primary }}>{rightLabel}</div>
                      <div style={{ fontSize: 10, color: T.text.dim }}>{rightMeta}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {group.actionable && (
                      <button
                        onClick={() => { void mergeDuplicateGroup(group); }}
                        style={{
                          padding: "7px 10px",
                          borderRadius: 999,
                          border: `1px solid ${T.accent.emerald}30`,
                          background: `${T.accent.emerald}12`,
                          color: T.accent.emerald,
                          cursor: "pointer",
                          fontSize: 10,
                          fontWeight: 800,
                        }}
                      >
                        Link + keep existing
                      </button>
                    )}
                    <button
                      onClick={() => dismissDuplicateGroup(group.key)}
                      style={{
                        padding: "7px 10px",
                        borderRadius: 999,
                        border: `1px solid ${T.border.default}`,
                        background: T.bg.card,
                        color: T.text.secondary,
                        cursor: "pointer",
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    >
                      Keep both
                    </button>
                  </div>
                </div>
              );
            })}
            {duplicateReviewGroups.length > 4 && (
              <div style={{ fontSize: 10, color: T.text.dim }}>
                {duplicateReviewGroups.length - 4} more possible overlap{duplicateReviewGroups.length - 4 === 1 ? "" : "s"} remain after these.
              </div>
            )}
          </div>
        </div>
      )}

      {movePlan.activeCount > 0 && (
        <div
          style={{
            marginTop: 4,
            padding: "12px 14px",
            borderRadius: T.radius.lg,
            border: `1px solid ${T.accent.emerald}24`,
            background: T.bg.card,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 8,
                background: `${T.accent.emerald}18`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckCircle size={13} color={T.accent.emerald} strokeWidth={2.5} />
            </div>
            <div style={{ fontSize: 12, fontWeight: 800, color: T.text.primary }}>
              Completed audit moves are previewed until balances catch up
            </div>
            {movePlan.reconciledCount > 0 && (
              <div style={{ fontSize: 10, fontWeight: 700, color: T.text.dim }}>
                {movePlan.reconciledCount} already reflected
              </div>
            )}
          </div>
          <div style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.5 }}>
            Actual balances stay authoritative. Planned changes show the remaining effect of checked moves so Portfolio still helps between sync windows.
          </div>
          {movePlan.highlights.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {movePlan.highlights.map((highlight) => (
                <div
                  key={`${highlight.label}-${highlight.delta}`}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: `${highlight.delta < 0 ? T.status.red : T.accent.emerald}10`,
                    border: `1px solid ${highlight.delta < 0 ? T.status.red : T.accent.emerald}18`,
                    color: highlight.delta < 0 ? T.status.red : T.accent.emerald,
                    fontSize: 10,
                    fontWeight: 800,
                    fontFamily: T.font.mono,
                  }}
                >
                  {highlight.label} {highlight.delta < 0 ? "" : "+"}{fmt(highlight.delta)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );

  const creditCardsSection = (
    <CreditCardsSection
      collapsedSections={collapsedSections}
      setCollapsedSections={setCollapsedSections}
      plannedCardBalances={movePlan.cardTargets}
    />
  );

  // Split bank accounts by type for separate sections

  // ─── Bank Accounts Section (Render) ──────────────────────────────────
  const bankAccountsSectionContent = (
    <BankAccountsSection
      collapsedSections={collapsedSections}
      setCollapsedSections={setCollapsedSections}
      plannedBankBalances={movePlan.bankTargets}
    />
  );

  // ─── Investment Accounts Section (JSX) ─────────────────────────────────

  const investmentsSection = (
    <Suspense fallback={null}>
      <InvestmentsSection
        collapsedSections={collapsedSections}
        setCollapsedSections={setCollapsedSections}
      />
    </Suspense>
  );

  // ─── Transactions Section (JSX) ─────────────────────────────────────────

  const transactionsSection = (
    <Suspense fallback={null}>
      <TransactionsSection
        collapsedSections={collapsedSections}
        setCollapsedSections={setCollapsedSections}
        proEnabled={proEnabled}
      />
    </Suspense>
  );

  function toggleAllSections() {
    setCollapsedSections((previous) => {
      const nextCollapsed = !Object.values(previous).every(Boolean);
      return {
        ...previous,
        creditCards: nextCollapsed,
        bankAccounts: nextCollapsed,
        savingsAccounts: nextCollapsed,
        investments: nextCollapsed,
        savingsGoals: nextCollapsed,
        otherAssets: nextCollapsed,
        debts: nextCollapsed,
        transactions: nextCollapsed,
      };
    });
  }

  const combinedOtherAssetsSection = (
    <Suspense fallback={null}>
      <OtherAssetsSection
        collapsedSections={collapsedSections}
        setCollapsedSections={setCollapsedSections}
        openSheet={openSheet}
      />
    </Suspense>
  );

  return (
    <PortfolioContext.Provider value={demoOverrideContext}>
      <div
        className="page-body"
        style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", gap: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Pull-to-refresh indicator */}
        {(pullProgress > 0.05 || pullTriggered) && (() => {
          const r = 13;
          const circ = 2 * Math.PI * r;
          const ready = pullProgress >= 1;
          const color = ready ? T.accent.emerald : T.accent.primary;
          return (
            <div style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: pullTriggered ? 44 : Math.max(Math.round(pullProgress * 44), 0),
              overflow: "hidden",
              transition: pullTriggered ? "height 0.2s" : "none",
              pointerEvents: "none",
              flexShrink: 0,
            }}>
              {pullTriggered ? (
                <RefreshCw size={18} color={T.accent.emerald} style={{ animation: "spin 0.8s linear infinite" }} />
              ) : (
                <svg width={32} height={32} viewBox="0 0 32 32" style={{ opacity: Math.max(pullProgress, 0.2) }}>
                  {/* Track */}
                  <circle cx={16} cy={16} r={r} fill="none" stroke={color} strokeOpacity={0.15} strokeWidth={2.5} />
                  {/* Progress arc */}
                  <circle
                    cx={16} cy={16} r={r} fill="none"
                    stroke={color} strokeWidth={2.5}
                    strokeDasharray={`${pullProgress * circ} ${circ}`}
                    strokeLinecap="round"
                    transform="rotate(-90 16 16)"
                    style={{ transition: "stroke 0.15s" }}
                  />
                  {ready && <circle cx={16} cy={16} r={5} fill={color} />}
                </svg>
              )}
            </div>
          );
        })()}
        <div style={{ width: "100%", maxWidth: 768, display: "flex", flexDirection: "column" }}>
        <style>{`
            @keyframes spin { 100% { transform: rotate(360deg); } }
            .spin { animation: spin 1s linear infinite; }

            @keyframes sheetSlideUp {
                from { transform: translateY(100%); opacity: 0; }
                to   { transform: translateY(0);    opacity: 1; }
            }
            @keyframes sheetFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes shimmerSlide {
                0%   { background-position: -200% center; }
                100% { background-position: 200% center; }
            }
            .hover-lift { transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) !important; cursor: pointer; }
            .hover-lift:hover { transform: translateY(-3px) scale(1.01); box-shadow: 0 12px 32px rgba(0,0,0,0.3) !important; z-index: 5; }
        `}</style>

      {headerSection}
      {bankAccountsSectionContent}
      {creditCardsSection}
      {investmentsSection}
      {transactionsSection}
      {combinedOtherAssetsSection}

      {/* ═══ UNIFIED ADD BOTTOM SHEET ═══ */}
      {showAddSheet && (
        <Suspense fallback={null}>
          <AddAccountSheet
            show={showAddSheet}
            step={addSheetStep}
            onClose={closeSheet}
            onSetStep={setAddSheetStep}
            onAddCard={data => {
              haptic.success();
              const nextCard = {
                id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `card_${Date.now()}`,
                ...data,
                annualFeeDue: "",
                annualFeeWaived: false,
                notes: "",
                apr: null,
                hasPromoApr: false,
                promoAprAmount: null,
                promoAprExp: "",
                statementCloseDay: null,
                paymentDueDay: null,
                minPayment: null,
              };
              const duplicateId = reviewManualCardDuplicate(cards, nextCard);
              if (duplicateId) {
                setCards(cards.map((card) => (card.id === duplicateId ? { ...card, ...nextCard, id: card.id } : card)));
              } else {
                setCards([...cards, nextCard]);
              }
              setCollapsedSections(p => ({ ...p, creditCards: false }));
            }}
            onAddBank={data => {
              haptic.success();
              const nextBank = {
                id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `bank_${Date.now()}`,
                ...data,
              };
              const duplicateId = reviewManualBankDuplicate(bankAccounts, nextBank);
              if (duplicateId) {
                setBankAccounts(bankAccounts.map((account) => (account.id === duplicateId ? { ...account, ...nextBank, id: account.id } : account)));
              } else {
                setBankAccounts([...bankAccounts, nextBank]);
              }
              setCollapsedSections(p => ({ ...p, bankAccounts: false }));
            }}
            onAddInvestment={(key, symbol, shares) => {
              const holding = {
                id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `holding_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                symbol,
                shares,
              };
              setFinancialConfig((prev: CatalystCashConfig) => {
                const cur = prev?.holdings || {};
                return clearDeletedManualHolding({
                  ...prev,
                  holdings: { ...cur, [key]: [...(cur[key] || []), holding] },
                }, key, holding) as CatalystCashConfig;
              });
              setCollapsedSections(p => ({ ...p, investments: false }));
            }}
            onAddGoal={goal => {
              setFinancialConfig((prev: CatalystCashConfig) => ({
                ...prev,
                savingsGoals: [...(prev?.savingsGoals || []), goal],
              }));
              setCollapsedSections(p => ({ ...p, savingsGoals: false }));
            }}
            onAddDebt={debt => {
              setFinancialConfig((prev: CatalystCashConfig) => ({
                ...prev,
                nonCardDebts: [...(prev?.nonCardDebts || []), { id: "debt_" + Date.now(), ...debt }],
              }));
              setCollapsedSections(p => ({ ...p, debts: false }));
            }}
            onAddAsset={asset => {
              setFinancialConfig((prev: CatalystCashConfig) => ({
                ...prev,
                otherAssets: [...(prev?.otherAssets || []), asset],
              }));
              setCollapsedSections(p => ({ ...p, otherAssets: false }));
            }}
            onPlaidConnect={() => {
              haptic.medium();
              void handlePlaidConnect();
            }}
            plaidLoading={plaidLoading}
            plaidResult={plaidResult}
            plaidError={plaidError}
            cardCatalog={cardCatalog}
          />
        </Suspense>
      )}
      </div>
      </div>
    </PortfolioContext.Provider>
  );
});
