import { useState, memo } from "react";
import { Calendar, Download, CheckCircle, Trash2, Edit3, Plus } from "lucide-react";
import { T } from "../constants.js";
import { fmt, fmtDate, exportAudit, exportAllAudits, exportSelectedAudits, exportAuditCSV } from "../utils.js";
import { Card, Badge } from "../ui.jsx";
import { Mono, StatusDot, EmptyState } from "../components.jsx";
import { haptic } from "../haptics.js";
import { shouldShowGating } from "../subscription.js";
import ProPaywall, { ProBanner } from "./ProPaywall.jsx";

import { useAudit } from '../contexts/AuditContext.jsx';
import { useNavigation } from '../contexts/NavigationContext.jsx';

export default memo(function HistoryTab({ toast }) {
    const { history: audits, deleteHistoryItem: onDelete, handleManualImport } = useAudit();
    const { navTo } = useNavigation();

    const onSelect = (a) => navTo("results", a);

    const [sel, setSel] = useState(new Set());
    const [selMode, setSelMode] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null); // index of audit to confirm delete
    const [showManualPaste, setShowManualPaste] = useState(false);
    const [manualPasteText, setManualPasteText] = useState("");
    const allSel = sel.size === audits.length && audits.length > 0;
    const toggle = i => { const s = new Set(sel); s.has(i) ? s.delete(i) : s.add(i); setSel(s); };
    const toggleAll = () => setSel(allSel ? new Set() : new Set(audits.map((_, i) => i)));
    const exitSel = () => { setSelMode(false); setSel(new Set()); };
    const doExportSel = () => { exportSelectedAudits(audits.filter((_, i) => sel.has(i))); exitSel(); };

    const [showPaywall, setShowPaywall] = useState(false);

    return <div className="page-body" style={{ paddingBottom: 0 }}>
        {shouldShowGating() && <ProBanner onUpgrade={() => setShowPaywall(true)} label="Showing last 8 audits" sublabel="Upgrade to Pro for full history" />}
        {showPaywall && <ProPaywall onClose={() => setShowPaywall(false)} />}
        <div style={{ paddingTop: 6, paddingBottom: 8, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div><h1 style={{ fontSize: 22, fontWeight: 800 }}>History</h1>
                <Mono size={11} color={T.text.dim}>{audits.length} audits stored</Mono></div>
            {audits.length > 0 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 200 }}>
                {selMode && sel.size > 0 && <button onClick={doExportSel} style={{ display: "flex", alignItems: "center", gap: 3, padding: "7px 12px", borderRadius: T.radius.md, border: `1px solid ${T.accent.primary}40`, background: T.accent.primaryDim, color: T.accent.primary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font.mono, transition: "all .2s ease" }}>
                    <Download size={10} />EXPORT {sel.size}</button>}
                <button onClick={() => { setSelMode(!selMode); setSel(new Set()); }} style={{ padding: "7px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: selMode ? T.accent.primary : T.text.dim, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font.mono, transition: "all .2s ease" }}>
                    {selMode ? "CANCEL" : "SELECT"}</button>
                <button onClick={() => exportAuditCSV(audits)} title="Export CSV" style={{ width: 32, height: 32, borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.dim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, fontFamily: T.font.mono, transition: "all .2s ease" }}>CSV</button>
                <button onClick={() => exportAllAudits(audits)} title="Export All JSON" style={{ width: 32, height: 32, borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.dim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s ease" }}>
                    <Download size={13} /></button>
            </div>}
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: showManualPaste ? 8 : 16 }}>
            <button onClick={async () => {
                try {
                    const txt = await navigator.clipboard.readText();
                    if (!txt || txt.trim() === "") throw new Error("Empty clipboard");
                    handleManualImport(txt);
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
                <button onClick={() => { if (manualPasteText.trim()) { handleManualImport(manualPasteText); setShowManualPaste(false); setManualPasteText(""); } else toast.error("Text is empty"); }} style={{ flex: 1, padding: "12px", borderRadius: T.radius.md, background: T.accent.emerald, color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer", border: "none" }}>
                    Import Text
                </button>
                <button onClick={() => { setShowManualPaste(false); setManualPasteText(""); }} style={{ padding: "12px 20px", borderRadius: T.radius.md, background: T.bg.elevated, color: T.text.dim, fontWeight: 700, fontSize: 13, cursor: "pointer", border: `1px solid ${T.border.default}` }}>
                    Cancel
                </button>
            </div>
        </div>}
        {selMode && audits.length > 0 && <div onClick={toggleAll} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", marginBottom: 8, borderRadius: T.radius.md, background: T.bg.card, cursor: "pointer", border: `1px solid ${T.border.subtle}` }}>
            <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, border: `2px solid ${allSel ? "transparent" : T.text.dim}`, background: allSel ? T.accent.primary : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s" }}>
                {allSel && <CheckCircle size={11} color={T.bg.base} strokeWidth={3} />}</div>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.text.secondary }}>{allSel ? "Deselect All" : "Select All"}</span>
            {sel.size > 0 && <Mono size={10} color={T.accent.primary} style={{ marginLeft: "auto" }}>{sel.size} selected</Mono>}
        </div>}
        {audits.length === 0 ? <EmptyState icon={Calendar} title="No History Yet" message="Perform a financial audit to see your history and trends right here." /> :
            audits.map((a, i) => {
                const isConfirming = confirmDelete === i;
                const rawStatus = a.parsed?.status || "UNKNOWN";
                let sColor = "UNKNOWN";
                let sText = rawStatus;
                const m = rawStatus.match(/^(GREEN|YELLOW|RED)[\s:;-]*(.*)$/i);
                if (m) {
                    sColor = m[1].toUpperCase();
                    sText = m[2] ? m[2].trim() : "";
                } else if (rawStatus.toUpperCase().includes("GREEN")) { sColor = "GREEN"; sText = rawStatus.replace(/GREEN/i, "").trim(); }
                else if (rawStatus.toUpperCase().includes("YELLOW")) { sColor = "YELLOW"; sText = rawStatus.replace(/YELLOW/i, "").trim(); }
                else if (rawStatus.toUpperCase().includes("RED")) { sColor = "RED"; sText = rawStatus.replace(/RED/i, "").trim(); }
                if (sText.startsWith(":") || sText.startsWith("-")) sText = sText.slice(1).trim();

                const cHex = sColor === "GREEN" ? T.status.green : sColor === "YELLOW" ? T.status.amber : sColor === "RED" ? T.status.red : T.text.muted;

                return <Card key={a.ts || i} animate delay={Math.min(i * 40, 400)}
                    onClick={selMode ? () => toggle(i) : isConfirming ? undefined : () => onSelect(a)}
                    style={{
                        padding: "16px",
                        position: "relative",
                        overflow: "hidden",
                        ...(sel.has(i) ? { borderColor: `${T.accent.primary}35`, background: `${T.accent.primary}08` } : {}),
                        ...(isConfirming ? { borderColor: `${T.status.red}30`, background: `${T.status.red}06` } : {}),
                    }}>
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: cHex, opacity: 0.8 }} />
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 60, background: `linear-gradient(90deg, ${cHex}15, transparent)`, pointerEvents: "none" }} />
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
                        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                            {/* Top Row: Date & Actions */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    {selMode && <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, border: `2px solid ${sel.has(i) ? "transparent" : T.text.dim}`, background: sel.has(i) ? T.accent.primary : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s" }}>
                                        {sel.has(i) && <CheckCircle size={12} color={T.bg.base} strokeWidth={3} />}</div>}
                                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <span style={{ fontSize: 16, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>
                                                {fmtDate(a.date)}
                                            </span>
                                            {a.isTest && <Badge variant="amber" style={{ padding: "3px 6px" }}>TEST</Badge>}
                                        </div>
                                        {a.parsed?.netWorth != null && (
                                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                                                <Mono size={14} weight={700} color={T.accent.primary}>{fmt(a.parsed.netWorth)}</Mono>
                                                <span style={{ fontSize: 10, fontWeight: 700, color: T.text.dim, letterSpacing: "0.05em" }}>NET WORTH</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div style={{ display: "flex", gap: 6, position: "relative", zIndex: 2 }}>
                                    {!selMode && <button onClick={e => { e.stopPropagation(); exportAudit(a); }} style={{ width: 32, height: 32, borderRadius: T.radius.md, border: `1px solid ${T.border.subtle}`, background: T.bg.elevated, color: T.text.secondary, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s" }}>
                                        <Download size={14} strokeWidth={2.5} /></button>}
                                    {!selMode && <button onClick={e => { e.stopPropagation(); setConfirmDelete(i); haptic.warning(); }} style={{ width: 32, height: 32, borderRadius: T.radius.md, border: `1px solid ${T.status.red}20`, background: T.status.redDim, color: T.status.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s" }}>
                                        <Trash2 size={14} strokeWidth={2.5} /></button>}
                                </div>
                            </div>

                            {/* Health Score + Model Badge Row */}
                            {(a.parsed?.healthScore?.score != null || a.model) && (
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                    {a.parsed?.healthScore?.score != null && (() => {
                                        const score = a.parsed.healthScore.score;
                                        const scoreColor = score >= 80 ? T.status.green : score >= 60 ? T.status.amber : T.status.red;
                                        return <span style={{
                                            fontSize: 10, fontWeight: 800, color: scoreColor,
                                            background: `${scoreColor}15`, border: `1px solid ${scoreColor}30`,
                                            padding: "2px 8px", borderRadius: 99, fontFamily: T.font.mono,
                                            letterSpacing: "0.04em",
                                        }}>SCORE: {score}</span>;
                                    })()}
                                    {a.model && <span style={{
                                        fontSize: 9, fontWeight: 700, color: T.text.dim,
                                        background: `${T.text.dim}12`, border: `1px solid ${T.text.dim}20`,
                                        padding: "2px 7px", borderRadius: 99, fontFamily: T.font.mono,
                                        letterSpacing: "0.03em", textTransform: "uppercase",
                                    }}>{a.model}</span>}
                                </div>
                            )}

                            {/* Key Metrics Row */}
                            {a.form && (
                                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                                    {a.form.checking != null && <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                        <span style={{ fontSize: 9, fontWeight: 700, color: T.text.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>CHK</span>
                                        <Mono size={11} weight={600} color={T.text.secondary}>{fmt(parseFloat(a.form.checking) || 0)}</Mono>
                                    </div>}
                                    {a.form.debts?.length > 0 && <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                        <span style={{ fontSize: 9, fontWeight: 700, color: T.text.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>DEBT</span>
                                        <Mono size={11} weight={600} color={T.status.red}>{fmt(a.form.debts.reduce((s, d) => s + (parseFloat(d.balance) || 0), 0))}</Mono>
                                    </div>}
                                    {a.form.savings != null && parseFloat(a.form.savings) > 0 && <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                        <span style={{ fontSize: 9, fontWeight: 700, color: T.text.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>SAV</span>
                                        <Mono size={11} weight={600} color={T.status.green}>{fmt(parseFloat(a.form.savings) || 0)}</Mono>
                                    </div>}
                                </div>
                            )}

                            {/* Status Pill */}
                            <div style={{
                                display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px",
                                background: `linear-gradient(135deg, ${cHex}15, ${cHex}05)`,
                                borderRadius: T.radius.md, border: `1px solid ${cHex}30`
                            }}>
                                <div style={{ width: 10, height: 10, borderRadius: "50%", background: cHex, boxShadow: `0 0 12px ${cHex}80`, flexShrink: 0, marginTop: 3 }} />
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                    <span style={{ fontSize: 11, fontWeight: 800, color: cHex, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                                        {sColor}
                                    </span>
                                    {sText && (
                                        <span style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.4, opacity: 0.9 }}>
                                            {sText}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </Card>;
            })}
    </div>;
})
