// Security-sensitive keys that must never be exported/synced/imported.
const EXACT_SECURITY_KEYS = new Set([
  "app-passcode",
  "require-auth",
  "use-face-id",
  "lock-timeout",
  "apple-linked-id",
  "device-id",
  "subscription-state",
  "cc-device-id",
  "cc-audit-state",
]);

const SAFE_IMPORT_KEY_RE = /^[a-z0-9-]+$/;
const SECURE_PREFIX = "secure:";

function normalizeSecurityKey(key = "") {
  const lower = String(key).toLowerCase();
  return lower.startsWith(SECURE_PREFIX) ? lower.slice(SECURE_PREFIX.length) : lower;
}

export function isSecuritySensitiveKey(key = "") {
  const normalized = normalizeSecurityKey(key);
  return (
    EXACT_SECURITY_KEYS.has(normalized) ||
    normalized.startsWith("api-key") ||
    normalized.startsWith("api_key")
  );
}

export function isSafeImportKey(key = "") {
  return SAFE_IMPORT_KEY_RE.test(key) && !isSecuritySensitiveKey(key);
}
