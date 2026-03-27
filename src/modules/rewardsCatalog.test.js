import { afterEach, describe, expect, it } from "vitest";

import { getCardMultiplier, getOptimalCard } from "./rewardsCatalog.js";

const storage = new Map();

globalThis.localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  },
};

describe("rewardsCatalog merchant-aware bonuses", () => {
  afterEach(() => {
    localStorage.removeItem("ota_rotating_categories");
  });

  it("keeps DoorDash bonuses scoped to DoorDash merchants", () => {
    expect(getCardMultiplier("DoorDash Rewards Mastercard", "dining").multiplier).toBe(3);
    expect(
      getCardMultiplier("DoorDash Rewards Mastercard", "dining", {}, { merchantName: "DoorDash" }).multiplier
    ).toBe(4);
  });

  it("does not overstate Marriott hotel cards on generic travel", () => {
    expect(getCardMultiplier("Marriott Bonvoy Boundless", "travel").multiplier).toBe(2);
    expect(
      getCardMultiplier("Marriott Bonvoy Boundless", "travel", {}, { merchantName: "Courtyard by Marriott" }).multiplier
    ).toBe(6);
  });

  it("limits United travel bonuses to United flights and direct hotels", () => {
    expect(getCardMultiplier("United Explorer", "travel").multiplier).toBe(1);
    expect(
      getCardMultiplier("United Explorer", "travel", {}, { merchantName: "United Airlines" }).multiplier
    ).toBe(2);
    expect(
      getCardMultiplier("United Explorer", "travel", {}, { merchantName: "Hilton Garden Inn" }).multiplier
    ).toBe(2);
    expect(
      getCardMultiplier("United Explorer", "travel", {}, { merchantName: "Expedia Hotel Booking" }).multiplier
    ).toBe(1);
  });

  it("does not overstate portal-only travel bonuses on generic travel", () => {
    expect(getCardMultiplier("Chase Freedom Unlimited", "travel").multiplier).toBe(1.5);
    expect(
      getCardMultiplier("Chase Freedom Unlimited", "travel", {}, { merchantName: "Chase Travel Portal", bookingChannel: "Chase Travel" }).multiplier
    ).toBe(5);

    expect(getCardMultiplier("The Platinum Card from American Express", "travel", {}, { merchantName: "Hilton Garden Inn" }).multiplier).toBe(1);
    expect(
      getCardMultiplier("The Platinum Card from American Express", "travel", {}, { merchantName: "Delta Air Lines" }).multiplier
    ).toBe(5);
  });

  it("returns cap periods for capped cards", () => {
    localStorage.setItem("ota_rotating_categories", JSON.stringify({ "Discover it Cash Back": ["groceries"] }));
    expect(getCardMultiplier("American Express Blue Cash Preferred Card", "groceries").capPeriod).toBe("year");
    expect(getCardMultiplier("Citi Custom Cash Card", "dining").capPeriod).toBe("statement");
    expect(getCardMultiplier("Discover it Cash Back", "groceries").capPeriod).toBe("quarter");
    expect(getCardMultiplier("U.S. Bank Cash+ Visa Signature Card", "streaming").capPeriod).toBe("quarter");
  });

  it("uses Autograph Journey travel tiers instead of treating all travel as 5x", () => {
    expect(getCardMultiplier("Wells Fargo Autograph Journey Card", "travel", {}, { merchantName: "Hilton Garden Inn" }).multiplier).toBe(5);
    expect(getCardMultiplier("Wells Fargo Autograph Journey Card", "travel", {}, { merchantName: "Delta Air Lines" }).multiplier).toBe(4);
    expect(getCardMultiplier("Wells Fargo Autograph Journey Card", "travel", {}, { merchantName: "Expedia" }).multiplier).toBe(3);
  });
});

describe("getOptimalCard", () => {
  it("falls back to base earnings for capped cards when cap usage is unknown in conservative mode", () => {
    const best = getOptimalCard(
      [
        { id: "bcp", name: "American Express Blue Cash Preferred Card" },
        { id: "flat", name: "Citi Double Cash Credit Card" },
      ],
      "groceries",
      {},
      { spendAmount: 120, capMode: "conservative" }
    );

    expect(best?.name).toBe("Citi Double Cash Credit Card");
    expect(best?.effectiveYield).toBe(2.6);
  });

  it("reads nested cap-usage maps by card and category", () => {
    const best = getOptimalCard(
      [
        { id: "bcp", name: "American Express Blue Cash Preferred Card" },
        { id: "flat", name: "Citi Double Cash Credit Card" },
      ],
      "groceries",
      {},
      {
        spendAmount: 200,
        capMode: "conservative",
        usedCaps: {
          bcp: { groceries: 6000 },
        },
      }
    );

    expect(best?.name).toBe("Citi Double Cash Credit Card");
    expect(best?.effectiveYield).toBe(2.6);
  });

  it("preserves card caveat notes on the selected recommendation", () => {
    const best = getOptimalCard(
      [{ id: "cfu", name: "Chase Freedom Unlimited" }],
      "travel",
      {},
      { merchantName: "Hilton Garden Inn" }
    );

    expect(best?.rewardNotes).toContain("Chase Travel");
    expect(best?.effectiveYield).toBe(2.25);
  });
});
