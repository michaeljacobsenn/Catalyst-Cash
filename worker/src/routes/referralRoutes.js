// ═══════════════════════════════════════════════════════════════
// REFERRAL ROUTES — Catalyst Cash Worker
//
// POST /referral/redeem  — Validate and redeem a referral code
// GET  /referral/stats   — Get referral stats for a device
// POST /referral/register — Register a device's referral code
// ═══════════════════════════════════════════════════════════════

import { buildHeaders, corsHeaders } from "../lib/http.js";
import { workerLog } from "../lib/observability.js";

const REFERRAL_TABLE_INIT = `
  CREATE TABLE IF NOT EXISTS referrals (
    code TEXT PRIMARY KEY,
    owner_device_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS referral_redemptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,
    referee_device_id TEXT NOT NULL,
    referee_code TEXT,
    redeemed_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(referee_device_id)
  );
`;

let _tableInitialized = false;

async function ensureTables(db) {
  if (_tableInitialized) return;
  try {
    await db.exec(REFERRAL_TABLE_INIT);
    _tableInitialized = true;
  } catch (err) {
    // Tables likely already exist
    _tableInitialized = true;
  }
}

function json(data, status = 200, cors = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: buildHeaders(cors, { "Content-Type": "application/json" }),
  });
}

/**
 * POST /referral/register
 * Register a referral code for a device. Called on first app boot.
 */
async function handleRegister(request, env, cors) {
  const body = await request.json().catch(() => null);
  const code = String(body?.code || "").trim().toUpperCase();
  const deviceId = String(body?.deviceId || "").trim();

  if (!code || !deviceId) return json({ error: "Missing code or deviceId" }, 400, cors);
  if (!/^CC-[A-Z0-9]{6}$/.test(code)) return json({ error: "Invalid code format" }, 400, cors);

  const db = env.DB;
  if (!db) return json({ error: "Service unavailable" }, 503, cors);

  await ensureTables(db);

  // Check if code already exists
  const existing = await db.prepare("SELECT code, owner_device_id FROM referrals WHERE code = ?").bind(code).first();
  if (existing) {
    if (existing.owner_device_id === deviceId) {
      return json({ ok: true, status: "already_registered" }, 200, cors);
    }
    // Code collision (extremely unlikely) — ask client to regenerate
    return json({ error: "Code already taken", retryable: true }, 409, cors);
  }

  await db.prepare("INSERT INTO referrals (code, owner_device_id) VALUES (?, ?)").bind(code, deviceId).run();
  workerLog(env, "info", "referral", `Registered code ${code} for device ${deviceId.slice(0, 8)}...`);
  return json({ ok: true, status: "registered" }, 201, cors);
}

/**
 * POST /referral/redeem
 * Validate and redeem a referral code.
 */
async function handleRedeem(request, env, cors) {
  const body = await request.json().catch(() => null);
  const code = String(body?.code || "").trim().toUpperCase();
  const deviceId = String(body?.deviceId || "").trim();
  const refereeCode = String(body?.refereeCode || "").trim().toUpperCase();

  if (!code || !deviceId) return json({ error: "Missing code or deviceId" }, 400, cors);
  if (!/^CC-[A-Z0-9]{6}$/.test(code)) return json({ error: "Invalid referral code format" }, 400, cors);

  const db = env.DB;
  if (!db) return json({ error: "Service unavailable" }, 503, cors);

  await ensureTables(db);

  // Check if the code exists and get the owner
  const referral = await db.prepare("SELECT code, owner_device_id FROM referrals WHERE code = ?").bind(code).first();
  if (!referral) return json({ error: "Referral code not found" }, 404, cors);

  // Prevent self-referral
  if (referral.owner_device_id === deviceId) {
    return json({ error: "You can't use your own referral code" }, 400, cors);
  }

  // Check if this device already redeemed any referral
  const existing = await db.prepare("SELECT id FROM referral_redemptions WHERE referee_device_id = ?").bind(deviceId).first();
  if (existing) {
    return json({ error: "You've already used a referral code" }, 409, cors);
  }

  // Record the redemption
  await db.prepare(
    "INSERT INTO referral_redemptions (code, referee_device_id, referee_code) VALUES (?, ?, ?)"
  ).bind(code, deviceId, refereeCode || null).run();

  workerLog(env, "info", "referral", `Code ${code} redeemed by device ${deviceId.slice(0, 8)}...`);
  return json({ ok: true, bonusType: "free_month", referrerDeviceId: referral.owner_device_id }, 200, cors);
}

/**
 * GET /referral/stats?deviceId=...
 * Get referral stats for a device.
 */
async function handleStats(request, env, cors) {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get("deviceId") || "";

  if (!deviceId) return json({ error: "Missing deviceId" }, 400, cors);

  const db = env.DB;
  if (!db) return json({ error: "Service unavailable" }, 503, cors);

  await ensureTables(db);

  // Get the device's referral code
  const codeRow = await db.prepare("SELECT code FROM referrals WHERE owner_device_id = ?").bind(deviceId).first();

  // Count successful redemptions of this device's code
  let totalReferred = 0;
  if (codeRow?.code) {
    const countRow = await db.prepare("SELECT COUNT(*) as cnt FROM referral_redemptions WHERE code = ?").bind(codeRow.code).first();
    totalReferred = countRow?.cnt || 0;
  }

  return json({
    ok: true,
    code: codeRow?.code || null,
    totalReferred,
    bonusMonthsEarned: Math.min(totalReferred, 12), // Capped at 12
  }, 200, cors);
}

/**
 * Main router for /referral/* routes.
 */
export async function handleReferralRoute(request, env, path, cors) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(cors) });
  }

  if (path === "/referral/register" && request.method === "POST") {
    return handleRegister(request, env, cors);
  }
  if (path === "/referral/redeem" && request.method === "POST") {
    return handleRedeem(request, env, cors);
  }
  if (path === "/referral/stats" && request.method === "GET") {
    return handleStats(request, env, cors);
  }

  return json({ error: "Not found" }, 404, cors);
}
