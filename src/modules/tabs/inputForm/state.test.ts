import { describe, expect, it, vi } from "vitest";

const stateMocks = vi.hoisted(() => ({
  calcPortfolioValue: vi.fn(),
  checkAuditQuota: vi.fn(async () => null),
  fetchMarketPrices: vi.fn(),
  getPlaidAutoFill: vi.fn(() => ({
    checking: 1500,
    vault: 2200,
    debts: [{ cardId: "card-1", name: "Visa", balance: 400 }],
  })),
  getHydratedStoredTransactions: vi.fn(),
}));

vi.mock("../../marketData.js", () => ({
  calcPortfolioValue: stateMocks.calcPortfolioValue,
  fetchMarketPrices: stateMocks.fetchMarketPrices,
}));

vi.mock("../../storedTransactions.js", () => ({
  getHydratedStoredTransactions: stateMocks.getHydratedStoredTransactions,
}));

vi.mock("../../subscription.js", () => ({
  checkAuditQuota: stateMocks.checkAuditQuota,
}));

import {
  buildAddableDebtCards,
  buildCardSelectGroups,
  createInitialInputFormState,
  hasReusableAuditSeed,
  mergeLastAuditIntoForm,
  mergePlaidAutoFillIntoForm,
} from "./state";
import { loadHoldingValues, loadRecentPlaidTransactions } from "./asyncData";

vi.mock("../../plaid/autoFill.js", () => ({
  getPlaidAutoFill: stateMocks.getPlaidAutoFill,
}));

describe("input form state helpers", () => {
  it("loads recent plaid transactions from the last 7 days only", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-16T12:00:00Z"));
    stateMocks.getHydratedStoredTransactions.mockResolvedValueOnce({
      fetchedAt: "2026-04-16T10:00:00.000Z",
      data: [
        { id: "fresh-debit", date: "2026-04-15", pending: false, isCredit: false, amount: 48.21, description: "Groceries" },
        { id: "old-debit", date: "2026-04-01", pending: false, isCredit: false },
        { id: "pending", date: "2026-04-15", pending: true, isCredit: false },
        { id: "credit", date: "2026-04-15", pending: false, isCredit: true },
      ],
    });
    const setPlaidTransactions = vi.fn();
    const setTxnFetchedAt = vi.fn();

    await loadRecentPlaidTransactions(setPlaidTransactions, setTxnFetchedAt);

    expect(setPlaidTransactions).toHaveBeenCalledWith([
      {
        id: "fresh-debit",
        date: "2026-04-15",
        pending: false,
        isCredit: false,
        amount: 48.21,
        description: "Groceries",
      },
    ]);
    expect(setTxnFetchedAt).toHaveBeenCalledWith("2026-04-16T10:00:00.000Z");
    vi.useRealTimers();
  });

  it("drops duplicate, malformed, and refund-like recent transactions", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-16T12:00:00Z"));
    stateMocks.getHydratedStoredTransactions.mockResolvedValueOnce({
      fetchedAt: "2026-04-16T11:00:00.000Z",
      data: [
        { id: "fresh-1", date: "2026-04-15", pending: false, isCredit: false, amount: 25, description: "Coffee" },
        { id: "fresh-1", date: "2026-04-15", pending: false, isCredit: false, amount: 25, description: "Coffee" },
        { date: "2026-04-15", pending: false, isCredit: false, amount: -12, description: "Refund" },
        { date: "2026/04/15", pending: false, isCredit: false, amount: 8, description: "Malformed date" },
        { date: "2026-04-15", pending: false, isCredit: false, amount: 0, description: "Zero" },
      ],
    });
    const setPlaidTransactions = vi.fn();
    const setTxnFetchedAt = vi.fn();

    await loadRecentPlaidTransactions(setPlaidTransactions, setTxnFetchedAt);

    expect(setPlaidTransactions).toHaveBeenCalledWith([
      {
        id: "fresh-1",
        date: "2026-04-15",
        pending: false,
        isCredit: false,
        amount: 25,
        description: "Coffee",
      },
    ]);
    expect(setTxnFetchedAt).toHaveBeenCalledWith("2026-04-16T11:00:00.000Z");
    vi.useRealTimers();
  });

  it("clears recent transactions when hydration fails", async () => {
    stateMocks.getHydratedStoredTransactions.mockRejectedValueOnce(new Error("db failed"));
    const setPlaidTransactions = vi.fn();
    const setTxnFetchedAt = vi.fn();

    await loadRecentPlaidTransactions(setPlaidTransactions, setTxnFetchedAt);

    expect(setPlaidTransactions).toHaveBeenCalledWith([]);
    expect(setTxnFetchedAt).toHaveBeenCalledWith(null);
  });

  it("dedupes and normalizes holding symbols before fetching prices", async () => {
    stateMocks.fetchMarketPrices.mockResolvedValueOnce({
      VTI: { price: 300 },
      "BTC-USD": { price: 80000 },
    });
    stateMocks.calcPortfolioValue.mockImplementation((positions) => ({
      total: positions.reduce((sum, position) => sum + (position.units || 0), 0),
    }));
    const setHoldingValues = vi.fn();

    await loadHoldingValues(
      {
        enableHoldings: true,
        holdings: {
          roth: [{ symbol: " vti ", units: 1 }],
          k401: [{ symbol: "VTI", units: 2 }],
          brokerage: [{ symbol: "vti", units: 3 }],
          crypto: [{ symbol: "btc-usd", units: 4 }],
          hsa: [{ symbol: "", units: 5 }],
        },
      },
      setHoldingValues
    );

    expect(stateMocks.fetchMarketPrices).toHaveBeenCalledWith(["VTI", "BTC-USD"]);
    expect(setHoldingValues).toHaveBeenCalledWith({
      roth: 1,
      k401: 2,
      brokerage: 3,
      crypto: 4,
      hsa: 5,
    });
  });

  it("zeros out holding values when pricing fails so stale quotes are not reused", async () => {
    stateMocks.fetchMarketPrices.mockRejectedValueOnce(new Error("market offline"));
    const setHoldingValues = vi.fn();

    await loadHoldingValues(
      {
        enableHoldings: true,
        holdings: {
          roth: [{ symbol: "VTI", units: 1 }],
        },
      },
      setHoldingValues
    );

    expect(setHoldingValues).toHaveBeenCalledWith({
      roth: 0,
      k401: 0,
      brokerage: 0,
      crypto: 0,
      hsa: 0,
    });
  });

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

  it("suppresses stale manual investment values when a linked bucket is live and override is off", () => {
    const state = createInitialInputFormState({
      today: new Date("2026-03-16T10:30:00Z"),
      plaidData: { checking: 1000, vault: 500, debts: [] },
      config: {
        investmentRoth: 3000,
        plaidInvestments: [{ id: "plaid-roth", bucket: "roth", _plaidBalance: 3250 }],
      },
    });

    expect(state.roth).toBe("");
  });

  it("keeps distinct manual investment values when manual override is explicit", () => {
    const state = createInitialInputFormState({
      today: new Date("2026-03-16T10:30:00Z"),
      plaidData: { checking: 1000, vault: 500, debts: [] },
      config: {
        investmentRoth: 3000,
        overrideRothValue: true,
        plaidInvestments: [{ id: "plaid-roth", bucket: "roth", _plaidBalance: 3250 }],
      },
    });

    expect(state.roth).toBe(3000);
  });

  it("suppresses likely duplicate manual investment values when a linked bucket mirrors the total", () => {
    const state = createInitialInputFormState({
      today: new Date("2026-03-16T10:30:00Z"),
      plaidData: { checking: 1000, vault: 500, debts: [] },
      config: {
        investmentRoth: 6356.64,
        plaidInvestments: [{ id: "plaid-roth", bucket: "roth", _plaidBalance: 6362.74 }],
      },
    });

    expect(state.roth).toBe("");
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

  it("mergePlaidAutoFillIntoForm does not re-add debt rows explicitly deleted by the user", () => {
    const result = mergePlaidAutoFillIntoForm(
      {
        checking: 900,
        savings: 700,
        debts: [{ cardId: "card-1", name: "Visa", balance: 450 }],
      },
      {
        checking: 1200,
        vault: 800,
        debts: [
          { cardId: "card-1", name: "Visa", balance: 300 },
          { cardId: "card-2", name: "Amex", balance: 125 },
        ],
      },
      { checking: false, vault: false, debts: {} },
      { "card-2": true }
    );

    expect(result.debts).toEqual([{ cardId: "card-1", name: "Visa", balance: 300 }]);
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
          autoPaycheckAdd: true,
          paycheckAddOverride: "1800",
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
    expect(result.autoPaycheckAdd).toBe(true);
    expect(result.paycheckAddOverride).toBe("");
  });

  it("mergeLastAuditIntoForm keeps manual debts that plaid cannot replace", () => {
    stateMocks.getPlaidAutoFill.mockReturnValueOnce({
      checking: 1500,
      vault: 2200,
      debts: [{ cardId: "card-1", name: "Visa", balance: 400 }],
    });

    const result = mergeLastAuditIntoForm({
      previousForm: {
        roth: "",
        brokerage: "",
        k401Balance: "",
        date: "2026-03-01",
        pendingCharges: [],
        habitCount: 10,
        debts: [],
        notes: "",
        autoPaycheckAdd: false,
        paycheckAddOverride: "",
      },
      lastAudit: {
        isTest: false,
        date: "2026-03-01",
        ts: "2026-03-01T10:00:00.000Z",
        parsed: {} as never,
        moveChecks: {},
        form: {
          checking: "100",
          savings: "200",
          debts: [
            { name: "Visa", balance: "700" },
            { name: "Personal Loan", balance: "900" },
          ],
        },
      },
      cards: [{ id: "card-1", name: "Visa", institution: "Chase" }],
      bankAccounts: [],
      today: new Date("2026-03-16T10:30:00Z"),
    });

    expect(result.debts).toEqual([
      { cardId: "card-1", name: "Visa", balance: 400 },
      { cardId: "", name: "Personal Loan", balance: "900" },
    ]);
  });

  it("mergeLastAuditIntoForm drops stale manual investment seeds when a linked investment bucket exists", () => {
    const result = mergeLastAuditIntoForm({
      previousForm: {
        roth: "",
        brokerage: "",
        k401Balance: "",
        date: "2026-03-01",
        pendingCharges: [],
        habitCount: 10,
        debts: [],
        notes: "",
        autoPaycheckAdd: false,
        paycheckAddOverride: "",
      },
      lastAudit: {
        isTest: false,
        form: {
          roth: "6356.64",
        },
      },
      cards: [],
      bankAccounts: [],
      financialConfig: {
        plaidInvestments: [{ id: "plaid-roth", bucket: "roth", _plaidBalance: 6362.74 }],
      },
      today: new Date("2026-03-16T10:30:00Z"),
    });

    expect(result.roth).toBe("");
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

  it("buildAddableDebtCards excludes cards already included in the audit", () => {
    const cards = [
      { id: "1", institution: "Chase", name: "Freedom Unlimited" },
      { id: "2", institution: "Amex", name: "Gold" },
      { id: "3", institution: "Citi", name: "Double Cash" },
    ];

    expect(buildAddableDebtCards(cards, [{ cardId: "2" }, { cardId: "" }])).toEqual([
      { cardId: "1", institution: "Chase", name: "Freedom Unlimited" },
      { cardId: "3", institution: "Citi", name: "Double Cash" },
    ]);
  });
});
