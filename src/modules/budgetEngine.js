/**
 * budgetEngine.js — Paycheck CFO Budgeting Logic
 *
 * Core engine for the paycheck-cycle budget system.
 * All math is per-paycheck-cycle, not monthly.
 */

/** @param {import("../../types/index.js").PayFrequency} freq */
export function paychecksPerMonth(freq) {
  if (freq === "weekly") return 4.33;
  if (freq === "bi-weekly") return 2.17;
  if (freq === "semi-monthly") return 2;
  return 1; // monthly
}

/**
 * Returns per-cycle take-home from financialConfig.
 * Uses paycheckStandard (already per-paycheck).
 */
export function computeCycleIncome(financialConfig) {
  return Number(financialConfig?.paycheckStandard) || 0;
}

/**
 * Maps an audit category name to a budget bucket.
 * @returns {"fixed"|"flex"|"invest"}
 */
export function inferBucket(name) {
  const n = (name || "").toLowerCase();
  if (
    n.includes("rent") || n.includes("mortgage") || n.includes("util") ||
    n.includes("electric") || n.includes("water") || n.includes("internet") ||
    n.includes("phone") || n.includes("insurance") || n.includes("subscription") ||
    n.includes("netflix") || n.includes("spotify") || n.includes("hulu") ||
    n.includes("gym") || n.includes("loan") || n.includes("minimum")
  ) return "fixed";
  if (
    n.includes("invest") || n.includes("roth") || n.includes("401k") ||
    n.includes("hsa") || n.includes("brokerage") || n.includes("saving") ||
    n.includes("emergency") || n.includes("goal")
  ) return "invest";
  return "flex";
}

/** Emoji icon heuristic for budget category names */
export function inferIcon(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("rent") || n.includes("mortgage") || n.includes("hous")) return "🏠";
  if (n.includes("util") || n.includes("electric") || n.includes("water") || n.includes("gas utility")) return "⚡";
  if (n.includes("grocery") || n.includes("grocer") || n.includes("food")) return "🛒";
  if (n.includes("dining") || n.includes("restaurant") || n.includes("coffee")) return "🍔";
  if (n.includes("gas") || n.includes("fuel") || n.includes("car")) return "⛽";
  if (n.includes("uber") || n.includes("lyft") || n.includes("transit")) return "🚗";
  if (n.includes("phone") || n.includes("mobile") || n.includes("wireless")) return "📱";
  if (n.includes("internet") || n.includes("cable")) return "📡";
  if (n.includes("netflix") || n.includes("hulu") || n.includes("disney") || n.includes("entertainment")) return "🎬";
  if (n.includes("spotify") || n.includes("music") || n.includes("apple music")) return "🎵";
  if (n.includes("gym") || n.includes("fitness") || n.includes("sport")) return "💪";
  if (n.includes("health") || n.includes("doctor") || n.includes("medical") || n.includes("pharmacy")) return "💊";
  if (n.includes("insurance")) return "🛡️";
  if (n.includes("invest") || n.includes("brokerage")) return "📈";
  if (n.includes("roth") || n.includes("ira")) return "🏦";
  if (n.includes("401k") || n.includes("retirement")) return "👴";
  if (n.includes("saving") || n.includes("emergency") || n.includes("goal")) return "🎯";
  if (n.includes("amazon") || n.includes("shopping") || n.includes("retail")) return "🛍️";
  if (n.includes("travel") || n.includes("hotel") || n.includes("flight") || n.includes("airbnb")) return "✈️";
  if (n.includes("gift") || n.includes("donat")) return "🎁";
  if (n.includes("pet")) return "🐾";
  if (n.includes("child") || n.includes("kid") || n.includes("daycare") || n.includes("school")) return "📚";
  if (n.includes("personal") || n.includes("care") || n.includes("hair") || n.includes("beauty")) return "✂️";
  return "💸";
}

/**
 * Auto-generates suggested budget lines from parsed audit categories.
 * Returns array of BudgetLine (not yet persisted).
 * @param {Record<string, { total?: number }>} auditCategories
 * @param {import("../../types/index.js").PayFrequency} payFrequency
 */
export function suggestLinesFromAudit(auditCategories, payFrequency) {
  if (!auditCategories) return [];
  const perMonth = paychecksPerMonth(payFrequency);
  return Object.entries(auditCategories)
    .filter(([, data]) => (data?.total || 0) > 0)
    .map(([name, data]) => {
      const monthlySpend = data?.total || 0;
      // Convert monthly audit spend → per-cycle estimate
      const cycleAmount = Math.round((monthlySpend / perMonth) * 100) / 100;
      return {
        id: `auto-${name.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}`,
        name,
        amount: cycleAmount,
        bucket: inferBucket(name),
        icon: inferIcon(name),
        isAuto: true,
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Compute summary stats from current budget lines.
 * @param {Array} lines
 * @param {number} cycleIncome
 */
export function computeBudgetStatus(lines, cycleIncome) {
  const totalFixed = lines.filter(l => l.bucket === "fixed").reduce((s, l) => s + (l.amount || 0), 0);
  const totalFlex = lines.filter(l => l.bucket === "flex").reduce((s, l) => s + (l.amount || 0), 0);
  const totalInvest = lines.filter(l => l.bucket === "invest").reduce((s, l) => s + (l.amount || 0), 0);
  const totalAssigned = totalFixed + totalFlex + totalInvest;
  const readyToAssign = cycleIncome - totalAssigned;
  return { totalFixed, totalFlex, totalInvest, totalAssigned, readyToAssign };
}

/**
 * Map audit category actuals to a budget line for progress bars.
 * Uses multi-strategy matching: exact → includes → shared token overlap.
 * @param {Record<string, { total?: number }>} auditCategories
 * @param {string} lineName
 * @param {import("../../types/index.js").PayFrequency} payFrequency
 */
export function getActualSpendForLine(auditCategories, lineName, payFrequency) {
  if (!auditCategories) return 0;
  const n = lineName.toLowerCase().trim();
  const nTokens = new Set(n.split(/[\s\-&/]+/).filter(t => t.length > 2));

  let bestMonthlySpend = 0;
  let bestScore = 0;

  for (const [cat, data] of Object.entries(auditCategories)) {
    const c = cat.toLowerCase().trim();
    const monthly = (data)?.total ?? 0;
    if (!monthly) continue;

    let score = 0;
    if (c === n) {
      score = 100; // exact
    } else if (c.includes(n) || n.includes(c)) {
      score = 70; // substring
    } else {
      const cTokens = c.split(/[\s\-&/]+/).filter(t => t.length > 2);
      const overlap = cTokens.filter(t => nTokens.has(t) || n.includes(t) || t.includes(n)).length;
      if (overlap > 0) score = 30 + overlap * 10; // token overlap
    }

    if (score > bestScore) {
      bestScore = score;
      bestMonthlySpend = monthly;
    }
  }

  if (bestScore === 0) return 0;
  return Math.round((bestMonthlySpend / paychecksPerMonth(payFrequency)) * 100) / 100;
}

export const BUCKET_CONFIG = {
  fixed: { label: "Fixed", emoji: "🔒", description: "Bills & recurring — same every cycle", color: "#7C6FFF" },
  flex:  { label: "Flex",  emoji: "🌊", description: "Variable spending — food, gas, fun",  color: "#34D399" },
  invest:{ label: "Invest", emoji: "📈", description: "Savings, goals, retirement",          color: "#F59E0B" },
};
