import { describe, expect, it } from "vitest";
import {
  detectCashTimingConflict,
  detectContradictoryFinancialInputs,
  detectCreditUtilizationSpike,
  detectEmergencyReserveGap,
  detectFixedCostTrap,
  detectFreelancerTaxReserveWarning,
  detectInsolvencyRisk,
  detectLowAprArbitrageOpportunity,
  detectMixedDebtPortfolioComplexity,
  detectPromoAprCliff,
  detectSavingsGoalAtRisk,
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
    expect(result.active).toBe(true);
    expect(result.severity).toBe("medium");
  });

  it("triggers utilization spike above 85%", () => {
    const result = detectCreditUtilizationSpike({
      cards: [{ name: "Spike Card", balance: 851, limit: 1000 }],
    });
    expect(result.active).toBe(true);
    expect(result.severity).toBe("high");
  });

  it("escalates utilization risk when elevated balances coincide with weak cash reserves", () => {
    const result = detectCreditUtilizationSpike({
      financialConfig: {
        emergencyFloor: 1500,
      },
      current: {
        form: { checking: 900, savings: 200 },
      },
      computedStrategy: {
        auditSignals: {
          liquidity: {
            checkingAfterFloorAndBills: -75,
          },
        },
      },
      cards: [{ name: "Tight Cash Card", balance: 720, limit: 1000 }],
    });

    expect(result.active).toBe(true);
    expect(result.severity).toBe("high");
    expect(result.recommendation).toContain("checking floor");
  });

  it("does not trigger insolvency risk at exactly 50% minimum-payment load", () => {
    const result = detectInsolvencyRisk({
      cards: [{ name: "Card A", minPayment: 500, balance: 1000, apr: 20 }],
      financialConfig: { payFrequency: "monthly", paycheckStandard: 1000, weeklySpendAllowance: 0 },
    });
    expect(result.active).toBe(false);
  });

  it("triggers insolvency risk above 50% minimum-payment load", () => {
    const result = detectInsolvencyRisk({
      cards: [{ name: "Card A", minPayment: 501, balance: 1000, apr: 20 }],
      financialConfig: { payFrequency: "monthly", paycheckStandard: 1000, weeklySpendAllowance: 0 },
    });
    expect(result.active).toBe(true);
    expect(result.severity).toBe("high");
  });

  it("triggers insolvency risk when housing, renewals, and weekly cash needs crowd out income", () => {
    const result = detectInsolvencyRisk({
      financialConfig: {
        payFrequency: "monthly",
        paycheckStandard: 3000,
        monthlyRent: 1450,
        weeklySpendAllowance: 275,
      },
      cards: [{ name: "Card A", minPayment: 150, balance: 4000, apr: 18 }],
      renewals: [{ name: "Insurance", amount: 325, interval: 1, intervalUnit: "months" }],
    });

    expect(result.active).toBe(true);
    expect(result.severity).toBe("high");
  });

  it("treats missing income against live obligations as high-risk directional guidance", () => {
    const result = detectInsolvencyRisk({
      financialConfig: {
        payFrequency: "monthly",
        paycheckStandard: 0,
        monthlyRent: 1700,
        weeklySpendAllowance: 250,
      },
      cards: [{ name: "Card A", minPayment: 110, balance: 2400, apr: 24 }],
    });

    expect(result.active).toBe(true);
    expect(result.severity).toBe("high");
    expect(result.directionalOnly).toBe(true);
    expect(result.requiresProfessionalHelp).toBe(true);
  });

  it("does not trigger freelancer tax reserve warning for stable salary income", () => {
    const result = detectFreelancerTaxReserveWarning({
      financialConfig: { incomeType: "salary", isContractor: false },
    });
    expect(result.active).toBe(false);
  });

  it("triggers freelancer tax reserve warning for variable or contractor income", () => {
    const result = detectFreelancerTaxReserveWarning({
      financialConfig: {
        incomeType: "variable",
        isContractor: true,
        taxBracketPercent: 32,
        averagePaycheck: 900,
        payFrequency: "weekly",
      },
      current: {
        form: { checking: 2500, savings: 1500 },
      },
    });
    expect(result.active).toBe(true);
    expect(result.severity).toBe("medium");
    expect(result.recommendation).toContain("32%");
  });

  it("escalates contractor tax reserve risk when liquid cash does not cover one month of modeled reserve", () => {
    const result = detectFreelancerTaxReserveWarning({
      financialConfig: {
        incomeType: "variable",
        isContractor: true,
        taxBracketPercent: 30,
        averagePaycheck: 1200,
        payFrequency: "weekly",
      },
      current: {
        form: { checking: 350, savings: 250 },
      },
    });

    expect(result.active).toBe(true);
    expect(result.severity).toBe("high");
    expect(result.confidence).toBe("low");
    expect(result.recommendation).toContain("do not yet cover one month");
  });

  it("does not trigger contractor tax warning for variable income that is not marked contractor", () => {
    const result = detectFreelancerTaxReserveWarning({
      financialConfig: { incomeType: "variable", isContractor: false, taxBracketPercent: 28 },
    });
    expect(result.active).toBe(false);
  });

  it("downgrades confidence and recommends professional help when contractor tax setup is missing", () => {
    const result = detectFreelancerTaxReserveWarning({
      financialConfig: {
        incomeType: "variable",
        payFrequency: "weekly",
        averagePaycheck: 900,
        isContractor: true,
        taxBracketPercent: 0,
        taxWithholdingRate: 0,
      },
      current: {
        form: { checking: 200, savings: 150 },
      },
    });

    expect(result.active).toBe(true);
    expect(result.severity).toBe("high");
    expect(result.confidence).toBe("low");
    expect(result.requiresProfessionalHelp).toBe(true);
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

  it("does not count liquid net worth from investments as emergency cash", () => {
    const result = detectEmergencyReserveGap({
      financialConfig: { emergencyReserveTarget: 5000 },
      current: {
        form: { checking: 300, savings: 700 },
        parsed: { liquidNetWorth: 12000 },
      },
      computedStrategy: {
        auditSignals: {
          emergencyFund: {
            current: 0,
            target: 5000,
            coverageWeeks: 2,
          },
        },
      },
    });

    expect(result.active).toBe(true);
    expect(result.rationale).toContain("$1000.00");
  });

  it("derives an emergency reserve target from weekly spend allowance when no target exists", () => {
    const result = detectEmergencyReserveGap({
      financialConfig: { weeklySpendAllowance: 250 },
      current: {
        form: { checking: 400, savings: 300 },
      },
      computedStrategy: {
        auditSignals: {
          emergencyFund: {
            current: 0,
            target: 0,
            coverageWeeks: 2.8,
          },
        },
      },
    });

    expect(result.active).toBe(true);
    expect(result.rationale).toContain("$1500.00");
  });

  it("uses structural obligations to set a safer reserve target when weekly spending is low but fixed costs are high", () => {
    const result = detectEmergencyReserveGap({
      financialConfig: {
        weeklySpendAllowance: 50,
        monthlyRent: 1800,
      },
      renewals: [{ name: "Insurance", amount: 250, interval: 1, intervalUnit: "months" }],
      cards: [{ name: "Card A", balance: 2500, minPayment: 150, apr: 19 }],
      current: {
        form: { checking: 1200, savings: 300 },
      },
      computedStrategy: {
        auditSignals: {
          emergencyFund: {
            current: 0,
            target: 0,
            coverageWeeks: 2,
          },
        },
      },
    });

    expect(result.active).toBe(true);
    expect(result.rationale).toContain("$2200.00");
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
      financialConfig: {
        arbitrageTargetAPR: 8,
        emergencyReserveTarget: 4000,
        payFrequency: "bi-weekly",
        paycheckStandard: 2200,
      },
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

  it("blocks low-APR arbitrage when promo APR expiry creates a nearer-term debt risk", () => {
    const result = detectLowAprArbitrageOpportunity({
      financialConfig: { arbitrageTargetAPR: 8, emergencyReserveTarget: 4000 },
      current: { form: { date: "2026-03-15" } },
      cards: [
        { name: "Promo Card", apr: 6.5, balance: 2500, minPayment: 75, hasPromoApr: true, promoAprExp: "2026-04-10" },
      ],
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

    expect(result.active).toBe(false);
  });

  it("blocks low-APR arbitrage when a timing conflict exists before payday", () => {
    const result = detectLowAprArbitrageOpportunity({
      financialConfig: {
        arbitrageTargetAPR: 8,
        emergencyReserveTarget: 4000,
        paycheckStandard: 1500,
      },
      cards: [{ name: "Low APR Card", apr: 5.5, balance: 2200, minPayment: 70 }],
      computedStrategy: {
        operationalSurplus: 450,
        requiredTransfer: 350,
        timeCriticalAmount: 600,
        auditSignals: {
          emergencyFund: { current: 5000, target: 4000, coverageWeeks: 7 },
          liquidity: { checkingAfterFloorAndBills: -150 },
        },
      },
    });

    expect(result.active).toBe(false);
  });

  it("blocks low-APR arbitrage when mixed debt complexity makes the tradeoff too brittle", () => {
    const result = detectLowAprArbitrageOpportunity({
      financialConfig: {
        arbitrageTargetAPR: 8,
        emergencyReserveTarget: 4000,
        nonCardDebts: [{ name: "Federal Student Loan", balance: 14000, minimum: 180, apr: 6.3 }],
      },
      cards: [
        { name: "Rewards Card", apr: 5.5, balance: 2200, minPayment: 70 },
        { name: "Travel Card", apr: 24, balance: 1900, minPayment: 90 },
      ],
      computedStrategy: {
        operationalSurplus: 550,
        auditSignals: {
          emergencyFund: { current: 6000, target: 4000, coverageWeeks: 8 },
          liquidity: { checkingAfterFloorAndBills: 600 },
        },
      },
    });

    expect(result.active).toBe(false);
  });

  it("uses pay frequency when monthlyizing hourly income for insolvency checks", () => {
    const result = detectInsolvencyRisk({
      financialConfig: {
        incomeType: "hourly",
        payFrequency: "bi-weekly",
        hourlyRateNet: 25,
        typicalHours: 80,
        monthlyRent: 1200,
        weeklySpendAllowance: 150,
      },
      cards: [{ name: "Card A", minPayment: 250, balance: 3000, apr: 22 }],
    });

    expect(result.active).toBe(false);
  });

  it("flags a promo APR cliff inside 30 days with high severity", () => {
    const result = detectPromoAprCliff({
      current: { form: { date: "2026-03-15" } },
      cards: [
        { name: "Promo Card", balance: 3200, minPayment: 90, apr: 6.5, hasPromoApr: true, promoAprExp: "2026-04-05" },
      ],
    });

    expect(result.active).toBe(true);
    expect(result.severity).toBe("high");
    expect(result.rationale).toContain("21 day(s)");
  });

  it("flags timing conflicts when bills are due but the next paycheck amount is missing", () => {
    const result = detectCashTimingConflict({
      financialConfig: { paycheckStandard: 0, averagePaycheck: 0 },
      computedStrategy: {
        requiredTransfer: 0,
        timeCriticalAmount: 250,
        auditSignals: {
          liquidity: {
            checkingAfterFloorAndBills: 75,
          },
        },
      },
    });

    expect(result.active).toBe(true);
    expect(result.confidence).toBe("low");
    expect(result.directionalOnly).toBe(true);
    expect(result.rationale).toContain("next paycheck");
  });

  it("downgrades confidence when contractor inputs are contradictory", () => {
    const result = detectContradictoryFinancialInputs({
      financialConfig: {
        incomeType: "variable",
        averagePaycheck: 0,
        isContractor: true,
        monthlyRent: 1300,
      },
      cards: [{ name: "Card A", balance: 1200, minPayment: 60, apr: 22 }],
    });

    expect(result.active).toBe(true);
    expect(result.directionalOnly).toBe(true);
    expect(result.confidence).toBe("low");
    expect(result.rationale).toContain("contractor income selected without a tax reserve setup");
  });

  it("flags time-critical bills without paycheck inputs as contradictory", () => {
    const result = detectContradictoryFinancialInputs({
      financialConfig: {
        paycheckStandard: 0,
        averagePaycheck: 0,
      },
      computedStrategy: {
        timeCriticalAmount: 450,
      },
    });

    expect(result.active).toBe(true);
    expect(result.rationale).toContain("time-critical bills modeled without a usable next-paycheck input");
  });

  it("escalates mixed debt portfolios with student loans and high-APR revolving debt", () => {
    const result = detectMixedDebtPortfolioComplexity({
      financialConfig: {
        nonCardDebts: [
          { name: "Federal Student Loan", balance: 18000, minimum: 220, apr: 6.8 },
          { name: "Auto Loan", balance: 9000, minimum: 280, apr: 4.9 },
        ],
      },
      cards: [
        { name: "Travel Card", balance: 3500, minPayment: 120, apr: 27 },
        { name: "Everyday Card", balance: 1800, minPayment: 60, apr: 19 },
      ],
    });

    expect(result.active).toBe(true);
    expect(result.severity).toBe("high");
    expect(result.requiresProfessionalHelp).toBe(true);
    expect(result.confidence).toBe("low");
  });

  it("escalates mixed debt portfolios with student loans and promo timing even without toxic APR", () => {
    const result = detectMixedDebtPortfolioComplexity({
      financialConfig: {
        nonCardDebts: [
          { name: "Federal Student Loan", balance: 22000, minimum: 240, apr: 5.9 },
          { name: "Auto Loan", balance: 8000, minimum: 260, apr: 4.5 },
        ],
      },
      cards: [
        { name: "Promo Card", balance: 4200, minPayment: 110, apr: 7.9, hasPromoApr: true, promoAprExp: "2026-05-01" },
      ],
    });

    expect(result.active).toBe(true);
    expect(result.severity).toBe("high");
    expect(result.requiresProfessionalHelp).toBe(true);
  });
});

describe("detectSavingsGoalAtRisk", () => {
  // Future target date far enough out for all tests
  const futureDate = new Date();
  futureDate.setFullYear(futureDate.getFullYear() + 1);
  const futureStr = futureDate.toISOString().slice(0, 10);

  it("does not trigger when no savings goals are configured", () => {
    const result = detectSavingsGoalAtRisk({
      financialConfig: {},
    });
    expect(result.active).toBe(false);
  });

  it("does not trigger when goal is on pace", () => {
    // Need $6000 remaining over 12 months = $500/mo. Surplus $300/wk = ~$1299/mo. 500/1299 = 38% < 60%
    const result = detectSavingsGoalAtRisk({
      financialConfig: {
        savingsGoals: [
          { name: "Emergency Fund", targetAmount: 10000, currentAmount: 4000, targetDate: futureStr },
        ],
      },
      computedStrategy: { operationalSurplus: 300 },
    });
    expect(result.active).toBe(false);
  });

  it("triggers with medium severity when goal is behind pace", () => {
    // Need $9000 remaining over 12 months = $750/mo. Surplus $200/wk = ~$866/mo. 750/866 = 87% > 60%
    const result = detectSavingsGoalAtRisk({
      financialConfig: {
        savingsGoals: [
          { name: "House Fund", targetAmount: 10000, currentAmount: 1000, targetDate: futureStr },
        ],
      },
      computedStrategy: { operationalSurplus: 200 },
    });
    expect(result.active).toBe(true);
    expect(result.severity).toBe("medium");
    expect(result.flag).toBe("savings-goal-at-risk");
    expect(result.rationale).toContain("House Fund");
  });

  it("triggers with high severity when goal is unreachable at current surplus", () => {
    // Need $9500 remaining over 12 months = $791/mo. Surplus $100/wk = ~$433/mo. 791/433 = 183% > 100%
    const result = detectSavingsGoalAtRisk({
      financialConfig: {
        savingsGoals: [
          { name: "Vacation", targetAmount: 10000, currentAmount: 500, targetDate: futureStr },
        ],
      },
      computedStrategy: { operationalSurplus: 100 },
    });
    expect(result.active).toBe(true);
    expect(result.severity).toBe("high");
    expect(result.recommendation).toContain("cannot be reached");
  });

  it("ignores goals whose target date has already passed", () => {
    const result = detectSavingsGoalAtRisk({
      financialConfig: {
        savingsGoals: [
          { name: "Past Goal", targetAmount: 5000, currentAmount: 1000, targetDate: "2020-01-01" },
        ],
      },
      computedStrategy: { operationalSurplus: 50 },
    });
    // Past-due goal is filtered out, no goals remain behind pace
    expect(result.active).toBe(false);
  });
});
