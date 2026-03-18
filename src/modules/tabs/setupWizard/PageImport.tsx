import { useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import type {
  SetupWizardSecurityState,
  SetupWizardUpdate,
} from "../SetupWizard.js";
import { normalizeAppError } from "../../appErrors.js";
import { downloadFromICloud } from "../../cloudSync.js";
import { T } from "../../constants.js";
import { decrypt, isEncrypted } from "../../crypto.js";
import { log } from "../../logger.js";
import { isSecuritySensitiveKey } from "../../securityKeys.js";
import { db, nativeExport } from "../../utils.js";
import { NavRow, WizBtn, WizField, WizInput } from "./primitives.js";
import type {
  AppleSignInResult,
  BackupPayload,
  ConnectionWithId,
  SpreadsheetModule,
  ToastApi,
} from "./types.js";

const loadAppleSignIn = () => import("@capacitor-community/apple-sign-in");

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

export default function PageImport({
  onNext,
  toast,
  onComplete,
  onImported,
  appleLinkedId,
  setAppleLinkedId,
  security,
  updateSecurity,
}: PageImportProps) {
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
        config[key] = Number.isNaN(num)
          ? rawVal === "true"
            ? true
            : rawVal === "false"
              ? false
              : rawVal
          : num;
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
    for (const [key, value] of Object.entries(backup.data)) {
      if (isSecuritySensitiveKey(key)) continue;
      await db.set(key, value);
      count++;
    }

    const sanitizedPlaid = backup.data["plaid-connections-sanitized"];
    if (Array.isArray(sanitizedPlaid) && sanitizedPlaid.length > 0) {
      const existing = ((await db.get("plaid-connections")) || []) as ConnectionWithId[];
      const existingIds = new Set(existing.map((connection) => connection.id));
      const merged = [...existing];
      for (const connection of sanitizedPlaid) {
        if (
          typeof connection === "object" &&
          connection !== null &&
          "id" in connection &&
          typeof connection.id === "string" &&
          !existingIds.has(connection.id)
        ) {
          merged.push({ ...connection, _needsReconnect: true });
        }
      }
      await db.set("plaid-connections", merged);
      const reconnectCount = sanitizedPlaid.filter(
        (connection) =>
          typeof connection === "object" &&
          connection !== null &&
          "id" in connection &&
          typeof connection.id === "string" &&
          !existingIds.has(connection.id)
      ).length;
      if (reconnectCount > 0) {
        toast?.info?.(
          `🏦 ${reconnectCount} bank connection${reconnectCount > 1 ? "s" : ""} need re-linking — go to Settings → Plaid after setup`,
          { duration: 6000 }
        );
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

    const getSheetRows = (sheetName: string): Array<Array<string | number>> | null => {
      const name = wb.SheetNames.find((namePart) => namePart.includes(sheetName));
      if (!name) return null;
      return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" });
    };

    const firstSheetName = wb.SheetNames[0];
    const setupRows = getSheetRows("Setup Data") || (firstSheetName ? getSheetRows(firstSheetName) : null);
    if (setupRows) {
      for (const row of setupRows) {
        const key = String(row[0] || "").trim();
        const rawVal = String(row[2] ?? "").trim();
        if (!key || !rawVal || key === "field_key" || key.includes("DO NOT EDIT")) continue;
        const num = parseFloat(rawVal);
        config[key] = Number.isNaN(num)
          ? rawVal === "true"
            ? true
            : rawVal === "false"
              ? false
              : rawVal
          : num;
      }
    }

    const parseArraySheet = <T,>(sheetName: string, mapFn: (row: Array<string | number>) => T | null): T[] | undefined => {
      const rows = getSheetRows(sheetName);
      if (!rows || rows.length <= 1) return undefined;
      const items: T[] = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;
        if (!row.some((cell) => String(cell).trim() !== "")) continue;

        const item = mapFn(row);
        if (item) items.push(item);
      }
      return items.length > 0 ? items : undefined;
    };

    config.incomeSources =
      parseArraySheet("Income Sources", (row) => ({
        id: String(row[0] || Date.now() + Math.random()).trim(),
        name: String(row[1] || "Unnamed Source").trim(),
        amount: parseFloat(String(row[2] || 0)) || 0,
        frequency: String(row[3] || "monthly").trim(),
        type: String(row[4] || "active").trim(),
        nextDate: String(row[5] || "").trim(),
      })) || config.incomeSources;

    config.budgetCategories =
      parseArraySheet("Budget Categories", (row) => ({
        id: String(row[0] || Date.now() + Math.random()).trim(),
        name: String(row[1] || "Unnamed Category").trim(),
        allocated: parseFloat(String(row[2] || 0)) || 0,
        group: String(row[3] || "Expenses").trim(),
      })) || config.budgetCategories;

    config.savingsGoals =
      parseArraySheet("Savings Goals", (row) => ({
        id: String(row[0] || Date.now() + Math.random()).trim(),
        name: String(row[1] || "Unnamed Goal").trim(),
        target: parseFloat(String(row[2] || 0)) || 0,
        saved: parseFloat(String(row[3] || 0)) || 0,
      })) || config.savingsGoals;

    config.nonCardDebts =
      parseArraySheet("Non-Card Debts", (row) => ({
        id: String(row[0] || Date.now() + Math.random()).trim(),
        name: String(row[1] || "Unnamed Debt").trim(),
        balance: parseFloat(String(row[2] || 0)) || 0,
        minPayment: parseFloat(String(row[3] || 0)) || 0,
        apr: parseFloat(String(row[4] || 0)) || 0,
      })) || config.nonCardDebts;

    config.otherAssets =
      parseArraySheet("Other Assets", (row) => ({
        id: String(row[0] || Date.now() + Math.random()).trim(),
        name: String(row[1] || "Unnamed Asset").trim(),
        value: parseFloat(String(row[2] || 0)) || 0,
      })) || config.otherAssets;

    return config;
  };

  const handleSpreadsheet = async (file: File): Promise<void> => {
    setImporting(true);
    try {
      const config = await parseSpreadsheet(file);
      if (Object.keys(config).length > 0) {
        const existing = ((await db.get("financial-config")) || {}) as Record<string, unknown>;
        await db.set("financial-config", { ...existing, ...config, _fromSetupWizard: true });
        toast?.success?.(`✅ Imported ${Object.keys(config).length} fields — existing values overwritten`);
        await onImported?.();
        setImported(true);
      } else {
        toast?.error?.("No filled fields found — enter values in the 'Your Value' column");
      }
    } catch (error: unknown) {
      const failure = normalizeAppError(error, { context: "restore" });
      log.error("restore", "Spreadsheet import failed", { error: failure.rawMessage, kind: failure.kind });
      toast?.error?.(failure.userMessage);
    }
    setImporting(false);
  };

  const downloadTemplate = async (url: string, filename: string, mimeType: string): Promise<void> => {
    setImporting(true);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const base64data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result).split(",")[1] || "");
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      await nativeExport(filename, base64data, mimeType, true);
    } catch (error: unknown) {
      const failure = normalizeAppError(error, { context: "restore" });
      log.warn("restore", "Template download failed", { error: failure.rawMessage, kind: failure.kind });
      const message = failure.userMessage || "Download failed";
      if (!message.toLowerCase().includes("cancel")) {
        toast?.error?.(message);
      }
    } finally {
      setImporting(false);
    }
  };

  if (needsPass) {
    return (
      <div>
        <div style={{ fontSize: 40, textAlign: "center", marginBottom: 14 }}>🔑</div>
        <p style={{ fontSize: 14, color: T.text.secondary, textAlign: "center", marginBottom: 20 }}>
          This backup is encrypted. Enter your passphrase to unlock it.
        </p>
        <form onSubmit={(event) => {
          event.preventDefault();
          void handlePassphraseSubmit();
        }}>
          <WizField label="Passphrase">
            <WizInput
              type="password"
              autoComplete="current-password"
              value={passphrase}
              onChange={setPassphrase}
              placeholder="Enter backup passphrase"
            />
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
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="*/*"
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleBackupFile(file);
          event.target.value = "";
        }}
      />
      <input
        ref={csvRef}
        type="file"
        accept="*/*"
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleSpreadsheet(file);
          event.target.value = "";
        }}
      />

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
        ].map((item) => (
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
                const { SignInWithApple } = await loadAppleSignIn();
                if (!SignInWithApple?.authorize) {
                  toast?.error?.("Apple Sign-In is not available in this build.");
                  return;
                }
                const result = (await SignInWithApple.authorize({
                  clientId: "com.jacobsen.portfoliopro",
                  redirectURI: "https://api.catalystcash.app/auth/apple/callback",
                  scopes: "email name",
                })) as AppleSignInResult;
                const userId = result.response.user;
                if (setAppleLinkedId) setAppleLinkedId(userId ?? null);

                toast?.success?.(
                  imported
                    ? "Apple ID linked for future backups."
                    : "Apple ID linked for iCloud backup. Checking for previous data..."
                );

                if (!imported) {
                  const backup = await downloadFromICloud(null);
                  if (backup?.data && typeof backup.data === "object") {
                    const success = await applyBackup(backup);

                    if (success && !backup.data["plaid-connections-sanitized"]) {
                      const plaidConnections = backup.data["plaid-connections"];
                      const hadPlaid = Array.isArray(plaidConnections) && plaidConnections.length > 0;

                      if (hadPlaid) {
                        const staleConnections = plaidConnections.map((connection) => ({
                          ...connection,
                          accessToken: null,
                          _needsReconnect: true,
                        }));
                        await db.set("plaid-connections", staleConnections);

                        setTimeout(() => {
                          toast?.warn?.("Your bank accounts need to be re-linked in Settings → Plaid.", {
                            duration: 5000,
                          });
                        }, 400);
                      }
                    }

                    if (success) {
                      setImported(true);
                      await onImported?.();
                    }
                  } else {
                    toast?.info?.("No iCloud backup found yet.");
                  }
                }
              } catch (error: unknown) {
                const message = error instanceof Error ? error.message : "Apple Sign-In failed";
                if (!message.toLowerCase().includes("cancel")) {
                  toast?.error?.(
                    message.toLowerCase().includes("not implemented") || message.toLowerCase().includes("unimplemented")
                      ? "Apple Sign-In is not enabled in this build."
                      : message
                  );
                }
              }
            }}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: T.radius.md,
              border: `1px solid ${T.border.default}`,
              background: T.bg.base,
              color: T.text.primary,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
             Sign in with Apple
          </button>
        </div>
      )}

      {Capacitor.getPlatform() === "web" && (
        <div
          style={{
            marginBottom: 14,
            padding: "14px 16px",
            background: `${T.status.amber}10`,
            borderRadius: T.radius.md,
            border: `1px solid ${T.status.amber}28`,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: T.status.amber, marginBottom: 4 }}>
            Native-only cloud restore
          </div>
          <p style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.5, margin: 0 }}>
            Apple Sign-In and iCloud restore are intentionally limited to the native iPhone app. On web, restore from an encrypted export file instead.
          </p>
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
            <select
              value={security?.autoBackupInterval || "weekly"}
              onChange={(event) => updateSecurity("autoBackupInterval", event.target.value as SetupWizardSecurityState["autoBackupInterval"])}
              aria-label="iCloud backup interval"
              className="wiz-input"
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
              }}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="off">Off</option>
            </select>
          </WizField>
        </div>
      )}

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
              void downloadTemplate(
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
              void downloadTemplate("/CatalystCash-Setup-Template.csv", "CatalystCash-Setup-Template.csv", "text/csv")
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
            background: `${T.status.green}12`,
            border: `1px solid ${T.status.green}2A`,
            color: T.text.secondary,
            borderRadius: T.radius.lg,
            padding: "16px",
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, color: T.status.green, marginBottom: 4 }}>Import complete</div>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            Your saved data has been applied. Continue setup to review and finish, or jump straight into the app.
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <WizBtn variant="ghost" onClick={onNext} style={{ flex: 1, fontSize: 12 }}>
              Continue Setup
            </WizBtn>
            <WizBtn onClick={() => onComplete && onComplete()} style={{ flex: 1, fontSize: 12 }}>
              Save & Finish
            </WizBtn>
          </div>
        </div>
      )}

      {!imported && <NavRow showBack={false} onNext={onNext} onSkip={onNext} nextLabel="Skip for Now →" />}
    </div>
  );
}
