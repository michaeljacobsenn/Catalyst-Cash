// ═══════════════════════════════════════════════════════════════
// AES-256-GCM ENCRYPTION — Web Crypto API (Zero Dependencies)
// Used for: encrypted backup exports and Google Drive cloud sync
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
    return obj && typeof obj === "object" && obj.v === 1 && obj.salt && obj.iv && obj.ct;
}
