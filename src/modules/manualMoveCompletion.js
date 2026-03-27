import { applyMoveAssignment, resolveMoveAction } from "./moveSemantics.js";

function toAmount(value) {
  if (value == null || value === "") return 0;
  const number = typeof value === "number" ? value : parseFloat(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function isManualBank(account) {
  return !account?._plaidAccountId || Boolean(account?._plaidManualFallback);
}

function getSingleManualCheckingAccount(bankAccounts = []) {
  const manualChecking = bankAccounts.filter(
    (account) => isManualBank(account) && String(account.accountType || "").toLowerCase() === "checking"
  );
  return manualChecking.length === 1 ? manualChecking[0] : null;
}

function getSingleManualSavingsAccount(bankAccounts = []) {
  const manualSavings = bankAccounts.filter(
    (account) => isManualBank(account) && String(account.accountType || "").toLowerCase() === "savings"
  );
  return manualSavings.length === 1 ? manualSavings[0] : null;
}

export function applyManualMoveCompletion({
  moveText,
  move = null,
  assignment = null,
  cards = [],
  bankAccounts = [],
  financialConfig = {},
} = {}) {
  const moveItem = move || (moveText ? { text: moveText } : null);
  const classification = applyMoveAssignment(resolveMoveAction({
    move: moveItem,
    cards,
    bankAccounts,
    financialConfig,
    manualOnly: true,
  }), assignment, bankAccounts);

  if (!classification || classification.transactional === false) {
    return {
      applied: false,
      updatedCards: cards,
      updatedBankAccounts: bankAccounts,
      updatedFinancialConfig: financialConfig,
      summary: null,
    };
  }

  let changed = false;
  let sourceAdjusted = false;
  let updatedCards = cards;
  let updatedBankAccounts = bankAccounts;
  let updatedFinancialConfig = financialConfig;

  const amount = classification.amount;
  const effectiveMoveText = classification.text || String(moveItem?.text || moveText || "").trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      applied: false,
      updatedCards: cards,
      updatedBankAccounts: bankAccounts,
      updatedFinancialConfig: financialConfig,
      summary: null,
    };
  }

  if (classification.kind === "card-payment") {
    updatedCards = cards.map((card) => {
      if (card.id !== classification.targetId) return card;
      changed = true;
      return { ...card, balance: Math.max(0, toAmount(card.balance) - amount) };
    });
  } else if (classification.kind === "debt-payment") {
    const nextDebts = [...(financialConfig.nonCardDebts || [])];
    const targetDebt = nextDebts[classification.targetIndex];
    if (targetDebt) {
      changed = true;
      nextDebts[classification.targetIndex] = {
        ...targetDebt,
        balance: Math.max(0, toAmount(targetDebt.balance) - amount),
      };
      updatedFinancialConfig = { ...financialConfig, nonCardDebts: nextDebts };
    }
  } else if (classification.kind === "bank-savings-increase") {
    updatedBankAccounts = bankAccounts.map((account) => {
      if (account.id !== classification.targetId) return account;
      changed = true;
      return { ...account, balance: toAmount(account.balance) + amount };
    });
  } else if (classification.kind === "bank-checking-increase") {
    const targetCheckingId = classification.targetId || getSingleManualCheckingAccount(bankAccounts)?.id || null;
    const sourceSavingsId = classification.sourceId || getSingleManualSavingsAccount(bankAccounts)?.id || null;
    updatedBankAccounts = bankAccounts.map((account) => {
      let nextAccount = account;
      if (account.id === targetCheckingId) {
        changed = true;
        nextAccount = { ...nextAccount, balance: toAmount(nextAccount.balance) + amount };
      }
      if (account.id === sourceSavingsId) {
        sourceAdjusted = true;
        nextAccount = { ...nextAccount, balance: Math.max(0, toAmount(nextAccount.balance) - amount) };
      }
      return nextAccount;
    });
  } else if (classification.kind === "bank-checking-decrease") {
    updatedBankAccounts = bankAccounts.map((account) => {
      if (account.id !== classification.targetId) return account;
      changed = true;
      return { ...account, balance: toAmount(account.balance) - amount };
    });
  } else if (classification.kind === "investment-contribution") {
    changed = true;
    updatedFinancialConfig = {
      ...financialConfig,
      [classification.targetKey]: toAmount(financialConfig[classification.targetKey]) + amount,
      ...(classification.contributionKey
        ? {
            [classification.contributionKey]: toAmount(financialConfig[classification.contributionKey]) + amount,
          }
        : {}),
    };
  }

  if (!changed) {
    return {
      applied: false,
      updatedCards: cards,
      updatedBankAccounts: bankAccounts,
      updatedFinancialConfig: financialConfig,
      summary: null,
    };
  }

  if (classification.impliedCheckingSource) {
    const checkingSource =
      updatedBankAccounts.find((account) => account.id === classification.fundingSourceId) ||
      getSingleManualCheckingAccount(updatedBankAccounts);
    if (checkingSource) {
      updatedBankAccounts = updatedBankAccounts.map((account) => {
        if (account.id !== checkingSource.id) return account;
        sourceAdjusted = true;
        return { ...account, balance: toAmount(account.balance) - amount };
      });
    }
  }

  const sourceSuffix =
    classification.kind === "bank-checking-increase"
      ? sourceAdjusted
        ? " Savings reduced too."
        : ""
      : sourceAdjusted
        ? " Checking adjusted too."
        : "";

  return {
    applied: true,
    updatedCards,
    updatedBankAccounts,
    updatedFinancialConfig,
    summary: `Applied ${effectiveMoveText} to manual tracking.${sourceSuffix}`,
  };
}
