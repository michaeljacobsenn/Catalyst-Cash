import { useState, useEffect, useRef } from "react";
import { CheckCircle, ChevronDown, ChevronUp, Loader2, Check } from "lucide-react";
import { T } from "./constants.js";
import { fmt } from "./utils.js";
import { Badge, Card } from "./ui.jsx";
import { haptic } from "./haptics.js";

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
}) => {
  const raw = typeof value === "number" ? value : parseFloat(value) || 0;
  const numVal = Number.isFinite(raw) ? raw : 0;
  const [display, setDisplay] = useState(numVal);
  const raf = useRef(null);
  const startTs = useRef(null);
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
    const animate = now => {
      const elapsed = now - startTs.current;
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
export const Mono = ({ children, color, size = 14, weight = 600, style }) => (
  <span
    style={{ fontFamily: T.font.mono, fontVariantNumeric: "tabular-nums", fontSize: size, fontWeight: weight, color: color || T.text.primary, ...style }}
  >
    {children}
  </span>
);

export const StatusDot = ({ status, size = "sm" }) => {
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

export const PaceBar = ({ name, saved, target, deadline, onPace, weeklyPace, catchUp, compact }) => {
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

export const Md = ({ text }) => {
  if (!text) return null;
  return (
    <div style={{ fontSize: 13, lineHeight: 1.75, color: T.text.secondary }}>
      {text.split("\n").map((line, i) => {
        if (!line.trim()) return <div key={i} style={{ height: 6 }} />;
        if (/^---+$/.test(line.trim())) return <Divider key={i} />;
        // Headline (17pt, semibold) - iOS HIG
        if (line.startsWith("### "))
          return (
            <h4
              key={i}
              style={{
                color: T.text.primary,
                fontSize: 17,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                margin: "14px 0 6px",
                fontFamily: T.font.mono,
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
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "-0.01em",
                margin: "18px 0 8px",
              }}
            >
              {line.slice(3).replace(/\*\*/g, "").trim()}
            </h3>
          );
        // Catch compressed headers (e.g. "**DASHBOARD CARD**" without leading ##) - Treat as Headline
        if (/^\*\*[A-Z\s]+CARD\*\*$/.test(line.trim()))
          return (
            <h3 key={i} style={{ color: T.text.primary, fontSize: 17, fontWeight: 600, margin: "14px 0 6px" }}>
              {line.replace(/\*\*/g, "").trim()}
            </h3>
          );

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
                <span key={j} style={{ flex: 1, padding: "2px 4px", color: T.text.secondary }}>
                  {c.replace(/\*\*/g, "")}
                </span>
              ))}
            </div>
          );
        }
        const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
        return (
          <p key={i} style={{ marginBottom: 4, fontSize: 15, lineHeight: 1.6 }}>
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

export const Section = ({ title, icon: Icon, content, accentColor, defaultOpen = true, badge, delay = 0 }) => {
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

export const MoveRow = ({ item, checked, onToggle, index }) => {
  const tm = { REQUIRED: "red", DEADLINE: "amber", PROMO: "blue", OPTIONAL: "gray" };
  const handleToggle = () => {
    if (!checked) haptic.light();
    else haptic.selection();
    onToggle();
  };
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
        gap: 10,
        padding: "12px 0",
        borderBottom: `1px solid ${T.border.subtle}`,
        cursor: "pointer",
        opacity: checked ? 0.3 : 1,
        animationDelay: `${index * 35}ms`,
        transition: "opacity .2s",
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
          <div style={{ marginBottom: 4 }}>
            <Badge variant={tm[item.tag] || "gray"}>{item.tag}</Badge>
          </div>
        )}
        <p
          style={{
            fontSize: 12,
            lineHeight: 1.6,
            textDecoration: checked ? "line-through" : "none",
            color: checked ? T.text.dim : T.text.secondary,
            wordBreak: "break-word",
          }}
        >
          {item.text}
        </p>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// DOLLAR INPUT
// ═══════════════════════════════════════════════════════════════
let diIdCounter = 0;
export const DI = ({ value, onChange, placeholder = "0.00", label = "Amount" }) => {
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
export const StreamingView = ({ streamText, elapsed, isTest, modelName, onCancel }) => {
  const isReceiving = !!streamText && streamText.length > 5;
  const streamScrollRef = useRef(null);

  // Auto-scroll stream text to bottom
  useEffect(() => {
    if (streamScrollRef.current) {
      streamScrollRef.current.scrollTop = streamScrollRef.current.scrollHeight;
    }
  }, [streamText]);

  // ── Multi-phase progress with smooth interpolation ──
  // Phase 1 (0-3s):  0-15%  — Bundling
  // Phase 2 (3-6s):  15-35% — Connecting
  // Phase 3 (6-12s): 35-65% — Analyzing
  // Phase 4 (12-25s): 65-92% — Generating
  // Phase 5 (25s+):  92-95% — Capped (waiting)
  // Receiving:       100%   — Complete
  let baseProgress;
  if (elapsed <= 3) baseProgress = (elapsed / 3) * 15;
  else if (elapsed <= 6) baseProgress = 15 + ((elapsed - 3) / 3) * 20;
  else if (elapsed <= 12) baseProgress = 35 + ((elapsed - 6) / 6) * 30;
  else if (elapsed <= 25) baseProgress = 65 + ((elapsed - 12) / 13) * 27;
  else baseProgress = 92 + Math.min((elapsed - 25) / 20, 1) * 3;
  const progress = isReceiving ? 100 : Math.min(baseProgress, 95);

  // ── Status messages ──
  let currentMsg;
  if (isReceiving) currentMsg = "Streaming audit results...";
  else if (elapsed > 12) currentMsg = "Generating tactical recommendations...";
  else if (elapsed > 6) currentMsg = "Analyzing transactions & balances...";
  else if (elapsed > 3) currentMsg = "Connecting to AI engine...";
  else if (elapsed > 0) currentMsg = "Bundling financial profile...";
  else currentMsg = "Preparing audit...";

  // ── Estimated time ──
  const eta = isReceiving
    ? "< 5s"
    : elapsed < 5
      ? "~15-20s"
      : elapsed < 12
        ? "~10-15s"
        : elapsed < 20
          ? "~5-10s"
          : "Almost done...";

  const showCancel = elapsed >= 3 && !isReceiving;
  const showCancelProminent = elapsed >= 10 && !isReceiving;

  return (
    <div style={{ padding: "24px 16px", animation: "fadeIn .4s ease-out forwards" }}>
      <div style={{ textAlign: "center", marginBottom: isReceiving ? 16 : 28, transition: "margin .4s ease" }}>
        {/* ── App Icon with ambient glow ── */}
        <div
          style={{
            position: "relative",
            width: isReceiving ? 52 : 72,
            height: isReceiving ? 52 : 72,
            margin: "0 auto 18px",
            transition: "all .5s cubic-bezier(.16,1,.3,1)",
          }}
        >
          {/* Animated glow ring */}
          {!isReceiving && (
            <div
              style={{
                position: "absolute",
                inset: -8,
                borderRadius: "50%",
                background: `conic-gradient(from ${(elapsed * 30) % 360}deg, transparent 0%, ${T.accent.primary}40 20%, ${T.accent.emerald}30 40%, transparent 60%)`,
                animation: "spin 3s linear infinite",
                opacity: 0.6,
                mask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #fff calc(100% - 1.5px))",
                WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #fff calc(100% - 1.5px))",
              }}
            />
          )}
          {/* Static ring track */}
          <div
            style={{
              position: "absolute",
              inset: -8,
              borderRadius: "50%",
              border: `1px solid ${T.border.subtle}`,
              pointerEvents: "none",
            }}
          />
          {/* Icon */}
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: isReceiving ? 16 : 22,
              background: isReceiving ? `${T.status.green}15` : "transparent",
              boxShadow: isReceiving ? `0 0 24px ${T.status.green}40` : `0 0 30px ${T.accent.emerald}15`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              transition: "all .5s cubic-bezier(.16,1,.3,1)",
            }}
          >
            <img
              src="/icon-192.png"
              alt=""
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                animation: isReceiving ? "none" : "pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                borderRadius: "inherit",
              }}
            />
          </div>
        </div>

        {/* ── Title + Status Badge ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 6 }}>
          <p
            style={{
              fontSize: isReceiving ? 16 : 20,
              fontWeight: 800,
              transition: "font-size .4s ease",
              letterSpacing: "-0.02em",
            }}
          >
            Running Audit
          </p>
          {isTest && <Badge variant="amber">TEST</Badge>}
        </div>

        {/* ── Metadata line ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <Mono size={11} color={T.text.dim}>
            {elapsed}s elapsed
          </Mono>
          <span style={{ width: 3, height: 3, borderRadius: "50%", background: T.text.dim, flexShrink: 0 }} />
          <Mono size={11} color={T.accent.primary}>
            {modelName || "AI"}
          </Mono>
          {isTest && (
            <>
              <span style={{ width: 3, height: 3, borderRadius: "50%", background: T.text.dim, flexShrink: 0 }} />
              <Mono size={11} color={T.status.amber}>
                NOT SAVED
              </Mono>
            </>
          )}
        </div>

        {/* ── Progress Bar ── */}
        <div style={{ maxWidth: 320, margin: "0 auto", textAlign: "left" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.02em",
                color: isReceiving ? T.status.green : T.accent.primary,
                fontFamily: T.font.mono,
                transition: "color .4s ease",
              }}
            >
              {currentMsg}
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, color: T.text.secondary, fontFamily: T.font.mono }}>
              {Math.floor(progress)}%
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={Math.floor(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Audit progress: ${Math.floor(progress)}%. ${currentMsg}`}
            style={{
              height: 6,
              background: T.bg.elevated,
              borderRadius: 6,
              overflow: "hidden",
              border: `1px solid ${T.border.subtle}`,
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progress}%`,
                background: isReceiving
                  ? `linear-gradient(90deg,${T.status.green}AA,${T.status.green})`
                  : `linear-gradient(90deg,${T.accent.emerald}99,${T.accent.primary})`,
                borderRadius: 6,
                transition: "width 1.2s cubic-bezier(.16,1,.3,1), background .5s ease",
                boxShadow: isReceiving ? `0 0 8px ${T.status.green}60` : "none",
              }}
            />
          </div>
          {/* Estimated time */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            <Mono size={9} color={T.text.dim}>
              Est. {eta}
            </Mono>
            {isReceiving && (
              <Mono size={9} color={T.status.green}>
                Receiving data
              </Mono>
            )}
          </div>
        </div>

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

      {/* ── Stream Output or Skeleton ── */}
      {streamText ? (
        <div className="slide-up">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 8,
              paddingLeft: 2,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: T.status.green,
                animation: "pulse 1s ease infinite",
                flexShrink: 0,
              }}
            />
            <Mono size={10} color={T.text.dim}>
              Live stream from {modelName || "AI"}
            </Mono>
          </div>
          <Card
            style={{
              maxHeight: "45vh",
              overflow: "auto",
              border: `1px solid ${T.accent.primary}20`,
              background: T.bg.elevated,
              boxShadow: `inset 0 4px 24px ${T.bg.base}`,
            }}
          >
            <div ref={streamScrollRef} style={{ maxHeight: "40vh", overflow: "auto" }}>
              <pre
                style={{
                  fontSize: 10,
                  lineHeight: 1.65,
                  color: T.text.secondary,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily: T.font.mono,
                  opacity: 0.9,
                  margin: 0,
                }}
              >
                {streamText}
                <span
                  style={{
                    display: "inline-block",
                    width: 7,
                    height: 14,
                    background: T.status.green,
                    animation: "pulse 1s ease infinite",
                    verticalAlign: "text-bottom",
                    borderRadius: 2,
                    marginLeft: 3,
                  }}
                />
              </pre>
            </div>
          </Card>
        </div>
      ) : (
        <div style={{ transition: "opacity .3s ease", opacity: 0.6 }}>
          {/* Skeleton placeholders that hint at card structure */}
          <div className="shimmer-bg" style={{ height: 70, borderRadius: T.radius.lg, marginBottom: 10 }} />
          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <div className="shimmer-bg" style={{ height: 54, borderRadius: T.radius.md, flex: 1 }} />
            <div className="shimmer-bg" style={{ height: 54, borderRadius: T.radius.md, flex: 1 }} />
            <div className="shimmer-bg" style={{ height: 54, borderRadius: T.radius.md, flex: 1 }} />
          </div>
          <div
            className="shimmer-bg"
            style={{ height: 120, borderRadius: T.radius.lg, marginBottom: 10, animationDelay: "0.1s" }}
          />
          <div className="shimmer-bg" style={{ height: 80, borderRadius: T.radius.lg, animationDelay: "0.2s" }} />
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// EMPTY STATE — Premium with ambient orbits & staggered reveal
// ═══════════════════════════════════════════════════════════════
export const EmptyState = ({ icon: Icon, title, message, action, delay = 0 }) => (
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

export const TabSkeleton = ({ rows = 4 }) => (
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

export const CustomSelect = ({ value, onChange, options, placeholder = "Select...", ariaLabel, icon }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = e => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.flatMap(g => (g.options ? g.options : [g])).find(o => o.value === value);

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
          background: isOpen ? T.bg.card : T.bg.elevated,
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
          boxShadow: isOpen ? `0 0 0 3px ${T.accent.primaryDim}, 0 4px 12px rgba(0,0,0,0.2)` : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
          {icon && <span style={{ color: T.accent.primary, display: "flex", flexShrink: 0 }}>{icon}</span>}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
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
      {isOpen && (
        <div
          role="listbox"
          className="slide-up"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            zIndex: 100,
            background: T.bg.card,
            border: `1px solid ${T.border.default}`,
            borderRadius: T.radius.md,
            boxShadow: `0 12px 32px rgba(0,0,0,0.4), 0 0 0 1px ${T.accent.primary}20`,
            maxHeight: 240,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            padding: 4,
          }}
        >
          {options.map((groupOrOption, i) => {
            // It's an optgroup 
            if (groupOrOption.options) {
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
            // It's a flat option
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
        </div>
      )}
    </div>
  );
};

const OptionItem = ({ option, isSelected, onSelect }) => (
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
      background: isSelected ? `${T.accent.primary}15` : "transparent",
      border: "none",
      borderRadius: T.radius.sm,
      cursor: "pointer",
      textAlign: "left",
      transition: "background .15s ease",
    }}
    onMouseEnter={e => {
      if (!isSelected) e.currentTarget.style.background = T.bg.elevated;
    }}
    onMouseLeave={e => {
      if (!isSelected) e.currentTarget.style.background = "transparent";
    }}
  >
    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      {option.label}
    </span>
    {isSelected && <Check size={14} strokeWidth={3} />}
  </button>
);
