import { beforeEach, describe, expect, it, vi } from "vitest";

const hasFunnelEvent = vi.fn();
const trackFunnel = vi.fn();
const maybeRequestReviewForValue = vi.fn();

vi.mock("./funnelAnalytics.js", () => ({
  hasFunnelEvent,
  trackFunnel,
}));

vi.mock("./ratePrompt.js", () => ({
  maybeRequestReviewForValue,
}));

describe("valueMoments", () => {
  beforeEach(() => {
    hasFunnelEvent.mockReset();
    trackFunnel.mockReset();
    maybeRequestReviewForValue.mockReset();
  });

  it("records and reviews the first bank connection", async () => {
    hasFunnelEvent.mockResolvedValue(false);
    const { recordFirstBankConnectionValue } = await import("./valueMoments.js");

    await recordFirstBankConnectionValue();

    expect(trackFunnel).toHaveBeenCalledWith("bank_connected");
    expect(maybeRequestReviewForValue).toHaveBeenCalledWith("first_bank_connection");
  });

  it("does not re-trigger the review prompt after the first export", async () => {
    hasFunnelEvent.mockResolvedValue(true);
    const { recordFirstExportValue } = await import("./valueMoments.js");

    await recordFirstExportValue();

    expect(trackFunnel).toHaveBeenCalledWith("first_export");
    expect(maybeRequestReviewForValue).not.toHaveBeenCalled();
  });
});
