import { useState, useEffect, useRef, useCallback, Suspense, lazy } from "react";
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
import { Card, Label, InlineTooltip } from "../ui.jsx";
import { Mono } from "../components.jsx";
import { db, FaceId, nativeExport, fmt } from "../utils.js";
import { isSecuritySensitiveKey } from "../securityKeys.js";
import { CURRENCIES } from "../currency.js";

import { haptic } from "../haptics.js";
import { Capacitor } from "@capacitor/core";

import { getConnections, removeConnection } from "../plaid.js";
import { deleteSecureItem, getSecureItem, setSecureItem } from "../secureStore.js";
const LazyPlaidSection = lazy(() => import("../settings/PlaidSection.jsx"));
import { shouldShowGating, checkAuditQuota, getRawTier } from "../subscription.js";
import ProBanner from "./ProBanner.jsx";

const ENABLE_PLAID = true; // Toggle to false to hide, true to show Plaid integration
const LazyProPaywall = lazy(() => import("./ProPaywall.jsx"));
const loadBackupModule = () => import("../backup.js");
const loadSpreadsheetModule = () => import("../spreadsheet.js");
const loadAppleSignIn = () => import("@capacitor-community/apple-sign-in");
const loadCloudSync = () => import("../cloudSync.js");
const loadRevenueCat = () => import("../revenuecat.js");

import { useAudit } from "../contexts/AuditContext.jsx";
import { useSettings } from "../contexts/SettingsContext.jsx";
import { useSecurity } from "../contexts/SecurityContext.jsx";
import { usePortfolio } from "../contexts/PortfolioContext.jsx";
import { useNavigation } from "../contexts/NavigationContext.jsx";

export default function SettingsTab({
  onClear,
  onFactoryReset,
  onClearDemoData,
  onBack,
  onRestoreComplete,
  onShowGuide,
  proEnabled = false,
}) {
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
  const [lastBackupTS, setLastBackupTS] = useState(null);

  useEffect(() => {
    // Initialization now handled at root level in App.jsx
    db.get("last-backup-ts")
      .then(ts => setLastBackupTS(ts))
      .catch(() => { });
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
            const { sanitizePlaidForBackup } = await import("../securityKeys.js");
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
      if (window.toast) window.toast.success("Apple ID linked for App Unlocking.");
    } catch (error) {
      console.error(error);
      if (window.toast) window.toast.error("Apple Sign-In failed or was cancelled.");
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
    if (window.toast) window.toast.success("Apple ID unlinked");
  };

  const PRIVACY_URL = "https://catalystcash.app/privacy";

  const [showKey, setShowKey] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmFactoryReset, setConfirmFactoryReset] = useState(false);
  const [confirmDataDeletion, setConfirmDataDeletion] = useState(false);
  const [deletionInProgress, setDeletionInProgress] = useState(false);
  const [backupStatus, setBackupStatus] = useState(null);
  const [restoreStatus, setRestoreStatus] = useState(null);
  const [activeSegment, setActiveSegment] = useState("app"); // Kept for logic
  const [appTab, setAppTab] = useState("ai"); // Kept for logic
  const [financeTab, setFinanceTab] = useState("income"); // Kept for logic
  const [activeMenu, setActiveMenu] = useState(null); // null means root menu, otherwise string ID of the menu
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [ppModal, setPpModal] = useState({ open: false, mode: "export", label: "", resolve: null, value: "" });
  const [setupDismissed, setSetupDismissed] = useState(() => !!localStorage.getItem("setup-progress-dismissed"));
  const [showApiSetup, setShowApiSetup] = useState(Boolean((apiKey || "").trim()));
  const [editingSection, setEditingSection] = useState(null);
  const [showPaywall, setShowPaywall] = useState(false);

  const scrollRef = useRef(null);
  const swipeTouchStart = useRef(null);
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
        const { sanitizePlaidForBackup } = await import("../securityKeys.js");
        backup.data["plaid-connections-sanitized"] = sanitizePlaidForBackup(plaidConns2);
      }
      const success = await uploadToICloud(backup, appPasscode || null);
      if (success) {
        const now = Date.now();
        await db.set("last-backup-ts", now);
        setLastBackupTS(now);
        if (window.toast) window.toast.success("iCloud backup successful");
      } else {
        if (window.toast) window.toast.error("Failed to backup to iCloud");
      }
    } catch (e) {
      console.error(e);
      if (window.toast) window.toast.error("iCloud sync failed");
    } finally {
      setIsForceSyncing(false);
    }
  };

  const handleSwipeTouchStart = useCallback(e => {
    const touch = e.touches[0];
    swipeTouchStart.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleSwipeTouchEnd = useCallback(
    e => {
      if (!swipeTouchStart.current) return;
      const touch = e.changedTouches[0];
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
  }, [activeMenu, activeSegment, appTab, financeTab]);

  const showPassphraseModal = mode =>
    new Promise(resolve => {
      const label =
        mode === "export"
          ? "Create a passphrase to encrypt this backup. You will need it to restore."
          : "Enter the passphrase for this encrypted backup.";
      setPpModal({ open: true, mode, label, resolve, value: "" });
    });
  const ppConfirm = () => {
    const r = ppModal.resolve;
    setPpModal(m => ({ ...m, open: false, resolve: null }));
    r(ppModal.value || "");
  };
  const ppCancel = () => {
    const r = ppModal.resolve;
    setPpModal(m => ({ ...m, open: false, resolve: null }));
    r("");
  };

  const handlePasscodeChange = e => {
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

  const handleRequireAuthToggle = enable => {
    if (enable && appPasscode?.length !== 4) {
      if (window.toast) window.toast.error("Set a 4-digit App Passcode first");
      return;
    }
    setRequireAuth(enable);
    db.set("require-auth", enable);
    if (enable) {
      setLockTimeout(300);
      db.set("lock-timeout", 300);
      if (window.toast) window.toast.success("App Lock enabled with Passcode");
    } else {
      setUseFaceId(false);
      db.set("use-face-id", false);
      setLockTimeout(0);
      db.set("lock-timeout", 0);
    }
  };

  const handleUseFaceIdToggle = async enable => {
    if (!enable) {
      setUseFaceId(false);
      db.set("use-face-id", false);
      return;
    }

    if (Capacitor.getPlatform() === "web") {
      if (window.toast) window.toast.error("Face ID / Touch ID is not available on web");
      return;
    }

    try {
      const availability = await FaceId.isAvailable();
      if (!availability?.isAvailable) {
        if (window.toast) window.toast.error("No biometrics set up on this device.");
        return;
      }

      window.__biometricActive = true;
      await FaceId.authenticate({ reason: "Verify to enable Face ID / Touch ID for app lock" });

      haptic.success();
      setUseFaceId(true);
      db.set("use-face-id", true);
      if (window.toast) window.toast.success("Biometric Unlock Enabled");
    } catch (e) {
      console.error("Failed to enable Face ID:", e);
      haptic.error();
      if (window.toast) window.toast.error("Failed to verify biometrics.");
    } finally {
      setTimeout(() => {
        window.__biometricActive = false;
      }, 1000);
    }
  };
  const [statusMsg, setStatusMsg] = useState("");

  const currentProvider = getProvider(aiProvider || "gemini");
  const currentModels = currentProvider.models;
  const selectedModel = currentModels.find(m => m.id === aiModel) || currentModels[0];
  const isNonGemini = (aiProvider || "gemini") !== "gemini";
  const hasApiKey = Boolean((apiKey || "").trim());

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
      setStatusMsg(e.message || "Export failed");
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
      await generateBackupSpreadsheet(passphrase);
      setBackupStatus("done");
      setStatusMsg("Exported encrypted spreadsheet backup.");
    } catch (e) {
      setBackupStatus("error");
      setStatusMsg(e.message || "Export failed");
    }
  };

  const handleImport = async e => {
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
      const cancelled = e.message?.includes("cancelled");
      if (cancelled) {
        setRestoreStatus(null);
        return;
      }
      setRestoreStatus("error");
      setStatusMsg(e.message || "Import failed");
    }
  };

  const handleProviderSelect = prov => {
    setAiProvider(prov.id);
    setAiModel(prov.defaultModel);
    // Load that provider's stored key
    if (prov.keyStorageKey) {
      getSecureItem(prov.keyStorageKey).then(k => {
        const nextKey = typeof k === "string" ? k.trim() : "";
        setApiKey(nextKey);
        setShowApiSetup(Boolean(nextKey));
      });
    } else {
      setApiKey("");
      setShowApiSetup(false);
    }
  };

  const handleKeyChange = val => {
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
                  : activeMenu === "appearance"
                    ? "Appearance"
                    : activeMenu === "plaid"
                      ? "Bank Connections"
                      : activeMenu === "security"
                        ? "Security"
                        : activeMenu === "income"
                          ? "Income & Cash Flow"
                          : activeMenu === "debts"
                            ? "Debts & Liabilities"
                            : activeMenu === "targets"
                              ? "Savings Targets"
                              : activeMenu === "rules"
                                ? "Custom Rules"
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
                  {[
                    { id: "finance", label: "Financial Profile", icon: Target, color: T.accent.emerald, desc: "Region, housing, demographics" },
                    { id: "ai", label: "AI & Persona", icon: Cpu, color: T.status.blue, desc: "Model routing & behavior" },
                  ].map((item, i, arr) => (
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
                  Integrations
                </span>
                <div style={{ background: T.bg.card, borderRadius: T.radius.xl, border: `1px solid ${T.border.subtle}` }}>
                  {[
                    ...(ENABLE_PLAID ? [{ id: "plaid", label: "Bank Connections", icon: Building2, color: T.status.purple || "#8a2be2", desc: "Manage synced accounts" }] : []),
                    { id: "backup", label: "Backup & Sync", icon: Database, color: T.status.green, desc: "iCloud, exports, config" },
                    { id: "security", label: "App Security", icon: Lock, color: T.status.red, desc: "Passcodes, Face ID" },
                    { id: "guide", label: "Help & Guide", icon: Info, color: T.text.secondary, desc: "Learn how Catalyst works" },
                    { id: "dev", label: "Developer Tools", icon: Terminal, color: T.text.dim, desc: "Simulators & testing" },
                  ].map((item, i, arr) => (
                    <button
                      key={item.id}
                      className="settings-row"
                      onClick={() => {
                        if (item.id === "guide") {
                          if (typeof onShowGuide === "function") onShowGuide();
                          return;
                        }
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
                const steps = [
                  {
                    label: "Connect your income",
                    done: !!(fc.paycheckStandard || fc.hourlyRateNet || fc.averagePaycheck),
                    nav: "input",
                  },
                  { label: "Set weekly spending limit", done: !!fc.weeklySpendAllowance, nav: "input" },
                  { label: "Set a minimum cash floor", done: !!fc.emergencyFloor, nav: "input" },
                  { label: "Track your credit cards", done: (cards || []).length > 0, nav: "cards" },
                  { label: "Add recurring bills", done: (renewals || []).length > 0, nav: "renewals" },
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
                                  if (navTo) navTo(s.nav);
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
            {/* ── NEW FINANCIAL PROFILE SUB-MENU ── */}
            <div style={{ display: activeMenu === "finance" ? "block" : "none" }}>
              <Card style={{ padding: 0, overflow: 'hidden', borderLeft: `3px solid ${T.accent.primary}40`, borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTop: "none" }}>
                <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 24 }}>
                  {/* Currency */}
                  <div>
                    <Label>Base Currency</Label>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: T.bg.elevated, padding: "12px 16px", borderRadius: T.radius.lg, border: `1px solid ${T.border.subtle}` }}>
                      <span style={{ fontSize: 14, color: T.text.primary, fontWeight: 600 }}>Currency</span>
                      <select
                        value={financialConfig?.currencyCode || "USD"}
                        onChange={e => setFinancialConfig(prev => ({ ...prev, currencyCode: e.target.value }))}
                        style={{ background: "transparent", border: "none", color: T.accent.primary, fontSize: 14, fontWeight: 700, cursor: "pointer", outline: "none", textAlign: "right", appearance: "none" }}
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

                  {/* Income Profile */}
                  <div>
                    <Label>Income Profile</Label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: T.bg.elevated, padding: "12px 16px", borderRadius: T.radius.lg, border: `1px solid ${T.border.subtle}` }}>
                        <span style={{ fontSize: 14, color: T.text.primary, fontWeight: 600 }}>Pay Frequency</span>
                        <select
                          value={financialConfig?.payFrequency || "bi-weekly"}
                          onChange={e => setFinancialConfig(prev => ({ ...prev, payFrequency: e.target.value }))}
                          style={{ background: "transparent", border: "none", color: T.accent.primary, fontSize: 14, fontWeight: 700, cursor: "pointer", outline: "none", textAlign: "right", appearance: "none" }}
                        >
                          <option value="weekly">Weekly</option>
                          <option value="bi-weekly">Bi-Weekly</option>
                          <option value="semi-monthly">Semi-Monthly</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: T.bg.elevated, padding: "12px 16px", borderRadius: T.radius.lg, border: `1px solid ${T.border.subtle}` }}>
                        <span style={{ fontSize: 14, color: T.text.primary, fontWeight: 600 }}>Payday</span>
                        <select
                          value={financialConfig?.payday || "Friday"}
                          onChange={e => setFinancialConfig(prev => ({ ...prev, payday: e.target.value }))}
                          style={{ background: "transparent", border: "none", color: T.accent.primary, fontSize: 14, fontWeight: 700, cursor: "pointer", outline: "none", textAlign: "right", appearance: "none" }}
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

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: T.bg.elevated, padding: "12px 16px", borderRadius: T.radius.lg, border: `1px solid ${T.border.subtle}` }}>
                        <span style={{ fontSize: 14, color: T.text.primary, fontWeight: 600 }}>Income Type</span>
                        <select
                          value={financialConfig?.incomeType || "salary"}
                          onChange={e => setFinancialConfig(prev => ({ ...prev, incomeType: e.target.value }))}
                          style={{ background: "transparent", border: "none", color: T.accent.primary, fontSize: 14, fontWeight: 700, cursor: "pointer", outline: "none", textAlign: "right", appearance: "none" }}
                        >
                          <option value="salary">Salary</option>
                          <option value="hourly">Hourly</option>
                          <option value="variable">Variable</option>
                        </select>
                      </div>

                      {(!financialConfig?.incomeType || financialConfig?.incomeType === "salary") && (
                        <>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: T.bg.elevated, padding: "12px 16px", borderRadius: T.radius.lg, border: `1px solid ${T.border.subtle}` }}>
                            <span style={{ fontSize: 14, color: T.text.primary, fontWeight: 600 }}>Standard Paycheck</span>
                            <div style={{ display: "flex", alignItems: "center" }}>
                              <span style={{ color: T.text.muted, fontSize: 14, marginRight: 4 }}>$</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={financialConfig?.paycheckStandard || ""}
                                onChange={e => setFinancialConfig(prev => ({ ...prev, paycheckStandard: sanitizeDollar(e.target.value) }))}
                                placeholder="0"
                                style={{ background: "transparent", border: "none", color: T.text.secondary, fontSize: 14, fontWeight: 600, outline: "none", textAlign: "right", width: 80 }}
                              />
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: T.bg.elevated, padding: "12px 16px", borderRadius: T.radius.lg, border: `1px solid ${T.border.subtle}` }}>
                            <span style={{ fontSize: 14, color: T.text.primary, fontWeight: 600 }}>1st of Month Paycheck</span>
                            <div style={{ display: "flex", alignItems: "center" }}>
                              <span style={{ color: T.text.muted, fontSize: 14, marginRight: 4 }}>$</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={financialConfig?.paycheckFirstOfMonth || ""}
                                onChange={e => setFinancialConfig(prev => ({ ...prev, paycheckFirstOfMonth: sanitizeDollar(e.target.value) }))}
                                placeholder="Optional"
                                style={{ background: "transparent", border: "none", color: T.text.secondary, fontSize: 14, fontWeight: 600, outline: "none", textAlign: "right", width: 80 }}
                              />
                            </div>
                          </div>
                        </>
                      )}

                      {financialConfig?.incomeType === "hourly" && (
                        <>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: T.bg.elevated, padding: "12px 16px", borderRadius: T.radius.lg, border: `1px solid ${T.border.subtle}` }}>
                            <span style={{ fontSize: 14, color: T.text.primary, fontWeight: 600 }}>Hourly Rate (Net)</span>
                            <div style={{ display: "flex", alignItems: "center" }}>
                              <span style={{ color: T.text.muted, fontSize: 14, marginRight: 4 }}>$</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={financialConfig?.hourlyRateNet || ""}
                                onChange={e => setFinancialConfig(prev => ({ ...prev, hourlyRateNet: sanitizeDollar(e.target.value) }))}
                                placeholder="0.00"
                                style={{ background: "transparent", border: "none", color: T.text.secondary, fontSize: 14, fontWeight: 600, outline: "none", textAlign: "right", width: 80 }}
                              />
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: T.bg.elevated, padding: "12px 16px", borderRadius: T.radius.lg, border: `1px solid ${T.border.subtle}` }}>
                            <span style={{ fontSize: 14, color: T.text.primary, fontWeight: 600 }}>Typical Hours</span>
                            <div style={{ display: "flex", alignItems: "center" }}>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={financialConfig?.typicalHours || ""}
                                onChange={e => setFinancialConfig(prev => ({ ...prev, typicalHours: sanitizeDollar(e.target.value) }))}
                                placeholder="80"
                                style={{ background: "transparent", border: "none", color: T.text.secondary, fontSize: 14, fontWeight: 600, outline: "none", textAlign: "right", width: 80 }}
                              />
                              <span style={{ color: T.text.muted, fontSize: 14, marginLeft: 4 }}>hrs</span>
                            </div>
                          </div>
                        </>
                      )}

                      {financialConfig?.incomeType === "variable" && (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: T.bg.elevated, padding: "12px 16px", borderRadius: T.radius.lg, border: `1px solid ${T.border.subtle}` }}>
                          <span style={{ fontSize: 14, color: T.text.primary, fontWeight: 600 }}>Average Paycheck</span>
                          <div style={{ display: "flex", alignItems: "center" }}>
                            <span style={{ color: T.text.muted, fontSize: 14, marginRight: 4 }}>$</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={financialConfig?.averagePaycheck || ""}
                              onChange={e => setFinancialConfig(prev => ({ ...prev, averagePaycheck: sanitizeDollar(e.target.value) }))}
                              placeholder="0"
                              style={{ background: "transparent", border: "none", color: T.text.secondary, fontSize: 14, fontWeight: 600, outline: "none", textAlign: "right", width: 80 }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Demographics */}
                  <div>
                    <Label>Demographics</Label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: T.bg.elevated, padding: "12px 16px", borderRadius: T.radius.lg, border: `1px solid ${T.border.subtle}` }}>
                        <span style={{ fontSize: 14, color: T.text.primary, fontWeight: 600 }}>Birth Year</span>
                        <input
                          type="number"
                          value={financialConfig?.birthYear || ""}
                          onChange={e => setFinancialConfig(prev => ({ ...prev, birthYear: e.target.value ? parseInt(e.target.value) : null }))}
                          placeholder="e.g. 1990"
                          style={{ background: "transparent", border: "none", color: T.text.secondary, fontSize: 14, fontWeight: 600, outline: "none", textAlign: "right", width: 80 }}
                        />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: T.bg.elevated, padding: "12px 16px", borderRadius: T.radius.lg, border: `1px solid ${T.border.subtle}` }}>
                        <span style={{ fontSize: 14, color: T.text.primary, fontWeight: 600 }}>State</span>
                        <select
                          value={financialConfig?.stateCode || ""}
                          onChange={e => setFinancialConfig(prev => ({ ...prev, stateCode: e.target.value }))}
                          style={{ background: "transparent", border: "none", color: T.accent.primary, fontSize: 14, fontWeight: 700, cursor: "pointer", outline: "none", textAlign: "right", appearance: "none", maxWidth: 120 }}
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
                  <div style={{ marginTop: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <Label style={{ margin: 0 }}>"What-If" Scenarios</Label>
                      {!proEnabled && <div style={{ fontSize: 10, fontWeight: 800, padding: "2px 6px", background: T.accent.primary, color: "#fff", borderRadius: 4 }}>PRO</div>}
                    </div>
                    <Card
                      variant="elevated"
                      style={{
                        padding: "16px",
                        border: `1px solid ${T.accent.emerald}40`,
                        background: `linear-gradient(135deg, ${T.bg.card}, ${T.accent.emerald}0A)`,
                        position: "relative",
                        overflow: "hidden"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${T.accent.emerald}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Layers size={18} color={T.accent.emerald} strokeWidth={2.5} />
                        </div>
                        <div style={{ flex: 1, filter: !proEnabled ? "blur(3px)" : "none", pointerEvents: !proEnabled ? "none" : "auto", transition: "filter 0.3s" }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: T.text.primary, marginBottom: 2 }}>Scenario Sandbox</div>
                          <div style={{ fontSize: 11, color: T.text.secondary, marginBottom: 12 }}>
                            Test a new salary, relocation, or massive expense without losing your baseline configuration.
                          </div>

                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              onClick={() => {
                                haptic.medium();
                                localStorage.setItem("catalyst_baseline_config", JSON.stringify(financialConfig));
                                if (window.toast) window.toast.success("Baseline snapshot saved.");
                              }}
                              style={{ flex: 1, padding: "10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.surface, color: T.text.primary, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
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
                                    if (window.toast) window.toast.success("Baseline restored.");
                                  } catch (e) { }
                                } else {
                                  if (window.toast) window.toast.error("No baseline saved.");
                                }
                              }}
                              style={{ flex: 1, padding: "10px", borderRadius: T.radius.md, border: `1px dashed ${T.accent.emerald}50`, background: "transparent", color: T.accent.emerald, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                              className="hover-btn"
                            >
                              <RefreshCw size={14} />
                              Restore
                            </button>
                          </div>
                        </div>
                      </div>

                      {!proEnabled && (
                        <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(11, 10, 20, 0.4)", backdropFilter: "blur(2px)" }}>
                          <button
                            onClick={() => setShowPaywall(true)}
                            style={{ padding: "8px 16px", borderRadius: 20, background: T.accent.primary, color: "#fff", border: "none", fontSize: 12, fontWeight: 800, cursor: "pointer", boxShadow: `0 4px 12px ${T.accent.primary}40` }}
                          >
                            Unlock Pro
                          </button>
                        </div>
                      )}
                    </Card>
                  </div>

                  {/* Housing */}
                  <div>
                    <Label>Housing Situation</Label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: T.bg.elevated, padding: "12px 16px", borderRadius: T.radius.lg, border: `1px solid ${T.border.subtle}` }}>
                        <span style={{ fontSize: 14, color: T.text.primary, fontWeight: 600 }}>Type</span>
                        <select
                          value={financialConfig?.housingType || ""}
                          onChange={e => setFinancialConfig(prev => ({ ...prev, housingType: e.target.value }))}
                          style={{ background: "transparent", border: "none", color: T.accent.primary, fontSize: 14, fontWeight: 700, cursor: "pointer", outline: "none", textAlign: "right", appearance: "none" }}
                        >
                          <option value="">Unspecified</option>
                          <option value="rent">Renting</option>
                          <option value="own">Homeowner</option>
                          <option value="other">Other / Living with family</option>
                        </select>
                      </div>

                      {financialConfig?.housingType === "rent" && (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: T.bg.elevated, padding: "12px 16px", borderRadius: T.radius.lg, border: `1px solid ${T.border.subtle}` }}>
                          <span style={{ fontSize: 14, color: T.text.primary, fontWeight: 600 }}>Monthly Rent</span>
                          <div style={{ display: "flex", alignItems: "center" }}>
                            <span style={{ color: T.text.muted, fontSize: 14, marginRight: 4 }}>$</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={financialConfig?.monthlyRent || ""}
                              onChange={e => setFinancialConfig(prev => ({ ...prev, monthlyRent: sanitizeDollar(e.target.value) }))}
                              placeholder="0"
                              style={{ background: "transparent", border: "none", color: T.text.secondary, fontSize: 14, fontWeight: 600, outline: "none", textAlign: "right", width: 80 }}
                            />
                          </div>
                        </div>
                      )}

                      {financialConfig?.housingType === "own" && (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: T.bg.elevated, padding: "12px 16px", borderRadius: T.radius.lg, border: `1px solid ${T.border.subtle}` }}>
                          <span style={{ fontSize: 14, color: T.text.primary, fontWeight: 600 }}>Mortgage (PITI)</span>
                          <div style={{ display: "flex", alignItems: "center" }}>
                            <span style={{ color: T.text.muted, fontSize: 14, marginRight: 4 }}>$</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={financialConfig?.mortgagePayment || ""}
                              onChange={e => setFinancialConfig(prev => ({ ...prev, mortgagePayment: sanitizeDollar(e.target.value) }))}
                              placeholder="0"
                              style={{ background: "transparent", border: "none", color: T.text.secondary, fontSize: 14, fontWeight: 600, outline: "none", textAlign: "right", width: 80 }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
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
            <Card
              style={{
                borderLeft: `3px solid ${T.accent.primary}40`,
                display: activeMenu === "ai" ? "block" : "none",
                borderTopLeftRadius: 0,
                borderTopRightRadius: 0,
                borderTop: "none",
              }}
            >
              <Label>AI Provider</Label>

              {/* Backend info card */}
              <div
                style={{
                  padding: "14px 16px",
                  background: `${T.accent.emerald}10`,
                  border: `1px solid ${T.accent.emerald}30`,
                  borderRadius: T.radius.md,
                  marginBottom: 14,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: T.accent.emerald }}>✨ Catalyst AI</span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: T.accent.primary,
                      fontFamily: T.font.mono,
                      background: T.accent.primaryDim,
                      padding: "2px 8px",
                      borderRadius: 99,
                    }}
                  >
                    ACTIVE
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: T.text.secondary, lineHeight: 1.5 }}>
                  Your scrubbed prompt is routed through our secure backend proxy and is not stored as a raw financial
                  payload on our servers.
                </p>
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10, fontFamily: T.font.mono, color: T.text.dim }}>SSE Streaming</span>
                  <span style={{ width: 3, height: 3, borderRadius: "50%", background: T.text.muted }} />
                  <span style={{ fontSize: 10, fontFamily: T.font.mono, color: T.text.dim }}>Zero Config</span>
                  <span style={{ width: 3, height: 3, borderRadius: "50%", background: T.text.muted }} />
                  <span style={{ fontSize: 10, fontFamily: T.font.mono, color: T.text.dim }}>PII Scrubbed</span>
                </div>
              </div>

              {/* Model picker */}
              <span
                style={{
                  fontSize: 11,
                  color: T.text.dim,
                  fontFamily: T.font.mono,
                  fontWeight: 600,
                  display: "block",
                  marginBottom: 8,
                }}
              >
                AI MODEL
              </span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                {currentProvider.models.map(m => {
                  const active = aiModel === m.id;
                  const isPro = m.tier === "pro";
                  const locked = (isPro && !proEnabled) || m.disabled || m.comingSoon;
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        if (locked) {
                          haptic.medium();
                          setShowPaywall(true);
                        } else {
                          haptic.light();
                          setAiModel(m.id);
                          setAiProvider("backend");
                        }
                      }}
                      style={{
                        padding: "10px 14px",
                        borderRadius: T.radius.md,
                        border: `1.5px solid ${active ? T.accent.primary : T.border.default}`,
                        background: active ? T.accent.primaryDim : T.bg.elevated,
                        textAlign: "left",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        transition: "all .2s ease",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: active ? 700 : 600,
                              color: active ? T.accent.primary : T.text.primary,
                            }}
                          >
                            {m.name}
                          </span>
                          {m.comingSoon ? (
                            <span
                              style={{
                                fontSize: 8,
                                fontWeight: 800,
                                color: T.text.muted,
                                background: `${T.text.muted}15`,
                                border: `1px solid ${T.text.muted}30`,
                                padding: "1px 6px",
                                borderRadius: 99,
                                letterSpacing: "0.06em",
                              }}
                            >
                              SOON
                            </span>
                          ) : isPro ? (
                            <span
                              style={{
                                fontSize: 8,
                                fontWeight: 800,
                                color: "#FFD700",
                                background: "linear-gradient(135deg, #FFD70020, #FFA50020)",
                                border: "1px solid #FFD70030",
                                padding: "1px 6px",
                                borderRadius: 99,
                                letterSpacing: "0.06em",
                              }}
                            >
                              PRO
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: 8,
                                fontWeight: 800,
                                color: T.status.green,
                                background: `${T.status.green}15`,
                                border: `1px solid ${T.status.green}30`,
                                padding: "1px 6px",
                                borderRadius: 99,
                                letterSpacing: "0.06em",
                              }}
                            >
                              FREE
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: 10, color: T.text.dim, marginTop: 2, display: "block" }}>
                          {m.comingSoon ? "Coming soon" : m.note}
                        </span>
                        {m.poweredBy && (
                          <span
                            style={{
                              fontSize: 9,
                              color: T.text.muted,
                              marginTop: 1,
                              display: "block",
                              fontFamily: T.font.mono,
                              opacity: 0.7,
                            }}
                          >
                            Powered by {m.poweredBy}
                          </span>
                        )}
                      </div>
                      {active && (
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: T.accent.primary,
                            boxShadow: `0 0 8px ${T.accent.primary}80`,
                          }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* ── Engine & System Info (Moved from System tab) ────────────────── */}
            <Card
              style={{ borderLeft: `3px solid ${T.accent.primary}40`, display: activeMenu === "ai" ? "block" : "none" }}
            >
              <Label>Engine Options</Label>
              {[{ l: "Streaming", d: "See output live as it generates", v: useStreaming, fn: setUseStreaming }].map(
                ({ l, d, v, fn }) => (
                  <div
                    key={l}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "12px 0",
                      borderBottom: `1px solid ${T.border.subtle}`,
                    }}
                  >
                    <div style={{ flex: 1, paddingRight: 12 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{l}</span>
                      <p style={{ fontSize: 10, color: T.text.muted, marginTop: 2 }}>{d}</p>
                    </div>
                    <Toggle value={v} onChange={fn} />
                  </div>
                )
              )}

              <div style={{ paddingTop: 16 }}>
                <Label>System Info</Label>
                {[
                  ["Version", "v1"],
                  ["Provider", currentProvider.name],
                  ["Model", selectedModel.name],
                  ["Tokens", "12,000"],
                  ["Output", "JSON"],
                  ["Stream", useStreaming ? "ON" : "OFF"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "6px 0",
                      borderBottom: `1px solid ${T.border.subtle}`,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
                    <Mono size={11} color={T.text.dim}>
                      {value}
                    </Mono>
                  </div>
                ))}
                <div style={{ paddingTop: 12 }}>
                  <button
                    onClick={() => window.open(PRIVACY_URL, "_blank")}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: T.radius.md,
                      border: `1px solid ${T.border.default}`,
                      background: T.bg.elevated,
                      color: T.text.secondary,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Privacy Policy
                  </button>
                </div>
              </div>
            </Card>

            {/* ── Backup & Sync ────────────────────────────────────── */}
            <Card
              style={{ borderLeft: `3px solid ${T.accent.emerald}30`, display: activeMenu === "backup" ? "block" : "none" }}
            >
              <Label>Backup & Sync</Label>

              {/* Auto-sync explanation */}
              <div style={{ marginBottom: 14 }}>
                {[
                  {
                    n: "1",
                    title: "Auto-Sync",
                    desc: "Data automatically syncs to any iPhone signed into your Apple ID with Catalyst Cash installed via iCloud Preferences.",
                  },
                  {
                    n: "2",
                    title: "Export Backup",
                    desc: "Tap EXPORT to save a .json backup to your device (Files, iCloud Drive, or AirDrop to a new phone).",
                  },
                  {
                    n: "3",
                    title: "New Device",
                    desc: "On your new iPhone, open Settings → tap RESTORE → select your backup file. App reloads with all your data.",
                  },
                ].map(({ n, title, desc }) => (
                  <div key={n} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        background: T.accent.emeraldDim,
                        border: `1px solid ${T.accent.emerald}30`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    >
                      <span style={{ fontSize: 10, fontWeight: 800, color: T.accent.emerald, fontFamily: T.font.mono }}>
                        {n}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 700, display: "block" }}>{title}</span>
                      <span style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.5 }}>{desc}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Status banner */}
              {statusMsg && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: T.radius.sm,
                    marginBottom: 12,
                    background:
                      backupStatus === "error" || restoreStatus === "error" ? T.status.redDim : T.status.greenDim,
                    border: `1px solid ${backupStatus === "error" || restoreStatus === "error" ? T.status.red : T.status.green}20`,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {backupStatus === "error" || restoreStatus === "error" ? (
                    <AlertTriangle size={12} color={T.status.red} />
                  ) : (
                    <CheckCircle size={12} color={T.status.green} />
                  )}
                  <span style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.5 }}>{statusMsg}</span>
                </div>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={handleExport}
                  disabled={backupStatus === "exporting"}
                  style={{
                    flex: 1,
                    minWidth: "48%",
                    padding: "13px 0",
                    borderRadius: T.radius.md,
                    border: `1px solid ${T.accent.emerald}30`,
                    background: T.accent.emeraldDim,
                    color: T.accent.emerald,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    fontFamily: T.font.mono,
                    transition: "all .2s",
                    opacity: backupStatus === "exporting" ? 0.7 : 1,
                  }}
                >
                  {backupStatus === "exporting" ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
                  JSON
                </button>
                <button
                  onClick={handleExportSheet}
                  disabled={backupStatus === "exporting"}
                  style={{
                    flex: 1,
                    minWidth: "48%",
                    padding: "13px 0",
                    borderRadius: T.radius.md,
                    border: `1px solid ${T.accent.primary}30`,
                    background: T.accent.primaryDim,
                    color: T.accent.primary,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    fontFamily: T.font.mono,
                    transition: "all .2s",
                    opacity: backupStatus === "exporting" ? 0.7 : 1,
                  }}
                >
                  {backupStatus === "exporting" ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
                  SPREADSHEET
                </button>
                <div style={{ flex: 1, minWidth: "100%", position: "relative", marginTop: 4 }}>
                  <input
                    type="file"
                    accept=".json,.enc,*/*"
                    onChange={handleImport}
                    disabled={restoreStatus === "restoring"}
                    aria-label="Restore backup file"
                    style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", zIndex: 2 }}
                  />
                  <div
                    style={{
                      width: "100%",
                      padding: "13px 0",
                      borderRadius: T.radius.md,
                      border: `1px solid ${T.border.default}`,
                      background: T.bg.elevated,
                      color: T.text.primary,
                      fontSize: 12,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      fontFamily: T.font.mono,
                      transition: "all .2s",
                      opacity: restoreStatus === "restoring" ? 0.7 : 1,
                    }}
                  >
                    {restoreStatus === "restoring" ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
                    RESTORE (.json / .enc)
                  </div>
                </div>
              </div>

              {/* ── Debug Log Export ────────────────────────────── */}
              <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${T.border.subtle}` }}>
                <Label>Debug Log</Label>
                <p style={{ fontSize: 11, color: T.text.muted, marginBottom: 12, lineHeight: 1.6 }}>
                  Export diagnostic logs to share with support. Logs contain only operational data — no financial
                  information, prompts, or personal data.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={async () => {
                      try {
                        let text = await getLogsAsText();
                        const errors = await getErrorLog();
                        if (errors.length > 0) {
                          text =
                            (text || "") +
                            "\n\n═══ ERROR TELEMETRY ═══\n" +
                            errors.map(e => `[${e.timestamp}] ${e.component}/${e.action}: ${e.message}`).join("\n");
                        }
                        if (!text) {
                          setStatusMsg("No logs to export.");
                          return;
                        }
                        const blob = new Blob([text], { type: "text/plain" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `CatalystCash_DebugLog_${new Date().toISOString().split("T")[0]}.txt`;
                        a.click();
                        URL.revokeObjectURL(url);
                        setStatusMsg("Debug log exported.");
                      } catch (e) {
                        setStatusMsg("Export failed: " + e.message);
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: "10px 14px",
                      borderRadius: T.radius.md,
                      border: `1px solid ${T.border.default}`,
                      background: T.bg.elevated,
                      color: T.text.primary,
                      fontSize: 12,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      fontFamily: T.font.mono,
                      cursor: "pointer",
                      transition: "all .2s",
                    }}
                  >
                    <Download size={14} /> EXPORT LOG
                  </button>
                  <button
                    onClick={() => setConfirmFactoryReset(true)}
                    style={{
                      padding: "10px 14px",
                      borderRadius: T.radius.md,
                      border: `1px solid ${T.status.red}30`,
                      background: `${T.status.red}15`,
                      color: T.status.red,
                      fontSize: 12,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: T.font.mono,
                      cursor: "pointer",
                      transition: "all .2s",
                    }}
                  >
                    DELETE ALL DATA
                  </button>
                  <button
                    onClick={async () => {
                      await clearLogs();
                      await clearErrorLog();
                      setStatusMsg("Debug log cleared.");
                    }}
                    style={{
                      padding: "10px 14px",
                      borderRadius: T.radius.md,
                      border: `1px solid ${T.border.default}`,
                      background: "transparent",
                      color: T.text.dim,
                      fontSize: 12,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: T.font.mono,
                      cursor: "pointer",
                      transition: "all .2s",
                    }}
                  >
                    CLEAR
                  </button>
                </div>
              </div>

              {/* Confirmation dialog for Data Deletion */}
              {confirmFactoryReset && (
                <div
                  style={{
                    marginTop: 16,
                    padding: 16,
                    borderRadius: T.radius.md,
                    background: T.status.redDim,
                    border: `1px solid ${T.status.red}40`,
                    animation: "fadeIn .3s ease-out",
                  }}
                >
                  <p
                    style={{ fontSize: 12, color: T.status.red, fontWeight: 600, margin: "0 0 12px", lineHeight: 1.5 }}
                  >
                    This will permanently delete all financial data, API keys, rules, and history from your device. Are
                    you sure?
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => setConfirmFactoryReset(false)}
                      style={{
                        flex: 1,
                        padding: "10px 0",
                        borderRadius: T.radius.md,
                        border: "none",
                        background: "transparent",
                        color: T.status.red,
                        opacity: 0.8,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        setConfirmFactoryReset(false);
                        haptic.medium();
                        if (onFactoryReset) onFactoryReset();
                      }}
                      style={{
                        flex: 2,
                        padding: "10px 0",
                        borderRadius: T.radius.md,
                        border: "none",
                        background: T.status.red,
                        color: "white",
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      Yes, Delete All Data
                    </button>
                  </div>
                </div>
              )}

              {/* ── Auto-Backup ────────────────────────────────────── */}
              <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${T.border.subtle}` }}>
                <Label>Auto-Backup</Label>
                <p style={{ fontSize: 11, color: T.text.muted, marginBottom: 16, lineHeight: 1.6 }}>
                  Enable Apple Sign-In to activate automatic iCloud backup. Your data is continuously saved to your
                  private iCloud Drive, automatically restoring on any iPhone sharing your Apple ID.
                </p>

                {/* Apple / iCloud */}
                <div style={{ marginBottom: 10 }}>
                  {appleLinkedId ? (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                        padding: "12px 16px",
                        borderRadius: 12,
                        background: "#00000088",
                        border: "1px solid rgba(255,255,255,0.1)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <svg viewBox="0 0 814 1000" width="16" height="16" fill="white">
                            <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-37.3-165.9-40.8l-1.6-.6c-67.8-2.3-113.2-63-156.5-123.1C38.5 660.9 17 570 17 479.4 17 260.9 139.3 151.1 261.7 151.1c71 0 130.5 43.3 175 43.3 42.8 0 110-45.7 192.5-45.7 31 0 108.5 4.5 168.2 55.4zm-234-181.4C505.7 101.8 557 34 557 0c0-6.4-.6-12.9-1.3-18.1-1-.3-2.1-.3-3.5-.3-44.5 0-95.8 30.2-127 71.6-27.5 34.9-49.5 83.2-49.5 131.6 0 6.4 1 12.9 1.6 15.1 2.9.6 7.1 1 11 1 40 0 87.5-27.2 115.9-60.4z" />
                          </svg>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: T.text.primary }}>
                              iCloud Backup Active
                            </div>
                            <div style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono, marginTop: 2 }}>
                              {lastBackupTS
                                ? `Last sync: ${new Date(lastBackupTS).toLocaleString()}`
                                : "Pending first sync..."}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={unlinkApple}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 8,
                            border: `1px solid ${T.border.default}`,
                            background: "transparent",
                            color: T.text.muted,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          UNLINK
                        </button>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          borderTop: "1px solid rgba(255,255,255,0.05)",
                          paddingTop: 12,
                        }}
                      >
                        <span style={{ fontSize: 11, color: T.text.secondary }}>Auto-Backup Schedule</span>
                        <select
                          value={autoBackupInterval}
                          onChange={e => {
                            const v = e.target.value;
                            setAutoBackupInterval(v);
                            db.set("auto-backup-interval", v);
                          }}
                          aria-label="Auto-backup schedule"
                          style={{
                            fontSize: 11,
                            padding: "6px 10px",
                            borderRadius: T.radius.sm,
                            border: `1px solid ${T.border.default}`,
                            background: T.bg.glass,
                            color: T.text.primary,
                            fontFamily: T.font.mono,
                            fontWeight: 600,
                          }}
                        >
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                          <option value="off">Off</option>
                        </select>
                      </div>
                      <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 12, paddingBottom: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                          <p style={{ fontSize: 10, color: T.text.dim, lineHeight: 1.5, flex: 1, paddingRight: 16 }}>
                            Backups are securely saved to your private iCloud Drive.
                            <br />
                            <span style={{ color: T.text.muted, fontWeight: 600 }}>
                              Files App → iCloud Drive → Catalyst Cash → CatalystCash_CloudSync.json
                            </span>
                          </p>
                          <button
                            onClick={forceICloudSync}
                            disabled={isForceSyncing}
                            style={{
                              padding: "8px 12px",
                              borderRadius: 8,
                              background: T.accent.primary,
                              color: "white",
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: isForceSyncing ? "not-allowed" : "pointer",
                              border: "none",
                              opacity: isForceSyncing ? 0.7 : 1,
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {isForceSyncing ? <Loader2 size={12} className="spin" /> : <Cloud size={12} />}
                            {isForceSyncing ? "Syncing..." : "Sync Now"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={handleAppleSignIn}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 10,
                        width: "100%",
                        padding: "14px 20px",
                        borderRadius: 12,
                        border: "none",
                        background: "#000000",
                        color: "#FFFFFF",
                        fontSize: 15,
                        fontWeight: 600,
                        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                        cursor: "pointer",
                        letterSpacing: "-0.01em",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                      }}
                    >
                      <svg viewBox="0 0 814 1000" width="17" height="17" fill="white">
                        <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-37.3-165.9-40.8l-1.6-.6c-67.8-2.3-113.2-63-156.5-123.1C38.5 660.9 17 570 17 479.4 17 260.9 139.3 151.1 261.7 151.1c71 0 130.5 43.3 175 43.3 42.8 0 110-45.7 192.5-45.7 31 0 108.5 4.5 168.2 55.4zm-234-181.4C505.7 101.8 557 34 557 0c0-6.4-.6-12.9-1.3-18.1-1-.3-2.1-.3-3.5-.3-44.5 0-95.8 30.2-127 71.6-27.5 34.9-49.5 83.2-49.5 131.6 0 6.4 1 12.9 1.6 15.1 2.9.6 7.1 1 11 1 40 0 87.5-27.2 115.9-60.4z" />
                      </svg>
                      Sign in with Apple
                    </button>
                  )}
                </div>
              </div>
            </Card>

            {/* ── Danger Zone (Moved to Backup tab) ─────────────────────────────────────── */}
            <Card style={{ borderColor: `${T.status.red}10`, display: activeMenu === "backup" ? "block" : "none" }}>
              <Label>Danger Zone</Label>
              <p style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.6, marginBottom: 14 }}>
                Warning: Actions here are permanent and cannot be undone without a backup file.
              </p>

              {/* Clear Audit History */}
              {!confirmClear ? (
                <button
                  onClick={() => setConfirmClear(true)}
                  style={{
                    width: "100%",
                    padding: 14,
                    borderRadius: T.radius.md,
                    border: `1px solid ${T.accent.amber}40`,
                    background: T.accent.amberDim,
                    color: T.accent.amber,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    marginBottom: 8,
                  }}
                >
                  Clear Audit History
                </button>
              ) : (
                <div style={{ marginBottom: 8 }}>
                  <p style={{ fontSize: 12, color: T.accent.amber, marginBottom: 12, fontWeight: 500 }}>
                    Delete all audit history?
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => {
                        onClear();
                        setConfirmClear(false);
                      }}
                      style={{
                        flex: 1,
                        padding: 12,
                        borderRadius: T.radius.md,
                        border: "none",
                        background: T.status.red,
                        color: "white",
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmClear(false)}
                      style={{
                        flex: 1,
                        padding: 12,
                        borderRadius: T.radius.md,
                        border: `1px solid ${T.border.default}`,
                        background: "transparent",
                        color: T.text.secondary,
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Clear Demo Data */}
              <button
                onClick={() => {
                  if (window.confirm("Are you sure you want to exit demo mode and clear all sample data?")) {
                    if (onClearDemoData) onClearDemoData();
                  }
                }}
                style={{
                  width: "100%",
                  padding: 14,
                  borderRadius: T.radius.md,
                  border: `1px solid ${T.accent.primary}40`,
                  background: T.accent.primaryDim,
                  color: T.accent.primary,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  marginBottom: 8,
                }}
              >
                Clear Demo Data
              </button>

              {/* Factory Reset */}
              {!confirmFactoryReset ? (
                <button
                  onClick={() => setConfirmFactoryReset(true)}
                  style={{
                    width: "100%",
                    padding: 14,
                    borderRadius: T.radius.md,
                    border: `1px solid ${T.status.red}20`,
                    background: T.status.redDim,
                    color: T.status.red,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Factory Reset
                </button>
              ) : (
                <div>
                  <p style={{ fontSize: 12, color: T.status.red, marginBottom: 12, fontWeight: 700 }}>
                    Wipe EVERYTHING and reset to defaults?
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => {
                        onFactoryReset();
                        setConfirmFactoryReset(false);
                      }}
                      style={{
                        flex: 1,
                        padding: 12,
                        borderRadius: T.radius.md,
                        border: "none",
                        background: T.status.red,
                        color: "white",
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Wipe Data
                    </button>
                    <button
                      onClick={() => setConfirmFactoryReset(false)}
                      style={{
                        flex: 1,
                        padding: 12,
                        borderRadius: T.radius.md,
                        border: `1px solid ${T.border.default}`,
                        background: "transparent",
                        color: T.text.secondary,
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </Card>

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
            <Card
              style={{ borderLeft: `3px solid ${T.status.red}40`, display: activeMenu === "security" ? "block" : "none" }}
            >
              <Label>Security Suite</Label>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 0",
                  borderBottom: `1px solid ${T.border.subtle}`,
                }}
              >
                <div style={{ flex: 1, paddingRight: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>App Passcode (4 Digits)</span>
                  <p style={{ fontSize: 10, color: T.text.muted, marginTop: 2 }}>
                    Required failsafe before enabling App Lock
                  </p>
                </div>
                <form onSubmit={e => e.preventDefault()}>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={appPasscode || ""}
                    onChange={handlePasscodeChange}
                    placeholder="••••"
                    aria-label="App passcode"
                    autoComplete="new-password"
                    style={{
                      width: 60,
                      padding: 8,
                      borderRadius: T.radius.md,
                      border: `1px solid ${T.border.default}`,
                      background: T.bg.elevated,
                      color: T.text.primary,
                      fontSize: 16,
                      textAlign: "center",
                      letterSpacing: 4,
                      fontFamily: T.font.mono,
                    }}
                  />
                </form>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 0",
                  borderBottom: requireAuth ? `1px solid ${T.border.subtle}` : "none",
                  opacity: appPasscode?.length === 4 ? 1 : 0.5,
                }}
              >
                <div style={{ flex: 1, paddingRight: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Require Passcode</span>
                  <p style={{ fontSize: 10, color: T.text.muted, marginTop: 2 }}>
                    Lock app natively on launch or background
                  </p>
                </div>
                <Toggle value={requireAuth} onChange={handleRequireAuthToggle} />
              </div>

              {requireAuth && (
                <>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "12px 0",
                      borderBottom: `1px solid ${T.border.subtle}`,
                    }}
                  >
                    <div style={{ flex: 1, paddingRight: 12 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: T.text.primary }}>
                        Enable Face ID / Touch ID
                      </span>
                      <p style={{ fontSize: 10, color: T.text.muted, marginTop: 2 }}>
                        Use biometrics for faster unlocking
                      </p>
                    </div>
                    <Toggle value={useFaceId} onChange={handleUseFaceIdToggle} />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "12px 0",
                    }}
                  >
                    <div style={{ flex: 1, paddingRight: 12 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: T.text.primary }}>Relock After</span>
                      <p style={{ fontSize: 10, color: T.text.muted, marginTop: 2 }}>
                        Time before requiring re-authentication
                      </p>
                    </div>
                    <select
                      value={lockTimeout}
                      onChange={e => {
                        const v = parseInt(e.target.value);
                        setLockTimeout(v);
                        db.set("lock-timeout", v);
                      }}
                      aria-label="Relock timeout"
                      style={{
                        fontSize: 12,
                        padding: "8px 12px",
                        borderRadius: T.radius.md,
                        border: `1px solid ${T.border.default}`,
                        background: T.bg.elevated,
                        color: T.text.primary,
                        fontFamily: T.font.mono,
                        fontWeight: 600,
                      }}
                    >
                      <option value={0}>Immediately</option>
                      <option value={60}>1 minute</option>
                      <option value={300}>5 minutes</option>
                      <option value={900}>15 minutes</option>
                      <option value={1800}>30 minutes</option>
                      <option value={3600}>1 hour</option>
                      <option value={-1}>Never</option>
                    </select>
                  </div>
                </>
              )}

              <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${T.border.subtle}` }}>
                <Label>Legal & Privacy</Label>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                  <button
                    style={{
                      textAlign: "left",
                      padding: "12px 16px",
                      borderRadius: T.radius.md,
                      background: T.bg.elevated,
                      border: `1px solid ${T.border.default}`,
                      color: T.text.primary,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                    onClick={() => window.open("https://catalystcash.app/privacy", "_blank")}
                  >
                    <span>Privacy Policy</span>
                    <ExternalLink size={14} color={T.text.dim} />
                  </button>
                  <button
                    style={{
                      textAlign: "left",
                      padding: "12px 16px",
                      borderRadius: T.radius.md,
                      background: T.bg.elevated,
                      border: `1px solid ${T.border.default}`,
                      color: T.text.primary,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                    onClick={() => window.open("https://catalystcash.app/terms", "_blank")}
                  >
                    <span>Terms of Service</span>
                    <ExternalLink size={14} color={T.text.dim} />
                  </button>
                  <div
                    style={{
                      padding: "12px 16px",
                      borderRadius: T.radius.md,
                      background: `${T.status.amber}08`,
                      border: `1px solid ${T.status.amber}20`,
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.status.amber, marginBottom: 4 }}>
                      ⚠️ AI Disclaimer
                    </div>
                    <p style={{ fontSize: 10, color: T.text.muted, lineHeight: 1.5, margin: 0 }}>
                      Catalyst Cash is not a financial advisor and does not act in a fiduciary capacity. All
                      AI-generated insights are for informational and educational purposes only. Always consult a
                      licensed financial professional before making significant financial decisions.
                    </p>
                  </div>
                  <p style={{ fontSize: 10, color: T.text.muted, lineHeight: 1.5, marginTop: 4 }}>
                    🔒 Your core financial data is stored locally on your device. Chat history is encrypted at rest and
                    auto-expires after 24 hours. AI requests are routed through our secure backend proxy with PII
                    scrubbing.
                  </p>

                  {/* ── CCPA/GDPR Data Deletion ── */}
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border.subtle}` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.text.secondary, marginBottom: 6 }}>
                      Your Data Rights (CCPA / GDPR)
                    </div>
                    <p style={{ fontSize: 10, color: T.text.muted, lineHeight: 1.5, margin: "0 0 10px" }}>
                      Under the California Consumer Privacy Act (CCPA) and General Data Protection Regulation (GDPR),
                      you have the right to request deletion of all personal data.
                    </p>
                    {!confirmDataDeletion ? (
                      <button
                        onClick={() => {
                          setConfirmDataDeletion(true);
                          haptic.medium();
                        }}
                        style={{
                          width: "100%",
                          padding: "12px 16px",
                          borderRadius: T.radius.md,
                          border: `1px solid ${T.status.red}30`,
                          background: T.status.redDim,
                          color: T.status.red,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          transition: "all .2s",
                        }}
                      >
                        <Shield size={14} />
                        Request Data Deletion
                      </button>
                    ) : (
                      <div
                        style={{
                          padding: 14,
                          borderRadius: T.radius.md,
                          background: T.status.redDim,
                          border: `1px solid ${T.status.red}40`,
                          animation: "fadeIn .3s ease-out",
                        }}
                      >
                        <p
                          style={{
                            fontSize: 11,
                            color: T.status.red,
                            fontWeight: 600,
                            margin: "0 0 8px",
                            lineHeight: 1.5,
                          }}
                        >
                          This will permanently erase all data from your device:
                        </p>
                        <ul
                          style={{
                            fontSize: 10,
                            color: T.text.secondary,
                            lineHeight: 1.6,
                            margin: "0 0 12px",
                            paddingLeft: 16,
                          }}
                        >
                          <li>All financial data, audit history, and settings</li>
                          <li>Encrypted chat history and session memory</li>
                          <li>All connected bank accounts (Plaid access revoked)</li>
                          <li>API keys and secure keychain items</li>
                        </ul>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => setConfirmDataDeletion(false)}
                            style={{
                              flex: 1,
                              padding: "10px 0",
                              borderRadius: T.radius.md,
                              border: "none",
                              background: "transparent",
                              color: T.status.red,
                              opacity: 0.8,
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            disabled={deletionInProgress}
                            onClick={async () => {
                              setDeletionInProgress(true);
                              haptic.heavy();
                              try {
                                // 1. Disconnect all Plaid connections
                                const conns = await getConnections().catch(() => []);
                                for (const conn of conns) {
                                  await removeConnection(conn.id).catch(() => { });
                                }
                                // 2. Clear all device storage
                                await db.clear();
                                // 3. Clear web storage
                                try {
                                  localStorage.clear();
                                } catch { }
                                try {
                                  sessionStorage.clear();
                                } catch { }
                                // 4. Clear secure keychain items
                                try {
                                  await deleteSecureItem("app-passcode");
                                } catch { }
                                try {
                                  await deleteSecureItem("plaid-connections");
                                } catch { }
                                // 5. Reload
                                window.location.reload();
                              } catch (e) {
                                setDeletionInProgress(false);
                                setConfirmDataDeletion(false);
                              }
                            }}
                            style={{
                              flex: 2,
                              padding: "10px 0",
                              borderRadius: T.radius.md,
                              border: "none",
                              background: T.status.red,
                              color: "white",
                              fontSize: 11,
                              fontWeight: 800,
                              cursor: deletionInProgress ? "wait" : "pointer",
                              opacity: deletionInProgress ? 0.7 : 1,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                            }}
                          >
                            {deletionInProgress ? <Loader2 size={12} className="spin" /> : <Shield size={12} />}
                            {deletionInProgress ? "Deleting..." : "Confirm Deletion"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>

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
