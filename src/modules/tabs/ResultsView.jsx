import { useState } from "react";
import { ChevronUp, ChevronDown, Activity, AlertTriangle, CheckSquare, Target, Clock, TrendingUp, Zap, CheckCircle, RefreshCw } from "lucide-react";
import { T } from "../constants.js";
import { fmtDate, stripPaycheckParens } from "../utils.js";
import { Card, Badge } from "../ui.jsx";
import { Mono, Section, MoveRow, Md } from "../components.jsx";
import MonteCarloSimulator from "./MonteCarloSimulator.jsx";
import ShareCard from "./ShareCard.jsx";

export default function ResultsView({ audit, moveChecks, onToggleMove, financialConfig, streak = 0 }) {
    const [showRaw, setShowRaw] = useState(false);
    if (!audit) return <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        height: "60vh", padding: 32, textAlign: "center"
    }}>
        <Activity size={28} color={T.text.muted} style={{ marginBottom: 14, opacity: .4 }} />
        <p style={{ fontSize: 14, fontWeight: 600, color: T.text.dim }}>No results yet</p></div>;
    const p = audit.parsed;
    return <div className="page-body" style={{ paddingBottom: 0 }}>
        <div style={{ padding: "14px 0 12px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div><h1 style={{ fontSize: 22, fontWeight: 800 }}>Full Results</h1>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <Mono size={11} color={T.text.dim}>{fmtDate(audit.date)}</Mono>
                    {p.mode && (p.mode === "NORMAL" || p.mode === "FULL") ?
                        <Mono size={11} color={T.text.dim}>· {p.mode}</Mono> :
                        <Badge variant="amber" style={{ padding: "2px 6px", fontSize: 9, letterSpacing: "0.05em" }}>{p.mode}</Badge>
                    }
                </div>
            </div>
            {audit.isTest && <Badge variant="amber" style={{ marginTop: 4 }}>TEST · NOT SAVED</Badge>}
        </div>

        {/* Share Score Card */}
        {!audit.isTest && <ShareCard current={audit} streak={streak} />}

        {p.sections.alerts && !/^\s*(no\s*alerts|omit|none|\[\])\s*$/i.test(p.sections.alerts) && p.sections.alerts.length > 5 && (
            <Card animate style={{ borderColor: `${T.status.amber}18`, background: T.status.amberDim, borderLeft: `3px solid ${T.status.amber}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: `${T.status.amber}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <AlertTriangle size={14} color={T.status.amber} strokeWidth={2.5} /></div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.status.amber }}>Alerts</span></div>
                <Md text={p.sections.alerts} /></Card>)}
        <Section title="Dashboard" icon={Activity} content={p.sections.dashboard} accentColor={T.accent.primary} delay={50} badge={<Badge variant="teal">CORE</Badge>} />
        {p.moveItems?.length > 0 && <Card animate delay={100}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: T.accent.primaryDim, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <CheckSquare size={14} color={T.accent.primary} strokeWidth={2.5} /></div>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Weekly Moves</span></div>
                <Mono size={10} color={T.text.dim}>{Object.values(moveChecks).filter(Boolean).length}/{p.moveItems.length}</Mono></div>
            {p.moveItems.map((m, i) => <MoveRow key={i} item={m} index={i} checked={moveChecks[i] || false} onToggle={() => onToggleMove(i)} />)}
        </Card>}
        <Section title="Radar — 90 Days" icon={Target} content={p.sections.radar} accentColor={T.status.amber} delay={150} />
        <Section title="Long-Range Radar" icon={Clock} content={p.sections.longRange} accentColor={T.text.secondary} defaultOpen={false} delay={200} />
        <Section title="Forward Radar" icon={TrendingUp} content={p.sections.forwardRadar} accentColor={T.status.blue} defaultOpen={false} delay={250} />
        <Section title="Investments & Roth" icon={TrendingUp} content={p.sections.investments} accentColor={T.accent.primary} delay={300} />

        {/* Interactive Monte Carlo Simulator for compounding interest */}
        <MonteCarloSimulator audit={audit} config={financialConfig || {}} />
        {p.sections.nextAction && <Card animate delay={350} variant="accent">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: T.accent.primaryDim, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Zap size={14} color={T.accent.primary} strokeWidth={2.5} /></div>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.accent.primary }}>Next Action</span></div>
            <Md text={stripPaycheckParens(p.sections.nextAction)} /></Card>}
        {p.sections.qualityScore && <Section title="Quality Score" icon={CheckCircle} content={p.sections.qualityScore} accentColor={T.status.green} defaultOpen={false} delay={400} />}
        {p.sections.autoUpdates && <Section title="Auto-Updates" icon={RefreshCw} content={p.sections.autoUpdates} accentColor={T.text.dim} defaultOpen={false} delay={450} />}
        <Card style={{ background: T.bg.elevated }}>
            <div onClick={() => setShowRaw(!showRaw)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", minHeight: 36 }}>
                <span style={{ fontSize: 11, color: T.text.dim, fontWeight: 600 }}>Raw Output</span>
                {showRaw ? <ChevronUp size={13} color={T.text.dim} /> : <ChevronDown size={13} color={T.text.dim} />}</div>
            {showRaw && <pre style={{
                fontSize: 10, lineHeight: 1.6, color: T.text.secondary, whiteSpace: "pre-wrap", wordBreak: "break-word",
                marginTop: 10, maxHeight: 500, overflow: "auto", fontFamily: T.font.mono, padding: 12, background: T.bg.card, borderRadius: T.radius.md
            }}>{p.raw}</pre>}
        </Card>

        {/* Legal Disclaimer — always visible */}
        <div style={{
            marginTop: 12, padding: "14px 16px", borderRadius: T.radius.md,
            background: `${T.bg.elevated}80`, border: `1px solid ${T.border.subtle}`,
            display: "flex", alignItems: "flex-start", gap: 10
        }}>
            <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>⚖️</span>
            <p style={{ fontSize: 10, color: T.text.muted, lineHeight: 1.6, margin: 0 }}>
                <strong style={{ color: T.text.dim }}>Disclaimer:</strong> This analysis is generated by AI for educational and informational purposes only.
                It is <strong>not</strong> professional financial, tax, legal, or investment advice. Always consult a licensed financial advisor
                before making financial decisions. The app developer assumes no liability for actions taken based on this output.
            </p>
        </div>
    </div>;
}
