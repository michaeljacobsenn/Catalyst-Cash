import type React from "react";

export interface TransactionRewardComparison {
  usedDisplayName: string;
  bestCardNotes?: string | null;
  actualYield: number;
  optimalYield: number;
  actualRewardValue: number;
  optimalRewardValue: number;
  incrementalRewardValue: number;
  usedCardMatched: boolean;
  usedCardMatchConfidence?: "high" | "medium" | "low" | "none";
  usedCardMatchSource?: string;
}

export interface TransactionRecord {
  id?: string;
  date: string;
  amount: number;
  description?: string;
  name?: string;
  category?: string;
  subcategory?: string;
  pending?: boolean;
  institution?: string;
  accountName?: string;
  accountId?: string | null;
  linkedCardId?: string | null;
  linkedBankAccountId?: string | null;
  merchantId?: string | null;
  merchantMcc?: number | string | null;
  merchantKey?: string | null;
  merchantBrand?: string | null;
  merchantConfidence?: string | null;
  isCredit?: boolean;
  optimalCard?: { name?: string; effectiveYield?: number; rewardNotes?: string | null } | null;
  usedOptimal?: boolean;
  rewardComparison?: TransactionRewardComparison | null;
}

export interface LegacyTransactionResult {
  transactions?: TransactionRecord[];
  data?: TransactionRecord[];
  fetchedAt: string;
}

export type TransactionLinkOverrideMap = Record<string, { linkedCardId?: string | null; linkedBankAccountId?: string | null; updatedAt?: string }>;

export interface PlaidConnection {
  id: string;
  institutionName?: string;
  institutionId?: string;
  lastSync?: string;
  accounts?: unknown[];
  _needsReconnect?: boolean;
}

export type IconComponent = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

export interface TransactionGroup {
  date: string;
  total: number;
  creditTotal: number;
  txns: TransactionRecord[];
}

export interface TransactionStats {
  totalSpent: number;
  totalReceived: number;
  count: number;
}

export interface CategoryMeta {
  icon?: IconComponent;
  color: string;
  bg: string;
}

export interface CategoryBreakdownItem {
  category: string;
  amount: number;
  pct: number;
  meta: CategoryMeta;
}

export interface MissedOpportunitySummary {
  totalMissedValue: number;
  optimalTxns: number;
  badTxns: number;
  totalTxns: number;
}
