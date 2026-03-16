export function buildSettingsRefreshActions({ onRestoreComplete, onHouseholdSyncConfigured }) {
  return {
    onRestoreComplete,
    onHouseholdSyncConfigured,
  };
}

export async function runSecurityDataDeletion(onConfirmDataDeletion, fallbackDelete) {
  if (onConfirmDataDeletion) {
    await onConfirmDataDeletion();
    return "delegated";
  }
  await fallbackDelete();
  return "fallback";
}
