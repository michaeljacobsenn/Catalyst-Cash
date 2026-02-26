import { useState, useMemo } from "react";
import { Plus, X, ChevronDown, ChevronUp, CreditCard, Edit3, Check, DollarSign, Building2, Landmark } from "lucide-react";
import { T, ISSUER_COLORS } from "../constants.js";
import { getIssuerCards, getPinnedForIssuer } from "../issuerCards.js";
import { getBankNames, getBankProducts } from "../bankCatalog.js";
import { getCardLabel } from "../cards.js";
import { fmt } from "../utils.js";
import { Card, Label, Badge } from "../ui.jsx";
import { Mono, EmptyState } from "../components.jsx";
import SearchableSelect from "../SearchableSelect.jsx";

const INSTITUTIONS = [
    "Amex", "Bank of America", "Barclays", "Capital One", "Chase", "Citi",
    "Discover", "FNBO", "Goldman Sachs", "HSBC", "Navy Federal", "PenFed",
    "Synchrony", "TD Bank", "US Bank", "USAA", "Wells Fargo", "Other"
];

export default function CardPortfolioTab({ cards, setCards, cardCatalog, bankAccounts = [], setBankAccounts }) {
    const [collapsedIssuers, setCollapsedIssuers] = useState({});
    const [editingCard, setEditingCard] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [showAdd, setShowAdd] = useState(false);
    const [addForm, setAddForm] = useState({ institution: "", cardChoice: "", customName: "", nickname: "", limit: "", annualFee: "", annualFeeDue: "", annualFeeWaived: false, notes: "", apr: "", hasPromoApr: false, promoAprAmount: "", promoAprExp: "", statementCloseDay: "", paymentDueDay: "", minPayment: "" });

    const grouped = useMemo(() => {
        const g = {};
        cards.forEach(c => { (g[c.institution] = g[c.institution] || []).push(c); });
        return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
    }, [cards]);

    const totalLimit = useMemo(() => cards.reduce((s, c) => s + (c.limit || 0), 0), [cards]);
    const totalAF = useMemo(() => cards.reduce((s, c) => s + ((c.annualFee || 0) * (c.annualFeeWaived ? 0 : 1)), 0), [cards]);

    const startEdit = (card) => {
        setEditingCard(card.id);
        setEditForm({
            institution: card.institution || "", name: card.name || "",
            limit: String(card.limit || ""), annualFee: String(card.annualFee || ""),
            annualFeeDue: card.annualFeeDue || "", annualFeeWaived: !!card.annualFeeWaived,
            notes: card.notes || "", apr: String(card.apr || ""), nickname: card.nickname || "",
            hasPromoApr: !!card.hasPromoApr, promoAprAmount: String(card.promoAprAmount || ""),
            promoAprExp: card.promoAprExp || "",
            statementCloseDay: String(card.statementCloseDay || ""),
            paymentDueDay: String(card.paymentDueDay || ""),
            minPayment: String(card.minPayment || "")
        });
    };
    const saveEdit = (cardId) => {
        setCards(cards.map(c => c.id === cardId ? {
            ...c,
            institution: editForm.institution || c.institution,
            name: (editForm.name || "").trim() || c.name,
            limit: editForm.limit === "" ? null : parseFloat(editForm.limit) || null,
            annualFee: editForm.annualFee === "" ? null : parseFloat(editForm.annualFee) || null,
            annualFeeDue: editForm.annualFeeDue, annualFeeWaived: editForm.annualFeeWaived,
            notes: editForm.notes, apr: editForm.apr === "" ? null : parseFloat(editForm.apr) || null,
            nickname: editForm.nickname || "",
            hasPromoApr: editForm.hasPromoApr, promoAprAmount: editForm.promoAprAmount === "" ? null : parseFloat(editForm.promoAprAmount) || null,
            promoAprExp: editForm.promoAprExp,
            statementCloseDay: editForm.statementCloseDay === "" ? null : parseInt(editForm.statementCloseDay) || null,
            paymentDueDay: editForm.paymentDueDay === "" ? null : parseInt(editForm.paymentDueDay) || null,
            minPayment: editForm.minPayment === "" ? null : parseFloat(editForm.minPayment) || null
        } : c));
        setEditingCard(null);
    };
    const removeCard = (cardId) => {
        const card = cards.find(c => c.id === cardId);
        const label = card ? (card.nickname || card.name) : "this card";
        if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
        setCards(cards.filter(c => c.id !== cardId));
    };
    const addCard = () => {
        const finalName = (addForm.cardChoice === "__other__" ? addForm.customName : addForm.cardChoice);
        if (!finalName || !finalName.trim()) return;
        setCards([...cards, {
            id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `card_${Date.now()}`,
            name: finalName.trim(), institution: addForm.institution,
            nickname: addForm.nickname || "",
            limit: addForm.limit === "" ? null : parseFloat(addForm.limit) || null,
            annualFee: addForm.annualFee === "" ? null : parseFloat(addForm.annualFee) || null,
            annualFeeDue: addForm.annualFeeDue, annualFeeWaived: addForm.annualFeeWaived,
            notes: addForm.notes, apr: addForm.apr === "" ? null : parseFloat(addForm.apr) || null,
            hasPromoApr: addForm.hasPromoApr, promoAprAmount: addForm.promoAprAmount === "" ? null : parseFloat(addForm.promoAprAmount) || null,
            promoAprExp: addForm.promoAprExp,
            statementCloseDay: addForm.statementCloseDay === "" ? null : parseInt(addForm.statementCloseDay) || null,
            paymentDueDay: addForm.paymentDueDay === "" ? null : parseInt(addForm.paymentDueDay) || null,
            minPayment: addForm.minPayment === "" ? null : parseFloat(addForm.minPayment) || null
        }]);
        setAddForm({ institution: "", cardChoice: "", customName: "", nickname: "", limit: "", annualFee: "", annualFeeDue: "", annualFeeWaived: false, notes: "", apr: "", hasPromoApr: false, promoAprAmount: "", promoAprExp: "", statementCloseDay: "", paymentDueDay: "", minPayment: "" });
        setShowAdd(false);
    };

    const ic = (inst) => ISSUER_COLORS[inst] || { bg: "rgba(110,118,129,0.08)", border: "rgba(110,118,129,0.15)", text: T.text.secondary, accent: T.text.dim };

    const WaivedCheckbox = ({ checked, onChange }) => (
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "10px 0" }}>
            <div style={{
                width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                border: checked ? "none" : `2px solid ${T.text.dim}`,
                background: checked ? T.accent.primary : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s"
            }} onClick={onChange}>
                {checked && <Check size={12} color={T.bg.base} strokeWidth={3} />}
            </div>
            <span style={{ fontSize: 12, color: T.text.secondary }}>Waived? <span style={{ fontSize: 10, color: T.text.dim }}>(first year free)</span></span>
        </label>
    );

    const PromoCheckbox = ({ checked, onChange }) => (
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "10px 0" }}>
            <div style={{
                width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                border: checked ? "none" : `2px solid ${T.text.dim}`,
                background: checked ? T.accent.emerald : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s"
            }} onClick={onChange}>
                {checked && <Check size={12} color={T.bg.base} strokeWidth={3} />}
            </div>
            <span style={{ fontSize: 12, color: T.text.secondary }}>Active Promo APR?</span>
        </label>
    );

    const creditCardsSection = <div>
        <div style={{ paddingTop: 16, paddingBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
                <h1 style={{ fontSize: 22, fontWeight: 800 }}>Card Portfolio</h1>
                <p style={{ fontSize: 11, color: T.text.dim, marginTop: 4, fontFamily: T.font.mono }}>{cards.length} cards</p>
            </div>
            <button onClick={() => setShowAdd(!showAdd)} style={{
                display: "flex", alignItems: "center", gap: 4, padding: "8px 14px",
                borderRadius: T.radius.md, border: `1px solid ${showAdd ? T.status.amber : T.accent.primary}30`,
                background: showAdd ? T.status.amberDim : T.accent.primaryDim, color: showAdd ? T.status.amber : T.accent.primary,
                fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font.mono
            }}>
                {showAdd ? <><X size={12} />CANCEL</> : <><Plus size={12} />ADD CARD</>}
            </button>
        </div>

        {/* Summary */}
        <Card animate style={{
            textAlign: "center", padding: "22px 16px",
            background: `linear-gradient(160deg,${T.bg.card},${T.status.blue}06)`, borderColor: `${T.status.blue}12`,
            boxShadow: `${T.shadow.elevated}, 0 0 24px ${T.status.blueDim}`
        }}>
            <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.15em", color: T.text.dim, marginBottom: 6, fontFamily: T.font.mono, fontWeight: 700 }}>Total Credit Limit</p>
            <Mono size={30} weight={800} color={T.status.blue}>{fmt(totalLimit)}</Mono>
            <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 10 }}>
                <div><Mono size={10} color={T.text.dim}>CARDS</Mono><br /><Mono size={16} weight={700} color={T.text.primary}>{cards.length}</Mono></div>
                <div style={{ width: 1, background: T.border.default }} />
                <div><Mono size={10} color={T.text.dim}>ANNUAL FEES</Mono><br /><Mono size={16} weight={700} color={totalAF > 0 ? T.status.amber : T.text.primary}>{fmt(totalAF)}</Mono></div>
                <div style={{ width: 1, background: T.border.default }} />
                <div><Mono size={10} color={T.text.dim}>AVG LIMIT</Mono><br /><Mono size={16} weight={700} color={T.text.primary}>{cards.length > 0 ? fmt(totalLimit / cards.length) : "—"}</Mono></div>
            </div>
        </Card>

        {/* Info */}
        <Card animate delay={50} style={{ padding: "12px 16px", borderLeft: `3px solid ${T.status.green}30` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Check size={12} color={T.status.green} />
                <span style={{ fontSize: 11, fontWeight: 600, color: T.text.secondary }}>Changes here update your audit snapshot & renewals</span>
            </div>
        </Card>

        {/* Add Card Form */}
        {showAdd && <Card animate variant="accent">
            <Label>New Card</Label>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", gap: 8 }}>
                    <SearchableSelect
                        value={addForm.institution}
                        onChange={v => setAddForm(p => ({ ...p, institution: v }))}
                        placeholder="Institution"
                        options={INSTITUTIONS.map(i => ({ value: i, label: i }))}
                    />
                    <div style={{ flex: 1, position: "relative" }}>
                        <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontFamily: T.font.mono, fontSize: 12 }}>$</span>
                        <input type="number" inputMode="decimal" pattern="[0-9]*" value={addForm.limit} onChange={e => setAddForm(p => ({ ...p, limit: e.target.value }))} placeholder="Limit"
                            style={{ width: "100%", padding: "12px 10px 12px 24px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontFamily: T.font.mono, fontSize: 12, outline: "none" }} />
                    </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <SearchableSelect
                        value={addForm.cardChoice}
                        onChange={v => setAddForm(p => ({ ...p, cardChoice: v }))}
                        placeholder="Select Card"
                        options={(() => {
                            const list = getIssuerCards(addForm.institution, cardCatalog);
                            const pinned = getPinnedForIssuer(addForm.institution, cardCatalog);
                            const pinnedSet = new Set(pinned.map(p => p.toLowerCase()));
                            const pinnedItems = list.filter(c => pinnedSet.has(c.name.toLowerCase()) && c.status !== "discontinued");
                            const restActive = list.filter(c => !pinnedSet.has(c.name.toLowerCase()) && c.status !== "discontinued")
                                .sort((a, b) => a.name.localeCompare(b.name));
                            const restDiscontinued = list.filter(c => c.status === "discontinued")
                                .sort((a, b) => a.name.localeCompare(b.name));
                            return [
                                ...pinnedItems.map(c => ({ value: c.name, label: c.name, group: "Popular" })),
                                ...restActive.map(c => ({ value: c.name, label: c.name, group: "All Cards" })),
                                ...restDiscontinued.map(c => ({ value: c.name, label: `${c.name} (discontinued)`, group: "Discontinued" })),
                                { value: "__other__", label: "Other (manual)", group: "Other" }
                            ];
                        })()}
                    />
                    <input value={addForm.customName} onChange={e => setAddForm(p => ({ ...p, customName: e.target.value }))} placeholder="Card name"
                        disabled={addForm.cardChoice !== "__other__"} style={{ flex: 0.6, fontSize: 12, padding: "12px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, opacity: addForm.cardChoice === "__other__" ? 1 : 0.4, outline: "none", minWidth: 0 }} />
                </div>
                <input value={addForm.nickname} onChange={e => setAddForm(p => ({ ...p, nickname: e.target.value }))} placeholder="Nickname (optional)"
                    style={{ width: "100%", fontSize: 12, padding: "12px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, outline: "none" }} />

                {getIssuerCards(addForm.institution, cardCatalog).length === 0 && addForm.institution !== "" && (
                    <div style={{ fontSize: 11, color: T.text.muted, marginTop: -4, paddingLeft: 4 }}>
                        No issuer list available. Choose &quot;Other (type manually)&quot; to enter your card.
                    </div>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ flex: 0.5, position: "relative" }}>
                        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontFamily: T.font.mono, fontSize: 12 }}>$</span>
                        <input type="number" inputMode="decimal" pattern="[0-9]*" value={addForm.annualFee} onChange={e => setAddForm(p => ({ ...p, annualFee: e.target.value }))} placeholder="Annual fee"
                            style={{ width: "100%", padding: "12px 14px 12px 28px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontFamily: T.font.mono, fontSize: 13, outline: "none" }} />
                    </div>
                    <div style={{ flex: 0.5, position: "relative" }}>
                        <span style={{ position: "absolute", left: 14, top: "12px", color: T.text.dim, fontSize: 11, fontWeight: 700, pointerEvents: "none" }}>AF DUE</span>
                        <input type="date" value={addForm.annualFeeDue} onChange={e => setAddForm(p => ({ ...p, annualFeeDue: e.target.value }))}
                            style={{ width: "100%", padding: "26px 14px 10px 14px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, outline: "none", height: "100%", boxSizing: "border-box" }} />
                    </div>
                </div>
                <div style={{ marginTop: -4, paddingLeft: 4 }}>
                    <WaivedCheckbox checked={addForm.annualFeeWaived} onChange={() => setAddForm(p => ({ ...p, annualFeeWaived: !p.annualFeeWaived }))} />
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ flex: 1, position: "relative" }}>
                        <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontFamily: T.font.mono, fontSize: 12 }}>%</span>
                        <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={addForm.apr} onChange={e => setAddForm(p => ({ ...p, apr: e.target.value }))} placeholder="Standard APR (%)"
                            style={{ width: "100%", padding: "12px 28px 12px 14px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontFamily: T.font.mono, fontSize: 13, outline: "none" }} />
                    </div>
                </div>

                <div style={{ marginTop: -4, paddingLeft: 4 }}>
                    <PromoCheckbox checked={addForm.hasPromoApr} onChange={() => setAddForm(p => ({ ...p, hasPromoApr: !p.hasPromoApr }))} />
                </div>

                {addForm.hasPromoApr && <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <div style={{ flex: 0.5, position: "relative" }}>
                        <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontFamily: T.font.mono, fontSize: 12 }}>%</span>
                        <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={addForm.promoAprAmount} onChange={e => setAddForm(p => ({ ...p, promoAprAmount: e.target.value }))} placeholder="Promo APR"
                            style={{ width: "100%", padding: "12px 28px 12px 14px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontFamily: T.font.mono, fontSize: 13, outline: "none" }} />
                    </div>
                    <div style={{ flex: 0.5, position: "relative" }}>
                        <span style={{ position: "absolute", left: 14, top: "12px", color: T.text.dim, fontSize: 11, fontWeight: 700, pointerEvents: "none" }}>PROMO EXP</span>
                        <input type="date" value={addForm.promoAprExp} onChange={e => setAddForm(p => ({ ...p, promoAprExp: e.target.value }))}
                            style={{ width: "100%", padding: "26px 14px 10px 14px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, outline: "none", height: "100%", boxSizing: "border-box" }} />
                    </div>
                </div>}

                <input value={addForm.notes} onChange={e => setAddForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes (optional)"
                    style={{ width: "100%", fontSize: 13, padding: "12px 14px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, outline: "none", marginTop: 4 }} />

                {/* Payment tracking */}
                <div style={{ paddingTop: 12, borderTop: `1px solid ${T.border.subtle}`, marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 700, display: "block", marginBottom: 8 }}>PAYMENT TRACKING <span style={{ color: T.text.muted, fontWeight: 400 }}>(optional)</span></span>
                    <div style={{ display: "flex", gap: 6 }}>
                        <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 4 }}>STMT CLOSE</span>
                            <input type="number" inputMode="decimal" pattern="[0-9]*" min="1" max="31" value={addForm.statementCloseDay} onChange={e => setAddForm(p => ({ ...p, statementCloseDay: e.target.value }))}
                                placeholder="Day" style={{ width: "100%", padding: "10px 8px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 4 }}>PMT DUE</span>
                            <input type="number" inputMode="decimal" pattern="[0-9]*" min="1" max="31" value={addForm.paymentDueDay} onChange={e => setAddForm(p => ({ ...p, paymentDueDay: e.target.value }))}
                                placeholder="Day" style={{ width: "100%", padding: "10px 8px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                        </div>
                        <div style={{ flex: 1, position: "relative" }}>
                            <span style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 600, display: "block", marginBottom: 4 }}>MIN PMT</span>
                            <span style={{ position: "absolute", left: 6, bottom: 11, color: T.text.dim, fontSize: 11, fontWeight: 600 }}>$</span>
                            <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={addForm.minPayment} onChange={e => setAddForm(p => ({ ...p, minPayment: e.target.value }))}
                                placeholder="Amt" style={{ width: "100%", padding: "10px 8px 10px 18px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                        </div>
                    </div>
                </div>

                <button onClick={addCard} disabled={!(addForm.institution && (addForm.cardChoice === "__other__" ? addForm.customName?.trim() : addForm.cardChoice))} style={{
                    padding: 14, borderRadius: T.radius.lg, border: "none", marginTop: 4,
                    background: (addForm.institution && (addForm.cardChoice === "__other__" ? addForm.customName?.trim() : addForm.cardChoice)) ? `linear-gradient(135deg,${T.accent.primary},#6C60FF)` : T.text.muted,
                    color: (addForm.institution && (addForm.cardChoice === "__other__" ? addForm.customName?.trim() : addForm.cardChoice)) ? T.bg.base : T.text.dim, fontSize: 14, fontWeight: 800,
                    cursor: (addForm.institution && (addForm.cardChoice === "__other__" ? addForm.customName?.trim() : addForm.cardChoice)) ? "pointer" : "not-allowed",
                    boxShadow: (addForm.institution && (addForm.cardChoice === "__other__" ? addForm.customName?.trim() : addForm.cardChoice)) ? `0 4px 12px ${T.accent.primary}40` : "none"
                }}>Add Card</button>
            </div>
        </Card>}

        {/* Cards by Issuer */}
        {grouped.length === 0 ?
            <EmptyState icon={CreditCard} title="Build Your Elite Portfolio" message="Add your first credit card to start tracking limits, annual fees, and active promo windows." /> :
            grouped.map(([inst, cardsInCategory]) => {
                const colors = ic(inst);
                const isCollapsed = collapsedIssuers[inst];
                return <Card key={inst} animate variant="glass" style={{ marginBottom: 16, padding: 0, overflow: "hidden", borderLeft: `4px solid ${colors.text}` }}>
                    <div onClick={() => setCollapsedIssuers(p => ({ ...p, [inst]: !isCollapsed }))} style={{ padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", background: `${colors.text}08` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ padding: 6, borderRadius: 8, background: colors.text, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <CreditCard size={14} color={T.bg.card} />
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 800, color: colors.text, textTransform: "uppercase", letterSpacing: "0.05em" }}>{inst}</span>
                            <Badge variant="outline" style={{ fontSize: 11, color: colors.text, borderColor: `${colors.text}40` }}>{cardsInCategory.length}</Badge>
                        </div>
                        {isCollapsed ? <ChevronDown size={14} color={T.text.dim} /> : <ChevronUp size={14} color={T.text.dim} />}
                    </div>
                    {!isCollapsed && <div style={{ padding: "16px 18px" }}>
                        {cardsInCategory.map((card, i) => (
                            <div key={card.id} style={{ borderBottom: i === cardsInCategory.length - 1 ? "none" : `1px solid ${T.border.subtle}`, padding: "14px 0" }}>
                                {editingCard === card.id ?
                                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                        {/* Institution & Card Name dropdowns for product changes */}
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <SearchableSelect
                                                value={editForm.institution}
                                                onChange={v => setEditForm(p => ({ ...p, institution: v }))}
                                                placeholder="Issuer"
                                                options={INSTITUTIONS.map(i => ({ value: i, label: i }))}
                                            />
                                            <SearchableSelect
                                                value={editForm.name}
                                                onChange={v => setEditForm(p => ({ ...p, name: v }))}
                                                placeholder="Select Card"
                                                options={(() => {
                                                    const list = getIssuerCards(editForm.institution, cardCatalog);
                                                    const pinned = getPinnedForIssuer(editForm.institution, cardCatalog);
                                                    const pinnedSet = new Set(pinned.map(p => p.toLowerCase()));
                                                    const pinnedItems = list.filter(c => pinnedSet.has(c.name.toLowerCase()) && c.status !== "discontinued");
                                                    const restActive = list.filter(c => !pinnedSet.has(c.name.toLowerCase()) && c.status !== "discontinued")
                                                        .sort((a, b) => a.name.localeCompare(b.name));
                                                    return [
                                                        ...pinnedItems.map(c => ({ value: c.name, label: c.name, group: "Popular" })),
                                                        ...restActive.map(c => ({ value: c.name, label: c.name, group: "All Cards" }))
                                                    ];
                                                })()}
                                            />
                                        </div>
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <div style={{ flex: 1, position: "relative" }}>
                                                <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontFamily: T.font.mono, fontSize: 14, fontWeight: 600 }}>$</span>
                                                <input type="number" inputMode="decimal" pattern="[0-9]*" value={editForm.limit} onChange={e => setEditForm(p => ({ ...p, limit: e.target.value }))}
                                                    placeholder="Limit" style={{ paddingLeft: 28, fontFamily: T.font.mono, fontWeight: 600 }} />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <input value={editForm.nickname} onChange={e => setEditForm(p => ({ ...p, nickname: e.target.value }))}
                                                    placeholder="Nickname (e.g. 'Daily Driver')" style={{ width: "100%", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <div style={{ flex: 0.5, position: "relative" }}>
                                                <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontFamily: T.font.mono, fontSize: 13, fontWeight: 600 }}>$</span>
                                                <input type="number" inputMode="decimal" pattern="[0-9]*" value={editForm.annualFee} onChange={e => setEditForm(p => ({ ...p, annualFee: e.target.value }))}
                                                    placeholder="Annual Fee" style={{ paddingLeft: 28, fontFamily: T.font.mono, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                                            </div>
                                            <div style={{ flex: 0.5, position: "relative" }}>
                                                <span style={{ position: "absolute", left: 10, top: "8px", color: T.text.dim, fontSize: 11, fontWeight: 700, pointerEvents: "none" }}>AF DUE</span>
                                                <input type="date" value={editForm.annualFeeDue} onChange={e => setEditForm(p => ({ ...p, annualFeeDue: e.target.value }))}
                                                    style={{ width: "100%", padding: "20px 10px 6px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, outline: "none", boxSizing: "border-box", height: "100%" }} />
                                            </div>
                                        </div>
                                        <div style={{ marginTop: -4, paddingLeft: 4 }}>
                                            <WaivedCheckbox checked={editForm.annualFeeWaived} onChange={() => setEditForm(p => ({ ...p, annualFeeWaived: !p.annualFeeWaived }))} />
                                        </div>
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <div style={{ flex: 1, position: "relative" }}>
                                                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontFamily: T.font.mono, fontSize: 12 }}>%</span>
                                                <input type="number" inputMode="decimal" pattern="[0-9]*" value={editForm.apr} onChange={e => setEditForm(p => ({ ...p, apr: e.target.value }))}
                                                    placeholder="Standard APR (%)" style={{ width: "100%", padding: "10px 24px 10px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontFamily: T.font.mono, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                                            </div>
                                        </div>
                                        <div style={{ marginTop: -4, paddingLeft: 4 }}>
                                            <PromoCheckbox checked={editForm.hasPromoApr} onChange={() => setEditForm(p => ({ ...p, hasPromoApr: !p.hasPromoApr }))} />
                                        </div>
                                        {editForm.hasPromoApr && <div style={{ display: "flex", gap: 8, marginTop: -4 }}>
                                            <div style={{ flex: 0.5, position: "relative" }}>
                                                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontFamily: T.font.mono, fontSize: 12 }}>%</span>
                                                <input type="number" inputMode="decimal" pattern="[0-9]*" value={editForm.promoAprAmount} onChange={e => setEditForm(p => ({ ...p, promoAprAmount: e.target.value }))}
                                                    placeholder="Promo APR" style={{ width: "100%", padding: "10px 24px 10px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontFamily: T.font.mono, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                                            </div>
                                            <div style={{ flex: 0.5, position: "relative" }}>
                                                <span style={{ position: "absolute", left: 10, top: "8px", color: T.text.dim, fontSize: 11, fontWeight: 700, pointerEvents: "none" }}>PROMO EXP</span>
                                                <input type="date" value={editForm.promoAprExp} onChange={e => setEditForm(p => ({ ...p, promoAprExp: e.target.value }))}
                                                    style={{ width: "100%", padding: "20px 10px 6px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 13, outline: "none", boxSizing: "border-box", height: "100%" }} />
                                            </div>
                                        </div>}
                                        <input value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))}
                                            placeholder="Notes" style={{ width: "100%", fontSize: 13, padding: "10px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, outline: "none", boxSizing: "border-box", marginTop: 2 }} />

                                        {/* Payment tracking */}
                                        <div style={{ paddingTop: 10, borderTop: `1px solid ${T.border.subtle}`, marginTop: 4 }}>
                                            <span style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono, fontWeight: 700, display: "block", marginBottom: 6 }}>PAYMENT TRACKING</span>
                                            <div style={{ display: "flex", gap: 6 }}>
                                                <div style={{ flex: 1 }}>
                                                    <span style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono, display: "block", marginBottom: 3 }}>STMT CLOSES</span>
                                                    <input type="number" inputMode="decimal" pattern="[0-9]*" min="1" max="31" value={editForm.statementCloseDay} onChange={e => setEditForm(p => ({ ...p, statementCloseDay: e.target.value }))}
                                                        placeholder="Day" style={{ width: "100%", padding: "8px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <span style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono, display: "block", marginBottom: 3 }}>PMT DUE</span>
                                                    <input type="number" inputMode="decimal" pattern="[0-9]*" min="1" max="31" value={editForm.paymentDueDay} onChange={e => setEditForm(p => ({ ...p, paymentDueDay: e.target.value }))}
                                                        placeholder="Day" style={{ width: "100%", padding: "8px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                                                </div>
                                                <div style={{ flex: 1, position: "relative" }}>
                                                    <span style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono, display: "block", marginBottom: 3 }}>MIN PMT</span>
                                                    <span style={{ position: "absolute", left: 8, bottom: 9, color: T.text.dim, fontSize: 11, fontWeight: 600 }}>$</span>
                                                    <input type="number" inputMode="decimal" pattern="[0-9]*" step="0.01" value={editForm.minPayment} onChange={e => setEditForm(p => ({ ...p, minPayment: e.target.value }))}
                                                        placeholder="35" style={{ width: "100%", padding: "8px 8px 8px 18px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                                            <button onClick={() => saveEdit(card.id)} style={{
                                                flex: 1, padding: 12, borderRadius: T.radius.sm, border: "none",
                                                background: T.accent.primaryDim, color: T.accent.primary, fontSize: 11, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                                            }}>
                                                <Check size={14} />Save</button>
                                            <button onClick={() => setEditingCard(null)} style={{
                                                flex: 1, padding: 12, borderRadius: T.radius.sm,
                                                border: `1px solid ${T.border.default}`, background: "transparent", color: T.text.dim, fontSize: 11, cursor: "pointer", fontWeight: 600
                                            }}>Cancel</button>
                                        </div>
                                    </div> :
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: T.text.primary }}>{getCardLabel(cards, card).replace(inst + " ", "")}</span>
                                            <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                                                {card.annualFee > 0 && <Badge variant={card.annualFeeWaived ? "green" : "amber"} style={{ fontSize: 8, padding: "1px 5px" }}>
                                                    {card.annualFeeWaived ? "WAIVED" : `AF ${fmt(card.annualFee)}`}{card.annualFeeDue && !card.annualFeeWaived ? ` · ${card.annualFeeDue}` : ""}
                                                </Badge>}
                                                {card.apr > 0 && <Badge variant="outline" style={{ fontSize: 8, padding: "1px 5px", color: T.text.secondary, borderColor: T.border.default }}>
                                                    {card.apr}% APR
                                                </Badge>}
                                                {card.hasPromoApr && <Badge variant="green" style={{ fontSize: 8, padding: "1px 5px" }}>
                                                    PROMO {card.promoAprAmount}%{card.promoAprExp ? ` till ${card.promoAprExp}` : ""}
                                                </Badge>}
                                                {card.paymentDueDay && <Badge variant="outline" style={{ fontSize: 8, padding: "1px 5px", color: T.text.dim, borderColor: T.border.default }}>
                                                    Due day {card.paymentDueDay}{card.minPayment ? ` · min ${fmt(card.minPayment)}` : ""}
                                                </Badge>}
                                                {card.notes && <Mono size={10} color={T.text.dim}>{card.notes}</Mono>}
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                            <Mono size={13} weight={700} color={colors.text}>{fmt(card.limit)}</Mono>
                                            <button onClick={() => startEdit(card)} style={{
                                                width: 30, height: 30, borderRadius: T.radius.sm,
                                                border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.dim,
                                                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
                                            }}>
                                                <Edit3 size={11} /></button>
                                            {editingCard !== card.id && <button onClick={() => removeCard(card.id)} style={{
                                                width: 30, height: 30, borderRadius: T.radius.sm,
                                                border: "none", background: T.status.redDim, color: T.status.red,
                                                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
                                            }}>
                                                <X size={11} /></button>}
                                        </div>
                                    </div>}
                            </div>
                        ))}
                    </div>}
                </Card>;
            })}
    </div>;

    // ─── Bank Accounts Section ─────────────────────────────────────
    const [showAddBank, setShowAddBank] = useState(false);
    const [addBankForm, setAddBankForm] = useState({ bank: "", accountType: "checking", productName: "", customName: "", apy: "", notes: "" });
    const [editingBank, setEditingBank] = useState(null);
    const [editBankForm, setEditBankForm] = useState({});
    const [collapsedBanks, setCollapsedBanks] = useState({});

    const bankProducts = useMemo(() => getBankProducts(addBankForm.bank), [addBankForm.bank]);
    const bankProductList = addBankForm.accountType === "checking" ? bankProducts.checking : bankProducts.savings;

    const groupedBanks = useMemo(() => {
        const g = {};
        bankAccounts.forEach(a => { (g[a.bank] = g[a.bank] || []).push(a); });
        return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
    }, [bankAccounts]);

    const addBankAccount = () => {
        const finalName = addBankForm.productName === "__other__" ? addBankForm.customName : addBankForm.productName;
        if (!finalName || !finalName.trim()) return;
        setBankAccounts([...bankAccounts, {
            id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `bank_${Date.now()}`,
            bank: addBankForm.bank, accountType: addBankForm.accountType,
            name: finalName.trim(),
            apy: addBankForm.apy === "" ? null : parseFloat(addBankForm.apy) || null,
            notes: addBankForm.notes,
        }]);
        setAddBankForm({ bank: "", accountType: "checking", productName: "", customName: "", apy: "", notes: "" });
        setShowAddBank(false);
    };

    const removeBankAccount = (id) => {
        const acct = bankAccounts.find(a => a.id === id);
        if (!window.confirm(`Delete "${acct?.name}"? This cannot be undone.`)) return;
        setBankAccounts(bankAccounts.filter(a => a.id !== id));
    };

    const startEditBank = (acct) => {
        setEditingBank(acct.id);
        setEditBankForm({ bank: acct.bank, accountType: acct.accountType, name: acct.name, apy: String(acct.apy || ""), notes: acct.notes || "" });
    };

    const saveEditBank = (id) => {
        setBankAccounts(bankAccounts.map(a => a.id === id ? {
            ...a, bank: editBankForm.bank || a.bank, accountType: editBankForm.accountType || a.accountType,
            name: (editBankForm.name || "").trim() || a.name,
            apy: editBankForm.apy === "" ? null : parseFloat(editBankForm.apy) || null,
            notes: editBankForm.notes,
        } : a));
        setEditingBank(null);
    };

    const bankSection = <div style={{ marginTop: 24 }}>
        {/* Bank Accounts Header */}
        <div style={{ paddingTop: 8, paddingBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Landmark size={18} color={T.accent.emerald} />
                    <h2 style={{ fontSize: 18, fontWeight: 800 }}>Bank Accounts</h2>
                </div>
                <p style={{ fontSize: 11, color: T.text.dim, marginTop: 4, fontFamily: T.font.mono }}>{bankAccounts.length} accounts</p>
            </div>
            <button onClick={() => setShowAddBank(!showAddBank)} style={{
                display: "flex", alignItems: "center", gap: 4, padding: "8px 14px",
                borderRadius: T.radius.md, border: `1px solid ${showAddBank ? T.status.amber : T.accent.emerald}30`,
                background: showAddBank ? T.status.amberDim : `${T.accent.emerald}12`, color: showAddBank ? T.status.amber : T.accent.emerald,
                fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font.mono
            }}>
                {showAddBank ? <><X size={12} />CANCEL</> : <><Plus size={12} />ADD ACCOUNT</>}
            </button>
        </div>

        {/* Add Bank Account Form */}
        {showAddBank && <Card animate variant="accent">
            <Label>New Bank Account</Label>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", gap: 8 }}>
                    <SearchableSelect
                        value={addBankForm.bank}
                        onChange={v => setAddBankForm(p => ({ ...p, bank: v, productName: "" }))}
                        placeholder="Select Bank"
                        options={getBankNames().map(b => ({ value: b, label: b }))}
                    />
                    <select value={addBankForm.accountType} onChange={e => setAddBankForm(p => ({ ...p, accountType: e.target.value, productName: "" }))}
                        style={{ flex: 0.6, fontSize: 12, padding: "12px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, outline: "none" }}>
                        <option value="checking">Checking</option>
                        <option value="savings">Savings</option>
                    </select>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <SearchableSelect
                        value={addBankForm.productName}
                        onChange={v => setAddBankForm(p => ({ ...p, productName: v }))}
                        placeholder="Select Account"
                        options={[...bankProductList.map(p => ({ value: p, label: p })), { value: "__other__", label: "Other (manual)" }]}
                    />
                    <input value={addBankForm.customName} onChange={e => setAddBankForm(p => ({ ...p, customName: e.target.value }))} placeholder="Account name"
                        disabled={addBankForm.productName !== "__other__"} style={{ flex: 0.6, fontSize: 12, padding: "12px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, opacity: addBankForm.productName === "__other__" ? 1 : 0.4, outline: "none", minWidth: 0 }} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ flex: 0.4, position: "relative" }}>
                        <input type="number" inputMode="decimal" step="0.01" value={addBankForm.apy} onChange={e => setAddBankForm(p => ({ ...p, apy: e.target.value }))} placeholder="APY"
                            style={{ width: "100%", padding: "12px 28px 12px 14px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontFamily: T.font.mono, fontSize: 13, outline: "none" }} />
                        <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontFamily: T.font.mono, fontSize: 12 }}>%</span>
                    </div>
                    <input value={addBankForm.notes} onChange={e => setAddBankForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes (optional)"
                        style={{ flex: 1, fontSize: 12, padding: "12px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, outline: "none" }} />
                </div>
                <button onClick={addBankAccount} disabled={!(addBankForm.bank && (addBankForm.productName === "__other__" ? addBankForm.customName?.trim() : addBankForm.productName))} style={{
                    padding: 14, borderRadius: T.radius.lg, border: "none",
                    background: (addBankForm.bank && (addBankForm.productName === "__other__" ? addBankForm.customName?.trim() : addBankForm.productName)) ? `linear-gradient(135deg,${T.accent.emerald},#34D399)` : T.text.muted,
                    color: (addBankForm.bank && (addBankForm.productName === "__other__" ? addBankForm.customName?.trim() : addBankForm.productName)) ? "#fff" : T.text.dim, fontSize: 14, fontWeight: 800,
                    cursor: (addBankForm.bank && (addBankForm.productName === "__other__" ? addBankForm.customName?.trim() : addBankForm.productName)) ? "pointer" : "not-allowed",
                    boxShadow: (addBankForm.bank && (addBankForm.productName === "__other__" ? addBankForm.customName?.trim() : addBankForm.productName)) ? `0 4px 12px ${T.accent.emerald}40` : "none"
                }}>Add Account</button>
            </div>
        </Card>}

        {/* Bank Accounts List */}
        {groupedBanks.length === 0 ?
            <EmptyState icon={Landmark} title="Track Your Bank Accounts" message="Add checking and savings accounts to complete your financial picture." /> :
            groupedBanks.map(([bank, accts]) => {
                const isCollapsed = collapsedBanks[bank];
                return <Card key={bank} animate variant="glass" style={{ marginBottom: 16, padding: 0, overflow: "hidden", borderLeft: `4px solid ${T.accent.emerald}` }}>
                    <div onClick={() => setCollapsedBanks(p => ({ ...p, [bank]: !isCollapsed }))} style={{ padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", background: `${T.accent.emerald}08` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ padding: 6, borderRadius: 8, background: T.accent.emerald, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <Building2 size={14} color={T.bg.card} />
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 800, color: T.accent.emerald, textTransform: "uppercase", letterSpacing: "0.05em" }}>{bank}</span>
                            <Badge variant="outline" style={{ fontSize: 11, color: T.accent.emerald, borderColor: `${T.accent.emerald}40` }}>{accts.length}</Badge>
                        </div>
                        {isCollapsed ? <ChevronDown size={14} color={T.text.dim} /> : <ChevronUp size={14} color={T.text.dim} />}
                    </div>
                    {!isCollapsed && <div style={{ padding: "16px 18px" }}>
                        {accts.map((acct, i) => (
                            <div key={acct.id} style={{ borderBottom: i === accts.length - 1 ? "none" : `1px solid ${T.border.subtle}`, padding: "14px 0" }}>
                                {editingBank === acct.id ?
                                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                        <input value={editBankForm.name} onChange={e => setEditBankForm(p => ({ ...p, name: e.target.value }))} placeholder="Account name"
                                            style={{ width: "100%", fontSize: 13, padding: "10px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, outline: "none", boxSizing: "border-box" }} />
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <div style={{ flex: 0.4, position: "relative" }}>
                                                <input type="number" inputMode="decimal" step="0.01" value={editBankForm.apy} onChange={e => setEditBankForm(p => ({ ...p, apy: e.target.value }))} placeholder="APY"
                                                    style={{ width: "100%", padding: "10px 24px 10px 10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, fontFamily: T.font.mono, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                                                <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: T.text.dim, fontSize: 12 }}>%</span>
                                            </div>
                                            <input value={editBankForm.notes} onChange={e => setEditBankForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes"
                                                style={{ flex: 1, fontSize: 13, padding: "10px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.primary, outline: "none", boxSizing: "border-box" }} />
                                        </div>
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <button onClick={() => saveEditBank(acct.id)} style={{
                                                flex: 1, padding: 12, borderRadius: T.radius.sm, border: "none",
                                                background: `${T.accent.emerald}18`, color: T.accent.emerald, fontSize: 11, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                                            }}>
                                                <Check size={14} />Save</button>
                                            <button onClick={() => setEditingBank(null)} style={{
                                                flex: 1, padding: 12, borderRadius: T.radius.sm,
                                                border: `1px solid ${T.border.default}`, background: "transparent", color: T.text.dim, fontSize: 11, cursor: "pointer", fontWeight: 600
                                            }}>Cancel</button>
                                        </div>
                                    </div> :
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: T.text.primary }}>{acct.name}</span>
                                            <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                                                <Badge variant={acct.accountType === "savings" ? "green" : "blue"} style={{ fontSize: 8, padding: "1px 5px" }}>
                                                    {acct.accountType === "savings" ? "SAVINGS" : "CHECKING"}
                                                </Badge>
                                                {acct.apy > 0 && <Badge variant="outline" style={{ fontSize: 8, padding: "1px 5px", color: T.accent.emerald, borderColor: `${T.accent.emerald}40` }}>
                                                    {acct.apy}% APY
                                                </Badge>}
                                                {acct.notes && <Mono size={10} color={T.text.dim}>{acct.notes}</Mono>}
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                            <button onClick={() => startEditBank(acct)} style={{
                                                width: 30, height: 30, borderRadius: T.radius.sm,
                                                border: `1px solid ${T.border.default}`, background: T.bg.elevated, color: T.text.dim,
                                                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
                                            }}>
                                                <Edit3 size={11} /></button>
                                            <button onClick={() => removeBankAccount(acct.id)} style={{
                                                width: 30, height: 30, borderRadius: T.radius.sm,
                                                border: "none", background: T.status.redDim, color: T.status.red,
                                                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
                                            }}>
                                                <X size={11} /></button>
                                        </div>
                                    </div>}
                            </div>
                        ))}
                    </div>}
                </Card>;
            })}
    </div>;

    return <div className="page-body" style={{ paddingBottom: 0, display: "flex", flexDirection: "column", gap: 32 }}>
        {creditCardsSection}
        {bankSection}
    </div>;
}
