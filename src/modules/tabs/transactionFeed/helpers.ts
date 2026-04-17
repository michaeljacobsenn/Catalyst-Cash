import type React from "react";
import type { Card as PortfolioCard, CustomValuations } from "../../../types/index.js";

import { T } from "../../constants.js";
import { inferMerchantIdentity } from "../../merchantIdentity.js";
import { getCardMultiplier, getOptimalCard } from "../../rewardsCatalog.js";
import type { CategoryMeta } from "./types";

interface TransactionRewardInput {
  date?: string;
  amount: number;
  isCredit?: boolean;
  category?: string | null;
  subcategory?: string | null;
  accountId?: string | null;
  accountName?: string;
  linkedCardId?: string | null;
  linkedBankAccountId?: string | null;
  institution?: string;
  description?: string;
  merchantName?: string | null;
  merchantId?: string | null;
  merchantMcc?: number | string | null;
  merchantKey?: string | null;
  merchantBrand?: string | null;
  name?: string;
}

interface CsvTransaction {
  date: string;
  description?: string;
  amount: number;
  isCredit?: boolean;
  category?: string;
  subcategory?: string;
  accountId?: string | null;
  accountName?: string;
  linkedCardId?: string | null;
  linkedBankAccountId?: string | null;
  institution?: string;
  merchantName?: string | null;
  merchantId?: string | null;
  merchantMcc?: number | string | null;
  merchantKey?: string | null;
  merchantBrand?: string | null;
  pending?: boolean;
}

type MatchConfidence = "high" | "medium" | "low" | "none";

type UsedCardMatch = {
  card: PortfolioCard | null;
  confidence: MatchConfidence;
  source: "linked_card_id" | "plaid_account_id" | "last4" | "account_name" | "merchant_descriptor" | "institution" | "none";
};

export type RewardCapSpendMap = Record<string, Record<string, number>>;
export type StatementCycleSpendMap = RewardCapSpendMap;

export const CATEGORY_MAP = {
  "food and drink": { icon: "Utensils", color: "#F59E0B", bg: "rgba(245,158,11,0.10)" },
  groceries: { icon: "ShoppingCart", color: "#F59E0B", bg: "rgba(245,158,11,0.10)" },
  shopping: { icon: "ShoppingCart", color: "#8B5CF6", bg: "rgba(139,92,246,0.10)" },
  travel: { icon: "Plane", color: "#3B82F6", bg: "rgba(59,130,246,0.10)" },
  transportation: { icon: "Car", color: "#6366F1", bg: "rgba(99,102,241,0.10)" },
  automotive: { icon: "Car", color: "#6366F1", bg: "rgba(99,102,241,0.10)" },
  transfer: { icon: "ArrowUpRight", color: "#6B7280", bg: "rgba(107,114,128,0.10)" },
  payments: { icon: "CreditCard", color: "#A855F7", bg: "rgba(168,85,247,0.10)" },
  "home and bills": { icon: "Home", color: "#0EA5E9", bg: "rgba(14,165,233,0.10)" },
  "home improvement": { icon: "Wrench", color: "#0EA5E9", bg: "rgba(14,165,233,0.10)" },
  services: { icon: "Briefcase", color: "#14B8A6", bg: "rgba(20,184,166,0.10)" },
  subscriptions: { icon: "Wifi", color: "#A855F7", bg: "rgba(168,85,247,0.10)" },
  healthcare: { icon: "Stethoscope", color: "#EF4444", bg: "rgba(239,68,68,0.10)" },
  medical: { icon: "Stethoscope", color: "#EF4444", bg: "rgba(239,68,68,0.10)" },
  "personal care": { icon: "Heart", color: "#EC4899", bg: "rgba(236,72,153,0.10)" },
  fitness: { icon: "Dumbbell", color: "#10B981", bg: "rgba(16,185,129,0.10)" },
  recreation: { icon: "Gamepad2", color: "#EC4899", bg: "rgba(236,72,153,0.10)" },
  entertainment: { icon: "Gamepad2", color: "#EC4899", bg: "rgba(236,72,153,0.10)" },
  education: { icon: "GraduationCap", color: "#2563EB", bg: "rgba(37,99,235,0.10)" },
  community: { icon: "Heart", color: "#F43F5E", bg: "rgba(244,63,94,0.10)" },
  "gifts and donations": { icon: "Gift", color: "#F43F5E", bg: "rgba(244,63,94,0.10)" },
  "government and nonprofit": { icon: "Landmark", color: "#3B82F6", bg: "rgba(59,130,246,0.10)" },
  income: { icon: "Banknote", color: "#2ECC71", bg: "rgba(46,204,113,0.10)" },
  "bank fees": { icon: "Building2", color: "#EF4444", bg: "rgba(239,68,68,0.10)" },
  interest: { icon: "PiggyBank", color: "#2ECC71", bg: "rgba(46,204,113,0.10)" },
  childcare: { icon: "Baby", color: "#F59E0B", bg: "rgba(245,158,11,0.10)" },
};

const CATEGORY_ALIASES: Record<string, string> = {
  dining: "food and drink",
  restaurants: "food and drink",
  "food and drink": "food and drink",
  shops: "shopping",
  "general merchandise": "shopping",
  payment: "payments",
  payments: "payments",
  "loan payments": "payments",
  "loan disbursements": "payments",
  "transfer in": "transfer",
  "transfer out": "transfer",
  transfer: "transfer",
  service: "services",
  "general services": "services",
  subscription: "subscriptions",
  subscriptions: "subscriptions",
  utilities: "home and bills",
  "rent and utilities": "home and bills",
  "gifts and donations": "gifts and donations",
  "government and non profit": "government and nonprofit",
};

const CATEGORY_LABELS: Record<string, string> = {
  "food and drink": "Food & Drink",
  groceries: "Groceries",
  shopping: "Shopping",
  travel: "Travel",
  transportation: "Transportation",
  automotive: "Automotive",
  transfer: "Transfer",
  payments: "Payments",
  "home and bills": "Home & Bills",
  "home improvement": "Home Improvement",
  services: "Services",
  subscriptions: "Subscriptions",
  healthcare: "Healthcare",
  medical: "Medical",
  "personal care": "Personal Care",
  fitness: "Fitness",
  recreation: "Entertainment",
  entertainment: "Entertainment",
  education: "Education",
  community: "Community",
  "gifts and donations": "Gifts & Donations",
  "government and nonprofit": "Government & Nonprofit",
  income: "Income",
  "bank fees": "Bank Fees",
  interest: "Interest",
  childcare: "Childcare",
  other: "Other",
};

const PAYMENT_DESCRIPTION_PATTERNS = [
  /\bmobile payment\b/i,
  /\bonline payment\b/i,
  /\bpayment thank you\b/i,
  /\bthank you\b/i,
  /\bautopay\b/i,
];

export function formatDateHeader(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export function formatMoney(amount: number, isCredit: boolean) {
  const formatted = amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
  return isCredit ? `+${formatted}` : formatted;
}

export function isTransactionInSameMonth(dateStr: string | null | undefined, referenceDate = new Date()) {
  if (!dateStr) return false;
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, "0");
  return dateStr.startsWith(`${year}-${month}-`);
}

export function buildCSV(transactions: CsvTransaction[]) {
  const headers = ["Date", "Description", "Amount", "Type", "Category", "Account", "Institution", "Pending"];
  const rows = transactions.map(t =>
    [
      t.date,
      `"${(t.description || "").replace(/"/g, '""')}"`,
      t.isCredit ? t.amount : -t.amount,
      t.isCredit ? "Credit" : "Debit",
      `"${getCategoryLabel(t.category, t.description)}"`,
      `"${t.accountName || ""}"`,
      `"${t.institution || ""}"`,
      t.pending ? "Yes" : "No",
    ].join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

export function normalizeTransactionResult(result: { data?: unknown[]; transactions?: unknown[]; fetchedAt?: string } | null | undefined) {
  return {
    data: result?.data || result?.transactions || [],
    fetchedAt: result?.fetchedAt || "",
  };
}

export function getNormalizedCategoryKey(category: string | null | undefined, description: string | null | undefined = "") {
  const raw = String(category || "")
    .toLowerCase()
    .trim();
  const normalizedDescription = String(description || "").toLowerCase().trim();
  if (PAYMENT_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(normalizedDescription))) {
    return "payments";
  }
  if (!raw) return "other";
  return CATEGORY_ALIASES[raw] || raw;
}

export function getCategoryLabel(category: string | null | undefined, description: string | null | undefined = "") {
  const key = getNormalizedCategoryKey(category, description);
  return CATEGORY_LABELS[key] || key.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatRewardRate(yieldValue: number | null | undefined) {
  if (typeof yieldValue !== "number" || Number.isNaN(yieldValue)) return "0.0%";
  const rounded = Math.round(yieldValue * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded.toFixed(1)}%` : `${rounded}%`;
}

export function formatTransactionTime(dateValue: string | null | undefined) {
  if (!dateValue || /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return null;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function findUsedCard(txn: TransactionRewardInput, cards: PortfolioCard[]): UsedCardMatch {
  const normalize = (value: string | null | undefined) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const extractLast4 = (...values: Array<string | null | undefined>) => {
    const joined = values.join(" ");
    const matches = joined.match(/\b\d{4}\b/g);
    return matches?.[matches.length - 1] || "";
  };

  const accountName = normalize(txn.accountName);
  const accountId = String(txn.accountId || "").trim();
  const institution = normalize(txn.institution);
  const descriptor = normalize(txn.merchantName || txn.description || txn.name);
  const observedLast4 = extractLast4(txn.accountName, txn.description, txn.name);
  const linkedCardId = String(txn.linkedCardId || "").trim();

  const cardAliases = (card: PortfolioCard) =>
    [card.nickname, card.name]
      .map(alias => normalize(alias))
      .filter(alias => alias.length >= 4);

  if (linkedCardId) {
    const linkedCard = cards.find(card => String(card.id || "").trim() === linkedCardId);
    if (linkedCard) return { card: linkedCard, confidence: "high", source: "linked_card_id" };
  }

  if (accountId) {
    const plaidMatches = cards.filter(card => String(card._plaidAccountId || "").trim() === accountId);
    if (plaidMatches.length === 1) return { card: plaidMatches[0] || null, confidence: "high", source: "plaid_account_id" };
  }

  if (observedLast4) {
    const last4Matches = cards.filter(card => {
      const digits = String(card.last4 || card.mask || "").replace(/\D/g, "");
      return digits.length >= 4 && digits.endsWith(observedLast4);
    });
    if (last4Matches.length === 1) return { card: last4Matches[0] || null, confidence: "medium", source: "last4" };
  }

  if (accountName) {
    const accountMatches = cards.filter(card =>
      cardAliases(card).some(alias =>
        alias === accountName || alias.includes(accountName) || accountName.includes(alias)
      )
    );
    if (accountMatches.length === 1) return { card: accountMatches[0] || null, confidence: "medium", source: "account_name" };
  }

  if (descriptor) {
    const descriptorMatches = cards.filter(card =>
      cardAliases(card).some(alias => descriptor.includes(alias))
    );
    if (descriptorMatches.length === 1) return { card: descriptorMatches[0] || null, confidence: "low", source: "merchant_descriptor" };
  }

  if (institution) {
    const institutionMatches = cards.filter(card => {
      const cardInstitution = normalize(card.institution);
      return cardInstitution && (cardInstitution === institution || institution.includes(cardInstitution) || cardInstitution.includes(institution));
    });
    if (institutionMatches.length === 1) return { card: institutionMatches[0] || null, confidence: "low", source: "institution" };
  }

  return { card: null, confidence: "none", source: "none" };
}

export function buildRewardComparison(
  txn: TransactionRewardInput,
  cards: PortfolioCard[],
  customValuations: CustomValuations | undefined,
  options: { usedCaps?: Record<string, Record<string, number> | number | string> } = {}
) {
  if (!txn || txn.isCredit || !txn.category || txn.amount <= 0 || !Array.isArray(cards) || cards.length === 0) {
    return null;
  }

  const merchantIdentity = inferMerchantIdentity({
    merchantId: txn.merchantId,
    merchantName: txn.merchantName || txn.description || txn.name || txn.accountName || "",
    description: txn.description || txn.name || txn.accountName || "",
    category: txn.category || "catch-all",
    subcategory: txn.subcategory || "",
    mcc: txn.merchantMcc,
  });
  const bestCard = getOptimalCard(cards, merchantIdentity.rewardCategory || txn.category || "catch-all", customValuations, {
    merchantIdentity,
    merchantId: txn.merchantId,
    spendAmount: txn.amount,
    capMode: "conservative",
    usedCaps: options.usedCaps || {},
  });
  if (!bestCard) return null;

  const usedCardMatch = findUsedCard(txn, cards);
  const usedCard = usedCardMatch.card;
  let actualYield = txn.linkedBankAccountId && !txn.linkedCardId ? 0.0 : 1.0;

  if (usedCard) {
    const usedCardData = getOptimalCard([usedCard], merchantIdentity.rewardCategory || txn.category || "catch-all", customValuations, {
      merchantIdentity,
      merchantId: txn.merchantId,
      spendAmount: txn.amount,
      capMode: "conservative",
      usedCaps: options.usedCaps || {},
    });
    if (usedCardData?.effectiveYield) {
      actualYield = usedCardData.effectiveYield;
    }
  }

  const optimalYield = bestCard.effectiveYield || 0;
  const actualRewardValue = (txn.amount * actualYield) / 100;
  const optimalRewardValue = (txn.amount * optimalYield) / 100;
  const incrementalRewardValue = Math.max(0, optimalRewardValue - actualRewardValue);
  const usedDisplayName =
    usedCard?.name || txn.accountName || txn.institution || "Used payment method";

  return {
    bestCard,
    usedCard,
    usedDisplayName,
    bestCardNotes: bestCard.rewardNotes || null,
    actualYield,
    optimalYield,
    actualRewardValue,
    optimalRewardValue,
    incrementalRewardValue,
    usedOptimal: optimalYield <= actualYield,
    usedCardMatched: Boolean(usedCard),
    usedCardMatchConfidence: usedCardMatch.confidence,
    usedCardMatchSource: usedCardMatch.source,
    merchantIdentity,
  };
}

function padDay(value: number) {
  return String(value).padStart(2, "0");
}

function getStatementCycleStart(card: PortfolioCard, referenceDate = new Date()) {
  const closeDay = Number(card?.statementCloseDay);
  if (!Number.isFinite(closeDay) || closeDay <= 0) return null;

  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const currentClose = new Date(year, month, Math.min(closeDay, 28), 12, 0, 0);
  const effectiveClose = referenceDate.getDate() > closeDay ? currentClose : new Date(year, month - 1, Math.min(closeDay, 28), 12, 0, 0);
  effectiveClose.setDate(effectiveClose.getDate() + 1);
  return `${effectiveClose.getFullYear()}-${padDay(effectiveClose.getMonth() + 1)}-${padDay(effectiveClose.getDate())}`;
}

function getPeriodStart(period: string | null | undefined, card: PortfolioCard, referenceDate = new Date()) {
  if (period === "year") {
    return `${referenceDate.getFullYear()}-01-01`;
  }
  if (period === "quarter") {
    const quarterMonth = Math.floor(referenceDate.getMonth() / 3) * 3;
    return `${referenceDate.getFullYear()}-${padDay(quarterMonth + 1)}-01`;
  }
  if (period === "month") {
    return `${referenceDate.getFullYear()}-${padDay(referenceDate.getMonth() + 1)}-01`;
  }
  return getStatementCycleStart(card, referenceDate);
}

export function estimateRewardCapUsage(cards: PortfolioCard[], transactions: TransactionRewardInput[], referenceDate = new Date()): RewardCapSpendMap {
  const cardMap = new Map<string, PortfolioCard>();
  cards.forEach((card) => {
    const cardId = String(card?.id || "").trim();
    if (cardId) cardMap.set(cardId, card);
  });

  const cycleStarts = new Map<string, string>();

  return transactions.reduce<RewardCapSpendMap>((acc, txn) => {
    if (!txn || txn.isCredit || (Number(txn.amount) || 0) <= 0) return acc;
    const linkedCardId = String(txn.linkedCardId || "").trim();
    if (!linkedCardId || !txn.date) return acc;
    const card = cardMap.get(linkedCardId);
    if (!card) return acc;

    const merchantIdentity = inferMerchantIdentity({
      merchantId: txn.merchantId,
      merchantName: txn.merchantName || txn.description || txn.name || txn.accountName || "",
      description: txn.description || txn.name || txn.accountName || "",
      category: txn.category || "catch-all",
      subcategory: txn.subcategory || "",
      mcc: txn.merchantMcc,
    });
    const rewardCategory = merchantIdentity.rewardCategory || txn.category || "catch-all";
    const rewardInfo = getCardMultiplier(card.name, rewardCategory, {}, { merchantIdentity });
    if (!rewardInfo.cap) return acc;
    const periodKey = `${linkedCardId}:${rewardCategory}`;
    if (!cycleStarts.has(periodKey)) {
      const periodStart = getPeriodStart(rewardInfo.capPeriod, card, referenceDate);
      if (!periodStart) return acc;
      cycleStarts.set(periodKey, periodStart);
    }
    const periodStart = cycleStarts.get(periodKey);
    if (!periodStart || txn.date < periodStart) return acc;

    const nextCard = acc[linkedCardId] || {};
    nextCard[rewardCategory] = Math.round(((nextCard[rewardCategory] || 0) + txn.amount) * 100) / 100;
    acc[linkedCardId] = nextCard;
    return acc;
  }, {});
}

export function estimateStatementCycleSpend(cards: PortfolioCard[], transactions: TransactionRewardInput[], referenceDate = new Date()): StatementCycleSpendMap {
  return estimateRewardCapUsage(cards, transactions, referenceDate);
}

type IconComponent = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

export function getCategoryMeta(
  category: string | null | undefined,
  iconMap: Record<string, IconComponent>,
  description: string | null | undefined = ""
): CategoryMeta {
  const key = getNormalizedCategoryKey(category, description);
  const meta = CATEGORY_MAP[key as keyof typeof CATEGORY_MAP];
  if (!meta) {
    const fallbackIcon = iconMap.HelpCircle as IconComponent | undefined;
    return fallbackIcon
      ? { icon: fallbackIcon, color: T.text.dim, bg: "rgba(107,114,128,0.08)" }
      : { color: T.text.dim, bg: "rgba(107,114,128,0.08)" };
  }
  const icon = iconMap[meta.icon] as IconComponent | undefined;
  return icon
    ? { icon, color: meta.color, bg: meta.bg }
    : { color: meta.color, bg: meta.bg };
}
