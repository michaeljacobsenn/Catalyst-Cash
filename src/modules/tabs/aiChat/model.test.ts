import { describe, expect, it } from "vitest";

import {
  buildChatFeedbackProfile,
  buildNegotiationPrompt,
  CHAT_FEEDBACK_REASON_OPTIONS,
  getChatFallbackModel,
  getChatFallbackModels,
  getChatModelDisplayName,
  getChatViewportDensity,
  getEffectiveChatModel,
  readChatFeedbackStore,
  recordChatFeedback,
  toggleChatFeedbackReason,
} from "./model";

describe("ai chat model", () => {
  it("normalizes the effective chat model", () => {
    expect(getEffectiveChatModel("o3")).toBe("gpt-5.1");
    expect(getEffectiveChatModel("gpt-4.1")).toBe("gpt-5-mini");
    expect(getEffectiveChatModel("gemini-2.5-flash")).toBe("gpt-5-nano");
  });

  it("maps chat models to stable display names and fallbacks", () => {
    expect(getChatModelDisplayName("gemini-2.5-flash")).toBe("Catalyst AI");
    expect(getChatModelDisplayName("o3")).toBe("Catalyst AI Boardroom");
    expect(getChatFallbackModel("gemini-2.5-flash", { proEnabled: true })).toBe("gpt-5-mini");
    expect(getChatFallbackModel("gpt-4.1", { proEnabled: true })).toBe("gpt-5-nano");
    expect(getChatFallbackModels("o3", { proEnabled: true })).toEqual(["gpt-5-mini", "gpt-5-nano"]);
    expect(getChatFallbackModel("gemini-2.5-flash", { proEnabled: false })).toBe(null);
  });

  it("sanitizes stored feedback into valid entries only", () => {
    const store = readChatFeedbackStore({
      a: { verdict: "helpful", reasons: ["wrong_math"], updatedAt: 1 },
      b: { verdict: "needs-work", reasons: ["too_long", "bogus"], updatedAt: 2 },
      c: { verdict: "unknown", reasons: ["wrong_math"] },
      d: "bad",
    });

    expect(store).toEqual({
      a: { verdict: "helpful", reasons: ["wrong_math"], updatedAt: 1 },
      b: { verdict: "needs-work", reasons: ["too_long"], updatedAt: 2 },
    });
  });

  it("records and toggles feedback reasons immutably", () => {
    const recorded = recordChatFeedback({}, "msg-1", "needs-work", ["too_generic"]);
    expect(recorded["msg-1"]?.verdict).toBe("needs-work");
    expect(recorded["msg-1"]?.reasons).toEqual(["too_generic"]);

    const toggledOn = toggleChatFeedbackReason(recorded, "msg-1", "wrong_math");
    expect(toggledOn["msg-1"]?.reasons).toEqual(["too_generic", "wrong_math"]);

    const toggledOff = toggleChatFeedbackReason(toggledOn, "msg-1", "too_generic");
    expect(toggledOff["msg-1"]?.reasons).toEqual(["wrong_math"]);
  });

  it("ignores reason toggles for non needs-work verdicts", () => {
    const helpful = recordChatFeedback({}, "msg-1", "helpful");
    expect(toggleChatFeedbackReason(helpful, "msg-1", "wrong_math")).toBe(helpful);
  });

  it("builds a feedback profile that can steer future replies", () => {
    const profile = buildChatFeedbackProfile({
      a: { verdict: "needs-work", reasons: ["too_long", "missed_context"], updatedAt: 5 },
      b: { verdict: "needs-work", reasons: ["too_long"], updatedAt: 4 },
      c: { verdict: "needs-work", reasons: ["wrong_math"], updatedAt: 3 },
      d: { verdict: "helpful", reasons: [], updatedAt: 2 },
    });

    expect(profile.totalHelpful).toBe(1);
    expect(profile.totalNeedsWork).toBe(3);
    expect(profile.dominantReasons).toEqual(["too_long", "missed_context", "wrong_math"]);
    expect(profile.responsePreferences).toEqual({
      preferConcise: true,
      preferSpecificity: false,
      prioritizeMathChecks: true,
      emphasizeLiveContext: true,
    });
    expect(profile.promptGuidance).toContain("Keep the answer tighter");
    expect(profile.promptGuidance).toContain("Double-check arithmetic");
    expect(profile.promptGuidance).toContain("Use the user's saved rules");
  });

  it("builds the negotiation prompt and viewport density consistently", () => {
    expect(buildNegotiationPrompt({ merchant: "Comcast", amount: 95 })).toContain("Comcast");
    expect(CHAT_FEEDBACK_REASON_OPTIONS).toHaveLength(4);

    expect(
      getChatViewportDensity({
        embedded: true,
        viewport: { width: 390, height: 690 },
      })
    ).toMatchObject({
      compactEmbedded: true,
      denseEmbedded: true,
      ultraDenseEmbedded: true,
      promptClamp: 0,
      suggestionColumns: 1,
      orbSize: 40,
    });

    expect(
      getChatViewportDensity({
        embedded: false,
        viewport: { width: 390, height: 690 },
      })
    ).toMatchObject({
      compactEmbedded: false,
      suggestionCardMinHeight: 88,
      promptClamp: 0,
      suggestionColumns: 1,
    });
  });
});
