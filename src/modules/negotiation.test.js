import { expect, test } from "vitest";
import { getNegotiableMerchant } from "./negotiation.js";

test("getNegotiableMerchant returns correct tactic for exact matches", () => {
  const result = getNegotiableMerchant("Sirius XM");
  expect(result).not.toBeNull();
  expect(result.merchant).toBe("Sirius XM");
  expect(result.tactic).toContain("$5/mo");
});

test("getNegotiableMerchant uses lowercase substring checking effectively", () => {
  const result1 = getNegotiableMerchant("AT&T Internet 1000");
  expect(result1).not.toBeNull();
  expect(result1.merchant).toBe("AT&T");

  const result2 = getNegotiableMerchant("COMCAST CABLE TRL...");
  expect(result2).not.toBeNull();
  expect(result2.merchant).toBe("Comcast");
});

test("getNegotiableMerchant correctly identifies expanded merchants", () => {
  expect(getNegotiableMerchant("Netflix")).not.toBeNull();
  expect(getNegotiableMerchant("Spotify")).not.toBeNull();
  expect(getNegotiableMerchant("Apple Music")).not.toBeNull();
  expect(getNegotiableMerchant("Amazon Prime")).not.toBeNull();
  expect(getNegotiableMerchant("NordVPN")).not.toBeNull();
  expect(getNegotiableMerchant("HelloFresh")).not.toBeNull();
});

test("getNegotiableMerchant handles extended text with email/extra info", () => {
  expect(getNegotiableMerchant("Netflix james@gmail.com")).not.toBeNull();
  expect(getNegotiableMerchant("HULU SUBSCRIPTION 03/12")).not.toBeNull();
  expect(getNegotiableMerchant("Payment to Spotify Premium")).not.toBeNull();
  expect(getNegotiableMerchant("COMCAST CABLE SERVICES AUTOPAY")).not.toBeNull();
});

test("getNegotiableMerchant handles common typos via fuzzy matching", () => {
  // Missing letter
  expect(getNegotiableMerchant("Netflx")).not.toBeNull();
  // Doubled letter
  expect(getNegotiableMerchant("Netflixx")).not.toBeNull();
  // Swapped/missing letter
  expect(getNegotiableMerchant("Spotfy")).not.toBeNull();
  // Missing letter in longer name
  expect(getNegotiableMerchant("Comcst")).not.toBeNull();
});

test("getNegotiableMerchant avoids false positives", () => {
  expect(getNegotiableMerchant("Chipotle")).toBeNull();
  expect(getNegotiableMerchant("Kroger")).toBeNull();
  expect(getNegotiableMerchant("dry cleaning pickup")).toBeNull();
  expect(getNegotiableMerchant("parking garage fee")).toBeNull();
});

test("getNegotiableMerchant gracefully handles null/undefined inputs", () => {
  expect(getNegotiableMerchant(null)).toBeNull();
  expect(getNegotiableMerchant(undefined)).toBeNull();
  expect(getNegotiableMerchant("")).toBeNull();
});
