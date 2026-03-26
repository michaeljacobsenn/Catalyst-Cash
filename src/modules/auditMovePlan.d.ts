import type { AuditRecord, BankAccount, Card } from "../types/index.js";

export interface AuditMovePlanTarget {
  id: string;
  label: string;
  actualBalance: number;
  delta: number;
  projectedBalance: number;
  remainingAmount: number;
  moveCount: number;
  moveTexts: string[];
}

export interface AuditMovePlanSummary {
  key: string;
  label: string;
  delta: number;
  moveCount: number;
  moveTexts: string[];
}

export interface AuditMovePlan {
  activeCount: number;
  matchedCount: number;
  reconciledCount: number;
  unresolvedMoves: string[];
  cardTargets: Record<string, AuditMovePlanTarget>;
  bankTargets: Record<string, AuditMovePlanTarget>;
  genericSummaries: AuditMovePlanSummary[];
  highlights: Array<AuditMovePlanTarget | AuditMovePlanSummary>;
  impliedCheckingDelta: number;
}

export function getActualCardBalance(card: Card): number;
export function getActualBankBalance(account: BankAccount): number;
export function buildAuditMovePlan(input?: {
  audit?: AuditRecord | null;
  cards?: Card[];
  bankAccounts?: BankAccount[];
}): AuditMovePlan;
