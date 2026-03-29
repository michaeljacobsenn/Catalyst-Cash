import { animate,motion,useMotionValue,useTransform,type PanInfo } from "framer-motion";
import { Suspense,lazy,useCallback,useEffect,useMemo,useRef,useState } from "react";
import { APP_VERSION,T } from "../constants.js";
import { PLAN_FACTS } from "../guides/guideData.js";
import { X } from "../icons";
import { clamp } from "../mathHelpers.js";

const LazyProPaywall = lazy(() => import("./ProPaywall.js"));

interface GuideModalProps {
  onClose?: () => void;
  proEnabled?: boolean;
}

export default function GuideModal({ onClose: onExplicitClose, proEnabled = false }: GuideModalProps) {
  const [isDismissing, setIsDismissing] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [iframeReady, setIframeReady] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(() => (typeof window === "undefined" ? 900 : window.innerHeight || 900));
  const paneY = useMotionValue(0);
  const panStartOffsetRef = useRef(0);
  const animationRef = useRef<ReturnType<typeof animate> | null>(null);

  const backdropOpacity = useTransform(paneY, (latest) => clamp(1 - latest / Math.max(viewportHeight * 0.92, 1), 0.08, 1));
  const dismissTarget = useMemo(() => viewportHeight + Math.min(88, viewportHeight * 0.16), [viewportHeight]);

  const stopSheetAnimation = useCallback(() => {
    animationRef.current?.stop();
    animationRef.current = null;
  }, []);

  const finalizeClose = useCallback(() => {
    onExplicitClose?.();
  }, [onExplicitClose]);

  const animateToRest = useCallback(() => {
    stopSheetAnimation();
    animationRef.current = animate(paneY, 0, {
      type: "spring",
      stiffness: 520,
      damping: 42,
      mass: 0.94,
    });
  }, [paneY, stopSheetAnimation]);

  const animateClose = useCallback((velocity = 0) => {
    if (isDismissing) return;
    setIsDismissing(true);
    stopSheetAnimation();
    animationRef.current = animate(paneY, dismissTarget, {
      type: "spring",
      stiffness: 420,
      damping: 34,
      mass: 0.92,
      velocity,
      onComplete: finalizeClose,
    });
  }, [dismissTarget, finalizeClose, isDismissing, paneY, stopSheetAnimation]);

  const handleHeaderPanStart = useCallback(() => {
    if (isDismissing) return;
    stopSheetAnimation();
    panStartOffsetRef.current = paneY.get();
  }, [isDismissing, paneY, stopSheetAnimation]);

  const handleHeaderPan = useCallback((_event: PointerEvent | TouchEvent | MouseEvent, info: PanInfo) => {
    if (isDismissing) return;
    const next = Math.max(0, panStartOffsetRef.current + info.offset.y);
    paneY.set(next);
  }, [isDismissing, paneY]);

  const handleHeaderPanEnd = useCallback((_event: PointerEvent | TouchEvent | MouseEvent, info: PanInfo) => {
    if (isDismissing) return;
    const finalOffset = Math.max(0, panStartOffsetRef.current + info.offset.y);
    const shouldDismiss = finalOffset >= viewportHeight * 0.28 || info.velocity.y >= 900;
    if (shouldDismiss) {
      animateClose(info.velocity.y);
      return;
    }
    animateToRest();
  }, [animateClose, animateToRest, isDismissing, viewportHeight]);

  // Listen for swipe-down message from iframe content
  useEffect(() => {
    const handleMessage = (e: MessageEvent<{ type?: string }>) => {
      if (e.data?.type === "DISMISS_GUIDE") {
        animateClose();
      } else if (e.data?.type === "OPEN_UPGRADE" && !proEnabled) {
        setShowUpgrade(true);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [animateClose, proEnabled]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        animateClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [animateClose]);

  useEffect(() => {
    const handleResize = () => setViewportHeight(window.innerHeight || 900);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => () => stopSheetAnimation(), [stopSheetAnimation]);

  const guideUrl = proEnabled ? "/CatalystCash-Guide-Pro.html" : "/CatalystCash-Guide-Free.html";
  const plan = proEnabled ? PLAN_FACTS.pro : PLAN_FACTS.free;

  useEffect(() => {
    setIframeReady(false);
  }, [guideUrl]);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 200,
          background: "rgba(0,0,0,0.85)",
          backdropFilter: "blur(24px) saturate(1.8)",
          WebkitBackdropFilter: "blur(24px) saturate(1.8)",
          opacity: backdropOpacity,
          pointerEvents: "auto",
        }}
        onClick={() => animateClose()}
      />
      <motion.div
        className="swipe-down-pane"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 201,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          width: "100%",
          boxSizing: "border-box",
          background: "#06080F",
          touchAction: "none",
          willChange: "transform",
          pointerEvents: isDismissing ? "none" : "auto",
          y: paneY,
        }}
      >
        <motion.div
          initial={{ y: 64, scale: 0.988, opacity: 0.96 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          transition={{
            type: "spring",
            stiffness: 420,
            damping: 34,
            mass: 0.95,
          }}
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          transformOrigin: "center top",
          willChange: "transform, opacity",
        }}>
          <motion.div
            onPanStart={handleHeaderPanStart}
            onPan={handleHeaderPan}
            onPanEnd={handleHeaderPanEnd}
            style={{
              padding: `calc(env(safe-area-inset-top, 20px) + 8px) 20px 16px 20px`,
              background: `linear-gradient(180deg, ${T.bg.base}, ${T.bg.elevated})`,
              borderBottom: `1px solid ${T.border.subtle}`,
              boxShadow: `0 10px 32px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.05)`,
              flexShrink: 0,
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              userSelect: "none",
              touchAction: "none",
            }}
          >
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                cursor: "grab",
                touchAction: "none",
              }}
            >
              <div style={{ display: "flex", justifyContent: "center" }}>
                <div
                  style={{
                    width: 38,
                    height: 5,
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.22)",
                    boxShadow: "0 1px 0 rgba(255,255,255,0.05)",
                  }}
                />
              </div>
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
            </div>
            <button
              onClick={() => animateClose()}
              onPointerDown={(event) => event.stopPropagation()}
              onTouchStart={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
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
          </motion.div>

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

          <div style={{ height: "env(safe-area-inset-bottom, 0px)", background: "#06080F" }} />
        </motion.div>
      </motion.div>

      {showUpgrade && !proEnabled && (
        <Suspense fallback={null}>
          <LazyProPaywall onClose={() => setShowUpgrade(false)} source="default" />
        </Suspense>
      )}
    </>
  );
}
