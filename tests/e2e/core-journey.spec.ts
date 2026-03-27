import { expect, test } from "@playwright/test";
import { CORE_JOURNEY_SEED, mockBaseApi, openAuditComposer, seedStorage } from "./helpers/appHarness";

test("bypasses onboarding, loads dashboard, and opens the new audit form", async ({ page }) => {
  await mockBaseApi(page);
  await seedStorage(page, CORE_JOURNEY_SEED);

  await page.goto("/");

  await expect(page.getByRole("button", { name: "Open Settings" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Home", selected: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();

  await openAuditComposer(page);
  await expect(page.getByLabel("Notes for this week")).toBeVisible();
});
