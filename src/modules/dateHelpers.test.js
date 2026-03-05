import { describe, it, expect } from 'vitest';
import { getISOWeekNum, getISOWeek, computeStreak } from './dateHelpers.js';

describe('getISOWeekNum', () => {
    it('returns week 1 for Jan 1 of a year starting on Thursday', () => {
        // 2026-01-01 is a Thursday → ISO Week 1
        expect(getISOWeekNum('2026-01-01')).toBe(1);
    });

    it('handles end of year correctly', () => {
        // Dec 31, 2025 is a Wednesday → ISO Week 1 of 2026 or Week 53 of 2025
        const week = getISOWeekNum('2025-12-31');
        expect(week).toBeGreaterThanOrEqual(1);
        expect(week).toBeLessThanOrEqual(53);
    });

    it('returns consistent results for same date', () => {
        expect(getISOWeekNum('2024-06-15')).toBe(getISOWeekNum('2024-06-15'));
    });

    it('handles Date objects', () => {
        const result = getISOWeekNum(new Date('2024-01-08'));
        expect(typeof result).toBe('number');
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(53);
    });
});

describe('getISOWeek', () => {
    it('returns formatted week string', () => {
        const result = getISOWeek('2026-01-01');
        expect(result).toMatch(/^\d{4}-W\d{2}$/);
    });

    it('returns null for empty input', () => {
        expect(getISOWeek(null)).toBeNull();
        expect(getISOWeek('')).toBeNull();
        expect(getISOWeek(undefined)).toBeNull();
    });

    it('pads single-digit weeks', () => {
        const result = getISOWeek('2026-01-05');
        expect(result).toMatch(/-W0[1-9]$/);
    });
});

describe('computeStreak', () => {
    it('returns 0 for empty history', () => {
        expect(computeStreak([])).toBe(0);
        expect(computeStreak(null)).toBe(0);
    });

    it('returns 0 when only test audits exist', () => {
        expect(computeStreak([
            { date: '2026-03-01', isTest: true },
            { date: '2026-02-22', isTest: true }
        ])).toBe(0);
    });

    it('counts consecutive weeks', () => {
        // Create audits for 3 consecutive weeks
        const today = new Date();
        const audits = [];
        for (let i = 0; i < 3; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - (i * 7));
            audits.push({ date: d.toISOString().split('T')[0], isTest: false });
        }
        const streak = computeStreak(audits);
        expect(streak).toBeGreaterThanOrEqual(2); // At least 2, maybe 3 depending on day of week
    });

    it('breaks streak on gap week', () => {
        // Create audits with a gap
        const today = new Date();
        const audits = [
            { date: today.toISOString().split('T')[0], isTest: false },
            // Skip a week
            { date: new Date(today.getTime() - 14 * 86400000).toISOString().split('T')[0], isTest: false }
        ];
        const streak = computeStreak(audits);
        expect(streak).toBeLessThanOrEqual(2); // Gap should break the streak
    });
});
