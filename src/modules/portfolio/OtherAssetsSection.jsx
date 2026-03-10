import { useState, useMemo } from "react";
import { AlertTriangle, Target, Wallet, ChevronDown, ChevronUp, Edit3, Trash2, Check, Plus } from "lucide-react";
import { Card, Badge } from "../ui.jsx";
import { Mono } from "../components.jsx";
import { T } from "../constants.js";
import { fmt } from "../utils.js";
import { useSettings } from "../contexts/SettingsContext.jsx";

export default function OtherAssetsSection({ collapsedSections, setCollapsedSections, openSheet }) {
    const { financialConfig, setFinancialConfig } = useSettings();

    // ── DEBTS ──
    const nonCardDebts = financialConfig?.nonCardDebts || [];
    const totalDebtBalance = useMemo(() => nonCardDebts.reduce((s, d) => s + (d.balance || 0), 0), [nonCardDebts]);
    const [editingDebt, setEditingDebt] = useState(null);
    const [editDebtForm, setEditDebtForm] = useState({});

    const startEditDebt = (debt, i) => {
        setEditingDebt(i);
        setEditDebtForm({
            name: debt.name || "",
            type: debt.type || "personal",
            balance: String(debt.balance || ""),
            apr: String(debt.apr || ""),
            minPayment: String(debt.minPayment || ""),
        });
    };
    const saveEditDebt = i => {
        const arr = [...nonCardDebts];
        arr[i] = {
            ...arr[i],
            name: editDebtForm.name,
            type: editDebtForm.type,
            balance: parseFloat(editDebtForm.balance) || 0,
            apr: parseFloat(editDebtForm.apr) || 0,
            minPayment: parseFloat(editDebtForm.minPayment) || 0,
        };
        setFinancialConfig({ ...financialConfig, nonCardDebts: arr });
        setEditingDebt(null);
    };
    const removeDebt = i => {
        setFinancialConfig({ ...financialConfig, nonCardDebts: nonCardDebts.filter((_, j) => j !== i) });
    };

    // ── SAVINGS GOALS ──
    const savingsGoals = financialConfig?.savingsGoals || [];
    const [editingGoals, setEditingGoals] = useState(false);
    const updateGoal = (i, k, v) => {
        const arr = [...savingsGoals];
        arr[i] = { ...arr[i], [k]: v };
        setFinancialConfig({ ...financialConfig, savingsGoals: arr });
    };
    const removeGoal = i => {
        setFinancialConfig({ ...financialConfig, savingsGoals: savingsGoals.filter((_, j) => j !== i) });
    };

    // ── OTHER ASSETS ──
    const otherAssets = financialConfig?.otherAssets || [];
    const totalOtherAssets = otherAssets.reduce((s, a) => s + (a.value || 0), 0);
    const [editingAssets, setEditingAssets] = useState(false);
    const updateAsset = (i, k, v) => {
        const arr = [...otherAssets];
        arr[i] = { ...arr[i], [k]: v };
        setFinancialConfig({ ...financialConfig, otherAssets: arr });
    };
    const removeAsset = i => {
        setFinancialConfig({ ...financialConfig, otherAssets: otherAssets.filter((_, j) => j !== i) });
    };

    return (
        <>
            {/* ─── SAVINGS GOALS SECTION ─── */}
            {savingsGoals.length > 0 && (
                <div>
                    <div
                        onClick={() => setCollapsedSections(s => ({ ...s, savingsGoals: !s.savingsGoals }))}
                        className="hover-lift"
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            marginTop: 8,
                            marginBottom: collapsedSections.savingsGoals ? 8 : 16,
                            padding: "16px 20px",
                            borderRadius: 24,
                            cursor: "pointer",
                            userSelect: "none",
                            background: T.bg.glass,
                            backdropFilter: "blur(20px)",
                            WebkitBackdropFilter: "blur(20px)",
                            border: `1px solid ${T.border.subtle}`,
                            boxShadow: `0 4px 16px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255,255,255,0.05)`,
                            transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                        }}
                    >
                        <div
                            style={{
                                width: 32,
                                height: 32,
                                borderRadius: 10,
                                background: `linear-gradient(135deg, ${T.accent.primary}20, ${T.accent.emerald}10)`,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                boxShadow: `0 4px 12px ${T.accent.primary}15`,
                                border: `1px solid ${T.accent.primary}30`,
                            }}
                        >
                            <Target size={16} color={T.accent.primary} />
                        </div>
                        <h2 style={{ fontSize: 18, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>
                            Savings Goals
                        </h2>
                        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                            <Badge
                                variant="outline"
                                style={{ fontSize: 10, color: T.accent.primary, borderColor: `${T.accent.primary}40` }}
                            >
                                {savingsGoals.length} goal{savingsGoals.length !== 1 ? "s" : ""}
                            </Badge>
                            <ChevronDown
                                size={16}
                                color={T.text.muted}
                                className="chevron-animated"
                                data-open={String(!collapsedSections.savingsGoals)}
                            />
                        </div>
                    </div>

                    {!collapsedSections.savingsGoals && (
                        <>
                            {savingsGoals.length > 0 && (
                                <Card animate style={{ padding: 0, overflow: "hidden" }}>
                                    {savingsGoals.map((goal, i) => {
                                        const pct =
                                            goal.targetAmount > 0
                                                ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100))
                                                : 0;
                                        const color = pct >= 100 ? T.status.green : pct >= 50 ? T.accent.primary : T.status.amber;
                                        return (
                                            <div
                                                key={i}
                                                style={{ borderBottom: i < savingsGoals.length - 1 ? `1px solid ${T.border.subtle}` : "none" }}
                                            >
                                                <div style={{ padding: "14px 16px" }}>
                                                    {editingGoals ? (
                                                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                                                <input
                                                                    value={goal.name || ""}
                                                                    onChange={e => updateGoal(i, "name", e.target.value)}
                                                                    placeholder="Goal name"
                                                                    style={{
                                                                        flex: 1,
                                                                        padding: "8px 10px",
                                                                        borderRadius: T.radius.sm,
                                                                        border: `1px solid ${T.border.default}`,
                                                                        background: T.bg.elevated,
                                                                        color: T.text.primary,
                                                                        fontSize: 12,
                                                                    }}
                                                                />
                                                            </div>
                                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                                                                <div style={{ position: "relative" }}>
                                                                    <span
                                                                        style={{
                                                                            position: "absolute",
                                                                            left: 6,
                                                                            top: "50%",
                                                                            transform: "translateY(-50%)",
                                                                            color: T.text.dim,
                                                                            fontSize: 10,
                                                                            fontWeight: 600,
                                                                        }}
                                                                    >
                                                                        $
                                                                    </span>
                                                                    <input
                                                                        type="number"
                                                                        inputMode="decimal"
                                                                        value={goal.targetAmount || ""}
                                                                        onChange={e => updateGoal(i, "targetAmount", parseFloat(e.target.value) || 0)}
                                                                        placeholder="Target"
                                                                        style={{
                                                                            width: "100%",
                                                                            padding: "6px 6px 6px 16px",
                                                                            borderRadius: T.radius.sm,
                                                                            border: `1px solid ${T.border.default}`,
                                                                            background: T.bg.card,
                                                                            color: T.text.primary,
                                                                            fontSize: 10,
                                                                        }}
                                                                    />
                                                                </div>
                                                                <div style={{ position: "relative" }}>
                                                                    <span
                                                                        style={{
                                                                            position: "absolute",
                                                                            left: 6,
                                                                            top: "50%",
                                                                            transform: "translateY(-50%)",
                                                                            color: T.text.dim,
                                                                            fontSize: 10,
                                                                            fontWeight: 600,
                                                                        }}
                                                                    >
                                                                        $
                                                                    </span>
                                                                    <input
                                                                        type="number"
                                                                        inputMode="decimal"
                                                                        value={goal.currentAmount || ""}
                                                                        onChange={e => updateGoal(i, "currentAmount", parseFloat(e.target.value) || 0)}
                                                                        placeholder="Current"
                                                                        style={{
                                                                            width: "100%",
                                                                            padding: "6px 6px 6px 16px",
                                                                            borderRadius: T.radius.sm,
                                                                            border: `1px solid ${T.border.default}`,
                                                                            background: T.bg.card,
                                                                            color: T.text.primary,
                                                                            fontSize: 10,
                                                                        }}
                                                                    />
                                                                </div>
                                                                <input
                                                                    type="date"
                                                                    value={goal.targetDate || ""}
                                                                    onChange={e => updateGoal(i, "targetDate", e.target.value)}
                                                                    style={{
                                                                        width: "100%",
                                                                        padding: "6px",
                                                                        borderRadius: T.radius.sm,
                                                                        border: `1px solid ${T.border.default}`,
                                                                        background: T.bg.card,
                                                                        color: T.text.primary,
                                                                        fontSize: 10,
                                                                    }}
                                                                />
                                                            </div>
                                                            <div style={{ fontSize: 8, color: T.text.muted, display: "flex", gap: 16 }}>
                                                                <span>Target $</span>
                                                                <span>Current $</span>
                                                                <span>Target Date</span>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div
                                                                style={{
                                                                    display: "flex",
                                                                    justifyContent: "space-between",
                                                                    alignItems: "center",
                                                                    marginBottom: 6,
                                                                }}
                                                            >
                                                                <span style={{ fontSize: 13, fontWeight: 700, color: T.text.primary }}>
                                                                    {goal.name || "Unnamed"}
                                                                </span>
                                                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                                    <Mono size={11} weight={700} color={color}>
                                                                        ${(goal.currentAmount || 0).toLocaleString()} / $
                                                                        {(goal.targetAmount || 0).toLocaleString()}
                                                                    </Mono>
                                                                    {editingGoals && (
                                                                        <button
                                                                            onClick={() => {
                                                                                if (window.confirm(`Delete "${goal.name}"?`)) removeGoal(i);
                                                                            }}
                                                                            style={{
                                                                                width: 28,
                                                                                height: 28,
                                                                                borderRadius: T.radius.md,
                                                                                border: "none",
                                                                                background: "transparent",
                                                                                color: T.status.red,
                                                                                cursor: "pointer",
                                                                                display: "flex",
                                                                                alignItems: "center",
                                                                                justifyContent: "center",
                                                                                marginLeft: 4,
                                                                            }}
                                                                        >
                                                                            <Trash2 size={13} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {goal.targetAmount > 0 && (
                                                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                                    <div
                                                                        style={{
                                                                            flex: 1,
                                                                            height: 6,
                                                                            borderRadius: 3,
                                                                            background: T.bg.surface,
                                                                            overflow: "hidden",
                                                                            boxShadow: "inset 0 1px 3px rgba(0,0,0,0.15)",
                                                                        }}
                                                                    >
                                                                        <div
                                                                            style={{
                                                                                height: "100%",
                                                                                borderRadius: 3,
                                                                                background:
                                                                                    pct === 100
                                                                                        ? T.status.green
                                                                                        : `linear-gradient(90deg, ${color}, ${T.accent.primary})`,
                                                                                width: `${pct}%`,
                                                                                transition: "width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)",
                                                                            }}
                                                                        />
                                                                    </div>
                                                                    <Mono size={10} weight={700} color={color}>
                                                                        {pct}%
                                                                    </Mono>
                                                                </div>
                                                            )}
                                                            {goal.targetDate && (
                                                                <span
                                                                    style={{
                                                                        fontSize: 9,
                                                                        color: T.text.muted,
                                                                        fontFamily: T.font.mono,
                                                                        marginTop: 4,
                                                                        display: "block",
                                                                    }}
                                                                >
                                                                    Target: {goal.targetDate}
                                                                </span>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </Card>
                            )}

                            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                                <button
                                    onClick={() => setEditingGoals(!editingGoals)}
                                    className="hover-lift"
                                    style={{
                                        flex: 1,
                                        padding: "10px",
                                        borderRadius: T.radius.lg,
                                        border: `1px solid ${editingGoals ? T.accent.primary : T.border.default}`,
                                        background: editingGoals ? `${T.accent.primary}1A` : T.bg.surface,
                                        color: editingGoals ? T.accent.primary : T.text.secondary,
                                        fontSize: 12,
                                        fontWeight: 700,
                                        cursor: "pointer",
                                        fontFamily: T.font.sans,
                                    }}
                                >
                                    {editingGoals ? "✓ Done" : "✏️ Edit"}
                                </button>
                                <button
                                    onClick={() => openSheet("goal")}
                                    className="hover-lift"
                                    style={{
                                        flex: 1,
                                        padding: "10px",
                                        borderRadius: T.radius.lg,
                                        border: `1px dashed ${T.accent.primary}60`,
                                        background: `${T.accent.primary}05`,
                                        color: T.accent.primary,
                                        fontSize: 12,
                                        fontWeight: 800,
                                        cursor: "pointer",
                                    }}
                                >
                                    + New Goal
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ─── OTHER ASSETS SECTION ─── */}
            {otherAssets.length > 0 && (
                <div>
                    <div
                        onClick={() => setCollapsedSections(s => ({ ...s, otherAssets: !s.otherAssets }))}
                        className="hover-lift"
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            marginTop: 8,
                            marginBottom: collapsedSections.otherAssets ? 8 : 16,
                            padding: "16px 20px",
                            borderRadius: 24,
                            cursor: "pointer",
                            userSelect: "none",
                            background: T.bg.glass,
                            backdropFilter: "blur(20px)",
                            WebkitBackdropFilter: "blur(20px)",
                            border: `1px solid ${T.border.subtle}`,
                            boxShadow: `0 4px 16px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255,255,255,0.05)`,
                            transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                        }}
                    >
                        <div
                            style={{
                                width: 32,
                                height: 32,
                                borderRadius: 10,
                                background: `linear-gradient(135deg, ${T.accent.copper}20, #FFE5B410)`,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                boxShadow: `0 4px 12px ${T.accent.copper}15`,
                                border: `1px solid ${T.accent.copper}30`,
                            }}
                        >
                            <Wallet size={16} color={T.accent.copper} />
                        </div>
                        <h2 style={{ fontSize: 18, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>
                            Other Assets
                        </h2>
                        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                            <Badge
                                variant="outline"
                                style={{ fontSize: 10, color: T.accent.copper, borderColor: `${T.accent.copper}40` }}
                            >
                                {totalOtherAssets > 0 ? fmt(totalOtherAssets) : "None"}
                            </Badge>
                            {collapsedSections.otherAssets ? (
                                <ChevronDown size={16} color={T.text.muted} />
                            ) : (
                                <ChevronUp size={16} color={T.text.muted} />
                            )}
                        </div>
                    </div>

                    {!collapsedSections.otherAssets && (
                        <>
                            {otherAssets.length > 0 && (
                                <Card animate style={{ padding: 0, overflow: "hidden" }}>
                                    {otherAssets.map((asset, i) => (
                                        <div
                                            key={i}
                                            style={{ borderBottom: i < otherAssets.length - 1 ? `1px solid ${T.border.subtle}` : "none" }}
                                        >
                                            <div style={{ padding: "14px 16px" }}>
                                                {editingAssets ? (
                                                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                                        <input
                                                            value={asset.name || ""}
                                                            onChange={e => updateAsset(i, "name", e.target.value)}
                                                            placeholder="e.g. Vehicle, Property"
                                                            style={{
                                                                flex: 1,
                                                                padding: "8px 10px",
                                                                borderRadius: T.radius.sm,
                                                                border: `1px solid ${T.border.default}`,
                                                                background: T.bg.elevated,
                                                                color: T.text.primary,
                                                                fontSize: 12,
                                                            }}
                                                        />
                                                        <div style={{ position: "relative", width: 100, flexShrink: 0 }}>
                                                            <span
                                                                style={{
                                                                    position: "absolute",
                                                                    left: 8,
                                                                    top: "50%",
                                                                    transform: "translateY(-50%)",
                                                                    color: T.text.dim,
                                                                    fontSize: 11,
                                                                    fontWeight: 600,
                                                                }}
                                                            >
                                                                $
                                                            </span>
                                                            <input
                                                                type="number"
                                                                inputMode="decimal"
                                                                value={asset.value || ""}
                                                                onChange={e => updateAsset(i, "value", parseFloat(e.target.value) || 0)}
                                                                placeholder="Value"
                                                                style={{
                                                                    width: "100%",
                                                                    padding: "8px 8px 8px 20px",
                                                                    borderRadius: T.radius.sm,
                                                                    border: `1px solid ${T.border.default}`,
                                                                    background: T.bg.elevated,
                                                                    color: T.text.primary,
                                                                    fontSize: 11,
                                                                }}
                                                            />
                                                        </div>
                                                        <button
                                                            onClick={() => updateAsset(i, "liquid", !asset.liquid)}
                                                            title={asset.liquid ? "Liquid" : "Illiquid"}
                                                            style={{
                                                                width: 32,
                                                                height: 32,
                                                                borderRadius: T.radius.sm,
                                                                border: `1px solid ${asset.liquid ? T.accent.emerald : T.border.default}`,
                                                                background: asset.liquid ? `${T.accent.emerald}15` : T.bg.elevated,
                                                                color: asset.liquid ? T.accent.emerald : T.text.muted,
                                                                cursor: "pointer",
                                                                display: "flex",
                                                                alignItems: "center",
                                                                justifyContent: "center",
                                                                fontSize: 12,
                                                                flexShrink: 0,
                                                            }}
                                                        >
                                                            {asset.liquid ? "💧" : "🔒"}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                            <span style={{ fontSize: 13, fontWeight: 600, color: T.text.primary }}>
                                                                {asset.name || "Unnamed"}
                                                            </span>
                                                            <Badge
                                                                variant="outline"
                                                                style={{
                                                                    fontSize: 8,
                                                                    padding: "1px 5px",
                                                                    color: asset.liquid ? T.accent.emerald : T.text.dim,
                                                                    borderColor: asset.liquid ? `${T.accent.emerald}40` : T.border.default,
                                                                }}
                                                            >
                                                                {asset.liquid ? "LIQUID" : "ILLIQUID"}
                                                            </Badge>
                                                        </div>
                                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                            <Mono size={13} weight={700} color={T.accent.copper}>
                                                                {fmt(asset.value || 0)}
                                                            </Mono>
                                                            {editingAssets && (
                                                                <button
                                                                    onClick={() => {
                                                                        if (window.confirm(`Delete "${asset.name}"?`)) removeAsset(i);
                                                                    }}
                                                                    style={{
                                                                        width: 28,
                                                                        height: 28,
                                                                        borderRadius: T.radius.md,
                                                                        border: "none",
                                                                        background: "transparent",
                                                                        color: T.status.red,
                                                                        cursor: "pointer",
                                                                        display: "flex",
                                                                        alignItems: "center",
                                                                        justifyContent: "center",
                                                                        marginLeft: 4,
                                                                    }}
                                                                >
                                                                    <Trash2 size={13} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </Card>
                            )}

                            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                                <button
                                    onClick={() => setEditingAssets(!editingAssets)}
                                    className="hover-lift"
                                    style={{
                                        flex: 1,
                                        padding: "10px",
                                        borderRadius: T.radius.lg,
                                        border: `1px solid ${editingAssets ? T.accent.copper : T.border.default}`,
                                        background: editingAssets ? `${T.accent.copper}1A` : T.bg.surface,
                                        color: editingAssets ? T.accent.copper : T.text.secondary,
                                        fontSize: 12,
                                        fontWeight: 700,
                                        cursor: "pointer",
                                    }}
                                >
                                    {editingAssets ? "✓ Done" : "✏️ Edit"}
                                </button>
                                <button
                                    onClick={() => openSheet("asset")}
                                    className="hover-lift"
                                    style={{
                                        flex: 1,
                                        padding: "10px",
                                        borderRadius: T.radius.lg,
                                        border: `1px dashed ${T.accent.copper}60`,
                                        background: `${T.accent.copper}05`,
                                        color: T.accent.copper,
                                        fontSize: 12,
                                        fontWeight: 800,
                                        cursor: "pointer",
                                    }}
                                >
                                    + New Asset
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ─── DEBTS SECTION ─── */}
            {nonCardDebts.length > 0 && (
                <div>
                    {/* Premium Section Header: Debts */}
                    <div
                        onClick={() => setCollapsedSections(p => ({ ...p, debts: !p.debts }))}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            marginTop: 8,
                            marginBottom: collapsedSections.debts ? 8 : 16,
                            padding: "16px 20px",
                            borderRadius: 24,
                            cursor: "pointer",
                            userSelect: "none",
                            background: T.bg.glass,
                            backdropFilter: "blur(20px)",
                            WebkitBackdropFilter: "blur(20px)",
                            border: `1px solid ${T.border.subtle}`,
                            boxShadow: `0 4px 16px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255,255,255,0.05)`,
                            transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                        }}
                    >
                        <div
                            style={{
                                width: 28,
                                height: 28,
                                borderRadius: 8,
                                background: `${T.status.amber}1A`,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                boxShadow: `0 0 12px ${T.status.amber}10`,
                            }}
                        >
                            <AlertTriangle size={14} color={T.status.amber} />
                        </div>
                        <h2 style={{ fontSize: 18, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>
                            Debts & Loans
                        </h2>
                        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                            <Badge
                                variant="outline"
                                style={{
                                    fontSize: 10,
                                    color: totalDebtBalance > 0 ? T.status.amber : T.text.muted,
                                    borderColor: totalDebtBalance > 0 ? `${T.status.amber}40` : T.border.default,
                                }}
                            >
                                {totalDebtBalance === 0 ? "0 Balance" : fmt(Math.round(totalDebtBalance))}
                            </Badge>
                            <ChevronDown
                                size={16}
                                color={T.text.muted}
                                className="chevron-animated"
                                data-open={String(!collapsedSections.debts)}
                            />
                        </div>
                    </div>

                    {!collapsedSections.debts && (
                        <>
                            {nonCardDebts.length > 0 && (
                                <Card
                                    animate
                                    variant="glass"
                                    className="hover-card"
                                    style={{ padding: 0, overflow: "hidden", marginBottom: 12, borderLeft: `4px solid ${T.status.amber}` }}
                                >
                                    {nonCardDebts
                                        .sort((a, b) => (b.balance || 0) - (a.balance || 0))
                                        .map((debt, i) => (
                                            <div
                                                key={debt.id || i}
                                                style={{ borderBottom: i === nonCardDebts.length - 1 ? "none" : `1px solid ${T.border.subtle}` }}
                                            >
                                                <div style={{ padding: "12px 18px" }}>
                                                    {editingDebt === i ? (
                                                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                                            <div style={{ display: "flex", gap: 8 }}>
                                                                <input
                                                                    value={editDebtForm.name}
                                                                    onChange={e => setEditDebtForm(p => ({ ...p, name: e.target.value }))}
                                                                    placeholder="Debt name"
                                                                    aria-label="Debt name"
                                                                    style={{
                                                                        flex: 1,
                                                                        padding: "10px 12px",
                                                                        borderRadius: T.radius.md,
                                                                        border: `1px solid ${T.border.default}`,
                                                                        background: T.bg.elevated,
                                                                        color: T.text.primary,
                                                                        fontSize: 13,
                                                                        outline: "none",
                                                                        boxSizing: "border-box",
                                                                    }}
                                                                />
                                                                <select
                                                                    value={editDebtForm.type}
                                                                    onChange={e => setEditDebtForm(p => ({ ...p, type: e.target.value }))}
                                                                    aria-label="Debt type"
                                                                    style={{
                                                                        padding: "10px 8px",
                                                                        borderRadius: T.radius.md,
                                                                        border: `1px solid ${T.border.default}`,
                                                                        background: T.bg.elevated,
                                                                        color: T.text.primary,
                                                                        fontSize: 12,
                                                                        outline: "none",
                                                                    }}
                                                                >
                                                                    <option value="auto">Auto</option>
                                                                    <option value="student">Student</option>
                                                                    <option value="mortgage">Mortgage</option>
                                                                    <option value="personal">Personal</option>
                                                                    <option value="medical">Medical</option>
                                                                </select>
                                                            </div>
                                                            <div style={{ display: "flex", gap: 8 }}>
                                                                <div style={{ flex: 1, position: "relative" }}>
                                                                    <span
                                                                        style={{
                                                                            position: "absolute",
                                                                            left: 10,
                                                                            top: "50%",
                                                                            transform: "translateY(-50%)",
                                                                            color: T.text.dim,
                                                                            fontSize: 12,
                                                                            fontWeight: 600,
                                                                        }}
                                                                    >
                                                                        $
                                                                    </span>
                                                                    <input
                                                                        type="number"
                                                                        inputMode="decimal"
                                                                        value={editDebtForm.balance}
                                                                        onChange={e => setEditDebtForm(p => ({ ...p, balance: e.target.value }))}
                                                                        placeholder="Balance"
                                                                        style={{
                                                                            width: "100%",
                                                                            padding: "10px 10px 10px 22px",
                                                                            borderRadius: T.radius.md,
                                                                            border: `1px solid ${T.border.default}`,
                                                                            background: T.bg.elevated,
                                                                            color: T.text.primary,
                                                                            fontFamily: T.font.mono,
                                                                            fontSize: 13,
                                                                            boxSizing: "border-box",
                                                                            outline: "none",
                                                                        }}
                                                                    />
                                                                </div>
                                                                <div style={{ flex: 0.7, position: "relative" }}>
                                                                    <input
                                                                        type="number"
                                                                        inputMode="decimal"
                                                                        value={editDebtForm.apr}
                                                                        onChange={e => setEditDebtForm(p => ({ ...p, apr: e.target.value }))}
                                                                        placeholder="APR"
                                                                        style={{
                                                                            width: "100%",
                                                                            padding: "10px 24px 10px 10px",
                                                                            borderRadius: T.radius.md,
                                                                            border: `1px solid ${T.border.default}`,
                                                                            background: T.bg.elevated,
                                                                            color: T.text.primary,
                                                                            fontFamily: T.font.mono,
                                                                            fontSize: 13,
                                                                            boxSizing: "border-box",
                                                                            outline: "none",
                                                                        }}
                                                                    />
                                                                    <span
                                                                        style={{
                                                                            position: "absolute",
                                                                            right: 10,
                                                                            top: "50%",
                                                                            transform: "translateY(-50%)",
                                                                            color: T.text.dim,
                                                                            fontSize: 12,
                                                                        }}
                                                                    >
                                                                        %
                                                                    </span>
                                                                </div>
                                                                <div style={{ flex: 1, position: "relative" }}>
                                                                    <span
                                                                        style={{
                                                                            position: "absolute",
                                                                            left: 10,
                                                                            top: "50%",
                                                                            transform: "translateY(-50%)",
                                                                            color: T.text.dim,
                                                                            fontSize: 11,
                                                                            fontWeight: 600,
                                                                        }}
                                                                    >
                                                                        $
                                                                    </span>
                                                                    <input
                                                                        type="number"
                                                                        inputMode="decimal"
                                                                        value={editDebtForm.minPayment}
                                                                        onChange={e => setEditDebtForm(p => ({ ...p, minPayment: e.target.value }))}
                                                                        placeholder="Min Pmt"
                                                                        style={{
                                                                            width: "100%",
                                                                            padding: "10px 10px 10px 22px",
                                                                            borderRadius: T.radius.md,
                                                                            border: `1px solid ${T.border.default}`,
                                                                            background: T.bg.elevated,
                                                                            color: T.text.primary,
                                                                            fontFamily: T.font.mono,
                                                                            fontSize: 13,
                                                                            boxSizing: "border-box",
                                                                            outline: "none",
                                                                        }}
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div style={{ display: "flex", gap: 8 }}>
                                                                <button
                                                                    onClick={() => saveEditDebt(i)}
                                                                    style={{
                                                                        flex: 1,
                                                                        padding: 12,
                                                                        borderRadius: T.radius.sm,
                                                                        border: "none",
                                                                        background: `${T.status.amber}18`,
                                                                        color: T.status.amber,
                                                                        fontSize: 11,
                                                                        fontWeight: 800,
                                                                        cursor: "pointer",
                                                                        display: "flex",
                                                                        alignItems: "center",
                                                                        justifyContent: "center",
                                                                        gap: 6,
                                                                    }}
                                                                >
                                                                    <Check size={14} />
                                                                    Save
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        if (window.confirm(`Delete "${editDebtForm.name}"?`)) removeDebt(i);
                                                                    }}
                                                                    style={{
                                                                        flex: 1,
                                                                        padding: 12,
                                                                        borderRadius: T.radius.sm,
                                                                        border: "none",
                                                                        background: T.status.redDim,
                                                                        color: T.status.red,
                                                                        fontSize: 11,
                                                                        fontWeight: 700,
                                                                        cursor: "pointer",
                                                                        display: "flex",
                                                                        alignItems: "center",
                                                                        justifyContent: "center",
                                                                        gap: 6,
                                                                    }}
                                                                >
                                                                    Delete
                                                                </button>
                                                                <button
                                                                    onClick={() => setEditingDebt(null)}
                                                                    style={{
                                                                        flex: 1,
                                                                        padding: 12,
                                                                        borderRadius: T.radius.sm,
                                                                        border: `1px solid ${T.border.default}`,
                                                                        background: "transparent",
                                                                        color: T.text.dim,
                                                                        fontSize: 11,
                                                                        cursor: "pointer",
                                                                        fontWeight: 600,
                                                                    }}
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <span style={{ fontSize: 12, fontWeight: 600, color: T.text.primary }}>
                                                                    {debt.name || "Unnamed Debt"}
                                                                </span>
                                                                <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                                                                    {debt.type && (
                                                                        <Badge
                                                                            variant="outline"
                                                                            style={{
                                                                                fontSize: 8,
                                                                                padding: "1px 5px",
                                                                                color: T.status.amber,
                                                                                borderColor: `${T.status.amber}40`,
                                                                            }}
                                                                        >
                                                                            {debt.type.toUpperCase()}
                                                                        </Badge>
                                                                    )}
                                                                    {debt.apr > 0 && (
                                                                        <Badge
                                                                            variant="outline"
                                                                            style={{ fontSize: 8, padding: "1px 5px", color: T.text.secondary }}
                                                                        >
                                                                            {debt.apr}% APR
                                                                        </Badge>
                                                                    )}
                                                                    {debt.minPayment > 0 && (
                                                                        <Badge
                                                                            variant="outline"
                                                                            style={{ fontSize: 8, padding: "1px 5px", color: T.text.dim }}
                                                                        >
                                                                            Min {fmt(debt.minPayment)}
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                                                <Mono size={13} weight={700} color={T.status.amber}>
                                                                    {fmt(debt.balance)}
                                                                </Mono>
                                                                <button
                                                                    onClick={() => startEditDebt(debt, i)}
                                                                    style={{
                                                                        width: 36,
                                                                        height: 36,
                                                                        borderRadius: T.radius.md,
                                                                        border: `1px solid ${T.border.default}`,
                                                                        background: T.bg.elevated,
                                                                        color: T.text.dim,
                                                                        cursor: "pointer",
                                                                        display: "flex",
                                                                        alignItems: "center",
                                                                        justifyContent: "center",
                                                                    }}
                                                                >
                                                                    <Edit3 size={11} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                </Card>
                            )}

                            <button
                                onClick={() => openSheet("debt")}
                                className="hover-btn"
                                style={{
                                    width: "100%",
                                    padding: "12px",
                                    borderRadius: T.radius.lg,
                                    marginTop: 12,
                                    border: `1px dashed ${T.status.amber}60`,
                                    background: `${T.status.amber}05`,
                                    color: T.status.amber,
                                    fontSize: 12,
                                    fontWeight: 800,
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 6,
                                }}
                            >
                                <Plus size={14} /> Add Debt
                            </button>
                        </>
                    )}
                </div>
            )}
        </>
    );
}
