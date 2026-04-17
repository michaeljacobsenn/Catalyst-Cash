import type { Card as PortfolioCard, CustomValuations } from "../../../types/index.js";

import {
  buildRewardComparison,
  estimateRewardCapUsage,
  getCategoryLabel,
  getCategoryMeta,
  getNormalizedCategoryKey,
  isTransactionInSameMonth,
} from "./helpers";
import type {
  CategoryBreakdownItem,
  IconComponent,
  MissedOpportunitySummary,
  TransactionGroup,
  TransactionRecord,
  TransactionStats,
} from "./types";

export function buildTransactionCategories(transactions: TransactionRecord[] = []): string[] {
  const set = new Set<string>(
    transactions.map((transaction) => getNormalizedCategoryKey(transaction.category, transaction.description))
  );
  return [...set].sort();
}

export function buildTransactionAccounts(transactions: TransactionRecord[] = []): string[] {
  const set = new Set<string>(
    transactions
      .map((transaction) => `${transaction.institution || ""} - ${transaction.accountName || ""}`)
      .filter((value) => value !== " - ")
  );
  return [...set].sort();
}

export function filterTransactions(
  transactions: TransactionRecord[] = [],
  {
    searchQuery = "",
    activeCategory = null,
    activeAccount = null,
  }: {
    searchQuery?: string;
    activeCategory?: string | null;
    activeAccount?: string | null;
  } = {}
): TransactionRecord[] {
  let list = transactions;

  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    list = list.filter(
      (transaction) =>
        (transaction.description || transaction.name || "").toLowerCase().includes(query) ||
        getCategoryLabel(transaction.category, transaction.description).toLowerCase().includes(query) ||
        getNormalizedCategoryKey(transaction.category, transaction.description).includes(query) ||
        (transaction.category || "").toLowerCase().includes(query) ||
        (transaction.institution || "").toLowerCase().includes(query) ||
        (transaction.accountName || "").toLowerCase().includes(query)
    );
  }

  if (activeCategory) {
    list = list.filter(
      (transaction) => getNormalizedCategoryKey(transaction.category, transaction.description) === activeCategory
    );
  }

  if (activeAccount) {
    list = list.filter(
      (transaction) => `${transaction.institution || ""} - ${transaction.accountName || ""}` === activeAccount
    );
  }

  return list;
}

export function groupTransactionsByDate(
  transactions: TransactionRecord[] = [],
  {
    proEnabled = false,
    visibleCount = 50,
  }: {
    proEnabled?: boolean;
    visibleCount?: number;
  } = {}
): TransactionGroup[] {
  const allowedList = proEnabled ? transactions : transactions.slice(0, 5);
  const visibleTransactions = allowedList.slice(0, visibleCount);
  const map = new Map<string, TransactionGroup>();

  for (const transaction of visibleTransactions) {
    const key = transaction.date;
    if (!map.has(key)) map.set(key, { date: key, total: 0, creditTotal: 0, txns: [] });
    const group = map.get(key);
    if (!group) continue;
    group.txns.push(transaction);
    if (transaction.isCredit) group.creditTotal += transaction.amount;
    else group.total += transaction.amount;
  }

  return [...map.values()];
}

export function buildTransactionStats(transactions: TransactionRecord[] = []): TransactionStats {
  const totalSpent = transactions.filter((transaction) => !transaction.isCredit).reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalReceived = transactions.filter((transaction) => transaction.isCredit).reduce((sum, transaction) => sum + transaction.amount, 0);
  return {
    totalSpent,
    totalReceived,
    count: transactions.length,
  };
}

export function buildCategoryBreakdown(
  transactions: TransactionRecord[] = [],
  iconMap: Record<string, IconComponent>
): CategoryBreakdownItem[] {
  const map = new Map<string, number>();

  for (const transaction of transactions) {
    if (transaction.isCredit) continue;
    const category = getNormalizedCategoryKey(transaction.category, transaction.description);
    map.set(category, (map.get(category) || 0) + transaction.amount);
  }

  const total = [...map.values()].reduce((sum, value) => sum + value, 0);

  return [...map.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([category, amount]) => {
      const meta = getCategoryMeta(category, iconMap);
      return {
        category,
        amount,
        pct: total > 0 ? (amount / total) * 100 : 0,
        meta: meta.icon ? meta : { color: meta.color, bg: meta.bg },
      };
    });
}

export function analyzeTransactionRewards(
  transactions: TransactionRecord[] = [],
  cards: PortfolioCard[] = [],
  customValuations?: CustomValuations
): {
  transactions: TransactionRecord[];
  summary: MissedOpportunitySummary;
} {
  const resetTransactions = transactions.map((transaction) => {
    const nextTransaction = { ...transaction };
    delete nextTransaction.optimalCard;
    delete nextTransaction.usedOptimal;
    delete nextTransaction.rewardComparison;
    return nextTransaction;
  });

  if (!cards.length || !resetTransactions.length) {
    return {
      transactions: resetTransactions,
      summary: {
        totalMissedValue: 0,
        optimalTxns: 0,
        badTxns: 0,
        totalTxns: 0,
      },
    };
  }

  const analyzableTransactions = resetTransactions.filter(
    (transaction) =>
      !transaction.isCredit &&
      Boolean(transaction.category) &&
      transaction.amount > 0 &&
      isTransactionInSameMonth(transaction.date)
  );
  const rewardCapUsage = estimateRewardCapUsage(cards, analyzableTransactions);

  let totalMissedValue = 0;
  let optimalTxns = 0;
  let badTxns = 0;

  for (const transaction of analyzableTransactions) {
    const comparison = buildRewardComparison(transaction, cards, customValuations, {
      usedCaps: rewardCapUsage,
    });
    if (!comparison) continue;

    transaction.optimalCard = comparison.bestCard;
    transaction.rewardComparison = {
      usedDisplayName: comparison.usedDisplayName,
      bestCardNotes: comparison.bestCardNotes,
      actualYield: comparison.actualYield,
      optimalYield: comparison.optimalYield,
      actualRewardValue: comparison.actualRewardValue,
      optimalRewardValue: comparison.optimalRewardValue,
      incrementalRewardValue: comparison.incrementalRewardValue,
      usedCardMatched: comparison.usedCardMatched,
      usedCardMatchConfidence: comparison.usedCardMatchConfidence,
      usedCardMatchSource: comparison.usedCardMatchSource,
    };
    transaction.usedOptimal = comparison.usedOptimal;

    if (comparison.usedOptimal) optimalTxns += 1;
    else {
      totalMissedValue += comparison.incrementalRewardValue;
      badTxns += 1;
    }
  }

  return {
    transactions: resetTransactions,
    summary: {
      totalMissedValue,
      optimalTxns,
      badTxns,
      totalTxns: analyzableTransactions.length,
    },
  };
}
