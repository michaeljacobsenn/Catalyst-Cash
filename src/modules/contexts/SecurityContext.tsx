import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { db } from "../utils.js";
import { deleteSecureItem, migrateToSecureItem, setSecureItem } from "../secureStore.js";

const SecurityContext = createContext(null);

export function SecurityProvider({ children }) {
  const [requireAuth, setRequireAuth] = useState(false);
  const [appPasscode, setAppPasscode] = useState("");
  const [useFaceId, setUseFaceId] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [lockTimeout, setLockTimeout] = useState(0);
  const [appleLinkedId, setAppleLinkedId] = useState(null);
  const [isSecurityReady, setIsSecurityReady] = useState(false);

  const lastBackgrounded = useRef(null);

  useEffect(() => {
    const initSecurity = async () => {
      try {
        const [ra, uf, lt, legacyPin, legacyAppleLinkedId, pm] = await Promise.all([
          db.get("require-auth"),
          db.get("use-face-id"),
          db.get("lock-timeout"),
          db.get("app-passcode"),
          db.get("apple-linked-id"),
          db.get("privacy-mode"),
        ]);
        const [pin, appLinked] = await Promise.all([
          migrateToSecureItem("app-passcode", legacyPin, () => db.del("app-passcode")),
          migrateToSecureItem("apple-linked-id", legacyAppleLinkedId, () => db.del("apple-linked-id")),
        ]);

        if (ra) {
          setRequireAuth(true);
          setIsLocked(true);
        } else {
          setIsLocked(false);
        }

        if (pin) setAppPasscode(pin);
        if (uf) setUseFaceId(true);
        if (lt !== null) setLockTimeout(lt);
        if (appLinked) setAppleLinkedId(appLinked);
        if (pm) setPrivacyMode(true);
      } catch (e) {
        console.error("Security init error:", e);
      } finally {
        setIsSecurityReady(true);
      }
    };

    initSecurity();
  }, []);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden) {
        lastBackgrounded.current = Date.now();
      } else {
        if (requireAuth && lastBackgrounded.current) {
          const timeout = Number.isFinite(Number(lockTimeout)) ? Number(lockTimeout) : 0;
          const elapsed = (Date.now() - lastBackgrounded.current) / 1000;

          // -1 means "never relock"
          if (timeout >= 0 && elapsed >= timeout) {
            setIsLocked(true);
          }
        }
        lastBackgrounded.current = null;
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [requireAuth, lockTimeout]);

  // Sync state to DB on change (after initial load)
  useEffect(() => {
    if (isSecurityReady) db.set("require-auth", requireAuth);
  }, [requireAuth, isSecurityReady]);
  useEffect(() => {
    if (isSecurityReady) db.set("use-face-id", useFaceId);
  }, [useFaceId, isSecurityReady]);
  useEffect(() => {
    if (isSecurityReady) db.set("lock-timeout", lockTimeout);
  }, [lockTimeout, isSecurityReady]);
  useEffect(() => {
    if (isSecurityReady) db.set("privacy-mode", privacyMode);
  }, [privacyMode, isSecurityReady]);
  useEffect(() => {
    if (!isSecurityReady) return;
    if (appPasscode) void setSecureItem("app-passcode", appPasscode);
    else void deleteSecureItem("app-passcode");
  }, [appPasscode, isSecurityReady]);
  useEffect(() => {
    if (!isSecurityReady) return;
    if (appleLinkedId) void setSecureItem("apple-linked-id", appleLinkedId);
    else void deleteSecureItem("apple-linked-id");
  }, [appleLinkedId, isSecurityReady]);

  const value = {
    requireAuth,
    setRequireAuth,
    appPasscode,
    setAppPasscode,
    useFaceId,
    setUseFaceId,
    isLocked,
    setIsLocked,
    privacyMode,
    setPrivacyMode,
    lockTimeout,
    setLockTimeout,
    appleLinkedId,
    setAppleLinkedId,
    isSecurityReady,
  };

  return <SecurityContext.Provider value={value}>{children}</SecurityContext.Provider>;
}

export const useSecurity = () => {
  const context = useContext(SecurityContext);
  if (!context) throw new Error("useSecurity must be used within a SecurityProvider");
  return context;
};
