import type { FocusEvent as ReactFocusEvent, RefObject } from "react";
import { Eye, EyeOff, Info, Settings } from "../icons";
import { T } from "../constants.js";
import type { AppTab } from "../contexts/NavigationContext.js";
import { getTracking } from "../ui.js";

interface AppShellHeaderProps {
  tab: AppTab;
  topBarRef: RefObject<HTMLElement | null>;
  headerHidden: boolean;
  showGuide: boolean;
  setShowGuide: (value: boolean | ((prev: boolean) => boolean)) => void;
  privacyMode: boolean;
  setPrivacyMode: (value: boolean | ((prev: boolean) => boolean)) => void;
  navTo: (tab: AppTab) => void;
}

const HEADER_SIDE_WIDTH = 96;

export function SkipToContentLink() {
  return (
    <a
      href="#main-content"
      style={{
        position: "absolute",
        top: -60,
        left: 16,
        zIndex: 100,
        background: T.accent.primary,
        color: "#fff",
        padding: "8px 16px",
        borderRadius: T.radius.md,
        fontWeight: 700,
        fontSize: 13,
        transition: "top .2s ease",
      }}
      onFocus={(e: ReactFocusEvent<HTMLAnchorElement>) => (e.currentTarget.style.top = "8px")}
      onBlur={(e: ReactFocusEvent<HTMLAnchorElement>) => (e.currentTarget.style.top = "-60px")}
    >
      Skip to content
    </a>
  );
}

function getHeaderTitle(tab: AppTab) {
  if (tab === "dashboard") return "Money Snapshot";
  if (tab === "audit") return "Weekly Briefing";
  if (tab === "chat") return "Ask AI";
  if (tab === "cashflow") return "Cash Flow";
  if (tab === "portfolio") return "Portfolio";
  return "";
}

function getHeaderEyebrow(tab: AppTab) {
  if (tab === "dashboard") return "Weekly overview";
  if (tab === "audit") return "Financial check-in";
  if (tab === "chat") return "Private finance assistant";
  if (tab === "cashflow") return "Bills, budget, renewals";
  if (tab === "portfolio") return "Accounts, cards, rewards";
  return "";
}

export default function AppShellHeader({
  tab,
  topBarRef,
  headerHidden,
  showGuide,
  setShowGuide,
  privacyMode,
  setPrivacyMode,
  navTo,
}: AppShellHeaderProps) {
  return (
    <header
      role="banner"
      ref={topBarRef}
      className="gesture-glass gesture-shadow-soft"
      style={{
        position: "relative",
        top: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: `calc(env(safe-area-inset-top, 0px) + 6px) 16px 10px 16px`,
        background: T.bg.navGlass,
        flexShrink: 0,
        zIndex: 10,
        backdropFilter: "blur(28px) saturate(1.45)",
        WebkitBackdropFilter: "blur(28px) saturate(1.45)",
        borderBottom: `1px solid ${T.border.subtle}`,
        transform: headerHidden ? "translateY(-100%)" : "translateY(0)",
        transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        willChange: "transform",
      }}
    >
      <div
        style={{
          position: "absolute",
          bottom: -1,
          left: 0,
          right: 0,
          height: 1,
          background: `linear-gradient(90deg, transparent, ${T.accent.emerald}40, ${T.accent.primary}60, transparent)`,
        }}
      />
      <div
        style={{
          width: HEADER_SIDE_WIDTH,
          minWidth: HEADER_SIDE_WIDTH,
          display: "flex",
          alignItems: "center",
          gap: 8,
          justifyContent: "flex-start",
        }}
      >
        <button
          onClick={() => setShowGuide((prev) => !prev)}
          className="gesture-glass"
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            border: `1px solid ${showGuide ? T.border.focus : T.border.default}`,
            background: showGuide ? `linear-gradient(180deg, ${T.bg.surface}, ${T.bg.card})` : `linear-gradient(180deg, ${T.bg.glass}, ${T.bg.card})`,
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: showGuide ? T.accent.primary : T.text.dim,
            transition: "color .2s, border-color .2s",
            visibility: tab === "chat" ? "hidden" : "visible",
          }}
          aria-label={showGuide ? "Close Guide" : "Open Guide"}
        >
          <Info size={18} strokeWidth={1.8} />
        </button>
        <button
          onClick={() => setPrivacyMode((prev) => !prev)}
          className="gesture-glass"
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            border: `1px solid ${privacyMode ? T.border.focus : T.border.default}`,
            background: privacyMode ? `linear-gradient(180deg, ${T.bg.surface}, ${T.bg.card})` : `linear-gradient(180deg, ${T.bg.glass}, ${T.bg.card})`,
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: privacyMode ? T.accent.primary : T.text.dim,
            transition: "color .2s, border-color .2s",
            visibility: tab === "chat" ? "hidden" : "visible",
          }}
          aria-label={privacyMode ? "Disable Privacy Mode" : "Enable Privacy Mode"}
        >
          {privacyMode ? <EyeOff size={18} strokeWidth={1.8} /> : <Eye size={18} strokeWidth={1.8} />}
        </button>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 0,
          textAlign: "center",
          pointerEvents: "none",
          padding: "0 12px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontWeight: 800,
              color: T.text.dim,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontFamily: T.font.mono,
              opacity: 0.9,
              lineHeight: 1.1,
              maxWidth: "100%",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {getHeaderEyebrow(tab)}
          </div>
          <div
            style={{
              fontSize: 17,
              fontWeight: 850,
              color: T.text.primary,
              letterSpacing: getTracking(16, "bold"),
              textShadow: `0 2px 10px ${T.accent.primaryGlow}`,
              lineHeight: 1.1,
              maxWidth: "100%",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {getHeaderTitle(tab)}
          </div>
        </div>
      </div>

      <div
        style={{
          width: HEADER_SIDE_WIDTH,
          minWidth: HEADER_SIDE_WIDTH,
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <button
          onClick={() => navTo("settings")}
          className="gesture-glass"
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            border: `1px solid ${T.border.default}`,
            background: `linear-gradient(180deg, ${T.bg.glass}, ${T.bg.card})`,
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: T.text.dim,
            transition: "color .2s, border-color .2s",
          }}
          aria-label="Open Settings"
        >
          <Settings size={18} strokeWidth={1.8} />
        </button>
      </div>
    </header>
  );
}
