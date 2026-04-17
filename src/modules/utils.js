import { getShortCardLabel } from "./cards.js";
import { buildDashboardSafetyModel } from "./dashboard/safetyModel.js";
import { log } from "./logger.js";
import { clamp, getGradeLetter } from "./mathHelpers.js";
import { normalizeMoveItems } from "./moveSemantics.js";
import {
  CANONICAL_DASHBOARD_CATEGORIES,
  formatRiskFlag,
  normalizeLooseText,
  sanitizeVisibleAuditCopy,
} from "./utils/auditText.js";
import {
  buildReserveInstruction,
  buildReserveRouteLabel,
  DASHBOARD_ROW_ORDER,
  defaultDashboardStatus,
  extractDollarAmountTotal,
  extractOperationalAllocationTotal,
  inferReserveAccountLabel,
  normalizeAlertEntries,
  normalizeAuditStatus,
  normalizeDashboardCard,
  normalizeHealthScore,
  normalizeHeaderCard,
  normalizeInvestmentsSummary,
  normalizeNegotiationTargets,
  normalizeNextAction,
  normalizeRadar,
  normalizeSpendingAnalysis,
  normalizeStringArray,
  normalizeWeeklyMoveEntries,
  sanitizeAllocationLabel,
} from "./utils/auditModel.js";
import {
  advanceExpiredDate,
  fmt,
  fmtDate,
  parseCurrency,
  stripPaycheckParens,
} from "./utils/formatting.js";
import { db, FaceId, PdfViewer } from "./utils/platform.js";

export {
  advanceExpiredDate,
  db,
  FaceId,
  fmt,
  fmtDate,
  parseCurrency,
  PdfViewer,
  stripPaycheckParens,
};

function daysBetweenIso(startDate, endDate) {
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function isCardChargedRenewal(renewal, cards = []) {
  if (String(renewal?.chargedToType || "").trim().toLowerCase() === "card") return true;

  const chargedToId = String(renewal?.chargedToId || "").trim();
  if (chargedToId && cards.some((card) => String(card?.id || "") === chargedToId)) return true;

  const chargedTo = String(renewal?.chargedTo || "").trim().toLowerCase();
  if (!chargedTo) return false;
  return cards.some((card) => {
    const names = [card?.name, card?.nickname, card?.institution]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean);
    return names.some((name) => chargedTo === name || chargedTo.includes(name));
  });
}

function collectUpcomingCashObligations({
  renewals = [],
  cards = [],
  snapshotDate,
  horizonDays = 7,
}) {
  if (!snapshotDate) return [];

  return (Array.isArray(renewals) ? renewals : [])
    .filter((renewal) => renewal && !renewal.isCancelled && !renewal.archivedAt && renewal.nextDue)
    .map((renewal) => {
      const due = String(renewal.nextDue || "").trim();
      const daysUntilDue = daysBetweenIso(snapshotDate, due);
      const amount = parseCurrency(renewal.amount) || 0;
      return {
        renewal,
        due,
        daysUntilDue,
        amount,
        isCardCharge: isCardChargedRenewal(renewal, cards),
      };
    })
    .filter((entry) => entry.amount > 0 && entry.daysUntilDue != null && entry.daysUntilDue >= 0 && entry.daysUntilDue <= horizonDays && !entry.isCardCharge)
    .sort((left, right) => (left.due < right.due ? -1 : left.due > right.due ? 1 : right.amount - left.amount));
}

function collectRuleBasedCashObligations({
  personalRules = "",
  snapshotDate,
  horizonDays = 21,
}) {
  const text = String(personalRules || "").trim();
  if (!text || !snapshotDate) return [];

  /** @type {Array<{renewal:{name:string}, due:string, daysUntilDue:number|null, amount:number, isCardCharge:boolean}>} */
  const obligations = [];
  const seen = new Set();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  const pushObligation = (name, amount, due) => {
    const normalizedName = String(name || "").replace(/^\d+\)\s*/, "").trim();
    const numericAmount = parseCurrency(amount) || 0;
    const dueDate = String(due || "").trim();
    const daysUntilDue = daysBetweenIso(snapshotDate, dueDate);
    if (!normalizedName || numericAmount <= 0 || !dueDate || daysUntilDue == null || daysUntilDue < 0 || daysUntilDue > horizonDays) return;
    const key = `${normalizedName}|${numericAmount}|${dueDate}`;
    if (seen.has(key)) return;
    seen.add(key);
    obligations.push({
      renewal: { name: normalizedName },
      due: dueDate,
      daysUntilDue,
      amount: numericAmount,
      isCardCharge: false,
    });
  };

  for (const line of lines) {
    const dueMatch = line.match(/^(?:\d+\)\s*)?([^:]+):\s*\$?([\d,]+(?:\.\d{1,2})?)\s+due\s+(\d{4}-\d{2}-\d{2})/i);
    if (dueMatch) {
      pushObligation(dueMatch[1], dueMatch[2], dueMatch[3]);
    }
  }

  const netGapMatch = text.match(/Remaining Net Gap:\s*\$?([\d,]+(?:\.\d{1,2})?)/i);
  const nyDueMatch = text.match(/Total NY Liability:\s*\$?[\d,]+(?:\.\d{1,2})?\s+due\s+(\d{4}-\d{2}-\d{2})/i);
  if (netGapMatch && nyDueMatch) {
    for (let index = obligations.length - 1; index >= 0; index -= 1) {
      const name = String(obligations[index]?.renewal?.name || "");
      if (/ny liability|ny tax payment|tax escrow/i.test(name)) {
        obligations.splice(index, 1);
      }
    }
    pushObligation("NY Tax Funding Gap", netGapMatch[1], nyDueMatch[1]);
  }

  return obligations.sort((left, right) => (left.due < right.due ? -1 : left.due > right.due ? 1 : right.amount - left.amount));
}

function parseAuditRuleHints({ personalRules = "", cards = [] } = {}) {
  const text = String(personalRules || "").trim();
  if (!text) {
    return {
      checkingOnlyLabels: new Set(),
      allyOnlyLabels: new Set(),
      safetyCardTarget: "",
      enforceSafetyPayment: false,
      allyReconciliationRequired: false,
      minimizeAllyWithdrawals: false,
    };
  }

  const checkingOnlyLabels = new Set();
  const allyOnlyLabels = new Set();

  for (const match of text.matchAll(/-\s*([^:\n]+?)\s+is ALWAYS a checking-paid cash outflow/gi)) {
    const label = sanitizeAllocationLabel(match[1]);
    if (label) checkingOnlyLabels.add(normalizeLooseText(label));
  }

  for (const match of text.matchAll(/-\s*([^:\n]+?)\s+RESERVED\s*\(locked in ally\)/gi)) {
    const label = sanitizeAllocationLabel(match[1]);
    if (label) allyOnlyLabels.add(normalizeLooseText(label));
  }

  const rawSafetyCard = String(text.match(/DefaultSubscriptionsCard\s*=\s*([^\n]+)/i)?.[1] || "").trim();
  const normalizedCards = Array.isArray(cards) ? cards : [];
  const matchedSafetyCard = normalizedCards.find((card) => {
    const labels = [card?.name, card?.nickname, card?.institution]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean);
    const normalizedRaw = rawSafetyCard.toLowerCase();
    return labels.some((label) => normalizedRaw.includes(label) || label.includes(normalizedRaw));
  });

  return {
    checkingOnlyLabels,
    allyOnlyLabels,
    safetyCardTarget: normalizeDebtTargetLabel(
      matchedSafetyCard ? (getShortCardLabel(normalizedCards, matchedSafetyCard) || matchedSafetyCard.name) : rawSafetyCard,
      normalizedCards
    ),
    enforceSafetyPayment:
      /statement close\/due date is unknown/i.test(text) &&
      /\bpay this card toward \$?0(?:\.00)? weekly\b/i.test(text),
    allyReconciliationRequired: /unallocated\s*=\s*allyvaulttotal/i.test(text),
    minimizeAllyWithdrawals: /prefer ONE planned transfer/i.test(text),
  };
}

function buildObligationSummary(obligations = []) {
  const items = obligations
    .slice(0, 4)
    .map((entry) => `${sanitizeAllocationLabel(entry.renewal?.name || "Upcoming bill")} (${fmt(entry.amount)} by ${entry.due})`);
  const remaining = Math.max(0, obligations.length - items.length);
  if (remaining > 0) items.push(`+ ${remaining} more protected item${remaining === 1 ? "" : "s"}`);
  return items.join(", ");
}

function buildObligationLabelSummary(obligations = []) {
  const items = obligations
    .slice(0, 4)
    .map((entry) => sanitizeAllocationLabel(entry.renewal?.name || "Upcoming bill"))
    .filter(Boolean);
  const remaining = Math.max(0, obligations.length - items.length);
  if (remaining > 0) items.push(`+ ${remaining} more`);
  return items.join(", ");
}

function extractDebtFundingIntentFromNotes({ notes = "", cards = [] } = {}) {
  const text = String(notes || "").trim();
  if (!text) return null;

  const amountMatches = [...text.matchAll(/\$?\s*([\d,]+(?:\.\d{1,2})?)/g)];
  const amount = amountMatches.reduce((sum, match) => {
    const parsedAmount = parseCurrency(match[1]) || 0;
    return parsedAmount >= 10 ? sum + parsedAmount : sum;
  }, 0);
  if (!(amount > 0)) return null;

  const normalized = text.toLowerCase();
  const intentDetected =
    /\b(to be paid|paid towards|pay toward|pay towards|pay down|toward|towards)\b/.test(normalized) ||
    /\bavailable for\b/.test(normalized);
  if (!intentDetected) return null;

  const normalizedCards = Array.isArray(cards) ? cards : [];
  let matchedCard =
    normalizedCards.find((card) => {
      const labels = [card?.name, card?.nickname, card?.institution]
        .map((value) => String(value || "").trim())
        .filter(Boolean);
      return labels.some((label) => normalized.includes(label.toLowerCase()));
    }) || null;

  if (!matchedCard && /\bamex\b/i.test(text)) {
    const amexCards = normalizedCards.filter((card) =>
      [card?.name, card?.nickname, card?.institution]
        .map((value) => String(value || "").toLowerCase())
        .some((label) => label.includes("american express") || label.includes("amex"))
    );
    if (amexCards.length === 1) matchedCard = amexCards[0];
  }

  const targetLabel = matchedCard
    ? (getShortCardLabel(normalizedCards, matchedCard) || matchedCard.name || null)
    : (/amex/i.test(text) ? "Amex debt" : null);
  if (!targetLabel) return null;

  return {
    amount,
    targetLabel,
    detail: `You noted ${fmt(amount)} is earmarked toward ${targetLabel}. Treat it as planned payoff context, not optional free cash.`,
  };
}

function isGenericDebtCopy(text) {
  const normalized = String(text || "").toLowerCase();
  return (
    /\bcredit card\s*#?\s*1\b/.test(normalized) ||
    /\bcredit card 1\b/.test(normalized) ||
    /\bhighest interest credit card debt\b/.test(normalized) ||
    /\bhigh[- ]interest credit card debt\b/.test(normalized) ||
    /\bpriority debt\b/.test(normalized)
  );
}

function withExplicitDebtTarget(text, targetLabel) {
  if (!text || !targetLabel) return text;
  return String(text)
    .replace(/\bCREDIT CARD\s*#?\s*1\b/gi, targetLabel)
    .replace(/\bcredit card\s*#?\s*1\b/gi, targetLabel)
    .replace(/\bhighest interest credit card debt\b/gi, targetLabel)
    .replace(/\bhigh[- ]interest credit card debt\b/gi, targetLabel)
    .replace(/\bpriority debt\b/gi, targetLabel);
}

function normalizeDebtTargetLabel(targetLabel, cards = []) {
  const target = String(targetLabel || "").trim();
  if (!target) return "";
  const normalized = target.toLowerCase();
  const matchedCard = (Array.isArray(cards) ? cards : []).find((card) => {
    const labels = [card?.name, card?.nickname]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean);
    return labels.some((label) => normalized.includes(label));
  });
  if (!matchedCard) return target;
  return getShortCardLabel(cards, matchedCard) || target;
}

function inferInvestmentGateStatus({
  existingGateStatus,
  cards = [],
  formData = {},
  computedStrategy = {},
  nativeRiskFlags = [],
  renewals = [],
  personalRules = "",
  snapshotDate,
}) {
  const explicit = typeof existingGateStatus === "string" ? existingGateStatus.trim() : "";
  const cardDebt = (Array.isArray(formData?.debts) ? formData.debts : []).reduce(
    (sum, debt) => sum + Math.max(0, parseCurrency(debt?.balance) || 0),
    0
  );
  const liveCardDebt = (Array.isArray(cards) ? cards : []).reduce(
    (sum, card) => sum + Math.max(0, parseCurrency(card?.balance) || 0),
    0
  );
  const debtTotal = Math.max(cardDebt, liveCardDebt, Number(computedStrategy?.auditSignals?.debt?.total || 0));
  const riskSet = new Set((Array.isArray(nativeRiskFlags) ? nativeRiskFlags : []).map((flag) => String(flag || "").trim()));
  const urgentCashObligations = collectUpcomingCashObligations({
    renewals,
    cards,
    snapshotDate,
    horizonDays: 21,
  });
  const ruleBasedObligations = collectRuleBasedCashObligations({
    personalRules,
    snapshotDate,
    horizonDays: 21,
  });

  const shouldGuard =
    debtTotal > 0 ||
    urgentCashObligations.length > 0 ||
    ruleBasedObligations.length > 0 ||
    riskSet.has("transfer-needed") ||
    riskSet.has("floor-breach-risk") ||
    riskSet.has("critical-promo-expiry") ||
    riskSet.has("promo-expiry");

  if (shouldGuard) return "Guarded — safety first";
  if (explicit) return explicit;
  return "Open";
}

function buildProtectedCashAction({
  obligations = [],
  computedStrategy = {},
}) {
  const amount = obligations.reduce((sum, item) => sum + Math.max(0, item.amount || 0), 0);
  const obligationSummary = obligations
    .slice(0, 4)
    .map((item) => {
      const label = sanitizeAllocationLabel(item?.renewal?.name || "Upcoming bill");
      const reserveAccount = inferReserveSourceLabel(item);
      return `${fmt(item.amount)} ${reserveAccount === "Checking" ? "kept in Checking" : `moved to ${reserveAccount}`} for ${label} by ${item.due}`;
    })
    .join("; ");
  const fallbackAmount = Math.max(0, Number(computedStrategy?.requiredTransfer || 0), Number(computedStrategy?.operationalSurplus || 0));
  return {
    title: amount > 0 ? `Allocate ${fmt(amount)} of protected cash` : "Protect the next 7 days",
    detail: obligationSummary
      ? `Assign the protected dollars now: ${obligationSummary}. Do not route money to optional debt payoff or investing until these reserves are set.`
      : "Hold extra debt paydown until near-term cash obligations are fully covered.",
    amount: amount > 0 ? fmt(amount) : fallbackAmount > 0 ? fmt(fallbackAmount) : null,
  };
}

function buildDebtFundingStagingAction(debtFundingIntent = null) {
  if (!(debtFundingIntent?.amount > 0) || !debtFundingIntent?.targetLabel) return null;
  return {
    title: `Stage ${debtFundingIntent.targetLabel} payoff`,
    detail: `${debtFundingIntent.detail} Keep those proceeds outside spendable cash and apply them only after protected obligations are covered and the funds settle.`,
    amount: fmt(debtFundingIntent.amount),
  };
}

function inferPreferredInvestmentDestination({ formData = {}, financialConfig = {} } = {}) {
  const buckets = [
    {
      label: "Roth IRA",
      targetKey: "investmentRoth",
      contributionKey: "rothContributedYTD",
      values: [formData?.roth, financialConfig?.investmentRoth],
    },
    {
      label: "401(k)",
      targetKey: "k401Balance",
      contributionKey: "k401ContributedYTD",
      values: [formData?.k401Balance, financialConfig?.k401Balance],
    },
    {
      label: "HSA",
      targetKey: "hsaBalance",
      contributionKey: "hsaContributedYTD",
      values: [formData?.hsaBalance, financialConfig?.hsaBalance],
    },
    {
      label: "Brokerage",
      targetKey: "investmentBrokerage",
      contributionKey: null,
      values: [formData?.brokerage, financialConfig?.investmentBrokerage],
    },
  ];

  return (
    buckets.find((bucket) =>
      bucket.values.some((value) => {
        const parsed = parseCurrency(value);
        return parsed != null && parsed >= 0;
      })
    ) || null
  );
}

function inferReserveSourceLabel(obligation = null) {
  if (typeof obligation?.preferredSourceLabel === "string" && obligation.preferredSourceLabel.trim()) {
    return obligation.preferredSourceLabel.trim();
  }
  const chargedTo = String(obligation?.renewal?.chargedTo || "").trim();
  const normalized = chargedTo.toLowerCase();
  const obligationName = sanitizeAllocationLabel(obligation?.renewal?.name || "");

  if (!chargedTo) {
    return inferReserveAccountLabel(obligationName);
  }
  if (/\bsavings\b|\bally\b|\bvault\b/.test(normalized)) return "Vault";
  if (/\bchecking\b|\bcash\b/.test(normalized)) return "Checking";
  return chargedTo;
}

function buildProtectedFundingLabel({ keepInChecking = 0, keepInVault = 0, moveFromChecking = 0, moveFromVault = 0, preferredAccount = "" }) {
  if (preferredAccount === "Vault") {
    if (keepInVault > 0 && moveFromChecking > 0) return `Already in Vault ${fmt(keepInVault)} + move ${fmt(moveFromChecking)} from Checking`;
    if (moveFromChecking > 0) return `Move ${fmt(moveFromChecking)} from Checking to Vault`;
    if (keepInVault > 0) return `Already in Vault ${fmt(keepInVault)}`;
  }
  if (keepInChecking > 0 && moveFromVault > 0) return `Already in Checking ${fmt(keepInChecking)} + move ${fmt(moveFromVault)} from Vault`;
  if (moveFromVault > 0) return `Move ${fmt(moveFromVault)} from Vault to Checking`;
  if (keepInChecking > 0) return `Already in Checking ${fmt(keepInChecking)}`;
  return "";
}

function buildOptionalFundingLabel({ fromChecking = 0, fromVault = 0, targetLabel = "" }) {
  if (targetLabel === "Vault") {
    if (fromChecking > 0 && fromVault > 0) return `Checking ${fmt(fromChecking)} + Vault ${fmt(fromVault)} held for Vault`;
    if (fromVault > 0) return `Vault ${fmt(fromVault)} held in place`;
    if (fromChecking > 0) return `Checking ${fmt(fromChecking)} → Vault`;
    return "";
  }
  if (fromChecking > 0 && fromVault > 0) return `Checking ${fmt(fromChecking)} + Vault ${fmt(fromVault)} → Checking → ${targetLabel}`;
  if (fromVault > 0) return `Vault ${fmt(fromVault)} → Checking → ${targetLabel}`;
  if (fromChecking > 0) return `Checking ${fmt(fromChecking)} → ${targetLabel}`;
  return "";
}


function allocateProtectedHold({
  obligation,
  checkingPool = 0,
  vaultPool = 0,
  checkingFloor = 0,
}) {
  const amountNeeded = Math.max(0, Number(obligation?.amount) || 0);
  const targetLabel = sanitizeAllocationLabel(obligation?.renewal?.name || "Upcoming obligation");
  const preferredAccount = inferReserveSourceLabel(obligation);
  const due = String(obligation?.due || "").trim();
  if (!(amountNeeded > 0)) {
    return {
      allocated: 0,
      checkingPool,
      vaultPool,
      move: null,
    };
  }

  if (preferredAccount === "Vault") {
    const keepInVault = Math.min(vaultPool, amountNeeded);
    let neededAfterVault = amountNeeded - keepInVault;
    const transferableChecking = Math.max(0, checkingPool - checkingFloor);
    const moveFromChecking = Math.min(transferableChecking, neededAfterVault);
    neededAfterVault -= moveFromChecking;
    const allocated = keepInVault + moveFromChecking;
    const nextVaultPool = Number((vaultPool - keepInVault).toFixed(2));
    const nextCheckingPool = Number((checkingPool - moveFromChecking).toFixed(2));
    const routeLabel = buildProtectedFundingLabel({ keepInVault, moveFromChecking, preferredAccount });
    let detail = "";
    if (keepInVault > 0 && moveFromChecking > 0) {
      detail = `Keep ${fmt(keepInVault)} in Vault and transfer ${fmt(moveFromChecking)} from Checking to Vault for ${targetLabel}.`;
    } else if (moveFromChecking > 0) {
      detail = `Transfer ${fmt(moveFromChecking)} from Checking to Vault for ${targetLabel}.`;
    } else {
      detail = `Keep ${fmt(keepInVault)} in Vault for ${targetLabel}.`;
    }
    if (allocated < amountNeeded) {
      detail += ` That covers ${fmt(allocated)} of the ${fmt(amountNeeded)} needed by ${due}, leaving a ${fmt(amountNeeded - allocated)} gap.`;
    } else {
      detail += ` Leave it reserved there until ${due}.`;
    }
    return {
      allocated,
      checkingPool: nextCheckingPool,
      vaultPool: nextVaultPool,
      move: {
        title: targetLabel,
        detail,
        amount: fmt(allocated || amountNeeded),
        priority: "required",
        semanticKind: "spending-hold",
        targetLabel,
        sourceLabel: preferredAccount,
        routeLabel,
        fundingLabel: routeLabel,
        transactional: false,
      },
    };
  }

  const keepInChecking = Math.min(checkingPool, amountNeeded);
  let neededAfterChecking = amountNeeded - keepInChecking;
  const moveFromVault = Math.min(vaultPool, neededAfterChecking);
  neededAfterChecking -= moveFromVault;
  const allocated = keepInChecking + moveFromVault;
  const nextCheckingPool = Number((checkingPool - keepInChecking).toFixed(2));
  const nextVaultPool = Number((vaultPool - moveFromVault).toFixed(2));
  const routeLabel = buildProtectedFundingLabel({ keepInChecking, moveFromVault, preferredAccount });
  let detail = "";
  if (keepInChecking > 0 && moveFromVault > 0) {
    detail = `Keep ${fmt(keepInChecking)} in Checking and transfer ${fmt(moveFromVault)} from Vault to Checking for ${targetLabel}.`;
  } else if (moveFromVault > 0) {
    detail = `Transfer ${fmt(moveFromVault)} from Vault to Checking for ${targetLabel}.`;
  } else {
    detail = `Keep ${fmt(keepInChecking)} in Checking for ${targetLabel}.`;
  }
  if (allocated < amountNeeded) {
    detail += ` That covers ${fmt(allocated)} of the ${fmt(amountNeeded)} needed by ${due}, leaving a ${fmt(amountNeeded - allocated)} gap.`;
  } else {
    detail += ` It is reserved for ${due}.`;
  }
  return {
    allocated,
    checkingPool: nextCheckingPool,
    vaultPool: nextVaultPool,
    move: {
      title: targetLabel,
      detail,
      amount: fmt(allocated || amountNeeded),
      priority: "required",
      semanticKind: "spending-hold",
      targetLabel,
      sourceLabel: preferredAccount,
      routeLabel,
      fundingLabel: routeLabel,
      transactional: false,
    },
  };
}

function allocateOptionalPayment({
  title,
  targetLabel,
  semanticKind,
  priority,
  requestedAmount = 0,
  checkingPool = 0,
  vaultPool = 0,
  checkingFloor = 0,
  detailSuffix = "",
}) {
  const amountNeeded = Math.max(0, Number(requestedAmount) || 0);
  const transferableChecking = Math.max(0, checkingPool - checkingFloor);
  const fromChecking = Math.min(transferableChecking, amountNeeded);
  const remainingNeed = amountNeeded - fromChecking;
  const fromVault = Math.min(vaultPool, remainingNeed);
  const allocated = fromChecking + fromVault;
  if (!(allocated > 0)) {
    return { allocated: 0, checkingPool, vaultPool, move: null };
  }
  const nextCheckingPool = Number((checkingPool - fromChecking).toFixed(2));
  const nextVaultPool = Number((vaultPool - fromVault).toFixed(2));
  const routeLabel = buildOptionalFundingLabel({ fromChecking, fromVault, targetLabel });
  let detail = "";
  if (fromChecking > 0 && fromVault > 0) {
    detail = `Send ${fmt(fromChecking)} from Checking and transfer ${fmt(fromVault)} from Vault to Checking for ${targetLabel}.`;
  } else if (fromVault > 0) {
    detail = `Transfer ${fmt(fromVault)} from Vault to Checking and send it to ${targetLabel}.`;
  } else {
    detail = `Send ${fmt(fromChecking)} from Checking to ${targetLabel}.`;
  }
  if (detailSuffix) detail += ` ${sanitizeVisibleAuditCopy(detailSuffix)}`;
  return {
    allocated,
    checkingPool: nextCheckingPool,
    vaultPool: nextVaultPool,
    move: {
      title,
      detail,
      amount: fmt(allocated),
      priority,
      semanticKind,
      targetLabel,
      sourceLabel: fromVault > 0 ? "Vault" : "Checking",
      routeLabel,
      fundingLabel: routeLabel,
      transactional: true,
    },
  };
}

function buildDeterministicAllocationPlan({
  operationalSurplus = 0,
  protectedCashObligations = [],
  computedStrategy = {},
  debtFundingIntent = null,
  repairedGateStatus = "Guarded — safety first",
  formData = {},
  financialConfig = {},
  cards = [],
  personalRules = "",
} = {}) {
  const ruleHints = parseAuditRuleHints({ personalRules, cards });
  const surplusCapital = Math.max(0, Number(operationalSurplus) || 0);
  const checkingBalance = Math.max(0, parseCurrency(formData?.checking) || 0);
  const vaultBalance = Math.max(0, (parseCurrency(formData?.savings) || 0) + (parseCurrency(formData?.ally) || 0));
  const checkingFloor = Math.max(0, Number(financialConfig?.weeklySpendAllowance || 0) + Number(financialConfig?.emergencyFloor || 0));
  const currentLiquidCash = Number((checkingBalance + vaultBalance).toFixed(2));
  const debtRouteAmount = Math.max(0, Number(computedStrategy?.debtStrategy?.amount || 0));
  const debtRouteTarget = normalizeDebtTargetLabel(computedStrategy?.debtStrategy?.target, cards);
  const obligations = (Array.isArray(protectedCashObligations) ? protectedCashObligations : [])
    .filter((item) => (Number(item?.amount) || 0) > 0)
    .map((item) => {
      const label = sanitizeAllocationLabel(item?.renewal?.name || "");
      const normalizedLabel = normalizeLooseText(label);
      if (ruleHints.checkingOnlyLabels.has(normalizedLabel)) {
        return { ...item, preferredSourceLabel: "Checking" };
      }
      if (ruleHints.allyOnlyLabels.has(normalizedLabel) || /\bally\b|\bvault\b/.test(normalizedLabel)) {
        return { ...item, preferredSourceLabel: "Vault" };
      }
      return item;
    })
    .sort((left, right) => (String(left?.due || "") < String(right?.due || "") ? -1 : 1));

  let checkingPool = checkingBalance;
  let vaultPool = vaultBalance;
  let remainingSurplusCapacity = surplusCapital;
  let allocatedProtected = 0;
  const moves = [];

  if (currentLiquidCash > 0 && obligations.length > 0) {
    for (const obligation of obligations) {
      if (checkingPool <= 0 && vaultPool <= 0) break;
      const allocation = allocateProtectedHold({
        obligation,
        checkingPool,
        vaultPool,
        checkingFloor,
      });
      checkingPool = allocation.checkingPool;
      vaultPool = allocation.vaultPool;
      if (!allocation.move || !(allocation.allocated > 0)) continue;
      allocatedProtected += allocation.allocated;
      moves.push(allocation.move);
    }
  } else if (obligations.length > 0) {
    for (const obligation of obligations.slice(0, 4)) {
      const sourceLabel = inferReserveSourceLabel(obligation);
      const targetLabel = sanitizeAllocationLabel(obligation?.renewal?.name || "Upcoming obligation");
      moves.push({
        title: targetLabel,
        detail: `No free dollars remain above your floor. ${buildReserveInstruction({ sourceLabel, targetLabel, amount: obligation.amount, due: obligation?.due })}`,
        amount: fmt(obligation.amount),
        priority: "required",
        semanticKind: "spending-hold",
        targetLabel,
        sourceLabel,
        routeLabel: buildReserveRouteLabel(sourceLabel),
        transactional: false,
      });
    }
  }

  const protectedNeed = obligations.reduce((sum, item) => sum + Math.max(0, Number(item?.amount) || 0), 0);
  const protectedGap = Math.max(0, Number((protectedNeed - allocatedProtected).toFixed(2)));

  const debtPaymentIsSafetyCleanup =
    Boolean(ruleHints.enforceSafetyPayment) &&
    Boolean(ruleHints.safetyCardTarget) &&
    debtRouteTarget.toLowerCase() === ruleHints.safetyCardTarget.toLowerCase();

  if (remainingSurplusCapacity > 0 && debtRouteTarget && debtRouteAmount > 0) {
    const payment = allocateOptionalPayment({
      title: debtPaymentIsSafetyCleanup ? `Make safety payment to ${debtRouteTarget}` : debtRouteTarget,
      targetLabel: debtRouteTarget,
      semanticKind: "debt-payment",
      priority: "required",
      requestedAmount: Math.min(remainingSurplusCapacity, debtRouteAmount),
      checkingPool,
      vaultPool,
      checkingFloor,
      detailSuffix: debtPaymentIsSafetyCleanup
        ? "This is the weekly safety payment while statement close and due dates remain unknown. Keep it partial if that is the maximum safe amount above the floor."
        : "",
    });
    checkingPool = payment.checkingPool;
    vaultPool = payment.vaultPool;
    if (payment.move && payment.allocated > 0) {
      remainingSurplusCapacity = Math.max(0, Number((remainingSurplusCapacity - payment.allocated).toFixed(2)));
      moves.push(payment.move);
    }
  }

  const investmentDestination =
    repairedGateStatus === "Open"
      ? inferPreferredInvestmentDestination({ formData, financialConfig })
      : null;

  if (remainingSurplusCapacity > 0) {
    if (investmentDestination) {
      const contribution = allocateOptionalPayment({
        title: `Fund ${investmentDestination.label}`,
        targetLabel: investmentDestination.label,
        semanticKind: "investment-contribution",
        priority: "optional",
        requestedAmount: remainingSurplusCapacity,
        checkingPool,
        vaultPool,
        checkingFloor,
      });
      checkingPool = contribution.checkingPool;
      vaultPool = contribution.vaultPool;
      if (contribution.move && contribution.allocated > 0) {
        contribution.move.targetKey = investmentDestination.targetKey;
        contribution.move.contributionKey = investmentDestination.contributionKey;
        moves.push(contribution.move);
        remainingSurplusCapacity = Math.max(0, Number((remainingSurplusCapacity - contribution.allocated).toFixed(2)));
      }
    } else {
      const reserveSweep = allocateOptionalPayment({
        title: "Keep the remainder in Vault",
        targetLabel: "Vault",
        semanticKind: "bank-savings-increase",
        priority: "optional",
        requestedAmount: remainingSurplusCapacity,
        checkingPool,
        vaultPool,
        checkingFloor,
      });
      checkingPool = reserveSweep.checkingPool;
      vaultPool = reserveSweep.vaultPool;
      if (reserveSweep.move && reserveSweep.allocated > 0) {
        reserveSweep.move.detail = reserveSweep.move.detail.replace(/send it to Vault\.$/i, "leave it there as protected liquidity until the next briefing.");
        moves.push(reserveSweep.move);
        remainingSurplusCapacity = Math.max(0, Number((remainingSurplusCapacity - reserveSweep.allocated).toFixed(2)));
      }
    }
  }

  if (protectedGap > 0 && currentLiquidCash > 0) {
    moves.push({
      title: "Protected gap still remains",
      detail: `After assigning ${fmt(allocatedProtected)} from current Checking and Savings balances, ${fmt(protectedGap)} of protected obligations still remains unfunded. Do not route additional money to optional goals until that gap closes.`,
      amount: fmt(protectedGap),
      priority: "required",
      semanticKind: "spending-hold",
      targetLabel: "Protected obligations",
      sourceLabel: null,
      routeLabel: null,
      transactional: false,
    });
  }

  const parkedCashAfterProtection = Math.max(0, Number((checkingPool + vaultPool).toFixed(2)));
  const optionalAllocatedNow = Number((surplusCapital - remainingSurplusCapacity).toFixed(2));
  if (
    obligations.length > 0 &&
    protectedGap <= 0 &&
    parkedCashAfterProtection > 0 &&
    optionalAllocatedNow <= 0 &&
    !moves.some((move) => /next wave|parked/i.test(String(move?.title || "")) || /next wave|parked/i.test(String(move?.detail || "")))
  ) {
    const parkedTargetLabel =
      checkingPool > 0 && vaultPool > 0 ? "Checking + Vault" : vaultPool > 0 ? "Vault" : "Checking";
    const parkedRouteLabel =
      checkingPool > 0 && vaultPool > 0
        ? `Already parked in Vault ${fmt(vaultPool)} + Checking ${fmt(checkingPool)}`
        : vaultPool > 0
          ? `Already in Vault ${fmt(vaultPool)}`
          : `Already in Checking ${fmt(checkingPool)}`;
    moves.push({
      title: "Hold the remaining cash for the next wave",
      detail: buildParkedCashDetail({ checkingPool, vaultPool }),
      amount: fmt(parkedCashAfterProtection),
      priority: "required",
      semanticKind: "spending-hold",
      targetLabel: parkedTargetLabel,
      sourceLabel: parkedTargetLabel,
      routeLabel: parkedRouteLabel,
      transactional: false,
    });
  }

  const stagedDebtAction = buildDebtFundingStagingAction(debtFundingIntent);
  if (stagedDebtAction) {
    moves.push({
      ...stagedDebtAction,
      priority: "required",
      semanticKind: "debt-payment",
      targetLabel: debtFundingIntent?.targetLabel || null,
      sourceLabel: null,
      routeLabel: debtFundingIntent?.targetLabel ? `External proceeds → ${debtFundingIntent.targetLabel}` : null,
      transactional: false,
    });
  }

  if (moves.length === 0) {
    const outboundOnlyCapacity = Math.max(0, checkingBalance - checkingFloor) + vaultBalance;
    if (outboundOnlyCapacity > 0) {
      moves.push({
        title: "Keep cash parked",
        detail: `Leave ${fmt(outboundOnlyCapacity)} in cash until the next briefing clarifies the highest-priority destination.`,
        amount: fmt(outboundOnlyCapacity),
        priority: "optional",
        semanticKind: "bank-savings-increase",
        targetLabel: "Vault",
        sourceLabel: "Checking",
        routeLabel: "Checking → Vault",
        transactional: false,
      });
    } else {
      moves.push({
        title: "No free cash to deploy",
        detail: "Every current dollar above your floor is already spoken for. Protect the floor and avoid optional outflows until more cash lands.",
        amount: fmt(0),
        priority: "required",
        semanticKind: "spending-hold",
        targetLabel: "Protected cash",
        sourceLabel: null,
        routeLabel: null,
        transactional: false,
      });
    }
  }

  const headlineCapital =
    obligations.length > 0
      ? Math.min(currentLiquidCash, Math.max(protectedNeed, surplusCapital))
      : Math.max(0, checkingBalance - checkingFloor) + vaultBalance;

  const nextAction =
    headlineCapital <= 0 && obligations.length > 0
      ? {
          title: "Protect near-term obligations",
          detail: `Every dollar above your floor is already spoken for. Keep the protected balances parked for ${buildObligationSummary(obligations)} before debt paydown or investing.`,
          amount: fmt(0),
        }
      : headlineCapital > 0 && obligations.length > 0
        ? {
            title: "Protect near-term obligations",
            detail:
              protectedGap > 0
                ? `Assign the current liquid cash first: ${buildObligationLabelSummary(obligations)}. Based on current Checking and Savings balances, you can reserve ${fmt(allocatedProtected)} now and a ${fmt(protectedGap)} protected gap still remains.`
                : `Assign the current liquid cash in order: ${buildObligationLabelSummary(obligations)}. Protect each item below before routing anything to debt payoff or savings.${parkedCashAfterProtection > 0 && optionalAllocatedNow <= 0 ? ` After that, keep the remaining ${fmt(parkedCashAfterProtection)} parked for the next wave of obligations and floor protection.` : ""}`,
            amount: fmt(headlineCapital),
          }
        : headlineCapital > 0
          ? {
              title: moves[0]?.title || "Allocate this week's free cash",
              detail: moves[0]?.detail || `Route the full ${fmt(headlineCapital)} of deployable cash to the highest-priority destinations in order.`,
              amount: moves[0]?.amount || fmt(headlineCapital),
            }
        : {
            title: moves[0]?.title || "Next Action",
            detail: moves[0]?.detail || "Hold steady until the next briefing.",
            amount: moves[0]?.amount || null,
          };

  return {
    nextAction,
    weeklyMoves: moves,
    allocatedTotal: Number((allocatedProtected + (surplusCapital - remainingSurplusCapacity)).toFixed(2)),
    availableCapital: headlineCapital,
    currentLiquidCash,
    protectedNeed,
    protectedGap,
    protectedAllocated: Number(allocatedProtected.toFixed(2)),
    optionalAllocated: Number((surplusCapital - remainingSurplusCapacity).toFixed(2)),
    remainingChecking: Number(checkingPool.toFixed(2)),
    remainingVault: Number(vaultPool.toFixed(2)),
    allyReconciliationRequired: ruleHints.allyReconciliationRequired,
  };
}

function moveHasExplicitRouting(move) {
  if (!move || typeof move !== "object") return false;
  const amount = Number(move.amount);
  if (!Number.isFinite(amount) || amount <= 0) return true;
  return Boolean(
    String(move.routeLabel || move.fundingLabel || "").trim() ||
    (String(move.sourceLabel || "").trim() && String(move.targetLabel || "").trim())
  );
}

function buildParkedCashDetail({ checkingPool = 0, vaultPool = 0 }) {
  const checking = Math.max(0, Number(checkingPool) || 0);
  const vault = Math.max(0, Number(vaultPool) || 0);
  const parkedTotal = checking + vault;
  if (parkedTotal <= 0) return "";
  if (checking > 0 && vault > 0) {
    return `Keep ${fmt(vault)} in Vault and ${fmt(checking)} in Checking after funding the current protected items. Leave the remaining ${fmt(parkedTotal)} parked for the next wave of obligations and floor protection before any optional debt paydown or investing.`;
  }
  if (vault > 0) {
    return `Keep ${fmt(vault)} parked in Vault after funding the current protected items. Leave it there for the next wave of obligations and floor protection before any optional debt paydown or investing.`;
  }
  return `Keep ${fmt(checking)} parked in Checking after funding the current protected items. Leave it there for the next wave of obligations and floor protection before any optional debt paydown or investing.`;
}

function planCoversProtectedObligations(moveItems = [], obligations = []) {
  if (!Array.isArray(obligations) || obligations.length === 0) return true;
  const normalizedMoveText = moveItems
    .map((move) => normalizeLooseText(`${move?.title || ""} ${move?.detail || ""} ${move?.targetLabel || ""}`))
    .join(" ");
  return obligations.every((obligation) => normalizedMoveText.includes(normalizeLooseText(sanitizeAllocationLabel(obligation?.renewal?.name || ""))));
}

function hasVisibleAuditCopyArtifacts(text) {
  const normalized = String(text || "");
  if (!normalized) return false;
  return /\bthe user\b/i.test(normalized) || /^[,.;:'"`\s]+/.test(normalized) || /,\s*\./.test(normalized);
}

function buildPriorityCashAction({
  obligations = [],
  computedStrategy = {},
  debtFundingIntent = null,
}) {
  if (Array.isArray(obligations) && obligations.length > 0) {
    return buildProtectedCashAction({ obligations, computedStrategy });
  }
  return buildDebtFundingStagingAction(debtFundingIntent) || buildProtectedCashAction({ obligations, computedStrategy });
}

function buildDashboardRowsFromAnchors(anchors = {}, existingRows = []) {
  const statusByCategory = new Map(
    (Array.isArray(existingRows) ? existingRows : [])
      .filter((row) => row?.category)
      .map((row) => [row.category, typeof row.status === "string" ? row.status : ""])
  );

  return DASHBOARD_ROW_ORDER.map((category) => {
    const key = category.toLowerCase();
    const amount = Number.isFinite(Number(anchors?.[key])) ? Number(anchors[key]) : 0;
    return {
      category,
      amount: fmt(amount),
      status: statusByCategory.get(category) || defaultDashboardStatus(category, amount),
    };
  });
}

function shouldRepairDashboardRows(rows = [], anchors = {}) {
  const meaningfulAnchors = Object.entries(anchors).filter(([, value]) => Number.isFinite(Number(value)));
  if (meaningfulAnchors.length === 0) return false;

  let mismatches = 0;
  let positiveAnchors = 0;
  let zeroLikeRows = 0;

  for (const [key, rawExpected] of meaningfulAnchors) {
    const expected = Number(rawExpected);
    if (expected > 0) positiveAnchors += 1;
    const category = CANONICAL_DASHBOARD_CATEGORIES.get(String(key).toLowerCase()) || key.charAt(0).toUpperCase() + key.slice(1);
    const row = (rows || []).find((entry) => entry?.category === category);
    const actual = parseCurrency(row?.amount);
    if (actual == null || Math.abs(actual - expected) > 1) mismatches += 1;
    if ((actual == null || Math.abs(actual) < 0.01) && expected > 0) zeroLikeRows += 1;
  }

  return mismatches >= 2 || (positiveAnchors > 0 && zeroLikeRows === positiveAnchors);
}

function normalizeInvestmentAnchors(anchors = {}) {
  const balance = Number.isFinite(Number(anchors?.balance)) ? fmt(Number(anchors.balance)) : null;
  const netWorth = Number.isFinite(Number(anchors?.netWorth)) ? fmt(Number(anchors.netWorth)) : undefined;
  const asOf = typeof anchors?.asOf === "string" && anchors.asOf.trim() ? anchors.asOf.trim() : "N/A";
  const gateStatus = typeof anchors?.gateStatus === "string" && anchors.gateStatus.trim() ? anchors.gateStatus.trim() : "Tracked";
  if (!balance) return null;
  return { balance, asOf, gateStatus, netWorth };
}

export function parseJSON(raw) {
  let j;
  const cleaned = String(raw || "")
    .replace(/```json?\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  const tryParse = (candidate) => JSON.parse(candidate);
  const repairTruncatedJson = (candidate) => {
    const text = String(candidate || "").trim();
    if (!text) return null;

    let repaired = text
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/,\s*$/g, "");

    const stack = [];
    let inString = false;
    let escaped = false;

    for (const char of repaired) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === "{" || char === "[") stack.push(char);
      if (char === "}" && stack[stack.length - 1] === "{") stack.pop();
      if (char === "]" && stack[stack.length - 1] === "[") stack.pop();
    }

    if (inString) repaired += "\"";
    while (stack.length > 0) {
      const opener = stack.pop();
      repaired += opener === "{" ? "}" : "]";
    }
    return repaired.replace(/,\s*([}\]])/g, "$1");
  };
  try {
    // Aggressive JSON extraction: strip ALL markdown wrappers and extract only the {} block
    const startIdx = cleaned.indexOf("{");
    const endIdx = cleaned.lastIndexOf("}");
    if (startIdx >= 0 && endIdx > startIdx) {
      j = tryParse(cleaned.slice(startIdx, endIdx + 1));
    } else {
      // Try array-wrapped JSON: [{...}]
      const arrStart = cleaned.indexOf("[");
      const arrEnd = cleaned.lastIndexOf("]");
      if (arrStart >= 0 && arrEnd > arrStart) {
        const arr = tryParse(cleaned.slice(arrStart, arrEnd + 1));
        j = Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
      } else {
        const candidate = cleaned.slice(startIdx >= 0 ? startIdx : 0).trim();
        j = tryParse(repairTruncatedJson(candidate) || candidate);
      }
    }
  } catch (e) {
    try {
      const candidate = cleaned.slice(Math.max(0, cleaned.indexOf("{"))).trim() || cleaned;
      j = tryParse(repairTruncatedJson(candidate) || candidate);
    } catch {
      // NOTE: never log raw response content — it may contain financial PII
      void log.warn("parseJSON", "JSON.parse failed", { error: e.message, rawLength: raw?.length });
      return null; // Stream hasn't finished accumulating enough valid JSON
    }
  }

  // Normalize ALL snake_case keys to camelCase recursively (top level)
  if (j && typeof j === "object") {
    const camelCase = s => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    for (const key of Object.keys(j)) {
      const cc = camelCase(key);
      if (cc !== key && !(cc in j)) {
        j[cc] = j[key];
      }
    }
  }

  // Fallback: try common alternative key names for headerCard
  if (j && !j.headerCard) {
    j.headerCard = j.header || j.auditHeader || j.statusHeader || j.summary_header || j.summaryHeader || null;
  }

  // Schema Validation (Lightweight)
  if (!j || !j.headerCard) {
    void log.warn("parseJSON", "Missing headerCard", { keys: j ? Object.keys(j).join(", ") : "null" });
    return null;
  }

  // Map to the internal structure expected by ResultsView/Dashboard
  const normalizedWeeklyMoves = normalizeWeeklyMoveEntries(j.weeklyMoves);
  const weeklyMoves = normalizedWeeklyMoves.weeklyMoves;
  const normalizedHeaderCard = normalizeHeaderCard(j.headerCard);
  const normalizedNextAction = normalizeNextAction(j.nextAction);
  const normalizedAlerts = normalizeAlertEntries(j.alertsCard || j.alerts);
  const alertsCard = normalizedAlerts.lines;
  const { rows: dashboardCard, nonCanonicalCategories } = normalizeDashboardCard(j.dashboardCard);
  const investments = normalizeInvestmentsSummary(j.investments);
  const spendingAnalysis = normalizeSpendingAnalysis(j.spendingAnalysis);
  const negotiationTargets = normalizeNegotiationTargets(j.negotiationTargets);
  const normalizedHealthScore = normalizeHealthScore(j.healthScore);
  const normalizedRadar = normalizeRadar(j.radar, j.longRangeRadar);
  const assumptions = normalizeStringArray(j.assumptions);
  const auditFlags = [];
  if (normalizedHealthScore.gradeCorrected && normalizedHealthScore.value) {
    auditFlags.push({
      code: "health-score-grade-corrected",
      severity: "low",
      message: `Health score grade corrected to ${normalizedHealthScore.value.grade} from ${normalizedHealthScore.originalGrade}.`,
      meta: {
        score: normalizedHealthScore.value.score,
        originalGrade: normalizedHealthScore.originalGrade,
      },
    });
  }
  const normalizedStatus = normalizeAuditStatus(
    normalizedHeaderCard.status === "UNKNOWN"
      ? j.status || normalizedHeaderCard.headline || normalizedHeaderCard.title
      : normalizedHeaderCard.status
  );
  const structuredWeeklyMoves = normalizedWeeklyMoves.moveCards.map((item) => ({
    title: item.title || item.detail,
    detail: item.detail || item.title,
    amount: item.amount ?? null,
    priority: item.priority || "optional",
  }));
  const structuredMoveItems = normalizeMoveItems(
    Array.isArray(j.moveItems) && j.moveItems.length > 0 ? j.moveItems : normalizedWeeklyMoves.moveItems,
    weeklyMoves
  );
  const structured = {
    ...j,
    headerCard: normalizedHeaderCard,
    alertsCard: normalizedAlerts.items,
    dashboardCard,
    weeklyMoves: structuredWeeklyMoves,
    moveItems: structuredMoveItems,
    radar: normalizedRadar,
    longRangeRadar: normalizedRadar.longRange,
    investments,
    nextAction: normalizedNextAction,
    spendingAnalysis,
    negotiationTargets,
    assumptions,
    riskFlags: normalizeStringArray(j.riskFlags),
  };
  return {
    raw,
    status: normalizedStatus,
    mode: "FULL", // Implicit in the new architecture unless overridden
    liquidNetWorth: parseCurrency(j.liquidNetWorth),
    netWorth:
      parseCurrency(j.netWorth) ?? parseCurrency(j.investments?.netWorth) ?? parseCurrency(j.investments?.balance),
    netWorthDelta: j.netWorthDelta ?? j.investments?.netWorthDelta ?? null,
    healthScore: normalizedHealthScore.value, // { score, grade, trend, summary }
    alertsCard,
    dashboardCard,
    weeklyMoves,
    investments,
    spendingAnalysis,
    structured,
    sections: {
      header: `**${new Date().toISOString().split("T")[0]}** · FULL · ${normalizedStatus}`,
      alerts: alertsCard.join("\n"),
      dashboard: dashboardCard
        .map(d => `**${d.category}:** ${d.amount} ${d.status ? `(${d.status})` : ""}`)
        .join("\n"),
      moves: weeklyMoves.join("\n"),
      radar: normalizedRadar.next90Days.map(r => `**${r.date || "Upcoming"}** ${r.item} ${r.amount}`).join("\n"),
      longRange: normalizedRadar.longRange.map(r => `**${r.date || "Later"}** ${r.item} ${r.amount}`).join("\n"),
      forwardRadar: assumptions.join("\n"),
      investments: `**Balance:** ${investments?.balance || "N/A"}\n**As Of:** ${investments?.asOf || "N/A"}\n**Gate:** ${investments?.gateStatus || "N/A"}${investments?.netWorth ? `\n**Net Worth:** ${investments.netWorth}` : ""}`,
      nextAction: [normalizedNextAction.title, normalizedNextAction.detail, normalizedNextAction.amount].filter(Boolean).join("\n"),
      autoUpdates: "Handled natively via JSON output",
      qualityScore: "Strict JSON Mode Active",
    },
    // Map moves to actionable checkboxes
    moveItems: structuredMoveItems,
    paceData: Array.isArray(j.paceData) ? j.paceData : [], // Extracted from JSON if present, kept for backwards compat
    negotiationTargets,
    dashboardData: {
      checkingBalance: null, // Extracted from dashboardCard dynamically on demand
      savingsVaultTotal: null,
    },
    auditFlags,
    consistency: {
      gradeCorrected: normalizedHealthScore.gradeCorrected,
      originalGrade: normalizedHealthScore.originalGrade,
      nonCanonicalDashboardCategories: nonCanonicalCategories,
    },
    degraded: null,
  };
}

export function parseAudit(raw) {
  // We ONLY parse JSON now. Fallback markdown parsing is officially deprecated.
  return parseJSON(raw);
}

function extractAuditSafetyLevel(parsed) {
  const degradedLevel = parsed?.degraded?.safetyState?.level;
  if (degradedLevel === "stable" || degradedLevel === "caution" || degradedLevel === "urgent") {
    return degradedLevel;
  }

  const normalizedStatus = String(parsed?.status || "").toUpperCase();
  if (normalizedStatus === "RED") return "urgent";
  if (normalizedStatus === "YELLOW") return "caution";
  return "stable";
}

function extractAuditRiskCategories(parsed) {
  const rawRiskFlags = Array.isArray(parsed?.degraded?.riskFlags)
    ? parsed.degraded.riskFlags
    : Array.isArray(parsed?.structured?.riskFlags)
      ? parsed.structured.riskFlags
      : [];

  return rawRiskFlags
    .map(flag => String(flag || "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

export function detectAuditDrift(previousParsed, nextParsed) {
  if (!previousParsed || !nextParsed) {
    return {
      driftDetected: false,
      reasons: [],
      scoreDelta: 0,
      safetyFlip: false,
      riskCategoriesChangedCompletely: false,
    };
  }

  const previousScore = Number(previousParsed?.healthScore?.score);
  const nextScore = Number(nextParsed?.healthScore?.score);
  const scoreDelta =
    Number.isFinite(previousScore) && Number.isFinite(nextScore) ? Math.abs(nextScore - previousScore) : 0;

  const previousSafety = extractAuditSafetyLevel(previousParsed);
  const nextSafety = extractAuditSafetyLevel(nextParsed);
  const safetyFlip = previousSafety !== nextSafety;

  const previousRiskCategories = extractAuditRiskCategories(previousParsed);
  const nextRiskCategories = extractAuditRiskCategories(nextParsed);
  const overlap = previousRiskCategories.filter(flag => nextRiskCategories.includes(flag));
  const riskCategoriesChangedCompletely =
    previousRiskCategories.length > 0 && nextRiskCategories.length > 0 && overlap.length === 0;

  const reasons = [];
  if (scoreDelta > 8) reasons.push(`health-score-drift:${scoreDelta}`);
  if (safetyFlip) reasons.push(`safety-state-flip:${previousSafety}->${nextSafety}`);
  if (riskCategoriesChangedCompletely) {
    reasons.push(`risk-categories-shift:${previousRiskCategories.join(",") || "none"}->${nextRiskCategories.join(",") || "none"}`);
  }

  return {
    driftDetected: reasons.length > 0,
    reasons,
    scoreDelta,
    safetyFlip,
    riskCategoriesChangedCompletely,
    previousSafety,
    nextSafety,
    previousRiskCategories,
    nextRiskCategories,
  };
}

function inferAuditStatusFromSignals(score, riskFlags = []) {
  const numericScore = Number(score);
  const normalizedRiskFlags = Array.isArray(riskFlags) ? riskFlags.filter(Boolean) : [];
  const severeFlags = new Set([
    "floor-breach-risk",
    "transfer-needed",
    "toxic-apr",
    "high-utilization",
    "critical-promo-expiry",
  ]);

  if (
    (Number.isFinite(numericScore) && numericScore < 70) ||
    normalizedRiskFlags.some(flag => severeFlags.has(String(flag)))
  ) {
    return "RED";
  }
  if ((Number.isFinite(numericScore) && numericScore < 80) || normalizedRiskFlags.length > 0) {
    return "YELLOW";
  }
  return "GREEN";
}

/**
 * @param {import("../types/index.js").ParsedAudit | null} parsed
 * @param {{
 *   operationalSurplus?: number | null;
 *   nativeScore?: number | null;
 *   nativeRiskFlags?: string[] | null;
 *   dashboardAnchors?: Record<string, number | null | undefined>;
 *   investmentAnchors?: { balance?: number | null; asOf?: string | null; gateStatus?: string | null; netWorth?: number | null } | null;
 *   cards?: import("../types/index.js").Card[] | null;
 *   renewals?: import("../types/index.js").Renewal[] | null;
 *   formData?: import("../types/index.js").AuditFormData | null;
 *   financialConfig?: import("../types/index.js").CatalystCashConfig | null;
 *   computedStrategy?: Record<string, unknown> | null;
 *   personalRules?: string;
 * }} [options]
 * @returns {import("../types/index.js").ParsedAudit | null}
 */
export function validateParsedAuditConsistency(parsed, options = {}) {
  if (!parsed) return null;

  const {
    operationalSurplus = null,
    nativeScore = null,
    nativeRiskFlags = null,
    dashboardAnchors = null,
    investmentAnchors = null,
    cards = null,
    renewals = null,
    formData = null,
    financialConfig = null,
    computedStrategy = null,
    personalRules = "",
  } = options;

  const auditFlags = Array.isArray(parsed.auditFlags) ? [...parsed.auditFlags] : [];
  const consistency = { ...(parsed.consistency || {}) };
  const normalizedNativeRiskFlags = Array.isArray(nativeRiskFlags)
    ? nativeRiskFlags.filter(flag => typeof flag === "string" && flag.trim())
    : [];

  if (normalizedNativeRiskFlags.length > 0) {
    consistency.nativeRiskFlags = normalizedNativeRiskFlags;
  }

  if (Array.isArray(consistency.nonCanonicalDashboardCategories) && consistency.nonCanonicalDashboardCategories.length > 0) {
    void log.warn(
      "audit", "Non-canonical dashboard categories detected",
      { categories: consistency.nonCanonicalDashboardCategories.join(", ") }
    );
  }

  if (dashboardAnchors && shouldRepairDashboardRows(parsed.dashboardCard, dashboardAnchors)) {
    parsed.dashboardCard = buildDashboardRowsFromAnchors(dashboardAnchors, parsed.dashboardCard);
    if (parsed.structured && typeof parsed.structured === "object") {
      parsed.structured.dashboardCard = parsed.dashboardCard.map((row) => ({
        category: row.category,
        amount: row.amount,
        status: row.status,
      }));
    }
    if (parsed.sections && typeof parsed.sections.dashboard === "string") {
      parsed.sections = {
        ...parsed.sections,
        dashboard: parsed.dashboardCard
          .map((row) => `**${row.category}:** ${row.amount} ${row.status ? `(${row.status})` : ""}`)
          .join("\n"),
      };
    }
    consistency.dashboardRepaired = true;
    auditFlags.push({
      code: "dashboard-repaired-to-native-anchors",
      severity: "medium",
      message: "Dashboard summary was rebuilt from native cash and debt anchors because the model output was materially inconsistent.",
    });
  }

  const normalizedInvestmentAnchors = normalizeInvestmentAnchors(investmentAnchors || {});
  const snapshotDate =
    typeof formData?.date === "string" && formData.date.trim()
      ? formData.date.trim()
      : normalizedInvestmentAnchors?.asOf || new Date().toISOString().split("T")[0];
  const repairedGateStatus = inferInvestmentGateStatus({
    existingGateStatus: parsed?.investments?.gateStatus || normalizedInvestmentAnchors?.gateStatus,
    cards: Array.isArray(cards) ? cards : [],
    formData: formData || {},
    computedStrategy: computedStrategy || {},
    nativeRiskFlags: normalizedNativeRiskFlags,
    renewals: Array.isArray(renewals) ? renewals : [],
    personalRules,
    snapshotDate,
  });
  const existingInvestmentMissing =
    !parsed.investments ||
    (!parsed.investments.balance || parsed.investments.balance === "N/A");
  const parsedInvestmentBalance = parseCurrency(parsed?.investments?.balance);
  const anchorInvestmentBalance = parseCurrency(normalizedInvestmentAnchors?.balance);
  const materiallyMismatchedInvestmentBalance =
    parsedInvestmentBalance != null &&
    anchorInvestmentBalance != null &&
    Math.abs(parsedInvestmentBalance - anchorInvestmentBalance) > 1;
  if (normalizedInvestmentAnchors && (existingInvestmentMissing || materiallyMismatchedInvestmentBalance)) {
    parsed.investments = {
      ...parsed.investments,
      ...normalizedInvestmentAnchors,
      gateStatus: repairedGateStatus,
      cryptoValue: parsed.investments?.cryptoValue ?? null,
    };
    if (parsed.structured && typeof parsed.structured === "object") {
      parsed.structured.investments = parsed.investments;
    }
    if (parsed.sections && typeof parsed.sections.investments === "string") {
      parsed.sections = {
        ...parsed.sections,
        investments: `**Balance:** ${parsed.investments.balance}\n**As Of:** ${parsed.investments.asOf}\n**Gate:** ${parsed.investments.gateStatus}`,
      };
    }
    consistency.investmentSummaryRepaired = true;
    auditFlags.push({
      code: "investments-summary-repaired",
      severity: "low",
      message: materiallyMismatchedInvestmentBalance
        ? "Investments summary was corrected to the visible tracked balances because the model overstated it."
        : "Investments summary was backfilled from tracked balances because the model omitted it.",
    });
  }

  if (parsed.investments && repairedGateStatus && parsed.investments.gateStatus !== repairedGateStatus) {
    parsed.investments = {
      ...parsed.investments,
      gateStatus: repairedGateStatus,
    };
    if (parsed.structured && typeof parsed.structured === "object") {
      parsed.structured.investments = parsed.investments;
    }
    if (parsed.sections && typeof parsed.sections.investments === "string") {
      parsed.sections = {
        ...parsed.sections,
        investments: `**Balance:** ${parsed.investments.balance}\n**As Of:** ${parsed.investments.asOf}\n**Gate:** ${parsed.investments.gateStatus}${parsed.investments.netWorth ? `\n**Net Worth:** ${parsed.investments.netWorth}` : ""}`,
      };
    }
    consistency.investmentGateRepaired = true;
    auditFlags.push({
      code: "investment-gate-repaired",
      severity: "medium",
      message: `Investment gate was tightened to "${repairedGateStatus}" because debt, risk flags, or near-term obligations still require cash protection.`,
    });
  }

  if (parsed.healthScore) {
    const expectedGrade = getGradeLetter(parsed.healthScore.score);
    if (parsed.healthScore.grade !== expectedGrade) {
      parsed.healthScore = {
        ...parsed.healthScore,
        grade: expectedGrade,
      };
      consistency.gradeCorrected = true;
      auditFlags.push({
        code: "health-score-grade-corrected",
        severity: "low",
        message: `Health score grade corrected to ${expectedGrade}.`,
        meta: { score: parsed.healthScore.score },
      });
    }
  }

  if (parsed.healthScore && nativeScore != null && Number.isFinite(Number(nativeScore))) {
    const expectedNativeScore = clamp(Math.round(Number(nativeScore)), 0, 100);
    const scoreDelta = parsed.healthScore.score - expectedNativeScore;
    consistency.nativeScoreAnchor = expectedNativeScore;
    consistency.nativeScoreDelta = scoreDelta;

    if (Math.abs(scoreDelta) > 8) {
      const originalScore = parsed.healthScore.score;
      const correctedGrade = getGradeLetter(expectedNativeScore);
      parsed.healthScore = {
        ...parsed.healthScore,
        score: expectedNativeScore,
        grade: correctedGrade,
      };
      consistency.scoreAnchoredToNative = true;
      void log.warn(
        "audit", `Health score deviated materially from native anchor (${scoreDelta > 0 ? "+" : ""}${scoreDelta}). Re-anchoring to ${expectedNativeScore}.`
      );
      auditFlags.push({
        code: "health-score-reanchored-to-native",
        severity: "medium",
        message: `Health score was re-anchored to the native score of ${expectedNativeScore}/100 to keep the audit aligned with deterministic engine signals.`,
        meta: { nativeScore: expectedNativeScore, originalScore, scoreDelta },
      });
    }
  }

  const derivedStatus = inferAuditStatusFromSignals(parsed.healthScore?.score, normalizedNativeRiskFlags);
  if (parsed.status !== derivedStatus && (consistency.scoreAnchoredToNative || normalizedNativeRiskFlags.length > 0)) {
    parsed.status = derivedStatus;
    if (parsed.structured?.headerCard && typeof parsed.structured.headerCard === "object") {
      parsed.structured.headerCard = {
        ...parsed.structured.headerCard,
        status: derivedStatus,
      };
    }
    if (parsed.sections && typeof parsed.sections.header === "string") {
      const prefix = parsed.sections.header.split("·").slice(0, -1).join("·").trim();
      parsed.sections = {
        ...parsed.sections,
        header: prefix ? `${prefix} · ${derivedStatus}` : `**${new Date().toISOString().split("T")[0]}** · FULL · ${derivedStatus}`,
      };
    }
    consistency.statusCorrected = true;
    auditFlags.push({
      code: "status-corrected-to-native-risk",
      severity: "medium",
      message: `Audit status was corrected to ${derivedStatus} to stay aligned with deterministic risk signals.`,
      meta: { nativeRiskFlags: normalizedNativeRiskFlags },
    });
  }

  const upcomingCashObligations = collectUpcomingCashObligations({
    renewals: Array.isArray(renewals) ? renewals : [],
    cards: Array.isArray(cards) ? cards : [],
    snapshotDate,
    horizonDays: 21,
  });
  const ruleBasedCashObligations = collectRuleBasedCashObligations({
    personalRules,
    snapshotDate,
    horizonDays: 21,
  });
  const auditRuleHints = parseAuditRuleHints({
    personalRules,
    cards: Array.isArray(cards) ? cards : [],
  });
  const noteBasedDebtFundingIntent = extractDebtFundingIntentFromNotes({
    notes: formData?.notes,
    cards,
  });
  const protectedCashObligations = [...upcomingCashObligations, ...ruleBasedCashObligations];
  const shortTermCashNeed = protectedCashObligations.reduce((sum, item) => sum + Math.max(0, item.amount || 0), 0);
  const shouldBlockGenericDebtPaydown =
    shortTermCashNeed > Math.max(0, Number(operationalSurplus || 0)) ||
    protectedCashObligations.length > 0 ||
    normalizedNativeRiskFlags.includes("transfer-needed") ||
    normalizedNativeRiskFlags.includes("floor-breach-risk");
  const explicitDebtTarget = String(computedStrategy?.debtStrategy?.target || "").trim();
  const deterministicAllocationPlan = buildDeterministicAllocationPlan({
    operationalSurplus,
    protectedCashObligations,
    computedStrategy: computedStrategy || {},
    debtFundingIntent: noteBasedDebtFundingIntent,
    repairedGateStatus,
    formData: formData || {},
    financialConfig: financialConfig || {},
    cards: Array.isArray(cards) ? cards : [],
    personalRules,
  });
  const fallbackPriorityAction = deterministicAllocationPlan.nextAction || buildPriorityCashAction({
    obligations: protectedCashObligations,
    computedStrategy: computedStrategy || {},
    debtFundingIntent: noteBasedDebtFundingIntent,
  });
  const fallbackDebtMove =
    !shouldBlockGenericDebtPaydown && explicitDebtTarget && (computedStrategy?.debtStrategy?.amount || 0) > 0
      ? {
          title: "Pay priority debt",
          detail: `Route $${Number(computedStrategy.debtStrategy.amount).toFixed(2)} to ${explicitDebtTarget} this week.`,
          amount: fmt(Number(computedStrategy.debtStrategy.amount)),
          priority: "required",
        }
      : null;

  const shouldPreferDeterministicAllocationPlan =
    deterministicAllocationPlan.weeklyMoves.length > 0 &&
    (
      protectedCashObligations.length > 0 ||
      Boolean(auditRuleHints.enforceSafetyPayment && auditRuleHints.safetyCardTarget) ||
      noteBasedDebtFundingIntent ||
      shouldBlockGenericDebtPaydown
    );

  const currentStructuredMoveItems = normalizeMoveItems(parsed.structured?.moveItems || parsed.moveItems || [], parsed.weeklyMoves);
  const currentOperationalAllocationTotal = extractOperationalAllocationTotal(currentStructuredMoveItems);
  const currentAllocationShortfall =
    Number.isFinite(Number(operationalSurplus))
      ? Math.max(0, Number((Math.max(0, Number(operationalSurplus || 0)) - currentOperationalAllocationTotal).toFixed(2)))
      : 0;
  const missingProtectedCoverage = !planCoversProtectedObligations(currentStructuredMoveItems, protectedCashObligations);
  const missingRoutingDetail = currentStructuredMoveItems.some((move) => !moveHasExplicitRouting(move));
  const hasCopyArtifacts =
    hasVisibleAuditCopyArtifacts(parsed?.structured?.nextAction?.title) ||
    hasVisibleAuditCopyArtifacts(parsed?.structured?.nextAction?.detail) ||
    currentStructuredMoveItems.some((move) => hasVisibleAuditCopyArtifacts(`${move?.title || ""} ${move?.detail || ""}`));
  const shouldReanchorToDeterministicPlan =
    shouldPreferDeterministicAllocationPlan &&
    (
      currentStructuredMoveItems.length === 0 ||
      currentAllocationShortfall > 50 ||
      missingProtectedCoverage ||
      missingRoutingDetail ||
      hasCopyArtifacts
    );

  if (
    shouldReanchorToDeterministicPlan ||
    shouldPreferDeterministicAllocationPlan ||
    (!parsed.structured?.nextAction || typeof parsed.structured.nextAction !== "object") ||
    !String(parsed.structured.nextAction.detail || parsed.structured.nextAction.title || "").trim()
  ) {
    parsed.structured = {
      ...(parsed.structured || {}),
      nextAction: fallbackPriorityAction,
    };
    consistency.nextActionBackfilled = true;
    consistency.deterministicPlanReanchored = shouldReanchorToDeterministicPlan || consistency.deterministicPlanReanchored;
    auditFlags.push({
      code: (shouldReanchorToDeterministicPlan || shouldPreferDeterministicAllocationPlan) ? "next-action-reanchored-to-allocation-plan" : "next-action-backfilled",
      severity: "medium",
      message: (shouldReanchorToDeterministicPlan || shouldPreferDeterministicAllocationPlan)
        ? "Immediate next action was re-anchored to the deterministic allocation plan."
        : "Immediate next action was missing and was rebuilt from deterministic strategy signals.",
    });
  }

  if (shouldReanchorToDeterministicPlan || shouldPreferDeterministicAllocationPlan || !Array.isArray(parsed.structured?.weeklyMoves) || parsed.structured.weeklyMoves.length === 0) {
    parsed.structured = {
      ...(parsed.structured || {}),
      weeklyMoves:
        (shouldReanchorToDeterministicPlan || shouldPreferDeterministicAllocationPlan)
          ? deterministicAllocationPlan.weeklyMoves
          : [fallbackPriorityAction, ...(fallbackDebtMove ? [fallbackDebtMove] : [])],
      moveItems:
        (shouldReanchorToDeterministicPlan || shouldPreferDeterministicAllocationPlan)
          ? deterministicAllocationPlan.weeklyMoves.map((item) => ({
              text: item.detail || item.title,
              title: item.title || null,
              detail: item.detail || null,
              tag: item.priority ? String(item.priority).toUpperCase() : null,
              amount: parseCurrency(item.amount),
              semanticKind: item.semanticKind || null,
              targetLabel: item.targetLabel || null,
              sourceLabel: item.sourceLabel || null,
              routeLabel: item.routeLabel || null,
              fundingLabel: item.fundingLabel || null,
              targetKey: item.targetKey || null,
              contributionKey: item.contributionKey || null,
              transactional: typeof item.transactional === "boolean" ? item.transactional : undefined,
            }))
          : parsed.structured?.moveItems,
    };
    consistency.weeklyMovesBackfilled = true;
    consistency.deterministicPlanReanchored = shouldReanchorToDeterministicPlan || consistency.deterministicPlanReanchored;
    auditFlags.push({
      code: (shouldReanchorToDeterministicPlan || shouldPreferDeterministicAllocationPlan) ? "weekly-moves-reanchored-to-allocation-plan" : "weekly-moves-backfilled",
      severity: "medium",
      message: (shouldReanchorToDeterministicPlan || shouldPreferDeterministicAllocationPlan)
        ? "Weekly move plan was re-anchored to the deterministic allocation plan."
        : "Weekly move plan was missing and was rebuilt from deterministic strategy signals.",
    });
  }

  if (parsed.structured?.nextAction && typeof parsed.structured.nextAction === "object") {
    const originalDetail = parsed.structured.nextAction.detail || "";
    const originalTitle = parsed.structured.nextAction.title || "";
    if ((isGenericDebtCopy(originalDetail) || isGenericDebtCopy(originalTitle)) && explicitDebtTarget) {
      parsed.structured.nextAction = {
        ...parsed.structured.nextAction,
        title: withExplicitDebtTarget(originalTitle, explicitDebtTarget),
        detail: withExplicitDebtTarget(originalDetail, explicitDebtTarget),
      };
      consistency.genericDebtLabelRepaired = true;
      auditFlags.push({
        code: "generic-debt-label-repaired",
        severity: "medium",
        message: `Generic debt label was replaced with the explicit target "${explicitDebtTarget}".`,
      });
    }
  }

  if (shouldBlockGenericDebtPaydown && parsed.structured?.nextAction && typeof parsed.structured.nextAction === "object") {
    const nextActionText = `${parsed.structured.nextAction.title || ""} ${parsed.structured.nextAction.detail || ""}`.trim();
    if (isGenericDebtCopy(nextActionText) || /\broute\b.*\bto\b/i.test(nextActionText)) {
      const priorityAction = buildPriorityCashAction({
        obligations: protectedCashObligations,
        computedStrategy: computedStrategy || {},
        debtFundingIntent: noteBasedDebtFundingIntent,
      });
      parsed.structured.nextAction = priorityAction;
      consistency.nextActionRepairedForCashPressure = true;
      auditFlags.push({
        code: "next-action-repaired-for-cash-pressure",
        severity: "high",
        message: "Generic debt paydown was replaced because near-term cash obligations still need protection.",
      });
    }
  }

  if (Array.isArray(parsed.structured?.weeklyMoves) && parsed.structured.weeklyMoves.length > 0) {
    const firstMove = parsed.structured.weeklyMoves[0];
    if (firstMove && typeof firstMove === "object") {
      const firstMoveText = `${firstMove.title || ""} ${firstMove.detail || ""}`.trim();
      if ((isGenericDebtCopy(firstMoveText) || /\broute\b.*\bto\b/i.test(firstMoveText)) && shouldBlockGenericDebtPaydown) {
        const priorityAction = buildPriorityCashAction({
          obligations: protectedCashObligations,
          computedStrategy: computedStrategy || {},
          debtFundingIntent: noteBasedDebtFundingIntent,
        });
        parsed.structured.weeklyMoves[0] = {
          ...firstMove,
          title: priorityAction.title,
          detail: priorityAction.detail,
          amount: priorityAction.amount,
          priority: "required",
          semanticKind: "bank-checking-decrease",
          targetLabel: "Checking",
          sourceLabel: null,
          targetKey: null,
          contributionKey: null,
          transactional: false,
        };
        consistency.weeklyMoveRepairedForCashPressure = true;
      } else if ((isGenericDebtCopy(firstMoveText) || isGenericDebtCopy(firstMove.title || "")) && explicitDebtTarget) {
        parsed.structured.weeklyMoves[0] = {
          ...firstMove,
          title: withExplicitDebtTarget(firstMove.title || "", explicitDebtTarget),
          detail: withExplicitDebtTarget(firstMove.detail || "", explicitDebtTarget),
        };
        consistency.genericWeeklyMoveLabelRepaired = true;
      }
    }

    if (noteBasedDebtFundingIntent && parsed.structured?.nextAction && typeof parsed.structured.nextAction === "object") {
      const nextActionText = `${parsed.structured.nextAction.title || ""} ${parsed.structured.nextAction.detail || ""}`.trim().toLowerCase();
      if (
        /\breview spending\b/.test(nextActionText) ||
        /\banalyze recent spending\b/.test(nextActionText) ||
        /\bidentify areas for reduction\b/.test(nextActionText)
      ) {
        parsed.structured.nextAction = buildPriorityCashAction({
          obligations: protectedCashObligations,
          computedStrategy: computedStrategy || {},
          debtFundingIntent: noteBasedDebtFundingIntent,
        });
        consistency.nextActionRepairedFromNotes = true;
        auditFlags.push({
          code: "next-action-repaired-from-notes",
          severity: "medium",
          message: `Generic next action was replaced using note-based payoff context for ${noteBasedDebtFundingIntent.targetLabel}.`,
        });
      }
    }

    const stagedDebtAction = buildDebtFundingStagingAction(noteBasedDebtFundingIntent);
    if (
      stagedDebtAction &&
      !shouldPreferDeterministicAllocationPlan &&
      protectedCashObligations.length > 0 &&
      parsed.structured.weeklyMoves.length < 4
    ) {
      const alreadyHasStagedMove = parsed.structured.weeklyMoves.some((move) => {
        const text = `${move?.title || ""} ${move?.detail || ""}`.trim().toLowerCase();
        const target = String(noteBasedDebtFundingIntent?.targetLabel || "").toLowerCase();
        return Boolean(target) && text.includes(target) && /\bstage\b|\bpayoff\b|\bproceeds\b/.test(text);
      });
      if (!alreadyHasStagedMove) {
        parsed.structured.weeklyMoves = [...parsed.structured.weeklyMoves, stagedDebtAction];
        consistency.noteBasedDebtStagingAppended = true;
        auditFlags.push({
          code: "note-based-debt-staging-appended",
          severity: "low",
          message: `Staged debt payoff context for ${noteBasedDebtFundingIntent.targetLabel} was added as a secondary move.`,
        });
      }
    }

    if (repairedGateStatus !== "Open") {
      parsed.structured.weeklyMoves = parsed.structured.weeklyMoves.map((move) => {
        if (!move || typeof move !== "object") return move;
        const text = `${move.title || ""} ${move.detail || ""}`.trim().toLowerCase();
        if (!/\broth\b|\bbrokerage\b|\b401k\b|\b401\(k\)\b|\bhsa\b/.test(text)) return move;
        return {
          ...move,
          title: "Keep investing on hold",
          detail: "Keep Roth and other investment contributions paused until debt and near-term funding gates are cleared.",
          amount: null,
          priority: move.priority || "optional",
          semanticKind: "spending-hold",
          targetLabel: null,
          sourceLabel: null,
          targetKey: null,
          contributionKey: null,
          transactional: false,
        };
      });
      consistency.investmentMoveGuarded = true;
    }

    const normalizedWeeklyMoves = normalizeWeeklyMoveEntries(parsed.structured.weeklyMoves);
    parsed.weeklyMoves = normalizedWeeklyMoves.weeklyMoves;
    parsed.moveItems = normalizeMoveItems(normalizedWeeklyMoves.moveItems, parsed.weeklyMoves);
    if (parsed.sections && typeof parsed.sections.moves === "string") {
      parsed.sections = {
        ...parsed.sections,
        moves: parsed.weeklyMoves.join("\n"),
      };
    }
  }

  if (Number.isFinite(Number(operationalSurplus))) {
    const expectedOperationalSurplus = Math.max(0, Number(operationalSurplus));
    const weeklyMoveDollarTotal = extractDollarAmountTotal(parsed.weeklyMoves);
    const transactionalAllocationTotal = extractOperationalAllocationTotal(parsed.moveItems);
    const operationalAllocationTotal =
      transactionalAllocationTotal > 0
        ? transactionalAllocationTotal
        : weeklyMoveDollarTotal;
    consistency.weeklyMoveDollarTotal = weeklyMoveDollarTotal;
    consistency.operationalAllocationTotal = operationalAllocationTotal;
    consistency.expectedOperationalSurplus = expectedOperationalSurplus;
    consistency.currentLiquidCash = deterministicAllocationPlan.currentLiquidCash ?? null;
    consistency.protectedAllocatedNow = deterministicAllocationPlan.protectedAllocated ?? null;
    consistency.optionalAllocatedNow = deterministicAllocationPlan.optionalAllocated ?? null;
    consistency.remainingCheckingPool = deterministicAllocationPlan.remainingChecking ?? null;
    consistency.remainingVaultPool = deterministicAllocationPlan.remainingVault ?? null;
    consistency.protectedGapNow = deterministicAllocationPlan.protectedGap ?? null;

    if (expectedOperationalSurplus - operationalAllocationTotal > 50) {
      const shortfall = Number((expectedOperationalSurplus - operationalAllocationTotal).toFixed(2));
      void log.warn(
        "audit", `Weekly moves under-allocate operational surplus by $${shortfall.toFixed(2)}.`
      );
      auditFlags.push({
        code: "weekly-moves-underallocated",
        severity: "low",
        message: `Weekly moves only allocate $${operationalAllocationTotal.toFixed(2)} of the $${expectedOperationalSurplus.toFixed(2)} deployable surplus.`,
        meta: { shortfall, weeklyMoveDollarTotal, operationalAllocationTotal, expectedOperationalSurplus },
      });
    }
  }

  if (parsed.structured?.nextAction && typeof parsed.structured.nextAction === "object") {
    const normalizedNextAction = normalizeNextAction(parsed.structured.nextAction);
    parsed.structured.nextAction = normalizedNextAction;
    const normalizedNextActionText = [normalizedNextAction.title, normalizedNextAction.detail, normalizedNextAction.amount].filter(Boolean).join("\n");
    if (!parsed.sections || typeof parsed.sections !== "object") {
      parsed.sections = { nextAction: normalizedNextActionText };
    } else if (typeof parsed.sections.nextAction !== "string" || !parsed.sections.nextAction.trim()) {
      parsed.sections = {
        ...parsed.sections,
        nextAction: normalizedNextActionText,
      };
    } else {
      parsed.sections = {
        ...parsed.sections,
        nextAction: normalizedNextActionText,
      };
    }
  }

  return {
    ...parsed,
    auditFlags,
    consistency,
  };
}

/**
 * @param {{
 *   raw?: string;
 *   reason?: string;
 *   retryAttempted?: boolean;
 *   computedStrategy?: Record<string, unknown>;
 *   financialConfig?: import("../types/index.js").CatalystCashConfig | null;
 *   formData?: import("../types/index.js").AuditFormData;
 *   renewals?: import("../types/index.js").Renewal[];
 *   cards?: import("../types/index.js").Card[];
 *   personalRules?: string;
 * }} [options]
 * @returns {import("../types/index.js").ParsedAudit}
 */
export function buildDegradedParsedAudit({
  raw = "",
  reason = "Full AI narrative unavailable.",
  retryAttempted = false,
  computedStrategy = {},
  financialConfig = {},
  formData = {},
  renewals = [],
  cards = [],
  personalRules = "",
} = {}) {
  const nativeScore = computedStrategy?.auditSignals?.nativeScore?.score ?? 0;
  const nativeGrade = computedStrategy?.auditSignals?.nativeScore?.grade ?? getGradeLetter(nativeScore);
  const riskFlags = Array.isArray(computedStrategy?.auditSignals?.riskFlags)
    ? computedStrategy.auditSignals.riskFlags.filter(Boolean)
    : [];
  const checking = Number(formData?.checking || 0) || 0;
  const savings = Number(formData?.savings || formData?.ally || 0) || 0;
  const pendingCharges = Array.isArray(formData?.pendingCharges)
    ? formData.pendingCharges.reduce((sum, charge) => sum + (parseCurrency(charge?.amount) || 0), 0)
    : 0;
  const floor = Number(financialConfig?.weeklySpendAllowance || 0) + Number(financialConfig?.emergencyFloor || 0);
  const operationalSurplus = Math.max(0, Number(computedStrategy?.operationalSurplus || 0));
  const ruleBasedCashObligations = collectRuleBasedCashObligations({
    personalRules,
    snapshotDate: formData?.date,
    horizonDays: 21,
  });
  const noteBasedDebtFundingIntent = extractDebtFundingIntentFromNotes({
    notes: formData?.notes,
    cards,
  });
  const upcomingCashObligations = collectUpcomingCashObligations({
    renewals,
    cards,
    snapshotDate: formData?.date,
    horizonDays: 21,
  });
  const protectedCashObligations = [...upcomingCashObligations, ...ruleBasedCashObligations];
  const repairedGateStatus = inferInvestmentGateStatus({
    existingGateStatus: null,
    cards: Array.isArray(cards) ? cards : [],
    formData: formData || {},
    computedStrategy: computedStrategy || {},
    nativeRiskFlags: riskFlags,
    renewals: Array.isArray(renewals) ? renewals : [],
    personalRules,
    snapshotDate: formData?.date,
  });

  const provisionalStatus =
    nativeScore < 70 || riskFlags.includes("floor-breach-risk") || riskFlags.includes("transfer-needed")
      ? "RED"
      : nativeScore < 80 || riskFlags.length > 0
        ? "YELLOW"
        : "GREEN";

  const safetySnapshot = buildDashboardSafetyModel({
    spendableCash: checking,
    pendingCharges,
    savingsCash: savings,
    floor,
    weeklySpendAllowance: Number(financialConfig?.weeklySpendAllowance || 0),
    renewals,
    cards,
    healthScore: nativeScore,
    auditStatus: provisionalStatus,
    todayStr: formData?.date,
  });

  const status =
    safetySnapshot.level === "urgent"
      ? "RED"
      : safetySnapshot.level === "caution"
        ? "YELLOW"
        : "GREEN";

  const deterministicPlan = buildDeterministicAllocationPlan({
    operationalSurplus,
    protectedCashObligations,
    computedStrategy,
    debtFundingIntent: noteBasedDebtFundingIntent,
    repairedGateStatus,
    formData,
    financialConfig,
    cards: Array.isArray(cards) ? cards : [],
    personalRules,
  });

  const weeklyMoves = deterministicPlan.weeklyMoves.length > 0
    ? deterministicPlan.weeklyMoves
    : riskFlags.length > 0
      ? [{
          title: "Protect against the top risk",
          detail: `Prioritize ${formatRiskFlag(riskFlags[0]).toLowerCase()} before optional spending this week.`,
          priority: "required",
          semanticKind: "spending-hold",
          transactional: false,
        }]
      : [{
          title: "Preserve cash buffer",
          detail: "Hold spending to preserve your cash buffer this week.",
          priority: "optional",
          semanticKind: "spending-hold",
          transactional: false,
        }];

  const normalizedFallbackMoves = normalizeWeeklyMoveEntries(weeklyMoves);
  const fallbackMoveTexts = normalizedFallbackMoves.weeklyMoves;

  const alertsCard = [
    "Full AI narrative unavailable — showing deterministic engine output only.",
    ...(protectedCashObligations.length > 0
      ? [`Protected cash obligations: ${buildObligationSummary(protectedCashObligations)}.`]
      : []),
    ...riskFlags.slice(0, 3).map(flag => `Risk flag: ${formatRiskFlag(flag)}`),
  ];
  const structuredAlerts = alertsCard.map((detail, index) => ({
    level: index === 0 ? "warn" : "critical",
    title: index === 0 ? "Deterministic fallback active" : `Risk flag ${index}`,
    detail,
  }));

  const dashboardCard = [
    { category: "Checking", amount: fmt(checking), status: safetySnapshot.level === "urgent" ? "At risk" : "Tracked" },
    { category: "Vault", amount: fmt(savings), status: savings > 0 ? "Tracked" : "Empty" },
    { category: "Pending", amount: fmt(pendingCharges), status: pendingCharges > 0 ? "Watch" : "Clear" },
    { category: "Debts", amount: fmt(computedStrategy?.auditSignals?.debt?.total || 0), status: riskFlags.includes("toxic-apr") ? "Urgent" : "Tracked" },
    { category: "Available", amount: fmt(operationalSurplus), status: operationalSurplus > 0 ? "Deploy" : "Protected" },
  ];

  const nextAction = deterministicPlan.nextAction?.detail || fallbackMoveTexts[0] || safetySnapshot.summary;
  const dateLabel = formData?.date || new Date().toISOString().split("T")[0];
  const riskSummary =
    noteBasedDebtFundingIntent
      ? `${noteBasedDebtFundingIntent.detail}${riskFlags.length > 0 ? ` Primary risk: ${riskFlags.slice(0, 3).map(formatRiskFlag).join(", ")}.` : ""}`
      : riskFlags.length > 0
        ? riskFlags.slice(0, 3).map(formatRiskFlag).join(", ")
      : noteBasedDebtFundingIntent
        ? noteBasedDebtFundingIntent.detail
      : protectedCashObligations.length > 0
        ? "Protected cash obligations still require funding"
        : safetySnapshot.level === "urgent"
          ? "Urgent cash protection required"
          : safetySnapshot.level === "caution"
            ? "Near-term cash pressure requires caution"
            : "No acute risk flags";

  return {
    raw,
    status,
    mode: "DEGRADED",
    liquidNetWorth: checking + savings,
    netWorth: checking + savings - Number(computedStrategy?.auditSignals?.debt?.total || 0),
    netWorthDelta: null,
    healthScore: {
      score: nativeScore,
      grade: nativeGrade,
      trend: "flat",
      summary: safetySnapshot.summary,
      narrative: safetySnapshot.headline,
    },
    alertsCard,
    dashboardCard,
    weeklyMoves: fallbackMoveTexts,
    spendingAnalysis: null,
    structured: {
      headerCard: {
        title: "Deterministic fallback active",
        subtitle: safetySnapshot.headline,
        status,
        confidence: "low",
        headline: "Deterministic fallback active",
        details: [safetySnapshot.headline, riskSummary],
      },
      healthScore: {
        score: nativeScore,
        grade: nativeGrade,
        trend: "flat",
        summary: safetySnapshot.summary,
        narrative: safetySnapshot.headline,
      },
      dashboardCard,
      weeklyMoves,
      moveItems: normalizedFallbackMoves.moveItems,
      alertsCard: structuredAlerts,
      radar: {
        next90Days: [],
        longRange: [],
      },
      longRangeRadar: [],
      milestones: [],
      negotiationTargets: [],
      nextAction: {
        title: deterministicPlan.nextAction?.title || "Next Action",
        detail: deterministicPlan.nextAction?.detail || nextAction,
        amount: deterministicPlan.nextAction?.amount ?? normalizedFallbackMoves.moveCards[0]?.amount ?? null,
      },
      assumptions: [reason],
      riskFlags,
    },
    sections: {
      header: `**${dateLabel}** · DEGRADED · ${status}`,
      alerts: alertsCard.map(item => `Alert: ${item}`).join("\n"),
      dashboard: dashboardCard.map(row => `**${row.category}:** ${row.amount} (${row.status})`).join("\n"),
      moves: fallbackMoveTexts.join("\n"),
      radar: "",
      longRange: "",
      forwardRadar: riskSummary,
      investments: "Native fallback active",
      nextAction,
      autoUpdates: "Deterministic fallback active",
      qualityScore: "Full AI narrative unavailable",
    },
    moveItems: normalizeMoveItems(normalizedFallbackMoves.moveItems, fallbackMoveTexts),
    paceData: [],
    negotiationTargets: [],
    dashboardData: {
      checkingBalance: checking,
      savingsVaultTotal: savings,
    },
    auditFlags: [
      {
        code: "degraded-audit-state",
        severity: "medium",
        message: reason,
        meta: { retryAttempted, riskFlags },
      },
    ],
    consistency: {
      weeklyMoveDollarTotal: extractDollarAmountTotal(fallbackMoveTexts),
      expectedOperationalSurplus: operationalSurplus,
      nonCanonicalDashboardCategories: [],
    },
    degraded: {
      isDegraded: true,
      narrativeAvailable: false,
      reason,
      retryAttempted,
      riskFlags,
      safetyState: {
        level: safetySnapshot.level,
        headline: safetySnapshot.headline,
        summary: safetySnapshot.summary,
      },
    },
  };
}

export function extractDashboardMetrics(parsed) {
  const structured = parsed?.structured || {};
  const legacy = structured.dashboard || parsed?.dashboardData || {};
  const legacyChecking = parseCurrency(legacy.checkingBalance);
  const legacyVault = parseCurrency(legacy.savingsVaultTotal || legacy.allyVaultTotal);
  const legacyPending = parseCurrency(legacy.next7DaysNeed);
  const legacyAvailable = parseCurrency(legacy.checkingProjEnd);

  const cardRows = Array.isArray(parsed?.dashboardCard)
    ? parsed.dashboardCard
    : Array.isArray(structured.dashboardCard)
      ? structured.dashboardCard
      : [];
  if (!cardRows.length) {
    return {
      checking: legacyChecking,
      vault: legacyVault,
      pending: legacyPending,
      debts: null,
      available: legacyAvailable,
    };
  }

  const rowValue = {};
  for (const row of cardRows) {
    const key = String(row?.category || "")
      .trim()
      .toLowerCase();
    if (!key) continue;
    rowValue[key] = parseCurrency(row?.amount);
  }

  return {
    checking: rowValue.checking ?? legacyChecking,
    vault: rowValue.vault ?? rowValue.savings ?? legacyVault,
    investments: rowValue.investments ?? null,
    otherAssets: rowValue["other assets"] ?? null,
    pending: rowValue.pending ?? legacyPending,
    debts: rowValue.debts ?? null,
    available: rowValue.available ?? legacyAvailable,
  };
}

export async function shareAudit(audit) {
  const p = audit.parsed;
  const t = `Catalyst Cash — ${audit.date} — ${p.status}\nNet Worth: ${p.netWorth != null ? fmt(p.netWorth) : "N/A"}\nMode: ${p.mode}\n${p.sections?.nextAction || ""}`;
  if (navigator.share)
    try {
      await navigator.share({ title: `Catalyst Cash — ${audit.date}`, text: t });
    } catch {
      // User cancellation is expected; clipboard fallback handles share unavailability.
    }
  else await navigator.clipboard?.writeText(t);
}

// ═══════════════════════════════════════════════════════════════
// HASHING UTILITY — Fast string fingerprinting for diff detection
// ═══════════════════════════════════════════════════════════════
export const cyrb53 = (str, seed = 0) => {
  let h1 = 0xdeadbeef ^ seed,
    h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};
