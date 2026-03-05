import { describe, it, expect } from 'vitest';
import { addDays, daysBetween, getNextDateForDayOfMonth, getNextPayday, generateStrategy, projectDebtPayoff } from './engine.js';

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

    it('promo-sprint picks highest urgency among multiple expiring promos', () => {
        const strategy = generateStrategy(baseConfig, {
            snapshotDate: '2024-01-01',
            checkingBalance: 8000,
            cards: [
                { name: 'Low Urgency', balance: 500, minPayment: 25, apr: 15, hasPromoApr: true, promoAprExp: '2024-03-01' }, // 60d, low balance
                { name: 'High Urgency', balance: 3000, minPayment: 100, apr: 28, hasPromoApr: true, promoAprExp: '2024-01-15' } // 14d, high balance+APR
            ]
        });

        // High Urgency has higher urgency score: (3000*2800)/14 >>> (500*1500)/60
        expect(strategy.debtStrategy.target).toContain('High Urgency');
        expect(strategy.debtStrategy.method).toBe('promo-sprint');
    });

    it('non-card debts participate in avalanche ordering', () => {
        const strategy = generateStrategy({
            ...baseConfig,
            nonCardDebts: [
                { name: 'Student Loan', balance: 15000, minimum: 200, apr: 12 }
            ]
        }, {
            snapshotDate: '2024-01-01',
            checkingBalance: 8000,
            cards: [
                { name: 'Low APR Card', balance: 8000, minPayment: 50, apr: 5 } // CFI ratio = 160, well above threshold
            ]
        });

        // Student loan at 12% APR should beat card at 5% APR for avalanche
        expect(strategy.debtStrategy.target).toBe('Student Loan');
        expect(strategy.debtStrategy.method).toBe('avalanche');
    });

    it('zero-balance cards produce no debt strategy', () => {
        const strategy = generateStrategy(baseConfig, {
            snapshotDate: '2024-01-01',
            checkingBalance: 3000,
            cards: [
                { name: 'Paid Off Card', balance: 0, minPayment: 0, apr: 24 },
                { name: 'Another Paid Off', balance: 0, minPayment: 0, apr: 18 }
            ]
        });

        expect(strategy.debtStrategy.target).toBeNull();
        expect(strategy.debtStrategy.amount).toBe(0);
        expect(strategy.debtStrategy.method).toBeNull();
    });

    it('required transfer is capped at savings total', () => {
        const strategy = generateStrategy(baseConfig, {
            snapshotDate: '2024-01-01',
            checkingBalance: 500, // Well below floor of 1200
            savingsTotal: 300, // Only $300 in savings
            renewals: [
                { name: 'Rent', amount: 2000, nextDue: '2024-01-03' } // Timecrit $2000
            ]
        });

        // Shortfall is huge (1200 floor + 2000 rent - 500 checking = 2700) but only $300 available
        expect(strategy.requiredTransfer).toBe(300);
    });

    it('empty portfolio returns clean zeroed strategy', () => {
        const strategy = generateStrategy(baseConfig, {
            snapshotDate: '2024-01-01',
            checkingBalance: 2000,
            savingsTotal: 1000,
            cards: [],
            renewals: []
        });

        expect(strategy.totalCheckingFloor).toBe(1200);
        expect(strategy.timeCriticalAmount).toBe(0);
        expect(strategy.timeCriticalItems).toEqual([]);
        expect(strategy.requiredTransfer).toBe(0);
        expect(strategy.isNegativeCashFlow).toBe(false);
        expect(strategy.operationalSurplus).toBe(800);
        expect(strategy.debtStrategy.target).toBeNull();
        expect(strategy.debtStrategy.amount).toBe(0);
        expect(strategy.debtStrategy.method).toBeNull();
    });

    it('CFI override does not promote zero-minimum debts', () => {
        const strategy = generateStrategy(baseConfig, {
            snapshotDate: '2024-01-01',
            checkingBalance: 5000,
            cards: [
                { name: 'High APR Card', balance: 3000, minPayment: 100, apr: 29.99 },
                { name: 'Zero Min Card', balance: 500, minPayment: 0, apr: 15 }
            ]
        });

        // The High APR Card should be targeted — zero min cards should not win CFI
        expect(strategy.debtStrategy.target).toBe('High APR Card');
    });

    it('semi-monthly pay frequency calculates valid next payday', () => {
        const strategy = generateStrategy({
            ...baseConfig,
            payFrequency: 'semi-monthly',
        }, {
            snapshotDate: '2024-01-10',
            checkingBalance: 3000,
            cards: [
                { name: 'Test Card', balance: 1000, minPayment: 50, apr: 20 }
            ]
        });

        // Semi-monthly should find a near-future payday (1st or 15th)
        expect(strategy.nextPayday).toBeTruthy();
        const payday = new Date(strategy.nextPayday);
        expect(payday.getTime()).toBeGreaterThan(new Date('2024-01-10').getTime());
    });

    it('includes compound-interest debtPayoff projection in output', () => {
        const strategy = generateStrategy(baseConfig, {
            snapshotDate: '2024-01-01',
            checkingBalance: 5000,
            cards: [
                { name: 'High APR Card', balance: 3000, minPayment: 100, apr: 24 }
            ]
        });

        expect(strategy.debtPayoff).not.toBeNull();
        expect(strategy.debtPayoff.minimumsOnly.totalMonths).toBeGreaterThan(0);
        expect(strategy.debtPayoff.minimumsOnly.totalInterestPaid).toBeGreaterThan(0);
        expect(strategy.debtPayoff.minimumsOnly.debtFreeDate).toBeTruthy();
        expect(strategy.debtPayoff.withExtraPayment.totalMonths).toBeLessThanOrEqual(strategy.debtPayoff.minimumsOnly.totalMonths);
        expect(strategy.debtPayoff.withExtraPayment.interestSaved).toBeGreaterThanOrEqual(0);
        expect(strategy.debtPayoff.perDebt.length).toBe(1);
    });
});

describe('projectDebtPayoff — Compound Interest Amortization', () => {
    it('single debt with compound interest accrues correctly', () => {
        const result = projectDebtPayoff(
            [{ name: 'Card A', balance: 1000, apr: 24, minPayment: 50 }],
            0,
            '2024-01-01'
        );

        expect(result.totalMonths).toBeGreaterThan(0);
        expect(result.totalInterestPaid).toBeGreaterThan(0);
        expect(result.debtFreeDate).toBeTruthy();
        expect(result.perDebt.length).toBe(1);
        expect(result.perDebt[0].name).toBe('Card A');

        // With 24% APR, $1000 balance, $50/mo minimum: interest accrues ~$20/mo initially
        // So it should take roughly 24+ months (more than 20 without interest)
        expect(result.totalMonths).toBeGreaterThan(20);
    });

    it('extra monthly payment reduces payoff time and interest', () => {
        const minOnly = projectDebtPayoff(
            [{ name: 'Card', balance: 5000, apr: 20, minPayment: 100 }],
            0, '2024-01-01'
        );
        const withExtra = projectDebtPayoff(
            [{ name: 'Card', balance: 5000, apr: 20, minPayment: 100 }],
            200, '2024-01-01'
        );

        expect(withExtra.totalMonths).toBeLessThan(minOnly.totalMonths);
        expect(withExtra.totalInterestPaid).toBeLessThan(minOnly.totalInterestPaid);
    });

    it('avalanche ordering pays highest APR first with extra', () => {
        const result = projectDebtPayoff(
            [
                { name: 'Low APR', balance: 2000, apr: 5, minPayment: 50 },
                { name: 'High APR', balance: 2000, apr: 25, minPayment: 50 }
            ],
            300, '2024-01-01'
        );

        // High APR debt should be paid off first
        const highApr = result.perDebt.find(d => d.name === 'High APR');
        const lowApr = result.perDebt.find(d => d.name === 'Low APR');
        expect(highApr.months).toBeLessThan(lowApr.months);
    });

    it('filters out zero-balance debts', () => {
        const result = projectDebtPayoff(
            [
                { name: 'Paid Off', balance: 0, apr: 20, minPayment: 50 },
                { name: 'Active', balance: 1000, apr: 20, minPayment: 50 }
            ],
            0, '2024-01-01'
        );

        expect(result.perDebt.length).toBe(1);
        expect(result.perDebt[0].name).toBe('Active');
    });

    it('handles promo APR expiration mid-timeline', () => {
        // Debt starts with 0% promo APR that expires in 2 months
        const withPromo = projectDebtPayoff(
            [{ name: 'Promo Card', balance: 5000, apr: 24, minPayment: 100, hasPromoApr: true, promoAprExp: '2024-03-01' }],
            0, '2024-01-01'
        );

        // No promo — starts accruing immediately
        const noPromo = projectDebtPayoff(
            [{ name: 'Regular Card', balance: 5000, apr: 24, minPayment: 100 }],
            0, '2024-01-01'
        );

        // With promo, total interest should be less (0% for first ~2 months)
        expect(withPromo.totalInterestPaid).toBeLessThan(noPromo.totalInterestPaid);
    });

    it('snowballs freed minimums after a debt is paid off', () => {
        // Two debts: small high-APR that should be killed first,
        // then its minimum snowballs to the second
        const result = projectDebtPayoff(
            [
                { name: 'Small High', balance: 200, apr: 28, minPayment: 50 },
                { name: 'Large Low', balance: 3000, apr: 15, minPayment: 80 }
            ],
            100, '2024-01-01'
        );

        // Small debt should be paid off in just a few months
        const small = result.perDebt.find(d => d.name === 'Small High');
        expect(small.months).toBeLessThanOrEqual(3);

        // Large debt benefits from snowballed extra
        expect(result.totalMonths).toBeGreaterThan(small.months);
    });

    it('returns null months/date for unpayable debt (min < interest)', () => {
        // $100,000 at 30% APR with only $10/mo minimum = never pays off
        const result = projectDebtPayoff(
            [{ name: 'Unpayable', balance: 100000, apr: 30, minPayment: 10 }],
            0, '2024-01-01'
        );

        expect(result.totalMonths).toBeNull();
        expect(result.debtFreeDate).toBeNull();
    });

    it('empty debts array returns zero projection', () => {
        const result = projectDebtPayoff([], 500, '2024-01-01');
        expect(result.totalMonths).toBe(0);
        expect(result.totalInterestPaid).toBe(0);
        expect(result.debtFreeDate).toBeNull();
        expect(result.perDebt).toEqual([]);
    });

    it('applies defaultAPR when debt has no APR set', () => {
        const result = projectDebtPayoff(
            [{ name: 'No APR', balance: 1000, apr: 0, minPayment: 50 }],
            0, '2024-01-01', 20  // default 20% APR
        );

        // Should accrue interest at 20%
        expect(result.totalInterestPaid).toBeGreaterThan(0);
        expect(result.totalMonths).toBeGreaterThan(20); // More than balance/min
    });

    it('debt-free date is a valid ISO date string', () => {
        const result = projectDebtPayoff(
            [{ name: 'Test', balance: 500, apr: 15, minPayment: 50 }],
            0, '2024-06-15'
        );

        expect(result.debtFreeDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        const d = new Date(result.debtFreeDate);
        expect(d.getTime()).toBeGreaterThan(new Date('2024-06-15').getTime());
    });
});
