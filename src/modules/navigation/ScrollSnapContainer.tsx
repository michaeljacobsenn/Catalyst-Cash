  import { useDrag } from "@use-gesture/react";
  import { animate,motion,useMotionValue } from "framer-motion";
  import { useEffect,useLayoutEffect,useRef,useState,type ReactNode } from "react";
  import type { AppTab } from "../contexts/NavigationContext.js";

interface ScrollSnapContainerProps {
  ready: boolean;
  onboardingComplete: boolean;
  tab: AppTab;
  syncTab: (newTab: AppTab) => void;
  SWIPE_TAB_ORDER: readonly AppTab[];
  hidden: boolean;
  children?: ReactNode;
}

const SPRING = { type: "spring" as const, stiffness: 300, damping: 30 };
const VELOCITY_WEIGHT = 140;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const applyRubberBand = (value: number, min: number, max: number) => {
  if (value < min) return min - (min - value) * 0.22;
  if (value > max) return max + (value - max) * 0.22;
  return value;
};

export default function ScrollSnapContainer({
  ready,
  onboardingComplete,
  tab,
  syncTab,
  SWIPE_TAB_ORDER,
  hidden,
  children,
}: ScrollSnapContainerProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const currentTabRef = useRef(tab);
  const animationRef = useRef<ReturnType<typeof animate> | null>(null);
  const dragIntentRef = useRef(false);
  const [paneWidth, setPaneWidth] = useState(0);
  const x = useMotionValue(0);

  const getTabIndex = (targetTab: AppTab) => {
    const index = SWIPE_TAB_ORDER.indexOf(targetTab);
    return index === -1 ? 0 : index;
  };

  const stopAnimation = () => {
    animationRef.current?.stop();
    animationRef.current = null;
  };

  const snapToTab = (targetTab: AppTab, immediate = false) => {
    const width = paneWidth || containerRef.current?.clientWidth || 0;
    const index = getTabIndex(targetTab);
    const targetX = -(index * width);
    stopAnimation();
    if (!width || immediate) {
      x.set(targetX);
      return;
    }
    animationRef.current = animate(x, targetX, SPRING);
  };

  const snapToIndex = (index: number) => {
    const clampedIndex = clamp(index, 0, Math.max(0, SWIPE_TAB_ORDER.length - 1));
    const nextTab = SWIPE_TAB_ORDER[clampedIndex];
    if (!nextTab) return;
    syncTab(nextTab);
    snapToTab(nextTab);
  };

  useEffect(() => {
    currentTabRef.current = tab;
  }, [tab]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => {
      const nextWidth = container.clientWidth;
      setPaneWidth((prev) => {
        if (prev === nextWidth) return prev;
        return nextWidth;
      });
    };

    updateWidth();
    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!ready) return;
    snapToTab(tab, false);
  }, [ready, onboardingComplete, paneWidth, tab]);

  useEffect(() => {
    if (!paneWidth) return;
    snapToTab(tab, true);
  }, [paneWidth]);

  useEffect(() => {
    const pane = containerRef.current?.querySelector<HTMLElement>(`.snap-page[data-tabid="${tab}"]`);
    if (pane) pane.scrollTo({ top: 0, behavior: "auto" });
  }, [tab]);

  useEffect(() => {
    const onScrollToTab = (event: Event) => {
      const targetTab = (event as CustomEvent<AppTab>).detail;
      if (!SWIPE_TAB_ORDER.includes(targetTab)) return;
      snapToTab(targetTab);
    };
    window.addEventListener("app-scroll-to-tab", onScrollToTab);
    return () => window.removeEventListener("app-scroll-to-tab", onScrollToTab);
  }, [SWIPE_TAB_ORDER, paneWidth]);

  useEffect(() => () => stopAnimation(), []);

  const bind = useDrag(
    ({ first, last, movement: [mx], velocity: [vx], direction: [dx], cancel, tap }) => {
      if (!paneWidth || hidden) {
        cancel?.();
        return;
      }

      const baseIndex = getTabIndex(currentTabRef.current);
      const minX = -Math.max(0, SWIPE_TAB_ORDER.length - 1) * paneWidth;
      const maxX = 0;
      const baseX = -(baseIndex * paneWidth);

      if (first) {
        dragIntentRef.current = false;
        stopAnimation();
      }

      if (!last) {
        dragIntentRef.current = true;
        x.set(applyRubberBand(baseX + mx, minX, maxX));
        return;
      }

      if (tap || !dragIntentRef.current) {
        snapToTab(currentTabRef.current);
        return;
      }

      const projectedX = baseX + mx + vx * dx * VELOCITY_WEIGHT;
      const projectedIndex = Math.round(-projectedX / paneWidth);
      snapToIndex(projectedIndex);
    },
    {
      axis: "x",
      filterTaps: true,
      pointer: { touch: true },
      rubberband: true,
      threshold: 10,
    },
  );
  return (
    <main
      id="main-content"
      role="main"
      ref={containerRef}
      className="snap-container"
      style={{
        flex: 1,
        minHeight: 0,
        display: hidden ? "none" : "flex",
        overflow: "hidden",
        overscrollBehaviorX: "none",
        touchAction: "pan-y",
      }}
    >
      <div {...bind()} style={{ flex: 1, minHeight: 0, height: "100%", touchAction: "pan-y", overflow: "hidden" }}>
        <motion.div
          ref={trackRef}
          className="snap-track"
          style={{
            ["--snap-pane-w" as string]: paneWidth ? `${paneWidth}px` : "100%",
            x,
            minHeight: 0,
            height: "100%",
            width: paneWidth ? `${paneWidth * SWIPE_TAB_ORDER.length}px` : `${SWIPE_TAB_ORDER.length * 100}%`,
            touchAction: "pan-y",
          }}
        >
          {children}
        </motion.div>
      </div>
    </main>
  );
}
