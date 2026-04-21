import { getModelDisplayName, getOperationalFallbackModels } from "../../providers.js";

export type ChatFeedbackVerdict = "helpful" | "needs-work";
export type ChatFeedbackReason = "too_generic" | "wrong_math" | "too_long" | "missed_context";
export type AssistantPhase = "thinking" | "replying";

export interface ChatMessageFeedback {
  verdict: ChatFeedbackVerdict;
  reasons: ChatFeedbackReason[];
  updatedAt: number;
}

export type ChatFeedbackStore = Record<string, ChatMessageFeedback>;

export interface ChatFeedbackProfile {
  totalHelpful: number;
  totalNeedsWork: number;
  dominantReasons: ChatFeedbackReason[];
  promptGuidance: string;
  responsePreferences: {
    preferConcise: boolean;
    preferSpecificity: boolean;
    prioritizeMathChecks: boolean;
    emphasizeLiveContext: boolean;
  };
}

export interface ViewportSize {
  width: number;
  height: number;
}

export const CHAT_FEEDBACK_KEY = "ai-chat-feedback";
export const CHAT_FEEDBACK_REASON_OPTIONS: Array<{ value: ChatFeedbackReason; label: string }> = [
  { value: "too_generic", label: "Too generic" },
  { value: "wrong_math", label: "Wrong math" },
  { value: "too_long", label: "Too long" },
  { value: "missed_context", label: "Missed context" },
];

const VALID_FEEDBACK_REASONS = new Set<ChatFeedbackReason>(
  CHAT_FEEDBACK_REASON_OPTIONS.map((option) => option.value)
);

const FEEDBACK_REASON_GUIDANCE: Record<ChatFeedbackReason, string> = {
  too_generic: "Be specific to the user's actual balances, timeline, and tradeoffs instead of giving broad advice.",
  wrong_math: "Double-check arithmetic, keep the math conservative, and state uncertainty when exact numbers are missing.",
  too_long: "Keep the answer tighter, lead with the conclusion, and avoid repeating the same point.",
  missed_context: "Use the user's saved rules, current audit, and recent conversation context before recommending anything.",
};

function normalizeFeedbackReasons(reasons: unknown): ChatFeedbackReason[] {
  if (!Array.isArray(reasons)) return [];
  return reasons.filter((reason): reason is ChatFeedbackReason => VALID_FEEDBACK_REASONS.has(reason as ChatFeedbackReason));
}

export function readChatFeedbackStore(value: unknown): ChatFeedbackStore {
  if (!value || typeof value !== "object") return {};

  const store: ChatFeedbackStore = {};
  for (const [messageId, entry] of Object.entries(value)) {
    if (!entry || typeof entry !== "object") continue;
    const verdict = (entry as { verdict?: unknown }).verdict;
    if (verdict !== "helpful" && verdict !== "needs-work") continue;

    store[messageId] = {
      verdict,
      reasons: normalizeFeedbackReasons((entry as { reasons?: unknown }).reasons),
      updatedAt: Number((entry as { updatedAt?: unknown }).updatedAt) || Date.now(),
    };
  }

  return store;
}

export function recordChatFeedback(
  previous: ChatFeedbackStore,
  messageId: string,
  verdict: ChatFeedbackVerdict,
  reasons: ChatFeedbackReason[] = []
): ChatFeedbackStore {
  return {
    ...previous,
    [messageId]: {
      verdict,
      reasons: normalizeFeedbackReasons(reasons),
      updatedAt: Date.now(),
    },
  };
}

export function toggleChatFeedbackReason(
  previous: ChatFeedbackStore,
  messageId: string,
  reason: ChatFeedbackReason
): ChatFeedbackStore {
  const existing = previous[messageId];
  if (!existing || existing.verdict !== "needs-work") return previous;

  const reasons = existing.reasons.includes(reason)
    ? existing.reasons.filter((item) => item !== reason)
    : [...existing.reasons, reason];

  return {
    ...previous,
    [messageId]: {
      ...existing,
      reasons,
      updatedAt: Date.now(),
    },
  };
}

export function buildChatFeedbackProfile(
  store: ChatFeedbackStore,
  options: { limit?: number } = {}
): ChatFeedbackProfile {
  const limit = Math.max(1, options.limit || 12);
  const entries = Object.values(store)
    .filter(Boolean)
    .sort((left, right) => (Number(right.updatedAt) || 0) - (Number(left.updatedAt) || 0))
    .slice(0, limit);

  const totalHelpful = entries.filter((entry) => entry.verdict === "helpful").length;
  const totalNeedsWork = entries.filter((entry) => entry.verdict === "needs-work").length;
  const reasonCounts = new Map<ChatFeedbackReason, number>();

  for (const entry of entries) {
    if (entry.verdict !== "needs-work") continue;
    for (const reason of entry.reasons) {
      reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
    }
  }

  const dominantReasons = [...reasonCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([reason]) => reason);

  const responsePreferences = {
    preferConcise: dominantReasons.includes("too_long"),
    preferSpecificity: dominantReasons.includes("too_generic"),
    prioritizeMathChecks: dominantReasons.includes("wrong_math"),
    emphasizeLiveContext: dominantReasons.includes("missed_context"),
  };

  const guidance: string[] = [];
  if (responsePreferences.preferSpecificity) guidance.push(FEEDBACK_REASON_GUIDANCE.too_generic);
  if (responsePreferences.prioritizeMathChecks) guidance.push(FEEDBACK_REASON_GUIDANCE.wrong_math);
  if (responsePreferences.preferConcise) guidance.push(FEEDBACK_REASON_GUIDANCE.too_long);
  if (responsePreferences.emphasizeLiveContext) guidance.push(FEEDBACK_REASON_GUIDANCE.missed_context);
  if (totalHelpful > totalNeedsWork) {
    guidance.push("Preserve the current tone when it is direct, practical, and low-fluff.");
  }

  return {
    totalHelpful,
    totalNeedsWork,
    dominantReasons,
    promptGuidance: guidance.join(" "),
    responsePreferences,
  };
}

export function getEffectiveChatModel(aiModel: string): string {
  return aiModel === "gpt-4.1" || aiModel === "o3" ? "gpt-4.1" : aiModel;
}

export function getChatModelDisplayName(aiModel: string): string {
  return getModelDisplayName(getEffectiveChatModel(aiModel));
}

export function getChatFallbackModel(aiModel: string, options: { proEnabled?: boolean } = {}): string | null {
  return getChatFallbackModels(aiModel, options)[0] || null;
}

export function getChatFallbackModels(aiModel: string, options: { proEnabled?: boolean } = {}): string[] {
  const effectiveModel = getEffectiveChatModel(aiModel);
  if (!options.proEnabled) return [];
  return getOperationalFallbackModels(effectiveModel);
}

export function buildNegotiationPrompt({ merchant, amount }: { merchant: string; amount: number }) {
  return `Draft a negotiation script to lower my $${amount} monthly bill with ${merchant}.`;
}

export function getChatViewportDensity({
  embedded,
  viewport,
}: {
  embedded: boolean;
  viewport: ViewportSize;
}) {
  const compactEmbedded = embedded && viewport.height <= 860;
  const denseEmbedded = embedded && viewport.height <= 780;
  const ultraDenseEmbedded = embedded && viewport.height <= 700;

  return {
    compactEmbedded,
    denseEmbedded,
    ultraDenseEmbedded,
    suggestionCardMinHeight: ultraDenseEmbedded ? 72 : denseEmbedded ? 78 : compactEmbedded ? 86 : 100,
    suggestionGridGap: ultraDenseEmbedded ? 5 : denseEmbedded ? 6 : 8,
    suggestionColumns: viewport.width <= 390 ? 1 : 2,
    emptyTopPadding: ultraDenseEmbedded ? 8 : denseEmbedded ? 18 : compactEmbedded ? 30 : 56,
    orbSize: ultraDenseEmbedded ? 42 : denseEmbedded ? 48 : compactEmbedded ? 54 : 64,
    orbIconSize: ultraDenseEmbedded ? 18 : denseEmbedded ? 20 : compactEmbedded ? 22 : 26,
    titleSize: ultraDenseEmbedded ? 18 : denseEmbedded ? 20 : compactEmbedded ? 21 : 24,
    emptyCopySize: ultraDenseEmbedded ? 11 : 12,
    chipMarginBottom: ultraDenseEmbedded ? 4 : denseEmbedded ? 6 : 10,
    promptClamp: 0,
  };
}
