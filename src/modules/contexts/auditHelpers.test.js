import { describe, expect, it, vi } from "vitest";
import {
  buildContributionAutoUpdates,
  hasCompletedAuditForSession,
  migrateHistory,
  scrubPromptContext,
} from "./auditHelpers.ts";

describe("auditHelpers", () => {
  it("migrates history items missing moveChecks", () => {
    const persist = vi.fn();
    const history = [{ ts: "1" }, { ts: "2", moveChecks: { ready: true } }];
    const migrated = migrateHistory(history, persist);
    expect(migrated?.[0].moveChecks).toEqual({});
    expect(migrated?.[1].moveChecks).toEqual({ ready: true });
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("scrubs nested prompt context values", () => {
    const scrubbed = scrubPromptContext(
      { top: "secret", nested: [{ value: "secret" }, 42] },
      (value) => value.replaceAll("secret", "redacted")
    );
    expect(scrubbed).toEqual({ top: "redacted", nested: [{ value: "redacted" }, 42] });
  });

  it("detects completed sessions from current or history", () => {
    const draft = { sessionTs: "abc", raw: "partial", updatedAt: "now" };
    expect(hasCompletedAuditForSession(draft, { ts: "abc" }, [])).toBe(true);
    expect(hasCompletedAuditForSession(draft, null, [{ ts: "abc" }])).toBe(true);
    expect(hasCompletedAuditForSession(draft, null, [{ ts: "other" }])).toBe(false);
  });

  it("computes contribution auto-updates from parsed moves", () => {
    const updates = buildContributionAutoUpdates(
      { structured: { moves: ["Route $300 to Roth IRA.", "Increase 401k by $200."] } },
      "",
      {
        trackRothContributions: true,
        autoTrackRothYTD: true,
        rothContributedYTD: 1000,
        rothAnnualLimit: 7000,
        track401k: true,
        autoTrack401kYTD: true,
        k401ContributedYTD: 1500,
        k401AnnualLimit: 23000,
      }
    );
    expect(updates).toEqual({
      rothContributedYTD: 1300,
      k401ContributedYTD: 1700,
    });
  });
});
