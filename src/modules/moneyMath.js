// Deterministic money math helpers.
// All currency calculations in core financial logic should be done in integer cents.

const MONEY_PATTERN = /[^0-9.()-]/g;
const PERCENT_PATTERN = /[^0-9.()-]/g;

function normalizeNumericInput(raw, pattern) {
    if (raw == null) return { negative: false, intPart: "0", fracPart: "00" };
    const input = String(raw).trim();
    if (!input) return { negative: false, intPart: "0", fracPart: "00" };

    const negative = input.startsWith("-") || (input.startsWith("(") && input.endsWith(")"));
    const stripped = input
        .replace(pattern, "")
        .replace(/[()]/g, "")
        .replace(/^\./, "0.")
        .replace(/\.(?=.*\.)/g, "");

    if (!stripped) return { negative, intPart: "0", fracPart: "00" };

    const [rawInt = "0", rawFrac = ""] = stripped.split(".");
    const intPart = rawInt.replace(/^0+(?=\d)/, "") || "0";
    const fracPart = (rawFrac + "00").slice(0, 2);
    return { negative, intPart, fracPart };
}

export function toCents(value) {
    if (typeof value === "number") {
        if (!Number.isFinite(value)) return 0;
        return Math.round(value * 100);
    }
    const { negative, intPart, fracPart } = normalizeNumericInput(value, MONEY_PATTERN);
    const cents = (Number(intPart) * 100) + Number(fracPart);
    return negative ? -cents : cents;
}

export function fromCents(cents) {
    if (!Number.isFinite(cents)) return 0;
    return cents / 100;
}

// Percent as basis points (24.99% -> 2499 bps)
export function toBps(value) {
    if (typeof value === "number") {
        if (!Number.isFinite(value)) return 0;
        return Math.round(value * 100);
    }
    const { negative, intPart, fracPart } = normalizeNumericInput(value, PERCENT_PATTERN);
    const bps = (Number(intPart) * 100) + Number(fracPart);
    return negative ? -bps : bps;
}

export function fromBps(bps) {
    if (!Number.isFinite(bps)) return 0;
    return bps / 100;
}

export function monthlyInterestCents(balanceCents, aprBps) {
    if (balanceCents <= 0 || aprBps <= 0) return 0;
    // APR in bps -> monthly rate denominator is 12 * 10,000
    return Math.round((balanceCents * aprBps) / 120000);
}

export function cmpString(a, b) {
    return String(a || "").localeCompare(String(b || ""), undefined, { sensitivity: "base" });
}
