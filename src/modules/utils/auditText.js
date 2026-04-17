export function sanitizeVisibleAuditCopy(value) {
  const text = String(value || "");
  if (!text) return "";

  return text
    .replace(/\b[Tt]he user's\b/g, "your")
    .replace(/\b[Tt]he user has\b/g, "you have")
    .replace(/\b[Tt]he user is\b/g, "you are")
    .replace(/\b[Tt]he user\b/g, "you")
    .replace(/\buser's\b/g, "your")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*\./g, ".")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/^[`"',;\s]+|[`"',;\s]+$/g, "")
    .trim();
}

export function normalizeLooseText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const CANONICAL_DASHBOARD_CATEGORIES = new Map([
  ["checking", "Checking"],
  ["vault", "Vault"],
  ["pending", "Pending"],
  ["debts", "Debts"],
  ["available", "Available"],
]);

export const SUPPLEMENTAL_DASHBOARD_CATEGORIES = new Set([
  "investments",
  "other assets",
]);

export function formatRiskFlag(flag) {
  return String(flag || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
