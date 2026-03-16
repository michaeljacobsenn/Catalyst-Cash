export const AI_USAGE_PROFILES = {
  audit: {
    leanPromptTokens: 12000,
    richPromptTokens: 14800,
    typicalPromptTokens: 13300,
    typicalCompletionTokens: 2200,
  },
  chat: {
    leanPromptTokens: 2200,
    richPromptTokens: 3400,
    typicalPromptTokens: 2800,
    typicalCompletionTokens: 500,
  },
};

export function getAiUsageDisplayLabel() {
  const audit = AI_USAGE_PROFILES.audit;
  const chat = AI_USAGE_PROFILES.chat;
  return `≈${Math.round(audit.typicalPromptTokens / 100) / 10}k audit · ≈${Math.round(chat.typicalPromptTokens / 100) / 10}k chat`;
}
