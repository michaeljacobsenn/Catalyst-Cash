import React, { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import { db } from "../utils.js";

type BudgetEnvelopes = Record<string, number>;

interface BudgetContextValue {
  envelopes: BudgetEnvelopes;
  monthlyIncome: number;
  updateMonthlyIncome: (newAmount: number) => Promise<void>;
  allocateToEnvelope: (category: string, amount: number) => Promise<void>;
  getReadyToAssign: () => number;
}

interface BudgetProviderProps {
  children?: ReactNode;
}

const BudgetContext = createContext<BudgetContextValue | null>(null);

export function BudgetProvider({ children }: BudgetProviderProps) {
  const [envelopes, setEnvelopes] = useState<BudgetEnvelopes>({});
  const [monthlyIncome, setMonthlyIncome] = useState(0);

  // Load saved budget data from IndexedDB on boot
  useEffect(() => {
    (async () => {
      const savedEnvelopes = await db.get("budget-envelopes");
      if (savedEnvelopes) setEnvelopes(savedEnvelopes);

      const savedIncome = await db.get("budget-income");
      if (savedIncome) setMonthlyIncome(savedIncome);
    })();
  }, []);

  // Set absolute monthly income
  const updateMonthlyIncome = async (newAmount: number) => {
    setMonthlyIncome(newAmount);
    await db.set("budget-income", newAmount);
  };

  // Add or update an envelope classification
  const allocateToEnvelope = async (category: string, amount: number) => {
    setEnvelopes((prev) => {
      const updated = { ...prev, [category]: amount };
      db.set("budget-envelopes", updated); // store async
      return updated;
    });
  };

  // Calculate remaining money to allocate
  const getReadyToAssign = () => {
    const totalAssigned = (Object.values(envelopes) as number[]).reduce((sum, val) => sum + val, 0);
    return monthlyIncome - totalAssigned;
  };

  return (
    <BudgetContext.Provider
      value={{
        envelopes,
        monthlyIncome,
        updateMonthlyIncome,
        allocateToEnvelope,
        getReadyToAssign,
      }}
    >
      {children}
    </BudgetContext.Provider>
  );
}

export function useBudget() {
  const context = useContext(BudgetContext);
  if (!context) throw new Error("useBudget must be used within a BudgetProvider");
  return context;
}
