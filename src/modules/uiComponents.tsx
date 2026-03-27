  import { T } from "./constants.js";
  import { haptic } from "./haptics.js";

export const ViewToggle = ({ options, active, onChange, style, variant = "pill" }) => {
  const isUnderline = variant === "underline";
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: isUnderline ? 16 : 0,
        background: isUnderline ? "transparent" : T.bg.elevated,
        borderRadius: isUnderline ? 0 : 20,
        padding: isUnderline ? 0 : "4px",
        border: isUnderline ? "none" : `1px solid ${T.border.default}`,
        boxShadow: isUnderline ? "none" : "inset 0 1px 3px rgba(0,0,0,0.2)",
        ...style,
      }}
    >
      {options.map((opt) => {
        const isActive = active === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => {
              if (!isActive) {
                haptic.selection();
                onChange(opt.id);
              }
            }}
            style={{
              position: "relative",
              padding: isUnderline ? "4px 0 10px 0" : "6px 20px",
              borderRadius: isUnderline ? 0 : 16,
              border: "none",
              background: isUnderline ? "transparent" : (isActive ? T.bg.glass : "transparent"),
              color: isActive ? T.text.primary : (isUnderline ? T.text.secondary : T.text.dim),
              fontWeight: isActive ? 700 : (isUnderline ? 650 : 600),
              fontSize: 13,
              cursor: "pointer",
              transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
              boxShadow: isUnderline ? "none" : (isActive ? "0 2px 8px rgba(0,0,0,0.2)" : "none"),
              letterSpacing: isUnderline ? "0.01em" : "normal",
            }}
          >
            {opt.label}
            {isUnderline ? (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  margin: "0 auto",
                  width: isActive ? 28 : 0,
                  height: 3,
                  borderRadius: 999,
                  background: isActive ? T.accent.primary : "transparent",
                  boxShadow: isActive ? `0 0 14px ${T.accent.primary}55` : "none",
                  transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
};
