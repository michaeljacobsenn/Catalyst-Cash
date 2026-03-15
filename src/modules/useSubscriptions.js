  import { useEffect,useState } from "react";
  import { getStoredTransactions } from "./plaid.js";
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
 * Custom hook that scans locally stored Plaid transactions for likely recurring
 * subscriptions and bills that are NOT already tracked in the user's Renewals.
 */
export function useSubscriptions(existingRenewals = [], isPro = false) {
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
                    getStoredTransactions(),
                    db.get("dismissed-suggestions").then(res => new Set(res || []))
                ]);

                if (!stored || !stored.data) {
                    setLoading(false);
                    return;
                }

                const txns = stored.data;
                const candidates = new Map(); // Key -> Candidate Object

                const trackedNames = new Set(
                    existingRenewals.map(r => r.name?.toLowerCase().trim())
                );

                for (const t of txns) {
                    if (t.isCredit) continue; // Skip deposits/refunds
                    if (t.amount < 1 || t.amount > 2500) continue; // Unlikely to be a standard sub

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

                    if (isMatch) {
                        let cleanName = t.description.split(/[\d\*\#\-]/)[0].trim();
                        if (cleanName.length < 3) cleanName = t.description;

                        if (trackedNames.has(cleanName.toLowerCase())) continue;

                        const suggestionId = `sub_${cyrb53(cleanName + t.institution)}`;
                        if (dismissedIds.has(suggestionId)) continue; // User ignored this in the past

                        const key = `${cleanName}-${t.institution}`;
                        if (!candidates.has(key)) {
                            // Guess interval: usually 1 month
                            const txDate = new Date(t.date);
                            txDate.setMonth(txDate.getMonth() + 1);
                            const nextDue = txDate.toISOString().split("T")[0];

                            candidates.set(key, {
                                id: suggestionId,
                                name: cleanName.charAt(0).toUpperCase() + cleanName.slice(1).toLowerCase(), // Cleaner display name
                                amount: t.amount,
                                interval: 1,
                                intervalUnit: "months",
                                cadence: "1 month",
                                category: category,
                                source: "Detected from account",
                                chargedTo: t.accountName || t.institution,
                                nextDue: nextDue,
                                txDate: t.date, // keep for internal sorting
                                confidence: 0.8
                            });
                        } else {
                            const existing = candidates.get(key);
                            existing.confidence = Math.min(existing.confidence + 0.1, 1.0);

                            // Keep the most recent transaction's data
                            if (t.date > existing.txDate) {
                                existing.amount = t.amount;
                                existing.txDate = t.date;
                            }
                        }
                    }
                }

                const results = Array.from(candidates.values())
                    .sort((a, b) => {
                        if (b.confidence !== a.confidence) return b.confidence - a.confidence;
                        return b.txDate.localeCompare(a.txDate);
                    });

                setDetected(results);
            } catch (e) {
                console.error("Subscription scan failed:", e);
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
        } catch (e) { }
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
