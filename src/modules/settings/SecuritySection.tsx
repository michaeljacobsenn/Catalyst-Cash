  import { T } from "../constants.js";
  import { haptic } from "../haptics.js";
  import { ExternalLink,Loader2,Shield } from "../icons";
  import { getConnections,removeConnection } from "../plaid.js";
  import { runSecurityDataDeletion } from "../recoveryFlows.js";
  import { deleteSecureItem } from "../secureStore.js";
  import { Card,Label,ListRow,ListSection,NoticeBanner } from "../ui.js";
  import { db } from "../utils.js";

const Toggle = ({ value, onChange, ariaLabel, disabled = false }) => (
  <button
    type="button"
    onClick={() => onChange(!value)}
    aria-label={ariaLabel}
    aria-disabled={disabled}
    disabled={disabled}
    style={{
      width: 48,
      height: 28,
      minWidth: 48,
      minHeight: 28,
      borderRadius: 14,
      border: "none",
      padding: 0,
      margin: 0,
      WebkitAppearance: "none",
      appearance: "none",
      background: value ? T.accent.primary : T.text.muted,
      cursor: disabled ? "not-allowed" : "pointer",
      position: "relative",
      flexShrink: 0,
      transition: "background .25s ease",
      boxShadow: value ? `0 0 10px ${T.accent.primaryDim}` : "none",
      opacity: disabled ? 0.6 : 1,
    }}
  >
    <div
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        background: "white",
        position: "absolute",
        top: 3,
        left: value ? 23 : 3,
        transition: "left .25s cubic-bezier(.16,1,.3,1)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
      }}
    />
  </button>
);

export default function SecuritySection({
  activeMenu,
  appPasscode,
  handlePasscodeChange,
  requireAuth,
  handleRequireAuthToggle,
  useFaceId,
  handleUseFaceIdToggle,
  biometricToggleBusy,
  secretStorageStatus,
  lockTimeout,
  setLockTimeout,
  confirmDataDeletion,
  setConfirmDataDeletion,
  deletionInProgress,
  setDeletionInProgress,
  onConfirmDataDeletion,
}) {
  const nativeUnavailable = secretStorageStatus?.mode === "native-unavailable";
  const webLimited = secretStorageStatus?.mode === "web-limited";
  const secureControlsDisabled = nativeUnavailable || webLimited;

  return (
    <Card
      style={{ borderLeft: `3px solid ${T.status.red}40`, display: activeMenu === "security" ? "block" : "none" }}
    >
      <Label>Security Suite</Label>
      {(nativeUnavailable || webLimited) && (
        <NoticeBanner
          tone={nativeUnavailable ? "error" : "warning"}
          compact
          style={{ marginBottom: 14 }}
          title={nativeUnavailable ? "Secure Storage Unavailable" : "Native-Only Security On Web"}
          message={secretStorageStatus?.message}
        />
      )}
      <ListSection style={{ marginBottom: 18 }}>
        <ListRow
          title="App Passcode (4 Digits)"
          description="Required failsafe before enabling App Lock"
          action={
            <>
              <form onSubmit={e => e.preventDefault()}>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={appPasscode || ""}
                  onChange={handlePasscodeChange}
                  placeholder="••••"
                  aria-label="App passcode"
                  autoComplete="new-password"
                  disabled={secureControlsDisabled}
                  style={{
                    width: 68,
                    padding: "10px 8px",
                    borderRadius: T.radius.md,
                    border: `1px solid ${T.border.default}`,
                    background: T.bg.elevated,
                    color: T.text.primary,
                    fontSize: 16,
                    textAlign: "center",
                    letterSpacing: 4,
                    fontFamily: T.font.mono,
                    opacity: secureControlsDisabled ? 0.45 : 1,
                    cursor: secureControlsDisabled ? "not-allowed" : "text",
                  }}
                />
              </form>
              {appPasscode?.length === 4 && (() => {
                const pin = appPasscode;
                const allSame = /^(.)\1{3}$/.test(pin);
                const sequential = ["0123", "1234", "2345", "3456", "4567", "5678", "6789", "9876", "8765", "7654", "6543", "5432", "4321", "3210"].includes(pin);
                const isWeak = allSame || sequential;
                const strengthLabel = isWeak ? "Weak" : "Good";
                const strengthColor = isWeak ? T.status.amber : T.status.green;
                return (
                  <div style={{ marginTop: 6, fontSize: 10, fontWeight: 700, color: strengthColor, textAlign: "right" }}>
                    {strengthLabel}
                    {isWeak && (
                      <span style={{ fontWeight: 500, color: T.text.muted, display: "block", marginTop: 2 }}>
                        {allSame ? "Avoid repeated digits" : "Avoid sequences"}
                      </span>
                    )}
                  </div>
                );
              })()}
            </>
          }
        />

        <ListRow
          title="Require Passcode"
          description="Lock app natively on launch or background"
          isLast={!requireAuth}
          style={{ opacity: appPasscode?.length === 4 ? 1 : 0.5 }}
          action={
            <div style={{ pointerEvents: secureControlsDisabled ? "none" : "auto", opacity: secureControlsDisabled ? 0.45 : 1 }}>
              <Toggle value={requireAuth} onChange={handleRequireAuthToggle} ariaLabel="Require Passcode" />
            </div>
          }
        />

      {requireAuth && (
        <>
          <ListRow
            title="Enable Face ID / Touch ID"
            description={biometricToggleBusy ? "Verifying biometrics..." : "Use biometrics for faster unlocking"}
            action={
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  pointerEvents: secureControlsDisabled || biometricToggleBusy ? "none" : "auto",
                  opacity: secureControlsDisabled ? 0.45 : 1,
                }}
              >
                {biometricToggleBusy ? <Loader2 size={14} style={{ color: T.text.muted, animation: "spin 1s linear infinite" }} /> : null}
                <Toggle
                  value={useFaceId}
                  onChange={handleUseFaceIdToggle}
                  ariaLabel="Enable Face ID / Touch ID"
                  disabled={secureControlsDisabled || biometricToggleBusy}
                />
              </div>
            }
          />
          <ListRow
            title="Relock After"
            description="Time before requiring re-authentication"
            isLast
            action={
              <select
                value={lockTimeout}
                onChange={e => {
                  const v = parseInt(e.target.value);
                  setLockTimeout(v);
                  db.set("lock-timeout", v);
                }}
                aria-label="Relock timeout"
                style={{
                  fontSize: 12,
                  padding: "8px 12px",
                  borderRadius: T.radius.md,
                  border: `1px solid ${T.border.default}`,
                  background: T.bg.elevated,
                  color: T.text.primary,
                  fontFamily: T.font.mono,
                  fontWeight: 600,
                }}
              >
                <option value={0}>Immediately</option>
                <option value={60}>1 minute</option>
                <option value={300}>5 minutes</option>
                <option value={900}>15 minutes</option>
                <option value={1800}>30 minutes</option>
                <option value={3600}>1 hour</option>
                <option value={-1}>Never</option>
              </select>
            }
          />
        </>
      )}
      </ListSection>

      <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${T.border.subtle}` }}>
        <Label>Legal & Privacy</Label>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          <button
            style={{
              textAlign: "left",
              padding: "12px 16px",
              borderRadius: T.radius.md,
              background: T.bg.elevated,
              border: `1px solid ${T.border.default}`,
              color: T.text.primary,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
            onClick={() => window.open("https://catalystcash.app/privacy", "_blank")}
          >
            <span>Privacy Policy</span>
            <ExternalLink size={14} color={T.text.dim} />
          </button>
          <button
            style={{
              textAlign: "left",
              padding: "12px 16px",
              borderRadius: T.radius.md,
              background: T.bg.elevated,
              border: `1px solid ${T.border.default}`,
              color: T.text.primary,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
            onClick={() => window.open("https://catalystcash.app/terms", "_blank")}
          >
            <span>Terms of Service</span>
            <ExternalLink size={14} color={T.text.dim} />
          </button>
          <NoticeBanner
            tone="warning"
            compact
            title="AI Disclaimer"
            message="Catalyst Cash is not a fiduciary and does not replace licensed financial, tax, or legal advice. Use AI guidance to frame decisions, not to bypass professional judgment."
          />
          <NoticeBanner
            tone="info"
            compact
            title="Privacy"
            message="Core financial data stays on-device. Chat history is encrypted at rest, auto-expires after 24 hours, and AI requests are scrubbed before leaving the device."
          />

          {/* CCPA/GDPR Data Deletion */}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border.subtle}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text.secondary, marginBottom: 6 }}>
              Your Data Rights (CCPA / GDPR)
            </div>
            <p style={{ fontSize: 10, color: T.text.muted, lineHeight: 1.5, margin: "0 0 10px" }}>
              Under the California Consumer Privacy Act (CCPA) and General Data Protection Regulation (GDPR),
              you have the right to request deletion of all personal data.
            </p>
            {!confirmDataDeletion ? (
              <button
                onClick={() => {
                  setConfirmDataDeletion(true);
                  haptic.medium();
                }}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: T.radius.md,
                  border: `1px solid ${T.status.red}30`,
                  background: T.status.redDim,
                  color: T.status.red,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  transition: "all .2s",
                }}
              >
                <Shield size={14} />
                Request Data Deletion
              </button>
            ) : (
              <div
                style={{
                  padding: 14,
                  borderRadius: T.radius.md,
                  background: T.status.redDim,
                  border: `1px solid ${T.status.red}40`,
                  animation: "fadeIn .3s ease-out",
                }}
              >
                <p
                  style={{
                    fontSize: 11,
                    color: T.status.red,
                    fontWeight: 600,
                    margin: "0 0 8px",
                    lineHeight: 1.5,
                  }}
                >
                  This will permanently erase all data from your device:
                </p>
                <ul
                  style={{
                    fontSize: 10,
                    color: T.text.secondary,
                    lineHeight: 1.6,
                    margin: "0 0 12px",
                    paddingLeft: 16,
                  }}
                >
                  <li>All financial data, audit history, and settings</li>
                  <li>Encrypted chat history and session memory</li>
                  <li>All connected bank accounts (Plaid access revoked)</li>
                  <li>API keys and secure keychain items</li>
                </ul>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setConfirmDataDeletion(false)}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      borderRadius: T.radius.md,
                      border: "none",
                      background: "transparent",
                      color: T.status.red,
                      opacity: 0.8,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    disabled={deletionInProgress}
                    onClick={async () => {
                      setDeletionInProgress(true);
                        haptic.heavy();
                      try {
                        await runSecurityDataDeletion(onConfirmDataDeletion, async () => {
                          const conns = await getConnections().catch(() => []) as Array<{ id?: string }>;
                          for (const conn of conns) {
                            if (!conn?.id) continue;
                            await removeConnection(conn.id).catch(() => {});
                          }
                          await db.clear();
                          await deleteSecureItem("app-passcode").catch(() => false);
                          await deleteSecureItem("plaid-connections").catch(() => false);
                        });
                      } catch {
                        setDeletionInProgress(false);
                        setConfirmDataDeletion(false);
                      }
                    }}
                    style={{
                      flex: 2,
                      padding: "10px 0",
                      borderRadius: T.radius.md,
                      border: "none",
                      background: T.status.red,
                      color: "white",
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: deletionInProgress ? "wait" : "pointer",
                      opacity: deletionInProgress ? 0.7 : 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    {deletionInProgress ? <Loader2 size={12} className="spin" /> : <Shield size={12} />}
                    {deletionInProgress ? "Deleting..." : "Confirm Deletion"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
