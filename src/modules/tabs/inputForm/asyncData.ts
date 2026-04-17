import type { CatalystCashConfig } from "../../../types/index.js";
import { getManualHoldingSourceId } from "../../investmentHoldings.js";
import { log } from "../../logger.js";

const HOLDING_BUCKET_KEYS = ["roth", "k401", "brokerage", "crypto", "hsa"] as const;
const ZERO_HOLDING_VALUES = {
  roth: 0,
  k401: 0,
  brokerage: 0,
  crypto: 0,
  hsa: 0,
};

type HoldingBucketKey = (typeof HOLDING_BUCKET_KEYS)[number];
type HoldingValues = Record<HoldingBucketKey, number>;
type HoldingBreakdownMap = Record<string, number>;

interface HoldingSymbolEntry {
  symbol?: string;
}

interface RecentPlaidTransaction {
  id?: string;
  date: string;
  pending?: boolean;
  isCredit?: boolean;
  amount: number;
  description: string;
  category?: string;
  accountName?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function formatFormDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isIsoDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeRecentPlaidTransactions(records: unknown[], cutoffDate: string) {
  const seen = new Set<string>();
  const transactions: RecentPlaidTransaction[] = [];

  for (const record of records) {
    if (!isPlainObject(record)) continue;
    const date = String(record.date || "").trim();
    if (!isIsoDateString(date) || date < cutoffDate) continue;
    if (record.pending === true || record.isCredit === true) continue;

    const amount = Number(record.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const description = String(record.description || "").trim();
    const accountName = String(record.accountName || "").trim();
    const dedupeKey =
      String(record.id || "").trim()
      || `${date}|${amount.toFixed(2)}|${description.toLowerCase()}|${accountName.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const transaction: RecentPlaidTransaction = {
      date,
      pending: false,
      isCredit: false,
      amount,
      description,
    };
    if (typeof record.id === "string" && record.id.trim()) {
      transaction.id = record.id;
    }
    const category = String(record.category || "").trim();
    if (category) {
      transaction.category = category;
    }
    if (accountName) {
      transaction.accountName = accountName;
    }
    transactions.push(transaction);
  }

  return transactions.sort((left, right) => right.date.localeCompare(left.date));
}

function getHoldingSymbols(holdings: Partial<Record<HoldingBucketKey, HoldingSymbolEntry[] | undefined>>) {
  return [
    ...new Set(
      HOLDING_BUCKET_KEYS
        .flatMap((key) => (Array.isArray(holdings[key]) ? holdings[key] : []))
        .map((holding) => String(holding?.symbol || "").trim().toUpperCase())
        .filter(Boolean)
    ),
  ];
}

export async function loadRecentPlaidTransactions(
  setPlaidTransactions: (transactions: RecentPlaidTransaction[]) => void,
  setTxnFetchedAt: (value: string | number | null) => void
) {
  try {
    const { getHydratedStoredTransactions } = await import("../../storedTransactions.js");
    const typedStored = await getHydratedStoredTransactions();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const recent = normalizeRecentPlaidTransactions(
      Array.isArray(typedStored?.data) ? typedStored.data : [],
      formatFormDate(cutoff)
    );

    setPlaidTransactions(recent);
    setTxnFetchedAt(typedStored?.fetchedAt ?? null);
  } catch (error) {
    setPlaidTransactions([]);
    setTxnFetchedAt(null);
    void log.warn("input-form", "Failed to load recent plaid transactions", { error });
  }
}

type AuditQuotaResult = Awaited<ReturnType<(typeof import("../../subscription.js"))["checkAuditQuota"]>>;

export async function loadAuditQuota(
  setAuditQuota: (quota: AuditQuotaResult | null) => void
) {
  const { checkAuditQuota } = await import("../../subscription.js");
  const quota = await checkAuditQuota();
  setAuditQuota(quota ?? null);
}

export async function loadHoldingValues(
  financialConfig: Partial<CatalystCashConfig> | null | undefined,
  setHoldingValues: (values: HoldingValues) => void,
  setHoldingBreakdowns?: (values: HoldingBreakdownMap) => void
) {
  if (!financialConfig?.enableHoldings) {
    setHoldingValues({ ...ZERO_HOLDING_VALUES });
    setHoldingBreakdowns?.({});
    return;
  }

  const holdings = financialConfig.holdings || {};
  const allSymbols = getHoldingSymbols(holdings);
  if (allSymbols.length === 0) {
    setHoldingValues({ ...ZERO_HOLDING_VALUES });
    setHoldingBreakdowns?.({});
    return;
  }

  try {
    const { calcPortfolioValue, fetchMarketPrices } = await import("../../marketData.js");
    const prices = await fetchMarketPrices(allSymbols);
    const calc = (key: HoldingBucketKey) => calcPortfolioValue(holdings[key] || [], prices);
    const breakdowns = {};
    for (const key of HOLDING_BUCKET_KEYS) {
      const result = calc(key);
      const breakdown = Array.isArray(result?.breakdown) ? result.breakdown : [];
      for (const [index, holding] of (holdings[key] || []).entries()) {
        const sourceId = getManualHoldingSourceId(key, holding);
        const value = Number(breakdown[index]?.value || 0);
        if (sourceId) breakdowns[sourceId] = value;
      }
    }

    setHoldingValues({
      roth: calc("roth").total,
      k401: calc("k401").total,
      brokerage: calc("brokerage").total,
      crypto: calc("crypto").total,
      hsa: calc("hsa").total,
    });
    setHoldingBreakdowns?.(breakdowns);
  } catch (error) {
    setHoldingValues({ ...ZERO_HOLDING_VALUES });
    setHoldingBreakdowns?.({});
    void log.warn("input-form", "Failed to load holding values", { error });
  }
}
