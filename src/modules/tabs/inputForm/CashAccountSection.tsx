import type { ChangeEvent, CSSProperties, ReactNode } from "react";
import { Mono as UIMono } from "../../components.js";
import { T } from "../../constants.js";
import { Trash2 } from "../../icons";
import { Badge, Card, Label } from "../../ui.js";
import { fmt } from "../../utils.js";
import { HiddenItemChips } from "./HiddenItemChips";
import { InlineOverrideMoneyInput } from "./InlineOverrideMoneyInput";
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
  const hasAccounts = meta.accounts.length > 0;
  const hasLinkedAccounts = hasAccounts || hiddenAccounts.length > 0;
  const visibleCount = meta.accounts.length;
  const effectiveTotal = getEffectiveCashAccountTotal(meta, accountOverrides);
  const anyAccountOverridden = hasAccounts && meta.accounts.some((account) => accountOverrides[account.id] !== undefined);

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: hasAccounts ? 10 : 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Label style={{ marginBottom: 0, fontWeight: 800 }}>{title}</Label>
          {visibleCount > 0 && (
            <Badge
              variant="outline"
              style={{
                fontSize: 9,
                color: toneColor,
                borderColor: `${toneColor}35`,
                background: `${toneColor}10`,
              }}
            >
              {visibleCount} {visibleCount === 1 ? "ACCOUNT" : "ACCOUNTS"}
            </Badge>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {effectiveTotal !== null && (
            <Mono size={14} weight={800} color={anyAccountOverridden ? toneColor : T.text.primary}>
              {fmt(effectiveTotal)}
            </Mono>
          )}
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
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: T.radius.md,
                  background: isOverridden ? `${toneColor}08` : T.bg.elevated,
                  border: `1px solid ${isOverridden ? `${toneColor}35` : T.border.subtle}`,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                  transition: "all 0.2s ease",
                  animationDelay: `${index * 0.05}s`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
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
                  <div style={{ flexShrink: 0, maxWidth: 180 }}>
                    <InlineOverrideMoneyInput
                      label={`${account.displayLabel} override`}
                      value={overrideValue}
                      onChange={(event) => onOverrideAccount(account.id, sanitizeDollar(event.target.value))}
                      placeholder={fmt(account.amount)}
                      onReset={() => onResetAccount(account.id)}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOverrideAccount(account.id, "" as MoneyInput)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: 96,
                      height: 36,
                      background: `${toneColor}0C`,
                      border: `1px solid ${toneColor}30`,
                      borderRadius: T.radius.md,
                      cursor: "pointer",
                      padding: "0 12px",
                      flexShrink: 0,
                      transition: "all 0.2s ease",
                    }}
                  >
                    <Mono size={12.5} weight={800} color={toneColor}>
                      {fmt(account.amount)}
                    </Mono>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRemoveAccount(account.id)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: T.radius.sm,
                    border: "none",
                    background: `${toneColor}14`,
                    color: toneColor,
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
        <button
          type="button"
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
            cursor: "pointer",
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
      <HiddenItemChips
        title="Choose account to add"
        items={hiddenAccounts}
        getKey={(account) => account.id}
        getLabel={(account) => account.displayLabel}
        getColor={() => toneColor}
        onSelect={(account) => onRestoreAccount(account.id)}
      />
    </Card>
  );
}
