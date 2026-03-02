import { useState, useRef, useEffect, useCallback, memo } from "react";
import { MessageCircle, Send, Trash2, Sparkles, ArrowDown, Loader2, AlertTriangle } from "lucide-react";
import { T } from "../constants.js";
import { Card, Badge } from "../ui.jsx";
import { Mono } from "../components.jsx";
import { streamAudit } from "../api.js";
import { getChatSystemPrompt } from "../chatPrompts.js";
import { getBackendProvider } from "../providers.js";
import { haptic } from "../haptics.js";
import { db } from "../utils.js";
import { log } from "../logger.js";
import { checkChatQuota, recordChatUsage, shouldShowGating, isGatingEnforced } from "../subscription.js";

import { useAudit } from "../contexts/AuditContext.jsx";
import { useSettings } from "../contexts/SettingsContext.jsx";
import { usePortfolio } from "../contexts/PortfolioContext.jsx";
import { useSecurity } from "../contexts/SecurityContext.jsx";

// ═══════════════════════════════════════════════════════════════
// AI CHAT TAB — Conversational Financial AI
// ═══════════════════════════════════════════════════════════════
// Premium, iOS-native chat experience connected to the user's
// full financial profile. Streams responses in real-time.
// ═══════════════════════════════════════════════════════════════

const CHAT_STORAGE_KEY = "ai-chat-history";
const MAX_MESSAGES = 50; // Rolling window — reduced for privacy
const MAX_CONTEXT_MESSAGES = 12; // How many prior messages to send to the AI
const MESSAGE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — auto-expire

// ── PII Scrubber — strips sensitive patterns before persisting ──
const PII_PATTERNS = [
    /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,    // Credit card numbers
    /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/g,                // SSN
    /\b\d{9}\b/g,                                      // Routing / account numbers (9 digits)
    /\b\d{10,17}\b/g,                                  // Long account numbers
];
function scrubPII(text) {
    if (!text || typeof text !== "string") return text;
    let clean = text;
    for (const pattern of PII_PATTERNS) {
        clean = clean.replace(pattern, (match) => {
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

// Suggested quick questions — rotated weekly
const SUGGESTIONS = [
    { emoji: "💰", text: "Can I afford a $500 purchase this week?" },
    { emoji: "💳", text: "Which credit card should I pay off first?" },
    { emoji: "📊", text: "How am I trending compared to last month?" },
    { emoji: "🏦", text: "Am I on track to hit my savings goals?" },
    { emoji: "🔥", text: "What's my biggest financial risk right now?" },
    { emoji: "📉", text: "When will I be debt-free at my current pace?" },
    { emoji: "💡", text: "Give me 3 quick wins to improve my score" },
    { emoji: "🎯", text: "Am I safe until my next paycheck?" },
];

// Get 4 suggestions deterministically based on week
function getWeeklySuggestions() {
    const now = new Date();
    const weekSeed = Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000));
    const shuffled = [...SUGGESTIONS].sort((a, b) => {
        const ha = ((weekSeed * 2654435761) ^ a.text.length) >>> 0;
        const hb = ((weekSeed * 2654435761) ^ b.text.length) >>> 0;
        return ha - hb;
    });
    return shuffled.slice(0, 4);
}

// ── Markdown-lite renderer for chat bubbles ──
// Handles partial streaming gracefully by avoiding broken markdown
function ChatMarkdown({ text, isStreaming: live }) {
    if (!text) return null;
    const lines = text.split("\n");

    return <div>{lines.map((line, i) => {
        // During streaming, the last line may have incomplete markdown
        // — render it raw so partial **bold** doesn't flicker
        const isLastLine = i === lines.length - 1;

        // Heading lines (##, ###) — strip markdown markers
        if (/^#{1,3}\s+/.test(line)) {
            const content = line.replace(/^#{1,3}\s+/, "");
            return <div key={i} style={{ fontSize: 14, fontWeight: 800, color: T.text.primary, marginTop: i > 0 ? 10 : 0, marginBottom: 4, letterSpacing: "-0.01em" }}>{content}</div>;
        }

        // Bullet points
        if (/^\s*[-•*]\s+/.test(line)) {
            const content = line.replace(/^\s*[-•*]\s+/, "");
            return <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, paddingLeft: 4 }}>
                <span style={{ color: T.accent.primary, fontWeight: 700, flexShrink: 0 }}>•</span>
                <span>{(live && isLastLine) ? content : renderInline(content)}</span>
            </div>;
        }

        // Numbered lists
        if (/^\s*\d+[.)]\s+/.test(line)) {
            const num = line.match(/^\s*(\d+)/)?.[1];
            const content = line.replace(/^\s*\d+[.)]\s+/, "");
            return <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, paddingLeft: 4 }}>
                <span style={{ color: T.accent.primary, fontWeight: 700, flexShrink: 0, fontFamily: T.font.mono, fontSize: 11 }}>{num}.</span>
                <span>{(live && isLastLine) ? content : renderInline(content)}</span>
            </div>;
        }

        // Empty lines = spacing
        if (!line.trim()) return <div key={i} style={{ height: 8 }} />;

        // Regular text
        return <p key={i} style={{ margin: "0 0 4px 0" }}>{(live && isLastLine) ? line : renderInline(line)}</p>;
    })}</div>;
}

function renderInline(text) {
    // Bold **text** and `code`
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((p, j) => {
        if (p.startsWith("**") && p.endsWith("**")) {
            return <strong key={j} style={{ color: T.text.primary, fontWeight: 700 }}>{p.slice(2, -2)}</strong>;
        }
        if (p.startsWith("`") && p.endsWith("`")) {
            return <code key={j} style={{
                fontFamily: T.font.mono, fontSize: 11, color: T.accent.primary,
                background: T.accent.primaryDim, padding: "2px 6px", borderRadius: 4
            }}>{p.slice(1, -1)}</code>;
        }
        return <span key={j}>{p}</span>;
    });
}

// ── Typing indicator ──
function TypingIndicator() {
    return <div style={{
        display: "flex", alignItems: "center", gap: 4, padding: "12px 16px",
    }}>
        {[0, 1, 2].map(i => (
            <div key={i} style={{
                width: 7, height: 7, borderRadius: "50%",
                background: T.accent.primary,
                animation: `pulse 1.4s ease-in-out ${i * 0.16}s infinite`,
                opacity: 0.6
            }} />
        ))}
    </div>;
}

export default memo(function AIChatTab({ proEnabled = false }) {
    const { current, history } = useAudit();
    const { apiKey, aiProvider, aiModel, financialConfig, persona } = useSettings();
    const { cards, renewals } = usePortfolio();
    const { privacyMode } = useSecurity();

    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState(null);
    const [showScrollDown, setShowScrollDown] = useState(false);
    const [chatQuota, setChatQuota] = useState({ allowed: true, remaining: Infinity, limit: Infinity, used: 0 });

    const scrollRef = useRef(null);
    const inputRef = useRef(null);
    const abortRef = useRef(null);
    const isStreamingRef = useRef(false);
    const messagesEndRef = useRef(null);

    // ── Load messages from DB (prune expired on load) ──
    useEffect(() => {
        (async () => {
            if (privacyMode) return; // Don't load persisted data in privacy mode
            const saved = await db.get(CHAT_STORAGE_KEY);
            if (saved?.length) {
                const fresh = pruneExpired(saved);
                setMessages(fresh);
                // Re-persist pruned list if any expired
                if (fresh.length !== saved.length) {
                    db.set(CHAT_STORAGE_KEY, fresh);
                }
            }
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

    // ── Persist messages (with PII scrubbing + privacy guard) ──
    const persistMessages = useCallback((msgs) => {
        if (privacyMode) return; // Never persist in privacy mode
        const trimmed = msgs.slice(-MAX_MESSAGES);
        // Scrub PII from stored copies (in-memory is untouched for UX)
        const scrubbed = trimmed.map(m => ({
            ...m,
            content: scrubPII(m.content)
        }));
        db.set(CHAT_STORAGE_KEY, scrubbed);
    }, [privacyMode]);

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

    // ── Build API messages for context ──
    const buildAPIMessages = useCallback((msgs) => {
        // Take last N messages for context window, filtering out any with empty content
        // (Gemini rejects parts with empty text — "required oneof field 'data' must have one initialized field")
        const contextMsgs = msgs
            .slice(-MAX_CONTEXT_MESSAGES)
            .filter(m => m.content && m.content.trim().length > 0);

        const isGemini = aiProvider === "gemini" || (aiProvider === "backend" && getBackendProvider(aiModel) === "gemini");

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
    }, [aiProvider, aiModel]);

    // ── Send message ──
    const sendMessage = useCallback(async (text) => {
        if (!text?.trim() || isStreamingRef.current) return;

        const userMsg = { role: "user", content: text.trim(), ts: Date.now() };
        // Guard: if the last message is already this user message (e.g. after a retry),
        // don't duplicate it — just resume from the existing state.
        const lastMsg = messages[messages.length - 1];
        const alreadyPresent = lastMsg?.role === "user" && lastMsg?.content === userMsg.content;
        const newMsgs = alreadyPresent ? [...messages] : [...messages, userMsg];
        setMessages(newMsgs);
        setInput("");
        setError(null);
        setIsStreaming(true);
        isStreamingRef.current = true;
        haptic.light();

        // ── Quota gate ──
        if (isGatingEnforced() && !chatQuota.allowed) {
            setError("You've reached your daily AskAI limit. Upgrade to Pro for 100 messages/day.");
            return;
        }

        // Map the string persona to the object expected by getChatSystemPrompt
        let personaObject = null;
        if (persona === "coach") {
            personaObject = { name: "Coach Catalyst", style: "You are a tough-love financial coach. Be direct, no-nonsense, and strict about discipline. Don't sugarcoat bad habits. Push the user to be better." };
        } else if (persona === "friend") {
            personaObject = { name: "Catalyst AI", style: "You are a highly supportive, empathetic financial best friend. Be warm, encouraging, and celebrate small wins. Reassure the user when they slip up." };
        } else if (persona === "nerd") {
            personaObject = { name: "Catalyst AI", style: "You are an absolute data nerd. Focus heavily on stats, percentages, compounding math, and optimization strategies. Explain the math clearly." };
        }

        // Build system prompt with full financial context
        const sysPrompt = getChatSystemPrompt(
            current, financialConfig, cards, renewals, history, personaObject
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
                assistantMsg.content = accumulated;
                assistantMsg.ts = Date.now();
                setMessages([...newMsgs, { ...assistantMsg }]);
            }

            // Finalize
            if (accumulated.trim()) {
                const finalMsgs = [...newMsgs, { ...assistantMsg, content: accumulated }];
                setMessages(finalMsgs);
                persistMessages(finalMsgs);
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
    }, [messages, current, financialConfig, cards, renewals, history, persona, apiKey, aiProvider, aiModel, buildAPIMessages, persistMessages, chatQuota]);

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
    const handleSubmit = (e) => {
        e?.preventDefault();
        sendMessage(input);
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const suggestions = getWeeklySuggestions();
    const hasData = !!current?.parsed;

    return <div style={{
        display: "flex", flexDirection: "column", height: "100%",
        width: "100%", boxSizing: "border-box",
        position: "relative"
    }}>
        <style>{`
            @keyframes chatBubbleIn { from { opacity: 0; transform: translateY(8px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
            .chat-bubble-in { animation: chatBubbleIn .3s cubic-bezier(.16,1,.3,1) both; }
        `}</style>

        {/* ── HEADER ── */}
        <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 16px 10px",
            borderBottom: `1px solid ${T.border.subtle}`, flexShrink: 0,
            background: T.bg.glass, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
            position: "relative"
        }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                    width: 38, height: 38, borderRadius: 13,
                    background: `linear-gradient(135deg, ${T.accent.primaryDim}, ${T.accent.primary}20)`,
                    border: `1px solid ${T.accent.primarySoft}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: `0 0 20px ${T.accent.primary}30`,
                    position: "relative"
                }}>
                    <Sparkles size={18} color={T.accent.primary} strokeWidth={2} />
                </div>
                <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>
                        {persona === "coach" ? "Coach Catalyst" : "Catalyst AI"}
                    </div>
                    <Mono size={9} color={T.text.dim}>
                        {hasData ? `Latest audit: ${current.date}` : "No audit data yet"}
                    </Mono>
                </div>
            </div>
            {messages.length > 0 && (
                <button onClick={clearChat} aria-label="Clear chat" style={{
                    width: 34, height: 34, borderRadius: 11,
                    border: `1px solid ${T.border.subtle}`, background: T.bg.glass,
                    backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", color: T.text.muted, transition: "all .2s"
                }}>
                    <Trash2 size={14} strokeWidth={2} />
                </button>
            )}
        </div>

        {/* ── MESSAGES AREA ── */}
        <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="scroll-area"
            style={{
                flex: 1, overflowY: "auto", padding: "12px 14px",
                display: "flex", flexDirection: "column", gap: 6,
                justifyContent: "flex-end"
            }}
        >
            {messages.length === 0 ? (
                /* ── EMPTY STATE ── */
                <div style={{
                    flex: 1, display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center",
                    padding: "10px", textAlign: "center",
                    animation: "fadeIn .5s ease"
                }}>
                    <div style={{
                        position: "relative",
                        width: 54, height: 54, borderRadius: 18,
                        background: `linear-gradient(135deg, ${T.accent.primaryDim}, ${T.bg.card})`,
                        border: `1px solid ${T.accent.primarySoft}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        marginBottom: 12
                    }}>
                        {/* Ambient glow behind icon */}
                        <div style={{ position: "absolute", inset: -10, background: T.accent.primary, filter: "blur(24px)", opacity: 0.15, borderRadius: "50%", pointerEvents: "none" }} />
                        <MessageCircle size={24} color={T.accent.primary} strokeWidth={1.5}
                            style={{ filter: `drop-shadow(0 2px 8px ${T.accent.primaryGlow})`, position: "relative" }} />
                    </div>
                    <h3 style={{
                        fontSize: 18, fontWeight: 800, color: T.text.primary,
                        marginBottom: 4, letterSpacing: "-0.01em"
                    }}>
                        Ask Anything
                    </h3>
                    <p style={{
                        fontSize: 12, color: T.text.dim, lineHeight: 1.4,
                        maxWidth: 240, marginBottom: 12
                    }}>
                        {hasData
                            ? "Your financial data is loaded. Ask me anything about your money."
                            : "Run your first audit to unlock personalized insights."}
                    </p>
                    <div style={{
                        display: "flex", alignItems: "center", gap: 6, marginBottom: 20,
                        padding: "6px 14px", borderRadius: 99, background: `${T.status.green}10`,
                        border: `1px solid ${T.status.green}20`,
                        boxShadow: `0 2px 10px ${T.status.green}08`
                    }}>
                        <span style={{ fontSize: 9, color: T.status.green, fontWeight: 800, fontFamily: T.font.mono, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                            🔒 End-to-end private
                        </span>
                    </div>

                    {/* Suggestions */}
                    <div style={{
                        display: "flex", flexDirection: "column",
                        gap: 6, width: "100%", maxWidth: 300
                    }}>
                        {suggestions.map((s, i) => (
                            <button
                                key={i}
                                onClick={() => sendMessage(s.text)}
                                disabled={isStreaming}
                                style={{
                                    display: "flex", alignItems: "flex-start", gap: 8,
                                    padding: "10px 12px", borderRadius: T.radius.md,
                                    border: `1px solid ${T.border.subtle}`,
                                    background: T.bg.glass, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
                                    color: T.text.secondary,
                                    fontSize: 11, fontWeight: 600, cursor: "pointer",
                                    textAlign: "left", lineHeight: 1.4,
                                    transition: "all .25s cubic-bezier(.16,1,.3,1)",
                                    animation: `chatBubbleIn .4s cubic-bezier(.16,1,.3,1) ${i * 0.06}s both`
                                }}
                            >
                                <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{s.emoji}</span>
                                <span>{s.text}</span>
                            </button>
                        ))}
                    </div>
                    <p style={{ fontSize: 9, color: T.text.muted, marginTop: 10, maxWidth: 280, lineHeight: 1.5 }}>
                        AI-generated insights are for informational purposes only — not professional financial advice.
                    </p>
                </div>
            ) : (
                /* ── MESSAGE BUBBLES ── */
                <>
                    {messages.map((msg, i) => {
                        const isUser = msg.role === "user";
                        const isLatestAssistant = !isUser && i === messages.length - 1 && isStreaming;

                        return <div key={i} className="chat-bubble-in" style={{
                            display: "flex",
                            justifyContent: isUser ? "flex-end" : "flex-start",
                            animationDelay: `${Math.min(i * 0.03, 0.3)}s`,
                            marginBottom: 2
                        }}>
                            <div style={{
                                maxWidth: isUser ? "82%" : "90%",
                                padding: isUser ? "10px 14px" : "12px 16px",
                                borderRadius: isUser
                                    ? `${T.radius.lg}px ${T.radius.lg}px ${T.radius.sm}px ${T.radius.lg}px`
                                    : `${T.radius.lg}px ${T.radius.lg}px ${T.radius.lg}px ${T.radius.sm}px`,
                                background: isUser
                                    ? T.accent.gradient
                                    : T.bg.elevated,
                                border: isUser
                                    ? "none"
                                    : `1px solid ${T.border.subtle}`,
                                color: isUser ? "#fff" : T.text.primary,
                                fontSize: 13, lineHeight: 1.6,
                                boxShadow: isUser
                                    ? `0 4px 16px rgba(123,94,167,0.3)`
                                    : T.shadow.card,
                                position: "relative",
                                wordBreak: "break-word"
                            }}>
                                {isUser ? (
                                    <p style={{ margin: 0, fontWeight: 500 }}>{msg.content}</p>
                                ) : (
                                    <ChatMarkdown text={msg.content} isStreaming={isLatestAssistant} />
                                )}
                                {isLatestAssistant && <TypingIndicator />}
                            </div>
                        </div>;
                    })}

                    {/* Error display */}
                    {error && !isStreaming && (
                        <div className="chat-bubble-in" style={{
                            display: "flex", justifyContent: "flex-start", marginTop: 4
                        }}>
                            <div style={{
                                maxWidth: "90%", padding: "10px 14px",
                                borderRadius: T.radius.lg,
                                background: T.status.redDim,
                                border: `1px solid ${T.status.red}25`,
                                fontSize: 12, color: T.status.red
                            }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                                    <AlertTriangle size={13} strokeWidth={2.5} />
                                    <strong>Error</strong>
                                </div>
                                <p style={{ margin: 0, color: T.text.secondary, lineHeight: 1.5 }}>{error}</p>
                                <button onClick={() => { setError(null); sendMessage(messages[messages.length - 1]?.content); }}
                                    style={{
                                        marginTop: 8, padding: "6px 14px", borderRadius: T.radius.sm,
                                        border: `1px solid ${T.status.red}40`, background: "transparent",
                                        color: T.status.red, fontSize: 11, fontWeight: 700, cursor: "pointer"
                                    }}>
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
            <button onClick={() => scrollToBottom()} style={{
                position: "absolute", bottom: 80, right: 16, zIndex: 10,
                width: 36, height: 36, borderRadius: 18,
                background: T.bg.glass, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
                border: `1px solid ${T.border.default}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", boxShadow: T.shadow.elevated,
                animation: "chatBubbleIn .2s ease both",
                color: T.text.primary
            }}>
                <ArrowDown size={16} strokeWidth={2.5} />
            </button>
        )}

        {/* ── INPUT BAR ── */}
        <div style={{
            padding: "8px 12px",
            paddingBottom: "calc(8px + env(safe-area-inset-bottom, 0px))",
            borderTop: `1px solid ${T.border.subtle}`,
            background: T.bg.glass, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
            flexShrink: 0
        }}>
            <form onSubmit={handleSubmit} style={{
                display: "flex", alignItems: "flex-end", gap: 8,
            }}>
                <div style={{
                    flex: 1, position: "relative",
                    background: T.bg.elevated, borderRadius: T.radius.lg,
                    border: `1.5px solid ${T.border.focus}`,
                    transition: "border-color .3s ease, box-shadow .3s ease",
                    boxShadow: `0 0 0 1px ${T.accent.primary}10`
                }}>
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => {
                            setInput(e.target.value);
                            // Auto-resize
                            e.target.style.height = "auto";
                            e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder={isStreaming ? "Waiting for response..." : "Ask about your finances..."}
                        disabled={isStreaming}
                        rows={1}
                        style={{
                            width: "100%", padding: "12px 14px",
                            background: "transparent", border: "none", outline: "none",
                            color: T.text.primary, fontSize: 14, lineHeight: 1.4,
                            fontFamily: T.font.sans, resize: "none",
                            maxHeight: 120, minHeight: 20,
                            WebkitUserSelect: "text", userSelect: "text"
                        }}
                    />
                </div>

                {isStreaming ? (
                    <button type="button" onClick={cancelStream} style={{
                        width: 44, height: 44, borderRadius: 14, flexShrink: 0,
                        border: `1px solid ${T.status.red}40`,
                        background: T.status.redDim,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer", transition: "all .2s"
                    }}>
                        <div style={{
                            width: 14, height: 14, borderRadius: 3,
                            background: T.status.red
                        }} />
                    </button>
                ) : (
                    <button type="submit" disabled={!input.trim()} style={{
                        width: 44, height: 44, borderRadius: 14, flexShrink: 0,
                        border: "none",
                        background: input.trim()
                            ? T.accent.gradient
                            : T.bg.elevated,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: input.trim() ? "pointer" : "default",
                        boxShadow: input.trim() ? `0 4px 16px rgba(123,94,167,0.35)` : "none",
                        transition: "all .3s cubic-bezier(.16,1,.3,1)",
                        transform: input.trim() ? "scale(1)" : "scale(0.95)",
                        opacity: input.trim() ? 1 : 0.5
                    }}>
                        <Send size={18} strokeWidth={2.5} color={input.trim() ? "#fff" : T.text.muted}
                            style={{ marginLeft: 1 }} />
                    </button>
                )}
            </form>

            {/* Privacy & Provider info */}
            <div style={{
                textAlign: "center", marginTop: 6, fontSize: 9,
                color: T.text.dim, fontFamily: T.font.mono, opacity: 0.8
            }}>
                {privacyMode
                    ? "🔒 Privacy Mode · Chats are not stored"
                    : chatQuota.limit !== Infinity && shouldShowGating()
                        ? `${chatQuota.remaining} message${chatQuota.remaining !== 1 ? "s" : ""} remaining today`
                        : "Conversations auto-expire · We never see or store your chats"}
            </div>
        </div>
    </div>;
});
