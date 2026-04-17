import { describe, expect, it } from "vitest";

import type { AuditRecord, ParsedMoveItem } from "../../../types/index.js";

import {
  buildActionPreviewRows,
  buildAuditHandlingNotes,
  buildAllocationLedger,
  buildAnalysisNotes,
  buildFreedomJourneyMetrics,
  buildResultsOverview,
  buildResultsInvestmentsSummary,
  buildTacticalPlaybookData,
  cleanAllocationLead,
  describeTacticalPlaybookFallback,
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

  it("accepts string amounts when building compact action preview rows", () => {
    expect(
      buildActionPreviewRows([
        {
          text: "Route tax cash",
          done: false,
          amount: "$425.00",
          title: "Tax fund",
          detail: "Keep $425.00 in Checking for estimated taxes.",
        },
      ] as unknown as ParsedMoveItem[])
    ).toEqual([
      {
        label: "Tax fund",
        amount: "$425.00",
        date: "",
        detail: "Keep $425.00 in Checking for estimated taxes.",
        route: "",
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

  it("recovers tactical playbook rows from structured weekly moves when move items are missing", () => {
    expect(
      buildTacticalPlaybookData({
        moveItems: [],
        structuredWeeklyMoves: [
          {
            title: "Protect tax cash",
            detail: "Keep $425 in Checking for the NY tax gap.",
            amount: "$425.00",
            priority: "required",
          },
        ],
      })
    ).toEqual({
      items: [
        {
          done: false,
          text: "Keep $425 in Checking for the NY tax gap.",
          title: "Protect tax cash",
          detail: "Keep $425 in Checking for the NY tax gap.",
          amount: 425,
          tag: "REQUIRED",
          semanticKind: null,
          targetLabel: null,
          sourceLabel: null,
          routeLabel: null,
          fundingLabel: null,
          targetKey: null,
          contributionKey: null,
          transactional: false,
        },
      ],
      fallbackSource: "structured-weekly-moves",
    });
  });

  it("falls back to section move text when no structured playbook exists", () => {
    expect(
      buildTacticalPlaybookData({
        moveItems: [],
        structuredWeeklyMoves: [],
        weeklyMoves: [],
        sectionMoves: "- Keep checking above $900\n- Route $250 to Blue Cash Everyday",
      })
    ).toEqual({
      items: [
        {
          done: false,
          text: "Keep checking above $900",
          title: "Keep checking above $900",
          detail: "",
          tag: null,
          semanticKind: null,
          targetLabel: null,
          sourceLabel: null,
          routeLabel: null,
          fundingLabel: null,
          targetKey: null,
          contributionKey: null,
          transactional: false,
        },
        {
          done: false,
          text: "Route $250 to Blue Cash Everyday",
          title: "Route $250 to Blue Cash Everyday",
          detail: "",
          amount: 250,
          tag: null,
          semanticKind: null,
          targetLabel: null,
          sourceLabel: null,
          routeLabel: null,
          fundingLabel: null,
          targetKey: null,
          contributionKey: null,
          transactional: false,
        },
      ],
      fallbackSource: "section-moves",
    });
  });

  it("describes tactical playbook recovery sources accurately", () => {
    expect(describeTacticalPlaybookFallback("structured-weekly-moves")).toEqual({
      subtitle: "Recovered from the structured weekly plan",
      message: "The provider returned a thinner move payload, so Catalyst rebuilt this checklist from the structured weekly plan before rendering it.",
    });
    expect(describeTacticalPlaybookFallback("legacy-weekly-moves")).toEqual({
      subtitle: "Recovered from the weekly move list",
      message: "The provider omitted structured move rows, so Catalyst rebuilt this checklist from the legacy weekly move list before rendering it.",
    });
    expect(describeTacticalPlaybookFallback("section-moves")).toEqual({
      subtitle: "Recovered from the audit narrative",
      message: "The provider omitted structured move rows, so Catalyst rebuilt this checklist from the move narrative before rendering it.",
    });
    expect(describeTacticalPlaybookFallback(null)).toEqual({
      subtitle: "Execute in this order",
      message: "",
    });
  });

  it("builds a stable top-level results overview from sparse native inputs", () => {
    expect(
      buildResultsOverview({
        status: "YELLOW",
        healthScore: { score: 74, grade: "C", trend: "flat", summary: "Protect near-term cash first." },
        headerCard: { status: "YELLOW", subtitle: "Reserve obligations before extra debt.", confidence: "medium" },
        dashboardCard: [
          { category: "Checking", amount: "$1,240.00", status: "Tight" },
          { category: "Available", amount: "$260.00", status: "Protected" },
          { category: "Debts", amount: "$8,800.00", status: "Tracked" },
        ],
        moveCount: 3,
        handlingBadgeLabel: "Normalized",
      })
    ).toEqual({
      summary: "Protect near-term cash first.",
      score: "74",
      grade: "C",
      scoreTone: "amber",
      statusLabel: "Watch",
      statusTone: "amber",
      confidenceLabel: "Medium confidence",
      modeLabel: "Normalized",
      metrics: [
        { label: "Available", value: "$260.00", tone: "green" },
        { label: "Debts", value: "$8,800.00", tone: "red" },
        { label: "Moves", value: "3 queued", tone: "blue" },
      ],
    });
  });

  it("builds audit handling notes for repaired non-degraded audits", () => {
    expect(
      buildAuditHandlingNotes({
        isDegraded: false,
        auditFlags: [
          {
            code: "dashboard-repaired-to-native-anchors",
            severity: "medium",
            message: "Dashboard summary was rebuilt from native anchors.",
          },
        ],
        consistency: {
          scoreAnchoredToNative: true,
          deterministicPlanReanchored: true,
        },
      })
    ).toEqual({
      content: [
        "- Health score was re-anchored to Catalyst's native math before rendering.",
        "- Dashboard totals were rebuilt from native cash and debt anchors because the model output drifted.",
        "- The weekly move plan was normalized against Catalyst's deterministic allocation engine before display.",
        "- Dashboard summary was rebuilt from native anchors.",
      ].join("\n"),
      badgeLabel: "Normalized",
      accentColor: "teal",
    });
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
