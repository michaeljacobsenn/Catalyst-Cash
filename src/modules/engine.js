/**
 * Catalyst Cash Native Strategy Engine
 * This engine handles strict mathematical constraints (floors, pace, debt arbitrage) 
 * natively to ensure reliable calculations without relying on LLM hallucinations.
 */

import { cmpString, fromCents, toBps, toCents } from "./moneyMath.js";

// Helper: Add days to a date string (YYYY-MM-DD)
export function addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split('T')[0];
}

// Helper: Calculate days between two dates
export function daysBetween(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    // Use Math.round instead of floor to safely handle Daylight Savings Time (DST) 
    // fractional day differences (e.g. 23 hours rounding to 1 day)
    return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

// Helper: Get next occurrence of a specific day of the month
export function getNextDateForDayOfMonth(anchorDate, dayOfMonth) {
    const d = new Date(anchorDate);
    const currentDay = d.getUTCDate();
    const currentMonth = d.getUTCMonth();
    const currentYear = d.getUTCFullYear();

    // If the due day is today or later this month, it's this month. Otherwise, next month.
    let targetMonth = currentDay <= dayOfMonth ? currentMonth : currentMonth + 1;
    let targetYear = currentYear;

    if (targetMonth > 11) {
        targetMonth = 0;
        targetYear++;
    }

    // Handle short months (e.g. Feb 30th -> Feb 28th)
    const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    const safeDay = Math.min(dayOfMonth, daysInTargetMonth);

    const targetDate = new Date(Date.UTC(targetYear, targetMonth, safeDay));
    return targetDate.toISOString().split('T')[0];
}

// Helper: Find next payday based on frequency
export function getNextPayday(anchorDate, paydayDayOfWeek) {
    const daysOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const targetDayIdx = daysOfWeek.indexOf(paydayDayOfWeek.toLowerCase().trim());

    if (targetDayIdx === -1) return addDays(anchorDate, 7); // Fallback

    let d = new Date(anchorDate);
    let currentDayIdx = d.getUTCDay();

    let daysUntilTarget = targetDayIdx - currentDayIdx;
    if (daysUntilTarget <= 0) daysUntilTarget += 7;

    return addDays(anchorDate, daysUntilTarget);
}

function normalizeName(value, fallback = "Debt") {
    const text = String(value || "").trim();
    return text || fallback;
}

function parseDueDay(value) {
    const day = Number.parseInt(value, 10);
    if (!Number.isFinite(day) || day < 1) return null;
    return Math.min(day, 31);
}

function isCardChargedRenewal(renewal, cards) {
    const chargedToId = String(renewal?.chargedToId || "").trim();
    if (chargedToId && cards.some(c => String(c?.id || "") === chargedToId)) return true;

    const chargedTo = String(renewal?.chargedTo || "").trim().toLowerCase();
    if (!chargedTo) return false;
    return cards.some(c => {
        const names = [c?.name, c?.nickname, c?.institution]
            .map(v => String(v || "").trim().toLowerCase())
            .filter(Boolean);
        return names.some(n => chargedTo === n || chargedTo.includes(n));
    });
}

function compareAvalanchePriority(a, b) {
    if (a.aprBps !== b.aprBps) return b.aprBps - a.aprBps;
    if (a.balanceCents !== b.balanceCents) return a.balanceCents - b.balanceCents;
    if (a.minimumCents !== b.minimumCents) return b.minimumCents - a.minimumCents;
    return cmpString(a.name, b.name);
}

function compareCfiPriority(a, b) {
    // Compare balance/minimum without floating-point division:
    // a.balance/a.min < b.balance/b.min  <=>  a.balance*b.min < b.balance*a.min
    const left = a.balanceCents * b.minimumCents;
    const right = b.balanceCents * a.minimumCents;
    if (left !== right) return left - right;
    if (a.aprBps !== b.aprBps) return b.aprBps - a.aprBps;
    if (a.balanceCents !== b.balanceCents) return a.balanceCents - b.balanceCents;
    return cmpString(a.name, b.name);
}

function comparePromoPriority(a, b) {
    // Urgency score = balance * postAPR / daysToExpiration (compare ratios exactly).
    const left = (a.balanceCents * a.postAprBps) * b.daysToExp;
    const right = (b.balanceCents * b.postAprBps) * a.daysToExp;
    if (left !== right) return right - left;
    if (a.daysToExp !== b.daysToExp) return a.daysToExp - b.daysToExp;
    return compareAvalanchePriority(a, b);
}

function getCfiThreshold(payFrequency, daysToNextPaycheck) {
    const freq = String(payFrequency || "").toLowerCase();
    if (freq.includes("weekly") && freq.includes("bi")) return 35;
    if (freq.includes("weekly")) return 50;
    if (freq.includes("semi")) return 30;
    if (freq.includes("monthly")) return 25;
    if (daysToNextPaycheck <= 8) return 50;
    if (daysToNextPaycheck <= 16) return 35;
    return 25;
}

function normalizeSnapshotDebt(card, snapshotDebt, defaultAprBps) {
    const debt = snapshotDebt || {};
    const cardAprBps = toBps(card?.apr ?? 0);
    const debtAprBps = toBps(debt?.apr ?? card?.apr ?? 0);
    const aprBps = debtAprBps > 0 ? debtAprBps : (cardAprBps > 0 ? cardAprBps : defaultAprBps);

    return {
        ...card,
        balance: fromCents(toCents(debt?.balance ?? card?.balance ?? 0)),
        minPayment: fromCents(toCents(debt?.minPayment ?? debt?.minimum ?? card?.minPayment ?? 0)),
        apr: aprBps / 100
    };
}

function findSnapshotDebtForCard(card, snapshotDebts) {
    const cardId = String(card?.id || "").trim();
    const cardName = String(card?.name || "").trim().toLowerCase();
    const cardNickname = String(card?.nickname || "").trim().toLowerCase();
    const cardInstitution = String(card?.institution || "").trim().toLowerCase();

    return snapshotDebts.find(d => {
        const debtCardId = String(d?.cardId || "").trim();
        if (cardId && debtCardId && cardId === debtCardId) return true;

        const debtName = String(d?.name || "").trim().toLowerCase();
        if (!debtName) return false;
        return (
            debtName === cardName ||
            debtName === cardNickname ||
            debtName === cardInstitution
        );
    });
}

// Merge debt balances entered in the audit form onto portfolio cards.
// This prevents stale strategy decisions when the user overrides balances in snapshot input.
export function mergeSnapshotDebts(cards = [], snapshotDebts = [], defaultApr = 0) {
    const defaultAprBps = toBps(defaultApr);
    return (cards || []).map(card => normalizeSnapshotDebt(
        card,
        findSnapshotDebtForCard(card, snapshotDebts || []),
        defaultAprBps
    ));
}

export function generateStrategy(config, snapshot) {
    const {
        checkingBalance = 0,
        savingsTotal = 0,
        cards = [],
        nonCardDebts = config?.nonCardDebts || [],
        renewals = [],
        snapshotDate = new Date().toISOString().split('T')[0]
    } = snapshot;

    // 1. Calculate Core Floors
    const weeklySpendAllowanceCents = toCents(config?.weeklySpendAllowance || 0);
    const emergencyFloorCents = toCents(config?.emergencyFloor || 0);
    const totalCheckingFloorCents = weeklySpendAllowanceCents + emergencyFloorCents;

    // 2. Determine Timeline
    const nextPayday = config.payday ? getNextPayday(snapshotDate, config.payday) : addDays(snapshotDate, 7);
    const daysToNextPaycheck = daysBetween(snapshotDate, nextPayday);

    // 3. Time Critical Bills Gate (Due <= Next Payday)
    let timeCriticalAmountCents = 0;
    let timeCriticalMinimumsCents = 0;
    const timeCriticalItems = [];

    // 3a. Renewals
    if (renewals && renewals.length > 0) {
        renewals.forEach(r => {
            if (r.nextDue && daysBetween(snapshotDate, r.nextDue) <= daysToNextPaycheck) {
                // Only count if it's explicitly charged to checking (card charges are paid later via card minimums/full-pay).
                const isCardCharge = isCardChargedRenewal(r, cards || []);
                if (!isCardCharge) {
                    const amountCents = toCents(r.amount);
                    if (amountCents > 0) {
                        timeCriticalAmountCents += amountCents;
                        timeCriticalItems.push({ name: normalizeName(r.name, "Renewal"), amount: fromCents(amountCents), due: r.nextDue });
                    }
                }
            }
        });
    }

    // 3b. Debt minimums (cards + non-card debts)
    const defaultAprBps = toBps(config?.defaultAPR || 0);
    const debtEntries = [];

    (cards || []).forEach(c => {
        const balanceCents = toCents(c?.balance || 0);
        if (balanceCents <= 0) return;
        debtEntries.push({
            type: "card",
            name: normalizeName(c?.name, "Card"),
            balanceCents,
            minimumCents: Math.max(0, toCents(c?.minPayment || 0)),
            aprBps: Math.max(0, toBps(c?.apr || 0) || defaultAprBps),
            dueDay: parseDueDay(c?.paymentDueDay),
            hasPromoApr: !!c?.hasPromoApr,
            promoAprExp: c?.promoAprExp || null
        });
    });

    (nonCardDebts || []).forEach(d => {
        const balanceCents = toCents(d?.balance || 0);
        if (balanceCents <= 0) return;
        debtEntries.push({
            type: "nonCard",
            name: normalizeName(d?.name, "Loan"),
            balanceCents,
            minimumCents: Math.max(0, toCents(d?.minimum ?? d?.minPayment ?? 0)),
            aprBps: Math.max(0, toBps(d?.apr || 0) || defaultAprBps),
            dueDay: parseDueDay(d?.dueDay),
            hasPromoApr: false,
            promoAprExp: null
        });
    });

    let totalMinimumsToPayCents = 0;
    debtEntries.forEach(debt => {
        if (debt.minimumCents <= 0) return;
        totalMinimumsToPayCents += debt.minimumCents;

        if (!debt.dueDay) return;
        const nextDueDate = getNextDateForDayOfMonth(snapshotDate, debt.dueDay);
        const daysUntilDue = daysBetween(snapshotDate, nextDueDate);
        if (daysUntilDue >= 0 && daysUntilDue <= daysToNextPaycheck) {
            timeCriticalAmountCents += debt.minimumCents;
            timeCriticalMinimumsCents += debt.minimumCents;
            timeCriticalItems.push({ name: `${debt.name} Minimum`, amount: fromCents(debt.minimumCents), due: nextDueDate });
        }
    });

    // 4. Required Transfer Engine
    const checkingBalanceCents = toCents(checkingBalance || 0);
    const savingsTotalCents = Math.max(0, toCents(savingsTotal || 0));
    const cashAvailableAboveFloorCents = checkingBalanceCents - totalCheckingFloorCents;
    const isNegativeCashFlow = cashAvailableAboveFloorCents < 0;
    let requiredTransferCents = 0;
    if (cashAvailableAboveFloorCents < timeCriticalAmountCents) {
        requiredTransferCents = Math.min((timeCriticalAmountCents - cashAvailableAboveFloorCents), savingsTotalCents);
    }

    // 5. Debt Kill vs Arbitrage (CFI logic)
    let recommendedDebtTarget = null;
    let recommendedDebtPaymentCents = 0;
    let strategyMethod = null;

    // Calculate surplus after floors and time-critical items
    // IMPORTANT: Deduct total minimums NOT captured in time-critical bills but still owed this cycle
    // to find the true *excess* operational surplus for debt payoff.
    const nonTimeCriticalMinimumsCents = Math.max(0, totalMinimumsToPayCents - timeCriticalMinimumsCents);
    const operationalSurplusCents = cashAvailableAboveFloorCents - timeCriticalAmountCents - nonTimeCriticalMinimumsCents;

    if (operationalSurplusCents > 0 && debtEntries.length > 0) {
        const activeDebts = debtEntries.filter(c => c.balanceCents > 0);

        if (activeDebts.length > 0) {
            const cfiCandidates = activeDebts
                .filter(d => d.minimumCents > 0)
                .sort(compareCfiPriority);
            const targetByCFI = cfiCandidates[0] || null;

            const targetByAPR = [...activeDebts].sort(compareAvalanchePriority)[0] || null;

            const promoCandidates = activeDebts
                .filter(d => d.hasPromoApr && d.promoAprExp)
                .map(d => {
                    const daysToExp = daysBetween(snapshotDate, d.promoAprExp);
                    if (daysToExp <= 0 || daysToExp > 90) return null;
                    return {
                        ...d,
                        daysToExp,
                        postAprBps: Math.max(d.aprBps, defaultAprBps || 2500)
                    };
                })
                .filter(Boolean)
                .sort(comparePromoPriority);
            const targetByPromoExp = promoCandidates[0] || null;

            const cfiThreshold = getCfiThreshold(config?.payFrequency, daysToNextPaycheck);
            const cfiBeatsThreshold = targetByCFI
                ? targetByCFI.balanceCents < (cfiThreshold * targetByCFI.minimumCents)
                : false;

            // Override hierarchy:
            // 1) promo expiry risk, 2) sub-threshold CFI drag, 3) APR avalanche.
            if (targetByPromoExp) {
                recommendedDebtTarget = `${targetByPromoExp.name} (Promo expires in ${targetByPromoExp.daysToExp}d)`;
                recommendedDebtPaymentCents = Math.min(operationalSurplusCents, targetByPromoExp.balanceCents);
                strategyMethod = "promo-sprint";
            } else if (cfiBeatsThreshold && targetByCFI) {
                recommendedDebtTarget = targetByCFI.name;
                recommendedDebtPaymentCents = Math.min(operationalSurplusCents, targetByCFI.balanceCents);
                strategyMethod = "cfi-override";
            } else if (targetByAPR) {
                recommendedDebtTarget = targetByAPR.name;
                recommendedDebtPaymentCents = Math.min(operationalSurplusCents, targetByAPR.balanceCents);
                strategyMethod = "avalanche";
            }
        }
    }

    return {
        snapshotDate,
        nextPayday,
        totalCheckingFloor: fromCents(totalCheckingFloorCents),
        timeCriticalAmount: fromCents(timeCriticalAmountCents),
        timeCriticalItems,
        requiredTransfer: fromCents(requiredTransferCents),
        isNegativeCashFlow,
        operationalSurplus: fromCents(Math.max(0, operationalSurplusCents)),
        debtStrategy: {
            target: recommendedDebtTarget,
            amount: fromCents(recommendedDebtPaymentCents),
            method: strategyMethod
        }
    };
}
