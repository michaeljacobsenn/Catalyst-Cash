import { APP_VERSION } from "../constants.js";
import { log } from "../logger.js";

const GATING_MODE_DEFAULT = "live";
const BUILD_GATING_OVERRIDE = null;
const GATING_MODES = new Set(["off", "soft", "live"]);

let effectiveGatingMode = BUILD_GATING_OVERRIDE || GATING_MODE_DEFAULT;
let testGatingModeOverride = null;
const lastServerRateLimit = { audit: null, chat: null };

function compareVersions(a, b) {
  const left = String(a || "").split(".").map(Number);
  const right = String(b || "").split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

export function getGatingMode() {
  return testGatingModeOverride || BUILD_GATING_OVERRIDE || effectiveGatingMode;
}

export function isGatingEnforced() {
  return getGatingMode() === "live";
}

export function shouldShowGating() {
  const mode = getGatingMode();
  return mode === "soft" || mode === "live";
}

export function __setGatingModeForTests(mode) {
  testGatingModeOverride = mode || null;
  effectiveGatingMode = mode || BUILD_GATING_OVERRIDE || GATING_MODE_DEFAULT;
}

export function getServerRateLimit() {
  return lastServerRateLimit;
}

export async function syncRemoteGatingMode() {
  if (BUILD_GATING_OVERRIDE && !testGatingModeOverride) return;

  try {
    const { fetchGatingConfig, onRateLimitUpdate } = await import("../api.js");

    onRateLimitUpdate(({ remaining, limit, isChat }) => {
      const key = isChat ? "chat" : "audit";
      lastServerRateLimit[key] = { remaining, limit, ts: Date.now() };
    });

    const config = await fetchGatingConfig({ forceRefresh: true });
    if (!config) return;

    effectiveGatingMode = GATING_MODES.has(config.gatingMode) ? config.gatingMode : GATING_MODE_DEFAULT;

    if (config.minVersion && compareVersions(APP_VERSION, config.minVersion) < 0) {
      effectiveGatingMode = "live";
      void log.warn("gating", `App version ${APP_VERSION} below minimum ${config.minVersion} - forcing live mode`);
    }
  } catch (error) {
    void log.warn("gating", "Remote config sync failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
