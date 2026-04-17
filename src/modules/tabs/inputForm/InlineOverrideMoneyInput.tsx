import { useState, type ChangeEvent } from "react";
import { T } from "../../constants.js";
import { X } from "../../icons.js";
import type { MoneyInput } from "./utils.js";

interface InlineOverrideMoneyInputProps {
  value: MoneyInput | "";
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  label?: string;
  onReset: () => void;
  tone?: "primary" | "danger";
}

let overrideInputIdCounter = 0;

export function InlineOverrideMoneyInput({
  value,
  onChange,
  placeholder = "0.00",
  label = "Amount",
  onReset,
  tone = "primary",
}: InlineOverrideMoneyInputProps) {
  const [id] = useState(() => `override-di-${++overrideInputIdCounter}`);
  const [focused, setFocused] = useState(false);
  const toneColor = tone === "danger" ? T.status.red : T.accent.primary;
  const toneBackground = tone === "danger" ? T.status.redDim : `${T.accent.primary}10`;
  const toneBorder = tone === "danger" ? `${T.status.red}70` : `${T.accent.primary}70`;
  const toneResetBackground = tone === "danger" ? "rgba(255, 107, 129, 0.12)" : `${T.accent.primary}18`;
  const toneResetBorder = tone === "danger" ? `${T.status.red}40` : `${T.accent.primary}40`;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 30px",
        gap: 6,
        alignItems: "center",
        minWidth: 0,
      }}
    >
      <label
        htmlFor={id}
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </label>
      <div style={{ position: "relative", minWidth: 0 }}>
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            color: toneColor,
            fontFamily: T.font.mono,
            fontSize: 13,
            fontWeight: 800,
            transition: "color 0.2s ease",
            zIndex: 1,
          }}
        >
          $
        </span>
        <input
          id={id}
          type="number"
          step="0.01"
          inputMode="decimal"
          pattern="[0-9.]*"
          value={value}
          placeholder={placeholder}
          onChange={onChange}
          onFocus={(event) => {
            setFocused(true);
            setTimeout(() => event.target.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
          }}
          onBlur={() => setFocused(false)}
          aria-label={label}
          className="app-input"
          style={{
            width: "100%",
            minWidth: 0,
            height: 38,
            padding: "11px 12px 11px 26px",
            borderRadius: T.radius.md,
            background: toneBackground,
            border: `1.5px solid ${focused ? toneColor : toneBorder}`,
            color: T.text.primary,
            fontSize: 16,
            outline: "none",
            boxSizing: "border-box",
            transition: "all 0.2s",
            fontFamily: T.font.mono,
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            boxShadow: focused ? `0 0 0 3px ${toneColor}22` : "none",
          }}
        />
      </div>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onReset}
        aria-label={`Reset ${label} to live value`}
        style={{
          width: 30,
          height: 30,
          borderRadius: 999,
          border: `1px solid ${toneResetBorder}`,
          background: toneResetBackground,
          color: toneColor,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 900,
          lineHeight: 1,
          boxShadow: `0 2px 10px ${toneColor}12`,
          flexShrink: 0,
        }}
      >
        <X size={11} color={toneColor} strokeWidth={2.5} />
      </button>
    </div>
  );
}
