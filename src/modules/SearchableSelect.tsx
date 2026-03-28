// ═══════════════════════════════════════════════════════════════
// SEARCHABLE SELECT — Catalyst Cash
// Portal-based dropdown that escapes parent overflow constraints.
// Includes scroll-tracking, viewport-flip, and auto-close on scroll.
// ═══════════════════════════════════════════════════════════════

  import type { ChangeEvent,CSSProperties,MouseEvent as ReactMouseEvent } from "react";
  import { useCallback,useEffect,useMemo,useRef,useState } from "react";
  import { createPortal } from "react-dom";
  import { T } from "./constants.js";

interface SearchableOption {
  value: string;
  label: string;
  group?: string;
}

interface SearchableSelectProps {
  options?: SearchableOption[];
  value?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  style?: CSSProperties;
  maxHeight?: number;
  displayValue?: string;
}

/**
 * SearchableSelect — drop-in replacement for <select> with type-to-filter.
 * Uses a React portal so the dropdown renders above all content.
 * Features:
 *  - Portal at zIndex 99999 (always on top)
 *  - Auto-flips upward when near viewport bottom
 *  - Repositions on scroll / resize
 *  - Closes on outside tap, scroll away, or resize
 */
export default function SearchableSelect({
  options = [],
  value,
  onChange,
  placeholder = "Select…",
  style = {},
  maxHeight = 240,
  displayValue,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0, flip: false });

  // Calculate dropdown position from trigger rect
  const calcPosition = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const flip = spaceBelow < maxHeight + 8 && spaceAbove > spaceBelow;
    setDropPos({
      top: flip ? rect.top - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      flip,
    });
  }, [maxHeight]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (ref.current && !ref.current.contains(target) && !target.closest("[data-ss-portal]")) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const portalRef = useRef<HTMLDivElement | null>(null);

  // Reposition on scroll/resize — never close on scroll.
  // Closing only happens via the outside-tap (mousedown/touchstart) handler below.
  // This prevents the keyboard-covers-dropdown issue where the user scrolls to
  // reveal options and the dropdown closes before they can select.
  useEffect(() => {
    if (!open) return;
    calcPosition();

    const onScroll = () => calcPosition();
    const onResize = () => calcPosition();

    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, calcPosition]);

  // Auto-focus input when opened
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  // Filter options
  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter(
      (o: SearchableOption) =>
        (o.label || "").toLowerCase().includes(q) ||
        (o.value || "").toLowerCase().includes(q) ||
        (o.group || "").toLowerCase().includes(q)
    );
  }, [options, query]);

  // Group if any option has a group
  const hasGroups = options.some(o => o.group);
  const grouped = useMemo(() => {
    if (!hasGroups) return null;
    const groups: Record<string, SearchableOption[]> = {};
    filtered.forEach((o: SearchableOption) => {
      const g = o.group || "Other";
      if (!groups[g]) groups[g] = [];
      groups[g].push(o);
    });
    return groups;
  }, [filtered, hasGroups]);

  const selectedLabel = options.find(o => o.value === value)?.label || "";

  const renderOption = (o: SearchableOption) => (
    <button
      key={o.value}
      type="button"
      onClick={() => {
        onChange(o.value);
        setOpen(false);
        setQuery("");
      }}
      style={{
        width: "100%",
        padding: "8px 14px",
        border: "none",
        background: o.value === value ? `${T.accent.primary}12` : "transparent",
        color: o.value === value ? T.accent.primary : T.text.primary,
        fontSize: 12,
        textAlign: "left",
        cursor: "pointer",
        display: "block",
        fontFamily: "inherit",
        fontWeight: o.value === value ? 700 : 400,
        borderLeft: o.value === value ? `2px solid ${T.accent.primary}` : "2px solid transparent",
      }}
      onMouseEnter={(e: ReactMouseEvent<HTMLButtonElement>) => {
        if (o.value !== value) e.currentTarget.style.background = `${T.text.muted}08`;
      }}
      onMouseLeave={(e: ReactMouseEvent<HTMLButtonElement>) => {
        if (o.value !== value) e.currentTarget.style.background = "transparent";
      }}
    >
      {o.label}
    </button>
  );

  const dropdown = open
    ? createPortal(
        <div
          ref={portalRef}
          data-ss-portal
          style={{
            position: "fixed",
            ...(dropPos.flip
              ? { bottom: window.innerHeight - dropPos.top, left: dropPos.left }
              : { top: dropPos.top, left: dropPos.left }),
            width: dropPos.width,
            zIndex: 99999,
            borderRadius: 18,
            border: `1px solid ${T.border.default}`,
            background: `linear-gradient(180deg, ${T.bg.elevated}, ${T.bg.card})`,
            boxShadow: "0 22px 52px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.05)",
            overflow: "hidden",
            maxHeight: maxHeight + 50, // account for search input
            display: "flex",
            flexDirection: dropPos.flip ? "column-reverse" : "column",
            animation: dropPos.flip ? "slideUpMenu .22s cubic-bezier(0.34,1.56,0.64,1) both" : "slideUp .22s cubic-bezier(0.34,1.56,0.64,1) both",
          }}
        >
          {/* Search input */}
          <div
            style={{
              padding: "10px 10px 6px",
              borderBottom: dropPos.flip ? "none" : `1px solid ${T.border.subtle}`,
              borderTop: dropPos.flip ? `1px solid ${T.border.subtle}` : "none",
              order: dropPos.flip ? 2 : 0,
            }}
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
              placeholder="Type to search…"
              style={{
                width: "100%",
                padding: "9px 11px",
                borderRadius: 12,
                border: `1px solid ${T.border.default}`,
                background: `linear-gradient(180deg, ${T.bg.base}, ${T.bg.surface})`,
                color: T.text.primary,
                fontSize: 12,
                outline: "none",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Options list */}
          <div style={{ maxHeight, overflowY: "auto", padding: "6px 0", order: dropPos.flip ? 1 : 1 }}>
            {filtered.length === 0 && (
              <div style={{ padding: "12px 14px", fontSize: 11, color: T.text.muted, textAlign: "center" }}>
                No results found
              </div>
            )}

            {hasGroups && grouped
              ? (Object.entries(grouped) as Array<[string, SearchableOption[]]>).map(([group, items]) => (
                  <div key={group}>
                    <div
                      style={{
                        padding: "6px 12px",
                        fontSize: 9,
                        fontWeight: 800,
                        color: T.text.dim,
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        fontFamily: T.font.mono,
                      }}
                    >
                      {group}
                    </div>
                    {items.map(renderOption)}
                  </div>
                ))
              : filtered.map(renderOption)}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div ref={ref} style={{ position: "relative", width: "100%", ...style }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          setQuery("");
        }}
      style={{
          width: "100%",
          minHeight: 42,
          padding: "9px 11px",
          borderRadius: 13,
          border: `1px solid ${open ? T.accent.primarySoft : T.border.default}`,
          background: `linear-gradient(180deg, ${T.bg.elevated}, ${T.bg.card})`,
          color: selectedLabel ? T.text.primary : T.text.muted,
          fontSize: 12,
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontFamily: "inherit",
          outline: "none",
          transition: "border-color .18s ease, box-shadow .18s ease, transform .18s ease",
          boxSizing: "border-box",
          boxShadow: open ? `0 0 0 3px ${T.accent.primary}18, 0 16px 28px rgba(0,0,0,0.12)` : "inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {displayValue || selectedLabel || placeholder}
        </span>
        <span
          style={{
            fontSize: 10,
            color: open ? T.accent.primary : T.text.dim,
            marginLeft: 8,
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 20,
            borderRadius: 999,
            background: open ? `${T.accent.primary}14` : T.bg.surface,
            border: `1px solid ${open ? T.accent.primarySoft : T.border.subtle}`,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform .18s ease, color .18s ease, background .18s ease",
          }}
        >
          ▼
        </span>
      </button>

      {dropdown}
    </div>
  );
}
