import { describe, expect, it } from "vitest";
import { hasStoredAppPasscode, normalizeSecurityBootstrapState, shouldRelockOnForeground } from "./SecurityContext";

const nativeSecureStatus = {
  platform: "native" as const,
  available: true,
  mode: "native-secure" as const,
  canPersistSecrets: true,
  isHardwareBacked: true,
  message: "",
};

describe("SecurityContext bootstrap normalization", () => {
  it("keeps app lock disabled when secure storage has no valid passcode", () => {
    expect(hasStoredAppPasscode(null)).toBe(false);
    expect(hasStoredAppPasscode("123")).toBe(false);

    expect(
      normalizeSecurityBootstrapState({
        storageStatus: nativeSecureStatus,
        requireAuth: true,
        useFaceId: true,
        lockTimeout: 300,
        appPasscode: null,
      }),
    ).toMatchObject({
      requireAuth: false,
      useFaceId: false,
      isLocked: false,
      lockTimeout: 0,
      appPasscode: "",
      shouldResetPersistedAuth: true,
    });
  });

  it("preserves a valid secure auth configuration", () => {
    expect(
      normalizeSecurityBootstrapState({
        storageStatus: nativeSecureStatus,
        requireAuth: true,
        useFaceId: true,
        lockTimeout: 300,
        appPasscode: "2468",
      }),
    ).toMatchObject({
      requireAuth: true,
      useFaceId: true,
      isLocked: true,
      lockTimeout: 300,
      appPasscode: "2468",
      shouldResetPersistedAuth: false,
    });
  });

  it("suppresses relock when a biometric interaction is still active", () => {
    expect(
      shouldRelockOnForeground({
        requireAuth: true,
        lockTimeout: 0,
        lastBackgroundedAt: Date.now() - 5000,
        biometricInteractionActive: true,
      }),
    ).toBe(false);
  });

  it("relocks once the timeout has elapsed on a normal foreground return", () => {
    const now = Date.now();
    expect(
      shouldRelockOnForeground({
        requireAuth: true,
        lockTimeout: 300,
        lastBackgroundedAt: now - 301000,
        biometricInteractionActive: false,
        now,
      }),
    ).toBe(true);
  });
});
