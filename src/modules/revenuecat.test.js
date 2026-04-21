import { afterEach, describe, expect, it, vi } from "vitest";

async function loadRevenueCatModule() {
  vi.resetModules();

  const purchases = {
    getAppUserID: vi.fn(async () => ({ appUserID: "$RCAnonymousID:test" })),
    getCustomerInfo: vi.fn(async () => ({ customerInfo: { entitlements: { active: {} } } })),
    getOfferings: vi.fn(async () => ({
      current: {
        monthly: { identifier: "$rc_monthly", product: { identifier: "com.catalystcash.pro.monthly.v2" } },
        annual: { identifier: "$rc_annual", product: { identifier: "com.catalystcash.pro.yearly.v2" } },
      },
    })),
    purchasePackage: vi.fn(async () => ({ customerInfo: { entitlements: { active: {} } } })),
    setLogLevel: vi.fn(async () => undefined),
    configure: vi.fn(async () => undefined),
    addCustomerInfoUpdateListener: vi.fn(async () => "listener_1"),
    removeCustomerInfoUpdateListener: vi.fn(async () => ({ wasRemoved: true })),
    restorePurchases: vi.fn(async () => ({ customerInfo: { entitlements: { active: {} } } })),
  };
  const activatePro = vi.fn(async () => true);
  const deactivatePro = vi.fn(async () => true);
  const browserOpen = vi.fn(async () => undefined);

  vi.doMock("@capacitor/core", () => ({
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => "ios",
    },
  }));

  vi.doMock("@revenuecat/purchases-capacitor", () => ({
    LOG_LEVEL: { WARN: "WARN" },
    PURCHASES_ERROR_CODE: {
      PURCHASE_CANCELLED_ERROR: "1",
      PRODUCT_ALREADY_PURCHASED_ERROR: "6",
    },
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

  vi.doMock("@capacitor/browser", () => ({
    Browser: {
      open: browserOpen,
    },
  }));

  vi.stubEnv("VITE_REVENUECAT_KEY", "test_rc_key");

  const mod = await import("./revenuecat.js");
  return { mod, purchases, activatePro, deactivatePro, browserOpen };
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
    expect(purchases.addCustomerInfoUpdateListener).toHaveBeenCalledTimes(1);
    expect(deactivatePro).toHaveBeenCalled();
  });

  it("does not reconfigure or register duplicate listeners after initialization", async () => {
    const { mod, purchases } = await loadRevenueCatModule();

    await mod.initRevenueCat();
    await mod.initRevenueCat();

    expect(purchases.configure).toHaveBeenCalledTimes(1);
    expect(purchases.addCustomerInfoUpdateListener).toHaveBeenCalledTimes(1);
    expect(purchases.removeCustomerInfoUpdateListener).not.toHaveBeenCalled();
  });

  it("purchases the selected yearly package when requested", async () => {
    const { mod, purchases } = await loadRevenueCatModule();

    await mod.initRevenueCat();
    await mod.purchaseProPlan("yearly");

    expect(purchases.getOfferings).toHaveBeenCalled();
    expect(purchases.purchasePackage).toHaveBeenCalledWith({
      aPackage: expect.objectContaining({ identifier: "$rc_annual" }),
    });
  });

  it("recovers active entitlement after an already-subscribed purchase attempt", async () => {
    const { mod, purchases, activatePro } = await loadRevenueCatModule();

    purchases.getCustomerInfo
      .mockResolvedValueOnce({ customerInfo: { entitlements: { active: {} } } })
      .mockResolvedValueOnce({ customerInfo: { entitlements: { active: {} } } });
    purchases.restorePurchases.mockResolvedValueOnce({
      customerInfo: {
        entitlements: {
          active: {
            "Catalyst Cash Pro": {
              productIdentifier: "com.catalystcash.pro.yearly.v2",
              latestPurchaseDate: "2026-04-15T00:00:00.000Z",
              expirationDate: "2099-01-01T00:00:00.000Z",
            },
          },
        },
      },
    });
    purchases.purchasePackage.mockRejectedValueOnce({
      code: "6",
      message: "already subscribed",
      userCancelled: false,
    });

    await mod.initRevenueCat();
    await expect(mod.purchaseProPlan("yearly")).resolves.toBe(true);
    expect(purchases.restorePurchases).toHaveBeenCalled();

    expect(activatePro).toHaveBeenCalledWith(
      "com.catalystcash.pro.yearly.v2",
      3650,
      {
        isLifetime: false,
        purchaseDate: "2026-04-15T00:00:00.000Z",
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
    );
  });

  it("restores an active entitlement from the wrapped restorePurchases response", async () => {
    const { mod, purchases, activatePro } = await loadRevenueCatModule();

    purchases.restorePurchases.mockResolvedValueOnce({
      customerInfo: {
        entitlements: {
          active: {
            "Catalyst Cash Pro": {
              productIdentifier: "com.catalystcash.pro.yearly.v2",
              latestPurchaseDate: "2026-04-15T00:00:00.000Z",
              expirationDate: "2099-01-01T00:00:00.000Z",
            },
          },
        },
      },
    });

    await mod.initRevenueCat();
    await expect(mod.restorePurchases()).resolves.toBe(true);

    expect(activatePro).toHaveBeenCalledWith(
      "com.catalystcash.pro.yearly.v2",
      3650,
      {
        isLifetime: false,
        purchaseDate: "2026-04-15T00:00:00.000Z",
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
    );
  });

  it("opens Apple subscription management when asked to manage Pro", async () => {
    const { mod, browserOpen } = await loadRevenueCatModule();

    await expect(mod.presentCustomerCenter()).resolves.toBeUndefined();

    expect(browserOpen).toHaveBeenCalledWith({
      url: "https://apps.apple.com/account/subscriptions",
      presentationStyle: "fullscreen",
      toolbarColor: "#0C121B",
    });
  });
});
