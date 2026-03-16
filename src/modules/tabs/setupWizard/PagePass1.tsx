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
}

export function PagePass1({ data, onChange, onNext, onBack, onSkip }: PagePassSharedProps) {
  return (
    <div>
      <div
        style={{
          marginBottom: 18,
          padding: "12px 14px",
          background: `${T.accent.emerald}10`,
          border: `1px solid ${T.accent.emerald}22`,
          borderRadius: T.radius.lg,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: T.accent.emerald, marginBottom: 4 }}>Most important step</div>
        <div style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.5 }}>
          These numbers drive paycheck timing, weekly runway, and whether the app says you are safe or stretched.
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: T.text.primary, margin: "0 0 6px 0", letterSpacing: "-0.01em" }}>
          Your Income Story
        </h3>
        <p style={{ fontSize: 13, color: T.text.secondary, margin: 0, lineHeight: 1.5 }}>
          Start with the minimum needed for a reliable first audit: how often you get paid, roughly how much arrives,
          and what you usually spend each week.
        </p>
      </div>

      <WizField label="How often do you get paid?">
        <WizSelect
          value={data.payFrequency}
          onChange={v => onChange("payFrequency", v as PayFrequency)}
          options={[
            { value: "weekly", label: "📅 Weekly" },
            { value: "bi-weekly", label: "📅 Bi-Weekly (every 2 weeks)" },
            { value: "semi-monthly", label: "📅 Semi-Monthly (1st & 15th)" },
            { value: "monthly", label: "📅 Monthly" },
          ]}
        />
      </WizField>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <WizField label="Payday" hint="Typical day of arrival">
          <WizSelect
            value={data.payday}
            onChange={v => onChange("payday", v as Payday)}
            options={["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]}
          />
        </WizField>
        <WizField label="Deposit Into" hint="Where the funds land">
          <WizSelect
            value={data.paycheckDepositAccount}
            onChange={v => onChange("paycheckDepositAccount", v as PaycheckDepositAccount)}
            options={[
              { value: "checking", label: "🏦 Checking" },
              { value: "savings", label: "🏦 Vault/Savings" },
            ]}
          />
        </WizField>
      </div>

      <WizField label="Income Type" hint="Determines how we calculate your runway">
        <WizSelect
          value={data.incomeType || "salary"}
          onChange={v => onChange("incomeType", v as IncomeType)}
          options={[
            { value: "salary", label: "💼 Salary (Consistent Paychecks)" },
            { value: "hourly", label: "⏱️ Hourly Wage" },
            { value: "variable", label: "📈 Variable (Commission, Gig, Tips)" },
          ]}
        />
      </WizField>

      {(!data.incomeType || data.incomeType === "salary") && (
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
          <WizField label="First-of-Month Paycheck ($)" hint="If your first check is lower due to benefits/insurance (Leave blank if same)">
            <WizInput
              type="number"
              inputMode="decimal"
              pattern="[0-9]*"
              value={data.paycheckFirstOfMonth}
              onChange={v => onChange("paycheckFirstOfMonth", v)}
              placeholder="Leave blank if same as above"
            />
          </WizField>
        </>
      )}

      {data.incomeType === "hourly" && (
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

      {data.incomeType === "variable" && (
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

      <div style={{ margin: "32px 0 16px", borderTop: `1px solid ${T.border.subtle}`, paddingTop: 24 }}>
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

      <WizField label="Default APR (%)" hint="Used to estimate interest penalties on any newly added, unpaid card balances.">
        <WizInput
          type="number"
          inputMode="decimal"
          pattern="[0-9]*"
          value={data.defaultAPR}
          onChange={v => onChange("defaultAPR", v)}
          placeholder="e.g. 24.99"
        />
      </WizField>

      <NavRow onBack={onBack} onNext={onNext} onSkip={onSkip} />
    </div>
  );
}
