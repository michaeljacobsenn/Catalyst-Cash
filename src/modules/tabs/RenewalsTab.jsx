import { useState, useMemo, memo, useCallback } from "react";
import { ChevronDown, ChevronUp, AlertTriangle, X, Plus, Check } from "lucide-react";
import { T, RENEWAL_CATEGORIES, formatInterval } from "../constants.js";
import { fmt } from "../utils.js";
import { resolveCardLabel } from "../cards.js";
import { Card, Label, Badge } from "../ui.jsx";
import { Mono, EmptyState } from "../components.jsx";
import SearchableSelect from "../SearchableSelect.jsx";

// Interval options for dropdowns
const WEEK_OPTIONS = Array.from({ length: 52 }, (_, i) => i + 1);
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);
const YEAR_OPTIONS = [1, 2, 3];
const DAY_OPTIONS = Array.from({ length: 90 }, (_, i) => i + 1);

import { usePortfolio } from '../contexts/PortfolioContext.jsx';
import { useAudit } from '../contexts/AuditContext.jsx';

export default memo(function RenewalsTab() {
    const { current } = useAudit();
    const portfolioContext = usePortfolio();
    const renewals = current?.isTest ? (current.demoPortfolio?.renewals || []) : portfolioContext.renewals;
    const setRenewals = current?.isTest ? () => { } : portfolioContext.setRenewals;
    const cards = current?.isTest ? (current.demoPortfolio?.cards || []) : portfolioContext.cards;
    const { cardAnnualFees } = portfolioContext;
    const [editing, setEditing] = useState(null); // index within user renewals
    const [editVal, setEditVal] = useState({});
    const [showAdd, setShowAdd] = useState(false);
    const [addForm, setAddForm] = useState({ name: "", amount: "", interval: 1, intervalUnit: "months", source: "", chargedTo: "", chargedToId: "", category: "subs", nextDue: "" });
    const [sortBy, setSortBy] = useState("type");

    // Merge user renewals + auto-generated card annual fees
    const allItems = useMemo(() => {
        const now = new Date().toISOString().split("T")[0];
        const items = [...(renewals || [])].map((r, idx) => ({
            ...r,
            originalIndex: idx,
            isExpired: r.intervalUnit === "one-time" && r.nextDue && r.nextDue < now
        }));
        (cardAnnualFees || []).forEach(af => {
            const exists = items.some(r => (r.linkedCardId && af.linkedCardId && r.linkedCardId === af.linkedCardId) || r.name === af.name || r.linkedCardAF === af.cardName);
            if (!exists) items.push(af);
        });
        return items;
    }, [renewals, cardAnnualFees]);

    // Group by category
    const grouped = useMemo(() => {
        const cats = {};
        const catMeta = {
            housing: { label: "Housing & Utilities", color: T.status.red },
            subs: { label: "Subscriptions", color: T.accent.primary },
            insurance: { label: "Insurance", color: T.status.amber },
            transport: { label: "Transportation", color: T.status.blue },
            essentials: { label: "Groceries & Essentials", color: T.status.green },
            medical: { label: "Medical & Health", color: T.accent.emerald },
            sinking: { label: "Sinking Funds", color: T.status.purple },
            onetime: { label: "One-Time Expenses", color: T.status.amber },
            inactive: { label: "Inactive & History", color: T.text.muted },
            // Legacy aliases for backward compatibility
            fixed: { label: "Housing & Utilities", color: T.status.red },
            monthly: { label: "Housing & Utilities", color: T.status.red },
            cadence: { label: "Subscriptions", color: T.accent.primary },
            periodic: { label: "Subscriptions", color: T.accent.primary },
            af: { label: "Annual Fees", color: T.accent.copper || T.status.amber },
        };

        if (sortBy !== "type") {
            const flat = [...allItems];
            if (sortBy === "name") flat.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
            else if (sortBy === "date") flat.sort((a, b) => (a.nextDue || "9999").localeCompare(b.nextDue || "9999"));
            else if (sortBy === "amount") flat.sort((a, b) => (b.amount || 0) - (a.amount || 0));
            return [{ id: "sorted", label: "All Tracked Renewals", color: T.accent.primary, items: flat }];
        }

        allItems.forEach(item => {
            if (item.isCancelled || item.isExpired) {
                if (!cats["inactive"]) cats["inactive"] = { ...catMeta.inactive, id: "inactive", items: [] };
                cats["inactive"].items.push(item);
                return;
            }
            const rawCat = item.isCardAF ? "af" : (item.category || "subs");
            // Legacy category normalization
            const legacyMap = { ss: "subs", fixed: "housing", monthly: "housing", cadence: "subs", periodic: "subs" };
            const catId = legacyMap[rawCat] || rawCat;
            if (!cats[catId]) cats[catId] = { ...catMeta[catId] || catMeta.subs, id: catId, items: [] };
            cats[catId].items.push(item);
        });

        // Sort items within each category: frequency (most frequent first) → next due (soonest first) → amount (highest first)
        const unitWeight = { weeks: 1, months: 2, years: 3 };
        const toMonths = (interval, unit) => {
            const i = interval || 1;
            if (unit === "days") return i / 30.44;
            if (unit === "weeks") return i / 4.33;
            if (unit === "years") return i * 12;
            if (unit === "one-time") return 999;
            return i;
        };
        Object.values(cats).forEach(cat => {
            cat.items.sort((a, b) => {
                // 1. Frequency: shortest interval first
                const freqA = toMonths(a.interval, a.intervalUnit);
                const freqB = toMonths(b.interval, b.intervalUnit);
                if (freqA !== freqB) return freqA - freqB;
                // 2. Next due date: soonest first (items without a date go to the end)
                const dueA = a.nextDue || "9999";
                const dueB = b.nextDue || "9999";
                if (dueA !== dueB) return dueA.localeCompare(dueB);
                // 3. Amount: highest first
                return (b.amount || 0) - (a.amount || 0);
            });
        });

        const order = ["housing", "fixed", "monthly", "medical", "essentials", "insurance", "transport", "subs", "ss", "cadence", "periodic", "sinking", "onetime", "af", "inactive"];
        return order.filter(id => cats[id]).map(id => cats[id]);
    }, [allItems, sortBy]);

    const monthlyTotal = useMemo(() => {
        let t = 0;
        allItems.forEach(i => {
            if (i.isCancelled || i.isExpired) return;
            const int = i.interval || 1;
            const unit = i.intervalUnit || "months";
            if (unit === "days") t += i.amount / int * 30.44;
            else if (unit === "weeks") t += i.amount / int * 4.33;
            else if (unit === "months") t += i.amount / int;
            else if (unit === "years") t += i.amount / (int * 12);
        });
        return t;
    }, [allItems]);

    const startEdit = useCallback((item, renewalIndex) => {
        if (renewalIndex == null || renewalIndex < 0) return;
        setEditing(renewalIndex);
        // If chargedTo is missing but source contains a card reference, try to pre-populate
        let chargedTo = item.chargedTo || "";
        let chargedToId = item.chargedToId || "";
        if (!chargedTo && item.source) {
            // Try to match source against known card names (e.g. "Ally→Delta Business Gold" → look for "Delta Business Gold")
            const allCardNames = (cards || []).map(c => c.name);
            const srcParts = (item.source || "").split("→");
            const potentialCard = srcParts[srcParts.length - 1].trim();
            // Check if any card name ends with the potential card reference
            const matched = allCardNames.find(cn => cn.endsWith(potentialCard) || potentialCard.endsWith(cn.split(" ").slice(1).join(" ")));
            if (matched) {
                chargedTo = matched;
                const matchCard = (cards || []).find(c => c.name === matched);
                if (matchCard) chargedToId = matchCard.id;
            }
        }
        setEditVal({ name: item.name, amount: String(item.amount), interval: item.interval || 1, intervalUnit: item.intervalUnit || "months", source: item.source || "", chargedTo, chargedToId, nextDue: item.nextDue || "", category: item.category || "subs" });
    }, [cards]);
    const saveEdit = useCallback((renewalIndex, fallbackName) => {
        if (renewalIndex == null || renewalIndex < 0) return;
        const label = editVal.chargedToId ? resolveCardLabel(cards || [], editVal.chargedToId, editVal.chargedTo) : editVal.chargedTo;
        const newName = (editVal.name || "").trim() || fallbackName;
        setRenewals(prev => (prev || []).map((r, idx) => idx === renewalIndex ? {
            ...r, name: newName, amount: parseFloat(editVal.amount) || 0, interval: editVal.interval,
            intervalUnit: editVal.intervalUnit, cadence: formatInterval(editVal.interval, editVal.intervalUnit),
            source: editVal.source, chargedTo: label, chargedToId: editVal.chargedToId, nextDue: editVal.nextDue,
            category: editVal.category || r.category
        } : r));
        setEditing(null);
    }, [editVal, cards, setRenewals]);
    const removeItem = useCallback((renewalIndex, itemName) => {
        if (renewalIndex == null || renewalIndex < 0) return;
        if (!window.confirm(`Delete "${itemName}"? This cannot be undone.`)) return;
        setRenewals(prev => (prev || []).filter((_, idx) => idx !== renewalIndex));
    }, [setRenewals]);

    const toggleCancel = useCallback((renewalIndex) => {
        if (renewalIndex == null || renewalIndex < 0) return;
        setRenewals(prev => (prev || []).map((r, idx) => idx === renewalIndex ? { ...r, isCancelled: !r.isCancelled } : r));
    }, [setRenewals]);

    const addItem = () => {
        if (!addForm.name.trim() || !addForm.amount) return;
        const label = addForm.chargedToId ? resolveCardLabel(cards || [], addForm.chargedToId, addForm.chargedTo) : addForm.chargedTo;
        const newItem = {
            name: addForm.name.trim(), amount: parseFloat(addForm.amount) || 0,
            interval: parseInt(addForm.interval), intervalUnit: addForm.intervalUnit,
            cadence: formatInterval(parseInt(addForm.interval), addForm.intervalUnit),
            source: addForm.source, chargedTo: label, chargedToId: addForm.chargedToId, category: addForm.category,
            nextDue: addForm.nextDue || ""
        };
        setRenewals([...(renewals || []), newItem]);
        setAddForm({ name: "", amount: "", interval: 1, intervalUnit: "months", source: "", chargedTo: "", chargedToId: "", category: "subs", nextDue: "" });
        setShowAdd(false);
    };

    const IntervalDropdown = ({ interval, unit, onChange }) => (
        <div style={{ display: "flex", gap: 6, flex: 1 }}>
            <select value={interval} onChange={e => onChange({ interval: parseInt(e.target.value), unit })}
                style={{ flex: 0.4, padding: "10px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, textOverflow: "ellipsis", whiteSpace: "nowrap", overflow: "hidden" }}>
                {(unit === "days" ? DAY_OPTIONS : unit === "weeks" ? WEEK_OPTIONS : unit === "months" ? MONTH_OPTIONS : YEAR_OPTIONS).map(n =>
                    <option key={n} value={n}>{n}</option>)}
            </select>
            <select value={unit} onChange={e => onChange({ interval, unit: e.target.value })}
                style={{ flex: 0.6, padding: "10px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, textOverflow: "ellipsis", whiteSpace: "nowrap", overflow: "hidden" }}>
                <option value="days">{interval === 1 ? "day" : "days"}</option>
                <option value="weeks">{interval === 1 ? "week" : "weeks"}</option>
                <option value="months">{interval === 1 ? "month" : "months"}</option>
                <option value="years">{interval === 1 ? "year" : "years"}</option>
                <option value="one-time">one-time</option>
            </select>
        </div>
    );

    const CardSelector = ({ value, onChange }) => {
        const grouped = {};
        (cards || []).forEach(c => { (grouped[c.institution] = grouped[c.institution] || []).push(c); });
        const opts = [
            { value: "Checking", label: "Checking Account" },
            { value: "Savings", label: "Savings Account" },
            { value: "Cash", label: "Cash" },
            ...Object.entries(grouped).flatMap(([inst, instCards]) =>
                instCards.map(c => ({
                    value: c.id || "",
                    label: resolveCardLabel(cards || [], c.id, c.name),
                    group: inst
                }))
            )
        ];
        return <SearchableSelect value={value || ""} onChange={onChange} placeholder="Payment method…" options={opts} />;
    };

    const categoryOptions = [
        { id: "housing", label: "Housing & Utilities" }, { id: "subs", label: "Subscriptions" },
        { id: "insurance", label: "Insurance" }, { id: "transport", label: "Transportation" },
        { id: "essentials", label: "Groceries & Essentials" }, { id: "medical", label: "Medical & Health" },
        { id: "sinking", label: "Sinking Funds" }, { id: "onetime", label: "One-Time Expenses" }
    ];

    return <div className="page-body" style={{ paddingBottom: 0 }}>
        <div style={{ paddingTop: 16, paddingBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
                <h1 style={{ fontSize: 22, fontWeight: 800 }}>Expenses</h1>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <p style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, whiteSpace: "nowrap" }}>{allItems.length} items</p>
                    <div style={{ width: 1, height: 10, background: T.border.default }} />
                    <button onClick={() => setShowAdd(!showAdd)} style={{
                        display: "flex", alignItems: "center", gap: 4, padding: "2px 6px",
                        borderRadius: T.radius.sm, border: `1px solid ${showAdd ? T.status.amber : T.accent.primary}30`,
                        background: showAdd ? T.status.amberDim : T.accent.primaryDim, color: showAdd ? T.status.amber : T.accent.primary,
                        fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font.mono
                    }}>
                        {showAdd ? <><X size={10} />CANCEL</> : <><Plus size={10} />ADD</>}
                    </button>
                </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", padding: "6px 8px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, marginTop: 4 }}>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ fontSize: 10, color: T.text.secondary, background: "transparent", border: "none", cursor: "pointer", fontFamily: T.font.mono, fontWeight: 800, padding: 0, outline: "none", textTransform: "uppercase" }}>
                    <option value="type">Sort: Type</option>
                    <option value="date">Sort: Soonest</option>
                    <option value="amount">Sort: Value</option>
                    <option value="name">Sort: A-Z</option>
                </select>
            </div>
        </div>

        {/* Monthly total */}
        <Card animate style={{
            textAlign: "center", padding: "22px 16px",
            background: `linear-gradient(160deg,${T.bg.card},${T.accent.primary}06)`, borderColor: `${T.accent.primary}12`,
            boxShadow: `${T.shadow.elevated}, 0 0 24px ${T.accent.primaryDim}`
        }}>
            <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.15em", color: T.text.dim, marginBottom: 6, fontFamily: T.font.mono, fontWeight: 700 }}>Monthly Burn Rate</p>
            <Mono size={30} weight={800} color={T.accent.primary}>{fmt(monthlyTotal)}</Mono>
            <Mono size={10} color={T.text.dim} style={{ display: "block", marginTop: 4 }}>{fmt(monthlyTotal / 4.33)}/wk · {fmt(monthlyTotal * 12)}/yr</Mono>
        </Card>

        {/* Info */}
        <Card animate delay={50} style={{ padding: "12px 16px", borderLeft: `3px solid ${T.status.green}30` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Check size={12} color={T.status.green} />
                <span style={{ fontSize: 11, fontWeight: 600, color: T.text.secondary }}>Changes here are included in your audit snapshot</span>
            </div>
        </Card>

        {/* Add Subscription Form */}
        {showAdd && <Card animate variant="accent" style={{ background: T.bg.card, border: `1px solid ${T.accent.primary}30` }}>
            <Label>New Bill / Subscription</Label>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input value={addForm.name} onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))} placeholder="Bill or subscription name (e.g., Netflix)"
                    style={{ width: "100%", padding: "10px 10px 10px 14px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, boxSizing: "border-box" }} />
                <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ flex: 0.4, position: "relative" }}>
                        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontFamily: T.font.mono, fontSize: 12 }}>$</span>
                        <input type="number" inputMode="decimal" pattern="[0-9]*" value={addForm.amount} onChange={e => setAddForm(p => ({ ...p, amount: e.target.value }))} placeholder="Amount per cycle"
                            style={{ width: "100%", padding: "10px 10px 10px 28px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontFamily: T.font.mono, boxSizing: "border-box" }} />
                    </div>
                    <IntervalDropdown interval={addForm.interval} unit={addForm.intervalUnit}
                        onChange={({ interval, unit }) => setAddForm(p => ({ ...p, interval, intervalUnit: unit }))} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <SearchableSelect
                        value={addForm.category}
                        onChange={v => setAddForm(p => ({ ...p, category: v }))}
                        placeholder="Category"
                        options={categoryOptions.map(c => ({ value: c.id, label: c.label }))}
                    />
                    <CardSelector value={addForm.chargedToId || addForm.chargedTo} onChange={v => {
                        const card = (cards || []).find(c => c.id === v);
                        setAddForm(p => ({
                            ...p,
                            chargedToId: card ? card.id : "",
                            chargedTo: card ? resolveCardLabel(cards || [], card.id, card.name) : v
                        }));
                    }} />
                </div>
                <input value={addForm.source} onChange={e => setAddForm(p => ({ ...p, source: e.target.value }))} placeholder="Notes (optional)"
                    style={{ width: "100%", padding: "10px 10px 10px 14px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, boxSizing: "border-box" }} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: T.text.dim, fontFamily: T.font.mono, letterSpacing: "0.08em", textTransform: "uppercase" }}>Next Due Date</span>
                    <input type="date" value={addForm.nextDue} onChange={e => setAddForm(p => ({ ...p, nextDue: e.target.value }))}
                        style={{ width: "100%", padding: "10px 10px 10px 14px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, boxSizing: "border-box" }} />
                </div>
                <button onClick={addItem} disabled={!addForm.name.trim() || !addForm.amount} style={{
                    padding: 14, borderRadius: T.radius.md, border: "none",
                    background: (addForm.name.trim() && addForm.amount) ? `linear-gradient(135deg,${T.accent.primary},#6C60FF)` : T.text.muted,
                    color: (addForm.name.trim() && addForm.amount) ? T.bg.base : T.text.dim, fontSize: 13, fontWeight: 800,
                    cursor: (addForm.name.trim() && addForm.amount) ? "pointer" : "not-allowed"
                }}>Add Expense</button>
            </div>
        </Card>}

        {/* Categories */}
        {grouped.length === 0 ?
            <EmptyState icon={AlertTriangle} title="Track Every Dollar" message="Add your recurring bills and subscriptions to see a clear monthly forecast across all accounts." /> :
            grouped.map((cat, catIdx) => (
                <Card key={cat.id} animate delay={Math.min(catIdx * 60, 300)} variant="glass" style={{ marginBottom: 16, padding: 0, overflow: "hidden", borderLeft: `3px solid ${cat.color}` }}>
                    <div style={{ padding: "12px 14px", background: `${cat.color}08`, borderBottom: `1px solid ${T.border.subtle}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: cat.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>{cat.label}</span>
                        <Mono size={10} color={T.text.dim}>{cat.items.length} items</Mono>
                    </div>
                    <div style={{ padding: "4px 14px" }}>
                        {cat.items.map((item, i) => {
                            const renewalIndex = item.originalIndex;
                            const isUserRenewal = renewalIndex != null && renewalIndex >= 0;
                            const itemKey = item.linkedCardId
                                ? `card-af-${item.linkedCardId}`
                                : `${item.name || "item"}-${item.nextDue || ""}-${item.amount || 0}-${i}`;

                            return <div key={itemKey} style={{ borderBottom: i === cat.items.length - 1 ? "none" : `1px solid ${T.border.subtle}`, padding: "12px 0", animation: `fadeInUp .3s ease-out ${Math.min(i * 0.04, 0.4)}s both` }}>
                                {editing === renewalIndex ?
                                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <input value={editVal.name} onChange={e => setEditVal(p => ({ ...p, name: e.target.value }))}
                                                placeholder="Name" style={{ flex: 1, fontSize: 13, padding: "10px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, outline: "none", boxSizing: "border-box" }} />
                                            <div style={{ flex: 0.6, position: "relative" }}>
                                                <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontFamily: T.font.mono, fontSize: 14, fontWeight: 600 }}>$</span>
                                                <input type="number" inputMode="decimal" pattern="[0-9]*" value={editVal.amount} onChange={e => setEditVal(p => ({ ...p, amount: e.target.value }))}
                                                    placeholder="0.00" style={{ width: "100%", padding: "10px 12px 10px 28px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontFamily: T.font.mono, fontSize: 14, fontWeight: 600, outline: "none", boxSizing: "border-box" }} />
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <IntervalDropdown interval={editVal.interval} unit={editVal.intervalUnit}
                                                onChange={({ interval, unit }) => setEditVal(p => ({ ...p, interval, intervalUnit: unit }))} />
                                        </div>
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <SearchableSelect
                                                value={editVal.category || "subs"}
                                                onChange={v => setEditVal(p => ({ ...p, category: v }))}
                                                placeholder="Category"
                                                options={categoryOptions.map(c => ({ value: c.id, label: c.label }))}
                                            />
                                            <CardSelector value={editVal.chargedToId || editVal.chargedTo} onChange={v => {
                                                const card = (cards || []).find(c => c.id === v);
                                                setEditVal(p => ({
                                                    ...p,
                                                    chargedToId: card ? card.id : "",
                                                    chargedTo: card ? resolveCardLabel(cards || [], card.id, card.name) : v
                                                }));
                                            }} />
                                        </div>
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg.elevated, borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, padding: "4px 10px" }}>
                                                <span style={{ fontSize: 11, color: T.text.dim, fontWeight: 600 }}>Next Due Date</span>
                                                <input type="date" value={editVal.nextDue} onChange={e => setEditVal(p => ({ ...p, nextDue: e.target.value }))}
                                                    style={{ width: "100%", fontSize: 13, background: "transparent", border: "none", padding: "2px 0", color: T.text.primary, outline: "none", boxSizing: "border-box" }} />
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <button onClick={() => saveEdit(renewalIndex, item.name)} style={{
                                                flex: 1, padding: 10, borderRadius: T.radius.sm,
                                                border: "none", background: T.accent.primaryDim, color: T.accent.primary, fontSize: 10, fontWeight: 700, cursor: "pointer"
                                            }}>Save</button>
                                            <button onClick={() => setEditing(null)} style={{
                                                flex: 1, padding: 10, borderRadius: T.radius.sm,
                                                border: `1px solid ${T.border.default}`, background: "transparent", color: T.text.dim, fontSize: 10, cursor: "pointer"
                                            }}>Cancel</button>
                                        </div></div> :
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 30 }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                <span style={{ fontSize: 12, fontWeight: 500, color: (item.isCancelled || item.isExpired) ? T.text.muted : T.text.primary, textDecoration: item.isCancelled ? "line-through" : "none" }}>{item.name}</span>
                                                {item.isCardAF && <Badge variant="gold" style={{ fontSize: 8, padding: "1px 5px" }}>AUTO</Badge>}
                                                {item.isWaived && <Badge variant="outline" style={{ fontSize: 8, padding: "1px 5px", color: T.status.green, borderColor: `${T.status.green}40` }}>WAIVED</Badge>}
                                                {item.isCancelled && <Badge variant="outline" style={{ fontSize: 8, padding: "1px 5px", color: T.text.muted, borderColor: T.border.default }}>CANCELLED</Badge>}
                                                {item.isExpired && <Badge variant="outline" style={{ fontSize: 8, padding: "1px 5px", color: T.text.muted, borderColor: T.border.default }}>EXPIRED</Badge>}
                                            </div>
                                            <div style={{ display: "flex", gap: 8, marginTop: 3, flexWrap: "wrap", alignItems: "center" }}>
                                                <Mono size={10} color={T.text.dim}>{item.cadence || formatInterval(item.interval, item.intervalUnit)}</Mono>
                                                {item.chargedTo && <Mono size={10} color={T.accent.primary}>→ {item.chargedTo.replace(/^(Amex|Barclays|Capital One|Chase|Citi|Discover) /, "")}</Mono>}
                                                {item.nextDue && <Badge variant="outline" style={{ fontSize: 8, padding: "1px 5px", color: T.text.secondary, borderColor: T.border.default }}>
                                                    DUE {item.nextDue}
                                                </Badge>}
                                                {item.source && !item.chargedTo && <Mono size={10} color={T.text.muted}>{item.source}</Mono>}
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                            <Mono size={13} weight={700} color={cat.color}>{fmt(item.amount)}</Mono>
                                            {!item.isCardAF && isUserRenewal && editing !== renewalIndex && <>
                                                {!item.isExpired && <button onClick={() => toggleCancel(renewalIndex)} style={{
                                                    height: 30, padding: "0 10px", borderRadius: T.radius.sm,
                                                    border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.dim, fontFamily: T.font.mono,
                                                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700
                                                }}>{item.isCancelled ? "RESTORE" : "CANCEL"}</button>}
                                                <button onClick={() => startEdit(item, renewalIndex)} style={{
                                                    width: 30, height: 30, borderRadius: T.radius.sm,
                                                    border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.dim,
                                                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11
                                                }}>✎</button>
                                                <button onClick={() => removeItem(renewalIndex, item.name)} style={{
                                                    width: 30, height: 30, borderRadius: T.radius.sm,
                                                    border: "none", background: T.status.redDim, color: T.status.red,
                                                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
                                                }}><X size={11} /></button>
                                            </>}
                                        </div></div>}
                            </div>;
                        })}
                    </div>
                </Card>
            ))}
    </div>;
})
