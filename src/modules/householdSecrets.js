import { decryptAtRestDetailed, encryptAtRest, isEncrypted } from "./crypto.js";
import {
  deleteNativeSecureItem,
  getNativeSecureItem,
  hasNativeSecureStore,
  setNativeSecureItem,
} from "./secureStore.js";
import { db } from "./utils.js";

const HOUSEHOLD_ID_KEY = "household-id";
const HOUSEHOLD_PASSCODE_KEY = "household-passcode";
const HOUSEHOLD_ID_PROTECTED_KEY = "household-id-protected";
const HOUSEHOLD_PASSCODE_PROTECTED_KEY = "household-passcode-protected";

async function readProtectedDbValue(key) {
  const stored = await db.get(key);
  if (!stored) return "";
  if (isEncrypted(stored)) {
    const result = await decryptAtRestDetailed(stored, db).catch(() => ({ data: null }));
    return typeof result?.data === "string" ? result.data : "";
  }
  return typeof stored === "string" ? stored : "";
}

async function writeProtectedDbValue(key, value) {
  if (!value) {
    await db.del(key);
    return;
  }
  const encrypted = await encryptAtRest(value, db);
  await db.set(key, encrypted);
}

async function clearLegacyPlaintextSecrets() {
  await Promise.all([
    db.del(HOUSEHOLD_ID_KEY),
    db.del(HOUSEHOLD_PASSCODE_KEY),
  ]);
}

export async function getHouseholdCredentials() {
  const nativeSecure = await hasNativeSecureStore();
  if (nativeSecure) {
    const [householdId, passcode] = await Promise.all([
      getNativeSecureItem(HOUSEHOLD_ID_KEY),
      getNativeSecureItem(HOUSEHOLD_PASSCODE_KEY),
    ]);
    return {
      householdId: typeof householdId === "string" ? householdId : "",
      passcode: typeof passcode === "string" ? passcode : "",
    };
  }

  const [householdId, passcode] = await Promise.all([
    readProtectedDbValue(HOUSEHOLD_ID_PROTECTED_KEY),
    readProtectedDbValue(HOUSEHOLD_PASSCODE_PROTECTED_KEY),
  ]);
  return { householdId, passcode };
}

export async function setHouseholdCredentials(householdId, passcode) {
  const nextId = (householdId || "").trim();
  const nextPasscode = (passcode || "").trim();
  const nativeSecure = await hasNativeSecureStore();

  if (!nextId || !nextPasscode) {
    await clearHouseholdCredentials();
    return { householdId: "", passcode: "" };
  }

  if (nativeSecure) {
    await Promise.all([
      setNativeSecureItem(HOUSEHOLD_ID_KEY, nextId),
      setNativeSecureItem(HOUSEHOLD_PASSCODE_KEY, nextPasscode),
      db.del(HOUSEHOLD_ID_PROTECTED_KEY),
      db.del(HOUSEHOLD_PASSCODE_PROTECTED_KEY),
    ]);
  } else {
    await Promise.all([
      writeProtectedDbValue(HOUSEHOLD_ID_PROTECTED_KEY, nextId),
      writeProtectedDbValue(HOUSEHOLD_PASSCODE_PROTECTED_KEY, nextPasscode),
    ]);
  }

  await clearLegacyPlaintextSecrets();
  return { householdId: nextId, passcode: nextPasscode };
}

export async function clearHouseholdCredentials() {
  await Promise.all([
    deleteNativeSecureItem(HOUSEHOLD_ID_KEY).catch(() => false),
    deleteNativeSecureItem(HOUSEHOLD_PASSCODE_KEY).catch(() => false),
    db.del(HOUSEHOLD_ID_PROTECTED_KEY),
    db.del(HOUSEHOLD_PASSCODE_PROTECTED_KEY),
  ]);
  await clearLegacyPlaintextSecrets();
}

export async function migrateHouseholdCredentials() {
  const existing = await getHouseholdCredentials();
  if (existing.householdId && existing.passcode) {
    await clearLegacyPlaintextSecrets();
    return existing;
  }

  const [legacyId, legacyPasscode] = await Promise.all([
    db.get(HOUSEHOLD_ID_KEY),
    db.get(HOUSEHOLD_PASSCODE_KEY),
  ]);

  if (typeof legacyId === "string" && typeof legacyPasscode === "string" && legacyId && legacyPasscode) {
    return setHouseholdCredentials(legacyId, legacyPasscode);
  }

  await clearLegacyPlaintextSecrets();
  return existing;
}
