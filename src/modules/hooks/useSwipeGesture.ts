import { useDrag } from "@use-gesture/react";
import { animate,useMotionValue,useMotionValueEvent,useTransform,type MotionValue } from "framer-motion";
import { useCallback,useEffect,useMemo,useRef } from "react";
import { haptic } from "../haptics.js";

type SwipeAxis = "x" | "y";

interface SwipeGestureHandlers {
  paneRef: React.RefObject<HTMLDivElement | null>;
  bind: ReturnType<typeof useDrag>;
  motionStyle: {
    x?: MotionValue<number>;
    y?: MotionValue<number>;
    opacity: MotionValue<number>;
  };
  dismiss: () => void;
}

interface InteractiveSwipeOptions {
  axis: SwipeAxis;
  onDismiss: () => void;
  edgeOnly?: boolean;
  edgeSize?: number;
}

const SPRING = { type: "spring" as const, stiffness: 300, damping: 30 };
const DISMISS_THRESHOLD = 0.4;
const VELOCITY_THRESHOLD = 0.45;
const EDGE_SIZE_DEFAULT = 32;

const clampPositive = (value: number) => Math.max(0, value);

function getViewportSize(axis: SwipeAxis, pane: HTMLDivElement | null): number {
  if (typeof window === "undefined") return 0;
  if (axis === "x") return pane?.clientWidth || window.innerWidth || 0;
  return pane?.clientHeight || window.innerHeight || 0;
}

function applyUnderlyingParallax(axis: SwipeAxis, progress: number) {
  const mainContent = document.getElementById("main-content");
  if (!mainContent) return;
  const eased = Math.max(0, Math.min(progress, 1));
  const scale = 0.985 + eased * 0.015;
  const opacity = 0.88 + eased * 0.12;
  const translate = axis === "x"
    ? `${(-12 + eased * 12).toFixed(2)}px, 0px`
    : `0px, ${(10 - eased * 10).toFixed(2)}px`;

  mainContent.style.transition = "none";
  mainContent.style.transform = `translate3d(${translate}, 0) scale(${scale.toFixed(4)})`;
  mainContent.style.opacity = opacity.toFixed(4);
}

function resetUnderlyingParallax() {
  const mainContent = document.getElementById("main-content");
  if (!mainContent) return;
  mainContent.style.transition = "";
  mainContent.style.transform = "";
  mainContent.style.opacity = "";
}

function useInteractiveSwipe({ axis,onDismiss,edgeOnly = false,edgeSize = EDGE_SIZE_DEFAULT }: InteractiveSwipeOptions): SwipeGestureHandlers {
  const paneRef = useRef<HTMLDivElement | null>(null);
  const motion = useMotionValue(0);
  const dismissingRef = useRef(false);

  const progress = useTransform(motion, (latest) => {
    const pane = paneRef.current;
    const size = Math.max(getViewportSize(axis, pane), 1);
    return Math.max(0, Math.min(latest / size, 1));
  });
  const opacity = useTransform(progress, [0, 1], axis === "y" ? [1, 0.72] : [1, 0.9]);

  useMotionValueEvent(progress, "change", (latest) => {
    applyUnderlyingParallax(axis, latest);
  });

  const completeDismiss = useCallback(() => {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    haptic.light();
    onDismiss();
  }, [onDismiss]);

  const animateTo = useCallback((target: number, onComplete?: () => void) => {
    const controls = animate(motion, target, {
      ...SPRING,
      onComplete: () => {
        onComplete?.();
      },
    });
    return controls;
  }, [motion]);

  const bind = useDrag(
    ({ first,down,movement: [mx, my], velocity: [vx, vy], direction: [dx, dy], xy: [px, py], cancel }) => {
      if (dismissingRef.current) {
        cancel?.();
        return;
      }

      const pane = paneRef.current;
      const size = getViewportSize(axis, pane);
      if (!size) {
        cancel?.();
        return;
      }

      if (first && edgeOnly) {
        const edgeCoordinate = axis === "x" ? px : py;
        if (edgeCoordinate > edgeSize) {
          cancel?.();
          return;
        }
      }

      const rawMovement = axis === "x" ? mx : my;
      const direction = axis === "x" ? dx : dy;
      const velocity = axis === "x" ? vx : vy;
      const nextValue = clampPositive(rawMovement);

      if (down) {
        motion.set(nextValue);
        return;
      }

      const shouldDismiss =
        nextValue > size * DISMISS_THRESHOLD ||
        (direction > 0 && velocity > VELOCITY_THRESHOLD);

      if (shouldDismiss) {
        animateTo(size, completeDismiss);
      } else {
        animateTo(0);
      }
    },
    {
      axis,
      filterTaps: true,
      threshold: 6,
      rubberband: false,
      pointer: { touch: true },
    },
  );

  const dismiss = useCallback(() => {
    if (dismissingRef.current) return;
    const pane = paneRef.current;
    const size = getViewportSize(axis, pane);
    if (!size) {
      completeDismiss();
      return;
    }
    animateTo(size, completeDismiss);
  }, [animateTo, axis, completeDismiss]);

  useEffect(() => {
    dismissingRef.current = false;
    motion.set(0);
    resetUnderlyingParallax();
    return () => {
      dismissingRef.current = false;
      motion.set(0);
      resetUnderlyingParallax();
    };
  }, [motion]);

  const motionStyle = useMemo(
    () => ({
      ...(axis === "x" ? { x: motion } : { y: motion }),
      opacity,
    }),
    [axis, motion, opacity],
  );

  return {
    paneRef,
    bind,
    motionStyle,
    dismiss,
  };
}

export function useSwipeBack(onDismiss: () => void): SwipeGestureHandlers {
  return useInteractiveSwipe({ axis: "x", onDismiss, edgeOnly: true });
}

export function useSwipeDown(onDismiss: () => void): SwipeGestureHandlers {
  return useInteractiveSwipe({ axis: "y", onDismiss });
}
