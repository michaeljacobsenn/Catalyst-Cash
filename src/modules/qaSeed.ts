import type { BackupData, CatalystCashConfig, Card, Renewal, BankAccount } from "../types/index.js";

export const FULL_PROFILE_QA_LABEL = "Full-Profile QA Seed";

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
  "ai-model": "gemini-2.5-flash",
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
}
