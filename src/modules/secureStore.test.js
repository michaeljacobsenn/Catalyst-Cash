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

  it("degrades cleanly to browser-backed storage on web", async () => {
    const { mod, preferences, consoleError } = await loadSecureStore({ native: false, plugin: null });

    await expect(mod.setSecureItem("api-key-openai", "sk-test")).resolves.toBe(true);
    expect(preferences.api.set).toHaveBeenCalledWith({
      key: "secure:api-key-openai",
      value: JSON.stringify("sk-test"),
    });
    await expect(mod.getSecureItem("api-key-openai")).resolves.toBe("sk-test");
    await expect(mod.deleteSecureItem("api-key-openai")).resolves.toBe(true);
    expect(preferences.api.remove).toHaveBeenCalledWith({ key: "secure:api-key-openai" });
    expect(consoleError).not.toHaveBeenCalled();

    await expect(mod.getSecretStorageStatus()).resolves.toMatchObject({
      mode: "web-fallback",
      canPersistSecrets: true,
      isHardwareBacked: false,
    });
  });
});
