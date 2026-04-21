import { describe, expect, it } from "vitest";

import {
  deriveNearbyCandidate,
  formatNearbyDistance,
  mergeNearbyMerchantCandidates,
  resolveNearbySearchRadius,
} from "./nearbyMerchants.js";

describe("nearbyMerchants", () => {
  it("maps common osm tags into reward categories", () => {
    expect(deriveNearbyCandidate({ name: "Whole Foods Market", tags: { shop: "supermarket" } }).category).toBe("groceries");
    expect(deriveNearbyCandidate({ name: "Shell", tags: { amenity: "fuel" } }).category).toBe("gas");
    expect(deriveNearbyCandidate({ name: "Hilton Midtown", tags: { tourism: "hotel" } }).category).toBe("travel");
    expect(deriveNearbyCandidate({ name: "Macy's", tags: { shop: "department_store" } }).category).toBe("catch-all");
  });

  it("dedupes repeated mall candidates and keeps the strongest entry", () => {
    const merged = mergeNearbyMerchantCandidates([
      deriveNearbyCandidate({ name: "Macy's", tags: { shop: "department_store" }, distanceMeters: 42, areaLabel: "Mall" }),
      deriveNearbyCandidate({ name: "Macys", tags: { shop: "department_store" }, distanceMeters: 51, areaLabel: "Mall" }),
      deriveNearbyCandidate({ name: "Apple Store", tags: { shop: "electronics" }, distanceMeters: 28, areaLabel: "Mall" }),
    ]);

    expect(merged).toHaveLength(2);
    expect(merged.map((candidate) => candidate.name)).toEqual(expect.arrayContaining(["Macy's", "Apple Store"]));
    expect(merged.filter((candidate) => candidate.name.toLowerCase().includes("macy"))).toHaveLength(1);
  });

  it("formats user-friendly distance labels", () => {
    expect(formatNearbyDistance(null)).toBe("Nearby");
    expect(formatNearbyDistance(44)).toBe("45 m");
    expect(formatNearbyDistance(186)).toBe("190 m");
    expect(formatNearbyDistance(1380)).toBe("1.4 km");
  });

  it("widens nearby search radius when gps accuracy is loose", () => {
    expect(resolveNearbySearchRadius()).toBe(110);
    expect(resolveNearbySearchRadius(18)).toBe(110);
    expect(resolveNearbySearchRadius(92)).toBe(120);
    expect(resolveNearbySearchRadius(175)).toBe(240);
    expect(resolveNearbySearchRadius(500)).toBe(260);
  });
});
