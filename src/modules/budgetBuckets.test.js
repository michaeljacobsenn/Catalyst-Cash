import { describe, expect, it } from "vitest";

import { normalizeBudgetLines } from "./budgetBuckets.js";

describe("budget bucket normalization", () => {
  it("keeps canonical buckets untouched", () => {
    const result = normalizeBudgetLines([
      { id: "line_1", name: "Rent", amount: 900, bucket: "bills", icon: "🏠" },
    ]);

    expect(result.changed).toBe(false);
    expect(result.lines).toEqual([
      { id: "line_1", name: "Rent", amount: 900, bucket: "bills", icon: "🏠" },
    ]);
  });

  it("maps legacy buckets into the new taxonomy and flags old flex lines for review", () => {
    const result = normalizeBudgetLines([
      { id: "line_fixed", name: "Rent", amount: 900, bucket: "fixed", icon: "🏠" },
      { id: "line_flex", name: "Dining", amount: 120, bucket: "flex", icon: "🍔" },
      { id: "line_invest", name: "Roth IRA", amount: 250, bucket: "invest", icon: "📈" },
    ]);

    expect(result.changed).toBe(true);
    expect(result.lines).toEqual([
      { id: "line_fixed", name: "Rent", amount: 900, bucket: "bills", icon: "🏠" },
      { id: "line_flex", name: "Dining", amount: 120, bucket: "needs", icon: "🍔", needsReview: true },
      { id: "line_invest", name: "Roth IRA", amount: 250, bucket: "savings", icon: "📈" },
    ]);
  });
});
