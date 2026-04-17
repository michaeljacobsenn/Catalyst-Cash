import { db } from "./utils.js";

export const LAST_CLOUD_BACKUP_TS_KEY = "last-backup-ts";
export const LAST_PORTABLE_BACKUP_TS_KEY = "last-portable-backup-ts";
export const LAST_PORTABLE_BACKUP_KIND_KEY = "last-portable-backup-kind";

function clearKey(key) {
  if (typeof db.del === "function") return db.del(key);
  return db.set(key, null);
}

function normalizeBackupKind(kind) {
  return kind === "icloud" || kind === "encrypted-export" || kind === "spreadsheet-export"
    ? kind
    : "encrypted-export";
}

export async function readBackupMetadata() {
  const [lastCloudBackupTs, lastPortableBackupTs, lastPortableBackupKind] = await Promise.all([
    db.get(LAST_CLOUD_BACKUP_TS_KEY),
    db.get(LAST_PORTABLE_BACKUP_TS_KEY),
    db.get(LAST_PORTABLE_BACKUP_KIND_KEY),
  ]);

  return {
    lastCloudBackupTs: Number(lastCloudBackupTs) || null,
    lastPortableBackupTs: Number(lastPortableBackupTs) || null,
    lastPortableBackupKind: typeof lastPortableBackupKind === "string" ? lastPortableBackupKind : null,
  };
}

export async function markPortableBackup(kind, timestamp = Date.now()) {
  const normalizedKind = normalizeBackupKind(kind);
  await Promise.all([
    db.set(LAST_PORTABLE_BACKUP_TS_KEY, timestamp),
    db.set(LAST_PORTABLE_BACKUP_KIND_KEY, normalizedKind),
  ]);
  return { timestamp, kind: normalizedKind };
}

export async function markCloudBackup(timestamp = Date.now()) {
  await Promise.all([
    db.set(LAST_CLOUD_BACKUP_TS_KEY, timestamp),
    db.set(LAST_PORTABLE_BACKUP_TS_KEY, timestamp),
    db.set(LAST_PORTABLE_BACKUP_KIND_KEY, "icloud"),
  ]);
  return { timestamp, kind: "icloud" };
}

export async function clearCloudBackupMetadata() {
  await clearKey(LAST_CLOUD_BACKUP_TS_KEY);
}

export async function clearPortableBackupMetadata() {
  await Promise.all([
    clearKey(LAST_PORTABLE_BACKUP_TS_KEY),
    clearKey(LAST_PORTABLE_BACKUP_KIND_KEY),
  ]);
}

export async function clearBackupMetadata() {
  await Promise.all([
    clearCloudBackupMetadata(),
    clearPortableBackupMetadata(),
  ]);
}
