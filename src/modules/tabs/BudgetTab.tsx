import { type FormEvent, Suspense, lazy, useCallback, useMemo, useState } from "react";

import { T } from "../constants.js";
import { useAudit } from "../contexts/AuditContext.js";
import type { BudgetLine } from "../contexts/BudgetContext.js";
import { useBudget } from "../contexts/BudgetContext.js";
import { usePortfolio } from "../contexts/PortfolioContext.js";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout.js";
import { useSettings } from "../contexts/SettingsContext.js";
import { haptic } from "../haptics.js";
import {
  AlertTriangle,
  CheckCircle,
  PiggyBank,
  Plus,
  Target,
  Trash2,
  TrendingUp,
  Wallet,
  Zap,
} from "../icons.js";
import { shouldShowGating } from "../subscription.js";
import UiGlyph from "../UiGlyph.js";
import { Badge, Card } from "../ui.js";
import { fmt } from "../utils.js";
import { BUCKET_CONFIG, getActualSpendForLine } from "../budgetEngine.js";
import { BUDGET_BUCKET_ORDER, DEFAULT_BUDGET_ICONS } from "../budgetBuckets.js";
import ProBanner from "./ProBanner.js";

const LazyProPaywall = lazy(() => import("./ProPaywall.js"));

type Bucket = BudgetLine["bucket"];
const BUCKET_ORDER = BUDGET_BUCKET_ORDER as readonly Bucket[];
const DEFAULT_ICONS = DEFAULT_BUDGET_ICONS as Record<Bucket, string>;
const READY_TO_ASSIGN_EPSILON = 0.5;

function formatBudgetMoney(value: number) {
  return fmt(Number(value) || 0);
}

function formatBudgetCompact(value: number) {
  const amount = Number(value) || 0;
  if (Math.abs(amount) >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
  return `$${amount.toFixed(0)}`;
}

function normalizeBudgetLabelKey(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

interface AddLineFormProps {
  bucket: Bucket;
  onAdd: (line: Omit<BudgetLine, "id">) => void;
  onCancel: () => void;
}

function AddLineForm({ bucket, onAdd, onCancel }: AddLineFormProps) {
  const { isNarrowPhone } = useResponsiveLayout();
  const shouldAutoFocus = typeof window !== "undefined" && Boolean(window.matchMedia?.("(pointer:fine)").matches);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [icon, setIcon] = useState(DEFAULT_ICONS[bucket]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const val = parseFloat(amount.replace(/[^0-9.]/g, ""));
    if (!name.trim() || Number.isNaN(val) || val <= 0) return;
    onAdd({ name: name.trim(), amount: val, bucket, icon, isAuto: false });
    haptic.success();
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: isNarrowPhone ? "14px" : "16px",
        borderRadius: 20,
        background: `linear-gradient(180deg, ${T.bg.surface}, ${T.bg.elevated})`,
        border: `1px solid ${T.border.subtle}`,
        display: "grid",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: T.text.dim, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Add Budget Line
          </div>
          <div style={{ fontSize: 13, color: T.text.secondary, lineHeight: 1.45, marginTop: 4 }}>
            Add a per-paycheck target for this bucket.
          </div>
        </div>
        <Badge variant="outline" style={{ color: BUCKET_CONFIG[bucket].color, borderColor: `${BUCKET_CONFIG[bucket].color}35`, background: `${BUCKET_CONFIG[bucket].color}10` }}>
          {BUCKET_CONFIG[bucket].label}
        </Badge>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isNarrowPhone ? "56px minmax(0, 1fr)" : "60px minmax(0, 1fr)", gap: 10 }}>
        <input
          value={icon}
          onChange={(event) => setIcon(event.target.value)}
          maxLength={2}
          aria-label="Budget line icon"
          style={{
            textAlign: "center",
            fontSize: 22,
            fontWeight: 700,
            padding: "12px 6px",
            borderRadius: 14,
          }}
        />
        <input
          autoFocus={shouldAutoFocus}
          placeholder="Category name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label="Budget line name"
          style={{ fontSize: 15, fontWeight: 700, borderRadius: 14 }}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isNarrowPhone ? "1fr" : "minmax(0, 1fr) auto auto", gap: 10 }}>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.text.muted, fontSize: 14, fontWeight: 700 }}>$</span>
          <input
            type="number"
            inputMode="decimal"
            placeholder="Amount per paycheck"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-label="Budget line amount"
            style={{ paddingLeft: 30, fontSize: 15, fontWeight: 700, borderRadius: 14 }}
          />
        </div>
        <button
          type="submit"
          style={{
            minHeight: 46,
            padding: "0 18px",
            borderRadius: 14,
            border: "none",
            background: `linear-gradient(135deg, ${T.accent.primary}, #6C60FF)`,
            color: "#fff",
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Add Line
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            minHeight: 46,
            padding: "0 16px",
            borderRadius: 14,
            border: `1px solid ${T.border.default}`,
            background: "transparent",
            color: T.text.secondary,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
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
  const { isNarrowPhone } = useResponsiveLayout();
  const shouldAutoFocus = typeof window !== "undefined" && Boolean(window.matchMedia?.("(pointer:fine)").matches);
  const [editingAmount, setEditingAmount] = useState(false);
  const [amountInput, setAmountInput] = useState("");

  const normalizedActualSpend = Math.max(0, Number(actualSpend) || 0);
  const progress = line.amount > 0 ? Math.min(normalizedActualSpend / line.amount, 1) : 0;
  const remaining = line.amount - normalizedActualSpend;
  const isOver = remaining < 0;
  const isWarning = !isOver && progress > 0.85;
  const barColor = isOver ? T.status.red : isWarning ? T.status.amber : BUCKET_CONFIG[line.bucket].color;
  const hasActuals = normalizedActualSpend > 0;
  const bucketLabel = BUCKET_CONFIG[line.bucket].label;

  return (
    <div
      style={{
        padding: isNarrowPhone ? "14px 14px 12px" : "16px 16px 14px",
        borderTop: `1px solid ${T.border.subtle}`,
        display: "grid",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isNarrowPhone ? "minmax(0, 1fr) auto" : "minmax(0, 1fr) auto auto",
          gap: 10,
          alignItems: "start",
        }}
      >
        <div style={{ minWidth: 0, display: "flex", gap: 10 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 14,
              background: `${BUCKET_CONFIG[line.bucket].color}12`,
              border: `1px solid ${BUCKET_CONFIG[line.bucket].color}20`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <UiGlyph glyph={line.icon} size={18} color={BUCKET_CONFIG[line.bucket].color} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text.primary, lineHeight: 1.2, wordBreak: "break-word" }}>
              {line.name}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: line.needsReview ? T.status.amber : T.text.dim,
                }}
              >
                {line.needsReview ? "Review bucket" : bucketLabel}
              </span>
              {line.isAuto ? (
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: T.accent.primary }}>
                  From audit
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {editingAmount ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const value = parseFloat(amountInput.replace(/[^0-9.]/g, ""));
              if (!Number.isNaN(value) && value >= 0) {
                onUpdate({ amount: value });
                haptic.success();
              }
              setEditingAmount(false);
            }}
            style={{
              display: "grid",
              gridTemplateColumns: isNarrowPhone ? "minmax(92px, 1fr) 40px" : "minmax(104px, 1fr) 40px",
              gap: 6,
              alignItems: "center",
              gridColumn: isNarrowPhone ? "1 / -1" : undefined,
            }}
          >
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.text.muted, fontSize: 13, fontWeight: 700 }}>$</span>
              <input
                autoFocus={shouldAutoFocus}
                type="number"
                inputMode="decimal"
                value={amountInput}
                onChange={(event) => setAmountInput(event.target.value)}
                aria-label={`Edit ${line.name} amount`}
                style={{
                  width: "100%",
                  minHeight: 40,
                  padding: "8px 10px 8px 24px",
                  borderRadius: 12,
                  border: `1px solid ${T.accent.primary}`,
                  color: T.accent.primary,
                  fontSize: 14,
                  fontWeight: 800,
                  boxShadow: "none",
                }}
              />
            </div>
            <button
              type="submit"
              aria-label="Save budget amount"
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                border: "none",
                background: T.accent.primary,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <CheckCircle size={15} />
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setAmountInput(String(line.amount));
              setEditingAmount(true);
              haptic.light();
            }}
            style={{
              minHeight: 40,
              padding: "0 14px",
              borderRadius: 12,
              border: `1px solid ${T.border.default}`,
              background: T.bg.surface,
              color: T.text.primary,
              fontSize: 14,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {formatBudgetMoney(line.amount)}
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            haptic.light();
            onDelete();
          }}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            border: "none",
            background: T.bg.surface,
            color: T.text.muted,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Trash2 size={14} strokeWidth={2} />
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isNarrowPhone ? "repeat(3, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr)) auto",
          gap: 8,
          alignItems: "stretch",
        }}
      >
        {[
          { label: "Planned", value: formatBudgetCompact(line.amount), tone: T.text.primary },
          { label: "Spent", value: hasActuals ? formatBudgetCompact(normalizedActualSpend) : "No audit", tone: hasActuals ? T.text.primary : T.text.dim },
          { label: "Left", value: hasActuals ? (isOver ? `-${formatBudgetCompact(Math.abs(remaining)).slice(1)}` : formatBudgetCompact(Math.max(remaining, 0))) : "Waiting", tone: isOver ? T.status.red : isWarning ? T.status.amber : T.status.green },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              padding: "10px 10px 9px",
              borderRadius: 14,
              border: `1px solid ${T.border.subtle}`,
              background: T.bg.surface,
              minWidth: 0,
            }}
          >
            <div style={{ fontSize: 9, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {stat.label}
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: stat.tone, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {stat.value}
            </div>
          </div>
        ))}

        <div style={{ minWidth: 0, gridColumn: isNarrowPhone ? "1 / -1" : undefined }}>
          <div style={{ position: "relative" }}>
            <select
              data-unstyled="true"
              aria-label={`Move ${line.name} to a different bucket`}
              value={line.bucket}
              onChange={(event) => {
                haptic.selection();
                onUpdate({ bucket: event.target.value as Bucket, needsReview: false });
              }}
              style={{
                width: "100%",
                minHeight: 44,
                padding: "12px 30px 12px 12px",
                borderRadius: 14,
                border: `1px solid ${line.needsReview ? `${T.status.amber}55` : T.border.subtle}`,
                background: line.needsReview ? `${T.status.amber}12` : T.bg.surface,
                color: line.needsReview ? T.status.amber : T.text.primary,
                fontSize: 12,
                fontWeight: 800,
                boxShadow: "none",
              }}
            >
              {BUCKET_ORDER.map((bucket) => (
                <option key={bucket} value={bucket}>
                  {BUCKET_CONFIG[bucket].label}
                </option>
              ))}
            </select>
            <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: line.needsReview ? T.status.amber : T.text.muted, pointerEvents: "none", fontSize: 10, fontWeight: 900 }}>
              ▾
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ width: "100%", height: 6, borderRadius: 999, background: T.bg.surface, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${Math.max(0, Math.min(progress, 1)) * 100}%`,
              borderRadius: 999,
              background: barColor,
              transition: "width 0.35s ease",
            }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: hasActuals ? (isOver ? T.status.red : T.text.secondary) : T.text.dim, fontWeight: 700 }}>
            {hasActuals ? (isOver ? `${formatBudgetMoney(Math.abs(remaining))} over plan` : `${formatBudgetMoney(Math.max(remaining, 0))} still available`) : "Run an audit to compare planned vs actual."}
          </span>
          {line.needsReview ? (
            <button
              type="button"
              onClick={() => {
                haptic.success();
                onUpdate({ needsReview: false });
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: `1px solid ${T.status.amber}35`,
                background: `${T.status.amber}12`,
                color: T.status.amber,
                fontSize: 11,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Keep current bucket
            </button>
          ) : null}
        </div>
      </div>
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
  const { isNarrowPhone, isTablet, isLargeTablet } = useResponsiveLayout();
  const {
    lines,
    cycleIncome,
    addLine,
    updateLine,
    deleteLine,
    suggestFromAudit,
    totalBills,
    totalNeeds,
    totalWants,
    totalSavings,
    totalAssigned,
    readyToAssign,
    isBudgetReady,
  } = useBudget();
  const { financialConfig } = useSettings();
  const { renewals } = usePortfolio();
  const { current } = useAudit();

  const [addingBucket, setAddingBucket] = useState<Bucket | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [seedPending, setSeedPending] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [dismissedTrackedBillPromptKey, setDismissedTrackedBillPromptKey] = useState("");

  const auditCategories = (current?.parsed?.categories ?? null) as Record<string, { total?: number }> | null;
  const hasAudit = !!auditCategories;
  const hasNoLines = lines.length === 0;
  const activeRenewals = useMemo(
    () =>
      (Array.isArray(renewals) ? renewals : []).filter((renewal) => {
        if (!renewal || renewal.isCancelled || renewal.archivedAt || renewal.isWaived) return false;
        if (renewal.isAnnualFee || renewal.isCardAF) return false;
        return (Number(renewal.amount) || 0) > 0;
      }),
    [renewals]
  );
  const hasSeedSources = hasAudit || activeRenewals.length > 0;
  const showSeedBanner = hasSeedSources && hasNoLines && !dismissed && isBudgetReady;
  const budgetLineNameKeys = useMemo(
    () => new Set(lines.map((line) => normalizeBudgetLabelKey(line.name)).filter(Boolean)),
    [lines]
  );
  const missingTrackedBills = useMemo(
    () =>
      activeRenewals.filter((renewal) => {
        const renewalKey = normalizeBudgetLabelKey(String(renewal?.name || ""));
        return renewalKey && !budgetLineNameKeys.has(renewalKey);
      }),
    [activeRenewals, budgetLineNameKeys]
  );
  const missingTrackedBillPromptKey = useMemo(
    () => missingTrackedBills.map((renewal) => normalizeBudgetLabelKey(String(renewal?.name || ""))).join("|"),
    [missingTrackedBills]
  );
  const showTrackedBillPrompt =
    isBudgetReady &&
    lines.length > 0 &&
    missingTrackedBills.length > 0 &&
    dismissedTrackedBillPromptKey !== missingTrackedBillPromptKey;

  const handleSeed = useCallback(async () => {
    if (!hasSeedSources) return;
    setSeedPending(true);
    await suggestFromAudit(auditCategories, { renewals: activeRenewals });
    setSeedPending(false);
    haptic.success();
  }, [activeRenewals, auditCategories, hasSeedSources, suggestFromAudit]);

  const handleImportTrackedBills = useCallback(async () => {
    if (!missingTrackedBills.length) return;
    setSeedPending(true);
    await suggestFromAudit(null, { renewals: missingTrackedBills });
    setSeedPending(false);
    setDismissedTrackedBillPromptKey(missingTrackedBillPromptKey);
    haptic.success();
  }, [missingTrackedBillPromptKey, missingTrackedBills, suggestFromAudit]);

  const linesByBucket = useMemo(() => {
    const map: Record<Bucket, BudgetLine[]> = { bills: [], needs: [], wants: [], savings: [] };
    for (const line of lines) map[line.bucket as Bucket]?.push(line);
    return map;
  }, [lines]);

  const needsReviewCount = useMemo(
    () => lines.reduce((count, line) => count + (line.needsReview ? 1 : 0), 0),
    [lines]
  );

  const overspentLines = useMemo(() => {
    if (!auditCategories) return [];
    return lines
      .map((line) => {
        const actual = getActualSpendForLine(auditCategories, line.name, financialConfig.payFrequency) as number;
        const overBy = actual - line.amount;
        return { line, actual, overBy };
      })
      .filter((entry) => entry.overBy > 0)
      .sort((left, right) => right.overBy - left.overBy);
  }, [lines, auditCategories, financialConfig.payFrequency]);

  const bucketSummaries = useMemo(() => {
    return BUCKET_ORDER.map((bucket) => {
      const bucketLines = linesByBucket[bucket] ?? [];
      const assigned = bucketLines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
      const actual = auditCategories
        ? bucketLines.reduce((sum, line) => sum + (getActualSpendForLine(auditCategories, line.name, financialConfig.payFrequency) as number), 0)
        : 0;
      const remaining = assigned - actual;
      const progress = assigned > 0 ? Math.min(actual / assigned, 1) : 0;
      const share = totalAssigned > 0 ? assigned / totalAssigned : 0;
      return {
        bucket,
        config: BUCKET_CONFIG[bucket],
        lineCount: bucketLines.length,
        assigned,
        actual,
        remaining,
        progress,
        share,
      };
    });
  }, [auditCategories, financialConfig.payFrequency, linesByBucket, totalAssigned]);

  const largestBucket = useMemo(
    () => bucketSummaries.reduce((largest, currentBucket) => (currentBucket.assigned > largest.assigned ? currentBucket : largest), bucketSummaries[0] || {
      bucket: "bills" as Bucket,
      config: BUCKET_CONFIG.bills,
      lineCount: 0,
      assigned: 0,
      actual: 0,
      remaining: 0,
      progress: 0,
      share: 0,
    }),
    [bucketSummaries]
  );

  const fundedBuckets = bucketSummaries.filter((bucket) => bucket.assigned > 0).length;
  const assignedPercent = cycleIncome > 0 ? Math.min(totalAssigned / cycleIncome, 1.4) : 0;
  const cycleLabel = financialConfig.payFrequency?.replace("-", " ") ?? "Per paycheck";
  const isComplete = Math.abs(readyToAssign) < READY_TO_ASSIGN_EPSILON && lines.length > 0;
  const isOver = !isComplete && readyToAssign < 0;
  const planningStatusLabel = isOver ? "Over-assigned" : isComplete ? "Balanced" : "Ready to assign";
  const planningStatusColor = isOver ? T.status.red : isComplete ? T.status.green : T.accent.primary;
  const topOverspend = overspentLines[0] || null;
  const summaryGridColumns = isLargeTablet ? "repeat(4, minmax(0, 1fr))" : isTablet ? "repeat(2, minmax(0, 1fr))" : "repeat(2, minmax(0, 1fr))";
  const allocationMix = [
    { label: "Bills", value: totalBills, tone: BUCKET_CONFIG.bills.color },
    { label: "Needs", value: totalNeeds, tone: BUCKET_CONFIG.needs.color },
    { label: "Wants", value: totalWants, tone: BUCKET_CONFIG.wants.color },
    { label: "Savings", value: totalSavings, tone: BUCKET_CONFIG.savings.color },
  ];

  return (
    <div className="page-body" style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <div style={{ width: "100%", maxWidth: isLargeTablet ? 1024 : 860, display: "flex", flexDirection: "column", gap: 16 }}>
        {!embedded && (
          <div style={{ paddingTop: 20, paddingBottom: 2 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
              Paycheck Budget
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: T.text.primary, marginBottom: 6, letterSpacing: "-0.04em", lineHeight: 1.02 }}>
              Budget workspace
            </h1>
            <p style={{ fontSize: 13, color: T.text.secondary, margin: 0, lineHeight: 1.55, maxWidth: 560 }}>
              Allocate each paycheck across obligations, essentials, lifestyle spending, and goals. The moment an audit lands, this view turns into an operating board instead of a static list.
            </p>
          </div>
        )}

        {shouldShowGating() && !proEnabled && (
          <ProBanner onUpgrade={() => setShowPaywall(true)} label="Paycheck CFO Budget" sublabel="Pro unlocks AI-seeded budgets and overspend alerts" />
        )}
        {showPaywall && (
          <Suspense fallback={null}>
            <LazyProPaywall onClose={() => setShowPaywall(false)} source="budget" />
          </Suspense>
        )}

        <Card
          variant="glass"
          className="slide-up"
          style={{
            padding: isNarrowPhone ? "18px 16px" : "22px 22px",
            borderRadius: 28,
            border: `1px solid ${T.border.subtle}`,
            background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.surface})`,
            display: "grid",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: isNarrowPhone ? "flex-start" : "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                {cycleLabel} take-home
              </div>
              <div style={{ fontSize: isNarrowPhone ? 30 : 38, fontWeight: 900, color: T.text.primary, letterSpacing: "-0.05em", lineHeight: 1 }}>
                {cycleIncome > 0 ? formatBudgetMoney(cycleIncome) : "Add take-home pay"}
              </div>
              <div style={{ fontSize: 13, color: T.text.secondary, lineHeight: 1.5, marginTop: 8, maxWidth: 520 }}>
                {cycleIncome > 0
                  ? `Assigned ${formatBudgetMoney(totalAssigned)} across ${fundedBuckets || 0} funded buckets. ${largestBucket?.assigned > 0 ? `${largestBucket.config.label} holds ${Math.round(largestBucket.share * 100)}% of the current plan.` : "Start with the bills and essentials you know you need to cover."}`
                  : "Set your standard paycheck in Financial Profile so Catalyst can calculate ready-to-assign cash each cycle."}
              </div>
            </div>

            <div
              style={{
                minWidth: isNarrowPhone ? "100%" : 180,
                padding: "12px 14px",
                borderRadius: 20,
                border: `1px solid ${planningStatusColor}35`,
                background: `${planningStatusColor}12`,
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                {planningStatusLabel}
              </div>
              <div style={{ fontSize: isNarrowPhone ? 24 : 28, fontWeight: 900, color: planningStatusColor, letterSpacing: "-0.04em", lineHeight: 1.02 }}>
                {isComplete ? "Balanced" : `${isOver ? "-" : ""}${formatBudgetMoney(Math.abs(readyToAssign))}`}
              </div>
              <div style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.45, marginTop: 6 }}>
                {isOver
                  ? "Trim lower-priority lines before the next paycheck lands."
                  : isComplete
                    ? "Every dollar has a job this cycle."
                    : "Still available to place into a bucket."}
              </div>
            </div>
          </div>

          <div style={{ width: "100%", height: 8, borderRadius: 999, background: T.bg.surface, overflow: "hidden" }}>
            <div
              style={{
                width: `${Math.max(0, Math.min(assignedPercent, 1)) * 100}%`,
                height: "100%",
                borderRadius: 999,
                background: isOver ? T.status.red : isComplete ? T.status.green : T.accent.primary,
                transition: "width 0.35s ease",
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: summaryGridColumns, gap: 10 }}>
            {[
              {
                label: "Assigned",
                value: formatBudgetMoney(totalAssigned),
                detail: cycleIncome > 0 ? `${Math.round(Math.min((totalAssigned / cycleIncome) * 100, 999))}% of take-home` : "Waiting on take-home",
                icon: Wallet,
                tone: T.text.primary,
              },
              {
                label: "Overspend Watch",
                value: overspentLines.length ? `${overspentLines.length}` : "Clear",
                detail: topOverspend ? `${topOverspend.line.name} is ${formatBudgetMoney(topOverspend.overBy)} over` : "No lines over plan this cycle",
                icon: AlertTriangle,
                tone: overspentLines.length ? T.status.red : T.status.green,
              },
              {
                label: "Needs Review",
                value: needsReviewCount ? `${needsReviewCount}` : "Done",
                detail: needsReviewCount ? "A few suggested lines still need their final bucket" : "All suggested lines are confirmed",
                icon: CheckCircle,
                tone: needsReviewCount ? T.status.amber : T.status.green,
              },
              {
                label: "Goal Funding",
                value: totalSavings > 0 ? formatBudgetMoney(totalSavings) : "Not set",
                detail: totalSavings > 0 ? `${Math.round((totalSavings / Math.max(totalAssigned, 1)) * 100)}% of assigned cash` : "Add savings goals to reserve future cash",
                icon: PiggyBank,
                tone: totalSavings > 0 ? T.accent.primary : T.text.dim,
              },
            ].map((metric) => {
              const Icon = metric.icon;
              return (
                <div
                  key={metric.label}
                  style={{
                    padding: "12px 12px 11px",
                    borderRadius: 18,
                    border: `1px solid ${T.border.subtle}`,
                    background: T.bg.surface,
                    minWidth: 0,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 10, background: `${metric.tone}12`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon size={15} color={metric.tone} />
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {metric.label}
                    </div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: metric.tone, letterSpacing: "-0.03em", lineHeight: 1.05 }}>
                    {metric.value}
                  </div>
                  <div style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.45, marginTop: 6 }}>
                    {metric.detail}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Allocation mix
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              {allocationMix.map((allocation) => (
                <div
                  key={allocation.label}
                  style={{
                    minHeight: 84,
                    padding: "12px 14px",
                    borderRadius: 18,
                    border: `1px solid ${allocation.tone}26`,
                    background: `${allocation.tone}12`,
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 800, color: allocation.tone, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {allocation.label}
                  </div>
                  <div style={{ fontSize: isNarrowPhone ? 20 : 22, fontWeight: 900, color: T.text.primary, letterSpacing: "-0.03em", lineHeight: 1 }}>
                    {allocation.value > 0 ? formatBudgetMoney(allocation.value) : "$0"}
                  </div>
                  <div style={{ fontSize: 11, color: T.text.secondary, fontWeight: 700 }}>
                    {totalAssigned > 0 ? `${Math.round((allocation.value / totalAssigned) * 100)}% of assigned cash` : "0% of assigned cash"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {showSeedBanner && (
          <Card
            variant="glass"
            style={{
              padding: isNarrowPhone ? "16px" : "18px",
              borderRadius: 24,
              display: "grid",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 14, background: `${T.accent.primary}14`, border: `1px solid ${T.accent.primary}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Zap size={18} color={T.accent.primary} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: T.text.primary, marginBottom: 4 }}>
                  {activeRenewals.length > 0 && hasAudit ? "Build the first plan from bills and spending" : activeRenewals.length > 0 ? "Build the first plan from tracked bills" : "Build the first plan from your audit"}
                </div>
                <div style={{ fontSize: 12.5, color: T.text.secondary, lineHeight: 1.5 }}>
                  {activeRenewals.length > 0 && hasAudit
                    ? "Catalyst can pull in your tracked recurring bills, then fill the rest from recent spending so you can refine instead of starting from zero."
                    : activeRenewals.length > 0
                      ? "Catalyst can pull in your tracked recurring bills as starter lines, then you can layer in the rest of your plan."
                      : "Catalyst can seed the first plan from your recent spending profile, then you refine the buckets that matter."}
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isNarrowPhone ? "1fr" : "minmax(0, 1fr) auto", gap: 10 }}>
              <button
                type="button"
                onClick={handleSeed}
                disabled={seedPending}
                style={{
                  minHeight: 46,
                  borderRadius: 14,
                  border: `1px solid ${T.accent.primary}25`,
                  background: `${T.accent.primary}14`,
                  color: T.accent.primary,
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                  opacity: seedPending ? 0.7 : 1,
                }}
              >
                {seedPending ? "Building plan…" : activeRenewals.length > 0 && hasAudit ? "Build starter plan" : activeRenewals.length > 0 ? "Build from bills" : "Auto-build budget"}
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                style={{
                  minHeight: 46,
                  padding: "0 18px",
                  borderRadius: 14,
                  border: `1px solid ${T.border.default}`,
                  background: "transparent",
                  color: T.text.secondary,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Start manually
              </button>
            </div>
          </Card>
        )}

        {showTrackedBillPrompt && (
          <Card
            variant="glass"
            style={{
              padding: isNarrowPhone ? "16px" : "18px",
              borderRadius: 24,
              display: "grid",
              gap: 14,
              border: `1px solid ${T.status.blue}22`,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  background: `${T.status.blue}14`,
                  border: `1px solid ${T.status.blue}22`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <TrendingUp size={18} color={T.status.blue} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: T.text.primary, marginBottom: 4 }}>
                  Pull {missingTrackedBills.length} tracked {missingTrackedBills.length === 1 ? "bill" : "bills"} into this plan
                </div>
                <div style={{ fontSize: 12.5, color: T.text.secondary, lineHeight: 1.5 }}>
                  {missingTrackedBills
                    .slice(0, 2)
                    .map((renewal) => renewal.name)
                    .join(", ")}
                  {missingTrackedBills.length > 2 ? ` and ${missingTrackedBills.length - 2} more ` : " "}
                  are already tracked in Bills. Add them here so the budget stays aligned with your recurring obligations.
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isNarrowPhone ? "1fr" : "minmax(0, 1fr) auto", gap: 10 }}>
              <button
                type="button"
                onClick={handleImportTrackedBills}
                disabled={seedPending}
                style={{
                  minHeight: 46,
                  borderRadius: 14,
                  border: `1px solid ${T.status.blue}25`,
                  background: `${T.status.blue}14`,
                  color: T.status.blue,
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                  opacity: seedPending ? 0.7 : 1,
                }}
              >
                {seedPending ? "Adding tracked bills…" : "Add tracked bills"}
              </button>
              <button
                type="button"
                onClick={() => setDismissedTrackedBillPromptKey(missingTrackedBillPromptKey)}
                style={{
                  minHeight: 46,
                  padding: "0 18px",
                  borderRadius: 14,
                  border: `1px solid ${T.border.default}`,
                  background: "transparent",
                  color: T.text.secondary,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Not now
              </button>
            </div>
          </Card>
        )}

        {bucketSummaries.some((bucket) => bucket.assigned > 0 || bucket.actual > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: isLargeTablet ? "repeat(4, minmax(0, 1fr))" : "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            {bucketSummaries.map((bucket) => (
              <div
                key={bucket.bucket}
                style={{
                  padding: isNarrowPhone ? "12px" : "13px 12px",
                  borderRadius: 20,
                  border: `1px solid ${bucket.config.color}24`,
                  background: `${bucket.config.color}0E`,
                  display: "grid",
                  gap: 8,
                  minWidth: 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <UiGlyph glyph={bucket.config.emoji} size={16} color={bucket.config.color} />
                    <div style={{ fontSize: 12, fontWeight: 800, color: T.text.primary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {bucket.config.label}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, color: bucket.config.color, fontWeight: 800 }}>
                    {bucket.lineCount || 0}
                  </span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, color: T.text.primary, letterSpacing: "-0.03em", lineHeight: 1 }}>
                  {bucket.assigned > 0 ? formatBudgetCompact(bucket.assigned) : "$0"}
                </div>
                <div style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.45 }}>
                  {hasAudit
                    ? `${formatBudgetCompact(bucket.actual)} spent • ${bucket.remaining < 0 ? `${formatBudgetCompact(Math.abs(bucket.remaining))} over` : `${formatBudgetCompact(Math.max(bucket.remaining, 0))} left`}`
                    : bucket.assigned > 0
                      ? `${Math.round(bucket.share * 100)}% of assigned cash`
                      : "No funding in this bucket yet"}
                </div>
                <div style={{ width: "100%", height: 5, borderRadius: 999, background: `${bucket.config.color}18`, overflow: "hidden" }}>
                  <div style={{ width: `${Math.max(0, Math.min(bucket.progress, 1)) * 100}%`, height: "100%", borderRadius: 999, background: bucket.remaining < 0 ? T.status.red : bucket.config.color }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {needsReviewCount > 0 && (
          <Card
            variant="glass"
            style={{
              padding: "16px 18px",
              borderRadius: 22,
              border: `1px solid ${T.status.amber}22`,
              display: "grid",
              gap: 6,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 900, color: T.text.primary }}>
              Review {needsReviewCount} suggested {needsReviewCount === 1 ? "line" : "lines"}
            </div>
            <div style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.5 }}>
              A few starter lines still need a final bucket. Move anything discretionary into Wants so the plan reflects how you actually spend.
            </div>
          </Card>
        )}

        {overspentLines.length > 0 && (
          <Card
            variant="glass"
            style={{
              padding: "16px 18px",
              borderRadius: 22,
              border: `1px solid ${T.status.red}22`,
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={15} color={T.status.red} />
              <div style={{ fontSize: 13, fontWeight: 900, color: T.text.primary }}>
                Spending pressure this cycle
              </div>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {overspentLines.slice(0, 3).map(({ line, overBy, actual }) => (
                <div key={line.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <UiGlyph glyph={line.icon} size={14} color={T.text.secondary} />
                    <span style={{ fontSize: 12, color: T.text.secondary, fontWeight: 700 }}>{line.name}</span>
                  </div>
                  <div style={{ fontSize: 12, color: T.status.red, fontWeight: 800 }}>
                    {formatBudgetMoney(actual)} spent • {formatBudgetMoney(overBy)} over
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {BUCKET_ORDER.map((bucket) => {
          const cfg = BUCKET_CONFIG[bucket];
          const bucketLines = linesByBucket[bucket] ?? [];
          const isAdding = addingBucket === bucket;
          const summary = bucketSummaries.find((entry) => entry.bucket === bucket);

          return (
            <Card
              key={bucket}
              variant="glass"
              style={{
                padding: isNarrowPhone ? "16px 14px" : "18px 18px",
                borderRadius: 26,
                overflow: "hidden",
                display: "grid",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: isNarrowPhone ? "flex-start" : "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 14, background: `${cfg.color}12`, border: `1px solid ${cfg.color}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <UiGlyph glyph={cfg.emoji} size={18} color={cfg.color} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: T.text.primary, letterSpacing: "-0.02em" }}>{cfg.label}</div>
                    <div style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.5, marginTop: 4, maxWidth: 520 }}>{cfg.description}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", width: isNarrowPhone ? "100%" : undefined }}>
                  {summary ? (
                    <>
                      <div style={{ padding: "7px 10px", borderRadius: 999, background: `${cfg.color}10`, border: `1px solid ${cfg.color}24`, color: cfg.color, fontSize: 11, fontWeight: 800 }}>
                        {summary.lineCount} {summary.lineCount === 1 ? "line" : "lines"}
                      </div>
                      <div style={{ padding: "7px 10px", borderRadius: 999, background: T.bg.surface, border: `1px solid ${T.border.subtle}`, color: T.text.primary, fontSize: 11, fontWeight: 800 }}>
                        {summary.assigned > 0 ? `${formatBudgetMoney(summary.assigned)} planned` : "No funding"}
                      </div>
                      {hasAudit && summary.actual > 0 ? (
                        <div style={{ padding: "7px 10px", borderRadius: 999, background: T.bg.surface, border: `1px solid ${T.border.subtle}`, color: summary.remaining < 0 ? T.status.red : T.text.secondary, fontSize: 11, fontWeight: 800 }}>
                          {formatBudgetMoney(summary.actual)} spent
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setAddingBucket(isAdding ? null : bucket);
                      haptic.light();
                    }}
                    style={{
                      minHeight: 36,
                      padding: "0 14px",
                      borderRadius: 999,
                      border: `1px solid ${cfg.color}30`,
                      background: `${cfg.color}12`,
                      color: cfg.color,
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: "pointer",
                      marginLeft: isNarrowPhone ? "auto" : 0,
                    }}
                  >
                    <Plus size={12} style={{ marginRight: 6, verticalAlign: "text-bottom" }} />
                    Add line
                  </button>
                </div>
              </div>

              {isAdding && (
                <AddLineForm
                  bucket={bucket}
                  onAdd={async (line) => {
                    await addLine(line);
                    setAddingBucket(null);
                  }}
                  onCancel={() => setAddingBucket(null)}
                />
              )}

              {bucketLines.length === 0 && !isAdding ? (
                <div
                  style={{
                    padding: "18px 16px",
                    borderRadius: 20,
                    border: `1px solid ${T.border.subtle}`,
                    background: T.bg.surface,
                    textAlign: "center",
                    color: T.text.secondary,
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  No {cfg.label.toLowerCase()} lines yet. Add the recurring or planned items you want this bucket to hold.
                </div>
              ) : (
                <div style={{ borderRadius: 20, border: `1px solid ${T.border.subtle}`, overflow: "hidden", background: T.bg.card }}>
                  {bucketLines.map((line, index) => {
                    const actual = auditCategories
                      ? (getActualSpendForLine(auditCategories, line.name, financialConfig.payFrequency) as number)
                      : 0;
                    return (
                      <div key={line.id} style={{ borderTop: index === 0 ? "none" : `1px solid ${T.border.subtle}` }}>
                        <BudgetLineRow
                          line={line}
                          actualSpend={actual}
                          onUpdate={(patch) => void updateLine(line.id, patch)}
                          onDelete={() => void deleteLine(line.id)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}

        {!hasAudit && lines.length > 0 && (
          <div style={{ padding: "4px 2px 28px", color: T.text.secondary, fontSize: 13, lineHeight: 1.55, display: "flex", alignItems: "center", gap: 8 }}>
            <TrendingUp size={15} color={T.text.dim} />
            Run an audit to compare each line against real-cycle spending and expose overspend before the next paycheck lands.
          </div>
        )}

        {!lines.length && !showSeedBanner && (
          <Card
            variant="glass"
            style={{
              padding: "22px 20px",
              borderRadius: 24,
              textAlign: "center",
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ width: 52, height: 52, borderRadius: 18, background: `${T.accent.primary}12`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
              <Target size={22} color={T.accent.primary} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: T.text.primary }}>No budget lines yet</div>
            <div style={{ fontSize: 13, color: T.text.secondary, lineHeight: 1.55, maxWidth: 420, margin: "0 auto" }}>
              Start with obligations and essentials first. Once those are set, add wants and savings so every paycheck has a clear destination.
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              {BUCKET_ORDER.map((bucket) => (
                <button
                  key={bucket}
                  type="button"
                  onClick={() => setAddingBucket(bucket)}
                  style={{
                    minHeight: 38,
                    padding: "0 14px",
                    borderRadius: 999,
                    border: `1px solid ${BUCKET_CONFIG[bucket].color}30`,
                    background: `${BUCKET_CONFIG[bucket].color}12`,
                    color: BUCKET_CONFIG[bucket].color,
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {BUCKET_CONFIG[bucket].label}
                </button>
              ))}
            </div>
          </Card>
        )}

        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}
