import { expect, test, type Page, type Route } from "@playwright/test";

const AUDIT_FIXTURE = {
  ensembleThoughtProcess: "ROUTING: [Planning Agent]. CHAIN OF THOUGHT: deterministic e2e fixture.",
  headerCard: {
    status: "GREEN",
    details: ["Cash floor protected", "No acute solvency issue detected"],
  },
  liquidNetWorth: "$8,250.00",
  healthScore: {
    score: 86,
    grade: "B",
    trend: "up",
    summary: "Strong cash coverage with one clear debt-priority move.",
    narrative: "Cash protection is intact. Your clearest next step is to route surplus cash to high-interest debt.",
  },
  alertsCard: ["Protect your floor before discretionary spending."],
  dashboardCard: [
    { category: "Checking", amount: "$4,600.00", status: "Protected" },
    { category: "Vault", amount: "$2,100.00", status: "On track" },
    { category: "Pending", amount: "$225.00", status: "Upcoming" },
    { category: "Debts", amount: "$1,450.00", status: "Pay down" },
    { category: "Available", amount: "$1,325.00", status: "SURPLUS" },
  ],
  weeklyMoves: ["Route $300 to Chase Freedom this week.", "Hold checking above $900 until next payday."],
  radar: [],
  longRangeRadar: [],
  milestones: ["Emergency reserve is over halfway funded."],
  investments: {
    balance: "$12,400.00",
    asOf: "2026-03-13",
    gateStatus: "Open",
    cryptoValue: null,
    netWorth: "$19,200.00",
  },
  nextAction: "Route $300 to Chase Freedom this week and keep checking above $900.",
  spendingAnalysis: null,
  negotiationTargets: [],
};

const CHAT_RESPONSE =
  "You are safe this week. Keep checking above your floor and route any extra cash to your highest-interest debt first.";

const SECOND_AUDIT_FIXTURE = {
  ...AUDIT_FIXTURE,
  headerCard: {
    status: "YELLOW",
    details: ["Cash buffer is tighter this cycle", "A near-term bill spike needs attention"],
  },
  healthScore: {
    score: 72,
    grade: "C-",
    trend: "down",
    summary: "Cash flow is tighter and needs a cleaner spending plan.",
    narrative: "You need to slow discretionary spend and route extra cash to immediate obligations.",
  },
  weeklyMoves: ["Pause nonessential spending until your checking buffer recovers."],
  nextAction: "Pause nonessential spending until your checking buffer recovers.",
};

const SETUP_WIZARD_BACKUP = {
  app: "Catalyst Cash",
  exportedAt: "2026-03-13T12:00:00.000Z",
  data: {
    "financial-config": {
      payFrequency: "bi-weekly",
      payday: "Friday",
      incomeType: "salary",
      paycheckStandard: 3200,
      paycheckFirstOfMonth: 2800,
      weeklySpendAllowance: 425,
      emergencyFloor: 1500,
      greenStatusTarget: 4200,
      emergencyReserveTarget: 18000,
      defaultAPR: 22.99,
      currencyCode: "USD",
      stateCode: "CA",
      birthYear: 1991,
      housingType: "rent",
      monthlyRent: 2100,
      isContractor: true,
      taxBracketPercent: 28,
      trackHSA: true,
      trackCrypto: false,
    },
    "bank-accounts": [
      {
        id: "setup-backup-checking",
        bank: "Backup Bank",
        accountType: "checking",
        name: "Primary Checking",
        balance: 6400,
      },
    ],
    "card-portfolio": [
      {
        id: "setup-backup-card",
        issuer: "Chase",
        network: "Visa",
        name: "Freedom Unlimited",
        limit: 12000,
        balance: 900,
        apr: 24.99,
      },
    ],
    renewals: [
      {
        id: "setup-backup-renewal",
        name: "Netflix",
        amount: 15.49,
        frequency: "monthly",
        dueDate: "2026-03-28",
      },
    ],
    "ai-provider": "backend",
    "ai-model": "gemini-2.5-flash",
  },
};

function buildStoredAudit(parsed = AUDIT_FIXTURE, overrides: Record<string, unknown> = {}) {
  return {
    ts: 1760000000000,
    date: "2026-03-13",
    provider: "backend",
    model: "gpt-4o-mini",
    parsed,
    moveChecks: {},
    form: {
      date: "2026-03-13",
      checkingBalance: 4600,
      notes: "Seeded e2e audit",
    },
    ...overrides,
  };
}

function chunkString(value: string, size = 80): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += size) {
    chunks.push(value.slice(index, index + size));
  }
  return chunks;
}

async function mockAuditApi(page: Page) {
  await page.route("https://api.catalystcash.app/audit", async (route: Route) => {
    const postData = route.request().postDataJSON() as {
      stream?: boolean;
      responseFormat?: "json" | "text";
    };

    if (postData?.stream && postData?.responseFormat === "text") {
      const body = chunkString(CHAT_RESPONSE, 45)
        .map(chunk => `data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`)
        .join("") + "data: [DONE]\n\n";
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body,
        headers: {
          "access-control-allow-origin": "*",
          "cache-control": "no-cache",
        },
      });
      return;
    }

    if (postData?.stream) {
      const body = chunkString(JSON.stringify(AUDIT_FIXTURE), 90)
        .map(chunk => `data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`)
        .join("") + "data: [DONE]\n\n";
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body,
        headers: {
          "access-control-allow-origin": "*",
          "cache-control": "no-cache",
        },
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        result: postData?.responseFormat === "text" ? CHAT_RESPONSE : JSON.stringify(AUDIT_FIXTURE),
      }),
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
        "X-RateLimit-Remaining": "999",
        "X-RateLimit-Limit": "999",
      },
    });
  });
}

async function mockAuditApiSequence(page: Page, fixtures: Array<Record<string, unknown>>) {
  let index = 0;
  await page.route("https://api.catalystcash.app/audit", async (route: Route) => {
    const postData = route.request().postDataJSON() as {
      stream?: boolean;
      responseFormat?: "json" | "text";
    };
    const fixture = fixtures[Math.min(index, fixtures.length - 1)];

    if (postData?.stream && postData?.responseFormat === "text") {
      const body = chunkString(CHAT_RESPONSE, 45)
        .map(chunk => `data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`)
        .join("") + "data: [DONE]\n\n";
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body,
        headers: {
          "access-control-allow-origin": "*",
          "cache-control": "no-cache",
        },
      });
      return;
    }

    if (postData?.stream) {
      const body = chunkString(JSON.stringify(fixture), 90)
        .map(chunk => `data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`)
        .join("") + "data: [DONE]\n\n";
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body,
        headers: {
          "access-control-allow-origin": "*",
          "cache-control": "no-cache",
        },
      });
      index += 1;
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        result: postData?.responseFormat === "text" ? CHAT_RESPONSE : JSON.stringify(fixture),
      }),
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
        "X-RateLimit-Remaining": "999",
        "X-RateLimit-Limit": "999",
      },
    });
    index += 1;
  });
}

async function mockAuditApiFailure(page: Page, error = "Audit backend unavailable") {
  await page.route("https://api.catalystcash.app/audit", async (route: Route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error }),
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
    });
  });
}

async function mockPlaidFlow(page: Page, mode: "success" | "exit" | "exchange-failure" = "success") {
  await page.addInitScript((scenario: "success" | "exit" | "exchange-failure") => {
    type PlaidInitWindow = Window & {
      Plaid?: {
        create: (config: {
          onSuccess: (publicToken: string, metadata: unknown) => void;
          onExit?: (error: unknown, metadata: unknown) => void;
        }) => { open: () => void };
      };
    };

    const plaidMetadata = {
      institution: {
        name: "Mock Bank",
        institution_id: "ins_mock_bank",
      },
      accounts: [
        {
          id: "acct-checking-1",
          name: "Plaid Checking",
          official_name: "Plaid Checking",
          type: "depository",
          subtype: "checking",
          mask: "1234",
        },
      ],
    };

    (window as PlaidInitWindow).Plaid = {
      create: ({
        onSuccess,
        onExit,
      }: {
        onSuccess: (publicToken: string, metadata: unknown) => void;
        onExit?: (error: unknown, metadata: unknown) => void;
      }) => ({
        open: () => {
          window.setTimeout(() => {
            if (scenario === "exit") {
              onExit?.(null, plaidMetadata);
              return;
            }
            onSuccess("public-sandbox-token", plaidMetadata);
          }, 50);
        },
      }),
    };
  }, mode);

  await page.route("https://api.catalystcash.app/plaid/link-token", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ link_token: "link-sandbox-token" }),
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
    });
  });

  await page.route("https://api.catalystcash.app/plaid/exchange", async route => {
    if (mode === "exchange-failure") {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Token exchange failed: 400" }),
        headers: {
          "access-control-allow-origin": "*",
          "content-type": "application/json",
        },
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "access-sandbox-token",
        item_id: "item-mock-bank-1",
      }),
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
    });
  });

  await page.route("https://api.catalystcash.app/api/sync/status", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        hasData: true,
        last_synced_at: "2026-03-13T12:00:00.000Z",
        balances: {
          accounts: [
            {
              account_id: "acct-checking-1",
              balances: {
                available: 1200,
                current: 1260,
                limit: null,
                iso_currency_code: "USD",
              },
            },
          ],
        },
        liabilities: {
          liabilities: {
            credit: [],
          },
        },
        transactions: {
          transactions: [],
        },
      }),
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
    });
  });
}

async function seedStorage(page: Page, seed: Record<string, unknown>) {
  await page.addInitScript((payload: Record<string, unknown>) => {
    if (window.sessionStorage.getItem("__e2e_seeded__") === "1") {
      return;
    }

    window.localStorage.clear();
    window.sessionStorage.clear();
    Object.entries(payload).forEach(([key, value]) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    });
    window.sessionStorage.setItem("__e2e_seeded__", "1");
  }, seed);
}

async function writeAppStorage(page: Page, key: string, value: unknown) {
  await page.evaluate(
    async ({ storageKey, storageValue }) => {
      const preferences = (window as Window & {
        Capacitor?: {
          Plugins?: {
            Preferences?: {
              set: (input: { key: string; value: string }) => Promise<void>;
            };
          };
        };
      }).Capacitor?.Plugins?.Preferences;

      const serialized = JSON.stringify(storageValue);
      if (preferences?.set) {
        await preferences.set({ key: storageKey, value: serialized });
        return;
      }

      window.localStorage.setItem(storageKey, serialized);
    },
    { storageKey: key, storageValue: value }
  );
}

async function readAppStorage(page: Page, key: string) {
  return page.evaluate(async (storageKey) => {
    const preferences = (window as Window & {
      Capacitor?: {
        Plugins?: {
          Preferences?: {
            get: (input: { key: string }) => Promise<{ value?: string | null }>;
          };
        };
      };
    }).Capacitor?.Plugins?.Preferences;

    if (preferences?.get) {
      const result = await preferences.get({ key: storageKey });
      return result?.value ? JSON.parse(result.value) : null;
    }

    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  }, key);
}

async function openAuditComposer(page: Page) {
  await page.getByRole("button", { name: "Begin Audit", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "Checking balance" })).toBeVisible();
}

async function openSettingsMenu(page: Page, menuName: RegExp | string) {
  await page.getByRole("button", { name: "Open Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByRole("button", { name: menuName }).click();
}

function getSettingsRowInput(page: Page, label: string) {
  return page
    .getByText(label, { exact: true })
    .locator("xpath=ancestor::div[1]")
    .locator("input:visible")
    .first();
}

function getWizardFieldInput(page: Page, label: RegExp | string) {
  return page
    .getByText(label)
    .locator("xpath=ancestor::div[2]")
    .locator("input:visible")
    .first();
}

async function completeOnboarding(page: Page) {
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Let's Get Started →" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Accept legal disclaimer" }).click();
  await page.getByRole("button", { name: "Let's Get Started →" }).click();
  await expect(page.getByText("Import Data")).toBeVisible();
  await page.getByRole("button", { name: "Skip for Now →" }).click();
  await expect(page.getByText("Your Profile")).toBeVisible();
  await page.getByRole("button", { name: "Continue →" }).click();
  await expect(page.getByText("Your Cash Flow")).toBeVisible();
  await page.getByRole("button", { name: "Next →" }).click();
  await expect(page.getByText("Your Goals")).toBeVisible();
  await page.getByRole("button", { name: "Next →" }).click();
  await expect(page.getByText("Your Setup")).toBeVisible();
  await page.getByRole("button", { name: "Save & Finish →" }).click();

  await expect.poll(
    async () => {
      if (await page.getByText("You're All Set").isVisible().catch(() => false)) return "done";
      if (await page.getByRole("button", { name: "Open Settings" }).isVisible().catch(() => false)) return "shell";
      return "pending";
    },
    { timeout: 10000 }
  ).not.toBe("pending");

  if (await page.getByText("You're All Set").isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "🚀 Go to Dashboard" }).click();
  }

  await expect(page.getByRole("button", { name: "Open Settings" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Home" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();
}

test.describe("Catalyst Cash end-to-end", () => {
  test("completes onboarding and lands on the dashboard", async ({ page }) => {
    await seedStorage(page, {});
    await completeOnboarding(page);
    await expect(page.getByText("Welcome Checklist")).toBeVisible();
  });

  test("restores the main shell after onboarding on reload", async ({ page }) => {
    await seedStorage(page, {});
    await completeOnboarding(page);

    await page.reload();

    await expect(page.getByRole("button", { name: "Open Settings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Let's Get Started →" })).toHaveCount(0);
  });

  test("continues setup with imported backup values prefilled", async ({ page }) => {
    await seedStorage(page, {});
    await page.goto("/");

    await page.getByRole("checkbox", { name: "Accept legal disclaimer" }).click();
    await page.getByRole("button", { name: "Let's Get Started →" }).click();

    await page.locator('input[type="file"]').first().setInputFiles({
      name: "setup-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(SETUP_WIZARD_BACKUP)),
    });

    await expect(page.getByText("Backup imported successfully!")).toBeVisible();
    await page.getByRole("button", { name: "Continue Setup" }).click();

    await expect(page.getByText("Your Profile")).toBeVisible();
    await expect(page.getByLabel("Birth year")).toHaveValue("1991");
    await expect(getWizardFieldInput(page, /Monthly Rent/)).toHaveValue("2100");

    await page.getByRole("button", { name: "Continue →" }).click();
    await expect(page.getByText("Your Cash Flow")).toBeVisible();
    await expect(getWizardFieldInput(page, /Standard Paycheck/)).toHaveValue("3200");
    await expect(getWizardFieldInput(page, /First-of-Month Paycheck/)).toHaveValue("2800");
    await expect(getWizardFieldInput(page, /Weekly Spend Allowance/)).toHaveValue("425");
  });

  test("free-tier user can open Portfolio and stay there", async ({ page }) => {
    await seedStorage(page, {});
    await completeOnboarding(page);

    await page.getByRole("tab", { name: "Portfolio" }).click();
    await expect(page.getByRole("tab", { name: "Portfolio", selected: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Portfolio" }).first()).toBeVisible();

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
    await page.getByRole("button", { name: "Run Catalyst Audit" }).click();
    const consentModal = page.getByText("AI Data Consent");
    if (await consentModal.isVisible().catch(() => false)) {
      await page.getByRole("button", { name: "I Agree" }).click();
      await page.getByRole("button", { name: "Run Catalyst Audit" }).click();
    }

    await expect(page.getByRole("heading", { name: "Full Results" })).toBeVisible();
    const nextActionHeading = page.getByRole("heading", { name: "Immediate Next Action" });
    await expect(nextActionHeading).toBeVisible();
    await expect(nextActionHeading.locator("xpath=following::p[1]")).toHaveText(
      "Route $300 to Chase Freedom this week and keep checking above $900."
    );
  });

  test("keeps the current audit result when navigating away and returning to Results", async ({ page }) => {
    await seedStorage(page, {});
    await mockAuditApi(page);
    await completeOnboarding(page);

    await openAuditComposer(page);
    await page.getByRole("spinbutton", { name: "Checking balance" }).fill("4600");
    await page.getByLabel("Notes for this week").fill("Persist results across navigation");
    await page.getByRole("button", { name: "Run Catalyst Audit" }).click();
    const consentModal = page.getByText("AI Data Consent");
    if (await consentModal.isVisible().catch(() => false)) {
      await page.getByRole("button", { name: "I Agree" }).click();
      await page.getByRole("button", { name: "Run Catalyst Audit" }).click();
    }

    await expect(page.getByRole("heading", { name: "Full Results" })).toBeVisible();
    await page.getByRole("tab", { name: "Home" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();

    await page.getByRole("tab", { name: "Audit" }).click();
    await expect(page.getByText("LATEST AUDIT")).toBeVisible();
    const latestAuditButton = page.getByRole("button", { name: /LATEST AUDIT.*B · 86/i });
    await expect(latestAuditButton).toBeVisible();
    await latestAuditButton.click();

    await expect(page.getByRole("heading", { name: "Full Results" })).toBeVisible();
    const returnedNextActionHeading = page.getByRole("heading", { name: "Immediate Next Action" });
    await expect(returnedNextActionHeading).toBeVisible();
    await expect(returnedNextActionHeading.locator("xpath=following::p[1]")).toHaveText(
      "Route $300 to Chase Freedom this week and keep checking above $900."
    );
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
    await page.getByRole("button", { name: "Run Catalyst Audit" }).click();
    const consentModal = page.getByText("AI Data Consent");
    if (await consentModal.isVisible().catch(() => false)) {
      await page.getByRole("button", { name: "I Agree" }).click();
      await page.getByRole("button", { name: "Run Catalyst Audit" }).click();
    }

    await expect(page.getByText("Audit backend unavailable")).toBeVisible();
    await expect(page.getByText("New Audit", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Notes for this week")).toBeVisible();
  });

  test("imports a pasted audit result from the audit tab", async ({ page, context }) => {
    await seedStorage(page, {});
    await completeOnboarding(page);

    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate(async (payload) => {
      await navigator.clipboard.writeText(payload);
    }, JSON.stringify(AUDIT_FIXTURE));

    await page.getByRole("tab", { name: "Audit" }).click();
    await page.getByRole("button", { name: "Paste & Import AI Result" }).click();

    await expect(page.getByRole("heading", { name: "Full Results" })).toBeVisible();
    await expect(page.getByText("Audit imported successfully")).toBeVisible();
  });

  test("replaces an imported audit cleanly when the user runs a second audit", async ({ page, context }) => {
    await seedStorage(page, {});
    await mockAuditApiSequence(page, [SECOND_AUDIT_FIXTURE]);
    await completeOnboarding(page);

    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate(async (payload) => {
      await navigator.clipboard.writeText(payload);
    }, JSON.stringify(AUDIT_FIXTURE));

    await page.getByRole("tab", { name: "Audit" }).click();
    await page.getByRole("button", { name: "Paste & Import AI Result" }).click();

    await expect(page.getByRole("heading", { name: "Full Results" })).toBeVisible();
    const importedNextActionHeading = page.getByRole("heading", { name: "Immediate Next Action" });
    await expect(importedNextActionHeading).toBeVisible();
    await expect(importedNextActionHeading.locator("xpath=following::p[1]")).toHaveText(
      "Route $300 to Chase Freedom this week and keep checking above $900."
    );

    await page.getByRole("tab", { name: "Audit" }).click();
    const runNewAuditButton = page.getByRole("button", { name: "Run New Audit" });
    await expect(runNewAuditButton).toBeVisible();
    await runNewAuditButton.click();

    await expect(page.getByRole("spinbutton", { name: "Checking balance" })).toBeVisible();
    await page.getByRole("spinbutton", { name: "Checking balance" }).fill("2400");
    await page.getByLabel("Notes for this week").fill("Second audit should replace the imported current result");
    await page.getByRole("button", { name: "Run Catalyst Audit" }).click();
    const consentModal = page.getByText("AI Data Consent");
    if (await consentModal.isVisible().catch(() => false)) {
      await page.getByRole("button", { name: "I Agree" }).click();
      await page.getByRole("button", { name: "Run Catalyst Audit" }).click();
    }

    await expect(page.getByRole("heading", { name: "Full Results" })).toBeVisible();
    const secondNextActionHeading = page.getByRole("heading", { name: "Immediate Next Action" });
    await expect(secondNextActionHeading).toBeVisible();
    await expect(secondNextActionHeading.locator("xpath=following::p[1]")).toHaveText(
      "Pause nonessential spending until your checking buffer recovers."
    );
    await expect(page.getByText("Route $300 to Chase Freedom this week and keep checking above $900.")).toHaveCount(0);

    await page.getByRole("button", { name: "← Back" }).click();
    await expect(page.getByText("LATEST AUDIT")).toBeVisible();
    await expect(page.getByRole("button", { name: /LATEST AUDIT.*72/i })).toBeVisible();
  });

  test("rejects invalid pasted audit JSON with a visible error", async ({ page, context }) => {
    await seedStorage(page, {});
    await completeOnboarding(page);

    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate(async () => {
      await navigator.clipboard.writeText("not valid catalyst audit json");
    });

    await page.getByRole("tab", { name: "Audit" }).click();
    await page.getByRole("button", { name: "Paste & Import AI Result" }).click();

    await expect(page.getByText("Imported text is not valid Catalyst Cash audit JSON.")).toBeVisible();
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

    const housingTypeSelect = page
      .locator("div")
      .filter({ hasText: "Housing Situation" })
      .first()
      .getByRole("combobox")
      .last();
    await housingTypeSelect.selectOption("rent");

    const rentInput = getSettingsRowInput(page, "Monthly Rent");
    await expect(rentInput).toBeVisible();
    await rentInput.fill("1850");

    await page.reload();
    await openSettingsMenu(page, /Financial Profile/i);
    await expect(getSettingsRowInput(page, "Standard Paycheck")).toHaveValue("3200");
    await expect(getSettingsRowInput(page, "Monthly Rent")).toHaveValue("1850");

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

    await expect(page.getByRole("button", { name: "Let's Get Started →" })).toBeVisible();
    await page.getByRole("checkbox", { name: "Accept legal disclaimer" }).click();
    await page.getByRole("button", { name: "Let's Get Started →" }).click();
    await expect(page.getByText("Import Data")).toBeVisible();

    await page.locator('input[type="file"]').first().setInputFiles(downloadPath as string);
    await expect(page.getByText("This backup is encrypted. Enter your passphrase to unlock it.")).toBeVisible();
    await page.getByPlaceholder("Enter backup passphrase").fill("BackupPass123!");
    await page.getByRole("button", { name: "Unlock & Import" }).click();

    await expect(page.getByText("Backup imported successfully!")).toBeVisible();
    await page.getByRole("button", { name: "Go to Dashboard →" }).click();

    await expect
      .poll(async () => {
        if (await page.getByRole("heading", { name: "Financial Profile" }).isVisible().catch(() => false)) {
          return "profile";
        }
        if (await page.getByRole("button", { name: "Open Settings" }).isVisible().catch(() => false)) {
          return "shell";
        }
        return "pending";
      })
      .not.toBe("pending");

    if (await page.getByRole("button", { name: "Open Settings" }).isVisible().catch(() => false)) {
      await openSettingsMenu(page, /Financial Profile/i);
    }

    await expect(page.getByRole("heading", { name: "Financial Profile" })).toBeVisible();
    await expect(getSettingsRowInput(page, "Standard Paycheck")).toHaveValue("3200");
    await expect(getSettingsRowInput(page, "Monthly Rent")).toHaveValue("1850");
  });

  test("locks the app before shell render and unlocks with the saved passcode", async ({ page }) => {
    await seedStorage(page, {});
    await completeOnboarding(page);

    await openSettingsMenu(page, /App Security/i);
    await expect(page.getByText("Security Suite")).toBeVisible();
    await page.getByLabel("App passcode").fill("2468");
    await page.getByRole("button", { name: "Require Passcode" }).click();

    await page.reload();

    await expect(page.getByRole("dialog", { name: "App lock screen" })).toBeVisible();
    await expect(page.getByText("APP IS LOCKED")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open Settings" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toHaveCount(0);

    await page.keyboard.type("2468");

    await expect(page.getByRole("dialog", { name: "App lock screen" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open Settings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();
  });

  test("links a mocked Plaid account and reflects it in portfolio", async ({ page }) => {
    await seedStorage(page, {});
    await mockPlaidFlow(page);
    page.on("dialog", dialog => dialog.accept());
    await completeOnboarding(page);

    await openSettingsMenu(page, /Bank Connections/i);
    await expect(page.getByText("No linked accounts yet.")).toBeVisible();
    await page.getByRole("button", { name: "Link New Bank" }).click();

    await expect(page.getByRole("button", { name: "Disconnect Mock Bank" })).toBeVisible();
    await expect(page.getByText("1 Accounts Linked")).toBeVisible();

    await page.getByRole("tab", { name: "Portfolio" }).click();
    await expect(page.getByRole("tab", { name: "Portfolio", selected: true })).toBeVisible();
    await expect(page.getByText("Checking").last()).toBeVisible();
    await expect(page.getByText("Mock Bank").last()).toBeVisible();
    await expect(page.getByText("Plaid Checking").last()).toBeVisible();

    const storedConnections = (await readAppStorage(page, "plaid-connections")) || [];
    expect(storedConnections).toHaveLength(1);
    expect(storedConnections[0]).not.toHaveProperty("accessToken");
  });

  test("leaves the portfolio unchanged when Plaid Link exits without linking", async ({ page }) => {
    await seedStorage(page, {});
    await mockPlaidFlow(page, "exit");
    await completeOnboarding(page);

    await openSettingsMenu(page, /Bank Connections/i);
    await expect(page.getByText("No linked accounts yet.")).toBeVisible();
    await page.getByRole("button", { name: "Link New Bank" }).click();

    await expect(page.getByText("No linked accounts yet.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Disconnect Mock Bank" })).toHaveCount(0);
    await expect(page.getByText(/Token exchange failed|Failed to link bank|cancelled/i)).toHaveCount(0);

    await page.getByRole("tab", { name: "Portfolio" }).click();
    await expect(page.getByText("Plaid Checking")).toHaveCount(0);
  });

  test("shows a visible error and keeps the portfolio unchanged when Plaid exchange fails", async ({ page }) => {
    await seedStorage(page, {});
    await mockPlaidFlow(page, "exchange-failure");
    await completeOnboarding(page);

    await openSettingsMenu(page, /Bank Connections/i);
    await expect(page.getByText("No linked accounts yet.")).toBeVisible();
    await page.getByRole("button", { name: "Link New Bank" }).click();

    await expect(page.getByText("Token exchange failed: 400").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Disconnect Mock Bank" })).toHaveCount(0);
    await expect(page.getByText("No linked accounts yet.")).toBeVisible();

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
    await expect(page.getByText("Plaid Checking").last()).toBeVisible();
    await expect(page.getByText("Reconnect required").last()).toBeVisible();
  });
});
