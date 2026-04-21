globalThis.window = globalThis.window || {};

import { buildSnapshotMessage } from "../src/modules/buildSnapshotMessage.js";
import { buildDemoScenario, DEMO_SCENARIO_ORDER, getDemoScenarioMeta } from "../src/modules/demoScenario.js";
import { generateStrategy } from "../src/modules/engine.js";
import { parseAudit, validateParsedAuditConsistency } from "../src/modules/utils.js";

const TARGET_URL = String(process.env.AUDIT_EVAL_URL || "http://localhost:8790").replace(/\/$/, "");
const TESTING_TIER = String(process.env.AUDIT_EVAL_TIER || "pro").trim() === "free" ? "free" : "pro";
const DEVICE_ID = process.env.AUDIT_EVAL_DEVICE_ID || "audit-eval-device";
const APP_VERSION = process.env.AUDIT_EVAL_APP_VERSION || "2.0.0-eval";

const MODELS = [
  { id: "gemini-2.5-flash", provider: "gemini", label: "Flash" },
  { id: "gpt-4.1", provider: "openai", label: "CFO" },
  { id: "o3", provider: "openai", label: "Boardroom" },
];

function sumPendingCharges(pendingCharges = []) {
  return pendingCharges.reduce((sum, charge) => sum + (Number(charge?.amount) || 0), 0);
}

function includesAny(text, needles = []) {
  const haystack = String(text || "").toLowerCase();
  return needles.some((needle) => haystack.includes(String(needle || "").toLowerCase()));
}

function buildScenarioBase() {
  return {
    cards: [],
    bankAccounts: [],
    renewals: [],
    cardAnnualFees: [],
    parsedTransactions: [],
    budgetActuals: {},
    holdingValues: { roth: 0, brokerage: 0, k401: 0, crypto: 0, hsa: 0 },
    trendContext: [],
    persona: null,
  };
}

function makeScenarios() {
  const scenarios = [
    {
      id: "tight_liquidity_tax_gap",
      label: "Tight liquidity with protected cash gap",
      ...buildScenarioBase(),
      financialConfig: {
        payFrequency: "bi-weekly",
        payday: "Friday",
        paycheckStandard: 2350,
        emergencyFloor: 600,
        weeklySpendAllowance: 275,
        greenStatusTarget: 2500,
        emergencyReserveTarget: 8000,
        vaultTarget: 2500,
        defaultAPR: 24.99,
        preferredName: "Michael",
        trackChecking: true,
        trackSavings: true,
        trackBrokerage: true,
        trackRothContributions: true,
        track401k: true,
        investmentBrokerage: 0,
        investmentRoth: 6360.71,
        k401Balance: 0,
        notes: "Acura and Geico are already planned cash obligations. Do not double count rent if I say it is already paid.",
        nonCardDebts: [
          { name: "IRS Payment Plan", type: "tax", balance: 3200, minimum: 145, apr: 8.0, dueDay: 18 },
        ],
        budgetCategories: [
          { name: "Food", monthlyTarget: 550 },
          { name: "Gas", monthlyTarget: 180 },
          { name: "Fun", monthlyTarget: 220 },
        ],
      },
      cards: [
        { id: "csp", name: "Chase Sapphire Preferred", institution: "Chase", balance: 3690, limit: 15000, apr: 25.99, minPayment: 110, paymentDueDay: 19 },
        { id: "amex", name: "American Express Blue Cash Everyday Card", institution: "American Express", balance: 2049, limit: 10000, apr: 29.99, minPayment: 75, paymentDueDay: 21 },
        { id: "delta", name: "Delta SkyMiles Gold Business American Express Card", institution: "American Express", balance: 1900, limit: 3000, apr: 0, hasPromoApr: true, promoAprExp: "2026-05-20", minPayment: 55, paymentDueDay: 24 },
      ],
      bankAccounts: [
        { id: "chk1", bank: "Capital One", name: "360 Checking", accountType: "checking", _plaidBalance: 398.06, _plaidAvailable: 398.06 },
        { id: "sav1", bank: "Ally", name: "High Yield Savings", accountType: "savings", _plaidBalance: 132.86, _plaidAvailable: 132.86 },
      ],
      renewals: [
        { name: "Acura", amount: 682, category: "car", interval: 1, intervalUnit: "month", nextDue: "2026-04-18", chargedTo: "Checking" },
        { name: "Geico", amount: 197, category: "insurance", interval: 1, intervalUnit: "month", nextDue: "2026-04-19", chargedTo: "Checking" },
        { name: "Netflix", amount: 15.99, category: "subs", interval: 1, intervalUnit: "month", nextDue: "2026-04-22", chargedTo: "American Express Blue Cash Everyday Card" },
      ],
      form: {
        date: "2026-04-17",
        time: "08:30",
        checking: "398.06",
        savings: "132.86",
        ally: "132.86",
        debts: [
          { cardId: "csp", name: "Chase Sapphire Preferred", balance: "3690" },
          { cardId: "amex", name: "American Express Blue Cash Everyday Card", balance: "2049" },
          { cardId: "delta", name: "Delta SkyMiles Gold Business American Express Card", balance: "1900" },
        ],
        pendingCharges: [
          { amount: "41.48", description: "Platepass", cardId: "delta", confirmed: false },
          { amount: "3.79", description: "Gamer2gamer", cardId: "delta", confirmed: false },
        ],
        notes: "Rent already paid. Keep tax escrow protected. If cash is tight, protect checking first and do not pretend the card balances are cash-funded today.",
        autoPaycheckAdd: false,
        paycheckAddOverride: "",
        habitCount: 1,
        roth: "6360.71",
        brokerage: "",
        k401Balance: "",
        investments: [{ id: "roth-live", bucket: "roth", amount: 6360.71 }],
        includedInvestmentKeys: ["roth"],
      },
      parsedTransactions: [
        { date: "2026-04-16", amount: 41.48, description: "Platepass", category: "Transportation" },
        { date: "2026-04-16", amount: 3.79, description: "Gamer2gamer", category: "Services" },
        { date: "2026-04-15", amount: 58.2, description: "Trader Joes", category: "Groceries" },
        { date: "2026-04-14", amount: 27.12, description: "Shell", category: "Gas & Auto" },
      ],
      budgetActuals: { Food: 102.12, Gas: 27.12, Fun: 3.79 },
      holdingValues: { roth: 6360.71, brokerage: 0, k401: 0, crypto: 0, hsa: 0 },
      personalRules:
        "NY Tax Funding Gap: $1450 due 2026-04-29\nAcura is ALWAYS a checking-paid cash outflow\nGeico is ALWAYS a checking-paid cash outflow\nDefaultSubscriptionsCard = Amex Blue Cash Everyday\nStatement close/due date is unknown. Pay this card toward $0 weekly.",
      expectations: {
        requiresProtectedObligationCoverage: ["Acura", "Geico", "NY Tax Funding Gap"],
        shouldGuardInvesting: true,
        disallowPrimaryDebtPaydown: true,
      },
    },
    {
      id: "promo_sprint_with_surplus",
      label: "Promo APR sprint with real surplus",
      ...buildScenarioBase(),
      financialConfig: {
        payFrequency: "bi-weekly",
        payday: "Thursday",
        paycheckStandard: 4200,
        emergencyFloor: 900,
        weeklySpendAllowance: 500,
        greenStatusTarget: 4500,
        emergencyReserveTarget: 15000,
        vaultTarget: 6000,
        defaultAPR: 23.99,
        trackChecking: true,
        trackSavings: true,
        trackBrokerage: true,
        investmentBrokerage: 4200,
        investmentRoth: 9800,
        nonCardDebts: [],
      },
      cards: [
        { id: "freedom", name: "Chase Freedom Flex", institution: "Chase", balance: 0, limit: 5100, apr: 24.99, minPayment: 40, paymentDueDay: 20 },
        { id: "venture", name: "Venture Rewards", institution: "Capital One", balance: 1850, limit: 12000, apr: 29.99, minPayment: 65, paymentDueDay: 22 },
        { id: "delta", name: "Delta SkyMiles Gold Business American Express Card", institution: "American Express", balance: 2400, limit: 3000, apr: 0, hasPromoApr: true, promoAprExp: "2026-05-12", minPayment: 55, paymentDueDay: 24 },
      ],
      bankAccounts: [
        { id: "chk1", bank: "Chase", name: "Primary Checking", accountType: "checking", _plaidBalance: 5400, _plaidAvailable: 5400 },
        { id: "sav1", bank: "Ally", name: "Reserve", accountType: "savings", _plaidBalance: 4600, _plaidAvailable: 4600 },
      ],
      renewals: [
        { name: "Phone", amount: 95, category: "utilities", interval: 1, intervalUnit: "month", nextDue: "2026-04-25", chargedTo: "Checking" },
      ],
      form: {
        date: "2026-04-17",
        time: "09:15",
        checking: "5400",
        savings: "4600",
        ally: "4600",
        debts: [
          { cardId: "venture", name: "Venture Rewards", balance: "1850" },
          { cardId: "delta", name: "Delta SkyMiles Gold Business American Express Card", balance: "2400" },
        ],
        pendingCharges: [{ amount: "189.22", description: "Flight change fee", cardId: "delta", confirmed: true }],
        notes: "Use free cash aggressively if the promo expiry is close, but do not undercut the floor.",
        autoPaycheckAdd: false,
        paycheckAddOverride: "",
        habitCount: 0,
        roth: "9800",
        brokerage: "4200",
        k401Balance: "",
        investments: [
          { id: "roth-live", bucket: "roth", amount: 9800 },
          { id: "brokerage-live", bucket: "brokerage", amount: 4200 },
        ],
        includedInvestmentKeys: ["roth", "brokerage"],
      },
      parsedTransactions: [
        { date: "2026-04-16", amount: 189.22, description: "Airline Change Fee", category: "Travel" },
        { date: "2026-04-15", amount: 122.1, description: "Costco", category: "Groceries" },
      ],
      holdingValues: { roth: 9800, brokerage: 4200, k401: 0, crypto: 0, hsa: 0 },
      personalRules: "If there is true surplus after the floor, use the highest-impact payoff route first.",
      expectations: {
        preferredDebtTarget: "Delta SkyMiles Gold Business American Express Card",
        shouldGuardInvesting: true,
        expectedStatusAtLeast: "YELLOW",
      },
    },
    {
      id: "healthy_surplus_investor",
      label: "Healthy surplus with investing open",
      ...buildScenarioBase(),
      financialConfig: {
        payFrequency: "monthly",
        payday: "Wednesday",
        paycheckStandard: 7800,
        emergencyFloor: 1200,
        weeklySpendAllowance: 650,
        greenStatusTarget: 6500,
        emergencyReserveTarget: 18000,
        vaultTarget: 10000,
        defaultAPR: 21.99,
        trackChecking: true,
        trackSavings: true,
        trackBrokerage: true,
        trackRothContributions: true,
        track401k: true,
        investmentBrokerage: 14500,
        investmentRoth: 22200,
        k401Balance: 54000,
        rothContributedYTD: 2400,
        rothAnnualLimit: 7000,
        k401ContributedYTD: 6500,
        k401AnnualLimit: 23000,
      },
      cards: [
        { id: "bce", name: "American Express Blue Cash Everyday Card", institution: "American Express", balance: 0, limit: 10000, apr: 29.99, minPayment: 40, paymentDueDay: 21 },
      ],
      bankAccounts: [
        { id: "chk1", bank: "Schwab", name: "Investor Checking", accountType: "checking", _plaidBalance: 9200, _plaidAvailable: 9200 },
        { id: "sav1", bank: "Ally", name: "Emergency Fund", accountType: "savings", _plaidBalance: 16000, _plaidAvailable: 16000 },
      ],
      renewals: [
        { name: "Rent", amount: 2100, category: "housing", interval: 1, intervalUnit: "month", nextDue: "2026-05-01", chargedTo: "Checking" },
      ],
      form: {
        date: "2026-04-17",
        time: "12:00",
        checking: "9200",
        savings: "16000",
        ally: "16000",
        debts: [],
        pendingCharges: [{ amount: "88.10", description: "Utilities", confirmed: true }],
        notes: "If cash is genuinely open after reserve targets, route the extra to Roth or brokerage instead of inventing fear.",
        autoPaycheckAdd: false,
        paycheckAddOverride: "",
        habitCount: 2,
        roth: "22200",
        brokerage: "14500",
        k401Balance: "54000",
        investments: [
          { id: "roth-live", bucket: "roth", amount: 22200 },
          { id: "brokerage-live", bucket: "brokerage", amount: 14500 },
          { id: "k401-live", bucket: "k401", amount: 54000 },
        ],
        includedInvestmentKeys: ["roth", "brokerage", "k401"],
      },
      parsedTransactions: [
        { date: "2026-04-16", amount: 44.18, description: "Sweetgreen", category: "Dining" },
        { date: "2026-04-15", amount: 88.1, description: "Electric Utility", category: "Utilities" },
      ],
      holdingValues: { roth: 22200, brokerage: 14500, k401: 54000, crypto: 0, hsa: 0 },
      personalRules: "Keep a calm tone. Do not manufacture debt panic when there is no revolving debt.",
      expectations: {
        shouldOpenInvesting: true,
        expectedStatusAtLeast: "GREEN",
      },
    },
    {
      id: "contractor_tax_escrow",
      label: "Variable contractor income with escrow rules",
      ...buildScenarioBase(),
      financialConfig: {
        incomeType: "variable",
        averagePaycheck: 3100,
        payFrequency: "weekly",
        payday: "Tuesday",
        emergencyFloor: 850,
        weeklySpendAllowance: 420,
        greenStatusTarget: 3500,
        emergencyReserveTarget: 12000,
        vaultTarget: 5000,
        defaultAPR: 24.5,
        trackChecking: true,
        trackSavings: true,
        trackBrokerage: true,
        investmentBrokerage: 7200,
        investmentRoth: 5400,
        contractorTaxRate: 28,
      },
      cards: [
        { id: "savor", name: "Savor Cash Rewards", institution: "Capital One", balance: 980, limit: 4500, apr: 27.99, minPayment: 40, paymentDueDay: 20 },
      ],
      bankAccounts: [
        { id: "chk1", bank: "Capital One", name: "Business Checking", accountType: "checking", _plaidBalance: 2400, _plaidAvailable: 2400 },
        { id: "sav1", bank: "Ally", name: "Tax Vault", accountType: "savings", _plaidBalance: 1900, _plaidAvailable: 1900 },
      ],
      renewals: [
        { name: "Quarterly Taxes", amount: 2200, category: "tax", interval: 3, intervalUnit: "month", nextDue: "2026-06-15", chargedTo: "Ally" },
        { name: "Adobe", amount: 64.99, category: "software", interval: 1, intervalUnit: "month", nextDue: "2026-04-20", chargedTo: "Checking" },
      ],
      form: {
        date: "2026-04-17",
        time: "14:20",
        checking: "2400",
        savings: "1900",
        ally: "1900",
        debts: [{ cardId: "savor", name: "Savor Cash Rewards", balance: "980" }],
        pendingCharges: [{ amount: "149.00", description: "Client refund", confirmed: false }],
        notes: "Refund reserve is locked. Treat tax escrow as unavailable until the estimated payment is covered.",
        autoPaycheckAdd: false,
        paycheckAddOverride: "",
        habitCount: 0,
        roth: "5400",
        brokerage: "7200",
        k401Balance: "",
        investments: [
          { id: "roth-live", bucket: "roth", amount: 5400 },
          { id: "brokerage-live", bucket: "brokerage", amount: 7200 },
        ],
        includedInvestmentKeys: ["roth", "brokerage"],
      },
      parsedTransactions: [
        { date: "2026-04-16", amount: 149, description: "Client refund", category: "Transfer" },
        { date: "2026-04-15", amount: 64.99, description: "Adobe", category: "Subscriptions" },
      ],
      holdingValues: { roth: 5400, brokerage: 7200, k401: 0, crypto: 0, hsa: 0 },
      personalRules:
        "Refund reserve is unavailable until the client issue closes.\nQuarterly Taxes RESERVED (locked in ally)\nQuarterly Taxes: $2200 due 2026-06-15\nprefer ONE planned transfer",
      expectations: {
        shouldGuardInvesting: true,
        requiresProtectedObligationCoverage: ["Quarterly Taxes", "Adobe"],
      },
    },
    {
      id: "mixed_accounts_and_manual_override",
      label: "Mixed linked/manual balances with divergence handling",
      ...buildScenarioBase(),
      financialConfig: {
        payFrequency: "semi-monthly",
        payday: "Monday",
        paycheckStandard: 3600,
        emergencyFloor: 700,
        weeklySpendAllowance: 340,
        greenStatusTarget: 3200,
        emergencyReserveTarget: 9000,
        vaultTarget: 4000,
        defaultAPR: 22.5,
        trackChecking: true,
        trackSavings: true,
        trackBrokerage: true,
        investmentBrokerage: 11000,
        investmentRoth: 6600,
        notes: "Checking override is intentional because a reimbursement is pending.",
      },
      cards: [
        { id: "freedom", name: "Chase Freedom Flex", institution: "Chase", balance: 510, limit: 5100, apr: 24.99, minPayment: 35, paymentDueDay: 17 },
      ],
      bankAccounts: [
        { id: "chk1", bank: "Chase", name: "Primary Checking", accountType: "checking", _plaidBalance: 1200, _plaidAvailable: 1200 },
        { id: "sav1", bank: "Capital One", name: "360 Performance Savings", accountType: "savings", _plaidBalance: 3600, _plaidAvailable: 3600 },
      ],
      renewals: [
        { name: "HOA", amount: 240, category: "housing", interval: 1, intervalUnit: "month", nextDue: "2026-04-19", chargedTo: "Checking" },
      ],
      form: {
        date: "2026-04-17",
        time: "18:05",
        checking: "1850",
        savings: "3600",
        ally: "3600",
        cashSummary: { checkingOverride: true, savingsTotalUsed: 3600, savingsOverride: false },
        debts: [{ cardId: "freedom", name: "Chase Freedom Flex", balance: "510" }],
        pendingCharges: [{ amount: "250.00", description: "Work travel reimbursement gap", confirmed: false }],
        notes: "The checking override is deliberate. Mention the live-vs-audit divergence instead of ignoring it.",
        autoPaycheckAdd: false,
        paycheckAddOverride: "",
        habitCount: 0,
        roth: "6600",
        brokerage: "11000",
        k401Balance: "",
        investments: [
          { id: "roth-live", bucket: "roth", amount: 6600 },
          { id: "brokerage-live", bucket: "brokerage", amount: 11000 },
        ],
        includedInvestmentKeys: ["roth", "brokerage"],
      },
      parsedTransactions: [
        { date: "2026-04-16", amount: 250, description: "Work travel", category: "Travel" },
      ],
      holdingValues: { roth: 6600, brokerage: 11000, k401: 0, crypto: 0, hsa: 0 },
      personalRules: "Checking override is intentional. Do not tell me to trust live checking more than the audit override without acknowledging the pending reimbursement context.",
      expectations: {
        requiresLiveVsAuditAcknowledgement: true,
        expectedStatusAtLeast: "YELLOW",
      },
    },
  ];
  const demoScenarios = DEMO_SCENARIO_ORDER.map((scenarioId) => {
    const demoScenario = buildDemoScenario(new Date("2026-04-20T12:00:00.000Z"), scenarioId);
    return {
      id: `demo_mode_${scenarioId}`,
      label: `Demo mode: ${getDemoScenarioMeta(scenarioId).name}`,
      ...buildScenarioBase(),
      financialConfig: demoScenario.financialConfig,
      cards: demoScenario.cards,
      bankAccounts: demoScenario.bankAccounts,
      renewals: demoScenario.renewals,
      form: demoScenario.form,
      parsedTransactions: demoScenario.parsedTransactions,
      budgetActuals: demoScenario.budgetActuals,
      holdingValues: demoScenario.holdingValues,
      personalRules: demoScenario.personalRules,
      expectations: {
        shouldOpenInvesting: true,
        expectedStatusAtLeast: "GREEN",
      },
    };
  });
  return [...scenarios, ...demoScenarios];
}

function buildInvestmentAnchorBalance(scenario) {
  const form = scenario.form || {};
  const includedKeys = Array.isArray(form.includedInvestmentKeys)
    ? new Set(form.includedInvestmentKeys.map((key) => String(key || "")))
    : null;
  const values = {
    roth: Number(form.roth || 0) || 0,
    brokerage: Number(form.brokerage || 0) || 0,
    k401: Number(form.k401Balance || 0) || 0,
  };
  return Object.entries(values).reduce((sum, [key, value]) => {
    if (includedKeys && !includedKeys.has(key)) return sum;
    return sum + value;
  }, 0);
}

function buildValidationOptions(scenario, parsed, computedStrategy) {
  const form = scenario.form || {};
  return {
    operationalSurplus: computedStrategy?.operationalSurplus ?? null,
    nativeScore: computedStrategy?.auditSignals?.nativeScore?.score ?? null,
    nativeRiskFlags: computedStrategy?.auditSignals?.riskFlags ?? [],
    dashboardAnchors: {
      checking: Number(form.checking) || 0,
      vault: Number(form.savings || form.ally) || 0,
      pending: sumPendingCharges(form.pendingCharges),
      debts: computedStrategy?.auditSignals?.debt?.total ?? 0,
      available: computedStrategy?.operationalSurplus ?? null,
    },
    investmentAnchors: {
      balance: buildInvestmentAnchorBalance(scenario),
      asOf: form.date || null,
      gateStatus: null,
      netWorth: parsed?.netWorth ?? null,
    },
    cards: scenario.cards,
    renewals: scenario.renewals,
    formData: form,
    financialConfig: scenario.financialConfig,
    computedStrategy,
    personalRules: scenario.personalRules,
  };
}

function buildScenarioContext(scenario, modelProvider, computedStrategy) {
  return {
    providerId: modelProvider,
    financialConfig: scenario.financialConfig,
    cards: scenario.cards,
    bankAccounts: scenario.bankAccounts,
    renewals: scenario.renewals,
    personalRules: scenario.personalRules || "",
    trendContext: scenario.trendContext || [],
    persona: scenario.persona || null,
    computedStrategy,
    formData: scenario.form,
    aiConsent: true,
    budgetContext: scenario.budgetContext || null,
  };
}

function buildScenarioSnapshot(scenario, modelProvider, computedStrategy) {
  return buildSnapshotMessage({
    form: scenario.form,
    activeConfig: scenario.financialConfig,
    cards: scenario.cards,
    bankAccounts: scenario.bankAccounts,
    renewals: scenario.renewals,
    cardAnnualFees: scenario.cardAnnualFees || [],
    parsedTransactions: scenario.parsedTransactions,
    budgetActuals: scenario.budgetActuals,
    holdingValues: scenario.holdingValues,
    financialConfig: scenario.financialConfig,
    aiProvider: modelProvider,
    computedStrategy,
  });
}

function extractVisibleText(validated) {
  const weeklyText = (validated?.structured?.weeklyMoves || [])
    .map((move) => `${move?.title || ""} ${move?.detail || ""}`)
    .join(" ");
  const alertText = Array.isArray(validated?.alertsCard) ? validated.alertsCard.join(" ") : "";
  const nextActionText = `${validated?.structured?.nextAction?.title || ""} ${validated?.structured?.nextAction?.detail || ""}`;
  return `${nextActionText} ${weeklyText} ${alertText}`.trim();
}

function scoreAudit({ scenario, validated, computedStrategy }) {
  if (!validated) {
    return { score: 0, findings: ["Audit failed to parse into a usable structured result."] };
  }

  const findings = [];
  let score = 100;
  const visibleText = extractVisibleText(validated);
  const nextActionText = `${validated?.structured?.nextAction?.title || ""} ${validated?.structured?.nextAction?.detail || ""}`.trim();
  const weeklyMoves = Array.isArray(validated?.structured?.weeklyMoves) ? validated.structured.weeklyMoves : [];
  const riskFlags = computedStrategy?.auditSignals?.riskFlags || [];
  const operationalSurplus = Number(computedStrategy?.operationalSurplus || 0);

  if (validated.mode === "DEGRADED") {
    score -= 35;
    findings.push("Audit fell back to deterministic degraded mode.");
  }
  if (validated.consistency?.scoreAnchoredToNative) {
    score -= 6;
    findings.push("Model health score drifted far enough that native re-anchoring was required.");
  }
  if (validated.consistency?.nextActionBackfilled || validated.consistency?.weeklyMovesBackfilled) {
    score -= 4;
    findings.push("Action plan needed deterministic re-anchoring.");
  }
  if (validated.consistency?.dashboardRepaired) {
    score -= 3;
    findings.push("Dashboard totals needed native repair.");
  }
  if (!validated?.structured?.nextAction?.detail) {
    score -= 10;
    findings.push("Next action is missing a concrete detail.");
  }
  if ((operationalSurplus > 0 || (scenario.expectations?.requiresProtectedObligationCoverage || []).length > 0) && !validated?.structured?.nextAction?.amount) {
    score -= 8;
    findings.push("Next action omitted a concrete dollar amount in a scenario that needed one.");
  }
  if (weeklyMoves.length === 0) {
    score -= 12;
    findings.push("No usable weekly move sequence was returned.");
  }
  if (/\bcredit card #?1\b|\bhighest interest credit card debt\b|\bthe user\b/i.test(visibleText)) {
    score -= 12;
    findings.push("Visible output still contains generic or non-user-facing placeholder copy.");
  }
  if (riskFlags.length > 0 && !includesAny(visibleText, riskFlags.map((flag) => String(flag).replaceAll("-", " ")))) {
    score -= 8;
    findings.push("Native risk flags were not clearly surfaced in the visible action copy.");
  }

  const obligationNames = scenario.expectations?.requiresProtectedObligationCoverage || [];
  if (obligationNames.length > 0 && !includesAny(visibleText, obligationNames)) {
    score -= 12;
    findings.push("The plan did not name the protected obligations that should drive the week.");
  }

  if (scenario.expectations?.disallowPrimaryDebtPaydown && /\bpay(?: down)?\b.*\b(card|debt)\b/i.test(nextActionText)) {
    score -= 10;
    findings.push("Next action still reads like debt paydown even though protected cash obligations should lead.");
  }

  if (scenario.expectations?.preferredDebtTarget && !includesAny(visibleText, [scenario.expectations.preferredDebtTarget])) {
    score -= 10;
    findings.push("The preferred promo/debt target was not named explicitly.");
  }

  if (scenario.expectations?.shouldOpenInvesting && !/open/i.test(String(validated?.investments?.gateStatus || ""))) {
    score -= 8;
    findings.push("Investing should have been open, but the gate stayed guarded.");
  }

  if (scenario.expectations?.shouldGuardInvesting && /open/i.test(String(validated?.investments?.gateStatus || ""))) {
    score -= 8;
    findings.push("Investing should have been guarded, but the gate remained open.");
  }

  if (scenario.expectations?.requiresLiveVsAuditAcknowledgement && !/override|live value|differs|divergence/i.test(visibleText)) {
    score -= 8;
    findings.push("The output did not acknowledge the live-vs-audit balance divergence.");
  }

  score = Math.max(0, Math.min(100, score));
  return { score, findings };
}

async function runAuditScenario(scenario, model) {
  const computedStrategy = generateStrategy(scenario.financialConfig, {
    checkingBalance: Number(scenario.form?.checking || 0),
    savingsTotal: Number(scenario.form?.savings || scenario.form?.ally || 0),
    cards: scenario.cards,
    nonCardDebts: scenario.financialConfig?.nonCardDebts || [],
    renewals: scenario.renewals,
    snapshotDate: scenario.form?.date,
  });
  const snapshot = buildScenarioSnapshot(scenario, model.provider, computedStrategy);
  const context = buildScenarioContext(scenario, model.provider, computedStrategy);

  const response = await fetch(`${TARGET_URL}/audit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Device-ID": DEVICE_ID,
      "X-App-Version": APP_VERSION,
      "X-Subscription-Tier": TESTING_TIER,
      "X-Catalyst-Testing": "1",
    },
    body: JSON.stringify({
      type: "audit",
      snapshot,
      context,
      history: [],
      model: model.id,
      provider: model.provider,
      stream: false,
      responseFormat: "json",
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    return {
      scenarioId: scenario.id,
      modelId: model.id,
      status: response.status,
      ok: false,
      error: payload?.error || `HTTP ${response.status}`,
    };
  }

  const parsed = parseAudit(payload.result);
  const validated = validateParsedAuditConsistency(parsed, buildValidationOptions(scenario, parsed, computedStrategy));
  const grade = scoreAudit({ scenario, validated, computedStrategy });

  return {
    scenarioId: scenario.id,
    modelId: model.id,
    ok: true,
    grade: grade.score,
    findings: grade.findings,
    mode: validated?.mode,
    status: validated?.status,
    nativeScore: computedStrategy?.auditSignals?.nativeScore?.score ?? null,
    finalScore: validated?.healthScore?.score ?? null,
    gateStatus: validated?.investments?.gateStatus ?? null,
    auditFlags: Array.isArray(validated?.auditFlags) ? validated.auditFlags.map((flag) => flag.code) : [],
    nextAction: validated?.structured?.nextAction || null,
    weeklyMoves: Array.isArray(validated?.structured?.weeklyMoves) ? validated.structured.weeklyMoves.slice(0, 3) : [],
  };
}

function summarizeResults(results) {
  const successful = results.filter((result) => result.ok);
  const byModel = new Map();
  for (const result of successful) {
    const bucket = byModel.get(result.modelId) || [];
    bucket.push(result);
    byModel.set(result.modelId, bucket);
  }

  const modelSummaries = [...byModel.entries()].map(([modelId, entries]) => {
    const grades = entries.map((entry) => entry.grade);
    return {
      modelId,
      avg: Number((grades.reduce((sum, value) => sum + value, 0) / grades.length).toFixed(1)),
      min: Math.min(...grades),
      max: Math.max(...grades),
      count: grades.length,
    };
  });

  return {
    total: results.length,
    successful: successful.length,
    failed: results.length - successful.length,
    overallAverage: successful.length
      ? Number((successful.reduce((sum, result) => sum + result.grade, 0) / successful.length).toFixed(1))
      : 0,
    overallMin: successful.length ? Math.min(...successful.map((result) => result.grade)) : 0,
    modelSummaries,
  };
}

async function main() {
  const scenarios = makeScenarios();
  const results = [];

  for (const scenario of scenarios) {
    for (const model of MODELS) {
      process.stdout.write(`Running ${scenario.id} on ${model.id}... `);
      const result = await runAuditScenario(scenario, model);
      results.push(result);
      if (!result.ok) {
        console.log(`FAILED (${result.status} ${result.error})`);
      } else {
        console.log(`${result.grade}/100`);
      }
    }
  }

  const summary = summarizeResults(results);
  console.log("\n=== Audit Evaluation Summary ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log("\n=== Detailed Results ===");
  console.log(JSON.stringify(results, null, 2));

  const failed = results.filter((result) => !result.ok || result.grade < 90);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
