import { describe, expect, it } from "vitest";

import {
  getBackendProvider,
  getModelDisplayName,
  getOperationalFallbackModels,
} from "./providers.js";

describe("providers", () => {
  it("returns stable provider routing and display names", () => {
    expect(getBackendProvider("gemini-2.5-flash")).toBe("gemini");
    expect(getBackendProvider("gpt-4.1")).toBe("openai");
    expect(getModelDisplayName("gemini-2.5-flash")).toBe("Catalyst AI");
    expect(getModelDisplayName("gpt-4.1")).toBe("Catalyst AI CFO");
    expect(getModelDisplayName("o3")).toBe("Catalyst AI Boardroom");
  });

  it("provides ordered operational fallbacks for each model", () => {
    expect(getOperationalFallbackModels("gemini-2.5-flash")).toEqual(["gpt-4.1"]);
    expect(getOperationalFallbackModels("gpt-4.1")).toEqual(["gemini-2.5-flash"]);
    expect(getOperationalFallbackModels("o3")).toEqual(["gpt-4.1", "gemini-2.5-flash"]);
    expect(getOperationalFallbackModels("unknown")).toEqual([]);
  });
});
