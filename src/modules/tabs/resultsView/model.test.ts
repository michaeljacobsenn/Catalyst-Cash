import { describe, expect, it } from "vitest";

import type { AuditRecord } from "../../../types/index.js";

import {
  buildActionPreviewRows,
  buildAllocationLedger,
  buildAnalysisNotes,
  buildFreedomJourneyMetrics,
  buildResultsInvestmentsSummary,
  cleanAllocationLead,
} from "./model";

describe("resultsView model", () => {
  it("builds compact action preview rows from move metadata", () => {
    expect(
      buildActionPreviewRows([
        {
          text: "Reserve cash",
          done: false,
          amount: 250,
          targetLabel: "Tax fund",
          detail: "Keep $250.00 in Checking for Tax fund. It is reserved for 2026-05-01.",
          routeLabel: "Keep in Checking",
        },
      ])
    ).toEqual([
      {
        label: "Tax fund",
        amount: "$250.00",
        date: "2026-05-01",
        detail: "Keep $250.00 in Checking for Tax fund. It is reserved for 2026-05-01.",
        route: "Keep in Checking",
      },
    ]);
  });

  it("cleans allocation filler from the next-action lead", () => {
    expect(
      cleanAllocationLead(
        "Hold $500 for bills ($500 by 2026-05-01). Only dollars left after those allocations can go to debt payoff or savings."
      )
    ).toBe("");
  });

  it("builds the visible allocation ledger in priority order", () => {
    expect(
      buildAllocationLedger({
        currentLiquidCash: 3200,
        protectedAllocatedNow: 900,
        optionalAllocatedNow: 250,
        remainingCheckingPool: 300,
        remainingVaultPool: 700,
        protectedGapNow: 125,
      })
    ).toEqual([
      { label: "Liquid now", value: "$3200.00" },
      { label: "Protected now", value: "$900.00" },
      { label: "Optional deploy", value: "$250.00" },
      { label: "Still parked", value: "$1000.00" },
      { label: "Protected gap", value: "$125.00" },
    ]);
  });

  it("reanchors investment balance to the submitted snapshot when only selected keys were included", () => {
    const audit = {
      date: "2026-04-16",
      ts: "2026-04-16T12:00:00.000Z",
      isTest: false,
      form: {
        date: "2026-04-16",
        includedInvestmentKeys: ["roth", "k401"],
        investmentSnapshot: {
          roth: 5000,
          brokerage: 999999,
          k401Balance: 12000,
        },
      },
    } as AuditRecord;

    const { investmentsSummary, showInvestmentNetWorthAnchor } = buildResultsInvestmentsSummary(audit, {
      balance: "$17000.00",
      asOf: "old",
      gateStatus: "Open",
      netWorth: "$17000.00",
    });

    expect(investmentsSummary).toMatchObject({
      balance: "$17000.00",
      asOf: "2026-04-16",
      gateStatus: "Open",
      netWorth: "$17000.00",
    });
    expect(showInvestmentNetWorthAnchor).toBe(true);
  });

  it("builds degraded analysis notes only when degraded mode is active", () => {
    expect(
      buildAnalysisNotes(true, { qualityScore: "Native score only", autoUpdates: "Auto-updates skipped" }, "AI timeout")
    ).toBe("Native score only\n\nAuto-updates skipped\n\nAI timeout");
    expect(buildAnalysisNotes(false, { qualityScore: "Ignored" }, "Ignored")).toBe("");
  });

  it("derives freedom-journey metrics from audit history", () => {
    const history = [
      {
        date: "2026-04-16",
        ts: "2026-04-16T12:00:00.000Z",
        isTest: false,
        form: {
          date: "2026-04-16",
          checking: 2400,
          savings: 1500,
          ally: 1500,
          debts: [{ balance: 4000 }],
        },
        parsed: {
          netWorth: 5000,
          healthScore: { score: 83 },
        },
      },
      {
        date: "2026-04-09",
        ts: "2026-04-09T12:00:00.000Z",
        isTest: false,
        form: {
          date: "2026-04-09",
          checking: 1800,
          savings: 1100,
          ally: 1100,
          debts: [{ balance: 4700 }],
        },
        parsed: {
          netWorth: 4300,
          healthScore: { score: 79 },
        },
      },
    ] as AuditRecord[];

    const metrics = buildFreedomJourneyMetrics(history);

    expect(metrics).toEqual([
      expect.objectContaining({
        key: "debt-free",
        label: "Projected Debt-Free",
        tone: "positive",
      }),
      {
        key: "net-worth",
        label: "Net Worth vs Last Audit",
        value: "+$700",
        tone: "positive",
      },
      {
        key: "score-driver",
        label: "Score Movement (+4)",
        value: "Driven by Debt Paydown",
        tone: "positive",
      },
    ]);
  });
});
