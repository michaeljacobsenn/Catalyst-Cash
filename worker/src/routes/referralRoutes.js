// ═══════════════════════════════════════════════════════════════
// REFERRAL ROUTES — Catalyst Cash Worker
//
// POST /referral/redeem   — Store a pending referral redemption
// POST /referral/confirm  — Confirm redemption after purchase verification
// GET  /referral/stats    — Get referral stats for a device
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
    status TEXT NOT NULL DEFAULT 'pending',
    redeemed_at TEXT NOT NULL DEFAULT (datetime('now')),
    confirmed_at TEXT,
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
    // Tables likely already exist — try adding status column for migration
    try {
      await db.exec("ALTER TABLE referral_redemptions ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'");
    } catch { /* column already exists */ }
    try {
      await db.exec("ALTER TABLE referral_redemptions ADD COLUMN confirmed_at TEXT");
    } catch { /* column already exists */ }
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
 * Verify a device has an active Pro entitlement via RevenueCat.
 * Returns true if the user has made a real purchase.
 */
async function verifyPurchase(deviceId, env) {
  const rcApiKey = env.REVENUECAT_API_KEY;
  if (!rcApiKey) {
    workerLog(env, "warn", "referral", "No REVENUECAT_API_KEY — skipping purchase verification");
    return false;
  }

  try {
    const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${deviceId}`, {
      headers: {
        Authorization: `Bearer ${rcApiKey}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) return false;

    const data = await res.json();
    const entitlements = data?.subscriber?.entitlements || {};
    const pro = entitlements.pro || entitlements.Pro || entitlements["catalyst-pro"];

    if (!pro) return false;

    // Must have started a real purchase (not just a promotional/referral grant)
    const productId = pro.product_identifier || "";
    const isRealPurchase =
      productId.includes("monthly") ||
      productId.includes("yearly") ||
      productId.includes("annual") ||
      productId.includes("lifetime");

    return isRealPurchase;
  } catch (err) {
    workerLog(env, "error", "referral", `RevenueCat verification failed: ${err.message}`);
    return false;
  }
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
 * Store a PENDING referral redemption. Benefits are not granted until confirmed.
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
  const existing = await db.prepare("SELECT id, status FROM referral_redemptions WHERE referee_device_id = ?").bind(deviceId).first();
  if (existing) {
    return json({
      ok: true,
      status: existing.status,
      alreadyRedeemed: true,
      message: existing.status === "pending"
        ? "Referral recorded — complete your first Pro purchase to unlock the bonus for both of you."
        : "Referral already confirmed.",
    }, 200, cors);
  }

  // Record the redemption as PENDING
  await db.prepare(
    "INSERT INTO referral_redemptions (code, referee_device_id, referee_code, status) VALUES (?, ?, ?, 'pending')"
  ).bind(code, deviceId, refereeCode || null).run();

  workerLog(env, "info", "referral", `Code ${code} redeemed (pending) by device ${deviceId.slice(0, 8)}...`);

  return json({
    ok: true,
    status: "pending",
    message: "Referral recorded — complete your first Pro purchase to unlock a free bonus month for both of you.",
    referrerDeviceId: referral.owner_device_id,
  }, 200, cors);
}

/**
 * POST /referral/confirm
 * Called after a purchase is detected. Verifies the purchase via RevenueCat
 * and promotes the redemption from pending → confirmed.
 */
async function handleConfirm(request, env, cors) {
  const body = await request.json().catch(() => null);
  const deviceId = String(body?.deviceId || "").trim();

  if (!deviceId) return json({ error: "Missing deviceId" }, 400, cors);

  const db = env.DB;
  if (!db) return json({ error: "Service unavailable" }, 503, cors);

  await ensureTables(db);

  // Find pending redemption for this device
  const redemption = await db.prepare(
    "SELECT id, code, status FROM referral_redemptions WHERE referee_device_id = ? AND status = 'pending'"
  ).bind(deviceId).first();

  if (!redemption) {
    // Check if already confirmed
    const confirmed = await db.prepare(
      "SELECT id FROM referral_redemptions WHERE referee_device_id = ? AND status = 'confirmed'"
    ).bind(deviceId).first();
    if (confirmed) {
      return json({ ok: true, status: "already_confirmed" }, 200, cors);
    }
    return json({ ok: true, status: "no_pending_referral" }, 200, cors);
  }

  // Verify the purchase through RevenueCat
  const hasPurchase = await verifyPurchase(deviceId, env);
  if (!hasPurchase) {
    return json({
      ok: false,
      status: "pending",
      message: "No verified purchase found yet. Complete your first Pro subscription to unlock referral benefits.",
    }, 200, cors);
  }

  // Promote to confirmed
  await db.prepare(
    "UPDATE referral_redemptions SET status = 'confirmed', confirmed_at = datetime('now') WHERE id = ?"
  ).bind(redemption.id).run();

  // Look up the referrer for logging
  const referral = await db.prepare("SELECT owner_device_id FROM referrals WHERE code = ?").bind(redemption.code).first();
  const referrerId = referral?.owner_device_id || "unknown";

  workerLog(env, "info", "referral", `Referral ${redemption.code} confirmed! Referee: ${deviceId.slice(0, 8)}..., Referrer: ${referrerId.slice(0, 8)}...`);

  return json({
    ok: true,
    status: "confirmed",
    bonusType: "free_month",
    referrerDeviceId: referrerId,
    message: "Referral confirmed! You and your friend both earned a free month of Pro.",
  }, 200, cors);
}

/**
 * GET /referral/stats?deviceId=...
 * Get referral stats for a device. Only counts CONFIRMED redemptions.
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

  // Count CONFIRMED redemptions only (not pending)
  let totalReferred = 0;
  let pendingCount = 0;
  if (codeRow?.code) {
    const confirmedRow = await db.prepare(
      "SELECT COUNT(*) as cnt FROM referral_redemptions WHERE code = ? AND status = 'confirmed'"
    ).bind(codeRow.code).first();
    totalReferred = confirmedRow?.cnt || 0;

    const pendingRow = await db.prepare(
      "SELECT COUNT(*) as cnt FROM referral_redemptions WHERE code = ? AND status = 'pending'"
    ).bind(codeRow.code).first();
    pendingCount = pendingRow?.cnt || 0;
  }

  // Check if THIS device has a pending referral it redeemed
  const ownRedemption = await db.prepare(
    "SELECT status FROM referral_redemptions WHERE referee_device_id = ?"
  ).bind(deviceId).first();

  return json({
    ok: true,
    code: codeRow?.code || null,
    totalReferred,
    pendingReferred: pendingCount,
    bonusMonthsEarned: Math.min(totalReferred, 12), // Capped at 12
    ownRedemptionStatus: ownRedemption?.status || null,
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
  if (path === "/referral/confirm" && request.method === "POST") {
    return handleConfirm(request, env, cors);
  }
  if (path === "/referral/stats" && request.method === "GET") {
    return handleStats(request, env, cors);
  }

  return json({ error: "Not found" }, 404, cors);
}
