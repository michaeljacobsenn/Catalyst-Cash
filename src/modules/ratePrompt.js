/**
 * ratePrompt.js — App Store rating prompt
 *
 * Triggers the native SKStoreReviewController.requestReview() dialog on iOS
 * via the Capacitor App plugin's openUrl as a fallback-safe approach.
 *
 * Key rules:
 *  - Only fire once per 90-day window (persisted in db)
 *  - Only fire if the user has completed ≥ 3 real (non-test) audits
 *  - Only fire on native iOS platform
 *  - Never fire if the user has already rated (track via db flag)
 */

import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { db } from "./utils.js";
import { log } from "./logger.js";

const APP_STORE_ID = "6759579655"; // Catalyst Cash App Store ID
const RATE_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const MIN_AUDITS_BEFORE_PROMPT = 3;
const DB_KEY_LAST_PROMPTED = "rate-prompt-last-ts";
const DB_KEY_HAS_RATED = "rate-prompt-has-rated";

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
    const [lastTs, hasRated] = await Promise.all([
      db.get(DB_KEY_LAST_PROMPTED),
      db.get(DB_KEY_HAS_RATED),
    ]);

    if (hasRated) return;

    const now = Date.now();
    const cooldownPassed = !lastTs || now - Number(lastTs) > RATE_COOLDOWN_MS;
    if (!cooldownPassed) return;

    // Mark as prompted before showing — avoids double-fire on race conditions
    await db.set(DB_KEY_LAST_PROMPTED, now);

    // Use App.openUrl to the App Store review URL (most reliable Capacitor approach)
    // SKStoreReviewController is called natively by the OS when landing on this URL
    await App.openUrl({
      url: `itms-apps://itunes.apple.com/app/id${APP_STORE_ID}?action=write-review`,
    });

    void log.info("ratePrompt", "Rating prompt triggered", { auditCount: realAuditCount });
  } catch (err) {
    void log.warn("ratePrompt", "Rating prompt failed", { error: err });
  }
}

/**
 * Mark that the user has submitted a review so we never bother them again.
 */
export async function markUserHasRated() {
  await db.set(DB_KEY_HAS_RATED, true);
}
