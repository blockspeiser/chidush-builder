// Owns the message list, the visible conversation loop, and background sheet
// drafts (which reuse the conversation as context but never appear in it).

import { useState } from "react";
import type { AppendMessage } from "@assistant-ui/react";
import type { StudyEffects } from "../tools/executeToolCall";
import { buildApiMessages } from "./apiMessages";
import { describeError } from "./errors";
import { runTurnLoop } from "./runTurnLoop";
import { textMessage, type Msg, type Part } from "./types";

export type DraftKind = "narrative" | "poem";

const DRAFT_PROMPTS: Record<DraftKind, string> = {
  narrative:
    "Please draft (or rewrite) the narrative sheet now based on our conversation so far — call update_narrative_sheet with whatever is reasonable given what we have. Don't ask for confirmation and don't reply in prose; just call the tool.",
  poem: "Please draft (or rewrite) the poem sheet now based on our conversation and the narrative so far — call update_poem_sheet with whatever is reasonable given what we have. Don't ask for confirmation and don't reply in prose; just call the tool.",
};

export function useConversation(effects: StudyEffects) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  // Which sheet a background draft is producing, if any.
  const [drafting, setDrafting] = useState<DraftKind | null>(null);
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

    const assistantId = crypto.randomUUID();
    let produced: Part[] = [];

    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: [] },
    ]);

    try {
      await runTurnLoop(buildApiMessages(visibleMessages), effects, {
        onProgress: (parts) => {
          produced = parts;
          replaceAssistantContent(assistantId, parts);
        },
        onTurnSettled: (parts) => {
          produced = parts;
          replaceAssistantContent(assistantId, parts);
        },
      });
    } catch (err) {
      console.error("[stream] error", err);
      setError(describeError(err));
      // Keep whatever the turn produced so far; drop the bubble only if empty.
      if (produced.length === 0) {
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      }
    } finally {
      setIsRunning(false);
    }
  }

  /**
   * Asks Claude to draft or rewrite a sheet using the conversation as
   * context. Runs outside the transcript: the instruction and the model's
   * reply are never shown; only the resulting sheet update lands.
   */
  async function draftSheet(kind: DraftKind) {
    if (drafting) return;
    setDrafting(kind);
    setError(null);
    try {
      const apiMessages = buildApiMessages(messages);
      apiMessages.push({ role: "user", content: DRAFT_PROMPTS[kind] });
      await runTurnLoop(apiMessages, effects);
    } catch (err) {
      console.error("[draft] error", err);
      setError(describeError(err));
    } finally {
      setDrafting(null);
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
    drafting,
    draftSheet,
    error,
    retry,
    dismissError,
    sendToClaude,
    sendUserText,
    onNew,
  };
}

export type Conversation = ReturnType<typeof useConversation>;
