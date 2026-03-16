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

async function clearLegacyPlaintextSecrets() {
  await Promise.all([
    db.del(HOUSEHOLD_ID_KEY),
    db.del(HOUSEHOLD_PASSCODE_KEY),
  ]);
}

async function clearProtectedFallbackSecrets() {
  await Promise.all([
    db.del(HOUSEHOLD_ID_PROTECTED_KEY),
    db.del(HOUSEHOLD_PASSCODE_PROTECTED_KEY),
  ]);
}

export async function canPersistHouseholdCredentials() {
  return Boolean(await hasNativeSecureStore());
}

export async function getHouseholdCredentials() {
  if (!(await canPersistHouseholdCredentials())) {
    await Promise.all([clearProtectedFallbackSecrets(), clearLegacyPlaintextSecrets()]);
    return { householdId: "", passcode: "" };
  }

  const [householdId, passcode] = await Promise.all([
    getNativeSecureItem(HOUSEHOLD_ID_KEY),
    getNativeSecureItem(HOUSEHOLD_PASSCODE_KEY),
  ]);
  return {
    householdId: typeof householdId === "string" ? householdId : "",
    passcode: typeof passcode === "string" ? passcode : "",
  };
}

export async function setHouseholdCredentials(householdId, passcode) {
  const nextId = (householdId || "").trim();
  const nextPasscode = (passcode || "").trim();
  const nativeSecure = await canPersistHouseholdCredentials();

  if (!nextId || !nextPasscode) {
    await clearHouseholdCredentials();
    return { householdId: "", passcode: "" };
  }

  if (!nativeSecure) {
    await Promise.all([clearProtectedFallbackSecrets(), clearLegacyPlaintextSecrets()]);
    return { householdId: "", passcode: "" };
  }

  await Promise.all([
    setNativeSecureItem(HOUSEHOLD_ID_KEY, nextId),
    setNativeSecureItem(HOUSEHOLD_PASSCODE_KEY, nextPasscode),
    clearProtectedFallbackSecrets(),
  ]);

  await clearLegacyPlaintextSecrets();
  return { householdId: nextId, passcode: nextPasscode };
}

export async function clearHouseholdCredentials() {
  await Promise.all([
    deleteNativeSecureItem(HOUSEHOLD_ID_KEY).catch(() => false),
    deleteNativeSecureItem(HOUSEHOLD_PASSCODE_KEY).catch(() => false),
    clearProtectedFallbackSecrets(),
  ]);
  await clearLegacyPlaintextSecrets();
}

export async function migrateHouseholdCredentials() {
  if (!(await canPersistHouseholdCredentials())) {
    await Promise.all([clearProtectedFallbackSecrets(), clearLegacyPlaintextSecrets()]);
    return { householdId: "", passcode: "" };
  }

  const existing = await getHouseholdCredentials();
  if (existing.householdId && existing.passcode) {
    await Promise.all([clearLegacyPlaintextSecrets(), clearProtectedFallbackSecrets()]);
    return existing;
  }

  const [legacyId, legacyPasscode] = await Promise.all([
    db.get(HOUSEHOLD_ID_KEY),
    db.get(HOUSEHOLD_PASSCODE_KEY),
  ]);

  if (typeof legacyId === "string" && typeof legacyPasscode === "string" && legacyId && legacyPasscode) {
    return setHouseholdCredentials(legacyId, legacyPasscode);
  }

  await Promise.all([clearLegacyPlaintextSecrets(), clearProtectedFallbackSecrets()]);
  return existing;
}
