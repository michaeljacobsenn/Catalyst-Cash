// ═══════════════════════════════════════════════════════════════
// WIDGET BRIDGE — Catalyst Cash
//
// Persists the latest health score + key metrics in app storage.
// If a native widget bridge plugin is added later, this module
// can also notify it to refresh its timeline.
//
// Usage: call updateWidgetData() after every successful audit.
// ═══════════════════════════════════════════════════════════════

import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const WIDGET_KEY = "catalyst-widget-data";

/**
 * Write the latest snapshot data for widget surfaces.
 * Falls back gracefully on web — no errors thrown.
 */
export async function updateWidgetData({
  healthScore = null,
  healthLabel = "",
  netWorth = null,
  weeklyMoves = 0,
  weeklyMovesTotal = 0,
  streak = 0,
  lastAuditDate = null,
  // ── Expanded payload for richer widgets ──
  checkingBalance = null,
  dailyBurnRate = null,
  status = "",
  nextPayday = "",
  budgetBurnPct = null,
  percentile = null,
} = {}) {
  try {
    const widgetPayload = {
      healthScore,
      healthLabel,
      netWorth,
      weeklyMoves,
      weeklyMovesTotal,
      streak,
      lastAuditDate: lastAuditDate || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // Extended data — widgets can opt-in to these
      checkingBalance,
      dailyBurnRate,
      status,
      nextPayday,
      budgetBurnPct,
      percentile,
    };

    await Preferences.set({
      key: WIDGET_KEY,
      value: JSON.stringify(widgetPayload),
    });

    // If a native widget bridge plugin exists, ask it to refresh.
    if (Capacitor.getPlatform() === "ios") {
      try {
        // @ts-expect-error — future native plugin
        const { CatalystWidget } = Capacitor.Plugins;
        if (CatalystWidget?.updateTimeline) {
          await CatalystWidget.updateTimeline(widgetPayload);
        }
      } catch {
        // Widget plugin not installed yet — silently ignore
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Read the latest widget data (for debugging/display).
 */
export async function getWidgetData() {
  try {
    const { value } = await Preferences.get({ key: WIDGET_KEY });
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}
