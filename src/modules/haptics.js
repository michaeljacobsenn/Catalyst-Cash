// ═══════════════════════════════════════════════════════════════
// HAPTIC FEEDBACK — wraps @capacitor/haptics for iOS
// Falls back to no-op on web/unsupported
// ═══════════════════════════════════════════════════════════════
  import { Capacitor } from "@capacitor/core";
  import { Haptics,ImpactStyle,NotificationType } from "@capacitor/haptics";

const supportsHaptics =
  Capacitor.isNativePlatform() &&
  (typeof Capacitor.isPluginAvailable !== "function" || Capacitor.isPluginAvailable("Haptics"));

const safe = fn => async () => {
  if (!supportsHaptics) return;
  try {
    await fn();
  } catch {
    // Unsupported haptics should degrade silently.
  }
};

export const haptic = {
  /** Light tap — tab switch, checkbox toggle */
  light: safe(() => Haptics.impact({ style: ImpactStyle.Light })),
  /** Selection tap — picker scrolling, active element selection */
  selection: safe(() => Haptics.impact({ style: ImpactStyle.Light })),
  /** Medium tap — button press, card select */
  medium: safe(() => Haptics.impact({ style: ImpactStyle.Medium })),
  /** Heavy tap — destructive action confirmation */
  heavy: safe(() => Haptics.impact({ style: ImpactStyle.Heavy })),
  /** Success — import complete, copy success */
  success: safe(() => Haptics.notification({ type: NotificationType.Success })),
  /** Warning — delete confirmation shown */
  warning: safe(() => Haptics.notification({ type: NotificationType.Warning })),
  /** Error — validation failure */
  error: safe(() => Haptics.notification({ type: NotificationType.Error })),
};
