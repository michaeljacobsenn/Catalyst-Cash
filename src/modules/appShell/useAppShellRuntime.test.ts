import { describe, expect, it } from "vitest";
import { shouldRefreshOnResume } from "./useAppShellRuntime";

describe("shouldRefreshOnResume", () => {
  it("skips foreground refresh during biometric interactions", () => {
    expect(
      shouldRefreshOnResume({
        biometricInteractionActive: true,
      })
    ).toBe(false);
  });

  it("allows foreground refresh during normal resumes", () => {
    expect(
      shouldRefreshOnResume({
        biometricInteractionActive: false,
      })
    ).toBe(true);
  });
});
