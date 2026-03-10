// ═══════════════════════════════════════════════════════════════
// DEBT PAYOFF SIMULATOR — Interactive "what-if" debt destroyer
// ═══════════════════════════════════════════════════════════════
import { useState, useMemo } from "react";
import { T } from "../constants.js";
import { Card, Label } from "../ui.jsx";
import { Mono } from "../components.jsx";
import { cmpString, fromCents, monthlyInterestCents, toBps, toCents } from "../moneyMath.js";
import { Sparkles } from "lucide-react";
import { haptic } from "../haptics.js";
import ScenarioSandbox from "../dashboard/ScenarioSandbox.jsx";

const FLOOR_MIN_PAYMENT_CENTS = 2500; // $25 absolute floor

// Realistic minimum payment: max($25, 1% of balance + monthly interest)
// Matches standard US credit card issuer requirements
function computeMinPaymentCents(balanceCents, aprBps) {
  const interest = monthlyInterestCents(balanceCents, aprBps);
  const onePercent = Math.ceil(balanceCents / 100);
  return Math.max(FLOOR_MIN_PAYMENT_CENTS, onePercent + interest);
}

function sortDebtsForStrategy(strategy, list) {
  const sorted = [...list];
  if (strategy === "avalanche") {
    sorted.sort((a, b) => {
      if (a.aprBps !== b.aprBps) return b.aprBps - a.aprBps;
      if (a.balanceCents !== b.balanceCents) return a.balanceCents - b.balanceCents;
      if (a.minPaymentCents !== b.minPaymentCents) return b.minPaymentCents - a.minPaymentCents;
      return cmpString(a.name, b.name);
    });
    return sorted;
  }

  // Snowball = smallest balance first, deterministic ties on APR then minimum.
  sorted.sort((a, b) => {
    if (a.balanceCents !== b.balanceCents) return a.balanceCents - b.balanceCents;
    if (a.aprBps !== b.aprBps) return b.aprBps - a.aprBps;
    if (a.minPaymentCents !== b.minPaymentCents) return b.minPaymentCents - a.minPaymentCents;
    return cmpString(a.name, b.name);
  });
  return sorted;
}

function simulatePayoff(debts, extraMonthly, strategy) {
  if (!debts?.length) return { months: 0, totalInterest: 0, timeline: [] };

  const balances = debts
    .map(d => {
      const balanceCents = Math.max(0, toCents(d.balance || 0));
      const aprBps = Math.max(0, toBps(d.apr || 0));
      const userMin = Math.max(0, toCents(d.minPayment || 0));
      return {
        name: d.name || "Card",
        balanceCents,
        aprBps,
        minPaymentCents: userMin > 0 ? userMin : computeMinPaymentCents(balanceCents, aprBps),
      };
    })
    .filter(d => d.balanceCents > 0);

  if (!balances.length) return { months: 0, totalInterest: 0, timeline: [] };

  let months = 0;
  let totalInterestCents = 0;
  const timeline = [];
  const maxMonths = 360; // 30 year cap

  while (balances.some(d => d.balanceCents > 0) && months < maxMonths) {
    months++;
    let extraLeftCents = Math.max(0, toCents(extraMonthly || 0));
    let monthInterestCents = 0;

    // Apply interest
    for (const d of balances) {
      if (d.balanceCents <= 0) continue;
      const interestCents = monthlyInterestCents(d.balanceCents, d.aprBps);
      d.balanceCents += interestCents;
      monthInterestCents += interestCents;
      totalInterestCents += interestCents;
    }

    // Pay minimums
    for (const d of balances) {
      if (d.balanceCents <= 0) continue;
      const paymentCents = Math.min(d.minPaymentCents, d.balanceCents);
      d.balanceCents -= paymentCents;
    }

    // Re-rank after minimums. This keeps ties and strategy transitions mathematically correct.
    const orderedDebts = sortDebtsForStrategy(
      strategy,
      balances.filter(d => d.balanceCents > 0)
    );
    for (const d of orderedDebts) {
      if (d.balanceCents <= 0 || extraLeftCents <= 0) continue;
      const paymentCents = Math.min(extraLeftCents, d.balanceCents);
      d.balanceCents -= paymentCents;
      extraLeftCents -= paymentCents;
    }

    if (months % 3 === 0 || months <= 3 || !balances.some(d => d.balanceCents > 0)) {
      timeline.push({
        month: months,
        totalDebt: fromCents(balances.reduce((s, d) => s + Math.max(0, d.balanceCents), 0)),
        interest: fromCents(monthInterestCents),
      });
    }
  }

  return { months, totalInterest: fromCents(totalInterestCents), timeline };
}

export default function DebtSimulator({ cards = [], financialConfig }) {
  const [extraPayment, setExtraPayment] = useState(100);
  const [showSim, setShowSim] = useState(false);
  const [activeStrategy, setActiveStrategy] = useState("avalanche");
  const [showSandbox, setShowSandbox] = useState(false);

  // Get debts from card portfolio + non-card debts
  const debts = useMemo(() => {
    const cardDebts = cards
      .filter(c => parseFloat(c.balance) > 0)
      .map(c => ({
        name: c.nickname || c.name || c.institution || "Card",
        balance: c.balance,
        apr: c.apr,
        minPayment: c.minPayment,
        limit: c.limit,
      }));
    const nonCardDebts = (financialConfig?.nonCardDebts || [])
      .filter(d => parseFloat(d.balance) > 0)
      .map(d => ({
        name: d.name || "Loan",
        balance: d.balance,
        apr: d.apr || 0,
        minPayment: d.minimum ?? d.minPayment ?? 0,
        limit: 0,
      }));
    return [...cardDebts, ...nonCardDebts];
  }, [cards, financialConfig]);

  const baseline = useMemo(() => simulatePayoff(debts, 0, "avalanche"), [debts]);
  const avalanche = useMemo(() => simulatePayoff(debts, extraPayment, "avalanche"), [debts, extraPayment]);
  const snowball = useMemo(() => simulatePayoff(debts, extraPayment, "snowball"), [debts, extraPayment]);

  const totalDebt = debts.reduce((s, d) => s + (parseFloat(d.balance) || 0), 0);
  if (totalDebt < 50) return null; // Don't show if no meaningful debt

  // Active projection based on toggle
  const activeProjection = activeStrategy === "avalanche" ? avalanche : snowball;
  const maxDebt = Math.max(...(avalanche.timeline.length ? avalanche.timeline.map(t => t.totalDebt) : [totalDebt]), totalDebt);

  // Optimizer diff (Avalanche vs Snowball)
  const diffMonths = snowball.months - avalanche.months;
  const diffInterest = snowball.totalInterest - avalanche.totalInterest;

  if (!showSim) {
    return (
      <Card animate delay={400} style={{ cursor: "pointer" }} onClick={() => setShowSim(true)}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>⚡</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Debt Payoff Simulator</div>
              <div style={{ fontSize: 11, color: T.text.dim }}>See how fast you can be debt-free</div>
            </div>
          </div>
          <div style={{ fontSize: 20, color: T.text.dim }}>›</div>
        </div>
      </Card>
    );
  }

  return (
    <Card animate style={{ position: "relative" }}>
      {showSandbox && (
        <ScenarioSandbox
          currentNetWorth={0} // We will pull this from Dashboard Tab if needed, but for now 0 is fine since sandbox overrides it anyway
          currentAnnualIncome={financialConfig?.incomeSources?.reduce((sum, s) => sum + (s.frequency === "yearly" ? s.amount : s.amount * 12), 0) || 0}
          currentAnnualExpenses={(financialConfig?.budgetCategories?.reduce((sum, c) => sum + c.monthlyTarget, 0) || 0) * 12}
          onClose={() => setShowSandbox(false)}
        />
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>⚡</span>
          <span style={{ fontSize: 14, fontWeight: 800 }}>Debt Payoff Simulator</span>
        </div>
        <button
          onClick={() => setShowSim(false)}
          className="hover-btn"
          style={{
            background: "none",
            border: "none",
            color: T.text.dim,
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: T.font.mono,
          }}
        >
          COLLAPSE
        </button>
      </div>

      {/* Total Debt */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <Mono size={11} color={T.text.dim}>
          TOTAL DEBT
        </Mono>
        <Mono size={32} weight={800} color={T.status.red}>
          ${totalDebt.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </Mono>
      </div>

      {/* Launch Sandbox Button */}
      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => { haptic.selection(); setShowSandbox(true); }}
          className="hover-btn"
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "10px",
            borderRadius: T.radius.md,
            background: `linear-gradient(135deg, ${T.accent.emerald}10, ${T.accent.primary}10)`,
            border: `1px solid ${T.accent.emerald}40`,
            color: T.accent.emerald,
            fontSize: 12,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          <Sparkles size={14} />
          Launch "What-If" Sandbox
        </button>
      </div>

      {/* Strategy Toggle */}
      <div style={{ display: "flex", background: T.bg.elevated, padding: 4, borderRadius: T.radius.lg, marginBottom: 16, border: `1px solid ${T.border.subtle}` }}>
        {[
          { id: "avalanche", label: "Avalanche", sub: "Highest APR First" },
          { id: "snowball", label: "Snowball", sub: "Lowest Balance First" }
        ].map(s => (
          <button
            key={s.id}
            onClick={() => {
              if (window.haptic) window.haptic.selection();
              setActiveStrategy(s.id);
            }}
            style={{
              flex: 1, padding: "8px 0", border: "none", borderRadius: T.radius.md,
              background: activeStrategy === s.id ? T.bg.card : "transparent",
              boxShadow: activeStrategy === s.id ? T.shadow.navBtn : "none",
              cursor: "pointer", transition: "all 0.2s"
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: activeStrategy === s.id ? T.text.primary : T.text.dim }}>{s.label}</div>
            <div style={{ fontSize: 9, color: T.text.muted, marginTop: 2 }}>{s.sub}</div>
          </button>
        ))}
      </div>

      {/* Timeline Visualization */}
      {activeProjection.timeline.length > 0 && (
        <div
          style={{
            height: 90,
            display: "flex",
            alignItems: "flex-end",
            gap: 2,
            marginBottom: 20,
            padding: "0 4px",
            borderBottom: `2px solid ${T.border.default}`,
          }}
        >
          {activeProjection.timeline.map((t, i) => {
            const h = maxDebt > 0 ? (t.totalDebt / maxDebt) * 80 : 0;
            const isLast = i === activeProjection.timeline.length - 1;
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: Math.max(2, h),
                  borderRadius: "3px 3px 0 0",
                  background:
                    isLast && t.totalDebt < 1
                      ? T.status.green
                      : `linear-gradient(180deg, ${T.status.red}80, ${T.status.amber}60)`,
                  transition: "height 0.4s cubic-bezier(.16,1,.3,1)",
                  position: "relative",
                }}
              >
                {(i === 0 || isLast) && (
                  <span
                    style={{
                      position: "absolute",
                      bottom: -18,
                      left: "50%",
                      transform: "translateX(-50%)",
                      fontSize: 9,
                      color: T.text.primary,
                      fontWeight: 700,
                      fontFamily: T.font.mono,
                      whiteSpace: "nowrap",
                    }}
                  >
                    M{t.month}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Projection Results */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24, padding: "0 8px" }}>
        <div>
          <div style={{ fontSize: 11, color: T.text.dim, fontWeight: 700, marginBottom: 4 }}>DEBT FREE IN</div>
          <Mono size={24} weight={800} color={T.text.primary}>
            {activeProjection.months < 360 ? `${Math.floor(activeProjection.months / 12)}y ${activeProjection.months % 12}m` : "30y+"}
          </Mono>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: T.text.dim, fontWeight: 700, marginBottom: 4 }}>TOTAL INTEREST</div>
          <Mono size={24} weight={800} color={T.status.red}>
            ${activeProjection.totalInterest.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </Mono>
        </div>
      </div>

      {/* Extra Payment Slider */}
      <div style={{ marginBottom: 20, padding: 16, background: T.bg.elevated, borderRadius: T.radius.lg, border: `1px solid ${T.border.subtle}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <Label style={{ margin: 0 }}>Extra Monthly Ammo</Label>
          <Mono size={14} weight={800} color={T.accent.emerald}>
            +${extraPayment}/mo
          </Mono>
        </div>
        <input
          type="range"
          min={0}
          max={1000}
          step={25}
          value={extraPayment}
          onChange={e => setExtraPayment(parseInt(e.target.value))}
          onPointerUp={() => { if (window.haptic) window.haptic.light(); }}
          style={{
            width: "100%",
            height: 6,
            appearance: "none",
            WebkitAppearance: "none",
            background: `linear-gradient(to right, ${T.accent.emerald} ${(extraPayment / 1000) * 100}%, ${T.border.default} ${(extraPayment / 1000) * 100}%)`,
            borderRadius: 3,
            outline: "none",
            cursor: "pointer",
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
          <span style={{ fontSize: 10, color: T.text.muted, fontWeight: 700 }}>$0</span>
          <span style={{ fontSize: 10, color: T.text.muted, fontWeight: 700 }}>$1,000</span>
        </div>
      </div>

      {/* High-Impact Optimizer Callout */}
      {diffInterest > 0 && activeStrategy === "snowball" && (
        <div
          style={{
            padding: "16px",
            borderRadius: T.radius.md,
            background: `${T.status.blue}10`,
            border: `1px solid ${T.status.blue}30`,
            animation: "fadeIn .3s ease",
            position: "relative",
            overflow: "hidden"
          }}
        >
          <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: T.status.blue }} />
          <div style={{ fontSize: 13, fontWeight: 800, color: T.text.primary, marginBottom: 4 }}>
            💡 Optimizer Alert
          </div>
          <p style={{ fontSize: 12, color: T.text.secondary, margin: 0, lineHeight: 1.4 }}>
            Switching to <strong>Avalanche</strong> right now saves you <span style={{ color: T.status.green, fontWeight: 800 }}>${diffInterest.toLocaleString()}</span> in total interest
            {diffMonths > 0 ? ` and makes you debt free ${diffMonths} months sooner.` : "."}
          </p>
        </div>
      )}
      {diffInterest > 0 && activeStrategy === "avalanche" && (
        <div
          style={{
            padding: "16px",
            borderRadius: T.radius.md,
            background: `${T.status.green}10`,
            border: `1px solid ${T.status.green}30`,
            animation: "fadeIn .3s ease",
            position: "relative",
            overflow: "hidden"
          }}
        >
          <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: T.status.green }} />
          <div style={{ fontSize: 13, fontWeight: 800, color: T.text.primary, marginBottom: 4 }}>
            ✅ Optimal Strategy Active
          </div>
          <p style={{ fontSize: 12, color: T.text.secondary, margin: 0, lineHeight: 1.4 }}>
            By prioritizing high-interest debt first, you are paying <span style={{ color: T.status.green, fontWeight: 800 }}>${diffInterest.toLocaleString()} less</span> to the banks compared to Snowball.
          </p>
        </div>
      )}
    </Card>
  );
}
