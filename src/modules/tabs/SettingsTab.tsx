  import type { ChangeEvent,TouchEvent as ReactTouchEvent } from "react";
  import { lazy,Suspense,useCallback,useEffect,useRef,useState } from "react";
  import { normalizeAppError } from "../appErrors.js";
  import { APP_VERSION,T } from "../constants.js";
  import { CURRENCIES } from "../currency.js";
  import {
    ArrowLeft,
  } from "../icons";
  import { log } from "../logger.js";
  import { AI_PROVIDERS,getProvider } from "../providers.js";
  import { isSecuritySensitiveKey,sanitizePlaidForBackup } from "../securityKeys.js";
  import { Card } from "../ui.js";
  import { db,FaceId } from "../utils.js";

  import { Capacitor } from "@capacitor/core";
  import { haptic } from "../haptics.js";
  import {
    clearHouseholdCredentials,
    migrateHouseholdCredentials,
    setHouseholdCredentials,
  } from "../householdSecrets.js";
  import { DeveloperToolsSection, RootSettingsSection } from "../settings/SettingsHomeSections.js";
  import { scheduleHouseholdSyncRefresh, scheduleRestoreRefresh } from "../settings/settingsRefresh.js";
  import { HouseholdSyncModal, PassphraseModal } from "../settings/SettingsTabModals.js";

  import {
    applyFullProfileQaSeed,
    FULL_PROFILE_QA_BANKS,
    FULL_PROFILE_QA_CARDS,
    FULL_PROFILE_QA_CONFIG,
    FULL_PROFILE_QA_LABEL,
    FULL_PROFILE_QA_RENEWALS,
  } from "../qaSeed.js";
  import { deleteSecureItem,setSecureItem } from "../secureStore.js";
  import AISection from "../settings/AISection.js";
  import BackupSection from "../settings/BackupSection.js";
  import { AppearanceSection } from "../settings/AppearanceSection.js";
  import { FinanceProfileSection } from "../settings/FinanceProfileSection.js";
  import SecuritySection from "../settings/SecuritySection.js";
  import { getRawTier,shouldShowGating } from "../subscription.js";
const LazyPlaidSection = lazy(() => import("../settings/PlaidSection.js"));

const ENABLE_PLAID = true; // Toggle to false to hide, true to show Plaid integration
const LazyProPaywall = lazy(() => import("./ProPaywall.js"));
const loadBackupModule = () => import("../backup.js");
const loadSpreadsheetModule = () => import("../spreadsheet.js");
const loadAppleSignIn = () => import("@capacitor-community/apple-sign-in");
const loadCloudSync = () => import("../cloudSync.js");
const loadRevenueCat = () => import("../revenuecat.js");

  import { useAudit } from "../contexts/AuditContext.js";
  import { useNavigation } from "../contexts/NavigationContext.js";
  import { usePortfolio } from "../contexts/PortfolioContext.js";
  import { useSecurity } from "../contexts/SecurityContext.js";
  import { useSettings } from "../contexts/SettingsContext.js";

type ProviderModel = (typeof AI_PROVIDERS)[number]["models"][number];
type ProviderConfig = (typeof AI_PROVIDERS)[number];
type SettingsActiveSegment = "app";
type SettingsMenu = "finance" | "profile" | "ai" | "backup" | "dev" | "security" | "plaid" | null;

interface PassphraseModalState {
  open: boolean;
  mode: "export" | "import";
  label: string;
  resolve: ((value: string) => void) | null;
  value: string;
}

interface SettingsTabProps {
  onClear?: () => void | Promise<void>;
  onFactoryReset?: () => void | Promise<void>;
  onClearDemoData?: () => void | Promise<void>;
  onBack?: () => void;
  onRestoreComplete?: () => void | Promise<void>;
  onHouseholdSyncConfigured?: () => void | Promise<void>;
  onShowGuide?: () => void;
  proEnabled?: boolean;
}

export { scheduleHouseholdSyncRefresh, scheduleRestoreRefresh } from "../settings/settingsRefresh.js";

export default function SettingsTab({
  onClear,
  onFactoryReset,
  onClearDemoData,
  onBack,
  onRestoreComplete,
  onHouseholdSyncConfigured,
  onShowGuide,
  proEnabled = false,
}: SettingsTabProps) {
  const { useStreaming, setUseStreaming } = useAudit();
  const {
    apiKey,
    setApiKey,
    aiProvider,
    setAiProvider,
    aiModel,
    setAiModel,
    financialConfig,
    setFinancialConfig,
    personalRules,
    setPersonalRules,
    autoBackupInterval,
    setAutoBackupInterval,
  } = useSettings();
  const {
    requireAuth,
    setRequireAuth,
    appPasscode,
    setAppPasscode,
    useFaceId,
    setUseFaceId,
    lockTimeout,
    setLockTimeout,
    appleLinkedId,
    setAppleLinkedId,
    secretStorageStatus,
  } = useSecurity();
  const {
    cards,
    setCards,
    bankAccounts,
    setBankAccounts,
    cardCatalog,
    renewals,
    setRenewals,
    refreshLiabilities,
  } = usePortfolio();
  const { navTo } = useNavigation();

  // Auth Plugins state management
  const [lastBackupTS, setLastBackupTS] = useState<number | null>(null);

  const [householdId, setHouseholdId] = useState("");
  const [householdPasscode, setHouseholdPasscode] = useState("");
  const [showHouseholdModal, setShowHouseholdModal] = useState(false);
  const [hsInputId, setHsInputId] = useState("");
  const [hsInputPasscode, setHsInputPasscode] = useState("");

  useEffect(() => {
    // Initialization now handled at root level in App.jsx
    db.get("last-backup-ts").then(ts => setLastBackupTS(ts)).catch(() => { });
    migrateHouseholdCredentials()
      .then(({ householdId: nextId, passcode }) => {
        setHouseholdId(nextId || "");
        setHsInputId(nextId || "");
        setHouseholdPasscode(passcode || "");
        setHsInputPasscode(passcode || "");
      })
      .catch(() => {});
    getRawTier().then(tier => setRawTierId(tier.id === "pro" ? "pro" : "free")).catch(() => setRawTierId("free"));
  }, []);

  // ── Auto-backup scheduling ──────────────────────────────────
  // When Apple Sign-In is linked and an auto-backup interval is
  // configured, check on mount and periodically whether enough
  // time has elapsed since the last backup. If so, trigger a
  // silent iCloud backup in the background.
  useEffect(() => {
    if (!appleLinkedId || autoBackupInterval === "off") return;

    const intervalMs = {
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000,
      monthly: 30 * 24 * 60 * 60 * 1000,
    }[autoBackupInterval];

    if (!intervalMs) return;

    const checkAndBackup = async () => {
      try {
        const { uploadToICloud } = await loadCloudSync();
        const ts = await db.get("last-backup-ts");
        const elapsed = Date.now() - (ts || 0);
        if (elapsed >= intervalMs) {
          // Build a backup payload (mirrors forceICloudSync logic)
          const backup = { app: "Catalyst Cash", version: APP_VERSION, exportedAt: new Date().toISOString(), data: {} };
          const keys = await db.keys();
          for (const key of keys) {
            if (isSecuritySensitiveKey(key)) continue;
            const val = await db.get(key);
            if (val !== null) backup.data[key] = val;
          }
          if (!("personal-rules" in backup.data)) {
            backup.data["personal-rules"] = personalRules ?? "";
          }
          // Include sanitized Plaid metadata for reconnect deduplication
          const plaidConns = await db.get("plaid-connections");
          if (Array.isArray(plaidConns) && plaidConns.length > 0) {
            backup.data["plaid-connections-sanitized"] = sanitizePlaidForBackup(plaidConns);
          }
          const success = await uploadToICloud(backup, appPasscode || null);
          if (success) {
            const now = Date.now();
            await db.set("last-backup-ts", now);
            setLastBackupTS(now);
            log.info("Auto-backup to iCloud completed successfully.");
          } else {
            log.warn("icloud", "Auto-backup returned false");
          }
        }
      } catch (e) {
        const failure = normalizeAppError(e, { context: "restore" });
        log.warn("icloud", "Auto-backup failed", { error: failure.rawMessage, kind: failure.kind });
      }
    };

    // Run immediately on mount / when settings change
    checkAndBackup();

    // Also re-check every 60 seconds so that if the user leaves the
    // settings tab open for a long session, the backup still fires
    // once the interval elapses.
    const timer = setInterval(checkAndBackup, 60 * 1000);
    return () => clearInterval(timer);
  }, [appleLinkedId, autoBackupInterval, appPasscode, personalRules]);

  const handleAppleSignIn = async () => {
    if (Capacitor.getPlatform() === "web") {
      window.toast?.error?.("Apple Sign-In and iCloud backup are available in the native iPhone app only.");
      return;
    }
    try {
      const { SignInWithApple } = await loadAppleSignIn();
      if (!SignInWithApple?.authorize) {
        window.toast?.error?.("Apple Sign-In is not available in this build.");
        return;
      }
      const result = await SignInWithApple.authorize({
        clientId: "com.jacobsen.portfoliopro",
        redirectURI: "https://api.catalystcash.app/auth/apple/callback",
        scopes: "email name",
      });
      const userIdentifier = result.response.user;
      setAppleLinkedId(userIdentifier);
      window.toast?.success?.("Apple ID linked for app unlock and iCloud backup.");
    } catch (error) {
      const failure = normalizeAppError(error, { context: "security" });
      log.warn("security", "Apple Sign-In failed", { error: failure.rawMessage, kind: failure.kind });
      const raw = String(failure.rawMessage || "").toLowerCase();
      window.toast?.error?.(
        raw.includes("not implemented") || raw.includes("unimplemented")
          ? "Apple Sign-In is not enabled in this build."
          : "Apple Sign-In couldn't be completed."
      );
    }
  };

  const unlinkApple = () => {
    db.del("last-backup-ts");
    if (setAutoBackupInterval) {
      setAutoBackupInterval("off");
      db.set("auto-backup-interval", "off");
    }
    setAppleLinkedId(null);
    setLastBackupTS(null);
    window.toast?.success?.("Apple ID unlinked");
  };


  useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmFactoryReset, setConfirmFactoryReset] = useState(false);
  const [confirmDataDeletion, setConfirmDataDeletion] = useState(false);
  const [deletionInProgress, setDeletionInProgress] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
  const [activeSegment] = useState<SettingsActiveSegment>("app");
  const [activeMenu, setActiveMenu] = useState<SettingsMenu>(null);
  useState(false);
  const [rawTierId, setRawTierId] = useState<"free" | "pro">("free");
  const [ppModal, setPpModal] = useState<PassphraseModalState>({ open: false, mode: "export", label: "", resolve: null, value: "" });
  const [setupDismissed, setSetupDismissed] = useState(() => !!localStorage.getItem("setup-progress-dismissed"));
  const [showApiSetup, setShowApiSetup] = useState(Boolean((apiKey || "").trim()));
  const [showPaywall, setShowPaywall] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const swipeTouchStart = useRef<{ x: number; y: number } | null>(null);
  const navDir = useRef("forward"); // tracks animation direction: 'forward' | 'back'

  const [isForceSyncing, setIsForceSyncing] = useState(false);

  const forceICloudSync = async () => {
    setIsForceSyncing(true);
    try {
      if (Capacitor.getPlatform() === "web") {
        window.toast?.error?.("Automatic iCloud backup is available in the native iPhone app only.");
        return;
      }
      const { uploadToICloud } = await loadCloudSync();
      const backup = { app: "Catalyst Cash", version: APP_VERSION, exportedAt: new Date().toISOString(), data: {} };
      const keys = await db.keys();
      for (const key of keys) {
        if (isSecuritySensitiveKey(key)) continue;
        const val = await db.get(key);
        if (val !== null) backup.data[key] = val;
      }
      if (!("personal-rules" in backup.data)) {
        backup.data["personal-rules"] = personalRules ?? "";
      }
      // Include sanitized Plaid metadata for reconnect deduplication
      const plaidConns2 = await db.get("plaid-connections");
      if (Array.isArray(plaidConns2) && plaidConns2.length > 0) {
        backup.data["plaid-connections-sanitized"] = sanitizePlaidForBackup(plaidConns2);
      }
      const success = await uploadToICloud(backup, appPasscode || null);
      if (success) {
        const now = Date.now();
        await db.set("last-backup-ts", now);
        setLastBackupTS(now);
        window.toast?.success?.("Backup saved to iCloud Drive");
      } else {
        window.toast?.error?.("Backup could not be verified in iCloud Drive");
      }
    } catch (e) {
      const failure = normalizeAppError(e, { context: "restore" });
      log.error("icloud", "Manual iCloud backup failed", { error: failure.rawMessage, kind: failure.kind });
      window.toast?.error?.("Catalyst couldn't complete the iCloud backup. Your data is still on this device.");
    } finally {
      setIsForceSyncing(false);
    }
  };

  const handleLoadFullProfileQaSeed = useCallback(async () => {
    try {
      await applyFullProfileQaSeed(db);
      setFinancialConfig((prev) => ({ ...prev, ...FULL_PROFILE_QA_CONFIG }));
      setCards(FULL_PROFILE_QA_CARDS.map((card) => ({ ...card })));
      setBankAccounts(FULL_PROFILE_QA_BANKS.map((account) => ({ ...account })));
      setRenewals(FULL_PROFILE_QA_RENEWALS.map((renewal) => ({ ...renewal })));
      setAiProvider("backend");
      setAiModel("gemini-2.5-flash");
      setPersonalRules("Prioritize cash safety first, then highest-interest debt payoff.");
      await refreshLiabilities?.();
      window.toast?.success?.(`${FULL_PROFILE_QA_LABEL} loaded. Review the audit inputs and run a full test.`);
      navTo("input");
    } catch (error) {
      const failure = normalizeAppError(error, { context: "restore" });
      log.error("settings", "Failed to load QA seed", { error: failure.rawMessage, kind: failure.kind });
      window.toast?.error?.("Failed to load the QA test profile.");
    }
  }, [
    navTo,
    refreshLiabilities,
    setAiModel,
    setAiProvider,
    setBankAccounts,
    setCards,
    setFinancialConfig,
    setPersonalRules,
    setRenewals,
  ]);

  const handleSwipeTouchStart = useCallback((e: ReactTouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    swipeTouchStart.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleSwipeTouchEnd = useCallback(
    (e: ReactTouchEvent<HTMLDivElement>) => {
      if (!swipeTouchStart.current) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - swipeTouchStart.current.x;
      const dy = Math.abs(touch.clientY - swipeTouchStart.current.y);
      // Swipe right at least 60px, starting from left 80px, not too vertical
      if (dx > 60 && swipeTouchStart.current.x < 80 && dy < 100) {
        if (activeMenu) {
          navDir.current = "back";
          setActiveMenu(null);
          haptic.light();
        } else if (onBack) {
          onBack();
          haptic.light();
        }
      }
      swipeTouchStart.current = null;
    },
    [activeMenu, onBack]
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [activeMenu, activeSegment]);

  const showPassphraseModal = (mode: "export" | "import"): Promise<string> =>
    new Promise((resolve) => {
      const label =
        mode === "export"
          ? "Create a passphrase to encrypt this backup. You will need it to restore."
          : "Enter the passphrase for this encrypted backup.";
      setPpModal({ open: true, mode, label, resolve, value: "" });
    });
  const ppConfirm = () => {
    const r = ppModal.resolve;
    setPpModal(m => ({ ...m, open: false, resolve: null }));
    if (r) r(ppModal.value || "");
  };
  const ppCancel = () => {
    const r = ppModal.resolve;
    setPpModal(m => ({ ...m, open: false, resolve: null }));
    if (r) r("");
  };

  const handlePasscodeChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (secretStorageStatus.mode === "native-unavailable") {
      window.toast?.error?.("Secure storage is unavailable on this device. App Passcode is disabled until it is restored.");
      return;
    }
    const val = e.target.value.replace(/[^0-9]/g, "").slice(0, 4);
    setAppPasscode(val);
    if (val.length < 4 && requireAuth) {
      setRequireAuth(false);
      db.set("require-auth", false);
      setUseFaceId(false);
      db.set("use-face-id", false);
      setLockTimeout(0);
      db.set("lock-timeout", 0);
    }
  };

  const handleRequireAuthToggle = (enable: boolean) => {
    if (secretStorageStatus.mode === "native-unavailable") {
      window.toast?.error?.("App Lock requires native secure storage, which is currently unavailable.");
      return;
    }
    if (enable && appPasscode?.length !== 4) {
      window.toast?.error?.("Set a 4-digit App Passcode first");
      return;
    }
    setRequireAuth(enable);
    db.set("require-auth", enable);
    if (enable) {
      setLockTimeout(300);
      db.set("lock-timeout", 300);
      window.toast?.success?.("App Lock enabled with Passcode");
    } else {
      setUseFaceId(false);
      db.set("use-face-id", false);
      setLockTimeout(0);
      db.set("lock-timeout", 0);
    }
  };

  const handleUseFaceIdToggle = async (enable: boolean) => {
    if (secretStorageStatus.mode === "native-unavailable") {
      window.toast?.error?.("Biometric unlock requires native secure storage, which is currently unavailable.");
      return;
    }
    if (!enable) {
      setUseFaceId(false);
      db.set("use-face-id", false);
      return;
    }

    if (Capacitor.getPlatform() === "web") {
      window.toast?.error?.("Face ID / Touch ID is not available on web");
      return;
    }

    try {
      const availability = await FaceId.isAvailable();
      if (!availability?.isAvailable) {
        window.toast?.error?.("No biometrics set up on this device.");
        return;
      }

      window.__biometricActive = true;
      await FaceId.authenticate({ reason: "Verify to enable Face ID / Touch ID for app lock" });

      haptic.success();
      setUseFaceId(true);
      db.set("use-face-id", true);
      window.toast?.success?.("Biometric Unlock Enabled");
    } catch (e) {
      const failure = normalizeAppError(e, { context: "security" });
      log.warn("security", "Failed to enable biometrics", { error: failure.rawMessage, kind: failure.kind });
      haptic.error();
      window.toast?.error?.("Catalyst couldn't verify biometrics on this device.");
    } finally {
      setTimeout(() => {
        window.__biometricActive = false;
      }, 1000);
    }
  };
  const [statusMsg, setStatusMsg] = useState("");

  const currentProviderCandidate = getProvider(aiProvider || "gemini") ?? AI_PROVIDERS[0];
  if (!currentProviderCandidate) {
    throw new Error("No AI providers configured");
  }
  const currentProvider: ProviderConfig = currentProviderCandidate;
  const currentModels = currentProvider.models;
  const selectedModelCandidate = currentModels.find(m => m.id === aiModel) || currentModels[0];
  if (!selectedModelCandidate) {
    throw new Error(`No models configured for provider ${currentProvider.id}`);
  }
  const selectedModel: ProviderModel = selectedModelCandidate;
  const isNonGemini = (aiProvider || "gemini") !== "gemini";
  const hasApiKey = Boolean((apiKey || "").trim());
  const gatingVisible = shouldShowGating();
  const hasPremiumModelAccess = proEnabled || !gatingVisible;
  const currencyLabel = CURRENCIES.find(currency => currency.code === (financialConfig?.currencyCode || "USD"))?.label || "USD ($)";
  const payFrequencyLabel =
    financialConfig?.payFrequency === "weekly"
      ? "Weekly"
      : financialConfig?.payFrequency === "semi-monthly"
        ? "Semi-monthly"
        : financialConfig?.payFrequency === "monthly"
          ? "Monthly"
          : "Bi-weekly";
  const incomeSummary =
    financialConfig?.incomeType === "hourly"
      ? financialConfig?.hourlyRateNet
        ? `$${financialConfig.hourlyRateNet}/hr`
        : "Hourly profile"
      : financialConfig?.incomeType === "variable"
        ? financialConfig?.averagePaycheck
          ? `Avg $${financialConfig.averagePaycheck}`
          : "Variable income"
        : financialConfig?.paycheckStandard
          ? `$${financialConfig.paycheckStandard}/check`
          : "Salary profile";
  const housingSummary =
    financialConfig?.housingType === "own"
      ? financialConfig?.mortgagePayment
        ? `Own · $${financialConfig.mortgagePayment}/mo`
        : "Own"
      : financialConfig?.housingType === "rent"
        ? financialConfig?.monthlyRent
          ? `Rent · $${financialConfig.monthlyRent}/mo`
          : "Rent"
        : "Not set";
  const financeSummaryItems = [
    { label: "Income", value: incomeSummary },
    { label: "Pay cadence", value: `${payFrequencyLabel}${financialConfig?.payday ? ` · ${financialConfig.payday}` : ""}` },
    { label: "Housing", value: housingSummary },
    { label: "Region", value: financialConfig?.stateCode || "Not in US" },
    { label: "Currency", value: currencyLabel },
    { label: "Profile", value: financialConfig?.birthYear ? `Born ${financialConfig.birthYear}` : "Demographics light" },
  ];

  useEffect(() => {
    if ((apiKey || "").trim()) setShowApiSetup(true);
  }, [apiKey]);

  const Toggle = ({ value, onChange }) => (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 48,
        height: 28,
        minWidth: 48,
        minHeight: 28,
        borderRadius: 14,
        border: "none",
        padding: 0,
        margin: 0,
        WebkitAppearance: "none",
        appearance: "none",
        background: value ? T.accent.primary : T.text.muted,
        cursor: "pointer",
        position: "relative",
        flexShrink: 0,
        transition: "background .25s ease",
        boxShadow: value ? `0 0 10px ${T.accent.primaryDim}` : "none",
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          background: "white",
          position: "absolute",
          top: 3,
          left: value ? 23 : 3,
          transition: "left .25s cubic-bezier(.16,1,.3,1)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }}
      />
    </button>
  );

  const handleExport = async () => {
    setRestoreStatus(null);
    setStatusMsg("");
    try {
      const passphrase = await showPassphraseModal("export");
      if (!passphrase) {
        setBackupStatus(null);
        return;
      }
      setBackupStatus("exporting");
      const { exportBackup } = await loadBackupModule();
      const { count, plaidConnectionCount } = await exportBackup(passphrase);
      setBackupStatus("done");
      setStatusMsg(
        `Encrypted backup saved with ${count} data keys${plaidConnectionCount > 0 ? ` and ${plaidConnectionCount} reconnect-ready bank ${plaidConnectionCount === 1 ? "profile" : "profiles"}` : ""}.`
      );
    } catch (e) {
      setBackupStatus("error");
      setStatusMsg(e instanceof Error ? e.message : "Export failed");
    }
  };

  const handleExportSheet = async () => {
    setRestoreStatus(null);
    setStatusMsg("");
    try {
      const passphrase = await showPassphraseModal("export");
      if (!passphrase) {
        setBackupStatus(null);
        return;
      }
      setBackupStatus("exporting");
      const { generateBackupSpreadsheet } = await loadSpreadsheetModule();
      await (generateBackupSpreadsheet as unknown as (passphrase: string) => Promise<void>)(passphrase);
      setBackupStatus("done");
      setStatusMsg("Exported encrypted spreadsheet backup.");
    } catch (e) {
      setBackupStatus("error");
      setStatusMsg(e instanceof Error ? e.message : "Export failed");
    }
  };

  const handleImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setBackupStatus(null);
    setStatusMsg("");
    try {
      const { importBackup, isSupportedBackupFile } = await loadBackupModule();
      if (!isSupportedBackupFile(file)) {
        throw new Error("Unsupported backup file — choose a Catalyst Cash .enc or .json backup.");
      }
      const { count, exportedAt, plaidReconnectCount } = await importBackup(file, () => showPassphraseModal("import"));
      setRestoreStatus("done");
      const dateStr = exportedAt ? new Date(exportedAt).toLocaleDateString() : "unknown date";
      setStatusMsg(
        `Restored ${count} items from backup dated ${dateStr}.${plaidReconnectCount > 0 ? ` ${plaidReconnectCount} bank ${plaidReconnectCount === 1 ? "connection now shows" : "connections now show"} Reconnect required.` : ""}`
      );
      scheduleRestoreRefresh(onRestoreComplete);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Import failed";
      const cancelled = message.includes("cancelled");
      if (cancelled) {
        setRestoreStatus(null);
        return;
      }
      setRestoreStatus("error");
      setStatusMsg(message);
    }
  };

  const handleKeyChange = (val: string) => {
    const normalized = (val || "").trim();
    setApiKey(normalized);
    // Save to provider-specific slot immediately
    if (currentProvider.keyStorageKey) {
      if (normalized) {
        void setSecureItem(currentProvider.keyStorageKey, normalized).then(saved => {
          if (!saved) {
            setApiKey("");
            window.toast?.error?.("Secure storage is unavailable. API keys cannot be saved on this device right now.");
          }
        });
      }
      else void deleteSecureItem(currentProvider.keyStorageKey);
    }
  };

  return (
    <div
      className="slide-pane"
      style={{
        position: "relative",
        background: T.bg.base,
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <HouseholdSyncModal
        open={showHouseholdModal}
        hsInputId={hsInputId}
        hsInputPasscode={hsInputPasscode}
        setHsInputId={setHsInputId}
        setHsInputPasscode={setHsInputPasscode}
        onClose={() => setShowHouseholdModal(false)}
        onSave={async () => {
          if (!secretStorageStatus.canPersistSecrets) {
            setShowHouseholdModal(false);
            window.toast?.error?.("Household Sync requires secure device storage in the native iPhone app.");
            return;
          }
          const nid = hsInputId.trim();
          const np = hsInputPasscode.trim();
          if (nid && np) await setHouseholdCredentials(nid, np);
          else await clearHouseholdCredentials();
          setHouseholdId(nid);
          setHouseholdPasscode(np);
          setShowHouseholdModal(false);
          window.toast?.success?.(nid ? "Household linked. Initializing sync..." : "Household disconnected.");
          scheduleHouseholdSyncRefresh(nid, onHouseholdSyncConfigured);
        }}
      />
      <PassphraseModal
        open={ppModal.open}
        mode={ppModal.mode}
        label={ppModal.label}
        value={ppModal.value}
        setValue={(value) => setPpModal((current) => ({ ...current, value }))}
        onCancel={ppCancel}
        onConfirm={ppConfirm}
      />
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 6px)",
          paddingLeft: 16,
          paddingRight: 16,
          paddingBottom: 10,
          background: T.bg.navGlass,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: `1px solid ${T.border.subtle}`,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ width: 36 }}>
          {(onBack || activeMenu) && (
            <button
              onClick={() => {
                if (activeMenu) {
                  navDir.current = "back";
                  setActiveMenu(null);
                  haptic.light();
                } else if (onBack) {
                  onBack();
                }
              }}
              aria-label={activeMenu ? "Back to Settings" : "Close Settings"}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border: `1px solid ${T.border.default}`,
                background: T.bg.elevated,
                color: T.text.secondary,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ArrowLeft size={16} />
            </button>
          )}
        </div>
        <div style={{ textAlign: "center", flex: 1, minWidth: 0, overflow: "hidden" }}>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: T.text.primary,
              margin: 0,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {activeMenu === "ai"
              ? "AI & Engine"
              : activeMenu === "backup"
                ? "Backup & Data"
                : activeMenu === "finance"
                  ? "Financial Profile"
                  : activeMenu === "plaid"
                    ? "Bank Connections"
                    : activeMenu === "security"
                      ? "Security"
                      : activeMenu === "profile"
                        ? "Appearance"
                        : activeMenu === "dev"
                          ? "Developer Tools"
                          : "Settings"}
          </h1>
          {!activeMenu && (
            <p style={{ fontSize: 10, color: T.text.dim, marginTop: 3, fontFamily: T.font.mono, margin: 0 }}>
              VERSION {APP_VERSION}
            </p>
          )}
        </div>
        <div style={{ width: 36 }}></div> {/* Spacer to preserve center alignment */}
      </div>
      {/* Scrollable body */}
      <div
        className="safe-scroll-body safe-bottom page-body"
        ref={scrollRef}
        onTouchStart={handleSwipeTouchStart}
        onTouchEnd={handleSwipeTouchEnd}
        style={{
          flex: 1,
          WebkitOverflowScrolling: "touch",
          paddingTop: 8,
          overflowY: "auto",
          overscrollBehavior: "contain",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ width: "100%", maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", flex: 1, padding: "0 0 12px" }}>
        <div
          key={activeMenu || "root"}
          style={{
            animation: activeMenu
              ? navDir.current === "forward"
                ? "settingsSlideIn .32s cubic-bezier(.16,1,.3,1) both"
                : "settingsSlideOut .32s cubic-bezier(.16,1,.3,1) both"
              : navDir.current === "back"
                ? "settingsSlideOut .32s cubic-bezier(.16,1,.3,1) both"
                : "settingsSlideIn .32s cubic-bezier(.16,1,.3,1) both",
            display: "flex",
            flexDirection: "column",
            flex: 1,
            marginTop: 0,
          }}
        >
          {!activeMenu && (
            <RootSettingsSection
              enablePlaid={ENABLE_PLAID}
              proEnabled={proEnabled}
              shouldShowGating={gatingVisible}
              activeMenu={activeMenu}
              onSelectMenu={(menu) => {
                setActiveMenu(menu);
                navDir.current = "forward";
                haptic.light();
              }}
              onGuide={() => {
                if (typeof onShowGuide === "function") onShowGuide();
              }}
              onManageSubscription={async () => {
                haptic.medium();
                const { presentCustomerCenter } = await loadRevenueCat();
                await presentCustomerCenter();
              }}
              onUpgrade={() => setShowPaywall(true)}
              financialConfig={financialConfig}
              cards={cards}
              renewals={renewals}
              navTo={(tabTarget) => {
                navTo(tabTarget);
                haptic.light();
              }}
              setupDismissed={setupDismissed}
              setSetupDismissed={setSetupDismissed}
              rawTierId={rawTierId}
            />
          )}

          <div style={{ display: activeMenu && activeSegment === "app" ? "block" : "none" }}>
            <FinanceProfileSection
              activeMenu={activeMenu}
              financialConfig={financialConfig}
              financeSummaryItems={financeSummaryItems}
              proEnabled={proEnabled}
              setFinancialConfig={setFinancialConfig}
              setShowPaywall={setShowPaywall}
            />

            <AppearanceSection activeMenu={activeMenu} Toggle={Toggle} />


            {/* ── AI Provider ─────────────────────────────────────── */}
            <AISection 
               activeMenu={activeMenu}
               aiModel={aiModel}
               setAiModel={setAiModel}
               setAiProvider={setAiProvider}
               useStreaming={useStreaming}
               setUseStreaming={setUseStreaming}
               currentProvider={currentProvider}
               selectedModel={selectedModel}
               showUpgradeCta={gatingVisible && !hasPremiumModelAccess}
               showModelSelector={hasPremiumModelAccess}
               setShowPaywall={setShowPaywall}
               apiKey={apiKey}
               setApiKey={setApiKey}
               handleKeyChange={handleKeyChange}
               isNonGemini={isNonGemini}
               hasApiKey={hasApiKey}
               showApiSetup={showApiSetup}
               setShowApiSetup={setShowApiSetup}
               personalRules={personalRules}
               setPersonalRules={setPersonalRules}
            />

            <BackupSection 
              activeMenu={activeMenu}
              backupStatus={backupStatus}
              setBackupStatus={setBackupStatus}
              restoreStatus={restoreStatus}
              setRestoreStatus={setRestoreStatus}
              statusMsg={statusMsg}
              setStatusMsg={setStatusMsg}
              handleExport={handleExport}
              handleExportSheet={handleExportSheet}
              handleImport={handleImport}
              householdId={householdId}
              secretStorageStatus={secretStorageStatus}
              setHouseholdId={setHouseholdId}
              householdPasscode={householdPasscode}
              setHouseholdPasscode={setHouseholdPasscode}
              showHouseholdModal={showHouseholdModal}
              setShowHouseholdModal={setShowHouseholdModal}
              hsInputId={hsInputId}
              setHsInputId={setHsInputId}
              hsInputPasscode={hsInputPasscode}
              setHsInputPasscode={setHsInputPasscode}
              appleLinkedId={appleLinkedId}
              handleAppleSignIn={handleAppleSignIn}
              unlinkApple={unlinkApple}
              autoBackupInterval={autoBackupInterval}
              setAutoBackupInterval={setAutoBackupInterval}
              lastBackupTS={lastBackupTS}
              isForceSyncing={isForceSyncing}
              forceICloudSync={forceICloudSync}
              onClear={onClear}
              onClearDemoData={onClearDemoData}
              onFactoryReset={onFactoryReset}
              confirmClear={confirmClear}
              setConfirmClear={setConfirmClear}
              confirmFactoryReset={confirmFactoryReset}
              setConfirmFactoryReset={setConfirmFactoryReset}
            />

            {/* ── Developer Tools ───────────────────────────────────────── */}
            <DeveloperToolsSection visible={activeMenu === "dev"} onLoadFullProfileQaSeed={handleLoadFullProfileQaSeed} />

            {/* ── Security Suite ───────────────────────────────────────── */}
              <SecuritySection
                 activeMenu={activeMenu}
                 appPasscode={appPasscode}
                 handlePasscodeChange={handlePasscodeChange}
                 requireAuth={requireAuth}
                 handleRequireAuthToggle={handleRequireAuthToggle}
                 useFaceId={useFaceId}
                 handleUseFaceIdToggle={handleUseFaceIdToggle}
                 secretStorageStatus={secretStorageStatus}
                 lockTimeout={lockTimeout}
                 setLockTimeout={setLockTimeout}
                 confirmDataDeletion={confirmDataDeletion}
                 setConfirmDataDeletion={setConfirmDataDeletion}
                 deletionInProgress={deletionInProgress}
                 setDeletionInProgress={setDeletionInProgress}
                 onConfirmDataDeletion={onFactoryReset}
              />
            {ENABLE_PLAID && activeMenu === "plaid" && (
              <Suspense
                fallback={
                  <Card>
                    <div style={{ padding: 20, textAlign: "center", color: T.text.muted }}>Loading...</div>
                  </Card>
                }
              >
                <LazyPlaidSection
                  cards={cards}
                  setCards={setCards}
                  bankAccounts={bankAccounts}
                  setBankAccounts={setBankAccounts}
                  financialConfig={financialConfig}
                  setFinancialConfig={setFinancialConfig}
                  cardCatalog={cardCatalog}
                />
              </Suspense>
            )}
          </div>
        </div>
        </div>
      </div>{" "}
      {/* close animation wrapper */}
      {showPaywall && (
        <Suspense fallback={null}>
          <LazyProPaywall onClose={() => setShowPaywall(false)} />
        </Suspense>
      )}
    </div>
  );
}
