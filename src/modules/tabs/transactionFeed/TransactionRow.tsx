import type { Card as PortfolioCard } from "../../../types/index.js";

import { T } from "../../constants.js";
import { Sparkles } from "../../icons";
import {
  formatMoney,
  formatRewardRate,
  formatTransactionTime,
  getCategoryLabel,
  getCategoryMeta,
} from "./helpers";
import type { IconComponent, TransactionRecord, TransactionRewardComparison } from "./types";

function getMatchBadgeTone(confidence: TransactionRewardComparison["usedCardMatchConfidence"]) {
  if (confidence === "high") {
    return {
      color: T.status.green,
      background: T.status.greenDim,
      borderColor: T.status.green,
    };
  }

  if (confidence === "medium") {
    return {
      color: T.status.amber,
      background: T.status.amberDim,
      borderColor: T.status.amber,
    };
  }

  return {
    color: T.status.red,
    background: T.status.redDim,
    borderColor: T.status.red,
  };
}

function truncateCardName(name?: string | null) {
  const safeName = name || "Best Card";
  return safeName.length > 18 ? `${safeName.substring(0, 15)}...` : safeName;
}

export interface TransactionRowProps {
  txn: TransactionRecord;
  animationDelay: string;
  categoryIconMap: Record<string, IconComponent>;
  activeCreditCards: PortfolioCard[];
  isReviewing: boolean;
  onToggleReview: () => void;
  onOverrideLink: (
    txn: TransactionRecord,
    override: { linkedCardId?: string | null; linkedBankAccountId?: string | null }
  ) => void | Promise<void>;
}

export function TransactionRow({
  txn,
  animationDelay,
  categoryIconMap,
  activeCreditCards,
  isReviewing,
  onToggleReview,
  onOverrideLink,
}: TransactionRowProps) {
  const meta = getCategoryMeta(txn.category, categoryIconMap, txn.description);
  const categoryLabel = getCategoryLabel(txn.category, txn.description);
  const matchTone = getMatchBadgeTone(txn.rewardComparison?.usedCardMatchConfidence);
  const title = txn.description || txn.name || "Transaction";

  return (
    <div
      className="txn-row"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 16px",
        borderBottom: `1px solid ${T.border.subtle}`,
        animationDelay,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: meta.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {meta.icon && <meta.icon size={18} color={meta.color} strokeWidth={2} />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: T.text.primary,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </span>
          {txn.pending && (
            <span
              className="txn-pending-badge"
              style={{
                fontSize: 9,
                fontWeight: 800,
                color: T.status.amber,
                background: T.status.amberDim,
                padding: "2px 6px",
                borderRadius: 6,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                flexShrink: 0,
              }}
            >
              PENDING
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 11,
            color: T.text.dim,
            marginTop: 2,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {txn.accountName || txn.institution}
          </span>
          {txn.category && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              <span
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {categoryLabel}
              </span>
            </>
          )}
        </div>
        {txn.optimalCard && txn.rewardComparison && !txn.isCredit && (
          <div style={{ marginTop: 4, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
            <span
              style={{
                fontSize: 9,
                fontWeight: 800,
                color: txn.usedOptimal ? T.status.green : T.accent.primary,
                background: txn.usedOptimal ? T.status.greenDim : T.accent.primaryDim,
                border: `1px solid ${txn.usedOptimal ? T.status.green : T.accent.primary}30`,
                padding: "2px 6px",
                borderRadius: 4,
                letterSpacing: "0.02em",
                textTransform: "uppercase",
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                maxWidth: "100%",
              }}
            >
              <Sparkles size={10} />
              {txn.usedOptimal ? "Used Best Card" : "Should've Used"}: {truncateCardName(txn.optimalCard.name)}
              {!txn.usedOptimal &&
                ` (+${txn.rewardComparison.incrementalRewardValue.toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                })})`}
            </span>
            <span
              style={{
                fontSize: 10,
                color: T.text.dim,
                lineHeight: 1.35,
                display: "block",
                maxWidth: "100%",
              }}
            >
              {txn.rewardComparison.usedCardMatched ? "Earned" : "Estimated earned"}{" "}
              <span style={{ color: T.text.secondary, fontWeight: 700 }}>
                {txn.rewardComparison.actualRewardValue.toLocaleString("en-US", { style: "currency", currency: "USD" })}
              </span>{" "}
              with {txn.rewardComparison.usedDisplayName}
              {!txn.rewardComparison.usedCardMatched && " (baseline estimate)"}
              {!txn.usedOptimal && (
                <>
                  {" "}• Best would be{" "}
                  <span style={{ color: T.accent.primary, fontWeight: 700 }}>
                    {txn.rewardComparison.optimalRewardValue.toLocaleString("en-US", {
                      style: "currency",
                      currency: "USD",
                    })}
                  </span>{" "}
                  at {formatRewardRate(txn.rewardComparison.optimalYield)}
                </>
              )}
              {txn.usedOptimal && <> • {formatRewardRate(txn.rewardComparison.actualYield)}</>}
            </span>
            {txn.rewardComparison.bestCardNotes && (
              <span
                style={{
                  fontSize: 10,
                  color: T.text.dim,
                  lineHeight: 1.35,
                  display: "block",
                  maxWidth: "100%",
                }}
              >
                Card caveat: {txn.rewardComparison.bestCardNotes}
              </span>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: matchTone.color,
                  background: matchTone.background,
                  border: `1px solid ${matchTone.borderColor}30`,
                  padding: "2px 6px",
                  borderRadius: 999,
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                }}
              >
                Match {txn.rewardComparison.usedCardMatchConfidence || "none"}
              </span>
              <button
                onClick={onToggleReview}
                style={{
                  padding: "4px 8px",
                  borderRadius: 8,
                  border: `1px solid ${T.border.default}`,
                  background: T.bg.surface,
                  color: T.text.secondary,
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Review link
              </button>
            </div>
            {isReviewing && (
              <div
                style={{
                  marginTop: 2,
                  width: "100%",
                  padding: 10,
                  borderRadius: T.radius.md,
                  border: `1px solid ${T.border.default}`,
                  background: T.bg.surface,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: T.text.dim,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  Reconcile payment method
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <button
                    onClick={() => void onOverrideLink(txn, { linkedCardId: null, linkedBankAccountId: "manual-bank" })}
                    style={{
                      padding: "6px 9px",
                      borderRadius: 8,
                      border: `1px solid ${T.border.default}`,
                      background: T.bg.card,
                      color: T.text.secondary,
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Mark as debit/bank
                  </button>
                  <button
                    onClick={() => void onOverrideLink(txn, { linkedCardId: null, linkedBankAccountId: null })}
                    style={{
                      padding: "6px 9px",
                      borderRadius: 8,
                      border: `1px solid ${T.border.default}`,
                      background: T.bg.card,
                      color: T.text.secondary,
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Use auto match
                  </button>
                  {activeCreditCards.map((cardOption) => {
                    const cardId = String(cardOption.id);
                    const isActive = txn.linkedCardId === cardId;
                    return (
                      <button
                        key={cardId}
                        onClick={() => void onOverrideLink(txn, { linkedCardId: cardId, linkedBankAccountId: null })}
                        style={{
                          padding: "6px 9px",
                          borderRadius: 8,
                          border: `1px solid ${T.border.default}`,
                          background: isActive ? T.accent.primaryDim : T.bg.card,
                          color: isActive ? T.accent.primary : T.text.secondary,
                          fontSize: 10,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {cardOption.nickname || cardOption.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0, minWidth: 84 }}>
        <span
          style={{
            fontSize: 14,
            fontWeight: 800,
            fontVariantNumeric: "tabular-nums",
            color: txn.isCredit ? T.status.green : T.text.primary,
          }}
        >
          {formatMoney(txn.amount, !!txn.isCredit)}
        </span>
        {formatTransactionTime(txn.date) && (
          <span style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono }}>
            {formatTransactionTime(txn.date)}
          </span>
        )}
      </div>
    </div>
  );
}
