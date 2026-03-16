export async function handleSystemRoute({
  request,
  url,
  env,
  cors,
  buildHeaders,
  DEFAULTS,
  getWorkerGatingMode,
  resolveVerifiedRevenueCatAppUserId,
  bootstrapIdentityActor,
  issueIdentitySessionToken,
  updateAuditLogRow,
  workerLog,
}) {
  if (url.pathname === "/health") {
    return new Response(
      JSON.stringify({
        status: "ok",
        version: "1.1",
        providers: ["gemini", "openai", "claude"],
        defaultProvider: "gemini",
        defaultModel: DEFAULTS.gemini,
        plaid: Boolean(env.PLAID_CLIENT_ID && env.PLAID_SECRET),
      }),
      {
        status: 200,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      }
    );
  }

  if (url.pathname === "/config" && request.method === "GET") {
    return new Response(
      JSON.stringify({
        gatingMode: getWorkerGatingMode(env),
        minVersion: env.MIN_VERSION || "2.0.0",
        entitlementVerification: Boolean(env.REVENUECAT_SECRET_KEY),
        platformPolicy: {
          web: {
            secureSecretPersistence: false,
            appLock: false,
            biometricUnlock: false,
            appleSignIn: false,
            cloudBackup: false,
            householdSync: false,
            note:
              "Web is intentionally limited for security-sensitive features. Device secrets, Apple-backed backup, and shared-household credentials require the native iPhone app.",
          },
        },
        rotatingCategories: {
          "Chase Freedom Flex": ["gas", "transit"],
          "Discover it Cash Back": ["groceries", "drugstores", "online_shopping"],
        },
      }),
      {
        status: 200,
        headers: buildHeaders(cors, { "Content-Type": "application/json", "Cache-Control": "max-age=300" }),
      }
    );
  }

  if (url.pathname === "/auth/session" && request.method === "POST") {
    if (!env.DB) {
      return new Response(JSON.stringify({ error: "DB not configured" }), {
        status: 500,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    }

    try {
      const verifiedRevenueCatAppUserId = await resolveVerifiedRevenueCatAppUserId(request, env);
      const actor = await bootstrapIdentityActor(env.DB, request, env, verifiedRevenueCatAppUserId);
      if (!actor) {
        return new Response(JSON.stringify({ error: "Missing bootstrap identity" }), {
          status: 401,
          headers: buildHeaders(cors, { "Content-Type": "application/json" }),
        });
      }

      const session = await issueIdentitySessionToken(actor, env);
      return new Response(JSON.stringify(session), {
        status: 200,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    } catch (error) {
      workerLog(env, "error", "identity-session", "Failed to issue identity session", { error });
      return new Response(JSON.stringify({ error: "identity_session_failed" }), {
        status: 500,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    }
  }

  if (url.pathname === "/api/admin/audit-log" && request.method === "GET") {
    const authHeader = request.headers.get("Authorization") || "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!env.ADMIN_TOKEN || bearerToken !== env.ADMIN_TOKEN) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    }

    if (!env.DB) {
      return new Response(JSON.stringify({ error: "DB not configured" }), {
        status: 500,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    }

    const { results } = await env.DB.prepare(
      `SELECT id, created_at, provider, model, user_id, prompt_tokens, completion_tokens,
              parse_succeeded, hit_degraded_fallback, response_preview, confidence, drift_warning, drift_details
         FROM audit_log
        ORDER BY created_at DESC
        LIMIT 50`
    ).bind().all();

    return new Response(JSON.stringify({ rows: results || [] }), {
      status: 200,
      headers: buildHeaders(cors, { "Content-Type": "application/json" }),
    });
  }

  if (url.pathname === "/api/audit-log/outcome" && request.method === "POST") {
    if (!env.DB) {
      return new Response(JSON.stringify({ error: "DB not configured" }), {
        status: 500,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    }

    const { auditLogId, parseSucceeded, hitDegradedFallback, confidence, driftWarning, driftDetails } =
      await request.json().catch(() => ({}));
    if (!auditLogId) {
      return new Response(JSON.stringify({ error: "Missing auditLogId" }), {
        status: 400,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    }

    await updateAuditLogRow(env.DB, auditLogId, {
      parseSucceeded: Boolean(parseSucceeded),
      hitDegradedFallback: Boolean(hitDegradedFallback),
      confidence: typeof confidence === "string" ? confidence : "medium",
      driftWarning: Boolean(driftWarning),
      driftDetails: Array.isArray(driftDetails) ? driftDetails : [],
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: buildHeaders(cors, { "Content-Type": "application/json" }),
    });
  }

  return null;
}
