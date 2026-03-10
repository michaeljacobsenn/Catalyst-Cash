// ═══════════════════════════════════════════════════════════════
// BADGE EVALUATION TESTS
// ═══════════════════════════════════════════════════════════════
import { describe, it, expect, vi } from "vitest";
import { evaluateBadges } from "./badges.js";

// Mock db for badge persistence — always returns empty so badges appear "new"
vi.mock("./utils.js", () => ({
  db: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("evaluateBadges", () => {
  const makeAudit = (overrides = {}) => ({
    date: "2024-06-01",
    ts: Date.now(),
    isTest: false,
    form: { checking: 3000, ally: 500, debts: [{ balance: 1000, minPayment: 50, apr: 19.99 }] },
    parsed: { status: "GREEN", healthScore: { score: 75 } },
    ...overrides,
  });

  const baseArgs = {
    history: [makeAudit()],
    streak: 1,
    financialConfig: { weeklySpendAllowance: 300, defaultAPR: 24.99 },
    persona: null,
    current: makeAudit(),
  };

  it("unlocks first_audit badge on first real audit", async () => {
    const result = await evaluateBadges(baseArgs);
    expect(result.newlyUnlocked).toContain("first_audit");
  });

  it("unlocks budget_boss on 4 consecutive GREEN audits", async () => {
    const greenAudits = Array.from({ length: 4 }, (_, i) =>
      makeAudit({ date: `2024-06-0${i + 1}`, parsed: { status: "GREEN", healthScore: { score: 80 } } })
    );
    const result = await evaluateBadges({
      ...baseArgs,
      history: greenAudits,
      streak: 4,
      current: greenAudits[0],
    });
    expect(result.newlyUnlocked).toContain("budget_boss");
  });

  it("unlocks savings_10k when savings exceed $10,000", async () => {
    const audit = makeAudit({ form: { checking: 5000, ally: 11000, debts: [] } });
    const result = await evaluateBadges({
      ...baseArgs,
      history: [audit],
      current: audit,
    });
    expect(result.newlyUnlocked).toContain("savings_10k");
  });

  it("unlocks year_one with 52+ real audits", async () => {
    const manyAudits = Array.from({ length: 53 }, (_, i) =>
      makeAudit({ date: `2024-01-${String((i % 28) + 1).padStart(2, "0")}`, isTest: false })
    );
    const result = await evaluateBadges({
      ...baseArgs,
      history: manyAudits,
      current: manyAudits[0],
    });
    expect(result.newlyUnlocked).toContain("year_one");
  });

  it("unlocks night_owl for audit after 9pm", async () => {
    const lateHour = new Date();
    lateHour.setHours(22, 0, 0, 0);
    const nightAudit = makeAudit({ ts: lateHour.getTime() });
    const result = await evaluateBadges({
      ...baseArgs,
      history: [nightAudit],
      current: nightAudit,
    });
    expect(result.newlyUnlocked).toContain("night_owl");
  });

  it("unlocks debt_halved when total debt drops 50%+", async () => {
    const oldest = makeAudit({
      date: "2024-01-01",
      form: { checking: 3000, ally: 500, debts: [{ balance: 10000, minPayment: 200, apr: 19.99 }] },
    });
    const mid1 = makeAudit({
      date: "2024-03-01",
      form: { checking: 3000, ally: 500, debts: [{ balance: 7000, minPayment: 200, apr: 19.99 }] },
    });
    const mid2 = makeAudit({
      date: "2024-04-01",
      form: { checking: 3000, ally: 500, debts: [{ balance: 5500, minPayment: 200, apr: 19.99 }] },
    });
    const latest = makeAudit({
      date: "2024-06-01",
      form: { checking: 3000, ally: 500, debts: [{ balance: 4000, minPayment: 200, apr: 19.99 }] },
    });
    // needs >= 4 real audits for debt_halved check
    const result = await evaluateBadges({
      ...baseArgs,
      history: [latest, mid2, mid1, oldest],
      current: latest,
    });
    expect(result.newlyUnlocked).toContain("debt_halved");
  });
});
