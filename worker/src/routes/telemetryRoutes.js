const FUNNEL_STAGE_ORDER = [
  "setup_started",
  "setup_completed",
  "first_audit_completed",
  "paywall_viewed",
  "trial_started",
  "converted",
];

function sanitizeTelemetryContext(value, depth = 0) {
  if (depth >= 3) return undefined;
  if (value == null) return value;
  if (typeof value === "string") return value.slice(0, 200);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map((item) => sanitizeTelemetryContext(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 20)
        .map(([key, item]) => [String(key).slice(0, 60), sanitizeTelemetryContext(item, depth + 1)])
        .filter(([, item]) => item !== undefined)
    );
  }
  return String(value).slice(0, 200);
}

async function persistTelemetryEvent(db, entry) {
  if (!db) return;
  await db.prepare(
    `INSERT INTO telemetry_events (event_name, event_type, device_id, created_at, context_json)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(
    entry.event,
    entry.type,
    entry.deviceId,
    entry.timestamp,
    entry.context ? JSON.stringify(entry.context) : null
  ).run();
}

function countUniqueDevices(rows) {
  return new Set(rows.map((row) => row.device_id).filter(Boolean)).size;
}

function countSetIntersection(left, right) {
  if (!left?.size || !right?.size) return 0;
  const [smaller, larger] = left.size <= right.size ? [left, right] : [right, left];
  let count = 0;
  for (const value of smaller) {
    if (larger.has(value)) count += 1;
  }
  return count;
}

function buildTelemetryInsights(progression, supportSummary) {
  const dropCandidates = progression
    .filter((row) => typeof row.rateFromPrevious === "number")
    .map((row) => ({
      from: row.previousEvent || null,
      to: row.event,
      keptRate: row.rateFromPrevious,
      lostRate: Number((1 - row.rateFromPrevious).toFixed(3)),
      retainedDevices: row.retainedFromPrevious ?? row.uniqueDevices,
      previousDevices: row.previousDevices ?? 0,
    }))
    .sort((left, right) => right.lostRate - left.lostRate);

  const biggestLeak = dropCandidates[0] || null;
  const topSupportRisk = supportSummary[0] || null;
  const recommendations = [];

  if (biggestLeak?.from && biggestLeak?.to && biggestLeak.lostRate >= 0.2) {
    recommendations.push(
      `Biggest funnel leak: ${biggestLeak.from} -> ${biggestLeak.to} is losing ${(biggestLeak.lostRate * 100).toFixed(1)}% of devices.`
    );
  }

  if (topSupportRisk?.event && topSupportRisk.uniqueDevices > 0) {
    recommendations.push(
      `Top support risk: ${topSupportRisk.event} affected ${topSupportRisk.uniqueDevices} device${topSupportRisk.uniqueDevices === 1 ? "" : "s"} in this window.`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push("No major telemetry leak crossed the alert threshold in this window.");
  }

  return {
    biggestLeak,
    topSupportRisk,
    recommendations,
  };
}

export async function loadTelemetrySummary(db, { days = 14 } = {}) {
  const safeDays = Math.min(Math.max(Number(days) || 14, 1), 90);
  if (!db) {
    return {
      status: "db_unavailable",
      days: safeDays,
      totals: { funnelEvents: 0, supportEvents: 0, uniqueDevices: 0 },
      funnel: [],
      support: [],
      progression: [],
      insights: {
        biggestLeak: null,
        topSupportRisk: null,
        recommendations: ["Telemetry storage is unavailable because the worker DB is not configured."],
      },
    };
  }

  let results;
  try {
    ({ results } = await db.prepare(
      `SELECT event_name, event_type, device_id, created_at, context_json
         FROM telemetry_events
        WHERE created_at >= datetime('now', ?)
        ORDER BY created_at DESC`
    ).bind(`-${safeDays} days`).all());
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("no such table: telemetry_events")) {
      return {
        status: "telemetry_not_migrated",
        days: safeDays,
        totals: { funnelEvents: 0, supportEvents: 0, uniqueDevices: 0 },
        funnel: [],
        support: [],
        progression: [],
        insights: {
          biggestLeak: null,
          topSupportRisk: null,
          recommendations: [
            "Telemetry analysis is blocked because the telemetry_events table is not present in the active database.",
            "Apply the telemetry migrations before relying on funnel or support-risk reports.",
          ],
        },
      };
    }
    throw error;
  }

  const rows = Array.isArray(results) ? results : [];
  const funnelRows = rows.filter((row) => row.event_type === "funnel");
  const supportRows = rows.filter((row) => row.event_type === "support");
  const uniqueDevices = countUniqueDevices(rows);

  const summarizeRows = (items) =>
    Object.entries(
      items.reduce((acc, row) => {
        const key = row.event_name || "unknown";
        if (!acc[key]) {
          acc[key] = { event: key, totalEvents: 0, devices: new Set() };
        }
        acc[key].totalEvents += 1;
        if (row.device_id) acc[key].devices.add(row.device_id);
        return acc;
      }, {})
    )
      .map(([, entry]) => ({
        event: entry.event,
        totalEvents: entry.totalEvents,
        uniqueDevices: entry.devices.size,
      }))
      .sort((a, b) => {
        const totalDelta = b.uniqueDevices - a.uniqueDevices;
        return totalDelta !== 0 ? totalDelta : a.event.localeCompare(b.event);
      });

  const funnelSummary = summarizeRows(funnelRows);
  const supportSummary = summarizeRows(supportRows);

  const funnelDeviceMap = new Map();
  for (const row of funnelRows) {
    const event = row.event_name || "unknown";
    if (!funnelDeviceMap.has(event)) funnelDeviceMap.set(event, new Set());
    if (row.device_id) funnelDeviceMap.get(event).add(row.device_id);
  }

  const firstStageDevices = funnelDeviceMap.get(FUNNEL_STAGE_ORDER[0]) || new Set();

  const progression = FUNNEL_STAGE_ORDER.map((event, index) => {
    const devices = funnelDeviceMap.get(event) || new Set();
    const previousEvent = index === 0 ? null : FUNNEL_STAGE_ORDER[index - 1];
    const previousDevices = previousEvent ? funnelDeviceMap.get(previousEvent) || new Set() : null;
    const retainedFromPrevious = previousDevices ? countSetIntersection(previousDevices, devices) : devices.size;
    const rateFromPrevious =
      previousDevices && previousDevices.size > 0
        ? Number((retainedFromPrevious / previousDevices.size).toFixed(3))
        : null;
    return {
      event,
      previousEvent,
      uniqueDevices: devices.size,
      previousDevices: previousDevices?.size || 0,
      retainedFromPrevious,
      droppedFromPrevious: previousDevices ? Math.max(previousDevices.size - retainedFromPrevious, 0) : 0,
      rateFromPrevious,
      rateFromStart:
        firstStageDevices.size > 0
          ? Number((countSetIntersection(firstStageDevices, devices) / firstStageDevices.size).toFixed(3))
          : null,
    };
  });

  const insights = buildTelemetryInsights(progression, supportSummary);

  return {
    status: "ok",
    days: safeDays,
    totals: {
      funnelEvents: funnelRows.length,
      supportEvents: supportRows.length,
      uniqueDevices,
    },
    funnel: funnelSummary,
    support: supportSummary,
    progression,
    insights,
  };
}

export async function handleTelemetryRoute({
  request,
  url,
  env,
  cors,
  buildHeaders,
  redactForWorkerLogs,
  workerLog,
}) {

  if (url.pathname === "/api/v1/telemetry/errors" && request.method === "POST") {
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

  if (url.pathname === "/api/v1/telemetry/funnel" && request.method === "POST") {
    try {
      const payload = await request.json();
      const deviceId = String(request.headers.get("X-Device-ID") || "unknown").slice(0, 100);
      const context =
        payload?.context && typeof payload.context === "object" ? sanitizeTelemetryContext(payload.context) : undefined;
      const entry = {
        event: String(payload.event || "").slice(0, 60),
        timestamp: typeof payload.timestamp === "string" ? payload.timestamp.slice(0, 30) : new Date().toISOString(),
        type: payload?.type === "support" ? "support" : "funnel",
        deviceId,
        ...(context && Object.keys(context).length > 0 ? { context } : {}),
      };
      await persistTelemetryEvent(env.DB, entry);
      workerLog(env, "info", "funnel", `${entry.event} (${entry.type}) from ${entry.deviceId}`, entry);
    } catch {
      // discard malformed payloads silently
    }

    return new Response(null, { status: 204, headers: buildHeaders(cors) });
  }

  return null;
}
