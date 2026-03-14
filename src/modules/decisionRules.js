function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPercent(value) {
  return `${Math.round(value * 10) / 10}%`;
}

function formatMoney(value) {
  return `$${toNumber(value).toFixed(2)}`;
}

function estimateMonthlyNetIncome(financialConfig = {}) {
  if (!financialConfig || typeof financialConfig !== "object") return 0;

  if (financialConfig.incomeType === "hourly") {
    return toNumber(financialConfig.hourlyRateNet) * toNumber(financialConfig.typicalHours) * 4.33;
  }
  if (financialConfig.incomeType === "variable") {
    return toNumber(financialConfig.averagePaycheck) * 4.33;
  }

  const payFrequency = financialConfig.payFrequency || "bi-weekly";
  const paycheck = toNumber(financialConfig.paycheckStandard);
  if (payFrequency === "weekly") return paycheck * 4.33;
  if (payFrequency === "semi-monthly") return paycheck * 2;
  if (payFrequency === "monthly") return paycheck;
  return paycheck * 2.16;
}

function estimateMonthlyRenewalLoad(renewals = []) {
  if (!Array.isArray(renewals)) return 0;

  return renewals.reduce((sum, renewal) => {
    const amount = toNumber(renewal?.amount);
    const interval = Math.max(1, toNumber(renewal?.interval) || 1);
    const unit = String(renewal?.intervalUnit || "months").toLowerCase();
    if (amount <= 0) return sum;

    if (unit === "years" || unit === "yearly" || unit === "annual") return sum + amount / (12 * interval);
    if (unit === "quarters" || unit === "quarterly") return sum + amount / (3 * interval);
    if (unit === "weeks" || unit === "week") return sum + amount * (4.33 / interval);
    if (unit === "bi-weekly" || unit === "biweekly" || unit === "fortnights" || unit === "fortnight") {
      return sum + amount * (2.16 / interval);
    }
    if (unit === "semi-monthly" || unit === "semimonthly") return sum + amount * (2 / interval);
    if (unit === "days" || unit === "day") return sum + amount * (30.4 / interval);
    if (unit === "one-time" || unit === "onetime") return sum;
    return sum + amount / interval;
  }, 0);
}

function estimateLiquidCash(financialState = {}) {
  const form = financialState?.current?.form || {};
  const parsed = financialState?.current?.parsed || {};
  const financialConfig = financialState?.financialConfig || {};
  const computedStrategy = financialState?.computedStrategy || {};
  const emergencyFundCurrent = toNumber(computedStrategy?.auditSignals?.emergencyFund?.current);
  if (emergencyFundCurrent > 0) return emergencyFundCurrent;

  const checking = toNumber(form?.checking ?? financialConfig?.checkingBalance);
  const savings = toNumber(form?.savings ?? form?.ally ?? financialConfig?.vaultBalance);
  const liquidNetWorth = toNumber(parsed?.liquidNetWorth);
  return Math.max(liquidNetWorth, checking + savings);
}

function extractSpendingAllowanceDelta(spendingAnalysis = {}) {
  const raw = String(spendingAnalysis?.vsAllowance || "").trim();
  if (!raw) return 0;
  const match = raw.match(/\$[\d,]+(?:\.\d{1,2})?/);
  const amount = match ? toNumber(String(match[0]).replace(/[$,]/g, "")) : 0;
  if (!amount) return 0;
  if (/\b(over|above|exceeded|past)\b/i.test(raw)) return amount;
  if (/\b(under|below|remaining|left)\b/i.test(raw)) return -amount;
  return 0;
}

function collectDebtEntries(financialState = {}) {
  const financialConfig = financialState.financialConfig || {};
  const cards = Array.isArray(financialState.cards) ? financialState.cards : [];
  const cardDebts = Array.isArray(financialConfig.cardDebts) ? financialConfig.cardDebts : [];
  const nonCardDebts = Array.isArray(financialConfig.nonCardDebts) ? financialConfig.nonCardDebts : [];

  const cardEntries = cards.map(card => ({
    name: card?.name || card?.nickname || "Card",
    apr: toNumber(card?.apr),
    balance: toNumber(card?.balance),
    minimum: toNumber(card?.minPayment ?? card?.minimum),
  }));
  const cardNames = new Set(cardEntries.map(entry => String(entry.name).trim().toLowerCase()).filter(Boolean));

  const snapshotCardEntries = cardDebts.map(debt => ({
    name: debt?.name || "Card Debt",
    apr: toNumber(debt?.apr),
    balance: toNumber(debt?.balance),
    minimum: toNumber(debt?.minPayment ?? debt?.minimum),
  })).filter(debt => !cardNames.has(String(debt.name).trim().toLowerCase()));

  const otherDebtEntries = nonCardDebts.map(debt => ({
    name: debt?.name || "Debt",
    apr: toNumber(debt?.apr),
    balance: toNumber(debt?.balance),
    minimum: toNumber(debt?.minPayment ?? debt?.minimum),
  }));

  return [...cardEntries, ...snapshotCardEntries, ...otherDebtEntries].filter(
    debt => debt.balance > 0 || debt.minimum > 0 || debt.apr > 0
  );
}

function buildRecommendation(flag, active, severity, rationale, recommendation) {
  return {
    flag,
    active,
    severity,
    rationale,
    recommendation,
  };
}

export function detectToxicDebtTriage(financialState = {}) {
  const toxicDebts = collectDebtEntries(financialState).filter(debt => debt.apr > 36 && debt.balance > 0);

  if (!toxicDebts.length) {
    return buildRecommendation(
      "toxic-debt-triage",
      false,
      "none",
      "No active debt above the 36% APR toxic threshold was detected.",
      "You can keep prioritizing your standard debt plan."
    );
  }

  const leadDebt = toxicDebts[0];
  return buildRecommendation(
    "toxic-debt-triage",
    true,
    "high",
    `${leadDebt.name} is carrying ${formatMoney(leadDebt.balance)} at ${formatPercent(leadDebt.apr)}, which is above the 36% toxic-debt threshold.`,
    "Consider pausing lower-priority goals temporarily and direct available cash toward eliminating this toxic APR balance first."
  );
}

export function detectCreditUtilizationSpike(financialState = {}) {
  const cards = Array.isArray(financialState.cards) ? financialState.cards : [];
  const spikingCards = cards
    .map(card => {
      const limit = toNumber(card?.limit);
      const balance = toNumber(card?.balance);
      const utilizationPct = limit > 0 ? (balance / limit) * 100 : 0;
      return {
        name: card?.name || card?.nickname || "Card",
        balance,
        limit,
        utilizationPct,
      };
    })
    .filter(card => card.limit > 0 && card.utilizationPct > 85);

  if (!spikingCards.length) {
    return buildRecommendation(
      "credit-utilization-spike",
      false,
      "none",
      "No card is currently above the 85% utilization spike threshold.",
      "Standard debt sequencing can stay in place."
    );
  }

  const leadCard = spikingCards.sort((a, b) => b.utilizationPct - a.utilizationPct)[0];
  return buildRecommendation(
    "credit-utilization-spike",
    true,
    "high",
    `${leadCard.name} is reporting ${formatPercent(leadCard.utilizationPct)} utilization on ${formatMoney(leadCard.balance)} of ${formatMoney(leadCard.limit)} available credit.`,
    "Consider paying this balance down below 30% utilization before resuming the normal debt order to reduce acute score pressure."
  );
}

export function detectInsolvencyRisk(financialState = {}) {
  const monthlyNetIncome = estimateMonthlyNetIncome(financialState.financialConfig);
  const totalMinimumPayments = collectDebtEntries(financialState).reduce((sum, debt) => sum + debt.minimum, 0);
  const ratioPct = monthlyNetIncome > 0 ? (totalMinimumPayments / monthlyNetIncome) * 100 : null;

  if (!ratioPct || ratioPct <= 50) {
    return buildRecommendation(
      "insolvency-risk",
      false,
      "none",
      ratioPct == null
        ? "Monthly net income is unavailable, so the insolvency threshold is not triggered from minimum-payment load alone."
        : `Debt minimums are ${formatPercent(ratioPct)} of monthly net income, below the 50% insolvency-risk threshold.`,
      "Standard cash-flow planning is still viable."
    );
  }

  return buildRecommendation(
    "insolvency-risk",
    true,
    "high",
    `Debt minimums total ${formatMoney(totalMinimumPayments)} per month against estimated monthly net income of ${formatMoney(monthlyNetIncome)} (${formatPercent(ratioPct)}).`,
    "This load may warrant urgent fallback options such as hardship programs, debt management plans, or restructuring alongside core budgeting."
  );
}

export function detectFreelancerTaxReserveWarning(financialState = {}) {
  const financialConfig = financialState.financialConfig || {};
  const isFreelancer = Boolean(financialConfig.isContractor) || financialConfig.incomeType === "variable";

  if (!isFreelancer) {
    return buildRecommendation(
      "freelancer-tax-reserve-warning",
      false,
      "none",
      "No contractor or variable-income tax reserve warning is active.",
      "Tax reserve guidance can follow the user’s normal withholding setup."
    );
  }

  return buildRecommendation(
    "freelancer-tax-reserve-warning",
    true,
    "medium",
    "Variable or contractor income is active, which raises the risk of treating pre-tax cash as spendable surplus.",
    "Consider reserving roughly 25-30% of gross freelance income for taxes before treating the remainder as available for debt payoff or savings."
  );
}

export function detectSpendingAllowancePressure(financialState = {}) {
  const spendingAnalysis = financialState?.current?.parsed?.spendingAnalysis;
  const allowanceDelta = extractSpendingAllowanceDelta(spendingAnalysis);
  const alerts = Array.isArray(spendingAnalysis?.alerts) ? spendingAnalysis.alerts : [];
  const alertHit = alerts.find(alert => /\b(over|overspend|budget|allowance|leak)\b/i.test(String(alert || "")));

  if (allowanceDelta <= 0 && !alertHit) {
    return buildRecommendation(
      "spending-allowance-pressure",
      false,
      "none",
      "Current spending data does not show an allowance overrun signal.",
      "You can keep using the existing weekly spending plan unless new transactions change the trend."
    );
  }

  return buildRecommendation(
    "spending-allowance-pressure",
    true,
    allowanceDelta >= 100 ? "high" : "medium",
    allowanceDelta > 0
      ? `Current spending is running about ${formatMoney(allowanceDelta)} over the modeled allowance.`
      : `Spending alerts indicate pressure against the current allowance plan: ${String(alertHit || "").trim()}.`,
    "Consider tightening discretionary spending until the allowance gap closes and the weekly plan is back inside bounds."
  );
}

export function detectEmergencyReserveGap(financialState = {}) {
  const financialConfig = financialState?.financialConfig || {};
  const computedStrategy = financialState?.computedStrategy || {};
  const target = Math.max(
    toNumber(computedStrategy?.auditSignals?.emergencyFund?.target),
    toNumber(financialConfig?.emergencyReserveTarget)
  );
  const currentReserve = estimateLiquidCash(financialState);
  const coverageWeeks = toNumber(computedStrategy?.auditSignals?.emergencyFund?.coverageWeeks);
  const fundedPct = target > 0 ? (currentReserve / target) * 100 : 0;

  if (target <= 0 || (fundedPct >= 100 && (!coverageWeeks || coverageWeeks >= 6))) {
    return buildRecommendation(
      "emergency-reserve-gap",
      false,
      "none",
      "Emergency reserve coverage appears to be at or above the current target.",
      "You can keep maintaining the reserve while focusing on the next priority."
    );
  }

  const severity = fundedPct < 50 || (coverageWeeks > 0 && coverageWeeks < 4) ? "high" : "medium";
  return buildRecommendation(
    "emergency-reserve-gap",
    true,
    severity,
    `Emergency reserves are about ${formatMoney(currentReserve)} against a target of ${formatMoney(target)} (${Math.round(fundedPct)}% funded${coverageWeeks ? `, ${Math.round(coverageWeeks * 10) / 10} weeks of coverage` : ""}).`,
    "Consider rebuilding cash reserves before treating surplus as fully available for optional spending or long-range investing."
  );
}

export function detectFixedCostTrap(financialState = {}) {
  const financialConfig = financialState?.financialConfig || {};
  const monthlyNetIncome = estimateMonthlyNetIncome(financialConfig);
  const housingCost = Math.max(toNumber(financialConfig?.monthlyRent), toNumber(financialConfig?.mortgagePayment));
  const debtMinimums = collectDebtEntries(financialState).reduce((sum, debt) => sum + debt.minimum, 0);
  const renewalLoad = estimateMonthlyRenewalLoad(financialState?.renewals);
  const fixedCosts = housingCost + debtMinimums + renewalLoad;
  const ratioPct = monthlyNetIncome > 0 ? (fixedCosts / monthlyNetIncome) * 100 : null;

  if (!ratioPct || ratioPct <= 60) {
    return buildRecommendation(
      "fixed-cost-trap",
      false,
      "none",
      ratioPct == null
        ? "Monthly net income is unavailable, so a fixed-cost trap cannot be confirmed."
        : `Modeled fixed costs are ${formatPercent(ratioPct)} of monthly net income, below the 60% trap threshold.`,
      "Cash-flow pressure does not currently look dominated by structural fixed costs."
    );
  }

  return buildRecommendation(
    "fixed-cost-trap",
    true,
    ratioPct >= 75 ? "high" : "medium",
    `Housing, minimum debt payments, and recurring bills total about ${formatMoney(fixedCosts)} per month against estimated monthly net income of ${formatMoney(monthlyNetIncome)} (${formatPercent(ratioPct)}).`,
    "Structural cost cuts are likely to matter more than small budget tweaks until fixed costs fall back under control."
  );
}

export function detectLowAprArbitrageOpportunity(financialState = {}) {
  const financialConfig = financialState?.financialConfig || {};
  const computedStrategy = financialState?.computedStrategy || {};
  const debtEntries = collectDebtEntries(financialState);
  const arbitrageTargetApr = Math.max(7, toNumber(financialConfig?.arbitrageTargetAPR) || 0);
  const operationalSurplus = toNumber(financialState?.computedStrategy?.operationalSurplus);
  const emergencyTarget = Math.max(
    toNumber(computedStrategy?.auditSignals?.emergencyFund?.target),
    toNumber(financialConfig?.emergencyReserveTarget)
  );
  const emergencyCurrent = estimateLiquidCash(financialState);
  const toxicDebtActive = debtEntries.some(debt => debt.apr > 25 && debt.balance > 0);
  const candidate = debtEntries
    .filter(debt => debt.balance > 0 && debt.apr > 0 && debt.apr <= arbitrageTargetApr)
    .sort((a, b) => a.apr - b.apr)[0];

  if (!candidate || toxicDebtActive || operationalSurplus <= 0 || (emergencyTarget > 0 && emergencyCurrent < emergencyTarget * 0.75)) {
    return buildRecommendation(
      "low-apr-arbitrage-opportunity",
      false,
      "none",
      "No low-APR debt arbitrage opportunity is currently strong enough to outrank liquidity or high-interest debt priorities.",
      "Standard debt sequencing or reserve-building remains the cleaner path right now."
    );
  }

  return buildRecommendation(
    "low-apr-arbitrage-opportunity",
    true,
    "medium",
    `${candidate.name} is carrying ${formatMoney(candidate.balance)} at ${formatPercent(candidate.apr)}, below the modeled debt-vs-invest threshold of ${formatPercent(arbitrageTargetApr)}.`,
    "Consider comparing minimum-payment-only payoff on this balance against deploying some surplus into tax-advantaged investing after core liquidity needs are covered."
  );
}

export function evaluateChatDecisionRules(financialState = {}) {
  return [
    detectToxicDebtTriage(financialState),
    detectCreditUtilizationSpike(financialState),
    detectInsolvencyRisk(financialState),
    detectFreelancerTaxReserveWarning(financialState),
    detectSpendingAllowancePressure(financialState),
    detectEmergencyReserveGap(financialState),
    detectFixedCostTrap(financialState),
    detectLowAprArbitrageOpportunity(financialState),
  ];
}
