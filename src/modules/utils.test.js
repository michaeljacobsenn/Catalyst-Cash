import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Mock Capacitor modules before importing utils
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn(() => Promise.resolve({ value: null })),
    set: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
    keys: vi.fn(() => Promise.resolve({ keys: [] })),
    clear: vi.fn(() => Promise.resolve()),
  },
}));
vi.mock("@capacitor/share", () => ({ Share: { share: vi.fn() } }));
vi.mock("@capacitor/filesystem", () => ({
  Filesystem: { writeFile: vi.fn() },
  Directory: { Cache: "CACHE" },
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
  registerPlugin: () => ({}),
}));
vi.mock("./constants.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, APP_VERSION: "2.0.0-test" };
});
vi.mock("./contexts/AuditContext.js", () => ({
  useAudit: () => ({ history: [] }),
}));
vi.mock("./contexts/NavigationContext.js", () => ({
  useNavigation: () => ({ navTo: vi.fn() }),
}));
vi.mock("./contexts/PortfolioContext.js", () => ({
  usePortfolio: () => ({ cards: [], bankAccounts: [] }),
}));
vi.mock("./contexts/SettingsContext.js", () => ({
  useSettings: () => ({ financialConfig: {} }),
}));

import {
  parseCurrency,
  parseAudit,
  validateParsedAuditConsistency,
  buildDegradedParsedAudit,
  detectAuditDrift,
  advanceExpiredDate,
  cyrb53,
  fmt,
  fmtDate,
  extractDashboardMetrics,
} from "./utils.js";
import ResultsView from "./tabs/ResultsView.tsx";
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════════
// parseCurrency
// ═══════════════════════════════════════════════════════════════
describe("parseCurrency", () => {
  it("parses dollar strings", () => {
    expect(parseCurrency("$1,234.56")).toBe(1234.56);
    expect(parseCurrency("$0.99")).toBe(0.99);
  });

  it("parses negative/accounting notation", () => {
    expect(parseCurrency("-$500.00")).toBe(-500);
    expect(parseCurrency("($500.00)")).toBe(-500);
  });

  it("parses plain numbers", () => {
    expect(parseCurrency(42.5)).toBe(42.5);
    expect(parseCurrency("100")).toBe(100);
  });

  it("returns null for invalid inputs", () => {
    expect(parseCurrency(null)).toBeNull();
    expect(parseCurrency("")).toBeNull();
    expect(parseCurrency(NaN)).toBeNull();
    expect(parseCurrency(Infinity)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// parseAudit / parseJSON
// ═══════════════════════════════════════════════════════════════
describe("parseAudit", () => {
  it("parses valid JSON audit response", () => {
    const raw = JSON.stringify({
      headerCard: { status: "GREEN", details: ["Test"] },
      liquidNetWorth: "$3,200.00",
      healthScore: { score: 85, grade: "B+", trend: "up", summary: "Good" },
      dashboardCard: [{ category: "Checking", amount: "$5,000.00", status: "OK" }],
      weeklyMoves: ["Pay rent", "Save $500"],
      nextAction: "Do the thing.",
      alertsCard: ["Warning 1"],
      radar: [],
      longRangeRadar: [],
      milestones: [],
      investments: { balance: "$10,000", asOf: "2024-01-01", gateStatus: "Open" },
    });

    const parsed = parseAudit(raw);
    expect(parsed).not.toBeNull();
    expect(parsed.status).toBe("GREEN");
    expect(parsed.liquidNetWorth).toBe(3200);
    expect(parsed.healthScore.score).toBe(85);
    expect(parsed.moveItems).toHaveLength(2);
    expect(parsed.sections.header).toContain("GREEN");
  });

  it("handles markdown-wrapped JSON", () => {
    const raw =
      "```json\n" +
      JSON.stringify({
        headerCard: { status: "YELLOW" },
        weeklyMoves: ["Move 1"],
        nextAction: "Act now.",
        alertsCard: [],
        dashboardCard: [],
        radar: [],
        longRangeRadar: [],
        milestones: [],
        investments: {},
      }) +
      "\n```";

    const parsed = parseAudit(raw);
    expect(parsed).not.toBeNull();
    expect(parsed.status).toBe("YELLOW");
  });

  it("handles snake_case keys from Gemini", () => {
    const raw = JSON.stringify({
      header_card: { status: "RED" },
      health_score: { score: 60, grade: "D", trend: "down", summary: "Bad" },
      weekly_moves: ["Fix budget"],
      next_action: "Cut spending.",
      alerts_card: [],
      dashboard_card: [],
    });

    const parsed = parseAudit(raw);
    expect(parsed).not.toBeNull();
    expect(parsed.status).toBe("RED");
    expect(parsed.healthScore.score).toBe(60);
    expect(parsed.weeklyMoves).toEqual(["Fix budget"]);
    expect(parsed.structured.nextAction).toEqual({
      title: "Next Action",
      detail: "Cut spending.",
      amount: null,
    });
  });

  it("normalizes hostile imported statuses instead of preserving raw markup", () => {
    const raw = JSON.stringify({
      headerCard: { status: '<img src=x onerror="alert(1)">' },
      weeklyMoves: ["Move 1"],
      nextAction: "Act now.",
      alertsCard: [],
      dashboardCard: [],
      radar: [],
      longRangeRadar: [],
      milestones: [],
      investments: {},
    });

    const parsed = parseAudit(raw);
    expect(parsed).not.toBeNull();
    expect(parsed.status).toBe("UNKNOWN");
    expect(parsed.sections.header).toContain("UNKNOWN");
    expect(parsed.sections.header).not.toContain("<img");
  });

  it("normalizes health score grade and trend from AI output", () => {
    const raw = JSON.stringify({
      headerCard: { status: "YELLOW" },
      healthScore: { score: 84.7, grade: "F", trend: "sideways", summary: "  Off by one  " },
      weeklyMoves: ["Move 1"],
      nextAction: "Act now.",
      alertsCard: [],
      dashboardCard: [],
      radar: [],
      longRangeRadar: [],
      milestones: [],
      investments: {},
    });

    const parsed = parseAudit(raw);
    expect(parsed).not.toBeNull();
    expect(parsed.healthScore.score).toBe(85);
    expect(parsed.healthScore.grade).toBe("B");
    expect(parsed.healthScore.trend).toBe("flat");
    expect(parsed.healthScore.summary).toBe("Off by one");
    expect(parsed.auditFlags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "health-score-grade-corrected" }),
      ])
    );
  });

  it("normalizes weekly moves and alerts to trimmed string arrays", () => {
    const raw = JSON.stringify({
      headerCard: { status: "GREEN" },
      healthScore: { score: 80, grade: "B-", trend: "up", summary: "Solid." },
      weeklyMoves: ["  Pay card  ", "", null, "Save $50"],
      alertsCard: ["  Watch cash flow  ", 123, ""],
      nextAction: "Act now.",
      dashboardCard: [],
      radar: [],
      longRangeRadar: [],
      milestones: [],
      investments: {},
    });

    const parsed = parseAudit(raw);
    expect(parsed).not.toBeNull();
    expect(parsed.moveItems).toEqual([
      { tag: null, text: "Pay card", done: false },
      { tag: null, text: "Save $50", done: false },
    ]);
    expect(parsed.sections.alerts).toContain("Watch cash flow");
  });

  it("preserves structured move item metadata when the audit returns explicit move objects", () => {
    const raw = JSON.stringify({
      headerCard: { status: "GREEN" },
      healthScore: { score: 80, grade: "B-", trend: "up", summary: "Solid." },
      weeklyMoves: ["Transfer $250 from savings to checking."],
      moveItems: [
        {
          text: "Transfer $250 from savings to checking.",
          semanticKind: "bank-checking-increase",
          amount: 250,
          targetLabel: "Checking",
          sourceLabel: "Savings",
          transactional: true,
        },
      ],
      alertsCard: [],
      nextAction: "Act now.",
      dashboardCard: [],
      radar: [],
      longRangeRadar: [],
      milestones: [],
      investments: {},
    });

    const parsed = parseAudit(raw);
    expect(parsed).not.toBeNull();
    expect(parsed.moveItems).toEqual([
      {
        tag: null,
        text: "Transfer $250 from savings to checking.",
        done: false,
        semanticKind: "bank-checking-increase",
        amount: 250,
        targetLabel: "Checking",
        sourceLabel: "Savings",
        transactional: true,
      },
    ]);
  });

  it("derives structured move items from object-based weeklyMoves output", () => {
    const raw = JSON.stringify({
      headerCard: { status: "GREEN" },
      healthScore: { score: 82, grade: "B", trend: "up", summary: "Solid." },
      weeklyMoves: [
        {
          title: "Protect checking floor",
          detail: "Transfer $250 from savings to checking to protect your floor.",
          amount: "$250.00",
          priority: "required",
          semanticKind: "bank-checking-increase",
          targetLabel: "Checking",
          sourceLabel: "Savings",
          transactional: true,
        },
      ],
      alertsCard: [],
      nextAction: "Act now.",
      dashboardCard: [],
      radar: [],
      longRangeRadar: [],
      milestones: [],
      investments: {},
    });

    const parsed = parseAudit(raw);
    expect(parsed).not.toBeNull();
    expect(parsed.weeklyMoves).toEqual(["Transfer $250 from savings to checking to protect your floor."]);
    expect(parsed.moveItems).toEqual([
      {
        tag: "REQUIRED",
        text: "Transfer $250 from savings to checking to protect your floor.",
        done: false,
        amount: 250,
        semanticKind: "bank-checking-increase",
        targetLabel: "Checking",
        sourceLabel: "Savings",
        transactional: true,
      },
    ]);
  });

  it("normalizes object-based alerts, radar buckets, and next action cards", () => {
    const raw = JSON.stringify({
      headerCard: { title: "Weekly Briefing", subtitle: "Floor protected", status: "YELLOW", confidence: "medium" },
      healthScore: { score: 74, grade: "C", trend: "flat", summary: "Cash is tight but stable." },
      alertsCard: [{ level: "critical", title: "Protect liquidity", detail: "Checking is close to the floor." }],
      dashboardCard: [
        { category: "Checking", amount: "$783.56", status: "Tracked" },
        { category: "Vault", amount: "$2,155.39", status: "Tracked" },
        { category: "Pending", amount: "$0.00", status: "Clear" },
        { category: "Debts", amount: "$3,753.96", status: "Tracked" },
        { category: "Available", amount: "$0.00", status: "Protected" },
      ],
      weeklyMoves: [{ title: "Protect floor", detail: "Transfer $250 to checking.", amount: "$250.00", priority: "required" }],
      moveItems: [{ text: "Transfer $250 to checking.", amount: 250, tag: "REQUIRED", semanticKind: "bank-checking-increase", targetLabel: "Checking", sourceLabel: "Savings", targetKey: null, contributionKey: null, transactional: true }],
      radar: {
        next90Days: [{ item: "NY tax bill", amount: "$1,150.00", date: "2026-04-07" }],
        longRange: [{ item: "Emergency fund target", amount: "$2,500.00", date: "2026-06-01" }],
      },
      nextAction: { title: "Protect checking", detail: "Transfer $250 from savings to checking.", amount: "$250.00" },
      investments: { balance: "$5,809.31", asOf: "2026-03-29", gateStatus: "Guarded", netWorth: "$4,994.30", cryptoValue: null },
      assumptions: ["Recent spending excluded from this run."],
      spendingAnalysis: null,
    });

    const parsed = parseAudit(raw);
    expect(parsed).not.toBeNull();
    expect(parsed.alertsCard).toEqual(["❗ Protect liquidity — Checking is close to the floor."]);
    expect(parsed.sections.nextAction).toContain("Protect checking");
    expect(parsed.structured.radar.next90Days).toHaveLength(1);
    expect(parsed.structured.nextAction).toEqual({
      title: "Protect checking",
      detail: "Transfer $250 from savings to checking.",
      amount: "$250.00",
    });
  });

  it("normalizes dashboardCard to the stable 5-row order", () => {
    const raw = JSON.stringify({
      headerCard: { status: "GREEN" },
      healthScore: { score: 80, grade: "B-", trend: "up", summary: "Solid." },
      dashboardCard: [
        { category: "Debts", amount: "$1,200.00", status: "Paying down" },
        { category: "Checking", amount: "$4,000.00", status: "Safe" },
      ],
      weeklyMoves: ["Move 1"],
      alertsCard: [],
      nextAction: "Act now.",
      radar: [],
      longRangeRadar: [],
      milestones: [],
      investments: {},
    });

    const parsed = parseAudit(raw);
    expect(parsed).not.toBeNull();
    expect(parsed.dashboardCard.map(row => row.category)).toEqual([
      "Checking",
      "Vault",
      "Pending",
      "Debts",
      "Available",
    ]);
    expect(parsed.dashboardCard[0].amount).toBe("$4,000.00");
    expect(parsed.dashboardCard[3].amount).toBe("$1,200.00");
    expect(parsed.dashboardCard[1].amount).toBe("$0.00");
  });

  it("normalizes optional audit sections for downstream UI consumers", () => {
    const raw = JSON.stringify({
      headerCard: { status: "GREEN" },
      healthScore: { score: 82, grade: "C", trend: "up", summary: "Solid." },
      dashboardCard: [{ category: "Checking", amount: "$2,500.00", status: "Stable" }],
      weeklyMoves: ["Move 1"],
      alertsCard: [],
      nextAction: "Act now.",
      radar: [],
      longRangeRadar: [],
      milestones: [],
      investments: { balance: "$8,000.00" },
      spendingAnalysis: {
        totalSpent: "$900.00",
        alerts: ["  Ghost sub detected  ", ""],
        topCategories: [{ category: "Dining" }],
      },
      negotiationTargets: [
        { target: "ISP", strategy: "  Ask for promo match  ", estimatedAnnualSavings: "180" },
        { target: "", strategy: "skip me", estimatedAnnualSavings: 0 },
      ],
    });

    const parsed = parseAudit(raw);
    expect(parsed).not.toBeNull();
    expect(parsed.investments).toEqual({
      balance: "$8,000.00",
      asOf: "N/A",
      gateStatus: "N/A",
      cryptoValue: null,
      netWorth: undefined,
    });
    expect(parsed.spendingAnalysis).toEqual({
      totalSpent: "$900.00",
      dailyAverage: "N/A",
      vsAllowance: "N/A",
      topCategories: [{ category: "Dining", amount: "$0.00", pctOfTotal: "0%" }],
      alerts: ["Ghost sub detected"],
      debtImpact: "",
    });
    expect(parsed.negotiationTargets).toEqual([
      { target: "ISP", strategy: "Ask for promo match", estimatedAnnualSavings: 180 },
    ]);
  });

  it("returns null for invalid JSON", () => {
    expect(parseAudit("not json at all")).toBeNull();
    expect(parseAudit("{}")).toBeNull();
    expect(parseAudit('{"foo":"bar"}')).toBeNull();
  });

  it("adds a low-severity flag when weekly moves under-allocate operational surplus", () => {
    const raw = JSON.stringify({
      headerCard: { status: "GREEN" },
      healthScore: { score: 88, grade: "B+", trend: "up", summary: "Solid." },
      dashboardCard: [{ category: "Checking", amount: "$4,600.00", status: "Protected" }],
      weeklyMoves: ["Route $50 to debt this week."],
      alertsCard: [],
      nextAction: "Act now.",
      radar: [],
      longRangeRadar: [],
      milestones: [],
      investments: {},
    });

    const parsed = validateParsedAuditConsistency(parseAudit(raw), { operationalSurplus: 175 });
    expect(parsed.auditFlags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "weekly-moves-underallocated", severity: "low" }),
      ])
    );
    expect(parsed.consistency.weeklyMoveDollarTotal).toBe(50);
    expect(parsed.consistency.expectedOperationalSurplus).toBe(175);
  });

  it("logs non-canonical dashboard categories instead of silently dropping them", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw = JSON.stringify({
      headerCard: { status: "GREEN" },
      healthScore: { score: 88, grade: "B+", trend: "up", summary: "Solid." },
      dashboardCard: [
        { category: "Checking", amount: "$4,600.00", status: "Protected" },
        { category: "Cash Buffer", amount: "$900.00", status: "Unknown" },
      ],
      weeklyMoves: ["Move 1"],
      alertsCard: [],
      nextAction: "Act now.",
      radar: [],
      longRangeRadar: [],
      milestones: [],
      investments: {},
    });

    const parsed = validateParsedAuditConsistency(parseAudit(raw));
    expect(parsed.consistency.nonCanonicalDashboardCategories).toEqual(["Cash Buffer"]);
    expect(warnSpy).toHaveBeenCalledWith(
      "[audit] Non-canonical dashboard categories detected:",
      "Cash Buffer"
    );
  });

  it("re-anchors materially wrong health scores to the deterministic native score", () => {
    const raw = JSON.stringify({
      headerCard: { status: "GREEN" },
      healthScore: { score: 95, grade: "A", trend: "up", summary: "Excellent." },
      dashboardCard: [{ category: "Checking", amount: "$4,600.00", status: "Protected" }],
      weeklyMoves: ["Move 1"],
      alertsCard: [],
      nextAction: "Act now.",
      radar: [],
      longRangeRadar: [],
      milestones: [],
      investments: {},
    });

    const parsed = validateParsedAuditConsistency(parseAudit(raw), {
      nativeScore: 68,
      nativeRiskFlags: ["transfer-needed"],
    });

    expect(parsed.healthScore.score).toBe(68);
    expect(parsed.healthScore.grade).toBe("D+");
    expect(parsed.status).toBe("RED");
    expect(parsed.auditFlags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "health-score-reanchored-to-native", severity: "medium" }),
        expect.objectContaining({ code: "status-corrected-to-native-risk", severity: "medium" }),
      ])
    );
    expect(parsed.consistency.nativeScoreAnchor).toBe(68);
    expect(parsed.consistency.scoreAnchoredToNative).toBe(true);
  });

  it("re-anchors when the model drifts by more than 8 points from native score", () => {
    const raw = JSON.stringify({
      headerCard: { status: "GREEN" },
      healthScore: { score: 89, grade: "B+", trend: "up", summary: "Good." },
      dashboardCard: [{ category: "Checking", amount: "$4,600.00", status: "Protected" }],
      weeklyMoves: ["Move 1"],
      alertsCard: [],
      nextAction: "Act now.",
      radar: [],
      longRangeRadar: [],
      milestones: [],
      investments: {},
    });

    const parsed = validateParsedAuditConsistency(parseAudit(raw), {
      nativeScore: 80,
      nativeRiskFlags: [],
    });

    expect(parsed.healthScore.score).toBe(80);
    expect(parsed.consistency.scoreAnchoredToNative).toBe(true);
  });

  it("treats critical promo expiry as a red-status native risk", () => {
    const raw = JSON.stringify({
      headerCard: { status: "GREEN" },
      healthScore: { score: 82, grade: "B-", trend: "up", summary: "Solid." },
      dashboardCard: [{ category: "Checking", amount: "$4,600.00", status: "Protected" }],
      weeklyMoves: ["Move 1"],
      alertsCard: [],
      nextAction: "Act now.",
      radar: [],
      longRangeRadar: [],
      milestones: [],
      investments: {},
    });

    const parsed = validateParsedAuditConsistency(parseAudit(raw), {
      nativeScore: 82,
      nativeRiskFlags: ["critical-promo-expiry"],
    });

    expect(parsed.status).toBe("RED");
    expect(parsed.auditFlags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "status-corrected-to-native-risk", severity: "medium" }),
      ])
    );
  });

  it("repairs generic debt paydown output when near-term cash obligations still dominate", () => {
    const raw = JSON.stringify({
      headerCard: { status: "YELLOW", title: "Watch cash flow", subtitle: "Near-term pressure", confidence: "medium" },
      healthScore: { score: 76, grade: "C+", trend: "flat", summary: "Mixed picture." },
      dashboardCard: [
        { category: "Checking", amount: "$783.56", status: "ok" },
        { category: "Vault", amount: "$2,155.39", status: "ok" },
        { category: "Pending", amount: "$0.00", status: "ok" },
        { category: "Debts", amount: "$3,753.96", status: "warn" },
        { category: "Available", amount: "$331.31", status: "ok" },
      ],
      weeklyMoves: [
        {
          title: "Route $150 to CREDIT CARD 1",
          detail: "Pay down your highest interest credit card debt.",
          amount: "$150.00",
          priority: "required",
        },
        {
          title: "Consider contributing to Roth IRA",
          detail: "Use extra cash to increase long-term investing.",
          amount: "$150.00",
          priority: "optional",
        },
      ],
      alertsCard: [],
      nextAction: {
        title: "Route $150 to CREDIT CARD 1",
        detail: "Pay down your highest interest credit card debt.",
        amount: "$150.00",
      },
      radar: [],
      longRangeRadar: [],
      milestones: [],
      investments: { balance: "$5,809.31", asOf: "2026-03-29", gateStatus: "open", netWorth: "$4,994.30", cryptoValue: null },
    });

    const parsed = validateParsedAuditConsistency(parseAudit(raw), {
      nativeScore: 76,
      nativeRiskFlags: [],
      operationalSurplus: 331.31,
      cards: [{ id: "delta", name: "Delta Gold Business Card", balance: 3720.27, apr: 28.49 }],
      formData: {
        date: "2026-03-29",
        checking: "783.56",
        savings: "2155.39",
        debts: [{ name: "Delta Gold Business Card", balance: "3720.27" }],
      },
      renewals: [
        { name: "San Francisco Trip", amount: "750", nextDue: "2026-04-01", chargedTo: "Checking" },
        { name: "Vape Bulk Order", amount: "188", nextDue: "2026-04-02", chargedTo: "360 Performance Savings" },
      ],
      computedStrategy: {
        operationalSurplus: 331.31,
        debtStrategy: { target: "Delta Gold Business Card", amount: 150 },
      },
      investmentAnchors: { balance: 5809.31, asOf: "2026-03-29", gateStatus: null, netWorth: 4994.3 },
    });

    expect(parsed.structured.nextAction.title).toBe("Protect the next 7 days");
    expect(parsed.structured.nextAction.detail).toContain("San Francisco Trip");
    expect(parsed.investments.gateStatus).toContain("Guarded");
    expect(parsed.weeklyMoves[0]).toContain("Hold extra debt paydown");
    expect(parsed.weeklyMoves[1]).toContain("Keep Roth");
  });

  it("replaces generic debt labels with explicit debt targets when debt paydown remains valid", () => {
    const raw = JSON.stringify({
      headerCard: { status: "GREEN", title: "On track", subtitle: "Plenty of cash", confidence: "high" },
      healthScore: { score: 84, grade: "B", trend: "up", summary: "Good." },
      dashboardCard: [
        { category: "Checking", amount: "$4,500.00", status: "ok" },
        { category: "Vault", amount: "$5,000.00", status: "ok" },
        { category: "Pending", amount: "$0.00", status: "ok" },
        { category: "Debts", amount: "$1,000.00", status: "warn" },
        { category: "Available", amount: "$1,250.00", status: "ok" },
      ],
      weeklyMoves: [
        {
          title: "Pay priority debt",
          detail: "Route $250 to CREDIT CARD 1 this week.",
          amount: "$250.00",
          priority: "required",
        },
      ],
      alertsCard: [],
      nextAction: {
        title: "Route $250 to CREDIT CARD 1",
        detail: "Pay down your highest interest credit card debt.",
        amount: "$250.00",
      },
      radar: [],
      longRangeRadar: [],
      milestones: [],
      investments: { balance: "$5,809.31", asOf: "2026-03-29", gateStatus: "guarded", netWorth: "$4,994.30", cryptoValue: null },
    });

    const parsed = validateParsedAuditConsistency(parseAudit(raw), {
      nativeScore: 84,
      nativeRiskFlags: [],
      operationalSurplus: 1250,
      cards: [{ id: "delta", name: "Delta Gold Business Card", balance: 1000, apr: 28.49 }],
      formData: {
        date: "2026-03-29",
        checking: "4500",
        savings: "5000",
        debts: [{ name: "Delta Gold Business Card", balance: "1000" }],
      },
      renewals: [],
      computedStrategy: {
        operationalSurplus: 1250,
        debtStrategy: { target: "Delta Gold Business Card", amount: 250 },
      },
      investmentAnchors: { balance: 5809.31, asOf: "2026-03-29", gateStatus: "Guarded — safety first", netWorth: 4994.3 },
    });

    expect(parsed.structured.nextAction.title).toContain("Delta Gold Business Card");
    expect(parsed.structured.nextAction.detail).toContain("Delta Gold Business Card");
    expect(parsed.weeklyMoves[0]).toContain("Delta Gold Business Card");
  });

  it("returns null for missing headerCard", () => {
    expect(parseAudit(JSON.stringify({ weeklyMoves: [] }))).toBeNull();
  });

  it("renders degraded audit state when full parsing is unavailable", () => {
    expect(parseAudit("definitely not json")).toBeNull();

    const degradedParsed = buildDegradedParsedAudit({
      reason: "Full AI narrative unavailable — showing deterministic engine signals only.",
      retryAttempted: true,
      computedStrategy: {
        operationalSurplus: 125,
        requiredTransfer: 0,
        debtStrategy: { target: "Chase Freedom", amount: 125 },
        auditSignals: {
          nativeScore: { score: 72, grade: "C-" },
          debt: { total: 1450 },
          riskFlags: ["thin-emergency-fund", "elevated-utilization"],
        },
      },
      financialConfig: {
        weeklySpendAllowance: 500,
        emergencyFloor: 400,
      },
      formData: {
        date: "2026-03-13",
        checking: 2100,
        savings: 1200,
      },
      renewals: [],
      cards: [],
      personalRules: "",
    });

    const markup = renderToStaticMarkup(
      React.createElement(ResultsView, {
        audit: {
          date: "2026-03-13",
          ts: "2026-03-13T12:00:00.000Z",
          form: { date: "2026-03-13" },
          parsed: degradedParsed,
          isTest: false,
          moveChecks: {},
        },
        moveChecks: {},
        onToggleMove: () => {},
      })
    );

    expect(markup).toContain("Full AI narrative unavailable");
    expect(markup).toContain("DEGRADED AUDIT");
    expect(markup).toContain("SAFETY STATE");
  });

  it("uses locked rule obligations to guard degraded fallback actions", () => {
    const degradedParsed = buildDegradedParsedAudit({
      reason: "Full AI narrative unavailable — showing deterministic engine signals only.",
      retryAttempted: true,
      computedStrategy: {
        operationalSurplus: 331.31,
        requiredTransfer: 0,
        debtStrategy: { target: "Delta Gold Business Card", amount: 150 },
        auditSignals: {
          nativeScore: { score: 76, grade: "C" },
          debt: { total: 3111.34 },
          riskFlags: [],
        },
      },
      financialConfig: {
        weeklySpendAllowance: 200,
        emergencyFloor: 0,
      },
      formData: {
        date: "2026-03-29",
        checking: 2189.56,
        savings: 2155.39,
      },
      renewals: [],
      cards: [],
      personalRules: `
1) TAX ESCROW (LOCKED)
- Total NY Liability: $3,166.00 due 2026-04-14
- Remaining Net Gap: $1,150.00 (primary cash funding gap)
7) STRATEGIC SINKING FUNDS (VIRTUAL BUCKET TARGETS)
- San Francisco Trip: $750.00 due 2026-04-02
      `,
    });

    expect(degradedParsed.structured.nextAction.title).toBe("Protect near-term obligations");
    expect(degradedParsed.structured.nextAction.detail).toContain("San Francisco Trip");
    expect(degradedParsed.structured.nextAction.detail).toContain("NY Tax Funding Gap");
    expect(degradedParsed.sections.forwardRadar).toContain("Protected cash obligations");
  });
});

describe("detectAuditDrift", () => {
  it("flags health score drift above the 8-point threshold", () => {
    const previousParsed = parseAudit(JSON.stringify({
      headerCard: { status: "GREEN" },
      healthScore: { score: 82, grade: "B", trend: "flat", summary: "Stable." },
      weeklyMoves: ["Move 1"],
      nextAction: "Act now.",
      alertsCard: [],
      dashboardCard: [],
      radar: [],
      longRangeRadar: [],
      milestones: [],
      investments: {},
    }));
    const nextParsed = parseAudit(JSON.stringify({
      headerCard: { status: "GREEN" },
      healthScore: { score: 72, grade: "C-", trend: "down", summary: "Softer." },
      weeklyMoves: ["Move 1"],
      nextAction: "Act now.",
      alertsCard: [],
      dashboardCard: [],
      radar: [],
      longRangeRadar: [],
      milestones: [],
      investments: {},
    }));

    const drift = detectAuditDrift(previousParsed, nextParsed);
    expect(drift.driftDetected).toBe(true);
    expect(drift.scoreDelta).toBe(10);
    expect(drift.reasons).toEqual(expect.arrayContaining([expect.stringContaining("health-score-drift")]));
  });

  it("flags safety-state flips even when the score change is small", () => {
    const previousParsed = parseAudit(JSON.stringify({
      headerCard: { status: "GREEN" },
      healthScore: { score: 80, grade: "B-", trend: "flat", summary: "Stable." },
      weeklyMoves: ["Move 1"],
      nextAction: "Act now.",
      alertsCard: [],
      dashboardCard: [],
      radar: [],
      longRangeRadar: [],
      milestones: [],
      investments: {},
    }));
    const nextParsed = parseAudit(JSON.stringify({
      headerCard: { status: "RED" },
      healthScore: { score: 78, grade: "C+", trend: "down", summary: "Watch closely." },
      weeklyMoves: ["Move 1"],
      nextAction: "Act now.",
      alertsCard: [],
      dashboardCard: [],
      radar: [],
      longRangeRadar: [],
      milestones: [],
      investments: {},
    }));

    const drift = detectAuditDrift(previousParsed, nextParsed);
    expect(drift.driftDetected).toBe(true);
    expect(drift.safetyFlip).toBe(true);
    expect(drift.reasons).toEqual(expect.arrayContaining([expect.stringContaining("safety-state-flip")]));
  });

  it("flags complete changes in top risk categories", () => {
    const previousParsed = parseAudit(JSON.stringify({
      headerCard: { status: "YELLOW" },
      healthScore: { score: 74, grade: "C", trend: "flat", summary: "Stable enough." },
      weeklyMoves: ["Move 1"],
      nextAction: "Act now.",
      alertsCard: [],
      dashboardCard: [],
      radar: [],
      longRangeRadar: [],
      milestones: [],
      investments: {},
      riskFlags: ["transfer-needed", "thin-emergency-fund"],
    }));
    const nextParsed = parseAudit(JSON.stringify({
      headerCard: { status: "YELLOW" },
      healthScore: { score: 74, grade: "C", trend: "flat", summary: "Stable enough." },
      weeklyMoves: ["Move 1"],
      nextAction: "Act now.",
      alertsCard: [],
      dashboardCard: [],
      radar: [],
      longRangeRadar: [],
      milestones: [],
      investments: {},
      riskFlags: ["promo-expiry", "high-utilization"],
    }));

    const drift = detectAuditDrift(previousParsed, nextParsed);
    expect(drift.driftDetected).toBe(true);
    expect(drift.riskCategoriesChangedCompletely).toBe(true);
    expect(drift.reasons).toEqual(expect.arrayContaining([expect.stringContaining("risk-categories-shift")]));
  });
});

// ═══════════════════════════════════════════════════════════════
// advanceExpiredDate
// ═══════════════════════════════════════════════════════════════
describe("advanceExpiredDate", () => {
  it("does not advance future dates", () => {
    expect(advanceExpiredDate("2026-12-01", 1, "months", "2026-01-01")).toBe("2026-12-01");
  });

  it("advances monthly intervals", () => {
    const result = advanceExpiredDate("2025-01-15", 1, "months", "2026-03-01");
    expect(result >= "2026-03-01").toBe(true);
  });

  it("advances yearly intervals", () => {
    const result = advanceExpiredDate("2024-06-15", 1, "years", "2026-03-01");
    expect(result).toBe("2026-06-15");
  });

  it("advances weekly intervals", () => {
    const result = advanceExpiredDate("2026-01-01", 2, "weeks", "2026-03-01");
    expect(result >= "2026-03-01").toBe(true);
  });

  it("advances daily intervals", () => {
    const result = advanceExpiredDate("2026-02-25", 3, "days", "2026-03-01");
    expect(result >= "2026-03-01").toBe(true);
  });

  it("handles null/empty gracefully", () => {
    expect(advanceExpiredDate(null, 1, "months")).toBeNull();
    expect(advanceExpiredDate("", 1, "months")).toBe("");
  });

  it("handles short months correctly", () => {
    // Jan 31 + 1 month should not leap to March
    const result = advanceExpiredDate("2024-01-31", 1, "months", "2024-02-15");
    const d = new Date(result);
    expect(d.getUTCMonth()).toBeLessThanOrEqual(1); // Feb or before
  });
});

// ═══════════════════════════════════════════════════════════════
// cyrb53 (hashing)
// ═══════════════════════════════════════════════════════════════
describe("cyrb53", () => {
  it("produces consistent hashes", () => {
    const hash1 = cyrb53("hello world");
    const hash2 = cyrb53("hello world");
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different inputs", () => {
    const hash1 = cyrb53("hello");
    const hash2 = cyrb53("world");
    expect(hash1).not.toBe(hash2);
  });

  it("supports seed parameter", () => {
    const hash1 = cyrb53("hello", 1);
    const hash2 = cyrb53("hello", 2);
    expect(hash1).not.toBe(hash2);
  });

  it("returns a finite number", () => {
    expect(Number.isFinite(cyrb53("test"))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// fmt (currency formatter) — needs window mock for __privacyMode check
// ═══════════════════════════════════════════════════════════════
if (typeof globalThis.window === "undefined") globalThis.window = {};

describe("fmt", () => {
  it("formats positive numbers", () => {
    expect(fmt(1234.56)).toBe("$1,234.56");
  });

  it("formats negative numbers", () => {
    expect(fmt(-500)).toBe("-$500.00");
  });

  it("handles null/NaN", () => {
    expect(fmt(null)).toBe("—");
    expect(fmt(NaN)).toBe("—");
  });
});

// ═══════════════════════════════════════════════════════════════
// fmtDate (date formatter)
// ═══════════════════════════════════════════════════════════════
describe("fmtDate", () => {
  it("formats ISO date strings", () => {
    const result = fmtDate("2024-01-15");
    expect(result).toContain("January");
    expect(result).toContain("15");
    expect(result).toContain("2024");
  });

  it("handles null/empty", () => {
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate("")).toBe("—");
  });
});

// ═══════════════════════════════════════════════════════════════
// extractDashboardMetrics
// ═══════════════════════════════════════════════════════════════
describe("extractDashboardMetrics", () => {
  it("extracts metrics from structured dashboardCard", () => {
    const parsed = {
      structured: {
        dashboardCard: [
          { category: "Checking", amount: "$5,000.00", status: "OK" },
          { category: "Vault", amount: "$10,000.00", status: "Growing" },
          { category: "Debts", amount: "$3,000.00", status: "Paying" },
        ],
      },
    };

    const metrics = extractDashboardMetrics(parsed);
    expect(metrics.checking).toBe(5000);
    expect(metrics.vault).toBe(10000);
    expect(metrics.debts).toBe(3000);
  });

  it("handles missing data gracefully", () => {
    const metrics = extractDashboardMetrics({});
    expect(metrics.checking).toBeNull();
    expect(metrics.vault).toBeNull();
  });
});
