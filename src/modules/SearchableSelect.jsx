// ═══════════════════════════════════════════════════════════════
// SEARCHABLE SELECT — Catalyst Cash
// A type-to-search dropdown replacement used across the app.
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useEffect, useMemo } from "react";
import { T } from "./constants.js";

/**
 * SearchableSelect — drop-in replacement for <select> with type-to-filter.
 * Props:
 *   options: [{ value, label, group? }]  — items to display
 *   value: currently selected value
 *   onChange: (value) => void
 *   placeholder: string
 *   style: optional style overrides for the trigger button
 *   maxHeight: max dropdown height (default 240)
 */
export default function SearchableSelect({ options = [], value, onChange, placeholder = "Select…", style = {}, maxHeight = 240 }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const ref = useRef(null);
    const inputRef = useRef(null);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    // Auto-focus input when opened
    useEffect(() => {
        if (open && inputRef.current) inputRef.current.focus();
    }, [open]);

    // Filter options
    const filtered = useMemo(() => {
        if (!query.trim()) return options;
        const q = query.toLowerCase();
        return options.filter(o =>
            (o.label || "").toLowerCase().includes(q) ||
            (o.value || "").toLowerCase().includes(q) ||
            (o.group || "").toLowerCase().includes(q)
        );
    }, [options, query]);

    // Group if any option has a group
    const hasGroups = options.some(o => o.group);
    const grouped = useMemo(() => {
        if (!hasGroups) return null;
        const groups = {};
        filtered.forEach(o => {
            const g = o.group || "Other";
            if (!groups[g]) groups[g] = [];
            groups[g].push(o);
        });
        return groups;
    }, [filtered, hasGroups]);

    const selectedLabel = options.find(o => o.value === value)?.label || "";

    return (
        <div ref={ref} style={{ position: "relative", width: "100%", ...style }}>
            {/* Trigger */}
            <button
                type="button"
                onClick={() => { setOpen(!open); setQuery(""); }}
                style={{
                    width: "100%", padding: "8px 10px", borderRadius: T.radius.sm,
                    border: `1px solid ${open ? T.accent.primary : T.border.default}`,
                    background: T.bg.card, color: selectedLabel ? T.text.primary : T.text.muted,
                    fontSize: 12, textAlign: "left", cursor: "pointer",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    fontFamily: "inherit", outline: "none",
                    transition: "border-color .15s ease"
                }}
            >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {selectedLabel || placeholder}
                </span>
                <span style={{ fontSize: 10, color: T.text.dim, marginLeft: 6, flexShrink: 0 }}>
                    {open ? "▲" : "▼"}
                </span>
            </button>

            {/* Dropdown */}
            {open && (
                <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 999,
                    marginTop: 4, borderRadius: T.radius.md,
                    border: `1px solid ${T.border.default}`,
                    background: T.bg.card,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                    overflow: "hidden"
                }}>
                    {/* Search input */}
                    <div style={{ padding: "8px 8px 4px", borderBottom: `1px solid ${T.border.subtle}` }}>
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Type to search…"
                            style={{
                                width: "100%", padding: "7px 10px", borderRadius: T.radius.sm,
                                border: `1px solid ${T.border.default}`, background: T.bg.base,
                                color: T.text.primary, fontSize: 12, outline: "none",
                                fontFamily: "inherit"
                            }}
                        />
                    </div>

                    {/* Options list */}
                    <div style={{ maxHeight, overflowY: "auto", padding: "4px 0" }}>
                        {filtered.length === 0 && (
                            <div style={{ padding: "12px 14px", fontSize: 11, color: T.text.muted, textAlign: "center" }}>
                                No results found
                            </div>
                        )}

                        {hasGroups && grouped ? (
                            Object.entries(grouped).map(([group, items]) => (
                                <div key={group}>
                                    <div style={{
                                        padding: "6px 12px", fontSize: 9, fontWeight: 800,
                                        color: T.text.dim, textTransform: "uppercase",
                                        letterSpacing: "0.5px", fontFamily: T.font.mono
                                    }}>{group}</div>
                                    {items.map(o => (
                                        <button
                                            key={o.value}
                                            type="button"
                                            onClick={() => { onChange(o.value); setOpen(false); setQuery(""); }}
                                            style={{
                                                width: "100%", padding: "8px 14px", border: "none",
                                                background: o.value === value ? `${T.accent.primary}12` : "transparent",
                                                color: o.value === value ? T.accent.primary : T.text.primary,
                                                fontSize: 12, textAlign: "left", cursor: "pointer",
                                                display: "block", fontFamily: "inherit",
                                                fontWeight: o.value === value ? 700 : 400,
                                                borderLeft: o.value === value ? `2px solid ${T.accent.primary}` : "2px solid transparent"
                                            }}
                                            onMouseEnter={e => { if (o.value !== value) e.target.style.background = `${T.text.muted}08`; }}
                                            onMouseLeave={e => { if (o.value !== value) e.target.style.background = "transparent"; }}
                                        >
                                            {o.label}
                                        </button>
                                    ))}
                                </div>
                            ))
                        ) : (
                            filtered.map(o => (
                                <button
                                    key={o.value}
                                    type="button"
                                    onClick={() => { onChange(o.value); setOpen(false); setQuery(""); }}
                                    style={{
                                        width: "100%", padding: "8px 14px", border: "none",
                                        background: o.value === value ? `${T.accent.primary}12` : "transparent",
                                        color: o.value === value ? T.accent.primary : T.text.primary,
                                        fontSize: 12, textAlign: "left", cursor: "pointer",
                                        display: "block", fontFamily: "inherit",
                                        fontWeight: o.value === value ? 700 : 400,
                                        borderLeft: o.value === value ? `2px solid ${T.accent.primary}` : "2px solid transparent"
                                    }}
                                    onMouseEnter={e => { if (o.value !== value) e.target.style.background = `${T.text.muted}08`; }}
                                    onMouseLeave={e => { if (o.value !== value) e.target.style.background = "transparent"; }}
                                >
                                    {o.label}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
