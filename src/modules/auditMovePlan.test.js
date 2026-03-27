import { describe, expect, it } from "vitest";
import { buildAuditMovePlan } from "./auditMovePlan.js";

describe("audit move planning", () => {
  it("projects an incomplete card payoff onto the card and the single checking account", () => {
    const audit = {
      isTest: false,
      form: {
        checking: 2000,
        debts: [
          {
            cardId: "amex-gold",
            name: "Amex Gold",
            balance: 1704.4,
          },
        ],
      },
      moveChecks: { 0: true },
      parsed: {
        moveItems: [{ text: "Pay $300 to Amex Gold this week." }],
      },
    };

    const plan = buildAuditMovePlan({
      audit,
      cards: [
        {
          id: "amex-gold",
          institution: "American Express",
          name: "Gold",
          _plaidBalance: 1604.4,
        },
      ],
      bankAccounts: [
        {
          id: "checking-1",
          bank: "Ally",
          accountType: "checking",
          name: "Primary Checking",
          _plaidBalance: 2000,
        },
      ],
    });

    expect(plan.cardTargets["amex-gold"].projectedBalance).toBeCloseTo(1404.4, 2);
    expect(plan.cardTargets["amex-gold"].remainingAmount).toBeCloseTo(200, 2);
    expect(plan.bankTargets["checking-1"].projectedBalance).toBeCloseTo(1800, 2);
    expect(plan.impliedCheckingDelta).toBeCloseTo(-200, 2);
  });

  it("clears a savings transfer once the total savings balance already increased enough", () => {
    const audit = {
      isTest: false,
      form: {
        ally: 1000,
      },
      moveChecks: { 0: true },
      parsed: {
        moveItems: [{ text: "Move $250 to savings after payday." }],
      },
    };

    const plan = buildAuditMovePlan({
      audit,
      cards: [],
      bankAccounts: [
        {
          id: "savings-1",
          bank: "Ally",
          accountType: "savings",
          name: "Emergency Savings",
          _plaidBalance: 1300,
        },
        {
          id: "checking-1",
          bank: "Ally",
          accountType: "checking",
          name: "Checking",
          _plaidBalance: 900,
        },
      ],
    });

    expect(plan.activeCount).toBe(0);
    expect(plan.reconciledCount).toBe(1);
    expect(Object.keys(plan.bankTargets)).toHaveLength(0);
  });

  it("falls back to a generic checking summary when multiple checking accounts make the source ambiguous", () => {
    const audit = {
      isTest: false,
      form: {
        debts: [{ cardId: "visa-1", name: "Chase Freedom", balance: 900 }],
      },
      moveChecks: { 0: true },
      parsed: {
        moveItems: [{ text: "Pay $150 to Chase Freedom." }],
      },
    };

    const plan = buildAuditMovePlan({
      audit,
      cards: [
        {
          id: "visa-1",
          institution: "Chase",
          name: "Freedom",
          _plaidBalance: 900,
        },
      ],
      bankAccounts: [
        { id: "checking-1", bank: "Ally", accountType: "checking", name: "Household Checking", _plaidBalance: 1200 },
        { id: "checking-2", bank: "Chase", accountType: "checking", name: "Business Checking", _plaidBalance: 500 },
      ],
    });

    expect(plan.cardTargets["visa-1"].projectedBalance).toBe(750);
    expect(plan.bankTargets["checking-1"]).toBeUndefined();
    expect(plan.genericSummaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Checking", delta: -150 }),
      ]),
    );
  });

  it("uses saved move assignments to preview the chosen funding source instead of a generic checking deduction", () => {
    const audit = {
      isTest: false,
      form: {
        debts: [{ cardId: "visa-1", name: "Chase Freedom", balance: 900 }],
      },
      moveChecks: { 0: true },
      moveAssignments: { 0: { sourceAccountId: "checking-2" } },
      parsed: {
        moveItems: [{ text: "Pay $150 to Chase Freedom." }],
      },
    };

    const plan = buildAuditMovePlan({
      audit,
      cards: [
        {
          id: "visa-1",
          institution: "Chase",
          name: "Freedom",
          _plaidBalance: 900,
        },
      ],
      bankAccounts: [
        { id: "checking-1", bank: "Ally", accountType: "checking", name: "Household Checking", _plaidBalance: 1200 },
        { id: "checking-2", bank: "Chase", accountType: "checking", name: "Business Checking", _plaidBalance: 500 },
      ],
    });

    expect(plan.genericSummaries).toEqual([]);
    expect(plan.bankTargets["checking-2"].projectedBalance).toBe(350);
  });

  it("shows a transfer from savings to checking as checking up and savings down", () => {
    const audit = {
      isTest: false,
      form: {
        checking: 800,
        ally: 2000,
      },
      moveChecks: { 0: true },
      parsed: {
        moveItems: [{ text: "Transfer $250 from savings to checking to protect your floor." }],
      },
    };

    const plan = buildAuditMovePlan({
      audit,
      cards: [],
      bankAccounts: [
        { id: "checking-1", bank: "Ally", accountType: "checking", name: "Checking", _plaidBalance: 800 },
        { id: "savings-1", bank: "Ally", accountType: "savings", name: "Savings", _plaidBalance: 2000 },
      ],
    });

    expect(plan.bankTargets["checking-1"].projectedBalance).toBe(1050);
    expect(plan.bankTargets["savings-1"].projectedBalance).toBe(1750);
  });

  it("ignores preserve-floor reminder phrasing as non-transactional", () => {
    const audit = {
      isTest: false,
      form: {
        checking: 1200,
      },
      moveChecks: { 0: true },
      parsed: {
        moveItems: [{ text: "Keep checking above $900 until next payday." }],
      },
    };

    const plan = buildAuditMovePlan({
      audit,
      cards: [],
      bankAccounts: [
        { id: "checking-1", bank: "Ally", accountType: "checking", name: "Checking", _plaidBalance: 1200 },
      ],
    });

    expect(plan.activeCount).toBe(1);
    expect(plan.matchedCount).toBe(0);
    expect(plan.unresolvedMoves).toEqual(["Keep checking above $900 until next payday."]);
  });

  it("tracks manual non-card debt payoff progress from current financial config", () => {
    const audit = {
      isTest: false,
      form: {
        debts: [{ name: "Student Loan", balance: 5000 }],
      },
      moveChecks: { 0: true },
      parsed: {
        moveItems: [{ text: "Pay $200 toward Student Loan this week." }],
      },
    };

    const plan = buildAuditMovePlan({
      audit,
      cards: [],
      bankAccounts: [],
      financialConfig: {
        nonCardDebts: [{ id: "debt-1", name: "Student Loan", balance: 4900 }],
      },
    });

    expect(plan.debtTargets["0"].projectedBalance).toBe(4800);
    expect(plan.unresolvedMoves).toEqual([]);
  });

  it("tracks manual investment contribution progress from current financial config", () => {
    const audit = {
      isTest: false,
      form: {
        investmentRoth: 5000,
      },
      moveChecks: { 0: true },
      parsed: {
        moveItems: [{ text: "Contribute $300 to Roth this week." }],
      },
    };

    const plan = buildAuditMovePlan({
      audit,
      cards: [],
      bankAccounts: [],
      financialConfig: {
        investmentRoth: 5200,
        rothContributedYTD: 1400,
      },
    });

    expect(plan.investmentTargets.investmentRoth.projectedBalance).toBe(5300);
    expect(plan.unresolvedMoves).toEqual([]);
  });
});
