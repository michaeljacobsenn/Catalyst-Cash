import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { db, advanceExpiredDate } from '../utils.js';
import { ensureCardIds, getCardLabel } from '../cards.js';
import { loadCardCatalog } from '../issuerCards.js';
import { scheduleBillReminders } from '../notifications.js';
import { fetchMarketPrices } from '../marketData.js';
import { useSettings } from './SettingsContext.jsx';

const PortfolioContext = createContext(null);

export function PortfolioProvider({ children }) {
    const { financialConfig, isSettingsReady } = useSettings();

    const [cards, setCards] = useState([]);
    const [bankAccounts, setBankAccounts] = useState([]);
    const [renewals, setRenewals] = useState([]);
    const [cardCatalog, setCardCatalog] = useState(null);
    const [cardCatalogUpdatedAt, setCardCatalogUpdatedAt] = useState(null);
    const [badges, setBadges] = useState({});
    const [marketPrices, setMarketPrices] = useState({});
    const [isPortfolioReady, setIsPortfolioReady] = useState(false);

    useEffect(() => {
        const initPortfolio = async () => {
            try {
                const [rn, cp, ba, renewalsSeedVersion, loadedBadges] = await Promise.all([
                    db.get("renewals"),
                    db.get("card-portfolio"),
                    db.get("bank-accounts"),
                    db.get("renewals-seed-version"),
                    db.get("unlocked-badges")
                ]);

                if (loadedBadges) setBadges(loadedBadges);

                const seedVersion = renewalsSeedVersion || null;
                let activeRenewals = rn ?? null;

                if (activeRenewals === null) {
                    activeRenewals = [];
                    db.set("renewals-seed-version", "public-v1");
                } else if (activeRenewals.length === 0) {
                    db.set("renewals-seed-version", "public-v1");
                } else if (seedVersion !== "public-v1") {
                    db.set("renewals-seed-version", "public-v1");
                }

                let renewalsChanged = false;
                activeRenewals = activeRenewals.map(r => {
                    if (!r.nextDue || r.intervalUnit === "one-time") return r;
                    const newDate = advanceExpiredDate(r.nextDue, r.interval || 1, r.intervalUnit || "months");
                    if (newDate !== r.nextDue) { renewalsChanged = true; return { ...r, nextDue: newDate }; }
                    return r;
                });

                if (renewalsChanged) db.set("renewals", activeRenewals);
                setRenewals(activeRenewals);
                scheduleBillReminders(activeRenewals).catch(() => { });

                let activeCards = cp || [];
                let cardsChanged = false;
                activeCards = activeCards.map(c => {
                    if (!c.annualFeeDue) return c;
                    const newDate = advanceExpiredDate(c.annualFeeDue, 1, "years");
                    if (newDate !== c.annualFeeDue) { cardsChanged = true; return { ...c, annualFeeDue: newDate }; }
                    return c;
                });

                const { cards: normalizedCards, changed: idChanged } = ensureCardIds(activeCards);
                if (idChanged) { cardsChanged = true; activeCards = normalizedCards; }
                if (cardsChanged) db.set("card-portfolio", activeCards);
                setCards(activeCards);

                if (ba) setBankAccounts(ba);

                const catalog = await loadCardCatalog();
                if (catalog?.catalog) setCardCatalog(catalog.catalog);
                if (catalog?.updatedAt) setCardCatalogUpdatedAt(catalog.updatedAt);

            } catch (e) {
                console.error('Portfolio init error:', e);
                setRenewals([]);
                setCards([]);
            } finally {
                setIsPortfolioReady(true);
            }
        };

        initPortfolio();
    }, []);

    // Sync state to DB on change
    useEffect(() => { if (isPortfolioReady) db.set("renewals", renewals); }, [renewals, isPortfolioReady]);
    useEffect(() => { if (isPortfolioReady) db.set("card-portfolio", cards); }, [cards, isPortfolioReady]);
    useEffect(() => { if (isPortfolioReady) db.set("bank-accounts", bankAccounts); }, [bankAccounts, isPortfolioReady]);

    // Map chargedToIds logic
    useEffect(() => {
        if (!isPortfolioReady || !cards.length) return;
        let changed = false;
        const next = (renewals || []).map(r => {
            if (r.chargedToId || !r.chargedTo) return r;
            const match = cards.find(c =>
                c.name === r.chargedTo ||
                getCardLabel(cards, c) === r.chargedTo ||
                r.chargedTo.endsWith(c.name)
            );
            if (!match) return r;
            changed = true;
            return { ...r, chargedToId: match.id, chargedTo: getCardLabel(cards, match) };
        });
        if (changed) setRenewals(next);
    }, [cards, isPortfolioReady]);

    // Market prices fetching logic
    useEffect(() => {
        if (!isPortfolioReady || !isSettingsReady) return;
        const h = financialConfig?.holdings || {};
        const syms = [...new Set(Object.values(h).flat().filter(x => x?.symbol).map(x => x.symbol))];
        if (syms.length === 0) return;
        fetchMarketPrices(syms).then(p => { if (p && Object.keys(p).length > 0) setMarketPrices(p); }).catch(() => { });
    }, [isPortfolioReady, isSettingsReady, financialConfig?.holdings]);

    const cardAnnualFees = useMemo(() => {
        return cards
            .filter(c => c.annualFee && c.annualFeeDue)
            .map(c => ({
                id: c.id,
                linkedCardId: c.id,
                cardName: c.name,
                name: `${getCardLabel(cards, c)} Annual Fee`,
                amount: typeof c.annualFee === "number" ? c.annualFee : (parseFloat(c.annualFee) || 0),
                nextDue: c.annualFeeDue,
                interval: 1,
                intervalUnit: "years",
                chargedToId: c.id,
                chargedTo: getCardLabel(cards, c),
                category: "af",
                isCardAF: true,
                isAnnualFee: true, // legacy alias
                isWaived: !!c.annualFeeWaived,
            }));
    }, [cards]);

    const value = {
        cards, setCards,
        bankAccounts, setBankAccounts,
        renewals, setRenewals,
        cardCatalog, setCardCatalog,
        cardCatalogUpdatedAt, setCardCatalogUpdatedAt,
        badges, setBadges,
        marketPrices, setMarketPrices,
        cardAnnualFees,
        isPortfolioReady
    };

    return (
        <PortfolioContext.Provider value={value}>
            {children}
        </PortfolioContext.Provider>
    );
}

export const usePortfolio = () => {
    const context = useContext(PortfolioContext);
    if (!context) throw new Error("usePortfolio must be used within a PortfolioProvider");
    return context;
};
