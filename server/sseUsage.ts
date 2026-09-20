// Tees an Anthropic SSE stream, passing bytes through untouched while
// extracting token usage from message_start and message_delta events.

import type { TokenUsage } from "./usage";

type UsageBlock = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};

export function teeUsage(
  body: ReadableStream<Uint8Array>,
  onDone: (usage: TokenUsage) => void,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let pending = "";
  const usage: TokenUsage = {};
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    onDone(usage);
  };

  const absorb = (event: string) => {
    const dataLine = event
      .split("\n")
      .find((line) => line.startsWith("data:"));
    if (!dataLine) return;
    let parsed: { type?: string; message?: { usage?: UsageBlock }; usage?: UsageBlock };
    try {
      parsed = JSON.parse(dataLine.slice(5).trim());
    } catch {
      return;
    }
    if (parsed.type === "message_start" && parsed.message?.usage) {
      const u = parsed.message.usage;
      usage.inputTokens = u.input_tokens ?? 0;
      usage.cacheReadTokens = u.cache_read_input_tokens ?? 0;
      usage.cacheWriteTokens = u.cache_creation_input_tokens ?? 0;
    } else if (parsed.type === "message_delta" && parsed.usage) {
      // Cumulative for the message; the last delta wins.
      usage.outputTokens = parsed.usage.output_tokens ?? usage.outputTokens;
    } else if (parsed.type === "message_stop") {
      // Settle now rather than at stream close: the client sees this event
      // and may start its next turn before the connection fully closes.
      finish();
    }
  };

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        pending += decoder.decode(chunk, { stream: true });
        // SSE events are separated by a blank line.
        let idx: number;
        while ((idx = pending.indexOf("\n\n")) !== -1) {
          absorb(pending.slice(0, idx));
          pending = pending.slice(idx + 2);
        }
      },
      flush() {
        if (pending.trim()) absorb(pending);
        finish();
      },
      cancel() {
        // Client went away mid-stream; bill what we saw.
        finish();
      },
    }),
  );
}
