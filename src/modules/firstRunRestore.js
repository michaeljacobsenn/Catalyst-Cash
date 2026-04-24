import { restoreBackupPayload } from "./backup.js";
import { inspectICloudBackup } from "./cloudSync.js";
import { setSecureItem } from "./secureStore.js";
import { db } from "./utils.js";

const MEANINGFUL_LOCAL_DATA_KEYS = [
  "financial-config",
  "card-portfolio",
  "bank-accounts",
  "renewals",
  "audit-history",
  "current-audit",
];

function hasMeaningfulObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value).some((key) => !key.startsWith("_") && value[key] !== undefined && value[key] !== null && value[key] !== "");
}

function hasMeaningfulArray(value) {
  return Array.isArray(value) && value.some((item) => {
    if (!item || typeof item !== "object") return true;
    return !item.isDemoHistory && !item.isTest;
  });
}

export async function hasMeaningfulLocalData(storage = db) {
  const [onboardingComplete, ...values] = await Promise.all([
    storage.get("onboarding-complete"),
    ...MEANINGFUL_LOCAL_DATA_KEYS.map((key) => storage.get(key)),
  ]);

  if (onboardingComplete) return true;

  return values.some((value) => {
    if (Array.isArray(value)) return hasMeaningfulArray(value);
    return hasMeaningfulObject(value);
  });
}

export function canUsePasscodeForAppLock(passcode) {
  return /^[0-9]{4,8}$/.test(String(passcode || ""));
}

/**
 * @param {{ passphrase?: string | null, enableNativeAutoBackup?: boolean }} [options]
 */
export async function restoreFirstRunICloudBackup({ passphrase = null, enableNativeAutoBackup = false } = {}) {
  const result = await inspectICloudBackup(passphrase);
  if (!result.backup) return { restored: false, reason: result.reason, encrypted: result.encrypted };

  const restore = await restoreBackupPayload(result.backup);
  await db.set("onboarding-complete", true);

  if (enableNativeAutoBackup && canUsePasscodeForAppLock(passphrase)) {
    const saved = await setSecureItem("app-passcode", passphrase);
    if (saved) {
      await Promise.all([
        db.set("require-auth", true),
        db.set("lock-timeout", 0),
        db.set("auto-backup-interval", "weekly"),
      ]);
    }
  }

  return {
    restored: true,
    encrypted: result.encrypted,
    count: restore.count,
    exportedAt: restore.exportedAt,
    plaidReconnectCount: restore.plaidReconnectCount || 0,
  };
}
