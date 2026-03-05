import { describe, it, expect } from 'vitest';
import { buildSnapshotMessage } from './buildSnapshotMessage.js';

const baseParams = () => ({
    form: {
        date: '2026-03-05', time: '10:00', checking: '2500', savings: '1000',
        debts: [{ cardId: null, name: 'Chase Sapphire', balance: '450' }],
        pendingCharges: [{ amount: '75.00', description: 'Groceries', confirmed: true }],
        notes: 'Paid rent already', autoPaycheckAdd: false, paycheckAddOverride: '',
        habitCount: 3, roth: '15000', brokerage: '', k401Balance: ''
    },
    activeConfig: {
        payFrequency: 'bi-weekly', trackChecking: true, trackSavings: true,
        trackHabits: true, habitName: 'Gym'
    },
    cards: [{ id: 'c1', name: 'Sapphire Preferred', institution: 'Chase', limit: 10000 }],
    renewals: [{ name: 'Netflix', amount: 15.99, category: 'subs', interval: 1, intervalUnit: 'month', nextDue: '2026-03-15' }],
    cardAnnualFees: [],
    parsedTransactions: [],
    budgetActuals: {},
    holdingValues: { roth: 0, k401: 0, brokerage: 0, crypto: 0, hsa: 0 },
    financialConfig: {},
    aiProvider: 'gemini'
});

describe('buildSnapshotMessage', () => {
    it('returns a non-empty string', () => {
        const msg = buildSnapshotMessage(baseParams());
        expect(typeof msg).toBe('string');
        expect(msg.length).toBeGreaterThan(100);
    });

    it('produces Gemini-specific header', () => {
        const msg = buildSnapshotMessage(baseParams());
        expect(msg).toContain('INPUT SNAPSHOT (GEMINI)');
    });

    it('produces OpenAI-specific header', () => {
        const params = baseParams();
        params.aiProvider = 'openai';
        const msg = buildSnapshotMessage(params);
        expect(msg).toContain('WEEKLY SNAPSHOT (CHATGPT)');
        expect(msg).toContain('### Balances');
    });

    it('produces Claude-specific header', () => {
        const params = baseParams();
        params.aiProvider = 'claude';
        const msg = buildSnapshotMessage(params);
        expect(msg).toContain('WEEKLY SNAPSHOT (CLAUDE)');
    });

    it('includes checking and savings balances', () => {
        const msg = buildSnapshotMessage(baseParams());
        expect(msg).toContain('Checking:');
        expect(msg).toContain('Savings: $1000');
    });

    it('includes debts section', () => {
        const msg = buildSnapshotMessage(baseParams());
        expect(msg).toContain('Debts:');
        expect(msg).toContain('$450');
    });

    it('includes pending charges', () => {
        const msg = buildSnapshotMessage(baseParams());
        expect(msg).toContain('Pending Charges:');
        expect(msg).toContain('$75.00');
        expect(msg).toContain('Groceries');
    });

    it('includes renewals section with category codes', () => {
        const msg = buildSnapshotMessage(baseParams());
        expect(msg).toContain('Renewals/Subscriptions');
        expect(msg).toContain('Netflix');
        expect(msg).toContain('H-Subs');
    });

    it('includes user notes', () => {
        const msg = buildSnapshotMessage(baseParams());
        expect(msg).toContain('Paid rent already');
    });

    it('includes habit count when tracked', () => {
        const msg = buildSnapshotMessage(baseParams());
        expect(msg).toContain('Gym Count: 3');
    });

    it('includes card portfolio data', () => {
        const msg = buildSnapshotMessage(baseParams());
        expect(msg).toContain('Card Portfolio');
        expect(msg).toContain('Chase');
        expect(msg).toContain('Sapphire Preferred');
    });

    it('shows "none" when no debts are provided', () => {
        const params = baseParams();
        params.form.debts = [];
        const msg = buildSnapshotMessage(params);
        expect(msg).toContain('Debts:\n  none');
    });

    it('shows "none" when no cards are provided', () => {
        const params = baseParams();
        params.cards = [];
        const msg = buildSnapshotMessage(params);
        expect(msg).toContain('none');
    });

    it('includes timezone label', () => {
        const msg = buildSnapshotMessage(baseParams());
        expect(msg).toMatch(/Timezone: UTC[+-]\d{2}:\d{2}/);
    });

    it('includes pay frequency', () => {
        const msg = buildSnapshotMessage(baseParams());
        expect(msg).toContain('Pay Frequency: bi-weekly');
    });

    it('includes budget actuals when categories exist', () => {
        const params = baseParams();
        params.activeConfig.budgetCategories = [
            { name: 'Food', monthlyTarget: 400 }
        ];
        params.budgetActuals = { Food: 85.50 };
        const msg = buildSnapshotMessage(params);
        expect(msg).toContain('Budget Actuals');
        expect(msg).toContain('Food: $85.50');
    });

    it('includes non-card debts when present', () => {
        const params = baseParams();
        params.activeConfig.nonCardDebts = [
            { name: 'Student Loan', type: 'loan', balance: 25000, minimum: 250, apr: 5.5 }
        ];
        const msg = buildSnapshotMessage(params);
        expect(msg).toContain('Non-Card Debts');
        expect(msg).toContain('Student Loan');
    });

    it('includes credit score when present', () => {
        const params = baseParams();
        params.activeConfig.creditScore = 750;
        params.activeConfig.creditScoreDate = '2026-02-15';
        const msg = buildSnapshotMessage(params);
        expect(msg).toContain('Credit Score: 750');
        expect(msg).toContain('as of 2026-02-15');
    });

    it('includes savings goals when present', () => {
        const params = baseParams();
        params.activeConfig.savingsGoals = [
            { name: 'Emergency Fund', currentAmount: 3000, targetAmount: 10000 }
        ];
        const msg = buildSnapshotMessage(params);
        expect(msg).toContain('Savings Goals');
        expect(msg).toContain('Emergency Fund');
    });

    it('uses live holding values when enabled and not overridden', () => {
        const params = baseParams();
        params.activeConfig.enableHoldings = true;
        params.activeConfig.holdings = { roth: ['VTI'] };
        params.activeConfig.overrideRothValue = false;
        params.holdingValues.roth = 18500.75;
        params.form.roth = '15000';
        const msg = buildSnapshotMessage(params);
        expect(msg).toContain('18500.75');
        expect(msg).toContain('(live)');
    });
});
