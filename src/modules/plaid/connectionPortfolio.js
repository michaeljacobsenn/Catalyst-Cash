function toFiniteMoney(value) {
  if (value == null || value === "") return null;
  const num = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(num) ? num : null;
}

export function materializeManualFallbackForConnections(
  cards = [],
  bankAccounts = [],
  connectionIds = [],
  options = {}
) {
  const keepLinkMetadata = options.keepLinkMetadata !== false;
  const targetConnectionIds = new Set(
    Array.from(connectionIds || [])
      .map((id) => String(id || "").trim())
      .filter(Boolean)
  );

  if (targetConnectionIds.size === 0) {
    return { updatedCards: cards, updatedBankAccounts: bankAccounts, changed: false };
  }

  let changed = false;

  const updatedCards = cards.map((card) => {
    const connectionId = String(card?._plaidConnectionId || "").trim();
    if (!connectionId || !targetConnectionIds.has(connectionId)) return card;

    const nextBalance = toFiniteMoney(card._plaidBalance ?? card.balance);
    const nextLimit = toFiniteMoney(card._plaidLimit ?? card.limit ?? card.creditLimit);
    const nextCard = {
      ...card,
      balance: nextBalance ?? card.balance ?? null,
      limit: nextLimit ?? card.limit ?? null,
      _plaidBalance: null,
      _plaidAvailable: null,
      _plaidLimit: null,
      _plaidManualFallback: true,
      _plaidLiability: null,
      _plaidLastSync: null,
    };

    if (!keepLinkMetadata) {
      nextCard._plaidAccountId = undefined;
      nextCard._plaidConnectionId = undefined;
    }

    if (
      nextCard.balance !== card.balance ||
      nextCard.limit !== card.limit ||
      card._plaidBalance != null ||
      card._plaidAvailable != null ||
      card._plaidLimit != null ||
      card._plaidManualFallback !== true ||
      (!keepLinkMetadata && (card._plaidAccountId || card._plaidConnectionId))
    ) {
      changed = true;
    }

    return nextCard;
  });

  const updatedBankAccounts = bankAccounts.map((account) => {
    const connectionId = String(account?._plaidConnectionId || "").trim();
    if (!connectionId || !targetConnectionIds.has(connectionId)) return account;

    const nextBalance = toFiniteMoney(account._plaidAvailable ?? account._plaidBalance ?? account.balance);
    const nextAccount = {
      ...account,
      balance: nextBalance ?? account.balance ?? null,
      _plaidBalance: null,
      _plaidAvailable: null,
      _plaidManualFallback: true,
      _plaidLastSync: null,
    };

    if (!keepLinkMetadata) {
      nextAccount._plaidAccountId = undefined;
      nextAccount._plaidConnectionId = undefined;
    }

    if (
      nextAccount.balance !== account.balance ||
      account._plaidBalance != null ||
      account._plaidAvailable != null ||
      account._plaidManualFallback !== true ||
      (!keepLinkMetadata && (account._plaidAccountId || account._plaidConnectionId))
    ) {
      changed = true;
    }

    return nextAccount;
  });

  return { updatedCards, updatedBankAccounts, changed };
}

export function getConnectionPlaidAccountIds(connection = {}) {
  return new Set(
    Array.from(connection?.accounts || [])
      .map((account) => String(account?.plaidAccountId || "").trim())
      .filter(Boolean)
  );
}

function recordBelongsToConnection(record, connectionId, plaidAccountIds) {
  const recordConnectionId = String(record?._plaidConnectionId || "").trim();
  const recordPlaidAccountId = String(record?._plaidAccountId || "").trim();
  if (connectionId && recordConnectionId === connectionId) return true;
  if (recordPlaidAccountId && plaidAccountIds.has(recordPlaidAccountId)) return true;
  return false;
}

export function disconnectConnectionPortfolioRecords(
  connection,
  cards = [],
  bankAccounts = [],
  plaidInvestments = [],
  options = {}
) {
  const connectionId = String(connection?.id || "").trim();
  const plaidAccountIds = getConnectionPlaidAccountIds(connection);
  const removeLinkedRecords = options.removeLinkedRecords === true;

  let cardsChanged = false;
  let bankAccountsChanged = false;
  let plaidInvestmentsChanged = false;
  let removedCards = 0;
  let removedBankAccounts = 0;
  let removedPlaidInvestments = 0;

  const updatedCards = removeLinkedRecords
    ? cards.filter((card) => {
        const shouldRemove = recordBelongsToConnection(card, connectionId, plaidAccountIds);
        if (shouldRemove) {
          removedCards += 1;
          cardsChanged = true;
        }
        return !shouldRemove;
      })
    : cards.map((card) => {
        if (!recordBelongsToConnection(card, connectionId, plaidAccountIds)) return card;
        cardsChanged = true;
        return {
          ...card,
          balance: toFiniteMoney(card._plaidBalance ?? card.balance) ?? card.balance ?? null,
          limit: toFiniteMoney(card._plaidLimit ?? card.limit ?? card.creditLimit) ?? card.limit ?? null,
          _plaidBalance: null,
          _plaidAvailable: null,
          _plaidLimit: null,
          _plaidManualFallback: true,
          _plaidLiability: null,
          _plaidLastSync: null,
          _plaidAccountId: undefined,
          _plaidConnectionId: undefined,
        };
      });

  const updatedBankAccounts = removeLinkedRecords
    ? bankAccounts.filter((account) => {
        const shouldRemove = recordBelongsToConnection(account, connectionId, plaidAccountIds);
        if (shouldRemove) {
          removedBankAccounts += 1;
          bankAccountsChanged = true;
        }
        return !shouldRemove;
      })
    : bankAccounts.map((account) => {
        if (!recordBelongsToConnection(account, connectionId, plaidAccountIds)) return account;
        bankAccountsChanged = true;
        return {
          ...account,
          balance: toFiniteMoney(account._plaidAvailable ?? account._plaidBalance ?? account.balance) ?? account.balance ?? null,
          _plaidBalance: null,
          _plaidAvailable: null,
          _plaidManualFallback: true,
          _plaidLastSync: null,
          _plaidAccountId: undefined,
          _plaidConnectionId: undefined,
        };
      });

  const updatedPlaidInvestments = plaidInvestments.filter((investment) => {
    const shouldRemove = recordBelongsToConnection(investment, connectionId, plaidAccountIds);
    if (shouldRemove) {
      removedPlaidInvestments += 1;
      plaidInvestmentsChanged = true;
    }
    return !shouldRemove;
  });

  return {
    updatedCards,
    updatedBankAccounts,
    updatedPlaidInvestments,
    cardsChanged,
    bankAccountsChanged,
    plaidInvestmentsChanged,
    removedCards,
    removedBankAccounts,
    removedPlaidInvestments,
  };
}
