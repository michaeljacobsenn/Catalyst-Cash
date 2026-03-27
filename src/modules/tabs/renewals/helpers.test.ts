import { describe, expect, it } from "vitest";

import { buildNewRenewal, buildRenewalDraft, getCancelUrl } from "./helpers";

describe("renewals helpers", () => {
  it("buildRenewalDraft preserves optional fields and recomputes cadence", () => {
    const result = buildRenewalDraft(
      {
        name: "Netflix",
        amount: 15.49,
        interval: 1,
        intervalUnit: "months",
        cadence: "monthly",
      },
      {
        name: " Netflix Premium ",
        amount: "22.99",
        interval: 2,
        intervalUnit: "months",
        source: "Checking",
        chargedToType: "bank",
        chargedToId: "bank_1",
      }
    );

    expect(result.name).toBe("Netflix Premium");
    expect(result.amount).toBe(22.99);
    expect(result.interval).toBe(2);
    expect(result.cadence).toBe("every 2 months");
    expect(result.source).toBe("Checking");
    expect(result.chargedToType).toBe("bank");
    expect(result.chargedToId).toBe("bank_1");
  });

  it("buildNewRenewal omits empty optional fields", () => {
    const result = buildNewRenewal(
      {
        name: "Gym",
        amount: "39",
        interval: "1",
        intervalUnit: "months",
        source: "",
        chargedToId: "",
        chargedToType: "",
        category: "",
        nextDue: "",
      },
      ""
    );

    expect(result.name).toBe("Gym");
    expect(result.amount).toBe(39);
    expect(result).not.toHaveProperty("source");
    expect(result).not.toHaveProperty("chargedTo");
  });

  it("buildRenewalDraft clears optional linkage fields when the edit form removes them", () => {
    const result = buildRenewalDraft(
      {
        name: "Spotify",
        amount: 11.99,
        interval: 1,
        intervalUnit: "months",
        cadence: "monthly",
        source: "Checking",
        chargedTo: "Amex Gold",
        chargedToId: "card_1",
        chargedToType: "card",
        category: "streaming",
        nextDue: "2026-04-01",
      },
      {
        name: "Spotify",
        amount: "11.99",
        interval: 1,
        intervalUnit: "months",
        source: "",
        chargedTo: "",
        chargedToId: "",
        chargedToType: "",
        category: "",
        nextDue: "",
      }
    );

    expect(result).not.toHaveProperty("source");
    expect(result).not.toHaveProperty("chargedTo");
    expect(result).not.toHaveProperty("chargedToId");
    expect(result).not.toHaveProperty("chargedToType");
    expect(result).not.toHaveProperty("category");
    expect(result).not.toHaveProperty("nextDue");
  });

  it("getCancelUrl resolves exact and fuzzy merchant matches", () => {
    expect(getCancelUrl("Netflix")).toContain("netflix");
    expect(getCancelUrl("Netflx")).toContain("netflix");
    expect(getCancelUrl("Spotify Premium Family")).toContain("spotify");
    expect(getCancelUrl("Totally Unknown Service")).toBeNull();
  });
});
