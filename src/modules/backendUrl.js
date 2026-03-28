import { Capacitor } from "@capacitor/core";

const WORKERS_BACKEND_URL = "https://catalystcash-api.portfoliopro-app.workers.dev";
// Keep the app on the healthy Workers hostname until the custom domain is
// fully reliable across device networks and certificate chains again.
const PROD_BACKEND_URL = WORKERS_BACKEND_URL;
const CONFIGURED_BACKEND_URL = String(import.meta.env.VITE_PROXY_URL || "").trim();

function isLoopbackHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

export function getBackendUrl() {
  const hostname = typeof window !== "undefined" ? String(window.location?.hostname || "") : "";
  const isLoopback = isLoopbackHost(hostname);
  const preferWorkersHostname = Capacitor.isNativePlatform() || isLoopback;
  if (CONFIGURED_BACKEND_URL) {
    try {
      const configuredHostname = new URL(CONFIGURED_BACKEND_URL).hostname;
      if (configuredHostname === "api.catalystcash.app") {
        return WORKERS_BACKEND_URL;
      }
    } catch {
      // Ignore malformed overrides and fall back below.
    }
    return CONFIGURED_BACKEND_URL;
  }
  return preferWorkersHostname ? WORKERS_BACKEND_URL : PROD_BACKEND_URL;
}
