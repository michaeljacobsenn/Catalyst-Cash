// ═══════════════════════════════════════════════════════════════
// Catalyst Cash — Cloudflare Worker AI Proxy
// Multi-provider: Gemini (default), OpenAI, Claude
// API keys stored as Cloudflare secrets — never exposed to clients.
// ═══════════════════════════════════════════════════════════════

import {
  estimatePromptTokens,
  getBatchCategorizationPrompt,
  getLocationCategorizationPrompt,
  getSystemPrompt,
} from "./promptBuilders.js";
import { getChatSystemPrompt } from "./chatPromptBuilders.js";
import {
  analyzeServerChatInputRisk,
  analyzeServerChatOutputRisk,
  analyzeServerChatTopicRisk,
  buildServerPromptInjectionRefusal,
  buildServerTopicRiskRefusal,
} from "./chatSafety.js";
import {
  buildHouseholdIntegrityTag,
  sha256Hex,
  verifyHouseholdIntegrity,
} from "./lib/householdSecurity.js";
import { getRevenueCatAppUserId } from "./lib/requestIdentity.js";
import {
  createIdentityChallenge,
  completeIdentityChallenge,
  rotateIdentityDeviceKey,
  resolveAuthenticatedActor,
} from "./lib/identitySession.js";
import { getQuotaWindow, getModelQuotaWindow, getAuditModelQuotaWindow } from "./lib/quota.js";
import { buildHeaders, corsHeaders, fetchWithTimeout } from "./lib/http.js";
import {
  DEFAULTS,
  VALID_PROVIDERS,
  getProviderHandler,
  routeOpenAIChatAction,
} from "./lib/providerClients.js";
import {
  resolveEffectiveTier,
  resolveStoredUserTier,
  resolveVerifiedRevenueCatAppUserId,
} from "./lib/revenueCat.js";
import {
  fetchPlaidJson,
  getDbFirstResult,
  getStoredSyncRow,
  syncTransactionsForItem,
  writeSyncRow,
} from "./lib/plaidSync.js";
import {
  loadPlaidRoiSummary,
  recordPlaidUsageDaily,
} from "./lib/plaidRoi.js";
import { getSafeClientError, redactForWorkerLogs, workerLog } from "./lib/observability.js";
import { handleHouseholdRoute } from "./routes/householdRoutes.js";
import { handleMarketRoute } from "./routes/marketRoutes.js";
import { handleSystemRoute } from "./routes/systemRoutes.js";
import { handleTelemetryRoute, loadTelemetrySummary } from "./routes/telemetryRoutes.js";
import { handleReferralRoute } from "./routes/referralRoutes.js";

export {
  buildHouseholdIntegrityTag,
  deriveHouseholdAuthToken,
  deriveLegacyHouseholdAuthToken,
  sha256Hex,
} from "./lib/householdSecurity.js";
export {
  createIdentityChallenge,
  completeIdentityChallenge,
  rotateIdentityDeviceKey,
  resolveAuthenticatedActor as resolvePlaidActor,
} from "./lib/identitySession.js";
export { issueIdentitySessionToken } from "./lib/identitySession.js";
export { verifyIdentitySessionToken } from "./lib/identitySession.js";
export { getIsoWeekKey, getQuotaWindow, getModelQuotaWindow, getAuditModelQuotaWindow, isRevenueCatEntitlementActive } from "./lib/quota.js";
export { mergePlaidTransactions } from "./lib/plaidSync.js";
export { resolveEffectiveTier } from "./lib/revenueCat.js";

const MAX_BODY_SIZE = 512_000; // 512KB max request body (rich audit prompt is now ~60KB before snapshot/history)
const PLAID_ENV = "production"; // "sandbox", "development", or "production"
const PLAID_TIMEOUT_MS = 15_000;
const MARKET_TIMEOUT_MS = 10_000;
const PLAID_INSTITUTION_LIMITS = {
  free: 1,
  pro: 8,
};
const PLAID_LINK_TOKEN_COOLDOWN_MS = 15_000;
const PLAID_EXCHANGE_COOLDOWN_MS = 30_000;
const PLAID_DIRECT_FETCH_COOLDOWNS = {
  free: 7 * 24 * 60 * 60 * 1000,
  pro: 24 * 60 * 60 * 1000,
};
const PLAID_WEBHOOK_REFRESH_COOLDOWNS = {
  free: 0,
  pro: 24 * 60 * 60 * 1000,
};
const PLAID_MANUAL_SYNC_COOLDOWNS = {
  free: 7 * 24 * 60 * 60 * 1000,
  pro: 24 * 60 * 60 * 1000,
};
const PLAID_BALANCE_REFRESH_COOLDOWNS = {
  // Defensive non-zero value; free users skip maintain entirely (line ~1671) but
  // if gating ever lapses this prevents unbounded Plaid calls.
  free: 7 * 24 * 60 * 60 * 1000,
  // Background auto-refresh: daily. Balances are the cheapest call ($0.10) and
  // users expect recent data when they open the app. Manual force-sync overrides.
  pro: 24 * 60 * 60 * 1000,
};
const PLAID_TRANSACTION_REFRESH_COOLDOWNS = {
  free: 7 * 24 * 60 * 60 * 1000,
  // 72h saves ~60% on transaction-sync call volume vs 24h with minimal UX impact.
  // Transactions rarely change multiple times per day, and manual force-sync
  // always refreshes transactions immediately regardless of this cooldown.
  pro: 72 * 60 * 60 * 1000,
};
const PLAID_LIABILITY_REFRESH_COOLDOWNS = {
  free: 30 * 24 * 60 * 60 * 1000,
  // Weekly liability refresh matches the audit cadence. Manual force-sync now
  // always refreshes liabilities on demand regardless of this cooldown.
  pro: 7 * 24 * 60 * 60 * 1000,
};
const PLAID_DEEP_SYNC_COOLDOWNS = {
  free: 30 * 24 * 60 * 60 * 1000,
  pro: 7 * 24 * 60 * 60 * 1000,
};
const MODEL_ALLOWLIST = {
  free: new Set(["gemini-2.5-flash"]),
  pro: new Set([
    "gemini-2.5-flash",
    "gpt-4.1",
    "o3",
  ]),
};
const DEFAULT_AUDIT_LOG_RETENTION_DAYS = 30;

function buildPersonaProfile(persona) {
  if (persona === "coach") {
    return {
      name: "Coach Catalyst",
      style:
        "You are a tough-love financial coach. Be direct, no-nonsense, and strict about discipline. Don't sugarcoat bad habits. Push the user to be better.",
    };
  }
  if (persona === "nerd") {
    return {
      name: "Catalyst AI",
      style:
        "You are an absolute data nerd. Focus heavily on stats, percentages, compounding math, and optimization strategies. Explain the math clearly.",
    };
  }
  return null;
}

function parseStoredJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function hasPlaidBalancesPayload(payload = null) {
  return Array.isArray(payload?.accounts) && payload.accounts.length > 0;
}

function hasPlaidTransactionsPayload(payload = null) {
  return Array.isArray(payload?.transactions) && payload.transactions.length > 0;
}

function hasPlaidLiabilitiesPayload(payload = null) {
  const liabilities = payload?.liabilities;
  if (!liabilities || typeof liabilities !== "object") return false;
  return Object.values(liabilities).some((value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value && Object.keys(value).length > 0)
  );
}

function hasLiabilityEligibleAccounts(payload = null) {
  return Array.isArray(payload?.accounts) && payload.accounts.some((account) => {
    const type = String(account?.type || "").toLowerCase();
    return type === "credit" || type === "loan";
  });
}

function getLatestTimestampMillis(rows = [], allowedItemIds = null) {
  const allowed = allowedItemIds instanceof Set ? allowedItemIds : null;
  let latest = 0;
  for (const row of rows || []) {
    if (allowed && !allowed.has(row?.item_id)) continue;
    if (String(row?.item_id || "").startsWith("_plaid_meta:")) continue;
    if (row?.item_id === "deep_sync_meta") continue;
    if (!row?.last_synced_at) continue;
    const timestamp = new Date(`${row.last_synced_at}Z`).getTime();
    if (Number.isFinite(timestamp) && timestamp > latest) latest = timestamp;
  }
  return latest;
}

function getPlaidActionMetaItemId(action, scope = "global") {
  return `_plaid_meta:${action}:${scope}`;
}

async function getPlaidActionTimestamp(db, userId, action, scope = "global") {
  if (!db) return 0;
  const row = await getStoredSyncRow(db, userId, getPlaidActionMetaItemId(action, scope));
  if (!row?.last_synced_at) return 0;
  const timestamp = new Date(`${row.last_synced_at}Z`).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

async function markPlaidAction(db, userId, action, scope = "global") {
  if (!db) return;
  await writeSyncRow(db, userId, getPlaidActionMetaItemId(action, scope), {
    balancesJson: "{}",
    liabilitiesJson: "{}",
    transactionsJson: "{}",
  });
}

async function buildPlaidCooldownResponse({
  db,
  userId,
  action,
  scope = "global",
  cooldownMs,
  message,
  cors,
  extra = {},
}) {
  const lastActionAt = await getPlaidActionTimestamp(db, userId, action, scope);
  if (!lastActionAt || (Date.now() - lastActionAt) >= cooldownMs) return null;
  const retryAfterMs = Math.max(0, cooldownMs - (Date.now() - lastActionAt));
  return new Response(
    JSON.stringify({
      error: "cooldown",
      message,
      retryAfterMs,
      ...extra,
    }),
    {
      status: 429,
      headers: buildHeaders(cors, { "Content-Type": "application/json" }),
    }
  );
}

function getUtcDayWindowStart(now = Date.now()) {
  const current = new Date(now);
  return Date.UTC(
    current.getUTCFullYear(),
    current.getUTCMonth(),
    current.getUTCDate()
  );
}

function getUtcWeekWindowStart(now = Date.now()) {
  const current = new Date(now);
  const utcDay = current.getUTCDay();
  const mondayOffset = (utcDay + 6) % 7;
  return Date.UTC(
    current.getUTCFullYear(),
    current.getUTCMonth(),
    current.getUTCDate() - mondayOffset
  );
}

function getAlignedCooldownRetryAfterMs(lastSyncAt = 0, cooldownMs = 0, now = Date.now()) {
  if (!lastSyncAt || !cooldownMs) return 0;
  let windowStart = 0;
  let windowEnd = 0;

  if (cooldownMs === 24 * 60 * 60 * 1000) {
    windowStart = getUtcDayWindowStart(now);
    windowEnd = windowStart + (24 * 60 * 60 * 1000);
  } else if (cooldownMs === 7 * 24 * 60 * 60 * 1000) {
    windowStart = getUtcWeekWindowStart(now);
    windowEnd = windowStart + (7 * 24 * 60 * 60 * 1000);
  } else {
    windowStart = Math.floor(now / cooldownMs) * cooldownMs;
    windowEnd = windowStart + cooldownMs;
  }

  if (lastSyncAt < windowStart) return 0;
  return Math.max(0, windowEnd - now);
}

function getPlaidDatasetAction(dataset) {
  return `dataset-${dataset}`;
}

async function getPlaidDatasetTimestamp(db, userId, itemId, dataset, syncRow = null) {
  const metaTimestamp = await getPlaidActionTimestamp(db, userId, getPlaidDatasetAction(dataset), itemId);
  if (metaTimestamp > 0) return metaTimestamp;

  if (!syncRow?.last_synced_at) return 0;
  const payload = parseStoredJson(syncRow?.[`${dataset}_json`], {});
  const hasPayload =
    dataset === "balances"
      ? hasPlaidBalancesPayload(payload)
      : dataset === "transactions"
        ? hasPlaidTransactionsPayload(payload)
        : hasPlaidLiabilitiesPayload(payload);
  if (!hasPayload) return 0;

  const fallbackTimestamp = new Date(`${syncRow.last_synced_at}Z`).getTime();
  return Number.isFinite(fallbackTimestamp) ? fallbackTimestamp : 0;
}

async function markPlaidDatasetTimestamp(db, userId, itemId, dataset) {
  await markPlaidAction(db, userId, getPlaidDatasetAction(dataset), itemId);
}

function extractPlaidProviderError(error) {
  const rawMessage = error instanceof Error ? error.message : String(error || "");
  const jsonStart = rawMessage.indexOf("{");
  let parsed = null;

  if (jsonStart >= 0) {
    const jsonCandidate = rawMessage.slice(jsonStart);
    try {
      parsed = JSON.parse(jsonCandidate);
    } catch {
      parsed = null;
    }
  }

  const errorCode = String(parsed?.error_code || parsed?.errorCode || "").trim() || null;
  const errorType = String(parsed?.error_type || parsed?.errorType || "").trim() || null;
  const displayMessage =
    String(parsed?.display_message || parsed?.displayMessage || parsed?.error_message || parsed?.errorMessage || "").trim() || null;

  const reconnectRequiredCodes = new Set([
    "ITEM_LOGIN_REQUIRED",
    "INVALID_ACCESS_TOKEN",
    "ACCESS_NOT_GRANTED",
    "USER_PERMISSION_REVOKED",
    "NO_AUTH_ACCOUNTS",
    "ITEM_LOCKED",
  ]);

  return {
    rawMessage,
    errorCode,
    errorType,
    displayMessage,
    reconnectRequired: Boolean(errorCode && reconnectRequiredCodes.has(errorCode)),
  };
}

async function refreshPlaidItemCache({
  db,
  userId,
  itemId,
  accessToken,
  plaidDomain,
  env,
  existingRow = null,
  refreshBalances = false,
  refreshTransactions = false,
  refreshLiabilities = false,
  ignoreTransactionErrors = false,
}) {
  const existingBalances = parseStoredJson(existingRow?.balances_json, {});
  const existingLiabilities = parseStoredJson(existingRow?.liabilities_json, {});
  const existingTransactions = parseStoredJson(existingRow?.transactions_json, {});

  let balancesPayload = existingBalances;
  let liabilitiesPayload = existingLiabilities;
  let transactionsPayload = existingTransactions;

  let balancesRefreshed = false;
  let transactionsRefreshed = false;
  let liabilitiesRefreshed = false;

  const needsBalanceFetchForLiabilities =
    refreshLiabilities &&
    !refreshBalances &&
    !hasPlaidBalancesPayload(existingBalances);

  if (refreshBalances || needsBalanceFetchForLiabilities) {
    balancesPayload = await fetchPlaidJson(plaidDomain, "/accounts/get", env, {
      access_token: accessToken,
    });
    balancesRefreshed = refreshBalances || needsBalanceFetchForLiabilities;
  }

  if (refreshTransactions) {
    try {
      const { mergedTransactions } = await syncTransactionsForItem({
        db,
        userId,
        itemId,
        accessToken,
        plaidDomain,
        env,
      });
      transactionsPayload = mergedTransactions;
      transactionsRefreshed = true;
    } catch (error) {
      if (!ignoreTransactionErrors) throw error;
      workerLog(env, "warn", "plaid-sync", "Transaction refresh failed; preserved existing ledger cache", {
        error,
        itemId,
      });
    }
  }

  if (refreshLiabilities && hasLiabilityEligibleAccounts(balancesPayload)) {
    liabilitiesPayload = await fetchPlaidJson(plaidDomain, "/liabilities/get", env, {
      access_token: accessToken,
    });
    liabilitiesRefreshed = true;
  }

  if (balancesRefreshed || transactionsRefreshed || liabilitiesRefreshed) {
    await writeSyncRow(db, userId, itemId, {
      balancesJson: JSON.stringify(balancesPayload),
      liabilitiesJson: JSON.stringify(liabilitiesPayload),
      transactionsJson: JSON.stringify(transactionsPayload),
    });
  }

  const timestampUpdates = [];
  if (balancesRefreshed) timestampUpdates.push(markPlaidDatasetTimestamp(db, userId, itemId, "balances"));
  if (transactionsRefreshed) timestampUpdates.push(markPlaidDatasetTimestamp(db, userId, itemId, "transactions"));
  if (liabilitiesRefreshed) timestampUpdates.push(markPlaidDatasetTimestamp(db, userId, itemId, "liabilities"));
  await Promise.all(timestampUpdates);

  return {
    balancesRefreshed,
    transactionsRefreshed,
    liabilitiesRefreshed,
    balancesPayload,
    liabilitiesPayload,
    transactionsPayload,
  };
}

function buildCriticalRetryPrompt(context = {}) {
  const computedStrategy = context.computedStrategy || null;
  const formData = context.formData || {};
  const nativeScore = computedStrategy?.auditSignals?.nativeScore?.score ?? "N/A";
  const nativeGrade = computedStrategy?.auditSignals?.nativeScore?.grade ?? "N/A";
  const operationalSurplus = Number(computedStrategy?.operationalSurplus || 0).toFixed(2);
  const riskFlags = Array.isArray(computedStrategy?.auditSignals?.riskFlags)
    ? computedStrategy.auditSignals.riskFlags.join(", ")
    : "none";

  return `Return STRICT JSON ONLY. No markdown, no prose.

Required top-level keys only:
- headerCard
- healthScore
- weeklyMoves
- riskFlags

Constraints:
- headerCard.status must be GREEN, YELLOW, or RED.
- healthScore.score must be a number from 0-100.
- healthScore.grade must match the score exactly.
- weeklyMoves must be 1-3 concrete actions. If operational surplus is positive, at least one weekly move must assign dollars.
- If operational surplus is positive, the weekly moves should allocate that full amount across named destinations instead of leaving it generic.
- riskFlags must be an array of short kebab-case strings.

Native anchors:
- Native score anchor: ${nativeScore}/100 (${nativeGrade})
- Operational surplus anchor: $${operationalSurplus}
- Native risk flags: ${riskFlags}
- Snapshot date: ${formData.date || "unknown"}

Return this exact JSON shape:
{
  "headerCard": { "status": "YELLOW", "details": ["short summary"] },
  "healthScore": { "score": 72, "grade": "C-", "trend": "flat", "summary": "one sentence" },
  "weeklyMoves": ["Route $150 to the highest-priority target."],
  "riskFlags": ["example-flag"]
}`;
}

function formatMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "$0.00";
  const sign = num < 0 ? "-" : "";
  return `${sign}$${Math.abs(num).toFixed(2)}`;
}

function summarizeRiskLevel(riskFlags = []) {
  const flags = Array.isArray(riskFlags) ? riskFlags : [];
  if (flags.includes("floor-breach-risk") || flags.includes("transfer-needed")) return "RED";
  if (flags.length > 0) return "YELLOW";
  return "GREEN";
}

function inferFallbackMove({ operationalSurplus = 0, riskFlags = [], debtTotal = 0 }) {
  const available = Math.max(0, Number(operationalSurplus) || 0);
  const flags = Array.isArray(riskFlags) ? riskFlags : [];

  if (flags.includes("floor-breach-risk") || flags.includes("transfer-needed")) {
    return {
      title: "Protect near-term cash",
      detail: "Preserve liquidity for near-term obligations before routing cash to debt or investing.",
      amount: available > 0 ? formatMoney(available) : null,
      priority: "required",
    };
  }

  if (available > 0 && debtTotal > 0) {
    return {
      title: "Route operational surplus",
      detail: "Apply this week's operational surplus to the highest-priority debt target.",
      amount: formatMoney(available),
      priority: "required",
    };
  }

  return {
    title: "Hold the line",
    detail: "Keep spending controlled and protect cash until the next audit refresh.",
    amount: null,
    priority: "required",
  };
}

function buildStructuredAuditFallback(context = {}, snapshot = "") {
  const computedStrategy = context?.computedStrategy || {};
  const financialConfig = context?.financialConfig || {};
  const riskFlags = Array.isArray(computedStrategy?.auditSignals?.riskFlags)
    ? computedStrategy.auditSignals.riskFlags.filter(Boolean)
    : [];
  const nativeScore = Number(computedStrategy?.auditSignals?.nativeScore?.score);
  const score = Number.isFinite(nativeScore) ? Math.max(0, Math.min(100, Math.round(nativeScore))) : 68;
  const dashboard = {
    checking: Number(financialConfig?.checkingBalance || 0),
    vault: Number(financialConfig?.allyBalance || financialConfig?.savingsBalance || 0),
    pending: Number(computedStrategy?.timeCriticalAmount || 0),
    debts: Number(computedStrategy?.auditSignals?.debt?.total || 0),
    available: Math.max(0, Number(computedStrategy?.operationalSurplus || 0)),
  };
  const move = inferFallbackMove({
    operationalSurplus: dashboard.available,
    riskFlags,
    debtTotal: dashboard.debts,
  });
  const fallback = {
    headerCard: {
      title: "Weekly Financial Audit",
      subtitle: "Deterministic fallback briefing generated because the full model response was unavailable.",
      status: summarizeRiskLevel(riskFlags),
      confidence: "low",
    },
    alertsCard: riskFlags.slice(0, 3).map((flag) => ({
      level: flag.includes("risk") || flag.includes("transfer") ? "critical" : "warn",
      title: String(flag).replace(/-/g, " "),
      detail: "Native audit safeguards flagged this category for attention.",
    })),
    dashboardCard: [
      { category: "Checking", amount: formatMoney(dashboard.checking), status: dashboard.checking > 0 ? "ok" : "low" },
      { category: "Vault", amount: formatMoney(dashboard.vault), status: dashboard.vault > 0 ? "ok" : "low" },
      { category: "Pending", amount: formatMoney(dashboard.pending), status: dashboard.pending > 0 ? "watch" : "clear" },
      { category: "Debts", amount: formatMoney(dashboard.debts), status: dashboard.debts > 0 ? "high" : "clear" },
      { category: "Available", amount: formatMoney(dashboard.available), status: dashboard.available > 0 ? "ok" : "tight" },
    ],
    healthScore: {
      score,
      grade: score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F",
      trend: "flat",
      summary: "Catalyst used deterministic strategy signals to keep the briefing available.",
    },
    weeklyMoves: [move],
    moveItems: [],
    radar: { next90Days: [], longRange: [] },
    nextAction: {
      title: move.title,
      detail: move.detail,
      amount: move.amount,
    },
    investments: {
      balance: formatMoney(
        Number(financialConfig?.investmentBrokerage || 0) +
        Number(financialConfig?.investmentRoth || 0) +
        Number(financialConfig?.k401Balance || 0) +
        Number(financialConfig?.hsaBalance || 0)
      ),
      asOf: context?.formData?.date || new Date().toISOString().split("T")[0],
      gateStatus: dashboard.debts > 0 || riskFlags.length > 0 ? "Guarded — safety first" : "Open",
      netWorth: null,
      cryptoValue: null,
    },
    assumptions: [
      "Structured fallback mode was used because the provider response was malformed.",
      "Rerun the audit if you want a fresh full-model narrative.",
    ],
    spendingAnalysis: null,
    riskFlags,
    negotiationTargets: [],
    longRangeRadar: [],
  };

  if (!fallback.alertsCard.length && snapshot) {
    fallback.alertsCard.push({
      level: "warn",
      title: "model response unavailable",
      detail: "Catalyst returned a deterministic fallback briefing instead of a full narrative.",
    });
  }

  return JSON.stringify(fallback);
}

function buildNegotiationPrompt(context = {}) {
  const merchant = context.merchant || "the provider";
  const amount = context.amount || 0;
  const tactic = context.tactic || "ask for a retention or loyalty discount";
  return `You are a practical consumer advocate who writes calm, high-probability retention and billing negotiation scripts.

The user wants to negotiate their $${amount}/month bill with ${merchant}.
The proven winning tactic for ${merchant} is: "${tactic}"

Generate a concise phone/chat script in markdown with these exact sections:

## 📞 Before You Call
- The exact phone number or chat URL (if widely known) for ${merchant}.
- A likely menu path to reach billing, loyalty, or retention if widely known. If not known, say so plainly.
- Have a competitor's current rate ready as your anchor when relevant. If a realistic competitor is unclear, say to reference a lower market rate instead of inventing one.

## 🗣️ Opening Line
Give them a natural opening line for the first 15 seconds. It should usually establish: (1) loyalty or tenure if helpful, (2) price pressure or a competing offer if relevant, and (3) that they are considering cancellation unless the price improves.

## 💰 The Ask
State a realistic target price or discount range to ask for. Use the competitor rate as anchor when known. Example: "I'd like to stay, but I need my bill closer to $X/month to justify keeping the service."

## 🛡️ If They Say No
Provide 3 escalation responses:
1. A firmness response ("I understand, but I'll need to proceed with cancellation then.")
2. A supervisor request ("Can you connect me to someone authorized to offer loyalty pricing?")
3. A callback play ("I'll call back tomorrow — please note my cancellation request on my account.")

## ⚡ Pro Tips
- Best times to call (Tue-Thu morning = shorter hold, better offers).
- If the first offer is weak, counter once with a specific lower target.
- If offered a "temporary" discount, ask for the duration in writing/confirmation number.

RULES: Be practical, confident, and accurate. Give usable words to say, but do not fabricate phone trees, market pricing, or company policies. Do NOT discuss budgeting, tracking, or financial planning — ONLY the negotiation script. Format with clear headers and bold key phrases.`;
}

function buildSystemPrompt(type, context = {}, resolvedProvider = "gemini", latestUserMessage = "") {
  const variant = context?.variant || "default";

  if (variant === "location-categorization") {
    return getLocationCategorizationPrompt();
  }
  if (variant === "batch-categorization") {
    return getBatchCategorizationPrompt();
  }
  if (type === "audit" && variant === "critical-retry") {
    return buildCriticalRetryPrompt(context);
  }
  if (type === "chat" && variant === "negotiation-script") {
    return buildNegotiationPrompt(context);
  }
  if (type === "chat") {
    return getChatSystemPrompt(
      context.current || null,
      context.financialConfig || {},
      context.cards || [],
      context.renewals || [],
      context.history || [],
      buildPersonaProfile(context.persona),
      context.personalRules || "",
      context.computedStrategy || null,
      context.trendContext || null,
      context.providerId || resolvedProvider,
      context.memoryBlock || "",
      context.decisionRecommendations || [],
      context.chatInputRisk || null,
      context.budgetContext || null,
      context.financialBrief || null,
      latestUserMessage,
      variant,
      context.nativeActionPacket || null
    );
  }
  return getSystemPrompt(
    context.providerId || resolvedProvider,
    context.financialConfig || {},
    context.cards || [],
    context.renewals || [],
    context.personalRules || "",
    context.trendContext || null,
    context.persona || null,
    context.computedStrategy || null,
    context.chatContext || null,
    context.memoryBlock || "",
    context
  );
}

function buildBlockedChatResponse({ cors, tierHeaders, rateResult, stream, responseFormat, message }) {
  if (stream !== false && responseFormat === "text") {
    return buildTextStreamResponse({
      cors,
      tierHeaders,
      rateResult,
      message,
    });
  }

  return new Response(JSON.stringify({ result: message }), {
    status: 200,
    headers: buildHeaders(cors, {
      "Content-Type": "application/json",
      "X-RateLimit-Remaining": String(rateResult.remaining),
      "X-RateLimit-Limit": String(rateResult.limit),
      ...tierHeaders,
    }),
  });
}

function buildTextStreamResponse({ cors, tierHeaders, rateResult, message, auditLogId = null, degraded = false }) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: message } }] })}\n\n`)
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(body, {
    status: 200,
    headers: buildHeaders(cors, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      ...(auditLogId ? { "X-Audit-Log-ID": auditLogId } : {}),
      ...(degraded ? { "X-Catalyst-Degraded": "1" } : {}),
      "X-RateLimit-Remaining": String(rateResult.remaining),
      "X-RateLimit-Limit": String(rateResult.limit),
      ...tierHeaders,
    }),
  });
}

function logChatOutputSafetyReplacement(env, provider, model, outputRisk) {
  workerLog(env, "warn", "chat-output-safety", "Chat output triggered server-side safety replacement.", {
    provider,
    model,
    kind: outputRisk.kind,
    flags: outputRisk.matches.map((match) => match.flag),
  });
}

function replaceUnsafeChatOutput(env, provider, model, resultText, effectiveContext) {
  const outputRisk = analyzeServerChatOutputRisk(resultText);
  if (!outputRisk.blocked) {
    return resultText;
  }

  logChatOutputSafetyReplacement(env, provider, model, outputRisk);
  return buildServerTopicRiskRefusal(outputRisk, effectiveContext);
}

function logPromptProfile(env, type, provider, prompt) {
  const chars = String(prompt || "").length;
  const estimatedTokens = estimatePromptTokens(prompt);
  workerLog(
    env,
    "debug",
    "prompt-profile",
    `type=${type || "audit"} provider=${provider || "gemini"} chars=${chars} est_tokens=${estimatedTokens}`
  );
}

function extractHistoryText(entry) {
  if (!entry) return "";
  if (typeof entry.content === "string") return entry.content;
  if (Array.isArray(entry.parts)) {
    return entry.parts
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function estimateHistoryTokens(history = []) {
  if (!Array.isArray(history) || history.length === 0) return 0;
  return history.reduce((sum, entry) => sum + estimatePromptTokens(extractHistoryText(entry)), 0);
}

function getPromptBudget(type) {
  if (type === "chat") {
    return {
      maxPromptTokens: 6200,
      maxSnapshotChars: 2400,
    };
  }

  return {
    maxPromptTokens: 7800,
    maxSnapshotChars: 7000,
  };
}

function clampSnapshot(snapshot, maxChars) {
  const raw = String(snapshot || "");
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, Math.max(0, maxChars - 24)).trim()}\n[TRUNCATED FOR BUDGET]`;
}

function enforcePromptBudget(type, systemPrompt, snapshot, history = []) {
  const budget = getPromptBudget(type);
  const trimmedHistory = Array.isArray(history) ? [...history] : [];
  let effectiveSnapshot = clampSnapshot(snapshot, budget.maxSnapshotChars);
  let estimatedTokens =
    estimatePromptTokens(systemPrompt) +
    estimatePromptTokens(effectiveSnapshot) +
    estimateHistoryTokens(trimmedHistory);

  while (trimmedHistory.length > 0 && estimatedTokens > budget.maxPromptTokens) {
    trimmedHistory.shift();
    estimatedTokens =
      estimatePromptTokens(systemPrompt) +
      estimatePromptTokens(effectiveSnapshot) +
      estimateHistoryTokens(trimmedHistory);
  }

  return {
    snapshot: effectiveSnapshot,
    history: trimmedHistory,
    estimatedTokens,
    historyTrimmed: Array.isArray(history) ? history.length - trimmedHistory.length : 0,
    snapshotTrimmed: String(snapshot || "").length > effectiveSnapshot.length,
    overBudget: estimatedTokens > budget.maxPromptTokens,
    budget,
  };
}

function getWorkerGatingMode(env) {
  return env.GATING_MODE || "soft";
}

function isWorkerGatingEnforced(env) {
  return getWorkerGatingMode(env) === "live";
}

function isPlaidCostTierEnforced(env) {
  return isWorkerGatingEnforced(env);
}

function getPlaidCostTierId(tierResolution, env) {
  return isPlaidCostTierEnforced(env) ? tierResolution.tier : "pro";
}

function getPlaidCooldownMs(env, cooldowns, tierId) {
  if (!isPlaidCostTierEnforced(env)) return 0;
  return cooldowns[tierId] || cooldowns.free;
}

function getDefaultModelForTier(provider, tier) {
  if (provider === "openai") return tier === "pro" ? "gpt-4.1" : DEFAULTS.gemini;
  if (provider === "gemini") return "gemini-2.5-flash";
  if (provider === "anthropic" || provider === "claude") return tier === "pro" ? "claude-haiku-4-5" : DEFAULTS.gemini;
  return DEFAULTS[provider] || DEFAULTS.gemini;
}

function isModelAllowedForTier(model, tier) {
  return MODEL_ALLOWLIST[tier]?.has(model);
}

// ─── Rate Limiting (per-device, using Durable Objects) ─────────────
export class RateLimiter {
  constructor(state) {
    this.state = state;
    this.sql = state.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS counts (
        period_key TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0
      )
    `);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const periodKey = url.searchParams.get("periodKey") || "";
    const commit = url.searchParams.get("commit") === "true";

    if (commit) {
      this.sql.exec(
        `INSERT INTO counts (period_key, count) VALUES (?, 1)
         ON CONFLICT(period_key) DO UPDATE SET count = count + 1`,
        periodKey
      );
    }

    const rows = [...this.sql.exec("SELECT count FROM counts WHERE period_key = ?", periodKey)];
    const count = rows[0]?.count ?? 0;

    // GC stale period keys to prevent unbounded growth
    const gcRows = [...this.sql.exec("SELECT period_key FROM counts ORDER BY period_key DESC")];
    if (gcRows.length > 2) {
      for (const r of gcRows.slice(2)) {
        this.sql.exec("DELETE FROM counts WHERE period_key = ?", r.period_key);
      }
    }

    return new Response(JSON.stringify({ count }), {
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function peekRateLimit(deviceId, tier, isChat, env) {
  const { limit, periodKey, resetAt } = getQuotaWindow(tier, isChat);
  const type = isChat ? "chat" : "audit";
  const limitName = `${tier}-${deviceId}-${type}`;

  const retryAfter = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));

  if (!env.RATE_LIMITER) {
    // Fallback if DO is not bound
    return { allowed: true, remaining: limit, limit, retryAfter, count: 0, key: limitName, periodKey };
  }

  const id = env.RATE_LIMITER.idFromName(limitName);
  const stub = env.RATE_LIMITER.get(id);

  const res = await stub.fetch(`http://internal/?periodKey=${encodeURIComponent(periodKey)}&commit=false`);
  const { count } = await res.json();

  if (count >= limit) {
    return { allowed: false, remaining: 0, limit, retryAfter, count, key: limitName, periodKey };
  }

  return {
    allowed: true,
    remaining: limit - count,
    limit,
    retryAfter,
    count,
    key: limitName,
    periodKey,
  };
}

export async function commitRateLimit(rateResult, env) {
  if (!env.RATE_LIMITER) {
    const newCount = rateResult.count + 1;
    return { ...rateResult, count: newCount, remaining: Math.max(0, rateResult.limit - newCount) };
  }

  const id = env.RATE_LIMITER.idFromName(rateResult.key);
  const stub = env.RATE_LIMITER.get(id);

  const res = await stub.fetch(`http://internal/?periodKey=${encodeURIComponent(rateResult.periodKey)}&commit=true`);
  const { count } = await res.json();

  return {
    ...rateResult,
    count,
    remaining: Math.max(0, rateResult.limit - count),
  };
}

function generateAuditLogId() {
  return crypto.randomUUID();
}

/**
 * Scrubs PII patterns from AI response text before logging to D1.
 * Covers: account/routing numbers, SSN-shaped strings, all dollar-amount
 * variants (with or without cents, with or without commas, negative), and
 * bare 2-decimal floats that could be a specific balance.
 * Truncates to 600 chars after scrubbing.
 * This backs the privacy policy claim that the logged excerpt
 * "never contains account numbers or balances."
 */
function stripThoughtProcess(text) {
  return String(text || "").replace(/<thought_process>[\s\S]*?<\/thought_process>/gi, "").trim();
}

function coerceStructuredJsonResult(text) {
  const cleaned = String(text || "")
    .replace(/```json?\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  if (!cleaned) return null;

  const tryParse = (candidate) => {
    const parsed = JSON.parse(candidate);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return JSON.stringify(parsed);
  };

  const repairTruncatedJson = (candidate) => {
    const source = String(candidate || "").trim();
    if (!source) return null;

    let repaired = source
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/,\s*$/g, "");

    const stack = [];
    let inString = false;
    let escaped = false;

    for (const char of repaired) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === "{" || char === "[") stack.push(char);
      if (char === "}" && stack[stack.length - 1] === "{") stack.pop();
      if (char === "]" && stack[stack.length - 1] === "[") stack.pop();
    }

    if (inString) repaired += "\"";
    while (stack.length > 0) {
      repaired += stack.pop() === "{" ? "}" : "]";
    }
    return repaired.replace(/,\s*([}\]])/g, "$1");
  };

  const candidates = [];
  candidates.push(cleaned);

  const objectStart = cleaned.indexOf("{");
  const objectEnd = cleaned.lastIndexOf("}");
  if (objectStart >= 0) {
    const objectSlice = objectEnd > objectStart ? cleaned.slice(objectStart, objectEnd + 1) : cleaned.slice(objectStart);
    candidates.push(objectSlice);
    candidates.push(repairTruncatedJson(objectSlice) || objectSlice);
  }

  const arrayStart = cleaned.indexOf("[");
  const arrayEnd = cleaned.lastIndexOf("]");
  if (arrayStart >= 0) {
    const arraySlice = arrayEnd > arrayStart ? cleaned.slice(arrayStart, arrayEnd + 1) : cleaned.slice(arrayStart);
    candidates.push(arraySlice);
    candidates.push(repairTruncatedJson(arraySlice) || arraySlice);
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const serialized = tryParse(candidate);
      if (serialized) return serialized;
    } catch {
      // keep trying repair candidates
    }
  }

  return null;
}

function trimResponsePreview(text) {
  let s = stripThoughtProcess(text);
  // Account / routing numbers: 8-17 consecutive digits
  s = s.replace(/\b\d{8,17}\b/g, "[redacted]");
  // SSN-shaped: 3-2-4 with dashes or spaces
  s = s.replace(/\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g, "[redacted]");
  // Dollar sign followed by any digit string (with optional commas/decimals)
  // e.g. $150, $3,200, $3,200.00, -$150
  s = s.replace(/-?\$[\d,]+(?:\.\d+)?\b/g, "$[amount]");
  // Bare comma-formatted numbers e.g. 3,200.00 or 3,200
  s = s.replace(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g, "[amount]");
  // Bare 2-decimal floats that look like dollar amounts e.g. 3200.00, 150.00
  // Must be ≥ 3 digits before decimal to avoid clobbering "1.50 hours" style text
  s = s.replace(/\b\d{3,}\.\d{2}\b/g, "[amount]");
  return s.slice(0, 600);
}

function buildUsage(promptTokens = 0, completionTokens = 0) {
  return {
    promptTokens: Number.isFinite(promptTokens) ? promptTokens : 0,
    completionTokens: Number.isFinite(completionTokens) ? completionTokens : 0,
  };
}

function extractSSEText(parsed) {
  if (parsed?.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
    return parsed.delta.text || "";
  }
  if (parsed?.choices?.[0]?.delta?.content) {
    return parsed.choices[0].delta.content;
  }
  if (parsed?.candidates?.[0]?.content?.parts?.[0]?.text) {
    return parsed.candidates[0].content.parts[0].text;
  }
  return "";
}

function mergeUsage(provider, parsed, usage) {
  if (!parsed || !usage) return usage;

  if (provider === "openai" && parsed.usage) {
    return buildUsage(parsed.usage.prompt_tokens || 0, parsed.usage.completion_tokens || 0);
  }

  if (provider === "anthropic" || provider === "claude") {
    const inputTokens = parsed.message?.usage?.input_tokens ?? parsed.usage?.input_tokens ?? usage.promptTokens;
    const outputTokens = parsed.usage?.output_tokens ?? parsed.message?.usage?.output_tokens ?? usage.completionTokens;
    return buildUsage(inputTokens, outputTokens);
  }

  if (provider === "gemini" && parsed.usageMetadata) {
    const promptTokens = parsed.usageMetadata.promptTokenCount || usage.promptTokens;
    const completionTokens =
      parsed.usageMetadata.candidatesTokenCount ??
      Math.max(0, (parsed.usageMetadata.totalTokenCount || 0) - (parsed.usageMetadata.promptTokenCount || 0));
    return buildUsage(promptTokens, completionTokens);
  }

  return usage;
}

async function insertAuditLogRow(db, row) {
  if (!db) return;

  await db.prepare(
    `INSERT INTO audit_log (
      id, provider, model, user_id, prompt_tokens, completion_tokens,
      parse_succeeded, hit_degraded_fallback, response_preview, confidence, drift_warning, drift_details
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    row.id,
    row.provider,
    row.model,
    row.userId,
    row.promptTokens || 0,
    row.completionTokens || 0,
    row.parseSucceeded ? 1 : 0,
    row.hitDegradedFallback ? 1 : 0,
    trimResponsePreview(row.responsePreview),
    row.confidence || "medium",
    row.driftWarning ? 1 : 0,
    JSON.stringify(Array.isArray(row.driftDetails) ? row.driftDetails : [])
  ).run();
}

async function updateAuditLogRow(db, logId, updates = {}) {
  if (!db || !logId) return;

  const existing = await getDbFirstResult(db, "SELECT * FROM audit_log WHERE id = ?", [logId]);
  if (!existing) return;

  const promptTokens =
    updates.promptTokens == null ? Number(existing.prompt_tokens || 0) : Number(updates.promptTokens || 0);
  const completionTokens =
    updates.completionTokens == null ? Number(existing.completion_tokens || 0) : Number(updates.completionTokens || 0);
  const parseSucceeded =
    updates.parseSucceeded == null ? Number(existing.parse_succeeded || 0) : updates.parseSucceeded ? 1 : 0;
  const hitDegradedFallback =
    updates.hitDegradedFallback == null
      ? Number(existing.hit_degraded_fallback || 0)
      : updates.hitDegradedFallback
        ? 1
        : 0;
  const responsePreview =
    updates.responsePreview == null ? existing.response_preview || "" : trimResponsePreview(updates.responsePreview);
  const confidence = typeof updates.confidence === "string" ? updates.confidence : existing.confidence || "medium";
  const driftWarning =
    updates.driftWarning == null ? Number(existing.drift_warning || 0) : updates.driftWarning ? 1 : 0;
  const driftDetails =
    updates.driftDetails == null
      ? existing.drift_details || "[]"
      : JSON.stringify(Array.isArray(updates.driftDetails) ? updates.driftDetails : []);

  await db.prepare(
    `UPDATE audit_log
        SET prompt_tokens = ?,
            completion_tokens = ?,
            parse_succeeded = ?,
            hit_degraded_fallback = ?,
            response_preview = ?,
            confidence = ?,
            drift_warning = ?,
            drift_details = ?
      WHERE id = ?`
  ).bind(
    promptTokens,
    completionTokens,
    parseSucceeded,
    hitDegradedFallback,
    responsePreview,
    confidence,
    driftWarning,
    driftDetails,
    logId
  ).run();
}

async function captureStreamAuditLog(db, logId, provider, response) {
  if (!db || !logId || !response) return;

  const rawBody = await response.text().catch(() => "");
  let preview = "";
  let usage = buildUsage();

  for (const line of rawBody.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice(6).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const parsed = JSON.parse(payload);
      usage = mergeUsage(provider, parsed, usage);
      if (preview.length < 600) {
        preview += stripThoughtProcess(extractSSEText(parsed));
      }
    } catch {
      // Ignore malformed stream chunks for logging.
    }
  }

  await updateAuditLogRow(db, logId, {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    responsePreview: preview,
  });
}

function resolveAuditLogRetentionDays(env) {
  const configured = parseInt(String(env?.AUDIT_LOG_RETENTION_DAYS || DEFAULT_AUDIT_LOG_RETENTION_DAYS), 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_AUDIT_LOG_RETENTION_DAYS;
}

async function purgeExpiredAuditLogs(db, retentionDays) {
  if (!db) return;
  await db.prepare("DELETE FROM audit_log WHERE created_at < datetime('now', ?)").bind(`-${retentionDays} days`).run();
}

// ─── Main Handler ────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);

    // Handle preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: buildHeaders(cors) });
    }

    const url = new URL(request.url);
    const systemResponse = await handleSystemRoute({
      request,
      url,
      env,
      cors,
      buildHeaders,
      DEFAULTS,
      getWorkerGatingMode,
      resolveAuthenticatedActor,
      resolveVerifiedRevenueCatAppUserId,
      createIdentityChallenge,
      completeIdentityChallenge,
      rotateIdentityDeviceKey,
      updateAuditLogRow,
      loadPlaidRoiSummary,
      loadTelemetrySummary,
      workerLog,
    });
    if (systemResponse) return systemResponse;

    // ─── Referral Endpoints ──────────────────────────────────────
    if (url.pathname.startsWith("/referral/")) {
      return handleReferralRoute(request, env, url.pathname, cors);
    }

    // ─── Plaid Endpoints ─────────────────────────────────────
    if (url.pathname.startsWith("/plaid/") || url.pathname.startsWith("/api/sync/")) {
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405,
          headers: buildHeaders(cors, { "Content-Type": "application/json" }),
        });
      }

      if (!env.PLAID_CLIENT_ID || !env.PLAID_SECRET) {
        return new Response(JSON.stringify({ error: "Plaid credentials not configured on backend" }), {
          status: 503,
          headers: buildHeaders(cors, { "Content-Type": "application/json" }),
        });
      }

      const plaidActor = url.pathname === "/plaid/webhook" ? null : await resolveAuthenticatedActor(request, env.DB, env);
      if (url.pathname !== "/plaid/webhook" && !plaidActor) {
        return new Response(JSON.stringify({ error: "Invalid or missing identity session" }), {
          status: 401,
          headers: buildHeaders(cors, { "Content-Type": "application/json" }),
        });
      }

      const plaidDomain = `https://${PLAID_ENV}.plaid.com`;
      let plaidEndpoint = "";
      let plaidBody = {};

      try {
        const reqBody = await request.json();

        if (url.pathname === "/plaid/link-token") {
          const linkTokenCooldownResponse = await buildPlaidCooldownResponse({
            db: env.DB,
            userId: plaidActor.userId,
            action: "link-token",
            cooldownMs: PLAID_LINK_TOKEN_COOLDOWN_MS,
            message: "Please wait a moment before starting another Plaid connection flow.",
            cors,
          });
          if (linkTokenCooldownResponse) return linkTokenCooldownResponse;

          plaidEndpoint = "/link/token/create";
          const webhookUrl = env.PLAID_WEBHOOK_URL || `${url.origin}/plaid/webhook`;
          plaidBody = {
            client_id: env.PLAID_CLIENT_ID,
            secret: env.PLAID_SECRET,
            client_name: "Catalyst Cash",
            country_codes: ["US"],
            language: "en",
            user: { client_user_id: plaidActor.userId },
            products: ["transactions"],
            optional_products: ["liabilities", "investments"],
            webhook: webhookUrl,
          };
          const plaidData = await fetchPlaidJson(plaidDomain, plaidEndpoint, env, plaidBody);
          await markPlaidAction(env.DB, plaidActor.userId, "link-token");
          return new Response(JSON.stringify({ link_token: plaidData.link_token }), {
            status: 200,
            headers: buildHeaders(cors, { "Content-Type": "application/json" }),
          });
        } else if (url.pathname === "/plaid/exchange") {
          const tierResolution = await resolveEffectiveTier(request, env, plaidActor);
          const tierId = getPlaidCostTierId(tierResolution, env);
          const replaceItemId = String(reqBody.replaceItemId || "").trim();
          const exchangeCooldownResponse = await buildPlaidCooldownResponse({
            db: env.DB,
            userId: plaidActor.userId,
            action: "exchange",
            scope: replaceItemId || "global",
            cooldownMs: PLAID_EXCHANGE_COOLDOWN_MS,
            message: "Please wait a moment before trying to connect or reconnect this bank again.",
            cors,
          });
          if (exchangeCooldownResponse) return exchangeCooldownResponse;

          const { results: existingItems } = await env.DB.prepare(
            "SELECT access_token, item_id FROM plaid_items WHERE user_id = ?"
          ).bind(plaidActor.userId).all();
          const replacementItem = replaceItemId
            ? await getDbFirstResult(
                env.DB,
                "SELECT user_id, access_token FROM plaid_items WHERE item_id = ? AND user_id = ?",
                [replaceItemId, plaidActor.userId]
              )
            : null;
          const existingCount = Math.max(0, (existingItems?.length || 0) - (replacementItem ? 1 : 0));
          const institutionLimit = PLAID_INSTITUTION_LIMITS[tierId] || PLAID_INSTITUTION_LIMITS.free;

          if (existingCount >= institutionLimit) {
            return new Response(
              JSON.stringify({
                error: "institution_limit",
                message: `Your ${tierId === "pro" ? "Pro" : "Free"} plan allows up to ${institutionLimit} Plaid institution${institutionLimit === 1 ? "" : "s"}.`,
              }),
              {
                status: 403,
                headers: buildHeaders(cors, { "Content-Type": "application/json" }),
              }
            );
          }

          plaidEndpoint = "/item/public_token/exchange";
          plaidBody = {
            client_id: env.PLAID_CLIENT_ID,
            secret: env.PLAID_SECRET,
            public_token: reqBody.publicToken,
          };

          const plaidRes = await fetchWithTimeout(`${plaidDomain}${plaidEndpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(plaidBody),
          }, PLAID_TIMEOUT_MS);

          if (!plaidRes.ok) throw new Error("Plaid exchange failed");
          const plaidData = await plaidRes.json();

          // Store Access Token + Item ID mapping in D1
          if (env.DB) {
            if (replacementItem?.access_token) {
              try {
                await fetchPlaidJson(plaidDomain, "/item/remove", env, {
                  access_token: replacementItem.access_token,
                });
              } catch (removeErr) {
                workerLog(env, "warn", "plaid-proxy", "Failed to revoke replaced Plaid item", {
                  error: removeErr,
                  replaceItemId,
                });
              }
            }
            if (replaceItemId && replaceItemId !== plaidData.item_id) {
              await env.DB.prepare("DELETE FROM sync_data WHERE user_id = ? AND item_id = ?").bind(plaidActor.userId, replaceItemId).run();
              await env.DB.prepare("DELETE FROM plaid_items WHERE item_id = ? AND user_id = ?").bind(replaceItemId, plaidActor.userId).run();
            }
            await env.DB.prepare(
              "INSERT OR REPLACE INTO plaid_items (item_id, user_id, access_token, transactions_cursor) VALUES (?, ?, ?, ?)"
            ).bind(plaidData.item_id, plaidActor.userId, plaidData.access_token, null).run();
          }
          await markPlaidAction(env.DB, plaidActor.userId, "exchange", replaceItemId || "global");

          return new Response(
            JSON.stringify({
              item_id: plaidData.item_id,
            }),
            {
            status: 200,
            headers: buildHeaders(cors, { "Content-Type": "application/json" }),
            }
          );
        } else if (url.pathname === "/plaid/balances") {
          const tierResolution = await resolveEffectiveTier(request, env, plaidActor);
          const tierId = getPlaidCostTierId(tierResolution, env);
          let accessToken = reqBody.accessToken || "";
          let itemId = String(reqBody.itemId || "").trim();
          if (accessToken && env.DB) {
            const ownedToken = await getDbFirstResult(
              env.DB,
              "SELECT access_token FROM plaid_items WHERE access_token = ? AND user_id = ?",
              [accessToken, plaidActor.userId]
            );
            accessToken = ownedToken?.access_token || "";
          }
          if (!accessToken && itemId && env.DB) {
            const itemRow = await getDbFirstResult(
              env.DB,
              "SELECT access_token FROM plaid_items WHERE item_id = ? AND user_id = ?",
              [itemId, plaidActor.userId]
            );
            accessToken = itemRow?.access_token || "";
          }
          if (!accessToken) {
            return new Response(JSON.stringify({ error: "Plaid item not found for actor" }), {
              status: 404,
              headers: buildHeaders(cors, { "Content-Type": "application/json" }),
            });
          }
          if (!itemId && env.DB) {
            itemId = (
              await getDbFirstResult(
                env.DB,
                "SELECT item_id FROM plaid_items WHERE access_token = ? AND user_id = ?",
                [accessToken, plaidActor.userId]
              )
            )?.item_id || "";
          }
          const cachedBalancesRow = itemId ? await getStoredSyncRow(env.DB, plaidActor.userId, itemId) : null;
          const cachedBalancesPayload = parseStoredJson(cachedBalancesRow?.balances_json, {});
          const directFetchCooldownMs = getPlaidCooldownMs(env, PLAID_DIRECT_FETCH_COOLDOWNS, tierId);
          const directBalancesTimestamp = itemId
            ? await getPlaidDatasetTimestamp(env.DB, plaidActor.userId, itemId, "balances", cachedBalancesRow)
            : 0;
          if (cachedBalancesPayload?.accounts?.length && directBalancesTimestamp > 0 && (Date.now() - directBalancesTimestamp) < directFetchCooldownMs) {
            return new Response(JSON.stringify(cachedBalancesPayload), {
              status: 200,
              headers: buildHeaders(cors, { "Content-Type": "application/json" }),
            });
          }
          plaidEndpoint = "/accounts/get";
          plaidBody = {
            client_id: env.PLAID_CLIENT_ID,
            secret: env.PLAID_SECRET,
            access_token: accessToken,
          };
          const plaidData = await fetchPlaidJson(plaidDomain, plaidEndpoint, env, plaidBody);
          if (itemId) {
            await writeSyncRow(env.DB, plaidActor.userId, itemId, {
              balancesJson: JSON.stringify(plaidData),
            });
            await markPlaidDatasetTimestamp(env.DB, plaidActor.userId, itemId, "balances");
            await recordPlaidUsageDaily(env.DB, {
              userId: plaidActor.userId,
              itemId,
              source: "direct-balances",
              balancesRefreshed: true,
            });
          }
          return new Response(JSON.stringify(plaidData), {
            status: 200,
            headers: buildHeaders(cors, { "Content-Type": "application/json" }),
          });
        } else if (url.pathname === "/plaid/liabilities") {
          const tierResolution = await resolveEffectiveTier(request, env, plaidActor);
          const tierId = getPlaidCostTierId(tierResolution, env);
          let accessToken = reqBody.accessToken || "";
          let itemId = String(reqBody.itemId || "").trim();
          if (accessToken && env.DB) {
            const ownedToken = await getDbFirstResult(
              env.DB,
              "SELECT access_token FROM plaid_items WHERE access_token = ? AND user_id = ?",
              [accessToken, plaidActor.userId]
            );
            accessToken = ownedToken?.access_token || "";
          }
          if (!accessToken && itemId && env.DB) {
            const itemRow = await getDbFirstResult(
              env.DB,
              "SELECT access_token FROM plaid_items WHERE item_id = ? AND user_id = ?",
              [itemId, plaidActor.userId]
            );
            accessToken = itemRow?.access_token || "";
          }
          if (!accessToken) {
            return new Response(JSON.stringify({ error: "Plaid item not found for actor" }), {
              status: 404,
              headers: buildHeaders(cors, { "Content-Type": "application/json" }),
            });
          }
          if (!itemId && env.DB) {
            itemId = (
              await getDbFirstResult(
                env.DB,
                "SELECT item_id FROM plaid_items WHERE access_token = ? AND user_id = ?",
                [accessToken, plaidActor.userId]
              )
            )?.item_id || "";
          }
          const cachedLiabilitiesRow = itemId ? await getStoredSyncRow(env.DB, plaidActor.userId, itemId) : null;
          const cachedLiabilitiesPayload = parseStoredJson(cachedLiabilitiesRow?.liabilities_json, {});
          const directFetchCooldownMs = getPlaidCooldownMs(env, PLAID_DIRECT_FETCH_COOLDOWNS, tierId);
          const directLiabilitiesTimestamp = itemId
            ? await getPlaidDatasetTimestamp(env.DB, plaidActor.userId, itemId, "liabilities", cachedLiabilitiesRow)
            : 0;
          if (cachedLiabilitiesPayload?.liabilities && directLiabilitiesTimestamp > 0 && (Date.now() - directLiabilitiesTimestamp) < directFetchCooldownMs) {
            return new Response(JSON.stringify(cachedLiabilitiesPayload), {
              status: 200,
              headers: buildHeaders(cors, { "Content-Type": "application/json" }),
            });
          }
          plaidEndpoint = "/liabilities/get";
          plaidBody = {
            client_id: env.PLAID_CLIENT_ID,
            secret: env.PLAID_SECRET,
            access_token: accessToken,
          };
          const plaidData = await fetchPlaidJson(plaidDomain, plaidEndpoint, env, plaidBody);
          if (itemId) {
            await writeSyncRow(env.DB, plaidActor.userId, itemId, {
              liabilitiesJson: JSON.stringify(plaidData),
            });
            await markPlaidDatasetTimestamp(env.DB, plaidActor.userId, itemId, "liabilities");
            await recordPlaidUsageDaily(env.DB, {
              userId: plaidActor.userId,
              itemId,
              source: "direct-liabilities",
              liabilitiesRefreshed: true,
            });
          }
          return new Response(JSON.stringify(plaidData), {
            status: 200,
            headers: buildHeaders(cors, { "Content-Type": "application/json" }),
          });
        } else if (url.pathname === "/plaid/disconnect") {
          let accessToken = reqBody.accessToken || "";
          const itemId = reqBody.itemId || "";

          if (accessToken && env.DB) {
            const ownedToken = await getDbFirstResult(
              env.DB,
              "SELECT access_token FROM plaid_items WHERE access_token = ? AND user_id = ?",
              [accessToken, plaidActor.userId]
            );
            accessToken = ownedToken?.access_token || "";
          }

          if (!accessToken && itemId && env.DB) {
            const itemRow = await getDbFirstResult(
              env.DB,
              "SELECT user_id, access_token FROM plaid_items WHERE item_id = ? AND user_id = ?",
              [itemId, plaidActor.userId]
            );
            accessToken = itemRow?.access_token || "";
            if (itemRow?.user_id) {
              await env.DB.prepare("DELETE FROM sync_data WHERE user_id = ? AND item_id = ?").bind(itemRow.user_id, itemId).run();
            }
            if (itemRow?.user_id) {
              await env.DB.prepare("DELETE FROM plaid_items WHERE item_id = ? AND user_id = ?").bind(itemId, plaidActor.userId).run();
            }
          }

          if (!accessToken) {
            return new Response(JSON.stringify({ error: "Plaid item not found for actor" }), {
              status: 404,
              headers: buildHeaders(cors, { "Content-Type": "application/json" }),
            });
          }

          plaidEndpoint = "/item/remove";
          plaidBody = {
            client_id: env.PLAID_CLIENT_ID,
            secret: env.PLAID_SECRET,
            access_token: accessToken,
          };
          await fetchPlaidJson(plaidDomain, plaidEndpoint, env, plaidBody);
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: buildHeaders(cors, { "Content-Type": "application/json" }),
          });
        } else if (url.pathname === "/plaid/transactions") {
          const tierResolution = await resolveEffectiveTier(request, env, plaidActor);
          const tierId = getPlaidCostTierId(tierResolution, env);
          const itemId =
            reqBody.itemId ||
            (
              await getDbFirstResult(
                env.DB,
                "SELECT item_id FROM plaid_items WHERE access_token = ? AND user_id = ?",
                [reqBody.accessToken, plaidActor.userId]
              )
            )?.item_id;

          if (!itemId) {
            return new Response(JSON.stringify({ error: "Plaid item not found for actor" }), {
              status: 404,
              headers: buildHeaders(cors, { "Content-Type": "application/json" }),
            });
          }
          const cachedTransactionsRow = await getStoredSyncRow(env.DB, plaidActor.userId, itemId);
          const cachedTransactionsPayload = parseStoredJson(cachedTransactionsRow?.transactions_json, {});
          const directFetchCooldownMs = getPlaidCooldownMs(env, PLAID_DIRECT_FETCH_COOLDOWNS, tierId);
          const directTransactionsTimestamp = await getPlaidDatasetTimestamp(
            env.DB,
            plaidActor.userId,
            itemId,
            "transactions",
            cachedTransactionsRow
          );
          if (Array.isArray(cachedTransactionsPayload?.transactions) && cachedTransactionsPayload.transactions.length > 0) {
            if (tierId === "free") {
              return new Response(JSON.stringify(cachedTransactionsPayload), {
                status: 200,
                headers: buildHeaders(cors, { "Content-Type": "application/json" }),
              });
            }
            if (directTransactionsTimestamp > 0 && (Date.now() - directTransactionsTimestamp) < directFetchCooldownMs) {
              return new Response(JSON.stringify(cachedTransactionsPayload), {
                status: 200,
                headers: buildHeaders(cors, { "Content-Type": "application/json" }),
              });
            }
          }
          if (tierId === "free") {
            return new Response(JSON.stringify({
              error: "upgrade_required",
              message: "Use the cached ledger on Free, or upgrade for additional live Plaid transaction refreshes.",
            }), {
              status: 403,
              headers: buildHeaders(cors, { "Content-Type": "application/json" }),
            });
          }

          const itemRow = await getDbFirstResult(
            env.DB,
            "SELECT access_token FROM plaid_items WHERE item_id = ? AND user_id = ?",
            [itemId, plaidActor.userId]
          );
          if (!itemRow?.access_token) {
            return new Response(JSON.stringify({ error: "Plaid item not found for actor" }), {
              status: 404,
              headers: buildHeaders(cors, { "Content-Type": "application/json" }),
            });
          }

          const { mergedTransactions } = await syncTransactionsForItem({
            db: env.DB,
            userId: plaidActor.userId,
            itemId,
            accessToken: itemRow.access_token,
            plaidDomain,
            env,
          });
          await markPlaidDatasetTimestamp(env.DB, plaidActor.userId, itemId, "transactions");
          await recordPlaidUsageDaily(env.DB, {
            userId: plaidActor.userId,
            itemId,
            source: "direct-transactions",
            transactionsRefreshed: true,
          });

          return new Response(JSON.stringify(mergedTransactions), {
            status: 200,
            headers: buildHeaders(cors, { "Content-Type": "application/json" }),
          });
        } else if (url.pathname === "/plaid/webhook") {
          // ── Plaid Webhook Receiver ────────────────────────
          const webhookCode = reqBody.webhook_code || "UNKNOWN";
          const itemId = reqBody.item_id || "";

          // Webhook received — process below

          // Trigger async sync logic using waitUntil
          if (env.DB && (webhookCode === "SYNC_UPDATES_AVAILABLE" || webhookCode === "DEFAULT_UPDATE" || webhookCode === "INITIAL_UPDATE")) {
            // Define async sync task without blocking response
            const performSync = async () => {
              const { results: itemResults } = await env.DB.prepare("SELECT user_id, access_token FROM plaid_items WHERE item_id = ?").bind(itemId).all();
              if (!itemResults || itemResults.length === 0) return;

              const { user_id, access_token } = itemResults[0];

              // --- Tier Rate Limiting ---
              const tierId = await resolveStoredUserTier(user_id, env, {
                isWorkerGatingEnforced: isPlaidCostTierEnforced,
              });
              if (tierId === "free") {
                // Free users: manual sync only — ignore webhook
                return; // Completely ignore webhooks for free users
              }

              // Pro webhook refreshes should keep connected institutions reasonably fresh
              // without waiting longer than the manual sync cadence.
              const itemCooldown = getPlaidCooldownMs(env, PLAID_WEBHOOK_REFRESH_COOLDOWNS, tierId);
              const syncRow = await getStoredSyncRow(env.DB, user_id, itemId);
              const itemLastSync = await getPlaidDatasetTimestamp(
                env.DB,
                user_id,
                itemId,
                "transactions",
                syncRow
              );
              const now = Date.now();
              if (itemCooldown > 0 && itemLastSync > 0 && (now - itemLastSync) < itemCooldown) {
                // Item cooldown not elapsed — skip
                return;
              }
              // --------------------------
              const result = await refreshPlaidItemCache({
                db: env.DB,
                userId: user_id,
                itemId,
                accessToken: access_token,
                plaidDomain,
                env,
                existingRow: syncRow,
                refreshBalances: true,
                refreshTransactions: true,
              });
              await recordPlaidUsageDaily(env.DB, {
                userId: user_id,
                itemId,
                source: "webhook",
                balancesRefreshed: result.balancesRefreshed,
                transactionsRefreshed: result.transactionsRefreshed,
                liabilitiesRefreshed: result.liabilitiesRefreshed,
              });
              // Balance sync persisted to D1
            };

            // Use ctx.waitUntil to keep the worker alive for the async sync
            ctx.waitUntil(
              performSync().catch((error) => {
                workerLog(env, "error", "plaid-webhook", "Background sync failed", { error, itemId });
              })
            );
          }

          return new Response(
            JSON.stringify({ received: true }),
            { status: 200, headers: buildHeaders(cors, { "Content-Type": "application/json" }) }
          );
        } else if (url.pathname === "/api/sync/maintain") {
          if (request.method !== "POST") return new Response("{}", { status: 405 });
          if (!env.DB) return new Response(JSON.stringify({ error: "DB not configured" }), { status: 500, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });

          const tierResolution = await resolveEffectiveTier(request, env, plaidActor);
          const tierId = getPlaidCostTierId(tierResolution, env);
          if (tierId === "free") {
            return new Response(JSON.stringify({
              success: true,
              skipped: true,
              reason: "manual_only",
            }), { status: 200, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }

          const { results: maintainItems } = await env.DB.prepare("SELECT access_token, item_id FROM plaid_items WHERE user_id = ?").bind(plaidActor.userId).all();
          if (!maintainItems || maintainItems.length === 0) {
            return new Response(JSON.stringify({ error: "No plaid items found" }), { status: 404, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }

          const balanceCooldownMs = getPlaidCooldownMs(env, PLAID_BALANCE_REFRESH_COOLDOWNS, tierId);
          const transactionCooldownMs = getPlaidCooldownMs(env, PLAID_TRANSACTION_REFRESH_COOLDOWNS, tierId);
          const liabilityCooldownMs = getPlaidCooldownMs(env, PLAID_LIABILITY_REFRESH_COOLDOWNS, tierId);
          const now = Date.now();
          const refreshedItemIds = [];
          let balancesRefreshed = 0;
          let transactionsRefreshed = 0;
          let liabilitiesRefreshed = 0;

          for (const item of maintainItems) {
            const syncItemId = item.item_id || "default";
            const existingRow = await getStoredSyncRow(env.DB, plaidActor.userId, syncItemId);
            const cachedBalances = parseStoredJson(existingRow?.balances_json, {});
            const cachedTransactions = parseStoredJson(existingRow?.transactions_json, {});
            const cachedLiabilities = parseStoredJson(existingRow?.liabilities_json, {});
            const balancesTimestamp = await getPlaidDatasetTimestamp(env.DB, plaidActor.userId, syncItemId, "balances", existingRow);
            const transactionsTimestamp = await getPlaidDatasetTimestamp(env.DB, plaidActor.userId, syncItemId, "transactions", existingRow);
            const liabilitiesTimestamp = await getPlaidDatasetTimestamp(env.DB, plaidActor.userId, syncItemId, "liabilities", existingRow);

            const refreshBalances =
              !hasPlaidBalancesPayload(cachedBalances) ||
              balanceCooldownMs <= 0 ||
              balancesTimestamp <= 0 ||
              (now - balancesTimestamp) >= balanceCooldownMs;
            const refreshTransactions =
              !hasPlaidTransactionsPayload(cachedTransactions) ||
              transactionCooldownMs <= 0 ||
              transactionsTimestamp <= 0 ||
              (now - transactionsTimestamp) >= transactionCooldownMs;
            const refreshLiabilities =
              !hasPlaidLiabilitiesPayload(cachedLiabilities) ||
              liabilityCooldownMs <= 0 ||
              liabilitiesTimestamp <= 0 ||
              (now - liabilitiesTimestamp) >= liabilityCooldownMs;

            if (!refreshBalances && !refreshTransactions && !refreshLiabilities) continue;

            try {
              const result = await refreshPlaidItemCache({
                db: env.DB,
                userId: plaidActor.userId,
                itemId: syncItemId,
                accessToken: item.access_token,
                plaidDomain,
                env,
                existingRow,
                refreshBalances,
                refreshTransactions,
                refreshLiabilities,
              });
              await recordPlaidUsageDaily(env.DB, {
                userId: plaidActor.userId,
                itemId: syncItemId,
                source: "maintenance",
                balancesRefreshed: result.balancesRefreshed,
                transactionsRefreshed: result.transactionsRefreshed,
                liabilitiesRefreshed: result.liabilitiesRefreshed,
              });
              refreshedItemIds.push(syncItemId);
              if (result.balancesRefreshed) balancesRefreshed += 1;
              if (result.transactionsRefreshed) transactionsRefreshed += 1;
              if (result.liabilitiesRefreshed) liabilitiesRefreshed += 1;
            } catch (err) {
              workerLog(env, "warn", "plaid-sync", "Maintenance sync item failed", {
                error: err,
                itemId: syncItemId,
              });
            }
          }

          return new Response(JSON.stringify({
            success: true,
            refreshedItemIds,
            balancesRefreshed,
            transactionsRefreshed,
            liabilitiesRefreshed,
          }), { status: 200, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
        } else if (url.pathname === "/api/sync/force") {
          // Manually trigger a sync for a user, respecting the tier cooldown.
          if (request.method !== "POST") return new Response("{}", { status: 405 });
          if (!env.DB) return new Response(JSON.stringify({ error: "DB not configured" }), { status: 500, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          const requestBody = reqBody && typeof reqBody === "object" ? reqBody : {};
          const tierResolution = await resolveEffectiveTier(request, env, plaidActor);
          const tierId = getPlaidCostTierId(tierResolution, env);

          const { results: syncResults } = await env.DB.prepare("SELECT * FROM sync_data WHERE user_id = ?").bind(plaidActor.userId).all();
          let lastSyncTime = 0;

          const cooldownMs = getPlaidCooldownMs(env, PLAID_MANUAL_SYNC_COOLDOWNS, tierId);

          const { results: itemResults } = await env.DB.prepare("SELECT access_token, item_id FROM plaid_items WHERE user_id = ?").bind(plaidActor.userId).all();
          if (!itemResults || itemResults.length === 0) {
            return new Response(JSON.stringify({ error: "No plaid items found" }), { status: 404, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }

          let targetItems = itemResults;
          let limitedToItemId = null;
          const requestedItemId = String(requestBody?.connectionId || "").trim();
          const matchedRequestedItem = requestedItemId
            ? itemResults.find(item => String(item.item_id || "") === requestedItemId)
            : null;

          if (matchedRequestedItem) {
            targetItems = [matchedRequestedItem];
            limitedToItemId = matchedRequestedItem.item_id || "default";
          }

          if (tierId === "free") {
            const selectedItem = matchedRequestedItem || itemResults[0];
            if (!selectedItem) {
              return new Response(JSON.stringify({ error: "No plaid items found" }), { status: 404, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
            }
            targetItems = [selectedItem];
            limitedToItemId = selectedItem.item_id || "default";
          }
          lastSyncTime = getLatestTimestampMillis(syncResults || []);

          const now = Date.now();
          const retryAfterMs = getAlignedCooldownRetryAfterMs(lastSyncTime, cooldownMs, now);
          if (retryAfterMs > 0) {
            return new Response(JSON.stringify({
              error: "cooldown",
              message: tierId === "pro" ? "Daily live sync already used for the current window." : "Weekly live sync already used for the current window.",
              cooldownMs,
              retryAfterMs,
              tier: tierId,
              limitedToItemId,
            }), { status: 429, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }

          let anySuccess = false;
          const failedItems = [];
          for (const item of targetItems) {
            const { access_token, item_id: syncItemId } = item;
            try {
              // Manual sync should complete before we return so the client can read fresh data immediately.
              const result = await refreshPlaidItemCache({
                db: env.DB,
                userId: plaidActor.userId,
                itemId: syncItemId || "default",
                accessToken: access_token,
                plaidDomain,
                env,
                existingRow: await getStoredSyncRow(env.DB, plaidActor.userId, syncItemId || "default"),
                refreshBalances: true,
                refreshTransactions: true,
                refreshLiabilities: true,
                ignoreTransactionErrors: true,
              });
              await recordPlaidUsageDaily(env.DB, {
                userId: plaidActor.userId,
                itemId: syncItemId || "default",
                source: "manual",
                balancesRefreshed: result.balancesRefreshed,
                transactionsRefreshed: result.transactionsRefreshed,
                liabilitiesRefreshed: result.liabilitiesRefreshed,
              });
              anySuccess = true;
            } catch (err) {
              const providerError = extractPlaidProviderError(err);
              failedItems.push({
                itemId: syncItemId || "default",
                errorCode: providerError.errorCode,
                errorType: providerError.errorType,
                reconnectRequired: providerError.reconnectRequired,
                message: providerError.displayMessage || providerError.rawMessage || "Live Plaid sync failed.",
              });
              workerLog(env, "warn", "plaid-sync", "Manual sync item failed", {
                error: err,
                itemId: syncItemId || "default",
              });
            }
          }

          if (anySuccess) {
            return new Response(JSON.stringify({
              success: true,
              syncedItemIds: targetItems.map(item => item.item_id || "default"),
              limitedToItemId,
            }), { status: 200, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          } else {
            const reconnectRequiredItemIds = failedItems
              .filter((item) => item.reconnectRequired)
              .map((item) => item.itemId);
            const allReconnectRequired = failedItems.length > 0 && reconnectRequiredItemIds.length === failedItems.length;
            return new Response(JSON.stringify({
              error: allReconnectRequired ? "reconnect_required" : "sync_failed",
              message: allReconnectRequired
                ? "One or more linked banks need to be reconnected before live balances can refresh."
                : "Live Plaid sync failed before fresh balances were returned.",
              failedItems,
              reconnectRequiredItemIds,
            }), {
              status: allReconnectRequired ? 409 : 500,
              headers: buildHeaders(cors, { "Content-Type": "application/json" }),
            });
          }
        } else if (url.pathname === "/api/sync/deep") {
          // On-demand deep sync: liabilities-only enrichment.
          // Deep sync is intentionally paid-only under live gating because Plaid usage is the primary marginal cost.
          if (request.method !== "POST") return new Response("{}", { status: 405 });
          if (!env.DB) return new Response(JSON.stringify({ error: "DB not configured" }), { status: 500, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          const tierResolution = await resolveEffectiveTier(request, env, plaidActor);
          const deepTierId = getPlaidCostTierId(tierResolution, env);

          if (deepTierId === "free") {
            return new Response(JSON.stringify({ error: "upgrade_required", message: "Deep sync is a Pro feature." }), { status: 403, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }

          const { results: deepSyncResults } = await env.DB.prepare("SELECT last_synced_at FROM sync_data WHERE user_id = ? AND item_id = 'deep_sync_meta'").bind(plaidActor.userId).all();
          let lastDeepSync = 0;
          if (deepSyncResults && deepSyncResults.length > 0 && deepSyncResults[0].last_synced_at) {
            lastDeepSync = new Date(deepSyncResults[0].last_synced_at + "Z").getTime();
          }
          const deepCooldown = getPlaidCooldownMs(env, PLAID_DEEP_SYNC_COOLDOWNS, deepTierId);
          if (deepCooldown > 0 && lastDeepSync > 0 && (Date.now() - lastDeepSync) < deepCooldown) {
            return new Response(JSON.stringify({ error: "cooldown", message: "Deep sync on cooldown (7 days)" }), { status: 429, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }

          const { results: deepItems } = await env.DB.prepare("SELECT access_token, item_id FROM plaid_items WHERE user_id = ?").bind(plaidActor.userId).all();
          if (!deepItems || deepItems.length === 0) {
            return new Response(JSON.stringify({ error: "No plaid items" }), { status: 404, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }

          for (const dItem of deepItems) {
            try {
              const result = await refreshPlaidItemCache({
                db: env.DB,
                userId: plaidActor.userId,
                itemId: dItem.item_id || "default",
                accessToken: dItem.access_token,
                plaidDomain,
                env,
                existingRow: await getStoredSyncRow(env.DB, plaidActor.userId, dItem.item_id || "default"),
                refreshLiabilities: true,
              });
              await recordPlaidUsageDaily(env.DB, {
                userId: plaidActor.userId,
                itemId: dItem.item_id || "default",
                source: "deep",
                balancesRefreshed: result.balancesRefreshed,
                transactionsRefreshed: result.transactionsRefreshed,
                liabilitiesRefreshed: result.liabilitiesRefreshed,
              });
            } catch (err) {
              workerLog(env, "warn", "plaid-sync", "Deep sync item failed", {
                error: err,
                itemId: dItem.item_id || "default",
              });
            }
          }

          await env.DB.prepare(
            `INSERT INTO sync_data (user_id, item_id, balances_json) VALUES (?, 'deep_sync_meta', '{}')
             ON CONFLICT(user_id, item_id) DO UPDATE SET last_synced_at=CURRENT_TIMESTAMP`
          ).bind(plaidActor.userId).run();

          return new Response(JSON.stringify({ success: true }), { status: 200, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
        } else if (url.pathname === "/api/sync/status") {
          // Frontend requests latest data from D1, entirely bypassing Plaid
          if (request.method !== "POST") return new Response("{}", { status: 405 });
          if (!env.DB) return new Response(JSON.stringify({ error: "DB not configured" }), { status: 500, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });

          const { results } = await env.DB.prepare("SELECT * FROM sync_data WHERE user_id = ?").bind(plaidActor.userId).all();
          if (!results || results.length === 0) {
            return new Response(JSON.stringify({ hasData: false }), { status: 200, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }

          const payloadRows = results.filter((row) => {
            const itemId = String(row?.item_id || "");
            return itemId && !itemId.startsWith("_plaid_meta:") && itemId !== "deep_sync_meta";
          });
          const freshnessRows = new Map();
          for (const row of results) {
            const itemId = String(row?.item_id || "");
            if (!itemId.startsWith("_plaid_meta:dataset-")) continue;
            const [, action = "", scope = ""] = itemId.split(":");
            const dataset = action.replace(/^dataset-/, "");
            if (!scope) continue;
            const entry = freshnessRows.get(scope) || {};
            entry[dataset] = row?.last_synced_at || null;
            freshnessRows.set(scope, entry);
          }
          if (payloadRows.length === 0) {
            return new Response(JSON.stringify({ hasData: false }), { status: 200, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
          }

          const aggregatePayload = (rows, key) => {
            const aggregated = {};
            for (const row of rows) {
              try {
                const parsed = JSON.parse(row?.[key] || "{}");
                if (!parsed || typeof parsed !== "object") continue;

                if (Array.isArray(parsed.accounts)) {
                  aggregated.accounts = [...(aggregated.accounts || []), ...parsed.accounts];
                }

                if (Array.isArray(parsed.transactions)) {
                  aggregated.transactions = [...(aggregated.transactions || []), ...parsed.transactions];
                  aggregated.total_transactions =
                    Number(aggregated.total_transactions || 0) + Number(parsed.total_transactions || parsed.transactions.length || 0);
                }

                const liabilities = parsed.liabilities;
                if (liabilities && typeof liabilities === "object") {
                  aggregated.liabilities = aggregated.liabilities || {};
                  for (const [liabilityKey, liabilityValue] of Object.entries(liabilities)) {
                    if (Array.isArray(liabilityValue)) {
                      aggregated.liabilities[liabilityKey] = [
                        ...(aggregated.liabilities[liabilityKey] || []),
                        ...liabilityValue,
                      ];
                    } else {
                      aggregated.liabilities[liabilityKey] = liabilityValue;
                    }
                  }
                }
              } catch {
                // Ignore malformed cached payloads for individual items.
              }
            }
            return aggregated;
          };

          const latestSyncedAt = [...payloadRows]
            .map(result => result?.last_synced_at)
            .filter(Boolean)
            .sort()
            .at(-1) || null;

          return new Response(JSON.stringify({
            hasData: true,
            last_synced_at: latestSyncedAt,
            balances: aggregatePayload(payloadRows, "balances_json"),
            liabilities: aggregatePayload(payloadRows, "liabilities_json"),
            transactions: aggregatePayload(payloadRows, "transactions_json"),
            sync_freshness: Object.fromEntries(freshnessRows),
          }), { status: 200, headers: buildHeaders(cors, { "Content-Type": "application/json" }) });
        } else {
          return new Response(JSON.stringify({ error: "Unknown Plaid endpoint" }), {
            status: 404,
            headers: buildHeaders(cors, { "Content-Type": "application/json" }),
          });
        }
      } catch (err) {
        workerLog(env, "error", "plaid-proxy", "Plaid proxy error", { error: err, path: url.pathname });
        return new Response(JSON.stringify({ error: "Plaid proxy error", message: "Catalyst couldn't complete the Plaid request right now." }), {
          status: 500,
          headers: buildHeaders(cors, { "Content-Type": "application/json" }),
        });
      }
    }

    const householdResponse = await handleHouseholdRoute({
      request,
      url,
      env,
      cors,
      buildHeaders,
      resolveAuthenticatedActor,
      sha256Hex,
      buildHouseholdIntegrityTag,
      verifyHouseholdIntegrity,
      workerLog,
    });
    if (householdResponse) return householdResponse;

    const marketResponse = await handleMarketRoute({
      request,
      url,
      cors,
      buildHeaders,
      fetchWithTimeout,
      MARKET_TIMEOUT_MS,
    });
    if (marketResponse) return marketResponse;

    // Only accept POST for /audit
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    }

    const telemetryResponse = await handleTelemetryRoute({
      request,
      url,
      env,
      cors,
      buildHeaders,
      redactForWorkerLogs,
      workerLog,
    });
    if (telemetryResponse) return telemetryResponse;

    if (url.pathname !== "/audit") {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    }

    // ─── Parse Request Body ───────────────────────────────
    let body;
    try {
      const rawBody = await request.text();
      if (rawBody.length > MAX_BODY_SIZE) {
        return new Response(JSON.stringify({ error: "Request body too large (max 512KB)" }), {
          status: 413,
          headers: buildHeaders(cors, { "Content-Type": "application/json" }),
        });
      }
      body = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: buildHeaders(cors, { "Content-Type": "application/json" }),
      });
    }

    const isChat = body.responseFormat === "text";
    const tierResolution = await resolveEffectiveTier(request, env);
    const subscriptionTier = tierResolution.tier;
    const testingBypass = tierResolution.source === "testing";
    const tierHeaders = {
      "X-Entitlement-Verified": String(tierResolution.verified),
      "X-Subscription-Source": tierResolution.source,
    };

    // ─── Rate Limit Check ─────────────────────────────────
    const deviceId = request.headers.get("X-Device-ID") || request.headers.get("CF-Connecting-IP") || "unknown";

    const rateResult = testingBypass
      ? {
          allowed: true,
          remaining: Number.MAX_SAFE_INTEGER,
          limit: Number.MAX_SAFE_INTEGER,
          retryAfter: 0,
          count: 0,
          key: `testing-${deviceId}-${isChat ? "chat" : "audit"}`,
          periodKey: "testing",
        }
      : await peekRateLimit(deviceId, subscriptionTier, isChat, env);
    if (!testingBypass && !rateResult.allowed) {
      const limitName = isChat ? "chats" : "audits";
      return new Response(
        JSON.stringify({
          error: `Rate limit exceeded. Maximum ${rateResult.limit} ${limitName} for your current plan window.`,
          retryAfter: rateResult.retryAfter,
        }),
        {
          status: 429,
          headers: buildHeaders(cors, {
            "Content-Type": "application/json",
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Limit": String(rateResult.limit),
            "Retry-After": String(rateResult.retryAfter),
            ...tierHeaders,
          }),
        }
      );
    }

    // ─── Per-Model Rate Limit (Pro only) ──────────────────
    const modelQuota = !testingBypass && isChat ? getModelQuotaWindow(subscriptionTier, body.model || "") : null;
    if (modelQuota) {
      const modelLimitName = `${subscriptionTier}-${deviceId}-chat-${modelQuota.modelId}`;
      const modelId = env.RATE_LIMITER?.idFromName(modelLimitName);
      if (modelId) {
        const modelStub = env.RATE_LIMITER.get(modelId);
        const modelRes = await modelStub.fetch(`http://internal/?periodKey=${encodeURIComponent(modelQuota.periodKey)}&commit=false`);
        const { count: modelCount } = await modelRes.json();
        if (modelCount >= modelQuota.limit) {
          const modelRetryAfter = Math.max(1, Math.ceil((modelQuota.resetAt.getTime() - Date.now()) / 1000));
          return new Response(
            JSON.stringify({
              error: `Daily ${modelQuota.modelId} limit reached (${modelQuota.limit}/day). Try a different AI model.`,
              modelCapReached: modelQuota.modelId,
              retryAfter: modelRetryAfter,
            }),
            {
              status: 429,
              headers: buildHeaders(cors, {
                "Content-Type": "application/json",
                "Retry-After": String(modelRetryAfter),
                ...tierHeaders,
              }),
            }
          );
        }
      }
    }

    // ─── Per-Model Audit Rate Limit (Pro only) ───────────────
    const auditModelQuota = !testingBypass && !isChat ? getAuditModelQuotaWindow(subscriptionTier, body.model || "") : null;
    if (auditModelQuota && env.RATE_LIMITER) {
      const auditModelLimitName = `${subscriptionTier}-${deviceId}-audit-${auditModelQuota.modelId}`;
      const amId = env.RATE_LIMITER.idFromName(auditModelLimitName);
      const amStub = env.RATE_LIMITER.get(amId);
      const amRes = await amStub.fetch(`http://internal/?periodKey=${encodeURIComponent(auditModelQuota.periodKey)}&commit=false`);
      const { count: auditModelCount } = await amRes.json();
      if (auditModelCount >= auditModelQuota.limit) {
        const amRetryAfter = Math.max(1, Math.ceil((auditModelQuota.resetAt.getTime() - Date.now()) / 1000));
        return new Response(
          JSON.stringify({
            error: `Monthly ${auditModelQuota.modelId} audit limit reached (${auditModelQuota.limit}/mo). Switch AI model or wait until next month.`,
            auditModelCapReached: auditModelQuota.modelId,
            retryAfter: amRetryAfter,
          }),
          {
            status: 429,
            headers: buildHeaders(cors, {
              "Content-Type": "application/json",
              "Retry-After": String(amRetryAfter),
              ...tierHeaders,
            }),
          }
        );
      }
    }

    const { snapshot, systemPrompt, context, type, history, model, stream, provider, responseFormat } = body;
    const resolvedType = type || (isChat ? "chat" : "audit");

    if (!snapshot || (!systemPrompt && !context)) {
      return new Response(JSON.stringify({ error: "Missing required fields: snapshot, context" }), {
        status: 400,
        headers: buildHeaders(cors, { "Content-Type": "application/json", ...tierHeaders }),
      });
    }

    // ─── Resolve Provider ─────────────────────────────────
    const requestedProvider = provider || "gemini";
    if (!VALID_PROVIDERS.includes(requestedProvider)) {
      return new Response(JSON.stringify({ error: "Invalid provider" }), {
        status: 400,
        headers: buildHeaders(cors, { "Content-Type": "application/json", ...tierHeaders }),
      });
    }
    let selectedProvider = requestedProvider;
    let resolvedModel = model || getDefaultModelForTier(selectedProvider, subscriptionTier);
    if (subscriptionTier !== "pro") {
      selectedProvider = "gemini";
      resolvedModel = "gemini-2.5-flash";
    }
    // o3 is a Pro reasoning model — remap chat requests to gpt-4.1 to keep costs bounded.
    // Audit (one-shot) requests are allowed to use o3 directly when explicitly set.
    if (resolvedModel === "o3" && isChat) {
      resolvedModel = "gpt-4.1";
    }
    if (!isModelAllowedForTier(resolvedModel, subscriptionTier)) {
      return new Response(
        JSON.stringify({
          error:
            subscriptionTier === "free"
              ? `Model ${resolvedModel} requires Catalyst Cash Pro.`
              : `Model ${resolvedModel} is not currently available.`,
        }),
        {
          status: 403,
          headers: buildHeaders(cors, {
            "Content-Type": "application/json",
            "X-RateLimit-Remaining": String(rateResult.remaining),
            "X-RateLimit-Limit": String(rateResult.limit),
            ...tierHeaders,
          }),
        }
      );
    }
    const { handler, keyName, keyNames = [keyName] } = getProviderHandler(selectedProvider);

    const apiKey = keyNames.map((candidate) => env[candidate]).find(Boolean);
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: `Backend API key not configured for ${selectedProvider}`,
        }),
        {
          status: 503,
          headers: buildHeaders(cors, { "Content-Type": "application/json", ...tierHeaders }),
        }
      );
    }

    let effectiveContext = context || {};
    if (!systemPrompt && resolvedType === "chat" && typeof snapshot === "string") {
      const serverInputRisk = analyzeServerChatInputRisk(snapshot);
      if (serverInputRisk.blocked) {
        const blockedRateResult = testingBypass ? rateResult : await commitRateLimit(rateResult, env);
        return buildBlockedChatResponse({
          cors,
          tierHeaders,
          rateResult: blockedRateResult,
          stream,
          responseFormat,
          message: buildServerPromptInjectionRefusal(),
        });
      }

      const serverTopicRisk = analyzeServerChatTopicRisk(snapshot);
      if (serverTopicRisk.blocked) {
        const blockedRateResult = testingBypass ? rateResult : await commitRateLimit(rateResult, env);
        return buildBlockedChatResponse({
          cors,
          tierHeaders,
          rateResult: blockedRateResult,
          stream,
          responseFormat,
          message: buildServerTopicRiskRefusal(serverTopicRisk, effectiveContext),
        });
      }
    }

    if (
      !systemPrompt &&
      resolvedType === "chat" &&
      selectedProvider === "openai" &&
      effectiveContext?.financialBrief &&
      typeof snapshot === "string"
    ) {
      try {
        const nativeActionPacket = await routeOpenAIChatAction(apiKey, {
          snapshot,
          history,
          model: resolvedModel,
        });
        if (nativeActionPacket) {
          effectiveContext = {
            ...effectiveContext,
            nativeActionPacket,
          };
        }
      } catch (error) {
        workerLog(env, "warn", "openai-chat-router", "Provider-native chat action routing failed; using deterministic fallback.", {
          error: redactForWorkerLogs(error),
        });
      }
    }

    const resolvedSystemPrompt = systemPrompt || buildSystemPrompt(resolvedType, effectiveContext, selectedProvider, snapshot);
    logPromptProfile(env, resolvedType, selectedProvider, resolvedSystemPrompt);
    const budgetedRequest = enforcePromptBudget(resolvedType, resolvedSystemPrompt, snapshot, history);
    if (budgetedRequest.historyTrimmed > 0 || budgetedRequest.snapshotTrimmed || budgetedRequest.overBudget) {
      workerLog(env, "warn", "prompt-budget", "Prompt payload required budget adjustments.", {
        type: resolvedType,
        provider: selectedProvider,
        estimatedTokens: budgetedRequest.estimatedTokens,
        maxPromptTokens: budgetedRequest.budget.maxPromptTokens,
        historyTrimmed: budgetedRequest.historyTrimmed,
        snapshotTrimmed: budgetedRequest.snapshotTrimmed,
        overBudget: budgetedRequest.overBudget,
      });
    }
    const effectiveSnapshot = budgetedRequest.snapshot;
    const effectiveHistory = budgetedRequest.history;

    const auditLogId = generateAuditLogId();
    const auditUserId = getRevenueCatAppUserId(request) || deviceId;

    const providerTimeoutMs =
      resolvedType === "chat"
        ? 30_000
        : (responseFormat || "json") === "text"
          ? 45_000
          : 50_000;
    const requestStartedAt = Date.now();

    // ─── Execute Provider Call ─────────────────────────────
    try {
      // Structured audits should not stream. The app parses them as strict JSON,
      // so a complete one-shot response is more reliable than partial SSE chunks.
      const shouldStream = stream !== false && responseFormat === "text";
      const providerShouldStream = shouldStream && resolvedType !== "chat";

      const result = await handler(apiKey, {
        snapshot: effectiveSnapshot,
        systemPrompt: resolvedSystemPrompt,
        history: effectiveHistory,
        model: resolvedModel,
        stream: providerShouldStream,
        responseFormat: responseFormat || "json",
        timeoutMs: providerTimeoutMs,
      });
      const committedRateResult = testingBypass ? rateResult : await commitRateLimit(rateResult, env);

      // Commit per-model rate limit (Pro only — chat model)
      if (modelQuota && env.RATE_LIMITER) {
        const modelLimitName = `${subscriptionTier}-${deviceId}-chat-${modelQuota.modelId}`;
        const mId = env.RATE_LIMITER.idFromName(modelLimitName);
        const mStub = env.RATE_LIMITER.get(mId);
        await mStub.fetch(`http://internal/?periodKey=${encodeURIComponent(modelQuota.periodKey)}&commit=true`);
      }

      // Commit per-model audit quota (Pro only — audit model, monthly)
      if (auditModelQuota && env.RATE_LIMITER) {
        const auditModelLimitName = `${subscriptionTier}-${deviceId}-audit-${auditModelQuota.modelId}`;
        const amId = env.RATE_LIMITER.idFromName(auditModelLimitName);
        const amStub = env.RATE_LIMITER.get(amId);
        await amStub.fetch(`http://internal/?periodKey=${encodeURIComponent(auditModelQuota.periodKey)}&commit=true`);
      }

      // Streaming: pipe raw response through
      if (providerShouldStream && result instanceof Response) {
        await insertAuditLogRow(env.DB, {
          id: auditLogId,
          provider: selectedProvider,
          model: resolvedModel,
          userId: auditUserId,
          promptTokens: 0,
          completionTokens: 0,
          parseSucceeded: false,
          hitDegradedFallback: false,
          responsePreview: "",
          confidence: "medium",
          driftWarning: false,
          driftDetails: [],
        });
        ctx.waitUntil(captureStreamAuditLog(env.DB, auditLogId, selectedProvider, result.clone()));

        return new Response(result.body, {
          status: 200,
          headers: buildHeaders(cors, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "X-Audit-Log-ID": auditLogId,
            "X-RateLimit-Remaining": String(committedRateResult.remaining),
            "X-RateLimit-Limit": String(committedRateResult.limit),
            ...tierHeaders,
          }),
        });
      }

      let resultText = stripThoughtProcess(typeof result === "string" ? result : result?.text || "");
      let hitDegradedFallback = false;
      if ((responseFormat || "json") !== "text") {
        const coercedStructuredJson = coerceStructuredJsonResult(resultText);
        if (coercedStructuredJson) {
          resultText = coercedStructuredJson;
        } else {
          workerLog(env, "warn", "structured-json", "Provider returned invalid structured JSON after repair attempts. Retrying on worker.", {
            provider: selectedProvider,
            model: resolvedModel,
            rawLength: resultText.length,
          });
          const retryBudgetMs = Math.max(0, 55_000 - (Date.now() - requestStartedAt));
          if (retryBudgetMs < 6_000) {
            workerLog(env, "warn", "structured-json", "Skipping critical retry because request budget is nearly exhausted. Emitting deterministic structured fallback.", {
              provider: selectedProvider,
              model: resolvedModel,
              retryBudgetMs,
            });
            resultText = buildStructuredAuditFallback(effectiveContext, effectiveSnapshot);
            hitDegradedFallback = true;
          } else {
          try {
            const retryResult = await handler(apiKey, {
              snapshot: effectiveSnapshot,
              systemPrompt: buildCriticalRetryPrompt({
                computedStrategy: effectiveContext?.computedStrategy || {},
                formData: effectiveContext?.formData || {},
              }),
              history: [],
              model: resolvedModel,
              stream: false,
              responseFormat: "json",
              timeoutMs: Math.min(retryBudgetMs, 10_000),
            });
            const retryText = stripThoughtProcess(typeof retryResult === "string" ? retryResult : retryResult?.text || "");
            const coercedRetryJson = coerceStructuredJsonResult(retryText);
            if (coercedRetryJson) {
              resultText = coercedRetryJson;
            } else {
              workerLog(env, "warn", "structured-json", "Critical retry also returned invalid JSON. Emitting deterministic structured fallback.", {
                provider: selectedProvider,
                model: resolvedModel,
                rawLength: retryText.length,
              });
              resultText = buildStructuredAuditFallback(effectiveContext, effectiveSnapshot);
              hitDegradedFallback = true;
            }
          } catch (retryError) {
            workerLog(env, "warn", "structured-json", "Critical retry failed. Emitting deterministic structured fallback.", {
              provider: selectedProvider,
              model: resolvedModel,
              error: redactForWorkerLogs(retryError),
            });
            resultText = buildStructuredAuditFallback(effectiveContext, effectiveSnapshot);
            hitDegradedFallback = true;
          }
          }
        }
      }
      if (resolvedType === "chat") {
        resultText = replaceUnsafeChatOutput(env, selectedProvider, resolvedModel, resultText, effectiveContext);
      }
      const usage = typeof result === "string" ? buildUsage() : buildUsage(result?.usage?.promptTokens, result?.usage?.completionTokens);
      await insertAuditLogRow(env.DB, {
        id: auditLogId,
        provider: selectedProvider,
        model: resolvedModel,
        userId: auditUserId,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        parseSucceeded: false,
        hitDegradedFallback,
        responsePreview: resultText,
        confidence: hitDegradedFallback ? "low" : "medium",
        driftWarning: false,
        driftDetails: [],
      });

      if (shouldStream) {
        return buildTextStreamResponse({
          cors,
          tierHeaders,
          rateResult: committedRateResult,
          message: resultText,
          auditLogId,
          degraded: hitDegradedFallback,
        });
      }

      // Non-streaming: wrap text in JSON
      return new Response(JSON.stringify({ result: resultText }), {
        status: 200,
        headers: buildHeaders(cors, {
          "Content-Type": "application/json",
          "X-Audit-Log-ID": auditLogId,
          "X-Catalyst-Degraded": hitDegradedFallback ? "1" : "0",
          "X-RateLimit-Remaining": String(committedRateResult.remaining),
          "X-RateLimit-Limit": String(committedRateResult.limit),
          ...tierHeaders,
        }),
      });
    } catch (err) {
      workerLog(env, "error", "ai-proxy", "Provider call failed", {
        error: err,
        provider: selectedProvider,
        type: resolvedType,
      });
      if (resolvedType !== "chat" && (responseFormat || "json") !== "text") {
        const fallback = buildStructuredAuditFallback(effectiveContext, effectiveSnapshot);
        await insertAuditLogRow(env.DB, {
          id: auditLogId,
          provider: selectedProvider,
          model: resolvedModel,
          userId: auditUserId,
          promptTokens: 0,
          completionTokens: 0,
          parseSucceeded: false,
          hitDegradedFallback: true,
          responsePreview: fallback,
          confidence: "low",
          driftWarning: false,
          driftDetails: [],
        });
        return new Response(JSON.stringify({ result: fallback }), {
          status: 200,
          headers: buildHeaders(cors, {
            "Content-Type": "application/json",
            "X-Audit-Log-ID": auditLogId,
            "X-Catalyst-Degraded": "1",
            ...tierHeaders,
          }),
        });
      }
      const message = err?.name === "AbortError"
        ? "Upstream provider timed out"
        : getSafeClientError(err, "Catalyst AI is temporarily unavailable. Please try again.");
      return new Response(JSON.stringify({ error: message }), {
        status: 502,
        headers: buildHeaders(cors, { "Content-Type": "application/json", ...tierHeaders }),
      });
    }
  },
  async scheduled(_controller, env, ctx) {
    const retentionDays = resolveAuditLogRetentionDays(env);
    ctx.waitUntil(purgeExpiredAuditLogs(env.DB, retentionDays));
  },
};
