import { expect, test } from "@playwright/test";

const CORE_JOURNEY_SEED = {
  "onboarding-complete": true,
  "audit-history": [],
  "current-audit": null,
  "move-states": {},
  "financial-config": {
    payFrequency: "bi-weekly",
    payday: "Friday",
    paycheckStandard: 3200,
    paycheckFirstOfMonth: 2800,
    weeklySpendAllowance: 425,
    emergencyFloor: 1200,
    currencyCode: "USD",
  },
};

test("bypasses onboarding, loads dashboard, and opens the new audit form", async ({ page }) => {
  await page.route("https://api.catalystcash.app/config", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        gatingMode: "off",
      }),
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
    });
  });

  await page.route("https://api.catalystcash.app/market*", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ prices: {} }),
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
    });
  });

  await page.addInitScript((seed: Record<string, unknown>) => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    for (const [key, value] of Object.entries(seed)) {
      const serialized = JSON.stringify(value);
      window.localStorage.setItem(key, serialized);
      window.localStorage.setItem(`CapacitorStorage.${key}`, serialized);
    }
  }, CORE_JOURNEY_SEED);

  await page.goto("/");

  await expect(page.getByRole("button", { name: "Open Settings" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Home", selected: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Begin Audit", exact: true }).click();

  await expect(page.getByText("New Audit", { exact: true })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "Checking balance" })).toBeVisible();
  await expect(page.getByLabel("Notes for this week")).toBeVisible();
});
