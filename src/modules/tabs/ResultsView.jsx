import { useState, memo } from "react";
import {
  TrendingUp,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
  Activity,
  RefreshCw,
  CheckSquare,
  Target,
  Zap,
  CheckCircle,
  Share2,
} from "lucide-react";
import { T } from "../constants.js";
import { fmtDate, stripPaycheckParens, exportAudit } from "../utils.js";
import { Card, Badge, InlineTooltip } from "../ui.jsx";
import { Mono, Section, MoveRow, Md } from "../components.jsx";
import { haptic } from "../haptics.js";

import { useSettings } from "../contexts/SettingsContext";
import { useAudit } from "../contexts/AuditContext";
import { useNavigation } from "../contexts/NavigationContext.jsx";

const ReportSection = ({ title, icon: Icon, content, accentColor, badge, isLast }) => {
  if (!content || !content.trim()) return null;
  return (
    <div style={{ padding: "28px 0", borderBottom: isLast ? "none" : `1px solid ${T.border.subtle}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        {Icon && (
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `${accentColor}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon size={18} color={accentColor} strokeWidth={2.5} />
          </div>
        )}
        <h2 style={{ fontSize: 20, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.02em", margin: 0 }}>{title}</h2>
        {badge}
      </div>
      <Md text={content} />
    </div>
  );
};

export default memo(function ResultsView({ audit, moveChecks, onToggleMove, streak = 0, onBack }) {
  const { history } = useAudit();
  const { navTo } = useNavigation();

  const [showRaw, setShowRaw] = useState(false);
  if (!audit)
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "60vh",
          padding: 32,
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: 14, fontWeight: 600, color: T.text.dim }}>No results yet</p>
      </div>
    );
  const p = audit.parsed || {};
  const sections = p.sections || {};
  const form = audit.form || {};

  const handleExitResults = () => {
    if (onBack) return onBack();
    navTo("dashboard");
  };

  return (
    <div className="page-body" style={{ paddingBottom: 0 }}>
      <div
        style={{ padding: "14px 0 12px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}
      >
        <div>
          <button
            onClick={handleExitResults}
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
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Full Results</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <Mono size={11} color={T.text.dim}>
              {fmtDate(audit.date)}
            </Mono>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          {audit.isTest && <Badge variant="amber">TEST · NOT SAVED</Badge>}
          <button
            onClick={() => exportAudit(audit)}
            title="Export Audit"
            style={{
              width: 36,
              height: 36,
              borderRadius: T.radius.md,
              border: `1px solid ${T.border.default}`,
              background: T.bg.elevated,
              color: T.text.secondary,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all .2s",
            }}
          >
            <Share2 size={15} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Completion Progress Ring */}
      {p?.moveItems?.length > 0 &&
        (() => {
          const done = Object.values(moveChecks).filter(Boolean).length;
          const total = p.moveItems.length;
          const pct = Math.round((done / total) * 100);
          const pctColor =
            pct >= 100 ? T.status.green : pct >= 80 ? T.status.green : pct >= 40 ? T.status.amber : T.text.dim;
          const allDone = pct >= 100;
          const circumference = 2 * Math.PI * 16; // r=16
          const strokeOffset = circumference - (circumference * pct) / 100;
          return (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "12px 16px",
                background: allDone ? `${T.status.green}12` : `${pctColor}08`,
                border: `1px solid ${allDone ? T.status.green : pctColor}20`,
                borderRadius: T.radius.lg,
                marginBottom: 10,
                animation: allDone ? "glowPulse 2s ease-in-out infinite" : "fadeInUp .4s ease-out both",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Celebration sparkles when all done */}
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
              {/* SVG Progress Ring */}
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
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary }}>
                  {done}/{total} Moves Complete
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: allDone ? T.status.green : T.text.dim,
                    fontWeight: allDone ? 700 : 400,
                  }}
                >
                  {allDone
                    ? "All moves executed! Financial momentum secured 🔥"
                    : `${total - done} remaining — keep crushing it`}
                </div>
              </div>
            </div>
          );
        })()}

      {/* ── THE FINANCIAL REPORT DOCUMENT ── */}
      <Card
        className="slide-up"
        style={{
          padding: "8px 20px 20px",
          marginTop: 16,
          background: T.bg.card,
          border: `1px solid ${T.border.default}`,
          boxShadow: `0 12px 40px ${T.shadow.base}`,
        }}
      >
      {sections.alerts &&
        !/^\s*(no\s*alerts|omit|none|\[\])\s*$/i.test(sections.alerts) &&
        sections.alerts.length > 5 && (
          <div
            style={{
              padding: "20px 24px",
              margin: "24px -4px",
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
              <span style={{ fontSize: 16, fontWeight: 800, color: T.status.amber }}>Critical Alerts</span>
            </div>
            <Md text={sections.alerts} />
          </div>
        )}

      {sections.nextAction && (
        <div style={{ padding: "28px 0", borderBottom: `1px solid ${T.border.subtle}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
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
            <h2 style={{ fontSize: 18, fontWeight: 800, color: T.accent.primary, margin: 0, letterSpacing: "-0.01em" }}>Immediate Next Action</h2>
          </div>
          <Md text={stripPaycheckParens(sections.nextAction)} />
        </div>
      )}

      <ReportSection
        title="Executive Summary"
        icon={Activity}
        content={sections.dashboard}
        accentColor={T.accent.primary}
        badge={<Badge variant="teal">STATE OF THE UNION</Badge>}
      />
      {p.moveItems?.length > 0 && (
        <div style={{ padding: "28px 0", borderBottom: `1px solid ${T.border.subtle}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: T.accent.primaryDim,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <CheckSquare size={18} color={T.accent.primary} strokeWidth={2.5} />
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>Tactical Playbook</h2>
            </div>
            <Mono size={12} color={T.text.dim}>
              {Object.values(moveChecks).filter(Boolean).length}/{p.moveItems.length} Complete
            </Mono>
          </div>
          <div style={{ background: `${T.bg.elevated}50`, borderRadius: T.radius.lg, padding: "8px 16px" }}>
            {p.moveItems.map((m, i) => (
              <MoveRow key={i} item={m} index={i} checked={moveChecks[i] || false} onToggle={() => onToggleMove(i)} />
            ))}
          </div>
        </div>
      )}

      <ReportSection
        title="Radar — 90 Days"
        icon={Target}
        content={sections.radar}
        accentColor={T.status.amber}
      />
      <ReportSection
        title="Long-Range Radar"
        icon={Clock}
        content={sections.longRange}
        accentColor={T.text.secondary}
      />
      <ReportSection
        title="Forward Radar"
        icon={TrendingUp}
        content={sections.forwardRadar}
        accentColor={T.status.blue}
      />
      <ReportSection
        title="Investments & Roth"
        icon={TrendingUp}
        content={sections.investments}
        accentColor={T.accent.primary}
        isLast={true}
      />
      </Card>

      {/* ── FREEDOM JOURNEY SUMMARY ── */}
      <Card
        className="slide-up"
        style={{
          animationDelay: "0.35s",
          background: `linear-gradient(135deg, ${T.status.green}0A, ${T.status.blue}0A)`,
          borderColor: `${T.status.green}20`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
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
          <span style={{ fontSize: 13, fontWeight: 800, color: T.text.primary }}>Freedom Journey</span>
        </div>

        {(() => {
          const realAudits = history.filter(a => !a.isTest && a.form);
          if (realAudits.length < 2)
            return (
              <div
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "12px 0" }}
              >
                <div style={{ fontSize: 28 }}>🌱</div>
                <p style={{ fontSize: 12, color: T.text.dim, textAlign: "center", lineHeight: 1.5 }}>
                  Complete <strong style={{ color: T.text.secondary }}>2+ weekly audits</strong> to unlock your Freedom
                  Journey — tracking momentum, projected debt-free dates, and net worth trajectory.
                </p>
              </div>
            );

          const latest = realAudits[0];
          const prev = realAudits[1];
          const parts = [];

          // 1. Debt-free estimate
          const debtValues = realAudits
            .slice(0, 4)
            .map(a => (a.form?.debts || []).reduce((s, d) => s + (parseFloat(d.balance) || 0), 0))
            .reverse();
          if (debtValues.length >= 2 && debtValues[0] > 100) {
            const weeklyPaydown = (debtValues[0] - debtValues[debtValues.length - 1]) / (debtValues.length - 1);
            if (weeklyPaydown > 10) {
              const freeDate = new Date();
              freeDate.setDate(freeDate.getDate() + Math.ceil(debtValues[debtValues.length - 1] / weeklyPaydown) * 7);
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

          // 2. Net Worth Delta (vs last audit)
          const lNW = latest.parsed?.netWorth;
          const pNW = prev.parsed?.netWorth;
          if (lNW != null && pNW != null) {
            const delta = lNW - pNW;
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

          // 3. Score Factor
          const lScore = latest.parsed?.healthScore?.score;
          const pScore = prev.parsed?.healthScore?.score;
          if (lScore != null && pScore != null && Math.abs(lScore - pScore) >= 2) {
            const lForm = latest.form || {};
            const pForm = prev.form || {};
            const factors = [];
            const lChecking = parseFloat(lForm.checking) || 0;
            const pChecking = parseFloat(pForm.checking) || 0;
            if (Math.abs(lChecking - pChecking) > 100)
              factors.push({ name: "Cash Flow", delta: lChecking - pChecking });
            const lDebt = (lForm.debts || []).reduce((s, d) => s + (parseFloat(d.balance) || 0), 0);
            const pDebt = (pForm.debts || []).reduce((s, d) => s + (parseFloat(d.balance) || 0), 0);
            if (Math.abs(lDebt - pDebt) > 50) factors.push({ name: "Debt Paydown", delta: pDebt - lDebt });
            const lSave = parseFloat(lForm.ally || lForm.savings) || 0;
            const pSave = parseFloat(pForm.ally || pForm.savings) || 0;
            if (Math.abs(lSave - pSave) > 50) factors.push({ name: "Savings Growth", delta: lSave - pSave });

            if (factors.length > 0) {
              const biggest = factors.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
              const diff = lScore - pScore;
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

          return parts.length > 0 ? (
            parts
          ) : (
            <p style={{ fontSize: 11, color: T.text.dim }}>Not enough varied data to compute momentum yet.</p>
          );
        })()}
      </Card>

      {/* ── HOW THE MATH WORKS ── */}
      <Card className="slide-up" style={{ animationDelay: "0.38s", background: T.bg.elevated }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
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
          <span style={{ fontSize: 13, fontWeight: 800, color: T.text.primary }}>How the Math Works</span>
        </div>
        <div
          style={{
            fontSize: 11,
            color: T.text.secondary,
            lineHeight: 1.5,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <p>
            <strong>
              1. <InlineTooltip>Floor</InlineTooltip> Protection:
            </strong>{" "}
            We subtract your global floor and buffers from your checking balance to find your{" "}
            <em>
              <InlineTooltip term="Available">Available Capital</InlineTooltip>
            </em>
            .
          </p>
          <p>
            <strong>2. Time-Critical Bills:</strong> We scan radar for bills due before your next payday and reserve
            those funds immediately.
          </p>
          <p>
            <strong>3. Minimums & Transfers:</strong> Minimum debt payments and active savings goals (vaults/
            <InlineTooltip term="Sinking fund">sinking funds</InlineTooltip>) are funded next.
          </p>
          <p>
            <strong>4. Debt Target Selection:</strong> If you have <em>Surplus Capital</em> left over, we analyze ALL
            your card APRs and balances to find the mathematically perfect target (highest APR avalanche, or lowest
            balance snowball if configured).
          </p>
          <p>
            <strong>5. Surplus Allocation:</strong> We apply the surplus to the selected target debt to accelerate
            payoff, dynamically calculating the updated timeline. If configured, we can optimize for a{" "}
            <em>
              <InlineTooltip>Promo sprint</InlineTooltip>
            </em>
            .
          </p>
        </div>
      </Card>

      {sections.qualityScore && (
        <Card
          style={{ marginTop: 16 }}
        >
          <ReportSection
            title="Quality Score"
            icon={CheckCircle}
            content={sections.qualityScore}
            accentColor={T.status.green}
            isLast={!sections.autoUpdates}
          />
          {sections.autoUpdates && (
            <ReportSection
              title="Auto-Updates"
              icon={RefreshCw}
              content={sections.autoUpdates}
              accentColor={T.text.dim}
              isLast={true}
            />
          )}
        </Card>
      )}
      {!sections.qualityScore && sections.autoUpdates && (
        <Card style={{ marginTop: 16 }}>
          <ReportSection
            title="Auto-Updates"
            icon={RefreshCw}
            content={sections.autoUpdates}
            accentColor={T.text.dim}
            isLast={true}
          />
        </Card>
      )}
      <Card style={{ background: T.bg.elevated }}>
        <div
          onClick={() => setShowRaw(!showRaw)}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setShowRaw(!showRaw);
            }
          }}
          role="button"
          tabIndex={0}
          aria-expanded={showRaw}
          aria-label="Toggle raw output"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            minHeight: 36,
          }}
        >
          <span style={{ fontSize: 11, color: T.text.dim, fontWeight: 600 }}>Raw Output</span>
          {showRaw ? <ChevronUp size={13} color={T.text.dim} /> : <ChevronDown size={13} color={T.text.dim} />}
        </div>
        {showRaw && (
          <pre
            style={{
              fontSize: 10,
              lineHeight: 1.6,
              color: T.text.secondary,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              marginTop: 10,
              maxHeight: 500,
              overflow: "auto",
              fontFamily: T.font.mono,
              padding: 12,
              background: T.bg.card,
              borderRadius: T.radius.md,
            }}
          >
            {p.raw}
          </pre>
        )}
      </Card>

      {/* Legal Disclaimer — always visible */}
      <div
        style={{
          marginTop: 12,
          padding: "14px 16px",
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
          <strong style={{ color: T.text.dim }}>Disclaimer:</strong> This analysis is generated by AI for educational
          and informational purposes only. It is <strong>not</strong> professional financial, tax, legal, or investment
          advice. Always consult a licensed financial advisor before making financial decisions. The app developer
          assumes no liability for actions taken based on this output.
        </p>
      </div>
    </div>
  );
});
