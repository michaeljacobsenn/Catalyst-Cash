import { getShortCardLabel } from "./cards.js";
import {
  RENEWAL_PAYMENT_TYPES,
  findBankAccountByRenewalPaymentId,
  findCardByRenewalPaymentId,
  getBankAccountLabel,
  getGenericRenewalPaymentLabel,
  normalizeRenewalPaymentType,
  resolveRenewalPaymentState,
} from "./renewalPaymentSources.js";

const GENERIC_PAYMENT_LABELS = new Set(["checking", "savings", "cash"]);
const NOISE_TOKENS = new Set(["card", "credit", "account", "accounts", "rewards", "reward", "businesscard"]);

function normalizePaymentText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/→|->|\/|&/g, " ")
    .replace(/\bamex\b/g, "american express")
    .replace(/\bax\b/g, "american express")
    .replace(/\bbiz\b/g, "business")
    .replace(/\bskymiles\b/g, "sky miles")
    .replace(/\bdelta skymiles\b/g, "delta sky miles")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenizePaymentText(value) {
  return normalizePaymentText(value)
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !NOISE_TOKENS.has(token));
}

function isGenericPaymentLabel(value) {
  const normalized = normalizePaymentText(value);
  return GENERIC_PAYMENT_LABELS.has(normalized);
}

function buildCardAliases(cards, card) {
  const shortLabel = getShortCardLabel(cards, card);
  return [
    card?.id,
    card?._plaidAccountId,
    card?.name,
    card?.nickname,
    shortLabel,
    shortLabel && card?.institution ? `${card.institution} ${shortLabel}` : "",
  ].filter(Boolean);
}

function buildBankAliases(bankAccounts, account) {
  const label = getBankAccountLabel(bankAccounts, account);
  return [
    account?.id,
    account?._plaidAccountId,
    account?.name,
    label,
    account?.bank && account?.name ? `${account.bank} ${account.name}` : "",
    account?.bank && account?.accountType ? `${account.bank} ${account.accountType}` : "",
    account?.name && account?.accountType ? `${account.name} ${account.accountType}` : "",
  ].filter(Boolean);
}

function scoreAliasMatch(query, alias) {
  const normalizedQuery = normalizePaymentText(query);
  const normalizedAlias = normalizePaymentText(alias);
  if (!normalizedQuery || !normalizedAlias) return 0;
  if (normalizedQuery === normalizedAlias) return 120;
  if (normalizedAlias.includes(normalizedQuery) || normalizedQuery.includes(normalizedAlias)) return 95;

  const queryTokens = tokenizePaymentText(query);
  const aliasTokens = tokenizePaymentText(alias);
  if (queryTokens.length === 0 || aliasTokens.length === 0) return 0;

  const aliasSet = new Set(aliasTokens);
  const overlap = queryTokens.filter((token) => aliasSet.has(token));
  if (overlap.length === queryTokens.length && queryTokens.length >= 2) return 88 + queryTokens.length;
  if (overlap.length >= 3 && overlap.length / queryTokens.length >= 0.66) return 72 + overlap.length;
  if (overlap.length >= 2 && overlap.length / aliasTokens.length >= 0.5) return 58 + overlap.length;
  return 0;
}

function buildQueries(renewal) {
  return [
    renewal?.chargedTo,
    renewal?.source,
    renewal?.cardName,
    renewal?.linkedCardAF,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function chooseBestMatch(queries, collection, aliasesBuilder, scoreBoost = () => 0) {
  let bestItem = null;
  let bestScore = 0;
  let secondScore = 0;

  for (const item of collection) {
    const aliases = aliasesBuilder(item);
    let itemScore = 0;
    for (const query of queries) {
      for (const alias of aliases) {
        itemScore = Math.max(itemScore, scoreAliasMatch(query, alias));
      }
    }
    itemScore += scoreBoost(item);

    if (itemScore > bestScore) {
      secondScore = bestScore;
      bestScore = itemScore;
      bestItem = item;
    } else if (itemScore > secondScore) {
      secondScore = itemScore;
    }
  }

  if (!bestItem || bestScore < 60) return null;
  if (bestScore === secondScore) return null;
  return bestItem;
}

function findUniqueGenericBankMatch(renewal, bankAccounts = []) {
  const genericType = normalizeRenewalPaymentType(renewal?.chargedToType || renewal?.chargedTo);
  if (genericType !== RENEWAL_PAYMENT_TYPES.checking && genericType !== RENEWAL_PAYMENT_TYPES.savings) return null;

  const matchingType = bankAccounts.filter(
    (account) => normalizeRenewalPaymentType(account?.accountType) === genericType
  );

  return matchingType.length === 1 ? matchingType[0] : null;
}

export function findBestRenewalCardMatch(renewal, cards = []) {
  if (!renewal || !Array.isArray(cards) || cards.length === 0) return null;

  const explicitType = normalizeRenewalPaymentType(renewal?.chargedToType);
  if (explicitType && explicitType !== RENEWAL_PAYMENT_TYPES.card) return null;

  const chargedToId = String(renewal?.chargedToId || renewal?.linkedCardId || "").trim();
  const exact = findCardByRenewalPaymentId(cards, chargedToId);
  if (exact) return exact;

  const queries = buildQueries(renewal).filter((value) => !isGenericPaymentLabel(value));
  if (queries.length === 0) return null;

  return chooseBestMatch(
    queries,
    cards,
    (card) => buildCardAliases(cards, card),
    (card) => (card?._plaidAccountId ? 2 : 0)
  );
}

export function findBestRenewalBankMatch(renewal, bankAccounts = []) {
  if (!renewal || !Array.isArray(bankAccounts) || bankAccounts.length === 0) return null;

  const explicitType = normalizeRenewalPaymentType(renewal?.chargedToType);
  if (explicitType === RENEWAL_PAYMENT_TYPES.card) return null;

  const chargedToId = String(renewal?.chargedToId || "").trim();
  const exact = findBankAccountByRenewalPaymentId(bankAccounts, chargedToId);
  if (exact) return exact;

  const uniqueGeneric = findUniqueGenericBankMatch(renewal, bankAccounts);
  if (uniqueGeneric) return uniqueGeneric;

  const chargedTo = String(renewal?.chargedTo || "").trim();
  const prefersBankQuery =
    explicitType === RENEWAL_PAYMENT_TYPES.bank ||
    explicitType === RENEWAL_PAYMENT_TYPES.checking ||
    explicitType === RENEWAL_PAYMENT_TYPES.savings ||
    !chargedTo ||
    isGenericPaymentLabel(chargedTo);

  const queries = [chargedTo, prefersBankQuery ? renewal?.source : ""]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => !isGenericPaymentLabel(value));
  if (queries.length === 0) return null;

  return chooseBestMatch(
    queries,
    bankAccounts,
    (account) => buildBankAliases(bankAccounts, account),
    (account) => (account?._plaidAccountId ? 2 : 0)
  );
}

export function relinkRenewalPaymentMethods(renewals = [], cards = [], bankAccounts = []) {
  if (!Array.isArray(renewals) || renewals.length === 0) {
    return { renewals, changed: false };
  }

  let changed = false;
  const next = renewals.map((renewal) => {
    const currentState = resolveRenewalPaymentState(renewal, cards, bankAccounts);
    const explicitType = normalizeRenewalPaymentType(renewal?.chargedToType);
    const genericType = normalizeRenewalPaymentType(renewal?.chargedToType || renewal?.chargedTo);
    const bankMatch = findBestRenewalBankMatch(renewal, bankAccounts);
    const cardMatch = findBestRenewalCardMatch(renewal, cards);
    const prefersBank =
      explicitType === RENEWAL_PAYMENT_TYPES.bank ||
      genericType === RENEWAL_PAYMENT_TYPES.checking ||
      genericType === RENEWAL_PAYMENT_TYPES.savings;

    let nextState = currentState;

    if (prefersBank && bankMatch) {
      nextState = {
        chargedToType: RENEWAL_PAYMENT_TYPES.bank,
        chargedToId: bankMatch.id,
        chargedTo: getBankAccountLabel(bankAccounts, bankMatch),
      };
    } else if (cardMatch) {
      nextState = {
        chargedToType: RENEWAL_PAYMENT_TYPES.card,
        chargedToId: cardMatch.id,
        chargedTo: getShortCardLabel(cards, cardMatch),
      };
    } else if (bankMatch) {
      nextState = {
        chargedToType: RENEWAL_PAYMENT_TYPES.bank,
        chargedToId: bankMatch.id,
        chargedTo: getBankAccountLabel(bankAccounts, bankMatch),
      };
    } else if (
      genericType &&
      genericType !== RENEWAL_PAYMENT_TYPES.card &&
      genericType !== RENEWAL_PAYMENT_TYPES.bank
    ) {
      nextState = {
        chargedToType: genericType,
        chargedToId: "",
        chargedTo: getGenericRenewalPaymentLabel(genericType) || currentState.chargedTo,
      };
    }

    const didChange =
      (renewal?.chargedToType || "") !== (nextState.chargedToType || "") ||
      (renewal?.chargedToId || "") !== (nextState.chargedToId || "") ||
      (renewal?.chargedTo || "") !== (nextState.chargedTo || "");

    if (!didChange) return renewal;

    changed = true;
    return {
      ...renewal,
      chargedToType: nextState.chargedToType || undefined,
      chargedToId: nextState.chargedToId || undefined,
      chargedTo: nextState.chargedTo || undefined,
    };
  });

  return { renewals: next, changed };
}
