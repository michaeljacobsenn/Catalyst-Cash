import { afterEach, describe, expect, it, vi } from "vitest";

async function loadHouseholdSecrets({ nativeSecure = false, dbState = {} } = {}) {
  vi.resetModules();
  const store = new Map(Object.entries(dbState));

  vi.doMock("./secureStore.js", () => ({
    hasNativeSecureStore: vi.fn(async () => nativeSecure),
    getNativeSecureItem: vi.fn(async () => null),
    setNativeSecureItem: vi.fn(async () => true),
    deleteNativeSecureItem: vi.fn(async () => true),
  }));
  vi.doMock("./utils.js", () => ({
    db: {
      get: vi.fn(async (key) => (store.has(key) ? store.get(key) : null)),
      set: vi.fn(async (key, value) => {
        store.set(key, value);
      }),
      del: vi.fn(async (key) => {
        store.delete(key);
      }),
    },
  }));

  const mod = await import("./householdSecrets.js");
  const utils = await import("./utils.js");
  return { mod, utils };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("householdSecrets", () => {
  it("fails closed on web/native-unavailable and clears legacy household secrets", async () => {
    const { mod, utils } = await loadHouseholdSecrets({
      nativeSecure: false,
      dbState: {
        "household-id": "FamilyOne",
        "household-passcode": "Secret123",
        "household-id-protected": "legacy",
        "household-passcode-protected": "legacy",
      },
    });

    await expect(mod.canPersistHouseholdCredentials()).resolves.toBe(false);
    await expect(mod.migrateHouseholdCredentials()).resolves.toEqual({ householdId: "", passcode: "" });
    await expect(mod.getHouseholdCredentials()).resolves.toEqual({ householdId: "", passcode: "" });

    expect(utils.db.del).toHaveBeenCalledWith("household-id");
    expect(utils.db.del).toHaveBeenCalledWith("household-passcode");
    expect(utils.db.del).toHaveBeenCalledWith("household-id-protected");
    expect(utils.db.del).toHaveBeenCalledWith("household-passcode-protected");
  });

  it("stores household credentials only in native secure storage when available", async () => {
    const nativeStore = new Map();
    vi.resetModules();
    vi.doMock("./secureStore.js", () => ({
      hasNativeSecureStore: vi.fn(async () => true),
      getNativeSecureItem: vi.fn(async (key) => nativeStore.get(key) ?? null),
      setNativeSecureItem: vi.fn(async (key, value) => {
        nativeStore.set(key, value);
        return true;
      }),
      deleteNativeSecureItem: vi.fn(async (key) => {
        nativeStore.delete(key);
        return true;
      }),
    }));
    vi.doMock("./utils.js", () => ({
      db: {
        get: vi.fn(async () => null),
        del: vi.fn(async () => {}),
      },
    }));

    const mod = await import("./householdSecrets.js");
    await expect(mod.setHouseholdCredentials("FamilyOne", "Secret123")).resolves.toEqual({
      householdId: "FamilyOne",
      passcode: "Secret123",
    });
  });
});
