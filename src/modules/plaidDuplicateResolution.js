/** @typedef {import("../types/index.js").Card} Card */
/** @typedef {import("../types/index.js").BankAccount} BankAccount */
/**
 * @typedef {{ kind: "card" | "bank", plaidAccountId: string, importedId: string, importedLabel: string, institution: string, existingIds: string[] }} PlaidDuplicateCandidate
 */
/**
 * @typedef {{ key: string, kind: "card" | "bank", score: number, reason: string, left: Card | BankAccount, right: Card | BankAccount, actionable: boolean, preferredKeepId?: string, preferredRemoveId?: string }} PortfolioDuplicateGroup
 */

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeInstitution(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  if (normalized === "american express" || normalized === "amex") return "american express";
  if (normalized === "capital one" || normalized === "cap one") return "capital one";
  if (normalized === "citibank online" || normalized === "citi") return "citi";
  return normalized;
}

function extractLast4(candidate) {
  const raw = String(candidate?.last4 || candidate?.mask || "").replace(/\D/g, "");
  if (raw.length >= 4) return raw.slice(-4);
  const noteMatch = String(candidate?.notes || "").match(/(\d{4})/);
  return noteMatch ? noteMatch[1] : "";
}

function scoreNameMatch(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 3;
  if (left.includes(right) || right.includes(left)) return 2;
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1;
  }
  return shared >= Math.min(2, Math.max(leftTokens.size, rightTokens.size)) ? 1 : 0;
}

function buildDuplicateGroupKey(kind, leftId, rightId) {
  const ids = [String(leftId || "").trim(), String(rightId || "").trim()].sort();
  return `${kind}:${ids.join("|")}`;
}

function buildDuplicateReason(score, exactLast4 = false) {
  if (exactLast4) return "Same institution and last 4 digits";
  if (score >= 3) return "Very similar account naming";
  return "Similar naming under the same institution";
}

export function normalizeAcknowledgedDuplicateKeys(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((entry) => String(entry || "").trim()).filter(Boolean))];
}

export function setDuplicateGroupAcknowledged(config = {}, key, acknowledged = true) {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) return config;
  const keys = normalizeAcknowledgedDuplicateKeys(config?.acknowledgedDuplicateKeys);
  const nextKeys = acknowledged
    ? [...new Set([...keys, normalizedKey])]
    : keys.filter((entry) => entry !== normalizedKey);
  return {
    ...config,
    acknowledgedDuplicateKeys: nextKeys,
  };
}

/**
 * @param {{
 *  cards?: Card[],
 *  bankAccounts?: BankAccount[],
 *  acknowledgedKeys?: string[],
 * }} options
 * @returns {PortfolioDuplicateGroup[]}
 */
export function buildPortfolioDuplicateReviewGroups({
  cards = [],
  bankAccounts = [],
  acknowledgedKeys = [],
}) {
  const groups = [];
  const skipped = new Set(normalizeAcknowledgedDuplicateKeys(acknowledgedKeys));

  for (let index = 0; index < cards.length; index += 1) {
    const left = cards[index];
    const matches = findLikelyCardDuplicates(cards.slice(index + 1), left);
    for (const match of matches) {
      const right = match.card;
      const exactLast4 = Boolean(extractLast4(left) && extractLast4(left) === extractLast4(right));
      if (match.score < (exactLast4 ? 4 : 2)) continue;
      const key = buildDuplicateGroupKey("card", left?.id, right?.id);
      if (skipped.has(key)) continue;
      const leftLinked = Boolean(left?._plaidAccountId);
      const rightLinked = Boolean(right?._plaidAccountId);
      const actionable = leftLinked !== rightLinked;
      if (!actionable) continue;
      const manual = leftLinked ? right : left;
      const linked = leftLinked ? left : right;
      groups.push({
        key,
        kind: "card",
        score: match.score,
        reason: buildDuplicateReason(match.score, exactLast4),
        left,
        right,
        actionable,
        preferredKeepId: actionable ? manual?.id : undefined,
        preferredRemoveId: actionable ? linked?.id : undefined,
      });
    }
  }

  for (let index = 0; index < bankAccounts.length; index += 1) {
    const left = bankAccounts[index];
    const matches = findLikelyBankDuplicates(bankAccounts.slice(index + 1), left);
    for (const match of matches) {
      const right = match.account;
      if (match.score < 2) continue;
      const key = buildDuplicateGroupKey("bank", left?.id, right?.id);
      if (skipped.has(key)) continue;
      const leftLinked = Boolean(left?._plaidAccountId);
      const rightLinked = Boolean(right?._plaidAccountId);
      const actionable = leftLinked !== rightLinked;
      if (!actionable) continue;
      const manual = leftLinked ? right : left;
      const linked = leftLinked ? left : right;
      groups.push({
        key,
        kind: "bank",
        score: match.score,
        reason: buildDuplicateReason(match.score, false),
        left,
        right,
        actionable,
        preferredKeepId: actionable ? manual?.id : undefined,
        preferredRemoveId: actionable ? linked?.id : undefined,
      });
    }
  }

  return groups.sort((left, right) => {
    if (left.actionable !== right.actionable) return left.actionable ? -1 : 1;
    return right.score - left.score;
  });
}

/**
 * @param {Card[]} [cards=[]]
 * @param {Partial<Card> & { mask?: string | null }} [draft={}]
 * @returns {{ card: Card, score: number }[]}
 */
export function findLikelyCardDuplicates(cards = [], draft = {}) {
  const institution = normalizeInstitution(draft.institution);
  const displayName = normalizeText(draft.nickname || draft.name);
  const last4 = String(draft.last4 || draft.mask || "").replace(/\D/g, "").slice(-4);

  return cards
    .map((card) => {
      if (institution && normalizeInstitution(card?.institution) !== institution) return null;
      let score = 0;
      if (last4) {
        const candidateLast4 = extractLast4(card);
        if (candidateLast4 && candidateLast4 === last4) score += 4;
      }
      score += scoreNameMatch(displayName, normalizeText(card?.nickname || card?.name));
      if (score <= 0) return null;
      return { card, score };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);
}

/**
 * @param {BankAccount[]} [bankAccounts=[]]
 * @param {Partial<BankAccount>} [draft={}]
 * @returns {{ account: BankAccount, score: number }[]}
 */
export function findLikelyBankDuplicates(bankAccounts = [], draft = {}) {
  const bank = normalizeInstitution(draft.bank);
  const accountType = normalizeText(draft.accountType);
  const displayName = normalizeText(draft.name);

  return bankAccounts
    .map((account) => {
      if (bank && normalizeInstitution(account?.bank) !== bank) return null;
      if (accountType && normalizeText(account?.accountType) !== accountType) return null;
      const score = scoreNameMatch(displayName, normalizeText(account?.name));
      if (score <= 0) return null;
      return { account, score };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);
}

/**
 * @param {{
 *   connection: { accounts?: Array<object> | undefined },
 *   newCards?: Card[],
 *   newBankAccounts?: BankAccount[],
 *   duplicateCandidates?: PlaidDuplicateCandidate[],
 *   cards?: Card[],
 *   bankAccounts?: BankAccount[],
 *   confirm?: (message: string) => boolean,
 * }} options
 * @returns {{ newCards: Card[], newBankAccounts: BankAccount[], resolvedCount: number, ambiguousCount: number }}
 */
export function reviewPlaidDuplicateCandidates({
  connection,
  newCards = [],
  newBankAccounts = [],
  duplicateCandidates = [],
  cards = [],
  bankAccounts = [],
  confirm = (message) => window.confirm(message),
}) {
  let nextCards = [...newCards];
  let nextBankAccounts = [...newBankAccounts];
  let resolvedCount = 0;
  let ambiguousCount = 0;

  for (const candidate of duplicateCandidates) {
    if (!candidate?.plaidAccountId || !Array.isArray(candidate?.existingIds) || candidate.existingIds.length === 0) {
      continue;
    }
    if (candidate.existingIds.length > 1) {
      ambiguousCount += 1;
      continue;
    }

    const existingId = candidate.existingIds[0];
    const connectionAccount = (connection?.accounts || []).find(
      (account) => String(account?.plaidAccountId || "") === String(candidate.plaidAccountId)
    );
    if (!connectionAccount) continue;

    if (candidate.kind === "card") {
      const existing = cards.find((card) => String(card?.id || "") === existingId);
      if (!existing) continue;
      if (existing?._plaidAccountId && String(existing._plaidAccountId) !== String(candidate.plaidAccountId)) {
        ambiguousCount += 1;
        continue;
      }
      const accepted = confirm(
        `Plaid found "${candidate.importedLabel}" from ${candidate.institution || "this issuer"} which may duplicate your existing card "${existing.nickname || existing.name}".\n\nPress OK to link the Plaid account to the existing card.\nPress Cancel to keep both.`
      );
      if (!accepted) continue;
      nextCards = nextCards.filter((card) => String(card?.id || "") !== String(candidate.importedId || ""));
      connectionAccount.linkedCardId = existingId;
      resolvedCount += 1;
      continue;
    }

    if (candidate.kind === "bank") {
      const existing = bankAccounts.find((account) => String(account?.id || "") === existingId);
      if (!existing) continue;
      if (existing?._plaidAccountId && String(existing._plaidAccountId) !== String(candidate.plaidAccountId)) {
        ambiguousCount += 1;
        continue;
      }
      const accepted = confirm(
        `Plaid found "${candidate.importedLabel}" from ${candidate.institution || "this bank"} which may duplicate your existing account "${existing.name}".\n\nPress OK to link the Plaid account to the existing account.\nPress Cancel to keep both.`
      );
      if (!accepted) continue;
      nextBankAccounts = nextBankAccounts.filter((account) => String(account?.id || "") !== String(candidate.importedId || ""));
      connectionAccount.linkedBankAccountId = existingId;
      resolvedCount += 1;
    }
  }

  return {
    newCards: nextCards,
    newBankAccounts: nextBankAccounts,
    resolvedCount,
    ambiguousCount,
  };
}
