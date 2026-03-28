export function getRevenueCatAppUserId(request) {
  const value = request.headers.get("X-RC-App-User-ID");
  return value ? value.trim() : "";
}

export function getRequestedTier(request) {
  return request.headers.get("X-Subscription-Tier") === "pro" ? "pro" : "free";
}

export function isTestingBypassRequested(request) {
  return request.headers.get("X-Catalyst-Testing") === "1";
}
