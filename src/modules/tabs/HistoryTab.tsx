  import {
    lazy,
    memo,
    Suspense,
    useEffect,
    useState,
    type ChangeEvent,
    type CSSProperties,
    type MouseEvent,
    type ReactNode,
  } from "react";
  import { EmptyState as UIEmptyState,Mono as UIMono } from "../components.js";
  import { T } from "../constants.js";
  import { haptic } from "../haptics.js";
  import { Calendar,CheckCircle,Download,Edit3,Filter,Plus,Trash2,TrendingUp,type LucideIcon } from "../icons";
  import { shouldShowGating } from "../subscription.js";
  import { Badge as UIBadge,Card as UICard } from "../ui.js";
  import { fmt,fmtDate } from "../utils.js";
  import AuditExportSheet from "./AuditExportSheet.js";
  import ProBannerBase from "./ProBanner.js";

  import type { AuditFormDebt,AuditFormInvestment,AuditRecord } from "../../types/index.js";
  import { useAudit } from "../contexts/AuditContext.js";
  import { useNavigation } from "../contexts/NavigationContext.js";

const LazyProPaywall = lazy(() => import("./ProPaywall.js"));

type AuditStatusFilter = "GREEN" | "YELLOW" | "RED" | null;

interface ToastApi {
  error: (message: string) => void;
}

interface HistoryTabProps {
  toast: ToastApi;
  proEnabled?: boolean;
  themeTick?: number;
}

interface NavigationApi {
  tab?: string;
  navTo: (tab: string, viewState?: AuditRecord | null) => void;
  setResultsBackTarget?: ((target: string | null) => void) | undefined;
}

interface CardProps {
  children?: ReactNode;
  style?: CSSProperties;
  onClick?: (() => void) | undefined;
  animate?: boolean;
  delay?: number;
}

interface BadgeProps {
  children?: ReactNode;
  variant?: string;
  style?: CSSProperties;
}

interface MonoProps {
  children?: ReactNode;
  size?: number;
  color?: string;
  weight?: number;
  style?: CSSProperties;
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  message: string;
}

interface ProBannerProps {
  onUpgrade: () => void;
  label: string;
  sublabel?: string;
}

interface ProPaywallProps {
  onClose: () => void;
  source?: string;
}

const Card = UICard as unknown as (props: CardProps) => ReactNode;
const Badge = UIBadge as unknown as (props: BadgeProps) => ReactNode;
const Mono = UIMono as unknown as (props: MonoProps) => ReactNode;
const EmptyState = UIEmptyState as unknown as (props: EmptyStateProps) => ReactNode;
const ProBanner = ProBannerBase as unknown as (props: ProBannerProps) => ReactNode;
const TypedLazyProPaywall = LazyProPaywall as unknown as (props: ProPaywallProps) => ReactNode;

const relativeTime = (dateValue: string | null | undefined): string => {
  if (!dateValue) return "";
  const now = Date.now();
  const then = new Date(dateValue).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
};

const getMonthKey = (dateValue: string | null | undefined): string => {
  if (!dateValue) return "Unknown";
  const dt = new Date(dateValue);
  return dt.toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

const getAuditColor = (audit: AuditRecord): Exclude<AuditStatusFilter, null> | "UNKNOWN" => {
  const rawStatus = audit.parsed?.status || "UNKNOWN";
  const match = rawStatus.match(/^(GREEN|YELLOW|RED)/i);
  const matchedStatus = match?.[1];
  return match
    ? (matchedStatus?.toUpperCase() as Exclude<AuditStatusFilter, null>)
    : rawStatus.toUpperCase().includes("GREEN")
      ? "GREEN"
      : rawStatus.toUpperCase().includes("YELLOW")
        ? "YELLOW"
        : rawStatus.toUpperCase().includes("RED")
          ? "RED"
          : "UNKNOWN";
};

import { getGradeLetter } from "../mathHelpers.js";

const getDebtAmount = (debt: AuditFormDebt): number => {
  const rawAmount = debt.amount ?? debt.balance;
  return parseFloat(String(rawAmount)) || 0;
};

const getInvestmentAmount = (investment: AuditFormInvestment): number => parseFloat(String(investment.amount)) || 0;

const STATUS_FILTERS: AuditStatusFilter[] = [null, "GREEN", "YELLOW", "RED"];

const HistoryOverviewCard = ({ audits }: { audits: AuditRecord[] }) => {
  if (audits.length === 0) return null;

  const scoredAudits = audits.filter(a => a?.parsed?.healthScore?.score != null).slice(0, 8);
  const scores = scoredAudits.map(a => a.parsed?.healthScore?.score as number).reverse();
  const latestScoredAudit = scoredAudits[0] || null;
  const latestScore = latestScoredAudit?.parsed?.healthScore?.score ?? null;
  const previousScore = scoredAudits[1]?.parsed?.healthScore?.score ?? null;
  const latestGrade = latestScore != null ? getGradeLetter(latestScore) : null;
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null;
  const delta = latestScore != null && previousScore != null ? latestScore - previousScore : null;
  const trendColor = delta == null ? T.accent.primary : delta >= 0 ? T.status.green : T.status.red;
  const W = 280;
  const H = 60;
  const PX = 8;
  const PY = 8;
  const min = scores.length > 0 ? Math.min(...scores) - 5 : 0;
  const max = scores.length > 0 ? Math.max(...scores) + 5 : 1;
  const range = max - min || 1;
  const pts = scores.map((score, index) => ({
    x: scores.length === 1 ? W / 2 : PX + (index / (scores.length - 1)) * (W - PX * 2),
    y: PY + (1 - (score - min) / range) * (H - PY * 2),
  }));
  const d = pts.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  const firstPoint = pts[0] ?? null;
  const lastPoint = pts[pts.length - 1] ?? null;

  return (
    <Card
      style={{
        marginBottom: 16,
        padding: "16px",
        position: "relative",
        overflow: "hidden",
        background: `linear-gradient(180deg, ${T.bg.card}, ${trendColor}08)`,
        borderColor: `${trendColor}28`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at top right, ${trendColor}14 0%, transparent 42%)`,
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <TrendingUp size={13} color={trendColor} strokeWidth={2.5} />
              <span style={{ fontSize: 11, fontWeight: 800, color: T.text.secondary, fontFamily: T.font.mono, letterSpacing: "0.04em" }}>
                HEALTH TREND
              </span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: T.text.primary, letterSpacing: "-0.03em" }}>
              {latestScore != null ? `${latestGrade} · ${latestScore}` : "Trend pending"}
            </div>
            <div style={{ marginTop: 4, fontSize: 11, color: T.text.secondary, lineHeight: 1.45 }}>
              {delta == null
                ? "Run one more scored audit to unlock movement."
                : `${delta >= 0 ? "Up" : "Down"} ${Math.abs(delta)} point${Math.abs(delta) === 1 ? "" : "s"} from the prior audit.`}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4, flexShrink: 0 }}>
            <span style={{ fontSize: 16, fontWeight: 900, color: trendColor, fontFamily: T.font.mono }}>
              {delta == null ? "NEW" : `${delta >= 0 ? "+" : ""}${delta}`}
            </span>
            <span style={{ fontSize: 10, color: T.text.dim }}>vs last</span>
          </div>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <div
            style={{
              padding: "10px 10px 8px",
              borderRadius: T.radius.lg,
              background: `${T.bg.elevated}B8`,
              border: `1px solid ${T.border.subtle}`,
              minHeight: 92,
            }}
          >
            {scores.length > 1 && firstPoint && lastPoint ? (
              <>
                <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
                  <defs>
                    <linearGradient id="historyTrendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={trendColor} stopOpacity="0.2" />
                      <stop offset="100%" stopColor={trendColor} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={`${d} L${lastPoint.x},${H} L${firstPoint.x},${H} Z`} fill="url(#historyTrendGrad)" />
                  <path d={d} fill="none" stroke={trendColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  {pts.map((point, index) => (
                    <circle key={index} cx={point.x} cy={point.y} r={index === pts.length - 1 ? 3.5 : 0} fill={trendColor} />
                  ))}
                </svg>
                <div style={{ marginTop: 6, fontSize: 10, color: T.text.dim, fontFamily: T.font.mono }}>
                  Last {scores.length} scored audits
                </div>
              </>
            ) : (
              <div style={{ display: "flex", height: "100%", minHeight: 74, alignItems: "center", justifyContent: "center", textAlign: "center", color: T.text.secondary, fontSize: 11, lineHeight: 1.45 }}>
                One more scored audit will draw the chart.
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            {[
            {
              label: "Latest",
              value: latestScore != null ? `${latestScore}` : "—",
              note: latestScoredAudit ? relativeTime(latestScoredAudit.date || latestScoredAudit.ts) : "No score yet",
            },
            {
              label: "Average",
              value: avgScore != null ? `${avgScore}` : "—",
              note: scores.length > 0 ? `${scores.length} scored audits` : "Waiting for scores",
            },
            {
              label: "Archive",
              value: `${audits.length}`,
              note: "audits stored",
            },
            ].map(stat => (
              <div
                key={stat.label}
                style={{
                  padding: "10px 10px 9px",
                  borderRadius: T.radius.lg,
                  background: `${T.bg.elevated}A8`,
                  border: `1px solid ${T.border.subtle}`,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  minHeight: 82,
                }}
              >
                <span style={{ fontSize: 9, fontWeight: 800, color: T.text.dim, fontFamily: T.font.mono, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  {stat.label}
                </span>
                <span style={{ fontSize: 21, fontWeight: 900, color: T.text.primary, letterSpacing: "-0.03em" }}>
                  {stat.value}
                </span>
                <span style={{ fontSize: 10, color: T.text.secondary, lineHeight: 1.3 }}>
                  {stat.note}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default memo(function HistoryTab({ toast, proEnabled = false, themeTick: _themeTick = 0 }: HistoryTabProps) {
  void _themeTick;
  const { history: audits, deleteHistoryItem: onDelete, handleManualImport } = useAudit();
  const { tab, navTo, setResultsBackTarget } = useNavigation() as NavigationApi;

  useEffect(() => {
    if (tab === "history" && audits.length === 0) {
      navTo("audit");
    }
  }, [audits.length, navTo, tab]);

  const onSelect = (audit: AuditRecord): void => {
    if (setResultsBackTarget) setResultsBackTarget("history");
    navTo("results", audit);
  };

  const [sel, setSel] = useState<Set<number>>(new Set());
  const [selMode, setSelMode] = useState<boolean>(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [showManualPaste, setShowManualPaste] = useState<boolean>(false);
  const [manualPasteText, setManualPasteText] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<AuditStatusFilter>(null);
  const [showPaywall, setShowPaywall] = useState<boolean>(false);
  const [exportAuditRecord, setExportAuditRecord] = useState<AuditRecord | null>(null);

  const filteredAudits = statusFilter ? audits.filter((audit) => getAuditColor(audit) === statusFilter) : audits;
  const allSel = sel.size === filteredAudits.length && filteredAudits.length > 0;

  const toggle = (index: number): void => {
    const next = new Set(sel);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSel(next);
  };

  const toggleAll = (): void => {
    setSel(allSel ? new Set<number>() : new Set(filteredAudits.map((_, index) => index)));
  };

  const exitSel = (): void => {
    setSelMode(false);
    setSel(new Set<number>());
  };

  const doExportSel = async (): Promise<void> => {
    try {
      const { exportSelectedAudits } = await import("../auditExports.js");
      await exportSelectedAudits(filteredAudits.filter((_, index) => sel.has(index)));
      exitSel();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    }
  };
  const handleExportCsv = async (): Promise<void> => {
    try {
      const { exportAuditCSV } = await import("../auditExports.js");
      await exportAuditCSV(audits);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    }
  };
  const handleExportJson = async (): Promise<void> => {
    try {
      const { exportAllAudits } = await import("../auditExports.js");
      await exportAllAudits(audits);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    }
  };

  return (
    <div className="page-body" style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <div style={{ width: "100%", maxWidth: 768, display: "flex", flexDirection: "column" }}>
        {shouldShowGating() && !proEnabled && (
          <ProBanner
            onUpgrade={() => setShowPaywall(true)}
            label="Showing last 12 audits"
            sublabel="Upgrade to Pro for full history"
          />
        )}
        {showPaywall && (
          <Suspense fallback={null}>
            <TypedLazyProPaywall onClose={() => setShowPaywall(false)} source="history" />
          </Suspense>
        )}
        {exportAuditRecord && (
          <AuditExportSheet audit={exportAuditRecord} onClose={() => setExportAuditRecord(null)} toast={toast} />
        )}
        <div style={{ paddingTop: 6, paddingBottom: 10 }}>
          <button
            onClick={() => navTo("dashboard")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 14px",
              marginBottom: 12,
              background: T.bg.elevated,
              border: `1px solid ${T.border.default}`,
              borderRadius: 99,
              color: T.accent.primary,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              transition: "all .2s ease",
            }}
          >
            ← Back
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Audit History</h1>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: T.text.secondary, lineHeight: 1.55, maxWidth: 460 }}>
            Track how your financial health is changing over time, keep the useful reports, and prune the noise.
          </p>
          <Mono size={11} color={T.text.dim} style={{ display: "block", marginTop: 6 }}>
            {audits.length} audits stored
          </Mono>
        </div>

        <HistoryOverviewCard audits={audits} />

        <Card style={{ marginBottom: 16, padding: "16px", background: T.bg.elevated }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: T.text.secondary, fontFamily: T.font.mono, letterSpacing: "0.04em" }}>
                ARCHIVE TOOLS
              </div>
              <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700, color: T.text.primary }}>
                Export, filter, and import audit results
              </div>
            </div>
            {audits.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {selMode && sel.size > 0 && (
                  <button
                    onClick={() => void doExportSel()}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                      padding: "7px 12px",
                      borderRadius: T.radius.md,
                      border: `1px solid ${T.accent.primary}40`,
                      background: T.accent.primaryDim,
                      color: T.accent.primary,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: T.font.mono,
                      transition: "all .2s ease",
                    }}
                  >
                    <Download size={10} />
                    EXPORT {sel.size}
                  </button>
                )}
                <button
                  onClick={() => {
                    setSelMode(!selMode);
                    setSel(new Set<number>());
                  }}
                  style={{
                    padding: "7px 12px",
                    borderRadius: T.radius.md,
                    border: `1px solid ${T.border.default}`,
                    background: T.bg.card,
                    color: selMode ? T.accent.primary : T.text.dim,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: T.font.mono,
                    transition: "all .2s ease",
                  }}
                >
                  {selMode ? "CANCEL" : "SELECT"}
                </button>
                <button
                  onClick={() => void handleExportCsv()}
                  title="Export CSV"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: T.radius.sm,
                    border: `1px solid ${T.border.default}`,
                    background: T.bg.card,
                    color: T.text.dim,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 8,
                    fontWeight: 700,
                    fontFamily: T.font.mono,
                    transition: "all .2s ease",
                  }}
                >
                  CSV
                </button>
                <button
                  onClick={() => void handleExportJson()}
                  title="Export All JSON"
                  style={{
                    padding: "7px 12px",
                    borderRadius: T.radius.md,
                    border: `1px solid ${T.border.default}`,
                    background: T.bg.card,
                    color: T.text.dim,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: T.font.mono,
                    transition: "all .2s ease",
                  }}
                >
                  JSON
                </button>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: showManualPaste ? 10 : 0 }}>
            <button
              onClick={async () => {
                try {
                  const txt = await navigator.clipboard.readText();
                  if (!txt || txt.trim() === "") throw new Error("Empty clipboard");
                  void handleManualImport(txt);
                } catch {
                  toast.error("Could not auto-read clipboard. Please paste manually.");
                  setShowManualPaste(true);
                }
              }}
              style={{
                flex: 1,
                padding: "14px",
                borderRadius: T.radius.lg,
                border: `1px dashed ${T.accent.emerald}60`,
                background: `${T.accent.emerald}08`,
                color: T.accent.emerald,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                transition: "all .2s ease",
              }}
            >
              <Plus size={16} strokeWidth={2.5} /> Paste & Import AI Result
            </button>
            <button
              onClick={() => setShowManualPaste(!showManualPaste)}
              style={{
                width: 54,
                borderRadius: T.radius.lg,
                border: `1px solid ${T.border.default}`,
                background: showManualPaste ? T.bg.card : T.bg.card,
                color: showManualPaste ? T.accent.primary : T.text.dim,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "all .2s ease",
              }}
            >
              <Edit3 size={18} />
            </button>
          </div>

          {showManualPaste && (
            <div style={{ marginTop: 10 }}>
              <textarea
                value={manualPasteText}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setManualPasteText(event.target.value)}
                placeholder="Paste the AI response here (entire response)"
                style={{
                  width: "100%",
                  height: 140,
                  padding: "12px",
                  borderRadius: T.radius.md,
                  border: `1px solid ${T.border.default}`,
                  background: T.bg.card,
                  color: T.text.primary,
                  fontSize: 13,
                  fontFamily: T.font.mono,
                  marginBottom: 8,
                  resize: "none",
                  lineHeight: 1.4,
                }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => {
                    if (manualPasteText.trim()) {
                      void handleManualImport(manualPasteText);
                      setShowManualPaste(false);
                      setManualPasteText("");
                    } else {
                      toast.error("Text is empty");
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: T.radius.md,
                    background: T.accent.emerald,
                    color: "white",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                    border: "none",
                  }}
                >
                  Import Text
                </button>
                <button
                  onClick={() => {
                    setShowManualPaste(false);
                    setManualPasteText("");
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {selMode && audits.length > 0 && (
            <div
              onClick={toggleAll}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 14px",
                marginTop: 12,
                borderRadius: T.radius.md,
                background: T.bg.card,
                cursor: "pointer",
                border: `1px solid ${T.border.subtle}`,
              }}
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 5,
                  flexShrink: 0,
                  border: `2px solid ${allSel ? "transparent" : T.text.dim}`,
                  background: allSel ? T.accent.primary : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all .2s",
                }}
              >
                {allSel && <CheckCircle size={11} color={T.bg.base} strokeWidth={3} />}
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: T.text.secondary }}>
                {allSel ? "Deselect All" : "Select All"}
              </span>
              {sel.size > 0 && (
                <Mono size={10} color={T.accent.primary} style={{ marginLeft: "auto" }}>
                  {sel.size} selected
                </Mono>
              )}
            </div>
          )}

          {audits.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              {STATUS_FILTERS.map((filterValue) => {
                const active = statusFilter === filterValue;
                const label = filterValue || "All";
                const color =
                  filterValue === "GREEN"
                    ? T.status.green
                    : filterValue === "YELLOW"
                      ? T.status.amber
                      : filterValue === "RED"
                        ? T.status.red
                        : T.text.secondary;
                const count = filterValue ? audits.filter((audit) => getAuditColor(audit) === filterValue).length : audits.length;
                return (
                  <button
                    key={label}
                    onClick={() => {
                      setStatusFilter(filterValue);
                      setSel(new Set<number>());
                    }}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 99,
                      fontSize: 11,
                      fontWeight: 700,
                      border: `1px solid ${active ? color : T.border.default}`,
                      background: active ? `${color}18` : T.bg.card,
                      color: active ? color : T.text.dim,
                      cursor: "pointer",
                      fontFamily: T.font.mono,
                      letterSpacing: "0.03em",
                      transition: "all .2s ease",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    {filterValue && <div style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />}
                    {label} <span style={{ opacity: 0.6, fontSize: 10 }}>({count})</span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {filteredAudits.length === 0 && audits.length > 0 ? (
          <EmptyState icon={Filter} title={`No ${statusFilter} Audits`} message="Try a different filter or run a new audit." />
        ) : audits.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="No History Yet"
            message="Perform a financial audit to see your history and trends right here."
          />
        ) : (
          (() => {
            let lastMonth: string | null = null;
            return filteredAudits.map((audit, index) => {
              const monthKey = getMonthKey(audit.date || audit.ts);
              const showMonthHeader = monthKey !== lastMonth;
              lastMonth = monthKey;
              const isConfirming = confirmDelete === index;
              const rawStatus = audit.parsed?.status || "UNKNOWN";
              let statusColor: "GREEN" | "YELLOW" | "RED" | "UNKNOWN" = "UNKNOWN";
              let statusText = rawStatus;
              const match = rawStatus.match(/^(GREEN|YELLOW|RED)[\s:;-]*(.*)$/i);
              const matchedStatus = match?.[1];
              if (match) {
                statusColor = matchedStatus?.toUpperCase() as "GREEN" | "YELLOW" | "RED";
                statusText = match[2] ? match[2].trim() : "";
              } else if (rawStatus.toUpperCase().includes("GREEN")) {
                statusColor = "GREEN";
                statusText = rawStatus.replace(/GREEN/i, "").trim();
              } else if (rawStatus.toUpperCase().includes("YELLOW")) {
                statusColor = "YELLOW";
                statusText = rawStatus.replace(/YELLOW/i, "").trim();
              } else if (rawStatus.toUpperCase().includes("RED")) {
                statusColor = "RED";
                statusText = rawStatus.replace(/RED/i, "").trim();
              }
              if (statusText.startsWith(":") || statusText.startsWith("-")) statusText = statusText.slice(1).trim();

              const accentColor =
                statusColor === "GREEN"
                  ? T.status.green
                  : statusColor === "YELLOW"
                    ? T.status.amber
                    : statusColor === "RED"
                      ? T.status.red
                      : T.text.muted;

              return (
                <div key={audit.ts || index}>
                  {showMonthHeader && (
                    <div
                      style={{
                        padding: "6px 0 8px",
                        marginBottom: 4,
                        marginTop: index > 0 ? 10 : 0,
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          color: T.text.secondary,
                          fontFamily: T.font.mono,
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                        }}
                      >
                        {monthKey}
                      </span>
                      <div style={{ flex: 1, height: 1, background: T.border.subtle }} />
                    </div>
                  )}
                  <Card
                    animate
                    delay={Math.min(index * 40, 400)}
                    onClick={selMode ? () => toggle(index) : isConfirming ? undefined : () => onSelect(audit)}
                    style={{
                      padding: "16px",
                      position: "relative",
                      overflow: "hidden",
                      ...(sel.has(index)
                        ? { borderColor: `${T.accent.primary}35`, background: `${T.accent.primary}08` }
                        : {}),
                      ...(isConfirming ? { borderColor: `${T.status.red}30`, background: `${T.status.red}06` } : {}),
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: 4,
                        background: accentColor,
                        opacity: 0.8,
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: 60,
                        background: `linear-gradient(90deg, ${accentColor}15, transparent)`,
                        pointerEvents: "none",
                      }}
                    />
                    {isConfirming ? (
                      <div>
                        <p style={{ fontSize: 12, color: T.status.red, fontWeight: 600, marginBottom: 10 }}>
                          Delete audit from {fmtDate(audit.date)}?
                        </p>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={(event: MouseEvent<HTMLButtonElement>) => {
                              event.stopPropagation();
                              onDelete(audit);
                              setConfirmDelete(null);
                            }}
                            style={{
                              flex: 1,
                              padding: 10,
                              borderRadius: T.radius.md,
                              border: "none",
                              background: T.status.red,
                              color: "white",
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            Delete
                          </button>
                          <button
                            onClick={(event: MouseEvent<HTMLButtonElement>) => {
                              event.stopPropagation();
                              setConfirmDelete(null);
                            }}
                            className="btn-secondary"
                            style={{ flex: 1 }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            {selMode && (
                              <div
                                style={{
                                  width: 20,
                                  height: 20,
                                  borderRadius: 6,
                                  flexShrink: 0,
                                  border: `2px solid ${sel.has(index) ? "transparent" : T.text.dim}`,
                                  background: sel.has(index) ? T.accent.primary : "transparent",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  transition: "all .2s",
                                }}
                              >
                                {sel.has(index) && <CheckCircle size={12} color={T.bg.base} strokeWidth={3} />}
                              </div>
                            )}
                            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span
                                  style={{
                                    fontSize: 16,
                                    fontWeight: 800,
                                    color: T.text.primary,
                                    letterSpacing: "-0.01em",
                                  }}
                                >
                                  {fmtDate(audit.date)}
                                </span>
                                <span style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono }}>
                                  {relativeTime(audit.date || audit.ts)}
                                </span>
                                {audit.isTest && (
                                  <Badge variant="amber" style={{ padding: "3px 6px" }}>
                                    TEST
                                  </Badge>
                                )}
                              </div>
                              {audit.parsed?.netWorth != null && (
                                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 2 }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: T.text.dim, letterSpacing: "0.05em" }}>
                                    NET WORTH:
                                  </span>
                                  <Mono size={13} weight={600} color={T.text.primary}>
                                    {fmt(audit.parsed.netWorth)}
                                  </Mono>
                                </div>
                              )}
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: 6, position: "relative", zIndex: 2 }}>
                            {!selMode && (
                              <button
                                onClick={(event: MouseEvent<HTMLButtonElement>) => {
                                  event.stopPropagation();
                                  setExportAuditRecord(audit);
                                }}
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: T.radius.md,
                                  border: `1px solid ${T.border.subtle}`,
                                  background: T.bg.elevated,
                                  color: T.text.secondary,
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  transition: "all .2s",
                                }}
                              >
                                <Download size={14} strokeWidth={2.5} />
                              </button>
                            )}
                            {!selMode && (
                              <button
                                onClick={(event: MouseEvent<HTMLButtonElement>) => {
                                  event.stopPropagation();
                                  setConfirmDelete(index);
                                  haptic.warning();
                                }}
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: T.radius.md,
                                  border: `1px solid ${T.status.red}20`,
                                  background: T.status.redDim,
                                  color: T.status.red,
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  transition: "all .2s",
                                }}
                              >
                                <Trash2 size={14} strokeWidth={2.5} />
                              </button>
                            )}
                          </div>
                        </div>

                        {(audit.parsed?.healthScore?.score != null || audit.model) && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            {audit.parsed?.healthScore?.score != null && (() => {
                              const score = audit.parsed.healthScore.score;
                              const grade = getGradeLetter(score);
                              const scoreColor = score >= 80 ? T.status.green : score >= 60 ? T.status.amber : T.status.red;
                              return (
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 800,
                                      color: scoreColor,
                                      background: `${scoreColor}15`,
                                      border: `1px solid ${scoreColor}30`,
                                      padding: "3px 10px",
                                      borderRadius: 99,
                                      fontFamily: T.font.mono,
                                      letterSpacing: "0.02em",
                                    }}
                                  >
                                    {score} · {grade}
                                  </span>
                                </div>
                              );
                            })()}
                            {audit.model && (
                              <span
                                style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  color: T.text.dim,
                                  background: `${T.text.dim}12`,
                                  border: `1px solid ${T.text.dim}20`,
                                  padding: "2px 7px",
                                  borderRadius: 99,
                                  fontFamily: T.font.mono,
                                  letterSpacing: "0.03em",
                                  textTransform: "uppercase",
                                }}
                              >
                                {audit.model}
                              </span>
                            )}
                          </div>
                        )}

                        {audit.form && (
                          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", paddingTop: 10, borderTop: `1px solid ${T.border.subtle}` }}>
                            {audit.form.checking != null && (
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: T.text.dim, letterSpacing: "0.02em" }}>
                                  CHK
                                </span>
                                <Mono size={11} weight={600} color={T.text.secondary}>
                                  {fmt(parseFloat(String(audit.form.checking)) || 0)}
                                </Mono>
                              </div>
                            )}
                            {audit.form.debts && audit.form.debts.length > 0 && (
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: T.status.red, letterSpacing: "0.02em" }}>
                                  OWED
                                </span>
                                <Mono size={11} weight={600} color={T.text.secondary}>
                                  {fmt(audit.form.debts.reduce((sum, debt) => sum + getDebtAmount(debt), 0))}
                                </Mono>
                              </div>
                            )}
                            {audit.form.investments && audit.form.investments.length > 0 && (
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: T.status.amber, letterSpacing: "0.02em" }}>
                                  INV
                                </span>
                                <Mono size={11} weight={600} color={T.text.secondary}>
                                  {fmt(audit.form.investments.reduce((sum, investment) => sum + getInvestmentAmount(investment), 0))}
                                </Mono>
                              </div>
                            )}
                          </div>
                        )}

                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 10,
                            padding: "10px 14px",
                            background: `linear-gradient(135deg, ${accentColor}15, ${accentColor}05)`,
                            borderRadius: T.radius.md,
                            border: `1px solid ${accentColor}30`,
                          }}
                        >
                          <div
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              background: accentColor,
                              boxShadow: `0 0 12px ${accentColor}80`,
                              flexShrink: 0,
                              marginTop: 3,
                            }}
                          />
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 800,
                                color: accentColor,
                                letterSpacing: "0.04em",
                                textTransform: "uppercase",
                              }}
                            >
                              {statusColor}
                            </span>
                            {(statusText || audit.parsed?.healthScore?.summary) && (
                              <span style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.4, opacity: 0.9 }}>
                                {statusText || audit.parsed?.healthScore?.summary}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </Card>
                </div>
              );
            });
          })()
        )}
      </div>
    </div>
  );
});
