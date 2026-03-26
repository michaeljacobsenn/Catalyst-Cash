import { afterEach, describe, expect, it, vi } from "vitest";

async function loadRevenueCatModule() {
  vi.resetModules();

  const purchases = {
    getAppUserID: vi.fn(async () => ({ appUserID: "$RCAnonymousID:test" })),
    getCustomerInfo: vi.fn(async () => ({ entitlements: { active: {} } })),
    setLogLevel: vi.fn(async () => undefined),
    configure: vi.fn(async () => undefined),
    addCustomerInfoUpdateListener: vi.fn(),
    restorePurchases: vi.fn(async () => ({ entitlements: { active: {} } })),
  };
  const activatePro = vi.fn(async () => true);
  const deactivatePro = vi.fn(async () => true);

  vi.doMock("@capacitor/core", () => ({
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => "ios",
    },
  }));

  vi.doMock("@revenuecat/purchases-capacitor", () => ({
    LOG_LEVEL: { WARN: "WARN" },
    Purchases: purchases,
  }));

  vi.doMock("./logger.js", () => ({
    log: {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    },
  }));

  vi.doMock("./subscription.js", () => ({
    activatePro,
    deactivatePro,
  }));

  vi.stubEnv("VITE_REVENUECAT_KEY", "test_rc_key");

  const mod = await import("./revenuecat.js");
  return { mod, purchases, activatePro, deactivatePro };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("revenuecat", () => {
  it("does not call native RevenueCat getters before configuration succeeds", async () => {
    const { mod, purchases } = await loadRevenueCatModule();

    await expect(mod.getRevenueCatAppUserId()).resolves.toBeNull();
    await expect(mod.syncProStatus()).resolves.toBe(false);

    expect(purchases.getAppUserID).not.toHaveBeenCalled();
    expect(purchases.getCustomerInfo).not.toHaveBeenCalled();
  });

  it("fetches identity and customer info after initialization", async () => {
    const { mod, purchases, deactivatePro } = await loadRevenueCatModule();

    await mod.initRevenueCat();
    await expect(mod.getRevenueCatAppUserId()).resolves.toBe("$RCAnonymousID:test");
    await expect(mod.syncProStatus()).resolves.toBe(false);

    expect(purchases.configure).toHaveBeenCalledTimes(1);
    expect(purchases.getAppUserID).toHaveBeenCalled();
    expect(purchases.getCustomerInfo).toHaveBeenCalled();
    expect(deactivatePro).toHaveBeenCalled();
  });
});
