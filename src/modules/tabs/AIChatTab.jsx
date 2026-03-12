import React, { useState, useRef, useEffect, useCallback, memo, Suspense } from "react";
import { MessageCircle, Send, Trash2, Sparkles, ArrowDown, Loader2, AlertTriangle, ArrowUpRight, ChevronRight, ChevronLeft } from "lucide-react";
import { T } from "../constants.js";
import { Card, Badge, Skeleton } from "../ui.jsx";
import { Mono } from "../components.jsx";
import { streamAudit } from "../api.js";
import { getChatSystemPrompt } from "../chatPrompts.js";
import { getBackendProvider } from "../providers.js";
import { haptic } from "../haptics.js";
import { db } from "../utils.js";
import { log } from "../logger.js";
import { encryptAtRest, decryptAtRest, isEncrypted } from "../crypto.js";
import { checkChatQuota, recordChatUsage, shouldShowGating, isGatingEnforced } from "../subscription.js";
import { useNavigation } from "../contexts/NavigationContext.jsx";
import ProBanner from "./ProBanner.jsx";
const LazyProPaywall = React.lazy(() => import("./ProPaywall.jsx"));
import { loadMemory, extractMemoryTags, addFacts, getMemoryBlock } from "../memory.js";

import { useAudit } from "../contexts/AuditContext";
import { useSettings } from "../contexts/SettingsContext";
import { usePortfolio } from "../contexts/PortfolioContext";
import { useSecurity } from "../contexts/SecurityContext.jsx";

// ═══════════════════════════════════════════════════════════════
// AI CHAT TAB — Conversational Financial AI
// ═══════════════════════════════════════════════════════════════
// Premium, iOS-native chat experience connected to the user's
// full financial profile. Streams responses in real-time.
// ═══════════════════════════════════════════════════════════════

const CHAT_STORAGE_KEY = "ai-chat-history";
const CHAT_SUMMARY_KEY = "ai-chat-summary"; // Cross-session conversation memory
const MAX_MESSAGES = 50; // Rolling window — reduced for privacy
const MAX_CONTEXT_MESSAGES = 12; // How many prior messages to send to the AI
const CONTEXT_SUMMARIZE_THRESHOLD = 8; // When history exceeds this, summarize older messages
const MESSAGE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — auto-expire
const SUMMARY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — summary memory window

// ── PII Scrubber — strips sensitive patterns before persisting ──
const PII_PATTERNS = [
  /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, // Credit card numbers
  /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/g, // SSN
  /\b\d{9}\b/g, // Routing / account numbers (9 digits)
  /\b\d{10,17}\b/g, // Long account numbers
];
function scrubPII(text) {
  if (!text || typeof text !== "string") return text;
  let clean = text;
  for (const pattern of PII_PATTERNS) {
    clean = clean.replace(pattern, match => {
      // Keep last 4 digits for context, mask the rest
      if (match.length >= 8) return "•".repeat(match.length - 4) + match.slice(-4);
      return "•".repeat(match.length);
    });
  }
  return clean;
}

// ── Prune expired messages ──
function pruneExpired(msgs) {
  const cutoff = Date.now() - MESSAGE_TTL_MS;
  return msgs.filter(m => (m.ts || 0) > cutoff);
}

// Suggested quick questions — rotated randomly
const SUGGESTIONS = [
  { emoji: "💰", text: "Can I afford a $500 purchase this week?" },
  { emoji: "💳", text: "Which credit card should I pay off first?" },
  { emoji: "📊", text: "How am I trending compared to last month?" },
  { emoji: "🏦", text: "Am I on track to hit my savings goals?" },
  { emoji: "🔥", text: "What's my biggest financial risk right now?" },
  { emoji: "📉", text: "When will I be debt-free at my current pace?" },
  { emoji: "💡", text: "Give me 3 quick wins to improve my score" },
  { emoji: "🎯", text: "Am I safe until my next paycheck?" },
  { emoji: "🍔", text: "How much did I spend on dining out this month?" },
  { emoji: "📋", text: "Are there any subscriptions I should cancel?" },
  { emoji: "📈", text: "What's my current net worth?" },
  { emoji: "💸", text: "Where did my money go last week?" },
  { emoji: "🚗", text: "Can I comfortably afford a car payment right now?" },
  { emoji: "🏠", text: "How much should I be saving for a house down payment?" },
  { emoji: "✈️", text: "Am I saving enough for my upcoming vacation?" },
  { emoji: "🛍️", text: "Did I overspend on shopping recently?" },
];

// Get 4 random suggestions from the pool
function getRandomSuggestions() {
  const shuffled = [...SUGGESTIONS].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 4);
}

// ── Markdown-lite renderer for chat bubbles ──
// Handles partial streaming gracefully by avoiding broken markdown
function ChatMarkdown({ text, isStreaming: live }) {
  if (!text) return null;
  const lines = text.trim().split("\n");

  return (
    <div>
      {lines.map((line, i) => {
        // During streaming, the last line may have incomplete markdown
        // — render it raw so partial **bold** doesn't flicker
        const isLastLine = i === lines.length - 1;

        // Heading lines (##, ###) — strip markdown markers
        if (/^#{1,3}\s+/.test(line)) {
          const content = line.replace(/^#{1,3}\s+/, "");
          return (
            <div
              key={i}
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: T.text.primary,
                marginTop: i > 0 ? 10 : 0,
                marginBottom: 4,
                letterSpacing: "-0.01em",
              }}
            >
              {content}
            </div>
          );
        }

        // Bullet points
        if (/^\s*[-•*]\s+/.test(line)) {
          const content = line.replace(/^\s*[-•*]\s+/, "");
          return (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, paddingLeft: 4 }}>
              <span style={{ color: T.accent.primary, fontWeight: 700, flexShrink: 0 }}>•</span>
              <span>{live && isLastLine ? content : renderInline(content)}</span>
            </div>
          );
        }

        // Numbered lists
        if (/^\s*\d+[.)]\s+/.test(line)) {
          const num = line.match(/^\s*(\d+)/)?.[1];
          const content = line.replace(/^\s*\d+[.)]\s+/, "");
          return (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, paddingLeft: 4 }}>
              <span
                style={{
                  color: T.accent.primary,
                  fontWeight: 700,
                  flexShrink: 0,
                  fontFamily: T.font.mono,
                  fontSize: 11,
                }}
              >
                {num}.
              </span>
              <span>{live && isLastLine ? content : renderInline(content)}</span>
            </div>
          );
        }

        // Empty lines = spacing
        if (!line.trim()) return <div key={i} style={{ height: 8 }} />;

        // Regular text
        return (
          <p key={i} style={{ margin: "0 0 4px 0" }}>
            {live && isLastLine ? line : renderInline(line)}
          </p>
        );
      })}
    </div>
  );
}

function renderInline(text) {
  // Bold **text** and `code`
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, j) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return (
        <strong key={j} style={{ color: T.text.primary, fontWeight: 700 }}>
          {p.slice(2, -2)}
        </strong>
      );
    }
    if (p.startsWith("`") && p.endsWith("`")) {
      return (
        <code
          key={j}
          style={{
            fontFamily: T.font.mono,
            fontSize: 11,
            color: T.accent.primary,
            background: T.accent.primaryDim,
            padding: "2px 6px",
            borderRadius: 4,
          }}
        >
          {p.slice(1, -1)}
        </code>
      );
    }
    return <span key={j}>{p}</span>;
  });
}

// ── Strip internal <thought_process> blocks from AI output ──
function stripThoughtProcess(text) {
  if (!text) return text;
  // Remove complete <thought_process>...</thought_process> blocks (including multiline)
  let cleaned = text.replace(/<thought_process>[\s\S]*?<\/thought_process>/gi, "");
  // If an opening tag exists but is not yet closed (still streaming), hide everything from it onward
  const openIdx = cleaned.search(/<thought_process>/i);
  if (openIdx !== -1) cleaned = cleaned.slice(0, openIdx);
  return cleaned.trimStart();
}

// ── Typing indicator (accessible) ──
function TypingIndicator() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="AI is typing a response"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "12px 16px",
      }}
    >
      <span className="sr-only">AI is typing...</span>
      {[0, 1, 2].map(i => (
        <div
          key={i}
          aria-hidden="true"
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: T.accent.primary,
            animation: `pulse 1.4s ease-in-out ${i * 0.16}s infinite`,
            opacity: 0.6,
          }}
        />
      ))}
    </div>
  );
}

export default memo(function AIChatTab({ proEnabled = false, initialPrompt = null, clearInitialPrompt = null, onBack = null }) {
  const { current, history, trendContext } = useAudit();
  const { apiKey, aiProvider, aiModel, financialConfig, persona, personalRules } = useSettings();
  const { cards, renewals } = usePortfolio();
  const { privacyMode } = useSecurity();
  const { navState, clearNavState } = useNavigation();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [chatQuota, setChatQuota] = useState({ allowed: true, remaining: Infinity, limit: Infinity, used: 0 });
  const [inputFocused, setInputFocused] = useState(false);
  const [sessionSummary, setSessionSummary] = useState(null); // Prior session memory
  const [memoryData, setMemoryData] = useState(null); // Persistent AI memory
  const [showPaywall, setShowPaywall] = useState(false);

  const suggestionsScrollRef = useRef(null);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [canScrollLeft, setCanScrollLeft] = useState(false); // New state variable

  const handleSuggestionsScroll = useCallback((e) => {
    const { scrollLeft, scrollWidth, clientWidth } = e.target;
    setCanScrollLeft(scrollLeft > 10); // Update canScrollLeft
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10); // Update canScrollRight
  }, []);

  useEffect(() => {
    if (suggestionsScrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = suggestionsScrollRef.current;
      setCanScrollLeft(scrollLeft > 10); // Initialize left scroll state
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10); // Initialize right scroll state
    }
  }, []);

  // Fetch quota on load
  useEffect(() => {
    checkChatQuota().then(setChatQuota);
  }, []);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const isStreamingRef = useRef(false);
  const messagesEndRef = useRef(null);
  const initialPromptSent = useRef(false);
  const lastUserMsgRef = useRef(null); // Track last user message for safe retry

  // ── Load messages + session summary from DB ──
  useEffect(() => {
    (async () => {
      if (privacyMode) return;
      let saved = await db.get(CHAT_STORAGE_KEY);
      // Decrypt if stored encrypted
      if (isEncrypted(saved)) {
        try {
          saved = await decryptAtRest(saved, db);
        } catch {
          saved = null; // Decryption failed — start fresh
        }
      }
      if (saved?.length) {
        const fresh = pruneExpired(saved);
        setMessages(fresh);
        if (fresh.length !== saved.length) {
          // Re-encrypt pruned messages
          const encrypted = await encryptAtRest(fresh, db).catch(() => fresh);
          db.set(CHAT_STORAGE_KEY, encrypted);
        }
      }
      // Load prior session summary for cross-session memory
      const summary = await db.get(CHAT_SUMMARY_KEY);
      if (summary?.text && Date.now() - (summary.ts || 0) < SUMMARY_TTL_MS) {
        setSessionSummary(summary.text);
      } else if (summary) {
        db.del(CHAT_SUMMARY_KEY); // Expired
      }
      // Load persistent AI memory
      loadMemory()
        .then(m => setMemoryData(m))
        .catch(() => { });
    })();
  }, []);

  // ── Refresh chat quota on mount and periodically ──
  useEffect(() => {
    const refreshQuota = async () => {
      const q = await checkChatQuota();
      setChatQuota(q);
    };
    refreshQuota();
  }, [messages.length]);

  // ── Persist messages (with PII scrubbing + encryption + privacy guard) ──
  const persistMessages = useCallback(
    async msgs => {
      if (privacyMode) return;
      const trimmed = msgs.slice(-MAX_MESSAGES);
      const scrubbed = trimmed.map(m => ({
        ...m,
        content: scrubPII(m.content),
      }));
      // Encrypt at rest before storing
      const payload = await encryptAtRest(scrubbed, db).catch(() => scrubbed);
      db.set(CHAT_STORAGE_KEY, payload);

      // Save session summary for cross-session memory (compact topic extraction)
      if (trimmed.length >= CONTEXT_SUMMARIZE_THRESHOLD) {
        const topics = trimmed
          .filter(m => m.role === "user")
          .slice(-6)
          .map(m => (m.content.length > 80 ? m.content.slice(0, 77) + "..." : m.content))
          .join(" | ");
        if (topics) {
          db.set(CHAT_SUMMARY_KEY, { text: `Prior session topics: ${topics}`, ts: Date.now() });
        }
      }
    },
    [privacyMode]
  );

  // ── Auto-scroll to bottom ──
  const scrollToBottom = useCallback((smooth = true) => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "instant" });
    });
  }, []);

  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
  }, [messages.length, scrollToBottom]);

  // ── Scroll detection for "scroll down" button ──
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setShowScrollDown(scrollHeight - scrollTop - clientHeight > 120);
  }, []);

  // ── Build API messages for context (with sliding window + summarization) ──
  const buildAPIMessages = useCallback(
    msgs => {
      const allValid = msgs.filter(m => m.content && m.content.trim().length > 0);

      // Prepend cross-session memory if available and this is a fresh conversation
      let withMemory = allValid;
      if (sessionSummary && allValid.length <= 2) {
        withMemory = [
          { role: "user", content: `[Context from prior sessions] ${sessionSummary}` },
          { role: "assistant", content: "Got it — I remember our previous discussions. How can I help today?" },
          ...allValid,
        ];
      }

      let contextMsgs;
      if (withMemory.length > CONTEXT_SUMMARIZE_THRESHOLD) {
        const oldMsgs = withMemory.slice(0, -CONTEXT_SUMMARIZE_THRESHOLD);
        const recentMsgs = withMemory.slice(-CONTEXT_SUMMARIZE_THRESHOLD);

        const summaryParts = [];
        for (const m of oldMsgs) {
          const role = m.role === "user" ? "User" : "CFO";
          const content = m.content.length > 150 ? m.content.slice(0, 147) + "..." : m.content;
          summaryParts.push(`${role}: ${content}`);
        }
        const summaryText = `[Earlier conversation summary — ${oldMsgs.length} messages]\n${summaryParts.join("\n")}`;

        contextMsgs = [
          { role: "user", content: summaryText },
          {
            role: "assistant",
            content: "Understood, I have the conversation context. Continuing from where we left off.",
          },
          ...recentMsgs,
        ];
      } else {
        contextMsgs = withMemory.slice(-MAX_CONTEXT_MESSAGES);
      }

      const isGemini =
        aiProvider === "gemini" || (aiProvider === "backend" && getBackendProvider(aiModel) === "gemini");

      if (isGemini) {
        // Gemini uses { role, parts: [{ text }] } format
        // Gemini also requires alternating user/model turns — merge consecutive same-role messages
        const merged = [];
        for (const m of contextMsgs) {
          const role = m.role === "assistant" ? "model" : "user";
          const last = merged[merged.length - 1];
          if (last && last.role === role) {
            // Merge into previous turn
            last.parts[0].text += "\n" + m.content;
          } else {
            merged.push({ role, parts: [{ text: m.content }] });
          }
        }
        // Gemini requires the last message to be from "user"
        if (merged.length > 0 && merged[merged.length - 1].role === "model") {
          merged.pop();
        }
        return merged;
      }

      // OpenAI + Claude + Backend use { role, content } format
      return contextMsgs.map(m => ({ role: m.role, content: m.content }));
    },
    [aiProvider, aiModel]
  );

  // ── Send message ──
  const sendMessage = useCallback(
    async (text, overrideSystemPrompt = null) => {
      if (!text?.trim() || isStreamingRef.current) return;

      // ── Quota gate — check BEFORE adding message to state ──
      if (isGatingEnforced() && !chatQuota.allowed) {
        setError("You've reached your daily AskAI limit. Upgrade to Pro for 50 messages/day!");
        haptic.medium();
        return;
      }

      const userMsg = { role: "user", content: text.trim(), ts: Date.now() };
      // Guard: if the last message is already this user message (e.g. after a retry),
      // don't duplicate it — just resume from the existing state.
      const lastMsg = messages[messages.length - 1];
      const alreadyPresent = lastMsg?.role === "user" && lastMsg?.content === userMsg.content;
      const newMsgs = alreadyPresent ? [...messages] : [...messages, userMsg];
      lastUserMsgRef.current = text.trim(); // Track for safe retry
      setMessages(newMsgs);
      setInput("");
      setError(null);
      setIsStreaming(true);
      isStreamingRef.current = true;
      haptic.light();

      // Map the string persona to the object expected by getChatSystemPrompt
      let personaObject = null;
      if (persona === "coach") {
        personaObject = {
          name: "Coach Catalyst",
          style:
            "You are a tough-love financial coach. Be direct, no-nonsense, and strict about discipline. Don't sugarcoat bad habits. Push the user to be better.",
        };
      } else if (persona === "friend") {
        personaObject = {
          name: "Catalyst AI",
          style:
            "You are a highly supportive, empathetic financial best friend. Be warm, encouraging, and celebrate small wins. Reassure the user when they slip up.",
        };
      } else if (persona === "nerd") {
        personaObject = {
          name: "Catalyst AI",
          style:
            "You are an absolute data nerd. Focus heavily on stats, percentages, compounding math, and optimization strategies. Explain the math clearly.",
        };
      }

      // Build system prompt with full financial context + persistent memory
      const memBlock = memoryData ? getMemoryBlock(memoryData) : "";
      const sysPrompt = overrideSystemPrompt || getChatSystemPrompt(
        current,
        financialConfig,
        cards,
        renewals,
        history,
        personaObject,
        personalRules || "",
        null,
        trendContext,
        aiProvider,
        memBlock
      );

      // Build conversation history for the API
      const apiHistory = buildAPIMessages(newMsgs.slice(0, -1)); // Exclude the latest user message (sent as snapshot)

      const abort = new AbortController();
      abortRef.current = abort;

      let accumulated = "";
      const assistantMsg = { role: "assistant", content: "", ts: Date.now() };

      try {
        log.info("chat", "Chat message sent", { provider: aiProvider, model: aiModel });

        // The user's message is the "snapshot" (what the audit system calls the user input)
        // The system prompt contains the full financial context
        const stream = streamAudit(
          apiKey,
          text.trim(),
          aiProvider,
          aiModel,
          sysPrompt,
          apiHistory,
          undefined, // deviceId — handled by backend
          abort.signal,
          true // isChat — tells the backend to return natural language, not JSON
        );

        for await (const chunk of stream) {
          if (abort.signal.aborted) break;
          accumulated += chunk;
          assistantMsg.content = stripThoughtProcess(accumulated);
          assistantMsg.ts = Date.now();
          setMessages([...newMsgs, { ...assistantMsg }]);
        }

        // Finalize
        if (accumulated.trim()) {
          // Extract REMEMBER tags and strip thought_process blocks before persisting/displaying
          const { cleanText, newFacts } = extractMemoryTags(accumulated);
          const displayText = stripThoughtProcess(cleanText || accumulated);
          const finalMsgs = [...newMsgs, { ...assistantMsg, content: displayText }];
          setMessages(finalMsgs);
          persistMessages(finalMsgs);
          // Persist any new facts the AI learned
          if (newFacts.length > 0) {
            addFacts(newFacts)
              .then(m => {
                if (m) setMemoryData(m);
              })
              .catch(() => { });
          }
          // Record usage after successful response
          recordChatUsage().catch(() => { });
          const q = await checkChatQuota();
          setChatQuota(q);
        }
      } catch (err) {
        if (err.name === "AbortError") {
          // User cancelled — keep partial response
          if (accumulated.trim()) {
            const finalMsgs = [...newMsgs, { ...assistantMsg, content: accumulated + "\n\n*[Response cancelled]*" }];
            setMessages(finalMsgs);
            persistMessages(finalMsgs);
          }
        } else {
          log.error("chat", "Chat error", { error: err.message });
          setError(err.message);
          // Still keep user message visible
          setMessages(newMsgs);
          persistMessages(newMsgs);
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
      memoryData,
      apiKey,
      aiProvider,
      aiModel,
      buildAPIMessages,
      persistMessages,
      chatQuota,
    ]
  );

  // ── Cancel streaming ──
  const cancelStream = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      haptic.medium();
    }
  }, []);

  // ── Clear chat ──
  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
    db.del(CHAT_STORAGE_KEY);
    haptic.medium();
  }, []);

  // ── Handle submit ──
  const handleSubmit = e => {
    e?.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // ── Auto-send initial prompt from "Discuss with CFO" bridge ──
  useEffect(() => {
    if (initialPrompt && !initialPromptSent.current && !isStreamingRef.current) {
      initialPromptSent.current = true;
      // Small delay to ensure component is mounted and ready
      const timer = setTimeout(() => {
        sendMessage(initialPrompt);
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
      
      const negotiateSysPrompt = `You are a world-class consumer advocate and retention-desk negotiation specialist. You have a 94% success rate reducing bills.

The user wants to negotiate their $${amount}/month bill with ${merchant}.
The proven winning tactic for ${merchant} is: "${tactic}"

Generate a BATTLE-TESTED phone/chat script in markdown with these exact sections:

## 📞 Before You Call
- The exact phone number or chat URL (if widely known) for ${merchant}.
- Say "Cancel my service" at the IVR to reach the retention/loyalty desk immediately — this is non-negotiable.
- Have a competitor's current rate ready as your anchor (name the specific competitor and price).

## 🗣️ Opening Line
Give them the EXACT words to say in the first 15 seconds. This must establish: (1) how long they've been a loyal customer, (2) that they've found a cheaper alternative, (3) that they are ready to cancel today unless the price is fixed.

## 💰 The Ask
State the specific target price or discount percentage to demand. Use the competitor rate as anchor. Example: "I'd like to stay, but I need my bill at $X/month — that's what [Competitor] is offering me right now."

## 🛡️ If They Say No
Provide 3 escalation responses:
1. A firmness response ("I understand, but I'll need to proceed with cancellation then.")
2. A supervisor request ("Can you connect me to someone authorized to offer loyalty pricing?")
3. A callback play ("I'll call back tomorrow — please note my cancellation request on my account.")

## ⚡ Pro Tips
- Best times to call (Tue-Thu morning = shorter hold, better offers).
- Never accept the first offer — always counter once.
- If offered a "temporary" discount, ask for the duration in writing/confirmation number.

RULES: Be punchy, confident, and ruthlessly practical. Give EXACT words to say, not vague advice. Do NOT discuss budgeting, tracking, or financial planning — ONLY the negotiation script. Format with clear headers and bold key phrases.`;

      const timer = setTimeout(() => {
        sendMessage(userMessage, negotiateSysPrompt);
        clearNavState();
        initialPromptSent.current = false;
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [navState, sendMessage, clearNavState]);

  const [suggestions] = useState(() => getRandomSuggestions());
  const hasData = !!current?.parsed;

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
          overflowY: "auto",
          padding: "16px 14px",
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
              justifyContent: "center",
              padding: "10px",
              textAlign: "center",
              animation: "fadeIn .5s ease",
            }}
          >
            <div
              style={{
                position: "relative",
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: `linear-gradient(135deg, ${T.accent.primaryDim}, ${T.bg.card})`,
                border: `1px solid ${T.accent.primarySoft}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
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
                size={26}
                color={T.accent.primary}
                strokeWidth={1.5}
                style={{ filter: `drop-shadow(0 2px 10px ${T.accent.primaryGlow})`, position: "relative" }}
              />
            </div>
            <h3
              style={{
                fontSize: 24,
                fontWeight: 900,
                background: `linear-gradient(135deg, ${T.text.primary}, ${T.accent.primaryHover})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                marginBottom: 6,
                letterSpacing: "-0.02em",
              }}
            >
              Ask Anything
            </h3>
            <p
              style={{
                fontSize: 13,
                color: T.text.secondary,
                lineHeight: 1.5,
                fontWeight: 500,
                maxWidth: 240,
                marginBottom: 12,
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
                marginBottom: 12,
                padding: "6px 14px",
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
                🔒 End-to-end private
              </span>
            </div>

            {/* Elite Horizontally Scrolling Suggestion Chips */}
            <div style={{ position: "relative", width: "100%", margin: "0 -16px", padding: "0 16px" }}>
              <div
                className="scroll-area hide-scrollbar"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  width: "100%",
                  paddingBottom: 20,
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
                    gap: 8,
                    padding: "16px",
                    borderRadius: 16,
                    border: `1px solid ${T.border.subtle}`,
                    background: T.bg.glass,
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    color: T.text.primary,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "left",
                    lineHeight: 1.3,
                    width: "100%",
                    minHeight: 100,
                    boxShadow: T.shadow.subtle,
                    transition: "all .3s cubic-bezier(.16,1,.3,1)",
                    animation: `chatBubbleIn .5s cubic-bezier(.16,1,.3,1) ${i * 0.08}s both`,
                  }}
                >
                  <span style={{ fontSize: 18, flexShrink: 0, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}>
                    {s.emoji}
                  </span>
                  <span style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
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
              // Detect if previous or next message is from the same sender to adjust corner radiuses beautifully
              const prevIsSame = i > 0 && messages[i - 1].role === msg.role;
              const nextIsSame = i < messages.length - 1 && messages[i + 1].role === msg.role;

              // Apple-style bubble radius logic:
              // For user (right): if next is same, right-bottom corner stays sharp. if prev is same, right-top stays sharp.
              // For assistant (left): inverse logic on the left side.
              const RADIUS = 22; // Elite large radius
              const SHARP = 4;   // Small notch

              let borderRadius = "22px";
              if (isUser) {
                borderRadius = `${RADIUS}px ${prevIsSame ? SHARP : RADIUS}px ${nextIsSame ? SHARP : RADIUS}px ${RADIUS}px`;
              } else {
                borderRadius = `${prevIsSame ? SHARP : RADIUS}px ${RADIUS}px ${RADIUS}px ${nextIsSame ? SHARP : RADIUS}px`;
              }

              return (
                <div
                  key={i}
                  className="chat-bubble-in"
                  style={{
                    display: "flex",
                    justifyContent: isUser ? "flex-end" : "flex-start",
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
              <div style={{ display: "flex", justifyContent: "space-between", width: 140, fontWeight: 600, color: chatQuota.remaining <= 3 ? T.status.red : T.text.secondary }}>
                <span>{chatQuota.remaining} chats left</span>
                <span style={{ opacity: 0.5 }}>{chatQuota.limit} limit</span>
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
            <span style={{ opacity: 0.8 }}>Conversations auto-expire · We never store your chats</span>
          )}
        </div>

        {/* Pro upsell when quota is running low */}
        {shouldShowGating() && chatQuota.remaining <= 3 && chatQuota.remaining > 0 && !proEnabled && (
          <div style={{ marginTop: 8 }}>
            <ProBanner
              onUpgrade={() => setShowPaywall(true)}
              label="⚡ Upgrade to Pro"
              sublabel={`Only ${chatQuota.remaining} chats left today — Pro gives you 50/day`}
            />
          </div>
        )}

        {showPaywall && (
          <Suspense fallback={null}>
            <LazyProPaywall onClose={() => setShowPaywall(false)} />
          </Suspense>
        )}
      </div>
      </div>
    </div>
  );
});
