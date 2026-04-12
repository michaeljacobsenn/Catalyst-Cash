  import { animate,motion,useMotionValue,useReducedMotion } from "framer-motion";
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
  const currentTabRef = useRef(tab);
  const transitionModeRef = useRef<"immediate" | "gesture">("immediate");
  const animationRef = useRef<ReturnType<typeof animate> | null>(null);
  const [paneWidth, setPaneWidth] = useState(0);
  const x = useMotionValue(0);
  const prefersReducedMotion = useReducedMotion();

  const getTabIndex = (targetTab: AppTab) => {
    const index = SWIPE_TAB_ORDER.indexOf(targetTab);
    return index === -1 ? 0 : index;
  };

  const stopAnimation = () => {
    animationRef.current?.stop();
    animationRef.current = null;
  };

  const snapToTab = (targetTab: AppTab, mode: "immediate" | "gesture" = "immediate") => {
    const width = paneWidth || containerRef.current?.clientWidth || 0;
    const index = getTabIndex(targetTab);
    const targetX = -(index * width);
    stopAnimation();
    if (!width || mode === "immediate" || prefersReducedMotion) {
      x.set(targetX);
      return;
    }
    animationRef.current = animate(x, targetX, SPRING);
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
    const mode = transitionModeRef.current;
    transitionModeRef.current = "immediate";
    snapToTab(tab, mode);
  }, [ready, onboardingComplete, paneWidth, prefersReducedMotion, tab]);

  useEffect(() => {
    if (!paneWidth) return;
    snapToTab(tab, "immediate");
  }, [paneWidth]);

  useEffect(() => {
    const onScrollToTab = (event: Event) => {
      const targetTab = (event as CustomEvent<AppTab>).detail;
      if (!SWIPE_TAB_ORDER.includes(targetTab)) return;
      transitionModeRef.current = "immediate";
      currentTabRef.current = targetTab;
      snapToTab(targetTab, "immediate");
      syncTab(targetTab);
    };
    window.addEventListener("app-scroll-to-tab", onScrollToTab);
    return () => window.removeEventListener("app-scroll-to-tab", onScrollToTab);
  }, [SWIPE_TAB_ORDER, syncTab, paneWidth, prefersReducedMotion]);

  useEffect(() => () => stopAnimation(), []);
  return (
    <main
      id="main-content"
      role="main"
      ref={containerRef}
      className="snap-container"
      aria-hidden={hidden}
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        overflow: "hidden",
        overscrollBehaviorX: "none",
        touchAction: hidden ? "none" : "pan-y",
        pointerEvents: hidden ? "none" : "auto",
      }}
    >
      <div style={{ flex: 1, minHeight: 0, height: "100%", touchAction: "pan-y", overflow: "hidden" }}>
        <motion.div
          className="snap-track"
          style={{
            ["--snap-pane-w" as string]: paneWidth ? `${paneWidth}px` : "100%",
            x,
            minHeight: 0,
            height: "100%",
            width: paneWidth ? `${paneWidth * SWIPE_TAB_ORDER.length}px` : `${SWIPE_TAB_ORDER.length * 100}%`,
            touchAction: "pan-y",
            willChange: "transform",
            backfaceVisibility: "hidden",
          }}
        >
          {children}
        </motion.div>
      </div>
    </main>
  );
}
