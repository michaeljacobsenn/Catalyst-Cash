import { describe, it, expect, vi, beforeEach } from "vitest";
import { encryptAtRest, decryptAtRest, isEncrypted } from "./crypto.js";

// Mock db for testing
function createMockDb() {
    const store = {};
    return {
        async get(k) { return store[k] ?? null; },
        async set(k, v) { store[k] = v; return true; },
        async del(k) { delete store[k]; },
        _store: store,
    };
}

describe("Device-bound at-rest encryption", () => {
    let mockDb;

    beforeEach(() => {
        mockDb = createMockDb();
    });

    it("encrypts and decrypts data round-trip", async () => {
        const original = [
            { role: "user", content: "Hello", ts: Date.now() },
            { role: "assistant", content: "Hi there!", ts: Date.now() },
        ];

        const encrypted = await encryptAtRest(original, mockDb);
        expect(encrypted).toHaveProperty("iv");
        expect(encrypted).toHaveProperty("ct");
        expect(encrypted.v).toBe(2);

        // Encrypted payload should NOT contain plaintext
        expect(encrypted.ct).not.toContain("Hello");

        const decrypted = await decryptAtRest(encrypted, mockDb);
        expect(decrypted).toEqual(original);
    });

    it("isEncrypted detects v:2 encrypted payloads", () => {
        expect(isEncrypted({ iv: "abc", ct: "xyz", v: 2 })).toBe(true);
        expect(isEncrypted({ iv: "abc", ct: "xyz", v: 1 })).toBe(true); // passphrase-based
        expect(isEncrypted(null)).toBe(false);
        expect(isEncrypted([1, 2, 3])).toBe(false);
        expect(isEncrypted({ some: "data" })).toBe(false);
    });

    it("returns null for invalid/corrupted payloads", async () => {
        const result = await decryptAtRest({ iv: "bad", ct: "data", v: 2 }, mockDb);
        expect(result).toBeNull();
    });

    it("returns null for empty payloads", async () => {
        expect(await decryptAtRest(null, mockDb)).toBeNull();
        expect(await decryptAtRest({}, mockDb)).toBeNull();
    });

    it("uses consistent key across multiple encryptions", async () => {
        const data = { test: true };
        const enc1 = await encryptAtRest(data, mockDb);
        const enc2 = await encryptAtRest(data, mockDb);

        // Both should decrypt successfully with the same db
        const dec1 = await decryptAtRest(enc1, mockDb);
        const dec2 = await decryptAtRest(enc2, mockDb);
        expect(dec1).toEqual(data);
        expect(dec2).toEqual(data);

        // IVs should be different (unique per encryption)
        expect(enc1.iv).not.toBe(enc2.iv);
    });

    it("encrypts objects with special characters", async () => {
        const data = { emoji: "🔥💰", unicode: "日本語", quotes: 'He said "hello"' };
        const encrypted = await encryptAtRest(data, mockDb);
        const decrypted = await decryptAtRest(encrypted, mockDb);
        expect(decrypted).toEqual(data);
    });
});
