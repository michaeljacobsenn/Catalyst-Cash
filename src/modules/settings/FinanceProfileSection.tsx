import type { HousingType, IncomeType, Payday, PayFrequency } from "../../types/index.js";
import { T } from "../constants.js";
import { Badge, Card, Label, NoticeBanner } from "../ui.js";
import { ChevronDown, Layers, RefreshCw, Save } from "../icons";
import { haptic } from "../haptics.js";

interface FinanceSummaryItem {
  label: string;
  value: string;
}

interface FinanceProfileSectionProps {
  activeMenu: "finance" | "profile" | "ai" | "backup" | "dev" | "security" | "plaid" | null;
  financialConfig: Record<string, any>;
  financeSummaryItems: FinanceSummaryItem[];
  proEnabled: boolean;
  setFinancialConfig: (value: any) => void;
  setShowPaywall: (value: boolean) => void;
}

const SECTION_MARGIN = "0 16px";
const fieldCardStyle = {
  borderRadius: T.radius.lg,
  border: `1px solid ${T.border.subtle}`,
  background: `linear-gradient(180deg, ${T.bg.surface}, ${T.bg.elevated})`,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
} as const;

function SectionCard({
  eyebrow,
  title,
  description,
  children,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card
      variant="glass"
      style={{
        margin: SECTION_MARGIN,
        padding: "18px 18px 16px",
        border: `1px solid ${T.border.subtle}`,
        background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.surface})`,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          {eyebrow ? (
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: T.text.dim,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                fontFamily: T.font.mono,
                marginBottom: 6,
              }}
            >
              {eyebrow}
            </div>
          ) : null}
          <div style={{ fontSize: 18, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.025em" }}>{title}</div>
          {description ? (
            <p style={{ margin: "6px 0 0", fontSize: 12, lineHeight: 1.55, color: T.text.secondary }}>{description}</p>
          ) : null}
        </div>
        {action ? <div style={{ flexShrink: 0 }}>{action}</div> : null}
      </div>
      {children}
    </Card>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        ...fieldCardStyle,
        padding: "12px 12px 11px",
        minHeight: 72,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: T.text.dim,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontFamily: T.font.mono,
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 7,
          fontSize: 14,
          fontWeight: 700,
          color: T.text.primary,
          lineHeight: 1.35,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SelectShell({
  value,
  onChange,
  options,
  accent = T.accent.primary,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  accent?: string;
}) {
  return (
    <div
      style={{
        ...fieldCardStyle,
        position: "relative",
        minWidth: 0,
        paddingRight: 34,
      }}
    >
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          minHeight: 46,
          padding: "12px 14px",
          background: "transparent",
          border: "none",
          boxShadow: "none",
          color: value ? accent : T.text.secondary,
          fontSize: 15,
          fontWeight: 700,
          outline: "none",
          appearance: "none",
        }}
      >
        {options.map((option) => (
          <option key={option.value || option.label} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <div
        style={{
          position: "absolute",
          right: 12,
          top: "50%",
          transform: "translateY(-50%)",
          pointerEvents: "none",
          color: T.text.muted,
          display: "flex",
          alignItems: "center",
        }}
      >
        <ChevronDown size={15} />
      </div>
    </div>
  );
}

function TextField({
  value,
  onChange,
  placeholder,
  prefix,
  suffix,
  inputMode = "text",
  width,
  textAlign = "right",
  fullWidth = false,
}: {
  value: string | number;
  onChange: (value: string) => void;
  placeholder: string;
  prefix?: string;
  suffix?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  width?: number;
  textAlign?: "left" | "right";
  fullWidth?: boolean;
}) {
  return (
    <div
      style={{
        ...fieldCardStyle,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 6,
        minWidth: 0,
        padding: "0 14px",
        minHeight: 48,
      }}
    >
      {prefix ? <span style={{ color: T.text.muted, fontSize: 15 }}>{prefix}</span> : null}
      <input
        type={inputMode === "decimal" ? "text" : "text"}
        inputMode={inputMode}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        style={{
          width: fullWidth ? "100%" : width,
          flex: fullWidth ? 1 : "0 0 auto",
          minWidth: fullWidth ? 0 : width,
          minHeight: 40,
          padding: 0,
          background: "transparent",
          border: "none",
          boxShadow: "none",
          color: T.text.primary,
          fontSize: 15,
          fontWeight: 700,
          outline: "none",
          textAlign,
        }}
      />
      {suffix ? <span style={{ color: T.text.muted, fontSize: 14 }}>{suffix}</span> : null}
    </div>
  );
}

function FieldBlock({
  label,
  detail,
  children,
}: {
  label: string;
  detail?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: 7, minWidth: 0 }}>
      <div>
        <Label style={{ marginBottom: 0 }}>{label}</Label>
        {detail ? (
          <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.45, color: T.text.secondary }}>{detail}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function ChoicePills<TValue extends string>({
  value,
  options,
  onChange,
}: {
  value: TValue | "";
  options: Array<{ value: TValue | ""; label: string }>;
  onChange: (value: TValue | "") => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value || option.label}
            type="button"
            onClick={() => {
              haptic.selection();
              onChange(option.value);
            }}
            style={{
              padding: "11px 14px",
              borderRadius: 14,
              border: `1px solid ${active ? T.accent.primarySoft : T.border.subtle}`,
              background: active ? `linear-gradient(180deg, ${T.accent.primaryDim}, ${T.bg.elevated})` : T.bg.surface,
              color: active ? T.accent.primary : T.text.secondary,
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: "-0.01em",
              cursor: "pointer",
              boxShadow: active ? `0 0 0 1px ${T.accent.primaryDim} inset` : "inset 0 1px 0 rgba(255,255,255,0.03)",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function RowLabel({ title, detail }: { title: string; detail?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: T.text.primary, lineHeight: 1.25 }}>{title}</div>
      {detail ? <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.45, color: T.text.secondary }}>{detail}</div> : null}
    </div>
  );
}

function ControlRow({
  title,
  detail,
  control,
  stackOnMobile = false,
}: {
  title: string;
  detail?: string;
  control: React.ReactNode;
  stackOnMobile?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: stackOnMobile ? "1fr" : "minmax(0, 1fr) auto",
        gap: 12,
        alignItems: "center",
      }}
    >
      <RowLabel {...(detail ? { title, detail } : { title })} />
      <div style={{ minWidth: 0 }}>{control}</div>
    </div>
  );
}

export function FinanceProfileSection({
  activeMenu,
  financialConfig,
  financeSummaryItems,
  proEnabled,
  setFinancialConfig,
  setShowPaywall,
}: FinanceProfileSectionProps) {
  if (activeMenu !== "finance") return null;

  const setNumericField = (field: string, raw: string) => {
    const val = String(raw || "").replace(/[^0-9.]/g, "");
    setFinancialConfig((prev: Record<string, any>) => ({ ...prev, [field]: val ? parseFloat(val) : 0 }));
  };

  const setDirectField = (field: string, value: any) => {
    setFinancialConfig((prev: Record<string, any>) => ({ ...prev, [field]: value }));
  };

  const setReducerField = (field: string, value: any) => {
    setFinancialConfig({ type: "SET_FIELD", field, value });
  };

  const incomeType = financialConfig?.incomeType || "salary";
  const housingType = financialConfig?.housingType || "";
  const isCompactPhone = typeof window !== "undefined" ? window.innerWidth <= 390 : false;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "16px 0 28px" }}>
      <SectionCard
        eyebrow="Profile Snapshot"
        title="Financial profile"
        description="Keep this page lean. Only inputs that materially change timing, liquidity, tax treatment, or risk belong here."
        action={<Badge variant="purple">Lean Inputs</Badge>}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          {financeSummaryItems.map((item) => (
            <MetricTile key={item.label} label={item.label} value={item.value} />
          ))}
        </div>
        <NoticeBanner
          tone="info"
          compact
          style={{ marginTop: 12 }}
          title="Keep audits sharp"
          message="If a value does not meaningfully change the cash plan, leave it out here. The goal is a cleaner profile and more precise briefings."
        />
      </SectionCard>

      <SectionCard
        eyebrow="Identity & Region"
        title="Personal context"
        description="This helps Catalyst speak naturally, model taxes more accurately, and keep your profile grounded."
      >
        <div style={{ display: "grid", gap: 12 }}>
          <FieldBlock label="Preferred name" detail="Used for personalization in AskAI and weekly briefings.">
            <TextField
              value={financialConfig?.preferredName || ""}
              onChange={(value) => setDirectField("preferredName", String(value || "").slice(0, 40))}
              placeholder="Optional"
              textAlign="left"
              fullWidth
            />
          </FieldBlock>
          <div style={{ display: "grid", gridTemplateColumns: isCompactPhone ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            <FieldBlock label="Birth Year">
              <TextField
                value={financialConfig?.birthYear || ""}
                onChange={(value) => {
                  const digits = String(value || "").replace(/[^0-9]/g, "").slice(0, 4);
                  setDirectField("birthYear", digits ? parseInt(digits, 10) : null);
                }}
                placeholder="1990"
                inputMode="numeric"
                fullWidth
              />
            </FieldBlock>
            <FieldBlock label="State">
              <SelectShell
                value={financialConfig?.stateCode || ""}
                onChange={(value) => setDirectField("stateCode", value)}
                options={[
                  { value: "", label: "Not in US" },
                  { value: "AL", label: "AL" },
                  { value: "AK", label: "AK" },
                  { value: "AZ", label: "AZ" },
                  { value: "AR", label: "AR" },
                  { value: "CA", label: "CA" },
                  { value: "CO", label: "CO" },
                  { value: "CT", label: "CT" },
                  { value: "DE", label: "DE" },
                  { value: "DC", label: "DC" },
                  { value: "FL", label: "FL" },
                  { value: "GA", label: "GA" },
                  { value: "HI", label: "HI" },
                  { value: "ID", label: "ID" },
                  { value: "IL", label: "IL" },
                  { value: "IN", label: "IN" },
                  { value: "IA", label: "IA" },
                  { value: "KS", label: "KS" },
                  { value: "KY", label: "KY" },
                  { value: "LA", label: "LA" },
                  { value: "ME", label: "ME" },
                  { value: "MD", label: "MD" },
                  { value: "MA", label: "MA" },
                  { value: "MI", label: "MI" },
                  { value: "MN", label: "MN" },
                  { value: "MS", label: "MS" },
                  { value: "MO", label: "MO" },
                  { value: "MT", label: "MT" },
                  { value: "NE", label: "NE" },
                  { value: "NV", label: "NV" },
                  { value: "NH", label: "NH" },
                  { value: "NJ", label: "NJ" },
                  { value: "NM", label: "NM" },
                  { value: "NY", label: "NY" },
                  { value: "NC", label: "NC" },
                  { value: "ND", label: "ND" },
                  { value: "OH", label: "OH" },
                  { value: "OK", label: "OK" },
                  { value: "OR", label: "OR" },
                  { value: "PA", label: "PA" },
                  { value: "RI", label: "RI" },
                  { value: "SC", label: "SC" },
                  { value: "SD", label: "SD" },
                  { value: "TN", label: "TN" },
                  { value: "TX", label: "TX" },
                  { value: "UT", label: "UT" },
                  { value: "VT", label: "VT" },
                  { value: "VA", label: "VA" },
                  { value: "WA", label: "WA" },
                  { value: "WV", label: "WV" },
                  { value: "WI", label: "WI" },
                  { value: "WY", label: "WY" },
                ]}
              />
            </FieldBlock>
          </div>
          <FieldBlock label="Base currency" detail="This controls formatting and keeps audit math consistent across the app.">
            <SelectShell
              value={financialConfig?.currencyCode || "USD"}
              onChange={(value) => setDirectField("currencyCode", value)}
              options={[
                { value: "USD", label: "USD ($)" },
                { value: "EUR", label: "EUR (€)" },
                { value: "GBP", label: "GBP (£)" },
                { value: "CAD", label: "CAD ($)" },
                { value: "AUD", label: "AUD ($)" },
                { value: "JPY", label: "JPY (¥)" },
                { value: "INR", label: "INR (₹)" },
              ]}
            />
          </FieldBlock>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Income Engine"
        title="Income profile"
        description="Define how money lands so Catalyst can sequence bills, buffers, and weekly operating moves correctly."
      >
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <Label style={{ marginBottom: 8 }}>Income Type</Label>
            <ChoicePills<IncomeType>
              value={incomeType}
              onChange={(value) => setReducerField("incomeType", value || "salary")}
              options={[
                { value: "salary", label: "Salary" },
                { value: "hourly", label: "Hourly" },
                { value: "variable", label: "Variable" },
              ]}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isCompactPhone ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            <FieldBlock label="Pay Frequency">
              <SelectShell
                value={financialConfig?.payFrequency || "bi-weekly"}
                onChange={(value) => setReducerField("payFrequency", value as PayFrequency)}
                options={[
                  { value: "weekly", label: "Weekly" },
                  { value: "bi-weekly", label: "Bi-Weekly" },
                  { value: "semi-monthly", label: "Semi-Monthly" },
                  { value: "monthly", label: "Monthly" },
                ]}
              />
            </FieldBlock>
            <FieldBlock label="Typical Payday">
              <SelectShell
                value={financialConfig?.payday || "Friday"}
                onChange={(value) => setReducerField("payday", value as Payday)}
                options={[
                  { value: "Monday", label: "Monday" },
                  { value: "Tuesday", label: "Tuesday" },
                  { value: "Wednesday", label: "Wednesday" },
                  { value: "Thursday", label: "Thursday" },
                  { value: "Friday", label: "Friday" },
                  { value: "Saturday", label: "Saturday" },
                  { value: "Sunday", label: "Sunday" },
                ]}
              />
            </FieldBlock>
          </div>

          {incomeType === "salary" ? (
            <div style={{ display: "grid", gridTemplateColumns: isCompactPhone ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              <FieldBlock label="Standard Paycheck">
                <TextField
                  value={financialConfig?.paycheckStandard || ""}
                  onChange={(value) => setNumericField("paycheckStandard", value)}
                  placeholder="0"
                  prefix="$"
                  fullWidth
                />
              </FieldBlock>
              <FieldBlock label="1st of Month Paycheck">
                <TextField
                  value={financialConfig?.paycheckFirstOfMonth || ""}
                  onChange={(value) => setNumericField("paycheckFirstOfMonth", value)}
                  placeholder="Optional"
                  prefix="$"
                  fullWidth
                />
              </FieldBlock>
            </div>
          ) : null}

          {incomeType === "hourly" ? (
            <div style={{ display: "grid", gridTemplateColumns: isCompactPhone ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              <FieldBlock label="Hourly Rate (Net)">
                <TextField
                  value={financialConfig?.hourlyRateNet || ""}
                  onChange={(value) => setNumericField("hourlyRateNet", value)}
                  placeholder="0.00"
                  prefix="$"
                  fullWidth
                />
              </FieldBlock>
              <FieldBlock label="Typical Hours">
                <TextField
                  value={financialConfig?.typicalHours || ""}
                  onChange={(value) => setNumericField("typicalHours", value)}
                  placeholder="80"
                  suffix="hrs"
                  fullWidth
                />
              </FieldBlock>
            </div>
          ) : null}

          {incomeType === "variable" ? (
            <FieldBlock label="Average Paycheck">
              <TextField
                value={financialConfig?.averagePaycheck || ""}
                onChange={(value) => setNumericField("averagePaycheck", value)}
                placeholder="0"
                prefix="$"
                fullWidth
              />
            </FieldBlock>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Living Costs"
        title="Housing situation"
        description="Only set this if housing meaningfully affects your baseline obligations or regional planning."
      >
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <Label style={{ marginBottom: 8 }}>Housing Type</Label>
            <ChoicePills<HousingType>
              value={housingType}
              onChange={(value) => setReducerField("housingType", value as HousingType)}
              options={[
                { value: "", label: "Unspecified" },
                { value: "rent", label: "Renting" },
                { value: "own", label: "Homeowner" },
              ]}
            />
          </div>
          {housingType === "rent" ? (
            <ControlRow
              title="Monthly rent"
              detail="Use the all-in recurring rent amount that materially impacts your plan."
              control={
                <TextField
                  value={financialConfig?.monthlyRent || ""}
                  onChange={(value) => setNumericField("monthlyRent", value)}
                  placeholder="0"
                  prefix="$"
                  fullWidth
                />
              }
            />
          ) : null}
          {housingType === "own" ? (
            <ControlRow
              title="Mortgage (PITI)"
              detail="Use the recurring all-in homeowner payment if it shapes weekly liquidity."
              control={
                <TextField
                  value={financialConfig?.mortgagePayment || ""}
                  onChange={(value) => setNumericField("mortgagePayment", value)}
                  placeholder="0"
                  prefix="$"
                  fullWidth
                />
              }
            />
          ) : null}
          {!housingType ? (
            <NoticeBanner
              tone="info"
              compact
              title="Optional"
              message="Leave housing unset if it is already captured elsewhere and does not change your weekly cash sequencing."
            />
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Scenario Sandbox"
        title="Pressure-test changes"
        description="Save a clean baseline, then model a relocation, salary change, or major expense without rewriting your live profile."
        action={!proEnabled ? <Badge variant="purple">Pro</Badge> : undefined}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: `${T.accent.emerald}18`,
              border: `1px solid ${T.accent.emerald}26`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Layers size={18} color={T.accent.emerald} strokeWidth={2.4} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: T.text.secondary, marginBottom: 14 }}>
              Keep one trusted baseline, then test alternatives without losing the profile your audits are built on.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isCompactPhone ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              <button
                type="button"
                onClick={() => {
                  haptic.medium();
                  localStorage.setItem("catalyst_baseline_config", JSON.stringify(financialConfig));
                  window.toast?.success?.("Baseline snapshot saved.");
                }}
                disabled={!proEnabled}
                className="hover-btn"
                style={{
                  ...fieldCardStyle,
                  minHeight: 46,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  color: proEnabled ? T.text.primary : T.text.dim,
                  cursor: proEnabled ? "pointer" : "not-allowed",
                  opacity: proEnabled ? 1 : 0.64,
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                <Save size={14} color={proEnabled ? T.text.secondary : T.text.dim} />
                Save Baseline
              </button>
              <button
                type="button"
                onClick={() => {
                  haptic.light();
                  const saved = localStorage.getItem("catalyst_baseline_config");
                  if (!saved) {
                    window.toast?.error?.("No baseline saved.");
                    return;
                  }
                  try {
                    setFinancialConfig(JSON.parse(saved));
                    window.toast?.success?.("Baseline restored.");
                  } catch {
                    window.toast?.error?.("Saved baseline is corrupted.");
                  }
                }}
                disabled={!proEnabled}
                className="hover-btn"
                style={{
                  ...fieldCardStyle,
                  minHeight: 46,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  color: proEnabled ? T.accent.emerald : T.text.dim,
                  cursor: proEnabled ? "pointer" : "not-allowed",
                  opacity: proEnabled ? 1 : 0.64,
                  fontSize: 12,
                  fontWeight: 800,
                  border: `1px dashed ${proEnabled ? `${T.accent.emerald}50` : T.border.subtle}`,
                  background: proEnabled ? `${T.accent.emerald}08` : T.bg.surface,
                }}
              >
                <RefreshCw size={14} color={proEnabled ? T.accent.emerald : T.text.dim} />
                Restore
              </button>
            </div>
            {!proEnabled ? (
              <div style={{ marginTop: 14 }}>
                <NoticeBanner
                  tone="info"
                  compact
                  title="Pro feature"
                  message="Scenario Sandbox is for modeling big changes without disturbing your live profile."
                  action={
                    <button
                      type="button"
                      onClick={() => setShowPaywall(true)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 999,
                        border: "none",
                        background: T.accent.primary,
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      Unlock Pro
                    </button>
                  }
                />
              </div>
            ) : null}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
