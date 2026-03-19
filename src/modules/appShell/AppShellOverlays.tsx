import type { ReactNode } from "react";
import { MapPin } from "../icons";
import { APP_VERSION, T } from "../constants.js";
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
      ⚡ NO INTERNET — Audits unavailable
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
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(24px) saturate(1.8)",
        WebkitBackdropFilter: "blur(24px) saturate(1.8)",
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
          boxShadow: `0 24px 48px rgba(0,0,0,0.6), 0 0 0 1px ${T.border.subtle}`,
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
              border: "none",
              background: `linear-gradient(135deg, ${T.accent.primary}, #6C60FF)`,
              color: "white",
              fontWeight: 800,
              cursor: "pointer",
              fontSize: 14,
              boxShadow: `0 4px 12px ${T.accent.primary}40`,
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
  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        left: 16,
        right: 16,
        zIndex: 9999,
        background: `linear-gradient(135deg, ${T.bg.card}, ${T.bg.surface})`,
        borderRadius: T.radius.xl,
        padding: 16,
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        boxShadow: `0 12px 32px rgba(0,0,0,0.8), 0 0 0 1px ${T.border.default}`,
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        animation: "slideDownNotif 0.4s cubic-bezier(0.16,1,0.3,1)",
        cursor: "pointer",
      }}
      onClick={onDismiss}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: T.accent.primaryDim,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <MapPin size={22} color={T.accent.primary} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>
            {notification.title}
          </span>
          <span style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono }}>NOW</span>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: T.text.secondary, lineHeight: 1.4 }}>{notification.body}</p>
      </div>
    </div>
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
@keyframes loadFloat1 { 0%, 100% { transform: translate(0, 0) scale(1); } 33% { transform: translate(30px, -20px) scale(1.1); } 66% { transform: translate(-20px, 10px) scale(0.95); } }
@keyframes loadFloat2 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(-35px, -25px) scale(1.15); } }
@keyframes loadFloat3 { 0%, 100% { transform: translate(0, 0) scale(0.9); } 40% { transform: translate(25px, 15px) scale(1.05); } 80% { transform: translate(-15px, -10px) scale(1); } }
@keyframes ringSweep { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@keyframes iconBloom { 0% { transform: scale(0.7); opacity: 0; filter: blur(8px); } 100% { transform: scale(1); opacity: 1; filter: blur(0); } }
@keyframes iconPulse { 0%, 100% { box-shadow: 0 12px 48px rgba(0,0,0,0.4), 0 0 30px ${T.accent.primary}15; } 50% { box-shadow: 0 16px 56px rgba(0,0,0,0.5), 0 0 60px ${T.accent.primary}30, 0 0 100px ${T.accent.emerald}10; } }
@keyframes glowPulse { 0%, 100% { opacity: 0.15; transform: scale(1); } 50% { opacity: 0.35; transform: scale(1.08); } }
@keyframes particleDrift1 { 0% { transform: translate(0, 0); opacity: 0; } 10% { opacity: 0.6; } 90% { opacity: 0.6; } 100% { transform: translate(40px, -80px); opacity: 0; } }
@keyframes particleDrift2 { 0% { transform: translate(0, 0); opacity: 0; } 15% { opacity: 0.5; } 85% { opacity: 0.5; } 100% { transform: translate(-50px, -70px); opacity: 0; } }
@keyframes particleDrift3 { 0% { transform: translate(0, 0); opacity: 0; } 20% { opacity: 0.4; } 80% { opacity: 0.4; } 100% { transform: translate(30px, -90px); opacity: 0; } }
@keyframes particleDrift4 { 0% { transform: translate(0, 0); opacity: 0; } 10% { opacity: 0.5; } 90% { opacity: 0.3; } 100% { transform: translate(-35px, -60px); opacity: 0; } }
@keyframes loadBarFill { 0% { width: 0%; } 20% { width: 25%; } 50% { width: 55%; } 80% { width: 80%; } 100% { width: 95%; } }
@keyframes textReveal { 0% { opacity: 0; transform: translateY(16px); filter: blur(6px); } 100% { opacity: 1; transform: translateY(0); filter: blur(0); } }
@keyframes subtitlePulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
    `}</style>
      <div
        style={{
          position: "absolute",
          top: "12%",
          left: "5%",
          width: 240,
          height: 240,
          background: `radial-gradient(circle, ${T.accent.primary}20, transparent 70%)`,
          filter: "blur(60px)",
          borderRadius: "50%",
          pointerEvents: "none",
          animation: "loadFloat1 8s ease-in-out infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "15%",
          right: "5%",
          width: 200,
          height: 200,
          background: `radial-gradient(circle, ${T.accent.emerald}18, transparent 70%)`,
          filter: "blur(50px)",
          borderRadius: "50%",
          pointerEvents: "none",
          animation: "loadFloat2 10s ease-in-out infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "55%",
          width: 180,
          height: 180,
          background: "radial-gradient(circle, #6C60FF12, transparent 70%)",
          filter: "blur(55px)",
          borderRadius: "50%",
          pointerEvents: "none",
          animation: "loadFloat3 12s ease-in-out infinite",
        }}
      />
      <div
        style={{
          position: "relative",
          width: 120,
          height: 120,
          marginBottom: 36,
          animation: "iconBloom .8s cubic-bezier(0.16,1,0.3,1) both",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: -20,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${T.accent.primary}30, ${T.accent.emerald}10, transparent 70%)`,
            animation: "glowPulse 3s ease-in-out .6s infinite",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: -8,
            borderRadius: "50%",
            animation: "ringSweep 2.5s linear .4s infinite",
            opacity: 0,
            animationFillMode: "forwards",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background: `conic-gradient(from 0deg, transparent 0%, ${T.accent.primary}60 15%, ${T.accent.emerald}50 30%, transparent 45%)`,
              mask: "radial-gradient(farthest-side, transparent calc(100% - 2.5px), #fff calc(100% - 2px))",
              WebkitMask:
                "radial-gradient(farthest-side, transparent calc(100% - 2.5px), #fff calc(100% - 2px))",
            }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            inset: -8,
            borderRadius: "50%",
            border: `1px solid ${T.border.subtle}`,
            pointerEvents: "none",
            animation: "textReveal .5s ease-out .3s both",
          }}
        />
        {[
          { left: "15%", bottom: "10%", size: 4, background: T.accent.primary, animation: "particleDrift1 3s ease-out .8s infinite" },
          { right: "10%", bottom: "20%", size: 3, background: T.accent.emerald, animation: "particleDrift2 3.5s ease-out 1.2s infinite" },
          { left: "45%", bottom: "5%", size: 3, background: "#6C60FF", animation: "particleDrift3 4s ease-out 1.5s infinite" },
          { right: "30%", bottom: "15%", size: 2, background: T.accent.primary, animation: "particleDrift4 3.2s ease-out 2s infinite" },
        ].map((particle, index) => (
          <div
            key={index}
            style={{
              position: "absolute",
              ...particle,
              width: particle.size,
              height: particle.size,
              borderRadius: "50%",
            }}
          />
        ))}
        <img
          src="/icon-512.png"
          alt=""
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            borderRadius: 28,
            zIndex: 2,
            background: T.bg.base,
            animation: "iconPulse 3s ease-in-out .8s infinite",
          }}
        />
      </div>
      <h1 style={{ fontSize: 30, fontWeight: 900, letterSpacing: "0", marginBottom: 6, animation: "textReveal .6s ease-out .4s both" }}>
        <span
          style={{
            background: `linear-gradient(135deg, ${T.text.primary}, ${T.accent.primary}90)`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Catalyst Cash
        </span>
      </h1>
      <p
        style={{
          fontSize: 10,
          color: T.text.dim,
          fontFamily: T.font.mono,
          letterSpacing: "2px",
          fontWeight: 600,
          textTransform: "uppercase",
          marginBottom: 36,
          animation: "textReveal .6s ease-out .6s both",
        }}
      >
        <span style={{ animation: "subtitlePulse 2.5s ease-in-out infinite" }}>Preparing your dashboard</span>
      </p>
      <div
        style={{
          width: 160,
          height: 3,
          borderRadius: 3,
          background: T.border.default,
          overflow: "hidden",
          animation: "textReveal .6s ease-out .8s both",
          position: "relative",
        }}
      >
        <div
          style={{
            height: "100%",
            borderRadius: 3,
            background: T.accent.gradient,
            animation: "loadBarFill 3s ease-out forwards",
            boxShadow: `0 0 8px ${T.accent.primary}40`,
          }}
        />
      </div>
      <p
        style={{
          fontSize: 9,
          color: T.text.muted,
          fontFamily: T.font.mono,
          marginTop: 20,
          animation: "textReveal .6s ease-out 1s both",
          opacity: 0.4,
        }}
      >
        v{APP_VERSION}
      </p>
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
