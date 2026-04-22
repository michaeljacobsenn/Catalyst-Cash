import type {
  AuditFormData,
  AuditFormDebt,
  AuditRecord,
  BankAccount,
  Card,
  CatalystCashConfig,
} from "../../../types/index.js";
import { resolveCardLabel } from "../../cards.js";
import { buildSnapshotMessage } from "../../buildSnapshotMessage.js";
import { DEFAULT_FINANCIAL_CONFIG } from "../../contexts/SettingsContext.js";
import { getPlaidAutoFill } from "../../plaid/autoFill.js";
import type { InputDebt, InputFormState } from "./model.js";
import { toMoneyInput, toNumber } from "./utils.js";

interface PlaidAutoFillData {
  checking: number | null;
  vault: number | null;
  debts: InputDebt[];
  lastSync?: string | null;
}

interface OverridePlaidState {
  checking?: boolean;
  vault?: boolean;
  debts?: Record<string, boolean | undefined>;
}

interface CardSelectGroup {
  label: string;
  options: Array<{
    value: string;
    label: string;
  }>;
}

type SelectableCard = Pick<Card, "institution" | "id" | "name" | "nickname">;

export interface AddableDebtCard {
  cardId: string;
  institution: string;
  name: string;
}

interface MergeLastAuditParams {
  previousForm: InputFormState;
  lastAudit: AuditRecord | null | undefined;
  cards: Card[];
  bankAccounts: BankAccount[];
  financialConfig?: Partial<CatalystCashConfig> | null | undefined;
  today: Date;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function formatFormDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatFormTime(date: Date) {
  return date.toTimeString().slice(0, 5);
}

function bucketHasConcreteInvestmentSource(
  config: Partial<CatalystCashConfig> | null | undefined,
  bucket: "roth" | "brokerage" | "k401"
) {
  const livePlaidBucket = Array.isArray(config?.plaidInvestments)
    && config.plaidInvestments.some(
      (account) => account?.bucket === bucket && Number(account?._plaidBalance || 0) > 0
    );
  const hasManualHoldings = Boolean(config?.enableHoldings)
    && Array.isArray(config?.holdings?.[bucket])
    && config.holdings[bucket].length > 0;
  return livePlaidBucket || hasManualHoldings;
}

export function suppressRedundantManualInvestmentSeeds(
  form: InputFormState,
  config: Partial<CatalystCashConfig> | null | undefined
): InputFormState {
  let changed = false;
  const next = { ...form };
  if (bucketHasConcreteInvestmentSource(config, "roth") && String(form.roth ?? "").trim() !== "") {
    next.roth = "";
    changed = true;
  }
  if (bucketHasConcreteInvestmentSource(config, "brokerage") && String(form.brokerage ?? "").trim() !== "") {
    next.brokerage = "";
    changed = true;
  }
  if (bucketHasConcreteInvestmentSource(config, "k401") && String(form.k401Balance ?? "").trim() !== "") {
    next.k401Balance = "";
    changed = true;
  }
  return changed ? next : form;
}

function normalizeLookupKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeCardId(value: unknown) {
  return String(value || "").trim();
}

function buildCardIdByName(cards: Card[] = []) {
  const lookup = new Map<string, string>();
  for (const card of cards) {
    const cardId = normalizeCardId(card?.id);
    if (!cardId) continue;
    for (const candidate of [card?.nickname, card?.name]) {
      const key = normalizeLookupKey(candidate);
      if (key && !lookup.has(key)) {
        lookup.set(key, cardId);
      }
    }
  }
  return lookup;
}

function normalizeDebtRow(
  debt: AuditFormDebt | InputDebt | null | undefined,
  cardIdByName: Map<string, string> = new Map()
) {
  if (!debt) return null;
  const rawName = String(debt.name || "").trim();
  const matchedCardId = rawName ? cardIdByName.get(normalizeLookupKey(rawName)) || "" : "";
  const cardId = normalizeCardId(debt.cardId) || matchedCardId;
  const name = rawName || (cardId ? "Linked debt" : "");
  if (!name && !cardId) return null;

  const rawBalance = debt.balance ?? debt.amount;
  const balance =
    typeof rawBalance === "number" || typeof rawBalance === "string"
      ? rawBalance
      : toMoneyInput(toNumber(rawBalance));

  return {
    ...debt,
    cardId,
    name,
    balance,
  } satisfies InputDebt;
}

function normalizeDebtRows(
  debts: Array<AuditFormDebt | InputDebt> = [],
  cards: Card[] = [],
  options: { positiveOnly?: boolean } = {}
) {
  const cardIdByName = buildCardIdByName(cards);
  return debts.reduce<InputDebt[]>((rows, debt) => {
    const normalized = normalizeDebtRow(debt, cardIdByName);
    if (!normalized) return rows;
    if (options.positiveOnly && toNumber(normalized.balance) <= 0) return rows;
    rows.push(normalized);
    return rows;
  }, []);
}

function mergeDebtSnapshots({
  previousDebts = [],
  freshDebts = [],
  overriddenDebtIds = {},
  deletedDebtCardIds = {},
}: {
  previousDebts?: InputDebt[];
  freshDebts?: InputDebt[];
  overriddenDebtIds?: Record<string, boolean | undefined>;
  deletedDebtCardIds?: Record<string, boolean>;
}) {
  const freshByCardId = new Map<string, InputDebt>();
  for (const debt of freshDebts) {
    const cardId = normalizeCardId(debt.cardId);
    if (!cardId || deletedDebtCardIds[cardId]) continue;
    freshByCardId.set(cardId, debt);
  }

  const merged: InputDebt[] = [];
  const seenCardIds = new Set<string>();

  for (const debt of previousDebts) {
    const cardId = normalizeCardId(debt.cardId);
    if (cardId && freshByCardId.has(cardId) && overriddenDebtIds[cardId] !== true) {
      merged.push(freshByCardId.get(cardId) as InputDebt);
      seenCardIds.add(cardId);
      continue;
    }

    if (cardId) {
      seenCardIds.add(cardId);
    }
    merged.push(debt);
  }

  for (const debt of freshDebts) {
    const cardId = normalizeCardId(debt.cardId);
    if (!cardId || seenCardIds.has(cardId) || deletedDebtCardIds[cardId]) continue;
    merged.push(debt);
  }

  return merged;
}

function readAuditForm(lastAudit: AuditRecord | null | undefined): AuditFormData | null {
  if (!isPlainObject(lastAudit?.form)) return null;
  return lastAudit.form as AuditFormData;
}

function readPlaidAutoFill(cards: Card[] = [], bankAccounts: BankAccount[] = []) {
  const raw = getPlaidAutoFill(cards, bankAccounts) as PlaidAutoFillData | null | undefined;
  return {
    checking: Number.isFinite(Number(raw?.checking)) ? Number(raw?.checking) : null,
    vault: Number.isFinite(Number(raw?.vault)) ? Number(raw?.vault) : null,
    debts: normalizeDebtRows(Array.isArray(raw?.debts) ? raw.debts : [], cards),
    lastSync: typeof raw?.lastSync === "string" ? raw.lastSync : null,
  } satisfies PlaidAutoFillData;
}

export function createInitialInputFormState({
  today,
  plaidData,
  config,
}: {
  today: Date;
  plaidData: PlaidAutoFillData;
  config: Partial<CatalystCashConfig> | null | undefined;
}): InputFormState {
  return suppressRedundantManualInvestmentSeeds({
    date: formatFormDate(today),
    time: formatFormTime(today),
    checking: plaidData.checking !== null ? plaidData.checking : "",
    savings: plaidData.vault !== null ? plaidData.vault : "",
    roth: config?.investmentRoth || "",
    brokerage: config?.investmentBrokerage || "",
    k401Balance: config?.k401Balance || "",
    pendingCharges: [],
    habitCount: 10,
    debts: plaidData.debts?.length > 0 ? plaidData.debts : [],
    notes: "",
    autoPaycheckAdd: false,
    paycheckAddOverride: "",
  } as InputFormState, config);
}

export function buildCardSelectGroups(
  cards: SelectableCard[] = [],
  getShortCardLabel: (cards: SelectableCard[], card: SelectableCard) => string
): CardSelectGroup[] {
  const groupedCards = new Map<string, typeof cards>();
  for (const card of cards) {
    const institution = String(card?.institution || "").trim() || "Other";
    const bucket = groupedCards.get(institution) || [];
    bucket.push(card);
    groupedCards.set(institution, bucket);
  }

  return Array.from(groupedCards.entries()).map(([institution, institutionCards]) => ({
    label: institution,
    options: institutionCards.map((card) => ({
      value: String(card.id || card.name || institution),
      label: getShortCardLabel(cards, card).replace(`${institution} `, ""),
    })),
  }));
}

export function buildAddableDebtCards(
  cards: SelectableCard[] = [],
  debts: Array<Pick<InputDebt, "cardId">> = []
): AddableDebtCard[] {
  const selectedCardIds = new Set(debts.map((debt) => normalizeCardId(debt?.cardId)).filter(Boolean));
  return cards.reduce<AddableDebtCard[]>((items, card) => {
    const cardId = normalizeCardId(card?.id);
    if (!cardId || selectedCardIds.has(cardId)) return items;
    items.push({
      cardId,
      institution: String(card?.institution || "").trim(),
      name: resolveCardLabel(cards, cardId, String(card?.name || "").trim()),
    });
    return items;
  }, []);
}

export function mergePlaidAutoFillIntoForm(
  previousForm: InputFormState,
  freshPlaid: PlaidAutoFillData,
  overridePlaid: OverridePlaidState,
  deletedDebtCardIds: Record<string, boolean> = {}
): InputFormState {
  const updates: Partial<InputFormState> = {};

  if (freshPlaid.checking !== null && !overridePlaid.checking) {
    updates.checking = freshPlaid.checking;
  }

  if (freshPlaid.vault !== null && !overridePlaid.vault) {
    updates.savings = freshPlaid.vault;
  }

  const mergedDebts = mergeDebtSnapshots({
    previousDebts: normalizeDebtRows(previousForm.debts || []),
    freshDebts: normalizeDebtRows(Array.isArray(freshPlaid?.debts) ? freshPlaid.debts : []),
    overriddenDebtIds: overridePlaid?.debts || {},
    deletedDebtCardIds,
  });

  if (mergedDebts.length > 0 || (previousForm.debts || []).length > 0) {
    updates.debts = mergedDebts;
  }

  return Object.keys(updates).length === 0 ? previousForm : { ...previousForm, ...updates };
}

export function hasReusableAuditSeed(lastAudit: AuditRecord | null | undefined) {
  const form = readAuditForm(lastAudit);
  if (!form || lastAudit?.isTest) return false;
  const debts = normalizeDebtRows(Array.isArray(form.debts) ? form.debts : [], [], { positiveOnly: true });
  return Boolean(
    form.checking
      || form.checkingBalance
      || form.savings
      || form.ally
      || form.roth
      || form.brokerage
      || form.k401Balance
      || form.notes
      || debts.length > 0
  );
}

export function mergeLastAuditIntoForm({
  previousForm,
  lastAudit,
  cards,
  bankAccounts,
  financialConfig,
  today,
}: MergeLastAuditParams): InputFormState {
  if (!hasReusableAuditSeed(lastAudit)) return previousForm;

  const priorForm = (readAuditForm(lastAudit) || {}) as AuditFormData;
  const priorDebts = normalizeDebtRows(Array.isArray(priorForm.debts) ? priorForm.debts : [], cards, {
    positiveOnly: true,
  });
  const plaidNow = readPlaidAutoFill(cards, bankAccounts);

  return suppressRedundantManualInvestmentSeeds({
    ...previousForm,
    ...priorForm,
    debts: mergeDebtSnapshots({
      previousDebts: priorDebts,
      freshDebts: plaidNow.debts,
    }),
    date: formatFormDate(today),
    time: formatFormTime(today),
    checking: plaidNow.checking !== null ? plaidNow.checking : toMoneyInput(priorForm.checking),
    savings: plaidNow.vault !== null ? plaidNow.vault : toMoneyInput(priorForm.savings ?? priorForm.ally),
    pendingCharges: [],
    roth: toMoneyInput(priorForm.roth ?? previousForm.roth),
    brokerage: toMoneyInput(priorForm.brokerage ?? previousForm.brokerage),
    k401Balance: toMoneyInput(priorForm.k401Balance ?? previousForm.k401Balance),
    autoPaycheckAdd: typeof priorForm.autoPaycheckAdd === "boolean" ? priorForm.autoPaycheckAdd : false,
    paycheckAddOverride: "",
  } as InputFormState, financialConfig);
}

export function getTypedFinancialConfig(financialConfig: CatalystCashConfig | null | undefined) {
  return financialConfig ?? DEFAULT_FINANCIAL_CONFIG;
}

export function buildInputSnapshotMessage(args: Parameters<typeof buildSnapshotMessage>[0]) {
  return buildSnapshotMessage(args);
}
