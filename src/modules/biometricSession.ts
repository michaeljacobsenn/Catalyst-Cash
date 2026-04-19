const DEFAULT_BIOMETRIC_GRACE_MS = 2500;
const DEFAULT_BIOMETRIC_PROMPT_TIMEOUT_MS = 12000;

export interface DeviceAuthAvailability {
  isAvailable?: boolean;
  canAuthenticate?: boolean;
  biometryType?: string;
  errorCode?: number;
  errorMessage?: string;
}

type BiometricWindow = Window & {
  __biometricActive?: boolean;
  __biometricActiveUntil?: number;
};

function getBiometricWindow(): BiometricWindow | null {
  if (typeof window === "undefined") return null;
  return window as BiometricWindow;
}

export function beginBiometricInteraction(graceMs = DEFAULT_BIOMETRIC_GRACE_MS): number {
  const appWindow = getBiometricWindow();
  const until = Date.now() + Math.max(0, graceMs);
  if (!appWindow) return until;

  appWindow.__biometricActive = true;
  appWindow.__biometricActiveUntil = until;
  return until;
}

export function endBiometricInteraction(graceMs = DEFAULT_BIOMETRIC_GRACE_MS): void {
  const appWindow = getBiometricWindow();
  if (!appWindow) return;

  const delayMs = Math.max(0, graceMs);
  const until = Date.now() + delayMs;
  appWindow.__biometricActive = delayMs > 0;
  appWindow.__biometricActiveUntil = until;

  if (delayMs === 0) return;

  setTimeout(() => {
    const liveWindow = getBiometricWindow();
    if (!liveWindow) return;
    if ((liveWindow.__biometricActiveUntil || 0) <= until) {
      liveWindow.__biometricActive = false;
    }
  }, delayMs);
}

export function isBiometricInteractionActive(now = Date.now()): boolean {
  const appWindow = getBiometricWindow();
  if (!appWindow) return false;

  return Boolean(appWindow.__biometricActive) || (appWindow.__biometricActiveUntil || 0) > now;
}

export function canAttemptDeviceAuthentication(availability: DeviceAuthAvailability | null | undefined): boolean {
  return Boolean(availability?.isAvailable || availability?.canAuthenticate);
}

export async function withBiometricPromptTimeout<T>(
  task: () => Promise<T>,
  {
    timeoutMs = DEFAULT_BIOMETRIC_PROMPT_TIMEOUT_MS,
    timeoutMessage = "Biometric authentication timed out",
  }: {
    timeoutMs?: number;
    timeoutMessage?: string;
  } = {}
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutMessage)), Math.max(1, timeoutMs));
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
