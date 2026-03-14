/**
 * @typedef {object} DashboardSafetyInput
 * @property {number} [spendableCash]
 * @property {number} [pendingCharges]
 * @property {number} [savingsCash]
 * @property {number} [floor]
 * @property {number} [weeklySpendAllowance]
 * @property {import("../../types/index.js").Renewal[]} [renewals]
 * @property {import("../../types/index.js").Card[]} [cards]
 * @property {number | null} [healthScore]
 * @property {string} [auditStatus]
 * @property {string} [todayStr]
 */

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function normalizeDateInput(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  if (/^\d{2}\/\d{2}$/.test(dateStr)) {
    const [month, day] = dateStr.split("/").map(Number);
    if (!month || !day) return null;
    const now = new Date();
    let year = now.getFullYear();
    const candidate = new Date(Date.UTC(year, month - 1, day));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (candidate.getTime() < today.getTime()) {
      year += 1;
    }
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

function daysUntil(dateStr, todayStr = new Date().toISOString().split("T")[0]) {
  const normalized = normalizeDateInput(dateStr);
  if (!normalized) return null;
  const due = new Date(`${normalized}T12:00:00Z`);
  const today = new Date(`${todayStr}T12:00:00Z`);
  const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  return Number.isFinite(diff) ? diff : null;
}

function sumUpcomingRenewals(renewals = [], windowDays = 30, todayStr) {
  return renewals.reduce((sum, renewal) => {
    if (!renewal || renewal.isCancelled || renewal.archivedAt) return sum;
    const amount = toNumber(renewal.amount);
    if (amount <= 0) return sum;
    const dueInDays = daysUntil(renewal.nextDue, todayStr);
    if (dueInDays == null || dueInDays < 0 || dueInDays > windowDays) return sum;
    return sum + amount;
  }, 0);
}

function sumCardMinimums(cards = []) {
  return cards.reduce((sum, card) => {
    if (!card || card.type === "debit") return sum;
    const balance = Math.max(0, toNumber(card._plaidBalance ?? card.balance));
    if (balance <= 0) return sum;
    const minPayment = toNumber(card.minPayment);
    return sum + (minPayment > 0 ? minPayment : Math.max(balance * 0.01, 25));
  }, 0);
}

function pickPrimaryRisk({ pendingCharges, upcomingBills30d, cardMinimums, floorGap, healthScore }) {
  const candidates = [
    { key: "floor-gap", amount: Math.max(0, floorGap) },
    { key: "pending", amount: pendingCharges },
    { key: "bills", amount: upcomingBills30d },
    { key: "card-minimums", amount: cardMinimums },
    { key: "score", amount: healthScore != null ? Math.max(0, 70 - healthScore) : 0 },
  ].sort((a, b) => b.amount - a.amount);

  const winner = candidates[0];
  if (!winner || winner.amount <= 0) return "none";
  return winner.key;
}

/**
 * Build a deterministic, UI-safe summary of near-term cash protection.
 *
 * @param {DashboardSafetyInput} input
 */
export function buildDashboardSafetyModel({
  spendableCash = 0,
  pendingCharges = 0,
  savingsCash = 0,
  floor = 0,
  weeklySpendAllowance = 0,
  renewals = [],
  cards = [],
  healthScore = null,
  auditStatus = "UNKNOWN",
  todayStr,
} = {}) {
  const safeSpendableCash = Math.max(0, toNumber(spendableCash));
  const safePendingCharges = Math.max(0, toNumber(pendingCharges));
  const safeSavingsCash = Math.max(0, toNumber(savingsCash));
  const safeFloor = Math.max(0, toNumber(floor));
  const safeAllowance = Math.max(0, toNumber(weeklySpendAllowance));
  const upcomingBills30d = sumUpcomingRenewals(renewals, 30, todayStr);
  const cardMinimums = sumCardMinimums(cards);
  const protectedNeed = safeFloor + safePendingCharges + upcomingBills30d + cardMinimums;
  const safeToSpend = safeSpendableCash - protectedNeed;
  const runwayBase = safeSpendableCash - safePendingCharges - upcomingBills30d - cardMinimums;
  const runwayWeeks = safeAllowance > 0 ? runwayBase / safeAllowance : null;
  const floorGap = protectedNeed - safeSpendableCash;
  const normalizedStatus = String(auditStatus || "UNKNOWN").toUpperCase();

  let level = "stable";
  if (safeSpendableCash <= 0 || safeToSpend < 0 || normalizedStatus.includes("RED")) {
    level = "urgent";
  } else if (
    safeToSpend < Math.max(50, safeAllowance * 0.75) ||
    (runwayWeeks != null && runwayWeeks < 1.5) ||
    normalizedStatus.includes("YELLOW") ||
    (healthScore != null && healthScore < 70)
  ) {
    level = "caution";
  }

  const headline =
    level === "urgent" ? "Cash protection is not fully covered." :
    level === "caution" ? "You are covered, but the buffer is tight." :
    "You are currently covered with a real cash buffer.";

  const summary =
    level === "urgent"
      ? "Protect bills, floor cash, and card minimums before any optional spending."
      : level === "caution"
        ? "Keep this week deliberate and avoid treating savings or future income as already available."
        : "You can spend from checking without breaching the protected cash layer, as long as spending stays controlled.";

  return {
    level,
    headline,
    summary,
    safeToSpend,
    protectedNeed,
    pendingCharges: safePendingCharges,
    upcomingBills30d,
    cardMinimums,
    floor: safeFloor,
    savingsCash: safeSavingsCash,
    runwayWeeks: runwayWeeks != null ? Number(runwayWeeks.toFixed(1)) : null,
    primaryRisk: pickPrimaryRisk({
      pendingCharges: safePendingCharges,
      upcomingBills30d,
      cardMinimums,
      floorGap,
      healthScore,
    }),
  };
}
