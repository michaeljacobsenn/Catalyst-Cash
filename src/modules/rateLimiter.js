/**
 * Client-side rate limiter for AI chat and API-intensive features.
 * Uses a sliding window token bucket algorithm.
 *
 * This does NOT replace server-side rate limiting — it provides
 * immediate client-side feedback to prevent accidental floods
 * and improve UX (instant rejection vs. waiting for a 429).
 */

const DEFAULT_WINDOW_MS = 60_000;  // 1 minute
const DEFAULT_MAX_REQUESTS = 12;   // 12 requests per minute

class RateLimiter {
    /**
     * @param {number} maxRequests - Max requests in the window
     * @param {number} windowMs - Sliding window duration in ms
     */
    constructor(maxRequests = DEFAULT_MAX_REQUESTS, windowMs = DEFAULT_WINDOW_MS) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        this.timestamps = [];
    }

    /**
     * Try to consume a token. Returns true if allowed, false if rate-limited.
     * @returns {{ allowed: boolean, retryAfterMs: number | null, remaining: number }}
     */
    check() {
        const now = Date.now();
        // Purge expired timestamps outside the sliding window
        this.timestamps = this.timestamps.filter(ts => now - ts < this.windowMs);

        if (this.timestamps.length >= this.maxRequests) {
            const oldestInWindow = this.timestamps[0];
            const retryAfterMs = this.windowMs - (now - oldestInWindow);
            return {
                allowed: false,
                retryAfterMs: Math.max(0, retryAfterMs),
                remaining: 0
            };
        }

        this.timestamps.push(now);
        return {
            allowed: true,
            retryAfterMs: null,
            remaining: this.maxRequests - this.timestamps.length
        };
    }

    /**
     * Reset the rate limiter (e.g., on user logout).
     */
    reset() {
        this.timestamps = [];
    }

    /**
     * Get current state without consuming a token.
     * @returns {{ remaining: number, resetMs: number | null }}
     */
    peek() {
        const now = Date.now();
        const active = this.timestamps.filter(ts => now - ts < this.windowMs);
        const remaining = Math.max(0, this.maxRequests - active.length);
        const resetMs = active.length > 0
            ? this.windowMs - (now - active[0])
            : null;
        return { remaining, resetMs };
    }
}

// ═══════════════════════════════════════════════════════════════
// Singleton instances for different feature areas
// ═══════════════════════════════════════════════════════════════

/** Chat rate limiter: 12 messages per 60 seconds */
export const chatLimiter = new RateLimiter(12, 60_000);

/** Audit rate limiter: 5 audits per 60 seconds */
export const auditLimiter = new RateLimiter(5, 60_000);

/** Export rate limiter: 3 exports per 60 seconds */
export const exportLimiter = new RateLimiter(3, 60_000);

/** General API rate limiter: 30 requests per 60 seconds */
export const apiLimiter = new RateLimiter(30, 60_000);

export { RateLimiter };
export default RateLimiter;
