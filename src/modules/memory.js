// ═══════════════════════════════════════════════════════════════
// PERSISTENT AI MEMORY — Cross-session learning for the CFO
// ═══════════════════════════════════════════════════════════════
// Zero extra API calls — facts extracted inline from chat
// responses via [REMEMBER: ...] tags. Audit milestones detected
// deterministically. All data encrypted at rest.
// ═══════════════════════════════════════════════════════════════

import { db } from "./utils.js";
import { encryptAtRest, decryptAtRest, isEncrypted } from "./crypto.js";

const MEMORY_DB_KEY = "ai-persistent-memory";
const MAX_FACTS = 30;
const MAX_MILESTONES = 20;

// ── PII scrubber (mirrors AIChatTab pattern) ──
const PII_PATTERNS = [
    /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
    /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/g,
    /\b\d{9}\b/g,
    /\b\d{10,17}\b/g,
];
function scrubPII(text) {
    if (!text || typeof text !== "string") return text;
    let clean = text;
    for (const pattern of PII_PATTERNS) {
        clean = clean.replace(pattern, (m) =>
            m.length >= 8 ? "•".repeat(m.length - 4) + m.slice(-4) : "•".repeat(m.length)
        );
    }
    return clean;
}

// ═══════════════════════════════════════════════════════════════
// LOAD / SAVE
// ═══════════════════════════════════════════════════════════════

/**
 * Load persistent memory from DB.
 * Returns { facts: [...], milestones: [...] }
 */
export async function loadMemory() {
    try {
        let raw = await db.get(MEMORY_DB_KEY);
        if (!raw) return { facts: [], milestones: [] };
        if (isEncrypted(raw)) {
            raw = await decryptAtRest(raw, db).catch(() => null);
            if (!raw) return { facts: [], milestones: [] };
        }
        return {
            facts: Array.isArray(raw.facts) ? raw.facts : [],
            milestones: Array.isArray(raw.milestones) ? raw.milestones : []
        };
    } catch {
        return { facts: [], milestones: [] };
    }
}

/**
 * Persist memory to DB (encrypted at rest).
 */
async function persistMemory(memory) {
    const payload = await encryptAtRest(memory, db).catch(() => memory);
    await db.set(MEMORY_DB_KEY, payload);
}

// ═══════════════════════════════════════════════════════════════
// FACT MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Add new facts, deduplicate, cap at MAX_FACTS.
 * @param {string[]} newFacts — raw fact strings from REMEMBER tags
 */
export async function addFacts(newFacts) {
    if (!newFacts?.length) return;
    const memory = await loadMemory();
    const existing = new Set(memory.facts.map(f => f.fact.toLowerCase().trim()));

    for (const raw of newFacts) {
        const cleaned = scrubPII(raw.trim());
        if (!cleaned || cleaned.length < 5) continue;
        const key = cleaned.toLowerCase().trim();
        if (existing.has(key)) continue;
        existing.add(key);
        memory.facts.push({
            fact: cleaned,
            category: categorize(cleaned),
            ts: Date.now()
        });
    }

    // Cap: keep most recent facts
    if (memory.facts.length > MAX_FACTS) {
        memory.facts = memory.facts.slice(-MAX_FACTS);
    }
    await persistMemory(memory);
    return memory;
}

/**
 * Auto-categorize a fact string.
 */
function categorize(fact) {
    const lower = fact.toLowerCase();
    if (/\b(goal|target|saving for|want to|plan to|by \d{4}|deadline)\b/.test(lower)) return "goal";
    if (/\b(prefer|always|never|don't|avoid|hate|love)\b/.test(lower)) return "preference";
    if (/\b(partner|spouse|wife|husband|kid|child|family|job|work|salary|income)\b/.test(lower)) return "context";
    if (/\b(hit|reached|achieved|cleared|paid off|zeroed|milestone|first)\b/.test(lower)) return "milestone";
    return "context";
}

// ═══════════════════════════════════════════════════════════════
// REMEMBER TAG EXTRACTION (from chat responses)
// ═══════════════════════════════════════════════════════════════

/**
 * Parse [REMEMBER: ...] tags from an AI response.
 * Returns { cleanText, newFacts }.
 * cleanText has the tags stripped for display.
 */
export function extractMemoryTags(responseText) {
    if (!responseText) return { cleanText: responseText || "", newFacts: [] };

    const tagPattern = /\[REMEMBER:\s*(.+?)\]/gi;
    const newFacts = [];
    let match;

    while ((match = tagPattern.exec(responseText)) !== null) {
        const fact = match[1].trim();
        if (fact.length >= 5) {
            newFacts.push(fact);
        }
    }

    // Strip tags from displayed text (also clean up trailing whitespace/newlines left behind)
    const cleanText = responseText
        .replace(tagPattern, "")
        .replace(/\n{3,}/g, "\n\n")
        .trimEnd();

    return { cleanText, newFacts };
}

// ═══════════════════════════════════════════════════════════════
// AUDIT MILESTONE EXTRACTION (deterministic — no AI needed)
// ═══════════════════════════════════════════════════════════════

/**
 * Detect milestones from a completed audit.
 * @param {object} parsed — the parsed audit JSON (healthScore, dashboardCard, investments, etc.)
 * @param {object[]} prevHistory — array of previous audit entries
 * @returns {string[]} — milestone strings to persist
 */
export function extractAuditMilestones(parsed, prevHistory = []) {
    const milestones = [];
    if (!parsed) return milestones;

    const score = parsed.healthScore?.score;
    const prevScores = (prevHistory || [])
        .map(h => h.parsed?.healthScore?.score)
        .filter(s => typeof s === "number");
    const lastScore = prevScores[prevScores.length - 1];
    const maxPrevScore = prevScores.length ? Math.max(...prevScores) : 0;

    // First audit
    if (!prevHistory?.length || prevScores.length === 0) {
        milestones.push(`First audit completed — starting score: ${score || "N/A"}`);
    }

    // Score threshold crossings (only trigger once)
    if (typeof score === "number" && prevScores.length > 0) {
        const thresholds = [
            { val: 90, label: "A-tier" },
            { val: 80, label: "B-tier" },
            { val: 70, label: "C-tier" },
        ];
        for (const t of thresholds) {
            if (score >= t.val && maxPrevScore < t.val) {
                milestones.push(`Score crossed ${t.val} — entered ${t.label} (${score})`);
            }
        }

        // Score dropped significantly
        if (typeof lastScore === "number" && score <= lastScore - 10) {
            milestones.push(`Score dropped ${lastScore - score} points (${lastScore} → ${score})`);
        }
    }

    // Debt milestones via dashboardCard
    const debtRow = parsed.dashboardCard?.find?.(r => r.category === "Debts");
    const debtStr = debtRow?.amount || "";
    const debtVal = parseFloat(debtStr.replace(/[^0-9.-]/g, "")) || 0;
    const prevDebtVals = (prevHistory || [])
        .map(h => {
            const row = h.parsed?.dashboardCard?.find?.(r => r.category === "Debts");
            return parseFloat((row?.amount || "0").replace(/[^0-9.-]/g, "")) || 0;
        })
        .filter(d => d > 0);

    if (debtVal === 0 && prevDebtVals.length > 0 && prevDebtVals[prevDebtVals.length - 1] > 0) {
        milestones.push("All revolving debt cleared — $0 balance achieved 🎉");
    }

    // Net worth milestones
    const nwStr = parsed.investments?.netWorth || "";
    const nw = parseFloat(nwStr.replace(/[^0-9.-]/g, "")) || 0;
    const prevNWs = (prevHistory || [])
        .map(h => parseFloat((h.parsed?.investments?.netWorth || "0").replace(/[^0-9.-]/g, "")) || 0);
    const maxPrevNW = prevNWs.length ? Math.max(...prevNWs) : -Infinity;

    // Positive net worth
    if (nw > 0 && prevNWs.length > 0 && prevNWs[prevNWs.length - 1] <= 0) {
        milestones.push("Net worth turned positive 🚀");
    }

    // Net worth milestones
    const nwThresholds = [5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];
    for (const t of nwThresholds) {
        if (nw >= t && maxPrevNW < t) {
            const label = t >= 1000000 ? `$${(t / 1000000).toFixed(0)}M` : `$${(t / 1000).toFixed(0)}k`;
            milestones.push(`Net worth crossed ${label}`);
        }
    }

    return milestones;
}

/**
 * Persist new milestones (deduplicates, caps at MAX_MILESTONES).
 */
export async function addMilestones(newMilestones) {
    if (!newMilestones?.length) return;
    const memory = await loadMemory();
    const existing = new Set(memory.milestones.map(m => m.text.toLowerCase()));

    for (const text of newMilestones) {
        const key = text.toLowerCase();
        // Skip exact duplicates, but allow score-related milestones that differ
        if (existing.has(key)) continue;
        existing.add(key);
        memory.milestones.push({ text, ts: Date.now() });
    }

    if (memory.milestones.length > MAX_MILESTONES) {
        memory.milestones = memory.milestones.slice(-MAX_MILESTONES);
    }
    await persistMemory(memory);
    return memory;
}

// ═══════════════════════════════════════════════════════════════
// PROMPT BLOCK FORMATTER
// ═══════════════════════════════════════════════════════════════

/**
 * Format all persistent memory into a prompt-injectable block.
 * @param {object} memory — { facts, milestones } from loadMemory()
 * @returns {string} — ready to inject into system prompt, or "" if empty
 */
export function getMemoryBlock(memory) {
    if (!memory) return "";
    const parts = [];

    const { facts, milestones } = memory;
    const hasFacts = facts?.length > 0;
    const hasMilestones = milestones?.length > 0;

    if (!hasFacts && !hasMilestones) return "";

    parts.push("========================");
    parts.push("PERSISTENT MEMORY — WHAT YOU KNOW ABOUT THIS USER (HARD)");
    parts.push("========================");
    parts.push("These facts persist across sessions. Reference them naturally in your responses.");
    parts.push("Do NOT repeat these facts back verbatim — weave them into context-aware advice.");
    parts.push("If any fact appears outdated or contradicted by current data, note the discrepancy.");

    if (hasFacts) {
        parts.push("");
        parts.push("[USER FACTS]");
        // Group by category
        const groups = { goal: [], preference: [], context: [], milestone: [] };
        for (const f of facts) {
            (groups[f.category] || groups.context).push(f.fact);
        }
        if (groups.goal.length) {
            parts.push("Goals:");
            groups.goal.forEach(g => parts.push(`  • ${g}`));
        }
        if (groups.preference.length) {
            parts.push("Preferences:");
            groups.preference.forEach(p => parts.push(`  • ${p}`));
        }
        if (groups.context.length) {
            parts.push("Personal Context:");
            groups.context.forEach(c => parts.push(`  • ${c}`));
        }
    }

    if (hasMilestones) {
        parts.push("");
        parts.push("[JOURNEY MILESTONES]");
        // Show most recent milestones first (reverse chronological)
        const recent = [...milestones].reverse().slice(0, 10);
        recent.forEach(m => {
            const dateStr = new Date(m.ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
            parts.push(`  ${dateStr}: ${m.text}`);
        });
    }

    parts.push("========================");
    return parts.join("\n");
}

// ═══════════════════════════════════════════════════════════════
// CLEAR / RESET
// ═══════════════════════════════════════════════════════════════

export async function clearMemory() {
    await db.del(MEMORY_DB_KEY);
}
