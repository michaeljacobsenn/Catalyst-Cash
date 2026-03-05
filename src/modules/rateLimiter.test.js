import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "./rateLimiter.js";

describe("RateLimiter", () => {
    beforeEach(() => {
        vi.useFakeTimers({ now: new Date(2024, 0, 1, 12, 0, 0, 0) });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("allows requests within limit", () => {
        const limiter = new RateLimiter(3, 60_000);
        expect(limiter.check().allowed).toBe(true);
        expect(limiter.check().allowed).toBe(true);
        expect(limiter.check().allowed).toBe(true);
    });

    it("blocks requests over limit", () => {
        const limiter = new RateLimiter(2, 60_000);
        limiter.check();
        limiter.check();
        const result = limiter.check();
        expect(result.allowed).toBe(false);
        expect(result.remaining).toBe(0);
        expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it("reports remaining tokens correctly", () => {
        const limiter = new RateLimiter(5, 60_000);
        expect(limiter.check().remaining).toBe(4);
        expect(limiter.check().remaining).toBe(3);
        expect(limiter.check().remaining).toBe(2);
    });

    it("allows requests again after window expires", () => {
        const limiter = new RateLimiter(2, 1000); // 2 per second
        limiter.check();
        limiter.check();
        expect(limiter.check().allowed).toBe(false);

        // Advance time past the window
        vi.advanceTimersByTime(1100);
        const result = limiter.check();
        expect(result.allowed).toBe(true);
    });

    it("sliding window purges old timestamps", () => {
        const limiter = new RateLimiter(2, 1000);
        limiter.check(); // t=0
        vi.advanceTimersByTime(600);
        limiter.check(); // t=600ms
        vi.advanceTimersByTime(500);
        // t=1100ms: first request (t=0) should be expired
        const result = limiter.check();
        expect(result.allowed).toBe(true); // Only 1 active request (t=600)
    });

    it("reset clears all timestamps", () => {
        const limiter = new RateLimiter(2, 60_000);
        limiter.check();
        limiter.check();
        expect(limiter.check().allowed).toBe(false);

        limiter.reset();
        expect(limiter.check().allowed).toBe(true);
    });

    it("peek does not consume a token", () => {
        const limiter = new RateLimiter(3, 60_000);
        limiter.check();
        const peek1 = limiter.peek();
        expect(peek1.remaining).toBe(2);

        const peek2 = limiter.peek();
        expect(peek2.remaining).toBe(2); // Unchanged — peek doesn't consume
    });

    it("peek reports resetMs correctly", () => {
        const limiter = new RateLimiter(5, 10_000);
        limiter.check();
        vi.advanceTimersByTime(3000);
        const peek = limiter.peek();
        expect(peek.resetMs).toBeGreaterThan(6000);
        expect(peek.resetMs).toBeLessThanOrEqual(10000);
    });

    it("peek reports null resetMs when no active requests", () => {
        const limiter = new RateLimiter(5, 60_000);
        expect(limiter.peek().resetMs).toBeNull();
    });

    it("retryAfterMs is accurate", () => {
        const limiter = new RateLimiter(1, 5000);
        limiter.check(); // t=0, fills the single slot
        vi.advanceTimersByTime(2000); // t=2000

        const result = limiter.check();
        expect(result.allowed).toBe(false);
        // Should retry after ~3000ms (5000 - 2000)
        expect(result.retryAfterMs).toBeGreaterThanOrEqual(2900);
        expect(result.retryAfterMs).toBeLessThanOrEqual(3100);
    });

    it("handles high-frequency burst correctly", () => {
        const limiter = new RateLimiter(100, 60_000);
        for (let i = 0; i < 100; i++) {
            expect(limiter.check().allowed).toBe(true);
        }
        expect(limiter.check().allowed).toBe(false);
        expect(limiter.peek().remaining).toBe(0);
    });
});
