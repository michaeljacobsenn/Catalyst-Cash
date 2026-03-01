// ═══════════════════════════════════════════════════════════════
// MERCHANT MAP — Smart Auto-Categorization Engine
// ═══════════════════════════════════════════════════════════════
// Maps merchant names → categories for CSV imports and manual
// transaction entry. Uses a curated baseline + user-learnable
// overrides stored in IndexedDB.
// ═══════════════════════════════════════════════════════════════

import { db } from "./utils.js";

const USER_MAP_KEY = "merchant-category-map";

// ── Curated Baseline (top 200+ US merchants) ──
const BASELINE = {
    // Grocery
    "walmart": "Groceries", "target": "Groceries", "kroger": "Groceries", "costco": "Groceries",
    "aldi": "Groceries", "trader joe": "Groceries", "whole foods": "Groceries", "publix": "Groceries",
    "safeway": "Groceries", "albertsons": "Groceries", "heb": "Groceries", "wegmans": "Groceries",
    "winco": "Groceries", "giant": "Groceries", "food lion": "Groceries", "meijer": "Groceries",
    "piggly wiggly": "Groceries", "sprouts": "Groceries", "instacart": "Groceries", "fresh market": "Groceries",

    // Dining
    "mcdonald": "Dining", "starbucks": "Dining", "chipotle": "Dining", "chick-fil-a": "Dining",
    "subway": "Dining", "taco bell": "Dining", "wendy": "Dining", "burger king": "Dining",
    "panda express": "Dining", "olive garden": "Dining", "applebee": "Dining", "ihop": "Dining",
    "dunkin": "Dining", "panera": "Dining", "five guys": "Dining", "dominos": "Dining",
    "pizza hut": "Dining", "chilis": "Dining", "buffalo wild": "Dining", "popeyes": "Dining",
    "grubhub": "Dining", "doordash": "Dining", "uber eats": "Dining", "postmates": "Dining",
    "seamless": "Dining", "restaurant": "Dining", "cafe": "Dining", "diner": "Dining",

    // Gas & Auto
    "shell": "Gas & Auto", "exxon": "Gas & Auto", "chevron": "Gas & Auto", "bp": "Gas & Auto",
    "sunoco": "Gas & Auto", "marathon": "Gas & Auto", "circle k": "Gas & Auto", "wawa": "Gas & Auto",
    "speedway": "Gas & Auto", "sheetz": "Gas & Auto", "pilot": "Gas & Auto", "quik trip": "Gas & Auto",
    "autozone": "Gas & Auto", "o'reilly": "Gas & Auto", "advance auto": "Gas & Auto",
    "car wash": "Gas & Auto", "jiffy lube": "Gas & Auto", "valvoline": "Gas & Auto",

    // Subscriptions & Streaming
    "netflix": "Subscriptions", "spotify": "Subscriptions", "hulu": "Subscriptions",
    "disney+": "Subscriptions", "disney plus": "Subscriptions", "hbo max": "Subscriptions",
    "apple tv": "Subscriptions", "amazon prime": "Subscriptions", "youtube premium": "Subscriptions",
    "paramount": "Subscriptions", "peacock": "Subscriptions", "crunchyroll": "Subscriptions",
    "adobe": "Subscriptions", "microsoft 365": "Subscriptions", "icloud": "Subscriptions",
    "google one": "Subscriptions", "dropbox": "Subscriptions", "audible": "Subscriptions",

    // Shopping
    "amazon": "Shopping", "ebay": "Shopping", "etsy": "Shopping", "best buy": "Shopping",
    "home depot": "Shopping", "lowe": "Shopping", "ikea": "Shopping", "wayfair": "Shopping",
    "bed bath": "Shopping", "marshalls": "Shopping", "tjmaxx": "Shopping", "ross": "Shopping",
    "nordstrom": "Shopping", "macy": "Shopping", "old navy": "Shopping", "gap": "Shopping",
    "nike": "Shopping", "adidas": "Shopping", "shein": "Shopping", "temu": "Shopping",

    // Health & Wellness
    "cvs": "Health", "walgreens": "Health", "rite aid": "Health", "gnc": "Health",
    "planet fitness": "Health", "anytime fitness": "Health", "la fitness": "Health",
    "orangetheory": "Health", "equinox": "Health", "pharmacy": "Health", "urgent care": "Health",
    "hospital": "Health", "medical": "Health", "dental": "Health", "optometrist": "Health",
    "therapy": "Health", "doctor": "Health", "clinic": "Health",

    // Transportation
    "uber": "Transportation", "lyft": "Transportation", "lime": "Transportation",
    "bird": "Transportation", "amtrak": "Transportation", "greyhound": "Transportation",
    "metrocard": "Transportation", "transit": "Transportation", "parking": "Transportation",
    "toll": "Transportation",

    // Utilities
    "electric": "Utilities", "water": "Utilities", "gas bill": "Utilities",
    "comcast": "Utilities", "xfinity": "Utilities", "att": "Utilities", "verizon": "Utilities",
    "t-mobile": "Utilities", "spectrum": "Utilities", "cox": "Utilities", "centurylink": "Utilities",
    "frontier": "Utilities", "internet": "Utilities",

    // Insurance
    "geico": "Insurance", "state farm": "Insurance", "progressive": "Insurance",
    "allstate": "Insurance", "liberty mutual": "Insurance", "usaa insurance": "Insurance",
    "nationwide": "Insurance",

    // Housing
    "rent": "Housing", "mortgage": "Housing", "hoa": "Housing",

    // Personal Care
    "supercuts": "Personal Care", "great clips": "Personal Care", "barber": "Personal Care",
    "salon": "Personal Care", "sephora": "Personal Care", "ulta": "Personal Care",

    // Education
    "tuition": "Education", "student loan": "Education", "coursera": "Education",
    "udemy": "Education", "skillshare": "Education", "brilliant": "Education",

    // Entertainment
    "amc": "Entertainment", "regal": "Entertainment", "cinemark": "Entertainment",
    "ticketmaster": "Entertainment", "stubhub": "Entertainment", "steam": "Entertainment",
    "xbox": "Entertainment", "playstation": "Entertainment", "nintendo": "Entertainment",

    // Travel
    "airline": "Travel", "hotel": "Travel", "airbnb": "Travel", "vrbo": "Travel",
    "expedia": "Travel", "booking.com": "Travel", "southwest": "Travel", "delta": "Travel",
    "united": "Travel", "american airlines": "Travel", "jetblue": "Travel",
    "marriott": "Travel", "hilton": "Travel", "hyatt": "Travel",

    // Transfers & Finance
    "venmo": "Transfer", "zelle": "Transfer", "paypal": "Transfer", "cash app": "Transfer",
    "atm": "ATM Withdrawal",
};

// ── User-learned overrides — loaded from DB ──
let userOverrides = {};
let loaded = false;

async function ensureLoaded() {
    if (loaded) return;
    const saved = await db.get(USER_MAP_KEY);
    if (saved && typeof saved === "object") userOverrides = saved;
    loaded = true;
}

/**
 * Categorize a merchant description string.
 * Returns { category: string, confidence: "high"|"medium"|"low" } or null.
 */
export async function categorize(description) {
    if (!description || typeof description !== "string") return null;
    await ensureLoaded();

    const lower = description.toLowerCase().trim();

    // 1. Exact user override (highest priority)
    if (userOverrides[lower]) {
        return { category: userOverrides[lower], confidence: "high" };
    }

    // 2. Baseline substring match
    for (const [key, cat] of Object.entries(BASELINE)) {
        if (lower.includes(key)) {
            return { category: cat, confidence: "high" };
        }
    }

    // 3. User overrides — fuzzy
    for (const [key, cat] of Object.entries(userOverrides)) {
        if (lower.includes(key) || key.includes(lower)) {
            return { category: cat, confidence: "medium" };
        }
    }

    return null; // Unknown — user should select manually
}

/**
 * Batch categorize an array of {description, ...} objects.
 * Returns a Map<description, {category, confidence}>.
 */
export async function categorizeBatch(items) {
    const results = new Map();
    for (const item of items) {
        const desc = item.description || item.name || item.memo || "";
        const result = await categorize(desc);
        if (result) results.set(desc, result);
    }
    return results;
}

/**
 * Learn: when a user manually selects a category for a merchant,
 * store the mapping for future auto-categorization.
 */
export async function learn(description, category) {
    if (!description || !category) return;
    await ensureLoaded();
    const key = description.toLowerCase().trim();
    userOverrides[key] = category;
    await db.set(USER_MAP_KEY, userOverrides);
}

/**
 * Get all known categories (baseline + user).
 */
export function getKnownCategories() {
    const cats = new Set(Object.values(BASELINE));
    Object.values(userOverrides).forEach(c => cats.add(c));
    return [...cats].sort();
}

/**
 * Detect potential recurring transactions from a list of categorized entries.
 * Returns patterns like [{description, amounts, frequency, category}].
 */
export function detectRecurring(transactions) {
    if (!transactions?.length) return [];

    const byDesc = {};
    for (const t of transactions) {
        const key = (t.description || t.name || "").toLowerCase().trim();
        if (!key) continue;
        if (!byDesc[key]) byDesc[key] = [];
        byDesc[key].push({
            amount: Math.abs(parseFloat(t.amount) || 0),
            date: t.date ? new Date(t.date) : null
        });
    }

    const recurring = [];
    for (const [desc, entries] of Object.entries(byDesc)) {
        if (entries.length < 2) continue;

        // Check amount consistency (within 10% variance)
        const amounts = entries.map(e => e.amount).filter(a => a > 0);
        if (amounts.length < 2) continue;
        const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
        const consistent = amounts.every(a => Math.abs(a - avg) / avg < 0.1);

        if (consistent) {
            // Estimate frequency from date gaps
            const dates = entries.map(e => e.date).filter(Boolean).sort((a, b) => a - b);
            let frequency = "monthly";
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

            recurring.push({
                description: desc,
                averageAmount: Math.round(avg * 100) / 100,
                count: entries.length,
                frequency,
                category: null // Will be enriched by caller
            });
        }
    }

    return recurring.sort((a, b) => b.averageAmount - a.averageAmount);
}
