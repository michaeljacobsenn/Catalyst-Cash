  import { Capacitor } from "@capacitor/core";
  import { LOG_LEVEL,Purchases } from "@revenuecat/purchases-capacitor";
  import { log } from "./logger.js";
  import { activatePro,deactivatePro } from "./subscription.js";

const ENTITLEMENT_ID = "Catalyst Cash Pro";
const RC_ENTITLEMENT_VERIFICATION_MODE = "INFORMATIONAL";
const RC_VERIFICATION_FAILED = "FAILED";
const REVENUECAT_TIMEOUT_MS = 1500;

function getRevenueCatApiKey() {
  return String(import.meta.env.VITE_REVENUECAT_KEY || "").trim() || null;
}

// We keep a local cache of whether we are running on native iOS
const isNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
let cachedRevenueCatAppUserId = null;
let revenueCatUiPromise = null;
let revenueCatConfigured = false;

function withRevenueCatTimeout(promiseFactory, label) {
  let timer = null;
  return Promise.race([
    Promise.resolve().then(promiseFactory),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), REVENUECAT_TIMEOUT_MS);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function getRevenueCatUI() {
  if (!revenueCatUiPromise) {
    revenueCatUiPromise = import("@revenuecat/purchases-capacitor-ui").then(mod => mod.RevenueCatUI).catch(() => null);
  }
  return revenueCatUiPromise;
}

function getEntitlementInfo(customerInfo) {
  return customerInfo?.entitlements?.active?.[ENTITLEMENT_ID];
}

function cacheRevenueCatIdentity(customerInfo) {
  const appUserId = customerInfo?.originalAppUserId || null;
  if (appUserId) cachedRevenueCatAppUserId = appUserId;
}

async function applyCustomerInfo(customerInfo) {
  cacheRevenueCatIdentity(customerInfo);
  const entitlement = getEntitlementInfo(customerInfo);
  if (entitlement?.verification === RC_VERIFICATION_FAILED) {
    log.warn("revenuecat", "Entitlement verification failed");
  }

  if (entitlement) {
    // Detect lifetime (non-consumable) purchases — they have no expirationDate
    const isLifetime = !entitlement.expirationDate || entitlement.productIdentifier?.includes("lifetime");
    await activatePro(
      entitlement.productIdentifier || "com.catalystcash.pro.rc",
      isLifetime ? 36500 : 3650,
      { isLifetime },
    );

    // Confirm any pending referral now that we have a verified purchase
    try {
      const { confirmReferral } = await import("./referral.js");
      await confirmReferral();
    } catch { /* referral confirmation is best-effort */ }

    return true;
  }

  await deactivatePro();
  return false;
}

export async function getRevenueCatAppUserId() {
  if (!isNative) return null;
  if (!getRevenueCatApiKey()) return null;
  if (!revenueCatConfigured) return cachedRevenueCatAppUserId;
  if (cachedRevenueCatAppUserId) return cachedRevenueCatAppUserId;

  try {
    const { appUserID } = await withRevenueCatTimeout(
      () => Purchases.getAppUserID(),
      "RevenueCat getAppUserID"
    );
    if (appUserID) {
      cachedRevenueCatAppUserId = appUserID;
      return appUserID;
    }
  } catch {
    log.warn("revenuecat", "Could not fetch RevenueCat app user ID");
  }

  return cachedRevenueCatAppUserId;
}

/**
 * Sync local state with RevenueCat's latest entitlement status
 */
export async function syncProStatus() {
  if (!isNative) return false;
  if (!getRevenueCatApiKey()) return false;
  if (!revenueCatConfigured) return false;

  try {
    const customerInfo = await withRevenueCatTimeout(
      () => Purchases.getCustomerInfo(),
      "RevenueCat getCustomerInfo"
    );
    await getRevenueCatAppUserId();
    return applyCustomerInfo(customerInfo);
  } catch {
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
    const apiKey = getRevenueCatApiKey();
    if (!apiKey) {
      log.info("revenuecat", "RevenueCat not configured; skipping initialization");
      return;
    }
    await withRevenueCatTimeout(
      () => Purchases.setLogLevel({ level: LOG_LEVEL.WARN }),
      "RevenueCat setLogLevel"
    );
    await withRevenueCatTimeout(
      () =>
        Purchases.configure({
          apiKey,
          entitlementVerificationMode: RC_ENTITLEMENT_VERIFICATION_MODE,
        }),
      "RevenueCat configure"
    );
    revenueCatConfigured = true;
    await getRevenueCatAppUserId();

    // Listen for real-time changes to the customer's purchase status
    Purchases.addCustomerInfoUpdateListener(async customerInfo => {
      await applyCustomerInfo(customerInfo);
    });

    // Sync state on boot
    await syncProStatus();
  } catch (error) {
    revenueCatConfigured = false;
    log.error("revenuecat", "Failed to initialize RevenueCat", {
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

/**
 * Presents the native paywall if the user does NOT have the Pro entitlement.
 * Returns true if they bought it/already had it, false if they cancelled/errored.
 */
export async function presentPaywall() {
  if (!isNative) {
    void log.info("revenuecat", "Paywall unavailable on web — falling back to simple web paywall");
    return null; // Signals the caller to show the web UI fallback
  }
  if (!getRevenueCatApiKey()) {
    if (window.toast) window.toast.error("Purchases are not configured in this build.");
    return false;
  }

  try {
    const RevenueCatUI = await getRevenueCatUI();
    if (!RevenueCatUI) {
      throw new Error("RevenueCat UI module unavailable");
    }
    await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: ENTITLEMENT_ID,
    });

    // Wait briefly for purchase flow to potentially resolve and trigger the listener
    await new Promise(r => setTimeout(r, 500));

    return await syncProStatus();
  } catch {
    log.error("revenuecat", "Error presenting paywall");
    if (window.toast) window.toast.error("Purchases are not configured yet. Check RevenueCat offerings.");
    return false;
  }
}

function getPreferredPackageForPlan(offering, plan = "monthly") {
  if (!offering) return null;
  if (plan === "lifetime") return offering.lifetime || null;
  return plan === "yearly" ? (offering.annual || null) : (offering.monthly || null);
}

export async function purchaseProPlan(plan = "monthly") {
  if (!isNative) return null;
  if (!getRevenueCatApiKey()) {
    if (window.toast) window.toast.error("Purchases are not configured in this build.");
    return false;
  }

  if (!revenueCatConfigured) {
    await initRevenueCat();
  }

  try {
    const offerings = await withRevenueCatTimeout(
      () => Purchases.getOfferings(),
      "RevenueCat getOfferings"
    );
    const selectedPackage = getPreferredPackageForPlan(offerings?.current || null, plan);

    if (!selectedPackage) {
      log.warn("revenuecat", `No ${plan} package found in current offering, falling back to native paywall`);
      return presentPaywall();
    }

    await withRevenueCatTimeout(
      () => Purchases.purchasePackage({ aPackage: selectedPackage }),
      `RevenueCat purchase ${plan} package`
    );

    await new Promise(r => setTimeout(r, 400));
    return await syncProStatus();
  } catch (error) {
    log.error("revenuecat", "Error purchasing selected Pro plan", {
      error: error instanceof Error ? error.message : "unknown",
      plan,
    });
    if (window.toast) window.toast.error("Purchase did not complete.");
    return false;
  }
}

/**
 * Prompts RevenueCat to restore purchases and updates local state.
 */
export async function restorePurchases() {
  if (!isNative) return null; // Web fallback — no IAP available
  if (!getRevenueCatApiKey()) return false;

  try {
    const customerInfo = await withRevenueCatTimeout(
      () => Purchases.restorePurchases(),
      "RevenueCat restorePurchases"
    );
    return applyCustomerInfo(customerInfo);
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
    void log.info("revenuecat", "Customer Center unavailable on web");
    if (window.toast) window.toast.error("Subscription management is only available in the iOS app.");
    return;
  }
  if (!getRevenueCatApiKey()) {
    if (window.toast) window.toast.error("Purchases are not configured in this build.");
    return;
  }

  try {
    const RevenueCatUI = await getRevenueCatUI();
    if (!RevenueCatUI) {
      throw new Error("RevenueCat UI module unavailable");
    }
    // According to RevenueCat UI SDK docs, this method will automatically show the Customer Center.
    // It relies on the app having configured the Customer Center in the RevenueCat Dashboard.
    await RevenueCatUI.presentCustomerCenter();
  } catch {
    log.error("revenuecat", "Error opening Customer Center, falling back to Apple Subscriptions URL");
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url: "https://apps.apple.com/account/subscriptions" });
    } catch {
      if (window.toast)
        window.toast.error("Could not load subscriptions. Go to iOS Settings > Apple ID > Subscriptions.");
    }
  }
}
