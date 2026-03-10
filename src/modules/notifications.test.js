import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computeNextReminderDate } from "./notifications.js";

// ═══════════════════════════════════════════════════════════════
// computeNextReminderDate — Pure date math, no Capacitor needed
// ═══════════════════════════════════════════════════════════════

describe("computeNextReminderDate", () => {
  let realDate;

  beforeEach(() => {
    // Fix "now" to Monday, Jan 8, 2024 at 10:00 AM
    realDate = Date;
    const mockNow = new Date(2024, 0, 8, 10, 0, 0, 0);
    vi.useFakeTimers({ now: mockNow });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for invalid payday", () => {
    expect(computeNextReminderDate("InvalidDay", "09:00")).toBeNull();
    expect(computeNextReminderDate(null, "09:00")).toBeNull();
    expect(computeNextReminderDate("", "09:00")).toBeNull();
  });

  it("computes next payday notification for Wednesday 18:00 paycheck", () => {
    // Paycheck at 18:00 → notify 12h before = 06:00 same day (Wednesday)
    const result = computeNextReminderDate("Wednesday", "18:00");
    expect(result).not.toBeNull();
    expect(result.getDay()).toBe(3); // Wednesday
    expect(result.getHours()).toBe(6);
    expect(result.getMinutes()).toBe(0);
    // Should be Jan 10 (next Wednesday from Jan 8 Monday)
    expect(result.getDate()).toBe(10);
  });

  it("wraps to day before when paycheck is early morning", () => {
    // Paycheck at Friday 06:00 → 12h before = Thursday 18:00
    const result = computeNextReminderDate("Friday", "06:00");
    expect(result).not.toBeNull();
    expect(result.getDay()).toBe(4); // Thursday (day before Friday)
    expect(result.getHours()).toBe(18);
    expect(result.getMinutes()).toBe(0);
  });

  it("defaults to 09:00 on payday when paycheckTime is missing", () => {
    const result = computeNextReminderDate("Friday", null);
    expect(result).not.toBeNull();
    expect(result.getDay()).toBe(5); // Friday
    expect(result.getHours()).toBe(9);
    expect(result.getMinutes()).toBe(0);
  });

  it("defaults to 09:00 for empty string paycheckTime", () => {
    const result = computeNextReminderDate("Friday", "");
    expect(result).not.toBeNull();
    expect(result.getHours()).toBe(9);
  });

  it("pushes to next week if closest occurrence is in the past", () => {
    // Now = Monday 10:00. Monday paycheck at 12:00 → notify at 00:00 (already past)
    const result = computeNextReminderDate("Monday", "12:00");
    expect(result).not.toBeNull();
    // Should be pushed to next Monday
    expect(result.getDate()).toBe(15); // Next Monday Jan 15
    expect(result.getDay()).toBe(1); // Monday
  });

  it("handles midnight paycheck time", () => {
    // Paycheck at 00:00 → 12h before = 12:00 (noon) day before
    const result = computeNextReminderDate("Thursday", "00:00");
    expect(result).not.toBeNull();
    expect(result.getDay()).toBe(3); // Wednesday (day before)
    expect(result.getHours()).toBe(12);
  });

  it("handles noon paycheck time", () => {
    // Paycheck at 12:00 → 12h before = 00:00 same day
    const result = computeNextReminderDate("Thursday", "12:00");
    expect(result).not.toBeNull();
    expect(result.getDay()).toBe(4); // Thursday
    expect(result.getHours()).toBe(0);
  });

  it("handles all 7 days of the week", () => {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    for (const day of days) {
      const result = computeNextReminderDate(day, "14:00");
      expect(result).not.toBeNull();
      // All should be in the future
      expect(result.getTime()).toBeGreaterThan(new Date(2024, 0, 8, 10, 0).getTime());
    }
  });

  it("result is always strictly in the future", () => {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const times = ["06:00", "09:00", "12:00", "15:00", "18:00", "21:00"];
    const now = Date.now();

    for (const day of days) {
      for (const time of times) {
        const result = computeNextReminderDate(day, time);
        if (result) {
          expect(result.getTime()).toBeGreaterThan(now);
        }
      }
    }
  });

  it("handles single-digit hour format", () => {
    const result = computeNextReminderDate("Friday", "9:30");
    expect(result).not.toBeNull();
    // 9:30 paycheck → notify at previous day 21:30
    // Actually: 9*60+30 - 720 = -150 min → wraps to (24*60-150)/60 = 21.5h → 21:30 on Thursday
    expect(result.getHours()).toBe(21);
    expect(result.getMinutes()).toBe(30);
  });
});
