import { describe, it, expect } from 'vitest';
import { mergeUniqueById } from './backup.js';

describe('mergeUniqueById', () => {
    it('merges two non-overlapping arrays', () => {
        const existing = [{ id: 'a', name: 'Alice' }];
        const incoming = [{ id: 'b', name: 'Bob' }];
        const result = mergeUniqueById(existing, incoming);
        expect(result).toHaveLength(2);
        expect(result.map(r => r.id)).toEqual(['a', 'b']);
    });

    it('keeps existing entries when IDs overlap', () => {
        const existing = [{ id: '1', name: 'Original' }];
        const incoming = [{ id: '1', name: 'Duplicate' }];
        const result = mergeUniqueById(existing, incoming);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Original');
    });

    it('returns existing when incoming is empty', () => {
        const existing = [{ id: 'x' }, { id: 'y' }];
        const result = mergeUniqueById(existing, []);
        expect(result).toBe(existing); // same reference — short-circuit
    });

    it('returns incoming items when existing is empty', () => {
        const incoming = [{ id: '1' }, { id: '2' }];
        const result = mergeUniqueById([], incoming);
        expect(result).toHaveLength(2);
    });

    it('handles both arrays empty', () => {
        expect(mergeUniqueById([], [])).toEqual([]);
    });

    it('handles undefined inputs gracefully', () => {
        expect(mergeUniqueById(undefined, undefined)).toEqual([]);
        expect(mergeUniqueById(undefined, [{ id: 'a' }])).toHaveLength(1);
        expect(mergeUniqueById([{ id: 'b' }], undefined)).toHaveLength(1);
    });

    it('preserves insertion order — existing first, then incoming', () => {
        const existing = [{ id: 'c' }, { id: 'a' }];
        const incoming = [{ id: 'b' }, { id: 'd' }];
        const result = mergeUniqueById(existing, incoming);
        expect(result.map(r => r.id)).toEqual(['c', 'a', 'b', 'd']);
    });

    it('handles large arrays efficiently', () => {
        const existing = Array.from({ length: 500 }, (_, i) => ({ id: `e${i}` }));
        const incoming = Array.from({ length: 500 }, (_, i) => ({ id: `i${i}` }));
        const result = mergeUniqueById(existing, incoming);
        expect(result).toHaveLength(1000);
    });

    it('handles objects with extra properties', () => {
        const existing = [{ id: '1', balance: 100, name: 'Card A' }];
        const incoming = [{ id: '2', balance: 200, name: 'Card B', apr: 24.99 }];
        const result = mergeUniqueById(existing, incoming);
        expect(result[1].apr).toBe(24.99);
        expect(result[0].balance).toBe(100);
    });

    it('treats numeric vs string IDs as different', () => {
        // Map keys are compared with SameValueZero, so '1' !== 1
        const existing = [{ id: '1', tag: 'string' }];
        const incoming = [{ id: 1, tag: 'number' }];
        const result = mergeUniqueById(existing, incoming);
        expect(result).toHaveLength(2);
    });
});
