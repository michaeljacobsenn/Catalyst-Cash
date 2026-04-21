import type { ChangeEvent, CSSProperties, FC, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { T } from "../constants.js";
import { haptic } from "../haptics.js";
import { CheckCircle, ChevronDown, ChevronUp } from "../icons";
import { Badge, Card } from "../ui.js";
import { fmt } from "../utils.js";
import MarkdownContent from "./MarkdownContent.js";

interface CountUpProps {
  value: number | string;
  duration?: number;
  prefix?: string;
  suffix?: string;
  formatter?: (value: number) => ReactNode;
  color?: string;
  size?: number;
  weight?: number;
}

interface MonoProps {
  children?: ReactNode;
  color?: string;
  size?: number;
  weight?: number;
  style?: CSSProperties;
}

interface StatusDotProps {
  status?: string;
  size?: "sm" | "md" | "lg";
}

interface PaceBarProps {
  name: string;
  saved: number;
  target: number;
  deadline?: string;
  onPace?: boolean;
  weeklyPace?: number | null;
  catchUp?: number | null;
  compact?: boolean;
}

interface SectionProps {
  title: string;
  icon?: FC<{ size?: number; color?: string; strokeWidth?: number }>;
  content?: string | null;
  accentColor?: string;
  defaultOpen?: boolean;
  badge?: ReactNode;
  delay?: number;
}

interface MoveRowProps {
  item: {
    text: string;
    tag?: string | null;
    amount?: number | string | null;
    title?: string | null;
    detail?: string | null;
    sourceLabel?: string | null;
    targetLabel?: string | null;
    routeLabel?: string | null;
    fundingLabel?: string | null;
  };
  checked?: boolean;
  onToggle: () => void;
  index: number;
  detail?: ReactNode;
}

interface DollarInputProps {
  value: string | number;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  label?: string;
}

interface TabSkeletonProps {
  rows?: number;
}

const STATUS_VARIANT_MAP: Record<string, "green" | "amber" | "red" | "gray"> = {
  GREEN: "green",
  YELLOW: "amber",
  RED: "red",
};

const STATUS_COLOR_MAP: Record<string, string> = {
  GREEN: T.status.green,
  YELLOW: T.status.amber,
  RED: T.status.red,
};

const MOVE_TAG_VARIANTS: Record<string, "red" | "amber" | "blue" | "gray"> = {
  REQUIRED: "red",
  DEADLINE: "amber",
  PROMO: "blue",
  OPTIONAL: "gray",
};

const VISUALLY_HIDDEN_STYLE: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
};

function formatCountUpValue(
  display: number,
  formatter: CountUpProps["formatter"],
  prefix: string,
  suffix: string
) {
  const formatted = formatter ? formatter(display) : fmt(Math.round(display));
  return (
    <>
      {prefix}
      {formatted}
      {suffix}
    </>
  );
}

function getStatusColor(status?: string) {
  return STATUS_COLOR_MAP[status || ""] || T.text.dim;
}

function getStatusVariant(status?: string) {
  return STATUS_VARIANT_MAP[status || ""] || "gray";
}

let diIdCounter = 0;

export const CountUp = ({
  value,
  duration = 800,
  prefix = "",
  suffix = "",
  formatter,
  color,
  size = 14,
  weight = 800,
}: CountUpProps) => {
  const raw = typeof value === "number" ? value : parseFloat(value) || 0;
  const numericValue = Number.isFinite(raw) ? raw : 0;
  const [display, setDisplay] = useState(numericValue);
  const animationFrameRef = useRef<number | null>(null);
  const startTimestampRef = useRef<number | null>(null);
  const previousValueRef = useRef(numericValue);

  useEffect(() => {
    const previousValue = previousValueRef.current;
    previousValueRef.current = numericValue;

    if (previousValue === numericValue) {
      setDisplay(numericValue);
      return;
    }

    startTimestampRef.current = performance.now();
    const animate = (now: number) => {
      const elapsed = now - (startTimestampRef.current ?? now);
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - progress) ** 4;
      setDisplay(previousValue + (numericValue - previousValue) * eased);
      if (progress < 1) animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [duration, numericValue]);

  return (
    <span
      style={{
        fontFamily: T.font.mono,
        fontVariantNumeric: "tabular-nums",
        fontSize: size,
        fontWeight: weight,
        color: color || T.text.primary,
      }}
    >
      {formatCountUpValue(display, formatter, prefix, suffix)}
    </span>
  );
};

export const Mono = ({ children, color, size = 14, weight = 600, style }: MonoProps) => (
  <span
    style={{
      fontFamily: T.font.mono,
      fontVariantNumeric: "tabular-nums",
      fontSize: size,
      fontWeight: weight,
      color: color || T.text.primary,
      ...style,
    }}
  >
    {children}
  </span>
);

export const StatusDot = ({ status, size = "sm" }: StatusDotProps) => {
  const color = getStatusColor(status);
  const dimension = size === "lg" ? 14 : size === "md" ? 10 : 8;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        style={{
          width: dimension,
          height: dimension,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 ${dimension + 6}px ${color}50`,
          flexShrink: 0,
          animation: status === "RED" ? "pulse 1.2s ease-in-out infinite" : "none",
        }}
      />
      <Badge variant={getStatusVariant(status)} style={size === "lg" ? { fontSize: 12, padding: "4px 12px" } : {}}>
        {status}
      </Badge>
    </div>
  );
};

export const Divider = () => (
  <div
    style={{
      height: 1,
      background: `linear-gradient(90deg,transparent,${T.border.default},transparent)`,
      margin: "14px 0",
    }}
  />
);

export const PaceBar = ({ name, saved, target, deadline, onPace, weeklyPace, catchUp, compact }: PaceBarProps) => {
  const percent = target > 0 ? Math.min((saved / target) * 100, 100) : 0;
  const color = percent >= 90 ? T.status.green : percent >= 50 ? T.status.amber : T.status.red;

  return (
    <div style={{ marginBottom: compact ? 10 : 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: compact ? 12 : 13, fontWeight: 600, color: T.text.primary }}>{name}</span>
          {onPace !== undefined && !compact && (
            <Badge variant={onPace ? "green" : "amber"}>{onPace ? "ON PACE" : "OFF PACE"}</Badge>
          )}
        </div>
        {deadline && !compact && (
          <Mono size={10} color={T.text.dim}>
            {deadline}
          </Mono>
        )}
      </div>
      <div
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${name}: ${Math.round(percent)}% of goal`}
        style={{ height: compact ? 6 : 8, background: T.bg.elevated, borderRadius: 6, overflow: "hidden" }}
      >
        <div
          style={{
            height: "100%",
            width: `${percent}%`,
            background: `linear-gradient(90deg,${color}BB,${color})`,
            borderRadius: 6,
            transition: "width .8s cubic-bezier(.16,1,.3,1)",
            animation: "progressFill 1s ease-out",
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
        <Mono size={10} color={T.text.dim}>
          {percent.toFixed(0)}% · {fmt(saved)}/{fmt(target)}
        </Mono>
        {weeklyPace != null && !compact && (
          <Mono size={10} color={T.text.secondary}>
            {fmt(weeklyPace)}/wk
          </Mono>
        )}
      </div>
      {catchUp != null && !compact && (
        <Mono size={10} color={T.status.amber} style={{ display: "block", marginTop: 2 }}>
          Catch-up: {fmt(catchUp)}/wk
        </Mono>
      )}
    </div>
  );
};

export const Md = MarkdownContent;

export const Section = ({ title, icon: Icon, content, accentColor, defaultOpen = true, badge, delay = 0 }: SectionProps) => {
  const [open, setOpen] = useState(defaultOpen);
  if (!content?.trim()) return null;

  const toggle = () => {
    haptic.selection();
    setOpen(!open);
  };

  return (
    <Card animate delay={delay}>
      <div
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggle();
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={`${title} section`}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          minHeight: 28,
          marginBottom: open ? 12 : 0,
          transition: "margin .2s",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
          {Icon && (
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: `${accentColor || T.text.dim}10`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon size={14} color={accentColor || T.text.dim} strokeWidth={2.5} />
            </div>
          )}
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text.primary }}>{title}</span>
          {badge}
        </div>
        {open ? <ChevronUp size={14} color={T.text.dim} /> : <ChevronDown size={14} color={T.text.dim} />}
      </div>
      {open && <Md text={content} />}
    </Card>
  );
};

export const MoveRow = ({ item, checked, onToggle, index, detail = null }: MoveRowProps) => {
  const handleToggle = () => {
    if (!checked) haptic.light();
    else haptic.selection();
    onToggle();
  };
  const headline = String(item.targetLabel || item.title || item.text || "").trim();
  const subline = String(item.detail || "").trim();
  const routeLine = String(item.fundingLabel || item.routeLabel || "").trim();

  return (
    <div
      className="slide-up"
      onClick={handleToggle}
      onKeyDown={event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleToggle();
        }
      }}
      role="checkbox"
      aria-checked={!!checked}
      tabIndex={0}
      aria-label={item.text}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "16px 16px",
        borderRadius: 18,
        border: `1px solid ${checked ? `${T.accent.primary}18` : T.border.subtle}`,
        background: checked ? `${T.accent.primary}08` : `${T.bg.card}88`,
        cursor: "pointer",
        opacity: checked ? 0.3 : 1,
        animationDelay: `${index * 35}ms`,
        transition: "opacity .2s, border-color .2s, background .2s",
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 7,
          flexShrink: 0,
          marginTop: 1,
          border: `2px solid ${checked ? "transparent" : T.text.dim}`,
          background: checked ? T.accent.primary : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "transform .2s, opacity .2s, background-color .2s, border-color .2s, color .2s, box-shadow .2s",
        }}
      >
        {checked && <CheckCircle size={13} color={T.bg.base} strokeWidth={3} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {item.tag && (
          <div style={{ marginBottom: 6 }}>
            <Badge variant={MOVE_TAG_VARIANTS[item.tag] || "gray"}>{item.tag}</Badge>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: subline ? 8 : 0 }}>
          <div
            style={{
              fontSize: 13.5,
              lineHeight: 1.45,
              fontWeight: 700,
              textDecoration: checked ? "line-through" : "none",
              color: checked ? T.text.dim : T.text.primary,
              wordBreak: "break-word",
            }}
          >
            {headline}
          </div>
          {item.amount ? (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "5px 9px",
                borderRadius: 999,
                background: `${T.accent.primary}12`,
                border: `1px solid ${T.accent.primary}18`,
                color: T.accent.primary,
                fontSize: 10.5,
                fontWeight: 900,
                fontFamily: T.font.mono,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {typeof item.amount === "number" ? `$${item.amount.toFixed(2)}` : item.amount}
            </div>
          ) : null}
        </div>
        {routeLine ? (
          <div
            style={{
              marginBottom: subline ? 6 : 0,
              fontSize: 10.5,
              fontWeight: 800,
              color: T.accent.primary,
              fontFamily: T.font.mono,
              letterSpacing: "0.03em",
            }}
          >
            {routeLine}
          </div>
        ) : null}
        {subline ? (
          <p
            style={{
              margin: 0,
              fontSize: 12.5,
              lineHeight: 1.62,
              textDecoration: checked ? "line-through" : "none",
              color: checked ? T.text.dim : T.text.secondary,
              wordBreak: "break-word",
            }}
          >
            {subline}
          </p>
        ) : null}
        {detail ? <div style={{ marginTop: 8 }}>{detail}</div> : null}
      </div>
    </div>
  );
};

export const DI = ({ value, onChange, placeholder = "0.00", label = "Amount" }: DollarInputProps) => {
  const [id] = useState(() => `di-${++diIdCounter}`);
  const [focused, setFocused] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <label htmlFor={id} style={VISUALLY_HIDDEN_STYLE}>
        {label}
      </label>
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 14,
          top: "50%",
          transform: "translateY(-50%)",
          color: focused ? T.accent.primary : T.text.dim,
          fontFamily: T.font.mono,
          fontSize: 14,
          fontWeight: 700,
          transition: "color 0.3s ease",
        }}
      >
        $
      </span>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        pattern="[0-9]*"
        step="0.01"
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
          padding: "12px 14px",
          paddingLeft: 28,
          borderRadius: T.radius.md,
          background: T.bg.elevated,
          border: `1.5px solid ${focused ? T.accent.primary : T.border.default}`,
          color: T.text.primary,
          fontSize: 14,
          outline: "none",
          boxSizing: "border-box",
          transition: "transform 0.2s, opacity 0.2s, background-color 0.2s, border-color 0.2s, color 0.2s, box-shadow 0.2s",
          fontFamily: T.font.mono,
          fontWeight: 700,
          boxShadow: focused ? `0 0 0 3px ${T.accent.primary}30` : "none",
        }}
      />
    </div>
  );
};

export const TabSkeleton = ({ rows = 4 }: TabSkeletonProps) => (
  <div className="fade-in page-body" style={{ paddingTop: 20 }}>
    <div className="shimmer-bg" style={{ height: 22, width: 140, borderRadius: 8, marginBottom: 20 }} />
    {Array.from({ length: rows }, (_, index) => (
      <div
        key={index}
        className="shimmer-bg"
        style={{
          height: index === 0 ? 100 : 70 + (index % 3) * 20,
          borderRadius: T.radius.lg,
          marginBottom: 12,
          animationDelay: `${index * 0.1}s`,
          opacity: 0.8 - index * 0.08,
        }}
      />
    ))}
  </div>
);
