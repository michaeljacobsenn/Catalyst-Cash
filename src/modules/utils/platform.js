import { Capacitor, registerPlugin } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

import { log } from "../logger.js";

const NativeFaceId = registerPlugin("FaceId");
const PREFS_TIMEOUT_MS = 2000;

function withPrefsTimeout(promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Preferences bridge timed out")), PREFS_TIMEOUT_MS)),
  ]);
}

export const FaceId = {
  isAvailable: async () => {
    try {
      if (!Capacitor.isNativePlatform()) return { isAvailable: false };
      return await NativeFaceId.isAvailable();
    } catch (error) {
      void log.warn("biometry", "Biometry check failed", { error });
      return { isAvailable: false };
    }
  },
  authenticate: async (options) => {
    if (!Capacitor.isNativePlatform()) throw new Error("Not supported on web");
    return NativeFaceId.authenticate(options);
  },
};

export const PdfViewer = registerPlugin("PdfViewer");

export const db = {
  async get(key) {
    try {
      const { value } = await withPrefsTimeout(Preferences.get({ key }));
      return value ? JSON.parse(value) : null;
    } catch {
      try {
        const localValue = localStorage.getItem(key);
        return localValue ? JSON.parse(localValue) : null;
      } catch {
        return null;
      }
    }
  },
  async set(key, value) {
    try {
      await withPrefsTimeout(Preferences.set({ key, value: JSON.stringify(value) }));
      return true;
    } catch {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    }
  },
  async del(key) {
    try {
      await withPrefsTimeout(Preferences.remove({ key }));
    } catch {
      try {
        localStorage.removeItem(key);
      } catch {
        // Local cleanup is best-effort only.
      }
    }
  },
  async keys() {
    try {
      const { keys } = await withPrefsTimeout(Preferences.keys());
      return keys;
    } catch {
      try {
        return Object.keys(localStorage);
      } catch {
        return [];
      }
    }
  },
  async clear() {
    try {
      await withPrefsTimeout(Preferences.clear());
    } catch {
      try {
        localStorage.clear();
      } catch {
        // Local cleanup is best-effort only.
      }
    }
  },
};
