import type { MerchantCategory } from "../types/index.js";
import { extractCategoryByKeywords, MERCHANT_DATABASE } from "./merchantDatabase.js";
import { inferMerchantIdentity, normalizeMerchantString } from "./merchantIdentity.js";

export interface NearbyMerchantCandidate {
  id: string;
  name: string;
  category: MerchantCategory;
  color: string | null;
  distanceMeters: number | null;
  confidence: "high" | "medium" | "low";
  source: "offline" | "tag" | "inferred" | "fallback";
  descriptor: string | null;
  areaLabel: string | null;
}

interface ReverseLookupResponse {
  address?: Record<string, string | undefined>;
  namedetails?: Record<string, string | undefined>;
  name?: string;
  display_name?: string;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string | undefined>;
}

interface NearbyLookupResult {
  areaLabel: string | null;
  candidates: NearbyMerchantCandidate[];
}

const CACHE_TTL_MS = 2 * 60 * 1000;
const MIN_SEARCH_RADIUS_METERS = 110;
const MAX_SEARCH_RADIUS_METERS = 260;
const nearbyLookupCache = new Map<string, { ts: number; value: NearbyLookupResult }>();
const RETAIL_CLUSTER_PATTERN = /\b(mall|center|centre|plaza|outlet|market|square)\b/i;

const SHOP_CATEGORY_MAP: Partial<Record<string, MerchantCategory>> = {
  supermarket: "groceries",
  grocery: "groceries",
  convenience: "groceries",
  bakery: "dining",
  coffee: "dining",
  confectionery: "dining",
  department_store: "catch-all",
  mall: "catch-all",
  clothes: "catch-all",
  shoes: "catch-all",
  electronics: "catch-all",
  beauty: "catch-all",
  cosmetics: "catch-all",
  furniture: "catch-all",
  sports: "catch-all",
  books: "catch-all",
  gift: "catch-all",
  variety_store: "catch-all",
  discount: "catch-all",
  chemist: "drugstores",
  pharmacy: "drugstores",
};

const AMENITY_CATEGORY_MAP: Partial<Record<string, MerchantCategory>> = {
  restaurant: "dining",
  fast_food: "dining",
  cafe: "dining",
  coffee_shop: "dining",
  ice_cream: "dining",
  pub: "dining",
  bar: "dining",
  pharmacy: "drugstores",
  fuel: "gas",
  car_rental: "travel",
  cinema: "catch-all",
};

const TOURISM_CATEGORY_MAP: Partial<Record<string, MerchantCategory>> = {
  hotel: "travel",
  motel: "travel",
  guest_house: "travel",
};

const LEISURE_CATEGORY_MAP: Partial<Record<string, MerchantCategory>> = {
  fitness_centre: "catch-all",
  sports_centre: "catch-all",
};

const SKIP_NAME_PATTERNS = [
  /\bentrance\b/i,
  /\bexit\b/i,
  /\bparking\b/i,
  /\bgarage\b/i,
  /\brestroom\b/i,
  /\btoilet\b/i,
  /\batm\b/i,
  /\belevator\b/i,
  /\bescalator\b/i,
  /\bwalkway\b/i,
  /\bfood court\b/i,
  /\bshopping center\b/i,
];

function compactKey(value: string) {
  return normalizeMerchantString(value).replace(/\s+/g, "");
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function buildCacheKey(latitude: number, longitude: number, radiusMeters: number) {
  return `${latitude.toFixed(4)}:${longitude.toFixed(4)}:${radiusMeters}`;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMeters(aLat: number, aLon: number, bLat: number, bLon: number) {
  const earthRadius = 6371000;
  const dLat = toRadians(bLat - aLat);
  const dLon = toRadians(bLon - aLon);
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);
  const hav =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(2 * earthRadius * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav)));
}

function getAreaLabel(reverseData: ReverseLookupResponse | null) {
  const address = reverseData?.address || {};
  return (
    address.mall ||
    address.retail ||
    address.shop ||
    address.amenity ||
    address.building ||
    address.house ||
    address.road ||
    address.neighbourhood ||
    address.suburb ||
    null
  );
}

export function resolveNearbySearchRadius(accuracyMeters?: number | null) {
  if (!Number.isFinite(Number(accuracyMeters))) return MIN_SEARCH_RADIUS_METERS;
  const accuracy = Number(accuracyMeters);
  if (accuracy <= 0) return MIN_SEARCH_RADIUS_METERS;
  const scaled = Math.round((accuracy * 1.35) / 10) * 10;
  return clamp(scaled, MIN_SEARCH_RADIUS_METERS, MAX_SEARCH_RADIUS_METERS);
}

function shouldExpandSearchArea(primaryRadius: number, candidateCount: number, areaLabel: string | null) {
  if (primaryRadius >= MAX_SEARCH_RADIUS_METERS) return false;
  if (candidateCount < 2) return true;
  if (areaLabel && RETAIL_CLUSTER_PATTERN.test(areaLabel) && candidateCount < 5) return true;
  return false;
}

function getExpandedSearchRadius(primaryRadius: number) {
  return clamp(Math.max(primaryRadius + 120, 200), MIN_SEARCH_RADIUS_METERS, MAX_SEARCH_RADIUS_METERS);
}

function findMerchantDatabaseMatch(name: string) {
  const normalizedName = normalizeMerchantString(name);
  const compactName = compactKey(name);
  let bestMatch: (typeof MERCHANT_DATABASE)[number] | null = null;
  let bestScore = 0;

  for (const merchant of MERCHANT_DATABASE) {
    const merchantName = normalizeMerchantString(merchant.name);
    const merchantId = normalizeMerchantString(String(merchant.id).replace(/_/g, " "));
    const compactMerchantName = compactKey(merchant.name);
    const compactMerchantId = compactKey(String(merchant.id).replace(/_/g, " "));

    let score = 0;
    if (
      normalizedName === merchantName ||
      normalizedName === merchantId ||
      compactName === compactMerchantName ||
      compactName === compactMerchantId
    ) {
      score = 4;
    } else if (
      normalizedName.includes(merchantName) ||
      merchantName.includes(normalizedName) ||
      compactName.includes(compactMerchantName) ||
      compactMerchantName.includes(compactName)
    ) {
      score = 3;
    } else if (
      normalizedName.includes(merchantId) ||
      merchantId.includes(normalizedName) ||
      compactName.includes(compactMerchantId) ||
      compactMerchantId.includes(compactName)
    ) {
      score = 2;
    }

    if (score > bestScore) {
      bestMatch = merchant;
      bestScore = score;
    }
  }

  return bestMatch;
}

function describeCandidate(tags: Record<string, string | undefined>) {
  const raw =
    tags.shop ||
    tags.amenity ||
    tags.tourism ||
    tags.leisure ||
    tags.brand ||
    tags.office ||
    null;

  if (!raw) return null;

  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function resolveNearbyCategory(
  name: string,
  tags: Record<string, string | undefined>
): {
  category: MerchantCategory;
  color: string | null;
  confidence: "high" | "medium" | "low";
  source: "offline" | "tag" | "inferred" | "fallback";
} {
  const exactMatch = findMerchantDatabaseMatch(name);
  if (exactMatch) {
    return {
      category: exactMatch.category as MerchantCategory,
      color: exactMatch.color || null,
      confidence: "high" as const,
      source: "offline" as const,
    };
  }

  const tagCategory =
    (tags.shop && SHOP_CATEGORY_MAP[tags.shop]) ||
    (tags.amenity && AMENITY_CATEGORY_MAP[tags.amenity]) ||
    (tags.tourism && TOURISM_CATEGORY_MAP[tags.tourism]) ||
    (tags.leisure && LEISURE_CATEGORY_MAP[tags.leisure]) ||
    null;

  if (tagCategory) {
    return {
      category: tagCategory,
      color: null,
      confidence: "medium" as const,
      source: "tag" as const,
    };
  }

  const inferred = inferMerchantIdentity({ merchantName: name });
  if (inferred.rewardCategory) {
    return {
      category: inferred.rewardCategory as MerchantCategory,
      color: null,
      confidence: inferred.confidence === "high" ? "high" : "medium",
      source: "inferred" as const,
    };
  }

  const keywordCategory = extractCategoryByKeywords(name) as MerchantCategory | null;
  if (keywordCategory) {
    return {
      category: keywordCategory,
      color: null,
      confidence: "medium" as const,
      source: "inferred" as const,
    };
  }

  return {
    category: "catch-all" as MerchantCategory,
    color: null,
    confidence: "low" as const,
    source: "fallback" as const,
  };
}

function isUsefulCandidateName(name: string) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return false;
  return !SKIP_NAME_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function scoreCandidate(candidate: NearbyMerchantCandidate) {
  const confidenceWeight = candidate.confidence === "high" ? 300 : candidate.confidence === "medium" ? 180 : 60;
  const distanceWeight = candidate.distanceMeters == null ? 0 : Math.max(0, 140 - Math.min(candidate.distanceMeters, 140));
  const brandWeight = candidate.source === "offline" ? 220 : candidate.source === "tag" ? 120 : 0;
  return confidenceWeight + distanceWeight + brandWeight;
}

function mergeNearbyCandidates(candidates: NearbyMerchantCandidate[], limit: number) {
  const deduped = new Map<string, NearbyMerchantCandidate>();

  for (const candidate of candidates) {
    const key = compactKey(candidate.name);
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, candidate);
      continue;
    }

    if (scoreCandidate(candidate) > scoreCandidate(existing)) {
      deduped.set(key, candidate);
    }
  }

  return [...deduped.values()]
    .sort((left, right) => scoreCandidate(right) - scoreCandidate(left))
    .slice(0, limit);
}

function normalizeOverpassCandidate(
  element: OverpassElement,
  latitude: number,
  longitude: number,
  areaLabel: string | null
) {
  const tags = element.tags || {};
  const name = tags.brand || tags.name || "";
  if (!isUsefulCandidateName(name)) return null;

  const pointLat = Number(element.lat ?? element.center?.lat);
  const pointLon = Number(element.lon ?? element.center?.lon);
  if (!Number.isFinite(pointLat) || !Number.isFinite(pointLon)) return null;

  const resolved = resolveNearbyCategory(name, tags);
  return {
    id: `${element.type}:${element.id}`,
    name: String(name).trim(),
    category: resolved.category,
    color: resolved.color,
    confidence: resolved.confidence,
    source: resolved.source,
    distanceMeters: distanceMeters(latitude, longitude, pointLat, pointLon),
    descriptor: describeCandidate(tags),
    areaLabel,
  } satisfies NearbyMerchantCandidate;
}

async function fetchReverseLookup(latitude: number, longitude: number) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1&namedetails=1`
  );
  if (!response.ok) {
    throw new Error("Reverse lookup failed");
  }
  return (await response.json()) as ReverseLookupResponse;
}

async function fetchOverpassCandidates(latitude: number, longitude: number, radiusMeters: number) {
  const query = `
[out:json][timeout:12];
(
  node(around:${radiusMeters},${latitude},${longitude})[name][shop~"supermarket|grocery|convenience|bakery|coffee|department_store|mall|clothes|shoes|electronics|beauty|cosmetics|furniture|sports|books|gift|variety_store|discount|chemist|pharmacy"];
  way(around:${radiusMeters},${latitude},${longitude})[name][shop~"supermarket|grocery|convenience|bakery|coffee|department_store|mall|clothes|shoes|electronics|beauty|cosmetics|furniture|sports|books|gift|variety_store|discount|chemist|pharmacy"];
  relation(around:${radiusMeters},${latitude},${longitude})[name][shop~"supermarket|grocery|convenience|bakery|coffee|department_store|mall|clothes|shoes|electronics|beauty|cosmetics|furniture|sports|books|gift|variety_store|discount|chemist|pharmacy"];
  node(around:${radiusMeters},${latitude},${longitude})[name][amenity~"restaurant|fast_food|cafe|ice_cream|bar|pub|pharmacy|fuel|car_rental|cinema"];
  way(around:${radiusMeters},${latitude},${longitude})[name][amenity~"restaurant|fast_food|cafe|ice_cream|bar|pub|pharmacy|fuel|car_rental|cinema"];
  relation(around:${radiusMeters},${latitude},${longitude})[name][amenity~"restaurant|fast_food|cafe|ice_cream|bar|pub|pharmacy|fuel|car_rental|cinema"];
  node(around:${radiusMeters},${latitude},${longitude})[name][tourism~"hotel|motel|guest_house"];
  way(around:${radiusMeters},${latitude},${longitude})[name][tourism~"hotel|motel|guest_house"];
  relation(around:${radiusMeters},${latitude},${longitude})[name][tourism~"hotel|motel|guest_house"];
  node(around:${radiusMeters},${latitude},${longitude})[name][leisure~"fitness_centre|sports_centre"];
  way(around:${radiusMeters},${latitude},${longitude})[name][leisure~"fitness_centre|sports_centre"];
  relation(around:${radiusMeters},${latitude},${longitude})[name][leisure~"fitness_centre|sports_centre"];
);
out center tags 24;
`;

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: query,
  });

  if (!response.ok) {
    throw new Error("Nearby lookup failed");
  }

  const data = (await response.json()) as { elements?: OverpassElement[] };
  return Array.isArray(data.elements) ? data.elements : [];
}

function buildReverseFallbackCandidate(reverseData: ReverseLookupResponse | null, areaLabel: string | null) {
  const name =
    reverseData?.name ||
    reverseData?.namedetails?.name ||
    reverseData?.address?.shop ||
    reverseData?.address?.amenity ||
    reverseData?.address?.building ||
    null;

  if (!name || !isUsefulCandidateName(name)) return null;

  const resolved = resolveNearbyCategory(name, {});
  return {
    id: "reverse:fallback",
    name,
    category: resolved.category,
    color: resolved.color,
    confidence: resolved.confidence,
    source: "fallback" as const,
    distanceMeters: null,
    descriptor: areaLabel ? "Nearby place" : null,
    areaLabel,
  } satisfies NearbyMerchantCandidate;
}

export function formatNearbyDistance(distanceMeters: number | null | undefined) {
  if (distanceMeters == null || !Number.isFinite(Number(distanceMeters))) return "Nearby";
  const value = Number(distanceMeters);
  if (value < 80) return `${Math.max(5, Math.round(value / 5) * 5)} m`;
  if (value < 1000) return `${Math.round(value / 10) * 10} m`;
  return `${(value / 1000).toFixed(1)} km`;
}

export function deriveNearbyCandidate(
  input: { name: string; tags?: Record<string, string | undefined>; distanceMeters?: number | null; areaLabel?: string | null }
) {
  const resolved = resolveNearbyCategory(input.name, input.tags || {});
  return {
    id: compactKey(input.name),
    name: input.name,
    category: resolved.category,
    color: resolved.color,
    confidence: resolved.confidence,
    source: resolved.source,
    distanceMeters: input.distanceMeters ?? null,
    descriptor: describeCandidate(input.tags || {}),
    areaLabel: input.areaLabel || null,
  } satisfies NearbyMerchantCandidate;
}

export function mergeNearbyMerchantCandidates(candidates: NearbyMerchantCandidate[], limit = 6) {
  return mergeNearbyCandidates(candidates, limit);
}

export async function fetchNearbyMerchantCandidates({
  latitude,
  longitude,
  accuracyMeters,
  limit = 6,
}: {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  limit?: number;
}) {
  const primaryRadius = resolveNearbySearchRadius(accuracyMeters);
  const cacheKey = buildCacheKey(latitude, longitude, primaryRadius);
  const cached = nearbyLookupCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.value;
  }

  const [reverseResult, overpassResult] = await Promise.allSettled([
    fetchReverseLookup(latitude, longitude),
    fetchOverpassCandidates(latitude, longitude, primaryRadius),
  ]);

  const reverseData = reverseResult.status === "fulfilled" ? reverseResult.value : null;
  const areaLabel = getAreaLabel(reverseData);
  let rawCandidates =
    overpassResult.status === "fulfilled"
      ? overpassResult.value
          .map((element) => normalizeOverpassCandidate(element, latitude, longitude, areaLabel))
          .filter(Boolean) as NearbyMerchantCandidate[]
      : [];

  if (shouldExpandSearchArea(primaryRadius, rawCandidates.length, areaLabel)) {
    try {
      const expandedRadius = getExpandedSearchRadius(primaryRadius);
      const expandedElements = await fetchOverpassCandidates(latitude, longitude, expandedRadius);
      const expandedCandidates = expandedElements
        .map((element) => normalizeOverpassCandidate(element, latitude, longitude, areaLabel))
        .filter(Boolean) as NearbyMerchantCandidate[];
      rawCandidates = mergeNearbyCandidates([...rawCandidates, ...expandedCandidates], Math.max(limit, 8));
    } catch {
      // Keep the primary lookup results when the expanded scan fails.
    }
  }

  const candidates = mergeNearbyCandidates(
    rawCandidates.length > 0 ? rawCandidates : [buildReverseFallbackCandidate(reverseData, areaLabel)].filter(Boolean) as NearbyMerchantCandidate[],
    limit
  );

  const result = { areaLabel, candidates };
  nearbyLookupCache.set(cacheKey, { ts: Date.now(), value: result });
  return result;
}
