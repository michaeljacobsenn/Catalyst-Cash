const SECURITY_HEADERS = {
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
};

const LOOPBACK_ORIGIN_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;
const PAGES_PREVIEW_ORIGIN_RE = /^https:\/\/(?:[a-z0-9-]+\.)*catalystcash\.pages\.dev$/i;

function getAllowedOrigins(env) {
  return (env.ALLOWED_ORIGIN || "https://catalystcash.app,https://www.catalystcash.app,https://catalystcash.pages.dev")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

export function corsHeaders(origin, env) {
  const normalizedOrigin = String(origin || "");
  const allowed = getAllowedOrigins(env);
  const isAllowed =
    allowed.includes(normalizedOrigin) ||
    LOOPBACK_ORIGIN_RE.test(normalizedOrigin) ||
    PAGES_PREVIEW_ORIGIN_RE.test(normalizedOrigin) ||
    normalizedOrigin === "capacitor://localhost";
  return {
    "Access-Control-Allow-Origin": isAllowed ? normalizedOrigin : allowed[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Device-ID, X-App-Version, X-Subscription-Tier, X-RC-App-User-ID, X-Catalyst-Testing",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function buildHeaders(cors, extra = {}) {
  return { ...cors, ...SECURITY_HEADERS, ...extra };
}

export async function fetchWithTimeout(input, init = {}, timeoutMs = 240_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
