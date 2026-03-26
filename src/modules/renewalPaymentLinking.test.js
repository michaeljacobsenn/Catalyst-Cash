import { describe, expect, it } from "vitest";

import { findBestRenewalBankMatch, findBestRenewalCardMatch, relinkRenewalPaymentMethods } from "./renewalPaymentLinking.js";

const cards = [
  {
    id: "plaid_ed5w46Y6n7Izv7mR47DOCYoKaeYkpBHXpK8XP",
    institution: "American Express",
    name: "Delta SkyMiles Gold Business American Express Card",
    _plaidAccountId: "ed5w46Y6n7Izv7mR47DOCYoKaeYkpBHXpK8XP",
  },
  {
    id: "plaid_bluecash",
    institution: "American Express",
    name: "American Express Blue Cash Everyday Card",
    _plaidAccountId: "bluecash",
  },
];

const bankAccounts = [
  {
    id: "bank_ally_checking",
    bank: "Ally",
    name: "Primary Checking",
    accountType: "checking",
    _plaidAccountId: "ally_checking",
  },
  {
    id: "bank_cap_savings",
    bank: "Capital One",
    name: "360 Savings",
    accountType: "savings",
    _plaidAccountId: "cap_savings",
  },
];

describe("renewal payment relinking", () => {
  it("matches a renewal directly from its Plaid-backed chargedToId", () => {
    const renewal = {
      name: "ChatGPT Pro",
      chargedToId: "plaid_ed5w46Y6n7Izv7mR47DOCYoKaeYkpBHXpK8XP",
      chargedTo: "Delta SkyMiles Gold Business",
    };

    expect(findBestRenewalCardMatch(renewal, cards)?.id).toBe(cards[0].id);
  });

  it("matches shorthand imported labels to the current live card", () => {
    const renewal = {
      name: "Google AI Pro",
      chargedToId: "15d4dfb3-d11d-4d87-bccd-4461c4ee49a3",
      chargedTo: "Amex Delta SkyMiles Biz Gold",
      source: "Ally→Delta Biz Gold",
    };

    expect(findBestRenewalCardMatch(renewal, cards)?.id).toBe(cards[0].id);
  });

  it("does not try to force generic checking or savings labels onto cards", () => {
    const renewal = {
      name: "Acura Payment",
      chargedToId: "",
      chargedTo: "Savings",
    };

    expect(findBestRenewalCardMatch(renewal, cards)).toBeNull();
  });

  it("matches a renewal directly from its bank account id", () => {
    const renewal = {
      name: "Rent",
      chargedToType: "bank",
      chargedToId: "bank_ally_checking",
      chargedTo: "Checking",
    };

    expect(findBestRenewalBankMatch(renewal, bankAccounts)?.id).toBe("bank_ally_checking");
  });

  it("upgrades a unique generic checking payment method to the exact bank account", () => {
    const renewals = [
      {
        name: "Rent",
        chargedTo: "Checking",
        chargedToType: "checking",
      },
    ];

    const result = relinkRenewalPaymentMethods(renewals, cards, [bankAccounts[0]]);
    expect(result.changed).toBe(true);
    expect(result.renewals[0]).toMatchObject({
      chargedToType: "bank",
      chargedToId: "bank_ally_checking",
      chargedTo: "Ally · Primary Checking",
    });
  });

  it("rewrites stale imported renewal links to the live short label", () => {
    const renewals = [
      {
        name: "Google AI Pro",
        chargedToId: "15d4dfb3-d11d-4d87-bccd-4461c4ee49a3",
        chargedTo: "Amex Delta SkyMiles Biz Gold",
        source: "Ally→Delta Biz Gold",
      },
    ];

    const result = relinkRenewalPaymentMethods(renewals, cards, bankAccounts);
    expect(result.changed).toBe(true);
    expect(result.renewals[0]).toMatchObject({
      chargedToType: "card",
      chargedToId: "plaid_ed5w46Y6n7Izv7mR47DOCYoKaeYkpBHXpK8XP",
      chargedTo: "Delta SkyMiles Gold Business",
    });
  });
});
