import { useMemo } from "react";
import { Card, Label } from "../ui.jsx";
import { T } from "../constants.js";
import { addDays, daysBetween, getNextPayday, getNextDateForDayOfMonth } from "../engine.js";

// Helper to format date "Mar 14"
function formatShortDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export default function CashFlowCalendar({ config, cards, renewals, checkingBalance, snapshotDate }) {
    if (config.trackChecking === false) return null;

    const timeline = useMemo(() => {
        const today = snapshotDate || new Date().toISOString().split('T')[0];
        const daysAhead = 35; // Look ahead 5 weeks
        let currentBalance = checkingBalance || 0;

        // Build a map of the next 35 days
        const days = [];

        // We need to know the dates of all paydays in the next 35 days
        const paydays = [];
        if (config.payday) {
            let nextP = getNextPayday(today, config.payday);
            while (daysBetween(today, nextP) <= daysAhead) {
                paydays.push(nextP);
                if (config.payFrequency === "weekly") {
                    nextP = addDays(nextP, 7);
                } else if (config.payFrequency === "bi-weekly") {
                    nextP = addDays(nextP, 14);
                } else if (config.payFrequency === "semi-monthly") {
                    nextP = addDays(nextP, 15);
                } else {
                    nextP = addDays(nextP, 30);
                }
            }
        }

        // Map renewals/bills
        const bills = [];
        (renewals || []).forEach(r => {
            if (!r.nextDue) return;
            const diff = daysBetween(today, r.nextDue);
            if (diff >= 0 && diff <= daysAhead) {
                const isCard = (cards || []).some(c => c.name.toLowerCase() === (r.chargedTo || "").toLowerCase());
                if (!isCard) {
                    bills.push({ date: r.nextDue, name: r.name, amount: r.amount || 0 });
                }
            }
        });

        // Map credit card minimum payments (due on their paymentDueDay of the month)
        const cardPayments = [];
        (cards || []).forEach(c => {
            if (c.balance > 0 && c.minPayment > 0 && c.paymentDueDay) {
                const nextDueDate = getNextDateForDayOfMonth(today, c.paymentDueDay);
                const diff = daysBetween(today, nextDueDate);
                if (diff >= 0 && diff <= daysAhead) {
                    cardPayments.push({ date: nextDueDate, name: `${c.name} Min Payment`, amount: c.minPayment });
                }
            }
        });

        // Daily budget burn = sum of all budget category monthlyTargets / 30
        const budgetCategories = config.budgetCategories || [];
        const totalMonthlyBudget = budgetCategories.reduce((sum, cat) => sum + (cat.monthlyTarget || 0), 0);
        const dailyBudgetBurn = totalMonthlyBudget > 0 ? Math.round((totalMonthlyBudget / 30) * 100) / 100 : 0;

        // Savings goal monthly contributions (appear on the 1st of each month)
        const savingsGoalPayments = [];
        if (config.enableSavingsGoals !== false && config.savingsGoals?.length > 0) {
            config.savingsGoals.forEach(goal => {
                if (goal.targetAmount > 0 && goal.currentAmount < goal.targetAmount && goal.targetDate) {
                    const monthsLeft = Math.max(1, daysBetween(today, goal.targetDate) / 30);
                    const remaining = goal.targetAmount - (goal.currentAmount || 0);
                    const monthlyContrib = Math.round((remaining / monthsLeft) * 100) / 100;
                    if (monthlyContrib > 0) {
                        // Find the next 1st of a month in our horizon
                        for (let d = 0; d <= daysAhead; d++) {
                            const dStr = addDays(today, d);
                            if (dStr.endsWith('-01')) {
                                savingsGoalPayments.push({ date: dStr, name: `Savings: ${goal.name}`, amount: monthlyContrib });
                                break; // One contribution per goal in our horizon
                            }
                        }
                    }
                }
            });
        }

        let minBalance = currentBalance;
        let minBalanceDate = today;

        for (let i = 0; i <= daysAhead; i++) {
            const dStr = addDays(today, i);
            const dayEvents = [];
            let netChange = 0;

            // Add Paychecks
            if (paydays.includes(dStr)) {
                const amt = config.paycheckStandard || 0;
                if (amt > 0) {
                    dayEvents.push({ type: 'income', name: 'Paycheck', amount: amt });
                    netChange += amt;
                }
            }

            // Subtract Bills (renewals)
            const daysBills = bills.filter(b => b.date === dStr);
            daysBills.forEach(b => {
                dayEvents.push({ type: 'bill', name: b.name, amount: b.amount });
                netChange -= b.amount;
            });

            // Subtract Card Minimum Payments
            const daysCardPayments = cardPayments.filter(cp => cp.date === dStr);
            daysCardPayments.forEach(cp => {
                dayEvents.push({ type: 'bill', name: cp.name, amount: cp.amount });
                netChange -= cp.amount;
            });

            // Subtract Daily Budget Burn (only on weekdays for realism, or every day)
            if (dailyBudgetBurn > 0 && i > 0) { // Skip day 0 (today — already spent)
                dayEvents.push({ type: 'expense', name: 'Daily Spend', amount: dailyBudgetBurn });
                netChange -= dailyBudgetBurn;
            }

            // Subtract Savings Goal Contributions
            const daysSavings = savingsGoalPayments.filter(sg => sg.date === dStr);
            daysSavings.forEach(sg => {
                dayEvents.push({ type: 'savings', name: sg.name, amount: sg.amount });
                netChange -= sg.amount;
            });

            currentBalance += netChange;

            if (currentBalance < minBalance) {
                minBalance = currentBalance;
                minBalanceDate = dStr;
            }

            if (dayEvents.length > 0) {
                days.push({
                    date: dStr,
                    shortDate: formatShortDate(dStr),
                    events: dayEvents,
                    projectedBalance: currentBalance,
                    isNegative: currentBalance < 0,
                    isBelowFloor: currentBalance > 0 && currentBalance < (config.emergencyFloor || 0)
                });
            }
        }

        return { events: days, minBalance, minBalanceDate };
    }, [config, cards, renewals, checkingBalance, snapshotDate]);

    if (!timeline.events || timeline.events.length === 0) {
        return (
            <Card>
                <Label>Cash Flow Horizon (30 Days)</Label>
                <div style={{ textAlign: "center", padding: "20px 0", color: T.text.muted, fontSize: 13 }}>
                    No upcoming cash events scheduled.
                </div>
            </Card>
        );
    }

    return (
        <Card>
            <Label>Cash Flow Horizon (35 Days)</Label>

            {/* Radar Summary Alert */}
            <div style={{
                marginBottom: 16, padding: 12, borderRadius: T.radius.md,
                background: timeline.minBalance < 0 ? `${T.status.red}15` : (timeline.minBalance < (config.emergencyFloor || 0) ? `${T.status.yellow}15` : `${T.status.green}15`),
                border: `1px solid ${timeline.minBalance < 0 ? `${T.status.red}40` : (timeline.minBalance < (config.emergencyFloor || 0) ? `${T.status.yellow}40` : `${T.status.green}40`)}`,
                display: "flex", alignItems: "flex-start", gap: 10
            }}>
                <div style={{ fontSize: 20 }}>
                    {timeline.minBalance < 0 ? "⚠️" : (timeline.minBalance < (config.emergencyFloor || 0) ? "⚠️" : "⚖️")}
                </div>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, marginBottom: 2 }}>
                        Projected Low Point: ${timeline.minBalance.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 12, color: T.text.secondary }}>
                        Expected on {formatShortDate(timeline.minBalanceDate)}.
                        {timeline.minBalance < 0 ? " Deficit risk detected." : (timeline.minBalance < (config.emergencyFloor || 0) ? " Drops below emergency floor." : " Floor is protected.")}
                    </div>
                </div>
            </div>

            {/* Timeline */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, position: "relative" }}>
                <div style={{ position: "absolute", left: 15, top: 10, bottom: 10, width: 2, background: T.border.default, zIndex: 0 }} />

                {timeline.events.map((day, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, position: "relative", zIndex: 1 }}>
                        <div style={{
                            width: 32, height: 32, borderRadius: 16, background: T.bg.elevated,
                            border: `2px solid ${day.isNegative ? T.status.red : (day.events.some(e => e.type === 'income') ? T.status.green : T.border.default)}`,
                            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                            fontSize: 10, fontWeight: 700, color: T.text.primary
                        }}>
                            {day.date.split('-')[2]}
                        </div>
                        <div style={{ flex: 1, paddingTop: 4 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: T.text.secondary, marginBottom: 4 }}>
                                {day.shortDate}
                            </div>
                            {day.events.map((ev, j) => {
                                const evColor = ev.type === 'income' ? T.status.green
                                    : ev.type === 'savings' ? T.accent.emerald
                                        : ev.type === 'expense' ? T.status.amber
                                            : T.text.primary;
                                return (
                                    <div key={j} style={{
                                        display: "flex", justifyContent: "space-between", alignItems: "center",
                                        padding: "8px 10px", background: T.bg.card, border: `1px solid ${T.border.default}`,
                                        borderRadius: T.radius.sm, marginBottom: 4
                                    }}>
                                        <div style={{ fontSize: 13, color: T.text.primary, fontWeight: ev.type === 'income' ? 600 : 400 }}>
                                            {ev.name}
                                        </div>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: evColor }}>
                                            {ev.type === 'income' ? '+' : '-'}${ev.amount.toFixed(2)}
                                        </div>
                                    </div>
                                );
                            })}
                            <div style={{ fontSize: 11, color: day.isNegative ? T.status.red : T.text.muted, textAlign: "right", marginTop: 4, paddingRight: 4, fontWeight: day.isBelowFloor ? 700 : 400 }}>
                                Est. Checking: ${day.projectedBalance.toFixed(2)}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
}
