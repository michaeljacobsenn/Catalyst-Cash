import { describe, expect, it } from "vitest";
import { getSafeClientError, redactForWorkerLogs } from "./observability.js";

describe("worker observability", () => {
  it("redacts sensitive keys recursively", () => {
    const result = redactForWorkerLogs({
      token: "secret",
      prompt: "sensitive",
      nested: {
        account_id: "1234567890123456",
        ok: "value",
      },
    });

    expect(result).toEqual({
      token: "[REDACTED]",
      prompt: "[REDACTED]",
      nested: {
        account_id: "[REDACTED]",
        ok: "value",
      },
    });
  });

  it("returns safe client fallback for network-style errors", () => {
    expect(getSafeClientError(new Error("fetch failed"), "Try again later.")).toBe("Try again later.");
  });
});
