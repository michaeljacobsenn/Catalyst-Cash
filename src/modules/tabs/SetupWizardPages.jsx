import { useState, useRef } from "react";
// xlsx is loaded dynamically to reduce initial bundle size
import { T } from "../constants.js";
import { AI_PROVIDERS } from "../providers.js";
import { isSecuritySensitiveKey } from "../securityKeys.js";
import { isEncrypted, decrypt } from "../crypto.js";
import { db, FaceId, nativeExport } from "../utils.js";
import { Capacitor } from "@capacitor/core";
import { SignInWithApple } from "@capacitor-community/apple-sign-in";
import { InlineTooltip } from "../ui.jsx";
import { connectBank, getConnections } from "../plaid.js";
import { CURRENCIES } from "../currency.js";

const ENABLE_PLAID = true;

const US_STATES = [
    { code: "", label: "— Not in the US —" },
    { code: "AL", label: "Alabama" }, { code: "AK", label: "Alaska 🟢" }, { code: "AZ", label: "Arizona" },
    { code: "AR", label: "Arkansas" }, { code: "CA", label: "California" }, { code: "CO", label: "Colorado" },
    { code: "CT", label: "Connecticut" }, { code: "DE", label: "Delaware" }, { code: "DC", label: "District of Columbia" },
    { code: "FL", label: "Florida 🟢" }, { code: "GA", label: "Georgia" }, { code: "HI", label: "Hawaii" },
    { code: "ID", label: "Idaho" }, { code: "IL", label: "Illinois" }, { code: "IN", label: "Indiana" },
    { code: "IA", label: "Iowa" }, { code: "KS", label: "Kansas" }, { code: "KY", label: "Kentucky" },
    { code: "LA", label: "Louisiana" }, { code: "ME", label: "Maine" }, { code: "MD", label: "Maryland" },
    { code: "MA", label: "Massachusetts" }, { code: "MI", label: "Michigan" }, { code: "MN", label: "Minnesota" },
    { code: "MS", label: "Mississippi" }, { code: "MO", label: "Missouri" }, { code: "MT", label: "Montana" },
    { code: "NE", label: "Nebraska" }, { code: "NV", label: "Nevada 🟢" }, { code: "NH", label: "New Hampshire 🟢" },
    { code: "NJ", label: "New Jersey" }, { code: "NM", label: "New Mexico" }, { code: "NY", label: "New York" },
    { code: "NC", label: "North Carolina" }, { code: "ND", label: "North Dakota" }, { code: "OH", label: "Ohio" },
    { code: "OK", label: "Oklahoma" }, { code: "OR", label: "Oregon" }, { code: "PA", label: "Pennsylvania" },
    { code: "RI", label: "Rhode Island" }, { code: "SC", label: "South Carolina" }, { code: "SD", label: "South Dakota 🟢" },
    { code: "TN", label: "Tennessee 🟢" }, { code: "TX", label: "Texas 🟢" }, { code: "UT", label: "Utah" },
    { code: "VT", label: "Vermont" }, { code: "VA", label: "Virginia" }, { code: "WA", label: "Washington 🟢" },
    { code: "WV", label: "West Virginia" }, { code: "WI", label: "Wisconsin" }, { code: "WY", label: "Wyoming 🟢" },
];

// ─── Shared primitives ────────────────────────────────────────────────────────
export const WizBtn = ({ children, onClick, variant = "primary", disabled = false, style = {} }) => {
    const base = { padding: "13px 20px", borderRadius: T.radius.lg, fontWeight: 700, fontSize: 14, cursor: disabled ? "not-allowed" : "pointer", border: "none", transition: "opacity .2s", opacity: disabled ? 0.4 : 1, fontFamily: T.font.sans, ...style };
    const v = {
        primary: { background: T.accent.primary, color: "#fff", boxShadow: `inset 0 1px 1px rgba(255,255,255,0.15), 0 4px 14px ${T.accent.primary}40` },
        ghost: { background: "transparent", color: T.text.secondary, border: `1px solid ${T.border.default}` },
        skip: { background: "transparent", color: T.text.dim, border: "none", fontSize: 13, padding: "8px 12px" },
    };
    return <button onClick={disabled ? undefined : onClick} style={{ ...base, ...v[variant] }}>{children}</button>;
};

export const WizField = ({ label, hint, children }) => (
    <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", height: "100%" }}>
        <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text.secondary, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
            {hint && <div style={{ fontSize: 11, color: T.text.dim, marginBottom: 6, lineHeight: 1.4 }}>{hint}</div>}
        </div>
        <div style={{ marginTop: "auto", width: "100%" }}>
            {children}
        </div>
    </div>
);

export const WizInput = ({ value, onChange, placeholder, type = "text", style = {}, "aria-label": ariaLabel }) => (
    <input className="wiz-input" type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={ariaLabel || placeholder}
        style={{ width: "100%", padding: "11px 14px", borderRadius: T.radius.md, background: T.bg.elevated, border: `1px solid ${T.border.default}`, color: T.text.primary, fontSize: 14, outline: "none", fontFamily: T.font.sans, boxSizing: "border-box", transition: "all 0.2s", ...style }} />
);

export const WizSelect = ({ value, onChange, options, "aria-label": ariaLabel }) => (
    <select className="wiz-input" value={value} onChange={e => onChange(e.target.value)} aria-label={ariaLabel}
        style={{ width: "100%", padding: "11px 14px", borderRadius: T.radius.md, background: T.bg.elevated, border: `1px solid ${T.border.default}`, color: T.text.primary, fontSize: 14, outline: "none", fontFamily: T.font.sans, boxSizing: "border-box", transition: "all 0.2s" }}>
        {options.map(o => <option key={o.value ?? o} value={o.value ?? o} style={{ background: T.bg.elevated }}>{o.label ?? o}</option>)}
    </select>
);

export const WizToggle = ({ label, sub, checked, onChange }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", gap: 12 }}>
        <div>
            <div style={{ fontSize: 14, color: T.text.primary }}>{label}</div>
            {sub && <div style={{ fontSize: 11, color: T.text.dim, marginTop: 2 }}>{sub}</div>}
        </div>
        <div onClick={() => onChange(!checked)} style={{ width: 44, height: 26, borderRadius: 13, cursor: "pointer", background: checked ? T.accent.primary : T.bg.surface, border: `1px solid ${checked ? T.accent.primary : T.border.default}`, position: "relative", transition: "background .2s", flexShrink: 0 }}>
            <div style={{ position: "absolute", top: 3, left: checked ? 21 : 3, width: 18, height: 18, borderRadius: "50%", background: checked ? "#fff" : T.text.dim, transition: "left .2s" }} />
        </div>
    </div>
);

// ─── NavRow: Back / Skip / Next ───────────────────────────────────────────────
export const NavRow = ({ onBack, onNext, onSkip, nextLabel = "Next →", nextDisabled = false, showBack = true }) => (
    <div style={{
        display: "flex", alignItems: "center", gap: 8,
        marginTop: 20, paddingTop: 16, paddingBottom: 16,
        position: "sticky", bottom: -40, zIndex: 10,
        background: `linear-gradient(to top, ${T.bg.base} 80%, ${T.bg.base}00 100%)`,
    }}>
        {showBack
            ? <WizBtn variant="ghost" onClick={onBack} style={{ flex: "0 0 auto", minWidth: 80 }}>← Back</WizBtn>
            : <div style={{ flex: "0 0 80px" }} />}
        {onSkip && <WizBtn variant="skip" onClick={onSkip} style={{ flex: 1, textAlign: "center" }}>Skip</WizBtn>}
        <WizBtn onClick={onNext} disabled={nextDisabled} style={{ flex: onSkip ? "0 0 auto" : 1, minWidth: 100 }}>{nextLabel}</WizBtn>
    </div>
);

// ─── PAGE 0: Welcome ──────────────────────────────────────────────────────────
export function PageWelcome({ onNext }) {
    const [accepted, setAccepted] = useState(false);
    return (
        <div style={{ textAlign: "center" }}>
            {/* Premium App Icon Hero */}
            <div style={{
                position: "relative", width: 88, height: 88, margin: "0 auto 16px",
                borderRadius: 22, overflow: "visible",
            }}>
                <div style={{
                    position: "absolute", inset: -6, borderRadius: 28,
                    background: `conic-gradient(from 180deg, ${T.accent.primary}40, ${T.accent.emerald}40, ${T.accent.primary}40)`,
                    filter: "blur(16px)", opacity: 0.7,
                }} />
                <img src="./icon-512.png" alt="Catalyst Cash" style={{
                    width: 88, height: 88, borderRadius: 22, position: "relative",
                    boxShadow: `0 8px 32px ${T.accent.primary}30`,
                }} />
            </div>

            <p style={{ fontSize: 14, color: T.text.secondary, lineHeight: 1.7, marginBottom: 24, maxWidth: 300, margin: "0 auto 24px" }}>
                AI-powered financial intelligence — weekly audits, contextual chat, and bank sync — with local storage and a secure AI proxy.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 20, textAlign: "left" }}>
                {[
                    ["🛡️", "Private by Design", "Stored on-device, proxied only when needed"],
                    ["🧠", "Catalyst AI", "Weekly audits + contextual financial chat"],
                    ["🏦", "Bank Sync", "Auto-sync balances via Plaid integration"],
                    ["📊", "Full Ledger", "Cards, debts, income, budgets & renewals"],
                    ["☁️", "Encrypted Backup", "iCloud auto-sync & .enc archival"],
                ].map(([icon, title, sub]) => (
                    <div key={title} style={{
                        display: "flex", alignItems: "center", gap: 12,
                        background: `linear-gradient(135deg, ${T.bg.elevated}, ${T.bg.base})`,
                        borderRadius: T.radius.lg, padding: "12px 14px",
                        border: `1px solid ${T.border.subtle}`,
                        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04)`,
                    }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                            background: `${T.accent.primary}10`, border: `1px solid ${T.accent.primary}20`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 17,
                        }}>{icon}</div>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, lineHeight: 1.2 }}>{title}</div>
                            <div style={{ fontSize: 11, color: T.text.dim, marginTop: 1, lineHeight: 1.3 }}>{sub}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Capability Stats */}
            <div style={{
                display: "flex", gap: 0, marginBottom: 20, borderRadius: T.radius.lg,
                overflow: "hidden", border: `1px solid ${T.border.subtle}`,
            }}>
                {[
                    { icon: "🧠", stat: "3", label: "AI models" },
                    { icon: "🛡️", stat: "100%", label: "On-device" },
                    { icon: "🎁", stat: "Free", label: "Core features" },
                ].map((s, i) => (
                    <div key={i} style={{
                        flex: 1, padding: "12px 8px", textAlign: "center",
                        background: T.bg.elevated,
                        borderRight: i < 2 ? `1px solid ${T.border.subtle}` : "none",
                    }}>
                        <div style={{ fontSize: 14, marginBottom: 2 }}>{s.icon}</div>
                        <div style={{ fontSize: 15, fontWeight: 900, color: T.text.primary, fontFamily: T.font.mono }}>{s.stat}</div>
                        <div style={{ fontSize: 9, color: T.text.dim, fontWeight: 600 }}>{s.label}</div>
                    </div>
                ))}
            </div>

            {/* How It Works — Value Prop */}
            <div style={{
                marginBottom: 20, textAlign: "left", padding: "16px",
                background: `linear-gradient(160deg, ${T.accent.primary}06, ${T.accent.emerald}06)`,
                borderRadius: T.radius.lg, border: `1px solid ${T.accent.primary}15`,
            }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: T.text.secondary, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
                    How It Works
                </div>
                {[
                    { step: "1", title: "Enter your numbers", sub: "2 minutes — checking, savings, debts, spending" },
                    { step: "2", title: "AI generates your gameplan", sub: "Prioritized actions, debt strategy, and health score" },
                    { step: "3", title: "Track progress weekly", sub: "Streaks, charts, badges — watch your wealth grow" },
                ].map((s, i) => (
                    <div key={i} style={{
                        display: "flex", alignItems: "flex-start", gap: 12,
                        marginBottom: i < 2 ? 10 : 0,
                    }}>
                        <div style={{
                            width: 26, height: 26, borderRadius: 13, flexShrink: 0,
                            background: T.accent.primary, color: "#fff",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 12, fontWeight: 900, fontFamily: T.font.mono,
                            boxShadow: `0 2px 8px ${T.accent.primary}40`,
                        }}>{s.step}</div>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary }}>{s.title}</div>
                            <div style={{ fontSize: 11, color: T.text.dim, lineHeight: 1.3 }}>{s.sub}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Legal Disclaimer Acceptance */}
            <div style={{
                background: T.bg.elevated, border: `1px solid ${T.border.default}`,
                borderRadius: T.radius.lg, padding: "14px 16px", marginBottom: 20, textAlign: "left"
            }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div onClick={() => setAccepted(!accepted)} style={{
                        width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1, cursor: "pointer",
                        background: accepted ? T.accent.primary : "transparent",
                        border: `2px solid ${accepted ? T.accent.primary : T.border.default}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.2s ease"
                    }}>
                        {accepted && <span style={{ color: "#fff", fontSize: 13, fontWeight: 800, lineHeight: 1 }}>✓</span>}
                    </div>
                    <p style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.6, margin: 0 }}>
                        I understand that this app provides <strong style={{ color: T.text.primary }}>AI-generated educational content only</strong> and
                        is <strong style={{ color: T.status.amber }}>not a substitute for professional financial, tax, legal, or investment advice</strong>.
                        I will consult a licensed professional before making financial decisions.
                    </p>
                </div>
            </div>

            <WizBtn onClick={onNext} disabled={!accepted} style={{ width: "100%", fontSize: 15 }}>Let's Get Started →</WizBtn>
        </div>
    );
}

// ─── PAGE 1: Import ───────────────────────────────────────────────────────────
export function PageImport({ onNext, toast, onComplete }) {
    const [importing, setImporting] = useState(false);
    const [passphrase, setPassphrase] = useState("");
    const [needsPass, setNeedsPass] = useState(false);
    const [pendingParsed, setPendingParsed] = useState(null);
    const [imported, setImported] = useState(false);
    const fileRef = useRef(null);
    const csvRef = useRef(null);

    const applyBackup = async (backup) => {
        if (backup && backup.type === "spreadsheet-backup") {
            const XLSX = await import("xlsx");
            const binary_string = window.atob(backup.base64);
            const len = binary_string.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binary_string.charCodeAt(i);
            }
            const wb = XLSX.read(bytes.buffer, { type: "array" });
            const sheetName = wb.SheetNames.find(n => n.includes("Setup Data")) || wb.SheetNames[0];
            const ws = wb.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
            const config = {};
            for (const row of rows) {
                const key = String(row[0] || "").trim();
                const rawVal = String(row[2] ?? "").trim();
                if (!key || !rawVal || key === "field_key" || key === "Config Key") continue;
                const num = parseFloat(rawVal);
                config[key] = isNaN(num) ? (rawVal === "true" ? true : rawVal === "false" ? false : rawVal) : num;
            }
            const existing = (await db.get("financial-config")) || {};
            await db.set("financial-config", { ...existing, ...config, _fromSetupWizard: true });
            toast?.success(`✅ Imported ${Object.keys(config).length} fields from spreadsheet backup`);
            setImported(true);
            return true;
        }

        if (!backup.data || (backup.app !== "Catalyst Cash" && backup.app !== "FinAudit Pro")) {
            toast?.error("Not a valid Catalyst Cash backup"); return false;
        }
        let count = 0;
        for (const [key, val] of Object.entries(backup.data)) {
            if (isSecuritySensitiveKey(key)) continue;
            await db.set(key, val); count++; // db.set always overwrites — no duplication
        }
        toast?.success(`✅ Restored ${count} settings — existing data overwritten`);
        setImported(true);
        return true;
    };

    const handleBackupFile = async (file) => {
        setImporting(true);
        try {
            const text = await file.text();
            let parsed;
            try { parsed = JSON.parse(text); } catch { toast?.error("Invalid file — must be .json"); setImporting(false); return; }
            if (isEncrypted(parsed)) { setPendingParsed(parsed); setNeedsPass(true); setImporting(false); return; }
            await applyBackup(parsed);
        } catch (e) { toast?.error(e.message || "Import failed"); }
        setImporting(false);
    };

    const handlePassphraseSubmit = async () => {
        if (!passphrase || !pendingParsed) return;
        setImporting(true);
        try {
            const plain = await decrypt(pendingParsed, passphrase);
            await applyBackup(JSON.parse(plain));
            setNeedsPass(false); setPendingParsed(null); setPassphrase("");
        } catch { toast?.error("Wrong passphrase — try again"); }
        setImporting(false);
    };

    const parseSpreadsheet = async (file) => {
        const XLSX = await import("xlsx");
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });

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
                // Check if row has any real data (ignore empty rows)
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

        return config;
    };

    const handleSpreadsheet = async (file) => {
        setImporting(true);
        try {
            const config = await parseSpreadsheet(file);
            if (Object.keys(config).length > 0) {
                // Full replace of financial-config with imported values merged over defaults
                const existing = (await db.get("financial-config")) || {};
                await db.set("financial-config", { ...existing, ...config, _fromSetupWizard: true });
                toast?.success(`✅ Imported ${Object.keys(config).length} fields — existing values overwritten`);
                setImported(true);
            } else { toast?.error("No filled fields found — enter values in the 'Your Value' column"); }
        } catch (e) { toast?.error("Spreadsheet import failed: " + e.message); }
        setImporting(false);
    };

    const downloadTemplate = async (url, filename, mimeType) => {
        setImporting(true);
        try {
            const res = await fetch(url);
            const blob = await res.blob();
            // Convert blob to base64 for nativeExport
            const base64data = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            await nativeExport(filename, base64data, mimeType, true);
        } catch (e) {
            // Ignore native share cancellation errors, but catch actual failures
            if (!e.message?.toLowerCase().includes("cancel")) {
                toast?.error("Download failed: " + e.message);
            }
        } finally {
            setImporting(false);
        }
    };

    if (needsPass) return (
        <div>
            <div style={{ fontSize: 40, textAlign: "center", marginBottom: 14 }}>🔑</div>
            <p style={{ fontSize: 14, color: T.text.secondary, textAlign: "center", marginBottom: 20 }}>This backup is encrypted. Enter your passphrase to unlock it.</p>
            <WizField label="Passphrase"><WizInput type="password" value={passphrase} onChange={setPassphrase} placeholder="Enter backup passphrase" /></WizField>
            <div style={{ display: "flex", gap: 10 }}>
                <WizBtn variant="ghost" onClick={() => { setNeedsPass(false); setPendingParsed(null); }} style={{ flex: 1 }}>Cancel</WizBtn>
                <WizBtn onClick={handlePassphraseSubmit} disabled={!passphrase || importing} style={{ flex: 1 }}>{importing ? "Decrypting…" : "Unlock & Import"}</WizBtn>
            </div>
        </div>
    );

    return (
        <div>
            <input ref={fileRef} type="file" accept=".json,.enc,*/*" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) handleBackupFile(e.target.files[0]); e.target.value = ""; }} />
            <input ref={csvRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) handleSpreadsheet(e.target.files[0]); e.target.value = ""; }} />

            {/* Override notice */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: `${T.accent.primary}12`, border: `1px solid ${T.accent.primary}30`, borderRadius: T.radius.md, padding: "10px 13px", marginBottom: 14 }}>
                <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>ℹ️</span>
                <p style={{ fontSize: 12, color: T.text.secondary, margin: 0, lineHeight: 1.5 }}>
                    Importing <strong style={{ color: T.text.primary }}>overwrites</strong> any existing data for the same fields. Your PIN and encrypted chats are never touched.
                </p>
            </div>

            {/* Upload actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 14 }}>
                {[
                    { icon: "📦", title: "Restore from Backup", sub: "Import a .json backup file (encrypted or plain)", onClick: () => fileRef.current?.click() },
                    { icon: "📊", title: "Import Spreadsheet", sub: "Import your filled-in .xlsx or .csv template", onClick: () => csvRef.current?.click() },
                ].map(item => (
                    <button key={item.title} onClick={item.onClick} disabled={importing} style={{ display: "flex", alignItems: "center", gap: 14, background: T.bg.elevated, border: `1px solid ${T.border.default}`, borderRadius: T.radius.lg, padding: "14px 16px", cursor: "pointer", textAlign: "left", opacity: importing ? 0.5 : 1 }}>
                        <span style={{ fontSize: 24 }}>{item.icon}</span>
                        <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: T.text.primary }}>{item.title}</div>
                            <div style={{ fontSize: 12, color: T.text.dim, marginTop: 2 }}>{item.sub}</div>
                        </div>
                    </button>
                ))}
            </div>

            {/* Download templates */}
            <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.text.secondary, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Download a blank template</div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => downloadTemplate("/CatalystCash-Setup-Template.xlsx", "CatalystCash-Setup-Template.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
                        disabled={importing}
                        style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, background: T.bg.elevated, border: `1px solid ${T.border.default}`, borderRadius: T.radius.md, padding: "12px 14px", cursor: "pointer", opacity: importing ? 0.5 : 1 }}>
                        <span style={{ fontSize: 20 }}>📗</span>
                        <div style={{ textAlign: "left" }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary }}>Excel (.xlsx)</div>
                            <div style={{ fontSize: 11, color: T.text.dim }}>Dropdowns included</div>
                        </div>
                    </button>
                    <button onClick={() => downloadTemplate("/CatalystCash-Setup-Template.csv", "CatalystCash-Setup-Template.csv", "text/csv")}
                        disabled={importing}
                        style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, background: T.bg.elevated, border: `1px solid ${T.border.default}`, borderRadius: T.radius.md, padding: "12px 14px", cursor: "pointer", opacity: importing ? 0.5 : 1 }}>
                        <span style={{ fontSize: 20 }}>📄</span>
                        <div style={{ textAlign: "left" }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary }}>CSV (.csv)</div>
                            <div style={{ fontSize: 11, color: T.text.dim }}>Any spreadsheet app</div>
                        </div>
                    </button>
                </div>
            </div>

            {imported && (
                <div style={{ background: T.accent.emeraldDim, border: `1px solid ${T.accent.emerald}30`, borderRadius: T.radius.md, padding: "11px 14px", marginBottom: 14, fontSize: 13, color: T.accent.emerald, fontWeight: 600 }}>
                    ✅ Import complete — existing data overwritten. Continue setup or skip ahead.
                </div>
            )}

            {imported && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "16px 0 8px", padding: 14, background: `${T.status.green}10`, border: `1px solid ${T.status.green}30`, borderRadius: T.radius.md }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: T.status.green, margin: 0, textAlign: "center" }}>✅ Backup imported successfully!</p>
                    <p style={{ fontSize: 11, color: T.text.secondary, margin: 0, textAlign: "center", lineHeight: 1.5 }}>Would you like to continue editing your setup, or go straight to your dashboard?</p>
                    <div style={{ display: "flex", gap: 8 }}>
                        <WizBtn variant="ghost" onClick={onNext} style={{ flex: 1, fontSize: 12 }}>Continue Setup</WizBtn>
                        <WizBtn onClick={() => onComplete && onComplete()} style={{ flex: 1, fontSize: 12 }}>Go to Dashboard →</WizBtn>
                    </div>
                </div>
            )}
            {!imported && <NavRow showBack={false} onNext={onNext} onSkip={onNext} nextLabel="Skip for Now →" />}
        </div>
    );
}

export function PagePass1({ data, onChange, onNext, onBack, onSkip }) {
    return (
        <div>
            {/* Premium Privacy Banner */}
            <div style={{
                display: "flex", gap: 12, alignItems: "flex-start",
                padding: "14px 16px", marginBottom: 20,
                background: `linear-gradient(145deg, ${T.bg.elevated}, ${T.bg.base})`,
                border: `1px solid ${T.border.default}`,
                borderRadius: T.radius.lg,
                boxShadow: `0 4px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05)`
            }}>
                <div style={{
                    width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                    background: `${T.status.green}15`, border: `1px solid ${T.status.green}30`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: `0 0 12px ${T.status.green}20`
                }}>
                    <span style={{ fontSize: 16 }}>🛡️</span>
                </div>
                <div>
                    <h4 style={{ margin: "0 0 4px 0", fontSize: 13, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>
                        Private by Design
                    </h4>
                    <p style={{ margin: 0, fontSize: 12, color: T.text.secondary, lineHeight: 1.5 }}>
                        Your core financial data stays stored <strong style={{ color: T.status.green, fontWeight: 600 }}>on-device</strong>. AI requests are routed through the Catalyst Cash backend proxy with PII scrubbing, and optional backups sync through your personal iCloud/Drive.
                    </p>
                </div>
            </div>

            <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: T.text.primary, margin: "0 0 6px 0", letterSpacing: "-0.01em" }}>Region & Currency</h3>
                <p style={{ fontSize: 13, color: T.text.secondary, margin: "0 0 16px 0", lineHeight: 1.5 }}>
                    Choose your local currency and state (for tax modeling in FIRE projections).
                </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 24 }}>
                <WizField label="Currency" hint="All amounts displayed in this currency">
                    <WizSelect value={data.currencyCode || "USD"} onChange={v => onChange("currencyCode", v)}
                        options={CURRENCIES.map(c => ({ value: c.code, label: `${c.flag} ${c.code} — ${c.symbol}` }))} />
                </WizField>
                <WizField label="State" hint="🟢 = No state income tax">
                    <WizSelect value={data.stateCode || ""} onChange={v => onChange("stateCode", v)}
                        options={US_STATES.map(s => ({ value: s.code, label: s.label }))} />
                </WizField>
                <WizField label="Birth Year" hint="For retirement account access timing">
                    <WizInput type="number" inputMode="numeric" pattern="[0-9]*" value={data.birthYear || ""} onChange={v => onChange("birthYear", v ? Number(v) : null)} placeholder="e.g. 1995" aria-label="Birth year" />
                </WizField>
            </div>

            <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: T.text.primary, margin: "0 0 6px 0", letterSpacing: "-0.01em" }}>Phase 1: Your Income Story</h3>
                <p style={{ fontSize: 13, color: T.text.secondary, margin: 0, lineHeight: 1.5 }}>
                    Let's start with the fun part—when you get paid! This framing helps Catalyst build your customized weekly projections.
                </p>
            </div>

            <WizField label="How often do you get paid?">
                <WizSelect value={data.payFrequency} onChange={v => onChange("payFrequency", v)} options={[
                    { value: "weekly", label: "📅 Weekly" },
                    { value: "bi-weekly", label: "📅 Bi-Weekly (every 2 weeks)" },
                    { value: "semi-monthly", label: "📅 Semi-Monthly (1st & 15th)" },
                    { value: "monthly", label: "📅 Monthly" },
                ]} />
            </WizField>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <WizField label="Payday" hint="Typical day of arrival">
                    <WizSelect value={data.payday} onChange={v => onChange("payday", v)} options={["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]} />
                </WizField>
                <WizField label="Deposit Into" hint="Where the funds land">
                    <WizSelect value={data.paycheckDepositAccount} onChange={v => onChange("paycheckDepositAccount", v)} options={[
                        { value: "checking", label: "🏦 Checking" },
                        { value: "savings", label: "🏦 Vault/Savings" }
                    ]} />
                </WizField>
            </div>

            <WizField label="Income Type" hint="Determines how we calculate your runway">
                <WizSelect value={data.incomeType || "salary"} onChange={v => onChange("incomeType", v)} options={[
                    { value: "salary", label: "💼 Salary (Consistent Paychecks)" },
                    { value: "hourly", label: "⏱️ Hourly Wage" },
                    { value: "variable", label: "📈 Variable (Commission, Gig, Tips)" }
                ]} />
            </WizField>

            {(!data.incomeType || data.incomeType === "salary") && (
                <>
                    <WizField label="Standard Paycheck ($)" hint="Your exact net take-home pay per check (after taxes & deductions)">
                        <WizInput type="number" inputMode="decimal" pattern="[0-9]*" value={data.paycheckStandard} onChange={v => onChange("paycheckStandard", v)} placeholder="e.g. 2400" />
                    </WizField>
                    <WizField label="First-of-Month Paycheck ($)" hint="If your first check is lower due to benefits/insurance (Leave blank if same)">
                        <WizInput type="number" inputMode="decimal" pattern="[0-9]*" value={data.paycheckFirstOfMonth} onChange={v => onChange("paycheckFirstOfMonth", v)} placeholder="Leave blank if same as above" />
                    </WizField>
                </>
            )}

            {data.incomeType === "hourly" && (
                <>
                    <WizField label="Net Hourly Rate ($)" hint="Your approximate hourly take-home pay after taxes">
                        <WizInput type="number" inputMode="decimal" pattern="[0-9]*" value={data.hourlyRateNet} onChange={v => onChange("hourlyRateNet", v)} placeholder="e.g. 24.50" />
                    </WizField>
                    <WizField label="Typical Hours per Paycheck" hint={`How many hours do you usually work per ${data.payFrequency || 'pay period'}?`}>
                        <WizInput type="number" inputMode="decimal" pattern="[0-9]*" value={data.typicalHours} onChange={v => onChange("typicalHours", v)} placeholder="e.g. 80" />
                    </WizField>
                </>
            )}

            {data.incomeType === "variable" && (
                <WizField label="Average Paycheck ($)" hint="Be conservative here. What is a reliable average net pay per check?">
                    <WizInput type="number" inputMode="decimal" pattern="[0-9]*" value={data.averagePaycheck} onChange={v => onChange("averagePaycheck", v)} placeholder="e.g. 1500" />
                </WizField>
            )}

            <div style={{ margin: "32px 0 16px", borderTop: `1px solid ${T.border.subtle}`, paddingTop: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text.primary, margin: "0 0 6px 0" }}>Fun Money & Spending</h3>
                <p style={{ fontSize: 12, color: T.text.muted, margin: "0 0 16px 0", lineHeight: 1.5 }}>
                    This is your "Spend Allowance"—the cash you plan to spend every week on variable costs like groceries, coffee, or dining out. It does <strong>not</strong> include your fixed bills.
                </p>
            </div>

            <WizField label="Weekly Spend Allowance ($)" hint="The maximum you allow yourself to spend per week on everyday fun/needs.">
                <WizInput type="number" inputMode="decimal" pattern="[0-9]*" value={data.weeklySpendAllowance} onChange={v => onChange("weeklySpendAllowance", v)} placeholder="e.g. 300" />
            </WizField>
            <p style={{ fontSize: 11, color: T.text.muted, fontStyle: "italic", marginTop: -6, marginBottom: 16 }}>
                💡 Tip: Be totally honest here! If you usually spend $400/wk, put $400. We'll automatically optimize your savings around this number.
            </p>

            <WizField label="Default APR (%)" hint="Used to estimate interest penalties on any newly added, unpaid card balances.">
                <WizInput type="number" inputMode="decimal" pattern="[0-9]*" value={data.defaultAPR} onChange={v => onChange("defaultAPR", v)} placeholder="e.g. 24.99" />
            </WizField>

            <NavRow onBack={onBack} onNext={onNext} onSkip={onSkip} />
        </div>
    );
}

// ─── PAGE 3: Pass 2 (Boost Accuracy) ─────────────────────────────────────────
export function PagePass2({ data, onChange, onNext, onBack, onSkip }) {
    return (
        <div>
            <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: T.text.primary, margin: "0 0 6px 0", letterSpacing: "-0.01em" }}>Phase 2: Wealth Targets</h3>
                <p style={{ fontSize: 13, color: T.text.secondary, margin: 0, lineHeight: 1.5 }}>
                    Let's set up some guardrails. This helps the AI know when to save extra cash versus when it's safe to invest or pay down debt.
                </p>
            </div>

            <WizField label={<InlineTooltip term="Floor">Checking Floor ($)</InlineTooltip>} hint="The absolute minimum balance you want your checking account to hold at all times.">
                <WizInput type="number" inputMode="decimal" pattern="[0-9]*" value={data.emergencyFloor} onChange={v => onChange("emergencyFloor", v)} placeholder="e.g. 1000" />
            </WizField>
            <p style={{ fontSize: 11, color: T.text.muted, fontStyle: "italic", marginTop: -6, marginBottom: 16 }}>
                💡 Tip: We recommend setting this to roughly half your monthly expenses so you never overdraft.
            </p>

            <WizField label="Optimal Reserve Target ($)" hint="The ideal balance indicating your checking is fully healthy.">
                <WizInput type="number" inputMode="decimal" pattern="[0-9]*" value={data.greenStatusTarget} onChange={v => onChange("greenStatusTarget", v)} placeholder="e.g. 3000" />
            </WizField>

            <WizField label={<InlineTooltip term="Emergency reserve">Vault / Emergency Target ($)</InlineTooltip>} hint="The total savings goal for your standalone emergency fund.">
                <WizInput type="number" inputMode="decimal" pattern="[0-9]*" value={data.emergencyReserveTarget} onChange={v => onChange("emergencyReserveTarget", v)} placeholder="e.g. 15000" />
            </WizField>
            <p style={{ fontSize: 11, color: T.text.muted, fontStyle: "italic", marginTop: -6, marginBottom: 16 }}>
                💡 Tip: A 3-6 month runway is the gold standard for bulletproof security.
            </p>

            <div style={{ margin: "32px 0 16px", borderTop: `1px solid ${T.border.subtle}`, paddingTop: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text.primary, margin: "0 0 6px 0" }}>Taxes (The boring but important stuff)</h3>
                <p style={{ fontSize: 12, color: T.text.muted, margin: "0 0 16px 0", lineHeight: 1.5 }}>This helps Catalyst calculate the true ROI of your debt payoff and investments.</p>
            </div>

            <WizField label="Marginal Tax Bracket (%)" hint="Your highest combined federal + state income tax bracket.">
                <WizInput type="number" inputMode="decimal" pattern="[0-9]*" value={data.taxBracketPercent} onChange={v => onChange("taxBracketPercent", v)} placeholder="e.g. 24" />
            </WizField>

            <WizToggle label="1099 / Self-Employed" sub="Enables tracking for estimated quarterly tax payments." checked={data.isContractor} onChange={v => onChange("isContractor", v)} />

            <NavRow onBack={onBack} onNext={onNext} onSkip={onSkip} />
        </div>
    );
}

// ─── PAGE 4: Phase 3 (Integrations) ────────────────────────────────────────
export function PagePass3({ ai, security, spending, updateAi, updateSecurity, updateSpending, themeMode, setThemeMode, onNext, onBack, onSkip, saving, appleLinkedId, setAppleLinkedId }) {
    const provider = AI_PROVIDERS[0];
    const [confirm, setConfirm] = useState("");
    const [plaidConnecting, setPlaidConnecting] = useState(false);
    const [plaidCount, setPlaidCount] = useState(0);
    const isNative = Capacitor.getPlatform() !== 'web';

    // Check existing Plaid connections on mount
    useState(() => {
        getConnections().then(c => setPlaidCount(c?.length || 0)).catch(() => { });
    });

    const handlePlaidConnect = async () => {
        setPlaidConnecting(true);
        try {
            await connectBank();
            const conns = await getConnections();
            setPlaidCount(conns?.length || 0);
            if (window.toast) window.toast.success("Bank connected successfully!");
        } catch (e) {
            if (!e?.message?.toLowerCase().includes("exit") && !e?.message?.toLowerCase().includes("cancel")) {
                if (window.toast) window.toast.error(e.message || "Connection failed");
            }
        }
        setPlaidConnecting(false);
    };

    const handleFaceIdToggle = async (checked) => {
        if (!checked) {
            updateSecurity("useFaceId", false);
            return;
        }
        try {
            const res = await FaceId.isAvailable();
            if (!res.isAvailable) {
                if (window.toast) window.toast.error("No biometrics set up on this device.");
                return;
            }
            updateSecurity("useFaceId", true);
        } catch (e) {
            if (window.toast) window.toast.error("Biometrics unavailable.");
        }
    };

    const pinMismatch = security.pinEnabled && security.pin && confirm && security.pin !== confirm;
    const canProceed = !security.pinEnabled || (security.pin.length >= 4 && !pinMismatch);

    return (
        <div>
            {/* PLAID BANK CONNECTION */}
            {
                ENABLE_PLAID && (
                    <>
                        <div style={{ marginBottom: 24 }}>
                            <h3 style={{ fontSize: 16, fontWeight: 800, color: T.text.primary, margin: "0 0 6px 0", letterSpacing: "-0.01em" }}>Phase 3: Connect Your Accounts</h3>
                            <p style={{ fontSize: 13, color: T.text.secondary, margin: 0, lineHeight: 1.5 }}>
                                Let's link the plumbing. We need secure access to your live data to provide real-time optimization and catch expensive renewals.
                            </p>
                        </div>

                        <div style={{
                            padding: "16px", marginBottom: 20,
                            background: `linear-gradient(145deg, ${T.bg.elevated}, ${T.bg.base})`,
                            border: `1px solid ${T.border.default}`,
                            borderRadius: T.radius.lg,
                            boxShadow: `0 4px 24px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.05)`,
                        }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                                <div style={{
                                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                                    background: `linear-gradient(135deg, #0A85D120, #6C63FF15)`,
                                    border: `1px solid #0A85D130`,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: 18,
                                }}>🏦</div>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: T.text.primary }}>Connect Your Bank</h4>
                                    <p style={{ margin: 0, fontSize: 11, color: T.text.dim }}>Auto-sync balances securely via Plaid</p>
                                </div>
                            </div>
                            {plaidCount > 0 ? (
                                <div style={{
                                    display: "flex", alignItems: "center", gap: 8,
                                    padding: "10px 14px", borderRadius: T.radius.md,
                                    background: `${T.status.green}10`, border: `1px solid ${T.status.green}25`,
                                    marginBottom: 8,
                                }}>
                                    <span style={{ fontSize: 14 }}>✅</span>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: T.status.green }}>
                                        {plaidCount} bank{plaidCount > 1 ? "s" : ""} connected
                                    </span>
                                </div>
                            ) : (
                                <p style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.5, margin: "0 0 12px 0" }}>
                                    Instantly pull real-time balances from your checking, savings, and credit accounts. Plaid handles authentication directly and Catalyst Cash never stores your bank login credentials.
                                </p>
                            )}
                            <div style={{ display: "flex", gap: 8 }}>
                                <button onClick={(e) => { haptic.medium(); handlePlaidConnect(e); }} disabled={plaidConnecting} style={{
                                    flex: 1, padding: "14px", borderRadius: T.radius.md, border: "none",
                                    background: T.accent.primary, color: "#fff", fontSize: 13, fontWeight: 700,
                                    cursor: plaidConnecting ? "not-allowed" : "pointer", opacity: plaidConnecting ? 0.6 : 1,
                                    boxShadow: `inset 0 1px 1px rgba(255,255,255,0.15), 0 4px 12px ${T.accent.primary}30`,
                                    transition: "all 0.2s",
                                }}>
                                    {plaidConnecting ? "Connecting…" : plaidCount > 0 ? "+ Link Another Bank" : "🔗 Link via Plaid"}
                                </button>
                            </div>
                            <p style={{ fontSize: 10, color: T.text.dim, marginTop: 8, textAlign: "center", margin: "8px 0 0 0" }}>
                                You can also skip this and enter individual balances manually later.
                            </p>
                        </div>
                    </>
                )
            }

            {/* RETIREMENT TRACKING */}
            <div style={{ margin: "12px 0", borderTop: `1px solid ${T.border.subtle}`, paddingTop: 16 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, margin: "0 0 4px 0" }}>Retirement Tracking</h3>
                <p style={{ fontSize: 11, color: T.text.muted, margin: "0 0 16px 0" }}>Let the AI optimize your retirement path and estimate tax savings.</p>
            </div>

            <WizToggle label="Track Roth IRA" sub="The AI will direct extra cash here after debts" checked={spending.trackRothContributions} onChange={v => updateSpending("trackRothContributions", v)} />
            {
                spending.trackRothContributions && (
                    <WizField label="Roth Annual Limit ($)" hint="IRS limit for this year">
                        <WizInput type="number" inputMode="decimal" pattern="[0-9]*" value={spending.rothAnnualLimit} onChange={v => updateSpending("rothAnnualLimit", v)} placeholder="e.g. 7000" />
                    </WizField>
                )
            }

            <WizToggle label="Track 401k" sub="Factor in employer matches and tax deductions" checked={spending.track401k} onChange={v => updateSpending("track401k", v)} />
            {
                spending.track401k && (
                    <>
                        <WizField label="401k Annual Limit ($)" hint="IRS limit for this year">
                            <WizInput type="number" inputMode="decimal" pattern="[0-9]*" value={spending.k401AnnualLimit} onChange={v => updateSpending("k401AnnualLimit", v)} placeholder="e.g. 23000" />
                        </WizField>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <WizField label="Employer Match (%)" hint="e.g. 100 for dollar-for-dollar">
                                <WizInput type="number" inputMode="decimal" pattern="[0-9]*" value={spending.k401EmployerMatchPct} onChange={v => updateSpending("k401EmployerMatchPct", v)} placeholder="e.g. 100" />
                            </WizField>
                            <WizField label="Match Ceiling (%)" hint="Up to % of your salary">
                                <WizInput type="number" inputMode="decimal" pattern="[0-9]*" value={spending.k401EmployerMatchLimit} onChange={v => updateSpending("k401EmployerMatchLimit", v)} placeholder="e.g. 5" />
                            </WizField>
                        </div>
                    </>
                )
            }

            <WizToggle label="Track HSA" sub="Triple tax-advantaged health savings" checked={spending.trackHSA} onChange={v => updateSpending("trackHSA", v)} />
            <WizToggle label="Track Crypto" sub="Monitor your digital assets" checked={spending.trackCrypto !== false} onChange={v => updateSpending("trackCrypto", v)} />

            {/* APP EXPERIENCE */}
            <div style={{ margin: "24px 0 12px", borderTop: `1px solid ${T.border.subtle}`, paddingTop: 20 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, margin: "0 0 4px 0" }}>App Experience</h3>
                <p style={{ fontSize: 11, color: T.text.muted, margin: "0 0 16px 0" }}>Choose how Catalyst Cash looks and feels.</p>
            </div>

            <WizField label="Theme Mode" hint="System matches your device settings. Select Light or Dark to override.">
                <WizSelect value={themeMode || "system"} onChange={v => setThemeMode(v)} options={[
                    { value: "system", label: "⚙️ System Auto" },
                    { value: "dark", label: "🌙 Dark Mode" },
                    { value: "light", label: "☀️ Light Mode" },
                ]} />
            </WizField>

            {/* AI ENGINE */}
            <div style={{ margin: "24px 0 12px", borderTop: `1px solid ${T.border.subtle}`, paddingTop: 20 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, margin: "0 0 4px 0" }}>AI Intelligence</h3>
                <p style={{ fontSize: 11, color: T.text.muted, margin: "0 0 16px 0" }}>Select the brain that powers your audits.</p>
            </div>

            <WizField label="AI Engine" hint="Catalyst AI handles everything — no configuration needed.">
                <div style={{ padding: "14px 16px", background: `${T.status.green}15`, border: `1px solid ${T.status.green}30`, borderRadius: T.radius.md, marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: T.accent.emerald }}>✨ Catalyst AI</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: T.accent.primary, fontFamily: T.font.mono, background: T.accent.primaryDim, padding: "2px 8px", borderRadius: 99 }}>ACTIVE</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: T.text.secondary, lineHeight: 1.5 }}>
                        Your audits are powered by our secure AI backend. No API keys, no setup — just tap "Run Audit."
                    </p>
                </div>
            </WizField>
            <WizField label="Model" hint="Upgrade to Pro to unlock premium AI models.">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {provider.models.map(m => {
                        const active = ai.aiModel === m.id;
                        const isPro = m.tier === "pro";
                        const locked = isPro || m.disabled;
                        return (
                            <button key={m.id} onClick={() => { if (!locked) { updateAi("aiProvider", "backend"); updateAi("aiModel", m.id); } }} style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                padding: "12px 14px", borderRadius: T.radius.md, cursor: locked ? "default" : "pointer",
                                opacity: m.disabled ? 0.4 : isPro ? 0.5 : 1,
                                background: active ? T.accent.primaryDim : T.bg.elevated,
                                border: `1.5px solid ${active ? T.accent.primary : T.border.default}`, textAlign: "left",
                            }}>
                                <div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: T.text.primary }}>{m.name}</span>
                                        {m.comingSoon ? <span style={{ fontSize: 8, fontWeight: 800, color: T.text.muted, background: `${T.text.muted}15`, border: `1px solid ${T.text.muted}30`, padding: "1px 6px", borderRadius: 99 }}>SOON</span>
                                            : isPro ? <span style={{ fontSize: 8, fontWeight: 800, color: "#FFD700", background: "linear-gradient(135deg, #FFD70020, #FFA50020)", border: "1px solid #FFD70030", padding: "1px 6px", borderRadius: 99 }}>PRO</span>
                                                : <span style={{ fontSize: 8, fontWeight: 800, color: T.status.green, background: `${T.status.green}15`, border: `1px solid ${T.status.green}30`, padding: "1px 6px", borderRadius: 99 }}>FREE</span>}
                                    </div>
                                    <span style={{ fontSize: 11, color: T.text.dim }}>{m.comingSoon ? "Coming soon" : m.note}</span>
                                </div>
                                {active && <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.accent.primary }} />}
                            </button>
                        );
                    })}
                </div>
            </WizField>

            {/* SECURITY & BACKUP */}
            <div style={{ margin: "24px 0 12px", borderTop: `1px solid ${T.border.subtle}`, paddingTop: 20 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, margin: "0 0 4px 0" }}>Security & Backup</h3>
                <p style={{ fontSize: 11, color: T.text.muted, margin: "0 0 16px 0" }}>Lock down your on-device data.</p>
            </div>

            <WizToggle label="Enable PIN lock" sub="Require a PIN to open the app" checked={security.pinEnabled} onChange={v => updateSecurity("pinEnabled", v)} />
            {
                security.pinEnabled && (
                    <>
                        <WizField label="Set PIN (4–8 digits)" hint="Numbers only">
                            <WizInput type="tel" inputMode="numeric" pattern="[0-9]*" value={security.pin} onChange={v => updateSecurity("pin", v.replace(/\D/g, "").slice(0, 8))} placeholder="e.g. 1234" />
                        </WizField>
                        <WizField label="Confirm PIN">
                            <WizInput type="tel" inputMode="numeric" pattern="[0-9]*" value={confirm} onChange={v => setConfirm(v.replace(/\D/g, "").slice(0, 8))} placeholder="Re-enter PIN" style={{ borderColor: pinMismatch ? T.status.red : undefined }} />
                            {pinMismatch && <div style={{ fontSize: 12, color: T.status.red, marginTop: 4 }}>⚠️ PINs don't match</div>}
                        </WizField>
                        {isNative && (
                            <div style={{ marginTop: 8, marginBottom: 16 }}>
                                <WizToggle label="Enable Face ID / Touch ID" sub="Use biometrics for faster unlocking" checked={security.useFaceId} onChange={handleFaceIdToggle} />
                            </div>
                        )}
                    </>
                )
            }
            <WizField label="Auto-Lock After" hint="How long before the app locks when backgrounded">
                <WizSelect value={security.lockTimeout} onChange={v => updateSecurity("lockTimeout", Number(v))} options={[
                    { value: 0, label: "⚡ Immediately" },
                    { value: 30, label: "⏱ 30 seconds" },
                    { value: 60, label: "⏱ 1 minute" },
                    { value: 300, label: "⏱ 5 minutes" },
                    { value: 900, label: "⏱ 15 minutes" },
                    { value: -1, label: "🔓 Never" },
                ]} />
            </WizField>

            {/* Apple Sign-In for iCloud Backup */}
            {
                Capacitor.getPlatform() !== 'web' && !appleLinkedId && (
                    <div style={{ marginTop: 8, marginBottom: 16, padding: "14px 16px", background: T.bg.elevated, borderRadius: T.radius.md, border: `1px solid ${T.border.default}` }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: T.text.primary, marginBottom: 4 }}>☁️ iCloud Auto-Backup</div>
                        <p style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.5, margin: "0 0 10px 0" }}>Link your Apple ID to enable automatic iCloud backups. Your data continuously syncs to your private iCloud Drive.</p>
                        <button onClick={async () => {
                            try {
                                const result = await SignInWithApple.authorize({
                                    clientId: 'com.jacobsen.portfoliopro',
                                    redirectURI: 'https://api.catalystcash.app/auth/apple/callback',
                                    scopes: 'email name'
                                });
                                const userId = result.response.user;
                                if (setAppleLinkedId) setAppleLinkedId(userId);
                                if (window.toast) window.toast.success("Apple ID linked for iCloud backup.");
                            } catch {
                                if (window.toast) window.toast.error("Apple Sign-In cancelled or failed.");
                            }
                        }} style={{
                            width: "100%", padding: "11px 16px", borderRadius: T.radius.md, border: "none",
                            background: "#000", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 8
                        }}>
                            Sign in with Apple
                        </button>
                    </div>
                )
            }

            {
                Capacitor.getPlatform() !== 'web' && appleLinkedId && (
                    <div style={{ marginTop: 8, marginBottom: 16 }}>
                        <WizField label="iCloud Backup Interval" hint={<>How often your data syncs securely to iCloud Drive.<br /><span style={{ opacity: 0.8 }}>Files App → iCloud Drive → Catalyst Cash</span></>}>
                            <WizSelect value={security.autoBackupInterval || "weekly"} onChange={v => updateSecurity("autoBackupInterval", v)} options={[
                                { value: "daily", label: "🗓 Daily" },
                                { value: "weekly", label: "📅 Weekly" },
                                { value: "monthly", label: "🗓️ Monthly" },
                                { value: "off", label: "🚫 Off" },
                            ]} />
                        </WizField>
                    </div>
                )
            }

            <NavRow onBack={onBack} onNext={onNext} onSkip={onSkip} nextLabel="Save & Finish →" nextDisabled={!canProceed} />
        </div >
    );
}

// ─── PAGE 6: Done ─────────────────────────────────────────────────────────────
export function PageDone({ onFinish }) {
    return (
        <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 68, marginBottom: 6 }}>🎉</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: T.text.primary, marginBottom: 6, letterSpacing: "-0.5px" }}>You're All Set</h2>
            <p style={{ fontSize: 14, color: T.text.secondary, lineHeight: 1.7, marginBottom: 24, maxWidth: 300, margin: "0 auto 24px" }}>
                Your profile is live. Here's what you can do next:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28, textAlign: "left" }}>
                {[
                    ["⚡", "Run Your First Audit", "Tap the center button to get personalized AI guidance"],
                    ["🤖", "Ask AI Anything", "Open the chat tab for contextual financial conversation"],
                    ["🏦", "Bank Connections", "Auto-sync balances via Plaid in Settings"],
                    ["💳", "Card Portfolio", "Add your credit cards with limits and APRs"],
                    ["💰", "Income & Budget", "Manage income sources and budget categories"],
                    ["🔄", "Renewals Hub", "Track every subscription and recurring bill"],
                    ["📖", "System Guide", "In-depth reference manual in Settings"],
                ].map(([icon, title, sub]) => (
                    <div key={title} style={{
                        display: "flex", alignItems: "center", gap: 12,
                        background: `linear-gradient(135deg, ${T.bg.elevated}, ${T.bg.base})`,
                        borderRadius: T.radius.lg, padding: "12px 14px",
                        border: `1px solid ${T.border.subtle}`,
                        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04)`,
                    }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                            background: `${T.accent.primary}10`, border: `1px solid ${T.accent.primary}20`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 17,
                        }}>{icon}</div>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, lineHeight: 1.2 }}>{title}</div>
                            <div style={{ fontSize: 11, color: T.text.dim, marginTop: 1, lineHeight: 1.3 }}>{sub}</div>
                        </div>
                    </div>
                ))}
            </div>
            <WizBtn onClick={onFinish} style={{ width: "100%", fontSize: 16 }}>🚀 Go to Dashboard</WizBtn>
        </div>
    );
}
