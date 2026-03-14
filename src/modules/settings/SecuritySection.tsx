import { ExternalLink, Shield, Loader2 } from "lucide-react";
import { T } from "../constants.js";
import { Card, Label } from "../ui.js";
import { db } from "../utils.js";
import { haptic } from "../haptics.js";
import { getConnections, removeConnection } from "../plaid.js";
import { deleteSecureItem } from "../secureStore.js";

const Toggle = ({ value, onChange, ariaLabel }) => (
  <button
    onClick={() => onChange(!value)}
    aria-label={ariaLabel}
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
      cursor: "pointer",
      position: "relative",
      flexShrink: 0,
      transition: "background .25s ease",
      boxShadow: value ? `0 0 10px ${T.accent.primaryDim}` : "none",
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
  lockTimeout,
  setLockTimeout,
  confirmDataDeletion,
  setConfirmDataDeletion,
  deletionInProgress,
  setDeletionInProgress,
}) {
  return (
    <Card
      style={{ borderLeft: `3px solid ${T.status.red}40`, display: activeMenu === "security" ? "block" : "none" }}
    >
      <Label>Security Suite</Label>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 0",
          borderBottom: `1px solid ${T.border.subtle}`,
        }}
      >
        <div style={{ flex: 1, paddingRight: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>App Passcode (4 Digits)</span>
          <p style={{ fontSize: 10, color: T.text.muted, marginTop: 2 }}>
            Required failsafe before enabling App Lock
          </p>
        </div>
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
            style={{
              width: 60,
              padding: 8,
              borderRadius: T.radius.md,
              border: `1px solid ${T.border.default}`,
              background: T.bg.elevated,
              color: T.text.primary,
              fontSize: 16,
              textAlign: "center",
              letterSpacing: 4,
              fontFamily: T.font.mono,
            }}
          />
        </form>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 0",
          borderBottom: requireAuth ? `1px solid ${T.border.subtle}` : "none",
          opacity: appPasscode?.length === 4 ? 1 : 0.5,
        }}
      >
        <div style={{ flex: 1, paddingRight: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Require Passcode</span>
          <p style={{ fontSize: 10, color: T.text.muted, marginTop: 2 }}>
            Lock app natively on launch or background
          </p>
        </div>
        <Toggle value={requireAuth} onChange={handleRequireAuthToggle} ariaLabel="Require Passcode" />
      </div>

      {requireAuth && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 0",
              borderBottom: `1px solid ${T.border.subtle}`,
            }}
          >
            <div style={{ flex: 1, paddingRight: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.text.primary }}>
                Enable Face ID / Touch ID
              </span>
              <p style={{ fontSize: 10, color: T.text.muted, marginTop: 2 }}>
                Use biometrics for faster unlocking
              </p>
            </div>
            <Toggle value={useFaceId} onChange={handleUseFaceIdToggle} ariaLabel="Enable Face ID / Touch ID" />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 0",
            }}
          >
            <div style={{ flex: 1, paddingRight: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.text.primary }}>Relock After</span>
              <p style={{ fontSize: 10, color: T.text.muted, marginTop: 2 }}>
                Time before requiring re-authentication
              </p>
            </div>
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
          </div>
        </>
      )}

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
          <div
            style={{
              padding: "12px 16px",
              borderRadius: T.radius.md,
              background: `${T.status.amber}08`,
              border: `1px solid ${T.status.amber}20`,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: T.status.amber, marginBottom: 4 }}>
              ⚠️ AI Disclaimer
            </div>
            <p style={{ fontSize: 10, color: T.text.muted, lineHeight: 1.5, margin: 0 }}>
              Catalyst Cash is not a financial advisor and does not act in a fiduciary capacity. All
              AI-generated insights are for informational and educational purposes only. Always consult a
              licensed financial professional before making significant financial decisions.
            </p>
          </div>
          <p style={{ fontSize: 10, color: T.text.muted, lineHeight: 1.5, marginTop: 4 }}>
            🔒 Your core financial data is stored locally on your device. Chat history is encrypted at rest and
            auto-expires after 24 hours. AI requests are routed through our secure backend proxy with PII
            scrubbing.
          </p>

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
                        // 1. Disconnect all Plaid connections
                        const conns = await getConnections().catch(() => []);
                        for (const conn of conns) {
                          await removeConnection(conn.id).catch(() => { });
                        }
                        // 2. Clear all device storage
                        await db.clear();
                        // 3. Clear web storage
                        try {
                          localStorage.clear();
                        } catch { }
                        try {
                          sessionStorage.clear();
                        } catch { }
                        // 4. Clear secure keychain items
                        try {
                          await deleteSecureItem("app-passcode");
                        } catch { }
                        try {
                          await deleteSecureItem("plaid-connections");
                        } catch { }
                        // 5. Reload
                        window.location.reload();
                      } catch (e) {
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
