import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { log } from "./logger.js";

const FALLBACK_PREFIX = "secure:";
let securePluginPromise = null;
let nativeAvailabilityWarningShown = false;

function getTestSecureStoreOverride() {
  const override =
    (typeof globalThis !== "undefined" && globalThis.__E2E_SECURE_STORE__) ||
    (typeof window !== "undefined" && window.__E2E_SECURE_STORE__);
  if (!override || override.enabled !== true) return null;
  return override;
}

function getTestSecurityStatusOverride() {
  const override =
    (typeof globalThis !== "undefined" && globalThis.__E2E_SECURITY_STATE__) ||
    (typeof window !== "undefined" && window.__E2E_SECURITY_STATE__);
  if (!override?.storageStatus) return null;
  return override.storageStatus;
}

function hasSecureStorageRuntime() {
  return Capacitor.isNativePlatform() || Boolean(getTestSecureStoreOverride());
}

function serialize(value) {
  return JSON.stringify(value);
}

function deserialize(value) {
  if (value == null || value === "") return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function getPlugin() {
  if (securePluginPromise) return securePluginPromise;
  const testOverride = getTestSecureStoreOverride();
  if (testOverride?.plugin) {
    securePluginPromise = Promise.resolve(testOverride.plugin);
    return securePluginPromise;
  }
  if (!Capacitor.isNativePlatform()) {
    securePluginPromise = Promise.resolve(null);
    return securePluginPromise;
  }
  securePluginPromise = Promise.race([
    import("capacitor-secure-storage-plugin")
      .then(mod => mod.SecureStoragePlugin || mod.default?.SecureStoragePlugin || mod.default || null)
      .catch(() => null),
    new Promise(resolve => setTimeout(() => resolve(null), 3000)), // 3s timeout — never hang
  ]).then(plugin => {
    if (!plugin && Capacitor.isNativePlatform() && !nativeAvailabilityWarningShown) {
      nativeAvailabilityWarningShown = true;
      void log.error(
        "secure-store",
        "Native secure storage unavailable",
        {
          platform: "native",
          canPersistSecrets: false,
        }
      );
    }
    return plugin;
  });
  return securePluginPromise;
}

async function getNativePluginOnly() {
  const plugin = await getPlugin();
  return plugin || null;
}

async function removeFallback(key) {
  const prefKey = `${FALLBACK_PREFIX}${key}`;
  try {
    await Preferences.remove({ key: prefKey });
  } catch {
    try {
      localStorage.removeItem(prefKey);
    } catch {
      // Local cleanup is best-effort only.
    }
  }
}

export async function getSecureItem(key) {
  if (!hasSecureStorageRuntime()) {
    return null;
  }

  const plugin = await getPlugin();
  if (plugin) {
    try {
      const result = await plugin.get({ key });
      return deserialize(result?.value);
    } catch {
      // Native plugin get failures should not leak or fall through to insecure storage.
    }
  }
  return null;
}

export async function getNativeSecureItem(key) {
  const plugin = await getNativePluginOnly();
  if (!plugin) return null;
  try {
    const result = await plugin.get({ key });
    return deserialize(result?.value);
  } catch {
    return null;
  }
}

export async function setSecureItem(key, value) {
  if (!hasSecureStorageRuntime()) {
    await removeFallback(key);
    return false;
  }

  const plugin = await getPlugin();
  const serialized = serialize(value);
  if (plugin) {
    try {
      await plugin.set({ key, value: serialized });
      return true;
    } catch {
      // Native secret persistence fails closed on native platforms.
    }
  }
  await removeFallback(key);
  return false;
}

export async function setNativeSecureItem(key, value) {
  const plugin = await getNativePluginOnly();
  if (!plugin) return false;
  try {
    await plugin.set({ key, value: serialize(value) });
    return true;
  } catch {
    return false;
  }
}

export async function deleteSecureItem(key) {
  if (!hasSecureStorageRuntime()) {
    await removeFallback(key);
    return true;
  }

  const plugin = await getPlugin();
  if (plugin) {
    try {
      await plugin.remove({ key });
    } catch {
      await removeFallback(key);
      return false;
    }
  }
  await removeFallback(key);
  return Boolean(plugin);
}

export async function deleteNativeSecureItem(key) {
  const plugin = await getNativePluginOnly();
  if (!plugin) return false;
  try {
    await plugin.remove({ key });
    return true;
  } catch {
    return false;
  }
}

export async function migrateToSecureItem(key, legacyValue, removeLegacy) {
  const existing = await getSecureItem(key);
  if (existing != null && existing !== "") return existing;
  if (legacyValue == null || legacyValue === "") return existing;

  const saved = await setSecureItem(key, legacyValue);
  if (typeof removeLegacy === "function") {
    await removeLegacy();
  }
  return saved ? legacyValue : null;
}

export function secureStoreUsesNativeKeychain() {
  return hasSecureStorageRuntime();
}

export async function hasNativeSecureStore() {
  return Boolean(await getNativePluginOnly());
}

export async function getSecretStorageStatus() {
  const statusOverride = getTestSecurityStatusOverride();
  if (statusOverride) {
    return statusOverride;
  }

  if (getTestSecureStoreOverride()?.plugin) {
    return {
      platform: "native",
      available: true,
      mode: "native-secure",
      canPersistSecrets: true,
      isHardwareBacked: true,
      message: "",
    };
  }

  if (!Capacitor.isNativePlatform()) {
    return {
      platform: "web",
      available: false,
      mode: "web-limited",
      canPersistSecrets: false,
      isHardwareBacked: false,
      message:
        "Browser storage is not treated as secure storage. App Lock, linked identity, cloud sync credentials, and other secrets are available only in the native iPhone app.",
    };
  }

  const available = Boolean(await getNativePluginOnly());
  if (available) {
    return {
      platform: "native",
      available: true,
      mode: "native-secure",
      canPersistSecrets: true,
      isHardwareBacked: true,
      message: "",
    };
  }

  return {
    platform: "native",
    available: false,
    mode: "native-unavailable",
    canPersistSecrets: false,
    isHardwareBacked: false,
    message:
      "Secure iOS storage is unavailable. App passcodes, linked identity, API keys, and device secrets will not be persisted until native secure storage is restored.",
  };
}
