const SECURITY_HEADERS = {
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
};

const LOOPBACK_ORIGIN_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;

export function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGIN || "https://catalystcash.app").split(",").map(s => s.trim());
  const isAllowed =
    allowed.includes(origin) || LOOPBACK_ORIGIN_RE.test(String(origin || "")) || origin === "capacitor://localhost";
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : allowed[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Device-ID, X-App-Version, X-Subscription-Tier, X-RC-App-User-ID",
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
