import { useState, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { AlertTriangle, Target, Wallet, ChevronDown, ChevronUp, Edit3, Trash2, Check, Plus, Link2, TrendingUp, TrendingDown } from "../icons";
import { Card, Badge } from "../ui.js";
import { Mono } from "../components.js";
import { T } from "../constants.js";
import { fmt } from "../utils.js";
import { useSettings } from "../contexts/SettingsContext.js";
import type { NonCardDebt, OtherAsset, SavingsGoal } from "../../types/index.js";
import type { PortfolioCollapsedSections } from "./types.js";

interface OtherAssetsSectionProps {
    collapsedSections: PortfolioCollapsedSections;
    setCollapsedSections: Dispatch<SetStateAction<PortfolioCollapsedSections>>;
    openSheet: (step: "goal" | "asset" | "debt") => void;
}

interface EditDebtForm {
    name: string;
    type: string;
    balance: string;
    apr: string;
    minPayment: string;
    linkedAssetId: string;
}

export default function OtherAssetsSection({ collapsedSections, setCollapsedSections, openSheet }: OtherAssetsSectionProps) {
    const { financialConfig, setFinancialConfig } = useSettings();

    // ── DEBTS ──
    const nonCardDebts: NonCardDebt[] = financialConfig?.nonCardDebts || [];
    const totalDebtBalance = useMemo(() => nonCardDebts.reduce((s, d) => s + (d.balance || 0), 0), [nonCardDebts]);
    const [editingDebt, setEditingDebt] = useState<number | null>(null);
    const [editDebtForm, setEditDebtForm] = useState<EditDebtForm>({ name: "", type: "personal", balance: "", apr: "", minPayment: "", linkedAssetId: "" });

    const startEditDebt = (debt: NonCardDebt, i: number) => {
        setEditingDebt(i);
        setEditDebtForm({
            name: debt.name || "",
            type: debt.type || "personal",
            balance: String(debt.balance || ""),
            apr: String(debt.apr || ""),
            minPayment: String(debt.minPayment || ""),
            linkedAssetId: debt.linkedAssetId || "",
        });
    };
    const saveEditDebt = (i: number) => {
        const arr = [...nonCardDebts];
        arr[i] = {
            ...arr[i],
            name: editDebtForm.name,
            type: editDebtForm.type,
            balance: parseFloat(editDebtForm.balance) || 0,
            apr: parseFloat(editDebtForm.apr) || 0,
            minPayment: parseFloat(editDebtForm.minPayment) || 0,
            linkedAssetId: editDebtForm.linkedAssetId || null,
        };
        setFinancialConfig({ ...financialConfig, nonCardDebts: arr });
        setEditingDebt(null);
    };
    const removeDebt = (i: number) => {
        setFinancialConfig({ ...financialConfig, nonCardDebts: nonCardDebts.filter((_, j) => j !== i) });
    };

    // ── SAVINGS GOALS ──
    const savingsGoals: SavingsGoal[] = financialConfig?.savingsGoals || [];
    const [editingGoals, setEditingGoals] = useState(false);
    const updateGoal = <K extends keyof SavingsGoal>(i: number, k: K, v: SavingsGoal[K]) => {
        const arr = [...savingsGoals];
        arr[i] = { ...arr[i], [k]: v };
        setFinancialConfig({ ...financialConfig, savingsGoals: arr });
    };
    const removeGoal = (i: number) => {
        setFinancialConfig({ ...financialConfig, savingsGoals: savingsGoals.filter((_, j) => j !== i) });
    };

    // ── OTHER ASSETS ──
    const otherAssets: OtherAsset[] = financialConfig?.otherAssets || [];
    const totalOtherAssets = otherAssets.reduce((s, a) => s + (a.value || 0), 0);
    const [editingAssets, setEditingAssets] = useState(false);
    const updateAsset = <K extends keyof OtherAsset>(i: number, k: K, v: OtherAsset[K]) => {
        const arr = [...otherAssets];
        arr[i] = { ...arr[i], [k]: v };
        setFinancialConfig({ ...financialConfig, otherAssets: arr });
    };
    const removeAsset = (i: number) => {
        setFinancialConfig({ ...financialConfig, otherAssets: otherAssets.filter((_, j) => j !== i) });
    };

    return (
        <>
            {/* ─── SAVINGS GOALS SECTION ─── */}
            {savingsGoals.length > 0 && (
                <Card
                    animate
                    variant="glass"
                    style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}
                >
                    <div
                        onClick={() => setCollapsedSections(s => ({ ...s, savingsGoals: !s.savingsGoals }))}
                        className="hover-card"
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "16px 20px",
                            cursor: "pointer",
                            background: `linear-gradient(90deg, ${T.accent.primary}08, transparent)`,
                            borderBottom: collapsedSections.savingsGoals ? "none" : `1px solid ${T.border.subtle}`,
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div
                                style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: 8,
                                    background: `${T.accent.primary}1A`,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    boxShadow: `0 0 12px ${T.accent.primary}10`,
                                }}
                            >
                                <Target size={14} color={T.accent.primary} />
                            </div>
                            <h2 style={{ fontSize: 16, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>
                                Savings Goals
                            </h2>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                                <div style={{ display: "flex", flexDirection: "column" }}>
                                    {savingsGoals.map((goal, i) => {
                                        const targetAmount = goal.targetAmount ?? 0;
                                        const currentAmount = goal.currentAmount ?? 0;
                                        const pct =
                                            targetAmount > 0
                                                ? Math.min(100, Math.round((currentAmount / targetAmount) * 100))
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
                                                                        ${currentAmount.toLocaleString()} / $
                                                                        {targetAmount.toLocaleString()}
                                                                    </Mono>
                                                                    {editingGoals && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
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
                                                            {targetAmount > 0 && (
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
                                </div>
                            )}

                            <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: `1px solid ${T.border.subtle}` }}>
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
                </Card>
            )}

            {/* ─── OTHER ASSETS SECTION ─── */}
            {otherAssets.length > 0 && (
                <Card
                    animate
                    variant="glass"
                    style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}
                >
                    <div
                        onClick={() => setCollapsedSections(s => ({ ...s, otherAssets: !s.otherAssets }))}
                        className="hover-card"
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "16px 20px",
                            cursor: "pointer",
                            background: `linear-gradient(90deg, ${T.accent.copper}08, transparent)`,
                            borderBottom: collapsedSections.otherAssets ? "none" : `1px solid ${T.border.subtle}`,
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div
                                style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: 8,
                                    background: `${T.accent.copper}1A`,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    boxShadow: `0 0 12px ${T.accent.copper}10`,
                                }}
                            >
                                <Wallet size={14} color={T.accent.copper} />
                            </div>
                            <h2 style={{ fontSize: 16, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>
                                Other Assets
                            </h2>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Badge
                                variant="outline"
                                style={{ fontSize: 10, color: T.accent.copper, borderColor: `${T.accent.copper}40` }}
                            >
                                {totalOtherAssets > 0 ? fmt(totalOtherAssets) : "None"}
                            </Badge>
                            <ChevronDown 
                                size={16} 
                                color={T.text.muted} 
                                className="chevron-animated"
                                data-open={String(!collapsedSections.otherAssets)} 
                            />
                        </div>
                    </div>

                    {!collapsedSections.otherAssets && (
                        <>
                            {otherAssets.length > 0 && (
                                <div style={{ display: "flex", flexDirection: "column" }}>
                                    {otherAssets.map((asset, i) => (
                                        <div
                                            key={i}
                                            style={{ borderBottom: i < otherAssets.length - 1 ? `1px solid ${T.border.subtle}` : "none" }}
                                        >
                                            <div style={{ padding: "14px 16px" }}>
                                                {editingAssets ? (
                                                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                                                            <button
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    if (window.confirm(`Delete "${asset.name}"?`)) removeAsset(i);
                                                                }}
                                                                style={{
                                                                    width: 32,
                                                                    height: 32,
                                                                    borderRadius: T.radius.sm,
                                                                    border: "none",
                                                                    background: "transparent",
                                                                    color: T.status.red,
                                                                    cursor: "pointer",
                                                                    display: "flex",
                                                                    alignItems: "center",
                                                                    justifyContent: "center",
                                                                    flexShrink: 0,
                                                                }}
                                                            >
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </div>
                                                        {/* Link to Debt */}
                                                        {nonCardDebts.length > 0 && (
                                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                                <Link2 size={13} color={T.text.dim} style={{ flexShrink: 0 }} />
                                                                <select
                                                                    value={asset.linkedDebtId || ""}
                                                                    onChange={e => updateAsset(i, "linkedDebtId", e.target.value || null)}
                                                                    aria-label="Link to debt"
                                                                    style={{
                                                                        flex: 1,
                                                                        padding: "6px 10px",
                                                                        borderRadius: T.radius.sm,
                                                                        border: `1px solid ${asset.linkedDebtId ? T.accent.emerald : T.border.default}`,
                                                                        background: T.bg.elevated,
                                                                        color: T.text.primary,
                                                                        fontSize: 11,
                                                                        outline: "none",
                                                                    }}
                                                                >
                                                                    <option value="">No linked debt</option>
                                                                    {nonCardDebts.map(d => (
                                                                        <option key={d.id || d.name} value={d.id || d.name}>{d.name} ({fmt(d.balance || 0)})</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (() => {
                                                    const linkedDebt = asset.linkedDebtId
                                                        ? nonCardDebts.find(d => (d.id || d.name) === asset.linkedDebtId)
                                                        : null;
                                                    const equity = linkedDebt ? (asset.value || 0) - (linkedDebt.balance || 0) : null;
                                                    return (
                                                    <div>
                                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
                                                                {linkedDebt && (
                                                                    <Badge
                                                                        variant="outline"
                                                                        style={{ fontSize: 8, padding: "1px 5px", color: T.status.amber, borderColor: `${T.status.amber}40`, display: "flex", alignItems: "center", gap: 3 }}
                                                                    >
                                                                        <Link2 size={7} /> {linkedDebt.name}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                                <div style={{ textAlign: "right" }}>
                                                                    <Mono size={13} weight={700} color={T.accent.copper}>
                                                                        {fmt(asset.value || 0)}
                                                                    </Mono>
                                                                    {equity !== null && (
                                                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 3, marginTop: 2 }}>
                                                                            {equity >= 0
                                                                                ? <TrendingUp size={9} color={T.status.green} />
                                                                                : <TrendingDown size={9} color={T.status.red} />
                                                                            }
                                                                            <span style={{ fontSize: 9, fontWeight: 700, color: equity >= 0 ? T.status.green : T.status.red, fontFamily: T.font.mono }}>
                                                                                {equity >= 0 ? "+" : ""}{fmt(equity)} equity
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: `1px solid ${T.border.subtle}` }}>
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
                </Card>
            )}

            {/* ─── DEBTS SECTION ─── */}
            {nonCardDebts.length > 0 && (
                <Card
                    animate
                    variant="glass"
                    style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}
                >
                    {/* Premium Section Header: Debts */}
                    <div
                        onClick={() => setCollapsedSections(p => ({ ...p, debts: !p.debts }))}
                        className="hover-card"
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "16px 20px",
                            cursor: "pointer",
                            background: `linear-gradient(90deg, ${T.status.amber}08, transparent)`,
                            borderBottom: collapsedSections.debts ? "none" : `1px solid ${T.border.subtle}`,
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
                            <h2 style={{ fontSize: 16, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>
                                Debts & Loans
                            </h2>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                                <div style={{ display: "flex", flexDirection: "column" }}>
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
                                                            {/* Link to Asset */}
                                                            {otherAssets.length > 0 && (
                                                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                                    <Link2 size={13} color={T.text.dim} style={{ flexShrink: 0 }} />
                                                                    <select
                                                                        value={editDebtForm.linkedAssetId || ""}
                                                                        onChange={e => setEditDebtForm(p => ({ ...p, linkedAssetId: e.target.value }))}
                                                                        aria-label="Link to asset"
                                                                        style={{
                                                                            flex: 1,
                                                                            padding: "8px 10px",
                                                                            borderRadius: T.radius.md,
                                                                            border: `1px solid ${editDebtForm.linkedAssetId ? T.accent.emerald : T.border.default}`,
                                                                            background: T.bg.elevated,
                                                                            color: T.text.primary,
                                                                            fontSize: 12,
                                                                            outline: "none",
                                                                        }}
                                                                    >
                                                                        <option value="">No linked asset</option>
                                                                        {otherAssets.map(a => (
                                                                            <option key={a.id || a.name} value={a.id || a.name}>{a.name} ({fmt(a.value || 0)})</option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                            )}
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
                                                                    onClick={(e) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
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
                                                    ) : (() => {
                                                        const linkedAsset = debt.linkedAssetId
                                                            ? otherAssets.find(a => (a.id || a.name) === debt.linkedAssetId)
                                                            : null;
                                                        const equity = linkedAsset ? (linkedAsset.value || 0) - (debt.balance || 0) : null;
                                                        return (
                                                        <div>
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
                                                                        {linkedAsset && (
                                                                            <Badge
                                                                                variant="outline"
                                                                                style={{ fontSize: 8, padding: "1px 5px", color: T.accent.emerald, borderColor: `${T.accent.emerald}40`, display: "flex", alignItems: "center", gap: 3 }}
                                                                            >
                                                                                <Link2 size={7} /> {linkedAsset.name}
                                                                            </Badge>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                                                    <div style={{ textAlign: "right" }}>
                                                                        <Mono size={13} weight={700} color={T.status.amber}>
                                                                            {fmt(debt.balance)}
                                                                        </Mono>
                                                                        {equity !== null && (
                                                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 3, marginTop: 2 }}>
                                                                                {equity >= 0
                                                                                    ? <TrendingUp size={9} color={T.status.green} />
                                                                                    : <TrendingDown size={9} color={T.status.red} />
                                                                                }
                                                                                <span style={{ fontSize: 9, fontWeight: 700, color: equity >= 0 ? T.status.green : T.status.red, fontFamily: T.font.mono }}>
                                                                                    {equity >= 0 ? "+" : ""}{fmt(equity)} equity
                                                                                </span>
                                                                            </div>
                                                                        )}
                                                                    </div>
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
                                                        </div>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                    ))}
                                </div>
                            )}

                            <div style={{ padding: "12px 16px", borderTop: `1px solid ${T.border.subtle}` }}>
                                <button
                                    onClick={() => openSheet("debt")}
                                    className="hover-btn"
                                    style={{
                                        width: "100%",
                                        padding: "12px",
                                        borderRadius: T.radius.lg,
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
                            </div>
                        </>
                    )}
                </Card>
            )}
        </>
    );
}
