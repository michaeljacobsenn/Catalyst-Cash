import { useState, useEffect, useRef, useCallback } from "react";
import { Eye, EyeOff, ArrowLeft, Cloud, Download, Upload, CheckCircle, AlertTriangle, ChevronDown, Loader2, ExternalLink, Pencil, Check, ChevronRight, Shield, Cpu, Target, Briefcase, Landmark, Database, Lock, Settings, Info, Building2, Plus, Unplug, Sun, Moon, Monitor } from "lucide-react";
import { T, APP_VERSION } from "../constants.js";
import { AI_PROVIDERS, getProvider } from "../providers.js";
import { getLogsAsText, clearLogs } from "../logger.js";
import { Card, Label, InlineTooltip } from "../ui.jsx";
import { Mono } from "../components.jsx";
import { db, FaceId, nativeExport, fmt } from "../utils.js";

import { encrypt, decrypt, isEncrypted } from "../crypto.js";
import { haptic } from "../haptics.js";
import { SignInWithApple } from "@capacitor-community/apple-sign-in";
import { Capacitor } from "@capacitor/core";
import { uploadToICloud } from "../cloudSync.js";
import { isSecuritySensitiveKey } from "../securityKeys.js";
// xlsx is loaded dynamically in importBackup() to reduce initial bundle size
import { generateBackupSpreadsheet } from "../spreadsheet.js";
import { getConnections, removeConnection, connectBank, autoMatchAccounts, fetchBalances, applyBalanceSync, saveConnectionLinks } from "../plaid.js";
import { shouldShowGating, checkAuditQuota, getRawTier } from "../subscription.js";
import ProPaywall, { ProBanner } from "./ProPaywall.jsx";
import { presentCustomerCenter } from "../revenuecat.js";

const ENABLE_PLAID = true; // Toggle to false to hide, true to show Plaid integration

function mergeUniqueById(existing = [], incoming = []) {
    if (!incoming.length) return existing;
    const map = new Map(existing.map(item => [item.id, item]));
    for (const item of incoming) {
        if (!map.has(item.id)) map.set(item.id, item);
    }
    return Array.from(map.values());
}

// Legacy key migration: if old "api-key" exists, treat as openai key
async function migrateApiKey() {
    const legacy = await db.get("api-key");
    if (legacy) {
        const existing = await db.get("api-key-openai");
        if (!existing) await db.set("api-key-openai", legacy);
    }
}

async function exportBackup(passphrase) {
    await migrateApiKey();
    const backup = { app: "Catalyst Cash", version: APP_VERSION, exportedAt: new Date().toISOString(), data: {} };

    const keys = await db.keys();
    for (const key of keys) {
        if (isSecuritySensitiveKey(key)) continue;
        const val = await db.get(key);
        if (val !== null) backup.data[key] = val;
    }
    if (!("personal-rules" in backup.data)) {
        const pr = await db.get("personal-rules");
        backup.data["personal-rules"] = pr ?? "";
    }

    if (!passphrase) throw new Error("Backup cancelled — passphrase required");
    const envelope = await encrypt(JSON.stringify(backup), passphrase);
    const dateStr = new Date().toISOString().split("T")[0];
    await nativeExport(`CatalystCash_Backup_${dateStr}.enc`, JSON.stringify(envelope), "application/octet-stream");
    return Object.keys(backup.data).length;
}

async function importBackup(file, getPassphrase) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                let parsed;
                try { parsed = JSON.parse(e.target.result); } catch { reject(new Error("Invalid backup file")); return; }

                let backup;
                if (isEncrypted(parsed)) {
                    const passphrase = getPassphrase ? await getPassphrase() : null;
                    if (!passphrase) { reject(new Error("Import cancelled — passphrase required")); return; }
                    try {
                        const plaintext = await decrypt(parsed, passphrase);
                        backup = JSON.parse(plaintext);
                    } catch (decErr) {
                        reject(new Error(decErr.message || "Decryption failed — wrong passphrase?")); return;
                    }
                } else {
                    backup = parsed;
                }

                if (backup && backup.type === "spreadsheet-backup") {
                    const XLSX = await import("xlsx");
                    const binary_string = window.atob(backup.base64);
                    const len = binary_string.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        bytes[i] = binary_string.charCodeAt(i);
                    }
                    const wb = XLSX.read(bytes.buffer, { type: "array" });
                    const config = {};

                    // Helper to get sheet data
                    const getSheetRows = (sheetName) => {
                        const name = wb.SheetNames.find(n => n.includes(sheetName));
                        if (!name) return null;
                        return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" });
                    };

                    // 1. Parse Setup Data (Key/Value list)
                    const setupRows = getSheetRows("Setup Data") || getSheetRows(wb.SheetNames[0]);
                    if (setupRows) {
                        for (const row of setupRows) {
                            const key = String(row[0] || "").trim();
                            const rawVal = String(row[2] ?? "").trim();
                            if (!key || !rawVal || key === "field_key" || key.includes("DO NOT EDIT")) continue;
                            const num = parseFloat(rawVal);
                            config[key] = isNaN(num) ? (rawVal === "true" ? true : rawVal === "false" ? false : rawVal) : num;
                        }
                    }

                    // Helper to parse array sheets
                    const parseArraySheet = (sheetName, mapFn) => {
                        const rows = getSheetRows(sheetName);
                        if (!rows || rows.length <= 1) return undefined;
                        const items = [];
                        // Skip header row (index 0)
                        for (let i = 1; i < rows.length; i++) {
                            const row = rows[i];
                            if (!row.some(cell => String(cell).trim() !== "")) continue;
                            const item = mapFn(row);
                            if (item) items.push(item);
                        }
                        return items.length > 0 ? items : undefined;
                    };

                    // 2. Parse Arrays
                    config.incomeSources = parseArraySheet("Income Sources", (r) => ({
                        id: String(r[0] || Date.now() + Math.random()).trim(),
                        name: String(r[1] || "Unnamed Source").trim(),
                        amount: parseFloat(r[2]) || 0,
                        frequency: String(r[3] || "monthly").trim(),
                        type: String(r[4] || "active").trim(),
                        nextDate: String(r[5] || "").trim()
                    })) || config.incomeSources;

                    config.budgetCategories = parseArraySheet("Budget Categories", (r) => ({
                        id: String(r[0] || Date.now() + Math.random()).trim(),
                        name: String(r[1] || "Unnamed Category").trim(),
                        allocated: parseFloat(r[2]) || 0,
                        group: String(r[3] || "Expenses").trim()
                    })) || config.budgetCategories;

                    config.savingsGoals = parseArraySheet("Savings Goals", (r) => ({
                        id: String(r[0] || Date.now() + Math.random()).trim(),
                        name: String(r[1] || "Unnamed Goal").trim(),
                        target: parseFloat(r[2]) || 0,
                        saved: parseFloat(r[3]) || 0
                    })) || config.savingsGoals;

                    config.nonCardDebts = parseArraySheet("Non-Card Debts", (r) => ({
                        id: String(r[0] || Date.now() + Math.random()).trim(),
                        name: String(r[1] || "Unnamed Debt").trim(),
                        balance: parseFloat(r[2]) || 0,
                        minPayment: parseFloat(r[3]) || 0,
                        apr: parseFloat(r[4]) || 0
                    })) || config.nonCardDebts;

                    config.otherAssets = parseArraySheet("Other Assets", (r) => ({
                        id: String(r[0] || Date.now() + Math.random()).trim(),
                        name: String(r[1] || "Unnamed Asset").trim(),
                        value: parseFloat(r[2]) || 0
                    })) || config.otherAssets;

                    const existing = (await db.get("financial-config")) || {};
                    await db.set("financial-config", { ...existing, ...config, _fromSetupWizard: true });
                    resolve({ count: Object.keys(config).length, exportedAt: new Date().toISOString() });
                    return;
                }

                if (!backup.data || (backup.app !== "Catalyst Cash" && backup.app !== "FinAudit Pro")) {
                    reject(new Error("Invalid Catalyst Cash backup file")); return;
                }
                let count = 0;
                for (const [key, val] of Object.entries(backup.data)) {
                    if (isSecuritySensitiveKey(key)) continue;
                    await db.set(key, val); count++;
                }
                resolve({ count, exportedAt: backup.exportedAt });
            } catch (err) { reject(err); }
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsText(file);
    });
}

import { useAudit } from '../contexts/AuditContext.jsx';
import { useSettings } from '../contexts/SettingsContext.jsx';
import { useSecurity } from '../contexts/SecurityContext.jsx';
import { usePortfolio } from '../contexts/PortfolioContext.jsx';

export default function SettingsTab({ onClear, onFactoryReset, onBack, onRestoreComplete, onShowGuide, proEnabled = false }) {
    const { useStreaming, setUseStreaming } = useAudit();
    const { apiKey, setApiKey, aiProvider, setAiProvider, aiModel, setAiModel, financialConfig, setFinancialConfig, personalRules, setPersonalRules, autoBackupInterval, setAutoBackupInterval, notifPermission, persona, setPersona, themeMode, setThemeMode, themeTick } = useSettings();
    const { requireAuth, setRequireAuth, appPasscode, setAppPasscode, useFaceId, setUseFaceId, lockTimeout, setLockTimeout, appleLinkedId, setAppleLinkedId } = useSecurity();
    const { cards, setCards, bankAccounts, setBankAccounts, cardCatalog, renewals } = usePortfolio();

    // Auth Plugins state management
    const [lastBackupTS, setLastBackupTS] = useState(null);
    const [plaidConnections, setPlaidConnections] = useState([]);
    const [isPlaidConnecting, setIsPlaidConnecting] = useState(false);

    useEffect(() => {
        // Initialization now handled at root level in App.jsx
        db.get("last-backup-ts").then(ts => setLastBackupTS(ts)).catch(() => { });
        if (ENABLE_PLAID) {
            getConnections().then(conns => setPlaidConnections(conns || [])).catch(() => { });
        }
    }, []);

    const handleAppleSignIn = async () => {
        if (Capacitor.getPlatform() === 'web') return;
        try {
            const result = await SignInWithApple.authorize({
                clientId: 'com.jacobsen.portfoliopro',
                redirectURI: 'https://api.catalystcash.app/auth/apple/callback',
                scopes: 'email name'
            });
            // console.log("Apple Sign-In Success:", result);
            const userIdentifier = result.response.user;
            setAppleLinkedId(userIdentifier);
            db.set("apple-linked-id", userIdentifier);
            if (window.toast) window.toast.success("Apple ID linked for App Unlocking.");
        } catch (error) {
            console.error(error);
            if (window.toast) window.toast.error("Apple Sign-In failed or was cancelled.");
        }
    };

    const unlinkApple = () => {
        db.del("apple-linked-id");
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
    const [backupStatus, setBackupStatus] = useState(null);
    const [restoreStatus, setRestoreStatus] = useState(null);
    const [activeSegment, setActiveSegment] = useState("app"); // Kept for logic
    const [appTab, setAppTab] = useState("ai"); // Kept for logic
    const [financeTab, setFinanceTab] = useState("income"); // Kept for logic
    const [activeMenu, setActiveMenu] = useState(null); // null means root menu, otherwise string ID of the menu
    const [showModelPicker, setShowModelPicker] = useState(false);
    const [ppModal, setPpModal] = useState({ open: false, mode: "export", label: "", resolve: null, value: "" });
    const [setupDismissed, setSetupDismissed] = useState(() => !!localStorage.getItem('setup-progress-dismissed'));
    const [showApiSetup, setShowApiSetup] = useState(Boolean((apiKey || "").trim()));
    const [editingSection, setEditingSection] = useState(null);
    const [showPaywall, setShowPaywall] = useState(false);

    const scrollRef = useRef(null);
    const swipeTouchStart = useRef(null);
    const navDir = useRef('forward'); // tracks animation direction: 'forward' | 'back'

    const [isForceSyncing, setIsForceSyncing] = useState(false);

    const forceICloudSync = async () => {
        if (Capacitor.getPlatform() !== 'ios') {
            if (window.toast) window.toast.error("iCloud sync is only available on iOS.");
            return;
        }
        setIsForceSyncing(true);
        try {
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

    const handleSwipeTouchStart = useCallback((e) => {
        const touch = e.touches[0];
        swipeTouchStart.current = { x: touch.clientX, y: touch.clientY };
    }, []);

    const handleSwipeTouchEnd = useCallback((e) => {
        if (!swipeTouchStart.current) return;
        const touch = e.changedTouches[0];
        const dx = touch.clientX - swipeTouchStart.current.x;
        const dy = Math.abs(touch.clientY - swipeTouchStart.current.y);
        // Swipe right at least 60px, starting from left 80px, not too vertical
        if (dx > 60 && swipeTouchStart.current.x < 80 && dy < 100) {
            if (activeMenu) {
                navDir.current = 'back';
                setActiveMenu(null);
                haptic.light();
            } else if (onBack) {
                onBack();
                haptic.light();
            }
        }
        swipeTouchStart.current = null;
    }, [activeMenu, onBack]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = 0;
        }
    }, [activeMenu, activeSegment, appTab, financeTab]);



    const showPassphraseModal = (mode) => new Promise(resolve => {
        const label = mode === "export"
            ? "Create a passphrase to encrypt this backup. You will need it to restore."
            : "Enter the passphrase for this encrypted backup.";
        setPpModal({ open: true, mode, label, resolve, value: "" });
    });
    const ppConfirm = () => { const r = ppModal.resolve; setPpModal(m => ({ ...m, open: false, resolve: null })); r(ppModal.value || ""); };
    const ppCancel = () => { const r = ppModal.resolve; setPpModal(m => ({ ...m, open: false, resolve: null })); r(""); };

    const handlePasscodeChange = (e) => {
        const val = e.target.value.replace(/[^0-9]/g, "").slice(0, 4);
        setAppPasscode(val);
        db.set("app-passcode", val);
        if (val.length < 4 && requireAuth) {
            setRequireAuth(false);
            db.set("require-auth", false);
            setUseFaceId(false);
            db.set("use-face-id", false);
            setLockTimeout(0);
            db.set("lock-timeout", 0);
        }
    };

    const handleRequireAuthToggle = (enable) => {
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

    const handleUseFaceIdToggle = async (enable) => {
        if (!enable) {
            setUseFaceId(false);
            db.set("use-face-id", false);
            return;
        }

        if (Capacitor.getPlatform() === 'web') {
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
            setTimeout(() => { window.__biometricActive = false; }, 1000);
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
        <button onClick={() => onChange(!value)} style={{
            width: 48, height: 28, borderRadius: 14, border: "none",
            background: value ? T.accent.primary : T.text.muted, cursor: "pointer", position: "relative", flexShrink: 0,
            transition: "background .25s ease", boxShadow: value ? `0 0 10px ${T.accent.primaryDim}` : "none"
        }}>
            <div style={{
                width: 22, height: 22, borderRadius: 11, background: "white", position: "absolute", top: 3,
                left: value ? 23 : 3, transition: "left .25s cubic-bezier(.16,1,.3,1)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.3)"
            }} /></button>);

    const handleExport = async () => {
        setRestoreStatus(null); setStatusMsg("");
        try {
            const passphrase = await showPassphraseModal("export");
            if (!passphrase) { setBackupStatus(null); return; }
            setBackupStatus("exporting");
            const count = await exportBackup(passphrase);
            setBackupStatus("done");
            setStatusMsg(`Backed up ${count} data keys to your device`);
        } catch (e) { setBackupStatus("error"); setStatusMsg(e.message || "Export failed"); }
    };

    const handleExportSheet = async () => {
        setRestoreStatus(null); setStatusMsg("");
        try {
            const passphrase = await showPassphraseModal("export");
            if (!passphrase) { setBackupStatus(null); return; }
            setBackupStatus("exporting");
            await generateBackupSpreadsheet(passphrase);
            setBackupStatus("done");
            setStatusMsg("Exported encrypted spreadsheet backup.");
        } catch (e) { setBackupStatus("error"); setStatusMsg(e.message || "Export failed"); }
    };

    const handleImport = async (e) => {
        const file = e.target.files?.[0]; if (!file) return;
        e.target.value = ""; setBackupStatus(null); setStatusMsg("");
        try {
            const { count, exportedAt } = await importBackup(file, () => showPassphraseModal("import"));
            setRestoreStatus("done");
            const dateStr = exportedAt ? new Date(exportedAt).toLocaleDateString() : "unknown date";
            setStatusMsg(`Restored ${count} items from backup dated ${dateStr}.`);
            if (onRestoreComplete) setTimeout(onRestoreComplete, 1500);
        } catch (e) {
            const cancelled = e.message?.includes("cancelled");
            if (cancelled) { setRestoreStatus(null); return; }
            setRestoreStatus("error"); setStatusMsg(e.message || "Import failed");
        }
    };

    const handleProviderSelect = (prov) => {
        setAiProvider(prov.id);
        setAiModel(prov.defaultModel);
        // Load that provider's stored key
        if (prov.keyStorageKey) {
            db.get(prov.keyStorageKey).then(k => {
                const nextKey = typeof k === "string" ? k.trim() : "";
                setApiKey(nextKey);
                setShowApiSetup(Boolean(nextKey));
            });
        } else {
            setApiKey("");
            setShowApiSetup(false);
        }
    };

    const handleKeyChange = (val) => {
        const normalized = (val || "").trim();
        setApiKey(normalized);
        // Save to provider-specific slot immediately
        if (currentProvider.keyStorageKey) db.set(currentProvider.keyStorageKey, normalized);
        // Also mirror to legacy "api-key" for OpenAI backward compatibility
        if (currentProvider.id === "openai") db.set("api-key", normalized);
    };

    return <div className="slide-pane" style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
        background: T.bg.base, zIndex: 20, display: "flex", flexDirection: "column",
        width: "100%", height: "100%", boxSizing: "border-box"
    }}>
        {/* ── Passphrase Modal ── */}
        {ppModal.open && (
            <div style={{
                position: "fixed", inset: 0, zIndex: 9999,
                background: "rgba(0,0,0,0.75)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
                display: "flex", alignItems: "center", justifyContent: "center", padding: 24
            }}>
                <div style={{
                    width: "100%", maxWidth: 340, background: T.bg.card, borderRadius: T.radius.xl,
                    border: `1px solid ${T.border.subtle}`, padding: 24,
                    boxShadow: "0 24px 48px rgba(0,0,0,0.6)"
                }}>
                    <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, color: T.text.primary }}>
                        {ppModal.mode === "export" ? "Encrypt Backup" : "Decrypt Backup"}
                    </div>
                    <p style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.6, marginBottom: 16 }}>
                        {ppModal.label}
                    </p>
                    <input
                        type="password"
                        autoFocus
                        placeholder="Passphrase"
                        value={ppModal.value}
                        onChange={e => setPpModal(m => ({ ...m, value: e.target.value }))}
                        onKeyDown={e => { if (e.key === "Enter") ppConfirm(); if (e.key === "Escape") ppCancel(); }}
                        style={{
                            width: "100%", padding: "12px 14px", borderRadius: T.radius.md, boxSizing: "border-box",
                            border: `1px solid ${T.border.default}`, background: T.bg.elevated,
                            color: T.text.primary, fontSize: 14, marginBottom: 16, letterSpacing: "0.08em"
                        }}
                    />
                    <div style={{ display: "flex", gap: 10 }}>
                        <button onClick={ppCancel} style={{
                            flex: 1, padding: "12px 0", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`,
                            background: "transparent", color: T.text.secondary, fontSize: 13, fontWeight: 700, cursor: "pointer"
                        }}>Cancel</button>
                        <button onClick={ppConfirm} disabled={!ppModal.value} style={{
                            flex: 1, padding: "12px 0", borderRadius: T.radius.md, border: "none",
                            background: ppModal.value ? `linear-gradient(135deg, ${T.accent.primary}, #6C60FF)` : T.text.muted,
                            color: "white", fontSize: 13, fontWeight: 800, cursor: ppModal.value ? "pointer" : "not-allowed"
                        }}>
                            {ppModal.mode === "export" ? "Encrypt & Save" : "Decrypt & Restore"}
                        </button>
                    </div>
                </div>
            </div>
        )}
        <div style={{
            position: "sticky", top: 0, zIndex: 10,
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 6px)",
            paddingLeft: 16, paddingRight: 16, paddingBottom: 8,
            background: `rgba(4, 6, 10, 0.85)`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
            borderBottom: `1px solid ${T.border.subtle}`,
            flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "space-between"
        }}>
            <div style={{ width: 36 }}>
                {(onBack || activeMenu) && <button onClick={() => {
                    if (activeMenu) {
                        navDir.current = 'back';
                        setActiveMenu(null);
                        haptic.light();
                    } else if (onBack) {
                        onBack();
                    }
                }} style={{
                    width: 36, height: 36, borderRadius: 10, border: `1px solid ${T.border.default}`,
                    background: T.bg.elevated, color: T.text.secondary, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center"
                }}><ArrowLeft size={16} /></button>}
            </div>
            <div style={{ textAlign: "center", flex: 1, minWidth: 0, overflow: "hidden" }}>
                <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {activeMenu === "ai" ? "AI & Engine" :
                        activeMenu === "backup" ? "Backup & Data" :
                            activeMenu === "security" ? "Security" :
                                activeMenu === "income" ? "Income & Cash Flow" :
                                    activeMenu === "debts" ? "Debts & Liabilities" :
                                        activeMenu === "targets" ? "Savings Targets" :
                                            activeMenu === "rules" ? "Custom Rules" :
                                                "Settings"}
                </h1>
                {!activeMenu && <p style={{ fontSize: 10, color: T.text.dim, marginTop: 2, fontFamily: T.font.mono, margin: 0 }}>VERSION {APP_VERSION}</p>}
            </div>
            <div style={{ width: 36 }}></div> {/* Spacer to preserve center alignment */}
        </div>
        {/* Scrollable body */}
        <div className="safe-bottom page-body" ref={scrollRef}
            onTouchStart={handleSwipeTouchStart}
            onTouchEnd={handleSwipeTouchEnd}
            style={{
                flex: 1,
                WebkitOverflowScrolling: "touch",
                paddingTop: 4, paddingBottom: 24, // Clear the safe-bottom area completely
                overflowY: "auto",
                overscrollBehavior: "contain",
                display: "flex",
                flexDirection: "column"
            }}>
            <div key={activeMenu || "root"} style={{
                animation: activeMenu
                    ? (navDir.current === 'forward' ? "settingsSlideIn .32s cubic-bezier(.16,1,.3,1) both" : "settingsSlideOut .32s cubic-bezier(.16,1,.3,1) both")
                    : (navDir.current === 'back' ? "settingsSlideOut .32s cubic-bezier(.16,1,.3,1) both" : "settingsSlideIn .32s cubic-bezier(.16,1,.3,1) both"),
                display: "flex", flexDirection: "column", flex: 1,
                // Offset the .page-body top padding for sub-menus so they sit flush with the header's aesthetic bottom border
                marginTop: activeMenu ? -4 : 0
            }}>

                {!activeMenu && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: 40, marginTop: 12 }}>
                        {/* ── Appearance Toggle ── */}
                        <div>
                            <span style={{ fontSize: 13, fontWeight: 800, color: T.text.secondary, marginLeft: 16, marginBottom: 8, display: "block", letterSpacing: "0.03em", textTransform: "uppercase" }}>Appearance</span>
                            <div style={{
                                background: T.bg.card, borderRadius: T.radius.xl,
                                border: `1px solid ${T.border.subtle}`, padding: "14px 16px",
                                display: "flex", alignItems: "center", justifyContent: "space-between"
                            }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                                    <div style={{
                                        width: 28, height: 28, borderRadius: 8,
                                        background: `${T.accent.primary}20`,
                                        display: "flex", alignItems: "center", justifyContent: "center"
                                    }}>
                                        {themeMode === "light" ? <Sun size={16} color={T.status.amber} /> :
                                            themeMode === "dark" ? <Moon size={16} color={T.accent.primary} /> :
                                                <Monitor size={16} color={T.text.secondary} />}
                                    </div>
                                    <span style={{ fontSize: 16, fontWeight: 600, color: T.text.primary }}>Theme</span>
                                </div>
                                {/* iOS-style 3-option pill */}
                                <div style={{
                                    display: "flex", position: "relative",
                                    background: T.bg.elevated, borderRadius: 10,
                                    border: `1px solid ${T.border.subtle}`, padding: 3,
                                    gap: 2
                                }}>
                                    {/* Sliding indicator */}
                                    <div style={{
                                        position: "absolute", top: 3, left: 3,
                                        width: "calc((100% - 10px) / 3)",
                                        height: "calc(100% - 6px)", borderRadius: 8,
                                        background: T.accent.gradient,
                                        boxShadow: `0 2px 8px ${T.accent.primaryGlow}`,
                                        transform: `translateX(${themeMode === "system" ? "0%" : themeMode === "light" ? "calc(100% + 2px)" : "calc(200% + 4px)"})`,
                                        transition: "transform .3s cubic-bezier(.16,1,.3,1)"
                                    }} />
                                    {[
                                        { id: "system", icon: Monitor, label: "Auto" },
                                        { id: "light", icon: Sun, label: "Light" },
                                        { id: "dark", icon: Moon, label: "Dark" }
                                    ].map(opt => (
                                        <button key={opt.id} onClick={() => { setThemeMode(opt.id); haptic.light(); }}
                                            style={{
                                                position: "relative", zIndex: 1,
                                                display: "flex", alignItems: "center", gap: 4,
                                                padding: "6px 10px", borderRadius: 8,
                                                border: "none", background: "transparent",
                                                cursor: "pointer", transition: "color .25s",
                                                color: themeMode === opt.id ? "#fff" : T.text.dim,
                                                fontSize: 11, fontWeight: 700,
                                                fontFamily: T.font.sans, whiteSpace: "nowrap"
                                            }}>
                                            <opt.icon size={12} strokeWidth={2.5} />
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* App Preferences */}
                        <div>
                            <span style={{ fontSize: 13, fontWeight: 800, color: T.text.secondary, marginLeft: 16, marginBottom: 8, display: "block", letterSpacing: "0.03em", textTransform: "uppercase" }}>App Preferences</span>
                            <div style={{ background: T.bg.card, borderRadius: T.radius.xl, border: `1px solid ${T.border.subtle}`, overflow: "hidden" }}>
                                {[
                                    { id: "ai", label: "AI & Engine", icon: Cpu, color: T.status.blue },
                                    { id: "backup", label: "Backup & Data", icon: Database, color: T.status.green },
                                    { id: "security", label: "Security", icon: Lock, color: T.status.red },
                                    ...(ENABLE_PLAID ? [{ id: "plaid", label: "Bank Connections", icon: Building2, color: T.status.purple || "#8a2be2" }] : []),
                                    { id: "guide", label: "Help & Guide", icon: Info, color: T.accent.primary }
                                ].map((item, i, arr) => (
                                    <button key={item.id} onClick={() => {
                                        if (item.id === "guide") {
                                            if (onShowGuide) onShowGuide();
                                            return;
                                        }
                                        setActiveSegment("app"); setAppTab(item.id); navDir.current = 'forward'; setActiveMenu(item.id); haptic.light();
                                    }}
                                        style={{
                                            margin: 0, width: "100%", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
                                            background: "transparent", border: "none", borderBottom: i < arr.length - 1 ? `1px solid ${T.border.subtle}` : "none",
                                            cursor: "pointer", textAlign: "left"
                                        }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                                            <div style={{ width: 28, height: 28, borderRadius: 8, background: `${item.color}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                <item.icon size={16} color={item.color} />
                                            </div>
                                            <span style={{ fontSize: 16, fontWeight: 600, color: T.text.primary }}>{item.label}</span>
                                        </div>
                                        <ChevronRight size={18} color={T.text.muted} />
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Subscription (visible when gating is on) */}
                        {shouldShowGating() && <div>
                            <span style={{ fontSize: 13, fontWeight: 800, color: T.text.secondary, marginLeft: 16, marginBottom: 8, display: "block", letterSpacing: "0.03em", textTransform: "uppercase" }}>Subscription</span>
                            {proEnabled ? (
                                <button onClick={() => presentCustomerCenter()} style={{
                                    width: "100%", padding: "14px 16px", borderRadius: T.radius.xl,
                                    border: `1px solid ${T.accent.primary}40`, background: `${T.accent.primary}10`,
                                    color: T.accent.primary, fontSize: 14, fontWeight: 700, cursor: "pointer",
                                    display: "flex", justifyContent: "space-between", alignItems: "center",
                                    boxShadow: `0 4px 12px ${T.accent.primary}10`
                                }}>
                                    <span>Manage Pro Subscription</span>
                                    <ChevronRight size={18} color={T.accent.primary} />
                                </button>
                            ) : (
                                <ProBanner onUpgrade={() => setShowPaywall(true)} label="Upgrade to Pro" sublabel="150 audits/mo, all models, 15m market data" />
                            )}
                        </div>}


                        {/* Financial Profile */}
                        <div>
                            <span style={{ fontSize: 13, fontWeight: 800, color: T.text.secondary, marginLeft: 16, marginBottom: 8, display: "block", letterSpacing: "0.03em", textTransform: "uppercase" }}>Financial Profile</span>
                            <div style={{ background: T.bg.card, borderRadius: T.radius.xl, border: `1px solid ${T.border.subtle}`, overflow: "hidden" }}>
                                {[
                                    { id: "income", label: "Income & Cash Flow", icon: Briefcase, color: T.accent.emerald },
                                    { id: "debts", label: "Debts & Liabilities", icon: Landmark, color: T.status.red },
                                    { id: "targets", label: "Savings Targets", icon: Target, color: T.status.blue },
                                    { id: "rules", label: "Custom Rules", icon: Settings, color: T.status.amber }
                                ].map((item, i, arr) => (
                                    <button key={item.id} onClick={() => { setActiveSegment("finance"); setFinanceTab(item.id); navDir.current = 'forward'; setActiveMenu(item.id); haptic.light(); }}
                                        style={{
                                            margin: 0, width: "100%", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
                                            background: "transparent", border: "none", borderBottom: i < arr.length - 1 ? `1px solid ${T.border.subtle}` : "none",
                                            cursor: "pointer", textAlign: "left"
                                        }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                                            <div style={{ width: 28, height: 28, borderRadius: 8, background: `${item.color}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                <item.icon size={16} color={item.color} />
                                            </div>
                                            <span style={{ fontSize: 16, fontWeight: 600, color: T.text.primary }}>{item.label}</span>
                                        </div>
                                        <ChevronRight size={18} color={T.text.muted} />
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Setup Progress — deferred onboarding items (auto-hide after 30 days or all done) */}
                        {(() => {
                            // Auto-hide: seed install date + check 30-day expiry
                            const installTs = parseInt(localStorage.getItem('app-install-ts') || '0', 10);
                            if (!installTs) localStorage.setItem('app-install-ts', String(Date.now()));
                            const daysSinceInstall = installTs ? (Date.now() - installTs) / 86400000 : 0;
                            const fc = financialConfig || {};
                            const steps = [
                                { label: "Connect your income", done: !!(fc.paycheckStandard || fc.hourlyRateNet || fc.averagePaycheck), nav: "income" },
                                { label: "Set weekly spending limit", done: !!fc.weeklySpendAllowance, nav: "income" },
                                { label: "Set a minimum cash floor", done: !!fc.emergencyFloor, nav: "income" },
                                { label: "Track your credit cards", done: (cards || []).length > 0, nav: null },
                                { label: "Add recurring bills", done: (renewals || []).length > 0, nav: null },
                            ];
                            const done = steps.filter(s => s.done).length;
                            const total = steps.length;
                            const pct = Math.round((done / total) * 100);
                            // Auto-hide: all criteria met OR 30 days since install OR manually dismissed
                            if (pct === 100 || daysSinceInstall >= 30 || setupDismissed) return null;
                            return <div style={{ marginBottom: 4 }}>
                                <span style={{ fontSize: 13, fontWeight: 800, color: T.text.secondary, marginLeft: 16, marginBottom: 8, display: "block", letterSpacing: "0.03em", textTransform: "uppercase" }}>Setup Progress</span>
                                <div style={{ background: `linear-gradient(145deg, ${T.bg.card}, ${T.bg.surface})`, borderRadius: T.radius.xl, border: `1px solid ${T.border.subtle}`, padding: "16px 20px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", backdropFilter: "blur(12px)", position: "relative" }}>
                                    <button onClick={() => { localStorage.setItem('setup-progress-dismissed', '1'); setSetupDismissed(true); haptic.light(); }} style={{
                                        position: "absolute", top: 10, right: 10, width: 24, height: 24, borderRadius: "50%",
                                        border: `1px solid ${T.border.subtle}`, background: T.bg.surface, color: T.text.muted,
                                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                                        fontSize: 12, fontWeight: 700, lineHeight: 1, padding: 0
                                    }}>×</button>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <div style={{ width: 32, height: 32, borderRadius: "50%", background: pct === 100 ? `${T.status.green}1A` : `${T.accent.primary}1A`, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${pct === 100 ? T.status.green : T.accent.primary}40` }}>
                                                {pct === 100 ? <span style={{ fontSize: 14 }}>🚀</span> : <span style={{ fontSize: 14 }}>🎯</span>}
                                            </div>
                                            <div style={{ display: "flex", flexDirection: "column" }}>
                                                <span style={{ fontSize: 14, fontWeight: 800, color: pct === 100 ? T.status.green : T.text.primary, letterSpacing: "-0.02em" }}>{pct === 100 ? "You're all set!" : "Let's finish up"}</span>
                                                <span style={{ fontSize: 11, color: T.text.muted, fontWeight: 500 }}>{done} of {total} steps completed</span>
                                            </div>
                                        </div>
                                        <span style={{ fontSize: 14, fontWeight: 800, color: pct === 100 ? T.status.green : T.accent.primary, fontFamily: T.font.mono, letterSpacing: "-0.02em" }}>{pct}%</span>
                                    </div>
                                    <div style={{ height: 6, borderRadius: 3, background: T.bg.elevated, marginBottom: 16, overflow: "hidden", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.2)" }}>
                                        <div style={{ height: "100%", borderRadius: 3, background: pct === 100 ? T.status.green : `linear-gradient(90deg, ${T.accent.primary}, ${T.accent.emerald})`, width: `${pct}%`, transition: "width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)" }} />
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                        {steps.map((s, i) => <div key={i} className="hover-lift" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: s.done ? `${T.bg.surface}80` : T.bg.elevated, borderRadius: T.radius.md, border: `1px solid ${s.done ? T.border.subtle : T.border.default}`, transition: "all 0.2s" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                <div style={{ width: 18, height: 18, borderRadius: "50%", background: s.done ? T.status.green : T.bg.surface, border: `1px solid ${s.done ? T.status.green : T.border.subtle}`, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.3s" }}>
                                                    {s.done && <span style={{ color: "#fff", fontSize: 10, fontWeight: 800 }}>✓</span>}
                                                </div>
                                                <span style={{ fontSize: 13, fontWeight: s.done ? 500 : 700, color: s.done ? T.text.dim : T.text.primary, textDecoration: s.done ? "line-through" : "none" }}>{s.label}</span>
                                            </div>
                                            {!s.done && s.nav && <button onClick={() => { setActiveSegment("finance"); setFinanceTab(s.nav); navDir.current = 'forward'; setActiveMenu(s.nav); haptic.light(); }}
                                                style={{ fontSize: 11, fontWeight: 800, color: T.accent.primary, background: `${T.accent.primary}1A`, border: "none", cursor: "pointer", padding: "6px 12px", borderRadius: 999, transition: "background 0.2s" }}>Set up →</button>}
                                        </div>)}
                                    </div>
                                </div>
                            </div>;
                        })()}
                    </div>
                )}

                <div style={{ display: activeMenu && activeSegment === "app" ? "block" : "none" }}>
                    {/* ── AI Provider ─────────────────────────────────────── */}
                    <Card style={{ borderLeft: `3px solid ${T.accent.primary}40`, display: appTab === "ai" ? "block" : "none", borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTop: "none" }}>
                        <Label>AI Provider</Label>

                        {/* Backend info card */}
                        <div style={{ padding: "14px 16px", background: `${T.accent.emerald}10`, border: `1px solid ${T.accent.emerald}30`, borderRadius: T.radius.md, marginBottom: 14 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                <span style={{ fontSize: 14, fontWeight: 800, color: T.accent.emerald }}>✨ Catalyst AI</span>
                                <span style={{ fontSize: 10, fontWeight: 700, color: T.accent.primary, fontFamily: T.font.mono, background: T.accent.primaryDim, padding: "2px 8px", borderRadius: 99 }}>ACTIVE</span>
                            </div>
                            <p style={{ margin: 0, fontSize: 12, color: T.text.secondary, lineHeight: 1.5 }}>
                                Your financial data is processed securely and never stored on our servers.
                            </p>
                            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 10, fontFamily: T.font.mono, color: T.text.dim }}>SSE Streaming</span>
                                <span style={{ width: 3, height: 3, borderRadius: "50%", background: T.text.muted }} />
                                <span style={{ fontSize: 10, fontFamily: T.font.mono, color: T.text.dim }}>Zero Config</span>
                                <span style={{ width: 3, height: 3, borderRadius: "50%", background: T.text.muted }} />
                                <span style={{ fontSize: 10, fontFamily: T.font.mono, color: T.text.dim }}>End-to-End Encrypted</span>
                            </div>
                        </div>

                        {/* Model picker */}
                        <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 8 }}>AI MODEL</span>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                            {currentProvider.models.map(m => {
                                const active = aiModel === m.id;
                                const isPro = m.tier === "pro";
                                const locked = (isPro && !proEnabled) || m.disabled;
                                return <button key={m.id} onClick={() => { if (!locked) { setAiModel(m.id); setAiProvider("backend"); } }} style={{
                                    padding: "10px 14px", borderRadius: T.radius.md,
                                    border: `1.5px solid ${active ? T.accent.primary : T.border.default}`,
                                    background: active ? T.accent.primaryDim : T.bg.elevated,
                                    textAlign: "left", cursor: locked ? "default" : "pointer",
                                    opacity: locked ? 0.4 : 1,
                                    display: "flex", justifyContent: "space-between", alignItems: "center",
                                    transition: "all .2s ease",
                                }}>
                                    <div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                            <span style={{ fontSize: 13, fontWeight: active ? 700 : 600, color: active ? T.accent.primary : T.text.primary }}>{m.name}</span>
                                            {m.comingSoon ? <span style={{
                                                fontSize: 8, fontWeight: 800, color: T.text.muted,
                                                background: `${T.text.muted}15`,
                                                border: `1px solid ${T.text.muted}30`,
                                                padding: "1px 6px", borderRadius: 99, letterSpacing: "0.06em",
                                            }}>SOON</span> : isPro ? <span style={{
                                                fontSize: 8, fontWeight: 800, color: "#FFD700",
                                                background: "linear-gradient(135deg, #FFD70020, #FFA50020)",
                                                border: "1px solid #FFD70030",
                                                padding: "1px 6px", borderRadius: 99, letterSpacing: "0.06em",
                                            }}>PRO</span> : <span style={{
                                                fontSize: 8, fontWeight: 800, color: T.status.green,
                                                background: `${T.status.green}15`,
                                                border: `1px solid ${T.status.green}30`,
                                                padding: "1px 6px", borderRadius: 99, letterSpacing: "0.06em",
                                            }}>FREE</span>}
                                        </div>
                                        <span style={{ fontSize: 10, color: T.text.dim, marginTop: 2, display: "block" }}>{m.comingSoon ? "Coming soon" : m.note}</span>
                                    </div>
                                    {active && <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.accent.primary, boxShadow: `0 0 8px ${T.accent.primary}80` }} />}
                                </button>;
                            })}
                        </div>
                    </Card>

                    {/* ── Engine & System Info (Moved from System tab) ────────────────── */}
                    <Card style={{ borderLeft: `3px solid ${T.accent.primary}40`, display: appTab === "ai" ? "block" : "none" }}>
                        <Label>Engine Options</Label>
                        {[{ l: "Streaming", d: "See output live as it generates", v: useStreaming, fn: setUseStreaming }
                        ].map(({ l, d, v, fn }) => <div key={l} style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            padding: "12px 0", borderBottom: `1px solid ${T.border.subtle}`
                        }}>
                            <div style={{ flex: 1, paddingRight: 12 }}>
                                <span style={{ fontSize: 13, fontWeight: 600 }}>{l}</span>
                                <p style={{ fontSize: 10, color: T.text.muted, marginTop: 2 }}>{d}</p></div>
                            <Toggle value={v} onChange={fn} /></div>)}

                        <div style={{ paddingTop: 16 }}>
                            <Label>System Info</Label>
                            {[["Version", "v1"],
                            ["Provider", currentProvider.name],
                            ["Model", selectedModel.name],
                            ["Tokens", "12,000"],
                            ["Output", "JSON"],
                            ["Stream", useStreaming ? "ON" : "OFF"],
                            ].map(([label, value]) => <div key={label} style={{
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                padding: "6px 0", borderBottom: `1px solid ${T.border.subtle}`
                            }}>
                                <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
                                <Mono size={11} color={T.text.dim}>{value}</Mono>
                            </div>)}
                            <div style={{ paddingTop: 12 }}>
                                <button onClick={() => window.open(PRIVACY_URL, "_blank")} style={{
                                    width: "100%", padding: "10px 14px", borderRadius: T.radius.md,
                                    border: `1px solid ${T.border.default}`, background: T.bg.elevated,
                                    color: T.text.secondary, fontSize: 11, fontWeight: 700,
                                    cursor: "pointer"
                                }}>Privacy Policy</button>
                            </div>
                        </div>
                    </Card>

                    {/* ── Backup & Sync ────────────────────────────────────── */}
                    <Card style={{ borderLeft: `3px solid ${T.accent.emerald}30`, display: appTab === "backup" ? "block" : "none" }}>
                        <Label>Backup & Sync</Label>

                        {/* Auto-sync explanation */}
                        <div style={{ marginBottom: 14 }}>
                            {[
                                { n: "1", title: "Auto-Sync", desc: "Data automatically syncs to any iPhone signed into your Apple ID with Catalyst Cash installed via iCloud Preferences." },
                                { n: "2", title: "Export Backup", desc: "Tap EXPORT to save a .json backup to your device (Files, iCloud Drive, or AirDrop to a new phone)." },
                                { n: "3", title: "New Device", desc: "On your new iPhone, open Settings → tap RESTORE → select your backup file. App reloads with all your data." },
                            ].map(({ n, title, desc }) => <div key={n} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                                <div style={{
                                    width: 22, height: 22, borderRadius: 11, background: T.accent.emeraldDim,
                                    border: `1px solid ${T.accent.emerald}30`, display: "flex", alignItems: "center",
                                    justifyContent: "center", flexShrink: 0, marginTop: 1
                                }}>
                                    <span style={{ fontSize: 10, fontWeight: 800, color: T.accent.emerald, fontFamily: T.font.mono }}>{n}</span>
                                </div>
                                <div>
                                    <span style={{ fontSize: 12, fontWeight: 700, display: "block" }}>{title}</span>
                                    <span style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.5 }}>{desc}</span>
                                </div>
                            </div>)}
                        </div>

                        {/* Status banner */}
                        {statusMsg && <div style={{
                            padding: "10px 12px", borderRadius: T.radius.sm, marginBottom: 12,
                            background: (backupStatus === "error" || restoreStatus === "error") ? T.status.redDim : T.status.greenDim,
                            border: `1px solid ${(backupStatus === "error" || restoreStatus === "error") ? T.status.red : T.status.green}20`,
                            display: "flex", alignItems: "center", gap: 8
                        }}>
                            {(backupStatus === "error" || restoreStatus === "error")
                                ? <AlertTriangle size={12} color={T.status.red} />
                                : <CheckCircle size={12} color={T.status.green} />}
                            <span style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.5 }}>{statusMsg}</span>
                        </div>}

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button onClick={handleExport} disabled={backupStatus === "exporting"} style={{
                                flex: 1, minWidth: "48%", padding: "13px 0", borderRadius: T.radius.md,
                                border: `1px solid ${T.accent.emerald}30`, background: T.accent.emeraldDim,
                                color: T.accent.emerald, fontSize: 12, fontWeight: 700,
                                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                fontFamily: T.font.mono, transition: "all .2s", opacity: backupStatus === "exporting" ? 0.7 : 1
                            }}>
                                {backupStatus === "exporting" ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
                                JSON
                            </button>
                            <button onClick={handleExportSheet} disabled={backupStatus === "exporting"} style={{
                                flex: 1, minWidth: "48%", padding: "13px 0", borderRadius: T.radius.md,
                                border: `1px solid ${T.accent.primary}30`, background: T.accent.primaryDim,
                                color: T.accent.primary, fontSize: 12, fontWeight: 700,
                                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                fontFamily: T.font.mono, transition: "all .2s", opacity: backupStatus === "exporting" ? 0.7 : 1
                            }}>
                                {backupStatus === "exporting" ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
                                SPREADSHEET
                            </button>
                            <div style={{ flex: 1, minWidth: "100%", position: "relative", marginTop: 4 }}>
                                <input type="file" accept=".json,.enc,*/*" onChange={handleImport} disabled={restoreStatus === "restoring"}
                                    style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", zIndex: 2 }} />
                                <div style={{
                                    width: "100%", padding: "13px 0", borderRadius: T.radius.md,
                                    border: `1px solid ${T.border.default}`, background: T.bg.elevated,
                                    color: T.text.primary, fontSize: 12, fontWeight: 700,
                                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                    fontFamily: T.font.mono, transition: "all .2s", opacity: restoreStatus === "restoring" ? 0.7 : 1
                                }}>
                                    {restoreStatus === "restoring" ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
                                    RESTORE (.json / .enc)
                                </div>
                            </div>
                        </div>

                        {/* ── Debug Log Export ────────────────────────────── */}
                        <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${T.border.subtle}` }}>
                            <Label>Debug Log</Label>
                            <p style={{ fontSize: 11, color: T.text.muted, marginBottom: 12, lineHeight: 1.6 }}>
                                Export diagnostic logs to share with support. Logs contain only operational data — no financial information, prompts, or personal data.
                            </p>
                            <div style={{ display: "flex", gap: 8 }}>
                                <button onClick={async () => {
                                    try {
                                        const text = await getLogsAsText();
                                        if (!text) { setStatusMsg("No logs to export."); return; }
                                        const blob = new Blob([text], { type: "text/plain" });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement("a");
                                        a.href = url;
                                        a.download = `CatalystCash_DebugLog_${new Date().toISOString().split("T")[0]}.txt`;
                                        a.click();
                                        URL.revokeObjectURL(url);
                                        setStatusMsg("Debug log exported.");
                                    } catch (e) { setStatusMsg("Export failed: " + e.message); }
                                }} style={{
                                    flex: 1, padding: "10px 14px", borderRadius: T.radius.md,
                                    border: `1px solid ${T.border.default}`, background: T.bg.elevated,
                                    color: T.text.primary, fontSize: 12, fontWeight: 700,
                                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                    fontFamily: T.font.mono, cursor: "pointer", transition: "all .2s"
                                }}>
                                    <Download size={14} /> EXPORT LOG
                                </button>
                                <button onClick={() => setConfirmFactoryReset(true)} style={{
                                    padding: "10px 14px", borderRadius: T.radius.md,
                                    border: `1px solid ${T.status.red}30`, background: `${T.status.red}15`,
                                    color: T.status.red, fontSize: 12, fontWeight: 700,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontFamily: T.font.mono, cursor: "pointer", transition: "all .2s"
                                }}>
                                    DELETE ALL DATA
                                </button>
                                <button onClick={async () => {
                                    await clearLogs();
                                    setStatusMsg("Debug log cleared.");
                                }} style={{
                                    padding: "10px 14px", borderRadius: T.radius.md,
                                    border: `1px solid ${T.border.default}`, background: "transparent",
                                    color: T.text.dim, fontSize: 12, fontWeight: 700,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontFamily: T.font.mono, cursor: "pointer", transition: "all .2s"
                                }}>
                                    CLEAR
                                </button>
                            </div>
                        </div>

                        {/* Confirmation dialog for Data Deletion */}
                        {confirmFactoryReset && (
                            <div style={{
                                marginTop: 16, padding: 16, borderRadius: T.radius.md,
                                background: T.status.redDim, border: `1px solid ${T.status.red}40`,
                                animation: "fadeIn .3s ease-out"
                            }}>
                                <p style={{ fontSize: 12, color: T.status.red, fontWeight: 600, margin: "0 0 12px", lineHeight: 1.5 }}>
                                    This will permanently delete all financial data, API keys, rules, and history from your device. Are you sure?
                                </p>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <button onClick={() => setConfirmFactoryReset(false)} style={{
                                        flex: 1, padding: "10px 0", borderRadius: T.radius.md, border: "none",
                                        background: "transparent", color: T.status.red, opacity: 0.8, fontSize: 12, fontWeight: 700, cursor: "pointer"
                                    }}>Cancel</button>
                                    <button onClick={() => {
                                        setConfirmFactoryReset(false); haptic.medium();
                                        if (onFactoryReset) onFactoryReset();
                                    }} style={{
                                        flex: 2, padding: "10px 0", borderRadius: T.radius.md, border: "none",
                                        background: T.status.red, color: "white", fontSize: 12, fontWeight: 800, cursor: "pointer"
                                    }}>Yes, Delete All Data</button>
                                </div>
                            </div>
                        )}

                        {/* ── Auto-Backup ────────────────────────────────────── */}
                        <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${T.border.subtle}` }}>
                            <Label>Auto-Backup</Label>
                            <p style={{ fontSize: 11, color: T.text.muted, marginBottom: 16, lineHeight: 1.6 }}>
                                Enable Apple Sign-In to activate automatic iCloud backup. Your data is continuously saved to your private iCloud Drive, automatically restoring on any iPhone sharing your Apple ID.
                            </p>

                            {/* Apple / iCloud */}
                            <div style={{ marginBottom: 10 }}>
                                {appleLinkedId ? (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 16px", borderRadius: 12, background: "#00000088", border: "1px solid rgba(255,255,255,0.1)" }}>
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                <svg viewBox="0 0 814 1000" width="16" height="16" fill="white">
                                                    <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-37.3-165.9-40.8l-1.6-.6c-67.8-2.3-113.2-63-156.5-123.1C38.5 660.9 17 570 17 479.4 17 260.9 139.3 151.1 261.7 151.1c71 0 130.5 43.3 175 43.3 42.8 0 110-45.7 192.5-45.7 31 0 108.5 4.5 168.2 55.4zm-234-181.4C505.7 101.8 557 34 557 0c0-6.4-.6-12.9-1.3-18.1-1-.3-2.1-.3-3.5-.3-44.5 0-95.8 30.2-127 71.6-27.5 34.9-49.5 83.2-49.5 131.6 0 6.4 1 12.9 1.6 15.1 2.9.6 7.1 1 11 1 40 0 87.5-27.2 115.9-60.4z" />
                                                </svg>
                                                <div>
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text.primary }}>iCloud Backup Active</div>
                                                    <div style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono, marginTop: 2 }}>
                                                        {lastBackupTS ? `Last sync: ${new Date(lastBackupTS).toLocaleString()}` : "Pending first sync..."}
                                                    </div>
                                                </div>
                                            </div>
                                            <button onClick={unlinkApple} style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${T.border.default}`, background: "transparent", color: T.text.muted, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>UNLINK</button>
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 12 }}>
                                            <span style={{ fontSize: 11, color: T.text.secondary }}>Auto-Backup Schedule</span>
                                            <select value={autoBackupInterval} onChange={e => { const v = e.target.value; setAutoBackupInterval(v); db.set("auto-backup-interval", v); }}
                                                style={{ fontSize: 11, padding: "6px 10px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.glass, color: T.text.primary, fontFamily: T.font.mono, fontWeight: 600 }}>
                                                <option value="daily">Daily</option>
                                                <option value="weekly">Weekly</option>
                                                <option value="monthly">Monthly</option>
                                                <option value="off">Off</option>
                                            </select>
                                        </div>
                                        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 12, paddingBottom: 4 }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                                                <p style={{ fontSize: 10, color: T.text.dim, lineHeight: 1.5, flex: 1, paddingRight: 16 }}>
                                                    Backups are securely saved to your private iCloud Drive.<br />
                                                    <span style={{ color: T.text.muted, fontWeight: 600 }}>Files App → iCloud Drive → Catalyst Cash → CatalystCash_CloudSync.json</span>
                                                </p>
                                                <button onClick={forceICloudSync} disabled={isForceSyncing} style={{
                                                    padding: "8px 12px", borderRadius: 8, background: T.accent.primary, color: "white",
                                                    fontSize: 11, fontWeight: 700, cursor: isForceSyncing ? "not-allowed" : "pointer",
                                                    border: "none", opacity: isForceSyncing ? 0.7 : 1, display: "flex", alignItems: "center", gap: 6,
                                                    whiteSpace: "nowrap"
                                                }}>
                                                    {isForceSyncing ? <Loader2 size={12} className="spin" /> : <Cloud size={12} />}
                                                    {isForceSyncing ? "Syncing..." : "Sync Now"}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <button onClick={handleAppleSignIn} style={{
                                        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                                        width: "100%", padding: "14px 20px", borderRadius: 12, border: "none",
                                        background: "#000000", color: "#FFFFFF", fontSize: 15, fontWeight: 600,
                                        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                                        cursor: "pointer", letterSpacing: "-0.01em", boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                                    }}>
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
                    <Card style={{ borderColor: `${T.status.red}10`, display: appTab === "backup" ? "block" : "none" }}><Label>Danger Zone</Label>
                        <p style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.6, marginBottom: 14 }}>
                            Warning: Actions here are permanent and cannot be undone without a backup file.
                        </p>

                        {/* Clear Audit History */}
                        {!confirmClear ? <button onClick={() => setConfirmClear(true)} style={{
                            width: "100%", padding: 14, borderRadius: T.radius.md,
                            border: `1px solid ${T.accent.amber}40`, background: T.accent.amberDim,
                            color: T.accent.amber, fontSize: 13, fontWeight: 700, cursor: "pointer",
                            marginBottom: 8
                        }}>Clear Audit History</button> :
                            <div style={{ marginBottom: 8 }}><p style={{ fontSize: 12, color: T.accent.amber, marginBottom: 12, fontWeight: 500 }}>Delete all audit history?</p>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <button onClick={() => { onClear(); setConfirmClear(false) }} style={{
                                        flex: 1, padding: 12, borderRadius: T.radius.md,
                                        border: "none", background: T.status.red, color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer"
                                    }}>Delete</button>
                                    <button onClick={() => setConfirmClear(false)} style={{
                                        flex: 1, padding: 12, borderRadius: T.radius.md,
                                        border: `1px solid ${T.border.default}`, background: "transparent",
                                        color: T.text.secondary, fontSize: 13, cursor: "pointer"
                                    }}>Cancel</button>
                                </div>
                            </div>}

                        {/* Factory Reset */}
                        {!confirmFactoryReset ? <button onClick={() => setConfirmFactoryReset(true)} style={{
                            width: "100%", padding: 14, borderRadius: T.radius.md,
                            border: `1px solid ${T.status.red}20`, background: T.status.redDim,
                            color: T.status.red, fontSize: 13, fontWeight: 700, cursor: "pointer"
                        }}>Factory Reset</button> :
                            <div><p style={{ fontSize: 12, color: T.status.red, marginBottom: 12, fontWeight: 700 }}>Wipe EVERYTHING and reset to defaults?</p>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <button onClick={() => { onFactoryReset(); setConfirmFactoryReset(false) }} style={{
                                        flex: 1, padding: 12, borderRadius: T.radius.md,
                                        border: "none", background: T.status.red, color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer"
                                    }}>Wipe Data</button>
                                    <button onClick={() => setConfirmFactoryReset(false)} style={{
                                        flex: 1, padding: 12, borderRadius: T.radius.md,
                                        border: `1px solid ${T.border.default}`, background: "transparent",
                                        color: T.text.secondary, fontSize: 13, cursor: "pointer"
                                    }}>Cancel</button>
                                </div>
                            </div>}

                    </Card>

                    {/* ── Security Suite ───────────────────────────────────────── */}
                    <Card style={{ borderLeft: `3px solid ${T.status.red}40`, display: appTab === "security" ? "block" : "none" }}>
                        <Label>Security Suite</Label>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${T.border.subtle}` }}>
                            <div style={{ flex: 1, paddingRight: 12 }}>
                                <span style={{ fontSize: 13, fontWeight: 600 }}>App Passcode (4 Digits)</span>
                                <p style={{ fontSize: 10, color: T.text.muted, marginTop: 2 }}>Required failsafe before enabling App Lock</p>
                            </div>
                            <input
                                type="password"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={4}
                                value={appPasscode || ""}
                                onChange={handlePasscodeChange}
                                placeholder="••••"
                                autoComplete="new-password"
                                style={{
                                    width: 60, padding: 8, borderRadius: T.radius.md, border: `1px solid ${T.border.default}`,
                                    background: T.bg.elevated, color: T.text.primary, fontSize: 16, textAlign: "center",
                                    letterSpacing: 4, fontFamily: T.font.mono
                                }}
                            />
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: requireAuth ? `1px solid ${T.border.subtle}` : "none", opacity: appPasscode?.length === 4 ? 1 : 0.5 }}>
                            <div style={{ flex: 1, paddingRight: 12 }}>
                                <span style={{ fontSize: 13, fontWeight: 600 }}>Require Passcode</span>
                                <p style={{ fontSize: 10, color: T.text.muted, marginTop: 2 }}>Lock app natively on launch or background</p>
                            </div>
                            <Toggle value={requireAuth} onChange={handleRequireAuthToggle} />
                        </div>

                        {requireAuth && (
                            <>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${T.border.subtle}` }}>
                                    <div style={{ flex: 1, paddingRight: 12 }}>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: T.text.primary }}>Enable Face ID / Touch ID</span>
                                        <p style={{ fontSize: 10, color: T.text.muted, marginTop: 2 }}>Use biometrics for faster unlocking</p>
                                    </div>
                                    <Toggle value={useFaceId} onChange={handleUseFaceIdToggle} />
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0" }}>
                                    <div style={{ flex: 1, paddingRight: 12 }}>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: T.text.primary }}>Relock After</span>
                                        <p style={{ fontSize: 10, color: T.text.muted, marginTop: 2 }}>Time before requiring re-authentication</p>
                                    </div>
                                    <select value={lockTimeout} onChange={e => { const v = parseInt(e.target.value); setLockTimeout(v); db.set("lock-timeout", v); }}
                                        style={{ fontSize: 12, padding: "8px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontFamily: T.font.mono, fontWeight: 600 }}>
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
                                <button style={{
                                    textAlign: "left", padding: "12px 16px", borderRadius: T.radius.md,
                                    background: T.bg.elevated, border: `1px solid ${T.border.default}`,
                                    color: T.text.primary, fontSize: 13, fontWeight: 600, cursor: "pointer",
                                    display: "flex", justifyContent: "space-between", alignItems: "center"
                                }} onClick={() => window.open("https://catalystcash.app/privacy", "_blank")}>
                                    <span>Privacy Policy</span>
                                    <ExternalLink size={14} color={T.text.dim} />
                                </button>
                                <button style={{
                                    textAlign: "left", padding: "12px 16px", borderRadius: T.radius.md,
                                    background: T.bg.elevated, border: `1px solid ${T.border.default}`,
                                    color: T.text.primary, fontSize: 13, fontWeight: 600, cursor: "pointer",
                                    display: "flex", justifyContent: "space-between", alignItems: "center"
                                }} onClick={() => window.open("https://catalystcash.app/terms", "_blank")}>
                                    <span>Terms of Service</span>
                                    <ExternalLink size={14} color={T.text.dim} />
                                </button>
                                <div style={{
                                    padding: "12px 16px", borderRadius: T.radius.md,
                                    background: `${T.status.amber}08`, border: `1px solid ${T.status.amber}20`
                                }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: T.status.amber, marginBottom: 4 }}>⚠️ AI Disclaimer</div>
                                    <p style={{ fontSize: 10, color: T.text.muted, lineHeight: 1.5, margin: 0 }}>
                                        Catalyst Cash is not a financial advisor and does not act in a fiduciary capacity. All AI-generated
                                        insights are for informational and educational purposes only. Always consult a licensed financial
                                        professional before making significant financial decisions.
                                    </p>
                                </div>
                                <p style={{ fontSize: 10, color: T.text.muted, lineHeight: 1.5, marginTop: 4 }}>
                                    🔒 Your data is processed locally on your device. We never see, access, or store your financial
                                    information. AI chat conversations auto-expire after 24 hours with PII automatically scrubbed.
                                    API requests go directly from your device to your chosen AI provider.
                                </p>
                            </div>
                        </div>

                    </Card>

                    {/* ── Bank Connections (Plaid) ───────────────────────────────────────── */}
                    {ENABLE_PLAID && (
                        <Card style={{ borderLeft: `3px solid ${T.status.purple || "#8a2be2"}40`, display: appTab === "plaid" ? "block" : "none" }}>
                            <Label>Bank Connections</Label>
                            <p style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.6, marginBottom: 16 }}>
                                Securely link your bank and credit card accounts to automatically fetch balances.
                                Credentials are never stored on our servers.
                            </p>

                            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                                {plaidConnections.length === 0 ? (
                                    <div style={{
                                        padding: 16, borderRadius: T.radius.md, border: `1px dashed ${T.border.default}`,
                                        textAlign: "center", color: T.text.muted, fontSize: 13, fontWeight: 600
                                    }}>
                                        No linked accounts yet.
                                    </div>
                                ) : (
                                    plaidConnections.map(conn => (
                                        <div key={conn.id} style={{
                                            padding: "14px 16px", borderRadius: T.radius.md,
                                            background: T.bg.elevated, border: `1px solid ${T.border.default}`,
                                            display: "flex", justifyContent: "space-between", alignItems: "center"
                                        }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                                                    {conn.institution_logo ? <img src={`data:image/png;base64,${conn.institution_logo}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Building2 size={16} color="#000" />}
                                                </div>
                                                <div>
                                                    <span style={{ fontSize: 14, fontWeight: 700, color: T.text.primary, display: "block" }}>{conn.institution_name}</span>
                                                    <span style={{ fontSize: 11, color: T.text.muted, marginTop: 2, display: "block" }}>{conn.accounts?.length || 0} Accounts Linked</span>
                                                </div>
                                            </div>
                                            <button onClick={async () => {
                                                if (!window.confirm(`Disconnect ${conn.institution_name}?`)) return;
                                                await removeConnection(conn.id);
                                                setPlaidConnections(await getConnections());
                                                if (window.toast) window.toast.success("Connection removed");
                                            }} style={{
                                                width: 36, height: 36, borderRadius: T.radius.sm, border: "none",
                                                background: T.status.redDim, color: T.status.red, cursor: "pointer",
                                                display: "flex", alignItems: "center", justifyContent: "center"
                                            }}>
                                                <Unplug size={16} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>

                            <button onClick={async () => {
                                if (isPlaidConnecting) return;
                                setIsPlaidConnecting(true);
                                try {
                                    await connectBank(
                                        async (connection) => {
                                            try {
                                                const { newCards, newBankAccounts } = autoMatchAccounts(connection, cards, bankAccounts, cardCatalog);
                                                await saveConnectionLinks(connection);

                                                const allCards = mergeUniqueById(cards, newCards);
                                                const allBanks = mergeUniqueById(bankAccounts, newBankAccounts);
                                                setCards(allCards);
                                                setBankAccounts(allBanks);

                                                try {
                                                    const refreshed = await fetchBalances(connection.id);
                                                    if (refreshed) {
                                                        const syncData = applyBalanceSync(refreshed, allCards, allBanks);
                                                        setCards(syncData.updatedCards);
                                                        setBankAccounts(syncData.updatedBankAccounts);
                                                        await saveConnectionLinks(refreshed);
                                                    }
                                                } catch {
                                                    // Best effort only; connection succeeded.
                                                }
                                            } catch (err) {
                                                console.error(err);
                                            }
                                            setPlaidConnections(await getConnections());
                                            if (window.toast) window.toast.success("Bank linked successfully!");
                                        },
                                        (err) => {
                                            console.error(err);
                                            if (window.toast) window.toast.error("Failed to link bank");
                                        }
                                    );
                                } catch (err) {
                                    console.error(err);
                                    if (window.toast) window.toast.error(err.message || "Failed to initialize Plaid");
                                } finally {
                                    setIsPlaidConnecting(false);
                                }
                            }} disabled={isPlaidConnecting} style={{
                                width: "100%", padding: 14, borderRadius: T.radius.md,
                                border: "none", background: T.accent.primary, color: "white",
                                fontSize: 14, fontWeight: 700, cursor: isPlaidConnecting ? "not-allowed" : "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                                opacity: isPlaidConnecting ? 0.7 : 1, transition: "opacity .2s"
                            }}>
                                {isPlaidConnecting ? <Loader2 size={18} className="spin" /> : <Plus size={18} />}
                                {isPlaidConnecting ? "Connecting..." : "Link New Bank"}
                            </button>
                        </Card>
                    )}
                </div>

                {/* ── Financial Constants ────────────────────────────────────── */}
                <div style={{ display: activeMenu && activeSegment === "finance" ? "block" : "none" }}>
                    <div style={{ padding: "12px 16px 16px 16px", display: "flex", flexDirection: "column", gap: 16 }}>

                        {/* Account Tracking Toggles */}
                        <div style={{ display: financeTab === "income" ? "block" : "none" }}>
                            <div style={{ background: T.bg.card, borderRadius: T.radius.xl, padding: 20, border: `1px solid ${T.border.subtle}`, boxShadow: `0 4px 20px #00000010` }}>
                                <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: T.text.primary }}>Account Tracking</h3>
                                <p style={{ fontSize: 10, color: T.text.muted, marginBottom: 16, lineHeight: 1.4, borderBottom: `1px solid ${T.border.subtle}`, paddingBottom: 10 }}>Toggle which balances are included in the audit input form. Disabled accounts are hidden from the form and not required to run an audit.</p>
                                {[
                                    { key: "trackChecking", label: "Checking Account", desc: "Primary checking balance" },
                                    { key: "trackSavings", label: "Savings (HYSA)", desc: "High-yield savings balance" },
                                    { key: "trackPaycheck", label: "Paycheck Tracking", desc: "Auto-add paycheck to checking" },
                                ].map(({ key, label, desc }) => {
                                    // Default to true (on) when not set — backward compatible
                                    const isOn = financialConfig?.[key] !== false;
                                    return (
                                        <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                                            <div>
                                                <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block" }}>{label.toUpperCase()}</span>
                                                <span style={{ fontSize: 10, color: T.text.muted }}>{desc}</span>
                                            </div>
                                            <button onClick={() => setFinancialConfig({ ...financialConfig, [key]: !isOn })} style={{
                                                width: 56, height: 28, borderRadius: 999,
                                                border: `1px solid ${isOn ? T.accent.primary : T.border.default}`,
                                                background: isOn ? T.accent.primaryDim : T.bg.elevated,
                                                position: "relative", cursor: "pointer", flexShrink: 0
                                            }}>
                                                <div style={{
                                                    width: 22, height: 22, borderRadius: 999,
                                                    background: isOn ? T.accent.primary : T.bg.card,
                                                    position: "absolute", top: 2, left: isOn ? 30 : 4,
                                                    transition: "all .2s"
                                                }} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Income Profile */}
                        <div style={{ display: financeTab === "income" ? "block" : "none" }}>
                            <div style={{ background: T.bg.card, borderRadius: T.radius.xl, padding: 20, border: `1px solid ${T.border.subtle}`, boxShadow: `0 4px 20px #00000010` }}>
                                <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: T.text.primary, borderBottom: `1px solid ${T.border.subtle}`, paddingBottom: 6 }}>Income Profile</h3>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                                    <div>
                                        <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>PAY FREQUENCY</span>
                                        <select value={financialConfig?.payFrequency || "weekly"} onChange={e => setFinancialConfig({ ...financialConfig, payFrequency: e.target.value })}
                                            style={{ width: "100%", padding: "10px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12 }}>
                                            {["weekly", "bi-weekly", "semi-monthly", "monthly"].map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>PAYDAY</span>
                                        <select value={financialConfig?.payday || "Wednesday"} onChange={e => setFinancialConfig({ ...financialConfig, payday: e.target.value })}
                                            style={{ width: "100%", padding: "10px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12 }}>
                                            {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div style={{ marginBottom: 12 }}>
                                    <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>INCOME TYPE</span>
                                    <select value={financialConfig?.incomeType || "salary"} onChange={e => setFinancialConfig({ ...financialConfig, incomeType: e.target.value })}
                                        style={{ width: "100%", padding: "10px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12 }}>
                                        {[{ v: "salary", l: "💼 Salary (Consistent Paychecks)" }, { v: "hourly", l: "⏱️ Hourly Wage" }, { v: "variable", l: "📈 Variable (Commission, Gig, Tips)" }].map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                                    </select>
                                </div>

                                {(!financialConfig?.incomeType || financialConfig.incomeType === "salary") && (
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                                        <div>
                                            <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>STANDARD PAY</span>
                                            <div style={{ position: "relative" }}>
                                                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>$</span>
                                                <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={financialConfig?.paycheckStandard || ""} onChange={e => setFinancialConfig({ ...financialConfig, paycheckStandard: parseFloat(e.target.value) || 0 })}
                                                    style={{ width: "100%", padding: "10px 10px 10px 22px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12 }} />
                                            </div>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>1ST OF MONTH PAY</span>
                                            <div style={{ position: "relative" }}>
                                                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>$</span>
                                                <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={financialConfig?.paycheckFirstOfMonth || ""} onChange={e => setFinancialConfig({ ...financialConfig, paycheckFirstOfMonth: parseFloat(e.target.value) || 0 })}
                                                    style={{ width: "100%", padding: "10px 10px 10px 22px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12 }} />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {financialConfig?.incomeType === "hourly" && (
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                                        <div>
                                            <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>NET HOURLY ($)</span>
                                            <div style={{ position: "relative" }}>
                                                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>$</span>
                                                <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={financialConfig?.hourlyRateNet || ""} onChange={e => setFinancialConfig({ ...financialConfig, hourlyRateNet: parseFloat(e.target.value) || 0 })}
                                                    style={{ width: "100%", padding: "10px 10px 10px 22px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12 }} />
                                            </div>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>AVG HOURS</span>
                                            <div style={{ position: "relative" }}>
                                                <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.5" value={financialConfig?.typicalHours || ""} onChange={e => setFinancialConfig({ ...financialConfig, typicalHours: parseFloat(e.target.value) || 0 })}
                                                    style={{ width: "100%", padding: "10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12 }} />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {financialConfig?.incomeType === "variable" && (
                                    <div style={{ marginBottom: 12 }}>
                                        <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>AVG PAYCHECK ($)</span>
                                        <div style={{ position: "relative" }}>
                                            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>$</span>
                                            <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={financialConfig?.averagePaycheck || ""} onChange={e => setFinancialConfig({ ...financialConfig, averagePaycheck: parseFloat(e.target.value) || 0 })}
                                                style={{ width: "100%", padding: "10px 10px 10px 22px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12 }} />
                                        </div>
                                    </div>
                                )}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
                                    <div>
                                        <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>DEPOSIT TIME (EST)</span>
                                        <input type="time" value={financialConfig?.paycheckTime || "06:00"} onChange={e => setFinancialConfig({ ...financialConfig, paycheckTime: e.target.value })}
                                            style={{ width: "100%", padding: "10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12 }} />
                                    </div>
                                </div>

                                {/* Payday Reminder Notification */}
                                {(() => {
                                    const payday = financialConfig?.payday;
                                    const pt = financialConfig?.paycheckTime;
                                    const DAY_PREV = { Sunday: "Saturday", Monday: "Sunday", Tuesday: "Monday", Wednesday: "Tuesday", Thursday: "Wednesday", Friday: "Thursday", Saturday: "Friday" };
                                    let notifyHour = 9, notifyMin = 0;
                                    if (pt && /^\d{1,2}:\d{2}$/.test(pt)) {
                                        const [h, m] = pt.split(":").map(Number);
                                        const totalMins = h * 60 + m - 12 * 60;
                                        notifyHour = Math.floor(((totalMins % (24 * 60)) + 24 * 60) % (24 * 60) / 60);
                                        notifyMin = ((totalMins % 60) + 60) % 60;
                                    }
                                    const ampm = notifyHour >= 12 ? "PM" : "AM";
                                    const h12 = notifyHour % 12 || 12;
                                    const minStr = String(notifyMin).padStart(2, "0");
                                    const notifyDayName = payday ? (DAY_PREV[payday] || "day before") : "day before";
                                    const permDenied = notifPermission === "denied";
                                    const hint = permDenied
                                        ? "Enable notifications in iOS Settings → Catalyst Cash"
                                        : payday ? `Notifies ${notifyDayName} at ${h12}:${minStr} ${ampm}` : "Set a payday to enable reminders";
                                    const isOn = !permDenied && !!financialConfig?.paydayReminderEnabled;
                                    return (
                                        <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: T.radius.md, background: isOn ? `${T.accent.primary}10` : T.bg.elevated, border: `1px solid ${isOn ? T.accent.primary + "40" : T.border.default}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, opacity: permDenied ? 0.5 : 1 }}>
                                            <div style={{ flex: 1 }}>
                                                <span style={{ fontSize: 12, fontWeight: 700, color: T.text.primary, display: "block" }}>Payday Reminder</span>
                                                <span style={{ fontSize: 11, color: permDenied ? T.status.red : (isOn ? T.accent.primary : T.text.muted) }}>{hint}</span>
                                            </div>
                                            <button disabled={permDenied} onClick={() => !permDenied && setFinancialConfig({ ...financialConfig, paydayReminderEnabled: !financialConfig?.paydayReminderEnabled })} style={{
                                                width: 44, height: 24, borderRadius: 999, flexShrink: 0,
                                                border: `1px solid ${isOn ? T.accent.primary : T.border.default}`,
                                                background: isOn ? T.accent.primaryDim : T.bg.card,
                                                position: "relative", cursor: permDenied ? "not-allowed" : "pointer"
                                            }}>
                                                <div style={{ width: 18, height: 18, borderRadius: 999, background: isOn ? T.accent.primary : T.bg.elevated, position: "absolute", top: 2, left: isOn ? 22 : 4, transition: "all .2s" }} />
                                            </button>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* Income Sources (Combined with Income & Budget) */}
                        <div style={{ display: financeTab === "income" ? "block" : "none" }}>
                            <div style={{ background: T.bg.card, borderRadius: T.radius.xl, padding: 20, border: `1px solid ${T.border.subtle}`, boxShadow: `0 4px 20px #00000010` }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${T.border.subtle}`, paddingBottom: 10, marginBottom: 16 }}>
                                    <div style={{ flex: 1 }}>
                                        <h3 style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, marginBottom: 4 }}>Additional Income Sources</h3>
                                        <p style={{ fontSize: 10, color: T.text.muted, lineHeight: 1.4, margin: 0 }}>Track freelance, side-gig, or other income beyond your primary paycheck.</p>
                                    </div>
                                    {(financialConfig?.incomeSources || []).length > 0 && <button onClick={() => setEditingSection(editingSection === "income" ? null : "income")} style={{ padding: "5px 10px", borderRadius: T.radius.sm, border: `1px solid ${editingSection === "income" ? T.accent.primary : T.border.default}`, background: editingSection === "income" ? T.accent.primaryDim : "transparent", color: editingSection === "income" ? T.accent.primary : T.text.dim, fontSize: 10, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                                        {editingSection === "income" ? <><Check size={10} /> Done</> : <><Pencil size={10} /> Edit</>}
                                    </button>}
                                </div>
                                {editingSection === "income" || (financialConfig?.incomeSources || []).length === 0 ? <>
                                    {(financialConfig?.incomeSources || []).map((src, i) => (
                                        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
                                            <input value={src.name || ""} onChange={e => { const arr = [...(financialConfig.incomeSources || [])]; arr[i] = { ...arr[i], name: e.target.value }; setFinancialConfig({ ...financialConfig, incomeSources: arr }); }}
                                                placeholder="Source name" style={{ flex: 1, padding: "8px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 11 }} />
                                            <div style={{ position: "relative", flex: 0.6 }}>
                                                <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 11, fontWeight: 600 }}>$</span>
                                                <input type="number" inputMode="decimal" pattern="[0-9]*" value={src.amount || ""} onChange={e => { const arr = [...(financialConfig.incomeSources || [])]; arr[i] = { ...arr[i], amount: parseFloat(e.target.value) || 0 }; setFinancialConfig({ ...financialConfig, incomeSources: arr }); }}
                                                    placeholder="Amount" style={{ width: "100%", padding: "8px 8px 8px 20px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 11 }} />
                                            </div>
                                            <select value={src.frequency || "monthly"} onChange={e => { const arr = [...(financialConfig.incomeSources || [])]; arr[i] = { ...arr[i], frequency: e.target.value }; setFinancialConfig({ ...financialConfig, incomeSources: arr }); }}
                                                style={{ flex: 0.5, padding: "8px 6px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 10 }}>
                                                {["weekly", "bi-weekly", "monthly", "irregular"].map(f => <option key={f} value={f}>{f}</option>)}
                                            </select>
                                            <button onClick={() => { const arr = (financialConfig.incomeSources || []).filter((_, j) => j !== i); setFinancialConfig({ ...financialConfig, incomeSources: arr }); }}
                                                style={{ width: 30, height: 30, borderRadius: T.radius.sm, border: "none", background: T.status.redDim, color: T.status.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>×</button>
                                        </div>
                                    ))}
                                    <button onClick={() => { setEditingSection("income"); setFinancialConfig({ ...financialConfig, incomeSources: [...(financialConfig.incomeSources || []), { name: "", amount: 0, frequency: "monthly", type: "other" }] }); }}
                                        style={{ padding: "8px 14px", borderRadius: T.radius.md, border: `1px dashed ${T.border.default}`, background: "transparent", color: T.accent.primary, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: T.font.mono, width: "100%" }}>+ ADD SOURCE</button>
                                </> : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                    {(financialConfig?.incomeSources || []).map((src, i) => (
                                        <div key={i} style={{ padding: "10px 12px", borderRadius: T.radius.md, background: T.bg.elevated, border: `1px solid ${T.border.default}` }}>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: T.text.primary }}>{src.name || "Unnamed"}</span>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <span style={{ fontSize: 12, fontWeight: 700, color: T.accent.primary, fontFamily: T.font.mono }}>${(src.amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                                                <span style={{ fontSize: 9, color: T.text.muted, fontFamily: T.font.mono, textTransform: "uppercase" }}>{src.frequency || "monthly"}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>}
                            </div>
                        </div>

                        {/* Budget Categories (Combined with Income & Budget) */}
                        <div style={{ display: financeTab === "income" ? "block" : "none" }}>
                            <div style={{ background: T.bg.card, borderRadius: T.radius.xl, padding: 20, border: `1px solid ${T.border.subtle}`, boxShadow: `0 4px 20px #00000010` }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${T.border.subtle}`, paddingBottom: 10, marginBottom: 16 }}>
                                    <div style={{ flex: 1 }}>
                                        <h3 style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, marginBottom: 4 }}>Monthly Budget Categories</h3>
                                        <p style={{ fontSize: 10, color: T.text.muted, lineHeight: 1.4, margin: 0 }}>Set monthly spending targets per category. The AI will track actual vs. target in audits.</p>
                                    </div>
                                    {(financialConfig?.budgetCategories || []).length > 0 && <button onClick={() => setEditingSection(editingSection === "budget" ? null : "budget")} style={{ padding: "5px 10px", borderRadius: T.radius.sm, border: `1px solid ${editingSection === "budget" ? T.accent.primary : T.border.default}`, background: editingSection === "budget" ? T.accent.primaryDim : "transparent", color: editingSection === "budget" ? T.accent.primary : T.text.dim, fontSize: 10, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                                        {editingSection === "budget" ? <><Check size={10} /> Done</> : <><Pencil size={10} /> Edit</>}
                                    </button>}
                                </div>
                                {editingSection === "budget" || (financialConfig?.budgetCategories || []).length === 0 ? <>
                                    {(financialConfig?.budgetCategories || []).map((cat, i) => (
                                        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
                                            <input value={cat.name || ""} onChange={e => { const arr = [...(financialConfig.budgetCategories || [])]; arr[i] = { ...arr[i], name: e.target.value }; setFinancialConfig({ ...financialConfig, budgetCategories: arr }); }}
                                                placeholder="Category (e.g. Groceries)" style={{ flex: 1, padding: "8px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 11 }} />
                                            <div style={{ position: "relative", flex: 0.5 }}>
                                                <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 11, fontWeight: 600 }}>$</span>
                                                <input type="number" inputMode="decimal" pattern="[0-9]*" value={cat.monthlyTarget || ""} onChange={e => { const arr = [...(financialConfig.budgetCategories || [])]; arr[i] = { ...arr[i], monthlyTarget: parseFloat(e.target.value) || 0 }; setFinancialConfig({ ...financialConfig, budgetCategories: arr }); }}
                                                    placeholder="/month" style={{ width: "100%", padding: "8px 8px 8px 20px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 11 }} />
                                            </div>
                                            <button onClick={() => { const arr = (financialConfig.budgetCategories || []).filter((_, j) => j !== i); setFinancialConfig({ ...financialConfig, budgetCategories: arr }); }}
                                                style={{ width: 30, height: 30, borderRadius: T.radius.sm, border: "none", background: T.status.redDim, color: T.status.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>×</button>
                                        </div>
                                    ))}
                                    <button onClick={() => { setEditingSection("budget"); setFinancialConfig({ ...financialConfig, budgetCategories: [...(financialConfig.budgetCategories || []), { name: "", monthlyTarget: 0 }] }); }}
                                        style={{ padding: "8px 14px", borderRadius: T.radius.md, border: `1px dashed ${T.border.default}`, background: "transparent", color: T.accent.primary, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: T.font.mono, width: "100%" }}>+ ADD CATEGORY</button>
                                </> : <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                    {(financialConfig?.budgetCategories || []).map((cat, i) => (
                                        <div key={i} style={{ padding: "6px 12px", borderRadius: T.radius.pill || 20, background: T.bg.elevated, border: `1px solid ${T.border.default}`, display: "flex", alignItems: "center", gap: 6 }}>
                                            <span style={{ fontSize: 11, fontWeight: 600, color: T.text.primary }}>{cat.name || "Unnamed"}</span>
                                            <span style={{ fontSize: 10, fontWeight: 700, color: T.accent.primary, fontFamily: T.font.mono }}>${(cat.monthlyTarget || 0).toLocaleString()}/mo</span>
                                        </div>
                                    ))}
                                </div>}
                            </div>
                        </div>

                        {/* Non-Card Debts (Combined with Debts & Credit) */}
                        <div style={{ display: financeTab === "debts" ? "block" : "none" }}>
                            <div style={{ background: T.bg.card, borderRadius: T.radius.xl, padding: 20, border: `1px solid ${T.border.subtle}`, boxShadow: `0 4px 20px #00000010` }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${T.border.subtle}`, paddingBottom: 10, marginBottom: 16 }}>
                                    <div style={{ flex: 1 }}>
                                        <h3 style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, marginBottom: 4 }}>Non-Card Debts</h3>
                                        <p style={{ fontSize: 10, color: T.text.muted, lineHeight: 1.4, margin: 0 }}>Student loans, auto loans, personal loans, mortgages. The AI will include minimums in time-critical gates.</p>
                                    </div>
                                    {(financialConfig?.nonCardDebts || []).length > 0 && <button onClick={() => setEditingSection(editingSection === "debts" ? null : "debts")} style={{ padding: "5px 10px", borderRadius: T.radius.sm, border: `1px solid ${editingSection === "debts" ? T.accent.primary : T.border.default}`, background: editingSection === "debts" ? T.accent.primaryDim : "transparent", color: editingSection === "debts" ? T.accent.primary : T.text.dim, fontSize: 10, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                                        {editingSection === "debts" ? <><Check size={10} /> Done</> : <><Pencil size={10} /> Edit</>}
                                    </button>}
                                </div>
                                {editingSection === "debts" || (financialConfig?.nonCardDebts || []).length === 0 ? <>
                                    {(financialConfig?.nonCardDebts || []).map((debt, i) => (
                                        <div key={i} style={{ background: T.bg.elevated, borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, padding: 10, marginBottom: 8 }}>
                                            <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                                                <input value={debt.name || ""} onChange={e => { const arr = [...(financialConfig.nonCardDebts || [])]; arr[i] = { ...arr[i], name: e.target.value }; setFinancialConfig({ ...financialConfig, nonCardDebts: arr }); }}
                                                    placeholder="Loan name" style={{ flex: 1, padding: "8px 10px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontSize: 11 }} />
                                                <select value={debt.type || "other"} onChange={e => { const arr = [...(financialConfig.nonCardDebts || [])]; arr[i] = { ...arr[i], type: e.target.value }; setFinancialConfig({ ...financialConfig, nonCardDebts: arr }); }}
                                                    style={{ flex: 0.5, padding: "8px 6px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontSize: 10 }}>
                                                    {["student", "auto", "personal", "mortgage", "medical", "other"].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                                                </select>
                                                <button onClick={() => { const arr = (financialConfig.nonCardDebts || []).filter((_, j) => j !== i); setFinancialConfig({ ...financialConfig, nonCardDebts: arr }); }}
                                                    style={{ width: 28, height: 28, borderRadius: T.radius.sm, border: "none", background: T.status.redDim, color: T.status.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>×</button>
                                            </div>
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
                                                <div style={{ position: "relative" }}>
                                                    <span style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 3 }}>BALANCE</span>
                                                    <div style={{ position: "relative" }}>
                                                        <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 11, fontWeight: 600 }}>$</span>
                                                        <input type="number" inputMode="decimal" pattern="[0-9]*" value={debt.balance || ""} onChange={e => { const arr = [...(financialConfig.nonCardDebts || [])]; arr[i] = { ...arr[i], balance: parseFloat(e.target.value) || 0 }; setFinancialConfig({ ...financialConfig, nonCardDebts: arr }); }}
                                                            placeholder="0.00" style={{ width: "100%", padding: "8px 8px 8px 20px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontSize: 12 }} />
                                                    </div>
                                                </div>
                                                <div>
                                                    <span style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 3 }}>MIN PAYMENT</span>
                                                    <div style={{ position: "relative" }}>
                                                        <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 11, fontWeight: 600 }}>$</span>
                                                        <input type="number" inputMode="decimal" pattern="[0-9]*" value={debt.minimum || ""} onChange={e => { const arr = [...(financialConfig.nonCardDebts || [])]; arr[i] = { ...arr[i], minimum: parseFloat(e.target.value) || 0 }; setFinancialConfig({ ...financialConfig, nonCardDebts: arr }); }}
                                                            placeholder="0.00" style={{ width: "100%", padding: "8px 8px 8px 20px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontSize: 12 }} />
                                                    </div>
                                                </div>
                                                <div>
                                                    <span style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 3 }}>APR %</span>
                                                    <div style={{ position: "relative" }}>
                                                        <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={debt.apr || ""} onChange={e => { const arr = [...(financialConfig.nonCardDebts || [])]; arr[i] = { ...arr[i], apr: parseFloat(e.target.value) || 0 }; setFinancialConfig({ ...financialConfig, nonCardDebts: arr }); }}
                                                            placeholder="0.0" style={{ width: "100%", padding: "8px 20px 8px 8px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontSize: 12 }} />
                                                        <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 11 }}>%</span>
                                                    </div>
                                                </div>
                                                <div>
                                                    <span style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 3 }}>DUE DAY</span>
                                                    <input type="number" inputMode="decimal" pattern="[0-9]*" value={debt.dueDay || ""} onChange={e => { const arr = [...(financialConfig.nonCardDebts || [])]; arr[i] = { ...arr[i], dueDay: parseInt(e.target.value) || 0 }; setFinancialConfig({ ...financialConfig, nonCardDebts: arr }); }}
                                                        placeholder="1" title="Due day of month" style={{ width: "100%", padding: "8px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontSize: 12, textAlign: "center" }} />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    <button onClick={() => { setEditingSection("debts"); setFinancialConfig({ ...financialConfig, nonCardDebts: [...(financialConfig.nonCardDebts || []), { name: "", type: "other", balance: 0, minimum: 0, apr: 0, dueDay: 1 }] }); }}
                                        style={{ padding: "8px 14px", borderRadius: T.radius.md, border: `1px dashed ${T.border.default}`, background: "transparent", color: T.accent.primary, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: T.font.mono, width: "100%" }}>+ ADD DEBT</button>
                                </> : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                    {(financialConfig?.nonCardDebts || []).map((debt, i) => (
                                        <div key={i} style={{ padding: "10px 12px", borderRadius: T.radius.md, background: T.bg.elevated, border: `1px solid ${T.border.default}` }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                                <span style={{ fontSize: 12, fontWeight: 600, color: T.text.primary }}>{debt.name || "Unnamed"}</span>
                                                <span style={{ fontSize: 9, color: T.text.muted, fontFamily: T.font.mono, textTransform: "uppercase", padding: "2px 6px", borderRadius: 4, background: `${T.border.subtle}60` }}>{debt.type || "other"}</span>
                                            </div>
                                            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                                                <span style={{ fontSize: 11, fontWeight: 700, color: T.status.red, fontFamily: T.font.mono }}>${(debt.balance || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                                                <span style={{ fontSize: 9, color: T.text.muted, fontFamily: T.font.mono }}>min ${(debt.minimum || 0).toFixed(2)}</span>
                                                <span style={{ fontSize: 9, color: T.text.muted, fontFamily: T.font.mono }}>{debt.apr || 0}% APR</span>
                                                <span style={{ fontSize: 9, color: T.text.muted, fontFamily: T.font.mono }}>Due {debt.dueDay || "—"}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>}
                            </div>
                        </div>

                        {/* Credit Score (Combined with Debts & Credit) */}
                        <div style={{ display: financeTab === "debts" ? "block" : "none" }}>
                            <div style={{ background: T.bg.card, borderRadius: T.radius.xl, padding: 20, border: `1px solid ${T.border.subtle}`, boxShadow: `0 4px 20px #00000010` }}>
                                <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: T.text.primary }}>Credit Score & Utilization</h3>
                                <p style={{ fontSize: 10, color: T.text.muted, marginBottom: 16, lineHeight: 1.4, borderBottom: `1px solid ${T.border.subtle}`, paddingBottom: 10 }}>Enter your latest score. The AI will factor utilization into debt paydown strategy.</p>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                                    <div>
                                        <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>SCORE</span>
                                        <input type="number" inputMode="decimal" pattern="[0-9]*" value={financialConfig?.creditScore || ""} onChange={e => setFinancialConfig({ ...financialConfig, creditScore: parseInt(e.target.value) || null })}
                                            placeholder="750" style={{ width: "100%", padding: "10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12 }} />
                                    </div>
                                    <div>
                                        <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>UTILIZATION</span>
                                        <div style={{ position: "relative" }}>
                                            <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.1" value={financialConfig?.creditUtilization || ""} onChange={e => setFinancialConfig({ ...financialConfig, creditUtilization: parseFloat(e.target.value) || null })}
                                                placeholder="25" style={{ width: "100%", padding: "10px 22px 10px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12 }} />
                                            <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>%</span>
                                        </div>
                                    </div>
                                    <div>
                                        <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>AS OF</span>
                                        <input type="date" value={financialConfig?.creditScoreDate || ""} onChange={e => setFinancialConfig({ ...financialConfig, creditScoreDate: e.target.value })}
                                            style={{ width: "100%", padding: "10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12 }} />
                                    </div>
                                </div>
                                {
                                    financialConfig?.creditScore && (
                                        <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: T.radius.md, background: financialConfig.creditScore >= 740 ? T.status.greenDim : financialConfig.creditScore >= 670 ? T.status.amberDim : T.status.redDim, border: `1px solid ${financialConfig.creditScore >= 740 ? T.status.green : financialConfig.creditScore >= 670 ? T.status.amber : T.status.red}20` }}>
                                            <span style={{ fontSize: 10, fontWeight: 700, color: financialConfig.creditScore >= 740 ? T.status.green : financialConfig.creditScore >= 670 ? T.status.amber : T.status.red, fontFamily: T.font.mono }}>
                                                {financialConfig.creditScore >= 800 ? "EXCEPTIONAL" : financialConfig.creditScore >= 740 ? "VERY GOOD" : financialConfig.creditScore >= 670 ? "GOOD" : financialConfig.creditScore >= 580 ? "FAIR" : "POOR"} · {financialConfig.creditScore}
                                            </span>
                                        </div>
                                    )
                                }
                            </div>
                        </div>

                        {/* Targets & Baselines (Combined with Targets & Limits) */}
                        <div style={{ display: financeTab === "targets" ? "flex" : "none", flexDirection: "column", gap: 16 }}>
                            <div style={{ background: T.bg.card, borderRadius: T.radius.xl, padding: 20, border: `1px solid ${T.border.subtle}`, boxShadow: `0 4px 20px #00000010` }}>
                                <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: T.text.primary, borderBottom: `1px solid ${T.border.subtle}`, paddingBottom: 10 }}>Targets & Baselines</h3>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                                    <div>
                                        <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>WEEKLY SPEND</span>
                                        <div style={{ position: "relative" }}>
                                            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>$</span>
                                            <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={financialConfig?.weeklySpendAllowance || ""} onChange={e => setFinancialConfig({ ...financialConfig, weeklySpendAllowance: parseFloat(e.target.value) || 0 })}
                                                style={{ width: "100%", padding: "12px 12px 12px 24px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontFamily: T.font.mono }} />
                                        </div>
                                    </div>
                                    <div>
                                        <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}><InlineTooltip term="Floor">CHECKING FLOOR</InlineTooltip></span>
                                        <div style={{ position: "relative" }}>
                                            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>$</span>
                                            <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={financialConfig?.emergencyFloor || ""} onChange={e => setFinancialConfig({ ...financialConfig, emergencyFloor: parseFloat(e.target.value) || 0 })}
                                                style={{ width: "100%", padding: "12px 12px 12px 24px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontFamily: T.font.mono }} />
                                        </div>
                                        <p style={{ fontSize: 10, color: T.text.muted, marginTop: 4, lineHeight: 1.3 }}>Goal: minimum checking balance to maintain.</p>
                                    </div>
                                </div>
                                {/* Tax Bracket & Minimum Cash Floor */}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                                    <div>
                                        <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>TAX BRACKET %</span>
                                        <div style={{ position: "relative" }}>
                                            <input type="number" inputMode="decimal" pattern="[0-9]*" step="1" min="0" max="50" value={financialConfig?.taxBracketPercent || ""} onChange={e => setFinancialConfig({ ...financialConfig, taxBracketPercent: parseFloat(e.target.value) || 0 })}
                                                placeholder="e.g. 22" style={{ width: "100%", padding: "12px 24px 12px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontFamily: T.font.mono }} />
                                            <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>%</span>
                                        </div>
                                        <p style={{ fontSize: 10, color: T.text.muted, marginTop: 4, lineHeight: 1.3 }}>Federal bracket (post-tax paychecks already assumed).</p>
                                    </div>
                                    <div>
                                        <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}><InlineTooltip term="Floor">MIN LIQUIDITY</InlineTooltip></span>
                                        <div style={{ position: "relative" }}>
                                            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>$</span>
                                            <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={financialConfig?.minCashFloor || ""} onChange={e => setFinancialConfig({ ...financialConfig, minCashFloor: parseFloat(e.target.value) || 0 })}
                                                placeholder="e.g. 1000" style={{ width: "100%", padding: "12px 12px 12px 24px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontFamily: T.font.mono }} />
                                        </div>
                                        <p style={{ fontSize: 10, color: T.text.muted, marginTop: 4, lineHeight: 1.3 }}>Hard floor: AI will never drop total liquid cash below this.</p>
                                    </div>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                                    <div>
                                        <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>GREEN TARGET</span>
                                        <div style={{ position: "relative" }}>
                                            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>$</span>
                                            <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={financialConfig?.greenStatusTarget || ""} onChange={e => setFinancialConfig({ ...financialConfig, greenStatusTarget: parseFloat(e.target.value) || 0 })}
                                                style={{ width: "100%", padding: "12px 12px 12px 24px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontFamily: T.font.mono }} />
                                        </div>
                                    </div>
                                    <div>
                                        <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>EMERGENCY FUND</span>
                                        <div style={{ position: "relative" }}>
                                            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>$</span>
                                            <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={financialConfig?.emergencyReserveTarget || ""} onChange={e => setFinancialConfig({ ...financialConfig, emergencyReserveTarget: parseFloat(e.target.value) || 0 })}
                                                style={{ width: "100%", padding: "12px 12px 12px 24px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontFamily: T.font.mono }} />
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                    <div>
                                        <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>DEFAULT APR</span>
                                        <div style={{ position: "relative" }}>
                                            <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={financialConfig?.defaultAPR || ""} onChange={e => setFinancialConfig({ ...financialConfig, defaultAPR: parseFloat(e.target.value) || 0 })}
                                                style={{ width: "100%", padding: "12px 24px 12px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontFamily: T.font.mono }} />
                                            <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>%</span>
                                        </div>
                                    </div>
                                    <div>
                                        <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>ARBITRAGE TARGET APR</span>
                                        <div style={{ position: "relative" }}>
                                            <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={financialConfig?.arbitrageTargetAPR || ""} onChange={e => setFinancialConfig({ ...financialConfig, arbitrageTargetAPR: parseFloat(e.target.value) || 0 })}
                                                style={{ width: "100%", padding: "12px 24px 12px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontFamily: T.font.mono }} />
                                            <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>%</span>
                                        </div>
                                        <div style={{ fontSize: 10, color: T.text.muted, marginTop: 4 }}>Surplus routed to investing if debt APR is below this</div>
                                    </div>
                                </div>
                            </div>

                            {/* Tax Withholding */}
                            <div style={{ background: T.bg.card, borderRadius: T.radius.xl, padding: 20, border: `1px solid ${T.border.subtle}`, boxShadow: `0 4px 20px #00000010` }}>
                                <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: T.text.primary, borderBottom: `1px dashed ${T.border.subtle}`, paddingBottom: 10 }}>Tax & Withholding</h3>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
                                    <div>
                                        <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block" }}>SELF-EMPLOYED / CONTRACTOR</span>
                                        <span style={{ fontSize: 10, color: T.text.muted }}>Enable for quarterly tax estimates</span>
                                    </div>
                                    <button onClick={() => setFinancialConfig({ ...financialConfig, isContractor: !financialConfig?.isContractor })} style={{
                                        width: 56, height: 28, borderRadius: 999,
                                        border: `1px solid ${financialConfig?.isContractor ? T.accent.primary : T.border.default}`,
                                        background: financialConfig?.isContractor ? T.accent.primaryDim : T.bg.elevated,
                                        position: "relative", cursor: "pointer"
                                    }}>
                                        <div style={{
                                            width: 22, height: 22, borderRadius: 999,
                                            background: financialConfig?.isContractor ? T.accent.primary : T.bg.card,
                                            position: "absolute", top: 2, left: financialConfig?.isContractor ? 30 : 4,
                                            transition: "all .2s"
                                        }} />
                                    </button>
                                </div>
                                {
                                    financialConfig?.isContractor && (
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                            <div>
                                                <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>WITHHOLDING RATE</span>
                                                <div style={{ position: "relative" }}>
                                                    <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.1" value={financialConfig?.taxWithholdingRate || ""} onChange={e => setFinancialConfig({ ...financialConfig, taxWithholdingRate: parseFloat(e.target.value) || 0 })}
                                                        style={{ width: "100%", padding: "12px 24px 12px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontFamily: T.font.mono }} />
                                                    <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>%</span>
                                                </div>
                                            </div>
                                            <div>
                                                <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>QUARTERLY ESTIMATE</span>
                                                <div style={{ position: "relative" }}>
                                                    <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>$</span>
                                                    <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={financialConfig?.quarterlyTaxEstimate || ""} onChange={e => setFinancialConfig({ ...financialConfig, quarterlyTaxEstimate: parseFloat(e.target.value) || 0 })}
                                                        style={{ width: "100%", padding: "12px 12px 12px 24px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontFamily: T.font.mono }} />
                                                </div>
                                                <p style={{ fontSize: 10, color: T.text.muted, marginTop: 4 }}>Due: Apr 15, Jun 15, Sep 15, Jan 15</p>
                                            </div>
                                        </div>
                                    )
                                }
                            </div>
                        </div>
                        {/* Personal Rules (Combined with Rules & Advanced) */}
                        <div style={{ display: financeTab === "rules" ? "block" : "none" }}>
                            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: T.status.blue, borderBottom: `1px solid ${T.status.blue}30`, paddingBottom: 6 }}>Personal Rules (Private)</h3>
                            <p style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.6, marginBottom: 10 }}>
                                Optional: paste your private rules here. This is stored locally and appended to the AI system prompt.
                                Clear this field before publishing or sharing the app.
                            </p>
                            <textarea
                                value={personalRules || ""}
                                onChange={e => setPersonalRules(e.target.value)}
                                placeholder="Paste private rules here..."
                                style={{
                                    width: "100%", height: 140, padding: 12, borderRadius: T.radius.md,
                                    border: `1px solid ${T.border.default}`, background: T.bg.elevated, boxSizing: "border-box",
                                    color: T.text.primary, fontSize: 11, fontFamily: T.font.mono, resize: "none"
                                }}
                            />
                            {
                                personalRules && <button onClick={() => setPersonalRules("")} style={{
                                    marginTop: 8, padding: "8px 12px", borderRadius: T.radius.md, width: "100%",
                                    border: `1px solid ${T.border.default}`, background: "transparent",
                                    color: T.text.secondary, fontSize: 11, fontWeight: 700, cursor: "pointer"
                                }}>Clear Personal Rules</button>
                            }
                        </div>

                        {/* AI Persona Picker */}
                        <div style={{ display: financeTab === "rules" ? "block" : "none" }}>
                            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: T.accent.primary, borderBottom: `1px solid ${T.accent.primary}30`, paddingBottom: 6 }}>AI Personality</h3>
                            <p style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.6, marginBottom: 12 }}>
                                Choose how your financial advisor communicates. This adjusts the AI's tone — not its accuracy.
                            </p>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                {[
                                    { id: null, emoji: "⚖️", name: "Default", sub: "Balanced & professional" },
                                    { id: "coach", emoji: "🪖", name: "Strict Coach", sub: "Direct, no-nonsense" },
                                    { id: "friend", emoji: "🤗", name: "Supportive", sub: "Warm & encouraging" },
                                    { id: "nerd", emoji: "🤓", name: "Data Nerd", sub: "Stats & percentages" },
                                ].map(p => {
                                    const active = persona === p.id;
                                    return <button key={p.name} onClick={() => { setPersona(p.id); db.set("ai-persona", p.id); }}
                                        style={{
                                            padding: "12px 10px", borderRadius: T.radius.md, cursor: "pointer",
                                            border: `1.5px solid ${active ? T.accent.primary : T.border.default}`,
                                            background: active ? `${T.accent.primary}12` : T.bg.elevated,
                                            textAlign: "center", transition: "all 0.2s ease"
                                        }}>
                                        <div style={{ fontSize: 24, marginBottom: 4 }}>{p.emoji}</div>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: active ? T.accent.primary : T.text.primary }}>{p.name}</div>
                                        <div style={{ fontSize: 10, color: T.text.dim, marginTop: 2 }}>{p.sub}</div>
                                    </button>;
                                })}
                            </div>
                        </div>

                        {/* Big Bill Lookout Window (Combined with Rules & Advanced) */}
                        <div style={{ display: financeTab === "rules" ? "block" : "none" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${T.status.amber}30`, paddingBottom: 6, marginBottom: financialConfig?.enableHeavyHorizon ? 12 : 0 }}>
                                <div style={{ flex: 1, paddingRight: 12 }}>
                                    <h3 style={{ fontSize: 13, fontWeight: 700, color: T.status.amber, marginBottom: 2 }}>Big Bill Lookout Window</h3>
                                    <p style={{ fontSize: 10, color: T.text.muted, lineHeight: 1.4, margin: 0 }}>If a large expense is coming soon, the AI will hold off on aggressive debt payoffs to protect your cash.</p>
                                </div>
                                <Toggle value={financialConfig?.enableHeavyHorizon} onChange={v => setFinancialConfig({ ...financialConfig, enableHeavyHorizon: v })} />
                            </div>
                            {
                                financialConfig?.enableHeavyHorizon && (
                                    <div style={{ marginTop: 12 }}>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                                            <div>
                                                <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>START DAY</span>
                                                <input type="number" inputMode="decimal" pattern="[0-9]*" value={financialConfig?.heavyHorizonStart || ""} onChange={e => setFinancialConfig({ ...financialConfig, heavyHorizonStart: parseInt(e.target.value) || 0 })}
                                                    style={{ width: "100%", padding: "10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12 }} />
                                            </div>
                                            <div>
                                                <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>END DAY</span>
                                                <input type="number" inputMode="decimal" pattern="[0-9]*" value={financialConfig?.heavyHorizonEnd || ""} onChange={e => setFinancialConfig({ ...financialConfig, heavyHorizonEnd: parseInt(e.target.value) || 0 })}
                                                    style={{ width: "100%", padding: "10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12 }} />
                                            </div>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>DEFENSIVE SUM LIMIT</span>
                                            <div style={{ position: "relative" }}>
                                                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>$</span>
                                                <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={financialConfig?.heavyHorizonThreshold || ""} onChange={e => setFinancialConfig({ ...financialConfig, heavyHorizonThreshold: parseFloat(e.target.value) || 0 })}
                                                    style={{ width: "100%", padding: "10px 10px 10px 22px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12 }} />
                                            </div>
                                            <p style={{ fontSize: 10, color: T.text.muted, marginTop: 4, lineHeight: 1.4 }}>If any expense exceeds this sum within the horizon, system will block aggressive debt payoffs.</p>
                                        </div>
                                    </div>
                                )
                            }
                        </div>

                        {/* Misc (Combined with Rules & Advanced) */}
                        <div style={{ display: financeTab === "rules" ? "block" : "none" }}>

                            {/* Insurance Deductibles */}
                            <div style={{ marginBottom: 24 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${T.border.subtle}`, paddingBottom: 6, marginBottom: financialConfig?.enableInsuranceTracking ? 12 : 0 }}>
                                    <div style={{ flex: 1, paddingRight: 12 }}>
                                        <h3 style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, marginBottom: 2 }}>Insurance Deductibles</h3>
                                        <p style={{ fontSize: 10, color: T.text.muted, lineHeight: 1.4, margin: 0 }}>Factor active deductible reserves into your emergency planning.</p>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        {financialConfig?.enableInsuranceTracking && (financialConfig?.insuranceDeductibles || []).length > 0 && <button onClick={() => setEditingSection(editingSection === "insurance" ? null : "insurance")} style={{ padding: "5px 10px", borderRadius: T.radius.sm, border: `1px solid ${editingSection === "insurance" ? T.accent.primary : T.border.default}`, background: editingSection === "insurance" ? T.accent.primaryDim : "transparent", color: editingSection === "insurance" ? T.accent.primary : T.text.dim, fontSize: 10, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                                            {editingSection === "insurance" ? <><Check size={10} /> Done</> : <><Pencil size={10} /> Edit</>}
                                        </button>}
                                        <Toggle value={financialConfig?.enableInsuranceTracking} onChange={v => setFinancialConfig({ ...financialConfig, enableInsuranceTracking: v })} />
                                    </div>
                                </div>
                                {
                                    financialConfig?.enableInsuranceTracking && (
                                        <div style={{ marginTop: 12 }}>
                                            {editingSection === "insurance" || (financialConfig?.insuranceDeductibles || []).length === 0 ? <>
                                                {(financialConfig?.insuranceDeductibles || []).map((ins, i) => (
                                                    <div key={i} style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
                                                        <select value={ins.type || "health"} onChange={e => { const arr = [...(financialConfig.insuranceDeductibles || [])]; arr[i] = { ...arr[i], type: e.target.value }; setFinancialConfig({ ...financialConfig, insuranceDeductibles: arr }); }}
                                                            style={{ flex: 0.5, padding: "8px 6px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 10 }}>
                                                            {["health", "auto", "home", "renters", "life", "other"].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                                                        </select>
                                                        <div style={{ position: "relative", flex: 0.5 }}>
                                                            <span style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 10, fontWeight: 600 }}>$</span>
                                                            <input type="number" inputMode="decimal" pattern="[0-9]*" value={ins.deductible || ""} onChange={e => { const arr = [...(financialConfig.insuranceDeductibles || [])]; arr[i] = { ...arr[i], deductible: parseFloat(e.target.value) || 0 }; setFinancialConfig({ ...financialConfig, insuranceDeductibles: arr }); }}
                                                                placeholder="Deductible" style={{ width: "100%", padding: "8px 6px 8px 16px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 10 }} />
                                                        </div>
                                                        <div style={{ position: "relative", flex: 0.5 }}>
                                                            <span style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 10, fontWeight: 600 }}>$</span>
                                                            <input type="number" inputMode="decimal" pattern="[0-9]*" value={ins.annualPremium || ""} onChange={e => { const arr = [...(financialConfig.insuranceDeductibles || [])]; arr[i] = { ...arr[i], annualPremium: parseFloat(e.target.value) || 0 }; setFinancialConfig({ ...financialConfig, insuranceDeductibles: arr }); }}
                                                                placeholder="Premium/yr" style={{ width: "100%", padding: "8px 6px 8px 16px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 10 }} />
                                                        </div>
                                                        <button onClick={() => { const arr = (financialConfig.insuranceDeductibles || []).filter((_, j) => j !== i); setFinancialConfig({ ...financialConfig, insuranceDeductibles: arr }); }}
                                                            style={{ width: 28, height: 28, borderRadius: T.radius.sm, border: "none", background: T.status.redDim, color: T.status.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>×</button>
                                                    </div>
                                                ))}
                                                <button onClick={() => { setEditingSection("insurance"); setFinancialConfig({ ...financialConfig, insuranceDeductibles: [...(financialConfig.insuranceDeductibles || []), { type: "health", deductible: 0, annualPremium: 0 }] }); }}
                                                    style={{ padding: "8px 14px", borderRadius: T.radius.md, border: `1px dashed ${T.border.default}`, background: "transparent", color: T.accent.primary, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: T.font.mono, width: "100%", marginBottom: 16 }}>+ ADD INSURANCE</button>
                                            </> : <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                                                {(financialConfig?.insuranceDeductibles || []).map((ins, i) => (
                                                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: T.radius.md, background: T.bg.elevated, border: `1px solid ${T.border.default}` }}>
                                                        <span style={{ fontSize: 12, fontWeight: 600, color: T.text.primary, textTransform: "capitalize" }}>{ins.type || "Health"}</span>
                                                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                            <span style={{ fontSize: 10, color: T.text.muted, fontFamily: T.font.mono }}>Ded: ${(ins.deductible || 0).toLocaleString()}</span>
                                                            <span style={{ fontSize: 10, color: T.text.muted, fontFamily: T.font.mono }}>${(ins.annualPremium || 0).toLocaleString()}/yr</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>}
                                        </div>
                                    )
                                }
                            </div>

                            {/* Big Ticket Purchase Planner */}
                            <div style={{ marginBottom: 24 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${T.border.subtle}`, paddingBottom: 6, marginBottom: financialConfig?.enableBigTicketPlanner ? 12 : 0 }}>
                                    <div style={{ flex: 1, paddingRight: 12 }}>
                                        <h3 style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, marginBottom: 2 }}>Big-Ticket Purchase Planner</h3>
                                        <p style={{ fontSize: 10, color: T.text.muted, lineHeight: 1.4, margin: 0 }}>Project readiness dates for major purchases into your timeline radar.</p>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        {financialConfig?.enableBigTicketPlanner && (financialConfig?.bigTicketItems || []).length > 0 && <button onClick={() => setEditingSection(editingSection === "bigticket" ? null : "bigticket")} style={{ padding: "5px 10px", borderRadius: T.radius.sm, border: `1px solid ${editingSection === "bigticket" ? T.accent.primary : T.border.default}`, background: editingSection === "bigticket" ? T.accent.primaryDim : "transparent", color: editingSection === "bigticket" ? T.accent.primary : T.text.dim, fontSize: 10, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                                            {editingSection === "bigticket" ? <><Check size={10} /> Done</> : <><Pencil size={10} /> Edit</>}
                                        </button>}
                                        <Toggle value={financialConfig?.enableBigTicketPlanner} onChange={v => setFinancialConfig({ ...financialConfig, enableBigTicketPlanner: v })} />
                                    </div>
                                </div>
                                {
                                    financialConfig?.enableBigTicketPlanner && (
                                        <div style={{ marginTop: 12 }}>
                                            {editingSection === "bigticket" || (financialConfig?.bigTicketItems || []).length === 0 ? <>
                                                {(financialConfig?.bigTicketItems || []).map((item, i) => (
                                                    <div key={i} style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
                                                        <input value={item.name || ""} onChange={e => { const arr = [...(financialConfig.bigTicketItems || [])]; arr[i] = { ...arr[i], name: e.target.value }; setFinancialConfig({ ...financialConfig, bigTicketItems: arr }); }}
                                                            placeholder="Item name" style={{ flex: 1, padding: "8px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 11 }} />
                                                        <div style={{ position: "relative", flex: 0.5 }}>
                                                            <span style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 10, fontWeight: 600 }}>$</span>
                                                            <input type="number" inputMode="decimal" pattern="[0-9]*" value={item.cost || ""} onChange={e => { const arr = [...(financialConfig.bigTicketItems || [])]; arr[i] = { ...arr[i], cost: parseFloat(e.target.value) || 0 }; setFinancialConfig({ ...financialConfig, bigTicketItems: arr }); }}
                                                                placeholder="Cost" style={{ width: "100%", padding: "8px 6px 8px 16px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 10 }} />
                                                        </div>
                                                        <input type="date" value={item.targetDate || ""} onChange={e => { const arr = [...(financialConfig.bigTicketItems || [])]; arr[i] = { ...arr[i], targetDate: e.target.value }; setFinancialConfig({ ...financialConfig, bigTicketItems: arr }); }}
                                                            style={{ flex: 0.5, padding: "8px 6px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 10 }} />
                                                        <select value={item.priority || "medium"} onChange={e => { const arr = [...(financialConfig.bigTicketItems || [])]; arr[i] = { ...arr[i], priority: e.target.value }; setFinancialConfig({ ...financialConfig, bigTicketItems: arr }); }}
                                                            style={{ flex: 0.35, padding: "8px 4px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 11 }}>
                                                            {["high", "medium", "low"].map(p => <option key={p} value={p}>{p}</option>)}
                                                        </select>
                                                        <button onClick={() => { const arr = (financialConfig.bigTicketItems || []).filter((_, j) => j !== i); setFinancialConfig({ ...financialConfig, bigTicketItems: arr }); }}
                                                            style={{ width: 28, height: 28, borderRadius: T.radius.sm, border: "none", background: T.status.redDim, color: T.status.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>×</button>
                                                    </div>
                                                ))}
                                                <button onClick={() => { setEditingSection("bigticket"); setFinancialConfig({ ...financialConfig, bigTicketItems: [...(financialConfig.bigTicketItems || []), { name: "", cost: 0, targetDate: "", priority: "medium" }] }); }}
                                                    style={{ padding: "8px 14px", borderRadius: T.radius.md, border: `1px dashed ${T.border.default}`, background: "transparent", color: T.accent.primary, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: T.font.mono, width: "100%", marginBottom: 16 }}>+ ADD ITEM</button>
                                            </> : <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                                                {(financialConfig?.bigTicketItems || []).map((item, i) => {
                                                    const pc = { high: T.status.red, medium: T.status.amber, low: T.text.dim };
                                                    return <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: T.radius.md, background: T.bg.elevated, border: `1px solid ${T.border.default}` }}>
                                                        <div>
                                                            <span style={{ fontSize: 12, fontWeight: 600, color: T.text.primary }}>{item.name || "Unnamed"}</span>
                                                            {item.targetDate && <span style={{ fontSize: 9, color: T.text.muted, fontFamily: T.font.mono, marginLeft: 8 }}>{item.targetDate}</span>}
                                                        </div>
                                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                            <span style={{ fontSize: 11, fontWeight: 700, color: T.accent.primary, fontFamily: T.font.mono }}>${(item.cost || 0).toLocaleString()}</span>
                                                            <span style={{ fontSize: 8, fontWeight: 700, color: pc[item.priority] || T.text.dim, textTransform: "uppercase", fontFamily: T.font.mono, padding: "2px 5px", borderRadius: 3, background: `${pc[item.priority] || T.text.dim}15` }}>{item.priority || "medium"}</span>
                                                        </div>
                                                    </div>;
                                                })}
                                            </div>}
                                        </div>
                                    )
                                }
                            </div>

                            {/* Habit Tracking Constraints */}
                            <div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${T.border.subtle}`, paddingBottom: 6, marginBottom: financialConfig?.enableHabitTracking ? 12 : 0 }}>
                                    <div style={{ flex: 1, paddingRight: 12 }}>
                                        <h3 style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, marginBottom: 2 }}>Habit Tracking Constraints</h3>
                                        <p style={{ fontSize: 10, color: T.text.muted, lineHeight: 1.4, margin: 0 }}>Track recurring consumable purchases to manage restock timing and burn rate.</p>
                                    </div>
                                    <Toggle value={financialConfig?.enableHabitTracking} onChange={v => setFinancialConfig({ ...financialConfig, enableHabitTracking: v })} />
                                </div>
                                {
                                    financialConfig?.enableHabitTracking && (
                                        <div style={{ marginTop: 12 }}>
                                            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 12 }}>
                                                <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                                                    <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>TRACK HABIT</span>
                                                    <div style={{
                                                        display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px",
                                                        borderRadius: T.radius.md, border: `1px solid ${financialConfig?.trackHabits !== false ? T.accent.primary : T.border.default}`,
                                                        background: financialConfig?.trackHabits !== false ? T.accent.primaryDim : T.bg.elevated, cursor: "pointer"
                                                    }} onClick={() => setFinancialConfig({ ...financialConfig, trackHabits: financialConfig?.trackHabits === false ? true : false })}>
                                                        <span style={{ fontSize: 12, fontWeight: 600, color: financialConfig?.trackHabits !== false ? T.accent.primary : T.text.primary }}>
                                                            {financialConfig?.trackHabits !== false ? "YES" : "NO"}
                                                        </span>
                                                        <div style={{
                                                            width: 36, height: 20, borderRadius: 10, background: financialConfig?.trackHabits !== false ? T.accent.primary : T.bg.card,
                                                            position: "relative", transition: "all 0.2s"
                                                        }}>
                                                            <div style={{
                                                                width: 16, height: 16, borderRadius: 8, background: "#FFF", position: "absolute",
                                                                top: 2, left: financialConfig?.trackHabits !== false ? 18 : 2, transition: "all 0.2s",
                                                                boxShadow: "0 1px 3px rgba(0,0,0,0.3)"
                                                            }} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {financialConfig?.trackHabits !== false && (
                                                <div style={{ padding: 16, borderTop: `1px solid ${T.border.default}`, background: `${T.accent.primary}05` }}>
                                                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                                                        <div>
                                                            <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.text.secondary, marginBottom: 8 }}>Habit Name</div>
                                                            <input type="text" value={financialConfig?.habitName || ""} onChange={e => setFinancialConfig({ ...financialConfig, habitName: e.target.value })}
                                                                style={{ width: "100%", background: T.bg.elevated, color: T.text.primary, border: `1px solid ${T.border.default}`, borderRadius: T.radius.md, padding: "10px 12px", fontSize: 13 }} placeholder="e.g. Coffee Pods" />
                                                        </div>
                                                        <div>
                                                            <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.text.secondary, marginBottom: 8 }}>Restock Cost</div>
                                                            <div style={{ position: "relative" }}>
                                                                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>$</span>
                                                                <input type="number" inputMode="decimal" pattern="[0-9]*" value={financialConfig?.habitRestockCost || ""} onChange={e => setFinancialConfig({ ...financialConfig, habitRestockCost: parseFloat(e.target.value) || 0 })}
                                                                    style={{ width: "100%", background: T.bg.elevated, color: T.text.primary, border: `1px solid ${T.border.default}`, borderRadius: T.radius.md, padding: "10px 12px 10px 24px", fontSize: 13 }} placeholder="e.g. 25" />
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.text.secondary, marginBottom: 8 }}>Warning Threshold (Days/Units)</div>
                                                            <input type="number" inputMode="decimal" pattern="[0-9]*" value={financialConfig?.habitCheckThreshold || ""} onChange={e => setFinancialConfig({ ...financialConfig, habitCheckThreshold: parseInt(e.target.value) || 0 })}
                                                                style={{ width: "100%", background: T.bg.elevated, color: T.text.primary, border: `1px solid ${T.border.default}`, borderRadius: T.radius.md, padding: "10px 12px", fontSize: 13 }} />
                                                        </div>
                                                        <div>
                                                            <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.status.red, marginBottom: 8 }}>Critical Threshold (Days/Units)</div>
                                                            <input type="number" inputMode="decimal" pattern="[0-9]*" value={financialConfig?.habitCriticalThreshold || ""} onChange={e => setFinancialConfig({ ...financialConfig, habitCriticalThreshold: parseInt(e.target.value) || 0 })}
                                                                style={{ width: "100%", background: T.status.redDim, color: T.status.red, border: `1px solid ${T.status.red}40`, borderRadius: T.radius.md, padding: "10px 12px", fontSize: 13 }} />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                }
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div> {/* close animation wrapper */}
    </div>;
}
