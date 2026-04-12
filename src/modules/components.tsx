  import type {
    ChangeEvent,
    CSSProperties,
    FC,
    MouseEvent as ReactMouseEvent,
    ReactNode
  } from "react";
  import { useEffect,useRef,useState } from "react";
  import { createPortal } from "react-dom";
  import { T } from "./constants.js";
  import { haptic } from "./haptics.js";
  import { Check,CheckCircle,ChevronDown,ChevronUp } from "./icons";
  import { Badge,Card } from "./ui.js";
  import { fmt } from "./utils.js";

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

interface MdProps {
  text?: string | null;
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
  item: { text: string; tag?: string | null; amount?: number | string | null; title?: string | null; detail?: string | null; sourceLabel?: string | null; targetLabel?: string | null; routeLabel?: string | null; fundingLabel?: string | null };
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

interface StreamingViewProps {
  streamText?: string;
  elapsed: number;
  isTest?: boolean;
  modelName?: string;
  onCancel?: () => void;
  title?: string;
  statusLabel?: string;
  helperText?: string;
  phase?: "bundling" | "connecting" | "analysis" | "moves" | "finalize" | "complete";
}

interface EmptyStateProps {
  icon: FC<{ size?: number; color?: string; strokeWidth?: number; style?: CSSProperties }>;
  title: string;
  message: string;
  action?: ReactNode;
  delay?: number;
}

interface TabSkeletonProps {
  rows?: number;
}

interface SelectOption {
  value: string;
  label: string;
  group?: string;
}

interface SelectGroup {
  label: string;
  options: SelectOption[];
}

type SelectOptionLike = SelectOption | SelectGroup;

interface CustomSelectProps {
  value: string | null | undefined;
  onChange: (value: string) => void;
  options: SelectOptionLike[];
  placeholder?: string;
  ariaLabel?: string;
  icon?: ReactNode;
}

interface OptionItemProps {
  option: SelectOption;
  isSelected: boolean;
  onSelect: () => void;
}

// ═══════════════════════════════════════════════════════════════
// COUNT-UP ANIMATION
// ═══════════════════════════════════════════════════════════════
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
  const numVal = Number.isFinite(raw) ? raw : 0;
  const [display, setDisplay] = useState(numVal);
  const raf = useRef<number | null>(null);
  const startTs = useRef<number | null>(null);
  const prevValRef = useRef(numVal);

  useEffect(() => {
    const from = prevValRef.current;
    prevValRef.current = numVal;
    // Skip animation if value hasn't changed
    if (from === numVal) {
      setDisplay(numVal);
      return;
    }
    startTs.current = performance.now();
    const animate = (now: number) => {
      const elapsed = now - (startTs.current ?? now);
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - progress) ** 4; // easeOutQuart
      setDisplay(from + (numVal - from) * eased);
      if (progress < 1) raf.current = requestAnimationFrame(animate);
    };
    raf.current = requestAnimationFrame(animate);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [numVal, duration]);

  const formatted = formatter ? formatter(display) : fmt(Math.round(display));
  return (
    <span style={{ fontFamily: T.font.mono, fontVariantNumeric: "tabular-nums", fontSize: size, fontWeight: weight, color: color || T.text.primary }}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
};

// ═══════════════════════════════════════════════════════════════
// SHARED UI PRIMITIVES
// ═══════════════════════════════════════════════════════════════
export const Mono = ({ children, color, size = 14, weight = 600, style }: MonoProps) => (
  <span
    style={{ fontFamily: T.font.mono, fontVariantNumeric: "tabular-nums", fontSize: size, fontWeight: weight, color: color || T.text.primary, ...style }}
  >
    {children}
  </span>
);

export const StatusDot = ({ status, size = "sm" }: StatusDotProps) => {
  const c =
    status === "GREEN"
      ? T.status.green
      : status === "YELLOW"
        ? T.status.amber
        : status === "RED"
          ? T.status.red
          : T.text.dim;
  const v = status === "GREEN" ? "green" : status === "YELLOW" ? "amber" : status === "RED" ? "red" : "gray";
  const d = size === "lg" ? 14 : size === "md" ? 10 : 8;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        style={{
          width: d,
          height: d,
          borderRadius: "50%",
          background: c,
          boxShadow: `0 0 ${d + 6}px ${c}50`,
          flexShrink: 0,
          animation: status === "RED" ? "pulse 1.2s ease-in-out infinite" : "none",
        }}
      />
      <Badge variant={v} style={size === "lg" ? { fontSize: 12, padding: "4px 12px" } : {}}>
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
  const pct = target > 0 ? Math.min((saved / target) * 100, 100) : 0;
  const c = pct >= 90 ? T.status.green : pct >= 50 ? T.status.amber : T.status.red;
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
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${name}: ${Math.round(pct)}% of goal`}
        style={{ height: compact ? 6 : 8, background: T.bg.elevated, borderRadius: 6, overflow: "hidden" }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: `linear-gradient(90deg,${c}BB,${c})`,
            borderRadius: 6,
            transition: "width .8s cubic-bezier(.16,1,.3,1)",
            animation: "progressFill 1s ease-out",
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
        <Mono size={10} color={T.text.dim}>
          {pct.toFixed(0)}% · {fmt(saved)}/{fmt(target)}
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

export const Md = ({ text }: MdProps) => {
  if (!text) return null;
  return (
    <div
      style={{
        fontSize: 13,
        lineHeight: 1.75,
        color: T.text.secondary,
        overflowWrap: "anywhere",
        wordBreak: "break-word",
      }}
    >
      {text.split("\n").map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} style={{ height: 6 }} />;
        if (/^---+$/.test(trimmed)) return <Divider key={i} />;
        // Headline (17pt, semibold) - iOS HIG
        if (line.startsWith("### "))
          return (
            <h4
              key={i}
              style={{
                color: T.text.primary,
                fontSize: "clamp(15px, 4vw, 17px)",
                fontWeight: 600,
                letterSpacing: "-0.02em",
                margin: "14px 0 6px",
                fontFamily: T.font.mono,
                lineHeight: 1.3,
              }}
            >
              {line.slice(4).replace(/\*\*/g, "").trim()}
            </h4>
          );
        // Title 2 (22pt, bold) - iOS HIG
        if (line.startsWith("## "))
          return (
            <h3
              key={i}
              style={{
                color: T.text.primary,
                fontSize: "clamp(18px, 5vw, 22px)",
                fontWeight: 700,
                letterSpacing: "-0.01em",
                margin: "18px 0 8px",
                lineHeight: 1.2,
              }}
            >
              {line.slice(3).replace(/\*\*/g, "").trim()}
            </h3>
          );
        // Catch compressed headers (e.g. "**DASHBOARD CARD**" without leading ##) - Treat as Headline
        if (/^\*\*[A-Z\s]+CARD\*\*$/.test(trimmed))
          return (
            <h3 key={i} style={{ color: T.text.primary, fontSize: "clamp(15px, 4vw, 17px)", fontWeight: 600, margin: "14px 0 6px", lineHeight: 1.3 }}>
              {trimmed.replace(/\*\*/g, "").trim()}
            </h3>
          );

        if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
          const numbered = trimmed.match(/^(\d+\.)\s+(.*)$/);
          const bulletText = (numbered?.[2] ?? trimmed.replace(/^[-*]\s+/, "")).trim();
          const marker = numbered ? numbered[1] : "•";
          const parts = bulletText.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
          return (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  width: 18,
                  marginTop: 2,
                  color: T.accent.primary,
                  fontSize: 12,
                  fontWeight: 800,
                  fontFamily: numbered ? T.font.mono : T.font.sans,
                }}
              >
                {marker}
              </span>
              <p style={{ margin: 0, fontSize: "clamp(14px, 3.7vw, 15px)", lineHeight: 1.6, overflowWrap: "anywhere" }}>
                {parts.map((p, j) => {
                  if (p.startsWith("**") && p.endsWith("**"))
                    return (
                      <strong key={j} style={{ color: T.text.primary, fontWeight: 700 }}>
                        {p.slice(2, -2)}
                      </strong>
                    );
                  if (p.startsWith("`") && p.endsWith("`"))
                    return (
                      <code
                        key={j}
                        style={{
                          fontFamily: T.font.mono,
                          fontSize: 13,
                          color: T.accent.primary,
                          background: T.accent.primaryDim,
                          padding: "2px 6px",
                          borderRadius: 4,
                          whiteSpace: "break-spaces",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {p.slice(1, -1)}
                      </code>
                    );
                  return <span key={j}>{p}</span>;
                })}
              </p>
            </div>
          );
        }

        if (line.startsWith("|")) {
          const cells = line
            .split("|")
            .filter(c => c.trim())
            .map(c => c.trim());
          if (cells.every(c => /^[-:]+$/.test(c))) return null;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 2,
                fontSize: 13, // Footnote
                fontFamily: T.font.mono,
                padding: "6px 0",
                borderBottom: `1px solid ${T.border.subtle}`,
              }}
            >
              {cells.map((c, j) => (
                <span key={j} style={{ flex: 1, padding: "2px 4px", color: T.text.secondary, overflowWrap: "anywhere" }}>
                  {c.replace(/\*\*/g, "")}
                </span>
              ))}
            </div>
          );
        }
        const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
        return (
          <p key={i} style={{ marginBottom: 6, fontSize: "clamp(14px, 3.7vw, 15px)", lineHeight: 1.62, overflowWrap: "anywhere" }}>
            {parts.map((p, j) => {
              // Subheadline size
              if (p.startsWith("**") && p.endsWith("**"))
                return (
                  <strong key={j} style={{ color: T.text.primary, fontWeight: 700 }}>
                    {p.slice(2, -2)}
                  </strong>
                );
              if (p.startsWith("`") && p.endsWith("`"))
                return (
                  <code
                    key={j}
                    style={{
                      fontFamily: T.font.mono,
                      fontSize: 13,
                      color: T.accent.primary,
                      background: T.accent.primaryDim,
                      padding: "2px 6px",
                      borderRadius: 4,
                      whiteSpace: "break-spaces",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {p.slice(1, -1)}
                  </code>
                );
              return <span key={j}>{p}</span>;
            })}
          </p>
        );
      })}
    </div>
  );
};

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
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
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
  const tm = { REQUIRED: "red", DEADLINE: "amber", PROMO: "blue", OPTIONAL: "gray" };
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
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
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
          transition: "all .2s",
        }}
      >
        {checked && <CheckCircle size={13} color={T.bg.base} strokeWidth={3} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {item.tag && (
          <div style={{ marginBottom: 6 }}>
            <Badge variant={tm[item.tag] || "gray"}>{item.tag}</Badge>
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

// ═══════════════════════════════════════════════════════════════
// DOLLAR INPUT
// ═══════════════════════════════════════════════════════════════
let diIdCounter = 0;
export const DI = ({ value, onChange, placeholder = "0.00", label = "Amount" }: DollarInputProps) => {
  const [id] = useState(() => `di-${++diIdCounter}`);
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ position: "relative" }}>
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
        onFocus={e => {
          setFocused(true);
          setTimeout(() => e.target.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
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
          transition: "all 0.2s",
          fontFamily: T.font.mono,
          fontWeight: 700,
          boxShadow: focused ? `0 0 0 3px ${T.accent.primary}30` : "none",
        }}
      />
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// STREAMING VIEW — Audit Processing Screen
// ═══════════════════════════════════════════════════════════════
export const StreamingView = ({ streamText, elapsed, isTest, modelName, onCancel, title, statusLabel, helperText, phase }: StreamingViewProps) => {
  const inferredReceiving = !!streamText && streamText.length > 5;
  const currentPhase = phase || (inferredReceiving ? "finalize" : elapsed > 40 ? "moves" : elapsed > 15 ? "analysis" : elapsed > 5 ? "connecting" : "bundling");
  const isReceiving = currentPhase === "finalize" || currentPhase === "complete";

  // ── Multi-phase progress with smooth interpolation (90s scale) ──
  // Phase 1 (0-5s):  0-15%  — Bundling
  // Phase 2 (5-15s): 15-30% — Connecting
  // Phase 3 (15-40s): 30-65% — Analyzing
  // Phase 4 (40-75s): 65-90% — Generating
  // Phase 5 (75s+):  90-95% — Refining
  // Receiving:       100%   — Complete
  let baseProgress;
  if (elapsed <= 5) baseProgress = (elapsed / 5) * 15;
  else if (elapsed <= 15) baseProgress = 15 + ((elapsed - 5) / 10) * 15;
  else if (elapsed <= 40) baseProgress = 30 + ((elapsed - 15) / 25) * 35;
  else if (elapsed <= 75) baseProgress = 65 + ((elapsed - 40) / 35) * 25;
  else baseProgress = 90 + Math.min((elapsed - 75) / 20, 1) * 5;
  const phaseProgressMap = {
    bundling: 12,
    connecting: 28,
    analysis: 56,
    moves: 82,
    finalize: 94,
    complete: 100,
  };
  const progress = phase ? phaseProgressMap[currentPhase] : (isReceiving ? 100 : Math.min(baseProgress, 95));

  // ── Status messages ──
  let currentMsg;
  if (statusLabel) currentMsg = statusLabel;
  else if (currentPhase === "complete") currentMsg = "Audit complete.";
  else if (currentPhase === "finalize") currentMsg = "Packaging final briefing...";
  else if (currentPhase === "moves") currentMsg = "Generating tactical recommendations...";
  else if (currentPhase === "analysis") currentMsg = "Analyzing transactions & balances...";
  else if (currentPhase === "connecting") currentMsg = "Connecting to AI engine...";
  else if (currentPhase === "bundling") currentMsg = "Bundling financial profile...";
  else currentMsg = "Preparing audit...";

  // ── Estimated time ──
  const eta = currentPhase === "complete"
    ? "Ready"
    : currentPhase === "finalize"
      ? "< 5s"
      : currentPhase === "moves"
        ? "~15-30s"
        : currentPhase === "analysis"
          ? "~45s"
          : currentPhase === "connecting"
            ? "~1m 15s"
            : "~1m 15s";

  const showCancel = elapsed >= 5 && currentPhase !== "finalize" && currentPhase !== "complete";
  const showCancelProminent = elapsed >= 20 && currentPhase !== "finalize" && currentPhase !== "complete";
  const stageIndexMap = {
    bundling: 0,
    connecting: 0,
    analysis: 1,
    moves: 2,
    finalize: 3,
    complete: 3,
  };
  const stageIndex = stageIndexMap[currentPhase];
  const stages = [
    { label: "Context", detail: "Bundling live balances and rules" },
    { label: "Analysis", detail: "Running the cash-flow and risk pass" },
    { label: "Moves", detail: "Building the briefing and actions" },
    { label: "Finalize", detail: "Packaging the finished briefing" },
  ];

  return (
    <div
      style={{
        padding: "calc(var(--top-bar-h, 0px) + env(safe-area-inset-top, 0px) + 20px) 16px 32px",
        animation: "fadeIn .4s ease-out forwards",
        maxWidth: 400,
        margin: "0 auto",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: isReceiving ? 24 : 36, transition: "margin .4s ease" }}>
        
        {/* ── App Icon ── */}
        <div
          style={{
            width: isReceiving ? 48 : 64,
            height: isReceiving ? 48 : 64,
            margin: "0 auto 20px",
            borderRadius: isReceiving ? 12 : 16,
            overflow: "hidden",
            boxShadow: `0 8px 16px ${T.accent.emerald}20`,
            transition: "all .4s cubic-bezier(.16,1,.3,1)",
            background: T.bg.card
          }}
        >
          <img
            src="/icon-192.png"
            alt="Catalyst Cash Icon"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              animation: isReceiving ? "none" : "pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
            }}
          />
        </div>

        {/* ── Title + Status Badge ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 }}>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              margin: 0,
              color: T.text.primary
            }}
          >
            {title || "Running Audit"}
          </h2>
          {isTest && <Badge variant="amber" style={{ height: "fit-content" }}>TEST</Badge>}
        </div>

        {/* ── Metadata line ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            marginBottom: 24,
            opacity: 0.8
          }}
        >
          <Mono size={12} color={T.text.dim}>
            {elapsed}s elapsed
          </Mono>
          <span style={{ width: 4, height: 4, borderRadius: "50%", background: T.border.subtle, flexShrink: 0 }} />
          <Mono size={12} color={T.text.dim}>
            {modelName || "AI Engine"}
          </Mono>
        </div>

        {/* ── Progress Bar ── */}
        <div style={{ maxWidth: 360, margin: "0 auto", textAlign: "left" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: T.text.secondary,
              }}
            >
              {currentMsg}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, fontFamily: T.font.mono }}>
              {Math.floor(progress)}%
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={Math.floor(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{
              height: 4,
              background: T.border.subtle,
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progress}%`,
                background: T.accent.primary,
                borderRadius: 2,
                transition: "width 0.8s cubic-bezier(.16,1,.3,1)"
              }}
            />
          </div>
          {/* Estimated time */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ fontSize: 11, color: T.text.dim, fontWeight: 500 }}>
              Est. {eta}
            </span>
            {(currentPhase === "finalize" || currentPhase === "complete") && (
              <span style={{ fontSize: 11, color: T.status.green, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: T.status.green, animation: "pulse 1.5s infinite" }} />
                Finalizing
              </span>
            )}
          </div>
        </div>

        {helperText && (
          <div
            style={{
              marginTop: 14,
              fontSize: 12,
              lineHeight: 1.5,
              color: T.text.secondary,
              maxWidth: 320,
              marginInline: "auto",
            }}
          >
            {helperText}
          </div>
        )}

        {/* ── Cancel button — visible after 3s, prominent after 10s ── */}
        {onCancel && showCancel && (
          <div style={{ marginTop: 18 }}>
            <button
              onClick={onCancel}
              aria-label="Cancel audit"
              className={showCancelProminent ? "btn-secondary hover-lift" : "btn-secondary"}
              style={{
                borderColor: showCancelProminent ? T.status.amber : undefined,
                background: showCancelProminent ? `${T.status.amber}12` : undefined,
                color: showCancelProminent ? T.status.amber : undefined,
                transition: "all 0.4s ease",
              }}
            >
              {showCancelProminent ? "Taking too long? Cancel" : "Cancel"}
            </button>
          </div>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gap: 12,
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            borderRadius: 24,
            padding: "18px 18px 16px",
            background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.surface})`,
            border: `1px solid ${T.border.default}`,
            boxShadow: `0 18px 40px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.04)`,
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 999,
              background: `${T.accent.primary}12`,
              border: `1px solid ${T.accent.primary}24`,
              color: T.accent.primary,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.accent.primary, boxShadow: `0 0 0 4px ${T.accent.primary}18`, animation: "pulse 1.4s ease-in-out infinite" }} />
            Catalyst is building your briefing
          </div>

          <div
            style={{
              fontSize: 17,
              lineHeight: 1.35,
              fontWeight: 800,
              color: T.text.primary,
              letterSpacing: "-0.02em",
              marginBottom: 6,
            }}
          >
            {currentMsg}
          </div>

          <div
            style={{
              fontSize: 12.5,
              lineHeight: 1.6,
              color: T.text.secondary,
              maxWidth: 280,
              margin: "0 auto",
            }}
          >
            {helperText || "We’ll show the finished briefing once the structured audit is complete."}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          {stages.map((stage, index) => {
            const isActive = index === stageIndex && currentPhase !== "complete";
            const isDone = index < stageIndex || currentPhase === "complete" || (currentPhase === "finalize" && index === 3);
            const accent = isActive ? T.accent.primary : isDone ? T.status.green : T.text.dim;
            return (
              <div
                key={stage.label}
                style={{
                  borderRadius: 18,
                  padding: "12px 12px 11px",
                  background: isActive ? `${T.accent.primary}12` : `${T.bg.card}`,
                  border: `1px solid ${isActive ? `${T.accent.primary}2e` : T.border.subtle}`,
                  boxShadow: isActive ? `0 10px 26px ${T.accent.primary}18` : "none",
                  transition: "all .25s ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 5,
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: `${accent}18`,
                      color: accent,
                      fontSize: 10,
                      fontWeight: 900,
                      flexShrink: 0,
                    }}
                  >
                    {isDone ? "✓" : index + 1}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 800, color: isActive ? T.text.primary : T.text.secondary }}>
                    {stage.label}
                  </span>
                </div>
                <div style={{ fontSize: 11, lineHeight: 1.45, color: T.text.dim }}>
                  {stage.detail}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// EMPTY STATE — Premium with ambient orbits & staggered reveal
// ═══════════════════════════════════════════════════════════════
export const EmptyState = ({ icon: Icon, title, message, action, delay = 0 }: EmptyStateProps) => (
  <div
    className="scale-in"
    style={{
      textAlign: "center",
      padding: "56px 24px 48px",
      animationDelay: `${delay}ms`,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      position: "relative",
      overflow: "hidden",
    }}
  >
    {/* Ambient gradient blobs */}
    <div
      style={{
        position: "absolute",
        top: -40,
        left: "20%",
        width: 120,
        height: 120,
        background: T.accent.primary,
        filter: "blur(80px)",
        opacity: 0.08,
        borderRadius: "50%",
        pointerEvents: "none",
      }}
    />
    <div
      style={{
        position: "absolute",
        bottom: -30,
        right: "15%",
        width: 100,
        height: 100,
        background: T.accent.emerald,
        filter: "blur(70px)",
        opacity: 0.06,
        borderRadius: "50%",
        pointerEvents: "none",
      }}
    />

    {/* Icon container with dual orbits */}
    <div style={{ position: "relative", width: 96, height: 96, marginBottom: 28 }}>
      {/* Outer orbit */}
      <div
        style={{
          position: "absolute",
          inset: -16,
          borderRadius: "50%",
          border: `1px dashed ${T.border.focus}`,
          opacity: 0.2,
          animation: "spin 25s linear infinite",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -3,
            left: "50%",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: T.accent.primary,
            opacity: 0.6,
          }}
        />
      </div>
      {/* Inner orbit (counter-rotating) */}
      <div
        style={{
          position: "absolute",
          inset: -4,
          borderRadius: "50%",
          border: `1px dashed ${T.accent.emeraldSoft}`,
          opacity: 0.25,
          animation: "spin 15s linear infinite reverse",
        }}
      >
        <div
          style={{
            position: "absolute",
            bottom: -2,
            right: "10%",
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: T.accent.emerald,
            opacity: 0.5,
          }}
        />
      </div>
      {/* Main icon backdrop */}
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: 28,
          background: `linear-gradient(145deg, ${T.accent.primaryDim}, ${T.bg.card})`,
          border: `1px solid ${T.accent.primarySoft}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 0 48px ${T.accent.primaryDim}, 0 8px 32px rgba(0,0,0,0.15), inset 0 2px 10px rgba(255,255,255,0.05)`,
        }}
      >
        <Icon
          size={36}
          color={T.accent.primary}
          strokeWidth={1.5}
          style={{ filter: `drop-shadow(0 2px 10px ${T.accent.primaryGlow})` }}
        />
      </div>
    </div>

    <h3
      style={{
        fontSize: 20,
        fontWeight: 800,
        color: T.text.primary,
        marginBottom: 10,
        letterSpacing: "-0.02em",
        animation: "fadeInUp .5s ease-out .15s both",
      }}
    >
      {title}
    </h3>
    <p
      style={{
        fontSize: 13,
        color: T.text.secondary,
        lineHeight: 1.7,
        maxWidth: 300,
        margin: "0 auto",
        animation: "fadeInUp .5s ease-out .25s both",
      }}
    >
      {message}
    </p>
    {action && <div style={{ marginTop: 20, animation: "fadeInUp .5s ease-out .35s both" }}>{action}</div>}
  </div>
);

export const TabSkeleton = ({ rows = 4 }: TabSkeletonProps) => (
  <div className="fade-in page-body" style={{ paddingTop: 20 }}>
    {/* Title shimmer */}
    <div className="shimmer-bg" style={{ height: 22, width: 140, borderRadius: 8, marginBottom: 20 }} />
    {/* Card shimmers */}
    {Array.from({ length: rows }, (_, i) => (
      <div
        key={i}
        className="shimmer-bg"
        style={{
          height: i === 0 ? 100 : 70 + (i % 3) * 20,
          borderRadius: T.radius.lg,
          marginBottom: 12,
          animationDelay: `${i * 0.1}s`,
          opacity: 0.8 - i * 0.08,
        }}
      />
    ))}
  </div>
);

// ═══════════════════════════════════════════════════════════════
// PREMIUM CUSTOM SELECT
// ═══════════════════════════════════════════════════════════════

export const CustomSelect = ({ value, onChange, options, placeholder = "Select...", ariaLabel, icon }: CustomSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0, flip: false });

  const calcPosition = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const optionCount = options.flatMap(g => ("options" in g ? g.options : [g])).length;
    const estimatedHeight = Math.min(240, Math.max(160, optionCount * 40));
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const flip = spaceBelow < estimatedHeight + 8 && spaceAbove > spaceBelow;
    setDropPos({
      top: flip ? rect.top - 6 : rect.bottom + 6,
      left: rect.left,
      width: rect.width,
      flip,
    });
  };

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target;
      if (
        containerRef.current &&
        target instanceof Element &&
        !containerRef.current.contains(target) &&
        !target.closest("[data-custom-select-portal]")
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    calcPosition();
    const onScroll = () => calcPosition();
    const onResize = () => calcPosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [isOpen, options]);

  const selectedOption = options.flatMap(g => ("options" in g ? g.options : [g])).find(o => o.value === value);

  return (
    <div ref={containerRef} style={{ position: "relative", flex: 1, minWidth: 0 }}>
      {/* TRIGGER */}
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={() => {
          haptic.selection();
          setIsOpen(!isOpen);
        }}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "10px 12px",
          background: isOpen ? `linear-gradient(180deg, ${T.bg.surface}, ${T.bg.card})` : `linear-gradient(180deg, ${T.bg.elevated}, ${T.bg.card})`,
          color: selectedOption ? T.text.primary : T.text.muted,
          border: `1.5px solid ${isOpen ? T.accent.primary : T.border.default}`,
          borderRadius: T.radius.md,
          fontFamily: T.font.sans,
          fontSize: 12,
          fontWeight: selectedOption ? 600 : 400,
          cursor: "pointer",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          transition: "all .2s ease",
          boxShadow: isOpen ? `0 0 0 3px ${T.accent.primaryDim}, 0 8px 18px rgba(0,0,0,0.18)` : `inset 0 1px 0 rgba(255,255,255,0.03)`,
          transform: "translateZ(0)",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
          {icon && <span style={{ color: T.accent.primary, display: "flex", flexShrink: 0 }}>{icon}</span>}
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              color: "inherit",
              WebkitTextFillColor: "currentColor",
              transform: "translateZ(0)",
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
            }}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <ChevronDown
          size={14}
          color={isOpen ? T.accent.primary : T.text.dim}
          style={{
            flexShrink: 0,
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform .3s var(--spring-stiff)",
          }}
        />
      </button>

      {/* DROPDOWN MENU */}
      {isOpen &&
        createPortal(
          <div
            role="listbox"
            data-custom-select-portal
            className="slide-up"
            style={{
              position: "fixed",
              ...(dropPos.flip
                ? { bottom: window.innerHeight - dropPos.top, left: dropPos.left }
                : { top: dropPos.top, left: dropPos.left }),
              width: dropPos.width,
              zIndex: 99999,
              background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.elevated})`,
              border: `1px solid ${T.border.default}`,
              borderRadius: T.radius.md,
              boxShadow: `0 18px 40px rgba(0,0,0,0.34), 0 0 0 1px ${T.accent.primary}18`,
              maxHeight: 240,
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              padding: 4,
            }}
          >
            {options.map((groupOrOption, i) => {
              if ("options" in groupOrOption) {
                return (
                  <div key={groupOrOption.label || i} style={{ marginBottom: 4 }}>
                    <div
                      style={{
                        padding: "6px 12px 2px",
                        fontSize: 10,
                        fontWeight: 800,
                        color: T.text.dim,
                        fontFamily: T.font.mono,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {groupOrOption.label}
                    </div>
                    {groupOrOption.options.map(opt => (
                      <OptionItem
                        key={opt.value}
                        option={opt}
                        isSelected={value === opt.value}
                        onSelect={() => {
                          haptic.selection();
                          onChange(opt.value);
                          setIsOpen(false);
                        }}
                      />
                    ))}
                  </div>
                );
              }
              return (
                <OptionItem
                  key={groupOrOption.value}
                  option={groupOrOption}
                  isSelected={value === groupOrOption.value}
                  onSelect={() => {
                    haptic.selection();
                    onChange(groupOrOption.value);
                    setIsOpen(false);
                  }}
                />
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
};

const OptionItem: FC<OptionItemProps> = ({ option, isSelected, onSelect }) => (
  <button
    role="option"
    aria-selected={isSelected}
    onClick={onSelect}
    style={{
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "10px 12px",
      fontSize: 12,
      fontWeight: isSelected ? 800 : 500,
      color: isSelected ? T.accent.primary : T.text.primary,
      background: isSelected ? `${T.accent.primary}14` : "transparent",
      border: "none",
      borderRadius: T.radius.sm,
      cursor: "pointer",
      textAlign: "left",
      transition: "background .15s ease",
    }}
    onMouseEnter={(e: ReactMouseEvent<HTMLButtonElement>) => {
      if (!isSelected) e.currentTarget.style.background = T.bg.elevated;
    }}
    onMouseLeave={(e: ReactMouseEvent<HTMLButtonElement>) => {
      if (!isSelected) e.currentTarget.style.background = "transparent";
    }}
  >
    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      {option.label}
    </span>
    {isSelected && <Check size={14} strokeWidth={3} />}
  </button>
);
