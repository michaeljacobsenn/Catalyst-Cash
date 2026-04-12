  import { Capacitor } from "@capacitor/core";
  import { LocalNotifications } from "@capacitor/local-notifications";
  import { log } from "./logger.js";

const PAYDAY_REMINDER_ID = 1001;
const WEEKLY_AUDIT_NUDGE_ID = 1002;
const BILL_REMINDER_BASE_ID = 2000; // IDs 2000-2099 reserved for bill reminders
const GEOFENCE_SIM_NOTIFICATION_ID = 3001;

const DAY_MAP = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

function supportsLocalNotifications() {
  return (
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() !== "web" &&
    (typeof Capacitor.isPluginAvailable !== "function" || Capacitor.isPluginAvailable("LocalNotifications"))
  );
}

/**
 * Request iOS notification permission.
 * Returns true if granted, false otherwise.
 */
export async function requestNotificationPermission() {
  if (!supportsLocalNotifications()) return false;
  try {
    const { display } = await LocalNotifications.requestPermissions();
    return display === "granted";
  } catch {
    return false;
  }
}

/**
 * Check current permission status without prompting.
 */
export async function getNotificationPermission() {
  if (!supportsLocalNotifications()) return "denied";
  try {
    const { display } = await LocalNotifications.checkPermissions();
    return display; // "granted" | "denied" | "prompt"
  } catch {
    return "denied";
  }
}

// ─── Geo-fence anti-spam cooldowns ───────────────────────────────────────────
// Prevents notification spam when a user lingers near or re-enters a store.
// Per-store cooldown: 30 minutes before we re-alert for the same location.
// Global cooldown: 5 minutes between any geo-fence alert (different stores).
const GEO_PER_STORE_COOLDOWN_MS = 30 * 60 * 1000; // 30 min
const GEO_GLOBAL_COOLDOWN_MS = 5 * 60 * 1000;     // 5 min
const _geoPerStoreCooldowns = new Map();            // store name → last fired ts
let _geoLastFiredTs = 0;                            // timestamp of last any-store alert

/**
 * Returns true if the store has been notified recently (within cooldown windows).
 * Pass forceReset=true in QA/simulation context to bypass and reset cooldowns.
 */
function isGeoOnCooldown(store, forceReset = false) {
  if (forceReset) {
    _geoPerStoreCooldowns.delete(store);
    _geoLastFiredTs = 0;
    return false;
  }
  const now = Date.now();
  if (now - _geoLastFiredTs < GEO_GLOBAL_COOLDOWN_MS) return true;
  const lastStore = _geoPerStoreCooldowns.get(store) || 0;
  if (now - lastStore < GEO_PER_STORE_COOLDOWN_MS) return true;
  return false;
}

function recordGeoFired(store) {
  const now = Date.now();
  _geoLastFiredTs = now;
  _geoPerStoreCooldowns.set(store, now);
}

export async function triggerStoreArrivalNotification(store, body, { forceReset = false } = {}) {
  // Anti-spam: skip if within cooldown windows (QA preview bypasses this)
  if (isGeoOnCooldown(store, forceReset)) {
    void log.info("notifications", "Geo-fence notification suppressed by cooldown", { store });
    return false;
  }

  if (!supportsLocalNotifications()) return false;
  try {
    let { display } = await LocalNotifications.checkPermissions();
    if (display === "prompt") {
      const permissionResult = await LocalNotifications.requestPermissions();
      display = permissionResult.display;
    }
    if (display !== "granted") return false;

    await LocalNotifications.cancel({ notifications: [{ id: GEOFENCE_SIM_NOTIFICATION_ID }] });
    await LocalNotifications.schedule({
      notifications: [
        {
          id: GEOFENCE_SIM_NOTIFICATION_ID,
          title: `${store} Nearby`,
          body,
          schedule: { at: new Date(Date.now() + 750), allowWhileIdle: true },
          sound: "default",
          smallIcon: "ic_stat_icon_config_sample",
          iconColor: "#7C6FFF",
          extra: { route: "portfolio" },
        },
      ],
    });
    recordGeoFired(store);
    return true;
  } catch (err) {
    void log.warn("notifications", "triggerStoreArrivalNotification failed", { error: err });
    return false;
  }
}

/**
 * Compute the Date object for the next payday reminder.
 *
 * Fires AT paycheckTime on payday (money just landed — run your audit).
 * Defaults to 09:00 on payday if paycheckTime is missing.
 * Always targets strictly the NEXT occurrence (never today if it already passed).
 */
export function computeNextReminderDate(payday, paycheckTime) {
  const targetDay = DAY_MAP[payday];
  if (targetDay === undefined) return null;

  const hasTime = paycheckTime && /^\d{1,2}:\d{2}$/.test(paycheckTime);

  let notifyDay = targetDay;
  let notifyHour, notifyMin;

  if (hasTime) {
    // Fire 12 hours before the paycheck arrives, with day rollover
    const [h, m] = paycheckTime.split(":").map(Number);
    let totalNotifyMin = h * 60 + m - 12 * 60;
    if (totalNotifyMin < 0) {
      totalNotifyMin += 24 * 60;
      notifyDay = (targetDay - 1 + 7) % 7;
    }
    notifyHour = Math.floor(totalNotifyMin / 60);
    notifyMin = totalNotifyMin % 60;
  } else {
    // No time known — fire at 09:00 on payday
    notifyHour = 9;
    notifyMin = 0;
  }

  const now = new Date();
  const diff = (notifyDay - now.getDay() + 7) % 7;

  const candidate = new Date(
    now.getFullYear(), now.getMonth(), now.getDate() + diff,
    notifyHour, notifyMin, 0, 0
  );

  // If that moment is already in the past (or within 5 min), push to next week
  if (candidate.getTime() - now.getTime() < 5 * 60 * 1000) {
    candidate.setDate(candidate.getDate() + 7);
  }

  return candidate;
}

/**
 * Cancel any existing payday reminder and schedule a new one.
 * Call this on app start and whenever payday/paycheckTime/toggle changes.
 */
export async function schedulePaydayReminder(payday, paycheckTime) {
  if (!supportsLocalNotifications()) return false;
  try {
    // Guard: verify notification permission before scheduling
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== "granted") {
      void log.info("notifications", "schedulePaydayReminder skipped — permission not granted", { display });
      return false;
    }

    await LocalNotifications.cancel({ notifications: [{ id: PAYDAY_REMINDER_ID }] });

    const fireAt = computeNextReminderDate(payday, paycheckTime);
    if (!fireAt) return false;

    const dayName = payday || "payday";
    const timeLabel = paycheckTime || "your paycheck";

    await LocalNotifications.schedule({
      notifications: [
        {
          id: PAYDAY_REMINDER_ID,
          title: "💰 Payday Today — Run Your Snapshot",
          body: `${dayName} paycheck incoming. Open the app to run your financial audit before ${timeLabel}.`,
          schedule: { at: fireAt, allowWhileIdle: true },
          sound: "default",
          smallIcon: "ic_stat_icon_config_sample",
          iconColor: "#7C6FFF",
          extra: { route: "audit" },
        },
      ],
    });

    return true;
  } catch (err) {
    void log.warn("notifications", "schedulePaydayReminder failed", { error: err });
    return false;
  }
}

/**
 * Cancel the payday reminder entirely.
 */
export async function cancelPaydayReminder() {
  if (!supportsLocalNotifications()) return false;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: PAYDAY_REMINDER_ID }] });
  } catch {
    // silently ignore
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════
// BUDGET OVERRUN ALERT — fires immediately after audit completes
// when one or more budget lines exceeded their per-cycle target.
// ═══════════════════════════════════════════════════════════════
const BUDGET_OVERRUN_ID = 4001;

/**
 * Fire a budget overrun notification after a real audit.
 * @param {Array<{name: string, icon: string, amount: number, actual: number}>} overruns
 */
export async function scheduleOverrunNotification(overruns) {
  if (!supportsLocalNotifications() || !overruns?.length) return false;
  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== "granted") return false;

    await LocalNotifications.cancel({ notifications: [{ id: BUDGET_OVERRUN_ID }] });

    // Build message: highlight the worst offender
    const worst = overruns.reduce((a, b) => (b.actual - b.amount > a.actual - a.amount ? b : a));
    const overCount = overruns.length;
    const title = overCount === 1
      ? `${worst.icon} Budget overrun: ${worst.name}`
      : `⚠️ ${overCount} budget lines over this cycle`;
    const body = overCount === 1
      ? `You spent $${worst.actual.toFixed(0)} vs your $${worst.amount.toFixed(0)} target — $${(worst.actual - worst.amount).toFixed(0)} over.`
      : `${worst.icon} ${worst.name} is the biggest overrun (+$${(worst.actual - worst.amount).toFixed(0)}). Check your Budget tab.`;

    await LocalNotifications.schedule({
      notifications: [{
        id: BUDGET_OVERRUN_ID,
        title,
        body,
        schedule: { at: new Date(Date.now() + 2000) }, // fire ~2s after audit saves
        sound: undefined,
        smallIcon: "ic_stat_notify",
        iconColor: "#FF6B6B",
        extra: { route: "budget" },
      }],
    });
    return true;
  } catch (e) {
    log("scheduleOverrunNotification error", e);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// POST-AUDIT CELEBRATION — fires 3 hours after an audit
// ═══════════════════════════════════════════════════════════════
const POST_AUDIT_CELEBRATION_ID = 1004;

/**
 * Schedule a celebratory notification 3 hours after completing an audit.
 * Reinforces the habit with positive feedback.
 */
export async function schedulePostAuditCelebration(score, streak) {
  if (!supportsLocalNotifications()) return false;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: POST_AUDIT_CELEBRATION_ID }] });

    const { display } = await LocalNotifications.checkPermissions();
    if (display !== "granted") return false;

    const fireAt = new Date(Date.now() + 3 * 60 * 60 * 1000); // 3 hours from now

    const messages = [
      score >= 90
        ? `🏆 Health score: ${score}! You're in elite territory.`
        : score >= 75
          ? `📊 Health score: ${score} — solid progress. Keep pushing.`
          : score >= 50
            ? `💪 Health score: ${score} — building momentum. Every week counts.`
            : `📈 Health score: ${score} — you showed up. That's what matters.`,
    ];
    let body = messages[0];
    if (streak > 1) body += ` W${streak} streak 🔥`;

    await LocalNotifications.schedule({
      notifications: [
        {
          id: POST_AUDIT_CELEBRATION_ID,
          title: "✅ Audit Complete!",
          body,
          schedule: { at: fireAt, allowWhileIdle: true },
          sound: "default",
          smallIcon: "ic_stat_icon_config_sample",
          iconColor: "#2ECC71",
          extra: { route: "dashboard" },
        },
      ],
    });
    return true;
  } catch (err) {
    void log.warn("notifications", "schedulePostAuditCelebration failed", { error: err });
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// MID-WEEK CHECK-IN — fires Wednesday at noon
// ═══════════════════════════════════════════════════════════════
const MID_WEEK_CHECK_IN_ID = 1005;

export async function scheduleMidWeekCheckIn(weeklyAllowance) {
  if (!supportsLocalNotifications()) return false;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: MID_WEEK_CHECK_IN_ID }] });

    const { display } = await LocalNotifications.checkPermissions();
    if (display !== "granted") return false;

    const now = new Date();
    let daysUntilWed = (3 - now.getDay() + 7) % 7;
    if (daysUntilWed === 0 && now.getHours() >= 12) daysUntilWed = 7;

    const fireAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilWed, 12, 0, 0, 0);

    const body =
      weeklyAllowance > 0
        ? `Halfway through the week — check if you're tracking under your $${weeklyAllowance} allowance.`
        : `Halfway through the week — quick pulse check on your spending.`;

    await LocalNotifications.schedule({
      notifications: [
        {
          id: MID_WEEK_CHECK_IN_ID,
          title: "📊 Mid-Week Pulse",
          body,
          schedule: { at: fireAt, every: "week", allowWhileIdle: true },
          sound: "default",
          smallIcon: "ic_stat_icon_config_sample",
          iconColor: "#7B5EA7",
          extra: { route: "dashboard" },
        },
      ],
    });
    return true;
  } catch (err) {
    void log.warn("notifications", "scheduleMidWeekCheckIn failed", { error: err });
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// MONTH-END SUMMARY — fires 28th of each month at 10am
// ═══════════════════════════════════════════════════════════════
const MONTH_END_SUMMARY_ID = 1006;

export async function scheduleMonthEndSummary() {
  if (!supportsLocalNotifications()) return false;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: MONTH_END_SUMMARY_ID }] });

    const { display } = await LocalNotifications.checkPermissions();
    if (display !== "granted") return false;

    const now = new Date();
    let fireAt = new Date(now.getFullYear(), now.getMonth(), 28, 10, 0, 0, 0);
    if (fireAt.getTime() <= now.getTime()) {
      // Next month's 28th
      fireAt = new Date(now.getFullYear(), now.getMonth() + 1, 28, 10, 0, 0, 0);
    }

    await LocalNotifications.schedule({
      notifications: [
        {
          id: MONTH_END_SUMMARY_ID,
          title: "📅 Month-End Check",
          body: "Run a quick audit before the month closes to capture your full financial picture.",
          schedule: { at: fireAt, every: "month", allowWhileIdle: true },
          sound: "default",
          smallIcon: "ic_stat_icon_config_sample",
          iconColor: "#E0A84D",
          extra: { route: "audit" },
        },
      ],
    });
    return true;
  } catch (err) {
    void log.warn("notifications", "scheduleMonthEndSummary failed", { error: err });
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// WEEKLY AUDIT NUDGE — fires every Sunday at 10am (repeating)
// ═══════════════════════════════════════════════════════════════
export async function scheduleWeeklyAuditNudge() {
  if (!supportsLocalNotifications()) return false;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: WEEKLY_AUDIT_NUDGE_ID }] });

    // Find next Sunday at 10:00
    const now = new Date();
    let daysUntilSunday = (7 - now.getDay()) % 7;
    if (daysUntilSunday === 0) {
      // If it's Sunday, check if 10am has passed
      if (now.getHours() >= 10) daysUntilSunday = 7;
    }

    const fireAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSunday, 10, 0, 0, 0);

    await LocalNotifications.schedule({
      notifications: [
        {
          id: WEEKLY_AUDIT_NUDGE_ID,
          title: "📊 Weekly Snapshot Time",
          body: "Take 2 minutes to run your financial audit. Consistent tracking builds wealth.",
          schedule: { at: fireAt, every: "week", allowWhileIdle: true },
          sound: "default",
          smallIcon: "ic_stat_icon_config_sample",
          iconColor: "#2ECC71",
          extra: { route: "audit" },
        },
      ],
    });

    return true;
  } catch (err) {
    void log.warn("notifications", "scheduleWeeklyAuditNudge failed", { error: err });
    return false;
  }
}

/**
 * Cancel the weekly audit nudge.
 */
export async function cancelWeeklyAuditNudge() {
  if (!supportsLocalNotifications()) return false;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: WEEKLY_AUDIT_NUDGE_ID }] });
  } catch {
    /* ignore */
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════
// STREAK AT RISK NUDGE — fires Saturday 6pm if no audit this week
// ═══════════════════════════════════════════════════════════════
const STREAK_AT_RISK_ID = 1003;

/**
 * Schedule a streak-at-risk reminder for Saturday at 6pm.
 * Only schedules if `hasAuditThisWeek` is false.
 * Call this on app start and after each audit (to cancel if audit done).
 */
export async function scheduleStreakAtRiskNudge(hasAuditThisWeek) {
  if (!supportsLocalNotifications()) return false;
  try {
    // Always cancel first
    await LocalNotifications.cancel({ notifications: [{ id: STREAK_AT_RISK_ID }] });

    // If user already ran an audit this week, don't nag
    if (hasAuditThisWeek) return false;

    const { display } = await LocalNotifications.checkPermissions();
    if (display !== "granted") return false;

    // Find next Saturday at 18:00
    const now = new Date();
    let daysUntilSat = (6 - now.getDay() + 7) % 7;
    if (daysUntilSat === 0 && now.getHours() >= 18) daysUntilSat = 7;

    const fireAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSat, 18, 0, 0, 0);

    // Don't schedule if it's already past Saturday 6pm this week
    if (fireAt.getTime() <= now.getTime()) return false;

    await LocalNotifications.schedule({
      notifications: [
        {
          id: STREAK_AT_RISK_ID,
          title: "🔥 Your Streak Is at Risk!",
          body: "Run a quick 2-minute audit before the weekend ends to keep your streak alive.",
          schedule: { at: fireAt, allowWhileIdle: true },
          sound: "default",
          smallIcon: "ic_stat_icon_config_sample",
          iconColor: "#E85C6A",
        },
      ],
    });

    return true;
  } catch (err) {
    void log.warn("notifications", "scheduleStreakAtRiskNudge failed", { error: err });
    return false;
  }
}

/**
 * Cancel the streak at risk nudge (call after user runs an audit).
 */
export async function cancelStreakAtRiskNudge() {
  if (!supportsLocalNotifications()) return false;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: STREAK_AT_RISK_ID }] });
  } catch {
    /* ignore */
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════
// BILL DUE REMINDERS — schedule from renewals data
// Fires at 9am the day before due date
// ═══════════════════════════════════════════════════════════════
export async function scheduleBillReminders(renewals = []) {
  if (!supportsLocalNotifications()) return 0;
  try {
    // Cancel all existing bill reminders (IDs 2000-2099)
    const cancelIds = [];
    for (let i = 0; i < 100; i++) cancelIds.push({ id: BILL_REMINDER_BASE_ID + i });
    await LocalNotifications.cancel({ notifications: cancelIds });

    const now = new Date();
    const notifications = [];

    renewals.forEach((renewal, idx) => {
      if (idx >= 100) return; // max 100 bill reminders
      if (!renewal.nextDue) return;

      const dueDate = new Date(renewal.nextDue + "T12:00:00");
      if (isNaN(dueDate.getTime())) return;

      // Notify at 9am the day before
      const fireAt = new Date(dueDate);
      fireAt.setDate(fireAt.getDate() - 1);
      fireAt.setHours(9, 0, 0, 0);

      // Only schedule if the notification is in the future
      if (fireAt.getTime() <= now.getTime()) return;

      const amount = renewal.amount ? `$${Number(renewal.amount).toFixed(2)}` : "";
      const name = renewal.name || "Bill";

      notifications.push({
        id: BILL_REMINDER_BASE_ID + idx,
        title: `💳 ${name} Due Tomorrow`,
        body: amount ? `${name} (${amount}) is due tomorrow. Make sure you're covered.` : `${name} is due tomorrow.`,
        schedule: { at: fireAt, allowWhileIdle: true },
        sound: "default",
        smallIcon: "ic_stat_icon_config_sample",
        iconColor: "#E0A84D",
        extra: { route: "cashflow" },
      });
    });

    if (notifications.length > 0) {
      await LocalNotifications.schedule({ notifications });
    }

    return notifications.length;
  } catch (err) {
    void log.warn("notifications", "scheduleBillReminders failed", { error: err });
    return 0;
  }
}

// ═══════════════════════════════════════════════════════════════
// NOTIFICATION DEEP-LINK LISTENER
// ═══════════════════════════════════════════════════════════════
let _listenerRegistered = false;

/**
 * Register a listener for notification taps that navigates to the
 * correct app tab. Call once on app boot. Dispatches a custom event
 * `app-notification-route` with `detail = { route: string }` that
 * the app shell should handle.
 */
export async function registerNotificationDeepLinks() {
  if (!supportsLocalNotifications() || _listenerRegistered) return;
  _listenerRegistered = true;
  try {
    await LocalNotifications.addListener(
      "localNotificationActionPerformed",
      (action) => {
        const route = action?.notification?.extra?.route;
        if (route && typeof route === "string") {
          log.info("notifications", "Deep-link tap", { route, id: action?.notification?.id });
          window.dispatchEvent(
            new CustomEvent("app-notification-route", { detail: { route } })
          );
        }
      }
    );
  } catch (err) {
    void log.warn("notifications", "registerNotificationDeepLinks failed", { error: err });
  }
}
