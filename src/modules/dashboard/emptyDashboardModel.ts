import type { CatalystCashConfig } from "../../types/index.js";

interface EmptyDashboardSetupInput {
  cards?: unknown[];
  bankAccounts?: unknown[];
  renewals?: unknown[];
  plaidInvestments?: unknown[];
  financialConfig?: Partial<CatalystCashConfig> | null;
}

export interface EmptyDashboardSetupState {
  hasProfile: boolean;
  hasConnectedAccounts: boolean;
  hasRenewals: boolean;
  connectedAccountCount: number;
  connectedInputCount: number;
  completedSteps: number;
  progressPct: number;
}

function safeCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

export function deriveEmptyDashboardSetupState({
  cards = [],
  bankAccounts = [],
  renewals = [],
  plaidInvestments = [],
  financialConfig = null,
}: EmptyDashboardSetupInput): EmptyDashboardSetupState {
  const hasProfile =
    Boolean(financialConfig?.paycheckStandard) ||
    Boolean(financialConfig?.averagePaycheck) ||
    Boolean(financialConfig?.hourlyRateNet) ||
    Boolean(financialConfig?.weeklySpendAllowance);

  const connectedAccountCount = safeCount(cards) + safeCount(bankAccounts) + safeCount(plaidInvestments);
  const hasConnectedAccounts = connectedAccountCount > 0;
  const hasRenewals = safeCount(renewals) > 0;
  const completedSteps = [hasProfile, hasConnectedAccounts, hasRenewals].filter(Boolean).length;

  return {
    hasProfile,
    hasConnectedAccounts,
    hasRenewals,
    connectedAccountCount,
    connectedInputCount: connectedAccountCount + safeCount(renewals),
    completedSteps,
    progressPct: (completedSteps / 3) * 100,
  };
}
