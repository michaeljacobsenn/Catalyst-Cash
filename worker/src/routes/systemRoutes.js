export async function handleSystemRoute({
  request,
  url,
  env,
  cors,
  buildHeaders,
  DEFAULTS,
  getWorkerGatingMode,
  resolveAuthenticatedActor,
  resolveVerifiedRevenueCatAppUserId,
  createIdentityChallenge,
  completeIdentityChallenge,
  rotateIdentityDeviceKey,
  updateAuditLogRow,
  loadPlaidRoiSummary,
  workerLog,
}) {
  if (url.pathname === "/health") {
    return new Response(
      JSON.stringify({
        status: "ok",
        version: "1.1",
        providers: ["gemini", "openai"],
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
            protectedFinanceIdentity: false,
            plaidSync: false,
            note:
              "Web is intentionally limited for security-sensitive features. Device-proof identity, Plaid sync, Apple-backed backup, and shared-household credentials require the native iPhone app.",
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

  if (url.pathname === "/auth/challenge" && request.method === "POST") {
    if (!env.DB) {
      return new Response(JSON.stringify({ error: "DB not configured" }), {
        status: 500,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    }

    try {
      const body = await request.json().catch(() => ({}));
      const verifiedRevenueCatAppUserId = await resolveVerifiedRevenueCatAppUserId(request, env);
      const authenticatedActor =
        body?.intent === "rotate"
          ? await resolveAuthenticatedActor(request, env.DB, env)
          : null;
      if (body?.intent === "rotate" && !authenticatedActor) {
        return new Response(JSON.stringify({ error: "identity_session_required" }), {
          status: 401,
          headers: buildHeaders(cors, { "Content-Type": "application/json" }),
        });
      }

      const challenge = await createIdentityChallenge(env.DB, env, {
        publicKeyJwk: body?.publicKeyJwk,
        verifiedRevenueCatAppUserId,
        legacyDeviceId: body?.legacyDeviceId,
        intent: body?.intent,
        actor: authenticatedActor,
        nextPublicKeyJwk: body?.nextPublicKeyJwk,
      });
      return new Response(JSON.stringify(challenge), {
        status: 200,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    } catch (error) {
      const message = String(error?.message || "");
      const status =
        message === "identity_rotation_requires_authenticated_actor" ||
        message === "identity_session_required"
          ? 401
          : message.includes("identity_public_key") || message.includes("identity_rotation_next_key_missing")
            ? 400
            : 500;
      workerLog(env, status >= 500 ? "error" : "warn", "identity-session", "Failed to create identity challenge", {
        error,
        status,
      });
      return new Response(JSON.stringify({ error: message || "identity_challenge_failed" }), {
        status,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    }
  }

  if (url.pathname === "/auth/session" && request.method === "POST") {
    if (!env.DB) {
      return new Response(JSON.stringify({ error: "DB not configured" }), {
        status: 500,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    }

    try {
      const body = await request.json().catch(() => ({}));
      const verifiedRevenueCatAppUserId = await resolveVerifiedRevenueCatAppUserId(request, env);
      let session;
      if (body?.intent === "rotate") {
        const authenticatedActor = await resolveAuthenticatedActor(request, env.DB, env);
        if (!authenticatedActor) {
          return new Response(JSON.stringify({ error: "identity_session_required" }), {
            status: 401,
            headers: buildHeaders(cors, { "Content-Type": "application/json" }),
          });
        }
        session = await rotateIdentityDeviceKey(env.DB, env, {
          challengeId: body?.challengeId,
          nonce: body?.nonce,
          currentSignature: body?.currentSignature,
          nextPublicKeyJwk: body?.nextPublicKeyJwk,
          nextSignature: body?.nextSignature,
        });
      } else {
        session = await completeIdentityChallenge(env.DB, env, {
          challengeId: body?.challengeId,
          nonce: body?.nonce,
          publicKeyJwk: body?.publicKeyJwk,
          signature: body?.signature,
          legacyDeviceId: body?.legacyDeviceId,
          verifiedRevenueCatAppUserId,
        });
      }

      return new Response(JSON.stringify(session), {
        status: 200,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    } catch (error) {
      const message = String(error?.message || "");
      const status =
        message === "identity_proof_required"
          ? 409
          : message.includes("identity_challenge") || message.includes("identity_key_") || message.includes("identity_signature")
            ? 401
            : 500;
      workerLog(env, status >= 500 ? "error" : "warn", "identity-session", "Failed to issue identity session", {
        error,
        status,
      });
      return new Response(JSON.stringify({ error: message || "identity_session_failed" }), {
        status,
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

  if (url.pathname === "/api/admin/plaid-roi" && request.method === "GET") {
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

    const days = Number(url.searchParams.get("days") || 30);
    const summary = await loadPlaidRoiSummary(env.DB, env, { days });

    return new Response(
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        ...summary,
      }),
      {
        status: 200,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      }
    );
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
