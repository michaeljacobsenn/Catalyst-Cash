import { describe, expect, it, vi } from "vitest";
import { scheduleHouseholdSyncRefresh, scheduleRestoreRefresh } from "./SettingsTab.js";

describe("SettingsTab refresh scheduling", () => {
  it("schedules restore completion without a hard reload", () => {
    vi.useFakeTimers();
    const onRestoreComplete = vi.fn();

    scheduleRestoreRefresh(onRestoreComplete);
    expect(onRestoreComplete).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1500);
    expect(onRestoreComplete).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("only schedules household sync refresh when a household is linked", () => {
    vi.useFakeTimers();
    const onHouseholdSyncConfigured = vi.fn();

    scheduleHouseholdSyncRefresh("", onHouseholdSyncConfigured);
    vi.advanceTimersByTime(1500);
    expect(onHouseholdSyncConfigured).not.toHaveBeenCalled();

    scheduleHouseholdSyncRefresh("FamilyOne", onHouseholdSyncConfigured);
    vi.advanceTimersByTime(1500);
    expect(onHouseholdSyncConfigured).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
