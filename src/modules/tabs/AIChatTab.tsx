import React,{
    memo,
    Suspense,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FormEvent,
    type KeyboardEvent,
    type ReactNode
} from "react";
import { callAudit, streamAudit } from "../api.js";
import {
  analyzeChatAssistantOutputRisk,
  analyzeChatInputRisk,
  analyzeChatTopicRisk,
  buildDeterministicChatFallback,
  buildHighRiskTopicRefusal,
  buildPromptInjectionRefusal,
  normalizeChatAssistantOutput,
} from "../chatSafety.js";
import { useNavigation } from "../contexts/NavigationContext.js";
import { T } from "../constants.js";
import { evaluateChatDecisionRules } from "../decisionRules.js";
import { generateStrategy, mergeSnapshotDebts } from "../engine.js";
import { haptic } from "../haptics.js";
import { AlertTriangle, ArrowDown, ArrowUpRight, CheckCircle2, MessageCircle, Sparkles, Trash2 } from "../icons";
import { log } from "../logger.js";
import { extractMemoryTags, extractUserMemoryFacts } from "../memory.js";
import { isLikelyNetworkError, isLikelyProviderAvailabilityError, toUserFacingRequestError } from "../networkErrors.js";
import { useOnlineStatus } from "../onlineStatus.js";
import { buildScrubber } from "../scrubber.js";
import {
  checkChatQuota,
  hasPaidProAccess,
  isGatingEnforced,
  recordChatUsage,
  shouldShowGating,
  SUBSCRIPTION_STATE_CHANGED_EVENT,
} from "../subscription.js";
import UiGlyph from "../UiGlyph.js";
import { Skeleton as UISkeleton } from "../ui.js";
import { db } from "../utils.js";
import ProBanner from "./ProBanner.js";
import { CHAT_STORAGE_KEY, ChatMarkdown, createChatMessage, getRandomSuggestions, stripThoughtProcess } from "./aiChat/helpers";
import {
  buildChatFeedbackProfile,
  buildNegotiationPrompt,
  CHAT_FEEDBACK_KEY,
  CHAT_FEEDBACK_REASON_OPTIONS,
  getChatFallbackModel,
  getChatFallbackModels,
  getChatModelDisplayName,
  getChatViewportDensity,
  getEffectiveChatModel,
  readChatFeedbackStore,
  recordChatFeedback,
  toggleChatFeedbackReason,
  type AssistantPhase,
  type ChatFeedbackReason,
  type ChatFeedbackStore,
  type ChatFeedbackVerdict,
  type ViewportSize,
} from "./aiChat/model";
import { buildCompactFinancialBrief, prepareScrubbedChatTransport } from "./aiChat/transport";
import { useAIChatPersistence } from "./aiChat/useAIChatPersistence";
const LazyProPaywall = React.lazy(() => import("./ProPaywall.js"));

  import type {
    AskAiNegotiationPayload,
    AuditRecord,
    ChatHistoryMessage,
    ChatQuotaState,
    GeminiHistoryMessage,
  } from "../../types/index.js";
  import { useAudit } from "../contexts/AuditContext.js";
  import { usePortfolio } from "../contexts/PortfolioContext.js";
  import { useSecurity } from "../contexts/SecurityContext.js";
  import { useSettings } from "../contexts/SettingsContext.js";

// ═══════════════════════════════════════════════════════════════
// AI CHAT TAB — Conversational Financial AI
// ═══════════════════════════════════════════════════════════════
// Premium, iOS-native chat experience connected to the user's
// full financial profile. Streams responses in real-time.
// ═══════════════════════════════════════════════════════════════

interface AIChatTabProps {
  proEnabled?: boolean;
  privacyMode?: boolean;
  themeTick?: number;
  initialPrompt?: string | null;
  clearInitialPrompt?: (() => void) | null;
  onBack?: (() => void) | null;
  embedded?: boolean;
}

interface NavigationState {
  negotiateBill?: AskAiNegotiationPayload | null;
}

interface NavigationApi {
  navState?: NavigationState | null;
  clearNavState?: (() => void) | undefined;
  registerChatStreamAbort?: ((handler: (() => void) | null) => void) | undefined;
}

interface SecurityApi {
  privacyMode: boolean;
}

interface ProBannerProps {
  onUpgrade: () => void;
  label: string;
  sublabel?: string;
}

interface ProPaywallProps {
  onClose: () => void;
  source?: string;
}

interface SkeletonProps {
  height: number;
  width: string;
}

interface DecisionRecommendation {
  flag: string;
  active: boolean;
  severity: string;
  rationale: string;
  recommendation?: string;
}

interface ChatInputRisk {
  blocked: boolean;
  suspectedPromptInjection: boolean;
  severity: string;
  matches: Array<{ flag: string; severity?: string; rationale?: string }>;
  rationale?: string;
}

interface ChatTopicRisk {
  blocked: boolean;
  severity: string;
  kind: string | null;
  matches: Array<{ flag: string; kind?: string; severity?: string; rationale?: string }>;
  rationale?: string;
}

const ProBannerTyped = ProBanner as unknown as (props: ProBannerProps) => ReactNode;
const LazyProPaywallTyped = LazyProPaywall as unknown as (props: ProPaywallProps) => ReactNode;
const Skeleton = UISkeleton as unknown as (props: SkeletonProps) => ReactNode;
const analyzeChatInputRiskTyped = analyzeChatInputRisk as unknown as (text: string) => ChatInputRisk;
const analyzeChatTopicRiskTyped = analyzeChatTopicRisk as unknown as (text: string) => ChatTopicRisk;
const analyzeChatAssistantOutputRiskTyped = analyzeChatAssistantOutputRisk as unknown as (text: string) => ChatTopicRisk;
const buildPromptInjectionRefusalTyped = buildPromptInjectionRefusal as unknown as () => string;
const buildDeterministicChatFallbackTyped = buildDeterministicChatFallback as unknown as (options: {
  current?: AuditRecord | null;
  computedStrategy?: Record<string, unknown> | null;
  decisionRecommendations?: DecisionRecommendation[];
  error?: string;
}) => string;
const buildHighRiskTopicRefusalTyped = buildHighRiskTopicRefusal as unknown as (options: {
  risk?: ChatTopicRisk | null;
  current?: AuditRecord | null;
  computedStrategy?: Record<string, unknown> | null;
  decisionRecommendations?: DecisionRecommendation[];
}) => string;
const normalizeChatAssistantOutputTyped = normalizeChatAssistantOutput as unknown as (text: string) => {
  text: string;
  valid: boolean;
};
const streamAuditTyped = streamAudit as (
  apiKey: string,
  snapshot: string,
  providerId: string,
  model: string,
  context: Record<string, unknown>,
  history?: ChatHistoryMessage[] | GeminiHistoryMessage[],
  deviceId?: string,
  signal?: AbortSignal,
  isChat?: boolean
) => AsyncGenerator<string, void, unknown>;
const callAuditTyped = callAudit as (
  apiKey: string,
  snapshot: string,
  providerId: string,
  model: string,
  context: Record<string, unknown>,
  history?: ChatHistoryMessage[] | GeminiHistoryMessage[],
  deviceId?: string,
  isChat?: boolean,
  signal?: AbortSignal
) => Promise<string>;

function TypingDots() {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: T.accent.primary,
            opacity: 0.45,
            animation: `chatTypingPulse 1.1s ease-in-out ${dot * 0.14}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function findPreviousUserQuestion(messages: ChatHistoryMessage[], assistantIndex: number): string {
  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (candidate?.role === "user" && candidate.content?.trim()) {
      return candidate.content.trim();
    }
  }
  return "";
}

function getFeedbackReasonLabels(reasons: ChatFeedbackReason[]): string[] {
  return CHAT_FEEDBACK_REASON_OPTIONS
    .filter((option) => reasons.includes(option.value))
    .map((option) => option.label);
}

interface SendMessageUiOptions {
  displayText?: string;
}

export default memo(function AIChatTab({
  proEnabled = false,
  privacyMode: _privacyModeTick = false,
  themeTick: _themeTick = 0,
  initialPrompt = null,
  clearInitialPrompt = null,
  onBack = null,
  embedded = false,
}: AIChatTabProps) {
  void _privacyModeTick;
  void _themeTick;
  void onBack;
  const { current, history, trendContext } = useAudit();
  const online = useOnlineStatus();
  const { apiKey, aiProvider, aiModel, financialConfig, persona, personalRules, setAiModel } = useSettings();
  const { cards, renewals, bankAccounts } = usePortfolio();
  const { privacyMode } = useSecurity() as SecurityApi;
  const { navState, clearNavState, registerChatStreamAbort } = useNavigation() as NavigationApi;

  const [input, setInput] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showScrollDown, setShowScrollDown] = useState<boolean>(false);
  const [chatQuota, setChatQuota] = useState<ChatQuotaState>({ allowed: true, remaining: Infinity, limit: Infinity, used: 0 });
  const [inputFocused, setInputFocused] = useState<boolean>(false);
  const [showPaywall, setShowPaywall] = useState<boolean>(false);
  const [messageFeedback, setMessageFeedback] = useState<ChatFeedbackStore>({});
  const [assistantPhase, setAssistantPhase] = useState<AssistantPhase | null>(null);
  const [liveAssistantPreview, setLiveAssistantPreview] = useState<string>("");
  const [viewport, setViewport] = useState<ViewportSize>(() => ({
    width: typeof window === "undefined" ? 390 : window.innerWidth,
    height: typeof window === "undefined" ? 844 : window.innerHeight,
  }));

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const syncViewport = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    syncViewport();
    window.addEventListener("resize", syncViewport);
    window.addEventListener("orientationchange", syncViewport);
    return () => {
      window.removeEventListener("resize", syncViewport);
      window.removeEventListener("orientationchange", syncViewport);
    };
  }, []);
  const effectiveChatModel = getEffectiveChatModel(aiModel);
  const showChatQuotaStatus = !privacyMode && chatQuota.limit !== Infinity;
  const chatQuotaTone =
    chatQuota.remaining <= 3
      ? T.status.red
      : chatQuota.remaining <= 8
        ? T.status.amber
        : T.accent.primary;
  const chatQuotaModelLabel =
    chatQuota.modelId === "gpt-4.1"
      ? "CFO"
      : chatQuota.modelId === "gemini-2.5-flash"
        ? "Flash"
        : chatQuota.modelId === "o3"
          ? "Reasoning"
          : "AskAI";
  const chatQuotaStatusCopy =
    chatQuota.remaining === 0
      ? `${chatQuotaModelLabel} limit reached today`
      : `${chatQuota.remaining} of ${chatQuota.limit} chats left today`;

  useEffect(() => {
    let active = true;
    db.get(CHAT_FEEDBACK_KEY)
      .then((stored) => {
        if (active) {
          setMessageFeedback(readChatFeedbackStore(stored));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const initialPromptSent = useRef<boolean>(false);
  const lastUserMsgRef = useRef<string | null>(null);
  const {
    messages,
    setMessages,
    persistMessages,
    buildAPIMessages,
    rememberFacts,
    getMemoryBlock,
  } = useAIChatPersistence({
    privacyMode,
    aiProvider,
    aiModel,
  });
  const chatFeedbackProfile = useMemo(
    () => buildChatFeedbackProfile(messageFeedback),
    [messageFeedback]
  );

  const chatStrategy = useMemo<Record<string, unknown> | null>(() => {
    if (!current?.form || !financialConfig) return null;

    try {
      const strategyCards = mergeSnapshotDebts(
        cards || [],
        Array.isArray(current.form.debts) ? current.form.debts : [],
        financialConfig?.defaultAPR || 0
      );

      return generateStrategy(financialConfig, {
        checkingBalance: parseFloat(String(current.form.checking || 0)),
        savingsTotal: parseFloat(String(current.form.savings || current.form.ally || 0)),
        cards: strategyCards,
        renewals,
        snapshotDate: current.form.date || new Date().toISOString().split("T")[0],
      }) as Record<string, unknown>;
    } catch (strategyError) {
      log.warn("chat", "Failed to compute chat strategy context", {
        error: strategyError instanceof Error ? strategyError.message : "unknown",
      });
      return null;
    }
  }, [current, financialConfig, cards, renewals]);

  useEffect(() => {
    const refreshQuota = async () => {
      const q = await checkChatQuota(effectiveChatModel);
      setChatQuota(q);
    };
    void refreshQuota();
  }, [messages.length, effectiveChatModel, proEnabled]);

  useEffect(() => {
    const refreshQuota = () => {
      void checkChatQuota(effectiveChatModel)
        .then(setChatQuota)
        .catch(() => {});
    };

    window.addEventListener(SUBSCRIPTION_STATE_CHANGED_EVENT, refreshQuota);
    return () => window.removeEventListener(SUBSCRIPTION_STATE_CHANGED_EVENT, refreshQuota);
  }, [effectiveChatModel]);

  // ── Auto-scroll to bottom ──
  const scrollToBottom = useCallback((smooth = true): void => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
    });
  }, []);

  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
  }, [messages.length, scrollToBottom]);

  // ── Scroll detection for "scroll down" button ──
  const handleScroll = useCallback((): void => {
    const currentScroll = scrollRef.current;
    if (!currentScroll) return;
    const { scrollTop, scrollHeight, clientHeight } = currentScroll;
    setShowScrollDown(scrollHeight - scrollTop - clientHeight > 120);
  }, []);

  // ── Send message ──
  const sendMessage = useCallback(
    async (
      text: string,
      extraPromptContext: Record<string, unknown> | null = null,
      uiOptions: SendMessageUiOptions = {}
    ): Promise<void> => {
      const trimmedText = text?.trim();
      const visibleText = (uiOptions.displayText || trimmedText || "").trim();
      if (!trimmedText || !visibleText || isStreamingRef.current) return;
      if (!online) {
        setError("You're offline. Ask AI resumes when you reconnect. Existing chat history is still available.");
        haptic.medium();
        return;
      }

      // ── Quota gate — check BEFORE adding message to state ──
      if (isGatingEnforced() && !chatQuota.allowed) {
        setError("Daily message limit reached. Upgrade to Catalyst Cash Pro for 30 messages/day.");
        haptic.medium();
        return;
      }

      const userMsg = createChatMessage("user", visibleText);
      // Guard: if the last message is already this user message (e.g. after a retry),
      // don't duplicate it — just resume from the existing state.
      const lastMsg = messages[messages.length - 1];
      const alreadyPresent = lastMsg?.role === "user" && lastMsg?.content === userMsg.content;
      const newMsgs = alreadyPresent ? [...messages] : [...messages, userMsg];
      lastUserMsgRef.current = visibleText; // Track for safe retry

      const decisionRecommendations = evaluateChatDecisionRules({
        current,
        financialConfig,
        cards,
        bankAccounts,
        renewals,
        computedStrategy: chatStrategy,
      }) as DecisionRecommendation[];
      const inputRisk = analyzeChatInputRiskTyped(trimmedText);
      const topicRisk = analyzeChatTopicRiskTyped(trimmedText);
      const userMemoryFacts = extractUserMemoryFacts(trimmedText);

      setMessages(newMsgs);
      setInput("");
      setError(null);

      if (inputRisk.blocked) {
        const blockedReply = createChatMessage(
          "assistant",
          `${buildPromptInjectionRefusalTyped()}\n\n${buildDeterministicChatFallbackTyped({
            current,
            computedStrategy: chatStrategy,
            decisionRecommendations,
          })}`
        );
        const blockedMsgs = [...newMsgs, blockedReply];
        setMessages(blockedMsgs);
        void persistMessages(blockedMsgs);
        setError("Catalyst blocked a prompt override attempt. Ask a finance question instead.");
        haptic.medium();
        return;
      }

      if (topicRisk.blocked) {
        const blockedReply = createChatMessage(
          "assistant",
          buildHighRiskTopicRefusalTyped({
            risk: topicRisk,
            current,
            computedStrategy: chatStrategy,
            decisionRecommendations,
          })
        );
        const blockedMsgs = [...newMsgs, blockedReply];
        setMessages(blockedMsgs);
        void persistMessages(blockedMsgs);
        haptic.medium();
        return;
      }

      if (userMemoryFacts.length > 0) {
        void rememberFacts(userMemoryFacts);
      }

      setIsStreaming(true);
      isStreamingRef.current = true;
      setAssistantPhase("thinking");
      setLiveAssistantPreview("");
      haptic.light();

      const memBlock = getMemoryBlock();
      const scrubber = buildScrubber(cards, renewals, financialConfig, current?.form || {});
      const financialBrief = buildCompactFinancialBrief({
        current,
        financialConfig,
        cards,
        bankAccounts,
        renewals,
        history,
        trendContext,
      });
      const promptContext = {
        variant: extraPromptContext?.variant || "default",
        financialBrief,
        persona,
        personalRules: personalRules || "",
        providerId: aiProvider,
        memoryBlock: memBlock,
        decisionRecommendations,
        chatInputRisk: inputRisk,
        chatFeedbackProfile:
          chatFeedbackProfile.totalHelpful || chatFeedbackProfile.totalNeedsWork
            ? chatFeedbackProfile
            : null,
        chatFeedbackGuidance: chatFeedbackProfile.promptGuidance || "",
        aiConsent: true,
        ...extraPromptContext,
      };

      // Build conversation history for the API
      const apiHistory = buildAPIMessages(newMsgs.slice(0, -1)); // Exclude the latest user message (sent as snapshot)
      const transport = prepareScrubbedChatTransport({
        latestUserMessage: trimmedText,
        promptContext,
        apiHistory,
        scrub: scrubber.scrub,
      });
      const canUseAlternateModels = proEnabled
        ? await hasPaidProAccess().catch(() => false)
        : false;

      const abort = new AbortController();
      abortRef.current = abort;

      let accumulated = "";
      const assistantMsg: ChatHistoryMessage = { role: "assistant", content: "", ts: Date.now() };
      const preferNonStreamingChat = /gemini/i.test(String(effectiveChatModel || ""));

      const finalizeAssistantResponse = async (
        rawText: string,
        errorCode: string,
        options: { modelUsed?: string; prefix?: string } = {}
      ): Promise<boolean> => {
        const restored = `${options.prefix || ""}${scrubber.unscrub(rawText || "")}`.trim();
        const { cleanText, newFacts } = extractMemoryTags(restored);
        const displayText = stripThoughtProcess(cleanText || restored);
        const normalizedResponse = normalizeChatAssistantOutputTyped(displayText);
        if (!normalizedResponse.valid) return false;
        const outputRisk = analyzeChatAssistantOutputRiskTyped(normalizedResponse.text);
        const safeResponse = outputRisk.blocked
          ? buildHighRiskTopicRefusalTyped({
            risk: outputRisk,
            current,
            computedStrategy: chatStrategy,
            decisionRecommendations,
          })
          : normalizedResponse.text;
        const safeFacts = outputRisk.blocked ? [] : newFacts;
        const modelUsed = options.modelUsed || effectiveChatModel;

        const finalMsgs = [...newMsgs, { ...assistantMsg, content: safeResponse, ts: Date.now() }];
        setMessages(finalMsgs);
        void persistMessages(finalMsgs);
        if (safeFacts.length > 0) {
          void rememberFacts(safeFacts);
        }
        recordChatUsage(modelUsed).catch(() => { });
        const q = await checkChatQuota(modelUsed);
        setChatQuota(q);
        setError(null);
        setAssistantPhase(null);
        setLiveAssistantPreview("");
        log.info("chat", "Chat response finalized", {
          model: modelUsed,
          source: errorCode,
        });
        return true;
      };

      const tryNonStreamingRecovery = async (reason: string): Promise<boolean> => {
        try {
          log.warn("chat", "Retrying AskAI with non-streaming recovery", {
            model: effectiveChatModel,
            reason,
          });
          const retryRaw = await callAuditTyped(
            apiKey,
            transport.snapshot,
            aiProvider,
            effectiveChatModel,
            transport.promptContext,
            transport.apiHistory,
            undefined,
            true,
            abort.signal
          );
          return await finalizeAssistantResponse(retryRaw, `non-stream-recovery:${reason}`);
        } catch (retryError) {
          log.warn("chat", "Non-streaming recovery failed", {
            model: effectiveChatModel,
            reason,
            error: retryError instanceof Error ? retryError.message : String(retryError),
          });
          return false;
        }
      };

      const tryAutomaticModelRecovery = async (reason: string, sourceError: unknown): Promise<boolean> => {
        const fallbackModels = getChatFallbackModels(effectiveChatModel, { proEnabled: canUseAlternateModels });
        if (fallbackModels.length === 0) return false;
        if (!isLikelyProviderAvailabilityError(sourceError)) return false;

        for (const fallbackModel of fallbackModels) {
          try {
            log.warn("chat", "Retrying AskAI with alternate model failover", {
              model: effectiveChatModel,
              fallbackModel,
              reason,
              error: sourceError instanceof Error ? sourceError.message : String(sourceError),
            });
            const fallbackRaw = await callAuditTyped(
              apiKey,
              transport.snapshot,
              aiProvider,
              fallbackModel,
              transport.promptContext,
              transport.apiHistory,
              undefined,
              true,
              abort.signal
            );
            const finalized = await finalizeAssistantResponse(
              fallbackRaw,
              `alternate-model:${reason}`,
              {
                modelUsed: fallbackModel,
                prefix: `*${getChatModelDisplayName(effectiveChatModel)} is temporarily unavailable, so ${getChatModelDisplayName(fallbackModel)} handled this reply.*\n\n`,
              }
            );
            if (!finalized) continue;
            (setAiModel as (m: string) => void)(fallbackModel);
            return true;
          } catch (fallbackError) {
            log.warn("chat", "Alternate model recovery failed", {
              model: effectiveChatModel,
              fallbackModel,
              reason,
              error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
            });
          }
        }
        return false;
      };

      try {
        log.info("chat", "Chat message sent", { provider: aiProvider, model: aiModel });

        if (preferNonStreamingChat) {
          const raw = await callAuditTyped(
            apiKey,
            transport.snapshot,
            aiProvider,
            effectiveChatModel,
            transport.promptContext,
            transport.apiHistory,
            undefined,
            true,
            abort.signal
          );
          accumulated = raw || "";
        } else {
          const stream = streamAuditTyped(
            apiKey,
            transport.snapshot,
            aiProvider,
            effectiveChatModel,
            transport.promptContext,
            transport.apiHistory,
            undefined,
            abort.signal,
            true
          );

          for await (const chunk of stream) {
            if (abort.signal.aborted) break;
            accumulated += chunk;
            assistantMsg.content = stripThoughtProcess(scrubber.unscrub(accumulated));
            assistantMsg.ts = Date.now();
            setAssistantPhase("replying");
            setLiveAssistantPreview(assistantMsg.content);
            setMessages([...newMsgs, { ...assistantMsg }]);
          }
        }

        if (accumulated.trim()) {
          const finalized = await finalizeAssistantResponse(
            accumulated,
            preferNonStreamingChat ? "non-stream-primary" : "stream-primary"
          );
          if (!finalized) {
            const recovered = preferNonStreamingChat
              ? false
              : await tryNonStreamingRecovery("empty-or-malformed-chat-output");
            if (!recovered) {
              const fallbackText = buildDeterministicChatFallbackTyped({
                current,
                computedStrategy: chatStrategy,
                decisionRecommendations,
                error: "empty-or-malformed-chat-output",
              });
              const finalMsgs = [...newMsgs, createChatMessage("assistant", fallbackText)];
              setMessages(finalMsgs);
              void persistMessages(finalMsgs);
              setError("AI response was incomplete. Showing native fallback guidance instead.");
            }
          }
        } else {
          const recovered = await tryNonStreamingRecovery("empty-chat-output");
          if (!recovered) {
          const fallbackText = buildDeterministicChatFallbackTyped({
            current,
            computedStrategy: chatStrategy,
            decisionRecommendations,
            error: "empty-chat-output",
          });
          const finalMsgs = [...newMsgs, createChatMessage("assistant", fallbackText)];
          setMessages(finalMsgs);
          void persistMessages(finalMsgs);
          setError("AI response was empty. Showing native fallback guidance instead.");
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          // User cancelled — keep partial response
          if (accumulated.trim()) {
            const restored = scrubber.unscrub(accumulated);
            const finalMsgs = [...newMsgs, { ...assistantMsg, content: restored + "\n\n*[Response cancelled]*" }];
            setMessages(finalMsgs);
            void persistMessages(finalMsgs);
          } else {
            const finalMsgs = [...newMsgs, createChatMessage("assistant", "Response stopped.")];
            setMessages(finalMsgs);
            void persistMessages(finalMsgs);
          }
          setError(null);
        } else {
          // ── Per-model cap auto-switch (Pro only) ──
          const modelCap = (err as Record<string, unknown>)?.modelCapReached;
          if (modelCap && typeof modelCap === "string") {
            const nextModel = getChatFallbackModel(modelCap, { proEnabled: canUseAlternateModels });
            if (nextModel) {
              (setAiModel as (m: string) => void)(nextModel);
              setError(`Daily ${getChatModelDisplayName(modelCap)} limit reached. Switched to ${getChatModelDisplayName(nextModel)} — send your message again.`);
              // Remove the failed assistant message so user can retry cleanly
      setMessages(newMsgs);
              return;
            }
          }

          const failoverRecovered = await tryAutomaticModelRecovery("provider-availability", err);
          if (failoverRecovered) return;

          if (!preferNonStreamingChat && !String(accumulated || "").trim()) {
            const recovered = await tryNonStreamingRecovery("stream-transport-error");
            if (recovered) return;
          }

          const failure = toUserFacingRequestError(err, { context: "chat" });
          log.error("chat", "Chat error", { error: failure.rawMessage });
          const fallbackText = buildDeterministicChatFallbackTyped({
            current,
            computedStrategy: chatStrategy,
            decisionRecommendations,
            error: failure.userMessage,
          });
          const finalMsgs = [...newMsgs, createChatMessage("assistant", fallbackText)];
          setError(`${failure.userMessage} Showing native fallback guidance.`);
          setMessages(finalMsgs);
          void persistMessages(finalMsgs);
        }
      } finally {
        setIsStreaming(false);
        isStreamingRef.current = false;
        abortRef.current = null;
        setAssistantPhase(null);
        setLiveAssistantPreview("");
      }
    },
    [
      messages,
      current,
      financialConfig,
      cards,
      renewals,
      history,
      persona,
      personalRules,
      trendContext,
      chatStrategy,
      apiKey,
      aiProvider,
      aiModel,
      buildAPIMessages,
      getMemoryBlock,
      persistMessages,
      chatQuota,
      chatFeedbackProfile,
      rememberFacts,
      setAiModel,
      online,
    ]
  );

  // ── Cancel streaming ──
  const cancelStream = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      haptic.medium();
    }
  }, []);

  const abortStreamSilently = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  useEffect(() => {
    registerChatStreamAbort?.(abortStreamSilently);
    return () => {
      registerChatStreamAbort?.(null);
      abortRef.current?.abort();
    };
  }, [abortStreamSilently, registerChatStreamAbort]);

  // ── Clear chat ──
  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
    db.del(CHAT_STORAGE_KEY);
    haptic.medium();
  }, []);

  const recordMessageFeedback = useCallback(
    (messageId: string, verdict: ChatFeedbackVerdict, reasons: ChatFeedbackReason[] = []): void => {
      setMessageFeedback((prev) => {
        const next = recordChatFeedback(prev, messageId, verdict, reasons);
        void db.set(CHAT_FEEDBACK_KEY, next);
        log.info("chat", "Chat response feedback recorded", { verdict, reasons, messageId });
        return next;
      });
      haptic.selection();
    },
    []
  );

  const toggleMessageFeedbackReason = useCallback((messageId: string, reason: ChatFeedbackReason): void => {
    setMessageFeedback((prev) => {
      const next = toggleChatFeedbackReason(prev, messageId, reason);
      if (next === prev) return prev;
      void db.set(CHAT_FEEDBACK_KEY, next);
      log.info("chat", "Chat response feedback updated", {
        verdict: "needs-work",
        reasons: next[messageId]?.reasons || [],
        messageId,
      });
      return next;
    });
    haptic.selection();
  }, []);

  const requestFeedbackRevision = useCallback(
    (assistantIndex: number, reasons: ChatFeedbackReason[] = []): void => {
      const assistantMessage = messages[assistantIndex];
      if (!assistantMessage || assistantMessage.role !== "assistant") return;

      const originalQuestion = findPreviousUserQuestion(messages, assistantIndex);
      const reasonLabels = getFeedbackReasonLabels(reasons);

      void sendMessage(
        "Revise the previous answer using my feedback.",
        {
          variant: "feedback-revision",
          feedbackRevisionRequest: {
            originalQuestion,
            issues: reasonLabels,
            instruction:
              reasonLabels.length > 0
                ? `Revise the previous answer for the same question. Fix these issues: ${reasonLabels.join(", ")}.`
                : "Revise the previous answer for the same question. Make it more specific, concise, and grounded in the user's live financial context.",
          },
        },
        { displayText: "Improve that answer." }
      );
    },
    [messages, sendMessage]
  );

  // ── Handle submit ──
  const handleSubmit = (event?: FormEvent<HTMLFormElement> | KeyboardEvent<HTMLTextAreaElement>): void => {
    event?.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  // ── Auto-send initial prompt from "Discuss with CFO" bridge ──
  useEffect(() => {
    if (initialPrompt && !initialPromptSent.current && !isStreamingRef.current) {
      initialPromptSent.current = true;
      // Small delay to ensure component is mounted and ready
      const timer = setTimeout(() => {
        void sendMessage(initialPrompt);
        clearInitialPrompt?.();
        initialPromptSent.current = false;
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [initialPrompt, sendMessage, clearInitialPrompt]);

  // ── Auto-send Bill Negotiation prompt ──
  useEffect(() => {
    if (navState?.negotiateBill && !initialPromptSent.current && !isStreamingRef.current) {
      initialPromptSent.current = true;
      const { merchant, amount, tactic } = navState.negotiateBill;

      const timer = setTimeout(() => {
        void sendMessage(buildNegotiationPrompt({ merchant, amount }), {
          variant: "negotiation-script",
          merchant,
          amount,
          tactic,
        });
        clearNavState?.();
        initialPromptSent.current = false;
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [navState, sendMessage, clearNavState]);

  const [suggestions] = useState(() => getRandomSuggestions());
  const hasData = !!current?.parsed;
  const {
    compactEmbedded,
    denseEmbedded,
    ultraDenseEmbedded,
    suggestionCardMinHeight,
    suggestionGridGap,
    suggestionColumns,
    emptyTopPadding,
    orbSize,
    orbIconSize,
    titleSize,
    emptyCopySize,
    chipMarginBottom,
    promptClamp,
  } = getChatViewportDensity({ embedded, viewport });

  return (
    <div
      className="stagger-container"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        height: "100%", // This ensures the container takes the full height of the snap page
        width: "100%",
        flex: 1,
        minHeight: 0,
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      <div style={{ width: "100%", maxWidth: 768, display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <style>{`
            @keyframes chatBubbleIn { from { opacity: 0; transform: translateY(8px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
            @keyframes chatTypingPulse { 0%, 80%, 100% { transform: translateY(0); opacity: .3; } 40% { transform: translateY(-3px); opacity: 1; } }
            .chat-bubble-in { animation: chatBubbleIn .3s cubic-bezier(.16,1,.3,1) both; }
        `}</style>

      {/* ── HEADER ACTIONS ONLY ── */}
      <div style={{ position: "absolute", top: 12, left: 16, right: 16, zIndex: 10, display: "flex", justifyContent: "flex-start", alignItems: "center", pointerEvents: "none" }}>
        {messages.length > 0 && (
          <button type="button"
            onClick={clearChat}
            aria-label="Clear chat"
            style={{
              height: 34,
              padding: "0 14px",
              borderRadius: 17,
              border: `1px solid ${T.border.subtle}`,
              background: T.bg.elevated,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              cursor: "pointer",
              color: T.text.muted,
              transition: "transform .2s cubic-bezier(.16,1,.3,1), opacity .2s cubic-bezier(.16,1,.3,1), background-color .2s cubic-bezier(.16,1,.3,1), border-color .2s cubic-bezier(.16,1,.3,1), color .2s cubic-bezier(.16,1,.3,1), box-shadow .2s cubic-bezier(.16,1,.3,1)",
              pointerEvents: "auto",
            }}
            onMouseOver={e => {
              e.currentTarget.style.color = T.status.red;
              e.currentTarget.style.border = `1px solid ${T.status.red}40`;
              e.currentTarget.style.background = T.status.redDim;
            }}
            onMouseOut={e => {
              e.currentTarget.style.color = T.text.muted;
              e.currentTarget.style.border = `1px solid ${T.border.subtle}`;
              e.currentTarget.style.background = T.bg.glass;
            }}
          >
            <Trash2 size={14} strokeWidth={2.5} style={{ opacity: 0.8 }} />
            <span style={{ fontSize: 13, fontWeight: 700 }}>Clear Chat</span>
          </button>
        )}
      </div>

      {/* ── MESSAGES AREA ── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="scroll-area"
        style={{
          flex: 1,
          overflowY: messages.length === 0 ? "hidden" : "auto",
          padding:
            messages.length === 0
              ? compactEmbedded
                ? "4px 14px 18px"
                : "10px 14px 22px"
              : "16px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          // Let flexbox naturally push elements around instead of hardcoding justify-content inside a scrolling container
          touchAction: "pan-y pinch-zoom",
          overscrollBehavior: "contain none",
        }}
      >
        {messages.length === 0 ? (
          /* ── EMPTY STATE ── */
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-start",
              minHeight: "100%",
              width: "100%",
              maxWidth: compactEmbedded ? "100%" : 560,
              margin: "0 auto",
              padding: `${emptyTopPadding}px 14px 0`,
              textAlign: "center",
              animation: "fadeIn .5s ease",
            }}
          >
            <div
              style={{
                position: "relative",
                width: orbSize,
                height: orbSize,
                borderRadius: "50%",
                background: T.bg.card,
                border: `1px solid ${T.border.subtle}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: ultraDenseEmbedded ? 6 : denseEmbedded ? 8 : compactEmbedded ? 10 : 12,
                flexShrink: 0,
              }}
            >
              <Sparkles
                size={orbIconSize}
                color={T.accent.primary}
                strokeWidth={1.5}
                style={{ position: "relative" }}
              />
            </div>
            <h3
              style={{
                fontSize: titleSize,
                fontWeight: 850,
                color: T.text.primary,
                marginBottom: denseEmbedded ? 3 : 4,
                letterSpacing: "-0.04em",
              }}
            >
              Ask Anything
            </h3>
            <p
              style={{
                fontSize: emptyCopySize,
                color: T.text.secondary,
                lineHeight: 1.5,
                fontWeight: 500,
                maxWidth: ultraDenseEmbedded ? 236 : 300,
                marginBottom: chipMarginBottom + 2,
              }}
            >
              {hasData
                ? "Your latest financial briefing is loaded. Ask follow-up questions about your money."
                : "Run your first weekly briefing to unlock personalized insights."}
            </p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: chipMarginBottom + 4,
                padding: ultraDenseEmbedded ? "5px 12px" : "6px 14px",
                borderRadius: 99,
                background: `${T.status.green}10`,
                border: `1px solid ${T.status.green}20`,
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  color: T.status.green,
                  fontWeight: 800,
                  fontFamily: T.font.mono,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                Privacy-first
              </span>
            </div>

            {/* Elite Horizontally Scrolling Suggestion Chips */}
            <div
              style={{
                position: "relative",
                width: "100%",
                margin: compactEmbedded ? "0 -8px" : "0 -10px",
                padding: compactEmbedded ? "0 8px" : "0 10px",
              }}
            >
              <div
                className="scroll-area hide-scrollbar"
                style={{
                  display: "grid",
                  gridTemplateColumns: suggestionColumns === 1 ? "1fr" : "1fr 1fr",
                  gap: suggestionGridGap,
                  width: "100%",
                  paddingBottom: ultraDenseEmbedded ? 0 : denseEmbedded ? 2 : 4,
                }}
              >
                {suggestions.map((s, i) => (
                <button type="button"
                  key={i}
                  className="card-press"
                  onClick={() => sendMessage(s.text)}
                  disabled={isStreaming || (isGatingEnforced() && !chatQuota.allowed)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: denseEmbedded ? 6 : 8,
                    padding: ultraDenseEmbedded ? "10px" : denseEmbedded ? "11px" : compactEmbedded ? "13px" : "16px",
                    borderRadius: 16,
                    border: `1px solid ${T.border.subtle}`,
                    background: T.bg.card,
                    color: T.text.primary,
                    fontSize: denseEmbedded ? 12 : 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "center",
                    lineHeight: 1.3,
                    width: "100%",
                    minHeight: suggestionCardMinHeight,
                    transition: "transform .3s cubic-bezier(.16,1,.3,1), opacity .3s cubic-bezier(.16,1,.3,1), background-color .3s cubic-bezier(.16,1,.3,1), border-color .3s cubic-bezier(.16,1,.3,1), color .3s cubic-bezier(.16,1,.3,1), box-shadow .3s cubic-bezier(.16,1,.3,1)",
                    animation: `chatBubbleIn .5s cubic-bezier(.16,1,.3,1) ${i * 0.08}s both`,
                  }}
                >
                  <UiGlyph
                    glyph={s.emoji}
                    size={denseEmbedded ? 16 : 18}
                    color={T.accent.primary}
                    style={{ flexShrink: 0 }}
                  />
                  <span
                    style={{
                      display: "block",
                      overflow: "visible",
                      lineHeight: 1.35,
                      minHeight: promptClamp > 0 ? `${promptClamp * 1.35}em` : undefined,
                      whiteSpace: "normal",
                      wordBreak: "break-word",
                      textWrap: "pretty",
                      textAlign: "center",
                      width: "100%",
                    }}
                  >
                    {s.text}
                  </span>
                </button>
              ))}
              </div>
              

            </div>
            {/* Removed the small informational text for a cleaner empty state (less clutter is better) */}
          </div>
        ) : (
          /* ── MESSAGE BUBBLES ── */
          <>
            {messages.map((msg, i) => {
              const isUser = msg.role === "user";
              const isLatestAssistant = !isUser && i === messages.length - 1 && isStreaming;
              const feedbackMessageId = !isUser && typeof msg.ts === "number" ? String(msg.ts) : null;
              const feedback = feedbackMessageId ? messageFeedback[feedbackMessageId] : null;
              // Detect if previous or next message is from the same sender to adjust corner radiuses beautifully
              const prevIsSame = messages[i - 1]?.role === msg.role;
              const nextIsSame = messages[i + 1]?.role === msg.role;

              // Apple-style bubble radius logic:
              // For user (right): if next is same, right-bottom corner stays sharp. if prev is same, right-top stays sharp.
              // For assistant (left): inverse logic on the left side.
              const RADIUS = 22; // Elite large radius
              const SHARP = 4;   // Small notch

              const borderRadius = isUser
                ? `${RADIUS}px ${prevIsSame ? SHARP : RADIUS}px ${nextIsSame ? SHARP : RADIUS}px ${RADIUS}px`
                : `${prevIsSame ? SHARP : RADIUS}px ${RADIUS}px ${RADIUS}px ${nextIsSame ? SHARP : RADIUS}px`;

              return (
                <div
                  key={i}
                  className="chat-bubble-in"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: isUser ? "flex-end" : "flex-start",
                    animationDelay: `${Math.min(i * 0.03, 0.3)}s`,
                    marginBottom: nextIsSame ? 2 : 12,
                  }}
                >
                  <div
                    style={{
                      maxWidth: isUser ? "72%" : "79%",
                      minWidth: isUser ? "unset" : 0,
                      padding: isUser ? "10px 15px" : "12px 16px",
                      borderRadius: borderRadius,
                      background: isUser ? T.accent.gradient : T.bg.elevated,
                      border: isUser ? "none" : `1px solid ${T.border.subtle}`,
                      color: isUser ? "#fff" : T.text.primary,
                      fontSize: 13.5,
                      lineHeight: 1.5,
                      boxShadow: isUser ? `0 8px 24px rgba(123,94,167,0.3)` : T.shadow.card,
                      position: "relative",
                      wordBreak: "break-word",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {isUser ? (
                      <p style={{ margin: 0, fontWeight: 500 }}>{msg.content}</p>
                    ) : (
                      <div className="ask-ai-markdown">
                        <ChatMarkdown text={msg.content} isStreaming={isLatestAssistant} />
                      </div>
                    )}
                    {isLatestAssistant && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: msg.content ? 12 : 4 }}>
                        <Skeleton height={14} width="90%" />
                        <Skeleton height={14} width="60%" />
                        <Skeleton height={14} width="75%" />
                      </div>
                    )}
                  </div>
                  {!isUser && !isLatestAssistant && feedbackMessageId && (
                    <div
                      style={{
                        marginTop: 8,
                        marginLeft: 6,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: 8,
                        maxWidth: "88%",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => recordMessageFeedback(feedbackMessageId, "helpful")}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "6px 10px",
                            borderRadius: 999,
                            border:
                              feedback?.verdict === "helpful"
                                ? `1px solid ${T.status.green}40`
                                : `1px solid ${T.border.subtle}`,
                            background:
                              feedback?.verdict === "helpful" ? `${T.status.green}14` : T.bg.surface,
                            color: feedback?.verdict === "helpful" ? T.status.green : T.text.secondary,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          <CheckCircle2 size={12} />
                          Helpful
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            recordMessageFeedback(
                              feedbackMessageId,
                              "needs-work",
                              feedback?.verdict === "needs-work" ? feedback.reasons : []
                            )
                          }
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "6px 10px",
                            borderRadius: 999,
                            border:
                              feedback?.verdict === "needs-work"
                                ? `1px solid ${T.status.amber}40`
                                : `1px solid ${T.border.subtle}`,
                            background:
                              feedback?.verdict === "needs-work" ? `${T.status.amber}14` : T.bg.surface,
                            color: feedback?.verdict === "needs-work" ? T.status.amber : T.text.secondary,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          <MessageCircle size={12} />
                          Needs work
                        </button>
                      </div>
                      {feedback?.verdict === "needs-work" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: T.text.dim,
                              textTransform: "uppercase",
                              letterSpacing: "0.08em",
                            }}
                          >
                            What missed?
                          </span>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            {CHAT_FEEDBACK_REASON_OPTIONS.map((option) => {
                              const selected = feedback.reasons.includes(option.value);
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => toggleMessageFeedbackReason(feedbackMessageId, option.value)}
                                  style={{
                                    padding: "5px 9px",
                                    borderRadius: 999,
                                    border: selected
                                      ? `1px solid ${T.status.amber}50`
                                      : `1px solid ${T.border.subtle}`,
                                    background: selected ? `${T.status.amber}14` : T.bg.surface,
                                    color: selected ? T.status.amber : T.text.secondary,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {feedback?.verdict === "needs-work" && (
                        <button
                          type="button"
                          onClick={() => requestFeedbackRevision(i, feedback.reasons)}
                          disabled={isStreaming}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "6px 11px",
                            borderRadius: 999,
                            border: `1px solid ${T.accent.primary}35`,
                            background: `${T.accent.primary}12`,
                            color: T.accent.primary,
                            fontSize: 11,
                            fontWeight: 800,
                            cursor: isStreaming ? "not-allowed" : "pointer",
                            opacity: isStreaming ? 0.55 : 1,
                          }}
                        >
                          <ArrowUpRight size={12} />
                          Improve answer
                        </button>
                      )}
                      {feedback && (
                        <span style={{ fontSize: 10, color: T.text.dim, fontWeight: 600 }}>
                          {feedback.verdict === "helpful"
                            ? "Catalyst will lean toward this style in future replies on this device."
                            : "Catalyst will use this feedback to tighten future replies on this device."}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {isStreaming && !liveAssistantPreview && (
              <div
                className="chat-bubble-in"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    maxWidth: "79%",
                    minWidth: 168,
                    padding: "12px 15px",
                    borderRadius: "22px 22px 22px 6px",
                    background: T.bg.elevated,
                    border: `1px solid ${T.border.subtle}`,
                    color: T.text.primary,
                    boxShadow: T.shadow.card,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        background: T.accent.gradient,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: `0 6px 16px ${T.accent.primary}30`,
                        flexShrink: 0,
                      }}
                    >
                      <Sparkles size={13} color="#fff" strokeWidth={2.3} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: T.text.primary }}>
                        {assistantPhase === "replying" ? "Catalyst is replying" : "Catalyst is thinking"}
                      </div>
                      <div style={{ fontSize: 10.5, color: T.text.secondary, marginTop: 2, lineHeight: 1.35 }}>
                        {assistantPhase === "replying"
                          ? "Finishing the answer from your live financial context."
                          : "Reviewing your latest financial context before replying."}
                      </div>
                    </div>
                  </div>
                  <TypingDots />
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} style={{ height: 1, flexShrink: 0 }} />
      </div>

      {/* ── Scroll-down FAB ── */}
      {showScrollDown && (
        <button type="button"
          onClick={() => scrollToBottom()}
          style={{
            position: "absolute",
            bottom: 72,
            right: 16,
            zIndex: 10,
            width: 36,
            height: 36,
            borderRadius: 18,
            background: T.bg.glass,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: `1px solid ${T.border.default}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            boxShadow: T.shadow.elevated,
            animation: "chatBubbleIn .2s ease both",
            color: T.text.primary,
          }}
        >
          <ArrowDown size={16} strokeWidth={2.5} />
        </button>
      )}

      {/* ── INPUT BAR ── */}
      <div
        style={{
          padding: "8px 12px",
          paddingBottom: 12,
          borderTop: `1px solid ${T.border.subtle}`,
          background: T.bg.glass,
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          flexShrink: 0,
        }}
      >
        {error && !isStreaming && (
          <div
            style={{
              marginBottom: 10,
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              padding: "10px 12px",
              borderRadius: T.radius.lg,
              background: isLikelyNetworkError(error) ? `${T.status.amber}12` : T.status.redDim,
              border: `1px solid ${isLikelyNetworkError(error) ? `${T.status.amber}35` : `${T.status.red}25`}`,
            }}
          >
            <AlertTriangle
              size={14}
              color={isLikelyNetworkError(error) ? T.status.amber : T.status.red}
              style={{ flexShrink: 0, marginTop: 1 }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: T.text.primary, marginBottom: 3 }}>
                {isLikelyNetworkError(error) ? "Ask AI unavailable" : "Ask AI error"}
              </div>
              <div style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.5 }}>{error}</div>
            </div>
          </div>
        )}
        {!online && !error && (
          <div
            style={{
              marginBottom: 10,
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              padding: "10px 12px",
              borderRadius: T.radius.lg,
              background: `${T.status.amber}12`,
              border: `1px solid ${T.status.amber}30`,
            }}
          >
            <AlertTriangle
              size={14}
              color={T.status.amber}
              style={{ flexShrink: 0, marginTop: 1 }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: T.text.primary, marginBottom: 3 }}>
                Ask AI offline
              </div>
              <div style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.5 }}>
                Existing chats still open locally, but new questions need an internet connection.
              </div>
            </div>
          </div>
        )}
        {showChatQuotaStatus && (
          <div
            style={{
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "9px 12px",
              borderRadius: 14,
              background: `${chatQuotaTone}10`,
              border: `1px solid ${chatQuotaTone}24`,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: chatQuotaTone, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                Ask AI capacity
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text.primary, marginTop: 2 }}>
                {chatQuotaStatusCopy}
              </div>
            </div>
            <div style={{ minWidth: 82, textAlign: "right" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.text.secondary }}>
                {chatQuotaModelLabel}
              </div>
              <div style={{ marginTop: 6, width: 82, height: 5, background: T.border.subtle, borderRadius: 999, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${Math.max(0, Math.min(100, (chatQuota.remaining / Math.max(chatQuota.limit, 1)) * 100))}%`,
                    background: chatQuotaTone,
                    borderRadius: 999,
                    transition: "width 0.5s var(--spring-elastic), background 0.3s ease",
                  }}
                />
              </div>
            </div>
          </div>
        )}
        <form
          onSubmit={handleSubmit}
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 8,
          }}
        >
          <div
            style={{
              flex: 1,
              position: "relative",
              background: T.bg.elevated,
              borderRadius: 24, // Fully rounded pill shape
              border: `1.5px solid ${inputFocused ? T.border.focus : T.border.default}`,
              transition: "border-color .18s ease, box-shadow .18s ease",
              boxShadow: inputFocused ? `0 0 0 2px ${T.accent.primary}14, 0 10px 20px rgba(0,0,0,0.08)` : T.shadow.elevated,
              display: "flex",
              alignItems: "center",
              padding: "4px 4px 4px 16px", // Asymmetric padding to wrap around the perfect circle submit button
            }}
          >
            <textarea
              data-unstyled="true"
              ref={inputRef}
              value={input}
              onChange={e => {
                setInput(e.target.value);
                // Auto-resize
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder={
                isStreaming
                  ? assistantPhase === "replying"
                    ? "Catalyst is replying..."
                    : "Catalyst is thinking..."
                  : online
                    ? "Ask about your finances..."
                    : "Reconnect to ask AI..."
              }
              disabled={isStreaming}
              rows={1}
              style={{
                flex: 1,
                padding: "8px 8px 8px 0",
                background: "transparent",
                border: "none",
                outline: "none",
                color: T.text.primary,
                fontSize: 14,
                lineHeight: 1.4,
                fontFamily: T.font.sans,
                resize: "none",
                maxHeight: 120,
                minHeight: 20,
                WebkitUserSelect: "text",
                userSelect: "text",
                boxShadow: "none",
              }}
            />

            {isStreaming ? (
              <button
                type="button"
                onClick={cancelStream}
                aria-label="Stop generating response"
                title="Stop generating response"
                onMouseOver={e => e.currentTarget.style.transform = "scale(0.95)"}
                onMouseOut={e => e.currentTarget.style.transform = "scale(1)"}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  flexShrink: 0,
                  border: `1px solid ${T.status.red}40`,
                  background: T.status.redDim,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  transition: "transform .3s var(--spring-elastic), opacity .3s var(--spring-elastic), background-color .3s var(--spring-elastic), border-color .3s var(--spring-elastic), color .3s var(--spring-elastic), box-shadow .3s var(--spring-elastic)",
                }}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: T.status.red,
                  }}
                />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() || !online}
                aria-label="Send message"
                title="Send message"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  flexShrink: 0,
                  border: `1px solid ${input.trim() && online ? `${T.accent.primary}24` : T.border.subtle}`,
                  background: input.trim() && online ? `${T.accent.primary}14` : T.bg.card,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: input.trim() && online ? "pointer" : "default",
                  transition: "transform .4s var(--spring-elastic), opacity .4s var(--spring-elastic), background-color .4s var(--spring-elastic), border-color .4s var(--spring-elastic), color .4s var(--spring-elastic), box-shadow .4s var(--spring-elastic)",
                  transform: input.trim() && online ? "scale(1)" : "scale(0.9)",
                  opacity: input.trim() && online ? 1 : 0.5,
                }}
              >
                <ArrowUpRight
                  size={20}
                  strokeWidth={2.5}
                  color={input.trim() && online ? T.accent.primary : T.text.muted}
                />
              </button>
            )}
          </div>
        </form>

        {/* Privacy & Provider info */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: 8,
            fontSize: 10,
            color: T.text.dim,
            fontFamily: T.font.mono,
          }}
        >
          {privacyMode ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, opacity: 0.8 }}>
              <UiGlyph glyph="🔒" size={12} color={T.text.dim} />
              Privacy mode · chats are not stored
            </span>
          ) : chatQuota.limit !== Infinity ? (
            <span style={{ opacity: 0.8 }}>
              {chatQuota.modelId === "gpt-4.1"
                ? "Catalyst AI CFO"
                : chatQuota.modelId === "gemini-2.5-flash"
                  ? "Catalyst AI Flash"
                  : "Catalyst AI"}{" "}
              · daily quota active
            </span>
          ) : (
            <span style={{ opacity: 0.8 }}>Encrypted local chat history auto-expires after 24 hours</span>
          )}
        </div>

        {/* Free tier: upsell when quota is running low */}
        {shouldShowGating() && chatQuota.remaining <= 3 && chatQuota.remaining > 0 && !proEnabled && (
          <div style={{ marginTop: 8 }}>
            <ProBannerTyped
              onUpgrade={() => setShowPaywall(true)}
              label="Upgrade to Pro"
              sublabel={`Only ${chatQuota.remaining} chats left today — Pro gives you 30/day`}
            />
          </div>
        )}

        {/* Pro: per-model cap exhausted — offer switch to alternate model */}
        {proEnabled && chatQuota.remaining === 0 && chatQuota.alternateModel && (chatQuota.alternateRemaining ?? 0) > 0 && (
          <div style={{
            marginTop: 8,
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
                {chatQuota.modelId === "gpt-4.1" ? "Catalyst AI CFO" : "Catalyst AI"} daily limit reached
              </div>
              <div style={{ fontSize: 12, color: T.text.secondary }}>
                Switch to {chatQuota.alternateModel === "gpt-4.1" ? "Catalyst AI CFO" : "Catalyst AI"} — {chatQuota.alternateRemaining} chats remaining
              </div>
            </div>
            <button type="button"
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
                (setAiModel as (m: string) => void)(chatQuota.alternateModel ?? "");
                haptic.light();
              }}
            >
              Switch
            </button>
          </div>
        )}


        {showPaywall && (
          <Suspense fallback={null}>
            <LazyProPaywallTyped onClose={() => setShowPaywall(false)} source="askai" />
          </Suspense>
        )}
      </div>
      </div>
    </div>
  );
});
