import { useDrag } from "@use-gesture/react";
import { animate,useMotionValue,useMotionValueEvent,useTransform,type MotionValue } from "framer-motion";
import { useCallback,useEffect,useMemo,useRef } from "react";
import { haptic } from "../haptics.js";
import { clamp } from "../mathHelpers.js";

type SwipeAxis = "x" | "y";

export interface SwipeGestureHandlers {
  paneRef: React.RefObject<HTMLDivElement | null>;
  bind: ReturnType<typeof useDrag>;
  axis: SwipeAxis;
  edgeOnly: boolean;
  edgeSize: number;
  motionStyle: {
    x?: MotionValue<number>;
    y?: MotionValue<number>;
  };
  progress: MotionValue<number>;
  underlayStyle?: {
    x: MotionValue<number>;
    scale: MotionValue<number>;
    opacity: MotionValue<number>;
  };
  backdropStyle: {
    opacity: MotionValue<number>;
  };
  edgeShadowStyle?: {
    opacity: MotionValue<number>;
  };
  dismiss: () => void;
}

interface InteractiveSwipeOptions {
  axis: SwipeAxis;
  onDismiss: () => void;
  edgeOnly?: boolean;
  edgeSize?: number;
  enabled?: boolean;
  applyBaseParallax?: boolean;
}

const SNAP_SPRING = {
  type: "spring" as const,
  stiffness: 540,
  damping: 42,
  mass: 0.92,
};
const DISMISS_SPRING = {
  type: "spring" as const,
  stiffness: 460,
  damping: 34,
  mass: 0.9,
};
const DISMISS_THRESHOLD = 0.3;
const VELOCITY_THRESHOLD = 0.55;
const EDGE_SIZE_DEFAULT = 36;
const INTENT_THRESHOLD = 10;
const INTENT_DOMINANCE = 1.15;

const clampPositive = (value: number) => Math.max(0, value);
const easeOutCubic = (value: number) => 1 - Math.pow(1 - clamp(value), 3);

function setGesturePerformanceMode(active: boolean) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (active) {
    root.setAttribute("data-gesture-nav", "active");
    return;
  }
  root.removeAttribute("data-gesture-nav");
}

function getViewportSize(axis: SwipeAxis, pane: HTMLDivElement | null): number {
  if (typeof window === "undefined") return 0;
  if (axis === "x") return pane?.clientWidth || window.innerWidth || 0;
  return pane?.clientHeight || window.innerHeight || 0;
}

function applyUnderlyingParallax(axis: SwipeAxis, progress: number) {
  const mainContent = document.getElementById("main-content");
  if (!mainContent) return;

  const eased = easeOutCubic(progress);
  const scale = axis === "x"
    ? 0.962 + eased * 0.038
    : 0.982 + eased * 0.018;
  const opacity = axis === "x"
    ? 0.84 + eased * 0.16
    : 0.88 + eased * 0.12;
  const translateX = axis === "x" ? -24 + eased * 24 : 0;
  const translateY = axis === "y" ? 16 - eased * 16 : 0;

  mainContent.style.transition = "none";
  mainContent.style.transformOrigin = "center center";
  mainContent.style.transform = `translate3d(${translateX.toFixed(2)}px, ${translateY.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
  mainContent.style.opacity = opacity.toFixed(4);
}

function resetUnderlyingParallax() {
  const mainContent = document.getElementById("main-content");
  if (!mainContent) return;
  mainContent.style.transition = "";
  mainContent.style.transformOrigin = "";
  mainContent.style.transform = "";
  mainContent.style.opacity = "";
}

function useInteractiveSwipe({
  axis,
  onDismiss,
  edgeOnly = false,
  edgeSize = EDGE_SIZE_DEFAULT,
  enabled = true,
  applyBaseParallax = true,
}: InteractiveSwipeOptions): SwipeGestureHandlers {
  const paneRef = useRef<HTMLDivElement | null>(null);
  const motion = useMotionValue(0);
  const dismissingRef = useRef(false);
  const animationRef = useRef<ReturnType<typeof animate> | null>(null);
  const parallaxActiveRef = useRef(false);
  const gestureAcceptedRef = useRef(false);
  const gestureRejectedRef = useRef(false);
  const gesturePerformanceModeRef = useRef(false);
  // Increment each time we stop an animation so in-flight onComplete callbacks
  // from the *previous* animation know they're stale and don't dirty refs.
  const animationGenRef = useRef(0);

  const progress = useTransform(motion, (latest) => {
    const size = Math.max(getViewportSize(axis, paneRef.current), 1);
    return clamp(latest / size);
  });

  const backdropOpacity = useTransform(progress, (latest) => {
    if (axis === "x") return 0.12 * (1 - latest);
    return 1 - latest * 0.9;
  });

  const underlayX = useTransform(progress, (latest) => {
    const eased = easeOutCubic(latest);
    return -22 + eased * 22;
  });
  const underlayScale = useTransform(progress, (latest) => 0.976 + easeOutCubic(latest) * 0.024);
  const underlayOpacity = useTransform(progress, (latest) => 0.88 + easeOutCubic(latest) * 0.12);
  const edgeShadowOpacity = useTransform(progress, (latest) => 0.22 * (1 - easeOutCubic(latest)));

  useMotionValueEvent(progress, "change", (latest) => {
    const shouldUseGestureMode = enabled && latest > 0.001;
    if (gesturePerformanceModeRef.current !== shouldUseGestureMode) {
      gesturePerformanceModeRef.current = shouldUseGestureMode;
      setGesturePerformanceMode(shouldUseGestureMode);
    }
    if (!enabled || !applyBaseParallax || latest <= 0.001) {
      if (parallaxActiveRef.current) {
        parallaxActiveRef.current = false;
        resetUnderlyingParallax();
      }
      return;
    }
    parallaxActiveRef.current = true;
    applyUnderlyingParallax(axis, latest);
  });

  const completeDismiss = useCallback(() => {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    haptic.light();
    onDismiss();
    // Reset dismissingRef after a tick so the next gesture on re-mount is clean
    Promise.resolve().then(() => { dismissingRef.current = false; });
  }, [onDismiss]);

  const resetGestureState = useCallback(() => {
    gestureAcceptedRef.current = false;
    gestureRejectedRef.current = false;
    if (gesturePerformanceModeRef.current) {
      gesturePerformanceModeRef.current = false;
      setGesturePerformanceMode(false);
    }
    if (parallaxActiveRef.current) {
      parallaxActiveRef.current = false;
      resetUnderlyingParallax();
    }
    motion.set(0);
  }, [motion]);

  const animateTo = useCallback(
    (target: number, velocity = 0, onComplete?: () => void) => {
      animationRef.current?.stop();
      const gen = ++animationGenRef.current;
      animationRef.current = animate(motion, target, {
        ...(target === 0 ? SNAP_SPRING : DISMISS_SPRING),
        velocity,
        onComplete: () => {
          // Ignore callbacks from animations that were stopped mid-flight
          if (animationGenRef.current !== gen) return;
          if (target === 0) {
            resetGestureState();
          }
          onComplete?.();
        },
      });
      return animationRef.current;
    },
    [motion, resetGestureState],
  );

  const bind = useDrag(
    ({ first, down, movement: [mx, my], velocity: [vx, vy], direction: [dx, dy], xy: [px, py], cancel }) => {
      if (!enabled) {
        cancel?.();
        return;
      }
      if (dismissingRef.current) {
        cancel?.();
        return;
      }

      const size = getViewportSize(axis, paneRef.current);
      if (!size) {
        cancel?.();
        return;
      }

      // Always stop any in-flight animation at the start of a new gesture so it
      // doesn't fight the drag. Previously this only ran inside the edgeOnly branch,
      // causing the first pull to feel stuck when a prior spring was still settling.
      if (first) {
        animationRef.current?.stop();
        gestureAcceptedRef.current = false;
        gestureRejectedRef.current = false;

        if (edgeOnly) {
          const edgeCoordinate = axis === "x" ? px : py;
          if (edgeCoordinate > edgeSize) {
            cancel?.();
            return;
          }
        }
      }

      const rawMovement = axis === "x" ? mx : my;
      const rawVelocity = axis === "x" ? vx : vy;
      const rawDirection = axis === "x" ? dx : dy;
      const crossMovement = axis === "x" ? my : mx;
      const absPrimary = Math.abs(rawMovement);
      const absCross = Math.abs(crossMovement);
      const nextValue = clampPositive(rawMovement);

      if (down) {
        if (!gestureAcceptedRef.current) {
          if (rawMovement <= 0) {
            motion.set(0);
            return;
          }
          if (
            absCross >= INTENT_THRESHOLD &&
            absCross > absPrimary * INTENT_DOMINANCE
          ) {
            gestureRejectedRef.current = true;
            motion.set(0);
            cancel?.();
            return;
          }
          if (
            absPrimary < INTENT_THRESHOLD ||
            absPrimary <= absCross * INTENT_DOMINANCE
          ) {
            motion.set(0);
            return;
          }
          gestureAcceptedRef.current = true;
        }
        if (gestureRejectedRef.current) {
          motion.set(0);
          return;
        }
        motion.set(nextValue);
        return;
      }

      if (!gestureAcceptedRef.current || gestureRejectedRef.current) {
        animateTo(0, 0);
        return;
      }

      const shouldDismiss =
        nextValue >= size * DISMISS_THRESHOLD ||
        (rawDirection > 0 && rawVelocity >= VELOCITY_THRESHOLD);

      if (shouldDismiss) {
        animateTo(size + Math.min(64, size * 0.12), rawVelocity * size, completeDismiss);
      } else {
        animateTo(0, rawVelocity * size);
      }
    },
    {
      axis,
      filterTaps: true,
      threshold: 0,
      rubberband: false,
      pointer: { touch: true },
    },
  );

  const dismiss = useCallback(() => {
    if (!enabled) return;
    if (dismissingRef.current) return;
    const size = getViewportSize(axis, paneRef.current);
    if (!size) {
      completeDismiss();
      return;
    }
    animateTo(size + Math.min(64, size * 0.12), 0, completeDismiss);
  }, [animateTo, axis, completeDismiss, enabled]);

  useEffect(() => {
    dismissingRef.current = false;
    animationRef.current?.stop();
    resetGestureState();
    return () => {
      dismissingRef.current = false;
      animationRef.current?.stop();
      resetGestureState();
    };
  }, [enabled, resetGestureState]);

  const motionStyle = useMemo(
    () => (axis === "x" ? { x: motion } : { y: motion }),
    [axis, motion],
  );

  return {
    paneRef,
    bind,
    axis,
    edgeOnly,
    edgeSize,
    motionStyle,
    progress,
    backdropStyle: { opacity: backdropOpacity },
    dismiss,
    ...(axis === "x" ? {
      underlayStyle: { x: underlayX, scale: underlayScale, opacity: underlayOpacity },
      edgeShadowStyle: { opacity: edgeShadowOpacity },
    } : {}),
  } as SwipeGestureHandlers;
}

export function useSwipeBack(
  onDismiss: () => void,
  enabled = true,
  options?: { applyBaseParallax?: boolean },
): SwipeGestureHandlers {
  return useInteractiveSwipe({
    axis: "x",
    onDismiss,
    edgeOnly: true,
    enabled,
    applyBaseParallax: options?.applyBaseParallax ?? false,
  });
}

export function useSwipeDown(onDismiss: () => void, enabled = true): SwipeGestureHandlers {
  return useInteractiveSwipe({ axis: "y", onDismiss, enabled });
}
