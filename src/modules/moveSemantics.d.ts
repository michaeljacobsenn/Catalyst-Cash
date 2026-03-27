import type { BankAccount, Card, CatalystCashConfig, ParsedMoveItem } from "../types/index.js";

export interface MoveAssignment {
  sourceAccountId?: string | null;
  targetAccountId?: string | null;
}

export interface MoveAccountOption {
  id: string;
  label: string;
  accountType: string;
}

export interface MoveClassification {
  kind: string;
  amount?: number | null;
  transactional?: boolean;
  text?: string;
  targetId?: string | null;
  targetLabel?: string | null;
  targetKey?: string | null;
  contributionKey?: string | null;
  sourceId?: string | null;
  sourceLabel?: string | null;
  impliedCheckingSource?: boolean;
  fundingSourceId?: string | null;
  fundingSourceLabel?: string | null;
}

export interface MoveAssignmentOptions {
  classification: MoveClassification | null;
  targetOptions: MoveAccountOption[];
  sourceOptions: MoveAccountOption[];
}

export function normalizeMoveText(value: unknown): string;
export function parseMoveAmount(text: string): number | null;
export function normalizeMoveItems(rawMoveItems?: unknown, fallbackWeeklyMoves?: unknown[]): ParsedMoveItem[];
export function resolveMoveAction(input?: {
  move?: ParsedMoveItem | string | null;
  cards?: Card[];
  bankAccounts?: BankAccount[];
  financialConfig?: CatalystCashConfig;
  manualOnly?: boolean;
}): MoveClassification | null;
export function applyMoveAssignment(
  classification: MoveClassification | null,
  assignment?: MoveAssignment | null,
  bankAccounts?: BankAccount[]
): MoveClassification | null;
export function getMoveAssignmentOptions(input?: {
  move?: ParsedMoveItem | string | null;
  cards?: Card[];
  bankAccounts?: BankAccount[];
  financialConfig?: CatalystCashConfig;
  manualOnly?: boolean;
  assignment?: MoveAssignment | null;
}): MoveAssignmentOptions;
