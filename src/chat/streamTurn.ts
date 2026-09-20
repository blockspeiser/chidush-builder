// One streamed assistant turn: sends the request and accumulates content blocks.

import { anthropic } from "../anthropic";
import { SYSTEM_PROMPT } from "../systemPrompt";
import { NOTES_SHEET_PROMPT } from "../notesSheetPrompt";
import { TOOL_DEFINITIONS } from "../tools/definitions";
import type { ApiMessage } from "./apiMessages";
import type { Part } from "./types";

const MODEL = "claude-opus-5";
// Opus 5 thinks by default and max_tokens caps thinking + text.
const MAX_TOKENS = 32000;

const SYSTEM_BLOCKS = [
  {
    type: "text" as const,
    text: SYSTEM_PROMPT,
    cache_control: { type: "ephemeral" as const },
  },
  {
    type: "text" as const,
    text: NOTES_SHEET_PROMPT,
    cache_control: { type: "ephemeral" as const },
  },
];

export type TurnResult = {
  /** Content blocks in stream order. Tool-call parts have no result yet. */
  parts: Part[];
  stopReason: string | null;
};

/**
 * Streams a single assistant turn. `onProgress` receives a snapshot of the
 * parts so far each time visible content changes, for live rendering.
 */
export async function streamAssistantTurn(
  apiMessages: ApiMessage[],
  onProgress: (parts: Part[]) => void,
): Promise<TurnResult> {
  const partsByIndex = new Map<number, Part>();
  let stopReason: string | null = null;

  const orderedParts = () =>
    [...partsByIndex.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
  const emitProgress = () =>
    onProgress(orderedParts().map((p) => ({ ...p })));

  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_BLOCKS,
    tools: TOOL_DEFINITIONS,
    messages: apiMessages as never,
  });

  console.log("[stream] starting iteration");
  for await (const event of stream) {
    console.log("[stream] event", event.type, "index" in event ? event.index : "-");
    if (event.type === "message_delta") {
      stopReason = event.delta.stop_reason ?? stopReason;
    } else if (event.type === "content_block_start") {
      const block = event.content_block as {
        type: string;
        id?: string;
        name?: string;
        input?: unknown;
      };
      if (block.type === "text") {
        partsByIndex.set(event.index, { type: "text", text: "" });
      } else if (block.type === "thinking") {
        partsByIndex.set(event.index, {
          type: "reasoning",
          text: "",
          signature: "",
        });
      } else if (block.type === "tool_use") {
        partsByIndex.set(event.index, {
          type: "tool-call",
          toolCallId: block.id ?? crypto.randomUUID(),
          toolName: block.name ?? "",
          args:
            block.input && typeof block.input === "object"
              ? (block.input as Record<string, unknown>)
              : {},
          argsText: "",
        });
      }
      emitProgress();
    } else if (event.type === "content_block_delta") {
      const part = partsByIndex.get(event.index);
      if (!part) continue;
      if (event.delta.type === "text_delta" && part.type === "text") {
        part.text += event.delta.text;
        emitProgress();
      } else if (
        event.delta.type === "thinking_delta" &&
        part.type === "reasoning"
      ) {
        part.text += event.delta.thinking;
      } else if (
        event.delta.type === "signature_delta" &&
        part.type === "reasoning"
      ) {
        part.signature += event.delta.signature;
      } else if (
        event.delta.type === "input_json_delta" &&
        part.type === "tool-call"
      ) {
        part.argsText += event.delta.partial_json;
        try {
          part.args = JSON.parse(part.argsText);
        } catch {
          // partial JSON — keep accumulating
        }
        emitProgress();
      }
    }
  }
  console.log("[stream] turn finished, stop_reason:", stopReason);

  return { parts: orderedParts(), stopReason };
}
