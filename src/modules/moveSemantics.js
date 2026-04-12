import { getCardLabel } from "./cards.js";

function toFiniteAmount(value) {
  if (value == null || value === "") return null;
  const num = typeof value === "number" ? value : parseFloat(String(value).replace(/,/g, ""));
  return Number.isFinite(num) ? num : null;
}

export function normalizeMoveText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeMoveText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function addAlias(aliasSet, value) {
  const normalized = normalizeMoveText(value);
  if (!normalized || normalized.length < 3) return;
  aliasSet.add(normalized);
  if (normalized.endsWith(" card")) aliasSet.add(normalized.replace(/\s+card$/i, "").trim());
  if (normalized.endsWith(" account")) aliasSet.add(normalized.replace(/\s+account$/i, "").trim());
  if (normalized.includes("american express")) aliasSet.add(normalized.replace(/american express/g, "amex").trim());
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

export function parseMoveAmount(text) {
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

function normalizeMoveItemShape(item) {
  if (typeof item === "string") {
    const text = item.trim();
    if (!text) return null;
    return { tag: null, text, done: false };
  }

  if (!item || typeof item !== "object") return null;
  const title = String(item.title || item.label || "").trim();
  const detail = String(item.detail || "").trim();
  const text = String(item.text || detail || title || "").trim();
  if (!text) return null;
  const normalized = {
    tag: item.tag || null,
    text,
    done: false,
  };
  if (title) normalized.title = title;
  if (detail) normalized.detail = detail;
  const amount = toFiniteAmount(item.amount);
  if (amount != null) normalized.amount = amount;
  if (typeof item.semanticKind === "string" && item.semanticKind.trim()) normalized.semanticKind = item.semanticKind.trim();
  if (typeof item.targetLabel === "string" && item.targetLabel.trim()) normalized.targetLabel = item.targetLabel.trim();
  if (typeof item.sourceLabel === "string" && item.sourceLabel.trim()) normalized.sourceLabel = item.sourceLabel.trim();
  if (typeof item.routeLabel === "string" && item.routeLabel.trim()) normalized.routeLabel = item.routeLabel.trim();
  if (typeof item.fundingLabel === "string" && item.fundingLabel.trim()) normalized.fundingLabel = item.fundingLabel.trim();
  if (typeof item.targetKey === "string" && item.targetKey.trim()) normalized.targetKey = item.targetKey.trim();
  if (typeof item.contributionKey === "string" && item.contributionKey.trim()) normalized.contributionKey = item.contributionKey.trim();
  if (typeof item.transactional === "boolean") normalized.transactional = item.transactional;
  return normalized;
}

export function normalizeMoveItems(rawMoveItems, fallbackWeeklyMoves = []) {
  const items = Array.isArray(rawMoveItems) && rawMoveItems.length > 0 ? rawMoveItems : fallbackWeeklyMoves;
  return items
    .map((item) => normalizeMoveItemShape(item))
    .filter(Boolean);
}

function isManualCard(card) {
  return !card?._plaidAccountId || Boolean(card?._plaidManualFallback);
}

function isManualBank(account) {
  return !account?._plaidAccountId || Boolean(account?._plaidManualFallback);
}

function buildCardDescriptors(cards = [], { manualOnly = false } = {}) {
  return cards
    .filter((card) => !manualOnly || isManualCard(card))
    .map((card) => {
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

function buildBankDescriptors(bankAccounts = [], { manualOnly = false } = {}) {
  return bankAccounts
    .filter((account) => !manualOnly || isManualBank(account))
    .map((account) => {
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

function buildAccountOption(descriptor) {
  if (!descriptor?.account?.id) return null;
  return {
    id: descriptor.account.id,
    label: descriptor.label || descriptor.account.name || descriptor.account.bank || "Account",
    accountType: String(descriptor.account.accountType || "").toLowerCase(),
  };
}

function buildDebtDescriptors(nonCardDebts = []) {
  return nonCardDebts.map((debt, index) => {
    const aliases = new Set();
    addAlias(aliases, debt.name);
    addAlias(aliases, debt.type);
    if (String(debt.type || "").toLowerCase().includes("student")) addAlias(aliases, "student loan");
    if (String(debt.type || "").toLowerCase().includes("auto")) addAlias(aliases, "car loan");
    return {
      index,
      aliases: Array.from(aliases),
      label: debt.name || "Debt",
      debt,
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

function getAccountDescriptorsByType(bankDescriptors = [], accountType) {
  return bankDescriptors.filter((entry) => String(entry?.account?.accountType || "").toLowerCase() === accountType);
}

function inferInvestmentBucket(normalizedText) {
  const bucketMatchers = [
    { key: "investmentRoth", contributionKey: "rothContributedYTD", label: "Roth IRA", pattern: /\broth\b/ },
    { key: "investmentBrokerage", contributionKey: null, label: "Brokerage", pattern: /\bbrokerage\b/ },
    { key: "k401Balance", contributionKey: "k401ContributedYTD", label: "401(k)", pattern: /\b401k\b|\b401 k\b|\b401\(k\)\b/ },
    { key: "hsaBalance", contributionKey: "hsaContributedYTD", label: "HSA", pattern: /\bhsa\b/ },
  ];
  return bucketMatchers.find((bucket) => bucket.pattern.test(normalizedText)) || null;
}

function resolveExplicitDescriptor(label, descriptors = [], minScore = 2) {
  const normalizedLabel = normalizeMoveText(label);
  if (!normalizedLabel) return null;
  return findBestDescriptor(normalizedLabel, descriptors, minScore);
}

export function resolveMoveAction({
  move,
  cards = [],
  bankAccounts = [],
  financialConfig = {},
  manualOnly = false,
} = {}) {
  const moveText = String(typeof move === "string" ? move : move?.text || "").trim();
  if (!moveText) return null;

  const normalizedText = normalizeMoveText(moveText);
  const amount = toFiniteAmount(move?.amount) ?? parseMoveAmount(moveText);
  const semanticKind = typeof move?.semanticKind === "string" ? move.semanticKind : null;
  const explicitTargetLabel = typeof move?.targetLabel === "string" ? move.targetLabel : null;
  const explicitSourceLabel = typeof move?.sourceLabel === "string" ? move.sourceLabel : null;

  const cardDescriptors = buildCardDescriptors(cards, { manualOnly });
  const bankDescriptors = buildBankDescriptors(bankAccounts, { manualOnly });
  const debtDescriptors = buildDebtDescriptors(financialConfig?.nonCardDebts || []);
  const checkingDescriptors = getAccountDescriptorsByType(bankDescriptors, "checking");
  const savingsDescriptors = getAccountDescriptorsByType(bankDescriptors, "savings");

  const matchedCard = resolveExplicitDescriptor(explicitTargetLabel, cardDescriptors) || findBestDescriptor(normalizedText, cardDescriptors, 3);
  const matchedBank = resolveExplicitDescriptor(explicitTargetLabel, bankDescriptors, 3) || findBestDescriptor(normalizedText, bankDescriptors, 4);
  const matchedDebt = resolveExplicitDescriptor(explicitTargetLabel, debtDescriptors, 2) || findBestDescriptor(normalizedText, debtDescriptors, 3);
  const explicitSourceBank = resolveExplicitDescriptor(explicitSourceLabel, bankDescriptors, 2);

  const paymentish = /\b(pay|payment|statement|card|debt|loan|principal|toward|towards|throw|attack|apply)\b/.test(normalizedText);
  const savingsToken = /\b(savings|vault|ally|reserve|emergency fund)\b/.test(normalizedText);
  const savingsish = /\b(save|stash|fund|transfer|move|route|sweep|reserve)\b/.test(normalizedText) && savingsToken;
  const investish = /\b(invest|buy|contribute|contribution|deposit|fund|put)\b/.test(normalizedText);
  const transferish = /\b(transfer|move|route|sweep|shift)\b/.test(normalizedText);
  const checkingToken = /\b(checking|buffer|floor|cash)\b/.test(normalizedText);
  const preserveCheckingish = checkingToken && /\b(hold|keep|maintain|preserve|protect|above|minimum|min)\b/.test(normalizedText) && !transferish;
  const checkingIncreaseish = checkingToken && /\b(rebuild|restore|replenish|top up|boost)\b/.test(normalizedText);
  const checkingDecreaseish = checkingToken && /\b(withdraw|spend|use|pull|take)\b/.test(normalizedText);
  const transferSavingsToChecking = transferish && /\bfrom\b/.test(normalizedText) && /\bto\b/.test(normalizedText) && savingsToken && checkingToken;
  const spendingHoldish = /\b(pause|hold|freeze|avoid|cut|reduce)\b/.test(normalizedText) && /\b(spending|expenses|purchases|discretionary)\b/.test(normalizedText);
  const investmentBucket = semanticKind === "investment-contribution"
    ? {
        key: move?.targetKey || null,
        contributionKey: move?.contributionKey || null,
        label: explicitTargetLabel || "Investment",
      }
    : inferInvestmentBucket(normalizedText);

  if (semanticKind === "preserve-checking-floor" || preserveCheckingish) {
    return {
      kind: "preserve-checking-floor",
      amount,
      transactional: false,
      text: moveText,
    };
  }

  if (semanticKind === "spending-hold" || spendingHoldish) {
    return {
      kind: "spending-hold",
      amount,
      transactional: false,
      text: moveText,
    };
  }

  if ((semanticKind === "card-payment" || (!semanticKind && matchedCard && paymentish) || (!semanticKind && matchedCard && amount > 0)) && matchedCard) {
    return {
      kind: "card-payment",
      amount,
      targetId: matchedCard.id,
      targetLabel: matchedCard.label,
      targetDescriptor: matchedCard,
      impliedCheckingSource: true,
      transactional: true,
      text: moveText,
    };
  }

  if ((semanticKind === "debt-payment" || (!semanticKind && matchedDebt && paymentish)) && matchedDebt) {
    return {
      kind: "debt-payment",
      amount,
      targetIndex: matchedDebt.index,
      targetLabel: matchedDebt.label,
      targetDescriptor: matchedDebt,
      impliedCheckingSource: true,
      transactional: true,
      text: moveText,
    };
  }

  if ((semanticKind === "bank-savings-increase" || (!semanticKind && matchedBank?.account?.accountType === "savings" && (savingsish || !paymentish))) && (matchedBank || savingsDescriptors.length === 1)) {
    const descriptor = matchedBank?.account?.accountType === "savings" ? matchedBank : savingsDescriptors[0];
    return {
      kind: "bank-savings-increase",
      amount,
      targetId: descriptor?.id || null,
      targetLabel: descriptor?.label || explicitTargetLabel || "Savings",
      targetDescriptor: descriptor || null,
      impliedCheckingSource: true,
      transactional: true,
      text: moveText,
    };
  }

  if (semanticKind === "bank-checking-increase" || (!semanticKind && (transferSavingsToChecking || checkingIncreaseish))) {
    const checkingDescriptor =
      (matchedBank?.account?.accountType === "checking" ? matchedBank : null) ||
      resolveExplicitDescriptor(explicitTargetLabel, checkingDescriptors, 2) ||
      (checkingDescriptors.length === 1 ? checkingDescriptors[0] : null);
    const savingsDescriptor =
      explicitSourceBank ||
      (matchedBank?.account?.accountType === "savings" ? matchedBank : null) ||
      resolveExplicitDescriptor(explicitSourceLabel, savingsDescriptors, 2) ||
      (savingsDescriptors.length === 1 ? savingsDescriptors[0] : null);
    return {
      kind: "bank-checking-increase",
      amount,
      targetId: checkingDescriptor?.id || null,
      targetLabel: checkingDescriptor?.label || explicitTargetLabel || "Checking",
      targetDescriptor: checkingDescriptor || null,
      sourceId: savingsDescriptor?.id || null,
      sourceLabel: savingsDescriptor?.label || explicitSourceLabel || "Savings",
      sourceDescriptor: savingsDescriptor || null,
      impliedCheckingSource: false,
      transactional: true,
      text: moveText,
    };
  }

  if (semanticKind === "bank-checking-decrease" || (!semanticKind && ((matchedBank?.account?.accountType === "checking" && checkingDecreaseish) || checkingDecreaseish))) {
    const descriptor =
      (matchedBank?.account?.accountType === "checking" ? matchedBank : null) ||
      resolveExplicitDescriptor(explicitTargetLabel, checkingDescriptors, 2) ||
      (checkingDescriptors.length === 1 ? checkingDescriptors[0] : null);
    return {
      kind: "bank-checking-decrease",
      amount,
      targetId: descriptor?.id || null,
      targetLabel: descriptor?.label || explicitTargetLabel || "Checking",
      targetDescriptor: descriptor || null,
      impliedCheckingSource: false,
      transactional: true,
      text: moveText,
    };
  }

  if ((semanticKind === "investment-contribution" || (!semanticKind && investmentBucket && investish)) && investmentBucket) {
    return {
      kind: "investment-contribution",
      amount,
      targetKey: investmentBucket.key,
      contributionKey: investmentBucket.contributionKey || null,
      targetLabel: investmentBucket.label,
      impliedCheckingSource: true,
      transactional: true,
      text: moveText,
    };
  }

  return null;
}

export function applyMoveAssignment(classification, assignment = {}, bankAccounts = []) {
  if (!classification) return null;
  const next = { ...classification };
  const findBank = (id) => bankAccounts.find((account) => account.id === id) || null;

  if (assignment?.targetAccountId) {
    const targetAccount = findBank(assignment.targetAccountId);
    if (targetAccount) {
      next.targetId = targetAccount.id;
      next.targetLabel = targetAccount.name || `${targetAccount.bank || ""} ${targetAccount.accountType || ""}`.trim() || "Account";
      next.targetDescriptor = { id: targetAccount.id, label: next.targetLabel, account: targetAccount };
    }
  }

  if (assignment?.sourceAccountId) {
    const sourceAccount = findBank(assignment.sourceAccountId);
    if (sourceAccount) {
      next.sourceId = sourceAccount.id;
      next.sourceLabel = sourceAccount.name || `${sourceAccount.bank || ""} ${sourceAccount.accountType || ""}`.trim() || "Account";
      next.sourceDescriptor = { id: sourceAccount.id, label: next.sourceLabel, account: sourceAccount };
      if (next.impliedCheckingSource) {
        next.fundingSourceId = sourceAccount.id;
        next.fundingSourceLabel = next.sourceLabel;
      }
    }
  }

  return next;
}

export function getMoveAssignmentOptions({
  move,
  cards = [],
  bankAccounts = [],
  financialConfig = {},
  manualOnly = true,
  assignment = null,
} = {}) {
  const classification = resolveMoveAction({
    move,
    cards,
    bankAccounts,
    financialConfig,
    manualOnly,
  });

  if (!classification || classification.transactional === false) {
    return {
      classification,
      targetOptions: [],
      sourceOptions: [],
    };
  }

  const bankDescriptors = buildBankDescriptors(bankAccounts, { manualOnly });
  const checkingOptions = getAccountDescriptorsByType(bankDescriptors, "checking").map(buildAccountOption).filter(Boolean);
  const savingsOptions = getAccountDescriptorsByType(bankDescriptors, "savings").map(buildAccountOption).filter(Boolean);

  let targetOptions = [];
  let sourceOptions = [];

  if (classification.kind === "bank-savings-increase") {
    targetOptions = savingsOptions;
    if (classification.impliedCheckingSource) sourceOptions = checkingOptions;
  } else if (classification.kind === "bank-checking-increase") {
    targetOptions = checkingOptions;
    sourceOptions = savingsOptions;
  } else if (classification.kind === "bank-checking-decrease") {
    targetOptions = checkingOptions;
  } else if (
    classification.kind === "card-payment" ||
    classification.kind === "debt-payment" ||
    classification.kind === "investment-contribution"
  ) {
    if (classification.impliedCheckingSource) sourceOptions = checkingOptions;
  }

  const assigned = applyMoveAssignment(classification, assignment || {}, bankAccounts);
  return {
    classification: assigned,
    targetOptions,
    sourceOptions,
  };
}
