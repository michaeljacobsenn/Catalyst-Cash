import { afterEach, describe, expect, it, vi } from "vitest";

import { getDemoAuditPayload } from "./demoAudit.js";
import { buildDemoScenario, DEMO_SCENARIO_ORDER, getDefaultDemoScenarioId, getNextDemoScenarioId } from "./demoScenario.js";
import { buildGroupedRenewalItems, buildRenewalGroups, calculateMonthlyRenewalTotal } from "./tabs/renewals/model";

function parseCurrency(value) {
  return Number(String(value || "").replace(/[^0-9.-]+/g, "")) || 0;
}

function roundedCurrency(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function sumByCategory(transactions = []) {
  return transactions.reduce((totals, transaction) => {
    const category = transaction?.category || "Uncategorized";
    totals[category] = roundedCurrency((totals[category] || 0) + (Number(transaction?.amount) || 0));
    return totals;
  }, {});
}

const renewalCategoryMeta = {
  housing: { label: "Housing & Utilities", color: "#38d996" },
  subs: { label: "Subscriptions", color: "#a276ff" },
  insurance: { label: "Insurance", color: "#5dc9ff" },
  transport: { label: "Transportation", color: "#5dc9ff" },
  essentials: { label: "Groceries & Essentials", color: "#38d996" },
  medical: { label: "Medical & Health", color: "#38d996" },
  sinking: { label: "Sinking Funds", color: "#a276ff" },
  onetime: { label: "One-Time Expenses", color: "#5dc9ff" },
  inactive: { label: "Inactive & History", color: "#94a3b8" },
  af: { label: "Annual Fees", color: "#a276ff" },
};

afterEach(() => {
  vi.useRealTimers();
});

describe("demo audit payload", () => {
  it("stays near-perfect and aligned with the seeded demo household", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T12:00:00.000Z"));
    globalThis.window = globalThis.window || {};

    const scenario = buildDemoScenario(new Date("2026-04-20T12:00:00.000Z"));
    const payload = getDemoAuditPayload({}, []);
    const dashboardRows = new Map(
      (payload.audit.parsed.dashboardCard || []).map((row) => [row.category, row.amount])
    );
    const expectedChecking = Number(scenario.form.checking || 0);
    const expectedVault = Number(scenario.form.ally || scenario.form.savings || 0);

    expect(payload.audit.parsed.healthScore?.score).toBeGreaterThanOrEqual(99);
    expect(payload.audit.parsed.degraded).toBeNull();
    expect(payload.audit.parsed.status).toBe("GREEN");
    expect(payload.audit.demoScenarioId).toBe(getDefaultDemoScenarioId());
    expect(payload.audit.demoScenarioName).toBe("Everyday Momentum");
    expect(payload.audit.moveChecks).toEqual({});
    expect(payload.audit.demoPortfolio?.cards).toHaveLength(payload.demoCards.length);
    expect(payload.audit.demoPortfolio?.bankAccounts).toHaveLength(payload.demoBankAccounts.length);
    expect(payload.audit.demoPortfolio?.renewals).toHaveLength(payload.demoRenewals.length);

    expect(parseCurrency(dashboardRows.get("Checking"))).toBe(expectedChecking);
    expect(parseCurrency(dashboardRows.get("Vault"))).toBe(expectedVault);
    expect(parseCurrency(dashboardRows.get("Pending"))).toBeCloseTo(scenario.pendingTotal, 2);
    expect(parseCurrency(payload.audit.parsed.investments?.balance)).toBe(scenario.investmentTotal);
    expect(payload.audit.parsed.netWorth).toBe(scenario.netWorth);

    expect(payload.demoConfig.otherAssets).toEqual(scenario.financialConfig.otherAssets);
    expect(payload.demoConfig.savingsGoals).toEqual(scenario.financialConfig.savingsGoals);
    expect(payload.demoConfig.holdings).toEqual(scenario.financialConfig.holdings);
    expect(payload.demoBankAccounts.reduce((sum, account) => sum + (Number(account.balance) || 0), 0)).toBe(expectedChecking + expectedVault);
    expect(payload.demoCards.every((card) => (Number(card.balance) || 0) === 0)).toBe(true);
    expect(payload.audit.parsed.structured.nextAction?.detail || "").toContain("Vanguard Brokerage");
    expect((payload.audit.parsed.moveItems || []).every((item) => Number(item.amount || 0) >= 0)).toBe(true);
    expect(payload.audit.parsed.moveItems).toHaveLength(3);
    expect(payload.nh).toHaveLength(7);
  });

  it("cycles to the next curated scenario instead of randomizing demo loads", () => {
    expect(getDefaultDemoScenarioId()).toBe("everyday_momentum");
    expect(getNextDemoScenarioId("everyday_momentum")).toBe("debt_reset");
    expect(getNextDemoScenarioId("debt_reset")).toBe("steady_builder");
    expect(getNextDemoScenarioId("steady_builder")).toBe("wealth_builder");
    expect(getNextDemoScenarioId("wealth_builder")).toBe("everyday_momentum");
  });

  it("keeps every curated demo scenario internally reconciled across app surfaces", () => {
    const referenceDate = new Date("2026-04-20T12:00:00.000Z");

    for (const scenarioId of DEMO_SCENARIO_ORDER) {
      const scenario = buildDemoScenario(referenceDate, scenarioId);
      const budgetFromTransactions = sumByCategory(scenario.parsedTransactions);
      const configuredBudgetCategories = new Set((scenario.financialConfig.budgetCategories || []).map((category) => category.name));
      const cardIds = new Set((scenario.cards || []).map((card) => card.id));
      const bankIds = new Set((scenario.bankAccounts || []).map((account) => account.id));
      const groupedRenewalItems = buildGroupedRenewalItems(scenario.renewals, [], scenario.todayStr);
      const visibleRenewalGroups = buildRenewalGroups(groupedRenewalItems, {
        sortBy: "type",
        showInactive: false,
        categoryMeta: renewalCategoryMeta,
      });
      const visibleRenewalCount = visibleRenewalGroups.reduce((sum, group) => sum + group.items.length, 0);
      const checkingTotal = scenario.bankAccounts
        .filter((account) => account.accountType !== "savings")
        .reduce((sum, account) => sum + (Number(account.balance) || 0), 0);
      const savingsTotal = scenario.bankAccounts
        .filter((account) => account.accountType === "savings")
        .reduce((sum, account) => sum + (Number(account.balance) || 0), 0);
      const investmentTotal = scenario.holdingValues.k401 + scenario.holdingValues.roth + scenario.holdingValues.brokerage;
      const debtTotal = scenario.cards.reduce((sum, card) => sum + (Number(card.balance) || 0), 0);
      const expectedNetWorth = checkingTotal + savingsTotal + investmentTotal + scenario.otherAssetsTotal - debtTotal;

      expect(scenario.cards.every((card) => card.type === "credit"), scenarioId).toBe(true);
      expect(scenario.renewals.every((renewal) => {
        if (renewal.chargedToType === "card") return cardIds.has(renewal.chargedToId);
        if (renewal.chargedToType === "bank") return bankIds.has(renewal.chargedToId);
        return false;
      }), scenarioId).toBe(true);
      expect(visibleRenewalCount, scenarioId).toBe(scenario.renewals.length);
      expect(calculateMonthlyRenewalTotal(groupedRenewalItems), scenarioId).toBeCloseTo(
        scenario.renewals.reduce((sum, renewal) => sum + (Number(renewal.amount) || 0), 0),
        2
      );

      for (const [category, actual] of Object.entries(scenario.budgetActuals || {})) {
        expect(configuredBudgetCategories.has(category), `${scenarioId}:${category}`).toBe(true);
        expect(roundedCurrency(budgetFromTransactions[category]), `${scenarioId}:${category}`).toBe(roundedCurrency(actual));
      }

      expect(scenario.investmentTotal, scenarioId).toBe(investmentTotal);
      expect(scenario.financialConfig.investmentBrokerage, scenarioId).toBe(scenario.holdingValues.brokerage);
      expect(scenario.financialConfig.investmentRoth, scenarioId).toBe(scenario.holdingValues.roth);
      expect(scenario.financialConfig.k401Balance, scenarioId).toBe(scenario.holdingValues.k401);
      expect(scenario.debtTotal, scenarioId).toBe(debtTotal);
      expect(scenario.netWorth, scenarioId).toBe(expectedNetWorth);
      expect(Number(scenario.form.checking), scenarioId).toBe(checkingTotal);
      expect(Number(scenario.form.ally), scenarioId).toBe(savingsTotal);
      expect(scenario.form.budgetActuals, scenarioId).toEqual(scenario.budgetActuals);
    }
  });

  it("includes a debt recovery scenario with payoff-first guidance", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T12:00:00.000Z"));
    globalThis.window = globalThis.window || {};

    const scenario = buildDemoScenario(new Date("2026-04-20T12:00:00.000Z"), "debt_reset");
    const payload = getDemoAuditPayload({}, [], "debt_reset");

    expect(payload.audit.demoScenarioId).toBe("debt_reset");
    expect(payload.audit.demoScenarioName).toBe("Debt Reset");
    expect(payload.audit.parsed.healthScore?.score).toBeGreaterThanOrEqual(80);
    expect(payload.audit.parsed.healthScore?.score).toBeLessThan(100);
    expect(payload.audit.parsed.status).toBe("YELLOW");
    const debtTotal = (scenario.form.debts || []).reduce((sum, debt) => sum + (Number(debt.balance) || 0), 0);
    const grossAssets =
      Number(scenario.form.checking || 0) +
      Number(scenario.form.ally || scenario.form.savings || 0) +
      scenario.investmentTotal +
      scenario.otherAssetsTotal;

    expect(debtTotal).toBeGreaterThan(0);
    expect(payload.demoCards.some((card) => Number(card.balance) > 0)).toBe(true);
    expect(scenario.netWorth).toBe(grossAssets - debtTotal);
    expect(payload.audit.parsed.netWorth).toBe(scenario.netWorth);
    expect(payload.audit.parsed.structured.nextAction?.detail || "").toContain("Savor");
    expect(payload.audit.parsed.alertsCard.join(" ")).toContain("credit utilization");
  });

  it("replaces real investment linkage state when demo mode is loaded", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T12:00:00.000Z"));

    const payload = getDemoAuditPayload(
      {
        plaidInvestments: [{ id: "live-plaid-invest", bucket: "brokerage", _plaidBalance: 99999 }],
        excludedInvestmentSourceIds: ["plaid:live-plaid-invest"],
        holdings: {
          roth: [{ id: "live-roth", symbol: "SPY", shares: 10 }],
          brokerage: [],
          k401: [],
          crypto: [],
          hsa: [],
        },
      },
      []
    );

    expect(payload.demoConfig.plaidInvestments).toEqual([]);
    expect(payload.demoConfig.excludedInvestmentSourceIds).toEqual([]);
    const holdingIds = Object.values(payload.demoConfig.holdings || {})
      .flat()
      .map((holding) => String(holding?.id || ""));
    expect(holdingIds.every((id) => id.startsWith("demo-"))).toBe(true);
    expect(payload.demoConfig.holdings.roth.some((holding) => String(holding.id || "").startsWith("live-"))).toBe(false);
  });
});
