import { scrubPromptContext } from "../../contexts/auditHelpers";
import { extractDashboardMetrics } from "../../utils.js";

import type {
  AuditRecord,
  BankAccount,
  Card,
  CatalystCashConfig,
  ChatHistoryMessage,
  GeminiHistoryMessage,
  Renewal,
  TrendContextEntry,
} from "../../../types/index.js";

type TransportHistory = ChatHistoryMessage[] | GeminiHistoryMessage[];

export interface CompactFinancialBrief {
  generatedAt: string;
  snapshotDate: string | null;
  currencyCode: string;
  profile: {
    birthYear: number | null;
    age: number | null;
    payFrequency: string;
    incomeType: string;
    housingType: string;
    stateCode: string;
  };
  income: {
    cycleNet: number | null;
    estimatedMonthly: number | null;
    sources: Array<{
      name: string;
      amount: number;
      frequency: string;
      type: string;
      nextDate: string | null;
    }>;
  };
  snapshot: {
    status: string;
    mode: string;
    healthScore: number | null;
    netWorth: number | null;
  };
  cash: {
    checking: number | null;
    vault: number | null;
    pending: number | null;
    available: number | null;
    emergencyFloor: number | null;
    checkingBuffer: number | null;
    weeklySpendAllowance: number | null;
  };
  credit: {
    creditScore: number | null;
    creditUtilization: number | null;
    totalCardDebt: number;
    totalCardLimit: number;
    overallUtilization: number | null;
  };
  debt: {
    totalNonCardDebt: number;
    totalDebt: number;
    nonCardDebts: Array<{
      name: string;
      balance: number;
      apr: number | null;
      minPayment: number | null;
    }>;
  };
  cards: Array<{
    id: string;
    name: string;
    institution: string;
    balance: number;
    limit: number;
    utilization: number | null;
    apr: number | null;
    minPayment: number | null;
    annualFee: number | null;
    annualFeeDue: string | null;
    statementCloseDay: number | null;
    paymentDueDay: number | null;
    last4: string | null;
    plaidLinked: boolean;
  }>;
  renewals: {
    monthlyEstimate: number;
    items: Array<{
      name: string;
      amount: number;
      interval: number;
      intervalUnit: string;
      monthlyAmount: number;
      nextDue: string | null;
      chargedTo: string | null;
      category: string | null;
    }>;
  };
  bankAccounts: Array<{
    id: string;
    name: string;
    bank: string;
    accountType: string;
    balance: number | null;
    apy: number | null;
    plaidLinked: boolean;
    reconnectRequired: boolean;
  }>;
  nearTerm: {
    totalDue14Days: number;
    byFundingSource: Array<{
      label: string;
      total: number;
      itemCount: number;
      nextDue: string | null;
    }>;
    items: Array<{
      name: string;
      amount: number;
      nextDue: string | null;
      chargedTo: string | null;
      chargedToType: string | null;
    }>;
  };
  trends: Array<{
    date: string;
    score: number | null;
    status: string;
    checking: number | null;
    vault: number | null;
    totalDebt: number | null;
  }>;
  auditHistory: ReturnType<typeof compactChatAuditHistory>;
}

function toNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function roundMoney(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100) / 100;
}

function getMonthlyPayPeriods(payFrequency: string | null | undefined): number {
  const normalized = String(payFrequency || "bi-weekly").trim().toLowerCase();
  if (normalized === "weekly") return 52 / 12;
  if (
    normalized === "bi-weekly" ||
    normalized === "biweekly" ||
    normalized === "every-2-weeks" ||
    normalized === "every 2 weeks"
  ) {
    return 26 / 12;
  }
  if (
    normalized === "semi-monthly" ||
    normalized === "semimonthly" ||
    normalized === "twice-monthly" ||
    normalized === "twice monthly"
  ) {
    return 2;
  }
  return 1;
}

function estimateCycleIncome(financialConfig: CatalystCashConfig | null | undefined): number | null {
  if (!financialConfig) return null;
  const incomeSources = Array.isArray(financialConfig.incomeSources) ? financialConfig.incomeSources : [];
  if (incomeSources.length > 0) {
    const annualIncome = incomeSources.reduce((sum, source) => {
      const amount = Math.max(0, Number(source?.amount) || 0);
      const frequency = String(source?.frequency || "monthly").toLowerCase();
      if (amount <= 0) return sum;
      if (frequency === "weekly") return sum + amount * 52;
      if (frequency === "bi-weekly" || frequency === "biweekly") return sum + amount * 26;
      if (frequency === "semi-monthly" || frequency === "semimonthly") return sum + amount * 24;
      if (frequency === "quarterly") return sum + amount * 4;
      if (frequency === "annual" || frequency === "yearly") return sum + amount;
      return sum + amount * 12;
    }, 0);
    const periodsPerYear = getMonthlyPayPeriods(financialConfig.payFrequency) * 12;
    if (annualIncome > 0 && periodsPerYear > 0) {
      return roundMoney(annualIncome / periodsPerYear);
    }
  }

  const paycheckStandard = toNumber(financialConfig.paycheckStandard);
  return paycheckStandard != null ? roundMoney(paycheckStandard) : null;
}

function estimateMonthlyIncome(financialConfig: CatalystCashConfig | null | undefined): number | null {
  if (!financialConfig) return null;
  const cycleIncome = estimateCycleIncome(financialConfig);
  if (cycleIncome == null) return null;
  return roundMoney(cycleIncome * getMonthlyPayPeriods(financialConfig.payFrequency));
}

function monthlyRenewalAmount(renewal: Renewal): number {
  const amount = Math.max(0, Number(renewal?.amount) || 0);
  const interval = Math.max(1, Number(renewal?.interval) || 1);
  const intervalUnit = String(renewal?.intervalUnit || "months").toLowerCase();
  if (intervalUnit === "weeks") return roundMoney((amount / interval) * 4.33);
  if (intervalUnit === "years" || intervalUnit === "annual" || intervalUnit === "yearly") {
    return roundMoney(amount / (interval * 12));
  }
  if (intervalUnit === "one-time" || intervalUnit === "one time") return 0;
  return roundMoney(amount / interval);
}

function summarizeCards(cards: Card[] | null | undefined) {
  if (!Array.isArray(cards) || cards.length === 0) return [];
  return [...cards]
    .filter(Boolean)
    .sort((left, right) => {
      const rightBalance = Number(right?.balance) || 0;
      const leftBalance = Number(left?.balance) || 0;
      if (rightBalance !== leftBalance) return rightBalance - leftBalance;
      return (Number(right?.limit) || 0) - (Number(left?.limit) || 0);
    })
    .slice(0, 5)
    .map((card) => {
      const balance = roundMoney(card?.balance);
      const limit = roundMoney(card?.limit ?? card?.creditLimit);
      return {
        id: String(card?.id || ""),
        name: String(card?.name || "Card"),
        institution: String(card?.institution || card?.issuer || ""),
        balance,
        limit,
        utilization: limit > 0 ? Math.round((balance / limit) * 1000) / 10 : null,
        apr: toNumber(card?.apr),
        minPayment: toNumber(card?.minPayment),
        annualFee: toNumber(card?.annualFee),
        annualFeeDue: card?.annualFeeDue ? String(card.annualFeeDue) : null,
        statementCloseDay: toNumber(card?.statementCloseDay),
        paymentDueDay: toNumber(card?.paymentDueDay ?? card?.dueDay),
        last4: String(card?.last4 || card?.mask || "").trim() || null,
        plaidLinked: Boolean(card?._plaidAccountId || card?._plaidConnectionId),
      };
    });
}

function summarizeNonCardDebts(financialConfig: CatalystCashConfig | null | undefined) {
  if (!financialConfig || !Array.isArray(financialConfig.nonCardDebts)) return [];
  return [...financialConfig.nonCardDebts]
    .filter(Boolean)
    .sort((left, right) => (Number(right?.balance) || 0) - (Number(left?.balance) || 0))
    .slice(0, 6)
    .map((debt) => ({
      name: String(debt?.name || "Debt"),
      balance: roundMoney(debt?.balance),
      apr: toNumber(debt?.apr),
      minPayment: toNumber(debt?.minPayment),
    }));
}

function summarizeRenewals(renewals: Renewal[] | null | undefined) {
  if (!Array.isArray(renewals) || renewals.length === 0) {
    return { monthlyEstimate: 0, items: [] };
  }

  const items = renewals
    .filter((renewal) => renewal && renewal.isCancelled !== true)
    .map((renewal) => ({
      name: String(renewal?.name || "Recurring charge"),
      amount: roundMoney(renewal?.amount),
      interval: Math.max(1, Number(renewal?.interval) || 1),
      intervalUnit: String(renewal?.intervalUnit || "months"),
      monthlyAmount: monthlyRenewalAmount(renewal),
      nextDue: renewal?.nextDue ? String(renewal.nextDue) : null,
      chargedTo: renewal?.chargedTo ? String(renewal.chargedTo) : null,
      category: renewal?.category ? String(renewal.category) : null,
    }))
    .sort((left, right) => right.monthlyAmount - left.monthlyAmount);

  return {
    monthlyEstimate: roundMoney(items.reduce((sum, item) => sum + item.monthlyAmount, 0)),
    items: items.slice(0, 5),
  };
}

function summarizeBankAccounts(bankAccounts: BankAccount[] | null | undefined) {
  if (!Array.isArray(bankAccounts) || bankAccounts.length === 0) return [];
  return [...bankAccounts]
    .filter(Boolean)
    .sort((left, right) => (Number(right?._plaidBalance ?? right?.balance) || 0) - (Number(left?._plaidBalance ?? left?.balance) || 0))
    .slice(0, 4)
    .map((account) => ({
      id: String(account?.id || ""),
      name: String(account?.name || "Bank account"),
      bank: String(account?.bank || ""),
      accountType: String(account?.accountType || ""),
      balance: toNumber(account?._plaidBalance ?? account?.balance),
      apy: toNumber(account?.apy),
      plaidLinked: Boolean(account?._plaidAccountId || account?._plaidConnectionId),
      reconnectRequired: Boolean(account?._plaidManualFallback),
    }));
}

function summarizeNearTermFunding(renewals: Renewal[] | null | undefined) {
  const items = (Array.isArray(renewals) ? renewals : [])
    .filter((renewal) => renewal && renewal.isCancelled !== true && renewal.archivedAt == null && renewal.nextDue)
    .map((renewal) => ({
      name: String(renewal?.name || "Recurring charge"),
      amount: roundMoney(renewal?.amount),
      nextDue: renewal?.nextDue ? String(renewal.nextDue) : null,
      chargedTo: renewal?.chargedTo ? String(renewal.chargedTo) : null,
      chargedToType: renewal?.chargedToType ? String(renewal.chargedToType) : null,
    }))
    .filter((renewal) => {
      if (!renewal.nextDue) return false;
      const due = new Date(`${renewal.nextDue}T12:00:00Z`);
      if (!Number.isFinite(due.getTime())) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const days = Math.ceil((due.getTime() - today.getTime()) / 86400000);
      return days >= 0 && days <= 14;
    })
    .sort((left, right) => String(left.nextDue || "").localeCompare(String(right.nextDue || "")));

  const sourceMap = new Map<string, { total: number; itemCount: number; nextDue: string | null }>();
  for (const item of items) {
    const key = item.chargedTo || "Unassigned";
    const current = sourceMap.get(key) || { total: 0, itemCount: 0, nextDue: null };
    current.total += item.amount;
    current.itemCount += 1;
    if (!current.nextDue || (item.nextDue && item.nextDue < current.nextDue)) current.nextDue = item.nextDue;
    sourceMap.set(key, current);
  }

  return {
    totalDue14Days: roundMoney(items.reduce((sum, item) => sum + item.amount, 0)),
    byFundingSource: [...sourceMap.entries()]
      .map(([label, payload]) => ({ label, ...payload }))
      .sort((left, right) => right.total - left.total)
      .slice(0, 4),
    items: items.slice(0, 5),
  };
}

function summarizeTrends(trendContext: TrendContextEntry[] | null | undefined) {
  if (!Array.isArray(trendContext) || trendContext.length === 0) return [];
  return trendContext.slice(-4).map((entry) => ({
    date: String(entry?.date || ""),
    score: toNumber(entry?.score),
    status: String(entry?.status || ""),
    checking: toNumber(entry?.checking),
    vault: toNumber(entry?.vault),
    totalDebt: toNumber(entry?.totalDebt),
  }));
}

export function compactChatAuditHistory(history: AuditRecord[] | null | undefined) {
  if (!Array.isArray(history) || history.length === 0) return [];
  return history
    .filter(Boolean)
    .slice(0, 3)
    .map((audit) => ({
      date: audit.date,
      ts: audit.ts,
      isTest: audit.isTest,
      parsed: {
        netWorth: audit.parsed?.netWorth ?? null,
        healthScore: audit.parsed?.healthScore
          ? {
              score: audit.parsed.healthScore.score ?? null,
              grade: audit.parsed.healthScore.grade ?? null,
            }
          : null,
      },
    }));
}

export function buildCompactFinancialBrief({
  current,
  financialConfig,
  cards,
  bankAccounts,
  renewals,
  history,
  trendContext,
}: {
  current: AuditRecord | null | undefined;
  financialConfig: CatalystCashConfig | null | undefined;
  cards: Card[] | null | undefined;
  bankAccounts: BankAccount[] | null | undefined;
  renewals: Renewal[] | null | undefined;
  history: AuditRecord[] | null | undefined;
  trendContext: TrendContextEntry[] | null | undefined;
}): CompactFinancialBrief {
  const parsed = current?.parsed || null;
  const metrics = extractDashboardMetrics(parsed);
  const summarizedCards = summarizeCards(cards);
  const summarizedBankAccounts = summarizeBankAccounts(bankAccounts);
  const summarizedRenewals = summarizeRenewals(renewals);
  const nearTermFunding = summarizeNearTermFunding(renewals);
  const summarizedNonCardDebts = summarizeNonCardDebts(financialConfig);
  const totalCardDebt = roundMoney(
    (Array.isArray(cards) ? cards : []).reduce((sum, card) => sum + (Number(card?.balance) || 0), 0)
  );
  const totalCardLimit = roundMoney(
    (Array.isArray(cards) ? cards : []).reduce((sum, card) => sum + (Number(card?.limit ?? card?.creditLimit) || 0), 0)
  );
  const totalNonCardDebt = roundMoney(
    summarizedNonCardDebts.reduce((sum, debt) => sum + (Number(debt?.balance) || 0), 0)
  );
  const birthYear = toNumber(financialConfig?.birthYear);
  const currentYear = new Date().getFullYear();

  return {
    generatedAt: new Date().toISOString(),
    snapshotDate: current?.date || null,
    currencyCode: String(financialConfig?.currencyCode || "USD"),
    profile: {
      birthYear,
      age: birthYear != null ? currentYear - birthYear : null,
      payFrequency: String(financialConfig?.payFrequency || "bi-weekly"),
      incomeType: String(financialConfig?.incomeType || ""),
      housingType: String(financialConfig?.housingType || ""),
      stateCode: String(financialConfig?.stateCode || ""),
    },
    income: {
      cycleNet: estimateCycleIncome(financialConfig),
      estimatedMonthly: estimateMonthlyIncome(financialConfig),
      sources: (Array.isArray(financialConfig?.incomeSources) ? financialConfig.incomeSources : [])
        .filter(Boolean)
        .slice(0, 2)
        .map((source) => ({
          name: String(source?.name || "Income"),
          amount: roundMoney(source?.amount),
          frequency: String(source?.frequency || "monthly"),
          type: String(source?.type || ""),
          nextDate: source?.nextDate ? String(source.nextDate) : null,
        })),
    },
    snapshot: {
      status: String(parsed?.status || ""),
      mode: String(parsed?.mode || ""),
      healthScore: toNumber(parsed?.healthScore?.score),
      netWorth: toNumber(parsed?.netWorth),
    },
    cash: {
      checking: toNumber(metrics?.checking),
      vault: toNumber(metrics?.vault),
      pending: toNumber(metrics?.pending),
      available: toNumber(metrics?.available),
      emergencyFloor: toNumber(financialConfig?.emergencyFloor),
      checkingBuffer: toNumber(financialConfig?.checkingBuffer),
      weeklySpendAllowance: toNumber(financialConfig?.weeklySpendAllowance),
    },
    credit: {
      creditScore: toNumber(financialConfig?.creditScore),
      creditUtilization: toNumber(financialConfig?.creditUtilization),
      totalCardDebt,
      totalCardLimit,
      overallUtilization: totalCardLimit > 0 ? Math.round((totalCardDebt / totalCardLimit) * 1000) / 10 : null,
    },
    debt: {
      totalNonCardDebt,
      totalDebt: roundMoney(totalCardDebt + totalNonCardDebt),
      nonCardDebts: summarizedNonCardDebts,
    },
    cards: summarizedCards,
    bankAccounts: summarizedBankAccounts,
    renewals: summarizedRenewals,
    nearTerm: nearTermFunding,
    trends: summarizeTrends(trendContext),
    auditHistory: compactChatAuditHistory(history),
  };
}

export function scrubChatTransportHistory(history: TransportHistory, scrub: (input: string) => string): TransportHistory {
  if (!Array.isArray(history) || history.length === 0) return history;
  const first = history[0];
  if (first && typeof first === "object" && "parts" in first) {
    return (history as GeminiHistoryMessage[]).map((message) => ({
      ...message,
      parts: (message.parts || []).map((part) => ({
        ...part,
        text: scrub(part?.text || ""),
      })),
    })) as TransportHistory;
  }
  return (history as ChatHistoryMessage[]).map((message) => ({
    ...message,
    content: scrub(message.content || ""),
  })) as TransportHistory;
}

export function prepareScrubbedChatTransport({
  latestUserMessage,
  promptContext,
  apiHistory,
  scrub,
}: {
  latestUserMessage: string;
  promptContext: Record<string, unknown>;
  apiHistory: TransportHistory;
  scrub: (input: string) => string;
}) {
  return {
    snapshot: scrub(latestUserMessage),
    promptContext: scrubPromptContext(promptContext, scrub),
    apiHistory: scrubChatTransportHistory(apiHistory, scrub),
  };
}
