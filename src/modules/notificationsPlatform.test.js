import { afterEach, describe, expect, it, vi } from "vitest";

async function loadNotificationsModule({ native, pluginAvailable = false }) {
  vi.resetModules();
  const LocalNotifications = {
    requestPermissions: vi.fn(async () => ({ display: "granted" })),
    checkPermissions: vi.fn(async () => ({ display: "granted" })),
    schedule: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
  };

  vi.doMock("@capacitor/core", () => ({
    Capacitor: {
      isNativePlatform: () => native,
      getPlatform: () => (native ? "ios" : "web"),
      isPluginAvailable: () => pluginAvailable,
    },
  }));
  vi.doMock("@capacitor/local-notifications", () => ({
    LocalNotifications,
  }));

  const mod = await import("./notifications.js");
  return { mod, LocalNotifications };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("notifications platform gating", () => {
  it("degrades cleanly on web without touching the native notifications plugin", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { mod, LocalNotifications } = await loadNotificationsModule({ native: false, pluginAvailable: false });

    await expect(mod.getNotificationPermission()).resolves.toBe("denied");
    await expect(mod.schedulePaydayReminder("Friday", "09:00")).resolves.toBe(false);
    await expect(mod.triggerStoreArrivalNotification("Whole Foods", "Use Gold card")).resolves.toBe(false);
    await expect(mod.scheduleBillReminders([{ nextDue: "2026-03-20", name: "Rent", amount: 1000 }])).resolves.toBe(0);

    expect(LocalNotifications.checkPermissions).not.toHaveBeenCalled();
    expect(LocalNotifications.schedule).not.toHaveBeenCalled();
    expect(LocalNotifications.cancel).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("schedules a native store-arrival notification when local notifications are available", async () => {
    const { mod, LocalNotifications } = await loadNotificationsModule({ native: true, pluginAvailable: true });

    await expect(mod.triggerStoreArrivalNotification("Whole Foods", "Open Catalyst")).resolves.toBe(true);

    expect(LocalNotifications.checkPermissions).toHaveBeenCalledTimes(1);
    expect(LocalNotifications.cancel).toHaveBeenCalledWith({ notifications: [{ id: 3001 }] });
    expect(LocalNotifications.schedule).toHaveBeenCalledTimes(1);
  });
});
