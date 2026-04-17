import { useMemo, useState, type ChangeEvent, type CSSProperties, type ReactNode } from "react";
import { DI as UIDI, Mono as UIMono } from "../../components.js";
import { T } from "../../constants.js";
import { Plus, Trash2 } from "../../icons";
import { Badge, Card, Label } from "../../ui.js";
import { fmt } from "../../utils.js";
import type { InputFormState, InvestmentAuditField } from "./model.js";
import { SectionAddSheet } from "./SectionAddSheet";
import { sanitizeDollar, toNumber, type MoneyInput } from "./utils.js";

interface MonoProps {
  children?: ReactNode;
  color?: string;
  size?: number;
  weight?: number;
  style?: CSSProperties;
}

interface DollarInputProps {
  value: MoneyInput | "";
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  label?: string;
}

interface InvestmentBalancesSectionProps {
  visibleFields: InvestmentAuditField[];
  hiddenFields: InvestmentAuditField[];
  totalBalance: number;
  formValues: Pick<InputFormState, "roth" | "brokerage" | "k401Balance">;
  onChangeField: (key: InvestmentAuditField["key"], value: MoneyInput) => void;
  onEnableOverride: (key: InvestmentAuditField["key"]) => void;
  onRemoveField: (key: InvestmentAuditField["key"]) => void;
  onRestoreField: (field: InvestmentAuditField) => void;
}

const Mono = UIMono as unknown as (props: MonoProps) => ReactNode;
const DI = UIDI as unknown as (props: DollarInputProps) => ReactNode;

export function InvestmentBalancesSection({
  visibleFields,
  hiddenFields,
  totalBalance,
  formValues,
  onChangeField,
  onEnableOverride,
  onRemoveField,
  onRestoreField,
}: InvestmentBalancesSectionProps) {
  const [showAddSheet, setShowAddSheet] = useState(false);
  const addableFields = useMemo(
    () =>
      hiddenFields.map((field) => ({
        id: field.key,
        label: field.label,
        color: field.accent,
        detail: Math.abs(Number(field.autoValue || 0)) > 0.004 ? "Auto-tracked balance available" : "Available for manual entry",
      })),
    [hiddenFields]
  );

  const handleAddField = (fieldKey: string) => {
    const field = hiddenFields.find((entry) => entry.key === fieldKey);
    if (!field) return;
    setShowAddSheet(false);
    onRestoreField(field);
  };

  const handleOpenAdd = () => {
    const firstField = addableFields[0];
    if (addableFields.length === 1 && firstField) {
      handleAddField(firstField.id);
      return;
    }
    if (addableFields.length > 1) {
      setShowAddSheet(true);
    }
  };

  return (
    <Card variant="glass" style={{ marginBottom: 8, position: "relative", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Label style={{ marginBottom: 0, fontWeight: 800 }}>Investment Balances</Label>
          {visibleFields.length > 0 && (
            <Badge
              variant="outline"
              style={{
                fontSize: 9,
                color: T.accent.emerald,
                borderColor: `${T.accent.emerald}35`,
                background: `${T.accent.emerald}10`,
              }}
            >
              {visibleFields.length} {visibleFields.length === 1 ? "ACCOUNT" : "ACCOUNTS"}
            </Badge>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {visibleFields.length > 0 && (
            <Mono size={14} weight={800} color={T.text.primary}>
              {fmt(totalBalance)}
            </Mono>
          )}
          {addableFields.length > 0 && (
            <button
              type="button"
              onClick={handleOpenAdd}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 10px",
                borderRadius: T.radius.sm,
                border: `1px solid ${T.accent.emerald}40`,
                background: `${T.accent.emerald}12`,
                color: T.accent.emerald,
                fontSize: 9,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: T.font.mono,
                transition: "all .2s ease",
                flexShrink: 0,
              }}
            >
              <Plus size={10} strokeWidth={3} /> ADD
            </button>
          )}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visibleFields.length === 0 && (
          <div
            style={{
              padding: "14px 14px 12px",
              borderRadius: T.radius.lg,
              background: T.bg.elevated,
              border: `1px solid ${T.border.subtle}`,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: T.text.primary, marginBottom: 4 }}>
              No investment balances included yet
            </div>
            <div style={{ fontSize: 11.5, color: T.text.secondary, lineHeight: 1.5 }}>
              Add back only the investment balances you want this briefing to consider. Hidden empty categories stay out of the way.
            </div>
          </div>
        )}
        {visibleFields.map((field) => {
          const hasAutoValue = Math.abs(Number(field.autoValue || 0)) > 0.004;
          const showManualInput = !hasAutoValue || field.override;
          const resolvedDisplayValue = hasAutoValue ? Number(field.autoValue || 0) : toNumber(field.formValue);
          const inputValue =
            field.key === "roth"
              ? formValues.roth
              : field.key === "brokerage"
                ? formValues.brokerage
                : formValues.k401Balance || "";

          return (
            <div
              key={field.key}
              className="slide-up"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                background: field.override ? `${field.accent}08` : T.bg.elevated,
                borderRadius: T.radius.md,
                border: `1px solid ${field.override ? `${field.accent}35` : T.border.subtle}`,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 7, minWidth: 0 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 3, background: field.accent, flexShrink: 0, marginTop: 4 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.text.primary, lineHeight: 1.3 }}>
                      {field.label}
                    </div>
                    <div style={{ fontSize: 10, color: T.text.dim, marginTop: 2 }}>
                      {field.override ? "Manual override" : hasAutoValue ? "Auto-tracked balance" : "Manual entry"}
                    </div>
                  </div>
                </div>
              </div>
              {showManualInput ? (
                <div style={{ flexShrink: 0, maxWidth: 180 }}>
                  <DI
                    value={inputValue}
                    onChange={(event) => onChangeField(field.key, sanitizeDollar(event.target.value))}
                    placeholder={hasAutoValue ? `Auto: ${fmt(field.autoValue)}` : "Enter value"}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onEnableOverride(field.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 96,
                    height: 36,
                    background: `${field.accent}0C`,
                    border: `1px solid ${field.accent}30`,
                    borderRadius: T.radius.md,
                    cursor: "pointer",
                    padding: "0 12px",
                    transition: "all 0.2s ease",
                    flexShrink: 0,
                  }}
                >
                  <Mono size={12.5} weight={800} color={field.accent}>
                    {fmt(resolvedDisplayValue)}
                  </Mono>
                </button>
              )}
              <button
                type="button"
                onClick={() => onRemoveField(field.key)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: T.radius.sm,
                  border: "none",
                  background: `${field.accent}14`,
                  color: field.accent,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          );
        })}
      </div>
      {showAddSheet && addableFields.length > 1 ? (
        <SectionAddSheet
          accent={T.accent.emerald}
          description="Add back only the investment balances you want this audit to evaluate."
          onClose={() => setShowAddSheet(false)}
          onSelect={handleAddField}
          options={addableFields}
          title="Choose investment balance"
        />
      ) : null}
    </Card>
  );
}
