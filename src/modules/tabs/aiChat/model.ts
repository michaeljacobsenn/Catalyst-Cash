export type ChatFeedbackVerdict = "helpful" | "needs-work";
export type ChatFeedbackReason = "too_generic" | "wrong_math" | "too_long" | "missed_context";
export type AssistantPhase = "thinking" | "replying";

export interface ChatMessageFeedback {
  verdict: ChatFeedbackVerdict;
  reasons: ChatFeedbackReason[];
  updatedAt: number;
}

export type ChatFeedbackStore = Record<string, ChatMessageFeedback>;

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

export function getEffectiveChatModel(aiModel: string): string {
  return aiModel === "gpt-4.1" || aiModel === "o3" ? "gpt-4.1" : aiModel;
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
    emptyTopPadding: ultraDenseEmbedded ? 8 : denseEmbedded ? 18 : compactEmbedded ? 30 : 56,
    orbSize: ultraDenseEmbedded ? 42 : denseEmbedded ? 48 : compactEmbedded ? 54 : 64,
    orbIconSize: ultraDenseEmbedded ? 18 : denseEmbedded ? 20 : compactEmbedded ? 22 : 26,
    titleSize: ultraDenseEmbedded ? 18 : denseEmbedded ? 20 : compactEmbedded ? 21 : 24,
    emptyCopySize: ultraDenseEmbedded ? 11 : 12,
    chipMarginBottom: ultraDenseEmbedded ? 4 : denseEmbedded ? 6 : 10,
    promptClamp: ultraDenseEmbedded || denseEmbedded ? 2 : 3,
  };
}
