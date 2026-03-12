import { injectOTACatalog } from "./rewardsCatalog.js";
import { injectOTAMerchants } from "./merchantDatabase.js";

const OTA_ENDPOINTS = {
  CATALOG: "https://api.catalystcash.app/data/catalog.json",
  MERCHANTS: "https://api.catalystcash.app/data/merchants.json"
};

// ── OTA Payload Validation ──────────────────────────────────
// Prevents malformed/corrupt payloads from crashing the app.

function validateCatalogPayload(catalog) {
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) return false;
  for (const [cardName, rules] of Object.entries(catalog)) {
    if (typeof rules !== "object" || rules === null) {
      console.warn(`[OTA] Invalid rules for card "${cardName}". Rejecting payload.`);
      return false;
    }
    // Multiplier bounds check (0-20 is generous for hotel points like Hilton 14x)
    for (const [key, val] of Object.entries(rules)) {
      if (["currency", "caps", "notes", "rotating", "mobileWallet", "highest-spend"].includes(key)) continue;
      if (key === "catch-all" || typeof val === "number") {
        if (typeof val === "number" && (val < 0 || val > 20)) {
          console.warn(`[OTA] Multiplier out of bounds: ${cardName}.${key} = ${val}`);
          return false;
        }
      }
    }
  }
  return true;
}

function validateValuationsPayload(valuations) {
  if (!valuations || typeof valuations !== "object" || Array.isArray(valuations)) return false;
  for (const [currency, cpp] of Object.entries(valuations)) {
    if (typeof cpp !== "number" || cpp < 0.1 || cpp > 5.0) {
      console.warn(`[OTA] Valuation out of bounds: ${currency} = ${cpp}`);
      return false;
    }
  }
  return true;
}

function validateMerchantsPayload(merchants) {
  if (!Array.isArray(merchants) || merchants.length === 0) return false;
  return merchants.every(m =>
    m && typeof m.id === "string" && typeof m.name === "string" &&
    typeof m.category === "string" && typeof m.color === "string"
  );
}

/**
 * Injects cached OTA payloads synchronously at app boot.
 * Call this in main.jsx before React renders.
 */
export function injectCachedOTA() {
  try {
    const cachedCatalog = localStorage.getItem("ota_catalog");
    const cachedValuations = localStorage.getItem("ota_valuations");
    const cachedMerchants = localStorage.getItem("ota_merchants");

    if (cachedCatalog || cachedValuations) {
      const parsedCatalog = cachedCatalog ? JSON.parse(cachedCatalog) : null;
      const parsedValuations = cachedValuations ? JSON.parse(cachedValuations) : null;

      const catalogValid = !parsedCatalog || validateCatalogPayload(parsedCatalog);
      const valuationsValid = !parsedValuations || validateValuationsPayload(parsedValuations);

      if (catalogValid && valuationsValid) {
        injectOTACatalog(parsedCatalog, parsedValuations);
        console.log("[OTA] Synchronously injected cached Catalog.");
      } else {
        console.warn("[OTA] Cached catalog/valuations failed validation. Using built-in defaults.");
        // Clear invalid cache so it doesn't persist
        if (!catalogValid) localStorage.removeItem("ota_catalog");
        if (!valuationsValid) localStorage.removeItem("ota_valuations");
      }
    }

    if (cachedMerchants) {
      const parsedMerchants = JSON.parse(cachedMerchants);
      if (validateMerchantsPayload(parsedMerchants)) {
        injectOTAMerchants(parsedMerchants);
        console.log("[OTA] Synchronously injected cached Merchants.");
      } else {
        console.warn("[OTA] Cached merchants failed validation. Using built-in defaults.");
        localStorage.removeItem("ota_merchants");
      }
    }
  } catch (e) {
    console.error("[OTA] Failed to inject cached OTA payloads:", e);
  }
}

/**
 * Fetches latest firmwares/datasets in the background and saves to localStorage.
 * Does NOT hot-reload to prevent layout shifts. Applies on next app boot.
 */
export async function syncOTAData() {
  try {
    const results = await Promise.allSettled([
      fetch(OTA_ENDPOINTS.CATALOG).then(res => res.ok ? res.json() : null).catch(() => null),
      fetch(OTA_ENDPOINTS.MERCHANTS).then(res => res.ok ? res.json() : null).catch(() => null)
    ]);

    const catalogResult = results[0];
    const merchantsResult = results[1];

    if (catalogResult.status === 'fulfilled' && catalogResult.value) {
      const payload = catalogResult.value;
      if (payload.REWARDS_CATALOG && validateCatalogPayload(payload.REWARDS_CATALOG)) {
        localStorage.setItem("ota_catalog", JSON.stringify(payload.REWARDS_CATALOG));
        if (payload.version) localStorage.setItem("ota_catalog_version", payload.version);
        console.log("[OTA] Cached latest Rewards Catalog payload for next boot.");
      } else if (payload.REWARDS_CATALOG) {
        console.warn("[OTA] Remote catalog failed validation. Not caching.");
      }
      if (payload.VALUATIONS && validateValuationsPayload(payload.VALUATIONS)) {
        localStorage.setItem("ota_valuations", JSON.stringify(payload.VALUATIONS));
        console.log("[OTA] Cached latest Valuations payload for next boot.");
      } else if (payload.VALUATIONS) {
        console.warn("[OTA] Remote valuations failed validation. Not caching.");
      }
    }

    if (merchantsResult.status === 'fulfilled' && merchantsResult.value) {
      const merchants = merchantsResult.value.MERCHANT_DATABASE;
      if (Array.isArray(merchants) && validateMerchantsPayload(merchants)) {
        localStorage.setItem("ota_merchants", JSON.stringify(merchants));
        console.log("[OTA] Cached latest Merchant Database payload for next boot.");
      } else if (merchants) {
        console.warn("[OTA] Remote merchants failed validation. Not caching.");
      }
    }

  } catch (err) {
    console.warn("[OTA] Background sync failed or endpoints unavailable:", err);
  }
}
