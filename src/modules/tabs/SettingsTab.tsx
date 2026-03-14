import { useState, useEffect, useRef, useCallback, Suspense, lazy } from "react";
import type { ChangeEvent, TouchEvent as ReactTouchEvent } from "react";
import {
  Eye,
  EyeOff,
  ArrowLeft,
  Cloud,
  Download,
  Upload,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  Loader2,
  ExternalLink,
  Pencil,
  Check,
  ChevronRight,
  Shield,
  Cpu,
  Target,
  Briefcase,
  Landmark,
  Database,
  Lock,
  Settings,
  Info,
  Building2,
  Plus,
  Unplug,
  Sun,
  Moon,
  Monitor,
  Layers,
  Save,
  RefreshCw,
  Terminal,
  MapPin
} from "lucide-react";
import { T, APP_VERSION } from "../constants.js";
import { AI_PROVIDERS, getProvider } from "../providers.js";
import { log, getLogsAsText, clearLogs } from "../logger.js";
import { getErrorLog, clearErrorLog } from "../errorReporter.js";
import { Card, Label, InlineTooltip } from "../ui.js";
import { Mono } from "../components.js";
import { db, FaceId, nativeExport, fmt } from "../utils.js";
import { isSecuritySensitiveKey, sanitizePlaidForBackup } from "../securityKeys.js";
import { CURRENCIES } from "../currency.js";

import { haptic } from "../haptics.js";
import { Capacitor } from "@capacitor/core";

import { getConnections, removeConnection } from "../plaid.js";
import { deleteSecureItem, getSecureItem, setSecureItem } from "../secureStore.js";
const LazyPlaidSection = lazy(() => import("../settings/PlaidSection.js"));
import { shouldShowGating, checkAuditQuota, getRawTier } from "../subscription.js";
import ProBanner from "./ProBanner.js";
import AISection from "../settings/AISection.js";
import BackupSection from "../settings/BackupSection.js";
import SecuritySection from "../settings/SecuritySection.js";

const ENABLE_PLAID = true; // Toggle to false to hide, true to show Plaid integration
const LazyProPaywall = lazy(() => import("./ProPaywall.js"));
const loadBackupModule = () => import("../backup.js");
const loadSpreadsheetModule = () => import("../spreadsheet.js");
const loadAppleSignIn = () => import("@capacitor-community/apple-sign-in");
const loadCloudSync = () => import("../cloudSync.js");
const loadRevenueCat = () => import("../revenuecat.js");

import { useAudit } from "../contexts/AuditContext.js";
import { useSettings } from "../contexts/SettingsContext.js";
import { useSecurity } from "../contexts/SecurityContext.js";
import { usePortfolio } from "../contexts/PortfolioContext.js";
import { useNavigation } from "../contexts/NavigationContext.js";
import type { AppTab } from "../contexts/NavigationContext.js";
import type { HousingType, IncomeType, PayFrequency, Payday } from "../../types/index.js";

type ProviderModel = (typeof AI_PROVIDERS)[number]["models"][number];
type ProviderConfig = (typeof AI_PROVIDERS)[number];
type SettingsActiveSegment = "app";
type SettingsMenu = "finance" | "profile" | "ai" | "backup" | "dev" | "security" | "plaid" | null;
type SetupStep = {
  label: string;
  done: boolean;
  nav?: AppTab;
  menu?: Exclude<SettingsMenu, null>;
};

interface PassphraseModalState {
  open: boolean;
  mode: "export" | "import";
  label: string;
  resolve: ((value: string) => void) | null;
  value: string;
}

interface SettingsTabProps {
  onClear?: () => void;
  onFactoryReset?: () => void;
  onClearDemoData?: () => void;
  onBack?: () => void;
  onRestoreComplete?: () => void;
  onShowGuide?: () => void;
  proEnabled?: boolean;
}

export default function SettingsTab({
  onClear,
  onFactoryReset,
  onClearDemoData,
  onBack,
  onRestoreComplete,
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
    notifPermission,
    persona,
    setPersona,
    themeMode,
    setThemeMode,
    themeTick,
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
  } = useSecurity();
  const { cards, setCards, bankAccounts, setBankAccounts, cardCatalog, renewals, liabilitySum, refreshLiabilities } = usePortfolio();
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
    db.get("household-id").then(val => { setHouseholdId(val || ""); setHsInputId(val || ""); }).catch(() => {});
    db.get("household-passcode").then(val => { setHouseholdPasscode(val || ""); setHsInputPasscode(val || ""); }).catch(() => {});
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
            console.warn("Auto-backup to iCloud failed (upload returned false).");
          }
        }
      } catch (e) {
        console.error("Auto-backup to iCloud error:", e);
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
    if (Capacitor.getPlatform() === "web") return;
    try {
      const { SignInWithApple } = await loadAppleSignIn();
      const result = await SignInWithApple.authorize({
        clientId: "com.jacobsen.portfoliopro",
        redirectURI: "https://api.catalystcash.app/auth/apple/callback",
        scopes: "email name",
      });
      // console.log("Apple Sign-In Success:", result);
      const userIdentifier = result.response.user;
      setAppleLinkedId(userIdentifier);
      window.toast?.success?.("Apple ID linked for App Unlocking.");
    } catch (error) {
      console.error(error);
      window.toast?.error?.("Apple Sign-In failed or was cancelled.");
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

  const PRIVACY_URL = "https://catalystcash.app/privacy";

  const [showKey, setShowKey] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmFactoryReset, setConfirmFactoryReset] = useState(false);
  const [confirmDataDeletion, setConfirmDataDeletion] = useState(false);
  const [deletionInProgress, setDeletionInProgress] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
  const [activeSegment] = useState<SettingsActiveSegment>("app");
  const [activeMenu, setActiveMenu] = useState<SettingsMenu>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);
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
        window.toast?.success?.("iCloud backup successful");
      } else {
        window.toast?.error?.("Failed to backup to iCloud");
      }
    } catch (e) {
      console.error(e);
      window.toast?.error?.("iCloud sync failed");
    } finally {
      setIsForceSyncing(false);
    }
  };

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
      console.error("Failed to enable Face ID:", e);
      haptic.error();
      window.toast?.error?.("Failed to verify biometrics.");
    } finally {
      setTimeout(() => {
        window.__biometricActive = false;
      }, 1000);
    }
  };
  const [statusMsg, setStatusMsg] = useState("");

  const currentProvider: ProviderConfig = getProvider(aiProvider || "gemini") ?? AI_PROVIDERS[0]!;
  const currentModels = currentProvider.models;
  const selectedModel: ProviderModel = currentModels.find(m => m.id === aiModel) || currentModels[0]!;
  const isNonGemini = (aiProvider || "gemini") !== "gemini";
  const hasApiKey = Boolean((apiKey || "").trim());
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
      const count = await exportBackup(passphrase);
      setBackupStatus("done");
      setStatusMsg(`Backed up ${count} data keys to your device`);
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
      const { importBackup } = await loadBackupModule();
      const { count, exportedAt } = await importBackup(file, () => showPassphraseModal("import"));
      setRestoreStatus("done");
      const dateStr = exportedAt ? new Date(exportedAt).toLocaleDateString() : "unknown date";
      setStatusMsg(`Restored ${count} items from backup dated ${dateStr}.`);
      if (onRestoreComplete) setTimeout(onRestoreComplete, 1500);
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
      if (normalized) void setSecureItem(currentProvider.keyStorageKey, normalized);
      else void deleteSecureItem(currentProvider.keyStorageKey);
    }
    // Also mirror to legacy "api-key" for OpenAI backward compatibility
    if (currentProvider.id === "openai") {
      if (normalized) db.set("api-key", normalized);
      else db.del("api-key");
    }
  };

  return (
    <div
      className="slide-pane"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: T.bg.base,
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* ── Household Sync Modal ── */}
      {showHouseholdModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 340,
              background: T.bg.card,
              borderRadius: T.radius.xl,
              border: `1px solid ${T.border.subtle}`,
              padding: 24,
              boxShadow: "0 24px 48px rgba(0,0,0,0.6)",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, color: T.text.primary }}>
              Household Sync (E2EE)
            </div>
            <p style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.6, marginBottom: 16 }}>
              Sync your finances with a partner across devices securely. Data is End-to-End Encrypted before leaving your device. Enter a shared ID and Passcode below, or clear them to disconnect.
            </p>
            <form onSubmit={async (e) => { 
                e.preventDefault(); 
                const nid = hsInputId.trim();
                const np = hsInputPasscode.trim();
                await db.set("household-id", nid);
                await db.set("household-passcode", np);
                setHouseholdId(nid);
                setHouseholdPasscode(np);
                setShowHouseholdModal(false);
                window.toast?.success?.(nid ? "Household linked. Initializing sync..." : "Household disconnected.");
                if (nid) setTimeout(() => window.location.reload(), 1500); // Trigger full app reboot to pull initial state
            }}>
              <Label>Household ID (E.g. SmithFamily)</Label>
              <input
                type="text"
                value={hsInputId}
                onChange={e => setHsInputId(e.target.value)}
                style={{ width: "100%", padding: "10px 14px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.base, color: T.text.primary, fontSize: 14, marginBottom: 12, outline: "none" }}
              />
              <Label>Shared Passcode (Encryption Key)</Label>
              <input
                type="password"
                value={hsInputPasscode}
                onChange={e => setHsInputPasscode(e.target.value)}
                style={{ width: "100%", padding: "10px 14px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.base, color: T.text.primary, fontSize: 14, marginBottom: 20, outline: "none" }}
              />
              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setShowHouseholdModal(false)}
                  style={{ flex: 1, padding: "12px 0", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: "transparent", color: T.text.secondary, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ flex: 1, padding: "12px 0", borderRadius: T.radius.md, border: "none", background: T.accent.primary, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
                >
                  Save & Sync
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ── Passphrase Modal ── */}
      {ppModal.open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 340,
              background: T.bg.card,
              borderRadius: T.radius.xl,
              border: `1px solid ${T.border.subtle}`,
              padding: 24,
              boxShadow: "0 24px 48px rgba(0,0,0,0.6)",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, color: T.text.primary }}>
              {ppModal.mode === "export" ? "Encrypt Backup" : "Decrypt Backup"}
            </div>
            <p style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.6, marginBottom: 16 }}>{ppModal.label}</p>
            <form onSubmit={e => { e.preventDefault(); ppConfirm(); }}>
              <input
                type="password"
                autoFocus
                placeholder="Passphrase"
                aria-label="Backup passphrase"
                autoComplete={ppModal.mode === "export" ? "new-password" : "current-password"}
                value={ppModal.value}
                onChange={e => setPpModal(m => ({ ...m, value: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === "Escape") ppCancel();
                }}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: T.radius.md,
                  border: `1px solid ${T.border.default}`,
                  background: T.bg.base,
                  color: T.text.primary,
                  fontSize: 16,
                  marginBottom: 20,
                  outline: "none",
                  boxShadow: "inset 0 2px 4px rgba(0,0,0,0.1)",
                }}
              />
              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={ppCancel}
                  style={{
                    flex: 1,
                    padding: "12px 0",
                    borderRadius: T.radius.md,
                    border: `1px solid ${T.border.default}`,
                    background: "transparent",
                    color: T.text.secondary,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={ppConfirm}
                  disabled={!ppModal.value}
                  style={{
                    flex: 1,
                    padding: "12px 0",
                    borderRadius: T.radius.md,
                    border: "none",
                    background: ppModal.value ? T.accent.primary : T.text.muted,
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: ppModal.value ? "pointer" : "not-allowed",
                  }}
                >
                  {ppModal.mode === "export" ? "Encrypt & Export" : "Decrypt"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 6px)",
          paddingLeft: 16,
          paddingRight: 16,
          paddingBottom: 8,
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
              fontSize: 18,
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
            <p style={{ fontSize: 10, color: T.text.dim, marginTop: 2, fontFamily: T.font.mono, margin: 0 }}>
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
          paddingTop: 4,
          overflowY: "auto",
          overscrollBehavior: "contain",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ width: "100%", maxWidth: 768, margin: "0 auto", display: "flex", flexDirection: "column", flex: 1 }}>
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
            // Offset the .page-body top padding for sub-menus so they sit flush with the header's aesthetic bottom border
            marginTop: activeMenu ? -4 : 0,
          }}
        >
          {!activeMenu && (
            <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: 40, marginTop: 12 }}>
              {/* Profile & Display */}
              <div>
                <span style={{ fontSize: 13, fontWeight: 800, color: T.text.secondary, marginLeft: 16, marginBottom: 8, display: "block", letterSpacing: "0.03em", textTransform: "uppercase" }}>
                  Preferences
                </span>
                <div style={{ background: T.bg.card, borderRadius: T.radius.xl, border: `1px solid ${T.border.subtle}` }}>
                  {([
                    { id: "finance", label: "Financial Profile", icon: Target, color: T.accent.emerald, desc: "Income, region, housing, demographics" },
                    { id: "ai", label: "Assistant Persona", icon: Cpu, color: T.status.blue, desc: "Model routing & behavior" },
                  ] as const).map((item, i, arr) => (
                    <button
                      key={item.id}
                      className="settings-row"
                      onClick={() => {
                        setActiveMenu(item.id);
                        navDir.current = "forward";
                        haptic.light();
                      }}
                      style={{
                        margin: 0, width: "100%", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", border: "none", borderBottom: i < arr.length - 1 ? `1px solid ${T.border.subtle}` : "none", cursor: "pointer", textAlign: "left"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: `${item.color}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <item.icon size={16} color={item.color} />
                        </div>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: T.text.primary }}>{item.label}</div>
                          <div style={{ fontSize: 11, color: T.text.muted, marginTop: 2 }}>{item.desc}</div>
                        </div>
                      </div>
                      <ChevronRight className="chevron-icon" size={18} color={T.text.muted} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Data & Integrations */}
              <div>
                <span style={{ fontSize: 13, fontWeight: 800, color: T.text.secondary, marginLeft: 16, marginBottom: 8, display: "block", letterSpacing: "0.03em", textTransform: "uppercase" }}>
                  Data & Security
                </span>
                <div style={{ background: T.bg.card, borderRadius: T.radius.xl, border: `1px solid ${T.border.subtle}` }}>
                  {([
                    ...(ENABLE_PLAID ? [{ id: "plaid", label: "Bank Connections", icon: Building2, color: T.status.purple || "#8a2be2", desc: "Manage synced accounts" }] : []),
                    { id: "backup", label: "Backup & Sync", icon: Database, color: T.status.green, desc: "Backup data, restore, export history" },
                    { id: "security", label: "App Security", icon: Lock, color: T.status.red, desc: "Passcodes, Face ID" },
                    { id: "guide", label: "Help & Guide", icon: Info, color: T.text.secondary, desc: "Learn how Catalyst works" },
                    { id: "dev", label: "Developer Tools", icon: Terminal, color: T.text.dim, desc: "Simulators & testing" },
                  ] as const).map((item, i, arr) => (
                    <button
                      key={item.id}
                      className="settings-row"
                      onClick={() => {
                        if (item.id === "guide") {
                          if (typeof onShowGuide === "function") onShowGuide();
                          return;
                        }
                        setActiveMenu(item.id as Exclude<SettingsMenu, null>);
                        navDir.current = "forward";
                        haptic.light();
                      }}
                      style={{
                        margin: 0, width: "100%", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", border: "none", borderBottom: i < arr.length - 1 ? `1px solid ${T.border.subtle}` : "none", cursor: "pointer", textAlign: "left"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: `${item.color}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <item.icon size={16} color={item.color} />
                        </div>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: T.text.primary }}>{item.label}</div>
                          <div style={{ fontSize: 11, color: T.text.muted, marginTop: 2 }}>{item.desc}</div>
                        </div>
                      </div>
                      <ChevronRight className="chevron-icon" size={18} color={T.text.muted} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Subscription placeholder */}             {/* Subscription (visible when gating is on) */}
              {shouldShowGating() && (
                <div>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: T.text.secondary,
                      marginLeft: 16,
                      marginBottom: 8,
                      display: "block",
                      letterSpacing: "0.03em",
                      textTransform: "uppercase",
                    }}
                  >
                    Subscription
                  </span>
                  {proEnabled ? (
                    <button
                      className="hover-btn settings-row"
                      onClick={async () => {
                        haptic.medium();
                        const { presentCustomerCenter } = await loadRevenueCat();
                        await presentCustomerCenter();
                      }}
                      style={{
                        width: "100%",
                        padding: "14px 16px",
                        borderRadius: T.radius.xl,
                        border: `1px solid ${T.accent.primary}40`,
                        background: `${T.accent.primary}10`,
                        color: T.accent.primary,
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        boxShadow: `0 4px 12px ${T.accent.primary}10`,
                      }}
                    >
                      <span>Manage Pro Subscription</span>
                      <ChevronRight className="chevron-icon" size={18} color={T.accent.primary} />
                    </button>
                  ) : (
                    <ProBanner
                      onUpgrade={() => setShowPaywall(true)}
                      label="Upgrade to Pro"
                      sublabel="50 audits/mo, premium models, 5m market data"
                    />
                  )}
                </div>
              )}

              {/* Setup Progress — deferred onboarding items (auto-hide after 30 days or all done) */}
              {(() => {
                // Auto-hide: seed install date + check 30-day expiry
                const installTs = parseInt(localStorage.getItem("app-install-ts") || "0", 10);
                if (!installTs) localStorage.setItem("app-install-ts", String(Date.now()));
                const daysSinceInstall = installTs ? (Date.now() - installTs) / 86400000 : 0;
                const fc = financialConfig || {};
                const steps: SetupStep[] = [
                  {
                    label: "Connect your income",
                    done: !!(fc.paycheckStandard || fc.hourlyRateNet || fc.averagePaycheck),
                    nav: "input",
                  },
                  { label: "Set weekly spending limit", done: !!fc.weeklySpendAllowance, nav: "input" },
                  { label: "Set a minimum cash floor", done: !!fc.emergencyFloor, nav: "input" },
                  { label: "Track your credit cards", done: (cards || []).length > 0, nav: "portfolio" },
                  { label: "Add recurring bills", done: (renewals || []).length > 0, nav: "portfolio" },
                ];
                const done = steps.filter(s => s.done).length;
                const total = steps.length;
                const pct = Math.round((done / total) * 100);
                // Auto-hide: all criteria met OR 30 days since install OR manually dismissed
                if (pct === 100 || daysSinceInstall >= 30 || setupDismissed) return null;
                return (
                  <div style={{ marginBottom: 4 }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 800,
                        color: T.text.secondary,
                        marginLeft: 16,
                        marginBottom: 8,
                        display: "block",
                        letterSpacing: "0.03em",
                        textTransform: "uppercase",
                      }}
                    >
                      Setup Progress
                    </span>
                    <div
                      style={{
                        background: `linear-gradient(145deg, ${T.bg.card}, ${T.bg.surface})`,
                        borderRadius: T.radius.xl,
                        border: `1px solid ${T.border.subtle}`,
                        padding: "16px 20px",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                        backdropFilter: "blur(12px)",
                        position: "relative",
                      }}
                    >
                      <button
                        onClick={() => {
                          localStorage.setItem("setup-progress-dismissed", "1");
                          setSetupDismissed(true);
                          haptic.light();
                        }}
                        style={{
                          position: "absolute",
                          top: 10,
                          right: 10,
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          border: `1px solid ${T.border.subtle}`,
                          background: T.bg.surface,
                          color: T.text.muted,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          fontWeight: 700,
                          lineHeight: 1,
                          padding: 0,
                        }}
                      >
                        ×
                      </button>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: 12,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: "50%",
                              background: pct === 100 ? `${T.status.green}1A` : `${T.accent.primary}1A`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              border: `1px solid ${pct === 100 ? T.status.green : T.accent.primary}40`,
                            }}
                          >
                            {pct === 100 ? (
                              <span style={{ fontSize: 14 }}>🚀</span>
                            ) : (
                              <span style={{ fontSize: 14 }}>🎯</span>
                            )}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span
                              style={{
                                fontSize: 14,
                                fontWeight: 800,
                                color: pct === 100 ? T.status.green : T.text.primary,
                                letterSpacing: "-0.02em",
                              }}
                            >
                              {pct === 100 ? "You're all set!" : "Let's finish up"}
                            </span>
                            <span style={{ fontSize: 11, color: T.text.muted, fontWeight: 500 }}>
                              {done} of {total} steps completed
                            </span>
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 800,
                            color: pct === 100 ? T.status.green : T.accent.primary,
                            fontFamily: T.font.mono,
                            letterSpacing: "-0.02em",
                          }}
                        >
                          {pct}%
                        </span>
                      </div>
                      <div
                        style={{
                          height: 6,
                          borderRadius: 3,
                          background: T.bg.elevated,
                          marginBottom: 16,
                          overflow: "hidden",
                          boxShadow: "inset 0 1px 3px rgba(0,0,0,0.2)",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            borderRadius: 3,
                            background:
                              pct === 100
                                ? T.status.green
                                : `linear-gradient(90deg, ${T.accent.primary}, ${T.accent.emerald})`,
                            width: `${pct}%`,
                            transition: "width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
                          }}
                        />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {steps.map((s, i) => (
                          <div
                            key={i}
                            className="hover-lift"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "8px 12px",
                              background: s.done ? `${T.bg.surface}80` : T.bg.elevated,
                              borderRadius: T.radius.md,
                              border: `1px solid ${s.done ? T.border.subtle : T.border.default}`,
                              transition: "all 0.2s",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div
                                style={{
                                  width: 18,
                                  height: 18,
                                  borderRadius: "50%",
                                  background: s.done ? T.status.green : T.bg.surface,
                                  border: `1px solid ${s.done ? T.status.green : T.border.subtle}`,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  transition: "all 0.3s",
                                }}
                              >
                                {s.done && <span style={{ color: "#fff", fontSize: 10, fontWeight: 800 }}>✓</span>}
                              </div>
                              <span
                                style={{
                                  fontSize: 13,
                                  fontWeight: s.done ? 500 : 700,
                                  color: s.done ? T.text.dim : T.text.primary,
                                  textDecoration: s.done ? "line-through" : "none",
                                }}
                              >
                                {s.label}
                              </span>
                            </div>
                            {!s.done && s.nav && (
                              <button
                                onClick={() => {
                                  if (s.nav) navTo(s.nav);
                                  if (s.menu) setActiveMenu(s.menu);
                                  haptic.light();
                                }}
                                style={{
                                  fontSize: 11,
                                  fontWeight: 800,
                                  color: T.accent.primary,
                                  background: `${T.accent.primary}1A`,
                                  border: "none",
                                  cursor: "pointer",
                                  padding: "6px 12px",
                                  borderRadius: 999,
                                  transition: "background 0.2s",
                                }}
                              >
                                Set up →
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <div style={{ display: activeMenu && activeSegment === "app" ? "block" : "none" }}>
            {/* ── FINANCIAL PROFILE SUB-MENU ── */}
            <div style={{ display: activeMenu === "finance" ? "flex" : "none", flexDirection: "column", gap: 20, padding: "20px 0 28px" }}>
              <div style={{ margin: "0 16px" }}>
                <Card
                  variant="glass"
                  style={{
                    padding: "18px 18px 16px",
                    border: `1px solid ${T.border.subtle}`,
                    background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.surface})`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.02em" }}>
                        Keep this profile lean
                      </div>
                      <p style={{ margin: "6px 0 0", fontSize: 12, lineHeight: 1.55, color: T.text.secondary }}>
                        Only the inputs that change audit math belong here. If a value does not affect cash flow, leave it blank.
                      </p>
                    </div>
                    <div
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: `1px solid ${T.accent.primary}30`,
                        background: `${T.accent.primary}12`,
                        color: T.accent.primary,
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: "0.04em",
                        whiteSpace: "nowrap",
                      }}
                    >
                      PROFILE SNAPSHOT
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                    {financeSummaryItems.map((item) => (
                      <div
                        key={item.label}
                        style={{
                          padding: "12px 12px 11px",
                          borderRadius: T.radius.lg,
                          border: `1px solid ${T.border.subtle}`,
                          background: T.bg.elevated,
                        }}
                      >
                        <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          {item.label}
                        </div>
                        <div style={{ marginTop: 5, fontSize: 13, fontWeight: 700, color: T.text.primary, lineHeight: 1.35 }}>
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              {/* Currency */}
              <div>
                <Label style={{ marginLeft: 16, marginBottom: 8, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.03em" }}>Base Currency</Label>
                <div style={{ margin: "0 16px", background: T.bg.card, borderRadius: T.radius.xl, border: `1px solid ${T.border.subtle}`, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
                    <span style={{ fontSize: 15, color: T.text.primary, fontWeight: 600 }}>Currency</span>
                    <select
                      value={financialConfig?.currencyCode || "USD"}
                      onChange={e => setFinancialConfig(prev => ({ ...prev, currencyCode: e.target.value }))}
                      style={{ background: "transparent", border: "none", color: T.accent.primary, fontSize: 15, fontWeight: 700, cursor: "pointer", outline: "none", textAlign: "right", appearance: "none" }}
                    >
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="CAD">CAD ($)</option>
                      <option value="AUD">AUD ($)</option>
                      <option value="JPY">JPY (¥)</option>
                      <option value="INR">INR (₹)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Income Profile */}
              <div>
                <Label style={{ marginLeft: 16, marginBottom: 8, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.03em" }}>Income Profile</Label>
                <div style={{ margin: "0 16px", background: T.bg.card, borderRadius: T.radius.xl, border: `1px solid ${T.border.subtle}`, overflow: "hidden" }}>
                  
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${T.border.subtle}` }}>
                    <span style={{ fontSize: 15, color: T.text.primary, fontWeight: 600 }}>Pay Frequency</span>
                    <select
                      value={financialConfig?.payFrequency || "bi-weekly"}
                      onChange={e =>
                        setFinancialConfig({
                          type: "SET_FIELD",
                          field: "payFrequency",
                          value: e.target.value as PayFrequency,
                        })
                      }
                      style={{ background: "transparent", border: "none", color: T.accent.primary, fontSize: 15, fontWeight: 700, cursor: "pointer", outline: "none", textAlign: "right", appearance: "none" }}
                    >
                      <option value="weekly">Weekly</option>
                      <option value="bi-weekly">Bi-Weekly</option>
                      <option value="semi-monthly">Semi-Monthly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${T.border.subtle}` }}>
                    <span style={{ fontSize: 15, color: T.text.primary, fontWeight: 600 }}>Payday</span>
                    <select
                      value={financialConfig?.payday || "Friday"}
                      onChange={e =>
                        setFinancialConfig({
                          type: "SET_FIELD",
                          field: "payday",
                          value: e.target.value as Payday,
                        })
                      }
                      style={{ background: "transparent", border: "none", color: T.accent.primary, fontSize: 15, fontWeight: 700, cursor: "pointer", outline: "none", textAlign: "right", appearance: "none" }}
                    >
                      <option value="Monday">Monday</option>
                      <option value="Tuesday">Tuesday</option>
                      <option value="Wednesday">Wednesday</option>
                      <option value="Thursday">Thursday</option>
                      <option value="Friday">Friday</option>
                      <option value="Saturday">Saturday</option>
                      <option value="Sunday">Sunday</option>
                    </select>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${T.border.subtle}` }}>
                    <span style={{ fontSize: 15, color: T.text.primary, fontWeight: 600 }}>Income Type</span>
                    <select
                      value={financialConfig?.incomeType || "salary"}
                      onChange={e =>
                        setFinancialConfig({
                          type: "SET_FIELD",
                          field: "incomeType",
                          value: e.target.value as IncomeType,
                        })
                      }
                      style={{ background: "transparent", border: "none", color: T.accent.primary, fontSize: 15, fontWeight: 700, cursor: "pointer", outline: "none", textAlign: "right", appearance: "none" }}
                    >
                      <option value="salary">Salary</option>
                      <option value="hourly">Hourly</option>
                      <option value="variable">Variable</option>
                    </select>
                  </div>

                  {(!financialConfig?.incomeType || financialConfig?.incomeType === "salary") && (
                    <>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${T.border.subtle}` }}>
                        <span style={{ fontSize: 15, color: T.text.primary, fontWeight: 600 }}>Standard Paycheck</span>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <span style={{ color: T.text.muted, fontSize: 15, marginRight: 4 }}>$</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={financialConfig?.paycheckStandard || ""}
                            onChange={e => {
                               const val = e.target.value.replace(/[^0-9.]/g, '');
                               setFinancialConfig(prev => ({ ...prev, paycheckStandard: val ? parseFloat(val) : 0 }));
                            }}
                            placeholder="0"
                            style={{ background: "transparent", border: "none", color: T.text.secondary, fontSize: 15, fontWeight: 600, outline: "none", textAlign: "right", width: 90 }}
                          />
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
                        <span style={{ fontSize: 15, color: T.text.primary, fontWeight: 600 }}>1st of Month Paycheck</span>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <span style={{ color: T.text.muted, fontSize: 15, marginRight: 4 }}>$</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={financialConfig?.paycheckFirstOfMonth || ""}
                            onChange={e => {
                               const val = e.target.value.replace(/[^0-9.]/g, '');
                               setFinancialConfig(prev => ({ ...prev, paycheckFirstOfMonth: val ? parseFloat(val) : 0 }));
                            }}
                            placeholder="Optional"
                            style={{ background: "transparent", border: "none", color: T.text.secondary, fontSize: 15, fontWeight: 600, outline: "none", textAlign: "right", width: 90 }}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {financialConfig?.incomeType === "hourly" && (
                    <>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${T.border.subtle}` }}>
                        <span style={{ fontSize: 15, color: T.text.primary, fontWeight: 600 }}>Hourly Rate (Net)</span>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <span style={{ color: T.text.muted, fontSize: 15, marginRight: 4 }}>$</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={financialConfig?.hourlyRateNet || ""}
                            onChange={e => {
                               const val = e.target.value.replace(/[^0-9.]/g, '');
                               setFinancialConfig(prev => ({ ...prev, hourlyRateNet: val ? parseFloat(val) : 0 }));
                            }}
                            placeholder="0.00"
                            style={{ background: "transparent", border: "none", color: T.text.secondary, fontSize: 15, fontWeight: 600, outline: "none", textAlign: "right", width: 90 }}
                          />
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
                        <span style={{ fontSize: 15, color: T.text.primary, fontWeight: 600 }}>Typical Hours</span>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={financialConfig?.typicalHours || ""}
                            onChange={e => {
                               const val = e.target.value.replace(/[^0-9.]/g, '');
                               setFinancialConfig(prev => ({ ...prev, typicalHours: val ? parseFloat(val) : 0 }));
                            }}
                            placeholder="80"
                            style={{ background: "transparent", border: "none", color: T.text.secondary, fontSize: 15, fontWeight: 600, outline: "none", textAlign: "right", width: 60 }}
                          />
                          <span style={{ color: T.text.muted, fontSize: 15, marginLeft: 6 }}>hrs</span>
                        </div>
                      </div>
                    </>
                  )}

                  {financialConfig?.incomeType === "variable" && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
                      <span style={{ fontSize: 15, color: T.text.primary, fontWeight: 600 }}>Average Paycheck</span>
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <span style={{ color: T.text.muted, fontSize: 15, marginRight: 4 }}>$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={financialConfig?.averagePaycheck || ""}
                          onChange={e => {
                              const val = e.target.value.replace(/[^0-9.]/g, '');
                              setFinancialConfig(prev => ({ ...prev, averagePaycheck: val ? parseFloat(val) : 0 }));
                          }}
                          placeholder="0"
                          style={{ background: "transparent", border: "none", color: T.text.secondary, fontSize: 15, fontWeight: 600, outline: "none", textAlign: "right", width: 90 }}
                        />
                      </div>
                    </div>
                  )}

                </div>
              </div>

              {/* Demographics */}
              <div>
                <Label style={{ marginLeft: 16, marginBottom: 8, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.03em" }}>Demographics</Label>
                <div style={{ margin: "0 16px", background: T.bg.card, borderRadius: T.radius.xl, border: `1px solid ${T.border.subtle}`, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${T.border.subtle}` }}>
                    <span style={{ fontSize: 15, color: T.text.primary, fontWeight: 600 }}>Birth Year</span>
                    <input
                      type="number"
                      value={financialConfig?.birthYear || ""}
                      onChange={e => setFinancialConfig(prev => ({ ...prev, birthYear: e.target.value ? parseInt(e.target.value) : null }))}
                      placeholder="e.g. 1990"
                      style={{ background: "transparent", border: "none", color: T.text.secondary, fontSize: 15, fontWeight: 600, outline: "none", textAlign: "right", width: 80 }}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
                    <span style={{ fontSize: 15, color: T.text.primary, fontWeight: 600 }}>State</span>
                    <select
                      value={financialConfig?.stateCode || ""}
                      onChange={e => setFinancialConfig(prev => ({ ...prev, stateCode: e.target.value }))}
                      style={{ background: "transparent", border: "none", color: T.accent.primary, fontSize: 15, fontWeight: 700, cursor: "pointer", outline: "none", textAlign: "right", appearance: "none" }}
                    >
                      <option value="">— Not in US —</option>
                      <option value="AL">AL</option><option value="AK">AK 🟢</option><option value="AZ">AZ</option><option value="AR">AR</option>
                      <option value="CA">CA</option><option value="CO">CO</option><option value="CT">CT</option><option value="DE">DE</option>
                      <option value="DC">DC</option><option value="FL">FL 🟢</option><option value="GA">GA</option><option value="HI">HI</option>
                      <option value="ID">ID</option><option value="IL">IL</option><option value="IN">IN</option><option value="IA">IA</option>
                      <option value="KS">KS</option><option value="KY">KY</option><option value="LA">LA</option><option value="ME">ME</option>
                      <option value="MD">MD</option><option value="MA">MA</option><option value="MI">MI</option><option value="MN">MN</option>
                      <option value="MS">MS</option><option value="MO">MO</option><option value="MT">MT</option><option value="NE">NE</option>
                      <option value="NV">NV 🟢</option><option value="NH">NH 🟢</option><option value="NJ">NJ</option><option value="NM">NM</option>
                      <option value="NY">NY</option><option value="NC">NC</option><option value="ND">ND</option><option value="OH">OH</option>
                      <option value="OK">OK</option><option value="OR">OR</option><option value="PA">PA</option><option value="RI">RI</option>
                      <option value="SC">SC</option><option value="SD">SD 🟢</option><option value="TN">TN 🟢</option><option value="TX">TX 🟢</option>
                      <option value="UT">UT</option><option value="VT">VT</option><option value="VA">VA</option><option value="WA">WA 🟢</option>
                      <option value="WV">WV</option><option value="WI">WI</option><option value="WY">WY 🟢</option>
                    </select>
                  </div>
                </div>
              </div>

                  {/* ═══ "WHAT-IF" SCENARIO ENGINE (Pro Tier Power Feature 3) ═══ */}
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <Label style={{ margin: 0 }}>"What-If" Scenarios</Label>
                      {!proEnabled && <div style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", background: `${T.accent.primary}14`, color: T.accent.primary, border: `1px solid ${T.accent.primary}30`, borderRadius: 999 }}>PRO</div>}
                    </div>
                    <Card
                      variant="glass"
                      style={{
                        padding: "16px",
                        border: `1px solid ${T.border.subtle}`,
                        background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.surface})`,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${T.accent.emerald}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Layers size={18} color={T.accent.emerald} strokeWidth={2.5} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: T.text.primary, marginBottom: 2 }}>Scenario Sandbox</div>
                          <div style={{ fontSize: 11, color: T.text.secondary, marginBottom: 12, lineHeight: 1.5 }}>
                            Test a new salary, relocation, or massive expense without losing your baseline configuration.
                          </div>

                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              onClick={() => {
                                haptic.medium();
                                localStorage.setItem("catalyst_baseline_config", JSON.stringify(financialConfig));
                                window.toast?.success?.("Baseline snapshot saved.");
                              }}
                              disabled={!proEnabled}
                              style={{ flex: 1, padding: "10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.surface, color: proEnabled ? T.text.primary : T.text.dim, fontSize: 11, fontWeight: 700, cursor: proEnabled ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: proEnabled ? 1 : 0.6 }}
                              className="hover-btn"
                            >
                              <Save size={14} color={T.text.secondary} />
                              Save Baseline
                            </button>
                            <button
                              onClick={() => {
                                haptic.light();
                                const saved = localStorage.getItem("catalyst_baseline_config");
                                if (saved && setFinancialConfig) {
                                  try {
                                    setFinancialConfig(JSON.parse(saved));
                                    window.toast?.success?.("Baseline restored.");
                                  } catch (e) { }
                                } else {
                                  window.toast?.error?.("No baseline saved.");
                                }
                              }}
                              disabled={!proEnabled}
                              style={{ flex: 1, padding: "10px", borderRadius: T.radius.md, border: `1px dashed ${T.accent.emerald}50`, background: "transparent", color: proEnabled ? T.accent.emerald : T.text.dim, fontSize: 11, fontWeight: 700, cursor: proEnabled ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: proEnabled ? 1 : 0.6 }}
                              className="hover-btn"
                            >
                              <RefreshCw size={14} />
                              Restore
                            </button>
                          </div>
                          {!proEnabled && (
                            <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                              <span style={{ fontSize: 11, color: T.text.muted, lineHeight: 1.45 }}>
                                Keep one clean baseline, then pressure-test changes without touching your live profile.
                              </span>
                              <button
                                onClick={() => setShowPaywall(true)}
                                style={{ padding: "8px 14px", borderRadius: 999, background: T.accent.primary, color: "#fff", border: "none", fontSize: 11, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}
                              >
                                Unlock Pro
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  </div>

              {/* Housing */}
              <div>
                <Label style={{ marginLeft: 16, marginBottom: 8, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.03em" }}>Housing Situation</Label>
                <div style={{ margin: "0 16px", background: T.bg.card, borderRadius: T.radius.xl, border: `1px solid ${T.border.subtle}`, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${T.border.subtle}` }}>
                    <span style={{ fontSize: 15, color: T.text.primary, fontWeight: 600 }}>Type</span>
                    <select
                      value={financialConfig?.housingType || ""}
                      onChange={e =>
                        setFinancialConfig({
                          type: "SET_FIELD",
                          field: "housingType",
                          value: e.target.value as HousingType,
                        })
                      }
                      style={{ background: "transparent", border: "none", color: T.accent.primary, fontSize: 15, fontWeight: 700, cursor: "pointer", outline: "none", textAlign: "right", appearance: "none" }}
                    >
                      <option value="">Unspecified</option>
                      <option value="rent">Renting</option>
                      <option value="own">Homeowner</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  {financialConfig?.housingType === "rent" && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
                      <span style={{ fontSize: 15, color: T.text.primary, fontWeight: 600 }}>Monthly Rent</span>
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <span style={{ color: T.text.muted, fontSize: 15, marginRight: 4 }}>$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={financialConfig?.monthlyRent || ""}
                          onChange={e => {
                               const val = e.target.value.replace(/[^0-9.]/g, '');
                               setFinancialConfig(prev => ({ ...prev, monthlyRent: val ? parseFloat(val) : 0 }));
                          }}
                          placeholder="0"
                          style={{ background: "transparent", border: "none", color: T.text.secondary, fontSize: 15, fontWeight: 600, outline: "none", textAlign: "right", width: 90 }}
                        />
                      </div>
                    </div>
                  )}

                  {financialConfig?.housingType === "own" && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
                      <span style={{ fontSize: 15, color: T.text.primary, fontWeight: 600 }}>Mortgage (PITI)</span>
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <span style={{ color: T.text.muted, fontSize: 15, marginRight: 4 }}>$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={financialConfig?.mortgagePayment || ""}
                          onChange={e => {
                               const val = e.target.value.replace(/[^0-9.]/g, '');
                               setFinancialConfig(prev => ({ ...prev, mortgagePayment: val ? parseFloat(val) : 0 }));
                          }}
                          placeholder="0"
                          style={{ background: "transparent", border: "none", color: T.text.secondary, fontSize: 15, fontWeight: 600, outline: "none", textAlign: "right", width: 90 }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* ── APPEARANCE (Moved to Profile) ── */}
            <div style={{ display: activeMenu === "profile" ? "block" : "none", marginTop: 16 }}>
              <Card style={{ padding: 0, overflow: 'hidden', borderLeft: `3px solid ${T.accent.purple}40`, borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTop: "none" }}>
                <div style={{ padding: "16px" }}>
                  <Label>Appearance</Label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: T.bg.elevated, padding: "12px 16px", borderRadius: T.radius.lg, border: `1px solid ${T.border.subtle}` }}>
                      <span style={{ fontSize: 14, color: T.text.primary, fontWeight: 600 }}>Dark Theme</span>
                      <Toggle value={true} onChange={() => { }} />
                    </div>
                  </div>
                  <p style={{ marginTop: 12, fontSize: 12, color: T.text.muted, lineHeight: 1.5 }}>
                    Catalyst Cash only supports Dark Mode at this time to preserve battery life and high-contrast styling.
                  </p>
                </div>
              </Card>
            </div>


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
               proEnabled={proEnabled}
               showModelSelector={rawTierId === "pro"}
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
            <Card
              style={{ borderLeft: `3px solid ${T.text.dim}40`, display: activeMenu === "dev" ? "block" : "none" }}
            >
              <Label>Simulators</Label>
              <p style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.6, marginBottom: 16 }}>
                Trigger simulated native bridging events for testing features on web.
              </p>
              
              <button
                onClick={() => {
                  haptic.medium();
                  window.dispatchEvent(new CustomEvent("simulate-geo-fence", { detail: { store: "Whole Foods" } }));
                }}
                className="hover-btn"
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: T.radius.md,
                  border: `1px solid ${T.border.default}`,
                  background: T.bg.elevated,
                  color: T.text.primary,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  marginBottom: 12
                }}
              >
                <MapPin size={16} color={T.status.green} />
                Simulate: Arrive at Whole Foods
              </button>
              
              <button
                onClick={() => {
                  haptic.medium();
                  window.dispatchEvent(new CustomEvent("simulate-geo-fence", { detail: { store: "Shell Station" } }));
                }}
                className="hover-btn"
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: T.radius.md,
                  border: `1px solid ${T.border.default}`,
                  background: T.bg.elevated,
                  color: T.text.primary,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8
                }}
              >
                <MapPin size={16} color={T.status.red} />
                Simulate: Arrive at Shell Gas
              </button>
            </Card>

            {/* ── Security Suite ───────────────────────────────────────── */}
            <SecuritySection 
                 activeMenu={activeMenu}
                 appPasscode={appPasscode}
                 handlePasscodeChange={handlePasscodeChange}
                 requireAuth={requireAuth}
                 handleRequireAuthToggle={handleRequireAuthToggle}
                 useFaceId={useFaceId}
                 handleUseFaceIdToggle={handleUseFaceIdToggle}
                 lockTimeout={lockTimeout}
                 setLockTimeout={setLockTimeout}
                 confirmDataDeletion={confirmDataDeletion}
                 setConfirmDataDeletion={setConfirmDataDeletion}
                 deletionInProgress={deletionInProgress}
                 setDeletionInProgress={setDeletionInProgress}
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
