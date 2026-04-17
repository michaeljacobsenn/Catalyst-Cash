export async function sha256Hex(value) {
  const encoded = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function derivePbkdf2Hex({ secret, salt, iterations }) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret || "")),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new TextEncoder().encode(String(salt || "")),
      iterations,
    },
    material,
    256
  );
  return toHex(derivedBits);
}

export async function deriveLegacyHouseholdAuthToken(householdId, passcode) {
  return sha256Hex(`household-auth-v1:${String(householdId || "").trim()}:${String(passcode || "").trim()}`);
}

export async function deriveHouseholdAuthToken(householdId, passcode) {
  return derivePbkdf2Hex({
    secret: String(passcode || "").trim(),
    salt: `household-auth-v2:${String(householdId || "").trim()}`,
    iterations: 200000,
  });
}

function householdEnvelopeMessage({ householdId, encryptedBlob, version, requestId }) {
  return JSON.stringify({
    householdId,
    version,
    requestId,
    encryptedBlob,
  });
}

function hexToBytes(hex) {
  if (typeof hex !== "string" || hex.length === 0 || hex.length % 2 !== 0) return new Uint8Array();
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

export async function buildHouseholdIntegrityTag({ householdId, authToken, encryptedBlob, version, requestId }) {
  const key = await crypto.subtle.importKey(
    "raw",
    hexToBytes(String(authToken || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(householdEnvelopeMessage({ householdId, encryptedBlob, version, requestId }))
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyHouseholdIntegrity({
  householdId,
  authToken,
  encryptedBlob,
  version,
  requestId,
  integrityTag,
}) {
  const expectedTag = await buildHouseholdIntegrityTag({
    householdId,
    authToken,
    encryptedBlob,
    version,
    requestId,
  });
  return expectedTag === integrityTag;
}
