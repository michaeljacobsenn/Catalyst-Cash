import type { Dispatch, SetStateAction } from "react";
import { T } from "../constants.js";
import { Label } from "../ui.js";

interface HouseholdModalProps {
  open: boolean;
  hsInputId: string;
  hsInputPasscode: string;
  setHsInputId: Dispatch<SetStateAction<string>>;
  setHsInputPasscode: Dispatch<SetStateAction<string>>;
  onClose: () => void;
  onSave: () => Promise<void> | void;
}

interface PassphraseModalProps {
  open: boolean;
  mode: "export" | "import";
  label: string;
  value: string;
  setValue: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function HouseholdSyncModal({
  open,
  hsInputId,
  hsInputPasscode,
  setHsInputId,
  setHsInputPasscode,
  onClose,
  onSave,
}: HouseholdModalProps) {
  if (!open) return null;
  return (
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
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, color: T.text.primary }}>Household Sync (E2EE)</div>
        <p style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.6, marginBottom: 16 }}>
          Sync your finances with a partner across devices securely. Data is End-to-End Encrypted before leaving your
          device. Enter a shared ID and Passcode below, or clear them to disconnect.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onSave();
          }}
        >
          <Label>Household ID (E.g. SmithFamily)</Label>
          <input
            type="text"
            value={hsInputId}
            onChange={(e) => setHsInputId(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: T.radius.md,
              border: `1px solid ${T.border.default}`,
              background: T.bg.base,
              color: T.text.primary,
              fontSize: 14,
              marginBottom: 12,
              outline: "none",
            }}
          />
          <Label>Shared Passcode (Encryption Key)</Label>
          <input
            type="password"
            value={hsInputPasscode}
            onChange={(e) => setHsInputPasscode(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: T.radius.md,
              border: `1px solid ${T.border.default}`,
              background: T.bg.base,
              color: T.text.primary,
              fontSize: 14,
              marginBottom: 20,
              outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
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
              type="submit"
              style={{
                flex: 1,
                padding: "12px 0",
                borderRadius: T.radius.md,
                border: "none",
                background: T.accent.primary,
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Save & Sync
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function PassphraseModal({
  open,
  mode,
  label,
  value,
  setValue,
  onCancel,
  onConfirm,
}: PassphraseModalProps) {
  if (!open) return null;
  const shouldAutoFocus = typeof window !== "undefined" && Boolean(window.matchMedia?.("(pointer:fine)").matches);
  return (
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
          {mode === "export" ? "Encrypt Backup" : "Decrypt Backup"}
        </div>
        <p style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.6, marginBottom: 16 }}>{label}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onConfirm();
          }}
        >
          <input
            type="password"
            autoFocus={shouldAutoFocus}
            placeholder="Passphrase"
            aria-label="Backup passphrase"
            autoComplete={mode === "export" ? "new-password" : "current-password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancel();
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
              onClick={onCancel}
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
              type="submit"
              disabled={!value}
              style={{
                flex: 1,
                padding: "12px 0",
                borderRadius: T.radius.md,
                border: "none",
                background: value ? T.accent.primary : T.text.muted,
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                cursor: value ? "pointer" : "not-allowed",
              }}
            >
              {mode === "export" ? "Encrypt & Export" : "Decrypt"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
