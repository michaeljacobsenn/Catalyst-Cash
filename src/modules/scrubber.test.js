import { describe, it, expect } from 'vitest';
import { buildScrubber } from './scrubber.js';

describe('PII Scrubber — buildScrubber', () => {
    it('scrubs card names and institutions', () => {
        const cards = [
            { name: 'Chase Sapphire Preferred', institution: 'Chase' },
            { name: 'Amex Gold', institution: 'Amex' }
        ];
        const { scrub, unscrub, hasMappings } = buildScrubber(cards);

        expect(hasMappings).toBe(true);
        const text = 'Pay your Chase Sapphire Preferred balance at Chase.';
        const scrubbed = scrub(text);

        expect(scrubbed).not.toContain('Chase Sapphire Preferred');
        expect(scrubbed).toContain('Credit Card 1');
    });

    it('unscrub restores original names', () => {
        const cards = [{ name: 'Discover It', institution: 'Discover' }];
        const { scrub, unscrub } = buildScrubber(cards);

        const original = 'Transfer $500 to pay off Discover It.';
        const scrubbed = scrub(original);
        const restored = unscrub(scrubbed);

        expect(restored).toContain('Discover It');
    });

    it('handles renewal scrubbing', () => {
        const renewals = [
            { name: 'Netflix Premium', chargedTo: 'checking' },
            { name: 'Spotify Family' }
        ];
        const { scrub } = buildScrubber([], renewals);

        const text = 'Netflix Premium renews next week. Spotify Family is $15.99.';
        const scrubbed = scrub(text);

        expect(scrubbed).not.toContain('Netflix Premium');
        expect(scrubbed).not.toContain('Spotify Family');
        expect(scrubbed).toContain('Subscription');
    });

    it('handles non-card debts', () => {
        const config = {
            nonCardDebts: [{ name: 'Student Loan XYZ' }]
        };
        const { scrub } = buildScrubber([], [], config);

        const text = 'Your Student Loan XYZ payment is due.';
        const scrubbed = scrub(text);

        expect(scrubbed).not.toContain('Student Loan XYZ');
        expect(scrubbed).toContain('Loan 1');
    });

    it('handles income sources', () => {
        const config = {
            incomeSources: [{ name: 'Acme Corporation' }]
        };
        const { scrub } = buildScrubber([], [], config);

        const text = 'Your paycheck from Acme Corporation arrives Friday.';
        const scrubbed = scrub(text);

        expect(scrubbed).not.toContain('Acme Corporation');
        expect(scrubbed).toContain('Income Source 1');
    });

    it('handles budget categories', () => {
        const config = {
            budgetCategories: [{ name: 'Groceries Fund' }]
        };
        const { scrub } = buildScrubber([], [], config);

        const text = 'Groceries Fund is over budget.';
        const scrubbed = scrub(text);

        expect(scrubbed).not.toContain('Groceries Fund');
        expect(scrubbed).toContain('Category 1');
    });

    it('handles form debts', () => {
        const form = {
            debts: [{ name: 'Auto Loan Wells Fargo' }]
        };
        const { scrub } = buildScrubber([], [], {}, form);

        const text = 'Auto Loan Wells Fargo balance is $12,000.';
        const scrubbed = scrub(text);

        expect(scrubbed).not.toContain('Auto Loan Wells Fargo');
    });

    it('does not scrub very short names (< 3 chars)', () => {
        const cards = [{ name: 'AB', institution: 'CD' }];
        const { scrub, hasMappings } = buildScrubber(cards);

        expect(hasMappings).toBe(false);
        const text = 'AB and CD are short.';
        expect(scrub(text)).toBe(text);
    });

    it('replaces longer names before shorter ones', () => {
        const cards = [
            { name: 'Chase Sapphire Reserve', institution: 'Chase' },
            { name: 'Chase Freedom', institution: 'Chase' }
        ];
        const { scrub } = buildScrubber(cards);

        const text = 'Chase Sapphire Reserve is better than Chase Freedom.';
        const scrubbed = scrub(text);

        // Both should be replaced, and "Chase Sapphire Reserve" should not be partially replaced
        expect(scrubbed).not.toContain('Chase Sapphire Reserve');
        expect(scrubbed).not.toContain('Chase Freedom');
    });

    it('is case-insensitive when scrubbing', () => {
        const cards = [{ name: 'Capital One Venture' }];
        const { scrub } = buildScrubber(cards);

        const text = 'CAPITAL ONE VENTURE is great.';
        const scrubbed = scrub(text);

        expect(scrubbed).not.toContain('CAPITAL ONE VENTURE');
    });

    it('handles empty inputs gracefully', () => {
        const { scrub, unscrub, hasMappings } = buildScrubber();

        expect(hasMappings).toBe(false);
        expect(scrub('')).toBe('');
        expect(scrub(null)).toBe(null);
        expect(unscrub('')).toBe('');
        expect(unscrub(null)).toBe(null);
    });

    it('scrub/unscrub roundtrip preserves original text', () => {
        const cards = [
            { name: 'Wells Fargo Platinum', institution: 'Wells Fargo' },
        ];
        const renewals = [{ name: 'Amazon Prime' }];
        const config = { nonCardDebts: [{ name: 'Car Loan' }] };
        const { scrub, unscrub } = buildScrubber(cards, renewals, config);

        const original = 'Pay Wells Fargo Platinum $200. Amazon Prime renews. Car Loan payment due.';
        const result = unscrub(scrub(original));

        expect(result).toBe(original);
    });

    it('handles special regex characters in names without throwing', () => {
        const cards = [{ name: 'Card (Plus+)' }];
        // Should not throw even with regex-special chars in the name
        expect(() => buildScrubber(cards)).not.toThrow();
        const { scrub } = buildScrubber(cards);
        const text = 'Your Card (Plus+) statement is ready.';
        // scrub should not throw either — result may or may not scrub depending on regex escaping
        expect(() => scrub(text)).not.toThrow();
    });
});
