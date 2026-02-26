import { useState } from "react";
import { Calendar, Download, CheckCircle, Trash2, Edit3, Plus } from "lucide-react";
import { T } from "../constants.js";
import { fmt, fmtDate, exportAudit, exportAllAudits, exportSelectedAudits, exportAuditCSV } from "../utils.js";
import { Card, Badge } from "../ui.jsx";
import { Mono, StatusDot, EmptyState } from "../components.jsx";
import { haptic } from "../haptics.js";

export default function HistoryTab({ audits, onSelect, onExportAll, onExportSelected, onExportCSV, onDelete, onManualImport, toast }) {
    const [sel, setSel] = useState(new Set());
    const [selMode, setSelMode] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null); // index of audit to confirm delete
    const [showManualPaste, setShowManualPaste] = useState(false);
    const [manualPasteText, setManualPasteText] = useState("");
    const allSel = sel.size === audits.length && audits.length > 0;
    const toggle = i => { const s = new Set(sel); s.has(i) ? s.delete(i) : s.add(i); setSel(s); };
    const toggleAll = () => setSel(allSel ? new Set() : new Set(audits.map((_, i) => i)));
    const exitSel = () => { setSelMode(false); setSel(new Set()); };
    const doExportSel = () => { onExportSelected(audits.filter((_, i) => sel.has(i))); exitSel(); };

    return <div className="page-body" style={{ paddingBottom: 0 }}>
        <div style={{ paddingTop: 6, paddingBottom: 8, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div><h1 style={{ fontSize: 22, fontWeight: 800 }}>History</h1>
                <Mono size={11} color={T.text.dim}>{audits.length} audits stored</Mono></div>
            {audits.length > 0 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 200 }}>
                {selMode && sel.size > 0 && <button onClick={doExportSel} style={{ display: "flex", alignItems: "center", gap: 3, padding: "7px 12px", borderRadius: T.radius.md, border: `1px solid ${T.accent.primary}40`, background: T.accent.primaryDim, color: T.accent.primary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font.mono, transition: "all .2s ease" }}>
                    <Download size={10} />EXPORT {sel.size}</button>}
                <button onClick={() => { setSelMode(!selMode); setSel(new Set()); }} style={{ padding: "7px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: selMode ? T.accent.primary : T.text.dim, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font.mono, transition: "all .2s ease" }}>
                    {selMode ? "CANCEL" : "SELECT"}</button>
                <button onClick={() => onExportCSV(audits)} title="Export CSV" style={{ width: 32, height: 32, borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.dim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, fontFamily: T.font.mono, transition: "all .2s ease" }}>CSV</button>
                <button onClick={() => onExportAll(audits)} title="Export All JSON" style={{ width: 32, height: 32, borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.dim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s ease" }}>
                    <Download size={13} /></button>
            </div>}
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: showManualPaste ? 8 : 16 }}>
            <button onClick={async () => {
                try {
                    const txt = await navigator.clipboard.readText();
                    if (!txt || txt.trim() === "") throw new Error("Empty clipboard");
                    onManualImport(txt);
                } catch (e) {
                    toast.error("Could not auto-read clipboard. Please paste manually.");
                    setShowManualPaste(true);
                }
            }} style={{ flex: 1, padding: "14px", borderRadius: T.radius.lg, border: `1px dashed ${T.accent.emerald}60`, background: `${T.accent.emerald}08`, color: T.accent.emerald, fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all .2s ease" }}>
                <Plus size={16} strokeWidth={2.5} /> Paste & Import AI Result
            </button>
            <button onClick={() => setShowManualPaste(!showManualPaste)} style={{ width: 54, borderRadius: T.radius.lg, border: `1px solid ${T.border.default}`, background: showManualPaste ? T.bg.card : T.bg.elevated, color: showManualPaste ? T.accent.primary : T.text.dim, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all .2s ease" }}>
                <Edit3 size={18} />
            </button>
        </div>

        {showManualPaste && <div style={{ marginBottom: 16 }}>
            <textarea value={manualPasteText} onChange={e => setManualPasteText(e.target.value)} placeholder="Paste the AI response here (entire response)" style={{ width: "100%", height: 140, padding: "12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, fontFamily: T.font.mono, marginBottom: 8, resize: "none", lineHeight: 1.4 }} />
            <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { if (manualPasteText.trim()) onManualImport(manualPasteText); else toast.error("Text is empty"); }} style={{ flex: 1, padding: "12px", borderRadius: T.radius.md, background: T.accent.emerald, color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer", border: "none" }}>
                    Import Text
                </button>
                <button onClick={() => { setShowManualPaste(false); setManualPasteText(""); }} style={{ padding: "12px 20px", borderRadius: T.radius.md, background: T.bg.elevated, color: T.text.dim, fontWeight: 700, fontSize: 13, cursor: "pointer", border: `1px solid ${T.border.default}` }}>
                    Cancel
                </button>
            </div>
        </div>}
        {selMode && audits.length > 0 && <div onClick={toggleAll} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", marginBottom: 8, borderRadius: T.radius.md, background: T.bg.card, cursor: "pointer", border: `1px solid ${T.border.subtle}` }}>
            <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, border: allSel ? "none" : `2px solid ${T.text.dim}`, background: allSel ? T.accent.primary : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s" }}>
                {allSel && <CheckCircle size={11} color={T.bg.base} strokeWidth={3} />}</div>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.text.secondary }}>{allSel ? "Deselect All" : "Select All"}</span>
            {sel.size > 0 && <Mono size={10} color={T.accent.primary} style={{ marginLeft: "auto" }}>{sel.size} selected</Mono>}
        </div>}
        {audits.length === 0 ? <EmptyState icon={Calendar} title="No History Yet" message="Perform a financial audit to see your history and trends right here." /> :
            audits.map((a, i) => {
                const isConfirming = confirmDelete === i;
                return <Card key={a.ts || i} animate delay={Math.min(i * 25, 300)}
                    onClick={selMode ? () => toggle(i) : isConfirming ? undefined : () => onSelect(a)}
                    style={{
                        ...(sel.has(i) ? { borderColor: `${T.accent.primary}35`, background: `${T.accent.primary}04` } : {}),
                        ...(isConfirming ? { borderColor: `${T.status.red}30`, background: `${T.status.red}06` } : {}),
                        borderLeft: `3px solid ${a.parsed?.status === "GREEN" ? T.status.green : a.parsed?.status === "YELLOW" ? T.status.amber : a.parsed?.status === "RED" ? T.status.red : T.text.muted}20`
                    }}>
                    {isConfirming ? (
                        <div>
                            <p style={{ fontSize: 12, color: T.status.red, fontWeight: 600, marginBottom: 10 }}>Delete audit from {fmtDate(a.date)}?</p>
                            <div style={{ display: "flex", gap: 8 }}>
                                <button onClick={(e) => { e.stopPropagation(); onDelete(a); setConfirmDelete(null); }} style={{
                                    flex: 1, padding: 10, borderRadius: T.radius.md, border: "none",
                                    background: T.status.red, color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer"
                                }}>Delete</button>
                                <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }} style={{
                                    flex: 1, padding: 10, borderRadius: T.radius.md,
                                    border: `1px solid ${T.border.default}`, background: "transparent",
                                    color: T.text.secondary, fontSize: 12, cursor: "pointer"
                                }}>Cancel</button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                            {selMode && <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, border: sel.has(i) ? "none" : `2px solid ${T.text.dim}`, background: sel.has(i) ? T.accent.primary : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s" }}>
                                {sel.has(i) && <CheckCircle size={11} color={T.bg.base} strokeWidth={3} />}</div>}
                            <div style={{ flex: 1 }}>
                                <Mono size={13} weight={600}>{fmtDate(a.date)}</Mono>
                                {a.isTest && <div style={{ marginTop: 4 }}><Badge variant="amber">TEST</Badge></div>}
                            </div>
                            <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                                <StatusDot status={a.parsed?.status || "UNKNOWN"} />
                                {a.parsed?.netWorth != null && <Mono size={12} weight={700} color={T.accent.primary}>{fmt(a.parsed.netWorth)}</Mono>}
                                <div style={{ display: "flex", gap: 4 }}>
                                    {!selMode && <button onClick={e => { e.stopPropagation(); exportAudit(a); }} style={{ width: 26, height: 26, borderRadius: T.radius.sm, border: `1px solid ${T.border.subtle}`, background: "transparent", color: T.text.dim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <Download size={10} /></button>}
                                    {!selMode && <button onClick={e => { e.stopPropagation(); setConfirmDelete(i); haptic.warning(); }} style={{ width: 26, height: 26, borderRadius: T.radius.sm, border: `1px solid ${T.status.red}20`, background: T.status.redDim, color: T.status.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <Trash2 size={10} /></button>}
                                </div>
                            </div>
                        </div>
                    )}
                </Card>;
            })}
    </div>;
}
