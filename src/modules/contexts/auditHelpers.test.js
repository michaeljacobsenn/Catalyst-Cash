import { describe, expect, it, vi } from "vitest";
import {
  buildContributionAutoUpdates,
  hasCompletedAuditForSession,
  migrateHistory,
  matchesAuditRecord,
  removeAuditRecord,
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

  it("matches legacy audit records without timestamps by fallback fingerprint", () => {
    const left = {
      date: "2026-04-16",
      parsed: { healthScore: { score: 82, grade: "B" }, netWorth: 42000, status: "GREEN: Stable", mode: "NORMAL" },
      model: "gpt-5.4",
      isTest: false,
    };
    const right = {
      date: "2026-04-16",
      parsed: { healthScore: { score: 82, grade: "B" }, netWorth: 42000, status: "GREEN: Stable", mode: "NORMAL" },
      model: "gpt-5.4",
      isTest: false,
    };
    expect(matchesAuditRecord(left, right)).toBe(true);
  });

  it("removes only the first matching audit when legacy duplicates exist", () => {
    const auditA = {
      date: "2026-04-16",
      parsed: { healthScore: { score: 82, grade: "B" }, netWorth: 42000, status: "GREEN: Stable", mode: "NORMAL" },
      model: "gpt-5.4",
      isTest: false,
    };
    const auditB = { ...auditA };
    const history = [auditA, auditB];
    expect(removeAuditRecord(history, auditA)).toEqual([auditB]);
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
