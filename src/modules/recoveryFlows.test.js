import { describe, expect, it, vi } from "vitest";
import { buildSettingsRefreshActions, runSecurityDataDeletion } from "./recoveryFlows.js";

describe("recoveryFlows", () => {
  it("keeps overlay restore actions explicit instead of using a reload shortcut", () => {
    const onRestoreComplete = vi.fn();
    const onHouseholdSyncConfigured = vi.fn();

    expect(
      buildSettingsRefreshActions({
        onRestoreComplete,
        onHouseholdSyncConfigured,
      })
    ).toEqual({
      onRestoreComplete,
      onHouseholdSyncConfigured,
    });
  });

  it("delegates security deletion to the app reset flow when available", async () => {
    const onConfirmDataDeletion = vi.fn().mockResolvedValue(undefined);
    const fallbackDelete = vi.fn().mockResolvedValue(undefined);

    await expect(runSecurityDataDeletion(onConfirmDataDeletion, fallbackDelete)).resolves.toBe("delegated");
    expect(onConfirmDataDeletion).toHaveBeenCalledTimes(1);
    expect(fallbackDelete).not.toHaveBeenCalled();
  });

  it("falls back to local deletion only when no app reset handler is supplied", async () => {
    const fallbackDelete = vi.fn().mockResolvedValue(undefined);

    await expect(runSecurityDataDeletion(undefined, fallbackDelete)).resolves.toBe("fallback");
    expect(fallbackDelete).toHaveBeenCalledTimes(1);
  });
});
