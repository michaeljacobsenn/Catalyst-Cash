import type { Renewal } from "../../../types/index.js";

import { toGroupedRenewalItem } from "./helpers";

export interface RenewalDraftState {
  name: string;
  amount: string;
  interval: number;
  intervalUnit: string;
  source: string;
  chargedTo: string;
  chargedToId: string;
  chargedToType: string;
  nextDue: string;
  category: string;
}

export interface GroupedRenewalItem extends Renewal {
  originalIndex?: number;
  isExpired?: boolean;
}

export interface GroupedCategory {
  id: string;
  label: string;
  color: string;
  items: GroupedRenewalItem[];
}

export interface RenewalCategoryMeta {
  label: string;
  color: string;
}

export type RenewalCategoryMetaMap = Record<string, RenewalCategoryMeta>;
export type SortMode = "type" | "date" | "amount" | "name";

export const RENEWAL_CATEGORY_OPTIONS = [
  { id: "housing", label: "Housing & Utilities" },
  { id: "subs", label: "Subscriptions" },
  { id: "insurance", label: "Insurance" },
  { id: "transport", label: "Transportation" },
  { id: "essentials", label: "Groceries & Essentials" },
  { id: "medical", label: "Medical & Health" },
  { id: "sinking", label: "Sinking Funds" },
  { id: "onetime", label: "One-Time Expenses" },
] as const;

export const RENEWAL_SORT_LABELS: Record<SortMode, string> = {
  type: "Sort: Type",
  date: "Sort: Date",
  amount: "Sort: Amt",
  name: "Sort: A-Z",
};

const LEGACY_CATEGORY_MAP: Record<string, string> = {
  ss: "subs",
  fixed: "housing",
  monthly: "housing",
  cadence: "subs",
  periodic: "subs",
};

const RENEWAL_CATEGORY_ORDER = [
  "housing",
  "fixed",
  "monthly",
  "medical",
  "essentials",
  "insurance",
  "transport",
  "subs",
  "ss",
  "cadence",
  "periodic",
  "sinking",
  "onetime",
  "af",
  "inactive",
] as const;

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function intervalToMonths(interval?: number, unit?: string) {
  const safeInterval = interval || 1;
  if (unit === "days") return safeInterval / 30.44;
  if (unit === "weeks") return safeInterval / 4.33;
  if (unit === "years") return safeInterval * 12;
  if (unit === "one-time") return 999;
  return safeInterval;
}

function compareGroupedRenewalItems(left: GroupedRenewalItem, right: GroupedRenewalItem) {
  const leftFrequency = intervalToMonths(left.interval, left.intervalUnit);
  const rightFrequency = intervalToMonths(right.interval, right.intervalUnit);
  if (leftFrequency !== rightFrequency) return leftFrequency - rightFrequency;

  const leftDue = left.nextDue || "9999";
  const rightDue = right.nextDue || "9999";
  if (leftDue !== rightDue) return leftDue.localeCompare(rightDue);

  return (right.amount || 0) - (left.amount || 0);
}

export function createEmptyRenewalFormState(): RenewalDraftState {
  return {
    name: "",
    amount: "",
    interval: 1,
    intervalUnit: "months",
    source: "",
    chargedTo: "",
    chargedToId: "",
    chargedToType: "",
    category: "subs",
    nextDue: "",
  };
}

export function isInactiveRenewal(item: Pick<Renewal, "isCancelled" | "isExpired" | "archivedAt" | "interval">) {
  return Boolean(item.isCancelled || item.isExpired || item.archivedAt || (item.interval || 0) <= 0);
}

export function buildGroupedRenewalItems(
  renewals: Renewal[] = [],
  cardAnnualFees: Renewal[] = [],
  now = todayIsoDate()
): GroupedRenewalItem[] {
  const items = renewals.map((renewal, index) => toGroupedRenewalItem(renewal, index, now));

  for (const annualFee of cardAnnualFees) {
    const exists = items.some(
      (item) =>
        (item.linkedCardId && annualFee.linkedCardId && item.linkedCardId === annualFee.linkedCardId) ||
        item.name === annualFee.name ||
        item.linkedCardAF === annualFee.cardName
    );

    if (!exists) {
      items.push(toGroupedRenewalItem(annualFee, items.length, now));
    }
  }

  return items;
}

export function buildRenewalGroups(
  items: GroupedRenewalItem[] = [],
  {
    sortBy = "type",
    showInactive = false,
    categoryMeta,
  }: {
    sortBy?: SortMode;
    showInactive?: boolean;
    categoryMeta: RenewalCategoryMetaMap;
  }
): GroupedCategory[] {
  const visibleItems = showInactive ? items : items.filter((item) => !isInactiveRenewal(item));
  if (!visibleItems.length) return [];
  const fallbackMeta = categoryMeta.subs || { label: "Subscriptions", color: "" };
  const buildGroup = (id: string, meta?: RenewalCategoryMeta): GroupedCategory => ({
    id,
    label: meta?.label || fallbackMeta.label,
    color: meta?.color || fallbackMeta.color,
    items: [],
  });

  if (sortBy !== "type") {
    const flat = [...visibleItems];
    if (sortBy === "name") flat.sort((left, right) => (left.name || "").localeCompare(right.name || ""));
    else if (sortBy === "date") flat.sort((left, right) => (left.nextDue || "9999").localeCompare(right.nextDue || "9999"));
    else if (sortBy === "amount") flat.sort((left, right) => (right.amount || 0) - (left.amount || 0));

    return [
      {
        id: "sorted",
        label: showInactive ? "All Tracked Renewals" : "Active Renewals",
        color: categoryMeta.subs?.color || "",
        items: flat,
      },
    ];
  }

  const categories: Record<string, GroupedCategory> = {};

  for (const item of visibleItems) {
    if (isInactiveRenewal(item)) {
      if (!categories.inactive) {
        categories.inactive = buildGroup("inactive", categoryMeta.inactive);
      }
      categories.inactive.items.push(item);
      continue;
    }

    const rawCategory = item.isCardAF ? "af" : item.category || "subs";
    const categoryId = LEGACY_CATEGORY_MAP[rawCategory] || rawCategory;

    if (!categories[categoryId]) {
      categories[categoryId] = buildGroup(categoryId, categoryMeta[categoryId]);
    }

    categories[categoryId].items.push(item);
  }

  for (const category of Object.values(categories)) {
    category.items.sort(compareGroupedRenewalItems);
  }

  return RENEWAL_CATEGORY_ORDER.flatMap((categoryId) => {
    const category = categories[categoryId];
    return category ? [category] : [];
  });
}

export function calculateMonthlyRenewalTotal(items: GroupedRenewalItem[] = []) {
  let total = 0;

  for (const item of items) {
    if (isInactiveRenewal(item)) continue;

    const interval = item.interval || 1;
    const unit = item.intervalUnit || "months";

    if (unit === "days") total += (item.amount / interval) * 30.44;
    else if (unit === "weeks") total += (item.amount / interval) * 4.33;
    else if (unit === "months") total += item.amount / interval;
    else if (unit === "years") total += item.amount / (interval * 12);
  }

  return total;
}

export function countInactiveRenewalItems(items: GroupedRenewalItem[] = []) {
  return items.filter((item) => isInactiveRenewal(item)).length;
}

export function countActiveRenewalItems(items: GroupedRenewalItem[] = []) {
  return items.filter((item) => !isInactiveRenewal(item)).length;
}
