function toFiniteMoney(value) {
  if (value == null || value === "") return null;
  const num = typeof value === "number" ? value : parseFloat(String(value).replace(/,/g, ""));
  return Number.isFinite(num) ? num : null;
}

import { applyMoveAssignment, resolveMoveAction, normalizeMoveText, parseMoveAmount } from "./moveSemantics.js";

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

function emptyPlan() {
  return {
    activeCount: 0,
    matchedCount: 0,
    reconciledCount: 0,
    unresolvedMoves: [],
    cardTargets: {},
    bankTargets: {},
    debtTargets: {},
    investmentTargets: {},
    genericSummaries: [],
    highlights: [],
    impliedCheckingDelta: 0,
  };
}

function getCheckingAccounts(bankAccounts = []) {
  return bankAccounts.filter((account) => String(account.accountType || "").toLowerCase() === "checking");
}

function getSavingsAccounts(bankAccounts = []) {
  return bankAccounts.filter((account) => String(account.accountType || "").toLowerCase() === "savings");
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

function buildHighlights(cardTargets, bankTargets, debtTargets, investmentTargets, genericSummaries) {
  return [
    ...Object.values(cardTargets),
    ...Object.values(bankTargets),
    ...Object.values(debtTargets),
    ...Object.values(investmentTargets),
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

function getBaselineDebtForCard(audit, classification) {
  const debts = Array.isArray(audit?.form?.debts) ? audit.form.debts : [];
  const exact = debts.find((debt) => debt?.cardId && debt.cardId === classification?.targetId);
  if (exact) return toFiniteMoney(exact.balance) ?? 0;

  const normalizedLabel = normalizeMoveText(classification?.targetLabel);
  const matched = debts.find((debt) => normalizeMoveText(debt?.name) === normalizedLabel);
  return toFiniteMoney(matched?.balance) ?? 0;
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

function getCurrentDebtBalance(financialConfig, targetIndex) {
  const debt = financialConfig?.nonCardDebts?.[targetIndex];
  return toFiniteMoney(debt?.balance) ?? 0;
}

function getBaselineNonCardDebt(audit, classification, currentBalance) {
  const debts = Array.isArray(audit?.form?.debts) ? audit.form.debts : [];
  const normalizedLabel = normalizeMoveText(classification?.targetLabel);
  const matched = debts.find((debt) => normalizeMoveText(debt?.name) === normalizedLabel);
  return toFiniteMoney(matched?.balance) ?? currentBalance;
}

function getCurrentInvestmentBalance(financialConfig, targetKey) {
  return toFiniteMoney(financialConfig?.[targetKey]) ?? 0;
}

function getBaselineInvestmentBalance(audit, targetKey, currentValue) {
  const formValue = toFiniteMoney(audit?.form?.[targetKey]);
  if (formValue != null) return formValue;

  const aliasMap = {
    investmentRoth: ["roth", "rothBalance"],
    investmentBrokerage: ["brokerage", "brokerageBalance"],
    k401Balance: ["k401Balance", "401kBalance"],
    hsaBalance: ["hsaBalance"],
  };
  const aliases = aliasMap[targetKey] || [];
  for (const alias of aliases) {
    const aliasValue = toFiniteMoney(audit?.form?.[alias]);
    if (aliasValue != null) return aliasValue;
  }
  return currentValue;
}

export function buildAuditMovePlan({ audit, cards = [], bankAccounts = [], financialConfig = {} } = {}) {
  if (!audit || audit.isTest || !audit.parsed || !Array.isArray(audit.parsed.moveItems)) {
    return emptyPlan();
  }

  const moveChecks = audit.moveChecks || {};
  const moveAssignments = audit.moveAssignments || {};
  const checkingAccounts = getCheckingAccounts(bankAccounts);
  const savingsAccounts = getSavingsAccounts(bankAccounts);
  const actualCheckingTotal = checkingAccounts.reduce((sum, account) => sum + getActualBankBalance(account), 0);
  const actualSavingsTotal = savingsAccounts.reduce((sum, account) => sum + getActualBankBalance(account), 0);
  const cardTargets = {};
  const bankTargets = {};
  const debtTargets = {};
  const investmentTargets = {};
  const genericSummaryMap = new Map();
  const unresolvedMoves = [];
  let matchedCount = 0;
  let reconciledCount = 0;
  let impliedCheckingDelta = 0;

  audit.parsed.moveItems.forEach((move, index) => {
    if (!moveChecks[index] && !moveChecks[String(index)]) return;

    const moveText = String(move?.text || "").trim();
    const amount = toFiniteMoney(move?.amount) ?? parseMoveAmount(moveText);
    const classification = applyMoveAssignment(resolveMoveAction({
      move: { ...move, amount: amount ?? move?.amount, text: moveText },
      cards,
      bankAccounts,
      financialConfig,
      manualOnly: false,
    }), moveAssignments[index] || moveAssignments[String(index)] || null, bankAccounts);

    if (!classification || classification.transactional === false || !Number.isFinite(amount) || amount <= 0) {
      unresolvedMoves.push(moveText);
      return;
    }

    matchedCount++;
    let remainingAmount = amount;

    if (classification.kind === "card-payment" && classification.targetDescriptor?.card) {
      const actualBalance = getActualCardBalance(classification.targetDescriptor.card);
      const baselineBalance = getBaselineDebtForCard(audit, classification);
      const progress = Math.max(0, baselineBalance - actualBalance);
      remainingAmount = Math.max(0, amount - progress);
      if (remainingAmount < 1) {
        reconciledCount++;
      } else {
        appendAccountDelta(cardTargets, classification.targetId, {
          id: classification.targetId,
          label: classification.targetLabel,
          actualBalance,
          delta: -remainingAmount,
          projectedBalance: Math.max(0, actualBalance - remainingAmount),
          remainingAmount,
          moveCount: 1,
          moveTexts: [moveText],
        });
      }
    } else if (classification.kind === "debt-payment") {
      const actualBalance = getCurrentDebtBalance(financialConfig, classification.targetIndex);
      const baselineBalance = getBaselineNonCardDebt(audit, classification, actualBalance);
      const progress = Math.max(0, baselineBalance - actualBalance);
      remainingAmount = Math.max(0, amount - progress);
      if (remainingAmount < 1) {
        reconciledCount++;
      } else {
        appendAccountDelta(debtTargets, String(classification.targetIndex), {
          id: String(classification.targetIndex),
          label: classification.targetLabel,
          actualBalance,
          delta: -remainingAmount,
          projectedBalance: Math.max(0, actualBalance - remainingAmount),
          remainingAmount,
          moveCount: 1,
          moveTexts: [moveText],
        });
      }
    } else if (classification.kind === "bank-savings-increase") {
      const baselineSavings = getBaselineBankTotal(audit, "savings", actualSavingsTotal);
      const progress = Math.max(0, actualSavingsTotal - baselineSavings);
      remainingAmount = Math.max(0, amount - progress);
      if (remainingAmount < 1) {
        reconciledCount++;
      } else if (classification.targetId) {
        const targetAccount = bankAccounts.find((account) => account.id === classification.targetId) || null;
        const actualBalance = getActualBankBalance(targetAccount);
        appendAccountDelta(bankTargets, classification.targetId, {
          id: classification.targetId,
          label: classification.targetLabel,
          actualBalance,
          delta: remainingAmount,
          projectedBalance: Math.max(0, actualBalance + remainingAmount),
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
      remainingAmount = Math.max(0, amount - progress);
      if (remainingAmount < 1) {
        reconciledCount++;
      } else if (classification.targetId) {
        const targetAccount = bankAccounts.find((account) => account.id === classification.targetId) || null;
        const actualBalance = getActualBankBalance(targetAccount);
        appendAccountDelta(bankTargets, classification.targetId, {
          id: classification.targetId,
          label: classification.targetLabel,
          actualBalance,
          delta: -remainingAmount,
          projectedBalance: Math.max(0, actualBalance - remainingAmount),
          remainingAmount,
          moveCount: 1,
          moveTexts: [moveText],
        });
      } else {
        appendSummary(genericSummaryMap, "generic-checking", "Checking", -remainingAmount, moveText);
      }
    } else if (classification.kind === "bank-checking-increase") {
      if (classification.targetId) {
        const targetAccount = bankAccounts.find((account) => account.id === classification.targetId) || null;
        const actualBalance = getActualBankBalance(targetAccount);
        appendAccountDelta(bankTargets, classification.targetId, {
          id: classification.targetId,
          label: classification.targetLabel,
          actualBalance,
          delta: remainingAmount,
          projectedBalance: Math.max(0, actualBalance + remainingAmount),
          remainingAmount,
          moveCount: 1,
          moveTexts: [moveText],
        });
      } else {
        appendSummary(genericSummaryMap, "generic-checking-increase", "Checking", remainingAmount, moveText);
      }

      if (classification.sourceId) {
        const sourceAccount = bankAccounts.find((account) => account.id === classification.sourceId) || null;
        const sourceActualBalance = getActualBankBalance(sourceAccount);
        appendAccountDelta(bankTargets, classification.sourceId, {
          id: classification.sourceId,
          label: classification.sourceLabel,
          actualBalance: sourceActualBalance,
          delta: -remainingAmount,
          projectedBalance: Math.max(0, sourceActualBalance - remainingAmount),
          remainingAmount,
          moveCount: 1,
          moveTexts: [moveText],
        });
      } else if (savingsAccounts.length > 0) {
        appendSummary(genericSummaryMap, "generic-savings-source", "Savings", -remainingAmount, moveText);
      }
    } else if (classification.kind === "investment-contribution") {
      const actualBalance = getCurrentInvestmentBalance(financialConfig, classification.targetKey);
      const baselineBalance = getBaselineInvestmentBalance(audit, classification.targetKey, actualBalance);
      const progress = Math.max(0, actualBalance - baselineBalance);
      remainingAmount = Math.max(0, amount - progress);
      if (remainingAmount < 1) {
        reconciledCount++;
      } else {
        appendAccountDelta(investmentTargets, classification.targetKey, {
          id: classification.targetKey,
          label: classification.targetLabel,
          actualBalance,
          delta: remainingAmount,
          projectedBalance: Math.max(0, actualBalance + remainingAmount),
          remainingAmount,
          moveCount: 1,
          moveTexts: [moveText],
        });
      }
    }

    if (remainingAmount >= 1 && classification.impliedCheckingSource) {
      impliedCheckingDelta -= remainingAmount;
      const selectedCheckingAccount =
        checkingAccounts.find((account) => account.id === classification.fundingSourceId) ||
        (checkingAccounts.length === 1 ? checkingAccounts[0] : null);
      if (selectedCheckingAccount) {
        const checkingAccount = selectedCheckingAccount;
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
      } else if (checkingAccounts.length > 0) {
        appendSummary(genericSummaryMap, "generic-implied-checking", "Checking", -remainingAmount, moveText);
      }
    }
  });

  const genericSummaries = Array.from(genericSummaryMap.values());
  const checkedCount = Object.values(moveChecks).filter(Boolean).length;
  return {
    activeCount: Math.max(0, checkedCount - reconciledCount),
    matchedCount,
    reconciledCount,
    unresolvedMoves,
    cardTargets,
    bankTargets,
    debtTargets,
    investmentTargets,
    genericSummaries,
    highlights: buildHighlights(cardTargets, bankTargets, debtTargets, investmentTargets, genericSummaries),
    impliedCheckingDelta,
  };
}
