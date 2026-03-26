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

function parseIsoDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getMonthlyPayPeriods(payFrequency) {
  const normalized = String(payFrequency || "bi-weekly").trim().toLowerCase();
  if (normalized === "weekly") return 52 / 12;
  if (
    normalized === "bi-weekly" ||
    normalized === "biweekly" ||
    normalized === "every-2-weeks" ||
    normalized === "every 2 weeks"
  ) {
    return 26 / 12;
  }
  if (
    normalized === "semi-monthly" ||
    normalized === "semimonthly" ||
    normalized === "twice-monthly" ||
    normalized === "twice monthly"
  ) {
    return 2;
  }
  if (normalized === "monthly") return 1;
  return 26 / 12;
}

function estimateMonthlySalaryIncome(financialConfig = {}) {
  const standardPaycheck = toNumber(financialConfig.paycheckStandard);
  const firstOfMonthPaycheck = toNumber(financialConfig.paycheckFirstOfMonth);
  const hasSplitPaycheck = firstOfMonthPaycheck > 0;
  const normalized = String(financialConfig.payFrequency || "bi-weekly").trim().toLowerCase();

  if (!hasSplitPaycheck) {
    return standardPaycheck * getMonthlyPayPeriods(normalized);
  }

  if (normalized === "weekly") {
    return ((firstOfMonthPaycheck * 12) + (standardPaycheck * 40)) / 12;
  }
  if (
    normalized === "bi-weekly" ||
    normalized === "biweekly" ||
    normalized === "every-2-weeks" ||
    normalized === "every 2 weeks"
  ) {
    return ((firstOfMonthPaycheck * 12) + (standardPaycheck * 14)) / 12;
  }
  if (
    normalized === "semi-monthly" ||
    normalized === "semimonthly" ||
    normalized === "twice-monthly" ||
    normalized === "twice monthly"
  ) {
    return firstOfMonthPaycheck + standardPaycheck;
  }
  if (normalized === "monthly") {
    return firstOfMonthPaycheck;
  }

  return ((firstOfMonthPaycheck * 12) + (standardPaycheck * 14)) / 12;
}

function estimateMonthlyNetIncome(financialConfig = {}) {
  if (!financialConfig || typeof financialConfig !== "object") return 0;
  const monthlyPayPeriods = getMonthlyPayPeriods(financialConfig.payFrequency);

  if (financialConfig.incomeType === "hourly") {
    return toNumber(financialConfig.hourlyRateNet) * toNumber(financialConfig.typicalHours) * monthlyPayPeriods;
  }
  if (financialConfig.incomeType === "variable") {
    return toNumber(financialConfig.averagePaycheck) * monthlyPayPeriods;
  }

  return estimateMonthlySalaryIncome(financialConfig);
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

function estimateMonthlyStructuralCosts(financialState = {}) {
  const financialConfig = financialState?.financialConfig || {};
  const housingCost = Math.max(toNumber(financialConfig?.monthlyRent), toNumber(financialConfig?.mortgagePayment));
  const renewalLoad = estimateMonthlyRenewalLoad(financialState?.renewals);
  const debtMinimums = collectDebtEntries(financialState).reduce((sum, debt) => sum + debt.minimum, 0);
  const weeklySpendingBaseline = Math.max(0, toNumber(financialConfig?.weeklySpendAllowance)) * (52 / 12);

  return {
    housingCost,
    renewalLoad,
    debtMinimums,
    weeklySpendingBaseline,
    fixedCosts: housingCost + renewalLoad + debtMinimums,
    structuralRequiredCosts: housingCost + renewalLoad + debtMinimums + weeklySpendingBaseline,
  };
}

function estimateLiquidCash(financialState = {}) {
  const form = financialState?.current?.form || {};
  const financialConfig = financialState?.financialConfig || {};
  const computedStrategy = financialState?.computedStrategy || {};
  const emergencyFundCurrent = toNumber(computedStrategy?.auditSignals?.emergencyFund?.current);
  if (emergencyFundCurrent > 0) return emergencyFundCurrent;

  const checking = toNumber(form?.checking ?? financialConfig?.checkingBalance);
  const savings = toNumber(form?.savings ?? form?.ally ?? financialConfig?.vaultBalance);
  return Math.max(0, checking + savings);
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

  const classifyDebtKind = (name) => {
    const text = String(name || "").trim().toLowerCase();
    if (!text) return "other";
    if (/\b(federal|student loan|student)\b/.test(text)) return "student-loan";
    if (/\b(auto|car loan|vehicle)\b/.test(text)) return "auto-loan";
    if (/\b(mortgage|heloc|home equity)\b/.test(text)) return "mortgage";
    if (/\b(personal loan|installment)\b/.test(text)) return "personal-loan";
    if (/\b(medical)\b/.test(text)) return "medical";
    if (/\b(tax|irs|state tax)\b/.test(text)) return "tax";
    return "other";
  };

  const cardEntries = cards.map(card => ({
    kind: "card",
    name: card?.name || card?.nickname || "Card",
    apr: toNumber(card?.apr),
    balance: toNumber(card?.balance),
    minimum: toNumber(card?.minPayment ?? card?.minimum),
    limit: toNumber(card?.limit),
    hasPromoApr: Boolean(card?.hasPromoApr),
    promoAprExp: card?.promoAprExp || null,
  }));
  const cardNames = new Set(cardEntries.map(entry => String(entry.name).trim().toLowerCase()).filter(Boolean));

  const snapshotCardEntries = cardDebts.map(debt => ({
    kind: "card",
    name: debt?.name || "Card Debt",
    apr: toNumber(debt?.apr),
    balance: toNumber(debt?.balance),
    minimum: toNumber(debt?.minPayment ?? debt?.minimum),
    limit: toNumber(debt?.limit),
    hasPromoApr: Boolean(debt?.hasPromoApr),
    promoAprExp: debt?.promoAprExp || null,
  })).filter(debt => !cardNames.has(String(debt.name).trim().toLowerCase()));

  const otherDebtEntries = nonCardDebts.map(debt => ({
    kind: classifyDebtKind(debt?.name),
    name: debt?.name || "Debt",
    apr: toNumber(debt?.apr),
    balance: toNumber(debt?.balance),
    minimum: toNumber(debt?.minPayment ?? debt?.minimum),
    limit: 0,
    hasPromoApr: false,
    promoAprExp: null,
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

function buildEnhancedRecommendation(
  flag,
  active,
  severity,
  rationale,
  recommendation,
  {
    confidence = active && severity === "high" ? "medium" : "high",
    requiresProfessionalHelp = false,
    professionalHelpReason = "",
    directionalOnly = false,
  } = {}
) {
  return {
    ...buildRecommendation(flag, active, severity, rationale, recommendation),
    confidence,
    requiresProfessionalHelp,
    professionalHelpReason,
    directionalOnly,
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
  const financialConfig = financialState?.financialConfig || {};
  const computedStrategy = financialState?.computedStrategy || {};
  const modeledCards = cards
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
    .filter(card => card.limit > 0);
  const totalLimit = modeledCards.reduce((sum, card) => sum + card.limit, 0);
  const totalBalance = modeledCards.reduce((sum, card) => sum + card.balance, 0);
  const aggregateUtilizationPct = totalLimit > 0 ? (totalBalance / totalLimit) * 100 : 0;
  const spikingCards = modeledCards.filter(card => card.utilizationPct > 85);
  const elevatedCards = modeledCards.filter(card => card.utilizationPct >= 70);
  const liquidCash = estimateLiquidCash(financialState);
  const emergencyFloor = Math.max(
    toNumber(financialConfig?.emergencyFloor),
    toNumber(financialConfig?.minCashFloor)
  );
  const transferNeeded = Math.max(
    toNumber(computedStrategy?.requiredTransfer),
    toNumber(computedStrategy?.auditSignals?.liquidity?.transferNeeded)
  );
  const lowCashStress =
    transferNeeded > 0 ||
    (emergencyFloor > 0 && liquidCash <= emergencyFloor * 1.25) ||
    toNumber(computedStrategy?.auditSignals?.liquidity?.checkingAfterFloorAndBills) < 0;

  if (!spikingCards.length && !elevatedCards.length && aggregateUtilizationPct < 70) {
    return buildRecommendation(
      "credit-utilization-spike",
      false,
      "none",
      "No card or aggregate revolving balance is currently in the acute utilization warning range.",
      "Standard debt sequencing can stay in place."
    );
  }

  const leadCard = [...modeledCards].sort((a, b) => b.utilizationPct - a.utilizationPct)[0];
  const severity =
    spikingCards.length > 0 || aggregateUtilizationPct > 85 || (aggregateUtilizationPct >= 70 && lowCashStress)
      ? "high"
      : "medium";
  return buildEnhancedRecommendation(
    "credit-utilization-spike",
    true,
    severity,
    `${leadCard.name} is reporting ${formatPercent(leadCard.utilizationPct)} utilization on ${formatMoney(leadCard.balance)} of ${formatMoney(leadCard.limit)} available credit, with overall revolving utilization near ${formatPercent(aggregateUtilizationPct)}.`,
    lowCashStress
      ? "Consider preserving the checking floor, covering due-soon obligations, and paying this balance down below 30% utilization before resuming optional investing or lower-priority debt moves."
      : "Consider paying this balance down below 30% utilization before resuming the normal debt order to reduce acute score pressure.",
    { confidence: severity === "high" && lowCashStress ? "medium" : "high" }
  );
}

export function detectInsolvencyRisk(financialState = {}) {
  const monthlyNetIncome = estimateMonthlyNetIncome(financialState.financialConfig);
  const { debtMinimums: totalMinimumPayments, structuralRequiredCosts } = estimateMonthlyStructuralCosts(financialState);
  const debtMinimumRatioPct = monthlyNetIncome > 0 ? (totalMinimumPayments / monthlyNetIncome) * 100 : null;
  const structuralRatioPct = monthlyNetIncome > 0 ? (structuralRequiredCosts / monthlyNetIncome) * 100 : null;
  const computedStrategy = financialState?.computedStrategy || {};
  const transferNeeded = Math.max(
    toNumber(computedStrategy?.requiredTransfer),
    toNumber(computedStrategy?.auditSignals?.liquidity?.transferNeeded)
  );
  const checkingAfterBills = toNumber(computedStrategy?.auditSignals?.liquidity?.checkingAfterFloorAndBills);

  if (monthlyNetIncome <= 0 && structuralRequiredCosts > 0) {
    return buildEnhancedRecommendation(
      "insolvency-risk",
      true,
      "high",
      `Modeled required outflows total about ${formatMoney(structuralRequiredCosts)} per month, but usable monthly net income is missing or zero. The snapshot may reflect either severe cash-flow stress or incomplete income inputs.`,
      "Treat the plan as stabilization-first and directional only until income inputs are verified. Avoid aggressive payoff, investing, or transfer recommendations until the user confirms real monthly take-home pay.",
      {
        confidence: "low",
        directionalOnly: true,
        requiresProfessionalHelp: true,
        professionalHelpReason:
          "Required outflows exist but usable income is missing, so insolvency triage or hardship planning may need human review.",
      }
    );
  }

  if (
    (debtMinimumRatioPct == null || debtMinimumRatioPct <= 50) &&
    (structuralRatioPct == null || structuralRatioPct <= 90)
  ) {
    return buildEnhancedRecommendation(
      "insolvency-risk",
      false,
      "none",
      structuralRatioPct == null
        ? "Monthly net income is unavailable, so insolvency risk could not be confirmed from modeled obligations."
        : `Modeled required outflows are ${formatPercent(structuralRatioPct)} of monthly net income, below the insolvency warning range.`,
      "Standard cash-flow planning is still viable.",
      { confidence: structuralRatioPct == null ? "low" : "high" }
    );
  }

  const severity =
    (structuralRatioPct != null && structuralRatioPct >= 95) ||
    (debtMinimumRatioPct != null && debtMinimumRatioPct > 50) ||
    transferNeeded > 0 ||
    checkingAfterBills < 0
      ? "high"
      : "medium";
  const requiresProfessionalHelp =
    severity === "high" &&
    ((structuralRatioPct != null && structuralRatioPct >= 100) ||
      ((structuralRatioPct != null && structuralRatioPct >= 95) && (transferNeeded > 0 || checkingAfterBills < 0)));
  return buildEnhancedRecommendation(
    "insolvency-risk",
    true,
    severity,
    `Modeled required outflows total about ${formatMoney(structuralRequiredCosts)} per month against estimated monthly net income of ${formatMoney(monthlyNetIncome)} (${formatPercent(structuralRatioPct || 0)}), including ${formatMoney(totalMinimumPayments)} in debt minimums.`,
    requiresProfessionalHelp
      ? "This load may warrant urgent fallback options such as hardship programs, debt management plans, cost restructuring, or income stabilization before relying on a normal budget. Consider a HUD-approved housing counselor or nonprofit credit counselor before making aggressive payoff or investment moves."
      : "This load may warrant urgent fallback options such as hardship programs, debt management plans, cost restructuring, or income stabilization before relying on a normal budget.",
    {
      confidence: severity === "high" ? "low" : "medium",
      requiresProfessionalHelp,
      professionalHelpReason: requiresProfessionalHelp
        ? "Model shows required outflows at or above net income, which is beyond safe self-directed optimization."
        : "",
    }
  );
}

export function detectFreelancerTaxReserveWarning(financialState = {}) {
  const financialConfig = financialState.financialConfig || {};
  const isFreelancer = Boolean(financialConfig.isContractor);
  const reserveRate = Math.min(35, Math.max(20, toNumber(financialConfig.taxBracketPercent) || 27));
  const monthlyNetIncome = estimateMonthlyNetIncome(financialConfig);
  const recommendedMonthlyReserve = monthlyNetIncome > 0 ? (monthlyNetIncome * reserveRate) / 100 : 0;
  const liquidCash = estimateLiquidCash(financialState);
  const taxSetupMissing = toNumber(financialConfig.taxBracketPercent) <= 0 && toNumber(financialConfig.taxWithholdingRate) <= 0;
  const reserveCoverageMonths = recommendedMonthlyReserve > 0 ? liquidCash / recommendedMonthlyReserve : 0;
  const estimatedQuarterlyReserve = recommendedMonthlyReserve * 3;

  if (!isFreelancer) {
    return buildEnhancedRecommendation(
      "freelancer-tax-reserve-warning",
      false,
      "none",
      "No contractor or variable-income tax reserve warning is active.",
      "Tax reserve guidance can follow the user’s normal withholding setup."
    );
  }

  const severity =
    taxSetupMissing ||
    monthlyNetIncome <= 0 ||
    (recommendedMonthlyReserve > 0 && reserveCoverageMonths < 1)
      ? "high"
      : "medium";
  const requiresProfessionalHelp =
    severity === "high" && (taxSetupMissing || monthlyNetIncome <= 0 || reserveCoverageMonths < 0.5);
  return buildEnhancedRecommendation(
    "freelancer-tax-reserve-warning",
    true,
    severity,
    taxSetupMissing
      ? "Contractor income is active but there is no explicit tax bracket or withholding setup, which makes surplus guidance much less reliable."
      : "Contractor income is active, which raises the risk of treating estimated-tax cash as spendable surplus.",
    recommendedMonthlyReserve > 0
      ? `Consider reserving roughly ${reserveRate}% of contractor income for taxes before treating the remainder as available for debt payoff or savings. On the current income model that is about ${formatMoney(recommendedMonthlyReserve)} per month${estimatedQuarterlyReserve > 0 ? `, or ${formatMoney(estimatedQuarterlyReserve)} per quarter` : ""}.${reserveCoverageMonths > 0 && reserveCoverageMonths < 1 ? " Current liquid reserves do not yet cover one month of that modeled tax reserve." : ""}`
      : `Consider reserving roughly ${reserveRate}% of contractor income for taxes before treating the remainder as available for debt payoff or savings.`,
    {
      confidence: severity === "high" ? "low" : "medium",
      requiresProfessionalHelp,
      directionalOnly: taxSetupMissing || monthlyNetIncome <= 0,
      professionalHelpReason: requiresProfessionalHelp
        ? "Contractor tax setup is incomplete enough that a CPA or tax professional should confirm reserve assumptions."
        : "",
    }
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
  const fallbackTarget = Math.max(0, toNumber(financialConfig?.weeklySpendAllowance)) * 6;
  const { structuralRequiredCosts, fixedCosts } = estimateMonthlyStructuralCosts(financialState);
  const structuralMonthlyTarget = Math.max(fixedCosts, structuralRequiredCosts * 0.75);
  const target = Math.max(
    toNumber(computedStrategy?.auditSignals?.emergencyFund?.target),
    toNumber(financialConfig?.emergencyReserveTarget),
    fallbackTarget,
    toNumber(financialConfig?.emergencyReserveTarget) > 0 ? 0 : structuralMonthlyTarget
  );
  const currentReserve = estimateLiquidCash(financialState);
  const coverageWeeks = toNumber(computedStrategy?.auditSignals?.emergencyFund?.coverageWeeks);
  const requiredTransfer = toNumber(computedStrategy?.requiredTransfer);
  const fundedPct = target > 0 ? (currentReserve / target) * 100 : 0;

  if (
    (target <= 0 && coverageWeeks >= 6) ||
    (target > 0 && fundedPct >= 100 && (!coverageWeeks || coverageWeeks >= 6) && requiredTransfer <= 0)
  ) {
    return buildEnhancedRecommendation(
      "emergency-reserve-gap",
      false,
      "none",
      "Emergency reserve coverage appears to be at or above the current target.",
      "You can keep maintaining the reserve while focusing on the next priority."
    );
  }

  const severity =
    fundedPct < 50 || (coverageWeeks > 0 && coverageWeeks < 4) || requiredTransfer > 0 ? "high" : "medium";
  return buildEnhancedRecommendation(
    "emergency-reserve-gap",
    true,
    severity,
    `Emergency reserves are about ${formatMoney(currentReserve)} against a target of ${formatMoney(target)} (${Math.round(fundedPct)}% funded${coverageWeeks ? `, ${Math.round(coverageWeeks * 10) / 10} weeks of coverage` : ""}).`,
    "Consider rebuilding cash reserves before treating surplus as fully available for optional spending or long-range investing.",
    { confidence: target <= 0 ? "low" : severity === "high" ? "medium" : "high" }
  );
}

export function detectFixedCostTrap(financialState = {}) {
  const financialConfig = financialState?.financialConfig || {};
  const monthlyNetIncome = estimateMonthlyNetIncome(financialConfig);
  const { fixedCosts } = estimateMonthlyStructuralCosts(financialState);
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
  const utilizationPressure = detectCreditUtilizationSpike(financialState);
  const insolvencyRisk = detectInsolvencyRisk(financialState);
  const fixedCostTrap = detectFixedCostTrap(financialState);
  const contractorTaxReserve = detectFreelancerTaxReserveWarning(financialState);
  const cashTimingConflict = detectCashTimingConflict(financialState);
  const contradictoryInputs = detectContradictoryFinancialInputs(financialState);
  const mixedDebtComplexity = detectMixedDebtPortfolioComplexity(financialState);
  const promoAprCliff = detectPromoAprCliff(financialState);
  const snapshotDate =
    financialState?.current?.form?.date ||
    financialState?.computedStrategy?.snapshotDate ||
    new Date().toISOString().split("T")[0];
  const promoExpiryRisk = debtEntries.some(debt => {
    if (!debt.hasPromoApr || !debt.promoAprExp) return false;
    const promoExpiryDate = new Date(debt.promoAprExp);
    const anchorDate = new Date(snapshotDate);
    if (Number.isNaN(promoExpiryDate.getTime()) || Number.isNaN(anchorDate.getTime())) return false;
    const diffDays = Math.round((promoExpiryDate - anchorDate) / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= 90;
  });
  const candidate = debtEntries
    .filter(debt => debt.balance > 0 && debt.apr > 0 && debt.apr <= arbitrageTargetApr)
    .sort((a, b) => a.apr - b.apr)[0];

  if (
    !candidate ||
    toxicDebtActive ||
    operationalSurplus <= 0 ||
    (emergencyTarget > 0 && emergencyCurrent < emergencyTarget * 0.75) ||
    utilizationPressure.active ||
    insolvencyRisk.active ||
    fixedCostTrap.active ||
    contractorTaxReserve.active ||
    cashTimingConflict.active ||
    contradictoryInputs.active ||
    mixedDebtComplexity.active ||
    promoAprCliff.active ||
    promoExpiryRisk
  ) {
    return buildEnhancedRecommendation(
      "low-apr-arbitrage-opportunity",
      false,
      "none",
      "No low-APR debt arbitrage opportunity is currently strong enough to outrank liquidity or high-interest debt priorities.",
      "Standard debt sequencing or reserve-building remains the cleaner path right now."
    );
  }

  return buildEnhancedRecommendation(
    "low-apr-arbitrage-opportunity",
    true,
    "medium",
    `${candidate.name} is carrying ${formatMoney(candidate.balance)} at ${formatPercent(candidate.apr)}, below the modeled debt-vs-invest threshold of ${formatPercent(arbitrageTargetApr)}.`,
    "Consider comparing minimum-payment-only payoff on this balance against deploying some surplus into tax-advantaged investing after core liquidity needs are covered."
  );
}

export function detectPromoAprCliff(financialState = {}) {
  const snapshotDate =
    financialState?.current?.form?.date ||
    financialState?.computedStrategy?.snapshotDate ||
    new Date().toISOString().split("T")[0];
  const anchorDate = parseIsoDate(snapshotDate);
  const candidates = collectDebtEntries(financialState)
    .filter((debt) => debt.hasPromoApr && debt.promoAprExp && debt.balance > 0)
    .map((debt) => {
      const expiry = parseIsoDate(debt.promoAprExp);
      if (!anchorDate || !expiry) return null;
      const daysToExpiry = Math.round((expiry - anchorDate) / (1000 * 60 * 60 * 24));
      if (daysToExpiry <= 0 || daysToExpiry > 90) return null;
      return { ...debt, daysToExpiry };
    })
    .filter(Boolean)
    .sort((a, b) => a.daysToExpiry - b.daysToExpiry || b.balance - a.balance);

  const lead = candidates[0];
  if (!lead) {
    return buildEnhancedRecommendation(
      "promo-apr-cliff",
      false,
      "none",
      "No active promo APR balance is approaching expiration inside the 90-day guardrail window.",
      "Promo APR pacing does not need to override the normal plan right now."
    );
  }

  const severity = lead.daysToExpiry <= 30 ? "high" : "medium";
  return buildEnhancedRecommendation(
    "promo-apr-cliff",
    true,
    severity,
    `${lead.name} has ${formatMoney(lead.balance)} on a promo balance with about ${lead.daysToExpiry} day(s) remaining before standard APR risk returns.`,
    "Treat this promo expiry as a hard deadline. Before making extra investing or low-APR arbitrage moves, calculate whether the remaining promo balance can be safely cleared or materially reduced before the promo ends.",
    { confidence: "high" }
  );
}

export function detectCashTimingConflict(financialState = {}) {
  const computedStrategy = financialState?.computedStrategy || {};
  const transferNeeded = toNumber(computedStrategy?.requiredTransfer ?? computedStrategy?.auditSignals?.liquidity?.transferNeeded);
  const checkingAfterBills = toNumber(
    computedStrategy?.auditSignals?.liquidity?.checkingAfterFloorAndBills
  );
  const timeCriticalBills = toNumber(computedStrategy?.timeCriticalAmount ?? computedStrategy?.auditSignals?.liquidity?.timeCriticalBills);
  const nextPaycheckAmount = Math.max(
    toNumber(financialState?.financialConfig?.paycheckStandard),
    toNumber(financialState?.financialConfig?.averagePaycheck)
  );

  if (transferNeeded <= 0 && checkingAfterBills >= 0 && !(timeCriticalBills > 0 && nextPaycheckAmount <= 0)) {
    return buildEnhancedRecommendation(
      "cash-timing-conflict",
      false,
      "none",
      "No immediate due-before-payday cash timing conflict is active in the native strategy.",
      "Short-term timing does not currently override the broader plan."
    );
  }

  return buildEnhancedRecommendation(
    "cash-timing-conflict",
    true,
    transferNeeded > 0 || checkingAfterBills < 0 ? "high" : "medium",
    `Near-term bills and minimums create a timing conflict: ${formatMoney(timeCriticalBills)} is due before the next paycheck, with ${formatMoney(transferNeeded)} needing to move from reserves and checking after floors/bills at ${formatMoney(checkingAfterBills)}.${nextPaycheckAmount <= 0 && timeCriticalBills > 0 ? " The next-paycheck amount is also missing or zero, which makes payoff acceleration guidance less reliable." : ""}`,
    "Do not recommend extra investing, accelerated low-APR arbitrage, or optional spending until due-before-payday obligations are covered and checking is back above the floor.",
    {
      confidence: nextPaycheckAmount <= 0 ? "low" : "high",
      directionalOnly: nextPaycheckAmount <= 0,
    }
  );
}

export function detectContradictoryFinancialInputs(financialState = {}) {
  const financialConfig = financialState?.financialConfig || {};
  const monthlyIncome = estimateMonthlyNetIncome(financialConfig);
  const obligations =
    Math.max(toNumber(financialConfig?.monthlyRent), toNumber(financialConfig?.mortgagePayment)) +
    estimateMonthlyRenewalLoad(financialState?.renewals) +
    collectDebtEntries(financialState).reduce((sum, debt) => sum + debt.minimum, 0);
  const contradictions = [];

  if (monthlyIncome <= 0 && obligations > 0) {
    contradictions.push("income missing against live obligations");
  }
  if (
    toNumber(financialConfig?.emergencyReserveTarget) > 0 &&
    toNumber(financialConfig?.emergencyFloor) > 0 &&
    toNumber(financialConfig?.emergencyReserveTarget) < toNumber(financialConfig?.emergencyFloor)
  ) {
    contradictions.push("emergency reserve target below emergency floor");
  }
  if (
    financialConfig?.incomeType === "hourly" &&
    (toNumber(financialConfig?.hourlyRateNet) <= 0 || toNumber(financialConfig?.typicalHours) <= 0)
  ) {
    contradictions.push("hourly income selected without usable hourly inputs");
  }
  if (
    financialConfig?.incomeType === "variable" &&
    toNumber(financialConfig?.averagePaycheck) <= 0 &&
    obligations > 0
  ) {
    contradictions.push("variable income selected without a typical paycheck");
  }
  if (
    financialConfig?.isContractor &&
    toNumber(financialConfig?.taxBracketPercent) <= 0 &&
    toNumber(financialConfig?.taxWithholdingRate) <= 0
  ) {
    contradictions.push("contractor income selected without a tax reserve setup");
  }
  if (
    Math.max(
      toNumber(financialState?.computedStrategy?.timeCriticalAmount),
      toNumber(financialState?.computedStrategy?.auditSignals?.liquidity?.timeCriticalBills)
    ) > 0 &&
    Math.max(toNumber(financialConfig?.paycheckStandard), toNumber(financialConfig?.averagePaycheck)) <= 0
  ) {
    contradictions.push("time-critical bills modeled without a usable next-paycheck input");
  }

  if (!contradictions.length) {
    return buildEnhancedRecommendation(
      "contradictory-financial-inputs",
      false,
      "none",
      "No major contradictions were detected between the user's income, reserve, and obligation inputs.",
      "Native recommendations can rely on the current inputs."
    );
  }

  return buildEnhancedRecommendation(
    "contradictory-financial-inputs",
    true,
    "high",
    `The current model has contradictory or missing inputs: ${contradictions.join("; ")}.`,
    "Treat the audit as directional only until the missing or contradictory inputs are corrected. Avoid aggressive payoff, investing, or transfer recommendations until the model is internally consistent.",
    { confidence: "low", directionalOnly: true }
  );
}

export function detectMixedDebtPortfolioComplexity(financialState = {}) {
  const debtEntries = collectDebtEntries(financialState);
  const debtKinds = new Set(debtEntries.map((debt) => debt.kind).filter(Boolean));
  const hasPromo = debtEntries.some((debt) => debt.hasPromoApr && debt.balance > 0);
  const hasStudentLoan = debtEntries.some((debt) => debt.kind === "student-loan");
  const hasRevolving = debtEntries.some((debt) => debt.kind === "card");
  const hasInstallment = debtEntries.some((debt) => debt.kind !== "card");
  const hasHighAprRevolving = debtEntries.some((debt) => debt.kind === "card" && debt.apr >= 20 && debt.balance > 0);

  if (debtEntries.length < 3 || debtKinds.size < 2 || !(hasInstallment && hasRevolving)) {
    return buildEnhancedRecommendation(
      "mixed-debt-portfolio-complexity",
      false,
      "none",
      "Debt structure does not currently require a mixed-portfolio escalation.",
      "Standard sequencing logic is sufficient for the current debt mix."
    );
  }

  const requiresProfessionalHelp = hasStudentLoan && (hasHighAprRevolving || hasPromo);
  return buildEnhancedRecommendation(
    "mixed-debt-portfolio-complexity",
    true,
    hasPromo || requiresProfessionalHelp || (hasHighAprRevolving && debtEntries.length >= 4) ? "high" : "medium",
    `The debt portfolio mixes revolving cards with installment debt${hasStudentLoan ? ", including student-loan exposure," : ""}${hasPromo ? " plus promo APR timing," : ""} which makes one-size-fits-all payoff advice less reliable.`,
    requiresProfessionalHelp
      ? "Prioritize toxic or score-damaging revolving debt first, but avoid refinancing or consolidating student-loan balances until you review federal protections, repayment options, and tax consequences with a professional."
      : "Prioritize toxic or score-damaging revolving debt first, but avoid blanket consolidation or refinance recommendations until each debt type's protections and timing risks are reviewed.",
    {
      confidence: requiresProfessionalHelp ? "low" : "medium",
      requiresProfessionalHelp,
      professionalHelpReason: requiresProfessionalHelp
        ? "Student-loan protections and mixed debt tradeoffs can be easy to damage with generic payoff advice."
        : "",
    }
  );
}

export function evaluateChatDecisionRules(financialState = {}) {
  return [
    detectContradictoryFinancialInputs(financialState),
    detectToxicDebtTriage(financialState),
    detectPromoAprCliff(financialState),
    detectCreditUtilizationSpike(financialState),
    detectCashTimingConflict(financialState),
    detectInsolvencyRisk(financialState),
    detectFreelancerTaxReserveWarning(financialState),
    detectMixedDebtPortfolioComplexity(financialState),
    detectSpendingAllowancePressure(financialState),
    detectEmergencyReserveGap(financialState),
    detectFixedCostTrap(financialState),
    detectLowAprArbitrageOpportunity(financialState),
  ];
}
