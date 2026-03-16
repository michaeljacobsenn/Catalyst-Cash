export async function handleHouseholdRoute({
  request,
  url,
  env,
  cors,
  buildHeaders,
  sha256Hex,
  buildHouseholdIntegrityTag,
  verifyHouseholdIntegrity,
}) {
  if (!url.pathname.startsWith("/api/household/")) return null;

  if (!env.DB) {
    return new Response(JSON.stringify({ error: "DB not configured" }), {
      status: 500,
      headers: buildHeaders(cors, { "Content-Type": "application/json" }),
    });
  }

  try {
    if (url.pathname === "/api/household/sync" && request.method === "POST") {
      const body = await request.json();
      const action = body?.action;
      const householdId = String(body?.householdId || "").trim();
      const authToken = String(body?.authToken || "").trim();

      if (!householdId || !authToken || !action) {
        return new Response(
          JSON.stringify({
            error: "invalid_request",
            message: "Missing household sync credentials.",
          }),
          { status: 400, headers: buildHeaders(cors, { "Content-Type": "application/json" }) }
        );
      }

      const authTokenHash = await sha256Hex(authToken);
      const { results } = await env.DB.prepare(
        `SELECT household_id, encrypted_blob, auth_token_hash, integrity_tag, version, last_request_id, last_updated_at
           FROM household_sync WHERE household_id = ?`
      ).bind(householdId).all();
      const existing = results?.[0] || null;

      if (action === "fetch") {
        if (!existing) {
          return new Response(JSON.stringify({ hasData: false }), {
            status: 200,
            headers: buildHeaders(cors, { "Content-Type": "application/json" }),
          });
        }

        if (existing.auth_token_hash && existing.auth_token_hash !== authTokenHash) {
          return new Response(JSON.stringify({ hasData: false }), {
            status: 404,
            headers: buildHeaders(cors, { "Content-Type": "application/json" }),
          });
        }

        if (!existing.auth_token_hash) {
          await env.DB.prepare(
            "UPDATE household_sync SET auth_token_hash = ?, last_updated_at = CURRENT_TIMESTAMP WHERE household_id = ?"
          ).bind(authTokenHash, householdId).run();
        }

        const resolvedVersion = Number(existing.version || 0);
        const resolvedRequestId = existing.last_request_id || "";
        const resolvedIntegrityTag =
          existing.integrity_tag ||
          (await buildHouseholdIntegrityTag({
            householdId,
            authToken,
            encryptedBlob: existing.encrypted_blob,
            version: resolvedVersion,
            requestId: resolvedRequestId,
          }));

        if (!existing.integrity_tag) {
          await env.DB.prepare(
            "UPDATE household_sync SET integrity_tag = ?, last_updated_at = CURRENT_TIMESTAMP WHERE household_id = ?"
          ).bind(resolvedIntegrityTag, householdId).run();
        }

        return new Response(
          JSON.stringify({
            hasData: true,
            encryptedBlob: existing.encrypted_blob,
            integrityTag: resolvedIntegrityTag,
            version: resolvedVersion,
            requestId: resolvedRequestId,
            lastUpdatedAt: existing.last_updated_at,
          }),
          {
            status: 200,
            headers: buildHeaders(cors, { "Content-Type": "application/json" }),
          }
        );
      }

      if (action === "push") {
        const encryptedBlob = body?.encryptedBlob;
        const integrityTag = String(body?.integrityTag || "").trim();
        const requestId = String(body?.requestId || "").trim();
        const version = Number(body?.version || 0);

        if (!encryptedBlob || !integrityTag || !requestId || !Number.isInteger(version) || version < 1) {
          return new Response(
            JSON.stringify({
              error: "invalid_request",
              message: "Missing ciphertext, integrity tag, request id, or version.",
            }),
            { status: 400, headers: buildHeaders(cors, { "Content-Type": "application/json" }) }
          );
        }

        const integrityOk = await verifyHouseholdIntegrity({
          householdId,
          authToken,
          encryptedBlob,
          version,
          requestId,
          integrityTag,
        });
        if (!integrityOk) {
          return new Response(
            JSON.stringify({
              error: "integrity_check_failed",
              message: "Ciphertext integrity verification failed.",
            }),
            { status: 422, headers: buildHeaders(cors, { "Content-Type": "application/json" }) }
          );
        }

        if (existing?.auth_token_hash && existing.auth_token_hash !== authTokenHash) {
          return new Response(
            JSON.stringify({
              error: "unauthorized_household_access",
              message: "This household credential does not match the existing shared household.",
            }),
            { status: 403, headers: buildHeaders(cors, { "Content-Type": "application/json" }) }
          );
        }

        const existingVersion = Number(existing?.version || 0);
        if (existing?.last_request_id && existing.last_request_id === requestId) {
          return new Response(
            JSON.stringify({
              error: "replay_detected",
              message: "This household sync request was already applied.",
              currentVersion: existingVersion,
            }),
            { status: 409, headers: buildHeaders(cors, { "Content-Type": "application/json" }) }
          );
        }

        if (version <= existingVersion) {
          return new Response(
            JSON.stringify({
              error: "stale_version",
              message: "A newer household sync already exists. Pull the latest household data before pushing again.",
              currentVersion: existingVersion,
            }),
            { status: 409, headers: buildHeaders(cors, { "Content-Type": "application/json" }) }
          );
        }

        await env.DB.prepare(
          `INSERT INTO household_sync (
             household_id,
             encrypted_blob,
             auth_token_hash,
             integrity_tag,
             version,
             last_request_id,
             last_updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(household_id) DO UPDATE SET
             encrypted_blob = excluded.encrypted_blob,
             auth_token_hash = COALESCE(household_sync.auth_token_hash, excluded.auth_token_hash),
             integrity_tag = excluded.integrity_tag,
             version = excluded.version,
             last_request_id = excluded.last_request_id,
             last_updated_at = CURRENT_TIMESTAMP`
        ).bind(householdId, encryptedBlob, authTokenHash, integrityTag, version, requestId).run();

        return new Response(JSON.stringify({ success: true, version }), {
          status: 200,
          headers: buildHeaders(cors, { "Content-Type": "application/json" }),
        });
      }

      return new Response(
        JSON.stringify({
          error: "invalid_action",
          message: "Unsupported household sync action.",
        }),
        {
          status: 400,
          headers: buildHeaders(cors, { "Content-Type": "application/json" }),
        }
      );
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: "Household sync error", details: err.message }), {
      status: 500,
      headers: buildHeaders(cors, { "Content-Type": "application/json" }),
    });
  }

  return null;
}
