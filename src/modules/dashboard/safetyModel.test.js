import { describe, expect, it } from "vitest";
import { buildDashboardSafetyModel } from "./safetyModel.js";

describe("buildDashboardSafetyModel", () => {
  it("marks a healthy buffer as stable", () => {
    const snapshot = buildDashboardSafetyModel({
      spendableCash: 3000,
      pendingCharges: 200,
      savingsCash: 1500,
      floor: 700,
      weeklySpendAllowance: 250,
      renewals: [{ name: "Internet", amount: 80, nextDue: "2026-03-20" }],
      cards: [{ type: "credit", balance: 1200, minPayment: 40 }],
      healthScore: 84,
      auditStatus: "GREEN",
      todayStr: "2026-03-13",
    });

    expect(snapshot.level).toBe("stable");
    expect(snapshot.safeToSpend).toBe(1980);
    expect(snapshot.protectedNeed).toBe(1020);
    expect(snapshot.primaryRisk).toBe("pending");
    expect(snapshot.runwayWeeks).toBe(10.7);
  });

  it("marks a tight but covered position as caution", () => {
    const snapshot = buildDashboardSafetyModel({
      spendableCash: 1400,
      pendingCharges: 250,
      floor: 800,
      weeklySpendAllowance: 300,
      renewals: [{ name: "Phone", amount: 75, nextDue: "2026-03-18" }],
      cards: [{ type: "credit", balance: 1800, minPayment: 45 }],
      healthScore: 68,
      auditStatus: "YELLOW",
      todayStr: "2026-03-13",
    });

    expect(snapshot.level).toBe("caution");
    expect(snapshot.safeToSpend).toBe(230);
    expect(snapshot.primaryRisk).toBe("pending");
    expect(snapshot.runwayWeeks).toBe(3.4);
  });

  it("marks uncovered cash needs as urgent", () => {
    const snapshot = buildDashboardSafetyModel({
      spendableCash: 600,
      pendingCharges: 250,
      floor: 700,
      weeklySpendAllowance: 250,
      renewals: [{ name: "Rent", amount: 900, nextDue: "2026-03-15" }],
      cards: [{ type: "credit", balance: 2500 }],
      healthScore: 52,
      auditStatus: "RED",
      todayStr: "2026-03-13",
    });

    expect(snapshot.level).toBe("urgent");
    expect(snapshot.cardMinimums).toBe(25);
    expect(snapshot.protectedNeed).toBe(1875);
    expect(snapshot.safeToSpend).toBe(-1275);
    expect(snapshot.primaryRisk).toBe("floor-gap");
  });
});
