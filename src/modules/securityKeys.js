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
  "plaid-connections", // Handled via sanitizePlaidForBackup() — never raw-exported
  "plaid-transactions", // Financial PII (merchant names, amounts) — re-fetch from Plaid
  "market-data-cache", // Transient cache
  "market-data-ts",    // Transient cache
  "ota_rotating_categories", // Transient cache
  "last-backup-ts",    // Transient cache
  "full-profile-qa-seed-active", // Internal QA-only flag
  "household-id",      // Sync credentials
  "household-passcode",// Sync credentials
  "household-id-protected",
  "household-passcode-protected",
  "household-sync-version",
  "household-last-sync-ts",
  "household-last-merge-report",
  "household-last-conflict",
]);

const SAFE_IMPORT_KEY_RE = /^[a-z0-9-]+$/;
const SECURE_PREFIX = "secure:";

function normalizeSecurityKey(key = "") {
  const lower = String(key).toLowerCase();
  return lower.startsWith(SECURE_PREFIX) ? lower.slice(SECURE_PREFIX.length) : lower;
}

export function isSecuritySensitiveKey(key = "") {
  const normalized = normalizeSecurityKey(key);
  return EXACT_SECURITY_KEYS.has(normalized) || normalized.startsWith("api-key") || normalized.startsWith("api_key");
}

export function isSafeImportKey(key = "") {
  return SAFE_IMPORT_KEY_RE.test(key) && !isSecuritySensitiveKey(key);
}

/**
 * Strip access tokens from Plaid connections while preserving all metadata
 * (institution names, account masks, linked card/bank IDs, etc.).
 * This lets `autoMatchAccounts` deduplicate on reconnect after a backup restore.
 *
 * @param {Array} connections - Raw plaid-connections array from local DB
 * @returns {Array} Sanitized connections safe for backup export
 */
export function sanitizePlaidForBackup(connections = []) {
  if (!Array.isArray(connections) || connections.length === 0) return [];
  return connections.map(conn => ({
    id: conn.id,
    institutionName: conn.institutionName,
    institutionId: conn.institutionId,
    accounts: (conn.accounts || []).map(acct => ({
      plaidAccountId: acct.plaidAccountId,
      name: acct.name,
      officialName: acct.officialName,
      type: acct.type,
      subtype: acct.subtype,
      mask: acct.mask,
      linkedCardId: acct.linkedCardId || null,
      linkedBankAccountId: acct.linkedBankAccountId || null,
      linkedInvestmentId: acct.linkedInvestmentId || null,
      // Balances are NOT preserved — they must be re-fetched from Plaid
      balance: null,
    })),
    lastSync: null,
    _needsReconnect: true, // Flag: user must re-link via Plaid
    // accessToken is intentionally omitted — tokens remain worker-side only
  }));
}
