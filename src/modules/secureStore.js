import { Capacitor, registerPlugin } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { log } from "./logger.js";

const FALLBACK_PREFIX = "secure:";
const DEFAULT_NATIVE_TIMEOUT_MS = 1800;
const NATIVE_PROBE_RETRY_DELAY_MS = 350;
const NATIVE_PLUGIN_NEGATIVE_TTL_MS = 30_000;
const MISSING_KEY_NEGATIVE_TTL_MS = 6 * 60 * 60 * 1000;
const MISSING_KEY_CACHE_PREFIX = "secure-miss:";
const registeredSecureStoragePlugin = registerPlugin("SecureStoragePlugin");
let securePluginPromise = null;
let nativeAvailabilityWarningShown = false;
let nativeBridgeTimeoutWarningShown = false;
let nativeProbePromise = null;
let nativePluginUnavailableUntil = 0;
let cachedSecretStatus = null;
let cachedSecretStatusAt = 0;
let secretStatusPromise = null;
let nativeStatusTimeoutWarned = false;
const SECRET_STATUS_TTL_MS = 30_000;
const missingKeyCache = new Map();
const pendingNativeReadCache = new Map();

function getPersistedMissingKeyExpiry(key) {
  if (!key || typeof localStorage === "undefined") return 0;
  try {
    const raw = localStorage.getItem(`${MISSING_KEY_CACHE_PREFIX}${key}`);
    const expiresAt = Number(raw || 0);
    return Number.isFinite(expiresAt) ? expiresAt : 0;
  } catch {
    return 0;
  }
}

function persistMissingKeyExpiry(key, expiresAt) {
  if (!key || typeof localStorage === "undefined") return;
  try {
    if (expiresAt > 0) {
      localStorage.setItem(`${MISSING_KEY_CACHE_PREFIX}${key}`, String(expiresAt));
    } else {
      localStorage.removeItem(`${MISSING_KEY_CACHE_PREFIX}${key}`);
    }
  } catch {
    // Best-effort cache only.
  }
}

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

function getNativeOperationTimeoutMs() {
  const override =
    (typeof globalThis !== "undefined" && globalThis.__E2E_SECURE_STORE_TIMEOUT_MS__) ||
    (typeof window !== "undefined" && window.__E2E_SECURE_STORE_TIMEOUT_MS__);
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return override;
  }
  return DEFAULT_NATIVE_TIMEOUT_MS;
}

function hasSecureStorageRuntime() {
  return Capacitor.isNativePlatform() || Boolean(getTestSecureStoreOverride());
}

function getGlobalSecureStoragePlugin() {
  const globalCapacitor =
    (typeof globalThis !== "undefined" && globalThis.Capacitor) ||
    (typeof window !== "undefined" && window.Capacitor);
  return globalCapacitor?.Plugins?.SecureStoragePlugin || Capacitor?.Plugins?.SecureStoragePlugin || null;
}

function isValidPlugin(plugin) {
  if (!plugin) return null;
  if (typeof plugin.get !== "function" || typeof plugin.set !== "function" || typeof plugin.remove !== "function") {
    return null;
  }
  return plugin;
}

function getRegisteredSecureStoragePlugin() {
  const isAvailable = typeof Capacitor?.isPluginAvailable === "function"
    ? Capacitor.isPluginAvailable("SecureStoragePlugin")
    : false;
  if (!isAvailable) return null;
  return isValidPlugin(registeredSecureStoragePlugin);
}

function isSecureStoragePluginRegistered() {
  return typeof Capacitor?.isPluginAvailable === "function"
    ? Capacitor.isPluginAvailable("SecureStoragePlugin")
    : false;
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

function createTimeoutError(operation) {
  const error = new Error(`${operation} timed out`);
  error.name = "SecureStoreTimeoutError";
  return error;
}

function isMissingKeyError(error) {
  const message = error?.message || error?.errorMessage || String(error);
  return message.includes("Item with given key does not exist");
}

function hasRecentMissingKey(key) {
  const expiresAt = missingKeyCache.get(key);
  if (!expiresAt) {
    const persistedExpiry = getPersistedMissingKeyExpiry(key);
    if (!persistedExpiry) return false;
    if (persistedExpiry <= Date.now()) {
      persistMissingKeyExpiry(key, 0);
      return false;
    }
    missingKeyCache.set(key, persistedExpiry);
    return true;
  }
  if (expiresAt <= Date.now()) {
    missingKeyCache.delete(key);
    persistMissingKeyExpiry(key, 0);
    return false;
  }
  return true;
}

function rememberMissingKey(key) {
  if (!key) return;
  const expiresAt = Date.now() + MISSING_KEY_NEGATIVE_TTL_MS;
  missingKeyCache.set(key, expiresAt);
  persistMissingKeyExpiry(key, expiresAt);
}

function clearMissingKey(key) {
  if (!key) return;
  missingKeyCache.delete(key);
  persistMissingKeyExpiry(key, 0);
}

async function withTimeout(promise, operation) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(createTimeoutError(operation)), getNativeOperationTimeoutMs());
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isBridgeTimeoutError(error) {
  return error?.name === "SecureStoreTimeoutError";
}

function logBridgeTimeoutOnce(operation, error) {
  if (nativeBridgeTimeoutWarningShown) return;
  nativeBridgeTimeoutWarningShown = true;
  void log.warn("secure-store", "Native secure storage bridge timed out", {
    operation,
    error: error?.message || String(error),
  });
}

function logStatusTimeoutOnce(error) {
  if (nativeStatusTimeoutWarned) return;
  nativeStatusTimeoutWarned = true;
  void log.warn("secure-store", "Secure storage status check timed out", {
    error: error?.message || String(error),
  });
}

async function callNativePlugin(plugin, operation, payload) {
  if (!plugin || typeof plugin[operation] !== "function") {
    throw new Error(`SecureStoragePlugin.${operation} is unavailable`);
  }
  try {
    return await withTimeout(Promise.resolve(plugin[operation](payload)), `SecureStoragePlugin.${operation}`);
  } catch (error) {
    if (isBridgeTimeoutError(error)) {
      logBridgeTimeoutOnce(operation, error);
    }
    throw error;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function probeNativePlugin(plugin) {
  if (!plugin) return false;
  if (nativeProbePromise) return nativeProbePromise;

  const probeKey = `__cc_secure_probe__:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  nativeProbePromise = (async () => {
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await callNativePlugin(plugin, "get", { key: probeKey });
        return true;
      } catch (error) {
        const msg = error?.message || error?.errorMessage || String(error);
        if (isMissingKeyError(error)) {
          return true; // The bridge is working perfectly, it just correctly reported the key is missing
        }
        lastError = error;
        if (attempt < 1) {
          await sleep(NATIVE_PROBE_RETRY_DELAY_MS);
        }
      }
    }

    if (!nativeAvailabilityWarningShown) {
      nativeAvailabilityWarningShown = true;
      void log.error("secure-store", "Native secure storage unavailable", {
        platform: "native",
        canPersistSecrets: false,
        reason: lastError?.message || String(lastError),
      });
    }
    nativePluginUnavailableUntil = Date.now() + NATIVE_PLUGIN_NEGATIVE_TTL_MS;
    return false;
  })();

  const available = await nativeProbePromise;
  if (!available) {
    nativeProbePromise = null;
  }
  return available;
}

function getResolvedNativePlugin() {
  const globalPlugin = isValidPlugin(getGlobalSecureStoragePlugin());
  if (globalPlugin) return globalPlugin;
  return getRegisteredSecureStoragePlugin();
}

async function resolveAndProbePlugin() {
  const plugin = getResolvedNativePlugin();
  if (!plugin) {
    if (Capacitor.isNativePlatform() && !nativeAvailabilityWarningShown) {
      nativeAvailabilityWarningShown = true;
      void log.error("secure-store", "Native secure storage unavailable", {
        platform: "native",
        canPersistSecrets: false,
      });
    }
    return { instance: null };
  }

  const available = await probeNativePlugin(plugin);
  if (!available) {
    return { instance: null };
  }
  nativePluginUnavailableUntil = 0;
  return { instance: plugin };
}

function getPlugin() {
  if (securePluginPromise) return securePluginPromise;
  const testOverride = getTestSecureStoreOverride();
  if (testOverride?.plugin) {
    securePluginPromise = Promise.resolve({ instance: testOverride.plugin });
    return securePluginPromise;
  }
  if (!Capacitor.isNativePlatform()) {
    securePluginPromise = Promise.resolve({ instance: null });
    return securePluginPromise;
  }
  if (nativePluginUnavailableUntil > Date.now()) {
    return Promise.resolve({ instance: null });
  }

  securePluginPromise = resolveAndProbePlugin().catch(error => {
    if (!nativeAvailabilityWarningShown) {
      nativeAvailabilityWarningShown = true;
      void log.error("secure-store", "Native secure storage unavailable", {
        platform: "native",
        canPersistSecrets: false,
        reason: error?.message || String(error),
      });
    }
    nativePluginUnavailableUntil = Date.now() + NATIVE_PLUGIN_NEGATIVE_TTL_MS;
    securePluginPromise = null;
    return { instance: null };
  });

  return securePluginPromise;
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

async function readNativeSecureItemOnce(key) {
  if (!key) return null;
  const existing = pendingNativeReadCache.get(key);
  if (existing) return existing;

  const readPromise = (async () => {
    const wrapper = await getPlugin();
    const plugin = wrapper?.instance;
    if (!plugin) return null;
    try {
      const result = await callNativePlugin(plugin, "get", { key });
      clearMissingKey(key);
      return deserialize(result?.value);
    } catch (error) {
      if (isMissingKeyError(error)) {
        rememberMissingKey(key);
      }
      return null;
    } finally {
      pendingNativeReadCache.delete(key);
    }
  })();

  pendingNativeReadCache.set(key, readPromise);
  return readPromise;
}

export async function getSecureItem(key) {
  if (!hasSecureStorageRuntime()) {
    return null;
  }
  if (hasRecentMissingKey(key)) {
    return null;
  }
  return readNativeSecureItemOnce(key);
}

export async function getNativeSecureItem(key) {
  if (hasRecentMissingKey(key)) {
    return null;
  }
  return readNativeSecureItemOnce(key);
}

export async function setSecureItem(key, value) {
  if (!hasSecureStorageRuntime()) {
    await removeFallback(key);
    return false;
  }

  const wrapper = await getPlugin();
  const plugin = wrapper?.instance;
  const serialized = serialize(value);
  pendingNativeReadCache.delete(key);
  clearMissingKey(key);
  if (plugin) {
    try {
      await callNativePlugin(plugin, "set", { key, value: serialized });
      return true;
    } catch {
      // Native secret persistence fails closed on native platforms.
    }
  }
  await removeFallback(key);
  return false;
}

export async function setNativeSecureItem(key, value) {
  const wrapper = await getPlugin();
  const plugin = wrapper?.instance;
  if (!plugin) return false;
  pendingNativeReadCache.delete(key);
  clearMissingKey(key);
  try {
    await callNativePlugin(plugin, "set", { key, value: serialize(value) });
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
  pendingNativeReadCache.delete(key);
  clearMissingKey(key);

  const wrapper = await getPlugin();
  const plugin = wrapper?.instance;
  if (plugin) {
    try {
      await callNativePlugin(plugin, "remove", { key });
    } catch {
      await removeFallback(key);
      return false;
    }
  }
  await removeFallback(key);
  return Boolean(plugin);
}

export async function deleteNativeSecureItem(key) {
  const wrapper = await getPlugin();
  const plugin = wrapper?.instance;
  if (!plugin) return false;
  pendingNativeReadCache.delete(key);
  clearMissingKey(key);
  try {
    await callNativePlugin(plugin, "remove", { key });
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
  return Capacitor.isNativePlatform() || Boolean(getTestSecureStoreOverride());
}

export async function hasNativeSecureStore() {
  const wrapper = await getPlugin();
  return Boolean(wrapper?.instance);
}

export async function getSecretStorageStatus() {
  const statusOverride = getTestSecurityStatusOverride();
  if (statusOverride) {
    return statusOverride;
  }

  if (cachedSecretStatus && Date.now() - cachedSecretStatusAt < SECRET_STATUS_TTL_MS) {
    return cachedSecretStatus;
  }

  if (secretStatusPromise) {
    return secretStatusPromise;
  }

  secretStatusPromise = (async () => {
  if (getTestSecureStoreOverride()?.plugin) {
    const status = {
      platform: "native",
      available: true,
      mode: "native-secure",
      canPersistSecrets: true,
      isHardwareBacked: true,
      message: "",
    };
    cachedSecretStatus = status;
    cachedSecretStatusAt = Date.now();
    return status;
  }

  if (!Capacitor.isNativePlatform()) {
    const status = {
      platform: "web",
      available: false,
      mode: "web-limited",
      canPersistSecrets: false,
      isHardwareBacked: false,
      message:
        "Browser storage is not treated as secure storage. App Lock, linked identity, cloud sync credentials, and other secrets are available only in the native iPhone app.",
    };
    cachedSecretStatus = status;
    cachedSecretStatusAt = Date.now();
    return status;
  }

  let available = false;
  let timedOut = false;
  try {
    const wrapper = await withTimeout(getPlugin(), "SecureStoragePlugin.status");
    available = Boolean(wrapper?.instance);
  } catch (error) {
    if (isBridgeTimeoutError(error)) {
      timedOut = true;
      logStatusTimeoutOnce(error);
    }
  }

  if (!available && timedOut && isSecureStoragePluginRegistered()) {
    const status = {
      platform: "native",
      available: true,
      mode: "native-checking",
      canPersistSecrets: true,
      isHardwareBacked: true,
      message: "",
    };
    cachedSecretStatus = status;
    cachedSecretStatusAt = Date.now();
    return status;
  }

  const status = available
    ? {
        platform: "native",
        available: true,
        mode: "native-secure",
        canPersistSecrets: true,
        isHardwareBacked: true,
        message: "",
      }
    : {
        platform: "native",
        available: false,
        mode: "native-unavailable",
        canPersistSecrets: false,
        isHardwareBacked: false,
        message:
          "Secure iOS storage is unavailable. App passcodes, linked identity, API keys, and device secrets will not be persisted until native secure storage is restored.",
      };

  cachedSecretStatus = status;
  cachedSecretStatusAt = Date.now();
  return status;
  })()
    .finally(() => {
      secretStatusPromise = null;
    });

  return secretStatusPromise;
}
