  import type { Dispatch,ReactNode,SetStateAction } from "react";
  import { createContext,useContext,useEffect,useRef,useState } from "react";
  import { log } from "../logger.js";
  import { deleteSecureItem,getSecretStorageStatus,migrateToSecureItem,setSecureItem } from "../secureStore.js";
  import { db } from "../utils.js";

interface SecurityProviderProps {
  children?: ReactNode;
}

interface SecurityContextValue {
  requireAuth: boolean;
  setRequireAuth: Dispatch<SetStateAction<boolean>>;
  appPasscode: string;
  setAppPasscode: Dispatch<SetStateAction<string>>;
  useFaceId: boolean;
  setUseFaceId: Dispatch<SetStateAction<boolean>>;
  isLocked: boolean;
  setIsLocked: Dispatch<SetStateAction<boolean>>;
  privacyMode: boolean;
  setPrivacyMode: Dispatch<SetStateAction<boolean>>;
  lockTimeout: number;
  setLockTimeout: Dispatch<SetStateAction<number>>;
  appleLinkedId: string | null;
  setAppleLinkedId: Dispatch<SetStateAction<string | null>>;
  isSecurityReady: boolean;
  rehydrateSecurity: () => Promise<void>;
  secretStorageStatus: {
    platform: "native" | "web";
    available: boolean;
    mode: "native-secure" | "native-unavailable" | "web-limited";
    canPersistSecrets: boolean;
    isHardwareBacked: boolean;
    message: string;
  };
}

type SecretStorageStatus = SecurityContextValue["secretStorageStatus"];

const SecurityContext = createContext<SecurityContextValue | null>(null);

function getSecurityTestOverride(): {
  storageStatus?: SecretStorageStatus;
  appPasscode?: string;
  requireAuth?: boolean;
  useFaceId?: boolean;
  lockTimeout?: number;
} | null {
  const override =
    (typeof globalThis !== "undefined" && globalThis.__E2E_SECURITY_STATE__) ||
    (typeof window !== "undefined" && window.__E2E_SECURITY_STATE__);
  return override || null;
}

export function SecurityProvider({ children }: SecurityProviderProps) {
  const [requireAuth, setRequireAuth] = useState(false);
  const [appPasscode, setAppPasscode] = useState("");
  const [useFaceId, setUseFaceId] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [lockTimeout, setLockTimeout] = useState(0);
  const [appleLinkedId, setAppleLinkedId] = useState<string | null>(null);
  const [isSecurityReady, setIsSecurityReady] = useState(false);
  const [secretStorageStatus, setSecretStorageStatus] = useState<SecretStorageStatus>({
    platform: "web",
    available: false,
    mode: "web-limited",
    canPersistSecrets: false,
    isHardwareBacked: false,
    message: "",
  });

  const lastBackgrounded = useRef<number | null>(null);

  const rehydrateSecurity = async () => {
    try {
      setRequireAuth(false);
      setAppPasscode("");
      setUseFaceId(false);
      setIsLocked(false);
      setPrivacyMode(false);
      setLockTimeout(0);
      setAppleLinkedId(null);

      const testOverride = getSecurityTestOverride();
      const storageStatus = ((testOverride?.storageStatus as SecretStorageStatus | undefined) ??
        ((await getSecretStorageStatus()) as SecretStorageStatus));
      setSecretStorageStatus(storageStatus);
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

      const resolvedRequireAuth = typeof testOverride?.requireAuth === "boolean" ? testOverride.requireAuth : Boolean(ra);
      const resolvedUseFaceId = typeof testOverride?.useFaceId === "boolean" ? testOverride.useFaceId : Boolean(uf);
      const resolvedLockTimeout =
        typeof testOverride?.lockTimeout === "number"
          ? testOverride.lockTimeout
          : lt !== null
            ? Number(lt)
            : 0;
      const resolvedPasscode = typeof testOverride?.appPasscode === "string" ? testOverride.appPasscode : pin;
      const resolvedAppleLinkedId = appLinked;

      if (storageStatus.mode !== "native-secure") {
        await Promise.all([
          db.set("require-auth", false),
          db.set("use-face-id", false),
        ]);
        setRequireAuth(false);
        setUseFaceId(false);
        setIsLocked(false);
      } else if (resolvedRequireAuth) {
        setRequireAuth(true);
        setIsLocked(true);
      }

      if (resolvedPasscode) setAppPasscode(resolvedPasscode);
      if (resolvedUseFaceId) setUseFaceId(true);
      setLockTimeout(resolvedLockTimeout);
      if (resolvedAppleLinkedId) setAppleLinkedId(resolvedAppleLinkedId);
      if (pm) setPrivacyMode(true);
    } catch (e) {
      void log.error("security", "Security context initialization failed", e);
    }
  };

  useEffect(() => {
    const initSecurity = async () => {
      try {
        await rehydrateSecurity();
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

  const value: SecurityContextValue = {
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
    rehydrateSecurity,
    secretStorageStatus,
  };

  return <SecurityContext.Provider value={value}>{children}</SecurityContext.Provider>;
}

export const useSecurity = (): SecurityContextValue => {
  const context = useContext(SecurityContext);
  if (!context) throw new Error("useSecurity must be used within a SecurityProvider");
  return context;
};
