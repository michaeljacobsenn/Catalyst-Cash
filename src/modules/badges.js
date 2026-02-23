// ═══════════════════════════════════════════════════════════════
// ACHIEVEMENT BADGES — Unlockable gamification system
// ═══════════════════════════════════════════════════════════════
import { db } from "./utils.js";

export const BADGE_DEFINITIONS = [
    // Onboarding
    { id: "first_audit", emoji: "✅", name: "First Audit", desc: "Completed your first financial audit", tier: "bronze" },
    { id: "profile_complete", emoji: "📋", name: "Profile Pro", desc: "Fully configured your financial profile", tier: "bronze" },

    // Consistency
    { id: "streak_4", emoji: "🔥", name: "Momentum", desc: "Hit a 4-week audit streak", tier: "silver" },
    { id: "streak_8", emoji: "🔥", name: "On Fire", desc: "Hit an 8-week audit streak", tier: "gold" },
    { id: "streak_12", emoji: "💎", name: "Streak Master", desc: "12-week audit streak — unstoppable", tier: "platinum" },

    // Financial milestones
    { id: "score_80", emoji: "🏆", name: "A-Player", desc: "Reached a health score of 80+", tier: "silver" },
    { id: "score_90", emoji: "👑", name: "Elite Status", desc: "Reached a health score of 90+", tier: "gold" },
    { id: "debt_destroyer", emoji: "💀", name: "Debt Destroyer", desc: "Paid off a credit card completely", tier: "gold" },
    { id: "savings_1k", emoji: "🏦", name: "Savings Starter", desc: "Saved $1,000+ in your vault", tier: "silver" },
    { id: "savings_5k", emoji: "💰", name: "Savings Machine", desc: "Saved $5,000+ in your vault", tier: "gold" },
    { id: "net_worth_positive", emoji: "📈", name: "In The Green", desc: "Achieved a positive net worth", tier: "silver" },

    // Engagement
    { id: "shared_score", emoji: "📤", name: "Social Butterfly", desc: "Shared your health score", tier: "bronze" },
    { id: "persona_set", emoji: "🎭", name: "My Style", desc: "Chose an AI personality", tier: "bronze" },
    { id: "budget_boss", emoji: "👑", name: "Budget Boss", desc: "4 consecutive weeks under budget", tier: "gold" },
    { id: "challenge_complete", emoji: "⚡", name: "Challenge Accepted", desc: "Completed a weekly micro-challenge", tier: "silver" },
    { id: "challenge_streak_4", emoji: "🎯", name: "Challenge Master", desc: "Completed 4 weekly challenges in a row", tier: "gold" },
];

const TIER_COLORS = {
    bronze: { bg: "#CD7F3220", border: "#CD7F3250", text: "#CD7F32" },
    silver: { bg: "#C0C0C020", border: "#C0C0C050", text: "#C0C0C0" },
    gold: { bg: "#FFD70020", border: "#FFD70050", text: "#FFD700" },
    platinum: { bg: "#E5E4E220", border: "#E5E4E260", text: "#E5E4E2" },
};

export { TIER_COLORS };

// ═══════════════════════════════════════════════════════════════
// BADGE EVALUATION — checks history + state and returns newly unlocked badges
// ═══════════════════════════════════════════════════════════════
export async function evaluateBadges({ history, streak, financialConfig, persona, current }) {
    const existing = (await db.get("unlocked-badges")) || {};
    const newlyUnlocked = [];

    const check = (id) => {
        if (!existing[id]) {
            existing[id] = Date.now();
            newlyUnlocked.push(id);
        }
    };

    const realAudits = (history || []).filter(a => !a.isTest);

    // First audit
    if (realAudits.length >= 1) check("first_audit");

    // Streaks
    if (streak >= 4) check("streak_4");
    if (streak >= 8) check("streak_8");
    if (streak >= 12) check("streak_12");

    // Health score milestones
    const latestScore = current?.parsed?.healthScore?.score;
    if (latestScore >= 80) check("score_80");
    if (latestScore >= 90) check("score_90");

    // Debt destroyer — check if any card has $0 balance in latest but had balance in prior audits
    if (realAudits.length >= 2 && current?.form?.debts) {
        const currentDebts = current.form.debts;
        const prevDebts = realAudits[1]?.form?.debts || [];
        const sameDebt = (a, b) => {
            if (a?.cardId && b?.cardId) return a.cardId === b.cardId;
            if (a?.id && b?.id) return a.id === b.id; // legacy fallback
            return (a?.name || "").trim().toLowerCase() === (b?.name || "").trim().toLowerCase();
        };
        for (const cd of currentDebts) {
            const bal = parseFloat(cd.balance) || 0;
            const prevCard = prevDebts.find(pd => sameDebt(pd, cd));
            if (bal <= 0.01 && prevCard && (parseFloat(prevCard.balance) || 0) > 100) {
                check("debt_destroyer");
            }
        }
    }

    // Savings milestones
    const vault = parseFloat(current?.form?.ally) || 0;
    if (vault >= 1000) check("savings_1k");
    if (vault >= 5000) check("savings_5k");

    // Net worth positive
    if (current?.parsed?.netWorth != null && current.parsed.netWorth > 0) check("net_worth_positive");

    // Persona set
    if (persona) check("persona_set");

    // Profile complete
    if (financialConfig && financialConfig.paycheckStandard > 0 && financialConfig.emergencyFloor > 0) {
        check("profile_complete");
    }

    // Budget boss — 4 consecutive GREEN statuses
    if (realAudits.length >= 4) {
        const last4 = realAudits.slice(0, 4);
        if (last4.every(a => a.parsed?.status === "GREEN")) check("budget_boss");
    }

    // Save updated badges
    if (newlyUnlocked.length > 0) {
        await db.set("unlocked-badges", existing);
    }

    return { unlocked: existing, newlyUnlocked };
}

// Manual badge unlock (for share, challenge, etc.)
export async function unlockBadge(id) {
    const existing = (await db.get("unlocked-badges")) || {};
    if (!existing[id]) {
        existing[id] = Date.now();
        await db.set("unlocked-badges", existing);
        return true;
    }
    return false;
}
