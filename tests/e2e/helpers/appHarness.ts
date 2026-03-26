import { expect, type Page, type Route } from "@playwright/test";
import { encrypt } from "../../../src/modules/crypto.js";

const BACKEND_HOST_PATTERN = "(?:api\\.catalystcash\\.app|catalystcash-api\\.portfoliopro-app\\.workers\\.dev)";
const CONFIG_ROUTE = new RegExp(`https://${BACKEND_HOST_PATTERN}/config$`);
const MARKET_ROUTE = new RegExp(`https://${BACKEND_HOST_PATTERN}/market(?:\\?.*)?$`);
const AUTH_CHALLENGE_ROUTE = new RegExp(`https://${BACKEND_HOST_PATTERN}/auth/challenge$`);
const AUTH_SESSION_ROUTE = new RegExp(`https://${BACKEND_HOST_PATTERN}/auth/session$`);
const AUDIT_ROUTE = new RegExp(`https://${BACKEND_HOST_PATTERN}/audit$`);
const PLAID_LINK_TOKEN_ROUTE = new RegExp(`https://${BACKEND_HOST_PATTERN}/plaid/link-token$`);
const PLAID_EXCHANGE_ROUTE = new RegExp(`https://${BACKEND_HOST_PATTERN}/plaid/exchange$`);
const PLAID_SYNC_ROUTE = new RegExp(`https://${BACKEND_HOST_PATTERN}/api/sync/(status|force|deep)$`);
const HOUSEHOLD_SYNC_ROUTE = new RegExp(`https://${BACKEND_HOST_PATTERN}/api/household/sync$`);

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return bytesToHex(new Uint8Array(digest));
}

async function buildHouseholdIntegrityTag({
  householdId,
  encryptedBlob,
  version,
  requestId,
  authToken,
}: {
  householdId: string;
  encryptedBlob: unknown;
  version: number;
  requestId: string;
  authToken: string;
}) {
  const keyBytes = new Uint8Array(authToken.match(/.{1,2}/g)?.map((segment) => Number.parseInt(segment, 16)) || []);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const envelope = JSON.stringify({
    householdId,
    version,
    requestId,
    encryptedBlob,
  });
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(envelope));
  return bytesToHex(new Uint8Array(signature));
}

export const CORE_JOURNEY_SEED = {
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

export const AUDIT_FIXTURE = {
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

export const CHAT_RESPONSE =
  "You are safe this week. Keep checking above your floor and route any extra cash to your highest-interest debt first.";

export const SECOND_AUDIT_FIXTURE = {
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

export const SETUP_WIZARD_BACKUP = {
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

export function buildStoredAudit(parsed = AUDIT_FIXTURE, overrides: Record<string, unknown> = {}) {
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

export async function mockBaseApi(page: Page, gatingMode = "off") {
  await page.route(CONFIG_ROUTE, async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        gatingMode,
        minVersion: "2.0.0",
        platformPolicy: {
          web: {
            secureSecretPersistence: false,
            appLock: false,
            biometricUnlock: false,
            appleSignIn: false,
            cloudBackup: false,
            householdSync: false,
          },
        },
      }),
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
    });
  });

  await page.route(MARKET_ROUTE, async route => {
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

  await page.route(AUTH_SESSION_ROUTE, async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        token: "e2e-identity-token",
        expiresAt: "2099-01-01T00:00:00.000Z",
        actorId: "actor:e2e",
      }),
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
    });
  });

  await page.route(AUTH_CHALLENGE_ROUTE, async route => {
    const request = route.request();
    const body = request.postDataJSON?.() || {};
    const currentKeyFingerprint =
      body?.publicKeyJwk?.x || "e2e-device-key";
    const nextKeyFingerprint = body?.nextPublicKeyJwk?.x || "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        challengeId: "e2e-challenge",
        nonce: "e2e-nonce",
        keyFingerprint: currentKeyFingerprint,
        nextKeyFingerprint,
        signingPayload: JSON.stringify({
          v: 1,
          aud: "catalystcash-identity-v2",
          challengeId: "e2e-challenge",
          nonce: "e2e-nonce",
          intent: body?.intent || "bootstrap",
          keyFingerprint: currentKeyFingerprint,
          nextKeyFingerprint,
        }),
        expiresAt: "2099-01-01T00:05:00.000Z",
      }),
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
    });
  });
}

export async function mockAuditApi(page: Page) {
  await page.route(AUDIT_ROUTE, async (route: Route) => {
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

export async function mockAuditApiSequence(page: Page, fixtures: Array<Record<string, unknown>>) {
  let index = 0;
  await page.route(AUDIT_ROUTE, async route => {
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

export async function mockAuditApiFailure(page: Page, error = "Audit backend unavailable") {
  await page.route(AUDIT_ROUTE, async route => {
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

export async function mockPlaidFlow(page: Page, mode: "success" | "exit" | "exchange-failure" = "success") {
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

  await page.route(PLAID_LINK_TOKEN_ROUTE, async route => {
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

  await page.route(PLAID_EXCHANGE_ROUTE, async route => {
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

  await page.route(PLAID_SYNC_ROUTE, async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
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

export async function seedStorage(page: Page, seed: Record<string, unknown>) {
  await page.addInitScript((payload: Record<string, unknown>) => {
    if (window.sessionStorage.getItem("__e2e_seeded__") === "1") {
      return;
    }

    window.localStorage.clear();
    window.sessionStorage.clear();
    Object.entries(payload).forEach(([key, value]) => {
      const serialized = JSON.stringify(value);
      window.localStorage.setItem(key, serialized);
      window.localStorage.setItem(`CapacitorStorage.${key}`, serialized);
    });
    window.sessionStorage.setItem("__e2e_seeded__", "1");
  }, seed);
}

export async function writeAppStorage(page: Page, key: string, value: unknown) {
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
      window.localStorage.setItem(`CapacitorStorage.${storageKey}`, serialized);
    },
    { storageKey: key, storageValue: value },
  );
}

export async function readAppStorage(page: Page, key: string) {
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

    const raw = window.localStorage.getItem(storageKey) ?? window.localStorage.getItem(`CapacitorStorage.${storageKey}`);
    return raw ? JSON.parse(raw) : null;
  }, key);
}

export async function openAuditComposer(page: Page) {
  await page.getByRole("button", { name: "Run New Audit", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "Checking balance" })).toBeVisible();
}

export async function openSettingsMenu(page: Page, menuName: RegExp | string) {
  await page.getByRole("button", { name: "Open Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByRole("button", { name: menuName }).click();
}

export function getSettingsRowInput(page: Page, label: string) {
  return page
    .getByText(label, { exact: true })
    .locator("xpath=ancestor::div[1]")
    .locator("input:visible")
    .first();
}

export function getWizardFieldInput(page: Page, label: RegExp | string) {
  return page
    .getByText(label)
    .locator("xpath=ancestor::div[2]")
    .locator("input:visible")
    .first();
}

export async function completeOnboarding(page: Page) {
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Start Setup →" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Accept legal disclaimer" }).click();
  await page.getByRole("button", { name: "Start Setup →" }).click();
  await expect(page.getByText("Import Data")).toBeVisible();
  await page.getByRole("button", { name: "Skip for Now →" }).click();
  await expect(page.getByText("Your Profile", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue →" }).click();
  await expect(page.getByText("Cash Flow", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next →" }).click();
  await expect(page.getByText("Safety Targets", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next →" }).click();
  await expect(page.getByText("Connections & Security", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save & Finish →" }).click();

  await expect.poll(
    async () => {
      if (await page.getByText("You're All Set").isVisible().catch(() => false)) return "done";
      if (await page.getByRole("button", { name: "Open Settings" }).isVisible().catch(() => false)) return "shell";
      return "pending";
    },
    { timeout: 10000 },
  ).not.toBe("pending");

  if (await page.getByText("You're All Set").isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "🚀 Go to Dashboard" }).click();
  }

  await expect(page.getByRole("button", { name: "Open Settings" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Home" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();
}

export async function installMockNativeSecureStorage(
  page: Page,
  initialSecrets: Record<string, string> = {},
  securityState: Partial<{
    appPasscode: string;
    requireAuth: boolean;
    useFaceId: boolean;
    lockTimeout: number;
  }> = {},
  platform = "ios",
) {
  await page.addInitScript(
    (
      secrets: Record<string, string>,
      initialSecurityState: Partial<{
        appPasscode: string;
        requireAuth: boolean;
        useFaceId: boolean;
        lockTimeout: number;
      }>,
      runtimePlatform: string,
    ) => {
    const persistedSecretsKey = "__e2e_secure_store_state__";
    const persistedEntries = (() => {
      try {
        const raw = window.localStorage.getItem(persistedSecretsKey);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === "object" ? Object.entries(parsed) : null;
      } catch {
        return null;
      }
    })();
    const secureState = new Map(persistedEntries || Object.entries(secrets));
    const persistSecureState = () => {
      try {
        window.localStorage.setItem(
          persistedSecretsKey,
          JSON.stringify(Object.fromEntries(secureState.entries())),
        );
      } catch {
        // Ignore test-only storage failures.
      }
    };
    persistSecureState();
    const secureOverride = {
      enabled: true,
      plugin: {
        get: async ({ key }: { key: string }) => ({
          value: secureState.has(key) ? secureState.get(key) ?? null : null,
        }),
        set: async ({ key, value }: { key: string; value: string }) => {
          secureState.set(key, value);
          persistSecureState();
          return { value: true };
        },
        remove: async ({ key }: { key: string }) => {
          secureState.delete(key);
          persistSecureState();
          return { value: true };
        },
      },
    };

    (window as Window & {
      __E2E_SECURE_STORE__?: {
        enabled: boolean;
        plugin: {
          get: (input: { key: string }) => Promise<{ value: string | null }>;
          set: (input: { key: string; value: string }) => Promise<{ value: boolean }>;
          remove: (input: { key: string }) => Promise<{ value: boolean }>;
        };
      };
    }).__E2E_SECURE_STORE__ = secureOverride;
    (globalThis as typeof globalThis & { __E2E_SECURE_STORE__?: typeof secureOverride }).__E2E_SECURE_STORE__ =
      secureOverride;
    const securityOverride = {
      storageStatus: {
        platform: "native" as const,
        available: true,
        mode: "native-secure" as const,
        canPersistSecrets: true,
        isHardwareBacked: true,
        message: "",
      },
      ...initialSecurityState,
    };
    (window as Window & { __E2E_SECURITY_STATE__?: typeof securityOverride }).__E2E_SECURITY_STATE__ =
      securityOverride;
    (globalThis as typeof globalThis & { __E2E_SECURITY_STATE__?: typeof securityOverride }).__E2E_SECURITY_STATE__ =
      securityOverride;
    (window as Window & { __E2E_HOUSEHOLD_SYNC_DELAY__?: number }).__E2E_HOUSEHOLD_SYNC_DELAY__ = 250;
    (globalThis as typeof globalThis & { __E2E_HOUSEHOLD_SYNC_DELAY__?: number }).__E2E_HOUSEHOLD_SYNC_DELAY__ =
      250;
    (window as Window & { __E2E_PLATFORM__?: string }).__E2E_PLATFORM__ = runtimePlatform;
    (globalThis as typeof globalThis & { __E2E_PLATFORM__?: string }).__E2E_PLATFORM__ = runtimePlatform;
    },
    initialSecrets,
    securityState,
    platform,
  );
}

export function mockHouseholdSyncApi(page: Page) {
  const pushes: Array<Record<string, unknown>> = [];
  const fetches: Array<Record<string, unknown>> = [];
  let remoteRecord: null | {
    householdId: string;
    encryptedBlob: string;
    integrityTag: string;
    version: number;
    requestId: string;
    lastUpdatedAt: string;
  } = null;

  page.route(HOUSEHOLD_SYNC_ROUTE, async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.action === "push") {
      pushes.push(body);
      remoteRecord = {
        householdId: String(body.householdId || ""),
        encryptedBlob: String(body.encryptedBlob || ""),
        integrityTag: String(body.integrityTag || ""),
        version: Number(body.version || 0),
        requestId: String(body.requestId || ""),
        lastUpdatedAt: "2026-03-15T23:30:00.000Z",
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, version: remoteRecord.version }),
        headers: {
          "access-control-allow-origin": "*",
          "content-type": "application/json",
        },
      });
      return;
    }

    if (body.action === "fetch") {
      fetches.push(body);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          remoteRecord
            ? {
                ok: true,
                hasData: true,
                encryptedBlob: remoteRecord.encryptedBlob,
                integrityTag: remoteRecord.integrityTag,
                version: remoteRecord.version,
                requestId: remoteRecord.requestId,
                lastUpdatedAt: remoteRecord.lastUpdatedAt,
              }
            : {
                ok: true,
                hasData: false,
              },
        ),
        headers: {
          "access-control-allow-origin": "*",
          "content-type": "application/json",
        },
      });
      return;
    }

    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "unsupported_action" }),
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
    });
  });

  return {
    pushes,
    fetches,
    get remoteRecord() {
      return remoteRecord;
    },
    setRemoteRecord(nextRecord: typeof remoteRecord) {
      remoteRecord = nextRecord;
    },
  };
}

export async function seedHouseholdRemoteRecord(
  householdApi: ReturnType<typeof mockHouseholdSyncApi>,
  {
    householdId,
    passcode,
    payload,
    version = 1,
    requestId = "e2e-seeded-request",
    lastUpdatedAt = "2026-03-15T23:30:00.000Z",
  }: {
    householdId: string;
    passcode: string;
    payload: Record<string, unknown>;
    version?: number;
    requestId?: string;
    lastUpdatedAt?: string;
  },
) {
  const encryptedBlob = await encrypt(JSON.stringify(payload), passcode);
  const authToken = await sha256Hex(`household-auth-v1:${householdId.trim()}:${passcode.trim()}`);
  const integrityTag = await buildHouseholdIntegrityTag({
    householdId,
    encryptedBlob,
    version,
    requestId,
    authToken,
  });

  householdApi.setRemoteRecord({
    householdId,
    encryptedBlob,
    integrityTag,
    version,
    requestId,
    lastUpdatedAt,
  });
}

export async function setTabScrollTop(page: Page, tabId: string, value: number) {
  await page.locator(`.snap-page[data-tabid="${tabId}"]`).evaluate((element, nextTop) => {
    const host = element as HTMLDivElement;
    const descendants = Array.from(host.querySelectorAll<HTMLElement>("*"));
    const scrollTarget =
      descendants.find(node => node.scrollHeight - node.clientHeight > 24 && node.clientHeight > 0) || host;
    scrollTarget.scrollTop = Number(nextTop);
  }, value);
}

export async function getTabScrollTop(page: Page, tabId: string) {
  return page.locator(`.snap-page[data-tabid="${tabId}"]`).evaluate((element) => {
    const host = element as HTMLDivElement;
    const descendants = Array.from(host.querySelectorAll<HTMLElement>("*"));
    const scrollTarget =
      descendants.find(node => node.scrollHeight - node.clientHeight > 24 && node.clientHeight > 0) || host;
    return scrollTarget.scrollTop;
  });
}
