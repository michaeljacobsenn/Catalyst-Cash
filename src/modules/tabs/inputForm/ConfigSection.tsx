import type { Dispatch, ReactNode, SetStateAction } from "react";
import { T } from "../../constants.js";
import { haptic } from "../../haptics.js";
import { Card, Label } from "../../ui.js";

interface InputFormConfigSectionState {
  incomeType?: "salary" | "hourly" | "variable";
  paycheckStandard?: number;
  hourlyRateNet?: number;
  typicalHours?: number;
  averagePaycheck?: number;
}

interface ConfigSectionProps<TConfig extends InputFormConfigSectionState> {
  showConfig: boolean;
  setShowConfig: Dispatch<SetStateAction<boolean>>;
  configSummary: string;
  typedFinancialConfig: TConfig;
  setTypedFinancialConfig: (value: TConfig | ((prev: TConfig) => TConfig)) => void;
  notes: string;
  setNotes: (value: string) => void;
  personalRules: string;
  setPersonalRules: (value: string) => void;
  showAuditNotes?: boolean;
  children?: ReactNode;
}

export function ConfigSection<TConfig extends InputFormConfigSectionState>({
  showConfig,
  setShowConfig,
  configSummary,
  typedFinancialConfig,
  setTypedFinancialConfig,
  notes,
  setNotes,
  personalRules,
  setPersonalRules,
  showAuditNotes = true,
  children,
}: ConfigSectionProps<TConfig>) {
  return (
    <div style={{ margin: 0 }}>
      <button type="button"
        onClick={() => {
          haptic.medium();
          setShowConfig((prev) => !prev);
        }}
        aria-expanded={showConfig}
        style={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: "auto minmax(0, 1fr) auto",
          alignItems: "center",
          gap: 12,
          padding: "13px 14px",
          borderRadius: T.radius.lg,
          border: `1px solid ${showConfig ? T.border.default : T.border.subtle}`,
          background: showConfig ? T.bg.elevated : T.bg.card,
          color: showConfig ? T.text.primary : T.text.secondary,
          transition: "border-color 0.24s ease, background 0.24s ease, color 0.24s ease",
        }}
      >
        <div
          style={{
            minWidth: 54,
            height: 26,
            padding: "0 10px",
            borderRadius: 999,
            background: showConfig ? `${T.accent.primary}14` : T.bg.elevated,
            border: `1px solid ${showConfig ? `${T.accent.primary}24` : T.border.subtle}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background .24s ease, border-color .24s ease",
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 800, color: showConfig ? T.accent.primary : T.text.dim, fontFamily: T.font.mono, letterSpacing: "0.06em" }}>
            PROFILE
          </span>
        </div>
        <div style={{ minWidth: 0, textAlign: "left" }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: "-0.01em", color: T.text.primary }}>
            Profile & AI rules
          </div>
          <div
            style={{
              marginTop: 2,
              fontSize: 11,
              fontWeight: 500,
              color: showConfig ? T.text.secondary : T.text.dim,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {configSummary}
          </div>
        </div>
        <div
          style={{
            transform: `rotate(${showConfig ? 180 : 0}deg)`,
            transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: 999,
            background: showConfig ? `${T.accent.primary}12` : T.bg.elevated,
            border: `1px solid ${showConfig ? `${T.accent.primary}24` : T.border.subtle}`,
            color: showConfig ? T.accent.primary : T.text.muted,
            flexShrink: 0,
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>

      {showConfig && (
        <div style={{ animation: "fadeInUp 0.32s ease-out both", marginTop: 10 }}>
          <Card style={{ marginBottom: 10, background: T.bg.card }}>
            <Label>Income & Cash Flow</Label>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {(["salary", "hourly", "variable"] as const).map((type) => (
                <button type="button"
                  key={type}
                  onClick={() => {
                    haptic.light();
                    setTypedFinancialConfig({ ...typedFinancialConfig, incomeType: type });
                  }}
                  style={{
                    flex: 1,
                    padding: "10px 0",
                    borderRadius: T.radius.sm,
                    border: `1px solid ${typedFinancialConfig?.incomeType === type ? T.accent.primary : T.border.default}`,
                    background: typedFinancialConfig?.incomeType === type ? `${T.accent.primary}15` : T.bg.elevated,
                    color: typedFinancialConfig?.incomeType === type ? T.accent.primary : T.text.secondary,
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: "capitalize",
                    transition: "transform .2s, opacity .2s, background-color .2s, border-color .2s, color .2s, box-shadow .2s",
                  }}
                >
                  {type}
                </button>
              ))}
            </div>

            {typedFinancialConfig?.incomeType === "salary" && (
              <div style={{ position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    left: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: T.text.dim,
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  $
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  pattern="[0-9]*"
                  aria-label="Monthly take-home salary"
                  value={typedFinancialConfig?.paycheckStandard || ""}
                  onChange={(event) =>
                    setTypedFinancialConfig({
                      ...typedFinancialConfig,
                      paycheckStandard: parseFloat(event.target.value) || 0,
                    })
                  }
                  placeholder="Standard Paycheck"
                  className="app-input"
                  style={{
                    width: "100%",
                    padding: "12px 14px 12px 28px",
                    borderRadius: T.radius.md,
                    border: `1.5px solid ${T.border.default}`,
                    background: T.bg.elevated,
                    color: T.text.primary,
                    fontSize: 14,
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                />
              </div>
            )}

            {typedFinancialConfig?.incomeType === "hourly" && (
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <span
                    style={{
                      position: "absolute",
                      left: 14,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: T.text.dim,
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    $
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    pattern="[0-9]*"
                    aria-label="Hourly rate"
                    value={typedFinancialConfig?.hourlyRateNet || ""}
                    onChange={(event) =>
                      setTypedFinancialConfig({
                        ...typedFinancialConfig,
                        hourlyRateNet: parseFloat(event.target.value) || 0,
                      })
                    }
                    placeholder="Hourly Rate"
                    className="app-input"
                    style={{
                      width: "100%",
                      padding: "12px 14px 12px 28px",
                      borderRadius: T.radius.md,
                      border: `1.5px solid ${T.border.default}`,
                      background: T.bg.elevated,
                      color: T.text.primary,
                      fontSize: 14,
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <input
                    type="number"
                    inputMode="decimal"
                    pattern="[0-9]*"
                    aria-label="Hours per week"
                    value={typedFinancialConfig?.typicalHours || ""}
                    onChange={(event) =>
                      setTypedFinancialConfig({
                        ...typedFinancialConfig,
                        typicalHours: parseFloat(event.target.value) || 0,
                      })
                    }
                    placeholder="Hrs/Week"
                    className="app-input"
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: T.radius.md,
                      border: `1.5px solid ${T.border.default}`,
                      background: T.bg.elevated,
                      color: T.text.primary,
                      fontSize: 14,
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />
                </div>
              </div>
            )}

            {typedFinancialConfig?.incomeType === "variable" && (
              <div style={{ position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    left: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: T.text.dim,
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  $
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  pattern="[0-9]*"
                  aria-label="Typical paycheck amount"
                  value={typedFinancialConfig?.averagePaycheck || ""}
                  onChange={(event) =>
                    setTypedFinancialConfig({
                      ...typedFinancialConfig,
                      averagePaycheck: parseFloat(event.target.value) || 0,
                    })
                  }
                  placeholder="Typical Paycheck"
                  className="app-input"
                  style={{
                    width: "100%",
                    padding: "12px 14px 12px 28px",
                    borderRadius: T.radius.md,
                    border: `1.5px solid ${T.border.default}`,
                    background: T.bg.elevated,
                    color: T.text.primary,
                    fontSize: 14,
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                />
              </div>
            )}
          </Card>

          {showAuditNotes && (
            <Card style={{ marginBottom: 10, background: T.bg.card }}>
              <Label>Notes for this week</Label>
              <p style={{ fontSize: 11, color: T.text.muted, marginBottom: 10, lineHeight: 1.4 }}>
                Use this for week-specific facts the audit must respect, like bills already paid or reimbursements on the way.
              </p>
              <textarea
                aria-label="Notes for this week"
                value={notes || ""}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="e.g. Rent already paid, $200 reimbursement coming, skip gas this paycheck."
                style={{
                  width: "100%",
                  minHeight: 84,
                  padding: "12px",
                  borderRadius: T.radius.md,
                  border: `1.5px solid ${T.border.default}`,
                  background: T.bg.elevated,
                  color: T.text.primary,
                  fontSize: 13,
                  fontFamily: T.font.sans,
                  resize: "vertical",
                  boxSizing: "border-box",
                  outline: "none",
                  lineHeight: 1.5,
                }}
                className="app-input"
              />
            </Card>
          )}

          <Card style={{ marginBottom: children ? 10 : 0, background: T.bg.card }}>
            <Label>Custom AI Rules & Persona</Label>
            <p style={{ fontSize: 11, color: T.text.muted, marginBottom: 10, lineHeight: 1.4 }}>
              Use this for durable preferences and tone. Keep week-specific facts in Audit Notes above.
            </p>
            <textarea
              aria-label="Custom AI rules and persona"
              value={personalRules || ""}
              onChange={(event) => setPersonalRules(event.target.value)}
              placeholder="e.g. Always remind me to save 20%. Be aggressive about my debt."
              style={{
                width: "100%",
                height: 80,
                padding: "12px",
                borderRadius: T.radius.md,
                border: `1.5px solid ${T.border.default}`,
                background: T.bg.elevated,
                color: T.text.primary,
                fontSize: 13,
                fontFamily: T.font.sans,
                resize: "none",
                boxSizing: "border-box",
                outline: "none",
              }}
              className="app-input"
            />
          </Card>

          {children}
        </div>
      )}
    </div>
  );
}
