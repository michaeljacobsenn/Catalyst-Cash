// ═══════════════════════════════════════════════════════════════
// LOGGER — Catalyst Cash
//
// Lightweight ring-buffer logger. Stores the last 200 entries in
// Capacitor Preferences so they survive app restarts. Users can
// export logs from Settings → Support → Export Debug Log.
//
// Usage:
//   import { log } from "./logger.js";
//   log.info("audit", "Audit started", { provider: "gemini" });
//   log.error("api", "Request failed", { status: 502 });
//   log.warn("subscription", "Quota nearing limit", { remaining: 1 });
// ═══════════════════════════════════════════════════════════════

import { Preferences } from "@capacitor/preferences";

const LOG_KEY = "catalyst-debug-log";
const MAX_ENTRIES = 200;

let buffer = [];
let loaded = false;

// ── Level Enum ────────────────────────────────────────────────
const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const LEVEL_NAMES = ["DEBUG", "INFO", "WARN", "ERROR"];

// Fields that MUST NEVER appear in logs
const REDACTED_KEYS = [
    "key", "secret", "token", "password", "passphrase", "pin",
    "prompt", "systemprompt", "snapshot", "payload", "content",
    "balance", "amount", "income", "salary", "debt", "apr",
    "history", "messages", "rules", "personal",
];

// ── Internal: persist buffer ──────────────────────────────────
async function persist() {
    try {
        await Preferences.set({ key: LOG_KEY, value: JSON.stringify(buffer) });
    } catch { /* silent — logging should never crash the app */ }
}

// ── Internal: load buffer from storage ────────────────────────
async function loadBuffer() {
    if (loaded) return;
    try {
        const { value } = await Preferences.get({ key: LOG_KEY });
        if (value) buffer = JSON.parse(value);
    } catch { /* start fresh */ }
    loaded = true;
}

// ── Core: append log entry ────────────────────────────────────
async function append(level, tag, message, data) {
    await loadBuffer();

    const entry = {
        t: new Date().toISOString(),
        l: LEVEL_NAMES[level] || "INFO",
        tag,
        msg: message,
    };

    // Only include data if present and non-empty
    if (data !== undefined && data !== null) {
        const safe = {};
        for (const [k, v] of Object.entries(data)) {
            const kl = k.toLowerCase();
            if (REDACTED_KEYS.some(r => kl.includes(r))) continue;
            if (typeof v === "string" && v.length > 120) {
                safe[k] = v.slice(0, 120) + "…";
            } else {
                safe[k] = v;
            }
        }
        if (Object.keys(safe).length > 0) entry.data = safe;
    }

    buffer.push(entry);

    // Ring buffer — keep last MAX_ENTRIES
    if (buffer.length > MAX_ENTRIES) {
        buffer = buffer.slice(-MAX_ENTRIES);
    }

    // Persist every 5 entries to reduce I/O
    if (buffer.length % 5 === 0) {
        persist();
    }
}

// ── Public API ────────────────────────────────────────────────
export const log = {
    debug: (tag, msg, data) => append(LEVELS.DEBUG, tag, msg, data),
    info: (tag, msg, data) => append(LEVELS.INFO, tag, msg, data),
    warn: (tag, msg, data) => append(LEVELS.WARN, tag, msg, data),
    error: (tag, msg, data) => append(LEVELS.ERROR, tag, msg, data),
};

/**
 * Get all stored log entries as an array.
 */
export async function getLogs() {
    await loadBuffer();
    return [...buffer];
}

/**
 * Get logs formatted as a plain-text string for export.
 */
export async function getLogsAsText() {
    const entries = await getLogs();
    return entries.map(e => {
        const data = e.data ? ` | ${JSON.stringify(e.data)}` : "";
        return `[${e.t}] [${e.l}] [${e.tag}] ${e.msg}${data}`;
    }).join("\n");
}

/**
 * Clear all stored logs.
 */
export async function clearLogs() {
    buffer = [];
    await persist();
}

/**
 * Flush any buffered entries to storage immediately.
 */
export async function flushLogs() {
    await persist();
}
