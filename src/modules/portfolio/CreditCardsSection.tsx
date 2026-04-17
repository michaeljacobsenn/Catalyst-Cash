  import type { Dispatch,SetStateAction } from "react";
  import { useEffect,useMemo,useState } from "react";
  import type { Card as CardRecord } from "../../types/index.js";
  import SearchableSelect from "../SearchableSelect.js";
  import { INSTITUTIONS,ISSUER_COLORS,T } from "../constants.js";
  import { usePortfolio } from "../contexts/PortfolioContext.js";
  import { haptic } from "../haptics.js";
  import { Check,CheckCircle2,ChevronDown,CreditCard,Edit3 } from "../icons";
  import { getIssuerCards,getPinnedForIssuer } from "../issuerCards.js";
  import { getConnections } from "../plaid.js";
  import { formatPlaidSyncDateShort } from "../usePlaidSync.js";
  import UiGlyph from "../UiGlyph.js";
  import { Badge } from "../ui.js";
  import { fmt } from "../utils.js";
  import type { PortfolioCollapsedSections } from "./types.js";

interface EditCardForm {
    institution: string;
    name: string;
    balance: string;
    limit: string;
    annualFee: string;
    annualFeeDue: string;
    annualFeeWaived: boolean;
    notes: string;
    apr: string;
    nickname: string;
    hasPromoApr: boolean;
    promoAprAmount: string;
    promoAprExp: string;
    statementCloseDay: string;
    paymentDueDay: string;
    minPayment: string;
}

interface CreditCardsSectionProps {
    collapsedSections?: PortfolioCollapsedSections;
    setCollapsedSections?: Dispatch<SetStateAction<PortfolioCollapsedSections>>;
    plannedCardBalances?: Record<string, {
        projectedBalance?: number | null;
        remainingAmount?: number | null;
        moveCount?: number;
    }>;
}

interface PlaidConnectionLike {
    id?: string;
    _needsReconnect?: boolean;
}

export default function CreditCardsSection({
    collapsedSections: propCollapsed,
    setCollapsedSections: propSetCollapsed,
    plannedCardBalances = {},
}: CreditCardsSectionProps) {
    const { cards, setCards, cardCatalog } = usePortfolio();

    const [internalCollapsed, internalSetCollapsed] = useState({ creditCards: false });
    const collapsedSections = propCollapsed || internalCollapsed;
    const setCollapsedSections = propSetCollapsed || internalSetCollapsed;
    const [editingCard, setEditingCard] = useState<string | null>(null);
    const [editStep, setEditStep] = useState(0);
    const [reconnectConnectionIds, setReconnectConnectionIds] = useState<Set<string>>(new Set());
    const [editForm, setEditForm] = useState<EditCardForm>({
        institution: "",
        name: "",
        balance: "",
        limit: "",
        annualFee: "",
        annualFeeDue: "",
        annualFeeWaived: false,
        notes: "",
        apr: "",
        nickname: "",
        hasPromoApr: false,
        promoAprAmount: "",
        promoAprExp: "",
        statementCloseDay: "",
        paymentDueDay: "",
        minPayment: "",
    });

    const sortedCards = useMemo(() =>
        [...cards].sort((a, b) => {
            const instCmp = (a.institution || "").localeCompare(b.institution || "");
            return instCmp !== 0 ? instCmp : (a.name || "").localeCompare(b.name || "");
        }),
    [cards]);

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
    }, [cards]);

    const startEdit = (card: CardRecord) => {
        const needsReconnect = !!(card._plaidConnectionId && reconnectConnectionIds.has(card._plaidConnectionId));
        const usesManualFallback = !!card._plaidManualFallback || needsReconnect;
        const visibleBalance = !usesManualFallback && card._plaidBalance != null
            ? card._plaidBalance
            : Number(card.balance || 0);
        setEditingCard(card.id);
        setEditStep(0);
        setEditForm({
            institution: card.institution || "",
            name: card.name || "",
            balance: visibleBalance != null ? String(visibleBalance) : String(card.balance || ""),
            limit: String(card.limit || ""),
            annualFee: String(card.annualFee || ""),
            annualFeeDue: card.annualFeeDue || "",
            annualFeeWaived: !!card.annualFeeWaived,
            notes: card.notes || "",
            apr: String(card.apr || ""),
            nickname: card.nickname || "",
            hasPromoApr: !!card.hasPromoApr,
            promoAprAmount: String(card.promoAprAmount || ""),
            promoAprExp: card.promoAprExp || "",
            statementCloseDay: String(card.statementCloseDay || ""),
            paymentDueDay: String(card.paymentDueDay || ""),
            minPayment: String(card.minPayment || ""),
        });
    };

    const saveEdit = (cardId: string) => {
        setCards(
            cards.map(c =>
                c.id === cardId
                    ? {
                        ...c,
                        institution: editForm.institution || c.institution,
                        name: (editForm.name || "").trim() || c.name,
                        balance: editForm.balance === "" ? null : parseFloat(editForm.balance) || 0,
                        limit: editForm.limit === "" ? null : parseFloat(editForm.limit) || null,
                        annualFee: editForm.annualFee === "" ? null : parseFloat(editForm.annualFee) || null,
                        ...(editForm.annualFeeDue ? { annualFeeDue: editForm.annualFeeDue } : {}),
                        annualFeeWaived: editForm.annualFeeWaived,
                        ...(editForm.notes ? { notes: editForm.notes } : {}),
                        apr: editForm.apr === "" ? null : parseFloat(editForm.apr) || null,
                        ...(editForm.nickname ? { nickname: editForm.nickname } : {}),
                        hasPromoApr: editForm.hasPromoApr,
                        promoAprAmount: editForm.promoAprAmount === "" ? null : parseFloat(editForm.promoAprAmount) || null,
                        ...(editForm.promoAprExp ? { promoAprExp: editForm.promoAprExp } : {}),
                        statementCloseDay: editForm.statementCloseDay === "" ? null : parseInt(editForm.statementCloseDay) || null,
                        paymentDueDay: editForm.paymentDueDay === "" ? null : parseInt(editForm.paymentDueDay) || null,
                        minPayment: editForm.minPayment === "" ? null : parseFloat(editForm.minPayment) || null,
                    }
                    : c
            )
        );
        setEditingCard(null);
    };

    const removeCard = (cardId: string) => {
        const card = cards.find(c => c.id === cardId);
        if (card?._plaidAccountId) {
            if (!window.confirm(
                `"${card.nickname || card.name}" is linked to Plaid. Deleting it will remove it from balance tracking.\n\nTo fully disconnect, go to Settings → Plaid.\n\nDelete anyway?`
            )) return;
        }
        setCards(cards.filter(c => c.id !== cardId));
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

    const getCardDisplayName = (card: CardRecord) => {
        const nickname = (card.nickname || "").trim();
        if (nickname) return nickname;

        const stripped = (card.name || "")
            .replace(new RegExp(`^${card.institution}\\s*`, "i"), "")
            .replace(/ from American Express$/i, "")
            .replace(/ American Express Card$/i, "")
            .trim();

        const isGeneric = !stripped || /^(credit card|card)$/i.test(stripped);
        if (!isGeneric) {
            return stripped.replace(/\s+/g, " ").trim();
        }

        const last4 =
            String(card.last4 || card.mask || "").trim() ||
            ((card.notes || "").match(/···(\d{3,4})/)?.[1] || "");
        if (last4) return `Card •••${last4}`;

        const dupes = sortedCards.filter((c) => c.institution === card.institution && /^(credit card|card)$/i.test((c.name || "").trim()));
        const index = dupes.findIndex((c) => c.id === card.id);
        return index >= 0 ? `Card ${index + 1}` : "Card";
    };

    const WaivedCheckbox = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "10px 0" }}>
            <div
                style={{
                    width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                    border: checked ? "none" : `2px solid ${T.text.dim}`,
                    background: checked ? T.accent.primary : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all .2s",
                }}
                onClick={onChange}
            >
                {checked && <Check size={12} color={T.bg.base} strokeWidth={3} />}
            </div>
            <span style={{ fontSize: 12, color: T.text.secondary }}>
                Waived? <span style={{ fontSize: 10, color: T.text.dim }}>(first year free)</span>
            </span>
        </label>
    );

    const PromoCheckbox = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "10px 0" }}>
            <div
                style={{
                    width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                    border: checked ? "none" : `2px solid ${T.text.dim}`,
                    background: checked ? T.accent.emerald : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all .2s",
                }}
                onClick={onChange}
            >
                {checked && <Check size={12} color={T.bg.base} strokeWidth={3} />}
            </div>
            <span style={{ fontSize: 12, color: T.text.secondary }}>Active Promo APR?</span>
        </label>
    );

    if (cards.length === 0) return null;

    return (
        <div
            style={{
                marginBottom: 16, padding: 0, overflow: "hidden",
                border: `1px solid ${T.border.subtle}`, borderRadius: 16, background: "transparent",
            }}
        >
            <div
                onClick={() => setCollapsedSections(p => ({ ...p, creditCards: !p.creditCards }))}
                className="hover-card"
                style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "16px 20px", cursor: "pointer",
                    background: `linear-gradient(90deg, ${T.accent.primary}08, transparent)`,
                    borderBottom: collapsedSections.creditCards ? "none" : `1px solid ${T.border.subtle}`,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: `${T.accent.primary}1A`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 12px ${T.accent.primary}10` }}>
                        <CreditCard size={14} color={T.accent.primary} />
                    </div>
                    <h2 style={{ fontSize: 16, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>Credit Cards</h2>
                    <Badge variant="outline" style={{ fontSize: 10, color: cards.length > 0 ? T.accent.primary : T.text.muted, borderColor: cards.length > 0 ? `${T.accent.primary}40` : T.border.default }}>{cards.length}</Badge>
                </div>
                <ChevronDown size={16} color={T.text.muted} className="chevron-animated" data-open={String(!collapsedSections.creditCards)} />
            </div>

            <div className="collapse-section" data-collapsed={String(collapsedSections.creditCards)}>
                {sortedCards.length === 0 ? (
                    <div style={{ padding: "16px", textAlign: "center" }}>
                        <p style={{ fontSize: 11, color: T.text.muted }}>No credit cards yet — tap Add Account to get started.</p>
                    </div>
                ) : (
                    <div className="stagger-container" style={{ padding: "0", display: "flex", flexDirection: "column", gap: 0 }}>
                        {sortedCards.map((card) => {
                            const colors = ic(card.institution);
                            const needsReconnect = !!(card._plaidConnectionId && reconnectConnectionIds.has(card._plaidConnectionId));
                            const usesManualFallback = !!card._plaidManualFallback || needsReconnect;
                            const visibleBalance = !usesManualFallback && card._plaidBalance != null
                                ? card._plaidBalance
                                : Number(card.balance || 0);
                            const plannedState = plannedCardBalances[card.id];
                            const annualFee = typeof card.annualFee === "number" ? card.annualFee : Number(card.annualFee || 0);
                            const apr = card.apr ?? 0;
                            const limit = card.limit ?? 0;
                            const plaidSyncDate = formatPlaidSyncDateShort((card as CardRecord & { _plaidLastSync?: string | number | null })._plaidLastSync);
                            const utilization = limit > 0 ? Math.max(0, (visibleBalance / limit) * 100) : null;
                            const statusChips = [
                                needsReconnect ? { label: "Reconnect required", tone: "warning" } : null,
                                usesManualFallback ? { label: "Manual", tone: "muted" } : null,
                            ].filter(Boolean) as Array<{ label: string; tone: "warning" | "muted" | "good" | "danger" }>;
                            const metaTokens = [
                                !usesManualFallback && card._plaidBalance != null ? (plaidSyncDate ? `Sync ${plaidSyncDate}` : "Synced") : null,
                                card.paymentDueDay ? `Due ${card.paymentDueDay}` : null,
                                apr > 0 ? `${apr}% APR` : null,
                                annualFee > 0 ? (card.annualFeeWaived ? "AF waived" : `${fmt(annualFee)} fee`) : null,
                                !usesManualFallback && card._plaidBalance != null ? `•••${(card.notes || "").match(/···(\d+)/)?.[1] || "Plaid"}` : null,
                            ].filter(Boolean) as string[];
                            const isZeroBalance = Math.abs(visibleBalance) < 0.01;
                            const accentColor = colors.text || T.accent.primary;
                            const balanceColor = visibleBalance > 0.009 ? T.status.red : visibleBalance < -0.009 ? T.accent.emerald : isZeroBalance ? T.text.muted : T.text.primary;
                            const utilizationColor =
                                utilization == null
                                    ? T.text.dim
                                    : utilization >= 50
                                        ? T.status.red
                                        : utilization >= 30
                                            ? T.status.amber
                                            : T.accent.emerald;
                            const issuerLabel = getInstitutionBadgeLabel(card.institution);
                            return (
                                <div
                                    key={card.id}
                                    style={{
                                        borderBottom: `1px solid ${T.border.subtle}40`,
                                        transition: "opacity 0.2s",
                                        position: "relative",
                                    }}
                                >
                                    {/* Left accent strip */}
                                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: accentColor, opacity: isZeroBalance ? 0.18 : 0.5, borderRadius: "0 0 0 0" }} />
                                    <div
                                        style={{
                                            padding: "8px 10px 7px 16px",
                                            background: `linear-gradient(90deg, ${accentColor}08 0%, transparent 32%)`,
                                        }}
                                    >
                                    {editingCard === card.id ? (
                                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                            {(() => {
                                                const tabs = [
                                                    { label: "Card", filled: !!(editForm.institution || editForm.name || editForm.limit || editForm.balance) },
                                                    { label: "Rates", filled: !!(editForm.annualFee || editForm.apr) },
                                                    { label: "Billing", filled: !!(editForm.paymentDueDay || editForm.statementCloseDay || editForm.minPayment) },
                                                ];
                                                return (
                                                    <div style={{ display: "flex", borderRadius: T.radius.md, background: T.bg.elevated, border: `1px solid ${T.border.default}`, padding: 2, position: "relative" }}>
                                                        <div style={{ position: "absolute", top: 2, left: `calc(${editStep * 33.33}% + 2px)`, width: "calc(33.33% - 4px)", height: "calc(100% - 4px)", borderRadius: T.radius.sm, background: T.accent.primaryDim, transition: "left 0.25s cubic-bezier(0.4, 0, 0.2, 1)", zIndex: 0 }} />
                                                        {tabs.map((tab, idx) => (
                                                            <button key={idx} onClick={() => { haptic.selection(); setEditStep(idx); }} style={{ flex: 1, padding: "7px 0", border: "none", background: "transparent", color: editStep === idx ? T.accent.primary : T.text.dim, fontSize: 10, fontWeight: editStep === idx ? 800 : 600, cursor: "pointer", fontFamily: T.font.mono, position: "relative", zIndex: 1, transition: "color 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                                                                {tab.filled && editStep !== idx && <CheckCircle2 size={9} style={{ opacity: 0.6 }} />}
                                                                {tab.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                );
                                            })()}

                                            {editStep === 0 && (
                                                <>
                                                    <span style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 700, letterSpacing: 0.5 }}>CARD DETAILS</span>
                                                    {(() => {
                                                        const hasLivePlaidSync = !!card._plaidAccountId && !card._plaidManualFallback && !needsReconnect && card._plaidBalance != null;
                                                        if (hasLivePlaidSync) {
                                                            return (
                                                                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.subtle}`, background: T.bg.elevated }}>
                                                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: T.text.dim }}>
                                                                        <UiGlyph glyph="⚡" size={11} color={T.accent.primary} />
                                                                        Plaid-managed balance. Manual edits stay locked unless the connection needs reconnecting or you switch back to manual tracking.
                                                                    </span>
                                                                </div>
                                                            );
                                                        }
                                                        return (
                                                            <div style={{ position: "relative" }}>
                                                                <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontFamily: T.font.mono, fontSize: 14, fontWeight: 600 }}>$</span>
                                                                <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={editForm.balance} onChange={e => setEditForm(p => ({ ...p, balance: e.target.value }))} placeholder="Current Balance" aria-label="Current card balance" style={{ width: "100%", paddingLeft: 28, fontFamily: T.font.mono, fontWeight: 600, boxSizing: "border-box" }} />
                                                            </div>
                                                        );
                                                    })()}
                                                    <div style={{ display: "flex", gap: 8 }}>
                                                        <SearchableSelect value={editForm.institution} onChange={v => setEditForm(p => ({ ...p, institution: v }))} placeholder="Issuer" options={INSTITUTIONS.map(i => ({ value: i, label: i }))} />
                                                        <SearchableSelect value={editForm.name} onChange={v => setEditForm(p => ({ ...p, name: v }))} placeholder="Select Card" displayValue={editForm.name ? editForm.name.replace(new RegExp(`^${editForm.institution}\\s*`, "i"), "") : ""} options={(() => {
                                                            const list = getIssuerCards(editForm.institution, cardCatalog);
                                                            const pinned = getPinnedForIssuer(editForm.institution, cardCatalog);
                                                            const pinnedSet = new Set(pinned.map(p => p.toLowerCase()));
                                                            const stripInst = n => n.replace(new RegExp(`^${editForm.institution}\\s*`, "i"), "");
                                                            const pinnedItems = list.filter(c => pinnedSet.has(c.name.toLowerCase()) && c.status !== "discontinued");
                                                            const restActive = list.filter(c => !pinnedSet.has(c.name.toLowerCase()) && c.status !== "discontinued").sort((a, b) => a.name.localeCompare(b.name));
                                                            return [...pinnedItems.map(c => ({ value: c.name, label: stripInst(c.name), group: "Popular" })), ...restActive.map(c => ({ value: c.name, label: stripInst(c.name), group: "All Cards" }))];
                                                        })()} />
                                                    </div>
                                                    <div style={{ display: "flex", gap: 8 }}>
                                                        <div style={{ flex: 1, position: "relative" }}>
                                                            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontFamily: T.font.mono, fontSize: 14, fontWeight: 600 }}>$</span>
                                                            <input type="number" inputMode="decimal" pattern="[0-9]*" value={editForm.limit} onChange={e => setEditForm(p => ({ ...p, limit: e.target.value }))} placeholder="Limit" aria-label="Credit limit" style={{ paddingLeft: 28, fontFamily: T.font.mono, fontWeight: 600 }} />
                                                        </div>
                                                        <div style={{ flex: 1 }}>
                                                            <input value={editForm.nickname} onChange={e => setEditForm(p => ({ ...p, nickname: e.target.value }))} placeholder="Nickname (e.g. 'Daily Driver')" aria-label="Card nickname" style={{ width: "100%", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                                                        </div>
                                                    </div>
                                                    {card._plaidAccountId && (
                                                        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.subtle}`, background: T.bg.elevated }}>
                                                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: T.text.dim }}>
                                                                <UiGlyph glyph="⚡" size={11} color={T.accent.primary} />
                                                                Synced via Plaid
                                                            </span>
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                            {editStep === 1 && (
                                                <>
                                                    <span style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 700, letterSpacing: 0.5 }}>FEES & INTEREST</span>
                                                    <div style={{ display: "flex", gap: 8 }}>
                                                        <div style={{ flex: 0.5, position: "relative" }}>
                                                            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontFamily: T.font.mono, fontSize: 13, fontWeight: 600 }}>$</span>
                                                            <input type="number" inputMode="decimal" pattern="[0-9]*" value={editForm.annualFee} onChange={e => setEditForm(p => ({ ...p, annualFee: e.target.value }))} placeholder="Annual Fee" aria-label="Annual fee" style={{ paddingLeft: 28, fontFamily: T.font.mono, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                                                        </div>
                                                        <div style={{ flex: 0.5, position: "relative" }}>
                                                            <span style={{ position: "absolute", left: 10, top: "8px", color: T.text.dim, fontSize: 11, fontWeight: 700, pointerEvents: "none" }}>AF DUE</span>
                                                            <input type="date" value={editForm.annualFeeDue} onChange={e => setEditForm(p => ({ ...p, annualFeeDue: e.target.value }))} aria-label="Annual fee due date" style={{ width: "100%", padding: "20px 10px 6px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, outline: "none", boxSizing: "border-box", height: "100%" }} />
                                                        </div>
                                                    </div>
                                                    <div style={{ marginTop: -4, paddingLeft: 4 }}>
                                                        <WaivedCheckbox checked={editForm.annualFeeWaived} onChange={() => setEditForm(p => ({ ...p, annualFeeWaived: !p.annualFeeWaived }))} />
                                                    </div>
                                                    <div style={{ display: "flex", gap: 8 }}>
                                                        <div style={{ flex: 1, position: "relative" }}>
                                                            <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontFamily: T.font.mono, fontSize: 12 }}>%</span>
                                                            <input type="number" inputMode="decimal" pattern="[0-9]*" value={editForm.apr} onChange={e => setEditForm(p => ({ ...p, apr: e.target.value }))} placeholder="Standard APR (%)" aria-label="Standard APR percentage" style={{ width: "100%", padding: "10px 24px 10px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontFamily: T.font.mono, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                                                        </div>
                                                    </div>
                                                    <div style={{ marginTop: -4, paddingLeft: 4 }}>
                                                        <PromoCheckbox checked={editForm.hasPromoApr} onChange={() => setEditForm(p => ({ ...p, hasPromoApr: !p.hasPromoApr }))} />
                                                    </div>
                                                    {editForm.hasPromoApr && (
                                                        <div style={{ display: "flex", gap: 8, marginTop: -4 }}>
                                                            <div style={{ flex: 0.5, position: "relative" }}>
                                                                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontFamily: T.font.mono, fontSize: 12 }}>%</span>
                                                                <input type="number" inputMode="decimal" pattern="[0-9]*" value={editForm.promoAprAmount} onChange={e => setEditForm(p => ({ ...p, promoAprAmount: e.target.value }))} placeholder="Promo APR" aria-label="Promo APR percentage" style={{ width: "100%", padding: "10px 24px 10px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontFamily: T.font.mono, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                                                            </div>
                                                            <div style={{ flex: 0.5, position: "relative" }}>
                                                                <span style={{ position: "absolute", left: 10, top: "8px", color: T.text.dim, fontSize: 11, fontWeight: 700, pointerEvents: "none" }}>PROMO EXP</span>
                                                                <input type="date" value={editForm.promoAprExp} onChange={e => setEditForm(p => ({ ...p, promoAprExp: e.target.value }))} aria-label="Promo APR expiration date" style={{ width: "100%", padding: "20px 10px 6px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, outline: "none", boxSizing: "border-box", height: "100%" }} />
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                            {editStep === 2 && (
                                                <>
                                                    <span style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 700, letterSpacing: 0.5 }}>BILLING & NOTES</span>
                                                    <div style={{ display: "flex", gap: 6 }}>
                                                        <div style={{ flex: 1 }}>
                                                            <span style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono, display: "block", marginBottom: 2 }}>STMT CLOSES</span>
                                                            <input type="number" inputMode="decimal" pattern="[0-9]*" min="1" max="31" value={editForm.statementCloseDay} onChange={e => setEditForm(p => ({ ...p, statementCloseDay: e.target.value }))} placeholder="Day" aria-label="Statement close day" style={{ width: "100%", padding: "8px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                                                        </div>
                                                        <div style={{ flex: 1 }}>
                                                            <span style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono, display: "block", marginBottom: 2 }}>PMT DUE</span>
                                                            <input type="number" inputMode="decimal" pattern="[0-9]*" min="1" max="31" value={editForm.paymentDueDay} onChange={e => setEditForm(p => ({ ...p, paymentDueDay: e.target.value }))} placeholder="Day" aria-label="Payment due day" style={{ width: "100%", padding: "8px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                                                        </div>
                                                        <div style={{ flex: 1, position: "relative" }}>
                                                            <span style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono, display: "block", marginBottom: 2 }}>MIN PMT</span>
                                                            <span style={{ position: "absolute", left: 8, bottom: 9, color: T.text.dim, fontSize: 11, fontWeight: 600 }}>$</span>
                                                            <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={editForm.minPayment} onChange={e => setEditForm(p => ({ ...p, minPayment: e.target.value }))} placeholder="35" aria-label="Minimum payment" style={{ width: "100%", padding: "8px 8px 8px 18px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                                                        </div>
                                                    </div>
                                                    <input value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes" aria-label="Card notes" style={{ width: "100%", fontSize: 13, padding: "8px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, outline: "none", boxSizing: "border-box" }} />
                                                </>
                                            )}

                                            {/* ── Actions ── */}
                                            <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                                                {editStep > 0 && <button onClick={() => { haptic.selection(); setEditStep(s => s - 1); }} aria-label="Previous page" style={{ flex: 0.6, padding: 10, borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: "transparent", color: T.text.dim, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>← Back</button>}
                                                <button onClick={() => saveEdit(card.id)} style={{ flex: 1, padding: 10, borderRadius: T.radius.sm, border: "none", background: T.accent.primaryDim, color: T.accent.primary, fontSize: 11, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Check size={12} /> Save</button>
                                                {editStep < 2 && <button onClick={() => { haptic.selection(); setEditStep(s => s + 1); }} aria-label="Next page" style={{ flex: 0.6, padding: 10, borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: "transparent", color: T.text.primary, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Next →</button>}
                                                <button onClick={() => setEditingCard(null)} style={{ flex: 0.5, padding: 10, borderRadius: T.radius.sm, border: `1px solid ${T.border.default}`, background: "transparent", color: T.text.dim, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Cancel</button>
                                            </div>
                                            <div style={{ textAlign: "center", paddingTop: 2 }}>
                                                <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (window.confirm(`Delete "${card.nickname || card.name}"?`)) removeCard(card.id); }} style={{ background: "none", border: "none", color: T.status.red, fontSize: 10, cursor: "pointer", fontWeight: 600, opacity: 0.6, padding: "2px 8px" }}>Delete card</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                            <div
                                                style={{
                                                    display: "grid",
                                                    gridTemplateColumns: "42px minmax(0, 1fr) auto",
                                                    columnGap: 7,
                                                    rowGap: 2,
                                                    alignItems: "start",
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                        minHeight: 17,
                                                        marginTop: 1,
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
                                                    {issuerLabel}
                                                </span>
                                                <div
                                                    style={{
                                                        fontSize: 12.25,
                                                        fontWeight: 750,
                                                        color: isZeroBalance ? T.text.secondary : T.text.primary,
                                                        letterSpacing: "-0.01em",
                                                        lineHeight: 1.12,
                                                        display: "-webkit-box",
                                                        WebkitLineClamp: 2,
                                                        WebkitBoxOrient: "vertical",
                                                        overflow: "hidden",
                                                        paddingTop: 1,
                                                    }}
                                                >
                                                    {getCardDisplayName(card)}
                                                </div>
                                                <div style={{ display: "flex", alignItems: "flex-start", gap: 6, flexShrink: 0 }}>
                                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, minWidth: 90 }}>
                                                        <div style={{ textAlign: "right", minWidth: 90 }}>
                                                            <div style={{ fontSize: 13.5, fontWeight: 850, color: balanceColor, fontFamily: T.font.mono, letterSpacing: "-0.01em", lineHeight: 1.08 }}>
                                                                {fmt(visibleBalance)}
                                                            </div>
                                                            {limit > 0 && (
                                                                <div style={{ fontSize: 8.25, color: T.text.muted, fontFamily: T.font.mono, marginTop: 1, lineHeight: 1.05 }}>
                                                                    / {fmt(limit)}
                                                                </div>
                                                            )}
                                                        </div>
                                                        {utilization != null && limit > 0 && (
                                                            <div
                                                                style={{
                                                                    display: "grid",
                                                                    gridTemplateColumns: "1fr auto",
                                                                    gap: 5,
                                                                    alignItems: "center",
                                                                    width: "100%",
                                                                }}
                                                            >
                                                                <span
                                                                    style={{
                                                                        display: "block",
                                                                        width: "100%",
                                                                        height: 4,
                                                                        borderRadius: 99,
                                                                        background: `${utilizationColor}14`,
                                                                        overflow: "hidden",
                                                                        boxShadow: `inset 0 0 0 1px ${T.border.subtle}`,
                                                                    }}
                                                                >
                                                                    <span
                                                                        style={{
                                                                            display: "block",
                                                                            width: `${Math.min(100, utilization)}%`,
                                                                            height: "100%",
                                                                            borderRadius: 99,
                                                                            background: utilizationColor,
                                                                            transition: "width 0.4s ease",
                                                                        }}
                                                                    />
                                                                </span>
                                                                <span
                                                                    style={{
                                                                        fontSize: 7.75,
                                                                        fontFamily: T.font.mono,
                                                                        color: utilizationColor,
                                                                        fontWeight: 800,
                                                                        letterSpacing: "-0.01em",
                                                                    }}
                                                                >
                                                                    {Math.round(utilization)}%
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={() => startEdit(card)}
                                                        style={{ width: 22, height: 22, borderRadius: 7, border: `1px solid ${T.border.subtle}`, background: "transparent", color: T.text.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}
                                                    >
                                                        <Edit3 size={10} />
                                                    </button>
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
                                                    {statusChips.map((chip) => (
                                                        <span
                                                            key={`${card.id}-${chip.label}`}
                                                            style={{
                                                                padding: "1px 6px",
                                                                borderRadius: 999,
                                                                fontSize: 8,
                                                                fontWeight: 800,
                                                                fontFamily: T.font.mono,
                                                                letterSpacing: "0.02em",
                                                                border: chip.tone === "warning" ? `1px solid ${T.status.amber}28` : chip.tone === "good" ? `1px solid ${T.accent.emerald}22` : chip.tone === "danger" ? `1px solid ${T.status.red}24` : `1px solid ${T.border.subtle}`,
                                                                background: chip.tone === "warning" ? `${T.status.amber}12` : chip.tone === "good" ? `${T.accent.emerald}12` : chip.tone === "danger" ? `${T.status.red}10` : T.bg.surface,
                                                                color: chip.tone === "warning" ? T.status.amber : chip.tone === "good" ? T.accent.emerald : chip.tone === "danger" ? T.status.red : T.text.dim,
                                                            }}
                                                        >
                                                            {chip.label}
                                                        </span>
                                                    ))}
                                                    {metaTokens.map((token) => (
                                                        <span
                                                            key={`${card.id}-${token}`}
                                                            style={{
                                                                fontSize: 8.25,
                                                                color: token.startsWith("Sync ") ? accentColor : T.text.muted,
                                                                fontFamily: T.font.mono,
                                                                opacity: token.startsWith("Sync ") ? 0.92 : 0.82,
                                                                whiteSpace: "nowrap",
                                                                lineHeight: 1,
                                                            }}
                                                        >
                                                            {token}
                                                        </span>
                                                    ))}
                                                    {plannedState?.remainingAmount && (
                                                        <span style={{ padding: "1px 6px", borderRadius: 999, background: `${T.accent.emerald}12`, border: `1px solid ${T.accent.emerald}1f`, fontSize: 8, fontWeight: 800, fontFamily: T.font.mono, color: T.accent.emerald }}>
                                                            Planned {fmt(plannedState.projectedBalance || 0)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
