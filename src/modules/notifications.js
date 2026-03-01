import { LocalNotifications } from "@capacitor/local-notifications";

const PAYDAY_REMINDER_ID = 1001;
const WEEKLY_AUDIT_NUDGE_ID = 1002;
const BILL_REMINDER_BASE_ID = 2000; // IDs 2000-2099 reserved for bill reminders

const DAY_MAP = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
    Thursday: 4, Friday: 5, Saturday: 6
};

/**
 * Request iOS notification permission.
 * Returns true if granted, false otherwise.
 */
export async function requestNotificationPermission() {
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
    try {
        const { display } = await LocalNotifications.checkPermissions();
        return display; // "granted" | "denied" | "prompt"
    } catch {
        return "denied";
    }
}

/**
 * Compute the Date object for the next payday reminder.
 *
 * Rules:
 *  - Notify 12 hours before paycheckTime on payday itself.
 *    e.g. Wednesday 18:00 → Wednesday 06:00
 *    e.g. Friday 06:00 → Thursday 18:00 (wraps to day before)
 *  - If paycheckTime is missing/falsy, notify at 09:00 on payday.
 *  - Always targets strictly the NEXT occurrence (never today if it already passed).
 */
export function computeNextReminderDate(payday, paycheckTime) {
    const targetDay = DAY_MAP[payday];
    if (targetDay === undefined) return null;

    // Parse paycheckTime -> notification hour/minute (12h before)
    let notifyHour = 9;
    let notifyMin = 0;
    let dayOffset = 0; // 0 = same day as payday, -1 = day before
    if (paycheckTime && /^\d{1,2}:\d{2}$/.test(paycheckTime)) {
        const [h, m] = paycheckTime.split(":").map(Number);
        const totalMins = h * 60 + m - 12 * 60;
        if (totalMins >= 0) {
            notifyHour = Math.floor(totalMins / 60);
            notifyMin = totalMins % 60;
            dayOffset = 0; // same day
        } else {
            // Wrapped to previous day (e.g. paycheck at 06:00 → remind at 18:00 day before)
            notifyHour = Math.floor((totalMins + 24 * 60) / 60);
            notifyMin = ((totalMins % 60) + 60) % 60;
            dayOffset = -1;
        }
    }

    const notifyDay = (targetDay + dayOffset + 7) % 7;

    const now = new Date();
    let diff = (notifyDay - now.getDay() + 7) % 7;

    // Build candidate date
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
    try {
        // Guard: verify notification permission before scheduling
        const { display } = await LocalNotifications.checkPermissions();
        if (display !== "granted") {
            console.warn("[notifications] schedulePaydayReminder skipped — permission not granted:", display);
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
                },
            ],
        });

        return true;
    } catch (err) {
        console.warn("[notifications] schedulePaydayReminder failed:", err);
        return false;
    }
}

/**
 * Cancel the payday reminder entirely.
 */
export async function cancelPaydayReminder() {
    try {
        await LocalNotifications.cancel({ notifications: [{ id: PAYDAY_REMINDER_ID }] });
    } catch {
        // silently ignore
    }
}

// ═══════════════════════════════════════════════════════════════
// WEEKLY AUDIT NUDGE — fires Sunday at 10am if no audit this week
// ═══════════════════════════════════════════════════════════════
export async function scheduleWeeklyAuditNudge() {
    try {
        await LocalNotifications.cancel({ notifications: [{ id: WEEKLY_AUDIT_NUDGE_ID }] });

        // Find next Sunday at 10:00
        const now = new Date();
        let daysUntilSunday = (7 - now.getDay()) % 7;
        if (daysUntilSunday === 0) {
            // If it's Sunday, check if 10am has passed
            if (now.getHours() >= 10) daysUntilSunday = 7;
        }

        const fireAt = new Date(
            now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSunday,
            10, 0, 0, 0
        );

        await LocalNotifications.schedule({
            notifications: [
                {
                    id: WEEKLY_AUDIT_NUDGE_ID,
                    title: "📊 Weekly Snapshot Time",
                    body: "Take 2 minutes to run your financial audit. Consistent tracking builds wealth.",
                    schedule: { at: fireAt, allowWhileIdle: true },
                    sound: "default",
                    smallIcon: "ic_stat_icon_config_sample",
                    iconColor: "#2ECC71",
                },
            ],
        });

        return true;
    } catch (err) {
        console.warn("[notifications] scheduleWeeklyAuditNudge failed:", err);
        return false;
    }
}

/**
 * Cancel the weekly audit nudge.
 */
export async function cancelWeeklyAuditNudge() {
    try {
        await LocalNotifications.cancel({ notifications: [{ id: WEEKLY_AUDIT_NUDGE_ID }] });
    } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════════
// BILL DUE REMINDERS — schedule from renewals data
// Fires at 9am the day before due date
// ═══════════════════════════════════════════════════════════════
export async function scheduleBillReminders(renewals = []) {
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
            });
        });

        if (notifications.length > 0) {
            await LocalNotifications.schedule({ notifications });
        }

        return notifications.length;
    } catch (err) {
        console.warn("[notifications] scheduleBillReminders failed:", err);
        return 0;
    }
}
