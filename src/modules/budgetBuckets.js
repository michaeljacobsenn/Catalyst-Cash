/** @typedef {"bills" | "needs" | "wants" | "savings"} BudgetBucket */

export const BUDGET_BUCKET_ORDER = ["bills", "needs", "wants", "savings"];

export const DEFAULT_BUDGET_ICONS = {
  bills: "🧾",
  needs: "🛒",
  wants: "✨",
  savings: "🎯",
};

export const BUDGET_BUCKET_CONFIG = {
  bills: {
    label: "Bills",
    emoji: "🧾",
    description: "Rent, minimums, insurance, recurring obligations",
    color: "#7C6FFF",
  },
  needs: {
    label: "Needs",
    emoji: "🛒",
    description: "Groceries, fuel, transit, healthcare, essentials",
    color: "#20B99A",
  },
  wants: {
    label: "Wants",
    emoji: "✨",
    description: "Dining, shopping, travel, entertainment",
    color: "#FF8A4C",
  },
  savings: {
    label: "Savings Goals",
    emoji: "🎯",
    description: "Emergency fund, sinking funds, investing",
    color: "#F4B740",
  },
};

const CANONICAL_BUCKETS = new Set(BUDGET_BUCKET_ORDER);
const LEGACY_BUCKET_MAP = {
  fixed: "bills",
  flex: "needs",
  invest: "savings",
};

function createBudgetLineId(index = 0) {
  return `line-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeBucketValue(bucket) {
  const raw = String(bucket || "").trim().toLowerCase();
  if (CANONICAL_BUCKETS.has(raw)) {
    return { bucket: raw, needsReview: false, changed: raw !== bucket };
  }
  if (raw in LEGACY_BUCKET_MAP) {
    return {
      bucket: LEGACY_BUCKET_MAP[raw],
      needsReview: raw === "flex",
      changed: true,
    };
  }
  return {
    bucket: "needs",
    needsReview: raw !== "needs",
    changed: raw !== "needs",
  };
}

export function normalizeBudgetLine(line, index = 0) {
  if (!line || typeof line !== "object") return null;
  const normalizedBucket = normalizeBucketValue(line.bucket);
  const name = String(line.name || "").trim();
  const amount = Number(line.amount);
  const normalized = {
    ...line,
    id: String(line.id || "").trim() || createBudgetLineId(index),
    name: name || "Untitled",
    amount: Number.isFinite(amount) && amount >= 0 ? amount : 0,
    bucket: normalizedBucket.bucket,
    icon: String(line.icon || "").trim() || DEFAULT_BUDGET_ICONS[normalizedBucket.bucket],
  };

  if (line.isAuto) normalized.isAuto = true;
  else delete normalized.isAuto;

  const keepReviewFlag = Boolean(line.needsReview) || normalizedBucket.needsReview;
  if (keepReviewFlag) normalized.needsReview = true;
  else delete normalized.needsReview;

  const changed =
    normalizedBucket.changed ||
    normalized.id !== line.id ||
    normalized.name !== line.name ||
    normalized.amount !== line.amount ||
    normalized.icon !== line.icon ||
    Boolean(normalized.needsReview) !== Boolean(line.needsReview) ||
    Boolean(normalized.isAuto) !== Boolean(line.isAuto);

  return { line: normalized, changed };
}

export function normalizeBudgetLines(lines) {
  if (!Array.isArray(lines)) return { lines: [], changed: lines != null };
  let changed = false;
  const normalized = [];
  lines.forEach((line, index) => {
    const result = normalizeBudgetLine(line, index);
    if (!result) {
      changed = true;
      return;
    }
    normalized.push(result.line);
    if (result.changed) changed = true;
  });
  return { lines: normalized, changed };
}
