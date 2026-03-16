import { beforeEach, describe, expect, it, vi } from "vitest";

const memory = new Map();

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn(async ({ key }) => ({ value: memory.get(key) ?? null })),
    set: vi.fn(async ({ key, value }) => {
      memory.set(key, value);
    }),
    remove: vi.fn(async ({ key }) => {
      memory.delete(key);
    }),
  },
}));

describe("logger redaction", () => {
  beforeEach(async () => {
    memory.clear();
    vi.resetModules();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  it("redacts secret and financial fields before persistence", async () => {
    const { clearLogs, getLogs, log } = await import("./logger.js");
    await clearLogs();

    await log.error("sync", "Failed", {
      token: "Bearer abc123",
      prompt: "sensitive prompt",
      balance: 1500,
      status: 502,
      nested: {
        accountId: "1234567890123456",
        safeHint: "ok",
      },
    });

    const entries = await getLogs();
    expect(entries).toHaveLength(1);
    expect(entries[0].data).toEqual({
      token: "[REDACTED]",
      prompt: "[REDACTED]",
      balance: "[REDACTED]",
      status: 502,
      nested: {
        accountId: "[REDACTED]",
        safeHint: "ok",
      },
    });
  });

  it("sanitizes raw secret-looking strings", async () => {
    const { getSafeErrorMessage, redactForLog } = await import("./logger.js");
    const error = new Error("Bearer secret-token sk-ant-api03-1234567890 failed");
    expect(getSafeErrorMessage(error)).toContain("[REDACTED]");
    expect(getSafeErrorMessage(error)).toContain("[API_KEY]");
    expect(redactForLog("Account 4111111111111111")).toContain("[NUMBER]");
  });
});
