import { describe, it, expect } from "vitest";
import { autoMatchAccounts, applyBalanceSync } from "./plaid.js";

describe("Plaid matching", () => {
    it("creates a new credit card and links the plaid account immediately", () => {
        const connection = {
            id: "item_1",
            institutionName: "American Express",
            accounts: [{
                plaidAccountId: "acct_123",
                name: "Delta Gold Business Card",
                officialName: "Delta Gold Business Card",
                type: "credit",
                subtype: "credit card",
                mask: "4242",
                linkedCardId: null,
                linkedBankAccountId: null,
                balance: null,
            }],
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
            accounts: [{
                plaidAccountId: "acct_123",
                name: "Amex Gold",
                officialName: "Amex Gold",
                type: "credit",
                subtype: "credit card",
                mask: "9999",
                linkedCardId: null,
                linkedBankAccountId: null,
                balance: null,
            }],
        };

        const cards = [{
            id: "card_existing",
            institution: "Amex",
            name: "Gold",
            notes: "Auto-imported from Plaid (···9999)",
        }];

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
            accounts: [{
                plaidAccountId: "acct_123",
                type: "credit",
                subtype: "credit card",
                linkedCardId: null,
                linkedBankAccountId: null,
                balance: { current: 321.45, available: null, limit: 1000 },
            }],
        };

        const cards = [{
            id: "card_1",
            institution: "Amex",
            name: "Gold",
            limit: null,
            _plaidAccountId: "acct_123",
        }];

        const { updatedCards } = applyBalanceSync(connection, cards, []);
        expect(updatedCards[0]._plaidBalance).toBe(321.45);
        expect(updatedCards[0]._plaidLimit).toBe(1000);
        expect(updatedCards[0].limit).toBe(1000);
        expect(connection.accounts[0].linkedCardId).toBe("card_1");
    });
});
