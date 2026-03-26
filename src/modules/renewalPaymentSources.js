import { getShortCardLabel } from "./cards.js";

export const RENEWAL_PAYMENT_TYPES = Object.freeze({
  card: "card",
  bank: "bank",
  checking: "checking",
  savings: "savings",
  cash: "cash",
});

const GENERIC_LABELS = Object.freeze({
  [RENEWAL_PAYMENT_TYPES.checking]: "Checking",
  [RENEWAL_PAYMENT_TYPES.savings]: "Savings",
  [RENEWAL_PAYMENT_TYPES.cash]: "Cash",
});

export function normalizeRenewalPaymentType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "card") return RENEWAL_PAYMENT_TYPES.card;
  if (normalized === "bank") return RENEWAL_PAYMENT_TYPES.bank;
  if (normalized === "cash") return RENEWAL_PAYMENT_TYPES.cash;
  if (normalized === "checking" || normalized === "checking account") return RENEWAL_PAYMENT_TYPES.checking;
  if (normalized === "savings" || normalized === "savings account") return RENEWAL_PAYMENT_TYPES.savings;
  return "";
}

export function getGenericRenewalPaymentLabel(type) {
  return GENERIC_LABELS[normalizeRenewalPaymentType(type)] || "";
}

function findByIdOrPlaidAccount(list = [], targetId = "") {
  const normalizedId = String(targetId || "").trim();
  if (!normalizedId) return null;

  const exact = list.find((item) => String(item?.id || "").trim() === normalizedId);
  if (exact) return exact;

  return (
    list.find((item) => {
      const plaidAccountId = String(item?._plaidAccountId || "").trim();
      return plaidAccountId && (normalizedId === plaidAccountId || normalizedId === `plaid_${plaidAccountId}`);
    }) || null
  );
}

export function findCardByRenewalPaymentId(cards = [], chargedToId = "") {
  return findByIdOrPlaidAccount(cards, chargedToId);
}

export function findBankAccountByRenewalPaymentId(bankAccounts = [], chargedToId = "") {
  return findByIdOrPlaidAccount(bankAccounts, chargedToId);
}

export function getBankAccountLabel(bankAccounts = [], account) {
  if (!account) return "";

  const bank = String(account.bank || "").trim();
  const name = String(account.name || "").trim() || "Account";
  const base = bank ? `${bank} · ${name}` : name;

  const duplicates = bankAccounts.filter((candidate) => {
    return String(candidate?.bank || "").trim() === bank && String(candidate?.name || "").trim() === name;
  });

  if (duplicates.length <= 1) return base;
  const index = duplicates.findIndex((candidate) => candidate?.id === account?.id);
  return `${base} #${index >= 0 ? index + 1 : 1}`;
}

export function resolveRenewalPaymentState(renewal, cards = [], bankAccounts = []) {
  const chargedToId = String(renewal?.chargedToId || "").trim();
  const explicitType = normalizeRenewalPaymentType(renewal?.chargedToType);
  const chargedTo = String(renewal?.chargedTo || "").trim();

  const matchedCard = findCardByRenewalPaymentId(cards, chargedToId);
  if (matchedCard) {
    return {
      chargedToType: RENEWAL_PAYMENT_TYPES.card,
      chargedToId: matchedCard.id || chargedToId,
      chargedTo: getShortCardLabel(cards, matchedCard) || chargedTo,
    };
  }

  const matchedBank = findBankAccountByRenewalPaymentId(bankAccounts, chargedToId);
  if (matchedBank) {
    return {
      chargedToType: RENEWAL_PAYMENT_TYPES.bank,
      chargedToId: matchedBank.id || chargedToId,
      chargedTo: getBankAccountLabel(bankAccounts, matchedBank) || chargedTo,
    };
  }

  if (explicitType && explicitType !== RENEWAL_PAYMENT_TYPES.card && explicitType !== RENEWAL_PAYMENT_TYPES.bank) {
    return {
      chargedToType: explicitType,
      chargedToId: "",
      chargedTo: getGenericRenewalPaymentLabel(explicitType) || chargedTo,
    };
  }

  const inferredGenericType = normalizeRenewalPaymentType(chargedTo);
  if (inferredGenericType && inferredGenericType !== RENEWAL_PAYMENT_TYPES.card && inferredGenericType !== RENEWAL_PAYMENT_TYPES.bank) {
    return {
      chargedToType: inferredGenericType,
      chargedToId: "",
      chargedTo: getGenericRenewalPaymentLabel(inferredGenericType) || chargedTo,
    };
  }

  return {
    chargedToType: explicitType,
    chargedToId,
    chargedTo,
  };
}

export function getRenewalPaymentOptionValue(payment = {}) {
  const type = normalizeRenewalPaymentType(payment?.chargedToType);
  const chargedToId = String(payment?.chargedToId || "").trim();

  if (type === RENEWAL_PAYMENT_TYPES.card && chargedToId) return `card:${chargedToId}`;
  if (type === RENEWAL_PAYMENT_TYPES.bank && chargedToId) return `bank:${chargedToId}`;
  if (type && type !== RENEWAL_PAYMENT_TYPES.card && type !== RENEWAL_PAYMENT_TYPES.bank) return `type:${type}`;

  if (chargedToId) return `card:${chargedToId}`;
  return "";
}

export function parseRenewalPaymentOptionValue(value, cards = [], bankAccounts = []) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return { chargedToType: "", chargedToId: "", chargedTo: "" };

  if (rawValue.startsWith("card:")) {
    const card = findCardByRenewalPaymentId(cards, rawValue.slice(5));
    return {
      chargedToType: RENEWAL_PAYMENT_TYPES.card,
      chargedToId: card?.id || rawValue.slice(5),
      chargedTo: card ? getShortCardLabel(cards, card) : "",
    };
  }

  if (rawValue.startsWith("bank:")) {
    const account = findBankAccountByRenewalPaymentId(bankAccounts, rawValue.slice(5));
    return {
      chargedToType: RENEWAL_PAYMENT_TYPES.bank,
      chargedToId: account?.id || rawValue.slice(5),
      chargedTo: account ? getBankAccountLabel(bankAccounts, account) : "",
    };
  }

  if (rawValue.startsWith("type:")) {
    const type = normalizeRenewalPaymentType(rawValue.slice(5));
    return {
      chargedToType: type,
      chargedToId: "",
      chargedTo: getGenericRenewalPaymentLabel(type),
    };
  }

  const genericType = normalizeRenewalPaymentType(rawValue);
  if (genericType) {
    return {
      chargedToType: genericType,
      chargedToId: "",
      chargedTo: getGenericRenewalPaymentLabel(genericType),
    };
  }

  return {
    chargedToType: "",
    chargedToId: "",
    chargedTo: rawValue,
  };
}
