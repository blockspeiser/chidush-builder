// Request parameters the server owns. The client never chooses these.

import { NOTES_SHEET_PROMPT } from "./notesSheetPrompt";
import { SYSTEM_PROMPT } from "./systemPrompt";
import { TOOL_DEFINITIONS } from "./tools";

export const MODEL = "claude-opus-5";
// Opus 5 thinks by default and max_tokens caps thinking + text.
export const MAX_TOKENS = 32000;

// Caching strategy (prefix match, render order tools -> system -> messages):
//  - One explicit breakpoint on the last system block covers tools + system,
//    the large prefix shared by every user. 1-hour TTL: shared traffic keeps
//    it warm and the doubled write cost is paid at most once an hour.
//  - Top-level automatic caching moves a breakpoint to the end of the
//    growing conversation each request, so each turn re-reads everything
//    before it. 1-hour TTL so a learner who reads for 20 minutes between
//    replies still hits. (Longer-TTL entries must precede shorter ones, so
//    both use 1h.)
const CACHE_1H = { type: "ephemeral" as const, ttl: "1h" as const };

export const SYSTEM_BLOCKS = [
  { type: "text" as const, text: SYSTEM_PROMPT },
  { type: "text" as const, text: NOTES_SHEET_PROMPT, cache_control: CACHE_1H },
];

/** Full upstream request body for a given message history. */
export function buildMessagesRequest(messages: unknown[]) {
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_BLOCKS,
    tools: TOOL_DEFINITIONS,
    messages,
    cache_control: CACHE_1H,
    stream: true,
  };
}
