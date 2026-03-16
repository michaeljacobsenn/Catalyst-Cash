const REDACTED_KEYS = [
  "token",
  "secret",
  "password",
  "passcode",
  "prompt",
  "snapshot",
  "history",
  "messages",
  "payload",
  "content",
  "balance",
  "amount",
  "income",
  "debt",
  "account",
  "routing",
  "ssn",
];

const STRING_REDACTIONS = [
  { pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, replacement: "Bearer [REDACTED]" },
  { pattern: /\bsk-[A-Za-z0-9_-]{10,}\b/g, replacement: "[API_KEY]" },
  { pattern: /\b(access|refresh|link|public|private|client|session)[-_ ]?token\b/gi, replacement: "[TOKEN]" },
  { pattern: /\b\d{9,19}\b/g, replacement: "[NUMBER]" },
];

function sanitizeString(value) {
  let sanitized = String(value ?? "");
  for (const rule of STRING_REDACTIONS) {
    sanitized = sanitized.replace(rule.pattern, rule.replacement);
  }
  return sanitized.length > 240 ? `${sanitized.slice(0, 240)}…` : sanitized;
}

function shouldRedactKey(key) {
  const normalized = String(key || "").toLowerCase();
  return REDACTED_KEYS.some((entry) => normalized.includes(entry));
}

export function redactForWorkerLogs(value, depth = 0) {
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
    return value.slice(0, 8).map((item) => redactForWorkerLogs(item, depth + 1));
  }
  if (typeof value === "object") {
    const safe = {};
    for (const [key, val] of Object.entries(value)) {
      safe[key] = shouldRedactKey(key) ? "[REDACTED]" : redactForWorkerLogs(val, depth + 1);
    }
    return safe;
  }
  return sanitizeString(value);
}

export function workerLog(env, level, tag, message, data = null) {
  const envName = String(env?.ENVIRONMENT || env?.NODE_ENV || "production").toLowerCase();
  const shouldEmit = level === "error" || level === "warn" || envName !== "production";
  if (!shouldEmit) return;

  const payload = data == null ? null : redactForWorkerLogs(data);
  const prefix = `[${tag}] ${message}`;
  if (payload) {
    console[level](prefix, payload);
  } else {
    console[level](prefix);
  }
}

export function getSafeClientError(error, fallbackMessage = "Something went wrong.") {
  const message = sanitizeString(error?.message || error || "");
  if (!message) return fallbackMessage;
  if (
    message.toLowerCase().includes("timed out") ||
    message.toLowerCase().includes("network") ||
    message.toLowerCase().includes("fetch")
  ) {
    return fallbackMessage;
  }
  return message;
}
