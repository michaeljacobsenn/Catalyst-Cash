import { describe, expect, it, vi } from "vitest";

import {
  buildCardSelectGroups,
  createInitialInputFormState,
  hasReusableAuditSeed,
  mergeLastAuditIntoForm,
  mergePlaidAutoFillIntoForm,
} from "./state";

vi.mock("../../plaid.js", () => ({
  getPlaidAutoFill: vi.fn(() => ({
    checking: 1500,
    vault: 2200,
    debts: [{ cardId: "card-1", name: "Visa", balance: 400 }],
  })),
  getStoredTransactions: vi.fn(() => null),
}));

describe("input form state helpers", () => {
  it("creates initial state from plaid and config", () => {
    const state = createInitialInputFormState({
      today: new Date("2026-03-16T10:30:00Z"),
      plaidData: { checking: 1000, vault: 500, debts: [{ cardId: "1", name: "Card", balance: 25 }] },
      config: { investmentRoth: 3000, investmentBrokerage: 2000, k401Balance: 10000 },
    });

    expect(state.checking).toBe(1000);
    expect(state.savings).toBe(500);
    expect(state.roth).toBe(3000);
    expect(state.k401Balance).toBe(10000);
    expect(state.debts).toHaveLength(1);
  });

  it("mergePlaidAutoFillIntoForm respects manual overrides", () => {
    const result = mergePlaidAutoFillIntoForm(
      {
        checking: 900,
        savings: 700,
        debts: [{ cardId: "card-1", name: "Visa", balance: 450 }],
      },
      {
        checking: 1200,
        vault: 800,
        debts: [{ cardId: "card-1", name: "Visa", balance: 300 }],
      },
      { checking: true, vault: false, debts: { "card-1": true } }
    );

    expect(result.checking).toBe(900);
    expect(result.savings).toBe(800);
    expect(result.debts[0].balance).toBe(450);
  });

  it("mergeLastAuditIntoForm prefers fresh plaid balances over last audit values", () => {
    const result = mergeLastAuditIntoForm({
      previousForm: {
        roth: "",
        brokerage: "",
        k401Balance: "",
      },
      lastAudit: {
        isTest: false,
        form: {
          checking: "100",
          savings: "200",
          debts: [{ name: "Visa", balance: "700" }],
        },
      },
      cards: [{ id: "card-1", name: "Visa" }],
      bankAccounts: [],
      today: new Date("2026-03-16T10:30:00Z"),
    });

    expect(result.checking).toBe(1500);
    expect(result.savings).toBe(2200);
    expect(result.debts[0].cardId).toBe("card-1");
    expect(result.debts[0].balance).toBe(400);
  });

  it("treats imported audits with date-only form snapshots as non-reusable seed data", () => {
    expect(
      hasReusableAuditSeed({
        isTest: false,
        form: {
          date: "2026-03-16",
        },
      })
    ).toBe(false);
  });

  it("buildCardSelectGroups keeps institution grouping stable", () => {
    const groups = buildCardSelectGroups(
      [
        { id: "1", institution: "Chase", name: "Freedom Unlimited" },
        { id: "2", institution: "Amex", name: "Gold" },
      ],
      (_cards: unknown[], card: { name: string }) => card.name
    );

    expect(groups).toEqual([
      { label: "Chase", options: [{ value: "1", label: "Freedom Unlimited" }] },
      { label: "Amex", options: [{ value: "2", label: "Gold" }] },
    ]);
  });
});
