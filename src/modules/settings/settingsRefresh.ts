export function scheduleRestoreRefresh(onRestoreComplete?: (() => void | Promise<void>) | null): void {
  if (!onRestoreComplete) return;
  setTimeout(() => {
    void onRestoreComplete();
  }, 1500);
}

export function scheduleHouseholdSyncRefresh(
  householdId: string,
  onHouseholdSyncConfigured?: (() => void | Promise<void>) | null
): void {
  if (!householdId || !onHouseholdSyncConfigured) return;
  setTimeout(() => {
    void onHouseholdSyncConfigured();
  }, 1500);
}
