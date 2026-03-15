  import React,{
    useEffect,
    useRef,
    useState,
    type ButtonHTMLAttributes,
    type ChangeEvent,
    type CSSProperties,
    type ReactNode,
  } from "react";
// xlsx is loaded dynamically to reduce initial bundle size
  import { SignInWithApple } from "@capacitor-community/apple-sign-in";
  import { Capacitor } from "@capacitor/core";
  import type {
    HousingType,
    IncomeType,
    PaycheckDepositAccount,
    Payday,
    PayFrequency,
  } from "../../types/index.js";
  import { downloadFromICloud } from "../cloudSync.js";
  import { T } from "../constants.js";
  import type { BackupInterval,ThemeMode } from "../contexts/SettingsContext.js";
  import { decrypt,isEncrypted } from "../crypto.js";
  import { CURRENCIES } from "../currency.js";
  import { haptic } from "../haptics.js";
  import {
    applyBalanceSync,
    autoMatchAccounts,
    connectBank,
    fetchBalancesAndLiabilities,
    getConnections,
    saveConnectionLinks,
  } from "../plaid.js";
  import { AI_PROVIDERS } from "../providers.js";
  import { isSecuritySensitiveKey } from "../securityKeys.js";
  import { InlineTooltip } from "../ui.js";
  import { db,FaceId,nativeExport } from "../utils.js";
  import type {
    SetupWizardAiState,
    SetupWizardCombinedData,
    SetupWizardSecurityState,
    SetupWizardSpendingState,
    SetupWizardUpdate,
  } from "./SetupWizard.js";

const ENABLE_PLAID = true;

interface StateOption {
  code: string;
  label: string;
}

interface SelectOption {
  value: string | number;
  label: string;
}

interface ToastApi {
  success?: (message: string, options?: { duration?: number }) => void;
  error?: (message: string, options?: { duration?: number }) => void;
  info?: (message: string, options?: { duration?: number }) => void;
  warn?: (message: string, options?: { duration?: number }) => void;
}

interface BackupPayload {
  app?: string;
  type?: string;
  base64?: string;
  data?: Record<string, unknown>;
}

interface AppleSignInResult {
  response: {
    user?: string | null;
  };
}

interface ConnectionWithId {
  id: string;
  institutionName?: string;
  [key: string]: unknown;
}


interface SpreadsheetModule {
  read: (data: ArrayBuffer, options: { type: "array" }) => {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  utils: {
    sheet_to_json: (sheet: unknown, options: { header: 1; defval: string }) => Array<Array<string | number>>;
  };
}

const typedProviders = AI_PROVIDERS as Array<{
  id: string;
  models: Array<{ id: string; name: string; tier?: string; note?: string; disabled?: boolean; comingSoon?: boolean }>;
}>;

const getWindowToast = (): ToastApi | undefined => (window as Window & { toast?: ToastApi }).toast;

const US_STATES: StateOption[] = [
  { code: "", label: "— Not in the US —" },
  { code: "AL", label: "Alabama" },
  { code: "AK", label: "Alaska 🟢" },
  { code: "AZ", label: "Arizona" },
  { code: "AR", label: "Arkansas" },
  { code: "CA", label: "California" },
  { code: "CO", label: "Colorado" },
  { code: "CT", label: "Connecticut" },
  { code: "DE", label: "Delaware" },
  { code: "DC", label: "District of Columbia" },
  { code: "FL", label: "Florida 🟢" },
  { code: "GA", label: "Georgia" },
  { code: "HI", label: "Hawaii" },
  { code: "ID", label: "Idaho" },
  { code: "IL", label: "Illinois" },
  { code: "IN", label: "Indiana" },
  { code: "IA", label: "Iowa" },
  { code: "KS", label: "Kansas" },
  { code: "KY", label: "Kentucky" },
  { code: "LA", label: "Louisiana" },
  { code: "ME", label: "Maine" },
  { code: "MD", label: "Maryland" },
  { code: "MA", label: "Massachusetts" },
  { code: "MI", label: "Michigan" },
  { code: "MN", label: "Minnesota" },
  { code: "MS", label: "Mississippi" },
  { code: "MO", label: "Missouri" },
  { code: "MT", label: "Montana" },
  { code: "NE", label: "Nebraska" },
  { code: "NV", label: "Nevada 🟢" },
  { code: "NH", label: "New Hampshire 🟢" },
  { code: "NJ", label: "New Jersey" },
  { code: "NM", label: "New Mexico" },
  { code: "NY", label: "New York" },
  { code: "NC", label: "North Carolina" },
  { code: "ND", label: "North Dakota" },
  { code: "OH", label: "Ohio" },
  { code: "OK", label: "Oklahoma" },
  { code: "OR", label: "Oregon" },
  { code: "PA", label: "Pennsylvania" },
  { code: "RI", label: "Rhode Island" },
  { code: "SC", label: "South Carolina" },
  { code: "SD", label: "South Dakota 🟢" },
  { code: "TN", label: "Tennessee 🟢" },
  { code: "TX", label: "Texas 🟢" },
  { code: "UT", label: "Utah" },
  { code: "VT", label: "Vermont" },
  { code: "VA", label: "Virginia" },
  { code: "WA", label: "Washington 🟢" },
  { code: "WV", label: "West Virginia" },
  { code: "WI", label: "Wisconsin" },
  { code: "WY", label: "Wyoming 🟢" },
];

// ─── Shared primitives ────────────────────────────────────────────────────────
interface WizBtnProps {
  children?: ReactNode;
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
  type?: ButtonHTMLAttributes<HTMLButtonElement>["type"];
  variant?: "primary" | "ghost" | "skip";
  disabled?: boolean;
  style?: CSSProperties;
}

export const WizBtn = ({ children, onClick, type = "button", variant = "primary", disabled = false, style = {} }: WizBtnProps) => {
  const base = {
    padding: "13px 20px",
    borderRadius: T.radius.lg,
    fontWeight: 700,
    fontSize: 14,
    cursor: disabled ? "not-allowed" : "pointer",
    border: "none",
    transition: "opacity .2s",
    opacity: disabled ? 0.4 : 1,
    fontFamily: T.font.sans,
    ...style,
  };
  const v = {
    primary: {
      background: T.accent.primary,
      color: "#fff",
      boxShadow: `inset 0 1px 1px rgba(255,255,255,0.15), 0 4px 14px ${T.accent.primary}40`,
    },
    ghost: { background: "transparent", color: T.text.secondary, border: `1px solid ${T.border.default}` },
    skip: { background: "transparent", color: T.text.dim, border: "none", fontSize: 13, padding: "8px 12px" },
  };
  return (
    <button type={type} onClick={disabled ? undefined : onClick} style={{ ...base, ...v[variant] }}>
      {children}
    </button>
  );
};

interface WizFieldProps {
  label: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
}

export const WizField = ({ label, hint, children }: WizFieldProps) => (
  <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", height: "100%" }}>
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: T.text.secondary,
          marginBottom: 4,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
        }}
      >
        {label}
      </div>
      {hint && <div style={{ fontSize: 11, color: T.text.dim, marginBottom: 6, lineHeight: 1.4 }}>{hint}</div>}
    </div>
    <div style={{ marginTop: "auto", width: "100%" }}>{children}</div>
  </div>
);

export const WizInput = ({
  value,
  onChange,
  placeholder,
  type = "text",
  style = {},
  "aria-label": ariaLabel,
  inputMode,
  pattern,
  autoComplete,
}: {
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  style?: CSSProperties;
  "aria-label"?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  pattern?: string;
  autoComplete?: string;
}) => (
  <input
    className="wiz-input"
    type={type}
    inputMode={inputMode || (type === "number" ? "decimal" : undefined)}
    pattern={pattern || (type === "number" ? "[0-9]*" : undefined)}
    value={value}
    onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
    placeholder={placeholder}
    aria-label={ariaLabel || placeholder}
    autoComplete={autoComplete}
    style={{
      width: "100%",
      height: 44,
      padding: "0 14px",
      borderRadius: T.radius.md,
      background: T.bg.elevated,
      border: `1px solid ${T.border.default}`,
      color: T.text.primary,
      fontSize: 14,
      outline: "none",
      fontFamily: T.font.sans,
      boxSizing: "border-box",
      transition: "all 0.2s",
      ...style,
    }}
  />
);

export const WizSelect = ({
  value,
  onChange,
  options,
  "aria-label": ariaLabel,
}: {
  value: string | number;
  onChange: (value: string) => void;
  options: Array<SelectOption | string | number>;
  "aria-label"?: string;
}) => (
  <select
    className="wiz-input"
    value={value}
    onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
    aria-label={ariaLabel}
    style={{
      width: "100%",
      height: 44,
      padding: "0 14px",
      borderRadius: T.radius.md,
      background: T.bg.elevated,
      border: `1px solid ${T.border.default}`,
      color: T.text.primary,
      fontSize: 14,
      outline: "none",
      fontFamily: T.font.sans,
      boxSizing: "border-box",
      transition: "all 0.2s",
      appearance: "none",
      WebkitAppearance: "none",
      backgroundImage: `url('data:image/svg+xml;utf8,<svg fill="%238E8E93" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5z"/><path d="M0 0h24v24H0z" fill="none"/></svg>')`,
      backgroundRepeat: "no-repeat",
      backgroundPositionX: "calc(100% - 8px)",
      backgroundPositionY: "center",
    }}
  >
    {options.map((option) => {
      const normalized =
        typeof option === "string" || typeof option === "number"
          ? { value: option, label: String(option) }
          : option;
      return (
      <option key={String(normalized.value)} value={normalized.value} style={{ background: T.bg.elevated }}>
        {normalized.label}
      </option>
      );
    })}
  </select>
);

export const WizToggle = ({
  label,
  sub,
  checked,
  onChange,
}: {
  label: ReactNode;
  sub?: ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
}) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", gap: 12 }}>
    <div>
      <div style={{ fontSize: 14, color: T.text.primary }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: T.text.dim, marginTop: 2 }}>{sub}</div>}
    </div>
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: 44,
        height: 26,
        borderRadius: 13,
        cursor: "pointer",
        background: checked ? T.accent.primary : T.bg.surface,
        border: `1px solid ${checked ? T.accent.primary : T.border.default}`,
        position: "relative",
        transition: "background .2s",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 3,
          left: checked ? 21 : 3,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: checked ? "#fff" : T.text.dim,
          transition: "left .2s",
        }}
      />
    </div>
  </div>
);

// ─── NavRow: Back / Next ──────────────────────────────────────────────────────
export const NavRow = ({
  onBack,
  onNext,
  nextLabel = "Next →",
  nextDisabled = false,
  showBack = true,
}: {
  onBack?: () => void;
  onNext: () => void;
  onSkip?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  showBack?: boolean;
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginTop: 20,
      paddingTop: 16,
      paddingBottom: 16,
      position: "sticky",
      bottom: -40,
      zIndex: 10,
      background: `linear-gradient(to top, ${T.bg.base} 80%, ${T.bg.base}00 100%)`,
    }}
  >
    {showBack ? (
      <WizBtn variant="ghost" onClick={onBack} style={{ flex: "0 0 auto", minWidth: 80 }}>
        ← Back
      </WizBtn>
    ) : (
      <div style={{ flex: "0 0 80px" }} />
    )}
    <WizBtn onClick={onNext} disabled={nextDisabled} style={{ flex: 1, minWidth: 100, maxWidth: 200 }}>
      {nextLabel}
    </WizBtn>
  </div>
);

// ─── PAGE 0: Welcome ──────────────────────────────────────────────────────────
export function PageWelcome({ onNext }: { onNext: () => void }) {
  const [accepted, setAccepted] = useState(false);
  return (
    <div style={{ textAlign: "center" }}>
      {/* Premium App Icon Hero */}
      <div
        style={{
          position: "relative",
          width: 88,
          height: 88,
          margin: "0 auto 16px",
          borderRadius: 22,
          overflow: "visible",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: -6,
            borderRadius: 28,
            background: `conic-gradient(from 180deg, ${T.accent.primary}40, ${T.accent.emerald}40, ${T.accent.primary}40)`,
            filter: "blur(16px)",
            opacity: 0.7,
          }}
        />
        <img
          src="./icon-512.png"
          alt="Catalyst Cash"
          style={{
            width: 88,
            height: 88,
            borderRadius: 22,
            position: "relative",
            boxShadow: `0 8px 32px ${T.accent.primary}30`,
          }}
        />
      </div>

      <p
        style={{
          fontSize: 14,
          color: T.text.secondary,
          lineHeight: 1.7,
          marginBottom: 24,
          maxWidth: 300,
          margin: "0 auto 24px",
        }}
      >
        AI-powered financial intelligence — weekly audits, contextual chat, and bank sync — with local storage and a
        secure AI proxy.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 20, textAlign: "left" }}>
        {[
          ["🛡️", "Private by Design", "Stored on-device, proxied only when needed"],
          ["🧠", "Catalyst AI", "Weekly audits + contextual financial chat"],
          ["🏦", "Bank Sync", "Auto-sync balances via Plaid integration"],
          ["📊", "Full Ledger", "Cards, debts, income, budgets & renewals"],
          ["☁️", "Encrypted Backup", "iCloud auto-sync & .enc archival"],
        ].map(([icon, title, sub]) => (
          <div
            key={title}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: `linear-gradient(135deg, ${T.bg.elevated}, ${T.bg.base})`,
              borderRadius: T.radius.lg,
              padding: "12px 14px",
              border: `1px solid ${T.border.subtle}`,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04)`,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                flexShrink: 0,
                background: `${T.accent.primary}10`,
                border: `1px solid ${T.accent.primary}20`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 17,
              }}
            >
              {icon}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, lineHeight: 1.2 }}>{title}</div>
              <div style={{ fontSize: 11, color: T.text.dim, marginTop: 1, lineHeight: 1.3 }}>{sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Capability Stats */}
      <div
        style={{
          display: "flex",
          gap: 0,
          marginBottom: 20,
          borderRadius: T.radius.lg,
          overflow: "hidden",
          border: `1px solid ${T.border.subtle}`,
        }}
      >
        {[
          { icon: "🧠", stat: "3", label: "AI models" },
          { icon: "🛡️", stat: "100%", label: "On-device" },
          { icon: "🎁", stat: "Free", label: "Core features" },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              padding: "12px 8px",
              textAlign: "center",
              background: T.bg.elevated,
              borderRight: i < 2 ? `1px solid ${T.border.subtle}` : "none",
            }}
          >
            <div style={{ fontSize: 14, marginBottom: 2 }}>{s.icon}</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: T.text.primary, fontFamily: T.font.mono }}>
              {s.stat}
            </div>
            <div style={{ fontSize: 9, color: T.text.dim, fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* How It Works — Value Prop */}
      <div
        style={{
          marginBottom: 20,
          textAlign: "left",
          padding: "16px",
          background: `linear-gradient(160deg, ${T.accent.primary}06, ${T.accent.emerald}06)`,
          borderRadius: T.radius.lg,
          border: `1px solid ${T.accent.primary}15`,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: T.text.secondary,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 12,
          }}
        >
          How It Works
        </div>
        {[
          { step: "1", title: "Enter your numbers", sub: "2 minutes — checking, savings, debts, spending" },
          {
            step: "2",
            title: "AI generates your gameplan",
            sub: "Prioritized actions, debt strategy, and health score",
          },
          { step: "3", title: "Track progress weekly", sub: "Streaks, charts, badges — watch your wealth grow" },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              marginBottom: i < 2 ? 10 : 0,
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                flexShrink: 0,
                background: T.accent.primary,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 900,
                fontFamily: T.font.mono,
                boxShadow: `0 2px 8px ${T.accent.primary}40`,
              }}
            >
              {s.step}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary }}>{s.title}</div>
              <div style={{ fontSize: 11, color: T.text.dim, lineHeight: 1.3 }}>{s.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Legal Disclaimer Acceptance */}
      <div
        style={{
          background: T.bg.elevated,
          border: `1px solid ${T.border.default}`,
          borderRadius: T.radius.lg,
          padding: "14px 16px",
          marginBottom: 20,
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div
            onClick={() => setAccepted(!accepted)}
            role="checkbox"
            aria-checked={accepted}
            aria-label="Accept legal disclaimer"
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              flexShrink: 0,
              marginTop: 1,
              cursor: "pointer",
              background: accepted ? T.accent.primary : "transparent",
              border: `2px solid ${accepted ? T.accent.primary : T.border.default}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s ease",
            }}
          >
            {accepted && <span style={{ color: "#fff", fontSize: 13, fontWeight: 800, lineHeight: 1 }}>✓</span>}
          </div>
          <p style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.6, margin: 0 }}>
            I understand that this app provides{" "}
            <strong style={{ color: T.text.primary }}>AI-generated educational content only</strong> and is{" "}
            <strong style={{ color: T.status.amber }}>
              not a substitute for professional financial, tax, legal, or investment advice
            </strong>
            . I will consult a licensed professional before making financial decisions.
          </p>
        </div>
      </div>

      <WizBtn onClick={onNext} disabled={!accepted} style={{ width: "100%", fontSize: 15 }}>
        Let's Get Started →
      </WizBtn>
    </div>
  );
}

// ─── PAGE 1: Import ───────────────────────────────────────────────────────────
interface PageImportProps {
  onNext: () => void;
  toast?: ToastApi;
  onComplete?: (() => void) | null;
  onImported?: (() => Promise<void> | void) | null;
  appleLinkedId?: string | null;
  setAppleLinkedId?: ((value: string | null) => void) | undefined;
  security: SetupWizardSecurityState;
  updateSecurity: SetupWizardUpdate<SetupWizardSecurityState>;
}

export function PageImport({ onNext, toast, onComplete, onImported, appleLinkedId, setAppleLinkedId, security, updateSecurity }: PageImportProps) {
  const [importing, setImporting] = useState<boolean>(false);
  const [passphrase, setPassphrase] = useState<string>("");
  const [needsPass, setNeedsPass] = useState<boolean>(false);
  const [pendingParsed, setPendingParsed] = useState<BackupPayload | null>(null);
  const [imported, setImported] = useState<boolean>(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const csvRef = useRef<HTMLInputElement | null>(null);

  const applyBackup = async (backup: BackupPayload): Promise<boolean> => {
    if (backup && backup.type === "spreadsheet-backup") {
      const XLSX = (await import("xlsx")) as unknown as SpreadsheetModule;
      const binaryString = window.atob(backup.base64 || "");
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const wb = XLSX.read(bytes.buffer, { type: "array" });
      const sheetName = wb.SheetNames.find((name) => name.includes("Setup Data")) || wb.SheetNames[0];
      if (!sheetName) return false;
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      const config: Record<string, string | number | boolean> = {};
      for (const row of rows) {
        const key = String(row[0] || "").trim();
        const rawVal = String(row[2] ?? "").trim();
        if (!key || !rawVal || key === "field_key" || key === "Config Key") continue;
        const num = parseFloat(rawVal);
        config[key] = isNaN(num) ? (rawVal === "true" ? true : rawVal === "false" ? false : rawVal) : num;
      }
      const existing = ((await db.get("financial-config")) || {}) as Record<string, unknown>;
      await db.set("financial-config", { ...existing, ...config, _fromSetupWizard: true });
      toast?.success?.(`✅ Imported ${Object.keys(config).length} fields from spreadsheet backup`);
      await onImported?.();
      setImported(true);
      return true;
    }

    if (!backup.data || (backup.app !== "Catalyst Cash" && backup.app !== "FinAudit Pro")) {
      toast?.error?.("Not a valid Catalyst Cash backup");
      return false;
    }
    let count = 0;
    for (const [key, val] of Object.entries(backup.data)) {
      if (isSecuritySensitiveKey(key)) continue;
      await db.set(key, val);
      count++; // db.set always overwrites — no duplication
    }

    // Restore sanitized Plaid connections (metadata only, no access tokens)
    // so `autoMatchAccounts` can deduplicate when the user reconnects via Settings → Plaid
    const sanitizedPlaid = backup.data["plaid-connections-sanitized"];
    if (Array.isArray(sanitizedPlaid) && sanitizedPlaid.length > 0) {
      const existing = ((await db.get("plaid-connections")) || []) as ConnectionWithId[];
      const existingIds = new Set(existing.map((connection) => connection.id));
      const merged = [...existing];
      for (const conn of sanitizedPlaid) {
        if (typeof conn === "object" && conn !== null && "id" in conn && typeof conn.id === "string" && !existingIds.has(conn.id)) {
          merged.push({ ...conn, _needsReconnect: true });
        }
      }
      await db.set("plaid-connections", merged);
      const reconnectCount = sanitizedPlaid.filter(
        (connection) => typeof connection === "object" && connection !== null && "id" in connection && typeof connection.id === "string" && !existingIds.has(connection.id)
      ).length;
      if (reconnectCount > 0) {
        toast?.info?.(`🏦 ${reconnectCount} bank connection${reconnectCount > 1 ? "s" : ""} need re-linking — go to Settings → Plaid after setup`, { duration: 6000 });
      }
    }

    toast?.success?.(`✅ Restored ${count} settings — existing data overwritten`);
    setImported(true);
    return true;
  };

  const handleBackupFile = async (file: File): Promise<void> => {
    setImporting(true);
    try {
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event: ProgressEvent<FileReader>) => resolve(String(event.target?.result || ""));
        reader.onerror = () => reject(new Error("Could not read file from iOS filesystem."));
        reader.readAsText(file);
      });
      let parsed: BackupPayload;
      try {
        parsed = JSON.parse(text);
      } catch {
        toast?.error?.("Invalid file — must be .json");
        setImporting(false);
        return;
      }
      if (isEncrypted(parsed)) {
        setPendingParsed(parsed);
        setNeedsPass(true);
        setImporting(false);
        return;
      }
      const success = await applyBackup(parsed);
      if (success) {
        await onImported?.();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Import failed";
      toast?.error?.(message);
    }
    setImporting(false);
  };

  const handlePassphraseSubmit = async (): Promise<void> => {
    if (!passphrase || !pendingParsed) return;
    setImporting(true);
    try {
      const plain = await decrypt(pendingParsed, passphrase);
      const success = await applyBackup(JSON.parse(plain));
      if (success) {
        await onImported?.();
      }
      setNeedsPass(false);
      setPendingParsed(null);
      setPassphrase("");
    } catch {
      toast?.error?.("Wrong passphrase — try again");
    }
    setImporting(false);
  };

  const parseSpreadsheet = async (file: File): Promise<Record<string, unknown>> => {
    const XLSX = (await import("xlsx")) as unknown as SpreadsheetModule;
    const buf = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event: ProgressEvent<FileReader>) => resolve(event.target?.result as ArrayBuffer);
      reader.onerror = () => reject(new Error("Could not read spreadsheet from iOS filesystem."));
      reader.readAsArrayBuffer(file);
    });
    const wb = XLSX.read(buf, { type: "array" });

    const config: Record<string, unknown> = {};

    // Helper to get sheet data
    const getSheetRows = (sheetName: string): Array<Array<string | number>> | null => {
      const name = wb.SheetNames.find((namePart) => namePart.includes(sheetName));
      if (!name) return null;
      return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" });
    };

    // 1. Parse Setup Data (Key/Value list)
    const firstSheetName = wb.SheetNames[0];
    const setupRows = getSheetRows("Setup Data") || (firstSheetName ? getSheetRows(firstSheetName) : null);
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
    const parseArraySheet = <T,>(sheetName: string, mapFn: (row: Array<string | number>) => T | null): T[] | undefined => {
      const rows = getSheetRows(sheetName);
      if (!rows || rows.length <= 1) return undefined;
      const items: T[] = [];
      // Skip header row (index 0)
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;
        // Check if row has any real data (ignore empty rows)
        if (!row.some((cell) => String(cell).trim() !== "")) continue;

        const item = mapFn(row);
        if (item) items.push(item);
      }
      return items.length > 0 ? items : undefined;
    };

    // 2. Parse Arrays
    config.incomeSources =
      parseArraySheet("Income Sources", r => ({
        id: String(r[0] || Date.now() + Math.random()).trim(),
        name: String(r[1] || "Unnamed Source").trim(),
        amount: parseFloat(String(r[2] || 0)) || 0,
        frequency: String(r[3] || "monthly").trim(),
        type: String(r[4] || "active").trim(),
        nextDate: String(r[5] || "").trim(),
      })) || config.incomeSources;

    config.budgetCategories =
      parseArraySheet("Budget Categories", r => ({
        id: String(r[0] || Date.now() + Math.random()).trim(),
        name: String(r[1] || "Unnamed Category").trim(),
        allocated: parseFloat(String(r[2] || 0)) || 0,
        group: String(r[3] || "Expenses").trim(),
      })) || config.budgetCategories;

    config.savingsGoals =
      parseArraySheet("Savings Goals", r => ({
        id: String(r[0] || Date.now() + Math.random()).trim(),
        name: String(r[1] || "Unnamed Goal").trim(),
        target: parseFloat(String(r[2] || 0)) || 0,
        saved: parseFloat(String(r[3] || 0)) || 0,
      })) || config.savingsGoals;

    config.nonCardDebts =
      parseArraySheet("Non-Card Debts", r => ({
        id: String(r[0] || Date.now() + Math.random()).trim(),
        name: String(r[1] || "Unnamed Debt").trim(),
        balance: parseFloat(String(r[2] || 0)) || 0,
        minPayment: parseFloat(String(r[3] || 0)) || 0,
        apr: parseFloat(String(r[4] || 0)) || 0,
      })) || config.nonCardDebts;

    config.otherAssets =
      parseArraySheet("Other Assets", r => ({
        id: String(r[0] || Date.now() + Math.random()).trim(),
        name: String(r[1] || "Unnamed Asset").trim(),
        value: parseFloat(String(r[2] || 0)) || 0,
      })) || config.otherAssets;

    return config;
  };

  const handleSpreadsheet = async (file: File): Promise<void> => {
    setImporting(true);
    try {
      const config = await parseSpreadsheet(file);
      if (Object.keys(config).length > 0) {
        // Full replace of financial-config with imported values merged over defaults
        const existing = ((await db.get("financial-config")) || {}) as Record<string, unknown>;
        await db.set("financial-config", { ...existing, ...config, _fromSetupWizard: true });
        toast?.success?.(`✅ Imported ${Object.keys(config).length} fields — existing values overwritten`);
        await onImported?.();
        setImported(true);
      } else {
        toast?.error?.("No filled fields found — enter values in the 'Your Value' column");
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "unknown error";
      toast?.error?.("Spreadsheet import failed: " + message);
    }
    setImporting(false);
  };

  const downloadTemplate = async (url: string, filename: string, mimeType: string): Promise<void> => {
    setImporting(true);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      // Convert blob to base64 for nativeExport
      const base64data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result).split(",")[1] || "");
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      await nativeExport(filename, base64data, mimeType, true);
    } catch (error: unknown) {
      // Ignore native share cancellation errors, but catch actual failures
      const message = error instanceof Error ? error.message : "Download failed";
      if (!message.toLowerCase().includes("cancel")) {
        toast?.error?.("Download failed: " + message);
      }
    } finally {
      setImporting(false);
    }
  };

  if (needsPass)
    return (
      <div>
        <div style={{ fontSize: 40, textAlign: "center", marginBottom: 14 }}>🔑</div>
        <p style={{ fontSize: 14, color: T.text.secondary, textAlign: "center", marginBottom: 20 }}>
          This backup is encrypted. Enter your passphrase to unlock it.
        </p>
        <form onSubmit={e => { e.preventDefault(); handlePassphraseSubmit(); }}>
          <WizField label="Passphrase">
            <WizInput type="password" autoComplete="current-password" value={passphrase} onChange={setPassphrase} placeholder="Enter backup passphrase" />
          </WizField>
          <div style={{ display: "flex", gap: 10 }}>
            <WizBtn
              type="button"
              variant="ghost"
              onClick={() => {
                setNeedsPass(false);
                setPendingParsed(null);
              }}
              style={{ flex: 1 }}
            >
              Cancel
            </WizBtn>
            <WizBtn type="submit" disabled={!passphrase || importing} style={{ flex: 1 }}>
              {importing ? "Decrypting…" : "Unlock & Import"}
            </WizBtn>
          </div>
        </form>
      </div>
    );

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="*/*"
        style={{ display: "none" }}
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleBackupFile(file);
          e.target.value = "";
        }}
      />
      <input
        ref={csvRef}
        type="file"
        accept="*/*"
        style={{ display: "none" }}
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleSpreadsheet(file);
          e.target.value = "";
        }}
      />

      {/* Override notice */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          background: `${T.accent.primary}12`,
          border: `1px solid ${T.accent.primary}30`,
          borderRadius: T.radius.md,
          padding: "10px 13px",
          marginBottom: 14,
        }}
      >
        <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>ℹ️</span>
        <p style={{ fontSize: 12, color: T.text.secondary, margin: 0, lineHeight: 1.5 }}>
          Importing <strong style={{ color: T.text.primary }}>overwrites</strong> any existing data for the same fields.
          Your PIN and encrypted chats are never touched.
        </p>
      </div>

      {/* Upload actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 14 }}>
        {[
          {
            icon: "📦",
            title: "Restore from Backup",
            sub: "Import a .json backup file (encrypted or plain)",
            onClick: () => fileRef.current?.click(),
          },
          {
            icon: "📊",
            title: "Import Spreadsheet",
            sub: "Import your filled-in .xlsx or .csv template",
            onClick: () => csvRef.current?.click(),
          },
        ].map(item => (
          <button
            key={item.title}
            onClick={item.onClick}
            disabled={importing}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              background: T.bg.elevated,
              border: `1px solid ${T.border.default}`,
              borderRadius: T.radius.lg,
              padding: "14px 16px",
              cursor: "pointer",
              textAlign: "left",
              opacity: importing ? 0.5 : 1,
            }}
          >
            <span style={{ fontSize: 24 }}>{item.icon}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text.primary }}>{item.title}</div>
              <div style={{ fontSize: 12, color: T.text.dim, marginTop: 2 }}>{item.sub}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Apple Sign-In for iCloud Backup & Restore */}
      {Capacitor.getPlatform() !== "web" && !appleLinkedId && (
        <div
          style={{
            marginBottom: 14,
            padding: "14px 16px",
            background: T.bg.elevated,
            borderRadius: T.radius.md,
            border: `1px solid ${T.border.default}`,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, marginBottom: 4 }}>
            ☁️ Restore from iCloud
          </div>
          <p style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.5, margin: "0 0 10px 0" }}>
            Link your Apple ID to instantly restore your latest backup and enable continuous auto-sync.
          </p>
          <button
            onClick={async () => {
              try {
                const result = (await SignInWithApple.authorize({
                  clientId: "com.jacobsen.portfoliopro",
                  redirectURI: "https://api.catalystcash.app/auth/apple/callback",
                  scopes: "email name",
                })) as AppleSignInResult;
                const userId = result.response.user;
                if (setAppleLinkedId) setAppleLinkedId(userId ?? null);

                if (toast) {
                  toast.success?.(imported
                    ? "Apple ID linked for future backups."
                    : "Apple ID linked for iCloud backup. Checking for previous data...");
                }

                if (!imported) {
                  // Explicitly check for iCloud backup immediately after linking
                  const backup = await downloadFromICloud(null);
                  if (backup?.data && typeof backup.data === "object") {
                    const success = await applyBackup(backup);

                    // Handle Plaid connections from older backups that don't have
                    // the newer `plaid-connections-sanitized` key. For new backups,
                    // `applyBackup()` already handled this via the sanitized key.
                    if (success && !backup.data["plaid-connections-sanitized"]) {
                      const plaidConnections = backup.data["plaid-connections"];
                      const hadPlaid = Array.isArray(plaidConnections) && plaidConnections.length > 0;

                      if (hadPlaid) {
                        const staleConnections = plaidConnections.map(conn => ({
                          ...conn,
                          accessToken: null, // Invalidate — requires re-link
                          _needsReconnect: true,
                        }));
                        await db.set("plaid-connections", staleConnections);

                        setTimeout(() => {
                          if (toast) toast.warn?.("Your bank accounts need to be reconnected. Go to Settings → Plaid to re-link.", {
                            duration: 12000,
                          });
                        }, 2000);
                      }
                    }
                    if (success) {
                      await onImported?.();
                    }
                  }
                }
              } catch (error: unknown) {
                console.error("[iCloud] Restore error:", error);
                const message = error instanceof Error ? error.message : "";
                if (toast && !message.toLowerCase().includes("cancel")) toast.error?.("Apple Sign-In cancelled or failed.");
              }
            }}
            style={{
              width: "100%",
              padding: "11px 16px",
              borderRadius: T.radius.md,
              border: "none",
              background: "#000",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            Sign in with Apple
          </button>
        </div>
      )}

      {Capacitor.getPlatform() !== "web" && appleLinkedId && (
        <div style={{ marginBottom: 14 }}>
          <WizField
            label="iCloud Backup Interval"
            hint={
              <>
                How often your data syncs securely to iCloud Drive.
                <br />
                <span style={{ opacity: 0.8 }}>Files App → iCloud Drive → Catalyst Cash</span>
              </>
            }
          >
            <WizSelect
              value={security?.autoBackupInterval || "weekly"}
              onChange={v => updateSecurity("autoBackupInterval", v as BackupInterval)}
              options={[
                { value: "daily", label: "Daily" },
                { value: "weekly", label: "Weekly" },
                { value: "monthly", label: "Monthly" },
                { value: "off", label: "Off" },
              ]}
            />
          </WizField>
        </div>
      )}

      {/* Download templates */}
      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: T.text.secondary,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 8,
          }}
        >
          Download a blank template
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() =>
              downloadTemplate(
                "/CatalystCash-Setup-Template.xlsx",
                "CatalystCash-Setup-Template.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              )
            }
            disabled={importing}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: T.bg.elevated,
              border: `1px solid ${T.border.default}`,
              borderRadius: T.radius.md,
              padding: "12px 14px",
              cursor: "pointer",
              opacity: importing ? 0.5 : 1,
            }}
          >
            <span style={{ fontSize: 20 }}>📗</span>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary }}>Excel (.xlsx)</div>
              <div style={{ fontSize: 11, color: T.text.dim }}>Dropdowns included</div>
            </div>
          </button>
          <button
            onClick={() =>
              downloadTemplate("/CatalystCash-Setup-Template.csv", "CatalystCash-Setup-Template.csv", "text/csv")
            }
            disabled={importing}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: T.bg.elevated,
              border: `1px solid ${T.border.default}`,
              borderRadius: T.radius.md,
              padding: "12px 14px",
              cursor: "pointer",
              opacity: importing ? 0.5 : 1,
            }}
          >
            <span style={{ fontSize: 20 }}>📄</span>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary }}>CSV (.csv)</div>
              <div style={{ fontSize: 11, color: T.text.dim }}>Any spreadsheet app</div>
            </div>
          </button>
        </div>
      </div>

      {imported && (
        <div
          style={{
            background: T.accent.emeraldDim,
            border: `1px solid ${T.accent.emerald}30`,
            borderRadius: T.radius.md,
            padding: "11px 14px",
            marginBottom: 14,
            fontSize: 13,
            color: T.accent.emerald,
            fontWeight: 600,
          }}
        >
          ✅ Import complete — existing data overwritten. Continue setup or skip ahead.
        </div>
      )}

      {imported && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            margin: "16px 0 8px",
            padding: 14,
            background: `${T.status.green}10`,
            border: `1px solid ${T.status.green}30`,
            borderRadius: T.radius.md,
          }}
        >
          <p style={{ fontSize: 13, fontWeight: 700, color: T.status.green, margin: 0, textAlign: "center" }}>
            ✅ Backup imported successfully!
          </p>
          <p style={{ fontSize: 11, color: T.text.secondary, margin: 0, textAlign: "center", lineHeight: 1.5 }}>
            Would you like to continue editing your setup, or go straight to your dashboard?
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <WizBtn variant="ghost" onClick={onNext} style={{ flex: 1, fontSize: 12 }}>
              Continue Setup
            </WizBtn>
            <WizBtn onClick={() => onComplete && onComplete()} style={{ flex: 1, fontSize: 12 }}>
              Go to Dashboard →
            </WizBtn>
          </div>
        </div>
      )}
      {!imported && <NavRow showBack={false} onNext={onNext} onSkip={onNext} nextLabel="Skip for Now →" />}
    </div>
  );
}

interface PageProfileProps {
  data: SetupWizardCombinedData;
  onChange: SetupWizardUpdate<SetupWizardCombinedData>;
  onNext: () => void;
  onBack: () => void;
}

export function PageProfile({ data, onChange, onNext, onBack }: PageProfileProps) {
  return (
    <div>
      {/* Premium Privacy Banner */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
          padding: "14px 16px",
          marginBottom: 20,
          background: `linear-gradient(145deg, ${T.bg.elevated}, ${T.bg.base})`,
          border: `1px solid ${T.border.default}`,
          borderRadius: T.radius.lg,
          boxShadow: `0 4px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05)`,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            flexShrink: 0,
            background: `${T.status.green}15`,
            border: `1px solid ${T.status.green}30`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 0 12px ${T.status.green}20`,
          }}
        >
          <span style={{ fontSize: 16 }}>🛡️</span>
        </div>
        <div>
          <h4
            style={{
              margin: "0 0 4px 0",
              fontSize: 13,
              fontWeight: 800,
              color: T.text.primary,
              letterSpacing: "-0.01em",
            }}
          >
            Private by Design
          </h4>
          <p style={{ margin: 0, fontSize: 12, color: T.text.secondary, lineHeight: 1.5 }}>
            Your core financial data stays stored{" "}
            <strong style={{ color: T.status.green, fontWeight: 600 }}>on-device</strong>. AI requests are routed
            through the Catalyst Cash backend proxy with PII scrubbing, and optional backups sync through your personal
            iCloud/Drive.
          </p>
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <h3
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: T.text.primary,
            margin: "0 0 6px 0",
            letterSpacing: "-0.01em",
          }}
        >
          Demographics & Region
        </h3>
        <p style={{ fontSize: 13, color: T.text.secondary, margin: "0 0 16px 0", lineHeight: 1.5 }}>
          This crucial context helps Catalyst's AI understand your tax burden, retirement timeline, and housing strategy.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <WizField label="Currency" hint="Display currency">
          <WizSelect
            value={data.currencyCode || "USD"}
            onChange={v => onChange("currencyCode", v)}
            options={CURRENCIES.map(c => ({ value: c.code, label: `${c.flag} ${c.code}` }))}
          />
        </WizField>
        <WizField label="State" hint="🟢 = No state income tax">
          <WizSelect
            value={data.stateCode || ""}
            onChange={v => onChange("stateCode", v)}
            options={US_STATES.map(s => ({ value: s.code, label: s.label }))}
          />
        </WizField>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16, marginBottom: 24 }}>
        <WizField label="Birth Year" hint="For retirement timelines">
          <WizInput
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            value={data.birthYear || ""}
            onChange={v => onChange("birthYear", v ? String(Number(v)) : "")}
            placeholder="e.g. 1995"
            aria-label="Birth year"
          />
        </WizField>
        <WizField label="Housing Status" hint="Rent, own, or neither?">
          <WizSelect
            value={data.housingType || ""}
            onChange={v => onChange("housingType", v as HousingType)}
            options={[
              { value: "", label: "Skip / Neither" },
              { value: "rent", label: "🏢 Renter" },
              { value: "own", label: "🏠 Homeowner" },
            ]}
          />
        </WizField>
      </div>

      {(data.housingType === "rent" || data.housingType === "own") && (
        <div style={{ marginBottom: 24, padding: 16, background: T.bg.elevated, borderRadius: T.radius.lg, border: `1px solid ${T.border.subtle}` }}>
          {data.housingType === "rent" && (
            <WizField label="Monthly Rent ($)" hint="Including typical utilities">
              <WizInput
                type="number"
                inputMode="decimal"
                pattern="[0-9]*"
                value={data.monthlyRent || ""}
                onChange={v => onChange("monthlyRent", v)}
                placeholder="e.g. 1500"
              />
            </WizField>
          )}
          {data.housingType === "own" && (
            <WizField label="Total Mortgage Payment ($)" hint="Principal, Interest, Taxes, Insurance (PITI)">
              <WizInput
                type="number"
                inputMode="decimal"
                pattern="[0-9]*"
                value={data.mortgagePayment || ""}
                onChange={v => onChange("mortgagePayment", v)}
                placeholder="e.g. 2500"
              />
            </WizField>
          )}
        </div>
      )}

      <NavRow onNext={onNext} onBack={onBack} nextLabel="Continue →" />
    </div>
  );
}

interface PagePassSharedProps {
  data: SetupWizardCombinedData;
  onChange: SetupWizardUpdate<SetupWizardCombinedData>;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export function PagePass1({ data, onChange, onNext, onBack, onSkip }: PagePassSharedProps) {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h3
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: T.text.primary,
            margin: "0 0 6px 0",
            letterSpacing: "-0.01em",
          }}
        >
          Your Income Story
        </h3>
        <p style={{ fontSize: 13, color: T.text.secondary, margin: 0, lineHeight: 1.5 }}>
          Let's start with the fun part—when you get paid! This framing helps Catalyst build your customized weekly
          projections.
        </p>
      </div>

      <WizField label="How often do you get paid?">
        <WizSelect
          value={data.payFrequency}
          onChange={v => onChange("payFrequency", v as PayFrequency)}
          options={[
            { value: "weekly", label: "📅 Weekly" },
            { value: "bi-weekly", label: "📅 Bi-Weekly (every 2 weeks)" },
            { value: "semi-monthly", label: "📅 Semi-Monthly (1st & 15th)" },
            { value: "monthly", label: "📅 Monthly" },
          ]}
        />
      </WizField>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <WizField label="Payday" hint="Typical day of arrival">
          <WizSelect
            value={data.payday}
            onChange={v => onChange("payday", v as Payday)}
            options={["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]}
          />
        </WizField>
        <WizField label="Deposit Into" hint="Where the funds land">
          <WizSelect
            value={data.paycheckDepositAccount}
            onChange={v => onChange("paycheckDepositAccount", v as PaycheckDepositAccount)}
            options={[
              { value: "checking", label: "🏦 Checking" },
              { value: "savings", label: "🏦 Vault/Savings" },
            ]}
          />
        </WizField>
      </div>

      <WizField label="Income Type" hint="Determines how we calculate your runway">
        <WizSelect
          value={data.incomeType || "salary"}
          onChange={v => onChange("incomeType", v as IncomeType)}
          options={[
            { value: "salary", label: "💼 Salary (Consistent Paychecks)" },
            { value: "hourly", label: "⏱️ Hourly Wage" },
            { value: "variable", label: "📈 Variable (Commission, Gig, Tips)" },
          ]}
        />
      </WizField>

      {(!data.incomeType || data.incomeType === "salary") && (
        <>
          <WizField
            label="Standard Paycheck ($)"
            hint="Your exact net take-home pay per check (after taxes & deductions)"
          >
            <WizInput
              type="number"
              inputMode="decimal"
              pattern="[0-9]*"
              value={data.paycheckStandard}
              onChange={v => onChange("paycheckStandard", v)}
              placeholder="e.g. 2400"
            />
          </WizField>
          <WizField
            label="First-of-Month Paycheck ($)"
            hint="If your first check is lower due to benefits/insurance (Leave blank if same)"
          >
            <WizInput
              type="number"
              inputMode="decimal"
              pattern="[0-9]*"
              value={data.paycheckFirstOfMonth}
              onChange={v => onChange("paycheckFirstOfMonth", v)}
              placeholder="Leave blank if same as above"
            />
          </WizField>
        </>
      )}

      {data.incomeType === "hourly" && (
        <>
          <WizField label="Net Hourly Rate ($)" hint="Your approximate hourly take-home pay after taxes">
            <WizInput
              type="number"
              inputMode="decimal"
              pattern="[0-9]*"
              value={data.hourlyRateNet}
              onChange={v => onChange("hourlyRateNet", v)}
              placeholder="e.g. 24.50"
            />
          </WizField>
          <WizField
            label="Typical Hours per Paycheck"
            hint={`How many hours do you usually work per ${data.payFrequency || "pay period"}?`}
          >
            <WizInput
              type="number"
              inputMode="decimal"
              pattern="[0-9]*"
              value={data.typicalHours}
              onChange={v => onChange("typicalHours", v)}
              placeholder="e.g. 80"
            />
          </WizField>
        </>
      )}

      {data.incomeType === "variable" && (
        <WizField
          label="Average Paycheck ($)"
          hint="Be conservative here. What is a reliable average net pay per check?"
        >
          <WizInput
            type="number"
            inputMode="decimal"
            pattern="[0-9]*"
            value={data.averagePaycheck}
            onChange={v => onChange("averagePaycheck", v)}
            placeholder="e.g. 1500"
          />
        </WizField>
      )}

      <div style={{ margin: "32px 0 16px", borderTop: `1px solid ${T.border.subtle}`, paddingTop: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text.primary, margin: "0 0 6px 0" }}>
          Fun Money & Spending
        </h3>
        <p style={{ fontSize: 12, color: T.text.muted, margin: "0 0 16px 0", lineHeight: 1.5 }}>
          This is your "Spend Allowance"—the cash you plan to spend every week on variable costs like groceries, coffee,
          or dining out. It does <strong>not</strong> include your fixed bills.
        </p>
      </div>

      <WizField
        label="Weekly Spend Allowance ($)"
        hint="The maximum you allow yourself to spend per week on everyday fun/needs."
      >
        <WizInput
          type="number"
          inputMode="decimal"
          pattern="[0-9]*"
          value={data.weeklySpendAllowance}
          onChange={v => onChange("weeklySpendAllowance", v)}
          placeholder="e.g. 300"
        />
      </WizField>
      <p style={{ fontSize: 11, color: T.text.muted, fontStyle: "italic", marginTop: -6, marginBottom: 16 }}>
        💡 Tip: Be totally honest here! If you usually spend $400/wk, put $400. We'll automatically optimize your
        savings around this number.
      </p>

      <WizField
        label="Default APR (%)"
        hint="Used to estimate interest penalties on any newly added, unpaid card balances."
      >
        <WizInput
          type="number"
          inputMode="decimal"
          pattern="[0-9]*"
          value={data.defaultAPR}
          onChange={v => onChange("defaultAPR", v)}
          placeholder="e.g. 24.99"
        />
      </WizField>

      <NavRow onBack={onBack} onNext={onNext} onSkip={onSkip} />
    </div>
  );
}

// ─── PAGE 3: Pass 2 (Boost Accuracy) ─────────────────────────────────────────
export function PagePass2({ data, onChange, onNext, onBack, onSkip }: PagePassSharedProps) {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h3
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: T.text.primary,
            margin: "0 0 6px 0",
            letterSpacing: "-0.01em",
          }}
        >
          Your Wealth Targets
        </h3>
        <p style={{ fontSize: 13, color: T.text.secondary, margin: 0, lineHeight: 1.5 }}>
          Let's set up some guardrails. This helps the AI know when to save extra cash versus when it's safe to invest
          or pay down debt.
        </p>
      </div>

      <WizField
        label={<InlineTooltip term="Floor">Checking Floor ($)</InlineTooltip>}
        hint="The absolute minimum balance you want your checking account to hold at all times."
      >
        <WizInput
          type="number"
          inputMode="decimal"
          pattern="[0-9]*"
          value={data.emergencyFloor}
          onChange={v => onChange("emergencyFloor", v)}
          placeholder="e.g. 1000"
        />
      </WizField>
      <p style={{ fontSize: 11, color: T.text.muted, fontStyle: "italic", marginTop: -6, marginBottom: 16 }}>
        💡 Tip: We recommend setting this to roughly half your monthly expenses so you never overdraft.
      </p>

      <WizField label="Optimal Reserve Target ($)" hint="The ideal balance indicating your checking is fully healthy.">
        <WizInput
          type="number"
          inputMode="decimal"
          pattern="[0-9]*"
          value={data.greenStatusTarget}
          onChange={v => onChange("greenStatusTarget", v)}
          placeholder="e.g. 3000"
        />
      </WizField>

      <WizField
        label={<InlineTooltip term="Emergency reserve">Vault / Emergency Target ($)</InlineTooltip>}
        hint="The total savings goal for your standalone emergency fund."
      >
        <WizInput
          type="number"
          inputMode="decimal"
          pattern="[0-9]*"
          value={data.emergencyReserveTarget}
          onChange={v => onChange("emergencyReserveTarget", v)}
          placeholder="e.g. 15000"
        />
      </WizField>
      <p style={{ fontSize: 11, color: T.text.muted, fontStyle: "italic", marginTop: -6, marginBottom: 16 }}>
        💡 Tip: A 3-6 month runway is the gold standard for bulletproof security.
      </p>

      <div style={{ margin: "32px 0 16px", borderTop: `1px solid ${T.border.subtle}`, paddingTop: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text.primary, margin: "0 0 6px 0" }}>
          Taxes (The boring but important stuff)
        </h3>
        <p style={{ fontSize: 12, color: T.text.muted, margin: "0 0 16px 0", lineHeight: 1.5 }}>
          This helps Catalyst calculate the true ROI of your debt payoff and investments.
        </p>
      </div>

      <WizField label="Marginal Tax Bracket (%)" hint="Your highest combined federal + state income tax bracket.">
        <WizInput
          type="number"
          inputMode="decimal"
          pattern="[0-9]*"
          value={data.taxBracketPercent}
          onChange={v => onChange("taxBracketPercent", v)}
          placeholder="e.g. 24"
        />
      </WizField>

      <WizToggle
        label="1099 / Self-Employed"
        sub="Enables tracking for estimated quarterly tax payments."
        checked={data.isContractor}
        onChange={v => onChange("isContractor", v)}
      />

      <NavRow onBack={onBack} onNext={onNext} onSkip={onSkip} />
    </div>
  );
}

// ─── PAGE 4: Phase 3 (Integrations) ────────────────────────────────────────
interface PagePass3Props {
  ai: SetupWizardAiState;
  updateAi: SetupWizardUpdate<SetupWizardAiState>;
  security: SetupWizardSecurityState;
  updateSecurity: SetupWizardUpdate<SetupWizardSecurityState>;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  spending: SetupWizardSpendingState;
  updateSpending: SetupWizardUpdate<SetupWizardSpendingState>;
  saving: boolean;
  isPro: boolean;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}

export function PagePass3({
  ai,
  updateAi,
  security,
  updateSecurity,
  onNext,
  onBack,
  onSkip,
  spending,
  updateSpending,
  isPro,
  themeMode,
  setThemeMode,
}: PagePass3Props) {
  const provider = typedProviders[0] ?? { id: "backend", models: [] };
  const [confirm, setConfirm] = useState(security.pin || "");
  const [plaidConnecting, setPlaidConnecting] = useState(false);
  const [plaidCount, setPlaidCount] = useState(0);
  const isNative = Capacitor.getPlatform() !== "web";

  // Check existing Plaid connections on mount
  useEffect(() => {
    getConnections()
      .then(c => setPlaidCount(c?.length || 0))
      .catch(() => { });
  }, []);

  const handlePlaidConnect = async () => {
    setPlaidConnecting(true);
    try {
      await connectBank(
        async connection => {
          try {
            const existingCards = (await db.get("cards")) || [];
            const existingBanks = (await db.get("bank-accounts")) || [];
            const existingConfig = (await db.get("financial-config")) || {};
            const plaidInvestments = existingConfig.plaidInvestments || [];
            const cardCatalog = (await db.get("card-catalog")) || [];

            const { newCards, newBankAccounts, newPlaidInvestments } = autoMatchAccounts(
              connection,
              existingCards,
              existingBanks,
              cardCatalog,
              plaidInvestments
            );
            await saveConnectionLinks(connection);

            function mergeUniqueById<T extends { id?: string | null }>(existing: T[] = [], incoming: T[] = []): T[] {
              const ids = new Set(existing.map((item) => item.id).filter(Boolean));
              return [...existing, ...incoming.filter((item) => item.id && !ids.has(item.id))];
            }

            const allCards = mergeUniqueById(existingCards, newCards);
            const allBanks = mergeUniqueById(existingBanks, newBankAccounts);
            const allInvests = mergeUniqueById(plaidInvestments, newPlaidInvestments);

            await db.set("cards", allCards);
            await db.set("bank-accounts", allBanks);
            if (newPlaidInvestments.length > 0) {
              existingConfig.plaidInvestments = allInvests;
              await db.set("financial-config", existingConfig);
            }

            // Fetch live balances
            try {
              const refreshed = await fetchBalancesAndLiabilities(connection.id);
              if (refreshed) {
                const syncData = applyBalanceSync(refreshed, allCards, allBanks, allInvests) as {
                  updatedCards: unknown[];
                  updatedBankAccounts: unknown[];
                  updatedPlaidInvestments?: unknown[];
                };
                await db.set("cards", syncData.updatedCards);
                await db.set("bank-accounts", syncData.updatedBankAccounts);
                if (syncData.updatedPlaidInvestments) {
                  existingConfig.plaidInvestments = syncData.updatedPlaidInvestments;
                  await db.set("financial-config", existingConfig);
                }
                await saveConnectionLinks(refreshed);
              }
            } catch (balErr) {
              console.error("[Plaid] Balance fetch after connect failed:", balErr);
            }
          } catch (err) {
            console.error("[Plaid]", err);
          }
        },
        () => {
          getWindowToast()?.error?.("Failed to link bank");
        }
      );

      const conns = await getConnections();
      setPlaidCount(conns?.length || 0);
      getWindowToast()?.success?.("Bank connected successfully!");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Connection failed";
      if (!message.toLowerCase().includes("exit") && !message.toLowerCase().includes("cancel")) {
        getWindowToast()?.error?.(message || "Connection failed");
      }
    }
    setPlaidConnecting(false);
  };

  const handleFaceIdToggle = async checked => {
    if (!checked) {
      updateSecurity("useFaceId", false);
      return;
    }
    try {
      const res = await FaceId.isAvailable();
      if (!res.isAvailable) {
        getWindowToast()?.error?.("No biometrics set up on this device.");
        return;
      }
      updateSecurity("useFaceId", true);
    } catch {
      getWindowToast()?.error?.("Biometrics unavailable.");
    }
  };

  const pinMismatch = security.pinEnabled && security.pin && confirm && security.pin !== confirm;
  const canProceed = !security.pinEnabled || (security.pin.length >= 4 && !pinMismatch);

  return (
    <div>
      {/* PLAID BANK CONNECTION */}
      {ENABLE_PLAID && (
        <>
          <div style={{ marginBottom: 24 }}>
            <h3
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: T.text.primary,
                margin: "0 0 6px 0",
                letterSpacing: "-0.01em",
              }}
            >
              Connect Your Accounts
            </h3>
            <p style={{ fontSize: 13, color: T.text.secondary, margin: 0, lineHeight: 1.5 }}>
              Let's link the plumbing. We need secure access to your live data to provide real-time optimization and
              catch expensive renewals.
            </p>
          </div>

          <div
            style={{
              padding: "16px",
              marginBottom: 20,
              background: `linear-gradient(145deg, ${T.bg.elevated}, ${T.bg.base})`,
              border: `1px solid ${T.border.default}`,
              borderRadius: T.radius.lg,
              boxShadow: `0 4px 24px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.05)`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  flexShrink: 0,
                  background: `linear-gradient(135deg, #0A85D120, #6C63FF15)`,
                  border: `1px solid #0A85D130`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                }}
              >
                🏦
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: T.text.primary }}>Connect Your Bank</h4>
                <p style={{ margin: 0, fontSize: 11, color: T.text.dim }}>Auto-sync balances securely via Plaid</p>
              </div>
            </div>
            {plaidCount > 0 ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  borderRadius: T.radius.md,
                  background: `${T.status.green}10`,
                  border: `1px solid ${T.status.green}25`,
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 14 }}>✅</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.status.green }}>
                  {plaidCount} bank{plaidCount > 1 ? "s" : ""} connected
                </span>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.5, margin: "0 0 12px 0" }}>
                Instantly pull real-time balances from your checking, savings, and credit accounts. Plaid handles
                authentication directly and Catalyst Cash never stores your bank login credentials.
              </p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => {
                  haptic.medium();
                  void handlePlaidConnect();
                }}
                disabled={plaidConnecting}
                style={{
                  flex: 1,
                  padding: "14px",
                  borderRadius: T.radius.md,
                  border: "none",
                  background: T.accent.primary,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: plaidConnecting ? "not-allowed" : "pointer",
                  opacity: plaidConnecting ? 0.6 : 1,
                  boxShadow: `inset 0 1px 1px rgba(255,255,255,0.15), 0 4px 12px ${T.accent.primary}30`,
                  transition: "all 0.2s",
                }}
              >
                {plaidConnecting ? "Connecting…" : plaidCount > 0 ? "+ Link Another Bank" : "🔗 Link via Plaid"}
              </button>
            </div>
            <p style={{ fontSize: 10, color: T.text.dim, marginTop: 8, textAlign: "center", margin: "8px 0 0 0" }}>
              You can also skip this and enter individual balances manually later.
            </p>
          </div>
        </>
      )}

      {/* RETIREMENT TRACKING */}
      <div style={{ margin: "12px 0", borderTop: `1px solid ${T.border.subtle}`, paddingTop: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, margin: "0 0 4px 0" }}>
          Retirement Tracking
        </h3>
        <p style={{ fontSize: 11, color: T.text.muted, margin: "0 0 16px 0" }}>
          Let the AI optimize your retirement path and estimate tax savings.
        </p>
      </div>

      <WizToggle
        label="Track Roth IRA"
        sub="The AI will direct extra cash here after debts"
        checked={spending.trackRothContributions}
        onChange={v => updateSpending("trackRothContributions", v)}
      />
      {spending.trackRothContributions && (
        <WizField label="Roth Annual Limit ($)" hint="IRS limit for this year">
          <WizInput
            type="number"
            inputMode="decimal"
            pattern="[0-9]*"
            value={spending.rothAnnualLimit}
            onChange={v => updateSpending("rothAnnualLimit", v)}
            placeholder="e.g. 7000"
          />
        </WizField>
      )}

      <WizToggle
        label="Track 401k"
        sub="Factor in employer matches and tax deductions"
        checked={spending.track401k}
        onChange={v => updateSpending("track401k", v)}
      />
      {spending.track401k && (
        <>
          <WizField label="401k Annual Limit ($)" hint="IRS limit for this year">
            <WizInput
              type="number"
              inputMode="decimal"
              pattern="[0-9]*"
              value={spending.k401AnnualLimit}
              onChange={v => updateSpending("k401AnnualLimit", v)}
              placeholder="e.g. 23000"
            />
          </WizField>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <WizField label="Employer Match (%)" hint="e.g. 100 for dollar-for-dollar">
              <WizInput
                type="number"
                inputMode="decimal"
                pattern="[0-9]*"
                value={spending.k401EmployerMatchPct}
                onChange={v => updateSpending("k401EmployerMatchPct", v)}
                placeholder="e.g. 100"
              />
            </WizField>
            <WizField label="Match Ceiling (%)" hint="Up to % of your salary">
              <WizInput
                type="number"
                inputMode="decimal"
                pattern="[0-9]*"
                value={spending.k401EmployerMatchLimit}
                onChange={v => updateSpending("k401EmployerMatchLimit", v)}
                placeholder="e.g. 5"
              />
            </WizField>
          </div>
        </>
      )}

      <WizToggle
        label="Track HSA"
        sub="Triple tax-advantaged health savings"
        checked={spending.trackHSA}
        onChange={v => updateSpending("trackHSA", v)}
      />
      <WizToggle
        label="Track Crypto"
        sub="Monitor your digital assets"
        checked={spending.trackCrypto !== false}
        onChange={v => updateSpending("trackCrypto", v)}
      />

      {/* APP EXPERIENCE */}
      <div style={{ margin: "24px 0 12px", borderTop: `1px solid ${T.border.subtle}`, paddingTop: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, margin: "0 0 4px 0" }}>App Experience</h3>
        <p style={{ fontSize: 11, color: T.text.muted, margin: "0 0 16px 0" }}>
          Choose how Catalyst Cash looks and feels.
        </p>
      </div>

      <WizField label="Theme Mode" hint="System matches your device settings. Select Light or Dark to override.">
        <WizSelect
          value={themeMode || "system"}
          onChange={v => setThemeMode(v as ThemeMode)}
          options={[
            { value: "system", label: "⚙️ System Auto" },
            { value: "dark", label: "🌙 Dark Mode" },
            { value: "light", label: "☀️ Light Mode" },
          ]}
        />
      </WizField>

      {/* AI ENGINE */}
      <div style={{ margin: "24px 0 12px", borderTop: `1px solid ${T.border.subtle}`, paddingTop: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, margin: "0 0 4px 0" }}>AI Intelligence</h3>
        <p style={{ fontSize: 11, color: T.text.muted, margin: "0 0 16px 0" }}>
          Choose how your audits are powered.
        </p>
      </div>

      <WizField label="AI Engine" hint="Catalyst AI handles everything — no configuration needed.">
        <div
          style={{
            padding: "14px 16px",
            background: `${T.status.green}15`,
            border: `1px solid ${T.status.green}30`,
            borderRadius: T.radius.md,
            marginBottom: 16,
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
            Your audits are powered by our secure AI backend. No API keys, no setup — just tap "Run Audit."
          </p>
        </div>
      </WizField>
      {isPro ? (
        <WizField label="Model" hint="Fast AI is selected by default. Switch anytime.">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {provider.models.map(m => {
              const active = ai.aiModel === m.id;
              const isProModel = m.tier === "pro";
              const locked = (isProModel && !isPro) || m.disabled;
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    if (!locked) {
                      updateAi("aiProvider", "backend");
                      updateAi("aiModel", m.id);
                    }
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 14px",
                    borderRadius: T.radius.md,
                    cursor: locked ? "default" : "pointer",
                    opacity: m.disabled ? 0.4 : (isProModel && !isPro) ? 0.5 : 1,
                    background: active ? T.accent.primaryDim : T.bg.elevated,
                    border: `1.5px solid ${active ? T.accent.primary : T.border.default}`,
                    textAlign: "left",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: T.text.primary }}>{m.name}</span>
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
                          }}
                        >
                          SOON
                        </span>
                      ) : isProModel ? (
                        <span
                          style={{
                            fontSize: 8,
                            fontWeight: 800,
                            color: "#FFD700",
                            background: "linear-gradient(135deg, #FFD70020, #FFA50020)",
                            border: "1px solid #FFD70030",
                            padding: "1px 6px",
                            borderRadius: 99,
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
                          }}
                        >
                          FREE
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: T.text.dim }}>{m.comingSoon ? "Coming soon" : m.note}</span>
                  </div>
                  {active && <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.accent.primary }} />}
                </button>
              );
            })}
          </div>
        </WizField>
      ) : (
        <WizField label="AI Model" hint="Free includes Standard AI. Upgrade later for Fast AI and Precision AI.">
          <div
            style={{
              padding: "14px 16px",
              borderRadius: T.radius.md,
              border: `1px solid ${T.border.default}`,
              background: T.bg.elevated,
              fontSize: 12,
              color: T.text.secondary,
              lineHeight: 1.5,
            }}
          >
            Standard AI is enabled automatically on Free. You can unlock Fast AI and Precision AI anytime after setup.
          </div>
        </WizField>
      )}

      {/* SECURITY & BACKUP */}
      <div style={{ margin: "24px 0 12px", borderTop: `1px solid ${T.border.subtle}`, paddingTop: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, margin: "0 0 4px 0" }}>Security & Backup</h3>
        <p style={{ fontSize: 11, color: T.text.muted, margin: "0 0 16px 0" }}>Lock down your on-device data.</p>
      </div>

      <WizToggle
        label="Enable PIN lock"
        sub="Require a PIN to open the app"
        checked={security.pinEnabled}
        onChange={v => updateSecurity("pinEnabled", v)}
      />
      {security.pinEnabled && (
        <>
          <WizField label="Set PIN (4–8 digits)" hint="Numbers only">
            <WizInput
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              value={security.pin}
              onChange={v => updateSecurity("pin", v.replace(/\D/g, "").slice(0, 8))}
              placeholder="e.g. 1234"
            />
          </WizField>
          <WizField label="Confirm PIN">
            <WizInput
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              value={confirm}
              onChange={v => setConfirm(v.replace(/\D/g, "").slice(0, 8))}
              placeholder="Re-enter PIN"
              style={{ borderColor: pinMismatch ? T.status.red : undefined }}
            />
            {pinMismatch && <div style={{ fontSize: 12, color: T.status.red, marginTop: 4 }}>⚠️ PINs don't match</div>}
          </WizField>
          {isNative && (
            <div style={{ marginTop: 8, marginBottom: 16 }}>
              <WizToggle
                label="Enable Face ID / Touch ID"
                sub="Use biometrics for faster unlocking"
                checked={security.useFaceId}
                onChange={handleFaceIdToggle}
              />
            </div>
          )}
        </>
      )}
      <WizField label="Auto-Lock After" hint="How long before the app locks when backgrounded">
        <WizSelect
          value={security.lockTimeout}
          onChange={v => updateSecurity("lockTimeout", Number(v))}
          options={[
            { value: 0, label: "⚡ Immediately" },
            { value: 30, label: "⏱ 30 seconds" },
            { value: 60, label: "⏱ 1 minute" },
            { value: 300, label: "⏱ 5 minutes" },
            { value: 900, label: "⏱ 15 minutes" },
            { value: -1, label: "🔓 Never" },
          ]}
        />
      </WizField>

      <NavRow onBack={onBack} onNext={onNext} onSkip={onSkip} nextLabel="Save & Finish →" nextDisabled={!canProceed} />
    </div>
  );
}

// ─── PAGE 6: Done ─────────────────────────────────────────────────────────────
export function PageDone({ onFinish }: { onFinish: () => void }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 68, marginBottom: 6 }}>🎉</div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: T.text.primary, marginBottom: 6, letterSpacing: "-0.5px" }}>
        You're All Set
      </h2>
      <p
        style={{
          fontSize: 14,
          color: T.text.secondary,
          lineHeight: 1.7,
          marginBottom: 24,
          maxWidth: 300,
          margin: "0 auto 24px",
        }}
      >
        Your profile is live. Here's what you can do next:
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28, textAlign: "left" }}>
        {[
          ["⚡", "Run Your First Audit", "Tap the ⚡ Audit tab for personalized AI guidance"],
          ["🤖", "Ask AI Anything", "Open the chat tab for contextual financial conversation"],
          ["🏦", "Bank Connections", "Auto-sync balances via Plaid in Settings"],
          ["💳", "Card Portfolio", "Add your credit cards with limits and APRs"],
          ["💰", "Income & Budget", "Manage income sources and budget categories"],
          ["🔄", "Renewals Hub", "Track every subscription and recurring bill"],
          ["📖", "System Guide", "In-depth reference manual in Settings"],
        ].map(([icon, title, sub]) => (
          <div
            key={title}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: `linear-gradient(135deg, ${T.bg.elevated}, ${T.bg.base})`,
              borderRadius: T.radius.lg,
              padding: "12px 14px",
              border: `1px solid ${T.border.subtle}`,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04)`,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                flexShrink: 0,
                background: `${T.accent.primary}10`,
                border: `1px solid ${T.accent.primary}20`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 17,
              }}
            >
              {icon}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, lineHeight: 1.2 }}>{title}</div>
              <div style={{ fontSize: 11, color: T.text.dim, marginTop: 1, lineHeight: 1.3 }}>{sub}</div>
            </div>
          </div>
        ))}
      </div>
      <WizBtn onClick={onFinish} style={{ width: "100%", fontSize: 16 }}>
        🚀 Go to Dashboard
      </WizBtn>
    </div>
  );
}
