import { describe, expect, it } from "vitest";
import { applyManualMoveCompletion } from "./manualMoveCompletion.js";

describe("applyManualMoveCompletion", () => {
  it("reduces a manual non-card debt and its single manual checking source", () => {
    const result = applyManualMoveCompletion({
      moveText: "Pay $200 toward Student Loan this week.",
      bankAccounts: [{ id: "checking-1", accountType: "checking", bank: "Manual Bank", name: "Checking", balance: 1200 }],
      financialConfig: {
        nonCardDebts: [{ id: "debt-1", name: "Student Loan", balance: 5000, minPayment: 100, apr: 6.5 }],
      },
    });

    expect(result.applied).toBe(true);
    expect(result.updatedFinancialConfig.nonCardDebts[0].balance).toBe(4800);
    expect(result.updatedBankAccounts[0].balance).toBe(1000);
  });

  it("skips live plaid-linked cards and leaves them preview-only", () => {
    const result = applyManualMoveCompletion({
      moveText: "Pay $150 toward Sapphire Preferred.",
      cards: [
        {
          id: "card-1",
          institution: "Chase",
          name: "Sapphire Preferred",
          balance: 900,
          _plaidAccountId: "plaid-card-1",
          _plaidBalance: 900,
        },
      ],
      bankAccounts: [{ id: "checking-1", accountType: "checking", bank: "Manual Bank", name: "Checking", balance: 1200 }],
      financialConfig: {},
    });

    expect(result.applied).toBe(false);
    expect(result.updatedCards[0].balance).toBe(900);
    expect(result.updatedBankAccounts[0].balance).toBe(1200);
  });

  it("increments manual investment balances and contribution YTD where applicable", () => {
    const result = applyManualMoveCompletion({
      moveText: "Contribute $300 to Roth this week.",
      bankAccounts: [{ id: "checking-1", accountType: "checking", bank: "Manual Bank", name: "Checking", balance: 2000 }],
      financialConfig: {
        investmentRoth: 5000,
        rothContributedYTD: 1200,
      },
    });

    expect(result.applied).toBe(true);
    expect(result.updatedFinancialConfig.investmentRoth).toBe(5300);
    expect(result.updatedFinancialConfig.rothContributedYTD).toBe(1500);
    expect(result.updatedBankAccounts[0].balance).toBe(1700);
  });

  it("moves money from manual savings to manual checking for explicit floor-protection transfers", () => {
    const result = applyManualMoveCompletion({
      moveText: "Transfer $250 from savings to checking to protect your floor.",
      bankAccounts: [
        { id: "checking-1", accountType: "checking", bank: "Ally", name: "Checking", balance: 800 },
        { id: "savings-1", accountType: "savings", bank: "Ally", name: "Savings", balance: 2000 },
      ],
      financialConfig: {},
    });

    expect(result.applied).toBe(true);
    expect(result.updatedBankAccounts.find((account) => account.id === "checking-1")?.balance).toBe(1050);
    expect(result.updatedBankAccounts.find((account) => account.id === "savings-1")?.balance).toBe(1750);
  });

  it("uses an explicit funding-source assignment when multiple manual checking accounts exist", () => {
    const result = applyManualMoveCompletion({
      moveText: "Pay $200 toward Student Loan this week.",
      assignment: { sourceAccountId: "checking-2" },
      bankAccounts: [
        { id: "checking-1", accountType: "checking", bank: "Ally", name: "Household Checking", balance: 1200 },
        { id: "checking-2", accountType: "checking", bank: "Chase", name: "Business Checking", balance: 700 },
      ],
      financialConfig: {
        nonCardDebts: [{ id: "debt-1", name: "Student Loan", balance: 5000, minPayment: 100, apr: 6.5 }],
      },
    });

    expect(result.applied).toBe(true);
    expect(result.updatedFinancialConfig.nonCardDebts[0].balance).toBe(4800);
    expect(result.updatedBankAccounts.find((account) => account.id === "checking-1")?.balance).toBe(1200);
    expect(result.updatedBankAccounts.find((account) => account.id === "checking-2")?.balance).toBe(500);
  });

  it("does not mutate balances for preserve-floor reminder phrasing", () => {
    const result = applyManualMoveCompletion({
      moveText: "Keep checking above $900 until next payday.",
      bankAccounts: [{ id: "checking-1", accountType: "checking", bank: "Manual Bank", name: "Checking", balance: 1200 }],
      financialConfig: {},
    });

    expect(result.applied).toBe(false);
    expect(result.updatedBankAccounts[0].balance).toBe(1200);
  });
});
