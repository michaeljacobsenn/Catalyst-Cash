import { afterEach, describe, expect, it, vi } from "vitest";
import { Capacitor } from "@capacitor/core";

vi.mock("./logger.js", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("./constants.js", () => ({
  APP_VERSION: "2.0.0-test",
}));

vi.mock("./subscription.js", () => ({
  isPro: vi.fn(async () => false),
  isGatingEnforced: vi.fn(() => false),
}));

vi.mock("./revenuecat.js", () => ({
  getRevenueCatAppUserId: vi.fn(async () => null),
}));

vi.mock("./fetchWithRetry.js", () => ({
  fetchWithRetry: vi.fn(),
}));

import { fetchGatingConfig, getBackendUrl, streamAudit } from "./api.js";

function makeStreamingResponse(reader) {
  return {
    ok: true,
    headers: {
      get: () => null,
    },
    body: {
      getReader: () => reader,
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("streamAudit stream cleanup", () => {
  it("cancels the reader after normal stream completion", async () => {
    const cancel = vi.fn(async () => undefined);
    const encoder = new TextEncoder();
    const reader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: encoder.encode('data: {"choices":[{"delta":{"content":"hello"}}]}\n'),
        })
        .mockResolvedValueOnce({ done: true, value: undefined }),
      cancel,
    };

    vi.stubGlobal("fetch", vi.fn(async () => makeStreamingResponse(reader)));

    const chunks = [];
    for await (const chunk of streamAudit("", "snapshot", "backend", "gpt-4.1", "sys", [], "device-1")) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["hello"]);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("cancels the reader when the consumer exits early", async () => {
    const cancel = vi.fn(async () => undefined);
    const encoder = new TextEncoder();
    const reader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: encoder.encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n'),
        })
        .mockResolvedValueOnce({
          done: false,
          value: encoder.encode('data: {"choices":[{"delta":{"content":"ignored"}}]}\n'),
        }),
      cancel,
    };

    vi.stubGlobal("fetch", vi.fn(async () => makeStreamingResponse(reader)));

    for await (const chunk of streamAudit("", "snapshot", "backend", "gpt-4.1", "sys", [], "device-1")) {
      expect(chunk).toBe("partial");
      break;
    }

    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("cancels the reader when an abort interrupts the stream", async () => {
    const controller = new AbortController();
    const cancel = vi.fn(async () => undefined);
    const encoder = new TextEncoder();
    const abortError = new Error("The operation was aborted.");
    abortError.name = "AbortError";
    const reader = {
      read: vi.fn(async () => {
        if (controller.signal.aborted) throw abortError;
        controller.abort();
        return {
          done: false,
          value: encoder.encode('data: {"choices":[{"delta":{"content":"chunk"}}]}\n'),
        };
      }),
      cancel,
    };

    vi.stubGlobal("fetch", vi.fn(async () => makeStreamingResponse(reader)));

    const generator = streamAudit("", "snapshot", "backend", "gpt-4.1", "sys", [], "device-1", controller.signal);

    await expect((async () => {
      for await (const _chunk of generator) {
        // Abort is triggered by the reader mock before the next iteration.
      }
    })()).rejects.toThrow(/aborted/i);

    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe("backend URL selection", () => {
  it("uses the loopback-safe worker URL for /config on localhost and 127.0.0.1", async () => {
    vi.stubGlobal("window", {
      location: { hostname: "127.0.0.1" },
    });
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ gatingMode: "soft", minVersion: "2.0.0" }),
    }));
    vi.stubGlobal("fetch", fetchSpy);

    const config = await fetchGatingConfig();

    expect(config).toEqual({ gatingMode: "soft", minVersion: "2.0.0" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://catalystcash-api.portfoliopro-app.workers.dev/config",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("uses the workers hostname on native builds", () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    vi.stubGlobal("window", {
      location: { hostname: "catalystcash.app" },
    });

    expect(getBackendUrl()).toBe("https://catalystcash-api.portfoliopro-app.workers.dev");
  });
});
