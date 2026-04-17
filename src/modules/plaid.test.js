import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PLAID_MANUAL_SYNC_COOLDOWNS,
  autoMatchAccounts,
  applyBalanceSync,
  collectConnectionCreditLimits,
  ensureConnectionAccountsPresent,
  disconnectConnectionPortfolioRecords,
  filterTransactionsForConnection,
  getPreferredFreeConnectionSwitchCooldownRemaining,
  hydrateConnectionWithCachedCreditLimits,
  mapTransactionsFromSyncStatus,
  materializeManualFallbackForConnections,
  normalizePlaidBalanceSnapshot,
  shouldEnforcePreferredFreeConnectionSwitchCooldown,
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

  it("keeps name-only card overlaps separate and flags them for duplicate review", () => {
    const connection = {
      id: "item_1",
      institutionName: "American Express",
      accounts: [
        {
          plaidAccountId: "acct_123",
          name: "Blue Cash Everyday",
          officialName: "Blue Cash Everyday",
          type: "credit",
          subtype: "credit card",
          mask: null,
          linkedCardId: null,
          linkedBankAccountId: null,
          balance: null,
        },
      ],
    };

    const cards = [
      {
        id: "card_existing",
        institution: "American Express",
        name: "Blue Cash Everyday Card",
        nickname: "",
        notes: "",
      },
    ];

    const { newCards, duplicateCandidates, matched } = autoMatchAccounts(connection, cards, [], null);
    expect(newCards).toHaveLength(1);
    expect(matched).toHaveLength(1);
    expect(connection.accounts[0].linkedCardId).toBe("plaid_acct_123");
    expect(duplicateCandidates).toEqual([
      expect.objectContaining({
        kind: "card",
        plaidAccountId: "acct_123",
        importedId: "plaid_acct_123",
        existingIds: ["card_existing"],
      }),
    ]);
  });

  it("keeps likely bank overlaps separate and flags them for duplicate review", () => {
    const connection = {
      id: "item_1",
      institutionName: "Ally Bank",
      accounts: [
        {
          plaidAccountId: "acct_ally_1",
          name: "High Yield Savings",
          officialName: "High Yield Savings",
          type: "depository",
          subtype: "savings",
          mask: "1234",
          linkedCardId: null,
          linkedBankAccountId: null,
          balance: { current: 500 },
        },
      ],
    };

    const bankAccounts = [
      {
        id: "bank_existing",
        bank: "Ally",
        accountType: "savings",
        name: "High Yield Savings Account",
      },
    ];

    const { newBankAccounts, duplicateCandidates, matched } = autoMatchAccounts(connection, [], bankAccounts, null);
    expect(newBankAccounts).toHaveLength(1);
    expect(matched).toHaveLength(1);
    expect(connection.accounts[0].linkedBankAccountId).toBe("plaid_acct_ally_1");
    expect(duplicateCandidates).toEqual([
      expect.objectContaining({
        kind: "bank",
        plaidAccountId: "acct_ally_1",
        importedId: "plaid_acct_ally_1",
        existingIds: ["bank_existing"],
      }),
    ]);
  });

  it("does not reuse an already-linked card solely on issuer and last4", () => {
    const connection = {
      id: "item_1",
      institutionName: "American Express",
      accounts: [
        {
          plaidAccountId: "acct_123",
          name: "Blue Cash Everyday",
          officialName: "Blue Cash Everyday",
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
        id: "linked_delta",
        institution: "American Express",
        name: "Delta SkyMiles Gold Business American Express Card",
        last4: "9999",
        _plaidAccountId: "acct_existing",
      },
    ];

    const { newCards, duplicateCandidates, matched } = autoMatchAccounts(connection, cards, [], null);
    expect(newCards).toHaveLength(1);
    expect(newCards[0].id).toBe("plaid_acct_123");
    expect(matched).toHaveLength(1);
    expect(connection.accounts[0].linkedCardId).toBe("plaid_acct_123");
    expect(duplicateCandidates).toEqual([]);
  });

  it("does not materialize likely duplicates during non-interactive hydration", () => {
    const connection = {
      id: "item_1",
      institutionName: "American Express",
      accounts: [
        {
          plaidAccountId: "acct_123",
          name: "Blue Cash Everyday",
          officialName: "Blue Cash Everyday",
          type: "credit",
          subtype: "credit card",
          mask: null,
          linkedCardId: null,
          linkedBankAccountId: null,
          balance: null,
        },
      ],
    };

    const cards = [
      {
        id: "card_existing",
        institution: "American Express",
        name: "Blue Cash Everyday Card",
        nickname: "",
        notes: "",
      },
    ];

    const { newCards, matched, unmatched, duplicateCandidates } = autoMatchAccounts(
      connection,
      cards,
      [],
      null,
      [],
      { allowLikelyDuplicates: false }
    );
    expect(newCards).toHaveLength(0);
    expect(matched).toHaveLength(0);
    expect(unmatched).toHaveLength(1);
    expect(duplicateCandidates).toHaveLength(0);
    expect(connection.accounts[0].linkedCardId).toBeNull();
  });
});

describe("Plaid free live-connection access", () => {
  it("enforces active-bank switch cooldown only for over-limit free users in live gating", () => {
    expect(
      shouldEnforcePreferredFreeConnectionSwitchCooldown({
        gatingEnforced: true,
        tier: "free",
        connectionCount: 2,
        limit: 1,
      }),
    ).toBe(true);

    expect(
      shouldEnforcePreferredFreeConnectionSwitchCooldown({
        gatingEnforced: true,
        tier: "pro",
        connectionCount: 4,
        limit: 5,
      }),
    ).toBe(false);

    expect(
      shouldEnforcePreferredFreeConnectionSwitchCooldown({
        gatingEnforced: false,
        tier: "free",
        connectionCount: 3,
        limit: 1,
      }),
    ).toBe(false);
  });

  it("computes remaining free active-bank switch cooldown from the last manual change", () => {
    const now = new Date("2026-03-26T16:00:00.000Z").getTime();
    const changedAt = "2026-03-25T16:00:00.000Z";
    expect(PLAID_MANUAL_SYNC_COOLDOWNS.free).toBe(7 * 24 * 60 * 60 * 1000);
    expect(getPreferredFreeConnectionSwitchCooldownRemaining(changedAt, now)).toBe(6 * 24 * 60 * 60 * 1000);
    expect(getPreferredFreeConnectionSwitchCooldownRemaining("2026-03-19T16:00:00.000Z", now)).toBe(0);
    expect(getPreferredFreeConnectionSwitchCooldownRemaining(null, now)).toBe(0);
  });
});

describe("Plaid sync fallback", () => {
  it("derives a credit limit from current plus available when Plaid omits limit", () => {
    expect(
      normalizePlaidBalanceSnapshot({
        current: 104.51,
        available: 895.49,
        limit: null,
        iso_currency_code: "USD",
      }, null, { deriveLimit: true })
    ).toEqual({
      current: 104.51,
      available: 895.49,
      limit: 1000,
      currency: "USD",
    });
  });

  it("does not invent limits for non-credit accounts from current plus available", () => {
    expect(
      normalizePlaidBalanceSnapshot(
        {
          current: 2998.86,
          available: 2998.86,
          limit: null,
          iso_currency_code: "USD",
        },
        null,
        { deriveLimit: false }
      )
    ).toEqual({
      current: 2998.86,
      available: 2998.86,
      limit: null,
      currency: "USD",
    });
  });

  it("clears stale inherited non-credit limits from previous saved sync state", () => {
    expect(
      normalizePlaidBalanceSnapshot(
        {
          current: 2998.86,
          available: 2998.86,
          limit: null,
          iso_currency_code: "USD",
        },
        {
          current: 2998.86,
          available: 2998.86,
          limit: 5997.72,
          currency: "USD",
        },
        { deriveLimit: false }
      )
    ).toEqual({
      current: 2998.86,
      available: 2998.86,
      limit: null,
      currency: "USD",
    });
  });

  it("restores cached credit limits by institution and last4 when Plaid reconnect data is incomplete", () => {
    const connection = {
      institutionName: "Capital One",
      accounts: [
        {
          plaidAccountId: "acct_cap1",
          type: "credit",
          mask: "0319",
          balance: { current: 0, available: null, limit: null },
        },
      ],
    };

    hydrateConnectionWithCachedCreditLimits(connection, {
      "capital one::0319": 10000,
    });

    expect(connection.accounts[0].balance).toMatchObject({
      current: 0,
      available: null,
      limit: 10000,
    });
  });

  it("collects only positive credit limits into the reconnect cache", () => {
    const cache = collectConnectionCreditLimits(
      {
        institutionName: "Capital One",
        accounts: [
          { type: "credit", mask: "0319", balance: { limit: 10000 } },
          { type: "credit", mask: "7649", balance: { limit: null } },
          { type: "depository", mask: "0001", balance: { limit: 5000 } },
        ],
      },
      {}
    );

    expect(cache).toEqual({
      "capital one::0319": 10000,
    });
  });

  it("materializes missing linked accounts from a refreshed connection before applying balances", () => {
    const connection = {
      id: "item_amex",
      institutionName: "American Express",
      lastSync: "2026-03-26T14:30:00.000Z",
      accounts: [
        {
          plaidAccountId: "acct_delta",
          name: "Delta Gold Business Card",
          officialName: "Delta Gold Business Card",
          type: "credit",
          subtype: "credit card",
          mask: "4242",
          linkedCardId: null,
          linkedBankAccountId: null,
          balance: { current: 27.29, available: 2972.71, limit: 3000 },
          liability: {},
        },
      ],
    };

    const hydrated = ensureConnectionAccountsPresent(connection, [], [], null, []);
    expect(hydrated.importedCards).toBe(1);
    expect(hydrated.updatedCards[0].id).toBe("plaid_acct_delta");

    const { updatedCards } = applyBalanceSync(connection, hydrated.updatedCards, [], []);
    expect(updatedCards).toHaveLength(1);
    expect(updatedCards[0]._plaidBalance).toBe(27.29);
    expect(updatedCards[0]._plaidConnectionId).toBe("item_amex");
    expect(connection.accounts[0].linkedCardId).toBe("plaid_acct_delta");
  });

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

  it("preserves recovered limits when syncing a reconnect that only has current and available", () => {
    const connection = {
      id: "item_cap1",
      lastSync: "2026-04-12T00:00:00.000Z",
      accounts: [
        {
          plaidAccountId: "acct_cap1",
          type: "credit",
          subtype: "credit card",
          linkedCardId: "card_cap1",
          linkedBankAccountId: null,
          balance: { current: 104.51, available: 895.49, limit: null },
          liability: {},
        },
      ],
    };

    const cards = [
      {
        id: "card_cap1",
        institution: "Capital One",
        name: "Savor Cash Rewards",
        limit: null,
      },
    ];

    const { updatedCards } = applyBalanceSync(connection, cards, []);
    expect(updatedCards[0]._plaidLimit).toBe(1000);
    expect(updatedCards[0].limit).toBe(1000);
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

  it("maps merchant identity and linked account ids into normalized transactions", () => {
    const connection = {
      id: "item_1",
      institutionName: "American Express",
      accounts: [
        {
          plaidAccountId: "acct_amex_1",
          name: "Gold Card",
          subtype: "credit card",
          linkedCardId: "card_gold",
          linkedBankAccountId: null,
        },
      ],
    };

    const mapped = mapTransactionsFromSyncStatus(connection, {
      hasData: true,
      transactions: {
        transactions: [
          {
            transaction_id: "txn_1",
            account_id: "acct_amex_1",
            amount: 24.15,
            date: "2026-03-26",
            merchant_name: "DoorDash",
            name: "DOORDASH *1234",
            personal_finance_category: {
              primary: "FOOD_AND_DRINK",
              detailed: "RESTAURANT",
            },
            pending: false,
          },
        ],
      },
    });

    expect(mapped).toEqual([
      expect.objectContaining({
        id: "txn_1",
        merchantName: "DoorDash",
        merchantBrand: "doordash",
        merchantKey: "brand:doordash",
        description: "DoorDash",
        name: "DOORDASH *1234",
        linkedCardId: "card_gold",
        linkedBankAccountId: null,
        accountId: "acct_amex_1",
        accountName: "Gold Card",
        accountType: "credit card",
        category: "food and drink",
        subcategory: "restaurant",
      }),
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

  it("can disconnect a connection while keeping linked cards and banks as manual records", () => {
    const connection = {
      id: "item_amex",
      accounts: [
        { plaidAccountId: "acct_card_1" },
        { plaidAccountId: "acct_bank_1" },
        { plaidAccountId: "acct_inv_1" },
      ],
    };

    const result = disconnectConnectionPortfolioRecords(
      connection,
      [
        {
          id: "card_1",
          institution: "American Express",
          name: "Blue Cash Everyday",
          balance: null,
          limit: 10000,
          _plaidConnectionId: "item_amex",
          _plaidAccountId: "acct_card_1",
          _plaidBalance: 3720.27,
          _plaidAvailable: 6279.73,
          _plaidLimit: 10000,
        },
      ],
      [
        {
          id: "bank_1",
          bank: "American Express",
          accountType: "checking",
          name: "Rewards Checking",
          balance: null,
          _plaidAccountId: "acct_bank_1",
          _plaidBalance: 1250,
          _plaidAvailable: 1200,
        },
      ],
      [
        {
          id: "inv_1",
          institution: "American Express",
          name: "Brokerage",
          bucket: "brokerage",
          _plaidBalance: 2500,
          _plaidAccountId: "acct_inv_1",
          _plaidConnectionId: "item_amex",
        },
      ],
      { removeLinkedRecords: false }
    );

    expect(result.updatedCards).toHaveLength(1);
    expect(result.updatedCards[0]).toMatchObject({
      balance: 3720.27,
      limit: 10000,
      _plaidManualFallback: true,
    });
    expect(result.updatedCards[0]._plaidConnectionId).toBeUndefined();
    expect(result.updatedCards[0]._plaidAccountId).toBeUndefined();

    expect(result.updatedBankAccounts).toHaveLength(1);
    expect(result.updatedBankAccounts[0]).toMatchObject({
      balance: 1200,
      _plaidManualFallback: true,
    });
    expect(result.updatedBankAccounts[0]._plaidConnectionId).toBeUndefined();
    expect(result.updatedBankAccounts[0]._plaidAccountId).toBeUndefined();

    expect(result.updatedPlaidInvestments).toHaveLength(0);
  });

  it("can fully remove linked records when disconnecting a connection", () => {
    const connection = {
      id: "item_amex",
      accounts: [{ plaidAccountId: "acct_card_1" }, { plaidAccountId: "acct_bank_1" }],
    };

    const result = disconnectConnectionPortfolioRecords(
      connection,
      [
        {
          id: "card_1",
          institution: "American Express",
          name: "Gold",
          _plaidConnectionId: "item_amex",
          _plaidAccountId: "acct_card_1",
        },
        {
          id: "card_2",
          institution: "Chase",
          name: "Freedom",
        },
      ],
      [
        {
          id: "bank_1",
          bank: "American Express",
          accountType: "checking",
          name: "Checking",
          _plaidAccountId: "acct_bank_1",
        },
      ],
      [],
      { removeLinkedRecords: true }
    );

    expect(result.updatedCards).toEqual([
      expect.objectContaining({
        id: "card_2",
        name: "Freedom",
      }),
    ]);
    expect(result.updatedBankAccounts).toEqual([]);
    expect(result.removedCards).toBe(1);
    expect(result.removedBankAccounts).toBe(1);
  });
});
