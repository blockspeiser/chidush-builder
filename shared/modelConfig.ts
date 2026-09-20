// Request parameters the server owns. The client never chooses these.

import { NOTES_SHEET_PROMPT } from "./notesSheetPrompt";
import { SYSTEM_PROMPT } from "./systemPrompt";
import { TOOL_DEFINITIONS } from "./tools";

export const MODEL = "claude-opus-5";
// Opus 5 thinks by default and max_tokens caps thinking + text.
export const MAX_TOKENS = 32000;

export const SYSTEM_BLOCKS = [
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

/** Full upstream request body for a given message history. */
export function buildMessagesRequest(messages: unknown[]) {
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_BLOCKS,
    tools: TOOL_DEFINITIONS,
    messages,
    stream: true,
  };
}
