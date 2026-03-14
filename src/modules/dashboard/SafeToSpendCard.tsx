import React, { useMemo } from "react";
import { T } from "../constants.js";
import { Card } from "../ui.js";
import { usePortfolio } from "../contexts/PortfolioContext.js";
import { useSettings } from "../contexts/SettingsContext.js";
import { buildDashboardSafetyModel } from "./safetyModel.js";

export function SafeToSpendCard({ theme, spendableCash, ccDebt }) {
  const { renewals, cards } = usePortfolio();
  const { financialConfig } = useSettings();

  const floor =
    (Number.isFinite(financialConfig?.weeklySpendAllowance) ? financialConfig.weeklySpendAllowance : 0) +
    (Number.isFinite(financialConfig?.emergencyFloor) ? financialConfig.emergencyFloor : 0);

  const safetySnapshot = useMemo(
    () =>
      buildDashboardSafetyModel({
        spendableCash,
        floor,
        weeklySpendAllowance: financialConfig?.weeklySpendAllowance,
        renewals,
        cards,
      }),
    [spendableCash, floor, financialConfig?.weeklySpendAllowance, renewals, cards]
  );

  const fallbackMinimum = ccDebt && ccDebt > 0 ? Math.max(ccDebt * 0.01, 25) : 0;
  const cardMinimums = safetySnapshot.cardMinimums || fallbackMinimum;
  const mainColor =
    safetySnapshot.level === "urgent"
      ? T.status.red
      : safetySnapshot.level === "caution"
        ? T.status.amber
        : T.status.green;

  // Build deductions breakdown text
  const parts: string[] = [];
  if (safetySnapshot.upcomingBills30d > 0) {
    parts.push(`$${safetySnapshot.upcomingBills30d.toLocaleString(undefined, { maximumFractionDigits: 0 })} bills`);
  }
  if (cardMinimums > 0) parts.push(`$${Math.round(cardMinimums).toLocaleString()} CC min`);
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
          ${Math.max(0, safetySnapshot.safeToSpend).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </span>
      </div>
    </Card>
  );
}
