import { T } from "../constants.js";
import { Card, Label, NoticeBanner } from "../ui.js";

type SettingsMenu = "finance" | "profile" | "ai" | "backup" | "dev" | "security" | "plaid" | "trust" | null;

export function TrustCenterSection({
  activeMenu,
  secretStorageStatus,
  appleLinkedId,
  householdId,
  recoveryVaultId,
  linkedRecoveryVaultId,
  continuityRecoveryVaultId,
  recoveryVaultContinuityEnabled,
  recoveryVaultContinuityHasStoredPassphrase,
  trustedContinuityRecoveryVaultId,
  recoveryVaultTrustedContinuityEnabled,
  recoveryVaultLastSyncTs,
  lastPortableBackupTS,
  lastPortableBackupKind,
}: {
  activeMenu: SettingsMenu;
  secretStorageStatus: {
    mode?: "native-secure" | "native-unavailable" | "web-limited";
    canPersistSecrets?: boolean;
    message?: string;
  } | null | undefined;
  appleLinkedId: string | null | undefined;
  householdId: string | null | undefined;
  recoveryVaultId: string | null | undefined;
  linkedRecoveryVaultId: string | null | undefined;
  continuityRecoveryVaultId: string | null | undefined;
  recoveryVaultContinuityEnabled: boolean | undefined;
  recoveryVaultContinuityHasStoredPassphrase: boolean | undefined;
  trustedContinuityRecoveryVaultId: string | null | undefined;
  recoveryVaultTrustedContinuityEnabled: boolean | undefined;
  recoveryVaultLastSyncTs: number | null | undefined;
  lastPortableBackupTS: number | null | undefined;
  lastPortableBackupKind: string | null | undefined;
}) {
  const portableLabel =
    lastPortableBackupKind === "icloud"
      ? "iCloud backup"
      : lastPortableBackupKind === "spreadsheet-export"
        ? "Encrypted spreadsheet export"
        : lastPortableBackupKind === "encrypted-export"
          ? "Encrypted file export"
          : "Portable backup";

  return (
    <Card style={{ border: `1px solid ${T.border.subtle}`, background: T.bg.card, display: activeMenu === "trust" ? "block" : "none" }}>
      <Label>Trust Center</Label>
      <p style={{ margin: "0 0 14px", fontSize: 12, color: T.text.secondary, lineHeight: 1.6, maxWidth: 620 }}>
        Catalyst keeps core planning data local by default. Optional recovery features store only encrypted payloads, and Plaid credentials stay excluded from exports and manual restores.
      </p>

      <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
        {[
          {
            title: "Local Storage",
            body:
              secretStorageStatus?.canPersistSecrets
                ? "Device secrets can be persisted in secure native storage on this device."
                : secretStorageStatus?.message || "Secure native secret storage is unavailable on this device.",
          },
          {
            title: "Portable Recovery",
            body: lastPortableBackupTS
              ? `${portableLabel} last saved ${new Date(lastPortableBackupTS).toLocaleString()}.`
              : "No portable backup saved yet. Export one before reinstalling or switching devices.",
          },
          {
            title: "Recovery Vault",
            body: recoveryVaultId
              ? `Encrypted Recovery Vault is configured${recoveryVaultLastSyncTs ? ` and last synced ${new Date(recoveryVaultLastSyncTs).toLocaleString()}` : ""}.`
              : "Recovery Vault is not configured yet. Enable it if you want off-device encrypted restore without relying on a file export.",
          },
          {
            title: "Protected Identity Restore",
            body: !recoveryVaultId
              ? "No Recovery Vault is configured yet, so there is nothing to link for faster restore."
              : linkedRecoveryVaultId === recoveryVaultId
                ? "This Recovery Vault is linked to your protected device identity, so a new secure device can auto-discover the vault ID during restore."
                : linkedRecoveryVaultId
                  ? "A different Recovery Vault is currently linked to this protected identity. Syncing this device again will replace that link."
                  : "This Recovery Vault is not linked to a protected device identity yet. Syncing from a secure device will link it automatically.",
          },
          {
            title: "Account-Backed Continuity",
            body: !recoveryVaultId
              ? "No Recovery Vault is configured yet, so account-backed continuity is unavailable."
              : recoveryVaultContinuityEnabled && continuityRecoveryVaultId === recoveryVaultId
                ? recoveryVaultContinuityHasStoredPassphrase
                  ? "Encrypted account-backed continuity is enabled for this Recovery Vault, and this device can refresh that continuity in the background."
                  : "Encrypted account-backed continuity exists for this Recovery Vault, but this device no longer has the local continuity passphrase stored."
                : recoveryVaultContinuityEnabled
                  ? "A different Recovery Vault currently has account-backed continuity enabled for this identity."
                  : "Account-backed continuity is disabled. Enable it to restore with protected identity + your continuity passphrase instead of the Recovery Key.",
          },
          {
            title: "Seamless Account Restore",
            body: !recoveryVaultId
              ? "No Recovery Vault is configured yet, so seamless account restore is unavailable."
              : recoveryVaultTrustedContinuityEnabled && trustedContinuityRecoveryVaultId === recoveryVaultId
                ? "Seamless account restore is enabled. After protected sign-in, Catalyst can return your Recovery Vault key without asking for the Recovery Key or a passphrase."
                : recoveryVaultTrustedContinuityEnabled
                  ? "A different Recovery Vault currently has seamless account restore enabled for this identity."
                  : "Seamless account restore is disabled. Keep it off if you want Recovery Vault keys to remain zero-knowledge.",
          },
          {
            title: "Linked Recovery Channels",
            body: [
              appleLinkedId ? "Apple account restore linked" : "Apple account restore not linked",
              householdId ? `Household sync linked as ${householdId}` : "Household sync not linked",
            ].join(" • "),
          },
        ].map((item) => (
          <div
            key={item.title}
            style={{
              padding: "12px 13px",
              borderRadius: T.radius.md,
              border: `1px solid ${T.border.subtle}`,
              background: T.bg.card,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 800, color: T.text.primary, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 5 }}>
              {item.title}
            </div>
            <div style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.55 }}>{item.body}</div>
          </div>
        ))}
      </div>

      <NoticeBanner
        compact
        tone="info"
        title="What is not preserved"
        message="Raw Plaid access tokens, App Lock secrets, and other secure device credentials are intentionally excluded from exports and recovery payloads."
      />

      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        {[
          {
            title: "Data Custody",
            body: "Catalyst Cash never sells, shares, or mines your data. Your financial profile stays on-device unless you explicitly choose to sync or export.",
          },
          {
            title: "Bank Connections",
            body: "Plaid provides read-only access to your accounts. Catalyst cannot initiate transfers, change passwords, or modify your bank data in any way.",
          },
          {
            title: "Recovery Security",
            body: recoveryVaultTrustedContinuityEnabled
              ? "Portable exports, iCloud backups, and passphrase continuity remain client-encrypted. If you enable seamless account restore, Catalyst stores a server-protected Recovery Vault key so an authenticated restore can happen without another secret."
              : "Cloud backups and Recovery Vault payloads are encrypted before leaving your device, and Catalyst stores only opaque blobs unless you explicitly enable seamless account restore.",
          },
        ].map((item) => (
          <div
            key={item.title}
            style={{
              padding: "12px 13px",
              borderRadius: T.radius.md,
              border: `1px solid ${T.border.subtle}`,
              background: T.bg.card,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 800, color: T.text.primary, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 5 }}>
              {item.title}
            </div>
            <div style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.55 }}>{item.body}</div>
          </div>
        ))}
      </div>

      <a
        href="https://catalystcash.app/privacy"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "block",
          marginTop: 12,
          fontSize: 11,
          color: T.accent.primary,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Read our full Privacy Policy →
      </a>
    </Card>
  );
}
