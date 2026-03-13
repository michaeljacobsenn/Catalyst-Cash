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
