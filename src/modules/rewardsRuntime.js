export const REWARDS_RUNTIME_UPDATED_EVENT = "catalyst:rewards-runtime-updated";

export function emitRewardsRuntimeUpdated(detail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(REWARDS_RUNTIME_UPDATED_EVENT, {
      detail: {
        at: new Date().toISOString(),
        ...detail,
      },
    })
  );
}
