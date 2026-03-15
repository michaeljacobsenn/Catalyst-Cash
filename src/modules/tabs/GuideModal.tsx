  import type { MutableRefObject } from "react";
  import type { MotionValue } from "framer-motion";
  import { motion } from "framer-motion";
  import { useEffect,useState } from "react";
  import { APP_VERSION,T } from "../constants.js";
  import { X } from "../icons";

  import { useNavigation } from "../contexts/NavigationContext.js";

interface SwipeHook {
  paneRef?: MutableRefObject<HTMLDivElement | null>;
  bind?: (() => Record<string, unknown>) | undefined;
  motionStyle?: {
    x?: MotionValue<number>;
    y?: MotionValue<number>;
    opacity?: MotionValue<number>;
  };
}

interface GuideModalProps {
  onClose?: () => void;
  swipeHook?: SwipeHook;
  proEnabled?: boolean;
}

export default function GuideModal({ onClose: onExplicitClose, swipeHook = {}, proEnabled = false }: GuideModalProps) {
  const { setShowGuide } = useNavigation();
  const [isClosing, setIsClosing] = useState(false);

  const onClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowGuide(false);
      if (onExplicitClose) onExplicitClose();
    }, 350); // Matches .modal-pane-dismiss duration
  };

  const { paneRef, bind, motionStyle } = swipeHook;
  const gestureBindings = bind ? bind() : {};

  // Listen for swipe-down message from iframe content
  useEffect(() => {
    const handleMessage = (e: MessageEvent<{ type?: string }>) => {
      if (e.data?.type === 'DISMISS_GUIDE') {
        onClose();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const guideUrl = proEnabled ? "/CatalystCash-Guide-Pro.html" : "/CatalystCash-Guide-Free.html";

  return (
    <motion.div
      ref={paneRef}
      className={`modal-pane ${isClosing ? "modal-pane-dismiss" : ""}`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(24px) saturate(1.8)",
        WebkitBackdropFilter: "blur(24px) saturate(1.8)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        width: "100%",
        boxSizing: "border-box",
        touchAction: "pan-y",
        ...motionStyle,
      }}
    >
      {/* Premium Header — swipe-down grab zone */}
      <div
        {...gestureBindings}
        style={{
          padding: `calc(env(safe-area-inset-top, 20px) + 8px) 20px 16px 20px`,
          background: `linear-gradient(180deg, ${T.bg.base}, ${T.bg.elevated})`,
          borderBottom: `1px solid ${T.border.subtle}`,
          boxShadow: `0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)`,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          cursor: "grab",
          touchAction: "pan-x",
        }}
      >
        {/* iOS drag handle pill */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: "rgba(255,255,255,0.2)",
            }}
          />
        </div>
        {/* Title & Close */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: T.text.primary, margin: 0, letterSpacing: "-0.01em" }}>
              System Guide
            </h1>
            <span
              style={{
                fontSize: 10,
                color: T.text.dim,
                fontFamily: T.font.mono,
                fontWeight: 600,
                letterSpacing: "1px",
              }}
            >
              CATALYST CASH v{APP_VERSION}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              border: `1px solid ${T.border.default}`,
              background: "rgba(255,255,255,0.05)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: T.text.secondary,
              transition: "background 0.2s",
            }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Embedded Iframe */}
      <div style={{ flex: 1, position: "relative", background: "#06080F" }}>
        <iframe
          src={guideUrl}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            border: "none",
            display: "block",
            backgroundColor: "#06080F",
          }}
          title="Catalyst Cash Guide"
          scrolling="yes"
        />
      </div>

      {/* Safe area spacer for native */}
      <div style={{ height: "env(safe-area-inset-bottom, 0px)", background: "#06080F" }} />
    </motion.div>
  );
}
