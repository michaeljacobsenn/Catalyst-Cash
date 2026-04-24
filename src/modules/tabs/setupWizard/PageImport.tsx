import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { normalizeAppError } from "../../appErrors.js";
import { restoreBackupPayload } from "../../backup.js";
import { inspectICloudBackup } from "../../cloudSync.js";
import { T } from "../../constants.js";
import { decrypt, isEncrypted } from "../../crypto.js";
import { sanitizeManualInvestmentHoldings } from "../../investmentHoldings.js";
import { log } from "../../logger.js";
import {
  fetchRecoveryVaultBackup,
  getRecoveryVaultContinuityState,
  getLinkedRecoveryVaultId,
  parseRecoveryVaultKit,
  recordRecoveryVaultFailure,
  rememberRecoveryVaultRestore,
  restoreRecoveryVaultFromContinuity,
  restoreRecoveryVaultFromTrustedContinuity,
} from "../../recoveryVault.js";
import { restoreSanitizedPlaidConnections } from "../../backup.js";
import UiGlyph from "../../UiGlyph.js";
import { db } from "../../utils.js";
import { NavRow, WizBtn, WizField, WizInput } from "./primitives.js";
import type { BackupPayload, ToastApi } from "./types.js";

const loadWorkbookClientModule = () => import("../../excelWorkbookClient.js");
const loadNativeExportModule = () => import("../../nativeExport.js");

interface PageImportProps {
  onNext: () => void;
  toast?: ToastApi;
  onComplete?: (() => void) | null;
  onImported?: (() => Promise<void> | void) | null;
}

export default function PageImport({
  onNext,
  toast,
  onComplete,
  onImported,
}: PageImportProps) {
  const [importing, setImporting] = useState<boolean>(false);
  const [passphrase, setPassphrase] = useState<string>("");
  const [needsPass, setNeedsPass] = useState<boolean>(false);
  const [pendingParsed, setPendingParsed] = useState<BackupPayload | null>(null);
  const [imported, setImported] = useState<boolean>(false);
  const [loadingLinkedRecoveryId, setLoadingLinkedRecoveryId] = useState<boolean>(false);
  const [detectedLinkedRecoveryId, setDetectedLinkedRecoveryId] = useState<string>("");
  const [hasContinuityEscrow, setHasContinuityEscrow] = useState<boolean>(false);
  const [hasTrustedContinuityEscrow, setHasTrustedContinuityEscrow] = useState<boolean>(false);
  const [continuityPassphrase, setContinuityPassphrase] = useState<string>("");
  const [icloudPasscodeRequired, setIcloudPasscodeRequired] = useState<boolean>(false);
  const [icloudPasscode, setIcloudPasscode] = useState<string>("");
  const [icloudRestoring, setIcloudRestoring] = useState<boolean>(false);
  const [recoveryKit, setRecoveryKit] = useState<string>("");
  const [recoveryVaultId, setRecoveryVaultId] = useState<string>("");
  const [recoveryVaultKey, setRecoveryVaultKey] = useState<string>("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const csvRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (Capacitor.getPlatform() === "web") {
      return () => {
        cancelled = true;
      };
    }

    setLoadingLinkedRecoveryId(true);
    void Promise.all([
      getLinkedRecoveryVaultId().catch(() => null),
      getRecoveryVaultContinuityState().catch(() => ({ recoveryId: null, hasEscrow: false, hasTrustedEscrow: false })),
    ])
      .then(([linkedRecoveryId, continuityState]) => {
        if (cancelled) return;
        if (linkedRecoveryId) {
          setRecoveryVaultId((current) => current || linkedRecoveryId);
          setDetectedLinkedRecoveryId(linkedRecoveryId);
        }
        setHasContinuityEscrow(Boolean(continuityState?.hasEscrow));
        setHasTrustedContinuityEscrow(Boolean(continuityState?.hasTrustedEscrow));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setLoadingLinkedRecoveryId(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const applyBackup = async (backup: BackupPayload): Promise<boolean> => {
    if (backup && backup.type === "spreadsheet-backup") {
      const binaryString = window.atob(backup.base64 || "");
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const { loadWorkbookRows } = await loadWorkbookClientModule();
      const workbook = await loadWorkbookRows(bytes.buffer);
      const sheetName = workbook.sheetNames.find((name) => name.includes("Setup Data")) || workbook.sheetNames[0];
      if (!sheetName) return false;
      const rows = workbook.getSheetRows(sheetName) || [];
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
      await db.set("financial-config", sanitizeManualInvestmentHoldings({ ...existing, ...config, _fromSetupWizard: true }));
      toast?.success?.(`Imported ${Object.keys(config).length} fields from spreadsheet backup`);
      await onImported?.();
      setImported(true);
      return true;
    }

    if (!backup.data || (backup.app !== "Catalyst Cash" && backup.app !== "FinAudit Pro")) {
      toast?.error?.("Not a valid Catalyst Cash backup");
      return false;
    }
    const { count, plaidReconnectCount } = await restoreBackupPayload(backup);
    if (plaidReconnectCount > 0) {
      toast?.info?.(
        `${plaidReconnectCount} bank connection${plaidReconnectCount > 1 ? "s" : ""} need re-linking — go to Settings → Plaid after setup`,
        { duration: 6000 }
      );
    }
    toast?.success?.(`Restored ${count} settings — existing data overwritten`);
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

  const handleICloudRestore = async (passphrase: string | null = null): Promise<void> => {
    setIcloudRestoring(true);
    try {
      const result = await inspectICloudBackup(passphrase);
      if (!result.available) {
        toast?.info?.("No iCloud backup found for this iCloud account yet.");
        return;
      }
      if (result.encrypted && !result.backup) {
        setIcloudPasscodeRequired(true);
        toast?.info?.(
          result.reason === "decrypt-failed"
            ? "That passcode did not unlock the iCloud backup."
            : "Enter the App Passcode used to encrypt this iCloud backup."
        );
        return;
      }
      if (!result.backup?.data) {
        toast?.error?.("The iCloud backup could not be read.");
        return;
      }

      const success = await applyBackup(result.backup);
      if (success && !result.backup.data["plaid-connections-sanitized"]) {
        const plaidConnections = result.backup.data["plaid-connections"];
        const hadPlaid = Array.isArray(plaidConnections) && plaidConnections.length > 0;
        if (hadPlaid) {
          const staleConnections = plaidConnections.map((connection) => ({
            ...connection,
            accessToken: null,
            _needsReconnect: true,
          }));
          await db.set("plaid-connections", staleConnections);
          await restoreSanitizedPlaidConnections(staleConnections);
          setTimeout(() => {
            toast?.warn?.("Your bank accounts need to be re-linked in Settings → Plaid.", { duration: 5000 });
          }, 400);
        }
      }
      if (success) {
        setIcloudPasscodeRequired(false);
        setIcloudPasscode("");
        await onImported?.();
      }
    } catch (error: unknown) {
      const failure = normalizeAppError(error, { context: "restore" });
      toast?.error?.(failure.userMessage || "Catalyst could not restore from iCloud.");
    } finally {
      setIcloudRestoring(false);
    }
  };

  const handleRecoveryVaultRestore = async (): Promise<void> => {
    if (!recoveryVaultId || !recoveryVaultKey) {
      toast?.error?.("Enter both your Recovery Vault ID and Recovery Key.");
      return;
    }
    setImporting(true);
    try {
      const backup = await fetchRecoveryVaultBackup(recoveryVaultId, recoveryVaultKey);
      const success = await applyBackup(backup);
      if (success) {
        await rememberRecoveryVaultRestore(recoveryVaultId);
        await onImported?.();
      }
    } catch (error) {
      const failure = await recordRecoveryVaultFailure(error, { eventName: "recovery_restore_failed" });
      toast?.error?.(failure.userMessage);
    }
    setImporting(false);
  };

  const handleRecoveryKitChange = (value: string): void => {
    setRecoveryKit(value);
    const parsed = parseRecoveryVaultKit(value);
    if (!parsed) return;
    if (parsed.recoveryId) setRecoveryVaultId(parsed.recoveryId);
    if (parsed.recoveryKey) setRecoveryVaultKey(parsed.recoveryKey);
  };

  const handlePasteRecoveryKit = async (): Promise<void> => {
    if (!navigator?.clipboard?.readText) {
      toast?.error?.("Clipboard access is unavailable on this device.");
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      handleRecoveryKitChange(text);
      toast?.success?.("Recovery Kit pasted.");
    } catch {
      toast?.error?.("Could not read from the clipboard.");
    }
  };

  const handleUseLinkedRecoveryId = async (): Promise<void> => {
    setLoadingLinkedRecoveryId(true);
    try {
      const [linkedRecoveryId, continuityState] = await Promise.all([
        getLinkedRecoveryVaultId(),
        getRecoveryVaultContinuityState().catch(() => ({ hasEscrow: false, hasTrustedEscrow: false })),
      ]);
      if (!linkedRecoveryId) {
        toast?.info?.("No linked Recovery Vault was found for this device identity yet.");
        return;
      }
      setRecoveryVaultId(linkedRecoveryId);
      setDetectedLinkedRecoveryId(linkedRecoveryId);
      setHasContinuityEscrow(Boolean(continuityState?.hasEscrow));
      setHasTrustedContinuityEscrow(Boolean(continuityState?.hasTrustedEscrow));
      toast?.success?.("Linked Recovery Vault ID loaded. Enter your Recovery Key to restore.");
    } catch (error) {
      const failure = normalizeAppError(error, { context: "restore" });
      toast?.error?.(failure.userMessage);
    } finally {
      setLoadingLinkedRecoveryId(false);
    }
  };

  const handleRecoveryVaultContinuityRestore = async (): Promise<void> => {
    if (!continuityPassphrase) {
      toast?.error?.("Enter your account sync passphrase.");
      return;
    }
    setImporting(true);
    try {
      const result = await restoreRecoveryVaultFromContinuity(continuityPassphrase);
      const success = await applyBackup(result.backup);
      if (success) {
        setRecoveryVaultId(result.recoveryId);
        setRecoveryVaultKey(result.recoveryKey);
        await rememberRecoveryVaultRestore(result.recoveryId);
        await onImported?.();
      }
    } catch (error) {
      const failure = await recordRecoveryVaultFailure(error, { eventName: "recovery_restore_failed" });
      toast?.error?.(failure.userMessage);
    }
    setImporting(false);
  };

  const handleTrustedRecoveryVaultRestore = async (): Promise<void> => {
    setImporting(true);
    try {
      const result = await restoreRecoveryVaultFromTrustedContinuity();
      const success = await applyBackup(result.backup);
      if (success) {
        setRecoveryVaultId(result.recoveryId);
        setRecoveryVaultKey(result.recoveryKey);
        await rememberRecoveryVaultRestore(result.recoveryId);
        await onImported?.();
      }
    } catch (error) {
      const failure = await recordRecoveryVaultFailure(error, { eventName: "recovery_restore_failed" });
      toast?.error?.(failure.userMessage);
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
    const buf = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event: ProgressEvent<FileReader>) => resolve(event.target?.result as ArrayBuffer);
      reader.onerror = () => reject(new Error("Could not read spreadsheet from iOS filesystem."));
      reader.readAsArrayBuffer(file);
    });
    const { loadWorkbookRows } = await loadWorkbookClientModule();
    const workbook = await loadWorkbookRows(buf);

    const config: Record<string, unknown> = {};

    const getSheetRows = (sheetName: string): Array<Array<string | number>> | null => {
      return workbook.getSheetRows(sheetName);
    };

    const firstSheetName = workbook.sheetNames[0];
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
        await db.set("financial-config", sanitizeManualInvestmentHoldings({ ...existing, ...config, _fromSetupWizard: true }));
        toast?.success?.(`Imported ${Object.keys(config).length} fields — existing values overwritten`);
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
      const { nativeExport } = await loadNativeExportModule();
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
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <UiGlyph glyph="🔑" size={28} color={T.accent.primary} />
        </div>
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
        <UiGlyph glyph="ℹ️" size={14} color={T.accent.primary} style={{ flexShrink: 0, marginTop: 1 }} />
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
          <button type="button"
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
            <UiGlyph glyph={item.icon} size={22} color={T.accent.primary} style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text.primary }}>{item.title}</div>
              <div style={{ fontSize: 12, color: T.text.dim, marginTop: 2 }}>{item.sub}</div>
            </div>
          </button>
        ))}
      </div>

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
          Restore from Recovery Vault
        </div>
        <p style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.5, margin: "0 0 12px 0" }}>
          Paste your Recovery Kit or enter the Recovery ID and Recovery Key you saved when you enabled encrypted cross-device recovery.
        </p>
        {detectedLinkedRecoveryId && recoveryVaultId === detectedLinkedRecoveryId ? (
          <div
            style={{
              marginBottom: 12,
              padding: "10px 12px",
              borderRadius: T.radius.md,
              border: `1px solid ${T.status.green}30`,
              background: `${T.status.green}10`,
              fontSize: 11,
              color: T.status.green,
              lineHeight: 1.5,
            }}
          >
            Linked Recovery Vault ID found for this protected device identity. Enter only your Recovery Key to continue restoring.
          </div>
        ) : null}
        {hasContinuityEscrow && !hasTrustedContinuityEscrow ? (
          <div
            style={{
              marginBottom: 12,
              padding: "10px 12px",
              borderRadius: T.radius.md,
              border: `1px solid ${T.accent.emerald}30`,
              background: `${T.accent.emerald}10`,
              fontSize: 11,
              color: T.accent.emerald,
              lineHeight: 1.5,
            }}
          >
            Account-backed continuity is available for this identity. Enter your account sync passphrase to restore without the Recovery Key.
          </div>
        ) : null}
        {hasTrustedContinuityEscrow ? (
          <div
            style={{
              marginBottom: 12,
              padding: "10px 12px",
              borderRadius: T.radius.md,
              border: `1px solid ${T.status.amber}30`,
              background: `${T.status.amber}10`,
              fontSize: 11,
              color: T.status.amber,
              lineHeight: 1.5,
            }}
          >
            Seamless account restore is available for this identity. After protected sign-in, use that first. Manual Recovery Vault restore remains available below if you prefer recovery material.
          </div>
        ) : null}
        <div style={{ display: "grid", gap: 10 }}>
          <WizField label="Recovery Kit" hint="Paste the full Recovery Kit to fill both fields automatically.">
            <textarea
              value={recoveryKit}
              onChange={(event) => handleRecoveryKitChange(event.target.value)}
              placeholder={"Catalyst Cash Recovery Kit\nRecovery Vault ID: ...\nRecovery Key: ..."}
              aria-label="Recovery Kit"
              autoCapitalize="characters"
              autoCorrect="off"
              className="wiz-input"
              style={{
                width: "100%",
                minHeight: 76,
                padding: "12px 14px",
                borderRadius: T.radius.md,
                background: T.bg.elevated,
                border: `1px solid ${T.border.default}`,
                color: T.text.primary,
                fontSize: 13,
                outline: "none",
                fontFamily: T.font.sans,
                boxSizing: "border-box",
                resize: "vertical",
                lineHeight: 1.4,
              }}
            />
          </WizField>
          <button type="button"
            onClick={() => void handlePasteRecoveryKit()}
            disabled={importing}
            style={{
              width: "100%",
              padding: "11px 14px",
              borderRadius: T.radius.md,
              border: `1px solid ${T.border.default}`,
              background: T.bg.surface,
              color: T.text.primary,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              opacity: importing ? 0.55 : 1,
            }}
          >
            Paste Recovery Kit
          </button>
          {Capacitor.getPlatform() !== "web" && (
            <button type="button"
              onClick={() => void handleUseLinkedRecoveryId()}
              disabled={importing || loadingLinkedRecoveryId}
              style={{
                width: "100%",
                padding: "11px 14px",
                borderRadius: T.radius.md,
                border: `1px solid ${T.border.default}`,
                background: T.bg.surface,
                color: T.text.primary,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                opacity: importing || loadingLinkedRecoveryId ? 0.55 : 1,
              }}
            >
              {loadingLinkedRecoveryId ? "Checking linked identity…" : detectedLinkedRecoveryId ? "Refresh Linked Recovery ID" : "Use Linked Recovery ID"}
            </button>
          )}
          {hasContinuityEscrow && !hasTrustedContinuityEscrow ? (
            <>
              <WizField label="Account Sync Passphrase" hint="Optional encrypted account-backed restore for linked Recovery Vaults.">
                <WizInput
                  type="password"
                  value={continuityPassphrase}
                  onChange={setContinuityPassphrase}
                  placeholder="Enter account sync passphrase"
                  aria-label="Account Sync Passphrase"
                  autoCapitalize="off"
                  autoCorrect="off"
                />
              </WizField>
              <WizBtn onClick={() => void handleRecoveryVaultContinuityRestore()} disabled={importing || continuityPassphrase.length < 10}>
                {importing ? "Restoring…" : "Restore with Account Sync"}
              </WizBtn>
            </>
          ) : null}
          {hasTrustedContinuityEscrow ? (
            <WizBtn onClick={() => void handleTrustedRecoveryVaultRestore()} disabled={importing}>
              {importing ? "Restoring…" : "Restore with Seamless Account Sync"}
            </WizBtn>
          ) : null}
          <WizField label="Recovery Vault ID">
            <WizInput
              value={recoveryVaultId}
              onChange={(value) => setRecoveryVaultId(value.toUpperCase())}
              placeholder="CC-ABCDE-FGHIJ"
              aria-label="Recovery Vault ID"
              autoCapitalize="characters"
              autoCorrect="off"
            />
          </WizField>
          <WizField label="Recovery Key">
            <WizInput
              type="password"
              value={recoveryVaultKey}
              onChange={(value) => setRecoveryVaultKey(value.toUpperCase())}
              placeholder="ABCD-EFGH-IJKL-MNOP"
              aria-label="Recovery Key"
              autoCapitalize="characters"
              autoCorrect="off"
            />
          </WizField>
          <WizBtn onClick={() => void handleRecoveryVaultRestore()} disabled={importing || !recoveryVaultId || !recoveryVaultKey}>
            {importing ? "Checking Vault…" : "Restore from Vault"}
          </WizBtn>
        </div>
      </div>

      {Capacitor.getPlatform() !== "web" && (
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
            Restore from iCloud
          </div>
          <p style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.5, margin: "0 0 10px 0" }}>
            Restore a backup from this iPhone's iCloud account. Apple Sign-In is not required.
          </p>
          {icloudPasscodeRequired && (
            <WizField label="Previous App Passcode">
              <WizInput
                type="password"
                inputMode="numeric"
                value={icloudPasscode}
                onChange={setIcloudPasscode}
                placeholder="Enter the passcode used on your old iPhone"
              />
            </WizField>
          )}
          <button type="button"
            onClick={() => void handleICloudRestore(icloudPasscodeRequired ? icloudPasscode.trim() : null)}
            disabled={icloudRestoring || (icloudPasscodeRequired && !icloudPasscode.trim())}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: T.radius.md,
              border: `1px solid ${T.border.default}`,
              background: T.bg.base,
              color: T.text.primary,
              fontSize: 13,
              fontWeight: 700,
              cursor: icloudRestoring ? "not-allowed" : "pointer",
              opacity: icloudRestoring ? 0.7 : 1,
            }}
          >
            {icloudRestoring ? "Checking iCloud…" : icloudPasscodeRequired ? "Restore Encrypted Backup" : "Check iCloud Backup"}
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
            iCloud restore is available in the native iPhone app. On web, restore from an encrypted export file instead.
          </p>
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
          <button type="button"
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
            <UiGlyph glyph="📗" size={20} color={T.accent.primary} />
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary }}>Excel (.xlsx)</div>
              <div style={{ fontSize: 11, color: T.text.dim }}>Dropdowns included</div>
            </div>
          </button>
          <button type="button"
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
            <UiGlyph glyph="📄" size={20} color={T.accent.primary} />
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
