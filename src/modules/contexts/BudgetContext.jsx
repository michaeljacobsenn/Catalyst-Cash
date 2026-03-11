import React, { createContext, useContext, useState, useEffect } from "react";
import { db } from "../utils.js";

const BudgetContext = createContext();

export function BudgetProvider({ children }) {
  const [envelopes, setEnvelopes] = useState({});
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
  const updateMonthlyIncome = async (newAmount) => {
    setMonthlyIncome(newAmount);
    await db.set("budget-income", newAmount);
  };

  // Add or update an envelope classification
  const allocateToEnvelope = async (category, amount) => {
    setEnvelopes((prev) => {
      const updated = { ...prev, [category]: amount };
      db.set("budget-envelopes", updated); // store async
      return updated;
    });
  };

  // Calculate remaining money to allocate
  const getReadyToAssign = () => {
    const totalAssigned = Object.values(envelopes).reduce((sum, val) => sum + val, 0);
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
  return useContext(BudgetContext);
}
