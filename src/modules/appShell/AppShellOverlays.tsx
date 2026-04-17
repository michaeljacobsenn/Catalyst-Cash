import type { ReactNode } from "react";
import { MapPin } from "../icons";
import { APP_VERSION, T } from "../constants.js";
import UiGlyph from "../UiGlyph.js";
import { GlobalStyles } from "../ui.js";

interface SimulatedNotification {
  title: string;
  body: string;
  store: string;
}

interface ConsentModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}

export function TabFallback() {
  return (
    <div className="skeleton-loader" style={{ padding: "20px 16px" }}>
      <div className="skeleton-block" style={{ height: 48, borderRadius: 14 }} />
      <div className="skeleton-block" style={{ height: 120, borderRadius: 16 }} />
      <div style={{ display: "flex", gap: 10 }}>
        <div className="skeleton-block" style={{ height: 80, flex: 1, borderRadius: 14 }} />
        <div className="skeleton-block" style={{ height: 80, flex: 1, borderRadius: 14 }} />
      </div>
      <div className="skeleton-block" style={{ height: 64, borderRadius: 14 }} />
    </div>
  );
}

export function OfflineBanner() {
  return (
    <div
      style={{
        background: T.status.amberDim,
        borderBottom: `1px solid ${T.status.amber}30`,
        padding: "6px 16px",
        textAlign: "center",
        fontSize: 11,
        color: T.status.amber,
        fontWeight: 600,
        fontFamily: T.font.mono,
        flexShrink: 0,
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <UiGlyph glyph="⚡" size={12} color={T.status.amber} />
        No internet — audits unavailable
      </span>
    </div>
  );
}

export function AiConsentModal({ open, onCancel, onConfirm }: ConsentModalProps) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(4, 7, 12, 0.78)",
        backdropFilter: "blur(14px) saturate(1.15)",
        WebkitBackdropFilter: "blur(14px) saturate(1.15)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          background: T.bg.card,
          borderRadius: T.radius.xl,
          border: `1px solid ${T.border.subtle}`,
          padding: 24,
          boxShadow: T.shadow.elevated,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10, color: T.text.primary }}>AI Data Consent</div>
        <p style={{ fontSize: 13, color: T.text.secondary, lineHeight: 1.6, marginBottom: 20 }}>
          When you run an audit, the financial data you enter is sent to your selected AI provider using your API key.
          We do not sell AI access or store your data on our servers. By continuing, you agree to this data transfer.
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: 14,
              borderRadius: T.radius.lg,
              border: `1px solid ${T.border.default}`,
              background: "transparent",
              color: T.text.secondary,
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => void onConfirm()}
            style={{
              flex: 1,
              padding: 14,
              borderRadius: T.radius.lg,
              border: `1px solid ${T.accent.primary}24`,
              background: `${T.accent.primary}14`,
              color: T.accent.primary,
              fontWeight: 800,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            I Agree
          </button>
        </div>
      </div>
    </div>
  );
}

export function FactoryResetMask({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: T.bg.base,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        animation: "fadeIn 0.3s ease-out forwards",
      }}
    >
      <div
        className="spin"
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          border: `3px solid ${T.border.default}`,
          borderTopColor: T.accent.primary,
        }}
      />
      <p
        style={{
          marginTop: 24,
          fontSize: 13,
          color: T.text.secondary,
          fontWeight: 600,
          fontFamily: T.font.mono,
          letterSpacing: "0.05em",
        }}
      >
        SECURELY ERASING...
      </p>
    </div>
  );
}

export function SimulatedNotificationBanner({
  notification,
  onDismiss,
}: {
  notification: SimulatedNotification | null;
  onDismiss: () => void;
}) {
  if (!notification) return null;
  const isCardRec = notification.body.includes("% back");
  return (
    <>
      <style>{`
        @keyframes slideDownNotif {
          from { opacity: 0; transform: translateY(-16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div
        style={{
          position: "fixed",
          top: "calc(env(safe-area-inset-top, 44px) + 8px)",
          left: 12,
          right: 12,
          zIndex: 9999,
          background: T.bg.card,
          borderRadius: 20,
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          boxShadow: T.shadow.elevated,
          border: `1px solid ${T.border.subtle}`,
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          animation: "slideDownNotif 0.38s cubic-bezier(0.16,1,0.3,1) both",
          cursor: "pointer",
        }}
        onClick={onDismiss}
        role="alert"
        aria-live="assertive"
      >
        {/* App icon pill */}
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 13,
            background: T.bg.elevated,
            border: `1px solid ${T.border.default}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <MapPin size={22} color={T.accent.primary} strokeWidth={2.3} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>
              {notification.title}
            </span>
            <span style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono, flexShrink: 0, marginLeft: 8 }}>NOW</span>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: isCardRec ? T.accent.primary : T.text.secondary, lineHeight: 1.4, fontWeight: isCardRec ? 700 : 400 }}>
            {notification.body}
          </p>
        </div>
      </div>
    </>
  );
}

export function LoadingScreen() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100dvh",
        background: T.bg.base,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <GlobalStyles />
      <style>{`
@keyframes loadBarFill { 0% { width: 18%; } 50% { width: 62%; } 100% { width: 88%; } }
@keyframes textReveal { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: translateY(0); } }
@keyframes softDrift { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
      `}</style>
      <div
        style={{
          width: "min(320px, calc(100vw - 40px))",
          padding: "28px 24px 24px",
          borderRadius: 28,
          border: `1px solid ${T.border.subtle}`,
          background: T.bg.card,
          boxShadow: T.shadow.elevated,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          animation: "textReveal .45s ease-out both",
        }}
      >
        <div
          style={{
            width: 88,
            height: 88,
            marginBottom: 22,
            padding: 10,
            borderRadius: 28,
            background: T.bg.elevated,
            border: `1px solid ${T.border.default}`,
            animation: "softDrift 3.2s ease-in-out infinite",
          }}
        >
          <img
            src="/icon-512.png"
            alt=""
            style={{
              width: "100%",
              height: "100%",
              borderRadius: 20,
              display: "block",
            }}
          />
        </div>
      <h1 style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 6, animation: "textReveal .6s ease-out .12s both" }}>
        Catalyst Cash
      </h1>
      <p
        style={{
          fontSize: 11,
          color: T.text.dim,
          fontFamily: T.font.mono,
          letterSpacing: "0.08em",
          fontWeight: 700,
          textTransform: "uppercase",
          marginBottom: 10,
          animation: "textReveal .6s ease-out .18s both",
        }}
      >
        Preparing your dashboard
      </p>
      <p style={{ margin: "0 0 20px", fontSize: 13, lineHeight: 1.55, color: T.text.secondary, animation: "textReveal .6s ease-out .24s both" }}>
        Loading your local record, weekly summary, and restore state.
      </p>
      <div
        style={{
          width: "100%",
          height: 6,
          borderRadius: 999,
          background: T.bg.elevated,
          overflow: "hidden",
          animation: "textReveal .6s ease-out .3s both",
          position: "relative",
        }}
      >
        <div
          style={{
            height: "100%",
            borderRadius: 999,
            background: `linear-gradient(90deg, ${T.accent.primary}, ${T.accent.emerald})`,
            animation: "loadBarFill 3s ease-out forwards",
          }}
        />
      </div>
      <p
        style={{
          fontSize: 9,
          color: T.text.muted,
          fontFamily: T.font.mono,
          marginTop: 16,
          animation: "textReveal .6s ease-out .36s both",
          opacity: 0.55,
        }}
      >
        v{APP_VERSION}
      </p>
      </div>
    </div>
  );
}

export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100dvh",
      maxWidth: 800,
      margin: "0 auto",
      background: T.bg.base,
      position: "relative",
      display: "flex",
      flexDirection: "column",
      fontFamily: T.font.sans,
        overflow: "hidden",
      }}
    >
      <GlobalStyles />
      {children}
    </div>
  );
}
