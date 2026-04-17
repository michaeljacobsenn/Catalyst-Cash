const encoder = new TextEncoder();
const APPLE_IDENTITY_ISSUER = "https://appleid.apple.com";
const APPLE_IDENTITY_KEYS_URL = "https://appleid.apple.com/auth/keys";
const DEFAULT_APPLE_CLIENT_ID = "com.jacobsen.portfoliopro";
const DEFAULT_JWKS_CACHE_TTL_SECONDS = 60 * 60 * 6;

function toBase64Url(bytes) {
  const base64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(bytes).toString("base64")
      : btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(padded, "base64"));
  }
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function parseJwtPart(value) {
  return JSON.parse(new TextDecoder().decode(fromBase64Url(value)));
}

function getAllowedAppleClientIds(env) {
  const configured = String(
    env.APPLE_SIGN_IN_CLIENT_IDS || env.APPLE_SIGN_IN_CLIENT_ID || DEFAULT_APPLE_CLIENT_ID
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(configured.length > 0 ? configured : [DEFAULT_APPLE_CLIENT_ID]);
}

async function importAppleVerifyKey(jwk, alg = "RS256") {
  if (!jwk?.kid || !jwk?.kty) {
    throw new Error("apple_identity_key_invalid");
  }
  if (alg !== "RS256") {
    throw new Error("apple_identity_alg_unsupported");
  }
  return crypto.subtle.importKey(
    "jwk",
    {
      kty: jwk.kty,
      kid: jwk.kid,
      use: jwk.use,
      alg: jwk.alg || alg,
      n: jwk.n,
      e: jwk.e,
    },
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["verify"]
  );
}

async function fetchAppleIdentityKeys(env) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const request = new Request(APPLE_IDENTITY_KEYS_URL, { method: "GET" });
  if (cache) {
    const cached = await cache.match(request);
    if (cached) {
      const payload = await cached.json().catch(() => null);
      if (Array.isArray(payload?.keys)) return payload.keys;
    }
  }

  const response = await fetch(request).catch(() => null);
  if (!response?.ok) {
    throw new Error("apple_identity_keys_unavailable");
  }
  const payload = await response.json().catch(() => ({}));
  if (!Array.isArray(payload?.keys) || payload.keys.length === 0) {
    throw new Error("apple_identity_keys_invalid");
  }

  if (cache) {
    await cache.put(
      request,
      new Response(JSON.stringify({ keys: payload.keys }), {
        headers: {
          "Cache-Control": `public, max-age=${Number(env.APPLE_JWKS_CACHE_TTL_SECONDS || DEFAULT_JWKS_CACHE_TTL_SECONDS)}`,
          "Content-Type": "application/json",
        },
      })
    );
  }

  return payload.keys;
}

export async function verifyAppleIdentityToken(identityToken, env) {
  const token = String(identityToken || "").trim();
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("apple_identity_token_invalid");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = parseJwtPart(encodedHeader);
  const payload = parseJwtPart(encodedPayload);

  if (!header?.kid || !payload?.sub) {
    throw new Error("apple_identity_token_invalid");
  }
  if (String(payload.iss || "") !== APPLE_IDENTITY_ISSUER) {
    throw new Error("apple_identity_issuer_invalid");
  }

  const allowedClientIds = getAllowedAppleClientIds(env);
  const audience = payload.aud;
  const audienceValues = Array.isArray(audience) ? audience : [audience];
  if (!audienceValues.some((value) => allowedClientIds.has(String(value || "").trim()))) {
    throw new Error("apple_identity_audience_invalid");
  }

  const now = Math.floor(Date.now() / 1000);
  if (Number(payload.exp || 0) <= now) {
    throw new Error("apple_identity_token_expired");
  }

  const jwks = await fetchAppleIdentityKeys(env);
  const jwk = jwks.find((entry) => entry?.kid === header.kid);
  if (!jwk) {
    throw new Error("apple_identity_key_missing");
  }

  const verifyKey = await importAppleVerifyKey(jwk, header.alg);
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    verifyKey,
    fromBase64Url(encodedSignature),
    encoder.encode(`${encodedHeader}.${encodedPayload}`)
  );
  if (!verified) {
    throw new Error("apple_identity_signature_invalid");
  }

  return {
    appleUserId: String(payload.sub || "").trim(),
    email: payload.email ? String(payload.email).trim().toLowerCase() : null,
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    isPrivateEmail:
      payload.is_private_email === true || payload.is_private_email === "true",
    authTime: Number(payload.auth_time || 0) || null,
  };
}

export async function hashAppleIdentityUserId(identityUserId) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(String(identityUserId || "").trim()));
  return toBase64Url(new Uint8Array(digest));
}
