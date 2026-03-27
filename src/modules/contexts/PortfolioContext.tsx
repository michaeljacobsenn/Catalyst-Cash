  import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
    type Dispatch,
    type ReactNode,
    type SetStateAction,
  } from "react";
  import type {
    BankAccount,
    Card,
    IssuerCardCatalog,
    MarketPriceMap,
    Renewal,
  } from "../../types/index.js";
  import { ensureCardIds,getCardLabel } from "../cards.js";
  import { loadCardCatalog } from "../issuerCards.js";
  import { log } from "../logger.js";
  import { fetchMarketPrices } from "../marketData.js";
  import { relinkRenewalPaymentMethods } from "../renewalPaymentLinking.js";
  import {
    applyBalanceSync,
    autoMatchAccounts,
    ensureConnectionAccountsPresent,
    fetchBalancesAndLiabilities,
    getConnections,
    materializeManualFallbackForConnections,
    reconcilePlaidConnectionAccess,
    saveConnectionLinks,
  } from "../plaid.js";
  import { scheduleBillReminders } from "../notifications.js";
  import {
    FULL_PROFILE_QA_ACTIVE_KEY,
    shouldRecoverFromFullProfileQaSeed,
    stripFullProfileQaRecords,
  } from "../qaSeed.js";
  import { advanceExpiredDate,db } from "../utils.js";
  import { useSettings } from "./SettingsContext.js";

interface PortfolioProviderProps {
  children: ReactNode;
}

export interface BadgeMap {
  [badgeId: string]: number | undefined;
}

export interface PortfolioContextValue {
  cards: Card[];
  setCards: Dispatch<SetStateAction<Card[]>>;
  bankAccounts: BankAccount[];
  setBankAccounts: Dispatch<SetStateAction<BankAccount[]>>;
  renewals: Renewal[];
  setRenewals: Dispatch<SetStateAction<Renewal[]>>;
  cardCatalog: IssuerCardCatalog | null;
  setCardCatalog: Dispatch<SetStateAction<IssuerCardCatalog | null>>;
  cardCatalogUpdatedAt: number | null;
  setCardCatalogUpdatedAt: Dispatch<SetStateAction<number | null>>;
  badges: BadgeMap;
  setBadges: Dispatch<SetStateAction<BadgeMap>>;
  marketPrices: MarketPriceMap;
  setMarketPrices: Dispatch<SetStateAction<MarketPriceMap>>;
  cardAnnualFees: Renewal[];
  isPortfolioReady: boolean;
  rehydratePortfolio: () => Promise<void>;
  liabilitySum?: number;
  refreshLiabilities?: () => Promise<void>;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

  export { PortfolioContext };

function mergeUniqueById<T extends { id?: string | null }>(existing: T[] = [], incoming: T[] = []) {
  if (!incoming.length) return existing;
  const map = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) {
    if (item.id && !map.has(item.id)) map.set(item.id, item);
  }
  return Array.from(map.values());
}

async function rebuildPlaidLinkedPortfolio(
  cards: Card[],
  bankAccounts: BankAccount[],
  plaidConnections: Array<{ id?: string; accounts?: unknown[] }>,
  cardCatalog: IssuerCardCatalog | null
) {
  let nextCards = [...cards];
  let nextBankAccounts = [...bankAccounts];

  for (const connection of plaidConnections || []) {
    const connectionId = String(connection?.id || "").trim();
    if (!connectionId) continue;

    const seedMatch = autoMatchAccounts(
      connection,
      nextCards,
      nextBankAccounts,
      cardCatalog as unknown as null | undefined,
      []
    );
    if (seedMatch.newCards.length > 0) {
      nextCards = mergeUniqueById(nextCards, seedMatch.newCards);
    }
    if (seedMatch.newBankAccounts.length > 0) {
      nextBankAccounts = mergeUniqueById(nextBankAccounts, seedMatch.newBankAccounts);
    }
    await saveConnectionLinks(connection).catch(() => false);

    try {
      const refreshed = await fetchBalancesAndLiabilities(connectionId);
      if (!refreshed) continue;

      const refreshedMatch = autoMatchAccounts(
        refreshed,
        nextCards,
        nextBankAccounts,
        cardCatalog as unknown as null | undefined,
        []
      );
      if (refreshedMatch.newCards.length > 0) {
        nextCards = mergeUniqueById(nextCards, refreshedMatch.newCards);
      }
      if (refreshedMatch.newBankAccounts.length > 0) {
        nextBankAccounts = mergeUniqueById(nextBankAccounts, refreshedMatch.newBankAccounts);
      }

      const syncState = applyBalanceSync(refreshed, nextCards, nextBankAccounts, []);
      nextCards = syncState.updatedCards;
      nextBankAccounts = syncState.updatedBankAccounts;
      await saveConnectionLinks(refreshed).catch(() => false);
    } catch (error) {
      void log.warn("portfolio", "Plaid recovery sync skipped for connection", {
        connectionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { cards: nextCards, bankAccounts: nextBankAccounts };
}

export function PortfolioProvider({ children }: PortfolioProviderProps) {
  const { financialConfig, isSettingsReady } = useSettings();

  const [cards, setCards] = useState<Card[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [cardCatalog, setCardCatalog] = useState<IssuerCardCatalog | null>(null);
  const [cardCatalogUpdatedAt, setCardCatalogUpdatedAt] = useState<number | null>(null);
  const [badges, setBadges] = useState<BadgeMap>({});
  const [marketPrices, setMarketPrices] = useState<MarketPriceMap>({});
  const [isPortfolioReady, setIsPortfolioReady] = useState<boolean>(false);

  const rehydratePortfolio = async (): Promise<void> => {
    try {
      setCards([]);
      setBankAccounts([]);
      setRenewals([]);
      setCardCatalog(null);
      setCardCatalogUpdatedAt(null);
      setBadges({});
      setMarketPrices({});

      const [rn, cp, ba, renewalsSeedVersion, loadedBadges, plaidConnections, qaSeedActive, catalogResult] = (await Promise.all([
        db.get("renewals"),
        db.get("card-portfolio"),
        db.get("bank-accounts"),
        db.get("renewals-seed-version"),
        db.get("unlocked-badges"),
        getConnections().catch(() => []),
        db.get(FULL_PROFILE_QA_ACTIVE_KEY),
        loadCardCatalog(),
      ])) as [
        Renewal[] | null,
        Card[] | null,
        BankAccount[] | null,
        string | null,
        BadgeMap | null,
        Array<{ id?: string; _needsReconnect?: boolean; accounts?: unknown[] }>,
        boolean | null,
        { catalog?: IssuerCardCatalog; updatedAt?: number | null },
      ];

      if (loadedBadges) setBadges(loadedBadges);

      const seedVersion = renewalsSeedVersion || null;
      let activeRenewals: Renewal[] | null = rn ?? null;

      if (activeRenewals === null) {
        activeRenewals = [];
        db.set("renewals-seed-version", "public-v1");
      } else if (activeRenewals.length === 0) {
        db.set("renewals-seed-version", "public-v1");
      } else if (seedVersion !== "public-v1") {
        db.set("renewals-seed-version", "public-v1");
      }

      let renewalsChanged = false;
      activeRenewals = activeRenewals.map((renewal: Renewal) => {
        if (!renewal.nextDue || renewal.intervalUnit === "one-time") return renewal;
        const newDate = advanceExpiredDate(renewal.nextDue, renewal.interval || 1, renewal.intervalUnit || "months");
        if (newDate !== renewal.nextDue) {
          renewalsChanged = true;
          return { ...renewal, nextDue: newDate };
        }
        return renewal;
      });

      let activeCards: Card[] = cp || [];
      let activeBankAccounts: BankAccount[] = ba || [];
      let cardsChanged = false;
      let banksChanged = false;

      const shouldRecoverQaSeed = shouldRecoverFromFullProfileQaSeed({
        qaSeedActive: Boolean(qaSeedActive),
        cards: activeCards,
        bankAccounts: activeBankAccounts,
        renewals: activeRenewals,
        plaidConnections,
      });
      if (shouldRecoverQaSeed) {
        const stripped = stripFullProfileQaRecords({
          cards: activeCards,
          bankAccounts: activeBankAccounts,
          renewals: activeRenewals,
        });
        activeCards = stripped.cards;
        activeBankAccounts = stripped.bankAccounts;
        activeRenewals = stripped.renewals;
        cardsChanged = cardsChanged || stripped.removedCardCount > 0;
        banksChanged = banksChanged || stripped.removedBankAccountCount > 0;
        renewalsChanged = renewalsChanged || stripped.removedRenewalCount > 0;

        if (plaidConnections.length > 0) {
          const preRecoveryCardCount = activeCards.length;
          const preRecoveryBankCount = activeBankAccounts.length;
          const recovered = await rebuildPlaidLinkedPortfolio(
            activeCards,
            activeBankAccounts,
            plaidConnections,
            catalogResult.catalog || null
          );
          activeCards = recovered.cards;
          activeBankAccounts = recovered.bankAccounts;
          cardsChanged = cardsChanged || activeCards.length !== preRecoveryCardCount;
          banksChanged = banksChanged || activeBankAccounts.length !== preRecoveryBankCount;
        }

        await db.del(FULL_PROFILE_QA_ACTIVE_KEY).catch(() => false);
        void log.warn("portfolio", "Recovered portfolio state from linked Plaid connections after removing QA seed fixtures.");
        if (typeof window !== "undefined") {
          window.toast?.info?.("Removed seeded QA data and restored your linked accounts.");
        }
      }

      activeCards = activeCards.map((card: Card) => {
        if (!card.annualFeeDue) return card;
        const newDate = advanceExpiredDate(card.annualFeeDue, 1, "years");
        if (newDate !== card.annualFeeDue) {
          cardsChanged = true;
          return { ...card, annualFeeDue: newDate };
        }
        return card;
      });

      const { cards: normalizedCards, changed: idChanged } = ensureCardIds(activeCards) as {
        cards: Card[];
        changed: boolean;
      };
      if (idChanged) {
        cardsChanged = true;
        activeCards = normalizedCards;
      }
      const reconnectIds = (plaidConnections || [])
        .filter(connection => connection?._needsReconnect)
        .map(connection => String(connection.id || "").trim())
        .filter(Boolean);
      if (reconnectIds.length > 0) {
        const reconnectConnections = plaidConnections.filter(
          (connection) => connection?._needsReconnect && Array.isArray(connection.accounts) && connection.accounts.length > 0
        );
        if (reconnectConnections.length > 0) {
          const preReconnectCardCount = activeCards.length;
          const preReconnectBankCount = activeBankAccounts.length;
          let plaidInvestments = Array.isArray(financialConfig?.plaidInvestments) ? financialConfig.plaidInvestments : [];

          for (const connection of reconnectConnections) {
            const hydrated = ensureConnectionAccountsPresent(
              connection,
              activeCards,
              activeBankAccounts,
              null,
              plaidInvestments
            );
            activeCards = hydrated.updatedCards;
            activeBankAccounts = hydrated.updatedBankAccounts;
            plaidInvestments = hydrated.updatedPlaidInvestments;
          }

          if (activeCards.length !== preReconnectCardCount) cardsChanged = true;
          if (activeBankAccounts.length !== preReconnectBankCount) banksChanged = true;
          if (reconnectConnections.length > 0) {
            await db.set("financial-config", { ...(financialConfig || {}), plaidInvestments });
          }
        }
      }
      if (reconnectIds.length > 0) {
        const fallbackState = materializeManualFallbackForConnections(activeCards, activeBankAccounts, reconnectIds, {
          keepLinkMetadata: true,
        });
        if (fallbackState.changed) {
          activeCards = fallbackState.updatedCards;
          activeBankAccounts = fallbackState.updatedBankAccounts;
          cardsChanged = true;
          banksChanged = true;
        }
      }
      const accessState = await reconcilePlaidConnectionAccess(activeCards, activeBankAccounts);
      if (accessState.cardsChanged || accessState.bankAccountsChanged) {
        activeCards = accessState.updatedCards;
        activeBankAccounts = accessState.updatedBankAccounts;
        cardsChanged = cardsChanged || accessState.cardsChanged;
        banksChanged = banksChanged || accessState.bankAccountsChanged;
      }
      if (renewalsChanged) db.set("renewals", activeRenewals);
      setRenewals(activeRenewals);
      scheduleBillReminders(activeRenewals).catch(() => {});
      if (cardsChanged) db.set("card-portfolio", activeCards);
      setCards(activeCards);

      if (banksChanged) {
        db.set("bank-accounts", activeBankAccounts);
      }
      setBankAccounts(activeBankAccounts);

      if (catalogResult.catalog) setCardCatalog(catalogResult.catalog);
      if (catalogResult.updatedAt) setCardCatalogUpdatedAt(catalogResult.updatedAt);
    } catch (error: unknown) {
      void log.error("portfolio", "Portfolio context initialization failed", error);
      setRenewals([]);
      setCards([]);
    }
  };

  useEffect(() => {
    const initPortfolio = async (): Promise<void> => {
      try {
        await rehydratePortfolio();
      } finally {
        setIsPortfolioReady(true);
      }
    };

    void initPortfolio();
  }, []);

  useEffect(() => {
    if (isPortfolioReady) db.set("renewals", renewals);
  }, [renewals, isPortfolioReady]);

  useEffect(() => {
    if (isPortfolioReady) db.set("card-portfolio", cards);
  }, [cards, isPortfolioReady]);

  useEffect(() => {
    if (isPortfolioReady) db.set("bank-accounts", bankAccounts);
  }, [bankAccounts, isPortfolioReady]);

  useEffect(() => {
    if (!isPortfolioReady || !renewals.length || (!cards.length && !bankAccounts.length)) return;
    const result = relinkRenewalPaymentMethods(renewals, cards, bankAccounts);
    if (result.changed) setRenewals(result.renewals);
  }, [bankAccounts, cards, isPortfolioReady, renewals]);

  useEffect(() => {
    if (!isPortfolioReady || !isSettingsReady) return;
    const holdings = financialConfig?.holdings || {};
    const symbols = [
      ...new Set(
        Object.values(holdings as NonNullable<typeof financialConfig.holdings>)
          .flat()
          .filter(
            (holding): holding is { symbol: string } =>
              typeof holding === "object" && holding !== null && "symbol" in holding && typeof holding.symbol === "string"
          )
          .map((holding) => holding.symbol)
      ),
    ];
    if (symbols.length === 0) return;
    fetchMarketPrices(symbols)
      .then((prices: MarketPriceMap | null | undefined) => {
        if (prices && Object.keys(prices).length > 0) setMarketPrices(prices);
      })
      .catch(() => {});
  }, [isPortfolioReady, isSettingsReady, financialConfig?.holdings]);

  const cardAnnualFees = useMemo<Renewal[]>(() => {
    return cards
      .filter((card: Card) => card.annualFee && card.annualFeeDue)
      .map((card: Card) => {
        const nextDue = card.annualFeeDue || "";
        return {
          id: card.id,
          linkedCardId: card.id,
          cardName: card.name,
          name: `${getCardLabel(cards, card)} Annual Fee`,
          amount: typeof card.annualFee === "number" ? card.annualFee : parseFloat(card.annualFee || "0") || 0,
          nextDue,
          interval: 1,
          intervalUnit: "years",
          chargedToType: "card",
          chargedToId: card.id,
          chargedTo: getCardLabel(cards, card),
          category: "af",
          isCardAF: true,
          isAnnualFee: true,
          isWaived: !!card.annualFeeWaived,
        };
      });
  }, [cards]);

  const value: PortfolioContextValue = {
    cards,
    setCards,
    bankAccounts,
    setBankAccounts,
    renewals,
    setRenewals,
    cardCatalog,
    setCardCatalog,
    cardCatalogUpdatedAt,
    setCardCatalogUpdatedAt,
    badges,
    setBadges,
    marketPrices,
    setMarketPrices,
    cardAnnualFees,
    isPortfolioReady,
    rehydratePortfolio,
  };

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

export const usePortfolio = (): PortfolioContextValue => {
  const context = useContext(PortfolioContext);
  if (!context) throw new Error("usePortfolio must be used within a PortfolioProvider");
  return context;
};
