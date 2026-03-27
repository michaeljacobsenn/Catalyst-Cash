import { describe, expect, it } from "vitest";

import { buildScrubber } from "../../scrubber.js";
import { buildCompactFinancialBrief, compactChatAuditHistory, prepareScrubbedChatTransport } from "./transport";

describe("ai chat transport", () => {
  it("compacts audit history before sending it to the backend", () => {
    const history = Array.from({ length: 10 }, (_, index) => ({
      date: `2026-03-${String(index + 1).padStart(2, "0")}`,
      ts: `audit-${index}`,
      isTest: false,
      form: { checking: 0 },
      parsed: {
        netWorth: index * 1000,
        healthScore: { score: 90 - index, grade: "A" },
      },
      moveChecks: {},
    }));

    const compacted = compactChatAuditHistory(history as never[]);
    expect(compacted).toHaveLength(8);
    expect(compacted[0]).toEqual({
      date: "2026-03-01",
      ts: "audit-0",
      isTest: false,
      parsed: {
        netWorth: 0,
        healthScore: { score: 90, grade: "A" },
      },
    });
  });

  it("scrubs the live message, context, and prior history before transport", () => {
    const scrubber = buildScrubber(
      [{ name: "Chase Sapphire Preferred", institution: "Chase" }],
      [{ name: "Netflix", chargedTo: "Chase Sapphire Preferred" }],
      { incomeSources: [{ name: "Acme Corp" }] }
    );

    const transport = prepareScrubbedChatTransport({
      latestUserMessage: "Should I use Chase Sapphire Preferred for Netflix?",
      promptContext: {
        cards: [{ name: "Chase Sapphire Preferred" }],
        renewals: [{ name: "Netflix" }],
        financialConfig: { incomeSources: [{ name: "Acme Corp" }] },
      },
      apiHistory: [{ role: "user", content: "I bank with Chase." }],
      scrub: scrubber.scrub,
    });

    expect(transport.snapshot).not.toContain("Chase Sapphire Preferred");
    expect(JSON.stringify(transport.promptContext)).not.toContain("Chase Sapphire Preferred");
    expect(JSON.stringify(transport.promptContext)).not.toContain("Netflix");
    expect(JSON.stringify(transport.promptContext)).not.toContain("Acme Corp");
    expect(JSON.stringify(transport.apiHistory)).not.toContain("Chase");
  });

  it("compresses live finance state into a compact brief before transport", () => {
    const brief = buildCompactFinancialBrief({
      current: {
        date: "2026-03-26",
        parsed: {
          status: "GREEN",
          mode: "STANDARD",
          netWorth: 42000,
          healthScore: { score: 84, grade: "B" },
          dashboardCard: [
            { category: "Checking", amount: "$3,250" },
            { category: "Vault", amount: "$8,100" },
            { category: "Pending", amount: "$420" },
            { category: "Available", amount: "$2,180" },
          ],
        },
      },
      financialConfig: {
        birthYear: 1990,
        payFrequency: "bi-weekly",
        paycheckStandard: 2200,
        emergencyFloor: 1500,
        currencyCode: "USD",
        incomeSources: [{ name: "Acme Corp", amount: 2200, frequency: "bi-weekly", type: "salary", nextDate: "2026-03-29" }],
        nonCardDebts: [{ name: "Student Loan", balance: 12000, apr: 5.5, minPayment: 180 }],
      },
      cards: [{ id: "card_1", name: "Chase Sapphire Preferred", balance: 600, limit: 12000, apr: 24.99, _plaidAccountId: "acct_1" }],
      renewals: [{ name: "Netflix", amount: 15.49, interval: 1, intervalUnit: "months", nextDue: "2026-04-02" }],
      history: [{ date: "2026-03-20", ts: "audit-1", isTest: false, parsed: { netWorth: 41000, healthScore: { score: 82, grade: "B" } } }],
      trendContext: [{ date: "2026-03-20", score: 82, status: "GREEN", checking: 2900, vault: 7900, totalDebt: 12600 }],
    } as never);

    expect(brief.snapshot.netWorth).toBe(42000);
    expect(brief.income.estimatedMonthly).toBeCloseTo(4766.67, 2);
    expect(brief.cards[0]).toMatchObject({
      name: "Chase Sapphire Preferred",
      utilization: 5,
      plaidLinked: true,
    });
    expect(brief.renewals.monthlyEstimate).toBeCloseTo(15.49);
    expect(brief.auditHistory).toHaveLength(1);
  });
});
