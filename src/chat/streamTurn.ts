// One streamed assistant turn: sends the request and accumulates content blocks.

import { anthropic } from "../anthropic";
import { MAX_TOKENS, MODEL } from "../../shared/modelConfig";
import type { ApiMessage } from "./apiMessages";
import type { Part } from "./types";

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

  // The server replaces everything but `messages` with its own config;
  // model and max_tokens are sent only because the SDK requires them.
  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
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
