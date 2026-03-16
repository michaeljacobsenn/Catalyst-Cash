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
  "key",
  "secret",
  "token",
  "password",
  "passphrase",
  "pin",
  "prompt",
  "systemprompt",
  "snapshot",
  "payload",
  "content",
  "balance",
  "amount",
  "income",
  "salary",
  "debt",
  "apr",
  "history",
  "messages",
  "rules",
  "personal",
  // Financial PII additions
  "networth",   // catches netWorth, net_worth, networth_today, etc.
  "spending",   // catches spendingTotal, monthlySpending, etc.
  "ssn",        // social security number fields
  "routing",    // bank routing numbers
  "account",    // catches accountNumber, accountId, etc.
  "credit",     // catches creditScore, creditLimit, etc.
  "investment", // catches investmentBalance, investmentTotal, etc.
  "holding",    // catches holdings, holdingBalance, etc.
];

const SECRET_PATTERNS = [
  { pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, replacement: "Bearer [REDACTED]" },
  { pattern: /\bsk-[A-Za-z0-9_-]{10,}\b/g, replacement: "[API_KEY]" },
  { pattern: /\b(access|refresh|link|public|private|client|session)[-_ ]?token\b/gi, replacement: "[TOKEN]" },
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "[SSN]" },
  { pattern: /\b\d{9,19}\b/g, replacement: "[NUMBER]" },
];

function shouldRedactKey(key) {
  const normalizedKey = String(key || "").toLowerCase();
  return REDACTED_KEYS.some(redacted => normalizedKey.includes(redacted));
}

function sanitizeString(value) {
  let sanitized = String(value ?? "");
  for (const rule of SECRET_PATTERNS) {
    sanitized = sanitized.replace(rule.pattern, rule.replacement);
  }
  if (sanitized.length > 240) {
    sanitized = `${sanitized.slice(0, 240)}…`;
  }
  return sanitized;
}

function sanitizeValue(value, depth = 0) {
  if (value == null) return value;
  if (depth > 3) return "[Truncated]";
  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: sanitizeString(value.message || "Unknown error"),
    };
  }
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 8).map((item) => sanitizeValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const safe = {};
    for (const [k, v] of Object.entries(value)) {
      if (shouldRedactKey(k)) {
        safe[k] = "[REDACTED]";
        continue;
      }
      safe[k] = sanitizeValue(v, depth + 1);
    }
    return safe;
  }
  return sanitizeString(value);
}

function getConsoleMethod(level) {
  if (level >= LEVELS.ERROR) return console.error;
  if (level >= LEVELS.WARN) return console.warn;
  if (level >= LEVELS.INFO) return console.info;
  return console.debug;
}

function shouldEmitToConsole(level) {
  return Boolean(import.meta.env.DEV) || level >= LEVELS.WARN;
}

// ── Internal: persist buffer ──────────────────────────────────
async function persist() {
  try {
    await Preferences.set({ key: LOG_KEY, value: JSON.stringify(buffer) });
  } catch {
    /* silent — logging should never crash the app */
  }
}

// ── Internal: load buffer from storage ────────────────────────
async function loadBuffer() {
  if (loaded) return;
  try {
    const { value } = await Preferences.get({ key: LOG_KEY });
    if (value) buffer = JSON.parse(value);
  } catch {
    /* start fresh */
  }
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
    const safe = sanitizeValue(data);
    if (
      (typeof safe === "object" && safe !== null && Object.keys(safe).length > 0) ||
      typeof safe !== "object"
    ) {
      entry.data = safe;
    }
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

  if (shouldEmitToConsole(level)) {
    const consoleMethod = getConsoleMethod(level);
    if (entry.data) {
      consoleMethod(`[${entry.tag}] ${entry.msg}`, entry.data);
    } else {
      consoleMethod(`[${entry.tag}] ${entry.msg}`);
    }
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
  return entries
    .map(e => {
      const data = e.data ? ` | ${JSON.stringify(e.data)}` : "";
      return `[${e.t}] [${e.l}] [${e.tag}] ${e.msg}${data}`;
    })
    .join("\n");
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

export function redactForLog(value) {
  return sanitizeValue(value);
}

export function getSafeErrorMessage(error) {
  if (error instanceof Error) return sanitizeString(error.message || "Unknown error");
  return sanitizeString(String(error || "Unknown error"));
}
