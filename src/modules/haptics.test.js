import { afterEach, describe, expect, it, vi } from "vitest";

async function loadHapticsModule({ native, pluginAvailable = false }) {
  vi.resetModules();
  const Haptics = {
    impact: vi.fn(async () => undefined),
    notification: vi.fn(async () => undefined),
  };

  vi.doMock("@capacitor/core", () => ({
    Capacitor: {
      isNativePlatform: () => native,
      isPluginAvailable: () => pluginAvailable,
    },
  }));
  vi.doMock("@capacitor/haptics", () => ({
    Haptics,
    ImpactStyle: {
      Light: "LIGHT",
      Medium: "MEDIUM",
      Heavy: "HEAVY",
    },
    NotificationType: {
      Success: "SUCCESS",
      Warning: "WARNING",
      Error: "ERROR",
    },
  }));

  const mod = await import("./haptics.js");
  return { mod, Haptics };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("haptics platform gating", () => {
  it("becomes a no-op on web without touching the native haptics plugin", async () => {
    const { mod, Haptics } = await loadHapticsModule({ native: false, pluginAvailable: false });

    await mod.haptic.light();
    await mod.haptic.success();

    expect(Haptics.impact).not.toHaveBeenCalled();
    expect(Haptics.notification).not.toHaveBeenCalled();
  });
});
