#!/usr/bin/env node

const budgets = {
  leanAudit: { maxChars: 12000, maxTokens: 3000 },
  medianAudit: { maxChars: 18000, maxTokens: 4200 },
  richAudit: { maxChars: 20000, maxTokens: 4500 },
  richChat: { maxChars: 13000, maxTokens: 3300 },
};

const legacyBaselines = {
  richAudit: { chars: 58784, tokens: 14696 },
  richChat: { chars: 13034, tokens: 3259 },
};

function percentDelta(before, after) {
  if (!before) return null;
  return Number((((after - before) / before) * 100).toFixed(1));
}

async function main() {
  const { getSystemPrompt, estimatePromptTokens } = await import("../worker/src/promptBuilders.js");
  const { getChatSystemPrompt } = await import("../worker/src/chatPromptBuilders.js");

  const minConfig = {
    paycheckStandard: 2000,
    payFrequency: "bi-weekly",
    payday: "Friday",
    paycheckUsableTime: "09:00",
    emergencyFloor: 500,
    weeklySpendAllowance: 200,
    greenStatusTarget: 1500,
    emergencyReserveTarget: 5000,
    vaultTarget: 1000,
    taxBracket: 22,
    currencyCode: "USD",
  };

  const medianConfig = {
    ...minConfig,
    monthlyRent: 1850,
    track401k: true,
    k401EmployerMatchPct: 50,
    k401EmployerMatchLimit: 6,
    notes: "Keep emergency fund first.",
    nonCardDebts: [{ name: "Student Loan", type: "student", balance: 8400, minimum: 120, apr: 5.9, dueDay: 18 }],
  };

  const richConfig = {
    ...minConfig,
    taxBracketPercent: 24,
    stateCode: "NY",
    birthYear: 1991,
    monthlyRent: 2100,
    incomeType: "variable",
    track401k: true,
    k401Balance: 15000,
    k401EmployerMatchPct: 50,
    k401EmployerMatchLimit: 6,
    trackRoth: true,
    rothContributedYTD: 1200,
    rothAnnualLimit: 7000,
    trackHSA: true,
    hsaBalance: 800,
    hsaContributedYTD: 500,
    hsaAnnualLimit: 4300,
    trackBrokerage: true,
    trackCrypto: true,
    enableHoldings: true,
    holdings: {
      roth: [{ symbol: "VTI", shares: 10 }],
      brokerage: [{ symbol: "VXUS", shares: 4 }],
      k401: [{ symbol: "VFIFX", shares: 20 }],
      hsa: [{ symbol: "VTI", shares: 2 }],
      crypto: [{ symbol: "ETH-USD", shares: 0.5 }],
    },
    budgetCategories: [{ name: "Dining", monthlyTarget: 400 }],
    nonCardDebts: [{ name: "Student Loan", type: "student", balance: 14000, minimum: 180, apr: 5.8, dueDay: 16 }],
    savingsGoals: [{ name: "House Fund", targetAmount: 30000, currentAmount: 8000, targetDate: "2027-12-01" }],
    insuranceDeductibles: [{ type: "Auto", deductible: 1000, annualPremium: 1800 }],
    bigTicketItems: [{ name: "Vacation", cost: 2500, targetDate: "2026-07-01", priority: "medium" }],
    trackHabits: true,
    habitName: "Nicotine",
    habitCount: 4,
    habitRestockCost: 28,
    habitCriticalThreshold: 2,
    isContractor: true,
    taxWithholdingRate: 25,
    quarterlyTaxEstimate: 2400,
    notes: "Rent already paid this month.",
  };

  const richCards = [{ name: "Capital One Savor", institution: "Capital One", limit: 10000, apr: 24.99, minPayment: 55, balance: 3200 }];
  const richRenewals = [
    { category: "subscription", name: "Netflix", amount: 22.99, interval: 1, intervalUnit: "months", nextDue: "2026-03-21", chargedTo: "Capital One Savor" },
  ];
  const richStrategy = {
    nextPayday: "2026-03-20",
    totalCheckingFloor: 1625,
    timeCriticalAmount: 460,
    requiredTransfer: 0,
    operationalSurplus: 740,
    debtStrategy: { target: "Capital One Savor", amount: 740 },
    auditSignals: {
      nativeScore: { score: 74, grade: "C" },
      liquidity: { checkingAfterFloorAndBills: 431, transferNeeded: 0 },
      emergencyFund: { current: 1200, target: 10000, coverageWeeks: 2.8 },
      debt: { total: 18100, toxicDebtCount: 0, highAprCount: 1 },
      utilization: { pct: 29 },
      riskFlags: ["emergency-fund-gap", "high-apr-debt"],
    },
  };
  const trends = Array.from({ length: 6 }, (_, i) => ({
    week: i + 1,
    score: 68 + i,
    checking: 1800 + i * 75,
    vault: i * 100,
    totalDebt: 19000 - i * 250,
    status: i < 3 ? "tight" : "improving",
  }));

  const cases = {
    leanAudit: getSystemPrompt("gemini", minConfig),
    medianAudit: getSystemPrompt(
      "gemini",
      medianConfig,
      [{ name: "Freedom Unlimited", institution: "Chase", limit: 15000, apr: 23.99, minPayment: 60, balance: 2400 }],
      [],
      "",
      null,
      null,
      {
        nextPayday: "2026-03-20",
        totalCheckingFloor: 1100,
        timeCriticalAmount: 300,
        requiredTransfer: 0,
        operationalSurplus: 350,
        debtStrategy: { target: "Freedom Unlimited", amount: 350 },
        auditSignals: {
          nativeScore: { score: 76, grade: "C+" },
          liquidity: { checkingAfterFloorAndBills: 525, transferNeeded: 0 },
          emergencyFund: { current: 2100, target: 7000, coverageWeeks: 4.5 },
          debt: { total: 10800, toxicDebtCount: 0, highAprCount: 1 },
          utilization: { pct: 16 },
          riskFlags: ["emergency-fund-gap"],
        },
      }
    ),
    richAudit: getSystemPrompt("gemini", richConfig, richCards, richRenewals, "Keep emergency fund first.", trends, "coach", richStrategy),
    richChat: getChatSystemPrompt(
      { parsed: { netWorth: -2500, healthScore: { score: 74, grade: "C", trend: "up", summary: "Improving." }, status: "YELLOW" } },
      richConfig,
      richCards,
      richRenewals,
      [],
      { name: "Coach", style: "direct and no-fluff" },
      "Keep emergency fund first.",
      richStrategy,
      null,
      "gemini",
      "",
      [{ flag: "emergency-reserve-gap", active: true, severity: "high", rationale: "Emergency reserve is below target." }],
      null
    ),
  };

  const rows = Object.entries(cases).map(([name, prompt]) => {
    const chars = prompt.length;
    const tokens = estimatePromptTokens(prompt);
    const baseline = legacyBaselines[name];
    return {
      case: name,
      chars,
      tokens,
      chars_vs_legacy_pct: baseline ? percentDelta(baseline.chars, chars) : "",
      tokens_vs_legacy_pct: baseline ? percentDelta(baseline.tokens, tokens) : "",
    };
  });

  console.table(rows);

  const shouldCheck = process.argv.includes("--check");
  if (!shouldCheck) return;

  const failures = [];
  for (const row of rows) {
    const budget = budgets[row.case];
    if (!budget) continue;
    if (row.chars > budget.maxChars) {
      failures.push(`${row.case} chars ${row.chars} exceeded budget ${budget.maxChars}`);
    }
    if (row.tokens > budget.maxTokens) {
      failures.push(`${row.case} tokens ${row.tokens} exceeded budget ${budget.maxTokens}`);
    }
  }

  if (failures.length > 0) {
    console.error("\nPrompt budget regression detected:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("\nPrompt budgets passed.");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
