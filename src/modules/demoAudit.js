import { buildDemoScenario, getDefaultDemoScenarioId } from "./demoScenario.js";
import { generateStrategy } from "./engine.js";
import { getGradeLetter } from "./mathHelpers.js";
import { parseAudit, validateParsedAuditConsistency } from "./utils.js";

function currency(amount) {
  return `$${Number(amount || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getScenarioHouseholdLabel(scenario) {
  const name = String(scenario?.scenarioMeta?.name || "").trim();
  if (name) return `The ${name} household`;
  return "This household";
}

function buildValidationOptions({ form, renewals, cards, financialConfig, computedStrategy, investmentTotal, netWorth, pendingTotal, personalRules }) {
  return {
    operationalSurplus: computedStrategy?.operationalSurplus ?? null,
    nativeScore: computedStrategy?.auditSignals?.nativeScore?.score ?? null,
    nativeRiskFlags: computedStrategy?.auditSignals?.riskFlags ?? [],
    dashboardAnchors: {
      checking: Number(form?.checking) || 0,
      vault: Number(form?.savings || form?.ally) || 0,
      pending: pendingTotal,
      debts: computedStrategy?.auditSignals?.debt?.total ?? 0,
      available: computedStrategy?.operationalSurplus ?? null,
    },
    investmentAnchors: {
      balance: investmentTotal,
      asOf: form?.date || null,
      gateStatus: null,
      netWorth,
    },
    cards,
    renewals,
    formData: form,
    financialConfig,
    computedStrategy,
    personalRules,
  };
}

function buildCurrentDemoAuditJson({
  scenario,
  todayStr,
  checkingBalance,
  vaultBalance,
  investmentTotal,
  otherAssetsTotal,
  pendingTotal,
  netWorth,
  netWorthDeltaLabel,
  renewals,
  savingsGoals,
  cards,
  budgetActuals,
  computedStrategy,
}) {
  const nativeScore = computedStrategy?.auditSignals?.nativeScore?.score ?? 100;
  const emergencyCurrent = computedStrategy?.auditSignals?.emergencyFund?.current ?? 0;
  const emergencyTarget = computedStrategy?.auditSignals?.emergencyFund?.target ?? 0;
  const emergencyPct = emergencyTarget > 0 ? Math.round((emergencyCurrent / emergencyTarget) * 100) : 0;
  const operatingFloor = computedStrategy?.totalCheckingFloor ?? 0;
  const operationalSurplus = computedStrategy?.operationalSurplus ?? 0;
  const nextPayday = computedStrategy?.nextPayday || todayStr;
  const debtTotal = computedStrategy?.auditSignals?.debt?.total ?? 0;
  const hasDebt = debtTotal > 0;
  const weeklyAllowance = Number(scenario?.financialConfig?.weeklySpendAllowance) || 0;
  const rothTarget = Math.max(0, Math.min(Number(scenario?.nextRothContribution) || 0, operationalSurplus));
  const brokerageSweep = Math.max(0, operationalSurplus - rothTarget);
  const highestAprCard = hasDebt
    ? cards
      .filter((card) => Number(card?.balance) > 0)
      .sort((a, b) => (Number(b?.apr) || 0) - (Number(a?.apr) || 0))[0] || null
    : null;
  const totalLimit = cards.reduce((sum, card) => sum + (Number(card?.limit) || 0), 0);
  const utilizationPct = totalLimit > 0 ? Math.round((debtTotal / totalLimit) * 100) : 0;
  const auditStatus = hasDebt ? (nativeScore >= 80 ? "YELLOW" : "RED") : "GREEN";
  const primaryActionAmount = hasDebt ? operationalSurplus : brokerageSweep;
  const primaryActionTitle = hasDebt
    ? `Attack ${highestAprCard?.nickname || highestAprCard?.name || "highest APR card"}`
    : "Sweep the first surplus block";
  const primaryActionDetail = hasDebt
    ? `Send ${currency(primaryActionAmount)} from Checking to ${highestAprCard?.nickname || highestAprCard?.name || "the highest APR card"} this week while keeping the protected ${currency(operatingFloor)} floor intact.`
    : `Transfer ${currency(primaryActionAmount)} from Checking to Vanguard Brokerage this week now that the ${currency(operatingFloor)} floor is protected.`;
  const nextActionDetail = hasDebt
    ? `Move ${currency(primaryActionAmount)} from Checking to ${highestAprCard?.nickname || highestAprCard?.name || "the highest APR card"} today, then leave the protected ${currency(operatingFloor)} floor untouched until the next payday.`
    : `Move ${currency(primaryActionAmount)} from Checking to Vanguard Brokerage today, then leave the protected ${currency(operatingFloor)} floor untouched until the next payday.`;

  const spendingTotal = Object.values(budgetActuals).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const spendingDelta = Math.max(0, weeklyAllowance - spendingTotal);
  const radar = renewals.map((renewal) => ({
    item: renewal.name,
    amount: currency(renewal.amount),
    date: renewal.nextDue,
  }));
  const annualFeeCard = cards.find((card) => Number(card?.annualFee) > 0) || null;
  const longRangeRadar = [
    {
      item: `${savingsGoals?.[0]?.name || "Savings Goal"} Goal`,
      amount: currency(savingsGoals?.[0]?.targetAmount || 0),
      date: savingsGoals?.[0]?.targetDate || todayStr,
    },
    {
      item: `${savingsGoals?.[1]?.name || "Savings Goal"} Goal`,
      amount: currency(savingsGoals?.[1]?.targetAmount || 0),
      date: savingsGoals?.[1]?.targetDate || todayStr,
    },
  ];
  if (annualFeeCard) {
    longRangeRadar.push({
      item: `${annualFeeCard.nickname || annualFeeCard.name} Annual Fee`,
      amount: currency(annualFeeCard.annualFee),
      date: annualFeeCard.annualFeeDue || todayStr,
    });
  }
  const paceData = [
    ...(savingsGoals || []).slice(0, 2).map((goal) => ({
      name: goal.name,
      saved: goal.currentAmount,
      target: goal.targetAmount,
    })),
    {
      name: "Roth IRA",
      saved: Number(scenario?.financialConfig?.rothContributedYTD) || 0,
      target: Number(scenario?.financialConfig?.rothAnnualLimit) || 7000,
    },
    {
      name: "401(k)",
      saved: Number(scenario?.financialConfig?.k401ContributedYTD) || 0,
      target: Number(scenario?.financialConfig?.k401AnnualLimit) || 23000,
    },
  ].filter((item) => Number(item.target) > 0);

  return {
    headerCard: {
      status: auditStatus,
      details: hasDebt
        ? [
          `Checking still clears the protected floor by ${currency(operationalSurplus)}, so Catalyst can direct real surplus to payoff instead of guessing.`,
          `Emergency reserves are ${emergencyPct}% of target and card utilization is ${utilizationPct}%, which makes this a stabilization-and-paydown moment instead of an investing sprint.`,
        ]
        : [
          `Checking clears the protected floor by ${currency(operationalSurplus)} and there are no revolving balances dragging the week.`,
          `Emergency reserves are ${emergencyPct}% of target, utilization is 0%, and the investing gate is fully open.`,
        ],
    },
    healthScore: {
      score: nativeScore,
      grade: getGradeLetter(nativeScore),
      trend: "up",
      summary:
        hasDebt
          ? `${scenario?.scenarioMeta?.name || "Demo"} shows Catalyst's debt playbook clearly: protect cash first, then turn open capacity into steady payoff progress.`
          : `${scenario?.scenarioMeta?.name || "Demo"} shows Catalyst at its best: protect the floor, keep reserves above target, and let true surplus compound instead of leaking away.`,
      narrative:
        hasDebt
          ? `${getScenarioHouseholdLabel(scenario)} is carrying ${currency(debtTotal)} of revolving debt, but it still has a protected floor of ${currency(operatingFloor)} and ${currency(emergencyCurrent)} in reserve cash. That leaves ${currency(operationalSurplus)} of real weekly payoff capacity Catalyst can send to the highest APR balance without creating new cash stress.`
          : `${getScenarioHouseholdLabel(scenario)} is running with a protected floor of ${currency(operatingFloor)}, an emergency reserve of ${currency(emergencyCurrent)}, and no revolving debt. That leaves ${currency(operationalSurplus)} of real weekly capacity that Catalyst can direct into long-term investing without creating cash stress.`,
    },
    alertsCard: hasDebt
      ? [
        `Protected floor still leaves ${currency(operationalSurplus)} available for payoff this week`,
        `Emergency reserve is ${emergencyPct}% of target`,
        `${utilizationPct}% credit utilization across the wallet`,
        `${highestAprCard?.nickname || highestAprCard?.name || "Highest APR card"} is the first payoff target`,
        "Pause optional investing until the revolving balances are back under control",
      ]
      : [
        `Protected floor fully covered with ${currency(operationalSurplus)} still open above it`,
        `Emergency reserve is ${emergencyPct}% of target`,
        "0% credit utilization across the wallet",
        "Investing gate is open because there are no near-term cash protection gaps",
        "Spending is running below the weekly allowance",
      ],
    dashboardCard: [
      { category: "Checking", amount: currency(checkingBalance), status: "Above floor" },
      { category: "Vault", amount: currency(vaultBalance), status: hasDebt ? (emergencyCurrent >= emergencyTarget ? "On guard" : "Rebuild") : "Over target" },
      { category: "Investments", amount: currency(investmentTotal), status: hasDebt ? "Guarded" : "Gate open" },
      { category: "Other Assets", amount: currency(otherAssetsTotal), status: "Home + auto equity" },
      { category: "Pending", amount: currency(pendingTotal), status: "2 authorizations" },
      { category: "Debts", amount: currency(debtTotal), status: hasDebt ? "Pay down" : "No revolving balances" },
      { category: "Available", amount: currency(operationalSurplus), status: "Deployable surplus" },
    ],
    netWorth,
    netWorthDelta: netWorthDeltaLabel,
    weeklyMoves: [
      {
        title: primaryActionTitle,
        detail: primaryActionDetail,
        amount: currency(primaryActionAmount),
        priority: "required",
        semanticKind: hasDebt ? "debt-paydown" : "investment-contribution",
        sourceLabel: "Checking",
        targetLabel: hasDebt ? (highestAprCard?.nickname || highestAprCard?.name || "Highest APR Card") : "Vanguard Brokerage",
        transactional: true,
      },
      {
        title: hasDebt ? "Keep minimums on autopay" : "Raise the next Roth contribution",
        detail: hasDebt
          ? `Keep minimum payments active on every card, but direct all extra cash to ${highestAprCard?.nickname || highestAprCard?.name || "the highest APR card"} until the utilization trend breaks lower.`
          : `Schedule a ${currency(rothTarget)} Roth IRA contribution for ${nextPayday} so the annual limit stays on pace without touching the reserve.`,
        amount: hasDebt ? currency(0) : currency(rothTarget),
        priority: "recommended",
        semanticKind: hasDebt ? "payment-discipline" : "investment-contribution",
        sourceLabel: hasDebt ? "Autopay" : "Checking",
        targetLabel: hasDebt ? "All cards" : "Roth IRA",
        transactional: !hasDebt,
      },
      {
        title: "Keep the operating floor intact",
        detail: `Leave ${currency(operatingFloor)} in Checking as the non-negotiable operating floor before making extra transfers or optional spending moves.`,
        amount: currency(operatingFloor),
        priority: "required",
        semanticKind: "spending-hold",
        sourceLabel: "Checking",
        targetLabel: "Operating Floor",
        transactional: false,
      },
    ],
    moveItems: [
      {
        title: primaryActionTitle,
        detail: primaryActionDetail,
        amount: primaryActionAmount,
        semanticKind: hasDebt ? "debt-paydown" : "investment-contribution",
        sourceLabel: "Checking",
        targetLabel: hasDebt ? (highestAprCard?.nickname || highestAprCard?.name || "Highest APR Card") : "Vanguard Brokerage",
        transactional: true,
      },
      {
        title: hasDebt ? "Keep minimums on autopay" : "Raise the next Roth contribution",
        detail: hasDebt
          ? `Keep minimum payments active on every card, but direct all extra cash to ${highestAprCard?.nickname || highestAprCard?.name || "the highest APR card"} until the utilization trend breaks lower.`
          : `Schedule a ${currency(rothTarget)} Roth IRA contribution for ${nextPayday} so the annual limit stays on pace without touching the reserve.`,
        amount: hasDebt ? 0 : rothTarget,
        semanticKind: hasDebt ? "payment-discipline" : "investment-contribution",
        sourceLabel: hasDebt ? "Autopay" : "Checking",
        targetLabel: hasDebt ? "All cards" : "Roth IRA",
        transactional: !hasDebt,
      },
      {
        title: "Keep the operating floor intact",
        detail: `Leave ${currency(operatingFloor)} in Checking as the non-negotiable operating floor before making extra transfers or optional spending moves.`,
        amount: operatingFloor,
        semanticKind: "spending-hold",
        sourceLabel: "Checking",
        targetLabel: "Operating Floor",
        transactional: false,
      },
    ].filter((item) => item.amount > 0 || item.semanticKind === "spending-hold"),
    radar,
    longRangeRadar,
    milestones: [
      hasDebt ? "Starter emergency cushion is already in place" : "Emergency reserve cleared the target and stays over 6 months of cushion",
      hasDebt ? "Revolving balances are trending down week over week" : "No revolving card debt across the wallet",
      "401(k) contributions are ahead of annual pace",
      "Net worth has climbed for 6 straight audits",
    ],
    investments: {
      balance: currency(investmentTotal),
      asOf: todayStr,
      gateStatus: hasDebt ? "Guarded — finish the payoff sprint before extra investing" : "Open — surplus can keep compounding",
    },
    nextAction: {
      title: primaryActionTitle,
      detail: nextActionDetail,
      amount: currency(primaryActionAmount),
    },
    spendingAnalysis: {
      totalSpent: currency(spendingTotal),
      dailyAverage: currency(spendingTotal / 7),
      vsAllowance: `UNDER by ${currency(spendingDelta)}`,
      topCategories: [
        { category: "Groceries", amount: currency(budgetActuals.Groceries), pctOfTotal: "39%" },
        { category: "Shopping", amount: currency(budgetActuals.Shopping), pctOfTotal: "19%" },
        { category: "Dining", amount: currency(budgetActuals.Dining), pctOfTotal: "17%" },
        { category: "Transport", amount: currency(budgetActuals.Transport), pctOfTotal: "13%" },
        { category: "Entertainment", amount: currency(budgetActuals.Entertainment), pctOfTotal: "12%" },
      ],
      alerts: [hasDebt ? "Spending is below the weekly allowance, which creates real payoff room without undercutting the floor." : "Spending is below the weekly allowance, so surplus can keep flowing to wealth building."],
      debtImpact: hasDebt
        ? `${currency(debtTotal)} of revolving debt is the main drag right now, so Catalyst is treating payoff as the highest-return move.`
        : "Debt-free and 0% utilization keep the credit profile clean while surplus compounds.",
    },
    paceData,
  };
}

function buildSyntheticHistoryAudit({ dateStr, score, checking, ally, investments, otherAssets, netWorth, spent, debt = 0 }) {
  const raw = JSON.stringify({
    headerCard: {
      status: debt > 0 ? "YELLOW" : score >= 95 ? "GREEN" : "YELLOW",
      details: ["Reserves stayed protected and cash pressure remained low."],
    },
    healthScore: {
      score,
      grade: getGradeLetter(score),
      trend: "up",
      summary: "Cash, reserve, and investing posture improved steadily.",
    },
    dashboardCard: [
      { category: "Checking", amount: currency(checking), status: "Tracked" },
      { category: "Vault", amount: currency(ally), status: "Tracked" },
      { category: "Investments", amount: currency(investments), status: "Growing" },
      { category: "Other Assets", amount: currency(otherAssets), status: "Stable" },
      { category: "Debts", amount: currency(debt), status: debt > 0 ? "Improving" : "Clear" },
    ],
    netWorth,
    weeklyMoves: [
      {
        title: debt > 0 ? "Keep payoff momentum" : "Keep surplus invested",
        detail: debt > 0 ? "Keep protecting the floor, then direct extra cash to the highest APR card." : "Continue routing surplus toward long-term accounts after the floor is protected.",
        amount: currency(1800),
      },
    ],
    nextAction: {
      title: debt > 0 ? "Stay on the payoff plan" : "Stay on plan",
      detail: debt > 0 ? "Protect the floor, then keep sending extra cash to the highest APR card." : "Protect the floor, then keep sending extra cash to long-term investing.",
      amount: currency(1800),
    },
    alertsCard: debt > 0 ? ["No acute cash pressure.", "Debt balances are trending down."] : ["No acute cash pressure.", "No revolving debt."],
    radar: [],
    longRangeRadar: [],
    milestones: [],
    investments: { balance: currency(investments), asOf: dateStr, gateStatus: "Open" },
  });

  return {
    ts: `${dateStr}T12:00:00.000Z`,
    date: dateStr,
    raw,
    parsed: parseAudit(raw),
    isDemoHistory: true,
    moveChecks: {},
    form: {
      date: dateStr,
      checking: String(checking),
      ally: String(ally),
      budgetActuals: {
        Groceries: String(Math.round(spent * 0.38)),
        Dining: String(Math.round(spent * 0.17)),
        Transport: String(Math.round(spent * 0.13)),
        Shopping: String(Math.round(spent * 0.19)),
        Entertainment: String(Math.round(spent * 0.13)),
      },
      debts: debt > 0 ? [{ name: "Credit Cards", balance: String(debt) }] : [],
    },
  };
}

function buildSyntheticWeeks(scenario, currentScore) {
  const currentChecking = Number(scenario.form?.checking || 0);
  const currentVault = Number(scenario.form?.savings || scenario.form?.ally || 0);
  const currentDebt = (scenario.form?.debts || []).reduce((sum, debt) => sum + (Number(debt?.balance) || 0), 0);
  const spendingTotal = Object.values(scenario.budgetActuals || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const multipliers = [0.84, 0.88, 0.91, 0.95, 0.98, 0.995];
  const scoreStart = Math.max(currentDebt > 0 ? 78 : 92, Math.min(currentScore - 5, currentDebt > 0 ? 92 : 97));
  return multipliers.map((multiplier, index) => {
    const otherAssetMultiplier = 0.98 + (index * 0.004);
    const score = Math.min(currentDebt > 0 ? 94 : 99, scoreStart + index);
    const checking = Math.round(currentChecking * multiplier);
    const ally = Math.round(currentVault * multiplier);
    const investments = Math.round(scenario.investmentTotal * multiplier);
    const otherAssets = Math.round(scenario.otherAssetsTotal * otherAssetMultiplier);
    const debtMultiplier = 1.22 - (index * 0.045);
    const debt = Math.max(0, Math.round(currentDebt * debtMultiplier));
    return {
      weeksAgo: 6 - index,
      checking,
      ally,
      investments,
      otherAssets,
      debt,
      netWorth: checking + ally + investments + otherAssets - debt,
      score,
      spent: Math.max(0, Math.round(spendingTotal * (1.12 - (index * 0.03)))),
    };
  });
}

export function getDemoAuditPayload(prevConfig = {}, existingHistory = [], scenarioId = getDefaultDemoScenarioId()) {
  const scenario = buildDemoScenario(new Date(), scenarioId);
  const demoCards = scenario.cards;
  const demoBankAccounts = scenario.bankAccounts;
  const demoRenewals = scenario.renewals;

  const demoConfig = {
    ...prevConfig,
    ...scenario.financialConfig,
    plaidInvestments: scenario.financialConfig?.plaidInvestments || [],
    excludedInvestmentSourceIds: scenario.financialConfig?.excludedInvestmentSourceIds || [],
    _preDemoSnapshot: prevConfig._preDemoSnapshot || { ...prevConfig },
    isDemoConfig: true,
  };

  const computedStrategy = generateStrategy(demoConfig, {
    checkingBalance: Number(scenario.form?.checking || 0),
    savingsTotal: Number(scenario.form?.savings || scenario.form?.ally || 0),
    cards: demoCards,
    nonCardDebts: demoConfig.nonCardDebts || [],
    renewals: demoRenewals,
    snapshotDate: scenario.form?.date,
  });
  const syntheticWeeks = buildSyntheticWeeks(
    scenario,
    computedStrategy?.auditSignals?.nativeScore?.score ?? 100
  );
  const lastSyntheticWeek = syntheticWeeks[syntheticWeeks.length - 1];
  const netWorthDeltaLabel = `${scenario.netWorth >= (lastSyntheticWeek?.netWorth || 0) ? "+" : ""}${currency(scenario.netWorth - (lastSyntheticWeek?.netWorth || 0))} vs last audit`;

  const raw = JSON.stringify(
    buildCurrentDemoAuditJson({
      scenario,
      todayStr: scenario.todayStr,
      checkingBalance: Number(scenario.form?.checking || 0),
      vaultBalance: Number(scenario.form?.savings || scenario.form?.ally || 0),
      investmentTotal: scenario.investmentTotal,
      otherAssetsTotal: scenario.otherAssetsTotal,
      pendingTotal: scenario.pendingTotal,
      netWorth: scenario.netWorth,
      netWorthDeltaLabel,
      renewals: demoRenewals,
      savingsGoals: scenario.financialConfig?.savingsGoals,
      cards: demoCards,
      budgetActuals: scenario.budgetActuals,
      computedStrategy,
    })
  );

  const parsed = validateParsedAuditConsistency(
    parseAudit(raw),
    buildValidationOptions({
      form: scenario.form,
      renewals: demoRenewals,
      cards: demoCards,
      financialConfig: demoConfig,
      computedStrategy,
      investmentTotal: scenario.investmentTotal,
      netWorth: scenario.netWorth,
      pendingTotal: scenario.pendingTotal,
      personalRules: scenario.personalRules,
    })
  );

  const demoPortfolio = { bankAccounts: demoBankAccounts, cards: demoCards, renewals: demoRenewals };

  const syntheticHistory = syntheticWeeks.map((entry) => {
    const date = new Date(scenario.today);
    date.setDate(date.getDate() - entry.weeksAgo * 7);
    return buildSyntheticHistoryAudit({
      dateStr: date.toISOString().split("T")[0],
      ...entry,
    });
  });

  const audit = {
    ts: scenario.today.toISOString(),
    date: scenario.todayStr,
    raw,
    parsed,
    isTest: true,
    demoScenarioId: scenario.scenarioId,
    demoScenarioName: scenario.scenarioMeta?.name,
    moveChecks: {},
    demoPortfolio,
    form: {
      ...scenario.form,
      budgetActuals: scenario.budgetActuals,
      debts: scenario.form?.debts || [],
    },
  };

  const existingRealAudits = existingHistory.filter((auditEntry) => !auditEntry.isTest && !auditEntry.isDemoHistory);
  const nh = [audit, ...syntheticHistory, ...existingRealAudits].slice(0, 52);

  return {
    audit,
    nh,
    demoConfig,
    demoCards,
    demoBankAccounts,
    demoRenewals,
    demoScenarioMeta: scenario.scenarioMeta,
  };
}
