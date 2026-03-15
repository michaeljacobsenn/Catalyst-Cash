/**
 * Onboarding Coachmarks System
 *
 * Manages first-time user tooltips/coachmarks for key features.
 * Uses IndexedDB (via the app's db module) to track which tips
 * have been seen. Each tip fires only once per user.
 *
 * Usage:
 *   import { useCoachmark } from './coachmarks.js';
 *   const { show, dismiss } = useCoachmark('audit-first-run');
 *
 *   {show && <Coachmark text="Tap here to run your first audit!" onDismiss={dismiss} />}
 */

  import { useCallback,useEffect,useState } from "react";
  import { db } from "./utils.js";

const COACHMARK_PREFIX = "coachmark-seen-";

/**
 * All available coachmark definitions.
 * Add new onboarding tips here with a unique key, text, and optional position.
 */
export const COACHMARKS = {
  "first-audit": {
    text: "Tap here to run your first financial audit — it only takes 2 minutes!",
    position: "below",
  },
  "card-portfolio": {
    text: "Add your credit cards here to track balances, limits, and utilization.",
    position: "below",
  },
  "fire-projection": {
    text: "Your FIRE projection shows when you could reach financial independence.",
    position: "above",
  },
  "weekly-budget": {
    text: "Switch to Budget view to track your weekly spending against your allowance.",
    position: "below",
  },
  "export-data": {
    text: "Export your audit data as PDF or spreadsheet to keep offline records.",
    position: "below",
  },
  "plaid-sync": {
    text: "Connect your bank to auto-import balances and transactions.",
    position: "below",
  },
  "debt-simulator": {
    text: "Use the debt simulator to see how extra payments accelerate your payoff.",
    position: "below",
  },
};

/**
 * React hook for a single coachmark.
 * Returns { show, dismiss } where show is true if the tip hasn't been seen yet.
 *
 * @param {string} key - Coachmark key from COACHMARKS
 * @param {boolean} [condition=true] - Extra condition to control visibility
 * @returns {{ show: boolean, dismiss: () => void }}
 */
export function useCoachmark(key, condition = true) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!condition || !COACHMARKS[key]) return;

    let cancelled = false;
    (async () => {
      try {
        const seen = await db.get(`${COACHMARK_PREFIX}${key}`);
        if (!cancelled && !seen) {
          setShow(true);
        }
      } catch {
        // If db fails, don't show coachmark (fail safe)
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key, condition]);

  const dismiss = useCallback(async () => {
    setShow(false);
    try {
      await db.set(`${COACHMARK_PREFIX}${key}`, Date.now());
    } catch {
      // Silently fail — tip won't show again until page reload
    }
  }, [key]);

  return { show, dismiss };
}

/**
 * Check if a coachmark has been seen (non-hook, for imperative use).
 * @param {string} key
 * @returns {Promise<boolean>}
 */
export async function hasSeenCoachmark(key) {
  try {
    const seen = await db.get(`${COACHMARK_PREFIX}${key}`);
    return !!seen;
  } catch {
    return true; // Fail safe — assume seen
  }
}

/**
 * Mark a coachmark as seen programmatically (non-hook).
 * @param {string} key
 */
export async function markCoachmarkSeen(key) {
  try {
    await db.set(`${COACHMARK_PREFIX}${key}`, Date.now());
  } catch {
    // Silently fail
  }
}

/**
 * Reset all coachmarks (e.g., for testing or "Show Tips Again" in settings).
 */
export async function resetAllCoachmarks() {
  try {
    const keys = Object.keys(COACHMARKS);
    for (const key of keys) {
      await db.del(`${COACHMARK_PREFIX}${key}`);
    }
  } catch {
    // Silently fail
  }
}
