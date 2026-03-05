import { describe, it, expect } from 'vitest';
import { validateSnapshot, validateCard, validateRenewal } from './validation.js';

describe('validateSnapshot', () => {
    it('passes valid snapshot', () => {
        const result = validateSnapshot({
            date: '2026-03-01',
            checking: '5000',
            savings: '10000',
            debts: [{ name: 'Card A', balance: '1000', apr: '24.99', minPayment: '25', limit: '5000' }]
        });
        expect(result.valid).toBe(true);
        expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
    });

    it('requires date', () => {
        const result = validateSnapshot({});
        expect(result.valid).toBe(false);
        expect(result.errors.find(e => e.field === 'date')).toBeTruthy();
    });

    it('warns on future date', () => {
        const future = new Date();
        future.setDate(future.getDate() + 7);
        const result = validateSnapshot({ date: future.toISOString().split('T')[0] });
        expect(result.errors.find(e => e.field === 'date' && e.severity === 'warning')).toBeTruthy();
    });

    it('errors on negative savings', () => {
        const result = validateSnapshot({ date: '2026-03-01', savings: '-500' });
        expect(result.valid).toBe(false);
    });

    it('errors on negative debt balance', () => {
        const result = validateSnapshot({
            date: '2026-03-01',
            debts: [{ name: 'Card', balance: '-100', apr: '20' }]
        });
        expect(result.valid).toBe(false);
    });

    it('warns on APR over 100%', () => {
        const result = validateSnapshot({
            date: '2026-03-01',
            debts: [{ name: 'Card', balance: '1000', apr: '150' }]
        });
        const aprWarning = result.errors.find(e => e.field.includes('apr'));
        expect(aprWarning).toBeTruthy();
        expect(aprWarning.severity).toBe('warning');
    });

    it('warns when balance exceeds limit', () => {
        const result = validateSnapshot({
            date: '2026-03-01',
            debts: [{ name: 'Card', balance: '6000', limit: '5000', apr: '20' }]
        });
        const warning = result.errors.find(e => e.field.includes('balance') && e.severity === 'warning');
        expect(warning).toBeTruthy();
    });

    it('handles empty debts array', () => {
        const result = validateSnapshot({ date: '2026-03-01', debts: [] });
        expect(result.valid).toBe(true);
    });

    it('handles XSS-style strings in debt names gracefully', () => {
        const result = validateSnapshot({
            date: '2026-03-01',
            debts: [{ name: '<script>alert(1)</script>', balance: '1000', apr: '20' }]
        });
        // Should still validate — XSS is a rendering concern, not validation
        expect(result.errors.find(e => e.field === 'date')).toBeFalsy();
    });

    it('handles extremely large balance values', () => {
        const result = validateSnapshot({
            date: '2026-03-01',
            debts: [{ name: 'Mega Card', balance: '999999999', apr: '20' }]
        });
        expect(result.valid).toBe(true);
    });

    it('handles unicode characters in debt names', () => {
        const result = validateSnapshot({
            date: '2026-03-01',
            debts: [{ name: 'Carte de Crédit 🇫🇷', balance: '500', apr: '15' }]
        });
        expect(result.valid).toBe(true);
    });

    it('accepts APR at boundary 0%', () => {
        const result = validateSnapshot({
            date: '2026-03-01',
            debts: [{ name: 'Promo Card', balance: '1000', apr: '0' }]
        });
        expect(result.valid).toBe(true);
    });

    it('accepts APR at boundary 99.99%', () => {
        const result = validateSnapshot({
            date: '2026-03-01',
            debts: [{ name: 'High APR Card', balance: '1000', apr: '99.99' }]
        });
        // Should be valid and NOT trigger the >100% warning
        const aprWarning = result.errors.find(e => e.field?.includes('apr') && e.severity === 'warning');
        expect(aprWarning).toBeFalsy();
    });
});

describe('validateCard', () => {
    it('passes valid card', () => {
        const result = validateCard({ name: 'Chase Sapphire', limit: 15000, apr: 24.99 });
        expect(result.valid).toBe(true);
    });

    it('requires card name', () => {
        const result = validateCard({ limit: 5000 });
        expect(result.valid).toBe(false);
    });

    it('rejects negative limit', () => {
        const result = validateCard({ name: 'Card', limit: -1000 });
        expect(result.valid).toBe(false);
    });

    it('rejects APR out of range', () => {
        expect(validateCard({ name: 'Card', apr: -5 }).valid).toBe(false);
        expect(validateCard({ name: 'Card', apr: 150 }).valid).toBe(false);
    });

    it('accepts card with nickname only', () => {
        const result = validateCard({ nickname: 'My Card' });
        expect(result.valid).toBe(true);
    });

    it('handles empty string name', () => {
        const result = validateCard({ name: '', limit: 5000 });
        expect(result.valid).toBe(false);
    });

    it('accepts APR exactly 0', () => {
        const result = validateCard({ name: 'Promo Card', apr: 0 });
        expect(result.valid).toBe(true);
    });
});

describe('validateRenewal', () => {
    it('passes valid renewal', () => {
        const result = validateRenewal({ name: 'Netflix', amount: 15.99, intervalUnit: 'months' });
        expect(result.valid).toBe(true);
    });

    it('requires name', () => {
        const result = validateRenewal({ amount: 10, intervalUnit: 'months' });
        expect(result.valid).toBe(false);
    });

    it('requires positive amount', () => {
        expect(validateRenewal({ name: 'Test', amount: 0, intervalUnit: 'months' }).valid).toBe(false);
        expect(validateRenewal({ name: 'Test', amount: -5, intervalUnit: 'months' }).valid).toBe(false);
    });

    it('requires interval unit', () => {
        const result = validateRenewal({ name: 'Test', amount: 10 });
        expect(result.valid).toBe(false);
    });
});
