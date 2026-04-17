import { describe, expect, it } from "vitest";

import { HelpCircle, ShoppingCart } from "../../icons";
import {
  analyzeTransactionRewards,
  buildCategoryBreakdown,
  buildTransactionAccounts,
  buildTransactionCategories,
  buildTransactionStats,
  filterTransactions,
  groupTransactionsByDate,
} from "./derived";

describe("transaction feed derived state", () => {
  it("builds sorted category and account filter lists", () => {
    const transactions = [
      { date: "2026-04-10", amount: 12, category: "Dining", description: "Cafe", institution: "Chase", accountName: "Freedom" },
      { date: "2026-04-10", amount: 20, category: "Groceries", description: "Whole Foods", institution: "Chase", accountName: "Freedom" },
      { date: "2026-04-09", amount: 50, category: "Travel", description: "Uber", institution: "Amex", accountName: "Gold" },
    ];

    expect(buildTransactionCategories(transactions as never[])).toEqual(["food and drink", "groceries", "travel"]);
    expect(buildTransactionAccounts(transactions as never[])).toEqual(["Amex - Gold", "Chase - Freedom"]);
  });

  it("filters by search, category, and account", () => {
    const transactions = [
      { date: "2026-04-10", amount: 12, category: "Dining", description: "Cafe", institution: "Chase", accountName: "Freedom" },
      { date: "2026-04-10", amount: 20, category: "Groceries", name: "Whole Foods", institution: "Chase", accountName: "Freedom" },
      { date: "2026-04-09", amount: 50, category: "Travel", description: "Uber", institution: "Amex", accountName: "Gold" },
    ];

    expect(filterTransactions(transactions as never[], { searchQuery: "uber" })).toHaveLength(1);
    expect(filterTransactions(transactions as never[], { searchQuery: "whole foods" })).toHaveLength(1);
    expect(filterTransactions(transactions as never[], { activeCategory: "groceries" })).toHaveLength(1);
    expect(filterTransactions(transactions as never[], { activeAccount: "Chase - Freedom" })).toHaveLength(2);
    expect(filterTransactions(transactions as never[], { searchQuery: "food & drink" })).toHaveLength(1);
  });

  it("groups visible transactions by date and respects the free preview cap", () => {
    const transactions = Array.from({ length: 8 }, (_, index) => ({
      id: `txn-${index}`,
      date: index < 6 ? "2026-04-10" : "2026-04-09",
      amount: 10 + index,
      isCredit: index === 0,
    }));

    const freeGroups = groupTransactionsByDate(transactions as never[], { proEnabled: false, visibleCount: 50 });
    expect(freeGroups).toHaveLength(1);
    expect(freeGroups[0]?.txns).toHaveLength(5);

    const proGroups = groupTransactionsByDate(transactions as never[], { proEnabled: true, visibleCount: 8 });
    expect(proGroups.map((group) => group.date)).toEqual(["2026-04-10", "2026-04-09"]);
    expect(proGroups[0]?.creditTotal).toBe(10);
  });

  it("builds feed stats and category breakdown from debit transactions", () => {
    const transactions = [
      { date: "2026-04-10", amount: 25, category: "Dining", description: "Cafe" },
      { date: "2026-04-10", amount: 40, category: "Dining", description: "Bistro" },
      { date: "2026-04-09", amount: 100, category: "Income", description: "Payroll", isCredit: true },
    ];

    expect(buildTransactionStats(transactions as never[])).toEqual({
      totalSpent: 65,
      totalReceived: 100,
      count: 3,
    });

    const breakdown = buildCategoryBreakdown(transactions as never[], {
      ShoppingCart,
      HelpCircle,
    });
    expect(breakdown).toHaveLength(1);
    expect(breakdown[0]).toMatchObject({
      category: "food and drink",
      amount: 65,
      pct: 100,
    });
  });

  it("analyzes rewards into row-level comparisons and a summary", () => {
    const { transactions, summary } = analyzeTransactionRewards(
      [
        {
          id: "txn-1",
          date: "2026-04-12",
          amount: 100,
          category: "shopping",
          accountName: "Quicksilver",
          institution: "Capital One",
        },
        {
          id: "txn-2",
          date: "2026-04-11",
          amount: 75,
          category: "travel",
          accountName: "Prime Visa",
          linkedCardId: "prime",
        },
      ] as never[],
      [
        { id: "quicksilver", name: "Quicksilver Cash Rewards" },
        { id: "prime", name: "Prime Visa" },
        { id: "best", name: "Apple Card" },
      ] as never[],
      undefined
    );

    expect(transactions[0]?.rewardComparison?.incrementalRewardValue).toBeGreaterThan(0);
    expect(transactions[0]?.optimalCard?.name).toBeTruthy();
    expect(typeof transactions[0]?.usedOptimal).toBe("boolean");
    expect(summary.totalTxns).toBe(2);
    expect(summary.badTxns + summary.optimalTxns).toBe(2);
  });

  it("ignores tiny matched reward deltas so the ledger does not overstate noise", () => {
    const { summary } = analyzeTransactionRewards(
      [
        {
          id: "txn-1",
          date: "2026-04-12",
          amount: 10,
          category: "shopping",
          accountName: "Quicksilver",
          institution: "Capital One",
        },
      ] as never[],
      [
        { id: "used", name: "Quicksilver Cash Rewards" },
        { id: "best", name: "Apple Card" },
      ] as never[],
      undefined
    );

    expect(summary.totalTxns).toBe(1);
    expect(summary.badTxns).toBe(0);
    expect(summary.totalMissedValue).toBe(0);
  });

  it("requires a higher delta when the used payment method is only a baseline estimate", () => {
    const { summary } = analyzeTransactionRewards(
      [
        {
          id: "txn-1",
          date: "2026-04-12",
          amount: 10,
          category: "shopping",
          accountName: "Checking",
          linkedBankAccountId: "bank_1",
        },
      ] as never[],
      [{ id: "best", name: "Apple Card" }] as never[],
      undefined
    );

    expect(summary.totalTxns).toBe(1);
    expect(summary.badTxns).toBe(0);
    expect(summary.totalMissedValue).toBe(0);
  });
});
