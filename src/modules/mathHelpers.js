/**
 * mathHelpers.js — Shared numeric utilities.
 *
 * Single source of truth for clamp() and getGradeLetter().
 * Imported by engine.js, utils.js, ScrollSnapContainer, useSwipeGesture, HistoryTab, AuditTab.
 */

/**
 * Clamp a number between min and max (inclusive).
 * @param {number} value
 * @param {number} [min=0]
 * @param {number} [max=1]
 * @returns {number}
 */
export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Map a 0–100 health score to a letter grade.
 * Returns null if score is null/undefined.
 * @param {number|null|undefined} score
 * @returns {string|null}
 */
export function getGradeLetter(score) {
  if (score == null) return null;
  if (score >= 97) return "A+";
  if (score >= 93) return "A";
  if (score >= 90) return "A-";
  if (score >= 87) return "B+";
  if (score >= 83) return "B";
  if (score >= 80) return "B-";
  if (score >= 77) return "C+";
  if (score >= 73) return "C";
  if (score >= 70) return "C-";
  if (score >= 67) return "D+";
  if (score >= 63) return "D";
  if (score >= 60) return "D-";
  return "F";
}
