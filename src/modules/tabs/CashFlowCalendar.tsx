  import { useMemo,useState } from "react";
  import type { CatalystCashConfig,Card as PortfolioCard,Renewal } from "../../types/index.js";
  import { T } from "../constants.js";
  import { addDays,daysBetween,getNextDateForDayOfMonth,getNextPayday } from "../engine.js";
  import { Lock } from "../icons";
  import UiGlyph from "../UiGlyph.js";
  import { Card,Label } from "../ui.js";

interface CashFlowEvent {
  type: "income" | "bill" | "expense" | "savings";
  name: string;
  amount: number;
}

interface ScheduledAmount {
  date: string;
  name: string;
  amount: number;
}

interface CashFlowDay {
  date: string;
  shortDate: string;
  events: CashFlowEvent[];
  projectedBalance: number;
  isNegative: boolean;
  isBelowFloor: boolean;
}

interface CashFlowTimelineData {
  events: CashFlowDay[];
  minBalance: number;
  minBalanceDate: string;
}

interface CashFlowCalendarProps {
  config?: CatalystCashConfig | null;
  cards?: PortfolioCard[];
  renewals?: Renewal[];
  checkingBalance?: number;
  snapshotDate?: string;
  proEnabled?: boolean;
}

// Helper to format date "Mar 14"
function formatShortDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default function CashFlowCalendar({ config, cards = [], renewals = [], checkingBalance, snapshotDate, proEnabled = false }: CashFlowCalendarProps) {
  const isPro = proEnabled;

  // useMemo MUST come before any early returns (Rules of Hooks)
  const timeline = useMemo(() => {
    // Guard: config not loaded yet or tracking disabled
    if (!config || config.trackChecking === false) return null;
    const today = snapshotDate || new Date().toISOString().split("T")[0] || new Date().toISOString();
    const daysAhead = 30; // Look ahead 30 days (~4.5 weeks)
    let currentBalance = checkingBalance || 0;

    // Build a map of the next 30 days
    const days: CashFlowDay[] = [];

    // We need to know the dates of all paydays in the next 30 days
    const paydays: string[] = [];
    if (config.payday) {
      let nextP = getNextPayday(today, config.payday) || today;
      while (daysBetween(today, nextP) <= daysAhead) {
        paydays.push(nextP);
        if (config.payFrequency === "weekly") {
          nextP = addDays(nextP, 7) || nextP;
        } else if (config.payFrequency === "bi-weekly") {
          nextP = addDays(nextP, 14) || nextP;
        } else if (config.payFrequency === "semi-monthly") {
          nextP = addDays(nextP, 15) || nextP;
        } else {
          nextP = addDays(nextP, 30) || nextP;
        }
      }
    }

    // Map renewals/bills
    const bills: ScheduledAmount[] = [];
    renewals.forEach((r) => {
      let dueDate = r.nextDue;
      // Estimate nextDue if missing, based on cadence
      if (!dueDate) {
        if (
          r.cadence === "monthly" ||
          (r.interval === 1 && (r.intervalUnit === "months" || r.intervalUnit === "month"))
        ) {
          dueDate = getNextDateForDayOfMonth(today, (r as Renewal & { dueDay?: number }).dueDay || 1);
        } else {
          return; // Skip non-monthly renewals without a date — can't estimate
        }
      }
      const diff = daysBetween(today, dueDate);
      if (dueDate && diff >= 0 && diff <= daysAhead) {
        const isCard = cards.some(c => (c.name || "").toLowerCase() === (r.chargedTo || "").toLowerCase());
        if (!isCard) {
          bills.push({ date: dueDate, name: r.name, amount: r.amount || 0 });
        }
      }
    });

    // Map non-card debts (car loans, student loans, etc.) — monthly payments
    const nonCardDebtPayments: ScheduledAmount[] = [];
    (config.nonCardDebts || []).forEach(d => {
      const minimum = d.minimum ?? d.minPayment ?? 0;
      if (minimum > 0) {
        // Assume monthly payment on the 1st (or dueDay if set)
        const dueDate = getNextDateForDayOfMonth(today, d.dueDay || 1) || today;
        const diff = daysBetween(today, dueDate);
        if (diff >= 0 && diff <= daysAhead) {
          nonCardDebtPayments.push({ date: dueDate, name: `${d.name} Payment`, amount: minimum });
        }
      }
    });

    // Map credit card minimum payments (due on their paymentDueDay of the month)
    const cardPayments: ScheduledAmount[] = [];
    cards.forEach(c => {
      const balance = Number(c.balance ?? 0);
      const minPayment = Number(c.minPayment ?? 0);
      if (balance > 0 && minPayment > 0 && c.paymentDueDay) {
        const nextDueDate = getNextDateForDayOfMonth(today, c.paymentDueDay) || today;
        const diff = daysBetween(today, nextDueDate);
        if (diff >= 0 && diff <= daysAhead) {
          cardPayments.push({ date: nextDueDate, name: `${c.name} Min Payment`, amount: minPayment });
        }
      }
    });

    // Daily budget burn = sum of all budget category monthlyTargets / 30
    const budgetCategories = config.budgetCategories || [];
    const totalMonthlyBudget = budgetCategories.reduce((sum, cat) => sum + (cat.monthlyTarget || 0), 0);
    const dailyBudgetBurn = totalMonthlyBudget > 0 ? Math.round((totalMonthlyBudget / 30) * 100) / 100 : 0;

    // Savings goal monthly contributions (appear on the 1st of each month)
    const savingsGoalPayments: ScheduledAmount[] = [];
    if (((config as CatalystCashConfig & { enableSavingsGoals?: boolean }).enableSavingsGoals ?? true) && config.savingsGoals?.length > 0) {
      config.savingsGoals.forEach(goal => {
        const targetAmount = goal.targetAmount ?? goal.target ?? 0;
        const currentAmount = goal.currentAmount ?? goal.saved ?? 0;
        if (targetAmount > 0 && currentAmount < targetAmount && goal.targetDate) {
          const monthsLeft = Math.max(1, daysBetween(today, goal.targetDate) / 30);
          const remaining = targetAmount - currentAmount;
          const monthlyContrib = Math.round((remaining / monthsLeft) * 100) / 100;
          if (monthlyContrib > 0) {
            // Find the next 1st of a month in our horizon
            for (let d = 0; d <= daysAhead; d++) {
              const dStr = addDays(today, d) || today;
              if (dStr.endsWith("-01")) {
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
      const dStr = addDays(today, i) || today;
      const dayEvents: CashFlowEvent[] = [];
      let netChange = 0;

      // Add Paychecks
      if (paydays.includes(dStr)) {
        const amt = config.paycheckStandard || 0;
        if (amt > 0) {
          dayEvents.push({ type: "income", name: "Paycheck", amount: amt });
          netChange += amt;
        }
      }

      // Subtract Bills (renewals)
      const daysBills = bills.filter(b => b.date === dStr);
      daysBills.forEach(b => {
        dayEvents.push({ type: "bill", name: b.name, amount: b.amount });
        netChange -= b.amount;
      });

      // Subtract Card Minimum Payments
      const daysCardPayments = cardPayments.filter(cp => cp.date === dStr);
      daysCardPayments.forEach(cp => {
        dayEvents.push({ type: "bill", name: cp.name, amount: cp.amount });
        netChange -= cp.amount;
      });

      // Subtract Non-Card Debt Payments (car loans, student loans, etc.)
      const daysDebtPayments = nonCardDebtPayments.filter(dp => dp.date === dStr);
      daysDebtPayments.forEach(dp => {
        dayEvents.push({ type: "bill", name: dp.name, amount: dp.amount });
        netChange -= dp.amount;
      });

      // Subtract Daily Budget Burn (only on weekdays for realism, or every day)
      if (dailyBudgetBurn > 0 && i > 0) {
        // Skip day 0 (today — already spent)
        dayEvents.push({ type: "expense", name: "Daily Spend", amount: dailyBudgetBurn });
        netChange -= dailyBudgetBurn;
      }

      // Subtract Savings Goal Contributions
      const daysSavings = savingsGoalPayments.filter(sg => sg.date === dStr);
      daysSavings.forEach(sg => {
        dayEvents.push({ type: "savings", name: sg.name, amount: sg.amount });
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
          isBelowFloor: currentBalance > 0 && currentBalance < (config.emergencyFloor || 0),
        });
      }
    }

    return { events: days, minBalance, minBalanceDate };
  }, [config, cards, renewals, checkingBalance, snapshotDate]) as CashFlowTimelineData | null;

  // Early returns AFTER all hooks
  if (!timeline || !config || config.trackChecking === false) return null;

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
    <Card animate>
      <Label>Cash Flow Horizon (30 Days)</Label>

      {/* Radar Summary Alert */}
      <div
        style={{
          marginBottom: 16,
          padding: 12,
          borderRadius: T.radius.md,
          background:
            timeline.minBalance < 0
              ? `${T.status.red}15`
              : timeline.minBalance < (config.emergencyFloor || 0)
                ? `${T.status.amber}15`
                : `${T.status.green}15`,
          border: `1px solid ${timeline.minBalance < 0 ? `${T.status.red}40` : timeline.minBalance < (config.emergencyFloor || 0) ? `${T.status.amber}40` : `${T.status.green}40`}`,
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        <UiGlyph
          glyph={timeline.minBalance < 0 ? "⚠️" : timeline.minBalance < (config.emergencyFloor || 0) ? "⚠️" : "⚖️"}
          size={20}
          color={timeline.minBalance < 0 ? T.status.red : timeline.minBalance < (config.emergencyFloor || 0) ? T.status.amber : T.status.green}
        />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, marginBottom: 2 }}>
            Projected Low Point: ${timeline.minBalance.toFixed(2)}
          </div>
          <div style={{ fontSize: 12, color: T.text.secondary }}>
            Expected on {formatShortDate(timeline.minBalanceDate)}.
            {timeline.minBalance < 0
              ? " Deficit risk detected."
              : timeline.minBalance < (config.emergencyFloor || 0)
                ? " Drops below emergency floor."
                : " Floor is protected."}
          </div>
        </div>
      </div>

      {/* Pro Tier - Ghost Budget Heatmap Spotlight */}
      {isPro ? (
        <GhostHeatmap events={timeline.events} />
      ) : (
        <div style={{
          background: `linear-gradient(135deg, ${T.bg.elevated}, ${T.bg.card})`,
          border: `1px dashed ${T.accent.purple}50`,
          padding: 20,
          borderRadius: T.radius.lg,
          textAlign: "center",
          marginBottom: 16
        }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
            <div style={{ background: `${T.accent.purple}20`, padding: 8, borderRadius: "50%", color: T.accent.purple }}>
              <Lock size={16} />
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.text.primary, marginBottom: 4 }}>
            Ghost Budget Heatmap
          </div>
          <div style={{ fontSize: 11, color: T.text.secondary, marginBottom: 12, maxWidth: 260, margin: "0 auto 12px" }}>
            Unlock the 30-day predictive visual heatmap to see exactly when your liquidity peaks and dips automatically.
          </div>
          <div style={{ fontSize: 10, fontWeight: 800, color: T.accent.purple, letterSpacing: "0.05em", fontFamily: T.font.mono }}>
            PRO FEATURE
          </div>
        </div>
      )}

      {/* Timeline List (Always available)*/}
      <CashFlowTimeline events={timeline.events} />
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// GHOST BUDGET HEATMAP (Pro Tier UI Widget)
// visually maps 30-day liquidity risks without having to read a list
// ═══════════════════════════════════════════════════════════════
function GhostHeatmap({ events }) {
  if (!events || events.length === 0) return null;

  // We want to map the dates into a 4-week grid (approx 7 columns x 4-5 rows)
  // To make it pretty, we just flow them left to right as little rounded rects
  // with color intensity based on net cash flow that day, OR balance drop

  // Find min / max projected daily balance to scale opacity
  const balances = events.map(e => e.projectedBalance);
  const maxB = Math.max(...balances, 1);

  const getHeatColor = (balance, isNegative, isBelowFloor) => {
    if (isNegative) return T.status.red;
    if (isBelowFloor) return T.status.amber;

    // If it's positive and healthy, we map it to a gradient of green based on how close it is to max
    const ratio = Math.max(0.1, balance / maxB);
    // Returns a rgba string mixing the emerald color
    return `rgba(50, 215, 120, ${ratio})`; // A nice responsive emerald
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.text.dim, marginBottom: 10, letterSpacing: "0.05em" }}>
        30-DAY LIQUIDITY HEATMAP
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, 1fr)",
        gap: 6,
        background: T.bg.elevated,
        padding: 12,
        borderRadius: T.radius.md,
        border: `1px solid ${T.border.default}`
      }}>
        {events.map((day, i) => {
          const hasIncome = day.events.some(e => e.type === "income");
          const hasBill = day.events.some(e => e.type === "bill");

          return (
            <div
              key={i}
              title={`${day.shortDate}: $${day.projectedBalance.toFixed(0)}`}
              style={{
                aspectRatio: "1 / 1",
                borderRadius: 4,
                background: getHeatColor(day.projectedBalance, day.isNegative, day.isBelowFloor),
                border: `1px solid rgba(255,255,255,0.05)`,
                position: "relative",
                overflow: "hidden",
                animation: `fadeIn .2s ease-out ${i * 0.02}s both`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              {/* Inner Indicators for major events */}
              {hasIncome && <div style={{ position: "absolute", top: 2, right: 2, width: 4, height: 4, borderRadius: 2, background: "#fff", boxShadow: "0 0 4px #fff" }} />}
              {hasBill && <div style={{ position: "absolute", bottom: 2, left: 2, width: 4, height: 4, borderRadius: 2, background: "rgba(0,0,0,0.4)" }} />}

              {/* Date number subtly visible */}
              <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.7)", fontFamily: T.font.mono, mixBlendMode: "overlay" }}>
                {day.date.split("-")[2]}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 9, color: T.text.muted, fontFamily: T.font.mono }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: T.status.red }} /> Risk
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: "rgba(50, 215, 120, 0.4)" }} /> Healthy
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: "rgba(50, 215, 120, 1)" }} /> Peak
        </div>
      </div>
    </div>
  );
}

const COLLAPSED_COUNT = 5;

function CashFlowTimeline({ events }) {
  const [expanded, setExpanded] = useState(false);
  const visibleEvents = expanded ? events : events.slice(0, COLLAPSED_COUNT);
  const hasMore = events.length > COLLAPSED_COUNT;

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, position: "relative" }}>
        <div
          style={{
            position: "absolute",
            left: 15,
            top: 10,
            bottom: 10,
            width: 2,
            background: T.border.default,
            zIndex: 0,
          }}
        />

        {visibleEvents.map((day, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 12,
              position: "relative",
              zIndex: 1,
              animation: `fadeInUp .35s ease-out ${Math.min(i * 0.04, 0.6)}s both`,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                background: T.bg.elevated,
                border: `2px solid ${day.isNegative ? T.status.red : day.events.some(e => e.type === "income") ? T.status.green : T.border.default}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                fontSize: 10,
                fontWeight: 700,
                color: T.text.primary,
              }}
            >
              {day.date.split("-")[2]}
            </div>
            <div style={{ flex: 1, paddingTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.text.secondary, marginBottom: 4 }}>
                {day.shortDate}
              </div>
              {day.events.map((ev, j) => {
                const evColor =
                  ev.type === "income"
                    ? T.status.green
                    : ev.type === "savings"
                      ? T.accent.emerald
                      : ev.type === "expense"
                        ? T.status.amber
                        : T.text.primary;
                return (
                  <div
                    key={j}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 10px",
                      background: T.bg.card,
                      border: `1px solid ${T.border.default}`,
                      borderRadius: T.radius.sm,
                      marginBottom: 4,
                    }}
                  >
                    <div style={{ fontSize: 13, color: T.text.primary, fontWeight: ev.type === "income" ? 600 : 400 }}>
                      {ev.name}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: evColor }}>
                      {ev.type === "income" ? "+" : "-"}${ev.amount.toFixed(2)}
                    </div>
                  </div>
                );
              })}
              <div
                style={{
                  fontSize: 11,
                  color: day.isNegative ? T.status.red : T.text.muted,
                  textAlign: "right",
                  marginTop: 4,
                  paddingRight: 4,
                  fontWeight: day.isBelowFloor ? 700 : 400,
                }}
              >
                Est. Checking: ${day.projectedBalance.toFixed(2)}
              </div>
            </div>
          </div>
        ))}
      </div>
      {hasMore && (
        <button type="button"
          onClick={() => setExpanded(!expanded)}
          style={{
            width: "100%",
            marginTop: 12,
            padding: "10px 16px",
            borderRadius: T.radius.md,
            border: `1px solid ${T.border.subtle}`,
            background: T.bg.elevated,
            color: T.text.secondary,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            transition: "transform .2s ease, opacity .2s ease, background-color .2s ease, border-color .2s ease, color .2s ease, box-shadow .2s ease",
          }}
        >
          {expanded ? "Show less ▲" : `Show all 30 days ▼`}
        </button>
      )}
    </>
  );
}
