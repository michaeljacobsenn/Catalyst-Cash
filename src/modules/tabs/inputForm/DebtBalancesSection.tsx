import { useMemo, type ChangeEvent, type CSSProperties, type ReactNode } from "react";
import { CustomSelect as UICustomSelect, DI as UIDI, Mono as UIMono } from "../../components.js";
import { T } from "../../constants.js";
import { Trash2 } from "../../icons";
import { Badge, Card, Label } from "../../ui.js";
import { fmt } from "../../utils.js";
import { InlineOverrideMoneyInput } from "./InlineOverrideMoneyInput";
import { SectionAddControl } from "./SectionAddControl";
import type { InputDebt } from "./model.js";
import { sanitizeDollar, type MoneyInput } from "./utils.js";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectGroup {
  label: string;
  options: SelectOption[];
}

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

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectGroup[];
  placeholder?: string;
  ariaLabel?: string;
  icon?: ReactNode;
}

interface DebtBalancesSectionProps {
  debts: InputDebt[];
  hasAvailableCards: boolean;
  addableDebtCards: Array<{ cardId: string; name: string; detail?: string }>;
  cardOptions: SelectGroup[];
  liveDebtBalanceByCardId: Map<string, number>;
  debtOverrides: Record<string, boolean | undefined>;
  totalBalance: number;
  onAddDebtCard: (cardId: string) => void;
  onRemoveDebtRow: (index: number) => void;
  onSelectDebtCard: (index: number, value: string) => void;
  onEnableDebtOverride: (cardId: string) => void;
  onResetDebtOverride: (index: number, cardId: string, liveBalance: number) => void;
  onChangeDebtBalance: (index: number, value: MoneyInput) => void;
}

const Mono = UIMono as unknown as (props: MonoProps) => ReactNode;
const DI = UIDI as unknown as (props: DollarInputProps) => ReactNode;
const CustomSelect = UICustomSelect as unknown as (props: CustomSelectProps) => ReactNode;

export function DebtBalancesSection({
  debts,
  hasAvailableCards,
  addableDebtCards,
  cardOptions,
  liveDebtBalanceByCardId,
  debtOverrides,
  totalBalance,
  onAddDebtCard,
  onRemoveDebtRow,
  onSelectDebtCard,
  onEnableDebtOverride,
  onResetDebtOverride,
  onChangeDebtBalance,
}: DebtBalancesSectionProps) {
  const addableOptions = useMemo(
    () =>
      addableDebtCards.map((card) => ({
        id: card.cardId,
        label: card.name,
      })),
    [addableDebtCards]
  );

  const handleAddCard = (cardId: string) => {
    onAddDebtCard(cardId);
  };

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
          background: T.status.red,
          filter: "blur(40px)",
          opacity: 0.07,
          borderRadius: "50%",
          pointerEvents: "none",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: debts.length > 0 ? 10 : 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Label style={{ marginBottom: 0, fontWeight: 800 }}>Credit Card Balances</Label>
          {debts.length > 0 && (
            <Badge
              variant="outline"
              style={{
                fontSize: 9,
                color: T.status.red,
                borderColor: `${T.status.red}35`,
                background: `${T.status.red}10`,
              }}
            >
              {debts.length} {debts.length === 1 ? "CARD" : "CARDS"}
            </Badge>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {debts.length > 0 && (
            <Mono size={14} weight={800} color={T.text.primary}>
              {fmt(totalBalance)}
            </Mono>
          )}
          <SectionAddControl
            accent={T.status.red}
            buttonAriaLabel="Add card balance to audit"
            options={addableOptions}
            pickerLabel="Choose card to add"
            placeholder="Select card..."
            onSelect={handleAddCard}
          />
        </div>
      </div>
      {debts.length === 0 && (
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
          {hasAvailableCards
            ? "No debt balances included yet. Tap ADD to include only the card balances you want considered in this briefing."
            : "No credit cards added yet. Add cards in Portfolio, then include only the debt balances you want considered in this briefing."}
        </div>
      )}
      {debts.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {debts.map((debt, index) => {
            const liveBalance = debt.cardId ? liveDebtBalanceByCardId.get(debt.cardId) : undefined;
            const hasLiveBalance = liveBalance !== undefined;
            const isOverridden = Boolean(debt.cardId && debtOverrides[debt.cardId]);
            const displayName = debt.name || (debt.cardId ? debt.cardId : `Card ${index + 1}`);
            const isCardSelected = Boolean(debt.cardId);

            return (
              <div
                key={index}
                className="slide-up"
                style={{
                  display: isCardSelected ? "flex" : "grid",
                  gridTemplateColumns: isCardSelected ? undefined : "minmax(0, 1fr) 34px",
                  alignItems: isCardSelected ? "center" : undefined,
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: T.radius.md,
                  background: isOverridden ? `${T.status.red}08` : T.bg.elevated,
                  border: `1px solid ${isOverridden ? `${T.status.red}35` : T.border.subtle}`,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                  transition: "all 0.2s ease",
                  animationDelay: `${index * 0.06}s`,
                }}
              >
                <div style={isCardSelected ? { flex: 1, minWidth: 0 } : { gridColumn: "1 / -1", minWidth: 0 }}>
                  {debt.cardId ? (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 7, minWidth: 0 }}>
                      <div style={{ width: 6, height: 6, borderRadius: 3, background: T.status.red, flexShrink: 0, marginTop: 4 }} />
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
                          {displayName}
                        </div>
                        <div style={{ fontSize: 10, color: T.text.dim, marginTop: 2 }}>
                          {isOverridden ? "Manual override" : hasLiveBalance ? "Live balance" : "Manual entry"}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 6 }}>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          color: T.text.dim,
                          fontFamily: T.font.mono,
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                        }}
                      >
                        Choose card
                      </div>
                      <CustomSelect
                        ariaLabel={`Debt card ${index + 1}`}
                        value={debt.cardId || debt.name || ""}
                        onChange={(value) => onSelectDebtCard(index, value)}
                        placeholder="Select card..."
                        options={cardOptions}
                      />
                    </div>
                  )}
                </div>

                <div style={isCardSelected ? { flexShrink: 0, maxWidth: 180 } : { minWidth: 0 }}>
                  {hasLiveBalance && !isOverridden ? (
                    <button
                      type="button"
                      onClick={() => debt.cardId && onEnableDebtOverride(debt.cardId)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: 96,
                        height: 36,
                        background: `${T.status.red}0C`,
                        border: `1px solid ${T.status.red}30`,
                        borderRadius: T.radius.md,
                        cursor: "pointer",
                        padding: "0 12px",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <Mono size={12.5} weight={800} color={T.status.red}>
                        {fmt(liveBalance)}
                      </Mono>
                    </button>
                  ) : isOverridden && hasLiveBalance && debt.cardId ? (
                    <InlineOverrideMoneyInput
                      label={`Debt balance ${index + 1}`}
                      value={debt.balance}
                      onChange={(event) => onChangeDebtBalance(index, sanitizeDollar(event.target.value))}
                      placeholder={`${fmt(liveBalance)}`}
                      tone="danger"
                      onReset={() => onResetDebtOverride(index, debt.cardId, liveBalance)}
                    />
                  ) : (
                    <DI
                      value={debt.balance}
                      onChange={(event) => onChangeDebtBalance(index, sanitizeDollar(event.target.value))}
                      placeholder={hasLiveBalance ? `${fmt(liveBalance)}` : "0.00"}
                    />
                  )}
                </div>

                <button
                  onClick={() => onRemoveDebtRow(index)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: T.radius.sm,
                    border: "none",
                    background: T.status.redDim,
                    color: T.status.red,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    justifySelf: isCardSelected ? undefined : "stretch",
                  }}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
