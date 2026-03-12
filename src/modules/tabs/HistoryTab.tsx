import React, {
  memo,
  lazy,
  Suspense,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Calendar, Download, CheckCircle, Trash2, Edit3, Plus, Filter, type LucideIcon } from "lucide-react";
import { T } from "../constants.js";
import { fmt, fmtDate, exportAudit, exportAllAudits, exportSelectedAudits, exportAuditCSV } from "../utils.js";
import { Card as UICard, Badge as UIBadge } from "../ui.jsx";
import { Mono as UIMono, EmptyState as UIEmptyState } from "../components.jsx";
import { haptic } from "../haptics.js";
import { shouldShowGating } from "../subscription.js";
import ProBannerBase from "./ProBanner.jsx";

import { useAudit } from "../contexts/AuditContext.js";
import { useNavigation } from "../contexts/NavigationContext.jsx";
import type { AuditFormDebt, AuditFormInvestment, AuditRecord } from "../../types/index.js";

const LazyProPaywall = lazy(() => import("./ProPaywall.jsx"));

type AuditStatusFilter = "GREEN" | "YELLOW" | "RED" | null;

interface ToastApi {
  error: (message: string) => void;
}

interface HistoryTabProps {
  toast: ToastApi;
  proEnabled?: boolean;
}

interface NavigationApi {
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

const getGradeLetter = (score: number | null | undefined): string | null => {
  if (score == null) return null;
  if (score >= 97) return "A+";
  if (score >= 93) return "A";
  if (score >= 90) return "A-";
  if (score >= 87) return "B+";
  if (score >= 83) return "B";
  if (score >= 80) return "B-";
  if (score >= 77) return "C+";
  if (score >= 73) return "C";
  if (score >= 70) return "C-";
  if (score >= 67) return "D+";
  if (score >= 60) return "D";
  return "F";
};

const getDebtAmount = (debt: AuditFormDebt): number => {
  const rawAmount = debt.amount ?? debt.balance;
  return parseFloat(String(rawAmount)) || 0;
};

const getInvestmentAmount = (investment: AuditFormInvestment): number => parseFloat(String(investment.amount)) || 0;

const STATUS_FILTERS: AuditStatusFilter[] = [null, "GREEN", "YELLOW", "RED"];

export default memo(function HistoryTab({ toast, proEnabled = false }: HistoryTabProps) {
  const { history: audits, deleteHistoryItem: onDelete, handleManualImport } = useAudit();
  const { navTo, setResultsBackTarget } = useNavigation() as NavigationApi;

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

  const doExportSel = (): void => {
    exportSelectedAudits(filteredAudits.filter((_, index) => sel.has(index)));
    exitSel();
  };

  return (
    <div className="page-body" style={{ paddingBottom: 0, display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
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
            <TypedLazyProPaywall onClose={() => setShowPaywall(false)} />
          </Suspense>
        )}
        <div
          style={{
            paddingTop: 6,
            paddingBottom: 8,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <div>
            <button
              onClick={() => navTo("dashboard")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                marginBottom: 10,
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
            <h1 style={{ fontSize: 22, fontWeight: 800 }}>History</h1>
            <Mono size={11} color={T.text.dim}>
              {audits.length} audits stored
            </Mono>
          </div>
          {audits.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 200 }}>
              {selMode && sel.size > 0 && (
                <button
                  onClick={doExportSel}
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
                  background: T.bg.elevated,
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
                onClick={() => exportAuditCSV(audits)}
                title="Export CSV"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: T.radius.sm,
                  border: `1px solid ${T.border.default}`,
                  background: T.bg.elevated,
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
                onClick={() => exportAllAudits(audits)}
                title="Export All JSON"
                style={{
                  padding: "7px 12px",
                  borderRadius: T.radius.md,
                  border: `1px solid ${T.border.default}`,
                  background: T.bg.elevated,
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
        <div style={{ display: "flex", gap: 10, marginBottom: showManualPaste ? 8 : 16 }}>
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
              background: showManualPaste ? T.bg.card : T.bg.elevated,
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
          <div style={{ marginBottom: 16 }}>
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
                background: T.bg.elevated,
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
              marginBottom: 8,
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
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
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
                    background: active ? `${color}18` : T.bg.elevated,
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
                                  exportAudit(audit);
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
