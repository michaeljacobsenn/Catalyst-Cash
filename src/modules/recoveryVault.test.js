import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dbStore,
  secretStore,
  buildBackupPayload,
  restoreBackupPayload,
  encrypt,
  decrypt,
  trackSupportEvent,
  buildIdentityHeaders,
  getIdentitySession,
} = vi.hoisted(() => ({
  dbStore: new Map(),
  secretStore: new Map(),
  buildBackupPayload: vi.fn(async () => ({
    app: "Catalyst Cash",
    exportedAt: "2026-03-13T12:00:00.000Z",
    data: { "financial-config": { budget: 500 } },
  })),
  restoreBackupPayload: vi.fn(async (payload) => ({
    count: Object.keys(payload.data || {}).length,
    exportedAt: payload.exportedAt,
    plaidReconnectCount: 0,
  })),
  encrypt: vi.fn(async (plaintext) => ({ __ciphertext: plaintext })),
  decrypt: vi.fn(async (envelope) => envelope.__ciphertext || ""),
  trackSupportEvent: vi.fn(async () => {}),
  buildIdentityHeaders: vi.fn(async (headers = {}) => ({
    Authorization: "Bearer identity-token",
    ...headers,
  })),
  getIdentitySession: vi.fn(async () => ({
    actorId: "actor_test_123",
    token: "identity-token",
  })),
}));

vi.mock("./utils.js", () => ({
  db: {
    get: vi.fn(async (key) => (dbStore.has(key) ? dbStore.get(key) : null)),
    set: vi.fn(async (key, value) => {
      dbStore.set(key, value);
    }),
    del: vi.fn(async (key) => {
      dbStore.delete(key);
    }),
  },
}));

vi.mock("./secureStore.js", () => ({
  getSecretStorageStatus: vi.fn(async () => ({
    canPersistSecrets: true,
    message: "",
  })),
  getSecureItem: vi.fn(async (key) => (secretStore.has(key) ? secretStore.get(key) : null)),
  setSecureItem: vi.fn(async (key, value) => {
    secretStore.set(key, value);
    return true;
  }),
  deleteSecureItem: vi.fn(async (key) => {
    secretStore.delete(key);
    return true;
  }),
}));

vi.mock("./backup.js", () => ({
  buildBackupPayload,
  restoreBackupPayload,
}));

vi.mock("./crypto.js", () => ({
  encrypt,
  decrypt,
}));

vi.mock("./backendUrl.js", () => ({
  getBackendUrl: vi.fn(() => "https://api.catalystcash.app"),
}));

vi.mock("./funnelAnalytics.js", () => ({
  trackSupportEvent,
}));

vi.mock("./identitySession.js", () => ({
  buildIdentityHeaders,
  getIdentitySession,
}));

import {
  createRecoveryVaultCredentials,
  fetchRecoveryVaultBackup,
  formatRecoveryVaultKit,
  getRecoveryVaultContinuityState,
  getLinkedRecoveryVaultId,
  getRecoveryVaultState,
  enableRecoveryVaultContinuity,
  enableTrustedRecoveryVaultContinuity,
  linkRecoveryVaultToIdentity,
  parseRecoveryVaultKit,
  recordRecoveryVaultFailure,
  restoreRecoveryVaultFromContinuity,
  restoreRecoveryVaultFromTrustedContinuity,
  pushRecoveryVault,
  syncConfiguredRecoveryVault,
} from "./recoveryVault.js";

describe("recoveryVault", () => {
  beforeEach(() => {
    dbStore.clear();
    secretStore.clear();
    vi.restoreAllMocks();
  });

  it("creates secure credentials and syncs an encrypted backup snapshot", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })));

    const { recoveryId, recoveryKey } = await createRecoveryVaultCredentials();
    const result = await pushRecoveryVault({
      recoveryId,
      recoveryKey,
      personalRules: "stay conservative",
    });

    expect(result.ok).toBe(true);
    expect(secretStore.get("recovery-vault-secret")).toBe(recoveryKey);
    expect(dbStore.get("recovery-vault-id")).toBe(recoveryId);
    expect(dbStore.get("recovery-vault-last-sync-ts")).toBeTypeOf("number");
    expect(buildBackupPayload).toHaveBeenCalledWith({ personalRules: "stay conservative" });
  });

  it("fetches and decrypts a recovery vault backup", async () => {
    const backupPayload = {
      app: "Catalyst Cash",
      exportedAt: "2026-03-13T12:00:00.000Z",
      data: { "financial-config": { restored: true } },
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      hasData: true,
      encryptedBlob: JSON.stringify({ __ciphertext: JSON.stringify(backupPayload) }),
    }), { status: 200 })));

    const result = await fetchRecoveryVaultBackup("CC-ABCDE-FGHIJ", "ABCD-EFGH-IJKL-MNOP");
    expect(result).toEqual(backupPayload);
  });

  it("syncs using stored credentials and exposes local state", async () => {
    dbStore.set("recovery-vault-id", "CC-ABCDE-FGHIJ");
    secretStore.set("recovery-vault-secret", "ABCD-EFGH-IJKL-MNOP");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })));

    await syncConfiguredRecoveryVault("protect cash");
    const state = await getRecoveryVaultState();

    expect(state.recoveryId).toBe("CC-ABCDE-FGHIJ");
    expect(state.lastSyncedAt).toBeTypeOf("number");
  });

  it("records recovery vault failures with support telemetry", async () => {
    const failure = await recordRecoveryVaultFailure(new Error("vault exploded"), {
      eventName: "recovery_restore_failed",
      context: { source: "wizard" },
    });

    expect(failure.kind).toBeTruthy();
    expect(trackSupportEvent).toHaveBeenCalledWith(
      "recovery_restore_failed",
      expect.objectContaining({ source: "wizard", kind: failure.kind })
    );
    expect(dbStore.get("recovery-vault-last-error")).toBeTruthy();
  });

  it("formats and parses a Recovery Kit", () => {
    const recoveryKit = formatRecoveryVaultKit({
      recoveryId: "cc-abcde-fghij",
      recoveryKey: "abcd-efgh-ijkl-mnop-qrst",
    });

    expect(recoveryKit).toContain("Recovery Vault ID: CC-ABCDE-FGHIJ");
    expect(recoveryKit).toContain("Recovery Key: ABCD-EFGH-IJKL-MNOP-QRST");
    expect(parseRecoveryVaultKit(recoveryKit)).toEqual({
      recoveryId: "CC-ABCDE-FGHIJ",
      recoveryKey: "ABCD-EFGH-IJKL-MNOP-QRST",
    });
  });

  it("links and fetches a linked recovery vault id through the identity session", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      if (init?.method === "POST") {
        expect(init.headers).toMatchObject({
          Authorization: "Bearer identity-token",
          "Content-Type": "application/json",
        });
        expect(JSON.parse(String(init.body))).toEqual({ recoveryId: "CC-ABCDE-FGHIJ" });
        return new Response(JSON.stringify({ success: true, recoveryId: "CC-ABCDE-FGHIJ" }), { status: 200 });
      }

      expect(init?.headers).toMatchObject({ Authorization: "Bearer identity-token" });
      return new Response(JSON.stringify({ recoveryId: "CC-ABCDE-FGHIJ" }), { status: 200 });
    }));

    await expect(linkRecoveryVaultToIdentity("cc-abcde-fghij")).resolves.toBe("CC-ABCDE-FGHIJ");
    await expect(getLinkedRecoveryVaultId()).resolves.toBe("CC-ABCDE-FGHIJ");
  });

  it("stores encrypted continuity escrow and restores through identity plus passphrase", async () => {
    const backupPayload = {
      app: "Catalyst Cash",
      exportedAt: "2026-03-13T12:00:00.000Z",
      data: { "financial-config": { restored: true } },
    };

    secretStore.set("recovery-vault-secret", "ABCD-EFGH-IJKL-MNOP");

    vi.stubGlobal("fetch", vi.fn(async (_input, init) => {
      if (String(_input).includes("/api/recovery-vault/continuity")) {
        if (init?.method === "POST") {
          return new Response(JSON.stringify({ success: true, recoveryId: "CC-ABCDE-FGHIJ", hasEscrow: true }), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            recoveryId: "CC-ABCDE-FGHIJ",
            hasEscrow: true,
            encryptedRecoveryKey: JSON.stringify(
              await encrypt("ABCD-EFGH-IJKL-MNOP", "actor_test_123:correct horse battery")
            ),
          }),
          { status: 200 }
        );
      }

      return new Response(
        JSON.stringify({
          hasData: true,
          encryptedBlob: JSON.stringify({ __ciphertext: JSON.stringify(backupPayload) }),
        }),
        { status: 200 }
      );
    }));

    await expect(
      enableRecoveryVaultContinuity("correct horse battery", "CC-ABCDE-FGHIJ", "ABCD-EFGH-IJKL-MNOP")
    ).resolves.toMatchObject({ recoveryId: "CC-ABCDE-FGHIJ", hasEscrow: true });

    await expect(getRecoveryVaultContinuityState()).resolves.toMatchObject({
      recoveryId: "CC-ABCDE-FGHIJ",
      hasEscrow: true,
      hasStoredPassphrase: true,
    });

    await expect(restoreRecoveryVaultFromContinuity("correct horse battery")).resolves.toMatchObject({
      recoveryId: "CC-ABCDE-FGHIJ",
      recoveryKey: "ABCD-EFGH-IJKL-MNOP",
      backup: backupPayload,
    });
  });

  it("stores seamless trusted continuity and restores through the identity session only", async () => {
    const backupPayload = {
      app: "Catalyst Cash",
      exportedAt: "2026-03-13T12:00:00.000Z",
      data: { "financial-config": { restored: "trusted" } },
    };

    vi.stubGlobal("fetch", vi.fn(async (_input, init) => {
      if (String(_input).includes("/api/recovery-vault/continuity/trusted")) {
        if (init?.method === "POST") {
          expect(JSON.parse(String(init.body))).toEqual({
            recoveryId: "CC-ABCDE-FGHIJ",
            recoveryKey: "ABCD-EFGH-IJKL-MNOP",
          });
          return new Response(JSON.stringify({ success: true, recoveryId: "CC-ABCDE-FGHIJ", hasTrustedEscrow: true }), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            recoveryId: "CC-ABCDE-FGHIJ",
            hasTrustedEscrow: true,
            trustedRecoveryKey: "ABCD-EFGH-IJKL-MNOP",
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({
        hasData: true,
        encryptedBlob: JSON.stringify({ __ciphertext: JSON.stringify(backupPayload) }),
      }), { status: 200 });
    }));

    await expect(enableTrustedRecoveryVaultContinuity("CC-ABCDE-FGHIJ", "ABCD-EFGH-IJKL-MNOP")).resolves.toMatchObject({
      recoveryId: "CC-ABCDE-FGHIJ",
      hasTrustedEscrow: true,
    });
    await expect(restoreRecoveryVaultFromTrustedContinuity()).resolves.toMatchObject({
      recoveryId: "CC-ABCDE-FGHIJ",
      recoveryKey: "ABCD-EFGH-IJKL-MNOP",
      backup: backupPayload,
    });
  });
});
