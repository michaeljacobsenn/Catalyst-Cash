import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  autoMatchAccounts,
  applyBalanceSync,
  filterTransactionsForConnection,
  materializeManualFallbackForConnections,
} from "./plaid.js";

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Plaid matching", () => {
  it("creates a new credit card and links the plaid account immediately", () => {
    const connection = {
      id: "item_1",
      institutionName: "American Express",
      accounts: [
        {
          plaidAccountId: "acct_123",
          name: "Delta Gold Business Card",
          officialName: "Delta Gold Business Card",
          type: "credit",
          subtype: "credit card",
          mask: "4242",
          linkedCardId: null,
          linkedBankAccountId: null,
          balance: null,
        },
      ],
    };

    const { newCards, matched, unmatched } = autoMatchAccounts(connection, [], [], null);
    expect(newCards).toHaveLength(1);
    expect(newCards[0].id).toBe("plaid_acct_123");
    expect(newCards[0].last4).toBe("4242");
    expect(connection.accounts[0].linkedCardId).toBe("plaid_acct_123");
    expect(matched).toHaveLength(1);
    expect(unmatched).toHaveLength(0);
  });

  it("matches by institution + last4 from existing card metadata", () => {
    const connection = {
      id: "item_1",
      institutionName: "American Express",
      accounts: [
        {
          plaidAccountId: "acct_123",
          name: "Amex Gold",
          officialName: "Amex Gold",
          type: "credit",
          subtype: "credit card",
          mask: "9999",
          linkedCardId: null,
          linkedBankAccountId: null,
          balance: null,
        },
      ],
    };

    const cards = [
      {
        id: "card_existing",
        institution: "Amex",
        name: "Gold",
        notes: "Auto-imported from Plaid (···9999)",
      },
    ];

    const { newCards, matched } = autoMatchAccounts(connection, cards, [], null);
    expect(newCards).toHaveLength(0);
    expect(matched).toHaveLength(1);
    expect(connection.accounts[0].linkedCardId).toBe("card_existing");
  });
});

describe("Plaid sync fallback", () => {
  it("updates balances when linked ids are missing but plaid account ids exist", () => {
    const connection = {
      id: "item_1",
      lastSync: "2026-03-01T00:00:00.000Z",
      accounts: [
        {
          plaidAccountId: "acct_123",
          type: "credit",
          subtype: "credit card",
          linkedCardId: null,
          linkedBankAccountId: null,
          balance: { current: 321.45, available: null, limit: 1000 },
        },
      ],
    };

    const cards = [
      {
        id: "card_1",
        institution: "Amex",
        name: "Gold",
        limit: null,
        _plaidAccountId: "acct_123",
      },
    ];

    const { updatedCards } = applyBalanceSync(connection, cards, []);
    expect(updatedCards[0]._plaidBalance).toBe(321.45);
    expect(updatedCards[0]._plaidLimit).toBe(1000);
    expect(updatedCards[0].limit).toBe(1000);
    expect(connection.accounts[0].linkedCardId).toBe("card_1");
  });
});

describe("Plaid transaction filtering", () => {
  it("keeps only transactions for the requested connection accounts", () => {
    const connection = {
      id: "item_1",
      institutionName: "American Express",
      accounts: [
        { plaidAccountId: "acct_amex_1" },
        { plaidAccountId: "acct_amex_2" },
      ],
    };

    const transactions = [
      { transaction_id: "txn_1", account_id: "acct_amex_1", amount: 10 },
      { transaction_id: "txn_2", account_id: "acct_amex_2", amount: 20 },
      { transaction_id: "txn_3", account_id: "acct_chase_1", amount: 30 },
      { transaction_id: "txn_4", account_id: null, amount: 40 },
    ];

    expect(filterTransactionsForConnection(transactions, connection)).toEqual([
      { transaction_id: "txn_1", account_id: "acct_amex_1", amount: 10 },
      { transaction_id: "txn_2", account_id: "acct_amex_2", amount: 20 },
    ]);
  });
});

describe("Plaid manual fallback", () => {
  it("promotes lost card balances into editable manual fields while preserving link metadata", () => {
    const { updatedCards, updatedBankAccounts, changed } = materializeManualFallbackForConnections(
      [
        {
          id: "card_1",
          institution: "Chase",
          name: "Sapphire Preferred",
          balance: null,
          limit: 5000,
          _plaidConnectionId: "item_1",
          _plaidAccountId: "acct_card_1",
          _plaidBalance: 321.45,
          _plaidAvailable: 4678.55,
          _plaidLimit: 7000,
        },
      ],
      [
        {
          id: "bank_1",
          bank: "Ally",
          accountType: "checking",
          name: "Checking",
          balance: null,
          _plaidConnectionId: "item_1",
          _plaidAccountId: "acct_bank_1",
          _plaidBalance: 1000,
          _plaidAvailable: 975,
        },
      ],
      ["item_1"],
      { keepLinkMetadata: true }
    );

    expect(changed).toBe(true);
    expect(updatedCards[0]).toMatchObject({
      balance: 321.45,
      limit: 7000,
      _plaidBalance: null,
      _plaidAvailable: null,
      _plaidLimit: null,
      _plaidManualFallback: true,
      _plaidConnectionId: "item_1",
      _plaidAccountId: "acct_card_1",
    });
    expect(updatedBankAccounts[0]).toMatchObject({
      balance: 975,
      _plaidBalance: null,
      _plaidAvailable: null,
      _plaidManualFallback: true,
      _plaidConnectionId: "item_1",
      _plaidAccountId: "acct_bank_1",
    });
  });

  it("can fully detach link metadata when a connection is intentionally released", () => {
    const { updatedCards, changed } = materializeManualFallbackForConnections(
      [
        {
          id: "card_1",
          institution: "Chase",
          name: "Freedom",
          balance: null,
          _plaidConnectionId: "item_1",
          _plaidAccountId: "acct_card_1",
          _plaidBalance: 88.5,
        },
      ],
      [],
      ["item_1"],
      { keepLinkMetadata: false }
    );

    expect(changed).toBe(true);
    expect(updatedCards[0]).toMatchObject({
      balance: 88.5,
      _plaidBalance: null,
      _plaidManualFallback: true,
    });
    expect(updatedCards[0]._plaidConnectionId).toBeUndefined();
    expect(updatedCards[0]._plaidAccountId).toBeUndefined();
  });
});
