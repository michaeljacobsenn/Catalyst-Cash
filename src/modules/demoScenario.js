function toIsoDate(value) {
  return new Date(value).toISOString().split("T")[0];
}

function addDays(baseDate, days) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

function buildHoldingValues(holdings = {}) {
  return Object.entries(holdings).reduce((totals, [bucket, items]) => {
    totals[bucket] = (Array.isArray(items) ? items : []).reduce((sum, holding) => {
      return sum + ((Number(holding?.shares) || 0) * (Number(holding?.lastKnownPrice) || 0));
    }, 0);
    return totals;
  }, { roth: 0, brokerage: 0, k401: 0, crypto: 0, hsa: 0 });
}

export const DEMO_SCENARIO_ORDER = ["everyday_momentum", "debt_reset", "steady_builder", "wealth_builder"];

const DEMO_SCENARIO_PRESETS = {
  everyday_momentum: {
    id: "everyday_momentum",
    name: "Everyday Momentum",
    description: "Relatable salaried household with solid habits, modest net worth, and a clear next step.",
    preferredName: "Jordan Demo",
    nextRothContribution: 250,
    holdings: {
      k401: [{ symbol: "FXAIX", shares: "24", lastKnownPrice: 210 }],
      roth: [{ symbol: "VTI", shares: "14", lastKnownPrice: 275 }],
      brokerage: [{ symbol: "SCHD", shares: "24", lastKnownPrice: 365 }],
      crypto: [],
      hsa: [],
    },
    cards: [
      {
        institution: "Chase",
        name: "Freedom Unlimited",
        nickname: "Freedom",
        mask: "4211",
        balance: 0,
        limit: 9000,
        apr: 24.99,
        minPayment: 0,
        paymentDueDay: 21,
        statementCloseDay: 24,
        network: "visa",
      },
      {
        institution: "Capital One",
        name: "SavorOne Rewards",
        nickname: "Savor",
        mask: "1184",
        balance: 0,
        limit: 7000,
        apr: 26.24,
        minPayment: 0,
        paymentDueDay: 17,
        statementCloseDay: 20,
        network: "mastercard",
      },
    ],
    bankAccounts: [
      { bank: "Capital One", name: "Primary Checking", accountType: "checking", mask: "2190", balance: 3400 },
      { bank: "Ally", name: "Emergency Fund", accountType: "savings", mask: "3301", balance: 7600 },
      { bank: "Ally", name: "Short-Term Goals", accountType: "savings", mask: "8402", balance: 1400 },
    ],
    renewals: [
      { name: "Internet", amount: 68, category: "utilities", dueOffset: 26, chargedToType: "bank", chargedToAccountType: "checking" },
      { name: "Phone Plan", amount: 74, category: "utilities", dueOffset: 31, chargedToType: "bank", chargedToAccountType: "checking" },
      { name: "Spotify Family", amount: 19.99, category: "subs", dueOffset: 35, chargedToType: "card", chargedToIndex: 0 },
      { name: "Gym Membership", amount: 49, category: "health", dueOffset: 42, chargedToType: "card", chargedToIndex: 1 },
    ],
    budgetActuals: {
      Groceries: 132.18,
      Dining: 48.3,
      Transport: 39.42,
      Shopping: 44.91,
      Entertainment: 27.65,
    },
    parsedTransactions: [
      { daysAgo: 1, amount: 41.82, description: "Trader Joe's", category: "Groceries" },
      { daysAgo: 2, amount: 23.4, description: "Chipotle", category: "Dining" },
      { daysAgo: 3, amount: 39.42, description: "Shell", category: "Transport" },
      { daysAgo: 4, amount: 44.91, description: "Target", category: "Shopping" },
      { daysAgo: 5, amount: 27.65, description: "AMC Theatres", category: "Entertainment" },
    ],
    pendingCharges: [
      { amount: "42.60", description: "Electric utility autopay", confirmed: true },
      { amount: "18.35", description: "Coffee + grocery hold", confirmed: false },
    ],
    otherAssets: [{ name: "Paid-Off Car", type: "vehicle", value: 9500 }],
    savingsGoals: [
      { name: "Vacation Buffer", targetAmount: 2000, currentAmount: 1200, targetDateOffset: 90 },
      { name: "Next Car Down Payment", targetAmount: 8000, currentAmount: 2800, targetDateOffset: 200 },
    ],
    financialConfig: {
      paycheckStandard: 2400,
      payFrequency: "bi-weekly",
      payday: "Friday",
      paycheckUsableTime: "09:00",
      emergencyFloor: 800,
      weeklySpendAllowance: 425,
      greenStatusTarget: 2800,
      emergencyReserveTarget: 6000,
      vaultTarget: 2500,
      defaultAPR: 24.99,
      incomeType: "salary",
      incomeSources: [{ name: "Primary salary", amount: 2400, frequency: "bi-weekly" }],
      budgetCategories: [
        { name: "Groceries", monthlyTarget: 520, icon: "🛒" },
        { name: "Dining", monthlyTarget: 220, icon: "🍽️" },
        { name: "Transport", monthlyTarget: 190, icon: "🚗" },
        { name: "Shopping", monthlyTarget: 180, icon: "🛍️" },
        { name: "Entertainment", monthlyTarget: 140, icon: "🎬" },
      ],
      rothContributedYTD: 1450,
      rothAnnualLimit: 7000,
      k401ContributedYTD: 2500,
      k401AnnualLimit: 23000,
      taxBracketPercent: 22,
      notes:
        "Demo household is realistic and healthy: protect the checking floor, keep the reserve above target, and automate investing with ordinary income.",
    },
    formNotes:
      "Catalyst should keep the floor intact, respect the reserve target, and use the open cash to automate brokerage and Roth progress.",
    personalRules:
      "This demo should feel relatable. Do not manufacture panic when the fundamentals are healthy. Keep the floor intact, then automate slow, repeatable investing.",
  },
  debt_reset: {
    id: "debt_reset",
    name: "Debt Reset",
    description: "Normal-income household carrying credit card balances, with Catalyst focused on protecting cash and accelerating payoff.",
    preferredName: "Alex Demo",
    nextRothContribution: 0,
    holdings: {
      k401: [{ symbol: "FXAIX", shares: "18", lastKnownPrice: 210 }],
      roth: [{ symbol: "VTI", shares: "4", lastKnownPrice: 275 }],
      brokerage: [],
      crypto: [],
      hsa: [],
    },
    cards: [
      {
        institution: "Chase",
        name: "Freedom Unlimited",
        nickname: "Freedom",
        mask: "6632",
        balance: 2650,
        limit: 9000,
        apr: 28.24,
        minPayment: 75,
        paymentDueDay: 21,
        statementCloseDay: 24,
        network: "visa",
      },
      {
        institution: "Capital One",
        name: "SavorOne Rewards",
        nickname: "Savor",
        mask: "8427",
        balance: 1380,
        limit: 6000,
        apr: 29.24,
        minPayment: 45,
        paymentDueDay: 17,
        statementCloseDay: 20,
        network: "mastercard",
      },
    ],
    bankAccounts: [
      { bank: "Capital One", name: "Primary Checking", accountType: "checking", mask: "2190", balance: 2100 },
      { bank: "Ally", name: "Emergency Fund", accountType: "savings", mask: "3301", balance: 3200 },
      { bank: "Ally", name: "Bills Buffer", accountType: "savings", mask: "8402", balance: 900 },
    ],
    renewals: [
      { name: "Internet", amount: 68, category: "utilities", dueOffset: 26, chargedToType: "bank", chargedToAccountType: "checking" },
      { name: "Phone Plan", amount: 74, category: "utilities", dueOffset: 31, chargedToType: "bank", chargedToAccountType: "checking" },
      { name: "Spotify Family", amount: 19.99, category: "subs", dueOffset: 35, chargedToType: "card", chargedToIndex: 0 },
      { name: "Gym Membership", amount: 49, category: "health", dueOffset: 42, chargedToType: "card", chargedToIndex: 1 },
    ],
    budgetActuals: {
      Groceries: 126.42,
      Dining: 44.16,
      Transport: 37.9,
      Shopping: 21.34,
      Entertainment: 18.5,
    },
    parsedTransactions: [
      { daysAgo: 1, amount: 38.22, description: "Trader Joe's", category: "Groceries" },
      { daysAgo: 2, amount: 22.4, description: "Chipotle", category: "Dining" },
      { daysAgo: 3, amount: 37.9, description: "Shell", category: "Transport" },
      { daysAgo: 4, amount: 21.34, description: "Target", category: "Shopping" },
      { daysAgo: 5, amount: 18.5, description: "AMC Theatres", category: "Entertainment" },
    ],
    pendingCharges: [
      { amount: "42.60", description: "Electric utility autopay", confirmed: true },
      { amount: "26.10", description: "Groceries hold", confirmed: false },
    ],
    otherAssets: [{ name: "Paid-Off Car", type: "vehicle", value: 5500 }],
    savingsGoals: [
      { name: "Starter Emergency Goal", targetAmount: 5000, currentAmount: 4100, targetDateOffset: 75 },
      { name: "Credit Card Payoff Buffer", targetAmount: 2000, currentAmount: 900, targetDateOffset: 120 },
    ],
    financialConfig: {
      paycheckStandard: 2200,
      payFrequency: "bi-weekly",
      payday: "Friday",
      paycheckUsableTime: "09:00",
      emergencyFloor: 800,
      weeklySpendAllowance: 390,
      greenStatusTarget: 2500,
      emergencyReserveTarget: 5000,
      vaultTarget: 2200,
      defaultAPR: 28.99,
      incomeType: "salary",
      incomeSources: [{ name: "Primary salary", amount: 2200, frequency: "bi-weekly" }],
      budgetCategories: [
        { name: "Groceries", monthlyTarget: 500, icon: "🛒" },
        { name: "Dining", monthlyTarget: 180, icon: "🍽️" },
        { name: "Transport", monthlyTarget: 180, icon: "🚗" },
        { name: "Shopping", monthlyTarget: 120, icon: "🛍️" },
        { name: "Entertainment", monthlyTarget: 90, icon: "🎬" },
      ],
      rothContributedYTD: 0,
      rothAnnualLimit: 7000,
      k401ContributedYTD: 1200,
      k401AnnualLimit: 23000,
      taxBracketPercent: 22,
      notes:
        "Demo household is carrying manageable revolving debt. Catalyst should protect the floor, keep the reserve intact, and focus open cash on the highest-APR card.",
    },
    formNotes:
      "Protect the floor, keep the emergency cushion above the starter target, and send open cash to the highest APR card before optional investing.",
    personalRules:
      "Do not shame debt. Keep this realistic: protect the floor first, avoid draining the reserve, and route true surplus to the highest APR card.",
  },
  steady_builder: {
    id: "steady_builder",
    name: "Steady Builder",
    description: "Stronger household with larger reserves and investments, while still tied to everyday tradeoffs.",
    preferredName: "Taylor Demo",
    nextRothContribution: 450,
    holdings: {
      k401: [{ symbol: "FXAIX", shares: "80", lastKnownPrice: 320 }],
      roth: [{ symbol: "VTI", shares: "36", lastKnownPrice: 275 }],
      brokerage: [{ symbol: "VUG", shares: "64", lastKnownPrice: 290 }],
      crypto: [],
      hsa: [],
    },
    cards: [
      {
        institution: "Chase",
        name: "Chase Sapphire Preferred",
        nickname: "Sapphire",
        mask: "4321",
        balance: 0,
        limit: 18000,
        apr: 24.99,
        minPayment: 0,
        paymentDueDay: 21,
        statementCloseDay: 24,
        network: "visa",
        annualFee: 95,
        annualFeeDueOffset: 120,
      },
      {
        institution: "American Express",
        name: "American Express Gold",
        nickname: "Amex Gold",
        mask: "9876",
        balance: 0,
        limit: 20000,
        apr: 0,
        minPayment: 0,
        paymentDueDay: 17,
        statementCloseDay: 20,
        network: "amex",
        annualFee: 325,
        annualFeeDueOffset: 180,
      },
      {
        institution: "Fidelity",
        name: "Fidelity Rewards Visa Signature",
        nickname: "Fidelity Visa",
        mask: "5512",
        balance: 0,
        limit: 15000,
        apr: 21.24,
        minPayment: 0,
        paymentDueDay: 12,
        statementCloseDay: 15,
        network: "visa",
      },
    ],
    bankAccounts: [
      { bank: "Schwab", name: "Investor Checking", accountType: "checking", mask: "7890", balance: 6200 },
      { bank: "Ally", name: "Emergency Reserve", accountType: "savings", mask: "1234", balance: 13500 },
      { bank: "Ally", name: "Opportunity Fund", accountType: "savings", mask: "2468", balance: 4500 },
    ],
    renewals: [
      { name: "Internet", amount: 75, category: "utilities", dueOffset: 28, chargedToType: "bank", chargedToAccountType: "checking" },
      { name: "Mobile Plan", amount: 85, category: "utilities", dueOffset: 33, chargedToType: "bank", chargedToAccountType: "checking" },
      { name: "Netflix", amount: 15.49, category: "subs", dueOffset: 36, chargedToType: "card", chargedToIndex: 0 },
      { name: "Gym Membership", amount: 59, category: "health", dueOffset: 41, chargedToType: "card", chargedToIndex: 1 },
      { name: "Car Insurance", amount: 162, category: "insurance", dueOffset: 47, chargedToType: "bank", chargedToAccountType: "checking" },
    ],
    budgetActuals: {
      Groceries: 188.12,
      Dining: 84.55,
      Transport: 62.4,
      Shopping: 91.25,
      Entertainment: 61.02,
    },
    parsedTransactions: [
      { daysAgo: 1, amount: 54.28, description: "Trader Joe's", category: "Groceries" },
      { daysAgo: 2, amount: 36.44, description: "Sweetgreen", category: "Dining" },
      { daysAgo: 3, amount: 62.4, description: "Chevron", category: "Transport" },
      { daysAgo: 4, amount: 91.25, description: "Target", category: "Shopping" },
      { daysAgo: 5, amount: 61.02, description: "AMC Theatres", category: "Entertainment" },
    ],
    pendingCharges: [
      { amount: "128.24", description: "Electric utility autopay", confirmed: true },
      { amount: "36.41", description: "Coffee + grocery hold", confirmed: false },
    ],
    otherAssets: [
      { name: "Home Equity", type: "property", value: 18000 },
      { name: "Paid-Off Car", type: "vehicle", value: 10000 },
    ],
    savingsGoals: [
      { name: "Travel Fund", targetAmount: 4500, currentAmount: 3100, targetDateOffset: 110 },
      { name: "Home Projects", targetAmount: 7000, currentAmount: 3800, targetDateOffset: 180 },
    ],
    financialConfig: {
      paycheckStandard: 3200,
      payFrequency: "bi-weekly",
      payday: "Friday",
      paycheckUsableTime: "09:00",
      emergencyFloor: 1000,
      weeklySpendAllowance: 575,
      greenStatusTarget: 4800,
      emergencyReserveTarget: 12000,
      vaultTarget: 7000,
      defaultAPR: 24.99,
      incomeType: "salary",
      incomeSources: [{ name: "Primary salary", amount: 3200, frequency: "bi-weekly" }],
      budgetCategories: [
        { name: "Groceries", monthlyTarget: 700, icon: "🛒" },
        { name: "Dining", monthlyTarget: 350, icon: "🍽️" },
        { name: "Transport", monthlyTarget: 220, icon: "🚗" },
        { name: "Shopping", monthlyTarget: 250, icon: "🛍️" },
        { name: "Entertainment", monthlyTarget: 180, icon: "🎬" },
      ],
      rothContributedYTD: 2400,
      rothAnnualLimit: 7000,
      k401ContributedYTD: 6200,
      k401AnnualLimit: 23000,
      taxBracketPercent: 24,
      notes:
        "Demo household is already disciplined. Catalyst should reinforce the floor, keep the reserve target protected, and route open cash into long-term investing.",
    },
    formNotes:
      "No revolving debt. Protect the operating floor, then route the extra cash into brokerage and Roth contributions.",
    personalRules:
      "Do not manufacture caution when reserves, utilization, and surplus are all strong. Keep the floor intact, then deploy surplus into long-term investing.",
  },
  wealth_builder: {
    id: "wealth_builder",
    name: "Wealth Builder",
    description: "Higher-net-worth household that shows how Catalyst still matters after the basics are already solved.",
    preferredName: "Catalyst Demo",
    nextRothContribution: 700,
    holdings: {
      k401: [{ symbol: "FXAIX", shares: "230", lastKnownPrice: 420 }],
      roth: [{ symbol: "VTI", shares: "64", lastKnownPrice: 275 }],
      brokerage: [{ symbol: "VUG", shares: "120", lastKnownPrice: 240 }],
      crypto: [],
      hsa: [],
    },
    cards: [
      {
        institution: "Chase",
        name: "Chase Sapphire Preferred",
        nickname: "Sapphire",
        mask: "4321",
        balance: 0,
        limit: 18000,
        apr: 24.99,
        minPayment: 0,
        paymentDueDay: 21,
        statementCloseDay: 24,
        network: "visa",
        annualFee: 95,
        annualFeeDueOffset: 120,
      },
      {
        institution: "American Express",
        name: "American Express Gold",
        nickname: "Amex Gold",
        mask: "9876",
        balance: 0,
        limit: 20000,
        apr: 0,
        minPayment: 0,
        paymentDueDay: 17,
        statementCloseDay: 20,
        network: "amex",
        annualFee: 325,
        annualFeeDueOffset: 180,
      },
      {
        institution: "Fidelity",
        name: "Fidelity Rewards Visa Signature",
        nickname: "Fidelity Visa",
        mask: "5512",
        balance: 0,
        limit: 15000,
        apr: 21.24,
        minPayment: 0,
        paymentDueDay: 12,
        statementCloseDay: 15,
        network: "visa",
      },
    ],
    bankAccounts: [
      { bank: "Schwab", name: "Investor Checking", accountType: "checking", mask: "7890", balance: 9800 },
      { bank: "Ally", name: "Emergency Reserve", accountType: "savings", mask: "1234", balance: 24000 },
      { bank: "Ally", name: "Opportunity Fund", accountType: "savings", mask: "2468", balance: 8000 },
    ],
    renewals: [
      { name: "Internet", amount: 75, category: "utilities", dueOffset: 28, chargedToType: "bank", chargedToAccountType: "checking" },
      { name: "Mobile Plan", amount: 85, category: "utilities", dueOffset: 33, chargedToType: "bank", chargedToAccountType: "checking" },
      { name: "Netflix", amount: 15.49, category: "subs", dueOffset: 36, chargedToType: "card", chargedToIndex: 0 },
      { name: "Gym Membership", amount: 59, category: "health", dueOffset: 41, chargedToType: "card", chargedToIndex: 1 },
      { name: "Car Insurance", amount: 162, category: "insurance", dueOffset: 47, chargedToType: "bank", chargedToAccountType: "checking" },
    ],
    budgetActuals: {
      Groceries: 188.12,
      Dining: 84.55,
      Transport: 62.4,
      Shopping: 91.25,
      Entertainment: 61.02,
    },
    parsedTransactions: [
      { daysAgo: 1, amount: 54.28, description: "Trader Joe's", category: "Groceries" },
      { daysAgo: 2, amount: 36.44, description: "Sweetgreen", category: "Dining" },
      { daysAgo: 3, amount: 62.4, description: "Chevron", category: "Transport" },
      { daysAgo: 4, amount: 91.25, description: "Target", category: "Shopping" },
      { daysAgo: 5, amount: 61.02, description: "AMC Theatres", category: "Entertainment" },
    ],
    pendingCharges: [
      { amount: "128.24", description: "Electric utility autopay", confirmed: true },
      { amount: "36.41", description: "Coffee + grocery hold", confirmed: false },
    ],
    otherAssets: [
      { name: "Home Equity", type: "property", value: 85000 },
      { name: "Paid-Off Car", type: "vehicle", value: 18000 },
    ],
    savingsGoals: [
      { name: "Travel Fund", targetAmount: 3500, currentAmount: 2400, targetDateOffset: 110 },
      { name: "Home Projects", targetAmount: 6000, currentAmount: 2100, targetDateOffset: 180 },
    ],
    financialConfig: {
      paycheckStandard: 3900,
      payFrequency: "bi-weekly",
      payday: "Friday",
      paycheckUsableTime: "09:00",
      emergencyFloor: 1200,
      weeklySpendAllowance: 650,
      greenStatusTarget: 6500,
      emergencyReserveTarget: 18000,
      vaultTarget: 10000,
      defaultAPR: 24.99,
      incomeType: "salary",
      incomeSources: [{ name: "Primary salary", amount: 3900, frequency: "bi-weekly" }],
      budgetCategories: [
        { name: "Groceries", monthlyTarget: 700, icon: "🛒" },
        { name: "Dining", monthlyTarget: 350, icon: "🍽️" },
        { name: "Transport", monthlyTarget: 220, icon: "🚗" },
        { name: "Shopping", monthlyTarget: 250, icon: "🛍️" },
        { name: "Entertainment", monthlyTarget: 180, icon: "🎬" },
      ],
      rothContributedYTD: 2900,
      rothAnnualLimit: 7000,
      k401ContributedYTD: 8800,
      k401AnnualLimit: 23000,
      taxBracketPercent: 24,
      notes:
        "Demo household is debt-free, keeps the operating floor protected, and sweeps true surplus into Roth and brokerage contributions.",
    },
    formNotes:
      "No revolving debt. Protect the operating floor, then route the extra cash into brokerage and Roth contributions.",
    personalRules:
      "Do not manufacture caution when reserves, utilization, and surplus are all strong. Keep the floor intact, then deploy surplus into long-term investing.",
  },
};

function getScenarioPreset(scenarioId) {
  return DEMO_SCENARIO_PRESETS[scenarioId] || DEMO_SCENARIO_PRESETS[DEMO_SCENARIO_ORDER[0]];
}

function scenarioTag(scenarioId) {
  return String(scenarioId || "demo").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

function buildCards(cards = [], scenarioId, today) {
  return cards.map((card, index) => ({
    id: `demo-${scenarioTag(scenarioId)}-card-${index + 1}`,
    institution: card.institution,
    name: card.name,
    nickname: card.nickname,
    mask: card.mask,
    balance: Number(card.balance) || 0,
    limit: card.limit,
    apr: card.apr,
    minPayment: Number(card.minPayment) || 0,
    paymentDueDay: card.paymentDueDay,
    statementCloseDay: card.statementCloseDay,
    lastPaymentDate: today.toISOString(),
    network: card.network,
    ...(Number.isFinite(card.annualFee) ? { annualFee: card.annualFee, annualFeeDue: addDays(today, card.annualFeeDueOffset || 120) } : {}),
  }));
}

function buildBankAccounts(bankAccounts = [], scenarioId, today) {
  return bankAccounts.map((account, index) => ({
    id: `demo-${scenarioTag(scenarioId)}-${account.accountType}-${index + 1}`,
    bank: account.bank,
    name: account.name,
    accountType: account.accountType,
    mask: account.mask,
    balance: account.balance,
    _plaidBalance: account.balance,
    _plaidAvailable: account.balance,
    type: "depository",
    subtype: account.accountType,
    date: today.toISOString(),
  }));
}

function buildRenewals(renewals = [], scenarioId, today, cards, bankAccounts) {
  return renewals.map((renewal, index) => {
    const linkedCard = renewal.chargedToType === "card" ? cards[renewal.chargedToIndex || 0] : null;
    const linkedBank = renewal.chargedToType === "bank"
      ? bankAccounts.find((account) => account.accountType === renewal.chargedToAccountType) || bankAccounts[0]
      : null;
    return {
      id: `demo-${scenarioTag(scenarioId)}-ren-${index + 1}`,
      name: renewal.name,
      amount: renewal.amount,
      interval: 1,
      intervalUnit: "months",
      nextDue: addDays(today, renewal.dueOffset || 30),
      category: renewal.category,
      chargedTo: linkedCard?.name || linkedBank?.name || "Checking",
      chargedToType: renewal.chargedToType,
    };
  });
}

function buildTransactions(transactions = [], today) {
  return transactions.map((transaction) => ({
    date: addDays(today, -(transaction.daysAgo || 0)),
    amount: transaction.amount,
    description: transaction.description,
    category: transaction.category,
  }));
}

function buildGoals(goals = [], today) {
  return goals.map((goal) => ({
    name: goal.name,
    targetAmount: goal.targetAmount,
    currentAmount: goal.currentAmount,
    targetDate: addDays(today, goal.targetDateOffset || 120),
  }));
}

export function getDefaultDemoScenarioId() {
  return DEMO_SCENARIO_ORDER[0];
}

export function getNextDemoScenarioId(currentScenarioId) {
  const currentIndex = DEMO_SCENARIO_ORDER.indexOf(currentScenarioId);
  if (currentIndex === -1) return DEMO_SCENARIO_ORDER[0];
  return DEMO_SCENARIO_ORDER[(currentIndex + 1) % DEMO_SCENARIO_ORDER.length];
}

export function getDemoScenarioMeta(scenarioId) {
  const preset = getScenarioPreset(scenarioId);
  return {
    id: preset.id,
    name: preset.name,
    description: preset.description,
  };
}

export function getAllDemoScenarioMetas() {
  return DEMO_SCENARIO_ORDER.map((scenarioId) => getDemoScenarioMeta(scenarioId));
}

export function buildDemoScenario(referenceDate = new Date(), scenarioId = getDefaultDemoScenarioId()) {
  const today = new Date(referenceDate);
  const todayStr = toIsoDate(today);
  const preset = getScenarioPreset(scenarioId);
  const cards = buildCards(preset.cards, preset.id, today);
  const bankAccounts = buildBankAccounts(preset.bankAccounts, preset.id, today);
  const renewals = buildRenewals(preset.renewals, preset.id, today, cards, bankAccounts);
  const parsedTransactions = buildTransactions(preset.parsedTransactions, today);
  const budgetActuals = { ...preset.budgetActuals };
  const pendingCharges = (preset.pendingCharges || []).map((charge) => ({ ...charge }));
  const otherAssets = (preset.otherAssets || []).map((asset) => ({ ...asset }));
  const savingsGoals = buildGoals(preset.savingsGoals, today);
  const holdings = {
    k401: (preset.holdings?.k401 || []).map((holding, index) => ({ id: `demo-${scenarioTag(preset.id)}-k401-${index + 1}`, ...holding })),
    roth: (preset.holdings?.roth || []).map((holding, index) => ({ id: `demo-${scenarioTag(preset.id)}-roth-${index + 1}`, ...holding })),
    brokerage: (preset.holdings?.brokerage || []).map((holding, index) => ({ id: `demo-${scenarioTag(preset.id)}-brokerage-${index + 1}`, ...holding })),
    crypto: [],
    hsa: [],
  };
  const holdingValues = buildHoldingValues(holdings);
  const investmentTotal = holdingValues.k401 + holdingValues.roth + holdingValues.brokerage;
  const totalSavings = bankAccounts
    .filter((account) => account.accountType === "savings")
    .reduce((sum, account) => sum + (Number(account.balance) || 0), 0);
  const checkingBalance = bankAccounts
    .filter((account) => account.accountType !== "savings")
    .reduce((sum, account) => sum + (Number(account.balance) || 0), 0);
  const otherAssetsTotal = otherAssets.reduce((sum, asset) => sum + (Number(asset?.value) || 0), 0);
  const pendingTotal = pendingCharges.reduce((sum, charge) => sum + (Number(charge?.amount) || 0), 0);
  const debtTotal = cards.reduce((sum, card) => sum + (Number(card?.balance) || 0), 0);
  const netWorth = checkingBalance + totalSavings + investmentTotal + otherAssetsTotal - debtTotal;

  const financialConfig = {
    preferredName: preset.preferredName,
    trackChecking: true,
    trackSavings: true,
    trackBrokerage: true,
    trackRothContributions: true,
    track401k: true,
    trackCrypto: false,
    trackHSA: false,
    enableHoldings: true,
    holdings,
    lastCheckingBalance: checkingBalance,
    investmentBrokerage: holdingValues.brokerage,
    investmentRoth: holdingValues.roth,
    k401Balance: holdingValues.k401,
    otherAssets,
    savingsGoals,
    ...preset.financialConfig,
  };

  const form = {
    date: todayStr,
    time: "08:30",
    checking: String(checkingBalance),
    savings: "",
    ally: String(totalSavings),
    debts: cards
      .filter((card) => Number(card.balance) > 0)
      .map((card) => ({
        cardId: card.id,
        name: card.nickname || card.name,
        balance: String(card.balance),
        apr: String(card.apr || 0),
        minPayment: String(card.minPayment || 0),
        limit: String(card.limit || 0),
      })),
    pendingCharges,
    notes: preset.formNotes,
    autoPaycheckAdd: false,
    paycheckAddOverride: "",
    habitCount: 0,
    roth: String(holdingValues.roth),
    brokerage: String(holdingValues.brokerage),
    k401Balance: String(holdingValues.k401),
    investments: [
      { id: `demo-${scenarioTag(preset.id)}-invest-roth`, bucket: "roth", amount: holdingValues.roth },
      { id: `demo-${scenarioTag(preset.id)}-invest-brokerage`, bucket: "brokerage", amount: holdingValues.brokerage },
      { id: `demo-${scenarioTag(preset.id)}-invest-k401`, bucket: "k401", amount: holdingValues.k401 },
    ],
    includedInvestmentKeys: ["roth", "brokerage", "k401"],
    budgetActuals,
  };

  return {
    scenarioId: preset.id,
    scenarioMeta: getDemoScenarioMeta(preset.id),
    today,
    todayStr,
    cards,
    bankAccounts,
    renewals,
    parsedTransactions,
    budgetActuals,
    holdingValues,
    investmentTotal,
    otherAssetsTotal,
    debtTotal,
    pendingTotal,
    netWorth,
    financialConfig,
    form,
    nextRothContribution: preset.nextRothContribution,
    personalRules: preset.personalRules,
  };
}
