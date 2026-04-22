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
      isPluginAvailable: (name) => name === "SecureStoragePlugin" && Boolean(plugin),
      Plugins: plugin ? { SecureStoragePlugin: plugin } : {},
    },
    registerPlugin: () => plugin ?? {},
  }));
  vi.doMock("@capacitor/preferences", () => ({
    Preferences: preferences.api,
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
  delete globalThis.__E2E_SECURE_STORE_TIMEOUT_MS__;
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
    expect(preferences.api.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ key: "secure:app-passcode" })
    );
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

  it("fails fast when the native secure storage bridge hangs", async () => {
    globalThis.__E2E_SECURE_STORE_TIMEOUT_MS__ = 5;
    const plugin = {
      get: vi.fn(() => new Promise(() => {})),
      set: vi.fn(() => new Promise(() => {})),
      remove: vi.fn(() => new Promise(() => {})),
    };
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { mod, consoleError } = await loadSecureStore({ native: true, plugin });

    await expect(mod.getSecretStorageStatus()).resolves.toMatchObject({
      mode: "native-checking",
      canPersistSecrets: true,
      isHardwareBacked: true,
    });
    await expect(mod.setSecureItem("app-passcode", "1234")).resolves.toBe(false);
    await expect(mod.getSecureItem("app-passcode")).resolves.toBeNull();
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleWarn).toHaveBeenCalled();
  });

  it("recovers cleanly after an initial status timeout without poisoning later native calls", async () => {
    globalThis.__E2E_SECURE_STORE_TIMEOUT_MS__ = 5;
    const nativeStore = new Map();
    let firstGetAttempt = true;
    const plugin = {
      get: vi.fn(({ key }) => {
        if (firstGetAttempt) {
          firstGetAttempt = false;
          return new Promise(() => {});
        }
        return Promise.resolve({ value: nativeStore.get(key) ?? null });
      }),
      set: vi.fn(({ key, value }) => {
        nativeStore.set(key, value);
        return Promise.resolve({ value: true });
      }),
      remove: vi.fn(async ({ key }) => {
        nativeStore.delete(key);
        return { value: true };
      }),
    };

    const { mod } = await loadSecureStore({ native: true, plugin });

    await expect(mod.getSecretStorageStatus()).resolves.toMatchObject({
      mode: "native-secure",
      canPersistSecrets: true,
      isHardwareBacked: true,
    });
    await expect(mod.setSecureItem("app-passcode", "2468")).resolves.toBe(true);
    await expect(mod.getSecureItem("app-passcode")).resolves.toBe("2468");
  });

  it("negative-caches missing native keys to avoid repeated bridge misses", async () => {
    const plugin = {
      keys: vi.fn(async () => ({ value: [] })),
      get: vi.fn(async () => {
        throw new Error("Item with given key does not exist");
      }),
      set: vi.fn(async () => ({ value: true })),
      remove: vi.fn(async () => ({ value: true })),
    };

    const { mod } = await loadSecureStore({ native: true, plugin });

    await expect(mod.getSecureItem("apple-linked-id")).resolves.toBeNull();
    await expect(mod.getSecureItem("apple-linked-id")).resolves.toBeNull();

    expect(plugin.get).not.toHaveBeenCalled();
    expect(plugin.keys).toHaveBeenCalledTimes(1);
  });

  it("skips native remove calls when the key cache already knows an item is missing", async () => {
    const plugin = {
      keys: vi.fn(async () => ({ value: [] })),
      get: vi.fn(async () => {
        throw new Error("Item with given key does not exist");
      }),
      set: vi.fn(async () => ({ value: true })),
      remove: vi.fn(async () => ({ value: true })),
    };

    const { mod } = await loadSecureStore({ native: true, plugin });

    await expect(mod.getSecureItem("identity-session")).resolves.toBeNull();
    await expect(mod.deleteSecureItem("identity-session")).resolves.toBe(true);
    await expect(mod.deleteNativeSecureItem("identity-session")).resolves.toBe(true);

    expect(plugin.remove).not.toHaveBeenCalled();
    expect(plugin.keys).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent native reads for the same missing key", async () => {
    let release;
    const started = new Promise(resolve => {
      release = resolve;
    });
    const plugin = {
      get: vi.fn(async ({ key }) => {
        if (String(key).startsWith("__cc_secure_probe__")) {
          throw new Error("Item with given key does not exist");
        }
        await started;
        throw new Error("Item with given key does not exist");
      }),
      set: vi.fn(async () => ({ value: true })),
      remove: vi.fn(async () => ({ value: true })),
    };

    const { mod } = await loadSecureStore({ native: true, plugin });

    const reads = Promise.all([
      mod.getNativeSecureItem("identity-session"),
      mod.getNativeSecureItem("identity-session"),
      mod.getNativeSecureItem("identity-session"),
    ]);
    release();

    await expect(reads).resolves.toEqual([null, null, null]);
    expect(plugin.get).toHaveBeenCalledTimes(1);
  });
});
