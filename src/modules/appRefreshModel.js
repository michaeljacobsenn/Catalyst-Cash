export async function refreshAppState({
  rehydrateSettings,
  rehydrateSecurity,
  rehydratePortfolio,
  rehydrateAudit,
  rehydrateNavigation,
  resetNavigationState,
  clearUiState,
  nextTab = "dashboard",
}) {
  await Promise.all([
    rehydrateSettings(),
    rehydrateSecurity(),
    rehydratePortfolio(),
    rehydrateAudit(),
    rehydrateNavigation(),
  ]);
  clearUiState?.();
  resetNavigationState?.(nextTab);
}

export async function resetAppState({
  clearDb,
  deleteSecrets,
  refresh,
}) {
  await clearDb();
  await Promise.all((deleteSecrets || []).map((deleteSecret) => Promise.resolve(deleteSecret()).catch(() => {})));
  await refresh();
}
