import { expect, test } from "@playwright/test";
import { CORE_JOURNEY_SEED, mockBaseApi, seedStorage } from "./helpers/appHarness";

test("bypasses onboarding, loads dashboard, and opens the new audit form", async ({ page }) => {
  await mockBaseApi(page);
  await seedStorage(page, CORE_JOURNEY_SEED);

  await page.goto("/");

  await expect(page.getByRole("button", { name: "Open Settings" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Home", selected: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Begin audit", exact: true }).click();

  await expect(page.getByRole("spinbutton", { name: "Checking balance" })).toBeVisible();
  await expect(page.getByLabel("Notes for this week")).toBeVisible();
});
