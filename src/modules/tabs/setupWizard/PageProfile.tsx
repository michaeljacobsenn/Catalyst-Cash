import type { HousingType } from "../../../types/index.js";
import { T } from "../../constants.js";
import { CURRENCIES } from "../../currency.js";
import type { SetupWizardCombinedData, SetupWizardUpdate } from "../SetupWizard.js";
import { NavRow, WizField, WizInput, WizSelect } from "./primitives.js";
import { US_STATES } from "./shared.js";

interface PageProfileProps {
  data: SetupWizardCombinedData;
  onChange: SetupWizardUpdate<SetupWizardCombinedData>;
  onNext: () => void;
  onBack: () => void;
}

export function PageProfile({ data, onChange, onNext, onBack }: PageProfileProps) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
          padding: "14px 16px",
          marginBottom: 20,
          background: `linear-gradient(145deg, ${T.bg.elevated}, ${T.bg.base})`,
          border: `1px solid ${T.border.default}`,
          borderRadius: T.radius.lg,
          boxShadow: `0 4px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05)`,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            flexShrink: 0,
            background: `${T.status.green}15`,
            border: `1px solid ${T.status.green}30`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 0 12px ${T.status.green}20`,
          }}
        >
          <span style={{ fontSize: 16 }}>🛡️</span>
        </div>
        <div>
          <h4 style={{ margin: "0 0 4px 0", fontSize: 13, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>
            Private by Design
          </h4>
          <p style={{ margin: 0, fontSize: 12, color: T.text.secondary, lineHeight: 1.5 }}>
            Your core financial data stays stored{" "}
            <strong style={{ color: T.status.green, fontWeight: 600 }}>on-device</strong>. AI requests are routed
            through the Catalyst Cash backend proxy with PII scrubbing, and optional backups sync through your personal
            iCloud/Drive.
          </p>
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: T.text.primary, margin: "0 0 6px 0", letterSpacing: "-0.01em" }}>
          Demographics & Region
        </h3>
        <p style={{ fontSize: 13, color: T.text.secondary, margin: "0 0 16px 0", lineHeight: 1.5 }}>
          This crucial context helps Catalyst's AI understand your tax burden, retirement timeline, and housing strategy.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <WizField label="Currency" hint="Display currency">
          <WizSelect
            value={data.currencyCode || "USD"}
            onChange={v => onChange("currencyCode", v)}
            options={CURRENCIES.map(c => ({ value: c.code, label: `${c.flag} ${c.code}` }))}
          />
        </WizField>
        <WizField label="State" hint="🟢 = No state income tax">
          <WizSelect
            value={data.stateCode || ""}
            onChange={v => onChange("stateCode", v)}
            options={US_STATES.map(s => ({ value: s.code, label: s.label }))}
          />
        </WizField>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16, marginBottom: 24 }}>
        <WizField label="Birth Year" hint="For retirement timelines">
          <WizInput
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            value={data.birthYear || ""}
            onChange={v => onChange("birthYear", v ? String(Number(v)) : "")}
            placeholder="e.g. 1995"
            aria-label="Birth year"
          />
        </WizField>
        <WizField label="Housing Status" hint="Rent, own, or neither?">
          <WizSelect
            value={data.housingType || ""}
            onChange={v => onChange("housingType", v as HousingType)}
            options={[
              { value: "", label: "Skip / Neither" },
              { value: "rent", label: "🏢 Renter" },
              { value: "own", label: "🏠 Homeowner" },
            ]}
          />
        </WizField>
      </div>

      {(data.housingType === "rent" || data.housingType === "own") && (
        <div
          style={{
            marginBottom: 24,
            padding: 16,
            background: T.bg.elevated,
            borderRadius: T.radius.lg,
            border: `1px solid ${T.border.subtle}`,
          }}
        >
          {data.housingType === "rent" && (
            <WizField label="Monthly Rent ($)" hint="Including typical utilities">
              <WizInput
                type="number"
                inputMode="decimal"
                pattern="[0-9]*"
                value={data.monthlyRent || ""}
                onChange={v => onChange("monthlyRent", v)}
                placeholder="e.g. 1500"
              />
            </WizField>
          )}
          {data.housingType === "own" && (
            <WizField label="Total Mortgage Payment ($)" hint="Principal, Interest, Taxes, Insurance (PITI)">
              <WizInput
                type="number"
                inputMode="decimal"
                pattern="[0-9]*"
                value={data.mortgagePayment || ""}
                onChange={v => onChange("mortgagePayment", v)}
                placeholder="e.g. 2500"
              />
            </WizField>
          )}
        </div>
      )}

      <NavRow onNext={onNext} onBack={onBack} nextLabel="Continue →" />
    </div>
  );
}
