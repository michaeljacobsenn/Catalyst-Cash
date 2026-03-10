import { describe, it, expect, beforeAll } from "vitest";
import { getSystemPrompt } from "./prompts.js";
import { getChatSystemPrompt } from "./chatPrompts.js";

// Polyfill window for Node.js environment (formatCurrency checks window.__privacyMode)
beforeAll(() => {
  if (typeof globalThis.window === "undefined") {
    globalThis.window = {};
  }
});

const minConfig = {
  paycheckStandard: 2000,
  payFrequency: "bi-weekly",
  payday: "Friday",
  paycheckUsableTime: "09:00",
  emergencyFloor: 500,
  weeklySpendAllowance: 200,
  greenStatusTarget: 1500,
  emergencyReserveTarget: 5000,
  vaultTarget: 1000,
  taxBracket: 22,
};

describe("getSystemPrompt", () => {
  it("returns a non-empty string for gemini", () => {
    const prompt = getSystemPrompt("gemini", minConfig);
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(500);
  });

  it("returns a non-empty string for openai", () => {
    const prompt = getSystemPrompt("openai", minConfig);
    expect(prompt.length).toBeGreaterThan(500);
  });

  it("returns a non-empty string for claude", () => {
    const prompt = getSystemPrompt("claude", minConfig);
    expect(prompt.length).toBeGreaterThan(500);
  });

  it("includes provider-specific directives", () => {
    const gemini = getSystemPrompt("gemini", minConfig);
    const openai = getSystemPrompt("openai", minConfig);
    const claude = getSystemPrompt("claude", minConfig);

    expect(gemini).toContain("gemini_system_directive");
    expect(openai).toContain("openai_system_directive");
    expect(claude).toContain("claude_system_directive");
  });

  it("includes JSON schema wrapper", () => {
    const prompt = getSystemPrompt("gemini", minConfig);
    expect(prompt).toContain("headerCard");
    expect(prompt).toContain("healthScore");
    expect(prompt).toContain("weeklyMoves");
  });

  it("includes critical reminder / attention anchor", () => {
    const prompt = getSystemPrompt("gemini", minConfig);
    expect(prompt).toContain("critical_reminder");
  });

  it("includes financial config values", () => {
    const prompt = getSystemPrompt("gemini", minConfig);
    expect(prompt).toContain("bi-weekly");
  });

  it("injects coach persona when specified", () => {
    const prompt = getSystemPrompt("gemini", minConfig, [], [], "", null, "coach");
    expect(prompt).toContain("STRICT COACH");
    expect(prompt).toContain("drill sergeant");
  });

  it("injects friend persona when specified", () => {
    const prompt = getSystemPrompt("gemini", minConfig, [], [], "", null, "friend");
    expect(prompt).toContain("SUPPORTIVE FRIEND");
  });

  it("injects nerd persona when specified", () => {
    const prompt = getSystemPrompt("gemini", minConfig, [], [], "", null, "nerd");
    expect(prompt).toContain("DATA NERD");
  });

  it("includes no persona block when persona is null", () => {
    const prompt = getSystemPrompt("gemini", minConfig, [], [], "", null, null);
    expect(prompt).not.toContain("COMMUNICATION STYLE");
  });

  it("includes trend context when provided", () => {
    const trends = [
      { week: 1, score: 75, checking: 2000, vault: 500, totalDebt: 3000, status: "stable" },
      { week: 2, score: 80, checking: 2200, vault: 600, totalDebt: 2800, status: "improving" },
    ];
    const prompt = getSystemPrompt("gemini", minConfig, [], [], "", trends);
    expect(prompt).toContain("TREND CONTEXT");
    expect(prompt).toContain("W1:");
    expect(prompt).toContain("W2:");
  });

  it("includes personal rules when provided", () => {
    const prompt = getSystemPrompt("gemini", minConfig, [], [], "Never invest in crypto");
    expect(prompt).toContain("Never invest in crypto");
  });

  it("includes card data when provided", () => {
    const cards = [{ name: "Freedom Unlimited", institution: "Chase", limit: 15000 }];
    const prompt = getSystemPrompt("gemini", minConfig, cards);
    expect(prompt).toContain("Freedom Unlimited");
  });

  it("includes computed strategy block when provided", () => {
    const strategy = {
      nextPayday: "2026-03-07",
      totalCheckingFloor: 800,
      timeCriticalAmount: 200,
      requiredTransfer: 0,
      operationalSurplus: 1200,
      debtStrategy: { target: "Card A", amount: 500 },
    };
    const prompt = getSystemPrompt("gemini", minConfig, [], [], "", null, null, strategy);
    expect(prompt).toContain("ALGORITHMIC_STRATEGY");
  });
});

// ═══════════════════════════════════════════════════════════════
// NEW COVERAGE TESTS — Expanded Financial Situations
// ═══════════════════════════════════════════════════════════════
describe("getSystemPrompt — expanded coverage", () => {
  it("includes Section CE (Expanded Financial Situation Coverage)", () => {
    const prompt = getSystemPrompt("gemini", minConfig);
    expect(prompt).toContain("CE) EXPANDED FINANCIAL SITUATION COVERAGE");
    expect(prompt).toContain("MORTGAGE / RENT");
    expect(prompt).toContain("STUDENT LOAN STRATEGIES");
    expect(prompt).toContain("MEDICAL DEBT");
    expect(prompt).toContain("ALIMONY / CHILD SUPPORT");
    expect(prompt).toContain("DEBT CONSOLIDATION / BALANCE TRANSFER");
    expect(prompt).toContain("ESTATE PLANNING / LIFE INSURANCE");
    expect(prompt).toContain("PENSION / ANNUITY / SOCIAL SECURITY");
    expect(prompt).toContain("RENTAL INCOME / REAL ESTATE");
  });

  it("includes expanded wealth building ladder (FSA, backdoor Roth, 529)", () => {
    const prompt = getSystemPrompt("gemini", minConfig);
    expect(prompt).toContain("FSA DEADLINE ALERT");
    expect(prompt).toContain("BACKDOOR ROTH");
    expect(prompt).toContain("MEGA-BACKDOOR ROTH");
    expect(prompt).toContain("529 Education Savings Plans");
  });

  it("includes inflation awareness note", () => {
    const prompt = getSystemPrompt("gemini", minConfig);
    expect(prompt).toContain("INFLATION AWARENESS");
    expect(prompt).toContain("purchasing power erodes");
  });

  it("includes RSU/ESPP advisory text (always-on in Section CE)", () => {
    const prompt = getSystemPrompt("gemini", minConfig);
    expect(prompt).toContain("EQUITY COMPENSATION (RSU/ESPP/STOCK OPTIONS)");
    expect(prompt).toContain("CONCENTRATION RISK");
  });
});

describe("getChatSystemPrompt — expanded coverage", () => {
  const chatConfig = { ...minConfig, currencyCode: "USD" };

  it("includes MLM/pyramid scheme safety guardrail", () => {
    const prompt = getChatSystemPrompt(null, chatConfig, [], [], [], null, "", null, null, null, "");
    expect(prompt).toContain("MLM / PYRAMID SCHEMES");
    expect(prompt).toContain("99% of MLM participants lose money");
  });

  it("includes expanded financial situation awareness", () => {
    const prompt = getChatSystemPrompt(null, chatConfig, [], [], [], null, "", null, null, null, "");
    expect(prompt).toContain("Expanded Financial Situation Awareness");
    expect(prompt).toContain("Student Loans");
    expect(prompt).toContain("Medical Debt");
    expect(prompt).toContain("Homeowner vs. Renter Awareness");
  });

  it("includes retirement phase block for 55+ users", () => {
    const seniorConfig = { ...chatConfig, birthYear: 1965 };
    const prompt = getChatSystemPrompt(null, seniorConfig, [], [], [], null, "", null, null, null, "");
    expect(prompt).toContain("RETIREMENT TRANSITION AWARENESS");
    expect(prompt).toContain("Social Security Timing");
    expect(prompt).toContain("Required Minimum Distributions");
  });
});
