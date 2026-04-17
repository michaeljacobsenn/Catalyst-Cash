import { Preferences } from "@capacitor/preferences";

const LOG_KEY = "catalyst-debug-log";
const MAX_ENTRIES = 200;
const MAX_DEPTH = 3;
const MAX_STRING_LENGTH = 240;
const PERSIST_INTERVAL = 5;

let buffer = [];
let loaded = false;

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const LEVEL_NAMES = ["DEBUG", "INFO", "WARN", "ERROR"];

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
  "networth",
  "spending",
  "ssn",
  "routing",
  "account",
  "credit",
  "investment",
  "holding",
  "recoveryid",
  "recoverykey",
  "authtoken",
  "encryptedblob",
  "integritytag",
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
  return REDACTED_KEYS.some((redacted) => normalizedKey.includes(redacted));
}

function sanitizeString(value) {
  let sanitized = String(value ?? "");
  for (const rule of SECRET_PATTERNS) {
    sanitized = sanitized.replace(rule.pattern, rule.replacement);
  }
  if (sanitized.length > MAX_STRING_LENGTH) {
    return `${sanitized.slice(0, MAX_STRING_LENGTH)}…`;
  }
  return sanitized;
}

function sanitizeValue(value, depth = 0) {
  if (value == null) return value;
  if (depth > MAX_DEPTH) return "[Truncated]";

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
    for (const [key, nestedValue] of Object.entries(value)) {
      safe[key] = shouldRedactKey(key) ? "[REDACTED]" : sanitizeValue(nestedValue, depth + 1);
    }
    return safe;
  }

  return sanitizeString(value);
}

function hasPayload(value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
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

function shouldPersist(level) {
  return level >= LEVELS.WARN || buffer.length % PERSIST_INTERVAL === 0;
}

async function persist() {
  try {
    await Preferences.set({ key: LOG_KEY, value: JSON.stringify(buffer) });
  } catch (error) {
    void error;
  }
}

async function loadBuffer() {
  if (loaded) return;
  try {
    const { value } = await Preferences.get({ key: LOG_KEY });
    if (value) buffer = JSON.parse(value);
  } catch (error) {
    void error;
  }
  loaded = true;
}

async function append(level, tag, message, data) {
  await loadBuffer();

  const entry = {
    t: new Date().toISOString(),
    l: LEVEL_NAMES[level] || "INFO",
    tag,
    msg: message,
  };

  if (data !== undefined && data !== null) {
    const safe = sanitizeValue(data);
    if (hasPayload(safe)) {
      entry.data = safe;
    }
  }

  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) {
    buffer = buffer.slice(-MAX_ENTRIES);
  }

  if (shouldPersist(level)) {
    void persist();
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

export const log = {
  debug: (tag, msg, data) => append(LEVELS.DEBUG, tag, msg, data),
  info: (tag, msg, data) => append(LEVELS.INFO, tag, msg, data),
  warn: (tag, msg, data) => append(LEVELS.WARN, tag, msg, data),
  error: (tag, msg, data) => append(LEVELS.ERROR, tag, msg, data),
};

export async function getLogs() {
  await loadBuffer();
  return [...buffer];
}

export async function getLogsAsText() {
  const entries = await getLogs();
  return entries
    .map((entry) => {
      const data = entry.data ? ` | ${JSON.stringify(entry.data)}` : "";
      return `[${entry.t}] [${entry.l}] [${entry.tag}] ${entry.msg}${data}`;
    })
    .join("\n");
}

export async function clearLogs() {
  buffer = [];
  await persist();
}

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
