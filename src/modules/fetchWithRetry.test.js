import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchWithRetry } from "./fetchWithRetry.js";

describe("fetchWithRetry", () => {
    let originalFetch;

    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.useRealTimers();
    });

    it("returns successful response immediately", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));

        const res = await fetchWithRetry("https://example.com/api");
        expect(res.status).toBe(200);
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("returns 4xx client errors immediately without retry", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(new Response("not found", { status: 404 }));

        const res = await fetchWithRetry("https://example.com/api");
        expect(res.status).toBe(404);
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("returns 401 immediately without retry", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 }));

        const res = await fetchWithRetry("https://example.com/api");
        expect(res.status).toBe(401);
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("retries on 500 and eventually succeeds", async () => {
        let callCount = 0;
        globalThis.fetch = vi.fn().mockImplementation(async () => {
            callCount++;
            if (callCount < 3) {
                return new Response("error", { status: 500 });
            }
            return new Response("ok", { status: 200 });
        });

        const res = await fetchWithRetry("https://example.com/api", {}, { maxRetries: 3 });
        expect(res.status).toBe(200);
        expect(callCount).toBe(3);
    });

    it("retries on 429 with Retry-After header", async () => {
        let callCount = 0;
        globalThis.fetch = vi.fn().mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
                return new Response("rate limited", {
                    status: 429,
                    headers: { "Retry-After": "2" }
                });
            }
            return new Response("ok", { status: 200 });
        });

        const res = await fetchWithRetry("https://example.com/api");
        expect(res.status).toBe(200);
        expect(callCount).toBe(2);
    });

    it("throws after exhausting all retries on network error", async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

        await expect(
            fetchWithRetry("https://example.com/api", {}, { maxRetries: 2 })
        ).rejects.toThrow("Failed to fetch");

        expect(globalThis.fetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });

    it("throws immediately on AbortError", async () => {
        const err = new DOMException("The operation was aborted.", "AbortError");
        globalThis.fetch = vi.fn().mockRejectedValue(err);

        await expect(
            fetchWithRetry("https://example.com/api")
        ).rejects.toThrow("The operation was aborted.");

        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("respects pre-aborted signal", async () => {
        const controller = new AbortController();
        controller.abort();

        globalThis.fetch = vi.fn();

        await expect(
            fetchWithRetry("https://example.com/api", { signal: controller.signal })
        ).rejects.toThrow();

        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("retries on 502, 503, 504", async () => {
        for (const status of [502, 503, 504]) {
            let callCount = 0;
            globalThis.fetch = vi.fn().mockImplementation(async () => {
                callCount++;
                if (callCount === 1) return new Response("error", { status });
                return new Response("ok", { status: 200 });
            });

            const res = await fetchWithRetry("https://example.com/api");
            expect(res.status).toBe(200);
            expect(callCount).toBe(2);
        }
    });

    it("respects maxRetries option", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(new Response("error", { status: 500 }));

        await expect(
            fetchWithRetry("https://example.com/api", {}, { maxRetries: 1 })
        ).rejects.toThrow();

        expect(globalThis.fetch).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
    });
});
