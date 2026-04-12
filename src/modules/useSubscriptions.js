  import { useEffect,useState } from "react";
  import { log } from "./logger.js";
  import { getShortCardLabel } from "./cards.js";
  import { getBankAccountLabel,RENEWAL_PAYMENT_TYPES } from "./renewalPaymentSources.js";
  import { getHydratedStoredTransactions } from "./storedTransactions.js";
  import { db } from "./utils.js";

// Common subscription names and keywords to match against transaction descriptions.
const SUB_KEYWORDS = [
    "netflix", "spotify", "hulu", "amazon prime", "amzn prime", "apple.com/bill",
    "apple bill", "disney plus", "disney+", "hbo max", "max.com", "peacock", "paramount",
    "gym", "planet fitness", "equinox", "peloton", "strava", "anytime fitness",
    "adobe", "microsoft", "google one", "google storage", "icloud", "dropbox",
    "nytimes", "wsj", "washington post", "patreon", "substack",
    "internet", "comcast", "xfinity", "verizon", "t-mobile", "att", "at&t", "mint mobile",
    "insurance", "geico", "state farm", "progressive", "allstate", "lemonade",
    "electric", "water", "gas", "utility", "trash"
];

const IGNORE_KEYWORDS = ["payroll", "deposit", "transfer", "payment", "atm", "cash", "venmo", "zelle", "paypal", "credit"];

/**
 * Normalize a merchant name for deduplication and comparison.
 * Strips numeric suffixes, common business suffixes, and whitespace.
 * Examples:
 *   "NETFLIX.COM  04/12" → "netflix"
 *   "AMZN PRIME*1234" → "amzn prime"
 *   "Planet Fitness Inc." → "planet fitness"
 */
function normalizeMerchantName(raw) {
    if (!raw) return "";
    return raw
        .toLowerCase()
        .replace(/[*#]/g, " ")           // Strip special chars
        .replace(/\d{2,}/g, "")          // Remove numeric sequences (dates, IDs)
        .replace(/\b(inc|llc|ltd|corp|co)\b\.?/g, "") // Remove business suffixes
        .replace(/\.com/g, "")           // Remove .com
        .replace(/\s+/g, " ")           // Collapse whitespace
        .trim();
}

/**
 * Check if a candidate name matches any existing renewal name,
 * using both exact and fuzzy substring matching.
 */
function matchesExistingRenewal(candidateName, trackedSet, trackedList) {
    const norm = normalizeMerchantName(candidateName);
    if (!norm) return true; // Skip empty names

    // 1. Exact normalized match
    if (trackedSet.has(norm)) return true;

    // 2. Fuzzy: check if any tracked name is a substring of candidate or vice versa
    for (const tracked of trackedList) {
        if (!tracked) continue;
        if (norm.includes(tracked) || tracked.includes(norm)) return true;
        // Also check if the first meaningful word matches (e.g. "netflix" in "netflix.com billing")
        const normFirst = norm.split(" ")[0];
        const trackedFirst = tracked.split(" ")[0];
        if (normFirst.length >= 4 && normFirst === trackedFirst) return true;
    }

    return false;
}

/**
 * Estimate the next due date based on the last transaction date and detected frequency.
 */
function estimateNextDue(lastDate, frequency) {
    const d = new Date(lastDate);
    if (isNaN(d.getTime())) return "";
    switch (frequency) {
        case "weekly": d.setDate(d.getDate() + 7); break;
        case "bi-weekly": d.setDate(d.getDate() + 14); break;
        case "monthly": d.setMonth(d.getMonth() + 1); break;
        case "quarterly": d.setMonth(d.getMonth() + 3); break;
        case "annual": d.setFullYear(d.getFullYear() + 1); break;
        default: d.setMonth(d.getMonth() + 1); break;
    }
    return d.toISOString().split("T")[0];
}

/**
 * Map frequency string to interval/unit for the renewal model.
 */
function frequencyToInterval(frequency) {
    switch (frequency) {
        case "weekly": return { interval: 1, intervalUnit: "weeks" };
        case "bi-weekly": return { interval: 2, intervalUnit: "weeks" };
        case "quarterly": return { interval: 3, intervalUnit: "months" };
        case "annual": return { interval: 1, intervalUnit: "years" };
        default: return { interval: 1, intervalUnit: "months" };
    }
}

/**
 * Custom hook that scans locally stored Plaid transactions for likely recurring
 * subscriptions and bills that are NOT already tracked in the user's Renewals.
 *
 * Improvements over v1:
 *   - Fuzzy name matching against existing renewals (no duplicates)
 *   - Normalized merchant names for deduplication
 *   - Frequency-aware next-due estimation
 *   - Cross-institution deduplication (same sub from multiple accounts)
 *   - Better name cleaning and title-casing
 */
export function useSubscriptions(existingRenewals = [], cards = [], bankAccounts = [], isPro = false) {
    const [detected, setDetected] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isPro) {
            setDetected([]);
            setLoading(false);
            return;
        }

        async function scan() {
            try {
                const [stored, dismissedIds] = await Promise.all([
                    getHydratedStoredTransactions(),
                    db.get("dismissed-suggestions").then(res => new Set(res || []))
                ]);

                if (!stored || !stored.data) {
                    setLoading(false);
                    return;
                }

                const txns = stored.data;

                // Build a normalized set of existing renewal names for fuzzy matching
                const trackedNormalized = (existingRenewals || [])
                    .map(r => normalizeMerchantName(r.name))
                    .filter(Boolean);
                const trackedSet = new Set(trackedNormalized);

                // Group transactions by normalized merchant name for frequency detection
                const merchantGroups = new Map(); // normalizedName → { txns: [], rawName, category }

                for (const t of txns) {
                    if (t.isCredit) continue;
                    if (t.amount < 1 || t.amount > 2500) continue;

                    const desc = (t.description || "").toLowerCase();
                    if (IGNORE_KEYWORDS.some(k => desc.includes(k))) continue;

                    let isMatch = false;
                    let category = "subs";

                    // 1. Direct Keyword Match
                    if (SUB_KEYWORDS.some(k => desc.includes(k))) {
                        isMatch = true;
                    }
                    // 2. Plaid Category Match
                    else if (
                        t.category?.includes("subscription") ||
                        t.subcategory?.includes("subscription") ||
                        t.category?.includes("streaming") ||
                        t.subcategory?.includes("streaming")
                    ) {
                        isMatch = true;
                    }
                    else if (
                        t.category?.includes("utilities") ||
                        t.subcategory?.includes("utilities") ||
                        t.category?.includes("telecommunication") ||
                        t.subcategory?.includes("cable")
                    ) {
                        isMatch = true;
                        category = "housing";
                    }
                    else if (t.category?.includes("insurance")) {
                        isMatch = true;
                        category = "insurance";
                    }

                    if (!isMatch) continue;

                    // Clean and normalize the name
                    const normalizedName = normalizeMerchantName(t.description);
                    if (!normalizedName || normalizedName.length < 3) continue;

                    // Skip if already tracked (fuzzy match)
                    if (matchesExistingRenewal(normalizedName, trackedSet, trackedNormalized)) continue;

                    // Group by normalized name (cross-institution dedup)
                    if (!merchantGroups.has(normalizedName)) {
                        merchantGroups.set(normalizedName, {
                            txns: [],
                            rawName: t.description,
                            category,
                            accountId: t.accountId,
                            linkedCardId: t.linkedCardId,
                            linkedBankAccountId: t.linkedBankAccountId,
                            accountName: t.accountName,
                            institution: t.institution,
                        });
                    }
                    const group = merchantGroups.get(normalizedName);
                    group.txns.push({
                        amount: Math.abs(parseFloat(t.amount) || 0),
                        date: t.date,
                        accountId: t.accountId,
                    });
                    // Keep the best raw name (longest, most descriptive)
                    if (t.description.length > group.rawName.length) {
                        group.rawName = t.description;
                    }
                }

                // Analyze each merchant group for recurring pattern
                const candidates = [];

                for (const [normName, group] of merchantGroups) {
                    const entries = group.txns;
                    if (entries.length < 1) continue;

                    // Check amount consistency across occurrences
                    const amounts = entries.map(e => e.amount).filter(a => a > 0);
                    if (amounts.length === 0) continue;
                    const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;

                    // For single transactions, use them as-is with lower confidence
                    let confidence = 0.6;
                    let frequency = "monthly"; // Default assumption

                    if (entries.length >= 2) {
                        // Check amount variance (within 15% tolerance for utility bills)
                        const maxVariance = group.category === "housing" ? 0.25 : 0.15;
                        const consistent = amounts.every(a => Math.abs(a - avg) / avg < maxVariance);
                        if (!consistent) continue; // Too much variance — likely not recurring

                        // Detect frequency from date gaps
                        const dates = entries
                            .map(e => new Date(e.date))
                            .filter(d => !isNaN(d.getTime()))
                            .sort((a, b) => a - b);

                        if (dates.length >= 2) {
                            const gaps = [];
                            for (let i = 1; i < dates.length; i++) {
                                gaps.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
                            }
                            const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
                            if (avgGap < 10) frequency = "weekly";
                            else if (avgGap < 20) frequency = "bi-weekly";
                            else if (avgGap < 45) frequency = "monthly";
                            else if (avgGap < 100) frequency = "quarterly";
                            else frequency = "annual";
                        }

                        confidence = Math.min(0.6 + entries.length * 0.1, 1.0);
                    }

                    // Build a clean display name (Title Case)
                    let cleanName = group.rawName.split(/[\d*#-]/)[0].trim();
                    if (cleanName.length < 3) cleanName = group.rawName.trim();
                    cleanName = cleanName
                        .replace(/\b\w/g, c => c.toUpperCase())
                        .replace(/\s+/g, " ")
                        .trim();

                    const suggestionId = `sub_${cyrb53(normName)}`;
                    if (dismissedIds.has(suggestionId)) continue;

                    // Find the most recent transaction for date estimation
                    const sortedByDate = [...entries].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
                    const mostRecent = sortedByDate[0];
                    const { interval, intervalUnit } = frequencyToInterval(frequency);
                    const nextDue = estimateNextDue(mostRecent?.date, frequency);

                    // Resolve payment method
                    const matchingCard = cards.find(card =>
                        (group.linkedCardId && card?.id === group.linkedCardId) ||
                        card?._plaidAccountId === group.accountId
                    );
                    const matchingBankAccount = !matchingCard
                        ? bankAccounts.find(account =>
                            (group.linkedBankAccountId && account?.id === group.linkedBankAccountId) ||
                            account?._plaidAccountId === group.accountId
                        )
                        : null;

                    candidates.push({
                        id: suggestionId,
                        name: cleanName,
                        amount: Math.round(avg * 100) / 100,
                        interval,
                        intervalUnit,
                        cadence: `${interval} ${intervalUnit}`,
                        category: group.category,
                        source: `Detected from ${entries.length} transaction${entries.length > 1 ? "s" : ""}`,
                        chargedTo: matchingCard
                            ? getShortCardLabel(cards, matchingCard)
                            : matchingBankAccount
                                ? getBankAccountLabel(bankAccounts, matchingBankAccount)
                                : group.accountName || group.institution,
                        chargedToId: matchingCard?.id || matchingBankAccount?.id || "",
                        chargedToType: matchingCard
                            ? RENEWAL_PAYMENT_TYPES.card
                            : matchingBankAccount
                                ? RENEWAL_PAYMENT_TYPES.bank
                                : "",
                        nextDue,
                        txDate: mostRecent?.date || "",
                        confidence,
                        frequency,
                    });
                }

                // Sort: highest confidence first, then most recent
                const results = candidates.sort((a, b) => {
                    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
                    return (b.txDate || "").localeCompare(a.txDate || "");
                });

                setDetected(results);
            } catch (e) {
                void log.error("subscriptions", "Subscription scan failed", { error: e });
            } finally {
                setLoading(false);
            }
        }

        scan();
    }, [existingRenewals, isPro]);

    const dismissSuggestion = async (suggestionId) => {
        setDetected(prev => prev.filter(s => s.id !== suggestionId));
        try {
            const existing = await db.get("dismissed-suggestions") || [];
            if (!existing.includes(suggestionId)) {
                await db.set("dismissed-suggestions", [...existing, suggestionId]);
            }
        } catch {
            // Dismissal persistence is best-effort only.
        }
    };

    return { detected, loading, dismissSuggestion };
}

// Simple fast string hash for generating stable IDs
const cyrb53 = (str, seed = 0) => {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};
