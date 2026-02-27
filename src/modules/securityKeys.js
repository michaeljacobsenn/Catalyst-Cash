// Security-sensitive keys that must never be exported/synced/imported.
const EXACT_SECURITY_KEYS = new Set([
  "app-passcode",
  "require-auth",
  "use-face-id",
  "lock-timeout",
  "apple-linked-id",
]);

const SAFE_IMPORT_KEY_RE = /^[a-z0-9-]+$/;

export function isSecuritySensitiveKey(key = "") {
  const lower = key.toLowerCase();
  return EXACT_SECURITY_KEYS.has(key) || lower.startsWith("api-key") || lower.startsWith("api_key");
}

export function isSafeImportKey(key = "") {
  return SAFE_IMPORT_KEY_RE.test(key) && !isSecuritySensitiveKey(key);
}
