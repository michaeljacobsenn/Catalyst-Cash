import { motion } from "framer-motion";
import { Suspense,lazy,useCallback,useEffect,useState } from "react";
import { APP_VERSION,T } from "../constants.js";
import { PLAN_FACTS } from "../guides/guideData.js";
import { X } from "../icons";
import { useSwipeDown } from "../hooks/useSwipeGesture.js";

const LazyProPaywall = lazy(() => import("./ProPaywall.js"));

interface GuideModalProps {
  onClose?: () => void;
  proEnabled?: boolean;
}

export default function GuideModal({ onClose: onExplicitClose, proEnabled = false }: GuideModalProps) {
  const [isDismissing, setIsDismissing] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [iframeReady, setIframeReady] = useState(false);
  const swipeHook = useSwipeDown(() => {
    onExplicitClose?.();
  });
  const { paneRef, bind, motionStyle, dismiss } = swipeHook;
  const gestureBindings = bind();
  const requestDismiss = useCallback(() => {
    if (isDismissing) return;
    setIsDismissing(true);
    dismiss();
  }, [dismiss, isDismissing]);

  // Listen for swipe-down message from iframe content
  useEffect(() => {
    const handleMessage = (e: MessageEvent<{ type?: string }>) => {
      if (e.data?.type === "DISMISS_GUIDE") {
        requestDismiss();
      } else if (e.data?.type === "OPEN_UPGRADE" && !proEnabled) {
        setShowUpgrade(true);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [proEnabled, requestDismiss]);

  const guideUrl = proEnabled ? "/CatalystCash-Guide-Pro.html" : "/CatalystCash-Guide-Free.html";
  const plan = proEnabled ? PLAN_FACTS.pro : PLAN_FACTS.free;

  useEffect(() => {
    setIframeReady(false);
  }, [guideUrl]);

  return (
    <>
      <motion.div
        ref={paneRef}
        className="modal-pane"
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
          pointerEvents: isDismissing ? "none" : "auto",
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
            touchAction: "none",
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: T.text.primary, margin: 0, letterSpacing: "-0.01em" }}>
                  {proEnabled ? "Pro Guide" : "Free Guide"}
                </h1>
                <span
                  style={{
                    fontSize: 9,
                    color: proEnabled ? "#F8E7A1" : T.accent.emerald,
                    fontFamily: T.font.mono,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    border: `1px solid ${proEnabled ? "rgba(248,231,161,0.28)" : `${T.accent.emerald}30`}`,
                    background: proEnabled ? "rgba(248,231,161,0.1)" : `${T.accent.emerald}12`,
                    padding: "3px 8px",
                    borderRadius: 999,
                  }}
                >
                  {plan.label}
                </span>
              </div>
              <span
                style={{
                  fontSize: 10,
                  color: T.text.dim,
                  fontFamily: T.font.mono,
                  fontWeight: 600,
                  letterSpacing: "1px",
                }}
              >
                CATALYST CASH v{APP_VERSION} · {plan.audits} · {plan.chats}
              </span>
            </div>
            <button
              onClick={requestDismiss}
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
                flexShrink: 0,
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Embedded Iframe */}
        <div style={{ flex: 1, position: "relative", background: "#06080F" }}>
          {!iframeReady && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                gap: 10,
                padding: 24,
                background: "linear-gradient(180deg, #071019, #06080F)",
                zIndex: 1,
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  border: `1px solid ${T.border.default}`,
                  background: "rgba(255,255,255,0.04)",
                  display: "grid",
                  placeItems: "center",
                  boxShadow: "0 12px 28px rgba(0,0,0,0.28)",
                }}
              >
                <div
                  className="spin"
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 999,
                    border: "2px solid rgba(255,255,255,0.16)",
                    borderTopColor: proEnabled ? "#F8E7A1" : T.accent.emerald,
                  }}
                />
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ color: T.text.primary, fontWeight: 700, fontSize: 14 }}>
                  Loading guide
                </div>
                <div style={{ color: T.text.dim, fontSize: 12, marginTop: 4 }}>
                  Setting up the simplest walkthrough for this plan.
                </div>
              </div>
            </div>
          )}
          <iframe
            src={guideUrl}
            onLoad={() => setIframeReady(true)}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              border: "none",
              display: "block",
              backgroundColor: "#06080F",
              opacity: iframeReady ? 1 : 0,
              transition: "opacity 0.22s ease",
            }}
            title="Catalyst Cash Guide"
            scrolling="yes"
          />
        </div>

        {/* Safe area spacer for native */}
        <div style={{ height: "env(safe-area-inset-bottom, 0px)", background: "#06080F" }} />
      </motion.div>

      {showUpgrade && !proEnabled && (
        <Suspense fallback={null}>
          <LazyProPaywall onClose={() => setShowUpgrade(false)} />
        </Suspense>
      )}
    </>
  );
}
