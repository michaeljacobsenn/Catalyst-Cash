import { useState, useMemo } from "react";
import { CreditCard, ChevronDown, CheckCircle2, Check, Edit3 } from "lucide-react";
import { Card, Badge } from "../ui.jsx";
import SearchableSelect from "../SearchableSelect.jsx";
import { Mono } from "../components.jsx";
import { T, INSTITUTIONS, ISSUER_COLORS } from "../constants.js";
import { usePortfolio } from "../contexts/PortfolioContext";
import { fmt } from "../utils.js";
import { haptic } from "../haptics.js";
import { getIssuerCards, getPinnedForIssuer } from "../issuerCards.js";
import { getCardLabel } from "../cards.js";

export default function CreditCardsSection({ collapsedSections: propCollapsed, setCollapsedSections: propSetCollapsed }) {
    const { cards, setCards, cardCatalog } = usePortfolio();

    const [internalCollapsed, internalSetCollapsed] = useState({ creditCards: false });
    const collapsedSections = propCollapsed || internalCollapsed;
    const setCollapsedSections = propSetCollapsed || internalSetCollapsed;
    const [editingCard, setEditingCard] = useState(null);
    const [editStep, setEditStep] = useState(0);
    const [editForm, setEditForm] = useState({});

    const sortedCards = useMemo(() =>
        [...cards].sort((a, b) => {
            const instCmp = (a.institution || "").localeCompare(b.institution || "");
            return instCmp !== 0 ? instCmp : (a.name || "").localeCompare(b.name || "");
        }),
    [cards]);

    const startEdit = card => {
        setEditingCard(card.id);
        setEditStep(0);
        setEditForm({
            institution: card.institution || "",
            name: card.name || "",
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

    const saveEdit = cardId => {
        setCards(
            cards.map(c =>
                c.id === cardId
                    ? {
                        ...c,
                        institution: editForm.institution || c.institution,
                        name: (editForm.name || "").trim() || c.name,
                        limit: editForm.limit === "" ? null : parseFloat(editForm.limit) || null,
                        annualFee: editForm.annualFee === "" ? null : parseFloat(editForm.annualFee) || null,
                        annualFeeDue: editForm.annualFeeDue,
                        annualFeeWaived: editForm.annualFeeWaived,
                        notes: editForm.notes,
                        apr: editForm.apr === "" ? null : parseFloat(editForm.apr) || null,
                        nickname: editForm.nickname || "",
                        hasPromoApr: editForm.hasPromoApr,
                        promoAprAmount: editForm.promoAprAmount === "" ? null : parseFloat(editForm.promoAprAmount) || null,
                        promoAprExp: editForm.promoAprExp,
                        statementCloseDay: editForm.statementCloseDay === "" ? null : parseInt(editForm.statementCloseDay) || null,
                        paymentDueDay: editForm.paymentDueDay === "" ? null : parseInt(editForm.paymentDueDay) || null,
                        minPayment: editForm.minPayment === "" ? null : parseFloat(editForm.minPayment) || null,
                    }
                    : c
            )
        );
        setEditingCard(null);
    };

    const removeCard = cardId => {
        const card = cards.find(c => c.id === cardId);
        if (card?._plaidAccountId) {
            if (!window.confirm(
                `"${card.nickname || card.name}" is linked to Plaid. Deleting it will remove it from balance tracking.\n\nTo fully disconnect, go to Settings → Plaid.\n\nDelete anyway?`
            )) return;
        }
        setCards(cards.filter(c => c.id !== cardId));
    };

    const ic = inst =>
        ISSUER_COLORS[inst] || {
            bg: "rgba(110,118,129,0.08)",
            border: "rgba(110,118,129,0.15)",
            text: T.text.secondary,
            accent: T.text.dim,
        };

    const WaivedCheckbox = ({ checked, onChange }) => (
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

    const PromoCheckbox = ({ checked, onChange }) => (
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
                    <div style={{ padding: "4px 8px 8px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
                        {sortedCards.map((card) => {
                            const colors = ic(card.institution);
                            return (
                                <div key={card.id} style={{ background: T.bg.glass, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                                    <div style={{ padding: "10px 16px" }}>
                                    {editingCard === card.id ? (
                                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                            {(() => {
                                                const tabs = [
                                                    { label: "Card", filled: !!(editForm.institution || editForm.name || editForm.limit) },
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
                                                            <span style={{ fontSize: 11, color: T.text.dim }}>⚡ Synced via Plaid</span>
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
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, lineHeight: 1.3, display: "flex", alignItems: "center", gap: 0, overflow: "hidden", whiteSpace: "nowrap" }}>
                                                    <span style={{ color: colors.text, fontWeight: 800, flexShrink: 0 }}>{card.institution}</span>
                                                    <span style={{ color: T.text.dim, margin: "0 6px", flexShrink: 0 }}>·</span>
                                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{card.nickname || (card.name || "").replace(new RegExp(`^${card.institution}\\s*`, "i"), "")}</span>
                                                </div>
                                                <Mono size={10} color={T.text.dim} style={{ display: "block", marginTop: 3, lineHeight: 1.4 }}>
                                                    {[
                                                        card.nickname && card.name,
                                                        card.annualFee > 0 && (card.annualFeeWaived ? "AF waived" : `AF ${fmt(card.annualFee)}${card.annualFeeDue ? ` · ${card.annualFeeDue}` : ""}`),
                                                        card.apr > 0 && `${card.apr}% APR`,
                                                        card.hasPromoApr && `Promo ${card.promoAprAmount}%${card.promoAprExp ? ` till ${card.promoAprExp}` : ""}`,
                                                        card.paymentDueDay && `Due day ${card.paymentDueDay}${card.minPayment ? ` · min ${fmt(card.minPayment)}` : ""}`,
                                                        card._plaidAccountId && `⚡ ···${(card.notes || "").match(/···(\d+)/)?.[1] || "Plaid"}`,
                                                    ].filter(Boolean).join("  ·  ")}
                                                </Mono>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                                                    {card._plaidBalance != null && (
                                                        <Mono size={14} weight={900} color={T.status.red}>{fmt(card._plaidBalance)}</Mono>
                                                    )}
                                                    <Mono size={card._plaidBalance != null ? 10 : 13} weight={700} color={card._plaidBalance != null ? T.text.dim : colors.text}>
                                                        {card._plaidBalance != null ? "Limit " : ""}{fmt(card.limit)}
                                                    </Mono>
                                                </div>
                                                <button onClick={() => startEdit(card)} style={{ width: 32, height: 32, borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.dim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Edit3 size={11} /></button>
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
