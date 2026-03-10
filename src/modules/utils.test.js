import { describe, it, expect, vi } from "vitest";

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
vi.mock("./constants.js", () => ({ APP_VERSION: "2.0.0-test" }));

import {
  parseCurrency,
  parseAudit,
  advanceExpiredDate,
  cyrb53,
  fmt,
  fmtDate,
  extractDashboardMetrics,
} from "./utils.js";

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
  });

  it("returns null for invalid JSON", () => {
    expect(parseAudit("not json at all")).toBeNull();
    expect(parseAudit("{}")).toBeNull();
    expect(parseAudit('{"foo":"bar"}')).toBeNull();
  });

  it("returns null for missing headerCard", () => {
    expect(parseAudit(JSON.stringify({ weeklyMoves: [] }))).toBeNull();
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
