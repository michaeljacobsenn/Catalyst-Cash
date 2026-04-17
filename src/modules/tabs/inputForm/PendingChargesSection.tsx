import type { ChangeEvent, ReactNode } from "react";
import { CustomSelect as UICustomSelect, DI as UIDI } from "../../components.js";
import { T } from "../../constants.js";
import { AlertTriangle, CheckCircle, Plus, Trash2 } from "../../icons";
import { Card, Label } from "../../ui.js";
import { sanitizeDollar, toNumber, type MoneyInput } from "./utils.js";
import type { PendingCharge } from "./model.js";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectGroup {
  label: string;
  options: SelectOption[];
}

interface DollarInputProps {
  value: MoneyInput | "";
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  label?: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectGroup[];
  placeholder?: string;
  ariaLabel?: string;
  icon?: ReactNode;
}

interface PendingChargesSectionProps {
  pendingCharges: PendingCharge[];
  cardOptions: SelectGroup[];
  onAddCharge: () => void;
  onSelectCard: (index: number, cardId: string) => void;
  onChangeAmount: (index: number, value: MoneyInput) => void;
  onRemoveCharge: (index: number) => void;
  onChangeDescription: (index: number, value: string) => void;
  onToggleConfirmed: (index: number) => void;
}

const DI = UIDI as unknown as (props: DollarInputProps) => ReactNode;
const CustomSelect = UICustomSelect as unknown as (props: CustomSelectProps) => ReactNode;

export function PendingChargesSection({
  pendingCharges,
  cardOptions,
  onAddCharge,
  onSelectCard,
  onChangeAmount,
  onRemoveCharge,
  onChangeDescription,
  onToggleConfirmed,
}: PendingChargesSectionProps) {
  if (!pendingCharges.length) {
    return (
      <button
        onClick={onAddCharge}
        className="hover-btn"
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "16px 18px",
          borderRadius: T.radius.lg,
          border: `1px solid ${T.border.default}`,
          background: T.bg.glass,
          color: T.text.primary,
          fontSize: 14,
          fontWeight: 800,
          cursor: "pointer",
          marginBottom: 10,
          transition: "all .2s ease",
          boxShadow: T.shadow.soft,
        }}
      >
        <Plus size={16} color={T.accent.primary} strokeWidth={2.8} /> Add Pending Charge
      </button>
    );
  }

  const confirmedChargeCount = pendingCharges.filter((charge) => toNumber(charge.amount) > 0).length;
  const pendingChargeTotal = pendingCharges.reduce((sum, charge) => sum + toNumber(charge.amount), 0);

  return (
    <Card variant="glass" style={{ padding: "12px 14px", position: "relative", overflow: "hidden", marginBottom: 10 }}>
      <div
        style={{
          position: "absolute",
          right: -20,
          bottom: -20,
          width: 60,
          height: 60,
          background: T.status.amber,
          filter: "blur(40px)",
          opacity: 0.06,
          borderRadius: "50%",
          pointerEvents: "none",
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Label style={{ marginBottom: 0, fontWeight: 800 }}>Pending Charges</Label>
        <button
          onClick={onAddCharge}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 10px",
            borderRadius: T.radius.sm,
            border: `1px solid ${T.status.amber}40`,
            background: `${T.status.amber}0A`,
            color: T.status.amber,
            fontSize: 10,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: T.font.mono,
          }}
        >
          <Plus size={11} />
          ADD
        </button>
      </div>
      {pendingCharges.map((charge, index) => (
        <div
          key={index}
          className="slide-up"
          style={{
            marginBottom: 6,
            background: T.bg.elevated,
            borderRadius: T.radius.md,
            padding: "8px 10px",
            border: `1px solid ${charge.confirmed ? `${T.status.green}40` : T.border.default}`,
            transition: "border-color .2s",
            animationDelay: `${index * 0.06}s`,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(124px, 0.56fr) 44px",
              gap: 8,
              alignItems: "center",
              marginBottom: 6,
            }}
          >
            <CustomSelect
              ariaLabel={`Pending charge card ${index + 1}`}
              value={charge.cardId || ""}
              onChange={(value) => onSelectCard(index, value)}
              placeholder="Card..."
              options={cardOptions}
            />
            <div style={{ minWidth: 0 }}>
              <DI
                value={charge.amount}
                onChange={(event) => onChangeAmount(index, sanitizeDollar(event.target.value))}
              />
            </div>
            <button
              onClick={() => onRemoveCharge(index)}
              style={{
                width: 44,
                height: 44,
                borderRadius: T.radius.sm,
                border: "none",
                background: T.status.redDim,
                color: T.status.red,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="text"
              aria-label={`Pending charge description ${index + 1}`}
              value={charge.description || ""}
              onChange={(event) => onChangeDescription(index, event.target.value)}
              placeholder="Description..."
              style={{
                flex: 1,
                boxSizing: "border-box",
                padding: "7px 10px",
                borderRadius: T.radius.md,
                border: `1px solid ${T.border.default}`,
                background: T.bg.card,
                color: T.text.primary,
                fontSize: 11,
              }}
            />
            <button
              onClick={() => onToggleConfirmed(index)}
              style={{
                padding: "7px 12px",
                borderRadius: T.radius.md,
                cursor: "pointer",
                fontSize: 10,
                fontWeight: 800,
                fontFamily: T.font.mono,
                display: "flex",
                alignItems: "center",
                gap: 4,
                flexShrink: 0,
                whiteSpace: "nowrap",
                border: charge.confirmed ? `1px solid ${T.status.green}30` : `1px solid ${T.status.amber}40`,
                background: charge.confirmed ? T.status.greenDim : T.status.amberDim,
                color: charge.confirmed ? T.status.green : T.status.amber,
              }}
            >
              {charge.confirmed ? (
                <>
                  <CheckCircle size={11} />
                  OK
                </>
              ) : (
                <>
                  <AlertTriangle size={11} />
                  CONFIRM
                </>
              )}
            </button>
          </div>
        </div>
      ))}
      {confirmedChargeCount > 1 && (
        <div
          style={{ fontSize: 10, fontFamily: T.font.mono, color: T.text.secondary, textAlign: "right", marginTop: 2 }}
        >
          TOTAL: ${pendingChargeTotal.toFixed(2)}
        </div>
      )}
    </Card>
  );
}
