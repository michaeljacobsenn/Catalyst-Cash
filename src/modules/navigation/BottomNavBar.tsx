import {
    useMemo,
    useRef,
    useState,
    type MouseEvent as ReactMouseEvent,
    type TouchEvent as ReactTouchEvent,
  } from "react";
  import { T } from "../constants.js";
  import type { AppTab,NavViewState } from "../contexts/NavigationContext.js";
  import { haptic } from "../haptics.js";
  import { Clock,CreditCard,Home,MessageCircle,Plus,Settings,Wallet,Zap } from "../icons";

interface BottomNavBarProps {
  tab: AppTab;
  navTo: (newTab: AppTab, viewState?: NavViewState | null) => void;
  loading: boolean;
  showGuide: boolean;
  hidden?: boolean;
  transactionFeedTab: AppTab | null;
  setTransactionFeedTab: (tab: AppTab | null) => void;
}

export default function BottomNavBar({
  tab,
  navTo,
  loading,
  showGuide,
  hidden = false,
  transactionFeedTab,
  setTransactionFeedTab,
}: BottomNavBarProps) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showQuickMenu, setShowQuickMenu] = useState(false);

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
  const activeIndex = Math.max(0, navItems.findIndex((item) => item.id === tab));

  return (
    <nav
      aria-label="Main navigation"
      style={{
        position: "relative",
        flexShrink: 0,
        padding: "8px 16px calc(env(safe-area-inset-bottom, 16px) + 8px)",
        zIndex: 200,
        display: showGuide || hidden ? "none" : undefined,
        pointerEvents: loading ? "none" : "auto",
        opacity: loading ? 0.45 : 1,
        transition: "opacity .3s ease",
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
            className="gesture-glass gesture-shadow-soft"
            style={{
              position: "absolute",
              bottom: "calc(env(safe-area-inset-bottom, 16px) + 84px)",
              left: "50%",
              transform: "translateX(-50%)",
              background: T.bg.glass,
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: `1px solid ${T.border.default}`,
              borderRadius: T.radius.lg,
              padding: 8,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              zIndex: 100,
              boxShadow: T.shadow.card,
              width: 220,
              animation: "slideUpMenu .2s ease",
            }}
          >
            <button type="button"
              onClick={() => {
                setShowQuickMenu(false);
                navTo("input");
              }}
              style={quickMenuButtonStyle}
            >
              <Plus size={18} color={T.accent.emerald} /> Start New Audit
            </button>
            <button type="button"
              onClick={() => {
                setShowQuickMenu(false);
                navTo("history");
              }}
              style={quickMenuButtonStyle}
            >
              <Clock size={18} color={T.accent.primary} /> Audit History
            </button>

            <div style={{ height: 1, background: T.border.default, margin: "4px 0" }} />
            <button type="button"
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
            top: 8,
            left: 16,
            right: 16,
            height: 2,
            borderRadius: 999,
            background: T.border.subtle,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: "36%",
              height: "100%",
              borderRadius: 999,
              background: T.accent.primarySoft,
            }}
          />
        </div>
      )}

      <div
        role="tablist"
        aria-label="Main navigation tabs"
        className="gesture-glass gesture-shadow-heavy"
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "space-evenly",
          alignItems: "center",
          padding: "8px 6px",
          background: T.bg.navGlass,
          backdropFilter: "blur(22px) saturate(150%)",
          WebkitBackdropFilter: "blur(22px) saturate(150%)",
          border: `1px solid ${T.border.default}`,
          borderRadius: 30,
          boxShadow: `0 14px 30px -16px rgba(0,0,0,0.48), 0 0 0 1px ${T.border.subtle}`,
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 6,
            top: 8,
            bottom: 8,
            width: `calc((100% - 12px) / ${navItems.length})`,
            borderRadius: 24,
            background: T.bg.surface,
            border: `1px solid ${T.border.subtle}`,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04)`,
            transform: `translateX(${activeIndex * 100}%)`,
            transition: "transform .42s cubic-bezier(0.16, 1, 0.3, 1), width .3s ease, opacity .25s ease",
            opacity: tab === "audit" ? 0 : 1,
            pointerEvents: "none",
          }}
        />
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
            <button type="button"
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
                gap: 3,
                background: "none",
                border: "none",
                cursor: "pointer",
                color: active ? T.text.primary : T.text.dim,
                padding: "4px 0",
                height: 56,
                transition: "color .2s ease, gap .3s cubic-bezier(0.16, 1, 0.3, 1)",
                position: "relative",
                zIndex: 1,
                userSelect: "none",
                WebkitUserSelect: "none",
                WebkitTouchCallout: "none",
              }}
            >
              {isCenter ? (
                <div
                  className={active ? "gesture-shadow-heavy" : "gesture-shadow-soft"}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    background: active ? T.accent.primary : T.bg.elevated,
                    border: `1px solid ${active ? "transparent" : T.border.default}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: active ? `0 10px 24px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.10)` : "none",
                    transition: "transform .3s cubic-bezier(0.16, 1, 0.3, 1), opacity .3s cubic-bezier(0.16, 1, 0.3, 1), background-color .3s cubic-bezier(0.16, 1, 0.3, 1), border-color .3s cubic-bezier(0.16, 1, 0.3, 1), color .3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow .3s cubic-bezier(0.16, 1, 0.3, 1)",
                    transform: active ? "scale(1.02)" : "scale(1)",
                  }}
                >
                  <Icon size={20} strokeWidth={2.4} color={active ? "#fff" : T.text.primary} />
                </div>
              ) : (
                <div
                  style={{
                    width: 34,
                    height: 34,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "transparent",
                    border: "1px solid transparent",
                    transform: active ? "translateY(-1px)" : "translateY(1px)",
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
                      fontWeight: 800,
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
                    width: 14,
                    height: 3,
                    borderRadius: 999,
                    background: T.accent.emerald,
                    opacity: 0.92,
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
