// Message shapes shared between the Claude stream, the UI runtime, and saved sessions.

export type TextPart = { type: "text"; text: string };

export type ToolCallPart = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  argsText: string;
  result?: unknown;
  isError?: boolean;
};

/**
 * A thinking block. `text` is empty under the default display setting; the
 * `signature` is what must be replayed to the API on tool-use continuations.
 */
export type ReasoningPart = { type: "reasoning"; text: string; signature: string };

export type Part = TextPart | ToolCallPart | ReasoningPart;

export type Msg = {
  id: string;
  role: "user" | "assistant";
  content: Part[];
};

export function textMessage(role: Msg["role"], text: string): Msg {
  return { id: crypto.randomUUID(), role, content: [{ type: "text", text }] };
}
