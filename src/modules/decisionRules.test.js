import { describe, expect, it } from "vitest";
import {
  detectCreditUtilizationSpike,
  detectEmergencyReserveGap,
  detectFixedCostTrap,
  detectFreelancerTaxReserveWarning,
  detectInsolvencyRisk,
  detectLowAprArbitrageOpportunity,
  detectSpendingAllowancePressure,
  detectToxicDebtTriage,
} from "./decisionRules.js";

describe("decisionRules", () => {
  it("does not trigger toxic debt triage at exactly 36% APR", () => {
    const result = detectToxicDebtTriage({
      cards: [{ name: "Borderline Card", apr: 36, balance: 1200, minPayment: 50 }],
      financialConfig: {},
    });
    expect(result.active).toBe(false);
  });

  it("triggers toxic debt triage above 36% APR", () => {
    const result = detectToxicDebtTriage({
      cards: [{ name: "Toxic Card", apr: 36.1, balance: 1200, minPayment: 50 }],
      financialConfig: {},
    });
    expect(result.active).toBe(true);
    expect(result.severity).toBe("high");
  });

  it("does not trigger utilization spike at exactly 85%", () => {
    const result = detectCreditUtilizationSpike({
      cards: [{ name: "Borderline Util", balance: 850, limit: 1000 }],
    });
    expect(result.active).toBe(false);
  });

  it("triggers utilization spike above 85%", () => {
    const result = detectCreditUtilizationSpike({
      cards: [{ name: "Spike Card", balance: 851, limit: 1000 }],
    });
    expect(result.active).toBe(true);
    expect(result.severity).toBe("high");
  });

  it("does not trigger insolvency risk at exactly 50% minimum-payment load", () => {
    const result = detectInsolvencyRisk({
      cards: [{ name: "Card A", minPayment: 500, balance: 1000, apr: 20 }],
      financialConfig: { payFrequency: "monthly", paycheckStandard: 1000 },
    });
    expect(result.active).toBe(false);
  });

  it("triggers insolvency risk above 50% minimum-payment load", () => {
    const result = detectInsolvencyRisk({
      cards: [{ name: "Card A", minPayment: 501, balance: 1000, apr: 20 }],
      financialConfig: { payFrequency: "monthly", paycheckStandard: 1000 },
    });
    expect(result.active).toBe(true);
    expect(result.severity).toBe("high");
  });

  it("does not trigger freelancer tax reserve warning for stable salary income", () => {
    const result = detectFreelancerTaxReserveWarning({
      financialConfig: { incomeType: "salary", isContractor: false },
    });
    expect(result.active).toBe(false);
  });

  it("triggers freelancer tax reserve warning for variable or contractor income", () => {
    const result = detectFreelancerTaxReserveWarning({
      financialConfig: { incomeType: "variable", isContractor: true },
    });
    expect(result.active).toBe(true);
    expect(result.severity).toBe("medium");
  });

  it("does not trigger spending allowance pressure when spending is under plan", () => {
    const result = detectSpendingAllowancePressure({
      current: {
        parsed: {
          spendingAnalysis: {
            vsAllowance: "Under by $42",
            alerts: [],
          },
        },
      },
    });
    expect(result.active).toBe(false);
  });

  it("triggers spending allowance pressure when allowance is exceeded", () => {
    const result = detectSpendingAllowancePressure({
      current: {
        parsed: {
          spendingAnalysis: {
            vsAllowance: "Over by $125",
            alerts: ["Overspending in dining"],
          },
        },
      },
    });
    expect(result.active).toBe(true);
    expect(result.severity).toBe("high");
  });

  it("does not trigger emergency reserve gap when reserve target is funded", () => {
    const result = detectEmergencyReserveGap({
      financialConfig: { emergencyReserveTarget: 5000 },
      computedStrategy: {
        auditSignals: {
          emergencyFund: {
            current: 5000,
            target: 5000,
            coverageWeeks: 8,
          },
        },
      },
    });
    expect(result.active).toBe(false);
  });

  it("triggers emergency reserve gap when coverage is thin", () => {
    const result = detectEmergencyReserveGap({
      financialConfig: { emergencyReserveTarget: 5000 },
      computedStrategy: {
        auditSignals: {
          emergencyFund: {
            current: 1800,
            target: 5000,
            coverageWeeks: 3,
          },
        },
      },
    });
    expect(result.active).toBe(true);
    expect(result.severity).toBe("high");
  });

  it("does not trigger fixed-cost trap at exactly 60% of income", () => {
    const result = detectFixedCostTrap({
      financialConfig: {
        payFrequency: "monthly",
        paycheckStandard: 3000,
        monthlyRent: 1200,
      },
      cards: [{ name: "Card A", minPayment: 300, balance: 2000, apr: 20 }],
      renewals: [{ name: "Netflix", amount: 300, interval: 1, intervalUnit: "months" }],
    });
    expect(result.active).toBe(false);
  });

  it("triggers fixed-cost trap above 60% of income", () => {
    const result = detectFixedCostTrap({
      financialConfig: {
        payFrequency: "monthly",
        paycheckStandard: 3000,
        monthlyRent: 1500,
      },
      cards: [{ name: "Card A", minPayment: 350, balance: 2000, apr: 20 }],
      renewals: [{ name: "Netflix", amount: 100, interval: 1, intervalUnit: "months" }],
    });
    expect(result.active).toBe(true);
    expect(result.severity).toBe("medium");
  });

  it("does not trigger low-APR arbitrage when reserves are not ready", () => {
    const result = detectLowAprArbitrageOpportunity({
      financialConfig: { arbitrageTargetAPR: 8, emergencyReserveTarget: 4000 },
      cards: [{ name: "Low APR Card", apr: 6, balance: 2500, minPayment: 75 }],
      computedStrategy: {
        operationalSurplus: 400,
        auditSignals: {
          emergencyFund: {
            current: 1500,
            target: 4000,
          },
        },
      },
    });
    expect(result.active).toBe(false);
  });

  it("triggers low-APR arbitrage when low-rate debt coexists with strong liquidity", () => {
    const result = detectLowAprArbitrageOpportunity({
      financialConfig: { arbitrageTargetAPR: 8, emergencyReserveTarget: 4000 },
      cards: [{ name: "Low APR Card", apr: 5.9, balance: 2500, minPayment: 75 }],
      computedStrategy: {
        operationalSurplus: 400,
        auditSignals: {
          emergencyFund: {
            current: 5000,
            target: 4000,
          },
        },
      },
    });
    expect(result.active).toBe(true);
    expect(result.severity).toBe("medium");
  });
});
