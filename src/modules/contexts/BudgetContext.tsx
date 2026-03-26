  import type { ReactNode } from "react";
  import { createContext, useCallback, useContext, useEffect, useState } from "react";
  import { useSettings } from "./SettingsContext.js";
  import { computeBudgetStatus, computeCycleIncome, suggestLinesFromAudit } from "../budgetEngine.js";
  import { db } from "../utils.js";

export interface BudgetLine {
  id: string;
  name: string;
  amount: number;
  bucket: "fixed" | "flex" | "invest";
  icon: string;
  isAuto?: boolean;
}

interface BudgetContextValue {
  lines: BudgetLine[];
  cycleIncome: number;
  addLine: (line: Omit<BudgetLine, "id">) => Promise<void>;
  updateLine: (id: string, patch: Partial<BudgetLine>) => Promise<void>;
  deleteLine: (id: string) => Promise<void>;
  suggestFromAudit: (auditCategories: Record<string, { total?: number }>) => Promise<void>;
  totalFixed: number;
  totalFlex: number;
  totalInvest: number;
  totalAssigned: number;
  readyToAssign: number;
  isBudgetReady: boolean;
}

interface BudgetProviderProps { children?: ReactNode; }

const BudgetContext = createContext<BudgetContextValue | null>(null);
const DB_KEY = "budget-lines-v2";

export function BudgetProvider({ children }: BudgetProviderProps) {
  const { financialConfig } = useSettings();
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [isBudgetReady, setIsBudgetReady] = useState(false);

  const cycleIncome = computeCycleIncome(financialConfig) as number;
  const status = computeBudgetStatus(lines, cycleIncome) as {
    totalFixed: number; totalFlex: number; totalInvest: number;
    totalAssigned: number; readyToAssign: number;
  };

  // Boot: load persisted lines
  useEffect(() => {
    (async () => {
      const saved = (await db.get(DB_KEY)) as BudgetLine[] | null;
      if (Array.isArray(saved)) setLines(saved);
      setIsBudgetReady(true);
    })();
  }, []);

  const persist = useCallback(async (next: BudgetLine[]) => {
    setLines(next);
    await db.set(DB_KEY, next);
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

  /**
   * Auto-suggest budget lines from audit categories.
   * Only adds lines that don't already have a matching name.
   */
  const suggestFromAudit = useCallback(async (auditCategories: Record<string, { total?: number }>) => {
    const suggestions = suggestLinesFromAudit(auditCategories, financialConfig.payFrequency) as BudgetLine[];
    const existingNames = new Set(lines.map(l => l.name.toLowerCase()));
    const newLines = suggestions.filter(s => !existingNames.has(s.name.toLowerCase()));
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
