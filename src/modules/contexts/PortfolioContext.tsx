import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { db, advanceExpiredDate } from "../utils.js";
import { ensureCardIds, getCardLabel, getShortCardLabel } from "../cards.js";
import { loadCardCatalog } from "../issuerCards.js";
import { scheduleBillReminders } from "../notifications.js";
import { fetchMarketPrices } from "../marketData.js";
import { useSettings } from "./SettingsContext.js";
import type {
  BankAccount,
  Card,
  IssuerCardCatalog,
  MarketPriceMap,
  Renewal,
} from "../../types/index.js";

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
  liabilitySum?: number;
  refreshLiabilities?: () => Promise<void>;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

export { PortfolioContext };

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

  useEffect(() => {
    const initPortfolio = async (): Promise<void> => {
      try {
        const [rn, cp, ba, renewalsSeedVersion, loadedBadges] = (await Promise.all([
          db.get("renewals"),
          db.get("card-portfolio"),
          db.get("bank-accounts"),
          db.get("renewals-seed-version"),
          db.get("unlocked-badges"),
        ])) as [Renewal[] | null, Card[] | null, BankAccount[] | null, string | null, BadgeMap | null];

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

        if (renewalsChanged) db.set("renewals", activeRenewals);
        setRenewals(activeRenewals);
        scheduleBillReminders(activeRenewals).catch(() => {});

        let activeCards: Card[] = cp || [];
        let cardsChanged = false;
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
        if (cardsChanged) db.set("card-portfolio", activeCards);
        setCards(activeCards);

        if (ba) setBankAccounts(ba);

        const catalogResult = (await loadCardCatalog()) as {
          catalog?: IssuerCardCatalog;
          updatedAt?: number | null;
        };
        if (catalogResult.catalog) setCardCatalog(catalogResult.catalog);
        if (catalogResult.updatedAt) setCardCatalogUpdatedAt(catalogResult.updatedAt);
      } catch (error: unknown) {
        console.error("Portfolio init error:", error);
        setRenewals([]);
        setCards([]);
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
    if (!isPortfolioReady || !cards.length) return;
    let changed = false;
    const next = renewals.map((renewal: Renewal) => {
      if (!renewal.chargedToId && !renewal.chargedTo) return renewal;

      let match: Card | undefined;
      if (renewal.chargedToId) {
        match = cards.find((card: Card) => card.id === renewal.chargedToId);
      }

      if (!match && renewal.chargedTo) {
        match = cards.find(
          (card: Card) =>
            card.name === renewal.chargedTo ||
            getCardLabel(cards, card) === renewal.chargedTo ||
            renewal.chargedTo?.endsWith(card.name)
        );
      }

      if (!match) return renewal;

      const newLabel = getShortCardLabel(cards, match);
      if (renewal.chargedToId !== match.id || renewal.chargedTo !== newLabel) {
        changed = true;
        return { ...renewal, chargedToId: match.id, chargedTo: newLabel };
      }
      return renewal;
    });

    if (changed) setRenewals(next);
  }, [cards, isPortfolioReady, renewals]);

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
        const nextDue = card.annualFeeDue!;
        return {
          id: card.id,
          linkedCardId: card.id,
          cardName: card.name,
          name: `${getCardLabel(cards, card)} Annual Fee`,
          amount: typeof card.annualFee === "number" ? card.annualFee : parseFloat(card.annualFee || "0") || 0,
          nextDue,
          interval: 1,
          intervalUnit: "years",
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
  };

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

export const usePortfolio = (): PortfolioContextValue => {
  const context = useContext(PortfolioContext);
  if (!context) throw new Error("usePortfolio must be used within a PortfolioProvider");
  return context;
};
