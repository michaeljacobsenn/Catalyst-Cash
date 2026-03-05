import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const FALLBACK_PREFIX = "secure:";
let securePluginPromise = null;

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
  securePluginPromise = Promise.race([
    import("capacitor-secure-storage-plugin")
      .then(mod => mod.SecureStoragePlugin || mod.default?.SecureStoragePlugin || mod.default || null)
      .catch(() => null),
    new Promise(resolve => setTimeout(() => resolve(null), 3000)) // 3s timeout — never hang
  ]);
  return securePluginPromise;
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
    } catch { }
  }
}

export async function getSecureItem(key) {
  const plugin = await getPlugin();
  if (plugin) {
    try {
      const result = await plugin.get({ key });
      return deserialize(result?.value);
    } catch { }
  }
  return getFallback(key);
}

export async function setSecureItem(key, value) {
  const plugin = await getPlugin();
  const serialized = serialize(value);
  if (plugin) {
    try {
      await plugin.set({ key, value: serialized });
      return true;
    } catch { }
  }
  return setFallback(key, value);
}

export async function deleteSecureItem(key) {
  const plugin = await getPlugin();
  if (plugin) {
    try {
      await plugin.remove({ key });
    } catch { }
  }
  await removeFallback(key);
}

export async function migrateToSecureItem(key, legacyValue, removeLegacy) {
  const existing = await getSecureItem(key);
  if (existing != null && existing !== "") return existing;
  if (legacyValue == null || legacyValue === "") return existing;
  await setSecureItem(key, legacyValue);
  if (typeof removeLegacy === "function") {
    await removeLegacy();
  }
  return legacyValue;
}

export function secureStoreUsesNativeKeychain() {
  return Capacitor.isNativePlatform();
}
