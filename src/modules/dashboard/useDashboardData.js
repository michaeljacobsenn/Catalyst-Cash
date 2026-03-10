import { useMemo } from "react";
import { fmt, extractDashboardMetrics } from "../utils.js";
import { T } from "../constants.js";
import { computeFireProjection } from "../fire.js";
import { useAudit } from "../contexts/AuditContext.jsx";
import { useSettings } from "../contexts/SettingsContext.jsx";
import { usePortfolio } from "../contexts/PortfolioContext.jsx";

function summarizeTrend(data, key, formatter) {
  if (!Array.isArray(data) || data.length < 2) {
    return { direction: "flat", change: "insufficient data", start: null, end: null };
  }
  const first = data[0]?.[key];
  const last = data[data.length - 1]?.[key];
  if (!Number.isFinite(first) || !Number.isFinite(last)) {
    return { direction: "flat", change: "insufficient data", start: null, end: null };
  }
  const delta = last - first;
  const pct = first !== 0 ? (delta / Math.abs(first)) * 100 : 0;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const absPct = Math.abs(pct);
  const pctText = Number.isFinite(absPct) ? `${absPct.toFixed(1)}%` : "0.0%";
  return {
    direction,
    change: delta === 0 ? "unchanged" : `${direction} ${pctText}`,
    start: formatter(first),
    end: formatter(last),
  };
}

export default function useDashboardData() {
  const { current, history } = useAudit();
  const { financialConfig } = useSettings();
  const { cards, bankAccounts, renewals, marketPrices } = usePortfolio();

  const p = current?.parsed;
  const dashboardMetrics = extractDashboardMetrics(p);
  const fallbackChecking = bankAccounts.filter(b => b.accountType === "checking").reduce((s, b) => s + (parseFloat(b.balance) || 0), 0);
  const floor =
    (Number.isFinite(financialConfig?.weeklySpendAllowance) ? financialConfig.weeklySpendAllowance : 0) +
    (Number.isFinite(financialConfig?.emergencyFloor) ? financialConfig.emergencyFloor : 0);

  // Investment snapshot computation
  const investmentSnapshot = useMemo(() => {
    const holdings = financialConfig?.holdings || {};
    const sections = [
      {
        key: "k401",
        label: "401(k)",
        enabled: !!financialConfig?.track401k && holdings.k401?.length > 0,
        color: T.status.blue,
      },
      {
        key: "roth",
        label: "Roth IRA",
        enabled: !!financialConfig?.trackRothContributions && holdings.roth?.length > 0,
        color: T.status.purple,
      },
      {
        key: "brokerage",
        label: "Brokerage",
        enabled: !!financialConfig?.trackBrokerage && holdings.brokerage?.length > 0,
        color: T.accent.emerald,
      },
      {
        key: "hsa",
        label: "HSA",
        enabled: !!financialConfig?.trackHSA && holdings.hsa?.length > 0,
        color: T.accent.emerald,
      },
      {
        key: "crypto",
        label: "Crypto",
        enabled: !!financialConfig?.trackCrypto && holdings.crypto?.length > 0,
        color: T.status.amber,
      },
    ];
    const result = [];
    let grandTotal = 0;
    for (const s of sections) {
      const items = holdings[s.key] || [];
      if (items.length === 0 && !s.enabled) continue;
      let total = 0;
      for (const h of items) {
        const price = marketPrices?.[h.symbol]?.price ?? h.lastKnownPrice ?? 0;
        total += (parseFloat(h.shares) || 0) * price;
      }
      if (total > 0 || s.enabled) result.push({ ...s, total, count: items.length });
      grandTotal += total;
    }
    return { accounts: result, total: grandTotal };
  }, [financialConfig, marketPrices]);

  const fireProjection = useMemo(() => {
    if (current?.isTest) {
      return computeFireProjection({
        financialConfig: {
          incomeSources: [{ amount: 150000, frequency: "yearly" }],
          budgetCategories: [{ monthlyTarget: 4000 }],
          fireExpectedReturnPct: 7,
          fireInflationPct: 2.5,
          fireSafeWithdrawalPct: 4,
        },
        renewals: [],
        cards: [],
        portfolioMarketValue: 180000,
        asOfDate: current?.date || new Date().toISOString().split("T")[0],
      });
    }
    return computeFireProjection({
      financialConfig,
      renewals,
      cards,
      portfolioMarketValue: investmentSnapshot.total,
      asOfDate: current?.date || new Date().toISOString().split("T")[0],
    });
  }, [financialConfig, renewals, cards, investmentSnapshot.total, current?.date, current?.isTest]);

  // Weekly streak counter (existing)
  const streak = useMemo(() => {
    const realAudits = history.filter(a => !a.isTest);
    if (!realAudits.length) return 0;
    const getISOWeek = d => {
      const dt = new Date(d);
      dt.setHours(0, 0, 0, 0);
      dt.setDate(dt.getDate() + 3 - ((dt.getDay() + 6) % 7));
      const w1 = new Date(dt.getFullYear(), 0, 4);
      return `${dt.getFullYear()}-W${String(1 + Math.round(((dt - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7)).padStart(2, "0")}`;
    };
    const weeks = [...new Set(realAudits.map(a => (a.date ? getISOWeek(a.date) : null)).filter(Boolean))]
      .sort()
      .reverse();
    if (!weeks.length) return 0;
    const currentWeek = getISOWeek(new Date().toISOString().split("T")[0]);
    let count = 0;
    const startWeek = weeks[0] === currentWeek ? currentWeek : weeks[0];
    const checkDate = new Date(startWeek.slice(0, 4), 0, 1);
    const weekNum = parseInt(startWeek.slice(6), 10);
    checkDate.setDate(checkDate.getDate() + (weekNum - 1) * 7);
    for (let i = 0; i < weeks.length && i < 52; i++) {
      const expected = getISOWeek(checkDate.toISOString().split("T")[0]);
      if (weeks.includes(expected)) {
        count++;
        checkDate.setDate(checkDate.getDate() - 7);
      } else break;
    }
    return count;
  }, [history]);

  // Daily No-Spend Streak
  const noSpendStreak = useMemo(() => {
    let allTransactions = [];
    cards.forEach(c => {
      if (c._plaidTransactions) allTransactions.push(...c._plaidTransactions);
    });
    bankAccounts.forEach(b => {
      if (b._plaidTransactions) allTransactions.push(...b._plaidTransactions);
    });

    if (allTransactions.length === 0) return 0;

    // Filter to outward flow (positive amount in Plaid is an expense)
    const outflows = allTransactions.filter(t => t.amount > 0);

    // Essential categories to ignore when calculating a 'no discretionary spend' streak
    const essentialCategories = [
      "LOAN_PAYMENTS",
      "BANK_FEES",
      "TRANSFER_OUT",
      "RENT_AND_UTILITIES",
      "GOVERNMENT_AND_NON_PROFIT",
      // Add common Plaid primary/detailed categories representing bills rather than swipes
    ];

    const discretionary = outflows.filter(t => {
      const cat = t.personal_finance_category?.primary || "";
      if (essentialCategories.includes(cat)) return false;
      // Also ignore explicit transfers or credit card payments
      if (t.name && (t.name.toLowerCase().includes("payment") || t.name.toLowerCase().includes("transfer"))) return false;
      return true;
    });

    // Group by date
    const datesWithSpend = new Set(discretionary.map(t => t.date));

    // Count backwards from today (or yesterday)
    let count = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check up to 30 days back
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];

      if (datesWithSpend.has(dateStr)) {
        // Stop current streak
        if (i > 0) break; // If we spent today, streak is 0 unless we ignore today until it's over
      } else {
        count++;
      }
    }

    return count;
  }, [cards, bankAccounts]);

  // Chart data
  const chartData = useMemo(
    () =>
      history
        .filter(a => a.parsed?.netWorth != null)
        .slice(0, 12)
        .reverse()
        .map(a => {
          const [, m, d] = (a.date || "").split("-");
          const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          return { date: m ? `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}` : "?", nw: a.parsed.netWorth };
        }),
    [history]
  );

  const scoreData = useMemo(
    () =>
      history
        .filter(a => !a.isTest && a.parsed?.healthScore?.score != null)
        .slice(0, 12)
        .reverse()
        .map(a => {
          const [, m, d] = (a.date || "").split("-");
          const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          return {
            date: m ? `${months[parseInt(m, 10) - 1]} ${d} ` : "?",
            score: a.parsed.healthScore.score,
            grade: a.parsed.healthScore.grade,
          };
        }),
    [history]
  );

  const spendData = useMemo(() => {
    const realAudits = history
      .filter(a => !a.isTest && a.form)
      .slice(0, 12)
      .reverse();
    return realAudits.map((a, i) => {
      const [, m, d] = (a.date || "").split("-");
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const budgetActuals = a.form?.budgetActuals;
      let spent = 0;
      if (budgetActuals && typeof budgetActuals === "object" && Object.keys(budgetActuals).length > 0) {
        spent = Object.values(budgetActuals).reduce((s, v) => s + (parseFloat(v) || 0), 0);
      } else if (i > 0) {
        const checking = parseFloat(a.form?.checking) || 0;
        const prev = parseFloat(realAudits[i - 1].form?.checking) || 0;
        const debtPayments = (a.form?.debts || []).reduce((s, dd) => {
          const prevDebt = (realAudits[i - 1].form?.debts || []).find(pd => pd.name === dd.name);
          if (prevDebt) return s + Math.max(0, (parseFloat(prevDebt.balance) || 0) - (parseFloat(dd.balance) || 0));
          return s;
        }, 0);
        spent = Math.max(0, prev - checking - debtPayments);
      }
      return { date: m ? `${months[parseInt(m, 10) - 1]} ${d} ` : "?", spent };
    });
  }, [history]);

  const chartA11y = useMemo(() => {
    const netWorthTrend = summarizeTrend(chartData, "nw", v => fmt(v));
    const healthTrend = summarizeTrend(scoreData, "score", v => `${Math.round(v)}`);
    const spendingTrend = summarizeTrend(spendData, "spent", v => fmt(v));
    return {
      netWorthLabel: `Net worth chart with ${chartData.length} points, trend ${netWorthTrend.change}. Start ${netWorthTrend.start ?? "N/A"}, end ${netWorthTrend.end ?? "N/A"}.`,
      netWorthHint:
        "This area chart shows net worth progression over recent audits. Upward movement indicates improving total assets minus debts.",
      healthLabel: `Health score chart with ${scoreData.length} points, trend ${healthTrend.change}. Start ${healthTrend.start ?? "N/A"}, end ${healthTrend.end ?? "N/A"}.`,
      healthHint:
        "This chart tracks the financial health score over time. Higher values indicate stronger liquidity, debt control, and savings discipline.",
      spendingLabel: `Weekly spending chart with ${spendData.length} points, trend ${spendingTrend.change}. Start ${spendingTrend.start ?? "N/A"}, end ${spendingTrend.end ?? "N/A"}.`,
      spendingHint: "This chart shows estimated weekly spending based on checking-balance changes between audits.",
    };
  }, [chartData, scoreData, spendData]);

  const freedomStats = useMemo(() => {
    // Demo mode: provide hardcoded freedom stats so Debt Freedom Countdown renders
    if (current?.isTest) {
      const freeDate = new Date();
      freeDate.setDate(freeDate.getDate() + Math.ceil(3690 / 400) * 7);
      return {
        freeDateStr: freeDate.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
        weeklyPaydown: 400,
      };
    }
    const result = { freeDateStr: null, weeklyPaydown: null };
    const realAudits = history.filter(a => !a.isTest && a.form);
    if (realAudits.length >= 2) {
      const recent = realAudits.slice(0, 6);
      const debtValues = recent
        .map(a => (a.form?.debts || []).reduce((s, d) => s + (parseFloat(d.balance) || 0), 0))
        .reverse();
      if (debtValues.length >= 2 && debtValues[0] > 100) {
        let totalPaydown = 0;
        let activeIntervals = 0;
        for (let i = 1; i < debtValues.length; i++) {
          const delta = debtValues[i - 1] - debtValues[i];
          if (delta > 0) {
            totalPaydown += delta;
            activeIntervals++;
          }
        }
        const weeklyPaydown = activeIntervals > 0 ? totalPaydown / activeIntervals : 0;
        const currentDebt = debtValues[debtValues.length - 1];
        if (weeklyPaydown > 10 && currentDebt > 0) {
          const weeksToFree = Math.ceil(currentDebt / weeklyPaydown);
          const freeDate = new Date();
          freeDate.setDate(freeDate.getDate() + weeksToFree * 7);
          result.freeDateStr = freeDate.toLocaleDateString("en-US", { month: "short", year: "numeric" });
          result.weeklyPaydown = weeklyPaydown;
        }
      }
    }
    return result;
  }, [history, current?.isTest]);

  // Predictive alerts
  const alerts = useMemo(() => {
    const result = [];

    // Demo mode: inject curated showcase alerts
    if (current?.isTest) {
      result.push(
        {
          icon: "🎯",
          color: T.status.green,
          title: "Debt-Free",
          text: `At $400/wk → ${freedomStats.freeDateStr || "Oct 2026"}`,
        },
        { icon: "📈", color: T.status.green, title: "Score Rising", text: "88 — 16pts above 6-week avg" },
        { icon: "💰", color: T.status.green, title: "Net Worth", text: "+$14,560 over last 6 audits" },
        { icon: "🏦", color: T.status.green, title: "Almost There", text: "$600 away from $25K saved" },
        { icon: "🛡️", color: T.status.purple, title: "Tax Shield", text: "$1,870 saved at 22%" }
      );
      return result;
    }

    const realAudits = history.filter(a => !a.isTest && a.form);
    if (realAudits.length >= 2) {
      const recent = realAudits.slice(0, 4);
      const checkingValues = recent.map(a => parseFloat(a.form?.checking) || 0).reverse();
      if (checkingValues.length >= 2) {
        const weeklyDelta =
          (checkingValues[checkingValues.length - 1] - checkingValues[0]) / (checkingValues.length - 1);
        if (weeklyDelta < -50) {
          const currentChecking = checkingValues[checkingValues.length - 1];
          const weeksToFloor = Math.ceil((currentChecking - floor) / Math.abs(weeklyDelta));
          if (weeksToFloor > 0 && weeksToFloor <= 6) {
            const breachDate = new Date();
            breachDate.setDate(breachDate.getDate() + weeksToFloor * 7);
            result.push({
              icon: "🚨",
              color: T.status.red,
              title: "Floor Breach Risk",
              text: `$${Math.abs(weeklyDelta).toFixed(0)}/wk burn → floor by ${breachDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
              pulse: true,
            });
          }
        }
      }
      const debtValues = recent
        .map(a => (a.form?.debts || []).reduce((s, d) => s + (parseFloat(d.balance) || 0), 0))
        .reverse();
      if (debtValues.length >= 2 && debtValues[0] > 100) {
        const weeklyPaydown = (debtValues[0] - debtValues[debtValues.length - 1]) / (debtValues.length - 1);
        if (weeklyPaydown > 10) {
          const freeDate = new Date();
          freeDate.setDate(freeDate.getDate() + Math.ceil(debtValues[debtValues.length - 1] / weeklyPaydown) * 7);
          result.push({
            icon: "🎯",
            color: T.status.green,
            title: "Debt-Free",
            text: `At $${weeklyPaydown.toFixed(0)}/wk → ${freeDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`,
          });
        }
      }
      const scores = recent
        .filter(a => a.parsed?.healthScore?.score != null)
        .map(a => a.parsed.healthScore.score)
        .reverse();
      if (scores.length >= 3) {
        const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
        const latest = scores[scores.length - 1];
        if (latest < avg - 5)
          result.push({
            icon: "📉",
            color: T.status.amber,
            title: "Score Drop",
            text: `${latest} — below ${Math.round(avg)} avg`,
          });
        else if (latest > avg + 5 && latest >= 70)
          result.push({
            icon: "📈",
            color: T.status.green,
            title: "Score Rising",
            text: `${latest} — ${Math.round(latest - avg)}pts above avg`,
          });
      }
      if (
        financialConfig?.track401k &&
        financialConfig?.k401ContributedYTD > 0 &&
        financialConfig?.taxBracketPercent > 0
      ) {
        const taxSaved = financialConfig.k401ContributedYTD * (financialConfig.taxBracketPercent / 100);
        result.push({
          icon: "🛡️",
          color: T.status.purple,
          title: "Tax Shield",
          text: `${fmt(taxSaved)} saved at ${financialConfig.taxBracketPercent}% `,
        });
      }
      const nwAudits = realAudits.filter(a => a.parsed?.netWorth != null).slice(0, 4);
      if (nwAudits.length >= 2) {
        const latestNW = nwAudits[0].parsed.netWorth;
        const oldestNW = nwAudits[nwAudits.length - 1].parsed.netWorth;
        const delta = latestNW - oldestNW;
        if (Math.abs(delta) > 50) {
          const up = delta > 0;
          result.push({
            icon: up ? "💰" : "📉",
            color: up ? T.status.green : T.status.amber,
            title: "Net Worth",
            text: `${up ? "+" : ""}${fmt(delta)} over last ${nwAudits.length} audits`,
          });
        }
      }
      if (realAudits.length >= 2) {
        const latest = realAudits[0];
        const prev = realAudits[1];
        const lScore = latest.parsed?.healthScore?.score;
        const pScore = prev.parsed?.healthScore?.score;
        if (lScore != null && pScore != null && Math.abs(lScore - pScore) >= 3) {
          const lForm = latest.form || {};
          const pForm = prev.form || {};
          const factors = [];
          const lChecking = parseFloat(lForm.checking) || 0;
          const pChecking = parseFloat(pForm.checking) || 0;
          if (Math.abs(lChecking - pChecking) > 100) factors.push({ name: "checking", delta: lChecking - pChecking });
          const lDebt = (lForm.debts || []).reduce((s, d) => s + (parseFloat(d.balance) || 0), 0);
          const pDebt = (pForm.debts || []).reduce((s, d) => s + (parseFloat(d.balance) || 0), 0);
          if (Math.abs(lDebt - pDebt) > 50) factors.push({ name: "debt", delta: pDebt - lDebt });
          const lSave = parseFloat(lForm.ally || lForm.savings) || 0;
          const pSave = parseFloat(pForm.ally || pForm.savings) || 0;
          if (Math.abs(lSave - pSave) > 50) factors.push({ name: "savings", delta: lSave - pSave });
          if (factors.length > 0) {
            const biggest = factors.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
            const labels = { checking: "Cash flow", debt: "Debt paydown", savings: "Savings growth" };
            const up = lScore > pScore;
            result.push({
              icon: up ? "⚡" : "🔍",
              color: up ? T.status.green : T.status.amber,
              title: `Score ${up ? "+" : ""}${lScore - pScore} `,
              text: `Driven by ${labels[biggest.name] || biggest.name} `,
            });
          }
        }
      }

      // ── Savings Milestone Proximity ──────────────────────
      const currentSavings = parseFloat(realAudits[0]?.form?.ally || realAudits[0]?.form?.savings) || 0;
      if (currentSavings > 0) {
        const milestones = [1000, 5000, 10000, 25000, 50000, 100000];
        for (const m of milestones) {
          const gap = m - currentSavings;
          if (gap > 0 && gap <= 500 && currentSavings >= m * 0.5) {
            const label = m >= 1000 ? `$${m / 1000}K` : `$${m}`;
            result.push({
              icon: "🏦",
              color: T.status.green,
              title: "Almost There",
              text: `$${Math.round(gap)} away from ${label} saved`,
            });
            break;
          }
        }
      }

      // ── Promo APR Expiration Warning ─────────────────────
      const today = new Date().toISOString().split("T")[0];
      (cards || []).forEach(c => {
        if (c.hasPromoApr && c.promoAprExp) {
          const daysLeft = Math.round((new Date(c.promoAprExp) - new Date(today)) / 86400000);
          if (daysLeft > 0 && daysLeft <= 60) {
            const name = (c.nickname || c.name || "Card").split(" ").slice(0, 3).join(" ");
            result.push({
              icon: "⏰",
              color: T.status.amber,
              title: "Promo Ending",
              text: `${name} promo expires in ${daysLeft}d`,
              pulse: daysLeft <= 14,
            });
          }
        }
      });

      // ── Spending Velocity Anomaly ────────────────────────
      if (spendData.length >= 3) {
        const recentSpend = spendData[spendData.length - 1]?.spent || 0;
        const priorSpends = spendData
          .slice(0, -1)
          .map(s => s.spent)
          .filter(v => v > 0);
        if (priorSpends.length >= 2 && recentSpend > 0) {
          const avgPrior = priorSpends.reduce((s, v) => s + v, 0) / priorSpends.length;
          if (avgPrior > 50 && recentSpend > avgPrior * 1.5) {
            const pct = Math.round(((recentSpend - avgPrior) / avgPrior) * 100);
            result.push({
              icon: "🔥",
              color: T.status.red,
              title: "Spending Spike",
              text: `${pct}% above your ${priorSpends.length}-week average`,
            });
          }
        }
      }

      // ── Renewal Cost Increase Detection ─────────────────
      if (realAudits.length >= 2) {
        const calcRenewalTotal = form => {
          const rens = form?.renewals || [];
          return rens.reduce((sum, r) => {
            const amt = parseFloat(r.amount) || 0;
            const interval = r.interval || 1;
            const unit = r.intervalUnit || "months";
            if (unit === "months") return sum + amt / interval;
            if (unit === "weeks") return sum + (amt / interval) * 4.33;
            if (unit === "years") return sum + amt / (interval * 12);
            if (unit === "one-time") return sum;
            return sum + amt;
          }, 0);
        };
        const latestRenTotal = calcRenewalTotal(realAudits[0].form);
        const prevRenTotal = calcRenewalTotal(realAudits[1].form);
        if (prevRenTotal > 0 && latestRenTotal > prevRenTotal) {
          const increase = latestRenTotal - prevRenTotal;
          const pctIncrease = (increase / prevRenTotal) * 100;
          if (increase > 25 || pctIncrease > 15) {
            result.push({
              icon: "📊",
              color: T.status.amber,
              title: "Bills Up",
              text: `Monthly bills +$${Math.round(increase)} vs last audit`,
            });
          }
        }
      }
    }
    return result;
  }, [history, floor, financialConfig, cards, spendData]);

  return {
    dashboardMetrics,
    fallbackChecking,
    floor,
    investmentSnapshot,
    fireProjection,
    streak,
    noSpendStreak,
    chartData,
    scoreData,
    spendData,
    chartA11y,
    freedomStats,
    alerts,
  };
}
