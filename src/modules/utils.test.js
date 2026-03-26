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
vi.mock("@aparajita/capacitor-biometric-auth", () => ({
  BiometricAuth: { checkBiometry: vi.fn(), authenticate: vi.fn() },
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
    expect(parsed.structured.nextAction).toBe("Cut spending.");
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
