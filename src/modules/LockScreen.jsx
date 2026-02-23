import { useState, useEffect } from "react";
import { ShieldCheck, AlertCircle, Fingerprint } from "lucide-react";
import { T } from "./constants.js";
import { haptic } from "./haptics.js";
import { Capacitor } from "@capacitor/core";
import { FaceId } from "./utils.js";
import { SignInWithApple } from "@capacitor-community/apple-sign-in";

export async function isBiometricAvailable() {
    if (Capacitor.getPlatform() === 'web') return false;
    try {
        const result = await FaceId.isAvailable();
        return result.isAvailable;
    } catch {
        return false;
    }
}

export async function authenticateBiometric() {
    if (Capacitor.getPlatform() === 'web') return true;
    try {
        await FaceId.authenticate({ reason: "Unlock Catalyst Cash" });
        return true;
    } catch {
        return false;
    }
}

// ─── Official Apple "Sign in with Apple" button ───────────────────────────────
function AppleSignInButton({ onPress, label = "Sign in with Apple", disabled }) {
    return (
        <button
            onPointerDown={(e) => { e.preventDefault(); if (!disabled) onPress(); }}
            disabled={disabled}
            style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                width: "100%", maxWidth: 320, padding: "14px 20px",
                borderRadius: 12, border: "none",
                background: "#000000", color: "#FFFFFF",
                fontSize: 16, fontWeight: 600, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                cursor: disabled ? "default" : "pointer",
                opacity: disabled ? 0.6 : 1,
                letterSpacing: "-0.01em",
                boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
            }}
        >
            {/* Official Apple logo */}
            <svg viewBox="0 0 814 1000" width="18" height="18" fill="white">
                <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-37.3-165.9-40.8l-1.6-.6c-67.8-2.3-113.2-63-156.5-123.1C38.5 660.9 17 570 17 479.4 17 260.9 139.3 151.1 261.7 151.1c71 0 130.5 43.3 175 43.3 42.8 0 110-45.7 192.5-45.7 31 0 108.5 4.5 168.2 55.4zm-234-181.4C505.7 101.8 557 34 557 0c0-6.4-.6-12.9-1.3-18.1-1-.3-2.1-.3-3.5-.3-44.5 0-95.8 30.2-127 71.6-27.5 34.9-49.5 83.2-49.5 131.6 0 6.4 1 12.9 1.6 15.1 2.9.6 7.1 1 11 1 40 0 87.5-27.2 115.9-60.4z" />
            </svg>
            {label}
        </button>
    );
}

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_SECS = 30;

export default function LockScreen({ onUnlock, appPasscode, useFaceId, appleLinkedId = null }) {
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
            if (rem <= 0) { setLockoutRemaining(0); setLockoutUntil(0); clearInterval(tick); }
            else setLockoutRemaining(rem);
        }, 500);
        return () => clearInterval(tick);
    }, [lockoutUntil]);

    const isLockedOut = lockoutUntil > Date.now();

    const showError = (msg) => {
        setStatus("error");
        setErrorMsg(msg);
        setFailed(true);
        haptic.error();
        setTimeout(() => { setStatus("locked"); setFailed(false); setErrorMsg(""); }, 1500);
    };

    const tryDeviceAuth = async () => {
        if (Capacitor.getPlatform() === 'web') { onUnlock(); return; }
        setStatus("authenticating");
        try {
            const availability = await FaceId.isAvailable();
            if (!availability?.isAvailable) {
                setShowPinPad(true);
                setStatus("locked");
                return;
            }
            window.__biometricActive = true;
            await FaceId.authenticate({ reason: "Unlock Catalyst Cash" });
            setStatus("unlocked");
            haptic.success();
            setTimeout(onUnlock, 300);
        } catch (e) {
            console.error("Auth Error:", e?.message);
            // Fall back to custom PIN Pad on cancellation or failure
            setShowPinPad(true);
            setStatus("locked");
        } finally {
            setTimeout(() => { window.__biometricActive = false; }, 1000);
        }
    };

    const handleNumPress = (num) => {
        if (isLockedOut || status === "authenticating" || status === "unlocked") return;
        haptic.light();
        if (num === "delete") {
            setPinEntry(p => p.slice(0, -1));
        } else if (typeof num === 'number' && pinEntry.length < 4) {
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

    const tryAppleSignIn = async () => {
        if (Capacitor.getPlatform() === 'web') return;
        setStatus("bypassing");
        try {
            const result = await SignInWithApple.authorize({
                clientId: 'com.jacobsen.catalystcash',
                redirectURI: 'https://com.jacobsen.catalystcash/login',
                scopes: 'email name'
            });
            if (result.response.user === appleLinkedId) {
                setStatus("unlocked");
                haptic.success();
                setTimeout(onUnlock, 300);
            } else {
                showError("Apple ID does not match linked account.");
            }
        } catch (error) {
            console.error(error);
            showError("Apple Sign-In failed or was cancelled.");
        }
    };

    // Auto-trigger native auth on mount
    useEffect(() => {
        if (Capacitor.getPlatform() !== 'web' && useFaceId) {
            const timer = setTimeout(() => { tryDeviceAuth(); }, 600);
            return () => clearTimeout(timer);
        } else if (!useFaceId) {
            setShowPinPad(true);
        }
    }, [useFaceId]);

    const busy = status === "authenticating" || status === "bypassing" || status === "unlocked";

    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 99999,
            background: "rgba(6, 9, 14, 0.97)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: "40px 32px", gap: 0,
        }}>
            {/* App Icon */}
            <div style={{
                width: 80, height: 80, borderRadius: 22, overflow: "hidden",
                boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)",
                marginBottom: 20,
            }}>
                {status === "unlocked"
                    ? <div style={{ width: "100%", height: "100%", background: `${T.status.green}22`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <ShieldCheck size={44} color={T.status.green} strokeWidth={1.5} />
                    </div>
                    : failed
                        ? <div style={{ width: "100%", height: "100%", background: `${T.status.red}22`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <AlertCircle size={44} color={T.status.red} strokeWidth={1.5} />
                        </div>
                        : <img src="/icon-192.png" alt="Catalyst Cash" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                }
            </div>

            <h1 style={{ fontSize: 26, fontWeight: 800, color: T.text.primary, margin: 0, marginBottom: 6 }}>Catalyst Cash</h1>
            <p style={{
                fontSize: 13, fontFamily: T.font.mono, letterSpacing: "0.06em",
                color: failed ? T.status.red : T.text.muted, marginBottom: 40, marginTop: 0
            }}>
                {isLockedOut ? `LOCKED — RETRY IN ${lockoutRemaining}s` :
                    status === "authenticating" ? "AUTHENTICATING..." :
                        status === "bypassing" ? "VERIFYING..." :
                            status === "unlocked" ? "UNLOCKED" :
                                failed ? errorMsg.toUpperCase() :
                                    "APP IS LOCKED"}
            </p>

            {showPinPad ? (
                <div style={{ width: "100%", maxWidth: 280, display: "flex", flexDirection: "column", alignItems: "center" }}>
                    {/* PIN Indicators */}
                    <div style={{ display: "flex", gap: 16, marginBottom: 40, height: 20, alignItems: "center" }}>
                        {[0, 1, 2, 3].map(i => (
                            <div key={i} style={{
                                width: 14, height: 14, borderRadius: 7,
                                border: `1.5px solid ${failed ? T.status.red : T.accent.primary}`,
                                background: pinEntry.length > i ? (failed ? T.status.red : T.accent.primary) : "transparent",
                                transition: "all .15s cubic-bezier(.16,1,.3,1)"
                            }} />
                        ))}
                    </div>

                    {/* Numpad */}
                    <div style={{
                        display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
                        gap: "16px 24px", width: "100%", paddingBottom: 16
                    }}>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                            <button key={num} onClick={() => handleNumPress(num)} style={{
                                width: 72, height: 72, borderRadius: 36, background: "rgba(255,255,255,0.08)",
                                border: "1px solid rgba(255,255,255,0.1)", color: T.text.primary, fontSize: 28,
                                fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center",
                                cursor: "pointer", transition: "background .15s", WebkitTapHighlightColor: "transparent"
                            }}>
                                {num}
                            </button>
                        ))}
                        <button onClick={useFaceId ? tryDeviceAuth : undefined} style={{
                            width: 72, height: 72, borderRadius: 36, background: "transparent",
                            border: "none", color: useFaceId ? T.accent.primary : "transparent", display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: useFaceId ? "pointer" : "default", WebkitTapHighlightColor: "transparent",
                            opacity: useFaceId ? 1 : 0
                        }}>
                            <Fingerprint size={32} strokeWidth={1.5} />
                        </button>
                        <button onClick={() => handleNumPress(0)} style={{
                            width: 72, height: 72, borderRadius: 36, background: "rgba(255,255,255,0.08)",
                            border: "1px solid rgba(255,255,255,0.1)", color: T.text.primary, fontSize: 28,
                            fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer", transition: "background .15s", WebkitTapHighlightColor: "transparent"
                        }}>
                            0
                        </button>
                        <button onClick={() => handleNumPress("delete")} style={{
                            width: 72, height: 72, borderRadius: 36, background: "transparent",
                            border: "none", color: T.text.primary, fontSize: 16, fontWeight: 600,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer", WebkitTapHighlightColor: "transparent"
                        }}>
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
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                        width: "100%", maxWidth: 320, padding: "16px 20px",
                        borderRadius: 14, border: "none",
                        background: `linear-gradient(135deg, ${T.accent.primary}, #6C60FF)`,
                        color: "white", fontSize: 16, fontWeight: 700,
                        cursor: busy ? "default" : "pointer",
                        opacity: busy ? 0.6 : 1,
                        boxShadow: `0 8px 24px ${T.accent.primary}55`,
                        marginBottom: 12,
                    }}
                >
                    <Fingerprint size={20} />
                    {status === "authenticating" ? "Authenticating..." : "Unlock with Face ID"}
                </button>
            )}

        </div>
    );
}
