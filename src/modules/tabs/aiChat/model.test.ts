import { describe, expect, it } from "vitest";

import {
  buildNegotiationPrompt,
  CHAT_FEEDBACK_REASON_OPTIONS,
  getChatViewportDensity,
  getEffectiveChatModel,
  readChatFeedbackStore,
  recordChatFeedback,
  toggleChatFeedbackReason,
} from "./model";

describe("ai chat model", () => {
  it("normalizes the effective chat model", () => {
    expect(getEffectiveChatModel("o3")).toBe("gpt-4.1");
    expect(getEffectiveChatModel("gpt-4.1")).toBe("gpt-4.1");
    expect(getEffectiveChatModel("gemini-2.5-flash")).toBe("gemini-2.5-flash");
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
      promptClamp: 2,
      orbSize: 42,
    });

    expect(
      getChatViewportDensity({
        embedded: false,
        viewport: { width: 390, height: 690 },
      })
    ).toMatchObject({
      compactEmbedded: false,
      suggestionCardMinHeight: 100,
      promptClamp: 3,
    });
  });
});
