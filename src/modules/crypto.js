// ═══════════════════════════════════════════════════════════════
// AES-256-GCM ENCRYPTION — Web Crypto API (Zero Dependencies)
// Used for: encrypted backup exports and iCloud cloud sync
// ═══════════════════════════════════════════════════════════════

const PBKDF2_ITERATIONS = 310_000; // OWASP recommended minimum for PBKDF2-SHA256

/**
 * Derive an AES-256-GCM key from a passphrase + salt using PBKDF2.
 */
async function deriveKey(passphrase, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]
    );
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
    const ct = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(plaintext)
    );
    return {
        v: 1,
        salt: toBase64(salt),
        iv: toBase64(iv),
        ct: toBase64(ct)
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
// stored in device preferences as the key material.
// ═══════════════════════════════════════════════════════════════

const DEVICE_SALT_KEY = "device-encryption-salt";

async function getOrCreateDeviceSalt(db) {
    let saltHex = await db.get(DEVICE_SALT_KEY);
    if (!saltHex || typeof saltHex !== "string" || saltHex.length < 32) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, "0")).join("");
        await db.set(DEVICE_SALT_KEY, saltHex);
    }
    return new Uint8Array(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)));
}

async function deriveDeviceKey(db) {
    const salt = await getOrCreateDeviceSalt(db);
    const keyMaterial = await crypto.subtle.importKey(
        "raw", salt, "PBKDF2", false, ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
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
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv }, key, plaintext
    );
    return {
        iv: toBase64(iv),
        ct: toBase64(ciphertext),
        v: 2,
    };
}

/**
 * Decrypt a device-bound encrypted payload.
 * @param {{ iv: string, ct: string, v: 2 }} payload
 * @param {object} db
 * @returns {Promise<any>} Decrypted data
 */
export async function decryptAtRest(payload, db) {
    if (!payload?.iv || !payload?.ct) return null;
    try {
        const key = await deriveDeviceKey(db);
        const iv = fromBase64(payload.iv);
        const ct = fromBase64(payload.ct);
        const plaintext = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv }, key, ct
        );
        return JSON.parse(new TextDecoder().decode(plaintext));
    } catch {
        // If decryption fails (e.g. salt was reset), return null gracefully
        return null;
    }
}
