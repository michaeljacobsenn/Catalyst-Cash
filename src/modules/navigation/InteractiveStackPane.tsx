import type { CSSProperties, ReactNode } from "react";
import { motion } from "framer-motion";
import { T } from "../constants.js";
import type { SwipeGestureHandlers } from "../hooks/useSwipeGesture.js";

interface InteractiveStackPaneProps {
  swipe: SwipeGestureHandlers;
  children: ReactNode;
  underlay?: ReactNode;
  scrollable?: boolean;
  zIndex?: number;
  gestureEnabled?: boolean;
  containerStyle?: CSSProperties;
  paneStyle?: CSSProperties;
}

export default function InteractiveStackPane({
  swipe,
  children,
  underlay,
  scrollable = false,
  zIndex = 24,
  gestureEnabled = true,
  containerStyle,
  paneStyle,
}: InteractiveStackPaneProps) {
  const bindTargetPane = !(swipe.axis === "x" && swipe.edgeOnly);
  const gestureBindings = gestureEnabled ? swipe.bind() : {};

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex,
        overflow: "hidden",
        pointerEvents: "none",
        ...containerStyle,
      }}
    >
      {underlay && (
        <motion.div
          aria-hidden="true"
          className="gesture-shadow-soft"
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            pointerEvents: "none",
            willChange: "transform, opacity",
            ...swipe.underlayStyle,
          }}
        >
          {underlay}
        </motion.div>
      )}
      <motion.div
        aria-hidden="true"
        className="gesture-shadow-soft"
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(4,8,17,0.14)",
          pointerEvents: "none",
          opacity: swipe.backdropStyle.opacity,
        }}
      />
      <motion.div
        ref={swipe.paneRef}
        {...(bindTargetPane ? gestureBindings : {})}
        className="swipe-back-pane"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          background: T.bg.base,
          overflowY: scrollable ? "auto" : "hidden",
          WebkitOverflowScrolling: scrollable ? "touch" : undefined,
          touchAction: bindTargetPane && gestureEnabled ? "pan-y" : "auto",
          pointerEvents: "auto",
          willChange: "transform",
          backfaceVisibility: "hidden",
          transform: "translateZ(0)",
          contain: "layout paint style",
          ...swipe.motionStyle,
          ...paneStyle,
        }}
      >
        {children}
        <motion.div
          aria-hidden="true"
          className="gesture-blur"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: -20,
            width: 28,
            background: "linear-gradient(90deg, rgba(0,0,0,0.24), rgba(0,0,0,0))",
            filter: "blur(10px)",
            pointerEvents: "none",
            opacity: swipe.edgeShadowStyle?.opacity,
          }}
        />
      </motion.div>
      {!bindTargetPane && gestureEnabled && (
        <div
          {...gestureBindings}
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: "0 auto 0 0",
            width: swipe.edgeSize,
            zIndex: 3,
            pointerEvents: "auto",
            touchAction: swipe.axis === "x" ? "none" : "pan-x",
            background: "transparent",
          }}
        />
      )}
    </div>
  );
}
