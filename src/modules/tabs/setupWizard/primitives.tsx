import type { ButtonHTMLAttributes, CSSProperties, ChangeEvent, ReactNode } from "react";
import { T } from "../../constants.js";

export interface SelectOption {
  value: string | number;
  label: string;
}

export interface WizBtnProps {
  children?: ReactNode;
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
  type?: ButtonHTMLAttributes<HTMLButtonElement>["type"];
  variant?: "primary" | "ghost" | "skip";
  disabled?: boolean;
  style?: CSSProperties;
}

export interface WizFieldProps {
  label: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
}

export const WizBtn = ({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled = false,
  style = {},
}: WizBtnProps) => {
  const base = {
    minHeight: 48,
    padding: "13px 20px",
    borderRadius: T.radius.lg,
    fontWeight: 700,
    fontSize: 14,
    cursor: disabled ? "not-allowed" : "pointer",
    border: "none",
    transition: "opacity .2s",
    opacity: disabled ? 0.4 : 1,
    fontFamily: T.font.sans,
    ...style,
  };
  const variants = {
    primary: {
      background: T.accent.primary,
      color: "#fff",
      boxShadow: `inset 0 1px 1px rgba(255,255,255,0.15), 0 4px 14px ${T.accent.primary}40`,
    },
    ghost: { background: "transparent", color: T.text.secondary, border: `1px solid ${T.border.default}` },
    skip: { background: "transparent", color: T.text.dim, border: "none", fontSize: 13, padding: "8px 12px" },
  };
  return (
    <button
      className="wiz-btn"
      type={type}
      onClick={disabled ? undefined : onClick}
      style={{ ...base, ...variants[variant] }}
    >
      {children}
    </button>
  );
};

export const WizField = ({ label, hint, children }: WizFieldProps) => (
  <div style={{ marginBottom: 18, display: "flex", flexDirection: "column", height: "100%" }}>
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: T.text.secondary,
          marginBottom: 4,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
        }}
      >
        {label}
      </div>
      {hint && <div style={{ fontSize: 11, color: T.text.dim, marginBottom: 6, lineHeight: 1.4 }}>{hint}</div>}
    </div>
    <div style={{ marginTop: "auto", width: "100%" }}>{children}</div>
  </div>
);

export const WizInput = ({
  value,
  onChange,
  placeholder,
  type = "text",
  style = {},
  "aria-label": ariaLabel,
  inputMode,
  pattern,
  autoComplete,
  autoCapitalize,
  autoCorrect,
}: {
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  style?: CSSProperties;
  "aria-label"?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  pattern?: string;
  autoComplete?: string;
  autoCapitalize?: string;
  autoCorrect?: string;
}) => (
  <input
    className="wiz-input"
    type={type}
    inputMode={inputMode || (type === "number" ? "decimal" : undefined)}
    pattern={pattern || (type === "number" ? "[0-9]*" : undefined)}
    value={value}
    onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
    placeholder={placeholder}
    aria-label={ariaLabel || placeholder}
    autoComplete={autoComplete}
    autoCapitalize={autoCapitalize}
    autoCorrect={autoCorrect}
    style={{
      width: "100%",
      height: 48,
      padding: "0 14px",
      borderRadius: T.radius.md,
      background: T.bg.elevated,
      border: `1px solid ${T.border.default}`,
      color: T.text.primary,
      fontSize: 14,
      outline: "none",
      fontFamily: T.font.sans,
      boxSizing: "border-box",
      transition: "all 0.2s",
      ...style,
    }}
  />
);

export const WizSelect = ({
  value,
  onChange,
  options,
  disabled = false,
  "aria-label": ariaLabel,
}: {
  value: string | number;
  onChange: (value: string) => void;
  options: Array<SelectOption | string | number>;
  disabled?: boolean;
  "aria-label"?: string;
}) => (
  <select
    className="wiz-input"
    value={value}
    onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
    disabled={disabled}
    aria-label={ariaLabel}
    style={{
      width: "100%",
      height: 48,
      padding: "0 14px",
      borderRadius: T.radius.md,
      background: T.bg.elevated,
      border: `1px solid ${T.border.default}`,
      color: T.text.primary,
      fontSize: 14,
      outline: "none",
      fontFamily: T.font.sans,
      boxSizing: "border-box",
      transition: "all 0.2s",
      appearance: "none",
      WebkitAppearance: "none",
      backgroundImage:
        "url('data:image/svg+xml;utf8,<svg fill=\"%238E8E93\" height=\"24\" viewBox=\"0 0 24 24\" width=\"24\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M7 10l5 5 5-5z\"/><path d=\"M0 0h24v24H0z\" fill=\"none\"/></svg>')",
      backgroundRepeat: "no-repeat",
      backgroundPositionX: "calc(100% - 8px)",
      backgroundPositionY: "center",
      opacity: disabled ? 0.55 : 1,
      cursor: disabled ? "not-allowed" : "pointer",
    }}
  >
    {options.map((option) => {
      const normalized = typeof option === "string" || typeof option === "number" ? { value: option, label: String(option) } : option;
      return (
        <option key={String(normalized.value)} value={normalized.value} style={{ background: T.bg.elevated }}>
          {normalized.label}
        </option>
      );
    })}
  </select>
);

export const WizToggle = ({
  label,
  sub,
  checked,
  onChange,
  disabled = false,
}: {
  label: ReactNode;
  sub?: ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", gap: 12 }}>
    <div>
      <div style={{ fontSize: 14, color: T.text.primary }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: T.text.dim, marginTop: 2 }}>{sub}</div>}
    </div>
    <button
      type="button"
      className="wiz-switch"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onChange(!checked);
      }}
      style={{
        width: 44,
        height: 26,
        borderRadius: 13,
        cursor: disabled ? "not-allowed" : "pointer",
        background: checked ? T.accent.primary : T.bg.surface,
        border: `1px solid ${checked ? T.accent.primary : T.border.default}`,
        position: "relative",
        transition: "background .2s",
        flexShrink: 0,
        padding: 0,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 3,
          left: checked ? 21 : 3,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: checked ? "#fff" : T.text.dim,
          transition: "left .2s",
        }}
      />
    </button>
  </div>
);

export const NavRow = ({
  onBack,
  onNext,
  nextLabel = "Next →",
  nextDisabled = false,
  showBack = true,
}: {
  onBack?: () => void;
  onNext: () => void;
  onSkip?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  showBack?: boolean;
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginTop: 24,
      paddingTop: 18,
      paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
      position: "sticky",
      bottom: -56,
      zIndex: 10,
      backdropFilter: "blur(18px)",
      WebkitBackdropFilter: "blur(18px)",
      background: `linear-gradient(to top, ${T.bg.base} 82%, ${T.bg.base}CC 94%, ${T.bg.base}00 100%)`,
    }}
  >
    {showBack ? (
      <WizBtn variant="ghost" onClick={onBack} style={{ flex: "0 0 auto", minWidth: 80 }}>
        ← Back
      </WizBtn>
    ) : (
      <div style={{ flex: "0 0 80px" }} />
    )}
    <WizBtn onClick={onNext} disabled={nextDisabled} style={{ flex: 1, minWidth: 100, maxWidth: 200 }}>
      {nextLabel}
    </WizBtn>
  </div>
);
