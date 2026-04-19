  import { T } from "./constants.js";
  import { haptic } from "./haptics.js";

export const ViewToggle = ({ options, active, onChange, style, variant = "pill" }) => {
  const isUnderline = variant === "underline";
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: isUnderline ? 14 : 0,
        background: isUnderline ? "transparent" : T.bg.elevated,
        borderRadius: isUnderline ? 0 : 22,
        padding: isUnderline ? "0 2px" : "4px",
        border: isUnderline ? "none" : `1px solid ${T.border.default}`,
        boxShadow: isUnderline ? "none" : "inset 0 1px 3px rgba(0,0,0,0.16)",
        ...style,
      }}
    >
      {options.map((opt) => {
        const isActive = active === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => {
              if (!isActive) {
                haptic.selection();
                onChange(opt.id);
              }
            }}
            style={{
              position: "relative",
              padding: isUnderline ? "6px 2px 12px 2px" : "7px 18px",
              borderRadius: isUnderline ? 12 : 18,
              border: "none",
              background: isUnderline ? (isActive ? `${T.accent.primary}0D` : "transparent") : (isActive ? T.bg.glass : "transparent"),
              color: isActive ? T.text.primary : (isUnderline ? T.text.secondary : T.text.dim),
              fontWeight: isActive ? 800 : (isUnderline ? 650 : 600),
              fontSize: 13,
              cursor: "pointer",
              transition: "background 0.2s cubic-bezier(0.16, 1, 0.3, 1), color 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
              boxShadow: isUnderline ? "none" : (isActive ? "0 2px 8px rgba(0,0,0,0.2)" : "none"),
              letterSpacing: isUnderline ? "0.015em" : "normal",
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
                  width: isActive ? 26 : 0,
                  height: 3,
                  borderRadius: 999,
                  background: isActive ? `linear-gradient(90deg, ${T.accent.primary}, ${T.accent.emerald})` : "transparent",
                  boxShadow: isActive ? `0 0 14px ${T.accent.primary}40` : "none",
                  transition: "width 0.2s cubic-bezier(0.16, 1, 0.3, 1), background 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
};
