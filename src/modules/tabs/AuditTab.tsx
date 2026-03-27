  import { lazy,memo,Suspense,useState } from "react";
  import type { AuditRecord } from "../../types/index.js";
  import { EmptyState,Mono } from "../components.js";
  import { T } from "../constants.js";
  import { useAudit } from "../contexts/AuditContext.js";
  import { useNavigation } from "../contexts/NavigationContext.js";
  import { haptic } from "../haptics.js";
  import {
    Activity,
    CheckCircle,
    Download,
    Filter,
    Plus,
    Trash2,
    TrendingUp,
    Zap
  } from "../icons";
  import { buildPromoLine } from "../planCatalog.js";
  import { shouldShowGating } from "../subscription.js";
  import { Badge,Card } from "../ui.js";
  import { fmt,fmtDate } from "../utils.js";
  import "./DashboardTab.css";
  import AuditExportSheet from "./AuditExportSheet.js";
  import ProBanner from "./ProBanner.js";

const LazyProPaywall = lazy(() => import("./ProPaywall.js"));

interface ToastApi {
  success?: (message: string) => void;
  error?: (message: string) => void;
  info?: (message: string) => void;
}

interface AuditTabProps {
  proEnabled?: boolean;
  privacyMode?: boolean;
  toast?: ToastApi;
  onDemoAudit?: () => void;
}

// ── Helpers ──
const relativeTime = d => {
  if (!d) return "";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
};

const getMonthKey = d => {
  if (!d) return "Unknown";
  return new Date(d).toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

const getAuditColor = a => {
  const raw = a.parsed?.status || "UNKNOWN";
  const m = raw.match(/^(GREEN|YELLOW|RED)/i);
  return m
    ? m[1].toUpperCase()
    : raw.toUpperCase().includes("GREEN") ? "GREEN"
    : raw.toUpperCase().includes("YELLOW") ? "YELLOW"
    : raw.toUpperCase().includes("RED") ? "RED"
    : "UNKNOWN";
};

import { getGradeLetter } from "../mathHelpers.js";

const colorFor = c =>
  c === "GREEN" ? T.status.green
  : c === "YELLOW" ? T.status.amber
  : c === "RED" ? T.status.red
  : T.text.muted;

// ── Trend Sparkline ──
const TrendSparkline = ({ history }) => {
  const scoredAudits = (history || [])
    .filter(a => a?.parsed?.healthScore?.score != null)
    .slice(0, 8);
  if (scoredAudits.length === 0) return null;

  const scores = scoredAudits.map(a => a.parsed.healthScore.score).reverse();
  const latestScore = scoredAudits[0]?.parsed?.healthScore?.score ?? null;
  const previousScore = scoredAudits[1]?.parsed?.healthScore?.score ?? null;
  const latestGrade = latestScore != null ? getGradeLetter(latestScore) : null;
  const avgScore = Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
  const delta = latestScore != null && previousScore != null ? latestScore - previousScore : null;
  const trendColor = delta == null ? T.accent.primary : delta >= 0 ? T.status.green : T.status.red;

  const W = 280, H = 60, PX = 8, PY = 8;
  const min = Math.min(...scores) - 5;
  const max = Math.max(...scores) + 5;
  const range = max - min || 1;
  const pts = scores.map((s, i) => ({
    x: scores.length === 1 ? W / 2 : PX + (i / (scores.length - 1)) * (W - PX * 2),
    y: PY + (1 - (s - min) / range) * (H - PY * 2),
  }));
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const firstPoint = pts[0] ?? null;
  const lastPoint = pts[pts.length - 1] ?? null;
  const latestAudit = scoredAudits[0];

  return (
    <Card
      style={{
        padding: "16px",
        overflow: "hidden",
        position: "relative",
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
              {latestScore != null ? `${latestGrade} · ${latestScore}` : "No score yet"}
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
                    <linearGradient id="auditTrendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={trendColor} stopOpacity="0.2" />
                      <stop offset="100%" stopColor={trendColor} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={`${d} L${lastPoint.x},${H} L${firstPoint.x},${H} Z`} fill="url(#auditTrendGrad)" />
                  <path d={d} fill="none" stroke={trendColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  {pts.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={i === pts.length - 1 ? 3.5 : 0} fill={trendColor} />
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
            { label: "Latest", value: latestScore != null ? `${latestScore}` : "—", note: latestAudit ? relativeTime(latestAudit.date || latestAudit.ts) : "No audit" },
            { label: "Average", value: `${avgScore}`, note: `${scores.length} scored audits` },
            { label: "Archive", value: `${history.length}`, note: "total audits" },
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

// ═══════════════════════════════════════════════════════════════
// AuditTab
// ═══════════════════════════════════════════════════════════════
export default memo(function AuditTab({ proEnabled = false, privacyMode: _privacyModeTick = false, toast, onDemoAudit }: AuditTabProps) {
  void _privacyModeTick;
  const { current, history: audits, deleteHistoryItem: onDelete, quota } = useAudit();
  const { navTo, setResultsBackTarget } = useNavigation();
  const [showPaywall, setShowPaywall] = useState(false);

  // History management state
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [selMode, setSelMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [exportAuditRecord, setExportAuditRecord] = useState<AuditRecord | null>(null);

  const filteredAudits = statusFilter ? audits.filter(a => getAuditColor(a) === statusFilter) : audits;
  const allSel = sel.size === filteredAudits.length && filteredAudits.length > 0;
  const toggle = i => { const s = new Set(sel); s.has(i) ? s.delete(i) : s.add(i); setSel(s); };
  const toggleAll = () => setSel(allSel ? new Set() : new Set(filteredAudits.map((_, i) => i)));
  const exitSel = () => { setSelMode(false); setSel(new Set()); };
  const doExportSel = async () => {
    try {
      const { exportSelectedAudits } = await import("../auditExports.js");
      await exportSelectedAudits(filteredAudits.filter((_, i) => sel.has(i)));
      exitSel();
    } catch (error) {
      toast?.error?.(error instanceof Error ? error.message : "Export failed");
    }
  };
  const handleExportCsv = async () => {
    try {
      const { exportAuditCSV } = await import("../auditExports.js");
      await exportAuditCSV(audits);
    } catch (error) {
      toast?.error?.(error instanceof Error ? error.message : "Export failed");
    }
  };
  const handleExportJson = async () => {
    try {
      const { exportAllAudits } = await import("../auditExports.js");
      await exportAllAudits(audits);
    } catch (error) {
      toast?.error?.(error instanceof Error ? error.message : "Export failed");
    }
  };

  const onRunAudit = () => { haptic.medium(); navTo("input"); };
  const onViewResult = (a: AuditRecord | null | undefined) => {
    if (setResultsBackTarget) setResultsBackTarget("audit");
    navTo("results", a || current);
  };

  const p = current?.parsed;
  const demoActive = !!current?.isTest;
  const score = p?.healthScore?.score;
  const grade = getGradeLetter(score);
  const statusColor = getAuditColor(current || {});
  const cHex = colorFor(statusColor);
  const movesDone = current?.moveChecks ? Object.values(current.moveChecks).filter(Boolean).length : 0;
  const movesTotal = p?.topMoves?.length || 0;

  // ── Remaining quota ──
  const quotaState = (quota ?? {}) as { remaining?: number | null; limit?: number | null };
  const remaining = quotaState.remaining ?? null;
  const limit = quotaState.limit ?? null;

  return (
    <div className="page-body" style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <div style={{ width: "100%", maxWidth: 768, display: "flex", flexDirection: "column" }}>

        {shouldShowGating() && !proEnabled && (
          <ProBanner
            compact
            onUpgrade={() => setShowPaywall(true)}
            label="Upgrade to Pro"
            sublabel={buildPromoLine(["audits", "history", "rewards"])}
          />
        )}
        {showPaywall && (
          <Suspense fallback={null}>
            <LazyProPaywall onClose={() => setShowPaywall(false)} />
          </Suspense>
        )}
        {exportAuditRecord && (
          <AuditExportSheet audit={exportAuditRecord} onClose={() => setExportAuditRecord(null)} toast={toast} />
        )}

        {demoActive && (
          <Card
            style={{
              marginBottom: 12,
              padding: "12px 14px",
              borderLeft: `3px solid ${T.status.amber}`,
              background: `${T.status.amber}10`,
              borderColor: `${T.status.amber}35`,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: T.status.amber,
                    fontFamily: T.font.mono,
                    letterSpacing: "0.06em",
                    marginBottom: 4,
                  }}
                >
                  DEMO MODE ACTIVE
                </div>
                <p style={{ margin: 0, fontSize: 11, color: T.text.secondary, lineHeight: 1.5 }}>
                  You are viewing sample finances. Reset demo data from Dashboard or Settings to return to your real numbers.
                </p>
              </div>
              <Badge variant="outline" style={{ color: T.status.amber, borderColor: `${T.status.amber}40`, flexShrink: 0 }}>
                Sample data
              </Badge>
            </div>
          </Card>
        )}

        <div style={{ marginBottom: 14 }}>
          <TrendSparkline history={audits} />
        </div>

        {/* ═══ LATEST AUDIT CARD ═══ */}
        {p ? (
          <Card
            animate
            onClick={() => onViewResult(current)}
            style={{
              position: "relative",
              overflow: "hidden",
              cursor: "pointer",
              padding: "20px",
              borderColor: `${cHex}30`,
            }}
          >
            {/* Left color strip */}
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: cHex, opacity: 0.9 }} />
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 80, background: `linear-gradient(90deg, ${cHex}12, transparent)`, pointerEvents: "none" }} />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Zap size={13} color={cHex} strokeWidth={2.5} />
                <span style={{ fontSize: 11, fontWeight: 800, color: T.text.secondary, fontFamily: T.font.mono, letterSpacing: "0.04em" }}>
                  LATEST AUDIT
                </span>
              </div>
              <span style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono }}>
                {relativeTime(current?.date || current?.ts)} →
              </span>
            </div>

             <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
               {/* Score + Grade inline pill */}
               <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                 {score != null && (
                   <div style={{
                     display: "flex", alignItems: "center", gap: 5,
                     padding: "4px 10px", borderRadius: 99,
                     background: `${cHex}12`, border: `1px solid ${cHex}30`,
                   }}>
                     <div style={{ width: 6, height: 6, borderRadius: "50%", background: cHex }} />
                     <span style={{ fontSize: 13, fontWeight: 800, color: cHex, fontFamily: T.font.mono }}>
                       {grade} · {score}
                     </span>
                   </div>
                 )}
               </div>

               <div style={{ flex: 1, minWidth: 0 }}>
                 <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                   <span style={{
                     fontSize: 10, fontWeight: 700, color: cHex,
                     background: `${cHex}10`, border: `1px solid ${cHex}25`,
                     padding: "2px 8px", borderRadius: 99, fontFamily: T.font.mono,
                     letterSpacing: "0.04em",
                   }}>
                     {statusColor}
                   </span>
                   <span style={{ fontSize: 10, color: T.text.dim }}>
                     {fmtDate(current?.date)}
                   </span>
                 </div>

                 {p?.netWorth != null && (
                   <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                     <Mono size={14} weight={700} color={T.text.primary}>{fmt(p.netWorth)}</Mono>
                     <span style={{ fontSize: 9, fontWeight: 700, color: T.text.dim, letterSpacing: "0.05em" }}>NET WORTH</span>
                   </div>
                 )}

                 {movesTotal > 0 && (
                   <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                     <div style={{ flex: 1, height: 3, background: T.bg.elevated, borderRadius: 99, overflow: "hidden" }}>
                       <div style={{
                         width: `${(movesDone / movesTotal) * 100}%`,
                         height: "100%",
                         background: cHex,
                         borderRadius: 99,
                         transition: "width 0.4s ease",
                       }} />
                     </div>
                     <span style={{ fontSize: 9, fontWeight: 700, color: T.text.dim, fontFamily: T.font.mono, whiteSpace: "nowrap" }}>
                       {movesDone}/{movesTotal} moves
                     </span>
                   </div>
                 )}
               </div>
             </div>
           </Card>
        ) : (
          /* Empty state when no audits */
          <Card style={{ padding: "32px 20px", textAlign: "center" }}>
            <div style={{
              width: 48, height: 48, borderRadius: 16,
              background: `${T.accent.primary}15`, border: `1px solid ${T.accent.primary}25`,
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 14px",
            }}>
              <Zap size={22} color={T.accent.primary} strokeWidth={2} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text.primary, marginBottom: 6 }}>No Audits Yet</div>
            <div style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.5, maxWidth: 260, margin: "0 auto" }}>
              Run your first weekly audit to get a personalized financial health score and action plan.
            </div>
          </Card>
        )}

        {/* ═══ HERO CTA — RUN NEW AUDIT ═══ */}
        <button
          onClick={onRunAudit}
          className="hover-btn"
          style={{
            width: "100%",
            padding: "16px",
            marginTop: 12,
            borderRadius: T.radius.lg,
            border: `1px solid ${T.accent.primary}40`,
            background: `linear-gradient(135deg, ${T.accent.primary}, #6C60FF)`,
            color: "#fff",
            fontSize: 15,
            fontWeight: 800,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            boxShadow: `0 6px 24px ${T.accent.primary}40`,
            transition: "all .2s cubic-bezier(.16,1,.3,1)",
          }}
        >
          <Plus size={18} strokeWidth={2.5} />
          Run New Audit
        </button>

        {remaining != null && limit != null && (
          <div style={{ textAlign: "center", marginTop: 12, fontSize: 10, fontWeight: 600, color: T.text.dim, fontFamily: T.font.mono }}>
            {remaining} of {limit} weekly audits remaining
          </div>
        )}
        {typeof onDemoAudit === "function" && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
            <button
              onClick={() => {
                haptic.light();
                onDemoAudit();
              }}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: `1px solid ${T.border.default}`,
                background: "transparent",
                color: T.text.secondary,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Zap size={12} strokeWidth={2.2} />
              {demoActive ? "Reload Demo Data" : "Load Demo Data"}
            </button>
          </div>
        )}

        {/* ═══ HISTORY SECTION ═══ */}
        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ display: "grid", gap: 3 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Activity size={14} color={T.text.secondary} strokeWidth={2.5} />
                <span style={{ fontSize: 14, fontWeight: 800, color: T.text.primary }}>History</span>
                <Mono size={10} color={T.text.dim}>{audits.length} audits</Mono>
              </div>
              <span style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.4 }}>
                Keep the useful audits, filter the noise, and export only what you need.
              </span>
            </div>
            {audits.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {selMode && sel.size > 0 && (
                  <button
                    onClick={() => void doExportSel()}
                    style={{
                      display: "flex", alignItems: "center", gap: 4, padding: "0 12px", height: 32,
                      borderRadius: 12, border: `1px solid ${T.accent.primary}40`,
                      background: T.accent.primaryDim, color: T.accent.primary,
                      fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: T.font.mono,
                    }}
                  >
                    <Download size={9} /> EXPORT {sel.size}
                  </button>
                )}
                <button
                  onClick={() => { setSelMode(!selMode); setSel(new Set()); }}
                  style={{
                    padding: "0 12px", height: 32, borderRadius: 12,
                    border: `1px solid ${T.border.default}`, background: T.bg.elevated,
                    color: selMode ? T.accent.primary : T.text.dim,
                    fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: T.font.mono,
                  }}
                >
                  {selMode ? "CANCEL" : "SELECT"}
                </button>
                <button
                  onClick={() => void handleExportCsv()}
                  title="Export CSV"
                  style={{
                    padding: "0 12px", height: 32, borderRadius: 12,
                    border: `1px solid ${T.border.default}`, background: T.bg.elevated,
                    color: T.text.dim, cursor: "pointer", display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: 10, fontWeight: 700, fontFamily: T.font.mono,
                  }}
                >
                  CSV
                </button>
                <button
                  onClick={() => void handleExportJson()}
                  title="Export All JSON"
                  style={{
                    padding: "0 12px", height: 32, borderRadius: 12,
                    border: `1px solid ${T.border.default}`, background: T.bg.elevated,
                    color: T.text.dim, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: T.font.mono,
                  }}
                >
                  JSON
                </button>
              </div>
            )}
          </div>


          {/* Select All */}
          {selMode && audits.length > 0 && (
            <div
              onClick={toggleAll}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", marginBottom: 8,
                borderRadius: T.radius.md, background: T.bg.card, cursor: "pointer", border: `1px solid ${T.border.subtle}`,
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                border: `2px solid ${allSel ? "transparent" : T.text.dim}`,
                background: allSel ? T.accent.primary : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {allSel && <CheckCircle size={11} color={T.bg.base} strokeWidth={3} />}
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: T.text.secondary }}>{allSel ? "Deselect All" : "Select All"}</span>
              {sel.size > 0 && <Mono size={10} color={T.accent.primary} style={{ marginLeft: "auto" }}>{sel.size} selected</Mono>}
            </div>
          )}

          {/* Status filter pills */}
          {audits.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
              {[null, "GREEN", "YELLOW", "RED"].map(f => {
                const active = statusFilter === f;
                const label = f || "All";
                const c = colorFor(f);
                const count = f ? audits.filter(a => getAuditColor(a) === f).length : audits.length;
                return (
                  <button
                    key={label}
                    onClick={() => { setStatusFilter(f); setSel(new Set()); }}
                    style={{
                      padding: "0 12px", height: 30, borderRadius: 999, fontSize: 10, fontWeight: 700,
                      border: `1px solid ${active ? c : T.border.default}`,
                      background: active ? `${c}18` : T.bg.elevated,
                      color: active ? c : T.text.dim, cursor: "pointer", fontFamily: T.font.mono,
                      letterSpacing: "0.03em", display: "flex", alignItems: "center", gap: 4,
                    }}
                  >
                    {f && <div style={{ width: 6, height: 6, borderRadius: "50%", background: c }} />}
                    {label} <span style={{ opacity: 0.6, fontSize: 9 }}>({count})</span>
                  </button>
                );
              })}
            </div>
          )}

          {filteredAudits.length === 0 && audits.length > 0 ? (
            <EmptyState icon={Filter} title={`No ${statusFilter} Audits`} message="Try a different filter or run a new audit." />
          ) : audits.length === 0 ? null : (
            <Card style={{ padding: 0, overflow: "hidden" }}>
              {(() => {
                let lastMonth: string | null = null;
                return filteredAudits.map((a, i) => {
                  const monthKey = getMonthKey(a.date || a.ts);
                  const showMonthHeader = monthKey !== lastMonth;
                  lastMonth = monthKey;
                  const isConfirming = confirmDelete === i;
                  const rawStatus = a.parsed?.status || "UNKNOWN";
                  let sColor = "UNKNOWN";
                  let sText = rawStatus;
                  const m = rawStatus.match(/^(GREEN|YELLOW|RED)[\s:;-]*(.*)$/i);
                  if (m) { sColor = (m[1] ?? "UNKNOWN").toUpperCase(); sText = m[2] ? m[2].trim() : ""; }
                  else if (rawStatus.toUpperCase().includes("GREEN")) { sColor = "GREEN"; sText = rawStatus.replace(/GREEN/i, "").trim(); }
                  else if (rawStatus.toUpperCase().includes("YELLOW")) { sColor = "YELLOW"; sText = rawStatus.replace(/YELLOW/i, "").trim(); }
                  else if (rawStatus.toUpperCase().includes("RED")) { sColor = "RED"; sText = rawStatus.replace(/RED/i, "").trim(); }
                  if (sText.startsWith(":") || sText.startsWith("-")) sText = sText.slice(1).trim();
                  const cardHex = colorFor(sColor);

                  return (
                    <div key={a.ts || i}>
                      {showMonthHeader && (
                        <div style={{ padding: "10px 16px", background: T.bg.surface, borderBottom: `1px solid ${T.border.subtle}`, borderTop: i > 0 ? `1px solid ${T.border.subtle}` : "none", display: "flex", alignItems: "center" }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: T.text.secondary, fontFamily: T.font.mono, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                            {monthKey}
                          </span>
                        </div>
                      )}
                      <div
                        onClick={selMode ? () => toggle(i) : isConfirming ? undefined : () => onViewResult(a)}
                        className="hover-card-row"
                        style={{
                          padding: "16px 20px",
                          position: "relative",
                          cursor: "pointer",
                          background: T.bg.card,
                          borderBottom: i === filteredAudits.length - 1 ? "none" : `1px solid ${T.border.subtle}`,
                          transition: "background 0.2s ease",
                          ...(sel.has(i) ? { background: `${T.accent.primary}08` } : {}),
                          ...(isConfirming ? { background: `${T.status.red}06` } : {}),
                        }}
                      >

                      {isConfirming ? (
                        <div>
                          <p style={{ fontSize: 12, color: T.status.red, fontWeight: 600, marginBottom: 10 }}>Delete audit from {fmtDate(a.date)}?</p>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              onClick={e => { e.stopPropagation(); onDelete(a); setConfirmDelete(null); }}
                              style={{ flex: 1, padding: 10, borderRadius: T.radius.md, border: "none", background: T.status.red, color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                            >Delete</button>
                            <button onClick={e => { e.stopPropagation(); setConfirmDelete(null); }} className="btn-secondary" style={{ flex: 1 }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                          {/* Left Value / Score Pill */}
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, width: 44, flexShrink: 0 }}>
                            {a.parsed?.healthScore?.score != null ? (() => {
                                const s = a.parsed.healthScore.score;
                                const sc = s >= 80 ? T.status.green : s >= 60 ? T.status.amber : T.status.red;
                                return (
                                  <div style={{
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    height: 24, borderRadius: 12, background: `${sc}15`, border: `1px solid ${sc}40`,
                                    color: sc, fontSize: 11, fontWeight: 800, fontFamily: T.font.mono
                                  }}>
                                    {s}
                                  </div>
                                )
                            })() : (
                              <div style={{
                                display: "flex", alignItems: "center", justifyContent: "center",
                                height: 24, borderRadius: 12, background: `${cardHex}15`, border: `1px solid ${cardHex}40`,
                                color: cardHex, fontSize: 10, fontWeight: 800, fontFamily: T.font.mono
                              }}>
                                {sColor.slice(0, 3)}
                              </div>
                            )}
                          </div>

                          {/* Center Content */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
                               <span style={{ fontSize: 15, fontWeight: 600, color: T.text.primary, letterSpacing: "-0.01em" }}>
                                  {fmtDate(a.date)}
                               </span>
                               {a.isTest && <Badge variant="amber" style={{ padding: "1px 4px", fontSize: 8 }}>TEST</Badge>}
                               {selMode && (
                                  <div style={{
                                    width: 14, height: 14, borderRadius: 4, flexShrink: 0, marginLeft: 'auto',
                                    border: `1px solid ${sel.has(i) ? "transparent" : T.text.dim}`,
                                    background: sel.has(i) ? T.accent.primary : "transparent",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                  }}>
                                    {sel.has(i) && <CheckCircle size={10} color={T.bg.base} strokeWidth={3} />}
                                  </div>
                               )}
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 11, color: T.text.secondary }}>
                              {a.parsed?.netWorth != null && (
                                <span style={{ fontWeight: 500, color: T.text.primary }}>NW: <span style={{ fontFamily: T.font.mono, fontWeight: 600 }}>{fmt(a.parsed.netWorth)}</span></span>
                              )}
                              {a.form?.checking != null && (
                                <span>Chk: <span style={{ fontFamily: T.font.mono }}>{fmt(Number(a.form.checking) || 0)}</span></span>
                              )}
                              {(a.form?.debts?.length ?? 0) > 0 && (
                                <span style={{ color: T.status.red }}>Debt: <span style={{ fontFamily: T.font.mono }}>{fmt((a.form?.debts ?? []).reduce((s, d) => s + (Number(d.balance) || 0), 0))}</span></span>
                              )}
                            </div>

                            {/* Status subtitle stripped down */}
                            {sText && (
                              <div style={{
                                fontSize: 11, color: T.text.dim, lineHeight: 1.4, marginTop: 4,
                                overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box",
                                WebkitLineClamp: 1, WebkitBoxOrient: "vertical"
                              }}>
                                {sText}
                              </div>
                            )}
                          </div>

                          {/* Right actions (if any) */}
                           <div style={{ display: "flex", gap: 8, alignItems: "center", opacity: 0.4 }}>
                              {!selMode && (
                                <button
                                  onClick={e => { e.stopPropagation(); setExportAuditRecord(a); }}
                                  style={{ background: "none", border: "none", color: T.text.dim, cursor: "pointer", padding: 4 }}
                                >
                                  <Download size={14} />
                                </button>
                              )}
                              {!selMode && (
                                <button
                                  onClick={e => { e.stopPropagation(); setConfirmDelete(i); haptic.warning(); }}
                                  style={{ background: "none", border: "none", color: T.status.red, cursor: "pointer", padding: 4 }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                           </div>
                        </div>
                      )}
                      </div>
                    </div>
                  );
                });
              })()}
            </Card>
          )}
        </div>

        {/* AI Disclaimer */}
        <p style={{ fontSize: 9, color: T.text.muted, textAlign: "center", marginTop: 20, lineHeight: 1.5, opacity: 0.6 }}>
          AI-generated educational content only · Not professional financial advice
        </p>
      </div>
    </div>
  );
});
