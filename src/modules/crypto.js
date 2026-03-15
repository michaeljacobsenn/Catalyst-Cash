// ═══════════════════════════════════════════════════════════════
// AES-256-GCM ENCRYPTION — Web Crypto API (Zero Dependencies)
// Used for: encrypted backup exports and iCloud cloud sync
// ═══════════════════════════════════════════════════════════════

  import { getSecureItem,setSecureItem } from "./secureStore.js";

const PBKDF2_ITERATIONS = 310_000; // OWASP recommended minimum for PBKDF2-SHA256

/**
 * Derive an AES-256-GCM key from a passphrase + salt using PBKDF2.
 */
async function deriveKey(passphrase, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function fromBase64(b64) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf;
}

/**
 * Encrypt plaintext string with a passphrase.
 * Returns: { v: 1, salt: base64, iv: base64, ct: base64 }
 */
export async function encrypt(plaintext, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return {
    v: 1,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ct: toBase64(ct),
  };
}

/**
 * Decrypt an encrypted envelope with a passphrase.
 * Returns plaintext string. Throws on wrong passphrase.
 */
export async function decrypt(envelope, passphrase) {
  if (!envelope || envelope.v !== 1) throw new Error("Unsupported encryption format");
  const salt = fromBase64(envelope.salt);
  const iv = fromBase64(envelope.iv);
  const ct = fromBase64(envelope.ct);
  const key = await deriveKey(passphrase, salt);
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error("Decryption failed — wrong passphrase");
  }
}

/**
 * Check if a parsed JSON object looks like an encrypted envelope.
 */
export function isEncrypted(obj) {
  return !!(obj && typeof obj === "object" && (obj.v === 1 || obj.v === 2) && obj.iv && obj.ct);
}

// ═══════════════════════════════════════════════════════════════
// DEVICE-BOUND AT-REST ENCRYPTION — for chat history
// No user passphrase needed. Uses a per-install random secret
// stored in db + secure storage as the key material.
// ═══════════════════════════════════════════════════════════════

const DEVICE_SALT_KEY = "device-encryption-salt";
const DEVICE_KEY_KEY = "device-encryption-key";

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex) {
  if (typeof hex !== "string" || hex.length === 0 || hex.length % 2 !== 0) return null;
  const pairs = hex.match(/.{2}/g);
  if (!pairs) return null;
  const bytes = pairs.map(h => parseInt(h, 16));
  if (bytes.some(Number.isNaN)) return null;
  return new Uint8Array(bytes);
}

async function getOrCreateDeviceSalt(db) {
  let saltHex = await db.get(DEVICE_SALT_KEY);
  let salt = hexToBytes(saltHex);
  if (!salt || salt.length < 16) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    saltHex = bytesToHex(salt);
    await db.set(DEVICE_SALT_KEY, saltHex);
    return salt;
  }
  return salt;
}

async function getOrCreateDeviceKeyMaterial(db) {
  const secureStored = await getSecureItem(DEVICE_KEY_KEY).catch(() => null);
  const secureKeyHex = typeof secureStored === "string" ? secureStored : null;
  const secureKey = hexToBytes(secureKeyHex);
  if (secureKey?.length === 32) {
    await db.set(DEVICE_KEY_KEY, secureKeyHex);
    return secureKey;
  }

  const dbStored = await db.get(DEVICE_KEY_KEY);
  const dbKeyHex = typeof dbStored === "string" ? dbStored : null;
  const dbKey = hexToBytes(dbKeyHex);
  if (dbKey?.length === 32) {
    await setSecureItem(DEVICE_KEY_KEY, dbKeyHex).catch(() => false);
    return dbKey;
  }

  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const keyHex = bytesToHex(keyBytes);
  await Promise.all([
    db.set(DEVICE_KEY_KEY, keyHex),
    setSecureItem(DEVICE_KEY_KEY, keyHex).catch(() => false),
  ]);
  return keyBytes;
}

async function importPbkdf2KeyMaterial(keyMaterialBytes) {
  return crypto.subtle.importKey("raw", keyMaterialBytes, "PBKDF2", false, ["deriveKey"]);
}

async function deriveDeviceKeyFromMaterial(keyMaterialBytes, salt) {
  const keyMaterial = await importPbkdf2KeyMaterial(keyMaterialBytes);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function deriveDeviceKey(db) {
  const salt = await getOrCreateDeviceSalt(db);
  const keyMaterialBytes = await getOrCreateDeviceKeyMaterial(db);
  return deriveDeviceKeyFromMaterial(keyMaterialBytes, salt);
}

async function deriveLegacyDeviceKey(db) {
  const salt = await getOrCreateDeviceSalt(db);
  return deriveDeviceKeyFromMaterial(salt, salt);
}

/**
 * Encrypt JSON-serializable data at rest (device-bound, no passphrase).
 * @param {any} data - Data to encrypt
 * @param {object} db - The db storage abstraction from utils.js
 * @returns {Promise<{ iv: string, ct: string, v: 2 }>}
 */
export async function encryptAtRest(data, db) {
  const key = await deriveDeviceKey(db);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return {
    iv: toBase64(iv),
    ct: toBase64(ciphertext),
    v: 2,
  };
}

export async function decryptAtRestDetailed(payload, db) {
  if (!payload?.iv || !payload?.ct) return { data: null, usedLegacyKey: false };

  const iv = fromBase64(payload.iv);
  const ct = fromBase64(payload.ct);

  try {
    const key = await deriveDeviceKey(db);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return {
      data: JSON.parse(new TextDecoder().decode(plaintext)),
      usedLegacyKey: false,
    };
  } catch {
    try {
      const legacyKey = await deriveLegacyDeviceKey(db);
      const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, legacyKey, ct);
      return {
        data: JSON.parse(new TextDecoder().decode(plaintext)),
        usedLegacyKey: true,
      };
    } catch {
      return { data: null, usedLegacyKey: false };
    }
  }
}

/**
 * Decrypt a device-bound encrypted payload.
 * @param {{ iv: string, ct: string, v: 2 }} payload
 * @param {object} db
 * @returns {Promise<any>} Decrypted data
 */
export async function decryptAtRest(payload, db) {
  const result = await decryptAtRestDetailed(payload, db);
  return result.data;
}
