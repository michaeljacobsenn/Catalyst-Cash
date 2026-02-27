import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { db } from '../utils.js';

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
                const [ra, pin, uf, lt, appLinked] = await Promise.all([
                    db.get("require-auth"),
                    db.get("app-passcode"),
                    db.get("use-face-id"),
                    db.get("lock-timeout"),
                    db.get("apple-linked-id")
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

            } catch (e) {
                console.error('Security init error:', e);
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
        return () => { document.removeEventListener("visibilitychange", handleVisibilityChange); };
    }, [requireAuth, lockTimeout]);

    // Sync state to DB on change (after initial load)
    useEffect(() => { if (isSecurityReady) db.set("require-auth", requireAuth); }, [requireAuth, isSecurityReady]);
    useEffect(() => { if (isSecurityReady) db.set("app-passcode", appPasscode); }, [appPasscode, isSecurityReady]);
    useEffect(() => { if (isSecurityReady) db.set("use-face-id", useFaceId); }, [useFaceId, isSecurityReady]);
    useEffect(() => { if (isSecurityReady) db.set("lock-timeout", lockTimeout); }, [lockTimeout, isSecurityReady]);
    useEffect(() => { if (isSecurityReady) db.set("apple-linked-id", appleLinkedId); }, [appleLinkedId, isSecurityReady]);

    const value = {
        requireAuth, setRequireAuth,
        appPasscode, setAppPasscode,
        useFaceId, setUseFaceId,
        isLocked, setIsLocked,
        privacyMode, setPrivacyMode,
        lockTimeout, setLockTimeout,
        appleLinkedId, setAppleLinkedId,
        isSecurityReady
    };

    return (
        <SecurityContext.Provider value={value}>
            {children}
        </SecurityContext.Provider>
    );
}

export const useSecurity = () => {
    const context = useContext(SecurityContext);
    if (!context) throw new Error("useSecurity must be used within a SecurityProvider");
    return context;
};
