export async function handleTelemetryRoute({
  request,
  url,
  env,
  cors,
  buildHeaders,
  redactForWorkerLogs,
  workerLog,
}) {
  if (url.pathname !== "/api/v1/telemetry/errors" || request.method !== "POST") return null;

  try {
    const payload = await request.json();
    const entry = {
      timestamp: typeof payload.timestamp === "string" ? payload.timestamp.slice(0, 30) : new Date().toISOString(),
      component: String(payload.component || "unknown").slice(0, 100),
      action: String(payload.action || "").slice(0, 200),
      message: String(payload.message || "").slice(0, 2000),
      stack: String(payload.stack || "").slice(0, 4000),
      userAgent: String(payload.userAgent || "").slice(0, 200),
    };
    workerLog(env, "error", "telemetry", "Client telemetry event", redactForWorkerLogs(entry));
  } catch {
    // discard malformed payloads silently
  }

  return new Response(null, { status: 204, headers: buildHeaders(cors) });
}
