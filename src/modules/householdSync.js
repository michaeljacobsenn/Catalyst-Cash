  import { decrypt,encrypt } from "./crypto.js";
  import { isSecuritySensitiveKey,sanitizePlaidForBackup } from "./securityKeys.js";
  import { db } from "./utils.js";

const WORKER_URL = "https://api.catalystcash.app/api/household/sync";

export async function pushHouseholdSync(householdId, passcode) {
  if (!householdId || !passcode) return false;

  const payload = { data: {}, timestamp: Date.now() };
  const keys = await db.keys();
  
  for (const key of keys) {
    if (isSecuritySensitiveKey(key) || key === "household-id" || key === "household-passcode") continue;
    const val = await db.get(key);
    if (val !== null) payload.data[key] = val;
  }

  const plaidConns = await db.get("plaid-connections");
  if (Array.isArray(plaidConns) && plaidConns.length > 0) {
    payload.data["plaid-connections-sanitized"] = sanitizePlaidForBackup(plaidConns);
  }

  try {
    const encryptedBlob = await encrypt(JSON.stringify(payload), passcode);
    
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ householdId, encryptedBlob })
    }).catch(() => ({ ok: false }));
    
    if (res.ok) {
        await db.set("household-last-sync-ts", payload.timestamp);
        return true;
    }
    return false;
  } catch (err) {
    console.error("pushHouseholdSync failed:", err);
    return false;
  }
}

export async function pullHouseholdSync(householdId, passcode) {
  if (!householdId || !passcode) return null;

  try {
    const res = await fetch(`${WORKER_URL}?householdId=${encodeURIComponent(householdId)}`).catch(() => ({ ok: false }));
    if (!res.ok) return null;
    
    const data = await res.json();
    if (!data.hasData || !data.encryptedBlob) return null;
    
    const decryptedStr = await decrypt(data.encryptedBlob, passcode);
    return JSON.parse(decryptedStr);
  } catch (err) {
    console.error("pullHouseholdSync failed:", err);
    return null;
  }
}

export async function mergeHouseholdState(remotePayload) {
  if (!remotePayload || !remotePayload.data) return false;
  
  const remoteData = remotePayload.data;
  const remoteTs = remotePayload.timestamp || 0;
  
  const localTsStr = await db.get("household-last-sync-ts");
  const localTs = localTsStr ? Number(localTsStr) : 0;
  
  if (remoteTs <= localTs) {
    return false; // Remote is older or same, no need to merge
  }

  for (const [key, remoteVal] of Object.entries(remoteData)) {
    await db.set(key, remoteVal);
  }

  await db.set("household-last-sync-ts", remoteTs);
  return true;
}
