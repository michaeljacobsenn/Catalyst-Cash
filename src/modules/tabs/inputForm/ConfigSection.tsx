import type { Dispatch, SetStateAction } from "react";
import { T } from "../../constants.js";
import { Zap } from "../../icons";
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
  personalRules: string;
  setPersonalRules: (value: string) => void;
}

export function ConfigSection<TConfig extends InputFormConfigSectionState>({
  showConfig,
  setShowConfig,
  configSummary,
  typedFinancialConfig,
  setTypedFinancialConfig,
  personalRules,
  setPersonalRules,
}: ConfigSectionProps<TConfig>) {
  return (
    <div style={{ margin: 0 }}>
      <button
        onClick={() => {
          haptic.medium();
          setShowConfig((prev) => !prev);
        }}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "15px 18px",
          borderRadius: T.radius.lg,
          border: `1px solid ${showConfig ? `${T.accent.primary}42` : T.border.subtle}`,
          background: showConfig ? `${T.accent.primary}0F` : T.bg.card,
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          color: showConfig ? T.text.primary : T.text.secondary,
          cursor: "pointer",
          transition: "all 0.24s ease",
          boxShadow: showConfig ? `0 6px 20px ${T.accent.primary}12, inset 0 1px 0 ${T.accent.primary}12` : T.shadow.soft,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 10,
              background: showConfig ? `linear-gradient(135deg, ${T.accent.primary}, #6C60FF)` : T.bg.card,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: showConfig ? `0 2px 12px ${T.accent.primary}50` : "none",
              transition: "all .3s",
            }}
          >
            <Zap size={14} color={showConfig ? "#fff" : T.text.muted} strokeWidth={2.5} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-0.01em", color: T.text.primary }}>
              Financial Profile & AI Rules
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
        </div>
        <div
          style={{
            transform: `rotate(${showConfig ? 180 : 0}deg)`,
            transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
            display: "flex",
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
                <button
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
                    cursor: "pointer",
                    textTransform: "capitalize",
                    transition: "all .2s",
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

          <Card style={{ marginBottom: 0, background: T.bg.card }}>
            <Label>Custom AI Rules & Persona</Label>
            <p style={{ fontSize: 11, color: T.text.muted, marginBottom: 10, lineHeight: 1.4 }}>
              Define strict rules or change how the AI speaks to you.
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
        </div>
      )}
    </div>
  );
}
