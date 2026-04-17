import { getBackendUrl } from "./backendUrl.js";
import { log, redactForLog } from "./logger.js";
import { getOrCreateDeviceId } from "./subscription.js";

const DB_NAME = "catalyst-errors";
const STORE_NAME = "errors";
const MAX_ERRORS = 50;
const MAX_FIELD_LENGTH = 2000;

let cachedDeviceId = null;
let deviceIdPromise = null;
let dbPromise = null;
let installed = false;

function sanitizeText(value) {
  return String(value ?? "")
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]")
    .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, "[PHONE]")
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9]{20,}/g, "[API_KEY]")
    .replace(/\b[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}\b/gi, "[UUID]") // Redacts recoveryId
    .replace(/\b[A-Za-z0-9]{32,}\b/g, "[TOKEN]") // Redacts recoveryKey, auth token, etc.
    .slice(0, MAX_FIELD_LENGTH);
}

function getUserAgent() {
  if (typeof navigator === "undefined") return "";
  return String(navigator.userAgent || "").slice(0, 200);
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionToPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function getDeviceId() {
  if (cachedDeviceId) return Promise.resolve(cachedDeviceId);
  if (deviceIdPromise) return deviceIdPromise;

  deviceIdPromise = getOrCreateDeviceId()
    .catch(() => "unknown")
    .then((deviceId) => {
      cachedDeviceId = typeof deviceId === "string" && deviceId.trim() ? deviceId : "unknown";
      return cachedDeviceId;
    })
    .finally(() => {
      deviceIdPromise = null;
    });

  return deviceIdPromise;
}

void getDeviceId();

function openDB() {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      void log.warn("errorReporter", "IndexedDB open failed", { error: request.error });
      reject(request.error);
    };
  });

  return dbPromise;
}

function pruneOldEntries(store) {
  const countRequest = store.count();
  countRequest.onsuccess = () => {
    const overflow = countRequest.result - MAX_ERRORS;
    if (overflow <= 0) return;

    const cursorRequest = store.openCursor();
    let deleted = 0;
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor || deleted >= overflow) return;
      cursor.delete();
      deleted += 1;
      cursor.continue();
    };
  };
}

function createEntry(error, context = {}) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const stack = error instanceof Error ? error.stack : error?.stack;
  return {
    timestamp: new Date().toISOString(),
    component: context.component || "unknown",
    action: context.action || "",
    message: sanitizeText(message),
    stack: sanitizeText(stack || ""),
    userAgent: getUserAgent(),
  };
}

async function sendTelemetry(entry) {
  if (!import.meta.env.PROD) return;

  try {
    const deviceId = await getDeviceId();
    void fetch(`${getBackendUrl()}/api/v1/telemetry/errors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-ID": deviceId,
      },
      body: JSON.stringify(entry),
      keepalive: true,
    }).catch((error) => {
      void log.warn("telemetry", "Failed to send telemetry", { error });
    });
  } catch (error) {
    void log.warn("telemetry", "Telemetry setup failed", { error });
  }
}

export async function reportError(error, context = {}) {
  const entry = createEntry(error, context);
  void sendTelemetry(entry);

  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.add(entry);
    pruneOldEntries(store);
    await transactionToPromise(transaction);
  } catch (storageError) {
    void log.error("errorReporter", "Failed to store error", {
      error: storageError,
      entry: redactForLog(entry),
    });
  }
}

export async function getErrorLog() {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    return (await requestToPromise(store.getAll())) || [];
  } catch (error) {
    void log.warn("errorReporter", "getErrorLog failed", { error });
    return [];
  }
}

export async function clearErrorLog() {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).clear();
    await transactionToPromise(transaction);
  } catch (error) {
    void log.warn("errorReporter", "clearErrorLog failed", { error });
  }
}

function canShowFatalUI() {
  const root = document.getElementById("root");
  return !root || root.innerHTML.trim() === "";
}

function showFatalUI(title, message, stack) {
  if (!canShowFatalUI()) return;

  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;inset:0;background:#ba0000;color:#fff;padding:60px 20px;z-index:999999;font-family:system-ui,sans-serif;overflow-y:auto;word-wrap:break-word;";

  const heading = document.createElement("h3");
  heading.textContent = `Warning: ${title}`;
  container.appendChild(heading);

  const detail = document.createElement("p");
  detail.style.cssText = "font-weight:bold;margin-bottom:15px;";
  detail.textContent = message;
  container.appendChild(detail);

  const pre = document.createElement("pre");
  pre.style.cssText =
    "white-space:pre-wrap;font-size:11px;background:rgba(0,0,0,0.3);padding:10px;border-radius:6px;";
  pre.textContent = stack;
  container.appendChild(pre);

  const note = document.createElement("p");
  note.style.cssText = "margin-top:20px;font-size:14px;";
  note.textContent = "Please screenshot this and send it to the developer.";
  container.appendChild(note);

  document.body.appendChild(container);
}

export function installGlobalHandlers() {
  if (installed) return;
  installed = true;

  window.addEventListener("error", (event) => {
    const error = event.error || event.message;
    showFatalUI("Fatal Boot Error", error?.message || String(error), error?.stack || "");
    void reportError(error, {
      component: "window.onerror",
      action: `${event.filename || "unknown"}:${event.lineno || 0}`,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    showFatalUI("Fatal Promise Rejection", reason?.message || String(reason), reason?.stack || "");
    void reportError(reason instanceof Error ? reason : String(reason), {
      component: "unhandledrejection",
    });
  });
}
