import { Capacitor } from '@capacitor/core';
import { Purchases, LOG_LEVEL } from '@revenuecat/purchases-capacitor';
import { RevenueCatUI, PAYWALL_RESULT } from '@revenuecat/purchases-capacitor-ui';
import { activatePro, deactivatePro } from './subscription.js';
import { log } from './logger.js';

const ENTITLEMENT_ID = "Catalyst Cash Pro";
// ⚠️ IMPORTANT: Replace with your PRODUCTION RevenueCat API key before App Store submission.
// Test Store keys will cause instant rejection during App Review.
const API_KEY_APPLE = "appl_UFEFNlCGlZqaIPTiQzwObGdTdwG";

// We keep a local cache of whether we are running on native iOS
const isNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

/**
 * Sync local state with RevenueCat's latest entitlement status
 */
export async function syncProStatus() {
    if (!isNative) return false;

    try {
        const customerInfo = await Purchases.getCustomerInfo();
        const isPro = typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !== "undefined";

        if (isPro) {
            // Activate Pro locally (grant generous lifetime access locally so checkAuditQuota passes)
            await activatePro("com.catalystcash.pro.rc", 3650);
        } else {
            // They lost access (cancelled, expired, refunded) Keep it simple and deactivate.
            await deactivatePro();
        }
        return isPro;
    } catch (e) {
        log.error("revenuecat", "Error syncing Pro status");
        return false;
    }
}

/**
 * Initializes the RevenueCat SDK and sets up the listener for purchase updates.
 * Call this once on app boot from App.jsx or similar.
 */
export async function initRevenueCat() {
    if (!isNative) return;

    try {
        await Purchases.setLogLevel({ level: LOG_LEVEL.WARN });
        await Purchases.configure({ apiKey: API_KEY_APPLE });

        // Listen for real-time changes to the customer's purchase status
        Purchases.addCustomerInfoUpdateListener(async (customerInfo) => {
            const isPro = typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !== "undefined";
            if (isPro) {
                await activatePro("com.catalystcash.pro.rc", 3650);
            } else {
                await deactivatePro();
            }
        });

        // Sync state on boot
        await syncProStatus();
    } catch {
        log.error("revenuecat", "Failed to initialize RevenueCat");
    }
}

/**
 * Presents the native paywall if the user does NOT have the Pro entitlement.
 * Returns true if they bought it/already had it, false if they cancelled/errored.
 */
export async function presentPaywall() {
    if (!isNative) {
        console.warn("RevenueCat paywall is only available on native iOS. Falling back to simple web paywall.");
        return null; // Signals the caller to show the web UI fallback
    }

    try {
        const { isPresenting } = await RevenueCatUI.presentPaywallIfNeeded({
            requiredEntitlementIdentifier: ENTITLEMENT_ID
        });

        // Wait briefly for purchase flow to potentially resolve and trigger the listener
        await new Promise(r => setTimeout(r, 500));

        return await syncProStatus();
    } catch {
        log.error("revenuecat", "Error presenting paywall");
        return false;
    }
}

/**
 * Prompts RevenueCat to restore purchases and updates local state.
 */
export async function restorePurchases() {
    if (!isNative) return null; // Web fallback — no IAP available

    try {
        const customerInfo = await Purchases.restorePurchases();
        const isPro = typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !== "undefined";

        if (isPro) {
            await activatePro("com.catalystcash.pro.rc", 3650);
        } else {
            await deactivatePro();
        }
        return isPro;
    } catch {
        log.error("revenuecat", "Error restoring purchases");
        return false;
    }
}

/**
 * Presents the RevenueCat Customer Center for self-service subscription management.
 * If running on web, it does nothing or logs a warning.
 */
export async function presentCustomerCenter() {
    if (!isNative) {
        console.warn("Customer Center is only available on native iOS.");
        if (window.toast) window.toast.error("Subscription management is only available in the iOS app.");
        return;
    }

    try {
        // According to RevenueCat UI SDK docs, this method will automatically show the Customer Center.
        // It relies on the app having configured the Customer Center in the RevenueCat Dashboard.
        await RevenueCatUI.presentCustomerCenter();
    } catch {
        log.error("revenuecat", "Error opening Customer Center");
        if (window.toast) window.toast.error("Could not load Customer Center.");
    }
}
