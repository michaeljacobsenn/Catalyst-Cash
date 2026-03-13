import { describe, expect, it } from "vitest";
import { getIsoWeekKey, getQuotaWindow, isRevenueCatEntitlementActive, resolveEffectiveTier } from "./index.js";

describe("worker quota windows", () => {
  it("uses ISO weeks for free audit windows", () => {
    const now = new Date("2026-03-05T12:00:00Z");
    expect(getIsoWeekKey(now)).toBe("2026-W10");
    expect(getQuotaWindow("free", false, now).periodKey).toBe("2026-W10");
  });

  it("uses UTC month and day windows for pro audits and chats", () => {
    const now = new Date("2026-03-05T23:30:00-05:00");
    expect(getQuotaWindow("pro", false, now).periodKey).toBe("2026-03");
    expect(getQuotaWindow("pro", true, now).periodKey).toBe("2026-03-06");
  });
});

describe("RevenueCat entitlement verification", () => {
  it("accepts active lifetime and future-dated entitlements", () => {
    expect(
      isRevenueCatEntitlementActive(
        {
          entitlements: {
            "Catalyst Cash Pro": { expires_date: null },
          },
        },
        "Catalyst Cash Pro"
      )
    ).toBe(true);

    expect(
      isRevenueCatEntitlementActive(
        {
          entitlements: {
            "Catalyst Cash Pro": { expires_date: "2030-01-01T00:00:00Z" },
          },
        },
        "Catalyst Cash Pro",
        new Date("2026-03-05T00:00:00Z")
      )
    ).toBe(true);
  });

  it("rejects expired or missing entitlements", () => {
    expect(
      isRevenueCatEntitlementActive(
        {
          entitlements: {
            "Catalyst Cash Pro": { expires_date: "2026-03-01T00:00:00Z" },
          },
        },
        "Catalyst Cash Pro",
        new Date("2026-03-05T00:00:00Z")
      )
    ).toBe(false);

    expect(isRevenueCatEntitlementActive({ entitlements: {} }, "Catalyst Cash Pro")).toBe(false);
  });
});

describe("tier resolution hardening", () => {
  it("fails closed to free when verification inputs are missing", async () => {
    const request = new Request("https://example.com/audit", {
      headers: {
        "X-Subscription-Tier": "pro",
      },
    });

    await expect(resolveEffectiveTier(request, {})).resolves.toMatchObject({
      tier: "free",
      verified: false,
      source: "unverified",
    });
  });

  it("fails closed to free when RevenueCat verification throws", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("boom", { status: 500 });

    const request = new Request("https://example.com/audit", {
      headers: {
        "X-Subscription-Tier": "pro",
        "X-RC-App-User-ID": "rc_user_123",
      },
    });

    try {
      await expect(
        resolveEffectiveTier(request, {
          REVENUECAT_SECRET_KEY: "test_secret",
        })
      ).resolves.toMatchObject({
        tier: "free",
        verified: false,
        source: "verification_failed",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
