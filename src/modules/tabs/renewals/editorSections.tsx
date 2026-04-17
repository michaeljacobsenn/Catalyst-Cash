import type { CSSProperties, ChangeEvent, ReactNode } from "react";

import type { BankAccount, Card as PortfolioCard } from "../../../types/index.js";

import { T } from "../../constants.js";
import {
  getBankAccountLabel,
  getRenewalPaymentOptionValue,
  parseRenewalPaymentOptionValue,
  resolveRenewalPaymentState,
  RENEWAL_PAYMENT_TYPES,
} from "../../renewalPaymentSources.js";
import SearchableSelectBase from "../../SearchableSelect.js";
import { FormGroup, FormRow } from "../../ui.js";
import {
  DAY_OPTIONS,
  MONTH_OPTIONS,
  WEEK_OPTIONS,
  YEAR_OPTIONS,
} from "./helpers";
import type { RenewalDraftState } from "./model";

interface SearchableOption {
  value: string;
  label: string;
  group?: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  options?: SearchableOption[];
  style?: CSSProperties;
  maxHeight?: number;
  displayValue?: string;
}

interface SharedRenewalEditorProps {
  value: RenewalDraftState;
  onChange: (patch: Partial<RenewalDraftState>) => void;
  cards: PortfolioCard[];
  bankAccounts: BankAccount[];
  formInputStyle: CSSProperties;
  categorySelectOptions: SearchableOption[];
}

interface IntervalDropdownProps {
  interval: number;
  unit: string;
  onChange: (value: { interval: number; unit: string }) => void;
}

const SearchableSelect = SearchableSelectBase as unknown as (props: SearchableSelectProps) => ReactNode;

export function IntervalDropdown({ interval, unit, onChange }: IntervalDropdownProps) {
  return (
    <div style={{ display: "flex", gap: 6, flex: 1 }}>
      <select
        value={interval}
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
          onChange({ interval: parseInt(event.target.value, 10), unit })
        }
        aria-label="Interval count"
        style={{
          flex: 0.4,
          padding: "10px 10px",
          borderRadius: T.radius.md,
          border: `1px solid ${T.border.default}`,
          background: T.bg.elevated,
          color: T.text.primary,
          fontSize: 13,
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        {(unit === "days"
          ? DAY_OPTIONS
          : unit === "weeks"
            ? WEEK_OPTIONS
            : unit === "months"
              ? MONTH_OPTIONS
              : YEAR_OPTIONS
        ).map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      <select
        value={unit}
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
          onChange({ interval, unit: event.target.value })
        }
        aria-label="Interval unit"
        style={{
          flex: 0.6,
          padding: "10px 10px",
          borderRadius: T.radius.md,
          border: `1px solid ${T.border.default}`,
          background: T.bg.elevated,
          color: T.text.primary,
          fontSize: 13,
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        <option value="days">{interval === 1 ? "day" : "days"}</option>
        <option value="weeks">{interval === 1 ? "week" : "weeks"}</option>
        <option value="months">{interval === 1 ? "month" : "months"}</option>
        <option value="years">{interval === 1 ? "year" : "years"}</option>
        <option value="one-time">one-time</option>
      </select>
    </div>
  );
}

export function PaymentMethodSelect({
  value,
  onChange,
  cards = [],
  bankAccounts = [],
}: {
  value: RenewalDraftState;
  onChange: (patch: Partial<RenewalDraftState>) => void;
  cards: PortfolioCard[];
  bankAccounts: BankAccount[];
}) {
  const cardGroups: Record<string, PortfolioCard[]> = {};
  cards.forEach((card) => {
    const group = `Cards · ${card.institution || "Linked"}`;
    (cardGroups[group] = cardGroups[group] || []).push(card);
  });

  const bankGroups: Record<string, BankAccount[]> = {};
  bankAccounts.forEach((account) => {
    const group = `Banks · ${account.bank || "Linked"}`;
    (bankGroups[group] = bankGroups[group] || []).push(account);
  });

  const options: SearchableOption[] = [
    { value: `type:${RENEWAL_PAYMENT_TYPES.checking}`, label: "Checking Account", group: "General" },
    { value: `type:${RENEWAL_PAYMENT_TYPES.savings}`, label: "Savings Account", group: "General" },
    { value: `type:${RENEWAL_PAYMENT_TYPES.cash}`, label: "Cash", group: "General" },
    ...Object.entries(bankGroups).flatMap(([group, accounts]) =>
      accounts.map((account) => ({
        value: `bank:${account.id || ""}`,
        label: getBankAccountLabel(bankAccounts, account),
        group,
      }))
    ),
    ...Object.entries(cardGroups).flatMap(([group, groupedCards]) =>
      groupedCards.map((card) => ({
        value: `card:${card.id || ""}`,
        label: resolveRenewalPaymentState({ chargedToType: "card", chargedToId: card.id }, cards, []).chargedTo,
        group,
      }))
    ),
  ];

  const selectedValue = getRenewalPaymentOptionValue(value);
  const displayValue = options.find((option) => option.value === selectedValue)?.label || "";

  return (
    <SearchableSelect
      value={selectedValue}
      onChange={(nextValue) => onChange(parseRenewalPaymentOptionValue(nextValue, cards, bankAccounts))}
      placeholder="Payment method…"
      options={options}
      displayValue={displayValue}
    />
  );
}

export function RenewalDetailsFields({
  value,
  onChange,
  formInputStyle,
  categorySelectOptions,
}: Omit<SharedRenewalEditorProps, "cards" | "bankAccounts">) {
  const categoryLabel =
    categorySelectOptions.find((option) => option.value === (value.category || "subs"))?.label || "";

  return (
    <FormGroup>
      <FormRow label="Name">
        <input
          value={value.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder="e.g. Netflix, Rent"
          aria-label="Expense name"
          style={formInputStyle}
        />
      </FormRow>
      <FormRow label="Amount / Cycle $">
        <input
          type="number"
          inputMode="decimal"
          pattern="[0-9]*"
          value={value.amount}
          onChange={(event) => onChange({ amount: event.target.value })}
          placeholder="0.00"
          aria-label="Amount"
          style={formInputStyle}
        />
      </FormRow>
      <FormRow label="Category" isLast>
        <div style={{ width: "100%", maxWidth: 160 }}>
          <SearchableSelect
            value={value.category || "subs"}
            onChange={(nextValue) => onChange({ category: nextValue })}
            placeholder="Category"
            options={categorySelectOptions}
            displayValue={categoryLabel}
          />
        </div>
      </FormRow>
    </FormGroup>
  );
}

export function RenewalScheduleFields({
  value,
  onChange,
  formInputStyle,
}: Pick<SharedRenewalEditorProps, "value" | "onChange" | "formInputStyle">) {
  return (
    <FormGroup>
      <FormRow label="Cycle">
        <div style={{ display: "flex", justifyContent: "flex-end", flex: 1 }}>
          <IntervalDropdown
            interval={value.interval}
            unit={value.intervalUnit}
            onChange={({ interval, unit }) => onChange({ interval, intervalUnit: unit })}
          />
        </div>
      </FormRow>
      <FormRow label="Next Due Date" isLast>
        <input
          type="date"
          value={value.nextDue}
          onChange={(event) => onChange({ nextDue: event.target.value })}
          aria-label="Next due date"
          style={{
            ...formInputStyle,
            fontFamily: T.font.sans,
            color: value.nextDue ? T.text.primary : T.text.muted,
          }}
        />
      </FormRow>
    </FormGroup>
  );
}

export function RenewalPaymentFields({
  value,
  onChange,
  cards,
  bankAccounts,
  formInputStyle,
}: Pick<SharedRenewalEditorProps, "value" | "onChange" | "cards" | "bankAccounts" | "formInputStyle">) {
  return (
    <FormGroup>
      <FormRow label="Payment Method">
        <div style={{ width: "100%", maxWidth: 160 }}>
          <PaymentMethodSelect
            value={value}
            onChange={onChange}
            cards={cards}
            bankAccounts={bankAccounts}
          />
        </div>
      </FormRow>
      <FormRow label="Notes" isLast>
        <input
          value={value.source || ""}
          onChange={(event) => onChange({ source: event.target.value })}
          placeholder="Optional"
          aria-label="Notes"
          style={formInputStyle}
        />
      </FormRow>
    </FormGroup>
  );
}
