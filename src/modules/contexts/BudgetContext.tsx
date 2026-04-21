import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Renewal } from "../../types/index.js";
import { useSettings } from "./SettingsContext.js";
import { computeBudgetStatus, computeCycleIncome, suggestLinesFromAudit, suggestLinesFromRenewals } from "../budgetEngine.js";
import { normalizeBudgetLines } from "../budgetBuckets.js";
import { db } from "../utils.js";

type BudgetBucket = "bills" | "needs" | "wants" | "savings";

export interface BudgetLine {
  id: string;
  name: string;
  amount: number;
  bucket: BudgetBucket;
  icon: string;
  isAuto?: boolean;
  needsReview?: boolean;
}

interface BudgetContextValue {
  lines: BudgetLine[];
  cycleIncome: number;
  addLine: (line: Omit<BudgetLine, "id">) => Promise<void>;
  updateLine: (id: string, patch: Partial<BudgetLine>) => Promise<void>;
  deleteLine: (id: string) => Promise<void>;
  suggestFromAudit: (auditCategories: Record<string, { total?: number }> | null, options?: { renewals?: Renewal[] }) => Promise<void>;
  totalBills: number;
  totalNeeds: number;
  totalWants: number;
  totalSavings: number;
  totalAssigned: number;
  readyToAssign: number;
  isBudgetReady: boolean;
}

interface BudgetProviderProps { children?: ReactNode; }

const BudgetContext = createContext<BudgetContextValue | null>(null);
const DB_KEY = "budget-lines-v2";

function normalizeLineNameKey(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function BudgetProvider({ children }: BudgetProviderProps) {
  const { financialConfig } = useSettings();
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [isBudgetReady, setIsBudgetReady] = useState(false);

  const cycleIncome = computeCycleIncome(financialConfig) as number;
  const status = computeBudgetStatus(lines, cycleIncome) as {
    totalBills: number; totalNeeds: number; totalWants: number; totalSavings: number;
    totalAssigned: number; readyToAssign: number;
  };

  useEffect(() => {
    (async () => {
      try {
        const saved = (await db.get(DB_KEY)) as BudgetLine[] | null;
        const normalized = normalizeBudgetLines(saved);
        setLines(normalized.lines as BudgetLine[]);
        if (normalized.changed) {
          await db.set(DB_KEY, normalized.lines);
        }
      } finally {
        setIsBudgetReady(true);
      }
    })();
  }, []);

  const persist = useCallback(async (next: BudgetLine[]) => {
    const normalized = normalizeBudgetLines(next);
    setLines(normalized.lines as BudgetLine[]);
    await db.set(DB_KEY, normalized.lines);
  }, []);

  const addLine = useCallback(async (line: Omit<BudgetLine, "id">) => {
    const next = [...lines, { ...line, id: `line-${Date.now()}-${Math.random().toString(36).slice(2)}` }];
    await persist(next);
  }, [lines, persist]);

  const updateLine = useCallback(async (id: string, patch: Partial<BudgetLine>) => {
    const next = lines.map(l => l.id === id ? { ...l, ...patch } : l);
    await persist(next);
  }, [lines, persist]);

  const deleteLine = useCallback(async (id: string) => {
    await persist(lines.filter(l => l.id !== id));
  }, [lines, persist]);

  const suggestFromAudit = useCallback(async (auditCategories: Record<string, { total?: number }> | null, options?: { renewals?: Renewal[] }) => {
    const existingNames = new Set(lines.map(line => normalizeLineNameKey(line.name)));
    const mergedSuggestions = [
      ...(suggestLinesFromRenewals(options?.renewals || [], financialConfig.payFrequency) as BudgetLine[]),
      ...(suggestLinesFromAudit(auditCategories || {}, financialConfig.payFrequency) as BudgetLine[]),
    ];
    const nextNames = new Set(existingNames);
    const newLines = mergedSuggestions.filter((line) => {
      const nameKey = normalizeLineNameKey(line.name);
      if (!nameKey || nextNames.has(nameKey)) return false;
      nextNames.add(nameKey);
      return true;
    });
    if (newLines.length > 0) await persist([...lines, ...newLines]);
  }, [lines, persist, financialConfig.payFrequency]);

  return (
    <BudgetContext.Provider value={{
      lines,
      cycleIncome,
      addLine, updateLine, deleteLine, suggestFromAudit,
      ...status,
      isBudgetReady,
    }}>
      {children}
    </BudgetContext.Provider>
  );
}

export function useBudget(): BudgetContextValue {
  const ctx = useContext(BudgetContext);
  if (!ctx) throw new Error("useBudget must be used within a BudgetProvider");
  return ctx;
}
