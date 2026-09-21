// The request -> tool -> request loop, shared by the visible conversation and
// background sheet drafts.

import { CLIENT_TOOL_NAMES } from "../../shared/tools";
import { executeToolCall, type StudyEffects } from "../tools/executeToolCall";
import { assistantPartsToApiMessages, type ApiMessage } from "./apiMessages";
import { streamAssistantTurn } from "./streamTurn";
import type { Part, ToolCallPart } from "./types";

export type TurnLoopCallbacks = {
  /** Live snapshot of all parts produced so far, for rendering. */
  onProgress?: (parts: Part[]) => void;
  /** Called after each stream completes and its tool calls have run. */
  onTurnSettled?: (parts: Part[]) => void;
};

/**
 * Runs Claude until it stops asking for tools. `apiMessages` is extended in
 * place with each turn. Returns every part produced. Throws on failure;
 * `accumulated` in the thrown error's cause is not needed because callers
 * receive progress via callbacks.
 */
export async function runTurnLoop(
  apiMessages: ApiMessage[],
  effects: StudyEffects,
  callbacks: TurnLoopCallbacks = {},
): Promise<Part[]> {
  const accumulated: Part[] = [];

  while (true) {
    const { parts: turnParts, stopReason } = await streamAssistantTurn(
      apiMessages,
      (liveParts) => callbacks.onProgress?.([...accumulated, ...liveParts]),
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

    callbacks.onTurnSettled?.(accumulated.map((p) => ({ ...p })));

    if (stopReason !== "tool_use" || clientCalls.length === 0) break;

    apiMessages.push(...assistantPartsToApiMessages(turnParts));
  }

  return accumulated;
}
