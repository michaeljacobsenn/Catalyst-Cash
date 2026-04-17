import { describe, it, expect } from "vitest";
import { buildSnapshotMessage } from "./buildSnapshotMessage.js";

const baseParams = () => ({
  form: {
    date: "2026-03-05",
    time: "10:00",
    checking: "2500",
    savings: "1000",
    debts: [{ cardId: null, name: "Chase Sapphire", balance: "450" }],
    pendingCharges: [{ amount: "75.00", description: "Groceries", confirmed: true }],
    notes: "Paid rent already",
    autoPaycheckAdd: false,
    paycheckAddOverride: "",
    habitCount: 3,
    roth: "15000",
    brokerage: "",
    k401Balance: "",
  },
  activeConfig: {
    payFrequency: "bi-weekly",
    trackChecking: true,
    trackSavings: true,
    trackHabits: true,
    habitName: "Gym",
  },
  cards: [{ id: "c1", name: "Sapphire Preferred", institution: "Chase", limit: 10000 }],
  renewals: [
    { name: "Netflix", amount: 15.99, category: "subs", interval: 1, intervalUnit: "month", nextDue: "2026-03-15" },
  ],
  cardAnnualFees: [],
  parsedTransactions: [],
  budgetActuals: {},
  holdingValues: { roth: 0, k401: 0, brokerage: 0, crypto: 0, hsa: 0 },
  financialConfig: {},
  aiProvider: "gemini",
});

describe("buildSnapshotMessage", () => {
  it("returns a non-empty string", () => {
    const msg = buildSnapshotMessage(baseParams());
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(100);
  });

  it("produces Gemini-specific header", () => {
    const msg = buildSnapshotMessage(baseParams());
    expect(msg).toContain("INPUT SNAPSHOT (GEMINI)");
  });

  it("produces OpenAI-specific header", () => {
    const params = baseParams();
    params.aiProvider = "openai";
    const msg = buildSnapshotMessage(params);
    expect(msg).toContain("WEEKLY SNAPSHOT (CHATGPT)");
    expect(msg).toContain("### Balances");
  });

  it("produces Claude-specific header", () => {
    const params = baseParams();
    params.aiProvider = "claude";
    const msg = buildSnapshotMessage(params);
    expect(msg).toContain("WEEKLY SNAPSHOT (CLAUDE)");
  });

  it("includes checking and savings balances", () => {
    const msg = buildSnapshotMessage(baseParams());
    expect(msg).toContain("Checking:");
    expect(msg).toContain("Savings: $1000");
  });

  it("includes debts section", () => {
    const msg = buildSnapshotMessage(baseParams());
    expect(msg).toContain("Snapshot Debt Overrides:");
    expect(msg).toContain("$450");
  });

  it("includes pending charges", () => {
    const msg = buildSnapshotMessage(baseParams());
    expect(msg).toContain("Pending Charges:");
    expect(msg).toContain("$75.00");
    expect(msg).toContain("Groceries");
  });

  it("includes the mapped obligations horizon instead of the legacy renewals block", () => {
    const msg = buildSnapshotMessage(baseParams());
    expect(msg).not.toContain("Renewals/Subscriptions");
    expect(msg).toContain("Tracked Obligations (Next 12 Months)");
    expect(msg).toContain("Netflix");
  });

  it("includes user notes", () => {
    const msg = buildSnapshotMessage(baseParams());
    expect(msg).toContain("Paid rent already");
  });

  it("includes habit count when tracked", () => {
    const msg = buildSnapshotMessage(baseParams());
    expect(msg).toContain("Gym Count: 3");
  });

  it("omits duplicated card portfolio data because cards are sent structurally", () => {
    const msg = buildSnapshotMessage(baseParams());
    expect(msg).not.toContain("Card Portfolio");
    expect(msg).not.toContain("Sapphire Preferred");
  });

  it('shows "none" when no debts are provided', () => {
    const params = baseParams();
    params.form.debts = [];
    const msg = buildSnapshotMessage(params);
    expect(msg).toContain("Snapshot Debt Overrides:\n  none");
  });

  it('shows "none" when no cards are provided', () => {
    const params = baseParams();
    params.cards = [];
    const msg = buildSnapshotMessage(params);
    expect(msg).toContain("none");
  });

  it("includes timezone label", () => {
    const msg = buildSnapshotMessage(baseParams());
    expect(msg).toMatch(/Timezone: UTC[+-]\d{2}:\d{2}/);
  });

  it("includes pay frequency", () => {
    const msg = buildSnapshotMessage(baseParams());
    expect(msg).toContain("Pay Frequency: bi-weekly");
  });

  it("includes budget actuals when categories exist", () => {
    const params = baseParams();
    params.activeConfig.budgetCategories = [{ name: "Food", monthlyTarget: 400 }];
    params.budgetActuals = { Food: 85.5 };
    const msg = buildSnapshotMessage(params);
    expect(msg).toContain("Budget Actuals");
    expect(msg).toContain("Food: $85.50");
  });

  it("omits non-card debts because they live in structured context", () => {
    const params = baseParams();
    params.activeConfig.nonCardDebts = [{ name: "Student Loan", type: "loan", balance: 25000, minimum: 250, apr: 5.5 }];
    const msg = buildSnapshotMessage(params);
    expect(msg).not.toContain("Non-Card Debts");
    expect(msg).not.toContain("Student Loan");
  });

  it("omits credit score because it is sent structurally", () => {
    const params = baseParams();
    params.activeConfig.creditScore = 750;
    params.activeConfig.creditScoreDate = "2026-02-15";
    const msg = buildSnapshotMessage(params);
    expect(msg).not.toContain("Credit Score: 750");
  });

  it("omits savings goals because they are sent structurally", () => {
    const params = baseParams();
    params.activeConfig.savingsGoals = [{ name: "Emergency Fund", currentAmount: 3000, targetAmount: 10000 }];
    const msg = buildSnapshotMessage(params);
    expect(msg).not.toContain("Savings Goals");
    expect(msg).not.toContain("Emergency Fund");
  });

  it("uses live holding values when enabled and not overridden", () => {
    const params = baseParams();
    params.activeConfig.enableHoldings = true;
    params.activeConfig.holdings = { roth: ["VTI"] };
    params.activeConfig.overrideRothValue = false;
    params.holdingValues.roth = 18500.75;
    params.form.roth = "15000";
    const msg = buildSnapshotMessage(params);
    expect(msg).toContain("18500.75");
    expect(msg).toContain("(live)");
  });

  it("respects excluded investment sources when deriving live bucket balances", () => {
    const params = baseParams();
    params.activeConfig.trackBrokerage = true;
    params.activeConfig.enableHoldings = true;
    params.activeConfig.overrideBrokerageValue = false;
    params.activeConfig.excludedInvestmentSourceIds = ["manual-holdings:brokerage"];
    params.activeConfig.plaidInvestments = [
      { id: "pi_1", bucket: "brokerage", institution: "Fidelity", name: "Taxable Brokerage", _plaidBalance: 9600 },
    ];
    params.holdingValues.brokerage = 4200;
    const msg = buildSnapshotMessage(params);
    expect(msg).toContain("Brokerage: $9600.00 (live)");
    expect(msg).not.toContain("Brokerage: $4200.00");
  });

  it("respects individually excluded manual holdings when last known prices are available", () => {
    const params = baseParams();
    params.activeConfig.trackRothContributions = true;
    params.activeConfig.enableHoldings = true;
    params.activeConfig.overrideRothValue = false;
    params.activeConfig.holdings = {
      roth: [
        { id: "holding_vti", symbol: "VTI", shares: "10", lastKnownPrice: 100 },
        { id: "holding_vxus", symbol: "VXUS", shares: "5", lastKnownPrice: 50 },
      ],
    };
    params.activeConfig.excludedInvestmentSourceIds = ["manual-holding:roth:holding_vxus"];
    params.holdingValues.roth = 1250;
    const msg = buildSnapshotMessage(params);
    expect(msg).toContain("Roth IRA: $1000.00 (live)");
    expect(msg).not.toContain("Roth IRA: $1250.00");
  });
});
