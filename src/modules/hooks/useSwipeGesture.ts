  import type { TouchEvent as ReactTouchEvent } from "react";
  import { useCallback,useRef } from "react";
  import { haptic } from "../haptics.js";

interface TouchGestureState {
  startX: number;
  startY: number;
  startTime: number;
}

interface SwipeGestureHandlers {
  paneRef: React.RefObject<HTMLDivElement | null>;
  onTouchStart: (event: ReactTouchEvent<HTMLDivElement>) => void;
  onTouchMove: (event: ReactTouchEvent<HTMLDivElement>) => void;
  onTouchEnd: (event: ReactTouchEvent<HTMLDivElement>) => void;
}

export function useSwipeBack(onDismiss: () => void): SwipeGestureHandlers {
  const paneRef = useRef<HTMLDivElement | null>(null);
  const touchRef = useRef<TouchGestureState | null>(null);
  const isDragging = useRef(false);

  const onTouchStart = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch || touch.clientX > 40) return;
    touchRef.current = { startX: touch.clientX, startY: touch.clientY, startTime: Date.now() };
    isDragging.current = false;
  }, []);

  const onTouchMove = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    const touchState = touchRef.current;
    if (!touchState) return;
    const touch = event.touches[0];
    if (!touch) return;
    const dx = touch.clientX - touchState.startX;
    const dy = Math.abs(touch.clientY - touchState.startY);

    if (!isDragging.current) {
      if (dx < 10) return;
      if (dy > dx * 0.8) {
        touchRef.current = null;
        return;
      }
      isDragging.current = true;
      if (paneRef.current) paneRef.current.classList.add("swipe-back-pane");
    }

    if (isDragging.current && paneRef.current && dx > 0) {
      const progress = Math.min(dx / window.innerWidth, 1);
      paneRef.current.style.transform = `translateX(${dx}px)`;
      paneRef.current.style.opacity = String(1 - progress * 0.3);
    }
  }, []);

  const onTouchEnd = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    const touchState = touchRef.current;
    if (!touchState || !isDragging.current) {
      touchRef.current = null;
      isDragging.current = false;
      return;
    }
    const touch = event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - touchState.startX;
    const elapsedMs = Date.now() - touchState.startTime;
    const velocity = dx / Math.max(elapsedMs, 1);
    const pane = paneRef.current;

    touchRef.current = null;
    isDragging.current = false;

    if (dx > window.innerWidth * 0.35 || velocity > 0.5) {
      if (pane) {
        pane.classList.remove("swipe-back-pane");
        pane.classList.add("slide-pane-dismiss");
        pane.style.transform = "";
        pane.style.opacity = "";
      }
      haptic.light();
      setTimeout(() => onDismiss(), 280);
    } else if (pane) {
      pane.classList.remove("swipe-back-pane");
      pane.style.transition = "transform .3s cubic-bezier(.16,1,.3,1), opacity .3s ease";
      pane.style.transform = "translateX(0)";
      pane.style.opacity = "1";
      setTimeout(() => {
        if (pane) pane.style.transition = "";
      }, 300);
    }
  }, [onDismiss]);

  return { paneRef, onTouchStart, onTouchMove, onTouchEnd };
}

export function useSwipeDown(onDismiss: () => void): SwipeGestureHandlers {
  const paneRef = useRef<HTMLDivElement | null>(null);
  const touchRef = useRef<TouchGestureState | null>(null);
  const isDragging = useRef(false);

  const onTouchStart = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    const scrollBody = document.querySelector<HTMLElement>(".modal-pane .page-body");
    if (scrollBody && scrollBody.scrollTop > 5) return;
    const touch = event.touches[0];
    if (!touch) return;
    touchRef.current = { startX: touch.clientX, startY: touch.clientY, startTime: Date.now() };
    isDragging.current = false;
  }, []);

  const onTouchMove = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    const touchState = touchRef.current;
    if (!touchState) return;
    const touch = event.touches[0];
    if (!touch) return;
    const dx = Math.abs(touch.clientX - touchState.startX);
    const dy = touch.clientY - touchState.startY;
    if (!isDragging.current) {
      if (dy < 10) return;
      if (dx > dy * 0.8) {
        touchRef.current = null;
        return;
      }
      isDragging.current = true;
      if (paneRef.current) paneRef.current.classList.add("swipe-down-pane");
    }

    if (isDragging.current && paneRef.current && dy > 0) {
      const progress = Math.min(dy / window.innerHeight, 1);
      paneRef.current.style.transform = `translateY(${dy}px)`;
      paneRef.current.style.opacity = String(1 - progress * 0.3);
    }
  }, []);

  const onTouchEnd = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    const touchState = touchRef.current;
    if (!touchState || !isDragging.current) {
      touchRef.current = null;
      isDragging.current = false;
      return;
    }

    const touch = event.changedTouches[0];
    if (!touch) return;
    const dy = touch.clientY - touchState.startY;
    const elapsedMs = Date.now() - touchState.startTime;
    const velocity = dy / Math.max(elapsedMs, 1);
    const pane = paneRef.current;

    touchRef.current = null;
    isDragging.current = false;

    if (dy > window.innerHeight * 0.2 || velocity > 0.4) {
      if (pane) {
        pane.classList.remove("swipe-down-pane");
        pane.classList.add("modal-pane-dismiss");
        pane.style.transform = "";
        pane.style.opacity = "";
      }
      haptic.light();
      setTimeout(() => onDismiss(), 350);
    } else if (pane) {
      pane.classList.remove("swipe-down-pane");
      pane.style.transition = "transform .3s cubic-bezier(.16,1,.3,1), opacity .3s ease";
      pane.style.transform = "translateY(0)";
      pane.style.opacity = "1";
      setTimeout(() => {
        if (pane) pane.style.transition = "";
      }, 300);
    }
  }, [onDismiss]);

  return { paneRef, onTouchStart, onTouchMove, onTouchEnd };
}
