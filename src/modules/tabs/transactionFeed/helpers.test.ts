import { describe, expect, it } from "vitest";

import {
  buildCSV,
  buildRewardComparison,
  estimateRewardCapUsage,
  estimateStatementCycleSpend,
  formatRewardRate,
  formatTransactionTime,
  getCategoryLabel,
  getNormalizedCategoryKey,
  isTransactionInSameMonth,
  normalizeTransactionResult,
} from "./helpers";

describe("transaction feed helpers", () => {
  it("normalizes legacy transaction payloads", () => {
    expect(normalizeTransactionResult({ transactions: [{ id: "1" }], fetchedAt: "now" })).toEqual({
      data: [{ id: "1" }],
      fetchedAt: "now",
    });

    expect(normalizeTransactionResult({ data: [{ id: "2" }] })).toEqual({
      data: [{ id: "2" }],
      fetchedAt: "",
    });
  });

  it("buildCSV exports debit and credit signs correctly", () => {
    const csv = buildCSV([
      {
        date: "2026-03-01",
        description: 'Coffee "Shop"',
        amount: 8.75,
        isCredit: false,
        category: "food",
        accountName: "Checking",
        institution: "Capital One",
        pending: false,
      },
      {
        date: "2026-03-02",
        description: "Payroll",
        amount: 1200,
        isCredit: true,
        category: "income",
        accountName: "Checking",
        institution: "Capital One",
        pending: false,
      },
    ]);

    expect(csv).toContain('"Coffee ""Shop"""');
    expect(csv).toContain("-8.75");
    expect(csv).toContain("1200");
    expect(csv).toContain("Credit");
    expect(csv).toContain("Debit");
  });

  it("normalizes inconsistent ledger categories into canonical labels", () => {
    expect(getNormalizedCategoryKey("Dining", "Chick-fil-A")).toBe("food and drink");
    expect(getCategoryLabel("Dining", "Chick-fil-A")).toBe("Food & Drink");

    expect(getNormalizedCategoryKey("food and drink", "Skolniks")).toBe("food and drink");
    expect(getCategoryLabel("food and drink", "Skolniks")).toBe("Food & Drink");

    expect(getNormalizedCategoryKey("general merchandise", "Legalzoom")).toBe("shopping");
    expect(getCategoryLabel("general merchandise", "Legalzoom")).toBe("Shopping");

    expect(getNormalizedCategoryKey("loan payments", "Acura")).toBe("payments");
    expect(getCategoryLabel("loan disbursements", "Payment Thank You-Mobile")).toBe("Payments");
    expect(getCategoryLabel("transfer in", "Zelle payment from Michael")).toBe("Transfer");
  });

  it("normalizes payment-thank-you descriptors even when the source category is noisy", () => {
    expect(getNormalizedCategoryKey("other", "MOBILE PAYMENT - THANK YOU")).toBe("payments");
    expect(getCategoryLabel("other", "ONLINE PAYMENT, THANK YOU")).toBe("Payments");
    expect(getCategoryLabel("", "Autopay confirmation")).toBe("Payments");
  });

  it("matches only transactions in the same calendar month as the reference date", () => {
    const referenceDate = new Date("2026-03-18T12:00:00");

    expect(isTransactionInSameMonth("2026-03-01", referenceDate)).toBe(true);
    expect(isTransactionInSameMonth("2026-03-31", referenceDate)).toBe(true);
    expect(isTransactionInSameMonth("2026-02-28", referenceDate)).toBe(false);
    expect(isTransactionInSameMonth("2025-03-18", referenceDate)).toBe(false);
    expect(isTransactionInSameMonth("", referenceDate)).toBe(false);
  });

  it("builds a reward comparison with actual and best-card value", () => {
    const comparison = buildRewardComparison(
      {
        amount: 100,
        category: "shopping",
        accountName: "Quicksilver",
        institution: "Capital One",
      },
      [
        { id: "used", name: "Quicksilver Cash Rewards" },
        { id: "best", name: "Apple Card" },
      ] as never[],
      undefined
    );

    expect(comparison?.usedDisplayName).toBe("Quicksilver Cash Rewards");
    expect(comparison?.actualYield).toBe(1.5);
    expect(comparison?.optimalYield).toBe(2);
    expect(comparison?.actualRewardValue).toBeCloseTo(1.5);
    expect(comparison?.optimalRewardValue).toBeCloseTo(2);
    expect(comparison?.incrementalRewardValue).toBeCloseTo(0.5);
    expect(comparison?.usedOptimal).toBe(false);
  });

  it("preserves best-card caveats in reward comparisons", () => {
    const comparison = buildRewardComparison(
      {
        amount: 140,
        category: "travel",
        merchantName: "Hilton Garden Inn",
      },
      [{ id: "cfu", name: "Chase Freedom Unlimited" }] as never[],
      undefined
    );

    expect(comparison?.bestCardNotes).toContain("Chase Travel");
    expect(comparison?.optimalYield).toBe(2.25);
  });

  it("falls back to a baseline estimate when the used card cannot be matched", () => {
    const comparison = buildRewardComparison(
      {
        amount: 80,
        category: "shopping",
        accountName: "Unknown Debit Card",
      },
      [{ id: "best", name: "Apple Card" }] as never[],
      undefined
    );

    expect(comparison?.usedCardMatched).toBe(false);
    expect(comparison?.actualYield).toBe(1);
    expect(comparison?.actualRewardValue).toBeCloseTo(0.8);
    expect(comparison?.optimalRewardValue).toBeCloseTo(1.6);
    expect(comparison?.incrementalRewardValue).toBeCloseTo(0.8);
  });

  it("does not guess the used card from institution alone when multiple cards share the issuer", () => {
    const comparison = buildRewardComparison(
      {
        amount: 75,
        category: "travel",
        institution: "Chase",
      },
      [
        { id: "csp", name: "Chase Sapphire Preferred", institution: "Chase" },
        { id: "cfu", name: "Chase Freedom Unlimited", institution: "Chase" },
      ] as never[],
      undefined
    );

    expect(comparison?.usedCardMatched).toBe(false);
    expect(comparison?.usedDisplayName).toBe("Chase");
  });

  it("prefers a stable linkedCardId over issuer-level heuristics", () => {
    const comparison = buildRewardComparison(
      {
        amount: 60,
        category: "shopping",
        institution: "Chase",
        linkedCardId: "linked-card",
      },
      [
        { id: "other-card", name: "Chase Freedom Unlimited", institution: "Chase" },
        { id: "linked-card", name: "Prime Visa", institution: "Chase" },
        { id: "best", name: "Apple Card" },
      ] as never[],
      undefined
    );

    expect(comparison?.usedCardMatched).toBe(true);
    expect(comparison?.usedDisplayName).toBe("Prime Visa");
  });

  it("matches the used card by Plaid account id when the linked card id is not present", () => {
    const comparison = buildRewardComparison(
      {
        amount: 100,
        category: "online_shopping",
        accountId: "acct_prime",
      },
      [
        { id: "prime", name: "Prime Visa", _plaidAccountId: "acct_prime" },
        { id: "best", name: "Apple Card" },
      ] as never[],
      undefined
    );

    expect(comparison?.usedCardMatched).toBe(true);
    expect(comparison?.usedDisplayName).toBe("Prime Visa");
    expect(comparison?.actualYield).toBe(5);
    expect(comparison?.usedCardMatchConfidence).toBe("high");
  });

  it("uses zero baseline rewards when the transaction is linked to a bank account instead of a card", () => {
    const comparison = buildRewardComparison(
      {
        amount: 80,
        category: "shopping",
        accountName: "Checking",
        linkedBankAccountId: "bank_1",
      },
      [{ id: "best", name: "Apple Card" }] as never[],
      undefined
    );

    expect(comparison?.usedCardMatched).toBe(false);
    expect(comparison?.actualYield).toBe(0);
    expect(comparison?.actualRewardValue).toBe(0);
    expect(comparison?.incrementalRewardValue).toBeCloseTo(1.6);
  });

  it("formats reward rates consistently for the ledger badges", () => {
    expect(formatRewardRate(2)).toBe("2.0%");
    expect(formatRewardRate(2.75)).toBe("2.8%");
    expect(formatRewardRate(null)).toBe("0.0%");
  });

  it("suppresses fake times for date-only ledger rows", () => {
    expect(formatTransactionTime("2026-03-26")).toBeNull();
    expect(formatTransactionTime("2026-03-26T13:45:00Z")).toBeTruthy();
  });

  it("estimates statement-cycle spend by card and reward category", () => {
    const spendMap = estimateStatementCycleSpend(
      [{ id: "custom", name: "Citi Custom Cash Card", statementCloseDay: 20 }] as never[],
      [
        {
          date: "2026-03-25",
          amount: 72,
          category: "dining",
          merchantName: "Chipotle",
          linkedCardId: "custom",
        },
        {
          date: "2026-03-10",
          amount: 18,
          category: "dining",
          merchantName: "Chipotle",
          linkedCardId: "custom",
        },
      ],
      new Date("2026-03-26T12:00:00")
    );

    expect(spendMap).toEqual({
      custom: {
        dining: 72,
      },
    });
  });

  it("uses the correct cap period for annual and statement-cycle cards", () => {
    const spendMap = estimateRewardCapUsage(
      [
        { id: "bcp", name: "American Express Blue Cash Preferred Card" },
        { id: "custom", name: "Citi Custom Cash Card", statementCloseDay: 20 },
      ] as never[],
      [
        {
          date: "2026-01-05",
          amount: 120,
          category: "groceries",
          merchantName: "Whole Foods",
          linkedCardId: "bcp",
        },
        {
          date: "2025-12-28",
          amount: 80,
          category: "groceries",
          merchantName: "Whole Foods",
          linkedCardId: "bcp",
        },
        {
          date: "2026-03-22",
          amount: 40,
          category: "dining",
          merchantName: "Chipotle",
          linkedCardId: "custom",
        },
        {
          date: "2026-03-10",
          amount: 15,
          category: "dining",
          merchantName: "Chipotle",
          linkedCardId: "custom",
        },
      ],
      new Date("2026-03-26T12:00:00")
    );

    expect(spendMap).toEqual({
      bcp: {
        groceries: 120,
      },
      custom: {
        dining: 40,
      },
    });
  });
});
