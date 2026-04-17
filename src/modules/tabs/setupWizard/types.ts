export interface StateOption {
  code: string;
  label: string;
}

export interface ToastApi {
  success?: (message: string, options?: { duration?: number }) => void;
  error?: (message: string, options?: { duration?: number }) => void;
  info?: (message: string, options?: { duration?: number }) => void;
  warn?: (message: string, options?: { duration?: number }) => void;
}

export interface BackupPayload {
  app?: string;
  type?: string;
  base64?: string;
  data?: Record<string, unknown>;
}

export interface AppleSignInResult {
  response: {
    user?: string | null;
    email?: string | null;
    givenName?: string | null;
    familyName?: string | null;
    identityToken?: string | null;
    authorizationCode?: string | null;
  };
}

export interface ConnectionWithId {
  id: string;
  institutionName?: string;
  [key: string]: unknown;
}
