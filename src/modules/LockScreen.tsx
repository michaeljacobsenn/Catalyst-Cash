  import { Capacitor } from "@capacitor/core";
  import { useEffect,useRef,useState } from "react";
  import { T } from "./constants.js";
  import { useSecurity } from "./contexts/SecurityContext.js";
  import { haptic } from "./haptics.js";
  import { AlertCircle,Fingerprint,ShieldCheck } from "./icons";
  import { log } from "./logger.js";
  import { FaceId } from "./utils.js";

export async function isBiometricAvailable() {
  if (Capacitor.getPlatform() === "web") return false;
  try {
    const result = await FaceId.isAvailable();
    return result.isAvailable;
  } catch {
    return false;
  }
}

export async function authenticateBiometric() {
  if (Capacitor.getPlatform() === "web") return true;
  try {
    await FaceId.authenticate({ reason: "Unlock Catalyst Cash" });
    return true;
  } catch {
    return false;
  }
}



const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_SECS = 30;

export default function LockScreen() {
  const { appPasscode, useFaceId, setIsLocked } = useSecurity();
  const onUnlock = () => setIsLocked(false);

  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState("locked"); // locked | authenticating | bypassing | unlocked | error
  const [errorMsg, setErrorMsg] = useState("");
  const [showPinPad, setShowPinPad] = useState(!useFaceId);
  const [pinEntry, setPinEntry] = useState("");
  const [pinAttempts, setPinAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(0);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  useEffect(() => {
    if (!lockoutUntil) return;
    const tick = setInterval(() => {
      const rem = Math.ceil((lockoutUntil - Date.now()) / 1000);
      if (rem <= 0) {
        setLockoutRemaining(0);
        setLockoutUntil(0);
        clearInterval(tick);
      } else setLockoutRemaining(rem);
    }, 500);
    return () => clearInterval(tick);
  }, [lockoutUntil]);

  const isLockedOut = lockoutUntil > Date.now();
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showError = (msg: string) => {
    setStatus("error");
    setErrorMsg(msg);
    setFailed(true);
    haptic.error();
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => {
      setStatus("locked");
      setFailed(false);
      setErrorMsg("");
    }, 1500);
  };

  const tryDeviceAuth = async () => {
    if (Capacitor.getPlatform() === "web") {
      onUnlock();
      return;
    }
    setStatus("authenticating");
    try {
      const availability = await FaceId.isAvailable();
      if (!availability?.isAvailable) {
        setShowPinPad(true);
        setStatus("locked");
        setErrorMsg("Face ID unavailable — use PIN");
        setFailed(true);
        if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
        errorTimerRef.current = setTimeout(() => {
          setFailed(false);
          setErrorMsg("");
        }, 2000);
        return;
      }
      window.__biometricActive = true;
      await FaceId.authenticate({ reason: "Unlock Catalyst Cash" });
      setStatus("unlocked");
      haptic.success();
      setTimeout(onUnlock, 300);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      void log.warn("security", "Biometric authentication failed", { message });
      // Fall back to custom PIN Pad on cancellation or failure
      setShowPinPad(true);
      setStatus("locked");
    } finally {
      setTimeout(() => {
        window.__biometricActive = false;
      }, 1000);
    }
  };

  const handleNumPress = (num: number | "delete") => {
    if (isLockedOut || status === "authenticating" || status === "unlocked") return;
    haptic.light();
    if (num === "delete") {
      setPinEntry(p => p.slice(0, -1));
    } else if (typeof num === "number" && pinEntry.length < 4) {
      const nextPin = pinEntry + num;
      setPinEntry(nextPin);
      if (nextPin.length === 4) {
        if (nextPin === appPasscode) {
          setPinAttempts(0);
          setStatus("unlocked");
          haptic.success();
          setTimeout(onUnlock, 400);
        } else {
          const nextAttempts = pinAttempts + 1;
          setPinAttempts(nextAttempts);
          if (nextAttempts >= PIN_MAX_ATTEMPTS) {
            const until = Date.now() + PIN_LOCKOUT_SECS * 1000;
            setLockoutUntil(until);
            setLockoutRemaining(PIN_LOCKOUT_SECS);
            setPinAttempts(0);
            showError(`Too many attempts — locked ${PIN_LOCKOUT_SECS}s`);
          } else {
            showError(`Incorrect PIN (${PIN_MAX_ATTEMPTS - nextAttempts} left)`);
          }
          setTimeout(() => setPinEntry(""), 400);
        }
      }
    }
  };


  // Auto-trigger native auth on mount
  useEffect(() => {
    if (Capacitor.getPlatform() !== "web" && useFaceId) {
      const timer = setTimeout(() => {
        tryDeviceAuth();
      }, 600);
      return () => clearTimeout(timer);
    } else if (!useFaceId) {
      setShowPinPad(true);
    }
  }, [useFaceId]);

  const busy = status === "authenticating" || status === "bypassing" || status === "unlocked";

  // Keyboard support: allow PIN entry via physical keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!showPinPad || isLockedOut || busy) return;
      if (e.key >= "0" && e.key <= "9") {
        handleNumPress(parseInt(e.key, 10));
      } else if (e.key === "Backspace" || e.key === "Delete") {
        handleNumPress("delete");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showPinPad, isLockedOut, pinEntry, pinAttempts, status]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="App lock screen"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "#05050A",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 32px",
        gap: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "20%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "150vw",
          height: "100vh",
          background: `radial-gradient(circle, ${T.accent.emerald}15 0%, transparent 60%)`,
          zIndex: -1,
          pointerEvents: "none",
          animation: "ambientBreathe 8s ease-in-out infinite alternate",
        }}
      />
      <style>{`
@keyframes pinDotPop { 0% { transform: scale(0.5); } 60% { transform: scale(1.2); } 100% { transform: scale(1); } }
@keyframes pinShake { 0%, 100% { transform: translateX(0); } 20%, 60% { transform: translateX(-8px); } 40%, 80% { transform: translateX(8px); } }
@keyframes breathe { 0%, 100% { opacity: 0.6; transform: scale(1); } 50% { opacity: 1; transform: scale(1.08); } }
@keyframes ambientBreathe { 0% { opacity: 0.5; transform: translate(-50%, -50%) scale(0.9); } 100% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); } }
            `}</style>
      {/* App Icon */}
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: 22,
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)",
          marginBottom: 20,
        }}
      >
        {status === "unlocked" ? (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: `${T.status.green}22`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ShieldCheck size={44} color={T.status.green} strokeWidth={1.5} />
          </div>
        ) : failed ? (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: `${T.status.red}22`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AlertCircle size={44} color={T.status.red} strokeWidth={1.5} />
          </div>
        ) : (
          <img src="/icon-192.png" alt="Catalyst Cash" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}
      </div>

      <h1
        style={{
          fontSize: 28,
          fontWeight: 900,
          background: "linear-gradient(135deg, #FFF 30%, #A0AEC0 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          margin: 0,
          marginBottom: 8,
          letterSpacing: "-0.02em",
        }}
      >
        Catalyst Cash
      </h1>
      <p
        style={{
          fontSize: 13,
          fontFamily: T.font.mono,
          letterSpacing: "0.06em",
          color: failed ? T.status.red : T.text.muted,
          marginBottom: 40,
          marginTop: 0,
        }}
      >
        {isLockedOut
          ? `LOCKED — RETRY IN ${lockoutRemaining}s`
          : status === "authenticating"
            ? "AUTHENTICATING..."
            : status === "bypassing"
              ? "VERIFYING..."
              : status === "unlocked"
                ? "UNLOCKED"
                : failed
                  ? errorMsg.toUpperCase()
                  : "APP IS LOCKED"}
      </p>

      {showPinPad ? (
        <div style={{ width: "100%", maxWidth: 280, display: "flex", flexDirection: "column", alignItems: "center" }}>
          {/* PIN Indicators */}
          <div
            style={{
              display: "flex",
              gap: 18,
              marginBottom: 44,
              height: 20,
              alignItems: "center",
              animation: failed ? "pinShake .4s ease" : "none",
            }}
          >
            {[0, 1, 2, 3].map(i => {
              const filled = pinEntry.length > i;
              return (
                <div
                  key={i}
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    border: `1.5px solid ${failed ? T.status.red : T.accent.primary}`,
                    background: filled ? (failed ? T.status.red : T.accent.primary) : "rgba(255,255,255,0.05)",
                    boxShadow: filled && !failed ? `0 0 12px ${T.accent.primary}80` : "none",
                    transition: "all .2s cubic-bezier(.34, 1.56, .64, 1)",
                    animation: filled && !failed ? "pinDotPop .3s ease" : "none",
                  }}
                />
              );
            })}
          </div>

          {/* Numpad */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "16px 24px",
              width: "100%",
              paddingBottom: 16,
            }}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button
                key={num}
                onClick={() => handleNumPress(num)}
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: 38,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  borderTop: "1px solid rgba(255,255,255,0.12)",
                  borderLeft: "1px solid rgba(255,255,255,0.08)",
                  color: "#FFF",
                  fontSize: 28,
                  fontWeight: 500,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  transition: "all .2s ease",
                  WebkitTapHighlightColor: "transparent",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  boxShadow: "0 8px 16px rgba(0,0,0,0.2)",
                }}
              >
                {num}
              </button>
            ))}
            <button
              onClick={useFaceId ? tryDeviceAuth : undefined}
              style={{
                width: 76,
                height: 76,
                borderRadius: 38,
                background: "transparent",
                border: "none",
                color: useFaceId ? T.accent.primary : "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: useFaceId ? "pointer" : "default",
                WebkitTapHighlightColor: "transparent",
                opacity: useFaceId ? 1 : 0,
              }}
            >
              <Fingerprint size={34} strokeWidth={1.5} style={{ animation: "breathe 3s ease-in-out infinite" }} />
            </button>
            <button
              onClick={() => handleNumPress(0)}
              style={{
                width: 76,
                height: 76,
                borderRadius: 38,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.05)",
                borderTop: "1px solid rgba(255,255,255,0.12)",
                borderLeft: "1px solid rgba(255,255,255,0.08)",
                color: "#FFF",
                fontSize: 28,
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "all .2s ease",
                WebkitTapHighlightColor: "transparent",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                boxShadow: "0 8px 16px rgba(0,0,0,0.2)",
              }}
            >
              0
            </button>
            <button
              onClick={() => handleNumPress("delete")}
              style={{
                width: 76,
                height: 76,
                borderRadius: 38,
                background: "transparent",
                border: "none",
                color: "#FFF",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.05em",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                WebkitTapHighlightColor: "transparent",
                opacity: 0.8,
              }}
            >
              DELETE
            </button>
          </div>
        </div>
      ) : (
        /* Primary: Native Device Auth Status Button (only shows when attempting Biometrics auto-trigger) */
        <button
          onClick={tryDeviceAuth}
          disabled={busy}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            width: "100%",
            maxWidth: 320,
            padding: "16px 20px",
            borderRadius: 14,
            border: "none",
            background: `linear-gradient(135deg, ${T.accent.primary}, #6C60FF)`,
            color: "white",
            fontSize: 16,
            fontWeight: 700,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
            boxShadow: `0 8px 24px ${T.accent.primary}55`,
            marginBottom: 12,
          }}
        >
          <Fingerprint size={20} style={{ animation: "breathe 3s ease-in-out infinite" }} />
          {status === "authenticating" ? "Authenticating..." : "Unlock with Face ID"}
        </button>
      )}
    </div>
  );
}
