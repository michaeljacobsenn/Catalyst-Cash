import { describe, expect, it } from "vitest";

import { extractDashboardMetrics } from "./auditExportMetrics.js";

describe("auditExportMetrics", () => {
  it("reads structured dashboard card amounts when present", () => {
    expect(
      extractDashboardMetrics({
        dashboardCard: [
          { category: "Checking", amount: "$1,250" },
          { category: "Vault", amount: "$3,400" },
          { category: "Pending", amount: "$220" },
          { category: "Debts", amount: "$5,100" },
          { category: "Available", amount: "$780" },
        ],
      })
    ).toEqual({
      checking: 1250,
      vault: 3400,
      investments: null,
      otherAssets: null,
      pending: 220,
      debts: 5100,
      available: 780,
    });
  });

  it("falls back to legacy dashboard fields when card rows are missing", () => {
    expect(
      extractDashboardMetrics({
        structured: {
          dashboard: {
            checkingBalance: "$900",
            savingsVaultTotal: "$1,800",
            next7DaysNeed: "$140",
            checkingProjEnd: "$620",
          },
        },
      })
    ).toEqual({
      checking: 900,
      vault: 1800,
      pending: 140,
      debts: null,
      available: 620,
    });
  });

  it("parses negative legacy values wrapped in parentheses", () => {
    expect(
      extractDashboardMetrics({
        structured: {
          dashboard: {
            checkingBalance: "($125.50)",
          },
        },
      })
    ).toMatchObject({
      checking: -125.5,
    });
  });
});
