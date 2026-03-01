import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, CheckCircle, Loader2 } from "lucide-react";
import { T } from "./constants.js";
import { fmt } from "./utils.js";
import { Card, Badge } from "./ui.jsx";

// ═══════════════════════════════════════════════════════════════
// COUNT-UP ANIMATION
// ═══════════════════════════════════════════════════════════════
export const CountUp = ({ value, duration = 800, prefix = "", suffix = "", formatter, color, size = 14, weight = 800 }) => {
    const [display, setDisplay] = useState(0);
    const raf = useRef(null);
    const startTs = useRef(null);
    const raw = typeof value === "number" ? value : parseFloat(value) || 0;
    const numVal = Number.isFinite(raw) ? raw : 0;

    useEffect(() => {
        startTs.current = performance.now();
        const animate = (now) => {
            const elapsed = now - startTs.current;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 4); // easeOutQuart
            setDisplay(numVal * eased);
            if (progress < 1) raf.current = requestAnimationFrame(animate);
        };
        raf.current = requestAnimationFrame(animate);
        return () => { if (raf.current) cancelAnimationFrame(raf.current); };
    }, [numVal, duration]);

    const formatted = formatter ? formatter(display) : fmt(Math.round(display));
    return <span style={{ fontFamily: T.font.mono, fontSize: size, fontWeight: weight, color: color || T.text.primary }}>{prefix}{formatted}{suffix}</span>;
};


// ═══════════════════════════════════════════════════════════════
// SHARED UI PRIMITIVES
// ═══════════════════════════════════════════════════════════════
export const Mono = ({ children, color, size = 14, weight = 600, style }) => (
    <span style={{ fontFamily: T.font.mono, fontSize: size, fontWeight: weight, color: color || T.text.primary, ...style }}>{children}</span>
);

export const StatusDot = ({ status, size = "sm" }) => {
    const c = status === "GREEN" ? T.status.green : status === "YELLOW" ? T.status.amber : status === "RED" ? T.status.red : T.text.dim;
    const v = status === "GREEN" ? "green" : status === "YELLOW" ? "amber" : status === "RED" ? "red" : "gray";
    const d = size === "lg" ? 14 : size === "md" ? 10 : 8;
    return <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{
            width: d, height: d, borderRadius: "50%", background: c,
            boxShadow: `0 0 ${d + 6}px ${c}50`, flexShrink: 0,
            animation: status === "RED" ? "pulse 1.2s ease-in-out infinite" : "none"
        }} />
        <Badge variant={v} style={size === "lg" ? { fontSize: 12, padding: "4px 12px" } : {}}>{status}</Badge>
    </div>;
};

export const Divider = () => <div style={{ height: 1, background: `linear-gradient(90deg,transparent,${T.border.default},transparent)`, margin: "14px 0" }} />;

export const PaceBar = ({ name, saved, target, deadline, onPace, weeklyPace, catchUp, compact }) => {
    const pct = target > 0 ? Math.min((saved / target) * 100, 100) : 0;
    const c = pct >= 90 ? T.status.green : pct >= 50 ? T.status.amber : T.status.red;
    return <div style={{ marginBottom: compact ? 10 : 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: compact ? 12 : 13, fontWeight: 600, color: T.text.primary }}>{name}</span>
                {onPace !== undefined && !compact && <Badge variant={onPace ? "green" : "amber"}>{onPace ? "ON PACE" : "OFF PACE"}</Badge>}
            </div>
            {deadline && !compact && <Mono size={10} color={T.text.dim}>{deadline}</Mono>}
        </div>
        <div
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${name}: ${Math.round(pct)}% of goal`}
            style={{ height: compact ? 6 : 8, background: T.bg.elevated, borderRadius: 6, overflow: "hidden" }}
        >
            <div style={{
                height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${c}BB,${c})`,
                borderRadius: 6, transition: "width .8s cubic-bezier(.16,1,.3,1)", animation: "progressFill 1s ease-out"
            }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
            <Mono size={10} color={T.text.dim}>{pct.toFixed(0)}% · {fmt(saved)}/{fmt(target)}</Mono>
            {weeklyPace != null && !compact && <Mono size={10} color={T.text.secondary}>{fmt(weeklyPace)}/wk</Mono>}
        </div>
        {catchUp != null && !compact && <Mono size={10} color={T.status.amber} style={{ display: "block", marginTop: 2 }}>Catch-up: {fmt(catchUp)}/wk</Mono>}
    </div>;
};

export const Md = ({ text }) => {
    if (!text) return null;
    return <div style={{ fontSize: 13, lineHeight: 1.75, color: T.text.secondary }}>
        {text.split("\n").map((line, i) => {
            if (!line.trim()) return <div key={i} style={{ height: 6 }} />;
            if (/^---+$/.test(line.trim())) return <Divider key={i} />;
            if (line.startsWith("### ")) return <h4 key={i} style={{ color: T.text.primary, fontSize: 13, fontWeight: 700, margin: "10px 0 4px", fontFamily: T.font.mono }}>{line.slice(4).replace(/\*\*/g, "").trim()}</h4>;
            if (line.startsWith("## ")) return <h3 key={i} style={{ color: T.text.primary, fontSize: 14, fontWeight: 700, margin: "12px 0 5px" }}>{line.slice(3).replace(/\*\*/g, "").trim()}</h3>;
            // Catch compressed headers (e.g. "**DASHBOARD CARD**" without leading ##)
            if (/^\*\*[A-Z\s]+CARD\*\*$/.test(line.trim())) return <h3 key={i} style={{ color: T.text.primary, fontSize: 14, fontWeight: 700, margin: "12px 0 5px" }}>{line.replace(/\*\*/g, "").trim()}</h3>;

            if (line.startsWith("|")) {
                const cells = line.split("|").filter(c => c.trim()).map(c => c.trim());
                if (cells.every(c => /^[-:]+$/.test(c))) return null;
                return <div key={i} style={{ display: "flex", gap: 2, fontSize: 11, fontFamily: T.font.mono, padding: "4px 0", borderBottom: `1px solid ${T.border.subtle}` }}>
                    {cells.map((c, j) => <span key={j} style={{ flex: 1, padding: "2px 4px", color: T.text.secondary }}>{c.replace(/\*\*/g, "")}</span>)}</div>;
            }
            const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
            return <p key={i} style={{ marginBottom: 3 }}>{parts.map((p, j) => {
                if (p.startsWith("**") && p.endsWith("**")) return <strong key={j} style={{ color: T.text.primary, fontWeight: 700 }}>{p.slice(2, -2)}</strong>;
                if (p.startsWith("`") && p.endsWith("`")) return <code key={j} style={{ fontFamily: T.font.mono, fontSize: 11, color: T.accent.primary, background: T.accent.primaryDim, padding: "2px 6px", borderRadius: 4 }}>{p.slice(1, -1)}</code>;
                return <span key={j}>{p}</span>;
            })}</p>;
        })}</div>;
};

export const Section = ({ title, icon: Icon, content, accentColor, defaultOpen = true, badge, delay = 0 }) => {
    const [open, setOpen] = useState(defaultOpen);
    if (!content?.trim()) return null;
    const toggle = () => setOpen(!open);
    return <Card animate delay={delay}>
        <div onClick={toggle}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}
            role="button" tabIndex={0} aria-expanded={open} aria-label={`${title} section`}
            style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                cursor: "pointer", minHeight: 28, marginBottom: open ? 12 : 0, transition: "margin .2s"
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                {Icon && <div style={{
                    width: 28, height: 28, borderRadius: 8, background: `${accentColor || T.text.dim}10`,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                }}>
                    <Icon size={14} color={accentColor || T.text.dim} strokeWidth={2.5} /></div>}
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text.primary }}>{title}</span>{badge}</div>
            {open ? <ChevronUp size={14} color={T.text.dim} /> : <ChevronDown size={14} color={T.text.dim} />}
        </div>
        {open && <Md text={content} />}
    </Card>;
};

export const MoveRow = ({ item, checked, onToggle, index }) => {
    const tm = { REQUIRED: "red", DEADLINE: "amber", PROMO: "blue", OPTIONAL: "gray" };
    return <div className="slide-up" onClick={onToggle}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        role="checkbox" aria-checked={!!checked} tabIndex={0}
        aria-label={item.text}
        style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            padding: "12px 0", borderBottom: `1px solid ${T.border.subtle}`, cursor: "pointer",
            opacity: checked ? .3 : 1, animationDelay: `${index * 35}ms`, transition: "opacity .2s"
        }}>
        <div style={{
            width: 22, height: 22, borderRadius: 7, flexShrink: 0, marginTop: 1,
            border: `2px solid ${checked ? "transparent" : T.text.dim}`, background: checked ? T.accent.primary : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s"
        }}>
            {checked && <CheckCircle size={13} color={T.bg.base} strokeWidth={3} />}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
            {item.tag && <div style={{ marginBottom: 4 }}><Badge variant={tm[item.tag] || "gray"}>{item.tag}</Badge></div>}
            <p style={{
                fontSize: 12, lineHeight: 1.6, textDecoration: checked ? "line-through" : "none",
                color: checked ? T.text.dim : T.text.secondary, wordBreak: "break-word"
            }}>{item.text}</p></div>
    </div>;
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
            <label htmlFor={id} style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap" }}>{label}</label>
            <span aria-hidden="true" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: focused ? T.accent.primary : T.text.dim, fontFamily: T.font.mono, fontSize: 14, fontWeight: 600, transition: "color 0.3s ease" }}>$</span>
            <input id={id} type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={value} placeholder={placeholder} onChange={onChange} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} aria-label={label} style={{ paddingLeft: 28, fontFamily: T.font.mono, fontWeight: 600 }} />
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════
// STREAMING VIEW
// ═══════════════════════════════════════════════════════════════
export const StreamingView = ({ streamText, elapsed, isTest, modelName, onCancel }) => {
    const isReceiving = !!streamText && streamText.length > 5;
    const maxTime = 30; // 30s window — some providers take 20-30s before first token
    const baseProgress = Math.min(((elapsed + 1) / maxTime) * 100, 95);
    const progress = isReceiving ? 100 : baseProgress;

    let currentMsg = "Bundling financial profile...";
    if (isReceiving) currentMsg = "STREAMING AUDIT PAYLOAD...";
    else if (elapsed > 4) currentMsg = "Generating tactical recommendations...";
    else if (elapsed > 2) currentMsg = "Analyzing weekly transactions...";
    else if (elapsed > 0) currentMsg = "Opening secure AI session...";

    const showCancelProminent = elapsed >= 8 && !isReceiving;

    return (
        <div style={{ padding: "24px 16px", animation: "fadeIn .4s ease-out forwards" }}>
            <div style={{ textAlign: "center", marginBottom: isReceiving ? 16 : 32, transition: "margin .4s ease" }}>
                <div style={{
                    width: isReceiving ? 48 : 64, height: isReceiving ? 48 : 64, borderRadius: 20, margin: "0 auto 16px",
                    background: isReceiving ? `${T.status.green}15` : T.accent.primaryDim,
                    border: `1px solid ${isReceiving ? T.status.green : T.accent.primarySoft}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: isReceiving ? `0 0 20px ${T.status.green}40` : T.shadow.glow,
                    transition: "all .5s cubic-bezier(.16,1,.3,1)"
                }}>
                    <Loader2 size={isReceiving ? 20 : 28} color={isReceiving ? T.status.green : T.accent.primary} style={{ animation: "spin .8s linear infinite" }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 8 }}>
                    <p style={{ fontSize: isReceiving ? 15 : 18, fontWeight: 800, transition: "font-size .4s ease" }}>Running Audit</p>
                    {isTest && <Badge variant="amber">TEST</Badge>}
                </div>
                <Mono size={11} color={T.text.dim} style={{ display: "block", marginBottom: 16 }}>
                    {elapsed}s · {modelName || "AI"}{isTest ? " · NOT SAVED" : ""}
                </Mono>

                {/* Progress Bar Container */}
                <div style={{ maxWidth: 320, margin: "0 auto", textAlign: "left" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.02em", color: isReceiving ? T.status.green : T.accent.primary, fontFamily: T.font.mono, transition: "color .4s ease" }}>
                            {currentMsg}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: T.text.secondary, fontFamily: T.font.mono }}>
                            {Math.floor(progress)}%
                        </span>
                    </div>
                    <div style={{ height: 6, background: T.bg.elevated, borderRadius: 6, overflow: "hidden", border: `1px solid ${T.border.subtle}` }}>
                        <div style={{
                            height: "100%", width: `${progress}%`,
                            background: isReceiving ? `linear-gradient(90deg,${T.status.green}AA,${T.status.green})` : `linear-gradient(90deg,${T.accent.emerald}99,${T.accent.emerald})`,
                            borderRadius: 6, transition: "width 1.2s cubic-bezier(.16,1,.3,1), background .5s ease"
                        }} />
                    </div>
                </div>

                {/* Cancel button — subtle until 8s, then more prominent */}
                {onCancel && !isReceiving && (
                    <div style={{ marginTop: 20 }}>
                        <button
                            onClick={onCancel}
                            style={{
                                padding: "10px 24px", borderRadius: 12,
                                border: `1px solid ${showCancelProminent ? T.status.amber : T.border.default}`,
                                background: showCancelProminent ? `${T.status.amber}15` : "transparent",
                                color: showCancelProminent ? T.status.amber : T.text.muted,
                                fontSize: 12, fontWeight: 700, cursor: "pointer",
                                transition: "all 0.4s ease"
                            }}
                        >
                            {showCancelProminent ? "Taking too long? Cancel" : "Cancel"}
                        </button>
                    </div>
                )}
            </div>

            {streamText ? (
                <div className="slide-up">
                    <Card style={{ maxHeight: "50vh", overflow: "auto", border: `1px solid ${T.status.blue}30`, background: T.bg.elevated, boxShadow: `inset 0 4px 24px ${T.bg.base}` }}>
                        <pre style={{
                            fontSize: 10, lineHeight: 1.6, color: T.text.secondary, whiteSpace: "pre-wrap", wordBreak: "break-word",
                            fontFamily: T.font.mono, opacity: 0.9
                        }}>{streamText}<span style={{
                            display: "inline-block", width: 7, height: 14, background: T.status.green,
                            animation: "pulse 1s ease infinite", verticalAlign: "text-bottom", borderRadius: 2, marginLeft: 3
                        }} /></pre>
                    </Card>
                </div>
            ) : (
                <div style={{ transition: "opacity .3s ease", opacity: 0.8 }}>
                    {[120, 80, 150].map((h, i) =>
                        <div key={i} className="shimmer-bg" style={{ height: h, borderRadius: T.radius.lg, marginBottom: 12, animationDelay: `${i * .12}s`, opacity: 0.7 + (i * 0.1) }} />)}
                </div>
            )}
        </div>
    );
};


// ═══════════════════════════════════════════════════════════════
// EMPTY STATE
// ═══════════════════════════════════════════════════════════════
export const EmptyState = ({ icon: Icon, title, message, action, delay = 0 }) => (
    <div className="scale-in" style={{
        textAlign: "center", padding: "64px 20px",
        animationDelay: `${delay}ms`, display: "flex", flexDirection: "column", alignItems: "center"
    }}>
        <div style={{
            width: 72, height: 72, borderRadius: 24, background: `linear-gradient(135deg, ${T.accent.primaryDim}, ${T.bg.card})`,
            border: `1px solid ${T.accent.primarySoft}`, display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 0 40px ${T.accent.primaryDim}, inset 0 2px 10px rgba(255,255,255,0.05)`, marginBottom: 24, position: "relative"
        }}>
            <Icon size={32} color={T.accent.primary} strokeWidth={1.5} style={{ filter: `drop-shadow(0 2px 8px ${T.accent.primaryGlow})` }} />
            <div style={{ position: "absolute", inset: -12, borderRadius: 36, border: `1px dashed ${T.border.focus}`, opacity: 0.3, animation: "spin 20s linear infinite" }} />
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 800, color: T.text.primary, marginBottom: 8, letterSpacing: "-0.01em" }}>{title}</h3>
        <p style={{ fontSize: 13, color: T.text.dim, lineHeight: 1.6, maxWidth: 280, margin: "0 auto" }}>{message}</p>
        {action}
    </div>
);

export const TabSkeleton = ({ rows = 4 }) => (
    <div className="fade-in page-body" style={{ paddingTop: 20 }}>
        {/* Title shimmer */}
        <div className="shimmer-bg" style={{ height: 22, width: 140, borderRadius: 8, marginBottom: 20 }} />
        {/* Card shimmers */}
        {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="shimmer-bg" style={{
                height: i === 0 ? 100 : 70 + (i % 3) * 20,
                borderRadius: T.radius.lg,
                marginBottom: 12,
                animationDelay: `${i * 0.1}s`,
                opacity: 0.8 - i * 0.08
            }} />
        ))}
    </div>
);
