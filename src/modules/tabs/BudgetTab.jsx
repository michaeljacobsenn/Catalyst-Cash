import { useState } from "react";
import {
  Plus,
  Pencil,
  Check,
  Trash2,
  DollarSign,
  Briefcase,
  Target,
  Activity,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { T } from "../constants.js";
import { fmt } from "../utils.js";
import { Card, Label, ProgressBar } from "../ui.jsx";
import { haptic } from "../haptics.js";
import { STANDARD_CATEGORIES } from "../merchantMap.js";

export default function BudgetTab({
  budgetCategories = [],
  budgetActuals = {},
  weeklySpendAllowance = 0,
  financialConfig,
  setFinancialConfig,
  incomeSources = [],
}) {
  const [editingBudget, setEditingBudget] = useState(false);
  const [editingIncome, setEditingIncome] = useState(false);

  // Calculate totals (CFO Standardized Annualized Math)
  const totalMonthlyBudget = budgetCategories.reduce((sum, cat) => sum + (cat.monthlyTarget || 0), 0);
  const now = new Date();
  const weeksInMonth = 52.14 / 12; // Standard 4.345 weeks/mo for consistent burn rate
  const totalWeeklyBudget = totalMonthlyBudget / weeksInMonth + (weeklySpendAllowance || 0);
  const totalWeeklyActuals = Object.values(budgetActuals).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
  const isOverBudget = totalWeeklyActuals > totalWeeklyBudget;
  const progressPct = totalWeeklyBudget > 0 ? Math.min((totalWeeklyActuals / totalWeeklyBudget) * 100, 100) : 0;
  const ringColor = isOverBudget ? T.status.red : progressPct > 85 ? T.status.amber : T.status.green;

  // Pacing logic: Monday = 1, Sunday = 7
  const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
  const expectedPacePct = (dayOfWeek / 7) * 100;
  const isRunningHot = !isOverBudget && progressPct > expectedPacePct + 5;
  const isUnderPace = !isOverBudget && progressPct < expectedPacePct - 5;

  // Income totals
  const totalMonthlyIncome = incomeSources.reduce((sum, s) => {
    const amt = s.amount || 0;
    if (s.frequency === "weekly") return sum + amt * weeksInMonth;
    if (s.frequency === "bi-weekly") return sum + amt * 2.17;
    return sum + amt;
  }, 0);

  // Budget management helpers
  const addCategory = () => {
    haptic.light();
    setEditingBudget(true);
    setFinancialConfig({ ...financialConfig, budgetCategories: [...budgetCategories, { name: "", monthlyTarget: 0 }] });
  };
  const updateCategory = (i, k, v) => {
    const arr = [...budgetCategories];
    arr[i] = { ...arr[i], [k]: v };
    setFinancialConfig({ ...financialConfig, budgetCategories: arr });
  };
  const removeCategory = i => {
    haptic.medium();
    setFinancialConfig({ ...financialConfig, budgetCategories: budgetCategories.filter((_, j) => j !== i) });
  };

  // Income management helpers
  const addIncome = () => {
    haptic.light();
    setEditingIncome(true);
    setFinancialConfig({
      ...financialConfig,
      incomeSources: [...incomeSources, { name: "", amount: 0, frequency: "monthly", type: "other" }],
    });
  };
  const updateIncome = (i, k, v) => {
    const arr = [...incomeSources];
    arr[i] = { ...arr[i], [k]: v };
    setFinancialConfig({ ...financialConfig, incomeSources: arr });
  };
  const removeIncome = i => {
    haptic.medium();
    setFinancialConfig({ ...financialConfig, incomeSources: incomeSources.filter((_, j) => j !== i) });
  };

  const inputStyle = {
    padding: "8px 10px",
    borderRadius: T.radius.md,
    border: `1px solid ${T.border.default}`,
    background: T.bg.elevated,
    color: T.text.primary,
    fontSize: 11,
    boxSizing: "border-box",
  };
  const dollarInputStyle = { ...inputStyle, paddingLeft: 20, width: "100%" };
  const rmBtnStyle = {
    width: 30,
    height: 30,
    borderRadius: T.radius.sm,
    border: "none",
    background: T.status.redDim,
    color: T.status.red,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };

  return (
    <div style={{ paddingBottom: 24 }}>
      {/* ═══ Header ═══ */}
      <div style={{ paddingTop: 20, paddingBottom: 8 }}>
      </div>

      {/* ═══ Hero Ring Chart (CFO Enhanced) ═══ */}
      <Card
        animate
        variant="glass"
        style={{ textAlign: "center", position: "relative", padding: "40px 20px 32px", overflow: "hidden" }}
      >
        <div
          style={{
            position: "absolute",
            top: -40,
            left: "50%",
            transform: "translateX(-50%)",
            width: 240,
            height: 240,
            background: ringColor,
            filter: "blur(90px)",
            opacity: 0.15,
            borderRadius: "50%",
            pointerEvents: "none",
            transition: "background 1s ease",
          }}
        />

        <div style={{ position: "relative", width: 200, height: 200, margin: "0 auto 24px" }}>
          {/* SVG Filters for Glow */}
          <svg
            width="200"
            height="200"
            viewBox="0 0 200 200"
            style={{ transform: "rotate(-90deg)", position: "absolute", inset: 0 }}
          >
            <defs>
              <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>
            <circle cx="100" cy="100" r="86" fill="none" stroke={`${T.bg.surface}80`} strokeWidth="16" />
            <circle
              cx="100"
              cy="100"
              r="86"
              fill="none"
              stroke={ringColor}
              strokeWidth="16"
              strokeDasharray={`${progressPct * 5.4} 540`}
              strokeLinecap="round"
              filter="url(#neonGlow)"
              style={{ transition: "stroke-dasharray 1s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.5s ease" }}
            />
          </svg>

          {/* Inner Content */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              marginTop: -2,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: T.text.secondary,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: 6,
              }}
            >
              Weekly Spend
            </div>
            <div
              style={{
                fontSize: 38,
                fontWeight: 800,
                color: T.text.primary,
                fontFamily: T.font.mono,
                letterSpacing: "-1.5px",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmt(totalWeeklyActuals)}
            </div>
            <div
              style={{
                fontSize: 12,
                color: T.text.secondary,
                marginTop: 6,
                fontWeight: 600,
                background: `${T.bg.surface}80`,
                padding: "4px 10px",
                borderRadius: 99,
                border: `1px solid ${T.border.subtle}`,
              }}
            >
              Limit: {fmt(totalWeeklyBudget)}
            </div>
          </div>
        </div>

        {/* Status Pills */}
        {isOverBudget ? (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: T.status.redDim,
              color: T.status.red,
              border: `1px solid ${T.status.red}40`,
              padding: "8px 16px",
              borderRadius: 99,
              fontSize: 13,
              fontWeight: 700,
              boxShadow: `0 4px 12px ${T.status.red}20`,
            }}
          >
            <AlertTriangle size={16} strokeWidth={2.5} /> Over Budget by {fmt(totalWeeklyActuals - totalWeeklyBudget)}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: T.status.greenDim,
                color: T.status.green,
                border: `1px solid ${T.status.green}40`,
                padding: "8px 16px",
                borderRadius: 99,
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                boxShadow: `0 4px 12px ${T.status.green}20`,
              }}
            >
              <CheckCircle2 size={16} strokeWidth={2.5} /> {fmt(totalWeeklyBudget - totalWeeklyActuals)} Remaining
            </div>
            {/* Pacing Indicator */}
            {isRunningHot && (
              <div
                style={{
                  fontSize: 11,
                  color: T.status.amber,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <TrendingUp size={12} /> Running hotter than daily pace
              </div>
            )}
            {isUnderPace && (
              <div
                style={{
                  fontSize: 11,
                  color: T.status.blue,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <TrendingDown size={12} /> Spending slower than daily pace
              </div>
            )}
            {!isRunningHot && !isUnderPace && totalWeeklyBudget > 0 && (
              <div
                style={{
                  fontSize: 11,
                  color: T.text.dim,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Activity size={12} /> Spending is perfectly on pace
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ═══ 50/30/20 Diagnostic (Free Zero-Cost Value Add) ═══ */}
      {totalMonthlyIncome > 0 && (
        <Card
          animate
          delay={200}
          variant="elevated"
          style={{ marginTop: 16, padding: "16px", border: `1px solid ${T.border.subtle}` }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: T.text.primary, display: "flex", alignItems: "center", gap: 6 }}>
                <Target size={14} color={T.accent.purple} />
                50/30/20 Diagnostic
              </div>
              <div style={{ fontSize: 11, color: T.text.dim, marginTop: 4 }}>How your budget aligns with the gold standard</div>
            </div>
          </div>

          <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", marginBottom: 16, border: `1px solid ${T.border.default}` }}>
            {(() => {
              const needsAmt = totalMonthlyBudget; // Fixed bills
              const wantsAmt = weeklySpendAllowance * weeksInMonth; // Flexible discretionary
              const definedAmt = needsAmt + wantsAmt;
              const savingsAmt = Math.max(0, totalMonthlyIncome - definedAmt); // Remainder

              const needsPct = Math.min(100, Math.round((needsAmt / totalMonthlyIncome) * 100)) || 0;
              const wantsPct = Math.min(100 - needsPct, Math.round((wantsAmt / totalMonthlyIncome) * 100)) || 0;
              const savingsPct = Math.max(0, 100 - needsPct - wantsPct);

              return (
                <>
                  <div style={{ width: `${needsPct}%`, background: T.status.blue, transition: "width 0.5s ease" }} />
                  <div style={{ width: `${wantsPct}%`, background: T.accent.purple, transition: "width 0.5s ease" }} />
                  <div style={{ width: `${savingsPct}%`, background: T.status.green, transition: "width 0.5s ease" }} />
                </>
              );
            })()}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, textAlign: "center" }}>
            {(() => {
              const needsAmt = totalMonthlyBudget;
              const wantsAmt = weeklySpendAllowance * weeksInMonth;
              const definedAmt = needsAmt + wantsAmt;
              const savingsAmt = Math.max(0, totalMonthlyIncome - definedAmt);

              const needsPct = Math.min(100, Math.round((needsAmt / totalMonthlyIncome) * 100)) || 0;
              const wantsPct = Math.min(100 - needsPct, Math.round((wantsAmt / totalMonthlyIncome) * 100)) || 0;
              const savingsPct = Math.max(0, 100 - needsPct - wantsPct);

              // Ideal drift calculation to find the biggest leak/strength
              const needsDrift = needsPct - 50;
              const wantsDrift = wantsPct - 30;
              const saveDrift = savingsPct - 20;

              return (
                <>
                  <div style={{ background: T.bg.surface, padding: "8px 4px", borderRadius: T.radius.sm }}>
                    <div style={{ fontSize: 10, color: T.text.dim, fontWeight: 700, marginBottom: 2 }}>NEEDS</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: needsPct > 55 ? T.status.red : T.status.blue }}>
                      {needsPct}%
                    </div>
                    <div style={{ fontSize: 9, color: T.text.muted, marginTop: 2 }}>{fmt(needsAmt)} /mo</div>
                  </div>
                  <div style={{ background: T.bg.surface, padding: "8px 4px", borderRadius: T.radius.sm }}>
                    <div style={{ fontSize: 10, color: T.text.dim, fontWeight: 700, marginBottom: 2 }}>WANTS</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: wantsPct > 35 ? T.status.amber : T.accent.purple }}>
                      {wantsPct}%
                    </div>
                    <div style={{ fontSize: 9, color: T.text.muted, marginTop: 2 }}>{fmt(wantsAmt)} /mo</div>
                  </div>
                  <div style={{ background: T.bg.surface, padding: "8px 4px", borderRadius: T.radius.sm }}>
                    <div style={{ fontSize: 10, color: T.text.dim, fontWeight: 700, marginBottom: 2 }}>SAVINGS</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: savingsPct < 15 ? T.status.red : T.status.green }}>
                      {savingsPct}%
                    </div>
                    <div style={{ fontSize: 9, color: T.text.muted, marginTop: 2 }}>{fmt(savingsAmt)} /mo</div>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Actionable Feedback Engine */}
          {(() => {
            const needsPct = Math.min(100, Math.round((totalMonthlyBudget / totalMonthlyIncome) * 100)) || 0;
            const wantsPct = Math.min(100 - needsPct, Math.round(((weeklySpendAllowance * weeksInMonth) / totalMonthlyIncome) * 100)) || 0;
            const savingsPct = Math.max(0, 100 - needsPct - wantsPct);

            if (savingsPct >= 20) {
              return (
                <div style={{ marginTop: 12, padding: "10px", background: `${T.status.green}10`, borderRadius: T.radius.md, border: `1px dashed ${T.status.green}30`, fontSize: 11, color: T.status.green, textAlign: "center", lineHeight: 1.4 }}>
                  <strong style={{ fontWeight: 800 }}>Perfect Split.</strong> You are hitting the 20% savings target. Keep this foundation stable to hit FIRE safely.
                </div>
              );
            }
            if (needsPct > 60) {
              return (
                <div style={{ marginTop: 12, padding: "10px", background: `${T.status.red}10`, borderRadius: T.radius.md, border: `1px dashed ${T.status.red}30`, fontSize: 11, color: T.status.red, textAlign: "center", lineHeight: 1.4 }}>
                  <strong style={{ fontWeight: 800 }}>High Fixed Costs.</strong> Your fixed bills are consuming {needsPct}% of your income. Look for subscriptions or rent to lower to reach the 50% target.
                </div>
              );
            }
            if (wantsPct > 35) {
              return (
                <div style={{ marginTop: 12, padding: "10px", background: `${T.status.amber}10`, borderRadius: T.radius.md, border: `1px dashed ${T.status.amber}30`, fontSize: 11, color: T.status.amber, textAlign: "center", lineHeight: 1.4 }}>
                  <strong style={{ fontWeight: 800 }}>High Discretionary Spend.</strong> Weekly allowances are taking up {wantsPct}%. Try shrinking your weekly allowance slightly to boost your savings rate toward 20%.
                </div>
              );
            }
            return (
              <div style={{ marginTop: 12, padding: "10px", background: T.bg.surface, borderRadius: T.radius.md, border: `1px dashed ${T.border.default}`, fontSize: 11, color: T.text.secondary, textAlign: "center", lineHeight: 1.4 }}>
                Aim to shift the slider towards <strong>50% fixed</strong> (bills), <strong>30% flex</strong> (allowance), and <strong>20% savings</strong>.
              </div>
            );
          })()}
        </Card>
      )}

      {/* ═══ Category Breakdown ═══ */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 14,
          marginBottom: 8,
        }}
      >
        <Label style={{ margin: 0 }}>Budget Categories</Label>
        {budgetCategories.length > 0 && (
          <button
            onClick={() => setEditingBudget(!editingBudget)}
            style={{
              padding: "4px 10px",
              borderRadius: T.radius.sm,
              border: `1px solid ${editingBudget ? T.accent.primary : T.border.default}`,
              background: editingBudget ? T.accent.primaryDim : "transparent",
              color: editingBudget ? T.accent.primary : T.text.dim,
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {editingBudget ? (
              <>
                <Check size={10} /> Done
              </>
            ) : (
              <>
                <Pencil size={10} /> Edit
              </>
            )}
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {budgetCategories.length === 0 && !editingBudget ? (
          <div
            className="shimmer-bg"
            style={{
              textAlign: "center",
              padding: "40px 20px",
              borderRadius: T.radius.lg,
              border: `1px dashed ${T.border.subtle}`,
              background: T.bg.elevated,
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: T.accent.gradient,
                margin: "0 auto 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: `0 8px 24px ${T.accent.emerald}40`,
              }}
            >
              <Target size={24} color="#FFF" strokeWidth={2} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.text.primary, marginBottom: 6 }}>
              Initialize Lean Budget
            </div>
            <div
              style={{
                fontSize: 13,
                color: T.text.secondary,
                lineHeight: 1.5,
                marginBottom: 20,
                maxWidth: 280,
                margin: "0 auto 20px",
              }}
            >
              Set exact monthly spending targets. The V2 agent will auto-convert them into strict weekly limits for
              precision tracking, regardless of the month's length.
            </div>
            <button
              onClick={addCategory}
              className="hover-btn"
              style={{
                padding: "12px 24px",
                borderRadius: T.radius.md,
                border: "none",
                background: T.accent.primary,
                color: "#fff",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: `inset 0 1px 1px rgba(255,255,255,0.15), 0 4px 16px ${T.accent.primary}30`,
                letterSpacing: "0.02em",
              }}
            >
              <Plus size={14} style={{ marginRight: 6, verticalAlign: -2 }} /> Build First Target
            </button>
          </div>
        ) : editingBudget ? (
          <Card animate variant="elevated" style={{ padding: 16 }}>
            {budgetCategories.map((cat, i) => {
              const isCustom = cat.name && !STANDARD_CATEGORIES.includes(cat.name);
              const usedNames = new Set(budgetCategories.map(c => c.name).filter(Boolean));
              const availableStandard = STANDARD_CATEGORIES.filter(n => n === cat.name || !usedNames.has(n));
              return (
                <div key={i} style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
                  {isCustom ? (
                    <input
                      value={cat.name || ""}
                      onChange={e => updateCategory(i, "name", e.target.value)}
                      placeholder="Custom category"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                  ) : (
                    <select
                      value={cat.name || ""}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === "__custom__") {
                          updateCategory(i, "name", "");
                          // Force re-render as custom input
                          setTimeout(() => {
                            const arr = [...budgetCategories];
                            arr[i] = { ...arr[i], name: "", _custom: true };
                            setFinancialConfig({ ...financialConfig, budgetCategories: arr });
                          }, 0);
                        } else {
                          updateCategory(i, "name", val);
                        }
                        haptic.light();
                      }}
                      style={{
                        ...inputStyle,
                        flex: 1,
                        WebkitAppearance: "none",
                        appearance: "none",
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23484F58' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 8px center",
                        color: !cat.name ? T.text.muted : T.text.primary,
                      }}
                    >
                      <option value="">Pick category…</option>
                      {availableStandard.map(n => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                      <option value="__custom__">Custom…</option>
                    </select>
                  )}
                  <div style={{ position: "relative", flex: 0.5 }}>
                    <span
                      style={{
                        position: "absolute",
                        left: 8,
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: T.text.dim,
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      $
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={cat.monthlyTarget || ""}
                      onChange={e => updateCategory(i, "monthlyTarget", parseFloat(e.target.value) || 0)}
                      placeholder="/mo"
                      style={dollarInputStyle}
                    />
                  </div>
                  <button onClick={() => removeCategory(i)} style={rmBtnStyle}>
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
            <button
              onClick={addCategory}
              style={{
                padding: "8px 14px",
                borderRadius: T.radius.md,
                border: `1px dashed ${T.border.default}`,
                background: "transparent",
                color: T.accent.primary,
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: T.font.mono,
                width: "100%",
              }}
            >
              + ADD CATEGORY
            </button>
          </Card>
        ) : (
          budgetCategories.map((cat, i) => {
            const weeklyCatTarget = (cat.monthlyTarget || 0) / weeksInMonth;
            const spent = parseFloat(budgetActuals[cat.name]) || 0;
            const pct = weeklyCatTarget > 0 ? Math.min((spent / weeklyCatTarget) * 100, 100) : 0;
            const isCatOver = spent > weeklyCatTarget;

            return (
              <Card
                key={cat.name}
                animate
                delay={Math.min(i * 50, 300)}
                variant="glass"
                className="hover-card"
                style={{ padding: "16px", position: "relative", overflow: "hidden" }}
              >
                <div
                  style={{
                    position: "absolute",
                    right: -30,
                    top: -30,
                    width: 80,
                    height: 80,
                    background: isCatOver ? T.status.red : pct > 80 ? T.status.amber : T.accent.primary,
                    filter: "blur(40px)",
                    opacity: 0.1,
                    borderRadius: "50%",
                    pointerEvents: "none",
                  }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.text.primary }}>{cat.name}</div>
                    <div style={{ fontSize: 12, color: T.text.dim, marginTop: 4 }}>{fmt(weeklyCatTarget)} / week</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        fontFamily: T.font.mono,
                        color: isCatOver ? T.status.red : T.text.primary,
                      }}
                    >
                      {fmt(spent)}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: isCatOver ? T.status.red : T.text.secondary,
                        marginTop: 4,
                        fontWeight: 600,
                      }}
                    >
                      {isCatOver ? "Over Limit" : `${fmt(weeklyCatTarget - spent)} left`}
                    </div>
                  </div>
                </div>
                <ProgressBar
                  progress={pct}
                  color={isCatOver ? T.status.red : pct > 80 ? T.status.amber : T.accent.primary}
                />
              </Card>
            );
          })
        )}
      </div>

      {/* ═══ Weekly Allowance ═══ */}
      <Label style={{ marginTop: 14 }}>General Allowance Target</Label>
      <Card
        animate
        variant="glass"
        className="hover-card"
        style={{
          padding: "16px",
          position: "relative",
          overflow: "hidden",
          borderLeft: `3px solid ${T.accent.emerald}`,
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -20,
            bottom: -20,
            width: 100,
            height: 100,
            background: T.accent.emerald,
            filter: "blur(50px)",
            opacity: 0.12,
            borderRadius: "50%",
            pointerEvents: "none",
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text.primary }}>Weekly Spend Allowance</div>
            <div style={{ fontSize: 12, color: T.text.dim, marginTop: 4 }}>For non-fixed / un-categorized expenses</div>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: T.font.mono, color: T.accent.emerald }}>
            {fmt(weeklySpendAllowance)}
          </div>
        </div>
      </Card>

      {/* ═══ SMART ROLLOVER / ZERO-BASED SWEEPER (Pro Tier Power Feature 2) ═══ */}
      {(() => {
        // Temporarily commented out date restriction for testing
        // if (now.getDay() > 0 && now.getDay() < 5) return null;

        const allowanceSpent = parseFloat(budgetActuals.allowance) || 0;
        const remaining = weeklySpendAllowance - allowanceSpent;

        if (remaining <= 0) return null; // Nothing to sweep

        const isPro = true; // TODO: Replace with actual proEnabled prop or context when deeply integrated. Assuming true for demo.

        return (
          <Card
            animate
            delay={300}
            variant="elevated"
            style={{
              marginTop: 16,
              padding: "16px",
              border: `1px solid ${T.accent.primary}40`,
              background: `linear-gradient(135deg, ${T.bg.card}, ${T.accent.primary}0A)`,
              position: "relative",
              overflow: "hidden"
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${T.accent.primary}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Briefcase size={18} color={T.accent.primary} strokeWidth={2.5} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: T.text.primary, marginBottom: 2 }}>End-of-Week Sweep Available</div>
                <div style={{ fontSize: 11, color: T.text.secondary, marginBottom: 12 }}>
                  You have <strong style={{ color: T.status.green }}>{fmt(remaining)}</strong> left in your allowance. Don't leave it in checking where it will be spent.
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <button
                    onClick={() => {
                      haptic.medium();
                      if (window.toast) window.toast.success(`Swept ${fmt(remaining)} mentally to Vault!`);
                    }}
                    style={{
                      padding: "10px",
                      borderRadius: T.radius.md,
                      border: `1px solid ${T.status.green}40`,
                      background: `${T.status.green}10`,
                      color: T.status.green,
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      transition: "all 0.2s"
                    }}
                    className="hover-btn"
                  >
                    <Briefcase size={14} />
                    Sweep to Vault
                  </button>
                  <button
                    onClick={() => {
                      haptic.light();
                      if (window.toast) window.toast.success(`Rolled over ${fmt(remaining)} to next week.`);
                    }}
                    style={{
                      padding: "10px",
                      borderRadius: T.radius.md,
                      border: `1px solid ${T.accent.primary}40`,
                      background: `${T.accent.primary}10`,
                      color: T.accent.primary,
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      transition: "all 0.2s"
                    }}
                    className="hover-btn"
                  >
                    <TrendingUp size={14} />
                    Rollover
                  </button>
                </div>
                <div style={{ marginTop: 10, fontSize: 10, color: T.text.dim, textAlign: "center", fontStyle: "italic" }}>
                  Pro Tip: Zero-based budgeting means every dollar has a job. Give these leftovers a purpose.
                </div>
              </div>
            </div>
          </Card>
        );
      })()}

      {/* ═══ Income Sources ═══ */}
      {financialConfig && setFinancialConfig && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 20,
              marginBottom: 8,
            }}
          >
            <Label style={{ margin: 0 }}>Income Sources</Label>
            {incomeSources.length > 0 && (
              <button
                onClick={() => setEditingIncome(!editingIncome)}
                style={{
                  padding: "4px 10px",
                  borderRadius: T.radius.sm,
                  border: `1px solid ${editingIncome ? T.accent.primary : T.border.default}`,
                  background: editingIncome ? T.accent.primaryDim : "transparent",
                  color: editingIncome ? T.accent.primary : T.text.dim,
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {editingIncome ? (
                  <>
                    <Check size={10} /> Done
                  </>
                ) : (
                  <>
                    <Pencil size={10} /> Edit
                  </>
                )}
              </button>
            )}
          </div>

          {incomeSources.length === 0 && !editingIncome ? (
            <div
              className="shimmer-bg"
              style={{
                textAlign: "center",
                padding: "24px 20px",
                borderRadius: T.radius.lg,
                border: `1px dashed ${T.border.subtle}`,
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
              }}
            >
              <Briefcase size={24} color={T.text.dim} style={{ marginBottom: 8 }} />
              <div style={{ fontSize: 13, color: T.text.secondary, lineHeight: 1.5, marginBottom: 12 }}>
                Track freelance, side-gig, or other income beyond your primary paycheck.
              </div>
              <button
                onClick={addIncome}
                style={{
                  padding: "8px 20px",
                  borderRadius: T.radius.md,
                  border: "none",
                  background: T.accent.primary,
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: `inset 0 1px 1px rgba(255,255,255,0.15), 0 4px 12px ${T.accent.primary}30`,
                }}
              >
                <Plus size={12} style={{ marginRight: 4, verticalAlign: -2 }} /> Add Income Source
              </button>
            </div>
          ) : editingIncome ? (
            <Card animate variant="elevated" style={{ padding: 16 }}>
              {incomeSources.map((src, i) => (
                <div key={i} style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
                  <input
                    value={src.name || ""}
                    onChange={e => updateIncome(i, "name", e.target.value)}
                    placeholder="Source name"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <div style={{ position: "relative", flex: 0.6 }}>
                    <span
                      style={{
                        position: "absolute",
                        left: 8,
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: T.text.dim,
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      $
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={src.amount || ""}
                      onChange={e => updateIncome(i, "amount", parseFloat(e.target.value) || 0)}
                      placeholder="Amount"
                      style={dollarInputStyle}
                    />
                  </div>
                  <select
                    value={src.frequency || "monthly"}
                    onChange={e => updateIncome(i, "frequency", e.target.value)}
                    style={{ ...inputStyle, flex: 0.5, fontSize: 10 }}
                  >
                    {["weekly", "bi-weekly", "monthly", "irregular"].map(f => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => removeIncome(i)} style={rmBtnStyle}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              <button
                onClick={addIncome}
                style={{
                  padding: "8px 14px",
                  borderRadius: T.radius.md,
                  border: `1px dashed ${T.border.default}`,
                  background: "transparent",
                  color: T.accent.primary,
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: T.font.mono,
                  width: "100%",
                }}
              >
                + ADD SOURCE
              </button>
            </Card>
          ) : (
            <Card animate variant="glass" style={{ padding: 0, overflow: "hidden" }}>
              {incomeSources.map((src, i) => (
                <div
                  key={i}
                  style={{
                    padding: "12px 16px",
                    borderBottom: i < incomeSources.length - 1 ? `1px solid ${T.border.subtle}` : "none",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    animation: `fadeInUp .3s ease-out ${i * 0.05}s both`,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text.primary }}>{src.name || "Unnamed"}</div>
                    <div
                      style={{
                        fontSize: 10,
                        color: T.text.dim,
                        fontFamily: T.font.mono,
                        textTransform: "uppercase",
                        marginTop: 2,
                      }}
                    >
                      {src.frequency || "monthly"}
                    </div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.status.green, fontFamily: T.font.mono }}>
                    +{fmt(src.amount || 0)}
                  </div>
                </div>
              ))}
              {totalMonthlyIncome > 0 && (
                <div
                  style={{
                    padding: "10px 16px",
                    background: T.bg.elevated,
                    borderTop: `1px solid ${T.border.subtle}`,
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.text.dim }}>TOTAL (Monthly)</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: T.status.green, fontFamily: T.font.mono }}>
                    {fmt(totalMonthlyIncome)}
                  </span>
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
