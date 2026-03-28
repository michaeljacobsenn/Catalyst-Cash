  import { useEffect,useState } from "react";
  import { Capacitor } from "@capacitor/core";
  import { T } from "../constants.js";
  import { clearErrorLog,getErrorLog } from "../errorReporter.js";
  import { CheckCircle,Cloud,Download,Loader2,Upload } from "../icons";
  import { clearLogs,getLogsAsText } from "../logger.js";
  import { Card,Label,NoticeBanner } from "../ui.js";
  import { db } from "../utils.js";

export default function BackupSection({ activeMenu, ...props }) {
  const {
    backupStatus,
    restoreStatus,
    statusMsg,
    setStatusMsg,
    handleExport,
    handleExportSheet,
    handleImport,
    householdId,
    setShowHouseholdModal,
    appleLinkedId,
    secretStorageStatus,
    handleAppleSignIn,
    unlinkApple,
    autoBackupInterval,
    setAutoBackupInterval,
    lastBackupTS,
    isForceSyncing,
    forceICloudSync,
    onClear,
    onClearDemoData,
    onFactoryReset,
    confirmClear,
    setConfirmClear,
    confirmFactoryReset,
    setConfirmFactoryReset,
  } = props;
  const [householdMergeReport, setHouseholdMergeReport] = useState<{ overwrittenKeys?: string[] } | null>(null);
  const [householdConflict, setHouseholdConflict] = useState<{ overwrittenKeys?: string[] } | null>(null);

  const isWeb = Capacitor.getPlatform() === "web";
  const householdSupported = Boolean(secretStorageStatus?.canPersistSecrets);
  const cloudBackupSupported = !isWeb;
  const prettifyKeys = (keys: string[] = []) =>
    keys
      .map((key) => ({
        "financial-config": "Financial Profile",
        "card-portfolio": "Cards",
        "bank-accounts": "Bank Accounts",
        renewals: "Bills & Renewals",
        "personal-rules": "Personal Rules",
        "audit-history": "Audit History",
        "current-audit": "Current Audit",
      }[String(key)] || String(key).replace(/-/g, " ")))
      .slice(0, 4);

  useEffect(() => {
    let cancelled = false;
    if (activeMenu !== "backup") return () => { cancelled = true; };
    void Promise.all([
      db.get("household-last-merge-report"),
      db.get("household-last-conflict"),
    ]).then(([mergeReport, conflict]) => {
      if (cancelled) return;
      setHouseholdMergeReport(mergeReport || null);
      setHouseholdConflict(conflict || null);
    });
    return () => {
      cancelled = true;
    };
  }, [activeMenu, householdId]);

  return (
    <>
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
              desc: cloudBackupSupported
                ? "Backups can be saved to your private iCloud Drive and restored on another iPhone using the same Apple ID."
                : "Automatic cloud sync is available in the native iPhone app only.",
            },
            {
              n: "2",
              title: "Export Backup",
              desc: "Export creates an encrypted .enc backup you can save to Files, iCloud Drive, or AirDrop to a new phone.",
            },
            {
              n: "3",
              title: "New Device",
              desc: "On your new iPhone, open Settings \u2192 tap RESTORE \u2192 choose your Catalyst Cash backup. Data rehydrates in-app, and bank connections may still need reconnecting.",
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

        {/* Household Cloud sync section */}
        <div style={{ padding: "16px 14px", background: householdId ? T.accent.primaryDim : T.bg.elevated, borderRadius: T.radius.md, border: `1px solid ${householdId ? T.accent.primary + '30' : T.border.default}`, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  background: householdId ? T.accent.primary : T.bg.base,
                  border: `1px solid ${householdId ? "transparent" : T.border.default}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Cloud size={16} color={householdId ? "#fff" : T.text.muted} />
              </div>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: householdId ? T.accent.primary : T.text.primary, display: "flex", alignItems: "center", gap: 6 }}>
                  Household Cloud {householdId && <CheckCircle size={12} color={T.accent.primary} />}
                </span>
                <p style={{ fontSize: 11, color: T.text.secondary, marginTop: 4, lineHeight: 1.4 }}>
                  {householdId
                    ? `Linked as: ${householdId}`
                    : householdSupported
                      ? "End-to-End Encrypted Cloud Sync"
                      : "Native iPhone feature for shared encrypted sync"}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                if (!householdSupported) return;
                setShowHouseholdModal(true);
              }}
              disabled={!householdSupported}
              style={{ padding: "8px 14px", background: householdId ? "none" : T.accent.primary, border: householdId ? `1px solid ${T.accent.primary}50` : "none", color: householdId ? T.accent.primary : "#fff", borderRadius: T.radius.sm, fontSize: 12, fontWeight: 700, cursor: householdSupported ? "pointer" : "not-allowed", transition: "all 0.2s", opacity: householdSupported ? 1 : 0.5 }}
            >
              {householdId ? "Manage" : "Setup"}
            </button>
          </div>
          {!householdSupported && (
            <p style={{ margin: "10px 0 0 0", fontSize: 11, color: T.text.secondary, lineHeight: 1.5 }}>
              Shared household sync stores sync credentials in secure device storage, so it is intentionally limited to the native iPhone app.
            </p>
          )}
          {householdId && (householdConflict || (householdMergeReport?.overwrittenKeys?.length || 0) > 0) && (
            <div
              style={{
                marginTop: 12,
                padding: "12px 12px 10px",
                borderRadius: T.radius.md,
                border: `1px solid ${householdConflict ? T.status.amber : T.border.default}`,
                background: householdConflict ? `${T.status.amber}10` : T.bg.card,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: householdConflict ? T.status.amber : T.text.primary, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                    {householdConflict ? "Sync Review Needed" : "Last Household Merge"}
                  </div>
                  <div style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.55, marginTop: 4 }}>
                    {householdConflict
                      ? `A newer device changed ${householdConflict.overwrittenKeys?.length || 0} section${(householdConflict.overwrittenKeys?.length || 0) === 1 ? "" : "s"} in your local profile.`
                      : `Last sync merged ${householdMergeReport?.overwrittenKeys?.length || 0} section${(householdMergeReport?.overwrittenKeys?.length || 0) === 1 ? "" : "s"} from another device.`}
                  </div>
                </div>
                {householdConflict && (
                  <button
                    onClick={async () => {
                      await db.del("household-last-conflict");
                      setHouseholdConflict(null);
                    }}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: `1px solid ${T.border.default}`,
                      background: "transparent",
                      color: T.text.dim,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Dismiss
                  </button>
                )}
              </div>
              {((householdConflict?.overwrittenKeys?.length || 0) > 0 || (householdMergeReport?.overwrittenKeys?.length || 0) > 0) && (
                <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {prettifyKeys(householdConflict?.overwrittenKeys || householdMergeReport?.overwrittenKeys || []).map((label) => (
                    <span
                      key={label}
                      style={{
                        padding: "5px 8px",
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 700,
                        background: T.bg.glass,
                        color: T.text.secondary,
                        border: `1px solid ${T.border.subtle}`,
                      }}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Status banner */}
        {statusMsg && (
          <NoticeBanner
            compact
            style={{ marginBottom: 12 }}
            tone={backupStatus === "error" || restoreStatus === "error" ? "error" : "success"}
            title={backupStatus === "error" || restoreStatus === "error" ? "Backup Issue" : "Backup Update"}
            message={statusMsg}
          />
        )}

        {/* Export / Restore buttons */}
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            padding: 10,
            borderRadius: T.radius.lg,
            border: `1px solid ${T.border.subtle}`,
            background: `linear-gradient(180deg, ${T.bg.elevated}, ${T.bg.card})`,
            marginBottom: 4,
          }}
        >
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
              accept=".enc,.json,application/json,application/octet-stream,text/plain"
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
              RESTORE (.enc / .json)
            </div>
          </div>
        </div>

        <p style={{ marginTop: 10, fontSize: 11, color: T.text.muted, lineHeight: 1.55 }}>
          Restores apply your saved settings, planning data, and sanitized account metadata. Plaid balances and
          transaction access stay protected server-side, so restored bank connections may still show
          <span style={{ color: T.text.secondary }}> Reconnect required</span>.
        </p>

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
                      "\n\n\u2550\u2550\u2550 ERROR TELEMETRY \u2550\u2550\u2550\n" +
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
                } catch (e: unknown) {
                  setStatusMsg(`Export failed: ${e instanceof Error ? e.message : "Unknown error"}`);
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

        {/* ── Auto-Backup ────────────────────────────────────── */}
        <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${T.border.subtle}` }}>
          <Label>Auto-Backup</Label>
          <p style={{ fontSize: 11, color: T.text.muted, marginBottom: 16, lineHeight: 1.6 }}>
            {cloudBackupSupported
              ? "Enable Apple Sign-In to save encrypted backups to your private iCloud Drive. They can then be restored on another iPhone using the same Apple ID."
              : "Apple Sign-In and iCloud backup are available in the native iPhone app only. On web, use encrypted export files instead of automatic cloud backup."}
          </p>

          {/* Apple / iCloud */}
          <div style={{ marginBottom: 10 }}>
            {!cloudBackupSupported ? (
              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: 12,
                  background: `${T.status.amber}10`,
                  border: `1px solid ${T.status.amber}25`,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: T.status.amber, marginBottom: 6 }}>
                  Native iPhone feature
                </div>
                <div style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.55 }}>
                  Use encrypted `.enc` exports on web. Automatic iCloud backup and Apple Sign-In are intentionally disabled outside the native app.
                </div>
              </div>
            ) : appleLinkedId ? (
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
                        iCloud Backup Enabled
                      </div>
                      <div style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono, marginTop: 2 }}>
                        {lastBackupTS
                          ? `Last backup: ${new Date(lastBackupTS).toLocaleString()}`
                          : "Pending first backup..."}
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
                      Backups are securely saved to your private iCloud Drive. The app keeps the latest backup plus
                      the last 4 historical snapshots.
                      <br />
                      <span style={{ color: T.text.muted, fontWeight: 600 }}>
                        Files App &rarr; iCloud Drive &rarr; Catalyst Cash &rarr; CatalystCash_CloudSync*.json
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

      {/* ── Danger Zone ─────────────────────────────────────── */}
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
    </>
  );
}
