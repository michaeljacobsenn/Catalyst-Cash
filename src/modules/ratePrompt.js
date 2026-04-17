/**
 * ratePrompt.js — App Store rating prompt
 *
 * Triggers the native SKStoreReviewController.requestReview() dialog on iOS
 * via the Capacitor App plugin's openUrl as a fallback-safe approach.
 *
 * Two trigger paths:
 *  1. Audit-count path: ≥ 3 real audits, once per 90-day window
 *  2. Value-moment path: after proven value (score improvement, first
 *     export, first bank connection), once per 60-day window
 *
 * Key rules:
 *  - Only fire once per cooldown window (persisted in db)
 *  - Only fire on native iOS platform
 *  - Never fire if the user has already rated (track via db flag)
 */

import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { db } from "./utils.js";
import { log } from "./logger.js";

const APP_STORE_ID = "6759579655"; // Catalyst Cash App Store ID
const RATE_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const VALUE_MOMENT_COOLDOWN_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
const MIN_AUDITS_BEFORE_PROMPT = 3;
const DB_KEY_LAST_PROMPTED = "rate-prompt-last-ts";
const DB_KEY_HAS_RATED = "rate-prompt-has-rated";

/**
 * Check cooldown eligibility for a given window.
 * @returns {Promise<boolean>} true if cooldown has passed
 */
async function isCooldownPassed(cooldownMs) {
  const [lastTs, hasRated] = await Promise.all([
    db.get(DB_KEY_LAST_PROMPTED),
    db.get(DB_KEY_HAS_RATED),
  ]);
  if (hasRated) return false;
  const now = Date.now();
  return !lastTs || now - Number(lastTs) > cooldownMs;
}

/**
 * Execute the actual review prompt.
 */
async function executeReviewPrompt(triggerReason) {
  await db.set(DB_KEY_LAST_PROMPTED, Date.now());
  await App.openUrl({
    url: `itms-apps://itunes.apple.com/app/id${APP_STORE_ID}?action=write-review`,
  });
  void log.info("ratePrompt", "Rating prompt triggered", { trigger: triggerReason });
}

/**
 * Call after each completed audit. Shows the rating prompt only when:
 *  - Native iOS platform
 *  - ≥ 3 real audits completed
 *  - 90+ days since last prompt (or never prompted)
 *  - User hasn't flagged they already rated
 * @param {number} realAuditCount - number of non-test audits in history
 */
export async function maybeRequestReview(realAuditCount) {
  if (!Capacitor.isNativePlatform()) return;
  if (realAuditCount < MIN_AUDITS_BEFORE_PROMPT) return;

  try {
    if (!(await isCooldownPassed(RATE_COOLDOWN_MS))) return;
    await executeReviewPrompt(`audit_count_${realAuditCount}`);
  } catch (err) {
    void log.warn("ratePrompt", "Rating prompt failed", { error: err });
  }
}

/**
 * Trigger a review prompt after a proven value moment.
 * Uses a shorter 60-day cooldown since the user just experienced real value.
 *
 * Valid triggers:
 *  - "score_improvement" — health score went up ≥ 5 points
 *  - "first_export" — first successful backup export
 *  - "first_bank_connection" — first successful Plaid link
 *  - "badge_earned" — milestone badge unlocked
 *  - "negotiation_complete" — user completed a negotiation script
 *
 * @param {string} trigger - The value moment identifier
 */
export async function maybeRequestReviewForValue(trigger) {
  if (!Capacitor.isNativePlatform()) return;

  try {
    if (!(await isCooldownPassed(VALUE_MOMENT_COOLDOWN_MS))) return;
    await executeReviewPrompt(`value_moment_${trigger}`);
  } catch (err) {
    void log.warn("ratePrompt", "Value-moment rating prompt failed", { error: err });
  }
}

/**
 * Mark that the user has submitted a review so we never bother them again.
 */
export async function markUserHasRated() {
  await db.set(DB_KEY_HAS_RATED, true);
}

