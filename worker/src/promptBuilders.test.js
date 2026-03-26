import { describe, expect, it } from "vitest";

import { getSystemPromptCore } from "./promptBuilders.js";

describe("promptBuilders", () => {
  it("includes the executive quality standard in the audit prompt", () => {
    const prompt = getSystemPromptCore({ currencyCode: "USD" }, [], [], "", null, {});

    expect(prompt).toContain("A+) EXECUTIVE QUALITY STANDARD (HARD)");
    expect(prompt).toContain("Write like a CFO / operator reviewing weekly cash position");
    expect(prompt).toContain("Distinguish facts, assumptions, and contradictions explicitly.");
    expect(prompt).toContain("Do not pad the answer with generic education");
  });
});
