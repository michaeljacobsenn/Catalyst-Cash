declare module "*.css";

interface AppToastApi {
  success?: (message: string, options?: { duration?: number }) => void;
  error?: (message: string, options?: { duration?: number }) => void;
  info?: (message: string, options?: { duration?: number }) => void;
  warn?: (message: string, options?: { duration?: number }) => void;
  clipboard?: (message: string, options?: { onClick?: () => void; actionLabel?: string; duration?: number }) => void;
}

interface Window {
  toast?: AppToastApi;
  __privacyMode?: boolean;
  __biometricActive?: boolean;
  __biometricActiveUntil?: number;
  __E2E_HOUSEHOLD_SYNC_DELAY__?: number;
  __E2E_SECURITY_STATE__?: {
    storageStatus?: {
      platform: "native" | "web";
      available: boolean;
      mode: "native-secure" | "native-unavailable" | "web-limited";
      canPersistSecrets: boolean;
      isHardwareBacked: boolean;
      message: string;
    };
    appPasscode?: string;
    requireAuth?: boolean;
    useFaceId?: boolean;
    lockTimeout?: number;
  };
  haptic?: {
    light?: () => void;
    medium?: () => void;
    heavy?: () => void;
    success?: () => void;
    error?: () => void;
    warning?: () => void;
    selection?: () => void;
  };
}

declare var __E2E_HOUSEHOLD_SYNC_DELAY__: number | undefined;
declare var __E2E_SECURITY_STATE__:
  | {
      storageStatus?: {
        platform: "native" | "web";
        available: boolean;
        mode: "native-secure" | "native-unavailable" | "web-limited";
        canPersistSecrets: boolean;
        isHardwareBacked: boolean;
        message: string;
      };
      appPasscode?: string;
      requireAuth?: boolean;
      useFaceId?: boolean;
      lockTimeout?: number;
    }
  | undefined;
