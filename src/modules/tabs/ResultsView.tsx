import React, { memo, useMemo, useState, type ReactNode } from "react";
import { buildAuditMovePlan } from "../auditMovePlan.js";
import { getMoveAssignmentOptions } from "../moveSemantics.js";
  import { Md as UIMd,Mono as UIMono,MoveRow as UIMoveRow } from "../components.js";
  import { T } from "../constants.js";
  import {
    Activity,
    AlertTriangle,
    ArrowLeft,
    CheckCircle,
    CheckSquare,
    Clock,
    Share2,
    Target,
    TrendingUp,
    Zap,
    type LucideIcon,
  } from "../icons";
  import { Badge as UIBadge,Card as UICard,InlineTooltip as UIInlineTooltip } from "../ui.js";
  import { fmtDate,parseCurrency,stripPaycheckParens } from "../utils.js";
  import AuditExportSheet from "./AuditExportSheet.js";

  import type { AuditRecord,MoveCheckState,ParsedMoveItem } from "../../types/index.js";
  import { useAudit } from "../contexts/AuditContext.js";
  import { useNavigation } from "../contexts/NavigationContext.js";
import { usePortfolio } from "../contexts/PortfolioContext.js";
import { useSettings } from "../contexts/SettingsContext.js";

interface ResultsViewProps {
  audit: AuditRecord | null;
  moveChecks: MoveCheckState;
  onToggleMove: (index: number) => void;
  onUpdateMoveAssignment?: ((index: number, patch: { sourceAccountId?: string | null; targetAccountId?: string | null }) => void) | null;
  streak?: number;
  themeTick?: number;
  onBack?: (() => void) | null;
}

interface NavigationApi {
  navTo: (tab: string, viewState?: AuditRecord | null) => void;
}

interface CardProps {
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

interface BadgeProps {
  children?: ReactNode;
  variant?: string;
  style?: React.CSSProperties;
}

interface MonoProps {
  children?: ReactNode;
  size?: number;
  color?: string;
  weight?: number;
  style?: React.CSSProperties;
}

interface MoveRowProps {
  item: ParsedMoveItem;
  index: number;
  checked: boolean;
  onToggle: () => void;
  detail?: ReactNode;
}

interface MdProps {
  text: string;
}

interface InlineTooltipProps {
  children?: ReactNode;
  term?: string;
}

interface ReportSectionProps {
  title: string;
  icon?: LucideIcon;
  content?: string | null;
  accentColor: string;
  badge?: ReactNode;
  isLast?: boolean;
}

const Card = UICard as unknown as (props: CardProps) => ReactNode;
const Badge = UIBadge as unknown as (props: BadgeProps) => ReactNode;
const Mono = UIMono as unknown as (props: MonoProps) => ReactNode;
const MoveRow = UIMoveRow as unknown as React.ComponentType<MoveRowProps>;
const Md = UIMd as unknown as (props: MdProps) => ReactNode;
const InlineTooltip = UIInlineTooltip as unknown as (props: InlineTooltipProps) => ReactNode;

const ReportSection = ({ title, icon: Icon, content, accentColor, badge, isLast = false }: ReportSectionProps) => {
  if (!content || !content.trim()) return null;
  return (
    <section
      aria-labelledby={`report-section-${title.replace(/\s+/g, "-").toLowerCase()}`}
      style={{ padding: "18px 0", borderBottom: isLast ? "none" : `1px solid ${T.border.subtle}` }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        {Icon && (
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              background: `${accentColor}15`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon size={15} color={accentColor} strokeWidth={2.5} />
          </div>
        )}
        <h2
          id={`report-section-${title.replace(/\s+/g, "-").toLowerCase()}`}
          style={{ fontSize: "clamp(16px, 4.5vw, 19px)", fontWeight: 800, color: T.text.primary, letterSpacing: "-0.02em", margin: 0 }}
        >
          {title}
        </h2>
        {badge}
      </div>
      <Md text={content} />
    </section>
  );
};

function formatMoveItemAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return `$${value.toFixed(2)}`;
  const text = String(value || "").trim();
  if (!text) return "";
  return text.startsWith("$") ? text : `$${text}`;
}

function extractDueDate(text: string | null | undefined) {
  const match = String(text || "").match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return match ? match[1] : "";
}

function buildActionPreviewRows(moveItems: ParsedMoveItem[] = []) {
  return moveItems
    .filter((item) => {
      const amount = typeof item?.amount === "number" ? item.amount : null;
      return Number.isFinite(amount) && Math.abs(amount || 0) > 0;
    })
    .slice(0, 4)
    .map((item) => ({
      label: String(item?.targetLabel || item?.title || item?.text || "Action").trim(),
      amount: formatMoveItemAmount(item?.amount),
      date: extractDueDate(String(item?.detail || item?.text || "")),
      detail: String(item?.detail || item?.text || "").trim(),
      route: String(item?.fundingLabel || item?.routeLabel || "").trim(),
    }));
}

function cleanAllocationLead(detail: string | null | undefined) {
  const text = String(detail || "");
  if (!text) return "";
  const withoutFiller = text.replace(/[^.]*only dollars left after those allocations can go to debt payoff or savings\.?/i, "");
  const withoutRows = withoutFiller.replace(/([^,.;]+?)\s*\(\$[\d,]+(?:\.\d{2})?\s+by\s+\d{4}-\d{2}-\d{2}\)/g, "").replace(/\s+,/g, ",");
  const cleaned = withoutRows
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*\./g, ".")
    .replace(/^[^a-z0-9$]+/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[,:;]\s*$/, "")
    .trim();
  return /[a-z0-9]/i.test(cleaned) ? cleaned : "";
}

export default memo(function ResultsView({
  audit,
  moveChecks,
  onToggleMove,
  onUpdateMoveAssignment = null,
  streak = 0,
  themeTick: _themeTick = 0,
  onBack = null,
}: ResultsViewProps) {
  void streak;
  void _themeTick;
  const { history, current } = useAudit();
  const { cards, bankAccounts } = usePortfolio();
  const { financialConfig } = useSettings();
  const { navTo } = useNavigation() as NavigationApi;

  const [showExportSheet, setShowExportSheet] = useState<boolean>(false);
  const isSmallPhone = typeof window !== "undefined" ? window.innerWidth <= 390 : false;
  if (!audit)
    return (
      <div
        role="status"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "56vh",
          padding: 24,
          textAlign: "center",
        }}
      >
        <Card
          style={{
            width: "100%",
            maxWidth: 420,
            padding: "22px 18px",
            border: `1px solid ${T.border.default}`,
            background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.elevated})`,
          }}
        >
          <div style={{ fontSize: 30, marginBottom: 10 }}>⚡</div>
          <p style={{ fontSize: 16, fontWeight: 800, color: T.text.primary, margin: "0 0 6px" }}>No audit results yet</p>
          <p style={{ fontSize: 13, lineHeight: 1.55, color: T.text.secondary, margin: 0 }}>
            Run an audit first and this screen will turn into your readable weekly game plan.
          </p>
        </Card>
      </div>
    );
  const parsed = audit.parsed;
  const sections = parsed.sections;
  const nextActionCard =
    parsed.structured?.nextAction && typeof parsed.structured.nextAction === "object"
      ? parsed.structured.nextAction
      : null;
  const nextActionAllocationRows = buildActionPreviewRows(parsed.moveItems || []);
  const nextActionLead = cleanAllocationLead(nextActionCard?.detail || sections.nextAction);
  const allocationLedger = useMemo(() => {
    const consistency = parsed?.consistency || {};
    const rows: Array<{ label: string; value: string }> = [];
    if (Number.isFinite(Number(consistency.currentLiquidCash))) {
      rows.push({ label: "Liquid now", value: formatMoveItemAmount(Number(consistency.currentLiquidCash)) });
    }
    if (Number.isFinite(Number(consistency.protectedAllocatedNow)) && Number(consistency.protectedAllocatedNow) > 0) {
      rows.push({ label: "Protected now", value: formatMoveItemAmount(Number(consistency.protectedAllocatedNow)) });
    }
    if (Number.isFinite(Number(consistency.optionalAllocatedNow)) && Number(consistency.optionalAllocatedNow) > 0) {
      rows.push({ label: "Optional deploy", value: formatMoveItemAmount(Number(consistency.optionalAllocatedNow)) });
    }
    const parkedCash =
      (Number.isFinite(Number(consistency.remainingCheckingPool)) ? Number(consistency.remainingCheckingPool) : 0) +
      (Number.isFinite(Number(consistency.remainingVaultPool)) ? Number(consistency.remainingVaultPool) : 0);
    if (parkedCash > 0) {
      rows.push({ label: "Still parked", value: formatMoveItemAmount(parkedCash) });
    }
    if (Number.isFinite(Number(consistency.protectedGapNow)) && Number(consistency.protectedGapNow) > 0) {
      rows.push({ label: "Protected gap", value: formatMoveItemAmount(Number(consistency.protectedGapNow)) });
    }
    return rows.slice(0, 5);
  }, [parsed?.consistency]);
  const submittedInvestmentSnapshot = audit?.form?.investmentSnapshot || {};
  const explicitInvestmentValues = {
    roth: parseCurrency(submittedInvestmentSnapshot?.roth ?? audit?.form?.roth),
    brokerage: parseCurrency(submittedInvestmentSnapshot?.brokerage ?? audit?.form?.brokerage),
    k401: parseCurrency(submittedInvestmentSnapshot?.k401Balance ?? audit?.form?.k401Balance),
  };
  const submittedInvestmentKeyList = Array.isArray(audit?.form?.includedInvestmentKeys)
    ? audit.form.includedInvestmentKeys.map((key) => String(key || ""))
    : [];
  const visibleInvestmentKeys = new Set(
    submittedInvestmentKeyList.length > 0
      ? submittedInvestmentKeyList
      : Object.entries(explicitInvestmentValues)
          .filter(([, value]) => value != null && Math.abs(value) > 0)
          .map(([key]) => key)
  );
  const hasSubmittedInvestmentSnapshot =
    submittedInvestmentKeyList.length > 0 ||
    Object.values(explicitInvestmentValues).some((value) => value != null);
  const visibleInvestmentTotal =
    (visibleInvestmentKeys.has("roth") ? explicitInvestmentValues.roth || 0 : 0) +
    (visibleInvestmentKeys.has("brokerage") ? explicitInvestmentValues.brokerage || 0 : 0) +
    (visibleInvestmentKeys.has("k401") ? explicitInvestmentValues.k401 || 0 : 0);
  const parsedInvestmentBalance = parseCurrency(parsed?.investments?.balance) || 0;
  const investmentsSummary =
    parsed?.investments && hasSubmittedInvestmentSnapshot
      ? {
          ...parsed.investments,
          balance: `$${visibleInvestmentTotal.toFixed(2)}`,
          asOf: audit?.form?.date || parsed.investments?.asOf || "N/A",
          netWorth:
            visibleInvestmentTotal > 0 && Math.abs(parsedInvestmentBalance - visibleInvestmentTotal) > 1
              ? undefined
              : parsed.investments?.netWorth,
        }
      : parsed.investments || null;
  const showInvestmentNetWorthAnchor =
    Boolean(investmentsSummary?.netWorth) &&
    !/^-?\$?0(?:\.00)?$/i.test(String(investmentsSummary?.netWorth || "").replace(/\s+/g, ""));
  const degradedInfo = parsed.degraded;
  const isDegraded = degradedInfo?.isDegraded;
  const isLiveCurrentAudit = Boolean(current?.ts && current.ts === audit.ts && !audit.isTest);
  const movePlan = useMemo(
    () => (isLiveCurrentAudit ? buildAuditMovePlan({ audit: current, cards, bankAccounts, financialConfig }) : { activeCount: 0, highlights: [], reconciledCount: 0 }),
    [isLiveCurrentAudit, current, cards, bankAccounts, financialConfig]
  );
  const liveMoveAssignments = (isLiveCurrentAudit ? current?.moveAssignments : audit.moveAssignments) || {};
  const moveAssignmentUi = useMemo(
    () =>
      parsed.moveItems.map((item, index) =>
        getMoveAssignmentOptions({
          move: item,
          cards,
          bankAccounts,
          financialConfig,
          manualOnly: true,
          assignment: liveMoveAssignments[String(index)] || null,
        })
      ),
    [parsed.moveItems, cards, bankAccounts, financialConfig, liveMoveAssignments]
  );
  const analysisNotes = isDegraded
    ? [sections.qualityScore, sections.autoUpdates, degradedInfo?.reason].filter(
        (entry): entry is string => Boolean(entry && entry.trim())
      ).join("\n\n")
    : "";

  const handleExitResults = (): void => {
    if (onBack) return onBack();
    navTo("dashboard");
  };

  return (
    <main
      className="safe-scroll-body safe-bottom page-body"
      aria-label="Audit results"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: "100%",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)",
        ["--page-bottom-clearance" as string]: "calc(env(safe-area-inset-bottom, 0px) + 28px)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 768, display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          paddingBottom: 4,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, minWidth: 0 }}>
          <button
            onClick={handleExitResults}
            aria-label="Back"
            style={{
              width: 46,
              height: 46,
              borderRadius: 16,
              border: `1px solid ${T.border.default}`,
              background: T.bg.glass,
              color: T.text.primary,
              boxShadow: T.shadow.soft,
              flexShrink: 0,
            }}
          >
            <ArrowLeft size={18} strokeWidth={2.4} />
          </button>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: T.accent.primary,
                fontFamily: T.font.mono,
                letterSpacing: "0.08em",
                marginBottom: 4,
              }}
            >
              WEEKLY BRIEFING
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: "clamp(28px, 8vw, 36px)",
                lineHeight: 1.02,
                letterSpacing: "-0.04em",
                color: T.text.primary,
                fontWeight: 900,
              }}
            >
              Full Briefing
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
              <Mono size={11} color={T.text.dim}>
                {fmtDate(audit.date)}
              </Mono>
              {audit.isTest && <Badge variant="amber">TEST · NOT SAVED</Badge>}
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowExportSheet(true)}
          title="Export Audit"
          style={{
            height: 46,
            padding: "0 16px",
            borderRadius: 16,
            border: `1px solid ${T.border.default}`,
            background: T.bg.glass,
            color: T.text.primary,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            boxShadow: T.shadow.soft,
            flexShrink: 0,
            fontSize: 12,
            fontWeight: 800,
            fontFamily: T.font.mono,
          }}
        >
          <Share2 size={15} strokeWidth={2.5} />
          Export
        </button>
      </div>

      {showExportSheet && audit && (
        <AuditExportSheet audit={audit} onClose={() => setShowExportSheet(false)} />
      )}

      {isDegraded && (
        <Card
          style={{
            marginBottom: 14,
            padding: 16,
            border: `1px solid ${T.status.amber}35`,
            background: `linear-gradient(180deg, ${T.status.amberDim} 0%, ${T.bg.card} 100%)`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: T.status.amber, fontFamily: T.font.mono, letterSpacing: "0.06em" }}>
                DEGRADED AUDIT
              </div>
              <h2 style={{ margin: "6px 0 0", fontSize: 18, fontWeight: 800, color: T.text.primary }}>
                Full AI narrative unavailable
              </h2>
            </div>
            <Badge variant="amber">NATIVE FALLBACK</Badge>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: T.text.secondary, lineHeight: 1.6 }}>
            {degradedInfo.reason}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10, marginTop: 14 }}>
            <div style={{ padding: "12px 12px 10px", borderRadius: T.radius.lg, background: T.bg.elevated, border: `1px solid ${T.border.subtle}` }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, letterSpacing: "0.05em" }}>NATIVE SCORE</div>
              <div style={{ marginTop: 5, fontSize: 20, fontWeight: 900, color: T.text.primary }}>
                {parsed.healthScore?.score ?? "—"}
              </div>
            </div>
            <div style={{ padding: "12px 12px 10px", borderRadius: T.radius.lg, background: T.bg.elevated, border: `1px solid ${T.border.subtle}` }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, letterSpacing: "0.05em" }}>SAFETY STATE</div>
              <div style={{ marginTop: 5, fontSize: 16, fontWeight: 800, color: T.text.primary, textTransform: "capitalize" }}>
                {degradedInfo.safetyState.level}
              </div>
            </div>
            <div style={{ padding: "12px 12px 10px", borderRadius: T.radius.lg, background: T.bg.elevated, border: `1px solid ${T.border.subtle}` }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, letterSpacing: "0.05em" }}>TOP RISK FLAGS</div>
              <div style={{ marginTop: 5, fontSize: 12, fontWeight: 700, color: T.text.primary, lineHeight: 1.45 }}>
                {degradedInfo.riskFlags.length > 0 ? degradedInfo.riskFlags.slice(0, 2).join(", ") : "None"}
              </div>
            </div>
          </div>
        </Card>
      )}

      {parsed.moveItems.length > 0 &&
        (() => {
          const done = Object.values(moveChecks).filter(Boolean).length;
          const total = parsed.moveItems.length;
          const pct = Math.round((done / total) * 100);
          const pctColor =
            pct >= 100 ? T.status.green : pct >= 80 ? T.status.green : pct >= 40 ? T.status.amber : T.text.dim;
          const allDone = pct >= 100;
          const circumference = 2 * Math.PI * 16;
          const strokeOffset = circumference - (circumference * pct) / 100;
          return (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: isSmallPhone ? "14px 16px" : "15px 18px",
                background: `linear-gradient(180deg, ${T.bg.card}, ${allDone ? `${T.status.green}10` : `${pctColor}08`})`,
                border: `1px solid ${allDone ? T.status.green : pctColor}22`,
                borderRadius: T.radius.xl,
                marginBottom: 6,
                animation: allDone ? "glowPulse 2s ease-in-out infinite" : "fadeInUp .4s ease-out both",
                position: "relative",
                overflow: "hidden",
                boxShadow: T.shadow.soft,
              }}
            >
              {allDone && (
                <>
                  <span
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 14,
                      fontSize: 16,
                      animation: "floatUp 2s ease-out infinite",
                      opacity: 0.8,
                    }}
                  >
                    ✨
                  </span>
                  <span
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 42,
                      fontSize: 12,
                      animation: "floatUp 2.4s ease-out 0.3s infinite",
                      opacity: 0.6,
                    }}
                  >
                    🎉
                  </span>
                  <span
                    style={{
                      position: "absolute",
                      bottom: 4,
                      right: 28,
                      fontSize: 14,
                      animation: "floatUp 2.8s ease-out 0.6s infinite",
                      opacity: 0.7,
                    }}
                  >
                    ⭐
                  </span>
                </>
              )}
              <svg width="44" height="44" viewBox="0 0 40 40" style={{ flexShrink: 0, transform: "rotate(-90deg)" }}>
                <circle cx="20" cy="20" r="16" fill="none" stroke={T.border.default} strokeWidth="3.5" />
                <circle
                  cx="20"
                  cy="20"
                  r="16"
                  fill="none"
                  stroke={pctColor}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeOffset}
                  style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.4s ease" }}
                />
              </svg>
              <div
                style={{
                  position: "absolute",
                  left: 16,
                  width: 44,
                  height: 44,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 900, color: pctColor, fontFamily: T.font.mono }}>{pct}%</span>
              </div>
              <div style={{ marginLeft: 4 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: T.text.primary }}>
                  {done}/{total} Moves Complete
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: allDone ? T.status.green : T.text.dim,
                    fontWeight: allDone ? 700 : 400,
                  }}
                >
                  {allDone ? "All moves executed! Financial momentum secured 🔥" : `${total - done} remaining — keep crushing it`}
                </div>
              </div>
            </div>
          );
        })()}

      {isLiveCurrentAudit && movePlan.activeCount > 0 && (
        <Card
          style={{
            padding: isSmallPhone ? "12px 14px" : "14px 16px",
            marginTop: 8,
            marginBottom: 8,
            background: `linear-gradient(180deg, ${T.accent.emerald}08, ${T.bg.card})`,
            border: `1px solid ${T.accent.emerald}20`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: T.text.primary }}>
              Checked moves are previewing in Portfolio until balances confirm them
            </div>
            {movePlan.reconciledCount > 0 && (
              <Badge variant="teal">{movePlan.reconciledCount} reflected</Badge>
            )}
          </div>
          <div style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.5, marginBottom: movePlan.highlights.length ? 10 : 0 }}>
            Actual balances remain the source of truth. The preview layer only fills the gap between your completed moves and the next real sync or manual edit.
          </div>
          {movePlan.highlights.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {movePlan.highlights.map((highlight) => (
                <div
                  key={`${highlight.label}-${highlight.delta}`}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: `${highlight.delta < 0 ? T.status.red : T.accent.emerald}10`,
                    border: `1px solid ${highlight.delta < 0 ? T.status.red : T.accent.emerald}18`,
                    color: highlight.delta < 0 ? T.status.red : T.accent.emerald,
                    fontSize: 10,
                    fontWeight: 800,
                    fontFamily: T.font.mono,
                  }}
                >
                  {highlight.label} {highlight.delta < 0 ? "" : "+"}{Number(highlight.delta || 0).toLocaleString(undefined, { style: "currency", currency: "USD" })}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card
        className="slide-up"
        style={{
          padding: isSmallPhone ? "14px 16px 18px" : "18px 22px 22px",
          marginTop: 6,
          background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.surface})`,
          border: `1px solid ${T.border.default}`,
          boxShadow: `0 12px 40px ${T.shadow.base}`,
        }}
      >
        {sections.alerts && !/^\s*(no\s*alerts|omit|none|\[\])\s*$/i.test(sections.alerts) && sections.alerts.length > 5 && (
          <div
            style={{
              padding: isSmallPhone ? "16px 16px" : "20px 24px",
              margin: isSmallPhone ? "18px -2px" : "24px -4px",
              borderRadius: T.radius.lg,
              background: T.status.amberDim,
              borderLeft: `4px solid ${T.status.amber}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: `${T.status.amber}20`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AlertTriangle size={16} color={T.status.amber} strokeWidth={2.5} />
              </div>
              <span style={{ fontSize: "clamp(15px, 4.5vw, 16px)", fontWeight: 800, color: T.status.amber }}>Critical Alerts</span>
            </div>
            <Md text={sections.alerts} />
          </div>
        )}

        {sections.nextAction && (
          <section aria-labelledby="results-next-action" style={{ padding: "4px 0 22px", borderBottom: `1px solid ${T.border.subtle}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: T.accent.primaryDim,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Zap size={16} color={T.accent.primary} strokeWidth={2.5} />
              </div>
                <h2 id="results-next-action" style={{ fontSize: "clamp(16px, 4.6vw, 18px)", fontWeight: 800, color: T.accent.primary, margin: 0, letterSpacing: "-0.01em" }}>Immediate Next Action</h2>
              </div>
            <div
              style={{
                padding: isSmallPhone ? "16px" : "18px 20px",
                borderRadius: T.radius.lg,
                background: `linear-gradient(180deg, ${T.accent.primary}12, ${T.bg.elevated})`,
                border: `1px solid ${T.accent.primary}18`,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.03)`,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {nextActionCard?.title ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.02em" }}>
                    {nextActionCard.title}
                  </div>
                  {nextActionCard.amount ? (
                    <div
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        background: `${T.accent.primary}14`,
                        border: `1px solid ${T.accent.primary}24`,
                        color: T.accent.primary,
                        fontSize: 11,
                        fontWeight: 900,
                        fontFamily: T.font.mono,
                        letterSpacing: "0.03em",
                      }}
                    >
                      {nextActionCard.amount}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {nextActionLead ? (
                <div style={{ fontSize: 13, lineHeight: 1.65, color: T.text.secondary }}>
                  {stripPaycheckParens(nextActionLead)}
                </div>
              ) : null}
              {allocationLedger.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isSmallPhone ? "1fr 1fr" : "repeat(auto-fit, minmax(120px, 1fr))",
                    gap: 8,
                  }}
                >
                  {allocationLedger.map((entry) => (
                    <div
                      key={entry.label}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 14,
                        background: `${T.bg.card}92`,
                        border: `1px solid ${T.border.subtle}`,
                        minWidth: 0,
                      }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                        {entry.label}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 14, fontWeight: 800, color: T.text.primary, fontFamily: T.font.mono }}>
                        {entry.value}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {nextActionAllocationRows.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gap: 10,
                    paddingTop: 6,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: T.text.dim,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    {(nextActionCard?.amount && nextActionCard.amount !== "$0.00") ? "This Week's Allocation" : "Protected Need Queue"}
                  </div>
                  {nextActionAllocationRows.map((row) => (
                    <div
                      key={`${row.label}-${row.date}-${row.amount}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: isSmallPhone ? "1fr auto" : "minmax(0, 1fr) auto",
                        gap: 10,
                        alignItems: "start",
                        padding: isSmallPhone ? "10px 12px" : "11px 14px",
                        borderRadius: 14,
                        background: `${T.bg.card}88`,
                        border: `1px solid ${T.border.subtle}`,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12.5,
                            fontWeight: 700,
                            color: T.text.primary,
                            lineHeight: 1.4,
                          }}
                        >
                          {row.label}
                        </div>
                        <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
                          {row.route ? (
                            <div style={{ fontSize: 10.5, color: T.accent.primary, fontFamily: T.font.mono, fontWeight: 800 }}>
                              {row.route}
                            </div>
                          ) : null}
                          <div style={{ fontSize: 10.5, color: T.text.dim, lineHeight: 1.45 }}>
                            {row.date ? `Due ${row.date}` : row.detail}
                          </div>
                        </div>
                      </div>
                      <div
                        style={{
                          padding: "5px 9px",
                          borderRadius: 999,
                          background: `${T.accent.primary}12`,
                          border: `1px solid ${T.accent.primary}20`,
                          color: T.accent.primary,
                          fontSize: 10.5,
                          fontWeight: 900,
                          fontFamily: T.font.mono,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.amount}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, lineHeight: 1.65, color: T.text.secondary }}>
                  {nextActionCard?.detail ? stripPaycheckParens(nextActionCard.detail) : <Md text={stripPaycheckParens(sections.nextAction)} />}
                </div>
              )}
            </div>
          </section>
        )}

        <ReportSection
          title="Executive Summary"
          icon={Activity}
          content={sections.dashboard}
          accentColor={T.accent.primary}
          badge={<Badge variant="teal">STATE OF THE UNION</Badge>}
        />
        {parsed.moveItems.length > 0 && (
          <section aria-labelledby="results-playbook" style={{ padding: "22px 0", borderBottom: `1px solid ${T.border.subtle}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    background: T.accent.primaryDim,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <CheckSquare size={16} color={T.accent.primary} strokeWidth={2.5} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <h2 id="results-playbook" style={{ fontSize: "clamp(17px, 4.8vw, 20px)", fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>Tactical Playbook</h2>
                  <div style={{ fontSize: 11, color: T.text.dim, fontWeight: 700, letterSpacing: "0.02em" }}>
                    Execute in this order
                  </div>
                </div>
              </div>
              <Mono size={12} color={T.text.dim}>
                {Object.values(moveChecks).filter(Boolean).length}/{parsed.moveItems.length} Complete
              </Mono>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {parsed.moveItems.map((moveItem: ParsedMoveItem, index: number) => (
                <MoveRow
                  key={index}
                  item={moveItem}
                  index={index}
                  checked={moveChecks[index] || false}
                  onToggle={() => onToggleMove(index)}
                  detail={
                    (() => {
                      const assignmentUi = moveAssignmentUi[index] || { classification: null, targetOptions: [], sourceOptions: [] };
                      const moveKey = String(index);
                      const assignment = liveMoveAssignments[moveKey] || {};
                      const alreadyApplied = Boolean(isLiveCurrentAudit && current?.appliedMoveEffects?.[moveKey]);
                      const hasTargetChoice = assignmentUi.targetOptions.length > 1;
                      const hasSourceChoice = assignmentUi.sourceOptions.length > 1;
                      if (!isLiveCurrentAudit || !onUpdateMoveAssignment || (!hasTargetChoice && !hasSourceChoice && !alreadyApplied)) {
                        return alreadyApplied ? (
                          <div style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono }}>
                            Manual balances already applied using the saved account routing.
                          </div>
                        ) : null;
                      }
                      const selectStyle: React.CSSProperties = {
                        minWidth: 0,
                        flex: 1,
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: `1px solid ${T.border.default}`,
                        background: T.bg.card,
                        color: T.text.primary,
                        fontSize: 11,
                        fontWeight: 700,
                      };
                      return (
                        <div
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                          }}
                        >
                          {hasSourceChoice ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              <span style={{ fontSize: 10, color: T.text.dim, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                                Funds From
                              </span>
                              <select
                                disabled={alreadyApplied}
                                value={assignment.sourceAccountId || ""}
                                onChange={(event) => onUpdateMoveAssignment(index, { sourceAccountId: event.target.value || null })}
                                style={selectStyle}
                              >
                                <option value="">Choose account</option>
                                {assignmentUi.sourceOptions.map((option) => (
                                  <option key={option.id} value={option.id}>{option.label}</option>
                                ))}
                              </select>
                            </div>
                          ) : null}
                          {hasTargetChoice ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              <span style={{ fontSize: 10, color: T.text.dim, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                                Apply To
                              </span>
                              <select
                                disabled={alreadyApplied}
                                value={assignment.targetAccountId || ""}
                                onChange={(event) => onUpdateMoveAssignment(index, { targetAccountId: event.target.value || null })}
                                style={selectStyle}
                              >
                                <option value="">Choose account</option>
                                {assignmentUi.targetOptions.map((option) => (
                                  <option key={option.id} value={option.id}>{option.label}</option>
                                ))}
                              </select>
                            </div>
                          ) : null}
                          {alreadyApplied ? (
                            <div style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono }}>
                              Already posted to manual balances.
                            </div>
                          ) : null}
                        </div>
                      );
                    })()
                  }
                />
              ))}
            </div>
          </section>
        )}

        <ReportSection title="Radar — 90 Days" icon={Target} content={sections.radar} accentColor={T.status.amber} />
        <ReportSection title="Long-Range Radar" icon={Clock} content={sections.longRange} accentColor={T.text.secondary} />
        <ReportSection title="Forward Radar" icon={TrendingUp} content={sections.forwardRadar} accentColor={T.status.blue} />
        {investmentsSummary ? (
          <section aria-labelledby="results-investments" style={{ padding: "22px 0 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: `${T.accent.primary}15`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <TrendingUp size={16} color={T.accent.primary} strokeWidth={2.5} />
              </div>
              <h2 id="results-investments" style={{ fontSize: "clamp(17px, 4.8vw, 20px)", fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
                Investments & Roth
              </h2>
            </div>
            <div
              style={{
                padding: isSmallPhone ? "16px" : "18px 20px",
                borderRadius: T.radius.lg,
                background: /guard|hold|closed/i.test(investmentsSummary.gateStatus || "")
                  ? `linear-gradient(180deg, ${T.status.amber}10, ${T.bg.card})`
                  : /open/i.test(investmentsSummary.gateStatus || "")
                    ? `linear-gradient(180deg, ${T.status.green}10, ${T.bg.card})`
                    : `linear-gradient(180deg, ${T.bg.elevated}, ${T.bg.card})`,
                border: `1px solid ${
                  /guard|hold|closed/i.test(investmentsSummary.gateStatus || "")
                    ? `${T.status.amber}22`
                    : /open/i.test(investmentsSummary.gateStatus || "")
                      ? `${T.status.green}20`
                      : T.border.default
                }`,
                display: "grid",
                gap: 14,
              }}
            >
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Balance
                </div>
                <div style={{ fontSize: "clamp(24px, 7vw, 30px)", fontWeight: 900, letterSpacing: "-0.03em", color: T.text.primary }}>
                  {investmentsSummary.balance || "N/A"}
                </div>
                {showInvestmentNetWorthAnchor ? (
                  <div style={{ fontSize: 11, color: T.text.secondary }}>
                    Net worth anchor {investmentsSummary.netWorth}
                  </div>
                ) : null}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isSmallPhone ? "1fr" : "minmax(0,1fr) minmax(0,1fr)", gap: 10 }}>
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: 14,
                    background: `${T.bg.card}88`,
                    border: `1px solid ${T.border.subtle}`,
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
                    As Of
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: T.text.primary }}>
                    {investmentsSummary.asOf || "N/A"}
                  </div>
                </div>
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: 14,
                    background: `${T.bg.card}88`,
                    border: `1px solid ${T.border.subtle}`,
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
                    Gate
                  </div>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "7px 10px",
                      borderRadius: 999,
                      background: /open/i.test(investmentsSummary.gateStatus || "")
                        ? `${T.status.green}12`
                        : /guard|hold|closed/i.test(investmentsSummary.gateStatus || "")
                          ? `${T.status.amber}14`
                          : `${T.accent.primary}12`,
                      border: `1px solid ${
                        /open/i.test(investmentsSummary.gateStatus || "")
                          ? `${T.status.green}22`
                          : /guard|hold|closed/i.test(investmentsSummary.gateStatus || "")
                            ? `${T.status.amber}24`
                            : `${T.accent.primary}18`
                      }`,
                      color: /open/i.test(investmentsSummary.gateStatus || "")
                        ? T.status.green
                        : /guard|hold|closed/i.test(investmentsSummary.gateStatus || "")
                          ? T.status.amber
                          : T.accent.primary,
                      fontSize: 11,
                      fontWeight: 900,
                      fontFamily: T.font.mono,
                      letterSpacing: "0.03em",
                    }}
                  >
                    {investmentsSummary.gateStatus || "N/A"}
                  </div>
                </div>
              </div>

              {/guard|hold|closed/i.test(investmentsSummary.gateStatus || "") ? (
                <div style={{ fontSize: 12, lineHeight: 1.6, color: T.text.secondary }}>
                  Investing stays on hold until debt and near-term cash obligations are protected.
                </div>
              ) : /open/i.test(investmentsSummary.gateStatus || "") ? (
                <div style={{ fontSize: 12, lineHeight: 1.6, color: T.text.secondary }}>
                  Contributions can resume once cash coverage and debt gates stay clear.
                </div>
              ) : null}
            </div>
          </section>
        ) : (
          <ReportSection
            title="Investments & Roth"
            icon={TrendingUp}
            content={sections.investments}
            accentColor={T.accent.primary}
            isLast={true}
          />
        )}
      </Card>

      <Card
        className="slide-up"
        style={{
          animationDelay: "0.35s",
          background: `linear-gradient(135deg, ${T.status.green}08, ${T.status.blue}06)`,
          borderColor: `${T.status.green}18`,
          padding: isSmallPhone ? "14px 14px 12px" : "16px 16px 14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: `${T.status.green}15`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Target size={14} color={T.status.green} strokeWidth={2.5} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 800, color: T.text.primary, letterSpacing: "0.03em", textTransform: "uppercase" }}>Freedom Journey</span>
        </div>

        {(() => {
          const realAudits = history.filter((item: AuditRecord) => !item.isTest && item.form);
          if (realAudits.length < 2)
            return (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "12px 0" }}>
                <div style={{ fontSize: 28 }}>🌱</div>
                <p style={{ fontSize: 12, color: T.text.dim, textAlign: "center", lineHeight: 1.5 }}>
                  Complete <strong style={{ color: T.text.secondary }}>2+ weekly audits</strong> to unlock your Freedom Journey — tracking momentum, projected debt-free dates, and net worth trajectory.
                </p>
              </div>
            );

          const latest = realAudits[0];
          const prev = realAudits[1];
          const parts: ReactNode[] = [];
          if (!latest || !prev) {
            return <p style={{ fontSize: 11, color: T.text.dim }}>Not enough varied data to compute momentum yet.</p>;
          }

          const debtValues = realAudits
            .slice(0, 4)
            .map((item: AuditRecord) => (item.form?.debts || []).reduce((sum, debt) => sum + (parseFloat(String(debt.balance)) || 0), 0))
            .reverse();
          const firstDebtValue = debtValues[0];
          const lastDebtValue = debtValues[debtValues.length - 1];
          if (debtValues.length >= 2 && firstDebtValue !== undefined && lastDebtValue !== undefined && firstDebtValue > 100) {
            const weeklyPaydown = (firstDebtValue - lastDebtValue) / (debtValues.length - 1);
            if (weeklyPaydown > 10) {
              const freeDate = new Date();
              freeDate.setDate(freeDate.getDate() + Math.ceil(lastDebtValue / weeklyPaydown) * 7);
              parts.push(
                <div key="df" style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ color: T.text.secondary, fontSize: 11 }}>Projected Debt-Free:</span>
                  <span style={{ color: T.status.green, fontSize: 11, fontWeight: 700 }}>
                    {freeDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                  </span>
                </div>
              );
            }
          }

          const latestNetWorth = latest.parsed?.netWorth;
          const previousNetWorth = prev.parsed?.netWorth;
          if (latestNetWorth != null && previousNetWorth != null) {
            const delta = latestNetWorth - previousNetWorth;
            const up = delta >= 0;
            parts.push(
              <div key="nw" style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: T.text.secondary, fontSize: 11 }}>Net Worth vs Last Audit:</span>
                <span style={{ color: up ? T.status.green : T.status.red, fontSize: 11, fontWeight: 700 }}>
                  {up ? "+" : "-"}${Math.abs(delta).toLocaleString()}
                </span>
              </div>
            );
          }

          const latestScore = latest.parsed?.healthScore?.score;
          const previousScore = prev.parsed?.healthScore?.score;
          if (latestScore != null && previousScore != null && Math.abs(latestScore - previousScore) >= 2) {
            const latestForm = latest.form;
            const previousForm = prev.form;
            const factors: Array<{ name: string; delta: number }> = [];
            const latestChecking = parseFloat(String(latestForm.checking)) || 0;
            const previousChecking = parseFloat(String(previousForm.checking)) || 0;
            if (Math.abs(latestChecking - previousChecking) > 100) {
              factors.push({ name: "Cash Flow", delta: latestChecking - previousChecking });
            }
            const latestDebt = (latestForm.debts || []).reduce((sum, debt) => sum + (parseFloat(String(debt.balance)) || 0), 0);
            const previousDebt = (previousForm.debts || []).reduce((sum, debt) => sum + (parseFloat(String(debt.balance)) || 0), 0);
            if (Math.abs(latestDebt - previousDebt) > 50) {
              factors.push({ name: "Debt Paydown", delta: previousDebt - latestDebt });
            }
            const latestSavings = parseFloat(String(latestForm.ally || latestForm.savings)) || 0;
            const previousSavings = parseFloat(String(previousForm.ally || previousForm.savings)) || 0;
            if (Math.abs(latestSavings - previousSavings) > 50) {
              factors.push({ name: "Savings Growth", delta: latestSavings - previousSavings });
            }

            if (factors.length > 0) {
              const biggest = [...factors].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
              if (biggest) {
                const diff = latestScore - previousScore;
                parts.push(
                  <div key="sf" style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: T.text.secondary, fontSize: 11 }}>
                      Score Movement ({diff > 0 ? "+" : ""}
                      {diff}):
                    </span>
                    <span style={{ color: diff > 0 ? T.accent.emerald : T.status.amber, fontSize: 11, fontWeight: 700 }}>
                      Driven by {biggest.name}
                    </span>
                  </div>
                );
              }
            }
          }

          return parts.length > 0 ? parts : <p style={{ fontSize: 11, color: T.text.dim }}>Not enough varied data to compute momentum yet.</p>;
        })()}
      </Card>

      <Card className="slide-up" style={{ animationDelay: "0.38s", background: T.bg.elevated, padding: isSmallPhone ? "14px" : undefined }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: `${T.status.blue}15`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Activity size={14} color={T.status.blue} strokeWidth={2.5} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 800, color: T.text.primary, letterSpacing: "0.03em", textTransform: "uppercase" }}>How the Math Works</span>
        </div>
        <div
          style={{
            fontSize: 11,
            color: T.text.secondary,
            lineHeight: 1.55,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <p>
            <strong>
              1. <InlineTooltip>Floor</InlineTooltip> Protection:
            </strong>{" "}
            We subtract your global floor and buffers from your checking balance to find your <em><InlineTooltip term="Available">Available Capital</InlineTooltip></em>.
          </p>
          <p>
            <strong>2. Time-Critical Bills:</strong> We scan radar for bills due before your next payday and reserve those funds immediately.
          </p>
          <p>
            <strong>3. Minimums & Transfers:</strong> Minimum debt payments and active savings goals (vaults/<InlineTooltip term="Sinking fund">sinking funds</InlineTooltip>) are funded next.
          </p>
          <p>
            <strong>4. Debt Target Selection:</strong> If you have <em>Surplus Capital</em> left over, we analyze ALL your card APRs and balances to find the mathematically perfect target (highest APR avalanche, or lowest balance snowball if configured).
          </p>
          <p>
            <strong>5. Surplus Allocation:</strong> We apply the surplus to the selected target debt to accelerate payoff, dynamically calculating the updated timeline. If configured, we can optimize for a <em><InlineTooltip>Promo sprint</InlineTooltip></em>.
          </p>
        </div>
      </Card>

      {isDegraded && analysisNotes && (
        <Card style={{ marginTop: 14, background: T.bg.elevated }}>
          <ReportSection
            title="Audit Notes"
            icon={CheckCircle}
            content={analysisNotes}
            accentColor={T.status.green}
            isLast={true}
            badge={<Badge variant="amber">Fallback</Badge>}
          />
        </Card>
      )}

      <div
        style={{
          marginTop: 10,
          padding: isSmallPhone ? "12px 14px" : "14px 16px",
          borderRadius: T.radius.md,
          background: `${T.bg.elevated}80`,
          border: `1px solid ${T.border.subtle}`,
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>⚖️</span>
        <p style={{ fontSize: 10, color: T.text.muted, lineHeight: 1.6, margin: 0 }}>
          <strong style={{ color: T.text.dim }}>AI Disclaimer:</strong> This analysis is educational and informational. It is <strong>not</strong> financial, tax, legal, or investment advice. Use it to frame decisions, then confirm major moves with a licensed professional.
        </p>
      </div>
      </div>
    </main>
  );
});
