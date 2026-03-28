import type { HousingType, IncomeType, Payday, PayFrequency } from "../../types/index.js";
import { T } from "../constants.js";
import { Label, Card, ListSection, NoticeBanner } from "../ui.js";
import { RefreshCw, Save, Layers } from "../icons";
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
    const val = raw.replace(/[^0-9.]/g, "");
    setFinancialConfig((prev: Record<string, any>) => ({ ...prev, [field]: val ? parseFloat(val) : 0 }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "20px 0 28px" }}>
      <div style={{ margin: "0 16px" }}>
        <Card
          variant="glass"
          style={{
            padding: "18px 18px 16px",
            border: `1px solid ${T.border.subtle}`,
            background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.surface})`,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.02em" }}>
                Keep this profile lean
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 12, lineHeight: 1.55, color: T.text.secondary }}>
                Only the inputs that change audit math belong here. If a value does not affect cash flow, leave it blank.
              </p>
            </div>
            <div
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: `1px solid ${T.accent.primary}30`,
                background: `${T.accent.primary}12`,
                color: T.accent.primary,
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.04em",
                whiteSpace: "nowrap",
              }}
            >
              PROFILE SNAPSHOT
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            {financeSummaryItems.map((item) => (
              <div
                key={item.label}
                style={{
                  padding: "12px 12px 11px",
                  borderRadius: T.radius.lg,
                  border: `1px solid ${T.border.subtle}`,
                  background: T.bg.elevated,
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {item.label}
                </div>
                <div style={{ marginTop: 5, fontSize: 13, fontWeight: 700, color: T.text.primary, lineHeight: 1.35 }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
          <NoticeBanner
            tone="info"
            compact
            style={{ marginTop: 12 }}
            title="Lean Inputs Win"
            message="Keep this page focused on values that materially affect timing, liquidity, and risk. That keeps audits sharper and the UI calmer."
          />
        </Card>
      </div>

      <div>
        <Label style={{ marginLeft: 16, marginBottom: 8, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.03em" }}>Base Currency</Label>
        <ListSection style={{ margin: "0 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
            <span style={{ fontSize: 15, color: T.text.primary, fontWeight: 600 }}>Currency</span>
            <select
              value={financialConfig?.currencyCode || "USD"}
              onChange={e => setFinancialConfig((prev: Record<string, any>) => ({ ...prev, currencyCode: e.target.value }))}
              style={{ background: "transparent", border: "none", color: T.accent.primary, fontSize: 15, fontWeight: 700, cursor: "pointer", outline: "none", textAlign: "right", appearance: "none" }}
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="CAD">CAD ($)</option>
              <option value="AUD">AUD ($)</option>
              <option value="JPY">JPY (¥)</option>
              <option value="INR">INR (₹)</option>
            </select>
          </div>
        </ListSection>
      </div>

      <div>
        <Label style={{ marginLeft: 16, marginBottom: 8, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.03em" }}>Income Profile</Label>
        <ListSection style={{ margin: "0 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${T.border.subtle}` }}>
            <span style={{ fontSize: 15, color: T.text.primary, fontWeight: 600 }}>Pay Frequency</span>
            <select
              value={financialConfig?.payFrequency || "bi-weekly"}
              onChange={e => setFinancialConfig({ type: "SET_FIELD", field: "payFrequency", value: e.target.value as PayFrequency })}
              style={{ background: "transparent", border: "none", color: T.accent.primary, fontSize: 15, fontWeight: 700, cursor: "pointer", outline: "none", textAlign: "right", appearance: "none" }}
            >
              <option value="weekly">Weekly</option>
              <option value="bi-weekly">Bi-Weekly</option>
              <option value="semi-monthly">Semi-Monthly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${T.border.subtle}` }}>
            <span style={{ fontSize: 15, color: T.text.primary, fontWeight: 600 }}>Payday</span>
            <select
              value={financialConfig?.payday || "Friday"}
              onChange={e => setFinancialConfig({ type: "SET_FIELD", field: "payday", value: e.target.value as Payday })}
              style={{ background: "transparent", border: "none", color: T.accent.primary, fontSize: 15, fontWeight: 700, cursor: "pointer", outline: "none", textAlign: "right", appearance: "none" }}
            >
              <option value="Monday">Monday</option>
              <option value="Tuesday">Tuesday</option>
              <option value="Wednesday">Wednesday</option>
              <option value="Thursday">Thursday</option>
              <option value="Friday">Friday</option>
              <option value="Saturday">Saturday</option>
              <option value="Sunday">Sunday</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${T.border.subtle}` }}>
            <span style={{ fontSize: 15, color: T.text.primary, fontWeight: 600 }}>Income Type</span>
            <select
              value={financialConfig?.incomeType || "salary"}
              onChange={e => setFinancialConfig({ type: "SET_FIELD", field: "incomeType", value: e.target.value as IncomeType })}
              style={{ background: "transparent", border: "none", color: T.accent.primary, fontSize: 15, fontWeight: 700, cursor: "pointer", outline: "none", textAlign: "right", appearance: "none" }}
            >
              <option value="salary">Salary</option>
              <option value="hourly">Hourly</option>
              <option value="variable">Variable</option>
            </select>
          </div>

          {(!financialConfig?.incomeType || financialConfig?.incomeType === "salary") && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${T.border.subtle}` }}>
                <span style={{ fontSize: 15, color: T.text.primary, fontWeight: 600 }}>Standard Paycheck</span>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <span style={{ color: T.text.muted, fontSize: 15, marginRight: 4 }}>$</span>
                  <input type="text" inputMode="decimal" value={financialConfig?.paycheckStandard || ""} onChange={e => setNumericField("paycheckStandard", e.target.value)} placeholder="0" style={{ background: "transparent", border: "none", color: T.text.secondary, fontSize: 15, fontWeight: 600, outline: "none", textAlign: "right", width: 90 }} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
                <span style={{ fontSize: 15, color: T.text.primary, fontWeight: 600 }}>1st of Month Paycheck</span>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <span style={{ color: T.text.muted, fontSize: 15, marginRight: 4 }}>$</span>
                  <input type="text" inputMode="decimal" value={financialConfig?.paycheckFirstOfMonth || ""} onChange={e => setNumericField("paycheckFirstOfMonth", e.target.value)} placeholder="Optional" style={{ background: "transparent", border: "none", color: T.text.secondary, fontSize: 15, fontWeight: 600, outline: "none", textAlign: "right", width: 90 }} />
                </div>
              </div>
            </>
          )}

          {financialConfig?.incomeType === "hourly" && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${T.border.subtle}` }}>
                <span style={{ fontSize: 15, color: T.text.primary, fontWeight: 600 }}>Hourly Rate (Net)</span>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <span style={{ color: T.text.muted, fontSize: 15, marginRight: 4 }}>$</span>
                  <input type="text" inputMode="decimal" value={financialConfig?.hourlyRateNet || ""} onChange={e => setNumericField("hourlyRateNet", e.target.value)} placeholder="0.00" style={{ background: "transparent", border: "none", color: T.text.secondary, fontSize: 15, fontWeight: 600, outline: "none", textAlign: "right", width: 90 }} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
                <span style={{ fontSize: 15, color: T.text.primary, fontWeight: 600 }}>Typical Hours</span>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <input type="text" inputMode="decimal" value={financialConfig?.typicalHours || ""} onChange={e => setNumericField("typicalHours", e.target.value)} placeholder="80" style={{ background: "transparent", border: "none", color: T.text.secondary, fontSize: 15, fontWeight: 600, outline: "none", textAlign: "right", width: 60 }} />
                  <span style={{ color: T.text.muted, fontSize: 15, marginLeft: 6 }}>hrs</span>
                </div>
              </div>
            </>
          )}

          {financialConfig?.incomeType === "variable" && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
              <span style={{ fontSize: 15, color: T.text.primary, fontWeight: 600 }}>Average Paycheck</span>
              <div style={{ display: "flex", alignItems: "center" }}>
                <span style={{ color: T.text.muted, fontSize: 15, marginRight: 4 }}>$</span>
                <input type="text" inputMode="decimal" value={financialConfig?.averagePaycheck || ""} onChange={e => setNumericField("averagePaycheck", e.target.value)} placeholder="0" style={{ background: "transparent", border: "none", color: T.text.secondary, fontSize: 15, fontWeight: 600, outline: "none", textAlign: "right", width: 90 }} />
              </div>
            </div>
          )}
        </ListSection>
      </div>

      <div>
        <Label style={{ marginLeft: 16, marginBottom: 8, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.03em" }}>Demographics</Label>
        <ListSection style={{ margin: "0 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${T.border.subtle}` }}>
            <span style={{ fontSize: 15, color: T.text.primary, fontWeight: 600 }}>Birth Year</span>
            <input
              type="number"
              value={financialConfig?.birthYear || ""}
              onChange={e => setFinancialConfig((prev: Record<string, any>) => ({ ...prev, birthYear: e.target.value ? parseInt(e.target.value) : null }))}
              placeholder="e.g. 1990"
              style={{ background: "transparent", border: "none", color: T.text.secondary, fontSize: 15, fontWeight: 600, outline: "none", textAlign: "right", width: 80 }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
            <span style={{ fontSize: 15, color: T.text.primary, fontWeight: 600 }}>State</span>
            <select
              value={financialConfig?.stateCode || ""}
              onChange={e => setFinancialConfig((prev: Record<string, any>) => ({ ...prev, stateCode: e.target.value }))}
              style={{ background: "transparent", border: "none", color: T.accent.primary, fontSize: 15, fontWeight: 700, cursor: "pointer", outline: "none", textAlign: "right", appearance: "none" }}
            >
              <option value="">— Not in US —</option>
              <option value="AL">AL</option><option value="AK">AK 🟢</option><option value="AZ">AZ</option><option value="AR">AR</option>
              <option value="CA">CA</option><option value="CO">CO</option><option value="CT">CT</option><option value="DE">DE</option>
              <option value="DC">DC</option><option value="FL">FL 🟢</option><option value="GA">GA</option><option value="HI">HI</option>
              <option value="ID">ID</option><option value="IL">IL</option><option value="IN">IN</option><option value="IA">IA</option>
              <option value="KS">KS</option><option value="KY">KY</option><option value="LA">LA</option><option value="ME">ME</option>
              <option value="MD">MD</option><option value="MA">MA</option><option value="MI">MI</option><option value="MN">MN</option>
              <option value="MS">MS</option><option value="MO">MO</option><option value="MT">MT</option><option value="NE">NE</option>
              <option value="NV">NV 🟢</option><option value="NH">NH 🟢</option><option value="NJ">NJ</option><option value="NM">NM</option>
              <option value="NY">NY</option><option value="NC">NC</option><option value="ND">ND</option><option value="OH">OH</option>
              <option value="OK">OK</option><option value="OR">OR</option><option value="PA">PA</option><option value="RI">RI</option>
              <option value="SC">SC</option><option value="SD">SD 🟢</option><option value="TN">TN 🟢</option><option value="TX">TX 🟢</option>
              <option value="UT">UT</option><option value="VT">VT</option><option value="VA">VA</option><option value="WA">WA 🟢</option>
              <option value="WV">WV</option><option value="WI">WI</option><option value="WY">WY 🟢</option>
            </select>
          </div>
        </ListSection>
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <Label style={{ margin: 0 }}>"What-If" Scenarios</Label>
          {!proEnabled && <div style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", background: `${T.accent.primary}14`, color: T.accent.primary, border: `1px solid ${T.accent.primary}30`, borderRadius: 999 }}>PRO</div>}
        </div>
        <Card
          variant="glass"
          style={{
            padding: "16px",
            border: `1px solid ${T.border.subtle}`,
            background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.surface})`,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${T.accent.emerald}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Layers size={18} color={T.accent.emerald} strokeWidth={2.5} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.text.primary, marginBottom: 2 }}>Scenario Sandbox</div>
              <div style={{ fontSize: 11, color: T.text.secondary, marginBottom: 12, lineHeight: 1.5 }}>
                Test a new salary, relocation, or massive expense without losing your baseline configuration.
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => {
                    haptic.medium();
                    localStorage.setItem("catalyst_baseline_config", JSON.stringify(financialConfig));
                    window.toast?.success?.("Baseline snapshot saved.");
                  }}
                  disabled={!proEnabled}
                  style={{ flex: 1, padding: "10px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`, background: T.bg.surface, color: proEnabled ? T.text.primary : T.text.dim, fontSize: 11, fontWeight: 700, cursor: proEnabled ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: proEnabled ? 1 : 0.6 }}
                  className="hover-btn"
                >
                  <Save size={14} color={T.text.secondary} />
                  Save Baseline
                </button>
                <button
                  onClick={() => {
                    haptic.light();
                    const saved = localStorage.getItem("catalyst_baseline_config");
                    if (saved) {
                      try {
                        setFinancialConfig(JSON.parse(saved));
                        window.toast?.success?.("Baseline restored.");
                      } catch {
                        window.toast?.error?.("Saved baseline is corrupted.");
                      }
                    } else {
                      window.toast?.error?.("No baseline saved.");
                    }
                  }}
                  disabled={!proEnabled}
                  style={{ flex: 1, padding: "10px", borderRadius: T.radius.md, border: `1px dashed ${T.accent.emerald}50`, background: "transparent", color: proEnabled ? T.accent.emerald : T.text.dim, fontSize: 11, fontWeight: 700, cursor: proEnabled ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: proEnabled ? 1 : 0.6 }}
                  className="hover-btn"
                >
                  <RefreshCw size={14} />
                  Restore
                </button>
              </div>
              {!proEnabled && (
                <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ fontSize: 11, color: T.text.muted, lineHeight: 1.45 }}>
                    Keep one clean baseline, then pressure-test changes without touching your live profile.
                  </span>
                  <button
                    onClick={() => setShowPaywall(true)}
                    style={{ padding: "8px 14px", borderRadius: 999, background: T.accent.primary, color: "#fff", border: "none", fontSize: 11, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    Unlock Pro
                  </button>
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div>
        <Label style={{ marginLeft: 16, marginBottom: 8, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.03em" }}>Housing Situation</Label>
        <ListSection style={{ margin: "0 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${T.border.subtle}` }}>
            <span style={{ fontSize: 15, color: T.text.primary, fontWeight: 600 }}>Type</span>
            <select
              value={financialConfig?.housingType || ""}
              onChange={e => setFinancialConfig({ type: "SET_FIELD", field: "housingType", value: e.target.value as HousingType })}
              style={{ background: "transparent", border: "none", color: T.accent.primary, fontSize: 15, fontWeight: 700, cursor: "pointer", outline: "none", textAlign: "right", appearance: "none" }}
            >
              <option value="">Unspecified</option>
              <option value="rent">Renting</option>
              <option value="own">Homeowner</option>
              <option value="other">Other</option>
            </select>
          </div>

          {financialConfig?.housingType === "rent" && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
              <span style={{ fontSize: 15, color: T.text.primary, fontWeight: 600 }}>Monthly Rent</span>
              <div style={{ display: "flex", alignItems: "center" }}>
                <span style={{ color: T.text.muted, fontSize: 15, marginRight: 4 }}>$</span>
                <input type="text" inputMode="decimal" value={financialConfig?.monthlyRent || ""} onChange={e => setNumericField("monthlyRent", e.target.value)} placeholder="0" style={{ background: "transparent", border: "none", color: T.text.secondary, fontSize: 15, fontWeight: 600, outline: "none", textAlign: "right", width: 90 }} />
              </div>
            </div>
          )}

          {financialConfig?.housingType === "own" && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
              <span style={{ fontSize: 15, color: T.text.primary, fontWeight: 600 }}>Mortgage (PITI)</span>
              <div style={{ display: "flex", alignItems: "center" }}>
                <span style={{ color: T.text.muted, fontSize: 15, marginRight: 4 }}>$</span>
                <input type="text" inputMode="decimal" value={financialConfig?.mortgagePayment || ""} onChange={e => setNumericField("mortgagePayment", e.target.value)} placeholder="0" style={{ background: "transparent", border: "none", color: T.text.secondary, fontSize: 15, fontWeight: 600, outline: "none", textAlign: "right", width: 90 }} />
              </div>
            </div>
          )}
        </ListSection>
      </div>
    </div>
  );
}
