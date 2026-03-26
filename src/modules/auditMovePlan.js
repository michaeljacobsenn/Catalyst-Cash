import { getCardLabel } from "./cards.js";

function toFiniteMoney(value) {
  if (value == null || value === "") return null;
  const num = typeof value === "number" ? value : parseFloat(String(value).replace(/,/g, ""));
  return Number.isFinite(num) ? num : null;
}

export function getActualCardBalance(card) {
  if (!card) return 0;
  if (!card._plaidManualFallback && card._plaidBalance != null) {
    return Number(card._plaidBalance) || 0;
  }
  return Number(card.balance) || 0;
}

export function getActualBankBalance(account) {
  if (!account) return 0;
  if (!account._plaidManualFallback && account._plaidBalance != null) {
    return Number(account._plaidBalance) || 0;
  }
  return Number(account.balance) || 0;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function addAlias(aliasSet, value) {
  const normalized = normalizeText(value);
  if (!normalized || normalized.length < 3) return;
  aliasSet.add(normalized);
  if (normalized.endsWith(" card")) aliasSet.add(normalized.replace(/\s+card$/i, "").trim());
  if (normalized.endsWith(" account")) aliasSet.add(normalized.replace(/\s+account$/i, "").trim());
  if (normalized.includes("american express")) {
    aliasSet.add(normalized.replace(/american express/g, "amex").trim());
  }
}

function getAliasScore(moveText, alias) {
  if (!alias) return 0;
  if (moveText.includes(alias)) return alias.length + 10;

  const moveTokens = new Set(tokenize(moveText));
  const aliasTokens = tokenize(alias).filter((token) => token.length >= 3);
  if (aliasTokens.length === 0) return 0;

  const matches = aliasTokens.reduce((sum, token) => sum + (moveTokens.has(token) ? 1 : 0), 0);
  if (matches === aliasTokens.length) return matches + 4;
  return matches;
}

function parseDollarAmount(text) {
  const direct = String(text || "").match(/\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)(k)?/i);
  if (direct) {
    const base = parseFloat(direct[1].replace(/,/g, ""));
    if (!Number.isFinite(base)) return null;
    return direct[2] ? base * 1000 : base;
  }

  const fallback = String(text || "").match(/\b([0-9]+(?:\.[0-9]+)?)\s*(?:dollars|bucks)\b/i);
  if (!fallback) return null;
  const amount = parseFloat(fallback[1]);
  return Number.isFinite(amount) ? amount : null;
}

function buildCardDescriptors(cards = []) {
  return cards.map((card) => {
    const aliases = new Set();
    addAlias(aliases, card.institution);
    addAlias(aliases, card.name);
    addAlias(aliases, card.nickname);
    addAlias(aliases, `${card.institution} ${card.name}`);
    addAlias(aliases, getCardLabel(cards, card));
    return {
      id: card.id,
      aliases: Array.from(aliases),
      label: card.nickname || card.name || card.institution || "Card",
      card,
    };
  });
}

function buildBankDescriptors(bankAccounts = []) {
  return bankAccounts.map((account) => {
    const aliases = new Set();
    addAlias(aliases, account.bank);
    addAlias(aliases, account.name);
    addAlias(aliases, `${account.bank} ${account.name}`);
    addAlias(aliases, account.accountType);
    if (account.accountType === "savings") {
      addAlias(aliases, "vault");
      addAlias(aliases, "ally");
      addAlias(aliases, "emergency fund");
      addAlias(aliases, "savings");
    }
    if (account.accountType === "checking") {
      addAlias(aliases, "checking");
      addAlias(aliases, "cash buffer");
      addAlias(aliases, "checking floor");
    }
    return {
      id: account.id,
      aliases: Array.from(aliases),
      label: account.name || `${account.bank} ${account.accountType}`.trim(),
      account,
    };
  });
}

function findBestDescriptor(moveText, descriptors = [], minScore = 3) {
  let best = null;
  let bestScore = 0;
  for (const descriptor of descriptors) {
    for (const alias of descriptor.aliases) {
      const score = getAliasScore(moveText, alias);
      if (score > bestScore) {
        best = descriptor;
        bestScore = score;
      }
    }
  }
  return bestScore >= minScore ? best : null;
}

function getCheckingAccounts(bankAccounts = []) {
  return bankAccounts.filter((account) => String(account.accountType || "").toLowerCase() === "checking");
}

function getSavingsAccounts(bankAccounts = []) {
  return bankAccounts.filter((account) => String(account.accountType || "").toLowerCase() === "savings");
}

function getBaselineDebtForCard(audit, cardDescriptor) {
  const debts = Array.isArray(audit?.form?.debts) ? audit.form.debts : [];
  const exact = debts.find((debt) => debt?.cardId && debt.cardId === cardDescriptor?.id);
  if (exact) return toFiniteMoney(exact.balance) ?? 0;

  const moveText = normalizeText(cardDescriptor?.label);
  let best = null;
  let bestScore = 0;
  for (const debt of debts) {
    const aliasCandidates = [debt?.name, cardDescriptor?.label, cardDescriptor?.card?.institution];
    for (const alias of aliasCandidates) {
      const score = getAliasScore(moveText, normalizeText(alias));
      if (score > bestScore) {
        best = debt;
        bestScore = score;
      }
    }
  }
  return toFiniteMoney(best?.balance) ?? getActualCardBalance(cardDescriptor?.card);
}

function getBaselineBankTotal(audit, accountType, currentTotal) {
  if (accountType === "checking") {
    return toFiniteMoney(audit?.form?.checking) ?? currentTotal;
  }
  if (accountType === "savings") {
    return toFiniteMoney(audit?.form?.ally) ?? toFiniteMoney(audit?.form?.savings) ?? currentTotal;
  }
  return currentTotal;
}

function emptyPlan() {
  return {
    activeCount: 0,
    matchedCount: 0,
    reconciledCount: 0,
    unresolvedMoves: [],
    cardTargets: {},
    bankTargets: {},
    genericSummaries: [],
    highlights: [],
    impliedCheckingDelta: 0,
  };
}

function appendAccountDelta(map, key, nextEntry) {
  const existing = map[key];
  if (!existing) {
    map[key] = {
      ...nextEntry,
      moveTexts: [...nextEntry.moveTexts],
    };
    return;
  }
  const combinedDelta = (existing.delta || 0) + (nextEntry.delta || 0);
  map[key] = {
    ...existing,
    delta: combinedDelta,
    projectedBalance: Math.max(0, (existing.actualBalance || 0) + combinedDelta),
    remainingAmount: Math.max(0, Math.abs(combinedDelta)),
    moveCount: (existing.moveCount || 0) + (nextEntry.moveCount || 0),
    moveTexts: [...existing.moveTexts, ...nextEntry.moveTexts],
  };
}

function appendSummary(summaryMap, key, label, delta, moveText) {
  const existing = summaryMap.get(key);
  if (!existing) {
    summaryMap.set(key, {
      key,
      label,
      delta,
      moveCount: 1,
      moveTexts: [moveText],
    });
    return;
  }
  existing.delta += delta;
  existing.moveCount += 1;
  existing.moveTexts.push(moveText);
}

function buildHighlights(cardTargets, bankTargets, genericSummaries) {
  return [
    ...Object.values(cardTargets),
    ...Object.values(bankTargets),
    ...genericSummaries.map((summary) => ({
      ...summary,
      projectedBalance: null,
      remainingAmount: Math.abs(summary.delta || 0),
    })),
  ]
    .filter((entry) => Math.abs(entry?.delta || 0) >= 1)
    .sort((left, right) => Math.abs(right.delta || 0) - Math.abs(left.delta || 0))
    .slice(0, 4);
}

function classifyMove(moveText, amount, cardDescriptors, bankDescriptors, checkingAccounts, savingsAccounts) {
  const normalizedText = normalizeText(moveText);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const matchedCard = findBestDescriptor(normalizedText, cardDescriptors, 3);
  const matchedBank = findBestDescriptor(normalizedText, bankDescriptors, 4);
  const savingsish = /\b(save|stash|fund|transfer|move|route|sweep|reserve)\b/.test(normalizedText)
    && /\b(savings|vault|ally|reserve|emergency fund)\b/.test(normalizedText);
  const checkingish = /\b(checking|buffer|floor|cash)\b/.test(normalizedText);
  const paymentish = /\b(pay|payment|statement|card|debt|apr|utilization|toward|towards|throw|attack|apply)\b/.test(normalizedText);

  if (matchedCard && paymentish) {
    return {
      kind: "card-payment",
      amount,
      targetId: matchedCard.id,
      targetLabel: matchedCard.label,
      targetDescriptor: matchedCard,
      impliedCheckingSource: true,
      text: moveText,
    };
  }

  if (matchedBank && matchedBank.account.accountType === "savings" && (savingsish || !paymentish)) {
    return {
      kind: "bank-savings-increase",
      amount,
      targetId: matchedBank.id,
      targetLabel: matchedBank.label,
      targetDescriptor: matchedBank,
      impliedCheckingSource: true,
      text: moveText,
    };
  }

  if (matchedBank && matchedBank.account.accountType === "checking" && checkingish) {
    return {
      kind: "bank-checking-decrease",
      amount,
      targetId: matchedBank.id,
      targetLabel: matchedBank.label,
      targetDescriptor: matchedBank,
      impliedCheckingSource: false,
      text: moveText,
    };
  }

  if (savingsish) {
    return {
      kind: "bank-savings-increase",
      amount,
      targetId: savingsAccounts.length === 1 ? savingsAccounts[0].id : null,
      targetLabel: savingsAccounts.length === 1 ? (savingsAccounts[0].name || "Savings") : "Savings",
      targetDescriptor: savingsAccounts.length === 1 ? bankDescriptors.find((entry) => entry.id === savingsAccounts[0].id) : null,
      impliedCheckingSource: true,
      text: moveText,
    };
  }

  if (checkingish) {
    return {
      kind: "bank-checking-decrease",
      amount,
      targetId: checkingAccounts.length === 1 ? checkingAccounts[0].id : null,
      targetLabel: checkingAccounts.length === 1 ? (checkingAccounts[0].name || "Checking") : "Checking",
      targetDescriptor: checkingAccounts.length === 1 ? bankDescriptors.find((entry) => entry.id === checkingAccounts[0].id) : null,
      impliedCheckingSource: false,
      text: moveText,
    };
  }

  if (matchedCard && amount > 0) {
    return {
      kind: "card-payment",
      amount,
      targetId: matchedCard.id,
      targetLabel: matchedCard.label,
      targetDescriptor: matchedCard,
      impliedCheckingSource: true,
      text: moveText,
    };
  }

  return null;
}

export function buildAuditMovePlan({ audit, cards = [], bankAccounts = [] } = {}) {
  if (!audit || audit.isTest || !audit.parsed || !Array.isArray(audit.parsed.moveItems)) {
    return emptyPlan();
  }

  const moveChecks = audit.moveChecks || {};
  const cardDescriptors = buildCardDescriptors(cards);
  const bankDescriptors = buildBankDescriptors(bankAccounts);
  const checkingAccounts = getCheckingAccounts(bankAccounts);
  const savingsAccounts = getSavingsAccounts(bankAccounts);
  const actualCheckingTotal = checkingAccounts.reduce((sum, account) => sum + getActualBankBalance(account), 0);
  const actualSavingsTotal = savingsAccounts.reduce((sum, account) => sum + getActualBankBalance(account), 0);
  const cardTargets = {};
  const bankTargets = {};
  const genericSummaryMap = new Map();
  const unresolvedMoves = [];
  let matchedCount = 0;
  let reconciledCount = 0;
  let impliedCheckingDelta = 0;

  audit.parsed.moveItems.forEach((move, index) => {
    if (!moveChecks[index] && !moveChecks[String(index)]) return;

    const moveText = String(move?.text || "").trim();
    const amount = parseDollarAmount(moveText);
    const classification = classifyMove(moveText, amount, cardDescriptors, bankDescriptors, checkingAccounts, savingsAccounts);

    if (!classification) {
      unresolvedMoves.push(moveText);
      return;
    }

    matchedCount++;
    let remainingAmount = amount || 0;
    let targetDelta = 0;

    if (classification.kind === "card-payment" && classification.targetDescriptor?.card) {
      const actualBalance = getActualCardBalance(classification.targetDescriptor.card);
      const baselineBalance = getBaselineDebtForCard(audit, classification.targetDescriptor);
      const progress = Math.max(0, baselineBalance - actualBalance);
      remainingAmount = Math.max(0, (amount || 0) - progress);
      if (remainingAmount < 1) {
        reconciledCount++;
      } else {
        targetDelta = -remainingAmount;
        appendAccountDelta(cardTargets, classification.targetId, {
          id: classification.targetId,
          label: classification.targetLabel,
          actualBalance,
          delta: targetDelta,
          projectedBalance: Math.max(0, actualBalance + targetDelta),
          remainingAmount,
          moveCount: 1,
          moveTexts: [moveText],
        });
      }
    } else if (classification.kind === "bank-savings-increase") {
      const baselineSavings = getBaselineBankTotal(audit, "savings", actualSavingsTotal);
      const progress = Math.max(0, actualSavingsTotal - baselineSavings);
      remainingAmount = Math.max(0, (amount || 0) - progress);
      if (remainingAmount < 1) {
        reconciledCount++;
      } else if (classification.targetId) {
        const targetAccount = bankAccounts.find((account) => account.id === classification.targetId) || null;
        const actualBalance = getActualBankBalance(targetAccount);
        targetDelta = remainingAmount;
        appendAccountDelta(bankTargets, classification.targetId, {
          id: classification.targetId,
          label: classification.targetLabel,
          actualBalance,
          delta: targetDelta,
          projectedBalance: Math.max(0, actualBalance + targetDelta),
          remainingAmount,
          moveCount: 1,
          moveTexts: [moveText],
        });
      } else {
        appendSummary(genericSummaryMap, "generic-savings", "Savings", remainingAmount, moveText);
      }
    } else if (classification.kind === "bank-checking-decrease") {
      const baselineChecking = getBaselineBankTotal(audit, "checking", actualCheckingTotal);
      const progress = Math.max(0, baselineChecking - actualCheckingTotal);
      remainingAmount = Math.max(0, (amount || 0) - progress);
      if (remainingAmount < 1) {
        reconciledCount++;
      } else if (classification.targetId) {
        const targetAccount = bankAccounts.find((account) => account.id === classification.targetId) || null;
        const actualBalance = getActualBankBalance(targetAccount);
        targetDelta = -remainingAmount;
        appendAccountDelta(bankTargets, classification.targetId, {
          id: classification.targetId,
          label: classification.targetLabel,
          actualBalance,
          delta: targetDelta,
          projectedBalance: Math.max(0, actualBalance + targetDelta),
          remainingAmount,
          moveCount: 1,
          moveTexts: [moveText],
        });
      } else {
        appendSummary(genericSummaryMap, "generic-checking", "Checking", -remainingAmount, moveText);
      }
    }

    if (remainingAmount >= 1 && classification.impliedCheckingSource) {
      impliedCheckingDelta -= remainingAmount;
      if (checkingAccounts.length === 1) {
        const checkingAccount = checkingAccounts[0];
        const actualBalance = getActualBankBalance(checkingAccount);
        appendAccountDelta(bankTargets, checkingAccount.id, {
          id: checkingAccount.id,
          label: checkingAccount.name || checkingAccount.bank || "Checking",
          actualBalance,
          delta: -remainingAmount,
          projectedBalance: Math.max(0, actualBalance - remainingAmount),
          remainingAmount,
          moveCount: 1,
          moveTexts: [moveText],
        });
      } else {
        appendSummary(genericSummaryMap, "generic-checking-source", "Checking", -remainingAmount, moveText);
      }
    }
  });

  const genericSummaries = Array.from(genericSummaryMap.values())
    .filter((entry) => Math.abs(entry.delta || 0) >= 1)
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));

  const highlights = buildHighlights(cardTargets, bankTargets, genericSummaries);
  const activeCount = highlights.length + unresolvedMoves.length;

  return {
    activeCount,
    matchedCount,
    reconciledCount,
    unresolvedMoves,
    cardTargets,
    bankTargets,
    genericSummaries,
    highlights,
    impliedCheckingDelta,
  };
}
