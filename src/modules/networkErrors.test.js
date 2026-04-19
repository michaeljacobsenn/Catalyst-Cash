import { describe, expect, it } from "vitest";

import { isLikelyNetworkError, isLikelyProviderAvailabilityError } from "./networkErrors.js";

describe("networkErrors", () => {
  it("detects provider quota and availability failures", () => {
    expect(
      isLikelyProviderAvailabilityError(
        new Error("Gemini Error: You exceeded your current quota, please check your plan and billing details.")
      )
    ).toBe(true);

    expect(
      isLikelyProviderAvailabilityError(
        new Error("OpenAI Error: The service is currently unavailable due to capacity.")
      )
    ).toBe(true);
  });

  it("honors structured provider-failure flags", () => {
    expect(
      isLikelyProviderAvailabilityError({
        message: "Backend error: HTTP 502",
        providerAvailabilityFailure: true,
      })
    ).toBe(true);
  });

  it("does not confuse general fetch errors with provider availability failures", () => {
    expect(isLikelyProviderAvailabilityError(new Error("Failed to fetch"))).toBe(false);
    expect(isLikelyNetworkError(new Error("Failed to fetch"))).toBe(true);
  });
});
