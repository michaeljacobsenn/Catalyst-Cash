/**
 * funnelAnalytics.js — Lightweight funnel + support-risk event tracking
 *
 * Tracks key conversion milestones and operational health signals.
 * Each funnel event is idempotent: calling trackFunnel("first_audit")
 * twice only records the first occurrence.
 *
 * Events are persisted locally (db) and optionally forwarded to the
 * worker telemetry endpoint as fire-and-forget POSTs.
 *
 * Design decisions:
 *  - No PII — only event name, timestamp, device ID
 *  - Separate from error telemetry to keep the data clean
 *  - Support-risk events (restore_failed, sync_failed) are non-idempotent
 *    because each occurrence is a separate incident
 */

import { getBackendUrl } from "./backendUrl.js";
import { log } from "./logger.js";
import { getOrCreateDeviceId } from "./subscription.js";
import { db } from "./utils.js";

const FUNNEL_EVENTS_KEY = "funnel-events";
const SUPPORT_EVENTS_KEY = "support-risk-events";
const MAX_SUPPORT_EVENTS = 100;
const MAX_CONTEXT_DEPTH = 3;
const MAX_CONTEXT_KEYS = 20;
const MAX_CONTEXT_ITEMS = 20;
const MAX_STRING_LENGTH = 200;

function sanitizeTelemetryString(value) {
  return String(value ?? "")
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]")
    .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, "[PHONE]")
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9]{20,}/g, "[API_KEY]")
    .replace(/\b[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}\b/gi, "[UUID]")
    .replace(/\b[A-Za-z0-9]{32,}\b/g, "[TOKEN]")
    .slice(0, MAX_STRING_LENGTH);
}

function sanitizeTelemetryContext(value, depth = 0) {
  if (depth >= MAX_CONTEXT_DEPTH) return undefined;
  if (value == null) return value;
  if (typeof value === "string") return sanitizeTelemetryString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_CONTEXT_ITEMS)
      .map((item) => sanitizeTelemetryContext(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, MAX_CONTEXT_KEYS)
        .map(([key, item]) => [sanitizeTelemetryString(key), sanitizeTelemetryContext(item, depth + 1)])
        .filter(([, item]) => item !== undefined)
    );
  }
  return sanitizeTelemetryString(value);
}

// ═══════════════════════════════════════════════════════════════
// Funnel milestones — idempotent (first occurrence only)
// ═══════════════════════════════════════════════════════════════

const VALID_FUNNEL_EVENTS = new Set([
  "app_opened",
  "setup_started",
  "setup_completed",
  "first_audit_completed",
  "backup_configured",
  "paywall_viewed",
  "trial_started",
  "converted",
  "churned",
  "bank_connected",
  "first_export",
  "apple_id_linked",
  "pro_unlocked",
]);

/**
 * Record a funnel milestone. Idempotent — only the first call per event
 * is stored and forwarded.
 * @param {string} eventName - One of VALID_FUNNEL_EVENTS
 */
export async function trackFunnel(eventName) {
  if (!VALID_FUNNEL_EVENTS.has(eventName)) return;

  try {
    const events = (await db.get(FUNNEL_EVENTS_KEY)) || {};
    if (events[eventName]) return; // Already recorded — idempotent

    events[eventName] = Date.now();
    await db.set(FUNNEL_EVENTS_KEY, events);

    void sendFunnelTelemetry(eventName, undefined, "funnel");
  } catch (err) {
    void log.warn("funnel", "Failed to track funnel event", { event: eventName, error: err?.message });
  }
}

/**
 * Check whether a funnel milestone has been reached.
 * @param {string} eventName
 * @returns {Promise<boolean>}
 */
export async function hasFunnelEvent(eventName) {
  try {
    const events = (await db.get(FUNNEL_EVENTS_KEY)) || {};
    return Boolean(events[eventName]);
  } catch {
    return false;
  }
}

/**
 * Get all recorded funnel events with timestamps.
 * @returns {Promise<Record<string, number>>}
 */
export async function getFunnelEvents() {
  try {
    return (await db.get(FUNNEL_EVENTS_KEY)) || {};
  } catch {
    return {};
  }
}

// ═══════════════════════════════════════════════════════════════
// Support-risk events — non-idempotent (each occurrence matters)
// ═══════════════════════════════════════════════════════════════

const VALID_SUPPORT_EVENTS = new Set([
  "restore_failed",
  "sync_failed",
  "plaid_reconnect_failed",
  "export_used",
  "vault_sync_failed",
  "recovery_restore_failed",
]);

/**
 * Record a support-risk event. Non-idempotent — every occurrence is logged.
 * @param {string} eventName - One of VALID_SUPPORT_EVENTS
 * @param {Record<string, unknown>} [context] - Optional context (no PII)
 */
export async function trackSupportEvent(eventName, context = {}) {
  if (!VALID_SUPPORT_EVENTS.has(eventName)) return;

  try {
    const safeContext = sanitizeTelemetryContext(context) || {};
    const events = (await db.get(SUPPORT_EVENTS_KEY)) || [];
    events.push({
      event: eventName,
      ts: Date.now(),
      context: safeContext,
    });

    // Cap stored events to prevent unbounded growth
    const trimmed = events.length > MAX_SUPPORT_EVENTS ? events.slice(-MAX_SUPPORT_EVENTS) : events;
    await db.set(SUPPORT_EVENTS_KEY, trimmed);

    void sendFunnelTelemetry(eventName, safeContext, "support");
  } catch (err) {
    void log.warn("funnel", "Failed to track support event", { event: eventName, error: err?.message });
  }
}

/**
 * Get support-risk event history.
 * @returns {Promise<Array<{event: string, ts: number, context: Record<string, unknown>}>>}
 */
export async function getSupportEvents() {
  try {
    return (await db.get(SUPPORT_EVENTS_KEY)) || [];
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// Telemetry dispatch — fire-and-forget
// ═══════════════════════════════════════════════════════════════

async function sendFunnelTelemetry(eventName, context, type = "funnel") {
  if (!import.meta.env.PROD) return;

  try {
    const deviceId = await getOrCreateDeviceId();
    const safeContext = sanitizeTelemetryContext(context);
    void fetch(`${getBackendUrl()}/api/v1/telemetry/funnel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-ID": deviceId,
      },
      body: JSON.stringify({
        event: eventName,
        timestamp: new Date().toISOString(),
        type,
        ...(safeContext && Object.keys(safeContext).length > 0 ? { context: safeContext } : {}),
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Telemetry is best-effort — never block the user flow
  }
}

export { VALID_FUNNEL_EVENTS, VALID_SUPPORT_EVENTS };
