import { describe, expect, it } from "vitest";

import {
  getBackendProvider,
  getModelDisplayName,
  getOperationalFallbackModels,
} from "./providers.js";

describe("providers", () => {
  it("returns stable provider routing and display names", () => {
    expect(getBackendProvider("gemini-2.5-flash")).toBe("openai");
    expect(getBackendProvider("gpt-5-nano")).toBe("openai");
    expect(getBackendProvider("gpt-5-mini")).toBe("openai");
    expect(getBackendProvider("gpt-5.1")).toBe("openai");
    expect(getBackendProvider("gpt-4.1")).toBe("openai");
    expect(getModelDisplayName("gemini-2.5-flash")).toBe("Catalyst AI");
    expect(getModelDisplayName("gpt-4.1")).toBe("Catalyst AI CFO");
    expect(getModelDisplayName("o3")).toBe("Catalyst AI Boardroom");
  });

  it("provides ordered operational fallbacks for each model", () => {
    expect(getOperationalFallbackModels("gpt-5-nano")).toEqual(["gpt-5-mini"]);
    expect(getOperationalFallbackModels("gpt-5-mini")).toEqual(["gpt-5-nano"]);
    expect(getOperationalFallbackModels("gpt-5.1")).toEqual(["gpt-5-mini", "gpt-5-nano"]);
    expect(getOperationalFallbackModels("gemini-2.5-flash")).toEqual(["gpt-5-mini"]);
    expect(getOperationalFallbackModels("gpt-4.1")).toEqual(["gpt-5-nano"]);
    expect(getOperationalFallbackModels("o3")).toEqual(["gpt-5-mini", "gpt-5-nano"]);
    expect(getOperationalFallbackModels("unknown")).toEqual([]);
  });
});
