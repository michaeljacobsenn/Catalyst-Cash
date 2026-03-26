import { describe, expect, it } from "vitest";

import { getChatSystemPrompt } from "./chatPromptBuilders.js";

describe("chatPromptBuilders", () => {
  it("includes split-paycheck monthly income in chat context", () => {
    const prompt = getChatSystemPrompt(
      null,
      {
        incomeType: "salary",
        payFrequency: "bi-weekly",
        paycheckStandard: 2200,
        paycheckFirstOfMonth: 2800,
      },
      [],
      [],
      [],
      "",
      "",
      null,
      null,
      "openai",
      "",
      [],
      null,
      null
    );

    expect(prompt).toContain("Estimated Monthly Net Income: $5,366.67");
    expect(prompt).toContain("1st-of-Month Paycheck: $2,800.00");
  });

  it("enforces an executive visible-response contract", () => {
    const prompt = getChatSystemPrompt(
      null,
      {},
      [],
      [],
      [],
      null,
      "",
      null,
      null,
      "openai",
      "",
      [],
      null,
      null
    );

    expect(prompt).toContain("Operate like a conservative CFO, forensic financial analyst, and cash-flow auditor.");
    expect(prompt).toContain("## Visible Response Standard (MANDATORY)");
    expect(prompt).toContain("Start with a one-sentence verdict that answers the question directly.");
    expect(prompt).toContain("Separate observed facts from assumptions.");
  });
});
