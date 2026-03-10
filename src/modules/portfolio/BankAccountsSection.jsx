import { useState, useMemo } from "react";
import { Landmark, Building2, ChevronDown, Edit3, Check, DollarSign } from "lucide-react";
import { Card, Badge } from "../ui.jsx";
import { Mono } from "../components.jsx";
import { T } from "../constants.js";
import { usePortfolio } from "../contexts/PortfolioContext.jsx";
import { fmt } from "../utils.js";

export default function BankAccountsSection() {
    const { bankAccounts, setBankAccounts } = usePortfolio();

    const [collapsedSections, setCollapsedSections] = useState({});
    const [collapsedBanks, setCollapsedBanks] = useState({});
    const [editingBank, setEditingBank] = useState(null);
    const [editBankForm, setEditBankForm] = useState({});

    const removeBankAccount = id => {
        setBankAccounts(bankAccounts.filter(a => a.id !== id));
    };

    const startEditBank = acct => {
        setEditingBank(acct.id);
        setEditBankForm({
            bank: acct.bank,
            accountType: acct.accountType,
            name: acct.name,
            apy: String(acct.apy || ""),
            notes: acct.notes || "",
        });
    };

    const saveEditBank = id => {
        setBankAccounts(
            bankAccounts.map(a =>
                a.id === id
                    ? {
                        ...a,
                        bank: editBankForm.bank || a.bank,
                        accountType: editBankForm.accountType || a.accountType,
                        name: (editBankForm.name || "").trim() || a.name,
                        apy: editBankForm.apy === "" ? null : parseFloat(editBankForm.apy) || null,
                        notes: editBankForm.notes,
                    }
                    : a
            )
        );
        setEditingBank(null);
    };

    // Split bank accounts by type for separate sections
    const checkingAccounts = useMemo(() => bankAccounts.filter(a => a.accountType === "checking"), [bankAccounts]);
    const savingsAccounts = useMemo(() => bankAccounts.filter(a => a.accountType === "savings"), [bankAccounts]);

    const groupedChecking = useMemo(() => {
        const g = {};
        checkingAccounts.forEach(a => {
            (g[a.bank] = g[a.bank] || []).push(a);
        });
        return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
    }, [checkingAccounts]);

    const groupedSavings = useMemo(() => {
        const g = {};
        savingsAccounts.forEach(a => {
            (g[a.bank] = g[a.bank] || []).push(a);
        });
        return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
    }, [savingsAccounts]);

    if (bankAccounts.length === 0) return null;

    const checkingSection =
        checkingAccounts.length > 0 ? (
            <div>
                {/* Premium Section Header: Checking Accounts */}
                <div
                    onClick={() => setCollapsedSections(p => ({ ...p, bankAccounts: !p.bankAccounts }))}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        marginTop: 8,
                        marginBottom: collapsedSections.bankAccounts ? 8 : 16,
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
                            background: `${T.status.blue}1A`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxShadow: `0 0 12px ${T.status.blue}10`,
                        }}
                    >
                        <Landmark size={14} color={T.status.blue} />
                    </div>
                    <h2 style={{ fontSize: 18, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>
                        Checking Accounts
                    </h2>
                    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                        <Badge
                            variant="outline"
                            style={{
                                fontSize: 10,
                                color: checkingAccounts.length > 0 ? T.status.blue : T.text.muted,
                                borderColor: checkingAccounts.length > 0 ? `${T.status.blue}40` : T.border.default,
                            }}
                        >
                            {checkingAccounts.length}
                        </Badge>
                        <ChevronDown
                            size={16}
                            color={T.text.muted}
                            className="chevron-animated"
                            data-open={String(!collapsedSections.bankAccounts)}
                        />
                    </div>
                </div>

                {!collapsedSections.bankAccounts && (
                    <>
                        {groupedChecking.length === 0 ? (
                            <Card style={{ padding: "16px", textAlign: "center" }}>
                                <p style={{ fontSize: 11, color: T.text.muted }}>No checking accounts yet</p>
                            </Card>
                        ) : (
                            groupedChecking.map(([bank, accts]) => {
                                const isCollapsed = collapsedBanks[`checking-${bank}`];
                                return (
                                    <Card
                                        key={`c-${bank}`}
                                        animate
                                        variant="glass"
                                        className="hover-card"
                                        style={{
                                            marginBottom: 12,
                                            padding: 0,
                                            overflow: "hidden",
                                            borderLeft: `4px solid ${T.status.blue}`,
                                        }}
                                    >
                                        <div
                                            onClick={() => setCollapsedBanks(p => ({ ...p, [`checking-${bank}`]: !isCollapsed }))}
                                            style={{
                                                padding: "14px 18px",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                cursor: "pointer",
                                                background: `${T.status.blue}08`,
                                            }}
                                        >
                                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                <div
                                                    style={{
                                                        padding: 5,
                                                        borderRadius: 7,
                                                        background: T.status.blue,
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                    }}
                                                >
                                                    <Building2 size={12} color={T.bg.card} />
                                                </div>
                                                <span
                                                    style={{
                                                        fontSize: 12,
                                                        fontWeight: 800,
                                                        color: T.status.blue,
                                                        textTransform: "uppercase",
                                                        letterSpacing: "0.05em",
                                                    }}
                                                >
                                                    {bank}
                                                </span>
                                                <Badge
                                                    variant="outline"
                                                    style={{ fontSize: 10, color: T.status.blue, borderColor: `${T.status.blue}40` }}
                                                >
                                                    {accts.length}
                                                </Badge>
                                            </div>
                                            <ChevronDown
                                                size={14}
                                                color={T.text.dim}
                                                className="chevron-animated"
                                                data-open={String(!isCollapsed)}
                                            />
                                        </div>
                                        <div className="collapse-section" data-collapsed={String(isCollapsed)}>
                                            <div style={{ padding: 0 }}>
                                                {accts
                                                    .sort((a, b) => a.name.localeCompare(b.name))
                                                    .map((acct, i) => (
                                                        <div
                                                            key={acct.id}
                                                            style={{ borderBottom: i === accts.length - 1 ? "none" : `1px solid ${T.border.subtle}` }}
                                                        >
                                                            <div style={{ padding: "10px 16px" }}>
                                                                {editingBank === acct.id ? (
                                                                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                                                        <input
                                                                            value={editBankForm.name}
                                                                            onChange={e => setEditBankForm(p => ({ ...p, name: e.target.value }))}
                                                                            placeholder="Account name"
                                                                            aria-label="Account name"
                                                                            style={{
                                                                                width: "100%",
                                                                                fontSize: 13,
                                                                                padding: "10px 12px",
                                                                                borderRadius: T.radius.md,
                                                                                border: `1px solid ${T.border.default}`,
                                                                                background: T.bg.elevated,
                                                                                color: T.text.primary,
                                                                                outline: "none",
                                                                                boxSizing: "border-box",
                                                                            }}
                                                                        />
                                                                        <div style={{ display: "flex", gap: 8 }}>
                                                                            <div style={{ flex: 0.4, position: "relative" }}>
                                                                                <input
                                                                                    type="number"
                                                                                    inputMode="decimal"
                                                                                    step="0.01"
                                                                                    value={editBankForm.apy}
                                                                                    onChange={e => setEditBankForm(p => ({ ...p, apy: e.target.value }))}
                                                                                    placeholder="APY"
                                                                                    aria-label="APY percentage"
                                                                                    style={{
                                                                                        width: "100%",
                                                                                        padding: "10px 24px 10px 10px",
                                                                                        borderRadius: T.radius.md,
                                                                                        border: `1px solid ${T.border.default}`,
                                                                                        background: T.bg.elevated,
                                                                                        color: T.text.primary,
                                                                                        fontFamily: T.font.mono,
                                                                                        fontSize: 13,
                                                                                        outline: "none",
                                                                                        boxSizing: "border-box",
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
                                                                            <input
                                                                                value={editBankForm.notes}
                                                                                onChange={e => setEditBankForm(p => ({ ...p, notes: e.target.value }))}
                                                                                placeholder="Notes"
                                                                                aria-label="Account notes"
                                                                                style={{
                                                                                    flex: 1,
                                                                                    fontSize: 13,
                                                                                    padding: "10px 12px",
                                                                                    borderRadius: T.radius.md,
                                                                                    border: `1px solid ${T.border.default}`,
                                                                                    background: T.bg.elevated,
                                                                                    color: T.text.primary,
                                                                                    outline: "none",
                                                                                    boxSizing: "border-box",
                                                                                }}
                                                                            />
                                                                        </div>
                                                                        <div style={{ display: "flex", gap: 8 }}>
                                                                            <button
                                                                                onClick={() => saveEditBank(acct.id)}
                                                                                style={{
                                                                                    flex: 1,
                                                                                    padding: 12,
                                                                                    borderRadius: T.radius.sm,
                                                                                    border: "none",
                                                                                    background: `${T.status.blue}18`,
                                                                                    color: T.status.blue,
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
                                                                                    if (window.confirm(`Delete "${acct.name}"?`)) removeBankAccount(acct.id);
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
                                                                                onClick={() => setEditingBank(null)}
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
                                                                    <div
                                                                        style={{
                                                                            display: "flex",
                                                                            justifyContent: "space-between",
                                                                            alignItems: "center",
                                                                            gap: 8,
                                                                        }}
                                                                    >
                                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                                            <span
                                                                                style={{
                                                                                    fontSize: 13,
                                                                                    fontWeight: 700,
                                                                                    color: T.text.primary,
                                                                                    display: "block",
                                                                                }}
                                                                            >
                                                                                {acct.name}
                                                                            </span>
                                                                            {(acct.apy > 0 ||
                                                                                acct._plaidAccountId ||
                                                                                (acct.notes && !acct._plaidAccountId)) && (
                                                                                    <Mono size={10} color={T.text.dim} style={{ display: "block", marginTop: 3 }}>
                                                                                        {[acct.apy > 0 && `${acct.apy}% APY`, acct._plaidAccountId && `⚡ Plaid`]
                                                                                            .filter(Boolean)
                                                                                            .join("  ·  ") || (acct.notes && !acct._plaidAccountId ? acct.notes : "")}
                                                                                    </Mono>
                                                                                )}
                                                                        </div>
                                                                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                                                            <Mono
                                                                                size={14}
                                                                                weight={900}
                                                                                color={acct._plaidBalance != null ? T.status.blue : T.text.muted}
                                                                            >
                                                                                {acct._plaidBalance != null ? fmt(acct._plaidBalance) : "—"}
                                                                            </Mono>
                                                                            <button
                                                                                onClick={() => startEditBank(acct)}
                                                                                style={{
                                                                                    width: 32,
                                                                                    height: 32,
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
                                            </div>
                                        </div>
                                    </Card>
                                );
                            })
                        )}
                    </>
                )}
            </div>
        ) : null;

    const savingsSection =
        savingsAccounts.length > 0 ? (
            <div>
                {/* Premium Section Header: Savings Accounts */}
                <div
                    onClick={() => setCollapsedSections(p => ({ ...p, savingsAccounts: !p.savingsAccounts }))}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        marginTop: 8,
                        marginBottom: collapsedSections.savingsAccounts ? 8 : 16,
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
                            background: `${T.accent.emerald}1A`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxShadow: `0 0 12px ${T.accent.emerald}10`,
                        }}
                    >
                        <DollarSign size={14} color={T.accent.emerald} />
                    </div>
                    <h2 style={{ fontSize: 18, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>
                        Savings Accounts
                    </h2>
                    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                        <Badge
                            variant="outline"
                            style={{
                                fontSize: 10,
                                color: savingsAccounts.length > 0 ? T.accent.emerald : T.text.muted,
                                borderColor: savingsAccounts.length > 0 ? `${T.accent.emerald}40` : T.border.default,
                            }}
                        >
                            {savingsAccounts.length}
                        </Badge>
                        <ChevronDown
                            size={16}
                            color={T.text.muted}
                            className="chevron-animated"
                            data-open={String(!collapsedSections.savingsAccounts)}
                        />
                    </div>
                </div>

                {!collapsedSections.savingsAccounts && (
                    <>
                        {groupedSavings.map(([bank, accts]) => {
                            const isCollapsed = collapsedBanks[`savings-${bank}`];
                            return (
                                <Card
                                    key={`s-${bank}`}
                                    animate
                                    variant="glass"
                                    className="hover-card"
                                    style={{
                                        marginBottom: 12,
                                        padding: 0,
                                        overflow: "hidden",
                                        borderLeft: `4px solid ${T.accent.emerald}`,
                                    }}
                                >
                                    <div
                                        onClick={() => setCollapsedBanks(p => ({ ...p, [`savings-${bank}`]: !isCollapsed }))}
                                        style={{
                                            padding: "14px 18px",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            cursor: "pointer",
                                            background: `${T.accent.emerald}08`,
                                        }}
                                    >
                                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                            <div
                                                style={{
                                                    padding: 5,
                                                    borderRadius: 7,
                                                    background: T.accent.emerald,
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                }}
                                            >
                                                <DollarSign size={12} color={T.bg.card} />
                                            </div>
                                            <span
                                                style={{
                                                    fontSize: 12,
                                                    fontWeight: 800,
                                                    color: T.accent.emerald,
                                                    textTransform: "uppercase",
                                                    letterSpacing: "0.05em",
                                                }}
                                            >
                                                {bank}
                                            </span>
                                            <Badge
                                                variant="outline"
                                                style={{ fontSize: 10, color: T.accent.emerald, borderColor: `${T.accent.emerald}40` }}
                                            >
                                                {accts.length}
                                            </Badge>
                                        </div>
                                        <ChevronDown
                                            size={14}
                                            color={T.text.dim}
                                            className="chevron-animated"
                                            data-open={String(!isCollapsed)}
                                        />
                                    </div>
                                    <div className="collapse-section" data-collapsed={String(isCollapsed)}>
                                        <div style={{ padding: 0 }}>
                                            {accts
                                                .sort((a, b) => a.name.localeCompare(b.name))
                                                .map((acct, i) => (
                                                    <div
                                                        key={acct.id}
                                                        style={{ borderBottom: i === accts.length - 1 ? "none" : `1px solid ${T.border.subtle}` }}
                                                    >
                                                        <div style={{ padding: "10px 16px" }}>
                                                            {editingBank === acct.id ? (
                                                                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                                                    <input
                                                                        value={editBankForm.name}
                                                                        onChange={e => setEditBankForm(p => ({ ...p, name: e.target.value }))}
                                                                        placeholder="Account name"
                                                                        aria-label="Account name"
                                                                        style={{
                                                                            width: "100%",
                                                                            fontSize: 13,
                                                                            padding: "10px 12px",
                                                                            borderRadius: T.radius.md,
                                                                            border: `1px solid ${T.border.default}`,
                                                                            background: T.bg.elevated,
                                                                            color: T.text.primary,
                                                                            outline: "none",
                                                                            boxSizing: "border-box",
                                                                        }}
                                                                    />
                                                                    <div style={{ display: "flex", gap: 8 }}>
                                                                        <div style={{ flex: 0.4, position: "relative" }}>
                                                                            <input
                                                                                type="number"
                                                                                inputMode="decimal"
                                                                                step="0.01"
                                                                                value={editBankForm.apy}
                                                                                onChange={e => setEditBankForm(p => ({ ...p, apy: e.target.value }))}
                                                                                placeholder="APY"
                                                                                aria-label="APY percentage"
                                                                                style={{
                                                                                    width: "100%",
                                                                                    padding: "10px 24px 10px 10px",
                                                                                    borderRadius: T.radius.md,
                                                                                    border: `1px solid ${T.border.default}`,
                                                                                    background: T.bg.elevated,
                                                                                    color: T.text.primary,
                                                                                    fontFamily: T.font.mono,
                                                                                    fontSize: 13,
                                                                                    outline: "none",
                                                                                    boxSizing: "border-box",
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
                                                                        <input
                                                                            value={editBankForm.notes}
                                                                            onChange={e => setEditBankForm(p => ({ ...p, notes: e.target.value }))}
                                                                            placeholder="Notes"
                                                                            aria-label="Account notes"
                                                                            style={{
                                                                                flex: 1,
                                                                                fontSize: 13,
                                                                                padding: "10px 12px",
                                                                                borderRadius: T.radius.md,
                                                                                border: `1px solid ${T.border.default}`,
                                                                                background: T.bg.elevated,
                                                                                color: T.text.primary,
                                                                                outline: "none",
                                                                                boxSizing: "border-box",
                                                                            }}
                                                                        />
                                                                    </div>
                                                                    <div style={{ display: "flex", gap: 8 }}>
                                                                        <button
                                                                            onClick={() => saveEditBank(acct.id)}
                                                                            style={{
                                                                                flex: 1,
                                                                                padding: 12,
                                                                                borderRadius: T.radius.sm,
                                                                                border: "none",
                                                                                background: `${T.accent.emerald}18`,
                                                                                color: T.accent.emerald,
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
                                                                                if (window.confirm(`Delete "${acct.name}"?`)) removeBankAccount(acct.id);
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
                                                                            onClick={() => setEditingBank(null)}
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
                                                                <div
                                                                    style={{
                                                                        display: "flex",
                                                                        justifyContent: "space-between",
                                                                        alignItems: "center",
                                                                        gap: 8,
                                                                    }}
                                                                >
                                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                                        <span
                                                                            style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, display: "block" }}
                                                                        >
                                                                            {acct.name}
                                                                        </span>
                                                                        {(acct.apy > 0 ||
                                                                            acct._plaidAccountId ||
                                                                            (acct.notes && !acct._plaidAccountId)) && (
                                                                                <Mono size={10} color={T.text.dim} style={{ display: "block", marginTop: 3 }}>
                                                                                    {[acct.apy > 0 && `${acct.apy}% APY`, acct._plaidAccountId && `⚡ Plaid`]
                                                                                        .filter(Boolean)
                                                                                        .join("  ·  ") || (acct.notes && !acct._plaidAccountId ? acct.notes : "")}
                                                                                </Mono>
                                                                            )}
                                                                    </div>
                                                                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                                                        <Mono
                                                                            size={14}
                                                                            weight={900}
                                                                            color={acct._plaidBalance != null ? T.accent.emerald : T.text.muted}
                                                                        >
                                                                            {acct._plaidBalance != null ? fmt(acct._plaidBalance) : "—"}
                                                                        </Mono>
                                                                        <button
                                                                            onClick={() => startEditBank(acct)}
                                                                            style={{
                                                                                width: 32,
                                                                                height: 32,
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
                                        </div>
                                    </div>
                                </Card>
                            );
                        })}
                    </>
                )}
            </div>
        ) : null;

    return (
        <>
            {checkingSection}
            {savingsSection}
        </>
    );
}
