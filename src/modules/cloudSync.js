  import { Capacitor,registerPlugin } from "@capacitor/core";
  import { decrypt,encrypt,isEncrypted } from "./crypto.js";
  import { log } from "./logger.js";

// ═══════════════════════════════════════════════════════════════
// NATIVE iCLOUD SYNC PLUGIN
// Uses the iCloud ubiquity container for true cross-device backup.
// ═══════════════════════════════════════════════════════════════

const ICloudSync = Capacitor.isNativePlatform() ? registerPlugin("ICloudSync") : null;

const FILE_NAME = "CatalystCash_CloudSync.json";
const ICLOUD_RETRY_DELAY_MS = 2000;

// ═══════════════════════════════════════════════════════════════
// iCLOUD SYNC — Native ubiquity container (cross-device)
//
// On iOS: Uses the native ICloudSyncPlugin which writes to the
// real iCloud ubiquity container. Survives app deletion,
// restores on new devices signed into the same iCloud account.
//
// On Web: intentionally unsupported. Browser storage is not
// presented as iCloud-equivalent backup.
// ═══════════════════════════════════════════════════════════════

export function isCloudSyncSupported() {
  return Boolean(ICloudSync);
}

/**
 * Check if iCloud is available on this device.
 * @returns {Promise<{ available: boolean, reason: string }>}
 */
export async function isICloudAvailable() {
  if (!ICloudSync) return { available: false, reason: "not native" };
  try {
    return await ICloudSync.isAvailable();
  } catch (e) {
    return { available: false, reason: e?.message || "unknown error" };
  }
}

/**
 * @param {unknown} payload
 * @param {string | null} [passphrase=null]
 */
export async function uploadToICloud(payload, passphrase = null) {
  try {
    if (!ICloudSync) {
      void log.info("icloud", "Cloud backup unavailable on this platform", { platform: Capacitor.getPlatform() });
      return false;
    }

    let data = JSON.stringify(payload);
    if (!passphrase) {
      throw new Error("Encrypted iCloud backups require an App Passcode. Please set one in Security settings.");
    }
    const envelope = await encrypt(data, passphrase);
    data = JSON.stringify(envelope);

    // Native iOS — use ubiquity container
    const result = await ICloudSync.save({ data });
    if (result?.success) {
      const verify = await ICloudSync.restore().catch(() => null);
      const verified = typeof verify?.data === "string" && verify.data === data;
      if (verified) {
        void log.info("icloud", "Backup saved to ubiquity container", { native: true, fileName: FILE_NAME });
        return true;
      }
      void log.warn("icloud", "Backup write succeeded but read-back verification failed", {
        native: true,
        reason: verify?.data ? "verify-mismatch" : verify?.reason || "verify-missing",
      });
      return false;
    }
    void log.warn("icloud", "Backup save returned without success", {
      native: true,
      reason: result?.reason || "unknown",
    });
    return false;
  } catch (e) {
    void log.error("icloud", "Failed to write backup", {
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

async function readICloudRawData() {
  if (!ICloudSync) {
    void log.info("icloud", "Cloud restore unavailable on this platform", { platform: Capacitor.getPlatform() });
    return { available: false, rawData: null, reason: "unsupported-platform" };
  }

  const result = await ICloudSync.restore();

  if (result?.reason === "downloading") {
    // File exists in iCloud but is still downloading to device.
    void log.info("icloud", "Backup is downloading from iCloud", { retrying: true });
    await new Promise(r => setTimeout(r, ICLOUD_RETRY_DELAY_MS));
    const retry = await ICloudSync.restore();
    if (!retry?.data) {
      void log.info("icloud", "Backup still downloading after retry", { pending: true });
      return { available: false, rawData: null, reason: "downloading" };
    }
    return { available: true, rawData: retry.data, reason: null };
  }

  if (!result?.data) {
    void log.info("icloud", "No backup found", { reason: result?.reason || "missing" });
    return { available: false, rawData: null, reason: result?.reason || "missing" };
  }

  return { available: true, rawData: result.data, reason: null };
}

/**
 * Inspect the iCloud backup without treating an encrypted payload as a failed restore.
 * This lets first-run onboarding offer a passcode screen when a backup exists.
 *
 * @param {string | null} [passphrase=null]
 */
export async function inspectICloudBackup(passphrase = null) {
  try {
    const read = await readICloudRawData();
    if (!read.available || !read.rawData) {
      return {
        available: false,
        encrypted: false,
        backup: null,
        reason: read.reason || "missing",
      };
    }

    let data;
    try {
      data = JSON.parse(read.rawData);
    } catch (e) {
      void log.error("icloud", "Backup contains invalid JSON", {
        error: e instanceof Error ? e.message : String(e),
      });
      return { available: false, encrypted: false, backup: null, reason: "invalid-json" };
    }

    if (isEncrypted(data)) {
      if (!passphrase) {
        return { available: true, encrypted: true, backup: null, reason: "passphrase-required" };
      }
      try {
        const decrypted = await decrypt(data, passphrase);
        return {
          available: true,
          encrypted: true,
          backup: JSON.parse(decrypted),
          reason: null,
        };
      } catch (e) {
        void log.warn("icloud", "Encrypted backup could not be decrypted", {
          error: e instanceof Error ? e.message : String(e),
        });
        return { available: true, encrypted: true, backup: null, reason: "decrypt-failed" };
      }
    }

    return { available: true, encrypted: false, backup: data, reason: null };
  } catch (e) {
    void log.error("icloud", "Backup restore failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { available: false, encrypted: false, backup: null, reason: "restore-failed" };
  }
}

/**
 * @param {string | null} [passphrase=null]
 */
export async function downloadFromICloud(passphrase = null) {
  const result = await inspectICloudBackup(passphrase);
  return result.backup || null;
}
