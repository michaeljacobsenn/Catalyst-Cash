import { expect, test } from "vitest";
import { getNegotiableMerchant } from "./negotiation.js";

test("getNegotiableMerchant returns correct tactic for exact matches", () => {
  const result = getNegotiableMerchant("Sirius XM");
  expect(result).not.toBeNull();
  expect(result.merchant).toBe("Sirius XM");
  expect(result.tactic).toContain("$5/month");
});

test("getNegotiableMerchant uses lowercase substring checking effectively", () => {
  const result1 = getNegotiableMerchant("AT&T Internet 1000");
  expect(result1).not.toBeNull();
  expect(result1.merchant).toBe("AT&T");

  const result2 = getNegotiableMerchant("COMCAST CABLE TRL...");
  expect(result2).not.toBeNull();
  expect(result2.merchant).toBe("Comcast");
});

test("getNegotiableMerchant avoids false positives", () => {
  expect(getNegotiableMerchant("Netflix")).toBeNull();
  expect(getNegotiableMerchant("Spotify")).toBeNull();
  expect(getNegotiableMerchant("Chipotle")).toBeNull();
  expect(getNegotiableMerchant("Apple Music")).toBeNull();
  expect(getNegotiableMerchant("Amazon Prime")).toBeNull();
});

test("getNegotiableMerchant gracefully handles null/undefined inputs", () => {
  expect(getNegotiableMerchant(null)).toBeNull();
  expect(getNegotiableMerchant(undefined)).toBeNull();
  expect(getNegotiableMerchant("")).toBeNull();
});
