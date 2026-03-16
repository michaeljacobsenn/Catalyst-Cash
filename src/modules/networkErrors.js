import { normalizeAppError } from "./appErrors.js";

function getErrorMessage(error) {
  if (error instanceof Error) return error.message || "Unknown error";
  return typeof error === "string" ? error : "Unknown error";
}

export function isLikelyNetworkError(error) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("load failed") ||
    message.includes("err_failed") ||
    message.includes("cors") ||
    message.includes("fetch")
  );
}

export function isLikelyAbortError(error) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("abort");
}

export function toUserFacingRequestError(error, options = {}) {
  const {
    context = "request",
    isLocalDev = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname),
  } = options;
  const normalized = normalizeAppError(error, { context });
  const rawMessage = normalized.rawMessage || getErrorMessage(error);

  if (isLikelyNetworkError(error)) {
    const subject = context === "chat" ? "Ask AI" : "the audit service";
    const baseMessage = `Catalyst couldn't reach ${subject}. Your inputs are still here. Check your connection and try again.`;
    if (isLocalDev) {
      return {
        rawMessage,
        userMessage: `${baseMessage} If you're testing on localhost, verify the worker allows your dev origin.`,
        kind: "network",
      };
    }
    return {
      rawMessage,
      userMessage: baseMessage,
      kind: "network",
    };
  }

  return {
    rawMessage,
    userMessage: normalized.userMessage || rawMessage || "Unknown error",
    kind: normalized.kind || "unknown",
  };
}
