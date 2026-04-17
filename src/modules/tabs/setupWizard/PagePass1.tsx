import { useEffect, useState } from "react";
import type { IncomeType, Payday, PayFrequency, PaycheckDepositAccount } from "../../../types/index.js";
import { T } from "../../constants.js";
import type { SetupWizardCombinedData, SetupWizardUpdate } from "../SetupWizard.js";
import { NavRow, WizField, WizInput, WizSelect } from "./primitives.js";

interface PagePassSharedProps {
  data: SetupWizardCombinedData;
  onChange: SetupWizardUpdate<SetupWizardCombinedData>;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  nextLabel?: string;
  quickStart?: boolean;
}

export function PagePass1({ data, onChange, onNext, onBack, onSkip, nextLabel, quickStart = false }: PagePassSharedProps) {
  const [showUnevenPaycheck, setShowUnevenPaycheck] = useState(Boolean(data.paycheckFirstOfMonth));
  const [showAdvancedIncome, setShowAdvancedIncome] = useState(
    !quickStart || data.incomeType === "hourly" || data.incomeType === "variable" || Boolean(data.typicalHours || data.averagePaycheck)
  );
  const showQuickStartDepositNote = quickStart && !showAdvancedIncome;

  useEffect(() => {
    if (data.paycheckFirstOfMonth) setShowUnevenPaycheck(true);
  }, [data.paycheckFirstOfMonth]);

  return (
    <div>
      <div
        style={{
          marginBottom: 14,
          padding: "11px 13px",
          background: `${T.accent.emerald}10`,
          border: `1px solid ${T.accent.emerald}22`,
          borderRadius: T.radius.md,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: T.accent.emerald, marginBottom: 4 }}>Most important step</div>
        <div style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.5 }}>
          {quickStart
            ? "Quick Start only asks for the numbers needed to make the first audit credible. Deposit account, tax detail, and advanced setup can wait."
            : "These numbers drive paycheck timing, weekly runway, and whether the app says you are safe or stretched."}
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: T.text.primary, margin: "0 0 6px 0", letterSpacing: "-0.01em" }}>
          Your Income Story
        </h3>
        <p style={{ fontSize: 13, color: T.text.secondary, margin: 0, lineHeight: 1.5 }}>
          Start with the minimum needed for a reliable first audit: when money lands, how much usually arrives, and
          what you tend to spend each week.
        </p>
      </div>

      <WizField label="How often do you get paid?">
        <WizSelect
          value={data.payFrequency}
          onChange={v => onChange("payFrequency", v as PayFrequency)}
          options={[
            { value: "weekly", label: "Weekly" },
            { value: "bi-weekly", label: "Bi-Weekly (every 2 weeks)" },
            { value: "semi-monthly", label: "Semi-Monthly (1st & 15th)" },
            { value: "monthly", label: "Monthly" },
          ]}
        />
      </WizField>

      <div style={{ display: "grid", gridTemplateColumns: showQuickStartDepositNote ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        <WizField label="Payday" hint="Typical day of arrival">
          <WizSelect
            value={data.payday}
            onChange={v => onChange("payday", v as Payday)}
            options={["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]}
          />
        </WizField>
        {showQuickStartDepositNote ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 18,
              padding: "12px 14px",
              borderRadius: T.radius.md,
              background: `${T.accent.primary}08`,
              border: `1px solid ${T.accent.primary}18`,
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                background: `${T.accent.primary}14`,
                color: T.accent.primary,
                fontSize: 14,
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              $
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.text.dim, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Deposit Target
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary }}>Checking</div>
              <div style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.45, marginTop: 3 }}>
                Quick Start assumes your paycheck lands in checking. You can change that later in advanced setup.
              </div>
            </div>
          </div>
        ) : (
          <WizField label="Deposit Into" hint="Where the funds land">
            <WizSelect
              value={data.paycheckDepositAccount}
              onChange={v => onChange("paycheckDepositAccount", v as PaycheckDepositAccount)}
              options={[
                { value: "checking", label: "Checking" },
                { value: "savings", label: "Vault/Savings" },
              ]}
            />
          </WizField>
        )}
      </div>

      {quickStart && !showAdvancedIncome ? (
        <>
          <WizField label="Typical Paycheck ($)" hint="Net take-home for a normal paycheck. Quick Start assumes salary-style paychecks.">
            <WizInput
              type="number"
              inputMode="decimal"
              pattern="[0-9]*"
              value={data.paycheckStandard}
              onChange={v => onChange("paycheckStandard", v)}
              placeholder="e.g. 2400"
            />
          </WizField>
          <button
            type="button"
            onClick={() => {
              onChange("incomeType", data.incomeType === "hourly" || data.incomeType === "variable" ? data.incomeType : "salary");
              setShowAdvancedIncome(true);
            }}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              margin: "-2px 0 14px",
              padding: "10px 12px",
              borderRadius: T.radius.md,
              border: `1px solid ${T.border.subtle}`,
              background: T.bg.elevated,
              color: T.text.secondary,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <span>Paid hourly, variable, or to savings instead?</span>
            <span style={{ color: T.text.dim, fontSize: 11 }}>Use advanced income setup</span>
          </button>
        </>
      ) : (
        <WizField label="Income Type" hint="Determines how we calculate your runway">
          <WizSelect
            value={data.incomeType || "salary"}
            onChange={v => onChange("incomeType", v as IncomeType)}
            options={[
              { value: "salary", label: "Salary (Consistent Paychecks)" },
              { value: "hourly", label: "Hourly Wage" },
              { value: "variable", label: "Variable (Commission, Gig, Tips)" },
            ]}
          />
        </WizField>
      )}

      {(!data.incomeType || data.incomeType === "salary") && (!quickStart || showAdvancedIncome) && (
        <>
          <WizField label="Standard Paycheck ($)" hint="Your exact net take-home pay per check (after taxes & deductions)">
            <WizInput
              type="number"
              inputMode="decimal"
              pattern="[0-9]*"
              value={data.paycheckStandard}
              onChange={v => onChange("paycheckStandard", v)}
              placeholder="e.g. 2400"
            />
          </WizField>
          <button
            type="button"
            onClick={() => setShowUnevenPaycheck((current) => !current)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              margin: "-2px 0 14px",
              padding: "10px 12px",
              borderRadius: T.radius.md,
              border: `1px solid ${T.border.subtle}`,
              background: T.bg.elevated,
              color: T.text.secondary,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <span>Uneven first paycheck?</span>
            <span style={{ color: T.text.dim, fontSize: 11 }}>
              {showUnevenPaycheck ? "Hide" : "Add optional adjustment"}
            </span>
          </button>
          {showUnevenPaycheck && (
            <WizField label="First-of-Month Paycheck ($)" hint="Only if one paycheck is lower because of benefits or insurance">
              <WizInput
                type="number"
                inputMode="decimal"
                pattern="[0-9]*"
                value={data.paycheckFirstOfMonth}
                onChange={v => onChange("paycheckFirstOfMonth", v)}
                placeholder="Leave blank if same as above"
              />
            </WizField>
          )}
        </>
      )}

      {data.incomeType === "hourly" && (!quickStart || showAdvancedIncome) && (
        <>
          <WizField label="Net Hourly Rate ($)" hint="Your approximate hourly take-home pay after taxes">
            <WizInput
              type="number"
              inputMode="decimal"
              pattern="[0-9]*"
              value={data.hourlyRateNet}
              onChange={v => onChange("hourlyRateNet", v)}
              placeholder="e.g. 24.50"
            />
          </WizField>
          <WizField label="Typical Hours per Paycheck" hint={`How many hours do you usually work per ${data.payFrequency || "pay period"}?`}>
            <WizInput
              type="number"
              inputMode="decimal"
              pattern="[0-9]*"
              value={data.typicalHours}
              onChange={v => onChange("typicalHours", v)}
              placeholder="e.g. 80"
            />
          </WizField>
        </>
      )}

      {data.incomeType === "variable" && (!quickStart || showAdvancedIncome) && (
        <WizField label="Average Paycheck ($)" hint="Be conservative here. What is a reliable average net pay per check?">
          <WizInput
            type="number"
            inputMode="decimal"
            pattern="[0-9]*"
            value={data.averagePaycheck}
            onChange={v => onChange("averagePaycheck", v)}
            placeholder="e.g. 1500"
          />
        </WizField>
      )}

      <div style={{ margin: "24px 0 14px", borderTop: `1px solid ${T.border.subtle}`, paddingTop: 18 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text.primary, margin: "0 0 6px 0" }}>
          Fun Money & Spending
        </h3>
        <p style={{ fontSize: 12, color: T.text.muted, margin: "0 0 16px 0", lineHeight: 1.5 }}>
          This is your weekly variable spending cap for groceries, dining, gas, and day-to-day life. It should{" "}
          <strong>not</strong> include rent, debt minimums, or subscriptions.
        </p>
      </div>

      <WizField label="Weekly Spend Allowance ($)" hint="The maximum you allow yourself to spend per week on everyday fun/needs.">
        <WizInput
          type="number"
          inputMode="decimal"
          pattern="[0-9]*"
          value={data.weeklySpendAllowance}
          onChange={v => onChange("weeklySpendAllowance", v)}
          placeholder="e.g. 300"
        />
      </WizField>
      <p style={{ fontSize: 11, color: T.text.muted, fontStyle: "italic", marginTop: -6, marginBottom: 16 }}>
        Use your real number, not your aspirational one. The app can only protect cash flow with honest inputs.
      </p>

      {quickStart && showAdvancedIncome ? (
        <button
          type="button"
          onClick={() => setShowAdvancedIncome(false)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            margin: "-2px 0 14px",
            padding: "10px 12px",
            borderRadius: T.radius.md,
            border: `1px solid ${T.border.subtle}`,
            background: T.bg.elevated,
            color: T.text.secondary,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          <span>Collapse advanced income setup</span>
          <span style={{ color: T.text.dim, fontSize: 11 }}>Back to Quick Start</span>
        </button>
      ) : null}

      <NavRow
        onBack={onBack}
        onNext={onNext}
        onSkip={onSkip}
        {...(nextLabel ? { nextLabel } : {})}
      />
    </div>
  );
}
