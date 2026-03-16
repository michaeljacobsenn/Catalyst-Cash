import { beforeEach, describe, expect, it, vi } from "vitest";

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
  },
  nativeExport,
}));

vi.mock("./crypto.js", () => ({
  encrypt,
  decrypt,
  isEncrypted,
}));

import { exportBackup, importBackup, isSupportedBackupFile, mergeUniqueById } from "./backup.js";

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
});
