// Owns the message list and the request -> tool -> request loop with Claude.

import { useState } from "react";
import type { AppendMessage } from "@assistant-ui/react";
import { CLIENT_TOOL_NAMES } from "../../shared/tools";
import { executeToolCall, type StudyEffects } from "../tools/executeToolCall";
import { assistantPartsToApiMessages, buildApiMessages } from "./apiMessages";
import { describeError } from "./errors";
import { streamAssistantTurn } from "./streamTurn";
import { textMessage, type Msg, type Part, type ToolCallPart } from "./types";

export function useConversation(effects: StudyEffects) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  // Last failure, shown as a banner. The transcript is never altered by it.
  const [error, setError] = useState<string | null>(null);
  const [lastSent, setLastSent] = useState<Msg[] | null>(null);

  function replaceAssistantContent(assistantId: string, content: Part[]) {
    setMessages((prev) =>
      prev.map((m) => (m.id === assistantId ? { ...m, content } : m)),
    );
  }

  /**
   * Sends the visible history to Claude and appends one assistant message,
   * looping through client-side tool calls until the model ends its turn.
   */
  async function sendToClaude(visibleMessages: Msg[]) {
    setIsRunning(true);
    setError(null);
    setLastSent(visibleMessages);

    const apiMessages = buildApiMessages(visibleMessages);
    const assistantId = crypto.randomUUID();
    const accumulated: Part[] = [];

    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: [] },
    ]);

    try {
      while (true) {
        const { parts: turnParts, stopReason } = await streamAssistantTurn(
          apiMessages,
          (liveParts) =>
            replaceAssistantContent(assistantId, [...accumulated, ...liveParts]),
        );
        accumulated.push(...turnParts);

        const clientCalls = turnParts.filter(
          (p): p is ToolCallPart =>
            p.type === "tool-call" && CLIENT_TOOL_NAMES.has(p.toolName),
        );

        await Promise.all(
          clientCalls.map(async (call) => {
            const outcome = await executeToolCall(call, effects);
            if (outcome.result !== undefined) call.result = outcome.result;
            if (outcome.isError) call.isError = true;
          }),
        );

        replaceAssistantContent(
          assistantId,
          accumulated.map((p) => ({ ...p })),
        );

        if (stopReason !== "tool_use" || clientCalls.length === 0) break;

        apiMessages.push(...assistantPartsToApiMessages(turnParts));
      }
    } catch (err) {
      console.error("[stream] error", err);
      setError(describeError(err));
      // Keep whatever the turn produced so far; drop the bubble only if empty.
      if (accumulated.length === 0) {
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      } else {
        replaceAssistantContent(
          assistantId,
          accumulated.map((p) => ({ ...p })),
        );
      }
    } finally {
      console.log("[stream] finally — setIsRunning(false)");
      setIsRunning(false);
    }
  }

  async function appendUserMessage(userMessage: Msg) {
    const next = [...messages, userMessage];
    setMessages(next);
    await sendToClaude(next);
  }

  /** Sends a message on the learner's behalf (e.g. from a button). */
  async function sendUserText(text: string) {
    await appendUserMessage(textMessage("user", text));
  }

  /** assistant-ui's onNew: the learner submitted a message from the composer. */
  async function onNew(message: AppendMessage) {
    if (message.role !== "user") return;
    await appendUserMessage({
      id: crypto.randomUUID(),
      role: "user",
      content: message.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => ({ type: "text", text: c.text })),
    });
  }

  /** Re-sends the history that last failed. */
  async function retry() {
    if (isRunning || !lastSent) return;
    await sendToClaude(lastSent);
  }

  function dismissError() {
    setError(null);
  }

  return {
    messages,
    setMessages,
    isRunning,
    error,
    retry,
    dismissError,
    sendToClaude,
    sendUserText,
    onNew,
  };
}

export type Conversation = ReturnType<typeof useConversation>;
