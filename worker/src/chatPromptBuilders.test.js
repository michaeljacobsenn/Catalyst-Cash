import { describe, expect, it } from "vitest";

import { classifyChatIntent, getChatSystemPrompt } from "./chatPromptBuilders.js";

describe("chatPromptBuilders", () => {
  it("includes split-paycheck monthly income in chat context", () => {
    const prompt = getChatSystemPrompt(
      null,
      {
        incomeType: "salary",
        payFrequency: "bi-weekly",
        paycheckStandard: 2200,
        paycheckFirstOfMonth: 2800,
      },
      [],
      [],
      [],
      "",
      "",
      null,
      null,
      "openai",
      "",
      [],
      null,
      null
    );

    expect(prompt).toContain("Estimated Monthly Net Income: $5,366.67");
    expect(prompt).toContain("1st-of-Month Paycheck: $2,800.00");
  });

  it("enforces an executive visible-response contract", () => {
    const prompt = getChatSystemPrompt(
      null,
      {},
      [],
      [],
      [],
      null,
      "",
      null,
      null,
      "openai",
      "",
      [],
      null,
      null
    );

    expect(prompt).toContain("Operate like a conservative CFO, forensic financial analyst, and cash-flow auditor.");
    expect(prompt).toContain("## Visible Response Standard (MANDATORY)");
    expect(prompt).toContain("Start with a one-sentence verdict that answers the question directly.");
    expect(prompt).toContain("Separate observed facts from assumptions.");
  });

  it("builds a full chat prompt from a compact financial brief when raw context is omitted", () => {
    const prompt = getChatSystemPrompt(
      null,
      {},
      [],
      [],
      [],
      null,
      "",
      null,
      null,
      "openai",
      "",
      [],
      null,
      null,
      {
        profile: { preferredName: "Michael", birthYear: 1990, age: 36, payFrequency: "bi-weekly", incomeType: "salary" },
        income: {
          estimatedMonthly: 5366.67,
          cycleNet: 2476.92,
          sources: [{ name: "Primary Income", amount: 2200, frequency: "bi-weekly", type: "salary", nextDate: "2026-03-29" }],
        },
        snapshot: { status: "YELLOW", mode: "STANDARD", healthScore: 72, netWorth: 42000 },
        cash: { checking: 3200, vault: 8100, pending: 420, available: 2180, emergencyFloor: 1500, weeklySpendAllowance: 300 },
        credit: { totalCardDebt: 800, totalCardLimit: 12000, overallUtilization: 6.7, creditScore: 742 },
        debt: { totalNonCardDebt: 0, totalDebt: 800, nonCardDebts: [] },
        cards: [{ name: "Chase Sapphire Preferred", balance: 800, limit: 12000, utilization: 6.7, apr: 24.99, minPayment: 40 }],
        renewals: {
          monthlyEstimate: 48.98,
          items: [{ name: "Netflix", amount: 15.49, interval: 1, intervalUnit: "months", monthlyAmount: 15.49, nextDue: "2026-04-02" }],
        },
        trends: [{ date: "2026-03-20", score: 70, status: "YELLOW", checking: 2800, vault: 7900, totalDebt: 900 }],
        auditHistory: [{ date: "2026-03-20", parsed: { netWorth: 41000, healthScore: { score: 70, grade: "C" } } }],
      }
    );

    expect(prompt).toContain("Estimated Monthly Net Income: $5,366.67");
    expect(prompt).toContain("Preferred name: Michael");
    expect(prompt).toContain("Chase Sapphire Preferred");
    expect(prompt).toContain("This user has minimal debt (**$800.00**).");
    expect(prompt).toContain("Netflix");
  });

  it("classifies investment-heavy messages into the invest route", () => {
    expect(classifyChatIntent("Should I prioritize Roth IRA contributions or my brokerage?").id).toBe("invest");
    expect(classifyChatIntent("How should I attack my credit card debt?").id).toBe("spending");
  });

  it("adds server-side routing guidance to the prompt", () => {
    const prompt = getChatSystemPrompt(
      null,
      {},
      [],
      [],
      [],
      null,
      "",
      null,
      null,
      "openai",
      "",
      [],
      null,
      null,
      {
        profile: { birthYear: 1990, age: 36, payFrequency: "bi-weekly", incomeType: "salary" },
        income: { estimatedMonthly: 5366.67, cycleNet: 2476.92, sources: [] },
        snapshot: { status: "YELLOW", mode: "STANDARD", healthScore: 72, netWorth: 42000 },
        cash: { checking: 3200, vault: 8100, pending: 420, available: 2180, emergencyFloor: 1500, weeklySpendAllowance: 300 },
        credit: { totalCardDebt: 800, totalCardLimit: 12000, overallUtilization: 6.7, creditScore: 742 },
        debt: { totalNonCardDebt: 0, totalDebt: 800, nonCardDebts: [] },
        cards: [{ name: "Chase Sapphire Preferred", balance: 800, limit: 12000, utilization: 6.7, apr: 24.99, minPayment: 40 }],
        renewals: { monthlyEstimate: 48.98, items: [{ name: "Netflix", amount: 15.49, interval: 1, intervalUnit: "months", monthlyAmount: 15.49, nextDue: "2026-04-02" }] },
        trends: [],
        auditHistory: [],
      },
      "Should I invest my extra cash in my Roth IRA?"
    );

    expect(prompt).toContain("## Server Intent Routing");
    expect(prompt).toContain("[Invest Agent]");
  });

  it("adds structured finance tools ahead of the narrative brief", () => {
    const prompt = getChatSystemPrompt(
      null,
      {},
      [],
      [],
      [],
      null,
      "",
      null,
      null,
      "openai",
      "",
      [],
      null,
      null,
      {
        profile: { birthYear: 1990, age: 36, payFrequency: "bi-weekly", incomeType: "salary" },
        income: { estimatedMonthly: 5400, cycleNet: 2500, sources: [] },
        snapshot: { status: "GREEN", mode: "STANDARD", healthScore: 81, netWorth: 56000 },
        cash: { checking: 4200, vault: 9000, pending: 650, available: 3050, emergencyFloor: 1500, weeklySpendAllowance: 350 },
        credit: { totalCardDebt: 1200, totalCardLimit: 18000, overallUtilization: 6.7, creditScore: 755 },
        debt: { totalNonCardDebt: 0, totalDebt: 1200, nonCardDebts: [] },
        cards: [{ name: "Chase Sapphire Preferred", balance: 1200, limit: 18000, utilization: 6.7, apr: 24.99, annualFee: 95, plaidLinked: true }],
        renewals: { monthlyEstimate: 210, items: [{ name: "Gym", amount: 55, nextDue: "2026-04-02", chargedTo: "Chase Sapphire Preferred" }] },
        trends: [],
        auditHistory: [],
      },
      "Which card should I use for travel and should I invest the extra cash?"
    );

    expect(prompt).toContain("## Structured Finance Tools");
    expect(prompt).toContain("### finance_action_packet");
    expect(prompt).toContain("### cash_position");
    expect(prompt).toContain("### card_portfolio");
    expect(prompt).toContain("### investment_posture");
  });

  it("hardens the gambling guardrail beyond generic refusal text", () => {
    const prompt = getChatSystemPrompt(
      null,
      {},
      [],
      [],
      [],
      null,
      "",
      null,
      null,
      "gemini",
      "",
      [],
      null,
      null
    );

    expect(prompt).toContain("do not analyze odds or bankroll sizing");
    expect(prompt).toContain("redirect to a safer financial move");
    expect(prompt).toContain("1-800-522-4700");
  });

  it("adds a finance action contract for mixed questions", () => {
    const prompt = getChatSystemPrompt(
      null,
      {},
      [],
      [],
      [],
      null,
      "",
      null,
      null,
      "openai",
      "",
      [],
      null,
      null,
      {
        profile: { birthYear: 1990, age: 36, payFrequency: "bi-weekly", incomeType: "salary" },
        income: { estimatedMonthly: 5400, cycleNet: 2500, sources: [] },
        snapshot: { status: "GREEN", mode: "STANDARD", healthScore: 81, netWorth: 56000 },
        cash: { checking: 4200, vault: 9000, pending: 650, available: 3050, emergencyFloor: 1500, weeklySpendAllowance: 350 },
        credit: { totalCardDebt: 1200, totalCardLimit: 18000, overallUtilization: 6.7, creditScore: 755 },
        debt: { totalNonCardDebt: 0, totalDebt: 1200, nonCardDebts: [] },
        cards: [{ name: "Chase Sapphire Preferred", balance: 1200, limit: 18000, utilization: 6.7, apr: 24.99 }],
        renewals: { monthlyEstimate: 210, items: [] },
        trends: [],
        auditHistory: [],
      },
      "Should I invest my extra cash or use a different card for travel?"
    );

    expect(prompt).toContain("## Finance Action Contract");
    expect(prompt).toContain("Allowed primary lanes");
    expect(prompt).toContain("Current expected primary lane: card_selection.");
    expect(prompt).toContain("Allowed secondary lanes for this response: investment_contribution, cash_deployment.");
    expect(prompt).toContain("Required evidence tools for this answer: card_portfolio, cash_position, debt_snapshot.");
  });

  it("keeps mixed card and debt questions in a deterministic spending packet", () => {
    const prompt = getChatSystemPrompt(
      null,
      {},
      [],
      [],
      [],
      null,
      "",
      null,
      null,
      "openai",
      "",
      [],
      null,
      null,
      {
        profile: { birthYear: 1990, age: 36, payFrequency: "bi-weekly", incomeType: "salary" },
        income: { estimatedMonthly: 5400, cycleNet: 2500, sources: [] },
        snapshot: { status: "YELLOW", mode: "STANDARD", healthScore: 68, netWorth: 42000 },
        cash: { checking: 1800, vault: 5000, pending: 900, available: 200, emergencyFloor: 1500, weeklySpendAllowance: 350 },
        credit: { totalCardDebt: 4200, totalCardLimit: 10000, overallUtilization: 42, creditScore: 702 },
        debt: { totalNonCardDebt: 0, totalDebt: 4200, nonCardDebts: [] },
        cards: [{ name: "Freedom Flex", balance: 2200, limit: 5000, utilization: 44, apr: 26.99 }],
        renewals: { monthlyEstimate: 140, items: [] },
        trends: [],
        auditHistory: [],
      },
      "Should I pay down debt or switch cards for travel?"
    );

    expect(prompt).toContain("Current expected primary lane: debt_paydown.");
    expect(prompt).toContain("Allowed secondary lanes for this response: card_selection.");
    expect(prompt).toContain("### finance_action_packet");
    expect(prompt).toContain("Urgency: medium");
  });

  it("honors a provider-native action packet when one is supplied", () => {
    const prompt = getChatSystemPrompt(
      null,
      {},
      [],
      [],
      [],
      null,
      "",
      null,
      null,
      "openai",
      "",
      [],
      null,
      null,
      {
        profile: { birthYear: 1990, age: 36, payFrequency: "bi-weekly", incomeType: "salary" },
        income: { estimatedMonthly: 5400, cycleNet: 2500, sources: [] },
        snapshot: { status: "GREEN", mode: "STANDARD", healthScore: 81, netWorth: 56000 },
        cash: { checking: 4200, vault: 9000, pending: 650, available: 3050, emergencyFloor: 1500, weeklySpendAllowance: 350 },
        credit: { totalCardDebt: 1200, totalCardLimit: 18000, overallUtilization: 6.7, creditScore: 755 },
        debt: { totalNonCardDebt: 0, totalDebt: 1200, nonCardDebts: [] },
        cards: [{ name: "Chase Sapphire Preferred", balance: 1200, limit: 18000, utilization: 6.7, apr: 24.99 }],
        renewals: { monthlyEstimate: 210, items: [] },
        trends: [],
        auditHistory: [],
      },
      "Should I invest my extra cash or use a different card for travel?",
      "default",
      {
        primaryLane: "investment_contribution",
        secondaryLanes: ["card_selection"],
        urgency: "normal",
        rationale: "Investment-first route selected by provider-native router.",
      }
    );

    expect(prompt).toContain("Current expected primary lane: investment_contribution.");
    expect(prompt).toContain("Action packet source: provider-native-router.");
    expect(prompt).toContain("Source: provider-native-router");
  });
});
