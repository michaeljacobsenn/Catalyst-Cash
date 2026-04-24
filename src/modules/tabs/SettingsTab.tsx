  import type { ChangeEvent } from "react";
  import { lazy,Suspense,useCallback,useEffect,useRef,useState } from "react";
  import { normalizeAppError } from "../appErrors.js";
  import { clearCloudBackupMetadata,clearPortableBackupMetadata,readBackupMetadata } from "../backupMetadata.js";
  import { performCloudBackup } from "../backup.js";
  import { beginBiometricInteraction,endBiometricInteraction,withBiometricPromptTimeout } from "../biometricSession.js";
  import { APP_VERSION,T } from "../constants.js";
  import { CURRENCIES } from "../currency.js";
  import {
    ArrowLeft,
  } from "../icons";
  import { useSwipeBack } from "../hooks/useSwipeGesture.js";
  import { log } from "../logger.js";
  import InteractiveStackPane from "../navigation/InteractiveStackPane.js";
  import { AI_PROVIDERS,getProvider } from "../providers.js";
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
  import { getRawTier,shouldShowGating } from "../subscription.js";
const LazyPlaidSection = lazy(() => import("../settings/PlaidSection.js"));
const LazyAISection = lazy(() => import("../settings/AISection.js"));
const LazyBackupSection = lazy(() => import("../settings/BackupSection.js"));
const LazyAppearanceSection = lazy(() =>
  import("../settings/AppearanceSection.js").then((mod) => ({ default: mod.AppearanceSection }))
);
const LazyFinanceProfileSection = lazy(() =>
  import("../settings/FinanceProfileSection.js").then((mod) => ({ default: mod.FinanceProfileSection }))
);
const LazySecuritySection = lazy(() => import("../settings/SecuritySection.js"));
const LazyTrustCenterSection = lazy(() =>
  import("../settings/TrustCenterSection.js").then((mod) => ({ default: mod.TrustCenterSection }))
);

const ENABLE_PLAID = true; // Toggle to false to hide, true to show Plaid integration
const LazyProPaywall = lazy(() => import("./ProPaywall.js"));
const loadBackupModule = () => import("../backup.js");
const loadSpreadsheetModule = () => import("../spreadsheet.js");
const loadAppleSignIn = () => import("@capacitor-community/apple-sign-in");
const loadCloudSync = () => import("../cloudSync.js");
const loadRecoveryVaultModule = () => import("../recoveryVault.js");
const loadRevenueCat = () => import("../revenuecat.js");
const loadSharePlugin = () => import("@capacitor/share");


  import { useNavigation } from "../contexts/NavigationContext.js";
  import { usePortfolio } from "../contexts/PortfolioContext.js";
  import { useSecurity } from "../contexts/SecurityContext.js";
  import { trackFunnel, trackSupportEvent } from "../funnelAnalytics.js";
  import { refreshIdentitySessionWithAppleIdentityToken } from "../identitySession.js";
  import { useSettings } from "../contexts/SettingsContext.js";
  import { recordFirstExportValue } from "../valueMoments.js";

type ProviderModel = (typeof AI_PROVIDERS)[number]["models"][number];
type ProviderConfig = (typeof AI_PROVIDERS)[number];
type SettingsActiveSegment = "app";
type SettingsMenu = "finance" | "profile" | "ai" | "backup" | "dev" | "security" | "plaid" | "trust" | null;

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
  onCanDismissChange?: (canDismiss: boolean) => void;
  onRestoreComplete?: () => void | Promise<void>;
  onHouseholdSyncConfigured?: () => void | Promise<void>;
  onShowGuide?: () => void;
  proEnabled?: boolean;
}

export { scheduleHouseholdSyncRefresh, scheduleRestoreRefresh } from "../settings/settingsRefresh.js";

async function persistAppPasscodeOrThrow(passcode: string) {
  if (!/^[0-9]{4}$/.test(String(passcode || ""))) {
    throw new Error("Set a 4-digit App Passcode first");
  }

  const saved = await setSecureItem("app-passcode", passcode);
  if (!saved) {
    throw new Error("Secure storage could not save your App Passcode.");
  }
}

export default function SettingsTab({
  onClear,
  onFactoryReset,
  onClearDemoData,
  onBack,
  onCanDismissChange,
  onRestoreComplete,
  onHouseholdSyncConfigured,
  onShowGuide,
  proEnabled = false,
}: SettingsTabProps) {

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
    themeMode,
    setThemeMode,
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
  const { navTo, overlaySourceTab, lastCenterTab } = useNavigation();

  // Auth Plugins state management
  const [lastBackupTS, setLastBackupTS] = useState<number | null>(null);
  const [lastPortableBackupTS, setLastPortableBackupTS] = useState<number | null>(null);
  const [lastPortableBackupKind, setLastPortableBackupKind] = useState<string | null>(null);
  const [recoveryVaultId, setRecoveryVaultId] = useState<string | null>(null);
  const [recoveryVaultLastSyncTs, setRecoveryVaultLastSyncTs] = useState<number | null>(null);
  const [recoveryVaultLastError, setRecoveryVaultLastError] = useState<string | null>(null);
  const [recoveryVaultRevealKey, setRecoveryVaultRevealKey] = useState<string | null>(null);
  const [linkedRecoveryVaultId, setLinkedRecoveryVaultId] = useState<string | null>(null);
  const [continuityRecoveryVaultId, setContinuityRecoveryVaultId] = useState<string | null>(null);
  const [recoveryVaultContinuityEnabled, setRecoveryVaultContinuityEnabled] = useState(false);
  const [recoveryVaultContinuityHasStoredPassphrase, setRecoveryVaultContinuityHasStoredPassphrase] = useState(false);
  const [trustedContinuityRecoveryVaultId, setTrustedContinuityRecoveryVaultId] = useState<string | null>(null);
  const [recoveryVaultTrustedContinuityEnabled, setRecoveryVaultTrustedContinuityEnabled] = useState(false);
  const [isRecoveryVaultSyncing, setIsRecoveryVaultSyncing] = useState(false);

  const [householdId, setHouseholdId] = useState("");
  const [householdPasscode, setHouseholdPasscode] = useState("");
  const [showHouseholdModal, setShowHouseholdModal] = useState(false);
  const [hsInputId, setHsInputId] = useState("");
  const [hsInputPasscode, setHsInputPasscode] = useState("");
  const [isUpdatingBiometricPreference, setIsUpdatingBiometricPreference] = useState(false);

  const refreshRecoveryVaultLinkState = useCallback(async (preferredRecoveryId: string | null = null) => {
    const mod = await loadRecoveryVaultModule();
    let nextLinkedId: string | null = null;

    if (preferredRecoveryId) {
      nextLinkedId = await mod.linkRecoveryVaultToIdentity(preferredRecoveryId).catch(() => null);
    }
    if (!nextLinkedId) {
      nextLinkedId = await mod.getLinkedRecoveryVaultId().catch(() => null);
    }

    const continuityState = await mod.getRecoveryVaultContinuityState().catch(() => ({
      recoveryId: null,
      hasEscrow: false,
      hasStoredPassphrase: false,
      trustedRecoveryId: null,
      hasTrustedEscrow: false,
    }));

    setLinkedRecoveryVaultId(nextLinkedId || null);
    setContinuityRecoveryVaultId(continuityState.recoveryId || null);
    setRecoveryVaultContinuityEnabled(Boolean(continuityState.hasEscrow));
    setRecoveryVaultContinuityHasStoredPassphrase(Boolean(continuityState.hasStoredPassphrase));
    setTrustedContinuityRecoveryVaultId(continuityState.trustedRecoveryId || null);
    setRecoveryVaultTrustedContinuityEnabled(Boolean(continuityState.hasTrustedEscrow));
    return nextLinkedId || null;
  }, []);

  useEffect(() => {
    // Initialization now handled at root level in App.jsx
    readBackupMetadata()
      .then(({ lastCloudBackupTs, lastPortableBackupTs, lastPortableBackupKind }) => {
        setLastBackupTS(lastCloudBackupTs);
        setLastPortableBackupTS(lastPortableBackupTs);
        setLastPortableBackupKind(lastPortableBackupKind);
      })
      .catch(() => {});
    loadRecoveryVaultModule()
      .then((mod) => mod.getRecoveryVaultState())
      .then(({ recoveryId, lastSyncedAt, lastError }) => {
        setRecoveryVaultId(recoveryId || null);
        setRecoveryVaultLastSyncTs(lastSyncedAt);
        setRecoveryVaultLastError(lastError || null);
      })
      .catch(() => {});
    void refreshRecoveryVaultLinkState().catch(() => {});
    migrateHouseholdCredentials()
      .then(({ householdId: nextId, passcode }) => {
        setHouseholdId(nextId || "");
        setHsInputId(nextId || "");
        setHouseholdPasscode(passcode || "");
        setHsInputPasscode(passcode || "");
      })
      .catch(() => {});
    getRawTier().then(tier => setRawTierId(tier.id === "pro" ? "pro" : "free")).catch(() => setRawTierId("free"));
  }, [refreshRecoveryVaultLinkState]);

  // ── Auto-backup scheduling ──────────────────────────────────
  // When an iCloud auto-backup interval is configured, check on
  // mount and periodically whether enough time has elapsed since
  // the last backup. This uses the device's iCloud account; Apple
  // Sign-In is only for account-backed recovery features.
  useEffect(() => {
    if (autoBackupInterval === "off") return;

    const checkAndBackup = async () => {
      try {
        const { uploadToICloud } = await loadCloudSync();
        const result = await performCloudBackup({
          upload: uploadToICloud,
          passphrase: appPasscode,
          personalRules,
          interval: autoBackupInterval,
        });
        if (result.success && result.timestamp) {
          setLastBackupTS(result.timestamp);
          setLastPortableBackupTS(result.timestamp);
          setLastPortableBackupKind("icloud");
          log.info("Auto-backup to iCloud completed successfully.");
        } else if (!result.success && !result.skipped) {
          log.warn("icloud", "Auto-backup returned false");
        } else if (result.reason && result.reason !== "not-due" && appPasscode) {
          log.warn("icloud", "Auto-backup skipped", { reason: result.reason });
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
  }, [autoBackupInterval, appPasscode, personalRules]);

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
      const identityToken = String(result.response.identityToken || "").trim();
      setAppleLinkedId(userIdentifier);
      let verifiedRestoreReady = false;
      if (identityToken) {
        await refreshIdentitySessionWithAppleIdentityToken(identityToken)
          .then(() => {
            verifiedRestoreReady = true;
          })
          .catch((error) => {
          log.warn("security", "Verified Apple actor binding failed", {
            error: error instanceof Error ? error.message : String(error),
          });
          void trackSupportEvent("sync_failed", {
            action: "bind_verified_apple_alias",
            message: error instanceof Error ? error.message : String(error),
          });
        });
      }
      void trackFunnel("apple_id_linked");
      window.toast?.success?.(
        verifiedRestoreReady
          ? "Apple ID linked for backup and verified account restore."
          : "Apple ID linked for app unlock and iCloud backup."
      );
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
    void clearCloudBackupMetadata();
    if (lastPortableBackupKind === "icloud") {
      void clearPortableBackupMetadata();
    }
    if (setAutoBackupInterval) {
      setAutoBackupInterval("off");
      db.set("auto-backup-interval", "off");
    }
    setAppleLinkedId(null);
    setLastBackupTS(null);
    if (lastPortableBackupKind === "icloud") {
      setLastPortableBackupTS(null);
      setLastPortableBackupKind(null);
    }
    window.toast?.success?.("Apple ID unlinked");
  };

  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmFactoryReset, setConfirmFactoryReset] = useState(false);
  const [confirmDataDeletion, setConfirmDataDeletion] = useState(false);
  const [deletionInProgress, setDeletionInProgress] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
  const [activeSegment] = useState<SettingsActiveSegment>("app");
  const [activeMenu, setActiveMenu] = useState<SettingsMenu>(null);
  const [rawTierId, setRawTierId] = useState<"free" | "pro">("free");
  const [ppModal, setPpModal] = useState<PassphraseModalState>({ open: false, mode: "export", label: "", resolve: null, value: "" });
  const [setupDismissed, setSetupDismissed] = useState(() => !!localStorage.getItem("setup-progress-dismissed"));
  const [showApiSetup, setShowApiSetup] = useState(Boolean((apiKey || "").trim()));
  const [showPaywall, setShowPaywall] = useState(false);

  const activeBodyRef = useRef<HTMLDivElement | null>(null);
  const navDir = useRef("forward"); // tracks animation direction: 'forward' | 'back'
  const skipRootTransitionRef = useRef(false);

  const [isForceSyncing, setIsForceSyncing] = useState(false);

  const forceICloudSync = async () => {
    setIsForceSyncing(true);
    try {
      if (Capacitor.getPlatform() === "web") {
        window.toast?.error?.("Automatic iCloud backup is available in the native iPhone app only.");
        return;
      }
      const { uploadToICloud } = await loadCloudSync();
      if (!appPasscode) {
        window.toast?.error?.("Please set an App Passcode in Security to enable encrypted iCloud backups.");
        setIsForceSyncing(false);
        return;
      }
      const result = await performCloudBackup({
        upload: uploadToICloud,
        passphrase: appPasscode,
        personalRules,
        force: true,
      });
      if (result.success && result.timestamp) {
        setLastBackupTS(result.timestamp);
        setLastPortableBackupTS(result.timestamp);
        setLastPortableBackupKind("icloud");
        window.toast?.success?.("Backup saved to iCloud Drive");
      } else if (result.reason && result.reason !== "upload-failed") {
        window.toast?.error?.(result.reason);
      } else {
        window.toast?.error?.("Backup could not be verified in iCloud Drive");
      }
    } catch (e) {
      const failure = normalizeAppError(e, { context: "restore" });
      void trackSupportEvent("sync_failed", { context: "icloud_force", reason: failure.kind });
      log.error("icloud", "Manual iCloud backup failed", { error: failure.rawMessage, kind: failure.kind });
      window.toast?.error?.("Catalyst couldn't complete the iCloud backup. Your data is still on this device.");
    } finally {
      setIsForceSyncing(false);
    }
  };

  const handleCreateRecoveryVault = async () => {
    setIsRecoveryVaultSyncing(true);
    try {
      const mod = await loadRecoveryVaultModule();
      const credentials = await mod.createRecoveryVaultCredentials();
      await mod.pushRecoveryVault({
        recoveryId: credentials.recoveryId,
        recoveryKey: credentials.recoveryKey,
        personalRules,
      });
      setRecoveryVaultId(credentials.recoveryId);
      setRecoveryVaultLastSyncTs(Date.now());
      setRecoveryVaultRevealKey(credentials.recoveryKey);
      setRecoveryVaultLastError(null);
      await refreshRecoveryVaultLinkState(credentials.recoveryId).catch(() => null);
      void trackFunnel("backup_configured");
      window.toast?.success?.("Recovery Vault created and synced.");
    } catch (error) {
      const mod = await loadRecoveryVaultModule();
      const failure = await mod.recordRecoveryVaultFailure(error);
      setRecoveryVaultLastError(failure.userMessage);
      window.toast?.error?.(failure.userMessage);
    } finally {
      setIsRecoveryVaultSyncing(false);
    }
  };

  const handleSyncRecoveryVault = async () => {
    setIsRecoveryVaultSyncing(true);
    try {
      const mod = await loadRecoveryVaultModule();
      const result = await mod.syncConfiguredRecoveryVault(personalRules);
      setRecoveryVaultLastSyncTs(result.syncedAt);
      setRecoveryVaultLastError(null);
      await refreshRecoveryVaultLinkState(recoveryVaultId).catch(() => null);
      window.toast?.success?.("Recovery Vault synced.");
    } catch (error) {
      const mod = await loadRecoveryVaultModule();
      const failure = await mod.recordRecoveryVaultFailure(error);
      setRecoveryVaultLastError(failure.userMessage);
      window.toast?.error?.(failure.userMessage);
    } finally {
      setIsRecoveryVaultSyncing(false);
    }
  };

  const handleRotateRecoveryVault = async () => {
    setIsRecoveryVaultSyncing(true);
    try {
      const mod = await loadRecoveryVaultModule();
      const credentials = await mod.rotateRecoveryVaultCredentials(personalRules);
      setRecoveryVaultId(credentials.recoveryId);
      setRecoveryVaultLastSyncTs(Date.now());
      setRecoveryVaultRevealKey(credentials.recoveryKey);
      setRecoveryVaultLastError(null);
      await refreshRecoveryVaultLinkState(credentials.recoveryId).catch(() => null);
      window.toast?.success?.("Recovery Vault credentials rotated.");
    } catch (error) {
      const mod = await loadRecoveryVaultModule();
      const failure = await mod.recordRecoveryVaultFailure(error);
      setRecoveryVaultLastError(failure.userMessage);
      window.toast?.error?.(failure.userMessage);
    } finally {
      setIsRecoveryVaultSyncing(false);
    }
  };

  const handleRevealRecoveryVaultKey = async () => {
    try {
      const mod = await loadRecoveryVaultModule();
      const credentials = await mod.getRecoveryVaultCredentials();
      if (!credentials.recoveryId || !credentials.recoveryKey) {
        throw new Error("Recovery Vault credentials are unavailable on this device.");
      }
      setRecoveryVaultRevealKey(credentials.recoveryKey);
      setRecoveryVaultId(credentials.recoveryId);
      window.toast?.success?.("Recovery key revealed on this device.");
    } catch (error) {
      const mod = await loadRecoveryVaultModule();
      const failure = await mod.recordRecoveryVaultFailure(error, {
        context: { action: "reveal_key" },
      });
      setRecoveryVaultLastError(failure.userMessage);
      window.toast?.error?.(failure.userMessage);
    }
  };

  const handleCopyRecoveryVaultKit = async () => {
    try {
      const mod = await loadRecoveryVaultModule();
      const credentials = await mod.getRecoveryVaultCredentials();
      const recoveryKit = mod.formatRecoveryVaultKit(credentials);
      if (!recoveryKit) {
        throw new Error("Recovery Vault credentials are unavailable on this device.");
      }
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(recoveryKit);
        window.toast?.success?.("Recovery Kit copied.");
      } else if (navigator?.share) {
        await navigator.share({
          title: "Catalyst Cash Recovery Kit",
          text: recoveryKit,
        });
        window.toast?.success?.("Recovery Kit ready to share.");
      } else if (Capacitor.isNativePlatform()) {
        const { Share } = await loadSharePlugin();
        await Share.share({
          title: "Catalyst Cash Recovery Kit",
          text: recoveryKit,
          dialogTitle: "Share Recovery Kit",
        });
        window.toast?.success?.("Recovery Kit ready to share.");
      } else {
        throw new Error("Clipboard access is unavailable on this device.");
      }
      setRecoveryVaultRevealKey(credentials.recoveryKey);
    } catch (error) {
      const mod = await loadRecoveryVaultModule();
      const failure = await mod.recordRecoveryVaultFailure(error, {
        context: { action: "copy_kit" },
      });
      setRecoveryVaultLastError(failure.userMessage);
      window.toast?.error?.(failure.userMessage);
    }
  };

  const handleDeleteRecoveryVault = async () => {
    setIsRecoveryVaultSyncing(true);
    try {
      const mod = await loadRecoveryVaultModule();
      const secret = await mod.getStoredRecoveryVaultSecret();
      if (!recoveryVaultId || !secret) {
        throw new Error("Recovery Vault credentials are unavailable on this device.");
      }
      await mod.deleteRecoveryVault(recoveryVaultId, secret);
      await mod.clearRecoveryVaultCredentials();
      setRecoveryVaultId(null);
      setLinkedRecoveryVaultId(null);
      setContinuityRecoveryVaultId(null);
      setRecoveryVaultContinuityEnabled(false);
      setRecoveryVaultContinuityHasStoredPassphrase(false);
      setTrustedContinuityRecoveryVaultId(null);
      setRecoveryVaultTrustedContinuityEnabled(false);
      setRecoveryVaultLastSyncTs(null);
      setRecoveryVaultRevealKey(null);
      setRecoveryVaultLastError(null);
      window.toast?.success?.("Recovery Vault removed.");
    } catch (error) {
      const mod = await loadRecoveryVaultModule();
      const failure = await mod.recordRecoveryVaultFailure(error);
      setRecoveryVaultLastError(failure.userMessage);
      window.toast?.error?.(failure.userMessage);
    } finally {
      setIsRecoveryVaultSyncing(false);
    }
  };

  const handleEnableRecoveryVaultContinuity = async (passphrase: string) => {
    setIsRecoveryVaultSyncing(true);
    try {
      const mod = await loadRecoveryVaultModule();
      const credentials = await mod.getRecoveryVaultCredentials();
      if (!credentials.recoveryId || !credentials.recoveryKey) {
        throw new Error("Recovery Vault credentials are unavailable on this device.");
      }
      await mod.enableRecoveryVaultContinuity(passphrase, credentials.recoveryId, credentials.recoveryKey);
      await refreshRecoveryVaultLinkState(credentials.recoveryId).catch(() => null);
      setRecoveryVaultLastError(null);
      window.toast?.success?.("Account-backed Recovery Vault sync enabled.");
    } catch (error) {
      const mod = await loadRecoveryVaultModule();
      const failure = await mod.recordRecoveryVaultFailure(error, {
        eventName: "vault_sync_failed",
        context: { action: "enable_continuity" },
      });
      setRecoveryVaultLastError(failure.userMessage);
      window.toast?.error?.(failure.userMessage);
    } finally {
      setIsRecoveryVaultSyncing(false);
    }
  };

  const handleEnableTrustedRecoveryVaultContinuity = async () => {
    setIsRecoveryVaultSyncing(true);
    try {
      const mod = await loadRecoveryVaultModule();
      const credentials = await mod.getRecoveryVaultCredentials();
      if (!credentials.recoveryId || !credentials.recoveryKey) {
        throw new Error("Recovery Vault credentials are unavailable on this device.");
      }
      await mod.enableTrustedRecoveryVaultContinuity(credentials.recoveryId, credentials.recoveryKey);
      await refreshRecoveryVaultLinkState(credentials.recoveryId).catch(() => null);
      setRecoveryVaultLastError(null);
      window.toast?.success?.("Seamless Recovery Vault restore enabled.");
    } catch (error) {
      const mod = await loadRecoveryVaultModule();
      const failure = await mod.recordRecoveryVaultFailure(error, {
        eventName: "vault_sync_failed",
        context: { action: "enable_trusted_continuity" },
      });
      setRecoveryVaultLastError(failure.userMessage);
      window.toast?.error?.(failure.userMessage);
    } finally {
      setIsRecoveryVaultSyncing(false);
    }
  };

  const handleDisableRecoveryVaultContinuity = async () => {
    setIsRecoveryVaultSyncing(true);
    try {
      const mod = await loadRecoveryVaultModule();
      await mod.clearRecoveryVaultContinuityPassphrase();
      await refreshRecoveryVaultLinkState().catch(() => null);
      setRecoveryVaultLastError(null);
      window.toast?.success?.("Account-backed Recovery Vault sync disabled.");
    } catch (error) {
      const mod = await loadRecoveryVaultModule();
      const failure = await mod.recordRecoveryVaultFailure(error, {
        eventName: "vault_sync_failed",
        context: { action: "disable_continuity" },
      });
      setRecoveryVaultLastError(failure.userMessage);
      window.toast?.error?.(failure.userMessage);
    } finally {
      setIsRecoveryVaultSyncing(false);
    }
  };

  const handleDisableTrustedRecoveryVaultContinuity = async () => {
    setIsRecoveryVaultSyncing(true);
    try {
      const mod = await loadRecoveryVaultModule();
      await mod.clearTrustedRecoveryVaultContinuity();
      await refreshRecoveryVaultLinkState().catch(() => null);
      setRecoveryVaultLastError(null);
      window.toast?.success?.("Seamless Recovery Vault restore disabled.");
    } catch (error) {
      const mod = await loadRecoveryVaultModule();
      const failure = await mod.recordRecoveryVaultFailure(error, {
        eventName: "vault_sync_failed",
        context: { action: "disable_trusted_continuity" },
      });
      setRecoveryVaultLastError(failure.userMessage);
      window.toast?.error?.(failure.userMessage);
    } finally {
      setIsRecoveryVaultSyncing(false);
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
      setAiModel("gpt-5-nano");
      setPersonalRules("Prioritize cash safety first, then highest-interest debt payoff.");
      await refreshLiabilities?.();
      window.toast?.success?.(`${FULL_PROFILE_QA_LABEL} loaded. Open Weekly Audit when you want to run the seeded flow.`);
    } catch (error) {
      const failure = normalizeAppError(error, { context: "restore" });
      log.error("settings", "Failed to load QA seed", { error: failure.rawMessage, kind: failure.kind });
      window.toast?.error?.("Failed to load the QA test profile.");
    }
  }, [
    refreshLiabilities,
    setAiModel,
    setAiProvider,
    setBankAccounts,
    setCards,
    setFinancialConfig,
    setPersonalRules,
    setRenewals,
  ]);

  const handleOpenQaAudit = useCallback(() => {
    const baseTab = overlaySourceTab ?? lastCenterTab.current ?? "dashboard";
    navDir.current = "back";
    skipRootTransitionRef.current = true;
    setActiveMenu(null);
    haptic.light();
    navTo(baseTab);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        navTo("input");
      });
    });
  }, [lastCenterTab, navTo, overlaySourceTab]);

  useEffect(() => {
    if (activeBodyRef.current) {
      activeBodyRef.current.scrollTop = 0;
    }
  }, [activeMenu, activeSegment]);

  useEffect(() => {
    if (activeMenu) return undefined;
    const frame = window.requestAnimationFrame(() => {
      skipRootTransitionRef.current = false;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeMenu]);

  useEffect(() => {
    onCanDismissChange?.(!activeMenu);
    return () => {
      onCanDismissChange?.(true);
    };
  }, [activeMenu, onCanDismissChange]);

  const closeActiveMenu = useCallback(
    (interactive = false) => {
      if (!activeMenu) return;
      navDir.current = "back";
      skipRootTransitionRef.current = interactive;
      setActiveMenu(null);
      haptic.light();
    },
    [activeMenu],
  );

  const detailSwipe = useSwipeBack(
    useCallback(() => {
      closeActiveMenu(true);
    }, [closeActiveMenu]),
    Boolean(activeMenu),
    { applyBaseParallax: false },
  );

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

  const handleRequireAuthToggle = async (enable: boolean) => {
    if (secretStorageStatus.mode === "native-unavailable") {
      window.toast?.error?.("App Lock requires native secure storage, which is currently unavailable.");
      return;
    }
    if (enable) {
      try {
        await persistAppPasscodeOrThrow(appPasscode);
      } catch (error) {
        window.toast?.error?.(error instanceof Error ? error.message : "Set a 4-digit App Passcode first");
        return;
      }
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
    if (isUpdatingBiometricPreference) return;
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

    setIsUpdatingBiometricPreference(true);
    beginBiometricInteraction();
    try {
      await persistAppPasscodeOrThrow(appPasscode);
      const availability = await FaceId.isAvailable();
      if (!availability?.isAvailable) {
        window.toast?.error?.("No biometrics set up on this device.");
        return;
      }

      await withBiometricPromptTimeout(
        () => FaceId.authenticate({ reason: "Verify to enable Face ID / Touch ID for app lock" }),
        {
          timeoutMs: 12000,
          timeoutMessage: "Biometric verification timed out",
        }
      );

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
      endBiometricInteraction();
      setIsUpdatingBiometricPreference(false);
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
    {
      label: "Profile",
      value: financialConfig?.preferredName
        ? `${financialConfig.preferredName}${financialConfig?.birthYear ? ` · Born ${financialConfig.birthYear}` : ""}`
        : financialConfig?.birthYear
          ? `Born ${financialConfig.birthYear}`
          : "Demographics light",
    },
  ];

  useEffect(() => {
    if ((apiKey || "").trim()) setShowApiSetup(true);
  }, [apiKey]);

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
      const { count, exportedAt, plaidConnectionCount } = await exportBackup(passphrase);
      setLastPortableBackupTS(Date.parse(exportedAt) || Date.now());
      setLastPortableBackupKind("encrypted-export");
      setBackupStatus("done");
      void trackFunnel("backup_configured");
      void recordFirstExportValue();
      void trackSupportEvent("export_used", { kind: "json" });
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
      setLastPortableBackupTS(Date.now());
      setLastPortableBackupKind("spreadsheet-export");
      setBackupStatus("done");
      void trackFunnel("backup_configured");
      void recordFirstExportValue();
      void trackSupportEvent("export_used", { kind: "spreadsheet" });
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
      setLastBackupTS(null);
      setLastPortableBackupTS(null);
      setLastPortableBackupKind(null);
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
      void trackSupportEvent("restore_failed", { reason: message });
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

  const rootSettingsContent = (
    <RootSettingsSection
      enablePlaid={ENABLE_PLAID}
      proEnabled={proEnabled}
      shouldShowGating={gatingVisible}
      activeMenu={null}
      onSelectMenu={(menu) => {
        skipRootTransitionRef.current = false;
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
  );

  const currentHeaderTitle =
    activeMenu === "ai"
      ? "AI & Engine"
      : activeMenu === "backup"
        ? "Backup & Data"
        : activeMenu === "trust"
          ? "Trust Center"
        : activeMenu === "finance"
          ? "Financial Profile"
          : activeMenu === "plaid"
            ? "Bank Connections"
            : activeMenu === "security"
              ? "Security"
              : activeMenu === "profile"
                ? "Appearance"
                : activeMenu === "dev"
                  ? "QA Tools"
                  : "Settings";

  const renderHeader = (menu: SettingsMenu | null) => (
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
      <div style={{ width: 44, minWidth: 44, display: "flex", justifyContent: "flex-start" }}>
        {(onBack || menu) && (
          <button type="button"
            onClick={() => {
              if (menu) {
                closeActiveMenu(false);
              } else if (onBack) {
                onBack();
              }
            }}
            aria-label={menu ? "Back to Settings" : "Close Settings"}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
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
      <div
        style={{
          textAlign: "center",
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 12px",
        }}
      >
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
          {menu
            ? currentHeaderTitle
            : "Settings"}
        </h1>
        {!menu && (
          <p style={{ fontSize: 10, color: T.text.dim, marginTop: 3, fontFamily: T.font.mono, margin: 0, lineHeight: 1.1 }}>
            VERSION {APP_VERSION}
          </p>
        )}
      </div>
      <div style={{ width: 44, minWidth: 44 }}></div>
    </div>
  );

  const sectionFallback = (
    <Card>
      <div style={{ padding: 20, textAlign: "center", color: T.text.muted }}>Loading…</div>
    </Card>
  );

  const detailSettingsContent = (
    <div style={{ display: activeSegment === "app" ? "block" : "none" }}>
      {activeMenu === "finance" && (
        <Suspense fallback={sectionFallback}>
          <LazyFinanceProfileSection
            activeMenu={activeMenu}
            financialConfig={financialConfig}
            financeSummaryItems={financeSummaryItems}
            proEnabled={proEnabled}
            setFinancialConfig={setFinancialConfig}
            setShowPaywall={setShowPaywall}
          />
        </Suspense>
      )}

      {activeMenu === "profile" && (
        <Suspense fallback={sectionFallback}>
          <LazyAppearanceSection activeMenu={activeMenu} themeMode={themeMode} setThemeMode={setThemeMode} />
        </Suspense>
      )}

      {activeMenu === "ai" && (
        <Suspense fallback={sectionFallback}>
          <LazyAISection
             activeMenu={activeMenu}
             aiModel={aiModel}
             setAiModel={setAiModel}
             setAiProvider={setAiProvider}
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
        </Suspense>
      )}

      {activeMenu === "backup" && (
        <Suspense fallback={sectionFallback}>
          <LazyBackupSection
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
            appPasscode={appPasscode}
            handleAppleSignIn={handleAppleSignIn}
            unlinkApple={unlinkApple}
            autoBackupInterval={autoBackupInterval}
            setAutoBackupInterval={setAutoBackupInterval}
            lastBackupTS={lastBackupTS}
            lastPortableBackupTS={lastPortableBackupTS}
            lastPortableBackupKind={lastPortableBackupKind}
            recoveryVaultId={recoveryVaultId}
            linkedRecoveryVaultId={linkedRecoveryVaultId}
            continuityRecoveryVaultId={continuityRecoveryVaultId}
            recoveryVaultContinuityEnabled={recoveryVaultContinuityEnabled}
            recoveryVaultContinuityHasStoredPassphrase={recoveryVaultContinuityHasStoredPassphrase}
            trustedContinuityRecoveryVaultId={trustedContinuityRecoveryVaultId}
            recoveryVaultTrustedContinuityEnabled={recoveryVaultTrustedContinuityEnabled}
            recoveryVaultLastSyncTs={recoveryVaultLastSyncTs}
            recoveryVaultLastError={recoveryVaultLastError}
            recoveryVaultRevealKey={recoveryVaultRevealKey}
            setRecoveryVaultRevealKey={setRecoveryVaultRevealKey}
            isRecoveryVaultSyncing={isRecoveryVaultSyncing}
            handleCreateRecoveryVault={handleCreateRecoveryVault}
            handleSyncRecoveryVault={handleSyncRecoveryVault}
            handleRotateRecoveryVault={handleRotateRecoveryVault}
            handleDeleteRecoveryVault={handleDeleteRecoveryVault}
            handleRevealRecoveryVaultKey={handleRevealRecoveryVaultKey}
            handleCopyRecoveryVaultKit={handleCopyRecoveryVaultKit}
            handleEnableRecoveryVaultContinuity={handleEnableRecoveryVaultContinuity}
            handleDisableRecoveryVaultContinuity={handleDisableRecoveryVaultContinuity}
            handleEnableTrustedRecoveryVaultContinuity={handleEnableTrustedRecoveryVaultContinuity}
            handleDisableTrustedRecoveryVaultContinuity={handleDisableTrustedRecoveryVaultContinuity}
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
        </Suspense>
      )}

      {activeMenu === "trust" && (
        <Suspense fallback={sectionFallback}>
          <LazyTrustCenterSection
            activeMenu={activeMenu}
            secretStorageStatus={secretStorageStatus}
            appleLinkedId={appleLinkedId}
            householdId={householdId}
            recoveryVaultId={recoveryVaultId}
            linkedRecoveryVaultId={linkedRecoveryVaultId}
            continuityRecoveryVaultId={continuityRecoveryVaultId}
            recoveryVaultContinuityEnabled={recoveryVaultContinuityEnabled}
            recoveryVaultContinuityHasStoredPassphrase={recoveryVaultContinuityHasStoredPassphrase}
            trustedContinuityRecoveryVaultId={trustedContinuityRecoveryVaultId}
            recoveryVaultTrustedContinuityEnabled={recoveryVaultTrustedContinuityEnabled}
            recoveryVaultLastSyncTs={recoveryVaultLastSyncTs}
            lastPortableBackupTS={lastPortableBackupTS}
            lastPortableBackupKind={lastPortableBackupKind}
          />
        </Suspense>
      )}

      <DeveloperToolsSection
        visible={activeMenu === "dev"}
        onLoadFullProfileQaSeed={handleLoadFullProfileQaSeed}
        onOpenQaAudit={handleOpenQaAudit}
      />

      {activeMenu === "security" && (
        <Suspense fallback={sectionFallback}>
          <LazySecuritySection
             activeMenu={activeMenu}
             appPasscode={appPasscode}
             handlePasscodeChange={handlePasscodeChange}
             requireAuth={requireAuth}
            handleRequireAuthToggle={handleRequireAuthToggle}
            useFaceId={useFaceId}
            handleUseFaceIdToggle={handleUseFaceIdToggle}
            biometricToggleBusy={isUpdatingBiometricPreference}
            secretStorageStatus={secretStorageStatus}
            lockTimeout={lockTimeout}
            setLockTimeout={setLockTimeout}
             confirmDataDeletion={confirmDataDeletion}
             setConfirmDataDeletion={setConfirmDataDeletion}
             deletionInProgress={deletionInProgress}
             setDeletionInProgress={setDeletionInProgress}
             onConfirmDataDeletion={onFactoryReset}
          />
        </Suspense>
      )}

      {ENABLE_PLAID && activeMenu === "plaid" && (
        <Suspense
          fallback={
            <Card>
              <div style={{ padding: 20, textAlign: "center", color: T.text.muted }}>Loading…</div>
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
  );

  const renderRootBody = ({ attachRef, animated }: { attachRef: boolean; animated: boolean }) => (
    <div
      className="safe-scroll-body safe-bottom page-body"
      ref={attachRef ? activeBodyRef : undefined}
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
      <div
        style={{
          width: "100%",
          maxWidth: 760,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "0 0 12px",
        }}
        >
          <div
            key="root"
            style={{
            animation: !animated || skipRootTransitionRef.current
              ? undefined
              : navDir.current === "back"
                ? "settingsSlideOut .32s cubic-bezier(.16,1,.3,1) both"
                : "settingsSlideIn .32s cubic-bezier(.16,1,.3,1) both",
            display: "flex",
            flexDirection: "column",
            flex: 1,
            marginTop: 0,
          }}
        >
          {rootSettingsContent}
        </div>
      </div>
    </div>
  );

  const detailBody = (
    <div
      className="safe-scroll-body safe-bottom page-body"
      ref={(node) => {
        activeBodyRef.current = node;
      }}
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
      <div
        style={{
          width: "100%",
          maxWidth: 760,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "0 0 12px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flex: 1, marginTop: 0 }}>
          {detailSettingsContent}
        </div>
      </div>
    </div>
  );

  const rootScreen = (
    <>
      {renderHeader(null)}
      {renderRootBody({ attachRef: true, animated: true })}
    </>
  );

  const detailScreen = (
    <div style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden" }}>
      <InteractiveStackPane
        swipe={detailSwipe}
        underlay={(
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              background: T.bg.base,
            }}
          >
            {renderHeader(null)}
            {renderRootBody({ attachRef: false, animated: false })}
          </div>
        )}
        containerStyle={{ position: "absolute", inset: 0 }}
      >
        {renderHeader(activeMenu)}
        {detailBody}
      </InteractiveStackPane>
    </div>
  );

  return (
    <div
      className="swipe-back-pane"
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
      {activeMenu ? detailScreen : rootScreen}
      {showPaywall && (
        <Suspense fallback={null}>
          <LazyProPaywall onClose={() => setShowPaywall(false)} source="settings" />
        </Suspense>
      )}
    </div>
  );
}
