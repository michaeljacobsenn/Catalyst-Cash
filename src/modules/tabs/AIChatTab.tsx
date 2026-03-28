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
import { streamAudit } from "../api.js";
import {
  analyzeChatInputRisk,
  buildDeterministicChatFallback,
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
import { extractMemoryTags } from "../memory.js";
import { isLikelyNetworkError, toUserFacingRequestError } from "../networkErrors.js";
import { buildScrubber } from "../scrubber.js";
import { checkChatQuota, isGatingEnforced, recordChatUsage, shouldShowGating } from "../subscription.js";
import { useToast } from "../Toast.js";
import { Skeleton as UISkeleton } from "../ui.js";
import { db } from "../utils.js";
import ProBanner from "./ProBanner.js";
import { CHAT_STORAGE_KEY, ChatMarkdown, createChatMessage, getRandomSuggestions, stripThoughtProcess } from "./aiChat/helpers";
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

type ChatFeedbackVerdict = "helpful" | "needs-work";
type ChatFeedbackReason = "too_generic" | "wrong_math" | "too_long" | "missed_context";

interface ChatMessageFeedback {
  verdict: ChatFeedbackVerdict;
  reasons: ChatFeedbackReason[];
  updatedAt: number;
}

type ChatFeedbackStore = Record<string, ChatMessageFeedback>;

const CHAT_FEEDBACK_KEY = "ai-chat-feedback";
const CHAT_FEEDBACK_REASON_OPTIONS: Array<{ value: ChatFeedbackReason; label: string }> = [
  { value: "too_generic", label: "Too generic" },
  { value: "wrong_math", label: "Wrong math" },
  { value: "too_long", label: "Too long" },
  { value: "missed_context", label: "Missed context" },
];

const ProBannerTyped = ProBanner as unknown as (props: ProBannerProps) => ReactNode;
const LazyProPaywallTyped = LazyProPaywall as unknown as (props: ProPaywallProps) => ReactNode;
const Skeleton = UISkeleton as unknown as (props: SkeletonProps) => ReactNode;
const analyzeChatInputRiskTyped = analyzeChatInputRisk as unknown as (text: string) => ChatInputRisk;
const buildPromptInjectionRefusalTyped = buildPromptInjectionRefusal as unknown as () => string;
const buildDeterministicChatFallbackTyped = buildDeterministicChatFallback as unknown as (options: {
  current?: AuditRecord | null;
  computedStrategy?: Record<string, unknown> | null;
  decisionRecommendations?: DecisionRecommendation[];
  error?: string;
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

// ── Typing indicator (accessible) ──

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
  const { apiKey, aiProvider, aiModel, financialConfig, persona, personalRules, setAiModel } = useSettings();
  const { cards, renewals, bankAccounts } = usePortfolio();
  const { privacyMode } = useSecurity() as SecurityApi;
  const { navState, clearNavState, registerChatStreamAbort } = useNavigation() as NavigationApi;
  const toast = useToast() as { error?: (message: string) => void } | undefined;

  const [input, setInput] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showScrollDown, setShowScrollDown] = useState<boolean>(false);
  const [chatQuota, setChatQuota] = useState<ChatQuotaState>({ allowed: true, remaining: Infinity, limit: Infinity, used: 0 });
  const [inputFocused, setInputFocused] = useState<boolean>(false);
  const [showPaywall, setShowPaywall] = useState<boolean>(false);
  const [messageFeedback, setMessageFeedback] = useState<ChatFeedbackStore>({});
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === "undefined" ? 390 : window.innerWidth,
    height: typeof window === "undefined" ? 844 : window.innerHeight,
  }));

  const suggestionsScrollRef = useRef<HTMLDivElement | null>(null);
  const [, setCanScrollRight] = useState<boolean>(true);
  const [, setCanScrollLeft] = useState<boolean>(false);


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

  useEffect(() => {
    if (suggestionsScrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = suggestionsScrollRef.current;
      setCanScrollLeft(scrollLeft > 10); // Initialize left scroll state
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10); // Initialize right scroll state
    }
  }, []);

  // Compute the effective model once for use throughout this render scope
  const effectiveChatModel = useMemo<string>(
    () => (aiModel === "gpt-4.1" || aiModel === "o3") ? "gpt-4.1" : aiModel,
    [aiModel]
  );

  // Fetch quota on load and whenever the effective model changes
  useEffect(() => {
    checkChatQuota(effectiveChatModel).then(setChatQuota);
  }, [effectiveChatModel]);

  useEffect(() => {
    let active = true;
    db.get(CHAT_FEEDBACK_KEY)
      .then((stored) => {
        if (active && stored && typeof stored === "object") {
          setMessageFeedback(stored as ChatFeedbackStore);
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
    memoryData,
    persistMessages,
    buildAPIMessages,
    rememberFacts,
    getMemoryBlock,
  } = useAIChatPersistence({
    privacyMode,
    aiProvider,
    aiModel,
  });

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

  // ── Refresh chat quota on mount and after each message ──
  useEffect(() => {
    const refreshQuota = async () => {
      const q = await checkChatQuota(effectiveChatModel);
      setChatQuota(q);
    };
    refreshQuota();
  }, [messages.length, effectiveChatModel]);

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
    async (text: string, extraPromptContext: Record<string, unknown> | null = null): Promise<void> => {
      const trimmedText = text?.trim();
      if (!trimmedText || isStreamingRef.current) return;

      // ── Quota gate — check BEFORE adding message to state ──
      if (isGatingEnforced() && !chatQuota.allowed) {
        setError("Daily message limit reached. Upgrade to Catalyst Cash Pro for 30 messages/day.");
        haptic.medium();
        return;
      }

      const userMsg = createChatMessage("user", trimmedText);
      // Guard: if the last message is already this user message (e.g. after a retry),
      // don't duplicate it — just resume from the existing state.
      const lastMsg = messages[messages.length - 1];
      const alreadyPresent = lastMsg?.role === "user" && lastMsg?.content === userMsg.content;
      const newMsgs = alreadyPresent ? [...messages] : [...messages, userMsg];
      lastUserMsgRef.current = trimmedText; // Track for safe retry

      const decisionRecommendations = evaluateChatDecisionRules({
        current,
        financialConfig,
        cards,
        bankAccounts,
        renewals,
        computedStrategy: chatStrategy,
      }) as DecisionRecommendation[];
      const inputRisk = analyzeChatInputRiskTyped(trimmedText);

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

      setIsStreaming(true);
      isStreamingRef.current = true;
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

      const abort = new AbortController();
      abortRef.current = abort;

      let accumulated = "";
      const assistantMsg: ChatHistoryMessage = { role: "assistant", content: "", ts: Date.now() };

      try {
        log.info("chat", "Chat message sent", { provider: aiProvider, model: aiModel });

        // effectiveChatModel is computed at the top of the component
        const stream = streamAuditTyped(
          apiKey,
          transport.snapshot,
          aiProvider,
          effectiveChatModel,
          transport.promptContext,
          transport.apiHistory,
          undefined, // deviceId — handled by backend
          abort.signal,
          true // isChat — tells the backend to return natural language, not JSON
        );

        for await (const chunk of stream) {
          if (abort.signal.aborted) break;
          accumulated += chunk;
          assistantMsg.content = stripThoughtProcess(scrubber.unscrub(accumulated));
          assistantMsg.ts = Date.now();
          setMessages([...newMsgs, { ...assistantMsg }]);
        }

        // Finalize
        if (accumulated.trim()) {
          // Extract REMEMBER tags and strip thought_process blocks before persisting/displaying
          const restored = scrubber.unscrub(accumulated);
          const { cleanText, newFacts } = extractMemoryTags(restored);
          const displayText = stripThoughtProcess(cleanText || restored);
          const normalizedResponse = normalizeChatAssistantOutputTyped(displayText);
          const finalText = normalizedResponse.valid
            ? normalizedResponse.text
            : buildDeterministicChatFallbackTyped({
                current,
                computedStrategy: chatStrategy,
                decisionRecommendations,
                error: "empty-or-malformed-chat-output",
              });
          const finalMsgs = [...newMsgs, { ...assistantMsg, content: finalText }];
          setMessages(finalMsgs);
          void persistMessages(finalMsgs);
          // Persist any new facts the AI learned
          if (normalizedResponse.valid && newFacts.length > 0) {
            void rememberFacts(newFacts);
          }
          if (normalizedResponse.valid) {
            // Record usage after successful response (pass model for per-model pro tracking)
            recordChatUsage(effectiveChatModel).catch(() => { });
            const q = await checkChatQuota(effectiveChatModel);
            setChatQuota(q);
          } else {
            setError("AI response was incomplete. Showing native fallback guidance instead.");
          }
        } else {
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
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          // User cancelled — keep partial response
          if (accumulated.trim()) {
            const restored = scrubber.unscrub(accumulated);
            const finalMsgs = [...newMsgs, { ...assistantMsg, content: restored + "\n\n*[Response cancelled]*" }];
            setMessages(finalMsgs);
            void persistMessages(finalMsgs);
          }
        } else {
          // ── Per-model cap auto-switch (Pro only) ──
          const modelCap = (err as Record<string, unknown>)?.modelCapReached;
          if (modelCap && typeof modelCap === "string") {
            // Priority order: gemini (cheapest/most quota) → gpt-4.1
            const MODEL_FALLBACK_ORDER = ["gemini-2.5-flash", "gpt-4.1"];
            const nextModel = MODEL_FALLBACK_ORDER.find(m => m !== modelCap);
            if (nextModel) {
              (setAiModel as (m: string) => void)(nextModel);
              const modelNames: Record<string, string> = {
                "gemini-2.5-flash": "Catalyst AI",
                "gpt-4.1": "Catalyst AI CFO",
              };
              setError(`Daily ${modelNames[modelCap] || modelCap} limit reached. Switched to ${modelNames[nextModel] || nextModel} — send your message again.`);
              toast?.error?.(`Switched to ${modelNames[nextModel] || nextModel}`);
              // Remove the failed assistant message so user can retry cleanly
              setMessages(newMsgs);
              return;
            }
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
          toast?.error?.(failure.userMessage);
          setMessages(finalMsgs);
          void persistMessages(finalMsgs);
        }
      } finally {
        setIsStreaming(false);
        isStreamingRef.current = false;
        abortRef.current = null;
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
      memoryData,
      apiKey,
      aiProvider,
      aiModel,
      buildAPIMessages,
      getMemoryBlock,
      persistMessages,
      chatQuota,
      rememberFacts,
      toast,
      setAiModel,
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
        const next: ChatFeedbackStore = {
          ...prev,
          [messageId]: {
            verdict,
            reasons,
            updatedAt: Date.now(),
          },
        };
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
      const existing = prev[messageId];
      if (!existing || existing.verdict !== "needs-work") return prev;
      const reasons = existing.reasons.includes(reason)
        ? existing.reasons.filter((item) => item !== reason)
        : [...existing.reasons, reason];
      const next: ChatFeedbackStore = {
        ...prev,
        [messageId]: {
          ...existing,
          reasons,
          updatedAt: Date.now(),
        },
      };
      void db.set(CHAT_FEEDBACK_KEY, next);
      log.info("chat", "Chat response feedback updated", { verdict: "needs-work", reasons, messageId });
      return next;
    });
    haptic.selection();
  }, []);

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
      
      const userMessage = `Draft a negotiation script to lower my $${amount} monthly bill with ${merchant}.`;
      
      const timer = setTimeout(() => {
        void sendMessage(userMessage, {
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
  const compactEmbedded = embedded && viewport.height <= 860;
  const denseEmbedded = embedded && viewport.height <= 780;
  const ultraDenseEmbedded = embedded && viewport.height <= 700;
  const suggestionCardMinHeight = ultraDenseEmbedded ? 72 : denseEmbedded ? 78 : compactEmbedded ? 86 : 100;
  const suggestionGridGap = ultraDenseEmbedded ? 5 : denseEmbedded ? 6 : 8;
  const emptyTopPadding = ultraDenseEmbedded ? 8 : denseEmbedded ? 18 : compactEmbedded ? 30 : 56;
  const orbSize = ultraDenseEmbedded ? 42 : denseEmbedded ? 48 : compactEmbedded ? 54 : 64;
  const orbIconSize = ultraDenseEmbedded ? 18 : denseEmbedded ? 20 : compactEmbedded ? 22 : 26;
  const titleSize = ultraDenseEmbedded ? 18 : denseEmbedded ? 20 : compactEmbedded ? 21 : 24;
  const emptyCopySize = ultraDenseEmbedded ? 11 : 12;
  const chipMarginBottom = ultraDenseEmbedded ? 4 : denseEmbedded ? 6 : 10;
  const promptClamp = ultraDenseEmbedded ? 2 : denseEmbedded ? 2 : 3;

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
            .chat-bubble-in { animation: chatBubbleIn .3s cubic-bezier(.16,1,.3,1) both; }
        `}</style>

      {/* ── HEADER ACTIONS ONLY ── */}
      <div style={{ position: "absolute", top: 12, left: 16, right: 16, zIndex: 10, display: "flex", justifyContent: "flex-start", alignItems: "center", pointerEvents: "none" }}>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            aria-label="Clear chat"
            style={{
              height: 34,
              padding: "0 14px",
              borderRadius: 17,
              border: `1px solid ${T.border.subtle}`,
              background: T.bg.glass,
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              cursor: "pointer",
              color: T.text.muted,
              transition: "all .2s cubic-bezier(.16,1,.3,1)",
              boxShadow: T.shadow.subtle,
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
          padding: messages.length === 0 && compactEmbedded ? "10px 14px 12px" : "16px 14px",
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
              padding: `${emptyTopPadding}px 10px 14px`,
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
                background: `linear-gradient(135deg, ${T.accent.primaryDim}, ${T.bg.card})`,
                border: `1px solid ${T.accent.primarySoft}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: ultraDenseEmbedded ? 8 : denseEmbedded ? 10 : 14,
                flexShrink: 0,
                boxShadow: `0 8px 32px ${T.accent.primary}25`,
              }}
            >
              {/* Breathing orb effect */}
              <div
                style={{
                  position: "absolute",
                  inset: -12,
                  background: T.accent.primary,
                  filter: "blur(24px)",
                  opacity: 0.15,
                  borderRadius: "50%",
                  pointerEvents: "none",
                  animation: "glowPulse 4s ease-in-out infinite",
                }}
              />
              <Sparkles
                size={orbIconSize}
                color={T.accent.primary}
                strokeWidth={1.5}
                style={{ filter: `drop-shadow(0 2px 10px ${T.accent.primaryGlow})`, position: "relative" }}
              />
            </div>
            <h3
              style={{
                fontSize: titleSize,
                fontWeight: 900,
                background: `linear-gradient(135deg, ${T.text.primary}, ${T.accent.primaryHover})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                marginBottom: denseEmbedded ? 4 : 6,
                letterSpacing: "-0.02em",
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
                maxWidth: ultraDenseEmbedded ? 220 : 240,
                marginBottom: chipMarginBottom,
              }}
            >
              {hasData
                ? "Your financial data is loaded. Ask me anything about your money."
                : "Run your first audit to unlock personalized insights."}
            </p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: chipMarginBottom,
                padding: ultraDenseEmbedded ? "5px 12px" : "6px 14px",
                borderRadius: 99,
                background: `${T.status.green}10`,
                border: `1px solid ${T.status.green}20`,
                boxShadow: `0 2px 10px ${T.status.green}08`,
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
            <div style={{ position: "relative", width: "100%", margin: compactEmbedded ? "0 -8px" : "0 -16px", padding: compactEmbedded ? "0 8px" : "0 16px" }}>
              <div
                className="scroll-area hide-scrollbar"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: suggestionGridGap,
                  width: "100%",
                  paddingBottom: ultraDenseEmbedded ? 4 : denseEmbedded ? 6 : 10,
                }}
              >
                {suggestions.map((s, i) => (
                <button
                  key={i}
                  className="card-press"
                  onClick={() => sendMessage(s.text)}
                  disabled={isStreaming || (isGatingEnforced() && !chatQuota.allowed)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    justifyContent: "center",
                    gap: denseEmbedded ? 6 : 8,
                    padding: ultraDenseEmbedded ? "10px" : denseEmbedded ? "11px" : compactEmbedded ? "13px" : "16px",
                    borderRadius: 16,
                    border: `1px solid ${T.border.subtle}`,
                    background: T.bg.glass,
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    color: T.text.primary,
                    fontSize: denseEmbedded ? 12 : 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "left",
                    lineHeight: 1.3,
                    width: "100%",
                    minHeight: suggestionCardMinHeight,
                    boxShadow: T.shadow.subtle,
                    transition: "all .3s cubic-bezier(.16,1,.3,1)",
                    animation: `chatBubbleIn .5s cubic-bezier(.16,1,.3,1) ${i * 0.08}s both`,
                  }}
                >
                  <span style={{ fontSize: denseEmbedded ? 16 : 18, flexShrink: 0, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}>
                    {s.emoji}
                  </span>
                  <span style={{ display: "-webkit-box", WebkitLineClamp: promptClamp, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
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
                      maxWidth: isUser ? "80%" : "88%", // More balanced constraints for both sides
                      minWidth: isUser ? "unset" : "60%", // Ensure AI messages don't get too squished
                      padding: isUser ? "12px 18px" : "14px 18px", // Tighter padding for markdown 
                      borderRadius: borderRadius,
                      background: isUser ? T.accent.gradient : T.bg.elevated,
                      border: isUser ? "none" : `1px solid ${T.border.subtle}`,
                      color: isUser ? "#fff" : T.text.primary,
                      fontSize: 14,
                      lineHeight: 1.55,
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
                      {feedback && (
                        <span style={{ fontSize: 10, color: T.text.dim, fontWeight: 600 }}>
                          Feedback saved on this device.
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Error display */}
            {error && !isStreaming && (
              <div
                className="chat-bubble-in"
                style={{
                  display: "flex",
                  justifyContent: "flex-start",
                  marginTop: 4,
                }}
              >
                <div
                  style={{
                    maxWidth: "90%",
                    padding: "10px 14px",
                    borderRadius: T.radius.lg,
                    background: T.status.redDim,
                    border: `1px solid ${T.status.red}25`,
                    fontSize: 12,
                    color: T.status.red,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <AlertTriangle size={13} strokeWidth={2.5} />
                    <strong>Error</strong>
                  </div>
                  <p style={{ margin: 0, color: T.text.secondary, lineHeight: 1.5 }}>{error}</p>
                  <button
                    onClick={() => {
                      setError(null);
                      // Retry the last USER message, not the last message (which may be assistant/error)
                      const retryText =
                        lastUserMsgRef.current || messages.filter(m => m.role === "user").pop()?.content;
                      if (retryText) sendMessage(retryText);
                    }}
                    style={{
                      marginTop: 8,
                      padding: "6px 14px",
                      borderRadius: T.radius.sm,
                      border: `1px solid ${T.status.red}40`,
                      background: "transparent",
                      color: T.status.red,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} style={{ height: 1, flexShrink: 0 }} />
      </div>

      {/* ── Scroll-down FAB ── */}
      {showScrollDown && (
        <button
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
              transition: "border-color .3s ease, box-shadow .3s var(--spring-elastic)",
              boxShadow: inputFocused ? `0 0 0 3px ${T.accent.primary}15, inset 0 2px 4px rgba(0,0,0,0.3)` : T.shadow.elevated,
              display: "flex",
              alignItems: "center",
              padding: "4px 4px 4px 16px", // Asymmetric padding to wrap around the perfect circle submit button
            }}
          >
            <textarea
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
              placeholder={isStreaming ? "Waiting for response..." : "Ask about your finances..."}
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
              }}
            />

            {isStreaming ? (
              <button
                type="button"
                onClick={cancelStream}
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
                  transition: "all .3s var(--spring-elastic)",
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
                disabled={!input.trim()}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  flexShrink: 0,
                  border: "none",
                  background: input.trim() ? T.accent.gradient : T.bg.card,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: input.trim() ? "pointer" : "default",
                  boxShadow: input.trim() ? `0 4px 16px rgba(123,94,167,0.35)` : "none",
                  transition: "all .4s var(--spring-elastic)",
                  transform: input.trim() ? "scale(1) rotate(0deg)" : "scale(0.85) rotate(-15deg)",
                  opacity: input.trim() ? 1 : 0.5,
                }}
              >
                <ArrowUpRight
                  size={20}
                  strokeWidth={2.5}
                  color={input.trim() ? "#fff" : T.text.muted}
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
            <span style={{ opacity: 0.8 }}>🔒 Privacy Mode · Chats are not stored</span>
          ) : chatQuota.limit !== Infinity ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", width: 150, fontWeight: 600, color: chatQuota.remaining <= 3 ? T.status.red : T.text.secondary }}>
                <span>{chatQuota.remaining} chats left</span>
                <span style={{ opacity: 0.5, fontSize: 11 }}>
                  {chatQuota.modelId === "gpt-4.1" ? "CFO" : chatQuota.modelId === "gemini-2.5-flash" ? "Flash" : ""}
                  {chatQuota.modelId ? ` · ${chatQuota.limit} limit` : ` ${chatQuota.limit} limit`}
                </span>
              </div>
              <div style={{ width: 140, height: 4, background: T.border.subtle, borderRadius: 2, overflow: "hidden" }}>
                <div style={{ 
                  height: "100%", 
                  width: `${(chatQuota.remaining / chatQuota.limit) * 100}%`, 
                  background: chatQuota.remaining <= 3 ? T.status.red : T.accent.primary,
                  borderRadius: 2,
                  transition: "width 0.5s var(--spring-elastic), background 0.3s ease"
                }} />
              </div>
            </div>
          ) : (
            <span style={{ opacity: 0.8 }}>Encrypted local chat history auto-expires after 24 hours</span>
          )}
        </div>

        {/* Free tier: upsell when quota is running low */}
        {shouldShowGating() && chatQuota.remaining <= 3 && chatQuota.remaining > 0 && !proEnabled && (
          <div style={{ marginTop: 8 }}>
            <ProBannerTyped
              onUpgrade={() => setShowPaywall(true)}
              label="⚡ Upgrade to Pro"
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
            <LazyProPaywallTyped onClose={() => setShowPaywall(false)} />
          </Suspense>
        )}
      </div>
      </div>
    </div>
  );
});
