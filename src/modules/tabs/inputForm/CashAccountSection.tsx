import type { ChangeEvent, CSSProperties, ReactNode } from "react";
import { Mono as UIMono } from "../../components.js";
import { T } from "../../constants.js";
import { Trash2 } from "../../icons";
import { Badge, Card, Label } from "../../ui.js";
import { fmt } from "../../utils.js";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout.js";
import { InlineOverrideMoneyInput } from "./InlineOverrideMoneyInput";
import { SectionAddControl } from "./SectionAddControl";
import { getEffectiveCashAccountTotal, type CashAccountMeta } from "./model.js";
import { sanitizeDollar, type MoneyInput } from "./utils.js";

interface MonoProps {
  children?: ReactNode;
  color?: string;
  size?: number;
  weight?: number;
  style?: CSSProperties;
}

interface CashAccountSectionProps {
  meta: CashAccountMeta;
  toneColor: string;
  title: string;
  accountOverrides: Record<string, MoneyInput | undefined>;
  onOverrideAccount: (id: string, value: MoneyInput) => void;
  onResetAccount: (id: string) => void;
  aggregateOverrideActive: boolean;
  onEnableAggregateOverride: () => void;
  aggregateOverrideValue: MoneyInput | "";
  onAggregateChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onResetAggregate: () => void;
  inputLabel: string;
  hiddenAccounts: CashAccountMeta["accounts"];
  onRemoveAccount: (id: string) => void;
  onRestoreAccount: (id: string) => void;
}

const Mono = UIMono as unknown as (props: MonoProps) => ReactNode;
const ACCOUNT_ROW_GRID = "minmax(0, 1fr) minmax(112px, 168px) 34px";

export function CashAccountSection({
  meta,
  toneColor,
  title,
  accountOverrides,
  onOverrideAccount,
  onResetAccount,
  aggregateOverrideActive,
  onEnableAggregateOverride,
  aggregateOverrideValue,
  onAggregateChange,
  onResetAggregate,
  inputLabel,
  hiddenAccounts,
  onRemoveAccount,
  onRestoreAccount,
}: CashAccountSectionProps) {
  const { isNarrowPhone, isTablet } = useResponsiveLayout();
  const hasAccounts = meta.accounts.length > 0;
  const hasLinkedAccounts = hasAccounts || hiddenAccounts.length > 0;
  const visibleCount = meta.accounts.length;
  const effectiveTotal = getEffectiveCashAccountTotal(meta, accountOverrides);
  const anyAccountOverridden = hasAccounts && meta.accounts.some((account) => accountOverrides[account.id] !== undefined);
  const rowActionSize = isTablet ? 36 : 34;
  const accountRowGrid = isNarrowPhone
    ? `minmax(0, 1fr) ${rowActionSize}px`
    : isTablet
      ? "minmax(0, 1fr) minmax(136px, 188px) 36px"
      : ACCOUNT_ROW_GRID;
  const addableOptions = hiddenAccounts.map((account) => ({
    id: account.id,
    label: account.displayLabel,
  }));
  const summaryPillHeight = isTablet ? 34 : 30;
  const summaryPillPadding = isNarrowPhone ? "0 10px" : "0 12px";
  const summaryMonoSize = isNarrowPhone ? 11.5 : 12.5;

  return (
    <Card
      className="hover-card"
      variant="glass"
      style={{ marginBottom: 8, position: "relative", overflow: "hidden" }}
    >
      <div
        style={{
          position: "absolute",
          right: -18,
          top: -18,
          width: 60,
          height: 60,
          background: toneColor,
          filter: "blur(40px)",
          opacity: 0.07,
          borderRadius: "50%",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          alignItems: "center",
          gap: 12,
          marginBottom: hasAccounts ? 8 : 6,
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
            {title}
          </Label>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
            justifyContent: "flex-end",
            whiteSpace: "nowrap",
          }}
        >
          {visibleCount > 0 && (
            <Badge
              variant="outline"
              style={{
                fontSize: 9,
                color: toneColor,
                borderColor: `${toneColor}35`,
                background: `${toneColor}10`,
                flexShrink: 0,
              }}
            >
              {visibleCount} {visibleCount === 1 ? "ACCOUNT" : "ACCOUNTS"}
            </Badge>
          )}
          {effectiveTotal !== null && (
            <div
              style={{
                minHeight: summaryPillHeight,
                padding: summaryPillPadding,
                borderRadius: 999,
                border: `1px solid ${anyAccountOverridden ? `${toneColor}35` : T.border.subtle}`,
                background: anyAccountOverridden ? `${toneColor}10` : T.bg.surface,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                whiteSpace: "nowrap",
              }}
            >
              <Mono size={summaryMonoSize} weight={800} color={anyAccountOverridden ? toneColor : T.text.primary}>
                {fmt(effectiveTotal)}
              </Mono>
            </div>
          )}
          <SectionAddControl
            accent={toneColor}
            buttonAriaLabel={`Add ${title.toLowerCase()} to audit`}
            options={addableOptions}
            pickerLabel="Choose account to add"
            placeholder="Select account…"
            onSelect={onRestoreAccount}
          />
        </div>
      </div>

      {hasAccounts ? (
        <div style={{ display: "grid", gap: 6 }}>
          {meta.accounts.map((account, index) => {
            const overrideValue = accountOverrides[account.id];
            const isOverridden = overrideValue !== undefined;

            return (
              <div
                key={account.id}
                className="slide-up"
                style={{
                  display: "grid",
                  gridTemplateColumns: accountRowGrid,
                  alignItems: isNarrowPhone ? "start" : "center",
                  gap: 10,
                  padding: isNarrowPhone ? "9px 10px" : "10px 12px",
                  borderRadius: T.radius.md,
                  background: isOverridden ? `${toneColor}08` : T.bg.elevated,
                  border: `1px solid ${isOverridden ? `${toneColor}35` : T.border.subtle}`,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                  transition: "transform 0.2s ease, opacity 0.2s ease, background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease",
                  animationDelay: `${index * 0.05}s`,
                }}
              >
                <div style={{ minWidth: 0, gridColumn: isNarrowPhone ? "1 / 2" : undefined }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 7, minWidth: 0 }}>
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        background: toneColor,
                        flexShrink: 0,
                        marginTop: 4,
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: T.text.primary,
                          lineHeight: 1.3,
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {account.displayLabel}
                      </div>
                      <div style={{ fontSize: 10, color: T.text.dim, marginTop: 2 }}>
                        {isOverridden ? "Manual override" : "Linked balance"}
                      </div>
                    </div>
                  </div>
                </div>

                {isOverridden ? (
                  <div
                    style={{
                      minWidth: 0,
                      gridColumn: isNarrowPhone ? "1 / -1" : undefined,
                      gridRow: isNarrowPhone ? "2 / 3" : undefined,
                    }}
                  >
                    <InlineOverrideMoneyInput
                      label={`${account.displayLabel} override`}
                      value={overrideValue}
                      onChange={(event) => onOverrideAccount(account.id, sanitizeDollar(event.target.value))}
                      placeholder={fmt(account.amount)}
                      onReset={() => onResetAccount(account.id)}
                    />
                  </div>
                ) : (
                  <button type="button"
                    onClick={() => onOverrideAccount(account.id, "" as MoneyInput)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "100%",
                      minHeight: rowActionSize + 2,
                      background: `${toneColor}0C`,
                      border: `1px solid ${toneColor}30`,
                      borderRadius: T.radius.md,
                      padding: "0 12px",
                      flexShrink: 0,
                      gridColumn: isNarrowPhone ? "1 / -1" : undefined,
                      gridRow: isNarrowPhone ? "2 / 3" : undefined,
                      transition: "transform 0.2s ease, opacity 0.2s ease, background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease",
                    }}
                  >
                    <Mono size={12.5} weight={800} color={toneColor}>
                      {fmt(account.amount)}
                    </Mono>
                  </button>
                )}
                <button type="button"
                  onClick={() => onRemoveAccount(account.id)}
                  style={{
                    width: rowActionSize,
                    height: rowActionSize,
                    borderRadius: T.radius.sm,
                    border: "none",
                    background: `${toneColor}14`,
                    color: toneColor,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    gridColumn: isNarrowPhone ? "2 / 3" : undefined,
                    gridRow: isNarrowPhone ? "1 / 2" : undefined,
                    justifySelf: "end",
                  }}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            );
          })}
        </div>
      ) : hasLinkedAccounts ? (
        <div style={{ display: "grid", gap: 8 }}>
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
            No accounts are currently included. Add back only the balances you want this briefing to consider.
          </div>
        </div>
      ) : effectiveTotal !== null && !aggregateOverrideActive ? (
        <button type="button"
          onClick={onEnableAggregateOverride}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 38,
            background: `${toneColor}10`,
            border: `1px solid ${toneColor}40`,
            borderRadius: T.radius.md,
          }}
        >
          <Mono size={13} weight={800} color={toneColor}>
            {fmt(effectiveTotal)}
          </Mono>
        </button>
      ) : (
        <InlineOverrideMoneyInput
          label={inputLabel}
          value={aggregateOverrideValue}
          onChange={onAggregateChange}
          placeholder={effectiveTotal !== null ? fmt(effectiveTotal) : "0.00"}
          onReset={onResetAggregate}
        />
      )}
    </Card>
  );
}
