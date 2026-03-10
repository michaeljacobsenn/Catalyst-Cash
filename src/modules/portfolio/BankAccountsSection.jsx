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
        <div style={{ paddingBottom: 16 }}>
            <Card
                animate
                variant="glass"
                style={{
                    padding: 0,
                    overflow: "hidden",
                    borderLeft: `3px solid ${T.status.blue}`,
                }}
            >
                <div
                    onClick={() => setCollapsedSections(p => ({ ...p, bankAccounts: !p.bankAccounts }))}
                    style={{
                        padding: "16px 20px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                        background: `linear-gradient(90deg, ${T.status.blue}08, transparent)`,
                        borderBottom: collapsedSections.bankAccounts ? "none" : `1px solid ${T.border.subtle}`,
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
                        <h2 style={{ fontSize: 16, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>
                            Checking
                        </h2>
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
                    </div>
                    <ChevronDown
                        size={16}
                        color={T.text.muted}
                        className="chevron-animated"
                        data-open={String(!collapsedSections.bankAccounts)}
                    />
                </div>

                <div className="collapse-section" data-collapsed={String(collapsedSections.bankAccounts)}>
                    {groupedChecking.length === 0 ? (
                        <div style={{ padding: "16px", textAlign: "center" }}>
                            <p style={{ fontSize: 11, color: T.text.muted }}>No checking accounts yet</p>
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column" }}>
                            {groupedChecking.map(([bank, accts], bIndex) => {
                                const isCollapsed = collapsedBanks[`checking-${bank}`];
                                return (
                                    <div
                                        key={`c-${bank}`}
                                        style={{
                                            borderBottom: bIndex === groupedChecking.length - 1 ? "none" : `1px solid ${T.border.subtle}`,
                                        }}
                                    >
                                        <div
                                            onClick={() => setCollapsedBanks(p => ({ ...p, [`checking-${bank}`]: !isCollapsed }))}
                                            style={{
                                                padding: "12px 20px",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                cursor: "pointer",
                                                background: "transparent",
                                                transition: "background 0.2s",
                                            }}
                                            className="hover-bg"
                                        >
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <Building2 size={12} color={T.text.muted} />
                                                <span
                                                    style={{
                                                        fontSize: 12,
                                                        fontWeight: 700,
                                                        color: T.text.primary,
                                                    }}
                                                >
                                                    {bank}
                                                </span>
                                                <span style={{ fontSize: 10, color: T.text.dim }}>({accts.length})</span>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <Mono size={12} weight={700} color={T.status.blue}>
                                                    {fmt(accts.reduce((sum, a) => sum + (a._plaidBalance || 0), 0))}
                                                </Mono>
                                                <ChevronDown
                                                    size={14}
                                                    color={T.text.dim}
                                                    className="chevron-animated"
                                                    data-open={String(!isCollapsed)}
                                                />
                                            </div>
                                        </div>

                                        <div className="collapse-section" data-collapsed={String(isCollapsed)}>
                                            <div style={{ padding: "0 8px 8px 8px" }}>
                                                {accts
                                                    .sort((a, b) => a.name.localeCompare(b.name))
                                                    .map((acct, i) => (
                                                        <div
                                                            key={acct.id}
                                                            style={{ padding: "8px 12px", background: T.bg.glass, borderRadius: T.radius.md, marginBottom: i === accts.length - 1 ? 0 : 4 }}
                                                        >
                                                            {editingBank === acct.id ? (
                                                                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                                                    <input
                                                                        value={editBankForm.name}
                                                                        onChange={e => setEditBankForm(p => ({ ...p, name: e.target.value }))}
                                                                        placeholder="Account name"
                                                                        aria-label="Account name"
                                                                        style={{ width: "100%", fontSize: 13, padding: "8px 10px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, outline: "none", boxSizing: "border-box" }}
                                                                    />
                                                                    <div style={{ display: "flex", gap: 8 }}>
                                                                        <div style={{ flex: 0.4, position: "relative" }}>
                                                                            <input type="number" inputMode="decimal" step="0.01" value={editBankForm.apy} onChange={e => setEditBankForm(p => ({ ...p, apy: e.target.value }))} placeholder="APY" aria-label="APY percentage" style={{ width: "100%", padding: "8px 24px 8px 10px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontFamily: T.font.mono, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                                                                            <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 12 }}>%</span>
                                                                        </div>
                                                                        <input value={editBankForm.notes} onChange={e => setEditBankForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes" aria-label="Account notes" style={{ flex: 1, fontSize: 13, padding: "8px 10px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, outline: "none", boxSizing: "border-box" }} />
                                                                    </div>
                                                                    <div style={{ display: "flex", gap: 8 }}>
                                                                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); saveEditBank(acct.id); }} style={{ flex: 1, padding: 8, borderRadius: T.radius.sm, border: "none", background: `${T.status.blue}18`, color: T.status.blue, fontSize: 11, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Check size={14} /> Save</button>
                                                                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (window.confirm(`Delete "${acct.name}"?`)) removeBankAccount(acct.id); }} style={{ flex: 1, padding: 8, borderRadius: T.radius.sm, border: "none", background: T.status.redDim, color: T.status.red, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>Delete</button>
                                                                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingBank(null); }} style={{ flex: 1, padding: 8, borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: "transparent", color: T.text.dim, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Cancel</button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                                        <span style={{ fontSize: 13, fontWeight: 600, color: T.text.primary, display: "block" }}>{acct.name}</span>
                                                                        {(acct.apy > 0 || acct._plaidAccountId || (acct.notes && !acct._plaidAccountId)) && (
                                                                            <Mono size={10} color={T.text.dim} style={{ display: "block", marginTop: 3 }}>
                                                                                {[acct.apy > 0 && `${acct.apy}% APY`, acct._plaidAccountId && `⚡ Plaid`].filter(Boolean).join("  ·  ") || (acct.notes && !acct._plaidAccountId ? acct.notes : "")}
                                                                            </Mono>
                                                                        )}
                                                                    </div>
                                                                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                                                        <Mono size={13} weight={800} color={acct._plaidBalance != null ? T.status.blue : T.text.muted}>{acct._plaidBalance != null ? fmt(acct._plaidBalance) : "—"}</Mono>
                                                                        <button onClick={() => startEditBank(acct)} style={{ width: 28, height: 28, borderRadius: T.radius.md, border: "none", background: "transparent", color: T.text.dim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} className="hover-btn"><Edit3 size={11} /></button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </Card>
        </div>
        ) : null;

    const savingsSection =
        savingsAccounts.length > 0 ? (
        <div style={{ paddingBottom: 16 }}>
            <Card
                animate
                variant="glass"
                style={{
                    padding: 0,
                    overflow: "hidden",
                    borderLeft: `3px solid ${T.accent.emerald}`,
                }}
            >
                <div
                    onClick={() => setCollapsedSections(p => ({ ...p, savingsAccounts: !p.savingsAccounts }))}
                    style={{
                        padding: "16px 20px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                        background: `linear-gradient(90deg, ${T.accent.emerald}08, transparent)`,
                        borderBottom: collapsedSections.savingsAccounts ? "none" : `1px solid ${T.border.subtle}`,
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
                        <h2 style={{ fontSize: 16, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>
                            Savings
                        </h2>
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
                    </div>
                    <ChevronDown
                        size={16}
                        color={T.text.muted}
                        className="chevron-animated"
                        data-open={String(!collapsedSections.savingsAccounts)}
                    />
                </div>

                <div className="collapse-section" data-collapsed={String(collapsedSections.savingsAccounts)}>
                    {groupedSavings.length === 0 ? (
                        <div style={{ padding: "16px", textAlign: "center" }}>
                            <p style={{ fontSize: 11, color: T.text.muted }}>No savings accounts yet</p>
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column" }}>
                            {groupedSavings.map(([bank, accts], bIndex) => {
                                const isCollapsed = collapsedBanks[`savings-${bank}`];
                                return (
                                    <div
                                        key={`s-${bank}`}
                                        style={{
                                            borderBottom: bIndex === groupedSavings.length - 1 ? "none" : `1px solid ${T.border.subtle}`,
                                        }}
                                    >
                                        <div
                                            onClick={() => setCollapsedBanks(p => ({ ...p, [`savings-${bank}`]: !isCollapsed }))}
                                            style={{
                                                padding: "12px 20px",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                cursor: "pointer",
                                                background: "transparent",
                                                transition: "background 0.2s",
                                            }}
                                            className="hover-bg"
                                        >
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <Building2 size={12} color={T.text.muted} />
                                                <span
                                                    style={{
                                                        fontSize: 12,
                                                        fontWeight: 700,
                                                        color: T.text.primary,
                                                    }}
                                                >
                                                    {bank}
                                                </span>
                                                <span style={{ fontSize: 10, color: T.text.dim }}>({accts.length})</span>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <Mono size={12} weight={700} color={T.accent.emerald}>
                                                    {fmt(accts.reduce((sum, a) => sum + (a._plaidBalance || 0), 0))}
                                                </Mono>
                                                <ChevronDown
                                                    size={14}
                                                    color={T.text.dim}
                                                    className="chevron-animated"
                                                    data-open={String(!isCollapsed)}
                                                />
                                            </div>
                                        </div>

                                        <div className="collapse-section" data-collapsed={String(isCollapsed)}>
                                            <div style={{ padding: "0 8px 8px 8px" }}>
                                                {accts
                                                    .sort((a, b) => a.name.localeCompare(b.name))
                                                    .map((acct, i) => (
                                                        <div
                                                            key={acct.id}
                                                            style={{ padding: "8px 12px", background: T.bg.glass, borderRadius: T.radius.md, marginBottom: i === accts.length - 1 ? 0 : 4 }}
                                                        >
                                                            {editingBank === acct.id ? (
                                                                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                                                    <input
                                                                        value={editBankForm.name}
                                                                        onChange={e => setEditBankForm(p => ({ ...p, name: e.target.value }))}
                                                                        placeholder="Account name"
                                                                        aria-label="Account name"
                                                                        style={{ width: "100%", fontSize: 13, padding: "8px 10px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, outline: "none", boxSizing: "border-box" }}
                                                                    />
                                                                    <div style={{ display: "flex", gap: 8 }}>
                                                                        <div style={{ flex: 0.4, position: "relative" }}>
                                                                            <input type="number" inputMode="decimal" step="0.01" value={editBankForm.apy} onChange={e => setEditBankForm(p => ({ ...p, apy: e.target.value }))} placeholder="APY" aria-label="APY percentage" style={{ width: "100%", padding: "8px 24px 8px 10px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontFamily: T.font.mono, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                                                                            <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 12 }}>%</span>
                                                                        </div>
                                                                        <input value={editBankForm.notes} onChange={e => setEditBankForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes" aria-label="Account notes" style={{ flex: 1, fontSize: 13, padding: "8px 10px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, outline: "none", boxSizing: "border-box" }} />
                                                                    </div>
                                                                    <div style={{ display: "flex", gap: 8 }}>
                                                                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); saveEditBank(acct.id); }} style={{ flex: 1, padding: 8, borderRadius: T.radius.sm, border: "none", background: `${T.accent.emerald || "#10B981"}18`, color: T.accent.emerald || "#10B981", fontSize: 11, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Check size={14} /> Save</button>
                                                                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (window.confirm(`Delete "${acct.name}"?`)) removeBankAccount(acct.id); }} style={{ flex: 1, padding: 8, borderRadius: T.radius.sm, border: "none", background: T.status.redDim, color: T.status.red, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>Delete</button>
                                                                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingBank(null); }} style={{ flex: 1, padding: 8, borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: "transparent", color: T.text.dim, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Cancel</button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                                        <span style={{ fontSize: 13, fontWeight: 600, color: T.text.primary, display: "block" }}>{acct.name}</span>
                                                                        {(acct.apy > 0 || acct._plaidAccountId || (acct.notes && !acct._plaidAccountId)) && (
                                                                            <Mono size={10} color={T.text.dim} style={{ display: "block", marginTop: 3 }}>
                                                                                {[acct.apy > 0 && `${acct.apy}% APY`, acct._plaidAccountId && `⚡ Plaid`].filter(Boolean).join("  ·  ") || (acct.notes && !acct._plaidAccountId ? acct.notes : "")}
                                                                            </Mono>
                                                                        )}
                                                                    </div>
                                                                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                                                        <Mono size={13} weight={800} color={acct._plaidBalance != null ? T.accent.emerald : T.text.muted}>{acct._plaidBalance != null ? fmt(acct._plaidBalance) : "—"}</Mono>
                                                                        <button onClick={() => startEditBank(acct)} style={{ width: 28, height: 28, borderRadius: T.radius.md, border: "none", background: "transparent", color: T.text.dim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} className="hover-btn"><Edit3 size={11} /></button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </Card>
        </div>
        ) : null;

    return (
        <>
            {checkingSection}
            {savingsSection}
        </>
    );
}

