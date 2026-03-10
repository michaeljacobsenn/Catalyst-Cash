// ═══════════════════════════════════════════════════════════════
// DATE HELPERS — Shared ISO week utilities
// Extracted from AuditContext to eliminate duplication and enable testing.
// ═══════════════════════════════════════════════════════════════

/**
 * Get the ISO week number for a given date.
 * @param {string|Date} d - Date string or Date object
 * @returns {number} ISO week number (1-53)
 */
export function getISOWeekNum(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

/**
 * Get the ISO week string for a given date (e.g. "2026-W10").
 * @param {string} ds - Date string in YYYY-MM-DD format
 * @returns {string|null} ISO week string or null if input is falsy
 */
export function getISOWeek(ds) {
  if (!ds) return null;
  const d = new Date(ds);
  const w = getISOWeekNum(d);
  return `${d.getFullYear()}-W${w.toString().padStart(2, "0")}`;
}

/**
 * Compute the audit streak from history.
 * Returns the number of consecutive ISO weeks with at least one audit.
 * @param {Array} history - Array of audit objects with .date and .isTest
 * @returns {number} Consecutive week streak count
 */
export function computeStreak(history) {
  const realAudits = (history || []).filter(a => !a.isTest && a.date);
  const weeks = [...new Set(realAudits.map(a => getISOWeek(a.date)))].sort().reverse();

  if (!weeks.length) return 0;

  const curWeek = getISOWeek(new Date().toISOString().split("T")[0]);
  let streak = 0;
  let checkW = weeks[0] === curWeek ? curWeek : weeks[0];

  for (const w of weeks) {
    if (w === checkW) {
      streak++;
      // Go back one week
      const d = new Date(checkW.slice(0, 4), 0, 1);
      d.setDate(d.getDate() + (parseInt(checkW.slice(6)) - 2) * 7);
      checkW = getISOWeek(d.toISOString().split("T")[0]);
    } else {
      break;
    }
  }

  return streak;
}
