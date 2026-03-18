import { useCallback, useRef, useState, type TouchEvent } from "react";

import { haptic } from "../../haptics.js";

type SwipeState = { x: number; y: number; t: number } | null;
type PullState = { y: number; hapticFired: boolean } | null;

export function useTransactionFeedGestures({ refreshing, onClose, onRefresh }) {
  const [slideOffset, setSlideOffset] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const swipeRef = useRef<SwipeState>(null);
  const pullRef = useRef<PullState>(null);

  const handleOverlayTouchStart = useCallback((e: TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    const x = touch.clientX;
    if (x < 40) {
      swipeRef.current = { x, y: touch.clientY, t: Date.now() };
    } else {
      swipeRef.current = null;
    }
  }, []);

  const handleOverlayTouchMove = useCallback(
    (e: TouchEvent<HTMLDivElement>, scrollRef: { current: HTMLDivElement | null }) => {
      if (!swipeRef.current) {
        if (scrollRef.current && scrollRef.current.scrollTop <= 2 && !refreshing) {
          const touch = e.touches[0];
          if (!touch) return;
          if (!pullRef.current) {
            pullRef.current = { y: touch.clientY, hapticFired: false };
            setIsPulling(true);
          }
          const pullState = pullRef.current;
          if (!pullState) return;
          const dy = Math.max(0, touch.clientY - pullState.y);
          const distance = Math.min(dy * 0.5, 80);
          setPullDistance(distance);
          if (distance >= 60 && !pullState.hapticFired) {
            pullState.hapticFired = true;
            haptic.light();
          }
        }
        return;
      }
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - swipeRef.current.x;
      if (dx > 0) {
        setSlideOffset(dx);
        e.preventDefault();
      }
    },
    [refreshing]
  );

  const handleOverlayTouchEnd = useCallback(
    (e: TouchEvent<HTMLDivElement>) => {
      if (pullRef.current) {
        if (pullDistance >= 60 && !refreshing) {
          void onRefresh();
        }
        pullRef.current = null;
        setIsPulling(false);
        setPullDistance(0);
      }
      if (!swipeRef.current) {
        setSlideOffset(0);
        return;
      }
      const swipeState = swipeRef.current;
      if (!swipeState) {
        setSlideOffset(0);
        return;
      }
      const touch = e.changedTouches[0];
      if (!touch) {
        setSlideOffset(0);
        return;
      }
      const dx = touch.clientX - swipeState.x;
      const dt = Date.now() - swipeState.t;
      const velocity = dx / dt;
      swipeRef.current = null;
      if (dx > 100 || velocity > 0.5) {
        setSlideOffset(window.innerWidth);
        haptic.light();
        setTimeout(() => onClose(), 200);
      } else {
        setSlideOffset(0);
      }
    },
    [onClose, onRefresh, pullDistance, refreshing]
  );

  return {
    slideOffset,
    pullDistance,
    isPulling,
    setPullDistance,
    setIsPulling,
    handleOverlayTouchStart,
    handleOverlayTouchMove,
    handleOverlayTouchEnd,
  };
}
