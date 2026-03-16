import { InlineTooltip } from "../../ui.js";
import { T } from "../../constants.js";
import type { SetupWizardCombinedData, SetupWizardUpdate } from "../SetupWizard.js";
import { NavRow, WizField, WizInput, WizToggle } from "./primitives.js";

interface PagePassSharedProps {
  data: SetupWizardCombinedData;
  onChange: SetupWizardUpdate<SetupWizardCombinedData>;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export function PagePass2({ data, onChange, onNext, onBack, onSkip }: PagePassSharedProps) {
  return (
    <div>
      <div
        style={{
          marginBottom: 18,
          padding: "12px 14px",
          background: T.bg.elevated,
          border: `1px solid ${T.border.subtle}`,
          borderRadius: T.radius.lg,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: T.text.primary, marginBottom: 4 }}>Optional, but improves accuracy</div>
        <div style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.5 }}>
          If you skip this, Catalyst will still work. These settings mostly improve reserve targets, debt-vs-save
          decisions, and tax-aware recommendations.
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: T.text.primary, margin: "0 0 6px 0", letterSpacing: "-0.01em" }}>
          Your Wealth Targets
        </h3>
        <p style={{ fontSize: 13, color: T.text.secondary, margin: 0, lineHeight: 1.5 }}>
          These guardrails tell Catalyst when cash should stay liquid and when it is genuinely safe to invest or attack debt.
        </p>
      </div>

      <WizField label={<InlineTooltip term="Floor">Checking Floor ($)</InlineTooltip>} hint="The absolute minimum balance you want your checking account to hold at all times.">
        <WizInput
          type="number"
          inputMode="decimal"
          pattern="[0-9]*"
          value={data.emergencyFloor}
          onChange={v => onChange("emergencyFloor", v)}
          placeholder="e.g. 1000"
        />
      </WizField>
      <p style={{ fontSize: 11, color: T.text.muted, fontStyle: "italic", marginTop: -6, marginBottom: 16 }}>
        A good default is enough cash to absorb one messy week without overdrafting.
      </p>

      <WizField label="Optimal Reserve Target ($)" hint="The ideal balance indicating your checking is fully healthy.">
        <WizInput
          type="number"
          inputMode="decimal"
          pattern="[0-9]*"
          value={data.greenStatusTarget}
          onChange={v => onChange("greenStatusTarget", v)}
          placeholder="e.g. 3000"
        />
      </WizField>

      <WizField label={<InlineTooltip term="Emergency reserve">Vault / Emergency Target ($)</InlineTooltip>} hint="The total savings goal for your standalone emergency fund.">
        <WizInput
          type="number"
          inputMode="decimal"
          pattern="[0-9]*"
          value={data.emergencyReserveTarget}
          onChange={v => onChange("emergencyReserveTarget", v)}
          placeholder="e.g. 15000"
        />
      </WizField>
      <p style={{ fontSize: 11, color: T.text.muted, fontStyle: "italic", marginTop: -6, marginBottom: 16 }}>
        A 3-6 month runway is a strong target, but a smaller starter reserve is still worth defining.
      </p>

      <div style={{ margin: "32px 0 16px", borderTop: `1px solid ${T.border.subtle}`, paddingTop: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text.primary, margin: "0 0 6px 0" }}>
          Taxes (The boring but important stuff)
        </h3>
        <p style={{ fontSize: 12, color: T.text.muted, margin: "0 0 16px 0", lineHeight: 1.5 }}>
          This helps Catalyst calculate the true ROI of your debt payoff and investments.
        </p>
      </div>

      <WizField label="Marginal Tax Bracket (%)" hint="Your highest combined federal + state income tax bracket.">
        <WizInput
          type="number"
          inputMode="decimal"
          pattern="[0-9]*"
          value={data.taxBracketPercent}
          onChange={v => onChange("taxBracketPercent", v)}
          placeholder="e.g. 24"
        />
      </WizField>

      <WizToggle
        label="1099 / Self-Employed"
        sub="Enables tracking for estimated quarterly tax payments."
        checked={data.isContractor}
        onChange={v => onChange("isContractor", v)}
      />

      <NavRow onBack={onBack} onNext={onNext} onSkip={onSkip} />
    </div>
  );
}
