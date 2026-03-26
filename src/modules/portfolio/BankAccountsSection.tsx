  import type { Dispatch,SetStateAction } from "react";
  import { useEffect,useMemo,useState } from "react";
  import type { BankAccount } from "../../types/index.js";
  import { Mono } from "../components.js";
  import { ISSUER_COLORS,T } from "../constants.js";
  import { usePortfolio } from "../contexts/PortfolioContext.js";
  import { Check,ChevronDown,DollarSign,Edit3,Landmark } from "../icons";
  import { getConnections } from "../plaid.js";
  import { Badge } from "../ui.js";
  import { fmt } from "../utils.js";
  import type { PortfolioCollapsedSections } from "./types.js";

interface EditBankForm {
    bank: string;
    accountType: string;
    name: string;
    balance: string;
    apy: string;
    notes: string;
}

interface BankAccountsSectionProps {
    collapsedSections?: PortfolioCollapsedSections;
    setCollapsedSections?: Dispatch<SetStateAction<PortfolioCollapsedSections>>;
    plannedBankBalances?: Record<string, {
        projectedBalance?: number | null;
        remainingAmount?: number | null;
        moveCount?: number;
    }>;
}

export default function BankAccountsSection({
    collapsedSections: propCollapsed,
    setCollapsedSections: propSetCollapsed,
    plannedBankBalances = {},
}: BankAccountsSectionProps) {
    const { bankAccounts, setBankAccounts } = usePortfolio();

    const [internalCollapsed, internalSetCollapsed] = useState<PortfolioCollapsedSections>({});
    const collapsedSections = propCollapsed || internalCollapsed;
    const setCollapsedSections = propSetCollapsed || internalSetCollapsed;
    const [editingBank, setEditingBank] = useState<string | null>(null);
    const [editBankForm, setEditBankForm] = useState<EditBankForm>({ bank: "", accountType: "", name: "", balance: "", apy: "", notes: "" });
    const [reconnectConnectionIds, setReconnectConnectionIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        let active = true;
        getConnections()
            .then(connections => {
                if (!active) return;
                const nextReconnectIds = new Set(
                    (connections || [])
                        .filter(connection => connection?._needsReconnect)
                        .map(connection => connection.id)
                        .filter(Boolean)
                );
                setReconnectConnectionIds(new Set<string>(Array.from(nextReconnectIds) as string[]));
            })
            .catch(() => { });
        return () => {
            active = false;
        };
    }, [bankAccounts]);

    const removeBankAccount = (id: string) => {
        setBankAccounts(bankAccounts.filter(a => a.id !== id));
    };

    const startEditBank = (acct: BankAccount) => {
        const needsReconnect = !!(acct._plaidConnectionId && reconnectConnectionIds.has(acct._plaidConnectionId));
        const usesManualFallback = !!acct._plaidManualFallback || needsReconnect;
        setEditingBank(acct.id);
        setEditBankForm({
            bank: acct.bank,
            accountType: acct.accountType,
            name: acct.name,
            balance: String(usesManualFallback ? (acct.balance ?? "") : (acct._plaidBalance ?? acct.balance ?? "")),
            apy: String(acct.apy || ""),
            notes: acct.notes || "",
        });
    };

    const saveEditBank = (id: string) => {
        setBankAccounts(
            bankAccounts.map(a =>
                a.id === id
                    ? {
                        ...a,
                        bank: editBankForm.bank || a.bank,
                        accountType: editBankForm.accountType || a.accountType,
                        name: (editBankForm.name || "").trim() || a.name,
                        balance: editBankForm.balance === "" ? null : parseFloat(editBankForm.balance) || 0,
                        apy: editBankForm.apy === "" ? null : parseFloat(editBankForm.apy) || null,
                        notes: editBankForm.notes,
                    }
                    : a
            )
        );
        setEditingBank(null);
    };

    const ic = (inst: string) =>
        ISSUER_COLORS[inst as keyof typeof ISSUER_COLORS] || {
            bg: "rgba(110,118,129,0.08)",
            border: "rgba(110,118,129,0.15)",
            text: T.text.secondary,
            accent: T.text.dim,
        };

    const checkingAccounts = useMemo(() =>
        bankAccounts
            .filter(a => a.accountType === "checking")
            .sort((a, b) => {
                const instCmp = (a.bank || "").localeCompare(b.bank || "");
                return instCmp !== 0 ? instCmp : (a.name || "").localeCompare(b.name || "");
            }),
    [bankAccounts]);

    const savingsAccounts = useMemo(() =>
        bankAccounts
            .filter(a => a.accountType === "savings")
            .sort((a, b) => {
                const instCmp = (a.bank || "").localeCompare(b.bank || "");
                return instCmp !== 0 ? instCmp : (a.name || "").localeCompare(b.name || "");
            }),
    [bankAccounts]);

    if (bankAccounts.length === 0) return null;

    const renderAccountRow = (acct: BankAccount, i: number, total: number, sectionColor: string) => {
        const colors = ic(acct.bank);
        const needsReconnect = !!(acct._plaidConnectionId && reconnectConnectionIds.has(acct._plaidConnectionId));
        const usesManualFallback = !!acct._plaidManualFallback || needsReconnect;
        const liveBalance = !usesManualFallback && acct._plaidBalance != null ? acct._plaidBalance : Number(acct.balance || 0);
        const plannedState = plannedBankBalances[acct.id];
        return (
            <div
                key={acct.id}
                style={{
                    padding: "10px 16px",
                    borderBottom: i === total - 1 ? "none" : `1px solid ${T.border.subtle}`,
                }}
            >
                {editingBank === acct.id ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <input
                            value={editBankForm.bank}
                            onChange={e => setEditBankForm(p => ({ ...p, bank: e.target.value }))}
                            placeholder="Institution (e.g. Chase)"
                            aria-label="Institution name"
                            style={{ width: "100%", fontSize: 13, padding: "8px 10px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, outline: "none", boxSizing: "border-box" }}
                        />
                        <input
                            value={editBankForm.name}
                            onChange={e => setEditBankForm(p => ({ ...p, name: e.target.value }))}
                            placeholder="Account name"
                            aria-label="Account name"
                            style={{ width: "100%", fontSize: 13, padding: "8px 10px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, outline: "none", boxSizing: "border-box" }}
                        />
                        {usesManualFallback ? (
                            <div style={{ position: "relative" }}>
                                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 12, fontWeight: 600 }}>$</span>
                                <input type="number" inputMode="decimal" step="0.01" value={editBankForm.balance} onChange={e => setEditBankForm(p => ({ ...p, balance: e.target.value }))} placeholder="Current balance" aria-label="Current account balance" style={{ width: "100%", padding: "8px 10px 8px 22px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontFamily: T.font.mono, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                            </div>
                        ) : (
                            <div style={{ padding: "8px 10px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.dim, fontSize: 11, lineHeight: 1.5 }}>
                                ⚡ Live Plaid balance active. Manual balance edits unlock if this connection is lost or disconnected.
                            </div>
                        )}
                        <div style={{ display: "flex", gap: 8 }}>
                            <div style={{ flex: 0.4, position: "relative" }}>
                                <input type="number" inputMode="decimal" step="0.01" value={editBankForm.apy} onChange={e => setEditBankForm(p => ({ ...p, apy: e.target.value }))} placeholder="APY" aria-label="APY percentage" style={{ width: "100%", padding: "8px 24px 8px 10px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontFamily: T.font.mono, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                                <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 12 }}>%</span>
                            </div>
                            <input value={editBankForm.notes} onChange={e => setEditBankForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes" aria-label="Account notes" style={{ flex: 1, fontSize: 13, padding: "8px 10px", borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, outline: "none", boxSizing: "border-box" }} />
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); saveEditBank(acct.id); }} style={{ flex: 1, padding: 8, borderRadius: T.radius.sm, border: "none", background: `${sectionColor}18`, color: sectionColor, fontSize: 11, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Check size={14} /> Save</button>
                            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (window.confirm(`Delete "${acct.name}"?`)) removeBankAccount(acct.id); }} style={{ flex: 1, padding: 8, borderRadius: T.radius.sm, border: "none", background: T.status.redDim, color: T.status.red, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>Delete</button>
                            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingBank(null); }} style={{ flex: 1, padding: 8, borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: "transparent", color: T.text.dim, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Cancel</button>
                        </div>
                    </div>
                ) : (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                <span style={{ fontSize: 12, fontWeight: 800, color: colors.text || colors.accent }}>{acct.bank}</span>
                                <span style={{ fontSize: 10, color: T.text.dim }}>·</span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: T.text.primary }}>{(() => {
                                    const name = acct.name || "";
                                    const inst = acct.bank || "";
                                    if (inst && name.toLowerCase().startsWith(inst.toLowerCase())) {
                                        const stripped = name.slice(inst.length).replace(/^[\s\-·]+/, "").trim();
                                        return stripped || name;
                                    }
                                    return name;
                                })()}</span>
                            </div>
                            {((acct.apy ?? 0) > 0 || acct._plaidAccountId || (acct.notes && !acct._plaidAccountId)) && (
                                <Mono size={10} color={T.text.dim} style={{ display: "block" }}>
                                    {[
                                        needsReconnect && "Reconnect required",
                                        usesManualFallback && "Manual balance",
                                        (acct.apy ?? 0) > 0 && `${acct.apy}% APY`,
                                        acct._plaidAccountId && !usesManualFallback && `⚡ Plaid`,
                                    ].filter(Boolean).join("  ·  ") || (acct.notes && !acct._plaidAccountId ? acct.notes : "")}
                                </Mono>
                            )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                                <Mono size={13} weight={800} color={!usesManualFallback && acct._plaidBalance != null ? sectionColor : T.text.muted}>{fmt(liveBalance)}</Mono>
                                {plannedState?.remainingAmount ? (
                                    <div
                                        style={{
                                            padding: "3px 7px",
                                            borderRadius: 999,
                                            background: `${T.accent.emerald}12`,
                                            border: `1px solid ${T.accent.emerald}1f`,
                                            maxWidth: 128,
                                            textAlign: "right",
                                        }}
                                    >
                                        <Mono size={9} weight={800} color={T.accent.emerald}>Planned {fmt(plannedState.projectedBalance || 0)}</Mono>
                                    </div>
                                ) : null}
                            </div>
                            <button onClick={() => startEditBank(acct)} style={{ width: 28, height: 28, borderRadius: T.radius.md, border: "none", background: "transparent", color: T.text.dim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} className="hover-btn"><Edit3 size={11} /></button>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const checkingSection =
        checkingAccounts.length > 0 ? (
        <div style={{ paddingBottom: 16 }}>
            <div
                style={{
                    padding: 0,
                    overflow: "hidden",
                    border: `1px solid ${T.border.subtle}`,
                    borderRadius: 16,
                    background: "transparent"
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
                                color: T.status.blue,
                                borderColor: `${T.status.blue}40`,
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
                    {checkingAccounts.map((acct, i) => renderAccountRow(acct, i, checkingAccounts.length, T.status.blue))}
                </div>
            </div>
        </div>
        ) : null;

    const savingsSection =
        savingsAccounts.length > 0 ? (
        <div style={{ paddingBottom: 16 }}>
            <div
                style={{
                    padding: 0,
                    overflow: "hidden",
                    border: `1px solid ${T.border.subtle}`,
                    borderRadius: 16,
                    background: "transparent",
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
                                color: T.accent.emerald,
                                borderColor: `${T.accent.emerald}40`,
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
                    {savingsAccounts.map((acct, i) => renderAccountRow(acct, i, savingsAccounts.length, T.accent.emerald))}
                </div>
            </div>
        </div>
        ) : null;

    return (
        <>
            {checkingSection}
            {savingsSection}
        </>
    );
}
