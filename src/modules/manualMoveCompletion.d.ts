import type { BankAccount, Card, CatalystCashConfig, ParsedMoveItem } from "../types/index.js";

export interface ApplyManualMoveCompletionInput {
  moveText?: string;
  move?: ParsedMoveItem | null;
  assignment?: {
    sourceAccountId?: string | null;
    targetAccountId?: string | null;
  } | null;
  cards?: Card[];
  bankAccounts?: BankAccount[];
  financialConfig?: CatalystCashConfig;
}

export interface ApplyManualMoveCompletionResult {
  applied: boolean;
  updatedCards: Card[];
  updatedBankAccounts: BankAccount[];
  updatedFinancialConfig: CatalystCashConfig;
  summary: string | null;
}

export function applyManualMoveCompletion(
  input?: ApplyManualMoveCompletionInput
): ApplyManualMoveCompletionResult;
