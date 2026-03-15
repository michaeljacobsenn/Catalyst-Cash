import { describe, it, expect, vi, beforeEach } from "vitest";

const secureStore = vi.hoisted(() => ({
  getSecureItem: vi.fn(async () => null),
  setSecureItem: vi.fn(async () => true),
}));

vi.mock("./secureStore.js", () => ({
  getSecureItem: secureStore.getSecureItem,
  setSecureItem: secureStore.setSecureItem,
}));

import { encryptAtRest, decryptAtRest, decryptAtRestDetailed, isEncrypted } from "./crypto.js";

// Mock db for testing
function createMockDb() {
  const store = {};
  return {
    async get(k) {
      return store[k] ?? null;
    },
    async set(k, v) {
      store[k] = v;
      return true;
    },
    async del(k) {
      delete store[k];
    },
    _store: store,
  };
}

const PBKDF2_ITERATIONS = 310_000;

function hexToBytes(hex) {
  return new Uint8Array(hex.match(/.{2}/g).map(h => parseInt(h, 16)));
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function encryptLegacyAtRest(data, db) {
  const saltHex = db._store["device-encryption-salt"];
  const salt = hexToBytes(saltHex);
  const keyMaterial = await crypto.subtle.importKey("raw", salt, "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { iv: toBase64(iv), ct: toBase64(ciphertext), v: 2 };
}

describe("Device-bound at-rest encryption", () => {
  let mockDb;

  beforeEach(() => {
    mockDb = createMockDb();
    secureStore.getSecureItem.mockReset();
    secureStore.setSecureItem.mockReset();
    secureStore.getSecureItem.mockResolvedValue(null);
    secureStore.setSecureItem.mockResolvedValue(true);
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

  it("stores separate device key material from the salt and mirrors it to secure storage", async () => {
    const data = { test: true };
    await encryptAtRest(data, mockDb);

    expect(mockDb._store["device-encryption-salt"]).toMatch(/^[0-9a-f]{32}$/);
    expect(mockDb._store["device-encryption-key"]).toMatch(/^[0-9a-f]{64}$/);
    expect(mockDb._store["device-encryption-key"]).not.toBe(mockDb._store["device-encryption-salt"]);
    expect(secureStore.setSecureItem).toHaveBeenCalledWith("device-encryption-key", mockDb._store["device-encryption-key"]);
  });

  it("decrypts legacy salt-only payloads via backward-compatible fallback", async () => {
    await encryptAtRest({ warmup: true }, mockDb);
    await mockDb.del("device-encryption-key");
    secureStore.getSecureItem.mockResolvedValue(null);

    const legacyPayload = await encryptLegacyAtRest({ legacy: "ok" }, mockDb);
    const decrypted = await decryptAtRest(legacyPayload, mockDb);
    expect(decrypted).toEqual({ legacy: "ok" });
  });

  it("reports when legacy key fallback was used so callers can re-encrypt", async () => {
    await encryptAtRest({ warmup: true }, mockDb);
    await mockDb.del("device-encryption-key");
    secureStore.getSecureItem.mockResolvedValue(null);

    const legacyPayload = await encryptLegacyAtRest({ legacy: "rewrite-me" }, mockDb);
    const result = await decryptAtRestDetailed(legacyPayload, mockDb);
    expect(result).toEqual({
      data: { legacy: "rewrite-me" },
      usedLegacyKey: true,
    });
  });
});
