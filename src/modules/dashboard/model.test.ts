import { describe, expect, it } from "vitest";

import {
  buildDashboardNextAction,
  computeScorePercentile,
  normalizeDashboardStatus,
  splitDashboardSentences,
} from "./model";

describe("dashboard model helpers", () => {
  it("splits dashboard copy into trimmed sentences", () => {
    expect(splitDashboardSentences(" Protect cash now.  Route $450 to savings!  ")).toEqual([
      "Protect cash now.",
      "Route $450 to savings!",
    ]);
  });

  it("builds a next-action summary with label and amount extraction", () => {
    expect(
      buildDashboardNextAction("Route $450 to savings this week. Keep checking above your floor.")
    ).toEqual({
      clean: "Route $450 to savings this week. Keep checking above your floor.",
      headline: "Route $450 to savings this week.",
      detail: "Keep checking above your floor.",
      amountMatch: "$450",
      label: "Route now",
    });
  });

  it("normalizes status strings and computes percentile bounds", () => {
    expect(normalizeDashboardStatus("green - stable")).toBe("GREEN");
    expect(normalizeDashboardStatus("yellow alert")).toBe("YELLOW");
    expect(normalizeDashboardStatus("")).toBe("UNKNOWN");
    expect(computeScorePercentile(0)).toBe(0);
    expect(computeScorePercentile(80)).toBeGreaterThan(50);
  });
});
