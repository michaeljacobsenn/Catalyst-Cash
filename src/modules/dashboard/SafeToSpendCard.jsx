import React, { useMemo } from "react";
import { T } from "../constants.js";
import { Card } from "../ui.jsx";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { usePortfolio } from "../contexts/PortfolioContext";
import { useSettings } from "../contexts/SettingsContext";

function getDaysUntil(nextDueStr) {
  if (!nextDueStr || nextDueStr.length !== 5) return 999;
  const [mm, dd] = nextDueStr.split("/").map(Number);
  if (!mm || !dd || mm < 1 || mm > 12 || dd < 1 || dd > 31) return 999;

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  let dueYear = now.getFullYear();
  let dueDate = new Date(dueYear, mm - 1, dd);

  // If the due date has already passed, advance to next year's occurrence
  if (dueDate < now) {
    dueDate.setFullYear(dueYear + 1);
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.ceil((dueDate - now) / msPerDay);
}

export function SafeToSpendCard({ theme, spendableCash, ccDebt }) {
  const { renewals } = usePortfolio();
  const { financialConfig } = useSettings();

  const floor =
    (Number.isFinite(financialConfig?.weeklySpendAllowance) ? financialConfig.weeklySpendAllowance : 0) +
    (Number.isFinite(financialConfig?.emergencyFloor) ? financialConfig.emergencyFloor : 0);

  // 1. Spendable Cash = Checking accounts only (NOT savings/vault)
  const totalCash = spendableCash != null ? spendableCash : 0;

  // 2. Upcoming Bills (Next 30 Days) — renewals/subscriptions
  const upcomingBills = useMemo(() => {
    let upcomingTotal = 0;
    (renewals || []).forEach((sub) => {
      if (!sub.isCancelled && !sub.archivedAt && sub.amount > 0) {
        const days = getDaysUntil(sub.nextDue);
        if (days <= 30) {
          upcomingTotal += sub.amount;
        }
      }
    });
    return upcomingTotal;
  }, [renewals]);

  // 3. Credit card minimum payments due (approximate: 1% of balance or $25, whichever is greater)
  const ccMinimums = useMemo(() => {
    if (!ccDebt || ccDebt <= 0) return 0;
    return Math.max(ccDebt * 0.01, 25);
  }, [ccDebt]);

  const totalDeductions = upcomingBills + ccMinimums + floor;
  const safeToSpend = totalCash - totalDeductions;

  // Dynamic Styling based on safety ratio
  const isDanger = totalCash <= 0 || safeToSpend <= 0 || safeToSpend < (totalCash * 0.1);
  const isWarning = !isDanger && safeToSpend < (totalCash * 0.3);

  const mainColor = isDanger ? T.status.red : isWarning ? T.status.orange : T.status.green;
  const bgWarning = isDanger ? `${T.status.red}10` : isWarning ? `${T.status.orange}10` : `${T.status.green}10`;

  // Build deductions breakdown text
  const parts = [];
  if (upcomingBills > 0) parts.push(`$${upcomingBills.toLocaleString(undefined, { maximumFractionDigits: 0 })} bills`);
  if (ccMinimums > 0) parts.push(`$${Math.round(ccMinimums).toLocaleString()} CC min`);
  if (floor > 0) parts.push(`$${floor.toLocaleString()} floor`);
  const deductionText = parts.length > 0
    ? `Checking minus ${parts.join(" + ")}`
    : "No upcoming deductions detected";

  return (
    <Card variant="glass" style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "18px 20px",
      border: `1px solid ${T.border.subtle}`,
      background: T.bg.card,
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: mainColor }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, letterSpacing: "-0.01em" }}>
            Safe to Spend
          </span>
        </div>
        <span style={{ fontSize: 12, color: T.text.dim, lineHeight: 1.3 }}>
          {deductionText}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
        <span style={{ fontSize: 24, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.04em", fontFamily: T.font.mono }}>
          ${Math.max(0, safeToSpend).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </span>
      </div>
    </Card>
  );
}
