// ═══════════════════════════════════════════════════════════════
// ADD ACCOUNT SHEET — Unified bottom sheet for adding accounts
// Extracted from CardPortfolioTab.jsx for maintainability.
// ═══════════════════════════════════════════════════════════════
  import { useState,type CSSProperties } from "react";
  import { createPortal } from "react-dom";
  import SearchableSelect from "../SearchableSelect.js";
  import { getBankNames,getBankProducts } from "../bankCatalog.js";
  import { T } from "../constants.js";
  import { haptic } from "../haptics.js";
  import {
    AlertTriangle,
    ArrowLeft,
    CheckCircle2,
    CreditCard,
    Landmark,
    Link2,
    Target,
    TrendingUp,
    Wallet,
    X
  } from "../icons";
  import { getIssuerCards,getPinnedForIssuer } from "../issuerCards.js";
  import { getTickerOptions } from "../tickerCatalog.js";
  import { FormGroup,FormRow } from "../ui.js";

const INSTITUTIONS = [
  "American Express",
  "Bank of America",
  "Barclays",
  "Capital One",
  "Chase",
  "Citi",
  "Discover",
  "FNBO",
  "Goldman Sachs",
  "HSBC",
  "Navy Federal",
  "PenFed",
  "Synchrony",
  "TD Bank",
  "US Bank",
  "USAA",
  "Wells Fargo",
  "Other",
];

const ENABLE_PLAID = true;

/**
 * @param {Object} props
 * @param {boolean} props.show - Whether to show the sheet
 * @param {string|null} props.step - Current form step (null = menu, 'card', 'bank', 'invest', 'goal', 'debt', 'asset')
 * @param {Function} props.onClose - Close the sheet
 * @param {Function} props.onSetStep - Set the current step
 * @param {Function} props.onAddCard - Add a credit card
 * @param {Function} props.onAddBank - Add a bank account
 * @param {Function} props.onAddInvestment - Add an investment holding
 * @param {Function} props.onAddGoal - Add a savings goal
 * @param {Function} props.onAddDebt - Add a debt
 * @param {Function} props.onAddAsset - Add an other asset
 * @param {Function} props.onPlaidConnect - Start Plaid connection
 * @param {boolean} props.plaidLoading - Whether Plaid is connecting
 * @param {string|null} props.plaidResult - Plaid result ('success', 'error', null)
 * @param {string|null} props.plaidError - Plaid error message
 * @param {Object} props.cardCatalog - Card catalog for issuer card lookup
 */
export default function AddAccountSheet({
  show,
  step,
  onClose,
  onSetStep,
  onAddCard,
  onAddBank,
  onAddInvestment,
  onAddGoal,
  onAddDebt,
  onAddAsset,
  onPlaidConnect,
  plaidLoading,
  plaidResult,
  plaidError,
  cardCatalog,
}) {
  // ── Card form state ──
  const [addForm, setAddForm] = useState({
    institution: "",
    cardChoice: "",
    customName: "",
    nickname: "",
    limit: "",
    annualFee: "",
  });
  const [addCardStep, setAddCardStep] = useState(0);
  // ── Bank form state ──
  const [addBankForm, setAddBankForm] = useState({
    bank: "",
    accountType: "checking",
    productName: "",
    customName: "",
    apy: "",
    notes: "",
  });
  const [addBankStep, setAddBankStep] = useState(0);
  // ── Investment form state ──
  const [investKey, setInvestKey] = useState("brokerage");
  const [investSym, setInvestSym] = useState("");
  const [investShares, setInvestShares] = useState("");
  // ── Goal form state ──
  const [goalForm, setGoalForm] = useState({ name: "", targetAmount: "", currentAmount: "", targetDate: "" });
  // ── Debt form state ──
  const [debtForm, setDebtForm] = useState({ name: "", type: "personal", balance: "", apr: "", minPayment: "" });
  const [addDebtStep, setAddDebtStep] = useState(0);
  // ── Asset form state ──
  const [assetForm, setAssetForm] = useState({ name: "", value: "", liquid: false });

  if (!show) return null;



  const formInputStyle: CSSProperties = {
    flex: 1,
    border: "none",
    background: "transparent",
    color: T.text.primary,
    fontSize: 14,
    fontWeight: 600,
    textAlign: "right",
    outline: "none",
    padding: 0,
    minWidth: 50,
  };

  const submitBtnStyle = (enabled, color) => ({
    padding: "14px",
    borderRadius: T.radius.md,
    border: "none",
    background: enabled ? color : T.bg.card,
    color: enabled ? "#fff" : T.text.muted,
    fontSize: 14,
    fontWeight: 800,
    cursor: enabled ? "pointer" : "not-allowed",
    transition: "all .2s",
  });

  // Shared segmented control component
  const SegmentedControl = ({ steps, currentStep, onStepChange, color = T.accent.primary }) => (
    <div
      style={{
        display: "flex",
        borderRadius: T.radius.md,
        background: T.bg.card,
        border: `1px solid ${T.border.default}`,
        padding: 2,
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 2,
          left: `calc(${currentStep * (100 / steps.length)}% + 2px)`,
          width: `calc(${100 / steps.length}% - 4px)`,
          height: "calc(100% - 4px)",
          borderRadius: T.radius.sm,
          background: `${color}20`,
          transition: "left 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          zIndex: 0,
        }}
      />
      {steps.map((step, idx) => (
        <button
          key={idx}
          onClick={() => {
            haptic.selection();
            onStepChange(idx);
          }}
          style={{
            flex: 1,
            padding: "7px 0",
            border: "none",
            background: "transparent",
            color: currentStep === idx ? color : T.text.dim,
            fontSize: 10,
            fontWeight: currentStep === idx ? 800 : 600,
            cursor: "pointer",
            fontFamily: T.font.mono,
            position: "relative",
            zIndex: 1,
            transition: "color 0.2s",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          {step.filled && currentStep !== idx && <CheckCircle2 size={9} style={{ opacity: 0.6 }} />}
          {step.label}
        </button>
      ))}
    </div>
  );

  // Shared nav buttons
  const NavButtons = ({
    step,
    maxStep,
    onPrev,
    onNext,
    onSubmit,
    submitLabel,
    canSubmit,
    color = T.accent.primary,
  }) => (
    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
      {step > 0 && (
        <button
          onClick={onPrev}
          style={{
            flex: 0.6,
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
          ← Back
        </button>
      )}
      <button
        className="hover-btn"
        onClick={onSubmit}
        disabled={!canSubmit}
        style={{
          flex: 1,
          padding: 12,
          borderRadius: T.radius.sm,
          border: "none",
          background: canSubmit ? color : T.bg.card,
          color: canSubmit ? "#fff" : T.text.muted,
          fontSize: 12,
          fontWeight: 800,
          cursor: canSubmit ? "pointer" : "not-allowed",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        {submitLabel}
      </button>
      {step < maxStep && (
        <button
          onClick={onNext}
          style={{
            flex: 0.6,
            padding: 12,
            borderRadius: T.radius.sm,
            border: `1px solid ${T.border.default}`,
            background: "transparent",
            color: T.text.primary,
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Next →
        </button>
      )}
    </div>
  );

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          zIndex: 500,
          animation: "sheetFadeIn .2s ease both",
        }}
      />
      {/* Sheet */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: T.bg.elevated,
          borderRadius: "24px 24px 0 0",
          zIndex: 501,
          animation: "sheetSlideUp .32s cubic-bezier(0.34,1.56,0.64,1) both",
          maxHeight: "88vh",
          overflowY: "auto",
          paddingBottom: "max(20px, env(safe-area-inset-bottom))",
          boxShadow: "0 -12px 48px rgba(0,0,0,0.3)",
        }}
      >
        {/* Drag handle */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: T.border.default, margin: "12px auto 0" }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", padding: "16px 20px 12px", gap: 8 }}>
          {step && (
            <button
              onClick={() => onSetStep(null)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                border: "none",
                background: T.bg.card,
                color: T.text.secondary,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <span style={{ flex: 1, fontSize: 17, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>
            {!step && "Add to Portfolio"}
            {step === "card" && "Add Credit Card"}
            {step === "bank" && "Add Bank Account"}
            {step === "invest" && "Add Investment"}
            {step === "goal" && "Add Savings Goal"}
            {step === "asset" && "Add Other Asset"}
            {step === "debt" && "Add Debt / Loan"}
          </span>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              border: "none",
              background: T.bg.card,
              color: T.text.secondary,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: "0 16px 16px" }}>
          {/* ── MENU STEP ── */}
          {!step && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Plaid hero button */}
              {ENABLE_PLAID && (
                <button
                  onClick={onPlaidConnect}
                  disabled={plaidLoading}
                  style={{
                    width: "100%",
                    padding: "14px",
                    borderRadius: T.radius.md,
                    border: "none",
                    cursor: plaidLoading ? "wait" : "pointer",
                    background: plaidLoading ? T.bg.card : "linear-gradient(135deg, #1a7cda 0%, #12b886 100%)",
                    position: "relative",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    textAlign: "left",
                    boxShadow: plaidLoading
                      ? "none"
                      : "0 8px 28px rgba(26,124,218,0.35), inset 0 1px 0 rgba(255,255,255,0.15)",
                    transition: "all .25s",
                  }}
                >
                  {!plaidLoading && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background:
                          "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)",
                        backgroundSize: "200% 100%",
                        animation: "shimmerSlide 2.4s linear infinite",
                      }}
                    />
                  )}
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 13,
                      background: "rgba(255,255,255,0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      border: "1px solid rgba(255,255,255,0.2)",
                    }}
                  >
                    {plaidLoading ? (
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          border: "2.5px solid rgba(255,255,255,0.3)",
                          borderTopColor: "#fff",
                          animation: "spin 0.8s linear infinite",
                        }}
                      />
                    ) : (
                      <Link2 size={20} color="#fff" strokeWidth={2.5} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 800,
                        color: plaidLoading ? T.text.secondary : "#fff",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {plaidLoading ? "Connecting…" : "Connect with Plaid"}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: plaidLoading ? T.text.muted : "rgba(255,255,255,0.78)",
                        marginTop: 2,
                      }}
                    >
                      Auto-sync your bank accounts &amp; cards · 12,000+ institutions
                    </div>
                  </div>
                  {!plaidLoading && (
                    <div
                      style={{
                        fontSize: 10,
                        color: "rgba(255,255,255,0.6)",
                        fontWeight: 700,
                        letterSpacing: "0.05em",
                        flexShrink: 0,
                      }}
                    >
                      SECURE →
                    </div>
                  )}
                </button>
              )}
              {/* Plaid feedback */}
              {plaidResult === "success" && (
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: T.radius.md,
                    background: `${T.status.green}15`,
                    border: `1px solid ${T.status.green}30`,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <CheckCircle2 size={16} color={T.status.green} />
                  <span style={{ fontSize: 13, color: T.status.green, fontWeight: 600 }}>
                    Connected! Accounts imported.
                  </span>
                </div>
              )}
              {plaidResult === "error" && (
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: T.radius.md,
                    background: `${T.status.red}10`,
                    border: `1px solid ${T.status.red}25`,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <AlertTriangle size={14} color={T.status.red} />
                  <span style={{ fontSize: 12, color: T.status.red }}>{plaidError || "Connection failed"}</span>
                </div>
              )}
              {/* Divider */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "0 4px" }}>
                <div style={{ flex: 1, height: 1, background: T.border.subtle }} />
                <span style={{ fontSize: 11, color: T.text.muted, fontFamily: T.font.mono, fontWeight: 700 }}>
                  OR ADD MANUALLY
                </span>
                <div style={{ flex: 1, height: 1, background: T.border.subtle }} />
              </div>
              {/* Manual option grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { id: "card", icon: CreditCard, label: "Credit Card", color: T.accent.primary },
                  { id: "bank", icon: Landmark, label: "Bank Account", color: T.status.blue },
                  { id: "debt", icon: AlertTriangle, label: "Debt & Loan", color: T.status.amber },
                  { id: "invest", icon: TrendingUp, label: "Investment", color: T.accent.emerald },
                  { id: "goal", icon: Target, label: "Savings Goal", color: T.accent.primary },
                  { id: "asset", icon: Wallet, label: "Other Asset", color: T.accent.copper },
                ].map(({ id, icon: Icon, label, color }) => (
                  <button
                    key={id}
                    onClick={() => onSetStep(id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "14px 16px",
                      borderRadius: T.radius.lg,
                      border: `1.5px solid ${color}25`,
                      background: `${color}08`,
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all .2s",
                    }}
                  >
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        background: `${color}18`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        border: `1px solid ${color}30`,
                      }}
                    >
                      <Icon size={16} color={color} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.text.primary }}>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── CARD FORM ── */}
          {step === "card" &&
            (() => {
              const cardList = (() => {
                const list = getIssuerCards(addForm.institution, cardCatalog);
                const pinned = getPinnedForIssuer(addForm.institution, cardCatalog);
                const pinnedSet = new Set(pinned.map(p => p.toLowerCase()));
                return [
                  ...list
                    .filter(c => pinnedSet.has(c.name.toLowerCase()) && c.status !== "discontinued")
                    .map(c => ({ value: c.name, label: c.name, group: "Popular" })),
                  ...list
                    .filter(c => !pinnedSet.has(c.name.toLowerCase()) && c.status !== "discontinued")
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(c => ({ value: c.name, label: c.name, group: "All" })),
                  { value: "__other__", label: "Other / Custom…" },
                ];
              })();
              const canAdd = !!(
                addForm.institution &&
                (addForm.cardChoice && addForm.cardChoice !== "__other__" ? true : addForm.customName?.trim())
              );
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <SegmentedControl
                    steps={[
                      { label: "Card", filled: !!(addForm.institution || addForm.cardChoice) },
                      { label: "Details", filled: !!(addForm.limit || addForm.annualFee || addForm.nickname) },
                    ]}
                    currentStep={addCardStep}
                    onStepChange={setAddCardStep}
                  />

                  {addCardStep === 0 && (
                    <FormGroup label="Issuer & Card">
                      <FormRow label="Issuer / Bank">
                        <div style={{ width: "100%", maxWidth: 180 }}>
                          <SearchableSelect
                            value={addForm.institution}
                            onChange={v => setAddForm(p => ({ ...p, institution: v, cardChoice: "", customName: "" }))}
                            placeholder="Select Issuer…"
                            options={INSTITUTIONS.map(i => ({ value: i, label: i }))}
                          />
                        </div>
                      </FormRow>
                      {addForm.institution && (
                        <FormRow label="Card Product" isLast={addForm.cardChoice !== "__other__"}>
                          <div style={{ width: "100%", maxWidth: 180 }}>
                            <SearchableSelect
                              value={addForm.cardChoice}
                              onChange={v => setAddForm(p => ({ ...p, cardChoice: v }))}
                              placeholder="Select Card…"
                              options={cardList}
                            />
                          </div>
                        </FormRow>
                      )}
                      {addForm.cardChoice === "__other__" && (
                        <FormRow label="Custom Name" isLast>
                          <input
                            value={addForm.customName}
                            onChange={e => setAddForm(p => ({ ...p, customName: e.target.value }))}
                            placeholder="e.g. My Custom Card"
                            style={formInputStyle}
                          />
                        </FormRow>
                      )}
                    </FormGroup>
                  )}

                  {addCardStep === 1 && (
                    <FormGroup label="Limit & Fees">
                      <FormRow label="Credit Limit $">
                        <input
                          type="number"
                          inputMode="decimal"
                          value={addForm.limit}
                          onChange={e => setAddForm(p => ({ ...p, limit: e.target.value }))}
                          placeholder="0.00"
                          style={formInputStyle}
                        />
                      </FormRow>
                      <FormRow label="Annual Fee $">
                        <input
                          type="number"
                          inputMode="decimal"
                          value={addForm.annualFee}
                          onChange={e => setAddForm(p => ({ ...p, annualFee: e.target.value }))}
                          placeholder="0.00"
                          style={formInputStyle}
                        />
                      </FormRow>
                      <FormRow label="Nickname" isLast>
                        <input
                          value={addForm.nickname}
                          onChange={e => setAddForm(p => ({ ...p, nickname: e.target.value }))}
                          placeholder="Optional"
                          style={formInputStyle}
                        />
                      </FormRow>
                    </FormGroup>
                  )}

                  <NavButtons
                    step={addCardStep}
                    maxStep={1}
                    onPrev={() => {
                      haptic.selection();
                      setAddCardStep(s => s - 1);
                    }}
                    onNext={() => {
                      haptic.selection();
                      setAddCardStep(s => s + 1);
                    }}
                    onSubmit={() => {
                      if (!canAdd) return;
                      onAddCard({
                        institution: addForm.institution,
                        name: (addForm.cardChoice === "__other__" ? addForm.customName : addForm.cardChoice).trim(),
                        nickname: addForm.nickname || "",
                        limit: addForm.limit === "" ? null : parseFloat(addForm.limit) || null,
                        annualFee: addForm.annualFee === "" ? null : parseFloat(addForm.annualFee) || null,
                      });
                      setAddForm({
                        institution: "",
                        cardChoice: "",
                        customName: "",
                        nickname: "",
                        limit: "",
                        annualFee: "",
                      });
                      setAddCardStep(0);
                      onClose();
                    }}
                    submitLabel="Add Card"
                    canSubmit={canAdd}
                    color={T.accent.gradient}
                  />
                </div>
              );
            })()}

          {/* ── BANK FORM ── */}
          {step === "bank" &&
            (() => {
              const bProds = getBankProducts(addBankForm.bank);
              const bList = addBankForm.accountType === "checking" ? bProds.checking : bProds.savings;
              const canAdd = !!(
                addBankForm.bank &&
                (addBankForm.productName === "__other__"
                  ? addBankForm.customName?.trim()
                  : addBankForm.productName?.trim())
              );
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <SegmentedControl
                    steps={[
                      { label: "Account", filled: !!(addBankForm.bank || addBankForm.productName) },
                      { label: "Details", filled: !!addBankForm.apy },
                    ]}
                    currentStep={addBankStep}
                    onStepChange={setAddBankStep}
                    color={T.status.blue}
                  />

                  {addBankStep === 0 && (
                    <FormGroup label="Institution & Type">
                      <FormRow label="Bank Name">
                        <div style={{ width: "100%", maxWidth: 180 }}>
                          <SearchableSelect
                            value={addBankForm.bank}
                            onChange={v => setAddBankForm(p => ({ ...p, bank: v, productName: "", customName: "" }))}
                            placeholder="Select Bank…"
                            options={getBankNames().map(n => ({ value: n, label: n }))}
                          />
                        </div>
                      </FormRow>
                      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border.subtle}` }}>
                        <div style={{ display: "flex", background: T.bg.card, borderRadius: T.radius.sm, padding: 3 }}>
                          {["checking", "savings"].map(t => (
                            <button
                              key={t}
                              onClick={() => {
                                haptic.selection();
                                setAddBankForm(p => ({ ...p, accountType: t, productName: "", customName: "" }));
                              }}
                              style={{
                                flex: 1,
                                padding: "11px",
                                border: "none",
                                borderRadius: T.radius.sm,
                                background: addBankForm.accountType === t ? T.status.blue : T.bg.card,
                                color: addBankForm.accountType === t ? "#fff" : T.text.secondary,
                                fontSize: 13,
                                fontWeight: 700,
                                cursor: "pointer",
                                textTransform: "capitalize",
                              }}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                      {addBankForm.bank && bList.length > 0 && (
                        <FormRow label="Account Product" isLast={addBankForm.productName !== "__other__"}>
                          <div style={{ width: "100%", maxWidth: 180 }}>
                            <SearchableSelect
                              value={addBankForm.productName}
                              onChange={v => setAddBankForm(p => ({ ...p, productName: v }))}
                              placeholder="Select Product…"
                              options={[
                                ...bList.map(n => ({ value: n, label: n })),
                                { value: "__other__", label: "Other…" },
                              ]}
                            />
                          </div>
                        </FormRow>
                      )}
                      {(!addBankForm.bank || bList.length === 0 || addBankForm.productName === "__other__") && (
                        <FormRow label="Custom Name" isLast>
                          <input
                            value={addBankForm.customName}
                            onChange={e => setAddBankForm(p => ({ ...p, customName: e.target.value }))}
                            placeholder="e.g. My Checking"
                            style={formInputStyle}
                          />
                        </FormRow>
                      )}
                    </FormGroup>
                  )}

                  {addBankStep === 1 && (
                    <FormGroup label="Interest & Rates">
                      <FormRow label="APY %" isLast>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          value={addBankForm.apy}
                          onChange={e => setAddBankForm(p => ({ ...p, apy: e.target.value }))}
                          placeholder="0.00"
                          style={formInputStyle}
                        />
                      </FormRow>
                    </FormGroup>
                  )}

                  <NavButtons
                    step={addBankStep}
                    maxStep={1}
                    onPrev={() => {
                      haptic.selection();
                      setAddBankStep(s => s - 1);
                    }}
                    onNext={() => {
                      haptic.selection();
                      setAddBankStep(s => s + 1);
                    }}
                    onSubmit={() => {
                      if (!canAdd) return;
                      onAddBank({
                        bank: addBankForm.bank,
                        accountType: addBankForm.accountType,
                        name: (addBankForm.productName === "__other__"
                          ? addBankForm.customName
                          : addBankForm.productName
                        ).trim(),
                        apy: addBankForm.apy === "" ? null : parseFloat(addBankForm.apy) || null,
                        notes: addBankForm.notes,
                      });
                      setAddBankForm({
                        bank: "",
                        accountType: "checking",
                        productName: "",
                        customName: "",
                        apy: "",
                        notes: "",
                      });
                      setAddBankStep(0);
                      onClose();
                    }}
                    submitLabel="Add Account"
                    canSubmit={canAdd}
                    color={`linear-gradient(135deg, ${T.status.blue}, #1a56db)`}
                  />
                </div>
              );
            })()}

          {/* ── INVESTMENT FORM ── */}
          {step === "invest" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                {[
                  { key: "roth", label: "Roth IRA", color: T.accent.primary },
                  { key: "k401", label: "401(k)", color: T.status.blue },
                  { key: "brokerage", label: "Brokerage", color: T.accent.emerald },
                  { key: "hsa", label: "HSA", color: "#06B6D4" },
                  { key: "crypto", label: "Crypto", color: T.status.amber },
                ].map(o => (
                  <button
                    key={o.key}
                    onClick={() => setInvestKey(o.key)}
                    style={{
                      padding: "7px 14px",
                      borderRadius: 99,
                      border: `1.5px solid ${investKey === o.key ? o.color : T.border.default}`,
                      background: investKey === o.key ? `${o.color}18` : "transparent",
                      color: investKey === o.key ? o.color : T.text.secondary,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              <FormGroup label="Holding Details">
                <FormRow label="Asset / Ticker">
                  {investSym === "__custom__" ? (
                    <input
                      placeholder="Ticker symbol"
                      onChange={e => setInvestSym(e.target.value.toUpperCase())}
                      style={formInputStyle}
                    />
                  ) : (
                    <div style={{ width: "100%", maxWidth: 200 }}>
                      <SearchableSelect
                        value={investSym}
                        onChange={setInvestSym}
                        placeholder={investKey === "crypto" ? "Search crypto…" : "Search ticker…"}
                        options={[
                          ...getTickerOptions(investKey).map(c => ({
                            value: c.symbol,
                            label: `${c.symbol.replace("-USD", "")} — ${c.name}`,
                          })),
                          { value: "__custom__", label: "Custom ticker…" },
                        ]}
                      />
                    </div>
                  )}
                </FormRow>
                <FormRow label={investKey === "crypto" ? "Amount/Coins" : "Shares"} isLast>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={investShares}
                    onChange={e => setInvestShares(e.target.value)}
                    placeholder="0.00"
                    style={formInputStyle}
                  />
                </FormRow>
              </FormGroup>

              <button
                className="hover-btn"
                onClick={() => {
                  const canAdd = !!(investSym?.trim() && Number(investShares) > 0);
                  if (!canAdd) return;
                  haptic.success();
                  const finalSym = investSym.toUpperCase().replace("-USD", "") + (investKey === "crypto" ? "-USD" : "");
                  onAddInvestment(investKey, finalSym, parseFloat(investShares));
                  setInvestKey("brokerage");
                  setInvestSym("");
                  setInvestShares("");
                  onClose();
                }}
                disabled={!(investSym?.trim() && Number(investShares) > 0)}
                style={submitBtnStyle(
                  !!(investSym?.trim() && Number(investShares) > 0),
                  `linear-gradient(135deg, ${T.accent.emerald}, #0ca678)`
                )}
              >
                Add Holding
              </button>
            </div>
          )}

          {/* ── SAVINGS GOAL FORM ── */}
          {step === "goal" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <FormGroup label="Goal Details">
                <FormRow label="Name">
                  <input
                    value={goalForm.name}
                    onChange={e => setGoalForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="Emergency Fund"
                    style={formInputStyle}
                  />
                </FormRow>
                <FormRow label="Target $">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={goalForm.targetAmount}
                    onChange={e => setGoalForm(p => ({ ...p, targetAmount: e.target.value }))}
                    placeholder="0.00"
                    style={formInputStyle}
                  />
                </FormRow>
                <FormRow label="Current $">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={goalForm.currentAmount}
                    onChange={e => setGoalForm(p => ({ ...p, currentAmount: e.target.value }))}
                    placeholder="0.00"
                    style={formInputStyle}
                  />
                </FormRow>
                <FormRow label="Target Date" isLast>
                  <input
                    type="date"
                    value={goalForm.targetDate}
                    onChange={e => setGoalForm(p => ({ ...p, targetDate: e.target.value }))}
                    style={{ ...formInputStyle, fontFamily: T.font.sans, color: goalForm.targetDate ? T.text.primary : T.text.muted }}
                  />
                </FormRow>
              </FormGroup>

              <button
                className="hover-btn"
                onClick={() => {
                  if (!goalForm.name.trim()) return;
                  haptic.success();
                  onAddGoal({
                    name: goalForm.name.trim(),
                    targetAmount: parseFloat(goalForm.targetAmount) || 0,
                    currentAmount: parseFloat(goalForm.currentAmount) || 0,
                    targetDate: goalForm.targetDate,
                  });
                  setGoalForm({ name: "", targetAmount: "", currentAmount: "", targetDate: "" });
                  onClose();
                }}
                disabled={!goalForm.name.trim()}
                style={submitBtnStyle(!!goalForm.name.trim(), T.accent.gradient)}
              >
                Add Goal
              </button>
            </div>
          )}

          {/* ── DEBT FORM ── */}
          {step === "debt" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <SegmentedControl
                steps={[
                  { label: "Debt", filled: !!(debtForm.name || debtForm.type) },
                  { label: "Terms", filled: !!(debtForm.balance || debtForm.apr || debtForm.minPayment) },
                ]}
                currentStep={addDebtStep}
                onStepChange={setAddDebtStep}
                color={T.status.amber}
              />

              {addDebtStep === 0 && (
                <FormGroup label="Name & Type">
                  <FormRow label="Debt Name">
                    <input
                      value={debtForm.name}
                      onChange={e => setDebtForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="e.g. Auto Loan"
                      style={formInputStyle}
                    />
                  </FormRow>
                  <div style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      {[
                        { key: "auto", label: "Auto" },
                        { key: "student", label: "Student" },
                        { key: "mortgage", label: "Mortgage" },
                        { key: "personal", label: "Personal" },
                        { key: "medical", label: "Medical" },
                      ].map(t => (
                        <button
                          key={t.key}
                          onClick={() => setDebtForm(p => ({ ...p, type: t.key }))}
                          style={{
                            flex: 1,
                            padding: "8px 0",
                            borderRadius: T.radius.sm,
                            border: `1px solid ${debtForm.type === t.key ? T.status.amber : T.border.default}`,
                            background: debtForm.type === t.key ? `${T.status.amber}18` : T.bg.card,
                            color: debtForm.type === t.key ? T.status.amber : T.text.secondary,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                            boxSizing: "border-box",
                          }}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </FormGroup>
              )}

              {addDebtStep === 1 && (
                <FormGroup label="Balance & Rates">
                  <FormRow label="Current Balance">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={debtForm.balance}
                      onChange={e => setDebtForm(p => ({ ...p, balance: e.target.value }))}
                      placeholder="0.00"
                      style={formInputStyle}
                    />
                  </FormRow>
                  <FormRow label="Interest APR">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={debtForm.apr}
                      onChange={e => setDebtForm(p => ({ ...p, apr: e.target.value }))}
                      placeholder="0.0 %"
                      style={formInputStyle}
                    />
                  </FormRow>
                  <FormRow label="Min. Payment $" isLast>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={debtForm.minPayment}
                      onChange={e => setDebtForm(p => ({ ...p, minPayment: e.target.value }))}
                      placeholder="0.00"
                      style={formInputStyle}
                    />
                  </FormRow>
                </FormGroup>
              )}

              <NavButtons
                step={addDebtStep}
                maxStep={1}
                onPrev={() => {
                  haptic.selection();
                  setAddDebtStep(s => s - 1);
                }}
                onNext={() => {
                  haptic.selection();
                  setAddDebtStep(s => s + 1);
                }}
                onSubmit={() => {
                  if (!debtForm.name.trim()) return;
                  haptic.success();
                  onAddDebt({
                    name: debtForm.name.trim(),
                    type: debtForm.type,
                    balance: parseFloat(debtForm.balance) || 0,
                    apr: parseFloat(debtForm.apr) || 0,
                    minPayment: parseFloat(debtForm.minPayment) || 0,
                  });
                  setDebtForm({ name: "", type: "personal", balance: "", apr: "", minPayment: "" });
                  setAddDebtStep(0);
                  onClose();
                }}
                submitLabel="Add Debt"
                canSubmit={!!debtForm.name.trim()}
                color={`linear-gradient(135deg, ${T.status.amber}, #d35400)`}
              />
            </div>
          )}

          {/* ── OTHER ASSET FORM ── */}
          {step === "asset" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <FormGroup label="Asset Details">
                <FormRow label="Name">
                  <input
                    value={assetForm.name}
                    onChange={e => setAssetForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Vehicle, Property"
                    style={formInputStyle}
                  />
                </FormRow>
                <FormRow label="Est. Value $">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={assetForm.value}
                    onChange={e => setAssetForm(p => ({ ...p, value: e.target.value }))}
                    placeholder="0.00"
                    style={formInputStyle}
                  />
                </FormRow>
                <FormRow label="Liquidity" isLast>
                  <button
                    onClick={() => {
                      haptic.selection();
                      setAssetForm(p => ({ ...p, liquid: !p.liquid }));
                    }}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 99,
                      border: `1.5px solid ${assetForm.liquid ? T.accent.emerald : T.border.default}`,
                      background: assetForm.liquid ? `${T.accent.emerald}18` : T.bg.card,
                      color: assetForm.liquid ? T.accent.emerald : T.text.secondary,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {assetForm.liquid ? "💧 Liquid" : "🔒 Illiquid"}
                  </button>
                </FormRow>
              </FormGroup>

              <button
                className="hover-btn"
                onClick={() => {
                  if (!assetForm.name.trim()) return;
                  haptic.success();
                  onAddAsset({
                    name: assetForm.name.trim(),
                    value: parseFloat(assetForm.value) || 0,
                    liquid: assetForm.liquid,
                  });
                  setAssetForm({ name: "", value: "", liquid: false });
                  onClose();
                }}
                disabled={!assetForm.name.trim()}
                style={submitBtnStyle(!!assetForm.name.trim(), `linear-gradient(135deg, ${T.accent.copper}, #e67e22)`)}
              >
                Add Asset
              </button>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
