/**
 * Catalyst Cash Native Strategy Engine
 * This engine handles strict mathematical constraints (floors, pace, debt arbitrage) 
 * natively to ensure reliable calculations without relying on LLM hallucinations.
 */

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
    // Use floor to handle partial day differences effectively
    return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
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

export function generateStrategy(config, snapshot) {
    const {
        checkingBalance = 0,
        allyVaultTotal = 0,
        cards = [],
        renewals = [],
        snapshotDate = new Date().toISOString().split('T')[0]
    } = snapshot;

    // 1. Calculate Core Floors
    const weeklySpendAllowance = Number.isFinite(config?.weeklySpendAllowance) ? config.weeklySpendAllowance : 0;
    const emergencyFloor = Number.isFinite(config?.emergencyFloor) ? config.emergencyFloor : 0;
    const totalCheckingFloor = weeklySpendAllowance + emergencyFloor;

    // 2. Determine Timeline
    const nextPayday = config.payday ? getNextPayday(snapshotDate, config.payday) : addDays(snapshotDate, 7);
    const daysToNextPaycheck = daysBetween(snapshotDate, nextPayday);

    // 3. Time Critical Bills Gate (Due <= Next Payday)
    let timeCriticalAmount = 0;
    const timeCriticalItems = [];

    // 3a. Renewals
    if (renewals && renewals.length > 0) {
        renewals.forEach(r => {
            if (r.nextDue && daysBetween(snapshotDate, r.nextDue) <= daysToNextPaycheck) {
                // Only count if it's explicitly charged to checking, or if 'chargedTo' isn't a known card
                const isCardCharge = cards.some(c => c.name.toLowerCase() === (r.chargedTo || "").toLowerCase());
                if (!isCardCharge) {
                    timeCriticalAmount += (r.amount || 0);
                    timeCriticalItems.push({ name: r.name, amount: r.amount, due: r.nextDue });
                }
            }
        });
    }

    // 3b. Card Minimums
    let totalCardMinimumsToPay = 0;
    if (cards && cards.length > 0) {
        cards.forEach(c => {
            if (c.balance > 0 && c.minPayment > 0) {
                totalCardMinimumsToPay += c.minPayment;

                if (c.paymentDueDay) {
                    const nextDueDate = getNextDateForDayOfMonth(snapshotDate, c.paymentDueDay);
                    const daysUntilDue = daysBetween(snapshotDate, nextDueDate);
                    // Time-critical if due before next payday
                    if (daysUntilDue >= 0 && daysUntilDue <= daysToNextPaycheck) {
                        timeCriticalAmount += c.minPayment;
                        timeCriticalItems.push({ name: `${c.name} Minimum`, amount: c.minPayment, due: nextDueDate });
                    }
                }
            }
        });
    }

    // 4. Required Transfer Engine
    const cashAvailableAboveFloor = checkingBalance - totalCheckingFloor;
    let requiredTransfer = 0;
    if (cashAvailableAboveFloor < timeCriticalAmount) {
        requiredTransfer = Math.min((timeCriticalAmount - cashAvailableAboveFloor), allyVaultTotal);
    }

    // 5. Debt Kill vs Arbitrage (CFI logic)
    let recommendedDebtTarget = null;
    let recommendedDebtPayment = 0;

    // Calculate surplus after floors and time-critical items
    // IMPORTANT: Deduct total minimums NOT captured in time-critical bills but still owed this cycle 
    // to find the true *excess* operational surplus for debt payoff.
    const nonTimeCriticalMinimums = totalCardMinimumsToPay - timeCriticalItems.filter(i => i.name.includes("Minimum")).reduce((s, i) => s + i.amount, 0);
    const operationalSurplus = cashAvailableAboveFloor - timeCriticalAmount - Math.max(0, nonTimeCriticalMinimums);

    if (operationalSurplus > 0 && cards && cards.length > 0) {
        // Filter active debts
        const activeDebts = cards.filter(c => c.balance > 0);

        if (activeDebts.length > 0) {
            // Calculate Cash Flow Index (CFI) = Balance / Minimum Payment
            // A CFI < 50 means the debt is a heavy cash-flow drag and should be killed first
            let lowestCFI = Infinity;
            let highestAPR = -1;
            let targetByCFI = null;
            let targetByAPR = null;
            let targetByPromoExp = null;
            let nearestPromoDays = Infinity;

            activeDebts.forEach(debt => {
                if (debt.minPayment > 0) {
                    const cfi = debt.balance / debt.minPayment;
                    if (cfi < lowestCFI) {
                        lowestCFI = cfi;
                        targetByCFI = debt;
                    }
                }
                if (debt.apr > highestAPR) {
                    highestAPR = debt.apr;
                    targetByAPR = debt;
                }
                if (debt.hasPromoApr && debt.promoAprExp) {
                    const daysToExp = daysBetween(snapshotDate, debt.promoAprExp);
                    if (daysToExp > 0 && daysToExp < nearestPromoDays && daysToExp <= 90) {
                        // High alert: 0% promo expiring within 90 days
                        nearestPromoDays = daysToExp;
                        targetByPromoExp = debt;
                    }
                }
            });

            // Override Hierarchy:
            // 1. Promo Expirations (< 90 days) prevent retro-active interest bombs
            // 2. CFI Drag (< 50) frees up massive cash flow rapidly
            // 3. Highest APR Avalanche (standard mathematically optimal path)
            if (targetByPromoExp) {
                recommendedDebtTarget = targetByPromoExp.name + " (Avoid Promo Expiration)";
                recommendedDebtPayment = Math.min(operationalSurplus, targetByPromoExp.balance);
            } else if (lowestCFI < 50 && targetByCFI) {
                recommendedDebtTarget = targetByCFI.name;
                recommendedDebtPayment = Math.min(operationalSurplus, targetByCFI.balance);
            } else if (targetByAPR) {
                recommendedDebtTarget = targetByAPR.name;
                recommendedDebtPayment = Math.min(operationalSurplus, targetByAPR.balance);
            }
        }
    }

    return {
        snapshotDate,
        nextPayday,
        totalCheckingFloor,
        timeCriticalAmount,
        timeCriticalItems,
        requiredTransfer,
        operationalSurplus: Math.max(0, operationalSurplus),
        debtStrategy: {
            target: recommendedDebtTarget,
            amount: recommendedDebtPayment
        }
    };
}
