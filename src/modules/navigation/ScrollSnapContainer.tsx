import { useEffect, useRef, type ReactNode } from "react";
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

export default function ScrollSnapContainer({
  ready,
  onboardingComplete,
  tab,
  syncTab,
  SWIPE_TAB_ORDER,
  hidden,
  children,
}: ScrollSnapContainerProps) {
  const snapContainerRef = useRef<HTMLDivElement | null>(null);
  const initialScrollLock = useRef(true);
  const currentTabRef = useRef(tab);

  useEffect(() => {
    currentTabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    const pane = snapContainerRef.current?.querySelector<HTMLElement>(`.snap-page[data-tabid="${tab}"]`);
    if (pane) pane.scrollTo({ top: 0, behavior: "auto" });
  }, [tab]);

  useEffect(() => {
    const container = snapContainerRef.current;
    if (!container) return;
    initialScrollLock.current = true;

    let isProgrammaticScroll = false;
    let programmaticDebounce: ReturnType<typeof setTimeout> | null = null;
    let initialRecoveryTimer: ReturnType<typeof setTimeout> | null = null;

    const scrollToTabPane = (targetTab: AppTab) => {
      const pane = container.querySelector<HTMLElement>(`.snap-page[data-tabid="${targetTab}"]`);
      if (!pane) return;
      const targetLeft = pane.offsetLeft;
      container.scrollTo({ left: targetLeft, top: 0, behavior: "auto" });
    };

    const onScrollToTab = (event: Event) => {
      const targetTab = (event as CustomEvent<AppTab>).detail;
      const idx = SWIPE_TAB_ORDER.indexOf(targetTab);
      if (idx === -1) return;
      isProgrammaticScroll = true;
      scrollToTabPane(targetTab);
      if (programmaticDebounce) clearTimeout(programmaticDebounce);
      programmaticDebounce = setTimeout(() => {
        isProgrammaticScroll = false;
      }, 180);
    };
    window.addEventListener("app-scroll-to-tab", onScrollToTab);

    let scrollDebounce: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (initialScrollLock.current) return;
      if (isProgrammaticScroll) {
        if (programmaticDebounce) clearTimeout(programmaticDebounce);
        programmaticDebounce = setTimeout(() => {
          isProgrammaticScroll = false;
        }, 150);
        return;
      }

      if (scrollDebounce) clearTimeout(scrollDebounce);
      scrollDebounce = setTimeout(() => {
        const width = container.clientWidth;
        if (width <= 0) return;
        const index = Math.round(container.scrollLeft / width);
        const snappedTab = SWIPE_TAB_ORDER[index];
        if (snappedTab) syncTab(snappedTab);
      }, 10);
    };

    container.addEventListener("scroll", onScroll, { passive: true });

    const enforceInitialScroll = () => {
      const initialIdx = SWIPE_TAB_ORDER.indexOf(currentTabRef.current);
      if (initialIdx === -1) return;
      const width = container.clientWidth || window.innerWidth;
      const target = initialIdx * Math.max(width, 0);
      if (Math.abs(container.scrollLeft - target) <= 5) return;
      isProgrammaticScroll = true;
      scrollToTabPane(currentTabRef.current);
      if (programmaticDebounce) clearTimeout(programmaticDebounce);
      programmaticDebounce = setTimeout(() => {
        isProgrammaticScroll = false;
      }, 200);
    };

    requestAnimationFrame(() => requestAnimationFrame(enforceInitialScroll));
    initialRecoveryTimer = setTimeout(enforceInitialScroll, 120);

    const lockTimer = setTimeout(() => {
      initialScrollLock.current = false;
    }, 180);

    return () => {
      clearTimeout(lockTimer);
      if (initialRecoveryTimer) clearTimeout(initialRecoveryTimer);
      window.removeEventListener("app-scroll-to-tab", onScrollToTab);
      container.removeEventListener("scroll", onScroll);
      if (scrollDebounce) clearTimeout(scrollDebounce);
      if (programmaticDebounce) clearTimeout(programmaticDebounce);
    };
  }, [ready, onboardingComplete, SWIPE_TAB_ORDER, syncTab]);

  useEffect(() => {
    const container = snapContainerRef.current;
    if (!container) return;

    const isEditable = (el: EventTarget | null) =>
      el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

    const onFocusIn = (event: FocusEvent) => {
      if (isEditable(event.target)) {
        container.style.scrollSnapType = "none";
        container.style.overflowX = "hidden";
      }
    };

    const onFocusOut = (event: FocusEvent) => {
      if (isEditable(event.target)) {
        setTimeout(() => {
          if (!isEditable(document.activeElement)) {
            container.style.scrollSnapType = "";
            container.style.overflowX = "";
          }
        }, 100);
      }
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  return (
    <main
      id="main-content"
      role="main"
      ref={snapContainerRef}
      className="snap-container snap-container-clearance"
      style={{
        flex: 1,
        display: hidden ? "none" : "flex",
        overscrollBehaviorX: "none",
      }}
    >
      {children}
    </main>
  );
}
