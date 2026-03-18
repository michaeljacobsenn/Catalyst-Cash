import { describe, expect, it } from "vitest";
import { deriveEmptyDashboardSetupState } from "./emptyDashboardModel";

describe("deriveEmptyDashboardSetupState", () => {
  it("treats banks and plaid investments as connected accounts, not just cards", () => {
    const state = deriveEmptyDashboardSetupState({
      cards: [],
      bankAccounts: [{ id: "bank_1" }],
      plaidInvestments: [{ id: "inv_1" }],
      renewals: [],
      financialConfig: {},
    });

    expect(state.hasConnectedAccounts).toBe(true);
    expect(state.connectedAccountCount).toBe(2);
    expect(state.completedSteps).toBe(1);
  });

  it("counts connected inputs separately from accounts by including renewals", () => {
    const state = deriveEmptyDashboardSetupState({
      cards: [{ id: "card_1" }],
      bankAccounts: [{ id: "bank_1" }],
      renewals: [{ id: "ren_1" }, { id: "ren_2" }],
      financialConfig: { weeklySpendAllowance: 300 },
    });

    expect(state.hasProfile).toBe(true);
    expect(state.connectedAccountCount).toBe(2);
    expect(state.connectedInputCount).toBe(4);
    expect(state.completedSteps).toBe(3);
    expect(state.progressPct).toBe(100);
  });
});
