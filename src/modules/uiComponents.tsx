import React from "react";
import { T } from "./constants.js";
import { haptic } from "./haptics.js";

export const ViewToggle = ({ options, active, onChange, style }) => {
  return (
    <div
      style={{
        display: "inline-flex",
        background: T.bg.elevated,
        borderRadius: 20,
        padding: "4px",
        border: `1px solid ${T.border.default}`,
        boxShadow: "inset 0 1px 3px rgba(0,0,0,0.2)",
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
              padding: "6px 20px",
              borderRadius: 16,
              border: "none",
              background: isActive ? T.bg.glass : "transparent",
              color: isActive ? T.text.primary : T.text.dim,
              fontWeight: isActive ? 700 : 600,
              fontSize: 13,
              cursor: "pointer",
              transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
              boxShadow: isActive ? "0 2px 8px rgba(0,0,0,0.2)" : "none",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
