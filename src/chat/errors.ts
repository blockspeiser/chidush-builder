// Turns whatever the request pipeline throws into a sentence a learner can act on.

import Anthropic from "@anthropic-ai/sdk";

export function describeError(err: unknown): string {
  // Subclass of APIError, so it must be checked first.
  if (err instanceof Anthropic.APIConnectionError) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  if (err instanceof Anthropic.APIError) {
    const serverMessage = extractServerMessage(err.error);
    if (err.status === 401) {
      return "Your sign-in has expired. Please sign out and back in.";
    }
    if (err.status === 403 && serverMessage) return serverMessage;
    if (err.status === 413) {
      return "This conversation has grown too long to send. Start a new session to continue.";
    }
    if (err.status === 429 || err.status === 529) {
      return "The assistant is busy right now. Please try again in a moment.";
    }
    if (err.status && err.status >= 500) {
      return "The assistant hit a server error. Please try again.";
    }
    return serverMessage ?? "The request failed. Please try again.";
  }
  if (err instanceof Error && /fetch|network/i.test(err.message)) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return "Something went wrong. Please try again.";
}

/** Anthropic-shaped error bodies: { type: "error", error: { message } }. */
function extractServerMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const inner = (body as { error?: unknown }).error;
  if (inner && typeof inner === "object") {
    const message = (inner as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return null;
}
