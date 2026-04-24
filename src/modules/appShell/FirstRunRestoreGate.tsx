import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { T } from "../constants.js";
import { inspectICloudBackup } from "../cloudSync.js";
import {
  canUsePasscodeForAppLock,
  hasMeaningfulLocalData,
  restoreFirstRunICloudBackup,
} from "../firstRunRestore.js";
import { haptic } from "../haptics.js";
import { Loader2, ShieldCheck } from "../icons.js";

const RESTORE_SKIP_SESSION_KEY = "catalyst:first-run-icloud-restore-skipped";

type RestoreStatus = "checking" | "none" | "encrypted-found" | "restoring" | "error" | "skipped";

interface FirstRunRestoreGateProps {
  children: ReactNode;
  onRestoreComplete: () => Promise<void> | void;
  setAppPasscode?: (value: string) => void;
  setRequireAuth?: (value: boolean) => void;
  setIsLocked?: (value: boolean) => void;
}

export default function FirstRunRestoreGate({
  children,
  onRestoreComplete,
  setAppPasscode,
  setRequireAuth,
  setIsLocked,
}: FirstRunRestoreGateProps) {
  const [status, setStatus] = useState<RestoreStatus>("checking");
  const [passcode, setPasscode] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    const checkForBackup = async () => {
      if (Capacitor.getPlatform() === "web" || sessionStorage.getItem(RESTORE_SKIP_SESSION_KEY)) {
        setStatus("none");
        return;
      }

      try {
        const hasLocalData = await hasMeaningfulLocalData();
        if (cancelled) return;
        if (hasLocalData) {
          setStatus("none");
          return;
        }

        const result = await inspectICloudBackup(null);
        if (cancelled) return;
        if (!result.available) {
          setStatus("none");
          return;
        }
        if (result.encrypted && !result.backup) {
          setStatus("encrypted-found");
          return;
        }
        if (result.backup) {
          setStatus("restoring");
          const restore = await restoreFirstRunICloudBackup();
          if (cancelled) return;
          if (restore.restored) {
            await onRestoreComplete();
            setIsLocked?.(false);
            haptic.success();
            return;
          }
        }
        setStatus("none");
      } catch (error) {
        if (cancelled) return;
        setMessage(error instanceof Error ? error.message : "Catalyst could not check iCloud backup.");
        setStatus("error");
      }
    };

    void checkForBackup();
    return () => {
      cancelled = true;
    };
  }, [onRestoreComplete, setIsLocked]);

  const restoreEncryptedBackup = async () => {
    const trimmed = passcode.trim();
    if (!trimmed) {
      setMessage("Enter the App Passcode used on your previous iPhone.");
      return;
    }

    setStatus("restoring");
    setMessage("");
    try {
      const enableNativeAutoBackup = canUsePasscodeForAppLock(trimmed);
      const result = await restoreFirstRunICloudBackup({
        passphrase: trimmed,
        enableNativeAutoBackup,
      });
      if (!result.restored) {
        setMessage(result.reason === "decrypt-failed" ? "That passcode did not unlock the backup." : "Catalyst could not restore this iCloud backup.");
        setStatus("encrypted-found");
        return;
      }
      if (enableNativeAutoBackup) {
        setAppPasscode?.(trimmed);
        setRequireAuth?.(true);
      }
      setIsLocked?.(false);
      await onRestoreComplete();
      haptic.success();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Catalyst could not restore this backup.");
      setStatus("encrypted-found");
    }
  };

  const skipRestore = () => {
    sessionStorage.setItem(RESTORE_SKIP_SESSION_KEY, "1");
    setStatus("skipped");
  };

  if (status === "none" || status === "skipped" || status === "error") return <>{children}</>;

  if (status === "checking" || status === "restoring") {
    return (
      <div style={screenStyle}>
        <div style={cardStyle}>
          <Loader2 size={22} className="spin" color={T.accent.primary} />
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text.primary, marginTop: 14 }}>
            {status === "checking" ? "Checking iCloud for an existing backup…" : "Restoring your Catalyst backup…"}
          </div>
          <p style={bodyTextStyle}>
            {status === "checking"
              ? "If this iPhone uses the same iCloud account, Catalyst can restore before setup."
              : "Keep Catalyst open while your encrypted data is restored."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={screenStyle}>
      <div style={cardStyle}>
        <div style={iconShellStyle}>
          <ShieldCheck size={24} color={T.accent.emerald} />
        </div>
        <div style={{ fontSize: 18, fontWeight: 900, color: T.text.primary, marginTop: 16 }}>
          iCloud backup found
        </div>
        <p style={bodyTextStyle}>
          Enter the App Passcode from your previous device and Catalyst will restore before showing setup. Apple Sign-In is not required for this iCloud restore.
        </p>
        <input
          value={passcode}
          onChange={(event) => setPasscode(event.target.value)}
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          placeholder="Previous App Passcode"
          style={inputStyle}
        />
        {message && <div style={{ fontSize: 12, color: T.status.red, lineHeight: 1.45, marginBottom: 10 }}>{message}</div>}
        <button type="button" onClick={() => void restoreEncryptedBackup()} style={primaryButtonStyle}>
          Restore Backup
        </button>
        <button type="button" onClick={skipRestore} style={secondaryButtonStyle}>
          Set Up as New
        </button>
      </div>
    </div>
  );
}

const screenStyle = {
  width: "100%",
  minHeight: "100dvh",
  display: "grid",
  placeItems: "center",
  padding: 18,
  background: `radial-gradient(circle at 20% 0%, ${T.accent.primary}24, transparent 34%), ${T.bg.base}`,
  fontFamily: T.font.sans,
  boxSizing: "border-box" as const,
};

const cardStyle = {
  width: "100%",
  maxWidth: 430,
  padding: 22,
  borderRadius: 24,
  border: `1px solid ${T.border.default}`,
  background: `linear-gradient(180deg, ${T.bg.elevated}, ${T.bg.card})`,
  boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
  textAlign: "center" as const,
};

const iconShellStyle = {
  width: 54,
  height: 54,
  margin: "0 auto",
  borderRadius: 18,
  display: "grid",
  placeItems: "center",
  background: `${T.accent.emerald}14`,
  border: `1px solid ${T.accent.emerald}30`,
};

const bodyTextStyle = {
  margin: "10px 0 16px",
  color: T.text.secondary,
  fontSize: 13,
  lineHeight: 1.55,
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  height: 48,
  marginBottom: 10,
  borderRadius: 14,
  border: `1px solid ${T.border.default}`,
  background: T.bg.surface,
  color: T.text.primary,
  padding: "0 14px",
  fontSize: 15,
  outline: "none",
};

const primaryButtonStyle = {
  width: "100%",
  border: "none",
  borderRadius: 14,
  padding: "13px 16px",
  background: T.accent.primary,
  color: "#fff",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
};

const secondaryButtonStyle = {
  width: "100%",
  border: "none",
  borderRadius: 14,
  padding: "12px 16px",
  marginTop: 8,
  background: "transparent",
  color: T.text.secondary,
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
};
