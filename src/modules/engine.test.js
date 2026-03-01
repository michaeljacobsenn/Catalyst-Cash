import { describe, it, expect } from 'vitest';
import { addDays, daysBetween, getNextDateForDayOfMonth, getNextPayday, generateStrategy } from './engine.js';

describe('Engine Date Math', () => {
    it('daysBetween handles dates correctly', () => {
        expect(daysBetween('2024-01-01', '2024-01-10')).toBe(9);
        expect(daysBetween('2024-01-10', '2024-01-01')).toBe(-9);
    });

    it('addDays handles dates correctly', () => {
        expect(addDays('2024-01-01', 5)).toBe('2024-01-06');
        expect(addDays('2024-02-28', 2)).toBe('2024-03-01'); // Leap year check
    });

    it('getNextDateForDayOfMonth finds next matching day', () => {
        expect(getNextDateForDayOfMonth('2024-01-15', 20)).toBe('2024-01-20');
        expect(getNextDateForDayOfMonth('2024-01-15', 10)).toBe('2024-02-10');
        // Short month rounding
        expect(getNextDateForDayOfMonth('2024-01-31', 31)).toBe('2024-01-31');
        expect(getNextDateForDayOfMonth('2024-02-01', 31)).toBe('2024-02-29'); // 2024 is leap
    });

    it('getNextPayday correctly increments days', () => {
        // 2024-01-01 is a Monday
        expect(getNextPayday('2024-01-01', 'friday')).toBe('2024-01-05');
        expect(getNextPayday('2024-01-01', 'monday')).toBe('2024-01-08'); // Next week
    });
});

describe('Engine Strategy Logic - generateStrategy', () => {
    const baseConfig = {
        weeklySpendAllowance: 200,
        emergencyFloor: 1000,
        payday: 'friday'
    };

    it('calculates totalCheckingFloor and surplus accurately', () => {
        const strategy = generateStrategy(baseConfig, {
            snapshotDate: '2024-01-01', // Mon
            checkingBalance: 2500,
            savingsTotal: 500
        });

        expect(strategy.totalCheckingFloor).toBe(1200);
        // 2500 - 1200 = 1300 surplus
        expect(strategy.operationalSurplus).toBe(1300);
        expect(strategy.isNegativeCashFlow).toBe(false);
    });

    it('triggers insolvency protection on negative cash flow', () => {
        const strategy = generateStrategy(baseConfig, {
            snapshotDate: '2024-01-01',
            checkingBalance: 1100, // Below total floor 1200
            savingsTotal: 5000,
            cards: [],
            renewals: [
                { name: 'Rent', amount: 1500, nextDue: '2024-01-03' } // Due before payday (Jan 5)
            ]
        });

        expect(strategy.timeCriticalAmount).toBe(1500);
        // cashAboveFloor = 1100 - 1200 = -100
        // Time critical is 1500. Required transfer from savings: 1500 - (-100) = 1600.
        expect(strategy.requiredTransfer).toBe(1600);
        expect(strategy.isNegativeCashFlow).toBe(true);
        // Operational surplus should floor at 0
        expect(strategy.operationalSurplus).toBe(0);
    });

    it('properly identifies time-critical vs non-time-critical minimums', () => {
        const strategy = generateStrategy(baseConfig, {
            snapshotDate: '2024-01-01', // Mon, next payday Friday 1/5
            checkingBalance: 2000,
            cards: [
                { name: 'Card A', balance: 500, minPayment: 50, paymentDueDay: 3 }, // inside window
                { name: 'Card B', balance: 1000, minPayment: 100, paymentDueDay: 20 } // outside window
            ]
        });

        expect(strategy.timeCriticalAmount).toBe(50);
        expect(strategy.timeCriticalItems.length).toBe(1);
        expect(strategy.timeCriticalItems[0].name).toBe('Card A Minimum');

        // totalCardMinimums = 150
        // time critical = 50
        // nonTimeCritical = 100
        // Floor = 1200
        // cashAboveFloor = 2000 - 1200 = 800
        // operationalSurplus = cashAboveFloor (800) - timeCritical (50) - nonTimeCritical (100) = 650
        expect(strategy.operationalSurplus).toBe(650);
    });

    it('Debt override hierarchy: Promo > CFI > APR', () => {
        // Both debts have same APR and CFI threshold. 
        // Promo should win.
        const strategyPromo = generateStrategy(baseConfig, {
            snapshotDate: '2024-01-01',
            checkingBalance: 5000,
            cards: [
                { name: 'Target Promo', balance: 1000, minPayment: 50, apr: 20, hasPromoApr: true, promoAprExp: '2024-02-01' },
                { name: 'High APR', balance: 2000, minPayment: 100, apr: 28 }
            ]
        });

        expect(strategyPromo.debtStrategy.target).toContain('Target Promo');
        expect(strategyPromo.debtStrategy.target).toContain('Promo expires in 31d');

        // CFI should beat APR
        const strategyCfi = generateStrategy(baseConfig, {
            snapshotDate: '2024-01-01',
            checkingBalance: 5000,
            cards: [
                { name: 'Low CFI', balance: 500, minPayment: 25, apr: 15 }, // CFI is 20
                { name: 'High APR', balance: 3000, minPayment: 100, apr: 28 } // CFI is 30, APR wins but CFI Override takes precedence
            ]
        });
        // Days to next payday is 4. CFI Threshold = max(25, 4*7=28).
        // Target CFI = 20 < 28. It wins over high APR.
        expect(strategyCfi.debtStrategy.target).toBe('Low CFI');

        // Standard APR Avalanche when no Promos or sub-threshold CFIs
        const strategyApr = generateStrategy(baseConfig, {
            snapshotDate: '2024-01-01',
            checkingBalance: 5000,
            cards: [
                { name: 'Big Balance', balance: 5000, minPayment: 100, apr: 19 }, // CFI > 50
                { name: 'High APR', balance: 10000, minPayment: 200, apr: 28 } // CFI > 50
            ]
        });

        expect(strategyApr.debtStrategy.target).toBe('High APR');
    });

    it('No surplus = no debt kill', () => {
        const strategy = generateStrategy(baseConfig, {
            snapshotDate: '2024-01-01',
            checkingBalance: 1200,
            cards: [
                { name: 'High APR', balance: 10000, minPayment: 200, apr: 28 }
            ]
        });
        // At floor, NO surplus
        expect(strategy.operationalSurplus).toBe(0);
        expect(strategy.debtStrategy.amount).toBe(0);
    });

    it('APR ties resolve deterministically (balance -> minimum -> name)', () => {
        const strategy = generateStrategy(baseConfig, {
            snapshotDate: '2024-01-01',
            checkingBalance: 6000,
            cards: [
                { name: 'Alpha Card', balance: 1000, minPayment: 50, apr: 20 },
                { name: 'Beta Card', balance: 1000, minPayment: 80, apr: 20 }
            ]
        });

        // Same APR and balance: higher minimum wins as deterministic tie-breaker.
        expect(strategy.debtStrategy.target).toBe('Beta Card');
    });

    it('CFI override never promotes debts with zero minimums', () => {
        const strategy = generateStrategy(baseConfig, {
            snapshotDate: '2024-01-01',
            checkingBalance: 6000,
            cards: [
                { name: 'No Minimum', balance: 500, minPayment: 0, apr: 5 },
                { name: 'High APR', balance: 3000, minPayment: 100, apr: 29 }
            ]
        });

        // Zero-min debt must not receive artificial CFI priority.
        expect(strategy.debtStrategy.target).toBe('High APR');
    });

    it('includes non-card debt minimums in time-critical gate', () => {
        const strategy = generateStrategy({
            ...baseConfig,
            nonCardDebts: [
                { name: 'Car Loan', balance: 10000, minimum: 300, apr: 8, dueDay: 3 }
            ]
        }, {
            snapshotDate: '2024-01-01', // next payday Jan 5
            checkingBalance: 1800,
            savingsTotal: 0,
            cards: []
        });

        expect(strategy.timeCriticalAmount).toBe(300);
        expect(strategy.debtStrategy.target).toBe('Car Loan');
    });
});
