export const AI_USAGE_PROFILES = {
  audit: {
    leanPromptTokens: 2200,
    richPromptTokens: 4000,
    typicalPromptTokens: 3000,
    typicalCompletionTokens: 1800,
  },
  chat: {
    leanPromptTokens: 2100,
    richPromptTokens: 3200,
    typicalPromptTokens: 2600,
    typicalCompletionTokens: 450,
  },
};

export function getAiUsageDisplayLabel() {
  const audit = AI_USAGE_PROFILES.audit;
  const chat = AI_USAGE_PROFILES.chat;
  return `≈${Math.round(audit.typicalPromptTokens / 100) / 10}k audit · ≈${Math.round(chat.typicalPromptTokens / 100) / 10}k chat`;
}
