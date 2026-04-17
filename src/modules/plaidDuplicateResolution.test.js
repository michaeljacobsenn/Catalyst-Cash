import { describe, expect, it } from "vitest";
import {
  buildPortfolioDuplicateReviewGroups,
  normalizeAcknowledgedDuplicateKeys,
  reviewPlaidDuplicateCandidates,
  setDuplicateGroupAcknowledged,
} from "./plaidDuplicateResolution.js";

describe("plaid duplicate resolution", () => {
  it("builds an actionable review group for one manual card plus one linked card", () => {
    const groups = buildPortfolioDuplicateReviewGroups({
      cards: [
        {
          id: "manual_card",
          institution: "American Express",
          name: "Blue Cash Everyday Card",
          nickname: "",
          notes: "",
        },
        {
          id: "linked_card",
          institution: "American Express",
          name: "Blue Cash Everyday",
          nickname: "",
          notes: "",
          _plaidAccountId: "plaid_card_1",
          _plaidConnectionId: "item_1",
        },
      ],
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual(
      expect.objectContaining({
        kind: "card",
        actionable: true,
        preferredKeepId: "manual_card",
        preferredRemoveId: "linked_card",
      })
    );
  });

  it("does not mark a review group actionable when both accounts are linked", () => {
    const groups = buildPortfolioDuplicateReviewGroups({
      bankAccounts: [
        {
          id: "bank_a",
          bank: "Ally",
          accountType: "savings",
          name: "High Yield Savings",
          _plaidAccountId: "plaid_bank_a",
        },
        {
          id: "bank_b",
          bank: "Ally",
          accountType: "savings",
          name: "High Yield Savings Account",
          _plaidAccountId: "plaid_bank_b",
        },
      ],
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual(
      expect.objectContaining({
        kind: "bank",
        actionable: false,
        preferredKeepId: undefined,
        preferredRemoveId: undefined,
      })
    );
  });

  it("filters out acknowledged duplicate review groups", () => {
    const groups = buildPortfolioDuplicateReviewGroups({
      cards: [
        {
          id: "manual_card",
          institution: "Chase",
          name: "Freedom Unlimited",
          nickname: "",
          notes: "",
        },
        {
          id: "linked_card",
          institution: "Chase",
          name: "Freedom Unlimited Card",
          nickname: "",
          notes: "",
          _plaidAccountId: "plaid_card_1",
        },
      ],
      acknowledgedKeys: ["card:linked_card|manual_card"],
    });

    expect(groups).toEqual([]);
  });

  it("dedupes acknowledged keys when persisting dismissal state", () => {
    const result = setDuplicateGroupAcknowledged(
      { acknowledgedDuplicateKeys: ["card:a|b", "card:a|b", ""] },
      "card:a|b",
      true
    );

    expect(normalizeAcknowledgedDuplicateKeys(result.acknowledgedDuplicateKeys)).toEqual(["card:a|b"]);
  });

  it("links a unique Plaid duplicate candidate to the existing manual record when confirmed", () => {
    const connection = {
      accounts: [
        {
          plaidAccountId: "acct_123",
          linkedCardId: null,
          linkedBankAccountId: null,
        },
      ],
    };

    const result = reviewPlaidDuplicateCandidates({
      connection,
      newCards: [
        {
          id: "plaid_acct_123",
          institution: "American Express",
          name: "Blue Cash Everyday",
        },
      ],
      duplicateCandidates: [
        {
          kind: "card",
          plaidAccountId: "acct_123",
          importedId: "plaid_acct_123",
          importedLabel: "Blue Cash Everyday",
          institution: "American Express",
          existingIds: ["manual_card"],
        },
      ],
      cards: [
        {
          id: "manual_card",
          institution: "American Express",
          name: "Blue Cash Everyday Card",
        },
      ],
      confirm: () => true,
    });

    expect(result.newCards).toEqual([]);
    expect(result.resolvedCount).toBe(1);
    expect(connection.accounts[0].linkedCardId).toBe("manual_card");
  });

  it("leaves ambiguous Plaid duplicate candidates unresolved", () => {
    const connection = {
      accounts: [
        {
          plaidAccountId: "acct_123",
          linkedCardId: null,
          linkedBankAccountId: null,
        },
      ],
    };

    const result = reviewPlaidDuplicateCandidates({
      connection,
      newCards: [
        {
          id: "plaid_acct_123",
          institution: "Chase",
          name: "Sapphire Preferred",
        },
      ],
      duplicateCandidates: [
        {
          kind: "card",
          plaidAccountId: "acct_123",
          importedId: "plaid_acct_123",
          importedLabel: "Sapphire Preferred",
          institution: "Chase",
          existingIds: ["card_one", "card_two"],
        },
      ],
      cards: [
        { id: "card_one", institution: "Chase", name: "Sapphire Preferred" },
        { id: "card_two", institution: "Chase", name: "Sapphire Preferred AU" },
      ],
      confirm: () => true,
    });

    expect(result.newCards).toHaveLength(1);
    expect(result.resolvedCount).toBe(0);
    expect(result.ambiguousCount).toBe(1);
    expect(connection.accounts[0].linkedCardId).toBeNull();
  });

  it("does not auto-link a new Plaid account onto an already-linked local card", () => {
    const connection = {
      accounts: [
        {
          plaidAccountId: "acct_new",
          linkedCardId: null,
          linkedBankAccountId: null,
        },
      ],
    };

    const result = reviewPlaidDuplicateCandidates({
      connection,
      newCards: [
        {
          id: "plaid_acct_new",
          institution: "Chase",
          name: "Freedom Unlimited",
        },
      ],
      duplicateCandidates: [
        {
          kind: "card",
          plaidAccountId: "acct_new",
          importedId: "plaid_acct_new",
          importedLabel: "Freedom Unlimited",
          institution: "Chase",
          existingIds: ["existing_linked_card"],
        },
      ],
      cards: [
        {
          id: "existing_linked_card",
          institution: "Chase",
          name: "Freedom Unlimited",
          _plaidAccountId: "acct_existing",
        },
      ],
      confirm: () => true,
    });

    expect(result.newCards).toHaveLength(1);
    expect(result.resolvedCount).toBe(0);
    expect(result.ambiguousCount).toBe(1);
    expect(connection.accounts[0].linkedCardId).toBeNull();
  });
});
