import type { ChangeEvent, ReactNode } from "react";
import { CustomSelect as UICustomSelect, DI as UIDI } from "../../components.js";
import { T } from "../../constants.js";
import { AlertTriangle, CheckCircle, Plus, Trash2 } from "../../icons";
import { Card, Label } from "../../ui.js";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout.js";
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
  const { isNarrowPhone, isTablet } = useResponsiveLayout();
  const confirmedChargeCount = pendingCharges.filter((charge) => toNumber(charge.amount) > 0).length;
  const pendingChargeTotal = pendingCharges.reduce((sum, charge) => sum + toNumber(charge.amount), 0);
  const chargeRowGrid = isNarrowPhone
    ? "minmax(0, 1fr) 36px"
    : isTablet
      ? "minmax(0, 1fr) minmax(132px, 176px) 36px"
      : "minmax(0, 1fr) minmax(112px, 148px) 36px";

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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: isNarrowPhone ? "flex-start" : "center",
          gap: 10,
          flexWrap: isNarrowPhone ? "wrap" : "nowrap",
          marginBottom: pendingCharges.length > 0 ? 10 : 6,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Label style={{ marginBottom: 0, fontWeight: 800 }}>Pending Charges</Label>
          {pendingCharges.length > 0 && (
            <div
              style={{
                padding: "4px 8px",
                borderRadius: 999,
                border: `1px solid ${T.status.amber}35`,
                background: `${T.status.amber}10`,
                color: T.status.amber,
                fontSize: 9,
                fontWeight: 800,
                fontFamily: T.font.mono,
                letterSpacing: "0.04em",
              }}
            >
              {pendingCharges.length} {pendingCharges.length === 1 ? "ITEM" : "ITEMS"}
            </div>
          )}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: isNarrowPhone && pendingCharges.length > 0 ? "space-between" : "flex-end",
            gap: 8,
            flexWrap: "wrap",
            flexShrink: 0,
            width: isNarrowPhone ? "100%" : undefined,
          }}
        >
          {pendingCharges.length > 0 && (
            <div
              style={{
                minWidth: isNarrowPhone ? 0 : 92,
                minHeight: 32,
                padding: "0 12px",
                borderRadius: 999,
                border: `1px solid ${T.status.amber}35`,
                background: `${T.status.amber}10`,
                color: T.status.amber,
                fontSize: 13,
                fontWeight: 800,
                fontFamily: T.font.mono,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ${pendingChargeTotal.toFixed(2)}
            </div>
          )}
          <button type="button"
            onClick={onAddCharge}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              minWidth: 68,
              minHeight: 32,
              padding: "0 12px",
              borderRadius: 999,
              border: `1px solid ${T.status.amber}40`,
              background: `${T.status.amber}12`,
              color: T.status.amber,
              fontSize: 10,
              fontWeight: 800,
              fontFamily: T.font.mono,
              letterSpacing: "0.04em",
            }}
          >
            <Plus size={11} />
            ADD
          </button>
        </div>
      </div>
      {pendingCharges.length === 0 && (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: T.radius.md,
            background: T.bg.elevated,
            border: `1px solid ${T.border.subtle}`,
            color: T.text.secondary,
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          Add upcoming charges that have not posted yet so the audit respects this week’s real spending pressure.
        </div>
      )}
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
              gridTemplateColumns: chargeRowGrid,
              gap: 8,
              alignItems: isNarrowPhone ? "start" : "center",
              marginBottom: 6,
            }}
          >
            <div style={{ minWidth: 0, gridColumn: isNarrowPhone ? "1 / 2" : undefined }}>
              <CustomSelect
                ariaLabel={`Pending charge card ${index + 1}`}
                value={charge.cardId || ""}
                onChange={(value) => onSelectCard(index, value)}
                placeholder="Card…"
                options={cardOptions}
              />
            </div>
            <div
              style={{
                minWidth: 0,
                gridColumn: isNarrowPhone ? "1 / -1" : undefined,
                gridRow: isNarrowPhone ? "2 / 3" : undefined,
              }}
            >
              <DI
                value={charge.amount}
                onChange={(event) => onChangeAmount(index, sanitizeDollar(event.target.value))}
              />
            </div>
            <button type="button"
              onClick={() => onRemoveCharge(index)}
              style={{
                width: 36,
                height: 36,
                borderRadius: T.radius.sm,
                border: "none",
                background: T.status.redDim,
                color: T.status.red,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                gridColumn: isNarrowPhone ? "2 / 3" : undefined,
                gridRow: isNarrowPhone ? "1 / 2" : undefined,
                justifySelf: "end",
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
          <div
            style={{
              display: "flex",
              gap: 6,
              alignItems: isNarrowPhone ? "stretch" : "center",
              flexDirection: isNarrowPhone ? "column" : "row",
            }}
          >
            <input
              type="text"
              aria-label={`Pending charge description ${index + 1}`}
              value={charge.description || ""}
              onChange={(event) => onChangeDescription(index, event.target.value)}
              placeholder="Description…"
              style={{
                flex: 1,
                width: "100%",
                boxSizing: "border-box",
                padding: "7px 10px",
                borderRadius: T.radius.md,
                border: `1px solid ${T.border.default}`,
                background: T.bg.card,
                color: T.text.primary,
                fontSize: 11,
              }}
            />
            <button type="button"
              onClick={() => onToggleConfirmed(index)}
              style={{
                padding: "7px 12px",
                borderRadius: T.radius.md,
                fontSize: 10,
                fontWeight: 800,
                fontFamily: T.font.mono,
                display: "flex",
                alignItems: "center",
                gap: 4,
                flexShrink: 0,
                justifyContent: "center",
                width: isNarrowPhone ? "100%" : undefined,
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
          {confirmedChargeCount} active pending items
        </div>
      )}
    </Card>
  );
}
