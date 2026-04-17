export function getPlaidAutoFill(cards = [], bankAccounts = []) {
  const checking = bankAccounts
    .filter((account) => account.accountType === "checking")
    .reduce(
      (sum, account) => sum + Number(account._plaidAvailable ?? account._plaidBalance ?? account.balance ?? 0),
      0
    );

  const vault = bankAccounts
    .filter((account) => account.accountType === "savings")
    .reduce(
      (sum, account) => sum + Number(account._plaidAvailable ?? account._plaidBalance ?? account.balance ?? 0),
      0
    );

  const debts = cards
    .filter((card) => card._plaidBalance != null && card._plaidBalance > 0)
    .map((card) => ({
      cardId: card.id,
      name: card.nickname || card.name,
      institution: card.institution,
      balance: card._plaidBalance,
      limit: card._plaidLimit || card.limit,
    }));

  return {
    checking: checking || null,
    vault: vault || null,
    debts,
    lastSync:
      bankAccounts.find((account) => account._plaidLastSync)?._plaidLastSync ||
      cards.find((card) => card._plaidLastSync)?._plaidLastSync ||
      null,
  };
}
