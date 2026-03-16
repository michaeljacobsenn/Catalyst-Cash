import { getSafeErrorMessage } from "./logger.js";

function getMessage(error) {
  return getSafeErrorMessage(error);
}

function isAbort(error) {
  const message = getMessage(error).toLowerCase();
  return error?.name === "AbortError" || message.includes("abort") || message.includes("cancelled");
}

function isNetwork(error) {
  const message = getMessage(error).toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("load failed") ||
    message.includes("cors") ||
    message.includes("timed out") ||
    message.includes("unavailable right now")
  );
}

function isAuth(error) {
  const message = getMessage(error).toLowerCase();
  return (
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("wrong passphrase") ||
    message.includes("missing credentials") ||
    message.includes("missing passphrase") ||
    message.includes("secure storage is unavailable")
  );
}

function isValidation(error) {
  const message = getMessage(error).toLowerCase();
  return (
    message.includes("invalid") ||
    message.includes("malformed") ||
    message.includes("empty") ||
    message.includes("not found") ||
    message.includes("unsupported")
  );
}

export function normalizeAppError(error, options = {}) {
  const { context = "generic" } = options;
  const rawMessage = getMessage(error);

  if (isAbort(error)) {
    return {
      kind: "abort",
      recoverable: true,
      rawMessage,
      userMessage:
        context === "chat"
          ? "Ask AI was interrupted before it finished."
          : context === "audit"
            ? "The audit was interrupted before it finished."
            : "This action was interrupted before it finished.",
    };
  }

  if (isNetwork(error)) {
    const subject =
      context === "chat" ? "Ask AI" :
      context === "audit" ? "the audit service" :
      context === "sync" ? "live sync" :
      context === "restore" ? "restore services" :
      "the service";
    return {
      kind: "network",
      recoverable: true,
      rawMessage,
      userMessage: `Catalyst couldn't reach ${subject}. Your data is still here. Try again in a moment.`,
    };
  }

  if (isAuth(error)) {
    const userMessage =
      context === "security"
        ? "Secure device storage is unavailable, so this security action couldn't be completed."
        : context === "restore"
          ? "Catalyst couldn't verify that backup or shared data. Check your passphrase and try again."
          : "Catalyst couldn't verify this request. Please try again.";
    return {
      kind: "auth",
      recoverable: true,
      rawMessage,
      userMessage,
    };
  }

  if (isValidation(error)) {
    const userMessage =
      context === "restore"
        ? "That backup file couldn't be imported. Make sure it's a valid Catalyst Cash backup."
        : context === "sync"
          ? "Sync couldn't finish because the returned data was incomplete or invalid."
          : rawMessage || "The request data was invalid.";
    return {
      kind: "validation",
      recoverable: true,
      rawMessage,
      userMessage,
    };
  }

  const fallbackMessage =
    context === "chat" ? "Ask AI hit an unexpected problem." :
    context === "audit" ? "The audit hit an unexpected problem." :
    context === "sync" ? "Sync hit an unexpected problem." :
    context === "restore" ? "Restore hit an unexpected problem." :
    context === "security" ? "This security change couldn't be completed." :
    "Something went wrong.";

  return {
    kind: "unknown",
    recoverable: false,
    rawMessage,
    userMessage: fallbackMessage,
  };
}
