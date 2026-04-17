import { hasFunnelEvent, trackFunnel } from "./funnelAnalytics.js";
import { maybeRequestReviewForValue } from "./ratePrompt.js";

async function recordFirstValueMoment(eventName, reviewTrigger) {
  const alreadyRecorded = await hasFunnelEvent(eventName);
  await trackFunnel(eventName);
  if (!alreadyRecorded) {
    await maybeRequestReviewForValue(reviewTrigger);
  }
}

export async function recordFirstBankConnectionValue() {
  await recordFirstValueMoment("bank_connected", "first_bank_connection");
}

export async function recordFirstExportValue() {
  await recordFirstValueMoment("first_export", "first_export");
}
