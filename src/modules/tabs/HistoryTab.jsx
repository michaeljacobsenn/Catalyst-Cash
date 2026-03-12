import { useState, memo, lazy, Suspense } from "react";
import { Calendar, Download, CheckCircle, Trash2, Edit3, Plus, Filter } from "lucide-react";
import { T } from "../constants.js";
import { fmt, fmtDate, exportAudit, exportAllAudits, exportSelectedAudits, exportAuditCSV } from "../utils.js";
import { Card, Badge } from "../ui.jsx";
import { Mono, StatusDot, EmptyState } from "../components.jsx";
import { haptic } from "../haptics.js";
import { shouldShowGating } from "../subscription.js";
import ProBanner from "./ProBanner.jsx";

import { useAudit } from "../contexts/AuditContext.jsx";
import { useNavigation } from "../contexts/NavigationContext.jsx";

const LazyProPaywall = lazy(() => import("./ProPaywall.jsx"));

const relativeTime = d => {
  if (!d) return "";
  const now = Date.now();
  const then = new Date(d).getTime();
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

const getMonthKey = d => {
  if (!d) return "Unknown";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

const getAuditColor = a => {
  const rawStatus = a.parsed?.status || "UNKNOWN";
  const m = rawStatus.match(/^(GREEN|YELLOW|RED)/i);
  return m
    ? m[1].toUpperCase()
    : rawStatus.toUpperCase().includes("GREEN")
      ? "GREEN"
      : rawStatus.toUpperCase().includes("YELLOW")
        ? "YELLOW"
        : rawStatus.toUpperCase().includes("RED")
          ? "RED"
          : "UNKNOWN";
};

const getGradeLetter = score => {
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

export default memo(function HistoryTab({ toast, proEnabled = false }) {
  const { history: audits, deleteHistoryItem: onDelete, handleManualImport } = useAudit();
  const { navTo, setResultsBackTarget } = useNavigation();

  const onSelect = a => {
    if (setResultsBackTarget) setResultsBackTarget("history");
    navTo("results", a);
  };

  const [sel, setSel] = useState(new Set());
  const [selMode, setSelMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showManualPaste, setShowManualPaste] = useState(false);
  const [manualPasteText, setManualPasteText] = useState("");
  const [statusFilter, setStatusFilter] = useState(null); // null | "GREEN" | "YELLOW" | "RED"
  const filteredAudits = statusFilter ? audits.filter(a => getAuditColor(a) === statusFilter) : audits;
  const allSel = sel.size === filteredAudits.length && filteredAudits.length > 0;
  const toggle = i => {
    const s = new Set(sel);
    s.has(i) ? s.delete(i) : s.add(i);
    setSel(s);
  };
  const toggleAll = () => setSel(allSel ? new Set() : new Set(filteredAudits.map((_, i) => i)));
  const exitSel = () => {
    setSelMode(false);
    setSel(new Set());
  };
  const doExportSel = () => {
    exportSelectedAudits(filteredAudits.filter((_, i) => sel.has(i)));
    exitSel();
  };

  const [showPaywall, setShowPaywall] = useState(false);

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
          <LazyProPaywall onClose={() => setShowPaywall(false)} />
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
                setSel(new Set());
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
              handleManualImport(txt);
            } catch (e) {
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
            onChange={e => setManualPasteText(e.target.value)}
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
                  handleManualImport(manualPasteText);
                  setShowManualPaste(false);
                  setManualPasteText("");
                } else toast.error("Text is empty");
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

      {/* ── Status Filter Pills ── */}
      {audits.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {[null, "GREEN", "YELLOW", "RED"].map(f => {
            const active = statusFilter === f;
            const label = f || "All";
            const c =
              f === "GREEN"
                ? T.status.green
                : f === "YELLOW"
                  ? T.status.amber
                  : f === "RED"
                    ? T.status.red
                    : T.text.secondary;
            const count = f ? audits.filter(a => getAuditColor(a) === f).length : audits.length;
            return (
              <button
                key={label}
                onClick={() => {
                  setStatusFilter(f);
                  setSel(new Set());
                }}
                style={{
                  padding: "6px 14px",
                  borderRadius: 99,
                  fontSize: 11,
                  fontWeight: 700,
                  border: `1px solid ${active ? c : T.border.default}`,
                  background: active ? `${c}18` : T.bg.elevated,
                  color: active ? c : T.text.dim,
                  cursor: "pointer",
                  fontFamily: T.font.mono,
                  letterSpacing: "0.03em",
                  transition: "all .2s ease",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                {f && <div style={{ width: 7, height: 7, borderRadius: "50%", background: c }} />}
                {label} <span style={{ opacity: 0.6, fontSize: 10 }}>({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {filteredAudits.length === 0 && audits.length > 0 ? (
        <EmptyState
          icon={Filter}
          title={`No ${statusFilter} Audits`}
          message="Try a different filter or run a new audit."
        />
      ) : audits.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No History Yet"
          message="Perform a financial audit to see your history and trends right here."
        />
      ) : (
        (() => {
          let lastMonth = null;
          return filteredAudits.map((a, i) => {
            const monthKey = getMonthKey(a.date || a.ts);
            const showMonthHeader = monthKey !== lastMonth;
            lastMonth = monthKey;
            const isConfirming = confirmDelete === i;
            const rawStatus = a.parsed?.status || "UNKNOWN";
            let sColor = "UNKNOWN";
            let sText = rawStatus;
            const m = rawStatus.match(/^(GREEN|YELLOW|RED)[\s:;-]*(.*)$/i);
            if (m) {
              sColor = m[1].toUpperCase();
              sText = m[2] ? m[2].trim() : "";
            } else if (rawStatus.toUpperCase().includes("GREEN")) {
              sColor = "GREEN";
              sText = rawStatus.replace(/GREEN/i, "").trim();
            } else if (rawStatus.toUpperCase().includes("YELLOW")) {
              sColor = "YELLOW";
              sText = rawStatus.replace(/YELLOW/i, "").trim();
            } else if (rawStatus.toUpperCase().includes("RED")) {
              sColor = "RED";
              sText = rawStatus.replace(/RED/i, "").trim();
            }
            if (sText.startsWith(":") || sText.startsWith("-")) sText = sText.slice(1).trim();

            const cHex =
              sColor === "GREEN"
                ? T.status.green
                : sColor === "YELLOW"
                  ? T.status.amber
                  : sColor === "RED"
                    ? T.status.red
                    : T.text.muted;

            return (
              <div key={a.ts || i}>
                {showMonthHeader && (
                  <div
                    style={{
                      padding: "6px 0 8px",
                      marginBottom: 4,
                      marginTop: i > 0 ? 10 : 0,
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
                  delay={Math.min(i * 40, 400)}
                  onClick={selMode ? () => toggle(i) : isConfirming ? undefined : () => onSelect(a)}
                  style={{
                    padding: "16px",
                    position: "relative",
                    overflow: "hidden",
                    ...(sel.has(i)
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
                      background: cHex,
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
                      background: `linear-gradient(90deg, ${cHex}15, transparent)`,
                      pointerEvents: "none",
                    }}
                  />
                  {isConfirming ? (
                    <div>
                      <p style={{ fontSize: 12, color: T.status.red, fontWeight: 600, marginBottom: 10 }}>
                        Delete audit from {fmtDate(a.date)}?
                      </p>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            onDelete(a);
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
                          onClick={e => {
                            e.stopPropagation();
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
                      {/* Top Row: Date & Actions */}
                      <div
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          {selMode && (
                            <div
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: 6,
                                flexShrink: 0,
                                border: `2px solid ${sel.has(i) ? "transparent" : T.text.dim}`,
                                background: sel.has(i) ? T.accent.primary : "transparent",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                transition: "all .2s",
                              }}
                            >
                              {sel.has(i) && <CheckCircle size={12} color={T.bg.base} strokeWidth={3} />}
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
                                {fmtDate(a.date)}
                              </span>
                              <span style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono }}>
                                {relativeTime(a.date || a.ts)}
                              </span>
                              {a.isTest && (
                                <Badge variant="amber" style={{ padding: "3px 6px" }}>
                                  TEST
                                </Badge>
                              )}
                            </div>
                            {a.parsed?.netWorth != null && (
                              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 2 }}>
                                <span
                                  style={{ fontSize: 10, fontWeight: 700, color: T.text.dim, letterSpacing: "0.05em" }}
                                >
                                  NET WORTH:
                                </span>
                                <Mono size={13} weight={600} color={T.text.primary}>
                                  {fmt(a.parsed.netWorth)}
                                </Mono>
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 6, position: "relative", zIndex: 2 }}>
                          {!selMode && (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                exportAudit(a);
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
                              onClick={e => {
                                e.stopPropagation();
                                setConfirmDelete(i);
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

                      {/* Health Score + Model Badge Row */}
                      {(a.parsed?.healthScore?.score != null || a.model) && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          {a.parsed?.healthScore?.score != null &&
                            (() => {
                              const score = a.parsed.healthScore.score;
                              const grade = getGradeLetter(score);
                              const scoreColor =
                                score >= 80 ? T.status.green : score >= 60 ? T.status.amber : T.status.red;
                              const circumference = 2 * Math.PI * 11;
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
                          {a.model && (
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
                              {a.model}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Key Metrics Row */}
                      {a.form && (
                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", paddingTop: 10, borderTop: `1px solid ${T.border.subtle}` }}>
                          {a.form.checking != null && (
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: T.text.dim,
                                  letterSpacing: "0.02em",
                                }}
                              >
                                CHK
                              </span>
                              <Mono size={11} weight={600} color={T.text.secondary}>
                                {fmt(parseFloat(a.form.checking) || 0)}
                              </Mono>
                            </div>
                          )}
                          {a.form.debts?.length > 0 && (
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: T.status.red,
                                  letterSpacing: "0.02em",
                                }}
                              >
                                OWED
                              </span>
                              <Mono size={11} weight={600} color={T.text.secondary}>
                                {fmt(a.form.debts.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0))}
                              </Mono>
                            </div>
                          )}
                          {a.form.investments?.length > 0 && (
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: T.status.amber,
                                  letterSpacing: "0.02em",
                                }}
                              >
                                INV
                              </span>
                              <Mono size={11} weight={600} color={T.text.secondary}>
                                {fmt(a.form.investments.reduce((sum, iv) => sum + (parseFloat(iv.amount) || 0), 0))}
                              </Mono>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Status Pill */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          padding: "10px 14px",
                          background: `linear-gradient(135deg, ${cHex}15, ${cHex}05)`,
                          borderRadius: T.radius.md,
                          border: `1px solid ${cHex}30`,
                        }}
                      >
                        <div
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: cHex,
                            boxShadow: `0 0 12px ${cHex}80`,
                            flexShrink: 0,
                            marginTop: 3,
                          }}
                        />
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              color: cHex,
                              letterSpacing: "0.04em",
                              textTransform: "uppercase",
                            }}
                          >
                            {sColor}
                          </span>
                          {(sText || a.parsed?.healthScore?.summary) && (
                            <span style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.4, opacity: 0.9 }}>
                              {sText || a.parsed?.healthScore?.summary}
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
