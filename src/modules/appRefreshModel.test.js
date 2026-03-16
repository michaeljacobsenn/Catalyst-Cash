import { describe, expect, it, vi } from "vitest";
import { refreshAppState, resetAppState } from "./appRefreshModel.js";

describe("appRefreshModel", () => {
  it("rehydrates all stores for restore and sync flows", async () => {
    const deps = {
      rehydrateSettings: vi.fn().mockResolvedValue(undefined),
      rehydrateSecurity: vi.fn().mockResolvedValue(undefined),
      rehydratePortfolio: vi.fn().mockResolvedValue(undefined),
      rehydrateAudit: vi.fn().mockResolvedValue(undefined),
      rehydrateNavigation: vi.fn().mockResolvedValue(undefined),
      resetNavigationState: vi.fn(),
      clearUiState: vi.fn(),
      nextTab: "dashboard",
    };

    await refreshAppState(deps);

    expect(deps.rehydrateSettings).toHaveBeenCalledTimes(1);
    expect(deps.rehydrateSecurity).toHaveBeenCalledTimes(1);
    expect(deps.rehydratePortfolio).toHaveBeenCalledTimes(1);
    expect(deps.rehydrateAudit).toHaveBeenCalledTimes(1);
    expect(deps.rehydrateNavigation).toHaveBeenCalledTimes(1);
    expect(deps.clearUiState).toHaveBeenCalledTimes(1);
    expect(deps.resetNavigationState).toHaveBeenCalledWith("dashboard");
  });

  it("resets app state without relying on a page reload", async () => {
    const callOrder = [];
    const clearDb = vi.fn().mockImplementation(async () => {
      callOrder.push("clearDb");
    });
    const deleteSecrets = [
      vi.fn().mockImplementation(async () => {
        callOrder.push("deleteSecretA");
      }),
      vi.fn().mockImplementation(async () => {
        callOrder.push("deleteSecretB");
      }),
    ];
    const refresh = vi.fn().mockImplementation(async () => {
      callOrder.push("refresh");
    });

    await resetAppState({ clearDb, deleteSecrets, refresh });

    expect(clearDb).toHaveBeenCalledTimes(1);
    expect(deleteSecrets[0]).toHaveBeenCalledTimes(1);
    expect(deleteSecrets[1]).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(callOrder[0]).toBe("clearDb");
    expect(callOrder.at(-1)).toBe("refresh");
  });
});
