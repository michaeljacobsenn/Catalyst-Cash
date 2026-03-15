import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { Clock, CreditCard, Home, MessageCircle, Plus, Settings, Wallet, Zap } from "../icons";
import { T } from "../constants.js";
import { haptic } from "../haptics.js";
import type { AppTab, NavViewState } from "../contexts/NavigationContext.js";

interface BottomNavBarProps {
  tab: AppTab;
  navTo: (newTab: AppTab, viewState?: NavViewState | null) => void;
  loading: boolean;
  showGuide: boolean;
  transactionFeedTab: AppTab | null;
  setTransactionFeedTab: (tab: AppTab | null) => void;
}

export default function BottomNavBar({
  tab,
  navTo,
  loading,
  showGuide,
  transactionFeedTab,
  setTransactionFeedTab,
}: BottomNavBarProps) {
  const bottomNavRef = useRef<HTMLElement | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showQuickMenu, setShowQuickMenu] = useState(false);

  useEffect(() => {
    if (!bottomNavRef.current) return;
    const update = () => {
      if (!bottomNavRef.current) return;
      const height = bottomNavRef.current.getBoundingClientRect().height || 0;
      document.documentElement.style.setProperty("--bottom-nav-h", `${Math.ceil(height)}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(bottomNavRef.current);
    return () => ro.disconnect();
  }, []);

  const navItems: Array<{ id: AppTab; label: string; icon: typeof Home; isCenter?: boolean }> = useMemo(
    () => [
      { id: "dashboard", label: "Home", icon: Home },
      { id: "cashflow", label: "Cashflow", icon: Wallet },
      { id: "audit", label: "Audit", icon: Zap, isCenter: true },
      { id: "portfolio", label: "Portfolio", icon: CreditCard },
      { id: "chat", label: "Ask AI", icon: MessageCircle },
    ],
    []
  );

  return (
    <nav
      aria-label="Main navigation"
      ref={bottomNavRef}
      style={{
        background: T.bg.navGlass,
        backdropFilter: "blur(32px) saturate(200%)",
        WebkitBackdropFilter: "blur(32px) saturate(200%)",
        border: `1px solid ${T.border.default}`,
        borderRadius: 36,
        position: "absolute",
        bottom: "calc(env(safe-area-inset-bottom, 16px) + 16px)",
        left: 16,
        right: 16,
        zIndex: 200,
        boxShadow: `0 16px 32px -12px rgba(0,0,0,0.6), 0 0 0 1px ${T.border.subtle}`,
        display: showGuide ? "none" : undefined,
        pointerEvents: loading ? "none" : "auto",
        opacity: loading ? 0.45 : 1,
        transition: "opacity .3s ease",
        overflow: "hidden",
      }}
    >
      {showQuickMenu && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 99, background: "transparent" }}
            onClick={() => setShowQuickMenu(false)}
            onTouchStart={() => setShowQuickMenu(false)}
          />
          <div
            style={{
              position: "absolute",
              bottom: "calc(env(safe-area-inset-bottom, 16px) + 76px)",
              left: "50%",
              transform: "translateX(-50%)",
              background: T.bg.glass,
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: `1px solid ${T.border.focus}`,
              borderRadius: T.radius.lg,
              padding: 8,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              zIndex: 100,
              boxShadow: T.shadow.elevated,
              width: 220,
              animation: "slideUpMenu .2s ease",
            }}
          >
            <button
              onClick={() => {
                setShowQuickMenu(false);
                navTo("input");
              }}
              style={quickMenuButtonStyle}
            >
              <Plus size={18} color={T.accent.emerald} /> Start New Audit
            </button>
            <button
              onClick={() => {
                setShowQuickMenu(false);
                navTo("history");
              }}
              style={quickMenuButtonStyle}
            >
              <Clock size={18} color={T.accent.primary} /> Audit History
            </button>

            <div style={{ height: 1, background: T.border.default, margin: "4px 0" }} />
            <button
              onClick={() => {
                setShowQuickMenu(false);
                navTo("settings");
              }}
              style={quickMenuButtonStyle}
            >
              <Settings size={18} color={T.text.dim} /> App Configuration
            </button>
          </div>
        </>
      )}

      {loading && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: `linear-gradient(90deg, transparent, ${T.accent.primary}, ${T.accent.emerald}, transparent)`,
            animation: "shimmer 1.8s ease-in-out infinite",
            backgroundSize: "200% 100%",
          }}
        />
      )}

      <div
        style={{
          position: "absolute",
          top: -1,
          left: "10%",
          right: "10%",
          height: 1,
          background: loading
            ? "none"
            : `linear-gradient(90deg,transparent,${T.accent.primary}25,${T.accent.emerald}20,transparent)`,
        }}
      />

      <div
        role="tablist"
        aria-label="Main navigation tabs"
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "space-evenly",
          alignItems: "center",
          padding: "8px 4px",
        }}
      >
        {navItems.map((n) => {
          const Icon = n.icon;
          const isCenter = n.isCenter;
          const active = tab === n.id;

          const handlePressStart = (event: ReactMouseEvent<HTMLButtonElement> | ReactTouchEvent<HTMLButtonElement>) => {
            if ("button" in event && event.type === "mousedown" && event.button !== 0) return;
            longPressTimer.current = setTimeout(() => {
              haptic.warning();
              setShowQuickMenu(true);
              longPressTimer.current = null;
            }, 350);
          };

          const handlePressEnd = (event: ReactMouseEvent<HTMLButtonElement> | ReactTouchEvent<HTMLButtonElement>) => {
            if ("button" in event && event.type === "mouseup" && event.button !== 0) return;
            if (!longPressTimer.current) return;
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
            if (tab !== n.id) {
              haptic.light();
              navTo(n.id);
            }
          };

          return (
            <button
              key={n.id}
              role="tab"
              aria-selected={active}
              aria-current={active ? "page" : undefined}
              onMouseDown={isCenter ? handlePressStart : undefined}
              onMouseUp={isCenter ? handlePressEnd : undefined}
              onMouseLeave={
                isCenter
                  ? () => {
                      if (longPressTimer.current) clearTimeout(longPressTimer.current);
                    }
                  : undefined
              }
              onTouchStart={isCenter ? handlePressStart : undefined}
              onTouchEnd={isCenter ? handlePressEnd : undefined}
              aria-label={n.label}
              onClick={
                !isCenter
                  ? () => {
                      if (tab === n.id) {
                        if (transactionFeedTab === n.id) {
                          setTransactionFeedTab(null);
                        }
                      } else {
                        haptic.light();
                        navTo(n.id);
                      }
                    }
                  : undefined
              }
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                background: "none",
                border: "none",
                cursor: "pointer",
                color: active ? T.text.primary : T.text.dim,
                padding: "4px 0",
                height: 56,
                transition: "color .2s ease, gap .3s cubic-bezier(0.16, 1, 0.3, 1)",
                position: "relative",
                userSelect: "none",
                WebkitUserSelect: "none",
                WebkitTouchCallout: "none",
              }}
            >
              {isCenter ? (
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    background: active ? T.accent.gradient : T.bg.elevated,
                    border: `1px solid ${active ? "transparent" : T.border.default}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: active ? `0 4px 20px ${T.accent.primary}60, 0 0 24px ${T.accent.emerald}40` : T.shadow.card,
                    transition: "all .3s cubic-bezier(0.16, 1, 0.3, 1)",
                    animation: active ? "glowPulse 3s ease-in-out infinite" : "none",
                    transform: active ? "scale(1.05)" : "scale(1)",
                  }}
                >
                  <Icon size={20} strokeWidth={2.4} color={active ? "#fff" : T.text.primary} />
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transform: active ? "translateY(-2px)" : "translateY(2px)",
                    opacity: active ? 1 : 0.7,
                    transition: "transform .3s cubic-bezier(0.16, 1, 0.3, 1), opacity .25s ease",
                  }}
                >
                  <Icon size={20} strokeWidth={active ? 2.4 : 2} />
                </div>
              )}

              {!isCenter && (
                <div
                  style={{
                    height: active ? 18 : 0,
                    overflow: "hidden",
                    transition: "height .3s cubic-bezier(0.16, 1, 0.3, 1)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "flex-start",
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.02em",
                      opacity: active ? 1 : 0,
                      transform: active ? "translateY(0)" : "translateY(4px)",
                      transition: "opacity .2s ease, transform .3s cubic-bezier(0.16, 1, 0.3, 1)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {n.label}
                  </span>
                </div>
              )}

              {active && !isCenter && (
                <div
                  style={{
                    position: "absolute",
                    bottom: -2,
                    width: 4,
                    height: 4,
                    borderRadius: 2,
                    background: T.accent.emerald,
                    boxShadow: `0 0 8px ${T.accent.emerald}CC`,
                    animation: "glowPulse 2s ease-in-out infinite",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

const quickMenuButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: 12,
  background: "transparent",
  border: "none",
  color: T.text.primary,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  borderRadius: T.radius.sm,
};
