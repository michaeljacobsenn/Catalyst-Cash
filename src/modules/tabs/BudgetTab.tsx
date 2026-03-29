import { type FormEvent, Suspense, lazy, useCallback, useMemo, useState } from "react";
import { T } from "../constants.js";
import { useAudit } from "../contexts/AuditContext.js";
import { useBudget } from "../contexts/BudgetContext.js";
import { useSettings } from "../contexts/SettingsContext.js";
import { haptic } from "../haptics.js";
import { Plus, Trash2, Zap } from "../icons.js";
import { shouldShowGating } from "../subscription.js";
import { Card } from "../ui.js";
import ProBanner from "./ProBanner.js";
import { BUCKET_CONFIG, getActualSpendForLine } from "../budgetEngine.js";
import type { BudgetLine } from "../contexts/BudgetContext.js";
const LazyProPaywall = lazy(() => import("./ProPaywall.js"));

const BUCKET_ORDER = ["fixed", "flex", "invest"] as const;
type Bucket = (typeof BUCKET_ORDER)[number];

const DEFAULT_ICONS: Record<Bucket, string> = {
  fixed: "🔒",
  flex: "🌊",
  invest: "📈",
};

interface AddLineFormProps {
  bucket: Bucket;
  onAdd: (line: Omit<BudgetLine, "id">) => void;
  onCancel: () => void;
}

function AddLineForm({ bucket, onAdd, onCancel }: AddLineFormProps) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [icon, setIcon] = useState(DEFAULT_ICONS[bucket]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amount.replace(/[^0-9.]/g, ""));
    if (!name.trim() || isNaN(val) || val <= 0) return;
    onAdd({ name: name.trim(), amount: val, bucket, icon, isAuto: false });
    haptic.success();
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: "12px 16px", background: T.bg.elevated, borderRadius: 14, margin: "8px 0", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={icon}
          onChange={e => setIcon(e.target.value)}
          maxLength={2}
          style={{ width: 44, background: T.bg.surface, border: `1px solid ${T.border.default}`, borderRadius: 10, color: T.text.primary, fontSize: 20, textAlign: "center", padding: "8px 4px", outline: "none" }}
        />
        <input
          autoFocus
          placeholder="Category name"
          value={name}
          onChange={e => setName(e.target.value)}
          style={{ flex: 1, background: T.bg.surface, border: `1px solid ${T.border.default}`, borderRadius: 10, color: T.text.primary, fontSize: 14, fontWeight: 700, padding: "8px 12px", outline: "none" }}
        />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: T.text.muted, fontSize: 14, fontWeight: 700 }}>$</span>
          <input
            type="number"
            placeholder="Amount per paycheck"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            style={{ width: "100%", background: T.bg.surface, border: `1px solid ${T.border.default}`, borderRadius: 10, color: T.text.primary, fontSize: 14, fontWeight: 700, padding: "8px 12px 8px 28px", outline: "none", boxSizing: "border-box" }}
          />
        </div>
        <button type="submit" style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${T.accent.primary}, #6C60FF)`, color: "white", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>Add</button>
        <button type="button" onClick={onCancel} style={{ padding: "8px 14px", borderRadius: 10, border: `1px solid ${T.border.default}`, background: "transparent", color: T.text.secondary, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>✕</button>
      </div>
    </form>
  );
}

interface BudgetLineRowProps {
  line: BudgetLine;
  actualSpend: number;
  onUpdate: (patch: Partial<BudgetLine>) => void;
  onDelete: () => void;
}

function BudgetLineRow({ line, actualSpend, onUpdate, onDelete }: BudgetLineRowProps) {
  const [editingAmount, setEditingAmount] = useState(false);
  const [amountInput, setAmountInput] = useState("");
  const progress = line.amount > 0 ? Math.min(actualSpend / line.amount, 1) : 0;
  const remaining = line.amount - actualSpend;
  const isOver = remaining < 0;
  const isWarning = !isOver && progress > 0.85;
  const barColor = isOver ? T.status.red : isWarning ? T.status.amber : BUCKET_CONFIG[line.bucket].color;
  const hasActuals = actualSpend > 0;

  return (
    <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border.subtle}`, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>{line.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line.name}</div>
          {line.isAuto && <div style={{ fontSize: 10, color: T.accent.primary, fontWeight: 700, letterSpacing: "0.03em" }}>AUTO · FROM AUDIT</div>}
        </div>
        {/* Amount */}
        {editingAmount ? (
          <form onSubmit={e => { e.preventDefault(); const v = parseFloat(amountInput.replace(/[^0-9.]/g, "")); if (!isNaN(v) && v >= 0) { onUpdate({ amount: v }); haptic.success(); } setEditingAmount(false); }} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: T.text.muted, fontSize: 13 }}>$</span>
              <input autoFocus type="number" value={amountInput} onChange={e => setAmountInput(e.target.value)}
                style={{ width: 80, background: T.bg.surface, border: `1px solid ${T.accent.primary}`, borderRadius: 8, color: T.accent.primary, fontSize: 14, fontWeight: 800, padding: "5px 8px 5px 20px", outline: "none" }} />
            </div>
            <button type="submit" style={{ background: T.accent.primary, border: "none", borderRadius: 8, color: "white", fontWeight: 800, fontSize: 12, padding: "5px 10px", cursor: "pointer" }}>✓</button>
          </form>
        ) : (
          <button onClick={() => { setAmountInput(String(line.amount)); setEditingAmount(true); haptic.light(); }}
            style={{ background: "transparent", border: `1px solid ${T.border.default}`, borderRadius: 10, color: T.accent.primary, fontSize: 15, fontWeight: 900, padding: "4px 12px", cursor: "pointer", letterSpacing: "-0.02em" }}>
            ${line.amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </button>
        )}
        <button onClick={() => { haptic.light(); onDelete(); }}
          style={{ background: "transparent", border: "none", color: T.text.muted, cursor: "pointer", padding: "4px", borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center" }}>
          <Trash2 size={14} strokeWidth={2} />
        </button>
      </div>

      {/* Progress bar — only shown when audit actuals exist */}
      {hasActuals && (
        <>
          <div style={{ width: "100%", height: 4, borderRadius: 2, background: T.bg.surface, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress * 100}%`, borderRadius: 2, background: barColor, transition: "width 0.5s ease" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: isOver ? T.status.red : T.text.secondary }}>
              {isOver ? `$${Math.abs(remaining).toFixed(0)} over` : `$${remaining.toFixed(0)} left`}
            </span>
            <span style={{ fontSize: 11, color: T.text.dim }}>
              ${actualSpend.toFixed(0)} spent this cycle
            </span>
          </div>
        </>
      )}
    </div>
  );
}

interface BudgetTabProps {
  embedded?: boolean;
  proEnabled?: boolean;
  privacyMode?: boolean;
}

export default function BudgetTab({ embedded, proEnabled = false, privacyMode: _pm = false }: BudgetTabProps) {
  void _pm;
  const { lines, cycleIncome, addLine, updateLine, deleteLine, suggestFromAudit, totalFixed, totalFlex, totalInvest, readyToAssign, isBudgetReady } = useBudget();
  const { financialConfig } = useSettings();
  const { current } = useAudit();

  const [addingBucket, setAddingBucket] = useState<Bucket | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [seedPending, setSeedPending] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const auditCategories = (current?.parsed?.categories ?? null) as Record<string, { total?: number }> | null;
  const hasAudit = !!auditCategories;
  const hasNoLines = lines.length === 0;
  const showSeedBanner = hasAudit && hasNoLines && !dismissed && isBudgetReady;

  const handleSeed = useCallback(async () => {
    if (!auditCategories) return;
    setSeedPending(true);
    await suggestFromAudit(auditCategories);
    setSeedPending(false);
    haptic.success();
  }, [auditCategories, suggestFromAudit]);

  const linesByBucket = useMemo(() => {
    const map: Record<Bucket, BudgetLine[]> = { fixed: [], flex: [], invest: [] };
    for (const l of lines) map[l.bucket as Bucket]?.push(l);
    return map;
  }, [lines]);

  // AI overspend nudges
  const overspentLines = useMemo(() => {
    if (!auditCategories) return [];
    return lines.filter(l => {
      const actual = getActualSpendForLine(auditCategories, l.name, financialConfig.payFrequency) as number;
      return actual > l.amount && l.amount > 0;
    });
  }, [lines, auditCategories, financialConfig.payFrequency]);

  const cy = cycleIncome > 0 ? `$${cycleIncome.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : null;
  const isOver = readyToAssign < 0;
  const isComplete = readyToAssign === 0 && lines.length > 0;

  return (
    <div className="page-body" style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <div style={{ width: "100%", maxWidth: 768, display: "flex", flexDirection: "column" }}>

        {/* Header */}
        {!embedded && (
          <div style={{ paddingTop: 20, paddingBottom: 12 }}>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: T.text.primary, marginBottom: 4, letterSpacing: "-0.03em" }}>
              Paycheck Budget
            </h1>
            <p style={{ fontSize: 13, color: T.text.secondary, margin: 0, lineHeight: 1.5 }}>
              Give every dollar a job — per paycheck, not per month.
            </p>
          </div>
        )}

        {shouldShowGating() && !proEnabled && (
          <ProBanner onUpgrade={() => setShowPaywall(true)} label="⚡ Paycheck CFO Budget" sublabel="Pro unlocks AI-seeded budgets and overspend alerts" />
        )}
        {showPaywall && <Suspense fallback={null}><LazyProPaywall onClose={() => setShowPaywall(false)} source="budget" /></Suspense>}

        {/* ── Paycheck Overview Card ── */}
        <Card className="slide-up" style={{ padding: "22px 20px", marginBottom: 16, background: T.bg.card, border: `1px solid ${T.border.subtle}`, borderRadius: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                {financialConfig.payFrequency?.replace("-", " ") ?? "Per Paycheck"} take-home
              </div>
              <div style={{ fontSize: 34, fontWeight: 900, color: T.text.primary, letterSpacing: "-0.04em", lineHeight: 1 }}>
                {cycleIncome > 0 ? cy : <span style={{ color: T.text.muted, fontSize: 18 }}>Set in Settings → Financial Config</span>}
              </div>
            </div>
            <div style={{
              padding: "8px 14px", borderRadius: 100,
              background: isOver ? `${T.status.red}20` : isComplete ? `${T.status.green}20` : `${T.accent.primary}15`,
              border: `1px solid ${isOver ? T.status.red : isComplete ? T.status.green : T.accent.primary}30`,
            }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
                {isOver ? "Over" : isComplete ? "Balanced" : "To Assign"}
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: isOver ? T.status.red : isComplete ? T.status.green : T.accent.primary, letterSpacing: "-0.03em" }}>
                {isComplete ? "✓" : `${isOver ? "-" : ""}$${Math.abs(readyToAssign).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
              </div>
            </div>
          </div>

          {/* Bucket summary pills */}
          {lines.length > 0 && (
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { label: "Fixed", val: totalFixed, color: BUCKET_CONFIG.fixed.color },
                { label: "Flex", val: totalFlex, color: BUCKET_CONFIG.flex.color },
                { label: "Invest", val: totalInvest, color: BUCKET_CONFIG.invest.color },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ flex: 1, background: `${color}12`, borderRadius: 12, padding: "8px 10px", border: `1px solid ${color}25` }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: T.text.primary }}>
                    ${val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(0)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ── AI Overspend Nudges ── */}
        {overspentLines.length > 0 && (
          <div style={{ background: `${T.status.red}12`, border: `1px solid ${T.status.red}30`, borderRadius: 16, padding: "12px 16px", marginBottom: 16, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: T.status.red, display: "flex", alignItems: "center", gap: 6 }}>
              <Zap size={13} /> Over-budget this cycle
            </div>
            {overspentLines.map(l => {
              const actual = getActualSpendForLine(auditCategories ?? {}, l.name, financialConfig.payFrequency) as number;
              return (
                <div key={l.id} style={{ fontSize: 12, color: T.text.secondary, display: "flex", justifyContent: "space-between" }}>
                  <span>{l.icon} {l.name}</span>
                  <span style={{ fontWeight: 700, color: T.status.red }}>+${(actual - l.amount).toFixed(0)} over</span>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Audit Seed Banner ── */}
        {showSeedBanner && (
          <Card style={{ padding: "18px 20px", marginBottom: 16, background: `linear-gradient(135deg, ${T.accent.primary}18, ${T.bg.card})`, border: `1px solid ${T.accent.primary}40`, borderRadius: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 13, background: `${T.accent.primary}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>🪄</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: T.text.primary, marginBottom: 3 }}>Set up from your audit</div>
                <div style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.4 }}>Auto-create budget lines from your most recent audit's spending categories.</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={handleSeed} disabled={seedPending}
                style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${T.accent.primary}, #6C60FF)`, color: "white", fontWeight: 800, fontSize: 13, cursor: "pointer", opacity: seedPending ? 0.7 : 1 }}>
                {seedPending ? "Building…" : "✨ Auto-Build Budget"}
              </button>
              <button onClick={() => setDismissed(true)}
                style={{ padding: "10px 16px", borderRadius: 12, border: `1px solid ${T.border.default}`, background: "transparent", color: T.text.secondary, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                Manual
              </button>
            </div>
          </Card>
        )}

        {/* ── Three Bucket Sections ── */}
        {BUCKET_ORDER.map((bucket) => {
          const cfg = BUCKET_CONFIG[bucket];
          const bucketLines = linesByBucket[bucket] ?? [];
          const isAdding = addingBucket === bucket;

          return (
            <div key={bucket} style={{ marginBottom: 16 }}>
              {/* Bucket header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 17 }}>{cfg.emoji}</span>
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 900, color: T.text.primary }}>{cfg.label}</span>
                    <span style={{ fontSize: 11, color: T.text.muted, marginLeft: 8 }}>{cfg.description}</span>
                  </div>
                </div>
                <button onClick={() => { setAddingBucket(isAdding ? null : bucket); haptic.light(); }}
                  style={{ display: "flex", alignItems: "center", gap: 4, background: "transparent", border: `1px solid ${T.border.default}`, borderRadius: 10, color: T.text.secondary, fontWeight: 700, fontSize: 11, padding: "5px 10px", cursor: "pointer" }}>
                  <Plus size={11} strokeWidth={2.5} /> Add
                </button>
              </div>

              <div style={{ background: T.bg.card, borderRadius: 20, border: `1px solid ${T.border.subtle}`, overflow: "hidden" }}>
                {isAdding && (
                  <div style={{ padding: "0 12px" }}>
                    <AddLineForm bucket={bucket} onAdd={async (l) => { await addLine(l); setAddingBucket(null); }} onCancel={() => setAddingBucket(null)} />
                  </div>
                )}

                {bucketLines.length === 0 && !isAdding ? (
                  <div style={{ padding: "20px 20px", textAlign: "center", color: T.text.muted, fontSize: 13, fontWeight: 600 }}>
                    No {cfg.label.toLowerCase()} lines yet — tap Add
                  </div>
                ) : (
                  bucketLines.map((line, i) => {
                    const actual = auditCategories
                      ? (getActualSpendForLine(auditCategories, line.name, financialConfig.payFrequency) as number)
                      : 0;
                    return (
                      <div key={line.id} style={{ borderTop: i === 0 && !isAdding ? "none" : undefined }}>
                        <BudgetLineRow
                          line={line}
                          actualSpend={actual}
                          onUpdate={(patch) => void updateLine(line.id, patch)}
                          onDelete={() => void deleteLine(line.id)}
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}

        {/* Bottom CTA if no audit yet */}
        {!hasAudit && lines.length > 0 && (
          <div style={{ textAlign: "center", padding: "20px 0 32px", color: T.text.muted, fontSize: 13, fontWeight: 600 }}>
            Run your first audit to see actual spending vs. your budget
          </div>
        )}

      </div>
    </div>
  );
}
