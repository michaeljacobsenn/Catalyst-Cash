import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const FALLBACK_PREFIX = "secure:";
let securePluginPromise = null;
let nativeAvailabilityWarningShown = false;

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
  if (!Capacitor.isNativePlatform()) {
    securePluginPromise = Promise.resolve(null);
    return securePluginPromise;
  }
  securePluginPromise = Promise.race([
    import("capacitor-secure-storage-plugin")
      .then(mod => mod.SecureStoragePlugin || mod.default?.SecureStoragePlugin || mod.default || null)
      .catch((e) => null),
    new Promise(resolve => setTimeout(() => resolve(null), 3000)), // 3s timeout — never hang
  ]).then(plugin => {
    if (!plugin && Capacitor.isNativePlatform() && !nativeAvailabilityWarningShown) {
      nativeAvailabilityWarningShown = true;
      console.error(
        "[SecureStore] Native secure storage is unavailable. Sensitive secrets will not be persisted until " +
        "capacitor-secure-storage-plugin is installed and synced."
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

async function getFallback(key) {
  const prefKey = `${FALLBACK_PREFIX}${key}`;
  try {
    const { value } = await Preferences.get({ key: prefKey });
    return deserialize(value);
  } catch {
    try {
      return deserialize(localStorage.getItem(prefKey));
    } catch {
      return null;
    }
  }
}

async function setFallback(key, value) {
  const prefKey = `${FALLBACK_PREFIX}${key}`;
  const serialized = serialize(value);
  try {
    await Preferences.set({ key: prefKey, value: serialized });
    return true;
  } catch {
    try {
      localStorage.setItem(prefKey, serialized);
      return true;
    } catch {
      return false;
    }
  }
}

async function removeFallback(key) {
  const prefKey = `${FALLBACK_PREFIX}${key}`;
  try {
    await Preferences.remove({ key: prefKey });
  } catch {
    try {
      localStorage.removeItem(prefKey);
    } catch {}
  }
}

export async function getSecureItem(key) {
  if (!Capacitor.isNativePlatform()) {
    return getFallback(key);
  }

  const plugin = await getPlugin();
  if (plugin) {
    try {
      const result = await plugin.get({ key });
      return deserialize(result?.value);
    } catch {}
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
  if (!Capacitor.isNativePlatform()) {
    return setFallback(key, value);
  }

  const plugin = await getPlugin();
  const serialized = serialize(value);
  if (plugin) {
    try {
      await plugin.set({ key, value: serialized });
      return true;
    } catch {}
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
  if (!Capacitor.isNativePlatform()) {
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
  return Capacitor.isNativePlatform();
}

export async function hasNativeSecureStore() {
  return Boolean(await getNativePluginOnly());
}

export async function getSecretStorageStatus() {
  if (!Capacitor.isNativePlatform()) {
    return {
      platform: "web",
      available: false,
      mode: "web-fallback",
      canPersistSecrets: true,
      isHardwareBacked: false,
      message:
        "Secure device keychain is unavailable on web. Sensitive settings fall back to browser storage on this device.",
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
