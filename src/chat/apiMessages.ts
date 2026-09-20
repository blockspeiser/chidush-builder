// Converts the UI's message parts into the Anthropic Messages API wire format.

import { CLIENT_TOOL_RESULTS } from "../../shared/tools";
import type { Msg, Part } from "./types";

export type ApiMessage = Record<string, unknown>;

/**
 * Splits one assistant message into alternating assistant / user(tool_result)
 * API messages. Tool results are flushed as a user turn before any text that
 * follows them, so each tool_use is immediately answered.
 */
export function assistantPartsToApiMessages(parts: Part[]): ApiMessage[] {
  const out: ApiMessage[] = [];
  let buffer: ApiMessage[] = [];
  let pendingToolResults: ApiMessage[] = [];

  const flushAssistant = () => {
    if (buffer.length > 0) {
      out.push({ role: "assistant", content: buffer });
      buffer = [];
    }
  };
  const flushToolResults = () => {
    if (pendingToolResults.length > 0) {
      out.push({ role: "user", content: pendingToolResults });
      pendingToolResults = [];
    }
  };
  const flushBoundaryIfPending = () => {
    if (pendingToolResults.length > 0) {
      flushAssistant();
      flushToolResults();
    }
  };

  for (const p of parts) {
    if (p.type === "text") {
      flushBoundaryIfPending();
      if (p.text) buffer.push({ type: "text", text: p.text });
    } else if (p.type === "reasoning") {
      // Thinking blocks must be replayed unchanged so the API can verify
      // the signature on tool-use continuations.
      flushBoundaryIfPending();
      if (p.signature) {
        buffer.push({
          type: "thinking",
          thinking: p.text,
          signature: p.signature,
        });
      }
    } else {
      buffer.push({
        type: "tool_use",
        id: p.toolCallId,
        name: p.toolName,
        input: p.args,
      });
      const resultContent =
        p.result !== undefined
          ? typeof p.result === "string"
            ? p.result
            : JSON.stringify(p.result)
          : CLIENT_TOOL_RESULTS[p.toolName] ?? "ok";
      pendingToolResults.push({
        type: "tool_result",
        tool_use_id: p.toolCallId,
        content: resultContent,
        ...(p.isError ? { is_error: true } : {}),
      });
    }
  }

  flushAssistant();
  flushToolResults();
  return out;
}

export function userPartsToText(parts: Part[]): string {
  return parts.map((p) => (p.type === "text" ? p.text : "")).join("");
}

/**
 * Builds the full request history. Every conversation opens with a synthetic
 * "Start" user turn so the model can greet the learner before they type.
 */
export function buildApiMessages(visibleMessages: Msg[]): ApiMessage[] {
  const apiMessages: ApiMessage[] = [{ role: "user", content: "Start" }];
  for (const m of visibleMessages) {
    if (m.role === "user") {
      apiMessages.push({ role: "user", content: userPartsToText(m.content) });
    } else {
      apiMessages.push(...assistantPartsToApiMessages(m.content));
    }
  }
  return apiMessages;
}
