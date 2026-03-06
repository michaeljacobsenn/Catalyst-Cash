/**
 * fetchWithRetry — Drop-in fetch() replacement with exponential backoff.
 *
 * - Max 3 retries (4 total attempts)
 * - Exponential backoff: 1s → 2s → 4s
 * - Retries on 429, 500, 502, 503, 504 and network errors
 * - Does NOT retry on 400, 401, 403, 404
 * - Respects AbortController signal
 * - Parses Retry-After header on 429
 */

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * @param {string|URL} url
 * @param {RequestInit} [opts]
 * @param {{ maxRetries?: number }} [retryOpts]
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, opts = {}, retryOpts = {}) {
    const maxRetries = retryOpts.maxRetries ?? MAX_RETRIES;
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        // Respect abort signal
        if (opts.signal?.aborted) {
            throw new DOMException("The operation was aborted.", "AbortError");
        }

        try {
            const res = await fetch(url, opts);

            // Non-retryable client errors — return immediately
            if (res.ok || !RETRYABLE_STATUS.has(res.status)) {
                return res;
            }

            // Retryable server error
            lastError = new Error(`HTTP ${res.status}`);
            lastError.status = res.status;
            lastError.response = res;

            if (attempt < maxRetries) {
                let delay = BASE_DELAY_MS * Math.pow(2, attempt);

                // Respect Retry-After header on 429
                if (res.status === 429) {
                    const retryAfter = res.headers.get("Retry-After");
                    if (retryAfter) {
                        const parsed = Number(retryAfter);
                        if (!isNaN(parsed) && parsed > 0) {
                            delay = Math.min(parsed * 1000, 30000); // cap at 30s
                        }
                    }
                }

                // Add jitter (±25%)
                delay = delay * (0.75 + Math.random() * 0.5);
                await sleep(delay, opts.signal);
            }
        } catch (err) {
            // AbortError — never retry
            if (err.name === "AbortError") throw err;

            // Network error — retry
            lastError = err;
            if (attempt < maxRetries) {
                const delay = BASE_DELAY_MS * Math.pow(2, attempt) * (0.75 + Math.random() * 0.5);
                await sleep(delay, opts.signal);
            }
        }
    }

    throw lastError;
}

function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("The operation was aborted.", "AbortError"));
            return;
        }
        const onAbort = () => {
            clearTimeout(timer);
            reject(new DOMException("The operation was aborted.", "AbortError"));
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, ms);
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

export default fetchWithRetry;
