import { describe, expect, it } from "vitest";

import { buildCSV, buildRewardComparison, formatRewardRate, isTransactionInSameMonth, normalizeTransactionResult } from "./helpers";

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

  it("formats reward rates consistently for the ledger badges", () => {
    expect(formatRewardRate(2)).toBe("2.0x");
    expect(formatRewardRate(2.75)).toBe("2.8x");
    expect(formatRewardRate(null)).toBe("0x");
  });
});
