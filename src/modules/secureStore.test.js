import { afterEach, describe, expect, it, vi } from "vitest";

function createPreferencesMock(initial = {}) {
  const store = new Map(Object.entries(initial).map(([key, value]) => [key, value]));
  return {
    store,
    api: {
      get: vi.fn(async ({ key }) => ({ value: store.has(key) ? store.get(key) : null })),
      set: vi.fn(async ({ key, value }) => {
        store.set(key, value);
      }),
      remove: vi.fn(async ({ key }) => {
        store.delete(key);
      }),
    },
  };
}

async function loadSecureStore({ native, plugin = null, initialPrefs = {} }) {
  vi.resetModules();
  const preferences = createPreferencesMock(initialPrefs);
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  vi.doMock("@capacitor/core", () => ({
    Capacitor: {
      isNativePlatform: () => native,
    },
  }));
  vi.doMock("@capacitor/preferences", () => ({
    Preferences: preferences.api,
  }));
  vi.doMock("capacitor-secure-storage-plugin", () => ({
    SecureStoragePlugin: plugin,
  }));

  const mod = await import("./secureStore.js");
  return {
    mod,
    preferences,
    consoleError,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  delete globalThis.window;
  delete globalThis.__E2E_SECURE_STORE__;
});

describe("secureStore", () => {
  it("uses native secure storage when available", async () => {
    const nativeStore = new Map();
    const plugin = {
      get: vi.fn(async ({ key }) => ({ value: nativeStore.get(key) ?? null })),
      set: vi.fn(async ({ key, value }) => {
        nativeStore.set(key, value);
      }),
      remove: vi.fn(async ({ key }) => {
        nativeStore.delete(key);
      }),
    };
    const { mod, preferences } = await loadSecureStore({ native: true, plugin });

    expect(await mod.setSecureItem("app-passcode", "1234")).toBe(true);
    expect(plugin.set).toHaveBeenCalledWith({ key: "app-passcode", value: JSON.stringify("1234") });
    expect(preferences.api.set).not.toHaveBeenCalled();

    await expect(mod.getSecureItem("app-passcode")).resolves.toBe("1234");
    await mod.deleteSecureItem("app-passcode");
    expect(plugin.remove).toHaveBeenCalledWith({ key: "app-passcode" });

    await expect(mod.getSecretStorageStatus()).resolves.toMatchObject({
      mode: "native-secure",
      canPersistSecrets: true,
      isHardwareBacked: true,
    });
  });

  it("fails closed on native when secure storage is unavailable", async () => {
    const { mod, preferences, consoleError } = await loadSecureStore({ native: true, plugin: null });
    const removeLegacy = vi.fn(async () => {});

    await expect(mod.setSecureItem("app-passcode", "1234")).resolves.toBe(false);
    await expect(mod.getSecureItem("app-passcode")).resolves.toBeNull();
    expect(preferences.api.set).not.toHaveBeenCalled();
    expect(await mod.migrateToSecureItem("app-passcode", "1234", removeLegacy)).toBeNull();
    expect(removeLegacy).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledTimes(1);

    await expect(mod.getSecretStorageStatus()).resolves.toMatchObject({
      mode: "native-unavailable",
      canPersistSecrets: false,
      isHardwareBacked: false,
    });
  });

  it("fails closed for secret persistence on web while staying quiet", async () => {
    const { mod, preferences, consoleError } = await loadSecureStore({ native: false, plugin: null });

    await expect(mod.setSecureItem("api-key-openai", "sk-test")).resolves.toBe(false);
    expect(preferences.api.set).not.toHaveBeenCalled();
    await expect(mod.getSecureItem("api-key-openai")).resolves.toBeNull();
    await expect(mod.deleteSecureItem("api-key-openai")).resolves.toBe(true);
    expect(preferences.api.remove).toHaveBeenCalledWith({ key: "secure:api-key-openai" });
    expect(consoleError).not.toHaveBeenCalled();

    await expect(mod.getSecretStorageStatus()).resolves.toMatchObject({
      mode: "web-limited",
      canPersistSecrets: false,
      isHardwareBacked: false,
    });
  });

  it("supports the test-only native secure store override without relaxing normal web behavior", async () => {
    const pluginStore = new Map();
    const override = {
      enabled: true,
      plugin: {
        get: vi.fn(async ({ key }) => ({ value: pluginStore.get(key) ?? null })),
        set: vi.fn(async ({ key, value }) => {
          pluginStore.set(key, value);
          return { value: true };
        }),
        remove: vi.fn(async ({ key }) => {
          pluginStore.delete(key);
          return { value: true };
        }),
      },
    };
    globalThis.__E2E_SECURE_STORE__ = override;
    globalThis.window = {
      __E2E_SECURE_STORE__: override,
    };

    const { mod } = await loadSecureStore({ native: false, plugin: null });

    await expect(mod.setSecureItem("app-passcode", "2468")).resolves.toBe(true);
    await expect(mod.getSecureItem("app-passcode")).resolves.toBe("2468");
    await expect(mod.getSecretStorageStatus()).resolves.toMatchObject({
      mode: "native-secure",
      canPersistSecrets: true,
      isHardwareBacked: true,
    });
    await expect(mod.deleteSecureItem("app-passcode")).resolves.toBe(true);
    await expect(mod.getSecureItem("app-passcode")).resolves.toBeNull();
  });
});
