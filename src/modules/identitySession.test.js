import { afterEach, describe, expect, it, vi } from "vitest";

function okJson(payload) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  };
}

async function loadIdentitySession({
  secureStatus,
  getSecureItem = vi.fn(async () => null),
  setSecureItem = vi.fn(async () => true),
  deleteSecureItem = vi.fn(async () => true),
  dbGet = vi.fn(async () => null),
  revenueCatAppUserId = vi.fn(async () => null),
  fetchImpl = vi.fn(),
} = {}) {
  vi.resetModules();

  vi.doMock("@capacitor/core", () => ({
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => "ios",
    },
  }));

  vi.doMock("./constants.js", () => ({
    APP_VERSION: "2.0.0-test",
  }));

  vi.doMock("./logger.js", () => ({
    log: {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }));

  vi.doMock("./backendUrl.js", () => ({
    getBackendUrl: () => "https://api.catalystcash.app",
  }));

  vi.doMock("./fetchWithRetry.js", () => ({
    fetchWithRetry: fetchImpl,
  }));

  vi.doMock("./revenuecat.js", () => ({
    getRevenueCatAppUserId: revenueCatAppUserId,
  }));

  vi.doMock("./secureStore.js", () => ({
    getSecretStorageStatus: vi.fn(async () => secureStatus ?? {
      platform: "native",
      available: true,
      mode: "native-secure",
      canPersistSecrets: true,
      isHardwareBacked: true,
      message: "",
    }),
    getSecureItem,
    setSecureItem,
    deleteSecureItem,
  }));

  vi.doMock("./utils.js", () => ({
    db: {
      get: dbGet,
    },
  }));

  const mod = await import("./identitySession.js");
  return {
    mod,
    mocks: {
      getSecureItem,
      setSecureItem,
      deleteSecureItem,
      dbGet,
      revenueCatAppUserId,
      fetchImpl,
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("identitySession", () => {
  it("fails fast without reading secure session state when secure storage is unavailable", async () => {
    const { mod, mocks } = await loadIdentitySession({
      secureStatus: {
        platform: "native",
        available: false,
        mode: "native-unavailable",
        canPersistSecrets: false,
        isHardwareBacked: false,
        message: "Secure iOS storage is unavailable.",
      },
      fetchImpl: vi.fn(async () => {
        throw new Error("network should not be reached");
      }),
    });

    await expect(mod.buildIdentityHeaders()).rejects.toThrow("Secure iOS storage is unavailable.");
    expect(mocks.getSecureItem).not.toHaveBeenCalled();
    expect(mocks.fetchImpl).not.toHaveBeenCalled();
  });

  it("bootstraps with the stored legacy device id and does not block on RevenueCat", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(okJson({
        challengeId: "ich_test",
        nonce: "nonce_test",
        signingPayload: "payload_test",
      }))
      .mockResolvedValueOnce(okJson({
        token: "ccid.test.token",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }));

    const { mod, mocks } = await loadIdentitySession({
      revenueCatAppUserId: vi.fn(() => new Promise(() => {})),
      dbGet: vi.fn(async () => "legacy-device-123"),
      fetchImpl,
    });

    const startedAt = Date.now();
    const headers = await mod.buildIdentityHeaders({ "X-Test": "1" });
    const elapsedMs = Date.now() - startedAt;

    expect(headers).toMatchObject({
      Authorization: "Bearer ccid.test.token",
      "X-App-Version": "2.0.0-test",
      "X-Test": "1",
    });
    expect(elapsedMs).toBeLessThan(1500);
    expect(mocks.dbGet).toHaveBeenCalledWith("device-id");

    const challengeCall = fetchImpl.mock.calls[0];
    const challengeHeaders = challengeCall[1]?.headers || {};
    const challengeBody = JSON.parse(challengeCall[1]?.body || "{}");

    expect(String(challengeCall[0])).toBe("https://api.catalystcash.app/auth/challenge");
    expect(challengeBody.legacyDeviceId).toBe("legacy-device-123");
    expect(challengeHeaders["X-RC-App-User-ID"]).toBeUndefined();
    expect(mocks.setSecureItem).toHaveBeenCalledTimes(2);
  });

  it("retries bootstrap without the legacy device id when the backend requires proof", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(okJson({
        challengeId: "ich_with_legacy",
        nonce: "nonce_with_legacy",
        signingPayload: "payload_with_legacy",
      }))
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: "identity_proof_required" }),
      })
      .mockResolvedValueOnce(okJson({
        challengeId: "ich_without_legacy",
        nonce: "nonce_without_legacy",
        signingPayload: "payload_without_legacy",
      }))
      .mockResolvedValueOnce(okJson({
        token: "ccid.retry.token",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }));

    const { mod } = await loadIdentitySession({
      dbGet: vi.fn(async () => "legacy-device-123"),
      fetchImpl,
    });

    const headers = await mod.buildIdentityHeaders();
    expect(headers.Authorization).toBe("Bearer ccid.retry.token");

    const firstChallengeBody = JSON.parse(fetchImpl.mock.calls[0][1]?.body || "{}");
    const retryChallengeBody = JSON.parse(fetchImpl.mock.calls[2][1]?.body || "{}");

    expect(firstChallengeBody.legacyDeviceId).toBe("legacy-device-123");
    expect(retryChallengeBody.legacyDeviceId).toBe("");
  });

  it("forwards a verified Apple identity token when refreshing the protected identity session", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(okJson({
        challengeId: "ich_apple",
        nonce: "nonce_apple",
        signingPayload: "payload_apple",
      }))
      .mockResolvedValueOnce(okJson({
        token: "ccid.apple.token",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }));

    const { mod } = await loadIdentitySession({
      dbGet: vi.fn(async () => "legacy-device-123"),
      fetchImpl,
    });

    await expect(mod.refreshIdentitySessionWithAppleIdentityToken("apple.jwt.token")).resolves.toMatchObject({
      token: "ccid.apple.token",
    });

    const challengeBody = JSON.parse(fetchImpl.mock.calls[0][1]?.body || "{}");
    const sessionBody = JSON.parse(fetchImpl.mock.calls[1][1]?.body || "{}");

    expect(challengeBody.appleIdentityToken).toBe("apple.jwt.token");
    expect(sessionBody.appleIdentityToken).toBe("apple.jwt.token");
  });
});
