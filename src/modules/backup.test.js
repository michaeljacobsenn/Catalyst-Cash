import { beforeEach, describe, expect, it, vi } from "vitest";
import { FULL_PROFILE_QA_BANKS, FULL_PROFILE_QA_CARDS, FULL_PROFILE_QA_RENEWALS } from "./qaSeed.js";

const LAST_CLOUD_BACKUP_TS_KEY = "last-backup-ts";
const LAST_PORTABLE_BACKUP_TS_KEY = "last-portable-backup-ts";
const LAST_PORTABLE_BACKUP_KIND_KEY = "last-portable-backup-kind";

const {
  dbStore,
  nativeExport,
  encrypt,
  decrypt,
  isEncrypted,
} = vi.hoisted(() => ({
  dbStore: new Map(),
  nativeExport: vi.fn(),
  encrypt: vi.fn(async payload => ({ encrypted: payload })),
  decrypt: vi.fn(async envelope => envelope.__plaintext || ""),
  isEncrypted: vi.fn(payload => Boolean(payload?.__encrypted)),
}));

vi.mock("./utils.js", () => ({
  db: {
    keys: vi.fn(async () => Array.from(dbStore.keys())),
    get: vi.fn(async key => (dbStore.has(key) ? dbStore.get(key) : null)),
    set: vi.fn(async (key, value) => {
      dbStore.set(key, value);
    }),
    del: vi.fn(async (key) => {
      dbStore.delete(key);
    }),
  },
}));

vi.mock("./nativeExport.js", () => ({
  nativeExport,
}));

vi.mock("./crypto.js", () => ({
  encrypt,
  decrypt,
  isEncrypted,
}));

vi.mock("./plaid.js", () => ({
  ensureConnectionAccountsPresent: vi.fn((connection, cards = [], bankAccounts = [], _cardCatalog = null, plaidInvestments = []) => {
    const nextCards = [...cards];
    const nextBankAccounts = [...bankAccounts];
    let importedCards = 0;
    let importedBankAccounts = 0;

    for (const account of connection?.accounts || []) {
      if (account?.type === "credit" && !nextCards.some((card) => card._plaidAccountId === account.plaidAccountId)) {
        nextCards.push({
          id: `plaid_${account.plaidAccountId}`,
          institution: connection.institutionName,
          name: account.officialName || account.name,
          _plaidAccountId: account.plaidAccountId,
          _plaidConnectionId: connection.id,
          _plaidBalance: null,
        });
        importedCards++;
      }
      if (account?.type === "depository" && !nextBankAccounts.some((bank) => bank._plaidAccountId === account.plaidAccountId)) {
        nextBankAccounts.push({
          id: `plaid_${account.plaidAccountId}`,
          bank: connection.institutionName,
          name: account.officialName || account.name,
          accountType: account.subtype === "savings" ? "savings" : "checking",
          _plaidAccountId: account.plaidAccountId,
          _plaidConnectionId: connection.id,
          _plaidBalance: null,
        });
        importedBankAccounts++;
      }
    }

    return {
      updatedCards: nextCards,
      updatedBankAccounts: nextBankAccounts,
      updatedPlaidInvestments: plaidInvestments,
      importedCards,
      importedBankAccounts,
      importedPlaidInvestments: 0,
    };
  }),
  materializeManualFallbackForConnections: vi.fn((cards = [], bankAccounts = [], connectionIds = []) => {
    const reconnectIds = new Set(connectionIds.map((id) => String(id)));
    return {
      updatedCards: cards.map((card) =>
        reconnectIds.has(String(card?._plaidConnectionId || ""))
          ? { ...card, _plaidManualFallback: true }
          : card
      ),
      updatedBankAccounts: bankAccounts.map((account) =>
        reconnectIds.has(String(account?._plaidConnectionId || ""))
          ? { ...account, _plaidManualFallback: true }
          : account
      ),
      changed: true,
    };
  }),
}));

import {
  buildBackupPayload,
  exportBackup,
  getCloudBackupBlockReason,
  importBackup,
  isSupportedBackupFile,
  mergeUniqueById,
  sanitizeBackupPortfolioData,
  shouldRunAutoBackup,
} from "./backup.js";

class MockFileReader {
  onload = null;
  onerror = null;

  readAsText(file) {
    queueMicrotask(() => {
      if (!file || typeof file.__text !== "string") {
        this.onerror?.(new Error("read failed"));
        return;
      }
      this.onload?.({ target: { result: file.__text } });
    });
  }
}

describe("backup utilities", () => {
  beforeEach(() => {
    dbStore.clear();
    nativeExport.mockReset();
    encrypt.mockClear();
    decrypt.mockClear();
    isEncrypted.mockClear();
    global.FileReader = MockFileReader;
  });

  describe("mergeUniqueById", () => {
    it("merges two non-overlapping arrays", () => {
      const existing = [{ id: "a", name: "Alice" }];
      const incoming = [{ id: "b", name: "Bob" }];
      const result = mergeUniqueById(existing, incoming);
      expect(result).toHaveLength(2);
      expect(result.map(r => r.id)).toEqual(["a", "b"]);
    });

    it("keeps existing entries when IDs overlap", () => {
      const existing = [{ id: "1", name: "Original" }];
      const incoming = [{ id: "1", name: "Duplicate" }];
      const result = mergeUniqueById(existing, incoming);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Original");
    });
  });

  describe("isSupportedBackupFile", () => {
    it("accepts encrypted and json backup files", () => {
      expect(isSupportedBackupFile({ name: "backup.enc", type: "application/octet-stream" })).toBe(true);
      expect(isSupportedBackupFile({ name: "backup.json", type: "application/json" })).toBe(true);
      expect(isSupportedBackupFile({ name: "backup", type: "text/plain" })).toBe(true);
    });

    it("rejects unrelated file types", () => {
      expect(isSupportedBackupFile({ name: "backup.xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })).toBe(false);
      expect(isSupportedBackupFile({ name: "photo.heic", type: "image/heic" })).toBe(false);
      expect(isSupportedBackupFile(null)).toBe(false);
    });
  });

  describe("exportBackup", () => {
    it("exports encrypted backup metadata without sensitive keys and with sanitized plaid metadata", async () => {
      dbStore.set("financial-config", { income: 1000 });
      dbStore.set("personal-rules", "be strict");
      dbStore.set("api-key-openai", "secret");
      dbStore.set("household-id-protected", "protected");
      dbStore.set("household-last-sync-ts", 1234567890);
      dbStore.set("household-last-merge-report", { conflict: true });
      dbStore.set("household-last-conflict", { overwrittenKeys: ["financial-config"] });
      dbStore.set("plaid-connections", [
        {
          id: "conn_1",
          institutionName: "Chase",
          accessToken: "access-secret",
          accounts: [
            {
              plaidAccountId: "acct_1",
              name: "Checking",
              balance: 1250,
            },
          ],
        },
      ]);

      const result = await exportBackup("passphrase");

      expect(result.count).toBeGreaterThan(0);
      expect(result.filename).toMatch(/^CatalystCash_Backup_\d{4}-\d{2}-\d{2}\.enc$/);
      expect(result.plaidConnectionCount).toBe(1);
      expect(nativeExport).toHaveBeenCalledTimes(1);
      const [filename, payload, mimeType] = nativeExport.mock.calls[0];
      expect(filename).toBe(result.filename);
      expect(mimeType).toBe("application/octet-stream");
      const exportedEnvelope = JSON.parse(payload);
      const backup = JSON.parse(exportedEnvelope.encrypted);
      expect(backup.data["financial-config"]).toEqual({ income: 1000 });
      expect(backup.data["personal-rules"]).toBe("be strict");
      expect(backup.data["api-key-openai"]).toBeUndefined();
      expect(backup.data["household-id-protected"]).toBeUndefined();
      expect(backup.data["household-last-sync-ts"]).toBeUndefined();
      expect(backup.data["household-last-merge-report"]).toBeUndefined();
      expect(backup.data["household-last-conflict"]).toBeUndefined();
      expect(backup.data["plaid-connections"]).toBeUndefined();
      expect(backup.data["plaid-connections-sanitized"]).toEqual([
        {
          id: "conn_1",
          institutionName: "Chase",
          institutionId: undefined,
          accounts: [
            {
              plaidAccountId: "acct_1",
              name: "Checking",
              officialName: undefined,
              type: undefined,
              subtype: undefined,
              mask: undefined,
              linkedCardId: null,
              linkedBankAccountId: null,
              linkedInvestmentId: null,
              balance: null,
            },
          ],
          lastSync: null,
          _needsReconnect: true,
        },
      ]);
      expect(dbStore.get(LAST_PORTABLE_BACKUP_TS_KEY)).toBeTypeOf("number");
      expect(dbStore.get(LAST_PORTABLE_BACKUP_KIND_KEY)).toBe("encrypted-export");
    });

    it("strips demo portfolio records and relinks imported renewals before backup export", async () => {
      dbStore.set("card-portfolio", [
        { id: "demo-card-1", institution: "Chase", name: "Chase Sapphire Preferred" },
        {
          id: "plaid_live_delta",
          institution: "American Express",
          name: "Delta SkyMiles Gold Business American Express Card",
          _plaidAccountId: "live_delta",
        },
      ]);
      dbStore.set("bank-accounts", [
        { id: "demo-chk-1", bank: "Chase", name: "Chase Total Checking", accountType: "checking" },
        { id: "bank_live_1", bank: "Ally", name: "Primary Checking", accountType: "checking" },
      ]);
      dbStore.set("renewals", [
        { id: "demo-ren-1", name: "Netflix", chargedTo: "Checking", chargedToId: "" },
        {
          id: "ren_1",
          name: "Google AI Pro",
          chargedTo: "Amex Delta SkyMiles Biz Gold",
          chargedToId: "stale-local-id",
          source: "Ally→Delta Biz Gold",
        },
        {
          id: "ren_bank_1",
          name: "Rent",
          chargedTo: "Checking",
          chargedToType: "checking",
        },
      ]);

      const backup = await buildBackupPayload({ personalRules: "keep live cards only" });

      expect(backup.data["card-portfolio"]).toEqual([
        expect.objectContaining({ id: "plaid_live_delta" }),
      ]);
      expect(backup.data["bank-accounts"]).toEqual([
        expect.objectContaining({ id: "bank_live_1" }),
      ]);
      expect(backup.data.renewals).toEqual([
        expect.objectContaining({
          id: "ren_1",
          chargedToType: "card",
          chargedToId: "plaid_live_delta",
          chargedTo: "Delta SkyMiles Gold Business",
        }),
        expect.objectContaining({
          id: "ren_bank_1",
          chargedToType: "bank",
          chargedToId: "bank_live_1",
          chargedTo: "Ally · Primary Checking",
        }),
      ]);
    });
  });

  describe("buildBackupPayload", () => {
    it("reuses the shared backup payload builder and excludes transient QA flags", async () => {
      dbStore.set("financial-config", { income: 1000 });
      dbStore.set("full-profile-qa-seed-active", true);
      dbStore.set("personal-rules", "stay conservative");

      const backup = await buildBackupPayload({ personalRules: "unused fallback" });

      expect(backup.data["financial-config"]).toEqual({ income: 1000 });
      expect(backup.data["personal-rules"]).toBe("stay conservative");
      expect(backup.data["full-profile-qa-seed-active"]).toBeUndefined();
    });

    it("normalizes legacy paycheck budget buckets before export", async () => {
      dbStore.set("budget-lines-v2", [
        { id: "line_fixed", name: "Rent", amount: 900, bucket: "fixed", icon: "🏠" },
        { id: "line_flex", name: "Dining", amount: 120, bucket: "flex", icon: "🍔" },
      ]);

      const backup = await buildBackupPayload();

      expect(backup.data["budget-lines-v2"]).toEqual([
        expect.objectContaining({ id: "line_fixed", bucket: "bills" }),
        expect.objectContaining({ id: "line_flex", bucket: "needs", needsReview: true }),
      ]);
    });
  });

  describe("auto-backup policy", () => {
    it("limits daily backups to once per local calendar day", () => {
      const march26Morning = new Date(2026, 2, 26, 8, 0, 0).getTime();
      const march26Evening = new Date(2026, 2, 26, 20, 0, 0).getTime();
      const march27Morning = new Date(2026, 2, 27, 8, 0, 0).getTime();

      expect(shouldRunAutoBackup("daily", march26Morning, march26Evening)).toBe(false);
      expect(shouldRunAutoBackup("daily", march26Morning, march27Morning)).toBe(true);
    });

    it("blocks cloud backup when QA seed records coexist with linked banks", async () => {
      dbStore.set("card-portfolio", FULL_PROFILE_QA_CARDS);
      dbStore.set("bank-accounts", FULL_PROFILE_QA_BANKS);
      dbStore.set("renewals", FULL_PROFILE_QA_RENEWALS);
      dbStore.set("plaid-connections", [{ id: "conn_1", institutionName: "Chase", accounts: [] }]);

      await expect(getCloudBackupBlockReason()).resolves.toMatch(/seeded QA data/i);
    });
  });

  describe("importBackup", () => {
    it("rejects unsupported backup files early", async () => {
      await expect(importBackup({ name: "backup.heic", type: "image/heic" }, vi.fn())).rejects.toThrow(
        "Unsupported backup file — choose a Catalyst Cash .enc or .json backup."
      );
    });

    it("restores safe keys and merges sanitized plaid metadata as reconnect-required", async () => {
      dbStore.set("plaid-connections", [
        { id: "existing", institutionName: "Existing Bank", accounts: [] },
      ]);
      const backup = {
        app: "Catalyst Cash",
        exportedAt: "2026-03-15T15:00:00.000Z",
        data: {
          "financial-config": { budget: 500 },
          "household-id-protected": "should-not-import",
          "plaid-connections-sanitized": [
            { id: "existing", institutionName: "Existing Bank", accounts: [] },
            { id: "restored", institutionName: "Ally", accounts: [] },
          ],
        },
      };

      const result = await importBackup(
        {
          name: "CatalystCash_Backup_2026-03-15.json",
          type: "application/json",
          __text: JSON.stringify(backup),
        },
        vi.fn()
      );

      expect(result).toEqual({
        count: 3,
        exportedAt: "2026-03-15T15:00:00.000Z",
        plaidReconnectCount: 1,
      });
      expect(dbStore.get("financial-config")).toEqual({ budget: 500 });
      expect(dbStore.get("household-id-protected")).toBeUndefined();
      expect(dbStore.get("plaid-connections")).toEqual([
        { id: "existing", institutionName: "Existing Bank", accounts: [] },
        { id: "restored", institutionName: "Ally", accounts: [], _needsReconnect: true },
      ]);
    });

    it("forces auto backup back to off during import even if the backup had it enabled", async () => {
      dbStore.set("auto-backup-interval", "monthly");
      dbStore.set(LAST_CLOUD_BACKUP_TS_KEY, 123456789);
      dbStore.set(LAST_PORTABLE_BACKUP_TS_KEY, 123456789);
      dbStore.set(LAST_PORTABLE_BACKUP_KIND_KEY, "icloud");
      const backup = {
        app: "Catalyst Cash",
        exportedAt: "2026-03-15T15:00:00.000Z",
        data: {
          "financial-config": { budget: 500 },
          "auto-backup-interval": "daily",
          [LAST_CLOUD_BACKUP_TS_KEY]: 999999999,
        },
      };

      await importBackup(
        {
          name: "CatalystCash_Backup_2026-03-15.json",
          type: "application/json",
          __text: JSON.stringify(backup),
        },
        vi.fn()
      );

      expect(dbStore.get("financial-config")).toEqual({ budget: 500 });
      expect(dbStore.get("auto-backup-interval")).toBe("off");
      expect(dbStore.get(LAST_CLOUD_BACKUP_TS_KEY)).toBeUndefined();
      expect(dbStore.get(LAST_PORTABLE_BACKUP_TS_KEY)).toBeUndefined();
      expect(dbStore.get(LAST_PORTABLE_BACKUP_KIND_KEY)).toBeUndefined();
    });

    it("normalizes legacy paycheck budget buckets during restore without changing the storage key", async () => {
      const backup = {
        app: "Catalyst Cash",
        exportedAt: "2026-04-16T15:00:00.000Z",
        data: {
          "budget-lines-v2": [
            { id: "line_fixed", name: "Rent", amount: 900, bucket: "fixed", icon: "🏠" },
            { id: "line_flex", name: "Dining Out", amount: 120, bucket: "flex", icon: "🍔" },
            { id: "line_invest", name: "Emergency Fund", amount: 250, bucket: "invest", icon: "🎯" },
          ],
        },
      };

      await importBackup(
        {
          name: "CatalystCash_Backup_2026-04-16.json",
          type: "application/json",
          __text: JSON.stringify(backup),
        },
        vi.fn()
      );

      expect(dbStore.get("budget-lines-v2")).toEqual([
        expect.objectContaining({ id: "line_fixed", bucket: "bills" }),
        expect.objectContaining({ id: "line_flex", bucket: "needs", needsReview: true }),
        expect.objectContaining({ id: "line_invest", bucket: "savings" }),
      ]);
    });

    it("creates reconnect-ready placeholder accounts from sanitized plaid metadata", async () => {
      const backup = {
        app: "Catalyst Cash",
        exportedAt: "2026-03-26T15:00:00.000Z",
        data: {
          renewals: [
            {
              id: "ren_bank_1",
              name: "Acura Payment",
              chargedTo: "Savings",
              chargedToType: "savings",
              source: "Ally Savings",
            },
          ],
          "plaid-connections-sanitized": [
            {
              id: "restored_ally",
              institutionName: "Ally",
              accounts: [
                {
                  plaidAccountId: "ally_savings",
                  name: "Online Savings",
                  officialName: "Ally Online Savings",
                  type: "depository",
                  subtype: "savings",
                },
              ],
            },
          ],
        },
      };

      await importBackup(
        {
          name: "CatalystCash_CloudSync.json",
          type: "application/json",
          __text: JSON.stringify(backup),
        },
        vi.fn()
      );

      expect(dbStore.get("bank-accounts")).toEqual([
        expect.objectContaining({
          id: "plaid_ally_savings",
          bank: "Ally",
          name: "Ally Online Savings",
          accountType: "savings",
          _plaidConnectionId: "restored_ally",
          _plaidManualFallback: true,
        }),
      ]);
      expect(dbStore.get("renewals")).toEqual([
        expect.objectContaining({
          chargedToType: "bank",
          chargedToId: "plaid_ally_savings",
          chargedTo: "Ally · Ally Online Savings",
        }),
      ]);
    });

    it("does not duplicate placeholder accounts when the same sanitized plaid backup is restored twice", async () => {
      const backup = {
        app: "Catalyst Cash",
        exportedAt: "2026-03-26T15:00:00.000Z",
        data: {
          "plaid-connections-sanitized": [
            {
              id: "restored_ally",
              institutionName: "Ally",
              accounts: [
                {
                  plaidAccountId: "ally_savings",
                  name: "Online Savings",
                  officialName: "Ally Online Savings",
                  type: "depository",
                  subtype: "savings",
                },
              ],
            },
          ],
        },
      };

      const file = {
        name: "CatalystCash_CloudSync.json",
        type: "application/json",
        __text: JSON.stringify(backup),
      };

      await importBackup(file, vi.fn());
      await importBackup(file, vi.fn());

      expect(dbStore.get("plaid-connections")).toEqual([
        expect.objectContaining({
          id: "restored_ally",
          _needsReconnect: true,
        }),
      ]);
      expect(dbStore.get("bank-accounts")).toEqual([
        expect.objectContaining({
          id: "plaid_ally_savings",
          _plaidConnectionId: "restored_ally",
        }),
      ]);
    });

    it("sanitizes legacy demo portfolio payloads during restore", async () => {
      const backup = {
        app: "Catalyst Cash",
        exportedAt: "2026-03-26T15:00:00.000Z",
        data: {
          "card-portfolio": [
            { id: "demo-card-1", institution: "Chase", name: "Chase Sapphire Preferred" },
            {
              id: "plaid_live_delta",
              institution: "American Express",
              name: "Delta SkyMiles Gold Business American Express Card",
              _plaidAccountId: "live_delta",
            },
          ],
          "bank-accounts": [
            { id: "demo-chk-1", bank: "Chase", name: "Chase Total Checking", accountType: "checking" },
            { id: "bank_live_1", bank: "Ally", name: "Primary Checking", accountType: "checking" },
          ],
          "renewals": [
            {
              id: "ren_1",
              name: "Google AI Pro",
              chargedTo: "Amex Delta SkyMiles Biz Gold",
              chargedToId: "stale-local-id",
              source: "Ally→Delta Biz Gold",
            },
            {
              id: "ren_bank_1",
              name: "Rent",
              chargedTo: "Checking",
              chargedToType: "checking",
            },
          ],
        },
      };

      await importBackup(
        {
          name: "CatalystCash_CloudSync.json",
          type: "application/json",
          __text: JSON.stringify(backup),
        },
        vi.fn()
      );

      expect(dbStore.get("card-portfolio")).toEqual([
        expect.objectContaining({ id: "plaid_live_delta" }),
      ]);
      expect(dbStore.get("bank-accounts")).toEqual([
        expect.objectContaining({ id: "bank_live_1" }),
      ]);
      expect(dbStore.get("renewals")).toEqual([
        expect.objectContaining({
          id: "ren_1",
          chargedToType: "card",
          chargedToId: "plaid_live_delta",
          chargedTo: "Delta SkyMiles Gold Business",
        }),
        expect.objectContaining({
          id: "ren_bank_1",
          chargedToType: "bank",
          chargedToId: "bank_live_1",
          chargedTo: "Ally · Primary Checking",
        }),
      ]);
    });

    it("decrypts encrypted backups before importing", async () => {
      decrypt.mockResolvedValueOnce(
        JSON.stringify({
          app: "Catalyst Cash",
          exportedAt: "2026-03-15T15:00:00.000Z",
          data: {
            "financial-config": { restored: true },
          },
        })
      );

      const result = await importBackup(
        {
          name: "CatalystCash_Backup_2026-03-15.enc",
          type: "application/octet-stream",
          __text: JSON.stringify({ __encrypted: true, ciphertext: "abc" }),
        },
        async () => "passphrase"
      );

      expect(result.count).toBe(1);
      expect(decrypt).toHaveBeenCalledTimes(1);
      expect(dbStore.get("financial-config")).toEqual({ restored: true });
    });
  });

  describe("sanitizeBackupPortfolioData", () => {
    it("removes demo records even before persistence", () => {
      const result = sanitizeBackupPortfolioData({
        cards: [{ id: "demo-card-1" }, { id: "live-card-1" }],
        bankAccounts: [{ id: "demo-chk-1" }, { id: "bank-1" }],
        renewals: [{ id: "demo-ren-1", chargedTo: "Checking" }, { id: "ren-1", chargedTo: "Checking" }],
      });

      expect(result.cards).toEqual([{ id: "live-card-1" }]);
      expect(result.bankAccounts).toEqual([{ id: "bank-1" }]);
      expect(result.renewals).toEqual([{ id: "ren-1", chargedTo: "Checking", chargedToType: "checking" }]);
    });
  });
});
