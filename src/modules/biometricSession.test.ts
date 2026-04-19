import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { beginBiometricInteraction, endBiometricInteraction, isBiometricInteractionActive, withBiometricPromptTimeout } from "./biometricSession.js";

describe("biometricSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-27T12:00:00.000Z"));
    globalThis.window = {} as Window & typeof globalThis;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (globalThis as typeof globalThis & { window?: Window }).window;
  });

  it("marks biometric interaction active immediately", () => {
    beginBiometricInteraction(1200);

    expect(isBiometricInteractionActive()).toBe(true);
    expect(window.__biometricActive).toBe(true);
    expect(window.__biometricActiveUntil).toBeGreaterThan(Date.now());
  });

  it("keeps biometric interaction active through the post-auth grace window", () => {
    beginBiometricInteraction(1000);
    endBiometricInteraction(800);

    vi.advanceTimersByTime(799);
    expect(isBiometricInteractionActive()).toBe(true);

    vi.advanceTimersByTime(1);
    expect(isBiometricInteractionActive()).toBe(false);
    expect(window.__biometricActive).toBe(false);
  });

  it("does not let an earlier clear timer cancel a newer biometric session", () => {
    beginBiometricInteraction(1000);
    endBiometricInteraction(400);
    beginBiometricInteraction(1200);

    vi.advanceTimersByTime(400);
    expect(isBiometricInteractionActive()).toBe(true);

    endBiometricInteraction(1200);
    vi.advanceTimersByTime(1199);
    expect(isBiometricInteractionActive()).toBe(true);

    vi.advanceTimersByTime(1);
    expect(isBiometricInteractionActive()).toBe(false);
  });

  it("times out a hung biometric prompt", async () => {
    const pending = expect(
      withBiometricPromptTimeout(() => new Promise<never>(() => {}), {
        timeoutMs: 900,
        timeoutMessage: "Face ID timed out",
      })
    ).rejects.toThrow("Face ID timed out");

    await vi.advanceTimersByTimeAsync(900);
    await pending;
  });

  it("clears the timeout when the biometric prompt resolves", async () => {
    const pending = withBiometricPromptTimeout(async () => {
      await Promise.resolve();
      return "ok";
    }, { timeoutMs: 900 });

    await expect(pending).resolves.toBe("ok");
    await vi.advanceTimersByTimeAsync(900);
  });
});
