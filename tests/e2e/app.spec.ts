import { expect, test, type Page } from "@playwright/test";
import {
  AUDIT_FIXTURE,
  CORE_JOURNEY_SEED,
  SECOND_AUDIT_FIXTURE,
  SETUP_WIZARD_BACKUP,
  buildStoredAudit,
  completeOnboarding,
  completeOnboardingFast,
  getSettingsRowInput,
  getWizardFieldInput,
  installMockNativeSecureStorage,
  mockAuditApi,
  mockAuditApiFailure,
  mockAuditApiSequence,
  mockBaseApi,
  mockHouseholdSyncApi,
  mockPlaidFlow,
  mockRecoveryVaultApi,
  openAuditComposer,
  openSettingsMenu,
  readAppStorage,
  seedHouseholdRemoteRecord,
  seedStorage,
  writeAppStorage,
} from "./helpers/appHarness";

function getRunAuditButton(page: Page) {
  return page.getByRole("button", { name: /Run (Catalyst|Weekly) Audit/ });
}

function getResultsHeading(page: Page) {
  return page.getByRole("heading", { name: /^(Full Results|Weekly Briefing)$/ });
}

function getImmediateNextActionRegion(page: Page) {
  return page.getByRole("region", { name: "Immediate Next Action" });
}

async function expectNextActionCopy(page: Page, copy: string) {
  const nextActionRegion = getImmediateNextActionRegion(page);
  await expect(nextActionRegion).toBeVisible();
  await expect(nextActionRegion.getByText(copy).first()).toBeVisible();
}

async function importAuditFromHistory(page: Page, payload: string) {
  const auditTab = page.getByRole("tab", { name: "Audit", exact: true });
  const auditTabBox = await auditTab.boundingBox();
  expect(auditTabBox).not.toBeNull();
  await page.mouse.move((auditTabBox?.x || 0) + (auditTabBox?.width || 0) / 2, (auditTabBox?.y || 0) + (auditTabBox?.height || 0) / 2);
  await page.mouse.down();
  await page.waitForTimeout(450);
  await page.mouse.up();
  await page.getByRole("button", { name: "Audit History" }).click();
  await page.getByRole("button", { name: "Paste & Import AI Result" }).click();
  const manualPasteField = page.getByPlaceholder("Paste the AI response here (entire response)");
  await page.waitForTimeout(300);
  if (await manualPasteField.isVisible().catch(() => false)) {
    await manualPasteField.fill(payload);
    await page.getByRole("button", { name: "Import Text" }).click();
  }
}

test.describe("Catalyst Cash end-to-end", () => {
  test.beforeEach(async ({ page }) => {
    await mockBaseApi(page);
  });

  test("completes onboarding and lands on the dashboard", async ({ page }) => {
    await seedStorage(page, {});
    await completeOnboarding(page);
    await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Begin first audit", exact: true })).toBeVisible();
  });

  test("restores the main shell after onboarding on reload", async ({ page }) => {
    await seedStorage(page, {});
    await completeOnboarding(page);

    await page.reload();

    await expect(page.getByRole("button", { name: "Open Settings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Full Setup →" })).toHaveCount(0);
  });

  test("supports the fast-start onboarding path and lands on the dashboard", async ({ page }) => {
    await seedStorage(page, {});
    await completeOnboardingFast(page);
    await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();
  });

  test("continues setup with imported backup values prefilled", async ({ page }) => {
    await seedStorage(page, {});
    await page.goto("/");

    await page.getByRole("checkbox", { name: "Accept legal disclaimer" }).click();
    await page.getByRole("button", { name: "Full Setup →" }).click();

    await page.locator('input[type="file"]').first().setInputFiles({
      name: "setup-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(SETUP_WIZARD_BACKUP)),
    });

    await expect(page.getByText("Import complete")).toBeVisible();
    await page.getByRole("button", { name: "Continue Setup" }).click();

    await expect(page.getByText("Your Profile", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Birth year")).toHaveValue("1991");
    await expect(getWizardFieldInput(page, /Monthly Rent/)).toHaveValue("2100");

    await page.getByRole("button", { name: "Continue →" }).click();
    await expect(page.getByText("Cash Flow", { exact: true })).toBeVisible();
    await expect(getWizardFieldInput(page, /Standard Paycheck/)).toHaveValue("3200");
    await expect(getWizardFieldInput(page, /First-of-Month Paycheck/)).toHaveValue("2800");
    await expect(getWizardFieldInput(page, /Weekly Spend Allowance/)).toHaveValue("425");
  });

  test("restores setup values from Recovery Vault credentials", async ({ page }) => {
    await seedStorage(page, {});
    await mockRecoveryVaultApi(page);
    await page.goto("/");

    await page.getByRole("checkbox", { name: "Accept legal disclaimer" }).click();
    await page.getByRole("button", { name: "Full Setup →" }).click();

    await page.getByLabel("Recovery Vault ID").fill("CC-ABCDE-FGHIJ");
    await page.getByLabel("Recovery Key").fill("ABCD-EFGH-IJKL-MNOP");
    await page.getByRole("button", { name: "Restore from Vault" }).click();

    await expect(page.getByText("Import complete")).toBeVisible();
    await page.getByRole("button", { name: "Continue Setup" }).click();
    await expect(page.getByText("Your Profile", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Birth year")).toHaveValue("1991");
    await expect(getWizardFieldInput(page, /Monthly Rent/)).toHaveValue("2100");
  });

  test("free-tier user can open Portfolio and stay there", async ({ page }) => {
    await seedStorage(page, {});
    await completeOnboarding(page);

    await page.getByRole("tab", { name: "Portfolio" }).click();
    await expect(page.getByRole("tab", { name: "Portfolio", selected: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Portfolio Snapshot" })).toBeVisible();

    await page.waitForTimeout(1000);

    await expect(page.getByRole("tab", { name: "Portfolio", selected: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Home", selected: true })).toHaveCount(0);
  });

  test("runs an audit and renders results", async ({ page }) => {
    await seedStorage(page, {});
    await mockAuditApi(page);
    await completeOnboarding(page);

    await openAuditComposer(page);
    await page.getByRole("spinbutton", { name: "Checking balance" }).fill("4600");
    await expect(page.getByLabel("Notes for this week")).toBeVisible();
    await page.getByLabel("Notes for this week").fill("E2E audit coverage");
    await getRunAuditButton(page).click();
    const consentModal = page.getByText("AI Data Consent");
    if (await consentModal.isVisible().catch(() => false)) {
      await page.getByRole("button", { name: "I Agree" }).click();
      await getRunAuditButton(page).click();
    }

    await expect(getResultsHeading(page)).toBeVisible();
    await expectNextActionCopy(page, "Route $300 to Chase Freedom this week and keep checking above $900.");
  });

  test("keeps the current audit result when navigating away and returning to Results", async ({ page }) => {
    await seedStorage(page, {});
    await mockAuditApi(page);
    await completeOnboarding(page);

    await openAuditComposer(page);
    await page.getByRole("spinbutton", { name: "Checking balance" }).fill("4600");
    await page.getByLabel("Notes for this week").fill("Persist results across navigation");
    await getRunAuditButton(page).click();
    const consentModal = page.getByText("AI Data Consent");
    if (await consentModal.isVisible().catch(() => false)) {
      await page.getByRole("button", { name: "I Agree" }).click();
      await getRunAuditButton(page).click();
    }

    await expect(getResultsHeading(page)).toBeVisible();
    await page.getByRole("button", { name: "Back" }).first().click();
    await expect(page.getByRole("tab", { name: "Audit", selected: true })).toBeVisible();
    await expect(page.getByText("LATEST AUDIT")).toBeVisible();
    await page.getByRole("tab", { name: "Home" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();

    await page.getByRole("tab", { name: "Audit" }).click();
    await expect(page.getByText("LATEST AUDIT")).toBeVisible();
    const latestAuditButton = page.getByRole("button", { name: /LATEST AUDIT.*B · 86/i });
    await expect(latestAuditButton).toBeVisible();
    await latestAuditButton.click();

    await expect(getResultsHeading(page)).toBeVisible();
    await expectNextActionCopy(page, "Route $300 to Chase Freedom this week and keep checking above $900.");
  });

  test("restores a prior audit after a fresh reload and surfaces the saved result", async ({ page }) => {
    await seedStorage(page, {});
    await completeOnboarding(page);
    const storedAudit = buildStoredAudit();
    await writeAppStorage(page, "current-audit", storedAudit);
    await writeAppStorage(page, "audit-history", [storedAudit]);
    await page.reload();

    await expect(page.getByRole("button", { name: "Open Settings" })).toBeVisible();
    await page.getByRole("tab", { name: "Audit" }).click();
    const latestAuditButton = page.getByRole("button", { name: /LATEST AUDIT.*B · 86/i });
    await expect(latestAuditButton).toBeVisible();
    await expect(latestAuditButton).toContainText("B · 86");
  });

  test("returns to the audit composer with a clear error when the backend fails", async ({ page }) => {
    await seedStorage(page, {});
    await mockAuditApiFailure(page);
    await completeOnboarding(page);

    await openAuditComposer(page);
    await page.getByRole("spinbutton", { name: "Checking balance" }).fill("4600");
    await page.getByLabel("Notes for this week").fill("Trigger the unhappy path.");
    await getRunAuditButton(page).click();
    const consentModal = page.getByText("AI Data Consent");
    if (await consentModal.isVisible().catch(() => false)) {
      await page.getByRole("button", { name: "I Agree" }).click();
      await getRunAuditButton(page).click();
    }

    await expect(page.getByText("Audit blocked").first()).toBeVisible();
    await expect(page.getByText("The audit hit an unexpected problem.").first()).toBeVisible();
    await expect(page.getByRole("spinbutton", { name: "Checking balance" })).toBeVisible();
    await expect(page.getByLabel("Notes for this week")).toBeVisible();
  });

  test("does not offer pasted audit import on the audit tab", async ({ page }) => {
    await seedStorage(page, {});
    await completeOnboarding(page);

    await page.getByRole("tab", { name: "Audit" }).click();
    await expect(page.getByRole("button", { name: "Paste & Import AI Result" })).toHaveCount(0);
    await expect(page.getByPlaceholder("Paste the AI response here (entire response)")).toHaveCount(0);
  });

  test("imports a pasted audit result from history", async ({ page, context }) => {
    await seedStorage(page, {});
    await completeOnboarding(page);

    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate(async (payload) => {
      await navigator.clipboard.writeText(payload);
    }, JSON.stringify(AUDIT_FIXTURE));

    await importAuditFromHistory(page, JSON.stringify(AUDIT_FIXTURE));

    await expect(getResultsHeading(page)).toBeVisible();
    await expectNextActionCopy(page, "Route $300 to Chase Freedom this week and keep checking above $900.");
  });

  test("replaces an imported audit cleanly when the user runs a second audit", async ({ page, context }) => {
    await seedStorage(page, {});
    await mockAuditApiSequence(page, [SECOND_AUDIT_FIXTURE]);
    await completeOnboarding(page);

    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate(async (payload) => {
      await navigator.clipboard.writeText(payload);
    }, JSON.stringify(AUDIT_FIXTURE));

    await importAuditFromHistory(page, JSON.stringify(AUDIT_FIXTURE));

    await expect(getResultsHeading(page)).toBeVisible();
    await expectNextActionCopy(page, "Route $300 to Chase Freedom this week and keep checking above $900.");

    await page.getByRole("button", { name: "Back", exact: true }).first().click();
    await page.waitForTimeout(500);

    // ResultsView sent us to HistoryTab. Exit back to the dashboard shell.
    await expect(page.getByRole("heading", { name: "Briefing Archive" })).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.waitForTimeout(500);

    // Now on Dashboard, bottom nav visible. Audit FAB is a role=tab per a11y tree.
    await page.getByRole("tab", { name: "Audit", exact: true }).click();
    await page.waitForTimeout(500);

    // Now on AuditTab. getByRole(button) works — accessible name is "Run New Audit".
    const runNewAuditButton = page.getByRole("button", { name: "Run New Audit" });
    await expect(runNewAuditButton).toBeVisible();
    await runNewAuditButton.click();

    await expect(page.getByRole("spinbutton", { name: "Checking balance" })).toBeVisible();
    await page.getByRole("spinbutton", { name: "Checking balance" }).fill("2400");
    await page.getByLabel("Notes for this week").fill("Second audit should replace the imported current result");
    await getRunAuditButton(page).click();
    const consentModal = page.getByText("AI Data Consent");
    if (await consentModal.isVisible().catch(() => false)) {
      await page.getByRole("button", { name: "I Agree" }).click();
      await getRunAuditButton(page).click();
    }

    await expect(getResultsHeading(page)).toBeVisible();
    await expectNextActionCopy(page, "Pause nonessential spending until your checking buffer recovers.");
    await expect(page.getByText("Route $300 to Chase Freedom this week and keep checking above $900.")).toHaveCount(0);

    await page.getByRole("button", { name: "Back", exact: true }).first().click();
    await expect(page.getByText("LATEST AUDIT")).toBeVisible();
    const latestAuditButton = page.getByRole("button", { name: /LATEST AUDIT/i }).first();
    await expect(latestAuditButton).toBeVisible();
    await latestAuditButton.click();
    await expectNextActionCopy(page, "Pause nonessential spending until your checking buffer recovers.");
  });

  test("rejects invalid pasted audit JSON with a visible error", async ({ page, context }) => {
    await seedStorage(page, {});
    await completeOnboarding(page);

    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate(async () => {
      await navigator.clipboard.writeText("not valid catalyst audit json");
    });

    await importAuditFromHistory(page, "not valid catalyst audit json");

    await expect(page.getByText("Imported text is not valid").first()).toBeAttached();
    await expect(page.getByText("No Audits Yet")).toBeVisible();
  });

  test("streams a chat response in Ask AI", async ({ page }) => {
    await seedStorage(page, {});
    await mockAuditApi(page);
    await completeOnboarding(page);

    await page.getByRole("tab", { name: "Ask AI" }).click();
    await expect(page.getByPlaceholder("Ask about your finances...")).toBeVisible();
    await page.getByPlaceholder("Ask about your finances...").fill("Am I safe until my next paycheck?");
    await page.getByPlaceholder("Ask about your finances...").press("Enter");

    await expect(page.getByText("You are safe this week.")).toBeVisible();
    await expect(page.getByText("route any extra cash to your highest-interest debt first.")).toBeVisible();
  });

  test("keeps the audit notes field above the sticky footer on iPhone viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedStorage(page, {});
    await completeOnboarding(page);

    await openAuditComposer(page);
    const notesField = page.getByLabel("Notes for this week");
    const runAuditButton = getRunAuditButton(page);

    await notesField.scrollIntoViewIfNeeded();
    const notesBox = await notesField.boundingBox();
    const runAuditBox = await runAuditButton.boundingBox();

    expect(notesBox).not.toBeNull();
    expect(runAuditBox).not.toBeNull();
    expect((notesBox?.y || 0) + (notesBox?.height || 0)).toBeLessThan((runAuditBox?.y || 0) - 8);
  });

  test("captures ask ai response quality feedback on iPhone viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedStorage(page, {});
    await mockAuditApi(page);
    await completeOnboarding(page);

    await page.getByRole("tab", { name: "Ask AI" }).click();
    await page.getByPlaceholder("Ask about your finances...").fill("Am I safe until my next paycheck?");
    await page.getByPlaceholder("Ask about your finances...").press("Enter");

    await expect(page.getByText("You are safe this week.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Needs work" }).first()).toBeVisible();

    await page.getByRole("button", { name: "Needs work" }).first().click();
    await expect(page.getByText("What missed?").first()).toBeVisible();
    await page.getByRole("button", { name: "Wrong math" }).first().click();
    await expect(page.getByText("Feedback saved on this device.").first()).toBeVisible();
  });

  test("persists a settings change across reload", async ({ page }) => {
    await seedStorage(page, {});
    await completeOnboarding(page);

    await openSettingsMenu(page, /Financial Profile/i);
    await expect(page.getByRole("heading", { name: "Financial Profile" })).toBeVisible();

    const paycheckInput = getSettingsRowInput(page, "Standard Paycheck");
    await paycheckInput.fill("3200");

    await page.reload();

    await page.getByRole("button", { name: "Open Settings" }).click();
    await page.getByRole("button", { name: /Financial Profile/i }).click();
    await expect(page.getByRole("heading", { name: "Financial Profile" })).toBeVisible();
    await expect(getSettingsRowInput(page, "Standard Paycheck")).toHaveValue("3200");
  });

  test("loads demo data from the audit tab and marks the app as demo state", async ({ page }) => {
    await seedStorage(page, {});
    await completeOnboarding(page);

    await expect(page.getByRole("button", { name: "Load Demo Data" }).first()).toBeVisible();
    await page.getByRole("tab", { name: "Audit" }).click();
    await expect(page.getByRole("button", { name: "Load Demo Data" }).last()).toBeVisible();
    await page.getByRole("button", { name: "Load Demo Data" }).last().click();

    await expect(page.getByText("DEMO MODE ACTIVE")).toBeVisible();
    await expect(page.getByText("Sample data", { exact: true })).toBeVisible();
    await expect(page.getByText("LATEST AUDIT")).toBeVisible();
  });

  test("exports an encrypted backup and restores it after clearing app state", async ({ page }) => {
    await seedStorage(page, {});
    await completeOnboarding(page);

    await openSettingsMenu(page, /Financial Profile/i);
    await expect(page.getByRole("heading", { name: "Financial Profile" })).toBeVisible();

    const paycheckInput = getSettingsRowInput(page, "Standard Paycheck");
    await paycheckInput.fill("3200");

    await page.getByRole("button", { name: "Renting" }).click();

    const rentInput = getSettingsRowInput(page, "Monthly Rent");
    await expect(rentInput).toBeVisible();
    await rentInput.fill("1850");

    await page.reload();
    await openSettingsMenu(page, /Financial Profile/i);
    await expect(getSettingsRowInput(page, "Standard Paycheck")).toHaveValue("3200");
    await expect(getSettingsRowInput(page, "Monthly Rent")).toHaveValue("1850");

    await page.getByRole("button", { name: "Back to Settings" }).click();
    await page.getByRole("button", { name: "Close Settings" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();

    await page.getByRole("tab", { name: "Home" }).click();
    await openSettingsMenu(page, /Backup & Sync/i);
    await expect(page.getByText("Backup & Sync").first()).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "JSON" }).click({ force: true });
    await expect(page.getByText("Encrypt Backup")).toBeVisible();
    await page.getByLabel("Backup passphrase").fill("BackupPass123!");
    await page.getByRole("button", { name: "Encrypt & Export" }).click();

    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    const exportBody = await download.createReadStream();
    let exportedText = "";
    if (exportBody) {
      for await (const chunk of exportBody) {
        exportedText += chunk.toString();
      }
    }
    expect(exportedText.length).toBeGreaterThan(20);

    const envelope = JSON.parse(exportedText) as { v?: number; iv?: string; ct?: string; salt?: string };
    expect(envelope.v).toBe(1);
    expect(typeof envelope.iv).toBe("string");
    expect(typeof envelope.ct).toBe("string");
    expect(typeof envelope.salt).toBe("string");

    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.reload();

    await expect(page.getByRole("button", { name: "Full Setup →" })).toBeVisible();
    await page.getByRole("checkbox", { name: "Accept legal disclaimer" }).click();
    await page.getByRole("button", { name: "Full Setup →" }).click();
    await expect(page.getByText("Import Data")).toBeVisible();

    await page.locator('input[type="file"]').first().setInputFiles(downloadPath as string);
    await expect(page.getByText("This backup is encrypted. Enter your passphrase to unlock it.")).toBeVisible();
    await page.getByPlaceholder("Enter backup passphrase").fill("BackupPass123!");
    await page.getByRole("button", { name: "Unlock & Import" }).click();

    await expect(page.getByText("Import complete")).toBeVisible();
    await page.getByRole("button", { name: "Continue Setup" }).click();

    await expect(page.getByRole("heading", { name: "Demographics & Region" })).toBeVisible();
    await expect(getWizardFieldInput(page, /Monthly Rent/)).toHaveValue("1850");

    await page.getByRole("button", { name: "Continue →" }).click();
    await expect(page.getByText("Cash Flow", { exact: true })).toBeVisible();
    await expect(getWizardFieldInput(page, /Standard Paycheck/)).toHaveValue("3200");
  });

  test("shows native-only security gating on web without trapping the user in a broken lock flow", async ({ page }) => {
    await seedStorage(page, {});
    await completeOnboarding(page);
    await openSettingsMenu(page, /App Security/i);
    await expect(page.getByText("Native-Only Security on Web")).toBeVisible();
    await expect(page.getByLabel("App passcode")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Require Passcode" })).toBeVisible();

    await page.reload();

    await expect(page.getByRole("dialog", { name: "App lock screen" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open Settings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();
  });

  test("links a mocked Plaid account and reflects it in portfolio", async ({ page }) => {
    await installMockNativeSecureStorage(page);
    await seedStorage(page, {});
    await mockPlaidFlow(page);
    page.on("dialog", dialog => dialog.accept());
    await completeOnboarding(page);

    await openSettingsMenu(page, /Bank Connections/i);
    await expect(page.getByText("No linked accounts yet.")).toBeVisible();
    await page.getByRole("button", { name: "Link New Bank" }).click();

    await expect(page.getByRole("button", { name: "Disconnect Mock Bank" })).toBeVisible();
    await expect(page.getByText(/1 linked account/i)).toBeVisible();

    await page.getByRole("button", { name: "Back to Settings" }).click();
    await page.getByRole("button", { name: "Close Settings" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();
    await page.waitForTimeout(300);

    await page.getByRole("tab", { name: "Portfolio" }).click();
    await expect(page.getByRole("tab", { name: "Portfolio", selected: true })).toBeVisible();
    await expect(page.getByText("Checking").last()).toBeAttached();
    await expect(page.getByText("Mock Bank").last()).toBeAttached();
    await expect(page.getByText("Plaid Checking").last()).toBeAttached();

    const storedConnections = (await readAppStorage(page, "plaid-connections")) || [];
    expect(storedConnections).toHaveLength(1);
    expect(storedConnections[0]).not.toHaveProperty("accessToken");
  });

  test("leaves the portfolio unchanged when Plaid Link exits without linking", async ({ page }) => {
    await installMockNativeSecureStorage(page);
    await seedStorage(page, {});
    await mockPlaidFlow(page, "exit");
    await completeOnboarding(page);

    await openSettingsMenu(page, /Bank Connections/i);
    await expect(page.getByText("No linked accounts yet.")).toBeVisible();
    await page.getByRole("button", { name: "Link New Bank" }).click();

    await expect(page.getByText("No linked accounts yet.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Disconnect Mock Bank" })).toHaveCount(0);
    await expect(page.getByText(/Token exchange failed|Failed to link bank|cancelled/i)).toHaveCount(0);

    await page.getByRole("button", { name: "Back to Settings" }).click();
    await page.getByRole("button", { name: "Close Settings" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();
    await page.waitForTimeout(300);

    await page.getByRole("tab", { name: "Portfolio" }).click();
    await expect(page.getByText("Plaid Checking")).toHaveCount(0);
  });

  test("shows a visible error and keeps the portfolio unchanged when Plaid exchange fails", async ({ page }) => {
    await installMockNativeSecureStorage(page);
    await seedStorage(page, {});
    await mockPlaidFlow(page, "exchange-failure");
    await completeOnboarding(page);

    await openSettingsMenu(page, /Bank Connections/i);
    await expect(page.getByText("No linked accounts yet.")).toBeVisible();
    await page.getByRole("button", { name: "Link New Bank" }).click();

    await expect(page.getByText("Token exchange failed: 400").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Disconnect Mock Bank" })).toHaveCount(0);
    await expect(page.getByText("No linked accounts yet.")).toBeVisible();

    await page.getByRole("button", { name: "Back to Settings" }).click();
    await page.getByRole("button", { name: "Close Settings" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();
    await page.waitForTimeout(300);

    await page.getByRole("tab", { name: "Portfolio" }).click();
    await expect(page.getByText("Plaid Checking")).toHaveCount(0);
  });

  test("shows reconnect required on a previously linked Plaid-backed account", async ({ page }) => {
    await seedStorage(page, {});
    await completeOnboarding(page);

    await page.evaluate(async () => {
      const preferences = (window as Window & {
        Capacitor?: {
          Plugins?: {
            Preferences?: {
              set: (input: { key: string; value: string }) => Promise<void>;
            };
          };
        };
      }).Capacitor?.Plugins?.Preferences;

      const writeValue = async (key: string, value: unknown) => {
        const serialized = JSON.stringify(value);
        if (preferences?.set) {
          await preferences.set({ key, value: serialized });
          return;
        }
        window.localStorage.setItem(key, serialized);
      };

      await writeValue("bank-accounts", [
        {
          id: "plaid_acct-checking-1",
          bank: "Mock Bank",
          accountType: "checking",
          name: "Plaid Checking",
          apy: null,
          notes: "Auto-imported from Plaid (···1234)",
          _plaidAccountId: "acct-checking-1",
          _plaidConnectionId: "item-mock-bank-1",
          _plaidBalance: 1260,
          _plaidAvailable: 1200,
        },
      ]);
      await writeValue("plaid-connections", [
        {
          id: "item-mock-bank-1",
          institutionName: "Mock Bank",
          institutionId: "ins_mock_bank",
          _needsReconnect: true,
          accounts: [
            {
              plaidAccountId: "acct-checking-1",
              name: "Plaid Checking",
              officialName: "Plaid Checking",
              type: "depository",
              subtype: "checking",
              mask: "1234",
              linkedBankAccountId: "plaid_acct-checking-1",
            },
          ],
        },
      ]);
    });
    await page.reload();
    await expect(page.getByRole("button", { name: "Open Settings" })).toBeVisible();

    await page.getByRole("tab", { name: "Portfolio" }).click();
    await expect(page.getByRole("tab", { name: "Portfolio", selected: true })).toBeVisible();
    await expect(page.getByText("Plaid Checking", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Reconnect required", { exact: true }).first()).toBeVisible();
  });

  test("pushes household sync changes after a linked profile is edited", async ({ page }) => {
    await installMockNativeSecureStorage(page);
    const householdApi = mockHouseholdSyncApi(page);
    await seedStorage(page, {});
    await completeOnboarding(page);

    await openSettingsMenu(page, /Backup & Sync/i);
    await expect(page.getByText("Backup & Sync").first()).toBeVisible();
    await page.getByRole("button", { name: "Setup" }).click();
    const householdModal = page.getByText("Household Sync (E2EE)").locator("xpath=ancestor::div[2]");
    await householdModal.waitFor();
    await householdModal.locator('input[type="text"]').fill("FamilyOne");
    await householdModal.locator('input[type="password"]').fill("Secret123!");
    await page.getByRole("button", { name: "Save & Sync" }).click();

    await expect.poll(() => householdApi.fetches.length, { timeout: 5000 }).toBeGreaterThan(0);
    await expect(page.getByText("Linked as: FamilyOne")).toBeVisible();

    await page.getByRole("button", { name: "Back to Settings" }).evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await page.getByRole("button", { name: /Financial Profile/i }).click();
    const paycheckInput = getSettingsRowInput(page, "Standard Paycheck");
    await paycheckInput.fill("5100");
    await page.getByRole("button", { name: "Back to Settings" }).evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await page.getByRole("button", { name: /Backup & Sync/i }).evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
    await expect.poll(() => householdApi.pushes.length, { timeout: 10000 }).toBeGreaterThan(0);
    expect(householdApi.remoteRecord).toBeTruthy();
  });

  test("pulls household sync data into a fresh linked session", async ({ page }) => {
    await installMockNativeSecureStorage(page, {
      "household-id": "FamilyOne",
      "household-passcode": "Secret123!",
    });
    const householdApi = mockHouseholdSyncApi(page);
    await seedHouseholdRemoteRecord(householdApi, {
      householdId: "FamilyOne",
      passcode: "Secret123!",
      payload: {
        data: {
          "financial-config": {
            payFrequency: "bi-weekly",
            payday: "Friday",
            paycheckStandard: 5100,
            paycheckFirstOfMonth: 2800,
            weeklySpendAllowance: 425,
            emergencyFloor: 1200,
            currencyCode: "USD",
          },
        },
        timestamp: Date.now(),
      },
      version: 3,
    });
    await seedStorage(page, {
      ...CORE_JOURNEY_SEED,
      "financial-config": {
        ...CORE_JOURNEY_SEED["financial-config"],
        paycheckStandard: 0,
      },
    });

    await page.goto("/");
    await expect(page.getByRole("button", { name: "Open Settings" })).toBeVisible();
    await expect.poll(() => readAppStorage(page, "financial-config"), { timeout: 10000 }).toMatchObject({
      paycheckStandard: 5100,
    });
    expect(householdApi.fetches.length).toBeGreaterThan(0);
  });

  test("respects reduced-motion preferences while keeping tab switching stable", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await seedStorage(page, {});
    await completeOnboarding(page);

    await page.getByRole("tab", { name: "Portfolio" }).click();
    await expect(page.getByRole("tab", { name: "Portfolio", selected: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Vault" })).toBeVisible();

    const transitionStyle = await page.locator('.snap-page[data-tabid="portfolio"] > div').evaluate((element) => {
      return window.getComputedStyle(element).transition;
    });
    expect(transitionStyle.startsWith("none")).toBe(true);

    await page.getByRole("tab", { name: "Home" }).click();
    await expect(page.getByRole("tab", { name: "Home", selected: true })).toBeVisible();
    await page.getByRole("tab", { name: "Portfolio" }).click();
    await expect(page.getByRole("tab", { name: "Portfolio", selected: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Vault" })).toBeVisible();
  });
});
