  import type { CSSProperties } from "react";
  import { memo } from "react";
  import { T } from "./constants.js";

/**
 * Coachmark tooltip component — appears as a floating callout
 * with an arrow pointing to the target element.
 */
interface CoachmarkProps {
  text: string;
  onDismiss: () => void;
  position?: "above" | "below";
  style?: CSSProperties;
}

const Coachmark = memo(function Coachmark({ text, onDismiss, position = "below", style }: CoachmarkProps) {
  const isAbove = position === "above";

  return (
    <div
      role="tooltip"
      aria-live="polite"
      className="fade-in"
      style={{
        position: "absolute",
        [isAbove ? "bottom" : "top"]: "calc(100% + 10px)",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        width: "max-content",
        maxWidth: 260,
        pointerEvents: "auto",
        ...style,
      }}
    >
      <div
        style={{
          background: `linear-gradient(135deg, ${T.accent.primary}, #6C60FF)`,
          color: "#fff",
          padding: "10px 14px",
          borderRadius: 12,
          fontSize: 12,
          fontWeight: 600,
          lineHeight: 1.5,
          boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 20px ${T.accent.primary}30`,
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
        }}
      >
        <span style={{ flex: 1 }}>{text}</span>
        <button
          onClick={e => {
            e.stopPropagation();
            onDismiss();
          }}
          aria-label="Dismiss tip"
          style={{
            background: "rgba(255,255,255,0.2)",
            border: "none",
            borderRadius: 6,
            color: "#fff",
            fontSize: 11,
            fontWeight: 800,
            padding: "4px 8px",
            cursor: "pointer",
            flexShrink: 0,
            minHeight: 28,
            minWidth: 28,
          }}
        >
          ✓
        </button>
      </div>
      {/* Arrow */}
      <div
        style={{
          position: "absolute",
          [isAbove ? "bottom" : "top"]: -6,
          left: "50%",
          transform: `translateX(-50%) ${isAbove ? "" : "rotate(180deg)"}`,
          width: 0,
          height: 0,
          borderLeft: "7px solid transparent",
          borderRight: "7px solid transparent",
          borderBottom: `7px solid ${T.accent.primary}`,
        }}
      />
    </div>
  );
});

export default Coachmark;
