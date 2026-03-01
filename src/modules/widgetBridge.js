// ═══════════════════════════════════════════════════════════════
// WIDGET BRIDGE — Catalyst Cash
//
// Writes the latest health score + key metrics to a shared
// App Group UserDefaults key. This is the data layer that a
// native WidgetKit extension reads to display on the iOS
// Home Screen.
//
// Usage: call updateWidgetData() after every successful audit.
// ═══════════════════════════════════════════════════════════════

import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const WIDGET_KEY = "catalyst-widget-data";

/**
 * Write the latest snapshot data for the iOS widget.
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

        // On iOS, also write to the shared App Group UserDefaults
        // so the WidgetKit extension can access it.
        // This requires a native plugin (future: CatalystWidgetPlugin).
        if (Capacitor.getPlatform() === "ios") {
            try {
                // @ts-ignore — future native plugin
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
