// ═══════════════════════════════════════════════════════════════
// REFERRAL PROGRAM — Catalyst Cash
//
// Give-one-get-one: both referrer and referee earn 1 free month
// of Pro. Benefits are only granted AFTER the referred user
// completes their first Pro purchase (verified via RevenueCat).
//
// Flow:
//   1. User A shares their code (CC-XXXXXX)
//   2. User B clicks the link → code stored as pending
//   3. User B redeems the code → server stores as "pending"
//   4. User B purchases Pro → client calls confirmReferral()
//   5. Server verifies purchase → promotes to "confirmed"
//   6. Both parties get credited
//
// Referral deep links: https://catalystcash.app/ref/{CODE}
// ═══════════════════════════════════════════════════════════════

import { Capacitor } from "@capacitor/core";
import { log } from "./logger.js";
import { getOrCreateDeviceId } from "./subscription.js";
import { db } from "./utils.js";

const REFERRAL_CODE_KEY = "referral-code";
const REFERRAL_STATS_KEY = "referral-stats";
const PENDING_REFERRAL_KEY = "pending-referral-code";
const REFERRAL_REDEEMED_KEY = "referral-redeemed"; // has this device redeemed a referral?
const REFERRAL_CONFIRMED_KEY = "referral-confirmed"; // has the referral been purchase-confirmed?
const CODE_PREFIX = "CC";
const CODE_LENGTH = 6; // CC-XXXXXX (8 total chars with prefix + dash)
const MAX_REFERRAL_BONUS_MONTHS = 12; // Cap: 12 free months (1 year)
const REFERRAL_SYNC_COOLDOWN_MS = 5 * 60 * 1000;

let referralStatsSyncPromise = null;
let lastReferralStatsSyncAt = 0;
let lastReferralStatsSyncError = "";

/**
 * Generate a random alphanumeric code of given length.
 */
function generateRandomCode(length = CODE_LENGTH) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed ambiguous: I, O, 0, 1
  let code = "";
  const array = new Uint8Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < length; i++) array[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < length; i++) {
    code += chars[array[i] % chars.length];
  }
  return `${CODE_PREFIX}-${code}`;
}

/**
 * Get the user's referral code, generating one if it doesn't exist.
 * The code is persisted in local DB and tied to the device ID.
 */
export async function getReferralCode() {
  try {
    const existing = await db.get(REFERRAL_CODE_KEY);
    if (existing && typeof existing === "string") return existing;

    const code = generateRandomCode();
    await db.set(REFERRAL_CODE_KEY, code);
    return code;
  } catch (err) {
    void log.warn("referral", "Failed to get/generate referral code", { error: err?.message });
    return null;
  }
}

/**
 * Get referral statistics for the current user.
 * @returns {{ code: string|null, totalReferred: number, pendingReferred: number, bonusMonthsEarned: number, ownRedemptionStatus: string|null }}
 */
export async function getReferralStats() {
  try {
    const code = await getReferralCode();
    const stats = (await db.get(REFERRAL_STATS_KEY)) || {
      totalReferred: 0,
      pendingReferred: 0,
      bonusMonthsEarned: 0,
      ownRedemptionStatus: null,
    };
    return {
      code,
      totalReferred: stats.totalReferred || 0,
      pendingReferred: stats.pendingReferred || 0,
      bonusMonthsEarned: stats.bonusMonthsEarned || 0,
      ownRedemptionStatus: stats.ownRedemptionStatus || null,
    };
  } catch {
    return { code: null, totalReferred: 0, pendingReferred: 0, bonusMonthsEarned: 0, ownRedemptionStatus: null };
  }
}

/**
 * Sync referral stats from the server.
 * Updates local cache with the latest confirmed/pending counts.
 */
export async function syncReferralStats() {
  const now = Date.now();
  if (referralStatsSyncPromise) {
    return referralStatsSyncPromise;
  }
  if (now - lastReferralStatsSyncAt < REFERRAL_SYNC_COOLDOWN_MS) {
    return null;
  }

  lastReferralStatsSyncAt = now;
  referralStatsSyncPromise = (async () => {
  try {
    const deviceId = await getOrCreateDeviceId();
    const { fetchJson } = await import("./api.js");
    const result = await fetchJson(`/referral/stats?deviceId=${encodeURIComponent(deviceId)}`);

    if (result?.ok) {
      lastReferralStatsSyncError = "";
      const stats = {
        totalReferred: result.totalReferred || 0,
        pendingReferred: result.pendingReferred || 0,
        bonusMonthsEarned: result.bonusMonthsEarned || 0,
        ownRedemptionStatus: result.ownRedemptionStatus || null,
      };
      await db.set(REFERRAL_STATS_KEY, stats);
      return stats;
    }
  } catch (err) {
    const errorMessage = String(err?.message || "unknown");
    if (errorMessage !== lastReferralStatsSyncError) {
      lastReferralStatsSyncError = errorMessage;
      void log.warn("referral", "Failed to sync referral stats", { error: errorMessage });
    }
  }
  return null;
  })();

  try {
    return await referralStatsSyncPromise;
  } finally {
    referralStatsSyncPromise = null;
  }
}

/**
 * Update local referral stats after a successful referral credit.
 */
export async function recordReferralCredit() {
  try {
    const stats = (await db.get(REFERRAL_STATS_KEY)) || {
      totalReferred: 0,
      pendingReferred: 0,
      bonusMonthsEarned: 0,
    };
    stats.totalReferred = (stats.totalReferred || 0) + 1;
    stats.bonusMonthsEarned = Math.min(
      (stats.bonusMonthsEarned || 0) + 1,
      MAX_REFERRAL_BONUS_MONTHS,
    );
    await db.set(REFERRAL_STATS_KEY, stats);
    return stats;
  } catch (err) {
    void log.warn("referral", "Failed to record referral credit", { error: err?.message });
    return null;
  }
}

/**
 * Share the user's referral link via the native Share sheet.
 * Falls back to clipboard on web.
 */
export async function shareReferralLink() {
  const code = await getReferralCode();
  if (!code) return false;

  const url = `https://catalystcash.app/ref/${code}`;
  const text = `I use Catalyst Cash to track my financial health every week. Use my referral link and we both get a free month of Pro: ${url}`;

  try {
    if (Capacitor.isNativePlatform()) {
      const { Share } = await import("@capacitor/share");
      await Share.share({
        title: "Get a free month of Catalyst Cash Pro",
        text,
        url,
        dialogTitle: "Share your referral link",
      });
    } else if (navigator.share) {
      await navigator.share({ title: "Catalyst Cash Referral", text, url });
    } else {
      await navigator.clipboard.writeText(url);
      window.toast?.success?.("Referral link copied to clipboard!");
    }
    return true;
  } catch (err) {
    // User cancellation is expected from share sheet
    const msg = String(err?.message || "");
    if (msg.includes("cancel") || msg.includes("abort")) return false;
    void log.warn("referral", "Share referral failed", { error: msg });
    return false;
  }
}

/**
 * Store a pending referral code from a deep link for later redemption.
 */
export async function storePendingReferral(code) {
  if (!code || typeof code !== "string") return;
  const normalized = code.toUpperCase().trim();
  if (!/^CC-[A-Z0-9]{6}$/.test(normalized)) return;
  await db.set(PENDING_REFERRAL_KEY, normalized);
}

/**
 * Check if there's a pending referral code to redeem.
 */
export async function getPendingReferral() {
  return (await db.get(PENDING_REFERRAL_KEY)) || null;
}

/**
 * Clear the pending referral after successful redemption.
 */
export async function clearPendingReferral() {
  await db.del(PENDING_REFERRAL_KEY);
}

/**
 * Check if this device has already redeemed a referral code.
 */
export async function hasRedeemedReferral() {
  return Boolean(await db.get(REFERRAL_REDEEMED_KEY));
}

/**
 * Check if this device's referral has been purchase-confirmed.
 */
export async function isReferralConfirmed() {
  return Boolean(await db.get(REFERRAL_CONFIRMED_KEY));
}

/**
 * Mark this device as having redeemed a referral (pending state).
 */
export async function markReferralRedeemed(code) {
  await db.set(REFERRAL_REDEEMED_KEY, { code, ts: new Date().toISOString(), status: "pending" });
}

/**
 * Mark this device's referral as purchase-confirmed.
 */
export async function markReferralConfirmed() {
  const redeemed = await db.get(REFERRAL_REDEEMED_KEY);
  if (redeemed && typeof redeemed === "object") {
    redeemed.status = "confirmed";
    redeemed.confirmedAt = new Date().toISOString();
    await db.set(REFERRAL_REDEEMED_KEY, redeemed);
  }
  await db.set(REFERRAL_CONFIRMED_KEY, true);
}

/**
 * Redeem a referral code via the worker API.
 * This stores the redemption as PENDING — no benefits until purchase is confirmed.
 *
 * @param {string} code - The referral code to redeem (e.g. "CC-XXXXXX")
 * @returns {Promise<{ ok: boolean, status?: string, error?: string, message?: string }>}
 */
export async function redeemReferralCode(code) {
  if (!code || typeof code !== "string") return { ok: false, error: "Invalid code" };

  const normalized = code.toUpperCase().trim();
  if (!/^CC-[A-Z0-9]{6}$/.test(normalized)) return { ok: false, error: "Invalid referral code format" };

  // Prevent self-referral
  const myCode = await getReferralCode();
  if (myCode === normalized) return { ok: false, error: "You can't use your own referral code" };

  // Check if already redeemed
  if (await hasRedeemedReferral()) return { ok: false, error: "You've already used a referral code" };

  try {
    const deviceId = await getOrCreateDeviceId();
    const { fetchJson } = await import("./api.js");
    const result = await fetchJson("/referral/redeem", {
      method: "POST",
      body: JSON.stringify({
        code: normalized,
        deviceId,
        refereeCode: myCode, // So the worker knows who the referee is
      }),
    });

    if (result?.ok) {
      await markReferralRedeemed(normalized);
      await clearPendingReferral();
      return {
        ok: true,
        status: result.status || "pending",
        message: result.message || "Referral saved! Your bonus will activate when your friend subscribes.",
      };
    }

    return { ok: false, error: result?.error || "Redemption failed" };
  } catch (err) {
    void log.warn("referral", "Referral redemption failed", { error: err?.message });
    return { ok: false, error: "Network error — try again later" };
  }
}

/**
 * Confirm a pending referral after the user makes their first purchase.
 * Should be called whenever a successful RevenueCat purchase is detected.
 *
 * @returns {Promise<{ ok: boolean, status?: string, message?: string }>}
 */
export async function confirmReferral() {
  // Skip if no pending referral or already confirmed
  const redeemed = await db.get(REFERRAL_REDEEMED_KEY);
  if (!redeemed) return { ok: true, status: "no_referral" };
  if (await isReferralConfirmed()) return { ok: true, status: "already_confirmed" };

  try {
    const deviceId = await getOrCreateDeviceId();
    const { fetchJson } = await import("./api.js");
    const result = await fetchJson("/referral/confirm", {
      method: "POST",
      body: JSON.stringify({ deviceId }),
    });

    if (result?.status === "confirmed" || result?.status === "already_confirmed") {
      await markReferralConfirmed();
      await recordReferralCredit();
      void log.info("referral", "Referral confirmed after purchase", { status: result.status });
      return { ok: true, status: "confirmed", message: result.message };
    }

    // Still pending — purchase not verified yet on server side
    return { ok: true, status: result?.status || "pending", message: result?.message };
  } catch (err) {
    void log.warn("referral", "Referral confirmation failed", { error: err?.message });
    return { ok: false, status: "error" };
  }
}

export { MAX_REFERRAL_BONUS_MONTHS };
