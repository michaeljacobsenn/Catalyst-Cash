import { T } from "../../constants.js";
import { haptic } from "../../haptics.js";
import { AlertCircle, AlertTriangle, ChevronDown, ChevronUp, Loader2, TrendingUp, Zap } from "../../icons";
import { Badge } from "../../ui.js";
import { isLikelyNetworkError } from "../../networkErrors.js";

interface ValidationIssue {
  message: string;
}

interface PlaidTransaction {
  id?: string;
  date: string;
  amount: number;
  description: string;
  category?: string;
  accountName?: string;
}

interface AuditQuota {
  remaining: number;
  limit: number;
  monthlyCap?: number;
  monthlyUsed?: number;
  softBlocked?: boolean;
}

interface ErrorBannerProps {
  error: string | null;
}

interface ValidationFeedbackProps {
  validationErrors: ValidationIssue[];
  validationWarnings: ValidationIssue[];
}

interface PlaidTransactionsCardProps {
  plaidTransactions: PlaidTransaction[];
  txnFetchedAt: string | number | null;
  showTxns: boolean;
  setShowTxns: (value: boolean | ((prev: boolean) => boolean)) => void;
}

interface AuditQuotaNoticeProps {
  auditQuota: AuditQuota | null;
}

interface ChatQuotaState {
  allowed: boolean;
  remaining: number;
  limit: number;
  used: number;
  modelId?: string;
  alternateModel?: string;
  alternateRemaining?: number;
  softBlocked?: boolean;
}

interface ModelChatQuotaWidgetProps {
  chatQuota: ChatQuotaState | null;
  setAiModel: (m: string) => void;
  proEnabled?: boolean;
}

interface SubmitBarProps {
  canSubmit: boolean;
  isLoading: boolean;
  isTestMode: boolean;
  setIsTestMode: (value: boolean | ((prev: boolean) => boolean)) => void;
  onSubmit: () => void;
}

export function InputFormErrorBanner({ error }: ErrorBannerProps) {
  if (!error) return null;
  const isNetworkError = isLikelyNetworkError(error);
  return (
    <div
      style={{
        marginBottom: 12,
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "12px 14px",
        borderRadius: T.radius.lg,
        background: isNetworkError ? `${T.status.amber}12` : T.status.redDim,
        border: `1px solid ${isNetworkError ? `${T.status.amber}35` : `${T.status.red}30`}`,
        boxShadow: T.shadow.card,
      }}
    >
      <AlertTriangle size={16} color={isNetworkError ? T.status.amber : T.status.red} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: T.text.primary, marginBottom: 4, letterSpacing: "0.01em" }}>
          {isNetworkError ? "Audit service unavailable" : "Audit blocked"}
        </div>
        <div style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.5 }}>{error}</div>
        {isNetworkError && (
          <div style={{ marginTop: 6, fontSize: 11, color: T.text.dim, lineHeight: 1.5 }}>
            Retry uses the same financial inputs. Nothing you entered was cleared.
          </div>
        )}
      </div>
    </div>
  );
}

export function ValidationFeedback({ validationErrors, validationWarnings }: ValidationFeedbackProps) {
  if (!validationErrors.length && !validationWarnings.length) return null;
  const renderRow = (issue: ValidationIssue, key: string, amber = false) => (
    <div
      key={key}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 12px",
        borderRadius: T.radius.md,
        background: amber ? T.status.amberDim : T.status.redDim,
        border: `1px solid ${amber ? `${T.status.amber}30` : `${T.status.red}30`}`,
        animation: "fadeIn .3s ease-out",
      }}
    >
      <AlertCircle size={14} color={amber ? T.status.amber : T.status.red} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: amber ? T.status.amber : T.status.red, fontWeight: 600, lineHeight: 1.4 }}>
        {issue.message}
      </span>
    </div>
  );
  return (
    <div style={{ marginBottom: 10, display: "flex", flexDirection: "column", gap: 6 }}>
      {validationErrors.map((issue, index) => renderRow(issue, `err-${index}`))}
      {validationWarnings.map((issue, index) => renderRow(issue, `warn-${index}`, true))}
    </div>
  );
}

export function PlaidTransactionsCard({
  plaidTransactions,
  txnFetchedAt,
  showTxns,
  setShowTxns,
}: PlaidTransactionsCardProps) {
  if (!plaidTransactions.length) return null;
  return (
    <div style={{ marginBottom: 12, overflow: "hidden", border: `1px solid ${T.border.subtle}`, borderRadius: T.radius.xl, padding: 16, background: T.bg.card }}>
      <button
        onClick={() => setShowTxns((prev) => !prev)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 0,
          border: "none",
          background: "none",
          cursor: "pointer",
          color: T.text.primary,
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <TrendingUp size={15} color={T.accent.primary} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>Recent Spending</span>
          <Badge style={{ background: T.accent.primary + "20", color: T.accent.primary, fontSize: 10, fontWeight: 800 }}>
            {plaidTransactions.length} txns
          </Badge>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.status.red, fontFamily: T.font.mono }}>
            -$
            {plaidTransactions.reduce((sum, txn) => sum + txn.amount, 0).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
          {showTxns ? <ChevronUp size={14} color={T.text.muted} /> : <ChevronDown size={14} color={T.text.muted} />}
        </div>
      </button>
      {txnFetchedAt && (
        <p style={{ fontSize: 10, color: T.text.dim, marginTop: 4, marginBottom: showTxns ? 8 : 0 }}>
          Synced {new Date(txnFetchedAt).toLocaleDateString()} · Last 7 days · Auto-included in audit
        </p>
      )}
      {showTxns && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 280, overflowY: "auto" }}>
          {plaidTransactions.map((txn, index) => (
            <div
              key={txn.id || index}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "6px 0",
                borderTop: index > 0 ? `1px solid ${T.border.subtle}` : "none",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: T.text.primary,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {txn.description}
                </div>
                <div style={{ fontSize: 10, color: T.text.dim, marginTop: 1 }}>
                  {txn.date} · {txn.category || "Uncategorized"}
                  {txn.accountName ? ` · ${txn.accountName}` : ""}
                </div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.status.red, flexShrink: 0, marginLeft: 8 }}>
                -${txn.amount.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AuditQuotaNotice({ auditQuota }: AuditQuotaNoticeProps) {
  if (!auditQuota) return null;
  return (
    <>
      {auditQuota.limit !== Infinity && (
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: auditQuota.remaining > 0 ? T.text.secondary : T.status.red }}>
            {auditQuota.remaining > 0
              ? `This will use 1 of ${auditQuota.remaining} weekly audit${auditQuota.remaining === 1 ? "" : "s"} remaining`
              : "Weekly audit limit reached — upgrade for 20/month"}
          </span>
        </div>
      )}
      {auditQuota.limit === Infinity &&
        auditQuota.monthlyCap !== undefined &&
        auditQuota.monthlyUsed !== undefined &&
        auditQuota.monthlyCap !== Infinity && (
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: auditQuota.monthlyCap - auditQuota.monthlyUsed > 0 ? T.text.secondary : T.status.red,
              }}
            >
              {auditQuota.monthlyCap - auditQuota.monthlyUsed > 0
                ? `This will use 1 of ${Math.max(0, auditQuota.monthlyCap - auditQuota.monthlyUsed)} monthly Pro audits remaining`
                : "Monthly Pro audit limit reached — resets next billing cycle"}
            </span>
          </div>
        )}
      {auditQuota.softBlocked && (
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.status.amber }}>
            You've exceeded the free quota — upgrade to Catalyst Cash Pro for higher limits
          </span>
        </div>
      )}
    </>
  );
}

/**
 * Shows the Pro per-model AskAI chat remaining on the Run Audit page.
 * When the current model is exhausted, offers a one-tap switch to the alternate.
 */
export function ModelChatQuotaWidget({ chatQuota, setAiModel, proEnabled }: ModelChatQuotaWidgetProps) {
  if (!chatQuota || chatQuota.limit === Infinity || !proEnabled) return null;

  const modelLabel = chatQuota.modelId === "gpt-4.1" ? "CFO" : chatQuota.modelId === "gemini-2.5-flash" ? "Flash" : null;
  const altLabel = chatQuota.alternateModel === "gpt-4.1" ? "Catalyst AI CFO" : chatQuota.alternateModel === "gemini-2.5-flash" ? "Catalyst AI" : null;
  const altModelFull = chatQuota.alternateModel === "gpt-4.1" ? "Catalyst AI CFO" : "Catalyst AI";

  // Only show if this is a Pro per-model quota
  if (!modelLabel) return null;

  const isExhausted = chatQuota.remaining === 0;

  if (isExhausted && chatQuota.alternateModel && (chatQuota.alternateRemaining ?? 0) > 0) {
    return (
      <div style={{
        marginBottom: 12,
        padding: "10px 14px",
        borderRadius: 14,
        background: "rgba(220,177,91,0.08)",
        border: "1px solid rgba(220,177,91,0.22)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, marginBottom: 2 }}>
            {modelLabel === "CFO" ? "Catalyst AI CFO" : "Catalyst AI"} daily AskAI limit reached
          </div>
          <div style={{ fontSize: 12, color: T.text.secondary }}>
            Switch to {altLabel} — {chatQuota.alternateRemaining} chats remaining today
          </div>
        </div>
        <button
          style={{
            padding: "7px 13px",
            borderRadius: 10,
            background: "linear-gradient(135deg,#dcb15b,#f3d084)",
            border: "none",
            color: "#07111a",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
          onClick={() => {
            setAiModel(chatQuota.alternateModel ?? "");
            haptic.light();
          }}
        >
          Switch
        </button>
      </div>
    );
  }

  // Show a small quota indicator when there are chats left
  if (chatQuota.remaining > 0 && chatQuota.remaining <= 5) {
    return (
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: chatQuota.remaining <= 2 ? T.status.red : T.text.secondary }}>
          {chatQuota.remaining} {altModelFull} AskAI chat{chatQuota.remaining === 1 ? "" : "s"} remaining today
        </span>
      </div>
    );
  }

  return null;
}

export function SubmitBar({ canSubmit, isLoading, isTestMode, setIsTestMode, onSubmit }: SubmitBarProps) {
  return (
    <div
      style={{
        position: "sticky",
        bottom: 0,
        zIndex: 40,
        marginTop: 12,
        padding: "20px 0 calc(env(safe-area-inset-bottom, 0px) + 10px)",
        background: `linear-gradient(to top, ${T.bg.base} 72%, rgba(6,8,15,0.78) 90%, transparent)`,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex",
        gap: 10,
        alignItems: "center",
      }}
    >
      {canSubmit && (
        <div
          style={{
            position: "absolute",
            left: "16%",
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 18px)",
            width: "68%",
            height: 40,
            background: isTestMode ? T.status.amber : T.accent.primary,
            filter: "blur(32px)",
            opacity: 0.3,
            borderRadius: "50%",
            pointerEvents: "none",
            animation: "pulse 3s ease-in-out infinite",
          }}
        />
      )}
      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        style={{
          flex: 1,
          padding: "16px 18px",
          borderRadius: 100,
          border: `1px solid ${canSubmit ? "rgba(255,255,255,0.15)" : "transparent"}`,
          background: canSubmit
            ? isTestMode
              ? `linear-gradient(135deg,${T.status.amber},#d97706)`
              : `linear-gradient(135deg,${T.accent.primary},#6C60FF)`
            : T.bg.elevated,
          color: canSubmit ? "#fff" : T.text.dim,
          fontSize: 17,
          fontWeight: 800,
          cursor: canSubmit ? "pointer" : "not-allowed",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          minHeight: 56,
          boxShadow: canSubmit ? `0 8px 24px ${isTestMode ? T.status.amber : T.accent.primary}40, inset 0 1px 1px rgba(255,255,255,0.2)` : "none",
          transition: "all 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
          transform: canSubmit ? "scale(1)" : "scale(0.98)",
        }}
      >
        {isLoading ? (
          <>
            <Loader2 size={18} style={{ animation: "spin .8s linear infinite" }} />
            Running...
          </>
        ) : (
          <>
            <Zap size={18} strokeWidth={2.5} />
            {isTestMode ? "Test Audit" : "Run Catalyst Audit"}
          </>
        )}
      </button>

      <button
        onClick={() => canSubmit && setIsTestMode((prev) => !prev)}
        disabled={!canSubmit}
        title="Toggle test mode — audit not saved"
        style={{
          minWidth: 78,
          height: 56,
          borderRadius: 100,
          border: `1px solid ${isTestMode ? T.status.amber : "rgba(255,255,255,0.1)"}`,
          background: isTestMode ? `${T.status.amber}15` : "rgba(255,255,255,0.03)",
          color: canSubmit ? (isTestMode ? T.status.amber : T.text.secondary) : T.text.dim,
          cursor: canSubmit ? "pointer" : "not-allowed",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          flexShrink: 0,
          transition: "all 0.25s ease-out",
          padding: "0 16px",
          fontSize: 12,
          fontWeight: 800,
          fontFamily: T.font.mono,
        }}
      >
        <Zap size={20} strokeWidth={isTestMode ? 3 : 2} fill={isTestMode ? T.status.amber : "none"} />
        {isTestMode ? "TEST" : "LIVE"}
      </button>
    </div>
  );
}
