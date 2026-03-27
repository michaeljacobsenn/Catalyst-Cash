import { getBackendUrl } from "./backendUrl.js";
import { log, redactForLog } from "./logger.js";
import { getOrCreateDeviceId } from "./subscription.js";

/**
 * errorReporter.js — Global error telemetry with IndexedDB persistence.
 *
 * - Stores last 50 errors with timestamp, component, stack trace
 * - No PII in error reports (sanitized before storage)
 * - Exports: reportError, getErrorLog, clearErrorLog, installGlobalHandlers
 */

const DB_NAME = "catalyst-errors";
const STORE_NAME = "errors";
const MAX_ERRORS = 50;

// Lazily-cached device ID for telemetry auth header.
// Avoids async overhead on every reportError call.
let _cachedDeviceId = null;
async function ensureDeviceId() {
  if (_cachedDeviceId) return;
  try {
    _cachedDeviceId = await getOrCreateDeviceId();
  } catch {
    _cachedDeviceId = "unknown";
  }
}
// Fire-and-forget on module load
ensureDeviceId();

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      void log.warn("errorReporter", "IndexedDB open failed", { error: req.error });
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function sanitize(str) {
  if (typeof str !== "string") return String(str ?? "");
  // Strip potential PII: emails, phone numbers, tokens
  return str
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]")
    .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, "[PHONE]")
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9]{20,}/g, "[API_KEY]")
    .slice(0, 2000); // cap length
}

/**
 * Report an error to the telemetry store.
 * @param {Error|string} error
 * @param {{ component?: string, action?: string }} [context]
 */
export async function reportError(error, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    component: context.component || "unknown",
    action: context.action || "",
    message: sanitize(error?.message || String(error)),
    stack: sanitize(error?.stack || ""),
    userAgent: navigator.userAgent.slice(0, 200),
  };

  // Attempt to POST error to our telemetry endpoint for production tracking
  try {
    // Only send in production environment to avoid noise
    if (import.meta.env.PROD) {
       const deviceId = _cachedDeviceId || "unknown";
       fetch(`${getBackendUrl()}/api/v1/telemetry/errors`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Device-ID": deviceId },
          body: JSON.stringify(entry),
          // fire-and-forget, keepalive true so payload sends even if page unloads
          keepalive: true,
       }).catch(error => {
         void log.warn("telemetry", "Failed to send telemetry", { error });
       });
    }
  } catch {
    // Ignore telemetry failures; they must never break the app.
  }

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    store.add(entry);

    // Prune old entries beyond MAX_ERRORS
    const countReq = store.count();
    countReq.onsuccess = () => {
      const count = countReq.result;
      if (count > MAX_ERRORS) {
        const cursorReq = store.openCursor();
        let deleted = 0;
        const toDelete = count - MAX_ERRORS;
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor && deleted < toDelete) {
            cursor.delete();
            deleted++;
            cursor.continue();
          }
        };
      }
    };

    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    void log.error("errorReporter", "Failed to store error", {
      error: err,
      entry: redactForLog(entry),
    });
  }
}

/**
 * Retrieve all stored error entries.
 * @returns {Promise<Array>}
 */
export async function getErrorLog() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    void log.warn("errorReporter", "getErrorLog failed", { error: err });
    return [];
  }
}

/**
 * Clear all stored errors.
 * @returns {Promise<void>}
 */
export async function clearErrorLog() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    void log.warn("errorReporter", "clearErrorLog failed", { error: err });
  }
}

/**
 * Install global error handlers. Call once at app startup.
 */
let installed = false;
export function installGlobalHandlers() {
  if (installed) return;
  installed = true;

  const showFatalUI = (title, msg, stack) => {
    // Only show if the app didn't mount (white screen)
    const root = document.getElementById("root");
    if (!root || root.innerHTML.trim() === "") {
      const div = document.createElement("div");
      div.style.cssText = "position:fixed;inset:0;background:#ba0000;color:#fff;padding:60px 20px;z-index:999999;font-family:system-ui, sans-serif;overflow-y:auto;word-wrap:break-word;";

      const h3 = document.createElement("h3");
      h3.textContent = `⚠️ ${title}`;
      div.appendChild(h3);

      const p1 = document.createElement("p");
      p1.style.cssText = "font-weight:bold;margin-bottom:15px;";
      p1.textContent = msg;
      div.appendChild(p1);

      const pre = document.createElement("pre");
      pre.style.cssText = "white-space:pre-wrap;font-size:11px;background:rgba(0,0,0,0.3);padding:10px;border-radius:6px;";
      pre.textContent = stack;
      div.appendChild(pre);

      const p2 = document.createElement("p");
      p2.style.cssText = "margin-top:20px;font-size:14px;";
      p2.textContent = "Please screenshot this and send it to the developer.";
      div.appendChild(p2);

      document.body.appendChild(div);
    }
  };

  window.addEventListener("error", event => {
    const err = event.error || event.message;
    showFatalUI("Fatal Boot Error", err?.message || String(err), err?.stack || "");
    reportError(err, {
      component: "window.onerror",
      action: `${event.filename || "unknown"}:${event.lineno || 0}`,
    });
  });

  window.addEventListener("unhandledrejection", event => {
    const reason = event.reason;
    showFatalUI("Fatal Promise Rejection", reason?.message || String(reason), reason?.stack || "");
    reportError(reason instanceof Error ? reason : String(reason), {
      component: "unhandledrejection",
    });
  });
}
