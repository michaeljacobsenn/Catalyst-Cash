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
    ChevronRight,
    Download,
    Filter,
    Plus,
    Trash2,
    Zap
  } from "../icons";
  import { useOnlineStatus } from "../onlineStatus.js";
  import { buildPromoLine } from "../planCatalog.js";
  import { shouldShowGating } from "../subscription.js";
  import UiGlyph from "../UiGlyph.js";
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
  themeTick?: number;
  toast?: ToastApi;
  onDemoAudit?: () => void;
}

// ── Helpers ──
const relativeTime = d => {
  if (!d) return "";
  const timestamp = new Date(d).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const diff = Math.max(0, Date.now() - timestamp);
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
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

const getAuditKey = (audit: AuditRecord | null | undefined, index = 0) => {
  const ts = String(audit?.ts || "").trim();
  if (ts) return ts;
  const date = String(audit?.date || "").trim();
  if (date) return `${date}-${index}`;
  return `audit-${index}`;
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

// ═══════════════════════════════════════════════════════════════
// AuditTab
// ═══════════════════════════════════════════════════════════════
export default memo(function AuditTab({ proEnabled = false, privacyMode: _privacyModeTick = false, themeTick: _themeTick = 0, toast, onDemoAudit }: AuditTabProps) {
  void _privacyModeTick;
  void _themeTick;
  const online = useOnlineStatus();
  const { current, history: audits, deleteHistoryItem: onDelete, quota } = useAudit();
  const { navTo, setResultsBackTarget } = useNavigation();
  const [showPaywall, setShowPaywall] = useState(false);

  // History management state
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [selMode, setSelMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [exportAuditRecord, setExportAuditRecord] = useState<AuditRecord | null>(null);

  const filteredAudits = statusFilter ? audits.filter(a => getAuditColor(a) === statusFilter) : audits;
  const filteredAuditKeys = filteredAudits.map((audit, index) => getAuditKey(audit, index));
  const allSel = filteredAuditKeys.length > 0 && filteredAuditKeys.every((key) => sel.has(key));
  const toggle = (auditKey: string) => {
    const next = new Set(sel);
    next.has(auditKey) ? next.delete(auditKey) : next.add(auditKey);
    setSel(next);
  };
  const toggleAll = () => setSel(allSel ? new Set() : new Set(filteredAuditKeys));
  const exitSel = () => { setSelMode(false); setSel(new Set()); setConfirmDelete(null); };
  const doExportSel = async () => {
    try {
      const { exportSelectedAudits } = await import("../auditExports.js");
      await exportSelectedAudits(filteredAudits.filter((audit, index) => sel.has(getAuditKey(audit, index))));
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
  const onOpenHistory = () => {
    haptic.light();
    navTo("history");
  };
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

        {showPaywall && (
          <Suspense fallback={null}>
            <LazyProPaywall onClose={() => setShowPaywall(false)} source="audit" />
          </Suspense>
        )}
        {exportAuditRecord && (
          <AuditExportSheet audit={exportAuditRecord} onClose={() => setExportAuditRecord(null)} toast={toast} />
        )}

        {/* demo warning banner */}
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
                <div style={{ fontSize: 10, fontWeight: 800, color: T.status.amber, fontFamily: T.font.mono, letterSpacing: "0.06em", marginBottom: 4 }}>
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

        {/* ═══ 1. PRIMARY CTA ═══ */}
        <button
          onClick={onRunAudit}
          className="hover-btn"
          style={{
            width: "100%",
            padding: "16px",
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
          {online ? "Run New Audit" : "Prepare Next Audit"}
        </button>

        {!online && (
          <div style={{ marginTop: 8, textAlign: "center", fontSize: 11, color: T.text.secondary, lineHeight: 1.5 }}>
            You can still review history and stage your next audit offline. Running the audit and Ask AI resume when internet returns.
          </div>
        )}

        {/* quota + demo — contextual, directly below CTA */}
        {(remaining != null && limit != null) || typeof onDemoAudit === "function" ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 8, marginBottom: -4 }}>
            {remaining != null && limit != null && (
              <span style={{ fontSize: 10, fontWeight: 600, color: T.text.dim, fontFamily: T.font.mono }}>
                {remaining} of {limit} audits remaining
              </span>
            )}
            {typeof onDemoAudit === "function" && (
              <button
                onClick={() => { haptic.light(); onDemoAudit(); }}
                style={{
                  padding: "6px 12px",
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
                Load Demo Data
              </button>
            )}
          </div>
        ) : null}

        {/* ═══ 2. PRO UPGRADE NUDGE (gated) ═══ */}
        {shouldShowGating() && !proEnabled && (
          <ProBanner
            compact
            onUpgrade={() => setShowPaywall(true)}
            label="Upgrade to Pro"
            sublabel={buildPromoLine(["audits", "history", "rewards"])}
          />
        )}

        {/* ═══ 3. LATEST AUDIT CARD ═══ */}
        {p ? (
          <Card
            animate
            onClick={() => onViewResult(current)}
            style={{
              position: "relative",
              overflow: "hidden",
              cursor: "pointer",
              padding: "20px",
              marginTop: 10,
              borderColor: `${cHex}30`,
            }}
          >
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
              {score != null && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "4px 10px", borderRadius: 99,
                  background: `${cHex}12`, border: `1px solid ${cHex}30`,
                  flexShrink: 0,
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: cHex }} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: cHex, fontFamily: T.font.mono }}>
                    {grade} · {score}
                  </span>
                </div>
              )}
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
                  <span style={{ fontSize: 10, color: T.text.dim }}>{fmtDate(current?.date)}</span>
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
          <Card style={{ padding: "32px 20px", textAlign: "center", marginTop: 10 }}>
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

        <button
          onClick={onOpenHistory}
          style={{
            width: "100%",
            marginTop: 10,
            padding: "12px 14px",
            borderRadius: T.radius.md,
            border: `1px solid ${T.border.default}`,
            background: T.bg.card,
            color: T.text.primary,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Activity size={15} strokeWidth={2.2} />
          Audit History
        </button>

        {/* inline upgrade nudge for free users who have a score */}
        {shouldShowGating() && !proEnabled && score != null && !demoActive && (
          <button
            onClick={() => { haptic.light(); setShowPaywall(true); }}
            style={{
              width: "100%",
              marginTop: 10,
              padding: "12px 14px",
              borderRadius: T.radius.md,
              border: `1px solid ${T.accent.primary}20`,
              background: `linear-gradient(160deg, ${T.bg.card}, ${T.accent.primary}08)`,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 10,
              textAlign: "left" as const,
              transition: "all .2s ease",
            }}
          >
            <div style={{
              width: 30, height: 30, borderRadius: 10,
              background: `${T.accent.primary}14`, border: `1px solid ${T.accent.primary}20`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, flexShrink: 0,
            }}><UiGlyph glyph="⚡" size={14} color={T.accent.primary} /></div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: T.text.primary, lineHeight: 1.4 }}>
                {score >= 75 ? "Keep this momentum going" : "Unlock deeper financial insights"}
              </div>
              <div style={{ fontSize: 10, color: T.text.dim, lineHeight: 1.35, marginTop: 2 }}>
                {score >= 75
                  ? "Pro gives you unlimited audits and the archive to prove your progress."
                  : "Pro unlocks stronger AI models, more audits, and the tools to improve your score faster."}
              </div>
            </div>
            <ChevronRight size={14} color={T.text.muted} />
          </button>
        )}

        {/* ═══ 5. HISTORY ARCHIVE ═══ */}
        {audits.length > 0 && (
        <div style={{ marginTop: 26, display: "grid", gap: 12 }}>
          <Card
            style={{
              padding: "18px",
              background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.elevated})`,
              borderColor: T.border.default,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                right: -20,
                top: -20,
                width: 80,
                height: 80,
                background: T.accent.primary,
                filter: "blur(50px)",
                opacity: 0.06,
                borderRadius: "50%",
                pointerEvents: "none",
              }}
            />

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 9,
                    background: `${T.accent.primary}15`,
                    border: `1px solid ${T.accent.primary}25`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Activity size={13} color={T.accent.primary} strokeWidth={2.5} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>
                    Audit Archive
                  </div>
                  <div style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono, marginTop: 1 }}>
                    {audits.length} total · {audits.filter(a => !a.isTest).length} live · {audits.filter(a => a.isTest).length} test
                  </div>
                </div>
              </div>

              {/* Compact export toolbar */}
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                {selMode && sel.size > 0 && (
                  <button
                    onClick={() => void doExportSel()}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                      padding: "0 10px",
                      height: 30,
                      borderRadius: 8,
                      border: `1px solid ${T.accent.primary}40`,
                      background: T.accent.primaryDim,
                      color: T.accent.primary,
                      fontSize: 9,
                      fontWeight: 800,
                      cursor: "pointer",
                      fontFamily: T.font.mono,
                    }}
                  >
                    <Download size={9} /> {sel.size}
                  </button>
                )}
                <button
                  onClick={() => { setSelMode(!selMode); setSel(new Set()); setConfirmDelete(null); }}
                  title="Select audits"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    border: `1px solid ${selMode ? T.accent.primary + "40" : T.border.default}`,
                    background: selMode ? `${T.accent.primary}12` : T.bg.elevated,
                    color: selMode ? T.accent.primary : T.text.dim,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 8,
                    fontWeight: 800,
                    fontFamily: T.font.mono,
                  }}
                >
                  {selMode ? <UiGlyph glyph="✕" size={12} color={T.accent.primary} /> : <CheckCircle size={12} />}
                </button>
                <button
                  onClick={() => void handleExportCsv()}
                  title="Export CSV"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    border: `1px solid ${T.border.default}`,
                    background: T.bg.elevated,
                    color: T.text.dim,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 7,
                    fontWeight: 800,
                    fontFamily: T.font.mono,
                  }}
                >
                  CSV
                </button>
                <button
                  onClick={() => void handleExportJson()}
                  title="Export JSON"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    border: `1px solid ${T.border.default}`,
                    background: T.bg.elevated,
                    color: T.text.dim,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 7,
                    fontWeight: 800,
                    fontFamily: T.font.mono,
                  }}
                >
                  JSON
                </button>
              </div>
            </div>

            {/* Select All bar */}
            {selMode && audits.length > 0 && (
              <div
                onClick={toggleAll}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  marginBottom: 12,
                  borderRadius: 10,
                  background: `${T.bg.elevated}D0`,
                  cursor: "pointer",
                  border: `1px solid ${T.border.subtle}`,
                }}
              >
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    flexShrink: 0,
                    border: `2px solid ${allSel ? "transparent" : T.text.dim}`,
                    background: allSel ? T.accent.primary : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {allSel && <CheckCircle size={10} color={T.bg.base} strokeWidth={3} />}
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: T.text.secondary }}>
                  {allSel ? "Deselect all" : "Select all"}
                </span>
                {sel.size > 0 && (
                  <Mono size={9} color={T.accent.primary} style={{ marginLeft: "auto" }}>
                    {sel.size} selected
                  </Mono>
                )}
              </div>
            )}

            {/* Filter pills — inline, no wrapping */}
            <div style={{ display: "flex", gap: 6 }}>
              {[null, "GREEN", "YELLOW", "RED"].map((f) => {
                const active = statusFilter === f;
                const label = f || "All";
                const c = colorFor(f);
                const count = f ? audits.filter((a) => getAuditColor(a) === f).length : audits.length;
                return (
                  <button
                    key={label}
                    onClick={() => {
                      setStatusFilter(f);
                      setSel(new Set());
                      setConfirmDelete(null);
                    }}
                    style={{
                      flex: 1,
                      padding: "6px 0",
                      borderRadius: 8,
                      fontSize: 10,
                      fontWeight: 800,
                      border: `1px solid ${active ? `${c}50` : T.border.subtle}`,
                      background: active ? `${c}14` : "transparent",
                      color: active ? c : T.text.dim,
                      cursor: "pointer",
                      fontFamily: T.font.mono,
                      letterSpacing: "0.02em",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      transition: "all .2s ease",
                    }}
                  >
                    {f && <div style={{ width: 5, height: 5, borderRadius: "50%", background: c }} />}
                    {count}
                  </button>
                );
              })}
            </div>
          </Card>

          {filteredAudits.length === 0 && audits.length > 0 ? (
            <EmptyState icon={Filter} title={`No ${statusFilter} Audits`} message="Try a different filter or run a new audit." />
          ) : audits.length === 0 ? null : (
            <div style={{ display: "grid", gap: 8 }}>
              {(() => {
                let lastMonth: string | null = null;
                return filteredAudits.map((a, i) => {
                  const monthKey = getMonthKey(a.date || a.ts);
                  const showMonthHeader = monthKey !== lastMonth;
                  lastMonth = monthKey;
                  const auditKey = getAuditKey(a, i);
                  const isConfirming = confirmDelete === auditKey;
                  const auditColor = getAuditColor(a);
                  const cardHex = colorFor(auditColor);
                  const scoreValue = a.parsed?.healthScore?.score;
                  const gradeLabel = scoreValue != null ? getGradeLetter(scoreValue) : null;
                  const debtTotal = (a.form?.debts ?? []).reduce((sum, debt) => sum + (Number(debt.balance) || 0), 0);
                  const checkingVal = a.form?.checking != null ? Number(a.form.checking) || 0 : null;

                  return (
                    <div key={auditKey}>
                      {showMonthHeader && (
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: i > 0 ? 8 : 0, marginBottom: 6 }}>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              color: T.text.dim,
                              fontFamily: T.font.mono,
                              letterSpacing: "0.05em",
                              textTransform: "uppercase",
                            }}
                          >
                            {monthKey}
                          </span>
                          <div style={{ flex: 1, height: 1, background: T.border.subtle }} />
                        </div>
                      )}
                      <Card
                        {...(isConfirming
                          ? {}
                          : { onClick: selMode ? () => toggle(auditKey) : () => onViewResult(a) })}
                        style={{
                          padding: "14px 16px",
                          position: "relative",
                          overflow: "hidden",
                          cursor: isConfirming ? "default" : "pointer",
                          borderColor: sel.has(auditKey) ? `${T.accent.primary}35` : `${cardHex}20`,
                          background: isConfirming
                            ? `${T.status.red}06`
                            : sel.has(auditKey)
                              ? `${T.accent.primary}08`
                              : T.bg.card,
                          transition: "all 0.2s ease",
                        }}
                      >
                        {/* Color accent strip */}
                        <div
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: 3,
                            background: cardHex,
                            opacity: 0.9,
                          }}
                        />

                        {isConfirming ? (
                          <div style={{ display: "grid", gap: 12 }}>
                            <div style={{ fontSize: 13, fontWeight: 800, color: T.status.red }}>
                              Delete the {fmtDate(a.date)} audit?
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDelete(a);
                                  setConfirmDelete(null);
                                }}
                                style={{
                                  flex: 1,
                                  height: 38,
                                  borderRadius: 10,
                                  border: "none",
                                  background: T.status.red,
                                  color: "white",
                                  fontSize: 12,
                                  fontWeight: 800,
                                  cursor: "pointer",
                                }}
                              >
                                Delete
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDelete(null);
                                }}
                                className="btn-secondary"
                                style={{ flex: 1, height: 38 }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ position: "relative", display: "grid", gap: 10 }}>
                            {/* Row 1: Score pill + Date + Actions */}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                                {/* Score/Status pill */}
                                <div
                                  style={{
                                    minWidth: 44,
                                    height: 26,
                                    padding: "0 9px",
                                    borderRadius: 7,
                                    background: `${cardHex}14`,
                                    border: `1px solid ${cardHex}30`,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 4,
                                    color: cardHex,
                                    fontSize: 11,
                                    fontWeight: 800,
                                    fontFamily: T.font.mono,
                                    flexShrink: 0,
                                  }}
                                >
                                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: cardHex }} />
                                  {scoreValue != null ? `${gradeLabel}` : auditColor.slice(0, 3)}
                                </div>

                                {/* Date + relative time */}
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 15, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>
                                      {fmtDate(a.date)}
                                    </span>
                                    {a.isTest && <Badge variant="amber">TEST</Badge>}
                                  </div>
                                  <div style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono, marginTop: 1 }}>
                                    {relativeTime(a.date || a.ts)}
                                    {scoreValue != null && ` · ${scoreValue} pts`}
                                  </div>
                                </div>
                              </div>

                              {/* Actions */}
                              <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                                {selMode ? (
                                  <div
                                    style={{
                                      width: 18,
                                      height: 18,
                                      borderRadius: 5,
                                      border: `2px solid ${sel.has(auditKey) ? "transparent" : T.text.dim}`,
                                      background: sel.has(auditKey) ? T.accent.primary : "transparent",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                    }}
                                  >
                                    {sel.has(auditKey) && <CheckCircle size={11} color={T.bg.base} strokeWidth={3} />}
                                  </div>
                                ) : (
                                  <>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExportAuditRecord(a);
                                      }}
                                      style={{
                                        width: 30,
                                        height: 30,
                                        borderRadius: 8,
                                        border: `1px solid ${T.border.subtle}`,
                                        background: T.bg.elevated,
                                        color: T.text.dim,
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                      }}
                                    >
                                      <Download size={12} />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setConfirmDelete(auditKey);
                                        haptic.warning();
                                      }}
                                      style={{
                                        width: 30,
                                        height: 30,
                                        borderRadius: 8,
                                        border: `1px solid ${T.status.red}20`,
                                        background: `${T.status.red}08`,
                                        color: T.status.red,
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                      }}
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Row 2: Inline metrics */}
                            {(checkingVal != null || debtTotal > 0 || a.parsed?.netWorth != null) && (
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 12,
                                  paddingTop: 8,
                                  borderTop: `1px solid ${T.border.subtle}`,
                                  fontSize: 11,
                                  fontFamily: T.font.mono,
                                  fontWeight: 700,
                                }}
                              >
                                {a.parsed?.netWorth != null && (
                                  <span style={{ color: T.text.secondary }}>
                                    <span style={{ color: T.text.dim, fontSize: 9, letterSpacing: "0.04em" }}>NW </span>
                                    {fmt(a.parsed.netWorth)}
                                  </span>
                                )}
                                {checkingVal != null && (
                                  <span style={{ color: T.text.secondary }}>
                                    <span style={{ color: T.accent.emerald, fontSize: 9, letterSpacing: "0.04em" }}>CHK </span>
                                    {fmt(checkingVal)}
                                  </span>
                                )}
                                {debtTotal > 0 && (
                                  <span style={{ color: T.status.red }}>
                                    <span style={{ fontSize: 9, letterSpacing: "0.04em" }}>DEBT </span>
                                    {fmt(debtTotal)}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* subtitle omitted — noisy at list density */}
                          </div>
                        )}
                      </Card>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
        )}

        {/* AI Disclaimer */}
        <p style={{ fontSize: 9, color: T.text.muted, textAlign: "center", marginTop: 20, lineHeight: 1.5, opacity: 0.6 }}>
          AI-generated educational content only · Not professional financial advice
        </p>
      </div>
    </div>
  );
});
