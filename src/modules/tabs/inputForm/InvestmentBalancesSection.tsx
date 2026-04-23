import { useMemo, type ChangeEvent, type CSSProperties, type ReactNode } from "react";
import { DI as UIDI, Mono as UIMono } from "../../components.js";
import { T } from "../../constants.js";
import { Trash2 } from "../../icons";
import { Badge, Card, Label } from "../../ui.js";
import { fmt } from "../../utils.js";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout.js";
import { SectionAddControl } from "./SectionAddControl";
import type { InputFormState, InvestmentAuditSource } from "./model.js";
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
  visibleSources: InvestmentAuditSource[];
  hiddenSources: InvestmentAuditSource[];
  totalBalance: number;
  formValues: Pick<InputFormState, "roth" | "brokerage" | "k401Balance">;
  onChangeField: (key: "roth" | "brokerage" | "k401Balance", value: MoneyInput) => void;
  onRemoveSource: (id: string) => void;
  onRestoreSource: (source: InvestmentAuditSource) => void;
}

const Mono = UIMono as unknown as (props: MonoProps) => ReactNode;
const DI = UIDI as unknown as (props: DollarInputProps) => ReactNode;
const INVESTMENT_ROW_GRID = "minmax(0, 1fr) minmax(112px, 168px) 34px";

export function InvestmentBalancesSection({
  visibleSources,
  hiddenSources,
  totalBalance,
  formValues,
  onChangeField,
  onRemoveSource,
  onRestoreSource,
}: InvestmentBalancesSectionProps) {
  const { isNarrowPhone, isTablet } = useResponsiveLayout();
  const rowActionSize = isTablet ? 36 : 34;
  const investmentRowGrid = isNarrowPhone
    ? `minmax(0, 1fr) auto ${rowActionSize}px`
    : isTablet
      ? "minmax(0, 1fr) minmax(136px, 188px) 36px"
      : INVESTMENT_ROW_GRID;
  const addableFields = useMemo(
    () =>
      hiddenSources.map((source) => ({
        id: source.id,
        label: source.label,
        detail: source.detail,
      })),
    [hiddenSources]
  );

  const handleAddField = (sourceId: string) => {
    const source = hiddenSources.find((entry) => entry.id === sourceId);
    if (!source) return;
    onRestoreSource(source);
  };
  const summaryPillHeight = isTablet ? 34 : 30;
  const summaryPillPadding = isNarrowPhone ? "0 10px" : "0 12px";
  const summaryMonoSize = isNarrowPhone ? 11.5 : 12.5;
  const compactAdd = !isTablet;
  const sectionTitle = isNarrowPhone ? "Investments" : "Investment Balances";

  return (
    <Card variant="glass" style={{ marginBottom: 8, position: "relative", overflow: "hidden" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto auto",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            minWidth: 0,
          }}
        >
          <Label
            style={{
              marginBottom: 0,
              fontWeight: 800,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {sectionTitle}
          </Label>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          {visibleSources.length > 0 && (
            <Badge
              variant="outline"
              style={{
                fontSize: 9,
                color: T.accent.emerald,
                borderColor: `${T.accent.emerald}35`,
                background: `${T.accent.emerald}10`,
                flexShrink: 0,
              }}
            >
              {visibleSources.length} {visibleSources.length === 1 ? "SOURCE" : "SOURCES"}
            </Badge>
          )}
          {visibleSources.length > 0 && (
            <div
              style={{
                minHeight: summaryPillHeight,
                padding: summaryPillPadding,
                borderRadius: 999,
                border: `1px solid ${T.accent.emerald}35`,
                background: `${T.accent.emerald}10`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                whiteSpace: "nowrap",
              }}
            >
              <Mono size={summaryMonoSize} weight={800} color={T.accent.emerald}>
                {fmt(totalBalance)}
              </Mono>
            </div>
          )}
        </div>
        <SectionAddControl
          accent={T.accent.emerald}
          buttonAriaLabel="Add investment balance to audit"
          options={addableFields}
          pickerLabel="Choose investment source"
          placeholder="Select balance…"
          onSelect={handleAddField}
          iconOnly={compactAdd}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visibleSources.length === 0 && (
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
        {visibleSources.map((source) => {
          const showManualInput = Boolean(source.editable && source.formKey);
          const resolvedDisplayValue = showManualInput
            ? toNumber(formValues[source.formKey as "roth" | "brokerage" | "k401Balance"])
            : Number(source.amount || 0);
          const inputValue = showManualInput ? formValues[source.formKey as "roth" | "brokerage" | "k401Balance"] || "" : "";

          return (
            <div
              key={source.id}
              className="slide-up"
              style={{
                display: "grid",
                gridTemplateColumns: investmentRowGrid,
                alignItems: isNarrowPhone ? "start" : "center",
                gap: 10,
                padding: isNarrowPhone ? "9px 10px" : "10px 12px",
                background: T.bg.elevated,
                borderRadius: T.radius.md,
                border: `1px solid ${T.border.subtle}`,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                transition: "transform 0.2s ease, opacity 0.2s ease, background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease",
              }}
            >
              <div style={{ minWidth: 0, gridColumn: isNarrowPhone ? "1 / 2" : undefined }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 7, minWidth: 0 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 3, background: source.accent, flexShrink: 0, marginTop: 4 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.text.primary, lineHeight: 1.3 }}>
                      {source.label}
                    </div>
                    <div style={{ fontSize: 10, color: T.text.dim, marginTop: 2 }}>
                      {source.detail}
                    </div>
                  </div>
                </div>
              </div>
              {isNarrowPhone && !showManualInput ? (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "fit-content",
                      minHeight: rowActionSize + 2,
                      background: `${source.accent}0C`,
                      border: `1px solid ${source.accent}30`,
                      borderRadius: T.radius.md,
                      padding: "0 14px",
                      whiteSpace: "nowrap",
                      transition: "transform 0.2s ease, opacity 0.2s ease, background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease",
                      justifySelf: "end",
                      alignSelf: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Mono size={12.5} weight={800} color={source.accent}>
                      {fmt(resolvedDisplayValue)}
                    </Mono>
                  </div>
                  <button type="button"
                    onClick={() => onRemoveSource(source.id)}
                    style={{
                      width: rowActionSize,
                      height: rowActionSize,
                      borderRadius: T.radius.sm,
                      border: "none",
                      background: `${source.accent}14`,
                      color: source.accent,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Trash2 size={11} />
                  </button>
                </>
              ) : isNarrowPhone ? (
                <div
                  style={{
                    gridColumn: "1 / -1",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    gap: 8,
                    minWidth: 0,
                  }}
                >
                  <div style={{ flex: "0 1 208px", minWidth: 0, maxWidth: 208 }}>
                    <DI
                      value={inputValue}
                      onChange={(event) => onChangeField(source.formKey as "roth" | "brokerage" | "k401Balance", sanitizeDollar(event.target.value))}
                      placeholder="Enter value"
                    />
                  </div>
                  <button type="button"
                    onClick={() => onRemoveSource(source.id)}
                    style={{
                      width: rowActionSize,
                      height: rowActionSize,
                      borderRadius: T.radius.sm,
                      border: "none",
                      background: `${source.accent}14`,
                      color: source.accent,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ) : (
                <>
                  {showManualInput ? (
                    <div
                      style={{
                        minWidth: 0,
                      }}
                    >
                      <DI
                        value={inputValue}
                        onChange={(event) => onChangeField(source.formKey as "roth" | "brokerage" | "k401Balance", sanitizeDollar(event.target.value))}
                        placeholder="Enter value"
                      />
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "100%",
                        minHeight: rowActionSize + 2,
                        background: `${source.accent}0C`,
                        border: `1px solid ${source.accent}30`,
                        borderRadius: T.radius.md,
                        padding: "0 12px",
                        transition: "transform 0.2s ease, opacity 0.2s ease, background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease",
                        flexShrink: 0,
                      }}
                    >
                      <Mono size={12.5} weight={800} color={source.accent}>
                        {fmt(resolvedDisplayValue)}
                      </Mono>
                    </div>
                  )}
                  <button type="button"
                    onClick={() => onRemoveSource(source.id)}
                    style={{
                      width: rowActionSize,
                      height: rowActionSize,
                      borderRadius: T.radius.sm,
                      border: "none",
                      background: `${source.accent}14`,
                      color: source.accent,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Trash2 size={11} />
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
