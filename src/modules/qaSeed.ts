import type { BackupData,BankAccount,Card,CatalystCashConfig,Renewal } from "../types/index.js";

export const FULL_PROFILE_QA_LABEL = "Full-Profile QA Seed";
export const FULL_PROFILE_QA_ACTIVE_KEY = "full-profile-qa-seed-active";

export const FULL_PROFILE_QA_CONFIG: Partial<CatalystCashConfig> = {
  incomeType: "salary",
  payFrequency: "bi-weekly",
  payday: "Friday",
  paycheckStandard: 3200,
  paycheckFirstOfMonth: 2800,
  weeklySpendAllowance: 425,
  emergencyFloor: 1500,
  greenStatusTarget: 4200,
  emergencyReserveTarget: 18000,
  defaultAPR: 22.99,
  arbitrageTargetAPR: 6,
  currencyCode: "USD",
  stateCode: "CA",
  birthYear: 1991,
  housingType: "rent",
  monthlyRent: 2100,
  isContractor: false,
  trackChecking: true,
  trackSavings: true,
  trackBrokerage: true,
  trackRoth: true,
  track401k: true,
  trackHSA: true,
  k401Balance: 18400,
  investmentBrokerage: 9600,
  investmentRoth: 7200,
  hsaBalance: 2100,
  creditScore: 742,
  creditUtilization: 18,
  taxWithholdingRate: 24,
  savingsGoals: [
    { id: "qa-goal-emergency", name: "Emergency Fund", target: 18000, saved: 6100 },
    { id: "qa-goal-travel", name: "Summer Travel", target: 3500, saved: 900 },
  ],
  budgetCategories: [
    { id: "housing", name: "Housing", monthlyTarget: 2100, group: "Needs" },
    { id: "groceries", name: "Groceries", monthlyTarget: 650, group: "Needs" },
    { id: "transport", name: "Transport", monthlyTarget: 250, group: "Needs" },
    { id: "fun", name: "Fun", monthlyTarget: 300, group: "Wants" },
  ],
  nonCardDebts: [
    { id: "qa-student-loan", name: "Student Loan", balance: 13200, apr: 5.4, minPayment: 210, type: "student-loan" },
  ],
};

export const FULL_PROFILE_QA_CARDS: Card[] = [
  {
    id: "qa-chase-freedom",
    institution: "Chase",
    issuer: "Chase",
    network: "Visa",
    name: "Freedom Unlimited",
    limit: 12000,
    balance: 1460,
    apr: 24.99,
    minPayment: 45,
    statementCloseDay: 21,
    paymentDueDay: 17,
    annualFee: 0,
  } as Card,
  {
    id: "qa-amex-gold",
    institution: "American Express",
    issuer: "American Express",
    network: "Amex",
    name: "Gold Card",
    limit: 8000,
    balance: 720,
    apr: 0,
    minPayment: 0,
    annualFee: 325,
  } as Card,
];

export const FULL_PROFILE_QA_BANKS: BankAccount[] = [
  {
    id: "qa-checking",
    bank: "Ally",
    accountType: "checking",
    name: "Primary Checking",
    balance: 4625,
  },
  {
    id: "qa-savings",
    bank: "Ally",
    accountType: "savings",
    name: "Emergency Savings",
    balance: 6150,
    apy: 4.2,
  },
];

export const FULL_PROFILE_QA_RENEWALS: Renewal[] = [
  {
    id: "qa-rent",
    name: "Rent",
    amount: 2100,
    interval: 1,
    intervalUnit: "months",
    cadence: "1 month",
    category: "housing",
    nextDue: "2026-04-01",
    source: "QA Seed",
  },
  {
    id: "qa-netflix",
    name: "Netflix",
    amount: 15.49,
    interval: 1,
    intervalUnit: "months",
    cadence: "1 month",
    category: "subs",
    nextDue: "2026-03-28",
    source: "QA Seed",
  },
  {
    id: "qa-gym",
    name: "Gym Membership",
    amount: 69,
    interval: 1,
    intervalUnit: "months",
    cadence: "1 month",
    category: "health",
    nextDue: "2026-03-24",
    source: "QA Seed",
  },
];

export const FULL_PROFILE_QA_STORAGE: BackupData = {
  "financial-config": FULL_PROFILE_QA_CONFIG as unknown as BackupData[string],
  "bank-accounts": FULL_PROFILE_QA_BANKS as unknown as BackupData[string],
  "card-portfolio": FULL_PROFILE_QA_CARDS as unknown as BackupData[string],
  renewals: FULL_PROFILE_QA_RENEWALS as unknown as BackupData[string],
  "ai-provider": "backend",
  "ai-model": "gpt-5-nano",
  "ai-consent-accepted": true,
  "personal-rules": "Prioritize cash safety first, then highest-interest debt payoff.",
  "onboarding-complete": true,
  "current-audit": null,
  "audit-history": [],
  "move-states": {},
};

export async function applyFullProfileQaSeed(db: { set: (key: string, value: unknown) => Promise<unknown> | unknown }) {
  for (const [key, value] of Object.entries(FULL_PROFILE_QA_STORAGE)) {
    await db.set(key, value);
  }
  await db.set(FULL_PROFILE_QA_ACTIVE_KEY, true);
}

const FULL_PROFILE_QA_CARD_IDS = new Set(FULL_PROFILE_QA_CARDS.map((card) => String(card.id || "").trim()).filter(Boolean));
const FULL_PROFILE_QA_BANK_IDS = new Set(FULL_PROFILE_QA_BANKS.map((account) => String(account.id || "").trim()).filter(Boolean));
const FULL_PROFILE_QA_RENEWAL_IDS = new Set(FULL_PROFILE_QA_RENEWALS.map((renewal) => String(renewal.id || "").trim()).filter(Boolean));

export function isFullProfileQaCard(card?: Partial<Card> | null) {
  return FULL_PROFILE_QA_CARD_IDS.has(String(card?.id || "").trim());
}

export function isFullProfileQaBankAccount(account?: Partial<BankAccount> | null) {
  return FULL_PROFILE_QA_BANK_IDS.has(String(account?.id || "").trim());
}

export function isFullProfileQaRenewal(renewal?: Partial<Renewal> | null) {
  const renewalId = String(renewal?.id || "").trim();
  return FULL_PROFILE_QA_RENEWAL_IDS.has(renewalId) || String(renewal?.source || "").trim() === "QA Seed";
}

export function stripFullProfileQaRecords({
  cards = [],
  bankAccounts = [],
  renewals = [],
}: {
  cards?: Card[];
  bankAccounts?: BankAccount[];
  renewals?: Renewal[];
}) {
  const filteredCards = cards.filter((card) => !isFullProfileQaCard(card));
  const filteredBankAccounts = bankAccounts.filter((account) => !isFullProfileQaBankAccount(account));
  const filteredRenewals = renewals.filter((renewal) => !isFullProfileQaRenewal(renewal));

  return {
    cards: filteredCards,
    bankAccounts: filteredBankAccounts,
    renewals: filteredRenewals,
    removedCardCount: cards.length - filteredCards.length,
    removedBankAccountCount: bankAccounts.length - filteredBankAccounts.length,
    removedRenewalCount: renewals.length - filteredRenewals.length,
  };
}

export function shouldRecoverFromFullProfileQaSeed({
  qaSeedActive = false,
  cards = [],
  bankAccounts = [],
  renewals = [],
  plaidConnections = [],
}: {
  qaSeedActive?: boolean;
  cards?: Card[];
  bankAccounts?: BankAccount[];
  renewals?: Renewal[];
  plaidConnections?: Array<{ id?: string | null }>;
}) {
  const hasPlaidConnections = plaidConnections.some((connection) => String(connection?.id || "").trim());
  if (!hasPlaidConnections) return false;

  const hasLocalPlaidLinks =
    cards.some((card) => card?._plaidAccountId || card?._plaidConnectionId) ||
    bankAccounts.some((account) => account?._plaidAccountId || account?._plaidConnectionId);
  if (hasLocalPlaidLinks) return false;

  const stripped = stripFullProfileQaRecords({ cards, bankAccounts, renewals });
  const removedFixtureCount =
    stripped.removedCardCount + stripped.removedBankAccountCount + stripped.removedRenewalCount;

  return qaSeedActive || removedFixtureCount > 0;
}
