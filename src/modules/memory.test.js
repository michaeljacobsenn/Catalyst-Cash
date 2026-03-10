import { describe, it, expect } from "vitest";
import { extractMemoryTags, extractAuditMilestones, getMemoryBlock } from "./memory.js";

// ════════════════════════════════════════════════════════════════
// extractMemoryTags — strip [REMEMBER: ...] tags from AI responses
// ════════════════════════════════════════════════════════════════

describe("extractMemoryTags", () => {
  it("extracts single REMEMBER tag", () => {
    const text = "Great question! [REMEMBER: User has two kids] Let me help.";
    const { cleanText, newFacts } = extractMemoryTags(text);
    expect(newFacts).toEqual(["User has two kids"]);
    expect(cleanText).not.toContain("[REMEMBER:");
    expect(cleanText).toContain("Great question!");
  });

  it("extracts multiple REMEMBER tags", () => {
    const text = "[REMEMBER: Works at Google] Here's your plan. [REMEMBER: Salary is 150k]";
    const { newFacts } = extractMemoryTags(text);
    expect(newFacts).toHaveLength(2);
    expect(newFacts[0]).toBe("Works at Google");
    expect(newFacts[1]).toBe("Salary is 150k");
  });

  it("ignores short facts (< 5 chars)", () => {
    const text = "[REMEMBER: Hi] That's neat. [REMEMBER: User likes budgeting]";
    const { newFacts } = extractMemoryTags(text);
    expect(newFacts).toHaveLength(1);
    expect(newFacts[0]).toBe("User likes budgeting");
  });

  it("handles null/empty input gracefully", () => {
    expect(extractMemoryTags(null).newFacts).toHaveLength(0);
    expect(extractMemoryTags("").newFacts).toHaveLength(0);
    expect(extractMemoryTags("No tags here").newFacts).toHaveLength(0);
  });

  it("is case-insensitive for tag matching", () => {
    const { newFacts } = extractMemoryTags("[remember: case test fact]");
    expect(newFacts).toHaveLength(1);
  });
});

// ════════════════════════════════════════════════════════════════
// extractAuditMilestones — deterministic milestone detection
// ════════════════════════════════════════════════════════════════

describe("extractAuditMilestones", () => {
  it("detects first audit milestone", () => {
    const parsed = { healthScore: { score: 75 } };
    const milestones = extractAuditMilestones(parsed, []);
    expect(milestones.some(m => m.includes("First audit"))).toBe(true);
  });

  it("detects score threshold crossing (80+)", () => {
    const parsed = { healthScore: { score: 82 } };
    const prevHistory = [{ parsed: { healthScore: { score: 78 } } }];
    const milestones = extractAuditMilestones(parsed, prevHistory);
    expect(milestones.some(m => m.includes("B-tier"))).toBe(true);
  });

  it("detects score drop of 10+ points", () => {
    const parsed = { healthScore: { score: 60 } };
    const prevHistory = [{ parsed: { healthScore: { score: 75 } } }];
    const milestones = extractAuditMilestones(parsed, prevHistory);
    expect(milestones.some(m => m.includes("dropped"))).toBe(true);
  });

  it("detects debt cleared milestone", () => {
    const parsed = {
      healthScore: { score: 85 },
      dashboardCard: [{ category: "Debts", amount: "$0.00" }],
    };
    const prevHistory = [
      {
        parsed: {
          healthScore: { score: 80 },
          dashboardCard: [{ category: "Debts", amount: "$3,500.00" }],
        },
      },
    ];
    const milestones = extractAuditMilestones(parsed, prevHistory);
    expect(milestones.some(m => m.includes("$0 balance"))).toBe(true);
  });

  it("returns empty array for null input", () => {
    expect(extractAuditMilestones(null)).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════
// getMemoryBlock — format memory for prompt injection
// ════════════════════════════════════════════════════════════════

describe("getMemoryBlock", () => {
  it("returns empty string for no memory", () => {
    expect(getMemoryBlock(null)).toBe("");
    expect(getMemoryBlock({ facts: [], milestones: [] })).toBe("");
  });

  it("formats facts grouped by category", () => {
    const memory = {
      facts: [
        { fact: "Saving for a house", category: "goal", ts: Date.now() },
        { fact: "Prefers index funds", category: "preference", ts: Date.now() },
        { fact: "Works in tech", category: "context", ts: Date.now() },
      ],
      milestones: [],
    };
    const block = getMemoryBlock(memory);
    expect(block).toContain("PERSISTENT MEMORY");
    expect(block).toContain("Goals:");
    expect(block).toContain("Saving for a house");
    expect(block).toContain("Preferences:");
    expect(block).toContain("Prefers index funds");
    expect(block).toContain("Personal Context:");
    expect(block).toContain("Works in tech");
  });

  it("formats milestones with dates", () => {
    const memory = {
      facts: [],
      milestones: [{ text: "Score crossed 80", ts: new Date("2026-01-15").getTime() }],
    };
    const block = getMemoryBlock(memory);
    expect(block).toContain("JOURNEY MILESTONES");
    expect(block).toContain("Score crossed 80");
  });
});
