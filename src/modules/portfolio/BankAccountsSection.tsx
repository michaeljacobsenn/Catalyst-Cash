  import type { Dispatch,SetStateAction } from "react";
  import { useEffect,useMemo,useState } from "react";
  import type { BankAccount } from "../../types/index.js";
  import { ISSUER_COLORS,T } from "../constants.js";
  import { usePortfolio } from "../contexts/PortfolioContext.js";
  import { Check,ChevronDown,DollarSign,Edit3,Landmark } from "../icons";
  import { getConnections } from "../plaid.js";
  import { formatPlaidSyncDateShort } from "../usePlaidSync.js";
  import UiGlyph from "../UiGlyph.js";
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

interface PlaidConnectionLike {
    id?: string;
    _needsReconnect?: boolean;
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
            .then((connections = []) => {
                if (!active) return;
                const nextReconnectIds = new Set(
                    connections
                        .map(connection => connection as PlaidConnectionLike | undefined)
                        .filter(connection => connection?._needsReconnect)
                        .map(connection => connection?.id)
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

    const getInstitutionBadgeLabel = (institution: string) => {
        const normalized = String(institution || "").trim().toLowerCase();
        if (normalized === "american express") return "Amex";
        if (normalized === "citibank online") return "Citi";
        if (normalized === "capital one") return "Cap One";
        return institution;
    };

    const getAccountDisplayName = (acct: BankAccount) => {
        const bank = String(acct.bank || "").trim();
        const name = String(acct.name || "").trim();
        if (!bank || !name) return name || bank || "Account";
        if (name.toLowerCase().startsWith(bank.toLowerCase())) {
            const stripped = name.slice(bank.length).replace(/^[\s\-·]+/, "").trim();
            return stripped || name;
        }
        return name;
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
        const plaidSyncDate = formatPlaidSyncDateShort((acct as BankAccount & { _plaidLastSync?: string | number | null })._plaidLastSync);
        const plannedState = plannedBankBalances[acct.id];
        const metaChips = [
            needsReconnect ? { label: "Reconnect required", tone: "warning" } : null,
            usesManualFallback ? { label: "Manual", tone: "muted" } : null,
        ].filter(Boolean) as Array<{ label: string; tone: "warning" | "muted" | "good" | "info" }>;
        const accentColor = colors.text || colors.accent || sectionColor;
        const isHighBalance = liveBalance > 0;
        const badgeLabel = getInstitutionBadgeLabel(acct.bank);
        const balanceMeta = acct.apy && acct.apy > 0 ? `${acct.apy}% APY` : acct.accountType === "checking" ? "Checking" : "Savings";
        const metaTokens = [
            acct._plaidAccountId && !usesManualFallback ? (plaidSyncDate ? `Sync ${plaidSyncDate}` : "Synced") : null,
            acct._plaidAccountId && !usesManualFallback ? "Linked balance" : null,
            plannedState?.remainingAmount ? `Planned ${fmt(plannedState.projectedBalance || 0)}` : null,
        ].filter(Boolean) as string[];
        return (
            <div
                key={acct.id}
                style={{
                    borderBottom: i === total - 1 ? "none" : `1px solid ${T.border.subtle}40`,
                    position: "relative",
                }}
            >
                {/* Left accent strip */}
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: accentColor, opacity: isHighBalance ? 0.5 : 0.18 }} />
                <div
                    style={{
                        padding: "7px 10px 6px 16px",
                        background: `linear-gradient(90deg, ${accentColor}08 0%, transparent 32%)`,
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
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                        <UiGlyph glyph="⚡" size={11} color={T.accent.primary} />
                                    Plaid-managed balance. This amount stays read-only unless the connection needs reconnecting or you switch back to manual tracking.
                                    </span>
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
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "42px minmax(0, 1fr) auto",
                                columnGap: 7,
                                rowGap: 3,
                                alignItems: "center",
                            }}
                        >
                            <span
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    minHeight: 17,
                                    padding: "0 5px",
                                    borderRadius: 999,
                                    border: `1px solid ${colors.border}`,
                                    background: colors.bg,
                                    fontSize: 7,
                                    fontWeight: 900,
                                    color: colors.text,
                                    fontFamily: T.font.mono,
                                    letterSpacing: "0.08em",
                                    textTransform: "uppercase",
                                    lineHeight: 1,
                                    whiteSpace: "nowrap",
                                    boxShadow: `0 0 14px ${colors.accent}1a, inset 0 1px 0 rgba(255,255,255,0.05)`,
                                    textShadow: `0 0 8px ${colors.accent}14`,
                                }}
                            >
                                {badgeLabel}
                            </span>
                            <div
                                style={{
                                    fontSize: 12.25,
                                    fontWeight: 750,
                                    color: isHighBalance ? T.text.primary : T.text.secondary,
                                    letterSpacing: "-0.01em",
                                    lineHeight: 1.12,
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                }}
                            >
                                {getAccountDisplayName(acct)}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                <div style={{ textAlign: "right", minWidth: 96 }}>
                                    <div style={{ fontSize: 13.5, fontWeight: 850, color: !usesManualFallback && acct._plaidBalance != null ? sectionColor : isHighBalance ? T.text.primary : T.text.muted, fontFamily: T.font.mono, letterSpacing: "-0.01em", lineHeight: 1.08 }}>
                                        {fmt(liveBalance)}
                                    </div>
                                    <div style={{ fontSize: 8.25, color: acct.apy && acct.apy > 0 ? T.accent.emerald : T.text.muted, fontFamily: T.font.mono, marginTop: 1, lineHeight: 1.05, fontWeight: acct.apy && acct.apy > 0 ? 700 : 500 }}>
                                        {balanceMeta}
                                    </div>
                                </div>
                                <button onClick={() => startEditBank(acct)} style={{ width: 22, height: 22, borderRadius: 7, border: `1px solid ${T.border.subtle}`, background: "transparent", color: T.text.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} className="hover-btn"><Edit3 size={10} /></button>
                            </div>
                            <div
                                style={{
                                    gridColumn: "2 / 4",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                    flexWrap: "wrap",
                                    minWidth: 0,
                                    marginTop: 1,
                                }}
                            >
                                {metaChips.map((chip) => (
                                    <span
                                        key={`${acct.id}-${chip.label}`}
                                        style={{
                                            padding: "1px 6px",
                                            borderRadius: 999,
                                            fontSize: 8,
                                            fontWeight: 800,
                                            fontFamily: T.font.mono,
                                            letterSpacing: "0.02em",
                                            border: chip.tone === "warning" ? `1px solid ${T.status.amber}28` : chip.tone === "good" ? `1px solid ${T.accent.emerald}24` : chip.tone === "info" ? `1px solid ${sectionColor}26` : `1px solid ${T.border.subtle}`,
                                            background: chip.tone === "warning" ? `${T.status.amber}12` : chip.tone === "good" ? `${T.accent.emerald}12` : chip.tone === "info" ? `${sectionColor}12` : T.bg.surface,
                                            color: chip.tone === "warning" ? T.status.amber : chip.tone === "good" ? T.accent.emerald : chip.tone === "info" ? sectionColor : T.text.dim,
                                        }}
                                    >
                                        {chip.label}
                                    </span>
                                ))}
                                {metaTokens.map((token) => (
                                    <span
                                        key={`${acct.id}-${token}`}
                                        style={{
                                            fontSize: 8.25,
                                            color: token.startsWith("Planned") ? T.accent.emerald : token.startsWith("Sync ") ? accentColor : T.text.muted,
                                            fontFamily: T.font.mono,
                                            opacity: token.startsWith("Planned") || token.startsWith("Sync ") ? 0.95 : 0.82,
                                            whiteSpace: "nowrap",
                                            lineHeight: 1,
                                        }}
                                    >
                                        {token}
                                    </span>
                                ))}
                                {acct.notes && !acct._plaidAccountId && (
                                    <span style={{ fontSize: 9, color: T.text.muted, fontFamily: T.font.mono, opacity: 0.8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {acct.notes}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                </div>
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

                <div className="collapse-section stagger-container" data-collapsed={String(collapsedSections.bankAccounts)}>
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

                <div className="collapse-section stagger-container" data-collapsed={String(collapsedSections.savingsAccounts)}>
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
