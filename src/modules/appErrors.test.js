import { describe, expect, it } from "vitest";
import { normalizeAppError } from "./appErrors.js";

describe("normalizeAppError", () => {
  it("maps network failures to recoverable user-safe copy", () => {
    const failure = normalizeAppError(new Error("Failed to fetch"), { context: "sync" });
    expect(failure.kind).toBe("network");
    expect(failure.recoverable).toBe(true);
    expect(failure.userMessage).toContain("live sync");
  });

  it("maps secure storage failures to security-safe copy", () => {
    const failure = normalizeAppError(new Error("Secure storage is unavailable on this device"), { context: "security" });
    expect(failure.kind).toBe("auth");
    expect(failure.userMessage).toContain("Secure device storage is unavailable");
  });

  it("maps invalid restore inputs to restore-specific copy", () => {
    const failure = normalizeAppError(new Error("Invalid Catalyst Cash backup file"), { context: "restore" });
    expect(failure.kind).toBe("validation");
    expect(failure.userMessage).toContain("backup file");
  });
});
