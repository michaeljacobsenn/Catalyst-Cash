import { useState, useEffect, useRef, useCallback } from "react";
import { Eye, EyeOff, ArrowLeft, Cloud, Download, Upload, CheckCircle, AlertTriangle, ChevronDown, Loader2, ExternalLink, Pencil, Check, ChevronRight, Shield, Cpu, Target, Briefcase, Landmark, Database, Lock, Settings, Info } from "lucide-react";
import { T } from "../constants.js";
import { AI_PROVIDERS, getProvider } from "../providers.js";
import { getLogsAsText, clearLogs } from "../logger.js";
import { Card, Label } from "../ui.jsx";
import { Mono } from "../components.jsx";
import { db, FaceId, nativeExport, fmt } from "../utils.js";
import { fetchMarketPrices, POPULAR_CRYPTO, POPULAR_FUNDS } from "../marketData.js";
import SearchableSelect from "../SearchableSelect.jsx";
import { encrypt, decrypt, isEncrypted } from "../crypto.js";
import { isSecuritySensitiveKey } from "../securityKeys.js";
import { haptic } from "../haptics.js";
import { SignInWithApple } from "@capacitor-community/apple-sign-in";
import { Capacitor } from "@capacitor/core";

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
    const backup = { app: "Catalyst Cash", version: "1.3.1-BETA", exportedAt: new Date().toISOString(), data: {} };

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

export default function SettingsTab({ apiKey, setApiKey, onClear, onFactoryReset,
    useStreaming, setUseStreaming, onBack, onRestoreComplete, onShowGuide,
    aiProvider, setAiProvider, aiModel, setAiModel,
    financialConfig, setFinancialConfig,
    personalRules, setPersonalRules,
    requireAuth, setRequireAuth, appPasscode, setAppPasscode, useFaceId, setUseFaceId,
    lockTimeout = 0, setLockTimeout,
    appleLinkedId, setAppleLinkedId,
    notifPermission = "prompt",
    persona, setPersona, proEnabled = false }) {

    // Auth Plugins state management
    useEffect(() => {
        // Initialization now handled at root level in App.jsx
    }, []);

    const handleAppleSignIn = async () => {
        if (Capacitor.getPlatform() === 'web') return;
        try {
            const result = await SignInWithApple.authorize({
                clientId: 'com.jacobsen.catalystcash',
                redirectURI: 'https://com.jacobsen.catalystcash/login',
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
        setAppleLinkedId(null);
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
    const [showApiSetup, setShowApiSetup] = useState(Boolean((apiKey || "").trim()));
    const [editingSection, setEditingSection] = useState(null);
    // Holdings Auto-Track state
    const [marketPrices, setMarketPrices] = useState({});
    const [newHoldingSymbol, setNewHoldingSymbol] = useState({});
    const [newHoldingShares, setNewHoldingShares] = useState({});
    const scrollRef = useRef(null);
    const swipeTouchStart = useRef(null);
    const navDir = useRef('forward'); // tracks animation direction: 'forward' | 'back'

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

    const [refreshingPrices, setRefreshingPrices] = useState(false);
    const [lastPriceRefresh, setLastPriceRefresh] = useState(null);

    const refreshPrices = async () => {
        const holdings = financialConfig?.holdings || { roth: [], k401: [], brokerage: [], crypto: [] };
        const allSymbols = [...new Set([...(holdings.roth || []), ...(holdings.k401 || []), ...(holdings.brokerage || []), ...(holdings.crypto || [])].map(h => h.symbol))];
        if (allSymbols.length === 0) {
            if (window.toast) window.toast.warning("Add holdings first before refreshing prices.");
            return;
        }
        setRefreshingPrices(true);
        try {
            const prices = await fetchMarketPrices(allSymbols);
            const count = Object.keys(prices).length;
            if (count > 0) {
                setMarketPrices(prices);
                setLastPriceRefresh(Date.now());
                if (window.toast) window.toast.success(`Updated ${count} price${count !== 1 ? "s" : ""} successfully.`);
            } else {
                if (window.toast) window.toast.warning("No price data returned — check your connection.");
            }
        } catch (e) {
            console.warn("Price refresh failed:", e);
            if (window.toast) window.toast.error("Price refresh failed. Try again later.");
        }
        setRefreshingPrices(false);
    };

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
            <div style={{ textAlign: "center", flex: 1 }}>
                <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>
                    {activeMenu === "ai" ? "AI & Engine" :
                        activeMenu === "backup" ? "Backup & Data" :
                            activeMenu === "security" ? "Security" :
                                activeMenu === "income" ? "Income & Cash Flow" :
                                    activeMenu === "debts" ? "Debts & Liabilities" :
                                        activeMenu === "assets" ? "Assets & Holdings" :
                                            activeMenu === "targets" ? "Savings Targets" :
                                                activeMenu === "rules" ? "Custom Rules" :
                                                    "Settings"}
                </h1>
                {!activeMenu && <p style={{ fontSize: 10, color: T.text.dim, marginTop: 2, fontFamily: T.font.mono, margin: 0 }}>VERSION 1.3.1-BETA</p>}
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
                        {/* App Preferences */}
                        <div>
                            <span style={{ fontSize: 13, fontWeight: 800, color: T.text.secondary, marginLeft: 16, marginBottom: 8, display: "block", letterSpacing: "0.03em", textTransform: "uppercase" }}>App Preferences</span>
                            <div style={{ background: T.bg.card, borderRadius: T.radius.xl, border: `1px solid ${T.border.subtle}`, overflow: "hidden" }}>
                                {[
                                    { id: "ai", label: "AI & Engine", icon: Cpu, color: T.status.blue },
                                    { id: "backup", label: "Backup & Data", icon: Database, color: T.status.green },
                                    { id: "security", label: "Security", icon: Lock, color: T.status.red },
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

                        {/* Financial Profile */}
                        <div>
                            <span style={{ fontSize: 13, fontWeight: 800, color: T.text.secondary, marginLeft: 16, marginBottom: 8, display: "block", letterSpacing: "0.03em", textTransform: "uppercase" }}>Financial Profile</span>
                            <div style={{ background: T.bg.card, borderRadius: T.radius.xl, border: `1px solid ${T.border.subtle}`, overflow: "hidden" }}>
                                {[
                                    { id: "income", label: "Income & Cash Flow", icon: Briefcase, color: T.accent.emerald },
                                    { id: "debts", label: "Debts & Liabilities", icon: Landmark, color: T.status.red },
                                    { id: "assets", label: "Assets & Holdings", icon: Database, color: T.accent.primary },
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
                                const locked = isPro && !proEnabled;
                                return <button key={m.id} onClick={() => { if (!locked) { setAiModel(m.id); setAiProvider("backend"); } }} style={{
                                    padding: "10px 14px", borderRadius: T.radius.md,
                                    border: `1.5px solid ${active ? T.accent.primary : T.border.default}`,
                                    background: active ? T.accent.primaryDim : T.bg.elevated,
                                    textAlign: "left", cursor: locked ? "default" : "pointer",
                                    opacity: locked ? 0.5 : 1,
                                    display: "flex", justifyContent: "space-between", alignItems: "center",
                                    transition: "all .2s ease",
                                }}>
                                    <div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                            <span style={{ fontSize: 13, fontWeight: active ? 700 : 600, color: active ? T.accent.primary : T.text.primary }}>{m.name}</span>
                                            {isPro && <span style={{
                                                fontSize: 8, fontWeight: 800, color: "#FFD700",
                                                background: "linear-gradient(135deg, #FFD70020, #FFA50020)",
                                                border: "1px solid #FFD70030",
                                                padding: "1px 6px", borderRadius: 99, letterSpacing: "0.06em",
                                            }}>PRO</span>}
                                        </div>
                                        <span style={{ fontSize: 10, color: T.text.dim, marginTop: 2, display: "block" }}>{m.note}</span>
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

                        <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={handleExport} disabled={backupStatus === "exporting"} style={{
                                flex: 1, padding: "13px 0", borderRadius: T.radius.md,
                                border: `1px solid ${T.accent.emerald}30`, background: T.accent.emeraldDim,
                                color: T.accent.emerald, fontSize: 12, fontWeight: 700,
                                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                fontFamily: T.font.mono, transition: "all .2s", opacity: backupStatus === "exporting" ? 0.7 : 1
                            }}>
                                {backupStatus === "exporting" ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
                                EXPORT JSON
                            </button>
                            <div style={{ flex: 1, position: "relative" }}>
                                <input type="file" accept=".json" onChange={handleImport} disabled={restoreStatus === "restoring"}
                                    style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", zIndex: 2 }} />
                                <div style={{
                                    width: "100%", height: "100%", borderRadius: T.radius.md,
                                    border: `1px solid ${T.border.default}`, background: T.bg.elevated,
                                    color: T.text.primary, fontSize: 12, fontWeight: 700,
                                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                    fontFamily: T.font.mono, transition: "all .2s", opacity: restoreStatus === "restoring" ? 0.7 : 1
                                }}>
                                    {restoreStatus === "restoring" ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
                                    RESTORE
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
                                <button onClick={async () => {
                                    await clearLogs();
                                    setStatusMsg("Debug log cleared.");
                                }} style={{
                                    padding: "10px 14px", borderRadius: T.radius.md,
                                    border: `1px solid ${T.border.default}`, background: "transparent",
                                    color: T.text.dim, fontSize: 12, fontWeight: 700,
                                    fontFamily: T.font.mono, cursor: "pointer", transition: "all .2s"
                                }}>
                                    CLEAR
                                </button>
                            </div>
                        </div>

                        {/* ── Auto-Backup ────────────────────────────────────── */}
                        <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${T.border.subtle}` }}>
                            <Label>Auto-Backup</Label>
                            <p style={{ fontSize: 11, color: T.text.muted, marginBottom: 16, lineHeight: 1.6 }}>
                                Enable Apple Sign-In to activate automatic iCloud backup. Your data is continuously saved to your private iCloud Drive, automatically restoring on any iPhone sharing your Apple ID.
                            </p>

                            {/* Apple / iCloud */}
                            <div style={{ marginBottom: 10 }}>
                                {appleLinkedId ? (
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 12, background: "#00000088", border: "1px solid rgba(255,255,255,0.1)" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                            <svg viewBox="0 0 814 1000" width="16" height="16" fill="white">
                                                <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-37.3-165.9-40.8l-1.6-.6c-67.8-2.3-113.2-63-156.5-123.1C38.5 660.9 17 570 17 479.4 17 260.9 139.3 151.1 261.7 151.1c71 0 130.5 43.3 175 43.3 42.8 0 110-45.7 192.5-45.7 31 0 108.5 4.5 168.2 55.4zm-234-181.4C505.7 101.8 557 34 557 0c0-6.4-.6-12.9-1.3-18.1-1-.3-2.1-.3-3.5-.3-44.5 0-95.8 30.2-127 71.6-27.5 34.9-49.5 83.2-49.5 131.6 0 6.4 1 12.9 1.6 15.1 2.9.6 7.1 1 11 1 40 0 87.5-27.2 115.9-60.4z" />
                                            </svg>
                                            <div>
                                                <div style={{ fontSize: 13, fontWeight: 600, color: T.text.primary }}>iCloud Backup Active</div>
                                                <div style={{ fontSize: 10, color: T.status.green, fontFamily: T.font.mono }}>✓ Auto-syncing to iCloud Drive</div>
                                            </div>
                                        </div>
                                        <button onClick={unlinkApple} style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${T.border.default}`, background: "transparent", color: T.text.muted, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>UNLINK</button>
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
                                <p style={{ fontSize: 11, color: T.text.muted, lineHeight: 1.4, marginTop: 4 }}>
                                    Your data never leaves your device unless you explicitly enable cloud sync.
                                    API requests are sent directly to your selected AI provider.
                                </p>
                            </div>
                        </div>

                    </Card>
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
                                        <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>CHECKING FLOOR</span>
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
                                        <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>MIN LIQUIDITY</span>
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

                        {/* Investments (Combined with Assets & Goals) */}
                        <div style={{ display: financeTab === "assets" ? "flex" : "none", flexDirection: "column", gap: 16 }}>
                            <div style={{ background: T.bg.card, borderRadius: T.radius.xl, padding: 20, border: `1px solid ${T.border.subtle}`, boxShadow: `0 4px 20px #00000010` }}>
                                <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: T.text.primary, borderBottom: `1px solid ${T.border.subtle}`, paddingBottom: 10 }}>Investments (Defaults)</h3>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                    <div>
                                        <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>BROKERAGE</span>
                                        <div style={{ position: "relative" }}>
                                            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>$</span>
                                            <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={financialConfig?.investmentBrokerage || ""} onChange={e => setFinancialConfig({ ...financialConfig, investmentBrokerage: parseFloat(e.target.value) || 0 })}
                                                style={{ width: "100%", padding: "12px 12px 12px 24px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontFamily: T.font.mono }} />
                                        </div>
                                    </div>
                                    <div>
                                        <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>ROTH IRA</span>
                                        <div style={{ position: "relative" }}>
                                            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>$</span>
                                            <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={financialConfig?.investmentRoth || ""} onChange={e => setFinancialConfig({ ...financialConfig, investmentRoth: parseFloat(e.target.value) || 0 })}
                                                style={{ width: "100%", padding: "12px 12px 12px 24px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontFamily: T.font.mono }} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Asset Classes for Net Worth */}
                            <div style={{ background: T.bg.card, borderRadius: T.radius.xl, padding: 20, border: `1px solid ${T.border.subtle}`, boxShadow: `0 4px 20px #00000010` }}>
                                <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: T.text.primary }}>Other Assets (Net Worth)</h3>
                                <p style={{ fontSize: 10, color: T.text.muted, marginBottom: 16, lineHeight: 1.4, borderBottom: `1px solid ${T.border.subtle}`, paddingBottom: 10 }}>Include non-liquid assets in net worth calculations.</p>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                                    <div>
                                        <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>HOME EQUITY</span>
                                        <div style={{ position: "relative" }}>
                                            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>$</span>
                                            <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={financialConfig?.homeEquity || ""} onChange={e => setFinancialConfig({ ...financialConfig, homeEquity: parseFloat(e.target.value) || 0 })}
                                                style={{ width: "100%", padding: "12px 12px 12px 24px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontFamily: T.font.mono }} />
                                        </div>
                                    </div>
                                    <div>
                                        <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>VEHICLE VALUE</span>
                                        <div style={{ position: "relative" }}>
                                            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>$</span>
                                            <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={financialConfig?.vehicleValue || ""} onChange={e => setFinancialConfig({ ...financialConfig, vehicleValue: parseFloat(e.target.value) || 0 })}
                                                style={{ width: "100%", padding: "12px 12px 12px 24px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontFamily: T.font.mono }} />
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                                    <div>
                                        <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>OTHER ASSETS</span>
                                        <div style={{ position: "relative" }}>
                                            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>$</span>
                                            <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={financialConfig?.otherAssets || ""} onChange={e => setFinancialConfig({ ...financialConfig, otherAssets: parseFloat(e.target.value) || 0 })}
                                                style={{ width: "100%", padding: "12px 12px 12px 24px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontFamily: T.font.mono }} />
                                        </div>
                                    </div>
                                    <div>
                                        <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>LABEL</span>
                                        <input value={financialConfig?.otherAssetsLabel || ""} onChange={e => setFinancialConfig({ ...financialConfig, otherAssetsLabel: e.target.value })}
                                            placeholder="e.g. Crypto, Jewelry" style={{ width: "100%", padding: "12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontFamily: T.font.mono }} />
                                    </div>
                                </div>
                                <div>
                                    <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>INVESTMENTS AS-OF DATE</span>
                                    <input type="date" value={financialConfig?.investmentsAsOfDate || ""} onChange={e => setFinancialConfig({ ...financialConfig, investmentsAsOfDate: e.target.value })}
                                        style={{ width: "100%", padding: "12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontFamily: T.font.mono }} />
                                </div>
                            </div>
                            <div style={{ background: T.bg.card, borderRadius: T.radius.xl, padding: 20, border: `1px solid ${T.border.subtle}`, boxShadow: `0 4px 20px #00000010` }}>
                                <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: T.text.primary }}>Track Roth Contributions</h3>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottom: financialConfig?.trackRothContributions ? `1px dashed ${T.border.subtle}` : "none", paddingBottom: financialConfig?.trackRothContributions ? 16 : 0, marginBottom: financialConfig?.trackRothContributions ? 16 : 0 }}>
                                    <span style={{ fontSize: 10, color: T.text.muted }}>Include YTD limits & balances in your financial snapshots.</span>
                                    <button onClick={() => setFinancialConfig({ ...financialConfig, trackRothContributions: !financialConfig?.trackRothContributions })} style={{
                                        width: 56, height: 28, borderRadius: 999,
                                        border: `1px solid ${financialConfig?.trackRothContributions ? T.accent.primary : T.border.default}`,
                                        background: financialConfig?.trackRothContributions ? T.accent.primaryDim : T.bg.elevated,
                                        position: "relative", cursor: "pointer", flexShrink: 0
                                    }}>
                                        <div style={{
                                            width: 22, height: 22, borderRadius: 999,
                                            background: financialConfig?.trackRothContributions ? T.accent.primary : T.bg.card,
                                            position: "absolute", top: 2, left: financialConfig?.trackRothContributions ? 30 : 4,
                                            transition: "all .2s"
                                        }} />
                                    </button>
                                </div>
                                {
                                    financialConfig?.trackRothContributions && (
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                            <div>
                                                <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>ROTH YTD CONTRIBUTED</span>
                                                <div style={{ position: "relative" }}>
                                                    <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>$</span>
                                                    <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={financialConfig?.rothContributedYTD || ""} onChange={e => setFinancialConfig({ ...financialConfig, rothContributedYTD: parseFloat(e.target.value) || 0 })}
                                                        style={{ width: "100%", padding: "12px 12px 12px 24px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontFamily: T.font.mono }} />
                                                </div>
                                                <div style={{ fontSize: 10, color: T.text.muted, marginTop: 4 }}>Manual override allowed</div>
                                            </div>
                                            <div>
                                                <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>ROTH ANNUAL LIMIT</span>
                                                <div style={{ position: "relative" }}>
                                                    <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>$</span>
                                                    <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={financialConfig?.rothAnnualLimit || ""} onChange={e => setFinancialConfig({ ...financialConfig, rothAnnualLimit: parseFloat(e.target.value) || 0 })}
                                                        placeholder="7000" style={{ width: "100%", padding: "12px 12px 12px 24px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontFamily: T.font.mono }} />
                                                </div>
                                            </div>
                                            <div style={{ gridColumn: "1 / span 2", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: T.bg.elevated, borderRadius: T.radius.md, padding: "12px 16px", border: `1px solid ${T.border.default}`, marginTop: 4 }}>
                                                <div>
                                                    <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 700, display: "block" }}>AUTO-TRACK YTD (AUDITS)</span>
                                                    <span style={{ fontSize: 10, color: T.text.muted, marginTop: 4, display: "block" }}>Disable to fully control YTD manually</span>
                                                </div>
                                                <button onClick={() => setFinancialConfig({ ...financialConfig, autoTrackRothYTD: !(financialConfig?.autoTrackRothYTD !== false) })} style={{
                                                    width: 44, height: 24, borderRadius: 999,
                                                    border: `1px solid ${(financialConfig?.autoTrackRothYTD !== false) ? T.accent.primary : T.border.default}`,
                                                    background: (financialConfig?.autoTrackRothYTD !== false) ? T.accent.primaryDim : T.bg.elevated,
                                                    position: "relative", cursor: "pointer", flexShrink: 0
                                                }}>
                                                    <div style={{
                                                        width: 18, height: 18, borderRadius: 999,
                                                        background: (financialConfig?.autoTrackRothYTD !== false) ? T.accent.primary : T.bg.card,
                                                        position: "absolute", top: 2, left: (financialConfig?.autoTrackRothYTD !== false) ? 22 : 4,
                                                        transition: "all .2s"
                                                    }} />
                                                </button>
                                            </div>
                                        </div>
                                    )
                                }
                            </div>

                            <div style={{ background: T.bg.card, borderRadius: T.radius.xl, padding: 20, border: `1px solid ${T.border.subtle}`, boxShadow: `0 4px 20px #00000010`, marginBottom: 24 }}>
                                <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: T.text.primary }}>Track 401K</h3>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottom: financialConfig?.track401k ? `1px dashed ${T.border.subtle}` : "none", paddingBottom: financialConfig?.track401k ? 16 : 0, marginBottom: financialConfig?.track401k ? 16 : 0 }}>
                                    <span style={{ fontSize: 10, color: T.text.muted }}>Include balance + YTD + limit in your financial snapshots.</span>
                                    <button onClick={() => setFinancialConfig({ ...financialConfig, track401k: !financialConfig?.track401k })} style={{
                                        width: 56, height: 28, borderRadius: 999,
                                        border: `1px solid ${financialConfig?.track401k ? T.accent.primary : T.border.default}`,
                                        background: financialConfig?.track401k ? T.accent.primaryDim : T.bg.elevated,
                                        position: "relative", cursor: "pointer", flexShrink: 0
                                    }}>
                                        <div style={{
                                            width: 22, height: 22, borderRadius: 999,
                                            background: financialConfig?.track401k ? T.accent.primary : T.bg.card,
                                            position: "absolute", top: 2, left: financialConfig?.track401k ? 30 : 4,
                                            transition: "all .2s"
                                        }} />
                                    </button>
                                </div>
                                {
                                    financialConfig?.track401k && (
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                            <div>
                                                <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>401K BALANCE</span>
                                                <div style={{ position: "relative" }}>
                                                    <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>$</span>
                                                    <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={financialConfig?.k401Balance || ""} onChange={e => setFinancialConfig({ ...financialConfig, k401Balance: parseFloat(e.target.value) || 0 })}
                                                        style={{ width: "100%", padding: "12px 12px 12px 24px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontFamily: T.font.mono }} />
                                                </div>
                                            </div>
                                            <div>
                                                <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>401K YTD CONTRIBUTED</span>
                                                <div style={{ position: "relative" }}>
                                                    <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>$</span>
                                                    <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={financialConfig?.k401ContributedYTD || ""} onChange={e => setFinancialConfig({ ...financialConfig, k401ContributedYTD: parseFloat(e.target.value) || 0 })}
                                                        style={{ width: "100%", padding: "12px 12px 12px 24px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontFamily: T.font.mono }} />
                                                </div>
                                                <div style={{ fontSize: 10, color: T.text.muted, marginTop: 4 }}>Manual override allowed</div>
                                            </div>
                                            <div style={{ gridColumn: "1 / span 2" }}>
                                                <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>401K ANNUAL LIMIT</span>
                                                <div style={{ position: "relative" }}>
                                                    <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>$</span>
                                                    <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={financialConfig?.k401AnnualLimit || ""} onChange={e => setFinancialConfig({ ...financialConfig, k401AnnualLimit: parseFloat(e.target.value) || 0 })}
                                                        style={{ width: "100%", padding: "12px 12px 12px 24px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontFamily: T.font.mono }} />
                                                </div>
                                            </div>
                                            <div style={{ gridColumn: "1 / span 2", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: T.bg.elevated, borderRadius: T.radius.md, padding: "12px 16px", border: `1px solid ${T.border.default}`, marginTop: 4 }}>
                                                <div>
                                                    <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 700, display: "block" }}>AUTO-TRACK YTD (AUDITS)</span>
                                                    <span style={{ fontSize: 10, color: T.text.muted, marginTop: 4, display: "block" }}>Disable to fully control YTD manually</span>
                                                </div>
                                                <button onClick={() => setFinancialConfig({ ...financialConfig, autoTrack401kYTD: !(financialConfig?.autoTrack401kYTD !== false) })} style={{
                                                    width: 44, height: 24, borderRadius: 999,
                                                    border: `1px solid ${(financialConfig?.autoTrack401kYTD !== false) ? T.accent.primary : T.border.default}`,
                                                    background: (financialConfig?.autoTrack401kYTD !== false) ? T.accent.primaryDim : T.bg.elevated,
                                                    position: "relative", cursor: "pointer", flexShrink: 0
                                                }}>
                                                    <div style={{
                                                        width: 18, height: 18, borderRadius: 999,
                                                        background: (financialConfig?.autoTrack401kYTD !== false) ? T.accent.primary : T.bg.card,
                                                        position: "absolute", top: 2, left: (financialConfig?.autoTrack401kYTD !== false) ? 22 : 4,
                                                        transition: "all .2s"
                                                    }} />
                                                </button>
                                            </div>

                                            {/* ── Employer Match ───────────────────────────── */}
                                            <div style={{ gridColumn: "1 / span 2", paddingTop: 16, borderTop: `1px dashed ${T.border.subtle}`, marginTop: 8 }}>
                                                <span style={{ fontSize: 11, color: T.accent.emerald, fontFamily: T.font.mono, fontWeight: 700, display: "block", marginBottom: 12 }}>EMPLOYER MATCH & ALLOCATION</span>
                                            </div>
                                            <div style={{ gridColumn: "1 / span 2", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                                <div>
                                                    <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>MATCH RATE</span>
                                                    <div style={{ position: "relative" }}>
                                                        <input type="number" inputMode="decimal" pattern="[0-9]*" step="1" min="0" max="500" value={financialConfig?.k401EmployerMatchPct ?? ""} onChange={e => setFinancialConfig({ ...financialConfig, k401EmployerMatchPct: parseFloat(e.target.value) || 0 })}
                                                            placeholder="e.g. 100" style={{ width: "100%", padding: "12px 24px 12px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontFamily: T.font.mono }} />
                                                        <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>%</span>
                                                    </div>
                                                    <p style={{ fontSize: 10, color: T.text.muted, marginTop: 4 }}>Employer matches X% of contributions</p>
                                                </div>
                                                <div>
                                                    <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>MATCH CEILING</span>
                                                    <div style={{ position: "relative" }}>
                                                        <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.5" min="0" max="100" value={financialConfig?.k401EmployerMatchLimit ?? ""} onChange={e => setFinancialConfig({ ...financialConfig, k401EmployerMatchLimit: parseFloat(e.target.value) || 0 })}
                                                            placeholder="e.g. 6" style={{ width: "100%", padding: "12px 24px 12px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontFamily: T.font.mono }} />
                                                        <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>%</span>
                                                    </div>
                                                    <p style={{ fontSize: 10, color: T.text.muted, marginTop: 4 }}>Up to X% of your salary</p>
                                                </div>
                                                <div>
                                                    <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>VESTING</span>
                                                    <div style={{ position: "relative" }}>
                                                        <input type="number" inputMode="decimal" pattern="[0-9]*" step="1" min="0" max="100" value={financialConfig?.k401VestingPct ?? 100} onChange={e => setFinancialConfig({ ...financialConfig, k401VestingPct: parseFloat(e.target.value) || 0 })}
                                                            placeholder="e.g. 100" style={{ width: "100%", padding: "12px 24px 12px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontFamily: T.font.mono }} />
                                                        <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>%</span>
                                                    </div>
                                                    <p style={{ fontSize: 10, color: T.text.muted, marginTop: 4 }}>% of matched funds you own now</p>
                                                </div>
                                                <div>
                                                    <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 6 }}>STOCK ALLOCATION</span>
                                                    <div style={{ position: "relative" }}>
                                                        <input type="number" inputMode="decimal" pattern="[0-9]*" step="5" min="0" max="100" value={financialConfig?.k401StockPct ?? 90} onChange={e => setFinancialConfig({ ...financialConfig, k401StockPct: parseFloat(e.target.value) || 0 })}
                                                            placeholder="e.g. 90" style={{ width: "100%", padding: "12px 24px 12px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontFamily: T.font.mono }} />
                                                        <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 13, fontWeight: 600 }}>%</span>
                                                    </div>
                                                    <p style={{ fontSize: 10, color: T.text.muted, marginTop: 4 }}>Equity % in your 401k</p>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                }
                            </div>
                        </div>

                        {/* Holdings Auto-Track */}
                        <div style={{ display: financeTab === "assets" ? "block" : "none" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${T.border.subtle}`, paddingBottom: 6, marginBottom: 12, marginTop: 16 }}>
                                <div style={{ flex: 1, paddingRight: 12 }}>
                                    <h3 style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, marginBottom: 2 }}>Holdings Auto-Track</h3>
                                    <p style={{ fontSize: 10, color: T.text.muted, lineHeight: 1.4, margin: 0 }}>Add tickers + shares to auto-calculate portfolio value from live market data.</p>
                                </div>
                                <button onClick={() => setFinancialConfig({ ...financialConfig, enableHoldings: !financialConfig?.enableHoldings })} style={{
                                    width: 56, height: 28, borderRadius: 999,
                                    border: `1px solid ${financialConfig?.enableHoldings ? T.accent.emerald : T.border.default}`,
                                    background: financialConfig?.enableHoldings ? `${T.accent.emerald}18` : T.bg.elevated,
                                    position: "relative", cursor: "pointer"
                                }}>
                                    <div style={{
                                        width: 22, height: 22, borderRadius: 999,
                                        background: financialConfig?.enableHoldings ? T.accent.emerald : T.bg.card,
                                        position: "absolute", top: 2, left: financialConfig?.enableHoldings ? 30 : 4,
                                        transition: "all .2s"
                                    }} />
                                </button>
                            </div>
                            {financialConfig?.enableHoldings && (() => {
                                const holdings = financialConfig?.holdings || { roth: [], k401: [], brokerage: [], crypto: [] };
                                const updateHoldings = (key, value) => setFinancialConfig({ ...financialConfig, holdings: { ...holdings, [key]: value } });
                                const addHolding = (key) => {
                                    const symbol = (newHoldingSymbol[key] || "").toUpperCase().trim();
                                    const shares = parseFloat(newHoldingShares[key] || 0);
                                    if (!symbol || !shares) return;
                                    updateHoldings(key, [...(holdings[key] || []), { symbol, shares }]);
                                    setNewHoldingSymbol(p => ({ ...p, [key]: "" }));
                                    setNewHoldingShares(p => ({ ...p, [key]: "" }));
                                };
                                const removeHolding = (key, idx) => updateHoldings(key, (holdings[key] || []).filter((_, i) => i !== idx));

                                const sections = [
                                    { key: "roth", label: "ROTH IRA", enabled: true },
                                    { key: "k401", label: "401K", enabled: financialConfig?.track401k },
                                    { key: "brokerage", label: "BROKERAGE", enabled: financialConfig?.trackBrokerage },
                                    { key: "crypto", label: "CRYPTO", enabled: true, color: T.status.amber },
                                ].filter(s => s.enabled);

                                return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                                    {/* Portfolio Summary Card */}
                                    <div style={{ background: `linear-gradient(135deg, ${T.accent.primary}15, ${T.accent.emerald}15)`, borderRadius: T.radius.xl, padding: 20, border: `1px solid ${T.border.default}`, display: "flex", flexDirection: "column", alignItems: "center" }}>
                                        <span style={{ fontSize: 11, fontWeight: 800, color: T.text.secondary, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>Tracked Portfolio Value</span>
                                        <span style={{ fontSize: 32, fontWeight: 800, color: T.text.primary, fontFamily: T.font.mono, letterSpacing: "-1px" }}>
                                            {fmt(sections.reduce((sum, s) => sum + (holdings[s.key] || []).reduce((s2, h) => s2 + ((marketPrices[h.symbol]?.price || 0) * h.shares), 0), 0))}
                                        </span>
                                    </div>

                                    {sections.map(({ key, label, color }) => {
                                        const secColor = color || T.accent.emerald;
                                        const secTotal = (holdings[key] || []).reduce((s, h) => s + ((marketPrices[h.symbol]?.price || 0) * h.shares), 0);
                                        return (
                                            <div key={key} style={{ background: T.bg.card, borderRadius: T.radius.xl, padding: 20, border: `1px solid ${secColor}30`, boxShadow: `0 4px 20px ${secColor}08` }}>
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingBottom: 10, borderBottom: `1px dashed ${T.border.subtle}` }}>
                                                    <span style={{ fontSize: 12, fontFamily: T.font.mono, fontWeight: 800, color: secColor }}>{label}</span>
                                                    <span style={{ fontSize: 12, fontFamily: T.font.mono, fontWeight: 700, color: T.text.primary }}>{fmt(secTotal)}</span>
                                                </div>

                                                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                                                    {(holdings[key] || []).map((h, i) => (
                                                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: T.bg.elevated, padding: "10px 12px", borderRadius: T.radius.md }}>
                                                            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${secColor}20`, color: secColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800 }}>
                                                                {h.symbol.charAt(0)}
                                                            </div>
                                                            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                                                                <span style={{ fontSize: 13, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.5px" }}>{h.symbol.replace("-USD", "")}</span>
                                                                <span style={{ fontSize: 11, color: T.text.muted }}>{h.shares} {key === "crypto" ? "tokens" : "shares"}</span>
                                                            </div>
                                                            {marketPrices[h.symbol] && (
                                                                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                                                                    <span style={{ fontSize: 13, color: secColor, fontFamily: T.font.mono, fontWeight: 700 }}>{fmt(marketPrices[h.symbol].price * h.shares)}</span>
                                                                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                                        <span style={{ fontSize: 10, color: T.text.muted, fontFamily: T.font.mono }}>@{fmt(marketPrices[h.symbol].price)}</span>
                                                                        {marketPrices[h.symbol].changePct != null && (
                                                                            <span style={{ fontSize: 10, fontFamily: T.font.mono, fontWeight: 700, color: marketPrices[h.symbol].changePct >= 0 ? T.status.green : T.status.red }}>
                                                                                {marketPrices[h.symbol].changePct >= 0 ? "+" : ""}{marketPrices[h.symbol].changePct.toFixed(2)}%
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            <button onClick={() => removeHolding(key, i)} style={{ width: 28, height: 28, marginLeft: 6, border: "none", background: T.status.redDim, color: T.status.red, borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><AlertTriangle size={14} /></button>
                                                        </div>
                                                    ))}
                                                </div>

                                                <div style={{ display: "flex", gap: 8 }}>
                                                    <div style={{ flex: 1 }}>
                                                        <SearchableSelect
                                                            value={newHoldingSymbol[key] || ""}
                                                            onChange={v => setNewHoldingSymbol(p => ({ ...p, [key]: v }))}
                                                            placeholder={key === "crypto" ? "Search crypto…" : "Search ticker…"}
                                                            options={[
                                                                ...(key === "crypto" ? POPULAR_CRYPTO : POPULAR_FUNDS).map(c => ({ value: c.symbol, label: `${c.symbol.replace('-USD', '')} — ${c.name}` })),
                                                                { value: "__custom__", label: "Custom ticker…" }
                                                            ]}
                                                        />
                                                    </div>
                                                    <input type="number" inputMode="decimal" value={newHoldingShares[key] || ""} onChange={e => setNewHoldingShares(p => ({ ...p, [key]: e.target.value }))} placeholder={key === "crypto" ? "Amount" : "Shares"}
                                                        style={{ width: 80, padding: "0 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12, fontFamily: T.font.mono, outline: "none" }} />
                                                    <button onClick={() => addHolding(key)} disabled={!newHoldingSymbol[key] || !newHoldingShares[key]} style={{ padding: "0 16px", borderRadius: T.radius.md, border: "none", background: (!newHoldingSymbol[key] || !newHoldingShares[key]) ? T.bg.elevated : `${secColor}20`, color: (!newHoldingSymbol[key] || !newHoldingShares[key]) ? T.text.muted : secColor, fontSize: 13, fontWeight: 700, cursor: (!newHoldingSymbol[key] || !newHoldingShares[key]) ? "not-allowed" : "pointer", transition: "all .2s" }}>Add</button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <button onClick={refreshPrices} disabled={refreshingPrices} style={{
                                        padding: "14px", borderRadius: T.radius.xl, border: `1px solid ${T.accent.emerald}30`,
                                        background: `linear-gradient(135deg, ${T.bg.elevated}, ${T.accent.emerald}10)`, color: T.accent.emerald, fontFamily: T.font.mono,
                                        fontSize: 13, fontWeight: 800, cursor: refreshingPrices ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8
                                    }}>
                                        {refreshingPrices ? <Loader2 size={16} className="spin" /> : "↻"}
                                        {refreshingPrices ? "Refreshing Market Data…" : "Refresh Live Prices"}
                                    </button>
                                    {lastPriceRefresh && <span style={{ fontSize: 11, color: T.text.muted, textAlign: "center", display: "block", marginTop: -6 }}>
                                        Last sync: {new Date(lastPriceRefresh).toLocaleString()}
                                    </span>}
                                </div>;
                            })()}
                        </div>

                        {/* Savings Goals (Combined with Assets & Goals) */}
                        <div style={{ display: financeTab === "assets" ? "block" : "none" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${T.border.subtle}`, paddingBottom: 6, marginBottom: financialConfig?.enableSavingsGoals !== false ? 12 : 0, marginTop: 16 }}>
                                <div style={{ flex: 1, paddingRight: 12 }}>
                                    <h3 style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, marginBottom: 2 }}>Savings Goals</h3>
                                    <p style={{ fontSize: 10, color: T.text.muted, lineHeight: 1.4, margin: 0 }}>Track progress toward specific goals. The AI will pace your funding.</p>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    {financialConfig?.enableSavingsGoals !== false && (financialConfig?.savingsGoals || []).length > 0 && <button onClick={() => setEditingSection(editingSection === "savings" ? null : "savings")} style={{ padding: "5px 10px", borderRadius: T.radius.sm, border: `1px solid ${editingSection === "savings" ? T.accent.primary : T.border.default}`, background: editingSection === "savings" ? T.accent.primaryDim : "transparent", color: editingSection === "savings" ? T.accent.primary : T.text.dim, fontSize: 10, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                                        {editingSection === "savings" ? <><Check size={10} /> Done</> : <><Pencil size={10} /> Edit</>}
                                    </button>}
                                    <Toggle value={financialConfig?.enableSavingsGoals} onChange={v => setFinancialConfig({ ...financialConfig, enableSavingsGoals: v })} />
                                </div>
                            </div>
                            {
                                financialConfig?.enableSavingsGoals !== false && (
                                    <div style={{ marginTop: 12 }}>
                                        {editingSection === "savings" || (financialConfig?.savingsGoals || []).length === 0 ? <>
                                            {(financialConfig?.savingsGoals || []).map((goal, i) => (
                                                <div key={i} style={{ background: T.bg.elevated, borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, padding: 10, marginBottom: 8 }}>
                                                    <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                                                        <input value={goal.name || ""} onChange={e => { const arr = [...(financialConfig.savingsGoals || [])]; arr[i] = { ...arr[i], name: e.target.value }; setFinancialConfig({ ...financialConfig, savingsGoals: arr }); }}
                                                            placeholder="Goal name (e.g. Vacation)" style={{ flex: 1, padding: "8px 10px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontSize: 11 }} />
                                                        <button onClick={() => { const arr = (financialConfig.savingsGoals || []).filter((_, j) => j !== i); setFinancialConfig({ ...financialConfig, savingsGoals: arr }); }}
                                                            style={{ width: 28, height: 28, borderRadius: T.radius.sm, border: "none", background: T.status.redDim, color: T.status.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>×</button>
                                                    </div>
                                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                                                        <div style={{ position: "relative" }}>
                                                            <span style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 10, fontWeight: 600 }}>$</span>
                                                            <input type="number" inputMode="decimal" pattern="[0-9]*" value={goal.targetAmount || ""} onChange={e => { const arr = [...(financialConfig.savingsGoals || [])]; arr[i] = { ...arr[i], targetAmount: parseFloat(e.target.value) || 0 }; setFinancialConfig({ ...financialConfig, savingsGoals: arr }); }}
                                                                placeholder="Target" style={{ width: "100%", padding: "6px 6px 6px 16px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontSize: 10 }} />
                                                        </div>
                                                        <div style={{ position: "relative" }}>
                                                            <span style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 10, fontWeight: 600 }}>$</span>
                                                            <input type="number" inputMode="decimal" pattern="[0-9]*" value={goal.currentAmount || ""} onChange={e => { const arr = [...(financialConfig.savingsGoals || [])]; arr[i] = { ...arr[i], currentAmount: parseFloat(e.target.value) || 0 }; setFinancialConfig({ ...financialConfig, savingsGoals: arr }); }}
                                                                placeholder="Current" style={{ width: "100%", padding: "6px 6px 6px 16px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontSize: 10 }} />
                                                        </div>
                                                        <input type="date" value={goal.targetDate || ""} onChange={e => { const arr = [...(financialConfig.savingsGoals || [])]; arr[i] = { ...arr[i], targetDate: e.target.value }; setFinancialConfig({ ...financialConfig, savingsGoals: arr }); }}
                                                            style={{ width: "100%", padding: "6px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.card, color: T.text.primary, fontSize: 10 }} />
                                                    </div>
                                                    <div style={{ fontSize: 8, color: T.text.muted, marginTop: 4, display: "flex", gap: 16 }}>
                                                        <span>Target $</span><span>Current $</span><span>Target Date</span>
                                                    </div>
                                                </div>
                                            ))}
                                            <button onClick={() => { setEditingSection("savings"); setFinancialConfig({ ...financialConfig, savingsGoals: [...(financialConfig.savingsGoals || []), { name: "", targetAmount: 0, currentAmount: 0, targetDate: "" }] }); }}
                                                style={{ padding: "8px 14px", borderRadius: T.radius.md, border: `1px dashed ${T.border.default}`, background: "transparent", color: T.accent.primary, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: T.font.mono, width: "100%" }}>+ ADD GOAL</button>
                                        </> : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                            {(financialConfig?.savingsGoals || []).map((goal, i) => {
                                                const pct = goal.targetAmount > 0 ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100)) : 0;
                                                return <div key={i} style={{ padding: "10px 12px", borderRadius: T.radius.md, background: T.bg.elevated, border: `1px solid ${T.border.default}` }}>
                                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                                        <span style={{ fontSize: 12, fontWeight: 600, color: T.text.primary }}>{goal.name || "Unnamed"}</span>
                                                        <span style={{ fontSize: 11, fontWeight: 700, color: T.accent.primary, fontFamily: T.font.mono }}>${(goal.currentAmount || 0).toLocaleString()} / ${(goal.targetAmount || 0).toLocaleString()}</span>
                                                    </div>
                                                    {goal.targetAmount > 0 && <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                        <div style={{ flex: 1, height: 4, borderRadius: 2, background: T.bg.card, overflow: "hidden" }}>
                                                            <div style={{ height: "100%", borderRadius: 2, background: pct >= 100 ? T.status.green : T.accent.primary, width: `${pct}%`, transition: "width .3s" }} />
                                                        </div>
                                                        <span style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 700, minWidth: 32, textAlign: "right" }}>{pct}%</span>
                                                    </div>}
                                                    {goal.targetDate && <span style={{ fontSize: 9, color: T.text.muted, fontFamily: T.font.mono, marginTop: 4, display: "block" }}>Target: {goal.targetDate}</span>}
                                                </div>;
                                            })}
                                        </div>}
                                    </div>
                                )
                            }
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
        </div>{/* close animation wrapper */}
    </div >;
}
