import { afterEach, describe, expect, it, vi } from "vitest";
import worker, {
  getIsoWeekKey,
  getQuotaWindow,
  isRevenueCatEntitlementActive,
  mergePlaidTransactions,
  resolveEffectiveTier,
} from "./index.js";

class FakeD1 {
  constructor(seed = {}) {
    this.plaidItems = [...(seed.plaidItems || [])];
    this.syncData = [...(seed.syncData || [])];
    this.auditLog = [...(seed.auditLog || [])];
  }

  prepare(sql) {
    const db = this;
    return {
      bind(...params) {
        return {
          async all() {
            return { results: db.#executeSelect(sql, params) };
          },
          async run() {
            db.#executeWrite(sql, params);
            return { success: true };
          },
        };
      },
    };
  }

  #executeSelect(sql, params) {
    if (sql.includes("SELECT transactions_cursor FROM plaid_items WHERE item_id = ?")) {
      const item = this.plaidItems.find(entry => entry.item_id === params[0]);
      return item ? [{ transactions_cursor: item.transactions_cursor ?? null }] : [];
    }

    if (sql.includes("SELECT item_id FROM plaid_items WHERE access_token = ?")) {
      const item = this.plaidItems.find(entry => entry.access_token === params[0]);
      return item ? [{ item_id: item.item_id }] : [];
    }

    if (sql.includes("SELECT user_id, access_token FROM plaid_items WHERE item_id = ?")) {
      const item = this.plaidItems.find(entry => entry.item_id === params[0]);
      return item ? [{ user_id: item.user_id, access_token: item.access_token }] : [];
    }

    if (sql.includes("SELECT access_token, item_id FROM plaid_items WHERE user_id = ?")) {
      return this.plaidItems
        .filter(entry => entry.user_id === params[0])
        .map(entry => ({ access_token: entry.access_token, item_id: entry.item_id }));
    }

    if (sql.includes("SELECT last_synced_at FROM sync_data WHERE user_id = ? AND item_id = 'deep_sync_meta'")) {
      const row = this.syncData.find(entry => entry.user_id === params[0] && entry.item_id === "deep_sync_meta");
      return row ? [{ last_synced_at: row.last_synced_at ?? null }] : [];
    }

    if (sql.includes("SELECT last_synced_at FROM sync_data WHERE user_id = ? AND item_id = ?")) {
      const row = this.syncData.find(entry => entry.user_id === params[0] && entry.item_id === params[1]);
      return row ? [{ last_synced_at: row.last_synced_at ?? null }] : [];
    }

    if (sql.includes("SELECT last_synced_at FROM sync_data WHERE user_id = ?")) {
      return this.syncData
        .filter(entry => entry.user_id === params[0])
        .map(entry => ({ last_synced_at: entry.last_synced_at ?? null }));
    }

    if (sql.includes("SELECT * FROM sync_data WHERE user_id = ? AND item_id = ?")) {
      const row = this.syncData.find(entry => entry.user_id === params[0] && entry.item_id === params[1]);
      return row ? [row] : [];
    }

    if (sql.includes("SELECT * FROM sync_data WHERE user_id = ?")) {
      return this.syncData.filter(entry => entry.user_id === params[0]);
    }

    if (sql.includes("SELECT * FROM audit_log WHERE id = ?")) {
      const row = this.auditLog.find(entry => entry.id === params[0]);
      return row ? [row] : [];
    }

    if (sql.includes("FROM audit_log") && sql.includes("ORDER BY created_at DESC")) {
      return [...this.auditLog].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 50);
    }

    return [];
  }

  #executeWrite(sql, params) {
    if (sql.includes("UPDATE plaid_items SET transactions_cursor = ?")) {
      const [cursor, itemId] = params;
      const item = this.plaidItems.find(entry => entry.item_id === itemId);
      if (item) {
        item.transactions_cursor = cursor;
        item.updated_at = "2026-03-13 12:00:00";
      }
      return;
    }

    if (sql.includes("INSERT OR REPLACE INTO plaid_items")) {
      const [itemId, userId, accessToken, transactionsCursor] = params;
      const next = {
        item_id: itemId,
        user_id: userId,
        access_token: accessToken,
        transactions_cursor: transactionsCursor ?? null,
        updated_at: "2026-03-13 12:00:00",
      };
      const index = this.plaidItems.findIndex(entry => entry.item_id === itemId);
      if (index >= 0) this.plaidItems[index] = next;
      else this.plaidItems.push(next);
      return;
    }

    if (sql.includes("INSERT INTO sync_data (user_id, item_id, balances_json, liabilities_json, transactions_json)")) {
      const [userId, itemId, balancesJson, liabilitiesJson, transactionsJson] = params;
      this.#upsertSyncData({
        user_id: userId,
        item_id: itemId,
        balances_json: balancesJson,
        liabilities_json: liabilitiesJson,
        transactions_json: transactionsJson,
      });
      return;
    }

    if (sql.includes("INSERT INTO sync_data (user_id, item_id, balances_json) VALUES (?, 'deep_sync_meta', '{}')")) {
      const [userId] = params;
      this.#upsertSyncData({
        user_id: userId,
        item_id: "deep_sync_meta",
        balances_json: "{}",
        liabilities_json: "{}",
        transactions_json: "{}",
      });
      return;
    }

    if (sql.includes("INSERT INTO audit_log")) {
      const [
        id,
        provider,
        model,
        userId,
        promptTokens,
        completionTokens,
        parseSucceeded,
        hitDegradedFallback,
        responsePreview,
        confidence,
        driftWarning,
        driftDetails,
      ] = params;
      this.auditLog.push({
        id,
        created_at: "2026-03-13 12:00:00",
        provider,
        model,
        user_id: userId,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        parse_succeeded: parseSucceeded,
        hit_degraded_fallback: hitDegradedFallback,
        response_preview: responsePreview,
        confidence,
        drift_warning: driftWarning,
        drift_details: driftDetails,
      });
      return;
    }

    if (sql.includes("UPDATE audit_log")) {
      const [promptTokens, completionTokens, parseSucceeded, hitDegradedFallback, responsePreview, confidence, driftWarning, driftDetails, logId] = params;
      const row = this.auditLog.find(entry => entry.id === logId);
      if (row) {
        row.prompt_tokens = promptTokens;
        row.completion_tokens = completionTokens;
        row.parse_succeeded = parseSucceeded;
        row.hit_degraded_fallback = hitDegradedFallback;
        row.response_preview = responsePreview;
        row.confidence = confidence;
        row.drift_warning = driftWarning;
        row.drift_details = driftDetails;
      }
    }
  }

  #upsertSyncData(row) {
    const index = this.syncData.findIndex(entry => entry.user_id === row.user_id && entry.item_id === row.item_id);
    const next = {
      user_id: row.user_id,
      item_id: row.item_id,
      balances_json: row.balances_json ?? "{}",
      liabilities_json: row.liabilities_json ?? "{}",
      transactions_json: row.transactions_json ?? "{}",
      last_synced_at: "2026-03-13 12:00:00",
    };
    if (index >= 0) {
      this.syncData[index] = { ...this.syncData[index], ...next };
    } else {
      this.syncData.push(next);
    }
  }
}

function makeEnv(overrides = {}) {
  return {
    ALLOWED_ORIGIN: "https://catalystcash.app",
    PLAID_CLIENT_ID: "plaid-client-id",
    PLAID_SECRET: "plaid-secret",
    DB: new FakeD1(),
    ...overrides,
  };
}

function makeCtx() {
  const tasks = [];
  return {
    waitUntil(promise) {
      tasks.push(promise);
    },
    async flush() {
      await Promise.all(tasks);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

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

describe("AI provider routing and gating", () => {
  it("logs successful audit metadata and exposes it through the admin endpoint", async () => {
    const env = makeEnv({
      ADMIN_TOKEN: "admin-secret",
      GOOGLE_API_KEY: "gemini-test-key",
      DB: new FakeD1(),
    });

    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const url = String(input);
      expect(url).toContain(":generateContent");
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: '{"healthScore":{"score":80,"grade":"B"},"headerCard":{"status":"GREEN","details":[]}}' }],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 321,
            candidatesTokenCount: 123,
          },
        }),
        { status: 200 }
      );
    }));

    const auditResponse = await worker.fetch(
      new Request("https://api.catalystcash.app/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Device-ID": "device-123" },
        body: JSON.stringify({
          snapshot: "financial snapshot",
          systemPrompt: "system prompt",
          history: [],
          model: "gemini-2.5-flash",
          provider: "gemini",
          stream: false,
        }),
      }),
      env,
      makeCtx()
    );

    expect(auditResponse.status).toBe(200);
    const auditLogId = auditResponse.headers.get("X-Audit-Log-ID");
    expect(auditLogId).toBeTruthy();

    const updateResponse = await worker.fetch(
      new Request("https://api.catalystcash.app/api/audit-log/outcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auditLogId,
          parseSucceeded: true,
          hitDegradedFallback: false,
          confidence: "high",
          driftWarning: true,
          driftDetails: ["health-score-drift:9"],
        }),
      }),
      env,
      makeCtx()
    );

    expect(updateResponse.status).toBe(200);

    const adminResponse = await worker.fetch(
      new Request("https://api.catalystcash.app/api/admin/audit-log", {
        method: "GET",
        headers: { Authorization: "Bearer admin-secret" },
      }),
      env,
      makeCtx()
    );

    expect(adminResponse.status).toBe(200);
    const payload = await adminResponse.json();
    expect(payload).toMatchObject({
      rows: [
        expect.objectContaining({
          id: auditLogId,
          provider: "gemini",
          model: "gemini-2.5-flash",
          user_id: "device-123",
          prompt_tokens: 321,
          completion_tokens: 123,
          parse_succeeded: 1,
          hit_degraded_fallback: 0,
          confidence: "high",
          drift_warning: 1,
        }),
      ],
    });
    expect(payload.rows[0].drift_details).toBe(JSON.stringify(["health-score-drift:9"]));
  });

  it("routes Claude-family selections through the Anthropic endpoint", async () => {
    vi.stubGlobal("caches", {
      default: {
        match: vi.fn(async () => null),
        put: vi.fn(async () => undefined),
      },
    });

    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === "https://api.revenuecat.com/v1/subscribers/rc_user_123") {
        return new Response(
          JSON.stringify({
            subscriber: {
              entitlements: {
                "Catalyst Cash Pro": { expires_date: "2030-01-01T00:00:00Z" },
              },
            },
          }),
          { status: 200 }
        );
      }
      expect(url).toBe("https://api.anthropic.com/v1/messages");
      expect(init?.headers?.["x-api-key"]).toBe("anthropic-test-key");
      expect(JSON.parse(init.body)).toMatchObject({
        model: "claude-sonnet-4-6",
        system: "system prompt",
      });
      return new Response(JSON.stringify({ content: [{ text: "anthropic ok" }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/audit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Subscription-Tier": "pro",
          "X-RC-App-User-ID": "rc_user_123",
        },
        body: JSON.stringify({
          snapshot: "financial snapshot",
          systemPrompt: "system prompt",
          history: [],
          model: "claude-sonnet-4-6",
          provider: "anthropic",
          stream: false,
        }),
      }),
      makeEnv({
        ANTHROPIC_API_KEY: "anthropic-test-key",
        REVENUECAT_SECRET_KEY: "revenuecat-test-key",
      }),
      makeCtx()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ result: "anthropic ok" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stores up to 600 characters of audit preview text", async () => {
    const env = makeEnv({
      ADMIN_TOKEN: "admin-secret",
      GOOGLE_API_KEY: "gemini-test-key",
      DB: new FakeD1(),
    });
    const longPreview = "x".repeat(750);

    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: longPreview }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        }),
        { status: 200 }
      )
    ));

    const auditResponse = await worker.fetch(
      new Request("https://api.catalystcash.app/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Device-ID": "device-123" },
        body: JSON.stringify({
          snapshot: "financial snapshot",
          systemPrompt: "system prompt",
          history: [],
          model: "gemini-2.5-flash",
          provider: "gemini",
          stream: false,
        }),
      }),
      env,
      makeCtx()
    );

    const auditLogId = auditResponse.headers.get("X-Audit-Log-ID");
    const adminResponse = await worker.fetch(
      new Request("https://api.catalystcash.app/api/admin/audit-log", {
        method: "GET",
        headers: { Authorization: "Bearer admin-secret" },
      }),
      env,
      makeCtx()
    );

    const payload = await adminResponse.json();
    const row = payload.rows.find((entry) => entry.id === auditLogId);
    expect(row.response_preview).toHaveLength(600);
  });

  it("silently downgrades free-tier audit requests to Gemini Flash", async () => {
    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      expect(url).toContain("generativelanguage.googleapis.com");
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
          usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 8 },
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshot: "financial snapshot",
          systemPrompt: "system prompt",
          history: [],
          model: "gpt-4.1",
          provider: "openai",
          stream: false,
        }),
      }),
      makeEnv({
        OPENAI_API_KEY: "openai-test-key",
        GOOGLE_API_KEY: "gemini-test-key",
      }),
      makeCtx()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ result: '{"ok":true}' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("Plaid transaction sync migration", () => {
  it("blocks deep sync for free users only when live gating is enabled", async () => {
    const env = makeEnv({
      GATING_MODE: "live",
      DB: new FakeD1({
        plaidItems: [
          {
            item_id: "item-1",
            user_id: "free-user",
            access_token: "access-1",
            transactions_cursor: null,
          },
        ],
      }),
    });

    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/api/sync/deep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "free-user" }),
      }),
      env,
      makeCtx()
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "upgrade_required",
    });
  });

  it("merges added, modified, and removed transaction deltas", () => {
    const merged = mergePlaidTransactions(
      {
        transactions: [
          { transaction_id: "txn-1", amount: 42, date: "2026-03-12", name: "Original" },
          { transaction_id: "txn-2", amount: 19, date: "2026-03-11", name: "Keep" },
        ],
      },
      {
        added: [{ transaction_id: "txn-3", amount: 8, date: "2026-03-13", name: "New" }],
        modified: [{ transaction_id: "txn-1", amount: 44, date: "2026-03-12", name: "Updated" }],
        removed: [{ transaction_id: "txn-2" }],
      }
    );

    expect(merged.transactions.map(transaction => transaction.transaction_id)).toEqual(["txn-3", "txn-1"]);
    expect(merged.transactions[1]).toMatchObject({ amount: 44, name: "Updated" });
    expect(merged.total_transactions).toBe(2);
  });

  it("uses /transactions/sync for a first deep sync and persists the new cursor", async () => {
    const env = makeEnv({
      GATING_MODE: "off",
      DB: new FakeD1({
        plaidItems: [
          {
            item_id: "item-1",
            user_id: "user-1",
            access_token: "access-1",
            transactions_cursor: null,
          },
        ],
      }),
    });

    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/liabilities/get")) {
        return new Response(JSON.stringify({ liabilities: { credit: [] } }), { status: 200 });
      }
      if (url.endsWith("/transactions/sync")) {
        const body = JSON.parse(init.body);
        expect(body.cursor).toBeUndefined();
        return new Response(
          JSON.stringify({
            added: [
              { transaction_id: "txn-100", amount: 12.5, date: "2026-03-13", name: "Coffee" },
              { transaction_id: "txn-101", amount: -2200, date: "2026-03-12", name: "Payroll" },
            ],
            modified: [],
            removed: [],
            has_more: false,
            next_cursor: "cursor-initial-1",
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/api/sync/deep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "user-1" }),
      }),
      env,
      makeCtx()
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://production.plaid.com/transactions/sync",
      expect.objectContaining({ method: "POST" })
    );

    const item = env.DB.plaidItems.find(entry => entry.item_id === "item-1");
    const syncRow = env.DB.syncData.find(entry => entry.user_id === "user-1" && entry.item_id === "item-1");
    expect(item.transactions_cursor).toBe("cursor-initial-1");
    expect(JSON.parse(syncRow.transactions_json)).toMatchObject({
      total_transactions: 2,
      transactions: expect.arrayContaining([
        expect.objectContaining({ transaction_id: "txn-100" }),
        expect.objectContaining({ transaction_id: "txn-101" }),
      ]),
    });
  });

  it("uses the stored cursor for webhook incremental sync and merges delta updates", async () => {
    const env = makeEnv({
      GATING_MODE: "off",
      DB: new FakeD1({
        plaidItems: [
          {
            item_id: "item-1",
            user_id: "catalyst-user",
            access_token: "access-1",
            transactions_cursor: "cursor-prev-1",
          },
        ],
        syncData: [
          {
            user_id: "catalyst-user",
            item_id: "item-1",
            balances_json: "{}",
            liabilities_json: "{}",
            transactions_json: JSON.stringify({
              transactions: [
                { transaction_id: "txn-1", amount: 9, date: "2026-03-11", name: "Old 1" },
                { transaction_id: "txn-2", amount: 24, date: "2026-03-10", name: "Old 2" },
              ],
            }),
            last_synced_at: "2026-03-01 12:00:00",
          },
        ],
      }),
    });

    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/accounts/get")) {
        return new Response(JSON.stringify({ accounts: [{ account_id: "acct-1" }] }), { status: 200 });
      }
      if (url.endsWith("/transactions/sync")) {
        const body = JSON.parse(init.body);
        expect(body.cursor).toBe("cursor-prev-1");
        return new Response(
          JSON.stringify({
            added: [{ transaction_id: "txn-3", amount: 50, date: "2026-03-13", name: "Added" }],
            modified: [{ transaction_id: "txn-1", amount: 11, date: "2026-03-11", name: "Updated" }],
            removed: [{ transaction_id: "txn-2" }],
            has_more: false,
            next_cursor: "cursor-next-2",
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const ctx = makeCtx();
    const response = await worker.fetch(
      new Request("https://api.catalystcash.app/plaid/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhook_type: "TRANSACTIONS",
          webhook_code: "SYNC_UPDATES_AVAILABLE",
          item_id: "item-1",
        }),
      }),
      env,
      ctx
    );
    await ctx.flush();

    expect(response.status).toBe(200);
    const item = env.DB.plaidItems.find(entry => entry.item_id === "item-1");
    const syncRow = env.DB.syncData.find(entry => entry.user_id === "catalyst-user" && entry.item_id === "item-1");
    const transactions = JSON.parse(syncRow.transactions_json);

    expect(item.transactions_cursor).toBe("cursor-next-2");
    expect(transactions.transactions.map(transaction => transaction.transaction_id)).toEqual(["txn-3", "txn-1"]);
    expect(transactions.transactions[1]).toMatchObject({ amount: 11, name: "Updated" });
    expect(syncRow.balances_json).toContain("acct-1");
  });
});
