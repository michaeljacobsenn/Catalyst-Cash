import type { ReactNode } from "react";

import { T } from "../../constants.js";

import type { ChatHistoryMessage } from "../../../types/index.js";

export const CHAT_STORAGE_KEY = "ai-chat-history";
export const CHAT_SUMMARY_KEY = "ai-chat-summary";
export const MAX_MESSAGES = 50;
export const MAX_CONTEXT_MESSAGES = 12;
export const CONTEXT_SUMMARIZE_THRESHOLD = 8;
export const MESSAGE_TTL_MS = 24 * 60 * 60 * 1000;
export const SUMMARY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const PII_PATTERNS = [
  /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
  /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/g,
  /\b\d{9}\b/g,
  /\b\d{10,17}\b/g,
];

export function scrubPII(text: string | null | undefined): string {
  if (!text || typeof text !== "string") return "";
  let clean = text;
  for (const pattern of PII_PATTERNS) {
    clean = clean.replace(pattern, match => {
      if (match.length >= 8) return "•".repeat(match.length - 4) + match.slice(-4);
      return "•".repeat(match.length);
    });
  }
  return clean;
}

export function pruneExpired(msgs: ChatHistoryMessage[]): ChatHistoryMessage[] {
  const cutoff = Date.now() - MESSAGE_TTL_MS;
  return msgs.filter(m => (m.ts || 0) > cutoff);
}

export function createChatMessage(role: ChatHistoryMessage["role"], content: string, ts = Date.now()): ChatHistoryMessage {
  return { role, content, ts };
}

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

export function getRandomSuggestions() {
  const shuffled = [...SUGGESTIONS].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 4);
}

export function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[2]) {
      nodes.push(
        <strong key={`${match.index}-bold`} style={{ color: T.text.primary, fontWeight: 800 }}>
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      nodes.push(
        <code
          key={`${match.index}-code`}
          style={{
            padding: "1px 5px",
            borderRadius: 6,
            background: T.bg.elevated,
            border: `1px solid ${T.border.subtle}`,
            fontFamily: T.font.mono,
            fontSize: "0.92em",
          }}
        >
          {match[3]}
        </code>
      );
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function ChatMarkdown({ text, isStreaming: live }: { text: string; isStreaming: boolean }) {
  if (!text) return null;
  const lines = text.trim().split("\n");
  return (
    <div>
      {lines.map((line, i) => {
        const isLastLine = i === lines.length - 1;
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
        if (/^\s*[-•*]\s+/.test(line)) {
          const content = line.replace(/^\s*[-•*]\s+/, "");
          return (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, paddingLeft: 4 }}>
              <span style={{ color: T.accent.primary, fontWeight: 700, flexShrink: 0 }}>•</span>
              <span>{live && isLastLine ? content : renderInline(content)}</span>
            </div>
          );
        }
        if (!line.trim()) return <div key={i} style={{ height: 8 }} />;
        return (
          <div key={i} style={{ marginBottom: 4, lineHeight: 1.55 }}>
            {live && isLastLine ? line : renderInline(line)}
          </div>
        );
      })}
    </div>
  );
}

export function stripThoughtProcess(text: string): string {
  if (!text) return "";
  return text
    .replace(/<thought_process>[\s\S]*?<\/thought_process>/gi, "")
    .replace(/```thought[\s\S]*?```/gi, "")
    .trim();
}
