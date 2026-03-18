import { useCallback, useEffect, useState } from "react";

import { db } from "../../utils.js";
import { decryptAtRestDetailed, encryptAtRest, isEncrypted } from "../../crypto.js";
import { addFacts, getMemoryBlock, loadMemory } from "../../memory.js";

import type { AiMemory, AtRestEncryptedPayload, ChatHistoryMessage, GeminiHistoryMessage } from "../../../types/index.js";
import {
  CHAT_STORAGE_KEY,
  CHAT_SUMMARY_KEY,
  CONTEXT_SUMMARIZE_THRESHOLD,
  MAX_CONTEXT_MESSAGES,
  MAX_MESSAGES,
  SUMMARY_TTL_MS,
  createChatMessage,
  pruneExpired,
  scrubPII,
} from "./helpers.js";

export function useAIChatPersistence({ privacyMode, aiProvider, aiModel, sessionSummary = null }) {
  const [messages, setMessages] = useState<ChatHistoryMessage[]>([]);
  const [memoryData, setMemoryData] = useState<AiMemory | null>(null);
  const [storedSessionSummary, setStoredSessionSummary] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      if (privacyMode) return;
      let saved = (await db.get(CHAT_STORAGE_KEY)) as ChatHistoryMessage[] | AtRestEncryptedPayload | null;
      if (isEncrypted(saved)) {
        try {
          const decrypted = await decryptAtRestDetailed(saved as AtRestEncryptedPayload, db);
          saved = decrypted.data as ChatHistoryMessage[] | null;
          if (decrypted.usedLegacyKey && Array.isArray(saved)) {
            const migrated = await encryptAtRest(saved, db).catch(() => saved);
            await db.set(CHAT_STORAGE_KEY, migrated);
          }
        } catch {
          saved = null;
        }
      }
      if (Array.isArray(saved) && saved.length) {
        const fresh = pruneExpired(saved);
        setMessages(fresh);
        if (fresh.length !== saved.length) {
          const encrypted = await encryptAtRest(fresh, db).catch(() => fresh);
          db.set(CHAT_STORAGE_KEY, encrypted);
        }
      }
      const summary = (await db.get(CHAT_SUMMARY_KEY)) as { text: string; ts?: number } | null;
      if (summary?.text && Date.now() - (summary.ts || 0) < SUMMARY_TTL_MS) {
        setStoredSessionSummary(summary.text);
      } else if (summary) {
        db.del(CHAT_SUMMARY_KEY);
      }
      loadMemory()
        .then((memory: AiMemory) => setMemoryData(memory))
        .catch(() => {});
    })();
  }, [privacyMode]);

  const persistMessages = useCallback(
    async (msgs: ChatHistoryMessage[]): Promise<void> => {
      if (privacyMode) return;
      const trimmed = msgs.slice(-MAX_MESSAGES);
      const scrubbed = trimmed.map(message => ({ ...message, content: scrubPII(message.content) }));
      const payload = await encryptAtRest(scrubbed, db).catch(() => scrubbed);
      db.set(CHAT_STORAGE_KEY, payload);

      if (trimmed.length >= CONTEXT_SUMMARIZE_THRESHOLD) {
        const topics = trimmed
          .filter(message => message.role === "user")
          .slice(-6)
          .map(message => (message.content.length > 80 ? message.content.slice(0, 77) + "..." : message.content))
          .join(" | ");
        if (topics) {
          db.set(CHAT_SUMMARY_KEY, { text: `Prior session topics: ${topics}`, ts: Date.now() });
        }
      }
    },
    [privacyMode]
  );

  const buildAPIMessages = useCallback(
    (msgs: ChatHistoryMessage[]): ChatHistoryMessage[] | GeminiHistoryMessage[] => {
      const allValid = msgs.filter(message => message.content && message.content.trim().length > 0);
      let withMemory = allValid;
      const effectiveSummary = sessionSummary || storedSessionSummary;
      if (effectiveSummary && allValid.length <= 2) {
        withMemory = [
          createChatMessage("user", `[Context from prior sessions] ${effectiveSummary}`),
          createChatMessage("assistant", "Got it — I remember our previous discussions. How can I help today?"),
          ...allValid,
        ];
      }

      let contextMsgs: ChatHistoryMessage[];
      if (withMemory.length > CONTEXT_SUMMARIZE_THRESHOLD) {
        const oldMsgs = withMemory.slice(0, -CONTEXT_SUMMARIZE_THRESHOLD);
        const recentMsgs = withMemory.slice(-CONTEXT_SUMMARIZE_THRESHOLD);
        const summaryParts = oldMsgs.map(message => {
          const role = message.role === "user" ? "User" : "CFO";
          const content = message.content.length > 150 ? message.content.slice(0, 147) + "..." : message.content;
          return `${role}: ${content}`;
        });
        const summaryText = `[Earlier conversation summary — ${oldMsgs.length} messages]\n${summaryParts.join("\n")}`;
        contextMsgs = [
          createChatMessage("user", summaryText),
          createChatMessage("assistant", "Understood, I have the conversation context. Continuing from where we left off."),
          ...recentMsgs,
        ];
      } else {
        contextMsgs = withMemory.slice(-MAX_CONTEXT_MESSAGES);
      }

      const isGemini = aiProvider === "gemini" || (aiProvider === "backend" && aiModel.includes("gemini"));
      if (isGemini) {
        const merged: GeminiHistoryMessage[] = [];
        for (const message of contextMsgs) {
          const role = message.role === "assistant" ? "model" : "user";
          const last = merged[merged.length - 1];
          if (last && last.role === role) {
            last.parts[0].text += "\n" + message.content;
          } else {
            merged.push({ role, parts: [{ text: message.content }] });
          }
        }
        const lastMerged = merged[merged.length - 1];
        if (lastMerged && lastMerged.role === "model") merged.pop();
        return merged;
      }

      return contextMsgs.map(message => ({ role: message.role, content: message.content }));
    },
    [aiModel, aiProvider, sessionSummary, storedSessionSummary]
  );

  const rememberFacts = useCallback(async newFacts => {
    if (!newFacts.length) return;
    const memory = await addFacts(newFacts).catch(() => null);
    if (memory) setMemoryData(memory);
  }, []);

  return {
    messages,
    setMessages,
    memoryData,
    setMemoryData,
    sessionSummary: storedSessionSummary,
    setSessionSummary: setStoredSessionSummary,
    persistMessages,
    buildAPIMessages,
    rememberFacts,
    getMemoryBlock: () => (memoryData ? getMemoryBlock(memoryData) : ""),
  };
}
