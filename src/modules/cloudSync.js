  import { Capacitor,registerPlugin } from "@capacitor/core";
  import { decrypt,encrypt,isEncrypted } from "./crypto.js";
  import { log } from "./logger.js";

// ═══════════════════════════════════════════════════════════════
// NATIVE iCLOUD SYNC PLUGIN
// Uses the iCloud ubiquity container for true cross-device backup.
// ═══════════════════════════════════════════════════════════════

const ICloudSync = Capacitor.isNativePlatform() ? registerPlugin("ICloudSync") : null;

const FILE_NAME = "CatalystCash_CloudSync.json";

// ═══════════════════════════════════════════════════════════════
// iCLOUD SYNC — Native ubiquity container (cross-device)
//
// On iOS: Uses the native ICloudSyncPlugin which writes to the
// real iCloud ubiquity container. Survives app deletion,
// restores on new devices with the same Apple ID.
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
    if (passphrase) {
      const envelope = await encrypt(data, passphrase);
      data = JSON.stringify(envelope);
    }

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

/**
 * @param {string | null} [passphrase=null]
 */
export async function downloadFromICloud(passphrase = null) {
  try {
    if (!ICloudSync) {
      void log.info("icloud", "Cloud restore unavailable on this platform", { platform: Capacitor.getPlatform() });
      return null;
    }

    let rawData;

    // Native iOS — use ubiquity container
    const result = await ICloudSync.restore();

    if (result?.reason === "downloading") {
      // File exists in iCloud but is still downloading to device
      // Wait 2 seconds and retry once
      void log.info("icloud", "Backup is downloading from iCloud", { retrying: true });
      await new Promise(r => setTimeout(r, 2000));
      const retry = await ICloudSync.restore();
      if (!retry?.data) {
        void log.info("icloud", "Backup still downloading after retry", { pending: true });
        return null;
      }
      rawData = retry.data;
    } else if (!result?.data) {
      void log.info("icloud", "No backup found", { reason: result?.reason || "missing" });
      return null;
    } else {
      rawData = result.data;
    }

    // Parse the data
    let data;
    try {
      data = JSON.parse(rawData);
    } catch (e) {
      void log.error("icloud", "Backup contains invalid JSON", {
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }

    // Decrypt if needed
    if (isEncrypted(data)) {
      if (!passphrase) throw new Error("iCloud data is encrypted — passphrase required");
      const decrypted = await decrypt(data, passphrase);
      return JSON.parse(decrypted);
    }
    return data;
  } catch (e) {
    void log.error("icloud", "Backup restore failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
