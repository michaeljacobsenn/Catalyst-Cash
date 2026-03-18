import type { Card as PortfolioCard, CustomValuations } from "../../../types/index.js";

import { T } from "../../constants.js";
import { getOptimalCard } from "../../rewardsCatalog.js";

interface TransactionRewardInput {
  amount: number;
  isCredit?: boolean;
  category?: string | null;
  accountName?: string;
  institution?: string;
}

interface CsvTransaction {
  date: string;
  description?: string;
  amount: number;
  isCredit?: boolean;
  category?: string;
  accountName?: string;
  institution?: string;
  pending?: boolean;
}

export const CATEGORY_MAP = {
  "food and drink": { icon: "Utensils", color: "#F59E0B", bg: "rgba(245,158,11,0.10)" },
  groceries: { icon: "ShoppingCart", color: "#F59E0B", bg: "rgba(245,158,11,0.10)" },
  restaurants: { icon: "Utensils", color: "#F59E0B", bg: "rgba(245,158,11,0.10)" },
  shops: { icon: "ShoppingCart", color: "#8B5CF6", bg: "rgba(139,92,246,0.10)" },
  "general merchandise": { icon: "ShoppingCart", color: "#8B5CF6", bg: "rgba(139,92,246,0.10)" },
  travel: { icon: "Plane", color: "#3B82F6", bg: "rgba(59,130,246,0.10)" },
  transportation: { icon: "Car", color: "#6366F1", bg: "rgba(99,102,241,0.10)" },
  automotive: { icon: "Car", color: "#6366F1", bg: "rgba(99,102,241,0.10)" },
  transfer: { icon: "ArrowUpRight", color: "#6B7280", bg: "rgba(107,114,128,0.10)" },
  "transfer in": { icon: "ArrowDownLeft", color: "#2ECC71", bg: "rgba(46,204,113,0.10)" },
  "transfer out": { icon: "ArrowUpRight", color: "#6B7280", bg: "rgba(107,114,128,0.10)" },
  payment: { icon: "CreditCard", color: "#7B5EA7", bg: "rgba(123,94,167,0.10)" },
  "loan payments": { icon: "Building2", color: "#F97316", bg: "rgba(249,115,22,0.10)" },
  "rent and utilities": { icon: "Home", color: "#0EA5E9", bg: "rgba(14,165,233,0.10)" },
  utilities: { icon: "Zap", color: "#0EA5E9", bg: "rgba(14,165,233,0.10)" },
  "home improvement": { icon: "Wrench", color: "#0EA5E9", bg: "rgba(14,165,233,0.10)" },
  service: { icon: "Briefcase", color: "#14B8A6", bg: "rgba(20,184,166,0.10)" },
  "general services": { icon: "Briefcase", color: "#14B8A6", bg: "rgba(20,184,166,0.10)" },
  subscription: { icon: "Wifi", color: "#A855F7", bg: "rgba(168,85,247,0.10)" },
  healthcare: { icon: "Stethoscope", color: "#EF4444", bg: "rgba(239,68,68,0.10)" },
  medical: { icon: "Stethoscope", color: "#EF4444", bg: "rgba(239,68,68,0.10)" },
  "personal care": { icon: "Heart", color: "#EC4899", bg: "rgba(236,72,153,0.10)" },
  fitness: { icon: "Dumbbell", color: "#10B981", bg: "rgba(16,185,129,0.10)" },
  recreation: { icon: "Gamepad2", color: "#EC4899", bg: "rgba(236,72,153,0.10)" },
  entertainment: { icon: "Gamepad2", color: "#EC4899", bg: "rgba(236,72,153,0.10)" },
  education: { icon: "GraduationCap", color: "#2563EB", bg: "rgba(37,99,235,0.10)" },
  community: { icon: "Heart", color: "#F43F5E", bg: "rgba(244,63,94,0.10)" },
  "gifts and donations": { icon: "Gift", color: "#F43F5E", bg: "rgba(244,63,94,0.10)" },
  "government and non profit": { icon: "Landmark", color: "#3B82F6", bg: "rgba(59,130,246,0.10)" },
  income: { icon: "Banknote", color: "#2ECC71", bg: "rgba(46,204,113,0.10)" },
  "bank fees": { icon: "Building2", color: "#EF4444", bg: "rgba(239,68,68,0.10)" },
  interest: { icon: "PiggyBank", color: "#2ECC71", bg: "rgba(46,204,113,0.10)" },
  childcare: { icon: "Baby", color: "#F59E0B", bg: "rgba(245,158,11,0.10)" },
};

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
      `"${t.category || ""}"`,
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

export function formatRewardRate(yieldValue: number | null | undefined) {
  if (typeof yieldValue !== "number" || Number.isNaN(yieldValue)) return "0x";
  const rounded = Math.round(yieldValue * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded.toFixed(1)}x` : `${rounded}x`;
}

function findUsedCard(txn: TransactionRewardInput, cards: PortfolioCard[]) {
  const accountName = txn.accountName?.toLowerCase();
  const institution = txn.institution?.toLowerCase();
  if (!accountName && !institution) return null;
  return cards.find(card => {
    const cardName = card.name?.toLowerCase?.() || "";
    return (
      (accountName && cardName.includes(accountName)) ||
      (institution && cardName.includes(institution))
    );
  }) || null;
}

export function buildRewardComparison(
  txn: TransactionRewardInput,
  cards: PortfolioCard[],
  customValuations: CustomValuations | undefined
) {
  if (!txn || txn.isCredit || !txn.category || txn.amount <= 0 || !Array.isArray(cards) || cards.length === 0) {
    return null;
  }

  const bestCard = getOptimalCard(cards, txn.category || "catch-all", customValuations);
  if (!bestCard) return null;

  const usedCard = findUsedCard(txn, cards);
  let actualYield = 1.0;

  if (usedCard) {
    const usedCardData = getOptimalCard([usedCard], txn.category || "catch-all", customValuations);
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
    actualYield,
    optimalYield,
    actualRewardValue,
    optimalRewardValue,
    incrementalRewardValue,
    usedOptimal: optimalYield <= actualYield,
    usedCardMatched: Boolean(usedCard),
  };
}

export function getCategoryMeta(category: string | null | undefined, iconMap: Record<string, unknown>) {
  if (!category) return { icon: iconMap.HelpCircle, color: T.text.dim, bg: "rgba(107,114,128,0.08)" };
  const key = category.toLowerCase().trim();
  const meta = CATEGORY_MAP[key];
  if (!meta) return { icon: iconMap.HelpCircle, color: T.text.dim, bg: "rgba(107,114,128,0.08)" };
  return {
    icon: iconMap[meta.icon],
    color: meta.color,
    bg: meta.bg,
  };
}
