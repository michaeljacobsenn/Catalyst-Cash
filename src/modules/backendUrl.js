import { Capacitor } from "@capacitor/core";

const WORKERS_BACKEND_URL = "https://catalystcash-api.portfoliopro-app.workers.dev";
const PROD_BACKEND_URL = "https://api.catalystcash.app";
const CONFIGURED_BACKEND_URL = String(import.meta.env.VITE_PROXY_URL || "").trim();

function isLoopbackHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

export function getBackendUrl() {
  const hostname = typeof window !== "undefined" ? String(window.location?.hostname || "") : "";
  const isLoopback = isLoopbackHost(hostname);
  const preferWorkersHostname = Capacitor.isNativePlatform() || isLoopback;
  if (preferWorkersHostname) return WORKERS_BACKEND_URL;
  if (CONFIGURED_BACKEND_URL) {
    try {
      return new URL(CONFIGURED_BACKEND_URL).toString().replace(/\/$/, "");
    } catch {
      // Ignore malformed overrides and fall back below.
    }
  }
  return PROD_BACKEND_URL;
}
